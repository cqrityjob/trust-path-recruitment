# International Passport — delivery report

## Decision

**BLOCK for hosted release.** Local implementation and required branch checks pass. The three new migrations remain pending, and the application uses their objects. `release-parity:check -- --release` correctly exits 1. The Supabase GitHub integration applies migrations when main changes; a merge therefore needs the owner's separate hosted-change approval. Nothing was pushed, merged or deployed.

The owner-approved implementation baseline is `6fbf4f61edc006bfc33749d65f7348cc7a47fd0e`. Work is on `codex/passport-finalization`. Fable recovery was waived; no unavailable Fable work was imported.

## Connections and isolation

- Supabase control plane: `wrygicdfxwjnrugduxnt`, as verified in Phase 0 and accepted by the owner.
- Local development: intentionally `http://127.0.0.1:54321`, `cqrityjob-local-staging`. `.env.local` remains byte-identical: SHA-256 `d14e60e4d818a8d32eb2a82f0c5cdd1aa3dc8d3a485c37309e818666f3610a11`.
- Repository: `cqrityjob/trust-path-recruitment`; remote `https://github.com/cqrityjob/trust-path-recruitment.git`; default branch `main`.
- Local `main` remains the approved baseline. During this task, `origin/main` advanced to `25470f4e62b7ea3f0f7f360c5f4ae818b440a2f7` through BESKT PR #254. They no longer match. No branch update was performed. Read-only three-way merge inspection reports no conflict after separating the explicit Passport pending entries from concurrent frontier bookkeeping.
- Local SQL used a task-owned PostgreSQL 16.14 cluster on `127.0.0.1:55439`. Browser tests used the local app at port 3119. Both task-owned services were stopped after validation.
- **Hosted changes: NONE. Production data changes/deletions: NONE.**

## Architecture delivered

The [pre-implementation gap matrix](international-foundation.md) records reuse and extension decisions. Existing Profile/CV writers, credential/version history, issuer registries, evidence, reviewer decisions, v1 packages, application disclosures, and the public token gateway remain.

Profile supplies current professional identity. CV retains employment, generic education, courses, memberships, languages and skills. Passport projects certifications, licences and governed occupational credentials. A canonical Profile edit or cleared title cannot revive an old Passport headline.

The wallet supports seven credential classes, original names/language, issuer attribution, distinct issuing country/jurisdiction and validity jurisdiction, explicit unknown/no-expiry semantics, detail, add, versioned correction and archive. The compact Card contains credentials and the Profile title; no employment tenure or invented recognition. Both Swedish and English are covered.

Authoritative review events and their validity constrain displayed verification. Candidates cannot promote status. Machine extraction is an immutable proposal with provenance, process/model version, fingerprint, confidence and a pending human-review state. It has no path to silently overwrite a claim or grant verification.

### New tables and relationships

| Table | Relationship / responsibility | Rows after local replay and rolled-back fixtures |
|---|---|---:|
| `sp_credential_classes` | Seven translated classes | 7 |
| `sp_credential_jurisdictions` | Country/subdivision references, explicit jurisdiction type | 11 |
| `sp_credential_definition_metadata` | Definition → class, original language/name, version and lifecycle metadata | 0 |
| `sp_credential_definition_jurisdictions` | Definition ↔ governed issuing/validity scope, with source | 0 |
| `sp_credential_adapter_mappings` | Definition → versioned external namespace/identifier | 0 |
| `sp_credential_details` | Claim 1:1 international details; ownership and scope checks | 0 |
| `sp_evidence_extractions` | Evidence → immutable extraction attempts | 0 |
| `sp_credential_disclosure_policy` | Disclosure 1:1 immutable permitted-field policy | 0 |
| `sp_credential_share_events` | Disclosure → append-only creation/access/denial/observed-expiry/revocation/change events | 0 |

All nine tables enable RLS. Ordinary users cannot write catalogue, extraction, disclosure-policy or audit rows directly. Claim metadata writes require matching ownership and an unreviewed self-reported claim. Issuer catalogue membership never verifies a holder's credential.

### Selective sharing v2

The database accepts only the holder's selected current credentials. Optional name and credential identifiers default off. Credential names, issuer, dates, jurisdiction and precise trust context remain required. Evidence documents, storage paths, CV content and internal row IDs are excluded. Evidence sharing is not enabled by this policy.

Every new Passport share, including the credential-detail entry point, goes through the v2 selection screen. Existing v1 links and APIs remain compatible. The existing secure token/session gateway checks every access. A revoked or expired package invalidates existing sessions. Reissuing through the existing RPC preserves v2 permitted fields. Idempotency keys reject conflicting requests. Changes to selected claims and metadata produce audit events. Unknown token guesses remain indistinguishable; known denied sessions produce minimal events with no secret or personal payload. Expiry is audited when observed, not represented as a scheduled job.

### Migrations and rollback

1. [20261118090000 — international foundation](../../supabase/migrations/20261118090000_sp_international_passport_foundation.sql) · [rollback](../../supabase/rollback/20261118090000_sp_international_passport_foundation_rollback.sql)
2. [20261119090000 — wallet commands](../../supabase/migrations/20261119090000_sp_international_credential_wallet.sql) · [rollback](../../supabase/rollback/20261119090000_sp_international_credential_wallet_rollback.sql)
3. [20261120090000 — selective disclosure v2](../../supabase/migrations/20261120090000_sp_credential_selective_sharing_v2.sql) · [rollback](../../supabase/rollback/20261120090000_sp_credential_selective_sharing_v2_rollback.sql)

All were created through the local Supabase CLI and ordered after the concurrent `20261117090000` BESKT slot. Rollback runs in reverse dependency order and refuses removal after international metadata or v2 packages are adopted; forward repair is then required. Full replay, rollback and reapply were exercised locally. No migration was applied hosted.

No obsolete data cleanup is required or proposed. **Expected deletion count: 0 in every production table.** The existing shared `sp_claims`, `sp_experience_periods` and `sp_evidence` structures serve CV/application workflows and were retained. Unrelated Profile, CV, jobs, employer and assessment data were not deleted or migrated.

## Exact validation results

| Check | Result |
|---|---|
| Application typecheck | PASS |
| Scripts typecheck | PASS |
| Changed-file lint | 0 errors, 0 warnings; [file list](finalization-evidence/changed-lint-files.json) |
| Domain tests | 18 passed, 0 failed |
| Passport/Profile/CV and migration/release check scripts | 42 passed, 0 failed |
| SQL security guard | PASS; 401 pinned surviving definer functions, 373 policies |
| Controlled product-boundary mutations | 18 CV-boundary + 7 composition = 25 detected; every file restored |
| Complete migration replay | 284 migrations, 0 failures |
| Database/RLS suites | 6,618 reported assertions across 118 passing summary groups, plus the runner's concurrency/negative-control proofs; exit 0 |
| New database suites | Foundation 16, wallet 12, sharing v2 27; each passed before and after rollback/reapply, 110 total |
| Retained v1 selected-sharing SQL | 122 assertions passed with v2 installed |
| Existing gateway SQL | 25 assertions passed with v2 installed |
| International browser journeys | 21 passed, 0 failed |
| Profile/CV/v1 recipient browser regressions | 84 passed, 0 failed |
| Browser total | 105 passed at desktop, 375 px and 390 px |
| Production build | PASS |
| Hosted release guard | Expected BLOCK: 3 pending migrations / 5 application dependencies |

Browser tests navigate real app routes with stubbed server-function responses and intercepted hosted calls. PostgreSQL/RLS suites use the actual local schema and functions. These are complementary tests; the browser results do not prove a deployed GoTrue/PostgREST/Storage stack or hosted behaviour. No hosted smoke test was performed.

Visual checks: [English wallet at 375 px](finalization-evidence/wallet-en-375.png) and [Swedish desktop](finalization-evidence/wallet-sv-desktop.png), captured from the passing routed tests using fictional fixtures.

### Lint comparison

| Scope | Baseline errors / warnings | Final errors / warnings |
|---|---:|---:|
| Tracked branch files | 1,117 / 74 | 1,010 / 74 |
| Historical nested worktrees | 98,253 / 395 | 98,253 / 395 |
| Entire `eslint .` command | 99,370 / 469 | 99,263 / 469 |

**107 existing errors removed, no new errors or warnings.** Comparisons use file/severity/message/rule counts, allowing line movement. Existing debt remains accepted by the owner; no unrelated lint cleanup was performed. The full command still exits 1 because of that debt. Both complete outputs and hashes are preserved in [lint evidence](finalization-evidence/lint-comparison.json).

## Commits and changed files

| Commit | Focus |
|---|---|
| `10207dc` | Ownership and canonical Profile read model |
| `b12ffb4` | International schema and adapter foundation |
| `fb47c8a` | Issuer/jurisdiction read models |
| `ae4a304` | Profile/CV/Passport boundary |
| `93afcb1` | Wallet and atomic credential editing |
| `1233e8e` | Compact Passport Card |
| `517e657` | Credential-only sharing v2 |
| `b495394` | Current review-event trust, metadata integrity, SQL harness |
| `f6eb5f1` | International browser journeys, regressions and correction navigation |
| `cfad4fc` | Concurrent frontier bookkeeping without merge/rebase |
| `1a043ea` | All new detail-page shares require v2 field consent |

The complete file inventory and commit subjects are in [delivery-manifest.json](finalization-evidence/delivery-manifest.json). [results.json](finalization-evidence/results.json) identifies the tested implementation head and evidence hashes. This report is committed separately from implementation.

## Remaining limits and next release step

- Owner approval for hosted migration execution remains required. Do not bypass the release gate or relabel pending migrations as applied.
- The newer `origin/main` has additional BESKT work. The read-only merge check is clean; combined-head CI should run before any approved merge. This report's test totals apply to the owner-approved baseline plus this branch.
- Jurisdiction reference coverage is inherited from existing governed catalogues: 11 seeded national/regional entries. More countries, subdivisions or supranational scopes require reviewed catalogue data. Schema supports expansion; global legal acceptance is never inferred.
- Issuer APIs, automated extraction execution, cryptographic issuance, W3C VC/Open Badges compliance and security-clearance data are not implemented. Stable IDs, versioned mappings and proposal boundaries support future adapters.
- Live Supabase Auth/Storage/upload transport was not exercised end-to-end. Existing database evidence/RLS suites and routed browser fixtures pass; production credentials remain isolated.

**Recommendation: BLOCK hosted merge/release pending separate owner approval and the normal combined-head release checks. Local Passport implementation is complete and validated against the authoritative baseline.**
