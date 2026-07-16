import { computeMatches } from "./src/lib/career-assessment/matching-engine.ts";
import { testPersonas } from "./src/lib/career-assessment/test-personas.ts";
import { runValidation } from "./src/lib/career-assessment/validation.ts";

const issues = runValidation();
console.log("Validation issues:", issues.length);
for (const i of issues) console.log("  -", i.severity, i.code, i.message);

const tops = new Set();
for (const p of testPersonas) {
  const r = computeMatches(p.answers);
  const top = r.matches.slice(0, 5);
  tops.add(top[0].professionId);
  const okFam = p.expectedTopFamilies.includes(top[0].family);
  const okDis = !(p.disallowedTop ?? []).includes(top[0].professionId);
  console.log(`${p.id.padEnd(24)} ${okFam && okDis ? "OK " : "FAIL"} #1=${top[0].professionId}(${top[0].displayedMatch}%,${top[0].confidence}) | ${top.slice(1).map(m => `${m.professionId}:${m.displayedMatch}`).join(", ")}`);
}
console.log("Distinct #1 professions:", tops.size, [...tops]);
