import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/database";
import {
  cleanupOwnedUpload,
  listOwnedUploadAttempts,
  resumeOwnedUpload,
  uploadRecoverableEvidence,
} from "../src/lib/security-passport/evidence-upload-recovery-adapter.functions";
import { EvidenceUploadRecoveryView } from "../src/components/security-passport/live/EvidenceUploadRecoveryView";
import { EvidencePanel } from "../src/components/security-passport/live/EvidencePanel";
import { I18nProvider } from "../src/i18n/context";

const holder = "a7090000-0000-4000-8000-000000000001";
const attemptId = "a7090000-3000-4000-8000-000000000001";
const claimId = "a7090000-1000-4000-8000-000000000001";
const path = `${holder}/${attemptId}.pdf`;
const bytes = Buffer.from("test");
const sha256 = createHash("sha256").update(bytes).digest("hex");
function harness() {
  const calls: string[] = [];
  const record = {
    id: "a7090000-5000-4000-8000-000000000001",
    claimId,
    periodId: null,
    fileName: "proof.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4,
    uploadedAt: "2026-10-08T12:00:00Z",
    lifecycleState: "active",
  };
  const a = {
    id: attemptId,
    claimId,
    periodId: null,
    storagePath: path,
    fileName: "proof.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4,
    sha256,
    status: "prepared",
    revision: 1,
    createdAt: "2026-10-08T12:00:00Z",
    updatedAt: "2026-10-08T12:00:00Z",
    evidence: null as typeof record | null,
  };
  const h = {
    calls,
    a,
    record,
    object: true,
    session: true,
    downloadBytes: bytes,
    downloadMime: "application/pdf",
    beginUnknown: false,
    uploadUnknown: false,
    attachUnknown: false,
    attachCommits: true,
    attachRejected: false,
    readUnknown: false,
    fenceUnknown: false,
    lateRegistration: false,
    deleteError: false,
    deleteNoOp: false,
    confirmUnknown: false,
    invalidOwnPath: false,
  };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  const supabase = createClient<Database>("http://127.0.0.1:1", "synthetic-opaque-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (raw, init) => {
        const url = new URL(
          typeof raw === "string" ? raw : raw instanceof URL ? raw.href : raw.url,
        );
        const name = url.pathname.split("/").pop() ?? "";
        if (url.pathname.startsWith("/rest/v1/rpc/")) {
          calls.push(name);
          if (name === "sp_passport_session_active") return json(h.session);
          if (name === "sp_begin_evidence_upload") {
            if (h.beginUnknown) return json({ code: "57014", message: "unknown" }, 503);
            return json(h.invalidOwnPath ? { ...a, storagePath: `other/${attemptId}.pdf` } : a);
          }
          if (name === "sp_list_my_evidence_upload_attempts") return json([a]);
          if (name === "sp_reconcile_evidence_upload") {
            if (h.readUnknown) return json({ code: "57014", message: "unknown" }, 503);
            return json(a);
          }
          if (name === "sp_attach_evidence") {
            if (h.attachCommits && !h.attachRejected) {
              a.status = "registered";
              a.evidence = record;
            }
            if (h.attachUnknown) return json({ code: "57014", message: "unknown" }, 503);
            if (h.attachRejected) return json({ code: "23503", message: "target gone" }, 409);
            return json(record.id);
          }
          if (name === "sp_authorize_evidence_upload_cleanup") {
            if (h.fenceUnknown) return json({ code: "57014", message: "unknown" }, 503);
            if (h.lateRegistration) {
              a.status = "registered";
              a.evidence = record;
            }
            if (!a.evidence && a.status !== "cleaned") a.status = "cleanup_pending";
            return json(a);
          }
          if (name === "sp_confirm_evidence_upload_cleanup") {
            if (h.confirmUnknown || h.object)
              return json({ code: "23514", message: "unconfirmed" }, 409);
            a.status = "cleaned";
            return json(a);
          }
        }
        if (url.pathname === "/storage/v1/object/list/passport-evidence") {
          calls.push("storage:list");
          return json(h.object ? [{ name: `${attemptId}.pdf` }] : []);
        }
        if (url.pathname === "/storage/v1/object/passport-evidence" && init?.method === "DELETE") {
          calls.push("storage:remove");
          assert.deepEqual(JSON.parse(String(init.body)), { prefixes: [path] });
          if (h.deleteError)
            return json({ statusCode: "503", error: "unavailable", message: "unavailable" }, 503);
          if (!h.deleteNoOp) h.object = false;
          return json(h.deleteNoOp ? [] : [{ name: path }]);
        }
        if (
          url.pathname === `/storage/v1/object/passport-evidence/${path}` &&
          init?.method === "POST"
        ) {
          calls.push("storage:upload");
          h.object = true;
          if (h.uploadUnknown)
            return json({ statusCode: "503", error: "unknown", message: "unknown" }, 503);
          return json({ Key: path });
        }
        if (url.pathname === `/storage/v1/object/passport-evidence/${path}`) {
          calls.push("storage:download");
          if (!h.object)
            return json({ statusCode: "404", error: "not_found", message: "not_found" }, 404);
          return new Response(h.downloadBytes, { headers: { "content-type": h.downloadMime } });
        }
        throw new Error(`UNEXPECTED STUB REQUEST: ${url.pathname}`);
      },
    },
  });
  return {
    ...h,
    state: h,
    caller: { supabase, userId: holder },
    upload: {
      supabase,
      userId: holder,
      claimId,
      periodId: null,
      attemptId,
      bytes,
      fileName: "proof.pdf",
      mimeType: "application/pdf",
      sha256,
    },
  };
}

describe("persistent own upload recovery — SDK stub only, no external requests", () => {
  test("journal is persisted before Storage; successful EvidenceRecord stays unchanged", async () => {
    const h = harness();
    assert.deepEqual(await uploadRecoverableEvidence(h.upload), {
      status: "saved",
      evidence: h.record,
    });
    assert.deepEqual(h.calls, [
      "sp_begin_evidence_upload",
      "storage:upload",
      "sp_attach_evidence",
      "sp_reconcile_evidence_upload",
    ]);
  });
  test("an unknown begin or malformed own journal never reaches Storage", async () => {
    for (const flag of ["beginUnknown", "invalidOwnPath"] as const) {
      const h = harness();
      h.state[flag] = true;
      assert.deepEqual(await uploadRecoverableEvidence(h.upload), {
        status: "outcome_unknown",
        attemptId,
      });
      assert.deepEqual(h.calls, ["sp_begin_evidence_upload"]);
    }
  });
  test("unknown upload preserves durable intent, reload lists opaque summary only", async () => {
    const h = harness();
    h.state.uploadUnknown = true;
    assert.deepEqual(await uploadRecoverableEvidence(h.upload), {
      status: "outcome_unknown",
      attemptId,
    });
    const rows = await listOwnedUploadAttempts(h.caller, { claimId: null, periodId: null });
    assert.equal(rows[0].id, attemptId);
    assert.equal(rows[0].status, "prepared");
    const text = JSON.stringify(rows);
    assert.ok(!text.includes(path));
    assert.ok(!text.includes(sha256));
    assert.ok(!text.includes("storagePath"));
    assert.ok(!h.calls.includes("storage:remove"));
  });
  test("explicit resume after reload verifies original bytes and registers once", async () => {
    const h = harness();
    assert.deepEqual(await resumeOwnedUpload(h.caller, attemptId), {
      status: "registered",
      evidence: h.record,
    });
    assert.equal(h.calls.filter((c) => c === "sp_attach_evidence").length, 1);
    assert.deepEqual(await resumeOwnedUpload(h.caller, attemptId), {
      status: "registered",
      evidence: h.record,
    });
    assert.equal(h.calls.filter((c) => c === "sp_attach_evidence").length, 1);
    assert.ok(!h.calls.includes("storage:remove"));
  });
  for (const kind of ["size", "hash", "mime"] as const)
    test(`changed ${kind} bytes never attach or delete`, async () => {
      const h = harness();
      if (kind === "size") h.state.downloadBytes = Buffer.from("oversized");
      if (kind === "hash") h.state.downloadBytes = Buffer.from("evil");
      if (kind === "mime") h.state.downloadMime = "image/png";
      assert.deepEqual(await resumeOwnedUpload(h.caller, attemptId), {
        status: "integrity_mismatch",
        attemptId,
      });
      assert.ok(!h.calls.includes("sp_attach_evidence"));
      assert.ok(!h.calls.includes("storage:remove"));
    });
  test("lost attach response after commit resolves without duplicate or cleanup", async () => {
    const h = harness();
    h.state.attachUnknown = true;
    assert.deepEqual(await resumeOwnedUpload(h.caller, attemptId), {
      status: "registered",
      evidence: h.record,
    });
    assert.ok(!h.calls.includes("storage:remove"));
  });
  test("unknown commit with empty readback never cleans up", async () => {
    const h = harness();
    h.state.attachUnknown = true;
    h.state.attachCommits = false;
    assert.deepEqual(await uploadRecoverableEvidence(h.upload), {
      status: "outcome_unknown",
      attemptId,
    });
    assert.ok(!h.calls.includes("sp_authorize_evidence_upload_cleanup"));
    assert.ok(!h.calls.includes("storage:remove"));
  });
  test("a registration winning before cleanup fence always preserves bytes", async () => {
    const h = harness();
    h.state.lateRegistration = true;
    assert.deepEqual(await cleanupOwnedUpload(h.caller, attemptId), {
      status: "registered",
      evidence: h.record,
    });
    assert.deepEqual(h.calls, ["sp_authorize_evidence_upload_cleanup"]);
    assert.equal(h.state.object, true);
  });
  test("unknown cleanup authorization cannot delete", async () => {
    const h = harness();
    h.state.fenceUnknown = true;
    assert.deepEqual(await cleanupOwnedUpload(h.caller, attemptId), {
      status: "unknown",
      attemptId,
    });
    assert.ok(!h.calls.includes("storage:remove"));
  });
  for (const failure of ["deleteError", "deleteNoOp", "confirmUnknown"] as const)
    test(`${failure} persists fenced cleanup for explicit retry after reload`, async () => {
      const h = harness();
      h.state[failure] = true;
      assert.deepEqual(await cleanupOwnedUpload(h.caller, attemptId), {
        status: "cleanup_pending",
        attemptId,
      });
      assert.equal(h.state.a.status, "cleanup_pending");
      const rows = await listOwnedUploadAttempts(h.caller, { claimId: null, periodId: null });
      assert.equal(rows[0].status, "cleanup_pending");
      h.state[failure] = false;
      assert.deepEqual(await cleanupOwnedUpload(h.caller, attemptId), {
        status: "cleaned",
        attemptId,
      });
      const removes = h.calls.filter((c) => c === "storage:remove").length;
      assert.deepEqual(await cleanupOwnedUpload(h.caller, attemptId), {
        status: "cleaned",
        attemptId,
      });
      assert.equal(h.calls.filter((c) => c === "storage:remove").length, removes);
    });
  test("revoked session cannot turn empty Storage list into cleanup confirmation", async () => {
    const h = harness();
    h.state.session = false;
    assert.deepEqual(await cleanupOwnedUpload(h.caller, attemptId), {
      status: "cleanup_pending",
      attemptId,
    });
    assert.ok(!h.calls.includes("sp_confirm_evidence_upload_cleanup"));
  });
  test("missing file is explicit; resume never silently uploads a substitute", async () => {
    const h = harness();
    h.state.object = false;
    assert.deepEqual(await resumeOwnedUpload(h.caller, attemptId), {
      status: "file_missing",
      attemptId,
    });
    assert.ok(!h.calls.includes("storage:upload"));
    assert.ok(!h.calls.includes("storage:remove"));
  });
  test("rejected original target on resume preserves file until explicit cleanup", async () => {
    const h = harness();
    h.state.attachRejected = true;
    assert.deepEqual(await resumeOwnedUpload(h.caller, attemptId), {
      status: "attachment_rejected",
      attemptId,
    });
    assert.equal(h.state.object, true);
    assert.ok(!h.calls.includes("storage:remove"));
  });
  test("initial definitive rejection cleans only after fence then confirmed absence", async () => {
    const h = harness();
    h.state.attachRejected = true;
    assert.deepEqual(await uploadRecoverableEvidence(h.upload), {
      status: "not_attached",
      fileCleanup: "confirmed",
      attemptId,
    });
    assert.ok(
      h.calls.indexOf("sp_authorize_evidence_upload_cleanup") < h.calls.indexOf("storage:remove"),
    );
    assert.ok(
      h.calls.indexOf("storage:remove") < h.calls.indexOf("sp_confirm_evidence_upload_cleanup"),
    );
  });
  test("withdrawn metadata is registered, never mistaken for orphan cleanup", async () => {
    const h = harness();
    h.state.a.status = "registered";
    h.state.record.lifecycleState = "withdrawn";
    h.state.a.evidence = h.state.record;
    assert.deepEqual(await cleanupOwnedUpload(h.caller, attemptId), {
      status: "registered",
      evidence: h.record,
    });
    assert.ok(!h.calls.includes("storage:remove"));
  });
});

describe("recovery UI render — sv/en without browser/physical mobile claims", () => {
  for (const lang of ["sv", "en"] as const)
    test(`${lang} pending attempt has explicit resume and cleanup after reload`, () => {
      const h = harness();
      const html = renderToStaticMarkup(
        <EvidenceUploadRecoveryView
          attempts={[
            {
              id: attemptId,
              claimId,
              periodId: null,
              fileName: "proof.pdf",
              status: "prepared",
              updatedAt: h.a.updatedAt,
            },
          ]}
          lang={lang}
          loading={false}
          failed={false}
          busy={null}
          message={null}
          onReload={() => {}}
          onResume={() => {}}
          onCleanup={() => {}}
        />,
      );
      assert.ok(html.includes(lang === "sv" ? "Kontrollera och återuppta" : "Check and resume"));
      assert.ok(
        html.includes(lang === "sv" ? "Ta bort oregistrerad fil" : "Remove unregistered file"),
      );
      assert.ok(html.includes("proof.pdf"));
      assert.ok(!html.includes(path));
      assert.ok(!html.includes(sha256));
    });
  test("fenced cleanup only offers retry and never resume", () => {
    const h = harness();
    h.a.status = "cleanup_pending";
    const html = renderToStaticMarkup(
      <EvidenceUploadRecoveryView
        attempts={[h.a as never]}
        lang="sv"
        loading={false}
        failed={false}
        busy={null}
        message="cleanup_pending"
        onReload={() => {}}
        onResume={() => {}}
        onCleanup={() => {}}
      />,
    );
    assert.ok(html.includes("Försök borttagning igen"));
    assert.ok(!html.includes("Kontrollera och återuppta</button>"));
  });
  test("persistent pending state disables fresh upload after component remount", () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLang="sv">
        <EvidencePanel
          evidence={[]}
          canAdd
          canRemove
          uploadRecoveryPending
          onUpload={async () => {}}
          onOpen={async () => {}}
          onWithdraw={async () => {}}
        />
      </I18nProvider>,
    );
    assert.ok(/<input[^>]*type="file"[^>]*disabled=""/.test(html));
  });
});

describe("actual operational probe target guard — zero external calls", () => {
  test("hosted URL and privileged key are refused before Auth/Storage requests", async () => {
    const { verifyIsolatedUploadRecovery } = await import("./passport-upload-recovery-operational");
    let requests = 0;
    const client = createClient<Database>("http://127.0.0.1:55690", "synthetic", {
      global: {
        fetch: async () => {
          requests++;
          throw new Error("FORBIDDEN_EXTERNAL_REQUEST");
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const service = `e30.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.synthetic`;
    const base = {
      owner: client,
      otherHolder: client,
      ownerId: holder,
      claimId,
      publicAnonKey: service,
    };
    await assert.rejects(
      verifyIsolatedUploadRecovery({ ...base, apiUrl: "https://wrygicdfxwjnrugduxnt.supabase.co" }),
      /OP09_PROBE_REQUIRES_ISOLATED_LOOPBACK/,
    );
    await assert.rejects(
      verifyIsolatedUploadRecovery({ ...base, apiUrl: "http://127.0.0.1:55690" }),
      /OP09_PROBE_REQUIRES_ANON_KEY/,
    );
    assert.equal(requests, 0);
  });
});
