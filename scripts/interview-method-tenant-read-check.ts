/**
 * Pilot blocker 2 — the interview-method library tenant-read source guard.
 *
 * The database suite (supabase/tests/scp_interview_method_library_tenant_read_test.sql)
 * proves the employer read boundary against a replayed schema, but it runs
 * only in the database job. This guard reads the migration, the rollback, the
 * suite, the WHOLE migration history and the release bookkeeping STRUCTURALLY,
 * in the fast job, so a defect that never reaches a replay is still caught —
 * and so every material assertion has a planted negative control
 * (scripts/negative-controls/interview-method-tenant-read-controls.ts).
 *
 * It inspects the real computation: the predicate's body with comments
 * stripped, the grant statements, the five policy predicates, the LAST
 * surviving definition of each policy across every migration in filename
 * order, the postflight proof, the rollback and the harness wiring. Never a
 * reassuring comment, and never an error-message string on its own.
 *
 * Run: bun run interview-method-tenant-read:check
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const MIGRATION_NAME = "20261115090000_scp_interview_method_library_tenant_read.sql";
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const MIGRATION = join(MIGRATIONS_DIR, MIGRATION_NAME);
const ROLLBACK = join(
  ROOT,
  "supabase/rollback/20261115090000_scp_interview_method_library_tenant_read_rollback.sql",
);
const SUITE = join(ROOT, "supabase/tests/scp_interview_method_library_tenant_read_test.sql");
const FULL_UNWIND = join(ROOT, "supabase/tests/scp_a_rollback_test.sql");
const DB_TEST = join(ROOT, "scripts/db-test.sh");
const RELEASE_STATE = join(ROOT, "supabase/release-state.json");
const FRONTIER = join(ROOT, "scripts/release-frontier-check.ts");
const PACKAGE = join(ROOT, "package.json");
const CI = join(ROOT, ".github/workflows/ci.yml");
const TSCONFIG = join(ROOT, "tsconfig.scripts.json");

const PREDICATE = "scp_iv_employer_may_read_method";

/** The five policies the finding named, with the table each lives on. */
const POLICIES: ReadonlyArray<readonly [table: string, policy: string, governance: boolean]> = [
  ["scp_interview_methods", "scp_interview_methods_employer_read", false],
  ["scp_interview_method_practices", "scp_interview_method_practices_employer_read", false],
  ["scp_interview_conduct_steps", "scp_interview_conduct_steps_read", true],
  ["scp_interview_conduct_prohibitions", "scp_interview_conduct_prohibitions_read", true],
  ["scp_interview_conduct_guidance", "scp_interview_conduct_guidance_read", true],
];

const failures: string[] = [];
let assertions = 0;

function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");
}

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function functionText(sql: string, name: string): string | null {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`);
  const m = re.exec(sql);
  if (!m) return null;
  const start = m.index;
  const bodyStart = sql.indexOf("$$", start);
  if (bodyStart === -1) return null;
  const bodyEnd = sql.indexOf("$$;", bodyStart + 2);
  if (bodyEnd === -1) return null;
  return sql.slice(start, bodyEnd + 3);
}

function functionBody(fn: string): string {
  return stripComments(fn.slice(fn.indexOf("$$") + 2));
}

/** Every `CREATE POLICY <p> ON public.<t> …;` / `ALTER POLICY <p> ON public.<t> …;`
 *  statement in a migration, comments stripped. Policies never carry a
 *  dollar-quoted body, so the first `;` ends the statement. */
function policyStatements(sql: string, table: string, policy: string): string[] {
  const bare = stripComments(sql);
  const re = new RegExp(`(CREATE|ALTER) POLICY ${policy} ON public\\.${table}\\b[^;]*;`, "g");
  return [...bare.matchAll(re)].map((m) => squash(m[0]));
}

const migration = existsSync(MIGRATION) ? read(MIGRATION) : "";
const bare = stripComments(migration);

// ── 1. The predicate ─────────────────────────────────────────────────────
{
  check(existsSync(MIGRATION), `IMTR-MIGRATION: ${MIGRATION_NAME} exists in the active path`);
  const fn = functionText(bare, PREDICATE);
  check(fn !== null, "IMTR-PREDICATE: the migration defines scp_iv_employer_may_read_method(uuid)");
  const header = fn ? squash(fn.slice(0, fn.indexOf("$$"))) : "";
  const body = fn ? squash(functionBody(fn)) : "";
  check(
    /RETURNS boolean/.test(header) && /SECURITY DEFINER/.test(header),
    "IMTR-PREDICATE: it is a boolean SECURITY DEFINER function (an invoker-rights read of its own table's policy would recurse)",
  );
  check(/SET search_path = public/.test(header), "IMTR-PREDICATE: and pins search_path = public");
  check(
    /^SELECT auth\.uid\(\) IS NOT NULL AND _method_id IS NOT NULL AND \(/.test(body),
    "IMTR-PREDICATE: it verifies auth.uid() first and answers false for a null method",
  );
  check(
    /WHERE m\.id = _method_id AND m\.approval_state = 'approved'\)/.test(body),
    "IMTR-PREDICATE: the approved-contract branch admits approval_state = 'approved' and nothing else",
  );
  check(
    /FROM public\.scp_interview_cases c JOIN public\.employer_memberships em ON em\.employer_id = c\.employer_id WHERE c\.trust_method_id = _method_id AND em\.user_id = auth\.uid\(\) AND em\.status = 'active'/.test(
      body,
    ),
    "IMTR-PREDICATE: the case-linked branch requires a case of the CALLER'S OWN employer that pins this exact method",
  );
  check(
    (body.match(/em\.user_id = auth\.uid\(\) AND em\.status = 'active'/g) ?? []).length === 2,
    "IMTR-PREDICATE: both branches resolve membership from employer_memberships with status = 'active'",
  );
  check(
    !/(raw_user_meta_data|user_metadata|app_metadata|jwt\.claims|jwt\.claim\.)/i.test(body),
    "IMTR-PREDICATE: the body reads no JWT metadata claim for authorisation",
  );
  check(
    !/employer_is_active_status/.test(body),
    "IMTR-PREDICATE: continuity is not re-gated on employer status, exactly as the pack read entitlement's pinned-case branch is not",
  );
  check(
    (bare.match(/CREATE OR REPLACE FUNCTION public\./g) ?? []).length === 1,
    "IMTR-PREDICATE: the migration defines exactly one function -- nothing else is redefined",
  );
}

// ── 2. The grants ────────────────────────────────────────────────────────
{
  check(
    /REVOKE ALL ON FUNCTION public\.scp_iv_employer_may_read_method\(uuid\) FROM PUBLIC, anon;/.test(
      bare,
    ),
    "IMTR-GRANTS: EXECUTE is revoked from PUBLIC and anon",
  );
  check(
    /GRANT EXECUTE ON FUNCTION public\.scp_iv_employer_may_read_method\(uuid\) TO authenticated, service_role;/.test(
      bare,
    ),
    "IMTR-GRANTS: and granted to authenticated and service_role only",
  );
  check(
    !/GRANT[^;]*scp_iv_employer_may_read_method[^;]*\banon\b/.test(bare) &&
      !/GRANT[^;]*scp_iv_employer_may_read_method[^;]*\bPUBLIC\b/.test(bare),
    "IMTR-GRANTS: no grant on the predicate names anon or PUBLIC",
  );
}

// ── 3. The five policies, as this migration leaves them ─────────────────
{
  for (const [table, policy, governance] of POLICIES) {
    const stmts = policyStatements(migration, table, policy);
    const last = stmts.at(-1) ?? "";
    check(
      stmts.length >= 1 && last.startsWith("ALTER POLICY"),
      `IMTR-POLICIES: ${policy} is re-pointed with ALTER POLICY (never absent), not dropped and re-created`,
    );
    check(last.includes(`${PREDICATE}(`), `IMTR-POLICIES: ${policy} decides through the predicate`);
    check(
      !/employer_memberships/i.test(last),
      `IMTR-POLICIES: ${policy} no longer carries the bare membership subquery`,
    );
    check(!/USING \(\s*true\s*\)/i.test(last), `IMTR-POLICIES: ${policy} is not unconditional`);
    if (governance) {
      check(
        last.includes("scp_interview_can_read(auth.uid()) OR"),
        `IMTR-POLICIES: ${policy} keeps the governance-reader read alongside the employer predicate`,
      );
    }
  }
  check(!/DROP POLICY/i.test(bare), "IMTR-POLICIES: the migration drops no policy at all");
}

// ── 4. The surviving state across the whole history ─────────────────────
// A migration history is append-only. What matters is not what this file
// says but what the LAST definition of each policy says after every
// migration has replayed in filename order. A later file that re-creates a
// policy with the old predicate would silently reopen the finding.
{
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const [table, policy] of POLICIES) {
    let last = "";
    let lastFile = "";
    for (const file of files) {
      const stmts = policyStatements(read(join(MIGRATIONS_DIR, file)), table, policy);
      if (stmts.length > 0) {
        last = stmts.at(-1) ?? "";
        lastFile = file;
      }
    }
    check(
      lastFile === MIGRATION_NAME,
      `IMTR-SURVIVING: the last definition of ${policy} in filename order is this migration's (found in ${lastFile || "nowhere"})`,
    );
    check(
      last.includes(`${PREDICATE}(`) && !/employer_memberships/i.test(last),
      `IMTR-SURVIVING: and that surviving definition decides through the predicate, not bare membership`,
    );
  }
  check(
    files.filter((f) => f.startsWith("20261115090000")).length === 1,
    "IMTR-SURVIVING: the version 20261115090000 is held by exactly one active file",
  );
}

// ── 5. The postflight proves, from the catalogue and by execution ───────
{
  const proofStart = bare.indexOf("DO $proof$");
  const proof = proofStart >= 0 ? bare.slice(proofStart) : "";
  check(
    proof.includes("RAISE NOTICE 'SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF ok'"),
    "IMTR-POSTFLIGHT: the migration ends with a postflight proof that raises its marker only on success",
  );
  check(
    /IF has_function_privilege\('anon', _fn, 'EXECUTE'\) THEN\s+RAISE EXCEPTION/.test(proof),
    "IMTR-POSTFLIGHT: it refuses to complete if anon can execute the predicate",
  );
  check(
    /aclexplode\(coalesce\(p\.proacl, acldefault\('f', p\.proowner\)\)\) a\s+WHERE p\.oid = _fn AND a\.grantee = 0\) THEN\s+RAISE EXCEPTION/.test(
      proof,
    ),
    "IMTR-POSTFLIGHT: or if PUBLIC can",
  );
  check(
    /c LIKE 'search_path=%'\) THEN\s+RAISE EXCEPTION/.test(proof),
    "IMTR-POSTFLIGHT: or if search_path is not pinned",
  );
  check(
    /position\('scp_iv_employer_may_read_method\(' IN _qual\) = 0 THEN\s+RAISE EXCEPTION/.test(
      proof,
    ) && /_qual ILIKE '%employer_memberships%' THEN\s+RAISE EXCEPTION/.test(proof),
    "IMTR-POSTFLIGHT: or if any of the five policies is not routed through the predicate or still decides on bare membership",
  );
  check(
    /IF NOT EXISTS \(SELECT 1 FROM pg_policies pol[^;]*pol\.qual LIKE '%scp_interview_can_read\(auth\.uid\(\)\)%'\) THEN\s+RAISE EXCEPTION/.test(
      proof,
    ),
    "IMTR-POSTFLIGHT: or if a table lost its governance-reader read",
  );
  check(
    /has_table_privilege\('anon', 'public\.' \|\| _t, 'SELECT'\) THEN\s+RAISE EXCEPTION/.test(
      proof,
    ),
    "IMTR-POSTFLIGHT: or if anon can read any of the five tables",
  );
  check(
    /bool_or\(public\.scp_iv_employer_may_read_method\(m\.id\)\)/.test(proof) &&
      /public\.scp_iv_employer_may_read_method\(NULL\) IS DISTINCT FROM false/.test(proof),
    "IMTR-POSTFLIGHT: and it EXERCISES the predicate: false for every method with no auth.uid(), false for a null method",
  );
  check(
    /\(raw_user_meta_data\|user_metadata\|app_metadata\|jwt\\\.claims\)/.test(proof),
    "IMTR-POSTFLIGHT: and refuses a predicate body that reads a JWT claim",
  );
}

// ── 6. The rollback ──────────────────────────────────────────────────────
{
  check(existsSync(ROLLBACK), "IMTR-ROLLBACK: the rollback file exists");
  const rb = existsSync(ROLLBACK) ? read(ROLLBACK) : "";
  const rbBare = stripComments(rb);
  for (const [table, policy, governance] of POLICIES) {
    const stmts = policyStatements(rb, table, policy);
    const last = stmts.at(-1) ?? "";
    check(
      last.startsWith("ALTER POLICY") &&
        /EXISTS \(SELECT 1 FROM public\.employer_memberships em WHERE em\.user_id = auth\.uid\(\) AND em\.status = 'active'\)/.test(
          last,
        ) &&
        !last.includes(PREDICATE) &&
        (!governance || last.includes("scp_interview_can_read(auth.uid()) OR")),
      `IMTR-ROLLBACK: it restores ${policy} to its previous membership predicate verbatim, through ALTER POLICY`,
    );
  }
  check(
    /DROP FUNCTION IF EXISTS public\.scp_iv_employer_may_read_method\(uuid\);/.test(rbBare),
    "IMTR-ROLLBACK: and drops the predicate",
  );
  check(
    /RAISE EXCEPTION 'SCP_IV_METHOD_LIBRARY_TENANT_READ_ROLLBACK BLOCKED: % now depends on/.test(
      rbBare,
    ),
    "IMTR-ROLLBACK: refusing first if any other policy has come to depend on the predicate",
  );
  check(
    /d\.refclassid = 'pg_proc'::regclass AND d\.refobjid = _fn/.test(rbBare),
    "IMTR-ROLLBACK: or any other catalogue object",
  );
  check(
    rbBare.includes("RAISE NOTICE 'SCP_IV_METHOD_LIBRARY_TENANT_READ_ROLLBACK ok'") &&
      /IF _n <> 5 THEN\s+RAISE EXCEPTION/.test(rbBare),
    "IMTR-ROLLBACK: and proves all five membership predicates are back before it reports success",
  );
  const unwind = read(FULL_UNWIND);
  const dropMethod = unwind.indexOf(
    "DROP FUNCTION IF EXISTS public.scp_iv_employer_may_read_method(uuid);",
  );
  const dropPack = unwind.indexOf(
    "DROP FUNCTION IF EXISTS public.scp_iv_employer_may_read_pack(uuid);",
  );
  check(
    dropMethod >= 0 && dropPack > dropMethod,
    "IMTR-ROLLBACK: the documented full unwind drops the predicate alongside the pack read entitlement",
  );
}

// ── 7. The suite proves rather than reports ─────────────────────────────
{
  check(existsSync(SUITE), "IMTR-SUITE: the behaviour suite exists");
  const suite = existsSync(SUITE) ? read(SUITE) : "";
  check(
    /^BEGIN;/m.test(suite) && /^ROLLBACK;$/m.test(suite),
    "IMTR-SUITE: the whole suite runs in one transaction that is rolled back, so it seeds nothing",
  );
  check(/SYNTETISK/.test(suite), "IMTR-SUITE: everything it plants is labelled synthetic");
  const labels = [...suite.matchAll(/'(ML\d+\.\d+ [^']+)'/g)].map((m) => m[1]);
  check(
    labels.length >= 120,
    `IMTR-SUITE: it carries at least 120 labelled assertions (found ${labels.length})`,
  );
  check(
    new Set(labels).size === labels.length,
    "IMTR-SUITE: and no two assertions share a label, so a failure names exactly one thing",
  );
  for (let g = 0; g <= 11; g += 1) {
    check(new RegExp(`GROUP ML${g} —`).test(suite), `IMTR-SUITE: group ML${g} is present`);
  }
  check(
    suite.includes("'user_metadata', json_build_object(") &&
      suite.includes("'app_metadata', json_build_object(") &&
      suite.includes("'is_platform_admin', true"),
    "IMTR-SUITE: it forges user_metadata and app_metadata admin and employer claims and requires them to grant nothing",
  );
  check(
    suite.includes("SET LOCAL ROLE anon;") &&
      suite.includes("'permission denied', 'ML5.7 anon cannot execute the method predicate'"),
    "IMTR-SUITE: it proves anon is refused at the function, not assumed",
  );
  check(
    suite.includes("GRANT SELECT ON ml TO authenticated, anon;"),
    "IMTR-SUITE: and anon can read the fixture handle, so a refusal there cannot pass for the real one",
  );
  check(
    suite.includes(
      "= 'cd_get_shared_report, cd_record_funnel_event, cd_submit_test_feedback, employer_is_active_status'",
    ) && suite.includes("_grantees = 'authenticated, service_role'"),
    "IMTR-SUITE: it pins the anon-executable SECURITY DEFINER allowlist and the predicate's exact executor set",
  );
  for (const sp of [
    "ml_weakened_policy",
    "ml_weakened_predicate",
    "ml_weakened_grant",
    "ml_unconditional",
  ]) {
    // Line-anchored: "ROLLBACK TO SAVEPOINT x;" contains "SAVEPOINT x;", so a
    // substring test would still pass with the savepoint itself removed.
    check(
      new RegExp(`^SAVEPOINT ${sp};$`, "m").test(suite) &&
        new RegExp(`^ROLLBACK TO SAVEPOINT ${sp};$`, "m").test(suite),
      `IMTR-SUITE: the in-suite control ${sp} plants a defect and undoes it`,
    );
  }
  check(
    (suite.match(/CONTROL:/g) ?? []).length >= 5,
    "IMTR-SUITE: and each control asserts that the SAME boundary assertion now fails",
  );
  check(
    suite.includes("public.scp_iv_create_case(") &&
      suite.includes("scp_interview_pack_pilot_grants"),
    "IMTR-SUITE: fixtures are built through the governed case RPC and a real pilot grant, not by assuming states",
  );
}

// ── 8. Registration ─────────────────────────────────────────────────────
{
  const dbTest = read(DB_TEST);
  check(
    dbTest.includes("supabase/tests/scp_interview_method_library_tenant_read_test.sql"),
    "IMTR-REGISTRATION: the behaviour suite runs in scripts/db-test.sh",
  );
  const floor = /ML_PASSED" -lt (\d+)/.exec(dbTest);
  check(
    floor !== null && Number(floor[1]) >= 120,
    "IMTR-REGISTRATION: with an assertion floor of at least 120, so a silently shrinking suite fails rather than passes",
  );
  check(
    dbTest.includes("SCP_IV_METHOD_LIBRARY_TENANT_READ_ROLLBACK ok") &&
      dbTest.includes("SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF ok"),
    "IMTR-REGISTRATION: the rollback and the re-apply are executed for real, with their proofs required",
  );
  check(
    dbTest.includes(
      'if [ "$ML_WEAK_RC" -eq 0 ] || ! echo "$ML_WEAK" | grep -q "ASSERTION FAILED"; then',
    ),
    "IMTR-REGISTRATION: and the suite is run against the rolled-back schema and REQUIRED to fail there",
  );

  const pkg = read(PACKAGE);
  check(
    pkg.includes('"interview-method-tenant-read:check"'),
    "IMTR-REGISTRATION: the guard has a package script",
  );
  check(
    pkg.includes('"negative-controls:interview-method-tenant-read"') &&
      /"negative-controls:all":[^\n]*negative-controls:interview-method-tenant-read/.test(pkg),
    "IMTR-REGISTRATION: its controls have a script AND are part of negative-controls:all",
  );
  const ci = read(CI);
  check(
    ci.includes("interview-method-tenant-read:check"),
    "IMTR-REGISTRATION: the guard runs in CI",
  );
  check(
    ci.includes("negative-controls:all"),
    "IMTR-REGISTRATION: and CI runs negative-controls:all, which the package script puts these controls inside",
  );
  const tsconfig = read(TSCONFIG);
  check(
    tsconfig.includes('"scripts/interview-method-tenant-read-check.ts"') &&
      tsconfig.includes('"scripts/negative-controls/interview-method-tenant-read-controls.ts"'),
    "IMTR-REGISTRATION: the guard and its controls are typechecked",
  );

  const state = JSON.parse(read(RELEASE_STATE)) as {
    frontier?: Array<{
      file?: string;
      hostedState?: string;
      evidenceSource?: string;
      verify?: unknown;
      rollback?: unknown;
      introduces?: Array<{ object?: string; kind?: string }>;
    }>;
  };
  const entry = (state.frontier ?? []).find((m) => m.file === MIGRATION_NAME);
  check(
    entry !== undefined,
    "IMTR-REGISTRATION: the migration is classified on the release frontier",
  );
  check(
    entry?.introduces?.some((o) => o.object === PREDICATE && o.kind === "function") === true,
    "IMTR-REGISTRATION: and declares the predicate it introduces, so release-parity can see any code dependency",
  );
  check(
    typeof entry?.rollback === "string" && typeof entry?.verify === "string",
    "IMTR-REGISTRATION: with its rollback and a hosted verification query recorded",
  );
  // SCHEMA-FIRST, now settled. The official Supabase GitHub integration applied
  // the migration when #241 merged; the entry is therefore "applied" and MUST
  // carry the read-only evidence that says so. Asserting both together is the
  // point: a state flipped without evidence is exactly the unproved claim this
  // guard exists to refuse.
  check(
    entry?.hostedState === "applied",
    "IMTR-REGISTRATION: it is declared applied -- the integration applied it to production on merge",
  );
  check(
    typeof entry?.evidenceSource === "string" && entry.evidenceSource.length > 0,
    "IMTR-REGISTRATION: with hosted evidence recorded alongside that state, never a bare flip",
  );
  check(
    entry?.evidenceSource?.includes("wrygicdfxwjnrugduxnt") === true,
    "IMTR-REGISTRATION: and that evidence names the one canonical hosted project",
  );
  const frontier = read(FRONTIER);
  check(
    !new RegExp(`"${MIGRATION_NAME}"`).test(
      /const expectedPending: string\[\] = \[[^\]]*\]/.exec(frontier)?.[0] ?? "",
    ),
    "IMTR-REGISTRATION: and the frontier selection check no longer expects it pending",
  );
}

// ── 9. Nothing else moves ────────────────────────────────────────────────
{
  check(
    !/\b(beskt_|bcp_|sp_)[a-z_]+/i.test(bare),
    "IMTR-NO-REGRESSION: the migration names no BESKT, candidate-preparation or Security Passport object",
  );
  check(
    !/\b(CREATE|ALTER|DROP) TABLE\b/i.test(bare),
    "IMTR-NO-REGRESSION: it creates, alters or drops no table",
  );
  check(
    !/scp_iv_employer_may_read_pack\s*\(/.test(
      bare.replace(/scp_iv_employer_may_read_pack\(\)/g, ""),
    ),
    "IMTR-NO-REGRESSION: it does not redefine the pack read entitlement",
  );
  check(
    !/ON public\.scp_interview_pack/.test(bare) && !/ON public\.scp_interview_cases/.test(bare),
    "IMTR-NO-REGRESSION: it touches no pack-content or case policy",
  );
  check(
    !/GRANT [^;]* ON (TABLE )?public\./i.test(bare) &&
      !/REVOKE [^;]* ON (TABLE )?public\./i.test(bare),
    "IMTR-NO-REGRESSION: it changes no table grant",
  );
}

if (failures.length > 0) {
  console.error(
    `\nInterview-method library tenant-read guard FAILED (${failures.length} of ${assertions}).`,
  );
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `\nInterview-method library tenant-read guard: ${assertions} of ${assertions} assertions passed.`,
);
