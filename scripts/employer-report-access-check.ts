/**
 * The employer report-access guard: the APPLICATION's half.
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────
 *
 * The database decides who may read what an organisation learned about a person
 * (employer_reports_readable, supabase/migrations/20270203090000 and
 * 20270204090000): an owner or admin, a reviewer for the use case, the named
 * responsible recruiter of a vacancy and, for an interview case, its creator and
 * panel. Ordinary membership reads nothing. The database proves that
 * (employer_report_access_{model,matrix}_test.sql, interview_case_access_model_
 * test.sql); this guard does NOT, and nothing here is an authorisation.
 *
 * What the browser can still get wrong is TELLING THE TRUTH. A member the
 * database now returns nothing meets an empty candidate list that reads as "no
 * candidates", four tiles that read "0", "no assessment has been sent" under a
 * candidate who answered yesterday, and tabs that lead only to refusals. This
 * guard pins the behaviour that prevents it, and the rule that keeps it safe:
 *
 *   1  THE DECISION     a pure function of the facts the database reported
 *                       (employer_report_access), run over the whole state space.
 *                       Only a CONFIRMED "active member with no basis" withholds
 *                       anything. Loading, a failed call, a missing function (the
 *                       migration is not applied) and a caller the database does
 *                       not know as a member all leave the screen as it always
 *                       was: the application works before and after the migration.
 *   2  THE SCREENS      every surface that shows results, a list of tested people
 *                       or a count asks, and none of them decides for itself.
 *   3  NOT A SECOND     the browser holds no copy of "owner or admin". It reads the
 *      AUTHORISATION    caller's own facts from the database, which answers by
 *                       calling the same definition the policies call.
 *   4  THE COPY         both languages, saying the list is not empty and who to ask.
 *   5  SUSPENSION       the two refusals of 20270202090000 reach the person in
 *                       words that can be acted on, and the codes are the
 *                       migration's.
 *   6  THE CONTRACT     the columns the function returns are the ones this reads.
 *
 * Deterministic, offline, credential-free. Run: bun run employer-report-access:check
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/* ── harness ───────────────────────────────────────────────────────── */

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
/** Comments DISCUSS what they are about; scan code, not prose. */
const code = (src: string): string =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const failures: string[] = [];
let n = 0;
function ck(label: string, ok: boolean): void {
  n += 1;
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const ra = await import("../src/lib/security-competency/report-access");
const arq = await import("../src/lib/job-intelligence/access-request-errors");
const { dictionaries } = await import("../src/i18n/dictionaries");
const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const J1 = "00000000-0000-4000-8000-0000000000a1";
const J2 = "00000000-0000-4000-8000-0000000000a2";
const facts = (
  over: Partial<import("../src/lib/security-competency/report-access").ReportAccessFacts> = {},
) => ({
  isMember: true,
  ownerOrAdmin: false,
  readableUseCases: [] as ("workforce" | "recruitment")[],
  responsibleJobIds: [] as string[],
  caseAccess: false,
  ...over,
});
const known = (f: ReturnType<typeof facts> | null) =>
  ({ status: "success", known: f !== null, facts: f }) as const;
const NEEDS = ["reports", "workforce", "recruitment", "interviews"] as const;
const stateOf = (f: ReturnType<typeof facts> | null, need: (typeof NEEDS)[number]) =>
  ra.reportAccessStateFor(known(f), need);

/* ═══ 1 · THE DECISION ════════════════════════════════════════════════ */
group("1 · the decision is a pure function of what the database reported");

ck(
  "the answer on its way is `loading`, for every need",
  NEEDS.every((nd) => ra.reportAccessStateFor({ status: "pending" }, nd) === "loading"),
);
ck(
  "a call that failed is `unknown`, never `none`: a failure must not become a statement about the person",
  NEEDS.every((nd) => ra.reportAccessStateFor({ status: "error" }, nd) === "unknown"),
);
ck(
  "a missing function (migration not applied) and an empty row are `unknown`: the screen is exactly what it was",
  NEEDS.every(
    (nd) =>
      ra.reportAccessStateFor({ status: "success", known: false, facts: null }, nd) === "unknown" &&
      ra.reportAccessStateFor({ status: "success", known: true, facts: null }, nd) === "unknown",
  ),
);
ck(
  "a caller the database does not know as a member is `unknown`: nothing is claimed about them",
  NEEDS.every((nd) => stateOf(facts({ isMember: false }), nd) === "unknown"),
);
ck(
  "an ordinary member, with no basis at all, is `none` for every need: this is the ONE case that withholds",
  NEEDS.every((nd) => stateOf(facts(), nd) === "none"),
);
ck(
  "an owner or administrator is `allowed` for every need",
  NEEDS.every(
    (nd) =>
      stateOf(
        facts({
          ownerOrAdmin: true,
          readableUseCases: ["recruitment", "workforce"],
          caseAccess: true,
        }),
        nd,
      ) === "allowed",
  ),
);
ck(
  "a workforce reviewer reads workforce results and nothing of recruitment or interviews",
  stateOf(facts({ readableUseCases: ["workforce"] }), "workforce") === "allowed" &&
    stateOf(facts({ readableUseCases: ["workforce"] }), "reports") === "allowed" &&
    stateOf(facts({ readableUseCases: ["workforce"] }), "recruitment") === "none" &&
    stateOf(facts({ readableUseCases: ["workforce"] }), "interviews") === "none",
);
ck(
  "a recruitment reviewer reads recruitment results and no workforce ones; interviews follow the database's own case answer",
  stateOf(facts({ readableUseCases: ["recruitment"] }), "recruitment") === "allowed" &&
    stateOf(facts({ readableUseCases: ["recruitment"] }), "workforce") === "none" &&
    stateOf(facts({ readableUseCases: ["recruitment"], caseAccess: true }), "interviews") ===
      "allowed" &&
    stateOf(facts({ readableUseCases: ["recruitment"], caseAccess: false }), "interviews") ===
      "none",
);
ck(
  "a vacancy's responsible recruiter reads recruitment results and no workforce ones",
  stateOf(facts({ responsibleJobIds: [J1] }), "recruitment") === "allowed" &&
    stateOf(facts({ responsibleJobIds: [J1] }), "reports") === "allowed" &&
    stateOf(facts({ responsibleJobIds: [J1] }), "workforce") === "none",
);
ck(
  "a case's creator or panel member (case access, nothing else) opens interviews and reads no results",
  stateOf(facts({ caseAccess: true }), "interviews") === "allowed" &&
    stateOf(facts({ caseAccess: true }), "reports") === "none" &&
    stateOf(facts({ caseAccess: true }), "recruitment") === "none" &&
    stateOf(facts({ caseAccess: true }), "workforce") === "none",
);
ck(
  "one vacancy at a time: its recruiter reads V1, not V2; an owner, admin or recruitment reviewer reads both; a workforce reviewer, a plain member and a non-member neither",
  ra.canReadVacancyResults(facts({ responsibleJobIds: [J1] }), J1) === true &&
    ra.canReadVacancyResults(facts({ responsibleJobIds: [J1] }), J2) === false &&
    ra.canReadVacancyResults(facts({ responsibleJobIds: [J1] }), null) === false &&
    ra.canReadVacancyResults(facts({ ownerOrAdmin: true }), J2) === true &&
    ra.canReadVacancyResults(facts({ readableUseCases: ["recruitment"] }), J2) === true &&
    ra.canReadVacancyResults(facts({ readableUseCases: ["workforce"] }), J1) === false &&
    ra.canReadVacancyResults(facts(), J1) === false &&
    ra.canReadVacancyResults(facts({ isMember: false, ownerOrAdmin: true }), J1) === false,
);
ck(
  "the database's row is mapped by name, and a malformed row is no row at all (so `unknown`, never `none`)",
  JSON.stringify(
    ra.mapReportAccess({
      is_member: true,
      owner_or_admin: false,
      readable_use_cases: ["recruitment", "bogus"],
      responsible_job_ids: [J1, 7],
      case_access: true,
    }),
  ) ===
    JSON.stringify(
      facts({ readableUseCases: ["recruitment"], responsibleJobIds: [J1], caseAccess: true }),
    ) &&
    ra.mapReportAccess(null) === null &&
    ra.mapReportAccess({ is_member: "yes", owner_or_admin: false }) === null &&
    ra.mapReportAccess({ owner_or_admin: true }) === null,
);
ck(
  "a missing function is recognised by PostgREST's and Postgres's own signals, and nothing else is",
  ra.isMissingFunctionError({ code: "PGRST202", message: "x" }) === true &&
    ra.isMissingFunctionError({ code: "42883", message: "x" }) === true &&
    ra.isMissingFunctionError({
      message:
        "Could not find the function public.employer_report_access(_employer_id) in the schema cache",
    }) === true &&
    ra.isMissingFunctionError({ code: "42501", message: "permission denied" }) === false &&
    ra.isMissingFunctionError({ code: "XX000", message: "boom" }) === false &&
    ra.isMissingFunctionError(null) === false,
);

/* ═══ 2 · THE SCREENS ═════════════════════════════════════════════════ */
group("2 · every screen that shows results, lists or counts asks, and none decides for itself");

const RA_UI = code(read("src/components/employer/ReportAccess.tsx"));
const RA_FN = code(read("src/lib/security-competency/report-access.functions.ts"));
const RA_LIB = code(read("src/lib/security-competency/report-access.ts"));
const WORKSPACE = code(read("src/components/academy/AcademyWorkspace.tsx"));
const OVERVIEW = code(read("src/components/academy/AcademyOverview.tsx"));
const DASH = code(read("src/routes/_authenticated.employer.$employerSlug.index.tsx"));
const II_INDEX = code(
  read("src/routes/_authenticated.employer.$employerSlug.interview-intelligence.index.tsx"),
);
const REPORTS = code(read("src/routes/_authenticated.employer.$employerSlug.reports.tsx"));
const WF_INDEX = code(read("src/routes/_authenticated.employer.$employerSlug.workforce.index.tsx"));
const WF_PERSON = code(
  read("src/routes/_authenticated.employer.$employerSlug.workforce.$personId.tsx"),
);
const PANEL = code(read("src/components/academy/ApplicationAssessmentPanel.tsx"));
const APP_PAGE = code(
  read("src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx"),
);
const route = (name: string) =>
  code(read(`src/routes/_authenticated.employer.$employerSlug.${name}.tsx`));

ck(
  "the wrapper withholds ONLY on a confirmed `none`; unknown and allowed render the screen as it was",
  /if \(state === "none"\) return <ReportAccessNotice need=\{need\} \/>;\s*return <>\{children\}<\/>;/.test(
    RA_UI,
  ),
);
ck(
  "a failed read is `error` (so `unknown`), and a read still on its way is `pending` (so `loading`): there is no path that turns a failure into `none`",
  /query\.isError\s*\?\s*\{ status: "error" \}/.test(RA_UI) &&
    /\{ status: "pending" \}/.test(RA_UI),
);
ck(
  "the one server call is employer_report_access, and a missing function is `known: false`, not an error",
  /\.rpc\("employer_report_access"/.test(RA_FN) &&
    /isMissingFunctionError\(error\)\) return \{ known: false, facts: null \}/.test(RA_FN),
);
ck(
  "the call is made in one place only: no other file of the application names the function",
  readdirSync(join(ROOT, "src"), { recursive: true })
    .map(String)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("types.ts"))
    .filter((f) => /employer_report_access\b/.test(code(read(`src/${f}`))))
    .every((f) => f === "lib/security-competency/report-access.functions.ts"),
);
ck(
  "the assessment, review and training workspaces thread a `requires` to the wrapper, and hide the tabs that lead only to refused results",
  /requires\?: ReportNeed/.test(WORKSPACE) &&
    /<ReportsRequired employerId=\{workspace\.employerId\} need=\{requires\}>/.test(WORKSPACE) &&
    /needs: "recruitment"/.test(WORKSPACE) &&
    /needs: "reports"/.test(WORKSPACE) &&
    /needs: "workforce"/.test(WORKSPACE) &&
    /tabs\.filter\(\(tab\) => !tab\.needs \|\| access\.stateFor\(tab\.needs\) !== "none"\)/.test(
      WORKSPACE,
    ),
);
ck(
  "the pages that show results declare what they need: candidates (recruitment), results and reviews (reports), training overview and participants (workforce)",
  /<AcademyPage employerSlug=\{employerSlug\} requires="recruitment">/.test(
    route("assessments.participants"),
  ) &&
    /requires="reports"/.test(route("assessments.results.$attemptId")) &&
    /requires="reports"/.test(route("assessments.reviews.index")) &&
    /requires="workforce"/.test(route("training.index")) &&
    /requires="workforce"/.test(route("training.participants")),
);
ck(
  "the assessments overview replaces its four tiles and its to-do with the notice, only on a confirmed `none`",
  /useReportAccess\(employerId\)\.stateFor\("recruitment"\) === "none"/.test(OVERVIEW) &&
    /noAccess \? <ReportAccessNotice need="recruitment" \/> : null/.test(OVERVIEW) &&
    /hidden=\{noAccess\}/.test(OVERVIEW),
);
ck(
  "the dashboard replaces the three cards that count results, assessments and interviews, and no other card",
  /stateFor\("recruitment"\) === "none"/.test(DASH) &&
    /stateFor\("workforce"\) === "none"/.test(DASH) &&
    /stateFor\("interviews"\) === "none"/.test(DASH) &&
    (DASH.match(/withheld=\{/g) ?? []).length === 3 &&
    /\{withheld \? \(/.test(DASH) &&
    /\{stats && !withheld && \(/.test(DASH),
);
ck(
  "the interview overview and the reports overview say there is no interview to open, not 'no interviews'",
  /stateFor\("interviews"\) === "none"/.test(II_INDEX) &&
    /<ReportAccessNotice need="interviews" \/>/.test(II_INDEX) &&
    /hidden=\{noCases\}/.test(II_INDEX) &&
    /stateFor\("interviews"\) === "none"/.test(REPORTS) &&
    /<ReportAccessNotice need="interviews" \/>/.test(REPORTS),
);
ck(
  "the workforce directory withholds the per-person assessment action, and the person page the assessments, development and the evidence line, instead of saying 'none'",
  /noAssessmentAccess/.test(WF_INDEX) &&
    /if \(noAssessmentAccess\) return null;/.test(WF_INDEX) &&
    /stateFor\("workforce"\) === "none"/.test(WF_PERSON) &&
    (WF_PERSON.match(/<ReportAccessNotice need="workforce" \/>/g) ?? []).length === 2 &&
    /!noWorkforceAccess && \(/.test(WF_PERSON),
);
ck(
  "the candidate's assessment panel names the access instead of 'no assessment has been sent', per vacancy",
  /canReadVacancyResults\(access\.facts, jobId\)/.test(PANEL) &&
    /reportAccess\.application\.title/.test(PANEL) &&
    /cannotReadResults \? \(/.test(PANEL) &&
    /jobId=\{c\.jobId \?\? null\}/.test(APP_PAGE),
);
ck(
  "the candidate's process strip reports a CONFIRMED lack of access as `refused` for the assessment, interview and report tracks, and only once the vacancy is known",
  /listJobId !== null &&/.test(APP_PAGE) &&
    /withheld\(resultsRefused, readOf\(assessmentsQuery\)\)/.test(APP_PAGE) &&
    (APP_PAGE.match(/withheld\(casesRefused, readOf\(interviewCasesQuery\)\)/g) ?? []).length ===
      2 &&
    /refused && read !== "loading" \? "refused" : read/.test(APP_PAGE),
);

/* ═══ 3 · NOT A SECOND AUTHORISATION ══════════════════════════════════ */
group(
  "3 · the browser holds no copy of 'owner or admin'; it asks the database, which answers with the policies' own definition",
);

const ALL_MINE = [RA_UI, RA_FN, RA_LIB].join("\n");
ck(
  "none of the three files compares a role, reads a membership, or names the role helpers",
  !/employer_memberships|has_employer_role|has_active_employer_role|role === "(owner|admin|member)"|\.role\b|EmployerRole/.test(
    ALL_MINE,
  ),
);
ck(
  "the pure module imports nothing: it cannot reach a client, a session or a role",
  !/^\s*import\b/m.test(RA_LIB),
);
ck(
  "the server function is a pass-through: it takes the caller's own session client and no service role",
  /requireSupabaseAuth/.test(RA_FN) &&
    !/service|admin\b/i.test(RA_FN.replace(/requireSupabaseAuth/g, "")),
);

/* ═══ 4 · THE COPY ════════════════════════════════════════════════════ */
group(
  "4 · the copy says the list is not empty, that nothing is wrong with the account, and who to ask",
);

const RK = [
  "reportAccess.results.title",
  "reportAccess.results.body",
  "reportAccess.workforce.title",
  "reportAccess.workforce.body",
  "reportAccess.interviews.title",
  "reportAccess.interviews.body",
  "reportAccess.ask",
  "reportAccess.card.results",
  "reportAccess.card.interviews",
  "reportAccess.application.title",
  "reportAccess.application.body",
];
const both = (k: string) =>
  typeof sv[k] === "string" &&
  sv[k].trim().length > 0 &&
  typeof en[k] === "string" &&
  en[k].trim().length > 0 &&
  sv[k] !== en[k];
ck(`all ${RK.length} keys exist in Swedish and English, and differ`, RK.every(both));
ck(
  "the two list notices say the list is NOT EMPTY and nothing is wrong with the account (a withheld list must never read as an empty one)",
  /inte tom/.test(sv["reportAccess.results.body"]) &&
    /inte tom/.test(sv["reportAccess.workforce.body"]) &&
    /not empty/.test(en["reportAccess.results.body"]) &&
    /not empty/.test(en["reportAccess.workforce.body"]) &&
    /Inget är fel på ditt konto/.test(sv["reportAccess.results.body"]) &&
    /Nothing is wrong with your account/.test(en["reportAccess.results.body"]),
);
ck(
  "every notice names who to ask: an owner or administrator",
  /ägare eller administratör/.test(sv["reportAccess.ask"]) &&
    /owner or administrator/.test(en["reportAccess.ask"]) &&
    /ägare eller administratör/.test(sv["reportAccess.card.results"]) &&
    /owner or administrator/.test(en["reportAccess.card.results"]) &&
    /ägare eller administratör/.test(sv["reportAccess.application.body"]) &&
    /owner or administrator/.test(en["reportAccess.application.body"]),
);
ck(
  "the interview notice says what IS visible (cases one created or sits on the panel of) so it does not read as a blanket refusal",
  /skapat eller är med i panelen/.test(sv["reportAccess.interviews.body"]) &&
    /created or are on the panel/.test(en["reportAccess.interviews.body"]),
);
ck(
  "the team page tells an owner what granting review access now also gives, and that plain membership does not",
  /resultat och rapporter/.test(sv["employer.team.lede"]) &&
    /results and reports/.test(en["employer.team.lede"]) &&
    /ser inga resultat/.test(sv["employer.team.lede"]) &&
    /sees no results/.test(en["employer.team.lede"]),
);

/* ═══ 5 · SUSPENSION ══════════════════════════════════════════════════ */
group(
  "5 · the two refusals of a suspended or removed person reach them in words that can be acted on",
);

const SUSPENSION = readdirSync(join(ROOT, "supabase/migrations"))
  .filter((f) => f.startsWith("20270202090000_"))
  .map((f) => read(`supabase/migrations/${f}`))
  .join("\n");
ck(
  "the two codes are the migration's, word for word",
  SUSPENSION.includes(`'${arq.ACCESS_REQUEST_MEMBERSHIP_BLOCKED}`) ||
    SUSPENSION.includes(`${arq.ACCESS_REQUEST_MEMBERSHIP_BLOCKED}:`),
);
ck(
  "both codes are raised by the migration",
  SUSPENSION.includes(arq.ACCESS_REQUEST_MEMBERSHIP_BLOCKED) &&
    SUSPENSION.includes(arq.ACCESS_REQUEST_REACTIVATION_REFUSED),
);
ck(
  "a refusal is recognised in an Error, a bare string and a server-function wrapper, and anything else is not one",
  arq.accessRequestRefusalOf(new Error(arq.ACCESS_REQUEST_MEMBERSHIP_BLOCKED)) ===
    "membershipBlocked" &&
    arq.accessRequestRefusalOf(arq.ACCESS_REQUEST_REACTIVATION_REFUSED) === "reactivationRefused" &&
    arq.accessRequestRefusalOf({ message: `x ${arq.ACCESS_REQUEST_MEMBERSHIP_BLOCKED}: y` }) ===
      "membershipBlocked" &&
    arq.accessRequestRefusalOf(new Error("Could not process this request. Please try again.")) ===
      null &&
    arq.accessRequestRefusalOf(null) === null &&
    arq.accessRequestRefusalOf(undefined) === null,
);

const ONBOARDING = code(read("src/lib/job-intelligence/employer-onboarding.functions.ts"));
const JOIN = code(read("src/routes/_authenticated.employer.join.tsx"));
const TEAM = code(read("src/components/employer/EmployerTeamPanel.tsx"));
ck(
  "the request server function carries the 'blocked' code through instead of 'try again', and the approval one carries 'refused'",
  /String\(error\.message\)\.includes\(ACCESS_REQUEST_MEMBERSHIP_BLOCKED\)\) \{\s*throw new Error\(ACCESS_REQUEST_MEMBERSHIP_BLOCKED\);/.test(
    ONBOARDING,
  ) &&
    /String\(error\.message\)\.includes\(ACCESS_REQUEST_REACTIVATION_REFUSED\)\) \{\s*throw new Error\(ACCESS_REQUEST_REACTIVATION_REFUSED\);/.test(
      ONBOARDING,
    ),
);
ck(
  "the join page says the access was suspended or ended and not to retry; the team panel says approving is not the way back and to deny",
  /accessRequestRefusalOf\(request\.error\) === "membershipBlocked"\s*\?\s*t\("employer\.join\.blocked"\)/.test(
    JOIN,
  ) &&
    /accessRequestRefusalOf\(decide\.error\) === "reactivationRefused"\s*\?\s*t\("employer\.team\.requests\.reactivationRefused"\)/.test(
      TEAM,
    ),
);
ck(
  "the two sentences exist in both languages, name the platform administrator, and do not blame the person",
  both("employer.join.blocked") &&
    both("employer.team.requests.reactivationRefused") &&
    /plattformsadministratör/.test(sv["employer.join.blocked"]) &&
    /platform administrator/.test(en["employer.join.blocked"]) &&
    /plattformsadministratör/.test(sv["employer.team.requests.reactivationRefused"]) &&
    /platform administrator/.test(en["employer.team.requests.reactivationRefused"]) &&
    /Neka/.test(sv["employer.team.requests.reactivationRefused"]) &&
    /Deny/.test(en["employer.team.requests.reactivationRefused"]),
);

/* ═══ 6 · THE CONTRACT WITH THE DATABASE ══════════════════════════════ */
group("6 · the columns the function returns are the ones the application reads");

const MODEL = readdirSync(join(ROOT, "supabase/migrations"))
  .filter((f) => f.startsWith("20270203090000_"))
  .map((f) => read(`supabase/migrations/${f}`))
  .join("\n");
const sig =
  /CREATE OR REPLACE FUNCTION public\.employer_report_access\(_employer_id uuid\)\s*RETURNS TABLE\(([^)]*)\)/.exec(
    MODEL,
  );
const columns = (sig?.[1] ?? "").split(",").map((c) => c.trim().split(/\s+/)[0]);
ck(
  "employer_report_access(_employer_id uuid) returns exactly is_member, owner_or_admin, readable_use_cases, responsible_job_ids, case_access",
  JSON.stringify(columns) ===
    JSON.stringify([
      "is_member",
      "owner_or_admin",
      "readable_use_cases",
      "responsible_job_ids",
      "case_access",
    ]),
);
ck(
  "every column is read by name in the pure mapper, and the call passes `_employer_id`",
  columns.every((c) => RA_LIB.includes(`r.${c}`)) && /_employer_id: data\.employerId/.test(RA_FN),
);
ck(
  "the function is executable by `authenticated` only, never by `anon`",
  /GRANT EXECUTE ON FUNCTION public\.employer_report_access\(uuid\) TO authenticated;/.test(
    MODEL,
  ) &&
    /REVOKE ALL ON FUNCTION public\.employer_report_access\(uuid\) FROM PUBLIC, anon;/.test(MODEL),
);

/* ── verdict ───────────────────────────────────────────────────────── */
console.log(`\n${n - failures.length} of ${n} assertions passed`);
if (failures.length > 0) {
  console.error(`\nFAIL — employer-report-access-check (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("PASS — employer-report-access-check");
