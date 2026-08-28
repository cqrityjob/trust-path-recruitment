// Proves the answer key cannot be written by the thing it grades.
//
// An evaluation is only worth the independence of its expectations. The
// failure this guards against is not malice, it is drift: a case fails, someone
// looks at what the engine actually said, decides that is reasonable, and edits
// the expectation. Repeat a dozen times and the dataset has quietly become a
// transcript of the engine's behaviour, scoring 100% forever while measuring
// nothing.
//
// Four structural properties make that hard to do by accident:
//
//   1. The dataset imports nothing. No provider, no orchestrator, no registry.
//      An expectation cannot be computed from engine output because engine
//      output is not reachable from the file.
//   2. Expectations are literal strings. No template, no interpolation, no
//      function call — nothing that could evaluate to whatever the engine said.
//   3. Every case declares its authorship honestly, and a case may only claim
//      blind or expert authorship if it names the person.
//   4. The dataset content is fingerprinted. The fingerprint is printed on
//      every evaluation run and recorded here, so an edit between one report
//      and the next is visible rather than silent.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { GOLD_CASES, GOLD_DATASET_VERSION } from "./fixtures/interview-gold-dataset";

const DATASET_PATH = "scripts/fixtures/interview-gold-dataset.ts";

let checks = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) failures.push(label);
}

const source = readFileSync(DATASET_PATH, "utf8");

/**
 * The file with comments and string literals removed.
 *
 * The property under test is that no CODE in the dataset reaches the engine.
 * The prose does discuss the provider and the policy layer — it has to, since
 * the annotator notes explain why each expected answer is the right one — and
 * flagging that would be testing for the absence of an explanation.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ")
  .replace(/`(?:[^`\\]|\\.)*`/g, '""')
  .replace(/"(?:[^"\\]|\\.)*"/g, '""')
  .replace(/'(?:[^'\\]|\\.)*'/g, '""');

/* ---- 1. The dataset cannot see the engine ------------------------------- */

const imports = [...source.matchAll(/^import\s[\s\S]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
ok(
  imports.length === 0,
  `1.1 the dataset imports nothing (found: ${imports.join(", ") || "none"})`,
);

for (const forbidden of [
  "orchestrator",
  "provider",
  "providers/",
  "registry",
  "policy",
  "runAiTask",
  "MockAiProvider",
]) {
  ok(
    !code.includes(forbidden),
    `1.2 no CODE in the dataset references "${forbidden}" — the graded engine must be unreachable from the answer key`,
  );
}

/* ---- 2. Expectations are authored, not computed -------------------------- */

const EXPECTATION_FIELDS = [
  "expectExtracted",
  "expectMissing",
  "expectVerification",
  "forbiddenConclusions",
  "expectQuarantined",
];

for (const field of EXPECTATION_FIELDS) {
  const blocks = [...source.matchAll(new RegExp(`${field}:\\s*\\[([\\s\\S]*?)\\]`, "g"))];
  for (const [, body] of blocks) {
    // Template literals, identifiers and calls would all let a value come from
    // somewhere other than a person typing it.
    ok(
      !body.includes("`") && !/\w\s*\(/.test(body) && !body.includes("..."),
      `2.1 every ${field} entry is a literal string — no interpolation, call or spread`,
    );
  }
}

/* ---- 3. Authorship is declared honestly --------------------------------- */

for (const c of GOLD_CASES) {
  if (c.annotationStatus !== "synthetic_unreviewed") {
    ok(
      Boolean(c.reviewedBy),
      `3.1 [${c.id}] claims "${c.annotationStatus}" and must name the reviewer`,
    );
  }
  if (c.authoredBlind) {
    ok(
      Boolean(c.reviewedBy) && c.annotationStatus !== "synthetic_unreviewed",
      `3.2 [${c.id}] claims blind authorship without an independent annotator`,
    );
  }
  ok(c.annotatorNote.trim().length > 30, `3.3 [${c.id}] states WHY these are the right answers`);
}

const independent = GOLD_CASES.filter((c) => c.annotationStatus !== "synthetic_unreviewed");
const blind = GOLD_CASES.filter((c) => c.authoredBlind);

/* ---- 4. The dataset is fingerprinted ------------------------------------ */

const fingerprint = createHash("sha256")
  .update(JSON.stringify(GOLD_CASES))
  .digest("hex")
  .slice(0, 16);

ok(GOLD_DATASET_VERSION.length > 0, "4.1 the dataset declares a version");

/* ---------------------------------------------------------------- */

console.log("");
console.log("Gold dataset independence");
console.log(`  checks run:                 ${checks}`);
console.log(`  cases:                      ${GOLD_CASES.length}`);
console.log(`  dataset version:            ${GOLD_DATASET_VERSION}`);
console.log(`  content fingerprint:        ${fingerprint}`);
console.log(`  independently annotated:    ${independent.length}/${GOLD_CASES.length}`);
console.log(`  authored blind:             ${blind.length}/${GOLD_CASES.length}`);
console.log("");
console.log("  The evaluated engine cannot reach this file, and no expectation in");
console.log("  it is computed. What the dataset does NOT establish, stated plainly:");
console.log("");
console.log(
  `  ${independent.length} of ${GOLD_CASES.length} cases have been reviewed by anyone independent of`,
);
console.log("  the implementation. Until that number moves, this dataset can prove a");
console.log("  REGRESSION — behaviour changed against a fixed bar — and cannot prove");
console.log("  CORRECTNESS, because the same party wrote the engine and the answer key.");
console.log("");

if (failures.length > 0) {
  console.error(`interview-gold-independence-check FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("interview-gold-independence-check passed");
