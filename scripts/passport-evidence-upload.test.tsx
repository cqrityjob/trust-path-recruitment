import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/database";
import { uploadOwnedEvidence } from "../src/lib/security-passport/evidence-upload-adapter.functions";
import {
  evidenceUploadIssue,
  isDefiniteAttachmentRejection,
  requireSavedEvidence,
  uploadAndAttachEvidence,
  type EvidenceAttachmentRead,
} from "../src/lib/security-passport/evidence-upload";
import { passportT } from "../src/lib/security-passport/i18n";

const attemptId = "00000000-0000-4000-8000-000000000001";
const holder = "00000000-0000-4000-8000-000000000002";
const claim = "00000000-0000-4000-8000-000000000003";
const path = `${holder}/${attemptId}.pdf`;

function actions() {
  const calls: string[] = [];
  return {
    calls,
    input: {
      attemptId,
      preflight: async () => {
        calls.push("preflight");
      },
      upload: async () => {
        calls.push("upload");
      },
      attach: async (): Promise<"accepted" | "rejected" | "unknown"> => {
        calls.push("attach");
        return "rejected";
      },
      readAttached: async (): Promise<EvidenceAttachmentRead<string>> => {
        calls.push("read");
        return { state: "missing" };
      },
      remove: async () => {
        calls.push("remove");
        return { failed: false, deleted: true };
      },
      confirmMissing: async () => {
        calls.push("list");
        return true;
      },
    },
  };
}

describe("evidence upload transaction boundaries", () => {
  test("a failed preflight never reaches Storage", async () => {
    const { calls, input } = actions();
    input.preflight = async () => {
      throw new Error("SP_TARGET_NOT_FOUND");
    };
    await assert.rejects(uploadAndAttachEvidence(input), new RegExp("SP_TARGET_NOT_FOUND"));
    assert.deepEqual(calls, []);
  });

  test("a Storage response loss is unknown and does not attach or remove", async () => {
    const { calls, input } = actions();
    input.upload = async () => {
      calls.push("upload");
      throw new Error("response lost");
    };
    assert.deepEqual(await uploadAndAttachEvidence(input), {
      status: "outcome_unknown",
      attemptId,
    });
    assert.deepEqual(calls, ["preflight", "upload"]);
  });

  test("explicit rejection plus empty metadata read can confirm its exact cleanup", async () => {
    const { calls, input } = actions();
    assert.deepEqual(await uploadAndAttachEvidence(input), {
      status: "not_attached",
      fileCleanup: "confirmed",
      attemptId,
    });
    assert.deepEqual(calls, ["preflight", "upload", "attach", "read", "remove"]);
  });

  for (const failure of ["sdk-error", "thrown-error", "no-op", "list-error"]) {
    test(`${failure} cannot be reported as confirmed cleanup`, async () => {
      const { input } = actions();
      input.remove = async () => {
        if (failure === "thrown-error") throw new Error("network");
        return { failed: failure === "sdk-error", deleted: false };
      };
      input.confirmMissing = async () => {
        if (failure === "list-error") throw new Error("read denied");
        return false;
      };
      assert.deepEqual(await uploadAndAttachEvidence(input), {
        status: "not_attached",
        fileCleanup: "pending",
        attemptId,
      });
    });
  }

  test("a no-op removal is confirmed only by a successful absence read", async () => {
    const { input } = actions();
    input.remove = async () => ({ failed: false, deleted: false });
    assert.deepEqual(await uploadAndAttachEvidence(input), {
      status: "not_attached",
      fileCleanup: "confirmed",
      attemptId,
    });
  });

  for (const attachment of ["accepted", "unknown", "throw"] as const) {
    test(`${attachment} with missing readback never permits deletion`, async () => {
      const { calls, input } = actions();
      input.attach = async () => {
        if (attachment === "throw") throw new Error("lost response");
        return attachment;
      };
      assert.deepEqual(await uploadAndAttachEvidence(input), {
        status: "outcome_unknown",
        attemptId,
      });
      assert.equal(calls.includes("remove"), false);
    });
  }

  test("a late commit after a failed RPC response must keep its bytes", async () => {
    const { calls, input } = actions();
    let releaseCommit!: () => void;
    let committed = false;
    let bytes = true;
    const pendingCommit = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const databaseCommit = pendingCommit.then(() => {
      committed = true;
    });
    input.attach = async () => {
      throw new Error("response lost; transaction still running");
    };
    input.readAttached = async () => ({ state: "missing" });
    input.remove = async () => {
      bytes = false;
      return { failed: false, deleted: true };
    };
    assert.deepEqual(await uploadAndAttachEvidence(input), {
      status: "outcome_unknown",
      attemptId,
    });
    assert.equal(committed, false);
    assert.equal(bytes, true);
    releaseCommit();
    await databaseCommit;
    assert.equal(committed, true);
    assert.equal(bytes, true);
    assert.equal(calls.includes("remove"), false);
  });

  test("committed metadata reconciles a lost RPC response to saved", async () => {
    const { calls, input } = actions();
    input.attach = async () => {
      throw new Error("response lost after commit");
    };
    input.readAttached = async () => ({ state: "found", evidence: "saved-record" });
    assert.deepEqual(await uploadAndAttachEvidence(input), {
      status: "saved",
      evidence: "saved-record",
    });
    assert.equal(calls.includes("remove"), false);
  });

  for (const unreadable of ["unknown", "throw"] as const) {
    test(`a ${unreadable} metadata read blocks cleanup even after explicit rejection`, async () => {
      const { calls, input } = actions();
      input.readAttached = async () => {
        if (unreadable === "throw") throw new Error("session lost");
        return { state: "unknown" };
      };
      assert.deepEqual(await uploadAndAttachEvidence(input), {
        status: "outcome_unknown",
        attemptId,
      });
      assert.equal(calls.includes("remove"), false);
    });
  }

  test("only known SQL refusals are treated as rollback; gateway/network are unknown", () => {
    assert.equal(
      isDefiniteAttachmentRejection({ code: "P0002", message: "SP_TARGET_NOT_FOUND" }),
      true,
    );
    assert.equal(isDefiniteAttachmentRejection({ code: "42501", message: "SP_NOT_HOLDER" }), true);
    assert.equal(
      isDefiniteAttachmentRejection({ code: "23503", message: "foreign key violation" }),
      true,
    );
    for (const code of ["", "PGRST000", "PGRST301", "08006", "57014", "503", "P0001", "42501"]) {
      assert.equal(isDefiniteAttachmentRejection({ code, message: "unknown" }), false);
    }
  });

  test("pending and unknown reach both languages as distinct truthful messages with an opaque reference", () => {
    for (const outcome of [
      { status: "not_attached", fileCleanup: "pending", attemptId },
      { status: "not_attached", fileCleanup: "confirmed", attemptId },
      { status: "outcome_unknown", attemptId },
    ] as const) {
      let issue = evidenceUploadIssue(null);
      try {
        requireSavedEvidence(outcome);
      } catch (cause) {
        issue = evidenceUploadIssue(cause);
      }
      assert.equal(issue.reference, attemptId);
      for (const language of ["sv", "en"] as const) {
        const message = passportT(issue.key, language);
        assert.ok(message.length > 40);
        assert.equal(message.includes(passportT("ev.saved", language)), false);
      }
    }
    assert.deepEqual(evidenceUploadIssue(new Error("network failed")), {
      key: "ev.uploadUnknown",
      reference: null,
    });
    assert.deepEqual(
      evidenceUploadIssue(new Error("SP_EVIDENCE_UPLOAD_CLEANUP_PENDING:<private-url>")),
      { key: "ev.uploadPending", reference: null },
    );
  });
});

/** Actual Supabase SDK transport, intercepted locally. This verifies adapter
 * scope/sequence, not RLS or a running Storage service. Real service proof is
 * recorded separately and must never be inferred from these unit tests. */
function adapterFixture(
  options: {
    readonly target?: boolean;
    readonly committed?: boolean;
    readonly accepted?: boolean;
    readonly rejection?: boolean;
    readonly readDenied?: boolean;
    readonly cleanupFails?: boolean;
    readonly mismatch?: boolean;
    readonly revokedBeforeRead?: boolean;
    readonly revokedBeforeAbsence?: boolean;
    readonly revokedDuringAbsence?: boolean;
    readonly removeNoOp?: boolean;
  } = {},
) {
  const calls: Request[] = [];
  let sessionReads = 0;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const supabase = createClient<Database>("http://127.0.0.1:1", "synthetic-unit-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const request = new Request(url, init);
        calls.push(request);
        const pathname = new URL(request.url).pathname;
        if (pathname === "/rest/v1/sp_claims" || pathname === "/rest/v1/sp_experience_periods")
          return json(options.target === false ? null : { id: claim });
        if (
          request.method === "POST" &&
          pathname === `/storage/v1/object/passport-evidence/${path}`
        )
          return json({ Key: `passport-evidence/${path}`, Id: attemptId });
        if (pathname === "/rest/v1/rpc/sp_passport_session_active") {
          sessionReads++;
          return json(
            !options.revokedBeforeRead &&
              !(options.revokedBeforeAbsence && sessionReads >= 3) &&
              !(options.revokedDuringAbsence && sessionReads >= 4),
          );
        }
        if (pathname === "/rest/v1/rpc/sp_attach_evidence") {
          if (options.rejection)
            return json(
              { code: "P0002", message: "SP_TARGET_NOT_FOUND", details: null, hint: null },
              404,
            );
          if (options.accepted) return json(attemptId);
          throw new Error("synthetic lost RPC response");
        }
        if (pathname === "/rest/v1/sp_evidence") {
          if (options.readDenied) return json({ code: "42501", message: "read denied" }, 403);
          return json(
            options.committed
              ? {
                  id: attemptId,
                  claim_id: options.mismatch ? "different-target" : claim,
                  period_id: null,
                  file_name: "synthetic.pdf",
                  mime_type: "application/pdf",
                  size_bytes: 4,
                  uploaded_at: "2026-10-08",
                  lifecycle_state: "active",
                  sha256: "hash",
                }
              : null,
          );
        }
        if (request.method === "DELETE" && pathname === "/storage/v1/object/passport-evidence")
          return options.cleanupFails
            ? json({ message: "synthetic unavailable" }, 503)
            : json(options.removeNoOp ? [] : [{ name: path }]);
        if (pathname === "/storage/v1/object/list/passport-evidence") return json([]);
        throw new Error(`Unexpected local-only unit transport: ${request.method} ${pathname}`);
      },
    },
  });
  return {
    calls,
    input: {
      supabase,
      userId: holder,
      claimId: claim,
      periodId: null as string | null,
      bucket: "passport-evidence",
      attemptId,
      storagePath: path,
      bytes: Buffer.from("test"),
      fileName: "synthetic.pdf",
      mimeType: "application/pdf",
      sha256: "hash",
    },
  };
}

describe("caller-scoped upload adapter", () => {
  test("missing or invisible own target refuses before upload; both target IDs also refuse", async () => {
    const missing = adapterFixture({ target: false });
    await assert.rejects(uploadOwnedEvidence(missing.input), new RegExp("SP_TARGET_NOT_FOUND"));
    assert.equal(missing.calls.length, 1);
    const targetUrl = new URL(missing.calls[0].url);
    assert.equal(targetUrl.searchParams.get("holder_user_id"), `eq.${holder}`);
    assert.equal(targetUrl.searchParams.get("id"), `eq.${claim}`);
    const ambiguous = adapterFixture();
    await assert.rejects(
      uploadOwnedEvidence({ ...ambiguous.input, periodId: claim }),
      new RegExp("SP_TARGET_AMBIGUOUS"),
    );
    assert.equal(ambiguous.calls.length, 0);
  });

  test("generated path invariant refuses any other folder or object before Storage", async () => {
    const fixture = adapterFixture();
    await assert.rejects(
      uploadOwnedEvidence({ ...fixture.input, storagePath: `${claim}/foreign.pdf` }),
      new RegExp("SP_EVIDENCE_PATH_NOT_OWNED"),
    );
    assert.equal(fixture.calls.length, 0);
  });

  test("SDK cleanup error after real-shaped SQL refusal remains pending and targets exactly one own object", async () => {
    const fixture = adapterFixture({ rejection: true, cleanupFails: true });
    assert.deepEqual(await uploadOwnedEvidence(fixture.input), {
      status: "not_attached",
      fileCleanup: "pending",
      attemptId,
    });
    const removal = fixture.calls.find((request) => request.method === "DELETE");
    assert.deepEqual(await removal?.json(), { prefixes: [path] });
    const metadata = fixture.calls.find(
      (request) => new URL(request.url).pathname === "/rest/v1/sp_evidence",
    );
    assert.equal(new URL(metadata!.url).searchParams.get("holder_user_id"), `eq.${holder}`);
    assert.equal(new URL(metadata!.url).searchParams.get("storage_path"), `eq.${path}`);
  });

  test("committed metadata after response loss returns the existing record and never deletes", async () => {
    const fixture = adapterFixture({ committed: true });
    const result = await uploadOwnedEvidence(fixture.input);
    assert.ok(result.status === "saved");
    assert.equal(result.evidence.id, attemptId);
    assert.equal(result.evidence.claimId, claim);
    assert.equal(
      fixture.calls.some((request) => request.method === "DELETE"),
      false,
    );
  });

  for (const options of [{ revokedBeforeAbsence: true }, { revokedDuringAbsence: true }]) {
    test(`an RLS-hidden empty Storage list is not confirmed absence: ${JSON.stringify(options)}`, async () => {
      const fixture = adapterFixture({ rejection: true, removeNoOp: true, ...options });
      assert.deepEqual(await uploadOwnedEvidence(fixture.input), {
        status: "not_attached",
        fileCleanup: "pending",
        attemptId,
      });
    });
  }

  for (const options of [
    {},
    { accepted: true, readDenied: true },
    { rejection: true, revokedBeforeRead: true },
    { rejection: true, readDenied: true },
    { committed: true, mismatch: true },
  ]) {
    test(`uncertain/mismatched metadata protects bytes: ${JSON.stringify(options)}`, async () => {
      const fixture = adapterFixture(options);
      assert.deepEqual(await uploadOwnedEvidence(fixture.input), {
        status: "outcome_unknown",
        attemptId,
      });
      assert.equal(
        fixture.calls.some((request) => request.method === "DELETE"),
        false,
      );
    });
  }
});
