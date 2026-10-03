/**
 * Negative controls for the candidate-journey launch guard.
 *
 * Each mutation re-introduces one of the defects the launch review found, and
 * the guard has to name it: the Career Discovery wording back in the shared
 * shell, the old "internal test" claims, a funnel entrance with no catch, a
 * failed read shown as an empty one, a print button that prints a blank page,
 * an editor that can be left without a word, an "Ask Security AI" button with
 * no AI behind it, and a retired page that answers again.
 *
 * Run: bun run negative-controls:candidate-journey-launch
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "candidate-journey-launch:check";

const SHELL = "src/components/career-discovery/v31/shell/AssessmentShell.tsx";
const CD_SHELL = "src/components/career-discovery/v31/shell/CareerDiscoveryShell.tsx";
const FLOW = "src/components/career-discovery/v31/PublicAssessmentFlow.tsx";
const DICT = "src/i18n/dictionaries.ts";
const CV_ROUTE = "src/routes/_authenticated.my-career.cv.$cvId.tsx";

const MUTATIONS: readonly Mutation[] = [
  // ── 1 · the shell and the wording ────────────────────────────────────
  {
    id: "CJ-NC-SHELL-FOOTER-ALWAYS",
    defect: "the shared shell draws its footer whether or not a note was supplied",
    file: SHELL,
    find: "      {footerNote && (\n        <footer",
    replace: "      {(\n        <footer",
    guard: GUARD,
    expect: "a shell given no note renders no footer at all",
  },
  {
    id: "CJ-NC-SHELL-EXIT-HARDWIRED",
    defect: "the shared shell sends every exit to the career centre again",
    file: SHELL,
    find: "                <Link to={exit.to} className={EXIT_LINK_CLASS}>",
    replace: '                <Link to="/career-center" className={EXIT_LINK_CLASS}>',
    guard: GUARD,
    expect: "a supplied exit is rendered with the supplied destination and words",
  },
  {
    id: "CJ-NC-CD-EXIT-DESTINATION",
    defect: "the Career Discovery shell's exit no longer goes to the career centre",
    file: CD_SHELL,
    find: '{ to: "/career-center", label: t("cd.public.exit") }',
    replace: '{ to: "/academy", label: t("cd.public.exit") }',
    guard: GUARD,
    expect: "the Career Discovery shell's exit goes to the career centre",
  },
  {
    id: "CJ-NC-CD-NOTE-DROPPED",
    defect: "the Career Discovery shell stops carrying the not-yet-reviewed note",
    file: CD_SHELL,
    find: 'footerNote={showNote ? t("careerDiscovery.dashboard.internalTestNote") : undefined}',
    replace: "footerNote={undefined}",
    guard: GUARD,
    expect: "the Career Discovery shell carries the Career Discovery note",
  },
  {
    id: "CJ-NC-ATTEMPT-EXIT-WRONG",
    defect: "an employer-assigned assessment offers an exit into the career centre again",
    file: "src/routes/_authenticated.academy.$attemptId.tsx",
    find: 'const exit = { to: "/academy", label: t("academy.attempt.exit") } as const;',
    replace: 'const exit = { to: "/career-center", label: t("academy.attempt.exit") } as const;',
    guard: GUARD,
    expect: "that exit is the person's own assessments, worded neutrally",
  },
  {
    id: "CJ-NC-LEARNING-NO-EXIT",
    defect: "the practice run loses its way out",
    file: "src/routes/_authenticated.academy.learning.$formId.tsx",
    find: '<AssessmentShell exit={{ to: "/academy", label: t("academy.learning.backHome") }}>',
    replace: "<AssessmentShell>",
    guard: GUARD,
    expect: "the practice run leaves to the Academy home",
  },
  {
    id: "CJ-NC-NOTE-SAYS-INTERNAL",
    defect: "the open career analysis is called an internal test again",
    file: DICT,
    find: '"Karriäranalysen är under utveckling. Innehållet är framtaget',
    replace: '"Intern testversion. Innehållet är framtaget',
    guard: GUARD,
    expect: "the Swedish note is the approved sentence",
  },
  {
    id: "CJ-NC-CLOSED-PROMISES-REVIEW",
    defect: "the closed state promises a review that has not started",
    file: DICT,
    find: '"cd.public.unavailableBody": "Karriäranalysen är inte öppen för nya deltagare just nu.",',
    replace:
      '"cd.public.unavailableBody": "Karriäranalysen granskas innan den öppnas. Vi öppnar den så snart granskningen är klar.",',
    guard: GUARD,
    expect: "the closed state is stated, in Swedish",
  },
  {
    id: "CJ-NC-HISTORY-ALWAYS-TEST",
    defect: "every earlier analysis is tagged as a test version again",
    file: "src/components/career-discovery/ReportHistoryList.tsx",
    find: "          internalTest: r.isInternalTest === true,",
    replace: "          internalTest: true,",
    guard: GUARD,
    expect: "a history row is never marked as a test by default",
  },
  {
    id: "CJ-NC-REPORT-CAVEAT-GATED",
    defect: "the v3.1 report's caveat is gated on a prop no caller passes",
    file: "src/components/career-discovery/v31/V31ReportView.tsx",
    find: '  versions,\n  /** "authenticated" (default)',
    replace: '  versions,\n  isInternalTest = false,\n  /** "authenticated" (default)',
    guard: GUARD,
    expect: "the v3.1 report takes no `isInternalTest` gate",
  },

  // ── 2 · the funnel's front door ──────────────────────────────────────
  {
    id: "CJ-NC-BOOT-NO-CATCH",
    defect: "the availability chain is dropped without a catch again",
    file: FLOW,
    find: '      .catch((err: unknown) => {\n        if (!alive) return;\n        console.error("[v31] availability check failed", err);\n        setPhase("check-failed");\n      });',
    replace: "      ;",
    guard: GUARD,
    expect: "the availability / session / tester chain ends in a catch",
  },
  {
    id: "CJ-NC-BOOT-FAILURE-AS-CLOSED",
    defect: "a failed check is shown as 'not open', a claim the product could not check",
    file: FLOW,
    find: '        setPhase("check-failed");\n      });',
    replace: '        setPhase("unavailable");\n      });',
    guard: GUARD,
    expect: "the catch moves to a phase of its own",
  },

  // ── 4 · a failed history read ────────────────────────────────────────
  {
    id: "CJ-NC-HISTORY-ERROR-DROPPED",
    defect: "the history read discards its error, so a fault reads as no reports",
    file: "src/lib/career-discovery/discovery.functions.ts",
    find: 'const { data: rows, error } = await ctx.supabase\n      .from("cd_my_report_history")',
    replace: 'const { data: rows } = await ctx.supabase\n      .from("cd_my_report_history")',
    guard: GUARD,
    expect: "the read keeps its error rather than discarding it",
  },
  {
    id: "CJ-NC-HISTORY-ROUTE-NO-CATCH",
    defect: "the history page has no catch, so a failed read leaves the loading line",
    file: "src/routes/_authenticated.security-career-assessment.history.tsx",
    find: "      .catch(() => mounted && setFailed(true));",
    replace: "      ;",
    guard: GUARD,
    expect: "the history page catches a failed read",
  },
  {
    id: "CJ-NC-HISTORY-LIST-FAILURE-AS-LOADED",
    defect: "the earlier-reports list treats a failed read as an answered, empty one",
    file: "src/components/career-discovery/ReportHistoryList.tsx",
    find: '.catch(() => alive && setStatus("error"));',
    replace: '.catch(() => alive && setStatus("ready"));',
    guard: GUARD,
    expect: "the earlier-reports list no longer turns a failure into 'loaded'",
  },

  // ── 5 · a failed profile read ────────────────────────────────────────
  {
    id: "CJ-NC-PROFILE-LOAD-SILENT",
    defect: "a failed profile read is logged and shown as 'not filled in' again",
    file: "src/components/assessment/SecurityCareerProfileCard.tsx",
    find: "        if (alive) setLoadFailed(true);\n",
    replace: "",
    guard: GUARD,
    expect: "a failed read sets a state of its own",
  },

  // ── 6 · feedback ─────────────────────────────────────────────────────
  {
    id: "CJ-NC-FEEDBACK-REFERRER",
    defect: "feedback sends document.referrer again",
    file: "src/routes/_authenticated.feedback.tsx",
    find: "          pagePath: pagePath.slice(0, BETA_FEEDBACK_PAGE_PATH_MAX) || null,",
    replace:
      '          pagePath: typeof document !== "undefined" ? document.referrer || null : null,',
    guard: GUARD,
    expect: "the form no longer sends document.referrer",
  },

  // ── 7 · Ask Security AI ──────────────────────────────────────────────
  {
    id: "CJ-NC-AI-BUTTON-ALWAYS",
    defect: "'Ask Security AI' is drawn whether or not AI is approved",
    file: "src/components/security-work/SecurityAssistant.tsx",
    find: "  if (!availability.available) return null;\n",
    replace: "",
    guard: GUARD,
    expect: "and renders nothing unless AI is available here",
  },

  // ── 8 · /journey ─────────────────────────────────────────────────────
  {
    id: "CJ-NC-JOURNEY-REDIRECTS-CHILD",
    defect: "the /journey redirect fires for its child route too",
    file: "src/routes/_authenticated.journey.tsx",
    find: '    if (location.pathname.replace(/\\/+$/, "") === "/journey") {',
    replace: "    if (true) {",
    guard: GUARD,
    expect: "only for /journey itself",
  },

  // ── 3 · the CV ───────────────────────────────────────────────────────
  {
    id: "CJ-NC-CV-PRINT-BLANK",
    defect: "the print button is enabled while the editor is open, and prints a blank page",
    file: CV_ROUTE,
    find: "disabled={busy || editing}",
    replace: "disabled={busy}",
    guard: GUARD,
    expect: "the print control is disabled while the editor is open",
  },
  {
    id: "CJ-NC-CV-LEAVE-TRAP",
    defect: "the leave-confirmation stays on after a save, trapping the person",
    file: CV_ROUTE,
    find: "    disabled: !(dirty && editing),",
    replace: "    disabled: false,",
    guard: GUARD,
    expect: "the blocker is enabled only while the editor is open AND dirty",
  },
  {
    id: "CJ-NC-CV-LEAVE-UNGUARDED",
    defect: "in-app navigation is no longer held for unsaved wording",
    file: CV_ROUTE,
    find: "    withResolver: true,\n",
    replace: "",
    guard: GUARD,
    expect: "the route holds in-app navigation with the router's blocker",
  },
  {
    id: "CJ-NC-CV-PROPOSE-SILENT",
    defect: "a failed draft request ends in silence again",
    file: CV_ROUTE,
    find: "{propose.isError && (",
    replace: "{false && (",
    guard: GUARD,
    expect: "a failed draft request is said, as an alert",
  },
  {
    id: "CJ-NC-CV-DELETE-SILENT",
    defect: "a failed delete ends in silence again",
    file: CV_ROUTE,
    find: '{destroy.isError && conflict !== "changed" && (',
    replace: "{false && (",
    guard: GUARD,
    expect: "a failed delete is said, as an alert",
  },
];

runControls("candidate-journey-launch", MUTATIONS);
