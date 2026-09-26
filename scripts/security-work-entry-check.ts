import assert from "node:assert/strict";
import {
  entryWorkspace,
  rememberedWorkspace,
  rememberWorkspace,
  workspacePreferenceKey,
} from "../src/lib/security-work/workspace-preference";

const a = { id: "workspace-a" },
  b = { id: "workspace-b" };
assert.equal(entryWorkspace([], a.id), null, "Revoked last workspace is never an access grant");
assert.equal(entryWorkspace([a], b.id), a.id, "The single accessible workspace wins");
assert.equal(entryWorkspace([a, b], b.id), b.id, "Use an accessible remembered workspace");
assert.equal(entryWorkspace([a, b], "revoked"), null, "Invalid preference shows choice");
assert.equal(entryWorkspace([a, b], null), null, "No preference shows choice");
assert.equal(
  entryWorkspace([a, b], "https://example.test"),
  null,
  "Preference cannot supply a URL",
);
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  },
});
rememberWorkspace("user-a", a.id);
rememberWorkspace("user-b", b.id);
assert.notEqual(workspacePreferenceKey("user-a"), workspacePreferenceKey("user-b"));
assert.equal(rememberedWorkspace("user-a"), a.id);
assert.equal(rememberedWorkspace("user-b"), b.id);
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  get() {
    throw new Error("blocked storage");
  },
});
assert.equal(rememberedWorkspace("user-a"), null);
assert.doesNotThrow(() => rememberWorkspace("user-a", a.id));
console.log(
  "PASS: 11 workspace navigation and blocked-storage checks. Preference is never authorization.",
);
