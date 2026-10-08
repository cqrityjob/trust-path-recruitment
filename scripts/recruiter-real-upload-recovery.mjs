// Bounded real local Auth/Storage adapter proof. Run with Bun; never hosted.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import cp from "node:child_process";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
const root =
  "/Users/mostafas/.codex/visualizations/2026/10/07/01a11715-e113-77e1-9f70-baee7b636c8c/ri-real-stack-20261008";
if (process.env.RI_OPS_STACK_ROOT !== root) throw Error("REAL_LOCAL_STACK_ALLOWLIST");
const temp = path.join(root, "supabase/.temp");
for (const file of ["ri-local-status.json", "ri-real-synthetic-users.json"])
  if (fs.statSync(path.join(temp, file)).mode & 0o077) throw Error("PRIVATE_INPUT_REQUIRED");
const env = JSON.parse(fs.readFileSync(path.join(temp, "ri-local-status.json"), "utf8"));
const users = JSON.parse(fs.readFileSync(path.join(temp, "ri-real-synthetic-users.json"), "utf8"));
const db = new URL(env.DB_URL);
if (
  env.API_URL !== "http://127.0.0.1:55690" ||
  db.hostname !== "127.0.0.1" ||
  db.port !== "55691" ||
  !fs
    .readFileSync(path.join(root, "supabase/config.toml"), "utf8")
    .includes('project_id = "cqj-ri-real-20261008b"')
)
  throw Error("REAL_LOCAL_TARGET_MISMATCH");
const helperRoot = "/private/tmp/ri-live-20261008/upload-recovery";
const helperSha = "79db9f87cb3dee2cf7382e116b0472b3df9dc029";
const actualSha = cp
  .execFileSync("git", ["rev-parse", "HEAD"], { cwd: helperRoot, encoding: "utf8" })
  .trim();
if (
  actualSha !== helperSha ||
  cp
    .execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
      cwd: helperRoot,
      encoding: "utf8",
    })
    .trim()
)
  throw Error("FROZEN_HELPER_REQUIRED");
const { uploadOwnedEvidence } = await import(
  pathToFileURL(path.join(helperRoot, "src/lib/security-passport/evidence-upload-adapter.ts")).href
);
const bytes = Buffer.from(
  "%PDF-1.4\n% CQrityjob local synthetic recovery proof\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n",
);
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const evidence = {
  schemaVersion: 1,
  at: new Date().toISOString(),
  environment: "cqj-ri-real-20261008b: loopback55690/55691",
  helperSourceSha: helperSha,
  scope:
    "Actual caller-authenticated GoTrue/Storage/PostgREST and frozen adapter with explicitly labelled client transport faults. No app HTTP/browser/hosted result, no service-role test actor, no schema/grant/worker changes.",
  checks: [],
};
const output = path.join(temp, "ri-real-upload-recovery.json");
function save() {
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2), { mode: 0o600 });
}
function good(result, label) {
  if (result.error) throw Error(`${label}:${result.error.code ?? result.status ?? "error"}`);
  return result.data;
}
function assert(condition, label) {
  if (!condition) throw Error(label);
}
function client(fetcher) {
  return createClient(env.API_URL, env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(fetcher ? { global: { fetch: fetcher } } : {}),
  });
}
async function login(c) {
  good(
    await c.auth.signInWithPassword({ email: users.holder.email, password: users.holder.password }),
    "real-password-login",
  );
  return c;
}
async function missing(c, storagePath) {
  const part = storagePath.lastIndexOf("/");
  const list = good(
    await c.storage
      .from("passport-evidence")
      .list(storagePath.slice(0, part), { search: storagePath.slice(part + 1), limit: 100 }),
    "list-own-object",
  );
  return !list.some((row) => row.name === storagePath.slice(part + 1));
}
const holder = await login(client());
const claimId = good(
  await holder.rpc("sp_save_international_credential", {
    _input: {
      definition_code: "INTL_ASIS_CPP",
      market_country: "",
      market_region: "",
      identifier: `LOCAL-RECOVERY-${crypto.randomUUID()}`,
      issued_on: "2026-01-01",
      valid_until: "2028-01-01",
      no_expiry: false,
    },
  }),
  "create-own-synthetic-credential",
);
const cases = [
  "missing-preflight",
  "reject-cleanup-confirmed",
  "reject-cleanup503-pending",
  "committed-reply-lost",
  "committed-reply-lost-read-denied",
  "ordinary-success",
  "revoked-after-preflight",
];
for (const mode of cases) {
  const attemptId = crypto.randomUUID();
  const storagePath = `${users.holder.id}/${attemptId}.pdf`;
  const metrics = {
    storagePosts: 0,
    attachCalls: 0,
    deleteCalls: 0,
    readbackStatuses: [],
    attachActualStatuses: [],
  };
  let control;
  let attachmentSeen = false;
  const actor = await login(
    client(async (input, init) => {
      let request = new Request(input, init);
      const u = new URL(request.url);
      assert(u.origin === env.API_URL, "NON_LOCAL_TRANSPORT_REFUSED");
      if (
        request.method === "POST" &&
        u.pathname.startsWith("/storage/v1/object/passport-evidence")
      )
        metrics.storagePosts++;
      if (
        request.method === "DELETE" &&
        u.pathname.startsWith("/storage/v1/object/passport-evidence")
      ) {
        metrics.deleteCalls++;
        if (mode === "reject-cleanup503-pending")
          return new Response(
            JSON.stringify({
              message: "Local test-only remove503",
              statusCode: "503",
              error: "Injected",
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
      }
      if (u.pathname === "/rest/v1/rpc/sp_attach_evidence") {
        metrics.attachCalls++;
        attachmentSeen = true;
        if (mode.startsWith("reject-")) {
          const data = await request.clone().json();
          data._claim_id = crypto.randomUUID();
          request = new Request(request.url, {
            method: "POST",
            headers: request.headers,
            body: JSON.stringify(data),
          });
        }
        if (mode === "revoked-after-preflight")
          good(await control.auth.signOut({ scope: "global" }), "real-global-signout");
        const result = await fetch(request);
        metrics.attachActualStatuses.push(result.status);
        if (mode.startsWith("committed-reply-lost")) {
          assert(result.ok, "ATTACH_NOT_COMMITTED_BEFORE_LOSS");
          await result.clone().json();
          throw Error("Test-only reply loss after actual attach completed");
        }
        return result;
      }
      if (attachmentSeen && request.method === "GET" && u.pathname === "/rest/v1/sp_evidence") {
        if (mode === "committed-reply-lost-read-denied") {
          const headers = new Headers(request.headers);
          headers.delete("authorization");
          request = new Request(request.url, { method: "GET", headers });
        }
        const result = await fetch(request);
        metrics.readbackStatuses.push(result.status);
        return result;
      }
      return fetch(request);
    }),
  );
  control = client();
  good(
    await control.auth.setSession(good(await actor.auth.getSession(), "actor-session").session),
    "control-same-session",
  );
  const entry = {
    id: mode,
    at: new Date().toISOString(),
    attemptFingerprint: hash(storagePath),
    fault: mode.startsWith("reject-")
      ? "Actual RPC target rewritten to missing synthetic UUID after genuine preflight; actual SQL P0002; optional client DELETE503"
      : mode.startsWith("committed-reply-lost")
        ? "Actual RPC commit observed then reply discarded; optional bearer removed only for metadata read"
        : mode === "revoked-after-preflight"
          ? "Actual global signOut after genuine preflight/upload, before actual metadata RPC"
          : "none",
  };
  try {
    let outcome;
    if (mode === "missing-preflight") {
      let rejected = false;
      try {
        await uploadOwnedEvidence({
          supabase: actor,
          userId: users.holder.id,
          claimId: crypto.randomUUID(),
          periodId: null,
          bucket: "passport-evidence",
          attemptId,
          storagePath,
          bytes,
          fileName: "synthetic-recovery.pdf",
          mimeType: "application/pdf",
          sha256: hash(bytes),
        });
      } catch {
        rejected = true;
      }
      assert(
        rejected && metrics.storagePosts === 0 && metrics.attachCalls === 0,
        "PREFLIGHT_MUST_PREVENT_UPLOAD",
      );
      outcome = { status: "preflight-rejected" };
    } else {
      outcome = await uploadOwnedEvidence({
        supabase: actor,
        userId: users.holder.id,
        claimId,
        periodId: null,
        bucket: "passport-evidence",
        attemptId,
        storagePath,
        bytes,
        fileName: "synthetic-recovery.pdf",
        mimeType: "application/pdf",
        sha256: hash(bytes),
      });
      if (mode === "reject-cleanup-confirmed")
        assert(
          outcome.status === "not_attached" &&
            outcome.fileCleanup === "confirmed" &&
            (await missing(holder, storagePath)),
          "CONFIRMED_REQUIRES_ACTUAL_ABSENCE",
        );
      if (mode === "reject-cleanup503-pending")
        assert(
          outcome.status === "not_attached" &&
            outcome.fileCleanup === "pending" &&
            !(await missing(holder, storagePath)),
          "REAL_ORPHAN_MUST_STAY_PENDING",
        );
      if (["committed-reply-lost", "ordinary-success"].includes(mode))
        assert(
          outcome.status === "saved" &&
            metrics.deleteCalls === 0 &&
            !(await missing(holder, storagePath)),
          "COMMITTED_BYTES_MUST_NOT_BE_DELETED",
        );
      if (mode === "committed-reply-lost-read-denied")
        assert(
          outcome.status === "outcome_unknown" &&
            metrics.deleteCalls === 0 &&
            metrics.readbackStatuses.some((code) => code === 401 || code === 403) &&
            !(await missing(holder, storagePath)),
          "UNKNOWN_PERMISSION_READ_MUST_NOT_DELETE",
        );
      if (mode === "revoked-after-preflight")
        assert(
          outcome.status === "outcome_unknown" ||
            (outcome.status === "not_attached" && outcome.fileCleanup === "pending"),
          "REVOKED_EMPTY_READ_CANNOT_CONFIRM",
        );
    }
    entry.actual = { outcome: outcome.status, cleanup: outcome.fileCleanup ?? null, ...metrics };
    entry.status = "PASS";
  } catch (error) {
    entry.status = "FAIL";
    entry.error = error.message;
    evidence.checks.push(entry);
    save();
    throw Error(`REAL_RECOVERY_FAIL:${mode}:${entry.error}`);
  } finally {
    // Cleanup is its own explicit authenticated action; never erase metadata.
    const cleanup = await login(client());
    const row = good(
      await cleanup
        .from("sp_evidence")
        .select("id,lifecycle_state")
        .eq("holder_user_id", users.holder.id)
        .eq("storage_path", storagePath)
        .maybeSingle(),
      "own-cleanup-read",
    );
    if (row?.lifecycle_state === "active")
      good(
        await cleanup.rpc("sp_withdraw_evidence", { _evidence_id: row.id }),
        "own-cleanup-withdrawal",
      );
    good(
      await cleanup.storage.from("passport-evidence").remove([storagePath]),
      "own-cleanup-remove",
    );
    entry.setupCleanupConfirmed = await missing(cleanup, storagePath);
    assert(entry.setupCleanupConfirmed, "LOCAL_TEST_CLEANUP_NOT_CONFIRMED");
  }
  evidence.checks.push(entry);
  save();
  console.log(`PASS ${mode}`);
}
evidence.completedAt = new Date().toISOString();
save();
console.log(`REAL_LOCAL_RECOVERY ${evidence.checks.length}/${cases.length} PASS`);
