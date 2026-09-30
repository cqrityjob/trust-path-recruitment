// Career Center journey — regression guard for the 2026-09-26 journey work.
//
// ── THE DEFECTS THIS PINS ──────────────────────────────────────────────
//
//  D1  A recommended profession without a published guide dead-ended in the
//      Career Center ("Vi har ingen publicerad yrkesguide") while the report
//      opened an in-card panel for the same recommendation.
//  D2  "Vilket yrke arbetar du i i dag?" never offered "Läs om {yrke}"
//      unless more than three transitions existed, printed "no directions"
//      as if nothing were possible, and could not be cleared by a signed-in
//      reader: clearing deleted `from` and the profile's role came back.
//  D3  A saved profession without a guide (e.g. Larmoperatör) was shown as
//      its raw slug.
//  D4  Personal reads were keyed on a signed-in BOOLEAN: two accounts in one
//      tab shared a cache entry. Writes (a new assessment, a profile edit)
//      invalidated none of the Career Center's reads.
//  D5  `?all=1` (the router parses it as the NUMBER 1) left the catalogue
//      collapsed; "Utforska alla yrken i stället" was a bare `#anchor` to a
//      collapsed section.
//  D6  `/career-center/vaktare` (a CIG slug) reached "not published" although
//      the Väktare guide is published at `security-officer`.
//  D7  Guides linked to /jobs even while the job board rendered "coming soon".
//
// And for the simplification pass (2026-09-27):
//
//  D8  Choosing a profession showed at most three next steps, each linked
//      only through its heading, then "Se alla N nästa steg i yrkesguiden" —
//      another hop. A profession with no recorded step, the analysis offer
//      and an unknown saved role all sent the reader into the catalogue's
//      search box and 29 filter chips. Now every recorded next profession is
//      a card that says "Läs om {yrke}" and opens it; with none recorded, the
//      guide's related professions and the list of every profession are
//      offered instead — labelled as what they are.
//
// ── WHAT THIS RENDERS ──────────────────────────────────────────────────
//
// The REAL components, server-rendered in Swedish and English, with
// <Link> replaced by a plain anchor carrying the resolved href (it throws
// outside a RouterProvider). Behaviour that needs a browser — scrolling,
// focus movement, navigation — is covered by e2e/career-center-journey.spec.ts
// and the persistence evidence by scripts/career-center-persistence-local.ts.
//
// Run: bun run career-center-journey:check

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FIRST_WAVE_CATALOG } from "./fixtures/first-wave-profession-catalog";

const actualRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...actualRouter,
  Link: ({
    to,
    params,
    search,
    hash,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    if (search && typeof search === "object") {
      const qs = new URLSearchParams(
        Object.entries(search as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
      ).toString();
      if (qs) href += `?${qs}`;
    }
    if (hash) href += `#${String(hash)}`;
    const { activeProps: _a, inactiveProps: _i, resetScroll: _r, replace: _p, ...dom } = rest;
    return React.createElement("a", { href, ...dom }, children);
  },
  useRouter: () => ({ history: { push: () => undefined } }),
}));

// The career analysis status (useCareerAnalysisOpen) is a switch here, so the
// static render never loads the server-function client and the personal
// section can be rendered with both answers: not known yet (the default, the
// offer stands) and definitely not open (the offer is withdrawn).
let analysisOpen: boolean | undefined = undefined;
await mock.module("@/components/career-discovery/use-career-analysis-open", () => ({
  useCareerAnalysisOpen: () => analysisOpen,
}));

const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const cc = await import("../src/lib/career-center");
const { careerCenterKeys, invalidateAssessmentResultReads, invalidateCurrentProfessionReads } =
  await import("../src/lib/career-center/personal-cache");
const { rememberReturn, readReturn } = await import("../src/lib/career-center/return-context");
const { deriveCareerDirection } = await import("../src/lib/professional-identity/career-direction");
const { PathFromSection } = await import("../src/components/career-center/PathFromSection");
const { PersonalDirectionSection } =
  await import("../src/components/career-center/PersonalDirection");
const { CatalogueProfessionView } =
  await import("../src/components/career-center/CatalogueProfession");
const { CareerEntryCards } = await import("../src/components/career-center/CareerEntryCards");

const fails: string[] = [];
function ck(name: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

type Lang = "sv" | "en";
const LANGS: readonly Lang[] = ["sv", "en"];
const dict = dictionaries as unknown as Record<Lang, Record<string, string>>;
const APPROVED = FIRST_WAVE_CATALOG.filter((p) => p.professionId <= "SP014");

function render(node: React.ReactNode, lang: Lang, qc = new QueryClient()): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <I18nProvider initialLang={lang}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
}
/** All attribute values of one attribute in the markup. */
function attrs(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`${name}="([^"]*)"`, "g"))].map((m) => m[1]);
}
const noop = () => undefined;

// =========================================================================
group("1 · Every recommendable profession has an information action with its own identity (D1)");
// =========================================================================
for (const p of APPROVED) {
  const dest = cc.professionInfoDestination({ cigSlug: p.cigProfessionSlug });
  ck(`1.1 ${p.professionId} ${p.titleSv}: has a destination`, dest.kind !== "none");
  if (dest.kind === "career_center") {
    const guide = cc.getPublishedProfession(dest.slug)!;
    // Identity: the guide's own CIG node IS the recommendation's CIG slug.
    ck(
      `1.2 ${p.professionId}: the guide is the same profession (bridge round-trip)`,
      cc.jobsProfessionSlug(guide) === p.cigProfessionSlug,
      `${dest.slug} -> ${cc.jobsProfessionSlug(guide)}`,
    );
  } else if (dest.kind === "catalogue_profile") {
    ck(
      `1.3 ${p.professionId}: the catalogue page reads exactly its CIG slug`,
      dest.cigSlug === p.cigProfessionSlug,
    );
  }
  // The Career Center's personal section uses the SAME destination.
  const direction = cc.personalDirection(
    {
      state: "ready",
      completedAt: null,
      reportHref: "/security-career-assessment/report/x",
      topRole: {
        rank: 1,
        titleSv: p.titleSv,
        titleEn: p.titleEn,
        cigSlug: p.cigProfessionSlug,
        confidence: "moderate",
      },
      alternativeRoles: [],
      strengthThemes: [],
      frozenLocale: "sv",
    },
    { signedIn: true },
  );
  ck(
    `1.4 ${p.professionId}: Career Center and report agree on the destination`,
    direction.state === "ready" &&
      JSON.stringify(direction.primary.info) ===
        JSON.stringify(cc.exploreDestinationFor({ cigProfessionSlug: p.cigProfessionSlug })),
  );
  for (const lang of LANGS) {
    const html = render(
      <PersonalDirectionSection direction={direction} listAnchor="utforska-yrken" />,
      lang,
    );
    const expected =
      dest.kind === "career_center"
        ? dest.slug
        : dest.kind === "catalogue_profile"
          ? dest.cigSlug
          : "";
    ck(
      `1.5 [${lang}] ${p.professionId}: "Läs om" is a link to that identity`,
      attrs(html, "data-profession-info").includes(expected) &&
        html.includes(`href="${dest.kind === "none" ? "#" : dest.href}"`),
    );
    ck(
      `1.6 [${lang}] ${p.professionId}: no "no guide" dead end remains`,
      !html.includes(dict[lang]["cc.me.noGuide"]),
    );
  }
}
ck(
  "1.7 a CIG slug is never matched to a neighbouring guide (personskyddsvakt ≠ close-protection)",
  cc.professionInfoDestination({ cigSlug: "personskyddsvakt" }).kind === "catalogue_profile",
);
ck(
  "1.8 a malformed slug never becomes a URL",
  cc.professionInfoDestination({ cigSlug: "../../x" }).kind === "none" &&
    cc.professionInfoDestination({ cigSlug: "Polis" }).kind === "none",
);

// =========================================================================
group("2 · Every published profession card reaches its own guide; aliases resolve (D6)");
// =========================================================================
for (const p of cc.publishedProfessions) {
  const d = cc.professionInfoDestination({ careerCenterSlug: p.slug });
  ck(
    `2.1 ${p.slug}: its card destination is its own guide`,
    d.kind === "career_center" && d.slug === p.slug && d.href === `/career-center/${p.slug}`,
  );
  const cig = cc.jobsProfessionSlug(p);
  if (cig) {
    const viaCig = cc.professionInfoDestination({ careerCenterSlug: cig });
    ck(
      `2.2 /career-center/${cig} resolves to /career-center/${p.slug}`,
      viaCig.kind === "career_center" && viaCig.slug === p.slug,
    );
  }
}
{
  const route = readFileSync(
    path.resolve(import.meta.dir, "../src/routes/career-center.$profession.tsx"),
    "utf8",
  );
  ck(
    "2.3 the guide route redirects aliases through professionInfoDestination",
    route.includes("beforeLoad") && route.includes("professionInfoDestination"),
  );
  ck(
    "2.4 the catalogue route exists and defers to a published guide",
    existsSync(path.resolve(import.meta.dir, "../src/routes/career-center.yrke.$cigSlug.tsx")) &&
      readFileSync(
        path.resolve(import.meta.dir, "../src/routes/career-center.yrke.$cigSlug.tsx"),
        "utf8",
      ).includes("careerCenterProfessionSlug(params.cigSlug)"),
  );
}

// =========================================================================
group("3 · Current profession: saved, temporary, cleared, reset (D2, D3)");
// =========================================================================
{
  const saved = cc.careerOrigin({ profileSlug: "vaktare" });
  ck(
    "3.1 profile default: the saved profession, labelled as saved",
    saved.state === "ready" &&
      saved.profession.id === "security-officer" &&
      saved.provenance === "profile",
  );
  const temp = cc.careerOrigin({ profileSlug: "vaktare", selectedSlug: "ordningsvakt" });
  ck(
    "3.2 a temporary selection wins and is labelled temporary; the saved role is still known",
    temp.state === "ready" &&
      temp.profession.id === "ordningsvakt" &&
      temp.provenance === "selected" &&
      temp.saved?.profession?.id === "security-officer",
  );
  const same = cc.careerOrigin({ profileSlug: "vaktare", selectedSlug: "security-officer" });
  ck(
    "3.3 selecting the saved profession is not 'temporary'",
    same.state === "ready" && same.provenance === "profile",
  );
  const cleared = cc.careerOrigin({ profileSlug: "vaktare", selectedSlug: cc.ORIGIN_NONE });
  ck(
    "3.4 cleared means cleared — the profile does NOT come back",
    cleared.state === "unknown" && cleared.cleared && cleared.saved?.slug === "vaktare",
  );
  ck(
    "3.5 `from=none` survives the URL validator; junk does not",
    cc.parseHubSearch({ from: "none" }).from === "none" &&
      cc.parseHubSearch({ from: "nonsense" }).from === undefined,
  );
  const larm = cc.careerOrigin({
    profileSlug: "larmoperator",
    profileTitleSv: "Larmoperatör",
    profileTitleEn: "Alarm Centre Operator",
  });
  ck(
    "3.6 a saved catalogue role without a guide is named and linked to its own page",
    larm.state === "unsupported" &&
      larm.labelSv === "Larmoperatör" &&
      larm.info.kind === "catalogue_profile" &&
      larm.info.cigSlug === "larmoperator",
  );
  const noTitle = cc.careerOrigin({ profileSlug: "larmoperator" });
  ck(
    "3.7 never a raw slug as a label",
    noTitle.state === "unsupported" && noTitle.labelSv === null,
  );
  const free = cc.careerOrigin({ profileLabel: "Brandvakt" });
  ck(
    "3.8 a free-text role is kept honestly, with no invented destination",
    free.state === "unsupported" && free.labelSv === "Brandvakt" && free.info.kind === "none",
  );

  for (const lang of LANGS) {
    const t = dict[lang];
    const readyHtml = render(
      <PathFromSection
        origin={saved}
        profileStatus="ready"
        onSelect={noop}
        onClear={noop}
        onReset={noop}
        listAnchor="utforska-yrken"
      />,
      lang,
    );
    ck(
      `3.9 [${lang}] the selected profession is shown and "Läs om" is always present`,
      readyHtml.includes('data-path-selected="security-officer"') &&
        attrs(readyHtml, "data-profession-info").includes("security-officer"),
    );
    // D8: every recorded next profession is ON THE PAGE, each an action
    // that names it and opens it — no scroll-only "Se möjliga nästa steg"
    // button, no "Se alla N nästa steg i yrkesguiden" hop.
    ck(
      `3.10 [${lang}] every next profession from Väktare is its own "Läs om {yrke}" link`,
      saved.state === "ready" &&
        saved.directions.length === 4 &&
        readyHtml.includes('id="nasta-steg-fran-yrke"') &&
        saved.directions.every((tr) => {
          const title = lang === "sv" ? tr.to.titleSv : tr.to.titleEn;
          const link = new RegExp(
            `<a href="/career-center/${tr.to.slug}"[^>]*data-next-profession-link="${tr.to.slug}"[^>]*>${escapeRe(
              escapeHtml(t["cc.info.read"].replace("{role}", title)),
            )}`,
          );
          return link.test(readyHtml);
        }),
    );
    ck(
      `3.10b [${lang}] …with nothing that only scrolls or hops to the guide for the rest`,
      !readyHtml.includes("data-path-next-link") &&
        !readyHtml.includes('href="/career-center/security-officer#karriarsteg"'),
    );
    ck(
      `3.11 [${lang}] the question is the heading and the control is labelled`,
      readyHtml.includes(t["cc.path.select.label"]) && /<label[^>]*for="[^"]+"/.test(readyHtml),
    );
    const tempHtml = render(
      <PathFromSection
        origin={temp}
        profileStatus="ready"
        onSelect={noop}
        onClear={noop}
        onReset={noop}
        listAnchor="utforska-yrken"
      />,
      lang,
    );
    ck(
      `3.12 [${lang}] a temporary choice says so and offers the way back to the saved role`,
      tempHtml.includes('data-path-provenance="selected"') &&
        tempHtml.includes("data-path-reset") &&
        tempHtml.includes(t["cc.path.badge.temporary"]),
    );
    const clearedHtml = render(
      <PathFromSection
        origin={cleared}
        profileStatus="ready"
        onSelect={noop}
        onClear={noop}
        onReset={noop}
        listAnchor="utforska-yrken"
      />,
      lang,
    );
    ck(
      `3.13 [${lang}] cleared: nothing selected, profile untouched, reset offered`,
      clearedHtml.includes('data-path-state="unknown"') &&
        clearedHtml.includes("data-path-cleared") &&
        clearedHtml.includes("data-path-reset") &&
        !clearedHtml.includes("data-path-selected"),
    );
    const larmHtml = render(
      <PathFromSection
        origin={larm}
        profileStatus="ready"
        onSelect={noop}
        onClear={noop}
        onReset={noop}
        listAnchor="utforska-yrken"
      />,
      lang,
    );
    ck(
      `3.14 [${lang}] unsupported catalogue role: named, "Läs om" to its own page`,
      larmHtml.includes('data-path-unsupported="catalogue_profile"') &&
        larmHtml.includes('href="/career-center/yrke/larmoperator"') &&
        !larmHtml.includes(">larmoperator<"),
    );
    // D8, signed in: a saved profession the catalogue describes shows the
    // catalogue's own recorded moves where the reader chose it.
    const polisHtml = render(
      <PathFromSection
        origin={cc.careerOrigin({
          profileSlug: "polis",
          profileTitleSv: "Polis",
          profileTitleEn: "Police Officer",
          profileCatalogueNext: [
            {
              otherSlug: "sakerhetschef",
              otherTitleSv: "Säkerhetschef",
              otherTitleEn: "Head of Security",
              transitionKind: "promotion",
            },
            {
              otherSlug: "sakerhetsutredare",
              otherTitleSv: "Säkerhetsutredare",
              otherTitleEn: "Security Investigator",
              transitionKind: "specialisation",
            },
          ],
        })}
        profileStatus="ready"
        onSelect={noop}
        onClear={noop}
        onReset={noop}
        listAnchor="utforska-yrken"
      />,
      lang,
    );
    ck(
      `3.14b [${lang}] a catalogue role's recorded moves are shown on the spot, each opening its own page`,
      polisHtml.includes("data-path-catalogue-next") &&
        polisHtml.includes('href="/career-center/security-manager"') &&
        polisHtml.includes('href="/career-center/yrke/sakerhetsutredare"'),
    );
    const freeHtml = render(
      <PathFromSection
        origin={free}
        profileStatus="ready"
        onSelect={noop}
        onClear={noop}
        onReset={noop}
        listAnchor="utforska-yrken"
      />,
      lang,
    );
    ck(
      `3.15 [${lang}] free-text role: an honest next action, no fake profession link`,
      freeHtml.includes('data-path-unsupported="none"') &&
        freeHtml.includes('href="/security-career-assessment"') &&
        !freeHtml.includes("data-profession-info"),
    );
    const errHtml = render(
      <PathFromSection
        origin={cc.careerOrigin({})}
        profileStatus="error"
        onSelect={noop}
        onClear={noop}
        onReset={noop}
        listAnchor="utforska-yrken"
      />,
      lang,
    );
    ck(
      `3.16 [${lang}] a failed profile read is its own state, with a retry`,
      errHtml.includes(t["cc.path.profile.error"]) && errHtml.includes('role="alert"'),
    );
  }
}
// Every published origin: "Läs om" present regardless of transition count,
// and an honest empty state when none are documented.
for (const p of cc.selectableOrigins()) {
  const o = cc.careerOrigin({ selectedSlug: p.slug });
  const html = render(
    <PathFromSection
      origin={o}
      profileStatus="anonymous"
      onSelect={noop}
      onClear={noop}
      onReset={noop}
      listAnchor="utforska-yrken"
    />,
    "sv",
  );
  ck(
    `3.17 ${p.slug}: "Läs om" links to its own guide`,
    html.includes(`data-profession-info="${p.slug}"`) &&
      html.includes(`href="/career-center/${p.slug}"`),
  );
  if (o.state === "ready" && o.directions.length === 0) {
    ck(
      `3.18 ${p.slug}: no documented steps is said honestly, with a way on`,
      html.includes('data-path-next="empty"') &&
        !html.includes(dict.sv["cc.path.none"]) &&
        html.includes('href="#utforska-yrken"'),
    );
    ck(
      `3.18b ${p.slug}: the guide's related professions are offered — as related, never as steps`,
      o.related.length > 0 &&
        o.related.every((r) => html.includes(`href="/career-center/${r.slug}"`)) &&
        html.includes(escapeHtml(dict.sv["cc.path.related.body"].replace("{role}", p.titleSv))) &&
        !html.includes("data-next-profession-link"),
    );
  }
  if (o.state === "ready") {
    ck(
      `3.19 ${p.slug}: every recorded next profession is on the page, none behind a hop`,
      o.directions.every((tr) => html.includes(`data-next-profession-link="${tr.to.slug}"`)) &&
        (html.match(/data-next-profession-link=/g) ?? []).length === o.directions.length,
    );
  }
  ck(
    `3.20 ${p.slug}: no way on leads to a filtered catalogue`,
    !/[?&]all=|[?&](level|family|q)=/.test(html),
  );
}

// =========================================================================
group("4 · Recommended ≠ current: both shown, both correct, never merged");
// =========================================================================
{
  const stored = storedReport([
    ["sakerhetssamordnare", "Säkerhetssamordnare", "Security Coordinator", "moderate"],
    ["polis", "Polis", "Police Officer", "indicative"],
    ["vaktare", "Väktare", "Security Officer", "indicative"],
  ]);
  const career = deriveCareerDirection(stored);
  const direction = cc.personalDirection(career, { signedIn: true });
  const origin = cc.careerOrigin({ profileSlug: "vaktare" });
  ck(
    "4.1 the primary recommendation is the stored rank 1, labelled as such",
    direction.state === "ready" &&
      direction.primary.rank === 1 &&
      direction.primary.profession?.id === "security-coordinator",
  );
  ck(
    "4.2 alternatives keep the stored order and confidence",
    direction.state === "ready" &&
      direction.alternatives.map((a) => `${a.rank}:${a.confidence}`).join(",") ===
        "2:indicative,3:indicative",
  );
  ck(
    "4.3 the stored rationale is carried, not regenerated",
    direction.state === "ready" &&
      direction.primary.rationaleSv === "RATIONALE sakerhetssamordnare",
  );
  ck(
    "4.4 the current profession is independent of the recommendation",
    origin.state === "ready" && origin.profession.id === "security-officer",
  );
  for (const lang of LANGS) {
    const html = render(
      <PersonalDirectionSection
        direction={direction}
        listAnchor="utforska-yrken"
        savedProfessionId="security-officer"
      />,
      lang,
    );
    ck(
      `4.5 [${lang}] one visually primary card, then secondary alternatives`,
      (html.match(/data-personal-primary/g) ?? []).length === 1 &&
        html.indexOf("data-personal-primary") < html.indexOf('data-rank="2"'),
    );
    ck(
      `4.6 [${lang}] Polis (no guide) opens its own catalogue page`,
      html.includes('href="/career-center/yrke/polis"'),
    );
    ck(
      `4.7 [${lang}] guidance is not eligibility`,
      html.includes(dict[lang]["cc.me.notAssessed"].slice(0, 30)),
    );
    ck(
      `4.8 [${lang}] the recommendation does not claim to be the saved role`,
      !html.includes("data-personal-same-as-saved"),
    );
  }
}

// =========================================================================
group("5 · Older reports, failures and anonymous readers keep their own states");
// =========================================================================
{
  const cases: [string, ReturnType<typeof cc.personalDirection>, string][] = [
    ["anonymous", cc.personalDirection(undefined, { signedIn: false }), "anonymous"],
    ["no result", cc.personalDirection({ state: "none" }, { signedIn: true }), "no_result"],
    [
      "failed read",
      cc.personalDirection({ state: "unavailable" }, { signedIn: true }),
      "unreadable",
    ],
    [
      "legacy v2.1",
      cc.personalDirection(
        { state: "legacy", completedAt: null, reportHref: "/r/1" },
        { signedIn: true },
      ),
      "no_roles_named",
    ],
    [
      "v3.0 area-only",
      cc.personalDirection(deriveCareerDirection(v30Report()), { signedIn: true }),
      "no_roles_named",
    ],
  ];
  for (const [label, d, expected] of cases) {
    ck(`5.1 ${label} → ${expected}`, d.state === expected, d.state);
    const html = render(
      <PersonalDirectionSection direction={d} listAnchor="utforska-yrken" onRetry={noop} />,
      "sv",
    );
    ck(`5.2 ${label}: no invented recommendation`, !html.includes("data-personal-recommendation"));
    if (expected === "anonymous" || expected === "no_result" || expected === "no_roles_named") {
      ck(
        `5.3 ${label}: "Se alla yrken i stället" lands on the list, on this page (D5, D8)`,
        html.includes('href="#utforska-yrken"') && !html.includes("all=true"),
      );
    }
  }

  // MVP text specification §6/§7: the two invitation states, in the
  // specified words, and the offer withdrawn when the analysis is closed.
  const anonymous = cc.personalDirection(undefined, { signedIn: false });
  const noResult = cc.personalDirection({ state: "none" }, { signedIn: true });
  const invite = (d: typeof anonymous, lang: Lang) =>
    render(<PersonalDirectionSection direction={d} listAnchor="utforska-yrken" />, lang);
  for (const lang of LANGS) {
    const none = invite(noResult, lang);
    const anon = invite(anonymous, lang);
    ck(
      `5.4 [${lang}] a signed-in reader without an analysis is told so, in the specified words`,
      none.includes(dict[lang]["cc.me.none.body"]) && !anon.includes(dict[lang]["cc.me.none.body"]),
    );
    ck(
      `5.5 [${lang}] both invitation states offer the analysis while it is open or not yet known`,
      none.includes('href="/security-career-assessment"') &&
        anon.includes('href="/security-career-assessment"'),
    );
    analysisOpen = false;
    const closedNone = invite(noResult, lang);
    const closedAnon = invite(anonymous, lang);
    analysisOpen = undefined;
    ck(
      `5.6 [${lang}] a closed analysis is said, and no link opens it`,
      [closedNone, closedAnon].every(
        (h) =>
          h.includes(dict[lang]["home.career.closed"]) &&
          !h.includes('href="/security-career-assessment"') &&
          h.includes("data-explore-catalogue"),
      ),
    );
  }
}

// =========================================================================
group("6 · Account-scoped reads and write invalidation (D4)");
// =========================================================================
{
  const A = "aaaaaaaa-0000-4000-8000-000000000001";
  const B = "bbbbbbbb-0000-4000-8000-000000000002";
  ck(
    "6.1 keys differ per account",
    JSON.stringify(careerCenterKeys.activeReport(A)) !==
      JSON.stringify(careerCenterKeys.activeReport(B)) &&
      JSON.stringify(careerCenterKeys.statedProfession(A)) !==
        JSON.stringify(careerCenterKeys.statedProfession(B)),
  );
  const qc = new QueryClient();
  qc.setQueryData(careerCenterKeys.activeReport(A), { kind: "discovery", snapshotId: "A-snap" });
  ck(
    "6.2 account B reading its own key never receives account A's result",
    qc.getQueryData(careerCenterKeys.activeReport(B)) === undefined,
  );
  qc.setQueryData(["my-career", "active-report"], { kind: "none" });
  qc.setQueryData(careerCenterKeys.statedProfession(A), { currentProfessionSlug: "vaktare" });
  qc.setQueryData(["professional-identity"], {});
  qc.setQueryData(["unrelated", "passport"], {});
  invalidateAssessmentResultReads(qc);
  const stale = (k: readonly unknown[]) => qc.getQueryState([...k])?.isInvalidated === true;
  ck(
    "6.3 a new assessment result invalidates My Career AND Career Center reads",
    stale(careerCenterKeys.activeReport(A)) && stale(["my-career", "active-report"]),
  );
  ck("6.4 …and nothing unrelated", !stale(["unrelated", "passport"]));
  const qc2 = new QueryClient();
  qc2.setQueryData(careerCenterKeys.statedProfession(A), { currentProfessionSlug: "vaktare" });
  qc2.setQueryData(["unrelated", "passport"], {});
  invalidateCurrentProfessionReads(qc2);
  ck(
    "6.5 a profile profession write invalidates the Career Center's current-profession read",
    qc2.getQueryState([...careerCenterKeys.statedProfession(A)])?.isInvalidated === true &&
      qc2.getQueryState(["unrelated", "passport"])?.isInvalidated !== true,
  );
  const src = (f: string) => readFileSync(path.resolve(import.meta.dir, "..", f), "utf8");
  ck(
    "6.6 the hook keys every personal read on the account id, not a boolean",
    !/queryKey: \["career-center", "(active-report|career-profile)", signedIn\]/.test(
      src("src/hooks/useMyCareerDirection.ts"),
    ) && src("src/hooks/useMyCareerDirection.ts").includes("careerCenterKeys.activeReport("),
  );
  ck(
    "6.7 every writer of the result/profession invalidates through personal-cache",
    src("src/components/career-discovery/v31/PublicAssessmentFlow.tsx").includes(
      "invalidateAssessmentResultReads(queryClient)",
    ) &&
      src("src/components/career-discovery/v31/PublicAssessmentFlow.tsx").includes(
        "invalidateCurrentProfessionReads(queryClient)",
      ) &&
      src("src/components/assessment/SecurityCareerProfileCard.tsx").includes(
        "invalidateCurrentProfessionReads(queryClient)",
      ) &&
      src("src/routes/_authenticated.passport.start.tsx").includes(
        "invalidateCurrentProfessionReads(queryClient)",
      ),
  );
  ck(
    "6.8 the root still clears the whole cache on sign-out and on an account switch",
    /event === "SIGNED_OUT"[\s\S]{0,120}queryClient\.clear\(\)/.test(
      src("src/routes/__root.tsx"),
    ) &&
      /nextUserId !== lastUserId[\s\S]{0,120}queryClient\.clear\(\)/.test(
        src("src/routes/__root.tsx"),
      ),
  );
}

// =========================================================================
group("7 · Old catalogue links and return context (D5, D8)");
// =========================================================================
// The catalogue no longer opens or narrows: its links still land on the hub
// (and on the list, by their hash), and every one of their parameters is
// recognised — so the hub can take it out of the address — and ignored.
for (const raw of [true, "true", "1", 1]) {
  ck(
    `7.1 ?all=${JSON.stringify(raw)} is recognised as an old link and narrows nothing`,
    cc.hasLegacyCatalogueParams({ all: raw }) &&
      Object.keys(cc.parseHubSearch({ all: raw })).length === 0,
  );
}
ck(
  "7.2 an old narrowing filter narrows nothing, and the current profession survives it",
  Object.keys(cc.parseHubSearch({ family: "guarding", level: "entry", q: "väktare" })).length ===
    0 && cc.parseHubSearch({ level: "entry", from: "ordningsvakt" }).from === "ordningsvakt",
);
{
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
    location: { pathname: "/career-center", search: "?all=true&level=entry" },
  };
  rememberReturn(
    "/career-center/ordningsvakt",
    "catalogue",
    "/career-center?all=true&level=entry#utforska-yrken",
  );
  const back = readReturn("/career-center/ordningsvakt");
  ck(
    "7.3 the way back restores exactly the view it was written for",
    back?.origin === "catalogue" &&
      back.href === "/career-center?all=true&level=entry#utforska-yrken",
  );
  ck(
    "7.4 a context for another profession is never used",
    readReturn("/career-center/skyddsvakt") === null,
  );
  rememberReturn("/career-center/x", "catalogue", "//evil.example/");
  ck("7.5 a non-local href is never stored", readReturn("/career-center/x") === null);
  // D8: one entry per page, so a chain unwinds the way it was walked — hub →
  // Väktare → Ordningsvakt → back → back — and a move between professions
  // names the one the way back leads to.
  rememberReturn(
    "/career-center/security-officer",
    "current_role",
    "/career-center?from=security-officer#fran-mitt-yrke",
  );
  rememberReturn(
    "/career-center/ordningsvakt",
    "profession",
    "/career-center/security-officer#karriarsteg",
    { sv: "Väktare", en: "Security Officer" },
  );
  const fromGuide = readReturn("/career-center/ordningsvakt");
  const toHub = readReturn("/career-center/security-officer");
  ck(
    "7.6 each page keeps its own way back, so the chain unwinds",
    fromGuide?.origin === "profession" &&
      fromGuide.title?.sv === "Väktare" &&
      toHub?.origin === "current_role" &&
      toHub.href === "/career-center?from=security-officer#fran-mitt-yrke",
  );
  store.set(
    "cqrityjob.career-center.return",
    JSON.stringify({
      target: "/career-center/skyddsvakt",
      origin: "catalogue",
      href: "/career-center",
    }),
  );
  ck(
    "7.7 a context stored by the previous version is still read",
    readReturn("/career-center/skyddsvakt")?.href === "/career-center",
  );
  delete (globalThis as unknown as { window?: unknown }).window;
}

// =========================================================================
group("8 · The catalogue page: content, failure, not published — never another profession");
// =========================================================================
{
  const detail = {
    slug: "polis",
    titleSv: "Polis",
    titleEn: "Police Officer",
    isRegulated: true,
    jurisdiction: "SE",
    lastVerified: "2026-09-01",
    disclaimerSv: null,
    disclaimerEn: null,
    sources: [
      { organisation: "Polismyndigheten", title: "Bli polis", url: "https://polisen.se/blipolis/" },
    ],
    summarySv: "Polisyrket kräver antagning till polisprogrammet.",
    summaryEn: "Becoming a police officer requires admission to the police programme.",
    overviewSv: null,
    overviewEn: null,
    ssykCode: null,
    requirements: [],
    education: [],
    certifications: [],
    pathway: [
      {
        direction: "to" as const,
        otherSlug: "sakerhetschef",
        otherTitleSv: "Säkerhetschef",
        otherTitleEn: "Head of Security",
        transitionKind: "pivot",
      },
    ],
  };
  for (const lang of LANGS) {
    const t = dict[lang];
    const qc = new QueryClient();
    qc.setQueryData(["career-center", "catalogue-profession", "polis"], detail);
    const html = render(<CatalogueProfessionView cigSlug="polis" />, lang, qc);
    ck(
      `8.1 [${lang}] titled for exactly that profession`,
      html.includes(">" + (lang === "sv" ? "Polis" : "Police Officer") + "</h1>"),
    );
    ck(
      `8.2 [${lang}] section navigation, requirements, next steps, jobs and sources are present`,
      ["om-yrket", "krav", "utbildning", "karriarsteg", "jobb", "kallor"].every((id) =>
        html.includes(`id="${id}"`),
      ) && html.includes("data-profession-section-nav"),
    );
    ck(
      `8.3 [${lang}] an empty requirement list is said, not hidden, and never read as "none needed"`,
      html.includes(t["cc.cat.formal.empty"].slice(0, 25)),
    );
    ck(
      `8.4 [${lang}] a documented next step opens ITS OWN information (the guide)`,
      html.includes('href="/career-center/security-manager"'),
    );
    ck(
      `8.5 [${lang}] review date and source are visible`,
      html.includes("2026-09-01") && html.includes("Bli polis"),
    );
    ck(
      `8.6 [${lang}] the page says it is a catalogue summary, not a guide`,
      html.includes(t["cc.cat.notice"].slice(0, 30)),
    );

    const noSteps = new QueryClient();
    noSteps.setQueryData(["career-center", "catalogue-profession", "polis"], {
      ...detail,
      pathway: [],
    });
    const nHtml = render(<CatalogueProfessionView cigSlug="polis" />, lang, noSteps);
    ck(
      `8.9 [${lang}] no recorded next step: said, with the way to every profession`,
      nHtml.includes('data-catalogue-next="empty"') &&
        nHtml.includes('href="/career-center#utforska-yrken"') &&
        !nHtml.includes("all=true"),
    );

    const missing = new QueryClient();
    missing.setQueryData(["career-center", "catalogue-profession", "okand"], null);
    const mHtml = render(<CatalogueProfessionView cigSlug="okand" />, lang, missing);
    ck(
      `8.7 [${lang}] not published: an honest state`,
      mHtml.includes('data-catalogue-state="not_published"'),
    );

    // A failed read that is NOT retried on mount (in the browser the page
    // first retries, showing its loading state, and lands here after).
    const failed = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
    const q = failed.getQueryCache().build(failed, {
      queryKey: ["career-center", "catalogue-profession", "polis"],
      retry: false,
    });
    q.setState({ status: "error", error: new Error("network"), fetchStatus: "idle" } as never);
    const eHtml = render(<CatalogueProfessionView cigSlug="polis" />, lang, failed);
    ck(
      `8.8 [${lang}] a failed read is an error with a retry — not "not published"`,
      eHtml.includes('data-catalogue-state="error"') && eHtml.includes(t["cc.cat.error.retry"]),
    );
  }
}

// =========================================================================
group("9 · Entry doors, jobs availability and bilingual copy (D7)");
// =========================================================================
for (const lang of LANGS) {
  const anon = render(
    <CareerEntryCards
      pathAnchor="fran-mitt-yrke"
      personalAnchor="min-riktning"
      listAnchor="utforska-yrken"
    />,
    lang,
  );
  ck(
    `9.1 [${lang}] without a result the guidance door leads to the analysis, not to an empty section`,
    anon.includes('href="/security-career-assessment"') && !anon.includes("#min-riktning"),
  );
  const mine = render(
    <CareerEntryCards
      pathAnchor="fran-mitt-yrke"
      personalAnchor="min-riktning"
      listAnchor="utforska-yrken"
      personalised
    />,
    lang,
  );
  ck(`9.2 [${lang}] with a result it leads to the recommendation`, mine.includes("#min-riktning"));
}
{
  const nextStep = readFileSync(
    path.resolve(import.meta.dir, "../src/components/career-center/NextStepPanel.tsx"),
    "utf8",
  );
  ck(
    "9.3 the guide's jobs link respects the job board's release flag",
    nextStep.includes("jobsEnabled()") && nextStep.includes('t("cc.jobs.closed")'),
  );
}
{
  const used = new Set<string>();
  for (const f of [
    "src/components/career-center/PathFromSection.tsx",
    "src/components/career-center/PersonalDirection.tsx",
    "src/components/career-center/CatalogueProfession.tsx",
    "src/components/career-center/ProfessionInfoAction.tsx",
    "src/components/career-center/ProfessionBackLink.tsx",
    "src/components/career-center/ProfessionSectionNav.tsx",
    "src/components/career-center/CareerEntryCards.tsx",
    "src/components/career-center/NextProfessionCard.tsx",
    "src/components/career-center/connection-text.ts",
    "src/components/career-center/ProfessionCard.tsx",
    "src/components/career-center/NextStepPanel.tsx",
    "src/components/career-center/ProfessionTemplate.tsx",
    "src/routes/career-center.index.tsx",
  ]) {
    for (const m of readFileSync(path.resolve(import.meta.dir, "..", f), "utf8").matchAll(
      /"(cc\.[a-zA-Z0-9.]+)"/g,
    )) {
      used.add(m[1]);
    }
  }
  const missing = [...used].filter((k) => !dict.sv[k] || !dict.en[k]);
  ck(
    "9.4 every key the journey renders exists in Swedish and English",
    missing.length === 0,
    missing.join(", "),
  );
  // A pure template — placeholders and punctuation, no words — is the same in
  // every language by construction ("{level} – {relation}.").
  const pureTemplate = (text: string) => text.replace(/\{[a-z]+\}/g, "").trim().length <= 3;
  const untranslated = [...used].filter(
    (k) =>
      dict.sv[k] &&
      dict.sv[k] === dict.en[k] &&
      !/^[A-Z]{2,}$/.test(dict.sv[k]) &&
      !pureTemplate(dict.sv[k]),
  );
  ck("9.5 …and the English is not the Swedish", untranslated.length === 0, untranslated.join(", "));
  // A sentence that tells the reader they ARE qualified — as opposed to the
  // required disclaimers, which say the opposite and carry a negation.
  const claims = [...used].filter((k) =>
    [dict.sv[k], dict.en[k]].some(
      (text) =>
        /(du är (behörig|kvalificerad|godkänd)|you are (qualified|eligible|approved))/i.test(
          text,
        ) && !/\b(inte|ej|aldrig|not|never|no)\b/i.test(text),
    ),
  );
  ck(
    "9.6 no journey copy tells a reader they are qualified or eligible",
    claims.length === 0,
    claims.join(", "),
  );
}

// =========================================================================
group("10 · Keyboard and target size on every new control");
// =========================================================================
{
  const o = cc.careerOrigin({ profileSlug: "vaktare", selectedSlug: "ordningsvakt" });
  const html =
    render(
      <PathFromSection
        origin={o}
        profileStatus="ready"
        onSelect={noop}
        onClear={noop}
        onReset={noop}
        listAnchor="utforska-yrken"
      />,
      "sv",
    ) +
    render(
      <PersonalDirectionSection
        direction={cc.personalDirection(
          deriveCareerDirection(storedReport([["polis", "Polis", "Police", "moderate"]])),
          { signedIn: true },
        )}
        listAnchor="utforska-yrken"
      />,
      "sv",
    );
  const controls = [...html.matchAll(/<(a|button)\b([^>]*)>/g)].map((m) => m[2]);
  const small = controls.filter((a) => !/min-h-11|h-11/.test(a));
  ck(
    "10.1 every link and button is at least 44px tall",
    small.length === 0,
    small.slice(0, 3).join(" | "),
  );
  const noFocus = controls
    .filter((a) => /<button/.test(a) || /data-path-(reset|clear)/.test(a))
    .filter((a) => !/focus-visible:/.test(a));
  ck(
    "10.2 buttons draw a visible focus ring",
    noFocus.length === 0,
    noFocus.slice(0, 2).join(" | "),
  );
  ck(
    "10.3 no interactive control is nested inside another",
    !/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<(a|button)\b/.test(html),
  );
}

// =========================================================================
group("11 · A profession page reads in the order a reader asks, and never dead-ends (D8)");
// =========================================================================
{
  const { ProfessionTemplate } = await import("../src/components/career-center/ProfessionTemplate");
  // The four answers, then the fördjupning, then the sources.
  const ORDER = [
    "om-yrket",
    "krav",
    "utbildning",
    "karriarsteg",
    "nasta-steg",
    "mer-om-yrket",
    "kallor",
  ];
  for (const lang of LANGS) {
    const t = dict[lang];
    const guard = cc.getPublishedProfession("security-officer")!;
    const html = render(<ProfessionTemplate profession={guard} />, lang);
    const at = ORDER.map((id) => html.indexOf(`id="${id}"`));
    ck(
      `11.1 [${lang}] Väktare: tasks → requirements → education → next professions → jobs → more → sources`,
      at.every((i) => i !== -1) && at.every((i, n) => n === 0 || i > at[n - 1]),
      at.join(","),
    );
    ck(
      `11.2 [${lang}] the tasks come first, under their own heading`,
      html.indexOf(escapeHtml(t["cc.p.day"])) > -1 &&
        html.indexOf(escapeHtml(t["cc.p.day"])) < html.indexOf('id="krav"'),
    );
    const onward = cc.onwardTransitions(guard);
    ck(
      `11.3 [${lang}] every next profession is a "Läs om {yrke}" link to its own guide`,
      onward.length === 4 &&
        onward.every((tr) => {
          const title = lang === "sv" ? tr.to.titleSv : tr.to.titleEn;
          return new RegExp(
            `<a href="/career-center/${tr.to.slug}"[^>]*>${escapeRe(
              escapeHtml(t["cc.info.read"].replace("{role}", title)),
            )}`,
          ).test(html);
        }),
    );
    ck(
      `11.4 [${lang}] the competency profile is fördjupning, after the jobs`,
      html.indexOf('id="kompetenser"') > html.indexOf('id="nasta-steg"') &&
        html.indexOf('id="kompetenser"') > html.indexOf('id="mer-om-yrket"'),
    );

    // No recorded next step: said, then the guide's related professions and
    // the list of every profession. The page still goes on to the jobs.
    const chief = cc.getPublishedProfession("security-manager")!;
    const cHtml = render(<ProfessionTemplate profession={chief} />, lang);
    const related = cc.relatedGuides(chief, cc.onwardTransitions(chief));
    ck(
      `11.5 [${lang}] Säkerhetschef: no recorded step is said, with its related professions`,
      cHtml.includes('data-guide-next="empty"') &&
        related.length > 0 &&
        related.every((r) => cHtml.includes(`href="/career-center/${r.slug}"`)) &&
        cHtml.includes(
          escapeHtml(
            t["cc.path.related.body"].replace(
              "{role}",
              lang === "sv" ? chief.titleSv : chief.titleEn,
            ),
          ),
        ),
    );
    ck(
      `11.6 [${lang}] …the way to every profession, never a filtered catalogue`,
      cHtml.includes('href="/career-center#utforska-yrken"') && !/[?&]all=/.test(cHtml),
    );
    ck(
      `11.7 [${lang}] …and the jobs still follow`,
      cHtml.indexOf('id="nasta-steg"') > cHtml.indexOf('id="karriarsteg"') &&
        cHtml.includes("data-related-jobs"),
    );
  }
}

console.log("");
if (fails.length > 0) {
  console.error(`career-center-journey:check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("career-center-journey:check OK");

// ── fixtures ─────────────────────────────────────────────────────────────

/** Text as renderToStaticMarkup escapes it. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function storedReport(
  roles: readonly [
    slug: string,
    sv: string,
    en: string,
    confidence: "strong" | "moderate" | "indicative",
  ][],
) {
  return {
    status: "v3.1",
    snapshotId: "snap-journey",
    sessionId: "sess-journey",
    generatedAt: "2026-09-20T09:00:00Z",
    versions: { definition: "3.1.0", content: "3.1.0", scoring: "3.1.0", taxonomy: "3.1.0" },
    snapshot: {
      locale: "sv",
      completedAt: "2026-09-20T09:00:00Z",
      outputB: { leading: { patternId: "p1", name: "Den strukturerade" }, supporting: [] },
      professions: {
        available: true,
        ranked: roles.map(([slug, sv, en, confidence], i) => ({
          rank: i + 1,
          confidence,
          match: {
            professionId: `SP-${slug}`,
            cigProfessionSlug: slug,
            careerAreaId: "SCA01",
            titleSv: sv,
            titleEn: en,
            fitTier: "moderate",
            stage: "explore_now",
            regulated: false,
            inclusionRationaleSv: `RATIONALE ${slug}`,
            inclusionRationaleEn: `RATIONALE ${slug}`,
            limitationNoteSv: null,
            limitationNoteEn: null,
            alignedDimensions: [],
            coverage: 0,
            contextCorroborated: false,
          },
        })),
      },
    },
  } as never;
}

function v30Report() {
  return {
    status: "v3.0",
    snapshotId: "snap-v30",
    generatedAt: "2025-01-01T00:00:00Z",
    report: { strengths: [{ axis: "A1", axisName: { sv: "Analys", en: "Analysis" } }] },
  } as never;
}
