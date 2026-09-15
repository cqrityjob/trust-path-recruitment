-- ============================================================================
-- BESKT PR 7 -- the governed way to AUTHOR method content
-- ============================================================================
--
-- ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
--
-- 20261108090000 built the whole governed LIFECYCLE of a BESKT method: create
-- a method, create a version, submit it to the five gates, record each gate's
-- decision, publish, suspend, retire, grant and revoke a pilot. Ten RPCs, all
-- SECURITY DEFINER, all reachable by an authorised human from a browser.
--
-- It built no way to author the CONTENT those RPCs move through.
--
-- beskt_exposure_profiles, beskt_sections, beskt_items, beskt_item_options,
-- beskt_prompts and beskt_routing_rules grant `authenticated` SELECT and
-- nothing else; ALL goes to service_role. No function in any migration inserts
-- a row into any of them. beskt_touch_draft only recomputes the content hash
-- and advances the revision -- it writes no content. The database suite's own
-- fixture builds method content by dropping OUT of the authenticated role and
-- writing as the table owner, which is precisely the admission that no client
-- path exists.
--
-- So today a theme, a question, an option, a purpose, a prompt, a routing rule
-- or an exposure profile can only be created two ways: as service_role, which
-- must never reach a browser, or inside a migration, which is exactly how
-- production content must NOT be seeded. A human with the platform content
-- editor role -- the role beskt_touch_draft already demands -- cannot author a
-- single word of a method.
--
-- ── WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT ───────────────────────
--
-- Nine governed doors and nothing else:
--
--   beskt_author_exposure_profile      documented role relevance
--   beskt_author_section               the phases content is grouped into
--   beskt_author_item                  a question, its purpose, and its options
--   beskt_author_prompt                a governed interviewer wording
--   beskt_author_routing_rule          deterministic questionnaire branching
--   beskt_author_evidence_anchor       one of the seven evidence states
--   beskt_author_observation_field     one of the ten observation definitions
--   beskt_author_activation_requirement a security-vetting activation statement
--   beskt_delete_content               removing one authored row, by family and key
--
-- The last three are not optional extras: beskt_method_validate() requires all
-- seven evidence anchors and all ten observation fields on EVERY version, and
-- all three activation requirements on a security-vetting one. Without them a
-- human could author content that can never be submitted, which is not an
-- authoring surface.
--
-- They are DOORS, not law. Every content invariant already lives in
-- beskt_guard_child_row(), which fires on INSERT, UPDATE and DELETE for all
-- six tables and holds against the table owner -- and therefore against these
-- functions, which run as the owner. Draft-only editing, no re-parenting, same
-- version references, the exposure-profile boundary, the PEACE stage binding,
-- the Evaluation template, routing direction, mode escalation: none of it is
-- restated here, because restating it would create a second place for it to be
-- wrong. What this migration adds is the authorisation, the concurrency
-- contract and the audit trail in front of that law:
--
--   1. auth.uid() must exist.
--   2. The caller must hold the platform content editor role -- the SAME
--      scp_interview_can_edit() that beskt_touch_draft demands. No new role,
--      no new grant table.
--   3. The operation id is answered for replay BEFORE any write, through the
--      existing beskt_operation_begin().
--   4. The version is locked with the revision the caller was looking at,
--      through the existing beskt_lock_version(), so two editors cannot
--      silently overwrite one another.
--   5. Only a draft or in-review version is editable, refused by name.
--   6. The content hash is recomputed and the revision advanced, exactly as
--      beskt_touch_draft does, so the stored hash always names the stored
--      bytes.
--   7. An event is appended to the existing ledger.
--
-- ── WHY THE PAYLOADS ARE jsonb, AND WHY THAT IS NOT A BLOB ──────────────────
--
-- An item carries twenty governed columns. A twenty-argument signature would
-- be unreadable and every added column would break every caller. So each door
-- takes one jsonb payload -- and then REFUSES ANY KEY IT DOES NOT KNOW.
-- beskt_content_reject_unknown_keys() is the reason this is a typed contract
-- rather than a blob: a misspelled `purpose_sv` is not silently dropped on the
-- floor, it is refused by name, and a governed field can never be quietly
-- omitted by a typo. Every column is then read out by name with an explicit
-- cast. Nothing is stored as jsonb; the destination is the same typed column
-- it always was.
--
-- ── WHAT IS NOT REPRESENTABLE ───────────────────────────────────────────────
--
-- No door writes beskt_method_versions' content columns, beskt_method_reviews,
-- beskt_method_events or beskt_governance_grants -- authoring content is not
-- approving it, and an editor cannot review, publish or grant. No door accepts
-- a score, a weight, a threshold, a rank or a verdict, because no such column
-- exists to put one in. The postflight asserts that by name against the
-- catalogue.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0 · Preflight. Refuse rather than build on something that is not there.
-- ---------------------------------------------------------------------------
DO $pre$
DECLARE _t text; _f text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['beskt_method_versions', 'beskt_exposure_profiles',
                            'beskt_sections', 'beskt_items', 'beskt_item_options',
                            'beskt_prompts', 'beskt_routing_rules',
                            'beskt_evidence_anchors', 'beskt_observation_fields',
                            'beskt_activation_requirements', 'beskt_method_events'] LOOP
    IF to_regclass('public.' || _t) IS NULL THEN
      RAISE EXCEPTION 'BESKT_AUTHORING_PREFLIGHT: table public.% is missing.', _t;
    END IF;
  END LOOP;
  FOREACH _f IN ARRAY ARRAY['beskt_lock_version', 'beskt_operation_begin', 'beskt_record_event',
                            'beskt_request_hash', 'beskt_method_content_hash',
                            'scp_interview_can_edit', 'beskt_guard_child_row'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = _f) THEN
      RAISE EXCEPTION 'BESKT_AUTHORING_PREFLIGHT: function public.%() is missing.', _f;
    END IF;
  END LOOP;
  -- The law this migration stands on. Six tables, each with the child guard
  -- actually attached: without it these doors would be an unguarded write.
  FOREACH _t IN ARRAY ARRAY['beskt_exposure_profiles', 'beskt_sections', 'beskt_items',
                            'beskt_item_options', 'beskt_prompts', 'beskt_routing_rules',
                            'beskt_evidence_anchors', 'beskt_observation_fields',
                            'beskt_activation_requirements'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger tg
        JOIN pg_class c ON c.oid = tg.tgrelid
        JOIN pg_proc p ON p.oid = tg.tgfoid
       WHERE c.relname = _t AND p.proname = 'beskt_guard_child_row' AND NOT tg.tgisinternal) THEN
      RAISE EXCEPTION
        'BESKT_AUTHORING_PREFLIGHT: public.% does not carry beskt_guard_child_row; refusing to open a door onto an unguarded table.', _t;
    END IF;
  END LOOP;
END $pre$;

-- ---------------------------------------------------------------------------
-- 1 · The event vocabulary gains exactly two members.
--
-- Every earlier member is restated, because ADD CONSTRAINT replaces the whole
-- CHECK and a rebuild that dropped one would break the lifecycle silently.
-- ---------------------------------------------------------------------------
ALTER TABLE public.beskt_method_events DROP CONSTRAINT IF EXISTS beskt_method_events_event_check;
ALTER TABLE public.beskt_method_events
  ADD CONSTRAINT beskt_method_events_event_check
  CHECK (event IN (
    -- 20261108090000
    'method_created', 'version_created', 'new_version_created',
    'draft_touched', 'submitted_for_review',
    'review_approved', 'review_rejected',
    'published', 'suspended', 'retired',
    -- this migration
    'content_upserted', 'content_deleted'));

-- ---------------------------------------------------------------------------
-- 2 · The payload contract. A key this domain does not know is a MISTAKE,
--     not a field to ignore.
--
-- STRICT and IMMUTABLE: it reads nothing and decides nothing but the shape of
-- the value it was handed. Deliberately NOT SECURITY DEFINER -- privileges
-- would be a liability in a function that only compares key names.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beskt_content_reject_unknown_keys(
  _family text, _payload jsonb, _allowed text[])
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE _unknown text[];
BEGIN
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN
    RAISE EXCEPTION 'BESKT_CONTENT_PAYLOAD: the % payload is a json object.', _family
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT array_agg(k ORDER BY k) INTO _unknown
    FROM jsonb_object_keys(_payload) k
   WHERE NOT (k = ANY (_allowed));
  IF _unknown IS NOT NULL THEN
    RAISE EXCEPTION
      'BESKT_CONTENT_UNKNOWN_FIELD: the % payload names %, which this method domain does not have. A misspelled governed field is refused rather than dropped.',
      _family, array_to_string(_unknown, ', ')
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_content_reject_unknown_keys(text, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_content_reject_unknown_keys(text, jsonb, text[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.beskt_content_reject_unknown_keys(text, jsonb, text[]) IS
  'Refuses a content payload that names a field this domain does not have, so '
  'a typo in a governed field is an error rather than a silent omission.';

-- ---------------------------------------------------------------------------
-- 3 · The gate every door goes through: who may author, on which version, at
--     which revision. INTERNAL -- callable only from the doors below.
-- ---------------------------------------------------------------------------
--
-- It returns jsonb rather than public.beskt_method_versions%ROWTYPE, and that
-- is not a style choice. A function whose SIGNATURE names a table's composite
-- type becomes a dependency OF that table: `DROP TABLE beskt_method_versions`
-- then refuses with "other objects depend on it", which broke the existing
-- 20261108090000 rollback the first time this was written that way. The doors
-- must be removable without taking the domain with them, and the domain must
-- be removable without knowing the doors exist.
CREATE OR REPLACE FUNCTION public.beskt_content_gate(
  _method_version_id uuid, _expected_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _v public.beskt_method_versions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- The SAME role beskt_touch_draft demands. Authoring content and touching a
  -- draft are the same act of editorship; inventing a second role here would
  -- mean two answers to one question.
  IF NOT public.scp_interview_can_edit(auth.uid()) THEN
    RAISE EXCEPTION
      'BESKT_NOT_EDITOR: authoring method content requires the platform content editor role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  _v := public.beskt_lock_version(_method_version_id, _expected_revision);
  IF _v.content_status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION
      'BESKT_PUBLISHED_IMMUTABLE: version is "%" and can no longer be edited. Create a new version instead.',
      _v.content_status USING ERRCODE = 'check_violation';
  END IF;
  RETURN jsonb_build_object(
    'method_version_id', _v.id, 'pack_id', _v.pack_id,
    'content_status', _v.content_status, 'revision', _v.revision);
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_content_gate(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beskt_content_gate(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 4 · The finisher. ONE place recomputes the hash, advances the revision and
--     appends the event, so nine doors cannot drift apart. INTERNAL.
-- ---------------------------------------------------------------------------
-- Scalars, for the same reason the gate returns jsonb: naming the table's
-- composite type in a signature would make this function a dependency of the
-- table and block the 20261108090000 rollback.
CREATE OR REPLACE FUNCTION public.beskt_content_commit(
  _gate jsonb,
  _operation_id uuid,
  _request_hash text,
  _event text,
  _family text,
  _key text,
  _row_id uuid,
  _created boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hash text; _result jsonb;
  _version_id uuid := (_gate ->> 'method_version_id')::uuid;
  _pack_id uuid := (_gate ->> 'pack_id')::uuid;
  _status text := _gate ->> 'content_status';
  _revision integer := (_gate ->> 'revision')::integer;
BEGIN
  _hash := public.beskt_method_content_hash(_version_id);

  PERFORM set_config('beskt.governed_transition', 'on', true);
  UPDATE public.beskt_method_versions
     SET content_hash = _hash, revision = _revision + 1, updated_at = now()
   WHERE id = _version_id;
  PERFORM set_config('beskt.governed_transition', 'off', true);

  _result := jsonb_build_object(
    'method_version_id', _version_id,
    'content_status', _status,
    'revision', _revision + 1,
    'content_hash', _hash,
    'family', _family,
    'key', _key,
    'row_id', _row_id,
    'created', _created,
    -- Said in the payload itself, as every BESKT write says it.
    'produces_score', false,
    'interpretation', 'none');

  PERFORM public.beskt_record_event(
    _pack_id, _version_id, _event, _status, _status,
    NULL, _hash, _revision + 1, _operation_id, _request_hash, _result,
    jsonb_build_object('family', _family, 'key', _key, 'row_id', _row_id, 'created', _created));

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_content_commit(
  jsonb, uuid, text, text, text, text, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beskt_content_commit(
  jsonb, uuid, text, text, text, text, uuid, boolean)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5 · Exposure profiles. The documented role relevance every item and prompt
--     must link to. Upserted by profile_key within the version.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beskt_author_exposure_profile(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _profile jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text; _replay jsonb; _v jsonb;
  _key text; _id uuid; _created boolean;
BEGIN
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'author_exposure_profile', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'profile', _profile));
  -- Replay is answered BEFORE anything is authorised or written.
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM public.beskt_content_reject_unknown_keys('exposure profile', _profile, ARRAY[
    'profile_key', 'display_order', 'exposure_area', 'duties_sv', 'duties_en',
    'role_relevance_rationale_sv', 'role_relevance_rationale_en', 'permitted_mode',
    'owning_review_role', 'jurisdiction_reference', 'lawful_basis_reference',
    'retention_class', 'access_class', 'security_sensitive_role_attestation_reference',
    'content_provenance', 'source_reference']);

  _key := _profile ->> 'profile_key';
  IF coalesce(btrim(_key), '') = '' THEN
    RAISE EXCEPTION 'BESKT_CONTENT_KEY_REQUIRED: an exposure profile is addressed by its profile_key.'
      USING ERRCODE = 'check_violation';
  END IF;

  _v := public.beskt_content_gate(_method_version_id, _expected_revision);

  SELECT id INTO _id FROM public.beskt_exposure_profiles
   WHERE method_version_id = _method_version_id AND profile_key = _key;
  _created := _id IS NULL;

  IF _created THEN
    INSERT INTO public.beskt_exposure_profiles
      (method_version_id, profile_key, display_order, exposure_area, duties_sv, duties_en,
       role_relevance_rationale_sv, role_relevance_rationale_en, permitted_mode,
       owning_review_role, jurisdiction_reference, lawful_basis_reference,
       retention_class, access_class, security_sensitive_role_attestation_reference,
       content_provenance, source_reference)
    VALUES (
      _method_version_id, _key, (_profile ->> 'display_order')::integer,
      _profile ->> 'exposure_area', _profile ->> 'duties_sv', _profile ->> 'duties_en',
      _profile ->> 'role_relevance_rationale_sv', _profile ->> 'role_relevance_rationale_en',
      _profile ->> 'permitted_mode', _profile ->> 'owning_review_role',
      _profile ->> 'jurisdiction_reference', _profile ->> 'lawful_basis_reference',
      _profile ->> 'retention_class', _profile ->> 'access_class',
      _profile ->> 'security_sensitive_role_attestation_reference',
      _profile ->> 'content_provenance', _profile ->> 'source_reference')
    RETURNING id INTO _id;
  ELSE
    -- coalesce(payload, stored): an ABSENT key leaves the column alone, so a
    -- partial edit cannot blank a governed field the editor never mentioned.
    -- Clearing one is done by sending it explicitly as json null, which
    -- `? 'key'` distinguishes from absence.
    UPDATE public.beskt_exposure_profiles p SET
      display_order = CASE WHEN _profile ? 'display_order' THEN (_profile ->> 'display_order')::integer ELSE p.display_order END,
      exposure_area = CASE WHEN _profile ? 'exposure_area' THEN _profile ->> 'exposure_area' ELSE p.exposure_area END,
      duties_sv = CASE WHEN _profile ? 'duties_sv' THEN _profile ->> 'duties_sv' ELSE p.duties_sv END,
      duties_en = CASE WHEN _profile ? 'duties_en' THEN _profile ->> 'duties_en' ELSE p.duties_en END,
      role_relevance_rationale_sv = CASE WHEN _profile ? 'role_relevance_rationale_sv' THEN _profile ->> 'role_relevance_rationale_sv' ELSE p.role_relevance_rationale_sv END,
      role_relevance_rationale_en = CASE WHEN _profile ? 'role_relevance_rationale_en' THEN _profile ->> 'role_relevance_rationale_en' ELSE p.role_relevance_rationale_en END,
      permitted_mode = CASE WHEN _profile ? 'permitted_mode' THEN _profile ->> 'permitted_mode' ELSE p.permitted_mode END,
      owning_review_role = CASE WHEN _profile ? 'owning_review_role' THEN _profile ->> 'owning_review_role' ELSE p.owning_review_role END,
      jurisdiction_reference = CASE WHEN _profile ? 'jurisdiction_reference' THEN _profile ->> 'jurisdiction_reference' ELSE p.jurisdiction_reference END,
      lawful_basis_reference = CASE WHEN _profile ? 'lawful_basis_reference' THEN _profile ->> 'lawful_basis_reference' ELSE p.lawful_basis_reference END,
      retention_class = CASE WHEN _profile ? 'retention_class' THEN _profile ->> 'retention_class' ELSE p.retention_class END,
      access_class = CASE WHEN _profile ? 'access_class' THEN _profile ->> 'access_class' ELSE p.access_class END,
      security_sensitive_role_attestation_reference = CASE WHEN _profile ? 'security_sensitive_role_attestation_reference' THEN _profile ->> 'security_sensitive_role_attestation_reference' ELSE p.security_sensitive_role_attestation_reference END,
      content_provenance = CASE WHEN _profile ? 'content_provenance' THEN _profile ->> 'content_provenance' ELSE p.content_provenance END,
      source_reference = CASE WHEN _profile ? 'source_reference' THEN _profile ->> 'source_reference' ELSE p.source_reference END
     WHERE p.id = _id;
  END IF;

  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,
    'content_upserted', 'exposure_profile', _key, _id, _created);
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_author_exposure_profile(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_author_exposure_profile(uuid, uuid, integer, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6 · Sections. The phases content is grouped into.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beskt_author_section(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _section jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text; _replay jsonb; _v jsonb;
  _key text; _id uuid; _created boolean;
BEGIN
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'author_section', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'section', _section));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM public.beskt_content_reject_unknown_keys('section', _section, ARRAY[
    'section_key', 'display_order', 'phase', 'title_sv', 'title_en']);

  _key := _section ->> 'section_key';
  IF coalesce(btrim(_key), '') = '' THEN
    RAISE EXCEPTION 'BESKT_CONTENT_KEY_REQUIRED: a section is addressed by its section_key.'
      USING ERRCODE = 'check_violation';
  END IF;

  _v := public.beskt_content_gate(_method_version_id, _expected_revision);

  SELECT id INTO _id FROM public.beskt_sections
   WHERE method_version_id = _method_version_id AND section_key = _key;
  _created := _id IS NULL;

  IF _created THEN
    INSERT INTO public.beskt_sections
      (method_version_id, section_key, display_order, phase, title_sv, title_en)
    VALUES (_method_version_id, _key, (_section ->> 'display_order')::integer,
            _section ->> 'phase', _section ->> 'title_sv', _section ->> 'title_en')
    RETURNING id INTO _id;
  ELSE
    UPDATE public.beskt_sections s SET
      display_order = CASE WHEN _section ? 'display_order' THEN (_section ->> 'display_order')::integer ELSE s.display_order END,
      phase = CASE WHEN _section ? 'phase' THEN _section ->> 'phase' ELSE s.phase END,
      title_sv = CASE WHEN _section ? 'title_sv' THEN _section ->> 'title_sv' ELSE s.title_sv END,
      title_en = CASE WHEN _section ? 'title_en' THEN _section ->> 'title_en' ELSE s.title_en END
     WHERE s.id = _id;
  END IF;

  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,
    'content_upserted', 'section', _key, _id, _created);
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_author_section(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_author_section(uuid, uuid, integer, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7 · Items, with their options.
--
-- The options travel WITH the item and are reconciled in the same call,
-- because an option has no meaning apart from the question it belongs to: a
-- choice item whose options arrived in a separate, separately-failing call
-- would be a question nobody can answer. Options present in the payload are
-- upserted by option_key; options absent from it are removed. Sending no
-- `options` key at all leaves the existing options untouched, so editing a
-- purpose does not silently delete the answers.
--
-- section_key and profile_key are resolved to ids INSIDE, against this very
-- version, so a caller cannot name another version's section by id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beskt_author_item(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _item jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text; _replay jsonb; _v jsonb;
  _key text; _id uuid; _created boolean;
  _section_id uuid; _profile_id uuid; _answer_type text;
  _options jsonb; _opt jsonb; _opt_key text; _opt_id uuid; _keys text[];
BEGIN
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'author_item', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'item', _item));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM public.beskt_content_reject_unknown_keys('item', _item, ARRAY[
    'item_key', 'section_key', 'profile_key', 'display_order',
    'wording_sv', 'wording_en', 'purpose_sv', 'purpose_en',
    'permitted_mode', 'phase', 'answer_type', 'requiredness',
    'discuss_orally_allowed', 'sensitivity_class', 'access_class',
    'content_provenance', 'source_reference', 'prohibited_inferences', 'options']);

  _key := _item ->> 'item_key';
  IF coalesce(btrim(_key), '') = '' THEN
    RAISE EXCEPTION 'BESKT_CONTENT_KEY_REQUIRED: an item is addressed by its item_key.'
      USING ERRCODE = 'check_violation';
  END IF;

  _v := public.beskt_content_gate(_method_version_id, _expected_revision);

  SELECT id, answer_type INTO _id, _answer_type FROM public.beskt_items
   WHERE method_version_id = _method_version_id AND item_key = _key;
  _created := _id IS NULL;

  -- Parents are resolved by KEY, within this version. A section or profile of
  -- another version is not addressable from here at all.
  IF _item ? 'section_key' THEN
    SELECT id INTO _section_id FROM public.beskt_sections
     WHERE method_version_id = _method_version_id AND section_key = _item ->> 'section_key';
    IF _section_id IS NULL THEN
      RAISE EXCEPTION 'BESKT_CONTENT_PARENT_UNKNOWN: this version has no section "%".',
        _item ->> 'section_key' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF _item ? 'profile_key' THEN
    SELECT id INTO _profile_id FROM public.beskt_exposure_profiles
     WHERE method_version_id = _method_version_id AND profile_key = _item ->> 'profile_key';
    IF _profile_id IS NULL THEN
      RAISE EXCEPTION 'BESKT_CONTENT_PARENT_UNKNOWN: this version has no exposure profile "%".',
        _item ->> 'profile_key' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF _created THEN
    IF _section_id IS NULL OR _profile_id IS NULL THEN
      RAISE EXCEPTION
        'BESKT_CONTENT_PARENT_REQUIRED: a new item names the section and the exposure profile it belongs to.'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.beskt_items
      (method_version_id, section_id, exposure_profile_id, item_key, display_order,
       wording_sv, wording_en, purpose_sv, purpose_en, permitted_mode, phase,
       answer_type, requiredness, discuss_orally_allowed, sensitivity_class,
       access_class, content_provenance, source_reference, prohibited_inferences)
    VALUES (
      _method_version_id, _section_id, _profile_id, _key, (_item ->> 'display_order')::integer,
      _item ->> 'wording_sv', _item ->> 'wording_en', _item ->> 'purpose_sv', _item ->> 'purpose_en',
      _item ->> 'permitted_mode', _item ->> 'phase', _item ->> 'answer_type',
      _item ->> 'requiredness',
      coalesce((_item ->> 'discuss_orally_allowed')::boolean, true),
      _item ->> 'sensitivity_class', _item ->> 'access_class',
      _item ->> 'content_provenance', _item ->> 'source_reference',
      coalesce((SELECT array_agg(value::text ORDER BY ordinality)
                  FROM jsonb_array_elements_text(coalesce(_item -> 'prohibited_inferences', '[]'::jsonb))
                       WITH ORDINALITY AS t(value, ordinality)), '{}'::text[]))
    RETURNING id, answer_type INTO _id, _answer_type;
  ELSE
    -- section_id and exposure_profile_id are NOT updated here. The child guard
    -- refuses re-parenting outright, and passing them through only to be
    -- refused would read as though moving an item were merely blocked by
    -- policy rather than not being an edit at all.
    UPDATE public.beskt_items i SET
      display_order = CASE WHEN _item ? 'display_order' THEN (_item ->> 'display_order')::integer ELSE i.display_order END,
      wording_sv = CASE WHEN _item ? 'wording_sv' THEN _item ->> 'wording_sv' ELSE i.wording_sv END,
      wording_en = CASE WHEN _item ? 'wording_en' THEN _item ->> 'wording_en' ELSE i.wording_en END,
      purpose_sv = CASE WHEN _item ? 'purpose_sv' THEN _item ->> 'purpose_sv' ELSE i.purpose_sv END,
      purpose_en = CASE WHEN _item ? 'purpose_en' THEN _item ->> 'purpose_en' ELSE i.purpose_en END,
      permitted_mode = CASE WHEN _item ? 'permitted_mode' THEN _item ->> 'permitted_mode' ELSE i.permitted_mode END,
      phase = CASE WHEN _item ? 'phase' THEN _item ->> 'phase' ELSE i.phase END,
      answer_type = CASE WHEN _item ? 'answer_type' THEN _item ->> 'answer_type' ELSE i.answer_type END,
      requiredness = CASE WHEN _item ? 'requiredness' THEN _item ->> 'requiredness' ELSE i.requiredness END,
      discuss_orally_allowed = CASE WHEN _item ? 'discuss_orally_allowed' THEN (_item ->> 'discuss_orally_allowed')::boolean ELSE i.discuss_orally_allowed END,
      sensitivity_class = CASE WHEN _item ? 'sensitivity_class' THEN _item ->> 'sensitivity_class' ELSE i.sensitivity_class END,
      access_class = CASE WHEN _item ? 'access_class' THEN _item ->> 'access_class' ELSE i.access_class END,
      content_provenance = CASE WHEN _item ? 'content_provenance' THEN _item ->> 'content_provenance' ELSE i.content_provenance END,
      source_reference = CASE WHEN _item ? 'source_reference' THEN _item ->> 'source_reference' ELSE i.source_reference END,
      prohibited_inferences = CASE WHEN _item ? 'prohibited_inferences'
        THEN coalesce((SELECT array_agg(value::text ORDER BY ordinality)
                         FROM jsonb_array_elements_text(_item -> 'prohibited_inferences')
                              WITH ORDINALITY AS t(value, ordinality)), '{}'::text[])
        ELSE i.prohibited_inferences END
     WHERE i.id = _id;
    SELECT answer_type INTO _answer_type FROM public.beskt_items WHERE id = _id;
  END IF;

  -- ---- the options, reconciled against what was sent ----------------------
  IF _item ? 'options' THEN
    _options := _item -> 'options';
    IF jsonb_typeof(_options) <> 'array' THEN
      RAISE EXCEPTION 'BESKT_CONTENT_PAYLOAD: item options are a json array.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- The validator refuses a non-choice item that carries options at submit
    -- time. Refusing it here too means the invalid state never exists, rather
    -- than existing until somebody tries to submit.
    IF _answer_type NOT IN ('single_choice', 'multi_choice')
       AND jsonb_array_length(_options) > 0 THEN
      RAISE EXCEPTION
        'BESKT_ITEM_OPTIONS_NOT_APPLICABLE: item "%" is % and cannot carry options.',
        _key, _answer_type USING ERRCODE = 'check_violation';
    END IF;

    _keys := '{}'::text[];
    FOR _opt IN SELECT value FROM jsonb_array_elements(_options) LOOP
      PERFORM public.beskt_content_reject_unknown_keys('item option', _opt, ARRAY[
        'option_key', 'display_order', 'label_sv', 'label_en']);
      _opt_key := _opt ->> 'option_key';
      IF coalesce(btrim(_opt_key), '') = '' THEN
        RAISE EXCEPTION 'BESKT_CONTENT_KEY_REQUIRED: an option is addressed by its option_key.'
          USING ERRCODE = 'check_violation';
      END IF;
      _keys := _keys || _opt_key;

      SELECT id INTO _opt_id FROM public.beskt_item_options
       WHERE item_id = _id AND option_key = _opt_key;
      IF _opt_id IS NULL THEN
        INSERT INTO public.beskt_item_options (item_id, option_key, display_order, label_sv, label_en)
        VALUES (_id, _opt_key, (_opt ->> 'display_order')::integer,
                _opt ->> 'label_sv', _opt ->> 'label_en');
      ELSE
        UPDATE public.beskt_item_options o SET
          display_order = CASE WHEN _opt ? 'display_order' THEN (_opt ->> 'display_order')::integer ELSE o.display_order END,
          label_sv = CASE WHEN _opt ? 'label_sv' THEN _opt ->> 'label_sv' ELSE o.label_sv END,
          label_en = CASE WHEN _opt ? 'label_en' THEN _opt ->> 'label_en' ELSE o.label_en END
         WHERE o.id = _opt_id;
      END IF;
    END LOOP;

    -- Removed from the list means removed. A routing rule that still names a
    -- dropped option holds an ON DELETE RESTRICT reference, so the delete
    -- fails loudly rather than quietly breaking the branch.
    DELETE FROM public.beskt_item_options
     WHERE item_id = _id AND NOT (option_key = ANY (_keys));
  END IF;

  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,
    'content_upserted', 'item', _key, _id, _created);
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_author_item(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_author_item(uuid, uuid, integer, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8 · Prompts. The governed interviewer wordings.
--
-- Nothing about PEACE stages, Evaluation templates, question forms, probe
-- bases or the exposure-profile boundary is checked here: beskt_guard_child_row
-- already refuses every one of them, against the owner, and this function runs
-- as the owner. Adding a second copy would be adding a second place to be
-- wrong.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beskt_author_prompt(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _prompt jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text; _replay jsonb; _v jsonb;
  _key text; _id uuid; _created boolean; _profile_id uuid; _item_id uuid;
BEGIN
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'author_prompt', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'prompt', _prompt));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM public.beskt_content_reject_unknown_keys('prompt', _prompt, ARRAY[
    'prompt_key', 'profile_key', 'item_key', 'display_order', 'prompt_kind',
    'peace_stage', 'addressee', 'question_form', 'permitted_probe_bases',
    'permitted_mode', 'wording_sv', 'wording_en', 'evaluation_template_key',
    'content_provenance', 'source_reference']);

  _key := _prompt ->> 'prompt_key';
  IF coalesce(btrim(_key), '') = '' THEN
    RAISE EXCEPTION 'BESKT_CONTENT_KEY_REQUIRED: a prompt is addressed by its prompt_key.'
      USING ERRCODE = 'check_violation';
  END IF;

  _v := public.beskt_content_gate(_method_version_id, _expected_revision);

  SELECT id INTO _id FROM public.beskt_prompts
   WHERE method_version_id = _method_version_id AND prompt_key = _key;
  _created := _id IS NULL;

  IF _prompt ? 'profile_key' THEN
    SELECT id INTO _profile_id FROM public.beskt_exposure_profiles
     WHERE method_version_id = _method_version_id AND profile_key = _prompt ->> 'profile_key';
    IF _profile_id IS NULL THEN
      RAISE EXCEPTION 'BESKT_CONTENT_PARENT_UNKNOWN: this version has no exposure profile "%".',
        _prompt ->> 'profile_key' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- item_key sent as json null means "a method-level prompt, probing nothing".
  IF _prompt ? 'item_key' AND _prompt ->> 'item_key' IS NOT NULL THEN
    SELECT id INTO _item_id FROM public.beskt_items
     WHERE method_version_id = _method_version_id AND item_key = _prompt ->> 'item_key';
    IF _item_id IS NULL THEN
      RAISE EXCEPTION 'BESKT_CONTENT_PARENT_UNKNOWN: this version has no item "%".',
        _prompt ->> 'item_key' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF _created THEN
    IF _profile_id IS NULL THEN
      RAISE EXCEPTION
        'BESKT_CONTENT_PARENT_REQUIRED: a new prompt names the exposure profile whose relevance it rests on.'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.beskt_prompts
      (method_version_id, exposure_profile_id, item_id, prompt_key, display_order,
       prompt_kind, peace_stage, addressee, question_form, permitted_probe_bases,
       permitted_mode, wording_sv, wording_en, evaluation_template_key,
       content_provenance, source_reference)
    VALUES (
      _method_version_id, _profile_id, _item_id, _key, (_prompt ->> 'display_order')::integer,
      _prompt ->> 'prompt_kind', _prompt ->> 'peace_stage', _prompt ->> 'addressee',
      _prompt ->> 'question_form',
      coalesce((SELECT array_agg(value::text ORDER BY ordinality)
                  FROM jsonb_array_elements_text(coalesce(_prompt -> 'permitted_probe_bases', '[]'::jsonb))
                       WITH ORDINALITY AS t(value, ordinality)), '{}'::text[]),
      _prompt ->> 'permitted_mode', _prompt ->> 'wording_sv', _prompt ->> 'wording_en',
      _prompt ->> 'evaluation_template_key',
      _prompt ->> 'content_provenance', _prompt ->> 'source_reference')
    RETURNING id INTO _id;
  ELSE
    -- exposure_profile_id and item_id are not updated: the child guard refuses
    -- re-pointing a prompt, because what a prompt probes is its identity.
    UPDATE public.beskt_prompts p SET
      display_order = CASE WHEN _prompt ? 'display_order' THEN (_prompt ->> 'display_order')::integer ELSE p.display_order END,
      prompt_kind = CASE WHEN _prompt ? 'prompt_kind' THEN _prompt ->> 'prompt_kind' ELSE p.prompt_kind END,
      peace_stage = CASE WHEN _prompt ? 'peace_stage' THEN _prompt ->> 'peace_stage' ELSE p.peace_stage END,
      addressee = CASE WHEN _prompt ? 'addressee' THEN _prompt ->> 'addressee' ELSE p.addressee END,
      question_form = CASE WHEN _prompt ? 'question_form' THEN _prompt ->> 'question_form' ELSE p.question_form END,
      permitted_probe_bases = CASE WHEN _prompt ? 'permitted_probe_bases'
        THEN coalesce((SELECT array_agg(value::text ORDER BY ordinality)
                         FROM jsonb_array_elements_text(_prompt -> 'permitted_probe_bases')
                              WITH ORDINALITY AS t(value, ordinality)), '{}'::text[])
        ELSE p.permitted_probe_bases END,
      permitted_mode = CASE WHEN _prompt ? 'permitted_mode' THEN _prompt ->> 'permitted_mode' ELSE p.permitted_mode END,
      wording_sv = CASE WHEN _prompt ? 'wording_sv' THEN _prompt ->> 'wording_sv' ELSE p.wording_sv END,
      wording_en = CASE WHEN _prompt ? 'wording_en' THEN _prompt ->> 'wording_en' ELSE p.wording_en END,
      evaluation_template_key = CASE WHEN _prompt ? 'evaluation_template_key' THEN _prompt ->> 'evaluation_template_key' ELSE p.evaluation_template_key END,
      content_provenance = CASE WHEN _prompt ? 'content_provenance' THEN _prompt ->> 'content_provenance' ELSE p.content_provenance END,
      source_reference = CASE WHEN _prompt ? 'source_reference' THEN _prompt ->> 'source_reference' ELSE p.source_reference END
     WHERE p.id = _id;
  END IF;

  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,
    'content_upserted', 'prompt', _key, _id, _created);
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_author_prompt(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_author_prompt(uuid, uuid, integer, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9 · Routing rules. Deterministic questionnaire branching.
--
-- Direction, phase, mode escalation, the exposure-profile boundary and the
-- condition/answer-type agreement are all beskt_guard_child_row's, and stay
-- there. This resolves keys to ids within the version and writes the row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beskt_author_routing_rule(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _rule jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text; _replay jsonb; _v jsonb;
  _key text; _id uuid; _created boolean;
  _source_id uuid; _target_id uuid; _option_id uuid;
BEGIN
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'author_routing_rule', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'rule', _rule));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM public.beskt_content_reject_unknown_keys('routing rule', _rule, ARRAY[
    'rule_key', 'evaluation_order', 'applies_mode', 'source_item_key',
    'condition_kind', 'condition_option_key', 'condition_boolean',
    'action', 'target_item_key']);

  _key := _rule ->> 'rule_key';
  IF coalesce(btrim(_key), '') = '' THEN
    RAISE EXCEPTION 'BESKT_CONTENT_KEY_REQUIRED: a routing rule is addressed by its rule_key.'
      USING ERRCODE = 'check_violation';
  END IF;

  _v := public.beskt_content_gate(_method_version_id, _expected_revision);

  SELECT id INTO _id FROM public.beskt_routing_rules
   WHERE method_version_id = _method_version_id AND rule_key = _key;
  _created := _id IS NULL;

  IF _rule ? 'source_item_key' THEN
    SELECT id INTO _source_id FROM public.beskt_items
     WHERE method_version_id = _method_version_id AND item_key = _rule ->> 'source_item_key';
    IF _source_id IS NULL THEN
      RAISE EXCEPTION 'BESKT_CONTENT_PARENT_UNKNOWN: this version has no item "%".',
        _rule ->> 'source_item_key' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF _rule ? 'target_item_key' THEN
    SELECT id INTO _target_id FROM public.beskt_items
     WHERE method_version_id = _method_version_id AND item_key = _rule ->> 'target_item_key';
    IF _target_id IS NULL THEN
      RAISE EXCEPTION 'BESKT_CONTENT_PARENT_UNKNOWN: this version has no item "%".',
        _rule ->> 'target_item_key' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- The option is resolved WITHIN the named source item, so a rule can never
  -- be conditioned on an option belonging to some other question.
  IF _rule ? 'condition_option_key' AND _rule ->> 'condition_option_key' IS NOT NULL THEN
    IF _source_id IS NULL THEN
      RAISE EXCEPTION
        'BESKT_CONTENT_PARENT_REQUIRED: a condition option is named together with the source item it belongs to.'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT id INTO _option_id FROM public.beskt_item_options
     WHERE item_id = _source_id AND option_key = _rule ->> 'condition_option_key';
    IF _option_id IS NULL THEN
      RAISE EXCEPTION 'BESKT_CONTENT_PARENT_UNKNOWN: item "%" has no option "%".',
        _rule ->> 'source_item_key', _rule ->> 'condition_option_key'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF _created THEN
    IF _source_id IS NULL OR _target_id IS NULL THEN
      RAISE EXCEPTION
        'BESKT_CONTENT_PARENT_REQUIRED: a new routing rule names the source and target items it connects.'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.beskt_routing_rules
      (method_version_id, rule_key, evaluation_order, applies_mode, source_item_id,
       condition_kind, condition_option_id, condition_boolean, action, target_item_id)
    VALUES (
      _method_version_id, _key, (_rule ->> 'evaluation_order')::integer,
      _rule ->> 'applies_mode', _source_id, _rule ->> 'condition_kind',
      _option_id, (_rule ->> 'condition_boolean')::boolean,
      _rule ->> 'action', _target_id)
    RETURNING id INTO _id;
  ELSE
    -- source, target and condition option are not updated: the child guard
    -- refuses re-pointing a rule, because what it connects is its identity.
    UPDATE public.beskt_routing_rules r SET
      evaluation_order = CASE WHEN _rule ? 'evaluation_order' THEN (_rule ->> 'evaluation_order')::integer ELSE r.evaluation_order END,
      applies_mode = CASE WHEN _rule ? 'applies_mode' THEN _rule ->> 'applies_mode' ELSE r.applies_mode END,
      condition_kind = CASE WHEN _rule ? 'condition_kind' THEN _rule ->> 'condition_kind' ELSE r.condition_kind END,
      condition_boolean = CASE WHEN _rule ? 'condition_boolean' THEN (_rule ->> 'condition_boolean')::boolean ELSE r.condition_boolean END,
      action = CASE WHEN _rule ? 'action' THEN _rule ->> 'action' ELSE r.action END
     WHERE r.id = _id;
  END IF;

  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,
    'content_upserted', 'routing_rule', _key, _id, _created);
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_author_routing_rule(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_author_routing_rule(uuid, uuid, integer, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9b · Evidence anchors, observation fields and activation requirements.
--
-- These three complete the set. Without them the doors above would author a
-- method that can never be SUBMITTED: beskt_method_validate() requires all
-- seven evidence anchors and all ten observation-field definitions on every
-- version, and all three activation requirements on a security-vetting one.
-- An authoring surface that stops short of a submittable method is not an
-- authoring surface.
--
-- All three are keyed by their own closed vocabulary -- an evidence state, a
-- field key, a requirement key -- so there is nothing to invent: the CHECK
-- constraints decide which rows may exist and the door only fills them in.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beskt_author_evidence_anchor(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _anchor jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text; _replay jsonb; _v jsonb;
  _key text; _id uuid; _created boolean;
BEGIN
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'author_evidence_anchor', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'anchor', _anchor));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM public.beskt_content_reject_unknown_keys('evidence anchor', _anchor, ARRAY[
    'evidence_state', 'definition_sv', 'definition_en',
    'inclusion_criteria_sv', 'inclusion_criteria_en',
    'exclusion_criteria_sv', 'exclusion_criteria_en',
    'supporting_evidence_examples_sv', 'supporting_evidence_examples_en',
    'counter_evidence_and_protective_factors_sv', 'counter_evidence_and_protective_factors_en',
    'prohibited_inferences', 'required_next_action']);

  _key := _anchor ->> 'evidence_state';
  IF coalesce(btrim(_key), '') = '' THEN
    RAISE EXCEPTION 'BESKT_CONTENT_KEY_REQUIRED: an evidence anchor is addressed by its evidence_state.'
      USING ERRCODE = 'check_violation';
  END IF;

  _v := public.beskt_content_gate(_method_version_id, _expected_revision);

  SELECT id INTO _id FROM public.beskt_evidence_anchors
   WHERE method_version_id = _method_version_id AND evidence_state = _key;
  _created := _id IS NULL;

  IF _created THEN
    INSERT INTO public.beskt_evidence_anchors
      (method_version_id, evidence_state, definition_sv, definition_en,
       inclusion_criteria_sv, inclusion_criteria_en,
       exclusion_criteria_sv, exclusion_criteria_en,
       supporting_evidence_examples_sv, supporting_evidence_examples_en,
       counter_evidence_and_protective_factors_sv, counter_evidence_and_protective_factors_en,
       prohibited_inferences, required_next_action)
    VALUES (
      _method_version_id, _key, _anchor ->> 'definition_sv', _anchor ->> 'definition_en',
      _anchor ->> 'inclusion_criteria_sv', _anchor ->> 'inclusion_criteria_en',
      _anchor ->> 'exclusion_criteria_sv', _anchor ->> 'exclusion_criteria_en',
      _anchor ->> 'supporting_evidence_examples_sv', _anchor ->> 'supporting_evidence_examples_en',
      _anchor ->> 'counter_evidence_and_protective_factors_sv',
      _anchor ->> 'counter_evidence_and_protective_factors_en',
      coalesce((SELECT array_agg(value::text ORDER BY ordinality)
                  FROM jsonb_array_elements_text(coalesce(_anchor -> 'prohibited_inferences', '[]'::jsonb))
                       WITH ORDINALITY AS t(value, ordinality)), '{}'::text[]),
      _anchor ->> 'required_next_action')
    RETURNING id INTO _id;
  ELSE
    UPDATE public.beskt_evidence_anchors a SET
      definition_sv = CASE WHEN _anchor ? 'definition_sv' THEN _anchor ->> 'definition_sv' ELSE a.definition_sv END,
      definition_en = CASE WHEN _anchor ? 'definition_en' THEN _anchor ->> 'definition_en' ELSE a.definition_en END,
      inclusion_criteria_sv = CASE WHEN _anchor ? 'inclusion_criteria_sv' THEN _anchor ->> 'inclusion_criteria_sv' ELSE a.inclusion_criteria_sv END,
      inclusion_criteria_en = CASE WHEN _anchor ? 'inclusion_criteria_en' THEN _anchor ->> 'inclusion_criteria_en' ELSE a.inclusion_criteria_en END,
      exclusion_criteria_sv = CASE WHEN _anchor ? 'exclusion_criteria_sv' THEN _anchor ->> 'exclusion_criteria_sv' ELSE a.exclusion_criteria_sv END,
      exclusion_criteria_en = CASE WHEN _anchor ? 'exclusion_criteria_en' THEN _anchor ->> 'exclusion_criteria_en' ELSE a.exclusion_criteria_en END,
      supporting_evidence_examples_sv = CASE WHEN _anchor ? 'supporting_evidence_examples_sv' THEN _anchor ->> 'supporting_evidence_examples_sv' ELSE a.supporting_evidence_examples_sv END,
      supporting_evidence_examples_en = CASE WHEN _anchor ? 'supporting_evidence_examples_en' THEN _anchor ->> 'supporting_evidence_examples_en' ELSE a.supporting_evidence_examples_en END,
      counter_evidence_and_protective_factors_sv = CASE WHEN _anchor ? 'counter_evidence_and_protective_factors_sv' THEN _anchor ->> 'counter_evidence_and_protective_factors_sv' ELSE a.counter_evidence_and_protective_factors_sv END,
      counter_evidence_and_protective_factors_en = CASE WHEN _anchor ? 'counter_evidence_and_protective_factors_en' THEN _anchor ->> 'counter_evidence_and_protective_factors_en' ELSE a.counter_evidence_and_protective_factors_en END,
      prohibited_inferences = CASE WHEN _anchor ? 'prohibited_inferences'
        THEN coalesce((SELECT array_agg(value::text ORDER BY ordinality)
                         FROM jsonb_array_elements_text(_anchor -> 'prohibited_inferences')
                              WITH ORDINALITY AS t(value, ordinality)), '{}'::text[])
        ELSE a.prohibited_inferences END,
      required_next_action = CASE WHEN _anchor ? 'required_next_action' THEN _anchor ->> 'required_next_action' ELSE a.required_next_action END
     WHERE a.id = _id;
  END IF;

  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,
    'content_upserted', 'evidence_anchor', _key, _id, _created);
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_author_evidence_anchor(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_author_evidence_anchor(uuid, uuid, integer, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.beskt_author_observation_field(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _field jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text; _replay jsonb; _v jsonb;
  _key text; _id uuid; _created boolean;
BEGIN
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'author_observation_field', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'field', _field));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM public.beskt_content_reject_unknown_keys('observation field', _field, ARRAY[
    'field_key', 'ordinal', 'recorded_by', 'is_judgement',
    'label_sv', 'label_en', 'definition_sv', 'definition_en']);

  _key := _field ->> 'field_key';
  IF coalesce(btrim(_key), '') = '' THEN
    RAISE EXCEPTION 'BESKT_CONTENT_KEY_REQUIRED: an observation field is addressed by its field_key.'
      USING ERRCODE = 'check_violation';
  END IF;

  _v := public.beskt_content_gate(_method_version_id, _expected_revision);

  SELECT id INTO _id FROM public.beskt_observation_fields
   WHERE method_version_id = _method_version_id AND field_key = _key;
  _created := _id IS NULL;

  IF _created THEN
    INSERT INTO public.beskt_observation_fields
      (method_version_id, field_key, ordinal, recorded_by, is_judgement,
       label_sv, label_en, definition_sv, definition_en)
    VALUES (
      _method_version_id, _key, (_field ->> 'ordinal')::integer,
      _field ->> 'recorded_by', (_field ->> 'is_judgement')::boolean,
      _field ->> 'label_sv', _field ->> 'label_en',
      _field ->> 'definition_sv', _field ->> 'definition_en')
    RETURNING id INTO _id;
  ELSE
    UPDATE public.beskt_observation_fields f SET
      ordinal = CASE WHEN _field ? 'ordinal' THEN (_field ->> 'ordinal')::integer ELSE f.ordinal END,
      recorded_by = CASE WHEN _field ? 'recorded_by' THEN _field ->> 'recorded_by' ELSE f.recorded_by END,
      is_judgement = CASE WHEN _field ? 'is_judgement' THEN (_field ->> 'is_judgement')::boolean ELSE f.is_judgement END,
      label_sv = CASE WHEN _field ? 'label_sv' THEN _field ->> 'label_sv' ELSE f.label_sv END,
      label_en = CASE WHEN _field ? 'label_en' THEN _field ->> 'label_en' ELSE f.label_en END,
      definition_sv = CASE WHEN _field ? 'definition_sv' THEN _field ->> 'definition_sv' ELSE f.definition_sv END,
      definition_en = CASE WHEN _field ? 'definition_en' THEN _field ->> 'definition_en' ELSE f.definition_en END
     WHERE f.id = _id;
  END IF;

  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,
    'content_upserted', 'observation_field', _key, _id, _created);
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_author_observation_field(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_author_observation_field(uuid, uuid, integer, jsonb)
  TO authenticated, service_role;

-- An activation requirement is a REQUIREMENT STATEMENT, never a satisfaction.
-- Authoring one does not attest anything, does not record a lawful basis and
-- does not appoint anybody: it writes down what would have to be true. The
-- satisfactions are runtime facts that do not live in this domain at all, so
-- no editor can switch a method into security-vetting mode by writing here.
CREATE OR REPLACE FUNCTION public.beskt_author_activation_requirement(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _requirement jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text; _replay jsonb; _v jsonb;
  _key text; _id uuid; _created boolean;
BEGIN
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'author_activation_requirement', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'requirement', _requirement));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM public.beskt_content_reject_unknown_keys('activation requirement', _requirement, ARRAY[
    'requirement_key', 'satisfied_by_role', 'statement_sv', 'statement_en']);

  _key := _requirement ->> 'requirement_key';
  IF coalesce(btrim(_key), '') = '' THEN
    RAISE EXCEPTION 'BESKT_CONTENT_KEY_REQUIRED: an activation requirement is addressed by its requirement_key.'
      USING ERRCODE = 'check_violation';
  END IF;

  _v := public.beskt_content_gate(_method_version_id, _expected_revision);

  SELECT id INTO _id FROM public.beskt_activation_requirements
   WHERE method_version_id = _method_version_id AND requirement_key = _key;
  _created := _id IS NULL;

  IF _created THEN
    INSERT INTO public.beskt_activation_requirements
      (method_version_id, requirement_key, satisfied_by_role, statement_sv, statement_en)
    VALUES (_method_version_id, _key, _requirement ->> 'satisfied_by_role',
            _requirement ->> 'statement_sv', _requirement ->> 'statement_en')
    RETURNING id INTO _id;
  ELSE
    UPDATE public.beskt_activation_requirements a SET
      satisfied_by_role = CASE WHEN _requirement ? 'satisfied_by_role' THEN _requirement ->> 'satisfied_by_role' ELSE a.satisfied_by_role END,
      statement_sv = CASE WHEN _requirement ? 'statement_sv' THEN _requirement ->> 'statement_sv' ELSE a.statement_sv END,
      statement_en = CASE WHEN _requirement ? 'statement_en' THEN _requirement ->> 'statement_en' ELSE a.statement_en END
     WHERE a.id = _id;
  END IF;

  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,
    'content_upserted', 'activation_requirement', _key, _id, _created);
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_author_activation_requirement(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_author_activation_requirement(uuid, uuid, integer, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10 · Removing one authored row.
--
-- ONE door for all five families, addressed by family and key, so there is one
-- place where "delete" is authorised rather than five. Every reference in this
-- domain is ON DELETE RESTRICT, so removing something another row still needs
-- fails loudly with the reference named, rather than quietly taking the
-- dependent with it. That is the correct behaviour for governed content: the
-- editor is told what still points at it.
--
-- Deleting an ITEM takes its own options with it, because an option has no
-- existence apart from its question -- but only its own, and only after the
-- gate, and a routing rule that still names one of them will refuse the whole
-- transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beskt_delete_content(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _family text,
  _key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text; _replay jsonb; _v jsonb; _id uuid;
BEGIN
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _family IS NULL OR _family NOT IN
     ('exposure_profile', 'section', 'item', 'prompt', 'routing_rule',
      'evidence_anchor', 'observation_field', 'activation_requirement') THEN
    RAISE EXCEPTION
      'BESKT_CONTENT_FAMILY_UNKNOWN: "%" is not an authorable content family.', coalesce(_family, 'null')
      USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(btrim(_key), '') = '' THEN
    RAISE EXCEPTION 'BESKT_CONTENT_KEY_REQUIRED: a deletion names the key it removes.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'delete_content', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'family', _family, 'key', _key));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  _v := public.beskt_content_gate(_method_version_id, _expected_revision);

  CASE _family
    WHEN 'exposure_profile' THEN
      SELECT id INTO _id FROM public.beskt_exposure_profiles
       WHERE method_version_id = _method_version_id AND profile_key = _key;
    WHEN 'section' THEN
      SELECT id INTO _id FROM public.beskt_sections
       WHERE method_version_id = _method_version_id AND section_key = _key;
    WHEN 'item' THEN
      SELECT id INTO _id FROM public.beskt_items
       WHERE method_version_id = _method_version_id AND item_key = _key;
    WHEN 'prompt' THEN
      SELECT id INTO _id FROM public.beskt_prompts
       WHERE method_version_id = _method_version_id AND prompt_key = _key;
    WHEN 'routing_rule' THEN
      SELECT id INTO _id FROM public.beskt_routing_rules
       WHERE method_version_id = _method_version_id AND rule_key = _key;
    WHEN 'evidence_anchor' THEN
      SELECT id INTO _id FROM public.beskt_evidence_anchors
       WHERE method_version_id = _method_version_id AND evidence_state = _key;
    WHEN 'observation_field' THEN
      SELECT id INTO _id FROM public.beskt_observation_fields
       WHERE method_version_id = _method_version_id AND field_key = _key;
    WHEN 'activation_requirement' THEN
      SELECT id INTO _id FROM public.beskt_activation_requirements
       WHERE method_version_id = _method_version_id AND requirement_key = _key;
  END CASE;

  IF _id IS NULL THEN
    RAISE EXCEPTION 'BESKT_CONTENT_NOT_FOUND: this version has no % "%".', _family, _key
      USING ERRCODE = 'check_violation';
  END IF;

  CASE _family
    WHEN 'exposure_profile' THEN
      DELETE FROM public.beskt_exposure_profiles WHERE id = _id;
    WHEN 'section' THEN
      DELETE FROM public.beskt_sections WHERE id = _id;
    WHEN 'item' THEN
      DELETE FROM public.beskt_item_options WHERE item_id = _id;
      DELETE FROM public.beskt_items WHERE id = _id;
    WHEN 'prompt' THEN
      DELETE FROM public.beskt_prompts WHERE id = _id;
    WHEN 'routing_rule' THEN
      DELETE FROM public.beskt_routing_rules WHERE id = _id;
    WHEN 'evidence_anchor' THEN
      DELETE FROM public.beskt_evidence_anchors WHERE id = _id;
    WHEN 'observation_field' THEN
      DELETE FROM public.beskt_observation_fields WHERE id = _id;
    WHEN 'activation_requirement' THEN
      DELETE FROM public.beskt_activation_requirements WHERE id = _id;
  END CASE;

  RETURN public.beskt_content_commit(_v, _operation_id, _request_hash,
    'content_deleted', _family, _key, _id, false);
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_delete_content(uuid, uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_delete_content(uuid, uuid, integer, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.beskt_delete_content(uuid, uuid, integer, text, text) IS
  'Removes ONE authored content row by family and key, through the same '
  'editor, revision and draft-only gate as the authoring doors. Every '
  'reference in this domain is ON DELETE RESTRICT, so a row something else '
  'still needs refuses by name instead of taking the dependent with it.';

-- ---------------------------------------------------------------------------
-- 11 · Postflight. The migration proves its own claims against the catalogue
--      rather than against its own source text.
-- ---------------------------------------------------------------------------
DO $proof$
DECLARE
  _fn text;
  _n integer;
  _word text;
  _client_fns text[] := ARRAY[
    'beskt_author_exposure_profile', 'beskt_author_section', 'beskt_author_item',
    'beskt_author_prompt', 'beskt_author_routing_rule',
    'beskt_author_evidence_anchor', 'beskt_author_observation_field',
    'beskt_author_activation_requirement', 'beskt_delete_content'];
  _internal_fns text[] := ARRAY['beskt_content_gate', 'beskt_content_commit'];
  _content_tables text[] := ARRAY[
    'beskt_exposure_profiles', 'beskt_sections', 'beskt_items',
    'beskt_item_options', 'beskt_prompts', 'beskt_routing_rules',
    'beskt_evidence_anchors', 'beskt_observation_fields',
    'beskt_activation_requirements'];
  _forbidden text[] := ARRAY[
    'score', 'points', 'weight', 'threshold', 'total', 'rank', 'suitability',
    'credibility', 'truthfulness', 'recommendation', 'risk', 'verdict',
    'deception', 'hire', 'confidence', 'rating', 'grade'];
  _t text;
BEGIN
  -- ---- every door exists, is definer, and pins its search_path ------------
  FOREACH _fn IN ARRAY _client_fns || _internal_fns LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = _fn
                      AND p.prosecdef
                      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%')) THEN
      RAISE EXCEPTION
        'BESKT_AUTHORING_PROOF: % is missing, or is not SECURITY DEFINER with a pinned search_path.', _fn;
    END IF;
  END LOOP;

  -- ---- anon reaches none of them, and the internals are internal ----------
  FOR _fn IN SELECT p.oid::regprocedure::text
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname = ANY (_client_fns || _internal_fns
                                     || ARRAY['beskt_content_reject_unknown_keys']) LOOP
    IF has_function_privilege('anon', _fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'BESKT_AUTHORING_PROOF: anon can execute %.', _fn;
    END IF;
  END LOOP;
  FOR _fn IN SELECT p.oid::regprocedure::text
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = ANY (_internal_fns) LOOP
    IF has_function_privilege('authenticated', _fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION
        'BESKT_AUTHORING_PROOF: % applies no authorisation of its own and must not be callable by authenticated.', _fn;
    END IF;
  END LOOP;

  -- ---- the payload checker is pure: no privileges it has no use for -------
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'beskt_content_reject_unknown_keys'
                    AND NOT p.prosecdef
                    AND p.provolatile = 'i'
                    AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%')) THEN
    RAISE EXCEPTION
      'BESKT_AUTHORING_PROOF: beskt_content_reject_unknown_keys must be IMMUTABLE, search_path-pinned and NOT SECURITY DEFINER.';
  END IF;

  -- ---- NO new client DML on any content table ----------------------------
  -- This is the whole point: the doors are functions, not widened grants.
  SELECT count(*) INTO _n
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name = ANY (_content_tables)
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF _n <> 0 THEN
    RAISE EXCEPTION
      'BESKT_AUTHORING_PROOF: a browser role holds % table DML privilege(s) on BESKT content; authoring goes through the governed functions only.', _n;
  END IF;

  -- ---- the law these doors stand on is still attached --------------------
  FOREACH _t IN ARRAY _content_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger tg
        JOIN pg_class c ON c.oid = tg.tgrelid
        JOIN pg_proc p ON p.oid = tg.tgfoid
       WHERE c.relname = _t AND p.proname = 'beskt_guard_child_row' AND NOT tg.tgisinternal) THEN
      RAISE EXCEPTION 'BESKT_AUTHORING_PROOF: public.% lost beskt_guard_child_row.', _t;
    END IF;
    -- And it is still unreachable as an API.
    IF has_function_privilege('authenticated', 'public.beskt_guard_child_row()', 'EXECUTE') THEN
      RAISE EXCEPTION 'BESKT_AUTHORING_PROOF: the child guard is executable by a client role.';
    END IF;
  END LOOP;

  -- ---- there is nowhere to author a judgement ----------------------------
  FOREACH _word IN ARRAY _forbidden LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = ANY (_content_tables)
                  AND column_name LIKE '%' || _word || '%') THEN
      RAISE EXCEPTION
        'BESKT_AUTHORING_PROOF: BESKT content has a column named for "%"; this method produces no such thing.', _word;
    END IF;
  END LOOP;

  -- ---- the event vocabulary gained two members and lost none -------------
  FOREACH _word IN ARRAY ARRAY['method_created', 'version_created', 'new_version_created',
                               'draft_touched', 'submitted_for_review', 'review_approved',
                               'review_rejected', 'published', 'suspended', 'retired',
                               'content_upserted', 'content_deleted'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.beskt_method_events'::regclass
                      AND conname = 'beskt_method_events_event_check'
                      AND pg_get_constraintdef(oid) LIKE '%''' || _word || '''%') THEN
      RAISE EXCEPTION 'BESKT_AUTHORING_PROOF: the method event vocabulary does not admit %.', _word;
    END IF;
  END LOOP;

  -- ---- this migration authors nothing ------------------------------------
  -- BESKT v1 is written by real editors through the doors above, never by the
  -- migration that opens them.
  SELECT (SELECT count(*) FROM public.beskt_exposure_profiles)
       + (SELECT count(*) FROM public.beskt_sections)
       + (SELECT count(*) FROM public.beskt_items)
       + (SELECT count(*) FROM public.beskt_item_options)
       + (SELECT count(*) FROM public.beskt_prompts)
       + (SELECT count(*) FROM public.beskt_routing_rules)
       + (SELECT count(*) FROM public.beskt_evidence_anchors)
       + (SELECT count(*) FROM public.beskt_observation_fields)
       + (SELECT count(*) FROM public.beskt_activation_requirements)
    INTO _n;
  IF _n <> 0 THEN
    RAISE NOTICE
      'BESKT content already present (% row(s)); this migration added none of it.', _n;
  END IF;
  SELECT count(*) INTO _n FROM public.beskt_method_events
   WHERE event IN ('content_upserted', 'content_deleted');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BESKT_AUTHORING_PROOF: the migration recorded % authoring event(s); it must record none.', _n;
  END IF;

  RAISE NOTICE 'BESKT_GOVERNED_CONTENT_AUTHORING_PROOF ok';
END $proof$;
