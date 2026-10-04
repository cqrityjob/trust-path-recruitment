/**
 * Generate (or verify) the artefacts of the 2026-10-03 certification research import.
 *
 *   bun run scripts/passport-catalogue-research-build.ts            write every artefact
 *   bun run scripts/passport-catalogue-research-build.ts --check    fail if a committed artefact differs
 *
 * The generated files are listed in scripts/lib/passport-catalogue-research.ts.
 * Credential-free and network-free.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  IMPORT_MIGRATION,
  IMPORT_ROLLBACK,
  PUBLISH_ROLLBACK,
  MARKS_FILE,
  PUBLISH_MIGRATION,
  RECONCILIATION_JSON,
  RECONCILIATION_MD,
  emitImportRollbackSql,
  emitImportSql,
  emitPublishRollbackSql,
  emitMarksTs,
  emitPublishSql,
  emitReconciliationJson,
  emitReconciliationMd,
  readRepoFile,
  reconcile,
  repoRoot,
} from "./lib/passport-catalogue-research.ts";

const ds = reconcile();
const artefacts: [string, string][] = [
  [IMPORT_MIGRATION, emitImportSql(ds)],
  [PUBLISH_MIGRATION, emitPublishSql(ds)],
  [IMPORT_ROLLBACK, emitImportRollbackSql(ds)],
  [PUBLISH_ROLLBACK, emitPublishRollbackSql(ds)],
  [MARKS_FILE, emitMarksTs(ds)],
  [RECONCILIATION_JSON, emitReconciliationJson(ds)],
  [RECONCILIATION_MD, emitReconciliationMd(ds)],
];

const check = process.argv.includes("--check");
const stale: string[] = [];
for (const [rel, body] of artefacts) {
  if (check) {
    if (readRepoFile(rel) !== body) stale.push(rel);
  } else {
    const abs = path.join(repoRoot, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
    console.log(`wrote ${rel} (${body.length} bytes)`);
  }
}
if (check) {
  if (stale.length) {
    console.error("These generated files differ from what the generator produces:");
    for (const s of stale) console.error(`  - ${s}`);
    console.error("Run: bun run scripts/passport-catalogue-research-build.ts");
    process.exit(1);
  }
  console.log(`generated artefacts are current (${artefacts.length} files)`);
}
