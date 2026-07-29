// Generates the option-loading VALUES block for the v3.1 instrument migration.
//
// The migration is checked in, not generated at apply time — a migration must
// be reviewable as written. This script exists so the block is never
// hand-edited: regenerate, paste, and let career-discovery-v31-check.ts §11
// confirm the migration and option-matrix.ts still agree tuple for tuple.
//
//   bun run scripts/generate-v31-option-loadings.ts

import { FLAT_LOADINGS } from "../src/lib/career-discovery/v31/option-matrix";
import { OPTION_MATRIX_VERSION } from "../src/lib/career-discovery/v31/version";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const rows = FLAT_LOADINGS.map(
  (l) =>
    `  (${q(OPTION_MATRIX_VERSION)}, ${q(l.questionId)}, ${q(l.optionId)}, ${q(l.dimensionId)}, ` +
    `${q(l.role)}, ${l.roleWeight.toFixed(3)}, ${l.value.toFixed(3)},\n   ${q(l.rationale)})`,
);

console.log(rows.join(",\n"));
console.error(`generated ${rows.length} option loadings`);
