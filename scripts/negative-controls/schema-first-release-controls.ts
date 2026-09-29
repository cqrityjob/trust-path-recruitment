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
  {
    // 2026-09-29: with the application calling cd_access_state(), an applied
    // function recorded WITHOUT parameters, the self-test accepted the blind
    // matcher: "cd_access_state()" used verbatim is "cd_access_state" plus an
    // empty group, which matches the call. The self-test now counts only a
    // signature with parameters, so the same defect must still be caught
    // while such a call exists. The call is planted next to the defect (the
    // guard reads src/ into `sources`), so this does not depend on which
    // branch happens to call the function.
    id: "SFR-NC-EMPTY-SIGNATURE-PROOF",
    defect:
      "the blind matcher is accepted because a function recorded as name() is called by the application",
    file: FILE,
    find: "  const id = inventoryIdentifier(item.object);",
    replace:
      "  const id = item.object;\n  if (id === 'cd_access_state()' && !sources.some((s) => s.file === 'src/__sfr_planted__.ts')) {\n    sources.push({ file: 'src/__sfr_planted__.ts', body: 'supabase.rpc(cd_access_state)' });\n  }",
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
];

await runControls("schema-first-release", MUTATIONS);
