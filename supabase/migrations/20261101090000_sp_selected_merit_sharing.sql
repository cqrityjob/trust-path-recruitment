-- =============================================================================
-- Security Passport — the holder chooses WHICH merits a share carries.
-- =============================================================================
--
-- ── WHAT SHARING COULD DO BEFORE THIS ──────────────────────────────────
--
-- Two shapes, and nothing between them:
--
--   * a PACKAGE  (`sp_create_disclosure`) — every verified, active credential
--     the holder owns, or every verified employment, or both, decided by a
--     five-value taxonomy the holder had to learn before they could send
--     anybody anything.
--   * ONE CREDENTIAL (`sp_create_credential_disclosure`, Phase 9) — exactly
--     one claim, by `focus_claim_id`.
--
-- So a holder who wanted to send two of their four credentials and one of
-- their three employments had no way to say so. They shared all seven or they
-- shared one. And a package is evaluated at READ time: a credential verified
-- next month silently joins a link sent last month, because the payload's
-- filter is "everything of yours that is verified and active", not "the
-- things you chose".
--
-- ── WHAT THIS ADDS, AND WHY IT IS THE SAME MECHANISM ───────────────────
--
-- Phase 9 already established the shape: a disclosure may carry a NARROWING,
-- applied server-side, that can only ever subtract. `focus_claim_id` is that
-- narrowing with a maximum of one claim and no employment. This generalises
-- it to a list, in `sp_disclosure_items`, and nothing else about a share
-- changes:
--
--   * the same `sp_disclosures` row, so the same 32-byte token, of which only
--     the SHA-256 is ever stored;
--   * the same expiry column and the same revocation path;
--   * the same `sp_get_disclosure` head — revoked, expired, never-existed and
--     throttled all return one indistinguishable `unavailable`;
--   * the same rate limit in front of the same single service-role boundary.
--
-- A second sharing architecture would have meant a second token format, a
-- second revocation path and a second fail-closed head. There is still one.
--
-- ── THE SELECTION IS PINNED, AND IT CAN ONLY EVER NARROW ───────────────
--
-- The items are rows, written once, at creation. Two consequences the product
-- depends on:
--
--   1. A MERIT ADDED LATER IS NOT IN AN OLDER SHARE. It was not selected, so
--      no row names it, so the payload's `= ANY(...)` cannot reach it. The
--      holder's decision is a fact about a moment, not a standing query.
--
--   2. A MERIT THAT STOPS BEING CURRENT LEAVES THE SHARE. The claim filter
--      still demands `assertion_level = 'verified' AND lifecycle_state =
--      'active'` on top of the item list, so a credential later revoked,
--      superseded or archived drops out of an existing link rather than
--      continuing to be presented as current. Selection narrows; it never
--      promotes, and it never preserves.
--
-- ── WHY A SIXTH PACKAGE CODE RATHER THAN REUSING ONE ───────────────────
--
-- `sp_disclosure_payload` gates BOTH content and the exact authorisation
-- scope on `package_code`, and no existing code says what a selected share
-- means:
--
--   public_card              carries no employment at all
--   verified_experience      carries no credentials at all
--   employer_review          sets `_may_see_exact_scope`
--   full_verification        sets `_may_see_exact_scope`
--
-- A selected share must be able to carry both kinds and must NOT hand a
-- stranger the protected object a credential authorises. Borrowing
-- `full_verification` to get both would have widened the disclosure while
-- appearing to narrow it — precisely the failure this file exists to avoid.
-- So `selected_merits` is its own contract: both kinds, by explicit
-- selection, with `authorisation_scope` withheld exactly as the public card
-- withholds it, and `scope_limited` still told so an absence is not read as
-- "unlimited".
--
-- ── THE TENURE TOTAL IS SCOPED TOO ─────────────────────────────────────
--
-- `verified_experience_days` on the existing packages sums EVERY verified
-- active period the holder has, whatever the disclosure carries. Inside a
-- selected share that would be a number derived from employments the holder
-- did not choose to disclose — a leak with no row to point at. Here it is
-- summed over the SELECTED periods only, and it is 0 when none were chosen.
--
-- ── ONE BUILDER, SO THE PREVIEW CANNOT DRIFT ───────────────────────────
--
-- The holder must be able to see exactly what the recipient will see. A
-- second assembly of "what a selected share contains", written for the
-- preview, is a second contract that disagrees with production the first time
-- either is edited. So `sp_selected_merits_payload` is the only place a
-- selected payload is built, and both callers go through it:
--
--   sp_disclosure_payload            (the live link, via the item rows)
--   sp_preview_selected_disclosure   (the holder's preview, via the same ids)
--
-- Given the same holder and the same ids they return the same jsonb. That is
-- a property a test can assert, and supabase/tests asserts it.
--
-- ── A LOST RESPONSE MUST NOT BECOME TWO LINKS ──────────────────────────
--
-- The plaintext token exists exactly once, in the reply. If that reply is
-- lost to a dropped connection the holder has a live share they never saw,
-- and a naive retry mints a SECOND one — two live links where the holder
-- believes there are none.
--
-- `request_key` closes it. The caller sends the same key on a retry, and the
-- second call returns `already_created` with the disclosure id instead of a
-- token. The token is deliberately NOT recoverable — only its hash was ever
-- stored, and making a link retrievable after the fact would be a standing
-- liability far worse than re-creating one — so the honest answer is "a link
-- was created, it is in your list, revoke it and make another". The important
-- half is that there is exactly one row either way.
--
-- ── WHAT THIS DOES NOT CHANGE ──────────────────────────────────────────
--
-- No existing package's payload, no existing function's behaviour for an
-- existing row, no trust rule, no assertion level, no verification method, no
-- lifecycle rule, no RLS policy on an existing table, no grant on an existing
-- table, and no anonymous surface. `sp_get_disclosure` keeps its service-role
-- only grant. `sp_disclosure_payload` is reproduced verbatim below its new
-- delegation branch so a reviewer can diff it and see one addition.
--
-- Reversible: supabase/rollback/20261101090000_sp_selected_merit_sharing_rollback.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The sixth package code
-- ---------------------------------------------------------------------------
-- The CHECK is a closed set on purpose: an unknown code must never become a
-- row whose payload nobody has reviewed. Widening it is this diff.
ALTER TABLE public.sp_disclosures
  DROP CONSTRAINT IF EXISTS sp_disclosures_package_code_check;

ALTER TABLE public.sp_disclosures
  ADD CONSTRAINT sp_disclosures_package_code_check CHECK (package_code IN
    ('public_card', 'verified_qualifications', 'verified_experience',
     'employer_review', 'full_verification', 'selected_merits'));

-- ---------------------------------------------------------------------------
-- 2. The language the recipient reads in, and the idempotency key
-- ---------------------------------------------------------------------------
-- A share is addressed to one person, and the holder knows which language
-- that person reads. Without this the recipient page fell back to the
-- VISITOR's own stored preference, which for a Swedish licence sent to a
-- London agency is the wrong answer in both directions.
--
-- Nullable, and NULL keeps today's behaviour exactly: the page uses the
-- reader's own language. Nothing is inferred from the holder's jurisdiction.
ALTER TABLE public.sp_disclosures
  ADD COLUMN IF NOT EXISTS locale text;

ALTER TABLE public.sp_disclosures
  DROP CONSTRAINT IF EXISTS sp_disclosures_locale_check;
ALTER TABLE public.sp_disclosures
  ADD CONSTRAINT sp_disclosures_locale_check
  CHECK (locale IS NULL OR locale IN ('sv', 'en'));

ALTER TABLE public.sp_disclosures
  ADD COLUMN IF NOT EXISTS request_key uuid;

COMMENT ON COLUMN public.sp_disclosures.request_key IS
  'Caller-generated idempotency key. A retry of a create whose response was '
  'lost finds the existing row instead of minting a second live link. Unique '
  'per holder; NULL for every share created before this migration.';

-- Partial, and per HOLDER: two people may generate the same uuid without one
-- of them being refused, and a key is only meaningful inside the account that
-- issued it.
CREATE UNIQUE INDEX IF NOT EXISTS sp_disclosures_request_key_uidx
  ON public.sp_disclosures (holder_user_id, request_key)
  WHERE request_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. The selection itself
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_disclosure_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disclosure_id uuid NOT NULL REFERENCES public.sp_disclosures(id) ON DELETE CASCADE,

  -- Exactly one of these. A row is a credential OR an employment; a row that
  -- is both, or neither, is not a merit and the CHECK refuses it.
  claim_id      uuid REFERENCES public.sp_claims(id) ON DELETE CASCADE,
  experience_id uuid REFERENCES public.sp_experience_periods(id) ON DELETE CASCADE,

  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_disclosure_items_one_subject
    CHECK (num_nonnulls(claim_id, experience_id) = 1)
);

COMMENT ON TABLE public.sp_disclosure_items IS
  'Which merits one disclosure carries. Written once, at creation, by '
  'sp_create_selected_disclosure only. The payload intersects this list with '
  'the verified-and-active filter, so the selection can only ever narrow: a '
  'merit added later is absent, and a merit that lapses drops out.';

CREATE UNIQUE INDEX IF NOT EXISTS sp_disclosure_items_claim_uidx
  ON public.sp_disclosure_items (disclosure_id, claim_id)
  WHERE claim_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sp_disclosure_items_experience_uidx
  ON public.sp_disclosure_items (disclosure_id, experience_id)
  WHERE experience_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sp_disclosure_items_disclosure_idx
  ON public.sp_disclosure_items (disclosure_id);

ALTER TABLE public.sp_disclosure_items ENABLE ROW LEVEL SECURITY;

-- The holder may READ their own selection: the sharing centre has to be able
-- to say "this link carries these three merits" without asking the recipient
-- boundary. There is deliberately no INSERT, UPDATE or DELETE policy and no
-- write grant — the only writer is the SECURITY DEFINER creator below, which
-- is what makes the scope a server-side fact rather than a browser one.
DROP POLICY IF EXISTS sp_disclosure_items_self ON public.sp_disclosure_items;
CREATE POLICY sp_disclosure_items_self ON public.sp_disclosure_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sp_disclosures d
                  WHERE d.id = sp_disclosure_items.disclosure_id
                    AND d.holder_user_id = auth.uid()));

-- Supabase's ALTER DEFAULT PRIVILEGES grants BOTH anon and authenticated the
-- full set on every new table in `public`, including TRUNCATE, which RLS does
-- not cover. A new table therefore arrives writable by every signed-in
-- account until these lines run, so the revoke is total and the one privilege
-- the product needs is granted back explicitly.
--
-- `authenticated` is on the revoke list deliberately, and it is the important
-- half: with INSERT, a holder could add an item row to their own share and
-- widen a link a recipient already holds, which is precisely the thing the
-- item table exists to make impossible.
REVOKE ALL ON public.sp_disclosure_items FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.sp_disclosure_items TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The one builder
-- ---------------------------------------------------------------------------
-- STABLE and side-effect free: it counts no access and writes no log, so the
-- holder's preview cannot inflate the share's own numbers. The live path does
-- its counting in `sp_get_disclosure`, before it ever reaches here.
--
-- Ordering is explicit on both aggregates. Two callers that must return the
-- same jsonb cannot rely on the planner returning rows in the same order.
CREATE OR REPLACE FUNCTION public.sp_selected_merits_payload(
  _holder         uuid,
  _claim_ids      uuid[],
  _experience_ids uuid[],
  _purpose        text,
  _locale         text,
  _expires_at     timestamptz,
  _authorised_at  timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _p public.sp_passport_profiles%ROWTYPE;
  _c uuid[] := coalesce(_claim_ids, '{}'::uuid[]);
  _e uuid[] := coalesce(_experience_ids, '{}'::uuid[]);
BEGIN
  SELECT * INTO _p FROM public.sp_passport_profiles WHERE holder_user_id = _holder;
  -- No profile is no Passport. It renders as the same single unavailable
  -- payload every other refusal renders as.
  IF NOT FOUND THEN RETURN jsonb_build_object('status','unavailable'); END IF;

  RETURN jsonb_build_object(
    'status','active',
    'package','selected_merits',
    -- A selected share is a Passport, however few merits it carries. `focus`
    -- names the OBJECT, not the count: one selected credential is still the
    -- holder's Passport narrowed, not the Phase 9 single-credential page.
    'focus','passport',
    'purpose', _purpose,
    'locale', _locale,
    'expires_at', _expires_at,
    'authorised_at', _authorised_at,
    'last_updated', greatest(_p.updated_at, coalesce(_authorised_at, _p.updated_at)),
    'holder', CASE _p.privacy_mode
                WHEN 'anonymous' THEN NULL
                WHEN 'initials'  THEN regexp_replace(coalesce(_p.display_name,''), '(\S)\S*', '\1.', 'g')
                ELSE _p.display_name END,
    'privacy_mode', _p.privacy_mode,
    'profession_slug', _p.cig_profession_slug,
    'jurisdiction', _p.jurisdiction_code,
    'sub_jurisdiction', _p.sub_jurisdiction_code,
    'verified_claims', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'type', c.claim_type, 'title', c.title,
        'credential_code', c.credential_code,
        'issuer', c.claimed_issuer_name, 'jurisdiction', c.jurisdiction_code,
        'sub_jurisdiction', c.sub_jurisdiction_code,
        -- That limits EXIST. Narrower and honester than silence, which a
        -- reader takes for "unlimited".
        'scope_limited', (c.authorisation_scope IS NOT NULL
                          AND length(btrim(c.authorisation_scope)) > 0),
        -- WHAT they are is withheld, exactly as the public card withholds it.
        -- A selected share is sent to whoever the holder chose; it is not an
        -- application the holder answered, and it is not a package they
        -- picked knowing it carries the protected object.
        'authorisation_scope', NULL,
        'issued_on', c.issued_on, 'valid_until', c.valid_until,
        'assertion', c.assertion_level, 'lifecycle', c.lifecycle_state,
        'verified_at', c.verified_at,
        'verifier_organisation', (SELECT d2.decider_organisation
                                    FROM public.sp_verification_decisions d2
                                    JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                   WHERE r2.claim_id = c.id AND d2.decision = 'approved'
                                   ORDER BY d2.decided_at DESC LIMIT 1),
        'verification_method', (SELECT d2.verification_method
                                  FROM public.sp_verification_decisions d2
                                  JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                 WHERE r2.claim_id = c.id AND d2.decision = 'approved'
                                 ORDER BY d2.decided_at DESC LIMIT 1))
        ORDER BY c.issued_on DESC NULLS LAST, c.id)
      FROM public.sp_claims c
      WHERE c.holder_user_id = _holder
        -- The selection NARROWS. It never promotes: an unverified or archived
        -- claim named by an item row is still refused here.
        AND c.assertion_level = 'verified' AND c.lifecycle_state = 'active'
        AND c.id = ANY(_c)
    ), '[]'::jsonb),
    'verified_experience', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'employer', e.employer_name, 'role', e.role_title,
        'started_on', e.started_on, 'ended_on', e.ended_on,
        'jurisdiction', e.jurisdiction_code,
        'assertion', e.assertion_level, 'lifecycle', e.lifecycle_state,
        -- WHICH ACT BACKS THIS EMPLOYMENT.
        --
        -- The existing packages send neither field, so their recipient page
        -- says nothing at all about how an employment came to be verified --
        -- and a reader with no answer supplies their own, which for a
        -- security record is "somebody official checked it".
        --
        -- An employment can reach `verified` two ways: the employer confirmed
        -- a fact they were party to, or CQrityjob read a contract. Those are
        -- different claims and the reader must be able to tell them apart, so
        -- the DECIDER and the METHOD are carried and the page renders the
        -- sentence the shared trust engine returns for them. Nothing is
        -- inferred: both are the recorded decision or they are null.
        --
        -- This is not new information about the employer. `employer` above
        -- already names the company; what is added is which act it performed.
        'verifier_organisation', (SELECT d2.decider_organisation
                                    FROM public.sp_verification_decisions d2
                                    JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                   WHERE r2.period_id = e.id AND d2.decision = 'approved'
                                   ORDER BY d2.decided_at DESC LIMIT 1),
        'verification_method', (SELECT d2.verification_method
                                  FROM public.sp_verification_decisions d2
                                  JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                 WHERE r2.period_id = e.id AND d2.decision = 'approved'
                                 ORDER BY d2.decided_at DESC LIMIT 1))
        ORDER BY e.started_on DESC, e.id)
      FROM public.sp_experience_periods e
      WHERE e.holder_user_id = _holder
        AND e.assertion_level = 'verified' AND e.lifecycle_state = 'active'
        AND e.id = ANY(_e)
    ), '[]'::jsonb),
    -- Over the SELECTED periods only. The package total sums every verified
    -- period the holder has, which inside a chosen scope would be a figure
    -- derived from employments the holder did not disclose.
    'verified_experience_days', coalesce((
      SELECT sum(coalesce(e.ended_on, current_date) - e.started_on)
        FROM public.sp_experience_periods e
       WHERE e.holder_user_id = _holder
         AND e.assertion_level = 'verified' AND e.lifecycle_state = 'active'
         AND e.id = ANY(_e)
    ), 0));
END; $function$;

REVOKE ALL ON FUNCTION public.sp_selected_merits_payload(uuid,uuid[],uuid[],text,text,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The live payload delegates for a selected share
-- ---------------------------------------------------------------------------
-- Everything below the first branch is 20260908094000's body, verbatim.
CREATE OR REPLACE FUNCTION public.sp_disclosure_payload(_disclosure_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _d public.sp_disclosures%ROWTYPE;
  _p public.sp_passport_profiles%ROWTYPE;
  _may_see_exact_scope boolean;
BEGIN
  SELECT * INTO _d FROM public.sp_disclosures WHERE id = _disclosure_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','unavailable'); END IF;

  -- A selected share's scope is the item rows, so it is assembled by the one
  -- builder both it and the holder's preview go through.
  IF _d.package_code = 'selected_merits' THEN
    RETURN public.sp_selected_merits_payload(
      _d.holder_user_id,
      coalesce((SELECT array_agg(i.claim_id)
                  FROM public.sp_disclosure_items i
                 WHERE i.disclosure_id = _d.id AND i.claim_id IS NOT NULL), '{}'::uuid[]),
      coalesce((SELECT array_agg(i.experience_id)
                  FROM public.sp_disclosure_items i
                 WHERE i.disclosure_id = _d.id AND i.experience_id IS NOT NULL), '{}'::uuid[]),
      _d.purpose,
      _d.locale,
      _d.expires_at,
      _d.created_at);
  END IF;

  SELECT * INTO _p FROM public.sp_passport_profiles
   WHERE holder_user_id = _d.holder_user_id;

  _may_see_exact_scope := (
    _d.application_id IS NOT NULL
    OR _d.package_code IN ('employer_review', 'full_verification')
  );

  RETURN jsonb_build_object(
    'status','active',
    'package', _d.package_code,
    'focus', CASE WHEN _d.focus_claim_id IS NULL THEN 'passport' ELSE 'credential' END,
    'purpose', _d.purpose,
    'locale', _d.locale,
    'expires_at', _d.expires_at,
    'authorised_at', _d.created_at,
    'last_updated', greatest(_p.updated_at, _d.created_at),
    'holder', CASE _p.privacy_mode
                WHEN 'anonymous' THEN NULL
                WHEN 'initials'  THEN regexp_replace(coalesce(_p.display_name,''), '(\S)\S*', '\1.', 'g')
                ELSE _p.display_name END,
    'privacy_mode', _p.privacy_mode,
    'profession_slug', _p.cig_profession_slug,
    'jurisdiction', _p.jurisdiction_code,
    'sub_jurisdiction', _p.sub_jurisdiction_code,
    'verified_claims', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'type', c.claim_type, 'title', c.title,
        'credential_code', c.credential_code,
        'issuer', c.claimed_issuer_name, 'jurisdiction', c.jurisdiction_code,
        'sub_jurisdiction', c.sub_jurisdiction_code,
        'scope_limited', (c.authorisation_scope IS NOT NULL
                          AND length(btrim(c.authorisation_scope)) > 0),
        'authorisation_scope', CASE WHEN _may_see_exact_scope
                                    THEN c.authorisation_scope ELSE NULL END,
        'issued_on', c.issued_on, 'valid_until', c.valid_until,
        'assertion', c.assertion_level, 'lifecycle', c.lifecycle_state,
        'verified_at', c.verified_at,
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
        AND (_d.focus_claim_id IS NULL OR c.id = _d.focus_claim_id)
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
        AND _d.focus_claim_id IS NULL
    ), '[]'::jsonb),
    'verified_experience_days', CASE
      WHEN _d.focus_claim_id IS NOT NULL THEN 0
      WHEN _d.package_code IN ('public_card','verified_experience','full_verification')
      THEN coalesce((
        SELECT sum(coalesce(e.ended_on, current_date) - e.started_on)
          FROM public.sp_experience_periods e
         WHERE e.holder_user_id = _d.holder_user_id
           AND e.assertion_level = 'verified' AND e.lifecycle_state = 'active'
      ), 0)
      ELSE 0 END);
END; $function$;


-- ---------------------------------------------------------------------------
-- 6. Creation
-- ---------------------------------------------------------------------------
-- Returns jsonb rather than the bare token `sp_create_disclosure` returns,
-- because there are now two outcomes a caller has to tell apart: a link was
-- minted, or this request had already minted one. A text return could only
-- express the first.
--
-- ONE REFUSAL FOR EVERY BAD MERIT ID. "Not yours", "does not exist", "not
-- verified" and "archived" all raise SP_MERIT_NOT_SHAREABLE, and none of them
-- names the id. Distinguishing them would turn this function into an oracle
-- for which claim ids exist and who owns them — the same reason the recipient
-- boundary has exactly one `unavailable`.
CREATE OR REPLACE FUNCTION public.sp_create_selected_disclosure(
  _claim_ids      uuid[],
  _experience_ids uuid[],
  _expires_days   integer,
  _purpose        text,
  _recipient_hint text,
  _locale         text,
  _request_key    uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  _token text;
  _id uuid;
  _existing public.sp_disclosures%ROWTYPE;
  _expires timestamptz;
  -- Deduplicated: a caller that sends the same id twice means it once, and a
  -- duplicate would otherwise trip the unique index and fail the whole create.
  _c uuid[] := (SELECT coalesce(array_agg(DISTINCT x), '{}'::uuid[])
                  FROM unnest(coalesce(_claim_ids, '{}'::uuid[])) AS x);
  _e uuid[] := (SELECT coalesce(array_agg(DISTINCT x), '{}'::uuid[])
                  FROM unnest(coalesce(_experience_ids, '{}'::uuid[])) AS x);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE='insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles
                  WHERE holder_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'SP_NO_PASSPORT' USING ERRCODE='no_data_found';
  END IF;

  -- The retry path, checked BEFORE anything is validated or written: a lost
  -- response must reconcile even if the selection has since become
  -- unshareable, because the link it produced is live either way.
  IF _request_key IS NOT NULL THEN
    SELECT * INTO _existing FROM public.sp_disclosures
     WHERE holder_user_id = auth.uid() AND request_key = _request_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'status','already_created',
        'disclosure_id', _existing.id,
        'expires_at', _existing.expires_at,
        'created_at', _existing.created_at);
    END IF;
  END IF;

  -- A share of nothing is a link to an empty page. Refused rather than minted.
  IF cardinality(_c) + cardinality(_e) = 0 THEN
    RAISE EXCEPTION 'SP_NOTHING_SELECTED: choose at least one current merit to share.'
      USING ERRCODE='check_violation';
  END IF;

  -- A ceiling, so a crafted call cannot write an unbounded item list.
  IF cardinality(_c) + cardinality(_e) > 200 THEN
    RAISE EXCEPTION 'SP_TOO_MANY_MERITS' USING ERRCODE='check_violation';
  END IF;

  IF _locale IS NOT NULL AND _locale NOT IN ('sv','en') THEN
    RAISE EXCEPTION 'SP_UNKNOWN_LOCALE' USING ERRCODE='check_violation';
  END IF;

  -- SECURITY DEFINER means RLS does not protect this function. These two
  -- counts ARE the ownership boundary.
  IF (SELECT count(*) FROM public.sp_claims c
       WHERE c.id = ANY(_c) AND c.holder_user_id = auth.uid()
         AND c.assertion_level = 'verified' AND c.lifecycle_state = 'active')
     <> cardinality(_c) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current, verified '
      'merits can be shared.' USING ERRCODE='check_violation';
  END IF;

  IF (SELECT count(*) FROM public.sp_experience_periods e
       WHERE e.id = ANY(_e) AND e.holder_user_id = auth.uid()
         AND e.assertion_level = 'verified' AND e.lifecycle_state = 'active')
     <> cardinality(_e) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current, verified '
      'merits can be shared.' USING ERRCODE='check_violation';
  END IF;

  _expires := CASE WHEN _expires_days IS NULL THEN NULL
                   ELSE now() + (_expires_days || ' days')::interval END;

  _token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.sp_disclosures (
    holder_user_id, package_code, token_hash, purpose, recipient_hint,
    locale, expires_at, request_key)
  VALUES (auth.uid(), 'selected_merits', encode(digest(_token, 'sha256'), 'hex'),
          _purpose, _recipient_hint, _locale, _expires, _request_key)
  RETURNING id INTO _id;

  INSERT INTO public.sp_disclosure_items (disclosure_id, claim_id)
  SELECT _id, x FROM unnest(_c) AS x;

  INSERT INTO public.sp_disclosure_items (disclosure_id, experience_id)
  SELECT _id, x FROM unnest(_e) AS x;

  INSERT INTO public.sp_passport_events (
    holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), auth.uid(), 'privacy_changed', 'profile', _id,
          -- COUNTS, never the token and never the merit titles. This log is
          -- read by support and by the holder's own history.
          jsonb_build_object('action','selected_disclosure_created',
                             'claims', cardinality(_c),
                             'employments', cardinality(_e)));

  RETURN jsonb_build_object(
    'status','created',
    'token', _token,
    'disclosure_id', _id,
    'expires_at', _expires);
END; $function$;

REVOKE ALL ON FUNCTION public.sp_create_selected_disclosure(uuid[],uuid[],integer,text,text,text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_create_selected_disclosure(uuid[],uuid[],integer,text,text,text,uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. The preview
-- ---------------------------------------------------------------------------
-- The SAME builder the live link goes through, called with the ids the holder
-- has ticked. It creates nothing, counts no access and mints no token, so a
-- holder may look as often as they like.
--
-- It validates ownership exactly as creation does — a preview that would
-- render somebody else's credential is a read of somebody else's credential,
-- whatever it is called.
CREATE OR REPLACE FUNCTION public.sp_preview_selected_disclosure(
  _claim_ids      uuid[],
  _experience_ids uuid[],
  _expires_days   integer,
  _purpose        text,
  _locale         text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _c uuid[] := (SELECT coalesce(array_agg(DISTINCT x), '{}'::uuid[])
                  FROM unnest(coalesce(_claim_ids, '{}'::uuid[])) AS x);
  _e uuid[] := (SELECT coalesce(array_agg(DISTINCT x), '{}'::uuid[])
                  FROM unnest(coalesce(_experience_ids, '{}'::uuid[])) AS x);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE='insufficient_privilege';
  END IF;

  IF cardinality(_c) + cardinality(_e) > 200 THEN
    RAISE EXCEPTION 'SP_TOO_MANY_MERITS' USING ERRCODE='check_violation';
  END IF;

  IF (SELECT count(*) FROM public.sp_claims c
       WHERE c.id = ANY(_c) AND c.holder_user_id = auth.uid()
         AND c.assertion_level = 'verified' AND c.lifecycle_state = 'active')
     <> cardinality(_c) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current, verified '
      'merits can be shared.' USING ERRCODE='check_violation';
  END IF;

  IF (SELECT count(*) FROM public.sp_experience_periods e
       WHERE e.id = ANY(_e) AND e.holder_user_id = auth.uid()
         AND e.assertion_level = 'verified' AND e.lifecycle_state = 'active')
     <> cardinality(_e) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current, verified '
      'merits can be shared.' USING ERRCODE='check_violation';
  END IF;

  RETURN public.sp_selected_merits_payload(
    auth.uid(), _c, _e, _purpose, _locale,
    CASE WHEN _expires_days IS NULL THEN NULL
         ELSE now() + (_expires_days || ' days')::interval END,
    now());
END; $function$;

REVOKE ALL ON FUNCTION public.sp_preview_selected_disclosure(uuid[],uuid[],integer,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_preview_selected_disclosure(uuid[],uuid[],integer,text,text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Postflight
-- ---------------------------------------------------------------------------
-- Asserted inside the migration's own transaction, so a partial or subtly
-- wrong apply rolls back rather than being discovered by a recipient.
DO $$
DECLARE _n integer;
BEGIN
  -- The item table is not reachable from the Data API except as a holder read.
  IF has_table_privilege('anon', 'public.sp_disclosure_items', 'SELECT')
     OR has_table_privilege('anon', 'public.sp_disclosure_items', 'INSERT')
     OR has_table_privilege('anon', 'public.sp_disclosure_items', 'UPDATE')
     OR has_table_privilege('anon', 'public.sp_disclosure_items', 'DELETE')
     OR has_table_privilege('anon', 'public.sp_disclosure_items', 'TRUNCATE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: anon can reach sp_disclosure_items.';
  END IF;

  IF has_table_privilege('authenticated', 'public.sp_disclosure_items', 'INSERT')
     OR has_table_privilege('authenticated', 'public.sp_disclosure_items', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.sp_disclosure_items', 'DELETE')
     OR has_table_privilege('authenticated', 'public.sp_disclosure_items', 'TRUNCATE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: a holder can write sp_disclosure_items '
      'directly; the selection would no longer be a server-side fact.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.sp_disclosure_items', 'SELECT') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: a holder cannot read their own selection.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.sp_disclosure_items'::regclass) THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: RLS is not enabled on sp_disclosure_items.';
  END IF;

  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'sp_disclosure_items';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: expected exactly one policy on '
      'sp_disclosure_items, found %.', _n;
  END IF;

  -- The three new functions: SECURITY DEFINER, pinned search_path, and no
  -- anonymous execution.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('sp_selected_merits_payload','sp_create_selected_disclosure',
                       'sp_preview_selected_disclosure')
     AND (NOT p.prosecdef OR p.proconfig IS NULL);
  IF _n > 0 THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: a new function is not SECURITY DEFINER '
      'with a pinned search_path.';
  END IF;

  IF has_function_privilege('anon',
       'public.sp_create_selected_disclosure(uuid[],uuid[],integer,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.sp_preview_selected_disclosure(uuid[],uuid[],integer,text,text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.sp_selected_merits_payload(uuid,uuid[],uuid[],text,text,timestamptz,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: anon can execute a new sharing function.';
  END IF;

  -- The builder is internal: only the two callers above and the recipient
  -- boundary reach it, and they are all SECURITY DEFINER.
  IF has_function_privilege('authenticated',
       'public.sp_selected_merits_payload(uuid,uuid[],uuid[],text,text,timestamptz,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: authenticated can execute the payload builder.';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.sp_create_selected_disclosure(uuid[],uuid[],integer,text,text,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.sp_preview_selected_disclosure(uuid[],uuid[],integer,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: a holder cannot create or preview a share.';
  END IF;

  -- The recipient boundary is unchanged: still service-role only.
  IF has_function_privilege('anon', 'public.sp_get_disclosure(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sp_get_disclosure(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: sp_get_disclosure is no longer service-role only.';
  END IF;

  -- The sixth package code is accepted and a seventh is not.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.sp_disclosures'::regclass
       AND conname = 'sp_disclosures_package_code_check'
       AND pg_get_constraintdef(oid) LIKE '%selected_merits%') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: selected_merits is not an accepted package.';
  END IF;

  -- The idempotency index, without which a lost response mints a second link.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public'
                    AND indexname = 'sp_disclosures_request_key_uidx') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: the request-key index is missing.';
  END IF;
END $$;

COMMIT;
