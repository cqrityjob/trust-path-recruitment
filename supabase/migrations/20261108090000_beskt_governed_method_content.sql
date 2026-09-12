-- ===========================================================================
-- BESKT PR 2 — governed method content, deterministic routing and
-- publication gates
-- ===========================================================================
--
-- Canonical, additive migration. Creates the governed content spine for
-- BESKT — beteende- och evidensbaserad säkerhetsinriktad kompetensintervju —
-- exactly as PR 1's architecture contract (PR #217,
-- docs/architecture/beskt-recruitment-method-discovery.md) sequences it:
-- "governed_content" is the second delivery step, after "contract" and before
-- "candidate_preparation".
--
-- Filename note: the file was created with `supabase migration new` (CLI
-- 2.117.0), which stamps the wall clock. Repository migration versions
-- deliberately run ahead of the wall clock and the strict replay applies files
-- in filename order, so the file sits at the next canonical slot after
-- 20261107090000_scp_iv_report_basis_integrity.sql. Nothing about the content
-- depends on the date.
--
-- WHAT THIS PR DECIDES
-- --------------------
-- Which questions may be asked, why they may be asked, and how the state of
-- the available evidence is described. It never decides what kind of person a
-- candidate is or what an employer should do. AI explains; humans decide.
--
-- WHAT THIS IS NOT
-- ----------------
--   * Not a candidate journey. No assignment, invitation, notice,
--     acknowledgement, response, answer, case link, session, observation,
--     correction, verification outcome, assessor position, panel, report,
--     preview, readback or share exists here, and none can: no table in this
--     migration references jobs, job_applications, a candidate or an
--     Interview Intelligence case. Candidate preparation begins in PR 3.
--   * Not a scoring contract. No column stores a score, level, weight,
--     threshold, total, rank, pass/fail, suitability, credibility,
--     truthfulness or recommendation — not even dormant, not even as a JSON
--     key. The only numbers are version_number, display_order,
--     evaluation_order, ordinal, revision and the event sequence.
--   * Not the role-interview 0–4 contract. BESKT gets its own version, hash,
--     validator, review ladder and read path. It never enters
--     scp_interview_pack_versions, scp_interview_pack_validate() or the
--     scp_iv_* start flow, and the guards below make that structural.
--   * Not published product content. No BESKT method content is seeded. The
--     behaviour suite plants a clearly synthetic method inside its own
--     transaction and rolls it back.
--   * Not a hosted change, a Lovable publish or a real-candidate pilot.
--
-- THE COEXISTENCE MODEL
-- ---------------------
-- scp_interview_packs is the stable identity of every governed interview
-- package. It gains an additive `pack_kind` discriminator, backfilled to
-- 'role_interview' for every existing row by the column default, and its
-- `role_id` becomes conditionally nullable under the invariant
--
--     role_interview  =>  role_id IS NOT NULL
--     beskt_method    =>  role_id IS NULL
--
-- because a BESKT method is justified by versioned role-EXPOSURE profiles,
-- not by one canonical scp_roles row; inserting a fake generic role to satisfy
-- the old NOT NULL would be a lie in the schema.
--
-- Every existing role-interview object keeps its signature and behaviour.
-- The four functions that could otherwise admit a BESKT method into the 0–4
-- flow (the shared start basis, the startable list, case creation and the
-- role-pack validator) plus scp_interview_create_version are re-created with
-- an explicit pack_kind = 'role_interview' scope, and a trigger refuses any
-- scp_interview_pack_versions row for a non-role-interview pack, so the old
-- validator and runtime cannot even be reached with BESKT content.
--
-- WHY THE NEW TABLES ARE NAMED beskt_* AND NOT scp_*
-- -------------------------------------------------
-- PR 1 requires ENABLE and FORCE ROW LEVEL SECURITY on every new exposed
-- BESKT table. The Security Competency domain suite
-- (supabase/tests/scp_a1_domain_model_test.sql, LOW-2) asserts that NO scp_*
-- table carries FORCE RLS — a documented trust-boundary decision for that
-- domain. Both are right for their own domain, so the BESKT tables carry their
-- own prefix, exactly as the Passport domain (sp_*) does with its own
-- FORCE-RLS tables.
--
-- REVIEW CORRECTIONS (independent HR, recruitment, method, security and test
-- review of the first draft) are folded into this file rather than into a
-- compensating migration, because it is still unpublished and pending.
--
-- ORDER OF THIS FILE
-- ------------------
--   1. preflight dependencies
--   2. additive pack_kind and role-interview compatibility guards
--   3. BESKT tables, constraints, FKs and indexes
--   4. same-version, immutability, append-only and scope guards
--   5. canonical SHA-256 content hash, neutrality rule and validator
--   6. deterministic routing resolver
--   7. lifecycle, review, idempotency and event RPCs and the read contract
--   8. RLS, revokes, grants and policies
--   9. postflight catalogue assertions (BESKT_GOVERNED_CONTENT_PROOF ok)
--
-- Rollback: supabase/rollback/20261108090000_beskt_governed_method_content_rollback.sql
-- ===========================================================================


-- ###########################################################################
-- SECTION 1 -- Preflight
-- ###########################################################################

DO $$
DECLARE _fn text;
BEGIN
  IF to_regclass('public.scp_interview_packs') IS NULL
     OR to_regclass('public.scp_interview_pack_versions') IS NULL THEN
    RAISE EXCEPTION 'BESKT_PRECONDITION: the Role Interview Pack identity (20260918090000) must be applied first.';
  END IF;
  IF to_regclass('public.scp_content_roles') IS NULL
     OR to_regproc('public.scp_has_content_role') IS NULL
     OR to_regproc('public.is_platform_admin') IS NULL
     OR to_regproc('public.scp_interview_can_read') IS NULL
     OR to_regproc('public.scp_interview_can_edit') IS NULL THEN
    RAISE EXCEPTION 'BESKT_PRECONDITION: the platform content-role model is missing.';
  END IF;
  IF to_regclass('public.employer_memberships') IS NULL
     OR to_regproc('public.employer_is_active_status') IS NULL
     OR to_regproc('public.has_employer_role') IS NULL THEN
    RAISE EXCEPTION 'BESKT_PRECONDITION: the employer membership model is missing.';
  END IF;
  -- The exact old-flow functions this migration re-scopes must exist with the
  -- signatures it preserves. A missing one means the base is not PR 1's head.
  FOREACH _fn IN ARRAY ARRAY[
      'public.scp_iv_case_start_basis(uuid,uuid,uuid)',
      'public.scp_iv_startable_pack_versions(uuid)',
      'public.scp_iv_create_case(uuid,text,uuid,text,uuid,text,uuid,uuid)',
      'public.scp_interview_pack_validate(uuid)',
      'public.scp_interview_create_version(uuid,text,uuid,text,text,text)',
      'public.scp_interview_pack_content_hash(uuid)',
      'public.scp_iv_finalise_previewed_report(uuid,text,uuid)'] LOOP
    IF to_regprocedure(_fn) IS NULL THEN
      RAISE EXCEPTION 'BESKT_PRECONDITION: % is missing; the base must include PR #216 and PR #217.', _fn;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'scp_interview_packs'
                AND column_name = 'pack_kind') THEN
    RAISE EXCEPTION 'BESKT_PRECONDITION: scp_interview_packs.pack_kind already exists; this migration is not idempotent over an applied state. Roll back first.';
  END IF;
  IF to_regclass('public.beskt_method_versions') IS NOT NULL THEN
    RAISE EXCEPTION 'BESKT_PRECONDITION: beskt_method_versions already exists.';
  END IF;
END $$;


-- ###########################################################################
-- SECTION 2 -- Additive pack_kind and role-interview compatibility guards
-- ###########################################################################

-- 2.1  The discriminator. Constrained text, not an enum, as everywhere else in
--      this schema. The DEFAULT backfills every existing row to
--      'role_interview' without an UPDATE.
ALTER TABLE public.scp_interview_packs
  ADD COLUMN pack_kind text NOT NULL DEFAULT 'role_interview'
  CONSTRAINT scp_interview_packs_pack_kind_check
  CHECK (pack_kind IN ('role_interview', 'beskt_method'));

COMMENT ON COLUMN public.scp_interview_packs.pack_kind IS
  'Which governed content spine this package identity belongs to. '
  'role_interview: the Role Interview Pack (scp_interview_pack_versions, '
  'competency mappings, 0-4 anchors). beskt_method: BESKT (beskt_method_versions, '
  'role-exposure profiles, categorical evidence anchors). Immutable after '
  'insert; a package never changes kind.';

-- 2.2  Role linkage becomes conditional. A BESKT method is justified by its
--      versioned role-exposure profiles, not by one canonical role.
ALTER TABLE public.scp_interview_packs ALTER COLUMN role_id DROP NOT NULL;

ALTER TABLE public.scp_interview_packs
  ADD CONSTRAINT scp_interview_packs_role_by_kind_check
  CHECK (
    (pack_kind = 'role_interview' AND role_id IS NOT NULL)
    OR (pack_kind = 'beskt_method' AND role_id IS NULL));

CREATE INDEX scp_interview_packs_pack_kind_idx ON public.scp_interview_packs (pack_kind);

-- 2.3  Kind is identity: it never changes.
CREATE OR REPLACE FUNCTION public.beskt_guard_pack_kind_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pack_kind IS DISTINCT FROM OLD.pack_kind THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_PACK_KIND_IMMUTABLE: pack_kind is part of the package identity and cannot change from "%" to "%".',
      OLD.pack_kind, NEW.pack_kind USING ERRCODE = 'check_violation';
  END IF;
  -- A BESKT method identity is written only by the governed BESKT contract.
  -- PR 2 ships no rename RPC, so its slug, names and purpose are immutable
  -- for every caller, BYPASSRLS included.
  IF OLD.pack_kind = 'beskt_method'
     AND coalesce(current_setting('beskt.governed_transition', true), '') <> 'on'
     AND (to_jsonb(NEW) - 'created_at') IS DISTINCT FROM (to_jsonb(OLD) - 'created_at') THEN
    RAISE EXCEPTION
      'BESKT_IDENTITY_IMMUTABLE: a BESKT method identity is changed only through the governed BESKT contract, never by a direct table update.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_guard_pack_kind_immutable() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER scp_interview_packs_kind_immutable
  BEFORE UPDATE ON public.scp_interview_packs
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_pack_kind_immutable();

-- 2.4  The role-interview version spine is for role-interview packs only. A
--      BESKT method can never acquire a scp_interview_pack_versions row, so it
--      can never reach the competency validator, the 0-4 anchors or the
--      scp_iv_* runtime, whatever a later caller forgets.
CREATE OR REPLACE FUNCTION public.beskt_guard_role_interview_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _kind text;
BEGIN
  SELECT p.pack_kind INTO _kind FROM public.scp_interview_packs p WHERE p.id = NEW.pack_id;
  IF _kind IS DISTINCT FROM 'role_interview' THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_PACK_KIND_MISMATCH: scp_interview_pack_versions holds role-interview content only; pack % is "%". A BESKT method is versioned in beskt_method_versions.',
      NEW.pack_id, coalesce(_kind, 'missing') USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_guard_role_interview_version() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER scp_interview_pack_versions_role_interview_only
  BEFORE INSERT ON public.scp_interview_pack_versions
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_role_interview_version();


-- ---------------------------------------------------------------------------
-- 2.5  Explicit pack_kind = 'role_interview' scope on every old-flow function
--      that could otherwise admit a BESKT method into the 0-4 contract.
--
--      Each function below is re-created with its EXACT existing signature
--      and body -- copied verbatim from 20260918090000 / 20260926090000 --
--      plus the one scope predicate. No new overload, no changed default, so
--      PostgREST resolution is unchanged and the deployed application keeps
--      calling exactly what it called before.
-- ---------------------------------------------------------------------------
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
  -- BESKT PR 2: the role-interview version spine is for role-interview
  -- packs only. A BESKT method is versioned in beskt_method_versions.
  IF NOT EXISTS (SELECT 1 FROM public.scp_interview_packs p
                  WHERE p.id = _pack_id AND p.pack_kind = 'role_interview') THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_PACK_KIND_MISMATCH: pack % is not a role-interview pack; a BESKT method cannot enter the role-interview version, validator or 0-4 runtime.', _pack_id
      USING ERRCODE = 'check_violation';
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

  -- BESKT PR 2: this validator is the role-interview 0-4 competency contract
  -- and answers for role-interview packs only. A BESKT method version can
  -- never reach it (its versions live in beskt_method_versions), and if a
  -- pack of another kind ever appears here it is blocked, not validated.
  IF NOT EXISTS (SELECT 1 FROM public.scp_interview_packs p
                  WHERE p.id = _v.pack_id AND p.pack_kind = 'role_interview') THEN
    RETURN QUERY SELECT 'PACK_KIND_NOT_ROLE_INTERVIEW'::text, 'blocking'::text,
      'The role-interview validator answers for role-interview packs only; this pack is of another kind.'::text;
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

  -- BESKT PR 2: only a role-interview pack version can start a case.
  SELECT v.content_status INTO _status
    FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE v.id = _pack_version_id
     AND p.pack_kind = 'role_interview';
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
     WHERE p.pack_kind = 'role_interview'   -- BESKT PR 2: never a BESKT method
       AND b.basis IS NOT NULL
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


-- ###########################################################################
-- SECTION 3 -- The BESKT governed content spine
-- ###########################################################################
--
-- Thirteen tables. Every one hangs off beskt_method_versions, every FK is
-- ON DELETE RESTRICT (no cascade can destroy governed history), every
-- vocabulary is constrained text, and no table references a job, an
-- application, a candidate or a case.
-- ---------------------------------------------------------------------------

-- 3.1  The versioned aggregate.
CREATE TABLE public.beskt_method_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.scp_interview_packs(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number >= 1),

  -- Five parallel human gates, so one review state rather than a ladder.
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN ('draft', 'in_review', 'published', 'suspended', 'retired')),

  -- What may be CLAIMED about the content. Separate from content_status, as
  -- for the role pack: a published method can still be an unvalidated
  -- hypothesis, and in PR 2 it always is.
  validation_label text NOT NULL DEFAULT 'pilot_hypothesis'
    CHECK (validation_label IN ('pilot_hypothesis', 'content_validated')),

  -- Exactly one of the two modes from PR 1 section 3.
  mode text NOT NULL
    CHECK (mode IN ('recruitment_support', 'security_vetting_support')),

  -- Complete governed Swedish AND English content is required for
  -- publication; the validator enforces it field by field.
  locale_sv text NOT NULL DEFAULT 'sv-SE' CHECK (locale_sv ~ '^sv-[A-Z]{2}$'),
  locale_en text NOT NULL DEFAULT 'en-GB' CHECK (locale_en ~ '^en-[A-Z]{2}$'),

  -- Provenance of the governed source document.
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) > 0),
  source_document_version text NOT NULL CHECK (length(btrim(source_document_version)) > 0),
  content_provenance text NOT NULL
    CHECK (content_provenance IN ('source_stated', 'derived_in_authoring', 'cqrity_design_hypothesis')),

  summary_sv text,
  summary_en text,

  -- Synthetic, internal-only, until the PR 1 pilot gate is accepted by the
  -- owner in a later ADR change. There is no other representable value.
  release_scope text NOT NULL DEFAULT 'synthetic_internal_only'
    CHECK (release_scope = 'synthetic_internal_only'),

  -- Compare-and-swap revision. Every governed mutation bumps it; every
  -- client mutation names the revision it was looking at.
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),

  -- The review cycle. Every submission for review opens a new cycle; a
  -- rejection ends the current one. An approval counts only when it was
  -- given in the CURRENT cycle at the CURRENT hash, so a version that is
  -- rejected, restored to identical bytes and resubmitted needs five fresh
  -- approvals.
  review_cycle integer NOT NULL DEFAULT 0 CHECK (review_cycle >= 0),

  -- The open-version slot: 'open' while the version is draft or in_review,
  -- NULL from published onward. UNIQUE (pack_id, open_slot) below admits at
  -- most one open version per method (NULLs never collide, so any number of
  -- closed versions may coexist) WITHOUT a unique index on pack_id alone,
  -- which PostgREST would read as a one-to-one relation between a method
  -- and its versions. Generated, so no writer can set it.
  open_slot text GENERATED ALWAYS AS (
    CASE WHEN content_status IN ('draft', 'in_review') THEN 'open' END) STORED,

  -- Deterministic SHA-256 over every governed field, maintained by
  -- beskt_method_content_hash(). A review is bound to the hash it saw.
  content_hash text,
  content_hash_algorithm text NOT NULL DEFAULT 'sha256' CHECK (content_hash_algorithm = 'sha256'),

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  suspended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  suspended_at timestamptz,
  suspended_reason text,
  retired_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  retired_at timestamptz,
  retired_reason text,

  UNIQUE (pack_id, version_number)
);

COMMENT ON TABLE public.beskt_method_versions IS
  'The immutable versioned BESKT method aggregate. Editable while draft or '
  'in_review; from published onward the row and every governed child are '
  'frozen and a substantive change requires a new version. No total, level, '
  'weight, threshold, rank, pass/fail, suitability, credibility or '
  'recommendation column exists here, and there must never be one.';

CREATE INDEX beskt_method_versions_pack_idx ON public.beskt_method_versions (pack_id, version_number DESC);
-- At most one open (draft or in_review) version per method, enforced by the
-- database itself so two concurrent creations cannot both succeed. Two
-- columns on purpose: pack_id alone is not unique (a method has many
-- historical versions) and must not be exposed as if it were.
CREATE UNIQUE INDEX beskt_method_versions_one_open_idx
  ON public.beskt_method_versions (pack_id, open_slot);
CREATE INDEX beskt_method_versions_status_idx ON public.beskt_method_versions (content_status);
CREATE INDEX beskt_method_versions_created_by_idx ON public.beskt_method_versions (created_by);


-- 3.2  Role-exposure profiles: governed method templates that justify every
--      question. Not employer, job or candidate records.
CREATE TABLE public.beskt_exposure_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_version_id uuid NOT NULL REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  profile_key text NOT NULL CHECK (profile_key ~ '^[a-z0-9][a-z0-9_]*$'),
  display_order integer NOT NULL CHECK (display_order >= 1),

  -- A closed vocabulary of duties/exposure areas. It structurally excludes
  -- the PR 1 section 7 proxies: nationality, family background, religion,
  -- foreign ties, residence or travel history are not representable here.
  exposure_area text NOT NULL CHECK (exposure_area IN (
    'access_to_protected_premises',
    'access_to_protected_information',
    'privileged_it_access',
    'handling_of_valuables_or_cash',
    'keys_alarms_and_access_control',
    'authority_over_others',
    'lone_working',
    'public_facing_conflict',
    'use_of_force_mandate',
    'reporting_and_documentation')),

  duties_sv text,
  duties_en text,
  role_relevance_rationale_sv text,
  role_relevance_rationale_en text,

  permitted_mode text NOT NULL
    CHECK (permitted_mode IN ('recruitment_support', 'security_vetting_support')),

  -- Which of the five human review gates is accountable for this profile's
  -- content. A role, never a person: persons are recorded on reviews.
  owning_review_role text NOT NULL CHECK (owning_review_role IN (
    'personnel_security', 'senior_hr', 'recruitment',
    'employment_privacy_legal', 'data_protection')),

  jurisdiction_reference text,
  lawful_basis_reference text,
  retention_class text NOT NULL
    CHECK (retention_class IN ('recruitment_record', 'security_vetting_record')),
  access_class text NOT NULL CHECK (access_class IN (
    'recruiter', 'beskt_interviewer', 'independent_assessor',
    'authorised_security_function', 'accountable_process_owner')),

  -- For a security-vetting profile: the reference to the employer's
  -- attestation that the role is security-sensitive. A REQUIREMENT reference
  -- in the governed template; the employer's actual attestation is a later
  -- runtime fact and never lives in this domain.
  security_sensitive_role_attestation_reference text,

  content_provenance text NOT NULL
    CHECK (content_provenance IN ('source_stated', 'derived_in_authoring', 'cqrity_design_hypothesis')),
  source_reference text,

  -- The hard boundary of PR 1 section 3, as data: security-vetting content
  -- has its own retention class and is readable only by the authorised
  -- security function.
  CONSTRAINT beskt_exposure_profiles_sv_retention_check
    CHECK ((permitted_mode = 'security_vetting_support') = (retention_class = 'security_vetting_record')),
  CONSTRAINT beskt_exposure_profiles_sv_access_check
    CHECK (permitted_mode <> 'security_vetting_support' OR access_class = 'authorised_security_function'),

  UNIQUE (method_version_id, profile_key)
);

COMMENT ON TABLE public.beskt_exposure_profiles IS
  'Versioned role-exposure profiles: the documented role relevance every BESKT '
  'question and prompt must link to. Governed method templates only -- no '
  'employer, job or candidate is referenced.';

CREATE INDEX beskt_exposure_profiles_version_idx
  ON public.beskt_exposure_profiles (method_version_id, display_order);


-- 3.3  The three security-vetting activation requirements of PR 1, modelled
--      as declarative REQUIREMENTS on the method version. Which role must
--      satisfy each, and the governed statement of what it means. The
--      satisfactions (an employer's attestation, its recorded lawful basis,
--      its appointed security owner) are runtime facts for a later PR and
--      cannot be represented here.
CREATE TABLE public.beskt_activation_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_version_id uuid NOT NULL REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  requirement_key text NOT NULL CHECK (requirement_key IN (
    'security_sensitive_role_attested',
    'lawful_basis_recorded',
    'authorised_security_owner_assigned')),
  satisfied_by_role text NOT NULL
    CHECK (satisfied_by_role IN ('accountable_process_owner', 'authorised_security_function')),
  statement_sv text NOT NULL CHECK (length(btrim(statement_sv)) > 0),
  statement_en text NOT NULL CHECK (length(btrim(statement_en)) > 0),
  UNIQUE (method_version_id, requirement_key)
);

COMMENT ON TABLE public.beskt_activation_requirements IS
  'The three PR 1 activation requirements for security_vetting_support, as '
  'governed requirement statements. A security-vetting version is not '
  'publishable unless all three are present. No requirement is ever '
  'satisfied in this domain: a normal recruiter cannot enable the second mode '
  'by any content edit.';

CREATE INDEX beskt_activation_requirements_version_idx
  ON public.beskt_activation_requirements (method_version_id);


-- 3.4  Questionnaire structure.
CREATE TABLE public.beskt_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_version_id uuid NOT NULL REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  section_key text NOT NULL CHECK (section_key ~ '^[a-z0-9][a-z0-9_]*$'),
  display_order integer NOT NULL CHECK (display_order >= 1),
  phase text NOT NULL
    CHECK (phase IN ('candidate_preparation', 'interview', 'verification_follow_up')),
  title_sv text,
  title_en text,
  UNIQUE (method_version_id, section_key)
);

CREATE INDEX beskt_sections_version_idx ON public.beskt_sections (method_version_id, display_order);


-- 3.5  Governed items: which questions may be asked, and why.
CREATE TABLE public.beskt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_version_id uuid NOT NULL REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  section_id uuid NOT NULL REFERENCES public.beskt_sections(id) ON DELETE RESTRICT,
  -- Every item links to documented exposure relevance in the same version.
  exposure_profile_id uuid NOT NULL REFERENCES public.beskt_exposure_profiles(id) ON DELETE RESTRICT,
  item_key text NOT NULL CHECK (item_key ~ '^[a-z0-9][a-z0-9_]*$'),
  display_order integer NOT NULL CHECK (display_order >= 1),

  wording_sv text,
  wording_en text,
  -- The neutral statement of why the question is asked.
  purpose_sv text,
  purpose_en text,

  permitted_mode text NOT NULL
    CHECK (permitted_mode IN ('recruitment_support', 'security_vetting_support')),
  phase text NOT NULL
    CHECK (phase IN ('candidate_preparation', 'interview', 'verification_follow_up')),

  -- The typed answer contract. Narrow, explicit, and the only shapes the
  -- later runtime may store.
  answer_type text NOT NULL CHECK (answer_type IN (
    'single_choice', 'multi_choice', 'boolean', 'short_text', 'long_text',
    'date', 'acknowledgement')),

  requiredness text NOT NULL CHECK (requiredness IN ('required', 'voluntary')),
  -- "I would rather discuss this orally" is a neutral input state, never an
  -- answer value and never a routing condition.
  discuss_orally_allowed boolean NOT NULL DEFAULT true,

  -- Special categories and criminal-offence data are DISABLED: they are not
  -- representable in this schema. Enabling them requires a separately
  -- accepted, jurisdiction-specific configuration delivered as its own
  -- reviewed migration with its own negative control.
  sensitivity_class text NOT NULL
    CHECK (sensitivity_class IN ('ordinary', 'integrity_sensitive', 'security_vetting_only')),
  access_class text NOT NULL CHECK (access_class IN (
    'recruiter', 'beskt_interviewer', 'independent_assessor',
    'authorised_security_function', 'accountable_process_owner')),

  content_provenance text NOT NULL
    CHECK (content_provenance IN ('source_stated', 'derived_in_authoring', 'cqrity_design_hypothesis')),
  source_reference text,

  -- What may NOT be inferred from the answer. A closed list; the validator
  -- requires at least one entry.
  prohibited_inferences text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (prohibited_inferences <@ ARRAY[
      'suitability_inference', 'credibility_or_deception_inference',
      'biometric_or_emotion_inference', 'sensitive_trait_inference',
      'protected_trait_proxy', 'omission_as_negative_evidence',
      'personality_or_health_diagnosis', 'inconsistency_as_dishonesty']::text[]),

  -- Security-vetting-only content is exactly the security-vetting mode, and
  -- is readable only by the authorised security function.
  CONSTRAINT beskt_items_mode_sensitivity_check
    CHECK ((permitted_mode = 'security_vetting_support') = (sensitivity_class = 'security_vetting_only')),
  CONSTRAINT beskt_items_sv_access_check
    CHECK (sensitivity_class <> 'security_vetting_only' OR access_class = 'authorised_security_function'),
  -- Nothing above ordinary sensitivity can be compelled, and it can always be
  -- taken orally instead.
  CONSTRAINT beskt_items_sensitive_never_required_check
    CHECK (sensitivity_class = 'ordinary' OR requiredness = 'voluntary'),
  CONSTRAINT beskt_items_sensitive_discuss_orally_check
    CHECK (sensitivity_class = 'ordinary' OR discuss_orally_allowed),

  UNIQUE (method_version_id, item_key)
);

COMMENT ON TABLE public.beskt_items IS
  'Governed questionnaire items. Each one states its purpose, links to a '
  'role-exposure profile in the same version, declares its mode, phase, typed '
  'answer contract, required/voluntary policy, discuss-orally policy, '
  'sensitivity and access class, provenance and prohibited inferences. It '
  'stores no answer and no candidate.';

CREATE INDEX beskt_items_version_idx ON public.beskt_items (method_version_id, display_order);
CREATE INDEX beskt_items_section_idx ON public.beskt_items (section_id);
CREATE INDEX beskt_items_profile_idx ON public.beskt_items (exposure_profile_id);


-- 3.6  Options. Stable key, bilingual label, order -- and nothing else. No
--      weight, no points, no risk value, no hidden assessment code: there is
--      no column for one.
CREATE TABLE public.beskt_item_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.beskt_items(id) ON DELETE RESTRICT,
  option_key text NOT NULL CHECK (option_key ~ '^[a-z0-9][a-z0-9_]*$'),
  display_order integer NOT NULL CHECK (display_order >= 1),
  label_sv text,
  label_en text,
  UNIQUE (item_id, option_key)
);

CREATE INDEX beskt_item_options_item_idx ON public.beskt_item_options (item_id, display_order);


-- 3.7  Governed interview prompts and probes.
CREATE TABLE public.beskt_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_version_id uuid NOT NULL REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  -- Every prompt links to documented exposure relevance in the same version.
  exposure_profile_id uuid NOT NULL REFERENCES public.beskt_exposure_profiles(id) ON DELETE RESTRICT,
  -- A probe about a specific item; NULL for method-level conduct prompts.
  item_id uuid REFERENCES public.beskt_items(id) ON DELETE RESTRICT,
  prompt_key text NOT NULL CHECK (prompt_key ~ '^[a-z0-9][a-z0-9_]*$'),
  display_order integer NOT NULL CHECK (display_order >= 1),

  -- The closed PEACE/ORBIT-compatible vocabulary. There is no kind for a
  -- challenge, a confrontation, an accusation, a bluff or a pressure
  -- technique, so none can be authored.
  prompt_kind text NOT NULL CHECK (prompt_kind IN (
    'planning_from_role_relevance',
    'purpose_explanation', 'process_explanation', 'voluntariness_notice',
    'data_use_and_rights_notice', 'human_decision_notice', 'autonomy_offer',
    'open_invitation', 'free_account', 'behavioural_example',
    'listening_reflection', 'specific_probe', 'context_opportunity',
    'correction_opportunity', 'neutral_difference_exploration',
    'summary_confirmation',
    'verification_need_disclosure', 'closure_next_step',
    'interviewer_self_review')),
  -- Recorded explicitly and checked against the fixed mapping, so the stage
  -- binding is auditable on its own. All five PEACE stages are represented;
  -- Evaluation is the interviewer's review of their own conduct and of the
  -- state of the basis -- never a candidate score, verdict or suitability
  -- judgement, which no prompt kind, question form or column can express.
  peace_stage text NOT NULL CHECK (peace_stage IN ('planning', 'engage_explain', 'account', 'closure', 'evaluation')),
  addressee text NOT NULL CHECK (addressee IN ('candidate', 'interviewer')),
  -- Planning and Evaluation address the interviewer, never the candidate.
  CONSTRAINT beskt_prompts_interviewer_stages_check
    CHECK ((peace_stage IN ('planning', 'evaluation')) = (addressee = 'interviewer')),

  -- A positive allowlist of question forms. No value exists for an assertion
  -- put to the candidate, a leading form or a pressure form.
  question_form text NOT NULL CHECK (question_form IN (
    'open_question', 'free_recall', 'cued_recall', 'reflective_readback',
    'neutral_clarification', 'summary_readback', 'information_notice')),

  -- What a probe may be grounded in. Behavioural cues (tone, hesitation,
  -- gaze, face, voice, emotion, body language) are not a value here and so
  -- cannot be a basis for anything.
  permitted_probe_bases text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (permitted_probe_bases <@ ARRAY[
      'submitted_answer', 'documented_role_requirement',
      'candidate_supplied_document', 'candidate_correction']::text[]),

  permitted_mode text NOT NULL
    CHECK (permitted_mode IN ('recruitment_support', 'security_vetting_support')),

  wording_sv text,
  wording_en text,

  content_provenance text NOT NULL
    CHECK (content_provenance IN ('source_stated', 'derived_in_authoring', 'cqrity_design_hypothesis')),
  source_reference text,

  UNIQUE (method_version_id, prompt_key)
);

COMMENT ON TABLE public.beskt_prompts IS
  'Governed interview prompts and probes in a closed PEACE/ORBIT-compatible '
  'vocabulary. Wording must satisfy beskt_wording_is_neutral(): no leading, '
  'double-barrelled, guilt-presuming, coercive or deceptive form, and no claim '
  'that tone, hesitation, gaze, face, voice, emotion or body language '
  'indicates deception.';

CREATE INDEX beskt_prompts_version_idx ON public.beskt_prompts (method_version_id, display_order);
CREATE INDEX beskt_prompts_profile_idx ON public.beskt_prompts (exposure_profile_id);
CREATE INDEX beskt_prompts_item_idx ON public.beskt_prompts (item_id);


-- 3.8  Deterministic routing rules. Structured data only: an explicit typed
--      condition on a stable item/option key, an explicit target, a
--      deterministic evaluation order. No expression, no jsonb action, no
--      free-text interpretation -- and no condition kind for an omitted or
--      discuss-orally answer, so a non-answer can never be a branch.
CREATE TABLE public.beskt_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_version_id uuid NOT NULL REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  rule_key text NOT NULL CHECK (rule_key ~ '^[a-z0-9][a-z0-9_]*$'),
  evaluation_order integer NOT NULL CHECK (evaluation_order >= 1),
  applies_mode text NOT NULL
    CHECK (applies_mode IN ('recruitment_support', 'security_vetting_support')),
  source_item_id uuid NOT NULL REFERENCES public.beskt_items(id) ON DELETE RESTRICT,
  condition_kind text NOT NULL
    CHECK (condition_kind IN ('always', 'option_selected', 'boolean_equals')),
  condition_option_id uuid REFERENCES public.beskt_item_options(id) ON DELETE RESTRICT,
  condition_boolean boolean,
  action text NOT NULL CHECK (action IN ('show', 'skip')),
  target_item_id uuid NOT NULL REFERENCES public.beskt_items(id) ON DELETE RESTRICT,

  CONSTRAINT beskt_routing_rules_option_condition_check
    CHECK ((condition_kind = 'option_selected') = (condition_option_id IS NOT NULL)),
  CONSTRAINT beskt_routing_rules_boolean_condition_check
    CHECK ((condition_kind = 'boolean_equals') = (condition_boolean IS NOT NULL)),
  CONSTRAINT beskt_routing_rules_no_self_target_check
    CHECK (source_item_id <> target_item_id),

  UNIQUE (method_version_id, rule_key),
  UNIQUE (method_version_id, evaluation_order)
);

COMMENT ON TABLE public.beskt_routing_rules IS
  'Deterministic questionnaire routing. Depends only on the exact method '
  'version, the exact exposure profile, the chosen mode and explicit '
  'structured answers to stable item/option keys. A rule cannot read free '
  'text, sentiment, probability or a non-answer.';

CREATE INDEX beskt_routing_rules_version_idx ON public.beskt_routing_rules (method_version_id, evaluation_order);
CREATE INDEX beskt_routing_rules_source_idx ON public.beskt_routing_rules (source_item_id);
CREATE INDEX beskt_routing_rules_target_idx ON public.beskt_routing_rules (target_item_id);
CREATE INDEX beskt_routing_rules_option_idx ON public.beskt_routing_rules (condition_option_id);


-- 3.9  The seven categorical evidence anchors. They describe the state of the
--      available basis, never a person. No level, no number, no mapping to
--      the role-interview 0-4 anchors.
CREATE TABLE public.beskt_evidence_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_version_id uuid NOT NULL REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  evidence_state text NOT NULL CHECK (evidence_state IN (
    'unaddressed', 'clarification_needed', 'sufficiently_clarified',
    'external_verification_needed', 'conflicting_information',
    'insufficient_basis', 'not_applicable')),

  -- The seven governed components, each in both languages.
  definition_sv text,
  definition_en text,
  inclusion_criteria_sv text,
  inclusion_criteria_en text,
  exclusion_criteria_sv text,
  exclusion_criteria_en text,
  supporting_evidence_examples_sv text,
  supporting_evidence_examples_en text,
  counter_evidence_and_protective_factors_sv text,
  counter_evidence_and_protective_factors_en text,
  prohibited_inferences text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (prohibited_inferences <@ ARRAY[
      'suitability_inference', 'credibility_or_deception_inference',
      'biometric_or_emotion_inference', 'sensitive_trait_inference',
      'protected_trait_proxy', 'omission_as_negative_evidence',
      'personality_or_health_diagnosis', 'inconsistency_as_dishonesty']::text[]),
  required_next_action text CHECK (required_next_action IN (
    'none', 'clarify_with_candidate', 'offer_candidate_correction',
    'external_verification', 'record_insufficient_basis',
    'refer_to_authorised_security_function')),

  UNIQUE (method_version_id, evidence_state)
);

COMMENT ON TABLE public.beskt_evidence_anchors IS
  'The seven categorical evidence states of PR 1, each with definition, '
  'inclusion criteria, exclusion criteria, supporting-evidence examples, '
  'counter-evidence and protective factors, prohibited inferences and a '
  'required next action. Exactly one per state per version. There is no '
  'numeric level and no compatibility mapping to the 0-4 anchors.';

CREATE INDEX beskt_evidence_anchors_version_idx ON public.beskt_evidence_anchors (method_version_id);


-- 3.10 The ten observation fields whose separation the future runtime must
--      preserve, as governed DEFINITIONS. No observation is stored here.
CREATE TABLE public.beskt_observation_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_version_id uuid NOT NULL REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  field_key text NOT NULL CHECK (field_key IN (
    'fact', 'source_provenance', 'role_exposure_link',
    'interviewer_interpretation', 'candidate_explanation', 'counter_evidence',
    'protective_factor', 'verification_need', 'candidate_correction',
    'sensitivity_access_class')),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 10),
  recorded_by text NOT NULL
    CHECK (recorded_by IN ('interviewer', 'candidate', 'process_owner', 'system')),
  is_judgement boolean NOT NULL,
  label_sv text,
  label_en text,
  definition_sv text,
  definition_en text,

  -- Judgement lives in exactly one field, and only the candidate speaks for
  -- the candidate.
  CONSTRAINT beskt_observation_fields_judgement_check
    CHECK (is_judgement = (field_key = 'interviewer_interpretation')),
  CONSTRAINT beskt_observation_fields_candidate_voice_check
    CHECK ((field_key IN ('candidate_explanation', 'candidate_correction')) = (recorded_by = 'candidate')),

  UNIQUE (method_version_id, field_key),
  UNIQUE (method_version_id, ordinal)
);

CREATE INDEX beskt_observation_fields_version_idx ON public.beskt_observation_fields (method_version_id);


-- 3.10b Governance grants: the server-owned, auditable mapping from a person
--       to exactly the review gates they may record, and to internal QA
--       reading. Provenance, validity window and revocation are recorded;
--       a grant is never deleted and never rewritten except to revoke it.
--       No client role can write here: grants are made and revoked by a
--       platform admin through the governed RPCs only.
CREATE TABLE public.beskt_governance_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  grant_kind text NOT NULL CHECK (grant_kind IN (
    'personnel_security', 'senior_hr', 'recruitment',
    'employment_privacy_legal', 'data_protection',
    'internal_qa')),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  -- Where the authority to hold this gate comes from (a decision, a role
  -- description, a mandate reference). Never blank.
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) > 0),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason text,
  -- Idempotency receipts for the two admin operations.
  grant_operation_id uuid UNIQUE,
  revoke_operation_id uuid UNIQUE,
  CONSTRAINT beskt_governance_grants_validity_check
    CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT beskt_governance_grants_revocation_check
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revoke_reason IS NULL))
);

COMMENT ON TABLE public.beskt_governance_grants IS
  'Who may record which BESKT review gate, and who may read published '
  'synthetic content as internal QA. Server-owned and auditable: provenance, '
  'validity window, revocation. A generic content reviewer role is never '
  'enough to act as a gate; the exact gate must be granted here.';

CREATE INDEX beskt_governance_grants_user_idx
  ON public.beskt_governance_grants (user_id, grant_kind) WHERE revoked_at IS NULL;
CREATE INDEX beskt_governance_grants_granted_by_idx ON public.beskt_governance_grants (granted_by);
CREATE INDEX beskt_governance_grants_revoked_by_idx ON public.beskt_governance_grants (revoked_by);


-- 3.11 Review records: five separate human gates, each bound to the exact
--      content hash and revision the reviewer saw. Append-only.
CREATE TABLE public.beskt_method_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_version_id uuid NOT NULL REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  gate text NOT NULL CHECK (gate IN (
    'personnel_security', 'senior_hr', 'recruitment',
    'employment_privacy_legal', 'data_protection')),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  rationale text NOT NULL CHECK (length(btrim(rationale)) > 0),
  content_hash_at_review text NOT NULL,
  revision_at_review integer NOT NULL,
  review_cycle_at_review integer NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.beskt_method_reviews IS
  'Append-only record of the five human review gates of PR 1. A reviewer is '
  'never the author, holds a server-owned grant for exactly the gate they '
  'record, approves at most one gate per content hash, and an approval binds '
  'to the hash, revision and review cycle it was given: editing the content '
  'or rejecting and resubmitting invalidates every gate by construction.';

CREATE INDEX beskt_method_reviews_version_idx
  ON public.beskt_method_reviews (method_version_id, gate, decided_at DESC);
CREATE INDEX beskt_method_reviews_reviewer_idx ON public.beskt_method_reviews (reviewer_id);


-- 3.12 The append-only governance ledger. It also carries the idempotency
--      receipts truthfully: no client role can write here, so an operation id
--      recorded on an event was recorded by the governed RPC that served it.
CREATE TABLE public.beskt_method_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY NOT NULL UNIQUE,
  pack_id uuid NOT NULL REFERENCES public.scp_interview_packs(id) ON DELETE RESTRICT,
  method_version_id uuid REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  event text NOT NULL CHECK (event IN (
    'method_created', 'version_created', 'new_version_created',
    'draft_touched', 'submitted_for_review',
    'review_approved', 'review_rejected',
    'published', 'suspended', 'retired')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_status text,
  new_status text,
  reason text,
  content_hash text,
  revision integer,

  -- Idempotency receipt: the operation this event served, the SHA-256 of the
  -- exact request it was given, and the result it returned, so a replay can
  -- answer with the original result and a changed payload can be refused.
  operation_id uuid,
  request_hash text,
  result jsonb,
  CONSTRAINT beskt_method_events_receipt_pair_check
    CHECK ((operation_id IS NULL) = (request_hash IS NULL)),
  CONSTRAINT beskt_method_events_receipt_result_check
    CHECK (operation_id IS NULL OR result IS NOT NULL),

  -- Governance metadata only. No candidate ever appears in this domain.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.beskt_method_events IS
  'Append-only governance history and idempotency receipts. No client role '
  'holds INSERT: the only writer is beskt_record_event(), called by the '
  'SECURITY DEFINER lifecycle RPCs, so a browser cannot forge, backdate, omit '
  'or replay an event.';

CREATE INDEX beskt_method_events_pack_idx ON public.beskt_method_events (pack_id, seq DESC);
CREATE INDEX beskt_method_events_version_idx ON public.beskt_method_events (method_version_id, seq DESC);
CREATE INDEX beskt_method_events_actor_idx ON public.beskt_method_events (actor_id);
CREATE UNIQUE INDEX beskt_method_events_operation_idx
  ON public.beskt_method_events (operation_id) WHERE operation_id IS NOT NULL;


-- ###########################################################################
-- SECTION 4 -- Guards. Purpose-built, this domain's vocabulary, fail closed.
-- ###########################################################################

-- 4.1  A method version belongs to a BESKT pack, starts as draft at revision
--      1, and carries no lifecycle attribution at birth.
CREATE OR REPLACE FUNCTION public.beskt_guard_version_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _kind text;
BEGIN
  SELECT p.pack_kind INTO _kind FROM public.scp_interview_packs p WHERE p.id = NEW.pack_id;
  IF _kind IS DISTINCT FROM 'beskt_method' THEN
    RAISE EXCEPTION
      'BESKT_PACK_KIND_MISMATCH: beskt_method_versions holds BESKT methods only; pack % is "%".',
      NEW.pack_id, coalesce(_kind, 'missing') USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.content_status <> 'draft' OR NEW.revision <> 1 THEN
    RAISE EXCEPTION
      'BESKT_MUST_START_AS_DRAFT: a new method version is inserted as draft at revision 1, not "%" at revision %.',
      NEW.content_status, NEW.revision USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.published_at IS NOT NULL OR NEW.published_by IS NOT NULL
     OR NEW.suspended_at IS NOT NULL OR NEW.retired_at IS NOT NULL THEN
    RAISE EXCEPTION
      'BESKT_MUST_START_AS_DRAFT: a new method version may not carry lifecycle attribution.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_guard_version_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER beskt_method_versions_insert_guard
  BEFORE INSERT ON public.beskt_method_versions
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_version_insert();


-- 4.2  Transitions, revision monotonicity and immutability from published
--      onward. Every UPDATE must come from a governed RPC (the transaction-
--      local marker), so a BYPASSRLS caller still cannot walk a version
--      through the lifecycle by hand or write an older revision over a newer
--      one.
CREATE OR REPLACE FUNCTION public.beskt_guard_version_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Columns a governed transition may write. Everything else is CONTENT and
  -- is frozen once the version leaves the editable states.
  _lifecycle text[] := ARRAY[
    'content_status', 'validation_label', 'content_hash', 'revision', 'review_cycle', 'open_slot', 'updated_at',
    'published_by', 'published_at',
    'suspended_by', 'suspended_at', 'suspended_reason',
    'retired_by', 'retired_at', 'retired_reason'];
  _editable text[] := ARRAY['draft', 'in_review'];
  _governed boolean := coalesce(current_setting('beskt.governed_transition', true), '') = 'on';
  _col text;
  -- open_slot is generated from content_status after BEFORE triggers run, so
  -- NEW carries no value for it here; it is never compared.
  _old jsonb := to_jsonb(OLD) - 'open_slot';
  _new jsonb := to_jsonb(NEW) - 'open_slot';
  _legal boolean;
BEGIN
  IF NOT _governed THEN
    RAISE EXCEPTION
      'BESKT_UNGOVERNED_WRITE: beskt_method_versions is written only by the governed BESKT RPCs, never by a direct table update.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.pack_id IS DISTINCT FROM OLD.pack_id
     OR NEW.version_number IS DISTINCT FROM OLD.version_number THEN
    RAISE EXCEPTION 'BESKT_VERSION_IDENTITY: pack_id and version_number are immutable.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The revision never regresses and never stands still on a change: an
  -- older write can never silently overwrite newer content.
  IF NEW.revision < OLD.revision THEN
    RAISE EXCEPTION 'BESKT_REVISION_REGRESSION: revision % cannot replace revision %.',
      NEW.revision, OLD.revision USING ERRCODE = 'check_violation';
  END IF;
  -- The one same-revision write: stamping the initial hash onto a version
  -- that was just inserted with no hash. Nothing else may change with it.
  IF NEW.revision = OLD.revision
     AND (_old - 'updated_at') IS DISTINCT FROM (_new - 'updated_at')
     AND NOT (OLD.content_hash IS NULL AND NEW.content_hash IS NOT NULL
              AND (_old - 'updated_at' - 'content_hash') = (_new - 'updated_at' - 'content_hash')) THEN
    RAISE EXCEPTION 'BESKT_REVISION_NOT_ADVANCED: every governed change to a method version advances its revision.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.content_status IS DISTINCT FROM OLD.content_status THEN
    _legal := CASE OLD.content_status
      WHEN 'draft'     THEN NEW.content_status = 'in_review'
      WHEN 'in_review' THEN NEW.content_status IN ('draft', 'published')
      WHEN 'published' THEN NEW.content_status IN ('suspended', 'retired')
      WHEN 'suspended' THEN NEW.content_status = 'retired'
      WHEN 'retired'   THEN false
      ELSE false
    END;
    IF NOT _legal THEN
      RAISE EXCEPTION
        'BESKT_ILLEGAL_TRANSITION: "%" -> "%" is not a permitted method version transition.',
        OLD.content_status, NEW.content_status USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Content is frozen once the version has left the editable states. A
  -- correction after publication requires a NEW VERSION.
  IF NOT (OLD.content_status = ANY (_editable)) THEN
    FOR _col IN SELECT jsonb_object_keys(_old) LOOP
      IF _col = ANY (_lifecycle) THEN CONTINUE; END IF;
      IF (_old -> _col) IS DISTINCT FROM (_new -> _col) THEN
        RAISE EXCEPTION
          'BESKT_PUBLISHED_IMMUTABLE: column "%" cannot be modified once content_status is "%". Create a new version instead.',
          _col, OLD.content_status USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
    -- And the reviewed hash never moves on a frozen version.
    IF NEW.content_hash IS DISTINCT FROM OLD.content_hash THEN
      RAISE EXCEPTION
        'BESKT_PUBLISHED_IMMUTABLE: the content hash of a "%" version is frozen.',
        OLD.content_status USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_guard_version_transition() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER beskt_method_versions_transition
  BEFORE UPDATE ON public.beskt_method_versions
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_version_transition();


-- 4.3  Governed history is never deleted, in any state. Retire it instead.
CREATE OR REPLACE FUNCTION public.beskt_guard_version_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'BESKT_VERSION_NO_DELETE: a BESKT method version is never deleted (status "%"). Retire it instead.',
    OLD.content_status USING ERRCODE = 'insufficient_privilege';
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_guard_version_no_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER beskt_method_versions_no_delete
  BEFORE DELETE ON public.beskt_method_versions
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_version_no_delete();


-- 4.4  Child rows: same-version referential integrity and immutability of
--      every child of a published, suspended or retired version.
--
--      One function, dispatching on TG_TABLE_NAME with an ELSE that RAISES:
--      attaching it to a table it does not know is a loud failure, never a
--      silent no-op.
CREATE OR REPLACE FUNCTION public.beskt_guard_child_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _version_id uuid;
  _old_version_id uuid;
  _status text;
  _other uuid;
  _src record;
  _tgt record;
  _opt_item uuid;
  _item_profile uuid;
  _lock_id uuid;
BEGIN
  _row := COALESCE(NEW, OLD);

  -- ---- resolve the owning version, of NEW and (on UPDATE) of OLD -----------
  -- Both owners are checked: a child of a frozen version can never be moved
  -- under a draft, and a draft's child can never be moved under a frozen one.
  CASE TG_TABLE_NAME
    WHEN 'beskt_exposure_profiles', 'beskt_activation_requirements', 'beskt_sections',
         'beskt_items', 'beskt_prompts', 'beskt_routing_rules',
         'beskt_evidence_anchors', 'beskt_observation_fields' THEN
      _version_id := _row.method_version_id;
      IF TG_OP = 'UPDATE' THEN _old_version_id := OLD.method_version_id; END IF;
    WHEN 'beskt_item_options' THEN
      SELECT i.method_version_id INTO _version_id FROM public.beskt_items i WHERE i.id = _row.item_id;
      IF TG_OP = 'UPDATE' THEN
        SELECT i.method_version_id INTO _old_version_id FROM public.beskt_items i WHERE i.id = OLD.item_id;
      END IF;
    ELSE
      RAISE EXCEPTION
        'BESKT_GUARD_UNKNOWN_TABLE: beskt_guard_child_row() was attached to "%", which it does not know how to resolve to a method version. Refusing rather than allowing an unguarded write.',
        TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END CASE;

  IF _version_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_GUARD_UNRESOLVED_PARENT: could not resolve the owning method version for a row in "%".',
      TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;

  -- ---- serialise against publication -------------------------------------
  -- The owning version row(s) are locked BEFORE their status is read, with
  -- a lock that conflicts with the FOR UPDATE that beskt_lock_version takes
  -- for publication. A child write and a publication of the same version
  -- therefore serialise: either the child commits first and publication
  -- sees a stale hash, or publication commits first and the child sees a
  -- frozen version. The published bytes are always exactly the bytes the
  -- stored hash names. Two owners (a re-parent) are locked in id order.
  FOR _lock_id IN
    SELECT x FROM unnest(ARRAY[_version_id, _old_version_id]) AS u(x) WHERE x IS NOT NULL ORDER BY x
  LOOP
    PERFORM 1 FROM public.beskt_method_versions v WHERE v.id = _lock_id FOR SHARE;
  END LOOP;

  SELECT v.content_status INTO _status FROM public.beskt_method_versions v WHERE v.id = _version_id;
  IF _status IS NULL THEN
    RAISE EXCEPTION 'BESKT_GUARD_UNRESOLVED_PARENT: method version % does not exist.', _version_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- immutability from published onward, on the OLD owner too ------------
  IF TG_OP = 'UPDATE' AND _old_version_id IS DISTINCT FROM _version_id THEN
    SELECT v.content_status INTO _status FROM public.beskt_method_versions v WHERE v.id = _old_version_id;
    IF _status IS NULL OR _status NOT IN ('draft', 'in_review') THEN
      RAISE EXCEPTION
        'BESKT_PUBLISHED_IMMUTABLE: % cannot be re-parented away from its method version, which is "%".',
        TG_TABLE_NAME, coalesce(_status, 'missing') USING ERRCODE = 'check_violation';
    END IF;
    SELECT v.content_status INTO _status FROM public.beskt_method_versions v WHERE v.id = _version_id;
  END IF;
  IF _status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION
      'BESKT_PUBLISHED_IMMUTABLE: % cannot be modified because its method version is "%". Create a new version instead.',
      TG_TABLE_NAME, _status USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- ---- owning and parent keys are immutable, per family -------------------
  -- A child belongs to what it was created under. Re-parenting is not an
  -- edit: it is a new row in a draft.
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'beskt_item_options' THEN
      IF NEW.item_id IS DISTINCT FROM OLD.item_id THEN
        RAISE EXCEPTION 'BESKT_PARENT_IMMUTABLE: an option cannot be moved to another item.'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF NEW.method_version_id IS DISTINCT FROM OLD.method_version_id THEN
      RAISE EXCEPTION 'BESKT_PARENT_IMMUTABLE: % cannot be moved to another method version.', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    END IF;
    IF TG_TABLE_NAME = 'beskt_items' THEN
      IF NEW.section_id IS DISTINCT FROM OLD.section_id
         OR NEW.exposure_profile_id IS DISTINCT FROM OLD.exposure_profile_id THEN
        RAISE EXCEPTION 'BESKT_PARENT_IMMUTABLE: an item cannot be moved to another section or exposure profile.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF TG_TABLE_NAME = 'beskt_prompts' THEN
      IF NEW.exposure_profile_id IS DISTINCT FROM OLD.exposure_profile_id
         OR NEW.item_id IS DISTINCT FROM OLD.item_id THEN
        RAISE EXCEPTION 'BESKT_PARENT_IMMUTABLE: a prompt cannot be moved to another exposure profile or item.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF TG_TABLE_NAME = 'beskt_routing_rules' THEN
      IF NEW.source_item_id IS DISTINCT FROM OLD.source_item_id
         OR NEW.target_item_id IS DISTINCT FROM OLD.target_item_id
         OR NEW.condition_option_id IS DISTINCT FROM OLD.condition_option_id THEN
        RAISE EXCEPTION 'BESKT_PARENT_IMMUTABLE: a routing rule cannot be re-pointed at other items or options.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- ---- same-version references ------------------------------------------
  -- Every reference a child row makes must resolve inside its own version.
  -- A cross-version reference is refused whichever side is edited.
  IF TG_TABLE_NAME IN ('beskt_items', 'beskt_prompts') THEN
    IF NEW.exposure_profile_id IS NULL THEN
      RAISE EXCEPTION 'BESKT_EXPOSURE_LINK_REQUIRED: every item and prompt links to documented exposure relevance.'
        USING ERRCODE = 'not_null_violation';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'beskt_items' THEN
    SELECT s.method_version_id INTO _other FROM public.beskt_sections s WHERE s.id = NEW.section_id;
    IF _other IS DISTINCT FROM NEW.method_version_id THEN
      RAISE EXCEPTION 'BESKT_CROSS_VERSION_REFERENCE: an item must belong to a section of its own method version.'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT p.method_version_id INTO _other FROM public.beskt_exposure_profiles p WHERE p.id = NEW.exposure_profile_id;
    IF _other IS DISTINCT FROM NEW.method_version_id THEN
      RAISE EXCEPTION 'BESKT_CROSS_VERSION_REFERENCE: an item must link to an exposure profile of its own method version.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'beskt_prompts' THEN
    SELECT p.method_version_id INTO _other FROM public.beskt_exposure_profiles p WHERE p.id = NEW.exposure_profile_id;
    IF _other IS DISTINCT FROM NEW.method_version_id THEN
      RAISE EXCEPTION 'BESKT_CROSS_VERSION_REFERENCE: a prompt must link to an exposure profile of its own method version.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.item_id IS NOT NULL THEN
      SELECT i.method_version_id, i.exposure_profile_id INTO _other, _item_profile
        FROM public.beskt_items i WHERE i.id = NEW.item_id;
      IF _other IS DISTINCT FROM NEW.method_version_id THEN
        RAISE EXCEPTION 'BESKT_CROSS_VERSION_REFERENCE: a prompt may only probe an item of its own method version.'
          USING ERRCODE = 'check_violation';
      END IF;
      -- A prompt probes its own exposure profile's item, never another
      -- profile's: documented role relevance is not transferable.
      IF _item_profile IS DISTINCT FROM NEW.exposure_profile_id THEN
        RAISE EXCEPTION 'BESKT_CROSS_PROFILE_REFERENCE: a prompt may only probe an item of its own exposure profile.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    -- The stage binding is fixed by kind and recorded explicitly.
    IF NEW.peace_stage <> public.beskt_prompt_stage(NEW.prompt_kind) THEN
      RAISE EXCEPTION 'BESKT_PROMPT_STAGE_MISMATCH: prompt kind "%" belongs to stage "%", not "%".',
        NEW.prompt_kind, public.beskt_prompt_stage(NEW.prompt_kind), NEW.peace_stage
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'beskt_routing_rules' THEN
    SELECT i.method_version_id, i.answer_type, i.permitted_mode, i.phase, i.exposure_profile_id,
           s.display_order AS section_order, i.display_order, i.item_key
      INTO _src FROM public.beskt_items i JOIN public.beskt_sections s ON s.id = i.section_id
     WHERE i.id = NEW.source_item_id;
    SELECT i.method_version_id, i.answer_type, i.permitted_mode, i.phase, i.exposure_profile_id,
           s.display_order AS section_order, i.display_order, i.item_key
      INTO _tgt FROM public.beskt_items i JOIN public.beskt_sections s ON s.id = i.section_id
     WHERE i.id = NEW.target_item_id;
    IF _src.method_version_id IS NULL OR _tgt.method_version_id IS NULL THEN
      RAISE EXCEPTION 'BESKT_ROUTE_ITEM_UNKNOWN: a routing rule names a source and a target item that exist.'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF _src.method_version_id IS DISTINCT FROM NEW.method_version_id
       OR _tgt.method_version_id IS DISTINCT FROM NEW.method_version_id THEN
      RAISE EXCEPTION 'BESKT_CROSS_VERSION_REFERENCE: a routing rule may only connect items of its own method version.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.condition_kind = 'option_selected' AND _src.answer_type NOT IN ('single_choice', 'multi_choice') THEN
      RAISE EXCEPTION 'BESKT_ROUTE_CONDITION_TYPE: option_selected requires a choice-typed source item.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.condition_kind = 'boolean_equals' AND _src.answer_type <> 'boolean' THEN
      RAISE EXCEPTION 'BESKT_ROUTE_CONDITION_TYPE: boolean_equals requires a boolean source item.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Routing never crosses exposure profiles: an answer given under one
    -- documented relevance cannot open or close a question under another.
    IF _src.exposure_profile_id IS DISTINCT FROM _tgt.exposure_profile_id THEN
      RAISE EXCEPTION 'BESKT_CROSS_PROFILE_REFERENCE: a routing rule may only connect items of one exposure profile.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.condition_option_id IS NOT NULL THEN
      SELECT o.item_id INTO _opt_item FROM public.beskt_item_options o WHERE o.id = NEW.condition_option_id;
      IF _opt_item IS DISTINCT FROM NEW.source_item_id THEN
        RAISE EXCEPTION 'BESKT_ROUTE_OPTION_SCOPE: the condition option must belong to the rule''s source item.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    -- Routing is questionnaire branching. Interview and verification topics
    -- are derived later from submitted answers, never routed here.
    IF _src.phase <> 'candidate_preparation' OR _tgt.phase <> 'candidate_preparation' THEN
      RAISE EXCEPTION 'BESKT_ROUTE_PHASE: routing connects candidate_preparation items only.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- The hard boundary: a recruitment-support rule can neither read nor
    -- reach security-vetting-only content.
    IF NEW.applies_mode = 'recruitment_support'
       AND (_tgt.permitted_mode = 'security_vetting_support'
            OR _src.permitted_mode = 'security_vetting_support') THEN
      RAISE EXCEPTION 'BESKT_ROUTE_MODE_ESCALATION: a recruitment_support rule cannot reach or read security_vetting_support content.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Routing only moves forward through the governed order (section, item,
    -- key): a target never precedes or equals its source, so an answer can
    -- never reopen or close something the candidate has already passed, and
    -- no cycle is representable.
    IF (_tgt.section_order, _tgt.display_order, _tgt.item_key)
       <= (_src.section_order, _src.display_order, _src.item_key) THEN
      RAISE EXCEPTION 'BESKT_ROUTE_BACKWARD: a routing rule may only target an item that comes after its source in the governed order.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_guard_child_row() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER beskt_exposure_profiles_child_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.beskt_exposure_profiles
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_child_row();
CREATE TRIGGER beskt_activation_requirements_child_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.beskt_activation_requirements
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_child_row();
CREATE TRIGGER beskt_sections_child_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.beskt_sections
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_child_row();
CREATE TRIGGER beskt_items_child_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.beskt_items
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_child_row();
CREATE TRIGGER beskt_item_options_child_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.beskt_item_options
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_child_row();
CREATE TRIGGER beskt_prompts_child_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.beskt_prompts
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_child_row();
CREATE TRIGGER beskt_routing_rules_child_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.beskt_routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_child_row();
CREATE TRIGGER beskt_evidence_anchors_child_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.beskt_evidence_anchors
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_child_row();
CREATE TRIGGER beskt_observation_fields_child_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.beskt_observation_fields
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_child_row();


-- 4.5  Reviews and events are append-only. No client, no owner, no BYPASSRLS
--      caller may rewrite history: a trigger fires for all of them.
CREATE OR REPLACE FUNCTION public.beskt_guard_reviews_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'BESKT_REVIEW_APPEND_ONLY: a review record is never updated or deleted. Record a further review instead.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_guard_reviews_append_only() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER beskt_method_reviews_append_only
  BEFORE UPDATE OR DELETE ON public.beskt_method_reviews
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_reviews_append_only();

CREATE OR REPLACE FUNCTION public.beskt_guard_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'BESKT_EVENT_APPEND_ONLY: governance history is never updated or deleted.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_guard_events_append_only() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER beskt_method_events_append_only
  BEFORE UPDATE OR DELETE ON public.beskt_method_events
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_events_append_only();


-- 4.6  Separation of duties on a review: never the author, one human
--      approves at most one gate per content hash, and a review binds to the
--      version's CURRENT hash and revision.
CREATE OR REPLACE FUNCTION public.beskt_guard_review_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _v public.beskt_method_versions%ROWTYPE;
BEGIN
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = NEW.method_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BESKT_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _v.created_by IS NOT NULL AND _v.created_by = NEW.reviewer_id THEN
    RAISE EXCEPTION
      'BESKT_SELF_REVIEW: the author of a method version may not review it. The five gates exist to be five other pairs of eyes.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.decision = 'approved' AND EXISTS (
       SELECT 1 FROM public.beskt_method_reviews r
        WHERE r.method_version_id = NEW.method_version_id
          AND r.reviewer_id = NEW.reviewer_id
          AND r.decision = 'approved'
          AND r.content_hash_at_review = NEW.content_hash_at_review
          AND r.gate <> NEW.gate) THEN
    RAISE EXCEPTION
      'BESKT_REVIEW_ONE_GATE_PER_REVIEWER: one human approves at most one of the five gates for a given content hash.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.content_hash_at_review IS DISTINCT FROM _v.content_hash
     OR NEW.revision_at_review IS DISTINCT FROM _v.revision
     OR NEW.review_cycle_at_review IS DISTINCT FROM _v.review_cycle THEN
    RAISE EXCEPTION
      'BESKT_REVIEW_HASH_MISMATCH: a review binds to the version''s current content hash, revision and review cycle.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- The reviewer holds an active grant for exactly this gate. Checked here as
  -- well as in the RPC, so a BYPASSRLS writer cannot record a gate nobody
  -- granted.
  IF NOT public.beskt_holds_grant(NEW.reviewer_id, NEW.gate) THEN
    RAISE EXCEPTION
      'BESKT_GATE_NOT_GRANTED: % holds no active grant for the % gate.', NEW.reviewer_id, NEW.gate
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_guard_review_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER beskt_method_reviews_insert_guard
  BEFORE INSERT ON public.beskt_method_reviews
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_review_insert();


-- 4.7  Governance grants are written only by the two governed RPCs, which
--      set a transaction-local marker around their one INSERT or one
--      revocation UPDATE. Every other write -- a fabricated grant, a
--      revocation outside beskt_revoke_governance, a rewrite, a delete -- is
--      refused for every caller, the database owner and service_role
--      included, because a trigger fires for BYPASSRLS callers too.
CREATE OR REPLACE FUNCTION public.beskt_guard_grants_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _governed boolean := coalesce(current_setting('beskt.governance_grant_write', true), '') = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BESKT_GRANT_APPEND_ONLY: a governance grant is never deleted; revoke it instead.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' AND NOT _governed THEN
    RAISE EXCEPTION 'BESKT_GRANT_UNGOVERNED_WRITE: a governance grant is made only by beskt_grant_governance (platform admin, receipt, provenance), never by a direct INSERT.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF NOT _governed THEN
    RAISE EXCEPTION 'BESKT_GRANT_UNGOVERNED_WRITE: a governance grant is revoked only by beskt_revoke_governance (platform admin, receipt, reason), never by a direct UPDATE.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.revoked_at IS NOT NULL
     OR NEW.revoked_at IS NULL
     OR (to_jsonb(NEW) - 'revoked_at' - 'revoked_by' - 'revoke_reason' - 'revoke_operation_id')
        IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at' - 'revoked_by' - 'revoke_reason' - 'revoke_operation_id') THEN
    RAISE EXCEPTION 'BESKT_GRANT_APPEND_ONLY: the only permitted change to a governance grant is its revocation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_guard_grants_append_only() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER beskt_governance_grants_append_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.beskt_governance_grants
  FOR EACH ROW EXECUTE FUNCTION public.beskt_guard_grants_append_only();

-- The one predicate every gate check uses: an unrevoked grant for exactly
-- this kind, inside its validity window, right now.
CREATE OR REPLACE FUNCTION public.beskt_holds_grant(_user_id uuid, _grant_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.beskt_governance_grants g
     WHERE g.user_id = _user_id
       AND g.grant_kind = _grant_kind
       AND g.revoked_at IS NULL
       AND g.valid_from <= now()
       AND (g.valid_until IS NULL OR g.valid_until > now()));
$$;

-- INTERNAL: it answers for an arbitrary user id, so a browser principal could
-- otherwise enumerate who holds which gate. Every caller is SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.beskt_holds_grant(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beskt_holds_grant(uuid, text) TO service_role;

-- ###########################################################################
-- SECTION 5 -- Canonical SHA-256 content hash, neutrality rules and the
--              BESKT validator
-- ###########################################################################

-- 5.1  The fixed PEACE stage of every prompt kind. Pinned search_path like
--      every other function here (security_hardening S4.1).
CREATE OR REPLACE FUNCTION public.beskt_prompt_stage(_prompt_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _prompt_kind
    WHEN 'planning_from_role_relevance' THEN 'planning'
    WHEN 'purpose_explanation'          THEN 'engage_explain'
    WHEN 'process_explanation'          THEN 'engage_explain'
    WHEN 'voluntariness_notice'         THEN 'engage_explain'
    WHEN 'data_use_and_rights_notice'   THEN 'engage_explain'
    WHEN 'human_decision_notice'        THEN 'engage_explain'
    WHEN 'autonomy_offer'               THEN 'engage_explain'
    WHEN 'open_invitation'              THEN 'account'
    WHEN 'free_account'                 THEN 'account'
    WHEN 'behavioural_example'          THEN 'account'
    WHEN 'listening_reflection'         THEN 'account'
    WHEN 'specific_probe'               THEN 'account'
    WHEN 'context_opportunity'          THEN 'account'
    WHEN 'correction_opportunity'       THEN 'account'
    WHEN 'neutral_difference_exploration' THEN 'account'
    WHEN 'summary_confirmation'         THEN 'account'
    WHEN 'verification_need_disclosure' THEN 'closure'
    WHEN 'closure_next_step'            THEN 'closure'
    WHEN 'interviewer_self_review'      THEN 'evaluation'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.beskt_prompt_stage(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_prompt_stage(text) TO authenticated, service_role;


-- 5.2  Wording neutrality. TRUE only when a prompt's wording carries none of
--      the forms the method forbids: a leading form, a double question, a
--      guilt-presuming form, a coercive or deceptive form, or any reference
--      to a behavioural cue (tone, hesitation, gaze, face, voice, emotion,
--      body language) or to deception, lying or credibility. Enforced as a
--      CHECK on every prompt wording, so such a prompt cannot be represented.
CREATE OR REPLACE FUNCTION public.beskt_wording_is_neutral(_wording text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _wording IS NOT NULL
    -- one question at a time: a second question mark, or a second
    -- interrogative joined by "and" / "och", is two questions
    AND (SELECT count(*) FROM regexp_matches(_wording, '\?', 'g')) <= 1
    AND _wording !~* '\m(and|och) (why|what|how|when|where|who|which|varför|vad|hur|när|var|vem|vilken|vilka)\M'
    -- leading forms
    AND _wording !~* '(eller hur|inte sant|visst är det|du måste väl|är det inte så att|isn''t it|didn''t you|wasn''t it|\msurely\M|you must have|is it not true|wouldn''t you agree)'
    -- guilt-presuming forms
    AND _wording !~* '(varför (gjorde|följde|sa|ringde|rapporterade|anmälde|berättade) du inte|\merkänn\M|du ljuger|why (didn''t|did not) you|why did you not|admit that|you are lying|\mconfess\M)'
    -- coercive or deceptive forms
    AND _wording !~* '(vi vet redan|vi har (bevis|uppgifter|information)|andra har (sagt|uppgett|berättat)|om du inte (svarar|berättar)|we already know|we have (evidence|information|proof)|others have (said|told)|if you (don''t|do not) (answer|tell))'
    -- behavioural-cue and deception claims
    AND _wording !~* '(kroppsspråk|body language|tonfall|tone of voice|\mgaze\M|ögonkontakt|eye contact|ansiktsuttryck|facial expression|micro-?expression|mikrouttryck|voice stress|röststress|\mhesitat|\mtvekan\M|\mnervous|\mnervös|\mdeceptive|\mdeception|lie detect|\mlying\M|\mljuger\M|\mlögn|trovärdig|\mcredib|\mtruthful)';
$$;

REVOKE ALL ON FUNCTION public.beskt_wording_is_neutral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_wording_is_neutral(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.beskt_wording_is_neutral(text) IS
  'The wording rule for governed BESKT prompts. A leading, double-barrelled, '
  'guilt-presuming, coercive or deceptive form, or any claim about tone, '
  'hesitation, gaze, face, voice, emotion, body language, deception or '
  'credibility, is not representable.';

-- Now that the neutrality rule exists, bind it to the prompt wording.
ALTER TABLE public.beskt_prompts
  ADD CONSTRAINT beskt_prompts_wording_sv_neutral_check
  CHECK (wording_sv IS NULL OR public.beskt_wording_is_neutral(wording_sv)),
  ADD CONSTRAINT beskt_prompts_wording_en_neutral_check
  CHECK (wording_en IS NULL OR public.beskt_wording_is_neutral(wording_en));


-- 5.3  Does an anchor text CLAIM that a behavioural cue indicates deception?
--      An anchor may legitimately say "do not infer credibility from tone";
--      it may never say "hesitation indicates deception". The rule is a
--      cue word AND a deception/credibility word in the same sentence with no
--      negation before the deception word.
CREATE OR REPLACE FUNCTION public.beskt_text_claims_deception_cue(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _text IS NOT NULL AND EXISTS (
    SELECT 1
      FROM regexp_split_to_table(_text, '[.!?]') AS s(sentence)
     WHERE s.sentence ~* '(kroppsspråk|body language|tonfall|tone of voice|\mgaze\M|ögonkontakt|eye contact|ansiktsuttryck|facial expression|micro-?expression|mikrouttryck|voice stress|röststress|\mhesitat|\mtvekan\M|\mnervous|\mnervös|\memotion|\mkänslo)'
       AND s.sentence ~* '(\mdecepti|\mdeceit|\mlying\M|\mlie\M|\mljuger\M|\mlögn|\mtruthful|\mcredib|trovärdig|sanningsenlig)'
       AND s.sentence !~* '(\mnot\M|\mnever\M|\mno\M|\minte\M|\maldrig\M|\mej\M|\mdo not\M|\mdoes not\M|\mmay not\M|\mmust not\M|\mcannot\M|\mfår inte\M|\mska inte\M)');
$$;

REVOKE ALL ON FUNCTION public.beskt_text_claims_deception_cue(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_text_claims_deception_cue(text) TO authenticated, service_role;


-- 5.4  The canonical representation: TYPED. A jsonb document with named
--      fields, so no delimiter can be confused with content: 'a|b' + 'c'
--      and 'a' + 'b|c' are different documents. Every collection is ordered
--      on STABLE KEYS (never insertion order or ids), every text[] is sorted,
--      and NULL is kept as JSON null, distinct from ''. jsonb serialises with
--      sorted object keys, so the text the hash covers is canonical by
--      construction. Lifecycle columns (status, revision, review cycle,
--      actors, timestamps, validation_label, release_scope) are EXCLUDED, so
--      publishing a version does not change its hash and an approval survives
--      the transition it authorised.
-- 5.3b Content that instructs scoring, rating, grading, ranking, a
--      suitability or hiring verdict, pass/fail or a recommendation -- in the
--      Swedish and English the product uses. Governed items, prompts and
--      evidence anchors carrying such an instruction block publication:
--      BESKT produces a basis for a human decision, never a score, and the
--      Evaluation step is interviewer reflection only.
CREATE OR REPLACE FUNCTION public.beskt_text_instructs_scoring(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _text IS NOT NULL AND (
    -- English
    _text ~* '\m(rate|rates|rated|rating|ratings|score|scores|scored|scoring|grade|grades|graded|grading|rank|ranks|ranked|ranking|suitability|suitable|unsuitable|verdict|pass/fail|pass or fail|passes|passed|fails|failed|recommend|recommends|recommended|recommendation|hire|hireable|hiring decision|shortlist|shortlisted)\M'
    OR _text ~* '\m(on a scale|scale of|scale from|from|between)\s+\d+\s*(to|-|–|and)\s*\d+'
    OR _text ~* '\d+\s*out of\s*\d+'
    OR _text ~* '(\d+\s*points?\M|\mpoints?\s+(scale|out of|total)\M|\m(award|assign|give|deduct|earn|allocate)\w*\s+points?\M)'
    -- Swedish
    OR _text ~* '\m(betyg|betygsätt\w*|betygsatt\w*|poäng\w*|gradera\w*|graderas|ranka\w*|rankad\w*|rangordn\w*|lämplighet\w*|lämplig|olämplig\w*|omdöme\w*|utlåtande\w*|godkänd\w*|godkänn\w*|underkänd\w*|underkänn\w*|rekommend\w*|anställ\w*|verdikt\w*|shortlist\w*)\M'
    OR _text ~* '\m(på en skala|skala|från|mellan)\s+\d+\s*(till|-|–|och)\s*\d+');
$$;

REVOKE ALL ON FUNCTION public.beskt_text_instructs_scoring(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_text_instructs_scoring(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.beskt_sorted_array(_arr text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce((SELECT jsonb_agg(x ORDER BY x) FROM unnest(_arr) AS u(x)), '[]'::jsonb);
$$;

REVOKE ALL ON FUNCTION public.beskt_sorted_array(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_sorted_array(text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.beskt_canonical_content(_method_version_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'schema', 'beskt_canonical_content_v2',
    'version', (
      SELECT jsonb_build_object(
        'mode', v.mode, 'locale_sv', v.locale_sv, 'locale_en', v.locale_en,
        'source_reference', v.source_reference, 'source_document_version', v.source_document_version,
        'content_provenance', v.content_provenance, 'summary_sv', v.summary_sv, 'summary_en', v.summary_en)
        FROM public.beskt_method_versions v WHERE v.id = _method_version_id),
    'exposure_profiles', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'profile_key', p.profile_key, 'display_order', p.display_order, 'exposure_area', p.exposure_area,
          'duties_sv', p.duties_sv, 'duties_en', p.duties_en,
          'role_relevance_rationale_sv', p.role_relevance_rationale_sv,
          'role_relevance_rationale_en', p.role_relevance_rationale_en,
          'permitted_mode', p.permitted_mode, 'owning_review_role', p.owning_review_role,
          'jurisdiction_reference', p.jurisdiction_reference, 'lawful_basis_reference', p.lawful_basis_reference,
          'retention_class', p.retention_class, 'access_class', p.access_class,
          'security_sensitive_role_attestation_reference', p.security_sensitive_role_attestation_reference,
          'content_provenance', p.content_provenance, 'source_reference', p.source_reference)
        ORDER BY p.profile_key)
        FROM public.beskt_exposure_profiles p WHERE p.method_version_id = _method_version_id), '[]'::jsonb),
    'activation_requirements', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'requirement_key', a.requirement_key, 'satisfied_by_role', a.satisfied_by_role,
          'statement_sv', a.statement_sv, 'statement_en', a.statement_en)
        ORDER BY a.requirement_key)
        FROM public.beskt_activation_requirements a WHERE a.method_version_id = _method_version_id), '[]'::jsonb),
    'sections', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'section_key', s.section_key, 'display_order', s.display_order, 'phase', s.phase,
          'title_sv', s.title_sv, 'title_en', s.title_en)
        ORDER BY s.section_key)
        FROM public.beskt_sections s WHERE s.method_version_id = _method_version_id), '[]'::jsonb),
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', i.item_key, 'section_key', s.section_key, 'profile_key', p.profile_key,
          'display_order', i.display_order,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en,
          'permitted_mode', i.permitted_mode, 'phase', i.phase, 'answer_type', i.answer_type,
          'requiredness', i.requiredness, 'discuss_orally_allowed', i.discuss_orally_allowed,
          'sensitivity_class', i.sensitivity_class, 'access_class', i.access_class,
          'content_provenance', i.content_provenance, 'source_reference', i.source_reference,
          'prohibited_inferences', public.beskt_sorted_array(i.prohibited_inferences))
        ORDER BY i.item_key)
        FROM public.beskt_items i
        JOIN public.beskt_sections s ON s.id = i.section_id
        JOIN public.beskt_exposure_profiles p ON p.id = i.exposure_profile_id
       WHERE i.method_version_id = _method_version_id), '[]'::jsonb),
    'options', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', i.item_key, 'option_key', o.option_key, 'display_order', o.display_order,
          'label_sv', o.label_sv, 'label_en', o.label_en)
        ORDER BY i.item_key, o.option_key)
        FROM public.beskt_item_options o
        JOIN public.beskt_items i ON i.id = o.item_id
       WHERE i.method_version_id = _method_version_id), '[]'::jsonb),
    'prompts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'prompt_key', pr.prompt_key, 'profile_key', p.profile_key, 'item_key', i.item_key,
          'display_order', pr.display_order, 'prompt_kind', pr.prompt_kind, 'peace_stage', pr.peace_stage,
          'addressee', pr.addressee, 'question_form', pr.question_form,
          'permitted_probe_bases', public.beskt_sorted_array(pr.permitted_probe_bases),
          'permitted_mode', pr.permitted_mode,
          'wording_sv', pr.wording_sv, 'wording_en', pr.wording_en,
          'content_provenance', pr.content_provenance, 'source_reference', pr.source_reference)
        ORDER BY pr.prompt_key)
        FROM public.beskt_prompts pr
        JOIN public.beskt_exposure_profiles p ON p.id = pr.exposure_profile_id
        LEFT JOIN public.beskt_items i ON i.id = pr.item_id
       WHERE pr.method_version_id = _method_version_id), '[]'::jsonb),
    'routing_rules', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'rule_key', r.rule_key, 'evaluation_order', r.evaluation_order, 'applies_mode', r.applies_mode,
          'source_item_key', si.item_key, 'condition_kind', r.condition_kind,
          'condition_option_key', o.option_key, 'condition_boolean', r.condition_boolean,
          'action', r.action, 'target_item_key', ti.item_key)
        ORDER BY r.rule_key)
        FROM public.beskt_routing_rules r
        JOIN public.beskt_items si ON si.id = r.source_item_id
        JOIN public.beskt_items ti ON ti.id = r.target_item_id
        LEFT JOIN public.beskt_item_options o ON o.id = r.condition_option_id
       WHERE r.method_version_id = _method_version_id), '[]'::jsonb),
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
          'prohibited_inferences', public.beskt_sorted_array(a.prohibited_inferences),
          'required_next_action', a.required_next_action)
        ORDER BY a.evidence_state)
        FROM public.beskt_evidence_anchors a WHERE a.method_version_id = _method_version_id), '[]'::jsonb),
    'observation_fields', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'field_key', f.field_key, 'ordinal', f.ordinal, 'recorded_by', f.recorded_by,
          'is_judgement', f.is_judgement, 'label_sv', f.label_sv, 'label_en', f.label_en,
          'definition_sv', f.definition_sv, 'definition_en', f.definition_en)
        ORDER BY f.field_key)
        FROM public.beskt_observation_fields f WHERE f.method_version_id = _method_version_id), '[]'::jsonb));
$$;

-- INTERNAL: the canonical document IS the governed content, so it is not
-- handed to browser principals. Callers below are SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.beskt_canonical_content(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beskt_canonical_content(uuid) TO service_role;

-- 5.5  The hash: core sha256 (pg_catalog, not pgcrypto) over the canonical
--      UTF-8 bytes, hex encoded.
CREATE OR REPLACE FUNCTION public.beskt_method_content_hash(_method_version_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT encode(sha256(convert_to(public.beskt_canonical_content(_method_version_id)::text, 'UTF8')), 'hex');
$$;

-- INTERNAL: computed and stored by the governed RPCs; a reader learns the
-- hash from the version row or the read contract, never by probing ids.
REVOKE ALL ON FUNCTION public.beskt_method_content_hash(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beskt_method_content_hash(uuid) TO service_role;

COMMENT ON FUNCTION public.beskt_method_content_hash(uuid) IS
  'Deterministic SHA-256 over the typed canonical jsonb document of a BESKT '
  'method version: named fields, stable-key order, sorted arrays, explicit '
  'nulls. Insertion order and delimiter characters cannot change it; any '
  'governed field can. Excludes every lifecycle column.';


-- 5.6  The validator. One row per blocking reason; empty means publishable.
--      The submit RPC calls it with _require_reviews = false (content
--      completeness) and the publish RPC with true (completeness AND all five
--      gates approved at the CURRENT hash), inside the publishing transaction.
CREATE OR REPLACE FUNCTION public.beskt_method_validate(
  _method_version_id uuid,
  _require_reviews boolean DEFAULT true)
RETURNS TABLE (code text, severity text, message text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v public.beskt_method_versions%ROWTYPE;
  _hash text;
  _gate text;
  _state text;
  _kind text;
  _field text;
  _rec record;
  _evidence_states text[] := ARRAY[
    'unaddressed', 'clarification_needed', 'sufficiently_clarified',
    'external_verification_needed', 'conflicting_information',
    'insufficient_basis', 'not_applicable'];
  _review_gates text[] := ARRAY[
    'personnel_security', 'senior_hr', 'recruitment',
    'employment_privacy_legal', 'data_protection'];
  _required_prompt_kinds text[] := ARRAY[
    'planning_from_role_relevance',
    'purpose_explanation', 'process_explanation', 'voluntariness_notice',
    'human_decision_notice',
    'open_invitation', 'free_account', 'behavioural_example', 'listening_reflection',
    'context_opportunity', 'correction_opportunity',
    'neutral_difference_exploration', 'summary_confirmation',
    'closure_next_step', 'interviewer_self_review'];
  _observation_fields text[] := ARRAY[
    'fact', 'source_provenance', 'role_exposure_link',
    'interviewer_interpretation', 'candidate_explanation', 'counter_evidence',
    'protective_factor', 'verification_need', 'candidate_correction',
    'sensitivity_access_class'];
BEGIN
  -- Blocking reasons name governed content, so only governance readers see
  -- them. The lifecycle RPCs call this as an editor or publisher.
  IF auth.uid() IS NULL OR NOT public.scp_interview_can_read(auth.uid()) THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHORISED: validating BESKT method content requires a platform content role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'VERSION_NOT_FOUND'::text, 'blocking'::text, 'The method version does not exist.'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.scp_interview_packs p
                  WHERE p.id = _v.pack_id AND p.pack_kind = 'beskt_method') THEN
    RETURN QUERY SELECT 'PACK_KIND_NOT_BESKT'::text, 'blocking'::text,
      'The BESKT validator answers for BESKT method packs only.'::text;
    RETURN;
  END IF;

  -- ---- exposure profiles ---------------------------------------------------
  IF (SELECT count(*) FROM public.beskt_exposure_profiles p WHERE p.method_version_id = _method_version_id) = 0 THEN
    RETURN QUERY SELECT 'NO_EXPOSURE_PROFILES'::text, 'blocking'::text,
      'The method documents no role-exposure profile, so no question can be justified.'::text;
  END IF;

  IF EXISTS (SELECT 1 FROM (
      SELECT p.display_order, row_number() OVER (ORDER BY p.display_order) AS expected
        FROM public.beskt_exposure_profiles p WHERE p.method_version_id = _method_version_id) t
     WHERE t.display_order <> t.expected) THEN
    RETURN QUERY SELECT 'PROFILE_ORDER_NOT_CONTIGUOUS'::text, 'blocking'::text,
      'Exposure profile display_order must run 1..n with no gaps and no duplicates.'::text;
  END IF;

  RETURN QUERY
    SELECT 'PROFILE_TEXT_INCOMPLETE', 'blocking',
           format('Exposure profile %s lacks complete Swedish and English duties and role-relevance rationale.', p.profile_key)
      FROM public.beskt_exposure_profiles p
     WHERE p.method_version_id = _method_version_id
       AND (length(btrim(coalesce(p.duties_sv, ''))) = 0 OR length(btrim(coalesce(p.duties_en, ''))) = 0
         OR length(btrim(coalesce(p.role_relevance_rationale_sv, ''))) = 0
         OR length(btrim(coalesce(p.role_relevance_rationale_en, ''))) = 0);

  RETURN QUERY
    SELECT 'PROFILE_LAWFUL_BASIS_MISSING', 'blocking',
           format('Exposure profile %s records no lawful-basis reference.', p.profile_key)
      FROM public.beskt_exposure_profiles p
     WHERE p.method_version_id = _method_version_id
       AND length(btrim(coalesce(p.lawful_basis_reference, ''))) = 0;

  RETURN QUERY
    SELECT 'PROFILE_PROVENANCE_MISSING', 'blocking',
           format('Exposure profile %s records no source reference.', p.profile_key)
      FROM public.beskt_exposure_profiles p
     WHERE p.method_version_id = _method_version_id
       AND length(btrim(coalesce(p.source_reference, ''))) = 0;

  RETURN QUERY
    SELECT 'PROFILE_MODE_EXCEEDS_VERSION', 'blocking',
           format('Exposure profile %s is security_vetting_support but the version is recruitment_support.', p.profile_key)
      FROM public.beskt_exposure_profiles p
     WHERE p.method_version_id = _method_version_id
       AND p.permitted_mode = 'security_vetting_support'
       AND _v.mode <> 'security_vetting_support';

  -- ---- the three security-vetting activation requirements ----------------
  -- Each one is independently fail-closed. A security-vetting version
  -- without all three, exactly as PR 1 names them, is not publishable.
  IF _v.mode = 'security_vetting_support' THEN
    IF NOT EXISTS (SELECT 1 FROM public.beskt_activation_requirements a
                    WHERE a.method_version_id = _method_version_id
                      AND a.requirement_key = 'security_sensitive_role_attested')
       OR EXISTS (SELECT 1 FROM public.beskt_exposure_profiles p
                   WHERE p.method_version_id = _method_version_id
                     AND p.permitted_mode = 'security_vetting_support'
                     AND length(btrim(coalesce(p.security_sensitive_role_attestation_reference, ''))) = 0) THEN
      RETURN QUERY SELECT 'SV_SECURITY_SENSITIVE_ROLE_NOT_ATTESTED'::text, 'blocking'::text,
        'Security-vetting support requires the security-sensitive-role attestation requirement and an attestation reference on every security-vetting exposure profile.'::text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.beskt_activation_requirements a
                    WHERE a.method_version_id = _method_version_id
                      AND a.requirement_key = 'lawful_basis_recorded') THEN
      RETURN QUERY SELECT 'SV_LAWFUL_BASIS_NOT_RECORDED'::text, 'blocking'::text,
        'Security-vetting support requires the lawful-basis-recorded requirement.'::text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.beskt_activation_requirements a
                    WHERE a.method_version_id = _method_version_id
                      AND a.requirement_key = 'authorised_security_owner_assigned'
                      AND a.satisfied_by_role = 'authorised_security_function') THEN
      RETURN QUERY SELECT 'SV_AUTHORISED_SECURITY_OWNER_NOT_ASSIGNED'::text, 'blocking'::text,
        'Security-vetting support requires the authorised-security-owner requirement, satisfiable only by the authorised security function.'::text;
    END IF;
  END IF;

  -- ---- sections -------------------------------------------------------------
  IF (SELECT count(*) FROM public.beskt_sections s WHERE s.method_version_id = _method_version_id) = 0 THEN
    RETURN QUERY SELECT 'NO_SECTIONS'::text, 'blocking'::text, 'The questionnaire has no sections.'::text;
  END IF;

  IF EXISTS (SELECT 1 FROM (
      SELECT s.display_order, row_number() OVER (ORDER BY s.display_order) AS expected
        FROM public.beskt_sections s WHERE s.method_version_id = _method_version_id) t
     WHERE t.display_order <> t.expected) THEN
    RETURN QUERY SELECT 'SECTION_ORDER_NOT_CONTIGUOUS'::text, 'blocking'::text,
      'Section display_order must run 1..n with no gaps and no duplicates.'::text;
  END IF;

  RETURN QUERY
    SELECT 'SECTION_TEXT_INCOMPLETE', 'blocking',
           format('Section %s lacks a Swedish or English title.', s.section_key)
      FROM public.beskt_sections s
     WHERE s.method_version_id = _method_version_id
       AND (length(btrim(coalesce(s.title_sv, ''))) = 0 OR length(btrim(coalesce(s.title_en, ''))) = 0);

  -- ---- items ------------------------------------------------------------------
  IF (SELECT count(*) FROM public.beskt_items i WHERE i.method_version_id = _method_version_id) = 0 THEN
    RETURN QUERY SELECT 'NO_ITEMS'::text, 'blocking'::text, 'The questionnaire has no items.'::text;
  END IF;

  IF EXISTS (SELECT 1 FROM (
      SELECT i.display_order,
             row_number() OVER (PARTITION BY i.section_id ORDER BY i.display_order) AS expected
        FROM public.beskt_items i WHERE i.method_version_id = _method_version_id) t
     WHERE t.display_order <> t.expected) THEN
    RETURN QUERY SELECT 'ITEM_ORDER_NOT_CONTIGUOUS'::text, 'blocking'::text,
      'Item display_order must run 1..n within each section with no gaps and no duplicates.'::text;
  END IF;

  RETURN QUERY
    SELECT 'ITEM_WORDING_SV_MISSING', 'blocking', format('Item %s has no Swedish wording.', i.item_key)
      FROM public.beskt_items i
     WHERE i.method_version_id = _method_version_id AND length(btrim(coalesce(i.wording_sv, ''))) = 0;

  RETURN QUERY
    SELECT 'ITEM_WORDING_EN_MISSING', 'blocking', format('Item %s has no English wording.', i.item_key)
      FROM public.beskt_items i
     WHERE i.method_version_id = _method_version_id AND length(btrim(coalesce(i.wording_en, ''))) = 0;

  RETURN QUERY
    SELECT 'ITEM_PURPOSE_MISSING', 'blocking',
           format('Item %s does not state, in both languages, why it is asked.', i.item_key)
      FROM public.beskt_items i
     WHERE i.method_version_id = _method_version_id
       AND (length(btrim(coalesce(i.purpose_sv, ''))) = 0 OR length(btrim(coalesce(i.purpose_en, ''))) = 0);

  RETURN QUERY
    SELECT 'ITEM_MODE_EXCEEDS_VERSION', 'blocking',
           format('Item %s is security_vetting_support but the version is recruitment_support.', i.item_key)
      FROM public.beskt_items i
     WHERE i.method_version_id = _method_version_id
       AND i.permitted_mode = 'security_vetting_support' AND _v.mode <> 'security_vetting_support';

  RETURN QUERY
    SELECT 'ITEM_MODE_EXCEEDS_PROFILE', 'blocking',
           format('Item %s is security_vetting_support but its exposure profile %s permits recruitment_support only.', i.item_key, p.profile_key)
      FROM public.beskt_items i JOIN public.beskt_exposure_profiles p ON p.id = i.exposure_profile_id
     WHERE i.method_version_id = _method_version_id
       AND i.permitted_mode = 'security_vetting_support' AND p.permitted_mode <> 'security_vetting_support';

  RETURN QUERY
    SELECT 'ITEM_PHASE_MISMATCH', 'blocking',
           format('Item %s is in phase %s but its section is in phase %s.', i.item_key, i.phase, s.phase)
      FROM public.beskt_items i JOIN public.beskt_sections s ON s.id = i.section_id
     WHERE i.method_version_id = _method_version_id AND i.phase <> s.phase;

  RETURN QUERY
    SELECT 'ITEM_PROVENANCE_MISSING', 'blocking', format('Item %s records no source reference.', i.item_key)
      FROM public.beskt_items i
     WHERE i.method_version_id = _method_version_id AND length(btrim(coalesce(i.source_reference, ''))) = 0;

  RETURN QUERY
    SELECT 'ITEM_PROHIBITED_INFERENCES_MISSING', 'blocking',
           format('Item %s does not state what may not be inferred from its answer.', i.item_key)
      FROM public.beskt_items i
     WHERE i.method_version_id = _method_version_id AND coalesce(cardinality(i.prohibited_inferences), 0) = 0;

  RETURN QUERY
    SELECT 'ITEM_CHOICE_WITHOUT_OPTIONS', 'blocking',
           format('Choice item %s needs at least two options.', i.item_key)
      FROM public.beskt_items i
     WHERE i.method_version_id = _method_version_id
       AND i.answer_type IN ('single_choice', 'multi_choice')
       AND (SELECT count(*) FROM public.beskt_item_options o WHERE o.item_id = i.id) < 2;

  RETURN QUERY
    SELECT 'ITEM_OPTIONS_ON_NON_CHOICE', 'blocking',
           format('Item %s is %s and cannot carry options.', i.item_key, i.answer_type)
      FROM public.beskt_items i
     WHERE i.method_version_id = _method_version_id
       AND i.answer_type NOT IN ('single_choice', 'multi_choice')
       AND EXISTS (SELECT 1 FROM public.beskt_item_options o WHERE o.item_id = i.id);

  IF EXISTS (SELECT 1 FROM (
      SELECT o.display_order,
             row_number() OVER (PARTITION BY o.item_id ORDER BY o.display_order) AS expected
        FROM public.beskt_item_options o JOIN public.beskt_items i ON i.id = o.item_id
       WHERE i.method_version_id = _method_version_id) t
     WHERE t.display_order <> t.expected) THEN
    RETURN QUERY SELECT 'OPTION_ORDER_NOT_CONTIGUOUS'::text, 'blocking'::text,
      'Option display_order must run 1..n within each item.'::text;
  END IF;

  RETURN QUERY
    SELECT 'OPTION_TEXT_INCOMPLETE', 'blocking',
           format('Option %s of item %s lacks a Swedish or English label.', o.option_key, i.item_key)
      FROM public.beskt_item_options o JOIN public.beskt_items i ON i.id = o.item_id
     WHERE i.method_version_id = _method_version_id
       AND (length(btrim(coalesce(o.label_sv, ''))) = 0 OR length(btrim(coalesce(o.label_en, ''))) = 0);

  -- A non-answer is a response STATE, never an option. An option that encodes
  -- "prefer not to say" would let a routing rule read an omission.
  RETURN QUERY
    SELECT 'OPTION_KEY_ENCODES_NON_ANSWER', 'blocking',
           format('Option %s of item %s encodes a non-answer; omission and discuss-orally are neutral response states, not options.', o.option_key, i.item_key)
      FROM public.beskt_item_options o JOIN public.beskt_items i ON i.id = o.item_id
     WHERE i.method_version_id = _method_version_id
       AND o.option_key ~ '(prefer_not|decline|no_answer|discuss|omit|skip|rather_not)';

  -- ---- prompts ----------------------------------------------------------------
  IF (SELECT count(*) FROM public.beskt_prompts pr WHERE pr.method_version_id = _method_version_id) = 0 THEN
    RETURN QUERY SELECT 'NO_PROMPTS'::text, 'blocking'::text, 'The method has no governed prompts.'::text;
  END IF;

  RETURN QUERY
    SELECT 'PROMPT_TEXT_INCOMPLETE', 'blocking',
           format('Prompt %s lacks Swedish or English wording.', pr.prompt_key)
      FROM public.beskt_prompts pr
     WHERE pr.method_version_id = _method_version_id
       AND (length(btrim(coalesce(pr.wording_sv, ''))) = 0 OR length(btrim(coalesce(pr.wording_en, ''))) = 0);

  RETURN QUERY
    SELECT 'PROMPT_WORDING_NOT_NEUTRAL', 'blocking',
           format('Prompt %s is not neutral in form.', pr.prompt_key)
      FROM public.beskt_prompts pr
     WHERE pr.method_version_id = _method_version_id
       AND ((pr.wording_sv IS NOT NULL AND NOT public.beskt_wording_is_neutral(pr.wording_sv))
         OR (pr.wording_en IS NOT NULL AND NOT public.beskt_wording_is_neutral(pr.wording_en)));

  RETURN QUERY
    SELECT 'PROMPT_MODE_EXCEEDS_VERSION', 'blocking',
           format('Prompt %s is security_vetting_support but the version is recruitment_support.', pr.prompt_key)
      FROM public.beskt_prompts pr
     WHERE pr.method_version_id = _method_version_id
       AND pr.permitted_mode = 'security_vetting_support' AND _v.mode <> 'security_vetting_support';

  RETURN QUERY
    SELECT 'PROMPT_MODE_EXCEEDS_PROFILE', 'blocking',
           format('Prompt %s is security_vetting_support but its exposure profile %s permits recruitment_support only.', pr.prompt_key, p.profile_key)
      FROM public.beskt_prompts pr JOIN public.beskt_exposure_profiles p ON p.id = pr.exposure_profile_id
     WHERE pr.method_version_id = _method_version_id
       AND pr.permitted_mode = 'security_vetting_support' AND p.permitted_mode <> 'security_vetting_support';

  RETURN QUERY
    SELECT 'PROMPT_CROSS_PROFILE', 'blocking',
           format('Prompt %s probes an item of another exposure profile.', pr.prompt_key)
      FROM public.beskt_prompts pr JOIN public.beskt_items i ON i.id = pr.item_id
     WHERE pr.method_version_id = _method_version_id
       AND i.exposure_profile_id <> pr.exposure_profile_id;

  RETURN QUERY
    SELECT 'PROMPT_PROVENANCE_MISSING', 'blocking', format('Prompt %s records no source reference.', pr.prompt_key)
      FROM public.beskt_prompts pr
     WHERE pr.method_version_id = _method_version_id AND length(btrim(coalesce(pr.source_reference, ''))) = 0;

  -- A probe must say what it may be grounded in.
  RETURN QUERY
    SELECT 'PROMPT_PROBE_WITHOUT_BASIS', 'blocking',
           format('Prompt %s (%s) names no permitted basis; a probe is grounded in a submitted answer, a documented role requirement, a candidate document or a candidate correction.', pr.prompt_key, pr.prompt_kind)
      FROM public.beskt_prompts pr
     WHERE pr.method_version_id = _method_version_id
       AND pr.prompt_kind IN ('specific_probe', 'behavioural_example', 'neutral_difference_exploration')
       AND coalesce(cardinality(pr.permitted_probe_bases), 0) = 0;

  -- Every conduct step of the method is present at least once.
  FOREACH _kind IN ARRAY _required_prompt_kinds LOOP
    IF NOT EXISTS (SELECT 1 FROM public.beskt_prompts pr
                    WHERE pr.method_version_id = _method_version_id AND pr.prompt_kind = _kind) THEN
      RETURN QUERY SELECT 'PROMPT_REQUIRED_KIND_MISSING'::text, 'blocking'::text,
        format('The method has no %s prompt.', _kind);
    END IF;
  END LOOP;

  -- Ordering within each exposure profile: open and free account before any
  -- specific probe, a behavioural example before detail testing, context and
  -- correction opportunities after the last probe, and the summary last.
  FOR _rec IN SELECT p.id, p.profile_key FROM public.beskt_exposure_profiles p
               WHERE p.method_version_id = _method_version_id LOOP
    IF EXISTS (SELECT 1 FROM public.beskt_prompts probe
                WHERE probe.method_version_id = _method_version_id AND probe.exposure_profile_id = _rec.id
                  AND probe.prompt_kind = 'specific_probe'
                  AND NOT EXISTS (SELECT 1 FROM public.beskt_prompts o
                                   WHERE o.exposure_profile_id = _rec.id
                                     AND o.prompt_kind IN ('open_invitation', 'free_account')
                                     AND o.display_order < probe.display_order)) THEN
      RETURN QUERY SELECT 'PROMPT_PROBE_BEFORE_OPEN'::text, 'blocking'::text,
        format('Profile %s has a specific probe with no open invitation or free account before it.', _rec.profile_key);
    END IF;
    IF EXISTS (SELECT 1 FROM public.beskt_prompts probe
                WHERE probe.method_version_id = _method_version_id AND probe.exposure_profile_id = _rec.id
                  AND probe.prompt_kind = 'specific_probe'
                  AND NOT EXISTS (SELECT 1 FROM public.beskt_prompts o
                                   WHERE o.exposure_profile_id = _rec.id
                                     AND o.prompt_kind = 'behavioural_example'
                                     AND o.display_order < probe.display_order)) THEN
      RETURN QUERY SELECT 'PROMPT_PROBE_BEFORE_EXAMPLE'::text, 'blocking'::text,
        format('Profile %s tests detail before asking for a behavioural example.', _rec.profile_key);
    END IF;
    IF EXISTS (SELECT 1 FROM public.beskt_prompts probe
                WHERE probe.method_version_id = _method_version_id AND probe.exposure_profile_id = _rec.id
                  AND probe.prompt_kind = 'specific_probe')
       AND NOT EXISTS (SELECT 1 FROM public.beskt_prompts o
                        WHERE o.exposure_profile_id = _rec.id AND o.prompt_kind = 'context_opportunity'
                          AND o.display_order > (SELECT max(x.display_order) FROM public.beskt_prompts x
                                                  WHERE x.exposure_profile_id = _rec.id AND x.prompt_kind = 'specific_probe')) THEN
      RETURN QUERY SELECT 'PROMPT_CONTEXT_OPPORTUNITY_MISSING'::text, 'blocking'::text,
        format('Profile %s probes without a later opportunity to explain context.', _rec.profile_key);
    END IF;
    IF EXISTS (SELECT 1 FROM public.beskt_prompts probe
                WHERE probe.method_version_id = _method_version_id AND probe.exposure_profile_id = _rec.id
                  AND probe.prompt_kind = 'specific_probe')
       AND NOT EXISTS (SELECT 1 FROM public.beskt_prompts o
                        WHERE o.exposure_profile_id = _rec.id AND o.prompt_kind = 'correction_opportunity'
                          AND o.display_order > (SELECT max(x.display_order) FROM public.beskt_prompts x
                                                  WHERE x.exposure_profile_id = _rec.id AND x.prompt_kind = 'specific_probe')) THEN
      RETURN QUERY SELECT 'PROMPT_CORRECTION_OPPORTUNITY_MISSING'::text, 'blocking'::text,
        format('Profile %s probes without a later opportunity to correct facts.', _rec.profile_key);
    END IF;
    IF EXISTS (SELECT 1 FROM public.beskt_prompts s
                WHERE s.method_version_id = _method_version_id AND s.exposure_profile_id = _rec.id
                  AND s.prompt_kind = 'summary_confirmation'
                  AND EXISTS (SELECT 1 FROM public.beskt_prompts o
                               WHERE o.exposure_profile_id = _rec.id AND o.peace_stage = 'account'
                                 AND o.prompt_kind <> 'summary_confirmation'
                                 AND o.display_order > s.display_order)) THEN
      RETURN QUERY SELECT 'PROMPT_SUMMARY_NOT_LAST'::text, 'blocking'::text,
        format('Profile %s continues the account after the summary confirmation.', _rec.profile_key);
    END IF;
  END LOOP;

  -- ---- routing ------------------------------------------------------------------
  RETURN QUERY
    SELECT 'ROUTE_MODE_EXCEEDS_VERSION', 'blocking',
           format('Rule %s applies to security_vetting_support but the version is recruitment_support.', r.rule_key)
      FROM public.beskt_routing_rules r
     WHERE r.method_version_id = _method_version_id
       AND r.applies_mode = 'security_vetting_support' AND _v.mode <> 'security_vetting_support';

  -- Routing never crosses exposure profiles, re-proven on the stored graph.
  RETURN QUERY
    SELECT 'ROUTE_CROSS_PROFILE', 'blocking',
           format('Rule %s connects items of two exposure profiles.', r.rule_key)
      FROM public.beskt_routing_rules r
      JOIN public.beskt_items si ON si.id = r.source_item_id
      JOIN public.beskt_items ti ON ti.id = r.target_item_id
     WHERE r.method_version_id = _method_version_id
       AND si.exposure_profile_id <> ti.exposure_profile_id;

  -- The hard boundary, re-proven on the stored graph: no recruitment-support
  -- rule reaches or reads security-vetting-only content.
  RETURN QUERY
    SELECT 'ROUTE_RECRUITMENT_INTO_SECURITY_VETTING', 'blocking',
           format('Rule %s routes recruitment support into security-vetting-only content.', r.rule_key)
      FROM public.beskt_routing_rules r
      JOIN public.beskt_items si ON si.id = r.source_item_id
      JOIN public.beskt_items ti ON ti.id = r.target_item_id
     WHERE r.method_version_id = _method_version_id
       AND r.applies_mode = 'recruitment_support'
       AND (ti.permitted_mode = 'security_vetting_support' OR si.permitted_mode = 'security_vetting_support');

  -- Cycles in the dependency graph (target depends on source).
  IF EXISTS (
    WITH RECURSIVE walk AS (
      SELECT r.source_item_id AS origin, r.target_item_id AS node, 1 AS depth
        FROM public.beskt_routing_rules r WHERE r.method_version_id = _method_version_id
      UNION ALL
      SELECT w.origin, r.target_item_id, w.depth + 1
        FROM walk w JOIN public.beskt_routing_rules r
          ON r.source_item_id = w.node AND r.method_version_id = _method_version_id
       WHERE w.depth < 64 AND w.node <> w.origin)
    SELECT 1 FROM walk WHERE walk.node = walk.origin) THEN
    RETURN QUERY SELECT 'ROUTE_CYCLE'::text, 'blocking'::text,
      'The routing rules contain a cycle.'::text;
  END IF;

  -- Dead targets: an item shown only by rules whose source can itself never
  -- be reached.
  RETURN QUERY
    WITH RECURSIVE conditional AS (
      SELECT DISTINCT r.target_item_id AS item_id
        FROM public.beskt_routing_rules r
       WHERE r.method_version_id = _method_version_id AND r.action = 'show'),
    reachable AS (
      SELECT i.id AS item_id FROM public.beskt_items i
       WHERE i.method_version_id = _method_version_id
         AND i.id NOT IN (SELECT c.item_id FROM conditional c)
      UNION
      SELECT r.target_item_id
        FROM public.beskt_routing_rules r JOIN reachable re ON re.item_id = r.source_item_id
       WHERE r.method_version_id = _method_version_id AND r.action = 'show')
    SELECT 'ROUTE_TARGET_UNREACHABLE', 'blocking',
           format('Item %s can only be shown by rules whose source is never reachable.', i.item_key)
      FROM public.beskt_items i
     WHERE i.method_version_id = _method_version_id
       AND i.id NOT IN (SELECT re.item_id FROM reachable re);

  -- ---- the seven categorical evidence anchors ------------------------------------
  FOREACH _state IN ARRAY _evidence_states LOOP
    IF NOT EXISTS (SELECT 1 FROM public.beskt_evidence_anchors a
                    WHERE a.method_version_id = _method_version_id AND a.evidence_state = _state) THEN
      RETURN QUERY SELECT ('EVIDENCE_STATE_MISSING_' || upper(_state))::text, 'blocking'::text,
        format('The evidence state %s has no governed anchor.', _state);
    END IF;
  END LOOP;

  RETURN QUERY
    SELECT 'ANCHOR_COMPONENT_MISSING_DEFINITION', 'blocking',
           format('Anchor %s has no complete bilingual definition.', a.evidence_state)
      FROM public.beskt_evidence_anchors a WHERE a.method_version_id = _method_version_id
       AND (length(btrim(coalesce(a.definition_sv, ''))) = 0 OR length(btrim(coalesce(a.definition_en, ''))) = 0);
  RETURN QUERY
    SELECT 'ANCHOR_COMPONENT_MISSING_INCLUSION_CRITERIA', 'blocking',
           format('Anchor %s has no complete bilingual inclusion criteria.', a.evidence_state)
      FROM public.beskt_evidence_anchors a WHERE a.method_version_id = _method_version_id
       AND (length(btrim(coalesce(a.inclusion_criteria_sv, ''))) = 0 OR length(btrim(coalesce(a.inclusion_criteria_en, ''))) = 0);
  RETURN QUERY
    SELECT 'ANCHOR_COMPONENT_MISSING_EXCLUSION_CRITERIA', 'blocking',
           format('Anchor %s has no complete bilingual exclusion criteria.', a.evidence_state)
      FROM public.beskt_evidence_anchors a WHERE a.method_version_id = _method_version_id
       AND (length(btrim(coalesce(a.exclusion_criteria_sv, ''))) = 0 OR length(btrim(coalesce(a.exclusion_criteria_en, ''))) = 0);
  RETURN QUERY
    SELECT 'ANCHOR_COMPONENT_MISSING_SUPPORTING_EVIDENCE_EXAMPLES', 'blocking',
           format('Anchor %s has no complete bilingual supporting-evidence examples.', a.evidence_state)
      FROM public.beskt_evidence_anchors a WHERE a.method_version_id = _method_version_id
       AND (length(btrim(coalesce(a.supporting_evidence_examples_sv, ''))) = 0 OR length(btrim(coalesce(a.supporting_evidence_examples_en, ''))) = 0);
  RETURN QUERY
    SELECT 'ANCHOR_COMPONENT_MISSING_COUNTER_EVIDENCE_AND_PROTECTIVE_FACTORS', 'blocking',
           format('Anchor %s has no complete bilingual counter-evidence and protective factors.', a.evidence_state)
      FROM public.beskt_evidence_anchors a WHERE a.method_version_id = _method_version_id
       AND (length(btrim(coalesce(a.counter_evidence_and_protective_factors_sv, ''))) = 0
         OR length(btrim(coalesce(a.counter_evidence_and_protective_factors_en, ''))) = 0);
  RETURN QUERY
    SELECT 'ANCHOR_COMPONENT_MISSING_PROHIBITED_INFERENCES', 'blocking',
           format('Anchor %s names no prohibited inference.', a.evidence_state)
      FROM public.beskt_evidence_anchors a WHERE a.method_version_id = _method_version_id
       AND coalesce(cardinality(a.prohibited_inferences), 0) = 0;
  RETURN QUERY
    SELECT 'ANCHOR_COMPONENT_MISSING_REQUIRED_NEXT_ACTION', 'blocking',
           format('Anchor %s names no required next action.', a.evidence_state)
      FROM public.beskt_evidence_anchors a WHERE a.method_version_id = _method_version_id
       AND a.required_next_action IS NULL;

  -- Neutrality of the anchors themselves: an omission is never negative
  -- evidence, a difference between sources is never dishonesty, and no text
  -- claims that a behavioural cue indicates deception.
  RETURN QUERY
    SELECT 'ANCHOR_UNADDRESSED_PERMITS_OMISSION_INFERENCE', 'blocking',
           'The unaddressed anchor must prohibit treating an omission as negative evidence.'::text
      FROM public.beskt_evidence_anchors a WHERE a.method_version_id = _method_version_id
       AND a.evidence_state = 'unaddressed'
       AND NOT ('omission_as_negative_evidence' = ANY (a.prohibited_inferences));
  RETURN QUERY
    SELECT 'ANCHOR_CONFLICT_PERMITS_DISHONESTY_INFERENCE', 'blocking',
           'The conflicting_information anchor must prohibit treating an inconsistency as dishonesty.'::text
      FROM public.beskt_evidence_anchors a WHERE a.method_version_id = _method_version_id
       AND a.evidence_state = 'conflicting_information'
       AND NOT ('inconsistency_as_dishonesty' = ANY (a.prohibited_inferences));
  RETURN QUERY
    SELECT 'ANCHOR_DECEPTION_CUE_CLAIM', 'blocking',
           format('Anchor %s claims that a behavioural cue indicates deception or credibility.', a.evidence_state)
      FROM public.beskt_evidence_anchors a WHERE a.method_version_id = _method_version_id
       AND (public.beskt_text_claims_deception_cue(a.definition_sv)
         OR public.beskt_text_claims_deception_cue(a.definition_en)
         OR public.beskt_text_claims_deception_cue(a.inclusion_criteria_sv)
         OR public.beskt_text_claims_deception_cue(a.inclusion_criteria_en)
         OR public.beskt_text_claims_deception_cue(a.exclusion_criteria_sv)
         OR public.beskt_text_claims_deception_cue(a.exclusion_criteria_en)
         OR public.beskt_text_claims_deception_cue(a.supporting_evidence_examples_sv)
         OR public.beskt_text_claims_deception_cue(a.supporting_evidence_examples_en)
         OR public.beskt_text_claims_deception_cue(a.counter_evidence_and_protective_factors_sv)
         OR public.beskt_text_claims_deception_cue(a.counter_evidence_and_protective_factors_en));

  -- ---- the ten observation-field definitions -----------------------------------
  FOREACH _field IN ARRAY _observation_fields LOOP
    IF NOT EXISTS (SELECT 1 FROM public.beskt_observation_fields f
                    WHERE f.method_version_id = _method_version_id AND f.field_key = _field) THEN
      RETURN QUERY SELECT 'OBSERVATION_FIELD_MISSING'::text, 'blocking'::text,
        format('The observation field %s is not defined.', _field);
    END IF;
  END LOOP;

  RETURN QUERY
    SELECT 'OBSERVATION_FIELD_TEXT_INCOMPLETE', 'blocking',
           format('Observation field %s lacks a bilingual label or definition.', f.field_key)
      FROM public.beskt_observation_fields f WHERE f.method_version_id = _method_version_id
       AND (length(btrim(coalesce(f.label_sv, ''))) = 0 OR length(btrim(coalesce(f.label_en, ''))) = 0
         OR length(btrim(coalesce(f.definition_sv, ''))) = 0 OR length(btrim(coalesce(f.definition_en, ''))) = 0);

  -- ---- no scoring instruction anywhere in the governed content ------------------
  -- Not a key check: the VALUES of every wording, purpose and anchor component
  -- are read, in both languages.
  RETURN QUERY
    SELECT 'ITEM_INSTRUCTS_SCORING', 'blocking',
           format('Item %s instructs scoring, rating, grading, ranking, a suitability or hiring verdict, pass/fail or a recommendation.', i.item_key)
      FROM public.beskt_items i
     WHERE i.method_version_id = _method_version_id
       AND (public.beskt_text_instructs_scoring(i.wording_sv) OR public.beskt_text_instructs_scoring(i.wording_en)
            OR public.beskt_text_instructs_scoring(i.purpose_sv) OR public.beskt_text_instructs_scoring(i.purpose_en));
  RETURN QUERY
    SELECT 'PROMPT_INSTRUCTS_SCORING', 'blocking',
           format('Prompt %s instructs scoring, rating, grading, ranking, a suitability or hiring verdict, pass/fail or a recommendation; the Evaluation step is interviewer reflection only.', pr.prompt_key)
      FROM public.beskt_prompts pr
     WHERE pr.method_version_id = _method_version_id
       AND (public.beskt_text_instructs_scoring(pr.wording_sv) OR public.beskt_text_instructs_scoring(pr.wording_en));
  RETURN QUERY
    SELECT 'ANCHOR_INSTRUCTS_SCORING', 'blocking',
           format('Evidence anchor %s instructs scoring, rating, grading, ranking, a suitability or hiring verdict, pass/fail or a recommendation.', a.evidence_state)
      FROM public.beskt_evidence_anchors a
     WHERE a.method_version_id = _method_version_id
       AND (public.beskt_text_instructs_scoring(a.definition_sv) OR public.beskt_text_instructs_scoring(a.definition_en)
            OR public.beskt_text_instructs_scoring(a.inclusion_criteria_sv) OR public.beskt_text_instructs_scoring(a.inclusion_criteria_en)
            OR public.beskt_text_instructs_scoring(a.exclusion_criteria_sv) OR public.beskt_text_instructs_scoring(a.exclusion_criteria_en)
            OR public.beskt_text_instructs_scoring(a.supporting_evidence_examples_sv) OR public.beskt_text_instructs_scoring(a.supporting_evidence_examples_en)
            OR public.beskt_text_instructs_scoring(a.counter_evidence_and_protective_factors_sv) OR public.beskt_text_instructs_scoring(a.counter_evidence_and_protective_factors_en));

  -- ---- routing moves forward only ---------------------------------------------
  -- Re-proved on the stored graph: a target ordered at or before its source
  -- (section, item order, key) blocks publication even if a row was forced
  -- past the write-time guard.
  RETURN QUERY
    SELECT 'ROUTE_TARGET_BEFORE_SOURCE', 'blocking',
           format('Rule %s targets %s, which does not come after its source %s in the governed order.', r.rule_key, ti.item_key, si.item_key)
      FROM public.beskt_routing_rules r
      JOIN public.beskt_items si ON si.id = r.source_item_id
      JOIN public.beskt_sections ss ON ss.id = si.section_id
      JOIN public.beskt_items ti ON ti.id = r.target_item_id
      JOIN public.beskt_sections ts ON ts.id = ti.section_id
     WHERE r.method_version_id = _method_version_id
       AND (ts.display_order, ti.display_order, ti.item_key) <= (ss.display_order, si.display_order, si.item_key);

  -- ---- the five human review gates, bound to the CURRENT content hash ------------
  IF _require_reviews THEN
    _hash := public.beskt_method_content_hash(_method_version_id);
    FOREACH _gate IN ARRAY _review_gates LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.beskt_method_reviews rv
         WHERE rv.method_version_id = _method_version_id
           AND rv.gate = _gate
           AND rv.decision = 'approved'
           AND rv.content_hash_at_review = _hash
           AND rv.review_cycle_at_review = _v.review_cycle) THEN
        RETURN QUERY SELECT
          ('REVIEW_GATE_' || upper(_gate) || '_NOT_APPROVED')::text,
          'blocking'::text,
          format('The %s review gate has not been approved for the current content in the current review cycle. If it was approved earlier, the content has changed or the version was rejected and resubmitted since, and must be reviewed again.', _gate);
      END IF;
    END LOOP;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_method_validate(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_method_validate(uuid, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.beskt_method_validate(uuid, boolean) IS
  'Every reason a BESKT method version cannot be published, as rows. Empty '
  'means publishable. Purpose-built for BESKT: it never reads a competency '
  'mapping, a rating anchor or a 0-4 level, and the role-interview validator '
  'never reads BESKT content.';


-- ###########################################################################
-- SECTION 6 -- Deterministic routing
-- ###########################################################################
--
-- The same method version, exposure profile, mode and structured answers
-- produce exactly the same item set in exactly the same order, whatever the
-- heap order of the rows. Rules are applied in evaluation_order; the result
-- is ordered on (section order, item order, item key).
--
-- Answers are a jsonb object keyed by item_key. Only two shapes can satisfy
-- a condition:
--     {"kind": "option",  "option_keys": ["a", "b"]}
--     {"kind": "boolean", "value": true}
-- Every other shape -- absent, {"kind": "omitted"}, {"kind": "discuss_orally"},
-- free text -- satisfies NO condition. An omission or a request to discuss
-- orally therefore leaves every rule unfired: it is a neutral input state and
-- cannot open an adverse branch, by construction.
-- ---------------------------------------------------------------------------

-- The access classes a caller may read. Governance readers (platform
-- content roles and platform admins) read every class of every state: they
-- govern the content. An explicit internal-QA grantee reads published
-- recruitment-support content in the classes an internal tester may see,
-- never the authorised security function's. Nobody else reads anything:
-- release_scope is synthetic_internal_only, so no employer principal,
-- candidate or roleless user has a read path in PR 2. Opening an employer
-- or runtime read is a later migration's explicitly reviewed release gate.
CREATE OR REPLACE FUNCTION public.beskt_reader_access_classes(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN '{}'::text[]
    WHEN public.scp_interview_can_read(_user_id) THEN
      ARRAY['recruiter', 'beskt_interviewer', 'independent_assessor',
            'authorised_security_function', 'accountable_process_owner']
    WHEN public.beskt_holds_grant(_user_id, 'internal_qa') THEN
      ARRAY['recruiter', 'beskt_interviewer', 'independent_assessor', 'accountable_process_owner']
    ELSE '{}'::text[]
  END;
$$;

-- INTERNAL: it answers for an arbitrary user id. Every caller is SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.beskt_reader_access_classes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beskt_reader_access_classes(uuid) TO service_role;

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


CREATE OR REPLACE FUNCTION public.beskt_resolve_item_sequence(
  _method_version_id uuid,
  _exposure_profile_id uuid,
  _mode text,
  _answers jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (sequence_position integer, item_id uuid, item_key text, section_key text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v public.beskt_method_versions%ROWTYPE;
  _profile_mode text;
  _profile_version uuid;
  _shown uuid[];
  _r record;
  _answer jsonb;
  _fires boolean;
BEGIN
  IF NOT public.beskt_can_read_version(_method_version_id) THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHORISED: you may not read this method version.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BESKT_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _mode IS NULL OR _mode NOT IN ('recruitment_support', 'security_vetting_support') THEN
    RAISE EXCEPTION 'BESKT_MODE_UNKNOWN: "%".', _mode USING ERRCODE = 'check_violation';
  END IF;
  IF _mode = 'security_vetting_support' AND _v.mode <> 'security_vetting_support' THEN
    RAISE EXCEPTION 'BESKT_MODE_NOT_PERMITTED: this method version permits recruitment_support only.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT p.permitted_mode, p.method_version_id INTO _profile_mode, _profile_version
    FROM public.beskt_exposure_profiles p WHERE p.id = _exposure_profile_id;
  IF _profile_version IS DISTINCT FROM _method_version_id THEN
    RAISE EXCEPTION 'BESKT_PROFILE_NOT_IN_VERSION: the exposure profile does not belong to this method version.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _profile_mode = 'security_vetting_support' AND _mode <> 'security_vetting_support' THEN
    RAISE EXCEPTION 'BESKT_MODE_NOT_PERMITTED: this exposure profile is security_vetting_support only.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'object' THEN
    RAISE EXCEPTION 'BESKT_ANSWERS_NOT_STRUCTURED: answers must be a JSON object keyed by item_key.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The unconditional set: every candidate-preparation item of this profile
  -- whose mode the chosen mode permits, minus the items that only a 'show'
  -- rule of THIS profile can reveal. A rule whose source lies in another
  -- profile can never fire here (see the loop below), so it neither hides
  -- nor reveals anything: cross-profile coupling is absent, not half-present.
  SELECT coalesce(array_agg(i.id), '{}'::uuid[]) INTO _shown
    FROM public.beskt_items i
   WHERE i.method_version_id = _method_version_id
     AND i.exposure_profile_id = _exposure_profile_id
     AND i.phase = 'candidate_preparation'
     AND (i.permitted_mode = 'recruitment_support' OR _mode = 'security_vetting_support')
     AND NOT EXISTS (
       SELECT 1 FROM public.beskt_routing_rules r
        JOIN public.beskt_items si ON si.id = r.source_item_id
        WHERE r.method_version_id = _method_version_id
          AND r.target_item_id = i.id AND r.action = 'show'
          AND si.exposure_profile_id = _exposure_profile_id
          AND (r.applies_mode = 'recruitment_support' OR _mode = 'security_vetting_support'));

  -- Rules in evaluation order. A later rule overrides an earlier one on the
  -- same target, deterministically.
  FOR _r IN
    SELECT r.condition_kind, r.condition_boolean, r.action, r.target_item_id, r.source_item_id,
           si.item_key AS source_key, si.exposure_profile_id AS source_profile,
           o.option_key,
           (ti.permitted_mode = 'recruitment_support' OR _mode = 'security_vetting_support') AS target_permitted,
           ti.exposure_profile_id AS target_profile
      FROM public.beskt_routing_rules r
      JOIN public.beskt_items si ON si.id = r.source_item_id
      JOIN public.beskt_items ti ON ti.id = r.target_item_id
      LEFT JOIN public.beskt_item_options o ON o.id = r.condition_option_id
     WHERE r.method_version_id = _method_version_id
       AND (r.applies_mode = 'recruitment_support' OR _mode = 'security_vetting_support')
     ORDER BY r.evaluation_order
  LOOP
    -- Only this profile's items are in play, and a rule can only reveal
    -- content the chosen mode permits.
    IF _r.source_profile <> _exposure_profile_id OR _r.target_profile <> _exposure_profile_id
       OR NOT _r.target_permitted THEN
      CONTINUE;
    END IF;
    -- A rule reads only an item that is currently shown. An answer supplied
    -- for a hidden or skipped source is ignored, deterministically, so a
    -- stale answer can neither reveal nor hide downstream content.
    IF NOT (_r.source_item_id = ANY (_shown)) THEN
      CONTINUE;
    END IF;

    _answer := _answers -> _r.source_key;
    _fires := CASE _r.condition_kind
      WHEN 'always' THEN true
      WHEN 'option_selected' THEN
        _answer IS NOT NULL
        AND _answer ->> 'kind' = 'option'
        AND jsonb_typeof(_answer -> 'option_keys') = 'array'
        AND (_answer -> 'option_keys') ? _r.option_key
      WHEN 'boolean_equals' THEN
        _answer IS NOT NULL
        AND _answer ->> 'kind' = 'boolean'
        AND jsonb_typeof(_answer -> 'value') = 'boolean'
        AND (_answer ->> 'value')::boolean = _r.condition_boolean
      ELSE false
    END;

    IF NOT _fires THEN CONTINUE; END IF;

    IF _r.action = 'show' THEN
      IF NOT (_r.target_item_id = ANY (_shown)) THEN
        _shown := _shown || _r.target_item_id;
      END IF;
    ELSE
      _shown := array_remove(_shown, _r.target_item_id);
    END IF;
  END LOOP;

  RETURN QUERY
    SELECT (row_number() OVER (ORDER BY s.display_order, i.display_order, i.item_key))::integer,
           i.id, i.item_key, s.section_key
      FROM public.beskt_items i
      JOIN public.beskt_sections s ON s.id = i.section_id
     WHERE i.id = ANY (_shown)
     ORDER BY s.display_order, i.display_order, i.item_key;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_resolve_item_sequence(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_resolve_item_sequence(uuid, uuid, text, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.beskt_resolve_item_sequence(uuid, uuid, text, jsonb) IS
  'Deterministic questionnaire routing over governed structured data only. '
  'Same version, profile, mode and structured answers -> same items, same '
  'order. An omitted or discuss-orally answer fires no rule, and neither does '
  'an answer for an item that is not currently shown. It starts nothing and '
  'stores nothing.';


-- ###########################################################################
-- SECTION 7 -- Lifecycle, review, idempotency and event RPCs, and the read
--              contract
-- ###########################################################################
--
-- Narrow, purpose-specific mutations. There is no generic action RPC and no
-- client writer for any child table: PR 2 ships no authoring UI, so content
-- is established by migration/test fixtures under service_role, and every
-- governed transition goes through exactly one of the functions below.
--
-- Every client-callable mutation:
--   * derives the actor from auth.uid();
--   * authorises itself, inside the function;
--   * takes an operation id, and where content can race an expected revision;
--   * computes a SHA-256 request hash over its exact arguments;
--   * serialises on the operation id, then answers a REPLAY (same actor, same
--     operation, same request) with the original result BEFORE the
--     compare-and-swap, so a retry after a lost response never becomes a
--     false stale-revision error;
--   * refuses the same operation id with a different request or actor;
--   * refuses a stale expected revision without writing;
--   * writes its append-only event -- carrying the receipt -- in the same
--     transaction.
-- ---------------------------------------------------------------------------

-- 7.1  The request hash: core sha256 over the canonical jsonb text. jsonb
--      normalises key order, so equal requests hash equal.
CREATE OR REPLACE FUNCTION public.beskt_request_hash(_request jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT encode(sha256(convert_to(_request::text, 'UTF8')), 'hex');
$$;

REVOKE ALL ON FUNCTION public.beskt_request_hash(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_request_hash(jsonb) TO authenticated, service_role;


-- 7.2  The append-only event writer. No client role may execute it.
CREATE OR REPLACE FUNCTION public.beskt_record_event(
  _pack_id uuid,
  _method_version_id uuid,
  _event text,
  _previous_status text,
  _new_status text,
  _reason text,
  _content_hash text,
  _revision integer,
  _operation_id uuid,
  _request_hash text,
  _result jsonb,
  _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.beskt_method_events
    (pack_id, method_version_id, event, actor_id, previous_status, new_status,
     reason, content_hash, revision, operation_id, request_hash, result, metadata)
  VALUES
    (_pack_id, _method_version_id, _event, auth.uid(), _previous_status, _new_status,
     _reason, _content_hash, _revision, _operation_id, _request_hash, _result,
     coalesce(_metadata, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_record_event(uuid, uuid, text, text, text, text, text, integer, uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beskt_record_event(uuid, uuid, text, text, text, text, text, integer, uuid, text, jsonb, jsonb)
  TO service_role;


-- 7.3  Operation begin: serialise on the operation id and answer a replay.
--      Returns the original result for the same actor + operation + request,
--      NULL when the operation is new, and refuses a reuse with a different
--      request or a different actor. INTERNAL.
CREATE OR REPLACE FUNCTION public.beskt_operation_begin(_operation_id uuid, _request_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _receipt public.beskt_method_events%ROWTYPE;
BEGIN
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation carries an operation id.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Two requests with the same operation id serialise here, so the second
  -- finds the first's receipt instead of racing it.
  PERFORM pg_advisory_xact_lock(hashtextextended('beskt_operation:' || _operation_id::text, 0));

  SELECT * INTO _receipt FROM public.beskt_method_events e WHERE e.operation_id = _operation_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF _receipt.actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ACTOR_MISMATCH: operation % belongs to another actor.', _operation_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _receipt.request_hash IS DISTINCT FROM _request_hash THEN
    RAISE EXCEPTION 'BESKT_OPERATION_PAYLOAD_MISMATCH: operation % was recorded with a different request; a new request needs a new operation id.', _operation_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN _receipt.result;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_operation_begin(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beskt_operation_begin(uuid, text) TO service_role;


-- 7.4  Lock a version and check the caller's expected revision. INTERNAL.
CREATE OR REPLACE FUNCTION public.beskt_lock_version(_method_version_id uuid, _expected_revision integer)
RETURNS public.beskt_method_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _v public.beskt_method_versions%ROWTYPE;
BEGIN
  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BESKT_REVISION_REQUIRED: a governed mutation names the revision it was looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BESKT_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _v.revision <> _expected_revision THEN
    RAISE EXCEPTION 'BESKT_STALE_REVISION: the version is at revision % but the request expected revision %. Reload and retry.',
      _v.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;
  RETURN _v;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_lock_version(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beskt_lock_version(uuid, integer) TO service_role;


-- 7.5  Create a BESKT method identity.
CREATE OR REPLACE FUNCTION public.beskt_create_method(
  _operation_id uuid,
  _slug text,
  _name_sv text,
  _purpose_sv text,
  _name_en text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text;
  _replay jsonb;
  _id uuid;
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'create_method', 'slug', _slug, 'name_sv', _name_sv, 'purpose_sv', _purpose_sv, 'name_en', _name_en));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  IF NOT public.scp_interview_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'BESKT_NOT_EDITOR: creating a BESKT method requires the platform content editor role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _slug IS NULL OR btrim(_slug) = '' OR _slug !~ '^[a-z0-9][a-z0-9-]*$' THEN
    RAISE EXCEPTION 'BESKT_INVALID_SLUG: slug must be lower-case letters, digits and hyphens.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _name_sv IS NULL OR btrim(_name_sv) = '' OR _purpose_sv IS NULL OR btrim(_purpose_sv) = '' THEN
    RAISE EXCEPTION 'BESKT_NAME_AND_PURPOSE_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.scp_interview_packs (slug, role_id, pack_kind, name_sv, name_en, purpose_sv, created_by)
  VALUES (btrim(_slug), NULL, 'beskt_method', _name_sv, _name_en, _purpose_sv, auth.uid())
  RETURNING id INTO _id;

  _result := jsonb_build_object('pack_id', _id, 'slug', btrim(_slug), 'pack_kind', 'beskt_method');
  PERFORM public.beskt_record_event(_id, NULL, 'method_created', NULL, NULL, NULL, NULL, NULL,
    _operation_id, _request_hash, _result, jsonb_build_object('slug', btrim(_slug)));
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_create_method(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_create_method(uuid, text, text, text, text) TO authenticated, service_role;


-- 7.6  Create a method version. One open (draft or in_review) version per
--      method at a time.
CREATE OR REPLACE FUNCTION public.beskt_create_method_version(
  _operation_id uuid,
  _pack_id uuid,
  _mode text,
  _source_reference text,
  _source_document_version text,
  _content_provenance text,
  _summary_sv text DEFAULT NULL,
  _summary_en text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text;
  _replay jsonb;
  _id uuid;
  _next integer;
  _is_first boolean;
  _hash text;
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'create_method_version', 'pack_id', _pack_id, 'mode', _mode,
    'source_reference', _source_reference, 'source_document_version', _source_document_version,
    'content_provenance', _content_provenance, 'summary_sv', _summary_sv, 'summary_en', _summary_en));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  IF NOT public.scp_interview_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'BESKT_NOT_EDITOR: creating a method version requires the platform content editor role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scp_interview_packs p
                  WHERE p.id = _pack_id AND p.pack_kind = 'beskt_method') THEN
    RAISE EXCEPTION 'BESKT_PACK_KIND_MISMATCH: % is not a BESKT method.', _pack_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF _mode IS NULL OR _mode NOT IN ('recruitment_support', 'security_vetting_support') THEN
    RAISE EXCEPTION 'BESKT_MODE_UNKNOWN: "%".', _mode USING ERRCODE = 'check_violation';
  END IF;

  -- Serialised per method BEFORE the open-version check, so two concurrent
  -- creates cannot both pass it: the second waits here, then sees the
  -- first's committed draft. The partial unique index
  -- beskt_method_versions_one_open_idx is the last line of defence.
  PERFORM pg_advisory_xact_lock(hashtextextended('beskt_method:' || _pack_id::text, 0));

  IF EXISTS (SELECT 1 FROM public.beskt_method_versions v
              WHERE v.pack_id = _pack_id AND v.content_status IN ('draft', 'in_review')) THEN
    RAISE EXCEPTION 'BESKT_OPEN_VERSION_EXISTS: this method already has a version in draft or review.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(max(v.version_number), 0) + 1, count(*) = 0
    INTO _next, _is_first
    FROM public.beskt_method_versions v WHERE v.pack_id = _pack_id;

  INSERT INTO public.beskt_method_versions
    (pack_id, version_number, content_status, mode, source_reference, source_document_version,
     content_provenance, summary_sv, summary_en, created_by)
  VALUES
    (_pack_id, _next, 'draft', _mode, _source_reference, _source_document_version,
     _content_provenance, _summary_sv, _summary_en, auth.uid())
  RETURNING id INTO _id;

  _hash := public.beskt_method_content_hash(_id);
  PERFORM set_config('beskt.governed_transition', 'on', true);
  UPDATE public.beskt_method_versions SET content_hash = _hash WHERE id = _id;
  PERFORM set_config('beskt.governed_transition', 'off', true);

  _result := jsonb_build_object('method_version_id', _id, 'pack_id', _pack_id,
    'version_number', _next, 'content_status', 'draft', 'revision', 1, 'content_hash', _hash);
  PERFORM public.beskt_record_event(_pack_id, _id,
    CASE WHEN _is_first THEN 'version_created' ELSE 'new_version_created' END,
    NULL, 'draft', NULL, _hash, 1, _operation_id, _request_hash, _result,
    jsonb_build_object('version_number', _next, 'mode', _mode));
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_create_method_version(uuid, uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_create_method_version(uuid, uuid, text, text, text, text, text, text) TO authenticated, service_role;


-- 7.7  Record that the draft content moved: recompute the hash and advance
--      the revision. Compare-and-swap on the expected revision.
CREATE OR REPLACE FUNCTION public.beskt_touch_draft(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _summary text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text;
  _replay jsonb;
  _v public.beskt_method_versions%ROWTYPE;
  _hash text;
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'touch_draft', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'summary', _summary));
  -- Replay is answered BEFORE the compare-and-swap.
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  IF NOT public.scp_interview_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'BESKT_NOT_EDITOR: editing a method version requires the platform content editor role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _v := public.beskt_lock_version(_method_version_id, _expected_revision);
  IF _v.content_status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION 'BESKT_PUBLISHED_IMMUTABLE: version is "%" and can no longer be edited.', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;

  _hash := public.beskt_method_content_hash(_method_version_id);
  PERFORM set_config('beskt.governed_transition', 'on', true);
  UPDATE public.beskt_method_versions
     SET content_hash = _hash, revision = _v.revision + 1, updated_at = now()
   WHERE id = _method_version_id;
  PERFORM set_config('beskt.governed_transition', 'off', true);

  _result := jsonb_build_object('method_version_id', _method_version_id,
    'content_status', _v.content_status, 'revision', _v.revision + 1, 'content_hash', _hash);
  PERFORM public.beskt_record_event(_v.pack_id, _method_version_id, 'draft_touched',
    _v.content_status, _v.content_status, _summary, _hash, _v.revision + 1,
    _operation_id, _request_hash, _result, '{}'::jsonb);
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_touch_draft(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_touch_draft(uuid, uuid, integer, text) TO authenticated, service_role;


-- 7.8  Submit for the five parallel gates. Content completeness is validated
--      here (reviews excluded), so reviewers are never handed an incomplete
--      method.
CREATE OR REPLACE FUNCTION public.beskt_submit_for_review(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text;
  _replay jsonb;
  _v public.beskt_method_versions%ROWTYPE;
  _hash text;
  _blockers text;
  _blocker_count integer;
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'submit_for_review', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  IF NOT public.scp_interview_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'BESKT_NOT_EDITOR: submitting for review requires the platform content editor role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _v := public.beskt_lock_version(_method_version_id, _expected_revision);
  IF _v.content_status <> 'draft' THEN
    RAISE EXCEPTION 'BESKT_NOT_DRAFT: a version is submitted for review from "draft", not from "%".', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*), string_agg(format('%s: %s', bv.code, bv.message), E'\n' ORDER BY bv.code)
    INTO _blocker_count, _blockers
    FROM public.beskt_method_validate(_method_version_id, false) bv
   WHERE bv.severity = 'blocking';
  IF _blocker_count > 0 THEN
    RAISE EXCEPTION E'BESKT_SUBMIT_BLOCKED: this method version is not complete.\n%', _blockers
      USING ERRCODE = 'check_violation';
  END IF;

  _hash := public.beskt_method_content_hash(_method_version_id);
  -- Every submission opens a NEW review cycle. Approvals given in an earlier
  -- cycle -- even at identical bytes -- no longer count.
  PERFORM set_config('beskt.governed_transition', 'on', true);
  UPDATE public.beskt_method_versions
     SET content_status = 'in_review', content_hash = _hash, revision = _v.revision + 1,
         review_cycle = _v.review_cycle + 1, updated_at = now()
   WHERE id = _method_version_id;
  PERFORM set_config('beskt.governed_transition', 'off', true);

  _result := jsonb_build_object('method_version_id', _method_version_id,
    'content_status', 'in_review', 'revision', _v.revision + 1, 'review_cycle', _v.review_cycle + 1,
    'content_hash', _hash);
  PERFORM public.beskt_record_event(_v.pack_id, _method_version_id, 'submitted_for_review',
    'draft', 'in_review', NULL, _hash, _v.revision + 1, _operation_id, _request_hash, _result, '{}'::jsonb);
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_submit_for_review(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_submit_for_review(uuid, uuid, integer) TO authenticated, service_role;


-- 7.9  Record one of the five human review gates, bound to the exact current
--      content hash and revision. A rejection returns the version to draft.
CREATE OR REPLACE FUNCTION public.beskt_record_review(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _gate text,
  _decision text,
  _rationale text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text;
  _replay jsonb;
  _v public.beskt_method_versions%ROWTYPE;
  _hash text;
  _review_id uuid;
  _new_status text;
  _new_revision integer;
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'record_review', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'gate', _gate, 'decision', _decision,
    'rationale', _rationale));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  IF NOT public.scp_has_content_role(auth.uid(), 'reviewer') THEN
    RAISE EXCEPTION 'BESKT_NOT_REVIEWER: recording a review gate requires the platform content reviewer role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _gate IS NULL OR _gate NOT IN ('personnel_security', 'senior_hr', 'recruitment',
                                    'employment_privacy_legal', 'data_protection') THEN
    RAISE EXCEPTION 'BESKT_UNKNOWN_GATE: "%".', _gate USING ERRCODE = 'check_violation';
  END IF;
  -- The generic reviewer role is never enough: the caller must hold an
  -- active, server-owned grant for exactly this gate.
  IF NOT public.beskt_holds_grant(auth.uid(), _gate) THEN
    RAISE EXCEPTION 'BESKT_GATE_NOT_GRANTED: you hold no active grant for the % gate.', _gate
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _decision IS NULL OR _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'BESKT_UNKNOWN_DECISION: "%".', _decision USING ERRCODE = 'check_violation';
  END IF;
  IF _rationale IS NULL OR btrim(_rationale) = '' THEN
    RAISE EXCEPTION 'BESKT_RATIONALE_REQUIRED: a review decision must carry a written rationale.'
      USING ERRCODE = 'check_violation';
  END IF;

  _v := public.beskt_lock_version(_method_version_id, _expected_revision);
  IF _v.content_status <> 'in_review' THEN
    RAISE EXCEPTION 'BESKT_GATE_NOT_OPEN: reviews are recorded while the version is "in_review", but it is "%".', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- The content the reviewer sees is the content the hash names. If the
  -- stored content moved underneath the last governed touch, nothing is
  -- reviewable until an editor touches the draft again.
  _hash := public.beskt_method_content_hash(_method_version_id);
  IF _hash IS DISTINCT FROM _v.content_hash THEN
    RAISE EXCEPTION 'BESKT_CONTENT_HASH_STALE: the governed content changed since the last touch; the editor must touch the draft before it can be reviewed.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.beskt_method_reviews
    (method_version_id, gate, decision, reviewer_id, rationale, content_hash_at_review,
     revision_at_review, review_cycle_at_review)
  VALUES (_method_version_id, _gate, _decision, auth.uid(), btrim(_rationale), _hash, _v.revision, _v.review_cycle)
  RETURNING id INTO _review_id;

  IF _decision = 'rejected' THEN
    _new_status := 'draft';
    _new_revision := _v.revision + 1;
    PERFORM set_config('beskt.governed_transition', 'on', true);
    UPDATE public.beskt_method_versions
       SET content_status = 'draft', revision = _new_revision, updated_at = now()
     WHERE id = _method_version_id;
    PERFORM set_config('beskt.governed_transition', 'off', true);
  ELSE
    _new_status := _v.content_status;
    _new_revision := _v.revision;
  END IF;

  _result := jsonb_build_object('review_id', _review_id, 'method_version_id', _method_version_id,
    'gate', _gate, 'decision', _decision, 'content_status', _new_status,
    'revision', _new_revision, 'review_cycle', _v.review_cycle, 'content_hash', _hash);
  PERFORM public.beskt_record_event(_v.pack_id, _method_version_id,
    CASE _decision WHEN 'approved' THEN 'review_approved' ELSE 'review_rejected' END,
    _v.content_status, _new_status, btrim(_rationale), _hash, _new_revision,
    _operation_id, _request_hash, _result, jsonb_build_object('gate', _gate, 'review_id', _review_id));
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_record_review(uuid, uuid, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_record_review(uuid, uuid, integer, text, text, text) TO authenticated, service_role;


-- 7.10 Publish. Atomic and fail-closed: the validator -- content completeness
--      AND all five gates approved at the CURRENT hash -- runs inside the
--      transaction that flips the status, under the row lock.
CREATE OR REPLACE FUNCTION public.beskt_publish_version(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text;
  _replay jsonb;
  _v public.beskt_method_versions%ROWTYPE;
  _hash text;
  _blockers text;
  _blocker_count integer;
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'publish_version', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'reason', _reason));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  IF NOT public.scp_has_content_role(auth.uid(), 'publisher') THEN
    RAISE EXCEPTION 'BESKT_NOT_PUBLISHER: publishing requires the platform publisher role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _v := public.beskt_lock_version(_method_version_id, _expected_revision);
  IF _v.created_by IS NOT NULL AND _v.created_by = auth.uid() THEN
    RAISE EXCEPTION 'BESKT_PUBLISHER_IS_AUTHOR: the author of a method version may not publish it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _v.content_status <> 'in_review' THEN
    RAISE EXCEPTION 'BESKT_NOT_READY_TO_PUBLISH: a version is published from "in_review", not from "%".', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;

  _hash := public.beskt_method_content_hash(_method_version_id);
  IF _hash IS DISTINCT FROM _v.content_hash THEN
    RAISE EXCEPTION 'BESKT_CONTENT_HASH_STALE: the governed content changed since the last touch and has not been re-reviewed.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*), string_agg(format('%s: %s', bv.code, bv.message), E'\n' ORDER BY bv.code)
    INTO _blocker_count, _blockers
    FROM public.beskt_method_validate(_method_version_id, true) bv
   WHERE bv.severity = 'blocking';
  IF _blocker_count > 0 THEN
    RAISE EXCEPTION E'BESKT_PUBLISH_BLOCKED: this method version is not complete or not fully approved.\n%', _blockers
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('beskt.governed_transition', 'on', true);
  UPDATE public.beskt_method_versions
     SET content_status = 'published', content_hash = _hash, revision = _v.revision + 1,
         published_by = auth.uid(), published_at = now(), updated_at = now()
   WHERE id = _method_version_id;
  PERFORM set_config('beskt.governed_transition', 'off', true);

  _result := jsonb_build_object('method_version_id', _method_version_id,
    'content_status', 'published', 'revision', _v.revision + 1, 'content_hash', _hash,
    'version_number', _v.version_number, 'validation_label', _v.validation_label,
    'release_scope', _v.release_scope);
  PERFORM public.beskt_record_event(_v.pack_id, _method_version_id, 'published',
    'in_review', 'published', _reason, _hash, _v.revision + 1, _operation_id, _request_hash, _result,
    jsonb_build_object('validation_label', _v.validation_label, 'version_number', _v.version_number));
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_publish_version(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_publish_version(uuid, uuid, integer, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.beskt_publish_version(uuid, uuid, integer, text) IS
  'The ONLY path to published. Requires the publisher role (never the '
  'author), the in_review state, the caller''s expected revision, a content '
  'hash that matches the last governed touch, and an empty result from '
  'beskt_method_validate() -- which includes all five review gates approved '
  'at the CURRENT content hash.';


-- 7.11 Suspend and retire. A published version can be withdrawn but never
--      mutated; a withdrawn version stays for governed history and can never
--      be selected for new work.
CREATE OR REPLACE FUNCTION public.beskt_suspend_version(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text;
  _replay jsonb;
  _v public.beskt_method_versions%ROWTYPE;
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'suspend_version', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'reason', _reason));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  IF NOT public.scp_has_content_role(auth.uid(), 'publisher') THEN
    RAISE EXCEPTION 'BESKT_NOT_PUBLISHER: suspending requires the platform publisher role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'BESKT_REASON_REQUIRED: suspension must carry a written reason.' USING ERRCODE = 'check_violation';
  END IF;

  _v := public.beskt_lock_version(_method_version_id, _expected_revision);
  IF _v.content_status <> 'published' THEN
    RAISE EXCEPTION 'BESKT_ILLEGAL_TRANSITION: only a published version can be suspended (it is "%").', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('beskt.governed_transition', 'on', true);
  UPDATE public.beskt_method_versions
     SET content_status = 'suspended', revision = _v.revision + 1,
         suspended_by = auth.uid(), suspended_at = now(), suspended_reason = btrim(_reason), updated_at = now()
   WHERE id = _method_version_id;
  PERFORM set_config('beskt.governed_transition', 'off', true);

  _result := jsonb_build_object('method_version_id', _method_version_id,
    'content_status', 'suspended', 'revision', _v.revision + 1, 'content_hash', _v.content_hash);
  PERFORM public.beskt_record_event(_v.pack_id, _method_version_id, 'suspended',
    'published', 'suspended', btrim(_reason), _v.content_hash, _v.revision + 1,
    _operation_id, _request_hash, _result, '{}'::jsonb);
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_suspend_version(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_suspend_version(uuid, uuid, integer, text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.beskt_retire_version(
  _operation_id uuid,
  _method_version_id uuid,
  _expected_revision integer,
  _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text;
  _replay jsonb;
  _v public.beskt_method_versions%ROWTYPE;
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'retire_version', 'method_version_id', _method_version_id,
    'expected_revision', _expected_revision, 'reason', _reason));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  IF NOT public.scp_has_content_role(auth.uid(), 'publisher') THEN
    RAISE EXCEPTION 'BESKT_NOT_PUBLISHER: retiring requires the platform publisher role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'BESKT_REASON_REQUIRED: retirement must carry a written reason.' USING ERRCODE = 'check_violation';
  END IF;

  _v := public.beskt_lock_version(_method_version_id, _expected_revision);
  IF _v.content_status NOT IN ('published', 'suspended') THEN
    RAISE EXCEPTION 'BESKT_ILLEGAL_TRANSITION: only a published or suspended version can be retired (it is "%").', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('beskt.governed_transition', 'on', true);
  UPDATE public.beskt_method_versions
     SET content_status = 'retired', revision = _v.revision + 1,
         retired_by = auth.uid(), retired_at = now(), retired_reason = btrim(_reason), updated_at = now()
   WHERE id = _method_version_id;
  PERFORM set_config('beskt.governed_transition', 'off', true);

  _result := jsonb_build_object('method_version_id', _method_version_id,
    'content_status', 'retired', 'revision', _v.revision + 1, 'content_hash', _v.content_hash);
  PERFORM public.beskt_record_event(_v.pack_id, _method_version_id, 'retired',
    _v.content_status, 'retired', btrim(_reason), _v.content_hash, _v.revision + 1,
    _operation_id, _request_hash, _result, '{}'::jsonb);
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_retire_version(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_retire_version(uuid, uuid, integer, text) TO authenticated, service_role;


-- 7.11b Governance grants: made and revoked by a platform admin only,
--       through the governed contract, with an operation id each.
CREATE OR REPLACE FUNCTION public.beskt_grant_governance(
  _operation_id uuid,
  _user_id uuid,
  _grant_kind text,
  _source_reference text,
  _valid_until timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _g public.beskt_governance_grants%ROWTYPE; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation carries an operation id.'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('beskt_operation:' || _operation_id::text, 0));
  SELECT * INTO _g FROM public.beskt_governance_grants g WHERE g.grant_operation_id = _operation_id;
  IF FOUND THEN
    IF _g.granted_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'BESKT_OPERATION_ACTOR_MISMATCH: operation % belongs to another actor.', _operation_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF _g.user_id IS DISTINCT FROM _user_id OR _g.grant_kind IS DISTINCT FROM _grant_kind
       OR _g.source_reference IS DISTINCT FROM btrim(_source_reference)
       OR _g.valid_until IS DISTINCT FROM _valid_until THEN
      RAISE EXCEPTION 'BESKT_OPERATION_PAYLOAD_MISMATCH: operation % was recorded with a different request.', _operation_id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN jsonb_build_object('grant_id', _g.id, 'user_id', _g.user_id, 'grant_kind', _g.grant_kind);
  END IF;
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'BESKT_NOT_PLATFORM_ADMIN: governance grants are made by a platform admin only.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _grant_kind IS NULL OR _grant_kind NOT IN ('personnel_security', 'senior_hr', 'recruitment',
       'employment_privacy_legal', 'data_protection', 'internal_qa') THEN
    RAISE EXCEPTION 'BESKT_UNKNOWN_GATE: "%".', _grant_kind USING ERRCODE = 'check_violation';
  END IF;
  IF _source_reference IS NULL OR btrim(_source_reference) = '' THEN
    RAISE EXCEPTION 'BESKT_PROVENANCE_REQUIRED: a governance grant records where its authority comes from.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _user_id) THEN
    RAISE EXCEPTION 'BESKT_USER_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('beskt.governance_grant_write', 'on', true);
  INSERT INTO public.beskt_governance_grants
    (user_id, grant_kind, granted_by, valid_until, source_reference, grant_operation_id)
  VALUES (_user_id, _grant_kind, auth.uid(), _valid_until, btrim(_source_reference), _operation_id)
  RETURNING id INTO _id;
  PERFORM set_config('beskt.governance_grant_write', 'off', true);
  RETURN jsonb_build_object('grant_id', _id, 'user_id', _user_id, 'grant_kind', _grant_kind);
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_grant_governance(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_grant_governance(uuid, uuid, text, text, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.beskt_revoke_governance(
  _operation_id uuid,
  _grant_id uuid,
  _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _g public.beskt_governance_grants%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED: every governed mutation carries an operation id.'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('beskt_operation:' || _operation_id::text, 0));
  SELECT * INTO _g FROM public.beskt_governance_grants g WHERE g.revoke_operation_id = _operation_id;
  IF FOUND THEN
    IF _g.revoked_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'BESKT_OPERATION_ACTOR_MISMATCH: operation % belongs to another actor.', _operation_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF _g.id IS DISTINCT FROM _grant_id OR _g.revoke_reason IS DISTINCT FROM btrim(_reason) THEN
      RAISE EXCEPTION 'BESKT_OPERATION_PAYLOAD_MISMATCH: operation % was recorded with a different request.', _operation_id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN jsonb_build_object('grant_id', _g.id, 'revoked_at', _g.revoked_at);
  END IF;
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'BESKT_NOT_PLATFORM_ADMIN: governance grants are revoked by a platform admin only.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'BESKT_REASON_REQUIRED: a revocation carries a written reason.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _g FROM public.beskt_governance_grants g WHERE g.id = _grant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BESKT_GRANT_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _g.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'BESKT_GRANT_ALREADY_REVOKED' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('beskt.governance_grant_write', 'on', true);
  UPDATE public.beskt_governance_grants
     SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = btrim(_reason),
         revoke_operation_id = _operation_id
   WHERE id = _grant_id;
  PERFORM set_config('beskt.governance_grant_write', 'off', true);
  RETURN jsonb_build_object('grant_id', _grant_id, 'revoked_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_revoke_governance(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_revoke_governance(uuid, uuid, text) TO authenticated, service_role;


-- 7.12 The read contract: the published governed content a caller is
--      authorised to read, as one document. Drafts, suspended and retired
--      versions are refused; release_scope is synthetic_internal_only, so
--      only governance readers and explicit internal-QA grantees read
--      anything, and security-vetting content reaches governance only.
--      Nothing here starts anything.
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


-- ###########################################################################
-- SECTION 8 -- RLS, revokes, grants and policies
-- ###########################################################################
--
-- Every BESKT table: ENABLE and FORCE ROW LEVEL SECURITY, revoked to zero
-- for PUBLIC, anon and authenticated (Supabase's default privileges grant
-- both the full set on every new table -- silence would be a grant), then
-- SELECT re-granted to authenticated behind one governance-reader policy.
-- No INSERT, UPDATE or DELETE grant or policy exists for any client role:
-- there is no authoring UI in PR 2, so there is no client writer. Employer
-- principals reach published recruitment-support content through the read
-- RPC only, never through a table.
-- ---------------------------------------------------------------------------

ALTER TABLE public.beskt_method_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_method_versions         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_exposure_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_exposure_profiles       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_activation_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_activation_requirements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_sections                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_sections                FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_items                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_items                   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_item_options            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_item_options            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_prompts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_prompts                 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_routing_rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_routing_rules           FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_evidence_anchors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_evidence_anchors        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_observation_fields      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_observation_fields      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_method_reviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_method_reviews          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_method_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_method_events           FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_governance_grants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beskt_governance_grants       FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.beskt_method_versions         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.beskt_exposure_profiles       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.beskt_activation_requirements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.beskt_sections                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.beskt_items                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.beskt_item_options            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.beskt_prompts                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.beskt_routing_rules           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.beskt_evidence_anchors        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.beskt_observation_fields      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.beskt_method_reviews          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.beskt_method_events           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.beskt_governance_grants       FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.beskt_method_versions         TO authenticated;
GRANT SELECT ON public.beskt_exposure_profiles       TO authenticated;
GRANT SELECT ON public.beskt_activation_requirements TO authenticated;
GRANT SELECT ON public.beskt_sections                TO authenticated;
GRANT SELECT ON public.beskt_items                   TO authenticated;
GRANT SELECT ON public.beskt_item_options            TO authenticated;
GRANT SELECT ON public.beskt_prompts                 TO authenticated;
GRANT SELECT ON public.beskt_routing_rules           TO authenticated;
GRANT SELECT ON public.beskt_evidence_anchors        TO authenticated;
GRANT SELECT ON public.beskt_observation_fields      TO authenticated;
GRANT SELECT ON public.beskt_method_reviews          TO authenticated;
GRANT SELECT ON public.beskt_method_events           TO authenticated;
GRANT SELECT ON public.beskt_governance_grants       TO authenticated;

GRANT ALL ON public.beskt_method_versions         TO service_role;
GRANT ALL ON public.beskt_exposure_profiles       TO service_role;
GRANT ALL ON public.beskt_activation_requirements TO service_role;
GRANT ALL ON public.beskt_sections                TO service_role;
GRANT ALL ON public.beskt_items                   TO service_role;
GRANT ALL ON public.beskt_item_options            TO service_role;
GRANT ALL ON public.beskt_prompts                 TO service_role;
GRANT ALL ON public.beskt_routing_rules           TO service_role;
GRANT ALL ON public.beskt_evidence_anchors        TO service_role;
GRANT ALL ON public.beskt_observation_fields      TO service_role;
GRANT ALL ON public.beskt_method_reviews          TO service_role;
GRANT ALL ON public.beskt_method_events           TO service_role;
GRANT ALL ON public.beskt_governance_grants       TO service_role;

-- One decision, one predicate: governance readers only. Platform content
-- roles and platform admins; never an employer member, a candidate or anon.
CREATE POLICY beskt_method_versions_governance_read ON public.beskt_method_versions
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY beskt_exposure_profiles_governance_read ON public.beskt_exposure_profiles
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY beskt_activation_requirements_governance_read ON public.beskt_activation_requirements
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY beskt_sections_governance_read ON public.beskt_sections
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY beskt_items_governance_read ON public.beskt_items
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY beskt_item_options_governance_read ON public.beskt_item_options
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY beskt_prompts_governance_read ON public.beskt_prompts
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY beskt_routing_rules_governance_read ON public.beskt_routing_rules
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY beskt_evidence_anchors_governance_read ON public.beskt_evidence_anchors
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY beskt_observation_fields_governance_read ON public.beskt_observation_fields
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY beskt_method_reviews_governance_read ON public.beskt_method_reviews
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY beskt_method_events_governance_read ON public.beskt_method_events
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));
CREATE POLICY beskt_governance_grants_governance_read ON public.beskt_governance_grants
  FOR SELECT TO authenticated USING (public.scp_interview_can_read(auth.uid()));

-- ---------------------------------------------------------------------------
-- The shared identity table: the Phase 1 editor policies let a content
-- editor INSERT and UPDATE scp_interview_packs directly. With pack_kind on
-- the table that would let an editor mint or alter a BESKT identity outside
-- the BESKT contract, its idempotency, its ledger and its immutability. The
-- two policies are re-created with the same names and the same authority,
-- scoped to role_interview rows only; the role-interview flow is unchanged.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS scp_interview_packs_editor_insert ON public.scp_interview_packs;
DROP POLICY IF EXISTS scp_interview_packs_editor_update ON public.scp_interview_packs;
CREATE POLICY scp_interview_packs_editor_insert ON public.scp_interview_packs
  FOR INSERT TO authenticated
  WITH CHECK (public.scp_interview_can_edit(auth.uid()) AND pack_kind = 'role_interview');
CREATE POLICY scp_interview_packs_editor_update ON public.scp_interview_packs
  FOR UPDATE TO authenticated
  USING (public.scp_interview_can_edit(auth.uid()) AND pack_kind = 'role_interview')
  WITH CHECK (public.scp_interview_can_edit(auth.uid()) AND pack_kind = 'role_interview');


-- ###########################################################################
-- SECTION 9 -- Postflight catalogue assertions
-- ###########################################################################
--
-- The migration refuses to complete unless the database it leaves behind has
-- the properties this PR claims. Inspected from the catalogue, not assumed.
-- ---------------------------------------------------------------------------

DO $proof$
DECLARE
  _tables text[] := ARRAY[
    'beskt_method_versions', 'beskt_exposure_profiles', 'beskt_activation_requirements',
    'beskt_sections', 'beskt_items', 'beskt_item_options', 'beskt_prompts',
    'beskt_routing_rules', 'beskt_evidence_anchors', 'beskt_observation_fields',
    'beskt_method_reviews', 'beskt_method_events', 'beskt_governance_grants'];
  _t text;
  _n integer;
  _src text;
  _fn text;
  _priv text;
BEGIN
  -- Every BESKT table exists with ENABLE and FORCE RLS, zero client write
  -- privilege, and no privilege at all for anon or PUBLIC.
  FOREACH _t IN ARRAY _tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = _t AND c.relkind = 'r'
                      AND c.relrowsecurity AND c.relforcerowsecurity) THEN
      RAISE EXCEPTION 'BESKT_PROOF: % is missing or does not carry ENABLE and FORCE ROW LEVEL SECURITY.', _t;
    END IF;
    FOREACH _priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege('authenticated', 'public.' || _t, _priv)
         OR has_table_privilege('anon', 'public.' || _t, _priv) THEN
        RAISE EXCEPTION 'BESKT_PROOF: a client role holds % on %.', _priv, _t;
      END IF;
    END LOOP;
    IF has_table_privilege('anon', 'public.' || _t, 'SELECT') THEN
      RAISE EXCEPTION 'BESKT_PROOF: anon can read %.', _t;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                WHERE g.table_schema = 'public' AND g.table_name = _t AND g.grantee = 'PUBLIC') THEN
      RAISE EXCEPTION 'BESKT_PROOF: PUBLIC holds a grant on %.', _t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = _t AND p.cmd <> 'SELECT') THEN
      RAISE EXCEPTION 'BESKT_PROOF: % carries a write policy; no client writer may exist.', _t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = _t
                  AND (p.qual IS NULL OR p.qual = 'true')) THEN
      RAISE EXCEPTION 'BESKT_PROOF: % carries an unconditional policy.', _t;
    END IF;
  END LOOP;

  -- No forbidden column anywhere in the BESKT domain: no score, level,
  -- weight, threshold, total, rank, pass/fail, suitability, credibility,
  -- truthfulness, recommendation, risk or verdict.
  SELECT count(*) INTO _n FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name LIKE 'beskt\_%' ESCAPE '\'
     AND (c.column_name ~* '(score|level|weight|threshold|total|rank|pass|fail|suitab|credib|truthful|recommend|risk|verdict|probab|sentiment|emotion|deception|hire)'
          OR c.column_name = 'points');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BESKT_PROOF: % forbidden column(s) exist in the BESKT domain.', _n;
  END IF;
  -- And no jsonb column outside the governance ledger, so no scoring key can
  -- hide inside content.
  SELECT count(*) INTO _n FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name LIKE 'beskt\_%' ESCAPE '\'
     AND c.data_type = 'jsonb' AND c.table_name <> 'beskt_method_events';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BESKT_PROOF: a governed content table carries a jsonb column.';
  END IF;
  -- No candidate, application, job, case, session or report reference.
  SELECT count(*) INTO _n FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name LIKE 'beskt\_%' ESCAPE '\'
     AND c.column_name ~* '(candidate|applicant|application|job_id|employer_id|case_id|session|assignment|response|answer_value|report)';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BESKT_PROOF: a BESKT content table references candidate runtime data.';
  END IF;

  -- Every beskt_ function pins its search_path; no beskt_ function is
  -- executable by anon or PUBLIC; every trigger function is unreachable by
  -- authenticated; the internal helpers are unreachable by authenticated.
  FOR _fn IN SELECT p.oid::regprocedure::text
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname LIKE 'beskt\_%' ESCAPE '\' LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = _fn::regprocedure
                    AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'BESKT_PROOF: % has no pinned search_path.', _fn;
    END IF;
    IF has_function_privilege('anon', _fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'BESKT_PROOF: anon can execute %.', _fn;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = _fn::regprocedure
                  AND p.prorettype = 'pg_catalog.trigger'::regtype)
       AND has_function_privilege('authenticated', _fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'BESKT_PROOF: trigger function % is executable by authenticated.', _fn;
    END IF;
  END LOOP;
  FOREACH _fn IN ARRAY ARRAY[
      'public.beskt_record_event(uuid,uuid,text,text,text,text,text,integer,uuid,text,jsonb,jsonb)',
      'public.beskt_operation_begin(uuid,text)',
      'public.beskt_lock_version(uuid,integer)',
      'public.beskt_canonical_content(uuid)',
      'public.beskt_method_content_hash(uuid)'] LOOP
    IF has_function_privilege('authenticated', _fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'BESKT_PROOF: internal function % is executable by authenticated.', _fn;
    END IF;
  END LOOP;

  -- The additive discriminator: present, defaulted, backfilled, constrained.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'scp_interview_packs'
                    AND column_name = 'pack_kind' AND is_nullable = 'NO'
                    AND column_default = '''role_interview''::text') THEN
    RAISE EXCEPTION 'BESKT_PROOF: scp_interview_packs.pack_kind is missing or not defaulted to role_interview.';
  END IF;
  SELECT count(*) INTO _n FROM public.scp_interview_packs p WHERE p.pack_kind <> 'role_interview';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BESKT_PROOF: % pre-existing pack(s) are not role_interview after backfill.', _n;
  END IF;
  SELECT count(*) INTO _n FROM public.scp_interview_packs p WHERE p.role_id IS NULL;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BESKT_PROOF: % pre-existing pack(s) lost their role.', _n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'scp_interview_packs'
                    AND column_name = 'role_id' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'BESKT_PROOF: scp_interview_packs.role_id is not conditionally nullable.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scp_interview_packs_role_by_kind_check') THEN
    RAISE EXCEPTION 'BESKT_PROOF: the role-by-kind invariant is missing.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'scp_interview_pack_versions_role_interview_only' AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'scp_interview_packs_kind_immutable' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'BESKT_PROOF: a pack-kind guard trigger is missing.';
  END IF;

  -- The old flow is scoped, by its own source: each re-created function
  -- still exists exactly once with its original signature and now names the
  -- role_interview scope.
  FOREACH _fn IN ARRAY ARRAY[
      'scp_iv_case_start_basis', 'scp_iv_startable_pack_versions', 'scp_iv_create_case',
      'scp_interview_pack_validate', 'scp_interview_create_version'] LOOP
    SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = _fn;
    IF _n <> 1 THEN
      RAISE EXCEPTION 'BESKT_PROOF: % must exist exactly once (found %); an overload would be ambiguous through PostgREST.', _fn, _n;
    END IF;
    SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = _fn;
    IF position('pack_kind = ''role_interview''' in _src) = 0 THEN
      RAISE EXCEPTION 'BESKT_PROOF: % is not scoped to role_interview packs.', _fn;
    END IF;
  END LOOP;
  IF (SELECT pg_get_function_identity_arguments('public.scp_iv_create_case'::regproc))
       <> '_employer_id uuid, _title text, _pack_version_id uuid, _candidate_display_name text, _candidate_user_id uuid, _candidate_external_ref text, _job_id uuid, _application_id uuid' THEN
    RAISE EXCEPTION 'BESKT_PROOF: scp_iv_create_case signature changed.';
  END IF;
  IF (SELECT pg_get_function_identity_arguments('public.scp_interview_create_version'::regproc))
       <> '_pack_id uuid, _locale text, _role_version_id uuid, _source_reference text, _source_document_version text, _summary_sv text' THEN
    RAISE EXCEPTION 'BESKT_PROOF: scp_interview_create_version signature changed.';
  END IF;
  SELECT p.prosrc INTO _src FROM pg_proc p WHERE p.proname = 'scp_iv_create_case';
  IF position('scp_iv_case_start_basis' in _src) = 0 THEN
    RAISE EXCEPTION 'BESKT_PROOF: scp_iv_create_case no longer uses the shared start contract.';
  END IF;
  -- The role-interview content hash was NOT touched: still md5, so every
  -- recorded content_hash_at_review stays checkable.
  SELECT p.prosrc INTO _src FROM pg_proc p WHERE p.proname = 'scp_interview_pack_content_hash';
  IF position('md5(' in _src) = 0 THEN
    RAISE EXCEPTION 'BESKT_PROOF: the role-interview content hash was altered.';
  END IF;

  -- BESKT's own contract, by its own source: a sha256 hash, the seven
  -- evidence states, the five gates, the three activation requirements, and
  -- no 0-4 vocabulary anywhere in the BESKT validator.
  SELECT p.prosrc INTO _src FROM pg_proc p WHERE p.proname = 'beskt_method_content_hash';
  IF position('sha256(' in _src) = 0 OR position('md5(' in _src) > 0 THEN
    RAISE EXCEPTION 'BESKT_PROOF: the BESKT content hash is not core sha256.';
  END IF;
  SELECT p.prosrc INTO _src FROM pg_proc p WHERE p.proname = 'beskt_method_validate';
  FOREACH _t IN ARRAY ARRAY['unaddressed', 'clarification_needed', 'sufficiently_clarified',
      'external_verification_needed', 'conflicting_information', 'insufficient_basis', 'not_applicable',
      'personnel_security', 'senior_hr', 'recruitment', 'employment_privacy_legal', 'data_protection',
      'SV_SECURITY_SENSITIVE_ROLE_NOT_ATTESTED', 'SV_LAWFUL_BASIS_NOT_RECORDED',
      'SV_AUTHORISED_SECURITY_OWNER_NOT_ASSIGNED', 'ROUTE_RECRUITMENT_INTO_SECURITY_VETTING',
      'ROUTE_CYCLE', 'content_hash_at_review = _hash'] LOOP
    IF position(_t in _src) = 0 THEN
      RAISE EXCEPTION 'BESKT_PROOF: the BESKT validator no longer names %.', _t;
    END IF;
  END LOOP;
  IF _src ~* '(rating_anchor|competenc|level between|counts_toward_aggregation)' THEN
    RAISE EXCEPTION 'BESKT_PROOF: the BESKT validator reads the role-interview 0-4 contract.';
  END IF;

  -- The shared identity table: editor DML stays scoped to role_interview.
  IF (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'scp_interview_packs'
        AND p.policyname IN ('scp_interview_packs_editor_insert', 'scp_interview_packs_editor_update')
        AND coalesce(p.with_check, '') LIKE '%pack_kind = ''role_interview''%') <> 2 THEN
    RAISE EXCEPTION 'BESKT_PROOF: the editor DML policies on scp_interview_packs are not scoped to role_interview.';
  END IF;
  -- One open version per method is a database invariant.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'beskt_method_versions_one_open_idx'
                  AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%(pack_id, open_slot)%') THEN
    RAISE EXCEPTION 'BESKT_PROOF: the one-open-version unique index is missing or exposes pack_id alone as unique.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
              WHERE c.relname = 'beskt_method_versions' AND i.indisunique AND i.indnatts = 1
                AND (SELECT attname FROM pg_attribute WHERE attrelid = i.indrelid AND attnum = i.indkey[0]) = 'pack_id') THEN
    RAISE EXCEPTION 'BESKT_PROOF: pack_id alone must never be unique on beskt_method_versions.';
  END IF;
  IF has_function_privilege('authenticated', 'public.beskt_holds_grant(uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.beskt_reader_access_classes(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'BESKT_PROOF: a governance helper is executable by authenticated.';
  END IF;
  -- The canonical representation is typed jsonb, and reviews bind to the cycle.
  SELECT p.prosrc INTO _src FROM pg_proc p WHERE p.proname = 'beskt_canonical_content';
  IF position('jsonb_build_object' in _src) = 0 OR position('concat_ws(' in _src) > 0 OR position('string_agg(' in _src) > 0 THEN
    RAISE EXCEPTION 'BESKT_PROOF: the canonical representation is not the typed jsonb document.';
  END IF;
  SELECT p.prosrc INTO _src FROM pg_proc p WHERE p.proname = 'beskt_method_validate';
  IF position('rv.review_cycle_at_review = _v.review_cycle' in _src) = 0 THEN
    RAISE EXCEPTION 'BESKT_PROOF: review approvals are not bound to the review cycle.';
  END IF;
  SELECT p.prosrc INTO _src FROM pg_proc p WHERE p.proname = 'beskt_record_review';
  IF position('beskt_holds_grant(auth.uid(), _gate)' in _src) = 0 THEN
    RAISE EXCEPTION 'BESKT_PROOF: review recording does not check a gate grant.';
  END IF;

  -- Append-only triggers on reviews, events and grants, for both UPDATE and DELETE.
  FOREACH _t IN ARRAY ARRAY['beskt_method_reviews_append_only', 'beskt_method_events_append_only',
                            'beskt_governance_grants_append_only'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = _t AND NOT t.tgisinternal
                    AND (t.tgtype & 16) = 16 AND (t.tgtype & 8) = 8) THEN
      RAISE EXCEPTION 'BESKT_PROOF: % is missing or does not cover both UPDATE and DELETE.', _t;
    END IF;
  END LOOP;

  -- No BESKT method content was seeded: the domain leaves the migration
  -- empty, and nothing is published.
  SELECT count(*) INTO _n FROM public.beskt_method_versions;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BESKT_PROOF: % method version(s) were seeded; PR 2 seeds no method content.', _n;
  END IF;

  RAISE NOTICE 'BESKT_GOVERNED_CONTENT_PROOF ok';
END
$proof$;
