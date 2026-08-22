# CQrityjob State of Truth v1.1

**Current technical source of truth.**

**Version:** v1.1 · **Verified:** 23 August 2026

**Repository baseline:** `d74cab600ab32f490707e31185bfd58f77c55392`

**Cutover branch:** `codex/owned-supabase-cutover`

## 1. Canonical identity

| System | Identity | Role |
|---|---|---|
| GitHub | `cqrityjob/trust-path-recruitment` | Canonical code and migrations |
| Lovable project | `9ec625ef-34a1-4b4b-8cbb-712cae168579` | Frontend build and hosting |
| Owned Supabase | `mlvzmiutmyyqeuvjglco` | Canonical database, Auth and Storage |
| Legacy Lovable Cloud | `zrahptwsnjcdyzfywbeh` | Frozen rollback source until acceptance |

The application must never split one request between the two backends.
CQrityjob-owned environment variables therefore take priority over Lovable's
injected `SUPABASE_*` variables. The standard variables remain a one-step
rollback path.

## 2. Verified migration state

| Measure | Owned Supabase |
|---|---:|
| Ledger rows | 226 |
| Latest ledger version | `20260906110000` |
| Active repository migrations | 226 |
| Intentionally pending | `20260903120000_scp_sg_reporting_documentation_rubrics.sql` |
| Historical hosted-only ledger row | `20260720180000_h4_1_assessment_blueprint_engine_phase1` |

The active set and ledger therefore have one intentional item on each side.
The historical Blueprint Engine objects remain dormant in the owned database.
Removing them is destructive and requires a separate owner decision; they are
not used as application types or product dependencies.

The migration
`20260906110000_job_application_cvs_bucket_canonical_home.sql` establishes
the missing private `job-application-cvs` bucket in the canonical repository
and preserves its five RLS policies.

## 3. Verified data state

The source was not modified during the transfer. Stable application IDs were
remapped where canonical seeded identities differ between environments.
Historical inserts that required trigger bypass were executed in isolated
transactions and followed by explicit foreign-key verification. A complete
audit checked 375 public foreign keys and found zero orphaned references.

| Measure | Owned Supabase |
|---|---:|
| Auth users / identities | 7 / 7 |
| Profiles | 7 |
| Employers | 9 |
| Jobs | 19 |
| Job applications | 6 |
| Assessment assignments / runs | 23 / 13 |
| Career Discovery sessions / reports | 42 / 24 |
| Public base tables | 196 |
| Storage buckets / objects | 2 / 0 |

Operational source and target table counts match. Three canonical content
tables are intentional supersets in the owned database:
`assessment_versions`, `scp_anchor_responses`, and `scp_content_events`.

The 10 uploaded CV/passport files and the database-backup object in Lovable
Storage were explicitly classified by the owner as test or transfer artefacts
and were not copied. No user production file was deleted.

## 4. Frontend binding

Lovable Cloud injects `VITE_SUPABASE_*`, `SUPABASE_*`,
`SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` for
`zrahptwsnjcdyzfywbeh`. Process variables outrank a committed `.env`, so
editing the old names alone cannot perform the cutover.

The branch introduces the following canonical variables:

- `VITE_CQRITYJOB_SUPABASE_URL`
- `VITE_CQRITYJOB_SUPABASE_PUBLISHABLE_KEY`
- `CQRITYJOB_SUPABASE_URL`
- `CQRITYJOB_SUPABASE_PUBLISHABLE_KEY`
- `CQRITYJOB_SUPABASE_SERVICE_ROLE_KEY` (server-only project secret)

The public configuration helper selects the owned pair first. The admin client
will not combine the owned URL with Lovable's legacy service-role key; it stops
with an explicit error if the owned server-only secret is absent.

## 5. Cutover gates

The owned backend is data-ready. Production frontend cutover is accepted only
when all gates below are green:

1. `CQRITYJOB_SUPABASE_SERVICE_ROLE_KEY` is stored as a Lovable server-only
   project secret. It must never be committed or use a `VITE_` prefix.
2. Target Auth has the final Site URL and allowed redirect URLs.
3. Google sign-in is either enabled on the target with CQrityjob-owned OAuth
   credentials or deliberately removed from the UI. Target Google provider was
   verified disabled on 23 August 2026.
4. Password login, admin login, candidate flow, employer flow, file upload and
   report generation pass against `mlvzmiutmyyqeuvjglco`.
5. The deployed bundle and runtime logs show only the owned project for
   application traffic.

Until these gates pass, the current Lovable deployment and its data remain
untouched.

## 6. Verification and accepted debt

- Production build: pass.
- Migration safety guard: 226 active migrations, pass.
- Public assessment auth guard: 124 checks, pass.
- Security/competence separation guard: pass.
- Recruitment flow and decision-support guards: pass.
- Edge Functions: none.
- Database advisors: no new cutover-specific finding. Existing backlog includes
  two documented security-definer views, mutable `search_path` findings,
  missing FK indexes, RLS init-plan optimisations, unused indexes and multiple
  permissive policies. These are hardening work, not licence to weaken RLS.

Generated TypeScript types intentionally remain based on the canonical active
schema. Generating from the target today would expose the parked Blueprint
Engine objects as if they were supported product APIs.

## 7. Rollback

Rollback is configuration-only while the legacy backend remains frozen:

1. remove the `CQRITYJOB_*` override variables;
2. redeploy the recorded pre-cutover commit;
3. confirm Lovable's injected project reference is
   `zrahptwsnjcdyzfywbeh`.

No reverse data migration is performed automatically. Any writes after live
cutover require a separate reconciliation decision before rollback.
