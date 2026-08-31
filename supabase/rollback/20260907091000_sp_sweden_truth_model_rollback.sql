-- =============================================================================
-- ROLLBACK — Security Passport Swedish truth model
--
-- Reverses 20260907091000_sp_sweden_truth_model.sql.
--
-- MUST run BEFORE the three-market rollback, because it restores the claim
-- trigger to the three-market version that file then replaces with the
-- pre-market one. Run in the other order and the trigger ends up describing a
-- schema that no longer exists.
--
-- ── WHAT IS LOST ───────────────────────────────────────────────────────
--
--   * every claim recorded against OV_TRAINING, OV_REFRESHER, OV_TRANSPORT or
--     SE_PERSONNEL_APPROVAL — the credentials themselves cannot be dropped
--     while claims reference them, so this file DELETES those claims;
--   * the authorisation_scope of every scoped credential, which for a
--     skyddsvakt approval is the thing that stops it reading as a general
--     national licence;
--   * the eleven Swedish derivation rules, after which every surface falls
--     back to the honest empty state rather than to the old hardcoded string.
--
-- It also REFUSES outright if any holder row records what an authorisation is
-- limited to, because dropping the column erases that silently — see section 3.
--
-- Export before running in anger:
--
--   \copy (SELECT * FROM public.sp_claims WHERE credential_code IN
--          ('OV_TRAINING','OV_REFRESHER','OV_TRANSPORT','SE_PERSONNEL_APPROVAL')
--          OR authorisation_scope IS NOT NULL) TO 'sp_claims_sweden.csv' CSV HEADER
--
-- Prefer fixing forward. Deactivating a credential (`is_active = false` on
-- sp_credential_types) hides it from every form without destroying a single
-- holder's record, and is almost always the change actually wanted.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Restore the three-market trigger (without the Swedish rules)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  _t    public.sp_credential_types%ROWTYPE;
  _pack public.sp_market_packs%ROWTYPE;
  _country_needs_sub boolean;
BEGIN
  IF NEW.jurisdiction_code IS NOT NULL THEN
    SELECT * INTO _pack
      FROM public.sp_market_packs
     WHERE jurisdiction_code = NEW.jurisdiction_code
       AND sub_jurisdiction_code IS NOT DISTINCT FROM NEW.sub_jurisdiction_code
       AND superseded_on IS NULL;

    IF NOT FOUND THEN
      SELECT EXISTS (
        SELECT 1 FROM public.sp_market_packs
         WHERE jurisdiction_code = NEW.jurisdiction_code
           AND sub_jurisdiction_code IS NOT NULL
      ) INTO _country_needs_sub;

      IF _country_needs_sub AND NEW.sub_jurisdiction_code IS NULL THEN
        RAISE EXCEPTION
          'SP_SUB_JURISDICTION_REQUIRED: % regulates security locally; name the emirate or region',
          NEW.jurisdiction_code
          USING ERRCODE = 'check_violation';
      END IF;

      IF NEW.sub_jurisdiction_code IS NOT NULL THEN
        RAISE EXCEPTION
          'SP_SUB_JURISDICTION_NOT_SUPPORTED: % is not supported yet',
          NEW.sub_jurisdiction_code
          USING ERRCODE = 'check_violation';
      END IF;

      RAISE EXCEPTION
        'SP_JURISDICTION_NOT_SUPPORTED: no market pack covers %',
        NEW.jurisdiction_code
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT _pack.is_active THEN
      RAISE EXCEPTION
        'SP_MARKET_PACK_NOT_ACTIVE: market pack % is not available yet (legal review: %)',
        _pack.code, _pack.legal_review_state
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.credential_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _t FROM public.sp_credential_types WHERE code = NEW.credential_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_CODE_UNKNOWN: %', NEW.credential_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF _t.jurisdiction_code IS NOT NULL
     AND NEW.jurisdiction_code IS NOT NULL
     AND _t.jurisdiction_code <> NEW.jurisdiction_code THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_JURISDICTION_MISMATCH: % is a % credential, filed as %',
      NEW.credential_code, _t.jurisdiction_code, NEW.jurisdiction_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.sub_jurisdiction_code IS NOT NULL
     AND NEW.sub_jurisdiction_code IS DISTINCT FROM _t.sub_jurisdiction_code THEN
    RAISE EXCEPTION
      'SP_SUB_JURISDICTION_NOT_SUPPORTED: % is issued in % and is not valid elsewhere',
      NEW.credential_code, _t.sub_jurisdiction_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.claim_type <> _t.claim_type THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_CLAIM_TYPE_MISMATCH: % expects claim_type %, got %',
      NEW.credential_code, _t.claim_type, NEW.claim_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.lifecycle_state = 'draft' THEN
    RETURN NEW;
  END IF;

  IF _t.requires_valid_until AND NEW.valid_until IS NULL THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_VALID_UNTIL: % is a time-limited appointment',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.requires_issuer
     AND (NEW.claimed_issuer_name IS NULL OR length(btrim(NEW.claimed_issuer_name)) = 0) THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_ISSUER: % must name an appointing authority',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.sp_claims_credential_rules() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 2. The Swedish derivation rules and the credentials they name
-- ---------------------------------------------------------------------------
DELETE FROM public.sp_professional_titles WHERE market_pack_code = 'SE';

-- ---------------------------------------------------------------------------
-- Refuse rather than destroy a holder's record
-- ---------------------------------------------------------------------------
-- The blind `DELETE FROM sp_claims` below had two failure modes, and both were
-- real:
--
--   * `sp_claims.supersedes_id` is ON DELETE RESTRICT. A holder who CORRECTED
--     one of these credentials has two rows, and when the correction changed
--     the credential_code the filter catches only one of them — so the delete
--     aborts on a foreign key, mid-transaction, reporting a constraint name
--     rather than what actually happened. Reproduced against a real database.
--
--   * When it did NOT abort, it silently deleted a holder's claims, their
--     version history and their verifier attributions, to tidy a schema.
--
-- CI never saw either: the suites clean up after themselves, so by the time
-- the rollback ran there was nothing left to delete.
--
-- Count first, and refuse. A rollback that destroys holder data is not a
-- rollback, and making it succeed quietly is worse than making it stop.
DO $rbse$
DECLARE
  _claims    integer;
  _corrected integer;
  _opted_in  text := current_setting('sp.rollback_may_delete_holder_claims', true);
BEGIN
  SELECT count(*) INTO _claims FROM public.sp_claims c WHERE c.credential_code IN ('OV_TRAINING', 'OV_REFRESHER', 'OV_TRANSPORT', 'SE_PERSONNEL_APPROVAL');

  SELECT count(*) INTO _corrected FROM public.sp_claims c
   WHERE (c.credential_code IN ('OV_TRAINING', 'OV_REFRESHER', 'OV_TRANSPORT', 'SE_PERSONNEL_APPROVAL'))
     AND (c.supersedes_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.sp_claims s WHERE s.supersedes_id = c.id));

  IF _claims > 0 AND coalesce(_opted_in, '') <> 'yes' THEN
    RAISE EXCEPTION
      'ROLLBACK REFUSED: % Swedish truth-model holder claim(s) exist, % of them corrected. '
      'This rollback will not destroy a holder''s record to tidy a schema. '
      'RECOVERY: export the rows (see the header of this file), have each '
      'holder withdraw or correct the claim so their history survives, or '
      'accept the loss deliberately with '
      'SET LOCAL sp.rollback_may_delete_holder_claims = ''yes''; then re-run.',
      _claims, _corrected;
  END IF;

  IF _claims > 0 THEN
    RAISE WARNING
      'Deleting % Swedish truth-model holder claim(s) — opted in explicitly.', _claims;
  END IF;
END $rbse$;

DELETE FROM public.sp_claims
 WHERE credential_code IN
   ('OV_TRAINING', 'OV_REFRESHER', 'OV_TRANSPORT', 'SE_PERSONNEL_APPROVAL');

DELETE FROM public.sp_credential_types
 WHERE code IN ('OV_TRAINING', 'OV_REFRESHER', 'OV_TRANSPORT', 'SE_PERSONNEL_APPROVAL');

-- ---------------------------------------------------------------------------
-- 3. The added columns
-- ---------------------------------------------------------------------------
-- Dropping `authorisation_scope` destroys every scope any holder ever
-- recorded, in one statement, silently. The claim rows survive; what they were
-- LIMITED TO does not — and a skyddsvakt approval whose scope has been erased
-- reads as a general national licence, which is broader than the authority
-- granted. The rows would look intact while asserting more than they should.
--
-- Section 1b already refuses when claims reference the four credentials this
-- rollback removes. That is a different set: a scope lives on `SV`, which this
-- file does not touch, so those rows sail straight past it and lose the column
-- anyway. Legacy null-scope rows and corrected versions are both counted here.
DO $rbsc$
DECLARE
  _scoped   integer;
  _opted_in text := current_setting('sp.rollback_may_delete_holder_claims', true);
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'sp_claims'
                AND column_name = 'authorisation_scope') THEN

    SELECT count(*) INTO _scoped
      FROM public.sp_claims
     WHERE authorisation_scope IS NOT NULL
       AND length(btrim(authorisation_scope)) > 0;

    IF _scoped > 0 AND coalesce(_opted_in, '') <> 'yes' THEN
      RAISE EXCEPTION
        'ROLLBACK REFUSED: % claim(s) record what an authorisation is LIMITED TO. '
        'Dropping authorisation_scope erases every one of them and leaves the '
        'claims looking intact while asserting more than the authority granted. '
        'RECOVERY: export them first — '
        '\copy (SELECT id, holder_user_id, credential_code, authorisation_scope '
        'FROM public.sp_claims WHERE authorisation_scope IS NOT NULL) '
        'TO ''sp_claims_scopes.csv'' CSV HEADER — then either withdraw those '
        'claims with their holders, or accept the loss deliberately with '
        'SET LOCAL sp.rollback_may_delete_holder_claims = ''yes''; and re-run.',
        _scoped;
    END IF;

    IF _scoped > 0 THEN
      RAISE WARNING
        'Erasing the recorded scope of % claim(s) — opted in explicitly.', _scoped;
    END IF;
  END IF;
END $rbsc$;

ALTER TABLE public.sp_claims DROP COLUMN IF EXISTS authorisation_scope;

ALTER TABLE public.sp_credential_types
  DROP COLUMN IF EXISTS narrow_result_only,
  DROP COLUMN IF EXISTS requires_scope;

-- ---------------------------------------------------------------------------
-- 3b. Restore the pre-Phase-A sp_correct_claim
-- ---------------------------------------------------------------------------
-- Section 3 has just removed sp_claims.authorisation_scope. The forward
-- migration replaced the eleven/thirteen-argument sp_correct_claim with a
-- fifteen-argument version that reads _old.authorisation_scope and
-- _old.sub_jurisdiction_code out of an sp_claims%ROWTYPE record. Leaving that
-- version in place after dropping the columns does not fail here -- plpgsql
-- resolves record fields at execution, not at definition -- it fails later, in
-- production, on the first correction a holder attempts:
--
--   ERROR: record "_old" has no field "sub_jurisdiction_code"
--   CONTEXT: PL/pgSQL assignment "_next_sub := coalesce(...)"
--
-- Every other function this rollback set touches is already restored by the
-- rollback that replaced it (sp_claims_credential_rules in section 1 above,
-- and again in the foundation, UK and legacy-scope rollbacks;
-- sp_disclosure_payload in its own). sp_correct_claim was the single omission,
-- which is why a rollback that passed 35 shape assertions still left holders
-- unable to correct their own records.
--
-- CREATE OR REPLACE cannot do this: a different argument list makes a new
-- overload rather than replacing the old one, and two overloads that differ
-- only in trailing defaulted parameters make every legacy call ambiguous. The
-- fifteen-argument version is therefore dropped explicitly first.
--
-- The body below is copied verbatim from
-- 20260818120000_sp_phase11_languages_and_practical_skills.sql, the migration
-- that last defined it before Phase A. It is byte-identical to that source, so
-- what this restores is the pre-Phase-A behaviour exactly, not a
-- reconstruction of it.

DROP FUNCTION IF EXISTS public.sp_correct_claim(
  uuid, text, text, text, date, date, date, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.sp_correct_claim(
  _claim_id uuid,
  _title text,
  _claimed_issuer_name text,
  _jurisdiction_code text,
  _issued_on date,
  _valid_from date,
  _valid_until date,
  _reason text,
  _credential_code text,
  _credential_reference text,
  _holder_note text,
  -- DEFAULT NULL for the same reason as _skill_level below: an eleven-argument
  -- caller keeps working, and for a language an omitted code is refused by
  -- sp_claims_skill_rules rather than silently blanked.
  _skill_code text DEFAULT NULL,
  -- DEFAULT NULL so the eleven-argument callers that predate this migration
  -- still resolve. That is safe precisely because it fails LOUDLY rather than
  -- silently: for a language or practical skill an omitted level is refused by
  -- sp_claims_skill_rules with SP_SKILL_LEVEL_REQUIRED, and for every other
  -- claim type NULL is already the correct value.
  _skill_level text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _old public.sp_claims%ROWTYPE;
  _new_id uuid;
  _material boolean;
  _next_level text;
  _next_by uuid;
  _next_at timestamptz;
BEGIN
  SELECT * INTO _old FROM public.sp_claims WHERE id = _claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_CLAIM_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF _old.holder_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _old.lifecycle_state <> 'active' THEN
    RAISE EXCEPTION 'SP_CLAIM_NOT_CORRECTABLE: state is %', _old.lifecycle_state
      USING ERRCODE = 'check_violation';
  END IF;

  _material := (
       _old.title                 IS DISTINCT FROM _title
    OR _old.claimed_issuer_name   IS DISTINCT FROM _claimed_issuer_name
    OR _old.jurisdiction_code     IS DISTINCT FROM _jurisdiction_code
    OR _old.issued_on             IS DISTINCT FROM _issued_on
    OR _old.valid_from            IS DISTINCT FROM _valid_from
    OR _old.valid_until           IS DISTINCT FROM _valid_until
    OR _old.credential_code       IS DISTINCT FROM _credential_code
    OR _old.credential_reference  IS DISTINCT FROM _credential_reference
    OR _old.skill_level           IS DISTINCT FROM _skill_level
    OR (_skill_code IS NOT NULL AND _old.skill_code IS DISTINCT FROM _skill_code)
  );

  IF _material AND _old.assertion_level <> 'self_declared' THEN
    _next_level := 'self_declared';
    _next_by    := NULL;
    _next_at    := NULL;
  ELSE
    _next_level := _old.assertion_level;
    _next_by    := _old.verified_by_user_id;
    _next_at    := _old.verified_at;
  END IF;

  INSERT INTO public.sp_claims (
    holder_user_id, claim_type, title, claimed_issuer_name, jurisdiction_code,
    issued_on, valid_from, valid_until,
    credential_code, credential_reference, holder_note,
    skill_code, skill_level,
    assertion_level, verified_by_user_id, verified_at,
    lifecycle_state, version_no, supersedes_id)
  VALUES (
    _old.holder_user_id, _old.claim_type, _title, _claimed_issuer_name,
    _jurisdiction_code, _issued_on, _valid_from, _valid_until,
    _credential_code, _credential_reference, _holder_note,
    coalesce(_skill_code, _old.skill_code), _skill_level,
    _next_level, _next_by, _next_at,
    'active', _old.version_no + 1, _old.id)
  RETURNING id INTO _new_id;

  UPDATE public.sp_claims
     SET lifecycle_state = 'superseded'
   WHERE id = _old.id;

  INSERT INTO public.sp_passport_events (
    holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (
    _old.holder_user_id, auth.uid(), 'claim_corrected', 'claim', _new_id,
    jsonb_build_object(
      'supersedes', _old.id,
      'version_no', _old.version_no + 1,
      'reason', _reason,
      'previous_title', _old.title,
      'material_change', _material,
      'previous_assertion_level', _old.assertion_level,
      'assertion_level', _next_level,
      'verification_reset', (_material AND _old.assertion_level <> 'self_declared'),
      'previous_credential_code', _old.credential_code,
      'credential_code', _credential_code,
      'previous_skill_code', _old.skill_code,
      'skill_code', coalesce(_skill_code, _old.skill_code),
      'previous_skill_level', _old.skill_level,
      'skill_level', _skill_level));

  RETURN _new_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sp_correct_claim(
  uuid, text, text, text, date, date, date, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_correct_claim(
  uuid, text, text, text, date, date, date, text, text, text, text, text, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3c. Restore the pre-three-market sp_verifier_request_detail
-- ---------------------------------------------------------------------------
-- The same failure mode as 3b, on a different function, for the same reason.
--
-- 20261014090000 widened the reviewer's payload so a reviewer could see the
-- fields a certificate is actually checked against -- among them
-- `c.sub_jurisdiction_code` and `c.authorisation_scope`, the difference
-- between a Dubai licence and a UAE-wide one and the limit on a scoped
-- approval. Section 3 above has just dropped `authorisation_scope`, and the
-- three-market foundation rollback drops `sub_jurisdiction_code` immediately
-- after this file.
--
-- Leaving the widened body in place does not fail here: the columns are named
-- inside a SELECT that plpgsql does not resolve until execution. It fails
-- later, the first time a reviewer opens a case, with `column c.
-- authorisation_scope does not exist` -- which is a verification queue that
-- cannot be worked, discovered in production rather than in this file.
--
-- The body below is the Phase 10 definition, copied from
-- 20260818090000_sp_phase10_self_review_and_decision_events.sql: the last one
-- written before either column existed. It reads neither, so it is safe
-- whichever order the remaining rollbacks run in. Unlike sp_correct_claim
-- this keeps its signature, so CREATE OR REPLACE genuinely replaces it and no
-- second overload is created.
CREATE OR REPLACE FUNCTION public.sp_verifier_request_detail(_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.sp_verification_requests%ROWTYPE; _out jsonb;
BEGIN
  IF NOT public.sp_is_verifier(auth.uid()) THEN
    RAISE EXCEPTION 'SP_NOT_VERIFIER' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO _r FROM public.sp_verification_requests
   WHERE id = _request_id AND request_kind = 'cqrityjob_review';
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_REQUEST_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;

  SELECT jsonb_build_object(
    'id', _r.id,
    'status', _r.status,
    'submitted_at', _r.submitted_at,
    'subject_type', CASE WHEN _r.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
    'is_self', (_r.holder_user_id = auth.uid()),
    'holder_name', (SELECT coalesce(display_name,'') FROM public.sp_passport_profiles
                     WHERE holder_user_id = _r.holder_user_id),
    'claim', (SELECT jsonb_build_object(
                'id', c.id, 'type', c.claim_type, 'title', c.title,
                'issuer', c.claimed_issuer_name, 'jurisdiction', c.jurisdiction_code,
                'issued_on', c.issued_on, 'valid_until', c.valid_until,
                'assertion', c.assertion_level, 'lifecycle', c.lifecycle_state,
                'version_no', c.version_no)
                FROM public.sp_claims c WHERE c.id = _r.claim_id),
    'period', (SELECT jsonb_build_object(
                'id', e.id, 'employer', e.employer_name, 'role', e.role_title,
                'started_on', e.started_on, 'ended_on', e.ended_on,
                'employment_type', e.employment_type, 'jurisdiction', e.jurisdiction_code,
                'assertion', e.assertion_level, 'lifecycle', e.lifecycle_state)
                FROM public.sp_experience_periods e WHERE e.id = _r.period_id),
    'previous_versions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', pc.id, 'title', pc.title,
                                          'version_no', pc.version_no,
                                          'lifecycle', pc.lifecycle_state)
                       ORDER BY pc.version_no)
        FROM public.sp_claims pc
       WHERE _r.claim_id IS NOT NULL
         AND pc.holder_user_id = _r.holder_user_id
         AND pc.id <> _r.claim_id
         AND pc.id IN (SELECT supersedes_id FROM public.sp_claims WHERE id = _r.claim_id)
    ), '[]'::jsonb),
    'evidence', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', ev.id, 'file_name', ev.file_name, 'mime_type', ev.mime_type,
               'size_bytes', ev.size_bytes, 'storage_path', ev.storage_path,
               'uploaded_at', ev.uploaded_at) ORDER BY ev.uploaded_at)
        FROM public.sp_evidence ev
       WHERE ev.lifecycle_state = 'active'
         AND ((_r.claim_id IS NOT NULL AND ev.claim_id = _r.claim_id)
           OR (_r.period_id IS NOT NULL AND ev.period_id = _r.period_id))
    ), '[]'::jsonb),
    'prior_decisions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'decision', d.decision, 'organisation', d.decider_organisation,
               'method', d.verification_method, 'decided_at', d.decided_at,
               'note', d.decision_note) ORDER BY d.decided_at DESC)
        FROM public.sp_verification_decisions d
        JOIN public.sp_verification_requests r2 ON r2.id = d.request_id
       WHERE r2.holder_user_id = _r.holder_user_id
         AND ((_r.claim_id IS NOT NULL AND r2.claim_id = _r.claim_id)
           OR (_r.period_id IS NOT NULL AND r2.period_id = _r.period_id))
    ), '[]'::jsonb)
  ) INTO _out;

  RETURN _out;
END; $$;

REVOKE ALL ON FUNCTION public.sp_verifier_request_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_request_detail(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. The code-length check
-- ---------------------------------------------------------------------------
-- Restoring the 16-character cap is only safe once the long codes are gone,
-- which section 2 guaranteed. Verified rather than assumed: re-adding a CHECK
-- that existing rows violate would abort this transaction, and finding that
-- out from a constraint error rather than a sentence is a poor way to learn it.
DO $$
DECLARE _too_long integer;
BEGIN
  SELECT count(*) INTO _too_long FROM public.sp_credential_types WHERE length(code) > 16;
  IF _too_long > 0 THEN
    RAISE EXCEPTION
      'ROLLBACK BLOCKED: % credential code(s) are longer than the original 16-character limit. '
      'They arrived with a later market pack, which must be rolled back first.', _too_long;
  END IF;
END $$;

ALTER TABLE public.sp_credential_types
  DROP CONSTRAINT IF EXISTS sp_credential_types_code_check;

ALTER TABLE public.sp_credential_types
  ADD CONSTRAINT sp_credential_types_code_check
  CHECK (code ~ '^[A-Z0-9_]{2,16}$');

-- ---------------------------------------------------------------------------
-- 5. Prove Sweden still works
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM public.sp_credential_types
       WHERE code IN ('VU1','VU2','OV','SV')) <> 4 THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED SWEDEN: the four launch credentials are not intact';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'sp_claims'
                AND column_name = 'authorisation_scope') THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: sp_claims.authorisation_scope survived';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE code IN ('OV_TRAINING','OV_REFRESHER','OV_TRANSPORT','SE_PERSONNEL_APPROVAL')) THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: a Swedish truth-model credential survived';
  END IF;

  -- Shape alone did not catch the sp_correct_claim defect: the columns were
  -- gone and the tables were right, and holder correction was still broken.
  -- These two assertions are about what the surviving CODE reads.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'sp_correct_claim'
       AND p.pronargs <> 13) THEN
    RAISE EXCEPTION
      'ROLLBACK INCOMPLETE: sp_correct_claim is not back at its pre-Phase-A '
      '13-argument signature';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('sp_correct_claim', 'sp_claims_credential_rules')
       AND p.prosrc LIKE '%authorisation_scope%') THEN
    RAISE EXCEPTION
      'ROLLBACK INCOMPLETE: a surviving function still reads '
      'authorisation_scope, which this rollback has removed';
  END IF;
END $$;

COMMIT;
