// Fixed facts of the talent discovery real-services run; tested by
// scripts/talent-discovery-real-ci.test.ts. Ports and project differ from the
// recruiter real-CI stack so the two can never address each other.

export const PROJECT = "cqj-td-real-20261015";
export const API = "http://127.0.0.1:55790";
export const APP = "http://127.0.0.1:3150";
export const CLI_VERSION = "2.111.0";
export const PASSWORD = "LocalJourney!2026";
export const EXCLUDED =
  "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";

/** The synthetic people of scripts/fixtures/talent-discovery-fixture.sql. */
export const PEOPLE = Object.freeze([
  {
    id: "7d000000-0000-4000-8000-0000000000a1",
    email: "td-cand-a@local.test",
    name: "Cecilia Kandidat",
  },
  {
    id: "7d000000-0000-4000-8000-0000000000b1",
    email: "td-cand-b@local.test",
    name: "Bo Kandidat",
  },
  {
    id: "7d000000-0000-4000-8000-0000000000c1",
    email: "td-cand-c@local.test",
    name: "Petra Privat",
  },
  {
    id: "7d000000-0000-4000-8000-0000000000f1",
    email: "td-reviewer@local.test",
    name: "Rita Granskare",
  },
  { id: "7d000000-0000-4000-8000-0000000000e1", email: "td-owner@local.test", name: "Olle Ägare" },
  {
    id: "7d000000-0000-4000-8000-0000000000e2",
    email: "td-recruiter@local.test",
    name: "Rut Rekryterare",
  },
  {
    id: "7d000000-0000-4000-8000-0000000000e3",
    email: "td-colleague@local.test",
    name: "Kim Kollega",
  },
  {
    id: "7d000000-0000-4000-8000-0000000000e4",
    email: "td-owner2@local.test",
    name: "Anna Annanfirma",
  },
]);

/** Product mail may go only to approved test addresses. None of the
 * synthetic people is approved, and the stack has no Edge runtime anyway. */
export const MAIL_ALLOWLIST = "@approved-test-recipient.invalid";

export function requireRunner(env) {
  if (
    env.CI !== "true" ||
    env.GITHUB_ACTIONS !== "true" ||
    env.RUNNER_OS !== "Linux" ||
    env.RUNNER_ENVIRONMENT !== "github-hosted" ||
    env.TD_REAL_DISPOSABLE !== "1"
  )
    throw Error("TD_REAL_GITHUB_EPHEMERAL_ONLY");
  if (!/^[a-f0-9]{40}$/.test(env.TD_REAL_EVIDENCE_SHA ?? ""))
    throw Error("TD_REAL_EVIDENCE_SHA_REQUIRED");
  if (
    Object.keys(env).some(
      (key) => /^(SUPABASE_|VITE_SUPABASE_|OPENAI_|RESEND_|AWS_|ANTHROPIC_)/.test(key) && env[key],
    )
  )
    throw Error("TD_REAL_INHERITED_PROVIDER_CREDENTIAL_REFUSED");
}

const role = (jwt) =>
  JSON.parse(Buffer.from(String(jwt).split(".")[1] ?? "", "base64url").toString()).role;

export function requireStatus(status) {
  const db = new URL(status.DB_URL);
  if (
    status.API_URL !== API ||
    db.hostname !== "127.0.0.1" ||
    db.port !== "55791" ||
    db.pathname !== "/postgres"
  )
    throw Error("TD_REAL_SERVICE_TARGET_MISMATCH");
  try {
    if (role(status.ANON_KEY) !== "anon" || role(status.SERVICE_ROLE_KEY) !== "service_role")
      throw Error("roles");
  } catch {
    throw Error("TD_REAL_KEY_ROLES_REQUIRED");
  }
  return status;
}

export function appEnvironment(status, source) {
  return {
    PATH: source.PATH,
    HOME: source.HOME,
    LANG: source.LANG ?? "C.UTF-8",
    TMPDIR: source.TMPDIR ?? "/tmp",
    NODE_ENV: "development",
    NODE_OPTIONS: "--max-old-space-size=6144",
    CI: "true",
    SUPABASE_URL: API,
    VITE_SUPABASE_URL: API,
    SUPABASE_PROJECT_ID: PROJECT,
    VITE_SUPABASE_PROJECT_ID: PROJECT,
    SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    PUBLIC_SITE_URL: APP,
    PRODUCT_EMAIL_RECIPIENT_ALLOWLIST: MAIL_ALLOWLIST,
    VITE_CIG_LIFECYCLE_ENFORCED: "true",
    VITE_EMPLOYER_PORTAL_ENABLED: "true",
    VITE_JOBS_ENABLED: "true",
  };
}

export function isRegistryThrottle(text) {
  return /toomanyrequests|rate exceeded|too many requests|data limit exceeded/i.test(String(text));
}

/** Exactly `expected` passing tests: none failed, flaky or skipped. With
 * allowFailure the counts are returned for the report instead of thrown. */
export function requireBrowserCounts(stats, expected, { allowFailure = false } = {}) {
  const counts = {
    expected: Number(stats?.expected ?? -1),
    unexpected: Number(stats?.unexpected ?? -1),
    flaky: Number(stats?.flaky ?? -1),
    skipped: Number(stats?.skipped ?? -1),
  };
  const ok =
    counts.expected === expected &&
    counts.unexpected === 0 &&
    counts.flaky === 0 &&
    counts.skipped === 0;
  if (!ok && !allowFailure) throw Error("TD_REAL_BROWSER_COUNTS_MISMATCH");
  return { ...counts, required: expected, complete: ok };
}

export const CONFIG = `project_id = "${PROJECT}"
[api]
enabled = true
port = 55790
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = 55791
shadow_port = 55789
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
jwt_expiry = 3600
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
