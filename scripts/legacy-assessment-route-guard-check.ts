// Legacy assessment-route guard — the retired engine stays retired.
//
// Run via `bun run legacy-assessment-routes:check`.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
//
// The Väktare baseline audit (2026-09-02) found four addresses of the retired
// assessment engine still reachable by URL: the token-assign wizard, the
// legacy assignment list, the legacy catalogue detail page, and the public
// /invite/<token> questionnaire runner. None was linked from anywhere; each
// could be typed in, and one of them could still RUN a parallel assessment
// journey against legacy rows with its own progress store and result view.
//
// PR-V2 turned the three employer routes into redirects into the Assessment
// Center and the public one into a "this link is no longer in use" page.
// Nothing about that fails loudly if it regresses: a route file that grows a
// component back still type-checks, still builds, and still renders.
//
// So this reads the four files and asserts three things about each:
//
//   1. it is a redirect or a retired-link page (the address still resolves,
//      so a bookmark is not a 404 -- but it lands in the current product);
//   2. it imports NONE of the retired engine's machinery, so it cannot start,
//      resume, complete or display a legacy run;
//   3. it points at a current Assessment Center / Academy destination.
//
// And it asserts the inverse for the current Väktare journey: the routes that
// ARE the product still call the governed scp_* delivery, review and release
// functions, and the one legacy route that is deliberately kept -- the
// historical result viewer for a completed legacy assignment, which Workforce
// still links to -- is still a page, not a redirect.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(detail ? `${label} — ${detail}` : label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const exists = (p: string) => existsSync(new URL(`../${p}`, import.meta.url));
/** Source with comments removed, so a name quoted in a comment cannot
 *  satisfy -- or fail -- an assertion about what the file does. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const E = "src/routes/_authenticated.employer.$employerSlug.";

/** The retired engine's machinery. A retired route may import none of it. */
const LEGACY_MACHINERY = [
  "createAssessmentAssignment",
  "listAssignmentsForEmployer",
  "cancelAssessmentAssignment",
  "getAssignmentByToken",
  "startAssessmentAssignment",
  "completeAssessmentAssignment",
  "claimAssessmentAssignment",
  "getCompletedAssignmentResultByToken",
  "assembleQuestionSet",
  "EngineResultView",
  "AssessmentQuestion",
  "employer-assessment-catalog.functions",
  "assessment-assignments.functions",
  "question-library",
  "localStorage",
  'from("assessment_assignments")',
  'from("assessments")',
];

type Retired = {
  file: string;
  /** What a visit must land on. */
  destination: RegExp;
  kind: "redirect" | "retired-page";
};

const RETIRED: Retired[] = [
  {
    file: `${E}assessments.assign.tsx`,
    destination: /to:\s*"\/employer\/\$employerSlug\/assessments\/library"/,
    kind: "redirect",
  },
  {
    file: `${E}assessments.assignments.index.tsx`,
    destination: /to:\s*"\/employer\/\$employerSlug\/assessments\/participants"/,
    kind: "redirect",
  },
  {
    file: `${E}assessments.$assessmentSlug.tsx`,
    destination: /to:\s*"\/employer\/\$employerSlug\/assessments\/library"/,
    kind: "redirect",
  },
  {
    file: "src/routes/invite.$token.tsx",
    destination: /to="\/academy"/,
    kind: "retired-page",
  },
];

console.log("\n1. Retired routes cannot run the retired journey");
for (const r of RETIRED) {
  const src = stripComments(read(r.file));
  const name = r.file.replace("src/routes/", "");
  if (r.kind === "redirect") {
    check(
      `1.1 ${name} redirects in beforeLoad`,
      /beforeLoad/.test(src) && /throw redirect\(/.test(src) && /replace:\s*true/.test(src),
    );
    check(`1.2 ${name} renders nothing of its own`, /component:\s*\(\)\s*=>\s*null/.test(src));
  } else {
    check(
      `1.1 ${name} is a retired-link page, not a runner`,
      /invite\.retired\.title/.test(src) && /invite\.retired\.body/.test(src),
    );
    check(
      `1.2 ${name} never reads the token`,
      !/useParams\(\)/.test(src) &&
        !/\btoken\b/.test(src.replace(/createFileRoute\("\/invite\/\$token"\)/, "")),
    );
  }
  check(`1.3 ${name} lands in the current product`, r.destination.test(src));
  const leaked = LEGACY_MACHINERY.filter((m) => src.includes(m));
  check(`1.4 ${name} imports none of the retired engine`, leaked.length === 0, leaked.join(", "));
  check(
    `1.5 ${name} keeps its address (a bookmark resolves, it does not 404)`,
    /createFileRoute\(/.test(src),
  );
}

console.log("\n2. The generated route tree still registers the retired addresses");
const tree = read("src/routeTree.gen.ts");
for (const path of [
  "/_authenticated/employer/$employerSlug/assessments/assign",
  "/_authenticated/employer/$employerSlug/assessments/assignments/",
  "/_authenticated/employer/$employerSlug/assessments/$assessmentSlug",
  "/invite/$token",
]) {
  check(
    `2.1 ${path} is in the route tree`,
    tree.includes(`'${path}'`) || tree.includes(`"${path}"`),
  );
}

console.log("\n3. The one kept legacy route is still a page, and still reachable");
{
  const viewer = stripComments(read(`${E}assessments.assignments.$assignmentId.tsx`));
  check(
    "3.1 the historical result viewer is not a redirect",
    !/throw redirect\(/.test(viewer) &&
      /EmployerReportView|getEmployerAssignmentReport/.test(viewer),
  );
  const workforce = stripComments(read(`${E}workforce.index.tsx`));
  check(
    "3.2 Workforce still links a completed legacy assignment to it",
    workforce.includes('to="/employer/$employerSlug/assessments/assignments/$assignmentId"'),
  );
}

console.log("\n4. The current Väktare journey is untouched");
{
  const runner = stripComments(read("src/routes/_authenticated.academy.$attemptId.tsx"));
  for (const fn of [
    "getAcademyAttemptItems",
    "getAcademyAttemptBlocks",
    "getAcademyAttemptState",
    "saveAcademyResponse",
    "submitAcademyAttempt",
  ]) {
    check(`4.1 the candidate runner still calls ${fn}`, runner.includes(fn));
  }
  const delivery = stripComments(read("src/lib/security-competency/academy-delivery.functions.ts"));
  for (const rpc of [
    "scp_get_attempt_items",
    "scp_get_attempt_blocks",
    "scp_save_response",
    "scp_submit_attempt",
  ]) {
    check(`4.2 delivery goes through ${rpc}`, delivery.includes(`rpc("${rpc}"`));
  }
  const participants = stripComments(read(`${E}assessments.participants.tsx`));
  check(
    "4.3 the employer releases through releaseAcademyReport",
    participants.includes("releaseAcademyReport"),
  );
  const employerFns = stripComments(
    read("src/lib/security-competency/academy-employer.functions.ts"),
  );
  check(
    "4.4 release is scp_release_attempt_report",
    employerFns.includes('rpc("scp_release_attempt_report"'),
  );
  const reviews = stripComments(read(`${E}assessments.reviews.$attemptId.tsx`));
  check("4.5 the review route still exists and renders the queue", /ReviewQueue/.test(reviews));
  for (const f of [
    `${E}assessments.index.tsx`,
    `${E}assessments.library.tsx`,
    `${E}assessments.participants.tsx`,
    `${E}assessments.reviews.index.tsx`,
    `${E}assessments.results.$attemptId.tsx`,
    "src/routes/_authenticated.academy.index.tsx",
    "src/routes/_authenticated.academy.report.$attemptId.tsx",
  ]) {
    const src = stripComments(read(f));
    check(
      `4.6 ${f.replace("src/routes/", "")} is a page, not a redirect`,
      exists(f) && !/throw redirect\(/.test(src),
    );
  }
}

console.log("\n5. No live navigation points at a retired address");
{
  // A retired route is reachable by typing; it must not be reachable by
  // clicking. The only `assessments/assign` string allowed in src/ is the
  // route's own path declaration.
  const glob = (dir: string): string[] => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = `${d}/${name}`;
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".gen.ts")) out.push(p);
      }
    };
    walk(dir);
    return out;
  };
  const root = new URL("../src", import.meta.url).pathname;
  const files = glob(root);
  const offenders: string[] = [];
  for (const f of files) {
    const src = stripComments(readFileSync(f, "utf8"));
    const rel = f.slice(root.length + 1);
    const isOwnRoute =
      rel.endsWith("assessments.assign.tsx") ||
      rel.endsWith("assessments.assignments.index.tsx") ||
      rel.endsWith("assessments.$assessmentSlug.tsx") ||
      rel === "routes/invite.$token.tsx";
    if (isOwnRoute) continue;
    if (
      /to="\/employer\/\$employerSlug\/assessments\/assign"/.test(src) ||
      /to="\/employer\/\$employerSlug\/assessments\/assignments"/.test(src) ||
      /to="\/employer\/\$employerSlug\/assessments\/\$assessmentSlug"/.test(src) ||
      /to="\/invite\/\$token"/.test(src)
    ) {
      offenders.push(rel);
    }
  }
  check(
    "5.1 nothing in src/ links to a retired route",
    offenders.length === 0,
    offenders.join(", "),
  );
}

console.log("");
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} legacy-route assertion(s) failed, ${passed} passed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`ok: ${passed} legacy-route assertions passed`);
