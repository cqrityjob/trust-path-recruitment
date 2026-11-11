-- =============================================================================
-- Voluntary self-declarations: the Security Passport bridge (vsd_disclosure_*)
-- =============================================================================
--
-- Rollback: supabase/rollback/20270325090000_vsd_passport_disclosure_rollback.sql
-- Suite:    supabase/tests/vsd_passport_disclosure_test.sql
-- Design:   docs/legal/voluntary-self-declarations-processing.md
--
-- Written directly at the next canonical slot (the repository's versions run
-- ahead of the wall clock; see docs/release/release-sequence.md).
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────
--
-- 20270324090000 made a self-declaration private to its holder and said, in
-- so many words, that nothing in it could authorize showing one to anybody
-- else. This migration adds the one narrow way that can happen, and only
-- that way:
--
--   * the holder's own Passport page may read their CURRENT statements
--     (vsd_my_passport_declarations), nothing else about them;
--   * the holder may attach chosen statements to ONE Passport link they have
--     just created (vsd_select_for_disclosure), having previewed exactly what
--     a recipient will receive (vsd_preview_disclosure);
--   * a recipient who holds that link's live share session AND is signed in
--     with a live session of their own may read exactly those statements
--     (vsd_read_disclosed).
--
-- ── THE DISCLOSURE GATE ─────────────────────────────────────────────────
--
-- A processing authorization (collection) authorizes NO disclosure. Showing
-- a statement to a recipient additionally requires a current row in
-- vsd_disclosure_authorizations for that same processing authorization: its
-- own purpose, legal basis, assessment and permitted audiences, approved
-- separately.
--
-- THIS MIGRATION INSERTS NO AUTHORIZATION OF EITHER KIND. After installation
-- no statement can be collected (as before) and none can be disclosed. No
-- client role and no RPC can write either table.
--
-- The only audience that exists is `signed_in_recipient`. There is
-- deliberately no anonymous audience: an ordinary Passport link is readable
-- by anyone who holds it, and that must never become true of these
-- statements. Adding an audience is a schema change, not a row.
--
-- ── WHAT A RECIPIENT CAN BE GIVEN ───────────────────────────────────────
--
-- vsd_disclosed_statement() is the ONE builder, used by the holder's preview
-- and by the recipient's read alike: kind, jurisdiction, statement version,
-- the date the statement is about, the day it was made, and the reviewed
-- period where one exists. Never an id, a revision, a document, its name,
-- type, hash or path, a review, a provenance level, the holder's user id, or
-- another declaration. A document or a review can therefore not turn a
-- statement into anything stronger for a recipient: they are told only that
-- the person said it.
--
-- ── LIFECYCLE ───────────────────────────────────────────────────────────
--
-- A selection names the exact declaration revision, statement version and
-- disclosure authorization it was made under. vsd_selection_disclosable() is
-- asked on EVERY recipient read and requires, as of that moment:
--
--   * the selection not withdrawn;
--   * the statement active, inside its retention, under a processing
--     authorization that is still current (vsd_declaration_current);
--   * the same revision and wording -- so a change, renewal, withdrawal or
--     deletion ends disclosure of the old statement, for good;
--   * the SAME disclosure authorization still current and still permitting
--     the audience -- a later re-authorization does not revive a selection;
--   * the link itself live: the holder's, a token link, not revoked or
--     expired.
--
-- Nothing waits for a reconciliation, a profile read or a purge.
--
-- A link's selection is made once, within an hour of the link's creation,
-- and can afterwards only shrink. A link that already exists never gains a
-- statement, and a reissued link carries none.
--
-- ── WHAT IT DOES NOT TOUCH ──────────────────────────────────────────────
--
-- No sp_ function, table, policy or payload changes. The anonymous recipient
-- path (sp_get_disclosure, sp_get_disclosure_session), the social share, the
-- application disclosure, talent search and every catalogue remain unable to
-- see a vsd_ row: no function of theirs names one (the suites prove it from
-- the catalogue). The new tables reference sp_disclosures; nothing
-- references them back.

-- ── Preflight ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.vsd_declarations') IS NULL
     OR to_regclass('public.vsd_processing_authorizations') IS NULL
     OR to_regprocedure('public.vsd_assert_caller()') IS NULL
     OR to_regprocedure('public.vsd_authorization_immutable()') IS NULL THEN
    RAISE EXCEPTION 'VSD_DISCLOSURE_PREFLIGHT: 20270324090000 is not installed.';
  END IF;
  IF to_regclass('public.sp_disclosures') IS NULL OR to_regclass('public.sp_share_sessions') IS NULL THEN
    RAISE EXCEPTION 'VSD_DISCLOSURE_PREFLIGHT: the Passport share tables are missing.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relname LIKE 'vsd\_disclosure\_%') THEN
    RAISE EXCEPTION 'VSD_DISCLOSURE_PREFLIGHT: a vsd_disclosure_ object already exists.';
  END IF;
END $$;

-- ── 1 · Disclosure authorizations ───────────────────────────────────────

CREATE TABLE public.vsd_disclosure_authorizations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The collection this disclosure belongs to. Its kind, jurisdiction,
  -- operator and statement wording are that row's, never restated here.
  authorization_id       uuid NOT NULL REFERENCES public.vsd_processing_authorizations(id) ON DELETE RESTRICT,
  purpose                text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 20 AND 2000),
  legal_basis            text NOT NULL
    CHECK (legal_basis IN ('consent', 'contract', 'legal_obligation', 'legitimate_interests', 'public_task')),
  legal_basis_detail     text NOT NULL CHECK (length(btrim(legal_basis_detail)) BETWEEN 20 AND 4000),
  -- The assessment this DISCLOSURE was approved in; not the collection's.
  assessment_reference   text NOT NULL CHECK (length(btrim(assessment_reference)) BETWEEN 3 AND 500),
  -- GDPR Art. 10: the national-law authority for disclosing offence data.
  offence_data_authority text CHECK (offence_data_authority IS NULL
                                     OR length(btrim(offence_data_authority)) BETWEEN 10 AND 2000),
  permitted_audiences    text[] NOT NULL,
  approved_by_name       text NOT NULL CHECK (length(btrim(approved_by_name)) BETWEEN 2 AND 200),
  approved_on            date NOT NULL,
  effective_from         timestamptz NOT NULL DEFAULT now(),
  revoked_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  -- There is deliberately no anonymous audience.
  CONSTRAINT vsd_disclosure_auth_audiences_known CHECK (
    cardinality(permitted_audiences) > 0
    AND permitted_audiences <@ ARRAY['signed_in_recipient']),
  CONSTRAINT vsd_disclosure_auth_revoked_after_effective CHECK (revoked_at IS NULL OR revoked_at >= effective_from)
);

CREATE UNIQUE INDEX vsd_disclosure_auth_one_current_idx
  ON public.vsd_disclosure_authorizations (authorization_id) WHERE revoked_at IS NULL;

ALTER TABLE public.vsd_disclosure_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vsd_disclosure_authorizations FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.vsd_disclosure_authorizations IS
  'The separately assessed purpose, legal basis and permitted audiences for showing one kind of '
  'voluntary self-declaration to a recipient the holder chose. A processing authorization alone '
  'authorizes no disclosure. Written only by a reviewed migration; immutable except for revocation.';

-- A disclosure cannot be authorized for a collection that is not current,
-- and offence data cannot be disclosed on consent or without its authority.
CREATE FUNCTION public.vsd_disclosure_authorization_admissible()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE _auth public.vsd_processing_authorizations;
BEGIN
  SELECT * INTO _auth FROM public.vsd_processing_authorizations WHERE id = NEW.authorization_id;
  IF NOT FOUND OR _auth.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'VSD_DISCLOSURE_AUTHORIZATION_NEEDS_COLLECTION' USING ERRCODE = '23514';
  END IF;
  IF _auth.declaration_kind = 'criminal_history'
     AND (NEW.legal_basis = 'consent' OR NEW.offence_data_authority IS NULL) THEN
    RAISE EXCEPTION 'VSD_DISCLOSURE_CRIMINAL_NEEDS_REVIEWED_BASIS' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.vsd_disclosure_authorization_admissible() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER vsd_disclosure_authorization_admissible BEFORE INSERT ON public.vsd_disclosure_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.vsd_disclosure_authorization_admissible();
-- The one permitted change is revoking, once (the 20270324090000 rule).
CREATE TRIGGER vsd_disclosure_authorization_immutable BEFORE UPDATE OR DELETE ON public.vsd_disclosure_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.vsd_authorization_immutable();

-- ── 2 · Selections ──────────────────────────────────────────────────────

CREATE TABLE public.vsd_disclosure_selections (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The one Passport link this statement accompanies.
  disclosure_id               uuid NOT NULL REFERENCES public.sp_disclosures(id) ON DELETE CASCADE,
  declaration_id              uuid NOT NULL REFERENCES public.vsd_declarations(id) ON DELETE CASCADE,
  -- Exactly what the holder previewed. A statement at any other revision or
  -- wording is a different statement and is never disclosed through this row.
  declaration_revision        integer NOT NULL CHECK (declaration_revision > 0),
  statement_version           text NOT NULL,
  disclosure_authorization_id uuid NOT NULL REFERENCES public.vsd_disclosure_authorizations(id) ON DELETE RESTRICT,
  audience                    text NOT NULL CHECK (audience IN ('signed_in_recipient')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  withdrawn_at                timestamptz,
  CONSTRAINT vsd_disclosure_selection_once UNIQUE (disclosure_id, declaration_id),
  CONSTRAINT vsd_disclosure_selection_withdrawn_after CHECK (withdrawn_at IS NULL OR withdrawn_at >= created_at)
);
CREATE INDEX vsd_disclosure_selections_holder_idx ON public.vsd_disclosure_selections (holder_user_id);
CREATE INDEX vsd_disclosure_selections_declaration_idx ON public.vsd_disclosure_selections (declaration_id);

ALTER TABLE public.vsd_disclosure_selections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vsd_disclosure_selections FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.vsd_disclosure_selections IS
  'A holder''s explicit choice to let one statement, at one revision, accompany one Passport link, '
  'for a signed-in recipient. Read and written only through the vsd_ functions; whether it '
  'discloses anything is decided again on every read (vsd_selection_disclosable).';

-- What was selected never changes. A selection can only be withdrawn, once.
CREATE FUNCTION public.vsd_disclosure_selection_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.withdrawn_at IS NOT NULL
     OR NEW.withdrawn_at IS NULL
     OR (to_jsonb(NEW) - 'withdrawn_at') IS DISTINCT FROM (to_jsonb(OLD) - 'withdrawn_at') THEN
    RAISE EXCEPTION 'VSD_DISCLOSURE_SELECTION_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.vsd_disclosure_selection_immutable() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER vsd_disclosure_selection_immutable BEFORE UPDATE ON public.vsd_disclosure_selections
  FOR EACH ROW EXECUTE FUNCTION public.vsd_disclosure_selection_immutable();

-- ── 3 · The record of a recipient's read ────────────────────────────────

CREATE TABLE public.vsd_disclosure_accesses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_id      uuid NOT NULL REFERENCES public.vsd_disclosure_selections(id) ON DELETE CASCADE,
  -- The signed-in recipient. Kept as an event without a name once that
  -- account is erased.
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accessed_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vsd_disclosure_accesses_selection_idx ON public.vsd_disclosure_accesses (selection_id, accessed_at);
CREATE INDEX vsd_disclosure_accesses_recipient_idx ON public.vsd_disclosure_accesses (recipient_user_id);

ALTER TABLE public.vsd_disclosure_accesses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vsd_disclosure_accesses FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.vsd_disclosure_accesses IS
  'One row each time a signed-in recipient was actually given a statement. The holder is shown '
  'how often and when, never by whom.';

-- ── 4 · Internal rules (no client role can execute these) ───────────────

-- THE ONE DISCLOSURE RULE. Asked on every recipient read and by every
-- listing; nothing stores its answer.
CREATE FUNCTION public.vsd_selection_disclosable(_s public.vsd_disclosure_selections)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _s.id IS NOT NULL
     AND _s.withdrawn_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.vsd_declarations d
         JOIN public.vsd_disclosure_authorizations da ON da.id = _s.disclosure_authorization_id
        WHERE d.id = _s.declaration_id
          AND d.holder_user_id = _s.holder_user_id
          AND d.revision = _s.declaration_revision
          AND d.statement_version = _s.statement_version
          AND public.vsd_declaration_current(d)
          AND da.authorization_id = d.authorization_id
          AND da.revoked_at IS NULL AND da.effective_from <= now()
          AND _s.audience = ANY (da.permitted_audiences))
     AND EXISTS (
       SELECT 1 FROM public.sp_disclosures x
        WHERE x.id = _s.disclosure_id
          AND x.holder_user_id = _s.holder_user_id
          AND x.application_id IS NULL
          AND x.revoked_at IS NULL
          AND (x.expires_at IS NULL OR x.expires_at >= now()))
$$;
REVOKE ALL ON FUNCTION public.vsd_selection_disclosable(public.vsd_disclosure_selections) FROM PUBLIC, anon, authenticated, service_role;

-- The disclosure authorization a statement could be shared under right now,
-- for one audience -- or nothing.
CREATE FUNCTION public.vsd_disclosure_authorization_for(_d public.vsd_declarations, _audience text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT da.id FROM public.vsd_disclosure_authorizations da
   WHERE public.vsd_declaration_current(_d)
     AND da.authorization_id = _d.authorization_id
     AND da.revoked_at IS NULL AND da.effective_from <= now()
     AND _audience = ANY (da.permitted_audiences)
$$;
REVOKE ALL ON FUNCTION public.vsd_disclosure_authorization_for(public.vsd_declarations, text) FROM PUBLIC, anon, authenticated, service_role;

-- THE ONE BUILDER of what leaves the holder. The preview and the recipient's
-- read both return exactly this, so they cannot differ.
CREATE FUNCTION public.vsd_disclosed_statement(_d public.vsd_declarations)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'kind', _d.declaration_kind,
    'jurisdiction', _d.jurisdiction,
    'statementVersion', _d.statement_version,
    'asOfDate', _d.as_of_date,
    'declaredOn', (_d.declared_at AT TIME ZONE 'UTC')::date,
    'statementPeriod', (SELECT a.statement_period FROM public.vsd_processing_authorizations a
                         WHERE a.id = _d.authorization_id))
$$;
REVOKE ALL ON FUNCTION public.vsd_disclosed_statement(public.vsd_declarations) FROM PUBLIC, anon, authenticated, service_role;

-- The holder's own choice of statements, checked: each one theirs, current,
-- at the revision they are looking at, and shareable with this audience.
-- Returns the rows in a fixed order; raises on the first that fails.
CREATE FUNCTION public.vsd_assert_disclosure_choice(_uid uuid, _declaration_ids uuid[], _revisions integer[])
RETURNS SETOF public.vsd_declarations LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE _i integer; _d public.vsd_declarations;
BEGIN
  IF _declaration_ids IS NULL OR _revisions IS NULL
     OR cardinality(_declaration_ids) NOT BETWEEN 1 AND 3
     OR cardinality(_revisions) <> cardinality(_declaration_ids)
     OR array_position(_declaration_ids, NULL) IS NOT NULL
     OR array_position(_revisions, NULL) IS NOT NULL
     OR (SELECT count(DISTINCT x) FROM unnest(_declaration_ids) x) <> cardinality(_declaration_ids) THEN
    RAISE EXCEPTION 'VSD_INVALID_INPUT' USING ERRCODE = '23514';
  END IF;
  FOR _i IN 1 .. cardinality(_declaration_ids) LOOP
    SELECT * INTO _d FROM public.vsd_declarations
     WHERE id = _declaration_ids[_i] AND holder_user_id = _uid;
    IF NOT FOUND OR _d.status <> 'active' THEN
      RAISE EXCEPTION 'VSD_DECLARATION_NOT_FOUND' USING ERRCODE = '42501';
    END IF;
    IF _d.revision <> _revisions[_i] THEN
      RAISE EXCEPTION 'VSD_STALE_REVISION' USING ERRCODE = '23514';
    END IF;
    IF public.vsd_disclosure_authorization_for(_d, 'signed_in_recipient') IS NULL THEN
      RAISE EXCEPTION 'VSD_DISCLOSURE_NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;
    RETURN NEXT _d;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.vsd_assert_disclosure_choice(uuid, uuid[], integer[]) FROM PUBLIC, anon, authenticated, service_role;

-- ── 5 · The holder's functions ──────────────────────────────────────────

-- What the holder's own Passport page reads: their current statements and
-- nothing else about them. A statement under a closed, revoked or expired
-- processing authorization is simply absent -- there is no "not declared",
-- "withdrawn" or adverse state to show. Read-only; reconciles nothing.
CREATE FUNCTION public.vsd_my_passport_declarations()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE _uid uuid := public.vsd_assert_caller();
BEGIN
  RETURN jsonb_build_object(
    -- Which kinds can be declared at all right now: lets the page say
    -- "not activated" without implying anything about the holder.
    'open', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'kind', a.declaration_kind, 'jurisdiction', a.jurisdiction,
               'statementVersion', a.statement_version)
             ORDER BY a.declaration_kind, a.jurisdiction)
        FROM public.vsd_processing_authorizations a
       WHERE a.revoked_at IS NULL AND a.effective_from <= now()), '[]'::jsonb),
    'declarations', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'revision', d.revision,
               'statement', public.vsd_disclosed_statement(d),
               'provenance', public.vsd_declaration_payload(d) ->> 'provenance',
               'shareable', public.vsd_disclosure_authorization_for(d, 'signed_in_recipient') IS NOT NULL)
             ORDER BY d.declaration_kind, d.jurisdiction)
        FROM public.vsd_declarations d
       WHERE d.holder_user_id = _uid AND public.vsd_declaration_current(d)), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.vsd_my_passport_declarations() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_my_passport_declarations() TO authenticated;

-- Exactly what a recipient would receive for this choice. Stores nothing.
CREATE FUNCTION public.vsd_preview_disclosure(_declaration_ids uuid[], _revisions integer[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE _uid uuid := public.vsd_assert_caller();
BEGIN
  RETURN jsonb_build_object(
    'audience', 'signed_in_recipient',
    'items', coalesce((
      SELECT jsonb_agg(public.vsd_disclosed_statement(d) ORDER BY d.declaration_kind, d.jurisdiction)
        FROM public.vsd_assert_disclosure_choice(_uid, _declaration_ids, _revisions) d), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.vsd_preview_disclosure(uuid[], integer[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_preview_disclosure(uuid[], integer[]) TO authenticated;

-- Attach the chosen statements to ONE link the holder has just created.
--
-- Made once per link: a repeat of the same choice changes nothing, a
-- different one is refused. Only within an hour of the link's creation, so a
-- link that is already in somebody's hands can never start carrying more
-- than it did when the holder previewed it.
CREATE FUNCTION public.vsd_select_for_disclosure(_disclosure_id uuid, _declaration_ids uuid[], _revisions integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _uid uuid := public.vsd_assert_caller();
  _link public.sp_disclosures;
  _d public.vsd_declarations;
  _existing integer;
BEGIN
  IF _disclosure_id IS NULL THEN
    RAISE EXCEPTION 'VSD_INVALID_INPUT' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO _link FROM public.sp_disclosures
   WHERE id = _disclosure_id AND holder_user_id = _uid FOR UPDATE;
  IF NOT FOUND OR _link.application_id IS NOT NULL OR _link.revoked_at IS NOT NULL
     OR (_link.expires_at IS NOT NULL AND _link.expires_at < now()) THEN
    RAISE EXCEPTION 'VSD_DISCLOSURE_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO _existing FROM public.vsd_disclosure_selections WHERE disclosure_id = _link.id;
  IF _existing > 0 THEN
    -- A retry of the same choice, or nothing.
    IF _existing = cardinality(_declaration_ids)
       AND cardinality(_revisions) = cardinality(_declaration_ids)
       AND NOT EXISTS (
         SELECT 1 FROM unnest(_declaration_ids, _revisions) AS c(declaration_id, revision)
          WHERE NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_selections s
                             WHERE s.disclosure_id = _link.id AND s.declaration_id = c.declaration_id
                               AND s.declaration_revision = c.revision)) THEN
      RETURN jsonb_build_object('status', 'already_selected', 'count', _existing);
    END IF;
    RAISE EXCEPTION 'VSD_DISCLOSURE_ALREADY_SELECTED' USING ERRCODE = '23505';
  END IF;
  IF _link.created_at < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'VSD_DISCLOSURE_CLOSED_TO_SELECTION' USING ERRCODE = '42501';
  END IF;

  FOR _d IN SELECT * FROM public.vsd_assert_disclosure_choice(_uid, _declaration_ids, _revisions) LOOP
    INSERT INTO public.vsd_disclosure_selections
      (holder_user_id, disclosure_id, declaration_id, declaration_revision, statement_version,
       disclosure_authorization_id, audience)
    VALUES (_uid, _link.id, _d.id, _d.revision, _d.statement_version,
            public.vsd_disclosure_authorization_for(_d, 'signed_in_recipient'), 'signed_in_recipient');
  END LOOP;
  RETURN jsonb_build_object('status', 'selected', 'count', cardinality(_declaration_ids));
END $$;
REVOKE ALL ON FUNCTION public.vsd_select_for_disclosure(uuid, uuid[], integer[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_select_for_disclosure(uuid, uuid[], integer[]) TO authenticated;

-- Stop one statement accompanying one link. Never needs an authorization: a
-- holder can always take a disclosure back. The link itself is untouched.
CREATE FUNCTION public.vsd_withdraw_disclosure_selection(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _uid uuid := public.vsd_assert_caller(); _row public.vsd_disclosure_selections;
BEGIN
  SELECT * INTO _row FROM public.vsd_disclosure_selections
   WHERE id = _id AND holder_user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VSD_DISCLOSURE_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF _row.withdrawn_at IS NULL THEN
    UPDATE public.vsd_disclosure_selections SET withdrawn_at = now() WHERE id = _row.id;
  END IF;
  RETURN jsonb_build_object('withdrawn', true);
END $$;
REVOKE ALL ON FUNCTION public.vsd_withdraw_disclosure_selection(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_withdraw_disclosure_selection(uuid) TO authenticated;

-- The holder's own selections, with whether each one discloses anything
-- right now and how often it has. Never who read it.
CREATE FUNCTION public.vsd_my_disclosure_selections()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE _uid uuid := public.vsd_assert_caller();
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', s.id, 'disclosureId', s.disclosure_id,
             'kind', d.declaration_kind, 'jurisdiction', d.jurisdiction,
             'statementVersion', s.statement_version,
             'createdAt', s.created_at, 'withdrawnAt', s.withdrawn_at,
             'disclosable', public.vsd_selection_disclosable(s),
             'accessCount', (SELECT count(*) FROM public.vsd_disclosure_accesses a WHERE a.selection_id = s.id),
             'lastAccessedAt', (SELECT max(a.accessed_at) FROM public.vsd_disclosure_accesses a
                                 WHERE a.selection_id = s.id))
           ORDER BY s.created_at DESC, d.declaration_kind)
      FROM public.vsd_disclosure_selections s
      JOIN public.vsd_declarations d ON d.id = s.declaration_id
     WHERE s.holder_user_id = _uid), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.vsd_my_disclosure_selections() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_my_disclosure_selections() TO authenticated;

-- ── 6 · The recipient's read ────────────────────────────────────────────
--
-- Called by the application server with the RECIPIENT'S OWN session, and the
-- share session secret the server read from the recipient's HttpOnly cookie.
-- Both are required:
--
--   * a signed-in caller with a live session (never anon, never the service
--     role) -- the statements are not readable by a stranger holding a link;
--   * a live share session for a live token link -- being signed in does not
--     reach any statement the caller was not sent.
--
-- Every selection is then decided again by vsd_selection_disclosable. A
-- caller who fails any of this gets the same empty answer as a link that
-- carries no statement at all, so nothing is learned from the difference.
CREATE FUNCTION public.vsd_read_disclosed(_share_session text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _uid uuid := public.vsd_assert_caller();
  _disclosure_id uuid;
  _holder uuid;
  _items jsonb;
BEGIN
  IF coalesce(_share_session, '') !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('items', '[]'::jsonb);
  END IF;
  SELECT x.id, x.holder_user_id INTO _disclosure_id, _holder
    FROM public.sp_share_sessions ss
    JOIN public.sp_disclosures x ON x.id = ss.disclosure_id
   WHERE ss.session_hash = encode(sha256(convert_to(_share_session, 'UTF8')), 'hex')
     AND ss.expires_at >= now()
     AND x.application_id IS NULL
     AND x.revoked_at IS NULL
     AND (x.expires_at IS NULL OR x.expires_at >= now());
  IF NOT FOUND THEN
    RETURN jsonb_build_object('items', '[]'::jsonb);
  END IF;

  SELECT jsonb_agg(public.vsd_disclosed_statement(d) ORDER BY d.declaration_kind, d.jurisdiction)
    INTO _items
    FROM public.vsd_disclosure_selections s
    JOIN public.vsd_declarations d ON d.id = s.declaration_id
   WHERE s.disclosure_id = _disclosure_id AND public.vsd_selection_disclosable(s);
  IF _items IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb);
  END IF;

  -- The holder looking at their own link is not a disclosure.
  IF _uid <> _holder THEN
    INSERT INTO public.vsd_disclosure_accesses (selection_id, recipient_user_id)
    SELECT s.id, _uid FROM public.vsd_disclosure_selections s
     WHERE s.disclosure_id = _disclosure_id AND public.vsd_selection_disclosable(s);
  END IF;
  RETURN jsonb_build_object('audience', 'signed_in_recipient', 'items', _items);
END $$;
REVOKE ALL ON FUNCTION public.vsd_read_disclosed(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_read_disclosed(text) TO authenticated;

COMMENT ON TABLE public.vsd_declarations IS
  'A holder''s own affirmation of one fixed, versioned statement. Private to the holder; read and '
  'written only through the vsd_ functions. Not a credential, not verification. Shown to anyone '
  'else only through vsd_read_disclosed, for a statement the holder attached to one Passport link, '
  'under a current disclosure authorization, to a signed-in recipient.';

-- ── Postflight ──────────────────────────────────────────────────────────

DO $$
DECLARE _t text; _f record;
BEGIN
  FOREACH _t IN ARRAY ARRAY['vsd_disclosure_authorizations', 'vsd_disclosure_selections',
                            'vsd_disclosure_accesses'] LOOP
    IF has_table_privilege('anon', 'public.' || _t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
       OR has_table_privilege('authenticated', 'public.' || _t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
       OR has_table_privilege('service_role', 'public.' || _t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'VSD_DISCLOSURE_POSTFLIGHT: a client role holds a privilege on %.', _t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || _t)::regclass) THEN
      RAISE EXCEPTION 'VSD_DISCLOSURE_POSTFLIGHT: row level security is off on %.', _t;
    END IF;
  END LOOP;

  FOR _f IN SELECT p.oid, p.proname FROM pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'vsd\_%' LOOP
    IF has_function_privilege('anon', _f.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'VSD_DISCLOSURE_POSTFLIGHT: anon can execute %.', _f.proname;
    END IF;
  END LOOP;
  IF has_function_privilege('service_role', 'public.vsd_read_disclosed(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VSD_DISCLOSURE_POSTFLIGHT: the service role can read a disclosed statement.';
  END IF;

  -- Nothing is authorized by installing this.
  IF EXISTS (SELECT 1 FROM public.vsd_disclosure_authorizations) THEN
    RAISE EXCEPTION 'VSD_DISCLOSURE_POSTFLIGHT: this migration must not record an authorization.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
