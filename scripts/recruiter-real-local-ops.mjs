// Bounded real GoTrue + Storage proof. Never resolves repository production env.
// This is direct-service verification, not a published-runtime/browser proof.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import cp from "node:child_process";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const stackRoot = process.env.RI_OPS_STACK_ROOT;
const expectedRoot =
  "/Users/mostafas/.codex/visualizations/2026/10/07/01a11715-e113-77e1-9f70-baee7b636c8c/ri-real-stack-20261008";
if (stackRoot !== expectedRoot) throw Error("REAL_LOCAL_STACK_ALLOWLIST");
const temp = path.join(stackRoot, "supabase/.temp");
const env = JSON.parse(fs.readFileSync(path.join(temp, "ri-local-status.json"), "utf8"));
const config = fs.readFileSync(path.join(stackRoot, "supabase/config.toml"), "utf8");
if (
  env.API_URL !== "http://127.0.0.1:55690" ||
  !config.includes('project_id = "cqj-ri-real-20261008b"') ||
  !config.includes("jwt_expiry = 120")
)
  throw Error("REAL_LOCAL_TARGET_MISMATCH");
const dbUrl = new URL(env.DB_URL);
if (dbUrl.hostname !== "127.0.0.1" || dbUrl.port !== "55691" || dbUrl.pathname !== "/postgres")
  throw Error("REAL_LOCAL_DATABASE_ALLOWLIST");
const secrets = Object.values(env).filter((x) => typeof x === "string" && x.length > 20);
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
const redact = (message) => {
  let safe = String(message);
  for (const secret of secrets) safe = safe.split(secret).join("[redacted]");
  return safe
    .replace(/eyJ[A-Za-z0-9_.-]+/g, "[jwt-redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/\S+\?(?:\S+)/g, "[signed-url-redacted]");
};
const evidencePath = path.join(temp, "ri-real-ops-evidence.json");
const newEvidence = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  environment: "cqj-ri-real-20261008b: loopback55690/55691",
  productSourceSha: "0683d5d961b03668e8d4e6fe56d676e07b656566",
  scope:
    "Local real GoTrue, PostgREST and Storage with synthetic accounts; actual pinned withdrawal helper and direct authenticated transport. No published-runtime, app-server, browser-cache or physical-device claim.",
  versions: {
    cli: "2.111.0",
    gotrue: "2.194.0",
    storage: "1.67.20",
    postgrest: "14.15",
    postgresImage: "17.6.1.156",
  },
  checks: [],
};
const resume = process.env.RI_OPS_RESUME === "expiry";
if (process.env.RI_OPS_RESUME && !resume) throw Error("UNKNOWN_LOCAL_RESUME_MODE");
const evidence = resume ? JSON.parse(fs.readFileSync(evidencePath, "utf8")) : newEvidence;
if (resume) {
  if (evidence.environment !== newEvidence.environment) throw Error("RESUME_WRONG_TARGET");
  const prior = path.join(temp, `ri-real-ops-first-attempt-${Date.now()}.json`);
  fs.copyFileSync(evidencePath, prior);
  fs.chmodSync(prior, 0o600);
  evidence.resumedAt = new Date().toISOString();
  evidence.previousExactExpiryFailureObservation = {
    actualStatus: 200,
    measuredAt: "exp+approximately1.5seconds",
    originalAssertion: "401 immediately after exp",
    retainedOriginalResult: "FAIL",
    source: "first attempt OP06; no configuration changed",
  };
}
function save() {
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), { mode: 0o600 });
}
function ok(value, message) {
  if (!value) throw Error(message);
}
function good(result, label = "API") {
  if (result.error)
    throw Error(
      `${label}:${result.error.code ?? result.status ?? "error"}:${result.error.message}`,
    );
  return result.data;
}
async function check(id, name, run) {
  const entry = { id, name, at: new Date().toISOString() };
  try {
    entry.actual = (await run()) ?? {};
    entry.status = "PASS";
  } catch (error) {
    entry.status = "FAIL";
    entry.error = redact(error.message);
    evidence.checks.push(entry);
    save();
    console.log(`FAIL ${id} ${name}: ${entry.error}`);
    throw error;
  }
  evidence.checks.push(entry);
  save();
  console.log(`PASS ${id} ${name}`);
}
function sql(query) {
  return cp
    .execFileSync(
      "/opt/homebrew/opt/postgresql@16/bin/psql",
      ["-At", "-v", "ON_ERROR_STOP=1", "-c", query],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PGHOST: "127.0.0.1",
          PGPORT: "55691",
          PGUSER: decodeURIComponent(dbUrl.username),
          PGPASSWORD: decodeURIComponent(dbUrl.password),
          PGDATABASE: "postgres",
        },
      },
    )
    .trim();
}
function jwt(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
}
function client(fetcher) {
  return createClient(env.API_URL, env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(fetcher ? { global: { fetch: fetcher } } : {}),
  });
}
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const users = {};
const roleClients = {};
const bucketName = "passport-evidence";
const bytes = Buffer.from(
  "%PDF-1.4\n% CQrityjob synthetic local operational proof\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n",
);
const bytesHash = hash(bytes);
async function attach(c, uid, claimId, label) {
  const storagePath = `${uid}/${crypto.randomUUID()}.pdf`;
  good(
    await c.storage
      .from(bucketName)
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false }),
    "Storage upload",
  );
  const id = good(
    await c.rpc("sp_attach_evidence", {
      _claim_id: claimId,
      _period_id: null,
      _storage_path: storagePath,
      _file_name: `${label}.pdf`,
      _mime_type: "application/pdf",
      _size_bytes: bytes.length,
      _sha256: bytesHash,
    }),
    "evidence attach",
  );
  return { id, storagePath };
}
async function missing(c, storagePath) {
  const split = storagePath.lastIndexOf("/");
  const result = await c.storage
    .from(bucketName)
    .list(storagePath.slice(0, split), { search: storagePath.slice(split + 1), limit: 100 });
  return (
    !result.error &&
    result.data !== null &&
    !result.data.some((x) => x.name === storagePath.slice(split + 1))
  );
}
const withdrawalModule = path.join(temp, "evidence-withdrawal-0683.ts");
if (
  hash(fs.readFileSync(withdrawalModule)) !==
  "dc52256834ef55ba5d6ebad847bc253daf9320318e7951ec06e65d6a743363c9"
)
  throw Error("PINNED_WITHDRAWAL_SOURCE_MISMATCH");
const { withdrawAndDeleteEvidence } = await import(pathToFileURL(withdrawalModule).href);
evidence.withdrawalModuleSha256 = hash(fs.readFileSync(withdrawalModule));
async function withdraw(c, ev) {
  const row = good(
    await c.from("sp_evidence").select("lifecycle_state").eq("id", ev.id).single(),
    "withdraw read",
  );
  return withdrawAndDeleteEvidence({
    withdraw: async () => {
      if (row.lifecycle_state !== "withdrawn")
        good(await c.rpc("sp_withdraw_evidence", { _evidence_id: ev.id }), "withdraw RPC");
    },
    remove: async () => {
      const r = await c.storage.from(bucketName).remove([ev.storagePath]);
      return {
        failed: r.error !== null,
        deleted: (r.data ?? []).some((x) => x.name === ev.storagePath),
      };
    },
    confirmMissing: () => missing(c, ev.storagePath),
  });
}
async function rest(token, resource) {
  const r = await fetch(`${env.API_URL}/rest/v1/${resource}`, {
    headers: { apikey: env.ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await r.json();
  return { status: r.status, body };
}
function baseline() {
  const state = JSON.parse(
    sql(
      "SELECT json_build_object('ai_enabled',(SELECT ai_enabled FROM public.scp_interview_ai_config WHERE id),'transcript_enabled',(SELECT transcript_enabled FROM public.scp_interview_ai_config WHERE id),'ai_runs',(SELECT count(*) FROM public.scp_interview_ai_runs),'sw_ai_runs',(SELECT count(*) FROM public.sw_ai_runs),'email_tables',(SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]'::json) FROM pg_tables WHERE schemaname='public' AND tablename ~ '(email|outbox|retention)'))",
    ),
  );
  state.cronJobs =
    sql("SELECT to_regclass('cron.job') IS NOT NULL") === "t"
      ? Number(sql("SELECT count(*) FROM cron.job"))
      : 0;
  state.emailAndRetentionCounts = Object.fromEntries(
    state.email_tables.map((table) => {
      if (!/^[a-z_]+$/.test(table)) throw Error("UNEXPECTED_MAIL_TABLE");
      return [table, Number(sql(`SELECT count(*) FROM public.${table}`))];
    }),
  );
  // These product tables carry side effects but their names do not contain
  // email/outbox/retention. Keep explicit counters, independent of name search.
  state.recruitmentMessages = Number(sql("SELECT count(*) FROM public.recruitment_messages"));
  state.emailDeliveryAttempts = Number(
    sql("SELECT coalesce(sum(email_attempts),0) FROM public.recruitment_messages"),
  );
  state.erasureJobs = Number(sql("SELECT count(*) FROM public.recruitment_erasure_jobs"));
  state.storageCleanupRows = Number(sql("SELECT count(*) FROM public.storage_erasure_queue"));
  return state;
}
async function main() {
  if (resume) return resumeExpiries();
  await check("OP-01", "Exact local target and complete canonical schema", async () => {
    const state = JSON.parse(
      sql(
        "SELECT json_build_object('version',current_setting('server_version'),'migrations',(SELECT count(*) FROM supabase_migrations.schema_migrations),'last',(SELECT max(version) FROM supabase_migrations.schema_migrations),'users',(SELECT count(*) FROM auth.users))",
      ),
    );
    ok(state.migrations === 383 && state.last === "20270306090000", "SCHEMA_PARITY");
    ok(state.users === 0, "SYNTHETIC_EMPTY_AUTH_REQUIRED");
    evidence.baseline = baseline();
    ok(
      !evidence.baseline.ai_enabled && !evidence.baseline.transcript_enabled,
      "AI_OR_TRANSCRIPT_ENABLED",
    );
    return state;
  });
  for (const role of [
    "holder",
    "other",
    "employer",
    "admin",
    "reviewer",
    "member",
    "external",
    "verifier",
  ]) {
    const email = `ri-real-${role}-${crypto.randomUUID()}@fixture.invalid`,
      password = crypto.randomBytes(32).toString("base64url");
    const user = good(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
      "Auth admin synthetic create",
    ).user;
    const c = client();
    const login = good(await c.auth.signInWithPassword({ email, password }), "GoTrue password");
    users[role] = { id: user.id, email, password, session: login.session };
    roleClients[role] = c;
    secrets.push(password, login.session.access_token, login.session.refresh_token);
  }
  fs.writeFileSync(path.join(temp, "ri-real-synthetic-users.json"), JSON.stringify(users), {
    mode: 0o600,
  });
  const { holder, other, employer } = roleClients;
  const uid = users.holder.id;
  await check(
    "OP-02",
    "Real GoTrue sessions and invalid password/missing/tampered bearer",
    async () => {
      const claims = jwt(users.holder.session.access_token);
      const header = JSON.parse(
        Buffer.from(users.holder.session.access_token.split(".")[0], "base64url"),
      );
      ok(claims.exp - claims.iat === 120 && claims.session_id, "ACTUAL_JWT_TTL");
      ok(
        (
          await client().auth.signInWithPassword({
            email: users.holder.email,
            password: "wrong-local-password",
          })
        ).error,
        "INVALID_PASSWORD_ADMITTED",
      );
      good(
        await holder.from("sp_passport_profiles").insert({ holder_user_id: uid }),
        "Passport profile",
      );
      good(
        await other.from("sp_passport_profiles").insert({ holder_user_id: users.other.id }),
        "Other Passport profile",
      );
      const missingBearer = await rest(null, "sp_passport_profiles?select=holder_user_id");
      ok(
        missingBearer.status !== 200 || missingBearer.body.length === 0,
        "ANONYMOUS_PRIVATE_PAYLOAD",
      );
      const token = users.holder.session.access_token;
      const parts = token.split(".");
      parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
      const altered = await rest(parts.join("."), "sp_passport_profiles?select=holder_user_id");
      ok(altered.status === 401, "TAMPERED_SIGNATURE_ADMITTED");
      return {
        jwtAlgorithm: header.alg,
        issuer: claims.iss,
        accessTtlSeconds: claims.exp - claims.iat,
        actorFingerprint: hash(uid).slice(0, 12),
        missingBearerStatus: missingBearer.status,
        tamperedStatus: altered.status,
        externalEmailSent: false,
      };
    },
  );
  const claimId = good(
    await holder.rpc("sp_save_international_credential", {
      _input: {
        definition_code: "INTL_ASIS_CPP",
        market_country: "",
        market_region: "",
        identifier: "LOCAL-SYNTHETIC",
        issued_on: "2026-01-01",
        valid_until: "2028-01-01",
        no_expiry: false,
      },
    }),
    "create credential",
  );
  let ev, signed, signedCreatedAt, expiryEv, expiryUrl;
  await check("OP-08", "Real owner upload, metadata/hash and DOCUMENT_PROVIDED", async () => {
    ev = await attach(holder, uid, claimId, "synthetic-local");
    const metadata = good(
      await holder
        .from("sp_evidence")
        .select("sha256,size_bytes,lifecycle_state")
        .eq("id", ev.id)
        .single(),
    );
    const downloaded = good(await holder.storage.from(bucketName).download(ev.storagePath));
    ok(
      hash(Buffer.from(await downloaded.arrayBuffer())) === bytesHash &&
        metadata.sha256 === bytesHash &&
        metadata.size_bytes === bytes.length,
      "BYTES_METADATA_MISMATCH",
    );
    const claim = good(
      await holder.from("sp_claims").select("assertion_level").eq("id", claimId).single(),
    );
    ok(claim.assertion_level === "document_provided", "UPLOAD_PROMOTED_VERIFICATION");
    return {
      bytesSha256: bytesHash,
      sizeBytes: bytes.length,
      assertionLevel: claim.assertion_level,
      objectFingerprint: hash(ev.storagePath),
    };
  });
  await check(
    "OP-11",
    "Private Storage owner signing and foreign upload/read/sign denial",
    async () => {
      ok(good(await other.storage.from(bucketName).list(uid)).length === 0, "FOREIGN_STORAGE_LIST");
      ok(
        (await other.storage.from(bucketName).download(ev.storagePath)).error,
        "FOREIGN_STORAGE_BYTES",
      );
      ok(
        (await other.storage.from(bucketName).createSignedUrl(ev.storagePath, 300)).error,
        "FOREIGN_STORAGE_SIGN",
      );
      ok(
        (
          await other.storage
            .from(bucketName)
            .upload(`${uid}/${crypto.randomUUID()}.pdf`, bytes, { contentType: "application/pdf" })
        ).error,
        "FOREIGN_STORAGE_UPLOAD",
      );
      ok(
        (await employer.storage.from(bucketName).createSignedUrl(ev.storagePath, 300)).error,
        "UNENTITLED_EMPLOYER_SIGN",
      );
      const publicRead = await fetch(
        `${env.API_URL}/storage/v1/object/public/${bucketName}/${ev.storagePath}`,
      );
      ok(!publicRead.ok, "PRIVATE_BUCKET_PUBLIC");
      signed = good(
        await holder.storage.from(bucketName).createSignedUrl(ev.storagePath, 300),
      ).signedUrl;
      signedCreatedAt = Date.now();
      secrets.push(signed);
      const read = await fetch(signed);
      ok(
        read.ok && hash(Buffer.from(await read.arrayBuffer())) === bytesHash,
        "SIGNED_BYTES_MISMATCH",
      );
      evidence.signedUrl = {
        fingerprint: hash(signed),
        ttlSeconds: 300,
        createdAt: new Date(signedCreatedAt).toISOString(),
        initialStatus: read.status,
        cacheControl: read.headers.get("cache-control"),
        smartCdn: "not present on local origin; hosted cache NOT RUN",
      };
      expiryEv = await attach(holder, uid, claimId, "signed-expiry-local");
      expiryUrl = good(
        await holder.storage.from(bucketName).createSignedUrl(expiryEv.storagePath, 300),
      ).signedUrl;
      secrets.push(expiryUrl);
      return {
        publicStatus: publicRead.status,
        signedStatus: read.status,
        signedUrlFingerprint: hash(signed),
      };
    },
  );
  await check("OP-14", "Real owner revoke ends current recipient session/new handoff", async () => {
    const share = good(
      await holder.rpc("sp_create_credential_disclosure_v2", {
        _claim_ids: [claimId],
        _fields: [],
        _expires_days: 7,
        _purpose: "Synthetic local operational check",
        _recipient_hint: null,
        _locale: "en",
        _request_key: crypto.randomUUID(),
      }),
    );
    const handoff = crypto.randomBytes(32).toString("hex"),
      session = crypto.randomBytes(32).toString("hex");
    secrets.push(share.token, handoff, session);
    ok(
      good(
        await admin.rpc("sp_share_gateway_issue", {
          _token: share.token,
          _handoff_hash: hash(handoff),
        }),
      ) === true,
      "GATEWAY_ISSUE",
    );
    ok(
      good(
        await admin.rpc("sp_share_gateway_consume", {
          _handoff: handoff,
          _session_hash: hash(session),
        }),
      ) === true,
      "GATEWAY_CONSUME",
    );
    ok(
      good(await admin.rpc("sp_get_disclosure_session", { _session: session })).status === "active",
      "RECIPIENT_SESSION_NOT_ACTIVE",
    );
    good(await holder.rpc("sp_revoke_disclosure", { _id: share.disclosure_id }), "owner revoke");
    ok(
      good(await admin.rpc("sp_get_disclosure_session", { _session: session })).status ===
        "unavailable",
      "REVOKED_SESSION_READ",
    );
    ok(
      good(
        await admin.rpc("sp_share_gateway_issue", {
          _token: share.token,
          _handoff_hash: hash(crypto.randomBytes(32)),
        }),
      ) === false,
      "REVOKED_HANDOFF_ISSUED",
    );
    const oldUrl = await fetch(signed);
    ok(oldUrl.ok, "LOCAL_SIGNED_URL_SEMANTICS_CHANGED");
    return {
      recipientAfterRevoke: "unavailable",
      newHandoff: false,
      preissuedSignedUrlAfterDisclosureRevoke: oldUrl.status,
      gatewayTransport: "real privileged gateway RPCs, not Edge/app HTTP",
    };
  });
  await check(
    "OP-13",
    "Withdraw/delete: actual helper, real bytes removal and old link refusal",
    async () => {
      const result = await withdraw(holder, ev);
      ok(result.accessWithdrawn && result.fileDeletion === "confirmed", "DELETE_NOT_CONFIRMED");
      ok(await missing(holder, ev.storagePath), "STORAGE_OBJECT_STILL_PRESENT");
      ok(
        good(await holder.from("sp_evidence").select("lifecycle_state").eq("id", ev.id).single())
          .lifecycle_state === "withdrawn",
        "WITHDRAWAL_NOT_DURABLE",
      );
      ok(
        (await holder.storage.from(bucketName).createSignedUrl(ev.storagePath, 300)).error,
        "DELETED_OBJECT_RE_SIGNED",
      );
      const old = await fetch(signed);
      ok(!old.ok, "DELETED_OBJECT_OLD_URL_READ");
      return {
        ...result,
        oldSignedUrlStatus: old.status,
        objectMissing: true,
        scope: "local origin deletion; no hosted CDN propagation claim",
      };
    },
  );
  await check(
    "OP-13-FAULT",
    "Storage DELETE503 leaves withdrawal durable and retry deletes real bytes",
    async () => {
      const retryEv = await attach(holder, uid, claimId, "retry-local");
      let injected = 0;
      const faulty = client(async (input, init) => {
        const request = new Request(input, init);
        if (
          request.method === "DELETE" &&
          new URL(request.url).pathname.startsWith("/storage/v1/object/passport-evidence")
        ) {
          injected++;
          return new Response(
            JSON.stringify({
              message: "Synthetic local remove failure",
              statusCode: "503",
              error: "Injected",
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }
        return fetch(request);
      });
      good(
        await faulty.auth.setSession({
          access_token: users.holder.session.access_token,
          refresh_token: users.holder.session.refresh_token,
        }),
      );
      const first = await withdraw(faulty, retryEv);
      ok(injected > 0 && first.fileDeletion === "pending", "REMOVE_ERROR_FALSLY_CONFIRMED");
      ok(
        !(await missing(holder, retryEv.storagePath)) &&
          good(
            await holder
              .from("sp_evidence")
              .select("lifecycle_state")
              .eq("id", retryEv.id)
              .single(),
          ).lifecycle_state === "withdrawn",
        "FAILED_REMOVE_STATE",
      );
      const retry = await withdraw(holder, retryEv);
      ok(
        retry.fileDeletion === "confirmed" && (await missing(holder, retryEv.storagePath)),
        "DELETE_RETRY_FAILED",
      );
      return {
        injectedTransport: "test-only client503; real object persisted",
        initialDeletion: first.fileDeletion,
        retryDeletion: retry.fileDeletion,
        historicalMetadataPreserved: true,
      };
    },
  );
  await check(
    "OP-09",
    "Metadata refusal cleanup succeeds; combined cleanup503 produces actual orphan",
    async () => {
      const storagePath = `${uid}/${crypto.randomUUID()}.pdf`;
      good(
        await holder.storage
          .from(bucketName)
          .upload(storagePath, bytes, { contentType: "application/pdf" }),
      );
      const metadata = await holder.rpc("sp_attach_evidence", {
        _claim_id: crypto.randomUUID(),
        _period_id: null,
        _storage_path: storagePath,
        _file_name: "synthetic-partial.pdf",
        _mime_type: "application/pdf",
        _size_bytes: bytes.length,
        _sha256: bytesHash,
      });
      ok(metadata.error, "FOREIGN_MISSING_METADATA_TARGET_ACCEPTED");
      good(await holder.storage.from(bucketName).remove([storagePath]));
      ok(await missing(holder, storagePath), "CLEANUP_FAILED");
      const orphanPath = `${uid}/${crypto.randomUUID()}.pdf`;
      good(
        await holder.storage
          .from(bucketName)
          .upload(orphanPath, bytes, { contentType: "application/pdf" }),
      );
      const failedMetadata = await holder.rpc("sp_attach_evidence", {
        _claim_id: crypto.randomUUID(),
        _period_id: null,
        _storage_path: orphanPath,
        _file_name: "synthetic-orphan.pdf",
        _mime_type: "application/pdf",
        _size_bytes: bytes.length,
        _sha256: bytesHash,
      });
      ok(failedMetadata.error, "METADATA_NEGATIVE_CONTROL");
      let injected = 0;
      const faulty = client(async (input, init) => {
        const request = new Request(input, init);
        if (
          request.method === "DELETE" &&
          new URL(request.url).pathname.startsWith("/storage/v1/object/passport-evidence")
        ) {
          injected++;
          return new Response(
            JSON.stringify({
              message: "Local injected cleanup503",
              statusCode: "503",
              error: "Injected",
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }
        return fetch(request);
      });
      good(
        await faulty.auth.setSession({
          access_token: users.holder.session.access_token,
          refresh_token: users.holder.session.refresh_token,
        }),
      );
      const cleanup = await faulty.storage.from(bucketName).remove([orphanPath]);
      ok(
        injected > 0 && cleanup.error && !(await missing(holder, orphanPath)),
        "NO_REAL_ORPHAN_REPRODUCED",
      );
      ok(
        good(await holder.from("sp_evidence").select("id").eq("storage_path", orphanPath))
          .length === 0,
        "ORPHAN_HAS_METADATA",
      );
      good(await holder.storage.from(bucketName).remove([orphanPath]));
      ok(await missing(holder, orphanPath), "OWN_SYNTHETIC_ORPHAN_NOT_CLEANED");
      return {
        missingTargetDenied: true,
        ordinaryCleanupMissing: true,
        cleanup503OrphanObserved: true,
        objectFingerprint: hash(orphanPath),
        setupCleanupConfirmed: true,
        limitation:
          "Direct transport sequence proves leftover bytes if cleanup fails; upload handler still ignores remove.error. App HTTP fault injection NOT RUN.",
      };
    },
  );
  await check("OP-05", "Real refresh rotates tokens while retaining user/session", async () => {
    const before = users.holder.session;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const refreshed = good(await holder.auth.refreshSession());
    ok(
      refreshed.session.access_token !== before.access_token &&
        refreshed.session.refresh_token !== before.refresh_token &&
        refreshed.user.id === uid &&
        jwt(refreshed.session.access_token).session_id === jwt(before.access_token).session_id,
      "REFRESH_ROTATION_IDENTITY",
    );
    users.holder.session = refreshed.session;
    secrets.push(refreshed.session.access_token, refreshed.session.refresh_token);
    return {
      refreshRotated: true,
      identityPreserved: true,
      sessionPreserved: true,
      browserBackgroundAndTwoTabRace: "NOT RUN",
    };
  });
  const expirySession = good(
    await client().auth.signInWithPassword({
      email: users.other.email,
      password: users.other.password,
    }),
  ).session;
  const logoutHolder = good(
    await client().auth.signInWithPassword({
      email: users.holder.email,
      password: users.holder.password,
    }),
  ).session;
  secrets.push(
    expirySession.access_token,
    expirySession.refresh_token,
    logoutHolder.access_token,
    logoutHolder.refresh_token,
  );
  await check(
    "OP-07",
    "Real global logout denies refresh and Passport JWT replay before expiry",
    async () => {
      const before = jwt(logoutHolder.access_token);
      ok(before.exp > Date.now() / 1000, "LOGOUT_TOKEN_ALREADY_EXPIRED");
      const signout = await fetch(`${env.API_URL}/auth/v1/logout?scope=global`, {
        method: "POST",
        headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${logoutHolder.access_token}` },
      });
      ok(signout.ok, "GLOBAL_LOGOUT");
      const replay = await rest(logoutHolder.access_token, "sp_claims?select=id");
      ok(replay.status === 200 && replay.body.length === 0, "PASSPORT_POST_LOGOUT_PAYLOAD");
      const refresh = await fetch(`${env.API_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: env.ANON_KEY, "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: logoutHolder.refresh_token }),
      });
      ok(!refresh.ok, "REVOKED_REFRESH_ADMITTED");
      const secondRefresh = await fetch(`${env.API_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: env.ANON_KEY, "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: users.holder.session.refresh_token }),
      });
      ok(!secondRefresh.ok, "GLOBAL_LOGOUT_SECOND_SESSION_REFRESH");
      const storageReplay = await fetch(
        `${env.API_URL}/storage/v1/object/sign/${bucketName}/${expiryEv.storagePath}`,
        {
          method: "POST",
          headers: {
            apikey: env.ANON_KEY,
            Authorization: `Bearer ${logoutHolder.access_token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ expiresIn: 300 }),
        },
      );
      ok(!storageReplay.ok, "LOGOUT_STORAGE_SIGN");
      const oldUrl = await fetch(expiryUrl);
      ok(oldUrl.ok, "AUTH_LOGOUT_SIGNED_URL_SEMANTICS_CHANGED");
      return {
        logoutStatus: signout.status,
        passportReplayStatus: replay.status,
        passportReplayRows: replay.body.length,
        refreshStatus: refresh.status,
        otherSessionRefreshStatus: secondRefresh.status,
        storageNewSignStatus: storageReplay.status,
        preissuedSignedUrlAfterLogout: oldUrl.status,
        jwtStillCryptographicallyUnexpired: true,
        interviewImmediateRevoke: "NOT RUN; no immediate-revoke guarantee",
      };
    },
  );
  await expiryProof(expirySession, expiryEv, expiryUrl);
  await finish();
}
async function resumeExpiries() {
  Object.assign(
    users,
    JSON.parse(fs.readFileSync(path.join(temp, "ri-real-synthetic-users.json"), "utf8")),
  );
  for (const user of Object.values(users))
    secrets.push(user.password, user.session.access_token, user.session.refresh_token);
  ok(Object.keys(users).length === 8, "RESUME_EXPECTED_REAL_ACTORS");
  const holder = client();
  good(
    await holder.auth.signInWithPassword({
      email: users.holder.email,
      password: users.holder.password,
    }),
  );
  const rows = good(
    await holder
      .from("sp_evidence")
      .select("id,storage_path,lifecycle_state")
      .eq("file_name", "signed-expiry-local.pdf")
      .eq("lifecycle_state", "active"),
  );
  ok(rows.length === 1, "RESUME_EXPIRY_OBJECT_NOT_UNIQUE");
  const ev = { id: rows[0].id, storagePath: rows[0].storage_path };
  const url = good(
    await holder.storage.from(bucketName).createSignedUrl(ev.storagePath, 300),
  ).signedUrl;
  const session = good(
    await client().auth.signInWithPassword({
      email: users.other.email,
      password: users.other.password,
    }),
  ).session;
  secrets.push(url, session.access_token, session.refresh_token);
  await expiryProof(session, ev, url);
  await finish();
}
async function waitUntil(target, label) {
  while (Date.now() < target) {
    console.log(`${label}: ${Math.ceil((target - Date.now()) / 1000)}s remaining`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(30000, target - Date.now())));
  }
}
async function expiryProof(expirySession, expiryEv, expiryUrl) {
  const tokenClaims = jwt(expirySession.access_token);
  const urlClaims = jwt(new URL(expiryUrl).searchParams.get("token"));
  fs.writeFileSync(
    path.join(temp, "ri-real-expiry-private-state.json"),
    JSON.stringify({
      expirySession,
      expiryEv,
      expiryUrl,
      tokenExpiresAt: tokenClaims.exp,
      signedExpiresAt: urlClaims.exp,
    }),
    { mode: 0o600 },
  );
  const expiryBefore = await rest(
    expirySession.access_token,
    "sp_passport_profiles?select=holder_user_id",
  );
  ok(expiryBefore.status === 200 && expiryBefore.body.length === 1, "EXPIRY_BASELINE");
  const signedBefore = await fetch(expiryUrl, { cache: "no-store" });
  ok(
    signedBefore.ok && hash(Buffer.from(await signedBefore.arrayBuffer())) === bytesHash,
    "SIGNED_EXPIRY_BASELINE",
  );
  evidence.expiryTrial = {
    startedAt: new Date().toISOString(),
    tokenFingerprint: hash(expirySession.access_token),
    jwtTtlSeconds: tokenClaims.exp - tokenClaims.iat,
    signedTtlSeconds: urlClaims.exp - urlClaims.iat,
    signedUrlFingerprint: hash(expiryUrl),
    signedInitialStatus: signedBefore.status,
    initialCacheControl: signedBefore.headers.get("cache-control"),
    postgrestClockSkewSeconds: 30,
    clockSkewSource:
      "https://docs.postgrest.org/en/v14/references/auth.html#time-based-claims-validation",
  };
  save();
  await waitUntil(tokenClaims.exp * 1000 + 1500, "Natural120s real JWT expiry");
  await check(
    "OP-06-BOUNDED",
    "Natural JWT denial after documented30s PostgREST tolerance; exact-exp denial separately fails",
    async () => {
      const timeline = [];
      do {
        const observed = await rest(
          expirySession.access_token,
          "sp_passport_profiles?select=holder_user_id",
        );
        timeline.push({
          secondsAfterExp: Math.round((Date.now() - tokenClaims.exp * 1000) / 100) / 10,
          status: observed.status,
          rows: Array.isArray(observed.body) ? observed.body.length : null,
        });
        evidence.expiryTrial.jwtTimeline = timeline;
        save();
        if (observed.status === 401) break;
        ok(
          observed.status === 200 && Date.now() < tokenClaims.exp * 1000 + 45000,
          "NO_DENIAL_AFTER_CLOCK_SKEW",
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } while (true);
      const first = timeline[0];
      const exactStatus = first.status === 401 ? "PASS" : "FAIL";
      if (exactStatus === "FAIL" && !evidence.checks.some((x) => x.id === "OP-06-EXACT"))
        evidence.checks.push({
          id: "OP-06-EXACT",
          name: "401 immediately after exp",
          status: "FAIL",
          actual: first,
          error: "STANDARD_CLOCK_TOLERANCE_ADMITS_WITHIN_GRACE",
        });
      const c = client();
      good(
        await c.auth.signInWithPassword({
          email: users.other.email,
          password: users.other.password,
        }),
      );
      ok(
        good(await c.from("sp_passport_profiles").select("holder_user_id")).length === 1,
        "REAUTH_FAILED",
      );
      return {
        issuedTtlSeconds: tokenClaims.exp - tokenClaims.iat,
        tokenFingerprint: hash(expirySession.access_token),
        preExpiryStatus: expiryBefore.status,
        timeline,
        exactExpiryAssertion: exactStatus,
        clockToleranceSeconds: 30,
        configChanged: false,
        forgedJwtUsed: false,
        sameActorReauthentication: true,
        uiDraftRecovery: "NOT RUN",
      };
    },
  );
  await waitUntil(urlClaims.exp * 1000 + 1500, "Natural300s signed URL expiry (local origin only)");
  await check(
    "OP-12-LOCAL",
    "Naturally expired signed URL refuses origin bytes; hosted cache not measured",
    async () => {
      const expired = await fetch(expiryUrl, { cache: "no-store" });
      ok(!expired.ok, "EXPIRED_STORAGE_URL_ADMITTED");
      const c = client();
      good(
        await c.auth.signInWithPassword({
          email: users.holder.email,
          password: users.holder.password,
        }),
      );
      const stillPresent = good(await c.storage.from(bucketName).download(expiryEv.storagePath));
      ok(
        hash(Buffer.from(await stillPresent.arrayBuffer())) === bytesHash,
        "EXPIRY_OBJECT_WAS_DELETED_INSTEAD",
      );
      const cleanup = await withdraw(c, expiryEv);
      ok(cleanup.fileDeletion === "confirmed", "EXPIRY_OBJECT_CLEANUP_FAILED");
      return {
        expiredOriginStatus: expired.status,
        date: expired.headers.get("date"),
        cacheControl: expired.headers.get("cache-control"),
        age: expired.headers.get("age"),
        signedUrlFingerprint: hash(expiryUrl),
        ttlSeconds: urlClaims.exp - urlClaims.iat,
        measuredSecondsAfterExp: Math.round((Date.now() - urlClaims.exp * 1000) / 100) / 10,
        actualObjectStillExistedAtExpiry: true,
        finalOwnObjectCleanup: cleanup.fileDeletion,
        hostedSmartCdnAndBrowserCache: "NOT RUN",
      };
    },
  );
}
async function finish() {
  await check("OP-22", "AI/transcript and side effects remain off", async () => {
    const after = baseline();
    ok(JSON.stringify(after) === JSON.stringify(evidence.baseline), "SIDE_EFFECT_BASELINE_CHANGED");
    return {
      ...after,
      mailTransport: "Auth accounts preconfirmed; local mailsink/Edge/mail workers stopped",
      providerCalls: "none in runner; no provider integration invoked",
    };
  });
  evidence.notRun = [
    "Published runtime and hosted CDN/cache invalidation (OP12)",
    "Complete app HTTP and12 browser journeys (OP16/17)",
    "Candidate CV server signing, verifier open/closed review matrix, app upload8MiB ceiling",
    "UI logout/cache/reauth unsaved draft recovery, two-tab refresh and different-project signed JWT",
    "Physical iPhone/Android, WebKit, app3140 not launched",
  ];
  evidence.finishedAt = new Date().toISOString();
  evidence.summary = {
    pass: evidence.checks.filter((x) => x.status === "PASS").length,
    fail: evidence.checks.filter((x) => x.status === "FAIL").length,
    partialUploadCleanupRisk:
      "actual orphan reproduced under test-only cleanup fault then own object cleaned; product upload cleanup error handling remains a limitation",
  };
  save();
  fs.writeFileSync(path.join(temp, "ri-real-synthetic-users.json"), JSON.stringify(users), {
    mode: 0o600,
  });
  console.log(
    `${evidence.summary.pass} bounded real-service checks PASS; ${evidence.summary.fail} exact-exp assertions FAIL; explicit NOT RUN portions preserved`,
  );
}
main().catch((error) => {
  evidence.finishedAt = new Date().toISOString();
  save();
  console.error(redact(error.message));
  process.exitCode = 1;
});
