-- cv_documents gains a CONTROLLED WRITE PATH. Phase 1 of 3, and additive.
--
-- ═════════════════════════════════════════════════════════════════════════
-- WHAT IS WRONG, AND WHY THIS MIGRATION DOES NOT FIX ALL OF IT
-- ═════════════════════════════════════════════════════════════════════════
--
-- 20261010090000 created cv_documents, stripped the Supabase default
-- privileges, and then granted them back:
--
--     GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_documents
--       TO authenticated;
--
-- with row-level security that checks OWNERSHIP and nothing else. Its own
-- header, and the header of src/lib/professional-identity/cv/
-- cv-store.functions.ts, both state the guarantee that made the feature
-- defensible:
--
--     "The bundle is rebuilt on the server from the caller's own RLS-scoped
--      reads on every write. A client-supplied bundle would let somebody put
--      text into the 'facts' this product then vouches for."
--
-- That is true of the TanStack server function and false of the database.
-- A signed-in holder needs no browser: the Supabase Data API is a documented
-- HTTP endpoint, their access token is in their own session, and
--
--     POST /rest/v1/cv_documents
--     { "owner_user_id": "<their own id>",
--       "source_bundle": { "identity": {"displayName":"..."},
--                          "employment":[{"employerName":"Securitas",
--                                         "roleTitle":"Regionchef",
--                                         "startedOn":"2011-01-01"}] } }
--
-- satisfies every policy on the table. RLS asks "is this row yours"; it is.
-- Nothing asks whether the employment ever happened. And
-- sp_submit_application_with_cv_source then copies that row into
-- job_applications.cv_document_snapshot, which the employer reads.
--
-- ═════════════════════════════════════════════════════════════════════════
-- THE RELEASE SHAPE, AND WHY IT IS THREE PHASES AND NOT TWO
-- ═════════════════════════════════════════════════════════════════════════
--
-- The obvious fix is to revoke INSERT/UPDATE/DELETE here and route every
-- write through controlled functions. An earlier draft of this file did
-- exactly that, and it was undeployable:
--
--   REVOKE FIRST   the published application still writes cv_documents
--                  through PostgREST. The moment this applied, saving a CV
--                  would fail on the live site, and would keep failing until
--                  the new application merged AND Lovable rebuilt from main.
--   PUBLISH FIRST  the new application calls cv_create / cv_save, which would
--                  not exist yet. Saving a CV fails in the other direction.
--
-- "Apply it immediately behind the merge" is not a contract. It is a hope
-- about a window whose length nobody controls, on the one table that holds a
-- person's employment history.
--
-- So the revoke is not here. This migration is ADDITIVE: it installs the
-- controlled write path beside the existing one and takes nothing away, so it
-- can be applied to production at any time with the currently published
-- application still running unchanged.
--
--   PHASE 1  this file. Ledger, controlled write functions, server-derived
--            bundles, employer-snapshot hardening, idempotency, concurrency
--            protection, and a submission boundary that already refuses
--            fabricated and stale facts. Legacy direct writes still work.
--   PHASE 2  the application (PR #199) stops writing the table and uses only
--            the controlled functions. It is correct against BOTH this state
--            and the locked-down one, so the order of merge and publish
--            inside phase 2 does not matter.
--   PHASE 3  20261103090000_cv_documents_lockdown.sql revokes the direct
--            write privileges. Applied only once the owner confirms phase 2
--            is merged, synced and published.
--
-- ═════════════════════════════════════════════════════════════════════════
-- WHAT PROTECTS AN EMPLOYER WHILE THE DOOR IS STILL OPEN
-- ═════════════════════════════════════════════════════════════════════════
--
-- A fabricated row can still be WRITTEN in phase 1. It cannot be SENT.
--
-- Section 8 rebuilds sp_submit_application_with_cv_source so that every fact
-- a CV carries is checked against the holder's own live records before the
-- copy is made -- not merely that an id exists, but that the employer name,
-- role title, dates, credential title, issuer and validity ON THE DOCUMENT
-- are the ones the Passport actually holds. Anything that does not match, or
-- no longer stands, refuses the submission with CV_DOCUMENT_STALE_FACTS.
--
-- So in phase 1 a holder can lie to themselves in their own drafts, and the
-- lie stops at the boundary where somebody else would read it. That is what
-- makes an additive phase safe to deploy alone; phase 3 then removes the
-- ability to write the lie at all.
--
-- ── WHY THE BUNDLE IS BUILT IN SQL, AND WHAT IS NOT DUPLICATED ──────────
--
-- Building it here duplicates something. The question is what, and the answer
-- decides whether this is safe.
--
-- DUPLICATED, deliberately and visibly: which claim_type belongs in which
-- section. Four short lists, stated in section 4 below and cross-referenced
-- to src/lib/professional-identity/types.ts, in the same way 20261018090000's
-- eligibility rule is cross-referenced to application-source.ts. A change to
-- either is a change somebody has to make twice, deliberately, rather than
-- once, silently.
--
-- NOT DUPLICATED, and this is the important half: the TRUST RULES. The bundle
-- this function builds carries no `verified` flag at all. It carries the
-- stored assertion_level for an employment because that is a column, and it
-- carries valid_until because that is a date -- but it makes no judgement
-- about whether anything IS verified. Nothing here calls a SQL translation of
-- isVerifiedClaim, effectiveAssertionLevel or validityOf, because there is
-- none and there must not be one.
--
-- That is not a compromise. The renderer stopped reading the frozen
-- `verified` boolean when a saved CV was found still printing "Verified"
-- after a revocation: the mark is now drawn from live trust annotations
-- derived through the Passport's own describeTrust/validityOf on every open.
-- A boolean nothing reads is a boolean that should not be stored, and one
-- copied into an employer's snapshot is worse than useless -- it is a stale
-- claim about somebody's standing with no date on it.
--
-- ═════════════════════════════════════════════════════════════════════════
-- THE OTHER THREE THINGS THIS FIXES
-- ═════════════════════════════════════════════════════════════════════════
--
-- HIDDEN CONTACT DETAILS REACHED EMPLOYERS. The stored presentation keeps an
-- email and a telephone number with a showEmail/showPhone switch beside each,
-- so somebody can turn a number off for one employer without retyping it for
-- the next. The submission function copied the presentation almost whole, so
-- the VALUE travelled with the switch and an employer could read the number
-- the candidate had chosen not to show. Hiding it in React and in the PDF hid
-- it from the page, not from the payload. Section 8 builds the employer's
-- copy through a sanitiser instead: a value whose switch is off has its KEY
-- REMOVED, not blanked.
--
-- A LOST RESPONSE CREATED A SECOND CV. The insert committed, the answer never
-- arrived, the retry inserted again. Section 3 adds a server-owned operations
-- ledger with no client grants: the same operation id and the same request
-- returns the original cvId, and the same id with a different request is
-- refused as CV_REQUEST_CONFLICT rather than quietly overwriting.
--
-- TWO WRITES WHERE THERE SHOULD BE ONE. Changing what a saved CV carries and
-- changing its wording were separate statements from separate round trips, so
-- a failure between them left a document half-saved. Section 7 is one
-- function and one UPDATE covering selection, bundle, title, locale, contact
-- and wording together, with an expected-revision check in front of it.
--
-- Reversible: supabase/rollback/20261102090000_cv_documents_controlled_writes_rollback.sql
-- Idempotent: safe to replay from an empty database or over itself.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. The write door stays OPEN in this phase
-- ═════════════════════════════════════════════════════════════════════════
--
-- Nothing is revoked here, and that is the point of phase 1: the currently
-- published application writes this table directly and must keep working
-- while this migration is live and before PR #199 is published.
--
-- The privileges are restated rather than assumed, because the
-- default-privilege trap this table was first written to escape re-arms on
-- every new object, and a grant that is already correct costs nothing to say
-- again. `anon` gets nothing at all.

REVOKE ALL ON public.cv_documents FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_documents TO authenticated;
GRANT ALL ON public.cv_documents TO service_role;

COMMENT ON TABLE public.cv_documents IS
  'PRIVATE, owner-only CV documents. Presentation over facts that live in '
  'security_career_profiles, sp_experience_periods, sp_claims and profiles '
  '-- never a second home for any of them. Since 20261102090000 there is a '
  'CONTROLLED WRITE PATH (cv_create / cv_save / cv_refresh_from_profile / '
  'cv_delete) that takes the owner from auth.uid() and derives every factual '
  'value from the caller''s own active Passport and profile rows. Direct '
  'INSERT/UPDATE/DELETE by `authenticated` REMAINS GRANTED in that migration '
  'so the published application keeps working; '
  '20261103090000_cv_documents_lockdown.sql revokes it once the application '
  'no longer needs it. Until then the guarantee that an employer never reads '
  'a fabricated CV is held by sp_submit_application_with_cv_source, which '
  'verifies every carried fact against the holder''s live records before it '
  'copies anything.';

-- ── WHY THESE FUNCTIONS ARE `cv_` AND NOT `sp_` ────────────────────────
--
-- `sp_` is the Security Passport domain, and 5.2 of
-- security_passport_phase2_test asserts that no `sp_*` function body reads an
-- `scp_*` or `cd_*` object. That is a real boundary and not a naming
-- convention: the Passport must not depend on Career Discovery or on the
-- Competency Platform.
--
-- A CV is a CONSUMER of several domains at once -- it reads Passport claims
-- and periods, the canonical career profile, the account, the profession
-- catalogue, and (when the person opts in) a Career Discovery snapshot. So it
-- is not a Passport function, and calling it one would either be a lie or a
-- reason to drop the insight. `cv_` says which domain owns these.
--
-- ═════════════════════════════════════════════════════════════════════════
-- 2. Refusal vocabulary
-- ═════════════════════════════════════════════════════════════════════════
--
-- Every code below is stable, is safe to show a person, and says nothing
-- about anybody else's data. In particular CV_NOT_FOUND is the answer to BOTH
-- "there is no such row" and "that row is not yours", because a caller who
-- can tell those apart has an existence oracle over other people's CVs.
--
--   CV_NOT_AUTHENTICATED   no session
--   CV_NOT_FOUND          no such CV, or not the caller's
--   CV_CHANGED            somebody (usually another tab) wrote first
--   CV_REQUEST_CONFLICT   this operation id was already used for a different
--                         request
--   CV_NOT_READY          the resulting document has no name or no
--                         professional history to read
--   CV_LIMIT_REACHED      the per-person cap
--   CV_CONTACT_INVALID    an email or telephone number that is switched ON
--                         and is not usable
--   CV_DOCUMENT_STALE_FACTS  a selected fact is no longer current, so the
--                         document must not be sent until the holder decides

-- ═════════════════════════════════════════════════════════════════════════
-- 3. The operations ledger
-- ═════════════════════════════════════════════════════════════════════════
--
-- ── WHY NOT JUST LET THE CLIENT CHOOSE THE PRIMARY KEY ─────────────────
--
-- Because the contract that has to hold is not "insert at most once". It is:
--
--   same id + same request        -> the original cvId, no second row
--   same id + different request   -> refused, and nothing is overwritten
--   another holder, same id       -> their own operation, never a window
--                                    into somebody else's
--
-- A client-chosen primary key on cv_documents gives the first and neither of
-- the others: a second request under the same id is an ordinary UPDATE, and
-- the row it lands on is whatever is there. So the ledger is its own table,
-- it stores a fingerprint of the request, and it is keyed by
-- (owner_user_id, operation_id) -- which is what makes another holder reusing
-- an id a separate operation of their own rather than a collision.
--
-- ── AND WHY NO ROLE MAY TOUCH IT ───────────────────────────────────────
--
-- It is not data about the person; it is bookkeeping about a call. Granting
-- SELECT would let one holder probe which operation ids exist. Granting
-- INSERT would let a client pre-claim an id. Only the SECURITY DEFINER
-- functions below reach it, and they run as the table owner.

CREATE TABLE IF NOT EXISTS public.cv_document_operations (
  owner_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id   uuid NOT NULL,
  cv_document_id uuid NOT NULL REFERENCES public.cv_documents(id) ON DELETE CASCADE,
  -- A hash of the request that first used this id. Compared, never shown.
  -- jsonb renders canonically (sorted keys, normalised whitespace), so the
  -- same request hashes identically across retries and across clients.
  request_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, operation_id)
);

COMMENT ON TABLE public.cv_document_operations IS
  'Server-owned idempotency ledger for CV creation. No role but service_role '
  'holds any privilege on it and there is no policy: it is reached only from '
  'the SECURITY DEFINER entry points. Keyed by (owner, operation id) so one '
  'holder reusing another''s operation id is their own operation and never a '
  'route to somebody else''s document.';

REVOKE ALL ON public.cv_document_operations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cv_document_operations TO service_role;

-- Enabled with no policies at all: `authenticated` has no privilege to reach
-- it with in the first place, and if a future migration grants one by
-- accident, RLS with no permissive policy denies rather than allows.
ALTER TABLE public.cv_document_operations ENABLE ROW LEVEL SECURITY;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Building the bundle from the caller's own records
-- ═════════════════════════════════════════════════════════════════════════
--
-- ── THE CLAIM SECTIONS ─────────────────────────────────────────────────
--
-- Mirrors EDUCATION_CLAIM_TYPES / CREDENTIAL_CLAIM_TYPES / SKILL_CLAIM_TYPES
-- / LANGUAGE_CLAIM_TYPES in src/lib/professional-identity/types.ts. Stated in
-- two places on purpose and cross-referenced in both directions, the same way
-- 20261018090000 states the application eligibility rule that
-- application-source.ts also states. Adding a claim type means editing both.
--
-- ── THE ALLOWLIST IS AN INTERSECTION, NEVER A LOOKUP ───────────────────
--
-- `_included_ids` is what the person asked for. What they GET is that array
-- intersected with rows they own and that are currently active. An id that is
-- unknown, corrupt, stale, or belongs to somebody else contributes nothing --
-- there is no branch in which an id ADDS information, which is what makes the
-- selection fail closed rather than fail open.

CREATE OR REPLACE FUNCTION public.cv_source_bundle(
  _included_ids            uuid[],
  _locale                  text,
  _include_career_insight  boolean,
  _target_job_text         text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _uid         uuid   := auth.uid();
  _ids         uuid[] := coalesce(_included_ids, ARRAY[]::uuid[]);
  _lang        text   := CASE WHEN _locale = 'en' THEN 'en' ELSE 'sv' END;
  _display     text;
  _account_cc  text;
  _slug        text;
  _other       text;
  _years       text;
  _headline    text;
  _work_cc     text;
  _work_sub    text;
  _profession  text;
  _employment  jsonb;
  _education   jsonb;
  _credentials jsonb;
  _skills      jsonb;
  _languages   jsonb;
  _insight     jsonb := NULL;
  _target      text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'CV_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT coalesce(p.display_name, ''), p.country
    INTO _display, _account_cc
    FROM public.profiles p WHERE p.id = _uid;

  SELECT c.current_profession_slug, c.current_profession_other, c.years_of_experience
    INTO _slug, _other, _years
    FROM public.security_career_profiles c WHERE c.user_id = _uid;

  SELECT pp.headline, pp.jurisdiction_code, pp.sub_jurisdiction_code
    INTO _headline, _work_cc, _work_sub
    FROM public.sp_passport_profiles pp WHERE pp.holder_user_id = _uid;

  -- The published catalogue title, never the slug. `vaktare` printed as
  -- somebody's professional identity is the product failing to know what it
  -- already stores; professionLabel() states the same rule for the surfaces.
  SELECT coalesce(
           (SELECT CASE WHEN _lang = 'en' THEN pr.title_en ELSE pr.title_sv END
              FROM public.cig_professions pr
             WHERE pr.slug = _slug
               AND pr.content_status = 'published'),
           nullif(btrim(coalesce(_other, '')), ''))
    INTO _profession;

  SELECT coalesce(jsonb_agg(obj ORDER BY started_on DESC, sort_id), '[]'::jsonb)
    INTO _employment
    FROM (
      SELECT ep.started_on, ep.id AS sort_id,
             jsonb_build_object(
               'id',             ep.id,
               'employerName',   ep.employer_name,
               'roleTitle',      ep.role_title,
               'startedOn',      ep.started_on,
               'endedOn',        ep.ended_on,
               'employmentType', ep.employment_type,
               'assertionLevel', ep.assertion_level) AS obj
        FROM public.sp_experience_periods ep
       WHERE ep.holder_user_id  = _uid
         AND ep.lifecycle_state = 'active'
         AND ep.id = ANY(_ids)
    ) s;

  -- One pass, four sections. `verified` is deliberately absent -- see the
  -- header: this function makes no trust judgement and stores no stale copy
  -- of one.
  SELECT
    coalesce(jsonb_agg(obj ORDER BY sort_key) FILTER (WHERE section = 'education'),   '[]'::jsonb),
    coalesce(jsonb_agg(obj ORDER BY sort_key) FILTER (WHERE section = 'credentials'), '[]'::jsonb),
    coalesce(jsonb_agg(obj ORDER BY sort_key) FILTER (WHERE section = 'skills'),      '[]'::jsonb),
    coalesce(jsonb_agg(obj ORDER BY sort_key) FILTER (WHERE section = 'languages'),   '[]'::jsonb)
    INTO _education, _credentials, _skills, _languages
    FROM (
      SELECT
        CASE
          WHEN cl.claim_type = 'education' THEN 'education'
          WHEN cl.claim_type IN ('certification', 'licence', 'training', 'professional_membership')
            THEN 'credentials'
          WHEN cl.claim_type IN ('practical_skill', 'specialisation') THEN 'skills'
          WHEN cl.claim_type = 'language' THEN 'languages'
        END AS section,
        -- Stable within a section without inventing an order the product does
        -- not have: the presentation decides emphasis, this decides ties.
        (coalesce(cl.issued_on::text, '') || cl.id::text) AS sort_key,
        jsonb_build_object(
          'id',         cl.id,
          'claimType',  cl.claim_type,
          'title',      cl.title,
          'issuerName', cl.claimed_issuer_name,
          'issuedOn',   cl.issued_on,
          'validUntil', cl.valid_until,
          'level',      cl.skill_level) AS obj
        FROM public.sp_claims cl
       WHERE cl.holder_user_id  = _uid
         AND cl.lifecycle_state = 'active'
         AND cl.id = ANY(_ids)
    ) s
   WHERE section IS NOT NULL;

  IF coalesce(_include_career_insight, false) THEN
    SELECT jsonb_build_object(
             'snapshotId',  sn.id,
             'generatedAt', coalesce(sn.generated_at::text, ''))
      INTO _insight
      FROM public.cd_report_snapshots sn
      JOIN public.cd_sessions se ON se.id = sn.session_id
     WHERE se.user_id = _uid
     ORDER BY sn.generated_at DESC
     LIMIT 1;
  END IF;

  _target := nullif(btrim(coalesce(_target_job_text, '')), '');

  RETURN jsonb_build_object(
    'bundleVersion', 'cv-source-bundle-v1',
    'locale',        _lang,
    'identity', jsonb_build_object(
      'displayName',        _display,
      'headline',           _headline,
      'country',            coalesce(_work_cc, _account_cc),
      -- Only when the country IS the Passport work country. A sub-jurisdiction
      -- is a statement about where somebody works; pairing it with an account
      -- country it does not belong to would invent a work location.
      'countrySubdivision', CASE WHEN _work_cc IS NOT NULL THEN _work_sub END,
      'currentProfession',  _profession,
      'yearsOfExperience',  _years),
    'employment',    _employment,
    'education',     _education,
    'credentials',   _credentials,
    'skills',        _skills,
    'languages',     _languages,
    'careerInsight', _insight,
    'targetJobText', _target);
END; $$;

COMMENT ON FUNCTION public.cv_source_bundle(uuid[], text, boolean, text) IS
  'Builds a CV source bundle from the CALLER''S OWN active Passport and '
  'profile rows. The id array is an allowlist that is INTERSECTED with what '
  'the caller has, so an unknown or stale id can never add information. '
  'Carries no verification judgement of any kind: the renderer derives trust '
  'live through the Passport''s own describeTrust/validityOf, and a frozen '
  '"verified" boolean is a stale claim about a person''s standing.';

-- Internal. Every caller is a SECURITY DEFINER entry point below, which runs
-- as this function's owner; nothing a client can reach executes it.
REVOKE ALL ON FUNCTION public.cv_source_bundle(uuid[], text, boolean, text)
  FROM PUBLIC, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 5. Readiness, contact and presentation — the three things a client sends
-- ═════════════════════════════════════════════════════════════════════════

-- The same rule readiness.ts and application-source.ts state, applied to the
-- bundle AFTER the allowlist has been intersected. A manipulated request that
-- selects nothing, or selects only languages, produces a document with no
-- professional history to read, and this is where that is refused.
CREATE OR REPLACE FUNCTION public.cv_bundle_is_ready(_bundle jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(btrim(_bundle #>> '{identity,displayName}'), '') <> ''
     AND (jsonb_array_length(coalesce(_bundle -> 'employment', '[]'::jsonb)) > 0
       OR jsonb_array_length(coalesce(_bundle -> 'education',  '[]'::jsonb)) > 0);
$$;

REVOKE ALL ON FUNCTION public.cv_bundle_is_ready(jsonb) FROM PUBLIC, anon, authenticated;

-- ── CONTACT ────────────────────────────────────────────────────────────
--
-- Validated only where it is SWITCHED ON. A stored-but-hidden value is not
-- shown to anybody and not sent anywhere (section 8 removes it from the
-- employer's copy), so refusing to save a half-typed number somebody has not
-- chosen to publish would be the product arguing with a draft.
--
-- Normalisation is conservative on purpose. An address is lower-cased and
-- trimmed; a telephone number keeps the characters people actually write one
-- with and loses the rest. Neither is reformatted into a shape the person did
-- not choose -- this is a contact line on their own document, not a field in
-- a directory.
CREATE OR REPLACE FUNCTION public.cv_normalise_contact(_contact jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _c     jsonb   := coalesce(_contact, '{}'::jsonb);
  _email text    := lower(btrim(coalesce(_c ->> 'email', '')));
  _phone text    := btrim(regexp_replace(coalesce(_c ->> 'phone', ''), '\s+', ' ', 'g'));
  _se    boolean := coalesce((_c ->> 'showEmail')::boolean, false);
  _sp    boolean := coalesce((_c ->> 'showPhone')::boolean, false);
BEGIN
  IF length(_email) > 320 OR length(_phone) > 40 THEN
    RAISE EXCEPTION 'CV_CONTACT_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  IF _se AND _email !~ '^[^@[:space:]]+@[^@[:space:].]+(\.[^@[:space:].]+)+$' THEN
    RAISE EXCEPTION 'CV_CONTACT_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  IF _sp AND (_phone = '' OR _phone !~ '^[+0-9][0-9 ()/.-]{4,39}$') THEN
    RAISE EXCEPTION 'CV_CONTACT_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'email', _email, 'phone', _phone, 'showEmail', _se, 'showPhone', _sp);
END; $$;

REVOKE ALL ON FUNCTION public.cv_normalise_contact(jsonb) FROM PUBLIC, anon, authenticated;

-- ── PRESENTATION ───────────────────────────────────────────────────────
--
-- THE SECOND HALF OF THE FABRICATION BOUNDARY.
--
-- Closing direct INSERT stops a client writing a source_bundle. It does not,
-- on its own, stop a client writing an employer name into the PRESENTATION
-- and hoping something renders it -- and the presentation is the one jsonb a
-- person legitimately authors. So it is rebuilt here, key by key, from a
-- fixed shape. Anything not named below is dropped, not stored: there is no
-- passthrough, so a field nobody has thought about cannot arrive.
--
-- Every id it carries is checked against the bundle it will be stored beside.
-- A sourceId the bundle does not contain is dropped rather than kept, which
-- is the same rule validateCvPresentation applies to a model's output, on the
-- same grounds: an id we did not supply is a citation of something that is
-- not in this person's record.
CREATE OR REPLACE FUNCTION public.cv_normalise_presentation(
  _presentation jsonb,
  _bundle       jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _p          jsonb := coalesce(_presentation, '{}'::jsonb);
  _emp_ids    text[];
  _claim_ids  text[];
  _experience jsonb;
  _emphasis   jsonb;
  _authorship jsonb;
BEGIN
  SELECT array_agg(e ->> 'id')
    INTO _emp_ids
    FROM jsonb_array_elements(coalesce(_bundle -> 'employment', '[]'::jsonb)) e;
  _emp_ids := coalesce(_emp_ids, ARRAY[]::text[]);

  SELECT array_agg(c ->> 'id')
    INTO _claim_ids
    FROM jsonb_array_elements(
           coalesce(_bundle -> 'education',   '[]'::jsonb)
        || coalesce(_bundle -> 'credentials', '[]'::jsonb)
        || coalesce(_bundle -> 'skills',      '[]'::jsonb)
        || coalesce(_bundle -> 'languages',   '[]'::jsonb)) c;
  _claim_ids := coalesce(_claim_ids, ARRAY[]::text[]);

  -- Bullets are bounded here and not only in the client: eight lines of six
  -- hundred characters is a generous CV entry and an unbounded jsonb array is
  -- a way to put a megabyte into a row nobody reads. Non-text elements are
  -- dropped rather than stringified -- a bullet is a sentence.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'sourceId', x.sourceId,
           'bullets',  x.bullets)), '[]'::jsonb)
    INTO _experience
    FROM (
      SELECT e ->> 'sourceId' AS sourceId,
             coalesce((
               SELECT jsonb_agg(left(b, 600) ORDER BY ord)
                 FROM jsonb_array_elements(coalesce(e -> 'bullets', '[]'::jsonb))
                      WITH ORDINALITY AS t(val, ord)
                CROSS JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(t.val) = 'string'
                                                THEN t.val #>> '{}' END AS b) v
                WHERE v.b IS NOT NULL AND btrim(v.b) <> '' AND t.ord <= 8
             ), '[]'::jsonb) AS bullets
        FROM jsonb_array_elements(coalesce(_p -> 'experience', '[]'::jsonb)) e
       WHERE (e ->> 'sourceId') = ANY(_emp_ids)
    ) x;

  SELECT coalesce(jsonb_agg(v), '[]'::jsonb)
    INTO _emphasis
    FROM jsonb_array_elements_text(coalesce(_p -> 'emphasisedClaimIds', '[]'::jsonb)) v
   WHERE v = ANY(_claim_ids);

  -- Authorship is rebuilt to two values, never copied. "ai" is a claim the
  -- product makes about its own output; anything else a client sends means
  -- the person wrote it, which is also the safe default -- labelling
  -- somebody's own sentence as machine-written is the one small dishonesty
  -- this screen cannot afford.
  _authorship := jsonb_build_object(
    'headline', CASE WHEN (_p #>> '{authorship,headline}') = 'ai' THEN 'ai' ELSE 'person' END,
    'summary',  CASE WHEN (_p #>> '{authorship,summary}')  = 'ai' THEN 'ai' ELSE 'person' END,
    'bullets',  coalesce(
      (SELECT jsonb_object_agg(t.key, 'ai')
         FROM jsonb_each_text(coalesce(_p #> '{authorship,bullets}', '{}'::jsonb)) t
        WHERE t.value = 'ai' AND t.key = ANY(_emp_ids)),
      '{}'::jsonb));

  RETURN jsonb_build_object(
    'storedVersion',      'cv-stored-presentation-v1',
    'headline',           left(coalesce(_p ->> 'headline', ''), 160),
    'summary',            left(coalesce(_p ->> 'summary', ''), 4000),
    'experience',         _experience,
    'emphasisedClaimIds', _emphasis,
    'tailoringRationale', left(coalesce(_p ->> 'tailoringRationale', ''), 600),
    'authorship',         _authorship);
END; $$;

REVOKE ALL ON FUNCTION public.cv_normalise_presentation(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

-- The operation ledger references a CV that is written in the same
-- transaction, and the claim has to happen FIRST -- see cv_create. A
-- deferred constraint is what lets the order be "claim, then write" instead
-- of "write, then claim, then delete what we wrote if we lost the race".
ALTER TABLE public.cv_document_operations
  DROP CONSTRAINT IF EXISTS cv_document_operations_cv_document_id_fkey;
ALTER TABLE public.cv_document_operations
  ADD CONSTRAINT cv_document_operations_cv_document_id_fkey
    FOREIGN KEY (cv_document_id) REFERENCES public.cv_documents(id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- ═════════════════════════════════════════════════════════════════════════
-- 6. Merging a saved bundle with a freshly derived one
-- ═════════════════════════════════════════════════════════════════════════
--
-- ── WHY "REFRESH" AND "RE-SELECT" ARE DIFFERENT VERBS ──────────────────
--
-- A saved CV is a snapshot. Somebody who exported it in March and reopens it
-- in June must see what they sent, not a document quietly rewritten by an
-- edit they made in between -- so a correction to an employer name reaches
-- the CV only when they ask for it.
--
-- "Put my old job back on this CV" is not that request. Rebuilding the whole
-- bundle to honour it would apply every unrelated change made since, under a
-- click that asked for something much smaller.
--
-- So membership comes from the ALLOWLIST (the fresh bundle, which was built
-- from the intersection) and values come from wherever the caller said:
--
--   _refresh = false   a fact already carried keeps its frozen values; a
--                      newly selected one arrives with current ones, because
--                      the snapshot has never held it and there is nothing to
--                      freeze.
--   _refresh = true    every carried fact takes its current values. This is
--                      "update from profile", and it is always explicit.
--
-- Identity, locale, career insight and target text always come from the fresh
-- build: they are not per-fact history and there is no id to freeze them
-- against.

CREATE OR REPLACE FUNCTION public.cv_merge_bundle(
  _saved   jsonb,
  _fresh   jsonb,
  _refresh boolean)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _out     jsonb := _fresh;
  _section text;
  _merged  jsonb;
BEGIN
  IF coalesce(_refresh, false) OR _saved IS NULL THEN
    RETURN _fresh;
  END IF;

  FOREACH _section IN ARRAY ARRAY['employment', 'education', 'credentials', 'skills', 'languages']
  LOOP
    SELECT coalesce(jsonb_agg(
             coalesce(
               (SELECT sv
                  FROM jsonb_array_elements(coalesce(_saved -> _section, '[]'::jsonb)) sv
                 WHERE sv ->> 'id' = f ->> 'id'
                 LIMIT 1),
               f)
             ORDER BY ord), '[]'::jsonb)
      INTO _merged
      FROM jsonb_array_elements(coalesce(_fresh -> _section, '[]'::jsonb))
           WITH ORDINALITY AS t(f, ord);
    _out := jsonb_set(_out, ARRAY[_section], _merged);
  END LOOP;

  RETURN _out;
END; $$;

REVOKE ALL ON FUNCTION public.cv_merge_bundle(jsonb, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;

-- Every fact id a bundle carries, for the allowlist default and for the
-- lifecycle re-check at submission.
CREATE OR REPLACE FUNCTION public.cv_bundle_ids(_bundle jsonb)
RETURNS uuid[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(array_agg((x ->> 'id')::uuid), ARRAY[]::uuid[])
    FROM jsonb_array_elements(
           coalesce(_bundle -> 'employment',  '[]'::jsonb)
        || coalesce(_bundle -> 'education',   '[]'::jsonb)
        || coalesce(_bundle -> 'credentials', '[]'::jsonb)
        || coalesce(_bundle -> 'skills',      '[]'::jsonb)
        || coalesce(_bundle -> 'languages',   '[]'::jsonb)) x
   WHERE (x ->> 'id') ~ '^[0-9a-fA-F-]{36}$';
$$;

REVOKE ALL ON FUNCTION public.cv_bundle_ids(jsonb) FROM PUBLIC, anon, authenticated;

/**
 * How many facts on this document do NOT match the holder's live records.
 *
 * ── WHY EXISTENCE IS NOT ENOUGH ────────────────────────────────────────
 *
 * An earlier draft checked that every carried id resolved to an active row
 * the caller owns. That catches a withdrawn credential and an invented
 * identifier, and it does not catch the easy attack: take the REAL id of
 * your own employment and change the employer name to Säkerhetspolisen. The
 * id resolves, the check passes, and the employer reads a job that never
 * happened at a company the candidate has never worked for.
 *
 * So this compares the VALUES the document actually renders. A fact that
 * does not match one of the caller's own active rows, field for field, is
 * counted -- whether it was fabricated, edited underneath, superseded, or
 * simply frozen before a correction the person has since made.
 *
 * ── WHAT IS DELIBERATELY NOT COMPARED ──────────────────────────────────
 *
 * `employment_type` and `assertion_level`. Neither is rendered on the
 * document, both exist on older bundles in shapes this build did not write,
 * and comparing a field nobody reads would turn a harmless historical
 * difference into a refusal to apply for a job. Trust is not compared at all
 * and could not be: nothing here stores a verification judgement.
 *
 * ── AND WHY IT REFUSES RATHER THAN REWRITES ────────────────────────────
 *
 * Re-deriving the values at submission would silently apply every profile
 * change made since the CV was saved, under a click that said "apply". A
 * saved CV is a snapshot the person reviewed; the honest answer to "it no
 * longer matches" is to say so and let them update it, which the drift
 * banner already offers.
 */
CREATE OR REPLACE FUNCTION public.cv_facts_unverified(_bundle jsonb)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _bad integer := 0;
  _n   integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'CV_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO _bad
    FROM jsonb_array_elements(coalesce(_bundle -> 'employment', '[]'::jsonb)) e
   WHERE NOT EXISTS (
     SELECT 1 FROM public.sp_experience_periods ep
      WHERE ep.holder_user_id  = _uid
        AND ep.lifecycle_state = 'active'
        -- `::text` on both sides: a bundle id that is not a uuid simply fails
        -- to match, rather than raising a cast error the caller could use to
        -- tell one refusal from another.
        AND ep.id::text        = (e ->> 'id')
        AND ep.employer_name   = (e ->> 'employerName')
        AND ep.role_title      = (e ->> 'roleTitle')
        AND ep.started_on::text = (e ->> 'startedOn')
        AND ep.ended_on::text IS NOT DISTINCT FROM (e ->> 'endedOn'));

  SELECT count(*) INTO _n
    FROM jsonb_array_elements(
           coalesce(_bundle -> 'education',   '[]'::jsonb)
        || coalesce(_bundle -> 'credentials', '[]'::jsonb)
        || coalesce(_bundle -> 'skills',      '[]'::jsonb)
        || coalesce(_bundle -> 'languages',   '[]'::jsonb)) c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.sp_claims cl
      WHERE cl.holder_user_id  = _uid
        AND cl.lifecycle_state = 'active'
        AND cl.id::text        = (c ->> 'id')
        AND cl.title           = (c ->> 'title')
        AND cl.claimed_issuer_name IS NOT DISTINCT FROM (c ->> 'issuerName')
        AND cl.issued_on::text     IS NOT DISTINCT FROM (c ->> 'issuedOn')
        AND cl.valid_until::text   IS NOT DISTINCT FROM (c ->> 'validUntil')
        AND cl.skill_level         IS NOT DISTINCT FROM (c ->> 'level'));

  RETURN _bad + _n;
END; $$;

COMMENT ON FUNCTION public.cv_facts_unverified(jsonb) IS
  'Counts the facts on a saved CV that do not match one of the caller''s own '
  'active Passport rows, field for field, on the values the document renders. '
  'The submission boundary refuses when this is non-zero -- which is what '
  'stops a fabricated or edited-underneath bundle reaching an employer while '
  'direct writes to cv_documents are still granted (phase 1).';

REVOKE ALL ON FUNCTION public.cv_facts_unverified(jsonb) FROM PUBLIC, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 7. The write door — four verbs, one owner, taken from auth.uid()
-- ═════════════════════════════════════════════════════════════════════════

-- ── CREATE ─────────────────────────────────────────────────────────────
--
-- Idempotent by operation id. The three outcomes are the whole contract:
--
--   first call                     a CV, and a ledger entry recording the
--                                  request that made it
--   retry, same request            the SAME cvId, no second row, replayed=true
--   same id, different request     CV_REQUEST_CONFLICT, nothing written
--
-- The fingerprint is taken over the DERIVED bundle and the NORMALISED
-- presentation rather than over the raw parameters, so "the same request"
-- means "the same document" -- two calls whose ids resolve to the same facts
-- are the same request even if the client sent them in a different order,
-- and a call made after the person edited their Passport is honestly a
-- different one.

CREATE OR REPLACE FUNCTION public.cv_create(
  _operation_id           uuid,
  _title                  text,
  _locale                 text,
  _purpose                text,
  _target_job_text        text,
  _include_career_insight boolean,
  _included_ids           uuid[],
  _contact                jsonb,
  _presentation           jsonb,
  _provider_mode          text DEFAULT NULL,
  _model_id               text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _uid        uuid := auth.uid();
  _new_id     uuid := gen_random_uuid();
  _bundle     jsonb;
  _pres       jsonb;
  _contact_n  jsonb;
  _origin     text;
  _fp         text;
  _claimed    integer;
  _existing   public.cv_document_operations%ROWTYPE;
  _updated_at timestamptz;
  _count      integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'CV_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'CV_REQUEST_CONFLICT' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(_purpose, 'general') NOT IN ('general', 'targeted') THEN
    RAISE EXCEPTION 'CV_REQUEST_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  _contact_n := public.cv_normalise_contact(_contact);

  _bundle := public.cv_source_bundle(
    _included_ids,
    _locale,
    coalesce(_include_career_insight, false),
    -- A general CV never carries the advert, even if one was sent. Purpose is
    -- the person's stated intent and it decides what is used.
    CASE WHEN coalesce(_purpose, 'general') = 'targeted' THEN _target_job_text END);

  IF NOT public.cv_bundle_is_ready(_bundle) THEN
    RAISE EXCEPTION 'CV_NOT_READY' USING ERRCODE = 'check_violation';
  END IF;

  _pres := public.cv_normalise_presentation(_presentation, _bundle)
        || jsonb_build_object('contact', _contact_n);

  _origin := CASE
    WHEN (_pres #>> '{authorship,headline}') = 'ai'
      OR (_pres #>> '{authorship,summary}')  = 'ai'
      OR jsonb_path_exists(_pres, '$.authorship.bullets.* ? (@ == "ai")')
    THEN 'ai_assisted' ELSE 'factual' END;

  _fp := encode(sha256(convert_to(jsonb_build_object(
           'bundle',       _bundle,
           'presentation', _pres,
           'title',        left(btrim(coalesce(_title, '')), 200),
           'locale',       CASE WHEN _locale = 'en' THEN 'en' ELSE 'sv' END,
           'purpose',      coalesce(_purpose, 'general'),
           'origin',       _origin,
           'providerMode', _provider_mode,
           'modelId',      _model_id)::text, 'utf8')), 'hex');

  -- ── THE CLAIM ────────────────────────────────────────────────────────
  --
  -- Two concurrent callers with the same id both reach this statement. One
  -- inserts; the other blocks on the conflicting tuple, and when the winner
  -- commits, DO NOTHING returns no row. It then reads the committed ledger
  -- entry below and returns the winner's cvId, so exactly one CV exists and
  -- both callers are told the same thing. If the winner ABORTS instead, the
  -- dead tuple stops conflicting and the second caller simply wins.
  INSERT INTO public.cv_document_operations
    (owner_user_id, operation_id, cv_document_id, request_fingerprint)
  VALUES (_uid, _operation_id, _new_id, _fp)
  ON CONFLICT (owner_user_id, operation_id) DO NOTHING;
  GET DIAGNOSTICS _claimed = ROW_COUNT;

  IF _claimed = 0 THEN
    SELECT * INTO _existing
      FROM public.cv_document_operations
     WHERE owner_user_id = _uid AND operation_id = _operation_id;

    IF _existing.request_fingerprint IS DISTINCT FROM _fp THEN
      -- Never an overwrite. The person asked for a different document under
      -- an id that already means something; only they can say which they
      -- meant, and guessing would destroy one of them.
      RAISE EXCEPTION 'CV_REQUEST_CONFLICT' USING ERRCODE = 'unique_violation';
    END IF;

    SELECT updated_at INTO _updated_at
      FROM public.cv_documents WHERE id = _existing.cv_document_id;

    RETURN jsonb_build_object(
      'cv_id', _existing.cv_document_id, 'updated_at', _updated_at, 'replayed', true);
  END IF;

  -- MVP cap, and a product decision rather than a technical one: a person
  -- keeps a handful of tailored CVs, not a document library.
  SELECT count(*) INTO _count FROM public.cv_documents WHERE owner_user_id = _uid;
  IF _count >= 25 THEN
    RAISE EXCEPTION 'CV_LIMIT_REACHED' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.cv_documents (
    id, owner_user_id, title, locale, purpose, origin,
    source_bundle, presentation, provider_mode, model_id)
  VALUES (
    _new_id, _uid,
    coalesce(nullif(btrim(coalesce(_title, '')), ''),
             CASE WHEN coalesce(_purpose, 'general') = 'targeted'
                  THEN 'Anpassat CV' ELSE 'Allmänt CV' END),
    CASE WHEN _locale = 'en' THEN 'en' ELSE 'sv' END,
    coalesce(_purpose, 'general'), _origin,
    _bundle, _pres, _provider_mode, _model_id)
  RETURNING updated_at INTO _updated_at;

  RETURN jsonb_build_object('cv_id', _new_id, 'updated_at', _updated_at, 'replayed', false);
END; $$;

COMMENT ON FUNCTION public.cv_create(uuid, text, text, text, text, boolean, uuid[], jsonb, jsonb, text, text) IS
  'Creates one CV, idempotently by operation id. The owner is auth.uid() and '
  'is not a parameter; every factual value is derived from the caller''s own '
  'active Passport and profile rows through cv_source_bundle, so no '
  'employer name, role title or date can arrive from a client. A retry with '
  'the same id and the same resulting document returns the original cvId; the '
  'same id with a different document raises CV_REQUEST_CONFLICT and writes '
  'nothing.';

REVOKE ALL     ON FUNCTION public.cv_create(uuid, text, text, text, text, boolean, uuid[], jsonb, jsonb, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cv_create(uuid, text, text, text, text, boolean, uuid[], jsonb, jsonb, text, text) TO authenticated;

-- ── SAVE ───────────────────────────────────────────────────────────────
--
-- ONE function and ONE update for everything a person can change about a
-- saved CV: what it carries, what it is called, what language it is written
-- in, which contact details it shows, and every word they wrote.
--
-- It was two round trips -- a selection write and a wording write -- and a
-- failure between them left a document half-saved, with the facts changed and
-- the sentences about them not. Everything below is built and validated
-- before a single row is touched, so a refusal at any point leaves the row
-- exactly as it was.
--
-- ── THE REVISION CHECK ─────────────────────────────────────────────────
--
-- `_expected_updated_at` is the revision the caller was looking at. A second
-- tab that has been open since this morning holds a stale one, and its save
-- would otherwise silently discard whatever happened in between. It is
-- refused with CV_CHANGED, nothing is written, and the person is asked to
-- reload -- which is the only outcome that does not lose somebody's work
-- without telling them.
--
-- ── LOCALE IS TWO PLACES, WRITTEN ONCE ─────────────────────────────────
--
-- The column drives the list and the application dialog; `source_bundle`
-- carries the locale the document RENDERS in. Setting only the column left a
-- CV that said "English" in the list and printed Swedish headings. They are
-- set together here, in the same UPDATE, because they are one fact.

CREATE OR REPLACE FUNCTION public.cv_save(
  _cv_id                  uuid,
  _expected_updated_at    timestamptz,
  _title                  text    DEFAULT NULL,
  _locale                 text    DEFAULT NULL,
  _purpose                text    DEFAULT NULL,
  _target_job_text        text    DEFAULT NULL,
  _include_career_insight boolean DEFAULT NULL,
  -- NULL means "whatever this CV already carries". An empty array means
  -- "nothing", which the readiness check then refuses -- the two are
  -- different requests and must not collapse.
  _included_ids           uuid[]  DEFAULT NULL,
  _contact                jsonb   DEFAULT NULL,
  _presentation           jsonb   DEFAULT NULL,
  _refresh_facts          boolean DEFAULT false,
  _provider_mode          text    DEFAULT NULL,
  _model_id               text    DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _uid        uuid := auth.uid();
  _row        public.cv_documents%ROWTYPE;
  _ids        uuid[];
  _locale_n   text;
  _purpose_n  text;
  _insight    boolean;
  _target     text;
  _fresh      jsonb;
  _bundle     jsonb;
  _pres       jsonb;
  _contact_n  jsonb;
  _origin     text;
  _updated_at timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'CV_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- FOR UPDATE: two concurrent saves are serialised here, so the revision
  -- check below cannot be read by one caller and invalidated by another
  -- between the check and the write.
  SELECT * INTO _row FROM public.cv_documents
   WHERE id = _cv_id AND owner_user_id = _uid FOR UPDATE;

  -- Identical answer for "no such CV" and "not yours". A caller who can tell
  -- them apart has an existence oracle over other people's documents.
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'CV_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF _expected_updated_at IS NULL OR _row.updated_at <> _expected_updated_at THEN
    RAISE EXCEPTION 'CV_CHANGED' USING ERRCODE = 'serialization_failure';
  END IF;

  _locale_n  := CASE WHEN coalesce(_locale, _row.locale) = 'en' THEN 'en' ELSE 'sv' END;
  _purpose_n := CASE WHEN coalesce(_purpose, _row.purpose) = 'targeted'
                     THEN 'targeted' ELSE 'general' END;
  _insight   := coalesce(_include_career_insight,
                         (_row.source_bundle -> 'careerInsight') IS NOT NULL
                         AND jsonb_typeof(_row.source_bundle -> 'careerInsight') <> 'null');
  _target    := CASE WHEN _purpose_n = 'targeted'
                     THEN coalesce(_target_job_text, _row.source_bundle ->> 'targetJobText') END;

  -- A legacy CV -- one written before the allowlist existed -- derives its
  -- carried set from its own saved bundle and from nothing else. There is no
  -- branch in which "no allowlist supplied" means "everything the person
  -- has": that would be the fail-open model this replaces.
  _ids := coalesce(_included_ids, public.cv_bundle_ids(_row.source_bundle));

  _fresh  := public.cv_source_bundle(_ids, _locale_n, _insight, _target);
  _bundle := public.cv_merge_bundle(_row.source_bundle, _fresh, _refresh_facts);
  -- The locale always follows the request, even when the facts are frozen:
  -- it is a property of the document, not of the records underneath it.
  _bundle := jsonb_set(_bundle, ARRAY['locale'], to_jsonb(_locale_n));

  IF NOT public.cv_bundle_is_ready(_bundle) THEN
    RAISE EXCEPTION 'CV_NOT_READY' USING ERRCODE = 'check_violation';
  END IF;

  _contact_n := public.cv_normalise_contact(
    coalesce(_contact, _row.presentation -> 'contact'));

  _pres := public.cv_normalise_presentation(
             coalesce(_presentation, _row.presentation), _bundle)
        || jsonb_build_object('contact', _contact_n);

  _origin := CASE
    WHEN (_pres #>> '{authorship,headline}') = 'ai'
      OR (_pres #>> '{authorship,summary}')  = 'ai'
      OR jsonb_path_exists(_pres, '$.authorship.bullets.* ? (@ == "ai")')
    THEN 'ai_assisted' ELSE 'factual' END;

  UPDATE public.cv_documents SET
    title         = coalesce(nullif(btrim(coalesce(_title, '')), ''), title),
    locale        = _locale_n,
    purpose       = _purpose_n,
    origin        = _origin,
    source_bundle = _bundle,
    presentation  = _pres,
    provider_mode = CASE WHEN _presentation IS NOT NULL THEN _provider_mode ELSE provider_mode END,
    model_id      = CASE WHEN _presentation IS NOT NULL THEN _model_id      ELSE model_id      END
   WHERE id = _cv_id AND owner_user_id = _uid
  RETURNING updated_at INTO _updated_at;

  RETURN jsonb_build_object('cv_id', _cv_id, 'updated_at', _updated_at);
END; $$;

COMMENT ON FUNCTION public.cv_save(uuid, timestamptz, text, text, text, text, boolean, uuid[], jsonb, jsonb, boolean, text, text) IS
  'The one write for everything a person may change about a saved CV: what it '
  'carries, its title, its document language, its contact settings and its '
  'wording -- built and validated in full before a single row is touched, so '
  'a refusal leaves the row exactly as it was. Requires the revision the '
  'caller was looking at and refuses a stale one with CV_CHANGED. Facts are '
  're-derived from the caller''s own records; no employer name, role title or '
  'date can arrive from a client.';

REVOKE ALL     ON FUNCTION public.cv_save(uuid, timestamptz, text, text, text, text, boolean, uuid[], jsonb, jsonb, boolean, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cv_save(uuid, timestamptz, text, text, text, text, boolean, uuid[], jsonb, jsonb, boolean, text, text) TO authenticated;

-- ── REFRESH ────────────────────────────────────────────────────────────
--
-- "Update from profile", as its own verb rather than a boolean somebody has
-- to remember to set. Same implementation, so there is one place where a
-- bundle is rebuilt; a separate name so the audit trail and the call site
-- both say what was asked for.
--
-- It refreshes the VALUES of what this CV already carries. A newly recorded
-- employment is a suggestion the screen offers, never an addition this makes:
-- adding a fact to a CV is the person's decision and goes through cv_save
-- with an explicit allowlist.

CREATE OR REPLACE FUNCTION public.cv_refresh_from_profile(
  _cv_id               uuid,
  _expected_updated_at timestamptz)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.cv_save(
    _cv_id, _expected_updated_at,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    true, NULL, NULL);
$$;

COMMENT ON FUNCTION public.cv_refresh_from_profile(uuid, timestamptz) IS
  'Re-derives current values for the facts this CV already carries. Adds '
  'nothing: a newly recorded employment is offered to the holder and reaches '
  'the document only through an explicit cv_save allowlist.';

REVOKE ALL     ON FUNCTION public.cv_refresh_from_profile(uuid, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cv_refresh_from_profile(uuid, timestamptz) TO authenticated;

-- ── DELETE ─────────────────────────────────────────────────────────────
--
-- Also revision-checked. Deleting a document somebody else has just edited in
-- another tab destroys work without telling anybody, and "it was only a CV"
-- is not a reason to be careless with the one artefact a person has been
-- composing about their own career.

CREATE OR REPLACE FUNCTION public.cv_delete(
  _cv_id               uuid,
  _expected_updated_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.cv_documents%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'CV_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _row FROM public.cv_documents
   WHERE id = _cv_id AND owner_user_id = _uid FOR UPDATE;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'CV_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF _expected_updated_at IS NULL OR _row.updated_at <> _expected_updated_at THEN
    RAISE EXCEPTION 'CV_CHANGED' USING ERRCODE = 'serialization_failure';
  END IF;

  -- An application an employer already received is NOT affected: the snapshot
  -- lives on the application row and cv_document_id is ON DELETE SET NULL.
  DELETE FROM public.cv_documents WHERE id = _cv_id AND owner_user_id = _uid;

  RETURN jsonb_build_object('deleted', true);
END; $$;

COMMENT ON FUNCTION public.cv_delete(uuid, timestamptz) IS
  'Deletes one of the caller''s own CVs, refusing a stale revision with '
  'CV_CHANGED. Applications an employer already received keep their submitted '
  'snapshot; only the editable document goes.';

REVOKE ALL     ON FUNCTION public.cv_delete(uuid, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cv_delete(uuid, timestamptz) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 8. The employer's copy
-- ═════════════════════════════════════════════════════════════════════════
--
-- ── WHAT LEAKED ────────────────────────────────────────────────────────
--
-- The stored presentation keeps a contact VALUE beside its SWITCH, so a
-- person can turn their telephone number off for one employer without
-- retyping it for the next. 20261018090000 copied the presentation whole
-- (less `tailoringRationale`) onto the application, and job_applications is
-- employer-readable. So the number a candidate had deliberately not shown was
-- one `select` away from the recruiter, and both the React component and the
-- PDF were entirely honest about not displaying it.
--
-- A value hidden by a renderer is not withheld. It is published with a note
-- asking people not to look.
--
-- ── SO THE EMPLOYER'S COPY IS BUILT, NOT FILTERED ──────────────────────
--
-- This function constructs the snapshot from a fixed shape. There is no
-- passthrough anywhere in it: a key that is not named below does not survive,
-- which is the only construction under which a field nobody thought about
-- cannot leak. Specifically:
--
--   CONTACT     a value whose switch is off has its KEY REMOVED. Not blanked
--               -- an empty string in an employer's payload is still a
--               statement, and `"phone": ""` invites somebody to wonder.
--   IDS         every internal uuid is replaced by a snapshot-local key
--               (`e1`, `c3`). An employer has no use for the primary key of a
--               row in sp_claims, and a stable identifier for a person's
--               credential is exactly the kind of thing that ends up joined
--               to something later.
--   `verified`  dropped from every claim. Bundles built after this migration
--               do not carry it at all; ones written before do, and it is a
--               frozen display decision with no date on it. An employer
--               reading "verified: true" about a credential revoked in April
--               is the failure this whole trust model exists to prevent, and
--               verified standing reaches them through the holder-authorised,
--               application-scoped Passport disclosure instead.
--   `checked_at` added. The document is a dated artefact and the renderer
--               needs a date to say "valid until 2026-03-31" against; without
--               one it cannot honestly print an expiry at all.

CREATE OR REPLACE FUNCTION public.cv_application_snapshot(
  _cv         public.cv_documents,
  _checked_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _bundle  jsonb := coalesce(_cv.source_bundle, '{}'::jsonb);
  _pres    jsonb := coalesce(_cv.presentation, '{}'::jsonb);
  _map     jsonb := '{}'::jsonb;
  _section text;
  _rebuilt jsonb;
  _out     jsonb;
  _c       jsonb;
  _contact jsonb;
BEGIN
  -- 1 · Local keys for every fact, in the order the document presents them.
  --
  -- One pass to build the map, a second to rewrite the sections. Doing both
  -- at once needs a running offset across five arrays, which is how the first
  -- attempt at this managed to give two different facts the same key.
  SELECT coalesce(jsonb_object_agg(old_id, new_id), '{}'::jsonb)
    INTO _map
    FROM (
      SELECT q.x ->> 'id' AS old_id,
             CASE WHEN q.sec = 'employment' THEN 'e' ELSE 'c' END
             || row_number() OVER (
                  PARTITION BY CASE WHEN q.sec = 'employment' THEN 'e' ELSE 'c' END
                  ORDER BY q.sec_ord, q.ord)::text AS new_id
        FROM (
          SELECT s.sec, s.sec_ord, t.x, t.ord
            FROM (VALUES ('employment', 1), ('education', 2), ('credentials', 3),
                         ('skills', 4), ('languages', 5)) s(sec, sec_ord)
            CROSS JOIN LATERAL jsonb_array_elements(
                   coalesce(_bundle -> s.sec, '[]'::jsonb)) WITH ORDINALITY AS t(x, ord)
        ) q
    ) m
   WHERE old_id IS NOT NULL;

  -- Rebuilt key by key. `verified`, and anything else a legacy bundle
  -- carries, is simply not named here, so it does not survive.
  FOREACH _section IN ARRAY ARRAY['employment', 'education', 'credentials', 'skills', 'languages']
  LOOP
    SELECT coalesce(jsonb_agg(o.obj ORDER BY t.ord), '[]'::jsonb)
      INTO _rebuilt
      FROM jsonb_array_elements(coalesce(_bundle -> _section, '[]'::jsonb))
           WITH ORDINALITY AS t(x, ord)
      CROSS JOIN LATERAL (
        SELECT CASE WHEN _section = 'employment' THEN
                 jsonb_build_object(
                   'id',             _map ->> (t.x ->> 'id'),
                   'employerName',   t.x ->> 'employerName',
                   'roleTitle',      t.x ->> 'roleTitle',
                   'startedOn',      t.x ->> 'startedOn',
                   'endedOn',        t.x ->> 'endedOn',
                   'employmentType', t.x ->> 'employmentType',
                   'assertionLevel', t.x ->> 'assertionLevel')
               ELSE
                 jsonb_build_object(
                   'id',         _map ->> (t.x ->> 'id'),
                   'claimType',  t.x ->> 'claimType',
                   'title',      t.x ->> 'title',
                   'issuerName', t.x ->> 'issuerName',
                   'issuedOn',   t.x ->> 'issuedOn',
                   'validUntil', t.x ->> 'validUntil',
                   'level',      t.x ->> 'level')
               END AS obj) o;
    _bundle := jsonb_set(_bundle, ARRAY[_section], _rebuilt);
  END LOOP;

  -- 2 · The identity block, rebuilt. No passthrough here either.
  _out := jsonb_build_object(
    'bundleVersion', coalesce(_bundle ->> 'bundleVersion', 'cv-source-bundle-v1'),
    'locale',        coalesce(_bundle ->> 'locale', _cv.locale),
    'identity', jsonb_build_object(
      'displayName',        coalesce(_bundle #>> '{identity,displayName}', ''),
      'headline',           _bundle #>> '{identity,headline}',
      'country',            _bundle #>> '{identity,country}',
      'countrySubdivision', _bundle #>> '{identity,countrySubdivision}',
      'currentProfession',  _bundle #>> '{identity,currentProfession}',
      'yearsOfExperience',  _bundle #>> '{identity,yearsOfExperience}'),
    'employment',    _bundle -> 'employment',
    'education',     _bundle -> 'education',
    'credentials',   _bundle -> 'credentials',
    'skills',        _bundle -> 'skills',
    'languages',     _bundle -> 'languages',
    -- The insight's SNAPSHOT ID is an internal identifier and is not sent.
    -- Whether the person chose to include the labelled note is.
    'careerInsight', CASE
      WHEN jsonb_typeof(_bundle -> 'careerInsight') = 'object'
      THEN jsonb_build_object('included', true) END);
  -- `targetJobText` is not named above and so is not present. Absent rather
  -- than null on purpose: it may quote a DIFFERENT employer's advertisement,
  -- and `"targetJobText": null` in an employer's payload still says that a
  -- field by that name exists on the candidate's document.

  -- 3 · Contact: present only where the person switched it on.
  _c := coalesce(_pres -> 'contact', '{}'::jsonb);
  _contact := jsonb_build_object(
    'showEmail', coalesce((_c ->> 'showEmail')::boolean, false),
    'showPhone', coalesce((_c ->> 'showPhone')::boolean, false));
  IF coalesce((_c ->> 'showEmail')::boolean, false)
     AND coalesce(btrim(_c ->> 'email'), '') <> '' THEN
    _contact := _contact || jsonb_build_object('email', btrim(_c ->> 'email'));
  END IF;
  IF coalesce((_c ->> 'showPhone')::boolean, false)
     AND coalesce(btrim(_c ->> 'phone'), '') <> '' THEN
    _contact := _contact || jsonb_build_object('phone', btrim(_c ->> 'phone'));
  END IF;

  -- 4 · The wording, with every reference remapped onto the local keys.
  _pres := jsonb_build_object(
    'storedVersion', 'cv-stored-presentation-v1',
    'headline',      coalesce(_pres ->> 'headline', ''),
    'summary',       coalesce(_pres ->> 'summary', ''),
    'experience', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'sourceId', _map ->> (x ->> 'sourceId'),
               'bullets',  coalesce(x -> 'bullets', '[]'::jsonb)) ORDER BY ord)
        FROM jsonb_array_elements(coalesce(_pres -> 'experience', '[]'::jsonb))
             WITH ORDINALITY AS t(x, ord)
       WHERE _map ? (x ->> 'sourceId')), '[]'::jsonb),
    'emphasisedClaimIds', coalesce((
      SELECT jsonb_agg(_map ->> v)
        FROM jsonb_array_elements_text(coalesce(_pres -> 'emphasisedClaimIds', '[]'::jsonb)) v
       WHERE _map ? v), '[]'::jsonb),
    'authorship', jsonb_build_object(
      'headline', coalesce(_pres #>> '{authorship,headline}', 'person'),
      'summary',  coalesce(_pres #>> '{authorship,summary}', 'person'),
      'bullets',  coalesce((
        SELECT jsonb_object_agg(_map ->> t.key, t.value)
          FROM jsonb_each_text(coalesce(_pres #> '{authorship,bullets}', '{}'::jsonb)) t
         WHERE _map ? t.key), '{}'::jsonb)),
    'contact', _contact);
  -- Never sent, for the same reason as targetJobText.

  RETURN jsonb_build_object(
    'snapshot_version', 'application-cv-snapshot-v2',
    'cv_document_id',   _cv.id,
    'cv_updated_at',    _cv.updated_at,
    -- The date the facts were last checked against the holder's live records,
    -- which is what an expiry on this document must be judged against.
    'checked_at',       _checked_at,
    'title',            _cv.title,
    'locale',           _cv.locale,
    'purpose',          _cv.purpose,
    'origin',           _cv.origin,
    'document_version', _cv.document_version,
    'bundle_version',   _cv.bundle_version,
    'source_bundle',    _out,
    'presentation',     _pres);
END; $$;

COMMENT ON FUNCTION public.cv_application_snapshot(public.cv_documents, timestamptz) IS
  'Builds the employer-readable copy of a submitted CV by CONSTRUCTION, never '
  'by filtering: a key not named in the body does not survive. Contact values '
  'whose switch is off have their key removed; internal uuids are replaced by '
  'snapshot-local keys; the frozen per-credential "verified" boolean is '
  'dropped, because a stale trust claim with no date on it is worse than '
  'none. Carries checked_at so an expiry can be judged against the day the '
  'document was submitted.';

REVOKE ALL ON FUNCTION public.cv_application_snapshot(public.cv_documents, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- ── SUBMISSION ─────────────────────────────────────────────────────────
--
-- Two changes, and the second is as important as the first.
--
-- 1. The snapshot is built by cv_application_snapshot.
--
-- 2. EVERY FACT IS VERIFIED AGAINST THE HOLDER'S LIVE RECORDS FIRST, by
--    VALUE and not merely by id. A saved CV is a snapshot and that is right
--    for a document somebody reads; it is not right for one being SENT.
--
--    Two failures are caught by the same comparison. A credential archived,
--    withdrawn, superseded or revoked since the CV was saved would otherwise
--    travel as an ordinary line on a CV. And -- while phase 1 still grants
--    direct writes -- an employment whose real id was kept and whose employer
--    name was rewritten would travel as a job that never happened.
--
--    Either refuses the submission with CV_DOCUMENT_STALE_FACTS rather than
--    being sent quietly. The candidate updates the document and applies
--    again; that is a moment of friction in exchange for never having sent an
--    employer something that is not true of them today.
--
--    EXPIRY is deliberately NOT in this check. A lapsed authorisation is a
--    true part of somebody's history and may appear -- labelled, with no
--    verification mark, judged against `checked_at`. Refusing it would push
--    people to omit it, which is the opposite of what this product is for.

CREATE OR REPLACE FUNCTION public.sp_submit_application_with_cv_source(
  _application_id        uuid,
  _job_id                uuid,
  _phone                 text,
  _cover_note            text,
  _cv_storage_path       text,
  _cv_original_filename  text,
  _cv_size_bytes         bigint,
  _cv_source             text DEFAULT 'upload',
  _cv_document_id        uuid DEFAULT NULL,
  _include_passport      boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _status    text;
  _shared    boolean := false;
  _eligible  boolean := false;
  _cv        public.cv_documents%ROWTYPE;
  _snapshot  jsonb   := NULL;
  _bundle    jsonb;
  _now       timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _cv_source NOT IN ('upload', 'cqrityjob_cv') THEN
    RAISE EXCEPTION 'CV_SOURCE_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  IF _cv_source = 'cqrityjob_cv' THEN
    IF _cv_document_id IS NULL THEN
      RAISE EXCEPTION 'CV_DOCUMENT_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;

    -- INVOKER + owner-only RLS. The `owner_user_id` predicate is defence in
    -- depth and says the intent out loud; RLS is the boundary.
    SELECT * INTO _cv
      FROM public.cv_documents
     WHERE id = _cv_document_id
       AND owner_user_id = auth.uid();

    IF _cv.id IS NULL THEN
      RAISE EXCEPTION 'CV_DOCUMENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
    END IF;

    _bundle := coalesce(_cv.source_bundle, '{}'::jsonb);

    -- The same readiness rule the apply dialog shows in advance
    -- (isCvUsableForApplication, src/lib/professional-identity/cv/
    -- application-source.ts). Stated in two places because the interface has
    -- to explain it BEFORE submission and the database has to be the one that
    -- enforces it -- and this copy is the boundary.
    IF NOT public.cv_bundle_is_ready(_bundle) THEN
      RAISE EXCEPTION 'CV_DOCUMENT_NOT_READY' USING ERRCODE = 'check_violation';
    END IF;

    -- ── TRUE OF THE HOLDER TODAY, NOT MERELY SAVED ONCE ──────────────
    --
    -- Every fact on the document is compared, field for field, against the
    -- caller's own active records. This is the control that makes phase 1
    -- safe to deploy while direct writes to cv_documents are still granted:
    -- a fabricated bundle can be written and cannot be sent.
    IF public.cv_facts_unverified(_bundle) > 0 THEN
      RAISE EXCEPTION 'CV_DOCUMENT_STALE_FACTS' USING ERRCODE = 'check_violation';
    END IF;

    _snapshot := public.cv_application_snapshot(_cv, _now);
  END IF;

  INSERT INTO public.job_applications (
    id, job_id, applicant_user_id, phone, cover_note,
    cv_storage_path, cv_original_filename, cv_mime_type, cv_size_bytes,
    cv_source, cv_document_id, cv_document_snapshot,
    consent_given_at)
  VALUES (
    _application_id, _job_id, auth.uid(), _phone, _cover_note,
    CASE WHEN _cv_source = 'upload' THEN _cv_storage_path END,
    CASE WHEN _cv_source = 'upload' THEN _cv_original_filename END,
    CASE WHEN _cv_source = 'upload' AND _cv_storage_path IS NOT NULL
         THEN 'application/pdf' END,
    CASE WHEN _cv_source = 'upload' THEN _cv_size_bytes END,
    _cv_source,
    CASE WHEN _cv_source = 'cqrityjob_cv' THEN _cv_document_id END,
    _snapshot,
    _now)
  RETURNING status INTO _status;

  IF _include_passport THEN
    SELECT EXISTS (SELECT 1 FROM public.sp_passport_profiles
                    WHERE holder_user_id = auth.uid())
       AND (EXISTS (SELECT 1 FROM public.sp_claims c
                     WHERE c.holder_user_id = auth.uid()
                       AND c.assertion_level = 'verified'
                       AND c.lifecycle_state = 'active')
         OR EXISTS (SELECT 1 FROM public.sp_experience_periods e
                     WHERE e.holder_user_id = auth.uid()
                       AND e.assertion_level = 'verified'
                       AND e.lifecycle_state = 'active'))
      INTO _eligible;

    IF _eligible THEN
      PERFORM public.sp_share_passport_with_application(
        _application_id, 'employer_review', 30, NULL, NULL);
      _shared := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', _application_id,
    'status', _status,
    'cv_source', _cv_source,
    'passport_requested', _include_passport,
    'passport_shared', _shared,
    'passport_eligible', _eligible);
END; $$;

COMMENT ON FUNCTION public.sp_submit_application_with_cv_source(uuid, uuid, text, text, text, text, bigint, text, uuid, boolean) IS
  'Submits one job application, copying the chosen CQrityjob CV onto it '
  'through cv_application_snapshot -- which builds the employer''s copy by '
  'construction, removes contact values the candidate switched off, replaces '
  'internal uuids with snapshot-local keys and drops the frozen "verified" '
  'flag. Every selected fact is re-checked against the holder''s live records '
  'first: a credential archived, withdrawn or revoked since the CV was saved '
  'refuses the submission with CV_DOCUMENT_STALE_FACTS rather than travelling '
  'silently. Expiry is not a refusal -- a lapsed authorisation is true history '
  'and is labelled, not hidden. SECURITY INVOKER, as before.';

REVOKE ALL     ON FUNCTION public.sp_submit_application_with_cv_source(uuid, uuid, text, text, text, text, bigint, text, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sp_submit_application_with_cv_source(uuid, uuid, text, text, text, text, bigint, text, uuid, boolean) TO authenticated;
