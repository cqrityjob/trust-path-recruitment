-- Roll back 20261220090000_sp_public_pilot_availability.
--
-- Restores, VERBATIM, what that file replaced:
--   * sp_approved_credential_catalogue and sp_claims_credential_rules() as
--     20261214090000 left them (Route A only; the market gate on every write,
--     the old SP_MARKET_PACK_NOT_ACTIVE text);
--   * sp_market_access() and the sp_credential_types read policy as
--     20261109090000 left them;
--   * the two pilot_state CHECK constraints and column comments as
--     20260915090000 wrote them (closed, internal_pilot).
--
-- This reinstates the defect the forward file fixes (G3): a reviewer without a
-- pilot grant cannot record a decision on a GB, GB-NI or AE-DU claim, and
-- maintenance of an existing claim fails for anyone without one. It says so
-- because that is what a rollback is.
--
-- REFUSES while any market pack or definition is public_pilot. That state is
-- opened by a separate data migration, whose own rollback must move those rows
-- back first; narrowing the CHECK underneath them would abort half-way.
--
-- Holder data is never touched. A claim registered during a public pilot stays
-- exactly as it is, readable by its holder through the own-claim branch of the
-- read policy; it simply cannot be newly registered again.

DO $$
DECLARE _open integer;
BEGIN
  SELECT (SELECT count(*) FROM public.sp_market_packs WHERE pilot_state = 'public_pilot')
       + (SELECT count(*) FROM public.sp_credential_types WHERE pilot_state = 'public_pilot')
    INTO _open;
  IF _open > 0 THEN
    RAISE EXCEPTION
      'ROLLBACK REFUSED: % market pack(s) or definition(s) are public_pilot. Roll back the data migration that opened them first.',
      _open;
  END IF;
END $$;

-- ── The claim rules, as 20261214090000 wrote them ────────────────────────
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
BEGIN
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
  IF NEW.credential_code IS NOT NULL AND NEW.jurisdiction_code IS NOT NULL
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
      IF NOT _pilot_market THEN
        RAISE EXCEPTION
          'SP_MARKET_PACK_NOT_ACTIVE: market pack % is not available yet (legal review: %)',
          _pack.code, _pack.legal_review_state
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

  IF NOT (_t.is_active OR (_pilot_market AND _t.pilot_state = 'internal_pilot'))
     AND TG_OP = 'INSERT' THEN
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

-- ── The catalogue view, as 20261214090000 wrote it ───────────────────────
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
 (t.is_active
  OR (t.pilot_state='internal_pilot' AND t.market_pack_code IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.sp_market_packs pp WHERE pp.code=t.market_pack_code
                   AND pp.pilot_state='internal_pilot' AND NOT pp.is_active AND pp.superseded_on IS NULL)
      AND public.sp_is_pilot_member(auth.uid(), t.market_pack_code)))
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
   AND (p.is_active
        OR (p.pilot_state='internal_pilot' AND public.sp_is_pilot_member(auth.uid(), p.code)))
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

-- ── The read policy, as 20261109090000 wrote it ──────────────────────────
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
    OR EXISTS (
      SELECT 1 FROM public.sp_claims c
       WHERE c.holder_user_id = auth.uid()
         AND c.credential_code = public.sp_credential_types.code
    )
  );

COMMENT ON POLICY sp_credential_types_read ON public.sp_credential_types IS
  'Production types for every holder; internal-pilot types only for a holder '
  'whose sp_market_access() for that market pack is ''pilot''; plus the types '
  'of the holder''s own existing claims. Never anon.';

GRANT SELECT ON public.sp_credential_types TO authenticated;
REVOKE ALL ON public.sp_credential_types FROM anon;

-- ── The market decision, as 20261109090000 wrote it ──────────────────────
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
  'pilot (internal_pilot AND entitled), or closed. The caller is told WHICH, '
  'because a pilot market must be presented as a pilot market. Answers about '
  'the caller, or about anyone for a platform administrator; refuses otherwise.';

-- ── The state, as 20260915090000 wrote it ────────────────────────────────
ALTER TABLE public.sp_market_packs DROP CONSTRAINT sp_market_pack_pilot_state_known;
ALTER TABLE public.sp_market_packs ADD CONSTRAINT sp_market_pack_pilot_state_known
  CHECK (pilot_state IN ('closed', 'internal_pilot'));
ALTER TABLE public.sp_credential_types DROP CONSTRAINT sp_credential_type_pilot_state_known;
ALTER TABLE public.sp_credential_types ADD CONSTRAINT sp_credential_type_pilot_state_known
  CHECK (pilot_state IN ('closed', 'internal_pilot'));

COMMENT ON COLUMN public.sp_market_packs.pilot_state IS
  'Whether this market is open to named internal pilot members. '
  'ORTHOGONAL to is_active and to legal_review_state, and NEVER a substitute '
  'for either: internal_pilot means "the owner has authorised testing", not '
  '"a regulator or lawyer has approved this content". Public availability '
  'remains is_active alone.';
COMMENT ON COLUMN public.sp_credential_types.pilot_state IS
  'Whether this credential may be registered by an internal pilot member of '
  'its market. Orthogonal to is_active, which remains the production '
  'publication flag and is unchanged by piloting.';

-- ── Proof that it stood down ─────────────────────────────────────────────
DO $$
DECLARE _left integer;
BEGIN
  SELECT (position('public_pilot' IN pg_get_viewdef('public.sp_approved_credential_catalogue'::regclass)) > 0)::int
       + (SELECT count(*) FROM pg_policies WHERE policyname = 'sp_credential_types_read' AND position('public_pilot' IN qual) > 0)
       + (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
           AND proname IN ('sp_market_access', 'sp_claims_credential_rules')
           AND (position('public_pilot' IN prosrc) > 0 OR position('_asserts' IN prosrc) > 0))
       + (SELECT count(*) FROM pg_constraint WHERE conname IN ('sp_market_pack_pilot_state_known', 'sp_credential_type_pilot_state_known')
           AND position('public_pilot' IN pg_get_constraintdef(oid)) > 0)
    INTO _left;
  IF _left <> 0 THEN
    RAISE EXCEPTION 'SP_PUBLIC_PILOT_AVAILABILITY_ROLLBACK: % public-pilot clause(s) remain', _left;
  END IF;
  RAISE NOTICE 'SP_PUBLIC_PILOT_AVAILABILITY_ROLLBACK ok';
END $$;
