/**
 * Negative controls for the career analysis availability guards
 * (career-analysis-availability:check and career-analysis-surfaces:check).
 *
 * The owner opens Karriäranalysen with one call, a path never exercised in
 * production, so each way the product could quietly stop being coherent around
 * it is planted here: a link into the entrance with no gate, a surface keeping
 * a private copy of the query, `paused` no longer closing the door, a failed
 * read becoming "closed", the sitemap or robots rule no longer following the
 * state, the saved report losing its download control, the claim resolved
 * after the allowlist, a refusal mid-run read as "try again", the owner's
 * checklist gaining a write, the SQL suite's table drifting from the
 * resolver's, a stale answer trusted for ever, and a surface that ignores the
 * hook's answer or a closed panel that grows a retry button.
 *
 * Each mutation changes exactly one thing, the guard must fail with the named
 * diagnostic, and every file is restored byte-for-byte (proved by the shared
 * runner).
 *
 * Run: bun run negative-controls:career-analysis-availability
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "career-analysis-availability:check";
const SURFACES = "career-analysis-surfaces:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "CA-NC-CTA-UNGATED",
    defect:
      "the profession guide's analysis card no longer asks the availability hook, so a signed-in account outside the test group is sent to a page that says no",
    file: "src/components/career-center/ProfessionTemplate.tsx",
    find: "  const analysisOpen = useCareerAnalysisOpen(signedIn);",
    replace: "  const analysisOpen: boolean | undefined = undefined;",
    guard: GUARD,
    expect: "links into the entrance with no gate",
  },
  {
    id: "CA-NC-PRIVATE-COPY",
    defect:
      "the retake link reads the availability server function itself again, a private copy of the rule that will drift",
    file: "src/components/career-discovery/RetakeAnalysisLink.tsx",
    find: "  const open = useCareerAnalysisOpen(true);",
    replace: "  const open = useCareerAnalysisOpen(true);\n  void getV31Availability;",
    guard: GUARD,
    expect: "a surface reads the availability server functions directly (a private copy)",
  },
  {
    id: "CA-NC-PAUSED-NOT-CLOSED",
    defect:
      "the resolver stops saying 'paused' for the release control, so the reason a closed door gives is wrong (and the claim notice would say the wrong thing)",
    file: "src/lib/career-discovery/analysis-access.ts",
    find: '  if (availability.accessState === "paused") return { door: "closed", reason: "paused" };',
    replace: "  // (removed)",
    guard: GUARD,
    expect: "1.1 paused / anonymous: the UI door is closed:paused",
  },
  {
    id: "CA-NC-FAILED-READ-IS-CLOSED",
    defect:
      "a signed-in reader whose gate read failed is told their account may not start, on the strength of a database hiccup",
    file: "src/lib/career-discovery/analysis-access.ts",
    find: '  if (mayStart === null) return { door: "unknown" };',
    replace: '  if (mayStart === null) return { door: "closed", reason: "account" };',
    guard: GUARD,
    expect: "1.8 a signed-in reader whose gate read failed is unknown",
  },
  {
    id: "CA-NC-SITEMAP-ALWAYS",
    defect:
      "the sitemap lists the career analysis whatever the release control says, inviting a crawler to a noindex or closed page",
    file: "src/routes/sitemap[.]xml.ts",
    find: "            analysisListed = analysisIndexable(answer);",
    replace: "            analysisListed = true;",
    guard: GUARD,
    expect: "5.9 sitemap membership follows the same decision",
  },
  {
    id: "CA-NC-ROBOTS-LITERAL",
    defect: "the route's robots rule is a hand-written string again, so launch needs a manual edit",
    file: "src/routes/security-career-assessment.tsx",
    find: '        { name: "robots", content: analysisRobots(indexable) },',
    replace: '        { name: "robots", content: "noindex, nofollow" },',
    guard: GUARD,
    expect: "5.4 the route derives robots from the state",
  },
  {
    id: "CA-NC-PRINT-REMOVED",
    defect: "the saved report loses its download control again",
    file: "src/components/career-discovery/v31/V31ReportView.tsx",
    find: "data-print-report",
    replace: "data-removed",
    guard: GUARD,
    expect: "5.11 the saved report's no-print action bar carries the same download control",
  },
  {
    id: "CA-NC-CLAIM-AFTER-ALLOWLIST",
    defect:
      "the claim token is no longer resolved before the signed-in gate, so a non-tester who finished anonymously is turned away from their own run",
    file: "src/components/career-discovery/v31/PublicAssessmentFlow.tsx",
    find: "        const entry = resolveClaimEntry(urlToken);",
    replace: '        const entry = { kind: "none" } as ReturnType<typeof resolveClaimEntry>;',
    guard: GUARD,
    expect: "4.1 a claim token is resolved BEFORE the first signed-in gate read",
  },
  {
    id: "CA-NC-REFUSAL-IS-RETRY",
    defect:
      "a save refused because the control moved mid-run reads as 'something went wrong, try again' again: a retry that fails identically",
    file: "src/components/career-discovery/v31/PublicAssessmentFlow.tsx",
    find: 'v31PublicErrorCode(err) === "not_available"',
    replace: "false",
    guard: GUARD,
    expect: "4.5 a save refused because the control moved",
  },
  {
    id: "CA-NC-READINESS-WRITES",
    defect:
      "the owner's read-only checklist gains a write: its first statement becomes an UPDATE of the control",
    file: "supabase/readiness/career-analysis-availability.sql",
    find: "SELECT state, note, changed_by, changed_at\n  FROM public.cd_access_policy;",
    replace: "UPDATE public.cd_access_policy SET state = 'public';",
    guard: GUARD,
    expect: "6.2 every statement is a SELECT",
  },
  {
    id: "CA-NC-SQL-TABLE-DRIFT",
    defect:
      "the SQL suite's expected table says a plain account may start under internal_test, which is not what the resolver and the product do",
    file: "supabase/tests/cd_availability_matrix_test.sql",
    find: "  ('internal_test', 'plain',  false),",
    replace: "  ('internal_test', 'plain',  true),",
    guard: GUARD,
    expect: "1.13 the SQL suite's expected cd_v31_may_start table is exactly this guard's table",
  },
  {
    id: "CA-NC-STALE-FOR-EVER",
    defect:
      "the availability answer is trusted for ever, so a pause is invisible on a surface until a reload",
    file: "src/components/career-discovery/use-career-analysis-open.ts",
    find: "    staleTime: ANALYSIS_ACCESS_STALE_MS,",
    replace: "    staleTime: Infinity,",
    guard: GUARD,
    expect: "3.2 and uses that bound",
  },
  {
    id: "CA-NC-SURFACE-IGNORES-HOOK",
    defect:
      "the career centre's second entry card ignores the hook's answer, so the link stays when the analysis is closed",
    file: "src/components/career-center/CareerEntryCards.tsx",
    find: "analysisOpen === false",
    replace: "analysisOpen === 7",
    guard: SURFACES,
    expect:
      "1.1 [sv] paused / anonymous (hook says false): the career centre's second entry card withdraws the analysis",
  },
  {
    id: "CA-NC-CLOSED-PANEL-RETRY",
    defect: "the closed panel grows a retry button, which cannot succeed until the control opens",
    file: "src/components/career-discovery/v31/ClosedAnalysisPanel.tsx",
    find: "      {/* What the reader CAN do. Always present, never a retry. */}",
    replace: '      <button type="button">retry</button>',
    guard: SURFACES,
    expect: "2.3 [sv] paused / signed out: offers no retry and no entrance link",
  },
];

runControls("career-analysis-availability", MUTATIONS);
