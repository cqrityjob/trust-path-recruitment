// Voluntary self-declarations: the pure rules, without a database.
//
// Run: bun test scripts/self-declarations.test.tsx
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  DECLARATION_KINDS,
  STATEMENT_VERSIONS,
  buildSelfDeclarationsView,
  displayedProvenance,
  fileProblem,
  safeDocumentName,
  selfDeclarationErrorCode,
  selfDeclarationsPayloadSchema,
  DOCUMENT_MAX_BYTES,
} from "../src/lib/self-declarations/model";
import {
  endAccessAndErase,
  filesOwed,
  uploadDeclarationDocument,
} from "../src/lib/self-declarations/workflow";
import {
  CLOSED_PAYLOAD,
  CRIMINAL_AUTHORIZED_PAYLOAD,
  OPEN_PAYLOAD,
  syntheticDeclaration,
  syntheticDocument,
  withDeclarations,
} from "../src/lib/self-declarations/fixtures/self-declaration-fixtures";
import { STATEMENTS } from "../src/lib/self-declarations/copy";

const panelOf = (payload: Parameters<typeof buildSelfDeclarationsView>[0], kind: string) =>
  buildSelfDeclarationsView(payload).panels.find((p) => p.kind === kind)!;

describe("the processing gate, as the screen sees it", () => {
  test("with no authorization every kind is closed and nothing is declared", () => {
    const view = buildSelfDeclarationsView(CLOSED_PAYLOAD);
    assert.deepEqual(
      view.panels.map((p) => [p.kind, p.state]),
      DECLARATION_KINDS.map((k) => [k, "closed"]),
    );
    assert.equal(view.cleanupOwed, false);
  });

  test("an authorized financial kind opens; the others stay as they are", () => {
    assert.equal(panelOf(OPEN_PAYLOAD, "enforcement_debt_none").state, "open");
    assert.equal(panelOf(OPEN_PAYLOAD, "payment_remarks_none").state, "open");
    assert.equal(panelOf(OPEN_PAYLOAD, "criminal_history").state, "closed");
  });

  test("criminal history stays closed even when the database returns an authorization for it", () => {
    const panel = panelOf(CRIMINAL_AUTHORIZED_PAYLOAD, "criminal_history");
    assert.equal(panel.state, "closed");
    assert.equal(panel.authorization, null);
    assert.equal(STATEMENT_VERSIONS.criminal_history, undefined);
    assert.equal(
      Object.keys(STATEMENTS).some((v) => /crim/i.test(v)),
      false,
    );
  });

  test("an authorization naming wording this application does not hold does not open the kind", () => {
    const payload = {
      ...OPEN_PAYLOAD,
      authorizations: OPEN_PAYLOAD.authorizations.map((a) => ({
        ...a,
        statementVersion: "se-something-else-v9",
      })),
    };
    assert.equal(panelOf(payload, "enforcement_debt_none").state, "closed");
  });

  test("another jurisdiction's authorization does not open the Swedish panel", () => {
    const payload = {
      ...OPEN_PAYLOAD,
      authorizations: OPEN_PAYLOAD.authorizations.map((a) => ({ ...a, jurisdiction: "GB" })),
    };
    assert.equal(panelOf(payload, "payment_remarks_none").state, "closed");
  });

  test("every statement version the application holds has its wording, and nothing else does", () => {
    assert.deepEqual(Object.keys(STATEMENTS).sort(), Object.values(STATEMENT_VERSIONS).sort());
  });
});

describe("provenance is never higher than the payload supports", () => {
  test("a statement with no document is self-declared whatever the level field says", () => {
    const d = syntheticDeclaration({ provenance: "document_reviewed" });
    assert.equal(displayedProvenance(d), "self_declared");
  });

  test("a document at the current revision is document-provided", () => {
    const d = syntheticDeclaration({
      provenance: "document_provided",
      document: syntheticDocument(),
    });
    assert.equal(displayedProvenance(d), "document_provided");
    assert.equal(panelOf(withDeclarations(d), "enforcement_debt_none").state, "declared");
  });

  test("a document from an earlier revision supports nothing", () => {
    const d = syntheticDeclaration({
      revision: 2,
      provenance: "document_provided",
      document: syntheticDocument({ declarationRevision: 1 }),
    });
    assert.equal(displayedProvenance(d), "self_declared");
    assert.equal(panelOf(withDeclarations(d), "enforcement_debt_none").declaration?.document, null);
  });

  test("reviewed needs a matching review of this document at this revision", () => {
    const review = {
      outcome: "matches_declared_details" as const,
      reviewedAt: "2026-11-11T11:00:00Z",
      declarationRevision: 1,
    };
    const reviewed = syntheticDeclaration({
      provenance: "document_reviewed",
      document: syntheticDocument({ review }),
    });
    assert.equal(displayedProvenance(reviewed), "document_reviewed");
    const stale = syntheticDeclaration({
      revision: 2,
      provenance: "document_reviewed",
      document: syntheticDocument({ declarationRevision: 2, review }),
    });
    assert.equal(displayedProvenance(stale), "document_provided");
    const notConfirmed = syntheticDeclaration({
      provenance: "document_reviewed",
      document: syntheticDocument({ review: { ...review, outcome: "not_confirmed" } }),
    });
    assert.equal(displayedProvenance(notConfirmed), "document_provided");
  });

  test("a withdrawn statement has no provenance and shows no document", () => {
    const d = syntheticDeclaration({
      status: "withdrawn",
      withdrawnAt: "2026-11-11T12:00:00Z",
      provenance: null,
      document: syntheticDocument(),
    });
    const panel = panelOf(withDeclarations(d), "enforcement_debt_none");
    assert.equal(panel.state, "withdrawn");
    assert.equal(panel.declaration?.provenance, null);
    assert.equal(panel.declaration?.document, null);
  });
});

describe("what reaches the browser", () => {
  test("the view carries no storage path, no hash and no score-like field", () => {
    const d = syntheticDeclaration({
      provenance: "document_provided",
      document: syntheticDocument(),
      erasures: [
        {
          documentId: "0f000000-0000-4000-8000-000000000009",
          fileName: "SYNTHETIC-old.pdf",
          requestedAt: "2026-11-11T10:30:00Z",
          attempts: 2,
          failed: true,
        },
      ],
    });
    const json = JSON.stringify(buildSelfDeclarationsView(withDeclarations(d)));
    assert.equal(/storagePath|sha256|00000000-0000-4000-8000-000000000001\//.test(json), false);
    assert.equal(
      /score|rank|risk|rating|verified|clean[ _-]?record|debt[ _-]?free/i.test(json),
      false,
    );
  });

  test("a deleted statement whose files remain is an owed cleanup, not a statement", () => {
    const d = syntheticDeclaration({
      status: "deletion_pending",
      provenance: null,
      erasures: [
        {
          documentId: "0f000000-0000-4000-8000-000000000009",
          fileName: "SYNTHETIC-old.pdf",
          requestedAt: null,
          attempts: 1,
          failed: true,
        },
      ],
    });
    const view = buildSelfDeclarationsView(withDeclarations(d));
    const panel = view.panels[0]!;
    assert.equal(panel.state, "open");
    assert.equal(panel.declaration, null);
    assert.equal(panel.deletionPending, true);
    assert.deepEqual(
      panel.cleanups.map((c) => [c.fileName, c.failed]),
      [["SYNTHETIC-old.pdf", true]],
    );
    assert.equal(view.cleanupOwed, true);
  });

  test("a payload with an unknown provenance or kind is rejected, not rendered", () => {
    const bad = withDeclarations({
      ...syntheticDeclaration(),
      provenance: "verified_clean" as never,
    });
    assert.equal(selfDeclarationsPayloadSchema.safeParse(bad).success, false);
    assert.equal(selfDeclarationsPayloadSchema.safeParse(OPEN_PAYLOAD).success, true);
  });
});

describe("uploading a document", () => {
  function steps(fail: Partial<Record<"begin" | "put" | "attach" | "discard", boolean | string>>) {
    const calls: string[] = [];
    return {
      calls,
      steps: {
        begin: async () => {
          calls.push("begin");
          if (fail.begin) throw new Error(String(fail.begin));
          return { storagePath: "holder/doc.pdf" };
        },
        put: async (path: string) => {
          calls.push(`put:${path}`);
          return { ok: !fail.put };
        },
        attach: async () => {
          calls.push("attach");
          if (fail.attach) throw new Error(String(fail.attach));
        },
        discard: async () => {
          calls.push("discard");
          if (fail.discard) throw new Error("discard failed");
        },
      },
    };
  }

  test("begin, write to exactly the database's path, attach", async () => {
    const s = steps({});
    assert.deepEqual(await uploadDeclarationDocument(s.steps), { status: "attached" });
    assert.deepEqual(s.calls, ["begin", "put:holder/doc.pdf", "attach"]);
  });

  test("a refused intention writes nothing and discards nothing", async () => {
    const s = steps({ begin: "boom VSD_PROCESSING_NOT_AUTHORIZED boom" });
    assert.deepEqual(await uploadDeclarationDocument(s.steps), {
      status: "failed",
      code: "VSD_PROCESSING_NOT_AUTHORIZED",
    });
    assert.deepEqual(s.calls, ["begin"]);
  });

  test("a failed write is discarded and never attached", async () => {
    const s = steps({ put: true });
    assert.deepEqual(await uploadDeclarationDocument(s.steps), {
      status: "failed",
      code: "VSD_UPLOAD_FAILED",
    });
    assert.deepEqual(s.calls, ["begin", "put:holder/doc.pdf", "discard"]);
  });

  test("a refused attach is discarded, and a failing discard still reports the failure", async () => {
    const s = steps({ attach: "VSD_STALE_REVISION", discard: true });
    assert.deepEqual(await uploadDeclarationDocument(s.steps), {
      status: "failed",
      code: "VSD_STALE_REVISION",
    });
    assert.deepEqual(s.calls, ["begin", "put:holder/doc.pdf", "attach", "discard"]);
  });
});

describe("ending access and erasing", () => {
  const owed = withDeclarations(
    syntheticDeclaration({
      status: "withdrawn",
      withdrawnAt: "2026-11-11T12:00:00Z",
      provenance: null,
      erasures: [
        {
          documentId: "0f000000-0000-4000-8000-000000000009",
          fileName: "x",
          requestedAt: null,
          attempts: 1,
          failed: true,
        },
      ],
    }),
  );

  test("the access decision comes first; a refusal erases nothing and reports nothing", async () => {
    const calls: string[] = [];
    await assert.rejects(
      endAccessAndErase({
        end: async () => {
          calls.push("end");
          throw new Error("VSD_DECLARATION_NOT_FOUND");
        },
        drain: async () => void calls.push("drain"),
        reload: async () => (calls.push("reload"), OPEN_PAYLOAD),
      }),
    );
    assert.deepEqual(calls, ["end"]);
  });

  test("a Storage failure never undoes the decision and is never reported as erased", async () => {
    const outcome = await endAccessAndErase({
      end: async () => {},
      drain: async () => {
        throw new Error("storage down");
      },
      reload: async () => owed,
    });
    assert.equal(outcome.accessEnded, true);
    assert.equal(outcome.fileDeletion, "pending");
    assert.equal(filesOwed(owed), 1);
  });

  test("a drain that claims success is still not believed while the database owes a file", async () => {
    const outcome = await endAccessAndErase({
      end: async () => {},
      drain: async () => {},
      reload: async () => owed,
    });
    assert.equal(outcome.fileDeletion, "pending");
  });

  test("erased is confirmed only by the database owing nothing", async () => {
    const outcome = await endAccessAndErase({
      end: async () => {},
      drain: async () => {},
      reload: async () => OPEN_PAYLOAD,
    });
    assert.equal(outcome.fileDeletion, "confirmed");
  });
});

describe("input rules", () => {
  test("only PDF, JPEG and PNG up to the limit are accepted", () => {
    assert.equal(fileProblem({ type: "application/pdf", size: 10 }), null);
    assert.equal(fileProblem({ type: "image/heic", size: 10 }), "type");
    assert.equal(fileProblem({ type: "text/html", size: 10 }), "type");
    assert.equal(fileProblem({ type: "image/png", size: 0 }), "empty");
    assert.equal(fileProblem({ type: "image/png", size: DOCUMENT_MAX_BYTES + 1 }), "size");
  });

  test("a filename is display text only: no path separators or control characters", () => {
    assert.equal(safeDocumentName("../../etc/passwd"), "....etcpasswd");
    assert.equal(safeDocumentName("a\u0000b\\c.pdf"), "abc.pdf");
    assert.equal(safeDocumentName("   "), "document");
    assert.equal(safeDocumentName("x".repeat(500)).length, 200);
  });

  test("a database refusal maps to its own code and anything else to a generic one", () => {
    assert.equal(selfDeclarationErrorCode("xx VSD_STALE_REVISION yy"), "VSD_STALE_REVISION");
    assert.equal(selfDeclarationErrorCode("permission denied for table"), "VSD_WRITE_FAILED");
    assert.equal(selfDeclarationErrorCode(undefined), "VSD_WRITE_FAILED");
  });
});
