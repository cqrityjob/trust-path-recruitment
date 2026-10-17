import { test, expect } from "bun:test";
import fs from "node:fs";
import * as td from "./talent-discovery-real-ci-contract.mjs";
import {
  API,
  APP,
  CONFIG,
  CLI_VERSION,
  CV_BUCKET,
  MAIL_ALLOWLIST,
  NEW_OWNER_EMAIL,
  PEOPLE,
  PROJECT,
  SCENARIOS,
  appEnvironment,
  deriveConfig,
  requireBrowserCounts,
  requireRunner,
  requireStatus,
} from "./employer-journey-real-ci-contract.mjs";

const read = (p: string) => fs.readFileSync(p, "utf8");
const jwt = (role: string) => `x.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.y`;
const runner = {
  CI: "true",
  GITHUB_ACTIONS: "true",
  RUNNER_OS: "Linux",
  RUNNER_ENVIRONMENT: "github-hosted",
  EJ_REAL_DISPOSABLE: "1",
  EJ_REAL_EVIDENCE_SHA: "a".repeat(40),
};

test("runs only on a disposable GitHub-hosted runner, on its own variables", () => {
  expect(() => requireRunner(runner)).not.toThrow();
  for (const patch of [
    { CI: "false" },
    { RUNNER_ENVIRONMENT: "self-hosted" },
    { EJ_REAL_DISPOSABLE: "0" },
    { EJ_REAL_EVIDENCE_SHA: "main" },
    { SUPABASE_ACCESS_TOKEN: "refused" },
    { RESEND_API_KEY: "refused" },
  ])
    expect(() => requireRunner({ ...runner, ...patch })).toThrow(/^EJ_REAL_/);
  // The talent run's switches do not open this run.
  const { EJ_REAL_DISPOSABLE: _d, EJ_REAL_EVIDENCE_SHA: _s, ...rest } = runner;
  expect(() =>
    requireRunner({ ...rest, TD_REAL_DISPOSABLE: "1", TD_REAL_EVIDENCE_SHA: "a".repeat(40) }),
  ).toThrow();
});

test("its own stack: never the talent run's ports or project, never a hosted project", () => {
  const status = {
    API_URL: API,
    DB_URL: "postgresql://postgres:postgres@127.0.0.1:55891/postgres",
    ANON_KEY: jwt("anon"),
    SERVICE_ROLE_KEY: jwt("service_role"),
  };
  expect(requireStatus(status).API_URL).toBe(API);
  for (const patch of [
    { API_URL: td.API },
    { API_URL: "https://wrygicdfxwjnrugduxnt.supabase.co" },
    { DB_URL: "postgresql://postgres:x@127.0.0.1:55791/postgres" },
    { DB_URL: "postgresql://postgres:x@db.example.invalid:5432/postgres" },
    { ANON_KEY: jwt("service_role") },
    { SERVICE_ROLE_KEY: jwt("anon") },
  ])
    expect(() => requireStatus({ ...status, ...patch })).toThrow(/^EJ_REAL_/);
  expect(PROJECT).not.toBe(td.PROJECT);
  expect(API).not.toBe(td.API);
  expect(APP).not.toBe(td.APP);
  for (const foreign of [td.PROJECT, td.APP, "55790", "55791", "55789"])
    expect(CONFIG).not.toContain(foreign);
  expect(CONFIG).toContain(`project_id = "${PROJECT}"`);
  expect(CONFIG).toContain("port = 55890\n");
  expect(CONFIG).toContain("port = 55891\n");
  expect(CONFIG).toContain("shadow_port = 55889\n");
});

test("sign-up is open without confirmation mail; everything else is the talent run's config", () => {
  expect(CONFIG).toMatch(
    /\[auth\]\nenabled = true\n[\s\S]*?\nenable_signup = true\nenable_anonymous_sign_ins = false\n/,
  );
  expect(CONFIG).toMatch(/\[auth\.email\]\nenable_signup = true\nenable_confirmations = false\n/);
  expect(CONFIG).toMatch(/\[storage\]\nenabled = true/);
  expect(CONFIG).toMatch(/\[edge_runtime\]\nenabled = false/);
  expect(CONFIG).toMatch(/\[local_smtp\]\nenabled = false/);
  expect(CONFIG).toContain("major_version = 17");
  // Exactly the stated differences: undoing them gives back the talent config.
  const back = deriveConfig(CONFIG, [
    [`project_id = "${PROJECT}"`, `project_id = "${td.PROJECT}"`, 1],
    ["port = 55890\n", "port = 55790\n", 1],
    ["port = 55891\n", "port = 55791\n", 1],
    ["shadow_port = 55889\n", "shadow_port = 55789\n", 1],
    [APP, td.APP, 2],
    [
      "enable_signup = true\nenable_anonymous_sign_ins",
      "enable_signup = false\nenable_anonymous_sign_ins",
      1,
    ],
  ]);
  expect(back).toBe(td.CONFIG);
  expect(() => deriveConfig("a", [["b", "c", 1]])).toThrow("EJ_REAL_CONFIG_DERIVATION_0_OF_1");
});

test("the app points at this stack and mail cannot leave", () => {
  const env = appEnvironment(
    { ANON_KEY: jwt("anon"), SERVICE_ROLE_KEY: jwt("service_role") },
    { PATH: "/bin", HOME: "/home/x", OPENAI_API_KEY: "never", RESEND_API_KEY: "never" },
  );
  expect(env.SUPABASE_URL).toBe(API);
  expect(env.VITE_SUPABASE_URL).toBe(API);
  expect(env.SUPABASE_PROJECT_ID).toBe(PROJECT);
  expect(env.VITE_SUPABASE_PROJECT_ID).toBe(PROJECT);
  expect(env.PUBLIC_SITE_URL).toBe(APP);
  expect(JSON.stringify(env)).not.toContain(td.API);
  expect(JSON.stringify(env)).not.toContain(td.APP);
  expect(env.PRODUCT_EMAIL_RECIPIENT_ALLOWLIST).toBe(MAIL_ALLOWLIST);
  expect(Object.keys(env).some((k) => /OPENAI|RESEND/.test(k))).toBe(false);
  expect(
    [...PEOPLE.map((p) => p.email), NEW_OWNER_EMAIL].some((e) => e.endsWith(MAIL_ALLOWLIST)),
  ).toBe(false);
});

test("every scenario passes, no fewer, none flaky or skipped", () => {
  const spec = read("e2e/employer-journey-local.spec.ts");
  expect((spec.match(/^test\("/gm) ?? []).length).toBe(SCENARIOS);
  expect(spec).not.toMatch(/mode: "serial"|test\.only|test\.fixme/);
  const ok = { expected: SCENARIOS, unexpected: 0, flaky: 0, skipped: 0 };
  expect(requireBrowserCounts(ok, SCENARIOS).complete).toBe(true);
  for (const patch of [{ expected: 6 }, { unexpected: 1 }, { flaky: 1 }, { skipped: 1 }])
    expect(() => requireBrowserCounts({ ...ok, ...patch }, SCENARIOS)).toThrow(
      "EJ_REAL_BROWSER_COUNTS_MISMATCH",
    );
});

test("the fixture seeds people and Passport data only; the journey makes the employer and the job", () => {
  const fixture = read("scripts/fixtures/employer-journey-fixture.sql");
  for (const p of PEOPLE) expect(fixture).toContain(`('${p.id}', '${p.email}',`);
  expect(fixture).not.toContain(NEW_OWNER_EMAIL);
  // No organisation, membership, job, requirement, profile or criteria rows.
  expect(fixture).not.toMatch(
    /INSERT INTO public\.(employers|employer_memberships|jobs|recruitment_\w+|rec_\w+)\b/,
  );
  expect(fixture).not.toMatch(/rec_ri_confirm_profile|rec_talent_confirm|INSERT INTO auth\./);
  expect(fixture).toContain("EJ_FIXTURE_NOT_FRESH");
  expect(fixture).toContain("EJ_FIXTURE_REAL_AUTH_REQUIRED");
  expect(fixture).toMatch(/'7e000000-0000-4000-8000-0000000000d1', 'admin'/);
  const run = read("scripts/employer-journey-real-ci-run.mjs");
  expect(run).toContain("real_auth: 1");
  expect(run).toContain("EJ_REAL_FIXTURE_SEEDED_TOO_MUCH");
  expect(run).toContain("EJ_REAL_SIGNUP_NOT_OPEN");
  expect(run).toContain('EJ_REAL_STACK: "1"');
  expect(run).not.toMatch(
    /INSERT INTO|request\.jwt\.claim|SET (?:LOCAL )?ROLE|storage\.(buckets|objects)/,
  );
  const lib = read("scripts/lib/real-supabase-ci.mjs");
  expect(lib).toContain("/auth/v1/admin/users");
  expect(lib).toContain("/storage/v1/bucket");
  expect(lib).toContain("requireCompleteHistory");
  expect(lib).not.toMatch(/INSERT INTO auth\.|storage\.(buckets|objects)|CREATE POLICY/);
  expect(CV_BUCKET).toEqual(td.CV_BUCKET);
});

test("the spec drives the product, reads the database only to assert, and is pinned in CI", () => {
  const spec = read("e2e/employer-journey-local.spec.ts");
  expect(spec).toContain('process.env.EJ_REAL_STACK === "1"');
  // sql() is a read: nothing in the spec writes rows or calls an RPC directly.
  expect(spec).not.toMatch(/\b(insert|update|delete)\s+(into|from)?\s*\w|\/rest\/v1\/rpc\//i);
  for (const route of ["/signup?redirect=", "/admin/employers/", "/jobs/new", "?step=publishing"])
    expect(spec).toContain(route);
  const workflow = read(".github/workflows/employer-journey-real-ci.yml");
  expect(workflow).toContain(`version: ${CLI_VERSION}`);
  expect(workflow).toContain("bun test ./scripts/employer-journey-real-ci.test.ts");
  expect(workflow).toContain("node scripts/employer-journey-real-ci-run.mjs");
  expect(workflow).toContain("EJ_REAL_DISPOSABLE: 1");
  expect(workflow).not.toMatch(/continue-on-error|ref: (?:main|latest)|TD_REAL_/);
});
