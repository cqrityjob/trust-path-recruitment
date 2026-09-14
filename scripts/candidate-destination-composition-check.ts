// The three candidate destinations compose to the owner's sketches 3, 4 and 5.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// Each of the five destinations owns supporting surfaces, and the
// navigation has lit the right item for them since PR A. What it did not
// check is whether the destination can REACH what it claims. /jobs lit
// "Jobb" for /my-career/applications while offering no link to it, so a
// candidate checking an application went back to Översikt to find it.
//
// So this guard asserts reachability, and the three rules that make the
// composition honest rather than merely present:
//
//   1. Jobs reaches its applications and the CV, as a summary — not as a
//      second applications page with its own controls.
//   2. One status vocabulary, shared, so the summary and the full page
//      cannot call the same status different things.
//   3. /jobs is public: the personal column renders only for a reader the
//      client has actually observed a session for.
//   4. Career names its two ways in, and links to sections that exist.
//   5. Tests & Development POINTS at Career Discovery and does not host it.
//   6. Nothing fabricates the competence mapping, which has no model.
//
// Run: bun run candidate-destination-composition:check

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
/** Strip comments, so a rule is never satisfied by prose describing it. */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const JOBS = "src/routes/jobs.index.tsx";
const JOBS_COLUMN = "src/components/jobs/JobsSideColumn.tsx";
const APPLICATIONS = "src/routes/_authenticated.my-career.applications.tsx";
const STATUS_LABELS = "src/lib/job-intelligence/application-status-labels.ts";
const CAREER = "src/routes/career-center.index.tsx";
const CAREER_CARDS = "src/components/career-center/CareerEntryCards.tsx";
const ACADEMY = "src/routes/_authenticated.academy.index.tsx";
const PREPARATION = "src/components/beskt/CandidatePreparation.tsx";

const failures: string[] = [];
let assertions = 0;
function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

const jobs = code(read(JOBS));
const column = code(read(JOBS_COLUMN));

/* ------------------------------------------------------------------ */
console.log("\n1 · sketch 3 — Jobs reaches the surfaces it claims");

check(/<JobsSideColumn/.test(jobs), "the Jobs page mounts the supporting column");
check(
  /to="\/my-career\/applications"/.test(column),
  "the column links to the applications page the navigation assigns to Jobs",
);
check(/to="\/my-career\/cv"/.test(column), "and to the CV, which Jobs owns contextually");
check(
  /listMyApplications/.test(column),
  "it reads the candidate's own applications through the existing server function",
);
check(
  !/createServerFn/.test(column),
  "and defines no server function of its own — no second read path",
);

/* ------------------------------------------------------------------ */
console.log("\n2 · a summary, not a second applications page");

// The controls that ACT on an application belong with the full row that
// explains what it is doing. A withdraw button beside a search field is
// the defect this asserts against.
for (const control of ["withdrawMyApplication", "action.downloadCv", "action.withdraw"]) {
  check(
    !new RegExp(control.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(column),
    `the summary carries no ${control} control — those act, and belong on the full page`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n3 · one status vocabulary");

const labels = code(read(STATUS_LABELS));
const applications = code(read(APPLICATIONS));
check(
  /APPLICATION_STATUS_LABEL_KEY/.test(labels),
  "the shared status map exists",
);
for (const [file, name] of [
  [applications, "the applications page"],
  [column, "the Jobs summary"],
] as const) {
  check(
    /APPLICATION_STATUS_LABEL_KEY/.test(file),
    `${name} reads its status labels from the shared map`,
  );
}
// A second literal copy is what the extraction removed. Counting the
// definition rather than the identifier: the map must be authored once.
const definitions = [labels, applications, column].filter((f) =>
  /candidate\.applications\.status\.submitted/.test(f),
).length;
check(
  definitions === 1,
  `the status keys are authored in exactly one file (found ${definitions})`,
);

/* ------------------------------------------------------------------ */
console.log("\n4 · /jobs is public, and the personal column knows it");

check(
  /signedIn=\{signedIn\}/.test(jobs),
  "the column is told whether the reader is signed in",
);
check(
  /if \(!signedIn\) return null/.test(column),
  "and renders nothing at all when they are not — never an empty 'your applications'",
);
// `loading` is the state BEFORE a session has been observed. Treating it
// as signed in fires an authenticated read on every anonymous page view.
check(
  /const signedIn =\s*\n?\s*profileState\.status === "no_profile" \|\| profileState\.status === "ready"/.test(
    jobs,
  ),
  "signed-in is resolved from the observed states, not from 'not anonymous'",
);
check(
  !/status !== "anonymous"/.test(jobs),
  "so a loading page never counts as signed in",
);

/* ------------------------------------------------------------------ */
console.log("\n5 · sketch 4 — Career names its two ways in");

const career = code(read(CAREER));
const cards = code(read(CAREER_CARDS));
check(/<CareerEntryCards/.test(career), "the Career hero carries the two entry cards");
check(
  /pathAnchor=\{PATH_ANCHOR\}/.test(career) && /personalAnchor=\{PERSONAL_ANCHOR\}/.test(career),
  "pointed at the page's own two section anchors",
);
// Both anchors must be REAL ids on this page, or the card scrolls nowhere.
for (const anchor of ["PATH_ANCHOR", "PERSONAL_ANCHOR"]) {
  check(
    new RegExp(`id=\\{${anchor}\\}`).test(career),
    `${anchor} is a real id on the Career page`,
  );
}
// Doors, not sections: duplicating either section's content here would
// give one fact two places to disagree about itself.
check(
  !/useQuery|PathFromSection|PersonalDirectionSection/.test(cards),
  "the cards render no professions of their own — they link, they do not duplicate",
);
// TrustRail was displaced from the hero by the cards. Displaced, not deleted.
check(
  /<TrustRail \/>/.test(career),
  "TrustRail still renders — it moved to the catalogue it describes rather than being dropped",
);

/* ------------------------------------------------------------------ */
console.log("\n6 · sketch 5 — Tests & Development points at Career Discovery");

const academy = code(read(ACADEMY));
check(
  /academy\.home\.careerDiscovery\.title/.test(academy),
  "the destination names the career analysis",
);
check(
  /to=\{CANONICAL_ASSESSMENT_PATH\}/.test(academy),
  "and links to the canonical assessment path, not the /discovery alias",
);
check(
  !/"\/discovery"/.test(academy),
  "so this is a pointer at the one product, not a second way in with its own history",
);
// A POINTER. Career Discovery is one product, reached through Karriär.
// Hosting the run here would make it a second instance.
// Element usage, not the bare word: this page imports AssessmentPanel from
// a module whose PATH contains "AssessmentShell", and an import path is not
// a hosted run. Matching the word failed on a file that was correct.
for (const hosted of ["AssessmentShell", "V31ReportView", "PublicAssessmentFlow"]) {
  check(
    !new RegExp(`<${hosted}[\\s/>]`).test(academy),
    `Tests & Development renders no <${hosted}> — it may name the analysis, not run it`,
  );
}
check(
  !/CANONICAL_SESSION_PATH/.test(academy),
  "and never links straight into a run session, which would bypass the analysis's own entry",
);

/* ------------------------------------------------------------------ */
console.log("\n7 · nothing fabricates the competence mapping");

// Sketch 5's left column has no backing model. A hard-coded ring would be
// a false statement to the candidate about their own record.
check(
  !/kompetenskartl/i.test(academy),
  "the academy page does not render a competence mapping it has no data for",
);
check(
  !/\b68\s*%|\b4 av 6\b|\b4 of 6\b/.test(academy),
  "and no hard-coded completion figure stands in for one",
);

/* ------------------------------------------------------------------ */
console.log("\n8 · one destination, one name");

// "Min karriär" names the WORKSPACE in the account menu's context switch.
// It does not name the page at /my-career, which is Översikt. A back-link
// to that PAGE carrying the workspace name is the one-place-two-names
// defect the navigation canon removed.
const preparation = code(read(PREPARATION));
check(
  !/nav\.my_career/.test(preparation),
  "the preparation back-link names the page it returns to, not the workspace",
);
check(
  /nav\.overview/.test(preparation),
  "and it names it Översikt",
);

/* ------------------------------------------------------------------ */
console.log("");
if (failures.length > 0) {
  console.error(`candidate-destination-composition FAILED (${failures.length} of ${assertions}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Candidate destination composition: ${assertions} of ${assertions} assertions passed.`);
