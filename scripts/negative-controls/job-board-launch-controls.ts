/**
 * Negative controls for the job-board launch-readiness guard.
 *
 * Planted, one at a time: Publicera no longer checks the dates (restore ->
 * publish publishes an ad nobody can see), the readiness checklist stops
 * noticing a past expiry, application_url accepts any scheme (schema and
 * helper), /jobs/new forgets the draft it created, the jobs list stops
 * refreshing its overview and hides drafts, the all-applications list stops
 * counting a CQrityjob CV (and offers to download a file that does not exist),
 * a failed submission removes the CV without asking whether it committed, and a
 * closed job's URL is a soft 200 again.
 *
 * Run: bun run negative-controls:job-board-launch
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "job-board-launch:check";
const FUNCS = "src/lib/job-intelligence/employer-jobs.functions.ts";
const APPS = "src/lib/job-intelligence/applications.functions.ts";
const LIST = "src/routes/_authenticated.employer.$employerSlug.jobs.index.tsx";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "JB-NC-PUBLISH-NO-DATE-CHECK",
    defect:
      "Publicera stops checking the dates: a restored advert with a past expires_at publishes invisibly again",
    file: FUNCS,
    find: "    const dateProblems = publishDateProblems(before, new Date());",
    replace: "    const dateProblems: string[] = [];",
    guard: GUARD,
    expect: "publishEmployerJob checks the date rules before it publishes",
  },
  {
    id: "JB-NC-READINESS-PAST-OK",
    defect: "the hub's checklist stops noticing that expires_at has passed",
    file: "src/lib/job-intelligence/job-readiness.ts",
    find: '    if (expires <= t) out.push("EXPIRES_AT_IN_PAST");',
    replace: '    if (expires <= t - 1e13) out.push("EXPIRES_AT_IN_PAST");',
    guard: GUARD,
    expect: "an expires_at in the past is EXPIRES_AT_IN_PAST",
  },
  {
    id: "JB-NC-URL-SCHEMA-ANY-SCHEME",
    defect: "the employer's application_url schema accepts any scheme that parses again",
    file: FUNCS,
    find: '    .refine((v) => isHttpApplicationUrl(v), { message: "APPLICATION_URL_INVALID" })\n',
    replace: "",
    guard: GUARD,
    expect: "the employer's application_url schema refuses anything but http(s)",
  },
  {
    id: "JB-NC-URL-HELPER-ANY-SCHEME",
    defect: "the shared helper calls javascript: a web address",
    file: "src/lib/job-intelligence/application-url.ts",
    find:
      '  if (typeof value !== "string" || !DATABASE_FORM.test(value)) return false;\n' +
      "  try {\n" +
      "    const u = new URL(value);\n" +
      '    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname !== "";\n' +
      "  } catch {\n" +
      "    return false;\n" +
      "  }\n",
    replace: '  return typeof value === "string" && value.length > 0;\n',
    guard: GUARD,
    expect: "is not an application address",
  },
  {
    id: "JB-NC-APPLY-PANEL-RAW-URL",
    defect: "the public apply panel builds its link from the stored value, whatever it is",
    file: "src/components/jobs/JobApplicationPanel.tsx",
    find: '    if (job.application_method === "external" && externalUrl) {',
    replace: '    if (job.application_method === "external" && job.application_url) {',
    guard: GUARD,
    expect: "the apply panel only links a web address",
  },
  {
    id: "JB-NC-NEW-JOB-DUPLICATES",
    defect:
      "/jobs/new forgets the id it was given, so every retry and double click inserts another draft",
    file: "src/routes/_authenticated.employer.$employerSlug.jobs.new.tsx",
    find: "      const id = draftIdRef.current;",
    replace: "      const id: string | null = null;",
    guard: GUARD,
    expect: "every save passes that id on, once it has one",
  },
  {
    id: "JB-NC-LIST-STALE-OVERVIEW",
    defect: "the jobs list stops refreshing the overview its phase badge and filter read",
    file: LIST,
    find: '    qc.invalidateQueries({ queryKey: ["employer", employerId, "recruitment-overview"] });\n',
    replace: "",
    guard: GUARD,
    expect: "every list action refreshes the recruitment overview",
  },
  {
    id: "JB-NC-LIST-HIDES-DRAFTS",
    defect: "the default list view hides drafts again",
    file: "src/lib/recruitment/definitions.ts",
    find: '  return phase === "draft" || isActiveRecruitment(phase, unresolved);',
    replace: "  return isActiveRecruitment(phase, unresolved);",
    guard: GUARD,
    expect: "a draft is shown in the default list view",
  },
  {
    id: "JB-NC-ALL-APPS-NO-CQRITYJOB-CV",
    defect: "the all-applications list reports 'no CV' for a CQrityjob CV again",
    file: APPS,
    find:
      "        coverNote: r.cover_note as string | null,\n" +
      "        status: r.status as ApplicationStatus,\n" +
      '        hasCv: Boolean(r.cv_storage_path) || r.cv_source === "cqrityjob_cv",',
    replace:
      "        coverNote: r.cover_note as string | null,\n" +
      "        status: r.status as ApplicationStatus,\n" +
      "        hasCv: Boolean(r.cv_storage_path),",
    guard: GUARD,
    expect: "it counts a CQrityjob CV as a CV, with the expression the recruitment table uses",
  },
  {
    id: "JB-NC-CV-CHIP-DOWNLOADS-NON-FILE",
    defect:
      "opening a CQrityjob CV dispatches the file download again, which can only answer CV_IS_NOT_A_FILE",
    file: "src/lib/recruitment/requirement-review-draft.ts",
    find: "  if (original.hasUploadedCv) return actions.openFile();",
    replace:
      '  if (original.hasUploadedCv || original.submittedSource === "cqrityjob_cv") return actions.openFile();',
    guard: GUARD,
    expect: "a CQrityjob CV opens the application; only a file offers a download",
  },
  {
    id: "JB-NC-CV-REMOVED-WITHOUT-ASKING",
    defect:
      "a failed submission with no database verdict removes the CV without reading the application back",
    file: APPS,
    find: "      if (insertErr && isAmbiguousSubmissionFailure(insertErr)) {",
    replace: "      if (false && insertErr && isAmbiguousSubmissionFailure(insertErr)) {",
    guard: GUARD,
    expect: "an ambiguous failure reads the application back before the CV can be removed",
  },
  {
    id: "JB-NC-UNCONFIRMED-NOT-SAID",
    defect: "when the commit cannot be told, the candidate gets the generic failure",
    file: APPS,
    find: '          throw new Error("SUBMISSION_UNCONFIRMED");',
    replace: '          throw new Error("SUBMISSION_FAILED");',
    guard: GUARD,
    expect: "when the commit cannot be told the CV is kept and the candidate is told so",
  },
  {
    id: "JB-NC-NO-SQLSTATE-NOT-AMBIGUOUS",
    defect: "a failure with no SQLSTATE is treated as the database's verdict",
    file: "src/lib/job-intelligence/submission-failure.ts",
    find: "  if (!/^[0-9A-Z]{5}$/.test(code)) return true;",
    replace: "  if (false) return true;",
    guard: GUARD,
    expect: "no SQLSTATE at all is ambiguous",
  },
  {
    id: "JB-NC-CLOSED-JOB-SOFT-404",
    defect:
      "a closed job's URL is a 200 with an empty shell again (notFound only from the component)",
    file: "src/routes/jobs.$slug.tsx",
    find: "    if (!job) throw notFound();\n    return job;",
    replace: "    return job;",
    guard: GUARD,
    expect: "the loader throws notFound() for an advert with no public row",
  },
];

runControls("job-board-launch", MUTATIONS);
