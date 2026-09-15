# Passport Phase 2 — migration safety review

This review supersedes the migration filenames and combined-head caveats in the historical Phase 1 report. **No hosted migration or data change was executed.** The files below are all pending. No Passport test-data cleanup is proposed: expected production deletions are **0 rows in every table**, including Passport, Profile, CV, jobs, employers and assessments. Hosted row counts were not re-read; local fixture counts are not production counts.

**Late frontier note:** after this verification, final inspection found main at `6fc986af315ff30de4909efb1a076afd39bbd069` (separate PR #256). That PR records the two earlier BESKT migrations as already applied. This branch still has the tested pre-#256 ledger. Reconcile the fresh ledger first; never replay an already applied hosted migration. The sequence below describes dependencies, not permission to replay production history.

## Required order

Apply only after separate owner approval and release preparation:

1. All earlier canonical migrations, including main's `20261117090000_bcp_conduct_prompts_and_report.sql` and `20261118090000_beskt_governed_content_authoring.sql`.
2. `20261118100000_sp_international_passport_foundation.sql`.
3. `20261119090000_sp_international_credential_wallet.sql`.
4. `20261120090000_sp_credential_selective_sharing_v2.sql`.
5. Deploy the dependent application only after schema verification. Preserve the existing Passport share Edge gateway and its approved environment bindings.

PR #255 used version `20261118090000`, which collided with the previously unpublished Passport foundation. The Passport migration and its paired rollback were moved to `20261118100000`; the merged BESKT migration is unchanged. The previous Passport commits remain in history. No applied migration was edited, rebased or replaced.

## Foundation — 20261118100000

**Purpose:** add international credential metadata and future adapter/extraction boundaries without migrating existing personal data.

**New tables and columns:** the migration's seven CREATE TABLE declarations are the authoritative column inventory:

| Table | Main columns / relationship |
|---|---|
| `sp_credential_classes` | `code`, Swedish/English names; seven seeded classes |
| `sp_credential_jurisdictions` | `code`, type, country/subdivision, original and translated names, source, active flag; copies existing governed jurisdiction references |
| `sp_credential_definition_metadata` | credential code, class, original name/language, description, schema version, external revision, deprecation/creation timestamps |
| `sp_credential_definition_jurisdictions` | credential and jurisdiction codes, issuing/validity relation, source URL, review date |
| `sp_credential_adapter_mappings` | UUID, credential code, namespace/version, external identifier, JSON mapping, creation timestamp |
| `sp_credential_details` | claim ID, class, language, distinct issuing country/jurisdiction and validity jurisdiction, explicit no-expiry, schema version, timestamps |
| `sp_evidence_extractions` | evidence ID, process/model version, fingerprint/source, document language/country, sensitivity/retention, status/confidence, proposed fields, pending human review, creation timestamp |

No columns are added to existing business tables. Functions: `sp_is_passport_credential`, `sp_guard_credential_details`, `sp_extractions_append_only`, `sp_guard_credential_expiry`. Three triggers enforce claim/detail consistency and append-only extraction proposals. Six policies expose permitted catalogue reads and owner-scoped details. All seven tables enable RLS; all default grants are revoked. Authenticated/service roles receive catalogue SELECT; authenticated receives details SELECT/INSERT/UPDATE; service role alone receives extraction SELECT/INSERT. Trigger functions have no ordinary-role EXECUTE grant.

**Transaction and locks:** explicit BEGIN/COMMIT. New tables and indexes do not rebuild existing data. Foreign keys lock referenced catalogue/claim/evidence relations briefly; trigger creation on `sp_claims` requires a table lock and can wait behind writers. Avoid a busy write window and use deployment lock/statement timeouts. There is no production lock-duration measurement.

**Data effect:** seven class rows and the current governed jurisdiction references (11 in clean local replay); all five other new tables start empty. Zero existing personal rows are backfilled, changed or deleted.

**Independence:** can follow the existing canonical Passport schema without the later wallet/v2 migrations; not standalone on an empty database. **Rollback:** reverse-order script refuses if metadata, mappings or extraction tables have been adopted. It drops only new empty tables/catalogue seeds and functions/triggers; no CASCADE. Adopted data requires forward repair.

## Wallet and live-session enforcement — 20261119090000

**Purpose:** atomic owner-only create/correction of claim plus international details; reject revoked GoTrue access sessions at private Passport boundaries.

No new tables or columns. Functions: `sp_save_international_credential(jsonb)`, `sp_passport_session_active()`, `sp_passport_session_write_guard()`. The command grants authenticated EXECUTE only, validates every accepted field, and uses existing claim/version functions. No candidate can set a verification decision. The session helper checks the signed JWT's session ID, user ID and `auth.sessions.not_after`; it does not use editable user metadata. SQL/admin operations without an Auth JWT retain existing ownership checks.

Adds **nine restrictive policies**: credential rows in shared `sp_claims`; seven private tables (`sp_passport_profiles`, `sp_credential_details`, `sp_evidence`, `sp_verification_requests`, `sp_verification_decisions`, `sp_disclosures`, `sp_disclosure_items`); and `storage.objects` only for bucket `passport-evidence`. Adds **eight write triggers** on those public tables. CV-only claims are exempt from the shared-claim trigger/policy. Existing permissive policies and tenant/owner checks remain necessary; restrictive policies cannot grant additional access. Session helper EXECUTE is authenticated-only; its trigger function is not directly callable by ordinary roles.

**Transaction and locks:** explicit BEGIN/COMMIT; policy/trigger DDL locks the named tables briefly and may wait for active writes. Each sensitive request also reads the user's live Auth session. This adds query overhead; production-scale latency was not benchmarked.

**Data effect:** zero migration-time personal writes/deletions. At runtime creation and correction write only the owner's credential/version and metadata through existing audit paths. **Independence:** requires the foundation and Supabase Auth schema. **Rollback:** after v2 rollback, removes commands, restrictive policies and triggers while preserving claims/details. This also removes strict Passport logout enforcement; choose forward repair if that would weaken an active deployment's security contract.

## Selective disclosure v2 — 20261120090000

**Purpose:** credential-only field consent using the retained v1 token/session gateway.

New tables: `sp_credential_disclosure_policy` (`disclosure_id`, permitted fields, schema version, creation time) and append-only `sp_credential_share_events` (`id`, disclosure ID, event type, occurrence time). Both enable RLS and have owner-read policies via the parent disclosure. Default grants are revoked; authenticated receives SELECT only. Candidate clients cannot write consent or audit rows directly.

Functions: selection assertion, v2 payload builder, preview and create commands; wrappers for `sp_disclosure_payload` and `sp_replace_selected_disclosure`; `sp_audit_credential_share`; replacement `sp_get_disclosure_session`. Original payload/replacement functions are renamed with `_v1` suffix and kept inaccessible directly. Only authenticated preview/create/replacement commands are exposed; the session reader remains service-role-only. Five triggers enforce immutable policy/events and audit disclosure/claim/detail changes. No existing columns are added or removed.

**Transaction and locks:** explicit BEGIN/COMMIT. Function renames and wrappers become visible atomically. Trigger DDL locks disclosures, claims and details briefly. Runtime issuance uses ordered claim locks and a per-owner/request advisory lock for idempotency; access locks its session/disclosure and writes minimal audit events. Audit volume and lock contention need observation in a later approved deployment.

**Data effect:** both new tables start empty. Existing v1 packages retain their path. New v2 payloads contain selected credentials only, with optional name/identifier consent; no CV, raw evidence, storage paths or internal claim IDs. No migration-time personal writes/deletions. **Independence:** requires both earlier Passport migrations and the canonical sharing gateway schema. **Rollback:** refuses if any v2 policy row exists, restores v1 gateway functions, and removes new empty objects without CASCADE. Once a v2 share exists, use forward repair.

## Verification and future execution checklist

The complete local SQL runner replayed 286 migrations and exercised all three rollback/reapply scripts, data-safety refusal controls, RLS and sharing regressions. The real local Docker stack separately replayed 286 migrations with zero skips/failures; the session fix was iterated there through local SQL, then validated by a fresh full SQL-runner replay. It was not replayed over hosted production.

Before any later production execution:

- Obtain the owner's separate hosted-change approval, verify exact project and hosted ledger, and preserve a recoverable backup.
- Recheck all pending migrations, including newer main migrations; verify no version collision and required dependencies.
- Plan a write window with bounded lock/statement timeouts. Apply in canonical order, each file transactionally; stop on the first failure.
- Run [read-only post-apply queries](phase-2-evidence/post-apply-verification.sql), confirm nine new tables have RLS, private bucket status, command grants, and the nine restrictive session policies.
- Perform an approved smoke test with controlled identities and audit capture; never include tokens or evidence contents in logs.
- Update the release ledger only from confirmed applied evidence, then rerun release guards before dependent deployment.
- If adoption has occurred, use forward repair. Do not bypass the rollback refusal or delete consent/audit data to make rollback succeed.

This checklist documents a future release; it grants no execution authority.
