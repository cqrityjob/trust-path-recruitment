// Standalone integrity check for the Career Intelligence Graph.
// Run via `bun run kg:check`. Exits non-zero on errors.

import { checkGraphIntegrity } from "../src/lib/knowledge-graph/integrity";

const res = checkGraphIntegrity();
for (const w of res.warnings) console.warn("[kg:check][warn]", w);
for (const e of res.errors) console.error("[kg:check][error]", e);
if (!res.ok) {
  console.error(`\nkg:check FAILED with ${res.errors.length} error(s).`);
  process.exit(1);
}
console.log("kg:check OK");
