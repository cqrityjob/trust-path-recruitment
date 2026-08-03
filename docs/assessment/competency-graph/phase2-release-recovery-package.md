# Phase 2 — Release Recovery Package

> ## ⚠️ THIS IS A ROLLBACK PLAN. IT IS NOT A DATABASE BACKUP.
>
> The Supabase project is on the free plan, which provides no managed backups,
> no PITR and no snapshots. This document lets you **undo the Phase 2 schema
> changes**. It does **not** let you recover from data loss caused by anything
> else — an unrelated bad query, an accidental deletion, or a provider incident
> — during or after this release.
>
> What makes the release survivable is not this document. It is that **every
> Phase 2 migration is additive**: nothing is dropped, truncated or rewritten.
> The rollback below removes what Phase 2 added. It cannot restore what Phase 2
> never touched, because Phase 2 never touched it.
>
> Before running any rollback, take a `pg_dump` if you possibly can. Ten minutes
> of dump beats any amount of planning.

---

## 1. Production schema assumptions

This package assumes the target database:

- already carries every migration up to and including `20260806090000`
  (Phase 1H), which is what `main` contained before this release;
- has **no** `scp_report_snapshots` table;
- has **no** `is_test_fixture` column on `scp_assessment_definitions`;
- has **no** `program_version_id` column on `scp_assessment_versions`;
- has zero rows in `scp_purpose_versions`;
- has the real Security Guard content (`sg-b-*`) in `draft`;
- has `null_provider` as the only enabled AI provider.

If any assumption is false, **stop and re-verify before applying anything.**
Section 2's queries establish all of them.

---

## 2. Pre-migration verification queries

Run these first and keep the output. They are the baseline you will compare
against afterwards, and several are also stop conditions.

```sql
-- Baseline counts. Counts only -- never export personal data.
SELECT
  (SELECT count(*) FROM auth.users)                    AS users,
  (SELECT count(*) FROM public.employers)              AS employers,
  (SELECT count(*) FROM public.assessment_assignments) AS assignments,
  (SELECT count(*) FROM public.scp_attempts)           AS scp_attempts,
  (SELECT count(*) FROM public.assessment_runs)        AS legacy_runs,
  (SELECT count(*) FROM public.scp_competency_evidence) AS evidence;

-- Migration ledger: the last applied version should be 20260806090000.
SELECT version FROM supabase_migrations.schema_migrations
 ORDER BY version DESC LIMIT 5;

-- Phase 2 objects must NOT exist yet.
SELECT to_regclass('public.scp_report_snapshots')          AS snapshots_should_be_null;
SELECT count(*) AS fixture_col_should_be_0 FROM information_schema.columns
 WHERE table_name='scp_assessment_definitions' AND column_name='is_test_fixture';
SELECT count(*) AS progver_col_should_be_0 FROM information_schema.columns
 WHERE table_name='scp_assessment_versions' AND column_name='program_version_id';

-- Content boundary. Both must hold BEFORE and AFTER.
SELECT count(*) AS published_non_fixture_should_be_0
  FROM public.scp_assessment_versions WHERE content_status='published';
SELECT DISTINCT content_status AS sg_items_should_be_draft
  FROM public.scp_item_versions iv JOIN public.scp_items i ON i.id=iv.item_id
 WHERE i.slug LIKE 'sg-b-%';

-- AI must stay off.
SELECT string_agg(code, ',') AS enabled_should_be_null_provider
  FROM public.scp_ai_providers WHERE is_enabled;

-- No trigger may already be disabled.
SELECT count(*) AS disabled_triggers_should_be_0
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='D';
```

---

## 3. The ten migrations and what each creates

Apply in filename order. All additive.

| # | Migration | Creates / changes |
|---|---|---|
| 1 | `20260807090000_scp_phase2_read_models_and_identity_rpc` | views `scp_rm_employer_assignments`, `scp_rm_review_queue`; fn `scp_resolve_participant_identity`; 2 contract rows |
| 2 | `20260808090000_scp_phase2b_fixture_and_delivery` | table `scp_report_snapshots`; column `scp_assessment_definitions.is_test_fixture`; widens `scp_human_reviews` trigger-reason CHECK; fns `scp_get_attempt_items`, `scp_save_response`, `scp_submit_attempt`, `scp_complete_human_review`, `scp_release_attempt_report`, `scp_guard_snapshot_immutable` |
| 3 | `20260808100000_scp_phase2c_test_fixture_programme` | fixture definition/version/form + 4 items + options + texts; 2 published report templates |
| 4 | `20260809090000_scp_phase2e_employer_learning_progress` | enables `training_completion` writer; 11 fns (library, assign, participants, review pressure, recommendations, learning, reassessment, progress, my-assignments) |
| 5 | `20260809100000_scp_phase2f_learning_fixture` | fixture programme + module + 2 learning item versions |
| 6 | `20260810090000_scp_phase2h_staging_corrections` | **NULLs learning feedback on 60 DRAFT assessment options** (preserved first in `scp_content_events`); guard `scp_guard_no_learning_feedback_on_assessment`; column `scp_assessment_versions.program_version_id` + 3-row backfill; rewrites `scp_employer_library` |
| 7 | `20260811090000_scp_phase2i_seed_processing_purpose_version` | 1 row in `scp_purpose_versions` — **without it nothing can be assigned** |
| 8 | `20260811100000_scp_phase2j_assign_token_without_pgcrypto` | replaces `scp_employer_assign` body (no pgcrypto) |
| 9 | `20260812090000_scp_phase2k_partial_bestworst_while_open` | replaces `scp_guard_response_matches_format` + `scp_submit_attempt` |
| 10 | `20260812100000_scp_phase2l_submit_requires_every_item` | replaces `scp_submit_attempt` (adds completeness gate) |

**Only migration 6 changes pre-existing rows**, and only rows whose
`content_status = 'draft'`. The removed text is written to
`scp_content_events` *before* the UPDATE, so it is recoverable from the
database itself:

```sql
SELECT metadata->>'item_slug', metadata->>'option_key',
       metadata->>'removed_learning_feedback_sv'
  FROM public.scp_content_events
 WHERE metadata->>'migration' = '20260810090000_scp_phase2h_staging_corrections';
```

---

## 4. Post-migration verification queries

```sql
-- All ten recorded.
SELECT version FROM supabase_migrations.schema_migrations
 WHERE version BETWEEN '20260807090000' AND '20260812100000' ORDER BY version;
-- expect exactly 10 rows

-- Objects exist.
SELECT count(*) AS fns_should_be_17 FROM pg_proc WHERE proname IN (
 'scp_resolve_participant_identity','scp_get_attempt_items','scp_save_response',
 'scp_submit_attempt','scp_complete_human_review','scp_release_attempt_report',
 'scp_employer_library','scp_employer_assign','scp_employer_participants',
 'scp_employer_review_pressure','scp_development_recommendations',
 'scp_start_learning_attempt','scp_get_learning_feedback',
 'scp_complete_learning_module','scp_schedule_reassessment',
 'scp_subject_progress','scp_my_academy_assignments');

SELECT count(*) AS rm_views_should_be_3 FROM information_schema.views
 WHERE table_schema='public' AND table_name LIKE 'scp_rm_%';

-- Triggers restored. THIS IS A STOP CONDITION IF NON-ZERO.
SELECT count(*) AS disabled_triggers_must_be_0
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='D';

-- RLS still on for every protected table.
SELECT count(*) AS unprotected_must_be_0 FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
   AND c.relname IN ('scp_subject_identities','scp_candidate_responses',
                     'scp_competency_evidence','scp_report_snapshots')
   AND NOT c.relrowsecurity;

-- Content boundary held.
SELECT count(*) AS real_published_must_be_0
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id=av.definition_id
 WHERE av.content_status='published' AND NOT d.is_test_fixture;

SELECT DISTINCT content_status AS sg_must_be_draft
  FROM public.scp_item_versions iv JOIN public.scp_items i ON i.id=iv.item_id
 WHERE i.slug LIKE 'sg-b-%';

-- Migration 6 specifics.
SELECT count(*) AS feedback_on_assessment_must_be_0
  FROM public.scp_item_options o
  JOIN public.scp_item_versions iv ON iv.id=o.item_version_id
 WHERE iv.mode='assessment'
   AND (o.learning_feedback_sv IS NOT NULL OR o.learning_feedback_en IS NOT NULL);

SELECT d.slug, p.slug AS programme      -- fixtures -> fixture-learning-programme
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id=av.definition_id
  LEFT JOIN public.scp_program_versions pv ON pv.id=av.program_version_id
  LEFT JOIN public.scp_programs p ON p.id=pv.program_id;

-- AI still off.
SELECT string_agg(code,',') AS must_be_null_provider
  FROM public.scp_ai_providers WHERE is_enabled;

-- Historical invariants: compare against the Section 2 baseline.
SELECT (SELECT count(*) FROM public.assessment_runs)        AS legacy_runs,
       (SELECT count(*) FROM public.assessment_assignments) AS assignments,
       (SELECT count(*) FROM public.cd_report_snapshots)    AS cd_reports;
```

---

## 5. Rollback

### Order

Reverse dependency order. **Phase 2 only** — do not run the Phase 1/0 layers
from `scp_a_rollback_test.sql` unless you intend to remove the whole Academy.

1. drop the Phase 2 functions and views
2. drop `scp_report_snapshots`
3. unpublish, then remove, the fixture content
4. drop the two added columns
5. restore the two replaced function bodies from `main`

### Commands

```sql
BEGIN;

-- 1. Phase 2 functions and views.
DROP VIEW     IF EXISTS public.scp_rm_employer_assignments CASCADE;
DROP VIEW     IF EXISTS public.scp_rm_review_queue CASCADE;
DROP FUNCTION IF EXISTS public.scp_resolve_participant_identity(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_get_attempt_items(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_save_response(uuid, uuid, uuid, uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_submit_attempt(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_complete_human_review(uuid, text, text, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_release_attempt_report(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_library(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_assign(uuid, uuid, text, timestamptz, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_participants(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_review_pressure(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_development_recommendations(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_start_learning_attempt(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_get_learning_feedback(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_complete_learning_module(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_schedule_reassessment(uuid, uuid, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.scp_subject_progress(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_my_academy_assignments() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_snapshot_immutable() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_no_learning_feedback_on_assessment() CASCADE;

DELETE FROM public.scp_contract_versions
 WHERE read_model IN ('scp_rm_employer_assignments','scp_rm_review_queue');

-- 2. Snapshots. Safe to drop: they are a PROJECTION. The evidence they were
--    rendered from stays in scp_competency_evidence.
DROP TABLE IF EXISTS public.scp_report_snapshots CASCADE;

-- 3. Fixture content. Published content is immutable by design, so unpublish
--    before removing -- that friction is the guard working.
ALTER TABLE public.scp_item_versions       DISABLE TRIGGER USER;
ALTER TABLE public.scp_assessment_versions DISABLE TRIGGER USER;
ALTER TABLE public.scp_program_versions    DISABLE TRIGGER USER;
ALTER TABLE public.scp_module_versions     DISABLE TRIGGER USER;

UPDATE public.scp_item_versions SET content_status='draft' WHERE id IN (
  SELECT fi.item_version_id FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id=fi.form_id
    JOIN public.scp_assessment_versions av ON av.id=f.assessment_version_id
    JOIN public.scp_assessment_definitions d ON d.id=av.definition_id
   WHERE d.is_test_fixture);
UPDATE public.scp_assessment_versions SET content_status='draft'
 WHERE definition_id IN (SELECT id FROM public.scp_assessment_definitions WHERE is_test_fixture);
UPDATE public.scp_module_versions  SET content_status='draft'
 WHERE program_version_id IN (SELECT pv.id FROM public.scp_program_versions pv
   JOIN public.scp_programs p ON p.id=pv.program_id WHERE p.slug LIKE 'fixture-%');
UPDATE public.scp_program_versions SET content_status='draft'
 WHERE program_id IN (SELECT id FROM public.scp_programs WHERE slug LIKE 'fixture-%');

ALTER TABLE public.scp_item_versions       ENABLE TRIGGER USER;
ALTER TABLE public.scp_assessment_versions ENABLE TRIGGER USER;
ALTER TABLE public.scp_program_versions    ENABLE TRIGGER USER;
ALTER TABLE public.scp_module_versions     ENABLE TRIGGER USER;

DELETE FROM public.scp_report_versions WHERE report_key LIKE 'fixture-%';

-- 4. Added columns.
ALTER TABLE public.scp_assessment_versions    DROP COLUMN IF EXISTS program_version_id;
ALTER TABLE public.scp_assessment_definitions DROP COLUMN IF EXISTS is_test_fixture;

-- 5. Ledger.
DELETE FROM supabase_migrations.schema_migrations
 WHERE version BETWEEN '20260807090000' AND '20260812100000';

-- VERIFY BEFORE COMMITTING.
SELECT count(*) AS disabled_triggers_must_be_0
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='D';

COMMIT;   -- or ROLLBACK; if anything above looked wrong
```

**Two things this rollback deliberately does NOT do.**

It does not restore `scp_guard_response_matches_format` or `scp_submit_attempt`
to their pre-Phase-2 bodies — re-run those definitions from
`20260803100000` and `20260808090000` on `main` if you need the old behaviour.
And it does not delete evidence or attempts: the append-only guard refuses, and
that refusal is correct. Fixture attempts are synthetic and harmless to leave.

### Restoring the removed learning feedback

If you roll back and want Phase 1G's 60 strings back on the draft assessment
options, they are in `scp_content_events` — see the query in Section 3.

---

## 6. GitHub revert

```bash
git revert -m 1 <merge-commit-sha>
git push origin main
```

`-m 1` keeps `main`'s side as the parent. This reverts the code only; run the
SQL rollback separately if the migrations were applied.

---

## 7. Lovable rollback

1. Lovable rebuilds from `main`, so pushing the revert above is the rollback.
2. Confirm the new build's commit matches the revert commit.
3. If Lovable offers a build history, pinning the previous successful build is
   faster and equivalent.
4. **Code and database roll back independently.** Reverting the code while the
   migrations stay applied is safe — the extra objects are simply unused.
   The reverse is not: rolling back the database while the new code is live
   breaks the Assessment Center.

---

## 8. Stop conditions

Stop and do not continue if any of these appear:

- any trigger left disabled after migration
- `real_published_must_be_0` returns non-zero
- `sg_must_be_draft` returns anything other than `draft`
- enabled providers is anything other than `null_provider`
- RLS off on any of the four protected tables
- baseline counts for users, employers, assignments, legacy runs or
  `cd_report_snapshots` **decrease**
- a migration reports a checksum conflict
- `feedback_on_assessment_must_be_0` returns non-zero after migration 6

---

## 9. Historical-data invariants

These must be identical before and after. Phase 2 touches none of them:

| Invariant | Why it holds |
|---|---|
| `auth.users` count | no migration writes to auth |
| `employers`, `employer_memberships` | untouched |
| `assessment_assignments` count | only a nullable column was added in Phase 1H |
| `assessment_runs`, `assessment_responses` (legacy) | untouched |
| `cd_sessions`, `cd_evidence`, `cd_report_snapshots` | Career Discovery is a separate family |
| existing `scp_attempts` / evidence | append-only guards refuse modification |
| Security Guard item content | only `learning_feedback_*` on draft rows, preserved in events |

If any count decreases, treat it as data loss and stop.
