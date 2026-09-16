# International Security Passport — recovered final verification

All required local gates passed. The default browser command produced **1,179 passes, zero failures and 258 gated skips**. Each skipped case is matched by file, project and test title to a successful isolated live execution in browser-summary.json: **1,437 unique passes, zero failures and zero remaining skips**. No skipped case is counted as passing without execution. The original 316 skips remain classified in ../regression-migration-evidence/browser-skip-inventory.json: 258 required live cases and 58 obsolete cases replaced by executed regressions.

The complete database runner passed all suites, replayed 288 migrations and verified rollback/reapply. Passport suites passed 320 assertions before/after rollback; the additional authenticated CV repair passed 38. All 1,064 mutations were detected in an isolated exact source copy with byte-for-byte restoration. Real Auth/Storage/API: 41 passed; real Passport sharing/revocation browsers: 3 passed. Typechecks, production build and changed-file lint passed; repository lint introduced zero findings.

## Recovery and repairs

The required branch was recovered at c2eb0b0 with 11 commits after aa092fb, two unstaged evidence edits, no staged/untracked repository files, and one preserved unrelated stash. Full commit hashes are in recovery.json. Fetched main remains 6fc986af315ff30de4909efb1a076afd39bbd069 and is already an ancestor; no history was rewritten.

Recovery verification repaired initial client-only hydration, made URL-only compatibility redirects resolve before hydration, and replaced the employer test's ambiguous first-row mutation with an exact synthetic vacancy receipt. The last amendment changes only test fixtures, CI registration and documentation; application and database sources match 623dfd4. The complete fixture run and all separately gated live cases collectively exercise that source, including the amended receipt test. Fifteen new hydration/redirect regressions and nine repeated throttled zoom cases passed.

## Release boundary

149 of 150 deterministic checks pass. schema-first-release:check correctly remains blocked because all four Passport migrations and the dependent CV repair are pending hosted approval. This is a deployment/merge gate, not an unexplained local regression. It was not weakened or marked applied. The PR must not be merged or deployed while that gate is closed.

Hosted changes: **NONE**. Production changes/deletions: **NONE**. All real write tests used the isolated loopback stack. No private environment file, session token or service credential is included. Reproduction settings and migration order are in ../regression-migration-evidence/README.md.

The final evidence commit changes no application/schema source. Its SHA and GitHub CI result are reported with the PR.
