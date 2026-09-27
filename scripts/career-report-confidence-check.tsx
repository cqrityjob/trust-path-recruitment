// A saved report's confidence word — regression guard.
//
// ── THE DEFECT ─────────────────────────────────────────────────────────
//
// A saved v3.1 snapshot is JSON read back from the database. When a ranked
// profession's `confidence` was not one of strong / moderate / indicative —
// "high", `null`, or no value at all — every surface that printed it did
// `RECOMMENDATION_CONFIDENCE_LABEL[confidence][locale]`, got `undefined`
// from the first lookup and threw on the second. One unknown word took down
// the whole Career Center hub ("This page didn't load") and the report view.
//
// ── WHAT IS ASSERTED ───────────────────────────────────────────────────
//
//  1. The shared check accepts exactly the label map's OWN keys.
//  2. deriveCareerDirection keeps every entry — title, rank, rationale — and
//     carries an unknown confidence as `null`, never as a known word. The
//     first-ranked profession stays first: an entry is never dropped, so an
//     alternative is never promoted by accident.
//  3. The four read paths — deriveCareerDirection, the Career Center's
//     personal section, the report's recommendation and the Career Card —
//     do not throw, in Swedish and in English, for "high", a missing value
//     and `null`, and print the neutral "Bedömningsstyrka saknas" /
//     "Assessment confidence unavailable" for exactly those entries, in the
//     report's order.
//  4. strong / moderate / indicative print exactly the approved words they
//     printed before, and the neutral wording appears nowhere for them.
//
// scripts/career-center-negative-controls.ts removes each guard in turn and
// requires this check to fail for the right reason.
//
// Run: bun run career-report-confidence:check

import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FIRST_WAVE_CATALOG } from "./fixtures/first-wave-profession-catalog";
import type {
  ProfessionCatalogEntry,
  RankedProfession,
  RecommendationConfidence,
} from "../src/lib/career-discovery/v31/professions";

// <Link> throws outside a RouterProvider; a plain anchor carries its href.
const actualRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...actualRouter,
  Link: ({
    to,
    params,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    const {
      search: _s,
      hash: _h,
      activeProps: _a,
      inactiveProps: _i,
      resetScroll: _r,
      replace: _p,
      ...dom
    } = rest;
    return React.createElement("a", { href, ...dom }, children);
  },
  useRouter: () => ({ history: { push: () => undefined } }),
}));
// The analysis-status hook would load the server-function client.
await mock.module("@/components/career-discovery/use-career-analysis-open", () => ({
  useCareerAnalysisOpen: () => undefined,
}));

const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const explanations = await import("../src/lib/career-discovery/v31/profession-explanations");
const {
  RECOMMENDATION_CONFIDENCE_LABEL,
  RECOMMENDATION_CONFIDENCE_UNAVAILABLE_LABEL,
  isRecommendationConfidence,
  readRecommendationConfidence,
  recommendationConfidenceLabel,
} = explanations;
const { deriveCareerDirection } = await import("../src/lib/professional-identity/career-direction");
const { personalDirection } = await import("../src/lib/career-center/personal-direction");
const { PersonalDirectionSection } =
  await import("../src/components/career-center/PersonalDirection");
const { RecommendedProfessions } =
  await import("../src/components/career-discovery/v31/RecommendedProfessions");
const { buildCareerCardData } = await import("../src/lib/career-discovery/v31/career-card");

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
const VALID: readonly RecommendationConfidence[] = ["strong", "moderate", "indicative"];
const NEUTRAL = RECOMMENDATION_CONFIDENCE_UNAVAILABLE_LABEL;
const rank1Badge = (lang: Lang) =>
  (dictionaries[lang] as Record<string, string>)["careerDiscovery.report.v31.rec.rank1"];

/** The three shapes a saved confidence was seen to take, and must survive. */
const MISSING = Symbol("missing");
const INVALID: readonly { readonly name: string; readonly value: unknown }[] = [
  { name: '"high"', value: "high" },
  { name: "a missing value", value: MISSING },
  { name: "null", value: null },
];

/** Three real first-wave professions, in the order the report ranked them. */
const TRIO = ["SP006", "SP005", "SP001"].map(
  (id) => FIRST_WAVE_CATALOG.find((p) => p.professionId === id)!,
);
const title = (p: ProfessionCatalogEntry, lang: Lang) => (lang === "sv" ? p.titleSv : p.titleEn);

/** A confidence field as the saved JSON would carry it (absent for MISSING). */
function confidenceField(value: unknown): { confidence?: unknown } {
  return value === MISSING ? {} : { confidence: value };
}

/** A copy of `item` carrying the saved value as-is ("high", null, or no
 *  `confidence` property at all), bypassing the read path's check. */
function withRawConfidence<T extends object>(item: T, value: unknown): T {
  const copy = { ...item } as T & { confidence?: unknown };
  if (value === MISSING) delete copy.confidence;
  else copy.confidence = value;
  return copy;
}

/** A v3.1 stored report whose entries carry `confidences`, rank 1 first. */
function storedReport(confidences: readonly unknown[]) {
  return {
    status: "v3.1",
    snapshotId: "snap-confidence",
    sessionId: "sess-confidence",
    generatedAt: "2026-09-20T09:00:00Z",
    versions: { definition: "3.1.0", content: "3.1.0", scoring: "3.1.0", taxonomy: "3.1.0" },
    snapshot: {
      locale: "sv",
      completedAt: "2026-09-20T09:00:00Z",
      outputB: { leading: { patternId: "p1", name: "Den strukturerade" }, supporting: [] },
      professions: {
        available: true,
        ranked: TRIO.map((p, i) => ({
          rank: i + 1,
          ...confidenceField(confidences[i]),
          match: {
            professionId: p.professionId,
            cigProfessionSlug: p.cigProfessionSlug,
            careerAreaId: p.careerAreaId,
            titleSv: p.titleSv,
            titleEn: p.titleEn,
            fitTier: "moderate",
            stage: "explore_now",
            regulated: p.regulated,
            inclusionRationaleSv: `SKÄL ${p.professionId}`,
            inclusionRationaleEn: `REASON ${p.professionId}`,
            limitationNoteSv: null,
            limitationNoteEn: null,
            alignedDimensions: [],
            coverage: 0,
            contextCorroborated: false,
          },
        })),
      },
    },
  } as unknown as Parameters<typeof deriveCareerDirection>[0];
}

/** The report view's ranked list, as a saved snapshot hands it over. */
function rankedList(confidences: readonly unknown[]): RankedProfession[] {
  return TRIO.map(
    (p, i) =>
      ({
        rank: i + 1,
        ...confidenceField(confidences[i]),
        match: {
          professionId: p.professionId,
          cigProfessionSlug: p.cigProfessionSlug,
          careerAreaId: p.careerAreaId,
          titleSv: p.titleSv,
          titleEn: p.titleEn,
          fitTier: "moderate",
          stage: "explore_now",
          regulated: p.regulated,
          inclusionRationaleSv: `SKÄL ${p.professionId}`,
          inclusionRationaleEn: `REASON ${p.professionId}`,
          limitationNoteSv: null,
          limitationNoteEn: null,
          alignedDimensions: [],
          coverage: 0,
          contextCorroborated: false,
        },
      }) as unknown as RankedProfession,
  );
}

function render(node: React.ReactNode, lang: Lang): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLang={lang}>{node}</I18nProvider>
    </QueryClientProvider>,
  );
}
/** Render, or report the exception as the failure it is. */
function tryRender(name: string, node: () => React.ReactNode, lang: Lang): string | null {
  try {
    return render(node(), lang);
  } catch (e) {
    ck(name, false, e instanceof Error ? e.message : String(e));
    return null;
  }
}
/** The confidence badges in document order: [data-confidence, printed text]. */
function badges(html: string): [string, string][] {
  return [...html.matchAll(/<span data-confidence="([^"]*)"[^>]*>([^<]*)<\/span>/g)].map((m) => [
    m[1],
    m[2],
  ]);
}
/** What a badge should say for a saved value. */
function expected(value: unknown, lang: Lang): [string, string] {
  return isRecommendationConfidence(value)
    ? [value, RECOMMENDATION_CONFIDENCE_LABEL[value][lang]]
    : ["unavailable", NEUTRAL[lang]];
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/** Positions of each title in the markup, to prove the order survived. */
function inOrder(html: string, titles: readonly string[]): boolean {
  const at = titles.map((t) => html.indexOf(escapeHtml(t)));
  return at.every((p) => p >= 0) && at.every((p, i) => i === 0 || p > at[i - 1]);
}

// Every confidence mix the read paths must survive: each invalid shape at
// rank 1 beside valid neighbours (the first-ranked profession must stay
// first), each on all three ranks, and the three valid words unchanged.
const MIXES: readonly { readonly name: string; readonly values: readonly unknown[] }[] = [
  ...INVALID.map((c) => ({
    name: `rank 1 ${c.name}, ranks 2–3 valid`,
    values: [c.value, "moderate", "indicative"],
  })),
  ...INVALID.map((c) => ({ name: `all ranks ${c.name}`, values: [c.value, c.value, c.value] })),
  { name: "strong / moderate / indicative", values: ["strong", "moderate", "indicative"] },
  { name: "indicative / strong / moderate", values: ["indicative", "strong", "moderate"] },
];

// =========================================================================
group("1 · The shared check accepts exactly the label map's own keys");
// =========================================================================
ck(
  "1.1 the label map's keys are exactly strong, moderate, indicative",
  JSON.stringify(Object.keys(RECOMMENDATION_CONFIDENCE_LABEL).sort()) ===
    JSON.stringify([...VALID].sort()),
);
for (const v of VALID) {
  ck(`1.2 "${v}" is a known confidence`, isRecommendationConfidence(v));
  ck(`1.3 "${v}" is read as itself`, readRecommendationConfidence(v) === v);
  for (const lang of LANGS) {
    ck(
      `1.4 [${lang}] "${v}" prints its approved word, unchanged`,
      recommendationConfidenceLabel(v, lang) === RECOMMENDATION_CONFIDENCE_LABEL[v][lang],
    );
  }
}
for (const v of [
  "high",
  "Strong",
  "",
  "none",
  "toString",
  "constructor",
  "__proto__",
  "hasOwnProperty",
  null,
  undefined,
  0,
  1,
  true,
  {},
  [],
]) {
  const label = JSON.stringify(v) ?? String(v);
  ck(`1.5 ${label} is not a known confidence`, !isRecommendationConfidence(v));
  ck(
    `1.6 ${label} is read as unavailable, never as a known word`,
    readRecommendationConfidence(v) === null,
  );
  for (const lang of LANGS) {
    ck(
      `1.7 [${lang}] ${label} prints the neutral wording`,
      recommendationConfidenceLabel(v, lang) === NEUTRAL[lang],
    );
  }
}
ck(
  "1.8 the neutral wording is not one of the approved words",
  LANGS.every((lang) =>
    VALID.every((v) => RECOMMENDATION_CONFIDENCE_LABEL[v][lang] !== NEUTRAL[lang]),
  ),
);

// =========================================================================
group("2 · deriveCareerDirection keeps every entry and never guesses");
// =========================================================================
for (const mix of MIXES) {
  const career = deriveCareerDirection(storedReport(mix.values));
  const ready = career.state === "ready" ? career : null;
  const roles = ready ? [ready.topRole, ...ready.alternativeRoles] : [];
  ck(`2.1 ${mix.name}: the report is read, not refused`, Boolean(ready));
  ck(
    `2.2 ${mix.name}: the first-ranked profession stays first — nothing dropped or promoted`,
    roles.length === 3 && roles.every((r, i) => r?.rank === i + 1 && r.titleSv === TRIO[i].titleSv),
    roles.map((r) => `${r?.rank}:${r?.titleSv}`).join(", "),
  );
  ck(
    `2.3 ${mix.name}: every rationale is kept`,
    roles.every((r, i) => r?.rationaleSv === `SKÄL ${TRIO[i].professionId}`),
  );
  ck(
    `2.4 ${mix.name}: deriveCareerDirection carries an unknown confidence as unavailable (null), a known one as itself`,
    roles.every((r, i) =>
      isRecommendationConfidence(mix.values[i])
        ? r?.confidence === mix.values[i]
        : r?.confidence === null,
    ),
    roles.map((r) => String(r?.confidence)).join(", "),
  );

  const direction = personalDirection(career, { signedIn: true });
  const items = direction.state === "ready" ? [direction.primary, ...direction.alternatives] : [];
  ck(
    `2.5 ${mix.name}: the Career Center's primary is the report's rank 1`,
    direction.state === "ready" &&
      direction.primary.rank === 1 &&
      direction.primary.reportTitleSv === TRIO[0].titleSv &&
      items.map((i) => i.rank).join() === "1,2,3",
  );
}

// =========================================================================
group("3 · The Career Center's personal section, in both languages");
// =========================================================================
for (const lang of LANGS) {
  for (const mix of MIXES) {
    // Through the real read path…
    const direction = personalDirection(deriveCareerDirection(storedReport(mix.values)), {
      signedIn: true,
    });
    // The hub names a profession by its published guide when there is one
    // (the page the reader will open), else by the report's frozen title —
    // in the report's order, which section 2 pins to the snapshot's.
    const shown = direction.state === "ready" ? [direction.primary, ...direction.alternatives] : [];
    const titles = shown.map((i) =>
      i.profession
        ? lang === "sv"
          ? i.profession.titleSv
          : i.profession.titleEn
        : lang === "sv"
          ? i.reportTitleSv
          : i.reportTitleEn,
    );
    ck(
      `3.0 [${lang}] ${mix.name}: the hub is handed the report's three entries in order`,
      shown.map((i) => i.reportTitleSv).join() === TRIO.map((p) => p.titleSv).join(),
    );
    const viaRead = tryRender(
      `3.1 [${lang}] ${mix.name}: the Career Center renders without crashing`,
      () => <PersonalDirectionSection direction={direction} listAnchor="utforska-yrken" />,
      lang,
    );
    if (viaRead) {
      ck(`3.1 [${lang}] ${mix.name}: the Career Center renders without crashing`, true);
      const primaryCard = viaRead.slice(
        viaRead.indexOf("data-personal-primary"),
        viaRead.indexOf("</article>", viaRead.indexOf("data-personal-primary")),
      );
      ck(
        `3.2 [${lang}] ${mix.name}: the Career Center keeps the report's order, rank 1 as the primary`,
        inOrder(viaRead, titles) &&
          /data-personal-primary="true" data-rank="1"/.test(viaRead) &&
          primaryCard.includes(escapeHtml(titles[0])),
      );
      ck(
        `3.3 [${lang}] ${mix.name}: the Career Center prints each entry's own confidence wording`,
        JSON.stringify(badges(viaRead)) ===
          JSON.stringify(mix.values.map((v) => expected(v, lang))),
        JSON.stringify(badges(viaRead)),
      );
    }
    // …and with the raw saved value handed straight to the view, so the
    // view's own guard is tested, not only the read path in front of it.
    if (direction.state !== "ready") continue;
    const raw = {
      ...direction,
      primary: withRawConfidence(direction.primary, mix.values[0]),
      alternatives: direction.alternatives.map((a, i) => withRawConfidence(a, mix.values[i + 1])),
    };
    const viaRaw = tryRender(
      `3.4 [${lang}] ${mix.name}: the Career Center renders a raw saved value without crashing`,
      () => <PersonalDirectionSection direction={raw} listAnchor="utforska-yrken" />,
      lang,
    );
    if (viaRaw) {
      ck(
        `3.4 [${lang}] ${mix.name}: the Career Center renders a raw saved value without crashing`,
        true,
      );
      ck(
        `3.5 [${lang}] ${mix.name}: the Career Center labels a raw saved value neutrally, in order`,
        inOrder(viaRaw, titles) &&
          JSON.stringify(badges(viaRaw)) ===
            JSON.stringify(mix.values.map((v) => expected(v, lang))),
        JSON.stringify(badges(viaRaw)),
      );
    }
  }
}

// =========================================================================
group("4 · The report's recommendation, in both languages");
// =========================================================================
for (const lang of LANGS) {
  const titles = TRIO.map((p) => title(p, lang));
  for (const mix of MIXES) {
    const html = tryRender(
      `4.1 [${lang}] ${mix.name}: the report view renders without crashing`,
      () => <RecommendedProfessions ranked={rankedList(mix.values)} locale={lang} />,
      lang,
    );
    if (!html) continue;
    ck(`4.1 [${lang}] ${mix.name}: the report view renders without crashing`, true);
    const cards = [...html.matchAll(/data-recommendation-card="([^"]+)"/g)].map((m) => m[1]);
    ck(
      `4.2 [${lang}] ${mix.name}: the report view keeps the ranking, rank 1 as the recommendation`,
      cards.join() === TRIO.map((p) => p.professionId).join() &&
        inOrder(html, titles) &&
        html.indexOf(escapeHtml(rank1Badge(lang))) < html.indexOf(escapeHtml(titles[0])),
      cards.join(),
    );
    ck(
      `4.3 [${lang}] ${mix.name}: the report view keeps every rationale`,
      TRIO.every((p) =>
        html.includes(lang === "sv" ? `SKÄL ${p.professionId}` : `REASON ${p.professionId}`),
      ),
    );
    ck(
      `4.4 [${lang}] ${mix.name}: the report view prints each entry's own confidence wording`,
      JSON.stringify(badges(html)) === JSON.stringify(mix.values.map((v) => expected(v, lang))),
      JSON.stringify(badges(html)),
    );
  }
}

// =========================================================================
group("5 · The Career Card, in both languages");
// =========================================================================
for (const lang of LANGS) {
  for (const mix of MIXES) {
    let card: ReturnType<typeof buildCareerCardData> | null = null;
    try {
      card = buildCareerCardData({
        ranked: rankedList(mix.values),
        dimensions: [],
        locale: lang,
        definitionVersion: "cd-v3.1.0",
        generatedAt: "2026-09-20T09:00:00.000Z",
      });
    } catch (e) {
      ck(
        `5.1 [${lang}] ${mix.name}: the Career Card builds without crashing`,
        false,
        e instanceof Error ? e.message : String(e),
      );
    }
    if (!card) continue;
    ck(`5.1 [${lang}] ${mix.name}: the Career Card builds without crashing`, true);
    ck(
      `5.2 [${lang}] ${mix.name}: the Career Card keeps the ranking`,
      card.entries.map((e) => `${e.rank}:${e.title}`).join() ===
        TRIO.map((p, i) => `${i + 1}:${title(p, lang)}`).join(),
    );
    ck(
      `5.3 [${lang}] ${mix.name}: the Career Card prints each entry's own confidence wording`,
      JSON.stringify(card.entries.map((e) => e.confidenceLabel)) ===
        JSON.stringify(mix.values.map((v) => expected(v, lang)[1])),
      JSON.stringify(card.entries.map((e) => e.confidenceLabel)),
    );
  }
}

// =========================================================================
group("6 · Valid reports are untouched: no neutral wording anywhere");
// =========================================================================
for (const lang of LANGS) {
  const values = ["strong", "moderate", "indicative"];
  const direction = personalDirection(deriveCareerDirection(storedReport(values)), {
    signedIn: true,
  });
  const hub = render(
    <PersonalDirectionSection direction={direction} listAnchor="utforska-yrken" />,
    lang,
  );
  const report = render(<RecommendedProfessions ranked={rankedList(values)} locale={lang} />, lang);
  ck(
    `6.1 [${lang}] a valid report never shows "${NEUTRAL[lang]}"`,
    !hub.includes(NEUTRAL[lang]) && !report.includes(NEUTRAL[lang]),
  );
}

if (fails.length > 0) {
  console.error(`\ncareer-report-confidence:check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\ncareer-report-confidence:check: all assertions passed.");
