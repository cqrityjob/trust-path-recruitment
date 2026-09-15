> Superseded by owner decision: Fable recovery is waived. Commit 6fbf4f61edc006bfc33749d65f7348cc7a47fd0e is the authoritative baseline. Continue on codex/passport-finalization; hosted changes remain unauthorized. The historical recovery findings below are retained for audit.

# Passport finalization — Phase 0 recovery

Date: 2026-09-15. Recovery verdict: **BLOCKED — missing original Fable artifact and execution log**.

## Authorized environment

- Repository: cqrityjob/trust-path-recruitment.
- Branch created: codex/passport-finalization, from verified main at 6fbf4f61edc006bfc33749d65f7348cc7a47fd0e.
- Local main, origin/main and GitHub's live main matched at verification.
- Hosted Supabase control plane: wrygicdfxwjnrugduxnt, CQrityjob Production. Read-only access only.
- Local development intentionally uses http://127.0.0.1:54321 and cqrityjob-local-staging. The owner explicitly approved this separation; no production link is required.
- No merge, push, deployment, hosted migration or hosted data changes are authorized by this work.

## Recovered plan

The handoff was recovered from the task “Slutgranskning och lanseringsplan” (6aa8def2-729c-83eb-830e-30399ab319d8). Its five implementation units are:

1. Product ownership and v2 read models.
2. Profile and CV separation.
3. Credential wallet and credential add flow.
4. Compact Passport Card.
5. Credential-only sharing v2 and tests.

The handoff describes a CLI-created migration moved to the next canonical slot, four hosted SQL calls and a passing local baseline. Those statements describe the prior environment; they are not evidence that those artifacts or results exist in this checkout.

## Recovery evidence

- Primary working tree was clean before branch creation; no unfinished migration or implementation was present.
- Inspected every one of the 13 registered worktrees. None contains the described unfinished Passport migration.
- Searched 128 local/remote-tracking refs with Passport/Fable names for migration filenames indicating finalization, ownership, wallet, credential-only or sharing v2. No matching file was found. This cannot recover uncommitted work from another machine or cloud environment.
- The only stash is 466e032eececceb1fd477c9d134c696bb9e4b7c0, dated 2026-08-15: “pre-sync-audit working tree snapshot”. Its tracked diff changes only src/i18n/dictionaries.ts (91 insertions, 70 deletions); there is no untracked-files parent. It was not applied or removed.
- Unrelated unfinished changes remain in four registered Claude worktrees (assessment CI, authentication pages, Profile editing, and an older assessment migration). All were left intact.
- No matching original execution log was found in available tasks or the repository's local Claude session records.
- Fable's migration filename, contents, local application status and hosted application status remain unknown. The hosted ledger previously read from the expected project contains 281 entries, latest version 20261116090000; that aggregate does not prove the history of an unidentified file.
- The four historical Execute SQL calls cannot be certified read-only without their original arguments/logs.

## Preserved file fingerprints

All three tracked package files are byte-identical to main:

| File | SHA-256 |
| --- | --- |
| package.json | 88e91ad9925b110a51bd9d076e47a99c585fa5d24cc1cceb0fae1bbe0105ffeb |
| bun.lock | c0fc827bc5858d98649e490e937462fd516d0a75053b3dc95c99fe4d8dc9007b |
| package-lock.json | 55be27d7de966a614706e532fa93c9fbba3cb0d8cfa6304b5d1de6400af82262 |
| .env.local (local, ignored) | d14e60e4d818a8d32eb2a82f0c5cdd1aa3dc8d3a485c37309e818666f3610a11 |

This proves the state of this checkout against main, not byte-for-byte restoration in Fable's unavailable environment.

## Tooling correction

The initial connection check found no Supabase CLI on PATH. Recovery located /opt/homebrew/bin/supabase (2.111.0) and PostgreSQL 16.14 under /opt/homebrew/opt/postgresql@16/bin. Neither existing local port 5432 nor 54322 answered. A separate disposable cluster was created under /private/tmp/passport-finalization-pg-20260915, listening only on 127.0.0.1:55439 for baseline tests. No application environment binding was changed.

## Baseline validation

Results below concern the unchanged main application, not completion of the five implementation units.

- Application TypeScript: node_modules/.bin/tsc --noEmit — PASS, exit 0.
- Migration safety: PASS; 281 active, 45 parked, 1 never-replay, 0 approved duplicates.
- Migration duplicate guard: PASS; 0 active version collisions, 0 active duplicate groups.
- Release frontier: PASS; no active migration pending according to repository evidence.
- Schema-first release guard: PASS.
- Release parity: PASS; 281 canonical migrations, 43 at frontier, 0 unapplied, 0 unverified according to repository evidence.

- Scripts TypeScript: bun run scripts:typecheck — PASS, exit 0.
- Full local database replay/test script: PASS, exit 0. All 281 active migrations replayed; the log contains 110 counted assertion-suite result lines totaling 6,465 passing assertions, plus separately reported race/negative-control checks. This total is the sum of the explicit “N … assertions passed” lines, not an invented count for unnumbered shell checks. Passport, v1 selected sharing, Profile, CV, application and rollback/reapply suites ran within this script.
- Database log: /private/tmp/passport-finalization-db-test.log.
- Full lint: FAIL, exit 1; 99,370 errors and 469 warnings. This command also traverses nested historical worktrees. Parsed breakdown: {"tracked":{"files":171,"errors":1117,"warnings":74},"nestedWorktrees":{"files":1264,"errors":98253,"warnings":395},"other":{"files":0,"errors":0,"warnings":0}}. No lint fixes were applied. Log: /private/tmp/passport-finalization-lint.log.
- Production build and browser E2E have not been run during recovery. The five-unit implementation has not begun, so no final implementation validation is claimed.

## Next required input

Locate Fable's original task, branch, folder or exported patch and tool log. Inspect and preserve its migration before selecting a migration version or implementing the five units. If that environment cannot be recovered, an explicit owner decision to proceed without it is needed to change the “recover first” requirement.

No cleanup has been designed or executed. Any later cleanup requires identification of test records, exact table/row counts, a controlled auditable operation and separate owner approval before hosted execution. No Profile, CV, job, employer or assessment data was touched.

## Final recovery disposition

Recommendation: **BLOCK**. No implementation commits were created. The only new repository file is this recovery record. Hosted changes: NONE. Production data changes: NONE. v1 shares affected: ZERO. Local staging bindings are byte-for-byte unchanged. The disposable baseline PostgreSQL cluster was stopped after testing; its data and logs remain under /private/tmp for inspection.
