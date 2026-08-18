-- Phase 0C trust findings: least privilege for proprietary calibration data.
--
-- Privilege changes only. No Career Discovery scoring, content, item, weight,
-- axis loading value or stored result is altered by this migration.
--
-- ── THE FINDING ────────────────────────────────────────────────────────
--
-- 20260730090000_career_discovery_v3_1_schema.sql granted SELECT to
-- `authenticated`, with a `USING (true)` read policy, on both
-- public.cd_option_loadings and public.cd_profession_profiles. Any account
-- that can sign up -- which is anyone -- could page the complete option→axis
-- loading matrix and every profession target profile ever authored.
--
-- That is the Career Discovery equivalent of the exposure already closed on
-- the Security Competency side, where scoring versions and role weights were
-- restricted to authoring roles (docs/assessment/governance/trust-boundary-
-- and-scoring-visibility.md, decision LOW-4).
--
-- ── WHY ONLY ONE OF THE TWO IS CLOSED HERE ─────────────────────────────
--
-- cd_option_loadings has NO application reader. The engine scores from
-- src/lib/career-discovery/v31/option-matrix.ts; the table is a mirror kept in
-- step by a guard script that runs as service_role. Verified by grep across
-- src/: the only occurrences are a type definition and two comments. Revoking
-- it removes a grant nothing uses.
--
-- cd_profession_profiles is DIFFERENT and is deliberately left alone. The
-- product reads it through public.cd_profession_profiles_current, and that
-- view is declared `WITH (security_invoker = true)`. A security_invoker view
-- resolves permissions as the CALLING user, so revoking the base-table grant
-- from `authenticated` would break profession matching for every signed-in
-- candidate. Closing that exposure requires either flipping the view to
-- definer semantics or narrowing its row policy to the current active band --
-- both of which change a Career Discovery object that the owner has frozen.
--
-- The prepared SQL for that decision is held, unapplied, in
-- docs/technical/phase-0c-canonical-baseline-repair.md. It is an owner
-- decision, not an engineering one, and inventing it here would be exactly the
-- silent change to a frozen product this repair exists to prevent.
--
-- Forward-only. Remediation for each statement is the corresponding GRANT.

-- ---------------------------------------------------------------------------
-- 1. cd_option_loadings: proprietary calibration, no application reader
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cd_option_loadings_read ON public.cd_option_loadings;

REVOKE SELECT ON public.cd_option_loadings FROM authenticated;
REVOKE ALL     ON public.cd_option_loadings FROM anon;

GRANT ALL ON public.cd_option_loadings TO service_role;

COMMENT ON TABLE public.cd_option_loadings IS
  'Career Discovery option→axis loading matrix. Proprietary calibration data: '
  'no grant to anon or authenticated. The product scores from the TypeScript '
  'matrix (src/lib/career-discovery/v31/option-matrix.ts); this table is the '
  'mirrored source of truth the guard script compares against, read as '
  'service_role.';

-- ---------------------------------------------------------------------------
-- 2. cd_profession_profiles: exposure recorded, NOT closed here
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.cd_profession_profiles IS
  'Career Discovery profession target profiles, every authored version. '
  'KNOWN EXPOSURE: readable by any authenticated account. Not closed in the '
  'Phase 0C repair because cd_profession_profiles_current is a security_invoker '
  'view and revoking the base grant would break signed-in profession matching. '
  'Owner decision pending -- see docs/technical/phase-0c-canonical-baseline-repair.md.';

-- ---------------------------------------------------------------------------
-- 3. Authored prompt library is not anonymous content
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.scp_followup_prompts') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.scp_followup_prompts FROM anon';
  END IF;
END $$;
