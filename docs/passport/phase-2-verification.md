# International Passport — Phase 2 combined-head verification

## Recommendation

**FIX REQUIRED.** The combined branch includes PR #255 and the real local Passport integration passes. The complete browser regression run has failures, so the owner's condition for pushing and opening the Passport PR is not satisfied. No Passport PR was created; no number was assigned. The requested title remains **PR #256 — International Security Passport Foundation** for a later all-green submission. GitHub controls the assigned number; none was reserved.

**Hosted changes: NONE. Production data changes/deletions: NONE. Merge/deploy: NONE.** No hosted Supabase project calls were made during Phase 2. Hosted release guards remain blocked, as required, and separate owner approval is still needed.

## Connection and Git record

| Item | Verified value |
|---|---|
| Repository / remote | `cqrityjob/trust-path-recruitment` · `https://github.com/cqrityjob/trust-path-recruitment.git` |
| Default branch | `main` |
| Working branch | `codex/passport-finalization` |
| PR #255 included | **YES**, merge commit is an ancestor of the combined branch |
| Exact `origin/main` after PR #255 | `5e37060a35415880935c8525bcfb32d2d0f38bc3` |
| Tested combined implementation SHA | `1d60f45906465c4f7aafd99896868167521b7159` |
| Local `main` | `6fbf4f61edc006bfc33749d65f7348cc7a47fd0e`; it does **not** match `origin/main` and was not used for implementation |
| Current migration collisions | **NONE**; 286 active versions, zero duplicate groups |
| Passport PR number / URL | **NOT CREATED / N/A** |
| CI | **Not run for this unpublished combined head**; local checks below are not GitHub CI |

`git fetch origin` and GitHub's PR #255 merged metadata verified the new baseline before synchronization. GitHub CLI is installed but unauthenticated; the repository metadata was verified through the GitHub connector instead. The merge commit `34b2117` preserves both parent histories. No rebase, force-push, squash or discarded Passport commit occurred. The exact implementation commits and full changed-file inventory are in [delivery-manifest.json](phase-2-evidence/delivery-manifest.json). This report and its evidence are committed after the tested implementation; their documentation-only commit does not change application or migration source.

Supabase control-plane project remains the owner-accepted `wrygicdfxwjnrugduxnt`. `.env.local` remains intentionally local (`http://127.0.0.1:54321`, `cqrityjob-local-staging`) and byte-identical, SHA-256 `d14e60e4d818a8d32eb2a82f0c5cdd1aa3dc8d3a485c37309e818666f3610a11`. No production link or production credentials were added. The task-owned SQL cluster, app servers, HTTPS proxy and Docker stack were stopped after verification; local data directories/volumes were preserved. The pre-existing app on 3117 and Supabase listener on 54321 remain running.

## Changes in this phase

| Commit | Change |
|---|---|
| `34b2117` | Merge PR #255 main state; move unpublished Passport foundation/rollback from colliding `20261118090000` to `20261118100000`; update ordering and frontier references |
| `42491e2` | Restore credential-filtered attention anchors; align Profile-entry negative controls; retain the explicit bilingual reviewer-pending copy invariant |
| `6436a3c` | Enforce live Auth-session validity for private Passport reads/writes and evidence; add six SQL regression assertions |
| `05855cb` | Real local Auth/Storage/disclosure API harness, three real browser journeys, development-only loopback share origin |
| `1d60f45` | Local fixture transport bindings, complete entry read models, and credential-only first-run expectations |

The existing international wallet, Profile/CV ownership, compact Card, event-based verification and selective sharing architecture are retained. No unrelated lint cleanup was performed. Generated screenshot changes from the full suite were retained as local test artifacts, then restored in the tracked tree.

## Exact validation results

See the machine-readable [results.json](phase-2-evidence/results.json) and indexed logs for the final counts. A failed or skipped check is not included as a pass.

| Check | Result |
|---|---|
| Application / script typechecks | Both PASS, exit 0 |
| Changed-file lint | 48 files; 0 errors, 0 warnings |
| Repository-wide lint | 99,259 errors / 469 warnings; expected exit 1 for accepted debt; no new findings |
| Tracked-file lint | 1,117 errors / 74 warnings at owner baseline → 1,006 / 74 final (111 fewer errors) |
| Historical nested-worktree lint | Unchanged: 98,253 errors / 395 warnings |
| Compared with Phase 1 delivery | 1,010 / 74 → 1,006 / 74 tracked; four more errors removed, no new findings |
| Check scripts | 149 PASS; 1 expected release BLOCK out of 150; external scheduled regulatory-source monitor excluded |
| SQL security guard | PASS; 422 surviving pinned definer functions, 376 parsed policies |
| Migration ordering / duplication | PASS; 286 active, 45 parked, 1 never-replay; 0 version collisions or duplicate groups |
| Clean SQL replay / database and RLS | 286 migrations; 6,765 reported assertions across 120 passing numeric summary groups; exit 0 |
| Passport SQL suites | Foundation 16 + wallet 18 + v2 sharing 27, each before and after rollback/reapply = 122 |
| Retained v1 sharing / gateway SQL | 122 selected-merit assertions + 25 gateway assertions PASS |
| Passport domain tests | 18 PASS, 0 fail |
| Negative controls | 30 suites; all 1,062 mutations detected; clean restoration |
| Production build | PASS |
| Real Docker replay | 286 applied, 0 skips, 0 failures |
| Real Passport Auth / Storage / disclosure API | 34 PASS, 0 fail |
| Real Passport browser | 3 PASS, 0 fail: desktop, 375 px, 390 px |
| Real BESKT browser | 8 preparation + 20 interview-tool = 28 PASS (desktop project; each spec also contains its own viewport checks) |
| Real employer report browser | 4 PASS, 2 fail on final configured run |
| Full browser matrix | **970 PASS, 211 fail, 316 skipped; 1497 total**, desktop / 375 px / 390 px; 0 flaky |
| Hosted release parity | Expected BLOCK: five pending migrations and five dependent application references |

The full lint outputs and signature comparisons are preserved in [lint evidence](phase-2-evidence/lint-comparison.json), with a [separate Phase 1 delivery comparison](phase-2-evidence/lint-vs-phase-1-delivery.json). Line movement does not create a false new finding: comparison uses file, rule, severity and message multiplicities.

### Real Supabase integration

A task-owned Docker stack, `cqrityjob-passport-phase2`, ran PostgreSQL 17.6.1.167, real GoTrue, PostgREST, private Storage, Kong and the Passport Edge gateway. Supabase CLI **2.117.0** was invoked temporarily; no lockfile or production linkage changed. API port **55421** and DB port **55422** isolate it from the pre-existing stack on 54321. Studio, Realtime and analytics services were not needed for these Passport checks and were excluded. The full migration history was applied with the repository's local replay script: **286 applied, zero known-failure skips, zero unexpected failures**.

The complete SQL runner separately used a task-owned PostgreSQL **16.14** cluster on **55439** and a disposable test database. It replayed the final session fix from a clean database. The real Docker database received that fix as a controlled local SQL iteration; it was not reset after its real identities and sharing fixtures were created.

The API groups contain **15 Auth/ownership/Profile-CV, 9 Storage and 10 disclosure assertions**, all passing; their non-overlapping case numbers are recorded in results.json. The [34 API assertions](phase-2-evidence/live-api-results.json) cover actual candidate/employer sessions, owner-only create/correction, cross-owner and employer denials, REST/RPC self-verification rejection, expired JWTs, revoked refresh/access sessions, canonical Profile/CV separation, private evidence upload and attachment, denied enumeration/download/path tampering, expiring signed URLs, one-credential field consent, anonymous Edge handoff, payload minimization, token tampering, immediate revocation, observed expiry and secret-free audit records. No admin/reviewer identity was required; authoritative verification decisions remain tested in the SQL/RLS suites.

The three additional real browser journeys passed at desktop, **375×812** and **390×844**. They create a credential through the UI, opt into the identifier only, open the real Edge handoff in a fresh unauthenticated context, verify minimal payload, revoke and reload, and verify Profile title propagation. Unexpected non-loopback requests are aborted and asserted absent. The recipient handoff used an ephemeral local HTTPS proxy so secure-cookie behavior was exercised. These tests substitute no server responses. The broader browser suite is fixture-based where its specs define fixtures; its default live-test skips are listed separately.

Real BESKT candidate preparation: **8/8 passed**. Real BESKT interview tool: **20/20 passed**, including the network-level independent-assessor boundary. Real employer final-report evidence: **4 passed, 2 failed** on the final configured run. Earlier missing-environment attempts are diagnostic only, not additional test counts. A separate main-baseline comparison ran three desktop career-home tests: all three failed on exact PR #255 main as well; those diagnostic counts are not included in combined-head totals. The finalized report's immutability probe then passed **7/7**, and member/owner finalization authorization passed **6/6**.

Employer-continuity live setup remains incomplete: the checked-in fixture first referenced a missing synthetic user, then refused because its required mixed finalized/assessed cases were absent. A single local prerequisite user was created; the subsequent fixture transaction rolled back. No report was fabricated or guard bypassed. Live job-application submission and all remaining opt-in live regression combinations are not claimed as verified.

### Browser failures requiring follow-up

The [complete failure inventory](phase-2-evidence/browser-failures.md) and [every test outcome](phase-2-evidence/browser-results.json) preserve the results. The international Passport fixture suite passed **21/21**, Profile navigation **18/18**, and CV flow/screens **66/66**, all across the three viewports. These are subsets of the 970 passes, not additional passes.

| Failing spec | Failed cases |
|---|---:|
| career-center-pilot.spec.ts | 2 |
| my-career-home.spec.ts | 20 |
| my-career-hub-screens.spec.ts | 9 |
| passport-first-run.spec.ts | 18 |
| passport-sharing.spec.ts | 27 |
| passport-three-market.spec.ts | 12 |
| passport-workspace.spec.ts | 111 |
| public-homepage.spec.ts | 12 |

Known categories include:

- Older Passport workspace, sharing and market tests still assert retired full-career widgets, employment selection or former API shapes. Those assertions must be reconciled with the owner-approved credential-only product while retaining their accessibility, retry and negative coverage.
- Career-home screenshots exceed their height expectation, and the desktop accessibility check finds three unlabelled sections. A narrow comparison against exact PR #255 main reproduced all three failures (Swedish/English height and desktop accessibility) using the same fixture harness. Other control-size and invitation-update failures were not baseline-classified. The owner’s lint-debt waiver does not waive these browser failures.
- The live employer correction scenario attempts to finalize after new material while another assessment predates it. The database correctly returns `SCP_IV_REPORT_BLOCKED / ASSESSMENT_PREDATES_MATERIAL`; the dependent version-2 read then fails. The fixture/walk needs a valid governed reassessment sequence.
- Public mobile navigation and two Career Center cases also timed out; these were not proven to be pre-existing and require investigation.
- Some opt-in live employer/application coverage requires additional valid fixture setup and reruns at all requested sizes. Default skipped tests are not evidence of correctness.

The accepted lint-debt decision applies to lint only; it does not waive these browser failures. No PR was opened despite the passing Passport live integration.

## Migration and data safety

Three pending Passport migrations, in order: **20261118100000 → 20261119090000 → 20261120090000**. The merged BESKT **20261117090000** and **20261118090000** precede them. The release ledger lists five pending migrations; this is repository evidence, not a fresh claim that hosted state was queried in this phase.

The [migration safety review](phase-2-migration-review.md) gives every table, function, trigger/policy/grant group, transaction boundary, lock risk, data effect, dependency and rollback behavior, plus a future execution checklist. [Post-apply SQL](phase-2-evidence/post-apply-verification.sql) was run read-only against the local stack. All nine new tables have RLS, all nine restrictive session policies are present, private builders are inaccessible to ordinary roles, and `passport-evidence` is private.

No obsolete-data cleanup is proposed or required. **Expected production deletion count: zero in every table.** Local fixture rows are synthetic by construction and remain separate from hosted data. No Profile, CV, job, employer or assessment data was deleted in production.

## Remaining risks and next gate

The complete browser suite must be repaired and rerun without weakening assertions. Finish the missing live regression fixture combinations and repeat the combined-head checks after any fixes. Only after those gates pass may this branch be pushed and the requested PR created; stop and report if GitHub assigns a number other than #256. Do not merge it.

Hosted migration/deployment remains separately blocked. New session checks add database work on private operations; production-scale latency and DDL lock durations were not measured. Catalogue coverage remains the existing governed 11 national/regional entries. External issuer adapters, machine-extraction execution and cryptographic credential issuance remain foundations rather than completed integrations. No hosted smoke test was performed.
