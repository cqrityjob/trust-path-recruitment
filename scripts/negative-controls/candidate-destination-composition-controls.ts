/**
 * Negative controls for the three candidate destinations' composition.
 *
 * The defect these guard against is a destination that CLAIMS a surface
 * and cannot reach it — which is what /jobs did for applications from
 * PR A until sketch 3 was built. The mutations reintroduce that, plus the
 * ways each fix can be undone without looking undone: a link retargeted,
 * a personal panel shown to anonymous readers, a status vocabulary
 * forked, a pointer turned into a second copy of a product, and a figure
 * invented for a model that does not exist.
 *
 * Several mutations DELETE. A guard that only ever adds cannot catch an
 * assertion that passes on absence.
 *
 * Run: bun run negative-controls:candidate-destination-composition
 */
import { runControls, type Mutation } from "./runner";

const JOBS = "src/routes/jobs.index.tsx";
const COLUMN = "src/components/jobs/JobsSideColumn.tsx";
const CAREER = "src/routes/career-center.index.tsx";
const CARDS = "src/components/career-center/CareerEntryCards.tsx";
const ACADEMY = "src/routes/_authenticated.academy.index.tsx";
const PREPARATION = "src/components/beskt/CandidatePreparation.tsx";
const GUARD = "candidate-destination-composition:check";

const MUTATIONS: readonly Mutation[] = [
  /* ── THE ORIGINAL DEFECT ───────────────────────────────────────────── */
  {
    id: "CDC-NC-JOBS-UNREACHABLE",
    defect:
      "THE ORIGINAL DEFECT: the Jobs page stops mounting the supporting column, so it lights 'Jobb' for applications it offers no way to reach",
    file: JOBS,
    find: "          <JobsSideColumn signedIn={signedIn} />",
    replace: "",
    guard: GUARD,
    expect: "the Jobs page mounts the supporting column",
  },
  {
    id: "CDC-NC-APPLICATIONS-LINK-DROPPED",
    defect:
      "the column renders but no longer links to the applications page, so the panel is a dead end rather than a door",
    file: COLUMN,
    find: '          to="/my-career/applications"',
    replace: '          to="/jobs"',
    guard: GUARD,
    expect: "links to the applications page",
  },
  {
    id: "CDC-NC-CV-LINK-DROPPED",
    defect:
      "the CV entry point leaves Jobs, where the route audit puts it, and is reachable only from Överskt again",
    file: COLUMN,
    find: '      to="/my-career/cv"',
    replace: '      to="/my-career"',
    guard: GUARD,
    expect: "and to the CV",
  },

  /* ── A SUMMARY THAT GROWS INTO A SECOND PAGE ───────────────────────── */
  {
    id: "CDC-NC-SUMMARY-GAINS-WITHDRAW",
    defect:
      "the summary gains a withdraw control, so an action that needs the full row's context sits beside a search field",
    file: COLUMN,
    find: "import { APPLICATION_STATUS_LABEL_KEY }",
    replace:
      "import { withdrawMyApplication } from \"@/lib/job-intelligence/applications.functions\";\nimport { APPLICATION_STATUS_LABEL_KEY }",
    guard: GUARD,
    expect: "carries no withdrawMyApplication control",
  },
  {
    id: "CDC-NC-SECOND-READ-PATH",
    defect:
      "the column defines a server function of its own instead of reusing listMyApplications — a second read of the same rows",
    file: COLUMN,
    find: "const SUMMARY_LIMIT = 3;",
    replace:
      "const loadSummary = createServerFn({ method: \"GET\" }).handler(async () => []);\n\nconst SUMMARY_LIMIT = 3;",
    guard: GUARD,
    expect: "defines no server function of its own",
  },

  /* ── ONE STATUS VOCABULARY ─────────────────────────────────────────── */
  {
    id: "CDC-NC-STATUS-VOCABULARY-FORKS",
    defect:
      "the Jobs summary authors its own copy of the status keys, so the two surfaces can drift on what `interview` is called",
    file: COLUMN,
    find: "const SUMMARY_LIMIT = 3;",
    replace:
      "const LOCAL_STATUS = { submitted: \"candidate.applications.status.submitted\" } as const;\n\nconst SUMMARY_LIMIT = 3;",
    guard: GUARD,
    expect: "authored in exactly one file",
  },

  /* ── /jobs IS PUBLIC ───────────────────────────────────────────────── */
  {
    id: "CDC-NC-ANONYMOUS-SEES-EMPTY-PANEL",
    defect:
      "the column stops gating on sign-in, so an anonymous visitor is shown an empty 'your applications' panel that reads as 'you have none'",
    file: COLUMN,
    find: "  if (!signedIn) return null;",
    replace: "",
    guard: GUARD,
    expect: "renders nothing at all when they are not",
  },
  {
    id: "CDC-NC-LOADING-COUNTS-AS-SIGNED-IN",
    defect:
      "signed-in becomes 'not anonymous', so the loading state fires an authenticated read on every anonymous page view and flashes a panel that then vanishes",
    file: JOBS,
    find:
      '  const signedIn =\n    profileState.status === "no_profile" || profileState.status === "ready";',
    replace: '  const signedIn = profileState.status !== "anonymous";',
    guard: GUARD,
    expect: "resolved from the observed states",
  },

  /* ── SKETCH 4 · DOORS, NOT DUPLICATES ──────────────────────────────── */
  {
    id: "CDC-NC-CAREER-ENTRY-CARDS-GONE",
    defect:
      "the Career hero stops naming the two ways in, so a reader who has done neither cannot tell the two sections apart by scrolling",
    file: CAREER,
    find: "        aside={<CareerEntryCards pathAnchor={PATH_ANCHOR} personalAnchor={PERSONAL_ANCHOR} />}",
    replace: "        aside={<TrustRail />}",
    guard: GUARD,
    expect: "the Career hero carries the two entry cards",
  },
  {
    id: "CDC-NC-CAREER-ANCHOR-MISSING",
    defect:
      "the personal section loses its id, so the entry card scrolls nowhere and lands the reader at the top of the hub",
    file: CAREER,
    find: "      <Section bordered id={PERSONAL_ANCHOR}",
    replace: "      <Section bordered",
    guard: GUARD,
    expect: "PERSONAL_ANCHOR is a real id on the Career page",
  },
  {
    id: "CDC-NC-CARDS-DUPLICATE-CONTENT",
    defect:
      "the entry cards start rendering professions of their own, giving one fact two places to disagree about itself",
    file: CARDS,
    find: 'import { useT } from "@/i18n/context";',
    replace:
      'import { useQuery } from "@tanstack/react-query";\nimport { useT } from "@/i18n/context";',
    guard: GUARD,
    expect: "render no professions of their own",
  },
  {
    id: "CDC-NC-TRUSTRAIL-DELETED",
    defect:
      "TrustRail is deleted rather than moved when the cards take the hero aside, silently dropping the sourcing statement for the profession guides",
    file: CAREER,
    find: "          <div className=\"md:col-span-5\">\n            <TrustRail />\n          </div>\n",
    replace: "",
    guard: GUARD,
    expect: "TrustRail still renders",
  },

  /* ── SKETCH 5 · A POINTER STAYS A POINTER ──────────────────────────── */
  {
    id: "CDC-NC-CAREER-DISCOVERY-POINTER-GONE",
    defect:
      "Tests & Development stops naming the career analysis, so sketch 5's card disappears and the destination says nothing about it",
    file: ACADEMY,
    find: '          title={t("academy.home.careerDiscovery.title")}',
    replace: '          title={t("academy.home.learning")}',
    guard: GUARD,
    expect: "the destination names the career analysis",
  },
  {
    id: "CDC-NC-DISCOVERY-ALIAS-USED",
    defect:
      "the pointer aims at the /discovery alias rather than the canonical path, making Tests & Development a second way in with its own history",
    file: ACADEMY,
    find: "          to={CANONICAL_ASSESSMENT_PATH}",
    replace: '          to={"/discovery"}',
    guard: GUARD,
    expect: "links to the canonical assessment path",
  },
  {
    id: "CDC-NC-RUN-HOSTED-HERE",
    defect:
      "Tests & Development starts hosting the report view, so Career Discovery exists twice instead of being one product reached through Karriär",
    file: ACADEMY,
    find: "      <section className=\"mt-10\">\n        <SectionHeading\n          icon={Compass}",
    replace:
      "      <V31ReportView />\n      <section className=\"mt-10\">\n        <SectionHeading\n          icon={Compass}",
    guard: GUARD,
    expect: "renders no <V31ReportView>",
  },

  /* ── NOTHING IS INVENTED FOR A MODEL THAT DOES NOT EXIST ───────────── */
  {
    id: "CDC-NC-COMPETENCE-MAPPING-FAKED",
    defect:
      "the competence mapping is faked with a hard-coded completion figure — a false statement to the candidate about their own record, for a model that does not exist",
    file: ACADEMY,
    find: '        {t(recruitmentOnly ? "academy.home.titleRecruitment" : "academy.home.title")}',
    replace: '        Min kompetenskartläggning — 68 % klar',
    guard: GUARD,
    expect: "does not render a competence mapping it has no data for",
  },

  /* ── ONE DESTINATION, ONE NAME ─────────────────────────────────────── */
  {
    id: "CDC-NC-PAGE-CARRIES-WORKSPACE-NAME",
    defect:
      "the preparation back-link goes back to naming the Översikt PAGE with the workspace's name, which is the one-place-two-names defect the navigation canon removed",
    file: PREPARATION,
    find: '              {t("nav.overview")}',
    replace: '              {t("nav.my_career")}',
    guard: GUARD,
    expect: "names the page it returns to, not the workspace",
  },
];

runControls("candidate-destination-composition", MUTATIONS);
