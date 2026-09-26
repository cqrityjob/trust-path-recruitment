/**
 * India entry journey — the guard.
 *
 *   1. COPY: English and Swedish have the same keys, none empty, and neither
 *      makes a claim this journey may never make (guaranteed jobs, visas,
 *      sponsorship or verification; partners, counts, testimonials;
 *      "Dubai-ready" or any score; a personal PSARA licence; Hindi reading).
 *   2. NO OCR ON ARRIVAL: nothing reachable from the landing page, the setup
 *      or the destination checklist imports HAYAT's document reader, pdf.js or
 *      the OCR engine. Walked as a real import graph, not grepped per file.
 *   3. MIRRORS: the page's four qualifications, the destination vocabulary,
 *      relocation interest and the funnel names are exactly what the
 *      migrations define.
 *   4. ANALYTICS carries an event NAME and nothing else.
 *   5. REDIRECT: the sign-up intent passes safeReturnPath unchanged, and an
 *      off-site variant does not.
 *   6. BOUNDARIES: the setup has no nationality, immigration or right-to-work
 *      field; choosing a destination writes only job preferences; the form
 *      sends a version only when it belongs to the selected definition; a
 *      national qualification wears its country's flag, never a globe.
 *   7. DESTINATION CHECKLIST: SIRA's official page, "does not replace", no
 *      score, and the UK's Skilled Worker statement as GOV.UK states it.
 *
 * Run: bun run india-entry:check
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { indiaCopy, INDIA_ENTRY_SOURCES } from "../src/lib/india-entry/copy";
import { DESTINATIONS, RELOCATION_INTEREST } from "../src/lib/india-entry/destinations";
import { INDIA_FUNNEL_EVENTS } from "../src/lib/india-entry/analytics";
import { FUNNEL_EVENT_NAMES } from "../src/lib/career-discovery/v31-feedback.functions";
import { safeReturnPath } from "../src/lib/auth/safe-redirect";
import { resolveCredentialScope } from "../src/lib/security-passport/credential-shield";
import { deriveSetupStep } from "../src/lib/india-entry/setup-state";
import { credentialMark } from "../src/lib/security-passport/credentials";
import { langIntentFrom } from "../src/i18n/context";
import { formatExpiry } from "../src/lib/security-passport/format";
import { buildRecipientPresentation } from "../src/lib/security-passport/recipient-presentation";
import type { RecipientPayloadActive } from "../src/lib/security-passport/packages";

const ROOT = join(import.meta.dir, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
let checks = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) failures.push(label);
}

const LANDING = "src/routes/security-passport.india.tsx";
const SETUP = "src/routes/_authenticated.passport.start.tsx";
const CHECKLIST = "src/components/india-entry/DestinationChecklist.tsx";
const NEXT_STEPS = "src/components/india-entry/DestinationNextSteps.tsx";
const COPY = "src/lib/india-entry/copy.ts";
const ANALYTICS = "src/lib/india-entry/analytics.ts";
const SETUP_FNS = "src/lib/india-entry/setup.functions.ts";
const FORM = "src/components/security-passport/InternationalCredentialForm.tsx";
const RECIPIENT = "src/lib/security-passport/recipient-presentation.ts";
const M_INDIA = "supabase/migrations/20261214090000_sp_india_national_qualifications.sql";
const M_LOC = "supabase/migrations/20261215090000_candidate_location_and_destinations.sql";

// ── 1. Copy ──────────────────────────────────────────────────────────────
{
  const en = indiaCopy.en;
  const sv = indiaCopy.sv;
  const enKeys = Object.keys(en).sort();
  const svKeys = Object.keys(sv).sort();
  ok(
    enKeys.join("|") === svKeys.join("|"),
    "1.1 English and Swedish copy have exactly the same keys",
  );
  ok(
    [...Object.values(en), ...Object.values(sv)].every((v) => v.trim().length > 0),
    "1.2 no copy string is empty",
  );
  // Sentences that are ALLOWED to name a forbidden idea, because they deny it.
  const DENIALS = [
    /does not guarantee a job, a visa or a verification result/i,
    /garanterar inget jobb, inget visum och inget verifieringsresultat/i,
    /there is no personal “PSARA licence” to add/i,
    /det finns ingen personlig ”PSARA-licens” att lägga till/i,
    /A checklist, not a score/i,
    /En checklista, inte ett betyg/i,
    /It is not a visa, a work permit or a job offer/i,
    /Det är inte ett visum, ett arbetstillstånd eller ett jobberbjudande/i,
    /does not decide eligibility or immigration/i,
    /avgör inte behörighet eller migration/i,
    /listed as ineligible for the Skilled Worker visa/i,
    /som ej berättigade till Skilled Worker-visum/i,
  ];
  const FORBIDDEN: readonly [RegExp, string][] = [
    [/guarante/i, "a guarantee"],
    [/garant/i, "a guarantee (sv)"],
    [/\bpartner(?:s|ship|ed)?\b/i, "a partnership"],
    [/testimonial|recension/i, "a testimonial"],
    [/\b\d[\d,.\s]*\s*(?:candidates|employers|placements|kandidater|arbetsgivare)\b/i, "a count"],
    [/\bready\b|\bredo\b|readiness|beredskap/i, "readiness"],
    [/\bscore\b|\bbetyg\b|\bpoäng\b|\bpercent|procent/i, "a score"],
    [/\bhindi\b/i, "Hindi reading"],
    [/psara[- ]licen[cs]|psara-licens/i, "a personal PSARA licence"],
    [/sponsor(?!ing)|sponsr/i, "sponsorship"],
    // A visa may be NAMED as something to arrange with an employer; it may
    // never be offered, eased or promised. (Swedish "visa" means "show".)
    [
      /\bvisa\s+(?:support|assistance|help|guarantee|sponsorship|processing)|\b(?:get|obtain|secure|receive)\s+(?:a|your)\s+(?:work\s+)?visa\b|visumhjälp|visumstöd|\bfå\s+(?:ett\s+)?visum\b/i,
      "visa help",
    ],
  ];
  for (const [lang, table] of [
    ["en", en],
    ["sv", sv],
  ] as const) {
    for (const [key, raw] of Object.entries(table)) {
      let text = raw;
      for (const allowed of DENIALS) text = text.replace(allowed, "");
      for (const [pattern, what] of FORBIDDEN) {
        ok(!pattern.test(text), `1.3 ${lang}:${key} makes no claim of ${what}`);
      }
    }
  }
  const page = read(LANDING)
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  ok(
    !/["'`][^"'`]*\b(?:guarantee|partner|testimonial|Dubai-ready)\b[^"'`]*["'`]/i.test(page),
    "1.4 the landing page carries no literal claim outside the copy module",
  );
  ok(
    /data-india-example-label/.test(page) && /landing\.example\.caption/.test(page),
    "1.5 the example Passport is visibly labelled as an example and captioned as fictional",
  );
  ok(
    /state: "self_declared"/.test(page) && !/state: "verified"/.test(page),
    "1.6 no example credential is shown as verified",
  );
}

// ── 2. No OCR on arrival ─────────────────────────────────────────────────
{
  const OCR = [/pdfjs-dist/, /tesseract\.js/, /@tesseract\.js-data/, /hayat\/browser-reader/];
  const seen = new Set<string>();
  const offenders: string[] = [];
  const resolveImport = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
    else return null;
    for (const candidate of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      join(base, "index.ts"),
      join(base, "index.tsx"),
    ])
      if (existsSync(candidate) && !candidate.endsWith("/")) {
        try {
          readFileSync(candidate);
          return candidate;
        } catch {
          continue;
        }
      }
    return null;
  };
  const walk = (file: string, trail: string[]): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    // Static, side-effect-only and dynamic imports alike: a bare
    // `import "x";` still loads x, and a dynamic import is still a download.
    const specs = [
      ...src.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g),
      ...src.matchAll(/(?:^|[;\n])\s*import\s+["']([^"']+)["']/g),
      ...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    for (const spec of specs) {
      if (OCR.some((p) => p.test(spec)))
        offenders.push(`${[...trail, file.replace(ROOT + "/", "")].join(" → ")} → ${spec}`);
      const next = resolveImport(file, spec);
      if (next) walk(next, [...trail, file.replace(ROOT + "/", "")]);
    }
  };
  for (const entry of [LANDING, SETUP, CHECKLIST, NEXT_STEPS]) walk(join(ROOT, entry), []);
  ok(
    offenders.length === 0,
    `2.1 no OCR engine, pdf.js or HAYAT reader is reachable from the landing page, the setup or the checklist${offenders.length ? `: ${offenders[0]}` : ""}`,
  );
  ok(seen.size > 10, "2.2 the import walk actually followed the graph");
}

// ── 3. Mirrors ───────────────────────────────────────────────────────────
{
  const mIndia = read(M_INDIA);
  const mLoc = read(M_LOC);
  const page = read(LANDING);
  for (const [code, qp] of [
    ["IN_MEPSC_Q7101", "MEP/Q7101"],
    ["IN_MEPSC_Q7201", "MEP/Q7201"],
    ["IN_MEPSC_Q7104", "MEP/Q7104"],
    ["IN_MEPSC_Q7204", "MEP/Q7204"],
  ]) {
    ok(
      page.includes(`code: "${code}"`) &&
        page.includes(`qp: "${qp}"`) &&
        mIndia.includes(`'${code}'`),
      `3.1 ${code} (${qp}) is on the page and in the migration`,
    );
  }
  for (const code of ["IN_MEPSC_Q7101", "IN_MEPSC_Q7201", "IN_MEPSC_Q7104", "IN_MEPSC_Q7204"]) {
    const symbol = new RegExp(`'${code}',\\s*'[^']+',\\s*'(Q\\d{4})'`).exec(mIndia)?.[1];
    ok(
      symbol !== undefined && credentialMark(code) === symbol,
      `3.1b ${code}'s shield mark is its governed symbol_label (${symbol})`,
    );
  }
  ok(
    (page.match(/code: "IN_MEPSC_Q\d{4}", title/g) ?? []).length === 4,
    "3.2 the page lists exactly four Indian qualifications",
  );
  const check = /desired_destinations <@ ARRAY\[([^\]]+)\]/.exec(mLoc)?.[1] ?? "";
  const dbDest = [...check.matchAll(/'([A-Z-]+)'/g)].map((m) => m[1]).sort();
  ok(
    dbDest.join("|") === [...DESTINATIONS].sort().join("|"),
    "3.3 the destination vocabulary mirrors the database CHECK",
  );
  const interest = /relocation_interest IN \(([^)]+)\)/.exec(mLoc)?.[1] ?? "";
  ok(
    [...interest.matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1])
      .sort()
      .join("|") === [...RELOCATION_INTEREST].sort().join("|"),
    "3.4 relocation interest mirrors the database CHECK",
  );
  for (const name of INDIA_FUNNEL_EVENTS) {
    ok(
      (FUNNEL_EVENT_NAMES as readonly string[]).includes(name) &&
        mLoc.includes(`'${name}'::text`) &&
        mLoc.includes(`'${name}'`),
      `3.5 funnel event ${name} is allowlisted in code, the table CHECK and the entry point`,
    );
  }
}

// ── 4. Analytics: a name, nothing else ───────────────────────────────────
{
  const a = read(ANALYTICS);
  ok(
    /export function trackFunnelOnce\(event: IndiaFunnelEvent\): void/.test(a),
    "4.1 the tracker takes an event name and no other argument",
  );
  ok(
    /trackV31FunnelEvent\(\{ data: \{ eventName: event \} \}\)/.test(a) &&
      !/detail/.test(a.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")),
    "4.2 it sends the name alone: no detail, no session, no identity",
  );
  const callers = [
    LANDING,
    SETUP,
    FORM,
    "src/routes/_authenticated.passport.share.tsx",
    "src/routes/_authenticated.passport.entry.$kind.$entryId.tsx",
  ];
  for (const f of callers) {
    const src = read(f);
    const calls = [...src.matchAll(/trackFunnelOnce\(([^)]*)\)/g)].map((m) => m[1].trim());
    ok(
      calls.length > 0 && calls.every((c) => /^"[a-z_]+"$/.test(c)),
      `4.3 ${f} tracks only literal event names`,
    );
  }
}

// ── 5. Redirect ──────────────────────────────────────────────────────────
{
  const intent = "/passport/start?market=IN";
  ok(
    safeReturnPath(intent, "/fallback") === intent,
    "5.1 the India intent survives safeReturnPath unchanged",
  );
  ok(
    read(LANDING).includes(`const INDIA_SETUP_REDIRECT = "${intent}";`),
    "5.2 the landing page sends exactly that intent",
  );
  // The language rides the URL: a click before hydration runs no handler.
  for (const lang of ["en", "sv"] as const) {
    const carried = `${intent}&lang=${lang}`;
    ok(
      safeReturnPath(carried, "/fallback") === carried,
      `5.4 the ${lang} intent survives safeReturnPath unchanged`,
    );
    ok(
      langIntentFrom(`?redirect=${encodeURIComponent(carried)}&lang=${lang}`) === lang &&
        langIntentFrom(new URL(carried, "https://x.invalid").search) === lang,
      `5.5 the sign-up URL and the setup it returns to both carry ${lang}`,
    );
  }
  ok(
    langIntentFrom("?lang=de") === null && langIntentFrom("") === null,
    "5.6 only sv and en are adopted from a URL",
  );
  ok(
    /return \{ redirect: `\$\{INDIA_SETUP_REDIRECT\}&lang=\$\{lang\}`, lang \} as const;/.test(
      read(LANDING),
    ) && (read(LANDING).match(/search=\{indiaIntent\(lang\) as never\}/g) ?? []).length === 2,
    "5.7 both signed-out links carry the page language, into sign-up and into the setup",
  );
  {
    const provider = read("src/i18n/context.tsx");
    const hook =
      /export function useAdoptLangIntent\(search: string\) \{[\s\S]*?if \(readStoredLang\(\)\) return;\s*const intent = langIntentFrom\(search\);\s*if \(intent\) setLang\(intent\);\s*\}, \[search, setLang\]\);/.test(
        provider,
      );
    ok(hook, "5.8 a carried language is adopted only when none is stored, on every navigation");
    ok(
      /<LangIntentFromUrl \/>/.test(read("src/routes/__root.tsx")) &&
        /useRouterState\(\{ select: \(s\) => s\.location\.searchStr \}\);\s*useAdoptLangIntent\(search\);/.test(
          read("src/routes/__root.tsx"),
        ),
      "5.9 the root follows the URL's language across navigations",
    );
  }
  for (const hostile of [
    "//evil.example/passport/start",
    "https://evil.example/",
    "/\\evil.example",
    "/login?redirect=/passport/start",
  ]) {
    ok(safeReturnPath(hostile, "/fallback") === "/fallback", `5.3 ${hostile} is refused`);
  }
}

// ── 6. Boundaries ────────────────────────────────────────────────────────
{
  const setup = read(SETUP) + read(SETUP_FNS);
  const code = setup.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  ok(
    !/nationality|citizenship|right_to_work|rightToWork|visa_status|passport_number|immigration/i.test(
      code,
    ),
    "6.1 the setup has no nationality, immigration or right-to-work field",
  );
  const fns = read(SETUP_FNS);
  const writes = [
    ...fns.matchAll(/\.from\("([a-z_]+)"(?: as never)?\)\s*\.(upsert|insert|update|delete)\(/g),
  ].map((m) => m[1]);
  ok(
    writes.length === 2 &&
      writes.includes("candidate_current_location") &&
      writes.includes("candidate_job_preferences"),
    "6.2 the setup's own functions write only the location and the preferences",
  );
  ok(
    !/sp_passport_profiles"\)\s*\.(?:upsert|update|insert)/.test(fns) &&
      !/jurisdiction_code:/.test(fns),
    "6.3 and never the work country or any jurisdiction",
  );
  const form = read(FORM);
  ok(
    /definition_version: selectedVersions\.some\(\s*\(v\) => v\.version_key === draft\.definition_version,?\s*\)\s*\?\s*draft\.definition_version\s*:\s*"",/.test(
      form,
    ),
    "6.4 the form sends a version only when it is one of the selected definition's",
  );
  const india = resolveCredentialScope({ jurisdictionCode: "IN" }, "en");
  ok(
    india.kind === "jurisdiction" && india.flag === "IN" && india.label === "India",
    "6.5 India wears its own flag and name",
  );
  ok(
    /c\.scope_code === "national_regulated" \|\| c\.scope_code === "national_qualification"\s*\?\s*"national"/.test(
      read(RECIPIENT),
    ),
    "6.6 a recipient sees a national qualification as national (a flag), never global",
  );
  const base = {
    passportExists: true,
    displayName: "Priya Iyer",
    professionSlug: null,
    professionOther: "Security guard",
    location: { countryCode: "IN", locality: null },
    preferences: null,
    credentials: [],
  } as const;
  ok(deriveSetupStep({ ...base, displayName: null }) === "name", "6.7 setup starts at the name");
  ok(deriveSetupStep({ ...base, location: null }) === "location", "6.8 then where they live");
  ok(deriveSetupStep(base) === "destinations", "6.9 then the optional destinations");
  ok(
    deriveSetupStep({ ...base, preferences: { destinations: [], relocationInterest: null } }) ===
      "first",
    "6.10 a skipped destination question is not asked again",
  );
}

// ── 7. The destination checklist ─────────────────────────────────────────
{
  const c = read(CHECKLIST);
  ok(
    INDIA_ENTRY_SOURCES.siraCadreCard === "https://www.sira.gov.ae/en/services/security-cadre-card",
    "7.1 SIRA's official page is the source",
  );
  ok(/INDIA_ENTRY_SOURCES\.siraCadreCard/.test(c), "7.2 and the checklist links it");
  ok(
    /check\.notReplace/.test(c),
    "7.3 the checklist says an Indian qualification does not replace SIRA training or a card",
  );
  ok(
    !/percent|score|ready|progress|Math\.|\.length\s*\//i.test(
      c.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""),
    ),
    "7.4 nothing is computed into a score",
  );
  ok(
    /data-checklist-group="recorded"/.test(c) &&
      /data-checklist-group="needed"/.test(c) &&
      /data-checklist-group="external"/.test(c),
    "7.5 recorded, still needed and externally confirmed are three separate lists",
  );
  ok(
    /9231/.test(indiaCopy.en["check.uk.body2"]) &&
      /ineligible/.test(indiaCopy.en["check.uk.body2"]),
    "7.6 the UK statement names occupation 9231 as ineligible, as GOV.UK does",
  );
  ok(
    INDIA_ENTRY_SOURCES.skilledWorkerOccupations.startsWith("https://www.gov.uk/"),
    "7.7 and links GOV.UK",
  );
}

// ── 8. Expiry: a missing date is not "no expiry" ─────────────────────────
// An Indian qualification is saved without an expiry date (none is required
// and none is derived), so this wording is what every India holder and
// recipient reads. Only an EXPLICIT non-expiring credential says "No expiry".
{
  ok(
    formatExpiry(null, "en") === "Expiry date not provided" &&
      formatExpiry(null, "sv") === "Slutdatum inte angivet",
    "8.1 an absent expiry date reads as not provided, in both languages",
  );
  ok(
    formatExpiry(null, "en", null) === "Expiry date not provided" &&
      formatExpiry(null, "en", false) === "Expiry date not provided",
    "8.2 an unset or false flag is not an explicit non-expiring state",
  );
  ok(
    formatExpiry(null, "en", true) === "No expiry" &&
      formatExpiry(null, "sv", true) === "Ingen giltighetstid",
    "8.3 an explicitly non-expiring credential still reads No expiry",
  );
  ok(
    formatExpiry("2030-01-01", "en", true) === "2030-01-01" &&
      formatExpiry("2030-01-01", "en") === "2030-01-01",
    "8.4 a date is always the date",
  );
  const claim = (key: string, noExpiry: boolean | undefined) => ({
    key,
    type: "certificate",
    title: "Security Guard (MEP/Q7101)",
    credential_code: "IN_MEPSC_Q7101",
    issuer: null,
    jurisdiction: "IN",
    sub_jurisdiction: null,
    scope_limited: false,
    authorisation_scope: null,
    issued_on: "2023-04-03",
    valid_until: null,
    ...(noExpiry === undefined ? {} : { no_expiry: noExpiry }),
    assertion: "document_provided",
    lifecycle: "active",
    verified_at: null,
    verifier_organisation: null,
    verification_method: null,
    scope_code: "national_qualification",
  });
  const payload = {
    status: "active",
    package: "public_card",
    purpose: null,
    expires_at: null,
    last_updated: "2026-09-26T09:00:00Z",
    holder: "Priya Ramaswamy Iyer",
    privacy_mode: "full_name",
    profession_slug: null,
    jurisdiction: null,
    verified_claims: [claim("c1", true), claim("c2", undefined), claim("c3", false)],
    verified_experience: [],
    verified_experience_days: 0,
  } as unknown as RecipientPayloadActive;
  const [explicit, absent, unset] = buildRecipientPresentation(payload, "2026-09-26").credentials;
  ok(
    explicit?.noExpiry === true && absent?.noExpiry === false && unset?.noExpiry === false,
    "8.5 the recipient presentation carries only an explicit no_expiry",
  );
  ok(
    explicit?.validUntil === null &&
      absent?.validUntil === null &&
      explicit?.lifecycle === "active",
    "8.6 and changes no stored validity",
  );
  // Every surface that prints an expiry passes the explicit flag.
  const calls: [string, RegExp][] = [
    [
      "src/components/security-passport/live/RecipientCredentialList.tsx",
      /formatExpiry\(null, lang, c\.noExpiry\)/,
    ],
    [
      "src/components/security-passport/live/CredentialVerificationPage.tsx",
      /formatExpiry\(credential\.validUntil, lang, credential\.noExpiry\)/,
    ],
    [
      "src/components/security-passport/ClaimRow.tsx",
      /formatExpiry\(claim\.validUntil, lang, claim\.noExpiry\)/,
    ],
    [
      "src/components/security-passport/CredentialVersionHistory.tsx",
      /formatExpiry\(v\.validUntil, lang, v\.noExpiry\)/,
    ],
    [
      "src/components/security-passport/CredentialWallet.tsx",
      /formatExpiry\(null, lang, r\.detail\?\.no_expiry\)/,
    ],
    [
      "src/routes/_authenticated.passport.entry.$kind.$entryId.tsx",
      /formatExpiry\(claim\.validUntil, lang, internationalDetail\?\.no_expiry\)/,
    ],
    ["src/routes/_authenticated.passport.share.tsx", /formatExpiry\(null, lang, merit\.noExpiry\)/],
  ];
  for (const [file, pattern] of calls)
    ok(pattern.test(read(file)), `8.7 ${file} passes the explicit flag`);
  const everywhere = [
    ...calls.map(([f]) => f),
    "src/components/security-passport/PassportCard.tsx",
    "src/components/security-passport/InternationalCredentialForm.tsx",
  ]
    .map(read)
    .join("\n");
  ok(
    !/pt\("claims\.noExpiry"\)|passportT\("claims\.noExpiry"/.test(everywhere),
    "8.8 no surface prints No expiry for itself",
  );
  ok(
    /\.from\("sp_credential_details"\)\.select\("claim_id"\)\.eq\("no_expiry", true\)/.test(
      read("src/lib/security-passport/passport.functions.ts"),
    ) &&
      /if \(noExpiryRes\.error\) throw/.test(
        read("src/lib/security-passport/passport.functions.ts"),
      ),
    "8.9 the holder's Passport reads the explicit state, and a failed read is not 'none'",
  );
}

if (failures.length) {
  console.error(`india-entry-check: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log(`india-entry-check: ${checks}/${checks} checks passed`);
