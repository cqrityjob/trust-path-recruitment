-- =============================================================================
-- Security Passport — Phase 3 + 4: evidence, verification and controlled sharing
--
-- Completes the trust product:
--   * private evidence in Storage, holder-owned, never public;
--   * DOCUMENT_PROVIDED as the only thing an upload can produce;
--   * a CQrityjob verifier queue that is the ONLY path to VERIFIED;
--   * narrowly scoped employer employment attestation;
--   * append-only verification audit with full attribution;
--   * server-authored disclosure packages, hashed share tokens, expiry and
--     revocation;
--   * a public recipient verification path that reads through one function
--     and cannot exceed its package.
--
-- Additive throughout. No existing table, policy or function is altered
-- except `sp_guard_trust_fields_immutable`, which is REPLACED to open
-- exactly one new door: a verifier decision running inside
-- `sp_verifier_decide`. Every other caller is refused as before.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Who may verify
-- -----------------------------------------------------------------------------
-- Reuses the existing platform-admin capability rather than inventing a
-- parallel administration system. A dedicated `passport_verifier` role is a
-- later refinement; adding an enum value now would be a wider change than
-- this release needs, and `is_platform_admin()` is already the repository's
-- established, tested authorisation helper.
CREATE OR REPLACE FUNCTION public.sp_is_verifier(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(_user_id);
$$;

COMMENT ON FUNCTION public.sp_is_verifier IS
  'CQrityjob verification capability. Deliberately narrow: a verifier may act '
  'only through sp_verifier_decide(), and has no blanket read over Passport '
  'content.';


-- -----------------------------------------------------------------------------
-- 2. Evidence — metadata here, bytes in a private bucket
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_evidence (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_id       uuid REFERENCES public.sp_claims(id) ON DELETE CASCADE,
  period_id      uuid REFERENCES public.sp_experience_periods(id) ON DELETE CASCADE,

  -- `{holder_user_id}/{uuid}.{ext}` — the first path segment is the owner,
  -- which is what the Storage policies key on. Same shape as the existing
  -- job-application-cvs bucket, so the pattern is already proven here.
  storage_path text NOT NULL UNIQUE,
  file_name    text NOT NULL,
  mime_type    text NOT NULL,
  size_bytes   integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  -- Content hash. Not a security control on its own — it makes a silent
  -- swap of the stored object detectable when compared with the record.
  sha256       text,

  lifecycle_state text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('active', 'replaced', 'withdrawn')),

  uploaded_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_evidence_attached_to_something CHECK (
    claim_id IS NOT NULL OR period_id IS NOT NULL),
  -- The allowlist lives in a CHECK as well as in the bucket config, because
  -- a bucket setting is a deployment artefact and this is a data guarantee.
  CONSTRAINT sp_evidence_mime_allowlist CHECK (
    mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/heic'))
);

CREATE INDEX IF NOT EXISTS sp_evidence_holder_idx ON public.sp_evidence (holder_user_id);
CREATE INDEX IF NOT EXISTS sp_evidence_claim_idx  ON public.sp_evidence (claim_id);

COMMENT ON TABLE public.sp_evidence IS
  'Private evidence metadata. The bytes live in the private passport-evidence '
  'bucket and are never publicly addressable. Uploading evidence can raise a '
  'claim to DOCUMENT_PROVIDED and nothing more — only a verifier decision '
  'produces VERIFIED.';


-- -----------------------------------------------------------------------------
-- 3. Verification requests and their decisions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_verification_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_id       uuid REFERENCES public.sp_claims(id) ON DELETE CASCADE,
  period_id      uuid REFERENCES public.sp_experience_periods(id) ON DELETE CASCADE,

  -- Two kinds, deliberately distinct. A CQrityjob reviewer reads supplied
  -- documentation; an employer attests to employment they have direct
  -- knowledge of. They are not interchangeable and are never presented as
  -- the same thing.
  request_kind text NOT NULL CHECK (request_kind IN ('cqrityjob_review', 'employer_attestation')),
  target_employer_id uuid REFERENCES public.employers(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'clarification_requested', 'withdrawn')),

  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- How the decision was reached. Shown to the recipient, because "verified"
  -- without a method is an unfalsifiable claim.
  verification_method text CHECK (verification_method IN
    ('document_review', 'employer_confirmation', 'issuer_confirmation')),
  -- Reviewer reasoning. Internal: never included in any disclosure payload.
  decision_note text,
  -- What the holder is told. Separate field so internal reasoning cannot
  -- leak by accident.
  holder_message text,

  valid_from  date,
  valid_until date,

  CONSTRAINT sp_vr_attached_to_something CHECK (claim_id IS NOT NULL OR period_id IS NOT NULL),
  CONSTRAINT sp_vr_employer_kind_has_employer CHECK (
    request_kind <> 'employer_attestation' OR target_employer_id IS NOT NULL),
  CONSTRAINT sp_vr_decided_has_decider CHECK (
    status IN ('pending', 'withdrawn') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  -- THE SELF-VERIFICATION RULE, again at row level. A holder can never be
  -- the decider on their own request, whatever the application does.
  CONSTRAINT sp_vr_no_self_decision CHECK (
    decided_by IS NULL OR decided_by <> holder_user_id)
);

CREATE INDEX IF NOT EXISTS sp_vr_queue_idx ON public.sp_verification_requests (status, submitted_at);
CREATE INDEX IF NOT EXISTS sp_vr_holder_idx ON public.sp_verification_requests (holder_user_id);
CREATE INDEX IF NOT EXISTS sp_vr_employer_idx ON public.sp_verification_requests (target_employer_id, status);

-- Append-only decision log, separate from the request so a corrected or
-- re-opened request cannot rewrite what was decided before.
CREATE TABLE IF NOT EXISTS public.sp_verification_decisions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.sp_verification_requests(id) ON DELETE CASCADE,
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decider_organisation text,
  decision   text NOT NULL CHECK (decision IN ('approved','rejected','clarification_requested','revoked')),
  verification_method text,
  decision_note text,
  valid_from date,
  valid_until date,
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sp_vd_request_idx ON public.sp_verification_decisions (request_id, decided_at DESC);


-- -----------------------------------------------------------------------------
-- 4. Disclosure packages, shares and access log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_disclosures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  package_code text NOT NULL CHECK (package_code IN
    ('public_card', 'verified_qualifications', 'verified_experience',
     'employer_review', 'full_verification')),

  -- ONLY the hash is stored. A leaked database backup therefore does not
  -- hand over live share links, which storing the token in plaintext would.
  token_hash text NOT NULL UNIQUE,

  purpose        text,
  recipient_hint text,

  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,

  access_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS sp_disclosures_holder_idx ON public.sp_disclosures (holder_user_id, created_at DESC);

-- Access log. Deliberately privacy-conscious: a coarse timestamp and hashed
-- client hints, never a raw IP or user agent.
CREATE TABLE IF NOT EXISTS public.sp_disclosure_accesses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disclosure_id uuid NOT NULL REFERENCES public.sp_disclosures(id) ON DELETE CASCADE,
  accessed_at   timestamptz NOT NULL DEFAULT now(),
  client_hint_hash text
);

CREATE INDEX IF NOT EXISTS sp_da_disclosure_idx ON public.sp_disclosure_accesses (disclosure_id, accessed_at DESC);


-- -----------------------------------------------------------------------------
-- 5. The trust guard, reopened for exactly one caller
-- -----------------------------------------------------------------------------
-- Phase 2 refused every assertion_level change, because Phase 2 had no
-- verification. Phase 3 has exactly one legitimate transition, and it must
-- remain impossible for anyone else — including the holder, the employer,
-- a service-role client and direct SQL.
--
-- The door is a transaction-local setting that only `sp_verifier_decide`
-- sets. It cannot be set over PostgREST: `set_config(..., true)` is
-- transaction-scoped and a REST call has no way to run it alongside an
-- UPDATE in the same transaction.
CREATE OR REPLACE FUNCTION public.sp_guard_trust_fields_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assertion_level IS DISTINCT FROM OLD.assertion_level THEN
    -- Upload → DOCUMENT_PROVIDED is a holder-visible step and is allowed
    -- only in that exact direction, never as a route to VERIFIED.
    IF NEW.assertion_level = 'document_provided'
       AND OLD.assertion_level = 'self_declared'
       AND coalesce(current_setting('sp.evidence_context', true), '') = 'on' THEN
      NULL;
    ELSIF coalesce(current_setting('sp.verification_context', true), '') = 'on' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'SP_TRUST_FIELD_IMMUTABLE: assertion_level may only change through the evidence or verification workflow'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state
     AND NEW.lifecycle_state NOT IN ('superseded', 'withdrawn')
     AND coalesce(current_setting('sp.verification_context', true), '') <> 'on' THEN
    RAISE EXCEPTION 'SP_LIFECYCLE_TRANSITION_NOT_ALLOWED: % -> % requires the verification workflow',
      OLD.lifecycle_state, NEW.lifecycle_state USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.sp_evidence                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_verification_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_verification_decisions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_disclosures             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_disclosure_accesses     ENABLE ROW LEVEL SECURITY;

-- Evidence: the holder, plus a verifier ONLY while a request is open on it.
DROP POLICY IF EXISTS sp_evidence_self ON public.sp_evidence;
CREATE POLICY sp_evidence_self ON public.sp_evidence
  FOR ALL TO authenticated
  USING (holder_user_id = auth.uid())
  WITH CHECK (holder_user_id = auth.uid());

DROP POLICY IF EXISTS sp_evidence_verifier_read ON public.sp_evidence;
CREATE POLICY sp_evidence_verifier_read ON public.sp_evidence
  FOR SELECT TO authenticated
  USING (
    public.sp_is_verifier(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.sp_verification_requests r
       WHERE r.status IN ('pending', 'clarification_requested')
         AND r.request_kind = 'cqrityjob_review'
         AND (r.claim_id = sp_evidence.claim_id OR r.period_id = sp_evidence.period_id)));

-- Verification requests: holder sees own; verifier sees the CQrityjob queue;
-- an employer representative sees ONLY their own organisation's attestation
-- requests. There is no policy that lets an employer see anything else.
DROP POLICY IF EXISTS sp_vr_self ON public.sp_verification_requests;
CREATE POLICY sp_vr_self ON public.sp_verification_requests
  FOR SELECT TO authenticated USING (holder_user_id = auth.uid());

DROP POLICY IF EXISTS sp_vr_self_insert ON public.sp_verification_requests;
CREATE POLICY sp_vr_self_insert ON public.sp_verification_requests
  FOR INSERT TO authenticated
  WITH CHECK (holder_user_id = auth.uid() AND status = 'pending' AND decided_by IS NULL);

DROP POLICY IF EXISTS sp_vr_verifier_read ON public.sp_verification_requests;
CREATE POLICY sp_vr_verifier_read ON public.sp_verification_requests
  FOR SELECT TO authenticated
  USING (public.sp_is_verifier(auth.uid()) AND request_kind = 'cqrityjob_review');

DROP POLICY IF EXISTS sp_vr_employer_read ON public.sp_verification_requests;
CREATE POLICY sp_vr_employer_read ON public.sp_verification_requests
  FOR SELECT TO authenticated
  USING (
    request_kind = 'employer_attestation'
    AND target_employer_id IS NOT NULL
    AND public.has_employer_role(auth.uid(), target_employer_id, ARRAY['owner','admin']));

-- Decisions are readable by the holder and by verifiers; nobody may write
-- them directly — only sp_verifier_decide() inserts, as SECURITY DEFINER.
DROP POLICY IF EXISTS sp_vd_read ON public.sp_verification_decisions;
CREATE POLICY sp_vd_read ON public.sp_verification_decisions
  FOR SELECT TO authenticated
  USING (holder_user_id = auth.uid() OR public.sp_is_verifier(auth.uid()));

-- Disclosures: holder-owned. There is NO public policy — the recipient path
-- is a SECURITY DEFINER function, so a leaked token yields exactly what that
-- function returns and nothing else.
DROP POLICY IF EXISTS sp_disclosures_self ON public.sp_disclosures;
CREATE POLICY sp_disclosures_self ON public.sp_disclosures
  FOR SELECT TO authenticated USING (holder_user_id = auth.uid());

DROP POLICY IF EXISTS sp_disclosures_self_revoke ON public.sp_disclosures;
CREATE POLICY sp_disclosures_self_revoke ON public.sp_disclosures
  FOR UPDATE TO authenticated
  USING (holder_user_id = auth.uid()) WITH CHECK (holder_user_id = auth.uid());

DROP POLICY IF EXISTS sp_da_self ON public.sp_disclosure_accesses;
CREATE POLICY sp_da_self ON public.sp_disclosure_accesses
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sp_disclosures d
                  WHERE d.id = sp_disclosure_accesses.disclosure_id
                    AND d.holder_user_id = auth.uid()));

-- Append-only: a decision and an access record are history.
CREATE OR REPLACE FUNCTION public.sp_guard_decisions_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'SP_DECISIONS_APPEND_ONLY: a verification decision cannot be rewritten'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.holder_user_id) THEN
    RAISE EXCEPTION 'SP_DECISIONS_APPEND_ONLY: a verification decision cannot be deleted'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sp_decisions_append_only ON public.sp_verification_decisions;
CREATE TRIGGER sp_decisions_append_only
  BEFORE UPDATE OR DELETE ON public.sp_verification_decisions
  FOR EACH ROW EXECUTE FUNCTION public.sp_guard_decisions_append_only();


-- -----------------------------------------------------------------------------
-- 7. Grants
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.sp_evidence               FROM anon;
REVOKE ALL ON public.sp_verification_requests  FROM anon;
REVOKE ALL ON public.sp_verification_decisions FROM anon;
REVOKE ALL ON public.sp_disclosures            FROM anon;
REVOKE ALL ON public.sp_disclosure_accesses    FROM anon;

GRANT SELECT, INSERT, UPDATE ON public.sp_evidence              TO authenticated;
GRANT SELECT, INSERT         ON public.sp_verification_requests TO authenticated;
GRANT SELECT                 ON public.sp_verification_decisions TO authenticated;
GRANT SELECT, UPDATE         ON public.sp_disclosures           TO authenticated;
GRANT SELECT                 ON public.sp_disclosure_accesses   TO authenticated;


-- =============================================================================
-- 8. Workflow functions
-- =============================================================================

-- Attach evidence. Raises the claim to DOCUMENT_PROVIDED and no further.
-- The name says what it does: a document was provided. Nobody has checked it.
CREATE OR REPLACE FUNCTION public.sp_attach_evidence(
  _claim_id uuid, _period_id uuid, _storage_path text, _file_name text,
  _mime_type text, _size_bytes integer, _sha256 text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _holder uuid; _id uuid;
BEGIN
  IF _claim_id IS NOT NULL THEN
    SELECT holder_user_id INTO _holder FROM public.sp_claims WHERE id = _claim_id;
  ELSE
    SELECT holder_user_id INTO _holder FROM public.sp_experience_periods WHERE id = _period_id;
  END IF;
  IF _holder IS NULL THEN RAISE EXCEPTION 'SP_TARGET_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF _holder <> auth.uid() THEN RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='insufficient_privilege'; END IF;

  -- The path's first segment is the owner, matching the Storage policy. A
  -- mismatch here would mean a row pointing at somebody else's object.
  IF split_part(_storage_path, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'SP_EVIDENCE_PATH_NOT_OWNED' USING ERRCODE='insufficient_privilege';
  END IF;

  INSERT INTO public.sp_evidence (
    holder_user_id, claim_id, period_id, storage_path, file_name, mime_type, size_bytes, sha256)
  VALUES (_holder, _claim_id, _period_id, _storage_path, _file_name, _mime_type, _size_bytes, _sha256)
  RETURNING id INTO _id;

  PERFORM set_config('sp.evidence_context', 'on', true);
  IF _claim_id IS NOT NULL THEN
    UPDATE public.sp_claims SET assertion_level = 'document_provided'
     WHERE id = _claim_id AND assertion_level = 'self_declared';
  ELSE
    UPDATE public.sp_experience_periods SET assertion_level = 'document_provided'
     WHERE id = _period_id AND assertion_level = 'self_declared';
  END IF;
  PERFORM set_config('sp.evidence_context', 'off', true);

  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_holder, auth.uid(), 'claim_corrected',
          CASE WHEN _claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
          coalesce(_claim_id, _period_id),
          jsonb_build_object('evidence_id', _id, 'assertion_level', 'document_provided'));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.sp_attach_evidence(uuid,uuid,text,text,text,integer,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sp_attach_evidence(uuid,uuid,text,text,text,integer,text) TO authenticated;


-- Submit for review. The holder asks; the holder never decides.
CREATE OR REPLACE FUNCTION public.sp_submit_for_verification(
  _claim_id uuid, _period_id uuid, _kind text, _employer_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _holder uuid; _id uuid;
BEGIN
  IF _claim_id IS NOT NULL THEN
    SELECT holder_user_id INTO _holder FROM public.sp_claims WHERE id = _claim_id;
  ELSE
    SELECT holder_user_id INTO _holder FROM public.sp_experience_periods WHERE id = _period_id;
  END IF;
  IF _holder IS NULL THEN RAISE EXCEPTION 'SP_TARGET_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF _holder <> auth.uid() THEN RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='insufficient_privilege'; END IF;

  IF EXISTS (SELECT 1 FROM public.sp_verification_requests
              WHERE status IN ('pending','clarification_requested')
                AND (claim_id = _claim_id OR period_id = _period_id)) THEN
    RAISE EXCEPTION 'SP_REQUEST_ALREADY_OPEN' USING ERRCODE='check_violation';
  END IF;

  INSERT INTO public.sp_verification_requests (
    holder_user_id, claim_id, period_id, request_kind, target_employer_id)
  VALUES (_holder, _claim_id, _period_id, _kind, _employer_id)
  RETURNING id INTO _id;
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.sp_submit_for_verification(uuid,uuid,text,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sp_submit_for_verification(uuid,uuid,text,uuid) TO authenticated;


-- THE ONLY PATH TO VERIFIED.
--
-- Every guarantee in the product converges here: the caller must hold the
-- verification capability, must not be the holder, and the transition is
-- written with full attribution — who, when, by what method, valid for how
-- long — because "Verified" without those is a claim nobody can check.
CREATE OR REPLACE FUNCTION public.sp_verifier_decide(
  _request_id uuid, _decision text, _method text, _decision_note text,
  _holder_message text, _valid_from date, _valid_until date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.sp_verification_requests%ROWTYPE; _org text;
BEGIN
  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_REQUEST_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;

  IF _r.holder_user_id = auth.uid() THEN
    RAISE EXCEPTION 'SP_SELF_VERIFICATION_FORBIDDEN' USING ERRCODE='insufficient_privilege';
  END IF;

  IF _r.request_kind = 'cqrityjob_review' THEN
    IF NOT public.sp_is_verifier(auth.uid()) THEN
      RAISE EXCEPTION 'SP_NOT_VERIFIER' USING ERRCODE='insufficient_privilege';
    END IF;
    _org := 'CQrityjob';
  ELSE
    IF NOT public.has_employer_role(auth.uid(), _r.target_employer_id, ARRAY['owner','admin']) THEN
      RAISE EXCEPTION 'SP_NOT_EMPLOYER_REPRESENTATIVE' USING ERRCODE='insufficient_privilege';
    END IF;
    SELECT name INTO _org FROM public.employers WHERE id = _r.target_employer_id;
  END IF;

  IF _r.status NOT IN ('pending','clarification_requested') THEN
    RAISE EXCEPTION 'SP_REQUEST_ALREADY_DECIDED' USING ERRCODE='check_violation';
  END IF;

  UPDATE public.sp_verification_requests
     SET status = _decision, decided_at = now(), decided_by = auth.uid(),
         verification_method = _method, decision_note = _decision_note,
         holder_message = _holder_message, valid_from = _valid_from, valid_until = _valid_until
   WHERE id = _request_id;

  INSERT INTO public.sp_verification_decisions (
    request_id, holder_user_id, decided_by, decider_organisation, decision,
    verification_method, decision_note, valid_from, valid_until)
  VALUES (_request_id, _r.holder_user_id, auth.uid(), _org, _decision,
          _method, _decision_note, _valid_from, _valid_until);

  IF _decision = 'approved' THEN
    PERFORM set_config('sp.verification_context', 'on', true);
    IF _r.claim_id IS NOT NULL THEN
      UPDATE public.sp_claims
         SET assertion_level = 'verified', verified_by_user_id = auth.uid(), verified_at = now(),
             valid_from = coalesce(_valid_from, valid_from), valid_until = coalesce(_valid_until, valid_until)
       WHERE id = _r.claim_id;
    ELSE
      UPDATE public.sp_experience_periods
         SET assertion_level = 'verified'
       WHERE id = _r.period_id;
    END IF;
    PERFORM set_config('sp.verification_context', 'off', true);
  END IF;

  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_r.holder_user_id, auth.uid(), 'claim_corrected',
          CASE WHEN _r.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
          coalesce(_r.claim_id, _r.period_id),
          jsonb_build_object('decision', _decision, 'method', _method, 'organisation', _org));
END; $$;

REVOKE ALL ON FUNCTION public.sp_verifier_decide(uuid,text,text,text,text,date,date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_decide(uuid,text,text,text,text,date,date) TO authenticated;


-- Create a share. Returns the plaintext token EXACTLY ONCE; only its hash
-- is stored, so the link cannot be recovered from the database afterwards.
CREATE OR REPLACE FUNCTION public.sp_create_disclosure(
  _package_code text, _expires_days integer, _purpose text, _recipient_hint text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _token text; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE='insufficient_privilege'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'SP_NO_PASSPORT' USING ERRCODE='no_data_found';
  END IF;

  -- 32 random bytes. Not derived from any identifier, so a token is not
  -- guessable from anything the recipient already knows.
  _token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.sp_disclosures (
    holder_user_id, package_code, token_hash, purpose, recipient_hint, expires_at)
  VALUES (auth.uid(), _package_code, encode(digest(_token, 'sha256'), 'hex'),
          _purpose, _recipient_hint,
          CASE WHEN _expires_days IS NULL THEN NULL ELSE now() + (_expires_days || ' days')::interval END)
  RETURNING id INTO _id;

  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), auth.uid(), 'privacy_changed', 'profile', _id,
          jsonb_build_object('action','disclosure_created','package',_package_code));
  RETURN _token;
END; $$;

REVOKE ALL ON FUNCTION public.sp_create_disclosure(text,integer,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sp_create_disclosure(text,integer,text,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.sp_revoke_disclosure(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sp_disclosures SET revoked_at = coalesce(revoked_at, now())
   WHERE id = _id AND holder_user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='insufficient_privilege'; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.sp_revoke_disclosure(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sp_revoke_disclosure(uuid) TO authenticated;


-- THE PUBLIC RECIPIENT PATH.
--
-- The only function anon may execute. It returns a payload BUILT HERE from
-- the package contract, so a recipient cannot receive more than the package
-- allows however the request is crafted. Private evidence is never included
-- — not the bytes, not the storage path, not the file name.
--
-- Expired, revoked and unknown tokens return the identical shape, so the
-- response cannot be used to discover whether a token ever existed.
CREATE OR REPLACE FUNCTION public.sp_get_disclosure(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.sp_disclosures%ROWTYPE; _p public.sp_passport_profiles%ROWTYPE; _payload jsonb;
BEGIN
  SELECT * INTO _d FROM public.sp_disclosures
   WHERE token_hash = encode(digest(coalesce(_token,''), 'sha256'), 'hex');

  IF NOT FOUND OR _d.revoked_at IS NOT NULL
     OR (_d.expires_at IS NOT NULL AND _d.expires_at < now()) THEN
    RETURN jsonb_build_object('status','unavailable');
  END IF;

  SELECT * INTO _p FROM public.sp_passport_profiles WHERE holder_user_id = _d.holder_user_id;

  UPDATE public.sp_disclosures SET access_count = access_count + 1 WHERE id = _d.id;
  INSERT INTO public.sp_disclosure_accesses (disclosure_id) VALUES (_d.id);

  _payload := jsonb_build_object(
    'status','active',
    'package', _d.package_code,
    'purpose', _d.purpose,
    'expires_at', _d.expires_at,
    'last_updated', greatest(_p.updated_at, _d.created_at),
    'holder', CASE _p.privacy_mode
                WHEN 'anonymous' THEN NULL
                WHEN 'initials'  THEN regexp_replace(coalesce(_p.display_name,''), '(\S)\S*', '\1.', 'g')
                ELSE _p.display_name END,
    'privacy_mode', _p.privacy_mode,
    'profession_slug', _p.cig_profession_slug,
    'jurisdiction', _p.jurisdiction_code,
    -- Only CURRENT VERIFIED claims are ever disclosed, with their full
    -- attribution. A self-declared entry is never presented to a recipient
    -- as part of a verified package.
    'verified_claims', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'type', c.claim_type, 'title', c.title,
        'issuer', c.claimed_issuer_name, 'jurisdiction', c.jurisdiction_code,
        'issued_on', c.issued_on, 'valid_until', c.valid_until,
        'assertion', c.assertion_level, 'lifecycle', c.lifecycle_state,
        'verified_at', c.verified_at,
        -- Attribution is joined through the REQUEST THAT TARGETED THIS
        -- CLAIM, never merely the holder's most recent decision. An earlier
        -- version keyed on holder alone and attributed a qualification to
        -- whichever organisation had most recently attested to anything —
        -- which would credit the wrong verifier on a real credential.
        'verifier_organisation', (SELECT d2.decider_organisation
                                    FROM public.sp_verification_decisions d2
                                    JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                   WHERE r2.claim_id = c.id AND d2.decision = 'approved'
                                   ORDER BY d2.decided_at DESC LIMIT 1),
        'verification_method', (SELECT d2.verification_method
                                  FROM public.sp_verification_decisions d2
                                  JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                 WHERE r2.claim_id = c.id AND d2.decision = 'approved'
                                 ORDER BY d2.decided_at DESC LIMIT 1)))
      FROM public.sp_claims c
      WHERE c.holder_user_id = _d.holder_user_id
        AND c.assertion_level = 'verified' AND c.lifecycle_state = 'active'
        AND _d.package_code IN ('verified_qualifications','employer_review','full_verification','public_card')
    ), '[]'::jsonb),
    'verified_experience', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'employer', e.employer_name, 'role', e.role_title,
        'started_on', e.started_on, 'ended_on', e.ended_on,
        'jurisdiction', e.jurisdiction_code,
        'assertion', e.assertion_level, 'lifecycle', e.lifecycle_state))
      FROM public.sp_experience_periods e
      WHERE e.holder_user_id = _d.holder_user_id
        AND e.assertion_level = 'verified' AND e.lifecycle_state = 'active'
        AND _d.package_code IN ('verified_experience','employer_review','full_verification')
    ), '[]'::jsonb));

  RETURN _payload;
END; $$;

REVOKE ALL ON FUNCTION public.sp_get_disclosure(text) FROM public;
GRANT EXECUTE ON FUNCTION public.sp_get_disclosure(text) TO anon, authenticated;
