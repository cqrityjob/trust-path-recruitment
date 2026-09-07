-- =============================================================================
-- Security Passport — the holder chooses WHICH merits a share carries, and
-- the recipient is told exactly what backs each one.
-- =============================================================================
--
-- ── WHAT SHARING COULD DO BEFORE THIS ──────────────────────────────────
--
-- Two shapes, and nothing between them:
--
--   * a PACKAGE  (`sp_create_disclosure`) — every verified, active credential
--     the holder owns, or every verified employment, decided by a five-value
--     taxonomy the holder had to learn before they could send anybody
--     anything.
--   * ONE CREDENTIAL (`sp_create_credential_disclosure`, Phase 9) — exactly
--     one claim, by `focus_claim_id`.
--
-- So a holder who wanted to send two of their four credentials and one of
-- their three employments had no way to say so. And a package is evaluated at
-- READ time: a credential verified next month silently joins a link sent last
-- month, because the payload's filter is "everything of yours that qualifies",
-- not "the things you chose".
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
-- ── THE SHARING POLICY, IN ONE PLACE ───────────────────────────────────
--
-- A merit may be shared IF AND ONLY IF its lifecycle is `active`.
--
--   active      shareable, at whatever standing it actually has
--   draft       NEVER: unfinished private work, not a merit
--   expired · revoked · superseded · disputed
--               NEVER: history. A surface may show them to their own holder,
--               but a stranger must not meet them as current
--
-- ASSERTION LEVEL DOES NOT GATE SHARING, and this is a deliberate reversal of
-- the first cut of this migration, which required `verified`. Requiring it
-- meant a holder with a real, honestly-recorded work history could share
-- nothing at all until CQrityjob had reviewed something — and, worse, it made
-- "present on the page" silently mean "verified", so the recipient never had
-- to read a label to draw a conclusion.
--
-- The product decision is the opposite: share what you have, and say what
-- backs each item. So a self-declared entry travels with `assertion` =
-- `self_declared` and reads as Egen uppgift / Self-declared; a CQrityjob
-- document review reads as Dokumenterad / Documented; only a source
-- confirming a fact it was party to reads as Källbekräftad / Source-confirmed.
-- The stored provenance travels unchanged and every word is derived from it by
-- the one shared engine (PR #189). Nothing here promotes anything: the
-- verification method and the deciding organisation are the recorded values or
-- they are NULL, and a NULL cannot become a source confirmation.
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
--   2. A MERIT THAT STOPS BEING CURRENT LEAVES THE SHARE. The filter still
--      demands `lifecycle_state = 'active'` on top of the item list, so a
--      credential later revoked, superseded or archived drops OUT of an
--      existing link rather than continuing to be presented as current.
--      Selection narrows; it never promotes, and it never preserves.
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
--
-- ── NO DATABASE IDENTIFIER CROSSES THE ANONYMOUS BOUNDARY ──────────────
--
-- The payload used to carry each claim's and each period's real `id`, because
-- a renderer needs a stable key per row. A uuid printed into anonymous JSON
-- (and from there into the DOM, a screenshot, an analytics payload or a
-- support ticket) is a durable internal identifier handed to a stranger for
-- no benefit: it survives revocation, it is the same value in two different
-- shares, and it correlates one recipient's copy with another's.
--
-- So the builder emits `key` — `c1`, `c2`, `e1` — an ORDINAL within this one
-- payload. It is stable for as long as the render is, it is what React and
-- the identity engine actually need, and it says nothing. `sp_get_disclosure`
-- additionally strips `id` from every row of whichever branch built the
-- payload, so the anonymous boundary holds even for the five older packages.
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
-- Given the same holder and the same ids they return the same jsonb apart
-- from the two clock fields. supabase/tests asserts exactly that.
--
-- ── A LOST RESPONSE MUST NOT BECOME TWO LINKS ──────────────────────────
--
-- The plaintext token exists exactly once, in the reply. If that reply is
-- lost the holder has a live share they never saw, and a naive retry mints a
-- SECOND one — two live links where the holder believes there are none.
--
-- `request_key` closes it, and `request_fingerprint` makes the close honest:
--
--   same key, same facts      the original result is REPLAYED. No second row.
--   same key, changed facts   SP_REQUEST_KEY_CONFLICT. A key names one
--                             intention; reusing it for another is a caller
--                             bug, and answering it with either outcome
--                             (silently replaying the old share, or minting a
--                             new one under the old key) would be wrong.
--   two callers at once       serialised on a transaction-scoped advisory
--                             lock, so the loser REPLAYS rather than meeting
--                             the unique index. A unique violation would
--                             surface the index name to a client and read as
--                             a server fault rather than as the successful
--                             creation it actually is.
--
-- The token is deliberately NOT recoverable — only its hash was ever stored,
-- and making a link retrievable after the fact would be a standing liability.
-- `sp_replace_selected_disclosure` is the safe alternative: it mints a FRESH
-- token over the same contents and lets the holder say whether the previous
-- link should be revoked.
--
-- ── WHAT THIS DOES NOT CHANGE ──────────────────────────────────────────
--
-- No trust rule, no assertion level, no verification method, no lifecycle
-- rule, no RLS policy on an existing table, no grant on an existing table and
-- no anonymous surface. `sp_get_disclosure` keeps its service-role-only grant.
-- The five packages' own content rules are reproduced verbatim.
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
-- 2. The language the recipient reads in, and the idempotency record
-- ---------------------------------------------------------------------------
-- A share is addressed to one person, and the holder knows which language
-- that person reads. Without this the recipient page fell back to the
-- VISITOR's own stored preference, which for a Swedish licence sent to a
-- London agency is the wrong answer in both directions.
--
-- Nullable, and NULL keeps today's behaviour exactly: the page uses the
-- reader's own language. Nothing is inferred from the holder's jurisdiction.
-- Every share this migration's own functions create carries one.
ALTER TABLE public.sp_disclosures
  ADD COLUMN IF NOT EXISTS locale text;

ALTER TABLE public.sp_disclosures
  DROP CONSTRAINT IF EXISTS sp_disclosures_locale_check;
ALTER TABLE public.sp_disclosures
  ADD CONSTRAINT sp_disclosures_locale_check
  CHECK (locale IS NULL OR locale IN ('sv', 'en'));

ALTER TABLE public.sp_disclosures
  ADD COLUMN IF NOT EXISTS request_key uuid;

ALTER TABLE public.sp_disclosures
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

COMMENT ON COLUMN public.sp_disclosures.request_key IS
  'Caller-generated idempotency key. A retry of a create whose response was '
  'lost finds the existing row instead of minting a second live link. Unique '
  'per holder; NULL for every share created before this migration.';

COMMENT ON COLUMN public.sp_disclosures.request_fingerprint IS
  'SHA-256 of every fact that decides what this disclosure IS. A retry whose '
  'facts differ is a conflict, not a replay: a key names one intention.';

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
  'Which merits one disclosure carries. Written once, at creation, by the '
  'selected-sharing functions only. The payload intersects this list with the '
  'active-lifecycle filter, so the selection can only ever narrow: a merit '
  'added later is absent, and a merit that lapses drops out.';

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
-- 4. The request fingerprint
-- ---------------------------------------------------------------------------
-- Every fact that decides what the resulting disclosure IS, hashed into one
-- comparable value. If two calls under one key disagree on any of them, they
-- are two different intentions and the second is a conflict.
--
-- LENGTH-PREFIXED, not delimiter-joined. `purpose` and `recipient_hint` are
-- free text the holder types; a plain separator would let ("a|b", "") and
-- ("a", "b") hash identically, which is exactly how a fingerprint stops being
-- one. Each field is written as <byte length>:<value>.
--
-- The id arrays are sorted and deduplicated by the caller before they get
-- here, so {A,B} and {B,A,B} are one selection and hash alike.
CREATE OR REPLACE FUNCTION public.sp_share_request_fingerprint(
  _holder         uuid,
  _claim_ids      uuid[],
  _experience_ids uuid[],
  _expires_days   integer,
  _purpose        text,
  _recipient_hint text,
  _locale         text,
  _source         uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $function$
  SELECT encode(digest(
    'spshare.v1'
    || '|' || length(coalesce(_holder::text, ''))         || ':' || coalesce(_holder::text, '')
    || '|' || length(coalesce(array_to_string(_claim_ids, ','), ''))
            || ':' || coalesce(array_to_string(_claim_ids, ','), '')
    || '|' || length(coalesce(array_to_string(_experience_ids, ','), ''))
            || ':' || coalesce(array_to_string(_experience_ids, ','), '')
    || '|' || length(coalesce(_expires_days::text, ''))   || ':' || coalesce(_expires_days::text, '')
    || '|' || length(coalesce(_purpose, ''))              || ':' || coalesce(_purpose, '')
    || '|' || length(coalesce(_recipient_hint, ''))       || ':' || coalesce(_recipient_hint, '')
    || '|' || length(coalesce(_locale, ''))               || ':' || coalesce(_locale, '')
    || '|' || length(coalesce(_source::text, ''))         || ':' || coalesce(_source::text, ''),
    'sha256'), 'hex');
$function$;

REVOKE ALL ON FUNCTION public.sp_share_request_fingerprint(uuid,uuid[],uuid[],integer,text,text,text,uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The one payload builder
-- ---------------------------------------------------------------------------
-- STABLE and side-effect free: it counts no access and writes no log, so the
-- holder's preview cannot inflate the share's own numbers. The live path does
-- its counting in `sp_get_disclosure`, before it ever reaches here.
--
-- Ordering is explicit on both aggregates, and the presentation `key` is the
-- ordinal of that ordering. Two callers that must return the same jsonb
-- cannot rely on the planner returning rows in the same order.
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
    -- WHEN THE SHARED FACTS LAST MOVED, and nothing else.
    --
    -- This used to be greatest(profile.updated_at, disclosure.created_at),
    -- which meant a share created today reported "last updated today" about
    -- merits recorded in 2024. A reader takes that for freshness of the
    -- EVIDENCE, so it was the moment of sharing wearing the words of the
    -- record. It is now the latest change among the rows this share actually
    -- carries, plus the profile, whose display name and jurisdiction are
    -- rendered above them.
    'last_updated', (
      SELECT max(t) FROM (
        SELECT max(c.updated_at) FROM public.sp_claims c
          WHERE c.holder_user_id = _holder AND c.lifecycle_state = 'active'
            AND c.id = ANY(_c)
        UNION ALL
        SELECT max(e.updated_at) FROM public.sp_experience_periods e
          WHERE e.holder_user_id = _holder AND e.lifecycle_state = 'active'
            AND e.id = ANY(_e)
        UNION ALL
        SELECT _p.updated_at
      ) AS s(t)),
    'holder', CASE _p.privacy_mode
                WHEN 'anonymous' THEN NULL
                WHEN 'initials'  THEN regexp_replace(coalesce(_p.display_name,''), '(\S)\S*', '\1.', 'g')
                ELSE _p.display_name END,
    'privacy_mode', _p.privacy_mode,
    'profession_slug', _p.cig_profession_slug,
    'jurisdiction', _p.jurisdiction_code,
    'sub_jurisdiction', _p.sub_jurisdiction_code,
    'verified_claims', coalesce((
      -- The ordinal is computed in a derived table: PostgreSQL refuses a
      -- window function inside an aggregate's arguments, and the key must be
      -- the position in the SAME ordering the aggregate emits.
      SELECT jsonb_agg(jsonb_build_object(
        -- A PRESENTATION key, never the row's identifier. See the header.
        'key', 'c' || t.ord,
        'type', t.claim_type, 'title', t.title,
        'credential_code', t.credential_code,
        'issuer', t.claimed_issuer_name, 'jurisdiction', t.jurisdiction_code,
        'sub_jurisdiction', t.sub_jurisdiction_code,
        -- That limits EXIST. Narrower and honester than silence, which a
        -- reader takes for "unlimited".
        'scope_limited', (t.authorisation_scope IS NOT NULL
                          AND length(btrim(t.authorisation_scope)) > 0),
        -- WHAT they are is withheld, exactly as the public card withholds it.
        -- A selected share is sent to whoever the holder chose; it is not an
        -- application the holder answered, and it is not a package they
        -- picked knowing it carries the protected object.
        'authorisation_scope', NULL,
        'issued_on', t.issued_on, 'valid_until', t.valid_until,
        -- The STORED standing, travelling unchanged. Self-declared,
        -- document_provided and verified all reach a recipient; which words
        -- they wear is decided once, by the shared trust engine, from these
        -- three recorded facts and never from presence on the page.
        'assertion', t.assertion_level, 'lifecycle', t.lifecycle_state,
        'verified_at', t.verified_at,
        'verifier_organisation', (SELECT d2.decider_organisation
                                    FROM public.sp_verification_decisions d2
                                    JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                   WHERE r2.claim_id = t.id AND d2.decision = 'approved'
                                   ORDER BY d2.decided_at DESC LIMIT 1),
        'verification_method', (SELECT d2.verification_method
                                  FROM public.sp_verification_decisions d2
                                  JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                 WHERE r2.claim_id = t.id AND d2.decision = 'approved'
                                 ORDER BY d2.decided_at DESC LIMIT 1))
        ORDER BY t.ord)
      FROM (
        SELECT c.*, row_number() OVER (ORDER BY c.issued_on DESC NULLS LAST, c.id) AS ord
          FROM public.sp_claims c
         WHERE c.holder_user_id = _holder
           -- THE SHARING POLICY, in the one place it is enforced for
           -- credentials. Lifecycle only: drafts and archived rows never
           -- leave, and every current merit may, at whatever standing it has.
           AND c.lifecycle_state = 'active'
           AND c.id = ANY(_c)
      ) t
    ), '[]'::jsonb),
    'verified_experience', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'key', 'e' || t.ord,
        'employer', t.employer_name, 'role', t.role_title,
        'started_on', t.started_on, 'ended_on', t.ended_on,
        'jurisdiction', t.jurisdiction_code,
        'assertion', t.assertion_level, 'lifecycle', t.lifecycle_state,
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
                                   WHERE r2.period_id = t.id AND d2.decision = 'approved'
                                   ORDER BY d2.decided_at DESC LIMIT 1),
        'verification_method', (SELECT d2.verification_method
                                  FROM public.sp_verification_decisions d2
                                  JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                 WHERE r2.period_id = t.id AND d2.decision = 'approved'
                                 ORDER BY d2.decided_at DESC LIMIT 1))
        ORDER BY t.ord)
      FROM (
        SELECT e.*, row_number() OVER (ORDER BY e.started_on DESC, e.id) AS ord
          FROM public.sp_experience_periods e
         WHERE e.holder_user_id = _holder
           AND e.lifecycle_state = 'active'
           AND e.id = ANY(_e)
      ) t
    ), '[]'::jsonb),
    -- CONFIRMED employment duration. Two narrowings, both load-bearing:
    --
    --   the SELECTED periods only  — the package total sums every period the
    --     holder has, which inside a chosen scope would be a figure derived
    --     from employments the holder did not disclose;
    --   the VERIFIED ones only     — a self-declared employment is shareable
    --     and appears in the list above, but it is nobody's confirmation and
    --     must not be counted under a heading that says it is.
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
-- 6. The live payload delegates for a selected share
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
-- 7. The anonymous boundary
-- ---------------------------------------------------------------------------
-- Reproduced from 20260903091000 with two additions, both about what leaves:
--
--   * NO DATABASE IDENTIFIER. `id` is stripped from every disclosed row and a
--     presentation `key` put in its place, for whichever branch built the
--     payload. The selected builder already emits no `id`; the five packages
--     do, and they reach this same anonymous page.
--   * A SERVER-AUTHORED CHECK TIME. The page used to print `new Date()` from
--     the visitor's own machine beside the words "checked at", so a skewed
--     clock made the product assert something it had not observed. The moment
--     the record was actually re-read is a fact this function holds.
--
-- The token lookup, the application_id exclusion, the revoked/expired head,
-- the access counting and the single `unavailable` are unchanged.
CREATE OR REPLACE FUNCTION public.sp_get_disclosure(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
-- `public, extensions`, unchanged and deliberately WITHOUT pg_temp: this is a
-- SECURITY DEFINER function reachable by the service role, and pg_temp is a
-- schema any caller can write to. Phase 5 and Phase 7 both assert this exact
-- pinning, and they are right to.
SET search_path = public, extensions AS $function$
DECLARE _d public.sp_disclosures%ROWTYPE; _payload jsonb;
BEGIN
  SELECT * INTO _d FROM public.sp_disclosures
   WHERE token_hash = encode(digest(coalesce(_token,''), 'sha256'), 'hex')
     -- Explicit, not implied by NULL semantics: an application-scoped share
     -- is not a link, and must never become one.
     AND application_id IS NULL;

  IF NOT FOUND OR _d.revoked_at IS NOT NULL
     OR (_d.expires_at IS NOT NULL AND _d.expires_at < now()) THEN
    RETURN jsonb_build_object('status','unavailable');
  END IF;

  UPDATE public.sp_disclosures SET access_count = access_count + 1 WHERE id = _d.id;
  INSERT INTO public.sp_disclosure_accesses (disclosure_id) VALUES (_d.id);

  _payload := public.sp_disclosure_payload(_d.id);

  IF _payload ->> 'status' <> 'active' THEN
    -- Fail closed, and identically: a payload that could not be built is
    -- indistinguishable from a revoked token.
    RETURN jsonb_build_object('status','unavailable');
  END IF;

  _payload := jsonb_set(_payload, '{verified_claims}', coalesce((
    SELECT jsonb_agg((row.value - 'id')
                     || jsonb_build_object('key', coalesce(row.value ->> 'key', 'c' || row.ord))
                     ORDER BY row.ord)
      FROM jsonb_array_elements(_payload -> 'verified_claims')
             WITH ORDINALITY AS row(value, ord)), '[]'::jsonb));

  _payload := jsonb_set(_payload, '{verified_experience}', coalesce((
    SELECT jsonb_agg((row.value - 'id')
                     || jsonb_build_object('key', coalesce(row.value ->> 'key', 'e' || row.ord))
                     ORDER BY row.ord)
      FROM jsonb_array_elements(_payload -> 'verified_experience')
             WITH ORDINALITY AS row(value, ord)), '[]'::jsonb));

  RETURN _payload || jsonb_build_object('checked_at', now());
END; $function$;

REVOKE ALL ON FUNCTION public.sp_get_disclosure(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_get_disclosure(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. The input contract, shared by every selected-sharing entry point
-- ---------------------------------------------------------------------------
-- A Zod schema in the application is a convenience for the person filling in
-- the form. It is not a boundary: the RPC is callable by any authenticated
-- principal with a session and a HTTP client, and everything the browser
-- believes about the request is advisory by the time it arrives here.
--
-- So the contract is asserted where the write happens, by name, and the same
-- three checks run for the preview, the create and the replacement.
CREATE OR REPLACE FUNCTION public.sp_assert_share_inputs(
  _expires_days integer,
  _locale       text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- NULL, 0, -30, 1, 45 and 3650 all land here. There is no default: a share
  -- with no stated lifetime is a decision nobody made.
  IF _expires_days IS NULL OR _expires_days NOT IN (7, 30, 90) THEN
    RAISE EXCEPTION 'SP_UNSUPPORTED_EXPIRY: a share lasts 7, 30 or 90 days.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _locale IS NULL OR _locale NOT IN ('sv', 'en') THEN
    RAISE EXCEPTION 'SP_UNSUPPORTED_LOCALE: a share is rendered in sv or en.'
      USING ERRCODE = 'check_violation';
  END IF;
END; $function$;

REVOKE ALL ON FUNCTION public.sp_assert_share_inputs(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_assert_share_inputs(integer, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Creation
-- ---------------------------------------------------------------------------
-- Returns jsonb rather than the bare token `sp_create_disclosure` returns,
-- because there are now two outcomes a caller has to tell apart: a link was
-- minted, or this request had already minted one.
--
-- ONE REFUSAL FOR EVERY BAD MERIT ID. "Not yours", "does not exist", "not
-- current" and "archived" all raise SP_MERIT_NOT_SHAREABLE, and none of them
-- names the id. Distinguishing them would turn this function into an oracle
-- for which claim ids exist and who owns them — the same reason the recipient
-- boundary has exactly one `unavailable`.
--
-- ORDER MATTERS AND IS DELIBERATE:
--
--   contract → fingerprint → LOCK → replay/conflict → scope validation → write
--
-- The replay check sits before scope validation so that a retry whose answer
-- was lost still reconciles even if one of the merits has since been
-- archived. The link it produced is live either way, and refusing to tell the
-- holder about it would be the worst of both.
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
  _fp text;
  -- Deduplicated AND SORTED: a caller that sends the same id twice means it
  -- once, and {A,B} and {B,A} are one selection. Both matter twice over — the
  -- unique index would refuse the duplicate, and the fingerprint has to be
  -- the same value for the same intention however the array was ordered.
  _c uuid[] := (SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
                  FROM unnest(coalesce(_claim_ids, '{}'::uuid[])) AS x);
  _e uuid[] := (SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
                  FROM unnest(coalesce(_experience_ids, '{}'::uuid[])) AS x);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE='insufficient_privilege';
  END IF;

  -- Without a key there is no way to tell a retry from a second intention,
  -- and the whole no-duplicate-links property collapses. It is required.
  IF _request_key IS NULL THEN
    RAISE EXCEPTION 'SP_REQUEST_KEY_REQUIRED: every create must name the attempt '
      'it belongs to.' USING ERRCODE='check_violation';
  END IF;

  PERFORM public.sp_assert_share_inputs(_expires_days, _locale);

  _fp := public.sp_share_request_fingerprint(
    auth.uid(), _c, _e, _expires_days, _purpose, _recipient_hint, _locale, NULL);

  -- SERIALISE ON THE KEY, not on the table.
  --
  -- Two browser tabs, a double submit, or a client retrying an unanswered
  -- request all arrive as concurrent calls with one key. Without this, both
  -- pass the SELECT below, both INSERT, and the loser meets the unique index:
  -- a 23505 carrying the index name, which a client reads as a server fault
  -- rather than as the successful creation it actually is. The lock is
  -- transaction-scoped, so it is released whichever way this call ends.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('sp_share:' || auth.uid()::text || ':' || _request_key::text, 0));

  SELECT * INTO _existing FROM public.sp_disclosures
   WHERE holder_user_id = auth.uid() AND request_key = _request_key;

  IF FOUND THEN
    IF _existing.request_fingerprint IS DISTINCT FROM _fp THEN
      RAISE EXCEPTION 'SP_REQUEST_KEY_CONFLICT: this attempt already created a '
        'share with different contents.' USING ERRCODE='check_violation';
    END IF;
    RETURN jsonb_build_object(
      'status','already_created',
      'disclosure_id', _existing.id,
      'expires_at', _existing.expires_at,
      'created_at', _existing.created_at);
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

  IF NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles
                  WHERE holder_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'SP_NO_PASSPORT' USING ERRCODE='no_data_found';
  END IF;

  -- SECURITY DEFINER means RLS does not protect this function. These two
  -- counts ARE the ownership boundary, and they carry the sharing policy:
  -- lifecycle `active`, at any assertion level.
  IF (SELECT count(*) FROM public.sp_claims c
       WHERE c.id = ANY(_c) AND c.holder_user_id = auth.uid()
         AND c.lifecycle_state = 'active')
     <> cardinality(_c) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current merits can be '
      'shared.' USING ERRCODE='check_violation';
  END IF;

  IF (SELECT count(*) FROM public.sp_experience_periods e
       WHERE e.id = ANY(_e) AND e.holder_user_id = auth.uid()
         AND e.lifecycle_state = 'active')
     <> cardinality(_e) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current merits can be '
      'shared.' USING ERRCODE='check_violation';
  END IF;

  _expires := now() + (_expires_days || ' days')::interval;
  _token   := encode(gen_random_bytes(32), 'hex');

  BEGIN
    INSERT INTO public.sp_disclosures (
      holder_user_id, package_code, token_hash, purpose, recipient_hint,
      locale, expires_at, request_key, request_fingerprint)
    VALUES (auth.uid(), 'selected_merits', encode(digest(_token, 'sha256'), 'hex'),
            _purpose, _recipient_hint, _locale, _expires, _request_key, _fp)
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    -- Unreachable while the advisory lock holds, and handled anyway: a
    -- constraint name must never reach a client, and a caller that raced us
    -- is owed the answer the winner produced, not an error.
    SELECT * INTO _existing FROM public.sp_disclosures
     WHERE holder_user_id = auth.uid() AND request_key = _request_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SP_SHARE_NOT_CREATED' USING ERRCODE='check_violation';
    END IF;
    IF _existing.request_fingerprint IS DISTINCT FROM _fp THEN
      RAISE EXCEPTION 'SP_REQUEST_KEY_CONFLICT: this attempt already created a '
        'share with different contents.' USING ERRCODE='check_violation';
    END IF;
    RETURN jsonb_build_object(
      'status','already_created',
      'disclosure_id', _existing.id,
      'expires_at', _existing.expires_at,
      'created_at', _existing.created_at);
  END;

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
-- 10. The preview
-- ---------------------------------------------------------------------------
-- The SAME builder the live link goes through, called with the ids the holder
-- has ticked. It creates nothing, counts no access and mints no token, so a
-- holder may look as often as they like.
--
-- It validates ownership and the input contract exactly as creation does — a
-- preview that would render somebody else's credential is a read of somebody
-- else's credential, whatever it is called, and a preview accepting an expiry
-- the create refuses would show a holder a page they cannot have.
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
  _c uuid[] := (SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
                  FROM unnest(coalesce(_claim_ids, '{}'::uuid[])) AS x);
  _e uuid[] := (SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
                  FROM unnest(coalesce(_experience_ids, '{}'::uuid[])) AS x);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE='insufficient_privilege';
  END IF;

  PERFORM public.sp_assert_share_inputs(_expires_days, _locale);

  IF cardinality(_c) + cardinality(_e) > 200 THEN
    RAISE EXCEPTION 'SP_TOO_MANY_MERITS' USING ERRCODE='check_violation';
  END IF;

  IF (SELECT count(*) FROM public.sp_claims c
       WHERE c.id = ANY(_c) AND c.holder_user_id = auth.uid()
         AND c.lifecycle_state = 'active')
     <> cardinality(_c) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current merits can be '
      'shared.' USING ERRCODE='check_violation';
  END IF;

  IF (SELECT count(*) FROM public.sp_experience_periods e
       WHERE e.id = ANY(_e) AND e.holder_user_id = auth.uid()
         AND e.lifecycle_state = 'active')
     <> cardinality(_e) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current merits can be '
      'shared.' USING ERRCODE='check_violation';
  END IF;

  RETURN public.sp_selected_merits_payload(
    auth.uid(), _c, _e, _purpose, _locale,
    now() + (_expires_days || ' days')::interval,
    now());
END; $function$;

REVOKE ALL ON FUNCTION public.sp_preview_selected_disclosure(uuid[],uuid[],integer,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_preview_selected_disclosure(uuid[],uuid[],integer,text,text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. A new link over the same contents
-- ---------------------------------------------------------------------------
-- The holder's safe answer to "I lost the link".
--
-- The alternative — storing the token, or deriving it — would make every
-- share recoverable forever from a database backup, which is the exact
-- liability the hash exists to avoid. So a lost link is not recovered. It is
-- REPLACED: a fresh 32-byte token over the same items, the same language and
-- the same lifetime, and the holder says explicitly whether the previous link
-- should stop working.
--
-- Both answers are legitimate and neither is assumed. Revoking is right when
-- the old link may have gone astray; keeping it is right when a recipient is
-- already reading from it and the holder simply wants a second copy to send
-- to somebody else.
--
-- It REFUSES rather than quietly shipping less: if any merit in the source
-- share has since stopped being current, "the same contents" is no longer
-- available and the holder is told, rather than handed a link that carries
-- fewer merits than the one they asked to reproduce.
CREATE OR REPLACE FUNCTION public.sp_replace_selected_disclosure(
  _disclosure_id    uuid,
  _revoke_previous  boolean,
  _request_key      uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  _source public.sp_disclosures%ROWTYPE;
  _existing public.sp_disclosures%ROWTYPE;
  _token text; _id uuid; _fp text; _days integer; _expires timestamptz;
  _c uuid[]; _e uuid[];
  _revoke boolean := coalesce(_revoke_previous, true);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE='insufficient_privilege';
  END IF;
  IF _request_key IS NULL THEN
    RAISE EXCEPTION 'SP_REQUEST_KEY_REQUIRED: every create must name the attempt '
      'it belongs to.' USING ERRCODE='check_violation';
  END IF;

  -- The source and the revoke choice are the facts, so they are the
  -- fingerprint: replacing the same share while keeping the old link is a
  -- different intention from replacing it and revoking.
  _fp := public.sp_share_request_fingerprint(
    auth.uid(), NULL, NULL, NULL, CASE WHEN _revoke THEN 'revoke' ELSE 'keep' END,
    NULL, NULL, _disclosure_id);

  PERFORM pg_advisory_xact_lock(
    hashtextextended('sp_share:' || auth.uid()::text || ':' || _request_key::text, 0));

  SELECT * INTO _existing FROM public.sp_disclosures
   WHERE holder_user_id = auth.uid() AND request_key = _request_key;
  IF FOUND THEN
    IF _existing.request_fingerprint IS DISTINCT FROM _fp THEN
      RAISE EXCEPTION 'SP_REQUEST_KEY_CONFLICT: this attempt already created a '
        'share with different contents.' USING ERRCODE='check_violation';
    END IF;
    RETURN jsonb_build_object(
      'status','already_created',
      'disclosure_id', _existing.id,
      'expires_at', _existing.expires_at,
      'created_at', _existing.created_at);
  END IF;

  SELECT * INTO _source FROM public.sp_disclosures
   WHERE id = _disclosure_id AND holder_user_id = auth.uid();

  -- One refusal for "no such share" and "not yours", so this cannot be used
  -- to discover which disclosure ids exist.
  IF NOT FOUND OR _source.package_code <> 'selected_merits' THEN
    RAISE EXCEPTION 'SP_SHARE_NOT_REPLACEABLE: only your own current chosen-merit '
      'share can be reissued.' USING ERRCODE='check_violation';
  END IF;
  IF _source.revoked_at IS NOT NULL
     OR _source.expires_at IS NULL
     OR _source.expires_at < now() THEN
    RAISE EXCEPTION 'SP_SHARE_NOT_REPLACEABLE: only your own current chosen-merit '
      'share can be reissued.' USING ERRCODE='check_violation';
  END IF;

  -- The ORIGINAL lifetime, in days, re-validated through the same contract:
  -- a reissue must not become a way to mint a lifetime the create refuses.
  _days := round(extract(epoch FROM (_source.expires_at - _source.created_at)) / 86400.0);
  PERFORM public.sp_assert_share_inputs(_days, _source.locale);

  SELECT coalesce(array_agg(DISTINCT i.claim_id ORDER BY i.claim_id)
                    FILTER (WHERE i.claim_id IS NOT NULL), '{}'::uuid[]),
         coalesce(array_agg(DISTINCT i.experience_id ORDER BY i.experience_id)
                    FILTER (WHERE i.experience_id IS NOT NULL), '{}'::uuid[])
    INTO _c, _e
    FROM public.sp_disclosure_items i
   WHERE i.disclosure_id = _source.id;

  IF cardinality(_c) + cardinality(_e) = 0 THEN
    RAISE EXCEPTION 'SP_NOTHING_SELECTED: choose at least one current merit to share.'
      USING ERRCODE='check_violation';
  END IF;

  IF (SELECT count(*) FROM public.sp_claims c
       WHERE c.id = ANY(_c) AND c.holder_user_id = auth.uid()
         AND c.lifecycle_state = 'active') <> cardinality(_c)
     OR (SELECT count(*) FROM public.sp_experience_periods e
          WHERE e.id = ANY(_e) AND e.holder_user_id = auth.uid()
            AND e.lifecycle_state = 'active') <> cardinality(_e) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current merits can be '
      'shared.' USING ERRCODE='check_violation';
  END IF;

  _expires := now() + (_days || ' days')::interval;
  _token   := encode(gen_random_bytes(32), 'hex');

  BEGIN
    INSERT INTO public.sp_disclosures (
      holder_user_id, package_code, token_hash, purpose, recipient_hint,
      locale, expires_at, request_key, request_fingerprint)
    VALUES (auth.uid(), 'selected_merits', encode(digest(_token, 'sha256'), 'hex'),
            _source.purpose, _source.recipient_hint, _source.locale, _expires,
            _request_key, _fp)
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO _existing FROM public.sp_disclosures
     WHERE holder_user_id = auth.uid() AND request_key = _request_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SP_SHARE_NOT_CREATED' USING ERRCODE='check_violation';
    END IF;
    IF _existing.request_fingerprint IS DISTINCT FROM _fp THEN
      RAISE EXCEPTION 'SP_REQUEST_KEY_CONFLICT: this attempt already created a '
        'share with different contents.' USING ERRCODE='check_violation';
    END IF;
    RETURN jsonb_build_object(
      'status','already_created',
      'disclosure_id', _existing.id,
      'expires_at', _existing.expires_at,
      'created_at', _existing.created_at);
  END;

  INSERT INTO public.sp_disclosure_items (disclosure_id, claim_id)
  SELECT _id, x FROM unnest(_c) AS x;
  INSERT INTO public.sp_disclosure_items (disclosure_id, experience_id)
  SELECT _id, x FROM unnest(_e) AS x;

  IF _revoke THEN
    UPDATE public.sp_disclosures SET revoked_at = coalesce(revoked_at, now())
     WHERE id = _source.id AND holder_user_id = auth.uid();
  END IF;

  INSERT INTO public.sp_passport_events (
    holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), auth.uid(), 'privacy_changed', 'profile', _id,
          jsonb_build_object('action','selected_disclosure_reissued',
                             'claims', cardinality(_c),
                             'employments', cardinality(_e),
                             'previous_revoked', _revoke));

  RETURN jsonb_build_object(
    'status','created',
    'token', _token,
    'disclosure_id', _id,
    'expires_at', _expires,
    'previous_revoked', _revoke);
END; $function$;

REVOKE ALL ON FUNCTION public.sp_replace_selected_disclosure(uuid, boolean, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_replace_selected_disclosure(uuid, boolean, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 12. Postflight
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

  -- Every new function: SECURITY DEFINER or IMMUTABLE-pure, and all with a
  -- pinned search_path.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('sp_selected_merits_payload','sp_create_selected_disclosure',
                       'sp_preview_selected_disclosure','sp_replace_selected_disclosure',
                       'sp_share_request_fingerprint','sp_assert_share_inputs')
     AND p.proconfig IS NULL;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: a new function has no pinned search_path.';
  END IF;

  IF has_function_privilege('anon',
       'public.sp_create_selected_disclosure(uuid[],uuid[],integer,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.sp_preview_selected_disclosure(uuid[],uuid[],integer,text,text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.sp_replace_selected_disclosure(uuid, boolean, uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.sp_assert_share_inputs(integer, text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.sp_share_request_fingerprint(uuid,uuid[],uuid[],integer,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.sp_selected_merits_payload(uuid,uuid[],uuid[],text,text,timestamptz,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: anon can execute a new sharing function.';
  END IF;

  -- The builder and the fingerprint are internal: only the SECURITY DEFINER
  -- entry points reach them, so a holder cannot ask either one a question
  -- directly.
  IF has_function_privilege('authenticated',
       'public.sp_selected_merits_payload(uuid,uuid[],uuid[],text,text,timestamptz,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.sp_share_request_fingerprint(uuid,uuid[],uuid[],integer,text,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: authenticated can execute an internal function.';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.sp_create_selected_disclosure(uuid[],uuid[],integer,text,text,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.sp_preview_selected_disclosure(uuid[],uuid[],integer,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.sp_replace_selected_disclosure(uuid, boolean, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: a holder cannot create, preview or reissue.';
  END IF;

  -- The recipient boundary is unchanged: still service-role only.
  IF has_function_privilege('anon', 'public.sp_get_disclosure(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sp_get_disclosure(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: sp_get_disclosure is no longer service-role only.';
  END IF;

  -- The sixth package code is accepted.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.sp_disclosures'::regclass
       AND conname = 'sp_disclosures_package_code_check'
       AND pg_get_constraintdef(oid) LIKE '%selected_merits%') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: selected_merits is not an accepted package.';
  END IF;

  -- The idempotency record, without which a lost response mints a second link
  -- and a reused key silently replays the wrong share.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public'
                    AND indexname = 'sp_disclosures_request_key_uidx') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: the request-key index is missing.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='sp_disclosures'
                    AND column_name='request_fingerprint') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: request_fingerprint is missing.';
  END IF;

  -- The anonymous boundary strips database identifiers and stamps its own
  -- check time. Asserted against the function's text because there is no row
  -- to interrogate at migration time.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='sp_get_disclosure'
                    AND p.prosrc LIKE '%- ''id''%' AND p.prosrc LIKE '%checked_at%') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: the anonymous boundary no longer strips '
      'identifiers or no longer stamps a server check time.';
  END IF;

  -- The advisory lock is what turns two simultaneous same-key calls into one
  -- creation and one replay.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='sp_create_selected_disclosure'
                    AND p.prosrc LIKE '%pg_advisory_xact_lock%') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: the create is no longer serialised on its key.';
  END IF;
END $$;

COMMIT;
