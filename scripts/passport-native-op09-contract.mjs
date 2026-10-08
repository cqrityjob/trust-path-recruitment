import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import crypto from "node:crypto";

export const SCHEMA_SHA = "9c8b8159ce5f350c6ace074c917823599d19ce99";
export const APP_SHA = "a5dd89ebee2c30f4d2ff18df7117d07e2bb125d2";
export const PROJECT = "cqj-ri-native-op09-20261008";
export const API = "http://127.0.0.1:55820";
export const APP = "http://127.0.0.1:35820";
export const CLI_VERSION = "2.111.0";
export const EXCLUDED =
  "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";
export const ACTORS = ["O1", "A1", "R1", "M1", "C1", "C2", "X2", "V1"];
export const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n% CQrityjob isolated OP09 browser original\n%%EOF\n",
);
export const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
export const STAGES = [
  "official_native_stack",
  "strict_complete_schema",
  "real_auth_receipt_off_setup",
  "actual_sdk_44",
  "pinned_app_start",
  "actual_browser_reload_resume_cleanup",
  "final_side_effect_readback",
];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const validUuid = (value) => typeof value === "string" && uuid.test(value);

export function validateTarget(env, evidenceSha, appSha) {
  if (
    env.GITHUB_ACTIONS !== "true" ||
    env.CI !== "true" ||
    env.RUNNER_OS !== "Linux" ||
    env.RUNNER_ENVIRONMENT !== "github-hosted" ||
    env.RI_OP09_NATIVE_DISPOSABLE !== "1"
  )
    throw Error("OP09_NATIVE_GITHUB_EPHEMERAL_ONLY");
  if (!path.isAbsolute(env.GITHUB_WORKSPACE ?? "")) throw Error("OP09_NATIVE_WORKSPACE_REQUIRED");
  if (
    !/^[a-f0-9]{40}$/.test(evidenceSha) ||
    env.RI_OP09_NATIVE_EVIDENCE_SHA !== evidenceSha ||
    appSha !== APP_SHA
  )
    throw Error("OP09_NATIVE_SHA_MISMATCH");
  if (
    Object.keys(env).some(
      (key) => /^(SUPABASE_|VITE_SUPABASE_|OPENAI_|RESEND_|AWS_)/.test(key) && env[key],
    )
  )
    throw Error("OP09_NATIVE_INHERITED_PROVIDER_CREDENTIAL_REFUSED");
  const root = path.resolve(env.GITHUB_WORKSPACE);
  return {
    root,
    appRoot: path.join(root, "app"),
    stackRoot: path.join(root, "op09-native-stack"),
    publicRoot: path.join(root, "op09-native-public"),
    evidenceSha,
  };
}
const git = (cwd, args) =>
  cp.execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
export function readContext(env = process.env) {
  if (!env.GITHUB_WORKSPACE) throw Error("OP09_NATIVE_WORKSPACE_REQUIRED");
  const context = validateTarget(
    env,
    git(env.GITHUB_WORKSPACE, ["rev-parse", "HEAD"]),
    git(path.join(env.GITHUB_WORKSPACE, "app"), ["rev-parse", "HEAD"]),
  );
  try {
    git(context.root, ["merge-base", "--is-ancestor", SCHEMA_SHA, context.evidenceSha]);
    git(context.root, [
      "diff",
      "--exit-code",
      SCHEMA_SHA,
      context.evidenceSha,
      "--",
      "supabase/migrations",
      "supabase/config.toml",
    ]);
  } catch {
    throw Error("OP09_NATIVE_SCHEMA_WITNESS_CHANGED");
  }
  for (const dir of [context.root, context.appRoot])
    if (git(dir, ["status", "--porcelain", "--untracked-files=no"]))
      throw Error("OP09_NATIVE_TRACKED_FILES_DIRTY");
  return context;
}
export function readPrivateJson(file) {
  const s = fs.lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink() || s.mode & 0o077)
    throw Error("OP09_NATIVE_PRIVATE_FILE_REQUIRED");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw Error("OP09_NATIVE_PRIVATE_JSON_REQUIRED");
  }
}
export function validateStatus(status) {
  const db = new URL(status.DB_URL);
  if (
    status.API_URL !== API ||
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    db.hostname !== "127.0.0.1" ||
    db.port !== "55821" ||
    db.username !== "postgres" ||
    db.pathname !== "/postgres"
  )
    throw Error("OP09_NATIVE_STATUS_TARGET_MISMATCH");
  try {
    const role = (key) => JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role;
    if (role(status.ANON_KEY) !== "anon" || role(status.SERVICE_ROLE_KEY) !== "service_role")
      throw Error("invalid");
  } catch {
    throw Error("OP09_NATIVE_KEY_ROLES_REQUIRED");
  }
  return status;
}
export function history(names) {
  const files = names.filter((n) => n.endsWith(".sql")).sort();
  if (
    files.length !== 387 ||
    files.some((n) => !/^\d{14}_.+\.sql$/.test(n)) ||
    new Set(files.map((n) => n.slice(0, 14))).size !== files.length ||
    ["20270307090000_", "20270307100000_", "20270308090000_", "20270309090000_"].some(
      (prefix) => !files.some((n) => n.startsWith(prefix)),
    )
  )
    throw Error("OP09_NATIVE_EXACT_COMPLETE_HISTORY_REQUIRED");
  return files;
}
export function sdkSummary(result) {
  if (
    result?.kind !== "actual_gotrue_storage_sdk" ||
    result.completed !== 44 ||
    !Array.isArray(result.checks) ||
    result.checks.length !== 44 ||
    result.checks.some((label) => typeof label !== "string" || !/^[a-z_]{1,100}$/.test(label))
  )
    throw Error("OP09_NATIVE_SDK_44_REQUIRED");
  const logout = [
    "actual_gotrue_local_session_logout",
    "replayed_jwt_live_session_inactive",
    "revoked_session_direct_reconcile_denied",
    "revoked_session_direct_cleanup_denied",
    "revoked_session_direct_confirm_denied",
    "revoked_session_direct_begin_denied",
    "revoked_session_cannot_claim_empty_attempt_list",
    "revoked_session_never_claims_cleanup_confirmed",
    "revoked_session_never_resumes_attachment",
    "revoked_session_original_bytes_denied",
  ];
  if (
    JSON.stringify(result.checks.slice(-10)) !== JSON.stringify(logout) ||
    !result.checks.includes("registration_wins_fence_preserves_record") ||
    !result.checks.includes("actual_late_attach_after_fence_refused")
  )
    throw Error("OP09_NATIVE_SEQUENTIAL_OR_LOGOUT_PROOF_MISSING");
  const races = result.checks
    .filter((label) =>
      [
        "concurrent_registration_won_cleanup_preserved",
        "concurrent_cleanup_won_late_attach_denied",
      ].includes(label),
    )
    .map((label) =>
      label === "concurrent_registration_won_cleanup_preserved"
        ? "registration_won"
        : "cleanup_won",
    );
  if (races.length !== 2) throw Error("OP09_NATIVE_TWO_OBSERVED_RACES_REQUIRED");
  return {
    completed: 44,
    kind: result.kind,
    checks: result.checks,
    observedRaceOutcomes: races,
    bothRaceOrdersObserved: new Set(races).size === 2,
    sequentialCommittedOrdersVerified: true,
    logoutScope: "local",
    expiredJwtClaim: false,
    replayProtection: "Passport live-session guard; JWT may verify until TTL",
  };
}
export function browserSummary(stats) {
  if (stats?.expected !== 4 || stats.unexpected !== 0 || stats.flaky !== 0 || stats.skipped !== 0)
    throw Error("OP09_NATIVE_FOUR_BROWSER_CASES_REQUIRED");
  return {
    expected: 4,
    unexpected: 0,
    flaky: 0,
    skipped: 0,
    locales: ["sv", "en"],
    viewports: ["desktop1440", "emulated375"],
    physicalPhone: false,
  };
}
export function rpcFailure(operation, result) {
  const safeDiagnostic = {
    operation: /^sp_[a-z_]{1,80}$/.test(operation) ? operation : "unknown",
    ...(Number.isInteger(result?.status) && result.status >= 100 && result.status <= 599
      ? { status: result.status }
      : {}),
    ...(/^[A-Z0-9]{5}$/.test(result?.error?.code ?? "") ? { sqlState: result.error.code } : {}),
    ...(/^SP_[A-Z0-9_]{1,80}$/.test(result?.error?.message ?? "")
      ? { domain: result.error.message }
      : {}),
  };
  return Object.assign(Error("OP09_NATIVE_SIGNED_IN_RPC_FAILED"), { safeDiagnostic });
}
export function appEnvironment(context, status, source = process.env) {
  return {
    PATH: source.PATH,
    HOME: source.HOME,
    LANG: source.LANG ?? "C.UTF-8",
    TMPDIR: source.TMPDIR ?? "/tmp",
    NODE_ENV: "development",
    CI: "true",
    GITHUB_ACTIONS: "true",
    RI_OP09_NATIVE_DISPOSABLE: "1",
    RI_OP09_NATIVE_STACK_ROOT: context.stackRoot,
    RI_OP09_NATIVE_FAULT_FILE: path.join(context.stackRoot, "supabase/.temp/cleanup-fault.json"),
    NODE_OPTIONS: `--import=${path.join(context.root, "scripts/passport-native-op09-fault-preload.mjs")}`,
    SUPABASE_URL: API,
    VITE_SUPABASE_URL: API,
    SUPABASE_PROJECT_ID: PROJECT,
    VITE_SUPABASE_PROJECT_ID: PROJECT,
    SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    PUBLIC_SITE_URL: APP,
  };
}
export const CONFIG = `project_id = "${PROJECT}"
[api]
enabled = true
port = 55820
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = 55821
shadow_port = 55819
major_version = 17
[db.seed]
enabled = false
[studio]
enabled = false
[inbucket]
enabled = false
[local_smtp]
enabled = false
[storage]
enabled = true
file_size_limit = "10MiB"
[auth]
enabled = true
site_url = "${APP}"
additional_redirect_urls = ["${APP}"]
jwt_expiry = 3600
enable_refresh_token_rotation = true
enable_signup = false
enable_anonymous_sign_ins = false
minimum_password_length = 8
[auth.email]
# Password LOGIN provider enabled; global public signup remains disabled.
enable_signup = true
enable_confirmations = false
[auth.sms]
enable_signup = false
[edge_runtime]
enabled = false
[analytics]
enabled = false
`;
