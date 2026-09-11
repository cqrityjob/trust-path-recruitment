-- Rollback for 20261108090000_beskt_governed_method_content.
--
-- Reverses BESKT PR 2 completely and restores the role-interview flow to
-- the exact functions PR 1's head defined:
--
--   * drops the two guard triggers this migration attached to the existing
--     role-interview identity and version tables;
--   * drops the twelve beskt_* tables child-first (every FK inside the domain
--     is ON DELETE RESTRICT) and every beskt_* function;
--   * removes the BESKT method identities from scp_interview_packs (they
--     carry no versions once the domain is dropped), restores role_id NOT
--     NULL and drops the additive pack_kind column with its two constraints
--     and its index;
--   * restores scp_interview_create_version, scp_interview_pack_validate,
--     scp_iv_case_start_basis, scp_iv_startable_pack_versions and
--     scp_iv_create_case VERBATIM from 20260918090000 / 20260926090000,
--     grants included.
--
-- WHAT IS LOST: every BESKT method version, its content, reviews and events.
-- PR 2 seeds no method content and authorises synthetic, internal-only
-- content, so this destroys nothing that reached a candidate. Before running
-- it in anger against authored content, export the domain:
--
--   \copy (SELECT * FROM public.beskt_method_versions) TO 'beskt_versions.csv' CSV HEADER
--   \copy (SELECT * FROM public.beskt_method_events)   TO 'beskt_events.csv'   CSV HEADER
--
-- It refuses to run if anything outside the BESKT domain has grown a
-- dependency on it, or if a BESKT version is currently published.
--
-- Run inside the caller's transaction.

DO $$
DECLARE _offender text; _n integer;
BEGIN
  SELECT string_agg(DISTINCT c.relname, ', ') INTO _offender
    FROM pg_constraint con
    JOIN pg_class c  ON c.oid  = con.conrelid
    JOIN pg_class rc ON rc.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE con.contype = 'f' AND n.nspname = 'public'
     AND rc.relname LIKE 'beskt\_%' ESCAPE '\'
     AND c.relname NOT LIKE 'beskt\_%' ESCAPE '\';
  IF _offender IS NOT NULL THEN
    RAISE EXCEPTION 'BESKT_ROLLBACK BLOCKED: % now references the BESKT domain. Reconcile that dependency first.', _offender;
  END IF;
  IF to_regclass('public.beskt_method_versions') IS NOT NULL THEN
    SELECT count(*) INTO _n FROM public.beskt_method_versions WHERE content_status = 'published';
    IF _n > 0 THEN
      RAISE EXCEPTION 'BESKT_ROLLBACK BLOCKED: % published BESKT method version(s) exist. Retire them under governance before rolling the schema back.', _n;
    END IF;
  END IF;
END $$;

-- 1. The guards this migration attached to existing tables.
DROP TRIGGER IF EXISTS scp_interview_packs_kind_immutable ON public.scp_interview_packs;
DROP TRIGGER IF EXISTS scp_interview_pack_versions_role_interview_only ON public.scp_interview_pack_versions;

-- 2. The domain, child-first. beskt_lock_version returns the version row
--    type, so it goes before the table it depends on.
DROP FUNCTION IF EXISTS public.beskt_lock_version(uuid, integer);
DROP TABLE IF EXISTS public.beskt_method_events           CASCADE;
DROP TABLE IF EXISTS public.beskt_method_reviews          CASCADE;
DROP TABLE IF EXISTS public.beskt_routing_rules           CASCADE;
DROP TABLE IF EXISTS public.beskt_prompts                 CASCADE;
DROP TABLE IF EXISTS public.beskt_item_options            CASCADE;
DROP TABLE IF EXISTS public.beskt_items                   CASCADE;
DROP TABLE IF EXISTS public.beskt_sections                CASCADE;
DROP TABLE IF EXISTS public.beskt_observation_fields      CASCADE;
DROP TABLE IF EXISTS public.beskt_evidence_anchors        CASCADE;
DROP TABLE IF EXISTS public.beskt_activation_requirements CASCADE;
DROP TABLE IF EXISTS public.beskt_exposure_profiles       CASCADE;
DROP TABLE IF EXISTS public.beskt_method_versions         CASCADE;

-- 3. Every beskt_* function.
DROP FUNCTION IF EXISTS public.beskt_readable_published_versions();
DROP FUNCTION IF EXISTS public.beskt_published_method(uuid);
DROP FUNCTION IF EXISTS public.beskt_retire_version(uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.beskt_suspend_version(uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.beskt_publish_version(uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.beskt_record_review(uuid, uuid, integer, text, text, text);
DROP FUNCTION IF EXISTS public.beskt_submit_for_review(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.beskt_touch_draft(uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.beskt_create_method_version(uuid, uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.beskt_create_method(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.beskt_operation_begin(uuid, text);
DROP FUNCTION IF EXISTS public.beskt_record_event(uuid, uuid, text, text, text, text, text, integer, uuid, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.beskt_request_hash(jsonb);
DROP FUNCTION IF EXISTS public.beskt_resolve_item_sequence(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.beskt_can_read_version(uuid);
DROP FUNCTION IF EXISTS public.beskt_method_validate(uuid, boolean);
DROP FUNCTION IF EXISTS public.beskt_method_content_hash(uuid);
DROP FUNCTION IF EXISTS public.beskt_canonical_content(uuid);
DROP FUNCTION IF EXISTS public.beskt_sorted_array_text(text[]);
DROP FUNCTION IF EXISTS public.beskt_text_claims_deception_cue(text);
DROP FUNCTION IF EXISTS public.beskt_wording_is_neutral(text);
DROP FUNCTION IF EXISTS public.beskt_prompt_stage(text);
DROP FUNCTION IF EXISTS public.beskt_guard_review_insert();
DROP FUNCTION IF EXISTS public.beskt_guard_events_append_only();
DROP FUNCTION IF EXISTS public.beskt_guard_reviews_append_only();
DROP FUNCTION IF EXISTS public.beskt_guard_child_row();
DROP FUNCTION IF EXISTS public.beskt_guard_version_no_delete();
DROP FUNCTION IF EXISTS public.beskt_guard_version_transition();
DROP FUNCTION IF EXISTS public.beskt_guard_version_insert();
DROP FUNCTION IF EXISTS public.beskt_guard_role_interview_version();
DROP FUNCTION IF EXISTS public.beskt_guard_pack_kind_immutable();

-- 4. The additive discriminator comes off the identity table. BESKT
--    identities carry no versions any more and cannot satisfy the restored
--    NOT NULL, so they are removed first.
DELETE FROM public.scp_interview_packs WHERE pack_kind = 'beskt_method';
ALTER TABLE public.scp_interview_packs DROP CONSTRAINT IF EXISTS scp_interview_packs_role_by_kind_check;
ALTER TABLE public.scp_interview_packs ALTER COLUMN role_id SET NOT NULL;
DROP INDEX IF EXISTS public.scp_interview_packs_pack_kind_idx;
ALTER TABLE public.scp_interview_packs DROP COLUMN IF EXISTS pack_kind;

-- 5. The five old-flow functions, exactly as PR 1's head defined them.
CREATE OR REPLACE FUNCTION public.scp_interview_create_version(
  _pack_id uuid,
  _locale text,
  _role_version_id uuid,
  _source_reference text,
  _source_document_version text,
  _summary_sv text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _next integer;
  _is_first boolean;
BEGIN
  IF NOT public.scp_interview_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_EDITOR: creating a pack version requires the platform content editor role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scp_interview_packs p WHERE p.id = _pack_id) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_PACK_NOT_FOUND: no such pack.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scp_role_versions r WHERE r.id = _role_version_id) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_ROLE_VERSION_NOT_FOUND: the pinned role version does not exist.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- One open draft at a time. Two concurrent drafts of the same pack is how a
  -- reviewer ends up approving the one that never ships.
  IF EXISTS (
    SELECT 1 FROM public.scp_interview_pack_versions v
     WHERE v.pack_id = _pack_id
       AND v.content_status IN ('draft', 'expert_review', 'legal_review', 'cognitive_review')) THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_OPEN_VERSION_EXISTS: this pack already has a version in draft or review. Finish or retire it before starting another.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(max(v.version_number), 0) + 1,
         count(*) = 0
    INTO _next, _is_first
    FROM public.scp_interview_pack_versions v WHERE v.pack_id = _pack_id;

  INSERT INTO public.scp_interview_pack_versions
    (pack_id, version_number, content_status, locale, role_version_id,
     source_reference, source_document_version, summary_sv, created_by)
  VALUES
    (_pack_id, _next, 'draft', _locale, _role_version_id,
     _source_reference, _source_document_version, _summary_sv, auth.uid())
  RETURNING id INTO _id;

  UPDATE public.scp_interview_pack_versions
     SET content_hash = public.scp_interview_pack_content_hash(_id)
   WHERE id = _id;

  PERFORM public.scp_interview_record_event(
    _pack_id, _id,
    CASE WHEN _is_first THEN 'version_created' ELSE 'new_version_created' END,
    NULL, 'draft', NULL, public.scp_interview_pack_content_hash(_id),
    jsonb_build_object('version_number', _next, 'source_document_version', _source_document_version));

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_create_version(uuid, text, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_create_version(uuid, text, uuid, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.scp_interview_pack_validate(_pack_version_id uuid)
RETURNS TABLE (code text, severity text, message text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v public.scp_interview_pack_versions%ROWTYPE;
  _hash text;
  _gate text;
BEGIN
  SELECT * INTO _v FROM public.scp_interview_pack_versions WHERE id = _pack_version_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'VERSION_NOT_FOUND'::text, 'blocking'::text,
      'The pack version does not exist.'::text;
    RETURN;
  END IF;

  -- The pinned role version must still resolve.
  IF NOT EXISTS (SELECT 1 FROM public.scp_role_versions r WHERE r.id = _v.role_version_id) THEN
    RETURN QUERY SELECT 'ROLE_VERSION_MISSING'::text, 'blocking'::text,
      'The pinned role version no longer exists.'::text;
  END IF;

  -- ---- competencies -------------------------------------------------------
  IF (SELECT count(*) FROM public.scp_interview_pack_competencies c
       WHERE c.pack_version_id = _pack_version_id) = 0 THEN
    RETURN QUERY SELECT 'NO_COMPETENCIES'::text, 'blocking'::text,
      'The pack defines no competencies.'::text;
  END IF;

  RETURN QUERY
    SELECT 'COMPETENCY_WITHOUT_INDICATORS', 'blocking',
           format('Competency %s has no observable indicators.', c.code)
      FROM public.scp_interview_pack_competencies c
     WHERE c.pack_version_id = _pack_version_id
       AND coalesce(array_length(c.observable_indicators_sv, 1), 0) = 0;

  RETURN QUERY
    SELECT 'COMPETENCY_UNMAPPED', 'blocking',
           format('Competency %s is not mapped to any canonical competency version.', c.code)
      FROM public.scp_interview_pack_competencies c
     WHERE c.pack_version_id = _pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_pack_competency_map m
                        WHERE m.pack_competency_id = c.id);

  -- The ambiguity gate. A provisional mapping is an unconfirmed scientific
  -- claim, and an unconfirmed scientific claim does not get published.
  RETURN QUERY
    SELECT 'COMPETENCY_MAPPING_PROVISIONAL', 'blocking',
           format('The mapping from %s to canonical competency versions is still provisional and must be confirmed by expert review.', c.code)
      FROM public.scp_interview_pack_competencies c
     WHERE c.pack_version_id = _pack_version_id
       AND EXISTS (SELECT 1 FROM public.scp_interview_pack_competency_map m
                    WHERE m.pack_competency_id = c.id AND m.mapping_state = 'provisional');

  -- ---- questions ----------------------------------------------------------
  IF (SELECT count(*) FROM public.scp_interview_core_questions q
       WHERE q.pack_version_id = _pack_version_id) = 0 THEN
    RETURN QUERY SELECT 'NO_QUESTIONS'::text, 'blocking'::text,
      'The pack defines no core questions.'::text;
  END IF;

  -- display_order must be a gapless 1..n.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT q.display_order,
             row_number() OVER (ORDER BY q.display_order) AS expected
        FROM public.scp_interview_core_questions q
       WHERE q.pack_version_id = _pack_version_id) t
     WHERE t.display_order <> t.expected) THEN
    RETURN QUERY SELECT 'QUESTION_ORDER_NOT_CONTIGUOUS'::text, 'blocking'::text,
      'Core question display_order must run 1..n with no gaps and no duplicates.'::text;
  END IF;

  RETURN QUERY
    SELECT 'QUESTION_WITHOUT_COMPETENCY', 'blocking',
           format('Question %s is not linked to any competency.', q.code)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_question_competencies qc
                        WHERE qc.question_id = q.id);

  RETURN QUERY
    SELECT 'QUESTION_WITHOUT_PRIMARY_COMPETENCY', 'blocking',
           format('Question %s has no primary competency.', q.code)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_question_competencies qc
                        WHERE qc.question_id = q.id AND qc.is_primary);

  RETURN QUERY
    SELECT 'QUESTION_WITHOUT_EVIDENCE_DIMENSION', 'blocking',
           format('Question %s defines no evidence dimensions.', q.code)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_evidence_dimensions d
                        WHERE d.question_id = q.id);

  RETURN QUERY
    SELECT 'QUESTION_WITHOUT_PROBE', 'blocking',
           format('Question %s has no approved probes, so an interviewer has no permitted way to follow up.', q.code)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_approved_probes p
                        WHERE p.question_id = q.id);

  -- Every question needs the complete 0..4 anchor set. Five rows, levels 0-4.
  RETURN QUERY
    SELECT 'QUESTION_ANCHOR_SET_INCOMPLETE', 'blocking',
           format('Question %s must define exactly one anchor for each level 0,1,2,3,4 (found %s).',
                  q.code,
                  (SELECT count(*) FROM public.scp_interview_rating_anchors a WHERE a.question_id = q.id))
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _pack_version_id
       AND (SELECT count(DISTINCT a.level) FROM public.scp_interview_rating_anchors a
             WHERE a.question_id = q.id) <> 5;

  -- ---- verification and prohibitions --------------------------------------
  IF (SELECT count(*) FROM public.scp_interview_verification_rules r
       WHERE r.pack_version_id = _pack_version_id) = 0 THEN
    RETURN QUERY SELECT 'NO_VERIFICATION_RULES'::text, 'blocking'::text,
      'The pack states no verification boundaries, so nothing distinguishes an interview statement from a verified fact.'::text;
  END IF;

  IF (SELECT count(*) FROM public.scp_interview_prohibited_areas p
       WHERE p.pack_version_id = _pack_version_id) = 0 THEN
    RETURN QUERY SELECT 'NO_PROHIBITED_AREAS'::text, 'blocking'::text,
      'The pack states no prohibited areas.'::text;
  END IF;

  -- ---- review gates, bound to the current content hash --------------------
  _hash := public.scp_interview_pack_content_hash(_pack_version_id);

  FOREACH _gate IN ARRAY ARRAY['expert', 'legal', 'cognitive', 'product'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.scp_interview_pack_reviews rv
       WHERE rv.pack_version_id = _pack_version_id
         AND rv.gate = _gate
         AND rv.decision = 'approved'
         AND rv.content_hash_at_review = _hash) THEN
      RETURN QUERY SELECT
        ('REVIEW_GATE_' || upper(_gate) || '_NOT_APPROVED')::text,
        'blocking'::text,
        format('The %s review gate has not been approved for the current content. If it was approved earlier, the content has changed since and must be reviewed again.', _gate);
    END IF;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_pack_validate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_pack_validate(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_interview_pack_validate(uuid) IS
  'Every reason this pack version cannot be published, as rows. Empty means '
  'publishable. Called by the publish RPC inside the publishing transaction, '
  'and by the admin UI to show a publisher the blocking reasons before they '
  'try.';

CREATE OR REPLACE FUNCTION public.scp_iv_case_start_basis(
  _employer_id uuid, _pack_version_id uuid, _user_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status text;
  _who uuid := coalesce(_user_id, auth.uid());
BEGIN
  -- Starting anything requires an ACTIVE employer, on every path. This is the
  -- half that continuity read access deliberately does NOT carry.
  IF NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RETURN NULL;
  END IF;

  SELECT content_status INTO _status
    FROM public.scp_interview_pack_versions WHERE id = _pack_version_id;
  IF _status IS NULL THEN
    RETURN NULL;
  END IF;

  -- Strongest basis first, so the audit trail records the real reason.
  IF _status = 'published' THEN
    RETURN 'published';
  END IF;
  IF public.scp_iv_open_pilot_available(_pack_version_id) THEN
    RETURN 'open_pilot';
  END IF;
  IF public.scp_interview_pilot_grant_active(_employer_id, _pack_version_id, _who) THEN
    RETURN 'pilot_grant';
  END IF;

  RETURN NULL;
END; $$;

-- INTERNAL: it answers for an arbitrary (employer, version) pair without
-- checking that the caller belongs to that employer. The membership check
-- lives in the two callers below, both SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.scp_iv_case_start_basis(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scp_iv_case_start_basis(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.scp_iv_case_start_basis(uuid, uuid, uuid) IS
  'INTERNAL and AUTHORITATIVE: the single answer to "can this employer start '
  'a NEW case with this pack version now?". Returns published / open_pilot / '
  'pilot_grant, or NULL. Requires an ACTIVE employer on every path -- unlike '
  'the read entitlement, whose pinned-case branch is continuity access to '
  'existing work and never permission to start. Both scp_iv_create_case() '
  'and scp_iv_startable_pack_versions() call this, so the button and the '
  'list cannot disagree.';

CREATE OR REPLACE FUNCTION public.scp_iv_startable_pack_versions(_employer_id uuid)
RETURNS TABLE (
  pack_version_id uuid,
  pack_id uuid,
  pack_slug text,
  name_sv text,
  name_en text,
  version_number integer,
  content_status text,
  validation_label text,
  locale text,
  entitlement_basis text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Membership and employer status first: a non-member learns nothing, and a
  -- suspended employer's members see an empty list rather than a list they
  -- cannot act on. Candidates hold no membership and so enumerate nothing.
  IF NOT public.scp_iv_employer_can_start_interviews(_employer_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT v.id, p.id, p.slug, p.name_sv, p.name_en, v.version_number,
           v.content_status, v.validation_label, v.locale, b.basis
      FROM public.scp_interview_pack_versions v
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
      CROSS JOIN LATERAL public.scp_iv_case_start_basis(_employer_id, v.id, auth.uid()) AS b(basis)
     WHERE b.basis IS NOT NULL
     ORDER BY p.name_sv, v.version_number DESC;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_startable_pack_versions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_startable_pack_versions(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_iv_startable_pack_versions(uuid) IS
  'The pack versions this employer can start a NEW interview with right now, '
  'and nothing else. Shares scp_iv_case_start_basis() with '
  'scp_iv_create_case(), so a version offered here is a version the create '
  'call accepts unless the state changed in between. Returns no rows for a '
  'non-member, for an inactive employer, and for anyone holding only '
  'continuity read access to a withdrawn version.';

CREATE OR REPLACE FUNCTION public.scp_iv_create_case(
  _employer_id uuid, _title text, _pack_version_id uuid, _candidate_display_name text,
  _candidate_user_id uuid DEFAULT NULL, _candidate_external_ref text DEFAULT NULL,
  _job_id uuid DEFAULT NULL, _application_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _pack public.scp_interview_pack_versions%ROWTYPE;
  _method_id uuid;
  _usage text;
  _basis text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner','admin','member']) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_EMPLOYER_MEMBER: creating an interview case requires an active membership of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RAISE EXCEPTION 'SCP_IV_EMPLOYER_NOT_ACTIVE: this employer account is not active, so it cannot start interviews.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _pack FROM public.scp_interview_pack_versions WHERE id = _pack_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_PACK_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  -- The authoritative decision, shared with the list.
  _basis := public.scp_iv_case_start_basis(_employer_id, _pack_version_id, auth.uid());

  IF _basis IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_PACK_NOT_USABLE: pack version is "%" and is neither published, openly available for pilot use, nor covered by a live pilot grant for you.',
      _pack.content_status USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _job_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_IV_CROSS_TENANT_JOB: that job belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _application_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.job_applications a
        WHERE a.id = _application_id AND a.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_IV_CROSS_TENANT_APPLICATION: that application belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _usage := CASE WHEN _pack.content_status = 'published' THEN 'production' ELSE 'internal_qa' END;
  _method_id := public.scp_trust_eligible_method(_usage);

  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_external_ref,
     candidate_display_name, pack_version_id, role_version_id, pack_content_hash, title,
     created_by, trust_method_id)
  VALUES
    (_employer_id, _job_id, _application_id, _candidate_user_id, _candidate_external_ref,
     _candidate_display_name, _pack_version_id, _pack.role_version_id, _pack.content_hash,
     _title, auth.uid(), _method_id)
  RETURNING id INTO _id;

  PERFORM public.scp_iv_record_event(_id, 'case_created', 'human', NULL, NULL, 'draft', NULL,
    jsonb_build_object('pack_version_id', _pack_version_id,
                       'pack_content_status', _pack.content_status,
                       'validation_label', _pack.validation_label,
                       'trust_method_version',
                         (SELECT version_number FROM public.scp_interview_methods WHERE id = _method_id),
                       'trust_usage_mode', _usage,
                       'entitlement_basis', _basis,
                       'used_pilot_grant', _basis = 'pilot_grant'));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid) IS
  'Creates an interview case for an ACTIVE employer. The entitlement decision '
  'comes from scp_iv_case_start_basis(), the same function that builds the '
  'selector on the new-interview screen, so a pack that is offered is a pack '
  'that can be started. Pins the pack version, its content hash and the '
  'eligible CQrity TRUST method version, and records which basis admitted it.';


-- 6. Proof.
DO $rb$
DECLARE _n integer; _src text; _fn text;
BEGIN
  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname LIKE 'beskt\_%' ESCAPE '\';
  IF _n <> 0 THEN RAISE EXCEPTION 'BESKT_ROLLBACK: % beskt_ relation(s) survived', _n; END IF;
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'beskt\_%' ESCAPE '\';
  IF _n <> 0 THEN RAISE EXCEPTION 'BESKT_ROLLBACK: % beskt_ function(s) survived', _n; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'scp_interview_packs' AND column_name = 'pack_kind') THEN
    RAISE EXCEPTION 'BESKT_ROLLBACK: pack_kind survived';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'scp_interview_packs'
                    AND column_name = 'role_id' AND is_nullable = 'NO') THEN
    RAISE EXCEPTION 'BESKT_ROLLBACK: role_id is not NOT NULL again';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('scp_interview_packs_kind_immutable',
                                                       'scp_interview_pack_versions_role_interview_only')) THEN
    RAISE EXCEPTION 'BESKT_ROLLBACK: a pack-kind guard trigger survived';
  END IF;
  FOREACH _fn IN ARRAY ARRAY['scp_iv_case_start_basis', 'scp_iv_startable_pack_versions', 'scp_iv_create_case',
                             'scp_interview_pack_validate', 'scp_interview_create_version'] LOOP
    SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = _fn;
    IF _n <> 1 THEN RAISE EXCEPTION 'BESKT_ROLLBACK: % is not exactly one function', _fn; END IF;
    SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = _fn;
    IF position('pack_kind' in _src) > 0 THEN
      RAISE EXCEPTION 'BESKT_ROLLBACK: % still names pack_kind', _fn;
    END IF;
  END LOOP;
  IF position('scp_iv_case_start_basis' in (SELECT prosrc FROM pg_proc WHERE proname = 'scp_iv_create_case')) = 0 THEN
    RAISE EXCEPTION 'BESKT_ROLLBACK: scp_iv_create_case lost the shared start contract';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.scp_iv_case_start_basis(uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'BESKT_ROLLBACK: the restored grants are not PR 1''s';
  END IF;
  RAISE NOTICE 'BESKT_GOVERNED_CONTENT_ROLLBACK ok';
END $rb$;
