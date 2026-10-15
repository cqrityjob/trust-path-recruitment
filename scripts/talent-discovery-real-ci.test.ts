import { test, expect } from "bun:test";
import fs from "node:fs";
import {
  API,
  APP,
  CONFIG,
  CLI_VERSION,
  MAIL_ALLOWLIST,
  PEOPLE,
  appEnvironment,
  isRegistryThrottle,
  requireBrowserCounts,
  requireRunner,
  requireStatus,
} from "./talent-discovery-real-ci-contract.mjs";

const read = (p: string) => fs.readFileSync(p, "utf8");
const jwt = (role: string) => `x.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.y`;
const runner = {
  CI: "true",
  GITHUB_ACTIONS: "true",
  RUNNER_OS: "Linux",
  RUNNER_ENVIRONMENT: "github-hosted",
  TD_REAL_DISPOSABLE: "1",
  TD_REAL_EVIDENCE_SHA: "a".repeat(40),
};

test("runs only on a disposable GitHub-hosted runner without inherited provider credentials", () => {
  expect(() => requireRunner(runner)).not.toThrow();
  for (const patch of [
    { CI: "false" },
    { RUNNER_ENVIRONMENT: "self-hosted" },
    { RUNNER_OS: "macOS" },
    { TD_REAL_DISPOSABLE: "0" },
    { TD_REAL_EVIDENCE_SHA: "main" },
    { SUPABASE_ACCESS_TOKEN: "refused" },
    { RESEND_API_KEY: "refused" },
  ])
    expect(() => requireRunner({ ...runner, ...patch })).toThrow();
});

test("the stack is the local CLI stack, never a hosted project, with distinct key roles", () => {
  const status = {
    API_URL: API,
    DB_URL: "postgresql://postgres:postgres@127.0.0.1:55791/postgres",
    ANON_KEY: jwt("anon"),
    SERVICE_ROLE_KEY: jwt("service_role"),
  };
  expect(requireStatus(status).API_URL).toBe(API);
  for (const patch of [
    { API_URL: "https://wrygicdfxwjnrugduxnt.supabase.co" },
    { DB_URL: "postgresql://postgres:x@db.example.invalid:5432/postgres" },
    { DB_URL: "postgresql://postgres:x@127.0.0.1:55691/postgres" },
    { ANON_KEY: jwt("service_role") },
    { SERVICE_ROLE_KEY: jwt("anon") },
  ])
    expect(() => requireStatus({ ...status, ...patch })).toThrow();
});

test("the services that matter are on and mail cannot leave", () => {
  expect(CONFIG).toMatch(/\[storage\]\nenabled = true/);
  expect(CONFIG).toMatch(/\[auth\]\nenabled = true/);
  expect(CONFIG).toMatch(/\[edge_runtime\]\nenabled = false/);
  expect(CONFIG).toMatch(/\[local_smtp\]\nenabled = false/);
  expect(CONFIG).toMatch(/\[auth\][\s\S]*?enable_signup = false/);
  expect(CONFIG).toContain("major_version = 17");
  expect(CONFIG).not.toContain("55690");
  const env = appEnvironment(
    { ANON_KEY: jwt("anon"), SERVICE_ROLE_KEY: jwt("service_role") },
    { PATH: "/bin", HOME: "/home/x", OPENAI_API_KEY: "never", RESEND_API_KEY: "never" },
  );
  expect(env.PRODUCT_EMAIL_RECIPIENT_ALLOWLIST).toBe(MAIL_ALLOWLIST);
  expect(PEOPLE.every((p) => !p.email.endsWith(MAIL_ALLOWLIST))).toBe(true);
  expect(Object.keys(env).some((k) => /OPENAI|RESEND/.test(k))).toBe(false);
  expect(env.SUPABASE_URL).toBe(API);
  expect(env.PUBLIC_SITE_URL).toBe(APP);
});

test("eleven passing scenarios, no fewer, none flaky or skipped", () => {
  const ok = { expected: 11, unexpected: 0, flaky: 0, skipped: 0 };
  expect(requireBrowserCounts(ok, 11).complete).toBe(true);
  for (const patch of [{ expected: 10 }, { unexpected: 1 }, { flaky: 1 }, { skipped: 1 }])
    expect(() => requireBrowserCounts({ ...ok, ...patch }, 11)).toThrow("COUNTS_MISMATCH");
  expect(requireBrowserCounts({ ...ok, unexpected: 1 }, 11, { allowFailure: true }).complete).toBe(
    false,
  );
});

test("only a registry throttle is retried", () => {
  expect(
    isRegistryThrottle("Error response from daemon: toomanyrequests: Data limit exceeded"),
  ).toBe(true);
  expect(isRegistryThrottle("manifest unknown")).toBe(false);
  expect(isRegistryThrottle("port is already allocated")).toBe(false);
});

test("the accounts are the fixture's, created through GoTrue, never by SQL", () => {
  const fixture = read("scripts/fixtures/talent-discovery-fixture.sql");
  for (const p of PEOPLE) expect(fixture).toContain(`'${p.id}', '${p.email}'`);
  expect(fixture).toMatch(
    /\\if :\{\?real_auth\}[\s\S]*?\\else[\s\S]*?INSERT INTO auth\.users[\s\S]*?\\endif/,
  );
  const run = read("scripts/talent-discovery-real-ci-run.mjs");
  expect(run).toContain("/auth/v1/admin/users");
  expect(run).toContain('"real_auth=1"');
  expect(run).toContain("requireCompleteHistory");
  expect(run).not.toMatch(
    /INSERT INTO auth\.|request\.jwt\.claim|SET (?:LOCAL )?ROLE|auth-gateway|00_bootstrap/,
  );
  expect(run).toContain("TD_REAL_STACK");
});

test("the spec proves notices without mail on the real stack, and the workflow is pinned", () => {
  const spec = read("e2e/talent-discovery-local.spec.ts");
  expect(spec).toContain('process.env.TD_REAL_STACK === "1"');
  expect(spec).toContain('expect(rows().split(",")).not.toContain("sent")');
  const workflow = read(".github/workflows/talent-discovery-real-ci.yml");
  expect(workflow).toContain(`version: ${CLI_VERSION}`);
  expect(workflow).toContain("bun test ./scripts/talent-discovery-real-ci.test.ts");
  expect(workflow).toContain("node scripts/talent-discovery-real-ci-run.mjs");
  expect(workflow).not.toMatch(/continue-on-error|ref: (?:main|latest)/);
  expect(workflow).toContain("TD_REAL_DISPOSABLE: 1");
});
