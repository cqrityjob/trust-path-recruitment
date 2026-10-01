/**
 * Negative controls for the Security Passport Network guard
 * (scripts/passport-network-stats-check.tsx).
 *
 * Each mutation plants one defect the guard exists for: counting page views as
 * Passports, counting staff, a privacy threshold below five, a table opened to
 * the public, a per-market count in the response, geolocation, polling, a
 * hidden payload that still draws, a ranking headline, a market ordering by
 * size, a layout that cannot stack at 390px.
 *
 * Run: bun run negative-controls:passport-network-stats
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "passport-network-stats:check";
const MIG = "supabase/migrations/20261227090000_sp_network_statistics.sql";
const LIB = "src/lib/public-stats/passport-network.ts";
const COMP = "src/components/site/SecurityPassportNetwork.tsx";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "NET-NC-COUNT-EVERY-ROW",
    defect: "a Passport is any profile row, so merely opening /passport counts",
    file: MIG,
    find: "WHERE pr.onboarding_state = 'completed'",
    replace: "WHERE pr.onboarding_state IS NOT NULL",
    guard: GUARD,
    expect: "N1.1 a Passport is a COMPLETED profile",
  },
  {
    id: "NET-NC-COUNT-STAFF",
    defect: "staff accounts are counted as adoption",
    file: MIG,
    find: "AND NOT EXISTS (SELECT 1 FROM public.user_roles r",
    replace: "AND TRUE OR EXISTS (SELECT 1 FROM public.user_roles r",
    guard: GUARD,
    expect: "N1.3 staff accounts (user_roles) are never counted",
  },
  {
    id: "NET-NC-COUNT-DRAFT-CREDENTIALS",
    defect: "revoked and withdrawn credentials are counted as represented",
    file: MIG,
    find: "WHERE cl.lifecycle_state = 'active'",
    replace: "WHERE cl.lifecycle_state <> 'draft'",
    guard: GUARD,
    expect: "N1.5 credentials are ACTIVE claims only",
  },
  {
    id: "NET-NC-THRESHOLD-ONE",
    defect: "the privacy threshold can be set to 1, exposing single-person markets",
    file: MIG,
    find: "CHECK (min_group_size >= 5)",
    replace: "CHECK (min_group_size >= 1)",
    guard: GUARD,
    expect: "N1.8 the threshold defaults to 5 and cannot be set below 5",
  },
  {
    id: "NET-NC-OPEN-PASSPORT-TABLE",
    defect: "the public role is granted SELECT on the Passport profiles to build the statistic",
    file: MIG,
    find: "REVOKE ALL ON TABLE public.sp_statistics_exclusions FROM PUBLIC, anon, authenticated;",
    replace: "GRANT SELECT ON TABLE public.sp_passport_profiles TO anon;",
    guard: GUARD,
    expect: "N2.3 no table privilege is granted on a Passport table",
  },
  {
    id: "NET-NC-WEAKEN-RLS",
    defect: "the migration adds a permissive policy on a private table",
    file: MIG,
    find: "ALTER TABLE public.sp_network_stats_policy ENABLE ROW LEVEL SECURITY;",
    replace:
      "ALTER TABLE public.sp_network_stats_policy ENABLE ROW LEVEL SECURITY;\nCREATE POLICY open_read ON public.sp_network_stats_policy FOR SELECT USING (true);",
    guard: GUARD,
    expect: "N2.1 the migration adds no policy",
  },
  {
    id: "NET-NC-LEAK-HOLDER-ID",
    defect: "the response carries a holder identifier",
    file: MIG,
    find: "'otherMarkets', _other",
    replace:
      "'otherMarkets', _other,\n    'holder_user_id', (SELECT min(holder_user_id::text) FROM public.sp_passport_profiles)",
    guard: GUARD,
    expect: "N3.2 exactly the approved keys",
  },
  {
    id: "NET-NC-MARKETS-BY-SIZE",
    defect: "markets are ordered by how many Passports they hold — an implicit ranking",
    file: MIG,
    find: "jsonb_agg(m.code ORDER BY m.code)",
    replace: "jsonb_agg(m.code ORDER BY m.n DESC)",
    guard: GUARD,
    expect: "N1.12 markets are ordered by code, never by size",
  },
  {
    id: "NET-NC-GEOLOCATE",
    defect: "the browser asks for the visitor's location",
    file: LIB,
    find: "const LOCALE = ",
    replace: "const GEO = navigator.geolocation;\nconst LOCALE = ",
    guard: GUARD,
    expect: "N4 no geolocation in src/lib/public-stats/passport-network.ts",
  },
  {
    id: "NET-NC-POLLING",
    defect: "the statistic is polled every second",
    file: LIB,
    find: "  retry: false,\n} as const;",
    replace: "  retry: false,\n  refetchInterval: 1000,\n} as const;",
    guard: GUARD,
    expect: "N8.6 no realtime, polling or timers",
  },
  {
    id: "NET-NC-HIDDEN-STILL-DRAWS",
    defect: "a hidden payload is parsed as if the owner had published it",
    file: LIB,
    find: 'if (r.display !== "passport_page" && r.display !== "public") return null;',
    replace: "if (r.display === undefined) return null;",
    guard: GUARD,
    expect: "N5.1 hidden → nothing, even if numbers are attached",
  },
  {
    id: "NET-NC-RANKING-HEADLINE",
    defect: "the headline turns growth into a ranking",
    file: "src/i18n/dictionaries.ts",
    find: '"network.title": "One Security Passport. A growing security community.",',
    replace: '"network.title": "#1 security community",',
    guard: GUARD,
    expect: "N7.6 no ranking or leaderboard language",
  },
  {
    id: "NET-NC-MOBILE-NO-STACK",
    defect: "the two figures never stack, so they overflow a 390px screen",
    file: COMP,
    find: "flex-col items-center justify-center gap-8 sm:flex-row sm:gap-16",
    replace: "flex-row items-center justify-center gap-8 sm:gap-16",
    guard: GUARD,
    expect: "N10.1 the figures stack below the sm breakpoint",
  },
  {
    id: "NET-NC-HOMEPAGE-BEFORE-PASSPORT",
    defect: "the band is moved above the Passport entry band",
    file: "src/routes/index.tsx",
    find: "      <HomeHero />\n      <HomeForIndividuals />\n",
    replace:
      '      <HomeHero />\n      <SecurityPassportNetwork surface="homepage" />\n      <HomeForIndividuals />\n',
    guard: GUARD,
    expect: "N8.2 placed directly after the Passport entry band",
  },
];

runControls("passport-network-stats", MUTATIONS);
