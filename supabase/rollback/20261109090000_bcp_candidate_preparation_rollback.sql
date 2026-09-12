-- ===========================================================================
-- ROLLBACK -- BESKT PR 3, candidate preparation
-- ===========================================================================
--
-- Unwinds supabase/migrations/20261109090000_bcp_candidate_preparation.sql
-- and NOTHING else. It removes only what PR 3 added and restores every PR
-- #218 contract PR 3 re-created, byte for byte.
--
-- Run it in ONE transaction, so a refusal drops nothing:
--
--     psql -1 -v ON_ERROR_STOP=1 -f <this file>
--
-- It refuses outright when
--
--   * any catalogue object OUTSIDE the domain depends on it -- a foreign
--     key, a view, a rule, a trigger, a policy, a function that calls a
--     bcp_ function, or a function whose signature names a bcp_ ROW TYPE
--     (the one legitimate reference, beskt_can_read_version, is exempt
--     because restoring it is part of this rollback); or
--
--   * any candidate has SUBMITTED a preparation. A submitted response is a
--     person's own account of themselves, given under a stated notice.
--     Dropping the table would destroy it silently, so the rollback stops
--     and says so instead.
--
-- PR #218 is NOT unwound here and must be unwound AFTER this file: its own
-- rollback refuses while PR 3's foreign keys still reference
-- beskt_method_versions.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Refuse on any outside dependency.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  _n integer;
  _what text;
BEGIN
  -- Foreign keys pointing INTO the domain from outside it.
  SELECT count(*), string_agg(DISTINCT c.relname, ', ') INTO _n, _what
    FROM pg_constraint k
    JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_class f ON f.oid = k.confrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE k.contype = 'f'
     AND n.nspname = 'public'
     AND f.relname LIKE 'bcp\_%' ESCAPE '\'
     AND c.relname NOT LIKE 'bcp\_%' ESCAPE '\';
  IF _n > 0 THEN
    RAISE EXCEPTION 'BCP_ROLLBACK BLOCKED: % outside table(s) hold a foreign key into the domain (%).', _n, _what;
  END IF;

  -- Views on a bcp_ table.
  SELECT count(*), string_agg(DISTINCT v.viewname, ', ') INTO _n, _what
    FROM pg_views v
   WHERE v.schemaname = 'public' AND v.definition ~* '\mbcp_[a-z_]+\M';
  IF _n > 0 THEN
    RAISE EXCEPTION 'BCP_ROLLBACK BLOCKED: catalogue objects outside the domain depend on it -- view(s) %.', _what;
  END IF;

  -- Triggers on outside tables bound to a bcp_ function.
  SELECT count(*), string_agg(DISTINCT c.relname, ', ') INTO _n, _what
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal
     AND n.nspname = 'public'
     AND c.relname NOT LIKE 'bcp\_%' ESCAPE '\'
     AND t.tgfoid::regprocedure::text LIKE 'public.bcp\_%' ESCAPE '\';
  IF _n > 0 THEN
    RAISE EXCEPTION 'BCP_ROLLBACK BLOCKED: outside table(s) % carry a trigger on a bcp_ function.', _what;
  END IF;

  -- Policies on outside tables referencing the domain.
  SELECT count(*), string_agg(DISTINCT p.tablename, ', ') INTO _n, _what
    FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND p.tablename NOT LIKE 'bcp\_%' ESCAPE '\'
     AND (coalesce(p.qual, '') ~* '\mbcp_[a-z_]+\M'
          OR coalesce(p.with_check, '') ~* '\mbcp_[a-z_]+\M');
  IF _n > 0 THEN
    RAISE EXCEPTION 'BCP_ROLLBACK BLOCKED: policies on outside table(s) % reference the domain.', _what;
  END IF;

  -- Functions outside the domain that CALL a bcp_ function.
  -- beskt_can_read_version is exempt: PR 3 re-created it, and section 2
  -- below restores PR #218's own text.
  SELECT count(*), string_agg(DISTINCT p.proname, ', ') INTO _n, _what
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname NOT LIKE 'bcp\_%' ESCAPE '\'
     AND p.proname <> 'beskt_can_read_version'
     AND p.prosrc ~* '\mbcp_[a-z_]+\s*\(';
  IF _n > 0 THEN
    RAISE EXCEPTION 'BCP_ROLLBACK BLOCKED: function(s) % outside the domain call a bcp_ function.', _what;
  END IF;

  -- Functions whose SIGNATURE names a bcp_ ROW TYPE.
  SELECT count(*), string_agg(DISTINCT p.proname, ', ') INTO _n, _what
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname NOT LIKE 'bcp\_%' ESCAPE '\'
     AND EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace cn ON cn.oid = c.relnamespace
        WHERE cn.nspname = 'public' AND c.relname LIKE 'bcp\_%' ESCAPE '\'
          AND c.relkind = 'r'
          AND (p.prorettype = c.reltype OR c.reltype = ANY (p.proargtypes)));
  IF _n > 0 THEN
    RAISE EXCEPTION 'BCP_ROLLBACK BLOCKED: objects outside the domain depend on a bcp_ row type (%).', _what;
  END IF;

  -- A submitted preparation is a person's own account. Never dropped silently.
  IF to_regclass('public.bcp_responses') IS NOT NULL THEN
    SELECT count(*) INTO _n FROM public.bcp_responses r WHERE r.response_state = 'submitted';
    IF _n > 0 THEN
      RAISE EXCEPTION 'BCP_ROLLBACK BLOCKED: % candidate preparation(s) have been submitted; export and clear them deliberately before unwinding PR 3.', _n;
    END IF;
  END IF;

  RAISE NOTICE 'BCP_ROLLBACK: no outside dependency and no submitted preparation; proceeding.';
END
$guard$;


-- ---------------------------------------------------------------------------
-- 2. Restore the three PR #218 contracts PR 3 re-created, VERBATIM.
--
--    The text below is copied unchanged from
--    supabase/migrations/20261108090000_beskt_governed_method_content.sql.
--    Restoring them BEFORE the drops removes the only legitimate reference
--    from outside the domain.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beskt_can_read_version(_method_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    -- Governance readers: every state, both modes.
    public.scp_interview_can_read(auth.uid())
    -- Explicit internal QA: published recruitment-support content only, and
    -- only when every governed row of it lies within the classes an internal
    -- tester may read. A document is never returned in part.
    OR (public.beskt_holds_grant(auth.uid(), 'internal_qa')
        AND EXISTS (
          SELECT 1 FROM public.beskt_method_versions v
           WHERE v.id = _method_version_id
             AND v.content_status = 'published'
             AND v.mode = 'recruitment_support')
        AND NOT EXISTS (
          SELECT 1 FROM public.beskt_exposure_profiles p
           WHERE p.method_version_id = _method_version_id
             AND NOT (p.access_class = ANY (public.beskt_reader_access_classes(auth.uid()))))
        AND NOT EXISTS (
          SELECT 1 FROM public.beskt_items i
           WHERE i.method_version_id = _method_version_id
             AND NOT (i.access_class = ANY (public.beskt_reader_access_classes(auth.uid()))))));
$$;

REVOKE ALL ON FUNCTION public.beskt_can_read_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_can_read_version(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.beskt_can_read_version(uuid) IS
  'The narrow read contract for release_scope = synthetic_internal_only. '
  'Governance readers see everything; an explicit internal-QA grantee sees '
  'published recruitment-support content whose every row is within their '
  'access classes; employer members, candidates, roleless users and anon see '
  'nothing. Nothing here makes a method startable.';
CREATE OR REPLACE FUNCTION public.beskt_published_method(_method_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v public.beskt_method_versions%ROWTYPE;
  _p public.scp_interview_packs%ROWTYPE;
BEGIN
  IF NOT public.beskt_can_read_version(_method_version_id) THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHORISED: you may not read this method version.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BESKT_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _v.content_status <> 'published' THEN
    RAISE EXCEPTION 'BESKT_NOT_PUBLISHED: the read contract returns published content only; this version is "%".', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _p FROM public.scp_interview_packs WHERE id = _v.pack_id;

  RETURN jsonb_build_object(
    'method_version_id', _v.id,
    'pack_id', _p.id,
    'pack_slug', _p.slug,
    'pack_kind', _p.pack_kind,
    'name_sv', _p.name_sv,
    'name_en', _p.name_en,
    'purpose_sv', _p.purpose_sv,
    'version_number', _v.version_number,
    'content_status', _v.content_status,
    'mode', _v.mode,
    'validation_label', _v.validation_label,
    'release_scope', _v.release_scope,
    'locale_sv', _v.locale_sv,
    'locale_en', _v.locale_en,
    'source_reference', _v.source_reference,
    'source_document_version', _v.source_document_version,
    'content_provenance', _v.content_provenance,
    'summary_sv', _v.summary_sv,
    'summary_en', _v.summary_en,
    'content_hash', _v.content_hash,
    'content_hash_algorithm', _v.content_hash_algorithm,
    'revision', _v.revision,
    'exposure_profiles', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'profile_key', p.profile_key, 'display_order', p.display_order,
          'exposure_area', p.exposure_area, 'duties_sv', p.duties_sv, 'duties_en', p.duties_en,
          'role_relevance_rationale_sv', p.role_relevance_rationale_sv,
          'role_relevance_rationale_en', p.role_relevance_rationale_en,
          'permitted_mode', p.permitted_mode, 'owning_review_role', p.owning_review_role,
          'jurisdiction_reference', p.jurisdiction_reference,
          'lawful_basis_reference', p.lawful_basis_reference,
          'retention_class', p.retention_class, 'access_class', p.access_class,
          'security_sensitive_role_attestation_reference', p.security_sensitive_role_attestation_reference,
          'content_provenance', p.content_provenance, 'source_reference', p.source_reference)
        ORDER BY p.display_order, p.profile_key)
        FROM public.beskt_exposure_profiles p WHERE p.method_version_id = _v.id), '[]'::jsonb),
    'activation_requirements', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'requirement_key', a.requirement_key, 'satisfied_by_role', a.satisfied_by_role,
          'statement_sv', a.statement_sv, 'statement_en', a.statement_en)
        ORDER BY a.requirement_key)
        FROM public.beskt_activation_requirements a WHERE a.method_version_id = _v.id), '[]'::jsonb),
    'sections', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'section_key', s.section_key, 'display_order', s.display_order, 'phase', s.phase,
          'title_sv', s.title_sv, 'title_en', s.title_en,
          'items', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'item_key', i.item_key, 'display_order', i.display_order,
                'exposure_profile_key', pp.profile_key,
                'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
                'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en,
                'permitted_mode', i.permitted_mode, 'phase', i.phase,
                'answer_type', i.answer_type, 'requiredness', i.requiredness,
                'discuss_orally_allowed', i.discuss_orally_allowed,
                'sensitivity_class', i.sensitivity_class, 'access_class', i.access_class,
                'content_provenance', i.content_provenance, 'source_reference', i.source_reference,
                'prohibited_inferences', to_jsonb(i.prohibited_inferences),
                'options', coalesce((
                  SELECT jsonb_agg(jsonb_build_object(
                      'option_key', o.option_key, 'display_order', o.display_order,
                      'label_sv', o.label_sv, 'label_en', o.label_en)
                    ORDER BY o.display_order, o.option_key)
                    FROM public.beskt_item_options o WHERE o.item_id = i.id), '[]'::jsonb))
              ORDER BY i.display_order, i.item_key)
              FROM public.beskt_items i
              JOIN public.beskt_exposure_profiles pp ON pp.id = i.exposure_profile_id
             WHERE i.section_id = s.id), '[]'::jsonb))
        ORDER BY s.display_order, s.section_key)
        FROM public.beskt_sections s WHERE s.method_version_id = _v.id), '[]'::jsonb),
    'prompts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'prompt_key', pr.prompt_key, 'display_order', pr.display_order,
          'exposure_profile_key', pp.profile_key, 'item_key', i.item_key,
          'prompt_kind', pr.prompt_kind, 'peace_stage', pr.peace_stage, 'addressee', pr.addressee,
          'question_form', pr.question_form,
          'permitted_probe_bases', to_jsonb(pr.permitted_probe_bases),
          'evaluation_template_key', pr.evaluation_template_key,
          'permitted_mode', pr.permitted_mode,
          'wording_sv', pr.wording_sv, 'wording_en', pr.wording_en,
          'content_provenance', pr.content_provenance, 'source_reference', pr.source_reference)
        ORDER BY pr.display_order, pr.prompt_key)
        FROM public.beskt_prompts pr
        JOIN public.beskt_exposure_profiles pp ON pp.id = pr.exposure_profile_id
        LEFT JOIN public.beskt_items i ON i.id = pr.item_id
       WHERE pr.method_version_id = _v.id), '[]'::jsonb),
    'routing_rules', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'rule_key', r.rule_key, 'evaluation_order', r.evaluation_order,
          'applies_mode', r.applies_mode, 'source_item_key', si.item_key,
          'condition_kind', r.condition_kind, 'condition_option_key', o.option_key,
          'condition_boolean', r.condition_boolean, 'action', r.action,
          'target_item_key', ti.item_key)
        ORDER BY r.evaluation_order, r.rule_key)
        FROM public.beskt_routing_rules r
        JOIN public.beskt_items si ON si.id = r.source_item_id
        JOIN public.beskt_items ti ON ti.id = r.target_item_id
        LEFT JOIN public.beskt_item_options o ON o.id = r.condition_option_id
       WHERE r.method_version_id = _v.id), '[]'::jsonb),
    'evidence_anchors', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'evidence_state', a.evidence_state,
          'definition_sv', a.definition_sv, 'definition_en', a.definition_en,
          'inclusion_criteria_sv', a.inclusion_criteria_sv, 'inclusion_criteria_en', a.inclusion_criteria_en,
          'exclusion_criteria_sv', a.exclusion_criteria_sv, 'exclusion_criteria_en', a.exclusion_criteria_en,
          'supporting_evidence_examples_sv', a.supporting_evidence_examples_sv,
          'supporting_evidence_examples_en', a.supporting_evidence_examples_en,
          'counter_evidence_and_protective_factors_sv', a.counter_evidence_and_protective_factors_sv,
          'counter_evidence_and_protective_factors_en', a.counter_evidence_and_protective_factors_en,
          'prohibited_inferences', to_jsonb(a.prohibited_inferences),
          'required_next_action', a.required_next_action)
        ORDER BY a.evidence_state)
        FROM public.beskt_evidence_anchors a WHERE a.method_version_id = _v.id), '[]'::jsonb),
    'observation_fields', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'field_key', f.field_key, 'ordinal', f.ordinal, 'recorded_by', f.recorded_by,
          'is_judgement', f.is_judgement, 'label_sv', f.label_sv, 'label_en', f.label_en,
          'definition_sv', f.definition_sv, 'definition_en', f.definition_en)
        ORDER BY f.ordinal)
        FROM public.beskt_observation_fields f WHERE f.method_version_id = _v.id), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_published_method(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_published_method(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.beskt_published_method(uuid) IS
  'The narrow governed read contract for one PUBLISHED BESKT method version '
  'under release_scope = synthetic_internal_only. Refuses drafts, suspended '
  'and retired versions; refuses every caller without a governance role or '
  'an explicit internal-QA grant; refuses an internal-QA reader any version '
  'holding a row outside their access classes rather than returning a part '
  'of it. Returns no candidate, no score and no start capability.';
CREATE OR REPLACE FUNCTION public.beskt_readable_published_versions()
RETURNS TABLE (
  method_version_id uuid,
  pack_id uuid,
  pack_slug text,
  name_sv text,
  name_en text,
  version_number integer,
  mode text,
  validation_label text,
  release_scope text,
  content_hash text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, p.id, p.slug, p.name_sv, p.name_en, v.version_number, v.mode,
         v.validation_label, v.release_scope, v.content_hash
    FROM public.beskt_method_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE p.pack_kind = 'beskt_method'
     AND v.content_status = 'published'
     AND public.beskt_can_read_version(v.id)
   ORDER BY p.slug, v.version_number DESC;
$$;

REVOKE ALL ON FUNCTION public.beskt_readable_published_versions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_readable_published_versions() TO authenticated, service_role;

COMMENT ON FUNCTION public.beskt_readable_published_versions() IS
  'The published BESKT method versions the caller may read, and nothing '
  'else: never a draft, never a suspended or retired version, never '
  'security-vetting content to internal QA, nothing at all to an employer '
  'principal, a candidate or a roleless user. A listing, not a '
  'start selector: no scp_iv_* start path accepts a BESKT version.';

-- ---------------------------------------------------------------------------
-- 3. Drop the PR 3 domain: child-first, in an explicit order, no CASCADE.
-- ---------------------------------------------------------------------------

-- Read models and mutations first: nothing may reference a table being dropped.
DROP FUNCTION IF EXISTS public.bcp_employer_readback(uuid);
DROP FUNCTION IF EXISTS public.bcp_employer_assignments(uuid);
DROP FUNCTION IF EXISTS public.bcp_candidate_preparation(uuid);
DROP FUNCTION IF EXISTS public.bcp_candidate_assignments();
DROP FUNCTION IF EXISTS public.bcp_assignable_method_versions(uuid);
DROP FUNCTION IF EXISTS public.bcp_assignable_exposure_profiles(uuid, uuid);

DROP FUNCTION IF EXISTS public.bcp_cancel(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.bcp_submit(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.bcp_save_answers(uuid, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.bcp_acknowledge_notice(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.bcp_mark_opened(uuid, uuid);
DROP FUNCTION IF EXISTS public.bcp_assign(uuid, uuid, uuid, uuid, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.bcp_revoke_pilot(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.bcp_grant_pilot(uuid, uuid, uuid, text, date);

DROP FUNCTION IF EXISTS public.bcp_visible_items(uuid, uuid);
DROP FUNCTION IF EXISTS public.bcp_routing_answers(uuid);
DROP FUNCTION IF EXISTS public.bcp_answers_content_hash(uuid);
DROP FUNCTION IF EXISTS public.bcp_canonical_answers(uuid);
DROP FUNCTION IF EXISTS public.bcp_notice_hash(uuid);
DROP FUNCTION IF EXISTS public.bcp_notice_descriptor(uuid);
DROP FUNCTION IF EXISTS public.bcp_notice_sections();
DROP FUNCTION IF EXISTS public.bcp_notice_version();
DROP FUNCTION IF EXISTS public.bcp_operation_begin(uuid, text);
DROP FUNCTION IF EXISTS public.bcp_record_event(uuid, uuid, uuid, uuid, text, text, text, text, text, integer, uuid, text, jsonb, jsonb);

DROP FUNCTION IF EXISTS public.bcp_party_can_read_method_version(uuid);
DROP FUNCTION IF EXISTS public.bcp_employer_can_read_assignment(uuid);
DROP FUNCTION IF EXISTS public.bcp_is_assignment_candidate(uuid);
DROP FUNCTION IF EXISTS public.bcp_version_is_candidate_safe(uuid);
DROP FUNCTION IF EXISTS public.bcp_pilot_grant_active(uuid, uuid);

-- Tables, child-first. No CASCADE anywhere: an unexpected dependant must
-- stop the rollback, not be silently destroyed with it.
DROP TABLE IF EXISTS public.bcp_answers;
DROP TABLE IF EXISTS public.bcp_events;
DROP TABLE IF EXISTS public.bcp_notice_acknowledgements;
DROP TABLE IF EXISTS public.bcp_responses;
DROP TABLE IF EXISTS public.bcp_assignments;
DROP TABLE IF EXISTS public.bcp_pilot_grants;

-- The guards go with the tables they guarded.
DROP FUNCTION IF EXISTS public.bcp_guard_answer();
DROP FUNCTION IF EXISTS public.bcp_guard_response();
DROP FUNCTION IF EXISTS public.bcp_guard_assignment();
DROP FUNCTION IF EXISTS public.bcp_guard_pilot_grants();
DROP FUNCTION IF EXISTS public.bcp_guard_append_only();

-- The internal governance predicate existed only to keep the full governed
-- document gated while the read contract was widened. With the widening
-- gone, PR #218's own beskt_can_read_version is the decision again.
DROP FUNCTION IF EXISTS public.beskt_governance_can_read_version(uuid);


-- ---------------------------------------------------------------------------
-- 4. Prove the database is back where PR #218 left it.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  _n integer;
  _src text;
BEGIN
  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'bcp\_%' ESCAPE '\';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_ROLLBACK: % bcp_ table(s) survive.', _n;
  END IF;
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'bcp\_%' ESCAPE '\';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_ROLLBACK: % bcp_ function(s) survive.', _n;
  END IF;
  IF to_regprocedure('public.beskt_governance_can_read_version(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_ROLLBACK: the PR 3 governance predicate survives.';
  END IF;

  -- The PR #218 read contract is PR #218's again, exactly.
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'beskt_can_read_version';
  IF _src IS NULL OR position('scp_interview_can_read' in _src) = 0
     OR position('internal_qa' in _src) = 0 THEN
    RAISE EXCEPTION 'BCP_ROLLBACK: beskt_can_read_version was not restored to the PR #218 decision.';
  END IF;
  IF _src ~* '\mbcp_' OR position('beskt_governance_can_read_version' in _src) > 0 THEN
    RAISE EXCEPTION 'BCP_ROLLBACK: beskt_can_read_version still names PR 3.';
  END IF;

  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'beskt_published_method';
  IF _src IS NULL OR position('beskt_can_read_version' in _src) = 0
     OR position('beskt_governance_can_read_version' in _src) > 0 THEN
    RAISE EXCEPTION 'BCP_ROLLBACK: beskt_published_method was not restored.';
  END IF;

  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'beskt_readable_published_versions';
  IF _src IS NULL OR position('beskt_can_read_version' in _src) = 0
     OR position('beskt_governance_can_read_version' in _src) > 0 THEN
    RAISE EXCEPTION 'BCP_ROLLBACK: beskt_readable_published_versions was not restored.';
  END IF;

  -- PR #218's own domain is untouched: thirteen tables, pack_kind present.
  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'beskt\_%' ESCAPE '\';
  IF _n <> 13 THEN
    RAISE EXCEPTION 'BCP_ROLLBACK: the PR #218 domain has % tables, expected 13.', _n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'scp_interview_packs'
                    AND column_name = 'pack_kind') THEN
    RAISE EXCEPTION 'BCP_ROLLBACK: the PR #218 discriminator was disturbed.';
  END IF;

  RAISE NOTICE 'BESKT_CANDIDATE_PREPARATION_ROLLBACK ok';
END
$verify$;
