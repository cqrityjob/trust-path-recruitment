-- =============================================================================
-- Security Passport: the holder's number, the founder designation, the network
-- count's founder rule, and a separate PUBLIC social share
-- =============================================================================
--
-- Rollback: supabase/rollback/20270217090000_sp_passport_number_and_social_share_rollback.sql
--
-- ── THREE THINGS THAT ARE NOT THE SAME ──────────────────────────────────
--
--   * the holder's PASSPORT NUMBER   a stable label for one holder ("#1");
--   * the NETWORK COUNT              how many real holders qualify
--                                    (sp_network_stats().passports);
--   * a holder's score               not touched here: no score exists for a
--                                    Passport and none is created.
--
-- The number is never the count and the count is never derived from the
-- number. Reserving or assigning a number changes no statistic; the statistic
-- is computed from qualifying holders each time it is read.
--
-- ── 1 · THE NUMBER ──────────────────────────────────────────────────────
--
-- sp_passport_numbers: one row per numbered holder, a stable unique number.
--
--   * #1 is RESERVED. Only a row whose designation is 'founder' may hold it
--     (CHECK), and only sp_designate_founder() creates that row.
--   * Every other number comes from sp_passport_number_seq, which starts at 2,
--     never cycles and is never reset. A number is therefore never reused,
--     including after a holder's account is deleted; the gaps that leaves are
--     gaps in a label, not a member count, and nothing counts rows here.
--     A deleted holder's number is recorded in sp_passport_numbers_retired so
--     that even #1 cannot be handed out a second time.
--   * Assignment is atomic, unique and idempotent: a per-holder advisory lock
--     serialises the holder's own attempts, the primary key and the unique
--     number refuse a duplicate whatever the caller does, and a second call
--     returns the number the first one made.
--   * It happens on the database side, when a holder's profile becomes
--     completed AND carries the holder's own declaration (a trigger), and
--     lazily from sp_my_passport_number() for a holder who qualified later
--     (for example after an exclusion was lifted). No client code computes or
--     supplies a number.
--   * Who is numbered is the SAME rule that decides who counts (§3): completed,
--     declared, not on the exclusion list, and not a staff account other than
--     the founder. Test, demo and internal accounts therefore do not take
--     public numbers.
--
-- ── 2 · THE FOUNDER ─────────────────────────────────────────────────────
--
-- The founder designation is a server-held fact about ONE holder:
-- sp_designate_founder(holder) creates the row {number 1, designation
-- 'founder'}. It is executable by service_role only (the owner in the SQL
-- editor, or an operator), it refuses a signed-in caller outright, and it
-- checks that the target is a superadmin with a completed, declared Passport.
-- It is not reachable from a client, from user metadata, from a name match or
-- from an administrator role: holding a role designates nobody.
--
-- The identity is supplied by the operator at the moment of the call and is
-- deliberately NOT written into this file, so no account identifier or e-mail
-- address is committed to the repository.
--
-- "Grundare av CQrityjob" is a product designation of the holder, not a
-- credential, and nothing about it raises any merit's standing.
--
-- ── 3 · THE NETWORK COUNT: A NARROW FOUNDER RULE ────────────────────────
--
-- 20261227090000 excluded every account holding a user_roles row. The founder
-- holds one, and is the first real Passport. The rule is now:
--
--   completed + declared
--   AND NOT on sp_statistics_exclusions           (unchanged, still decisive)
--   AND ( holds no staff role  OR  is the designated founder )
--
-- so every OTHER admin or superadmin is still not counted, and the exclusion
-- list still removes any account, the founder included. The response shape of
-- sp_network_stats() is unchanged, and so is its fail-closed publication
-- control: nothing is published by this migration.
--
-- ── 4 · A SEPARATE PUBLIC SOCIAL SHARE ──────────────────────────────────
--
-- A private /p/<token> link is a bearer secret re-checked on every open and is
-- left exactly as it is. A social post is different: it is addressed to no one,
-- a platform fetches its preview image, and the platform keeps what it fetched.
-- That is a DIFFERENT, explicitly public act, so it gets its own structure:
--
--   sp_social_shares        a random PUBLIC id (not a secret, not a token, not
--                           derived from any private token, user id or e-mail),
--                           the pinned claims, a locale, an expiry, a revocation
--                           stamp and the PNG the holder previewed;
--   sp_get_social_share()   the one anon read: a bounded payload built from the
--                           holder's CURRENT rows (so the opened page shows the
--                           current standing of exactly the pinned credentials)
--                           and, on request, the PNG as base64.
--
-- What is public is a reduction of sp_selected_merits_payload: the holder's
-- label under their own privacy setting, work country, number and designation,
-- and per credential the title, taxonomy code, jurisdictions, expiry, assertion
-- and lifecycle (the inputs the shared trust engine needs to print the same
-- words as the card). Issuer names, issue dates, protected-object scopes,
-- employments, documents and the verifier's name never leave: a verifier is
-- reduced to 'CQrityjob' or 'external', which is all the engine branches on.
--
-- The PNG is the image the holder previewed and approved, rendered in the
-- browser from the same drawing as the preview (there is no server-side
-- renderer, and adding one is a cost and bundle decision). It is therefore
-- holder-supplied bytes: they are validated as a PNG of exactly 1200 x 630
-- and at most 900 kB, but their pixels are not re-derived. The page behind the
-- link, which IS derived from the database, is the authority, and the image is
-- described everywhere as a dated snapshot.
--
-- Expiry and revocation stop access at CQrityjob: the read answers the same
-- single 'unavailable' payload for an unknown id, an expired share and a
-- revoked one, and revocation deletes the stored image. Platforms may keep
-- what they already fetched; nothing here claims otherwise.
--
-- The migration publishes nothing and changes no existing table, policy or grant.
-- =============================================================================

-- ── 1 · The number ────────────────────────────────────────────────────────

CREATE SEQUENCE public.sp_passport_number_seq
  AS integer START WITH 2 MINVALUE 2 NO CYCLE;
REVOKE ALL ON SEQUENCE public.sp_passport_number_seq FROM PUBLIC, anon, authenticated;

CREATE TABLE public.sp_passport_numbers (
  holder_user_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  passport_number integer NOT NULL,
  designation     text,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sp_passport_numbers_number_unique UNIQUE (passport_number),
  CONSTRAINT sp_passport_numbers_positive CHECK (passport_number >= 1),
  CONSTRAINT sp_passport_numbers_designation_vocab
    CHECK (designation IS NULL OR designation = 'founder'),
  -- #1 is the founder's and the founder is #1: nobody else can hold it, and the
  -- founder cannot hold anything else.
  CONSTRAINT sp_passport_numbers_founder_is_one
    CHECK (coalesce(designation = 'founder', false) = (passport_number = 1))
);

COMMENT ON TABLE public.sp_passport_numbers IS
  'The holder''s Security Passport number. #1 is reserved for the designated '
  'founder; every other number comes from sp_passport_number_seq (from 2, never '
  'reused). Not a count of anything: gaps are normal.';

-- A deleted holder''s number is remembered, so no number -- #1 included -- is
-- ever issued twice.
CREATE TABLE public.sp_passport_numbers_retired (
  passport_number integer PRIMARY KEY CHECK (passport_number >= 1),
  retired_at      timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.sp_passport_numbers_retire()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.sp_passport_numbers_retired (passport_number)
  VALUES (OLD.passport_number)
  ON CONFLICT DO NOTHING;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.sp_passport_numbers_retire() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sp_passport_numbers_retire_trg
  BEFORE DELETE ON public.sp_passport_numbers
  FOR EACH ROW EXECUTE FUNCTION public.sp_passport_numbers_retire();

ALTER TABLE public.sp_passport_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_passport_numbers_retired ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sp_passport_numbers FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.sp_passport_numbers_retired FROM PUBLIC, anon, authenticated, service_role;
-- A holder reads their OWN number. Nothing writes through a client role.
GRANT SELECT ON public.sp_passport_numbers TO authenticated;
CREATE POLICY sp_passport_numbers_self_select ON public.sp_passport_numbers
  FOR SELECT TO authenticated USING (holder_user_id = auth.uid());
GRANT SELECT ON public.sp_passport_numbers, public.sp_passport_numbers_retired TO service_role;

-- ── 3 · Who qualifies (one definition, used by the count AND the number) ──

CREATE FUNCTION public.sp_network_counts_holder(_holder uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.sp_passport_profiles pr
            WHERE pr.holder_user_id = _holder
              AND pr.onboarding_state = 'completed'
              AND pr.declared_accurate_at IS NOT NULL)
     AND NOT EXISTS (
           SELECT 1 FROM public.sp_statistics_exclusions x
            WHERE x.holder_user_id = _holder)
     AND (NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _holder)
          OR EXISTS (SELECT 1 FROM public.sp_passport_numbers n
                      WHERE n.holder_user_id = _holder AND n.designation = 'founder'));
$$;
COMMENT ON FUNCTION public.sp_network_counts_holder(uuid) IS
  'Whether a holder counts as a real Security Passport and may be numbered: '
  'completed and declared, not excluded, and not a staff account unless the '
  'designated founder. Internal: not executable by any client role.';
REVOKE ALL ON FUNCTION public.sp_network_counts_holder(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_network_counts_holder(uuid) TO service_role;

-- ── 1 · Assigning the number: atomic, unique, idempotent ─────────────────

CREATE FUNCTION public.sp_assign_passport_number(_holder uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _n integer;
BEGIN
  IF _holder IS NULL THEN RETURN NULL; END IF;
  -- One holder's attempts are serialised; two holders never wait on each other.
  PERFORM pg_advisory_xact_lock(hashtextextended('sp_passport_number:' || _holder::text, 0));

  SELECT passport_number INTO _n FROM public.sp_passport_numbers
   WHERE holder_user_id = _holder;
  IF FOUND THEN RETURN _n; END IF;

  IF NOT public.sp_network_counts_holder(_holder) THEN RETURN NULL; END IF;

  -- nextval is atomic across sessions; the unique number is the backstop.
  _n := nextval('public.sp_passport_number_seq');
  INSERT INTO public.sp_passport_numbers (holder_user_id, passport_number)
  VALUES (_holder, _n);
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.sp_assign_passport_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_assign_passport_number(uuid) TO service_role;

CREATE FUNCTION public.sp_passport_number_on_complete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.sp_assign_passport_number(NEW.holder_user_id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sp_passport_number_on_complete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sp_passport_number_on_complete_trg
  AFTER INSERT OR UPDATE OF onboarding_state, declared_accurate_at
  ON public.sp_passport_profiles
  FOR EACH ROW
  WHEN (NEW.onboarding_state = 'completed' AND NEW.declared_accurate_at IS NOT NULL)
  EXECUTE FUNCTION public.sp_passport_number_on_complete();

-- The holder's own number, assigned now if they qualified since the trigger
-- last looked. Idempotent: reloading changes nothing.
CREATE FUNCTION public.sp_my_passport_number()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _n integer;
  _d text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _n := public.sp_assign_passport_number(auth.uid());
  IF _n IS NULL THEN
    RETURN jsonb_build_object('passport_number', NULL, 'designation', NULL);
  END IF;
  SELECT designation INTO _d FROM public.sp_passport_numbers WHERE holder_user_id = auth.uid();
  RETURN jsonb_build_object('passport_number', _n, 'designation', _d);
END;
$$;
REVOKE ALL ON FUNCTION public.sp_my_passport_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_my_passport_number() TO authenticated, service_role;

-- ── 2 · The founder designation (server-held, operator-supplied) ─────────

CREATE FUNCTION public.sp_designate_founder(_holder uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _existing public.sp_passport_numbers%ROWTYPE;
BEGIN
  -- A signed-in caller is refused outright, whatever grant it holds.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'SP_FOUNDER_OPERATOR_ONLY: the founder designation is not a client action.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _holder IS NULL THEN
    RAISE EXCEPTION 'SP_FOUNDER_HOLDER_REQUIRED' USING ERRCODE = 'null_value_not_allowed';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('sp_passport_number:' || _holder::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('sp_founder_designation', 0));

  SELECT * INTO _existing FROM public.sp_passport_numbers WHERE designation = 'founder';
  IF FOUND THEN
    IF _existing.holder_user_id = _holder THEN RETURN 1; END IF;
    RAISE EXCEPTION 'SP_FOUNDER_ALREADY_DESIGNATED: there is exactly one founder.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sp_passport_numbers_retired WHERE passport_number = 1) THEN
    RAISE EXCEPTION 'SP_FOUNDER_NUMBER_RETIRED: #1 has been used and is never reissued.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles r
                  WHERE r.user_id = _holder AND r.role = 'superadmin') THEN
    RAISE EXCEPTION 'SP_FOUNDER_NOT_SUPERADMIN: the founder is a superadmin account.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles pr
                  WHERE pr.holder_user_id = _holder
                    AND pr.onboarding_state = 'completed'
                    AND pr.declared_accurate_at IS NOT NULL) THEN
    RAISE EXCEPTION 'SP_FOUNDER_PASSPORT_INCOMPLETE: a completed, declared Passport is required.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sp_passport_numbers WHERE holder_user_id = _holder) THEN
    RAISE EXCEPTION 'SP_FOUNDER_ALREADY_NUMBERED: this holder already has another number.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.sp_passport_numbers (holder_user_id, passport_number, designation)
  VALUES (_holder, 1, 'founder');
  RETURN 1;
END;
$$;
COMMENT ON FUNCTION public.sp_designate_founder(uuid) IS
  'Operator-only: designates the ONE founder holder and gives them #1. Refuses '
  'a signed-in caller; requires a superadmin with a completed, declared Passport.';
REVOKE ALL ON FUNCTION public.sp_designate_founder(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_designate_founder(uuid) TO service_role;

-- Numbers for the holders who already qualify today, oldest declaration first.
-- Nobody else is touched, nothing is created for anyone, and a holder who is
-- staff or excluded gets no number.
DO $backfill$
DECLARE
  _h uuid;
BEGIN
  FOR _h IN
    SELECT pr.holder_user_id FROM public.sp_passport_profiles pr
     WHERE pr.onboarding_state = 'completed' AND pr.declared_accurate_at IS NOT NULL
     ORDER BY pr.declared_accurate_at, pr.created_at, pr.holder_user_id
  LOOP
    PERFORM public.sp_assign_passport_number(_h);
  END LOOP;
END
$backfill$;

-- ── 3 · The network count, with the narrow founder rule ───────────────────
-- Same response shape and the same fail-closed publication control as
-- 20261227090000; only WHO qualifies changed (sp_network_counts_holder).

CREATE OR REPLACE FUNCTION public.sp_network_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _display   text;
  _min       integer;
  _passports integer;
  _creds     integer;
  _markets   jsonb;
  _other     boolean;
BEGIN
  SELECT p.display, p.min_group_size INTO _display, _min
    FROM public.sp_network_stats_policy p WHERE p.singleton;

  -- Fails closed: no row, or hidden, publishes nothing -- not even zero.
  IF _display IS NULL OR _display = 'hidden' THEN
    RETURN jsonb_build_object('display', 'hidden');
  END IF;
  _min := greatest(coalesce(_min, 5), 5);

  WITH counted AS (
    SELECT pr.holder_user_id, pr.jurisdiction_code, pr.work_location_confirmed_at
      FROM public.sp_passport_profiles pr
     WHERE public.sp_network_counts_holder(pr.holder_user_id)
  ),
  by_market AS (
    SELECT c.jurisdiction_code AS code, count(*) AS n
      FROM counted c
     WHERE c.work_location_confirmed_at IS NOT NULL
       AND c.jurisdiction_code IS NOT NULL
     GROUP BY c.jurisdiction_code
  )
  SELECT
    (SELECT count(*) FROM counted),
    (SELECT count(*) FROM public.sp_claims cl
      WHERE cl.lifecycle_state = 'active'
        AND EXISTS (SELECT 1 FROM counted c WHERE c.holder_user_id = cl.holder_user_id)),
    -- Alphabetical by code: an order that carries no size information.
    coalesce((SELECT jsonb_agg(m.code ORDER BY m.code) FROM by_market m WHERE m.n >= _min),
             '[]'::jsonb),
    EXISTS (SELECT 1 FROM by_market m WHERE m.n < _min)
  INTO _passports, _creds, _markets, _other;

  RETURN jsonb_build_object(
    'display',     _display,
    'passports',   _passports,
    'credentials', _creds,
    'markets',     _markets,
    'otherMarkets', _other
  );
END;
$$;

-- ── 4 · The public social share ───────────────────────────────────────────

CREATE TABLE public.sp_social_shares (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 144 random bits, URL-safe. A PUBLIC identifier, not a secret and not a
  -- token: it opens only the bounded public payload, never a private link.
  public_id           text NOT NULL UNIQUE CHECK (public_id ~ '^[A-Za-z0-9_-]{24}$'),
  holder_user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  locale              text NOT NULL CHECK (locale IN ('sv', 'en')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  revoked_at          timestamptz,
  image_png           bytea,
  image_sha256        text,
  request_key         uuid NOT NULL,
  request_fingerprint text NOT NULL,
  CONSTRAINT sp_social_shares_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT sp_social_shares_image_bounded
    CHECK (image_png IS NULL OR octet_length(image_png) BETWEEN 100 AND 900000),
  CONSTRAINT sp_social_shares_request_unique UNIQUE (holder_user_id, request_key)
);
COMMENT ON TABLE public.sp_social_shares IS
  'An explicitly PUBLIC social share: a random public id, the pinned credentials '
  '(sp_social_share_items), an expiry, a revocation stamp and the PNG the holder '
  'previewed. Separate from the private, token-based sp_disclosures.';

CREATE TABLE public.sp_social_share_items (
  share_id uuid NOT NULL REFERENCES public.sp_social_shares(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES public.sp_claims(id) ON DELETE CASCADE,
  PRIMARY KEY (share_id, claim_id)
);

CREATE INDEX sp_social_shares_holder_idx ON public.sp_social_shares (holder_user_id, created_at DESC);

ALTER TABLE public.sp_social_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_social_share_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sp_social_shares FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.sp_social_share_items FROM PUBLIC, anon, authenticated, service_role;
-- A holder reads their own share METADATA. The stored image is never readable
-- through a table grant.
GRANT SELECT (id, public_id, holder_user_id, locale, created_at, expires_at, revoked_at)
  ON public.sp_social_shares TO authenticated;
CREATE POLICY sp_social_shares_self_select ON public.sp_social_shares
  FOR SELECT TO authenticated USING (holder_user_id = auth.uid());
GRANT SELECT ON public.sp_social_shares, public.sp_social_share_items TO service_role;

-- The create path: the server pins the holder's OWN current, unexpired
-- credentials; it never accepts a payload from the client.
CREATE FUNCTION public.sp_create_social_share(
  _claim_ids uuid[], _locale text, _expires_days integer, _image_base64 text, _request_key uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  _uid uuid := auth.uid();
  _c uuid[];
  _png bytea;
  _sha text;
  _fp text;
  _existing public.sp_social_shares%ROWTYPE;
  _id uuid;
  _public text;
  _expires timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _request_key IS NULL THEN
    RAISE EXCEPTION 'SP_REQUEST_KEY_REQUIRED: every create must name the attempt it belongs to.'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public.sp_assert_share_inputs(_expires_days, _locale, NULL, NULL);

  IF coalesce(cardinality(_claim_ids), 0) > 200 THEN
    RAISE EXCEPTION 'SP_TOO_MANY_MERITS' USING ERRCODE = 'check_violation';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
    INTO _c FROM unnest(coalesce(_claim_ids, '{}'::uuid[])) AS x;
  IF cardinality(_c) = 0 THEN
    RAISE EXCEPTION 'SP_NOTHING_SELECTED: choose at least one current credential.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The image: a PNG, exactly the previewed size, bounded.
  IF _image_base64 IS NULL OR length(_image_base64) > 1300000 THEN
    RAISE EXCEPTION 'SP_SOCIAL_IMAGE_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  BEGIN
    _png := decode(_image_base64, 'base64');
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'SP_SOCIAL_IMAGE_INVALID' USING ERRCODE = 'check_violation';
  END;
  IF octet_length(_png) NOT BETWEEN 100 AND 900000
     OR substring(_png FROM 1 FOR 8) <> '\x89504e470d0a1a0a'::bytea
     OR substring(_png FROM 13 FOR 4) <> 'IHDR'::bytea
     OR get_byte(_png, 16) * 16777216 + get_byte(_png, 17) * 65536
          + get_byte(_png, 18) * 256 + get_byte(_png, 19) <> 1200
     OR get_byte(_png, 20) * 16777216 + get_byte(_png, 21) * 65536
          + get_byte(_png, 22) * 256 + get_byte(_png, 23) <> 630 THEN
    RAISE EXCEPTION 'SP_SOCIAL_IMAGE_INVALID: a 1200 x 630 PNG of at most 900 kB is required.'
      USING ERRCODE = 'check_violation';
  END IF;
  _sha := encode(digest(_png, 'sha256'), 'hex');

  _fp := encode(digest(
           _uid::text || '|' || array_to_string(_c, ',') || '|' || _locale || '|'
             || _expires_days::text || '|' || _sha, 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended('sp_social_share:' || _uid::text || ':' || _request_key::text, 0));

  SELECT * INTO _existing FROM public.sp_social_shares
   WHERE holder_user_id = _uid AND request_key = _request_key;
  IF FOUND THEN
    IF _existing.request_fingerprint IS DISTINCT FROM _fp THEN
      RAISE EXCEPTION 'SP_REQUEST_KEY_CONFLICT: this attempt already created a share with different contents.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN jsonb_build_object('status', 'already_created', 'public_id', _existing.public_id,
                              'created_at', _existing.created_at, 'expires_at', _existing.expires_at);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id = _uid) THEN
    RAISE EXCEPTION 'SP_NO_PASSPORT' USING ERRCODE = 'no_data_found';
  END IF;

  -- SECURITY DEFINER means RLS does not protect this function: this count IS
  -- the ownership boundary. Only the holder's own, current, unexpired
  -- credentials may be published.
  IF (SELECT count(*) FROM public.sp_claims c
       WHERE c.id = ANY(_c) AND c.holder_user_id = _uid
         AND c.lifecycle_state = 'active'
         AND (c.valid_until IS NULL OR c.valid_until >= current_date))
     <> cardinality(_c) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current credentials can be shared publicly.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A bound on what one holder keeps public at once.
  IF (SELECT count(*) FROM public.sp_social_shares s
       WHERE s.holder_user_id = _uid AND s.revoked_at IS NULL AND s.expires_at > now()) >= 25 THEN
    RAISE EXCEPTION 'SP_TOO_MANY_SOCIAL_SHARES: revoke an earlier public share first.'
      USING ERRCODE = 'check_violation';
  END IF;

  _expires := now() + (_expires_days || ' days')::interval;
  _public  := translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_');

  INSERT INTO public.sp_social_shares (
    public_id, holder_user_id, locale, expires_at, image_png, image_sha256,
    request_key, request_fingerprint)
  VALUES (_public, _uid, _locale, _expires, _png, _sha, _request_key, _fp)
  RETURNING id INTO _id;

  INSERT INTO public.sp_social_share_items (share_id, claim_id)
  SELECT _id, x FROM unnest(_c) AS x;

  INSERT INTO public.sp_passport_events (
    holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_uid, _uid, 'privacy_changed', 'profile', _id,
          -- COUNTS, never the public id and never a credential title.
          jsonb_build_object('action', 'social_share_created', 'claims', cardinality(_c)));

  RETURN jsonb_build_object('status', 'created', 'public_id', _public,
                            'created_at', now(), 'expires_at', _expires);
END;
$$;
REVOKE ALL ON FUNCTION public.sp_create_social_share(uuid[], text, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_create_social_share(uuid[], text, integer, text, uuid)
  TO authenticated, service_role;

CREATE FUNCTION public.sp_revoke_social_share(_public_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _row public.sp_social_shares%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _row FROM public.sp_social_shares
   WHERE public_id = _public_id AND holder_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    -- The same answer for a share that does not exist and one that is not
    -- yours: nobody learns which public ids exist.
    RAISE EXCEPTION 'SP_SOCIAL_SHARE_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF _row.revoked_at IS NULL THEN
    UPDATE public.sp_social_shares
       SET revoked_at = now(), image_png = NULL, image_sha256 = NULL
     WHERE id = _row.id;
    INSERT INTO public.sp_passport_events (
      holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
    VALUES (auth.uid(), auth.uid(), 'privacy_changed', 'profile', _row.id,
            jsonb_build_object('action', 'social_share_revoked'));
  END IF;
  RETURN jsonb_build_object('status', 'revoked');
END;
$$;
REVOKE ALL ON FUNCTION public.sp_revoke_social_share(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_revoke_social_share(text) TO authenticated, service_role;

CREATE FUNCTION public.sp_list_my_social_shares()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'public_id', s.public_id, 'locale', s.locale,
      'created_at', s.created_at, 'expires_at', s.expires_at, 'revoked_at', s.revoked_at,
      'status', CASE WHEN s.revoked_at IS NOT NULL THEN 'revoked'
                     WHEN s.expires_at <= now() THEN 'expired' ELSE 'active' END,
      'claims', (SELECT count(*) FROM public.sp_social_share_items i WHERE i.share_id = s.id))
      ORDER BY s.created_at DESC)
    FROM public.sp_social_shares s WHERE s.holder_user_id = auth.uid()), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.sp_list_my_social_shares() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_list_my_social_shares() TO authenticated, service_role;

-- THE ONE ANONYMOUS READ. The same single 'unavailable' payload answers an
-- unknown id, an expired share and a revoked one. Bounded: no private row, no
-- token, no user id, no e-mail, no issuer, no date of issue, no employment.
CREATE FUNCTION public.sp_get_social_share(_public_id text, _with_image boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  _s public.sp_social_shares%ROWTYPE;
  _p public.sp_passport_profiles%ROWTYPE;
  _n public.sp_passport_numbers%ROWTYPE;
  _out jsonb;
BEGIN
  IF _public_id IS NULL OR _public_id !~ '^[A-Za-z0-9_-]{24}$' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO _s FROM public.sp_social_shares
   WHERE public_id = _public_id AND revoked_at IS NULL AND expires_at > now();
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO _p FROM public.sp_passport_profiles WHERE holder_user_id = _s.holder_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO _n FROM public.sp_passport_numbers WHERE holder_user_id = _s.holder_user_id;

  _out := jsonb_build_object(
    'status', 'active',
    'locale', _s.locale,
    -- The date of the SNAPSHOT: the image was approved on this day.
    'snapshot_at', _s.created_at,
    'expires_at', _s.expires_at,
    'holder', CASE _p.privacy_mode
                WHEN 'anonymous' THEN NULL
                WHEN 'initials'  THEN regexp_replace(coalesce(_p.display_name,''), '(\S)\S*', '\1.', 'g')
                ELSE _p.display_name END,
    'privacy_mode', _p.privacy_mode,
    'jurisdiction', _p.jurisdiction_code,
    'passport_number', _n.passport_number,
    'designation', _n.designation,
    -- The holder's CURRENT rows for exactly the pinned credentials: a credential
    -- withdrawn or superseded since drops off, one that lapsed says so.
    'claims', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'key', 'c' || t.ord,
        'title', t.title,
        'credential_code', t.credential_code,
        'jurisdiction', t.jurisdiction_code,
        'sub_jurisdiction', t.sub_jurisdiction_code,
        'valid_until', t.valid_until,
        'assertion', t.assertion_level,
        'lifecycle', t.lifecycle_state,
        'verified_at', t.verified_at,
        -- The engine branches only on CQrityjob versus anyone else.
        'verifier_organisation', CASE
            WHEN t.verifier IS NULL THEN NULL
            WHEN lower(btrim(t.verifier)) = 'cqrityjob' THEN 'CQrityjob'
            ELSE 'external' END,
        'verification_method', t.verification_method) ORDER BY t.ord)
      FROM (
        SELECT c.*, row_number() OVER (ORDER BY c.issued_on DESC NULLS LAST, c.id) AS ord,
               (SELECT d2.decider_organisation
                  FROM public.sp_verification_decisions d2
                  JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                 WHERE r2.claim_id = c.id AND d2.decision = 'approved'
                 ORDER BY d2.decided_at DESC LIMIT 1) AS verifier,
               (SELECT d2.verification_method
                  FROM public.sp_verification_decisions d2
                  JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                 WHERE r2.claim_id = c.id AND d2.decision = 'approved'
                 ORDER BY d2.decided_at DESC LIMIT 1) AS verification_method
          FROM public.sp_claims c
          JOIN public.sp_social_share_items i ON i.claim_id = c.id AND i.share_id = _s.id
         WHERE c.holder_user_id = _s.holder_user_id AND c.lifecycle_state = 'active'
      ) t), '[]'::jsonb));

  IF coalesce(_with_image, false) AND _s.image_png IS NOT NULL THEN
    _out := _out || jsonb_build_object('image_png_base64', encode(_s.image_png, 'base64'));
  END IF;
  RETURN _out;
END;
$$;
COMMENT ON FUNCTION public.sp_get_social_share(text, boolean) IS
  'The one anonymous read of a public social share. One ''unavailable'' payload '
  'for unknown, expired and revoked. Returns the holder''s label under their own '
  'privacy setting, number, designation and the pinned credentials'' CURRENT '
  'standing; never an issuer, an issue date, an authorisation scope, an '
  'employment, a verifier name, a token, a user id or an e-mail address.';
REVOKE ALL ON FUNCTION public.sp_get_social_share(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sp_get_social_share(text, boolean)
  TO anon, authenticated, service_role;
