-- Security Passport — a governed INTERNAL PILOT path into a market whose
-- regulatory content has not been reviewed.
--
-- ══ THE PROBLEM THIS SOLVES ═══════════════════════════════════════════
--
-- The product owner has approved PILOT TESTING of the United Kingdom and
-- Dubai. That is not legal approval, and the two must not be confused.
--
-- Today a market is reachable only when `sp_market_packs.is_active` is true,
-- and this CHECK stands in the way:
--
--     sp_market_pack_active_needs_review
--       CHECK (NOT is_active OR legal_review_state IN ('approved','grandfathered'))
--
-- So switching GB on for testers would have meant writing
-- legal_review_state = 'approved' — inventing a legal sign-off, with an
-- attributable reviewer who never reviewed anything, in a table whose entire
-- purpose is to record that they did. The constraint is doing its job; the
-- answer is not to weaken it.
--
-- ══ WHAT THIS MIGRATION DOES INSTEAD ══════════════════════════════════
--
-- It adds a SECOND, ORTHOGONAL axis. `is_active` keeps its exact meaning —
-- open to the public, legally cleared — and is not touched for GB or AE-DU.
-- `legal_review_state` stays 'pending' and `legal_reviewed_by` stays NULL.
--
--     production_open  =  is_active                       (unchanged)
--     pilot_open       =  pilot_state = 'internal_pilot'
--                         AND the caller is a pilot member OF THAT MARKET
--     available        =  production_open OR pilot_open
--
-- A market in `internal_pilot` is READABLE AS SUCH: nothing anywhere in this
-- migration lets it be mistaken for an approved one, and `sp_market_access()`
-- returns which of the two it is so the UI can say so out loud.
--
-- ══ WHY ENTITLEMENT IS PER MARKET ═════════════════════════════════════
--
-- A single boolean "is a Passport pilot tester" would mean that authorising
-- somebody to exercise the SIA catalogue also authorised them to write SIRA
-- cadre claims. Those are different regulators, different evidence and
-- different risk, and the person who granted the first did not decide the
-- second. Membership is therefore (user, market pack): a GB tester gets GB and
-- nothing else until somebody grants it.
--
-- ══ WHY NOT cd_internal_testers ═══════════════════════════════════════
--
-- Career Discovery has an internal-tester list with exactly this shape, and
-- reusing it was considered and rejected by owner decision. It is scoped to
-- Career Discovery; hanging Passport market access off it would mean that
-- granting somebody a discovery test seat silently granted them the ability to
-- write regulated credential claims in an unreviewed market. The two products
-- keep separate entitlements for the same reason they keep separate modules.
--
-- ══ WHAT THIS MIGRATION DELIBERATELY DOES NOT TOUCH ═══════════════════
--
-- Jurisdiction matching. `SP_CREDENTIAL_JURISDICTION_MISMATCH` and
-- `SP_SUB_JURISDICTION_NOT_SUPPORTED` are re-emitted below byte-identical to
-- their previous text, in the same order, from the same columns. Pilot
-- entitlement widens WHICH MARKET a holder may write into. It can never widen
-- WHICH CREDENTIAL may go into a market — a pilot member with GB access still
-- cannot file VU1, SIRA or anything else that is not a GB credential.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Refuse to run if the governance facts have moved underneath us
-- ---------------------------------------------------------------------------
--
-- This migration is written for a world in which GB and AE-DU are unreviewed.
-- If somebody has since recorded a real legal review, the honest action is a
-- normal activation, not a pilot flag, and this file should be reconsidered
-- rather than replayed.
DO $$
DECLARE _bad text;
BEGIN
  SELECT string_agg(code || ' (' || legal_review_state || ', is_active=' || is_active || ')', ', ')
    INTO _bad
    FROM public.sp_market_packs
   WHERE code IN ('GB', 'AE-DU')
     AND (legal_review_state <> 'pending' OR is_active);

  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION
      'MIGRATION ABORTED: expected GB and AE-DU to be pending and inactive, found: %. '
      'A market that has been reviewed is activated, not piloted.', _bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. The pilot axis on the market pack
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_market_packs
  ADD COLUMN IF NOT EXISTS pilot_state text NOT NULL DEFAULT 'closed';

ALTER TABLE public.sp_market_packs
  DROP CONSTRAINT IF EXISTS sp_market_pack_pilot_state_known;
ALTER TABLE public.sp_market_packs
  ADD CONSTRAINT sp_market_pack_pilot_state_known
  CHECK (pilot_state IN ('closed', 'internal_pilot'));

-- ── WHY THERE IS NO is_active/pilot_state EXCLUSION CONSTRAINT ────────
--
-- A CHECK forbidding both at once was written here and removed. A market that
-- earns a real legal review DURING its pilot must be activatable by recording
-- that review and nothing else; a constraint would have forced every future
-- activation to clear a pilot flag first, and it broke the existing
-- three-market suite's positive control, which activates GB with a genuine
-- review and expects that to succeed.
--
-- The state is redundant, not ambiguous: sp_market_access() resolves it in one
-- place and is_active always wins, so a publicly active market is reported as
-- 'production' to everyone, member or not. The pilot flag simply stops
-- meaning anything, which is the correct outcome — piloting is over.

COMMENT ON COLUMN public.sp_market_packs.pilot_state IS
  'Whether this market is open to named internal pilot members. '
  'ORTHOGONAL to is_active and to legal_review_state, and NEVER a substitute '
  'for either: internal_pilot means "the owner has authorised testing", not '
  '"a regulator or lawyer has approved this content". Public availability '
  'remains is_active alone.';

-- ---------------------------------------------------------------------------
-- 2. The pilot axis on the credential type
-- ---------------------------------------------------------------------------
--
-- sp_credential_types.is_active is the PRODUCTION publication flag, and the
-- claim trigger already documents its purpose: it "lets a reviewer approve a
-- pack while holding back one credential in it". Setting the GB and Dubai
-- catalogues active to reach them in a pilot would spend that flag and lose
-- the distinction, and would publish them the instant the pack ever opened.
--
-- One column, mirroring the pack's. The catalogue is NOT duplicated.
ALTER TABLE public.sp_credential_types
  ADD COLUMN IF NOT EXISTS pilot_state text NOT NULL DEFAULT 'closed';

ALTER TABLE public.sp_credential_types
  DROP CONSTRAINT IF EXISTS sp_credential_type_pilot_state_known;
ALTER TABLE public.sp_credential_types
  ADD CONSTRAINT sp_credential_type_pilot_state_known
  CHECK (pilot_state IN ('closed', 'internal_pilot'));

COMMENT ON COLUMN public.sp_credential_types.pilot_state IS
  'Whether this credential may be registered by an internal pilot member of '
  'its market. Orthogonal to is_active, which remains the production '
  'publication flag and is unchanged by piloting.';

-- ---------------------------------------------------------------------------
-- 3. Membership — per user, PER MARKET, revoked rather than deleted
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_pilot_members (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_pack_code text NOT NULL REFERENCES public.sp_market_packs(code) ON DELETE CASCADE,
  granted_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at       timestamptz NOT NULL DEFAULT now(),
  -- Revocation is an UPDATE, never a DELETE. Who was authorised to exercise an
  -- unreviewed regulated market, by whom, and for how long, is precisely the
  -- question a later reviewer will ask, and a deleted row cannot answer it.
  revoked_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at       timestamptz,
  note             text,
  PRIMARY KEY (user_id, market_pack_code),
  CONSTRAINT sp_pilot_member_revocation_is_attributed
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

COMMENT ON TABLE public.sp_pilot_members IS
  'Named, informed participants authorised to exercise ONE internal-pilot '
  'market each. Granted only by a platform administrator through '
  'sp_grant_pilot_member(). Membership confers exactly one thing: the ability '
  'to register credentials in that market while it is in internal_pilot. It '
  'is not a role, it is not a verification, and it asserts nothing about the '
  'holder or about the market''s legal standing.';

CREATE INDEX IF NOT EXISTS sp_pilot_members_market_idx
  ON public.sp_pilot_members (market_pack_code)
  WHERE revoked_at IS NULL;

ALTER TABLE public.sp_pilot_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.sp_pilot_members TO authenticated;

-- Enumerated, never GRANT ALL. No application role holds DELETE on any sp_*
-- table -- security_passport_phase8_test asserts it, and its comment names
-- exactly this failure: "a future table that forgets its REVOKE fails rather
-- than quietly inheriting the grant". The hosted project also grants DELETE on
-- new tables by default, so the REVOKE below is not redundant there.
GRANT SELECT, INSERT, UPDATE ON public.sp_pilot_members TO service_role;
REVOKE DELETE ON public.sp_pilot_members FROM PUBLIC, anon, authenticated, service_role;

-- A member may see their own entitlements, so the UI can tell them which
-- markets are open to them and why. Nobody sees anyone else's.
DROP POLICY IF EXISTS "sp pilot members see own entitlement" ON public.sp_pilot_members;
CREATE POLICY "sp pilot members see own entitlement" ON public.sp_pilot_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy exists at all, for anybody. Membership moves
-- only through the two SECURITY DEFINER functions below, which is what makes
-- "granted by an administrator" a property of the database rather than a
-- convention the next caller might not follow.

-- ── WHY THERE IS NO no-delete TRIGGER ─────────────────────────────────
--
-- One was written here and removed. Deletion is already impossible for every
-- role that runs a request: the REVOKE above takes DELETE away from anon,
-- authenticated and service_role, and security_passport_phase8_test asserts
-- that no application role holds it on any sp_* table. Privileges are the
-- right instrument -- they are checked before the statement runs, they cannot
-- be bypassed by a SECURITY DEFINER caller, and they are what the rest of this
-- domain already relies on.
--
-- A trigger, by contrast, also fires on the ON DELETE CASCADE from
-- auth.users -- so erasing an account would have been blocked by the very
-- guard meant to protect its audit trail. Erasing a person's account SHOULD
-- take their entitlement with it; that is a data-subject right, not an attack.

-- ---------------------------------------------------------------------------
-- 4. The predicate
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER because the claim trigger must be able to answer this for
-- the CALLING user while RLS hides other people's rows; STABLE because it is
-- read inside a trigger that may consult it more than once per statement.
--
-- A platform administrator is deliberately NOT an implicit member. Making
-- admins automatic would mean no administrator could ever see the public
-- experience, and the public-versus-pilot separation this whole migration
-- exists to create would be untestable by the people who most need to test it.
-- An administrator who wants pilot access grants it to themselves, and that
-- grant is recorded like any other.
CREATE OR REPLACE FUNCTION public.sp_is_pilot_member(_user_id uuid, _market_pack_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _market_pack_code IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sp_pilot_members m
     WHERE m.user_id = _user_id
       AND m.market_pack_code = _market_pack_code
       AND m.revoked_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.sp_is_pilot_member(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_is_pilot_member(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.sp_is_pilot_member(uuid, text) IS
  'True when this user holds a live pilot entitlement for THIS market pack. '
  'Per market by design: a GB tester is not a Dubai tester.';

-- ---------------------------------------------------------------------------
-- 5. The governed availability decision, in one place
-- ---------------------------------------------------------------------------
--
-- Returns 'production', 'pilot' or 'closed'. Three surfaces need this answer —
-- the claim trigger, the candidate read model and the tests — and a product
-- that computes "can this person reach this market" three times will
-- eventually compute it three ways. The UI needs the DISTINCTION, not just the
-- boolean, because a pilot market has to say on screen that it is one.
CREATE OR REPLACE FUNCTION public.sp_market_access(_user_id uuid, _market_pack_code text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- COALESCE, not a join: an unknown market code returns no row at all, and a
  -- SQL function that returns NULL where the caller expects a state is how a
  -- closed market becomes an unhandled case at the call site.
  SELECT COALESCE(
    (SELECT CASE
       WHEN p.is_active THEN 'production'
       WHEN p.pilot_state = 'internal_pilot'
            AND public.sp_is_pilot_member(_user_id, p.code) THEN 'pilot'
       ELSE 'closed'
     END
     FROM public.sp_market_packs p
     WHERE p.code = _market_pack_code AND p.superseded_on IS NULL),
    'closed');
$$;

REVOKE ALL ON FUNCTION public.sp_market_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_market_access(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.sp_market_access(uuid, text) IS
  'How this user may reach this market: production (public, legally cleared), '
  'pilot (internal_pilot AND entitled), or closed. The caller is told WHICH, '
  'because a pilot market must be presented as a pilot market.';

-- ---------------------------------------------------------------------------
-- 6. Grant and revoke — administrator only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_grant_pilot_member(
  _user_id uuid, _market_pack_code text, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pack public.sp_market_packs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION
      'SP_PILOT_GRANT_REQUIRES_ADMIN: only a platform administrator may authorise a pilot member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _pack FROM public.sp_market_packs WHERE code = _market_pack_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_PILOT_MARKET_UNKNOWN: no market pack %', _market_pack_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Refused rather than stored dormant. A grant that confers nothing today but
  -- would silently confer access the moment somebody flips a flag is an
  -- entitlement nobody decided to give.
  IF _pack.pilot_state <> 'internal_pilot' THEN
    RAISE EXCEPTION
      'SP_PILOT_MARKET_NOT_IN_PILOT: market pack % is not in internal_pilot', _market_pack_code
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.sp_pilot_members (user_id, market_pack_code, granted_by, note)
  VALUES (_user_id, _market_pack_code, auth.uid(), _note)
  ON CONFLICT (user_id, market_pack_code) DO UPDATE
    -- Re-granting a revoked entitlement reinstates it and re-attributes it.
    SET revoked_at = NULL,
        revoked_by = NULL,
        granted_by = auth.uid(),
        granted_at = now(),
        note       = COALESCE(EXCLUDED.note, public.sp_pilot_members.note);
END $$;

REVOKE ALL ON FUNCTION public.sp_grant_pilot_member(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_grant_pilot_member(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sp_revoke_pilot_member(_user_id uuid, _market_pack_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION
      'SP_PILOT_REVOKE_REQUIRES_ADMIN: only a platform administrator may revoke a pilot member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Revocation removes the ability to register something NEW. It does not
  -- touch sp_claims: what a holder already recorded stays theirs, keeps its
  -- own jurisdiction and follows the ordinary Passport lifecycle. Deleting
  -- their evidence because an entitlement lapsed would punish the holder for
  -- a decision that was not theirs, and would destroy the record of exactly
  -- what the pilot produced.
  UPDATE public.sp_pilot_members
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE user_id = _user_id
     AND market_pack_code = _market_pack_code
     AND revoked_at IS NULL;
END $$;

REVOKE ALL ON FUNCTION public.sp_revoke_pilot_member(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_revoke_pilot_member(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.sp_revoke_pilot_member(uuid, text) IS
  'Ends a pilot entitlement. Retains the row as an audit record and leaves '
  'every existing claim untouched — revocation stops new registrations, it '
  'does not rewrite history.';

-- ---------------------------------------------------------------------------
-- 7. The claim trigger — the market gate only
-- ---------------------------------------------------------------------------
--
-- Rebased on the live definition (20260908090000 lineage). Exactly two things
-- change, both in the AVAILABILITY gates:
--
--   * SP_MARKET_PACK_NOT_ACTIVE now also accepts an entitled pilot member;
--   * SP_CREDENTIAL_NOT_AVAILABLE now also accepts a pilot credential inside
--     a market the caller is entitled to.
--
-- Everything else below — jurisdiction match, sub-jurisdiction match,
-- claim_type match, the controlled title, the reference pattern, the expiry,
-- issuer and scope rules — is carried over verbatim. Read the diff against
-- 20260908090000 rather than this file if you want to confirm that.
CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _t    public.sp_credential_types%ROWTYPE;
  _pack public.sp_market_packs%ROWTYPE;
  _country_needs_sub boolean;
  _prev_scope text;
  _scope_missing boolean;
  -- True when the caller reaches this market through an internal-pilot
  -- entitlement rather than through public activation. Carried down to the
  -- per-credential gate so a pilot credential is only reachable inside the
  -- pilot market it belongs to.
  _pilot_market boolean := false;
BEGIN
  -- ── The market gate ────────────────────────────────────────────────
  --
  -- Scoped to regulated credentials. A claim that names no credential_code is
  -- a language, a practical capability or a general certificate; its
  -- jurisdiction is PROVENANCE — where the thing came from — and provenance is
  -- a fact about the holder's history, not a request to register a regulated
  -- authorisation in a market.
  IF NEW.credential_code IS NOT NULL AND NEW.jurisdiction_code IS NOT NULL THEN
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

    -- CHANGED: a named pilot member of THIS market may write here while it is
    -- in internal_pilot. Everyone else meets the same refusal as before, with
    -- the same error code and the same legal_review_state in the message, so
    -- a non-member cannot tell the difference between "pending" and "pending
    -- but someone else is testing it" — which is correct: it is not their
    -- business, and it is still closed to them.
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

  -- A credential that has been switched off must stop accepting new claims,
  -- even inside an active market. This is the per-credential gate that lets a
  -- reviewer approve a pack while holding back one credential in it.
  --
  -- Deliberately INSERT-only: an existing claim on a credential that was later
  -- withdrawn must still be correctable, verifiable and expirable.
  --
  -- CHANGED: inside a market this caller reaches AS A PILOT, a credential
  -- marked internal_pilot is available too. `_pilot_market` is false unless
  -- the block above set it, so a pilot credential in a market the caller is
  -- NOT entitled to stays unreachable, and `is_active` keeps its exact
  -- production meaning.
  IF NOT (_t.is_active OR (_pilot_market AND _t.pilot_state = 'internal_pilot'))
     AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_NOT_AVAILABLE: % is not available yet',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── UNCHANGED FROM HERE DOWN ───────────────────────────────────────
  --
  -- These are the rules a pilot entitlement must never relax. A GB pilot
  -- member filing VU1, or a Dubai pilot member filing an ordningsvakts-
  -- förordnande, is refused by the next two blocks — which read the
  -- CREDENTIAL TYPE's own jurisdiction and never consult membership.
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
END $$;

-- ---------------------------------------------------------------------------
-- 8. Open exactly three markets to the pilot, and nothing else
-- ---------------------------------------------------------------------------
--
-- GB-NI is included because the Northern Ireland Vehicle Immobilisation
-- licence has no Great Britain equivalent and cannot be exercised from the GB
-- pack — its own pack is the only way to test it. It is created by
-- 20260914090000; the UPDATE below is a no-op until that migration is applied,
-- which is why it is an UPDATE and not an INSERT.
--
-- AE-AZ is deliberately absent. So is every other emirate. Abu Dhabi's
-- catalogue is authored from a regulatory framework nobody in this repository
-- has confirmed against a pinned official page, and the owner has scoped the
-- pilot to Dubai.
UPDATE public.sp_market_packs
   SET pilot_state = 'internal_pilot', updated_at = now()
 WHERE code IN ('GB', 'GB-NI', 'AE-DU')
   AND NOT is_active;

UPDATE public.sp_credential_types
   SET pilot_state = 'internal_pilot'
 WHERE market_pack_code IN ('GB', 'GB-NI', 'AE-DU')
   AND NOT is_active;

-- ---------------------------------------------------------------------------
-- 9. Prove the governance facts were not disturbed
-- ---------------------------------------------------------------------------
DO $$
DECLARE _n integer;
BEGIN
  -- Nothing gained a legal review.
  SELECT count(*) INTO _n FROM public.sp_market_packs
   WHERE code IN ('GB', 'GB-NI', 'AE-DU')
     AND (legal_review_state <> 'pending' OR is_active OR legal_reviewed_by IS NOT NULL);
  IF _n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: a piloted pack claims a legal review it does not have';
  END IF;

  -- Sweden is untouched: still public, still the only public market.
  SELECT count(*) INTO _n FROM public.sp_market_packs
   WHERE is_active AND code <> 'SE';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: a market other than SE became publicly active';
  END IF;

  SELECT count(*) INTO _n FROM public.sp_market_packs
   WHERE code = 'SE' AND (NOT is_active OR pilot_state <> 'closed');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Sweden must stay publicly active and unpiloted';
  END IF;

  -- No emirate other than Dubai was opened.
  SELECT count(*) INTO _n FROM public.sp_market_packs
   WHERE pilot_state = 'internal_pilot'
     AND code NOT IN ('GB', 'GB-NI', 'AE-DU');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: a market outside the approved pilot scope was opened';
  END IF;

  -- No credential became publicly active as a side effect.
  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE is_active AND market_pack_code <> 'SE';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: a non-Swedish credential became publicly active';
  END IF;
END $$;

COMMIT;