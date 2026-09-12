// Security Passport — three markets, one catalogue, asserted against the
// ROUTE WIRING, the RENDERED markup and the MIGRATIONS.
//
// Run via `bun run passport-market-catalogue:check`.
//
// ── THE DEFECT THIS GUARD EXISTS TO KEEP FIXED ─────────────────────────
//
// `/passport/information` passed the governed catalogue to its market
// section only when `availability.state === "open"`. The server function,
// the section and the credential form all understood "open_pilot" as well,
// so an entitled pilot holder saw the pilot status line and NO credentials
// under it. `passport-market-profiles-check` rendered the section with the
// right props and passed — pure-component coverage cannot see a route
// handing a component the wrong props. This guard reads the route.
//
// ── WHAT IS ASSERTED ───────────────────────────────────────────────────
//
//   1  the route wiring: options come from the shared rule, for open AND
//      open_pilot, and nobody restates the comparison
//   2  the rule itself, for every market state
//   3  the fixture mirrors agree with the migrations they mirror
//   4  the rendered catalogue: 3/5, 7/6, 1/0, 15/15, in database order,
//      searchable only past twelve, Northern Ireland never inside GB
//   5  search narrows without losing the selection; preselection holds
//   6  the form asks a licence and a qualification different questions,
//      and a qualification can never derive an active title
//   7  a work-country change removes and relabels nothing
//   8  no read model can be pointed at another holder; the admin surface
//      re-checks the administrator and writes only through the RPCs
//   9  the three market cards, the admin section and the copy, in both
//      languages, with none of the forbidden positioning words

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The market cards and the admin section link with the router's <Link>,
// which needs a router. The workspace guard mocks it the same way.
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    hash,
    search,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>))
        href = href.replace(`$${k}`, String(v));
    }
    if (search && typeof search === "object")
      href += "?" + new URLSearchParams(search as Record<string, string>).toString();
    if (hash) href += `#${hash}`;
    return React.createElement("a", { href, ...rest }, children);
  },
  createFileRoute: () => () => ({}),
  useNavigate: () => () => undefined,
}));

const { I18nProvider } = await import("../src/i18n/context");
const { PassportLangProvider } = await import("../src/lib/security-passport/use-passport-copy");
const { MarketCredentialSection } =
  await import("../src/components/security-passport/MarketCredentialSection");
const { CredentialCatalogue } =
  await import("../src/components/security-passport/CredentialCatalogue");
const { CredentialForm } = await import("../src/components/security-passport/CredentialForm");
const { MarketOverviewCards } =
  await import("../src/components/security-passport/MarketOverviewCards");
const { PassportPilotAccessSection } =
  await import("../src/components/admin/PassportPilotAccessSection");
const { FIXTURE_CREDENTIAL_TYPES } =
  await import("../src/lib/security-passport/fixtures/credential-types");
const { FIXTURE_GB_CATALOGUE, FIXTURE_GB_NI_CATALOGUE, FIXTURE_AE_DU_CATALOGUE } =
  await import("../src/lib/security-passport/fixtures/market-catalogues");
const {
  CATALOGUE_SEARCH_THRESHOLD,
  catalogueNeedsSearch,
  catalogueOptionsFor,
  filterCatalogue,
  groupCatalogue,
  isOfferableMarketState,
} = await import("../src/lib/security-passport/market-catalogue");
const { deriveMarketProfiles } = await import("../src/lib/security-passport/market-profiles");
const { deriveProfessionalIdentity, SWEDEN_TITLE_RULES } =
  await import("../src/lib/security-passport/identity");
const { passportT, passportCopy } = await import("../src/lib/security-passport/i18n");
const { dictionaries } = await import("../src/i18n/dictionaries");
const { fieldsFor } = await import("../src/lib/security-passport/credentials");

type Lang = "sv" | "en";
type PassportCopyKey = Parameters<typeof passportT>[0];
type CredentialType = (typeof FIXTURE_CREDENTIAL_TYPES)[number];
type Claim = Parameters<typeof deriveProfessionalIdentity>[0][number];

const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
/** Source with comments stripped, so a comment that NAMES the old defect in
 *  order to explain it does not fail the guard that documents it. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const fails: string[] = [];
let count = 0;
function ck(name: string, ok: boolean, detail?: string): void {
  count += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) fails.push(name);
}
function group(title: string) {
  console.log(`\n${title}`);
}

const html = (n: React.ReactNode, lang: Lang = "sv") =>
  renderToStaticMarkup(
    <I18nProvider>
      <PassportLangProvider lang={lang}>{n}</PassportLangProvider>
    </I18nProvider>,
  );
const noop = () => undefined;
const codesIn = (markup: string) =>
  [...markup.matchAll(/data-credential-code="([A-Z0-9_]+)"/g)].map((m) => m[1]);
const groupCount = (markup: string, key: "appointments" | "qualifications") => {
  const m = new RegExp(`data-catalogue-group="${key}"[^>]*data-count="(\\d+)"`).exec(markup);
  return m ? Number(m[1]) : null;
};

const toOptions = (rows: readonly CredentialType[]) =>
  rows.map((t) => ({
    code: t.code,
    category: t.category,
    nameSv: t.nameSv,
    nameEn: t.nameEn,
    symbolLabel: t.symbolLabel,
  }));

const SE = toOptions(FIXTURE_CREDENTIAL_TYPES);
const GB = toOptions(FIXTURE_GB_CATALOGUE);
const NI = toOptions(FIXTURE_GB_NI_CATALOGUE);
const DU = toOptions(FIXTURE_AE_DU_CATALOGUE);

console.log("passport-market-catalogue-check");

/* ══════════════════════════════════════════════════════════════════════
   1 · THE ROUTE WIRING
   ══════════════════════════════════════════════════════════════════════ */
group("1 · the entry route passes the catalogue for open AND open_pilot");
{
  const route = code(read("src/routes/_authenticated.passport.information.tsx"));
  ck(
    "1.1 the information route imports the shared rule",
    /import \{ catalogueOptionsFor \} from "@\/lib\/security-passport\/market-catalogue"/.test(
      route,
    ),
  );
  ck(
    "1.2 and hands the section exactly what the rule returns",
    /options=\{catalogueOptionsFor\(availability\)\}/.test(route),
  );
  ck(
    '1.3 THE DEFECT: no `state === "open"` comparison decides the options any more',
    !/state\s*===\s*"open"/.test(route),
  );
  ck(
    "1.4 the catalogue's loading and failure are passed on, not swallowed",
    /catalogueStatus=\{availabilityStatus\}/.test(route) &&
      /setAvailabilityStatus\("failed"\)/.test(route),
  );

  // Nobody else decides "may a list be offered" with a comparison of its
  // own: every surface that gates a catalogue asks the shared predicate.
  for (const f of [
    "src/routes/_authenticated.passport.credentials.new.tsx",
    "src/components/security-passport/MarketCredentialSection.tsx",
    "src/components/security-passport/PassportOverview.tsx",
  ]) {
    ck(
      `1.5 ${path.basename(f)} gates its catalogue with isOfferableMarketState`,
      /isOfferableMarketState\(/.test(code(read(f))),
    );
  }
  ck(
    "1.5 CredentialCatalogue.tsx knows nothing about market states at all",
    !/"open(_pilot)?"|pending_review|unsupported/.test(
      code(read("src/components/security-passport/CredentialCatalogue.tsx")),
    ),
  );
  ck(
    "1.5 CredentialForm.tsx never names an open state (it is told, or it is closed)",
    !/"open(_pilot)?"/.test(code(read("src/components/security-passport/CredentialForm.tsx"))),
  );
  ck(
    "1.6 the shared rule is the only place that names both states",
    /state === "open" \|\| state === "open_pilot"/.test(
      code(read("src/lib/security-passport/market-catalogue.ts")),
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   2 · THE RULE
   ══════════════════════════════════════════════════════════════════════ */
group("2 · the rule, for every market state");
{
  const types = GB;
  ck("2.1 open -> the catalogue", catalogueOptionsFor({ state: "open", types }).length === 13);
  ck(
    "2.2 open_pilot -> the catalogue (the regression)",
    catalogueOptionsFor({ state: "open_pilot", types }).length === 13,
  );
  for (const state of ["pending_review", "unsupported", "no_work_country"]) {
    ck(
      `2.3 ${state} -> nothing, even when types are passed`,
      catalogueOptionsFor({ state, types }).length === 0,
    );
  }
  ck("2.4 no answer yet -> nothing", catalogueOptionsFor(null).length === 0);
  ck(
    "2.5 the predicate agrees with the function",
    isOfferableMarketState("open") &&
      isOfferableMarketState("open_pilot") &&
      !isOfferableMarketState("pending_review") &&
      !isOfferableMarketState(undefined),
  );
  ck(
    "2.6 the search threshold is twelve",
    CATALOGUE_SEARCH_THRESHOLD === 12 && !catalogueNeedsSearch(12) && catalogueNeedsSearch(13),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   3 · THE FIXTURES MIRROR THE MIGRATIONS
   ══════════════════════════════════════════════════════════════════════ */
group("3 · the fixture mirrors agree with the shipped migrations");
{
  interface SqlRow {
    code: string;
    category: "appointment" | "qualification";
    sortOrder: number;
    contributesTo: string;
  }
  /** Every sp_credential_types INSERT in a migration, as (code, category,
   *  sort_order, contributes_to). Both authoring shapes are read: VALUES
   *  rows of (code, name, symbol, sort_order, ...) and the single-row
   *  SELECT literals used for Vehicle Immobilisation and the fitness check. */
  function rowsOf(file: string): SqlRow[] {
    const sql = read(`supabase/migrations/${file}`);
    const out: SqlRow[] = [];
    const blocks = sql.split(/INSERT INTO public\.sp_credential_types/g).slice(1);
    for (const block of blocks) {
      const body = block.split(/ON CONFLICT/)[0];
      const category = /'appointment'/.test(body)
        ? "appointment"
        : /'qualification'/.test(body)
          ? "qualification"
          : null;
      if (!category) continue;
      const contributesTo = /ARRAY\[([^\]]*)\]/.exec(body)?.[1] ?? "";
      for (const m of body.matchAll(/\(\s*'([A-Z0-9_]+)',\s*'[^']+',\s*'[A-Z]+',\s*(\d+)/g)) {
        out.push({ code: m[1], category, sortOrder: Number(m[2]), contributesTo });
      }
      const single =
        /^\s*'([A-Z0-9_]+)',\s*'(?:licence|certification)',\s*'(appointment|qualification)',[\s\S]*?(?:true|false),\s*(\d+),/m.exec(
          body,
        );
      if (single && !out.some((r) => r.code === single[1])) {
        out.push({
          code: single[1],
          category: single[2] as SqlRow["category"],
          sortOrder: Number(single[3]),
          contributesTo,
        });
      }
    }
    return out;
  }

  const gbSql = rowsOf("20260907092000_sp_uk_market_pack.sql");
  const niSql = rowsOf("20260914090000_sp_uk_vehicle_immobilisation.sql");
  const duSql = [
    ...rowsOf("20260907093000_sp_uae_dubai_market_pack.sql"),
    ...rowsOf("20260914091000_sp_uae_dubai_cadre_catalogue.sql"),
  ];

  function agree(
    name: string,
    sql: SqlRow[],
    fixture: readonly (CredentialType & { sortOrder: number })[],
  ) {
    const byCode = new Map(sql.map((r) => [r.code, r]));
    ck(
      `3.${name} the migration seeds exactly ${fixture.length} rows`,
      sql.length === fixture.length,
      `sql ${sql.length}`,
    );
    ck(
      `3.${name} every fixture code is seeded`,
      fixture.every((f) => byCode.has(f.code)),
      fixture
        .filter((f) => !byCode.has(f.code))
        .map((f) => f.code)
        .join(","),
    );
    ck(
      `3.${name} every seeded code is mirrored`,
      sql.every((r) => fixture.some((f) => f.code === r.code)),
      sql
        .filter((r) => !fixture.some((f) => f.code === r.code))
        .map((r) => r.code)
        .join(","),
    );
    ck(
      `3.${name} category and sort_order agree row for row`,
      fixture.every((f) => {
        const r = byCode.get(f.code);
        return r !== undefined && r.category === f.category && r.sortOrder === f.sortOrder;
      }),
    );
    ck(
      `3.${name} the fixture is in database sort order`,
      fixture.every((f, i) => i === 0 || fixture[i - 1].sortOrder < f.sortOrder),
    );
    // A course is evidence that training happened. The taxonomy says so:
    // no qualification row contributes anything but education_completed.
    ck(
      `3.${name} no qualification row contributes to a title or an eligibility`,
      sql
        .filter((r) => r.category === "qualification")
        .every((r) => !/active_title|local_eligibility/.test(r.contributesTo)),
    );
  }
  agree("GB", gbSql, FIXTURE_GB_CATALOGUE);
  agree("GB-NI", niSql, FIXTURE_GB_NI_CATALOGUE);
  agree("AE-DU", duSql, FIXTURE_AE_DU_CATALOGUE);

  // The fitness item carries nothing but a checked result.
  const fit = FIXTURE_AE_DU_CATALOGUE.find((t) => t.code === "AE_DU_FITNESS_CHECKED");
  ck("3.fit the fitness requirement is narrow-result-only", fit?.narrowResultOnly === true);
  ck(
    "3.fit its form shows no note and no free title",
    fit !== undefined && !fieldsFor(fit).note && !fieldsFor(fit).title,
  );
  ck(
    "3.fit its name carries no health or medical detail",
    fit !== undefined && !/medical|health|hälsa|sjuk|diagnos/i.test(fit.nameEn + fit.nameSv),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   4 · THE RENDERED CATALOGUE
   ══════════════════════════════════════════════════════════════════════ */
group("4 · the rendered catalogue: 3/5, 7/6, 1/0, 15/15");
{
  const section = (
    state: "open" | "open_pilot",
    j: string,
    sub: string | null,
    options: typeof SE,
    lang: Lang = "sv",
  ) =>
    html(
      <MarketCredentialSection
        state={state}
        jurisdictionCode={j}
        subJurisdictionCode={sub}
        options={options}
        onSelect={noop}
      />,
      lang,
    );

  const cases = [
    { name: "SE", markup: section("open", "SE", null, SE), a: 3, q: 5, opts: SE, search: false },
    {
      name: "GB",
      markup: section("open_pilot", "GB", null, GB),
      a: 7,
      q: 6,
      opts: GB,
      search: true,
    },
    {
      name: "GB-NI",
      markup: section("open_pilot", "GB", "GB-NI", NI),
      a: 1,
      q: 0,
      opts: NI,
      search: false,
    },
    {
      name: "AE-DU",
      markup: section("open_pilot", "AE", "AE-DU", DU),
      a: 15,
      q: 15,
      opts: DU,
      search: true,
    },
  ] as const;

  for (const c of cases) {
    const codes = codesIn(c.markup);
    ck(
      `4.${c.name} offers exactly ${c.a + c.q} choices`,
      codes.length === c.a + c.q,
      String(codes.length),
    );
    ck(`4.${c.name} groups ${c.a} appointments`, groupCount(c.markup, "appointments") === c.a);
    ck(
      `4.${c.name} groups ${c.q} qualifications`,
      c.q === 0
        ? groupCount(c.markup, "qualifications") === null
        : groupCount(c.markup, "qualifications") === c.q,
    );
    ck(
      `4.${c.name} preserves database sort order within each group`,
      JSON.stringify(codes) ===
        JSON.stringify([
          ...groupCatalogue(c.opts).appointments.map((o) => o.code),
          ...groupCatalogue(c.opts).qualifications.map((o) => o.code),
        ]),
    );
    ck(
      `4.${c.name} ${c.search ? "gets" : "does not get"} a search field`,
      /type="search"/.test(c.markup) === c.search,
    );
    ck(
      `4.${c.name} the human name leads and the code is secondary`,
      c.opts.every(
        (o) =>
          c.markup.includes(o.nameSv) &&
          c.markup.includes(`<code class="font-mono">${o.code}</code>`),
      ),
    );
    ck(
      `4.${c.name} every option is at least 44px tall`,
      [...c.markup.matchAll(/<button[^>]*data-credential-code[^>]*class="([^"]*)"/g)].every((m) =>
        /\bmin-h-11\b/.test(m[1]),
      ),
    );
  }

  // The two headings, said out loud, with counts.
  const gb = cases[1].markup;
  ck(
    "4.GB the two group headings are rendered with their counts",
    gb.includes(passportT("catalogue.group.appointments", "sv")) &&
      gb.includes(passportT("catalogue.group.qualifications", "sv")) &&
      gb.includes(`7 ${passportT("catalogue.choices.many", "sv")}`) &&
      gb.includes(`6 ${passportT("catalogue.choices.many", "sv")}`),
  );
  ck(
    "4.GB an internal-pilot catalogue keeps its pilot status line",
    /market-pilot-status/.test(gb),
  );

  // Northern Ireland is never a general GB credential.
  ck(
    "4.NI vehicle immobilisation is absent from the GB catalogue",
    !codesIn(gb).includes("UK_SIA_LICENCE_VI"),
  );
  ck(
    "4.NI and present, alone, in the GB-NI catalogue",
    JSON.stringify(codesIn(cases[2].markup)) === '["UK_SIA_LICENCE_VI"]',
  );
  ck(
    "4.NI no qualification is invented for Northern Ireland",
    !/data-catalogue-group="qualifications"/.test(cases[2].markup),
  );
  ck("4.NI the GB-NI heading names Northern Ireland", /Nordirland/.test(cases[2].markup));

  // Dubai stays Dubai.
  const du = cases[3].markup;
  ck("4.AE-DU the heading names Dubai, never the UAE alone", /Dubai/.test(du));
  ck(
    "4.AE-DU every row belongs to AE-DU",
    FIXTURE_AE_DU_CATALOGUE.every(
      (t) => t.jurisdictionCode === "AE" && t.subJurisdictionCode === "AE-DU",
    ),
  );
  ck("4.AE-DU no Swedish and no British credential leaks in", !/VU1|OV_TRAINING|UK_SIA/.test(du));
  ck(
    "4.SE no British or Dubai credential leaks into Sweden",
    !/UK_SIA|AE_DU/.test(cases[0].markup),
  );

  // The English half.
  const en = section("open_pilot", "GB", null, GB, "en");
  ck(
    "4.EN the English interface renders the English headings",
    en.includes(passportT("catalogue.group.appointments", "en")) &&
      en.includes(passportT("catalogue.group.qualifications", "en")) &&
      !en.includes(passportT("catalogue.group.appointments", "sv")),
  );

  // Loading, failure and emptiness are each words.
  const loading = html(
    <CredentialCatalogue mode="action" options={[]} status="loading" onSelect={noop} />,
  );
  const failed = html(
    <CredentialCatalogue
      mode="action"
      options={[]}
      status="failed"
      onRetry={noop}
      onSelect={noop}
    />,
  );
  const empty = html(
    <CredentialCatalogue mode="action" options={[]} status="ready" onSelect={noop} />,
  );
  ck(
    "4.states loading is announced as a status",
    /role="status"/.test(loading) && loading.includes(passportT("catalogue.loading", "sv")),
  );
  ck(
    "4.states failure is an alert with a retry",
    /role="alert"/.test(failed) && failed.includes(passportT("catalogue.retry", "sv")),
  );
  ck("4.states an empty market says so", empty.includes(passportT("catalogue.empty", "sv")));
  ck(
    "4.states none of them draws a selectable credential",
    ![loading, failed, empty].some((m) => /data-credential-code/.test(m)),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   5 · SEARCH KEEPS THE SELECTION; PRESELECTION HOLDS
   ══════════════════════════════════════════════════════════════════════ */
group("5 · search narrows without losing the selection, and preselection holds");
{
  const cctv = filterCatalogue(GB, "cctv");
  ck(
    "5.1 a query matches the name in either language and the code",
    cctv.map((o) => o.code).join() === "UK_SIA_LICENCE_CCTV,UK_SIA_QUAL_CCTV",
  );
  ck(
    "5.2 order is preserved under a filter",
    JSON.stringify(filterCatalogue(DU, "systems").map((o) => o.code)) ===
      JSON.stringify(DU.filter((o) => /systems/i.test(o.nameEn)).map((o) => o.code)),
  );
  const pinned = filterCatalogue(DU, "zzz-no-such-thing", "AE_DU_SIRA_CARD_GUARD");
  ck(
    "5.3 the selected credential survives a query that does not match it",
    pinned.length === 1 && pinned[0].code === "AE_DU_SIRA_CARD_GUARD",
  );
  ck("5.4 an empty query is the whole catalogue", filterCatalogue(DU, "   ").length === 30);

  const selected = html(
    <CredentialCatalogue
      mode="select"
      options={DU}
      selectedCode="AE_DU_SIRA_CARD_GUARD"
      onChange={noop}
    />,
  );
  ck(
    "5.5 select mode renders one radio per choice",
    (selected.match(/type="radio"/g) ?? []).length === 30,
  );
  const radioTag = (markup: string, code: string) =>
    new RegExp(`<input[^>]*value="${code}"[^>]*>`).exec(markup)?.[0] ?? "";
  ck(
    "5.6 the selected radio is checked and marked",
    /type="radio"/.test(radioTag(selected, "AE_DU_SIRA_CARD_GUARD")) &&
      /\bchecked\b/.test(radioTag(selected, "AE_DU_SIRA_CARD_GUARD")) &&
      /data-selected="true"/.test(selected),
  );
  ck(
    "5.7 every radio is inside its label",
    (selected.match(/<label[^>]*data-credential-code/g) ?? []).length === 30,
  );
  ck("5.8 the search field is labelled", /<label for="[^"]*-search"/.test(selected));

  const form = (types: readonly CredentialType[], preselectCode: string) =>
    html(
      <CredentialForm
        types={types}
        busy={false}
        serverError={null}
        savedAt={null}
        preselectCode={preselectCode}
        onSaveDraft={noop}
        onActivate={noop}
        onCancel={noop}
      />,
    );
  const ds = form(FIXTURE_GB_CATALOGUE, "UK_SIA_LICENCE_DS");
  ck(
    "5.9 ?code= preselects the credential in the form",
    /\bchecked\b/.test(radioTag(ds, "UK_SIA_LICENCE_DS")) &&
      !/\bchecked\b/.test(radioTag(ds, "UK_SIA_LICENCE_SG")),
  );
  ck(
    "5.10 and the definition's own name is shown as the title",
    ds.includes('<p id="sp-cred-title"') && ds.includes("SIA Licence — Door Supervision"),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   6 · A LICENCE AND A QUALIFICATION ARE DIFFERENT QUESTIONS
   ══════════════════════════════════════════════════════════════════════ */
group("6 · a licence, a qualification and a cadre card ask different questions");
{
  const by = (code: string) =>
    [...FIXTURE_GB_CATALOGUE, ...FIXTURE_AE_DU_CATALOGUE].find((t) => t.code === code)!;
  const licence = fieldsFor(by("UK_SIA_LICENCE_DS"));
  const qual = fieldsFor(by("UK_SIA_QUAL_DS"));
  const card = fieldsFor(by("AE_DU_SIRA_CARD_GUARD"));
  const course = fieldsFor(by("AE_DU_SIRA_GUARD_COURSE"));

  ck(
    "6.1 an SIA licence requires an expiry and an issuing authority",
    licence.validUntil &&
      by("UK_SIA_LICENCE_DS").requiresValidUntil &&
      by("UK_SIA_LICENCE_DS").requiresIssuer,
  );
  ck("6.2 an SIA licence takes a reference (the licence number)", licence.reference === true);
  ck("6.3 the licence-linked qualification has NO expiry field", qual.validUntil === false);
  ck(
    "6.4 a SIRA cadre card requires issuer, expiry AND employer scope",
    card.validUntil && card.scope && by("AE_DU_SIRA_CARD_GUARD").requiresScope,
  );
  ck("6.5 a SIRA course has no scope and no expiry", !course.scope && !course.validUntil);
  ck(
    "6.6 the qualification and the licence are separate taxonomy rows",
    by("UK_SIA_QUAL_DS").category === "qualification" &&
      by("UK_SIA_LICENCE_DS").category === "appointment",
  );

  // A qualification can never derive an active title: the identity engine
  // is handed a British qualification and a Dubai course as ACTIVE, VERIFIED
  // claims and must produce no active title from either.
  const claim = (
    c: Partial<Claim> &
      Pick<
        Claim,
        "id" | "credentialCode" | "titleSv" | "titleEn" | "jurisdictionCode" | "subJurisdictionCode"
      >,
  ): Claim =>
    ({
      claimType: "training",
      skillCode: null,
      skillLevel: null,
      issuerName: "Fiktiv utbildare",
      authorisationScope: null,
      issuedOn: "2025-01-10",
      validFrom: "2025-01-10",
      validUntil: null,
      assertionLevel: "verified",
      lifecycleState: "active",
      verifierName: "Fiktiv granskare",
      limitationSv: "Fiktiv testdata.",
      limitationEn: "Fictional test data.",
      versionNo: 1,
      supersedesClaimId: null,
      ...c,
    }) as Claim;
  const quals = [
    claim({
      id: "q-uk",
      credentialCode: "UK_SIA_QUAL_DS",
      titleSv: "Licence-linked qualification — Door Supervision",
      titleEn: "Licence-linked qualification — Door Supervision",
      jurisdictionCode: "GB",
      subJurisdictionCode: null,
    }),
    claim({
      id: "q-du",
      credentialCode: "AE_DU_SIRA_GUARD_COURSE",
      titleSv: "SIRA Security Guard course",
      titleEn: "SIRA Security Guard course",
      jurisdictionCode: "AE",
      subJurisdictionCode: "AE-DU",
    }),
  ];
  const identity = deriveProfessionalIdentity(quals, SWEDEN_TITLE_RULES, "2026-09-12");
  ck("6.7 no verified qualification derives an active title", identity.activeTitles.length === 0);
  ck("6.8 nor a local eligibility", identity.localEligibility.length === 0);

  // And the application never switches a title rule on.
  const appSrc = [
    ...readdirSync(path.join(root, "src/lib/security-passport")),
    ...readdirSync(path.join(root, "src/lib/job-intelligence")),
  ];
  const touchesTitleRules = appSrc.some((f) => {
    const dir =
      f.endsWith(".ts") && readdirSync(path.join(root, "src/lib/security-passport")).includes(f)
        ? "src/lib/security-passport"
        : "src/lib/job-intelligence";
    const full = path.join(root, dir, f);
    try {
      return /sp_professional_title_rules[\s\S]{0,120}(update|upsert|insert)/.test(
        code(readFileSync(full, "utf8")),
      );
    } catch {
      return false;
    }
  });
  ck("6.9 no server function writes a professional-title rule", !touchesTitleRules);
}

/* ══════════════════════════════════════════════════════════════════════
   7 · A WORK-COUNTRY CHANGE REMOVES AND RELABELS NOTHING
   ══════════════════════════════════════════════════════════════════════ */
group("7 · a work-country change removes and relabels nothing, across three markets");
{
  const rec = (id: string, j: string, sub: string | null) => ({
    id,
    title: id,
    jurisdictionCode: j,
    subJurisdictionCode: sub,
    assertionLevel: "self_declared",
    lifecycleState: "active",
  });
  const claims = Object.freeze([
    rec("se-ov", "SE", null),
    rec("gb-ds", "GB", null),
    rec("ni-vi", "GB", "GB-NI"),
    rec("du-guard", "AE", "AE-DU"),
  ]);
  const before = JSON.stringify(claims);
  const homes = [
    { jurisdictionCode: "SE", subJurisdictionCode: null },
    { jurisdictionCode: "GB", subJurisdictionCode: null },
    { jurisdictionCode: "GB", subJurisdictionCode: "GB-NI" },
    { jurisdictionCode: "AE", subJurisdictionCode: "AE-DU" },
  ];
  const results = homes.map((h) => deriveMarketProfiles(claims, h));
  ck("7.1 deriving in every market mutates no claim", JSON.stringify(claims) === before);
  ck(
    "7.2 every market keeps every record wherever the holder works",
    results.every(
      (r) =>
        r.profiles.flatMap((p) => [
          ...p.verifiedCredentials,
          ...p.pendingCredentials,
          ...p.otherClaims,
        ]).length === 4,
    ),
  );
  ck(
    "7.3 four markets, separately, every time",
    results.every(
      (r) =>
        r.profiles
          .map((p) => p.marketCode)
          .sort()
          .join() === "AE-DU,GB,GB-NI,SE",
    ),
  );
  ck(
    "7.4 no record is relabelled with the holder's new country",
    results.every((r) =>
      r.profiles.every((p) =>
        [...p.verifiedCredentials, ...p.pendingCredentials, ...p.otherClaims].every(
          (c) => c.jurisdictionCode === claims.find((x) => x.id === c.id)!.jurisdictionCode,
        ),
      ),
    ),
  );
  ck(
    "7.5 the current market moves with the holder and nothing else does",
    results[3].profiles[0].marketCode === "AE-DU" && results[0].profiles[0].marketCode === "SE",
  );
}

/* ══════════════════════════════════════════════════════════════════════
   8 · NO CROSS-HOLDER LEAKAGE; THE ADMIN SURFACE FAILS CLOSED
   ══════════════════════════════════════════════════════════════════════ */
group("8 · no read model can be pointed at another holder; the admin surface fails closed");
{
  const cred = code(read("src/lib/security-passport/credentials.functions.ts"));
  const overview = cred.slice(cred.indexOf("export const listPassportMarketOverview"));
  const overviewFn = overview.slice(0, overview.indexOf("\n  });") + 6);
  ck(
    "8.1 the market overview takes no input at all",
    !/\.validator\(|\.inputValidator\(/.test(overviewFn),
  );
  ck(
    "8.2 and asks the database about the CALLING user only",
    /_user_id: userId/.test(overviewFn) && /\.eq\("holder_user_id", userId\)/.test(overviewFn),
  );
  const avail = cred.slice(cred.indexOf("export const getRegulatedCredentialAvailability"));
  ck(
    "8.3 the availability read is scoped to the calling holder",
    /\.eq\("holder_user_id", userId\)/.test(avail.slice(0, avail.indexOf("\n  });"))),
  );

  const admin = code(read("src/lib/job-intelligence/admin-passport-pilot.functions.ts"));
  const handlers = admin.split(/export const admin/).slice(1);
  ck("8.4 there are exactly three admin functions: list, grant, revoke", handlers.length === 3);
  ck(
    "8.5 every one re-checks platform-admin status before anything else",
    handlers.every((h) => /await assertAdmin\(ctx\)/.test(h)),
  );
  ck("8.6 the check is the database's is_platform_admin", /rpc\("is_platform_admin"/.test(admin));
  ck(
    "8.7 grant and revoke go through the two RPCs on the caller's session",
    /ctx\.supabase\.rpc\("sp_grant_pilot_member"/.test(admin) &&
      /ctx\.supabase\.rpc\("sp_revoke_pilot_member"/.test(admin),
  );
  ck(
    "8.8 the service role never calls either RPC",
    !/supabaseAdmin[\s\S]{0,80}\.rpc\("sp_(grant|revoke)_pilot_member"/.test(admin),
  );
  ck(
    "8.9 nothing writes sp_pilot_members directly",
    !/from\("sp_pilot_members"\)[\s\S]{0,120}\.(insert|update|upsert|delete)\(/.test(admin),
  );
  ck(
    "8.10 exactly the three pilot markets are manageable",
    /PILOT_MANAGED_MARKETS = \["GB", "GB-NI", "AE-DU"\] as const/.test(admin) &&
      /z\.enum\(PILOT_MANAGED_MARKETS\)/.test(admin),
  );
  ck("8.11 no mass grant: no array input anywhere", !/z\.array\(/.test(admin));
  ck(
    "8.12 self-grant is not blocked here (admins are not implicit members)",
    !/userId === ctx\.userId|SELF_/.test(admin),
  );

  const route = code(read("src/routes/_authenticated.admin.users.$userId.tsx"));
  ck(
    "8.13 the admin route renders the pilot section from the server functions",
    /adminListPassportPilotAccess|adminGrantPassportPilotAccess|adminRevokePassportPilotAccess/.test(
      route,
    ) && /<PassportPilotAccessSection/.test(route),
  );
  ck(
    "8.14 a change invalidates the user, the person overview and the holder's Passport reads",
    /"passport-pilot-access"/.test(route) &&
      /\["passport", "mine"\]/.test(route) &&
      /"person-overview"/.test(route),
  );
  const section = code(read("src/components/admin/PassportPilotAccessSection.tsx"));
  ck(
    "8.15 revoke asks for a second click in a dialog, never window.confirm()",
    !/window\.confirm/.test(section) && /data-pilot-action="confirm-revoke"/.test(section),
  );

  // The migration still forbids everything this surface avoids.
  const mig = read("supabase/migrations/20260915090000_sp_market_pilot_entitlement.sql");
  ck(
    "8.16 the RPCs re-check the administrator in the database",
    (mig.match(/NOT public\.is_platform_admin\(auth\.uid\(\)\)/g) ?? []).length === 2,
  );
  ck(
    "8.17 administrators are deliberately not implicit members",
    /NOT an implicit member/.test(mig),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   9 · THE MARKET CARDS, THE ADMIN SECTION AND THE COPY
   ══════════════════════════════════════════════════════════════════════ */
group("9 · three market cards, the admin section and the copy, both languages");
{
  const row = (
    code: string,
    j: string,
    sub: string | null,
    availability: "available" | "under_review",
    holderAccess: "production" | "pilot" | "closed",
    isCurrentWorkMarket = false,
  ) => ({
    marketPackCode: code,
    jurisdictionCode: j,
    subJurisdictionCode: sub,
    availability,
    holderAccess,
    isCurrentWorkMarket,
  });
  const PUBLIC = [
    row("SE", "SE", null, "available", "production", true),
    row("GB", "GB", null, "under_review", "closed"),
    row("GB-NI", "GB", "GB-NI", "under_review", "closed"),
    row("AE-DU", "AE", "AE-DU", "under_review", "closed"),
  ];
  const PILOT = [
    row("SE", "SE", null, "available", "production"),
    row("GB", "GB", null, "under_review", "pilot", true),
    row("GB-NI", "GB", "GB-NI", "under_review", "closed"),
    row("AE-DU", "AE", "AE-DU", "under_review", "closed"),
  ];
  const cards = (markets: typeof PUBLIC, lang: Lang = "sv") =>
    html(<MarketOverviewCards state={{ status: "ready", markets }} />, lang);

  for (const lang of ["sv", "en"] as const) {
    const pub = cards(PUBLIC, lang);
    ck(
      `9.${lang} three cards, in the owner's order`,
      JSON.stringify([...pub.matchAll(/data-market-card="([A-Z-]+)"/g)].map((m) => m[1])) ===
        '["SE","GB","AE-DU"]',
    );
    ck(
      `9.${lang} Northern Ireland is a submarket inside the UK card, not a fourth card`,
      /data-market-submarket="GB-NI"/.test(pub),
    );
    ck(
      `9.${lang} Sweden reads Available`,
      pub.includes(passportT("markets.status.available", lang)),
    );
    ck(
      `9.${lang} the UK and Dubai read "Internal pilot · under review"`,
      (
        pub.match(
          new RegExp(
            passportT("markets.status.pilot", lang).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "g",
          ),
        ) ?? []
      ).length >= 3,
    );
    ck(
      `9.${lang} a public holder gets no regulated action on a pilot market`,
      !/data-market-card="GB"[\s\S]*?data-market-action="add"[\s\S]*?data-market-card="AE-DU"/.test(
        pub,
      ),
    );
    ck(
      `9.${lang} but is told plainly that regulated choices are not selectable`,
      pub.includes(passportT("markets.holder.pilotClosed", lang)),
    );
    ck(
      `9.${lang} no pilot note is shown to a holder without an entitlement`,
      !/data-market-pilot-note/.test(pub),
    );
    ck(
      `9.${lang} the headline is the approved positioning`,
      pub.includes(passportT("markets.headline", lang)),
    );
    ck(
      `9.${lang} the four steps are rendered in order`,
      [1, 2, 3, 4].every((n) =>
        pub.includes(passportT(`markets.how.${n}` as PassportCopyKey, lang)),
      ) &&
        pub.indexOf(passportT("markets.how.1", lang)) <
          pub.indexOf(passportT("markets.how.4", lang)),
    );
    ck(
      `9.${lang} the employer line is rendered`,
      pub.includes(passportT("markets.employerLine", lang)),
    );
    ck(
      `9.${lang} the cards say they describe availability, not the holder's credentials`,
      pub.includes(passportT("markets.notCredentials", lang)),
    );

    const pilot = cards(PILOT, lang);
    ck(
      `9.${lang} an entitled holder's market becomes usable`,
      /data-market-card="GB"[^>]*data-holder-access="pilot"/.test(pilot) &&
        /data-market-action="add"/.test(pilot),
    );
    ck(
      `9.${lang} and keeps the pilot warning`,
      /data-market-pilot-note/.test(pilot) && pilot.includes(passportT("markets.pilot.note", lang)),
    );
    ck(
      `9.${lang} Sweden is not the current market there and offers "choose"`,
      /data-market-card="SE"[\s\S]*?data-market-action="choose"/.test(pilot),
    );
  }
  const loading = html(<MarketOverviewCards state={{ status: "loading" }} />);
  const failed = html(<MarketOverviewCards state={{ status: "failed" }} />);
  ck(
    "9.states loading and failure are explicit",
    /role="status"/.test(loading) &&
      /role="alert"/.test(failed) &&
      failed.includes(passportT("markets.failed", "sv")),
  );

  // The admin section, rendered in both languages from a literal.
  const rows = [
    {
      marketPackCode: "GB",
      nameSv: "Storbritannien",
      nameEn: "Great Britain",
      inPilot: true,
      entitlement: {
        active: true,
        grantedAt: "2026-09-01T09:00:00Z",
        revokedAt: null,
        note: "UAT: SIA",
      },
    },
    {
      marketPackCode: "GB-NI",
      nameSv: "Nordirland",
      nameEn: "Northern Ireland",
      inPilot: true,
      entitlement: {
        active: false,
        grantedAt: "2026-08-01T09:00:00Z",
        revokedAt: "2026-08-15T09:00:00Z",
        note: null,
      },
    },
    {
      marketPackCode: "AE-DU",
      nameSv: "Dubai",
      nameEn: "Dubai",
      inPilot: false,
      entitlement: null,
    },
  ];
  for (const lang of ["sv", "en"] as const) {
    const t = (k: keyof (typeof dictionaries)["sv"]) => dictionaries[lang][k];
    const m = renderToStaticMarkup(
      <I18nProvider initialLang={lang}>
        <PassportPilotAccessSection
          rows={rows}
          status="ready"
          pending={false}
          errorMessage={null}
          onGrant={noop}
          onRevoke={noop}
        />
      </I18nProvider>,
    );
    ck(
      `9.admin.${lang} three rows, three states`,
      /data-pilot-state="active"/.test(m) &&
        /data-pilot-state="revoked"/.test(m) &&
        /data-pilot-state="none"/.test(m),
    );
    ck(
      `9.admin.${lang} an active entitlement offers revoke, not grant`,
      /data-pilot-market="GB"[\s\S]*?data-pilot-action="revoke"/.test(m),
    );
    const duBlock = m.slice(m.indexOf('data-pilot-market="AE-DU"'));
    const grantTag = /<button[^>]*data-pilot-action="grant"[^>]*>/.exec(duBlock)?.[0] ?? "";
    ck(
      `9.admin.${lang} a market not in pilot cannot be granted`,
      grantTag.length > 0 && /\bdisabled\b/.test(grantTag),
    );
    ck(
      `9.admin.${lang} says a grant is not approval, verification or a judgement`,
      m.includes(t("admin.users.pilot.notApproval")),
    );
    ck(
      `9.admin.${lang} the note is optional and internal`,
      m.includes(t("admin.users.pilot.note.optional")),
    );
  }

  // Copy: every new key exists in both languages and says nothing forbidden.
  const newKeys = (Object.keys(passportCopy.sv) as PassportCopyKey[]).filter((k) =>
    /^(catalogue|markets)\./.test(k),
  );
  ck("9.copy the new Passport keys exist", newKeys.length >= 35);
  ck(
    "9.copy every new key has both languages, non-empty",
    newKeys.every((k) => passportT(k, "sv").trim() && passportT(k, "en").trim()),
  );
  const adminKeys = Object.keys(dictionaries.sv).filter((k) => k.startsWith("admin.users.pilot."));
  ck(
    "9.copy the admin keys exist in both languages",
    adminKeys.length >= 20 &&
      adminKeys.every((k) => (dictionaries.en as Record<string, string>)[k]?.trim()),
  );
  const FORBIDDEN =
    /globally licen[cs]ed|approved everywhere|automatically compliant|deployable|\bsuitab|trusted everywhere|globalt licensierad|godkän[dt] överallt|automatiskt (efterlev|kompatibel|regelenlig)|utplacerbar|lämplig|betrodd överallt|equivalent to|motsvarar en/i;
  const allNew = [
    ...newKeys.flatMap((k) => [passportT(k, "sv"), passportT(k, "en")]),
    ...adminKeys.flatMap((k) => [
      dictionaries.sv[k as keyof (typeof dictionaries)["sv"]],
      (dictionaries.en as Record<string, string>)[k],
    ]),
  ];
  ck(
    "9.copy none of the forbidden positioning words appears",
    allNew.every((s) => !FORBIDDEN.test(s)),
    allNew.filter((s) => FORBIDDEN.test(s)).join(" | "),
  );
  ck(
    "9.copy the approved headline is verbatim",
    passportT("markets.headline", "en") ===
      "One Security Passport. Market-specific verification. Built to move with your career." &&
      passportT("markets.headline", "sv") ===
        "Ett Security Passport. Marknadsspecifik verifiering. Byggt för att följa din karriär.",
  );
}

console.log(
  fails.length === 0
    ? `\npassport-market-catalogue-check: ${count} assertions passed.`
    : `\npassport-market-catalogue-check FAILED (${fails.length} of ${count}):\n  - ${fails.join("\n  - ")}`,
);
process.exit(fails.length === 0 ? 0 : 1);
