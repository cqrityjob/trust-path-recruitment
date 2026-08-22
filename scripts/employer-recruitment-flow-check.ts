// Employer recruitment flow — regression checks for the click reduction pass.
//
// Run via `bun run employer-recruitment-flow:check`. Matches the established
// scripts/employer-job-form-check.ts pattern: a plain importable module, not a
// unit-test-runner suite (none is configured in this project).
//
// ── WHAT IT PROTECTS ────────────────────────────────────────────────────
//
// This pass made one claim and everything else follows from it: a number that
// describes work must land on exactly that work, and every object in the
// recruitment chain must have somewhere to go. Both properties are invisible
// at runtime -- a link that quietly points at an unfiltered list still
// renders, still navigates, and still looks completely fine. The regression
// would be silent, which is precisely why it is worth a check.
//
// So the assertions here are about DESTINATIONS and DEAD ENDS:
//
//   1. the job advertisement is clickable and the hub route exists
//   2. the hub reaches its candidates, and its candidates reach the hub
//   3. the applications list can actually be filtered by job and by status,
//      so the links that filter it are not aiming at a parameter nobody reads
//   4. every dashboard action carries a filtered destination
//   5. review work is reachable from the candidate, and refuses without
//      dead-ending
//   6. the readiness checklist agrees with the server's own submission gate
//   7. every key any of the above renders exists in BOTH languages
//
// It deliberately does NOT assert anything about authorisation. Nothing in
// this pass moved a boundary: RLS, the membership checks inside every server
// function, scp_employer_review_board and jobs_validate_before_write() are the
// authorities and are untouched. A source-text check is the wrong instrument
// for a security property and would give false confidence about one.

import { readFileSync } from "node:fs";
import { dictionaries } from "../src/i18n/dictionaries";
import { checkJobReadiness } from "../src/lib/job-intelligence/job-readiness";

const errors: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) errors.push(message);
};

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Comments explain what a file deliberately does NOT do, and name the very
 *  functions the bans below look for. Scanning them would fail a file for
 *  documenting its own restraint. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ROUTES = "src/routes/";
const JOBS_LIST = `${ROUTES}_authenticated.employer.$employerSlug.jobs.index.tsx`;
const JOB_HUB = `${ROUTES}_authenticated.employer.$employerSlug.jobs.$jobId.index.tsx`;
const APPLICATIONS = `${ROUTES}_authenticated.employer.$employerSlug.applications.index.tsx`;
const CANDIDATE = `${ROUTES}_authenticated.employer.$employerSlug.applications.$applicationId.tsx`;
const DASHBOARD = `${ROUTES}_authenticated.employer.$employerSlug.index.tsx`;
const PANEL = "src/components/academy/ApplicationAssessmentPanel.tsx";
const ROUTE_TREE = "src/routeTree.gen.ts";

const HUB_ROUTE = "/employer/$employerSlug/jobs/$jobId";

// -----------------------------------------------------------------------------
// 1. The advertisement is an object you can open.
// -----------------------------------------------------------------------------

const jobsList = read(JOBS_LIST);
expect(
  jobsList.includes(`to="${HUB_ROUTE}"`),
  `${JOBS_LIST}: the job list must link to the Job Recruitment Hub. A job row ` +
    `that is not clickable is the defect this pass exists to fix.`,
);
// The title specifically, not only a trailing action button: the title is what
// a recruiter aims at.
expect(
  /<Link\s+to="\/employer\/\$employerSlug\/jobs\/\$jobId"[\s\S]{0,400}?title_sv/.test(jobsList),
  `${JOBS_LIST}: the job TITLE must be the link to the hub, not just a separate action.`,
);

expect(
  read(ROUTE_TREE).includes("_authenticated.employer.$employerSlug.jobs.$jobId.index"),
  `${ROUTE_TREE}: the Job Recruitment Hub route is not registered. Run a build ` +
    `to regenerate the route tree.`,
);

// -----------------------------------------------------------------------------
// 2. The hub reaches its people, and its people reach it back.
// -----------------------------------------------------------------------------

const hub = read(JOB_HUB);
expect(
  hub.includes('to="/employer/$employerSlug/applications/$applicationId"'),
  `${JOB_HUB}: each candidate in the pipeline must open that candidate's own page.`,
);
// The "show these candidates in the full list" link has to carry the job, or
// it lands on every application the organisation has ever received.
expect(
  /to="\/employer\/\$employerSlug\/applications"[\s\S]{0,200}?search=\{\{\s*job:/.test(hub),
  `${JOB_HUB}: the link into the applications list must carry search={{ job }}, ` +
    `otherwise it opens an unfiltered inbox.`,
);
expect(
  hub.includes("listApplicationsForEmployer") && /jobId\s*\}/.test(hub),
  `${JOB_HUB}: candidates must be scoped by jobId in the server call, not filtered ` +
    `out of an organisation-wide fetch in the browser.`,
);

const candidate = read(CANDIDATE);
expect(
  candidate.includes(`to="${HUB_ROUTE}"`),
  `${CANDIDATE}: "open the job" must open the vacancy's own hub, not the job list.`,
);

// -----------------------------------------------------------------------------
// 3. The applications list genuinely reads both filters.
// -----------------------------------------------------------------------------

const applications = read(APPLICATIONS);
expect(
  applications.includes("validateSearch"),
  `${APPLICATIONS}: must declare validateSearch, or every filtered link into it ` +
    `is aiming at a parameter the route discards.`,
);
for (const param of ["job", "status"]) {
  expect(
    new RegExp(`${param}:\\s*z\\.`).test(applications),
    `${APPLICATIONS}: the search schema must accept "${param}".`,
  );
}
expect(
  /r\.jobId === jobFilter/.test(applications) && /r\.status === statusFilter/.test(applications),
  `${APPLICATIONS}: both search parameters must actually narrow the rows.`,
);
// A filter matching nothing must not claim the inbox is empty.
expect(
  /rows\.length === 0 && filtered/.test(applications),
  `${APPLICATIONS}: a filter that matches nothing needs its own empty state -- the ` +
    `"you have no applications yet" copy would be false.`,
);

// -----------------------------------------------------------------------------
// 4. Every dashboard action lands on exactly what it counted.
// -----------------------------------------------------------------------------

const dashboard = read(DASHBOARD);

// Each entry: the action key, and the destination it must carry. A `search`
// clause is what separates "5 new applications" from "here is the inbox".
const REQUIRED_ACTIONS: { key: string; to: string; search: RegExp | null }[] = [
  {
    key: "new-applications",
    to: "/employer/$employerSlug/applications",
    search: /status:\s*"submitted"/,
  },
  { key: "responses-to-review", to: "/employer/$employerSlug/assessments/reviews", search: null },
  {
    key: "results-ready",
    to: "/employer/$employerSlug/assessments/participants",
    search: /state:\s*"ready_to_release"/,
  },
  {
    key: "awaiting-next-step",
    to: "/employer/$employerSlug/applications",
    search: /status:\s*"reviewing"/,
  },
];

for (const action of REQUIRED_ACTIONS) {
  const block = actionBlock(dashboard, action.key);
  if (block === null) {
    errors.push(`${DASHBOARD}: the dashboard no longer offers the "${action.key}" action.`);
    continue;
  }
  expect(
    block.includes(`to: "${action.to}"`),
    `${DASHBOARD}: action "${action.key}" must link to ${action.to}.`,
  );
  if (action.search) {
    expect(
      action.search.test(block),
      `${DASHBOARD}: action "${action.key}" must carry the search filter matching ` +
        `${action.search} -- an unfiltered destination makes the count unactionable.`,
    );
  }
}

/** The literal source of one action item, from its `key:` to the end of its
 *  push() call. Crude on purpose: this file is checking that a specific link
 *  sits next to a specific count, and reading the source is the only way to
 *  know that without a browser. */
function actionBlock(src: string, key: string): string | null {
  const start = src.indexOf(`key: "${key}"`);
  if (start === -1) return null;
  const end = src.indexOf("});", start);
  return end === -1 ? null : src.slice(start, end);
}

// The counts must come from the same read models the destinations render, or
// the dashboard can quote a total its own queue disagrees with.
expect(
  dashboard.includes('queryKey: ["academy", "review-board", employerId]'),
  `${DASHBOARD}: the review count must come from the review board, on the review ` +
    `workspace's own cache key.`,
);

// -----------------------------------------------------------------------------
// 5. Review work reaches the candidate, and refusing is not a dead end.
// -----------------------------------------------------------------------------

const panel = read(PANEL);
expect(
  panel.includes('to="/employer/$employerSlug/assessments/reviews/$attemptId"'),
  `${PANEL}: an assessment with outstanding responses must offer the review from ` +
    `the candidate, not only from Bedomningar > Granskningar.`,
);
expect(
  panel.includes("journey.reviewNotAuthorised"),
  `${PANEL}: a reader who may not review must be told so, not shown nothing.`,
);
expect(
  panel.includes("academy.reviews.manageReviewers"),
  `${PANEL}: where the reader can grant the authorisation themselves, offer the ` +
    `way to do it. That is the difference between a refusal and a dead end.`,
);
expect(
  panel.includes("getEmployerReviewBoard"),
  `${PANEL}: the review gate must be read from scp_employer_review_board, never ` +
    `guessed from the attempt's own state.`,
);
// Governance stays where it is: this panel shows a way IN to the review, it
// never performs one.
const panelCode = stripComments(panel);
for (const forbidden of ["scp_complete_human_review", "completeHumanReview", "releaseResult"]) {
  expect(
    !panelCode.includes(forbidden),
    `${PANEL}: must not perform review or release itself -- it links to the governed ` +
      `surface. Found ${forbidden}.`,
  );
}

// -----------------------------------------------------------------------------
// 6. The readiness checklist agrees with the server's submission gate.
// -----------------------------------------------------------------------------
//
// Cross-checked behaviourally rather than by comparing source: a row the
// checklist calls ready must be a row submitEmployerJob() accepts, and the
// only honest way to assert that is to build rows either side of each rule.

const COMPLETE = {
  title_sv: "Vaktare",
  description_sv: "En beskrivning.",
  application_method: "internal",
  expires_at: "2027-01-01T00:00:00.000Z",
  location_text: "Stockholm",
};

expect(
  checkJobReadiness(COMPLETE).ready,
  "checkJobReadiness: a row satisfying every field of the server's gate must read as ready.",
);

// Each of the server's own `missing` rules, one at a time.
const GATE_CASES: { name: string; row: Record<string, unknown>; expect: string }[] = [
  { name: "no title", row: { ...COMPLETE, title_sv: null }, expect: "title" },
  { name: "no description", row: { ...COMPLETE, description_sv: null }, expect: "description" },
  {
    name: "application_method=unavailable",
    row: { ...COMPLETE, application_method: "unavailable" },
    expect: "applicationMethod",
  },
  {
    name: "external without url",
    row: { ...COMPLETE, application_method: "external", application_url: null },
    expect: "applicationTarget",
  },
  {
    name: "email without address",
    row: { ...COMPLETE, application_method: "email", application_email: null },
    expect: "applicationTarget",
  },
  { name: "no expires_at", row: { ...COMPLETE, expires_at: null }, expect: "expiresAt" },
];

for (const c of GATE_CASES) {
  const result = checkJobReadiness(c.row);
  expect(
    !result.ready && result.blockingMissing.includes(c.expect as never),
    `checkJobReadiness: "${c.name}" must be blocking and reported as "${c.expect}" -- ` +
      `the server refuses this row, so the checklist must too.`,
  );
}

// The advisory half must never block. An advisory that can stop a publication
// is not an advisory, and this is the seam a later assistant plugs into.
const ADVISORY_ONLY = { ...COMPLETE, location_text: null, city: null, title_en: null };
const advisory = checkJobReadiness(ADVISORY_ONLY);
expect(
  advisory.ready && advisory.advisoryMissing.length > 0,
  "checkJobReadiness: missing advisory items must never make a row unready.",
);
expect(
  advisory.checks.filter((c) => !c.blocking).length > 0,
  "checkJobReadiness: the advisory seam must exist -- a checklist of only hard " +
    "requirements has nowhere for suggestions to land.",
);

// A method with no target must not invent a requirement the server does not have.
expect(
  !checkJobReadiness({ ...COMPLETE, application_method: "internal" })
    .checks.map((c) => c.id)
    .includes("applicationTarget"),
  "checkJobReadiness: application_method=internal has no target, so no target " +
    "requirement may be shown.",
);

// -----------------------------------------------------------------------------
// 7. Both languages, complete and distinct.
// -----------------------------------------------------------------------------

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

// Every key this pass introduced, gathered from the surfaces that render them
// rather than listed by hand -- a key added to a page and forgotten in the
// dictionary is exactly the regression worth catching.
const RENDERED = [hub, applications, dashboard, panel, jobsList, candidate].join("\n");
const NEW_PREFIXES = [
  "employer.jobHub.",
  "employer.jobs.readiness.",
  "employer.applications.filter.",
  "employer.actions.",
  "journey.review",
];

const used = new Set<string>();
for (const m of RENDERED.matchAll(/["'`](employer\.[a-zA-Z0-9.]+|journey\.[a-zA-Z0-9.]+)["'`]/g)) {
  const key = m[1];
  if (NEW_PREFIXES.some((p) => key.startsWith(p))) used.add(key);
}

expect(
  used.size >= 25,
  `employer-recruitment-flow: expected to find the new translation keys in the ` +
    `surfaces that render them, found ${used.size}. Has the scan stopped matching?`,
);

for (const key of [...used].sort()) {
  if (!sv[key]) errors.push(`dictionaries.sv is missing "${key}".`);
  if (!en[key]) errors.push(`dictionaries.en is missing "${key}".`);
  if (sv[key] && en[key] && sv[key] === en[key]) {
    // A handful of words are legitimately identical in both languages. Only
    // the ones actually verified as such are exempted.
    const IDENTICAL_IS_FINE = new Set([
      "employer.jobHub.eyebrow",
      "employer.jobHub.stage.interview",
    ]);
    if (!IDENTICAL_IS_FINE.has(key)) {
      errors.push(`"${key}" is identical in sv and en ("${sv[key]}") -- a missed translation.`);
    }
  }
}

// The readiness module names a key for every check it can produce.
for (const check of checkJobReadiness({}).checks) {
  if (!sv[check.labelKey]) errors.push(`dictionaries.sv is missing "${check.labelKey}".`);
  if (!en[check.labelKey]) errors.push(`dictionaries.en is missing "${check.labelKey}".`);
}

// The count placeholder has to survive translation, or the review link reads
// "Review {count} responses" to a real employer.
for (const [lang, dict] of [
  ["sv", sv],
  ["en", en],
] as const) {
  expect(
    dict["journey.reviewResponses"]?.includes("{count}") ?? false,
    `dictionaries.${lang}: "journey.reviewResponses" must keep the {count} placeholder.`,
  );
}

// -----------------------------------------------------------------------------

if (errors.length > 0) {
  for (const e of errors) console.error("[employer-recruitment-flow:check][error]", e);
  console.error(`\nemployer-recruitment-flow:check FAILED with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(
  `employer-recruitment-flow:check OK (job hub reachable and reachable-from; ` +
    `applications filterable by job and status; ${REQUIRED_ACTIONS.length} dashboard ` +
    `actions land on filtered work; review reachable from the candidate with a ` +
    `non-dead-end refusal; readiness matches the server gate; ${used.size} new keys ` +
    `complete in sv and en)`,
);
