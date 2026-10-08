/**
 * Negative controls for employer-portal-evidence:check.
 *
 * Each mutation re-introduces one way the committed before/after pair can
 * mislead; the guard must fail with the expected diagnostic, or the control
 * fails. See ./runner.ts for the harness and its restoration proof.
 */
import { runControls, type Mutation } from "./runner";

const G = "employer-portal-evidence:check";
const AFTER_MANIFEST = "artifacts/employer-portal-ux/after/manifest.json";
const AFTER_SOURCE = "artifacts/employer-portal-ux/after/SOURCE.txt";
const BEFORE_MANIFEST = "artifacts/employer-portal-ux/before/manifest.json";

const MUTATIONS: Mutation[] = [
  {
    id: "EPE-MANIFEST-NAMES-A-FILE-THAT-IS-NOT-THERE",
    defect: "the manifest lists a shot whose file never landed (a failed download, half-committed)",
    file: AFTER_MANIFEST,
    find: '"file": "after-reports-en-375.png"',
    replace: '"file": "after-reports-en-375-lost.png"',
    guard: G,
    expect: "the set is incomplete",
  },
  {
    id: "EPE-SOURCE-SAYS-THE-WRONG-MODE",
    defect:
      "the after-set's SOURCE.txt describes a before photograph (sets swapped or copied over)",
    file: AFTER_SOURCE,
    find: "mode: after",
    replace: "mode: before",
    guard: G,
    expect: 'says mode "before", expected "after"',
  },
  {
    id: "EPE-BEFORE-MANIFEST-IS-NOT-JSON",
    defect: "the before manifest was truncated mid-write and no longer parses",
    file: BEFORE_MANIFEST,
    find: '"capturedFrom": "http://localhost:3100",',
    replace: '"capturedFrom": "http://localhost:3100"',
    guard: G,
    expect: "manifest.json is not JSON",
  },
];

runControls("employer-portal-evidence", MUTATIONS);
