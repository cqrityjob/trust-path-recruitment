/**
 * Planted defects for schema-first-release:check.
 *
 * The inventory records a function WITH its signature. On 2026-09-19 the
 * matcher used that string as a pattern, so its parentheses matched nothing
 * and an application branch calling four unapplied RPCs passed. The guard's
 * self-test must catch that defect planted back.
 *
 * Run: bun run negative-controls:schema-first-release
 */

import { runControls, type Mutation } from "./runner";

const GUARD = "schema-first-release:check";
const FILE = "scripts/schema-first-release-check.ts";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "SFR-NC-SIGNATURE-BLIND",
    defect: "a function recorded with its signature is matched verbatim and never found",
    file: FILE,
    find: "  const id = inventoryIdentifier(item.object);",
    replace: "  const id = item.object;",
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
];

await runControls("schema-first-release", MUTATIONS);
