-- ============================================================================
-- OPEN PILOT ENTITLEMENT — available governed content, not per-employer grants
-- ============================================================================
--
-- Owner decision (2026-08-28): an ACTIVE employer must be able to use
-- CQrityjob's core employer products immediately. Admin governs CONTENT —
-- create, review, version, make available, withdraw, retire — and does NOT
-- manually enable the product employer by employer.
--
-- ── The entitlement rule ────────────────────────────────────────────────────
--
--   BEFORE   usable = published
--                   OR employer-specific pilot grant row
--
--   AFTER    usable = published                                  (production)
--                   OR (version made AVAILABLE for open pilot
--                       AND version still in a pre-publication
--                           review-ladder state)                 (internal_qa)
--                   OR employer-specific pilot grant row         (kept, for
--                       future restricted / private cohorts)
--            AND the employer is ACTIVE
--
--   ACTIVE is enforced on every CASE-CREATION path and on open-pilot
--   discovery. The read entitlement keeps one deliberate exception: a case
--   already pinned to a version stays readable by that employer's members
--   (continuity access to work that exists) -- continuity is not permission
--   to start a new interview, which scp_iv_create_case() refuses for any
--   employer that is not active.
--
-- "Available" is a governed CONTENT property set by the platform publisher on
-- one pack version — the same kind of act as publish/suspend/retire, recorded
-- in the same event ledger — never a per-employer switch.
--
-- ── What deliberately does NOT change ───────────────────────────────────────
--
--   * validation_label stays 'pilot_hypothesis'. Nothing here publishes the
--     pack or upgrades what may be claimed about it scientifically.
--   * Cases on unpublished content still pin under the internal_qa usage
--     mode, so the DRAFT CQrity TRUST method remains valid for them and
--     production still requires an APPROVED method (fails closed today).
--   * scp_interview_pack_pilot_grants survives untouched — table, guard
--     trigger, expiry/cohort logic — as the instrument for restricted
--     cohorts. It is simply no longer REQUIRED for openly available content.
--   * Candidate RLS, tenant isolation, case-pin immutability, the AI
--     fail-closed regime and the no-score/no-ranking rule are untouched.
--
-- ── And one thing gets STRONGER ─────────────────────────────────────────────
--
--   Making a version available for open pilot FREEZES its content: the
--   editable-state decision now also requires 'restricted', so every child
--   content write policy and the governed edit RPCs refuse changes while
--   employers can see the version. Withdraw first, then edit. Before this,
--   a grant-covered draft could in principle drift under a pinned case.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- S1. The availability marker. New versions start restricted: nothing becomes
--     visible to employers merely by being created.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scp_interview_pack_versions
  ADD COLUMN pilot_availability text NOT NULL DEFAULT 'restricted'
  CONSTRAINT scp_interview_pack_versions_pilot_availability_check
  CHECK (pilot_availability IN ('restricted', 'open'));

COMMENT ON COLUMN public.scp_interview_pack_versions.pilot_availability IS
  'Whether this unpublished version is openly available to ACTIVE employers '
  'for pilot use (internal_qa mode). A governed content decision by the '
  'platform publisher via scp_interview_set_pilot_availability(), never a '
  'per-employer switch. Irrelevant once published (published IS available, as '
  'production) and overridden by suspended/retired (refused regardless). '
  'While ''open'' the version''s content is frozen: withdraw first, then edit.';


-- ────────────────────────────────────────────────────────────────────────────
-- S2. Two new ledger event names. The inline CHECK on scp_interview_pack_events
--     is rebuilt once, here, with the full list — its single current home.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE _name text;
BEGIN
  SELECT c.conname INTO _name
    FROM pg_constraint c
   WHERE c.conrelid = 'public.scp_interview_pack_events'::regclass
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) LIKE '%pack_created%';
  IF _name IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_OPEN_PILOT: could not find the pack-events event CHECK constraint.';
  END IF;
  EXECUTE format('ALTER TABLE public.scp_interview_pack_events DROP CONSTRAINT %I', _name);
END $$;

ALTER TABLE public.scp_interview_pack_events
  ADD CONSTRAINT scp_interview_pack_events_event_check CHECK (event IN (
    'pack_created',
    'version_created',
    'draft_updated',
    'submitted_for_expert_review',
    'expert_review_approved',
    'expert_review_rejected',
    'submitted_for_legal_review',
    'legal_review_approved',
    'legal_review_rejected',
    'submitted_for_cognitive_review',
    'cognitive_review_approved',
    'cognitive_review_rejected',
    'submitted_for_product_approval',
    'product_approved',
    'product_rejected',
    'published',
    'suspended',
    'retired',
    'new_version_created',
    'pilot_opened',
    'pilot_withdrawn'));


-- ────────────────────────────────────────────────────────────────────────────
-- S3. Availability freezes content. Every content write policy and governed
--     edit RPC already routes through this one decision, so tightening it
--     here freezes the children without touching any policy.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_interview_version_is_editable(_pack_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.scp_interview_pack_versions v
     WHERE v.id = _pack_version_id
       AND v.content_status IN ('draft', 'expert_review', 'legal_review', 'cognitive_review')
       AND v.pilot_availability = 'restricted');
$$;

COMMENT ON FUNCTION public.scp_interview_version_is_editable(uuid) IS
  'True while a version is a draft or under review AND not open for pilot '
  'use. False from published onward, false while employers can see the '
  'version (withdraw availability first, then edit), and false for a version '
  'that does not exist — so it fails closed.';


-- ────────────────────────────────────────────────────────────────────────────
-- S4. The open-pilot half of the entitlement, in one place.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_open_pilot_available(_pack_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Both halves matter: the governed availability decision AND a live
  -- pre-publication state. Suspending or retiring a version refuses it here
  -- without anyone having to remember to also withdraw availability.
  SELECT EXISTS (
    SELECT 1 FROM public.scp_interview_pack_versions v
     WHERE v.id = _pack_version_id
       AND v.pilot_availability = 'open'
       AND v.content_status IN ('draft', 'expert_review', 'legal_review', 'cognitive_review'));
$$;

-- INTERNAL. No browser principal may call this directly: candidates are
-- authenticated too, and this function names a governed availability state
-- for ANY version id, membership or none. Its only legitimate callers are
-- the SECURITY DEFINER entitlement functions below, which execute as the
-- function owner and therefore need no role grant at all.
REVOKE ALL ON FUNCTION public.scp_iv_open_pilot_available(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scp_iv_open_pilot_available(uuid) TO service_role;

COMMENT ON FUNCTION public.scp_iv_open_pilot_available(uuid) IS
  'INTERNAL: true when this unpublished pack version has been made openly '
  'available for pilot use and is still in a pre-publication review-ladder '
  'state. The open-pilot half of the interview entitlement; the caller '
  'supplies the ACTIVE-employer half. Not executable by browser principals '
  '(anon or authenticated) -- candidates are authenticated principals, and '
  'availability state reaches an employer only through '
  'scp_iv_employer_may_read_pack() / scp_iv_create_case(), which run as the '
  'function owner.';


-- ────────────────────────────────────────────────────────────────────────────
-- S5. Read entitlement. Same structure as before, one branch added; the
--     grant branch and the pinned-case branch survive verbatim.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_employer_may_read_pack(_pack_version_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    -- Published content, for anyone with an active employer membership.
    (EXISTS (SELECT 1 FROM public.scp_interview_pack_versions v
              WHERE v.id = _pack_version_id AND v.content_status = 'published')
     AND EXISTS (SELECT 1 FROM public.employer_memberships em
                  WHERE em.user_id = auth.uid() AND em.status = 'active'))
    -- Openly available pilot content, for members of an ACTIVE employer.
    OR (public.scp_iv_open_pilot_available(_pack_version_id)
        AND EXISTS (SELECT 1 FROM public.employer_memberships em
                     WHERE em.user_id = auth.uid() AND em.status = 'active'
                       AND public.employer_is_active_status(em.employer_id)))
    -- Or a live pilot grant (restricted/private cohorts), expiry- and
    -- cohort-aware.
    OR EXISTS (SELECT 1 FROM public.employer_memberships em
               WHERE em.user_id = auth.uid() AND em.status = 'active'
                 AND public.scp_interview_pilot_grant_active(em.employer_id, _pack_version_id, auth.uid()))
    -- Or a case this user's employer already pinned to it. CONTINUITY
    -- access: work that exists stays readable even if the employer is later
    -- suspended -- deliberately NOT gated on employer_is_active_status().
    -- Continuity is not permission to start anything new; creation is
    -- refused for inactive employers in scp_iv_create_case().
    OR EXISTS (SELECT 1 FROM public.scp_interview_cases c
                JOIN public.employer_memberships em ON em.employer_id = c.employer_id
               WHERE c.pack_version_id = _pack_version_id
                 AND em.user_id = auth.uid() AND em.status = 'active')
  );
$$;

REVOKE ALL ON FUNCTION public.scp_iv_employer_may_read_pack(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_employer_may_read_pack(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_iv_employer_may_read_pack(uuid) IS
  'May the calling employer principal read this pack version and its content? '
  'Published + any active membership; or openly available pilot content + '
  'active membership of an ACTIVE employer; or a live pilot grant; or a case '
  'already pinned to it (continuity access to existing work, deliberately '
  'not re-gated on employer status -- creation is where ACTIVE is enforced). '
  'Every pack content read policy routes through here.';


-- ────────────────────────────────────────────────────────────────────────────
-- S6. Execution entitlement. Latest definition (20260923, TRUST pinning)
--     with three changes: the employer must be ACTIVE, openly available
--     pilot content is usable without a grant, and the audit event records
--     WHICH entitlement basis admitted the case.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_create_case(
  _employer_id uuid, _title text, _pack_version_id uuid, _candidate_display_name text,
  _candidate_user_id uuid DEFAULT NULL, _candidate_external_ref text DEFAULT NULL,
  _job_id uuid DEFAULT NULL, _application_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _pack public.scp_interview_pack_versions%ROWTYPE;
  _usable boolean;
  _method_id uuid;
  _usage text;
  _basis text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner','admin','member']) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_EMPLOYER_MEMBER: creating an interview case requires an active membership of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The product is for ACTIVE employers. A suspended or archived employer
  -- keeps read access to what it already has, but starts nothing new.
  IF NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RAISE EXCEPTION 'SCP_IV_EMPLOYER_NOT_ACTIVE: this employer account is not active, so it cannot start interviews.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _pack FROM public.scp_interview_pack_versions WHERE id = _pack_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_PACK_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  -- Which entitlement admits this case? Published beats open pilot beats
  -- grant, so the audit trail records the STRONGEST basis that applied.
  _basis := CASE
    WHEN _pack.content_status = 'published' THEN 'published'
    WHEN public.scp_iv_open_pilot_available(_pack_version_id) THEN 'open_pilot'
    WHEN public.scp_interview_pilot_grant_active(_employer_id, _pack_version_id, auth.uid())
      THEN 'pilot_grant'
    ELSE NULL
  END;

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

  -- Unpublished content pins under internal_qa, where the DRAFT TRUST method
  -- is valid. Published content is production and requires an APPROVED one.
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
  'Creates an interview case for an ACTIVE employer against a pack version '
  'that is published (production), openly available for pilot use '
  '(internal_qa), or covered by a live pilot grant (internal_qa, restricted '
  'cohorts). Pins the pack version, its content hash and the eligible CQrity '
  'TRUST method version, and records which entitlement basis admitted the case.';


-- ────────────────────────────────────────────────────────────────────────────
-- S7. The governed availability decision. Publisher role — the same authority
--     that publishes, suspends and retires — with a reason, into the ledger.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_interview_set_pilot_availability(
  _pack_version_id uuid,
  _available boolean,
  _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v public.scp_interview_pack_versions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.scp_has_content_role(auth.uid(), 'publisher') THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_NOT_PUBLISHER: changing pilot availability requires the platform publisher role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_REASON_REQUIRED: an availability change must carry a reason.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _v FROM public.scp_interview_pack_versions WHERE id = _pack_version_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  -- Pilot availability is a PRE-PUBLICATION concept. From published onward the
  -- content status governs alone (published IS available, as production;
  -- suspended and retired are withdrawn), the column is frozen by the
  -- version-immutability guard, and a stale 'open' flag is inert because the
  -- entitlement check requires a review-ladder state as well.
  IF _v.content_status NOT IN ('draft', 'expert_review', 'legal_review', 'cognitive_review') THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_NOT_OPENABLE: pilot availability applies to pre-publication content only — this version is "%".',
      _v.content_status USING ERRCODE = 'check_violation';
  END IF;

  IF _available THEN
    IF _v.pilot_availability = 'open' THEN
      RAISE EXCEPTION 'SCP_INTERVIEW_ALREADY_OPEN: this version is already available for pilot use.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- What employers pin must be hashable content, not an empty shell.
    IF _v.content_hash IS NULL THEN
      RAISE EXCEPTION
        'SCP_INTERVIEW_NO_CONTENT_HASH: stamp the version content first — a case pins the hash, so opening an unhashed version would pin nothing.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF _v.pilot_availability = 'restricted' THEN
      RAISE EXCEPTION 'SCP_INTERVIEW_ALREADY_RESTRICTED: this version is not open for pilot use.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.scp_interview_pack_versions
     SET pilot_availability = CASE WHEN _available THEN 'open' ELSE 'restricted' END,
         updated_at = now()
   WHERE id = _pack_version_id;

  PERFORM public.scp_interview_record_event(
    _v.pack_id, _pack_version_id,
    CASE WHEN _available THEN 'pilot_opened' ELSE 'pilot_withdrawn' END,
    _v.content_status, _v.content_status,
    btrim(_reason), _v.content_hash, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.scp_interview_set_pilot_availability(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_set_pilot_availability(uuid, boolean, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_interview_set_pilot_availability(uuid, boolean, text) IS
  'Platform publisher makes one unpublished pack version openly available for '
  'pilot use by ACTIVE employers, or withdraws it. A governed content '
  'decision with a mandatory reason, recorded in the pack event ledger as '
  'pilot_opened / pilot_withdrawn. Opening requires live pre-publication '
  'content with a stamped content hash, and freezes the content until '
  'withdrawn.';


-- ────────────────────────────────────────────────────────────────────────────
-- S8. The owner decision applied to the content it is about: Väktare v1
--     becomes openly available. Conditional — on an environment where the
--     seeded pack is absent or already handled, this is a no-op. It stays
--     draft and stays pilot_hypothesis; nothing here reviews or publishes it.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  _v public.scp_interview_pack_versions%ROWTYPE;
BEGIN
  SELECT ver.* INTO _v
    FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id
   WHERE p.slug = 'vaktare-se' AND ver.version_number = 1
     AND ver.content_status IN ('draft', 'expert_review', 'legal_review', 'cognitive_review')
     AND ver.pilot_availability = 'restricted'
     AND ver.content_hash IS NOT NULL;

  IF _v.id IS NULL THEN
    RAISE NOTICE 'SCP_IV_OPEN_PILOT: no eligible vaktare-se v1 to open, skipping.';
    RETURN;
  END IF;

  UPDATE public.scp_interview_pack_versions
     SET pilot_availability = 'open', updated_at = now()
   WHERE id = _v.id;

  PERFORM public.scp_interview_record_event(
    _v.pack_id, _v.id, 'pilot_opened', _v.content_status, _v.content_status,
    'Ägarbeslut 2026-08-28: pilotinnehåll som är tillgängligt ska kunna användas av aktiva arbetsgivare direkt, utan arbetsgivarspecifikt pilotmedgivande. Paketet förblir en pilothypotes.',
    _v.content_hash, '{}'::jsonb);
END $$;
