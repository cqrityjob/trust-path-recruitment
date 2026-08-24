/**
 * My Career must never offer a door the product will refuse to open.
 *
 * ── THE DEFECT THIS DEFENDS ────────────────────────────────────────────
 *
 * /security-career-assessment answers to two gates, in this order:
 *
 *   getV31Availability   is the CONTENT ready?  (lifecycle_status)
 *   getV31TesterStatus   may THIS person run it? (platform admin, or a row in
 *                        cd_internal_testers — which starts empty)
 *
 * The gate is deliberate and stays: the recommendation layer built on top of
 * the assessment is still mid-build, so `lifecycle_status = 'active'` alone
 * admitted more people than intended.
 *
 * My Career simply never asked. It said "Complete the assessment to unlock
 * recommendations", offered "Start assessment" as the recommended NEXT STEP,
 * and listed "Retake assessment" as a quick action — and all three landed on
 * "The assessment isn't open yet".
 *
 * ── WHY THESE ASSERTIONS ARE SHAPED THIS WAY ───────────────────────────
 *
 * The requirement is not "show a closed notice". It is that the page tells the
 * truth for BOTH personas, without a second feature flag and without touching
 * governance:
 *
 *   non-tester         no assessment CTA anywhere, and an explanation
 *   authorised tester  the CTAs come back, with no code change
 *
 * A hardcoded closed notice would satisfy the first and permanently break the
 * second. So what is asserted is that the page DERIVES its state from the same
 * two gates the route uses — which is what makes granting a tester row
 * sufficient, and is exactly what was verified against a local stack: the same
 * account went from 0 assessment links to 3 when a cd_internal_testers row was
 * added, with nothing rebuilt.
 *
 * Run: bun run my-career-gate:check
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PAGE = join(ROOT, "src/routes/_authenticated.my-career.index.tsx");
const src = readFileSync(PAGE, "utf8");

let checks = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  checks += 1;
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

console.log("my-career-assessment-gate-check\n");

console.log("GROUP 1 -- the page asks the SAME questions the route asks");

assert(src.includes("getV31Availability"), "My Career reads the availability gate");
assert(
  src.includes("getV31TesterStatus"),
  "My Career reads the tester gate — the one that actually refuses",
);
// Order matters only in that availability is cheap and unauthenticated; the
// tester check is the one that needs a session. Both must be present.
assert(
  src.indexOf("getV31Availability") < src.indexOf("checkTesterStatus"),
  "availability is resolved before the tester check, as in the route",
);
// No second flag. Governance lives in cd_internal_testers and nowhere else;
// a local override would drift from it silently.
for (const flag of ["VITE_ASSESSMENT_ENABLED", "assessmentEnabled", "ASSESSMENT_FLAG"]) {
  assert(!src.includes(flag), `no second feature flag (${flag}) shadows the real gate`);
}

console.log("\nGROUP 2 -- 'closed' is DERIVED, never assumed");

// `=== false` and not `!open`. While the query is in flight the value is
// undefined, and treating that as closed would flash a closed notice at a
// tester who is in fact allowed in.
assert(
  /assessmentClosed\s*=\s*assessmentOpenQ\.data === false/.test(src),
  "closed means the gate ANSWERED no, not merely 'not yet answered yes'",
);
assert(!/assessmentClosed\s*=\s*!/.test(src), "a pending query is not mistaken for a refusal");

console.log("\nGROUP 3 -- every assessment CTA is behind the gate");

// The three surfaces that used to dead-end. Each must be conditional; a bare
// link would be a visible action leading somewhere the product refuses.
const ctaBlocks = src.split("/security-career-assessment");
// First element is the text before the first occurrence — not a CTA.
assert(ctaBlocks.length - 1 >= 3, "the page still has the assessment CTAs to gate");
assert(
  /assessmentClosed\s*\?/.test(src),
  "the CTAs branch on the gate rather than rendering unconditionally",
);
// The recommended next step must offer something reachable when it is closed.
assert(
  /noAssessment && assessmentClosed/.test(src),
  "the recommended next step has a closed branch of its own",
);
assert(
  src.includes("unavailable={") || src.includes("unavailable ="),
  "the quick action can render as unavailable rather than as a dead link",
);

console.log("\nGROUP 4 -- the closed state explains itself and offers a way on");

// A refusal with no reason and nowhere to go is the dead end by another name.
assert(
  /under review|granskning|isn't open yet|inte öppet/i.test(src),
  "the closed state says WHY, in both languages",
);
assert(
  /to="\/career-center"/.test(src),
  "and offers something the candidate can actually do instead",
);
// Truthful and dateless: no launch date is known, and promising one is how a
// pilot acquires a commitment nobody made.
assert(
  !/\b20\d\d\b/.test(
    (src.match(/assessmentClosed[\s\S]{0,1200}/) ?? [""])[0].replace(/Co-Authored[\s\S]*/, ""),
  ),
  "and promises no launch date",
);

console.log("");
if (failures.length > 0) {
  console.error(`my-career-assessment-gate-check FAILED (${failures.length} of ${checks}).`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`my-career-assessment-gate-check: ${checks} assertions passed.`);
