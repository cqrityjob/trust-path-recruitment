/**
 * Test → interview: one interview per intended start (20261202090000 + #273).
 *
 * The DB suite (scp_interview_starts_test.sql) and the two-connection race in
 * db-test.sh prove the database half; the routed walk
 * (e2e/test-interview-report-journey.spec.ts) proves the journey. This guard
 * runs in the fast job and fails if the app stops keeping its half:
 *
 *   IS-ROUTE     different setups route to their own guide, from fixture
 *                catalogues; a test's recorded setup wins and cannot be
 *                swapped; a setup that does not belong to the test is refused;
 *   IS-NO-GUESS  no start without a source setup or an explicit choice, and
 *                no Väktare literal in the start path;
 *   IS-ATOMIC    the start is ONE database call, serialised on the start key,
 *                with a partial unique index -- and no uniqueness on the
 *                application alone;
 *   IS-SOURCE    the button is per completed test and passes that test;
 *   IS-BIND      every application-bound case is bound to its applicant, and a
 *                failed read never becomes an invented reference;
 *   IS-HONEST    a reopened case whose setup or material is missing is said to
 *                be incomplete.
 *
 * Run: bun run interview-start:check
 */

import { readFileSync } from "node:fs";
import {
  routeInterviewStart,
  startChoices,
  LIVE_CATALOGUE,
  type StartCatalogue,
} from "../src/lib/library/start-routing";

const read = (p: string) => readFileSync(p, "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const fails: string[] = [];
let passed = 0;
function check(ok: boolean, label: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok ${label}`);
  } else {
    fails.push(label);
    console.log(`  FAIL ${label}`);
  }
}

// ---- routing, from isolated fixture catalogues ------------------------------------
// Two fixture roles with their own guides and tests, two environments: none of
// this is content the product ships; it proves the routing is by setup.
const FIXTURE: StartCatalogue = {
  content: {
    vaktare: { guidePackSlug: "fixture-guard-guide", assessmentSlug: "fixture-guard-test" },
    security_manager: {
      guidePackSlug: "fixture-manager-guide",
      assessmentSlug: "fixture-manager-test",
    },
  },
  profiles: [
    { key: "vaktare", group: "operational" },
    { key: "security_manager", group: "strategic" },
  ],
  environments: ["general", "hospital"],
};
const guard = { roleGroup: "operational", roleProfile: "vaktare", environment: "general" } as const;
const manager = {
  roleGroup: "strategic",
  roleProfile: "security_manager",
  environment: "hospital",
} as const;

const a = routeInterviewStart(
  { testSlug: "fixture-guard-test", recorded: guard, chosen: null },
  FIXTURE,
);
const b = routeInterviewStart(
  { testSlug: "fixture-manager-test", recorded: manager, chosen: null },
  FIXTURE,
);
const c = routeInterviewStart({ testSlug: null, recorded: null, chosen: manager }, FIXTURE);
check(
  a.kind === "route" &&
    a.guidePackSlug === "fixture-guard-guide" &&
    a.fromSource &&
    b.kind === "route" &&
    b.guidePackSlug === "fixture-manager-guide" &&
    b.setup.environment === "hospital" &&
    c.kind === "route" &&
    c.guidePackSlug === "fixture-manager-guide" &&
    !c.fromSource,
  "IS-ROUTE-1: each setup routes to its own role's guide, from the test's recorded setup or an explicit choice",
);
check(
  routeInterviewStart({ testSlug: "fixture-guard-test", recorded: guard, chosen: manager }, FIXTURE)
    .kind === "refused" &&
    (
      routeInterviewStart(
        { testSlug: "fixture-guard-test", recorded: null, chosen: manager },
        FIXTURE,
      ) as {
        reason?: string;
      }
    ).reason === "setup_test_mismatch",
  "IS-ROUTE-2: a test's recorded setup cannot be swapped, and a setup whose test was not the one taken is refused",
);
const choose = routeInterviewStart(
  { testSlug: "fixture-manager-test", recorded: null, chosen: null },
  FIXTURE,
);
check(
  choose.kind === "choose" &&
    choose.choices.length === 2 &&
    choose.choices.every((x) => x.roleProfile === "security_manager"),
  "IS-ROUTE-3: a test sent without a setup offers only the setups built on THAT test",
);
check(
  routeInterviewStart({ testSlug: null, recorded: null, chosen: null }, FIXTURE).kind ===
    "choose" && startChoices(null, FIXTURE).length === 4,
  "IS-NO-GUESS-1: before any test nothing is started without an explicit choice",
);
check(
  (
    routeInterviewStart(
      { testSlug: null, recorded: null, chosen: { ...guard, environment: "data_centre" } },
      FIXTURE,
    ) as { reason?: string }
  ).reason === "environment_without_content" &&
    startChoices(null, LIVE_CATALOGUE).every(
      (x) => x.roleProfile === "vaktare" && x.environment === "general",
    ),
  "IS-ROUTE-4: an environment without content is refused, and live content offers exactly what exists",
);

// ---- the source -----------------------------------------------------------------
const start = code(read("src/lib/library/start.functions.ts"));
const startFn = /export const startApplicationInterview[\s\S]*?\n {2}\}\);/.exec(start)?.[0] ?? "";
check(
  startFn.includes('"scp_iv_start_interview"') &&
    (startFn.match(/rpc\(db, "/g) ?? []).length === 2 &&
    !/\.insert\(|scp_iv_create_case|createCaseCore/.test(startFn),
  "IS-ATOMIC-1: the start is one database call (scp_iv_start_interview) -- no read-then-create in the app",
);
check(
  !/vaktare/i.test(startFn) &&
    !/vaktare|"general"/.test(code(read("src/components/library/PrepareInterviewButton.tsx"))),
  "IS-NO-GUESS-2: no role or environment is written into the start path; it comes from the source or a choice",
);
check(
  /complete: res\.setup_recorded && res\.material > 0/.test(startFn),
  "IS-HONEST: a case whose setup or material is missing is returned as incomplete",
);

const mig = read("supabase/migrations/20261202090000_scp_interview_starts.sql");
const startBody =
  /CREATE OR REPLACE FUNCTION public\.scp_iv_start_interview[\s\S]*?\n\$\$;/.exec(mig)?.[0] ?? "";
check(
  /pg_advisory_xact_lock\(hashtextextended\('scp_iv_start:' \|\| _employer_id::text \|\| ':' \|\| _key, 0\)\)/.test(
    startBody,
  ) &&
    /CREATE UNIQUE INDEX scp_interview_starts_one_live\s+ON public\.scp_interview_starts \(employer_id, start_key\) WHERE superseded_at IS NULL;/.test(
      mig,
    ) &&
    startBody.indexOf("pg_advisory_xact_lock(hashtextextended('scp_iv_start:") <
      startBody.indexOf("public.scp_iv_create_case("),
  "IS-ATOMIC-2: the start serialises on employer + start key before it creates, and one live start per key is a constraint",
);
check(
  !/UNIQUE[^;\n]*\(\s*application_id\s*\)|application_id uuid[^,\n]*UNIQUE/i.test(mig) &&
    /'assessment:' \|\| _source_id::text/.test(startBody) &&
    /'beskt:' \|\| _source_id::text/.test(startBody),
  "IS-ATOMIC-3: the start is identified by its source -- no uniqueness on the application alone",
);
check(
  /_app\.applicant_user_id,\s*CASE WHEN _app\.applicant_user_id IS NULL THEN 'APP-'/.test(
    startBody,
  ) && /aa\.recipient_user_id IS NOT DISTINCT FROM _app\.applicant_user_id/.test(startBody),
  "IS-BIND-1: the database binds the applicant's own account, and the test must be that applicant's",
);

const runtime = code(read("src/lib/interview-intelligence/runtime.functions.ts"));
const core = /async function createCaseCore[\s\S]*?\n\}/.exec(runtime)?.[0] ?? "";
check(
  /if \(data\.applicationId\) \{\s*const app = await context\.supabase\s*\.from\("job_applications"\)/.test(
    core,
  ) &&
    /if \(app\.error\) throw new Error\(app\.error\.message\);/.test(core) &&
    !/data\.bindApplicant/.test(core) &&
    !/prepareApplicationInterview/.test(runtime),
  "IS-BIND-2: every application-bound case binds its applicant; a failed read throws; the old guessing prepare is gone",
);

const panel = code(read("src/components/academy/ApplicationAssessmentPanel.tsx"));
check(
  /\.filter\(\(a\) =>\s*\["under_review", "brief_ready", "brief_released"\]\.includes\(assessmentStageOf\(a\)\),?\s*\)\s*\.map\(\(a\) => \(/.test(
    panel,
  ) && /assessmentAssignmentId=\{a\.assignmentId\}/.test(panel),
  "IS-SOURCE: Förbered intervju is offered per completed test and carries THAT test",
);

console.log("");
if (fails.length > 0) {
  console.error(`interview-start:check FAILED (${fails.length} of ${passed + fails.length}).`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`interview-start:check: ${passed} assertions passed.`);
