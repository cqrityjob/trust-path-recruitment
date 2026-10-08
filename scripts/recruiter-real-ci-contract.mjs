import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

export const APP_SHA = "0eab408debbe660d22825c2ffaa8fcc60de0b68c";
export const PROJECT = "cqj-ri-real-20261008b";
export const API = "http://127.0.0.1:55690";
export const APP = "http://127.0.0.1:3140";
export const CLI_VERSION = "2.111.0";
export const EXCLUDED =
  "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";

export function requireCompleteHistory(names) {
  const files = names.filter((name) => name.endsWith(".sql")).sort();
  if (
    files.length < 385 ||
    files.some((name) => !/^\d{14}_.+\.sql$/.test(name)) ||
    new Set(files.map((name) => name.slice(0, 14))).size !== files.length
  )
    throw Error("REAL_CI_COMPLETE_CANONICAL_HISTORY_REQUIRED");
  if (
    !files.some((name) => name.startsWith("20270307090000_")) ||
    !files.some((name) => name.startsWith("20270307100000_"))
  )
    throw Error("REAL_CI_SNAPSHOT_FORWARD_REQUIRED");
  return files;
}

// Public diagnostic codes come from a fixed Auth taxonomy. Never reflect the
// response message, user, token, URL or arbitrary error strings into evidence.
const authErrorCodes = new Set([
  "email_provider_disabled",
  "invalid_credentials",
  "email_not_confirmed",
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "unexpected_failure",
  "request_timeout",
  "validation_failed",
  "bad_json",
  "signup_disabled",
  "weak_password",
  "access_denied",
]);
export function authFailureSummary(status, payload) {
  return {
    httpStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0,
    authCode: authErrorCodes.has(payload?.error_code) ? payload.error_code : "unclassified",
  };
}

export function requireBrowserCounts(stats, expected) {
  const result = {
    expected: stats?.expected,
    unexpected: stats?.unexpected,
    flaky: stats?.flaky,
    skipped: stats?.skipped,
  };
  if (
    result.expected !== expected ||
    result.unexpected !== 0 ||
    result.flaky !== 0 ||
    result.skipped !== 0
  )
    throw Error("REAL_CI_BROWSER_COUNTS_MISMATCH");
  return result;
}

export function validateTarget(env, actualSchemaSha, actualAppSha) {
  if (
    env.GITHUB_ACTIONS !== "true" ||
    env.CI !== "true" ||
    env.RUNNER_OS !== "Linux" ||
    env.RUNNER_ENVIRONMENT !== "github-hosted"
  )
    throw Error("REAL_CI_GITHUB_HOSTED_LINUX_REQUIRED");
  if (!env.GITHUB_WORKSPACE || !path.isAbsolute(env.GITHUB_WORKSPACE))
    throw Error("REAL_CI_WORKSPACE_REQUIRED");
  if (
    !/^[a-f0-9]{40}$/.test(env.RI_REAL_SCHEMA_SHA ?? "") ||
    env.RI_REAL_SCHEMA_SHA !== actualSchemaSha
  )
    throw Error("REAL_CI_SCHEMA_SHA_MISMATCH");
  const releaseSchemaSha = env.RI_REAL_RELEASE_SCHEMA_SHA ?? actualSchemaSha;
  if (!/^[a-f0-9]{40}$/.test(releaseSchemaSha)) throw Error("REAL_CI_RELEASE_SCHEMA_SHA_REQUIRED");
  if (actualAppSha !== APP_SHA) throw Error("REAL_CI_UNREVIEWED_APP_HEAD");
  const root = path.resolve(env.GITHUB_WORKSPACE);
  if (env.RI_OPS_STACK_ROOT !== path.join(root, "real-stack"))
    throw Error("REAL_CI_STACK_ALLOWLIST");
  if (
    env.SUPABASE_ACCESS_TOKEN ||
    env.SUPABASE_DB_PASSWORD ||
    env.OPENAI_API_KEY ||
    env.RESEND_API_KEY
  )
    throw Error("REAL_CI_PROVIDER_CREDENTIAL_REFUSED");
  return {
    root,
    appRoot: path.join(root, "app"),
    stackRoot: path.join(root, "real-stack"),
    publicRoot: path.join(root, "real-public"),
    evidenceCodeSha: actualSchemaSha,
    releaseSchemaSha,
  };
}

/** A test-only descendant may add evidence code, but may not alter the
 * released schema whose exact contents are being witnessed. */
export function requireReleaseSchemaWitness(root, releaseSchemaSha, evidenceCodeSha) {
  try {
    cp.execFileSync("git", ["merge-base", "--is-ancestor", releaseSchemaSha, evidenceCodeSha], {
      cwd: root,
      stdio: "ignore",
    });
  } catch {
    throw Error("REAL_CI_RELEASE_SCHEMA_ANCESTOR_REQUIRED");
  }
  try {
    cp.execFileSync(
      "git",
      [
        "diff",
        "--exit-code",
        releaseSchemaSha,
        evidenceCodeSha,
        "--",
        "supabase/migrations",
        "supabase/config.toml",
      ],
      { cwd: root, stdio: "ignore" },
    );
  } catch {
    throw Error("REAL_CI_RELEASE_SCHEMA_DIFF_REFUSED");
  }
}

export function readCIContext(env = process.env) {
  const root = env.GITHUB_WORKSPACE;
  if (!root) throw Error("REAL_CI_WORKSPACE_REQUIRED");
  const sha = (cwd) =>
    cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  const context = validateTarget(env, sha(root), sha(path.join(root, "app")));
  requireReleaseSchemaWitness(root, context.releaseSchemaSha, context.evidenceCodeSha);
  for (const cwd of [context.root, context.appRoot]) {
    if (
      cp
        .execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
          cwd,
          encoding: "utf8",
        })
        .trim()
    )
      throw Error("REAL_CI_TRACKED_FILES_DIRTY");
  }
  return context;
}

export function readPrivateStatus(context) {
  const file = path.join(context.stackRoot, "supabase/.temp/ri-local-status.json");
  if (
    !fs.lstatSync(file).isFile() ||
    fs.lstatSync(file).isSymbolicLink() ||
    fs.statSync(file).mode & 0o077
  )
    throw Error("REAL_CI_PRIVATE_STATUS_REQUIRED");
  const status = JSON.parse(fs.readFileSync(file, "utf8"));
  const db = new URL(status.DB_URL);
  if (
    status.API_URL !== API ||
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    db.hostname !== "127.0.0.1" ||
    db.port !== "55691" ||
    db.pathname !== "/postgres" ||
    db.username !== "postgres"
  )
    throw Error("REAL_CI_SERVICE_TARGET_MISMATCH");
  const config = fs.readFileSync(path.join(context.stackRoot, "supabase/config.toml"), "utf8");
  if (!config.includes(`project_id = "${PROJECT}"`) || !config.includes("major_version = 17"))
    throw Error("REAL_CI_PROJECT_MISMATCH");
  return status;
}

export function childEnvironment(status, source = process.env) {
  return {
    PATH: source.PATH,
    HOME: source.HOME,
    LANG: source.LANG ?? "C.UTF-8",
    TMPDIR: source.TMPDIR ?? "/tmp",
    NODE_ENV: "development",
    CI: "true",
    SUPABASE_URL: API,
    VITE_SUPABASE_URL: API,
    SUPABASE_PROJECT_ID: PROJECT,
    VITE_SUPABASE_PROJECT_ID: PROJECT,
    SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    PUBLIC_SITE_URL: APP,
    VITE_CIG_LIFECYCLE_ENFORCED: "true",
    VITE_EMPLOYER_PORTAL_ENABLED: "true",
    VITE_JOBS_ENABLED: "true",
  };
}

export const CONFIG = `project_id = "${PROJECT}"
[api]
enabled = true
port = 55690
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = 55691
shadow_port = 55689
major_version = 17
health_timeout = "5m"
[db.migrations]
enabled = false
schema_paths = []
[db.seed]
enabled = false
sql_paths = []
[db.pooler]
enabled = false
[realtime]
enabled = false
[studio]
enabled = false
[local_smtp]
enabled = false
[storage]
enabled = true
file_size_limit = "50MiB"
[storage.vector]
enabled = false
[auth]
enabled = true
site_url = "${APP}"
additional_redirect_urls = ["${APP}"]
jwt_expiry = 120
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10
enable_signup = false
enable_anonymous_sign_ins = false
minimum_password_length = 8
[auth.email]
enable_signup = true
enable_confirmations = false
[auth.sms]
enable_signup = false
[edge_runtime]
enabled = false
[analytics]
enabled = false
`;
