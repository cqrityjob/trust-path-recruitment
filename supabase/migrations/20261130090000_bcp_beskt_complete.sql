-- ===========================================================================
-- 20261130090000 -- BESKT as a complete product: security vetting (B, E, S, K
--                   and T), standalone invitations, the completed FAKTA chain,
--                   the human stance and the follow-up actions
-- ===========================================================================
--
-- OWNER DECISION 2026-09-19: "Slutför BESKT som en komplett produkt i
-- CQrityjob" -- the whole method, E, S and K included, reachable from the
-- employer's Testbibliotek, with no review fabricated and nothing labelled
-- validated.
--
-- WHAT CHANGES, AND ONLY THAT
--
--   1. The security-vetting mode gets a runtime. Its three activation
--      requirements (20261108090000, beskt_activation_requirements) become
--      runtime facts on each assignment: the employer's own attestation that
--      the role is security-sensitive, its stated lawful basis, and an
--      appointed security owner from the employer's authorised security
--      function (bcp_security_officers, appointed by the employer's owner or
--      admin). Only that function starts, reads, conducts or reports a
--      security vetting -- at the assignment, in every party-read policy, and
--      at the interview case itself (scp_iv_can_read_case / _write_case).
--
--   2. A standalone invitation (bcp_invitations): an assignment that is not
--      about a job application, bound to the person who accepts it while
--      signed in with the invited, confirmed address. No application is
--      invented; job_id/application_id become nullable, exactly one spine is
--      present, and scp_iv_create_case binds that person to a case only
--      through an invitation they accepted.
--
--   3. New assignments carry a purpose-specific governed notice with the
--      employer's contact route; the first notice is unchanged.
--
--   4. Candidate supplements after submission, append-only.
--
--   5. §4.5-4.6: an explicit answer that fired a governed show-rule becomes
--      its own interview topic with the rule key; the interviewer's
--      preparation is three lists with provenance.
--
--   6. §5.2-5.3: the rest of the FAKTA chain on each observation, each its own
--      column.
--
--   7. §6: the responsible human's stance (sufficiency with reason, stance,
--      rationale, name, role) and the follow-up actions (what, who, by when,
--      status, review date). The report blockers now require a stance: a
--      signature alone never finalises. Both ride the frozen, previewed basis.
--
-- WHAT DOES NOT CHANGE
--
--   Nothing is reviewed, published or labelled validated here. The release
--   gate is unchanged: a published version under a pilot grant, or the
--   owner's recorded internal activation (20261129090000). No score, rank,
--   risk class or recommendation is representable. bcp_version_is_candidate_safe
--   and bcp_assign keep their exact meaning; the new mode-aware predicate is
--   bcp_version_is_runnable. Every re-created body is md5-pinned below and
--   restored verbatim by the rollback.
--
-- Rollback: supabase/rollback/20261130090000_bcp_beskt_complete_rollback.sql
-- ===========================================================================

DO $pre$
DECLARE _n integer; _md5 text;
BEGIN
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'scp_iv_can_read_case';
  IF _n <> 1 OR _md5 <> 'ab702ede783d97d78a730de52cd197f2' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: scp_iv_can_read_case is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'scp_iv_can_write_case';
  IF _n <> 1 OR _md5 <> '93e71cd11e0de4345e003140947893bd' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: scp_iv_can_write_case is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'scp_iv_create_case';
  IF _n <> 1 OR _md5 <> '945372c712b96b9c29f0683f5bae70ec' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: scp_iv_create_case is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_employer_can_read_assignment';
  IF _n <> 1 OR _md5 <> 'b83a70eae81f318c436c50846688dbbe' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_employer_can_read_assignment is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_party_can_read_method_version';
  IF _n <> 1 OR _md5 <> '78db634ed36fcc975886e872b1a67f3a' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_party_can_read_method_version is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_version_is_structurally_candidate_safe';
  IF _n <> 1 OR _md5 <> 'eb73148d35f25e135e800a4f5e09574b' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_version_is_structurally_candidate_safe is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_assignable_method_versions';
  IF _n <> 1 OR _md5 <> '1efd54d66a2e827d5a4bc763826d877f' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_assignable_method_versions is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_assignable_exposure_profiles';
  IF _n <> 1 OR _md5 <> '2d9fba1e411f8c9a8f589a691eacb3ea' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_assignable_exposure_profiles is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_save_answers';
  IF _n <> 1 OR _md5 <> '036a726d4b0665cc31c45770132c9ebb' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_save_answers is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_candidate_preparation';
  IF _n <> 1 OR _md5 <> 'e0842f8b8823fb5496e6e5e6adab9782' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_candidate_preparation is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_employer_assignments';
  IF _n <> 1 OR _md5 <> 'f09ffaeb5ca3473e59c99c4910474f0e' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_employer_assignments is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_case_preparation_basis';
  IF _n <> 1 OR _md5 <> '00cd8a959536456b7b45285a6ae7b78d' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_case_preparation_basis is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_linkable_interview_cases';
  IF _n <> 1 OR _md5 <> '24defa1951aa4796aad136bff10d08eb' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_linkable_interview_cases is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_unlink_preparation_from_case';
  IF _n <> 1 OR _md5 <> 'a709479455171b80287650f522c98534' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_unlink_preparation_from_case is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_link_preparation_to_case';
  IF _n <> 1 OR _md5 <> 'eb08d453eba12c5d7dad34e1d32c4e14' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_link_preparation_to_case is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_guard_case_link';
  IF _n <> 1 OR _md5 <> 'b54d4695599fdec8cb6a629fc55bb534' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_guard_case_link is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_guard_case_topic';
  IF _n <> 1 OR _md5 <> '2f5c68ec3d3d44b29da43425a0002855' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_guard_case_topic is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_guard_assignment';
  IF _n <> 1 OR _md5 <> 'd71f08d70abfb27a799dd4068c7b616e' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_guard_assignment is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_guard_conduct_entry';
  IF _n <> 1 OR _md5 <> '810ec8d79dbb9455cf2ef3df0ef015ec' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_guard_conduct_entry is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_conduct_save_entry';
  IF _n <> 1 OR _md5 <> 'a7147256e257190ef567cea1776e00be' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_conduct_save_entry is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_conduct_workspace';
  IF _n <> 1 OR _md5 <> '8a8b9889c50f0bc03ae35f43e218bb86' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_conduct_workspace is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_conduct_entry_history';
  IF _n <> 1 OR _md5 <> 'dc03d230f9da655235af56f5dbe0ee34' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_conduct_entry_history is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_conduct_build_report_basis';
  IF _n <> 1 OR _md5 <> '933a941b6fb8a502807d8c582f7d22f3' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_conduct_build_report_basis is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_conduct_report_blockers';
  IF _n <> 1 OR _md5 <> '286f9bec7e6bea3bf68823756eefff84' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_conduct_report_blockers is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_conduct_topic_prompts';
  IF _n <> 1 OR _md5 <> '8eed9c0dd9b0b910262aa92627de7d7d' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_conduct_topic_prompts is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_notice_copy_digest';
  IF _n <> 1 OR _md5 <> '1183ff140143529234326937a2685d58' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_notice_copy_digest is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_notice_descriptor';
  IF _n <> 1 OR _md5 <> 'e98e31779bfb79d8c971111a2d2e1b04' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_notice_descriptor is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_candidate_assignments';
  IF _n <> 1 OR _md5 <> 'b5b16a2cae551842e537d0c1a6192fbc' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PRECONDITION: bcp_candidate_assignments is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
END $pre$;

-- ###########################################################################
-- SECTION 1 -- The employer's authorised security function
-- ###########################################################################
--
-- PR 1 section 3 made security-vetting content readable by the
-- `authorised_security_function` only, and beskt_activation_requirements
-- names "authorised_security_owner_assigned" as a precondition. Until now no
-- runtime fact could satisfy it. This is that fact: an employer owner or
-- admin appoints named members of their own organisation. Appointment is a
-- recorded, reasoned, revocable decision of the EMPLOYER -- never of
-- CQrityjob, never a review of the method.
CREATE TABLE public.bcp_security_officers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  appointed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  appointed_at timestamptz NOT NULL DEFAULT now(),
  appointment_reason text NOT NULL CHECK (length(btrim(appointment_reason)) >= 3),
  appoint_operation_id uuid NOT NULL UNIQUE,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revoke_reason text,
  revoke_operation_id uuid UNIQUE,
  CONSTRAINT bcp_security_officers_revocation_shape CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL AND revoke_operation_id IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL
        AND length(btrim(coalesce(revoke_reason, ''))) >= 3 AND revoke_operation_id IS NOT NULL))
);

COMMENT ON TABLE public.bcp_security_officers IS
  'The employer''s appointed authorised security function: the only employer '
  'members who may start, read, conduct or report a BESKT security-vetting '
  'assignment. Appointed and revoked by the employer''s owner or admin, with a '
  'reason. Append-only apart from revocation.';

CREATE UNIQUE INDEX bcp_security_officers_live_idx
  ON public.bcp_security_officers (employer_id, user_id) WHERE revoked_at IS NULL;
CREATE INDEX bcp_security_officers_user_idx ON public.bcp_security_officers (user_id);

CREATE OR REPLACE FUNCTION public.bcp_guard_security_officer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('bcp.security_officer_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'BCP_SECURITY_OFFICER_UNGOVERNED_WRITE: appointments change only through the governed functions.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_SECURITY_OFFICER_APPEND_ONLY: an appointment is revoked, never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.revoked_at IS NOT NULL
       OR NEW.id <> OLD.id OR NEW.employer_id <> OLD.employer_id OR NEW.user_id <> OLD.user_id
       OR NEW.appointed_by <> OLD.appointed_by OR NEW.appointed_at <> OLD.appointed_at
       OR NEW.appointment_reason <> OLD.appointment_reason
       OR NEW.appoint_operation_id <> OLD.appoint_operation_id THEN
      RAISE EXCEPTION 'BCP_SECURITY_OFFICER_IMMUTABLE: only an unrevoked appointment may be revoked, and nothing else changes.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER bcp_security_officers_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.bcp_security_officers
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_security_officer();

-- Is this person an appointed security officer of this employer right now?
-- Membership is re-checked: a person who left the organisation holds nothing.
CREATE OR REPLACE FUNCTION public.bcp_is_security_officer(_employer_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL
     AND public.has_employer_role(_user_id, _employer_id, ARRAY['owner', 'admin', 'member'])
     AND EXISTS (SELECT 1 FROM public.bcp_security_officers o
                  WHERE o.employer_id = _employer_id AND o.user_id = _user_id
                    AND o.revoked_at IS NULL);
$$;

CREATE OR REPLACE FUNCTION public.bcp_appoint_security_officer(
  _operation_id uuid, _employer_id uuid, _user_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _request jsonb; _hash text; _replay jsonb; _id uuid; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'bcp_appoint_security_officer', 'employer_id', _employer_id,
    'user_id', _user_id, 'reason', _reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  IF NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_ADMIN: only the employer''s owner or an admin appoints its security function.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_employer_role(_user_id, _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_OFFICER_NOT_MEMBER: only an active member of this employer can be appointed.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_REASON_REQUIRED: say why this person is appointed.' USING ERRCODE = 'check_violation';
  END IF;
  IF public.bcp_is_security_officer(_employer_id, _user_id) THEN
    RAISE EXCEPTION 'BCP_OFFICER_EXISTS: this person is already appointed.' USING ERRCODE = 'unique_violation';
  END IF;

  PERFORM set_config('bcp.security_officer_write', 'on', true);
  INSERT INTO public.bcp_security_officers
    (employer_id, user_id, appointed_by, appointment_reason, appoint_operation_id)
  VALUES (_employer_id, _user_id, auth.uid(), btrim(_reason), _operation_id)
  RETURNING id INTO _id;
  PERFORM set_config('bcp.security_officer_write', 'off', true);

  _result := jsonb_build_object('officer_id', _id, 'employer_id', _employer_id, 'user_id', _user_id);
  PERFORM public.bcp_record_event(NULL, NULL, _employer_id, NULL, 'security_officer_appointed',
    NULL, NULL, btrim(_reason), NULL, NULL, _operation_id, _hash, _result);
  RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.bcp_revoke_security_officer(
  _operation_id uuid, _officer_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.bcp_security_officers%ROWTYPE; _request jsonb; _hash text; _replay jsonb; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'bcp_revoke_security_officer', 'officer_id', _officer_id, 'reason', _reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _o FROM public.bcp_security_officers WHERE id = _officer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_OFFICER_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.has_employer_role(auth.uid(), _o.employer_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_ADMIN: only the employer''s owner or an admin changes its security function.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _o.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_OFFICER_ALREADY_REVOKED' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_REASON_REQUIRED: say why the appointment ends.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('bcp.security_officer_write', 'on', true);
  UPDATE public.bcp_security_officers
     SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = btrim(_reason),
         revoke_operation_id = _operation_id
   WHERE id = _officer_id;
  PERFORM set_config('bcp.security_officer_write', 'off', true);
  _result := jsonb_build_object('officer_id', _officer_id, 'revoked', true);
  PERFORM public.bcp_record_event(NULL, NULL, _o.employer_id, NULL, 'security_officer_revoked',
    NULL, NULL, btrim(_reason), NULL, NULL, _operation_id, _hash, _result);
  RETURN _result;
END $$;

-- The employer's members, with whether each holds the security function.
-- Readable by any member: who may see vetting material is not a secret
-- inside the organisation, and the start dialog needs the list.
CREATE OR REPLACE FUNCTION public.bcp_employer_people(_employer_id uuid)
RETURNS TABLE(user_id uuid, display_name text, email text, employer_role text,
              is_security_officer boolean, officer_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id,
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email)::text,
         u.email::text, m.role,
         o.id IS NOT NULL, o.id
    FROM public.employer_memberships m
    JOIN auth.users u ON u.id = m.user_id
    LEFT JOIN public.bcp_security_officers o
      ON o.employer_id = m.employer_id AND o.user_id = m.user_id AND o.revoked_at IS NULL
   WHERE m.employer_id = _employer_id
     AND m.status = 'active'
     AND auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
   ORDER BY 2, 1;
$$;


-- ###########################################################################
-- SECTION 2 -- The assignment carries purpose, role, people and, for security
--              vetting, the employer's attestation and lawful basis
-- ###########################################################################
--
-- EXPAND only: every existing row stays valid, every existing column keeps
-- its meaning. A recruitment assignment made from an application is exactly
-- what it was. What is new is representable, and is constrained so that a
-- security-vetting assignment cannot exist without its three activation
-- requirements satisfied ON THE ROW: attestation, lawful basis and an
-- appointed security owner.

ALTER TABLE public.bcp_assignments DROP CONSTRAINT bcp_assignments_mode_check;
ALTER TABLE public.bcp_assignments
  ADD CONSTRAINT bcp_assignments_mode_check
    CHECK (mode IN ('recruitment_support', 'security_vetting_support'));

-- A standalone invitation has no job application. It is not given a
-- fabricated one: the columns become nullable and the invitation that bound
-- the candidate is named instead. Exactly one of the two spines is present.
ALTER TABLE public.bcp_assignments ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE public.bcp_assignments ALTER COLUMN application_id DROP NOT NULL;

ALTER TABLE public.bcp_assignments
  ADD COLUMN invitation_id uuid,
  ADD COLUMN role_title text,
  ADD COLUMN responsible_interviewer_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN contact_statement text,
  ADD COLUMN security_owner_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN role_security_attestation text,
  ADD COLUMN lawful_basis_statement text;

ALTER TABLE public.bcp_assignments
  ADD CONSTRAINT bcp_assignments_spine_check CHECK (
    (application_id IS NOT NULL AND job_id IS NOT NULL AND invitation_id IS NULL)
    OR (application_id IS NULL AND job_id IS NULL AND invitation_id IS NOT NULL
        AND length(btrim(coalesce(role_title, ''))) > 0)),
  ADD CONSTRAINT bcp_assignments_vetting_requirements_check CHECK (
    mode <> 'security_vetting_support'
    OR (security_owner_id IS NOT NULL
        AND length(btrim(coalesce(role_security_attestation, ''))) >= 20
        AND length(btrim(coalesce(lawful_basis_statement, ''))) >= 20)),
  ADD CONSTRAINT bcp_assignments_text_bounds_check CHECK (
    length(coalesce(role_title, '')) <= 200
    AND length(coalesce(contact_statement, '')) <= 1000
    AND length(coalesce(role_security_attestation, '')) <= 2000
    AND length(coalesce(lawful_basis_statement, '')) <= 2000);

CREATE INDEX bcp_assignments_invitation_idx ON public.bcp_assignments (invitation_id);
CREATE UNIQUE INDEX bcp_assignments_live_invitation_idx
  ON public.bcp_assignments (invitation_id) WHERE invitation_id IS NOT NULL AND lifecycle_state <> 'cancelled';

COMMENT ON COLUMN public.bcp_assignments.role_security_attestation IS
  'Security vetting only: the employer''s own attestation, in its own words, '
  'that the role is security-sensitive (säkerhetsskyddslagen 3 kap.). The '
  'employer''s statement, never CQrityjob''s.';
COMMENT ON COLUMN public.bcp_assignments.lawful_basis_statement IS
  'Security vetting only: the employer''s documented lawful basis for this '
  'preparation. Stated by the employer; nothing here creates one.';

-- The employer-side party of an assignment. Recruitment: any active member.
-- Security vetting: an appointed security officer and nobody else -- the
-- `authorised_security_function` of PR 1 section 3, as a runtime rule.
CREATE OR REPLACE FUNCTION public.bcp_employer_party(_assignment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bcp_assignments a
     WHERE a.id = _assignment_id
       AND public.has_employer_role(auth.uid(), a.employer_id, ARRAY['owner', 'admin', 'member'])
       AND (a.mode = 'recruitment_support'
            OR public.bcp_is_security_officer(a.employer_id, auth.uid())));
$$;

-- The same rule for an interview case: a case that carries a live link to a
-- security-vetting preparation is the security function's alone.
CREATE OR REPLACE FUNCTION public.bcp_case_vetting_restricted(_case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bcp_case_links l
      JOIN public.bcp_assignments a ON a.id = l.assignment_id
     WHERE l.case_id = _case_id AND l.unlinked_at IS NULL
       AND a.mode = 'security_vetting_support');
$$;

CREATE OR REPLACE FUNCTION public.bcp_case_access_ok(_case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.bcp_case_vetting_restricted(_case_id)
      OR public.bcp_is_security_officer(public.scp_iv_case_employer(_case_id), auth.uid());
$$;


-- ###########################################################################
-- SECTION 3 -- The standalone invitation
-- ###########################################################################
--
-- For an assignment that is not about a job application. The employer names
-- the person by e-mail; the person accepts while signed in with that
-- CONFIRMED address, and only then does an assignment exist, bound to that
-- account. There is no application, and none is invented. The token is shown
-- once and stored as a SHA-256 digest.
CREATE TABLE public.bcp_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  invited_email text NOT NULL CHECK (invited_email = lower(btrim(invited_email)) AND invited_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  candidate_display_name text CHECK (length(coalesce(candidate_display_name, '')) <= 200),
  role_title text NOT NULL CHECK (length(btrim(role_title)) BETWEEN 1 AND 200),
  mode text NOT NULL CHECK (mode IN ('recruitment_support', 'security_vetting_support')),
  method_version_id uuid NOT NULL REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  exposure_profile_id uuid NOT NULL REFERENCES public.beskt_exposure_profiles(id) ON DELETE RESTRICT,
  pinned_content_hash text NOT NULL CHECK (pinned_content_hash ~ '^[0-9a-f]{64}$'),
  notice_version text NOT NULL,
  responsible_interviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  contact_statement text NOT NULL CHECK (length(btrim(contact_statement)) BETWEEN 3 AND 1000),
  security_owner_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  role_security_attestation text,
  lawful_basis_statement text,
  due_at timestamptz,
  token_digest text NOT NULL UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'accepted', 'revoked')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  create_operation_id uuid NOT NULL UNIQUE,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  accepted_at timestamptz,
  assignment_id uuid REFERENCES public.bcp_assignments(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revoke_reason text,
  CONSTRAINT bcp_invitations_vetting_check CHECK (
    mode <> 'security_vetting_support'
    OR (security_owner_id IS NOT NULL
        AND length(btrim(coalesce(role_security_attestation, ''))) >= 20
        AND length(btrim(coalesce(lawful_basis_statement, ''))) >= 20)),
  CONSTRAINT bcp_invitations_state_shape CHECK (
    (state = 'pending' AND accepted_at IS NULL AND revoked_at IS NULL AND assignment_id IS NULL)
    OR (state = 'accepted' AND accepted_at IS NOT NULL AND accepted_by IS NOT NULL
        AND assignment_id IS NOT NULL AND revoked_at IS NULL)
    OR (state = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL
        AND length(btrim(coalesce(revoke_reason, ''))) >= 3)),
  CONSTRAINT bcp_invitations_window_check CHECK (expires_at > created_at)
);

COMMENT ON TABLE public.bcp_invitations IS
  'A standalone BESKT invitation by e-mail, for an assignment that is not '
  'about a job application. Becomes an assignment only when the invited '
  'person accepts while signed in with that confirmed address. The token is '
  'stored as a SHA-256 digest; the clear token is returned once to the '
  'employer and never stored.';

CREATE INDEX bcp_invitations_employer_idx ON public.bcp_invitations (employer_id, created_at DESC);
CREATE INDEX bcp_invitations_email_idx ON public.bcp_invitations (invited_email);

ALTER TABLE public.bcp_assignments
  ADD CONSTRAINT bcp_assignments_invitation_fk
    FOREIGN KEY (invitation_id) REFERENCES public.bcp_invitations(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.bcp_guard_invitation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('bcp.invitation_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'BCP_INVITATION_UNGOVERNED_WRITE: invitations change only through the governed functions.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_INVITATION_APPEND_ONLY: an invitation is revoked, never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.state <> 'pending'
       OR NEW.id <> OLD.id OR NEW.employer_id <> OLD.employer_id
       OR NEW.invited_email <> OLD.invited_email OR NEW.role_title <> OLD.role_title
       OR NEW.mode <> OLD.mode OR NEW.method_version_id <> OLD.method_version_id
       OR NEW.exposure_profile_id <> OLD.exposure_profile_id
       OR NEW.pinned_content_hash <> OLD.pinned_content_hash
       OR NEW.token_digest <> OLD.token_digest
       OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'BCP_INVITATION_IMMUTABLE: only a pending invitation moves, to accepted or revoked.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER bcp_invitations_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.bcp_invitations
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_invitation();


-- ###########################################################################
-- SECTION 4 -- Candidate supplements after submission
-- ###########################################################################
--
-- §4.2: "Efter inlämning låses versionen. Rättelse skapar en ny version eller
-- dokumenterad komplettering." The submitted snapshot stays immutable and
-- hashed; a supplement is a separate, dated, append-only statement by the
-- candidate, visible to the employer party and carried into the interview
-- and the report as the candidate's own words.
CREATE TABLE public.bcp_candidate_supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.bcp_assignments(id) ON DELETE RESTRICT,
  response_id uuid NOT NULL REFERENCES public.bcp_responses(id) ON DELETE RESTRICT,
  candidate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  item_key text CHECK (item_key IS NULL OR item_key ~ '^[a-z0-9][a-z0-9_]*$'),
  supplement_kind text NOT NULL CHECK (supplement_kind IN ('correction', 'addition')),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 3 AND 2000),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  operation_id uuid NOT NULL UNIQUE
);

COMMENT ON TABLE public.bcp_candidate_supplements IS
  'A candidate''s documented correction or addition after submission. '
  'Append-only; the submitted snapshot is never changed by it.';

CREATE INDEX bcp_candidate_supplements_assignment_idx
  ON public.bcp_candidate_supplements (assignment_id, submitted_at);

CREATE TRIGGER bcp_candidate_supplements_append_only
  BEFORE UPDATE OR DELETE ON public.bcp_candidate_supplements
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_append_only();


-- ###########################################################################
-- SECTION 5 -- The human stance and the follow-up actions
-- ###########################################################################
--
-- §6 points 6-8: the sufficiency of the basis, the responsible human's own
-- stance with its reasoning, and the actions with owner, deadline and review
-- date. Written by a person, never generated: there is no default text, no
-- template and no column a system could fill. A signature alone no longer
-- finalises a report -- the report blockers require a recorded stance.
CREATE TABLE public.bcp_conduct_stances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.bcp_conduct_sessions(id) ON DELETE RESTRICT,
  sufficiency text NOT NULL CHECK (sufficiency IN ('sufficient', 'more_information_required')),
  sufficiency_reason text NOT NULL CHECK (length(btrim(sufficiency_reason)) >= 10),
  stance text NOT NULL CHECK (length(btrim(stance)) >= 10),
  rationale text NOT NULL CHECK (length(btrim(rationale)) >= 10),
  decided_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_by_name text NOT NULL CHECK (length(btrim(decided_by_name)) >= 2),
  decided_role text NOT NULL CHECK (length(btrim(decided_role)) >= 2),
  decided_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  supersedes_stance_id uuid REFERENCES public.bcp_conduct_stances(id) ON DELETE RESTRICT,
  correction_reason text,
  operation_id uuid NOT NULL UNIQUE,
  CONSTRAINT bcp_conduct_stances_correction_shape CHECK (
    (version = 1 AND supersedes_stance_id IS NULL AND correction_reason IS NULL)
    OR (version > 1 AND supersedes_stance_id IS NOT NULL
        AND length(btrim(coalesce(correction_reason, ''))) >= 3)),
  UNIQUE (session_id, version)
);

COMMENT ON TABLE public.bcp_conduct_stances IS
  'The responsible human''s documented stance on a BESKT conversation: '
  'whether the basis is sufficient and why, the stance itself and its '
  'reasoning, by a named person in a named role. Append-only; a change is a '
  'new version that states why. Never generated.';

CREATE TRIGGER bcp_conduct_stances_append_only
  BEFORE UPDATE OR DELETE ON public.bcp_conduct_stances
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_conduct_append_only();

CREATE TABLE public.bcp_conduct_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.bcp_conduct_sessions(id) ON DELETE RESTRICT,
  action_key uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  description text NOT NULL CHECK (length(btrim(description)) >= 3),
  responsible text NOT NULL CHECK (length(btrim(responsible)) >= 2),
  due_on date,
  status text NOT NULL CHECK (status IN ('planned', 'in_progress', 'done', 'cancelled')),
  review_on date,
  note text,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  operation_id uuid NOT NULL UNIQUE,
  UNIQUE (action_key, version)
);

COMMENT ON TABLE public.bcp_conduct_actions IS
  'Measures and follow-up for a BESKT conversation: what, who is '
  'responsible, by when, its status and when it is reviewed. Append-only; '
  'an update is a new version of the same action_key.';

CREATE INDEX bcp_conduct_actions_session_idx ON public.bcp_conduct_actions (session_id, action_key, version);
CREATE INDEX bcp_conduct_stances_session_idx ON public.bcp_conduct_stances (session_id, version);

CREATE TRIGGER bcp_conduct_actions_append_only
  BEFORE UPDATE OR DELETE ON public.bcp_conduct_actions
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_conduct_append_only();


-- ###########################################################################
-- SECTION 6 -- The FAKTA chain, completed on the observation
-- ###########################################################################
--
-- §5.2-5.3: the entry already separates the fact, the candidate's own
-- explanation, the interviewer's interpretation, an alternative explanation,
-- the protective factor and verification. These are the rest of the chain,
-- each its own column for the same reason: timing and currency, consequence,
-- supporting and contradicting information, measures taken, the concrete
-- link to the role, the information gap that remains, and the candidate's
-- own response to the facts read back.
ALTER TABLE public.bcp_conduct_entries
  ADD COLUMN event_timing text,
  ADD COLUMN consequence text,
  ADD COLUMN supporting_information text,
  ADD COLUMN contradicting_information text,
  ADD COLUMN measures_taken text,
  ADD COLUMN role_link text,
  ADD COLUMN information_gap text,
  ADD COLUMN candidate_response text;

ALTER TABLE public.bcp_conduct_entries DROP CONSTRAINT bcp_conduct_entries_not_empty;
ALTER TABLE public.bcp_conduct_entries
  ADD CONSTRAINT bcp_conduct_entries_not_empty CHECK (
    length(btrim(coalesce(observable_fact, ''))) > 0
    OR length(btrim(coalesce(candidate_explanation, ''))) > 0
    OR length(btrim(coalesce(interviewer_interpretation, ''))) > 0
    OR length(btrim(coalesce(alternative_explanation, ''))) > 0
    OR length(btrim(coalesce(protective_factor, ''))) > 0
    OR length(btrim(coalesce(verification_need, ''))) > 0
    OR length(btrim(coalesce(event_timing, ''))) > 0
    OR length(btrim(coalesce(consequence, ''))) > 0
    OR length(btrim(coalesce(supporting_information, ''))) > 0
    OR length(btrim(coalesce(contradicting_information, ''))) > 0
    OR length(btrim(coalesce(measures_taken, ''))) > 0
    OR length(btrim(coalesce(role_link, ''))) > 0
    OR length(btrim(coalesce(information_gap, ''))) > 0
    OR length(btrim(coalesce(candidate_response, ''))) > 0);


-- ###########################################################################
-- SECTION 7 -- Candidate-triggered interview topics
-- ###########################################################################
--
-- §4.5 rows 1-2 and §4.6 list 2: an explicit answer that opened governed
-- follow-up questions becomes its own neutral interview topic, carrying the
-- rule that fired. The reason names what the CANDIDATE did -- disclosed
-- something the method follows up -- and nothing about what it means.
ALTER TABLE public.bcp_case_topics DROP CONSTRAINT bcp_case_topics_topic_reason_check;
ALTER TABLE public.bcp_case_topics
  ADD CONSTRAINT bcp_case_topics_topic_reason_check
    CHECK (topic_reason IN ('omitted', 'discuss_orally', 'candidate_disclosed')),
  ADD COLUMN trigger_rule_key text CHECK (trigger_rule_key IS NULL OR trigger_rule_key ~ '^[a-z0-9][a-z0-9_]*$'),
  ADD CONSTRAINT bcp_case_topics_trigger_shape
    CHECK ((topic_reason = 'candidate_disclosed') = (trigger_rule_key IS NOT NULL));

ALTER TABLE public.bcp_case_links ALTER COLUMN application_id DROP NOT NULL;


-- ###########################################################################
-- SECTION 8 -- Events
-- ###########################################################################
ALTER TABLE public.bcp_events DROP CONSTRAINT bcp_events_event_check;
ALTER TABLE public.bcp_events ADD CONSTRAINT bcp_events_event_check CHECK (event IN (
  'assignment_created', 'notice_acknowledged', 'response_saved', 'response_submitted',
  'assignment_cancelled', 'assignment_opened', 'pilot_granted', 'pilot_revoked',
  'case_linked', 'case_unlinked', 'conduct_session_started', 'conduct_entry_saved',
  'conduct_entry_corrected', 'conduct_verification_requested', 'conduct_verification_updated',
  'conduct_position_locked', 'conduct_position_reopened', 'conduct_panel_opened',
  'conduct_panel_revealed', 'conduct_panel_resolution_recorded', 'conduct_report_finalised',
  'security_officer_appointed', 'security_officer_revoked',
  'invitation_created', 'invitation_revoked', 'invitation_accepted',
  'supplement_submitted', 'conduct_stance_recorded', 'conduct_action_recorded'));

-- ###########################################################################
-- SECTION 9 -- The candidate notice, per purpose
-- ###########################################################################
--
-- 'beskt-prep-notice-1' is unchanged and stays valid for every assignment
-- that carries it; its descriptor, and so its hash, is byte-for-byte what it
-- was. New assignments carry one of two new governed notices: a general
-- recruitment notice that does not assume a job application, and the
-- security-vetting notice of §4.1. Both add the employer's contact route and
-- the supplement path; the copy lives in the dictionary and is held to the
-- digests below by scripts/beskt-notice-copy-digest-check.ts.
CREATE OR REPLACE FUNCTION public.bcp_notice_version_for(_mode text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _mode
    WHEN 'recruitment_support' THEN 'beskt-prep-notice-2'
    WHEN 'security_vetting_support' THEN 'beskt-vetting-notice-1' END;
$$;

CREATE OR REPLACE FUNCTION public.bcp_notice_sections_for(_notice_version text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _notice_version = 'beskt-prep-notice-1' THEN public.bcp_notice_sections()
    WHEN _notice_version IN ('beskt-prep-notice-2', 'beskt-vetting-notice-1') THEN ARRAY[
      'purpose', 'use_of_information', 'human_decision', 'not_a_test_with_score',
      'may_omit_questions', 'oral_discussion', 'review_and_correct',
      'supplement_after_submission', 'who_can_access', 'retention', 'contact']::text[] END;
$$;

CREATE OR REPLACE FUNCTION public.bcp_notice_copy_keys_for(_notice_version text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _notice_version = 'beskt-prep-notice-1' THEN public.bcp_notice_copy_keys()
    WHEN _notice_version = 'beskt-prep-notice-2' THEN ARRAY[
      'beskt.notice2.title',
      'beskt.notice2.lede',
      'beskt.notice2.purpose.title',
      'beskt.notice2.purpose.body',
      'beskt.notice2.use_of_information.title',
      'beskt.notice2.use_of_information.body',
      'beskt.notice2.human_decision.title',
      'beskt.notice2.human_decision.body',
      'beskt.notice2.not_a_test_with_score.title',
      'beskt.notice2.not_a_test_with_score.body',
      'beskt.notice2.may_omit_questions.title',
      'beskt.notice2.may_omit_questions.body',
      'beskt.notice2.oral_discussion.title',
      'beskt.notice2.oral_discussion.body',
      'beskt.notice2.review_and_correct.title',
      'beskt.notice2.review_and_correct.body',
      'beskt.notice2.supplement_after_submission.title',
      'beskt.notice2.supplement_after_submission.body',
      'beskt.notice2.who_can_access.title',
      'beskt.notice2.who_can_access.body',
      'beskt.notice2.retention.title',
      'beskt.notice2.retention.body',
      'beskt.notice2.contact.title',
      'beskt.notice2.contact.body',
      'beskt.notice2.retentionClass',
      'beskt.notice2.lawfulBasis',
      'beskt.notice2.acknowledge',
      'beskt.notice2.acknowledgeHint',
      'beskt.prep.open']::text[]
    WHEN _notice_version = 'beskt-vetting-notice-1' THEN ARRAY[
      'beskt.noticeVetting.title',
      'beskt.noticeVetting.lede',
      'beskt.noticeVetting.purpose.title',
      'beskt.noticeVetting.purpose.body',
      'beskt.noticeVetting.use_of_information.title',
      'beskt.noticeVetting.use_of_information.body',
      'beskt.noticeVetting.human_decision.title',
      'beskt.noticeVetting.human_decision.body',
      'beskt.noticeVetting.not_a_test_with_score.title',
      'beskt.noticeVetting.not_a_test_with_score.body',
      'beskt.noticeVetting.may_omit_questions.title',
      'beskt.noticeVetting.may_omit_questions.body',
      'beskt.noticeVetting.oral_discussion.title',
      'beskt.noticeVetting.oral_discussion.body',
      'beskt.noticeVetting.review_and_correct.title',
      'beskt.noticeVetting.review_and_correct.body',
      'beskt.noticeVetting.supplement_after_submission.title',
      'beskt.noticeVetting.supplement_after_submission.body',
      'beskt.noticeVetting.who_can_access.title',
      'beskt.noticeVetting.who_can_access.body',
      'beskt.noticeVetting.retention.title',
      'beskt.noticeVetting.retention.body',
      'beskt.noticeVetting.contact.title',
      'beskt.noticeVetting.contact.body',
      'beskt.noticeVetting.retentionClass',
      'beskt.noticeVetting.lawfulBasis',
      'beskt.noticeVetting.acknowledge',
      'beskt.noticeVetting.acknowledgeHint',
      'beskt.prep.open']::text[]
  END;
$$;


-- Published and structurally safe for its OWN mode. bcp_version_is_candidate_safe
-- keeps its meaning -- a published recruitment-support version with no
-- security-vetting row -- for every path that already relies on it.
CREATE OR REPLACE FUNCTION public.bcp_version_is_runnable(_method_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.beskt_method_versions v
                  WHERE v.id = _method_version_id AND v.content_status = 'published')
     AND public.bcp_version_is_structurally_candidate_safe(_method_version_id);
$$;

-- ###########################################################################
-- SECTION 10 -- Starting BESKT: one core, two entrances
-- ###########################################################################
--
-- Every check that makes an assignment legitimate lives here once: the
-- employer party, the governed version and profile for the chosen purpose,
-- the release gate (pilot grant or the owner's recorded activation), the
-- content hash, the people and, for security vetting, the three activation
-- requirements. The application entrance and the invitation entrance differ
-- only in how the candidate is identified.
CREATE OR REPLACE FUNCTION public.bcp_check_start(
  _employer_id uuid, _mode text, _method_version_id uuid, _exposure_profile_id uuid,
  _expected_content_hash text, _responsible_interviewer_id uuid, _contact_statement text,
  _security_owner_id uuid, _role_security_attestation text, _lawful_basis_statement text)
RETURNS public.beskt_method_versions LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _v public.beskt_method_versions%ROWTYPE; _p public.beskt_exposure_profiles%ROWTYPE;
BEGIN
  IF NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: starting BESKT requires an active membership of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RAISE EXCEPTION 'BCP_EMPLOYER_NOT_ACTIVE: this employer account is not active.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _mode NOT IN ('recruitment_support', 'security_vetting_support') THEN
    RAISE EXCEPTION 'BCP_MODE_UNKNOWN: "%".', _mode USING ERRCODE = 'check_violation';
  END IF;
  IF _mode = 'security_vetting_support' AND NOT public.bcp_is_security_officer(_employer_id, auth.uid()) THEN
    RAISE EXCEPTION 'BCP_NOT_SECURITY_OFFICER: only the employer''s appointed security function starts a security vetting.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_METHOD_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _v.mode <> _mode THEN
    RAISE EXCEPTION 'BCP_METHOD_MODE_NOT_PERMITTED: this method version is for %, not %.', _v.mode, _mode
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT ((_v.content_status = 'published'
           AND public.bcp_version_is_runnable(_method_version_id)
           AND public.bcp_pilot_grant_active(_employer_id, _method_version_id))
          OR public.bcp_internal_test_activation_active(_employer_id, _method_version_id)) THEN
    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE: this employer holds no live grant or activation for this BESKT method version.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _expected_content_hash IS NULL OR _v.content_hash IS DISTINCT FROM _expected_content_hash THEN
    RAISE EXCEPTION 'BCP_CONTENT_HASH_MISMATCH: this method version is at content hash %, not %. Reload and retry.',
      coalesce(_v.content_hash, '(null)'), coalesce(_expected_content_hash, '(null)')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _p FROM public.beskt_exposure_profiles WHERE id = _exposure_profile_id;
  IF NOT FOUND OR _p.method_version_id IS DISTINCT FROM _method_version_id THEN
    RAISE EXCEPTION 'BCP_PROFILE_NOT_IN_VERSION: the exposure profile does not belong to this method version.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.permitted_mode <> _mode THEN
    RAISE EXCEPTION 'BCP_PROFILE_MODE_NOT_PERMITTED: this exposure profile is for %.', _p.permitted_mode
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _responsible_interviewer_id IS NULL
     OR NOT public.has_employer_role(_responsible_interviewer_id, _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_INTERVIEWER_NOT_MEMBER: the responsible interviewer must be an active member of this employer.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_contact_statement, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_CONTACT_REQUIRED: tell the candidate how to reach you.' USING ERRCODE = 'check_violation';
  END IF;

  IF _mode = 'security_vetting_support' THEN
    IF NOT public.bcp_is_security_officer(_employer_id, _responsible_interviewer_id) THEN
      RAISE EXCEPTION 'BCP_INTERVIEWER_NOT_SECURITY_OFFICER: in a security vetting the responsible interviewer belongs to the appointed security function.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT public.bcp_is_security_officer(_employer_id, _security_owner_id) THEN
      RAISE EXCEPTION 'BCP_SECURITY_OWNER_REQUIRED: name the appointed security officer who owns this vetting.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF length(btrim(coalesce(_role_security_attestation, ''))) < 20 THEN
      RAISE EXCEPTION 'BCP_ATTESTATION_REQUIRED: attest, in your own words, that this role is security-sensitive.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF length(btrim(coalesce(_lawful_basis_statement, ''))) < 20 THEN
      RAISE EXCEPTION 'BCP_LAWFUL_BASIS_REQUIRED: state the lawful basis your organisation relies on.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _security_owner_id IS NOT NULL OR _role_security_attestation IS NOT NULL OR _lawful_basis_statement IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_VETTING_FIELDS_OUT_OF_MODE: an attestation and a security owner belong to a security vetting only.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN _v;
END $$;

-- The application entrance: an existing job application of this employer.
CREATE OR REPLACE FUNCTION public.bcp_start_beskt(
  _operation_id uuid, _application_id uuid, _mode text, _method_version_id uuid,
  _exposure_profile_id uuid, _expected_content_hash text, _responsible_interviewer_id uuid,
  _contact_statement text, _security_owner_id uuid DEFAULT NULL,
  _role_security_attestation text DEFAULT NULL, _lawful_basis_statement text DEFAULT NULL,
  _due_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _request jsonb; _hash text; _replay jsonb;
  _ja public.job_applications%ROWTYPE; _v public.beskt_method_versions%ROWTYPE;
  _id uuid; _notice text; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'bcp_start_beskt', 'application_id', _application_id,
    'mode', _mode, 'method_version_id', _method_version_id, 'exposure_profile_id', _exposure_profile_id,
    'expected_content_hash', _expected_content_hash, 'responsible_interviewer_id', _responsible_interviewer_id,
    'contact_statement', _contact_statement, 'security_owner_id', _security_owner_id,
    'role_security_attestation', _role_security_attestation,
    'lawful_basis_statement', _lawful_basis_statement, 'due_at', _due_at);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _ja FROM public.job_applications WHERE id = _application_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_APPLICATION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  _v := public.bcp_check_start(_ja.employer_id, _mode, _method_version_id, _exposure_profile_id,
    _expected_content_hash, _responsible_interviewer_id, _contact_statement,
    _security_owner_id, _role_security_attestation, _lawful_basis_statement);
  IF _ja.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_APPLICATION_WITHDRAWN: the candidate withdrew this application.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _ja.applicant_user_id IS NULL THEN
    RAISE EXCEPTION 'BCP_CANDIDATE_UNKNOWN: this application has no signed-in applicant, so there is nobody to prepare.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = _ja.job_id AND j.employer_id = _ja.employer_id) THEN
    RAISE EXCEPTION 'BCP_CROSS_TENANT_JOB: that job belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('bcp_application:' || _application_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.bcp_assignments a
              WHERE a.application_id = _application_id AND a.lifecycle_state <> 'cancelled') THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_EXISTS: this application already has a live BESKT preparation.'
      USING ERRCODE = 'unique_violation';
  END IF;

  _notice := public.bcp_notice_version_for(_mode);
  INSERT INTO public.bcp_assignments
    (employer_id, job_id, application_id, candidate_user_id, method_version_id,
     exposure_profile_id, mode, pinned_content_hash, pinned_release_scope, notice_version,
     due_at, assigned_by, responsible_interviewer_id, contact_statement,
     security_owner_id, role_security_attestation, lawful_basis_statement)
  VALUES
    (_ja.employer_id, _ja.job_id, _application_id, _ja.applicant_user_id, _method_version_id,
     _exposure_profile_id, _mode, _v.content_hash, _v.release_scope, _notice,
     _due_at, auth.uid(), _responsible_interviewer_id, btrim(_contact_statement),
     _security_owner_id, nullif(btrim(coalesce(_role_security_attestation, '')), ''),
     nullif(btrim(coalesce(_lawful_basis_statement, '')), ''))
  RETURNING id INTO _id;

  _result := jsonb_build_object(
    'assignment_id', _id, 'application_id', _application_id, 'employer_id', _ja.employer_id,
    'mode', _mode, 'method_version_id', _method_version_id, 'exposure_profile_id', _exposure_profile_id,
    'content_hash', _v.content_hash, 'notice_version', _notice,
    'lifecycle_state', 'assigned', 'revision', 1, 'operation_id', _operation_id);
  PERFORM public.bcp_record_event(_id, NULL, _ja.employer_id, _method_version_id,
    'assignment_created', NULL, 'assigned', NULL, _v.content_hash, 1, _operation_id, _hash, _result);
  RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.bcp_invitation_token_digest(_token text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT encode(sha256(convert_to(coalesce(_token, ''), 'UTF8')), 'hex');
$$;

-- The invitation entrance, part 1: the employer invites by e-mail.
CREATE OR REPLACE FUNCTION public.bcp_create_invitation(
  _operation_id uuid, _employer_id uuid, _invited_email text, _candidate_display_name text,
  _role_title text, _mode text, _method_version_id uuid, _exposure_profile_id uuid,
  _expected_content_hash text, _responsible_interviewer_id uuid, _contact_statement text,
  _security_owner_id uuid DEFAULT NULL, _role_security_attestation text DEFAULT NULL,
  _lawful_basis_statement text DEFAULT NULL, _due_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _request jsonb; _hash text; _replay jsonb; _v public.beskt_method_versions%ROWTYPE;
  _token text; _id uuid; _email text; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _email := lower(btrim(coalesce(_invited_email, '')));
  -- The token is deliberately NOT part of the request hash: a replay returns
  -- the recorded result, and the recorded result never contains the token.
  _request := jsonb_build_object('op', 'bcp_create_invitation', 'employer_id', _employer_id,
    'invited_email', _email, 'candidate_display_name', _candidate_display_name,
    'role_title', _role_title, 'mode', _mode, 'method_version_id', _method_version_id,
    'exposure_profile_id', _exposure_profile_id, 'expected_content_hash', _expected_content_hash,
    'responsible_interviewer_id', _responsible_interviewer_id, 'contact_statement', _contact_statement,
    'security_owner_id', _security_owner_id, 'role_security_attestation', _role_security_attestation,
    'lawful_basis_statement', _lawful_basis_statement, 'due_at', _due_at);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_INVITATION_REPLAY: this invitation was already created; its link is shown only once. Revoke it and invite again if the link was lost.'
      USING ERRCODE = 'unique_violation';
  END IF;

  _v := public.bcp_check_start(_employer_id, _mode, _method_version_id, _exposure_profile_id,
    _expected_content_hash, _responsible_interviewer_id, _contact_statement,
    _security_owner_id, _role_security_attestation, _lawful_basis_statement);
  IF _email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'BCP_INVITATION_EMAIL_INVALID: give the person''s e-mail address.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_role_title, ''))) = 0 THEN
    RAISE EXCEPTION 'BCP_ROLE_TITLE_REQUIRED: name the position this is about.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bcp_invitations i
              WHERE i.employer_id = _employer_id AND i.invited_email = _email
                AND i.state = 'pending' AND i.expires_at > now()
                AND i.method_version_id = _method_version_id) THEN
    RAISE EXCEPTION 'BCP_INVITATION_EXISTS: this person already has a pending invitation for this method.'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- 244 bits from two version-4 UUIDs; no extension needed.
  _token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  PERFORM set_config('bcp.invitation_write', 'on', true);
  INSERT INTO public.bcp_invitations
    (employer_id, invited_email, candidate_display_name, role_title, mode, method_version_id,
     exposure_profile_id, pinned_content_hash, notice_version, responsible_interviewer_id,
     contact_statement, security_owner_id, role_security_attestation, lawful_basis_statement,
     due_at, token_digest, expires_at, created_by, create_operation_id)
  VALUES
    (_employer_id, _email, nullif(btrim(coalesce(_candidate_display_name, '')), ''), btrim(_role_title),
     _mode, _method_version_id, _exposure_profile_id, _v.content_hash, public.bcp_notice_version_for(_mode),
     _responsible_interviewer_id, btrim(_contact_statement), _security_owner_id,
     nullif(btrim(coalesce(_role_security_attestation, '')), ''),
     nullif(btrim(coalesce(_lawful_basis_statement, '')), ''),
     _due_at, public.bcp_invitation_token_digest(_token), now() + interval '30 days',
     auth.uid(), _operation_id)
  RETURNING id INTO _id;
  PERFORM set_config('bcp.invitation_write', 'off', true);

  _result := jsonb_build_object('invitation_id', _id, 'employer_id', _employer_id,
    'invited_email', _email, 'mode', _mode);
  PERFORM public.bcp_record_event(NULL, NULL, _employer_id, _method_version_id, 'invitation_created',
    NULL, 'pending', NULL, _v.content_hash, NULL, _operation_id, _hash, _result);
  -- The clear token is returned to this caller, this once, and stored nowhere.
  RETURN _result || jsonb_build_object('token', _token);
END $$;

CREATE OR REPLACE FUNCTION public.bcp_revoke_invitation(_operation_id uuid, _invitation_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _i public.bcp_invitations%ROWTYPE; _request jsonb; _hash text; _replay jsonb; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'bcp_revoke_invitation', 'invitation_id', _invitation_id, 'reason', _reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;
  SELECT * INTO _i FROM public.bcp_invitations WHERE id = _invitation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_INVITATION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.has_employer_role(auth.uid(), _i.employer_id, ARRAY['owner', 'admin', 'member'])
     OR (_i.mode = 'security_vetting_support' AND NOT public.bcp_is_security_officer(_i.employer_id, auth.uid())) THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHORISED: you may not change this invitation.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _i.state <> 'pending' THEN
    RAISE EXCEPTION 'BCP_INVITATION_NOT_PENDING: this invitation is %.', _i.state USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_REASON_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('bcp.invitation_write', 'on', true);
  UPDATE public.bcp_invitations SET state = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
         revoke_reason = btrim(_reason) WHERE id = _invitation_id;
  PERFORM set_config('bcp.invitation_write', 'off', true);
  _result := jsonb_build_object('invitation_id', _invitation_id, 'state', 'revoked');
  PERFORM public.bcp_record_event(NULL, NULL, _i.employer_id, _i.method_version_id, 'invitation_revoked',
    'pending', 'revoked', btrim(_reason), _i.pinned_content_hash, NULL, _operation_id, _hash, _result);
  RETURN _result;
END $$;

-- The invitation entrance, part 2: what the signed-in person may see about
-- an invitation before accepting it. Only when the token is right AND the
-- account's confirmed address is the invited one; otherwise nothing, and the
-- same "not available" answer whether the token is wrong or someone else's.
CREATE OR REPLACE FUNCTION public.bcp_invitation_for_token(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _i public.bcp_invitations%ROWTYPE; _email text; _confirmed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT lower(u.email), u.email_confirmed_at IS NOT NULL INTO _email, _confirmed
    FROM auth.users u WHERE u.id = auth.uid();
  SELECT * INTO _i FROM public.bcp_invitations
   WHERE token_digest = public.bcp_invitation_token_digest(_token);
  IF NOT FOUND OR _i.invited_email <> _email THEN
    RETURN jsonb_build_object('available', false, 'reason', 'not_available');
  END IF;
  RETURN jsonb_build_object(
    'available', _i.state = 'pending' AND _i.expires_at > now() AND _confirmed,
    'reason', CASE WHEN NOT _confirmed THEN 'email_not_confirmed'
                   WHEN _i.state = 'accepted' THEN 'already_accepted'
                   WHEN _i.state = 'revoked' THEN 'revoked'
                   WHEN _i.expires_at <= now() THEN 'expired' ELSE NULL END,
    'invitation_id', _i.id,
    'employer_name', (SELECT e.name FROM public.employers e WHERE e.id = _i.employer_id),
    'role_title', _i.role_title,
    'mode', _i.mode,
    'contact_statement', _i.contact_statement,
    'expires_at', _i.expires_at,
    'assignment_id', _i.assignment_id);
END $$;

CREATE OR REPLACE FUNCTION public.bcp_accept_invitation(_operation_id uuid, _token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _i public.bcp_invitations%ROWTYPE; _v public.beskt_method_versions%ROWTYPE;
  _email text; _confirmed boolean; _request jsonb; _hash text; _replay jsonb; _id uuid; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'bcp_accept_invitation',
    'token_digest', public.bcp_invitation_token_digest(_token));
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT lower(u.email), u.email_confirmed_at IS NOT NULL INTO _email, _confirmed
    FROM auth.users u WHERE u.id = auth.uid();
  SELECT * INTO _i FROM public.bcp_invitations
   WHERE token_digest = public.bcp_invitation_token_digest(_token) FOR UPDATE;
  IF NOT FOUND OR _i.invited_email <> _email THEN
    RAISE EXCEPTION 'BCP_INVITATION_NOT_AVAILABLE: this invitation is not available to this account.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT _confirmed THEN
    RAISE EXCEPTION 'BCP_EMAIL_NOT_CONFIRMED: confirm your e-mail address first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _i.state <> 'pending' OR _i.expires_at <= now() THEN
    RAISE EXCEPTION 'BCP_INVITATION_NOT_PENDING: this invitation is no longer open.' USING ERRCODE = 'check_violation';
  END IF;
  IF auth.uid() = _i.created_by OR public.has_employer_role(auth.uid(), _i.employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_CANDIDATE_IS_EMPLOYER_MEMBER: a member of the inviting organisation cannot be its own candidate here.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _i.method_version_id;
  -- The gate is re-checked at acceptance: an activation revoked, or content
  -- changed, since the invitation was sent means there is nothing to accept.
  IF _v.content_hash IS DISTINCT FROM _i.pinned_content_hash
     OR NOT ((_v.content_status = 'published'
              AND public.bcp_version_is_runnable(_v.id)
              AND public.bcp_pilot_grant_active(_i.employer_id, _v.id))
             OR public.bcp_internal_test_activation_active(_i.employer_id, _v.id)) THEN
    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE: the method this invitation was for is no longer available; ask the employer for a new invitation.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.bcp_assignments
    (employer_id, job_id, application_id, invitation_id, role_title, candidate_user_id,
     method_version_id, exposure_profile_id, mode, pinned_content_hash, pinned_release_scope,
     notice_version, due_at, assigned_by, responsible_interviewer_id, contact_statement,
     security_owner_id, role_security_attestation, lawful_basis_statement)
  VALUES
    (_i.employer_id, NULL, NULL, _i.id, _i.role_title, auth.uid(),
     _i.method_version_id, _i.exposure_profile_id, _i.mode, _i.pinned_content_hash, _v.release_scope,
     _i.notice_version, _i.due_at, _i.created_by, _i.responsible_interviewer_id, _i.contact_statement,
     _i.security_owner_id, _i.role_security_attestation, _i.lawful_basis_statement)
  RETURNING id INTO _id;

  PERFORM set_config('bcp.invitation_write', 'on', true);
  UPDATE public.bcp_invitations SET state = 'accepted', accepted_by = auth.uid(), accepted_at = now(),
         assignment_id = _id WHERE id = _i.id;
  PERFORM set_config('bcp.invitation_write', 'off', true);

  _result := jsonb_build_object('assignment_id', _id, 'invitation_id', _i.id, 'mode', _i.mode);
  PERFORM public.bcp_record_event(_id, NULL, _i.employer_id, _i.method_version_id, 'invitation_accepted',
    'pending', 'accepted', NULL, _i.pinned_content_hash, 1, _operation_id, _hash, _result);
  RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.bcp_employer_invitations(_employer_id uuid)
RETURNS TABLE(invitation_id uuid, invited_email text, candidate_display_name text, role_title text,
              mode text, state text, created_at timestamptz, expires_at timestamptz,
              accepted_at timestamptz, assignment_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.invited_email, i.candidate_display_name, i.role_title, i.mode, i.state,
         i.created_at, i.expires_at, i.accepted_at, i.assignment_id
    FROM public.bcp_invitations i
   WHERE i.employer_id = _employer_id
     AND auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     AND (i.mode = 'recruitment_support' OR public.bcp_is_security_officer(_employer_id, auth.uid()))
   ORDER BY i.created_at DESC, i.id;
$$;


-- ###########################################################################
-- SECTION 11 -- What the employer sees before starting
-- ###########################################################################
--
-- "Visa innehåll": the questions a candidate would get under this version and
-- profile, with why each is asked. Security-vetting questions are shown to
-- the appointed security function only; anyone else sees that the domain
-- exists and how many questions it holds, never the wording.
CREATE OR REPLACE FUNCTION public.bcp_method_preview(_employer_id uuid, _method_version_id uuid, _exposure_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _v public.beskt_method_versions%ROWTYPE; _officer boolean;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND OR NOT ((_v.content_status = 'published'
           AND public.bcp_version_is_runnable(_v.id)
           AND public.bcp_pilot_grant_active(_employer_id, _v.id))
          OR public.bcp_internal_test_activation_active(_employer_id, _v.id)) THEN
    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beskt_exposure_profiles p
                  WHERE p.id = _exposure_profile_id AND p.method_version_id = _v.id) THEN
    RAISE EXCEPTION 'BCP_PROFILE_NOT_IN_VERSION' USING ERRCODE = 'check_violation';
  END IF;
  _officer := public.bcp_is_security_officer(_employer_id, auth.uid());
  RETURN jsonb_build_object(
    'method_version_id', _v.id, 'mode', _v.mode, 'content_hash', _v.content_hash,
    'content_status', _v.content_status, 'validation_label', _v.validation_label,
    'wording_visible', _v.mode = 'recruitment_support' OR _officer,
    'sections', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'section_key', s.section_key, 'title_sv', s.title_sv, 'title_en', s.title_en,
          'item_count', (SELECT count(*) FROM public.beskt_items i
                          WHERE i.section_id = s.id AND i.phase = 'candidate_preparation'
                            AND i.exposure_profile_id = _exposure_profile_id),
          'items', CASE WHEN _v.mode = 'recruitment_support' OR _officer THEN coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'item_key', i.item_key, 'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
                'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en,
                'answer_type', i.answer_type, 'requiredness', i.requiredness,
                'discuss_orally_allowed', i.discuss_orally_allowed,
                'is_follow_up', EXISTS (SELECT 1 FROM public.beskt_routing_rules r
                                         WHERE r.target_item_id = i.id AND r.action = 'show'
                                           AND r.condition_kind <> 'always'),
                'sensitivity_class', i.sensitivity_class)
              ORDER BY i.display_order, i.item_key)
              FROM public.beskt_items i
             WHERE i.section_id = s.id AND i.phase = 'candidate_preparation'
               AND i.exposure_profile_id = _exposure_profile_id), '[]'::jsonb)
            ELSE '[]'::jsonb END)
        ORDER BY s.display_order, s.section_key)
        FROM public.beskt_sections s
       WHERE s.method_version_id = _v.id
         AND EXISTS (SELECT 1 FROM public.beskt_items i
                      WHERE i.section_id = s.id AND i.phase = 'candidate_preparation'
                        AND i.exposure_profile_id = _exposure_profile_id)), '[]'::jsonb));
END $$;

-- The employer's BESKT assignments, whether they came from an application or
-- an invitation, with who is responsible and where the interview stands.
-- Security-vetting rows are listed for the appointed security function only.
CREATE OR REPLACE FUNCTION public.bcp_employer_beskt_assignments(_employer_id uuid)
RETURNS TABLE(assignment_id uuid, mode text, application_id uuid, invitation_id uuid,
              role_title text, candidate_display_name text, method_name_sv text, method_name_en text,
              lifecycle_state text, assigned_at timestamptz, submitted_at timestamptz,
              responsible_interviewer_id uuid, case_id uuid, report_finalised boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.mode, a.application_id, a.invitation_id,
         coalesce(a.role_title, j.title_sv),
         coalesce(inv.candidate_display_name,
                  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email)::text,
         p.name_sv, p.name_en, a.lifecycle_state, a.assigned_at, a.submitted_at,
         a.responsible_interviewer_id, l.case_id,
         EXISTS (SELECT 1 FROM public.bcp_conduct_reports r
                  JOIN public.bcp_conduct_sessions s ON s.id = r.session_id
                 WHERE s.assignment_id = a.id AND r.status = 'final')
    FROM public.bcp_assignments a
    LEFT JOIN public.jobs j ON j.id = a.job_id
    LEFT JOIN public.bcp_invitations inv ON inv.id = a.invitation_id
    JOIN auth.users u ON u.id = a.candidate_user_id
    JOIN public.beskt_method_versions v ON v.id = a.method_version_id
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
    LEFT JOIN public.bcp_case_links l ON l.assignment_id = a.id AND l.unlinked_at IS NULL
   WHERE a.employer_id = _employer_id
     AND auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     AND (a.mode = 'recruitment_support' OR public.bcp_is_security_officer(_employer_id, auth.uid()))
   ORDER BY a.assigned_at DESC, a.id;
$$;


-- ###########################################################################
-- SECTION 12 -- The candidate's supplement after submission
-- ###########################################################################
CREATE OR REPLACE FUNCTION public.bcp_submit_supplement(
  _operation_id uuid, _assignment_id uuid, _supplement_kind text, _item_key text, _body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.bcp_assignments%ROWTYPE; _r public.bcp_responses%ROWTYPE;
        _request jsonb; _hash text; _replay jsonb; _id uuid; _result jsonb;
BEGIN
  IF NOT public.bcp_is_assignment_candidate(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_CANDIDATE: only the candidate adds to their own preparation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'bcp_submit_supplement', 'assignment_id', _assignment_id,
    'supplement_kind', _supplement_kind, 'item_key', _item_key, 'body', _body);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id FOR UPDATE;
  IF _a.lifecycle_state <> 'submitted' THEN
    RAISE EXCEPTION 'BCP_NOT_SUBMITTED: before submission, change the answer itself.' USING ERRCODE = 'check_violation';
  END IF;
  IF _supplement_kind NOT IN ('correction', 'addition') THEN
    RAISE EXCEPTION 'BCP_SUPPLEMENT_KIND_UNKNOWN' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _r FROM public.bcp_responses
   WHERE assignment_id = _assignment_id AND response_state = 'submitted'
   ORDER BY response_version DESC LIMIT 1;
  IF _item_key IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.bcp_answers an WHERE an.response_id = _r.id AND an.item_key = _item_key) THEN
    RAISE EXCEPTION 'BCP_ITEM_NOT_IN_SNAPSHOT: that question is not in your submitted answers.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_body, ''))) < 3 OR length(_body) > 2000 THEN
    RAISE EXCEPTION 'BCP_SUPPLEMENT_LENGTH: write between 3 and 2000 characters.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.bcp_candidate_supplements
    (assignment_id, response_id, candidate_user_id, item_key, supplement_kind, body, operation_id)
  VALUES (_assignment_id, _r.id, auth.uid(), _item_key, _supplement_kind, btrim(_body), _operation_id)
  RETURNING id INTO _id;
  _result := jsonb_build_object('supplement_id', _id, 'assignment_id', _assignment_id);
  PERFORM public.bcp_record_event(_assignment_id, _r.id, _a.employer_id, _a.method_version_id,
    'supplement_submitted', NULL, NULL, NULL, _a.pinned_content_hash, _a.revision, _operation_id, _hash, _result,
    jsonb_build_object('supplement_kind', _supplement_kind, 'item_key', _item_key));
  RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.bcp_assignment_supplements(_assignment_id uuid)
RETURNS TABLE(supplement_id uuid, item_key text, supplement_kind text, body text, submitted_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.bcp_is_assignment_candidate(_assignment_id) OR public.bcp_employer_party(_assignment_id)) THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHORISED: you are not party to this preparation.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT s.id, s.item_key, s.supplement_kind, s.body, s.submitted_at
                 FROM public.bcp_candidate_supplements s
                WHERE s.assignment_id = _assignment_id
                ORDER BY s.submitted_at, s.id;
END $$;


-- ###########################################################################
-- SECTION 13 -- Interview preparation: three lists with provenance
-- ###########################################################################
--
-- §4.6, exactly: (1) the method's base questions, (2) the topics the
-- candidate's own explicit answers produced, (3) the role's exposure. Each
-- entry says where it came from and, for the candidate list, which governed
-- rule produced it. Nothing is ranked, weighted or summarised into a profile.
CREATE OR REPLACE FUNCTION public.bcp_interview_preparation(_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.bcp_conduct_sessions%ROWTYPE; _a public.bcp_assignments%ROWTYPE;
        _p public.beskt_exposure_profiles%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND OR NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _s.assignment_id;
  SELECT * INTO _p FROM public.beskt_exposure_profiles WHERE id = _a.exposure_profile_id;
  RETURN jsonb_build_object(
    'session_id', _s.id, 'mode', _a.mode,
    'role', jsonb_build_object(
      'role_title', coalesce(_a.role_title, (SELECT j.title_sv FROM public.jobs j WHERE j.id = _a.job_id)),
      'exposure_area', _p.exposure_area, 'duties_sv', _p.duties_sv, 'duties_en', _p.duties_en,
      'rationale_sv', _p.role_relevance_rationale_sv, 'rationale_en', _p.role_relevance_rationale_en,
      'role_security_attestation', _a.role_security_attestation),
    'base', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', i.item_key, 'section_key', s.section_key,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en,
          'provenance', 'base_question')
        ORDER BY s.display_order, i.display_order, i.item_key)
        FROM public.beskt_items i JOIN public.beskt_sections s ON s.id = i.section_id
       WHERE i.method_version_id = _s.bound_method_version_id
         AND i.exposure_profile_id = _a.exposure_profile_id
         AND i.phase = 'candidate_preparation'
         AND s.section_key NOT LIKE 't\_%'
         AND NOT EXISTS (SELECT 1 FROM public.beskt_routing_rules r
                          WHERE r.target_item_id = i.id AND r.action = 'show'
                            AND r.condition_kind <> 'always')), '[]'::jsonb),
    'candidate', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'topic_id', t.id, 'item_key', t.item_key, 'section_key', s.section_key,
          'reason', t.topic_reason, 'trigger_rule_key', t.trigger_rule_key,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en,
          'provenance', 'candidate_statement')
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
        JOIN public.beskt_sections s ON s.id = i.section_id
       WHERE t.link_id = _s.link_id), '[]'::jsonb),
    'role_exposure', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', i.item_key, 'section_key', s.section_key,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en,
          'provenance', 'role_exposure')
        ORDER BY s.display_order, i.display_order, i.item_key)
        FROM public.beskt_items i JOIN public.beskt_sections s ON s.id = i.section_id
       WHERE i.method_version_id = _s.bound_method_version_id
         AND i.exposure_profile_id = _a.exposure_profile_id
         AND s.section_key LIKE 't\_%'), '[]'::jsonb),
    'supplements', coalesce((
      SELECT jsonb_agg(jsonb_build_object('item_key', c.item_key, 'kind', c.supplement_kind,
                                          'body', c.body, 'submitted_at', c.submitted_at)
        ORDER BY c.submitted_at, c.id)
        FROM public.bcp_candidate_supplements c WHERE c.assignment_id = _a.id), '[]'::jsonb));
END $$;


-- ###########################################################################
-- SECTION 14 -- Recording the stance and the actions
-- ###########################################################################
--
-- Who may record the stance: the assignment's responsible interviewer, its
-- security owner, or the employer's owner or admin -- and, for a security
-- vetting, only while they hold the security function. Every position must
-- be locked first: the stance comes after the independent positions, never
-- before them.
CREATE OR REPLACE FUNCTION public.bcp_conduct_may_record_stance(_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bcp_conduct_sessions s
      JOIN public.bcp_assignments a ON a.id = s.assignment_id
     WHERE s.id = _session_id
       AND public.scp_iv_can_write_case(s.case_id)
       AND (auth.uid() IN (a.responsible_interviewer_id, a.security_owner_id)
            OR public.has_employer_role(auth.uid(), a.employer_id, ARRAY['owner', 'admin'])));
$$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_record_stance(
  _operation_id uuid, _session_id uuid, _expected_version integer,
  _sufficiency text, _sufficiency_reason text, _stance text, _rationale text,
  _decided_by_name text, _decided_role text, _correction_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.bcp_conduct_sessions%ROWTYPE; _cur public.bcp_conduct_stances%ROWTYPE;
        _request jsonb; _hash text; _replay jsonb; _id uuid; _version integer; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'bcp_conduct_record_stance', 'session_id', _session_id,
    'expected_version', _expected_version, 'sufficiency', _sufficiency,
    'sufficiency_reason', _sufficiency_reason, 'stance', _stance, 'rationale', _rationale,
    'decided_by_name', _decided_by_name, 'decided_role', _decided_role,
    'correction_reason', _correction_reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bcp_stance:' || _session_id::text, 0));

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND OR NOT public.bcp_conduct_may_record_stance(_session_id) THEN
    RAISE EXCEPTION 'BCP_NOT_RESPONSIBLE: the stance is recorded by the responsible interviewer, the security owner or the employer''s owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bcp_conduct_positions p WHERE p.session_id = _session_id AND p.state <> 'locked')
     OR NOT EXISTS (SELECT 1 FROM public.bcp_conduct_positions p WHERE p.session_id = _session_id) THEN
    RAISE EXCEPTION 'BCP_POSITIONS_NOT_LOCKED: every independent position is locked before the stance is recorded.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _sufficiency NOT IN ('sufficient', 'more_information_required') THEN
    RAISE EXCEPTION 'BCP_SUFFICIENCY_UNKNOWN' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_sufficiency_reason, ''))) < 10 OR length(btrim(coalesce(_stance, ''))) < 10
     OR length(btrim(coalesce(_rationale, ''))) < 10 OR length(btrim(coalesce(_decided_by_name, ''))) < 2
     OR length(btrim(coalesce(_decided_role, ''))) < 2 THEN
    RAISE EXCEPTION 'BCP_STANCE_INCOMPLETE: the reason for sufficiency, the stance and its reasoning are written in full, with name and role.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- The same content rules as the method's own wordings: no scores, no
  -- probability, no deception cue.
  IF public.beskt_text_instructs_scoring(_stance) OR public.beskt_text_instructs_scoring(_rationale)
     OR public.beskt_text_claims_deception_cue(_stance) OR public.beskt_text_claims_deception_cue(_rationale) THEN
    RAISE EXCEPTION 'BCP_STANCE_WORDING: a stance states reasons, not a score, a probability or a reading of honesty.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _cur FROM public.bcp_conduct_stances WHERE session_id = _session_id
   ORDER BY version DESC LIMIT 1;
  _version := coalesce(_cur.version, 0);
  IF _expected_version IS DISTINCT FROM _version THEN
    RAISE EXCEPTION 'BCP_STALE_REVISION: the stance is at version % but the request expected %. Reload and retry.',
      _version, _expected_version USING ERRCODE = 'check_violation';
  END IF;
  IF _version > 0 AND length(btrim(coalesce(_correction_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_CORRECTION_REASON_REQUIRED: say why the stance changes.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.bcp_conduct_stances
    (session_id, sufficiency, sufficiency_reason, stance, rationale, decided_by, decided_by_name,
     decided_role, version, supersedes_stance_id, correction_reason, operation_id)
  VALUES (_session_id, _sufficiency, btrim(_sufficiency_reason), btrim(_stance), btrim(_rationale),
     auth.uid(), btrim(_decided_by_name), btrim(_decided_role), _version + 1,
     CASE WHEN _version > 0 THEN _cur.id END,
     CASE WHEN _version > 0 THEN btrim(_correction_reason) END, _operation_id)
  RETURNING id INTO _id;
  _result := jsonb_build_object('stance_id', _id, 'session_id', _session_id, 'version', _version + 1);
  PERFORM public.bcp_record_event(_s.assignment_id, _s.bound_response_id, _s.employer_id,
    _s.bound_method_version_id, 'conduct_stance_recorded', NULL, NULL,
    CASE WHEN _version > 0 THEN btrim(_correction_reason) END,
    _s.bound_content_hash, _version + 1, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _session_id));
  RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_record_action(
  _operation_id uuid, _session_id uuid, _action_key uuid, _expected_version integer,
  _description text, _responsible text, _due_on date, _status text, _review_on date, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.bcp_conduct_sessions%ROWTYPE; _cur integer; _key uuid;
        _request jsonb; _hash text; _replay jsonb; _id uuid; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'bcp_conduct_record_action', 'session_id', _session_id,
    'action_key', _action_key, 'expected_version', _expected_version, 'description', _description,
    'responsible', _responsible, 'due_on', _due_on, 'status', _status, 'review_on', _review_on, 'note', _note);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND OR NOT public.bcp_conduct_may_record_stance(_session_id) THEN
    RAISE EXCEPTION 'BCP_NOT_RESPONSIBLE: actions are recorded by the responsible interviewer, the security owner or the employer''s owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _status NOT IN ('planned', 'in_progress', 'done', 'cancelled')
     OR length(btrim(coalesce(_description, ''))) < 3 OR length(btrim(coalesce(_responsible, ''))) < 2 THEN
    RAISE EXCEPTION 'BCP_ACTION_INCOMPLETE: an action names what, who is responsible and its status.'
      USING ERRCODE = 'check_violation';
  END IF;
  _key := coalesce(_action_key, gen_random_uuid());
  PERFORM pg_advisory_xact_lock(hashtextextended('bcp_action:' || _key::text, 0));
  SELECT max(version) INTO _cur FROM public.bcp_conduct_actions WHERE action_key = _key AND session_id = _session_id;
  IF coalesce(_cur, 0) IS DISTINCT FROM coalesce(_expected_version, 0) THEN
    RAISE EXCEPTION 'BCP_STALE_REVISION: the action is at version % but the request expected %. Reload and retry.',
      coalesce(_cur, 0), coalesce(_expected_version, 0) USING ERRCODE = 'check_violation';
  END IF;
  IF _action_key IS NOT NULL AND _cur IS NULL THEN
    RAISE EXCEPTION 'BCP_ACTION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.bcp_conduct_actions
    (session_id, action_key, version, description, responsible, due_on, status, review_on, note,
     recorded_by, operation_id)
  VALUES (_session_id, _key, coalesce(_cur, 0) + 1, btrim(_description), btrim(_responsible), _due_on,
     _status, _review_on, nullif(btrim(coalesce(_note, '')), ''), auth.uid(), _operation_id)
  RETURNING id INTO _id;
  _result := jsonb_build_object('action_id', _id, 'action_key', _key, 'version', coalesce(_cur, 0) + 1);
  PERFORM public.bcp_record_event(_s.assignment_id, _s.bound_response_id, _s.employer_id,
    _s.bound_method_version_id, 'conduct_action_recorded', NULL, _status, NULL,
    _s.bound_content_hash, coalesce(_cur, 0) + 1, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _session_id, 'action_key', _key));
  RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_decision(_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.bcp_conduct_sessions%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND OR NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.bcp_conduct_report_extensions(_session_id)
    || jsonb_build_object('may_decide', public.bcp_conduct_may_record_stance(_session_id),
         'stance_version', coalesce((SELECT max(version) FROM public.bcp_conduct_stances
                                      WHERE session_id = _session_id), 0));
END $$;

-- What the report adds to the frozen basis: the assignment's purpose and
-- people, the candidate's supplements, the stance and the actions. Internal:
-- read only through the report builder and the gated reader above.
CREATE OR REPLACE FUNCTION public.bcp_conduct_report_extensions(_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'assignment', (
      SELECT jsonb_build_object(
          'mode', a.mode,
          'purpose', CASE a.mode WHEN 'security_vetting_support' THEN 'security_vetting' ELSE 'recruitment' END,
          'role_title', coalesce(a.role_title, j.title_sv),
          'entrance', CASE WHEN a.application_id IS NOT NULL THEN 'application' ELSE 'invitation' END,
          'assigned_at', a.assigned_at, 'submitted_at', a.submitted_at,
          'responsible_interviewer', (SELECT coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email)
                                        FROM auth.users u WHERE u.id = a.responsible_interviewer_id),
          'security_owner', (SELECT coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email)
                               FROM auth.users u WHERE u.id = a.security_owner_id),
          'role_security_attestation', a.role_security_attestation,
          'lawful_basis_statement', a.lawful_basis_statement,
          'exposure_area', ep.exposure_area,
          'exposure_duties_sv', ep.duties_sv, 'exposure_duties_en', ep.duties_en)
        FROM public.bcp_conduct_sessions s
        JOIN public.bcp_assignments a ON a.id = s.assignment_id
        LEFT JOIN public.jobs j ON j.id = a.job_id
        JOIN public.beskt_exposure_profiles ep ON ep.id = a.exposure_profile_id
       WHERE s.id = _session_id),
    'participants', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'name', coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email),
          'position_role', p.position_role, 'locked_at', p.locked_at)
        ORDER BY p.created_at, p.id)
        FROM public.bcp_conduct_positions p JOIN auth.users u ON u.id = p.assessor_id
       WHERE p.session_id = _session_id), '[]'::jsonb),
    'supplements', coalesce((
      SELECT jsonb_agg(jsonb_build_object('item_key', c.item_key, 'kind', c.supplement_kind,
                                          'body', c.body, 'submitted_at', c.submitted_at)
        ORDER BY c.submitted_at, c.id)
        FROM public.bcp_candidate_supplements c
        JOIN public.bcp_conduct_sessions s ON s.assignment_id = c.assignment_id
       WHERE s.id = _session_id), '[]'::jsonb),
    'stance', (
      SELECT jsonb_build_object('version', st.version, 'sufficiency', st.sufficiency,
          'sufficiency_reason', st.sufficiency_reason, 'stance', st.stance, 'rationale', st.rationale,
          'decided_by_name', st.decided_by_name, 'decided_role', st.decided_role,
          'decided_at', st.decided_at, 'correction_reason', st.correction_reason)
        FROM public.bcp_conduct_stances st WHERE st.session_id = _session_id
       ORDER BY st.version DESC LIMIT 1),
    'stance_history', coalesce((
      SELECT jsonb_agg(jsonb_build_object('version', st.version, 'decided_by_name', st.decided_by_name,
                                          'decided_at', st.decided_at, 'correction_reason', st.correction_reason)
        ORDER BY st.version)
        FROM public.bcp_conduct_stances st WHERE st.session_id = _session_id), '[]'::jsonb),
    'actions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('action_key', x.action_key, 'version', x.version,
          'description', x.description, 'responsible', x.responsible, 'due_on', x.due_on,
          'status', x.status, 'review_on', x.review_on, 'note', x.note, 'recorded_at', x.recorded_at)
        ORDER BY x.first_at, x.action_key)
        FROM (SELECT DISTINCT ON (a.action_key) a.*,
                     min(a.recorded_at) OVER (PARTITION BY a.action_key) AS first_at
                FROM public.bcp_conduct_actions a WHERE a.session_id = _session_id
               ORDER BY a.action_key, a.version DESC) x), '[]'::jsonb));
$$;

-- ###########################################################################
-- SECTION 15 -- The existing functions, extended (bodies md5-pinned above)
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.scp_iv_can_read_case(_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), public.scp_iv_case_employer(_case_id), NULL)
     AND public.bcp_case_access_ok(_case_id);
$function$;

CREATE OR REPLACE FUNCTION public.scp_iv_can_write_case(_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), public.scp_iv_case_employer(_case_id),
                                  ARRAY['owner','admin','member'])
     AND EXISTS (SELECT 1 FROM public.scp_interview_cases c
                  WHERE c.id = _case_id
                    AND c.status <> 'cancelled'
                    AND c.retention_state = 'active')
     AND public.bcp_case_access_ok(_case_id);
$function$;

CREATE OR REPLACE FUNCTION public.scp_iv_create_case(_employer_id uuid, _title text, _pack_version_id uuid, _candidate_display_name text, _candidate_user_id uuid DEFAULT NULL::uuid, _candidate_external_ref text DEFAULT NULL::text, _job_id uuid DEFAULT NULL::uuid, _application_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- BESKT PR 2: a case is started with a role-interview pack version only.
  -- A BESKT method version cannot exist in this table, and if a pack of
  -- another kind ever reaches here it is refused before any entitlement.
  IF NOT EXISTS (SELECT 1 FROM public.scp_interview_packs p
                  WHERE p.id = _pack.pack_id AND p.pack_kind = 'role_interview') THEN
    RAISE EXCEPTION 'SCP_IV_PACK_KIND_NOT_STARTABLE: only a role-interview pack version can start an interview case.'
      USING ERRCODE = 'insufficient_privilege';
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

  -- 20261128090000: a case names a candidate ACCOUNT only as the applicant
  -- of the application it is bound to. Without this, any member of any
  -- active employer could bind an arbitrary user to a case of theirs, and
  -- that user would be treated as the case's candidate everywhere
  -- (scp_iv_is_case_candidate, the candidate's own interview status, and the
  -- BESKT preparation bridge, which matches on it). A case without an
  -- account -- a candidate identified by an external reference -- is
  -- unchanged. The employer's authority over the application is the check
  -- directly above; this one binds the person to it.
  IF _candidate_user_id IS NOT NULL THEN
    -- 20261130090000: or the account that ACCEPTED a BESKT invitation of
    -- this employer, while the caller is that assignment's employer party.
    -- The acceptance verified the confirmed e-mail address; nothing weaker
    -- binds a person to a case.
    IF _application_id IS NULL THEN
      IF NOT EXISTS (
           SELECT 1 FROM public.bcp_assignments ba
            WHERE ba.employer_id = _employer_id
              AND ba.candidate_user_id = _candidate_user_id
              AND ba.invitation_id IS NOT NULL
              AND ba.lifecycle_state <> 'cancelled'
              AND public.bcp_employer_party(ba.id)) THEN
        RAISE EXCEPTION 'SCP_IV_CANDIDATE_REQUIRES_APPLICATION: a candidate account can be named only through the application that account applied with, or a BESKT invitation it accepted.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF NOT EXISTS (
         SELECT 1 FROM public.job_applications a
          WHERE a.id = _application_id
            AND a.employer_id = _employer_id
            AND a.applicant_user_id = _candidate_user_id) THEN
      RAISE EXCEPTION 'SCP_IV_CANDIDATE_NOT_APPLICANT: that account is not the applicant of this application.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
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
END; $function$;

CREATE OR REPLACE FUNCTION public.bcp_employer_can_read_assignment(_assignment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20261130090000: the employer party (security vetting: the appointed
  -- security function only), over either spine.
  SELECT auth.uid() IS NOT NULL
     AND public.bcp_employer_party(_assignment_id)
     AND EXISTS (
       SELECT 1 FROM public.bcp_assignments a
        WHERE a.id = _assignment_id
          AND ((a.application_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.job_applications ja JOIN public.jobs j ON j.id = a.job_id
                   WHERE ja.id = a.application_id AND ja.employer_id = a.employer_id
                     AND j.employer_id = a.employer_id AND ja.applicant_user_id = a.candidate_user_id))
               OR (a.invitation_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.bcp_invitations i
                   WHERE i.id = a.invitation_id AND i.employer_id = a.employer_id
                     AND i.assignment_id = a.id AND i.accepted_by = a.candidate_user_id))));
$function$;

CREATE OR REPLACE FUNCTION public.bcp_party_can_read_method_version(_method_version_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.bcp_assignments a
       WHERE a.method_version_id = _method_version_id
         AND a.lifecycle_state <> 'cancelled'
         AND (a.candidate_user_id = auth.uid()
              OR public.bcp_employer_party(a.id))
         -- 20261129090000: a published candidate-safe version, or the exact
         -- content an internal test activation of THIS employer covered.
         AND (public.bcp_version_is_runnable(_method_version_id)
              OR public.bcp_internal_test_activation_covers(a.employer_id, _method_version_id,
                                                             a.pinned_content_hash)));
$function$;

CREATE OR REPLACE FUNCTION public.bcp_version_is_structurally_candidate_safe(_method_version_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- A recruitment-support version: nothing that belongs to security vetting.
  SELECT (EXISTS (
      SELECT 1 FROM public.beskt_method_versions v
       WHERE v.id = _method_version_id
         AND v.mode = 'recruitment_support'
         AND v.release_scope = 'synthetic_internal_only')
    AND NOT EXISTS (
      SELECT 1 FROM public.beskt_exposure_profiles p
       WHERE p.method_version_id = _method_version_id
         AND (p.permitted_mode = 'security_vetting_support'
              OR p.access_class = 'authorised_security_function'
              OR p.retention_class = 'security_vetting_record'))
    AND NOT EXISTS (
      SELECT 1 FROM public.beskt_items i
       WHERE i.method_version_id = _method_version_id
         AND (i.permitted_mode = 'security_vetting_support'
              OR i.sensitivity_class = 'security_vetting_only'
              OR i.access_class = 'authorised_security_function')))
  -- 20261130090000: a security-vetting version that carries the three
  -- activation requirements. Its runtime (bcp_check_start) additionally
  -- requires a security-vetting profile, the appointed security function,
  -- the attestation and the lawful basis on each assignment.
  OR (EXISTS (
      SELECT 1 FROM public.beskt_method_versions v
       WHERE v.id = _method_version_id
         AND v.mode = 'security_vetting_support'
         AND v.release_scope = 'synthetic_internal_only')
    AND EXISTS (
      SELECT 1 FROM public.beskt_exposure_profiles p
       WHERE p.method_version_id = _method_version_id
         AND p.permitted_mode = 'security_vetting_support')
    AND (SELECT count(*) FROM public.beskt_activation_requirements r
          WHERE r.method_version_id = _method_version_id) = 3);
$function$;

CREATE OR REPLACE FUNCTION public.bcp_assignable_method_versions(_employer_id uuid)
 RETURNS TABLE(method_version_id uuid, pack_id uuid, pack_slug text, name_sv text, name_en text, purpose_sv text, version_number integer, mode text, validation_label text, release_scope text, content_hash text, summary_sv text, summary_en text, grant_expires_on date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     OR NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT v.id, p.id, p.slug, p.name_sv, p.name_en, p.purpose_sv, v.version_number,
           v.mode, v.validation_label, v.release_scope, v.content_hash,
           v.summary_sv, v.summary_en, g.expires_on
      FROM public.beskt_method_versions v
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
      JOIN public.bcp_pilot_grants g
        ON g.method_version_id = v.id AND g.employer_id = _employer_id
     WHERE p.pack_kind = 'beskt_method'
       AND v.content_status = 'published'
       AND public.bcp_version_is_runnable(v.id)
       AND g.revoked_at IS NULL
       AND current_date >= g.starts_on
       AND current_date < g.expires_on
    UNION ALL
    -- 20261129090000: versions this employer may use under a live internal
    -- test activation, and not already under a pilot grant.
    SELECT v.id, p.id, p.slug, p.name_sv, p.name_en, p.purpose_sv, v.version_number,
           v.mode, v.validation_label, v.release_scope, v.content_hash,
           v.summary_sv, v.summary_en, t.expires_on
      FROM public.bcp_internal_test_activations t
      JOIN public.beskt_method_versions v ON v.id = t.method_version_id
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
     WHERE t.employer_id = _employer_id
       AND p.pack_kind = 'beskt_method'
       AND public.bcp_internal_test_activation_active(_employer_id, v.id)
       AND t.revoked_at IS NULL
       AND NOT (v.content_status = 'published' AND public.bcp_pilot_grant_active(_employer_id, v.id))
     ORDER BY 4, 7 DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_assignable_exposure_profiles(_employer_id uuid, _method_version_id uuid)
 RETURNS TABLE(exposure_profile_id uuid, profile_key text, display_order integer, exposure_area text, duties_sv text, duties_en text, role_relevance_rationale_sv text, role_relevance_rationale_en text, retention_class text, candidate_item_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     OR NOT coalesce(public.employer_is_active_status(_employer_id), false)
     OR NOT ((public.bcp_pilot_grant_active(_employer_id, _method_version_id)
              AND public.bcp_version_is_runnable(_method_version_id))
             OR public.bcp_internal_test_activation_active(_employer_id, _method_version_id)) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.id, p.profile_key, p.display_order, p.exposure_area,
           p.duties_sv, p.duties_en,
           p.role_relevance_rationale_sv, p.role_relevance_rationale_en,
           p.retention_class,
           (SELECT count(*)::integer FROM public.beskt_items i
             WHERE i.exposure_profile_id = p.id
               AND i.phase = 'candidate_preparation'
               AND (i.permitted_mode = 'recruitment_support'
                    OR p.permitted_mode = 'security_vetting_support'))
      FROM public.beskt_exposure_profiles p
     WHERE p.method_version_id = _method_version_id
       AND p.permitted_mode = (SELECT v.mode FROM public.beskt_method_versions v
                                WHERE v.id = _method_version_id)
     ORDER BY p.display_order, p.profile_key;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_save_answers(_operation_id uuid, _assignment_id uuid, _expected_revision integer, _answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _request jsonb; _hash text; _replay jsonb;
  _a public.bcp_assignments%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
  _visible uuid[];
  _entry jsonb;
  _item public.beskt_items%ROWTYPE;
  _state text; _key text;
  _opts text[];
  _saved integer := 0;
  _result jsonb;
BEGIN
  IF NOT public.bcp_is_assignment_candidate(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_CANDIDATE: only the candidate this preparation belongs to may answer it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'array' THEN
    RAISE EXCEPTION 'BCP_ANSWERS_NOT_STRUCTURED: answers must be a JSON array of typed entries.'
      USING ERRCODE = 'check_violation';
  END IF;
  _request := jsonb_build_object('op', 'save_answers', 'assignment_id', _assignment_id,
    'expected_revision', _expected_revision, 'answers', _answers);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id FOR UPDATE;
  IF _a.lifecycle_state = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_CANCELLED: this preparation was cancelled.' USING ERRCODE = 'check_violation';
  END IF;
  IF _a.lifecycle_state = 'submitted' THEN
    RAISE EXCEPTION 'BCP_ALREADY_SUBMITTED: this preparation has been submitted and is read-only.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.acknowledged_at IS NULL THEN
    RAISE EXCEPTION 'BCP_NOTICE_NOT_ACKNOWLEDGED: the candidate notice must be read and acknowledged before any question is answered.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- compare-and-swap on the DRAFT, before any write ------------------
  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: a save names the revision it was looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _r FROM public.bcp_responses
   WHERE assignment_id = _assignment_id AND response_state = 'draft' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_NO_OPEN_DRAFT: this preparation has no open draft.' USING ERRCODE = 'check_violation';
  END IF;
  IF _r.revision <> _expected_revision THEN
    RAISE EXCEPTION 'BCP_STALE_REVISION: the draft is at revision % but the request expected revision %. Reload and retry.',
      _r.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;

  -- ---- what the candidate can currently see -----------------------------
  SELECT coalesce(array_agg(v.item_id), '{}'::uuid[]) INTO _visible
    FROM public.bcp_visible_items(_assignment_id, _r.id) v;

  FOR _entry IN SELECT jsonb_array_elements(_answers) LOOP
    IF jsonb_typeof(_entry) <> 'object' THEN
      RAISE EXCEPTION 'BCP_ANSWERS_NOT_STRUCTURED: every answer entry must be a JSON object.'
        USING ERRCODE = 'check_violation';
    END IF;
    _key := _entry ->> 'item_key';
    _state := _entry ->> 'response_state';
    IF _key IS NULL OR _state IS NULL THEN
      RAISE EXCEPTION 'BCP_ANSWER_INCOMPLETE: every answer entry names an item_key and a response_state.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF _state NOT IN ('answered', 'omitted', 'discuss_orally') THEN
      RAISE EXCEPTION 'BCP_ANSWER_STATE_UNKNOWN: "%" is not a candidate response state.', _state
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO _item FROM public.beskt_items i
     WHERE i.method_version_id = _a.method_version_id AND i.item_key = _key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_IN_VERSION: "%" is not an item of the assigned method version.', _key
        USING ERRCODE = 'check_violation';
    END IF;
    IF _item.exposure_profile_id IS DISTINCT FROM _a.exposure_profile_id THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_IN_PROFILE: "%" does not belong to the assigned exposure profile.', _key
        USING ERRCODE = 'check_violation';
    END IF;
    IF _item.phase <> 'candidate_preparation' THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_CANDIDATE_PHASE: "%" is not a candidate-preparation item.', _key
        USING ERRCODE = 'check_violation';
    END IF;
    -- 20261130090000: security-vetting content is answered in a
    -- security-vetting assignment, and never in any other.
    IF _a.mode <> 'security_vetting_support'
       AND (_item.permitted_mode <> 'recruitment_support'
            OR _item.sensitivity_class = 'security_vetting_only') THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_PERMITTED: "%" is security-vetting content and is never answered here.', _key
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (_item.id = ANY (_visible)) THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_VISIBLE: "%" is not currently shown to this candidate, so it cannot be answered.', _key
        USING ERRCODE = 'check_violation';
    END IF;
    IF _state = 'discuss_orally' AND NOT _item.discuss_orally_allowed THEN
      RAISE EXCEPTION 'BCP_ORAL_NOT_ALLOWED: "%" is not marked as one that may be taken orally.', _key
        USING ERRCODE = 'check_violation';
    END IF;

    _opts := NULL;
    IF _state = 'answered' AND _item.answer_type IN ('single_choice', 'multi_choice') THEN
      SELECT coalesce(array_agg(k ORDER BY k), '{}'::text[]) INTO _opts
        FROM jsonb_array_elements_text(coalesce(_entry -> 'option_keys', '[]'::jsonb)) AS k;
      IF EXISTS (
        SELECT 1 FROM unnest(_opts) AS k
         WHERE NOT EXISTS (SELECT 1 FROM public.beskt_item_options o
                            WHERE o.item_id = _item.id AND o.option_key = k)) THEN
        RAISE EXCEPTION 'BCP_OPTION_NOT_IN_ITEM: an option selected for "%" is not a governed option of that item.', _key
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    INSERT INTO public.bcp_answers
      (response_id, item_id, item_key, answer_type, response_state,
       value_boolean, value_text, value_date, selected_option_keys)
    VALUES (
      _r.id, _item.id, _item.item_key, _item.answer_type, _state,
      CASE WHEN _state = 'answered' AND _item.answer_type IN ('boolean', 'acknowledgement')
           THEN (_entry ->> 'value_boolean')::boolean END,
      CASE WHEN _state = 'answered' AND _item.answer_type IN ('short_text', 'long_text')
           THEN _entry ->> 'value_text' END,
      CASE WHEN _state = 'answered' AND _item.answer_type = 'date'
           THEN (_entry ->> 'value_date')::date END,
      CASE WHEN _state = 'answered' AND _item.answer_type IN ('single_choice', 'multi_choice')
           THEN _opts END)
    ON CONFLICT (response_id, item_id) DO UPDATE SET
      answer_type = EXCLUDED.answer_type,
      response_state = EXCLUDED.response_state,
      value_boolean = EXCLUDED.value_boolean,
      value_text = EXCLUDED.value_text,
      value_date = EXCLUDED.value_date,
      selected_option_keys = EXCLUDED.selected_option_keys;
    _saved := _saved + 1;
  END LOOP;

  UPDATE public.bcp_responses SET revision = revision + 1 WHERE id = _r.id;
  IF _a.lifecycle_state = 'notice_acknowledged' THEN
    UPDATE public.bcp_assignments
       SET lifecycle_state = 'in_progress', revision = revision + 1 WHERE id = _assignment_id;
  END IF;

  _result := jsonb_build_object('assignment_id', _assignment_id, 'response_id', _r.id,
    'revision', _r.revision + 1, 'saved', _saved,
    'lifecycle_state', (SELECT lifecycle_state FROM public.bcp_assignments WHERE id = _assignment_id),
    'operation_id', _operation_id);
  PERFORM public.bcp_record_event(_assignment_id, _r.id, _a.employer_id, _a.method_version_id,
    'response_saved', _a.lifecycle_state,
    (SELECT lifecycle_state FROM public.bcp_assignments WHERE id = _assignment_id),
    NULL, _a.pinned_content_hash, _r.revision + 1, _operation_id, _hash, _result,
    jsonb_build_object('items_saved', _saved));
  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_candidate_preparation(_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _a public.bcp_assignments%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
  _p public.scp_interview_packs%ROWTYPE;
  _prof public.beskt_exposure_profiles%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
BEGIN
  IF NOT public.bcp_is_assignment_candidate(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHORISED: this preparation does not belong to you.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _a.method_version_id;
  SELECT * INTO _p FROM public.scp_interview_packs WHERE id = _v.pack_id;
  SELECT * INTO _prof FROM public.beskt_exposure_profiles WHERE id = _a.exposure_profile_id;

  -- The latest response: the open draft while there is one, otherwise the
  -- submitted version the candidate may re-read but not change.
  SELECT * INTO _r FROM public.bcp_responses
   WHERE assignment_id = _assignment_id
   ORDER BY response_version DESC LIMIT 1;

  RETURN jsonb_build_object(
    'assignment_id', _a.id,
    'application_id', _a.application_id,
    'job_id', _a.job_id,
    'employer_id', _a.employer_id,
    'lifecycle_state', _a.lifecycle_state,
    'mode', _a.mode,
    'role_title', coalesce(_a.role_title, (SELECT j.title_sv FROM public.jobs j WHERE j.id = _a.job_id)),
    'role_title_en', coalesce(_a.role_title, (SELECT coalesce(j.title_en, j.title_sv) FROM public.jobs j WHERE j.id = _a.job_id)),
    'employer_name', (SELECT e.name FROM public.employers e WHERE e.id = _a.employer_id),
    'contact_statement', _a.contact_statement,
    'entrance', CASE WHEN _a.application_id IS NOT NULL THEN 'application' ELSE 'invitation' END,
    'available_from', _a.available_from,
    'due_at', _a.due_at,
    'submitted_at', _a.submitted_at,
    'read_only', _a.lifecycle_state IN ('submitted', 'cancelled'),
    'method', jsonb_build_object(
      'method_version_id', _v.id, 'pack_slug', _p.slug,
      'name_sv', _p.name_sv, 'name_en', _p.name_en, 'purpose_sv', _p.purpose_sv,
      'version_number', _v.version_number, 'mode', _v.mode,
      'validation_label', _v.validation_label, 'release_scope', _v.release_scope,
      'summary_sv', _v.summary_sv, 'summary_en', _v.summary_en,
      'content_hash', _a.pinned_content_hash,
      'content_hash_algorithm', _a.pinned_content_hash_algorithm),
    'exposure_profile', jsonb_build_object(
      'profile_key', _prof.profile_key, 'exposure_area', _prof.exposure_area,
      'duties_sv', _prof.duties_sv, 'duties_en', _prof.duties_en,
      'role_relevance_rationale_sv', _prof.role_relevance_rationale_sv,
      'role_relevance_rationale_en', _prof.role_relevance_rationale_en,
      'retention_class', _prof.retention_class,
      'lawful_basis_reference', _prof.lawful_basis_reference,
      'jurisdiction_reference', _prof.jurisdiction_reference),
    -- PER LOCALE, because the hash is now per locale. The client renders one
    -- language and echoes back the hash for THAT language; the server
    -- recomputes it from its own governed digest and refuses a mismatch, so
    -- nothing here is a client-selected authority.
    'notice', jsonb_build_object(
      'notice_version', _a.notice_version,
      'acknowledged_at', _a.acknowledged_at,
      'locales', to_jsonb(public.bcp_notice_locales()),
      'by_locale', (
        SELECT jsonb_object_agg(loc, jsonb_build_object(
                 'notice_content_hash', public.bcp_notice_hash(_assignment_id, loc),
                 'descriptor', public.bcp_notice_descriptor(_assignment_id, loc)))
          FROM unnest(public.bcp_notice_locales()) AS loc)),
    'response', CASE WHEN _r.id IS NULL THEN NULL ELSE jsonb_build_object(
      'response_id', _r.id, 'response_version', _r.response_version,
      'response_state', _r.response_state, 'revision', _r.revision,
      'submitted_at', _r.submitted_at,
      'submitted_content_hash', _r.submitted_content_hash) END,
    -- The governed questions currently in front of this candidate, in
    -- governed order, resolved through PR #218's routing authority.
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'sequence_position', vis.sequence_position,
          'item_key', i.item_key, 'section_key', vis.section_key,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en,
          'answer_type', i.answer_type, 'requiredness', i.requiredness,
          'discuss_orally_allowed', i.discuss_orally_allowed,
          'options', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'option_key', o.option_key, 'display_order', o.display_order,
                'label_sv', o.label_sv, 'label_en', o.label_en)
              ORDER BY o.display_order, o.option_key)
              FROM public.beskt_item_options o WHERE o.item_id = i.id), '[]'::jsonb),
          'answer', (
            SELECT jsonb_build_object(
                'response_state', an.response_state,
                'value_boolean', to_jsonb(an.value_boolean),
                'value_text', to_jsonb(an.value_text),
                'value_date', to_jsonb(an.value_date),
                'option_keys', to_jsonb(coalesce(an.selected_option_keys, '{}'::text[])))
              FROM public.bcp_answers an
             WHERE an.response_id = _r.id AND an.item_id = i.id))
        ORDER BY vis.sequence_position)
        FROM public.bcp_visible_items(_assignment_id, _r.id) vis
        JOIN public.beskt_items i ON i.id = vis.item_id), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_employer_assignments(_employer_id uuid)
 RETURNS TABLE(assignment_id uuid, application_id uuid, job_id uuid, job_title_sv text, job_title_en text, candidate_user_id uuid, method_name_sv text, method_name_en text, method_version_number integer, content_hash text, lifecycle_state text, assigned_at timestamp with time zone, due_at timestamp with time zone, submitted_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT a.id, a.application_id, a.job_id, j.title_sv, j.title_en, a.candidate_user_id,
           p.name_sv, p.name_en, v.version_number, a.pinned_content_hash,
           a.lifecycle_state, a.assigned_at, a.due_at, a.submitted_at
      FROM public.bcp_assignments a
      LEFT JOIN public.jobs j ON j.id = a.job_id
      JOIN public.beskt_method_versions v ON v.id = a.method_version_id
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
     WHERE a.employer_id = _employer_id
       AND (a.mode = 'recruitment_support'
            OR public.bcp_is_security_officer(_employer_id, auth.uid()))
     ORDER BY a.assigned_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_case_preparation_basis(_case_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _l public.bcp_case_links%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _l FROM public.bcp_case_links
   WHERE case_id = _case_id AND unlinked_at IS NULL;
  IF NOT FOUND THEN
    -- Absent, not empty: a case with no linked preparation has none, and
    -- saying so is different from refusing.
    RETURN jsonb_build_object('case_id', _case_id, 'linked', false);
  END IF;

  IF NOT public.bcp_employer_party(_l.assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: you are not a member of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'case_id', _case_id,
    'linked', true,
    'link_id', _l.id,
    'assignment_id', _l.assignment_id,
    'application_id', _l.application_id,
    'linked_at', _l.linked_at,
    'bound', jsonb_build_object(
      'response_id', _l.bound_response_id,
      'response_version', _l.bound_response_version,
      'assignment_revision', _l.bound_assignment_revision,
      'method_version_id', _l.bound_method_version_id,
      'content_hash', _l.bound_content_hash,
      'answers_content_hash', _l.bound_answers_content_hash,
      'notice_version', _l.bound_notice_version,
      'notice_content_hash', _l.bound_notice_content_hash,
      'notice_locale', _l.bound_notice_locale),
    -- The candidate's own words, exactly as submitted.
    'answers', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', an.item_key,
          'response_state', an.response_state,
          'value_boolean', an.value_boolean,
          'value_text', an.value_text,
          'value_date', an.value_date,
          'selected_option_keys', to_jsonb(coalesce(an.selected_option_keys, ARRAY[]::text[])),
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY s.display_order, i.display_order, an.item_key)
        FROM public.bcp_answers an
        JOIN public.beskt_items i ON i.id = an.item_id
        JOIN public.beskt_sections s ON s.id = i.section_id
       WHERE an.response_id = _l.bound_response_id), '[]'::jsonb),
    -- The frozen topics, in their derived order.
    'topics', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _l.id), '[]'::jsonb),
    'produces_score', false,
    'interpretation', 'none');
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_linkable_interview_cases(_assignment_id uuid)
 RETURNS TABLE(case_id uuid, title text, status text, created_at timestamp with time zone, already_linked boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.title, c.status, c.created_at,
         EXISTS (SELECT 1 FROM public.bcp_case_links l
                  WHERE l.case_id = c.id AND l.unlinked_at IS NULL)
    FROM public.bcp_assignments a
    JOIN public.scp_interview_cases c
      ON c.employer_id = a.employer_id
     AND c.application_id IS NOT DISTINCT FROM a.application_id
     AND c.candidate_user_id IS NOT DISTINCT FROM a.candidate_user_id
   WHERE a.id = _assignment_id
     AND a.lifecycle_state = 'submitted'
     AND c.status <> 'cancelled'
     AND auth.uid() IS NOT NULL
     AND public.bcp_employer_party(a.id)
   ORDER BY c.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_unlink_preparation_from_case(_operation_id uuid, _link_id uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _l public.bcp_case_links%ROWTYPE;
  _a public.bcp_assignments%ROWTYPE;
  _request jsonb;
  _hash text;
  _replay jsonb;
  _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_REASON_REQUIRED: say why, so the history can be read afterwards.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object(
    'op', 'bcp_unlink_preparation_from_case',
    'link_id', _link_id,
    'reason', _reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _l FROM public.bcp_case_links WHERE id = _link_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_NOT_FOUND: no such link.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.bcp_employer_party(_l.assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: you are not a member of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _l.unlinked_at IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_ALREADY_UNLINKED: this link is already unlinked.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_l.assignment_id::text, 0));

  UPDATE public.bcp_case_links
     SET unlinked_at = now(), unlinked_by = _caller, unlinked_reason = _reason,
         unlink_operation_id = _operation_id
   WHERE id = _link_id;

  -- The source row on the case is marked erased rather than removed: the case
  -- keeps the fact that material was once attached, which is what an audit of
  -- the interview would need to see.
  UPDATE public.scp_interview_case_sources
     SET retention_state = 'erased', erased_at = now(), content_text = NULL
   WHERE id = _l.source_id AND retention_state <> 'erased';

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _l.assignment_id;

  _result := jsonb_build_object('link_id', _link_id, 'case_id', _l.case_id, 'unlinked', true);

  PERFORM public.bcp_record_event(
    _l.assignment_id, _l.bound_response_id, _l.employer_id, _l.bound_method_version_id,
    'case_unlinked', _a.lifecycle_state, _a.lifecycle_state, _reason,
    _l.bound_content_hash, _a.revision, _operation_id, _hash, _result,
    jsonb_build_object('case_id', _l.case_id, 'link_id', _link_id));

  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_link_preparation_to_case(_operation_id uuid, _assignment_id uuid, _case_id uuid, _expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _a public.bcp_assignments%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
  _c public.scp_interview_cases%ROWTYPE;
  _ack public.bcp_notice_acknowledgements%ROWTYPE;
  _request jsonb;
  _hash text;
  _replay jsonb;
  _source_id uuid;
  _link_id uuid;
  _topics integer := 0;
  _label text;
  _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object(
    'op', 'bcp_link_preparation_to_case',
    'assignment_id', _assignment_id,
    'case_id', _case_id,
    'expected_revision', _expected_revision);
  _hash := public.beskt_request_hash(_request);

  -- Replay BEFORE any write, so a retried request is answered rather than
  -- repeated. The same operation id with a different payload is refused.
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  -- Serialise against the preparation, so two members of the same employer
  -- pressing the button at once produce one link and one refusal rather than
  -- two links or a torn write.
  PERFORM pg_advisory_xact_lock(hashtextextended(_assignment_id::text, 0));

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_NOT_FOUND: no such preparation.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- AUTHORISATION: an employer action. The candidate is not a party to it.
  IF NOT public.bcp_employer_party(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: you are not a member of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.revision <> _expected_revision THEN
    RAISE EXCEPTION 'BCP_STALE_REVISION: the preparation is at revision % but the request expected %. Reload and retry.',
      _a.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;

  IF _a.lifecycle_state = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_CANCELLED: a cancelled preparation cannot be linked.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.lifecycle_state <> 'submitted' THEN
    RAISE EXCEPTION 'BCP_NOT_SUBMITTED: only a submitted preparation may be linked to a case.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _r FROM public.bcp_responses
   WHERE assignment_id = _assignment_id AND response_state = 'submitted'
   ORDER BY response_version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_NOT_SUBMITTED: this preparation has no submitted response.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _ack FROM public.bcp_notice_acknowledgements
   WHERE assignment_id = _assignment_id
   ORDER BY acknowledged_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_NOTICE_NOT_ACKNOWLEDGED: the preparation carries no acknowledgement.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CASE_NOT_FOUND: no such interview case.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Same employer, same application, same candidate. Tenancy alone is not
  -- enough: it would admit another candidate's case at the same employer.
  IF _c.employer_id <> _a.employer_id THEN
    RAISE EXCEPTION 'BCP_CASE_MISMATCH: the case belongs to another employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _c.application_id IS DISTINCT FROM _a.application_id THEN
    RAISE EXCEPTION 'BCP_CASE_MISMATCH: the case is not about this job application.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _c.candidate_user_id IS DISTINCT FROM _a.candidate_user_id THEN
    RAISE EXCEPTION 'BCP_CASE_MISMATCH: the case is not about this candidate.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _c.status = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_CASE_CANCELLED: a cancelled case takes no new source.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.bcp_case_links
              WHERE assignment_id = _assignment_id AND unlinked_at IS NULL) THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_EXISTS: this preparation is already linked to a case.'
      USING ERRCODE = 'unique_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bcp_case_links
              WHERE case_id = _case_id AND unlinked_at IS NULL) THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_EXISTS: this case already has a linked preparation.'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- The source row on the EXISTING case. A pointer, not a copy: the answers
  -- stay in bcp_answers, and the label says what this is in plain words.
  _label := 'BESKT-förberedelse, inskickad ' || to_char(_r.submitted_at, 'YYYY-MM-DD');
  -- 20261130090000: an invitation-based preparation has no application to
  -- point at, so the source names the assignment instead -- still a pointer,
  -- never a copy of the answers.
  INSERT INTO public.scp_interview_case_sources
    (case_id, source_kind, label, content_text, linked_application_id,
     purpose_code, lawful_basis_note, provided_by, origin)
  VALUES
    (_case_id, 'beskt_preparation', _label,
     CASE WHEN _a.application_id IS NULL
          THEN 'BESKT-uppdrag ' || _assignment_id::text || ': kandidatens inskickade förberedelse finns i BESKT-underlaget.' END,
     _a.application_id,
     'recruitment_interview',
     CASE WHEN _a.mode = 'security_vetting_support'
          THEN 'Kandidatens egen inskickade BESKT-förberedelse inför säkerhetsprövningsintervjun. '
               'Arbetsgivarens rättsliga grund: ' || _a.lawful_basis_statement || '. '
               'Underlaget är kandidatens egna ord; det innehåller ingen poäng, riskklass eller bedömning.'
          ELSE 'Kandidatens egen inskickade BESKT-förberedelse för detta uppdrag. '
               'Underlaget är kandidatens egna ord; det innehåller ingen poäng, '
               'rangordning eller bedömning.' END,
     _caller, CASE WHEN _a.application_id IS NULL THEN 'candidate_shared' ELSE 'candidate_application' END)
  RETURNING id INTO _source_id;

  INSERT INTO public.bcp_case_links
    (assignment_id, case_id, employer_id, application_id, candidate_user_id,
     bound_response_id, bound_response_version, bound_assignment_revision,
     bound_method_version_id, bound_content_hash, bound_answers_content_hash,
     bound_notice_version, bound_notice_content_hash, bound_notice_locale,
     source_id, linked_by, link_operation_id)
  VALUES
    (_assignment_id, _case_id, _a.employer_id, _a.application_id, _a.candidate_user_id,
     _r.id, _r.response_version, _a.revision,
     _a.method_version_id, _a.pinned_content_hash, _r.submitted_content_hash,
     _ack.notice_version, _ack.notice_content_hash, _ack.locale,
     _source_id, _caller, _operation_id)
  RETURNING id INTO _link_id;

  -- ── THE DETERMINISTIC DERIVATION ────────────────────────────────────
  --
  -- One row per question the candidate left omitted or asked to take orally,
  -- in the governed content's own order. Nothing is selected, weighted or
  -- prioritised: the set is exactly the submitted answers in those two states,
  -- and the order is the order the questions were asked in.
  INSERT INTO public.bcp_case_topics
    (link_id, derived_from_response_id, item_id, item_key, topic_reason, display_order)
  SELECT _link_id, _r.id, an.item_id, an.item_key, an.response_state,
         row_number() OVER (ORDER BY s.display_order, i.display_order, an.item_key)
    FROM public.bcp_answers an
    JOIN public.beskt_items i ON i.id = an.item_id
    JOIN public.beskt_sections s ON s.id = i.section_id
   WHERE an.response_id = _r.id
     AND an.response_state IN ('omitted', 'discuss_orally');
  GET DIAGNOSTICS _topics = ROW_COUNT;

  -- 20261130090000 -- §4.5 rows 1-2: an explicit answer that FIRED a governed
  -- show-rule opening follow-up questions is its own topic, carrying the
  -- (lowest) rule key that fired. Answers only; a non-answer never fires a
  -- rule. Ordered after the two states above, in the method's own order.
  INSERT INTO public.bcp_case_topics
    (link_id, derived_from_response_id, item_id, item_key, topic_reason, trigger_rule_key, display_order)
  SELECT _link_id, _r.id, d.item_id, d.item_key, 'candidate_disclosed', d.rule_key,
         _topics + row_number() OVER (ORDER BY d.section_order, d.item_order, d.item_key)
    FROM (
      SELECT an.item_id, an.item_key, s.display_order AS section_order, i.display_order AS item_order,
             min(rr.rule_key) AS rule_key
        FROM public.bcp_answers an
        JOIN public.beskt_items i ON i.id = an.item_id
        JOIN public.beskt_sections s ON s.id = i.section_id
        JOIN public.beskt_routing_rules rr
          ON rr.source_item_id = an.item_id AND rr.action = 'show'
         AND (rr.applies_mode = 'recruitment_support' OR _a.mode = 'security_vetting_support')
        LEFT JOIN public.beskt_item_options o ON o.id = rr.condition_option_id
       WHERE an.response_id = _r.id
         AND an.response_state = 'answered'
         AND ((rr.condition_kind = 'option_selected'
               AND o.option_key = ANY (coalesce(an.selected_option_keys, '{}'::text[])))
              OR (rr.condition_kind = 'boolean_equals' AND an.value_boolean = rr.condition_boolean))
       GROUP BY an.item_id, an.item_key, s.display_order, i.display_order) d;
  _topics := (SELECT count(*) FROM public.bcp_case_topics WHERE link_id = _link_id);

  _result := jsonb_build_object(
    'link_id', _link_id,
    'case_id', _case_id,
    'source_id', _source_id,
    'topic_count', _topics,
    'bound_response_id', _r.id,
    'bound_response_version', _r.response_version,
    'bound_assignment_revision', _a.revision,
    'bound_content_hash', _a.pinned_content_hash,
    'bound_answers_content_hash', _r.submitted_content_hash,
    'bound_notice_version', _ack.notice_version,
    'bound_notice_content_hash', _ack.notice_content_hash,
    'bound_notice_locale', _ack.locale);

  PERFORM public.bcp_record_event(
    _assignment_id, _r.id, _a.employer_id, _a.method_version_id,
    'case_linked', _a.lifecycle_state, _a.lifecycle_state, NULL,
    _a.pinned_content_hash, _a.revision, _operation_id, _hash, _result,
    jsonb_build_object('case_id', _case_id, 'link_id', _link_id, 'topic_count', _topics));

  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_guard_case_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _a public.bcp_assignments%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
  _c public.scp_interview_cases%ROWTYPE;
  _src public.scp_interview_case_sources%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_NO_DELETE: a link is unlinked, never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- The only permitted change is an unlink, once, and nothing else may move
    -- with it. A link that could be re-pointed would break the binding this
    -- table exists to provide.
    IF OLD.unlinked_at IS NOT NULL THEN
      RAISE EXCEPTION 'BCP_CASE_LINK_IMMUTABLE: this link is already unlinked.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id <> OLD.id
       OR NEW.assignment_id <> OLD.assignment_id
       OR NEW.case_id <> OLD.case_id
       OR NEW.employer_id <> OLD.employer_id
       OR NEW.application_id IS DISTINCT FROM OLD.application_id
       OR NEW.candidate_user_id <> OLD.candidate_user_id
       OR NEW.bound_response_id <> OLD.bound_response_id
       OR NEW.bound_response_version <> OLD.bound_response_version
       OR NEW.bound_assignment_revision <> OLD.bound_assignment_revision
       OR NEW.bound_method_version_id <> OLD.bound_method_version_id
       OR NEW.bound_content_hash <> OLD.bound_content_hash
       OR NEW.bound_answers_content_hash <> OLD.bound_answers_content_hash
       OR NEW.bound_notice_version <> OLD.bound_notice_version
       OR NEW.bound_notice_content_hash <> OLD.bound_notice_content_hash
       OR NEW.bound_notice_locale <> OLD.bound_notice_locale
       OR NEW.source_id <> OLD.source_id
       OR NEW.linked_by <> OLD.linked_by
       OR NEW.linked_at <> OLD.linked_at
       OR NEW.link_operation_id <> OLD.link_operation_id THEN
      RAISE EXCEPTION 'BCP_CASE_LINK_IMMUTABLE: only the unlink columns may change.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.unlinked_at IS NULL THEN
      RAISE EXCEPTION 'BCP_CASE_LINK_UNLINK_ONLY: an update must be an unlink.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- ---- INSERT -------------------------------------------------------------
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = NEW.assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_NOT_FOUND: no such preparation.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ONLY A SUBMITTED SNAPSHOT. Checked here, not only in the RPC, because a
  -- draft reaching an employer's case is the failure this whole domain is
  -- arranged to prevent.
  SELECT * INTO _r FROM public.bcp_responses WHERE id = NEW.bound_response_id;
  IF NOT FOUND OR _r.assignment_id <> NEW.assignment_id THEN
    RAISE EXCEPTION 'BCP_RESPONSE_NOT_IN_ASSIGNMENT: the bound response is not this preparation''s.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _r.response_state <> 'submitted' OR _r.submitted_at IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_SUBMITTED: only a submitted preparation may be linked to a case.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.lifecycle_state <> 'submitted' THEN
    RAISE EXCEPTION 'BCP_NOT_SUBMITTED: the preparation is in state %, not submitted.', _a.lifecycle_state
      USING ERRCODE = 'check_violation';
  END IF;

  -- The bound identity must be the snapshot's own, not a caller's assertion.
  IF NEW.bound_response_version <> _r.response_version
     OR NEW.bound_assignment_revision <> _a.revision
     OR NEW.bound_method_version_id <> _a.method_version_id
     OR NEW.bound_content_hash <> _a.pinned_content_hash
     OR NEW.bound_answers_content_hash <> _r.submitted_content_hash
     OR NEW.bound_notice_version <> _a.notice_version
     OR NEW.application_id IS DISTINCT FROM _a.application_id
     OR NEW.employer_id <> _a.employer_id
     OR NEW.candidate_user_id <> _a.candidate_user_id THEN
    RAISE EXCEPTION 'BCP_BOUND_SNAPSHOT_MISMATCH: the bound identity is not the preparation''s own.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The acknowledged notice, in the locale it was acknowledged in.
  IF NOT EXISTS (
    SELECT 1 FROM public.bcp_notice_acknowledgements ack
     WHERE ack.assignment_id = NEW.assignment_id
       AND ack.notice_version = NEW.bound_notice_version
       AND ack.notice_content_hash = NEW.bound_notice_content_hash
       AND ack.locale = NEW.bound_notice_locale) THEN
    RAISE EXCEPTION 'BCP_NOTICE_BINDING_UNKNOWN: no acknowledgement matches the bound notice.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── SAME EMPLOYER, SAME APPLICATION, SAME CANDIDATE ──────────────────
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = NEW.case_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CASE_NOT_FOUND: no such interview case.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _c.employer_id <> NEW.employer_id
     OR _c.application_id IS DISTINCT FROM NEW.application_id
     OR _c.candidate_user_id IS DISTINCT FROM NEW.candidate_user_id THEN
    RAISE EXCEPTION 'BCP_CASE_MISMATCH: the case and the preparation are not about the same application and candidate.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _c.status = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_CASE_CANCELLED: a cancelled case takes no new source.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The source row must be this case's, and must be the governed kind.
  SELECT * INTO _src FROM public.scp_interview_case_sources WHERE id = NEW.source_id;
  IF NOT FOUND OR _src.case_id <> NEW.case_id OR _src.source_kind <> 'beskt_preparation' THEN
    RAISE EXCEPTION 'BCP_SOURCE_MISMATCH: the source row is not a beskt_preparation source of this case.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_guard_case_topic()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _l public.bcp_case_links%ROWTYPE;
  _state text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'BCP_CASE_TOPIC_APPEND_ONLY: a derived topic is never updated or deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _l FROM public.bcp_case_links WHERE id = NEW.link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_NOT_FOUND: no such link.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.derived_from_response_id <> _l.bound_response_id THEN
    RAISE EXCEPTION 'BCP_TOPIC_NOT_FROM_BOUND_SNAPSHOT: a topic must come from the link''s own bound response.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- THE DERIVATION IS NOT THE CALLER'S TO ASSERT. The reason recorded has to
  -- be the reason the candidate actually gave, read from the submitted answer
  -- itself. Without this, a caller could write 'omitted' against a question
  -- the candidate answered in full.
  SELECT an.response_state INTO _state
    FROM public.bcp_answers an
   WHERE an.response_id = _l.bound_response_id
     AND an.item_id = NEW.item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_TOPIC_ITEM_NOT_ANSWERED: the item is not in the bound snapshot.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 20261130090000: a disclosed topic is an ANSWERED item whose governed
  -- show-rule it names; the two neutral states are unchanged.
  IF NEW.topic_reason = 'candidate_disclosed' THEN
    IF _state <> 'answered' OR NOT EXISTS (
         SELECT 1 FROM public.beskt_routing_rules rr
          WHERE rr.rule_key = NEW.trigger_rule_key AND rr.source_item_id = NEW.item_id
            AND rr.action = 'show') THEN
      RAISE EXCEPTION 'BCP_TOPIC_REASON_MISMATCH: a disclosed topic is an answered item and the show-rule it fired.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _state <> NEW.topic_reason THEN
    RAISE EXCEPTION 'BCP_TOPIC_REASON_MISMATCH: the snapshot records % for this item, not %.',
      _state, NEW.topic_reason USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_guard_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _permitted text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_NO_DELETE: a preparation assignment is cancelled, never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- What was assigned can never change. A different method version, a
    -- different profile, a different hash or a different party is a
    -- different assignment.
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.employer_id IS DISTINCT FROM OLD.employer_id
       OR NEW.job_id IS DISTINCT FROM OLD.job_id
       OR NEW.application_id IS DISTINCT FROM OLD.application_id
       OR NEW.candidate_user_id IS DISTINCT FROM OLD.candidate_user_id
       OR NEW.method_version_id IS DISTINCT FROM OLD.method_version_id
       OR NEW.exposure_profile_id IS DISTINCT FROM OLD.exposure_profile_id
       OR NEW.mode IS DISTINCT FROM OLD.mode
       OR NEW.pinned_content_hash IS DISTINCT FROM OLD.pinned_content_hash
       OR NEW.pinned_content_hash_algorithm IS DISTINCT FROM OLD.pinned_content_hash_algorithm
       OR NEW.pinned_release_scope IS DISTINCT FROM OLD.pinned_release_scope
       OR NEW.notice_version IS DISTINCT FROM OLD.notice_version
       OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
       OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
       OR NEW.available_from IS DISTINCT FROM OLD.available_from
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       -- 20261130090000: who, what for and on what basis is fixed at start.
       OR NEW.invitation_id IS DISTINCT FROM OLD.invitation_id
       OR NEW.role_title IS DISTINCT FROM OLD.role_title
       OR NEW.responsible_interviewer_id IS DISTINCT FROM OLD.responsible_interviewer_id
       OR NEW.contact_statement IS DISTINCT FROM OLD.contact_statement
       OR NEW.security_owner_id IS DISTINCT FROM OLD.security_owner_id
       OR NEW.role_security_attestation IS DISTINCT FROM OLD.role_security_attestation
       OR NEW.lawful_basis_statement IS DISTINCT FROM OLD.lawful_basis_statement THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_IMMUTABLE: what was assigned cannot be changed; cancel and assign again.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- A submitted preparation is finished. It is not reopened, not
    -- re-answered and not silently rewound.
    IF OLD.lifecycle_state = 'submitted' AND NEW.lifecycle_state <> 'submitted' THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_SUBMITTED_IMMUTABLE: a submitted preparation cannot return to an earlier state.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.lifecycle_state = 'cancelled' AND NEW.lifecycle_state <> 'cancelled' THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_CANCELLED_IMMUTABLE: a cancelled preparation cannot be revived.'
        USING ERRCODE = 'check_violation';
    END IF;

    _permitted := CASE OLD.lifecycle_state
      WHEN 'assigned'            THEN ARRAY['assigned', 'notice_acknowledged', 'cancelled']
      WHEN 'notice_acknowledged' THEN ARRAY['notice_acknowledged', 'in_progress', 'submitted', 'cancelled']
      WHEN 'in_progress'         THEN ARRAY['in_progress', 'submitted', 'cancelled']
      WHEN 'submitted'           THEN ARRAY['submitted']
      WHEN 'cancelled'           THEN ARRAY['cancelled']
      ELSE ARRAY[]::text[] END;
    IF NOT (NEW.lifecycle_state = ANY (_permitted)) THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_TRANSITION: "%" -> "%" is not a permitted transition.',
        OLD.lifecycle_state, NEW.lifecycle_state USING ERRCODE = 'check_violation';
    END IF;

    -- Timestamps are recorded once.
    IF OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_IMMUTABLE: the acknowledgement time is recorded once.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_IMMUTABLE: the submission time is recorded once.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.first_opened_at IS NOT NULL AND NEW.first_opened_at IS DISTINCT FROM OLD.first_opened_at THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_IMMUTABLE: the first-opened time is recorded once.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revision < OLD.revision THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_REVISION: the revision never moves backwards.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_guard_conduct_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _p public.bcp_conduct_positions%ROWTYPE;
  _s public.bcp_conduct_sessions%ROWTYPE;
  _prev public.bcp_conduct_entries%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NO_DELETE: a recorded entry is superseded, never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- The ONLY permitted update is stepping out of the live slot when a
    -- correction supersedes this row. Everything the entry says is frozen.
    IF OLD.superseded_by_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_FROZEN: this entry has already been superseded.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id <> OLD.id
       OR NEW.position_id <> OLD.position_id
       OR NEW.session_id <> OLD.session_id
       OR NEW.item_id <> OLD.item_id
       OR NEW.item_key <> OLD.item_key
       OR NEW.topic_id IS DISTINCT FROM OLD.topic_id
       OR NEW.topic_basis <> OLD.topic_basis
       OR NEW.observable_fact IS DISTINCT FROM OLD.observable_fact
       OR NEW.candidate_explanation IS DISTINCT FROM OLD.candidate_explanation
       OR NEW.interviewer_interpretation IS DISTINCT FROM OLD.interviewer_interpretation
       OR NEW.alternative_explanation IS DISTINCT FROM OLD.alternative_explanation
       OR NEW.protective_factor IS DISTINCT FROM OLD.protective_factor
       OR NEW.event_timing IS DISTINCT FROM OLD.event_timing
       OR NEW.consequence IS DISTINCT FROM OLD.consequence
       OR NEW.supporting_information IS DISTINCT FROM OLD.supporting_information
       OR NEW.contradicting_information IS DISTINCT FROM OLD.contradicting_information
       OR NEW.measures_taken IS DISTINCT FROM OLD.measures_taken
       OR NEW.role_link IS DISTINCT FROM OLD.role_link
       OR NEW.information_gap IS DISTINCT FROM OLD.information_gap
       OR NEW.candidate_response IS DISTINCT FROM OLD.candidate_response
       OR NEW.verification_need IS DISTINCT FROM OLD.verification_need
       OR NEW.sensitivity_class <> OLD.sensitivity_class
       OR NEW.recorded_by <> OLD.recorded_by
       OR NEW.recorded_at <> OLD.recorded_at
       OR NEW.entry_version <> OLD.entry_version
       OR NEW.supersedes_entry_id IS DISTINCT FROM OLD.supersedes_entry_id
       OR NEW.correction_reason IS DISTINCT FROM OLD.correction_reason THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_ENTRY_EDITED_IN_PLACE: correct an entry by superseding it, so what was '
        'first recorded survives. An entry that could be edited would leave no trace that it changed.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- EXACTLY TWO SHAPES OF UPDATE ARE PERMITTED, and nothing else reaches here.
    --
    -- One: a supersede, which vacates the live slot and changes nothing the
    -- entry says.
    --
    -- Two: the verification state and its source moving forward. That is the
    -- only thing on an entry that is genuinely current rather than historical,
    -- and it is permitted ONLY when the append-only history already records
    -- the move. A direct write with no history row behind it is refused, so
    -- the state on the entry can never disagree with the history that explains
    -- it.
    IF NEW.verification_state IS DISTINCT FROM OLD.verification_state
       OR NEW.verification_source IS DISTINCT FROM OLD.verification_source THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.bcp_conduct_verifications v
         WHERE v.entry_id = NEW.id
           AND v.new_state = NEW.verification_state
           AND v.seq = (SELECT max(seq) FROM public.bcp_conduct_verifications
                         WHERE entry_id = NEW.id)) THEN
        RAISE EXCEPTION
          'BCP_CONDUCT_VERIFICATION_UNRECORDED: a verification state moves only with a history row '
          'behind it, so what the entry says and what the history explains can never disagree.'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.superseded_by_entry_id IS NULL THEN
      RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NOOP_UPDATE: the only permitted update is a supersede.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- ---- INSERT -------------------------------------------------------------
  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = NEW.position_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_NOT_FOUND: no such position.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.session_id <> NEW.session_id THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_MISMATCH: the position is not in this session.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOTHING IS RECORDED INTO A LOCKED POSITION. Not by the RPC, not by the
  -- owner, not by a direct write.
  IF _p.state = 'locked' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_LOCKED: this position is locked; reopen it deliberately first.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The entry belongs to the person whose position it is.
  IF NEW.recorded_by <> _p.assessor_id THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NOT_OWN: an entry is recorded by the assessor whose position it is.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = NEW.session_id;
  IF _s.state <> 'open' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_CONCLUDED: this conduct session is concluded.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── THE GOVERNED BASIS IS NOT THE CALLER'S TO INVENT ────────────────
  --
  -- The item must belong to the method version the session is bound to, and
  -- the item_key must be that item's own. An interview subject with no
  -- governed question behind it has no basis to be asked about.
  IF NOT EXISTS (SELECT 1 FROM public.beskt_items i
                  WHERE i.id = NEW.item_id
                    AND i.method_version_id = _s.bound_method_version_id
                    AND i.item_key = NEW.item_key) THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_ITEM_NOT_IN_VERSION: "%" is not an item of the method version this session is bound to.',
      NEW.item_key USING ERRCODE = 'check_violation';
  END IF;

  -- A derived topic must be one of THIS link's topics, and must name the same
  -- item. A topic borrowed from another case would carry another candidate.
  IF NEW.topic_basis = 'derived_neutral_topic' THEN
    IF NEW.topic_id IS NULL THEN
      RAISE EXCEPTION 'BCP_CONDUCT_TOPIC_REQUIRED: a derived-topic entry names the topic it came from.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bcp_case_topics t
                    WHERE t.id = NEW.topic_id
                      AND t.link_id = _s.link_id
                      AND t.item_id = NEW.item_id) THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_TOPIC_NOT_IN_LINK: the topic is not one of this link''s derived topics for that item.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.topic_id IS NOT NULL THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_TOPIC_UNEXPECTED: an entry on a governed method item does not also claim a derived topic.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A correction continues its own chain, on the same position and item.
  IF NEW.supersedes_entry_id IS NOT NULL THEN
    SELECT * INTO _prev FROM public.bcp_conduct_entries WHERE id = NEW.supersedes_entry_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BCP_CONDUCT_SUPERSEDES_UNKNOWN: no such entry to correct.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF _prev.position_id <> NEW.position_id OR _prev.item_id <> NEW.item_id THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_CORRECTION_CROSSES: a correction stays on the same position and the same item.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- The predecessor must not already be spoken for BY SOMEONE ELSE. It may
    -- well already name THIS row: the governed path vacates the live slot
    -- before the successor is inserted, which is the only way both can respect
    -- the one-live-entry index.
    IF _prev.superseded_by_entry_id IS NOT NULL
       AND _prev.superseded_by_entry_id <> NEW.id THEN
      RAISE EXCEPTION 'BCP_CONDUCT_ALREADY_CORRECTED: that entry has already been superseded.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.entry_version <> _prev.entry_version + 1 THEN
      RAISE EXCEPTION 'BCP_CONDUCT_VERSION_SKIPPED: a correction is exactly one version on.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_save_entry(_operation_id uuid, _position_id uuid, _expected_revision integer, _entry jsonb, _corrects_entry_id uuid DEFAULT NULL::uuid, _correction_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _p public.bcp_conduct_positions%ROWTYPE;
  _s public.bcp_conduct_sessions%ROWTYPE;
  _prev public.bcp_conduct_entries%ROWTYPE;
  _request jsonb; _hash text; _replay jsonb;
  _item_id uuid; _item_key text; _topic_id uuid; _basis text;
  _new_id uuid; _version integer := 1; _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _entry IS NULL OR jsonb_typeof(_entry) <> 'object' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NOT_STRUCTURED: an entry is a JSON object of named fields.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object('op', 'bcp_conduct_save_entry',
    'position_id', _position_id, 'expected_revision', _expected_revision,
    'entry', _entry, 'corrects_entry_id', _corrects_entry_id,
    'correction_reason', _correction_reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_position_id::text, 0));

  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = _position_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_NOT_FOUND: no such position.' USING ERRCODE = 'check_violation';
  END IF;

  -- YOUR OWN POSITION ONLY. Recording into someone else's is exactly the
  -- contamination the independence rule exists to prevent.
  IF _p.assessor_id <> _caller THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_OWN_POSITION: you may only record in your own position.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _p.session_id;
  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.revision <> _expected_revision THEN
    RAISE EXCEPTION
      'BCP_STALE_REVISION: the position is at revision % but the request expected %. Reload and retry.',
      _p.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;
  IF _p.state <> 'open' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_LOCKED: this position is locked; reopen it deliberately first.'
      USING ERRCODE = 'check_violation';
  END IF;

  _item_key := _entry ->> 'item_key';
  _topic_id := (_entry ->> 'topic_id')::uuid;
  IF _item_key IS NULL THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ITEM_REQUIRED: an entry names the governed item it is about.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT i.id INTO _item_id FROM public.beskt_items i
   WHERE i.method_version_id = _s.bound_method_version_id AND i.item_key = _item_key;
  IF _item_id IS NULL THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_ITEM_NOT_IN_VERSION: "%" is not an item of the method version this session is bound to.',
      _item_key USING ERRCODE = 'check_violation';
  END IF;
  _basis := CASE WHEN _topic_id IS NULL THEN 'governed_method_item' ELSE 'derived_neutral_topic' END;

  -- ---- a correction continues the chain -----------------------------------
  IF _corrects_entry_id IS NOT NULL THEN
    SELECT * INTO _prev FROM public.bcp_conduct_entries
     WHERE id = _corrects_entry_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BCP_CONDUCT_SUPERSEDES_UNKNOWN: no such entry to correct.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF _prev.position_id <> _position_id THEN
      RAISE EXCEPTION 'BCP_CONDUCT_NOT_OWN_POSITION: that entry is not in your position.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF _prev.superseded_by_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'BCP_CONDUCT_ALREADY_CORRECTED: that entry has already been superseded.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF length(btrim(coalesce(_correction_reason, ''))) < 3 THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_CORRECTION_REASON_REQUIRED: say why the record changed, so the history can be read.'
        USING ERRCODE = 'check_violation';
    END IF;
    _version := _prev.entry_version + 1;
    _item_id := _prev.item_id;
    _item_key := _prev.item_key;
    _topic_id := _prev.topic_id;
    _basis := _prev.topic_basis;
  END IF;

  -- Vacate the live slot FIRST. The successor's id is generated here so the
  -- old row can name it before it exists; the deferred foreign key above is
  -- what makes that legal, and it is still checked at commit.
  _new_id := gen_random_uuid();
  IF _corrects_entry_id IS NOT NULL THEN
    UPDATE public.bcp_conduct_entries
       SET superseded_by_entry_id = _new_id
     WHERE id = _corrects_entry_id;
  END IF;

  INSERT INTO public.bcp_conduct_entries
    (id, position_id, session_id, topic_id, item_id, item_key, topic_basis,
     observable_fact, candidate_explanation, interviewer_interpretation,
     alternative_explanation, protective_factor,
     event_timing, consequence, supporting_information, contradicting_information, measures_taken, role_link, information_gap, candidate_response,
     verification_need, verification_state, verification_source,
     sensitivity_class, recorded_by, save_operation_id,
     entry_version, supersedes_entry_id, correction_reason)
  VALUES
    (_new_id, _position_id, _p.session_id, _topic_id, _item_id, _item_key, _basis,
     nullif(btrim(coalesce(_entry ->> 'observable_fact', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'candidate_explanation', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'interviewer_interpretation', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'alternative_explanation', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'protective_factor', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'event_timing', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'consequence', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'supporting_information', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'contradicting_information', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'measures_taken', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'role_link', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'information_gap', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'candidate_response', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'verification_need', '')), ''),
     coalesce(_entry ->> 'verification_state', 'not_required'),
     nullif(btrim(coalesce(_entry ->> 'verification_source', '')), ''),
     coalesce(_entry ->> 'sensitivity_class', 'ordinary'),
     _caller, _operation_id,
     _version, _corrects_entry_id, nullif(btrim(coalesce(_correction_reason, '')), ''));

  UPDATE public.bcp_conduct_positions SET revision = revision + 1 WHERE id = _position_id;

  _result := jsonb_build_object(
    'entry_id', _new_id, 'position_id', _position_id, 'session_id', _p.session_id,
    'item_key', _item_key, 'entry_version', _version,
    'supersedes_entry_id', _corrects_entry_id,
    'position_revision', _p.revision + 1);

  PERFORM public.bcp_record_event(
    _s.assignment_id, _s.bound_response_id, _s.employer_id, _s.bound_method_version_id,
    CASE WHEN _corrects_entry_id IS NULL THEN 'conduct_entry_saved' ELSE 'conduct_entry_corrected' END,
    NULL, NULL, nullif(btrim(coalesce(_correction_reason, '')), ''),
    _s.bound_content_hash, _p.revision + 1, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _p.session_id, 'entry_id', _new_id, 'item_key', _item_key));

  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_workspace(_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _me public.bcp_conduct_positions%ROWTYPE;
  _reveal boolean;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _me FROM public.bcp_conduct_positions
   WHERE session_id = _session_id AND assessor_id = _caller;
  _reveal := public.bcp_conduct_may_see_others(_session_id);

  RETURN jsonb_build_object(
    'session_id', _s.id,
    'case_id', _s.case_id,
    'link_id', _s.link_id,
    'state', _s.state,
    'session_revision', _s.revision,
    -- THE BOUND SNAPSHOT STAYS VISIBLE AND BOUND throughout the interview.
    'bound', jsonb_build_object(
      'response_id', _s.bound_response_id,
      'response_version', _s.bound_response_version,
      'method_version_id', _s.bound_method_version_id,
      'content_hash', _s.bound_content_hash,
      'answers_content_hash', _s.bound_answers_content_hash),
    -- PR 4's deterministic themes, in their derived order, with the
    -- candidate's own state carried through NEUTRALLY and nothing added.
    'topics', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'topic_id', t.id,
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'trigger_rule_key', t.trigger_rule_key,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _s.link_id), '[]'::jsonb),
    'my_position', CASE WHEN _me.id IS NULL THEN NULL ELSE jsonb_build_object(
      'position_id', _me.id, 'state', _me.state, 'position_role', _me.position_role,
      'revision', _me.revision, 'locked_at', _me.locked_at,
      'reopen_count', _me.reopen_count) END,
    'my_entries', CASE WHEN _me.id IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'entry_id', e.id, 'item_key', e.item_key, 'topic_id', e.topic_id,
          'entry_version', e.entry_version,
          'observable_fact', e.observable_fact,
          'candidate_explanation', e.candidate_explanation,
          'interviewer_interpretation', e.interviewer_interpretation,
          'alternative_explanation', e.alternative_explanation,
          'protective_factor', e.protective_factor,
          'event_timing', e.event_timing,
          'consequence', e.consequence,
          'supporting_information', e.supporting_information,
          'contradicting_information', e.contradicting_information,
          'measures_taken', e.measures_taken,
          'role_link', e.role_link,
          'information_gap', e.information_gap,
          'candidate_response', e.candidate_response,
          'verification_need', e.verification_need,
          'verification_state', e.verification_state,
          'verification_source', e.verification_source,
          'sensitivity_class', e.sensitivity_class,
          'recorded_at', e.recorded_at)
        ORDER BY e.item_key)
        FROM public.bcp_conduct_entries e
       WHERE e.position_id = _me.id AND e.superseded_by_entry_id IS NULL), '[]'::jsonb) END,
    -- Other people's positions: withheld until the reader has locked theirs.
    -- Absent is not empty, so the client can say WHY rather than show nothing.
    'others_visible', _reveal,
    'others', CASE WHEN NOT _reveal THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'position_id', p.id, 'assessor_id', p.assessor_id,
          'position_role', p.position_role, 'state', p.state, 'locked_at', p.locked_at,
          'entries', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'entry_id', e.id, 'item_key', e.item_key,
                'observable_fact', e.observable_fact,
                'candidate_explanation', e.candidate_explanation,
                'interviewer_interpretation', e.interviewer_interpretation,
                'alternative_explanation', e.alternative_explanation,
                'protective_factor', e.protective_factor,
                'event_timing', e.event_timing,
                'consequence', e.consequence,
                'supporting_information', e.supporting_information,
                'contradicting_information', e.contradicting_information,
                'measures_taken', e.measures_taken,
                'role_link', e.role_link,
                'information_gap', e.information_gap,
                'candidate_response', e.candidate_response,
                'verification_state', e.verification_state)
              ORDER BY e.item_key)
              FROM public.bcp_conduct_entries e
             WHERE e.position_id = p.id AND e.superseded_by_entry_id IS NULL), '[]'::jsonb))
        ORDER BY p.created_at)
        FROM public.bcp_conduct_positions p
       WHERE p.session_id = _session_id AND p.assessor_id <> _caller), '[]'::jsonb) END,
    'panel', (
      SELECT jsonb_build_object('panel_id', pn.id, 'state', pn.state,
               'revision', pn.revision, 'revealed_at', pn.revealed_at,
               'resolutions', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                     'resolution_id', r.id, 'item_key', r.item_key,
                     'resolution_kind', r.resolution_kind,
                     'agreed_statement', r.agreed_statement,
                     'divergent_statement', r.divergent_statement,
                     'rationale', r.rationale, 'recorded_at', r.recorded_at)
                   ORDER BY r.recorded_at)
                   FROM public.bcp_conduct_panel_resolutions r
                  WHERE r.panel_id = pn.id), '[]'::jsonb))
        FROM public.bcp_conduct_panels pn WHERE pn.session_id = _session_id),
    -- Said in the payload itself, so a client cannot render a total by mistake.
    'produces_score', false,
    'produces_ranking', false,
    'produces_recommendation', false,
    'interpretation', 'none');
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_entry_history(_entry_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _e public.bcp_conduct_entries%ROWTYPE;
  _p public.bcp_conduct_positions%ROWTYPE;
  _root uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _e FROM public.bcp_conduct_entries WHERE id = _entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NOT_FOUND: no such entry.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = _e.position_id;

  IF _p.assessor_id <> auth.uid()
     AND NOT public.bcp_conduct_may_see_others(_e.session_id) THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_NOT_VISIBLE_YET: lock your own position before reading another assessor''s record.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.scp_iv_can_read_case((SELECT case_id FROM public.bcp_conduct_sessions
                                       WHERE id = _e.session_id)) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'entry_id', _entry_id,
    'item_key', _e.item_key,
    'versions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'entry_id', h.id, 'entry_version', h.entry_version,
          'observable_fact', h.observable_fact,
          'candidate_explanation', h.candidate_explanation,
          'interviewer_interpretation', h.interviewer_interpretation,
          'alternative_explanation', h.alternative_explanation,
          'protective_factor', h.protective_factor,
          'event_timing', h.event_timing,
          'consequence', h.consequence,
          'supporting_information', h.supporting_information,
          'contradicting_information', h.contradicting_information,
          'measures_taken', h.measures_taken,
          'role_link', h.role_link,
          'information_gap', h.information_gap,
          'candidate_response', h.candidate_response,
          'verification_need', h.verification_need,
          'verification_state', h.verification_state,
          'verification_source', h.verification_source,
          'sensitivity_class', h.sensitivity_class,
          'correction_reason', h.correction_reason,
          'supersedes_entry_id', h.supersedes_entry_id,
          'superseded_by_entry_id', h.superseded_by_entry_id,
          'recorded_by', h.recorded_by, 'recorded_at', h.recorded_at)
        ORDER BY h.entry_version)
        FROM public.bcp_conduct_entries h
       WHERE h.position_id = _e.position_id AND h.item_id = _e.item_id), '[]'::jsonb),
    'verifications', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'seq', v.seq, 'previous_state', v.previous_state, 'new_state', v.new_state,
          'source', v.source, 'note', v.note,
          'recorded_by', v.recorded_by, 'recorded_at', v.recorded_at)
        ORDER BY v.seq)
        FROM public.bcp_conduct_verifications v
        JOIN public.bcp_conduct_entries h ON h.id = v.entry_id
       WHERE h.position_id = _e.position_id AND h.item_id = _e.item_id), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_build_report_basis(_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _s public.bcp_conduct_sessions%ROWTYPE;
  _l public.bcp_case_links%ROWTYPE;
  _c public.scp_interview_cases%ROWTYPE;
  _a public.bcp_assignments%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
  _p public.scp_interview_packs%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _l FROM public.bcp_case_links WHERE id = _s.link_id;
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _s.case_id;
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _s.assignment_id;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _s.bound_method_version_id;
  SELECT * INTO _p FROM public.scp_interview_packs WHERE id = _v.pack_id;

  -- 20261130090000: purpose, people, supplements, stance and actions ride
  -- the same frozen basis, so the preview hash covers them too.
  RETURN public.bcp_conduct_report_extensions(_session_id) || jsonb_build_object(
    -- ---- what this document is about ------------------------------------
    'case', jsonb_build_object(
      'case_id', _c.id,
      'employer_id', _c.employer_id,
      'application_id', _c.application_id,
      'candidate_user_id', _c.candidate_user_id,
      'candidate_display_name', _c.candidate_display_name,
      'job_id', _c.job_id,
      'title', _c.title),

    'session', jsonb_build_object(
      'session_id', _s.id,
      'link_id', _s.link_id,
      'assignment_id', _s.assignment_id,
      'opened_at', _s.opened_at,
      'state', _s.state),

    -- ---- what it rests on, exactly --------------------------------------
    'bound', jsonb_build_object(
      'method_version_id', _v.id,
      'pack_slug', _p.slug,
      'method_name_sv', _p.name_sv,
      'method_name_en', _p.name_en,
      'version_number', _v.version_number,
      'mode', _v.mode,
      'validation_label', _v.validation_label,
      'release_scope', _v.release_scope,
      'content_hash', _s.bound_content_hash,
      'answers_content_hash', _s.bound_answers_content_hash,
      'response_id', _s.bound_response_id,
      'response_version', _s.bound_response_version,
      'notice_version', _l.bound_notice_version,
      'notice_content_hash', _l.bound_notice_content_hash,
      'linked_at', _l.linked_at),

    -- ---- the candidate's own frozen words --------------------------------
    'candidate_preparation', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', an.item_key,
          'response_state', an.response_state,
          'value_boolean', an.value_boolean,
          'value_text', an.value_text,
          'value_date', an.value_date,
          'selected_option_keys', to_jsonb(coalesce(an.selected_option_keys, ARRAY[]::text[])),
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY an.item_key)
        FROM public.bcp_answers an
        JOIN public.beskt_items i ON i.id = an.item_id
       WHERE an.response_id = _s.bound_response_id), '[]'::jsonb),

    -- ---- the themes the interview had to cover ---------------------------
    'themes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'trigger_rule_key', t.trigger_rule_key,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _s.link_id), '[]'::jsonb),

    -- ---- every independent position, whole, and never averaged -----------
    'positions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'position_id', pos.id,
          'assessor_id', pos.assessor_id,
          'position_role', pos.position_role,
          'state', pos.state,
          'locked_at', pos.locked_at,
          'reopen_count', pos.reopen_count,

          'entries', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'entry_id', e.id,
                'item_key', e.item_key,
                'entry_version', e.entry_version,
                'observable_fact', e.observable_fact,
                'candidate_explanation', e.candidate_explanation,
                'interviewer_interpretation', e.interviewer_interpretation,
                'alternative_explanation', e.alternative_explanation,
                'protective_factor', e.protective_factor,
                'event_timing', e.event_timing,
                'consequence', e.consequence,
                'supporting_information', e.supporting_information,
                'contradicting_information', e.contradicting_information,
                'measures_taken', e.measures_taken,
                'role_link', e.role_link,
                'information_gap', e.information_gap,
                'candidate_response', e.candidate_response,
                'verification_need', e.verification_need,
                'verification_state', e.verification_state,
                'verification_source', e.verification_source,
                'sensitivity_class', e.sensitivity_class,
                'recorded_by', e.recorded_by,
                'recorded_at', e.recorded_at,

                -- The whole chain, not only the live version: a record whose
                -- corrections were dropped would read as if it had always
                -- said what it says now.
                'corrections', coalesce((
                  SELECT jsonb_agg(jsonb_build_object(
                      'entry_id', h.id,
                      'entry_version', h.entry_version,
                      'correction_reason', h.correction_reason,
                      'superseded_by_entry_id', h.superseded_by_entry_id,
                      'observable_fact', h.observable_fact,
                      'candidate_explanation', h.candidate_explanation,
                      'interviewer_interpretation', h.interviewer_interpretation,
                      'alternative_explanation', h.alternative_explanation,
                      'protective_factor', h.protective_factor,
                      'event_timing', h.event_timing,
                      'consequence', h.consequence,
                      'supporting_information', h.supporting_information,
                      'contradicting_information', h.contradicting_information,
                      'measures_taken', h.measures_taken,
                      'role_link', h.role_link,
                      'information_gap', h.information_gap,
                      'candidate_response', h.candidate_response,
                      'recorded_by', h.recorded_by,
                      'recorded_at', h.recorded_at)
                    ORDER BY h.entry_version)
                    FROM public.bcp_conduct_entries h
                   WHERE h.position_id = pos.id
                     AND h.item_key = e.item_key
                     AND h.id <> e.id), '[]'::jsonb),

                'verifications', coalesce((
                  SELECT jsonb_agg(jsonb_build_object(
                      'seq', vr.seq,
                      'previous_state', vr.previous_state,
                      'new_state', vr.new_state,
                      'source', vr.source,
                      'note', vr.note,
                      'recorded_by', vr.recorded_by,
                      'recorded_at', vr.recorded_at)
                    ORDER BY vr.seq)
                    FROM public.bcp_conduct_verifications vr
                   WHERE vr.entry_id = e.id), '[]'::jsonb))
              ORDER BY e.item_key)
              FROM public.bcp_conduct_entries e
             WHERE e.position_id = pos.id
               AND e.superseded_by_entry_id IS NULL), '[]'::jsonb),

          -- What this assessor did NOT document, said as a gap rather than
          -- left to be noticed. A gap is the opposite of a score: it reports
          -- what is not known instead of compressing what is.
          'information_gaps', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'item_key', t.item_key,
                'gap', 'not_documented')
              ORDER BY t.display_order)
              FROM public.bcp_case_topics t
             WHERE t.link_id = _s.link_id
               AND NOT EXISTS (
                 SELECT 1 FROM public.bcp_conduct_entries e2
                  WHERE e2.position_id = pos.id
                    AND e2.item_key = t.item_key
                    AND e2.superseded_by_entry_id IS NULL)), '[]'::jsonb))
        ORDER BY pos.created_at)
        FROM public.bcp_conduct_positions pos
       WHERE pos.session_id = _session_id), '[]'::jsonb),

    -- ---- the panel, including what it did not resolve --------------------
    'panel', (
      SELECT jsonb_build_object(
          'panel_id', pn.id,
          'state', pn.state,
          'revealed_at', pn.revealed_at,
          'resolutions', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'item_key', r.item_key,
                'resolution_kind', r.resolution_kind,
                'agreed_statement', r.agreed_statement,
                'divergent_statement', r.divergent_statement,
                'rationale', r.rationale,
                'recorded_by', r.recorded_by,
                'recorded_at', r.recorded_at)
              ORDER BY r.item_key, r.recorded_at)
              FROM public.bcp_conduct_panel_resolutions r
             WHERE r.panel_id = pn.id), '[]'::jsonb))
        FROM public.bcp_conduct_panels pn WHERE pn.session_id = _session_id),

    -- ---- the governed ledger for this assignment -------------------------
    'audit_events', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'event', ev.event,
          'recorded_at', ev.recorded_at,
          'actor_id', ev.actor_id,
          'reason', ev.reason)
        ORDER BY ev.recorded_at, ev.id)
        FROM public.bcp_events ev
       WHERE ev.assignment_id = _s.assignment_id), '[]'::jsonb),

    -- ---- said by the document itself -------------------------------------
    'produces_score', false,
    'produces_ranking', false,
    'produces_recommendation', false,
    'interpretation', 'none');
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_report_blockers(_session_id uuid)
 RETURNS TABLE(code text, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _s public.bcp_conduct_sessions%ROWTYPE;
  _positions integer;
  _unlocked integer;
  _entries integer;
  _panel public.bcp_conduct_panels%ROWTYPE;
  _undocumented integer;
BEGIN
  -- THE SECOND FIX. This function had no authorisation of ANY kind: not
  -- authentication, not the case authority. It is SECURITY DEFINER and
  -- granted to `authenticated`, so any signed-in user holding a session id
  -- learned how many assessors a stranger's interview has, how many are
  -- still open, whether anything is documented, whether a panel exists and
  -- has revealed, and how many themes two assessors disagree about.
  --
  -- That is metadata about somebody else's interview and about a named
  -- candidate's process, and none of it was ever meant to be readable
  -- outside the case.
  --
  -- It stays reachable on its own for a caller who MAY read the case: a
  -- screen that wants to say what is still missing without rendering the
  -- document calls exactly this, and the preview is no longer a substitute
  -- for it now that the preview waits for the independence rule.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    code := 'BCP_CONDUCT_SESSION_NOT_FOUND';
    message := 'No such conduct session.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE state <> 'locked')
    INTO _positions, _unlocked
    FROM public.bcp_conduct_positions WHERE session_id = _session_id;

  IF _positions = 0 THEN
    code := 'BCP_CONDUCT_NO_POSITION';
    message := 'Nobody holds a position in this conversation yet.';
    RETURN NEXT;
  END IF;

  IF _unlocked > 0 THEN
    code := 'BCP_CONDUCT_POSITION_OPEN';
    message := format('%s position(s) are still open. Every participant locks their own before the report is written.', _unlocked);
    RETURN NEXT;
  END IF;

  SELECT count(*) INTO _entries
    FROM public.bcp_conduct_entries e
    JOIN public.bcp_conduct_positions p ON p.id = e.position_id
   WHERE p.session_id = _session_id AND e.superseded_by_entry_id IS NULL;

  IF _entries = 0 THEN
    code := 'BCP_CONDUCT_NOTHING_DOCUMENTED';
    message := 'No documentation has been recorded, so there is nothing to report.';
    RETURN NEXT;
  END IF;

  -- A panel is required only where there is more than one position: a single
  -- assessor has nobody to disagree with, and demanding a panel would be
  -- demanding a ceremony rather than a safeguard.
  IF _positions > 1 THEN
    SELECT * INTO _panel FROM public.bcp_conduct_panels WHERE session_id = _session_id;
    IF _panel.id IS NULL THEN
      code := 'BCP_CONDUCT_PANEL_REQUIRED';
      message := 'More than one position was taken, so the panel has to meet before the report is written.';
      RETURN NEXT;
    ELSIF _panel.state = 'open' THEN
      code := 'BCP_CONDUCT_PANEL_NOT_REVEALED';
      message := 'The panel has not revealed the locked positions yet.';
      RETURN NEXT;
    ELSE
      -- Every theme both assessors documented differently needs the panel to
      -- have said SOMETHING about it -- agreement or a recorded difference.
      SELECT count(*) INTO _undocumented
        FROM (SELECT DISTINCT e.item_key
                FROM public.bcp_conduct_entries e
                JOIN public.bcp_conduct_positions p ON p.id = e.position_id
               WHERE p.session_id = _session_id AND e.superseded_by_entry_id IS NULL
               GROUP BY e.item_key
              HAVING count(DISTINCT e.position_id) > 1) shared
       WHERE NOT EXISTS (
         SELECT 1 FROM public.bcp_conduct_panel_resolutions r
          WHERE r.session_id = _session_id AND r.item_key = shared.item_key);
      IF _undocumented > 0 THEN
        code := 'BCP_CONDUCT_RESOLUTION_MISSING';
        message := format('%s theme(s) documented by more than one assessor have no recorded panel outcome.', _undocumented);
        RETURN NEXT;
      END IF;
    END IF;
  END IF;

  -- 20261130090000: a signature alone never finalises. The responsible
  -- human's stance, with the sufficiency of the basis and the reasoning, is
  -- recorded first.
  IF NOT EXISTS (SELECT 1 FROM public.bcp_conduct_stances st WHERE st.session_id = _session_id) THEN
    code := 'BCP_CONDUCT_STANCE_MISSING';
    message := 'The responsible person has not recorded a stance with its reasoning yet.';
    RETURN NEXT;
  END IF;

  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_topic_prompts(_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _a public.bcp_assignments%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The EXISTING case authority. A caller who cannot read the case cannot
  -- learn anything here, including whether the session exists in a readable
  -- state -- the refusal above is reached only for a session id that is not
  -- a session at all.
  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _s.assignment_id;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _s.bound_method_version_id;

  -- A version that is no longer published stops answering. Not an error: the
  -- interview's own record is unaffected and the screen says the wordings are
  -- unavailable, which is true and is different from inventing them.
  -- 20261129090000: unless it is the exact content an internal test
  -- activation of the assignment's employer covered -- the same rule as the
  -- party read, so a started test keeps its wordings after a revocation.
  IF _v.id IS NULL
     OR (_v.content_status <> 'published'
         AND NOT public.bcp_internal_test_activation_covers(_a.employer_id, _v.id,
                                                             _a.pinned_content_hash))
     OR _v.mode NOT IN ('recruitment_support', 'security_vetting_support') THEN
    RETURN jsonb_build_object(
      'session_id', _session_id,
      'method_version_id', _s.bound_method_version_id,
      'available', false,
      'reason', CASE WHEN _v.id IS NULL THEN 'version_not_found'
                     WHEN _v.mode NOT IN ('recruitment_support', 'security_vetting_support') THEN 'mode_not_permitted'
                     ELSE 'version_not_published' END,
      'topics', '[]'::jsonb,
      'stage_prompts', '[]'::jsonb,
      'produces_score', false,
      'interpretation', 'none');
  END IF;

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'method_version_id', _v.id,
    'content_hash', _s.bound_content_hash,
    'available', true,
    'reason', NULL,

    -- Per frozen topic: the item's own governed wording and purpose, and the
    -- prompts that name that item. Ordered by the method's own display order.
    'topics', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'topic_id', t.id,
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'prompts', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'prompt_key', pr.prompt_key,
                'display_order', pr.display_order,
                'prompt_kind', pr.prompt_kind,
                'peace_stage', pr.peace_stage,
                'addressee', pr.addressee,
                'question_form', pr.question_form,
                'permitted_probe_bases', public.beskt_sorted_array(pr.permitted_probe_bases),
                'wording_sv', pr.wording_sv,
                'wording_en', pr.wording_en)
              ORDER BY pr.display_order, pr.prompt_key)
              FROM public.beskt_prompts pr
              JOIN public.beskt_items pi ON pi.id = pr.item_id
             WHERE pr.method_version_id = _v.id
               AND pr.item_id = t.item_id
               AND pr.exposure_profile_id = _a.exposure_profile_id
               AND pr.permitted_mode IN ('recruitment_support', _v.mode)
               AND pi.permitted_mode IN ('recruitment_support', _v.mode)
               AND pi.access_class <> 'authorised_security_function'), '[]'::jsonb))
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _s.link_id
         AND i.permitted_mode IN ('recruitment_support', _v.mode)
         AND i.access_class <> 'authorised_security_function'), '[]'::jsonb),

    -- The method's own structure for the conversation, which belongs to no
    -- single item.
    'stage_prompts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'prompt_key', pr.prompt_key,
          'display_order', pr.display_order,
          'prompt_kind', pr.prompt_kind,
          'peace_stage', pr.peace_stage,
          'addressee', pr.addressee,
          'question_form', pr.question_form,
          'wording_sv', pr.wording_sv,
          'wording_en', pr.wording_en)
        ORDER BY pr.display_order, pr.prompt_key)
        FROM public.beskt_prompts pr
       WHERE pr.method_version_id = _v.id
         AND pr.item_id IS NULL
         AND pr.exposure_profile_id = _a.exposure_profile_id
         AND pr.permitted_mode IN ('recruitment_support', _v.mode)), '[]'::jsonb),

    -- Said in the payload itself, as every BESKT read says it.
    'produces_score', false,
    'interpretation', 'none');
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_notice_copy_digest(_notice_version text, _locale text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _notice_version = 'beskt-prep-notice-1' AND _locale = 'sv-SE'
      THEN 'dd2abc9db2c26293d6ac577f860e4fcd2795ef7f62ac2bb142c8ccf7100cc4fa'
    WHEN _notice_version = 'beskt-prep-notice-1' AND _locale = 'en-GB'
      THEN '37abcf8f2ef3629adda4a9eee6b5e7b4745edb2599f571375aa6ca7443da40c9'
    WHEN _notice_version = 'beskt-prep-notice-2' AND _locale = 'sv-SE'
      THEN 'b812ac6d838a0c14f1c2ccc085a36e261967880b2e3b4f06a15d9399b9469d6f'
    WHEN _notice_version = 'beskt-prep-notice-2' AND _locale = 'en-GB'
      THEN '85af8d363f2fb8ca5ca2c295e02a2faccf5e4fc43829446a25c451549d8dfe1b'
    WHEN _notice_version = 'beskt-vetting-notice-1' AND _locale = 'sv-SE'
      THEN '8ab62c91651bb01bc4f72789e89f67594e4294f876ee5713d3cb696de7595027'
    WHEN _notice_version = 'beskt-vetting-notice-1' AND _locale = 'en-GB'
      THEN '56b75c962e085b44c2c9df8ef99c04422149ba71434c29f3480024c08241d4cd'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_notice_descriptor(_assignment_id uuid, _locale text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _a public.bcp_assignments%ROWTYPE;
  _p public.beskt_exposure_profiles%ROWTYPE;
  _digest text;
BEGIN
  IF NOT (public.bcp_is_assignment_candidate(_assignment_id)
          OR public.bcp_employer_can_read_assignment(_assignment_id)) THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHORISED: you are not party to this preparation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _locale IS NULL OR NOT (_locale = ANY (public.bcp_notice_locales())) THEN
    RAISE EXCEPTION 'BCP_NOTICE_LOCALE_UNSUPPORTED: the candidate notice exists in % only.',
      array_to_string(public.bcp_notice_locales(), ', ')
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id;
  SELECT * INTO _p FROM public.beskt_exposure_profiles WHERE id = _a.exposure_profile_id;

  -- The governed digest of the copy this locale actually renders. A locale
  -- this notice version does not govern has none, and is refused here rather
  -- than hashed to something meaningless.
  _digest := public.bcp_notice_copy_digest(_a.notice_version, _locale);
  IF _digest IS NULL THEN
    RAISE EXCEPTION 'BCP_NOTICE_COPY_UNGOVERNED: no governed notice copy exists for "%" in %.',
      _a.notice_version, _locale
      USING ERRCODE = 'check_violation';
  END IF;

  -- 20261130090000: the first notice is rendered exactly as before, so its
  -- hash and every acknowledgement of it stay valid. The later notices carry
  -- their own sections and copy keys, and the facts the candidate is owed as
  -- data: who is asking, for what role and purpose, who can read it, the
  -- employer's lawful basis for a vetting, and how to reach the employer.
  IF _a.notice_version <> 'beskt-prep-notice-1' THEN
    RETURN jsonb_build_object(
      'notice_version', _a.notice_version,
      'sections', to_jsonb(public.bcp_notice_sections_for(_a.notice_version)),
      'locale', _locale,
      'notice_copy_digest', _digest,
      'notice_copy_keys', to_jsonb(public.bcp_notice_copy_keys_for(_a.notice_version)),
      'mode', _a.mode,
      'employer_name', (SELECT e.name FROM public.employers e WHERE e.id = _a.employer_id),
      'role_title', coalesce(_a.role_title, (SELECT j.title_sv FROM public.jobs j WHERE j.id = _a.job_id)),
      'contact_statement', _a.contact_statement,
      'retention_class', _p.retention_class,
      'lawful_basis_reference', _p.lawful_basis_reference,
      'lawful_basis_statement', _a.lawful_basis_statement,
      'jurisdiction_reference', _p.jurisdiction_reference,
      'recipients', CASE WHEN _a.mode = 'security_vetting_support'
                         THEN jsonb_build_array('appointed_security_function_of_this_employer')
                         ELSE jsonb_build_array('employer_members_of_this_employer') END,
      'decision_maker', 'accountable_employer_human',
      'produces_score', false,
      'uses_ai_interpretation', false,
      'method_content_hash', _a.pinned_content_hash);
  END IF;

  RETURN jsonb_build_object(
    'notice_version', _a.notice_version,
    'sections', to_jsonb(public.bcp_notice_sections()),
    -- Locale and the governed digest of the WORDS, not just the matters.
    -- These are what make the Swedish and English hashes differ, and what
    -- make a reworded notice a different notice.
    'locale', _locale,
    'notice_copy_digest', _digest,
    -- The template's SHAPE, not only its content. Dropping a field from
    -- bcp_notice_copy_keys() -- the not-consent hint, say -- changes the
    -- notice hash even though the digest constant is a literal, so a
    -- narrowed template cannot inherit an old acknowledgement either.
    'notice_copy_keys', to_jsonb(public.bcp_notice_copy_keys()),
    -- The governed references the candidate is entitled to. NOT consent:
    -- the lawful basis is the employer's and is stated on the profile.
    'retention_class', _p.retention_class,
    'lawful_basis_reference', _p.lawful_basis_reference,
    'jurisdiction_reference', _p.jurisdiction_reference,
    -- Who can read a submitted preparation, as data rather than as prose.
    'recipients', jsonb_build_array('employer_members_of_this_employer'),
    'decision_maker', 'accountable_employer_human',
    'produces_score', false,
    'method_content_hash', _a.pinned_content_hash);
END;
$function$;

-- The candidate's own list gains the role and purpose, and an invitation-
-- based preparation (no job) is listed too. The return type changes, so the
-- function is dropped and created; its grants are restated below.
DROP FUNCTION public.bcp_candidate_assignments();
CREATE FUNCTION public.bcp_candidate_assignments()
RETURNS TABLE(assignment_id uuid, application_id uuid, job_id uuid, job_title_sv text, job_title_en text,
              employer_id uuid, employer_name text, method_name_sv text, method_name_en text,
              lifecycle_state text, available_from timestamptz, due_at timestamptz,
              assigned_at timestamptz, submitted_at timestamptz, mode text, role_title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.application_id, a.job_id,
         coalesce(j.title_sv, a.role_title), coalesce(j.title_en, a.role_title),
         a.employer_id, e.name, p.name_sv, p.name_en, a.lifecycle_state, a.available_from, a.due_at,
         a.assigned_at, a.submitted_at, a.mode, coalesce(a.role_title, j.title_sv)
    FROM public.bcp_assignments a
    LEFT JOIN public.jobs j ON j.id = a.job_id
    JOIN public.employers e ON e.id = a.employer_id
    JOIN public.beskt_method_versions v ON v.id = a.method_version_id
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE auth.uid() IS NOT NULL
     AND a.candidate_user_id = auth.uid()
     AND a.lifecycle_state <> 'cancelled'
   ORDER BY a.assigned_at DESC;
$$;

-- ###########################################################################
-- SECTION 16 -- Row level security and privileges
-- ###########################################################################
--
-- The employer branch of every party-read policy becomes the employer PARTY:
-- unchanged for recruitment, the appointed security function for vetting.
DROP POLICY bcp_assignments_party_read ON public.bcp_assignments;
CREATE POLICY bcp_assignments_party_read ON public.bcp_assignments FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (candidate_user_id = auth.uid() OR public.bcp_employer_party(id)));

DROP POLICY bcp_answers_party_read ON public.bcp_answers;
CREATE POLICY bcp_answers_party_read ON public.bcp_answers FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bcp_responses r JOIN public.bcp_assignments a ON a.id = r.assignment_id
     WHERE r.id = bcp_answers.response_id
       AND (a.candidate_user_id = auth.uid()
            OR (r.response_state = 'submitted' AND public.bcp_employer_party(a.id)))));

DROP POLICY bcp_responses_party_read ON public.bcp_responses;
CREATE POLICY bcp_responses_party_read ON public.bcp_responses FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bcp_assignments a
     WHERE a.id = bcp_responses.assignment_id
       AND (a.candidate_user_id = auth.uid()
            OR (bcp_responses.response_state = 'submitted' AND public.bcp_employer_party(a.id)))));

DROP POLICY bcp_case_links_party_read ON public.bcp_case_links;
CREATE POLICY bcp_case_links_party_read ON public.bcp_case_links FOR SELECT TO authenticated
  USING (public.bcp_employer_party(assignment_id) OR candidate_user_id = auth.uid());

DROP POLICY bcp_case_topics_party_read ON public.bcp_case_topics;
CREATE POLICY bcp_case_topics_party_read ON public.bcp_case_topics FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bcp_case_links l
                  WHERE l.id = bcp_case_topics.link_id
                    AND (public.bcp_employer_party(l.assignment_id) OR l.candidate_user_id = auth.uid())));

DROP POLICY bcp_events_party_read ON public.bcp_events;
CREATE POLICY bcp_events_party_read ON public.bcp_events FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND (public.is_platform_admin(auth.uid())
    OR (assignment_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bcp_assignments a
       WHERE a.id = bcp_events.assignment_id
         AND (a.candidate_user_id = auth.uid() OR public.bcp_employer_party(a.id))))));

DROP POLICY bcp_notice_acknowledgements_party_read ON public.bcp_notice_acknowledgements;
CREATE POLICY bcp_notice_acknowledgements_party_read ON public.bcp_notice_acknowledgements FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bcp_assignments a
     WHERE a.id = bcp_notice_acknowledgements.assignment_id
       AND (a.candidate_user_id = auth.uid() OR public.bcp_employer_party(a.id))));

-- New tables: RLS forced, no client writes, a narrow read.
ALTER TABLE public.bcp_security_officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_security_officers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_candidate_supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_candidate_supplements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_stances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_stances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_actions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.bcp_security_officers, public.bcp_invitations, public.bcp_candidate_supplements,
              public.bcp_conduct_stances, public.bcp_conduct_actions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.bcp_security_officers, public.bcp_candidate_supplements,
                public.bcp_conduct_stances, public.bcp_conduct_actions
  TO authenticated, service_role;
-- Invitations are read through bcp_employer_invitations only: the token
-- digest never leaves the database.
GRANT SELECT ON public.bcp_invitations TO service_role;

CREATE POLICY bcp_security_officers_member_read ON public.bcp_security_officers FOR SELECT TO authenticated
  USING (public.has_employer_role(auth.uid(), employer_id, ARRAY['owner', 'admin', 'member']));
CREATE POLICY bcp_candidate_supplements_party_read ON public.bcp_candidate_supplements FOR SELECT TO authenticated
  USING (candidate_user_id = auth.uid() OR public.bcp_employer_party(assignment_id));
CREATE POLICY bcp_conduct_stances_member_read ON public.bcp_conduct_stances FOR SELECT TO authenticated
  USING (public.bcp_conduct_can_read_session(session_id));
CREATE POLICY bcp_conduct_actions_member_read ON public.bcp_conduct_actions FOR SELECT TO authenticated
  USING (public.bcp_conduct_can_read_session(session_id));

-- Functions. Client-callable ones to authenticated; internal predicates and
-- builders to nobody but their owner. Hosted default privileges would
-- otherwise hand every new function to anon.
-- Written out statement by statement so the SQL security guard can read
-- every grant (a loop would hide them).
REVOKE ALL ON FUNCTION public.bcp_appoint_security_officer(uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_appoint_security_officer(uuid,uuid,uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_revoke_security_officer(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_revoke_security_officer(uuid,uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_employer_people(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_employer_people(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_start_beskt(uuid,uuid,text,uuid,uuid,text,uuid,text,uuid,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_start_beskt(uuid,uuid,text,uuid,uuid,text,uuid,text,uuid,text,text,timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_create_invitation(uuid,uuid,text,text,text,text,uuid,uuid,text,uuid,text,uuid,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_create_invitation(uuid,uuid,text,text,text,text,uuid,uuid,text,uuid,text,uuid,text,text,timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_revoke_invitation(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_revoke_invitation(uuid,uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_invitation_for_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_invitation_for_token(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_accept_invitation(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_accept_invitation(uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_employer_invitations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_employer_invitations(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_method_preview(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_method_preview(uuid,uuid,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_employer_beskt_assignments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_employer_beskt_assignments(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_submit_supplement(uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_submit_supplement(uuid,uuid,text,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_assignment_supplements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_assignment_supplements(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_interview_preparation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_interview_preparation(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_conduct_record_stance(uuid,uuid,integer,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_record_stance(uuid,uuid,integer,text,text,text,text,text,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_conduct_record_action(uuid,uuid,uuid,integer,text,text,date,text,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_record_action(uuid,uuid,uuid,integer,text,text,date,text,date,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_conduct_decision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_decision(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_candidate_assignments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_candidate_assignments() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_employer_party(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_employer_party(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_is_security_officer(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_case_vetting_restricted(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_case_access_ok(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_check_start(uuid,text,uuid,uuid,text,uuid,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_version_is_runnable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_invitation_token_digest(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_conduct_may_record_stance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_conduct_report_extensions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_notice_version_for(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_notice_sections_for(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_notice_copy_keys_for(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_guard_security_officer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_guard_invitation() FROM PUBLIC, anon, authenticated;


-- ---- postflight ---------------------------------------------------------------
DO $proof$
DECLARE _fn text;
BEGIN
  IF position('bcp_case_access_ok' IN (SELECT prosrc FROM pg_proc WHERE proname = 'scp_iv_can_read_case')) = 0
     OR position('bcp_case_access_ok' IN (SELECT prosrc FROM pg_proc WHERE proname = 'scp_iv_can_write_case')) = 0 THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PROOF: a case predicate does not restrict a vetting case.';
  END IF;
  IF position('BCP_CONDUCT_STANCE_MISSING' IN (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_conduct_report_blockers')) = 0
     OR position('bcp_conduct_report_extensions' IN (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_conduct_build_report_basis')) = 0 THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PROOF: the report does not require and carry the stance.';
  END IF;
  IF position('candidate_disclosed' IN (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_link_preparation_to_case')) = 0 THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PROOF: the bridge does not derive disclosed topics.';
  END IF;
  -- The first notice is untouched: its descriptor still renders from the
  -- original template.
  IF position('bcp_notice_sections()' IN (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_notice_descriptor')) = 0 THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PROOF: the first notice no longer renders as before.';
  END IF;
  FOREACH _fn IN ARRAY ARRAY['bcp_appoint_security_officer', 'bcp_revoke_security_officer', 'bcp_start_beskt',
    'bcp_create_invitation', 'bcp_revoke_invitation', 'bcp_invitation_for_token', 'bcp_accept_invitation',
    'bcp_employer_invitations', 'bcp_method_preview', 'bcp_employer_beskt_assignments', 'bcp_submit_supplement',
    'bcp_assignment_supplements', 'bcp_interview_preparation', 'bcp_conduct_record_stance',
    'bcp_conduct_record_action', 'bcp_conduct_decision', 'bcp_employer_people', 'bcp_candidate_assignments',
    'bcp_employer_party', 'bcp_is_security_officer', 'bcp_case_access_ok', 'bcp_check_start',
    'bcp_version_is_runnable', 'bcp_conduct_may_record_stance', 'bcp_conduct_report_extensions'] LOOP
    IF (SELECT count(*) FROM pg_proc WHERE proname = _fn) <> 1 THEN
      RAISE EXCEPTION 'BCP_COMPLETE_PROOF: % has % overloads.', _fn, (SELECT count(*) FROM pg_proc WHERE proname = _fn);
    END IF;
    IF NOT (SELECT prosecdef AND 'search_path=public' = ANY (proconfig) FROM pg_proc WHERE proname = _fn) THEN
      RAISE EXCEPTION 'BCP_COMPLETE_PROOF: % is not SECURITY DEFINER with a fixed search_path.', _fn;
    END IF;
    IF has_function_privilege('anon', (SELECT oid FROM pg_proc WHERE proname = _fn), 'EXECUTE') THEN
      RAISE EXCEPTION 'BCP_COMPLETE_PROOF: anon can execute %.', _fn;
    END IF;
  END LOOP;
  FOREACH _fn IN ARRAY ARRAY['bcp_is_security_officer', 'bcp_case_access_ok', 'bcp_check_start',
    'bcp_version_is_runnable', 'bcp_conduct_may_record_stance', 'bcp_conduct_report_extensions',
    'bcp_invitation_token_digest'] LOOP
    IF has_function_privilege('authenticated', (SELECT oid FROM pg_proc WHERE proname = _fn), 'EXECUTE') THEN
      RAISE EXCEPTION 'BCP_COMPLETE_PROOF: % is internal but executable by authenticated.', _fn;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.bcp_invitations', 'SELECT')
     OR has_table_privilege('authenticated', 'public.bcp_security_officers', 'INSERT')
     OR has_table_privilege('authenticated', 'public.bcp_conduct_stances', 'INSERT')
     OR has_table_privilege('authenticated', 'public.bcp_conduct_actions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.bcp_candidate_supplements', 'INSERT')
     OR has_table_privilege('anon', 'public.bcp_security_officers', 'SELECT')
     OR has_table_privilege('anon', 'public.bcp_conduct_stances', 'SELECT')
     OR has_table_privilege('authenticated', 'public.bcp_conduct_stances', 'TRUNCATE') THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PROOF: a client role can write a new table, or read one it must not.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.relname IN ('bcp_security_officers', 'bcp_invitations',
               'bcp_candidate_supplements', 'bcp_conduct_stances', 'bcp_conduct_actions')
               AND c.relnamespace = 'public'::regnamespace
               AND NOT (c.relrowsecurity AND c.relforcerowsecurity)) THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PROOF: a new table lacks forced row level security.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bcp_security_officers) OR EXISTS (SELECT 1 FROM public.bcp_invitations)
     OR EXISTS (SELECT 1 FROM public.bcp_conduct_stances) THEN
    RAISE EXCEPTION 'BCP_COMPLETE_PROOF: the migration must seed nothing.';
  END IF;
  RAISE NOTICE 'BCP_BESKT_COMPLETE_PROOF ok';
END $proof$;
