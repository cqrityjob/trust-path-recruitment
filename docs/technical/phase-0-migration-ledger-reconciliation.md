# Phase 0: migration ledger reconciliation

Status: **repository repair prepared; no production write performed**

Starting point: `origin/main` at
`9ca37ef3e407eea74fdc65e45c2d506cede8ddc3`.

Scope is deliberately limited to the migration ledger. This change does not
alter Employer product behaviour, Career Discovery scoring or product logic,
Security Passport behaviour, application routes, or Lovable deployment state.

## Root cause

Lovable committed nine generated migration files after the canonical authored
migrations had already entered the repository. Each generated file is one byte
shorter than its canonical counterpart because it lacks the final newline.
After trailing whitespace is removed, every pair is byte-identical (matching
SHA-256); there is no independent change in any generated copy.

The generated timestamps split the canonical dependency chain. Some statements
are replay-safe when repeated, but the chain as a whole is not:

- `assessment_assignments_person_context_agrees` is an unguarded
  `ADD CONSTRAINT`, so its second execution stops an empty-database replay;
- the governed assignment copies interleave the seven- and eight-argument
  versions of `scp_employer_assign`, creating an unsafe period in which an old
  ungoverned overload can remain callable;
- the Supabase migration ledger keys migrations by numeric version, not by Git
  blob or semantic content, so Git and hosted history cannot truthfully
  represent both paths as one migration chain.

## Exact duplicate map

“Exact” below means normalized byte-identical: raw blobs differ only by the
canonical file's single final newline.

| Generated UUID migration | Canonical migration | Normalized SHA-256 | Primary objects / effects | Order and replay safety |
| --- | --- | --- | --- | --- |
| `20260818162445_1f637f02-31a9-489e-95fe-666d4ec71fcb.sql` | `20260818090000_scp_closed_test_governance.sql` | `972ec84059574398f0ed67892d3e90f39753f995ae6f4fa10b926d670186df73` | `scp_governance_mode`; `scp_test_grants` plus three CHECK constraints, live-grant unique index and RLS; `scp_has_test_grant`; `scp_grant_permits_assignment`; four attempt-lineage columns; immutable-lineage trigger | Canonical runs first, UUID copy later the same day. Much is guarded or replaced, but duplicate DDL/data and ledger lineage are unsafe as a maintained path. |
| `20260818162604_459311a8-dd21-44ef-a74e-11a6aaead401.sql` | `20260818100000_cd_ranking_guard_per_match.sql` | `db96da9087e8ed0074eccf0fb090b534bfe11f01e98e02b0c5a51e44f1c38a47` | Replaces `cd_v31_complete_session(uuid,jsonb,text,timestamptz)` with per-match ranking eligibility guard | Canonical first, UUID copy later. `CREATE OR REPLACE` is replayable, but duplicate function history is not canonical or auditable. |
| `20260818162658_6aa411a0-446d-4ab2-8e43-c873275d8071.sql` | `20260819090000_employer_people_model.sql` | `99403d73c82d5948187c63add1c1e5015a68f02b43b4a65a1a620aaea3e542de` | `assessment_assignments_person_context_agrees`; participant read model; assignment/person-context validation | UUID copy runs before canonical. **Unsafe:** the second unguarded `ADD CONSTRAINT` is the observed clean-replay failure. |
| `20260818162902_4139b143-6663-47c3-b10c-ce720030e86d.sql` | `20260819100000_scp_governed_assignment.sql` | `ed64193e2d650600a81ec4888e40a97d04ee4adeba7389aa7dd2cfd5a922a3b5` | Drops five-argument assign; creates governed seven-argument `scp_employer_assign`; replaces grant decision; replaces row-level assignment guard | UUID copy runs before canonical and around later purpose migration. **Unsafe:** signature churn can leave or recreate a callable ungoverned overload and makes the contract history ambiguous. |
| `20260818163030_0bfaf1c1-9b6e-4aae-ae04-990cb7043014.sql` | `20260819110000_sg_sjt_option_labels.sql` | `9ae01003aadce63b833bb0b95d072508e9dc09a846ba3ec790042c2dbe77fcd0` | Inserts 24 SV/EN participant-facing labels for 12 SJT options, with parity and content guards | UUID copy before canonical; `ON CONFLICT DO NOTHING` makes rows replayable, but duplicate content authorship and ordering remain unsafe ledger practice. |
| `20260818163151_688d27e3-6436-4080-bd85-7c74ac541710.sql` | `20260819120000_scp_safety_critical_requires_review.sql` | `cc4c9f6753d35d97e00d090d111a4f8334dacb17716b37e0bb75f1d406b6641d` | Replaces submit and human-review functions; requires reviewer-provided safety severity before evidence is written | UUID copy before canonical. Function replacement is replayable, but duplicated security logic and dependency order are not a safe canonical path. |
| `20260818163313_c96ad26f-d1d0-4fd9-bf7b-0e2964bd18fa.sql` | `20260819130000_scp_library_reflects_governance.sql` | `b58aca1d76761000909a89744976d8d770087f4e72cae57e19cb06158c5b600a` | Drops/recreates `scp_employer_library(uuid)` with `assignable` and governance basis | UUID copy before canonical. Replayable replacement, but duplicate ledger entry is incoherent. |
| `20260818163436_9f2508ef-79a9-40e4-be09-7db8ef46724a.sql` | `20260819140000_scp_reviewer_workspace_context.sql` | `110961b7c800231ec4c65465db3a12ce9ca6d66e45bfc07f35c258660b25182a` | Drops/recreates `scp_review_queue(text)` with participant, organisation, purpose, scenario, prompt, answer labels and severity requirement; no scoring key | UUID copy before canonical. Replayable replacement, but duplicate security-sensitive projection history is incoherent. |
| `20260818163648_3772d633-c49c-4a4b-a4c8-53cbbb6a3df5.sql` | `20260820090000_scp_governed_purpose_selection.sql` | `92744bba4ab66f4e3335bf05d9175f5a40e7e222b916701c9f05a1ddf4fc93fa` | `scp_required_purpose_code`; replaces seven-argument assign with governed eight-argument contract; replaces reassessment and immutable-lineage guards | UUID copy runs before both canonical governed-assignment migrations. **Unsafe:** it creates the eight-argument contract before the canonical seven-argument migration can recreate a stale overload; the later canonical purpose migration must clean it up again. |

## Hosted production reality (read-only)

Project reference inspected: `mlvzmiutmyyqeuvjglco`. The checks below were
read-only. No migration, DDL, DML, repair command, merge, or deployment was
executed.

### Ledger

- Hosted ledger contains **172** versions.
- None of the nine UUID versions is recorded.
- All nine canonical versions are recorded with their canonical names.
- `20260818090000` is `scp_closed_test_governance`.
- `20260818090001` is `sp_phase10_self_review_and_decision_events`.
- After repository repair, Git contains **173 unique versions** with no name
  mismatch against hosted production.
- The only local-not-hosted version is
  `20260818120000_sp_phase11_languages_and_practical_skills`.
- Hosted contains no version absent from repaired Git.

Consequently, removing the nine UUID files requires **no hosted migration
history repair**. They were never applied or recorded. Renaming the Passport
Phase 10 file from `20260818090000` to its already-hosted version
`20260818090001` also requires no history repair.

### Assignment and governance schema

Hosted production has exactly one `public.scp_employer_assign`:

`(uuid, uuid, text, timestamptz, text, text, uuid, text)`

It is `SECURITY DEFINER`; anonymous execution is denied; authenticated and
service-role execution are available. Its definition MD5 is
`24022f89021602dcf5ea63b43065297a`.

The following material governance objects are present:

- `assessment_assignments_person_context_agrees`;
- `scp_assignments_one_open_per_subject_idx`;
- `scp_test_grants_live_uq` and the RLS-enabled `scp_test_grants` table;
- `scp_review_queue(text)`;
- `scp_employer_library(uuid)`;
- `scp_required_purpose_code(text,text)`;
- `scp_grant_permits_assignment(uuid,uuid,text,text,boolean)`;
- attempt lineage columns `governance_mode`,
  `validation_status_at_assignment`, `content_status_at_assignment`,
  `test_grant_id`, and `purpose_version_id`.

`scp_compute_maturity` is not executable by `anon` or `authenticated`.
There are currently zero hosted test-grant rows; that is data state, not a
missing schema object.

### Passport Phase 11 difference

Passport Phase 11 is present in Git but **not applied to hosted production**.
The hosted ledger lacks `20260818120000`, and the following Phase 11 objects are
absent: `sp_skill_types`, `sp_claims_skill_rules()`, and the `sp_claims`
columns `skill_code` and `skill_level`.

This is the sole migration-ledger difference after the repository correction.
It is not repaired in Phase 0 because that would be a production product-schema
change and requires explicit owner review after clean replay and schema
comparison.

## Repository repair

1. Delete only the nine generated UUID migrations that production never
   recorded and whose canonical equivalents remain.
2. Rename the Phase 10 Passport migration to
   `20260818090001_sp_phase10_self_review_and_decision_events.sql`, matching
   its existing hosted ledger version. SQL content is unchanged.
3. Add a pre-replay guard that fails on duplicate numeric migration versions.
4. Add a normalized-content guard that fails on unapproved exact SQL
   duplicates.
5. Retain the older replay-safe duplicate pair
   `20260813090000_scp_phase2m_fixture_internal_only.sql` and
   `20260814054617_aa33afbd-687d-4c68-96d3-1c7b65056086.sql` because **both**
   versions are already recorded in production. Consolidating an already
   applied pair would be a separate owner-reviewed history operation.
6. Extend the purpose-governance suite to assert that exactly one
   `scp_employer_assign` exists, that it has the governed eight-argument
   signature, that it is `SECURITY DEFINER`, and that anonymous execution is
   denied while authenticated execution reaches that sole contract.

No existing migration SQL is edited. No data migration is introduced.

## Verification gate

The repair is mergeable only when CI proves all of the following from an empty
PostgreSQL database:

- complete migration replay;
- domain, RLS, journeys, rollback and partial-upgrade coverage;
- Career Discovery, CIE, KG and SCP separation/governance guards;
- every Security Passport regression suite, including Phase 11;
- typecheck, production build and SV/EN parity;
- the new migration-version/content guards;
- the unique governed `scp_employer_assign` contract.

CI result and final branch SHA are added to the owner-review report; they are
not inferred from the hosted database.

## Expected clean schema versus hosted production

Once CI is green, the expected material difference is exactly Passport Phase
11. The canonical Employer governance objects and sole assignment signature
already match hosted production. No production write is needed for the nine
duplicate removals or the Phase 10 filename reconciliation.

## Owner-reviewed production action (not executed)

After merge approval, run a linked read-only migration comparison and then:

1. `supabase db push --dry-run --include-all`
2. Confirm the dry run lists **only**
   `20260818120000_sp_phase11_languages_and_practical_skills.sql`.
3. Review a current backup/restore point and the Phase 11 SQL.
4. With separate explicit owner approval, run
   `supabase db push --include-all`.
5. Re-read the ledger and Phase 11 objects, then run production-safe Passport
   smoke checks.

`--include-all` is required because Phase 11 is an out-of-order local migration
older than versions already recorded remotely. Do not use `migration repair`
to mark it applied before its SQL exists: repair changes ledger state only and
would create a false history. Do not use a remote reset.

## Rollback plan

- Before merge: revert the repair commit or close the branch. Hosted production
  is unchanged, so there is no database rollback.
- After repository merge but before Phase 11 application: revert the merge if
  necessary; production remains unchanged.
- If the separately approved Phase 11 application later fails, stop at the
  first error, preserve the failed migration evidence, and restore through the
  reviewed database recovery procedure. Never delete ledger rows or manually
  mark Phase 11 applied unless an owner-reviewed schema inspection proves the
  SQL completed and only the ledger write is missing.
