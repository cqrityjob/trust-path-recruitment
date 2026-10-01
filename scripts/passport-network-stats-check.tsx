// Security Passport Network — the guard.
//
//   N1  SQL CONTRACT: the counting rule, the staff/test exclusion, the privacy
//       threshold floor, the fail-closed publication control
//   N2  RLS UNCHANGED: the migration opens no Passport table — no policy, no
//       grant, no ALTER on sp_passport_profiles / sp_claims — and the two
//       private tables are revoked from every client role
//   N3  AGGREGATES ONLY: the one public function returns an allow-listed
//       document, no per-market count, no row-level field
//   N4  NO GEOLOCATION: no IP, header, browser-location or name inference
//   N5  PARSING: hidden / malformed / injected payloads draw nothing; unknown
//       keys are dropped
//   N6  FORMATTING: Swedish and English, large numbers, market names
//   N7  RENDER: populated, zero, one, large, unavailable — sv and en; metric
//       name + value as a term/definition pair; markets as text; no ranking
//   N8  WIRING: one call, one cache, no realtime, homepage + Passport page
//   N9  COPY: sv/en parity; the product name is not translated
//   N10 MOBILE (~390px): stacked, no fixed widths, no horizontal scroll
//
// The behavioural proof of N1–N3 against a real Postgres is
// tests/database/sp-network-stats/run.sh.
//
// Run: bun run passport-network-stats:check

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

await mock.module("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) =>
    React.createElement("a", { href: String(to ?? ""), ...rest }, children),
  createFileRoute: () => () => ({}),
}));
await mock.module("@/integrations/supabase/client", () => ({ supabase: { rpc: () => null } }));

const ROOT = path.join(import.meta.dir, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
let checks = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) failures.push(label);
}

const MIGRATION = "supabase/migrations/20261227090000_sp_network_statistics.sql";
const sql = read(MIGRATION);
/** SQL with line comments removed, so prose cannot satisfy or trip a rule. */
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

// ── N1 · SQL CONTRACT ──────────────────────────────────────────────────
ok(/onboarding_state\s*=\s*'completed'/.test(code), "N1.1 a Passport is a COMPLETED profile");
ok(/declared_accurate_at\s+IS\s+NOT\s+NULL/.test(code), "N1.2 …with the holder's own declaration");
ok(
  /NOT EXISTS \(SELECT 1 FROM public\.user_roles/.test(code),
  "N1.3 staff accounts (user_roles) are never counted",
);
ok(
  /NOT EXISTS \(SELECT 1 FROM public\.sp_statistics_exclusions/.test(code),
  "N1.4 listed test/demo accounts are never counted",
);
ok(/cl\.lifecycle_state\s*=\s*'active'/.test(code), "N1.5 credentials are ACTIVE claims only");
ok(
  /EXISTS \(SELECT 1 FROM counted c WHERE c\.holder_user_id = cl\.holder_user_id\)/.test(code),
  "N1.6 only a counted holder's credentials count",
);
ok(
  /work_location_confirmed_at IS NOT NULL/.test(code),
  "N1.7 a market is the country the HOLDER confirmed",
);
ok(
  /min_group_size\s+integer NOT NULL DEFAULT 5 CHECK \(min_group_size >= 5\)/.test(code),
  "N1.8 the threshold defaults to 5 and cannot be set below 5",
);
ok(/greatest\(coalesce\(_min, 5\), 5\)/.test(code), "N1.9 the function re-applies the floor");
ok(/DEFAULT 'hidden'/.test(code) && /VALUES \(true, 'hidden'/.test(code), "N1.10 seeded hidden");
ok(
  /_display IS NULL OR _display = 'hidden'[\s\S]{0,80}RETURN jsonb_build_object\('display', 'hidden'\)/.test(
    code,
  ),
  "N1.11 hidden / missing policy returns no number at all (fails closed)",
);
ok(/ORDER BY m\.code/.test(code), "N1.12 markets are ordered by code, never by size");
ok(!/ORDER BY[^;]*\b(n|count)\b[^;]*DESC/i.test(code), "N1.13 no ranking by size anywhere");

// ── N2 · RLS UNCHANGED ─────────────────────────────────────────────────
ok(!/CREATE POLICY|ALTER POLICY|DROP POLICY/i.test(code), "N2.1 the migration adds no policy");
ok(
  !/ALTER TABLE public\.(sp_passport_profiles|sp_claims|user_roles)/i.test(code),
  "N2.2 no Passport table is altered",
);
ok(
  !/GRANT\s+[A-Z, ]*(SELECT|ALL)[A-Z, ]*\s+ON\s+(TABLE\s+)?public\.(sp_passport_profiles|sp_claims)/i.test(
    code,
  ),
  "N2.3 no table privilege is granted on a Passport table",
);
ok(
  !/GRANT[^;]*\bON\s+(TABLE\s+)?public\.\w+[^;]*\bTO\b[^;]*\banon\b/i.test(code),
  "N2.4 anon is granted no table privilege",
);
for (const t of ["sp_network_stats_policy", "sp_statistics_exclusions"]) {
  ok(
    new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM PUBLIC, anon, authenticated`).test(code),
    `N2.5 ${t} is revoked from every client role`,
  );
  ok(
    new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`).test(code),
    `N2.6 ${t} has RLS enabled`,
  );
}
ok(
  /GRANT EXECUTE ON FUNCTION public\.sp_network_stats\(\) TO anon, authenticated, service_role/.test(
    code,
  ),
  "N2.7 anon may EXECUTE only the aggregate function",
);
ok(
  /REVOKE ALL ON FUNCTION public\.sp_set_network_stats_display\(text, text\) FROM PUBLIC, anon/.test(
    code,
  ) && /is_platform_admin\(auth\.uid\(\)\)/.test(code),
  "N2.8 the publication switch is admin-only",
);
ok(
  /SECURITY DEFINER SET search_path = public/.test(code),
  "N2.9 definer functions pin their search_path",
);

// ── N3 · AGGREGATES ONLY ───────────────────────────────────────────────
const buildObj = code.match(/RETURN jsonb_build_object\(\s*'display',\s*_display,[\s\S]*?\);/);
ok(!!buildObj, "N3.1 the response is one jsonb_build_object");
const keys = [...(buildObj?.[0].matchAll(/'(\w+)',/g) ?? [])].map((m) => m[1]);
ok(
  JSON.stringify(keys) ===
    JSON.stringify(["display", "passports", "credentials", "markets", "otherMarkets"]),
  `N3.2 exactly the approved keys (${keys.join(",")})`,
);
ok(
  !/holder_user_id|display_name|email|title|claimed_issuer|created_at|updated_at/.test(
    buildObj?.[0] ?? "",
  ),
  "N3.3 no holder, name, email, credential, company or timestamp in the response",
);
ok(
  /'otherMarkets', _other/.test(code) && /_other\s+boolean/.test(code),
  "N3.4 other markets is a boolean, not a count",
);
ok(/_markets\s+jsonb/.test(code) && /jsonb_agg\(m\.code/.test(code), "N3.5 markets are bare codes");

// ── N4 · NO GEOLOCATION ────────────────────────────────────────────────
const GEO =
  /geolocat|geoip|ip_address|inet_client_addr|x-forwarded|cf-ipcountry|navigator\.geolocation|ipapi|ipinfo|maxmind|timezone/i;
const SURFACES = [
  MIGRATION,
  "src/lib/security-passport/network-stats.ts",
  "src/components/security-passport/SecurityPassportNetwork.tsx",
];
for (const f of SURFACES)
  ok(
    !GEO.test(
      read(f)
        .replace(/--.*$/gm, "")
        .replace(/\/\/.*$/gm, ""),
    ),
    `N4 no geolocation in ${f}`,
  );
const fnBody = code.slice(
  code.indexOf("CREATE OR REPLACE FUNCTION public.sp_network_stats()"),
  code.indexOf("CREATE OR REPLACE FUNCTION public.sp_set_network_stats_display"),
);
ok(
  fnBody.length > 500 && !/auth\.users|raw_user_meta_data/.test(fnBody),
  "N4.1 the function never reads auth.users (no email or name inference)",
);
ok(
  !/sp_jurisdictions|sub_jurisdiction|jurisdiction_code\s+FROM public\.sp_claims|cl\.jurisdiction_code/.test(
    code,
  ),
  "N4.2 a credential's jurisdiction is never a holder's market",
);

// ── N5 · PARSING ───────────────────────────────────────────────────────
const lib = await import("../src/lib/security-passport/network-stats");
const GOOD = {
  display: "public",
  passports: 1247,
  credentials: 3841,
  markets: ["AE", "GB", "SE"],
  otherMarkets: true,
};
ok(
  lib.parseNetworkStats({ display: "hidden" }) === null &&
    lib.parseNetworkStats({ ...GOOD, display: "hidden" }) === null,
  "N5.1 hidden → nothing, even if numbers are attached",
);
ok(
  lib.parseNetworkStats(null) === null &&
    lib.parseNetworkStats("x") === null &&
    lib.parseNetworkStats([]) === null,
  "N5.2 malformed → nothing",
);
ok(lib.parseNetworkStats({ ...GOOD, passports: -1 }) === null, "N5.3 a negative count → nothing");
ok(
  lib.parseNetworkStats({ ...GOOD, passports: 1.5 }) === null,
  "N5.4 a fractional count → nothing",
);
ok(lib.parseNetworkStats({ ...GOOD, credentials: "9" }) === null, "N5.5 a string count → nothing");
ok(lib.parseNetworkStats({ display: "public" }) === null, "N5.6 missing numbers are never zero");
const dirty = lib.parseNetworkStats({
  ...GOOD,
  holder_user_id: "11111111-1111-1111-1111-111111111111",
  email: "a@b.c",
  markets: ["SE", "se", "Sweden", 7, "<script>"],
});
ok(
  !!dirty &&
    JSON.stringify(Object.keys(dirty).sort()) ===
      JSON.stringify(["credentials", "display", "markets", "otherMarkets", "passports"]),
  "N5.7 unknown keys are dropped",
);
ok(JSON.stringify(dirty?.markets) === '["SE"]', "N5.8 only well-formed ISO codes survive");
ok(
  lib.mayShowNetworkStats({ ...GOOD, display: "passport_page" } as never, "homepage") === false,
  "N5.9 passport_page does not open the homepage",
);
ok(
  lib.mayShowNetworkStats({ ...GOOD, display: "passport_page" } as never, "passport_page") === true,
  "N5.10 passport_page opens the Passport page",
);
ok(lib.mayShowNetworkStats(GOOD as never, "homepage") === true, "N5.11 public opens the homepage");
ok(
  lib.mayShowNetworkStats(null, "homepage") === false &&
    lib.mayShowNetworkStats(null, "passport_page") === false,
  "N5.12 unavailable opens nothing",
);

// ── N6 · FORMATTING ────────────────────────────────────────────────────
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");
ok(norm(lib.formatCount(1247, "en")) === "1,247", "N6.1 en: 1,247");
ok(norm(lib.formatCount(1247, "sv")) === "1 247", "N6.2 sv: 1 247");
ok(norm(lib.formatCount(1234567, "en")) === "1,234,567", "N6.3 en: a large number");
ok(norm(lib.formatCount(1234567, "sv")) === "1 234 567", "N6.4 sv: a large number");
ok(
  lib.marketName("SE", "sv") === "Sverige" && lib.marketName("SE", "en") === "Sweden",
  "N6.5 market names follow the language",
);
ok(lib.marketName("GB", "en") === "United Kingdom", "N6.6 United Kingdom");
ok(
  lib.marketName("ZZZZ", "en") === "ZZZZ" || typeof lib.marketName("ZZZZ", "en") === "string",
  "N6.7 an unknown code never throws",
);

// ── N7 · RENDER ────────────────────────────────────────────────────────
const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { SecurityPassportNetwork, SecurityPassportNetworkView } =
  await import("../src/components/security-passport/SecurityPassportNetwork");

function renderView(stats: unknown, lang: "sv" | "en", link = false): string {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider as never,
      { initialLang: lang } as never,
      React.createElement(SecurityPassportNetworkView as never, { stats, showLink: link } as never),
    ),
  );
}
function renderSurface(data: unknown, surface: "homepage" | "passport_page"): string {
  const qc = new QueryClient();
  qc.setQueryData(lib.NETWORK_STATS_QUERY.queryKey as never, data as never);
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(
        I18nProvider as never,
        { initialLang: "en" } as never,
        React.createElement(SecurityPassportNetwork as never, { surface } as never),
      ),
    ),
  );
}

const populated = lib.parseNetworkStats(GOOD)!;
const en = renderView(populated, "en", true);
const sv = renderView(populated, "sv", true);
ok(
  /<dt[^>]*>Security Passports created<\/dt>\s*<dd[^>]*>1,247<\/dd>/.test(en),
  "N7.1 en: name and value are one dt/dd pair",
);
ok(
  /<dt[^>]*>Credentials represented<\/dt>\s*<dd[^>]*>3,841<\/dd>/.test(en),
  "N7.2 en: credentials pair",
);
ok(
  /Growing across[\s\S]*United Arab Emirates · United Kingdom · Sweden · Other markets/.test(en),
  "N7.3 en: markets are text, alphabetical by code, ending in Other markets",
);
ok(
  /<dt[^>]*>Security Passport skapade<\/dt>/.test(sv) && /1[\u00a0\u202f ]247/.test(sv),
  "N7.4 sv: natural label, product name untouched, sv number",
);
ok(/Växer i/.test(sv) && /Övriga marknader/.test(sv), "N7.5 sv: market sentence");
ok(
  !/#\s?\d|\b(rank|ranking|leaderboard|top|first|1st)\b|nummer 1|\bplats \d/i.test(
    en.replace(/<[^>]+>/g, " ") + sv.replace(/<[^>]+>/g, " "),
  ),
  "N7.6 no ranking or leaderboard language",
);
ok(
  /<dl[\s>]/.test(en) && /aria-labelledby="passport-network-title"/.test(en),
  "N7.7 the figures are a labelled description list",
);
ok(
  !/<svg[^>]*>(?![\s\S]*aria-hidden)/.test(
    en.replace(/<svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>/g, ""),
  ),
  "N7.8 no unlabelled graphic carries meaning",
);
ok(
  !/\d+ (passports?|holders?|people)\b.*\b(Sweden|United)/i.test(en),
  "N7.9 no per-market number is printed",
);

const zero = renderView(
  lib.parseNetworkStats({
    display: "public",
    passports: 0,
    credentials: 0,
    markets: [],
    otherMarkets: false,
  }),
  "en",
);
ok(
  /<dd[^>]*>0<\/dd>/.test(zero) &&
    !/Credentials represented/.test(zero) &&
    !/Growing across/.test(zero),
  "N7.10 zero: the real 0, nothing invented beside it",
);
const one = renderView(
  lib.parseNetworkStats({
    display: "public",
    passports: 1,
    credentials: 3,
    markets: [],
    otherMarkets: true,
  }),
  "en",
);
ok(
  /<dt[^>]*>Security Passport created<\/dt>\s*<dd[^>]*>1<\/dd>/.test(one) &&
    /Credentials represented/.test(one),
  "N7.11 one: singular label, the real number",
);
ok(
  /Other markets/.test(one) && !/Growing across[^<]*<\/span>\s*<span[^>]*>\s*<\/span>/.test(one),
  "N7.12 only 'Other markets' when no market reaches the threshold",
);
const small = renderView(
  lib.parseNetworkStats({
    display: "public",
    passports: 7,
    credentials: 12,
    markets: ["SE"],
    otherMarkets: false,
  }),
  "en",
);
ok(/<dd[^>]*>7<\/dd>/.test(small), "N7.13 a small number is shown as it is");
const big = renderView(
  lib.parseNetworkStats({
    display: "public",
    passports: 1234567,
    credentials: 9876543,
    markets: [],
    otherMarkets: false,
  }),
  "sv",
);
ok(/1[\u00a0\u202f ]234[\u00a0\u202f ]567/.test(big), "N7.14 a large number formats");
ok(
  renderSurface(null, "homepage") === "" && renderSurface(null, "passport_page") === "",
  "N7.15 unavailable: the surface renders NOTHING (and does not throw)",
);
ok(renderSurface(undefined, "homepage") === "", "N7.16 not yet loaded: nothing");
ok(
  renderSurface(GOOD, "homepage").includes("data-passport-network"),
  "N7.17 public: the homepage draws it",
);
ok(
  renderSurface({ ...GOOD, display: "passport_page" }, "homepage") === "",
  "N7.18 passport_page-only: the homepage draws nothing",
);
ok(
  renderSurface({ ...GOOD, display: "passport_page" }, "passport_page").includes(
    "data-passport-network",
  ),
  "N7.19 passport_page: the Passport page draws it",
);
ok(
  !renderSurface(GOOD, "passport_page").includes('/security-passport"'),
  "N7.20 the Passport page does not link to itself",
);

// ── N8 · WIRING ────────────────────────────────────────────────────────
const index = read("src/routes/index.tsx");
const passportPage = read("src/routes/security-passport.index.tsx");
ok(
  /<SecurityPassportNetwork surface="homepage" \/>/.test(index),
  "N8.1 homepage uses the component",
);
ok(
  index.indexOf("<HomeForIndividuals />") < index.indexOf("<SecurityPassportNetwork") &&
    index.indexOf("<SecurityPassportNetwork") < index.indexOf("<HomeLatestJobs />"),
  "N8.2 placed directly after the Passport entry band, before the jobs",
);
ok(
  /<SecurityPassportNetwork surface="passport_page" \/>/.test(passportPage),
  "N8.3 the Passport page uses the component",
);
const allSrc = (await import("node:child_process"))
  .execSync("git ls-files -co --exclude-standard src", { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("types.ts"));
const callers = allSrc.filter((f) => /rpc\(\s*"sp_network_stats"/.test(read(f)));
ok(
  JSON.stringify(callers) === JSON.stringify(["src/lib/security-passport/network-stats.ts"]),
  `N8.4 exactly one caller of the aggregate (${callers.join(",")})`,
);
const libSrc = read("src/lib/security-passport/network-stats.ts");
ok(
  !/\.from\(/.test(libSrc + read("src/components/security-passport/SecurityPassportNetwork.tsx")),
  "N8.5 no table is read from the browser",
);
ok(
  !/\.channel\(|\.subscribe\(|postgres_changes|refetchInterval|setInterval/.test(
    libSrc + read("src/components/security-passport/SecurityPassportNetwork.tsx"),
  ),
  "N8.6 no realtime, polling or timers",
);
ok(/staleTime:\s*10 \* 60 \* 1000/.test(libSrc), "N8.7 cached for ten minutes");
ok(
  /useQuery\(NETWORK_STATS_QUERY\)/.test(
    read("src/components/security-passport/SecurityPassportNetwork.tsx"),
  ),
  "N8.8 both surfaces share one query key (one request per page view)",
);
ok(
  /Release control|publish/i.test(index),
  "N8.9 the homepage documents that it is publication-controlled",
);

// ── N9 · COPY ──────────────────────────────────────────────────────────
const KEYS = Object.keys(dictionaries.sv).filter((k) =>
  k.startsWith("network."),
) as (keyof typeof dictionaries.sv)[];
ok(KEYS.length >= 10, `N9.1 network copy exists (${KEYS.length} keys)`);
for (const k of KEYS) {
  const s = dictionaries.sv[k] as string;
  const e = (dictionaries.en as Record<string, string>)[k];
  ok(
    !!s && !!e && s.trim() !== "" && e.trim() !== "",
    `N9.2 ${k} exists and is non-empty in sv and en`,
  );
}
ok(
  /Security Passport/.test(dictionaries.sv["network.passports.label"]) &&
    /Security Passport/.test(dictionaries.en["network.passports.label" as never]),
  "N9.3 the product name is never translated",
);
ok(
  dictionaries.sv["network.passports.label"] !==
    (dictionaries.en as Record<string, string>)["network.passports.label"],
  "N9.4 the surrounding words are translated",
);
const allCopy = KEYS.map(
  (k) => `${dictionaries.sv[k]} ${(dictionaries.en as Record<string, string>)[k]}`,
).join(" ");
ok(
  !/\b(garanterad|guarantee|verified|verifierad|best|störst|largest|#1|leading)\b/i.test(allCopy),
  "N9.5 no superlative, guarantee or verification claim",
);

// ── N10 · MOBILE (~390px) ──────────────────────────────────────────────
const comp = read("src/components/security-passport/SecurityPassportNetwork.tsx");
ok(
  /flex-col items-center justify-center gap-8 sm:flex-row/.test(comp),
  "N10.1 the figures stack below the sm breakpoint",
);
ok(
  !/\bw-\[\d{3,}px\]|\bmin-w-\[\d{3,}px\]|\bwhitespace-nowrap\b|\boverflow-x-/.test(comp),
  "N10.2 no fixed wide width or nowrap that could overflow 390px",
);
ok(
  /text-\[2\.75rem\]/.test(comp) && /md:text-\[3\.25rem\]/.test(comp),
  "N10.3 the figure is sized for a narrow screen first",
);
ok(/min-h-11/.test(comp), "N10.4 the link keeps a 44px target");
ok(/text-balance/.test(comp) && /max-w-3xl/.test(comp), "N10.5 text wraps inside the container");

if (failures.length) {
  console.error(`passport-network-stats: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`passport-network-stats: all ${checks} checks passed`);
