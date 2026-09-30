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
const JOB_AD = "src/routes/jobs.$slug.tsx";
const APPLY = "src/components/jobs/ApplyInternalDialog.tsx";
const CAREER = "src/routes/career-center.index.tsx";
const CARDS = "src/components/career-center/CareerEntryCards.tsx";
const ACADEMY = "src/routes/_authenticated.academy.index.tsx";
const PREPARATION = "src/components/beskt/CandidatePreparation.tsx";
const GUARD = "candidate-destination-composition:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "CDC-NC-JOBS-UNREACHABLE",
    defect:
      "the advert's own page stops mounting the real job reader, so the application and CV entry points every Jobs card leads to become unreachable",
    file: JOB_AD,
    find: "<JobDetailContent",
    replace: "<IgnoredJobDetailContent",
    guard: GUARD,
    expect: "which mounts the job detail reader",
  },
  {
    id: "CDC-NC-JOBS-DETAIL-PANEL-RETURNS-INSTEAD",
    defect:
      "the list stops rendering cards that open the advert's page — the retired in-list detail panel's shape",
    file: JOBS,
    find: "<JobCard job={job} lang={lang} from={from} />",
    replace: "<div data-job={job.slug} />",
    guard: GUARD,
    expect: "every Jobs card opens the advert's own page",
  },
  {
    id: "CDC-NC-APPLICATIONS-LINK-DROPPED",
    defect: "Jobs loses its direct applications destination",
    file: JOBS,
    find: 'to="/my-career/applications"',
    replace: 'to="/jobs"',
    guard: GUARD,
    expect: "the Jobs page links directly to the applications page",
  },
  {
    id: "CDC-NC-CV-LINK-DROPPED",
    defect: "An applicant with an unfinished CV loses the contextual edit route",
    file: APPLY,
    find: '<Link\n                      to="/my-career/cv"\n                      className="mt-1 inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"\n                    >\n                      {t("jobs.apply.cv.finish")}',
    replace:
      '<Link\n                      to="/my-career"\n                      className="mt-1 inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"\n                    >\n                      {t("jobs.apply.cv.finish")}',
    guard: GUARD,
    expect: "the mounted application flow links to the CV to finish it",
  },
  {
    id: "CDC-NC-SUMMARY-GAINS-WITHDRAW",
    defect:
      "The public job application flow gains management controls that belong on the full applications page",
    file: APPLY,
    find: "  const applications = useQuery({",
    replace: "  const withdraw = withdrawMyApplication;\n  const applications = useQuery({",
    guard: GUARD,
    expect: "carry no withdrawMyApplication control",
  },
  {
    id: "CDC-NC-SECOND-READ-PATH",
    defect:
      "The application flow creates a second server read instead of reusing the existing function",
    file: APPLY,
    find: "  const applications = useQuery({",
    replace:
      '  const load = createServerFn({ method: "GET" }).handler(async () => []);\n  const applications = useQuery({',
    guard: GUARD,
    expect: "define no server function of their own",
  },
  {
    id: "CDC-NC-STATUS-VOCABULARY-FORKS",
    defect: "The mounted application flow authors a competing application status vocabulary",
    file: APPLY,
    find: "  const applications = useQuery({",
    replace:
      '  const LOCAL_STATUS = { submitted: "candidate.applications.status.submitted" };\n  const applications = useQuery({',
    guard: GUARD,
    expect: "authored in exactly one file",
  },
  {
    id: "CDC-NC-ANONYMOUS-SEES-EMPTY-PANEL",
    defect:
      "Anonymous visitors can reach the personal application dialog instead of the sign-in action",
    file: APPLY,
    find: "  if (!signedIn) {",
    replace: "  if (false) {",
    guard: GUARD,
    expect: "anonymous visitors return the sign-in action",
  },
  {
    id: "CDC-NC-LOADING-COUNTS-AS-SIGNED-IN",
    defect: "Unresolved auth enables a personal applications request because null is not false",
    file: APPLY,
    find: "    enabled: Boolean(authUserId),",
    replace: "    enabled: signedIn !== false,",
    guard: GUARD,
    expect: "query is enabled only for an observed user identity",
  },
  {
    id: "CDC-NC-PUBLIC-READER-PERSONAL-READ",
    defect: "Public discovery bypasses the application auth boundary to read personal data",
    file: JOBS,
    find: "function JobsDiscoveryPage() {",
    replace: "function JobsDiscoveryPage() {\n  void listMyApplications();",
    guard: GUARD,
    expect: "perform no direct personal reads",
  },
  {
    id: "CDC-NC-APPLICATIONS-CACHE-UNSCOPED",
    defect: "Signing into another account can reuse the previous account application cache",
    file: APPLY,
    find: '    queryKey: ["job-apply", "applications", authUserId],',
    replace: '    queryKey: ["job-apply", "applications"],',
    guard: GUARD,
    expect: "cache keys are scoped to the observed user",
  },
  {
    id: "CDC-NC-UNRESOLVED-AUTH-FORM",
    defect: "The loading session loses its own pre-dialog return",
    file: APPLY,
    find: "  if (signedIn === null) {",
    replace: "  if (false) {",
    guard: GUARD,
    expect: "unresolved auth returns before the anonymous branch",
  },
  {
    id: "CDC-NC-APPLY-INTENT-BYPASSES-AUTH",
    defect: "URL apply intent can open the application dialog before sign-in is observed",
    file: APPLY,
    find: "    if (!signedIn || applications.isPending || applyIntentConsumed.current) return;",
    replace: "    if (applications.isPending || applyIntentConsumed.current) return;",
    guard: GUARD,
    expect: "intent cannot open the personal dialog before observed sign-in",
  },
  {
    id: "CDC-NC-CV-READ-BEFORE-DIALOG",
    defect: "CV choices are requested before the authenticated application dialog opens",
    file: APPLY,
    find: '    if (!open || cvOptions.status !== "loading") return;',
    replace: '    if (cvOptions.status !== "loading") return;',
    guard: GUARD,
    expect: "choices are read only when the authenticated application dialog opens",
  },
  {
    id: "CDC-NC-PASSPORT-READ-BEFORE-DIALOG",
    defect: "Passport choices are requested before the authenticated application dialog opens",
    file: APPLY,
    find: "    if (!open || offer !== null) return;",
    replace: "    if (offer !== null) return;",
    guard: GUARD,
    expect: "choices are read only when the authenticated application dialog opens",
  },

  /* ── SKETCH 4 · DOORS, NOT DUPLICATES ──────────────────────────────── */
  {
    id: "CDC-NC-CAREER-ENTRY-CARDS-GONE",
    defect:
      "the Career hero stops naming the two ways in, so a reader who has done neither cannot tell the two sections apart by scrolling",
    file: CAREER,
    // The aside became multi-line when the cards learned whether the reader's
    // own result is in hand; the anchor names the real layout.
    find: "          <CareerEntryCards\n            pathAnchor={PATH_ANCHOR}\n            personalAnchor={PERSONAL_ANCHOR}\n            listAnchor={LIST_ANCHOR}\n            personalised={personalised}\n          />",
    replace: "          <div />",
    guard: GUARD,
    expect: "the Career hero carries the two entry cards",
  },
  {
    id: "CDC-NC-CAREER-ANCHOR-MISSING",
    defect:
      "the personal section loses its id, so the entry card scrolls nowhere and lands the reader at the top of the hub",
    file: CAREER,
    // The personal section is built once and placed by state (first when
    // the reader's result is in hand, after the catalogue otherwise).
    find: "    <Section bordered id={PERSONAL_ANCHOR}",
    replace: "    <Section bordered",
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
    id: "CDC-NC-GUIDE-BASIS-DELETED",
    defect:
      "the one line that says what the profession guides are based on is deleted along with the side panel it replaced, silently dropping the sourcing statement",
    file: CAREER,
    find: "              data-explore-basis\n",
    replace: "",
    guard: GUARD,
    expect: "the list of professions still says how many guides there are",
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
    find: '      <section className="mt-10">\n        <SectionHeading\n          icon={Compass}',
    replace:
      '      <V31ReportView />\n      <section className="mt-10">\n        <SectionHeading\n          icon={Compass}',
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
    replace: "        Min kompetenskartläggning — 68 % klar",
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
