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
//   1. Jobs reaches applications directly and the CV through its mounted
//      application flow, without becoming a second applications manager.
//   2. One status vocabulary, shared, so the summary and the full page
//      cannot call the same status different things.
//   3. /jobs is public: personal reads wait for an observed session; an
//      unresolved or anonymous visitor sees no personal application form.
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
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const JOBS = "src/routes/jobs.index.tsx";
/** The advert's own page. The list no longer mounts a detail panel beside
 *  itself (owner review, 2026-09-30); every card opens this route. */
const JOB_AD = "src/routes/jobs.$slug.tsx";
const JOB_CARD = "src/components/jobs/JobCard.tsx";
const JOB_DETAIL = "src/components/jobs/JobDetailContent.tsx";
const APPLY_PANEL = "src/components/jobs/JobApplicationPanel.tsx";
const APPLY_DIALOG = "src/components/jobs/ApplyInternalDialog.tsx";
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
const detail = code(read(JOB_DETAIL));
const panel = code(read(APPLY_PANEL));
const apply = code(read(APPLY_DIALOG));
const publicReaders = [jobs, detail, panel];
const mountedJobSources = [...publicReaders, apply];

/* ------------------------------------------------------------------ */
console.log("\n1 · Jobs reaches applications and the CV through mounted surfaces");

check(
  /to="\/my-career\/applications"/.test(jobs),
  "the Jobs page links directly to the applications page",
);
check(
  /<JobCard[\s>]/.test(jobs) &&
    /to="\/jobs\/\$slug"/.test(code(read(JOB_CARD))) &&
    /<JobDetailContent[\s>]/.test(code(read(JOB_AD))),
  "every Jobs card opens the advert's own page, which mounts the job detail reader",
);
check(/<JobApplicationPanel[\s>]/.test(detail), "the job reader mounts the application panel");
check(
  /<ApplyInternalDialog[\s>]/.test(panel),
  "the application panel mounts the internal application flow",
);
for (const action of ["finish", "create"]) {
  check(
    new RegExp(
      `<Link\\s+to="/my-career/cv"[^>]*>\\s*\\{t\\("jobs\\.apply\\.cv\\.${action}"\\)\\}`,
    ).test(apply),
    `the mounted application flow links to the CV to ${action} it`,
  );
}
check(
  /useServerFn\(listMyApplications\)/.test(apply) &&
    /queryFn: \(\) => listApplicationsFn\(\)/.test(apply),
  "the application flow reads existing applications through the existing server function",
);
check(
  mountedJobSources.every((source) => !/createServerFn/.test(source)),
  "the mounted Jobs surfaces define no server function of their own — no second read path",
);

/* ------------------------------------------------------------------ */
console.log("\n2 · Jobs is not a second applications manager");
for (const control of ["withdrawMyApplication", "action.downloadCv", "action.withdraw"]) {
  check(
    mountedJobSources.every((source) => !source.includes(control)),
    `the mounted Jobs surfaces carry no ${control} control — these belong on the full applications page`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n3 · one status vocabulary");
const labels = code(read(STATUS_LABELS));
const applications = code(read(APPLICATIONS));
check(/APPLICATION_STATUS_LABEL_KEY/.test(labels), "the shared status map exists");
check(
  /APPLICATION_STATUS_LABEL_KEY/.test(applications),
  "the applications page reads its status labels from the shared map",
);
// The reader currently offers an application/receipt action, not a status
// summary. If it gains status labels, their vocabulary must remain shared.
const definitions = [labels, applications, ...mountedJobSources].filter((source) =>
  /candidate\.applications\.status\.submitted/.test(source),
).length;
check(definitions === 1, `the status keys are authored in exactly one file (found ${definitions})`);

/* ------------------------------------------------------------------ */
console.log("\n4 · public readers do not request personal data before observed auth");
check(
  publicReaders.every(
    (source) =>
      !/listMyApplications|listMyApplicationCvOptions|getApplicationPassportOffer|useCareerProfileForJobs/.test(
        source,
      ),
  ),
  "public search, detail and apply wrapper perform no direct personal reads",
);
check(
  /useState<string \| null>\(null\)/.test(apply) &&
    /const \[authUserId, setAuthUserId\] = useState<string \| null>\(null\)/.test(apply),
  "the application reader starts with no observed user identity",
);
check(
  /setAuthUserId\(data\.session\?\.user\.id \?\? null\)/.test(apply) &&
    /setAuthUserId\(session\?\.user\.id \?\? null\)/.test(apply),
  "the user identity comes from the observed session and tracks sign-out",
);
check(
  /queryKey: \["job-apply", "applications", authUserId\]/.test(apply),
  "personal application cache keys are scoped to the observed user",
);
check(
  /enabled: Boolean\(authUserId\)/.test(apply),
  "the personal application query is enabled only for an observed user identity",
);
check(
  /const \[signedIn, setSignedIn\] = useState<boolean \| null>\(null\)/.test(apply),
  "sign-in starts unresolved rather than assuming a user",
);
const loadingGate = apply.indexOf("if (signedIn === null) {");
const anonymousGate = apply.indexOf("if (!signedIn) {");
const dialog = apply.indexOf("<Dialog\n");
check(
  loadingGate >= 0 &&
    anonymousGate > loadingGate &&
    dialog > anonymousGate &&
    /if \(signedIn === null\) \{\s*return /.test(apply),
  "unresolved auth returns before the anonymous branch and the personal dialog",
);
check(
  /if \(!signedIn\) \{\s*return \([\s\S]*?jobs\.apply\.signInToApply/.test(apply),
  "anonymous visitors return the sign-in action instead of the personal dialog",
);
check(
  /if \(!signedIn \|\| applications\.isPending \|\| applyIntentConsumed\.current\) return/.test(
    apply,
  ),
  "return-to-apply intent cannot open the personal dialog before observed sign-in",
);
check(
  /if \(!open \|\| offer !== null\) return/.test(apply) &&
    /if \(!open \|\| cvOptions\.status !== "loading"\) return/.test(apply),
  "Passport and CV choices are read only when the authenticated application dialog opens",
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
  check(new RegExp(`id=\\{${anchor}\\}`).test(career), `${anchor} is a real id on the Career page`);
}
// Doors, not sections: duplicating either section's content here would
// give one fact two places to disagree about itself.
check(
  !/useQuery|PathFromSection|PersonalDirectionSection/.test(cards),
  "the cards render no professions of their own — they link, they do not duplicate",
);
// The side panel beside "Alla yrken" was removed (owner review,
// 2026-09-30). What it said about the guides is kept, as one line under the
// list's heading, with the count in the heading itself.
check(
  /data-explore-basis/.test(career) &&
    /t\("cc\.explore\.basis"\)/.test(career) &&
    /PUBLISHED_PROFESSION_COUNT/.test(career),
  "the list of professions still says how many guides there are and what they are based on",
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
check(/nav\.overview/.test(preparation), "and it names it Översikt");

/* ------------------------------------------------------------------ */
console.log("");
if (failures.length > 0) {
  console.error(`candidate-destination-composition FAILED (${failures.length} of ${assertions}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Candidate destination composition: ${assertions} of ${assertions} assertions passed.`);
