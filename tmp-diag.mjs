import { computeMatches } from "./src/lib/career-assessment/matching-engine.ts";
import { testPersonas } from "./src/lib/career-assessment/test-personas.ts";
const H = testPersonas.find(p => p.id === "H_strategic_manager");
const r = computeMatches(H.answers);
console.log("User vector:");
for (const v of r.userVector) console.log(" ", v.dimension.padEnd(30), Math.round(v.normalized), v.observed ? "obs" : "unobs", "ev=", v.evidence);
console.log("\nMatches:");
for (const m of r.matches.slice(0, 6)) {
  console.log(` ${m.professionId.padEnd(28)} disp=${m.displayedMatch} raw=${m.rawSimilarity.toFixed(3)} conf=${m.confidence} gate=${m.gatePassed} distCov=${m.distinguishingCoverage.toFixed(2)} mis=${m.mismatchPenalty.toFixed(2)} impObs=${m.contributingImportantCount}/${m.importantDimensionCount}`);
}
