-- =============================================================================
-- Security Passport Network -- public, aggregate, privacy-safe growth statistics
-- =============================================================================
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────
--
-- ONE function a signed-out visitor may call, sp_network_stats(), returning
-- ONE small jsonb document of approved aggregates. Nothing else is opened:
-- no table gains a policy, no client role gains a table privilege, and
-- sp_passport_profiles / sp_claims keep exactly the RLS they had.
--
--   private Passport data -> sp_network_stats() -> homepage / Passport page
--
-- ── THE DEFINITIONS (audited against production 2026-10-01) ─────────────
--
-- A "Security Passport created" is ONE HOLDER who has finished creating it:
--
--   sp_passport_profiles.onboarding_state = 'completed'
--   AND declared_accurate_at IS NOT NULL
--   AND the holder is not a staff account          (no user_roles row)
--   AND the holder is not on sp_statistics_exclusions
--
-- Why that and not "a row exists": ensureMyPassport() INSERTs the profile row
-- the first time anybody opens /passport, before they have entered anything,
-- so the row count is "people who looked", not "Passports created". The row
-- is keyed by holder_user_id (a PRIMARY KEY), so one person is at most one
-- row, and 'completed' is a one-way door (the draft-save guard never reopens
-- it, and the CHECK sp_profile_completed_has_declaration requires the
-- holder's own truthfulness declaration). Consequently the number is not
-- moved by page loads, shares, edits, credential additions, corrections,
-- sessions or duplicates, and create/delete/recreate cannot count twice
-- (one auth user = one row; deleting the account deletes the row).
--
-- "Credentials represented" is the number of sp_claims rows whose
-- lifecycle_state = 'active' held by a counted holder. A correction creates a
-- new active row and moves the old one to 'superseded' in one statement, so
-- editing never adds one. draft, expired, revoked, superseded, disputed and
-- withdrawn are not counted. A holder who is not counted contributes none.
--
-- "Markets": the country in which the holder SAYS they work --
-- sp_passport_profiles.jurisdiction_code, and ONLY where
-- work_location_confirmed_at IS NOT NULL (the holder was shown the choice and
-- made it). Never IP, never a name, never a credential's jurisdiction.
-- A market is listed only when at least min_group_size counted holders
-- confirmed it. Everything smaller is "Other markets", reported as a boolean
-- -- NO per-market count is ever returned, so there is nothing to subtract,
-- compare or rank, and the size of a hidden group cannot be reconstructed.
-- A holder with no confirmed country is simply not placed in any market.
--
-- ── TEST / DEMO DATA ────────────────────────────────────────────────────
--
-- The data model had no marker for it. Production audit: 4 profile rows, 2
-- completed, and BOTH completed Passports belong to platform-staff accounts.
-- The rule is therefore deterministic and lives in the database:
--   * any account holding a user_roles row (superadmin, admin, content_editor,
--     assessment_editor, support, passport_verifier) is never counted; and
--   * any other test/UAT/demo account is listed once, by the owner, in the
--     private table sp_statistics_exclusions (no frontend list exists).
--
-- ── PUBLICATION CONTROL ─────────────────────────────────────────────────
--
-- sp_network_stats_policy is a single row, same shape as cd_access_policy:
--   hidden        (the seeded state) the function returns {"display":"hidden"}
--                 and NO number at all. The capability exists; nothing shows.
--   passport_page the public Security Passport information page may show it.
--   public        the homepage may show it as well.
-- A missing row reads as hidden (fails closed).
--
-- min_group_size is owner-adjustable but cannot go below 5.
--
-- Rollback: supabase/rollback/20261227090000_sp_network_statistics_rollback.sql
-- =============================================================================

CREATE TABLE public.sp_network_stats_policy (
  singleton      boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  display        text NOT NULL DEFAULT 'hidden'
                 CHECK (display IN ('hidden', 'passport_page', 'public')),
  min_group_size integer NOT NULL DEFAULT 5 CHECK (min_group_size >= 5),
  note           text CHECK (note IS NULL OR char_length(note) <= 500),
  changed_by     uuid,
  changed_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sp_network_stats_policy IS
  'Security Passport Network publication control. hidden = the statistics '
  'function returns no number; passport_page = the public Passport page may '
  'show it; public = the homepage may too. min_group_size (>= 5) is the '
  'smallest market a public response may name. Read via sp_network_stats(), '
  'changed via sp_set_network_stats_display() by a platform admin.';

ALTER TABLE public.sp_network_stats_policy ENABLE ROW LEVEL SECURITY;
-- No policy: client roles never touch the row. The hosted project grants new
-- tables to client roles by default, so revoke explicitly.
REVOKE ALL ON TABLE public.sp_network_stats_policy FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.sp_network_stats_policy TO service_role;

INSERT INTO public.sp_network_stats_policy (singleton, display, note)
VALUES (true, 'hidden',
        'Seeded hidden by 20261227090000. Showing the statistics is an owner action: sp_set_network_stats_display(...).');

-- ── Accounts that must not count as adoption ───────────────────────────
CREATE TABLE public.sp_statistics_exclusions (
  holder_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason         text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 200),
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sp_statistics_exclusions IS
  'Test, UAT and demo accounts that must not inflate the public Security '
  'Passport Network statistics. Maintained by the owner in the SQL editor; '
  'no application surface reads or writes it. Staff accounts (user_roles) are '
  'excluded without being listed here.';

ALTER TABLE public.sp_statistics_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sp_statistics_exclusions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.sp_statistics_exclusions TO service_role;

-- ── The ONE public read ────────────────────────────────────────────────
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
     WHERE pr.onboarding_state = 'completed'
       AND pr.declared_accurate_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.user_roles r
                        WHERE r.user_id = pr.holder_user_id)
       AND NOT EXISTS (SELECT 1 FROM public.sp_statistics_exclusions x
                        WHERE x.holder_user_id = pr.holder_user_id)
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

COMMENT ON FUNCTION public.sp_network_stats() IS
  'The only public read of Security Passport growth. Aggregates only: '
  'passports (completed, declared, non-staff, non-excluded holders), '
  'credentials (their active claims), the markets with at least '
  'min_group_size holders as ISO codes, and whether smaller markets exist. '
  'Returns {"display":"hidden"} and no number until the owner publishes. '
  'No per-market count, id, name, timestamp or row is ever returned.';
REVOKE ALL ON FUNCTION public.sp_network_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sp_network_stats() TO anon, authenticated, service_role;

-- ── The change: platform admins only, one row, one audit stamp ─────────
CREATE OR REPLACE FUNCTION public.sp_set_network_stats_display(
  _display text, _note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'SP_STATS_REQUIRES_ADMIN: only a platform administrator may change what the network statistics publish';
  END IF;
  IF _display IS NULL OR _display NOT IN ('hidden', 'passport_page', 'public') THEN
    RAISE EXCEPTION 'SP_STATS_BAD_DISPLAY: % is not hidden, passport_page or public', _display;
  END IF;
  UPDATE public.sp_network_stats_policy
     SET display = _display, note = _note,
         changed_by = auth.uid(), changed_at = now()
   WHERE singleton;
  RETURN _display;
END;
$$;
REVOKE ALL ON FUNCTION public.sp_set_network_stats_display(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_set_network_stats_display(text, text) TO authenticated, service_role;
