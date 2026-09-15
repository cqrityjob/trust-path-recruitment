# Closed catalogue — implementation and verification

## Verdict

**FIX REQUIRED.** The closed-catalogue implementation and focused real local integration pass. The complete database and browser regressions do not pass. The owner's all-green condition for push and PR creation is not satisfied. Updating all legacy regression fixtures and expectations remains unfinished; those failures are not covered by the lint-debt waiver.

Hosted changes: **NONE**. Production deletions: **NONE**. No merge, deployment, push or Passport PR creation occurred.

## Connections and combined head

| Item | Verified state |
|---|---|
| Supabase control plane | `wrygicdfxwjnrugduxnt`; owner-approved connection gate preserved |
| Local development | Intentionally local; `.env.local` unchanged |
| `.env.local` SHA-256 | `d14e60e4d818a8d32eb2a82f0c5cdd1aa3dc8d3a485c37309e818666f3610a11` |
| GitHub | `cqrityjob/trust-path-recruitment` |
| Origin | `https://github.com/cqrityjob/trust-path-recruitment.git` |
| Default branch | `main` |
| Working branch | `codex/passport-finalization` |
| `origin/main` included | `6fc986af315ff30de4909efb1a076afd39bbd069` |
| PR #255 included | **YES**; its merge `5e37060a35415880935c8525bcfb32d2d0f38bc3` is an ancestor |
| Local main matches origin/main | **NO**; local main remains the original baseline; work is on the Passport branch |
| Tested implementation head | `f1a3f6d8a3dc09aa13c3941878ff6492ea6776df` |
| Migration collisions | **NONE** across 287 active migration versions |
| Passport PR number / URL | **Not created / none** |
| CI | **Not run** for this unpublished branch; local results are not GitHub CI |

`git fetch origin` preceded merge commit `5bba305410e90d13290e053f8d9f853f56e7540e`. Both histories are preserved. No rebase, force push, squash or discarded Passport commit occurred. The additional SQL fixes changed only the unpublished fourth Passport migration and its test.

PR [#256](https://github.com/cqrityjob/trust-path-recruitment/pull/256) already belongs to “Record the hosted apply of BESKT PR 6 and PR 7, and close the schema-first gate.” It is merged and was created by another task. No replacement number was requested. The numbering decision must be resolved before any future Passport PR creation.

SUPABASE CONTROL-PLANE CONNECTION: **VERIFIED**  
LOCAL DEVELOPMENT ENVIRONMENT: **INTENTIONALLY LOCAL**  
GITHUB CONNECTION: **VERIFIED**  
SAFE TO CONTINUE WITH LOCAL CODE AND TEST WORK: **YES**  
SAFE TO APPLY HOSTED CHANGES: **NO**

## What changed

The candidate selector reads `sp_approved_credential_catalogue`, a security-invoker view over the existing governed tables. It offers International or National/regional selection, country and optional region, and search across credential names, issuer, class and territory. No match displays the owner's exact unavailable message. There is no candidate catalogue-creation or request-to-claim path.

Onboarding, add, draft-resume and credential-correction routes now use that selector. Candidates enter personal instance fields; canonical names, issuer, class, territory and scope come from the definition. Evidence uses the existing private owner upload after creation. Profile and CV content retain their separate paths. Historical custom test claims are not deleted or silently reclassified; they cannot be created or corrected through the new credential command.

A strict RPC contract and database triggers enforce the same rule against direct REST and older RPC writers. Candidate catalogue DML is revoked on all 15 governed tables. Active/effective definitions, issuers, countries, jurisdictions and markets are required. An administrator-controlled flag permits explicit no-expiry; default false. Infinite and out-of-range dates cannot bypass it. ASIS CPP, PSP and PCI reuse the existing definitions and issuer.

### Focused commits

| Commit | Change |
|---|---|
| `5bba305` | Merge current origin/main, including the separately merged #256 ledger update |
| `c4f3e6a` | Closed catalogue view, RPC, database guards, grants, migration/rollback and SQL tests |
| `f46eae2` | Approved-definition selection across candidate routes; server, browser and source-control tests |
| `e2ace2a` | Active territory and effective-date checks |
| `f1a3f6d` | Finite, bounded credential-date checks and three negative SQL tests |

[Full branch commits](closed-catalogue-evidence/commits.txt), [26 implementation/test files changed for this decision](closed-catalogue-evidence/files-changed.txt), and [complete branch file inventory before this evidence commit](closed-catalogue-evidence/branch-files-changed.txt) are retained. This report and evidence are a subsequent documentation-only commit.

## Exact validation results

| Check | Final result |
|---|---|
| Application / script typechecks | Both PASS |
| Changed-file lint | 54 files; 0 errors, 0 warnings |
| Repository lint comparison | 0 new findings; 111 fewer errors |
| Migration replay | 287/287 applied, 0 failures |
| Passport rollback/reapply | 4 rollback + 4 reapply operations PASS; 316 assertions (158 before + 158 after) |
| Closed-catalogue SQL suite | 97/97 per round; included in the 316 above |
| Complete database/RLS runner | **FAIL: 38 failing suites**; 5,169 passing assertion events reported in 87 completed blocks, including the 316 above; not a count of distinct tests |
| Passport domain tests | 18 passed, 0 failed |
| Source/release check sweep | 149 passed; 1 expected hosted release block because 4 migrations remain pending |
| Mutation controls | 30 suites; 1,064/1,064 mutations detected; files restored byte-for-byte |
| Production build | PASS |
| Real local Auth/REST/RPC/RLS/Storage/disclosure | 41 passed, 0 failed |
| Real local browser | 3 passed, 0 failed — desktop, 375 px, 390 px |
| Focused catalogue fixture browser | 36 passed, 0 failed — 15 first-run + 21 international; also pass in the complete run below |
| Complete browser | **873 passed, 206 failed, 316 skipped** — 1,395 cases; 0 flaky |
| Complete browser, desktop | 293 passed, 66 failed, 106 skipped |
| Complete browser, 375 px | 290 passed, 70 failed, 105 skipped |
| Complete browser, 390 px | 290 passed, 70 failed, 105 skipped |
| Local report-immutability / finalisation reruns | 7 + 6 assertions passed (included in the check sweep) |

The three real local browser cases are intentionally skipped in the fixture-mode full run and pass in their separate live run. The suite now has 1,395 cases versus the earlier 1,497: replacing the retired free-text first-merit wizard removed 102 obsolete cases (34 per viewport). This is a changed feature contract, not 102 additional passes.

The fixture/browser run began at `f46eae2`; later implementation commits only change SQL and SQL tests, so its application, browser-spec and fixture source bytes match the tested implementation head. Final-head typechecks, full database replay/suites, SQL security/order guards, live integration and mutation controls were repeated after the final SQL changes. The build, domain, lint and source-control sweep use the same unchanged application/script bytes. No skipped test is counted as passing.

### Lint comparison

| Scope | Baseline errors / warnings | Final errors / warnings |
|---|---:|---:|
| Repository source accepted for this task | 1,117 / 74 | **1,006 / 74** |
| Nested historical `.claude/worktrees` included by full lint | 98,253 / 395 | 98,253 / 395 |
| Literal full-command output | 99,370 / 469 | **99,259 / 469** |

**Zero new findings.** The branch removes 111 errors and adds no warnings. All 54 changed TypeScript/TSX/JavaScript files have zero lint errors and zero warnings. The accepted baseline is preserved in the earlier finalization evidence; [comparison JSON](closed-catalogue-evidence/lint-comparison.json) records baseline/final hashes and an empty new-findings list. No unrelated historical lint cleanup was performed.

## Migration and data review

Four pending migrations must follow main's already recorded history in this order:

1. `20261118100000_sp_international_passport_foundation.sql`
2. `20261119090000_sp_international_credential_wallet.sql`
3. `20261120090000_sp_credential_selective_sharing_v2.sql`
4. `20261121090000_sp_closed_credential_catalogue.sql`

The new fourth migration is transactional, depends on the preceding Passport units, and adds one catalogue flag, a read view, two guards/triggers and a replacement credential command. It revokes candidate DML rather than adding catalogue-write policies. DDL requires short table locks; production lock time and load were not benchmarked. See [closed catalogue governance and exact table inventory](closed-catalogue-governance.md). The [earlier migration review](phase-2-migration-review.md) remains the detailed object inventory for the first three; its older frontier note is superseded by the merged main and four-entry pending ledger recorded here.

Expected migration-time personal INSERT/UPDATE/DELETE counts: **0 in every table**. No cleanup is implemented or executed. The local clean replay contains 73 credential types, 14 certification definitions and five certification issuers. The projection exposes 19 approved definitions: 14 international and five Swedish. Adding the constant false no-expiry default applies to 73 local definition rows; no definition or issuer row is inserted, and no issuer relationship is rewritten. These are local replay counts, not a hosted census.

Rollback is tested in reverse order and reapply in forward order. The fourth rollback refuses once governed details have been adopted and never deletes personal rows. It restores the earlier command, which would reopen custom input; it is a local proof only. After adoption, prefer a forward fix. Hosted execution or rollback still requires separate owner approval and fresh project/ledger verification; do not deploy dependent application code before the approved schema is applied.

## Remaining work and risks

1. **38 database suites fail.** Most stop when old fixtures try to insert unapproved, custom or inactive credentials, or expect an older error precedence. Some legacy rollback cases also fail because the new dependent view has not been unwound first; later failures can cascade in continue-on-failure mode. These are not 38 proven independent product defects. Replace obsolete setup with valid governed definitions, retain each RLS/trust/disclosure assertion, update changed-contract negatives and fix dependency ordering. Do not relax the closed-catalogue guard to make fixtures pass. Exact failing suites and 5,169 reported passing assertion events are in [database-summary.json](closed-catalogue-evidence/database-summary.json); the full log is retained.
2. **Complete browser regressions remain red.** See [browser failures](closed-catalogue-evidence/browser-failures.md). Legacy workspace/add/share fixtures and assertions need reconciliation with the credential-only product and approved-catalogue reads. The full run also includes broader application failures; they are not automatically classified as pre-existing or waived. The dedicated closed-catalogue fixtures and three real local browser journeys pass.
3. **VU1, VU2 and SV are withheld.** VU1/VU2 lack governed issuer relationships; SV requires holder-written scope. An authorised catalogue review must resolve these definitions before selection. No issuer or territorial metadata was invented to fill the gap.
4. **No hosted verification or production load test was performed.** Existing v1 data remains, and full v1 regression coverage is not green. External issuer adapters, extraction execution and cryptographic issuance remain earlier foundation work rather than completed integrations.
5. **Push, PR and hosted gates remain closed.** Finish and rerun the failed combined-head checks. Resolve the occupied #256 numbering requirement. Obtain separate hosted-change approval before any hosted migration, deletion or deployment.

## Local isolation and evidence

The task used API `127.0.0.1:55421`, PostgreSQL `127.0.0.1:55422`, and a separate disposable PostgreSQL cluster on `55439`. Real Auth, REST/RPC/RLS, private Storage, Kong and the Passport Edge gateway were exercised; optional Studio/Realtime/analytics services were not needed. The clean full replay and rollback run used PostgreSQL 16; real integration used the task's Docker Supabase stack. `.env.local` stayed on the unrelated `54321` staging instance throughout.

Task services were stopped with Docker volumes preserved. The temporary mutation checkout was removed after a clean status check. The unrelated staging stack and app were preserved. Browser-generated changes to historical evidence screenshots were copied to a temporary artifact folder and restored byte-for-byte from Git; they are not part of this change.

Only reviewed result logs, sanitized JSON and test-owner selector screenshots are committed. Local credentials, JWTs, session files, certificates and storage content are excluded. [Evidence manifest](closed-catalogue-evidence/manifest.json) records artifact hashes.
