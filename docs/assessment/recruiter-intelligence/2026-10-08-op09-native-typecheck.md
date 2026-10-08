# OP09 native CI: strict module declaration correction

Reviewed base: `a037191087620fed975fade51e5585a9b604b0bd` (#461). This change supplies declarations for four test-only MJS helpers and validates the private browser-fixture JSON fields before use. It changes no MJS implementation, product source, schema, generated types, compiler configuration, workflow, app pin (`cce2c8a238522d51396b52697d25bc9d54a8a8bd`) or schema pin (`9c8b8159ce5f350c6ace074c917823599d19ce99`). The existing four browser scenarios and 41 Playwright assertions are preserved; the reloaded fault is still read afresh and checked as exactly one injection.

## Preserved original failure

The reported mandatory CI was run `37774303409`, verify job `113301680482`. The native44/4 result is separate from this compiler failure and is not reclassified by local checks. The exact base reproduced the following failure through **the full repository command** `bun run scripts:typecheck` (exit 2):

- TS7016: `scripts/passport-native-op09-browser.config.ts:3` and `scripts/passport-native-op09.test.ts:21` lack `passport-native-op09-contract.mjs` declarations.
- TS7016: `scripts/passport-native-op09.test.ts:22`, `:23`, `:24` lack command, fault-preload and public MJS declarations respectively.
- TS7006: `scripts/passport-native-op09.test.ts:285` and `:347` callback parameter `s` is implicitly untyped as a consequence of the missing contract.

Standalone `allowJs` checking did not prove this strict repository import boundary. Strict and `noImplicitAny` behavior remain unchanged. No wildcard module declaration, explicit `any`, type cast or generated-file edit is used.

## Performed checks

- Full `bun run scripts:typecheck`: exit 0, including the new compile-only negative contracts; their function is never invoked.
- Existing native guards: 13 pass. Existing `sp-evidence-upload-recovery-ci.test.ts` source/schema controls: 25 pass. These 38 checks do not execute a database, Auth or Storage service.
- Existing `interview-evidence-reliability:check`: 130 pass / 0 fail for this base's own source and guard.
- Workflow-equivalent standalone native test/config/browser type command: exit 0.
- Repository lint on the changed TS/browser files: exit 0. Equivalent existing TypeScript lint configuration, narrowed only in a temporary config to `.d.mts`, checks all four declarations: exit 0. Repository ESLint otherwise does not select `.mts`; its configuration was not changed.
- All changed declaration/TS/browser files pass Prettier checking and `git diff --check`.
- Static export comparison: all 22 contract exports and one export each for command/fault/public match their implementations; literal pins and constants match. AST comparison preserves all 41 original browser assertions.

Private JSON parsing intentionally returns `unknown`. Test fixture checks require status strings, C1 identity/login strings, an array of prior journey records and the existing fault fields. Failures use fixed codes rather than echoing private values. Existing target checks and the expected fault assertions still enforce their actual values.

These are local static/stub/compiler checks. They do not replace the already recorded native run, create a new native PASS, or authorize application/schema release. Exact integrated-head CI remains necessary.
