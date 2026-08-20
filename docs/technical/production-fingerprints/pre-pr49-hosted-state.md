# Hosted pre-state fingerprint — before applying the six PR #49 migrations

**Captured** 2026-08-19 · **Project** `zrahptwsnjcdyzfywbeh` (Lovable
`9ec625ef-34a1-4b4b-8cbb-712cae168579`) · **Method** read-only `SELECT` via the
Lovable MCP. No writes were performed.

**Repository state at capture** `origin/main` = `9f7d32b11c630898c5375bd9a2aad0dbd448ef89`
(merge of PR #49).

## Hosted ledger position

Head is `20260819154918`, which `supabase/migrations-policy.json` maps to the
canonical `20260824090000_scp_review_concurrency_and_legacy_removal.sql`.
Confirmed by object probe rather than by version number, because Lovable stamps
its own version and a UUID name and cannot record the canonical version.

Applied through `20260824090000`. The six PR #49 migrations are absent.

## Objects that do NOT exist (the exposure being closed)

    scp_training_assignments                     absent
    scp_training_module_progress                 absent
    scp_module_versions.learning_form_id         absent
    scp_programs.owner_employer_id               absent
    scp_modules.owner_employer_id                absent
    scp_assessment_definitions.owner_employer_id absent
    scp_programs.is_test_fixture                 absent
    scp_evidence_source_types.counts_toward_maturity  absent
    scp_lifecycle_state()                        absent
    scp_employer_content_library()               absent
    scp_my_academy_work()                        absent
    scp_assign_training()                        absent
    scp_my_training_programme()                  absent
    scp_my_training_modules()                    absent
    scp_start_training_module()                  absent
    scp_complete_training_module()               absent
    scp_complete_training_programme()            absent
    scp_employer_training_status()               absent
    scp_guard_module_form_is_learning()          absent
    scp_guard_training_target_assignable()       absent
    scp_guard_training_progress_in_programme()   absent
    scp_touch_updated_at()                       absent

Partial application: **none**. No index, guard, table or column from any of the
six exists, so every migration would apply from a clean starting point.

## Row counts at capture (rollback safety)

    scp_programs                 2
    scp_modules                  7
    scp_assessment_definitions   3
    scp_competency_evidence      4   (all source_type = 'assessment_response')
    training_completion evidence 0

Zero `training_completion` rows means the maturity-isolation rule
(`20260825091000`) is still free to apply: no historical evidence changes
meaning, and no computed level can move.

## Policy fingerprint — what `20260825090000_scp_content_tenancy` replaces

Seven SELECT policies, all `TO authenticated USING (true)`:

    scp_assessment_definitions_read
    scp_assessment_versions_read
    scp_module_behaviour_map_read
    scp_module_versions_read
    scp_modules_read
    scp_program_versions_read
    scp_programs_read

Seven `*_author_write` policies, `FOR ALL TO authenticated USING
(scp_can_author(auth.uid()))`, are NOT touched by the migration and must remain
byte-identical afterwards:

    scp_assessment_definitions_author_write
    scp_assessment_versions_author_write
    scp_module_behaviour_map_author_write
    scp_module_versions_author_write
    scp_modules_author_write
    scp_program_versions_author_write
    scp_programs_author_write

### Restore statement for the seven read policies

Should the tenancy migration need reverting, this restores the exact pre-state.
It re-opens the content spine to every authenticated user, which is only safe
while no row carries an owner — so the column drop must happen in the same
transaction.

```sql
BEGIN;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scp_programs','scp_program_versions','scp_modules','scp_module_versions',
    'scp_module_behaviour_map','scp_assessment_definitions','scp_assessment_versions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_read', t);
  END LOOP;
END $$;

-- Only valid while no row owns content. Verify first:
--   SELECT count(*) FROM public.scp_programs               WHERE owner_employer_id IS NOT NULL;
--   SELECT count(*) FROM public.scp_modules                WHERE owner_employer_id IS NOT NULL;
--   SELECT count(*) FROM public.scp_assessment_definitions WHERE owner_employer_id IS NOT NULL;
ALTER TABLE public.scp_programs               DROP COLUMN IF EXISTS owner_employer_id;
ALTER TABLE public.scp_modules                DROP COLUMN IF EXISTS owner_employer_id;
ALTER TABLE public.scp_assessment_definitions DROP COLUMN IF EXISTS owner_employer_id;
COMMIT;
```
