-- Security Passport — pilot bug fix #1.
--
-- Four defects found by a real tester in the live pilot, each of which turns
-- out to be a rule the database does not currently hold. Nothing here
-- activates a market, seeds regulatory content or widens anybody's access.
--
-- ── WHY THE VERSION IS NOT TODAY'S WALL CLOCK ──────────────────────────
--
-- This repository's migration versions deliberately run ahead of the calendar.
-- A wall-clock stamp would sort before migrations already in the hosted ledger
-- and replay out of order. The last canonical file is 20260909094000, so
-- 20260910090000 is the next free slot -- 20260909090000 was taken, which is
-- exactly what `bun run migrations:check` is there to catch.
--
-- Reversible: see supabase/rollback/20260910090000_sp_pilot_bugfix_1_rollback.sql
--
-- ── THE FOUR DEFECTS ───────────────────────────────────────────────────
--
-- 1. A GOVERNED CREDENTIAL'S NAME WAS THE HOLDER'S TO TYPE.
--
--    A tester selected Skyddsvaktsförordnande and typed "Bajskorv" into
--    Benämning. It saved. `sp_credential_types` already carries the credential's
--    real name in two languages, and the trigger already refused free text —
--    but only for `narrow_result_only` rows, which the skyddsvakt appointment
--    is not. So the one thing a governed vocabulary exists to control, the
--    name of the thing, was uncontrolled for six of the eight Swedish
--    credentials.
--
--    Fixed by making "may the holder write this title?" a property of the
--    credential type, defaulting to NO, and enforcing it here rather than in
--    a form that a caller can skip.
--
-- 2. A SECURITY MARKET PACK GATED A DRIVING LICENCE.
--
--    `sp_claims_credential_rules` ran its market-pack check on EVERY claim
--    with a jurisdiction, including rows that name no credential at all. A
--    Körkort is `sp_skill_types.driving_licence` with `requires_jurisdiction`,
--    so recording a British driving licence asked for jurisdiction GB and was
--    refused with SP_MARKET_PACK_NOT_ACTIVE — because the UK SECURITY market
--    is unreviewed. A UAE driving licence was refused with
--    SP_SUB_JURISDICTION_REQUIRED, demanding an emirate for a federal licence.
--
--    A market pack governs which REGULATED credentials may be registered. It
--    was never meant to decide whether a holder may say where their driving
--    licence, first-aid certificate or language qualification came from. The
--    gate now applies exactly where the regulated vocabulary applies: to rows
--    that name a `credential_code`.
--
-- 3. A DISPUTE WENT NOWHERE.
--
--    `sp_raise_dispute` moved the claim to `disputed` and wrote an event. That
--    was the whole workflow. `sp_verifier_queue` reads
--    `sp_verification_requests`, so a disputed claim appeared in no queue, and
--    the tester who reported an entry as incorrect was right that nothing
--    could be found in admin. There was also no way back: the lifecycle guard
--    requires the verification context for any transition other than
--    `superseded`/`withdrawn`, and nothing set it for `disputed`.
--
--    Added: one read (`sp_dispute_queue`) and one decision
--    (`sp_resolve_dispute`), both verifier-only, both audited. Deliberately
--    NOT a new dispute table: `lifecycle_state` already records the state and
--    `sp_passport_events` already records the reason. A second home for the
--    same fact is how two systems come to disagree about it.
--
-- 4. A VERIFIED CREDENTIAL COULD NOT BE REMOVED FROM AN ACTIVE PASSPORT.
--
--    `sp_claims_self_update` carries `WITH CHECK (assertion_level =
--    'self_declared' AND verified_by_user_id IS NULL)`, which is correct — a
--    holder must not edit a verified row. The side effect was that a holder
--    could not archive one either, so the tester's "how do I remove this?" had
--    no answer for exactly the entries most likely to need one.
--
--    `sp_archive_claim` gives the holder that action without giving them the
--    edit. It writes `withdrawn`, which already means "no longer active" to
--    every reader in the system, and it never touches assertion_level,
--    verified_by_user_id, verified_at or the evidence. The verification still
--    happened; it is simply no longer presented as current.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ────────────────────────────────────
--
--   * No market pack is activated. GB and AE-DU stay `pending`, `is_active`
--     false, and `sp_market_pack_active_needs_review` still forbids otherwise.
--   * No regulated credential type is added, in any market.
--   * No new grant to `anon`; every new function is REVOKEd from PUBLIC and
--     anon and granted only to `authenticated`, which is where the per-caller
--     holder/verifier checks live.
--   * No existing row's title, jurisdiction, assertion level or verification
--     is rewritten.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. A governed credential's title belongs to the definition
-- ---------------------------------------------------------------------------
-- Data, not a hardcoded list, so a future "Other training / Other certificate"
-- type can be shipped with `title_is_holder_written = true` by INSERT rather
-- than by teaching the trigger about a special code.
--
-- DEFAULT false is the load-bearing part: a credential added later is
-- controlled unless somebody deliberately says it is not.
ALTER TABLE public.sp_credential_types
  ADD COLUMN IF NOT EXISTS title_is_holder_written boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sp_credential_types.title_is_holder_written IS
  'Whether the HOLDER supplies this credential''s title. False for every '
  'regulated credential: the definition owns the name, and '
  'sp_claims_credential_rules refuses anything else. Reserved for a future '
  '"other training" type whose whole point is that the holder names it. A '
  'narrow_result_only credential is controlled regardless of this column.';

-- ---------------------------------------------------------------------------
-- 2. The claim rules, corrected
-- ---------------------------------------------------------------------------
-- Rebased on 20260908090000_sp_legacy_scope_correctable, which is the LATEST
-- definition of this function — not on 20260907092000, which is the one that
-- looks latest if you search for the market gate. Getting that wrong silently
-- reverts the grandfathered-scope branch and refreezes the one real verified
-- skyddsvakt claim in production. `security_passport_legacy_scope_correction`
-- is the suite that catches it.
--
-- Two changes against that definition, and nothing else moves:
--
--   a. the market-pack gate is scoped to rows that name a credential_code
--   b. the controlled-title rule covers every governed credential, not only
--      the narrow-result ones
--
-- (b) binds on INSERT, and on UPDATE only when the title actually changes.
-- Binding it unconditionally on UPDATE would freeze every legacy row whose
-- title was typed before this rule existed: the holder could no longer add a
-- reference or correct a date, because the untouched title would fail. A row
-- that was already stored wrong is corrected through the versioning workflow,
-- which INSERTs — and is therefore checked.
CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  _t    public.sp_credential_types%ROWTYPE;
  _pack public.sp_market_packs%ROWTYPE;
  _country_needs_sub boolean;
  -- From 20260908090000: a correction inherits its predecessor's
  -- grandfathered absence of a scope.
  _prev_scope text;
  _scope_missing boolean;
BEGIN
  -- ── The market gate ────────────────────────────────────────────────
  --
  -- Scoped to regulated credentials. A claim that names no credential_code is
  -- a language, a practical capability or a general certificate; its
  -- jurisdiction is PROVENANCE — where the thing came from — and provenance is
  -- a fact about the holder's history, not a request to register a regulated
  -- authorisation in a market. Gating it here is what refused a British
  -- driving licence because the UK SECURITY pack is unreviewed.
  --
  -- Nothing is loosened for regulated credentials: for them the gate is
  -- unchanged, and the FK on jurisdiction_code still refuses a country that
  -- does not exist.
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

  -- A credential that has been switched off must stop accepting new claims,
  -- even inside an active market. This is the per-credential gate that lets a
  -- reviewer approve a pack while holding back one credential in it.
  --
  -- Deliberately INSERT-only: an existing claim on a credential that was later
  -- withdrawn must still be correctable, verifiable and expirable. Freezing
  -- somebody's record because the product changed its mind about a credential
  -- would punish the holder for a decision that was not theirs.
  IF NOT _t.is_active AND TG_OP = 'INSERT' THEN
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

  -- ── The controlled title ───────────────────────────────────────────
  --
  -- The definition owns the name. Both language forms are accepted because the
  -- Passport is Swedish-first with English parity and either is the credential's
  -- real name; anything else is the holder renaming a regulated authorisation.
  --
  -- One rule for narrow-result and ordinary governed credentials alike. It used
  -- to exist only inside the narrow-result branch above, which is why
  -- Skyddsvaktsförordnande accepted "Bajskorv".
  IF NOT _t.title_is_holder_written
     AND (TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title)
     AND btrim(NEW.title) NOT IN (_t.name_sv, _t.name_en) THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_TITLE_CONTROLLED: % is named by its definition (% / %), not by the holder',
      NEW.credential_code, _t.name_sv, _t.name_en
      USING ERRCODE = 'check_violation';
  END IF;

  -- A malformed licence number is a fact about the credential, not about how
  -- complete the form is, so it binds a draft too: a sixteen-digit field
  -- holding eight digits is wrong the moment it is stored, and telling the
  -- holder at submit time means telling them after they have moved on.
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

  -- ── The scope rule, grandfathered on BOTH shapes of write ────────────
  --
  -- Verbatim from 20260908090000_sp_legacy_scope_correctable, which is the
  -- definition this function is rebased on. There is a real verified
  -- skyddsvakt claim in production that predates `requires_scope`, and without
  -- this branch correcting it is impossible while destroying it is not.
  IF _t.requires_scope
     AND (NEW.authorisation_scope IS NULL OR length(btrim(NEW.authorisation_scope)) = 0) THEN

    _scope_missing := true;

    IF TG_OP = 'UPDATE' THEN
      -- A row that already had no scope stays writable; a row that HAS one
      -- cannot have it taken away.
      _scope_missing := (OLD.authorisation_scope IS NOT NULL
                         AND length(btrim(OLD.authorisation_scope)) > 0);

    ELSIF NEW.supersedes_id IS NOT NULL THEN
      -- A correction. It inherits its predecessor's grandfathered status, and
      -- nothing else: if the predecessor had a scope, this one must too, so a
      -- correction can never quietly widen an authorisation.
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

COMMENT ON FUNCTION public.sp_claims_credential_rules IS
  'Enforces the taxonomy, market, narrow-result, controlled-title, '
  'reference-format and scope rules on every claim write, for every caller '
  'including service_role. The market gate applies to REGULATED credentials '
  'only: a claim naming no credential_code carries its jurisdiction as '
  'provenance, and gating that refused a British driving licence because the '
  'UK security pack is unreviewed. Drafts are exempt from COMPLETENESS only.';

REVOKE ALL ON FUNCTION public.sp_claims_credential_rules() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 3. The event vocabulary learns one word
-- ---------------------------------------------------------------------------
-- `dispute_raised` deliberately stays where it is — inside a `claim_corrected`
-- event's detail — because that is the shape already written to every hosted
-- row, and rewriting history to make the vocabulary tidier would be the one
-- thing an append-only audit log must never do. The RESOLUTION is new, so it
-- gets an honest type of its own rather than being folded into
-- `verification_decided`, which means something else.
ALTER TABLE public.sp_passport_events
  DROP CONSTRAINT IF EXISTS sp_passport_events_event_type_check;

ALTER TABLE public.sp_passport_events
  ADD CONSTRAINT sp_passport_events_event_type_check CHECK (event_type = ANY (ARRAY[
    'passport_created',
    'onboarding_progressed',
    'onboarding_completed',
    'experience_created',
    'experience_corrected',
    'experience_withdrawn',
    'claim_created',
    'claim_drafted',
    'claim_corrected',
    'claim_withdrawn',
    'verification_decided',
    'dispute_resolved',
    'privacy_changed',
    'declaration_recorded'
  ]));

-- ---------------------------------------------------------------------------
-- 4. The dispute queue — a read, for a verifier, and nothing more
-- ---------------------------------------------------------------------------
-- Assembled the same way `sp_verifier_queue` is: SECURITY DEFINER because a
-- verifier has no blanket read over Passport content, with the capability
-- check as the first statement so there is no path into the body without it.
--
-- The reason is read back out of the audit event `sp_raise_dispute` already
-- writes. That is why there is no dispute table: the state is on the claim,
-- the reason is in the log, and both are already there.
--
-- `holder_note` is NOT selected. A dispute is about whether a recorded fact is
-- correct; the holder's private commentary is not needed to decide that, and
-- widening a reviewer's read is not a side effect a bug fix gets to have.
CREATE OR REPLACE FUNCTION public.sp_dispute_queue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _out jsonb;
BEGIN
  IF NOT public.sp_is_verifier(auth.uid()) THEN
    RAISE EXCEPTION 'SP_NOT_VERIFIER' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'disputed_at'), '[]'::jsonb) INTO _out
  FROM (
    SELECT jsonb_build_object(
      'subject_type',    'claim',
      'subject_id',      c.id,
      'holder_user_id',  c.holder_user_id,
      'holder_name',     coalesce(p.display_name, ''),
      'title',           c.title,
      'credential_code', c.credential_code,
      'skill_code',      c.skill_code,
      'claim_type',      c.claim_type,
      'issuer',          c.claimed_issuer_name,
      'jurisdiction',        c.jurisdiction_code,
      'sub_jurisdiction',    c.sub_jurisdiction_code,
      'assertion',       c.assertion_level,
      'lifecycle',       c.lifecycle_state,
      -- Whether the caller is the holder, computed here from auth.uid() so the
      -- browser cannot assert it. `sp_resolve_dispute` refuses on the same
      -- basis: nobody rules on their own dispute.
      'is_self',         (c.holder_user_id = auth.uid()),
      'disputed_at',     ev.occurred_at,
      'reason',          ev.detail->>'reason',
      'evidence_count',  (SELECT count(*) FROM public.sp_evidence e
                           WHERE e.claim_id = c.id AND e.lifecycle_state = 'active')
    ) AS x
    FROM public.sp_claims c
    LEFT JOIN public.sp_passport_profiles p ON p.holder_user_id = c.holder_user_id
    LEFT JOIN LATERAL (
      SELECT e.occurred_at, e.detail
        FROM public.sp_passport_events e
       WHERE e.subject_type = 'claim'
         AND e.subject_id   = c.id
         AND e.detail->>'action' = 'dispute_raised'
       ORDER BY e.occurred_at DESC
       LIMIT 1
    ) ev ON true
   WHERE c.lifecycle_state = 'disputed'

    UNION ALL

    SELECT jsonb_build_object(
      'subject_type',    'experience',
      'subject_id',      x.id,
      'holder_user_id',  x.holder_user_id,
      'holder_name',     coalesce(p.display_name, ''),
      'title',           x.role_title,
      'credential_code', NULL,
      'skill_code',      NULL,
      'claim_type',      'experience',
      'issuer',          x.employer_name,
      'jurisdiction',        x.jurisdiction_code,
      'sub_jurisdiction',    NULL,
      'assertion',       x.assertion_level,
      'lifecycle',       x.lifecycle_state,
      'is_self',         (x.holder_user_id = auth.uid()),
      'disputed_at',     ev.occurred_at,
      'reason',          ev.detail->>'reason',
      'evidence_count',  (SELECT count(*) FROM public.sp_evidence e
                           WHERE e.period_id = x.id AND e.lifecycle_state = 'active')
    )
    FROM public.sp_experience_periods x
    LEFT JOIN public.sp_passport_profiles p ON p.holder_user_id = x.holder_user_id
    LEFT JOIN LATERAL (
      SELECT e.occurred_at, e.detail
        FROM public.sp_passport_events e
       WHERE e.subject_type = 'experience'
         AND e.subject_id   = x.id
         AND e.detail->>'action' = 'dispute_raised'
       ORDER BY e.occurred_at DESC
       LIMIT 1
    ) ev ON true
   WHERE x.lifecycle_state = 'disputed'
  ) s;

  RETURN _out;
END $fn$;

COMMENT ON FUNCTION public.sp_dispute_queue IS
  'Every entry a holder has reported as incorrect, for a CQrityjob verifier. '
  'Verifier-only and SECURITY DEFINER for the same reason sp_verifier_queue '
  'is: the capability is narrow and carries no blanket read. Deliberately '
  'omits holder_note — a dispute is about a recorded fact, not about the '
  'holder''s private commentary.';

REVOKE ALL ON FUNCTION public.sp_dispute_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_dispute_queue() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Resolving a dispute — a decision by a person
-- ---------------------------------------------------------------------------
-- Two outcomes, and only two:
--
--   'restored'  — the entry stands. Back to `active`, exactly as it was.
--   'withdrawn' — the entry does not stand. It leaves the active Passport and
--                 keeps every trace of having existed.
--
-- What is NOT here is as deliberate as what is.
--
--   * There is no 'verified' outcome. Verification is a decision about
--     evidence, made in `sp_verifier_decide`, and a dispute is not a shortcut
--     into it. `assertion_level` is never written by this function.
--   * There is no automatic resolution. Both outcomes require a caller with
--     the verifier capability and a recorded actor.
--   * A verifier cannot resolve a dispute on their OWN entry, mirroring the
--     self-verification bar in `sp_verifier_decide`. A platform admin who
--     disputes their own credential is a holder in that moment.
--
-- Revoking a VERIFICATION is a different, heavier act with its own function
-- (`sp_verifier_revoke`) and its own audit trail; 'withdrawn' here removes the
-- entry from the active Passport without pretending the verification never
-- happened.
CREATE OR REPLACE FUNCTION public.sp_resolve_dispute(
  _claim_id  uuid,
  _period_id uuid,
  _outcome   text,
  _note      text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _holder uuid;
  _state  text;
  _target text;
BEGIN
  IF NOT public.sp_is_verifier(auth.uid()) THEN
    RAISE EXCEPTION 'SP_NOT_VERIFIER' USING ERRCODE='insufficient_privilege';
  END IF;

  IF _outcome NOT IN ('restored', 'withdrawn') THEN
    RAISE EXCEPTION 'SP_DISPUTE_OUTCOME_UNKNOWN: %', _outcome
      USING ERRCODE='check_violation';
  END IF;

  IF (_claim_id IS NULL) = (_period_id IS NULL) THEN
    RAISE EXCEPTION 'SP_DISPUTE_TARGET_AMBIGUOUS: name exactly one of claim or period'
      USING ERRCODE='check_violation';
  END IF;

  IF _claim_id IS NOT NULL THEN
    SELECT holder_user_id, lifecycle_state INTO _holder, _state
      FROM public.sp_claims WHERE id = _claim_id;
  ELSE
    SELECT holder_user_id, lifecycle_state INTO _holder, _state
      FROM public.sp_experience_periods WHERE id = _period_id;
  END IF;

  IF _holder IS NULL THEN
    RAISE EXCEPTION 'SP_TARGET_NOT_FOUND' USING ERRCODE='no_data_found';
  END IF;

  -- Nobody rules on their own dispute. Same bar as sp_verifier_decide.
  IF _holder = auth.uid() THEN
    RAISE EXCEPTION 'SP_SELF_REVIEW_FORBIDDEN' USING ERRCODE='insufficient_privilege';
  END IF;

  -- Resolving something that is not disputed would silently invent a
  -- transition — most damagingly `active` -> `withdrawn` on an entry nobody
  -- ever questioned.
  IF _state <> 'disputed' THEN
    RAISE EXCEPTION 'SP_NOT_DISPUTED: entry is % and cannot be resolved', _state
      USING ERRCODE='check_violation';
  END IF;

  _target := CASE WHEN _outcome = 'restored' THEN 'active' ELSE 'withdrawn' END;

  -- The lifecycle guard refuses every transition except superseded/withdrawn
  -- without this context. 'restored' needs it; 'withdrawn' does not, and it is
  -- set for both so the two outcomes take one path rather than two.
  PERFORM set_config('sp.verification_context', 'on', true);
  IF _claim_id IS NOT NULL THEN
    UPDATE public.sp_claims
       SET lifecycle_state = _target
     WHERE id = _claim_id AND lifecycle_state = 'disputed';
  ELSE
    UPDATE public.sp_experience_periods
       SET lifecycle_state = _target
     WHERE id = _period_id AND lifecycle_state = 'disputed';
  END IF;
  PERFORM set_config('sp.verification_context', 'off', true);

  INSERT INTO public.sp_passport_events
    (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES
    (_holder, auth.uid(), 'dispute_resolved',
     CASE WHEN _claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
     coalesce(_claim_id, _period_id),
     jsonb_build_object(
       'outcome', _outcome,
       'note',    left(coalesce(_note, ''), 300)));
END $fn$;

COMMENT ON FUNCTION public.sp_resolve_dispute IS
  'Closes a dispute, by a verifier who is not the holder. Two outcomes: '
  '"restored" returns the entry to active, "withdrawn" removes it from the '
  'active Passport. Never writes assertion_level: a dispute is not a route to '
  'verification, and resolving one cannot verify anything.';

REVOKE ALL ON FUNCTION public.sp_resolve_dispute(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_resolve_dispute(uuid,uuid,text,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. The holder archives an entry
-- ---------------------------------------------------------------------------
-- The answer to "how do I remove this?" for an entry that is not a draft.
--
-- SECURITY DEFINER not to widen anything but to narrow it: it lets the holder
-- take exactly ONE action on a verified row — stop presenting it — while
-- `sp_claims_self_update` continues to refuse every edit to that row. A
-- holder-facing UPDATE broad enough to archive would also have been broad
-- enough to alter a verified credential.
--
-- Archive is NOT dispute, and the two must not become one control. "This is
-- wrong" is a claim about the world and goes to a reviewer; "I no longer want
-- this presented" is a decision about the holder's own Passport and is theirs
-- alone. Using `disputed` as a delete button would fill a review queue with
-- entries nobody contests, and using this as a dispute button would silently
-- erase a fact the holder wanted corrected. Hence the guard below: a disputed
-- entry cannot be archived out from under an open review.
--
-- Nothing is deleted. `withdrawn` is the state every reader in this system
-- already understands as "not current"; the row, its versions, its evidence
-- and its verification record all remain exactly where they were.
CREATE OR REPLACE FUNCTION public.sp_archive_claim(_claim_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _holder uuid;
  _state  text;
  _open   integer;
BEGIN
  SELECT holder_user_id, lifecycle_state INTO _holder, _state
    FROM public.sp_claims WHERE id = _claim_id;

  IF _holder IS NULL THEN
    RAISE EXCEPTION 'SP_TARGET_NOT_FOUND' USING ERRCODE='no_data_found';
  END IF;
  IF _holder <> auth.uid() THEN
    RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='insufficient_privilege';
  END IF;

  -- A disputed entry is in front of a reviewer. Letting the holder archive it
  -- would end the review by making its subject disappear.
  IF _state = 'disputed' THEN
    RAISE EXCEPTION 'SP_DISPUTED_CANNOT_ARCHIVE: a disputed entry is resolved, not archived'
      USING ERRCODE='check_violation';
  END IF;

  IF _state NOT IN ('active', 'expired', 'draft') THEN
    RAISE EXCEPTION 'SP_NOT_ARCHIVABLE: entry is % ', _state
      USING ERRCODE='check_violation';
  END IF;

  -- Same reasoning as sp_withdraw_evidence: pulling the subject out from under
  -- an open verification would leave a reviewer deciding about nothing.
  SELECT count(*) INTO _open
    FROM public.sp_verification_requests r
   WHERE r.claim_id = _claim_id
     AND r.status IN ('pending', 'clarification_requested');
  IF _open > 0 THEN
    RAISE EXCEPTION 'SP_REVIEW_IN_PROGRESS: withdraw the verification request first'
      USING ERRCODE='check_violation';
  END IF;

  -- assertion_level, verified_by_user_id and verified_at are deliberately
  -- absent from this UPDATE. The verification happened; archiving does not
  -- unmake it, and this function has no way to say otherwise.
  UPDATE public.sp_claims
     SET lifecycle_state = 'withdrawn'
   WHERE id = _claim_id;

  INSERT INTO public.sp_passport_events
    (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES
    (_holder, auth.uid(), 'claim_withdrawn', 'claim', _claim_id,
     jsonb_build_object(
       'action',        'archived_by_holder',
       'from_state',    _state,
       'reason',        left(coalesce(_reason, ''), 300)));
END $fn$;

COMMENT ON FUNCTION public.sp_archive_claim IS
  'The holder removes an entry from their ACTIVE Passport without deleting '
  'anything: lifecycle_state becomes withdrawn, and assertion_level, the '
  'verifier, the verification timestamp, the version chain and the evidence '
  'are untouched. Refuses a disputed entry (that is resolved, not archived) '
  'and an entry with an open review.';

REVOKE ALL ON FUNCTION public.sp_archive_claim(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_archive_claim(uuid,text) TO authenticated;

COMMIT;