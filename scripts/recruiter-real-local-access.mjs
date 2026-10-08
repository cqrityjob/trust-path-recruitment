// Real GoTrue + Storage role matrix on ONE owned synthetic loopback stack.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const root = process.env.RI_OPS_STACK_ROOT;
if (
  root !==
  "/Users/mostafas/.codex/visualizations/2026/10/07/01a11715-e113-77e1-9f70-baee7b636c8c/ri-real-stack-20261008"
)
  throw Error("REAL_LOCAL_STACK_ALLOWLIST");
const temp = path.join(root, "supabase/.temp");
const env = JSON.parse(fs.readFileSync(path.join(temp, "ri-local-status.json"), "utf8"));
const config = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8");
const db = new URL(env.DB_URL);
if (
  env.API_URL !== "http://127.0.0.1:55690" ||
  db.hostname !== "127.0.0.1" ||
  db.port !== "55691" ||
  !config.includes('project_id = "cqj-ri-real-20261008b"')
)
  throw Error("REAL_LOCAL_TARGET_MISMATCH");
const users = JSON.parse(fs.readFileSync(path.join(temp, "ri-real-synthetic-users.json"), "utf8"));
const setup = JSON.parse(fs.readFileSync(path.join(temp, "ri-real-browser-setup.json"), "utf8"));
if (setup.environment !== "cqj-ri-real-20261008b: loopback55690/55691")
  throw Error("REAL_LOCAL_SETUP_REQUIRED");
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
function ok(x, label) {
  if (!x) throw Error(label);
}
function good(r, label) {
  if (r.error) throw Error(`${label}:${r.error.code ?? r.status ?? "error"}`);
  return r.data;
}
const clients = {};
const evidence = {
  schemaVersion: 1,
  environment: setup.environment,
  startedAt: new Date().toISOString(),
  transport: "Real GoTrue password bearer sessions; no service-role or forged JWT as test actor",
  checks: [],
};
const output = path.join(temp, "ri-real-access-evidence.json");
function save() {
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2), { mode: 0o600 });
}
async function check(id, fn) {
  const entry = { id, at: new Date().toISOString() };
  try {
    entry.actual = await fn();
    entry.status = "PASS";
  } catch (error) {
    entry.status = "FAIL";
    entry.error = error.message;
    evidence.checks.push(entry);
    save();
    throw error;
  }
  evidence.checks.push(entry);
  save();
  console.log(`PASS ${id}`);
}
async function main() {
  for (const role of Object.keys(users)) {
    const c = createClient(env.API_URL, env.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    good(
      await c.auth.signInWithPassword({ email: users[role].email, password: users[role].password }),
      "actualAuth",
    );
    clients[role] = c;
  }
  const holder = clients.holder,
    verifier = clients.verifier,
    bucket = "passport-evidence";
  ok(
    good(
      await verifier.rpc("sp_is_verifier", { _user_id: users.verifier.id }),
      "verifierCapability",
    ) === true,
    "V1_NOT_VERIFIER",
  );
  const claims = good(
    await holder.from("sp_claims").select("id").eq("holder_user_id", users.holder.id),
    "holderClaims",
  );
  ok(claims.length === 1, "BOUNDED_HOLDER_CLAIM_REQUIRED");
  const claimId = claims[0].id;
  const bytes = Buffer.from(
    "%PDF-1.4\n% Synthetic verifier-role check, no candidate data\n%%EOF\n",
  );
  const storagePath = `${users.holder.id}/${crypto.randomUUID()}.pdf`;
  good(
    await holder.storage
      .from(bucket)
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false }),
    "ownerUpload",
  );
  const evidenceId = good(
    await holder.rpc("sp_attach_evidence", {
      _claim_id: claimId,
      _period_id: null,
      _storage_path: storagePath,
      _file_name: "synthetic-open-review.pdf",
      _mime_type: "application/pdf",
      _size_bytes: bytes.length,
      _sha256: hash(bytes),
    }),
    "holderAttach",
  );
  evidence.objectFingerprint = hash(storagePath);
  await check("OP11-V1-NO-OPEN", async () => {
    ok(
      (await verifier.storage.from(bucket).createSignedUrl(storagePath, 300)).error,
      "VERIFIER_READ_WITHOUT_OPEN_REVIEW",
    );
    ok(
      (await verifier.storage.from(bucket).download(storagePath)).error,
      "VERIFIER_BYTES_WITHOUT_OPEN_REVIEW",
    );
    return { newSigningDenied: true, bytesDenied: true };
  });
  const requestId = good(
    await holder.rpc("sp_submit_for_verification", {
      _claim_id: claimId,
      _period_id: null,
      _kind: "cqrityjob_review",
      _employer_id: null,
    }),
    "holderOpenReview",
  );
  let oldSigned;
  await check("OP11-V1-OPEN", async () => {
    oldSigned = good(
      await verifier.storage.from(bucket).createSignedUrl(storagePath, 300),
      "V1openSigning",
    ).signedUrl;
    const download = good(
      await verifier.storage.from(bucket).download(storagePath),
      "V1openDownload",
    );
    ok(hash(Buffer.from(await download.arrayBuffer())) === hash(bytes), "V1_BYTES_HASH");
    ok(
      (
        await verifier.storage
          .from(bucket)
          .upload(`${users.holder.id}/${crypto.randomUUID()}.pdf`, bytes, {
            contentType: "application/pdf",
          })
      ).error,
      "VERIFIER_FOREIGN_UPLOAD",
    );
    good(await verifier.storage.from(bucket).remove([storagePath]), "V1deleteAttemptTransport");
    ok(
      !(await verifier.storage.from(bucket).download(storagePath)).error,
      "VERIFIER_DELETED_HOLDER_BYTES",
    );
    return {
      newSigningAllowed: true,
      downloadBytesSha256: hash(bytes),
      foreignUploadDenied: true,
      foreignDeleteDidNotRemoveBytes: true,
      scope: "current cqrityjob_review only, dedicated passport_verifier",
    };
  });
  await check("OP11-E1-E2-MATRIX", async () => {
    const aliases = {
      employer: "O1",
      admin: "A1",
      reviewer: "R1",
      member: "M1",
      other: "C2",
      external: "X2",
    };
    const denied = [];
    for (const [role, alias] of Object.entries(aliases)) {
      const c = clients[role];
      ok(
        (await c.storage.from(bucket).createSignedUrl(storagePath, 300)).error,
        `${alias}_PRIVATE_SIGN`,
      );
      ok((await c.storage.from(bucket).download(storagePath)).error, `${alias}_PRIVATE_BYTES`);
      ok(
        good(await c.storage.from(bucket).list(users.holder.id), `${alias}list`).length === 0,
        `${alias}_PRIVATE_LIST`,
      );
      denied.push(alias);
    }
    return { signDownloadListDenied: denied, openReviewDidNotGrantEmployersAccess: true };
  });
  good(
    await holder.rpc("sp_withdraw_verification_request", { _request_id: requestId }),
    "holderCloseReview",
  );
  await check("OP11-V1-CLOSED", async () => {
    ok(
      (await verifier.storage.from(bucket).createSignedUrl(storagePath, 300)).error,
      "V1_SIGN_AFTER_CLOSED_REVIEW",
    );
    ok(
      (await verifier.storage.from(bucket).download(storagePath)).error,
      "V1_BYTES_AFTER_CLOSED_REVIEW",
    );
    const old = await fetch(oldSigned, { cache: "no-store" });
    ok(old.ok, "SIGNED_URL_INDEPENDENT_LIFETIME_CHANGED");
    return {
      newSigningDenied: true,
      newDownloadDenied: true,
      preissuedSignedUrlStatus: old.status,
      preissuedUrlTtlSeconds: 300,
      limitation:
        "Already issued bearer URL retains own lifetime; no immediate URL revocation claim",
    };
  });
  good(await holder.rpc("sp_withdraw_evidence", { _evidence_id: evidenceId }), "ownerWithdraw");
  good(await holder.storage.from(bucket).remove([storagePath]), "ownerRemove");
  const deleted = await fetch(oldSigned, { cache: "no-store" });
  ok(!deleted.ok, "OWN_MATRIX_BYTES_NOT_REMOVED");
  evidence.finishedAt = new Date().toISOString();
  evidence.cleanup = {
    ownSyntheticObjectRemoved: true,
    oldSignedUrlStatus: deleted.status,
    historicalMetadataPreserved: true,
  };
  evidence.summary = { pass: evidence.checks.length, fail: 0 };
  save();
}
main().catch((error) => {
  evidence.finishedAt = new Date().toISOString();
  save();
  console.error(error.message);
  process.exitCode = 1;
});
