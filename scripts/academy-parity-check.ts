// Swedish/English parity for the Assessment Center surface.
//
// A missing key does not crash — t() returns the key itself — so a gap ships
// silently as a raw identifier in the UI. That is exactly the class of defect a
// build cannot catch, which is why it is checked here.

import { dictionaries } from "../src/i18n/dictionaries";

const sv = Object.keys(dictionaries.sv);
const en = Object.keys(dictionaries.en);
const svSet = new Set(sv);
const enSet = new Set(en);

const missingEn = sv.filter((k) => !enSet.has(k));
const missingSv = en.filter((k) => !svSet.has(k));

const academy = sv.filter((k) => k.startsWith("academy."));
const blankSv = academy.filter((k) => !String((dictionaries.sv as Record<string, string>)[k] ?? "").trim());
const blankEn = academy.filter((k) => !String((dictionaries.en as Record<string, string>)[k] ?? "").trim());

// Identical strings are a smell, not an error: "Assessment Center" is the same
// in both languages on purpose. Listed so a lazy copy-paste is visible.
const identical = academy.filter(
  (k) =>
    (dictionaries.sv as Record<string, string>)[k] ===
    (dictionaries.en as Record<string, string>)[k],
);

const problems: string[] = [];
if (missingEn.length) problems.push(`${missingEn.length} key(s) missing from en: ${missingEn.slice(0, 8).join(", ")}`);
if (missingSv.length) problems.push(`${missingSv.length} key(s) missing from sv: ${missingSv.slice(0, 8).join(", ")}`);
if (blankSv.length) problems.push(`${blankSv.length} blank sv value(s): ${blankSv.slice(0, 8).join(", ")}`);
if (blankEn.length) problems.push(`${blankEn.length} blank en value(s): ${blankEn.slice(0, 8).join(", ")}`);

console.log(`sv keys: ${sv.length}   en keys: ${en.length}   academy keys: ${academy.length}`);
console.log(`identical in both languages (${identical.length}): ${identical.join(", ") || "none"}`);

if (problems.length) {
  console.error("\nFAIL:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("\nacademy-parity-check: PASS");
