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
  DOCUMENT_MAX_ENCODED_LENGTH,
  checkDocumentBytes,
  decodeStrictBase64,
  sniffDocumentMime,
  validateEncodedDocument,
} from "../src/lib/self-declarations/content";
import {
  CLOSED_PAYLOAD,
  CRIMINAL_AUTHORIZED_PAYLOAD,
  OPEN_PAYLOAD,
  syntheticDeclaration,
  syntheticDocument,
  withDeclarations,
} from "../src/lib/self-declarations/fixtures/self-declaration-fixtures";
import { STATEMENTS } from "../src/lib/self-declarations/copy";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CLOSED_PASSPORT_DECLARATIONS,
  buildPassportDeclarationsView,
  confirmedChoices,
  isHeldStatement,
  parsePassportDeclarations,
  settleShareOperation,
  shareRefusalCode,
  toCommittedShareOperation,
  toCreatedShare,
  toDisclosedStatements,
  toSharedSelections,
  type CommittedShareOperation,
  type CreatedShare,
  type ShareOperation,
} from "../src/lib/self-declarations/passport-bridge";
import {
  ShareSelfDeclarationResult,
  type ShareOperationView,
} from "../src/components/security-passport/self-declarations/ShareSelfDeclarations";
import {
  SelfDeclarationShield,
  selfDeclarationShieldLabel,
} from "../src/components/security-passport/self-declarations/SelfDeclarationShield";

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

describe("uploading a document: nothing is assumed failed, nothing saved is destroyed", () => {
  type Status = "absent" | "prepared" | "attached" | "erasure_pending";
  type Stored = "absent" | "matching" | "different";
  /**
   * A small faithful model of the two stores. `row` is what the database
   * holds for this upload id and `object` what Storage holds at its path.
   * `lose` makes a step COMMIT and then throw, as a lost acknowledgement does;
   * `refuse` makes it throw without doing anything.
   */
  function world(init: { row?: Status; object?: Stored } = {}) {
    const w = {
      row: init.row ?? ("absent" as Status),
      object: init.object ?? ("absent" as Stored),
      calls: [] as string[],
      lose: new Set<string>(),
      refuse: new Map<string, string>(),
      putWrites: "matching" as Stored,
    };
    const step = async (name: string, commit: () => void) => {
      w.calls.push(name);
      const refusal = w.refuse.get(name);
      if (refusal !== undefined) throw new Error(refusal);
      commit();
      if (w.lose.has(name)) throw new Error("network: acknowledgement lost");
    };
    const steps = {
      begin: async () => {
        await step("begin", () => {
          if (w.row === "absent") w.row = "prepared";
        });
        return { status: w.row, storagePath: "holder/doc.pdf" };
      },
      inspect: async () => {
        w.calls.push("inspect");
        if (w.refuse.has("inspect")) throw new Error("VSD_STORAGE_UNAVAILABLE");
        return w.object;
      },
      put: () =>
        step("put", () => {
          if (w.object !== "absent") throw new Error("object already exists");
          w.object = w.putWrites;
        }),
      stamp: () =>
        step("stamp", () => {
          if (w.object !== "matching") throw new Error("VSD_CONTENT_MISMATCH");
        }),
      attach: () =>
        step("attach", () => {
          w.row = "attached";
        }),
      state: async () => {
        w.calls.push("state");
        if (w.refuse.has("state")) throw new Error("network");
        return w.row;
      },
      // The database's rule: only an unfinished upload can be abandoned.
      abandon: () =>
        step("abandon", () => {
          if (w.row === "prepared") w.row = "erasure_pending";
        }),
    };
    return { w, steps };
  }

  test("the plain path: begin, look, write, look again, stamp, attach", async () => {
    const { w, steps } = world();
    assert.deepEqual(await uploadDeclarationDocument(steps), { status: "attached" });
    assert.deepEqual(w.calls, ["begin", "inspect", "put", "inspect", "stamp", "attach"]);
    assert.equal(w.row, "attached");
  });

  test("a lost PUT acknowledgement: the bytes landed, so the upload completes and is not discarded", async () => {
    const { w, steps } = world();
    w.lose.add("put");
    assert.deepEqual(await uploadDeclarationDocument(steps), { status: "attached" });
    assert.equal(w.calls.includes("abandon"), false);
    assert.equal(w.row, "attached");
  });

  test("a lost ATTACH acknowledgement: the document is attached, reported as saved, and never abandoned", async () => {
    const { w, steps } = world();
    w.lose.add("attach");
    assert.deepEqual(await uploadDeclarationDocument(steps), { status: "attached" });
    assert.deepEqual(w.calls.slice(-2), ["attach", "state"]);
    assert.equal(w.calls.includes("abandon"), false);
    assert.equal(w.row, "attached");
    assert.equal(w.object, "matching");
  });

  test("the final response was lost: the same upload id again is a success that rewrites and deletes nothing", async () => {
    const { w, steps } = world();
    assert.deepEqual(await uploadDeclarationDocument(steps), { status: "attached" });
    w.calls.length = 0;
    assert.deepEqual(await uploadDeclarationDocument(steps), { status: "attached" });
    assert.deepEqual(w.calls, ["begin", "inspect"]);
    assert.equal(w.row, "attached");
    assert.equal(w.object, "matching");
  });

  test("a retry after the bytes landed but before the attach: resumes without writing again", async () => {
    const { w, steps } = world({ row: "prepared", object: "matching" });
    assert.deepEqual(await uploadDeclarationDocument(steps), { status: "attached" });
    assert.deepEqual(w.calls, ["begin", "inspect", "stamp", "attach"]);
  });

  test("an already-attached upload is never abandoned, even when every later step would fail", async () => {
    const { w, steps } = world({ row: "attached", object: "matching" });
    w.refuse.set("put", "boom");
    w.refuse.set("attach", "VSD_STALE_REVISION");
    assert.deepEqual(await uploadDeclarationDocument(steps), { status: "attached" });
    assert.equal(w.row, "attached");
  });

  test("an attached upload whose stored bytes differ is reported, and still not deleted", async () => {
    const { w, steps } = world({ row: "attached", object: "different" });
    assert.deepEqual(await uploadDeclarationDocument(steps), {
      status: "failed",
      code: "VSD_CONTENT_MISMATCH",
    });
    assert.equal(w.calls.includes("abandon"), false);
    assert.equal(w.row, "attached");
  });

  test("the bytes in Storage are not the declared ones: refused before any stamp, the unfinished upload abandoned", async () => {
    const { w, steps } = world();
    w.putWrites = "different";
    assert.deepEqual(await uploadDeclarationDocument(steps), {
      status: "failed",
      code: "VSD_CONTENT_MISMATCH",
    });
    assert.equal(w.calls.includes("stamp"), false);
    assert.equal(w.calls.includes("attach"), false);
    assert.equal(w.row, "erasure_pending");
  });

  test("different bytes already at the path of a retried upload are not accepted", async () => {
    const { w, steps } = world({ row: "prepared", object: "different" });
    assert.deepEqual(await uploadDeclarationDocument(steps), {
      status: "failed",
      code: "VSD_CONTENT_MISMATCH",
    });
    assert.equal(w.calls.includes("put"), false);
    assert.equal(w.calls.includes("attach"), false);
  });

  test("a put that really failed: nothing stored, the unfinished upload abandoned", async () => {
    const { w, steps } = world();
    w.refuse.set("put", "storage said no");
    assert.deepEqual(await uploadDeclarationDocument(steps), {
      status: "failed",
      code: "VSD_UPLOAD_FAILED",
    });
    assert.equal(w.row, "erasure_pending");
  });

  test("a mismatched file under a used upload id is refused by begin and destroys nothing", async () => {
    const { w, steps } = world({ row: "attached", object: "matching" });
    w.refuse.set("begin", "VSD_UPLOAD_INTENT_MISMATCH");
    assert.deepEqual(await uploadDeclarationDocument(steps), {
      status: "failed",
      code: "VSD_UPLOAD_INTENT_MISMATCH",
    });
    assert.deepEqual(w.calls, ["begin"]);
    assert.equal(w.row, "attached");
  });

  test("a stale revision is still refused: at begin with nothing touched, at attach with the unfinished upload abandoned", async () => {
    const first = world({ row: "attached", object: "matching" });
    first.w.refuse.set("begin", "VSD_STALE_REVISION");
    assert.deepEqual(await uploadDeclarationDocument(first.steps), {
      status: "failed",
      code: "VSD_STALE_REVISION",
    });
    assert.equal(first.w.row, "attached");

    const second = world();
    second.w.refuse.set("attach", "VSD_STALE_REVISION");
    assert.deepEqual(await uploadDeclarationDocument(second.steps), {
      status: "failed",
      code: "VSD_STALE_REVISION",
    });
    assert.deepEqual(second.w.calls.slice(-3), ["attach", "state", "abandon"]);
    assert.equal(second.w.row, "erasure_pending");
  });

  test("when the state cannot be determined nothing is destroyed and the outcome is unconfirmed", async () => {
    const blind = world();
    blind.w.refuse.set("inspect", "x");
    assert.deepEqual(await uploadDeclarationDocument(blind.steps), { status: "unconfirmed" });
    assert.equal(blind.w.calls.includes("abandon"), false);

    const lost = world();
    lost.w.lose.add("attach");
    lost.w.refuse.set("state", "x");
    assert.deepEqual(await uploadDeclarationDocument(lost.steps), { status: "unconfirmed" });
    assert.equal(lost.w.calls.includes("abandon"), false);
    assert.equal(lost.w.row, "attached");

    const begin = world();
    begin.w.lose.add("begin");
    assert.deepEqual(await uploadDeclarationDocument(begin.steps), { status: "unconfirmed" });
    assert.equal(begin.w.calls.includes("abandon"), false);
    // ...and the same id then simply resumes.
    begin.w.lose.clear();
    assert.deepEqual(await uploadDeclarationDocument(begin.steps), { status: "attached" });
  });

  test("an ambiguous attach failure on a still-unfinished upload leaves it resumable, not abandoned", async () => {
    const { w, steps } = world();
    w.refuse.set("attach", "network: connection reset");
    assert.deepEqual(await uploadDeclarationDocument(steps), { status: "unconfirmed" });
    assert.equal(w.calls.includes("abandon"), false);
    assert.equal(w.row, "prepared");
    w.refuse.clear();
    w.calls.length = 0;
    assert.deepEqual(await uploadDeclarationDocument(steps), { status: "attached" });
    assert.deepEqual(w.calls, ["begin", "inspect", "stamp", "attach"]);
  });

  test("an upload that was abandoned cannot be revived under the same id", async () => {
    const { w, steps } = world({ row: "erasure_pending" });
    assert.deepEqual(await uploadDeclarationDocument(steps), {
      status: "failed",
      code: "VSD_DOCUMENT_ERASURE_FENCED",
    });
    assert.deepEqual(w.calls, ["begin"]);
  });
});

describe("what an uploaded file actually is", () => {
  const b64 = (bytes: Uint8Array | string) => Buffer.from(bytes).toString("base64");
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1");
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0, 0, 0, 13]),
    Buffer.from("IHDR"),
    Buffer.alloc(17),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("IEND"),
    Buffer.from([0xae, 0x42, 0x60, 0x82]),
  ]);
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(20),
    Buffer.from([0xff, 0xd9]),
  ]);

  test("real PDF, PNG and JPEG bytes are recognised from their own signatures", () => {
    assert.equal(sniffDocumentMime(pdf), "application/pdf");
    assert.equal(sniffDocumentMime(png), "image/png");
    assert.equal(sniffDocumentMime(jpeg), "image/jpeg");
    assert.equal(validateEncodedDocument(b64(pdf), "application/pdf").ok, true);
    assert.equal(validateEncodedDocument(b64(png), "image/png").ok, true);
    assert.equal(validateEncodedDocument(b64(jpeg), "image/jpeg").ok, true);
  });

  test("a spoofed MIME type is refused: the declared type must be what the bytes are", () => {
    const reason = (content: Uint8Array | string, mime: string) => {
      const r = validateEncodedDocument(b64(content), mime);
      return r.ok ? "ok" : r.reason;
    };
    assert.equal(reason(pdf, "image/png"), "type_mismatch");
    assert.equal(reason(png, "application/pdf"), "type_mismatch");
    assert.equal(reason(jpeg, "image/png"), "type_mismatch");
    assert.equal(
      reason("<html><script>alert(1)</script></html>", "application/pdf"),
      "unrecognised",
    );
    assert.equal(reason("MZ\u0090\u0000 this is an executable", "image/jpeg"), "unrecognised");
    assert.equal(reason(pdf, "image/heic"), "type_mismatch");
    assert.equal(reason(pdf, "text/html"), "type_mismatch");
  });

  test("malformed content is refused: a header alone is not a file", () => {
    const sniff = (bytes: Uint8Array) => sniffDocumentMime(bytes);
    assert.equal(sniff(Buffer.from("%PDF-1.4\nno end marker")), null);
    assert.equal(sniff(Buffer.from("%PDF-x.y\n%%EOF")), null);
    assert.equal(sniff(Buffer.from(" %PDF-1.4\n%%EOF")), null);
    assert.equal(sniff(png.subarray(0, 12)), null);
    assert.equal(sniff(png.subarray(0, png.length - 1)), null);
    assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])), null);
    assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9])), null);
    assert.equal(sniff(new Uint8Array(0)), null);
  });

  test("only strict, canonical base64 is decoded", () => {
    const good = b64(pdf);
    assert.notEqual(decodeStrictBase64(good), null);
    for (const bad of [
      "",
      good.slice(0, -1),
      `${good}\n`,
      ` ${good}`,
      good.replace(/\+/g, "-").replace(/\//g, "_") + "-_-_",
      `data:application/pdf;base64,${good}`,
      "====",
      "QUJD=", // wrong length
      "QUJ=RA==", // padding in the middle
      "QUJDRA=",
    ]) {
      assert.equal(decodeStrictBase64(bad), null, JSON.stringify(bad.slice(0, 24)));
    }
    assert.deepEqual(Array.from(decodeStrictBase64("QUI=")!), [0x41, 0x42]);
    // "QUJ=" decodes leniently to "AB" but is not the canonical encoding of it.
    assert.equal(decodeStrictBase64("QUJ="), null);
  });

  test("the encoded size is bounded before anything is decoded, and the decoded size after", () => {
    const tooLong = "A".repeat(DOCUMENT_MAX_ENCODED_LENGTH + 4);
    const r = validateEncodedDocument(tooLong, "application/pdf");
    assert.deepEqual(r, { ok: false, reason: "encoded_too_large" });
    assert.equal(DOCUMENT_MAX_ENCODED_LENGTH, Math.ceil(DOCUMENT_MAX_BYTES / 3) * 4);
    assert.deepEqual(
      checkDocumentBytes(new Uint8Array(DOCUMENT_MAX_BYTES + 1), "application/pdf"),
      {
        ok: false,
        reason: "too_large",
      },
    );
    assert.deepEqual(checkDocumentBytes(new Uint8Array(0), "application/pdf"), {
      ok: false,
      reason: "empty",
    });
    assert.deepEqual(validateEncodedDocument("", "application/pdf"), {
      ok: false,
      reason: "empty",
    });
  });

  test("a body that is not base64 at all is refused without being interpreted", () => {
    assert.deepEqual(validateEncodedDocument("%PDF-1.4 raw bytes, not base64", "application/pdf"), {
      ok: false,
      reason: "not_base64",
    });
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

// ── The Security Passport bridge ───────────────────────────────────────────
//
// The pure rules of passport-bridge.ts and the shield's markup. The database
// half is supabase/tests/vsd_passport_disclosure_test.sql.

const BRIDGE_STATEMENT = {
  kind: "enforcement_debt_none",
  jurisdiction: "SE",
  statementVersion: "se-enforcement-v1",
  asOfDate: "2026-11-11",
  declaredOn: "2026-11-11",
  statementPeriod: null,
} as const;
const BRIDGE_ID = "0d000000-0000-4000-8000-0000000000e1";
const bridgeDeclaration = (over: Record<string, unknown> = {}) => ({
  id: BRIDGE_ID,
  revision: 2,
  statement: BRIDGE_STATEMENT,
  provenance: "self_declared" as const,
  shareable: false,
  ...over,
});

describe("the Passport bridge: what the holder's Passport may show", () => {
  test("closed authorization: not activated, and no shield", () => {
    const view = buildPassportDeclarationsView({ open: [], declarations: [] });
    assert.equal(view.state, "not_activated");
    assert.deepEqual(view.declarations, []);
    assert.equal(CLOSED_PASSPORT_DECLARATIONS.state, "not_activated");
  });

  test("open but nothing declared is neutral, never 'missing'", () => {
    const view = buildPassportDeclarationsView({
      open: [
        { kind: "payment_remarks_none", jurisdiction: "SE", statementVersion: "se-remarks-v1" },
      ],
      declarations: [],
    });
    assert.equal(view.state, "none");
    assert.deepEqual(view.declarations, []);
  });

  test("an eligible current declaration: its subject, its date and whether it may be shared", () => {
    const view = buildPassportDeclarationsView({
      open: [],
      declarations: [bridgeDeclaration({ shareable: true })],
    });
    assert.equal(view.state, "declared");
    assert.equal(view.declarations.length, 1);
    assert.equal(view.declarations[0]!.statement.kind, "enforcement_debt_none");
    assert.equal(view.declarations[0]!.statement.asOfDate, "2026-11-11");
    assert.equal(view.declarations[0]!.revision, 2);
    assert.equal(view.declarations[0]!.shareable, true);
  });

  test("criminal history draws nothing even when the database returns a statement for it", () => {
    const criminal = {
      ...BRIDGE_STATEMENT,
      kind: "criminal_history" as const,
      statementVersion: "se-criminal-synthetic-v1",
      statementPeriod: "SYNTHETIC last five years",
    };
    const view = buildPassportDeclarationsView({
      open: [
        {
          kind: "criminal_history",
          jurisdiction: "SE",
          statementVersion: criminal.statementVersion,
        },
      ],
      declarations: [bridgeDeclaration({ statement: criminal, shareable: true })],
    });
    assert.equal(view.state, "not_activated");
    assert.deepEqual(view.declarations, []);
    assert.deepEqual(toDisclosedStatements({ items: [criminal] }), []);
  });

  test("a payload that is not exactly the expected shape is refused whole", () => {
    assert.equal(parsePassportDeclarations(null), null);
    assert.equal(parsePassportDeclarations({ open: [], declarations: [{ id: BRIDGE_ID }] }), null);
    assert.equal(
      parsePassportDeclarations({
        open: [],
        declarations: [{ ...bridgeDeclaration(), storagePath: "x/y.pdf" }],
      }),
      null,
    );
  });
});

describe("the Passport bridge: what a recipient may be given", () => {
  test("exactly the six statement fields", () => {
    assert.deepEqual(
      toDisclosedStatements({ audience: "signed_in_recipient", items: [BRIDGE_STATEMENT] }),
      [BRIDGE_STATEMENT],
    );
  });

  test("a supporting document, a review, a hash, a path or an id cannot ride along", () => {
    for (const extra of [
      { provenance: "document_reviewed" },
      { document: { fileName: "SYNTHETIC.pdf" } },
      { sha256: "a".repeat(64) },
      { storagePath: "u/d.pdf" },
      { id: BRIDGE_ID },
      { holderUserId: BRIDGE_ID },
      { verified: true },
    ]) {
      assert.deepEqual(toDisclosedStatements({ items: [{ ...BRIDGE_STATEMENT, ...extra }] }), []);
    }
  });

  test("another audience, a fourth item or a malformed payload gives nothing", () => {
    assert.deepEqual(
      toDisclosedStatements({ audience: "anonymous_link", items: [BRIDGE_STATEMENT] }),
      [],
    );
    assert.deepEqual(toDisclosedStatements({ items: Array(4).fill(BRIDGE_STATEMENT) }), []);
    assert.deepEqual(toDisclosedStatements({ items: "x" }), []);
    assert.deepEqual(toDisclosedStatements(undefined), []);
  });

  test("wording the application does not hold is dropped", () => {
    assert.equal(isHeldStatement(BRIDGE_STATEMENT), true);
    assert.equal(
      isHeldStatement({ kind: "enforcement_debt_none", statementVersion: "se-enforcement-v2" }),
      false,
    );
    assert.equal(
      isHeldStatement({ kind: "criminal_history", statementVersion: "se-enforcement-v1" }),
      false,
    );
  });
});

describe("the Passport bridge: selection", () => {
  const ticked = [bridgeDeclaration({ shareable: true })] as never;

  test("unchecked: nothing ticked means nothing to attach", () => {
    assert.deepEqual(confirmedChoices([], [BRIDGE_STATEMENT]), []);
  });

  test("ticked but not previewed is not attached", () => {
    assert.deepEqual(confirmedChoices(ticked, []), []);
  });

  test("a preview of a different statement or date does not confirm the tick", () => {
    assert.deepEqual(
      confirmedChoices(ticked, [{ ...BRIDGE_STATEMENT, asOfDate: "2026-11-01" }]),
      [],
    );
    assert.deepEqual(
      confirmedChoices(ticked, [
        { ...BRIDGE_STATEMENT, kind: "payment_remarks_none", statementVersion: "se-remarks-v1" },
      ]),
      [],
    );
  });

  test("ticked and previewed: the exact declaration and the revision on screen", () => {
    assert.deepEqual(confirmedChoices(ticked, [BRIDGE_STATEMENT]), [
      { declarationId: BRIDGE_ID, revision: 2 },
    ]);
  });

  test("the holder's list carries how often a statement was read and never who read it", () => {
    const rows = toSharedSelections([
      {
        id: BRIDGE_ID,
        disclosureId: BRIDGE_ID,
        kind: "enforcement_debt_none",
        jurisdiction: "SE",
        statementVersion: "se-enforcement-v1",
        createdAt: "2026-11-11T09:00:00Z",
        withdrawnAt: null,
        disclosable: true,
        accessCount: 3,
        lastAccessedAt: "2026-11-11T10:00:00Z",
      },
    ]);
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0]!).sort(), [
      "accessCount",
      "createdAt",
      "disclosable",
      "disclosureId",
      "id",
      "kind",
    ]);
    assert.deepEqual(toSharedSelections([{ id: BRIDGE_ID, recipientUserId: BRIDGE_ID }]), []);
  });
});

// A stand-in for the database's side of one creation operation, with its
// rules and nothing else: one link per request key, the choice sealed with
// it, a repeat answered from the seal, a different choice refused. `drop`
// loses the ANSWER after the commit; `sever` loses the request before it.
function fakeShareDatabase() {
  const links = new Map<string, { id: string; choice: string }>();
  const calls: ShareOperation[] = [];
  let drop = 0;
  let sever = 0;
  let unreadable = 0;
  let refuse: string | null = null;
  const choiceOf = (op: ShareOperation) =>
    op.choices
      .map((c) => `${c.declarationId}:${c.revision}`)
      .sort()
      .join(",");
  return {
    links,
    calls,
    dropAnswers: (n: number) => (drop = n),
    severRequests: (n: number) => (sever = n),
    makeStateUnreadable: (n: number) => (unreadable = n),
    refuseWith: (code: string | null) => (refuse = code),
    api: {
      create: async (op: ShareOperation): Promise<CreatedShare> => {
        calls.push(structuredClone(op) as ShareOperation);
        if (sever > 0) {
          sever -= 1;
          throw new Error("fetch failed");
        }
        // A refusal rolls the whole transaction back: nothing is written.
        if (refuse) throw new Error(refuse);
        const existing = links.get(op.requestKey);
        let answer: CreatedShare;
        if (existing) {
          if (existing.choice !== choiceOf(op)) throw new Error("VSD_DISCLOSURE_CHOICE_SEALED");
          answer = {
            status: "already_created",
            token: null,
            disclosureId: existing.id,
            expiresAt: null,
            declarations: op.choices.length,
          };
        } else {
          const id = `0d000000-0000-4000-8000-${String(links.size + 1).padStart(12, "0")}`;
          links.set(op.requestKey, { id, choice: choiceOf(op) });
          answer = {
            status: "created",
            token: "synthetic-address",
            disclosureId: id,
            expiresAt: null,
            declarations: op.choices.length,
          };
        }
        if (drop > 0) {
          drop -= 1;
          throw new Error("fetch failed");
        }
        return answer;
      },
      committed: async (requestKey: string): Promise<CommittedShareOperation> => {
        if (unreadable > 0) {
          unreadable -= 1;
          throw new Error("fetch failed");
        }
        const link = links.get(requestKey);
        return link
          ? {
              status: "sealed",
              disclosureId: link.id,
              declarations: link.choice ? link.choice.split(",").length : 0,
            }
          : { status: "none" };
      },
    },
  };
}

describe("the Passport bridge: one creation operation, and what is known about it", () => {
  const operation: ShareOperation = {
    requestKey: "0d000000-0000-4000-8000-0000000000aa",
    link: { claimIds: [BRIDGE_ID], permittedFields: [], expiresDays: 7, locale: "sv" },
    choices: [{ declarationId: BRIDGE_ID, revision: 2 }],
  };

  test("the ordinary case: created, with its address and the sealed count", async () => {
    const db = fakeShareDatabase();
    const outcome = await settleShareOperation(db.api, operation);
    assert.deepEqual(outcome, {
      kind: "created",
      disclosureId: "0d000000-0000-4000-8000-000000000001",
      token: "synthetic-address",
      expiresAt: null,
      declarations: 1,
    });
  });

  test("the commit happened and the answer was lost: confirmed created from the committed state, never 'not shared'", async () => {
    const db = fakeShareDatabase();
    db.dropAnswers(1);
    const outcome = await settleShareOperation(db.api, operation);
    assert.equal(outcome.kind, "created");
    assert.equal(outcome.kind === "created" && outcome.declarations, 1);
    // The address was in the lost answer; it is not invented.
    assert.equal(outcome.kind === "created" && outcome.token, null);
    assert.equal(db.links.size, 1);
  });

  test("the answer was lost AND the committed state cannot be read: unconfirmed, and the retry settles it without a second link", async () => {
    const db = fakeShareDatabase();
    db.dropAnswers(1);
    db.makeStateUnreadable(1);
    assert.deepEqual(await settleShareOperation(db.api, operation), { kind: "unconfirmed" });
    assert.equal(db.links.size, 1, "the database did commit; the screen just does not know");
    const retried = await settleShareOperation(db.api, operation);
    assert.equal(retried.kind, "created");
    assert.equal(retried.kind === "created" && retried.declarations, 1);
    assert.equal(db.links.size, 1);
  });

  test("the request never arrived: nothing committed is NOT proof, so it is unconfirmed until the same operation is repeated", async () => {
    const db = fakeShareDatabase();
    db.severRequests(1);
    assert.deepEqual(await settleShareOperation(db.api, operation), { kind: "unconfirmed" });
    assert.equal(db.links.size, 0);
    const retried = await settleShareOperation(db.api, operation);
    assert.equal(retried.kind === "created" && retried.token, "synthetic-address");
    assert.equal(db.links.size, 1);
  });

  test("repeated retries: the same key, link and choices every time; one link; the choice never widens", async () => {
    const db = fakeShareDatabase();
    db.dropAnswers(3);
    db.makeStateUnreadable(3);
    for (let i = 0; i < 3; i += 1) {
      assert.deepEqual(await settleShareOperation(db.api, operation), { kind: "unconfirmed" });
    }
    const settled = await settleShareOperation(db.api, operation);
    assert.equal(settled.kind, "created");
    assert.equal(db.calls.length, 4);
    for (const call of db.calls) assert.deepEqual(call, operation);
    assert.equal(db.links.size, 1);
    assert.equal(db.links.get(operation.requestKey)!.choice, `${BRIDGE_ID}:2`);
  });

  test("a genuine database refusal: confirmed refused, nothing created, and no reconciliation is attempted", async () => {
    const db = fakeShareDatabase();
    db.refuseWith("VSD_STALE_REVISION");
    db.makeStateUnreadable(1);
    assert.deepEqual(await settleShareOperation(db.api, operation), {
      kind: "refused",
      code: "VSD_STALE_REVISION",
    });
    assert.equal(db.links.size, 0);
    db.refuseWith("SP_CREDENTIAL_NOT_SHAREABLE");
    assert.deepEqual(await settleShareOperation(db.api, operation), {
      kind: "refused",
      code: "SP_CREDENTIAL_NOT_SHAREABLE",
    });
  });

  test("a different choice under a settled key is refused by the database, not merged", async () => {
    const db = fakeShareDatabase();
    await settleShareOperation(db.api, operation);
    const wider = {
      ...operation,
      choices: [...operation.choices, { declarationId: BRIDGE_ID.replace(/1$/, "2"), revision: 1 }],
    };
    assert.deepEqual(await settleShareOperation(db.api, wider), {
      kind: "refused",
      code: "VSD_DISCLOSURE_CHOICE_SEALED",
    });
    assert.equal(db.links.get(operation.requestKey)!.choice, `${BRIDGE_ID}:2`);
  });

  test("an empty choice is an operation too: sealed with nothing", async () => {
    const db = fakeShareDatabase();
    const outcome = await settleShareOperation(db.api, { ...operation, choices: [] });
    assert.equal(outcome.kind === "created" && outcome.declarations, 0);
  });

  test("a committed state that does not match the operation confirms nothing", async () => {
    const lost = () => Promise.reject(new Error("fetch failed"));
    assert.deepEqual(
      await settleShareOperation(
        {
          create: lost,
          committed: async () => ({ status: "sealed", disclosureId: BRIDGE_ID, declarations: 0 }),
        },
        operation,
      ),
      { kind: "unconfirmed" },
    );
    assert.deepEqual(
      await settleShareOperation(
        {
          create: lost,
          committed: async () => ({ status: "unsealed", disclosureId: BRIDGE_ID, declarations: 0 }),
        },
        operation,
      ),
      { kind: "created_without", disclosureId: BRIDGE_ID },
    );
  });

  test("only the database's own named refusal is a refusal", () => {
    assert.equal(
      shareRefusalCode(new Error("VSD_DISCLOSURE_NOT_AUTHORIZED")),
      "VSD_DISCLOSURE_NOT_AUTHORIZED",
    );
    assert.equal(shareRefusalCode(new Error("SP_REQUEST_KEY_CONFLICT")), "SP_REQUEST_KEY_CONFLICT");
    for (const other of ["UNCONFIRMED", "fetch failed", "", "Unauthorized", "vsd_lowercase"]) {
      assert.equal(shareRefusalCode(new Error(other)), null);
    }
    assert.equal(shareRefusalCode(null), null);
  });

  test("the database's answers are read strictly: a created link without an address is not a created link", () => {
    assert.equal(
      toCreatedShare({ status: "created", disclosure_id: BRIDGE_ID, declarations: 1 }),
      null,
    );
    assert.equal(toCreatedShare({ status: "selected", count: 1 }), null);
    assert.deepEqual(
      toCreatedShare({
        status: "already_created",
        disclosure_id: BRIDGE_ID,
        expires_at: null,
        declarations: 1,
        token: "must-not-pass",
      }),
      {
        status: "already_created",
        token: null,
        disclosureId: BRIDGE_ID,
        expiresAt: null,
        declarations: 1,
      },
    );
    assert.deepEqual(toCommittedShareOperation({ status: "none" }), { status: "none" });
    assert.equal(toCommittedShareOperation({ status: "sealed" }), null);
    assert.equal(toCommittedShareOperation(null), null);
  });
});

describe("the share step says only what is known", () => {
  const operation: ShareOperation = {
    requestKey: "0d000000-0000-4000-8000-0000000000aa",
    link: { claimIds: [BRIDGE_ID], permittedFields: [], expiresDays: 7, locale: "sv" },
    choices: [{ declarationId: BRIDGE_ID, revision: 2 }],
  };
  const render = (view: Partial<ShareOperationView>, lang: "sv" | "en" = "sv") =>
    renderToStaticMarkup(
      createElement(ShareSelfDeclarationResult, {
        view: { operation, outcome: null, settling: false, listStale: false, ...view },
        lang,
        onRetry: () => {},
        onRefreshList: () => {},
      }),
    );
  const CLAIMS_NOTHING_SHARED =
    /delades inte|ingen självdeklaration delades|innehåller den inte|ingen länk skapades|not shared|does not carry|no link was created|no self-declaration was shared/i;

  test("unconfirmed: says it does not know, offers the retry, and never says nothing was shared", () => {
    for (const lang of ["sv", "en"] as const) {
      const html = render({ outcome: { kind: "unconfirmed" } }, lang);
      assert.match(html, /data-share-vsd-result="unconfirmed"/);
      assert.match(html, /role="alert"/);
      assert.match(html, /data-share-vsd-retry/);
      assert.match(html, lang === "sv" ? /vet därför inte/ : /do not know/);
      assert.doesNotMatch(html, CLAIMS_NOTHING_SHARED);
    }
    assert.match(render({ outcome: { kind: "unconfirmed" }, settling: true }), /disabled=""/);
  });

  test("refused by the database: only then is it said that no link was created and nothing was shared", () => {
    const html = render({ outcome: { kind: "refused", code: "VSD_STALE_REVISION" } });
    assert.match(html, /data-share-vsd-result="refused"/);
    assert.match(html, /Ingen länk skapades och ingen självdeklaration delades/);
    assert.match(html, /ändrats sedan du såg förhandsvisningen/);
    assert.doesNotMatch(html, /data-share-vsd-retry/);
  });

  test("created: shared, and a list that could not be re-read is a separate sentence that takes nothing back", () => {
    const created = {
      kind: "created",
      disclosureId: BRIDGE_ID,
      token: "synthetic-address",
      expiresAt: null,
      declarations: 1,
    } as const;
    const fresh = render({ outcome: created });
    assert.match(fresh, /data-share-vsd-result="created"/);
    assert.match(fresh, /följer med den här länken/);
    assert.doesNotMatch(fresh, /data-share-vsd-list-stale/);
    const stale = render({ outcome: created, listStale: true });
    assert.match(stale, /data-share-vsd-result="created"/);
    assert.match(stale, /följer med den här länken/);
    assert.match(stale, /data-share-vsd-list-stale/);
    assert.match(stale, /Det ändrar inte vad som delas/);
    assert.match(stale, /data-share-vsd-refresh/);
  });

  test("created but the address was lost: the link carries the statement and a reissue would not", () => {
    const html = render({
      outcome: {
        kind: "created",
        disclosureId: BRIDGE_ID,
        token: null,
        expiresAt: null,
        declarations: 1,
      },
    });
    assert.match(html, /data-share-vsd-address="lost"/);
    assert.match(
      html,
      /innehåller självdeklarationen, men svaret med länkens adress kom aldrig fram/,
    );
    assert.match(html, /En länk som du skapar på nytt innehåller inte självdeklarationen/);
  });

  test("nothing chosen and nothing in doubt: nothing is said about self-declarations", () => {
    const empty = { ...operation, choices: [] };
    assert.equal(
      render({
        operation: empty,
        outcome: {
          kind: "created",
          disclosureId: BRIDGE_ID,
          token: "t",
          expiresAt: null,
          declarations: 0,
        },
      }),
      "",
    );
    assert.equal(render({ operation: empty, outcome: { kind: "refused", code: "SP_X" } }), "");
    assert.equal(render({ outcome: null }), "");
    // A doubt is said even with nothing chosen: the link itself is in doubt.
    assert.match(
      render({ operation: empty, outcome: { kind: "unconfirmed" } }),
      /vet därför inte om länken skapades/,
    );
  });
});

describe("the self-declared shield", () => {
  const render = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(SelfDeclarationShield, {
        statement: BRIDGE_STATEMENT,
        lang: "sv",
        defaultOpen: true,
        ...props,
      } as never),
    );

  test("Swedish: subject, 'Självdeklarerat', the date, the exact statement and that it is unverified", () => {
    const html = render({});
    assert.match(html, /Kronofogden · Självdeklarerat/);
    assert.match(html, /data-shield-mark="self_declared"/);
    assert.match(html, /2026-11-11/);
    assert.ok(
      html.includes(STATEMENTS["se-enforcement-v1"]!.statement.sv.replace("{0}", "2026-11-11")),
    );
    assert.match(html, /Sverige/);
    assert.match(
      html,
      /Uppgiften är lämnad av personen själv och har inte verifierats av CQrityjob\./,
    );
    assert.match(html, /aria-expanded="true"/);
    assert.match(html, /role="region"/);
  });

  test("English equivalents", () => {
    const html = render({ lang: "en" });
    assert.match(html, /Swedish Enforcement Authority · Self-declared/);
    assert.match(html, /has not been verified by CQrityjob/);
    assert.match(html, /Sweden/);
    assert.equal(
      selfDeclarationShieldLabel(
        { ...BRIDGE_STATEMENT, kind: "payment_remarks_none", statementVersion: "se-remarks-v1" },
        "en",
      ),
      "Payment remarks · Self-declared",
    );
    assert.equal(
      selfDeclarationShieldLabel({ ...BRIDGE_STATEMENT, kind: "criminal_history" }, "sv"),
      "Brottshistorik · Självdeklarerat",
    );
  });

  test("a reviewed supporting document never upgrades the shield", () => {
    for (const provenance of ["document_provided", "document_reviewed"] as const) {
      const html = render({ holderProvenance: provenance });
      assert.match(html, /Kronofogden · Självdeklarerat/);
      assert.match(html, /data-shield-mark="self_declared"/);
      assert.doesNotMatch(html, /data-shield-mark="(verified|document_provided)"/);
      assert.match(html, /har inte verifierats av CQrityjob/);
      // Described precisely, in the existing words -- and never as verified.
      assert.match(html, /Dokument (bifogat|granskat)/);
      assert.doesNotMatch(html, /skuldfri|verifierad uppgift|godkänd|debt-free/i);
    }
    // A recipient is given no provenance, so the line cannot appear for them.
    assert.doesNotMatch(render({}), /Underlag|Dokument granskat|Dokument bifogat/);
  });

  test("collapsed by default: a button that says so, and no statement in the markup", () => {
    const html = render({ defaultOpen: false });
    assert.match(html, /<button[^>]*aria-expanded="false"/);
    assert.doesNotMatch(html, /Jag uppger/);
  });

  test("wording the application does not hold draws nothing", () => {
    assert.equal(
      render({ statement: { ...BRIDGE_STATEMENT, statementVersion: "se-unknown-v9" } }),
      "",
    );
    assert.equal(
      render({
        statement: {
          ...BRIDGE_STATEMENT,
          kind: "criminal_history",
          statementVersion: "se-criminal-synthetic-v1",
        },
      }),
      "",
    );
  });
});
