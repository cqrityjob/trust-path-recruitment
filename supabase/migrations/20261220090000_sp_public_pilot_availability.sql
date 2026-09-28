-- =============================================================================
-- Security Passport -- public-pilot availability, and the operation policy (G3)
-- =============================================================================
--
-- PR 2 of the completion work order (docs/passport/completion-work-order.md,
-- revision 3). NO DATA MOVES: no market pack, definition or claim changes
-- state here. This file adds the availability state and teaches every layer
-- to honour it; opening the UK and Dubai to it is a separate data migration.
--
-- ── 1. A THIRD AVAILABILITY STATE: public_pilot ─────────────────────────
--
-- `pilot_state` on market packs and definitions gains 'public_pilot': any
-- signed-in holder may register, with no individual grant. It is ORTHOGONAL
-- to is_active and to legal_review_state, as internal_pilot is:
--   * is_active stays false, so nothing here says a credential is approved;
--   * sp_market_pack_active_needs_review is untouched: a pack still cannot be
--     made active while its legal review is pending;
--   * no review state is edited. A public pilot changes catalogue availability
--     and permission to register -- nothing about trust, legal review or
--     anyone's permission to work.
-- sp_pilot_members, its rows and its RPCs stay as history; nothing new
-- depends on a grant.
--
-- Every layer that decides availability admits it, and must agree:
--   * sp_market_access() reports 'public_pilot' for a public-pilot pack to
--     any signed-in user (the canonical market decision);
--   * the sp_credential_types read policy admits public-pilot definitions of
--     a public-pilot market (catalogue metadata inherits it);
--   * sp_approved_credential_catalogue admits them (Route B);
--   * sp_claims_credential_rules admits them on the write path. The save RPC
--     and the closed-catalogue guards read the view, so they follow.
--
-- ── 2. THE OPERATION POLICY (G3) ────────────────────────────────────────
--
-- Which writes need availability, for each state of the definition:
--
--   operation                              available  withdrawn  grant revoked
--   new registration (INSERT)              yes        refused    refused
--   correction (successor INSERT)          yes        refused    refused
--   change of credential or jurisdiction   refused outright (SP_DEFINITION_IMMUTABLE,
--                                          governed metadata) -- never in place
--   move into 'active' (draft activation,  yes        refused    refused
--     reactivation) -- only the verification workflow may make that move at
--     all (sp_guard_trust_fields_immutable); when it does, it registers
--   in-place change of holder content      yes        refused    refused
--   withdraw / supersede / dispute         yes        yes        yes
--   review decision (trust fields only)    yes        yes        yes
--   review decision that re-dates it       yes        refused    refused
--     (valid_from / valid_until are holder content)
--   evidence (trust fields, evidence rows) yes        yes        yes
--
-- "yes" means availability does not stand in the way; who may act is still
-- decided by row-level security, the trust-field guard and the reviewer RPCs,
-- unchanged. Before this file the market gate ran on EVERY update and tested
-- the ACTING user's grant, so review and maintenance failed for anyone
-- without one. The predicate that separates the two kinds of write is the one
-- sp_closed_catalogue_claim_guard already uses, word for word. It keys on
-- WHAT the write changes, never on a session setting: sp.verification_context
-- can be set by any role, so it can never be what exempts a write.
--
-- ── 3. ERROR TEXT ───────────────────────────────────────────────────────
--
-- SP_MARKET_PACK_NOT_ACTIVE now says a market is not open for new
-- registration, instead of naming the legal review as the reason.
--
-- ── 4. THE REVIEW QUEUE NAMES THE TERRITORY ─────────────────────────────
--
-- sp_verifier_queue named the COUNTRY only, so the list a reviewer chooses
-- from read "United Arab Emirates" for a Dubai licence and "United Kingdom"
-- for a Northern Irish one. The review detail and the dispute queue already
-- carry `sub_jurisdiction`; the queue now returns it too. One key is added;
-- the authority check, every other key and the grants are unchanged, and an
-- application that does not read the key is unaffected.
--
-- No new object: two CHECK constraints are widened, one policy and four
-- bodies are replaced. The application's generated types are unaffected.
-- Rollback: supabase/rollback/20261220090000_sp_public_pilot_availability_rollback.sql
-- =============================================================================

-- ── 1. The state ─────────────────────────────────────────────────────────
ALTER TABLE public.sp_market_packs DROP CONSTRAINT sp_market_pack_pilot_state_known;
ALTER TABLE public.sp_market_packs ADD CONSTRAINT sp_market_pack_pilot_state_known
  CHECK (pilot_state IN ('closed', 'internal_pilot', 'public_pilot'));
ALTER TABLE public.sp_credential_types DROP CONSTRAINT sp_credential_type_pilot_state_known;
ALTER TABLE public.sp_credential_types ADD CONSTRAINT sp_credential_type_pilot_state_known
  CHECK (pilot_state IN ('closed', 'internal_pilot', 'public_pilot'));

COMMENT ON COLUMN public.sp_market_packs.pilot_state IS
  'Who may register credentials in this market while it is not active: '
  'closed (nobody), internal_pilot (named pilot members), public_pilot (every '
  'signed-in holder, no grant). ORTHOGONAL to is_active and to '
  'legal_review_state, and NEVER a substitute for either: a pilot means the '
  'owner has opened registration, not that a regulator or lawyer has approved '
  'this content. Public, legally cleared availability remains is_active alone.';
COMMENT ON COLUMN public.sp_credential_types.pilot_state IS
  'Whether this credential may be registered while its market is in a pilot: '
  'internal_pilot for that market''s pilot members, public_pilot for every '
  'signed-in holder when the market is public_pilot too, closed to hold it '
  'back. Orthogonal to is_active, which remains the production publication '
  'flag and is unchanged by piloting.';

-- ── 2. The canonical market decision ─────────────────────────────────────
-- Reproduced VERBATIM from 20261109090000 with one branch ADDED.
CREATE OR REPLACE FUNCTION public.sp_market_access(_user_id uuid, _market_pack_code text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL AND _user_id IS NOT NULL AND _caller <> _user_id
     AND NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION
      'SP_PILOT_MEMBERSHIP_PRIVATE: a pilot entitlement is visible to its holder and to platform administrators only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- COALESCE, not a join: an unknown market code returns no row at all, and a
  -- function that returns NULL where the caller expects a state is how a
  -- closed market becomes an unhandled case at the call site.
  RETURN COALESCE(
    (SELECT CASE
       WHEN p.is_active THEN 'production'
       WHEN p.pilot_state = 'internal_pilot'
            AND public.sp_is_pilot_member(_user_id, p.code) THEN 'pilot'
       -- ADDED 20261220090000: a public-pilot market, for any signed-in user.
       -- Not 'production': the market is not legally cleared, and the caller
       -- must be able to say so.
       WHEN p.pilot_state = 'public_pilot' AND _user_id IS NOT NULL THEN 'public_pilot'
       ELSE 'closed'
     END
     FROM public.sp_market_packs p
     WHERE p.code = _market_pack_code AND p.superseded_on IS NULL),
    'closed');
END $$;

REVOKE ALL ON FUNCTION public.sp_market_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_market_access(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.sp_market_access(uuid, text) IS
  'How this user may reach this market: production (public, legally cleared), '
  'pilot (internal_pilot AND entitled), public_pilot (public pilot, any '
  'signed-in user, legal review unchanged), or closed. The caller is told '
  'WHICH, because a pilot market must be presented as a pilot market. Answers '
  'about the caller, or about anyone for a platform administrator; refuses '
  'otherwise.';

-- ── 3. Who may read a definition ─────────────────────────────────────────
-- Reproduced VERBATIM from 20261109090000 with one branch ADDED.
DROP POLICY IF EXISTS sp_credential_types_read ON public.sp_credential_types;
CREATE POLICY sp_credential_types_read ON public.sp_credential_types
  FOR SELECT TO authenticated
  USING (
    is_active
    OR (
      pilot_state = 'internal_pilot'
      AND market_pack_code IS NOT NULL
      AND public.sp_market_access(auth.uid(), market_pack_code) = 'pilot'
    )
    -- ADDED 20261220090000
    OR (
      pilot_state = 'public_pilot'
      AND market_pack_code IS NOT NULL
      AND public.sp_market_access(auth.uid(), market_pack_code) = 'public_pilot'
    )
    OR EXISTS (
      SELECT 1 FROM public.sp_claims c
       WHERE c.holder_user_id = auth.uid()
         AND c.credential_code = public.sp_credential_types.code
    )
  );

COMMENT ON POLICY sp_credential_types_read ON public.sp_credential_types IS
  'Production types for every holder; internal-pilot types only for a holder '
  'whose sp_market_access() for that market pack is ''pilot''; public-pilot '
  'types for every holder whose sp_market_access() is ''public_pilot''; plus '
  'the types of the holder''s own existing claims. Never anon.';

GRANT SELECT ON public.sp_credential_types TO authenticated;
REVOKE ALL ON public.sp_credential_types FROM anon;

-- ── 4. The catalogue view: Route B added ─────────────────────────────────
-- Reproduced VERBATIM from 20261214090000 with the lines marked ADDED.
CREATE OR REPLACE VIEW public.sp_approved_credential_catalogue WITH (security_invoker=true,security_barrier=true) AS
SELECT t.code, t.claim_type, t.name_sv, t.name_en,
 coalesce(m.credential_class,CASE t.claim_type WHEN 'licence' THEN 'regulated_authorisation' WHEN 'training' THEN 'mandatory_training' ELSE 'certification' END) AS credential_class,
 t.scope_code, t.jurisdiction_code AS country, t.sub_jurisdiction_code AS region,
 CASE WHEN EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific)
      THEN NULL::uuid ELSE coalesce(i.id,a.id) END AS issuer_id,
 CASE WHEN EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific)
      THEN NULL::text ELSE coalesce(i.display_name,a.name_local) END AS issuer_name,
 coalesce(d.programme_url,a.official_url) AS official_url,
 coalesce(d.public_verification_url,i.public_verification_url) AS verification_url,
 i.verification_mode, t.requires_valid_until, t.allows_no_expiry,
 t.reference_pattern, m.original_language,
 d.maintenance_summary_en, t.typical_validity_months
FROM public.sp_credential_types t
LEFT JOIN public.sp_certification_definitions d ON d.credential_code=t.code
LEFT JOIN public.sp_certification_issuers i ON i.id=d.issuer_id AND i.is_active
 AND i.effective_from<=current_date AND (i.effective_to IS NULL OR i.effective_to>current_date)
LEFT JOIN public.sp_authorities a ON a.id=t.authority_id AND a.is_active
LEFT JOIN public.sp_credential_definition_metadata m ON m.credential_code=t.code
WHERE
 -- The DEFINITION must be approved (is_active) for everyone alike: pilot
 -- membership opens a market, it never approves a definition.
 -- A scoped definition (SV, a SIRA cadre card) is in the catalogue: the scope is a
 -- REQUIRED holder field enforced by the write path, not a reason to withhold it.
 --
 -- ROUTE A (owner decision, 2026-09-18). A definition is admitted when it is
 -- approved for everyone (is_active), OR when ALL of these hold: the definition
 -- itself is internal_pilot; ITS OWN market pack is internal_pilot and not
 -- active; and the caller holds a valid membership of THAT pack. The owner's
 -- per-definition pilot authorisation (20260915090000) is what is honoured:
 -- is_active stays false, so the day a pack is activated publicly a pilot-only
 -- definition is offered to NOBODY until it is approved on its own. A single
 -- definition is held back by setting its pilot_state to 'closed'.
 --
 -- ROUTE B (ADDED 20261220090000, the public pilot). A definition is also
 -- admitted when the definition AND its own market pack are both public_pilot,
 -- the pack is not active and not superseded, and the caller is signed in.
 -- No grant is asked for and is_active stays false: a public pilot opens
 -- registration, it approves nothing. Held back the same way as Route A, by
 -- setting the definition's pilot_state to 'closed'.
 (t.is_active
  OR (t.pilot_state='internal_pilot' AND t.market_pack_code IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.sp_market_packs pp WHERE pp.code=t.market_pack_code
                   AND pp.pilot_state='internal_pilot' AND NOT pp.is_active AND pp.superseded_on IS NULL)
      AND public.sp_is_pilot_member(auth.uid(), t.market_pack_code))
  OR (t.pilot_state='public_pilot' AND t.market_pack_code IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.sp_market_packs pp WHERE pp.code=t.market_pack_code
                   AND pp.pilot_state='public_pilot' AND NOT pp.is_active AND pp.superseded_on IS NULL)
      AND auth.uid() IS NOT NULL))
 AND m.deprecated_at IS NULL
 -- GUARDED RELEASE. A definition that needs a holder-written scope or a
 -- document-stated issuer can only be saved by an application that sends those
 -- fields. Over the REST LISTING of this view, such a row is offered only to a
 -- caller that declares the contract (header x-passport-catalogue-contract: 2).
 -- An application deployed before this migration sends no such header and is
 -- therefore never offered a credential its form cannot save. Every other
 -- reader — the save RPC, the table guards, SQL — sees the full catalogue.
 AND (NOT (t.requires_scope OR EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r
            WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific))
      OR coalesce(current_setting('request.path', true),'') <> '/sp_approved_credential_catalogue'
      OR coalesce(nullif(current_setting('request.headers', true),'')::json->>'x-passport-catalogue-contract','') = '2')
 AND (d.effective_from IS NULL OR d.effective_from<=current_date)
 AND (d.retired_on IS NULL OR d.retired_on>current_date)
 AND public.sp_is_passport_credential(t.claim_type,t.code)
 AND ((t.scope_code='global_professional' AND i.id IS NOT NULL)
 OR (t.scope_code='national_regulated'
 -- The issuer is a governed authority, OR the governed organisation-role model
 -- says the issuer is stated on the document (an awarding organisation or an
 -- authorised training provider) under a governed, active REGULATOR.
 AND (a.id IS NOT NULL OR (
   EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r
            WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific)
   AND EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r
            JOIN public.sp_authorities ra ON ra.id=r.authority_id AND ra.is_active
            WHERE r.credential_code=t.code AND r.role='regulator')))
 AND EXISTS (SELECT 1 FROM public.sp_jurisdictions j WHERE j.code=t.jurisdiction_code AND j.is_active)
 AND (t.sub_jurisdiction_code IS NULL OR EXISTS (SELECT 1 FROM public.sp_sub_jurisdictions j WHERE j.code=t.sub_jurisdiction_code AND j.is_active))
 AND EXISTS (
   SELECT 1 FROM public.sp_market_packs p WHERE p.code=t.market_pack_code
   -- An active market, or an internal-pilot market for its own pilot member:
   -- the same two states sp_market_access() reports as 'production' / 'pilot'.
   -- ADDED 20261220090000: or a public-pilot market for any signed-in holder,
   -- the third state sp_market_access() reports, 'public_pilot'.
   AND (p.is_active
        OR (p.pilot_state='internal_pilot' AND public.sp_is_pilot_member(auth.uid(), p.code))
        OR (p.pilot_state='public_pilot' AND auth.uid() IS NOT NULL))
   AND p.superseded_on IS NULL
   AND p.jurisdiction_code=t.jurisdiction_code
   AND p.sub_jurisdiction_code IS NOT DISTINCT FROM t.sub_jurisdiction_code))
 -- ADDED 20261214090000. A NATIONAL QUALIFICATION carries no market rules
 -- (sp_credential_type_national_qualification_bound), so it needs no market
 -- pack: it is offered when it is approved (is_active, above), its country is
 -- active, the organisation-role model says its issuer is stated on the
 -- certificate, and a governed, active regulator of THAT country is recorded.
 OR (t.scope_code='national_qualification'
  AND t.market_pack_code IS NULL AND t.sub_jurisdiction_code IS NULL
  AND EXISTS (SELECT 1 FROM public.sp_jurisdictions j WHERE j.code=t.jurisdiction_code AND j.is_active)
  AND EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r
               WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific)
  AND EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r
               JOIN public.sp_authorities ra ON ra.id=r.authority_id AND ra.is_active
                AND ra.jurisdiction_code=t.jurisdiction_code
               WHERE r.credential_code=t.code AND r.role='regulator')));

-- Re-stated, not assumed: a replaced view keeps its grants, and this says so.
REVOKE ALL ON public.sp_approved_credential_catalogue FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sp_approved_credential_catalogue TO authenticated,service_role;

-- ── 5. The claim rules: the operation policy and the public pilot ────────
-- Reproduced VERBATIM from 20261214090000 with the lines marked ADDED or
-- CHANGED.
CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
DECLARE
  _t    public.sp_credential_types%ROWTYPE;
  _pack public.sp_market_packs%ROWTYPE;
  _country_needs_sub boolean;
  _prev_scope text;
  _scope_missing boolean;
  _pilot_market boolean := false;
  _governed_issuer text;
  _public_pilot_market boolean := false;
  _asserts boolean;
BEGIN
  -- ── ADDED 20261220090000: the operation policy ─────────────────────
  --
  -- Which writes need the market open to the ACTOR. Until now the market gate
  -- below ran on every UPDATE and asked whether the acting user held a pilot
  -- membership, so a reviewer without one could not record a decision on a
  -- GB or Dubai claim, and after a withdrawal or a revocation the holder could
  -- not archive a claim they already had, or add evidence to it (G3).
  --
  -- A write ASSERTS the credential anew, and needs availability, when it is:
  --   * an INSERT: a new registration, or the successor a correction writes;
  --   * an UPDATE that moves the claim INTO 'active': activating a draft, or
  --     reactivating a withdrawn, expired, disputed or revoked claim;
  --   * an UPDATE that changes anything beyond the lifecycle state and the
  --     trust fields: the credential, its jurisdiction, or holder content.
  -- Every other UPDATE is maintenance or review of an existing claim --
  -- withdrawing it, superseding it, disputing it, a review decision, the
  -- trust change evidence brings -- and never needs the market open. WHO may
  -- perform it is still decided where it always was (row-level security, the
  -- trust-field guard, the reviewer RPCs); availability no longer stands in
  -- for authorisation.
  --
  -- The predicate is the one sp_closed_catalogue_claim_guard uses to exempt
  -- maintenance, word for word, so the two write layers cannot disagree about
  -- what counts as registration.
  _asserts := NOT (TG_OP = 'UPDATE'
    AND NOT (OLD.lifecycle_state <> 'active' AND NEW.lifecycle_state = 'active')
    AND (to_jsonb(NEW) - ARRAY['lifecycle_state','assertion_level','verified_by_user_id','verified_at','updated_at'])
        IS NOT DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['lifecycle_state','assertion_level','verified_by_user_id','verified_at','updated_at']));

  -- ── The market gate ────────────────────────────────────────────────
  --
  -- Scoped to regulated credentials. A claim that names no credential_code is
  -- a language, a practical capability or a general certificate; its
  -- jurisdiction is PROVENANCE — where the thing came from — and provenance is
  -- a fact about the holder's history, not a request to register a regulated
  -- authorisation in a market.
  --
  -- A global certification carries no jurisdiction at all, so it never enters
  -- this block: it is available to a holder in Sweden, in Dubai, in a country
  -- with no market pack and to a holder who has stated no country, and it
  -- needs no pilot entitlement to be recorded.
  --
  -- ADDED 20261214090000: a national qualification of its OWN jurisdiction
  -- skips the market gate, for the reason a global certification does: it
  -- authorises nothing, so there is no market rule to enforce. Only the exact
  -- pairing is exempt -- the definition's own country, no sub-jurisdiction --
  -- and everything below (availability, jurisdiction match, title, reference)
  -- still runs.
  --
  -- CHANGED 20261220090000: the gate runs only for a write that asserts the
  -- credential anew (the operation policy above).
  IF _asserts AND NEW.credential_code IS NOT NULL AND NEW.jurisdiction_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.sp_credential_types q
                      WHERE q.code = NEW.credential_code
                        AND q.scope_code = 'national_qualification'
                        AND q.market_pack_code IS NULL
                        AND q.jurisdiction_code = NEW.jurisdiction_code
                        AND NEW.sub_jurisdiction_code IS NULL) THEN
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
      _pilot_market := _pack.pilot_state = 'internal_pilot'
                       AND public.sp_is_pilot_member(auth.uid(), _pack.code);
      -- ADDED 20261220090000: a public-pilot market is open to every
      -- signed-in holder, without a grant. is_active and the legal review stay
      -- exactly as they are; this is availability, not approval.
      _public_pilot_market := _pack.pilot_state = 'public_pilot'
                              AND auth.uid() IS NOT NULL;
      IF NOT (_pilot_market OR _public_pilot_market) THEN
        -- CHANGED 20261220090000: the message names availability. Naming the
        -- legal review here said a review decides who may register, which a
        -- public pilot with its review still pending contradicts.
        RAISE EXCEPTION
          'SP_MARKET_PACK_NOT_ACTIVE: market pack % is not open for new registration',
          _pack.code
          USING ERRCODE = 'check_violation';
      END IF;
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

  -- ── ADDED 20261111090000: a portable certification stays portable ──
  --
  -- The governed definition, not the submitted row, decides this. A caller
  -- that forges a country onto a global certification is refused here rather
  -- than silently filing a CPP as a Swedish credential.
  IF _t.scope_code = 'global_professional'
     AND (NEW.jurisdiction_code IS NOT NULL OR NEW.sub_jurisdiction_code IS NOT NULL) THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION: % is an international professional certification and is not a credential of %',
      NEW.credential_code, coalesce(NEW.sub_jurisdiction_code, NEW.jurisdiction_code)
      USING ERRCODE = 'check_violation';
  END IF;

  -- CHANGED 20261220090000: admits a public-pilot definition in a public-pilot
  -- market, and applies to every write that asserts the credential anew -- a
  -- reactivation is a registration and can no longer slip past on an UPDATE.
  IF NOT (_t.is_active
          OR (_pilot_market AND _t.pilot_state = 'internal_pilot')
          OR (_public_pilot_market AND _t.pilot_state = 'public_pilot'))
     AND _asserts THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_NOT_AVAILABLE: % is not available yet',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
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

  IF _t.narrow_result_only THEN
    IF NEW.holder_note IS NOT NULL AND length(btrim(NEW.holder_note)) > 0 THEN
      RAISE EXCEPTION
        'SP_CREDENTIAL_NARROW_RESULT_ONLY: % records a checked result and nothing else; no note may be attached',
        NEW.credential_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT _t.title_is_holder_written
     AND (TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title)
     AND btrim(NEW.title) NOT IN (_t.name_sv, _t.name_en) THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_TITLE_CONTROLLED: % is named by its definition (% / %), not by the holder',
      NEW.credential_code, _t.name_sv, _t.name_en
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.reference_pattern IS NOT NULL
     AND NEW.credential_reference IS NOT NULL
     AND length(btrim(NEW.credential_reference)) > 0
     AND btrim(NEW.credential_reference) !~ _t.reference_pattern THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_REFERENCE_FORMAT: % expects a reference matching %',
      NEW.credential_code, _t.reference_pattern
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOTE ON PLACEMENT. This block sits ABOVE the draft early-return below,
  -- and that position is the rule rather than an accident. The early return
  -- exists so an unfinished draft is not blocked by COMPLETENESS rules -- a
  -- missing expiry, a missing scope -- which is right: a holder is still
  -- typing. Issuer identity is not completeness. A draft may be SILENT about
  -- its issuer, and the active check below is guarded on lifecycle_state for
  -- exactly that reason; it may not name the wrong organisation and wait.
  -- Placed after the early return, as it first was here, a forged issuer was
  -- accepted on a draft and simply refused later at activation -- which
  -- stores the false attribution, shows it to the holder as saved, and makes
  -- the refusal arrive at the least useful moment.
  -- ── THE GOVERNED ISSUER ────────────────────────────────────────────
  --
  -- A governed international certification is awarded by ONE organisation,
  -- and the catalogue already knows which: sp_certification_definitions ->
  -- sp_certification_issuers.display_name. Until this rule existed nothing
  -- connected the two on the write path. `claimed_issuer_name` was free text
  -- straight from the client, `authenticated` holds INSERT and UPDATE on its
  -- own sp_claims rows, and sp_disclosure_payload ships the column to a
  -- recipient as 'issuer' -- so a holder could persist INTL_ASIS_CPP with
  -- claimed_issuer_name = 'Fake Corporation', or edit ONLY that column on a
  -- real claim, and the Passport would attribute a governed certification to
  -- an organisation that never awarded it. Reproduced end to end against a
  -- full replay before this migration was written.
  --
  -- The rule is here, in the trigger, rather than in a server function
  -- because the trigger is the only place that binds EVERY caller: the app,
  -- a direct PostgREST write with the holder's own token, and service_role.
  -- A CHECK constraint cannot express it -- the governed name lives in
  -- another table.
  --
  -- WHAT IT DOES NOT DO. It never INFERS an issuer. It does not read the
  -- title, the abbreviation or the issuer-alias table -- those aliases are a
  -- SEARCH vocabulary and storing one would put a name beside somebody's
  -- credential that its issuer does not use. It does not rewrite the
  -- submitted value into the right one either: a silent correction would tell
  -- a holder their input was accepted when it was replaced. It refuses, and
  -- names the governed issuer in the message so the caller can send it.
  --
  -- Nothing here touches a non-global credential. A national credential's
  -- appointing authority and a free-text claim's issuer keep exactly the
  -- semantics they have had since 20260817160000.
  --
  -- IDENTITY, NOT PRESENCE. This rule says WHICH issuer may be stored; it does
  -- not say one must be. Whether a credential must name an issuer at all is
  -- already a property of the catalogue -- sp_credential_types.requires_issuer,
  -- enforced by SP_CREDENTIAL_REQUIRES_ISSUER below -- and all fourteen
  -- governed certifications currently set it false. An earlier draft of this
  -- migration also refused an ACTIVE global claim with a NULL issuer. That was
  -- an over-reach: it contradicted the catalogue's own flag, and it broke
  -- 20261111090000's canonical write-path suite, which files a CPP exactly the
  -- way the product does. An absent issuer is incomplete; it is not a false
  -- attribution, and only false attribution is what this migration exists to
  -- stop. Making the issuer mandatory is a one-row-per-definition data change
  -- (requires_issuer = true) and an owner's decision, not a side effect of a
  -- security fix.
  IF _t.scope_code = 'global_professional' THEN
    SELECT i.display_name INTO _governed_issuer
      FROM public.sp_certification_definitions d
      JOIN public.sp_certification_issuers i ON i.id = d.issuer_id
     WHERE d.credential_code = NEW.credential_code;

    -- Fail CLOSED. A global definition with no certification detail row is a
    -- catalogue that contradicts itself; refusing the write is the only
    -- answer that cannot attribute the credential to nobody in particular.
    IF _governed_issuer IS NULL THEN
      RAISE EXCEPTION
        'SP_GLOBAL_CERTIFICATION_ISSUER_UNKNOWN: % declares an international scope but the catalogue records no issuer for it',
        NEW.credential_code
        USING ERRCODE = 'check_violation';
    END IF;

    -- A draft may be incomplete -- NULL -- while the holder is still filling
    -- it in. It may never carry arbitrary text.
    IF NEW.claimed_issuer_name IS NOT NULL
       AND btrim(NEW.claimed_issuer_name) <> _governed_issuer THEN
      RAISE EXCEPTION
        'SP_GLOBAL_CERTIFICATION_ISSUER_NOT_GOVERNED: % is awarded by %; the issuer may not be stated as %',
        NEW.credential_code, _governed_issuer, NEW.claimed_issuer_name
        USING ERRCODE = 'check_violation';
    END IF;
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

  IF _t.requires_scope
     AND (NEW.authorisation_scope IS NULL OR length(btrim(NEW.authorisation_scope)) = 0) THEN

    _scope_missing := true;

    IF TG_OP = 'UPDATE' THEN
      _scope_missing := (OLD.authorisation_scope IS NOT NULL
                         AND length(btrim(OLD.authorisation_scope)) > 0);

    ELSIF NEW.supersedes_id IS NOT NULL THEN
      SELECT authorisation_scope INTO _prev_scope
        FROM public.sp_claims WHERE id = NEW.supersedes_id;

      _scope_missing := (_prev_scope IS NOT NULL AND length(btrim(_prev_scope)) > 0);
    END IF;

    IF _scope_missing THEN
      RAISE EXCEPTION
        'SP_CREDENTIAL_REQUIRES_SCOPE: % is limited to an employer, principal or protected object and must say which',
        NEW.credential_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $fn$;

-- ── 6. The review queue: the credential's territory ────────────────────
-- The body of 20260818090000, with one key added: 'sub_jurisdiction'.
CREATE OR REPLACE FUNCTION public.sp_verifier_queue(_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _out jsonb;
BEGIN
  IF NOT public.sp_is_verifier(auth.uid()) THEN
    RAISE EXCEPTION 'SP_NOT_VERIFIER' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'submitted_at'), '[]'::jsonb) INTO _out
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'status', r.status,
      'submitted_at', r.submitted_at,
      'subject_type', CASE WHEN r.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
      'holder_name', coalesce(p.display_name, ''),
      -- Whether the caller is the holder. Computed here, from auth.uid(), so
      -- the browser cannot assert it and the answer always matches the guard
      -- inside `sp_verifier_decide`.
      'is_self', (r.holder_user_id = auth.uid()),
      'title', coalesce(c.title, e.role_title),
      'claim_type', c.claim_type,
      'issuer', c.claimed_issuer_name,
      'employer', e.employer_name,
      'jurisdiction', coalesce(c.jurisdiction_code, e.jurisdiction_code),
      -- A Dubai licence is not a UAE-wide one, and a Northern Irish licence
      -- is not a British one: the region is part of what is being reviewed.
      'sub_jurisdiction', c.sub_jurisdiction_code,
      'assertion', coalesce(c.assertion_level, e.assertion_level),
      'lifecycle', coalesce(c.lifecycle_state, e.lifecycle_state),
      'evidence_count', (SELECT count(*) FROM public.sp_evidence ev
                          WHERE ev.lifecycle_state = 'active'
                            AND ((r.claim_id IS NOT NULL AND ev.claim_id = r.claim_id)
                              OR (r.period_id IS NOT NULL AND ev.period_id = r.period_id)))
    ) AS x
    FROM public.sp_verification_requests r
    LEFT JOIN public.sp_claims c              ON c.id = r.claim_id
    LEFT JOIN public.sp_experience_periods e  ON e.id = r.period_id
    LEFT JOIN public.sp_passport_profiles p   ON p.holder_user_id = r.holder_user_id
   WHERE r.request_kind = 'cqrityjob_review'
     AND (_status IS NULL OR r.status = _status)
     AND (_status IS NOT NULL OR r.status IN ('pending','clarification_requested'))
  ) s;

  RETURN _out;
END; $$;

REVOKE ALL ON FUNCTION public.sp_verifier_queue(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_queue(text) TO authenticated;

-- ── 7. Proof ─────────────────────────────────────────────────────────────
DO $$
DECLARE _moved integer; _src text;
BEGIN
  SELECT (SELECT count(*) FROM public.sp_market_packs WHERE pilot_state = 'public_pilot')
       + (SELECT count(*) FROM public.sp_credential_types WHERE pilot_state = 'public_pilot')
    INTO _moved;
  IF _moved <> 0 THEN
    RAISE EXCEPTION 'SP_PUBLIC_PILOT_AVAILABILITY_PROOF: % row(s) are public_pilot; this file moves no data', _moved;
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conname = 'sp_market_pack_active_needs_review'
         AND conrelid = 'public.sp_market_packs'::regclass)
     NOT LIKE '%legal_review_state%' THEN
    RAISE EXCEPTION 'SP_PUBLIC_PILOT_AVAILABILITY_PROOF: the legal gate on is_active is not intact';
  END IF;
  SELECT prosrc INTO _src FROM pg_proc
   WHERE oid = 'public.sp_claims_credential_rules()'::regprocedure;
  IF position('_asserts' IN _src) = 0 OR position('not available yet (legal review' IN _src) > 0 THEN
    RAISE EXCEPTION 'SP_PUBLIC_PILOT_AVAILABILITY_PROOF: the claim rules do not carry the operation policy';
  END IF;
  SELECT prosrc INTO _src FROM pg_proc
   WHERE oid = 'public.sp_verifier_queue(text)'::regprocedure;
  IF position('''sub_jurisdiction''' IN _src) = 0 OR position('SP_NOT_VERIFIER' IN _src) = 0 THEN
    RAISE EXCEPTION 'SP_PUBLIC_PILOT_AVAILABILITY_PROOF: the review queue does not name the territory, or lost its authority check';
  END IF;
  RAISE NOTICE 'SP_PUBLIC_PILOT_AVAILABILITY_PROOF ok';
END $$;
