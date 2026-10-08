import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const APP_SHA = "3e0aa8552b7d45f99c5de881320d4e6c773e59cf";
export const SCHEMA_SHA = "6039fbc685cad255aae4a4e39c1035e933af883d";
export const PROJECT = "cqj-ri-native-p1-100";
export const API = "http://127.0.0.1:55810";
export const APP = "http://127.0.0.1:35810";
export const CLI_VERSION = "2.111.0";
export const EXCLUDED =
  "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";
export const EMPLOYER = "ee100000-1111-4000-8000-000000000001";
export const JOB = "ee100000-2222-4000-8000-000000000001";
export const appId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const candidateId = (n) => `ee10aaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const hasCv = (n) => !((n >= 56 && n <= 60) || (n >= 66 && n <= 75) || (n >= 91 && n <= 95));
export const cvPath = (n) => `${candidateId(n)}/${appId(n)}/synthetic.pdf`;
export const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n% CQrityjob RI-P1-100-v1 synthetic original\n%%EOF\n".padEnd(512, " "),
);
export const ACTORS = ["owner", "bob", "member", "outsider"]
  .map((alias, i) => ({
    alias,
    id: `ee100000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    displayName: ["Alice synthetic", "Bob synthetic", "Member synthetic", "Outsider synthetic"][i],
  }))
  .concat(
    Array.from({ length: 100 }, (_, i) => ({
      alias: `candidate-${i + 1}`,
      id: candidateId(i + 1),
      displayName: `Synthetic A${String(i + 1).padStart(3, "0")}`,
    })),
  );
export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function requireReplacementSource(before, replacement) {
  const oldVersion = before?.availableSources?.find((s) => s.kind === "application_cv")?.version;
  const newVersion = replacement?.availableSources?.find(
    (s) => s.kind === "application_cv",
  )?.version;
  if (
    typeof oldVersion !== "string" ||
    !oldVersion ||
    typeof newVersion !== "string" ||
    !newVersion
  )
    throw Error("P1_NATIVE_REPLACEMENT_SOURCE_REQUIRED");
  if (oldVersion === newVersion) throw Error("P1_NATIVE_REPLACEMENT_SOURCE_VERSION_REUSED");
}

// Only fixed operation names and bounded protocol/domain codes may reach the
// public manifest. SDK messages/details/hints/causes/stacks stay private.
export function failure(operation, result) {
  const safeDiagnostic = {
    operation: /^rec_[a-z_]+$|^scp_iv_[a-z_]+$/.test(operation) ? operation : "unknown",
    ...(Number.isInteger(result?.status) && result.status >= 100 && result.status <= 599
      ? { status: result.status }
      : {}),
    ...(/^[A-Z0-9]{5}$/.test(result?.error?.code ?? "") ? { sqlState: result.error.code } : {}),
    ...(/^(?:RI|SCP_IV|RECRUITMENT)_[A-Z0-9_]{1,80}$|^STALE_VERSION$/.test(
      result?.error?.message ?? "",
    )
      ? { domain: result.error.message }
      : {}),
  };
  return Object.assign(Error("P1_NATIVE_SIGNED_IN_RPC_FAILED"), { safeDiagnostic });
}

export function validateTarget(env, actualEvidenceSha, actualAppSha, actualSchemaSha) {
  if (
    env.GITHUB_ACTIONS !== "true" ||
    env.CI !== "true" ||
    env.RUNNER_OS !== "Linux" ||
    env.RUNNER_ENVIRONMENT !== "github-hosted" ||
    env.RI_P1_NATIVE_DISPOSABLE !== "1"
  )
    throw Error("P1_NATIVE_GITHUB_EPHEMERAL_ONLY");
  if (!path.isAbsolute(env.GITHUB_WORKSPACE ?? "")) throw Error("P1_NATIVE_WORKSPACE_REQUIRED");
  if (
    !/^[a-f0-9]{40}$/.test(actualEvidenceSha) ||
    env.RI_P1_NATIVE_EVIDENCE_SHA !== actualEvidenceSha ||
    actualAppSha !== APP_SHA ||
    actualSchemaSha !== SCHEMA_SHA
  )
    throw Error("P1_NATIVE_SHA_MISMATCH");
  if (
    Object.keys(env).some(
      (key) => /^(SUPABASE_|VITE_SUPABASE_|OPENAI_|RESEND_|AWS_)/.test(key) && env[key],
    )
  )
    throw Error("P1_NATIVE_INHERITED_PROVIDER_CREDENTIAL_REFUSED");
  const root = path.resolve(env.GITHUB_WORKSPACE);
  return {
    root,
    appRoot: path.join(root, "app"),
    schemaRoot: path.join(root, "schema"),
    stackRoot: path.join(root, "p1-native-stack"),
    publicRoot: path.join(root, "p1-native-public"),
    evidenceSha: actualEvidenceSha,
  };
}

export function readPrivateJson(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw Error("P1_NATIVE_PRIVATE_FILE_REQUIRED");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
export function validateStatus(status) {
  const db = new URL(status.DB_URL);
  if (
    status.API_URL !== API ||
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    db.hostname !== "127.0.0.1" ||
    db.port !== "55811" ||
    db.pathname !== "/postgres" ||
    db.username !== "postgres" ||
    !status.ANON_KEY ||
    !status.SERVICE_ROLE_KEY
  )
    throw Error("P1_NATIVE_TARGET_MISMATCH");
  try {
    const role = (key) => JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role;
    if (role(status.ANON_KEY) !== "anon" || role(status.SERVICE_ROLE_KEY) !== "service_role")
      throw Error("wrong role");
  } catch {
    throw Error("P1_NATIVE_LOCAL_KEY_ROLES_REQUIRED");
  }
  return status;
}
export function history(names) {
  const files = names.filter((name) => name.endsWith(".sql")).sort();
  if (
    files.length < 386 ||
    files.some((name) => !/^\d{14}_.+\.sql$/.test(name)) ||
    new Set(files.map((name) => name.slice(0, 14))).size !== files.length ||
    ["20270307090000_", "20270307100000_", "20270308090000_"].some(
      (prefix) => !files.some((f) => f.startsWith(prefix)),
    )
  )
    throw Error("P1_NATIVE_COMPLETE_HISTORY_REQUIRED");
  return files;
}
export function requireBrowserCounts(stats) {
  if (stats?.expected !== 5 || stats.unexpected !== 0 || stats.flaky !== 0 || stats.skipped !== 0)
    throw Error("P1_NATIVE_FIVE_BROWSER_CASES_REQUIRED");
  return { expected: 5, unexpected: 0, flaky: 0, skipped: 0 };
}
export const CONFIG = `project_id = "${PROJECT}"
[api]
enabled = true
port = 55810
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = 55811
shadow_port = 55809
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
enable_signup = false
enable_anonymous_sign_ins = false
minimum_password_length = 8
[auth.email]
# Provider enabled for password LOGIN; global signup above remains disabled.
enable_signup = true
enable_confirmations = false
[auth.sms]
enable_signup = false
[edge_runtime]
enabled = false
[analytics]
enabled = false
`;
