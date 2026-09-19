/**
 * Test / BESKT preparation → interview: one interview per intended start,
 * verified and created by the database (20261202090000 + #273).
 *
 * The DB suite (scp_interview_starts_test.sql, 80 assertions) and the two
 * two-connection races in db-test.sh prove the behaviour; the routed walk
 * (e2e/test-interview-report-journey.spec.ts) proves the journey. This guard
 * runs in the fast job and fails if the source stops keeping the contract:
 *
 *   IS-DB-VERIFY  the start checks role profile, role group, environment
 *                 content, the test's definition and the guide against
 *                 scp_recruitment_content_links -- before the lock and before
 *                 any write;
 *   IS-DB-LINK    a content link can only name a guide of its own role and a
 *                 test of that role's profession;
 *   IS-PARITY     the library's display catalogue (TRUST_CONTENT,
 *                 ENVIRONMENTS_WITH_CONTENT) says exactly what the seeded
 *                 content links say -- one truth, two readers;
 *   IS-NO-GUESS   the app resolves no guide and names no role in a start;
 *   IS-ATOMIC     every start is ONE database call, serialised on the start
 *                 key, with a partial unique index and no uniqueness on the
 *                 application alone;
 *   IS-BESKT      a BESKT start writes the governed link in the same
 *                 transaction, and the new-case form sends BESKT and every
 *                 application-bound case through the start;
 *   IS-BIND       the candidate is the application's applicant or the
 *                 account that accepted the invitation; the client path that
 *                 could name one refuses application-bound cases;
 *   IS-SOURCE     Förbered intervju is per completed test and carries it;
 *   IS-HONEST     a reopened case whose setup or material is missing is said
 *                 to be incomplete.
 *
 * Run: bun run interview-start:check
 */

import { readFileSync } from "node:fs";
import { ENVIRONMENTS_WITH_CONTENT, TRUST_CONTENT } from "../src/lib/library/catalogue";

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

const mig = read("supabase/migrations/20261202090000_scp_interview_starts.sql");
const startBody =
  /CREATE OR REPLACE FUNCTION public\.scp_iv_start_interview[\s\S]*?\n\$\$;/.exec(mig)?.[0] ?? "";
const lockAt = startBody.indexOf("pg_advisory_xact_lock(hashtextextended('scp_iv_start:");
const firstWrite = Math.min(
  ...[
    "public.scp_record_assessment_setup(",
    "public.scp_iv_create_case(",
    "UPDATE public.scp_interview_starts",
    "INSERT INTO public.scp_interview_starts",
  ]
    .map((w) => startBody.indexOf(w))
    .filter((i) => i >= 0),
);

// ---- the database verifies the setup ----------------------------------------------
const verify = [
  "SELECT * INTO _profile FROM public.scp_recruitment_role_profiles WHERE role_profile = _r;",
  "IF NOT FOUND OR _profile.role_group <> _g THEN",
  "SELECT * INTO _link FROM public.scp_recruitment_content_links",
  "'SCP_START_NO_CONTENT:",
  "AND _link.assessment_definition_id IS DISTINCT FROM _test_def THEN",
  "WHERE v.id = _pack_version_id AND v.pack_id = _link.interview_pack_id) THEN",
];
check(
  lockAt > 0 &&
    verify.every((v) => {
      const at = startBody.indexOf(v);
      return at > 0 && at < lockAt && at < firstWrite;
    }),
  "IS-DB-VERIFY: role group, environment content, the test's definition and the guide are verified against the content links before the lock and before any write",
);
check(
  /WHERE v\.pack_id = _link\.interview_pack_id\s+ORDER BY v\.version_number DESC/.test(startBody) &&
    !/_pack_version_id\s*:=/.test(startBody),
  "IS-DB-VERIFY-2: with no guide named, the setup's own guide is taken -- a supplied guide is only ever verified, never trusted",
);
const guard =
  /CREATE OR REPLACE FUNCTION public\.scp_guard_recruitment_content_link[\s\S]*?\n\$\$;/.exec(
    mig,
  )?.[0] ?? "";
check(
  /p\.pack_kind = 'role_interview' AND p\.role_id = rp\.role_id/.test(guard) &&
    /d\.profession_id = r\.profession_id/.test(guard) &&
    /BEFORE INSERT OR UPDATE ON public\.scp_recruitment_content_links/.test(mig),
  "IS-DB-LINK: a content link names only a role-interview guide of its own role and a test of that role's profession",
);

// ---- one truth, two readers ---------------------------------------------------------
const seeded = [
  ...mig.matchAll(
    /SELECT '(\w+)', '(\w+)', p\.id,\s*\(SELECT d\.id FROM public\.scp_assessment_definitions d WHERE d\.slug = '([\w-]+)'\)\s*FROM public\.scp_interview_packs p\s*WHERE p\.slug = '([\w-]+)'/g,
  ),
].map((m) => ({ profile: m[1], env: m[2], test: m[3], guide: m[4] }));
const catalogued = Object.entries(TRUST_CONTENT).filter(([, c]) => c !== null) as Array<
  [string, { guidePackSlug: string; assessmentSlug: string | null }]
>;
check(
  seeded.length === catalogued.length * ENVIRONMENTS_WITH_CONTENT.length &&
    catalogued.every(([profile, c]) =>
      ENVIRONMENTS_WITH_CONTENT.every((env) =>
        seeded.some(
          (s) =>
            s.profile === profile &&
            s.env === env &&
            s.guide === c.guidePackSlug &&
            s.test === c.assessmentSlug,
        ),
      ),
    ),
  "IS-PARITY: the library's catalogue says exactly what the seeded content links say",
);

// ---- the app decides nothing ----------------------------------------------------------
const start = code(read("src/lib/library/start.functions.ts"));
const startFn = /async function start\([\s\S]*?\n\}/.exec(start)?.[0] ?? "";
check(
  !/TRUST_CONTENT|vaktare-se|guidePackSlug|scp_iv_startable_pack_versions|role_profile: "|environment: "/.test(
    start,
  ) && !/vaktare|"general"/.test(code(read("src/components/library/PrepareInterviewButton.tsx"))),
  "IS-NO-GUESS: the app resolves no guide and names no role or environment in a start",
);
check(
  (startFn.match(/"scp_iv_start_interview"/g) ?? []).length === 1 &&
    !/scp_iv_create_case|createCaseCore|\.insert\(/.test(start) &&
    /start\(context\.supabase as unknown as Db, \{[\s\S]*?sourceKind: "beskt_assignment"/.test(
      start,
    ),
  "IS-ATOMIC-1: every start -- TRUST and BESKT -- is one call to scp_iv_start_interview; the app creates nothing itself",
);
check(
  /pg_advisory_xact_lock\(hashtextextended\('scp_iv_start:' \|\| _employer_id::text \|\| ':' \|\| _key, 0\)\)/.test(
    startBody,
  ) &&
    /CREATE UNIQUE INDEX scp_interview_starts_one_live\s+ON public\.scp_interview_starts \(employer_id, start_key\) WHERE superseded_at IS NULL;/.test(
      mig,
    ) &&
    lockAt < startBody.indexOf("public.scp_iv_create_case("),
  "IS-ATOMIC-2: the start serialises on employer + start key before it creates, and one live start per key is a constraint",
);
check(
  !/UNIQUE[^;\n]*\(\s*application_id\s*\)|application_id uuid[^,\n]*UNIQUE/i.test(mig) &&
    /'assessment:' \|\| _source_id::text/.test(startBody) &&
    /'beskt:' \|\| _source_id::text/.test(startBody),
  "IS-ATOMIC-3: the start is identified by its source -- no uniqueness on the application alone",
);

// ---- BESKT ---------------------------------------------------------------------------
const linkAt = startBody.indexOf("PERFORM public.bcp_link_preparation_to_case(");
check(
  linkAt > startBody.indexOf("public.scp_iv_create_case(") &&
    linkAt <
      startBody.indexOf(
        "INSERT INTO public.scp_interview_starts\n    (employer_id, application_id, start_key, source_kind, source_id, interview_case_id, created_by)\n  VALUES (_employer_id, _application_id, _key, _source_kind, _source_id, _case, auth.uid());",
      ) &&
    /'SCP_START_BESKT_NOT_SUBMITTED:/.test(startBody) &&
    /FROM public\.bcp_case_links l[\s\S]*?WHERE l\.assignment_id = _source_id AND l\.unlinked_at IS NULL;/.test(
      startBody,
    ),
  "IS-BESKT-1: a BESKT start writes the governed link in the same transaction, only for a submitted preparation, and adopts a live link",
);
const newCase = code(
  read("src/routes/_authenticated.employer.$employerSlug.interview-intelligence.new.tsx"),
);
check(
  /if \(besktAssignment \|\| applicationId\) \{[\s\S]*?startBesktFn\(/.test(newCase) &&
    /startAppFn\(/.test(newCase) &&
    /applicationId: null,/.test(newCase),
  "IS-BESKT-2: the new-case form sends every BESKT and application-bound case through the atomic start; only a standalone case is created directly",
);

// ---- the candidate ---------------------------------------------------------------------
check(
  /_candidate := _app\.applicant_user_id;/.test(startBody) &&
    /_candidate := _ba\.candidate_user_id;/.test(startBody) &&
    /aa\.recipient_user_id IS NOT DISTINCT FROM _app\.applicant_user_id/.test(startBody) &&
    /_ba\.candidate_user_id IS DISTINCT FROM _app\.applicant_user_id/.test(startBody),
  "IS-BIND-1: the case is bound to the application's applicant, or the account that accepted the invitation -- and a source of another candidate is refused",
);
const runtime = code(read("src/lib/interview-intelligence/runtime.functions.ts"));
const core = /async function createCaseCore[\s\S]*?\n\}/.exec(runtime)?.[0] ?? "";
check(
  /if \(data\.applicationId\) \{\s*throw new Error\(\s*"SCP_START_USE_START/.test(core) &&
    !/bindApplicant|data\.besktAssignmentId|_candidate_user_id: candidateUserId/.test(runtime) &&
    !/prepareApplicationInterview/.test(runtime),
  "IS-BIND-2: the client path creates only standalone cases and names no candidate account",
);

// ---- the button, and honesty ----------------------------------------------------------
const panel = code(read("src/components/academy/ApplicationAssessmentPanel.tsx"));
check(
  /\.filter\(\(a\) =>\s*\["under_review", "brief_ready", "brief_released"\]\.includes\(assessmentStageOf\(a\)\),?\s*\)\s*\.map\(\(a\) => \(/.test(
    panel,
  ) && /assessmentAssignmentId=\{a\.assignmentId\}/.test(panel),
  "IS-SOURCE: Förbered intervju is offered per completed test and carries THAT test",
);
check(
  /complete: res\.setup_recorded && res\.material > 0/.test(startFn),
  "IS-HONEST: a case whose setup or material is missing is returned as incomplete",
);

console.log("");
if (fails.length > 0) {
  console.error(`interview-start:check FAILED (${fails.length} of ${passed + fails.length}).`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`interview-start:check: ${passed} assertions passed.`);
