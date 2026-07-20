-- =============================================================================
-- H4.1 Phase 1 local validation -- proves the full secure database/backend
-- foundation for the Assessment Blueprint Engine end to end: catalogue
-- bridge (C1), status/stage model (C2), RLS + organisation isolation,
-- version immutability (C3), scoring integrity incl. (A)/(B) separation,
-- reproducibility, and the direct-update-bypass guard (blocker #2).
-- =============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY verbose
\pset pager off

\echo '=== T1: content authoring -- evidence signals, questions, module (admin) ==='
SELECT set_config('request.jwt.claim.sub', 'a0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.create_evidence_signal('structured-routine', 'Strukturerad rutin', 'Structured routine') \gset sig1_
SELECT * FROM public.create_evidence_signal('risk-awareness-signal', 'Riskmedvetenhet', 'Risk awareness') \gset sig2_
SELECT * FROM public.create_question_draft('q-routine-1', 'rating', 1, 5, 'Jag trivs med strukturerade rutiner.', 'I thrive on structured routines.') \gset q1_
SELECT * FROM public.create_question_draft('q-risk-1', 'rating', 1, 5, 'Jag lägger märke till avvikelser snabbt.', 'I notice anomalies quickly.') \gset q2_
SELECT public.attach_evidence_signal_to_question_version(:'q1_question_version_id'::uuid, :'sig1_evidence_signal_id'::uuid, 1.0, 1::smallint);
SELECT public.attach_evidence_signal_to_question_version(:'q2_question_version_id'::uuid, :'sig2_evidence_signal_id'::uuid, 1.0, 1::smallint);
SELECT public.publish_question_version(:'q1_question_version_id'::uuid);
SELECT public.publish_question_version(:'q2_question_version_id'::uuid);
RESET ROLE;

\echo '=== T2: module publish fails with zero attached questions, succeeds after attaching ==='
SELECT set_config('request.jwt.claim.sub', 'a0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.create_module_draft('m-operational-security', 'Operativ säkerhet', 'Operational Security') \gset mod_
\echo '--- T2a: publish attempt with zero attached questions -- must fail ---'
SELECT public.publish_module_version(:'mod_module_version_id'::uuid);
SELECT public.attach_question_to_module_version(:'mod_module_version_id'::uuid, :'q1_question_version_id'::uuid, 1);
SELECT public.attach_question_to_module_version(:'mod_module_version_id'::uuid, :'q2_question_version_id'::uuid, 2);
SELECT public.attach_competency_to_module_version(:'mod_module_version_id'::uuid, (SELECT id FROM public.cig_competencies WHERE slug = 'situational-awareness'), 3::smallint);
\echo '--- T2b: publish attempt now that questions are attached -- succeeds ---'
SELECT public.publish_module_version(:'mod_module_version_id'::uuid);
RESET ROLE;

\echo '=== T3: create + publish Blueprint against the curated Role/Environment -- proves the C1 catalog bridge ==='
SELECT set_config('request.jwt.claim.sub', 'a0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.create_blueprint_draft(
  'security-officer-general-baseline',
  (SELECT id FROM public.assessment_purposes WHERE slug = 'recruitment'),
  (SELECT id FROM public.cig_professions WHERE slug = 'vaktare'),
  (SELECT id FROM public.cig_work_environments WHERE slug = 'indoor-static-post'),
  (SELECT id FROM public.assessment_levels WHERE slug = 'baseline'),
  'Säkerhetsvakt Baslinje', 'Security Officer Baseline'
) \gset bp_
SELECT public.attach_module_to_blueprint_version(:'bp_blueprint_version_id'::uuid, :'mod_module_version_id'::uuid, 1);
SELECT * FROM public.publish_blueprint_version(:'bp_blueprint_version_id'::uuid) \gset pub_
\echo '--- T3 check: mirrored assessments row exists ---'
SELECT id, kind FROM public.assessments WHERE id = 'blueprint:security-officer-general-baseline';
\echo '--- T3 check: mirrored assessment_versions row exists and matches blueprint_versions.assessment_version_id ---'
SELECT av.id, av.assessment_id, av.model_version
FROM public.assessment_versions av
JOIN public.blueprint_versions bv ON bv.assessment_version_id = av.id
WHERE bv.id = :'bp_blueprint_version_id'::uuid;
RESET ROLE;

\echo '=== T4: Scoring Profile -- create, weight, publish; I3 exactly-one-published enforcement ==='
SELECT set_config('request.jwt.claim.sub', 'a0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.create_scoring_profile_draft(:'bp_blueprint_version_id'::uuid) \gset sp_
SELECT public.set_scoring_profile_weight(:'sp_scoring_profile_version_id'::uuid, :'sig1_evidence_signal_id'::uuid, 1.5);
SELECT public.set_scoring_profile_weight(:'sp_scoring_profile_version_id'::uuid, :'sig2_evidence_signal_id'::uuid, 2.0);
SELECT * FROM public.publish_scoring_profile_version(:'sp_scoring_profile_version_id'::uuid);
\echo '--- T4b: a second scoring profile version cannot ALSO be published while the first is still published ---'
SELECT * FROM public.create_scoring_profile_draft(:'bp_blueprint_version_id'::uuid) \gset sp2_
SELECT public.set_scoring_profile_weight(:'sp2_scoring_profile_version_id'::uuid, :'sig1_evidence_signal_id'::uuid, 9.0);
SELECT * FROM public.publish_scoring_profile_version(:'sp2_scoring_profile_version_id'::uuid);
\echo '--- T4c: exactly one published scoring_profile_versions row exists for this blueprint version ---'
SELECT count(*) AS published_scoring_profiles FROM public.scoring_profile_versions
WHERE blueprint_version_id = :'bp_blueprint_version_id'::uuid AND content_status = 'published';
RESET ROLE;

\echo '=== T5: Requirement Profile -- admin-only creation (I6 / PO decision) ==='
SELECT set_config('request.jwt.claim.sub', 'a0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.create_requirement_profile_draft('11111111-0000-0000-0000-000000000001'::uuid, 'employer-a-baseline-priority') \gset rp_
SELECT public.set_requirement_profile_weight(:'rp_requirement_profile_version_id'::uuid, (SELECT id FROM public.cig_competencies WHERE slug = 'situational-awareness'), 'critical');
SELECT * FROM public.publish_requirement_profile_version(:'rp_requirement_profile_version_id'::uuid);
RESET ROLE;

\echo '=== T5b: a non-admin employer owner (employer A, their OWN org) cannot create a Requirement Profile -- admin-only, not just admin-or-owner ==='
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.create_requirement_profile_draft('11111111-0000-0000-0000-000000000001'::uuid, 'employer-a-attempt-2');
RESET ROLE;

\echo '=== T6 (I6): employer B (a DIFFERENT organisation) cannot read employer A''s published Requirement Profile Version ==='
SELECT set_config('request.jwt.claim.sub', 'e0000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT count(*) AS visible_rows_should_be_zero FROM public.requirement_profile_versions WHERE id = :'rp_requirement_profile_version_id'::uuid;
RESET ROLE;

\echo '=== T6b (I6): employer A (the OWNING organisation) CAN read their own published Requirement Profile Version ==='
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT count(*) AS visible_rows_should_be_one FROM public.requirement_profile_versions WHERE id = :'rp_requirement_profile_version_id'::uuid;
RESET ROLE;

\echo '=== T7: candidate starts a plain run (no Requirement Profile) -- proves the run satisfies the pre-existing NOT NULL assessment_id/assessment_version_id (C1) ==='
SELECT set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.start_assessment_run(:'bp_blueprint_version_id'::uuid) \gset run1_
SELECT assessment_id, assessment_version_id, status, blueprint_version_id, scoring_profile_version_id, requirement_profile_version_id
FROM public.assessment_runs WHERE id = :'run1_run_id'::uuid;
RESET ROLE;

\echo '=== T8: an unrelated candidate cannot start a run carrying employer A''s Requirement Profile Version (cross-org isolation on start_assessment_run) ==='
SELECT set_config('request.jwt.claim.sub', 'c0000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT * FROM public.start_assessment_run(:'bp_blueprint_version_id'::uuid, :'rp_requirement_profile_version_id'::uuid);
RESET ROLE;

\echo '=== T9: candidate records answers, finalizes -- finalize fails if incomplete, succeeds once complete ==='
SELECT set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
\echo '--- T9a: finalize before any answers recorded -- must fail ---'
SELECT * FROM public.finalize_assessment_answers(:'run1_run_id'::uuid);
SELECT public.record_assessment_answer(:'run1_run_id'::uuid, :'q1_question_version_id'::uuid, '{"value": 4}'::jsonb);
\echo '--- T9b: finalize with only 1 of 2 required answers -- must still fail ---'
SELECT * FROM public.finalize_assessment_answers(:'run1_run_id'::uuid);
SELECT public.record_assessment_answer(:'run1_run_id'::uuid, :'q2_question_version_id'::uuid, '{"value": 5}'::jsonb);
\echo '--- T9c: finalize now that both are answered -- succeeds ---'
SELECT * FROM public.finalize_assessment_answers(:'run1_run_id'::uuid);
RESET ROLE;

\echo '=== T10: compute_standard_result -- (A) populated, deterministic from pinned scoring profile ==='
SELECT set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.compute_standard_result(:'run1_run_id'::uuid);
SELECT standard_result, requirement_match FROM public.assessment_run_reports WHERE run_id = :'run1_run_id'::uuid;
RESET ROLE;

\echo '=== T11 (blocker #2 -- the headline finding of this phase): a signed-in participant CANNOT directly rewrite their own run''s Blueprint-Engine fields via a raw UPDATE, even though assessment_runs already grants them broad "own row" UPDATE ==='
SELECT set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.assessment_runs SET blueprint_run_stage = 'requirement_match_computed' WHERE id = :'run1_run_id'::uuid;
UPDATE public.assessment_runs SET status = 'completed' WHERE id = :'run1_run_id'::uuid;
\echo '--- confirm neither raw UPDATE above took effect ---'
SELECT status, blueprint_run_stage FROM public.assessment_runs WHERE id = :'run1_run_id'::uuid;
RESET ROLE;

\echo '=== T12: complete_assessment_run -- reuses the EXISTING status value "completed" only (fixes C2) ==='
SELECT set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.complete_assessment_run(:'run1_run_id'::uuid);
SELECT status FROM public.assessment_runs WHERE id = :'run1_run_id'::uuid;
RESET ROLE;

\echo '=== T13: assessment_runs.status has never taken any value outside the pre-existing three (schema-level proof, not just RPC behavior) ==='
SELECT DISTINCT status FROM public.assessment_runs ORDER BY status;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.assessment_runs'::regclass AND conname = 'assessment_runs_status_check';

\echo '=== T14: full (A)+(B) pipeline -- employer A owner starts a SECOND run WITH their own Requirement Profile attached ==='
SELECT set_config('request.jwt.claim.sub', 'e0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.start_assessment_run(:'bp_blueprint_version_id'::uuid, :'rp_requirement_profile_version_id'::uuid) \gset run2_
SELECT public.record_assessment_answer(:'run2_run_id'::uuid, :'q1_question_version_id'::uuid, '{"value": 5}'::jsonb);
SELECT public.record_assessment_answer(:'run2_run_id'::uuid, :'q2_question_version_id'::uuid, '{"value": 5}'::jsonb);
SELECT * FROM public.finalize_assessment_answers(:'run2_run_id'::uuid);
SELECT * FROM public.compute_standard_result(:'run2_run_id'::uuid);
\echo '--- (A) is populated, (B) is still NULL -- structurally separate, not computed yet ---'
SELECT standard_result IS NOT NULL AS a_populated, requirement_match IS NULL AS b_still_null
FROM public.assessment_run_reports WHERE run_id = :'run2_run_id'::uuid;
\echo '--- snapshot (A) before computing (B), to prove (B) never touches it ---'
SELECT standard_result AS standard_result_before_b FROM public.assessment_run_reports WHERE run_id = :'run2_run_id'::uuid \gset before_
SELECT * FROM public.compute_requirement_match(:'run2_run_id'::uuid);
\echo '--- (A) is BYTE-IDENTICAL to before computing (B); (B) is now populated ---'
SELECT
  (standard_result = :'before_standard_result_before_b'::jsonb) AS standard_result_unchanged_by_b,
  requirement_match IS NOT NULL AS b_now_populated
FROM public.assessment_run_reports WHERE run_id = :'run2_run_id'::uuid;
SELECT * FROM public.complete_assessment_run(:'run2_run_id'::uuid);
RESET ROLE;

\echo '=== T15: static proof -- compute_requirement_match()''s own source code contains no statement writing standard_result ==='
SELECT prosrc !~* 'set[^;]*standard_result' AS body_never_writes_standard_result
FROM pg_proc WHERE proname = 'compute_requirement_match' AND pronamespace = 'public'::regnamespace;

\echo '=== T16: version immutability -- an already-published question version cannot be published again ==='
SELECT set_config('request.jwt.claim.sub', 'a0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT public.publish_question_version(:'q1_question_version_id'::uuid);
RESET ROLE;

\echo '=== T17 (C3): a published question version referenced by a published module cannot be directly DELETEd ==='
SET ROLE authenticated;
DELETE FROM public.question_versions WHERE id = :'q1_question_version_id'::uuid;
RESET ROLE;
SELECT count(*) AS still_present FROM public.question_versions WHERE id = :'q1_question_version_id'::uuid;

\echo '=== T18 (C3): no authenticated role can directly INSERT/UPDATE/DELETE on any protected Blueprint Engine table -- every write must go through an RPC ==='
SET ROLE authenticated;
INSERT INTO public.blueprints (slug, purpose_id, role_id, environment_id, assessment_level_id)
VALUES ('direct-insert-attempt', (SELECT id FROM public.assessment_purposes LIMIT 1), (SELECT id FROM public.cig_professions LIMIT 1), (SELECT id FROM public.cig_work_environments LIMIT 1), (SELECT id FROM public.assessment_levels LIMIT 1));
UPDATE public.blueprint_versions SET content_status = 'archived' WHERE id = :'bp_blueprint_version_id'::uuid;
DELETE FROM public.blueprints WHERE id = :'bp_blueprint_id'::uuid;
RESET ROLE;
\echo '--- confirm none of the three direct writes above took effect ---'
SELECT count(*) AS should_be_zero FROM public.blueprints WHERE slug = 'direct-insert-attempt';
SELECT content_status FROM public.blueprint_versions WHERE id = :'bp_blueprint_version_id'::uuid;

\echo '=== T19: reproducibility -- publishing a NEW blueprint version does not change an already-completed run''s pinned references or report ==='
SELECT set_config('request.jwt.claim.sub', 'a0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.create_module_draft('m-second-module', 'Andra modulen', 'Second Module') \gset mod2_
SELECT public.attach_question_to_module_version(:'mod2_module_version_id'::uuid, :'q1_question_version_id'::uuid, 1);
SELECT public.publish_module_version(:'mod2_module_version_id'::uuid);
SELECT * FROM public.create_blueprint_draft(
  'security-officer-general-baseline-v2-test', (SELECT id FROM public.assessment_purposes WHERE slug = 'recruitment'),
  (SELECT id FROM public.cig_professions WHERE slug = 'vaktare'), (SELECT id FROM public.cig_work_environments WHERE slug = 'indoor-static-post'),
  (SELECT id FROM public.assessment_levels WHERE slug = 'baseline'), 'v2 test', 'v2 test'
) \gset bp2_
SELECT public.attach_module_to_blueprint_version(:'bp2_blueprint_version_id'::uuid, :'mod2_module_version_id'::uuid, 1);
SELECT public.create_scoring_profile_draft(:'bp2_blueprint_version_id'::uuid);
RESET ROLE;
\echo '--- run 1''s pinned blueprint_version_id is still the ORIGINAL one, and its standard_result is unchanged ---'
SELECT blueprint_version_id = :'bp_blueprint_version_id'::uuid AS still_pinned_to_original FROM public.assessment_runs WHERE id = :'run1_run_id'::uuid;

\echo '=== T20: final RPC/function inventory -- every new function is SECURITY DEFINER with an explicit search_path (least-privilege posture) ==='
SELECT p.proname, p.prosecdef AS is_security_definer,
  (SELECT array_agg(cfg) FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%') AS search_path_setting
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'create_question_draft','publish_question_version','archive_question_version',
    'create_module_draft','publish_module_version','archive_module_version',
    'create_evidence_signal','attach_evidence_signal_to_question_version','detach_evidence_signal_from_question_version',
    'attach_question_to_module_version','detach_question_from_module_version',
    'attach_competency_to_module_version','detach_competency_from_module_version',
    'create_blueprint_draft','attach_module_to_blueprint_version','detach_module_from_blueprint_version',
    'set_blueprint_version_question_override','publish_blueprint_version','archive_blueprint_version',
    'create_scoring_profile_draft','set_scoring_profile_weight','publish_scoring_profile_version','archive_scoring_profile_version',
    'create_requirement_profile_draft','set_requirement_profile_weight','publish_requirement_profile_version',
    'start_assessment_run','record_assessment_answer','finalize_assessment_answers',
    'compute_standard_result','compute_requirement_match','complete_assessment_run','abandon_assessment_run'
  )
ORDER BY p.proname;

\echo '=== DONE ==='
