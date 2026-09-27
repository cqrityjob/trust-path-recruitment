// A saved report's stage — regression guard.
//
// ── THE DEFECT ─────────────────────────────────────────────────────────
//
// A saved v3.1 snapshot is JSON read back from the database. When a
// profession's `match.stage` was not one of explore_now / possible_next_step
// / longer_term / career_pivot — "future", `null`, or no value at all —
// every surface that printed it indexed STAGE_LABEL or STAGE_SENTENCE with
// it, got `undefined` and threw. One unknown stage took down the Career
// Center hub ("This page didn't load"), the report view and its tier cards.
//
// ── WHAT IS ASSERTED ───────────────────────────────────────────────────
//
//  1. The shared check accepts exactly STAGE_LABEL's OWN keys, and the
//     stage sentence of an unknown stage is the neutral one.
//  2. deriveCareerDirection keeps every entry — title, rank, rationale — and
//     carries an unknown stage as `null`, never as a known stage. The
//     first-ranked profession stays first: nothing is dropped or promoted.
//  3. The read paths — deriveCareerDirection, the Career Center's personal
//     section, the report's recommendation, its staged tier cards and the
//     Career Card — do not throw, in Swedish and English, for "future", a
//     missing value and `null`, and print the neutral "Tidsperspektiv
//     saknas" / "Timing unavailable" for exactly those entries, in order.
//  4. The four known stages print exactly the words they printed before.
//
// scripts/career-center-negative-controls.ts removes each guard in turn and
// requires this check to fail for the right reason.
//
// Run: bun run career-report-stage:check

import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FIRST_WAVE_CATALOG } from "./fixtures/first-wave-profession-catalog";
import type {
  ProfessionMatch,
  ProfessionStage,
  RankedProfession,
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
// The tier cards read profession details through a server function; a static
// render never fetches, so the hook only has to exist.
const actualStart = await import("@tanstack/react-start");
await mock.module("@tanstack/react-start", () => ({
  ...actualStart,
  useServerFn: () => async () => ({}),
}));

const { I18nProvider } = await import("../src/i18n/context");
const {
  STAGE_LABEL,
  STAGE_UNAVAILABLE_LABEL,
  STAGE_UNAVAILABLE_SENTENCE,
  explainMatch,
  isProfessionStage,
  professionStageLabel,
  readProfessionStage,
} = await import("../src/lib/career-discovery/v31/profession-explanations");
const { deriveCareerDirection } = await import("../src/lib/professional-identity/career-direction");
const { personalDirection } = await import("../src/lib/career-center/personal-direction");
const { PersonalDirectionSection } =
  await import("../src/components/career-center/PersonalDirection");
const { RecommendedProfessions } =
  await import("../src/components/career-discovery/v31/RecommendedProfessions");
const { ProfessionRecommendations } =
  await import("../src/components/career-discovery/v31/ProfessionRecommendations");
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
const VALID: readonly ProfessionStage[] = [
  "explore_now",
  "possible_next_step",
  "longer_term",
  "career_pivot",
];
const NEUTRAL = STAGE_UNAVAILABLE_LABEL;

/** The three shapes a saved stage was seen to take, and must survive. */
const MISSING = Symbol("missing");
const INVALID: readonly { readonly name: string; readonly value: unknown }[] = [
  { name: '"future"', value: "future" },
  { name: "a missing value", value: MISSING },
  { name: "null", value: null },
];

/** Three real first-wave professions, in the order the report ranked them. */
const TRIO = ["SP006", "SP005", "SP001"].map(
  (id) => FIRST_WAVE_CATALOG.find((p) => p.professionId === id)!,
);

/** A match as the saved JSON would carry it (no `stage` for MISSING). */
function match(p: (typeof TRIO)[number], stage: unknown): ProfessionMatch {
  const m: Record<string, unknown> = {
    professionId: p.professionId,
    cigProfessionSlug: p.cigProfessionSlug,
    careerAreaId: p.careerAreaId,
    titleSv: p.titleSv,
    titleEn: p.titleEn,
    fitTier: "moderate",
    regulated: p.regulated,
    inclusionRationaleSv: `SKÄL ${p.professionId}`,
    inclusionRationaleEn: `REASON ${p.professionId}`,
    limitationNoteSv: null,
    limitationNoteEn: null,
    alignedDimensions: [],
    coverage: 0,
    contextCorroborated: false,
  };
  if (stage !== MISSING) m.stage = stage;
  return m as unknown as ProfessionMatch;
}

/** The report's ranked list, as a saved snapshot hands it over. */
function rankedList(stages: readonly unknown[]): RankedProfession[] {
  return TRIO.map((p, i) => ({
    rank: i + 1,
    confidence: "moderate",
    match: match(p, stages[i]),
  })) as RankedProfession[];
}

/** A v3.1 stored report whose entries carry `stages`, rank 1 first. */
function storedReport(stages: readonly unknown[]) {
  return {
    status: "v3.1",
    snapshotId: "snap-stage",
    sessionId: "sess-stage",
    generatedAt: "2026-09-20T09:00:00Z",
    versions: { definition: "3.1.0", content: "3.1.0", scoring: "3.1.0", taxonomy: "3.1.0" },
    snapshot: {
      locale: "sv",
      completedAt: "2026-09-20T09:00:00Z",
      outputB: { leading: { patternId: "p1", name: "Den strukturerade" }, supporting: [] },
      professions: { available: true, ranked: rankedList(stages) },
    },
  } as unknown as Parameters<typeof deriveCareerDirection>[0];
}

/** A copy of `item` carrying the saved stage as-is ("future", null, or no
 *  `stage` property at all), bypassing the read path's check. */
function withRawStage<T extends object>(item: T, value: unknown): T {
  const copy = { ...item } as T & { stage?: unknown };
  if (value === MISSING) delete copy.stage;
  else copy.stage = value;
  return copy;
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
    const html = render(node(), lang);
    ck(name, true);
    return html;
  } catch (e) {
    ck(name, false, e instanceof Error ? e.message : String(e));
    return null;
  }
}
/** The stage badges in document order: [data-stage, printed text]. */
function badges(html: string): [string, string][] {
  return [...html.matchAll(/<span data-stage="([^"]*)"[^>]*>([^<]*)<\/span>/g)].map((m) => [
    m[1],
    m[2],
  ]);
}
/** What a badge should say for a saved stage. */
function expected(value: unknown, lang: Lang): [string, string] {
  return isProfessionStage(value)
    ? [value, STAGE_LABEL[value][lang]]
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

// Every stage mix the read paths must survive: each invalid shape at rank 1
// beside valid neighbours, each on all three ranks, and the known stages.
const MIXES: readonly { readonly name: string; readonly values: readonly unknown[] }[] = [
  ...INVALID.map((c) => ({
    name: `rank 1 ${c.name}, ranks 2–3 valid`,
    values: [c.value, "possible_next_step", "longer_term"],
  })),
  ...INVALID.map((c) => ({ name: `all ranks ${c.name}`, values: [c.value, c.value, c.value] })),
  {
    name: "explore_now / possible_next_step / longer_term",
    values: ["explore_now", "possible_next_step", "longer_term"],
  },
  {
    name: "career_pivot / longer_term / possible_next_step",
    values: ["career_pivot", "longer_term", "possible_next_step"],
  },
];

// =========================================================================
group("1 · The shared check accepts exactly STAGE_LABEL's own keys");
// =========================================================================
ck(
  "1.1 STAGE_LABEL's keys are exactly the four stages",
  JSON.stringify(Object.keys(STAGE_LABEL).sort()) === JSON.stringify([...VALID].sort()),
);
for (const v of VALID) {
  ck(`1.2 "${v}" is a known stage`, isProfessionStage(v));
  ck(`1.3 "${v}" is read as itself`, readProfessionStage(v) === v);
  for (const lang of LANGS) {
    ck(
      `1.4 [${lang}] "${v}" prints its approved word, unchanged`,
      professionStageLabel(v, lang) === STAGE_LABEL[v][lang],
    );
    const sentence = explainMatch(match(TRIO[0], v), lang).stageSentence;
    ck(
      `1.5 [${lang}] "${v}" keeps its own stage sentence`,
      sentence.length > 0 && sentence !== STAGE_UNAVAILABLE_SENTENCE[lang],
    );
  }
}
for (const v of [
  "future",
  "Explore_now",
  "explore now",
  "",
  "toString",
  "constructor",
  "__proto__",
  "hasOwnProperty",
  null,
  undefined,
  0,
  true,
  {},
  [],
]) {
  const label = JSON.stringify(v) ?? String(v);
  ck(`1.6 ${label} is not a known stage`, !isProfessionStage(v));
  ck(
    `1.7 ${label} is read as unavailable, never as a known stage`,
    readProfessionStage(v) === null,
  );
  for (const lang of LANGS) {
    ck(
      `1.8 [${lang}] ${label} prints the neutral wording`,
      professionStageLabel(v, lang) === NEUTRAL[lang],
    );
  }
}
for (const c of INVALID) {
  for (const lang of LANGS) {
    let sentence: string | null = null;
    try {
      sentence = explainMatch(match(TRIO[0], c.value), lang).stageSentence;
    } catch (e) {
      ck(
        `1.9 [${lang}] explainMatch explains ${c.name} without crashing`,
        false,
        e instanceof Error ? e.message : String(e),
      );
      continue;
    }
    ck(
      `1.9 [${lang}] explainMatch explains ${c.name} without crashing`,
      sentence === STAGE_UNAVAILABLE_SENTENCE[lang],
      String(sentence),
    );
  }
}
ck(
  "1.10 the neutral wording is not one of the approved words",
  LANGS.every((lang) => VALID.every((v) => STAGE_LABEL[v][lang] !== NEUTRAL[lang])),
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
    `2.4 ${mix.name}: deriveCareerDirection carries an unknown stage as unavailable (null), a known one as itself`,
    roles.every((r, i) =>
      isProfessionStage(mix.values[i]) ? r?.stage === mix.values[i] : r?.stage === null,
    ),
    roles.map((r) => String(r?.stage)).join(", "),
  );
  const direction = personalDirection(career, { signedIn: true });
  ck(
    `2.5 ${mix.name}: the Career Center's primary is the report's rank 1`,
    direction.state === "ready" &&
      direction.primary.rank === 1 &&
      direction.primary.reportTitleSv === TRIO[0].titleSv &&
      [direction.primary, ...direction.alternatives].map((i) => i.rank).join() === "1,2,3",
  );
}

// =========================================================================
group("3 · The Career Center's personal section, in both languages");
// =========================================================================
// The hub shows the stage on its primary card only; the alternatives carry
// none. Its stage status is therefore exactly the rank-1 entry's.
for (const lang of LANGS) {
  for (const mix of MIXES) {
    const direction = personalDirection(deriveCareerDirection(storedReport(mix.values)), {
      signedIn: true,
    });
    if (direction.state !== "ready") {
      ck(`3.0 [${lang}] ${mix.name}: the hub has a recommendation to show`, false);
      continue;
    }
    const titles = [direction.primary, ...direction.alternatives].map((i) =>
      i.profession
        ? lang === "sv"
          ? i.profession.titleSv
          : i.profession.titleEn
        : lang === "sv"
          ? i.reportTitleSv
          : i.reportTitleEn,
    );
    // Through the real read path…
    const viaRead = tryRender(
      `3.1 [${lang}] ${mix.name}: the Career Center renders without crashing`,
      () => <PersonalDirectionSection direction={direction} listAnchor="utforska-yrken" />,
      lang,
    );
    if (viaRead) {
      ck(
        `3.2 [${lang}] ${mix.name}: the Career Center keeps the report's order, rank 1 as the primary`,
        inOrder(viaRead, titles) && /data-personal-primary="true" data-rank="1"/.test(viaRead),
      );
      ck(
        `3.3 [${lang}] ${mix.name}: the Career Center prints rank 1's own stage wording`,
        JSON.stringify(badges(viaRead)) === JSON.stringify([expected(mix.values[0], lang)]),
        JSON.stringify(badges(viaRead)),
      );
    }
    // …and with the raw saved value handed straight to the view, so the
    // view's own guard is tested, not only the read path in front of it.
    const raw = {
      ...direction,
      primary: withRawStage(direction.primary, mix.values[0]),
    };
    const viaRaw = tryRender(
      `3.4 [${lang}] ${mix.name}: the Career Center renders a raw saved stage without crashing`,
      () => <PersonalDirectionSection direction={raw} listAnchor="utforska-yrken" />,
      lang,
    );
    if (viaRaw) {
      ck(
        `3.5 [${lang}] ${mix.name}: the Career Center labels a raw saved stage neutrally, in order`,
        inOrder(viaRaw, titles) &&
          JSON.stringify(badges(viaRaw)) === JSON.stringify([expected(mix.values[0], lang)]),
        JSON.stringify(badges(viaRaw)),
      );
    }
  }
}

// =========================================================================
group("4 · The report's recommendation, in both languages");
// =========================================================================
for (const lang of LANGS) {
  const titles = TRIO.map((p) => (lang === "sv" ? p.titleSv : p.titleEn));
  for (const mix of MIXES) {
    const html = tryRender(
      `4.1 [${lang}] ${mix.name}: the report view renders without crashing`,
      () => <RecommendedProfessions ranked={rankedList(mix.values)} locale={lang} />,
      lang,
    );
    if (!html) continue;
    const cards = [...html.matchAll(/data-recommendation-card="([^"]+)"/g)].map((m) => m[1]);
    ck(
      `4.2 [${lang}] ${mix.name}: the report view keeps the ranking`,
      cards.join() === TRIO.map((p) => p.professionId).join() && inOrder(html, titles),
      cards.join(),
    );
    ck(
      `4.3 [${lang}] ${mix.name}: the report view keeps every rationale`,
      TRIO.every((p) =>
        html.includes(lang === "sv" ? `SKÄL ${p.professionId}` : `REASON ${p.professionId}`),
      ),
    );
    // "Utforska nu" is the explore_now stage's own chip; every other stage —
    // an unknown one included — prints a stage badge.
    ck(
      `4.4 [${lang}] ${mix.name}: the report view prints each entry's own stage wording`,
      JSON.stringify(badges(html)) ===
        JSON.stringify(mix.values.filter((v) => v !== "explore_now").map((v) => expected(v, lang))),
      JSON.stringify(badges(html)),
    );
    ck(
      `4.5 [${lang}] ${mix.name}: an unknown stage is never presented as "${STAGE_LABEL.explore_now[lang]}"`,
      mix.values.filter((v) => v === "explore_now").length ===
        (html.match(new RegExp(`>${STAGE_LABEL.explore_now[lang]}<`, "g")) ?? []).length,
    );
  }
}

// =========================================================================
group("5 · The report's staged tier cards, in both languages");
// =========================================================================
for (const lang of LANGS) {
  for (const mix of MIXES) {
    const [a, b, c] = TRIO.map((p, i) => match(p, mix.values[i]));
    const html = tryRender(
      `5.1 [${lang}] ${mix.name}: the staged tier cards render without crashing`,
      () => (
        <ProfessionRecommendations
          strongestDirections={[a]}
          alsoWorthExploring={[b]}
          longerTermPossibilities={[c]}
          locale={lang}
        />
      ),
      lang,
    );
    if (!html) continue;
    ck(
      `5.2 [${lang}] ${mix.name}: the tier cards keep every profession`,
      TRIO.every((p) => html.includes(escapeHtml(lang === "sv" ? p.titleSv : p.titleEn))),
    );
    ck(
      `5.3 [${lang}] ${mix.name}: the tier cards print each entry's own stage wording`,
      JSON.stringify(badges(html)) === JSON.stringify(mix.values.map((v) => expected(v, lang))),
      JSON.stringify(badges(html)),
    );
    const unknown = mix.values.filter((v) => !isProfessionStage(v)).length;
    ck(
      `5.4 [${lang}] ${mix.name}: an unknown stage is explained neutrally, a known one as before`,
      (html.match(new RegExp(escapeHtml(STAGE_UNAVAILABLE_SENTENCE[lang]), "g")) ?? []).length ===
        unknown,
    );
  }
}

// =========================================================================
group("6 · The Career Card, in both languages");
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
        `6.1 [${lang}] ${mix.name}: the Career Card builds without crashing`,
        false,
        e instanceof Error ? e.message : String(e),
      );
    }
    if (!card) continue;
    ck(`6.1 [${lang}] ${mix.name}: the Career Card builds without crashing`, true);
    ck(
      `6.2 [${lang}] ${mix.name}: the Career Card keeps the ranking`,
      card.entries.map((e) => `${e.rank}:${e.title}`).join() ===
        TRIO.map((p, i) => `${i + 1}:${lang === "sv" ? p.titleSv : p.titleEn}`).join(),
    );
    ck(
      `6.3 [${lang}] ${mix.name}: the Career Card prints each entry's own stage wording`,
      JSON.stringify(card.entries.map((e) => e.stageLabel)) ===
        JSON.stringify(mix.values.map((v) => expected(v, lang)[1])),
      JSON.stringify(card.entries.map((e) => e.stageLabel)),
    );
  }
}

// =========================================================================
group("7 · Valid reports are untouched: no neutral wording anywhere");
// =========================================================================
for (const lang of LANGS) {
  const values = ["possible_next_step", "longer_term", "career_pivot"];
  const direction = personalDirection(deriveCareerDirection(storedReport(values)), {
    signedIn: true,
  });
  const [a, b, c] = TRIO.map((p, i) => match(p, values[i]));
  const html = [
    render(<PersonalDirectionSection direction={direction} listAnchor="utforska-yrken" />, lang),
    render(<RecommendedProfessions ranked={rankedList(values)} locale={lang} />, lang),
    render(
      <ProfessionRecommendations
        strongestDirections={[a]}
        alsoWorthExploring={[b]}
        longerTermPossibilities={[c]}
        locale={lang}
      />,
      lang,
    ),
  ].join("");
  ck(
    `7.1 [${lang}] a valid report never shows "${NEUTRAL[lang]}" or the neutral sentence`,
    !html.includes(NEUTRAL[lang]) && !html.includes(escapeHtml(STAGE_UNAVAILABLE_SENTENCE[lang])),
  );
}

if (fails.length > 0) {
  console.error(`\ncareer-report-stage:check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\ncareer-report-stage:check: all assertions passed.");
