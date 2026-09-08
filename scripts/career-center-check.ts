// Security Career Center — product completion guard.
//
// Run via `bun run career-center:check`.
//
// ── WHAT THIS PINS ─────────────────────────────────────────────────────
//
// The Career Center was rebuilt from eleven sections to six because it had
// stopped being a product and become a catalogue of unfinished content: a
// hero claiming "60+" professions over a catalogue of twenty, ten of which
// carried "Content varies between countries. This guide is under development."
// as their only responsibility and were nevertheless clickable; four separate
// sections presenting the same twenty professions; and four more sections
// whose entire content was a dashed box saying the content did not exist yet.
//
// Every one of those is a regression that reintroduces itself quietly — a new
// placeholder profession appended to the array, a count typed back into copy,
// a "coming soon" panel added because a section looked empty. So each is
// asserted here rather than left to review.
//
// ── SHAPE ──────────────────────────────────────────────────────────────
//
// Two halves, matching this repository's scripts/*-check.ts convention (there
// is no JS/TS unit-test runner configured here):
//
//   - The data layer is pure and is imported and exercised directly:
//     publishability, the explorer's URL round-trip, zero-result recovery,
//     the meta-group partition, the career routes' transition invariant.
//
//   - The React surfaces import the router and cannot be rendered outside the
//     app runtime, so their half is a structural source-text check: section
//     order, which helper the route resolves through, the accessibility
//     contract, the absence of retired copy.
//
// The copy half imports the dictionaries directly, which are pure data.

import { readFileSync } from "node:fs";
import path from "node:path";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

/** Source text with comments removed.
 *
 *  These files explain at length what they no longer do, quoting the retired
 *  copy verbatim — "60+", "Critical", the `tag` prop. A naive substring check
 *  matches those explanations and fails on the very comment that documents
 *  the fix, so assertions about what the code RENDERS read the stripped text
 *  and assertions about intent read the original. */
const code = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const hub = read("src/routes/career-center.index.tsx");
const professionRoute = read("src/routes/career-center.$profession.tsx");
const startRoute = read("src/routes/career-center.start.tsx");
const explorer = read("src/components/career-center/ProfessionExplorer.tsx");
const hero = read("src/components/career-center/CareerHero.tsx");
const card = read("src/components/career-center/ProfessionCard.tsx");
const competencyCard = read("src/components/career-center/CompetencyCard.tsx");
const template = read("src/components/career-center/ProfessionTemplate.tsx");

const { dictionaries } = await import("../src/i18n/dictionaries");
const { professions } = await import("../src/lib/career-center/professions");
const {
  professionPublishability,
  publishedProfessions,
  upcomingProfessions,
  PUBLISHED_PROFESSION_COUNT,
  getPublishedProfession,
} = await import("../src/lib/career-center/publishability");
const {
  parseExplorerSearch,
  applyExplorerSearch,
  nearestNonEmpty,
  clearAllFilters,
  hasActiveFilters,
  withoutFilter,
  toggleLevel,
  selectedLevels,
  levelParam,
  availableFamilies,
  availableLevels,
  ENTRY_LEVEL_SEARCH,
  NEXT_LEVEL_SEARCH,
} = await import("../src/lib/career-center/explorer-state");
const { metaGroups, filterableFamilyIds } = await import("../src/lib/career-center/meta-groups");
const { careerRoutes, validateRoutes } = await import("../src/lib/career-center/career-routes");
const { fitSignals } = await import("../src/lib/career-center/profession-fit");
const { CAREER_CENTER_EVENT_WIRE_NAME } = await import("../src/lib/career-center/analytics");
const { FUNNEL_EVENT_NAMES } = await import("../src/lib/career-discovery/v31-feedback.functions");
const { MVP_QUESTION_COUNT } = await import("../src/lib/career-discovery/v31/personal-layer");

// =======================================================================
// 1. Hub section order and count
// =======================================================================
//
// Five sections, in this order. The order is the product argument: a visitor
// is told what this is, then shown where THEY stand (or told honestly that we
// cannot know), then handed the catalogue, then the routes through it, and
// finally the basis on which any of it is claimed.
//
// The pilot pass replaced two sections with one. "Var står du i dag?" asked
// the question and answered it with three generic cards; the standalone dark
// career-test band asked a visitor who might already have a result to take it
// again. Section 2 now answers the question with the reader's OWN analysis
// when there is one, and offers the analysis when there is not — which is the
// only place on the page where offering it is a true statement. The two
// surviving pre-filtered destinations moved into the explorer as quick
// choices; they are asserted separately below.

const HUB_SECTION_HEADINGS = [
  "cc.hero.title",
  "cc.me.title",
  "cc.explore.title",
  "cc.routes.title",
  "cc.trust.title",
] as const;

// Section 2's heading is rendered by <PersonalDirectionSection>, so the hub's
// own source carries the component rather than the key. Both are asserted:
// the component must be mounted in the right position, and the component must
// render the heading.
const personal = read("src/components/career-center/PersonalDirection.tsx");
const hubOrderText = hub.replace("<PersonalDirectionSection", 't("cc.me.title")');

let cursor = -1;
for (const key of HUB_SECTION_HEADINGS) {
  const at = hubOrderText.indexOf(`t("${key}")`);
  expect(at !== -1, `the hub must render the section heading "${key}"`);
  expect(
    at > cursor,
    `hub section "${key}" is out of order — the settled order is ${HUB_SECTION_HEADINGS.join(" → ")}`,
  );
  cursor = at;
}

// The four discovery sections that were merged into one explorer, and the
// four advertisements for content that does not exist. Each is asserted by
// its dictionary key: restoring the section means restoring the key.
const RETIRED_KEYS = [
  "cc.featured.title", // "Utvalda yrken"
  "cc.categories.title", // "Bläddra efter kategori"
  "cc.search.title", // "Hitta rätt roll"
  "start.families.title", // "Yrkesfamiljer"
  "cc.education.title", // hub-level "Utbildning" placeholder panel
  "cc.certs.title", // hub-level "Certifikat" placeholder panel
  "cc.articles.title", // "Senaste artiklar" — three dashed boxes
  "cc.jobs.title", // "Utvalda jobb" — /jobs is its own product area
  "cc.hero.stats.professions.value", // the "60+" claim
  "cc.hero.stats.model.value", // "v1.0" — an internal version string
  "cc.status.developing", // the "Under utveckling" card badge
  "cc.status.under_development",
  "cc.profession.education.placeholder",
  "cc.profession.certifications.placeholder",
  "cc.profession.related_jobs.placeholder",
] as const;

for (const key of RETIRED_KEYS) {
  for (const lang of ["sv", "en"] as const) {
    expect(
      !(key in dictionaries[lang]),
      `${lang} must not define "${key}" — it belonged to a section that was removed, and reintroducing the key is how the section comes back`,
    );
  }
}

// =======================================================================
// 2. No empty-content marketing anywhere in Career Center copy
// =======================================================================
//
// "byggs upp löpande" / "under uppbyggnad" / "under utveckling" and their
// English equivalents were the hub's most common sentence. A section whose
// content is a promise is not a section.

const EMPTY_CONTENT_PHRASES: readonly { needle: string; lang: "sv" | "en" }[] = [
  { needle: "byggs upp", lang: "sv" },
  { needle: "under uppbyggnad", lang: "sv" },
  { needle: "under utveckling", lang: "sv" },
  { needle: "kommer att visas här", lang: "sv" },
  { needle: "under development", lang: "en" },
  { needle: "being built", lang: "en" },
  { needle: "will be shown here", lang: "en" },
  { needle: "coming soon", lang: "en" },
];

for (const { needle, lang } of EMPTY_CONTENT_PHRASES) {
  const offenders = Object.entries(dictionaries[lang])
    .filter(([key]) => key.startsWith("cc."))
    .filter(([, value]) => typeof value === "string" && value.toLowerCase().includes(needle))
    .map(([key]) => key);
  expect(
    offenders.length === 0,
    `${lang} Career Center copy must not advertise absent content — "${needle}" appears in: ${offenders.join(", ")}`,
  );
}

// The dashed-border placeholder box was the visual signature of those
// sections. The one dashed border that survives is the zero-result panel,
// which is a state, not a promise.
const dashedInHub = hub.includes("border-dashed");
expect(!dashedInHub, "the hub must contain no dashed placeholder panels");
expect(
  !template.includes("border-dashed"),
  "a profession guide must contain no dashed placeholder panels — a section with no content is omitted",
);

// =======================================================================
// 3. SV/EN parity across every Career Center key
// =======================================================================

const svCc = Object.keys(dictionaries.sv).filter((k) => k.startsWith("cc."));
const enCc = new Set(Object.keys(dictionaries.en).filter((k) => k.startsWith("cc.")));
for (const key of svCc) {
  expect(enCc.has(key), `"${key}" exists in Swedish but not in English`);
  const sv = (dictionaries.sv as Record<string, string>)[key];
  const en = (dictionaries.en as Record<string, string>)[key];
  expect(
    typeof en === "string" && en.trim().length > 0,
    `"${key}" has no English text — an untranslated key renders the Swedish string to an English reader`,
  );
  // Level, sector and orientation labels are the ones most likely to be left
  // as the Swedish word; a byte-identical pair on a translatable label is
  // almost always an oversight rather than a shared proper noun.
  if (key.startsWith("cc.level.") || key.startsWith("cc.sector.")) {
    expect(sv !== en || key === "cc.level.senior", `"${key}" is identical in both languages`);
  }
}
for (const key of enCc) {
  expect(
    svCc.includes(key),
    `"${key}" exists in English but not in Swedish — Swedish is the key-defining dictionary`,
  );
}

// =======================================================================
// 4. The career test is the hub's primary conversion point
// =======================================================================

// ── WHERE THE TEST LIVES NOW, AND WHY IT MOVED ─────────────────────────
//
// It used to be offered three times above the fold: in the hero, in a band of
// entry-path cards, and again in a full-width dark section. A reader who had
// already taken it was asked twice more; a reader who had not was made to
// choose between two doors before being told what was behind either.
//
// It is now offered ONCE, inside section 2, in the states where "you have no
// result yet" is actually true. That is strictly earlier than the catalogue,
// so the conversion point is still never buried under profession cards.
expect(
  personal.includes('to="/security-career-assessment"'),
  "the personal section must link to the career analysis at /security-career-assessment",
);
expect(
  !hub.includes('to="/security-career-assessment"'),
  "the hub must not repeat the career-analysis CTA outside the personal section — one primary action per section",
);
expect(
  hubOrderText.indexOf('t("cc.me.title")') < hubOrderText.indexOf('t("cc.explore.title")'),
  "the personal section must come before the profession explorer",
);
// The invitation is rendered only where there is no result to show. A
// recommendation list under a personal heading, built from anything other
// than the reader's own report, is the failure this whole section prevents.
for (const state of ["anonymous", "no_result", "unreadable", "no_roles_named"]) {
  expect(
    personal.includes(`"${state}"`),
    `the personal section must handle the "${state}" state explicitly`,
  );
}
expect(
  personal.includes("data-personal-recommendation") &&
    personal.indexOf("data-personal-recommendation") >
      personal.indexOf('state === "no_roles_named"'),
  "recommendations may only be rendered after every non-ready state has returned",
);
// The question count is the instrument's, not a number typed into copy.
expect(
  hub.includes("MVP_QUESTION_COUNT"),
  "the hub must render the question count from MVP_QUESTION_COUNT, not as a literal",
);
expect(
  MVP_QUESTION_COUNT === 28,
  `the career test states 28 questions in copy elsewhere on the site; the instrument now has ${MVP_QUESTION_COUNT}`,
);
for (const lang of ["sv", "en"] as const) {
  const body = (dictionaries[lang] as Record<string, string>)["cc.test.body"];
  expect(
    !/\d/.test(body),
    `${lang} "cc.test.body" must contain no digits — every number on this page is derived`,
  );
}

// Career Discovery's boundary: guidance, never a competence or employability
// verdict. Asserted on the exact sentence, in both languages.
for (const [lang, needle] of [
  ["sv", "ingen bedömning av din kompetens eller anställningsbarhet"],
  ["en", "not an assessment of your competence or your employability"],
] as const) {
  const all = Object.entries(dictionaries[lang])
    .filter(([k]) => k.startsWith("cc."))
    .map(([, v]) => String(v).toLowerCase())
    .join(" ");
  expect(
    all.includes(needle),
    `${lang} Career Center copy must state that the career test is not an assessment of competence or employability`,
  );
}

// =======================================================================
// 5. Publishability
// =======================================================================

expect(publishedProfessions.length > 0, "the published catalogue must not be empty");
expect(
  publishedProfessions.length + upcomingProfessions.length === professions.length,
  "every profession must be either published or upcoming — the two lists partition the catalogue",
);
expect(
  PUBLISHED_PROFESSION_COUNT === publishedProfessions.length,
  "PUBLISHED_PROFESSION_COUNT must equal the published list length",
);

for (const p of professions) {
  const { publishable, failures } = professionPublishability(p);

  if (p.status === "placeholder") {
    expect(
      !publishable,
      `"${p.slug}" is marked placeholder but computes as publishable — the status must remain disqualifying`,
    );
  }

  if (publishable) {
    // Restate the rule against the record, so a future edit that weakens the
    // predicate itself is caught rather than silently blessed.
    expect((p.sources?.length ?? 0) > 0, `published "${p.slug}" has no sources`);
    expect(Boolean(p.lastVerified), `published "${p.slug}" has no review date`);
    expect(p.countries.length > 0, `published "${p.slug}" states no jurisdiction`);
    expect(
      p.responsibilities.length >= 2,
      `published "${p.slug}" has fewer than two responsibilities`,
    );
    expect(p.competencies.length >= 3, `published "${p.slug}" has fewer than three competencies`);
    expect(
      (p.previousRoles?.length ?? 0) + (p.nextRoles?.length ?? 0) > 0,
      `published "${p.slug}" has no career path in either direction`,
    );
    expect(
      !p.regulated ||
        (p.formalRequirements?.length ?? 0) > 0 ||
        Boolean(p.regulatoryNotes?.sv && p.regulatoryNotes?.en),
      `published "${p.slug}" is regulated but states neither formal requirements nor regulatory notes`,
    );
    expect(
      p.overview.sv.length >= 100 && p.overview.en.length >= 100,
      `published "${p.slug}" has a thin "Om yrket" in at least one language`,
    );
    expect(
      failures.length === 0,
      `"${p.slug}" reported publishable with failures: ${failures.join(", ")}`,
    );
  }
}

// The unfinished guides are named but never linked, carded or badged.
expect(upcomingProfessions.length > 0, "this dataset is expected to have unfinished guides");
for (const p of upcomingProfessions) {
  expect(
    getPublishedProfession(p.slug) === undefined,
    `"${p.slug}" is unfinished but resolves through getPublishedProfession`,
  );
}
expect(
  explorer.includes("upcoming.map") || explorer.includes("upcoming\n"),
  "the explorer must render the upcoming list",
);
expect(
  !explorer.includes("<ProfessionCard") ||
    explorer.indexOf("upcoming.map") > explorer.indexOf("results.map"),
  "the upcoming list must not be rendered as cards",
);
expect(
  !/\btag\b\s*[?:]/.test(code(card)) && !code(card).includes("{tag"),
  'ProfessionCard must not carry a "tag" prop — it existed only to badge unfinished guides as "Under utveckling"',
);

// =======================================================================
// 6. The direct route to an unfinished guide
// =======================================================================
//
// The explorer hiding a stub is not enough: search engines, shared links and
// the assessment result all reach profession slugs directly.

expect(
  professionRoute.includes("getPublishedProfession"),
  "the profession route must resolve through getPublishedProfession",
);
expect(
  !professionRoute.includes("getProfession("),
  "the profession route must not fall back to getProfession — that is how placeholder content stays reachable by direct URL",
);
expect(
  professionRoute.includes('t("cc.p.unavailable.title")'),
  "the profession route must render an explicit unavailable state",
);
expect(
  professionRoute.includes('{ name: "robots", content: "noindex" }'),
  "an unavailable profession guide must be noindex",
);

// /career-center/start is retired rather than kept as a second front door.
expect(
  startRoute.includes('redirect({ to: "/career-center"'),
  "/career-center/start must redirect to the hub",
);
expect(
  !startRoute.includes("useState"),
  "/career-center/start must hold no UI of its own — it duplicated the hub and its audience picker changed a third of one section",
);

// =======================================================================
// 7. Every displayed count is derived
// =======================================================================

expect(
  hub.includes("PUBLISHED_PROFESSION_COUNT"),
  "the hub's guide count must come from PUBLISHED_PROFESSION_COUNT",
);
for (const lang of ["sv", "en"] as const) {
  const offenders = Object.entries(dictionaries[lang])
    .filter(([k]) => k.startsWith("cc."))
    .filter(([, v]) => /\d\s*\+/.test(String(v)))
    .map(([k]) => k);
  expect(
    offenders.length === 0,
    `${lang} Career Center copy states an open-ended count ("60+" and its kind): ${offenders.join(", ")}`,
  );
}
expect(
  !code(hero).includes("60+") && !code(hub).includes("60+"),
  'the retired "60+" professions claim must not return',
);
for (const lang of ["sv", "en"] as const) {
  const heroFacts = Object.entries(dictionaries[lang]).filter(([k]) =>
    k.startsWith("cc.hero.fact."),
  );
  for (const [key, value] of heroFacts) {
    expect(
      !/\d/.test(String(value)),
      `${lang} "${key}" contains a digit — the hero's figures are counted at render time, never written into copy`,
    );
  }
}
// The "för svenska säkerhetsbranschen" claim in the hero has to be true of
// the catalogue it sits above.
expect(
  publishedProfessions.every((p) => p.countries.includes("SE")),
  'the hero claims the guides are for the Swedish security industry; some published guide does not list "SE" as a jurisdiction',
);

// =======================================================================
// 8. Explorer: URL round-trip, chips, clear-all, zero-result recovery
// =======================================================================

// Round-trip: what the parser accepts, it reproduces unchanged.
const ROUND_TRIP_CASES: Record<string, unknown>[] = [
  { level: "entry" },
  { level: "mid,senior" },
  { family: availableFamilies[0] },
  { q: "väktare", level: "entry" },
  { regulated: "regulated", more: "true" },
  { sector: "private", orientation: "operational", country: "SE" },
];
for (const raw of ROUND_TRIP_CASES) {
  const parsed = parseExplorerSearch(raw);
  const reparsed = parseExplorerSearch(parsed as Record<string, unknown>);
  expect(
    JSON.stringify(parsed) === JSON.stringify(reparsed),
    `explorer search does not round-trip for ${JSON.stringify(raw)}: ${JSON.stringify(parsed)} → ${JSON.stringify(reparsed)}`,
  );
}

// Junk degrades to a wider view, never to a chip labelled with the junk.
const junk = parseExplorerSearch({ family: "nonsense", level: "wizard", sector: "42", q: "  " });
expect(
  Object.keys(junk).length === 0,
  `an entirely invalid search must yield no filters, got ${JSON.stringify(junk)}`,
);

// Level is a list, and the entry paths mean what they say.
expect(
  selectedLevels(parseExplorerSearch(ENTRY_LEVEL_SEARCH as Record<string, unknown>)).join(",") ===
    "entry",
  '"see roles you can start in" must filter to entry level',
);
const nextLevels = selectedLevels(
  parseExplorerSearch(NEXT_LEVEL_SEARCH as Record<string, unknown>),
);
expect(
  nextLevels.includes("mid") && nextLevels.includes("senior"),
  '"see roles at the next level" must include both mid and senior — a single-level filter under-delivers the promise',
);
// The three entry paths must actually land in different places.
const entryResults = applyExplorerSearch(ENTRY_LEVEL_SEARCH, "sv");
const nextResults = applyExplorerSearch(NEXT_LEVEL_SEARCH, "sv");
expect(entryResults.length > 0, "the entry-level path must return results");
expect(nextResults.length > 0, "the next-level path must return results");
expect(
  entryResults.every((p) => !nextResults.includes(p)),
  "the first two entry paths must lead to genuinely different result sets",
);
expect(
  hub.includes('to="/employers"'),
  "the organisation entry path must lead to the employer product, not to the explorer",
);

// "Rensa alla" clears every filter but keeps the disclosure open.
const busy = parseExplorerSearch({
  q: "väktare",
  level: "entry",
  family: availableFamilies[0],
  regulated: "regulated",
});
expect(hasActiveFilters(busy), "the busy fixture must have active filters");
const cleared = clearAllFilters(busy);
expect(!hasActiveFilters(cleared), '"Rensa alla" must clear every filter');
expect(
  cleared.more === true,
  '"Rensa alla" must leave the advanced disclosure open — collapsing it removes the control the reader was just using',
);
expect(
  applyExplorerSearch(cleared, "sv").length === PUBLISHED_PROFESSION_COUNT,
  '"Rensa alla" must return the whole published catalogue',
);

// Removing one chip leaves the rest alone.
const minusFamily = withoutFilter(busy, "family");
expect(minusFamily.family === undefined, "removing the family chip must drop the family filter");
expect(
  minusFamily.q === busy.q && minusFamily.level === busy.level,
  "removing one chip must not disturb the others",
);

// Toggling a level off returns to "all levels" rather than to an empty list.
const oneLevel = parseExplorerSearch({ level: "entry" });
expect(
  toggleLevel(oneLevel, "entry").level === undefined,
  "toggling the last selected level off must clear the level filter",
);
expect(
  levelParam(["entry", "mid", "senior", "executive"]) === undefined,
  "selecting every level must produce the same clean URL as selecting none",
);

// Zero results always offer a way out, and the way out actually works.
const impossible = parseExplorerSearch({ level: "entry", family: "security_technology" });
expect(
  applyExplorerSearch(impossible, "sv").length === 0,
  "the zero-result fixture must actually return nothing",
);
const recovery = nearestNonEmpty(impossible, "sv");
expect(recovery !== null, "a zero-result view must offer a recovery, never a dead end");
if (recovery) {
  expect(recovery.count > 0, "the offered recovery must return results");
  expect(
    applyExplorerSearch(recovery.search, "sv").length === recovery.count,
    "the recovery's stated count must match what its search returns",
  );
  const label = `cc.explore.relax.${recovery.dropped}`;
  for (const lang of ["sv", "en"] as const) {
    expect(
      label in dictionaries[lang],
      `${lang} has no label for relaxing "${recovery.dropped}" — the recovery button would render a raw key`,
    );
  }
}
// Every relaxable key has a label in both languages, not just the one this
// fixture happens to hit.
for (const key of ["family", "level", "regulated", "sector", "orientation", "country", "q"]) {
  for (const lang of ["sv", "en"] as const) {
    expect(
      `cc.explore.relax.${key}` in dictionaries[lang],
      `${lang} is missing "cc.explore.relax.${key}"`,
    );
  }
}

// Controls only offer values that can change the result.
for (const family of availableFamilies) {
  expect(
    publishedProfessions.some((p) => p.family === family),
    `the family filter offers "${family}", which no published guide carries`,
  );
}
for (const level of availableLevels) {
  expect(
    publishedProfessions.some((p) => p.level === level),
    `the level filter offers "${level}", which no published guide carries`,
  );
}

// =======================================================================
// 9. Meta-groups partition the families
// =======================================================================

const grouped = metaGroups.flatMap((g) => g.families);
expect(
  new Set(grouped).size === grouped.length,
  "a profession family appears in more than one meta-group",
);
for (const id of filterableFamilyIds) {
  expect(
    grouped.includes(id),
    `family "${id}" belongs to no meta-group — it would vanish from the explorer's family filter`,
  );
}
for (const id of grouped) {
  expect(
    filterableFamilyIds.includes(id),
    `meta-group references "${id}", which is not a filterable profession family`,
  );
}
// One visible taxonomy. "Kategori" stays an internal field.
expect(
  !explorer.includes("categories") && !explorer.includes("cc.search.category"),
  "the explorer must expose one taxonomy — profession family — and not also category",
);

// =======================================================================
// 10. Career routes
// =======================================================================

const routeIssues = validateRoutes();
expect(
  routeIssues.length === 0,
  `career routes assert unsupported progressions: ${routeIssues.map((i) => `${i.routeId}: ${i.message}`).join("; ")}`,
);
expect(careerRoutes.length >= 3, "the hub must offer at least three career routes");
for (const route of careerRoutes) {
  expect(
    route.stages.length >= 2,
    `route "${route.id}" needs at least two stages to show a direction`,
  );
  for (const stage of route.stages) {
    for (const p of stage.professions) {
      expect(
        getPublishedProfession(p.slug) !== undefined,
        `route "${route.id}" links to "${p.slug}", which has no published guide`,
      );
    }
  }
  // No fabricated timing. Only an explicit careerPaths edge may state one.
  for (const stage of route.stages) {
    if (!stage.shift) continue;
    expect(
      stage.shift.experienceRequired.every((b) => b.sv.length > 0 && b.en.length > 0),
      `route "${route.id}" carries an empty experience claim`,
    );
  }
}
for (const lang of ["sv", "en"] as const) {
  const disclaimer = (dictionaries[lang] as Record<string, string>)["cc.routes.disclaimer"];
  expect(
    disclaimer.length > 0,
    `${lang} must state that career routes are examples and progression is not linear`,
  );
}

// =======================================================================
// 11. Competency scale, and the end of the hard-coded English "Critical"
// =======================================================================

expect(
  !/Critical/.test(code(competencyCard)),
  'the competency badge must not render a hard-coded English "Critical" — it is a Swedish interface',
);
expect(
  competencyCard.includes('t("cc.p.competencies.critical")'),
  "the competency badge must read its label from the dictionary",
);
expect(
  (dictionaries.sv as Record<string, string>)["cc.p.competencies.critical"] === "Kritisk kompetens",
  'the Swedish critical-competency label must read "Kritisk kompetens"',
);
expect(
  template.includes('t("cc.p.competencies.scale")'),
  "a profession guide must explain the 1-5 scale before showing levels",
);
for (const lang of ["sv", "en"] as const) {
  const scale = (dictionaries[lang] as Record<string, string>)["cc.p.competencies.scale"];
  expect(
    /1/.test(scale) && /5/.test(scale),
    `${lang} "cc.p.competencies.scale" must name the range it is describing`,
  );
}

// =======================================================================
// 12. Profession guide section order
// =======================================================================

// Career steps come BEFORE education. The order is the reader's question
// order: "where could I go from here" has to be answered before "what would I
// have to study", or the education section is a list of courses with no
// destination attached. Related jobs and the Passport boundary follow, then
// the analysis, then related professions, then the sources.
const GUIDE_SECTIONS = [
  "cc.p.about",
  "cc.p.day",
  "cc.p.fit",
  "cc.p.competencies",
  "cc.p.formal",
  "cc.p.entry",
  "cc.p.next.title",
  "cc.p.education.title",
  "cc.p.act.title",
  "cc.p.test.title",
  "cc.p.related",
  "cc.p.sources",
] as const;
let guideCursor = -1;
for (const key of GUIDE_SECTIONS) {
  const at = template.indexOf(`t("${key}")`);
  expect(at !== -1, `the profession guide must render "${key}"`);
  expect(at > guideCursor, `profession guide section "${key}" is out of order`);
  guideCursor = at;
}
// The hero on a guide carries no Career-Center-wide statistics panel.
expect(
  !template.includes("aside={"),
  "a profession guide's hero must not carry the hub's statistics panel",
);
// Counter-signals are conditions derived from the role's own requirements,
// never a personality verdict, and never a lone bullet.
for (const p of publishedProfessions) {
  const signals = fitSignals(p);
  expect(
    signals.counters.length === 0 || signals.counters.length >= 2,
    `"${p.slug}" shows a single counter-signal — one bullet under "Passar mindre bra om…" reads as a verdict`,
  );
  expect(
    signals.counters.length === signals.fits.length,
    `"${p.slug}" shows an asymmetric fit/counter pair — both sides derive from the same rules`,
  );
}
expect(
  template.includes('t("cc.p.notfit.note")'),
  "the counter-signal section must state that these are working conditions, not judgements about the reader",
);

// =======================================================================
// 13. Accessibility contract
// =======================================================================

expect(explorer.includes('aria-live="polite"'), "the result count must be announced");
expect(
  explorer.includes("aria-atomic"),
  "the result count must be announced as a whole, not word by word",
);
expect(
  explorer.includes("htmlFor={searchInputId}"),
  "the search field must have an associated label",
);
expect(explorer.includes('role="search"'), "the search field must sit in a search landmark");
expect(
  explorer.includes("aria-pressed={selected}"),
  "filter chips must expose their selected state, not signal it with colour alone",
);
expect(
  explorer.includes("aria-expanded={showAdvanced}") && explorer.includes("aria-controls="),
  'the "Fler filter" disclosure must expose its expanded state and the panel it controls',
);
expect(
  explorer.includes("<button") && !explorer.includes("<div onClick"),
  "every filter control must be a real button, reachable by keyboard",
);
expect(
  explorer.includes('t("cc.explore.remove_filter")'),
  "the removable chips must carry an accessible name for their remove action",
);

// =======================================================================
// 14. Copy rules
// =======================================================================
//
// A CTA states the action or the result. "Läs mer" states neither, which is
// why every entry path on the old hub ended in it.

for (const lang of ["sv", "en"] as const) {
  const banned = lang === "sv" ? ["läs mer", "bläddra"] : ["learn more", "browse"];
  for (const needle of banned) {
    const offenders = Object.entries(dictionaries[lang])
      .filter(([k]) => k.startsWith("cc."))
      .filter(([, v]) => String(v).toLowerCase().includes(needle))
      .map(([k]) => k);
    expect(
      offenders.length === 0,
      `${lang} Career Center copy must not use "${needle}" — a CTA states what happens: ${offenders.join(", ")}`,
    );
  }
}
expect(
  !hub.includes('t("cta.learn_more")'),
  'the hub must not fall back to the generic "Läs mer" CTA',
);

// =======================================================================
// 15. Measurement
// =======================================================================
//
// No new vendor: the Career Center's events go through the existing funnel
// tracker. Two of the four reuse names that already meant the right thing.

for (const [event, wireName] of Object.entries(CAREER_CENTER_EVENT_WIRE_NAME)) {
  expect(
    (FUNNEL_EVENT_NAMES as readonly string[]).includes(wireName),
    `Career Center event "${event}" maps to "${wireName}", which is not an allowlisted funnel event`,
  );
}
expect(
  CAREER_CENTER_EVENT_WIRE_NAME.career_profession_opened === "profession_explored",
  "opening a profession guide must reuse the existing profession_explored event rather than adding a second name for it",
);

// The database CHECK constraint is the other half of the allowlist. If the
// code and the migration disagree, every event the code adds is rejected at
// the database with no visible symptom.
// The CHECK is dropped and recreated in full by each additive migration, so
// the NEWEST one carries the whole allowlist. Reading an older file would
// pass while the live constraint rejected everything added since.
const migration = read(
  "supabase/migrations/20261102090000_cd_v31_funnel_events_career_education.sql",
);
for (const name of FUNNEL_EVENT_NAMES) {
  expect(
    migration.includes(`'${name}'::text`),
    `funnel event "${name}" is missing from the CHECK allowlist migration — the database would reject it`,
  );
}
const allowedInMigration = [...migration.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
for (const name of allowedInMigration) {
  expect(
    (FUNNEL_EVENT_NAMES as readonly string[]).includes(name),
    `the migration allows "${name}", which FUNNEL_EVENT_NAMES does not declare`,
  );
}
expect(
  hub.includes("career_center_test_started") && hub.includes("career_filter_used"),
  "the hub must record the test-start and filter-use events",
);
expect(
  hub.includes("career_profession_opened"),
  "the hub must record a profession guide being opened",
);

// =======================================================================
// 16. Career Center pilot — the five questions the hub must answer
// =======================================================================
//
// Everything below was added with the pilot rebuild. Each assertion pins a
// defect that was live on `origin/main` and that reintroduces itself quietly:
// a slug namespace that silently half-works, a senior role presented as a
// next step, an education list that cannot say whether something is legally
// required, and a commercial placement that could one day reorder a
// recommendation.

const { resolveProfessionRef, careerCenterProfessionSlug, jobsProfessionSlug } =
  await import("../src/lib/career-center/profession-links");
const { transitionKind, onwardTransitions, inboundTransitions, describeTransition } =
  await import("../src/lib/career-center/transitions");
const {
  professionEducation,
  orderIsPlacementBlind,
  educationOrderKey,
  EDUCATION_PROVIDER_PLACEMENTS,
} = await import("../src/lib/career-center/education-offers");
const { personalDirection, MAX_PERSONAL_RECOMMENDATIONS } =
  await import("../src/lib/career-center/personal-direction");
const { CAREER_PROFESSION_BRIDGE } = await import("../src/lib/career-intelligence-engine/slug-map");
const { publishedOnly } = await import("../src/lib/career-center/publishability");

// -----------------------------------------------------------------------
// 16a. One profession, three slug namespaces, no silent half-match
// -----------------------------------------------------------------------
//
// Four slugs are spelled identically in both namespaces, which is exactly
// enough coincidence for a namespace bug to look like it works. Two live
// surfaces built a Career Center URL out of a CIG slug and dead-ended on the
// other eight.

for (const entry of CAREER_PROFESSION_BRIDGE) {
  const viaCig = resolveProfessionRef(entry.cigSlug);
  expect(
    viaCig?.profession.id === entry.legacySlug,
    `CIG slug "${entry.cigSlug}" must resolve to the Career Center guide "${entry.legacySlug}"`,
  );
  const viaCc = resolveProfessionRef(entry.legacySlug);
  expect(
    viaCc?.profession.id === entry.legacySlug && viaCc?.namespace === "career_center",
    `Career Center slug "${entry.legacySlug}" must resolve in its own namespace first`,
  );
}
expect(
  resolveProfessionRef("vaktare")?.profession.slug === "security-officer",
  'the report\'s "vaktare" must reach the "security-officer" guide — this is the My Career defect',
);
expect(
  careerCenterProfessionSlug("nonexistent-slug") === null,
  "an unknown slug must yield null rather than a guessed guide",
);
// An unpublished profession is deliberately indistinguishable from an unknown
// slug: both mean "do not render a link".
expect(
  careerCenterProfessionSlug("police-officer") === null,
  "an unpublished guide must never be linkable, whichever namespace named it",
);

const careerDirectionSection = code(
  read("src/components/professional-identity/CareerDirectionSection.tsx"),
);
expect(
  !careerDirectionSection.includes("profession: role.cigSlug"),
  "My Career must not interpolate a CIG slug into a Career Center route",
);
expect(
  careerDirectionSection.includes("careerCenterProfessionSlug"),
  "My Career must resolve profession links through the shared bridge",
);
const jobsByProfession = code(read("src/routes/jobs.profession.$professionSlug.tsx"));
expect(
  jobsByProfession.includes("resolveProfessionRef"),
  "the jobs-by-profession route must resolve its CIG route param through the shared bridge",
);
// A jobs link may only be built from a CIG slug, because that is what
// jobs.profession_slug is a foreign key onto.
for (const p of publishedProfessions) {
  const slug = jobsProfessionSlug(p);
  if (slug === null) continue;
  expect(
    CAREER_PROFESSION_BRIDGE.some((e) => e.legacySlug === p.id && e.cigSlug === slug),
    `${p.id} must build its jobs link from its reviewed CIG slug`,
  );
}

// -----------------------------------------------------------------------
// 16b. A senior role is not a next step
// -----------------------------------------------------------------------

const KIND_CASES: readonly (readonly [string, string, "adjacent" | "formal_gate" | "long_term"])[] =
  [
    // Separate statutory basic training plus a police appointment.
    ["security-officer", "ordningsvakt", "formal_gate"],
    ["security-officer", "skyddsvakt", "formal_gate"],
    // Unregulated, one level up: the nearest genuine move out of guarding.
    ["security-officer", "security-coordinator", "adjacent"],
    ["ordningsvakt", "security-coordinator", "adjacent"],
    // Two levels, and a leadership function. THE case the pilot exists for.
    ["security-officer", "security-manager", "long_term"],
    ["ordningsvakt", "security-manager", "long_term"],
    ["security-coordinator", "security-manager", "long_term"],
  ];
for (const [fromId, toId, kind] of KIND_CASES) {
  const from = getPublishedProfession(fromId);
  const to = getPublishedProfession(toId);
  expect(Boolean(from && to), `${fromId} -> ${toId}: both guides must be published`);
  if (!from || !to) continue;
  expect(
    transitionKind(from, to) === kind,
    `${fromId} -> ${toId} must be classified "${kind}", not "${transitionKind(from, to)}"`,
  );
}

// The long jump must offer the middle of the chain rather than asserting the
// leap. This is what turns Ordningsvakt -> Säkerhetschef into
// Ordningsvakt -> Säkerhetssamordnare -> Säkerhetschef.
const longJump = describeTransition("ordningsvakt", "security-manager");
expect(Boolean(longJump), "the data must record ordningsvakt -> security-manager");
expect(
  (longJump?.via ?? []).some((p) => p.id === "security-coordinator"),
  "a long-term step must name the intermediate role the graph records",
);
// An adjacent move offers no detour: a middle step around something the
// reader can already do is noise.
for (const p of publishedProfessions) {
  for (const tr of onwardTransitions(p)) {
    if (tr.kind !== "long_term") {
      expect(
        tr.via.length === 0,
        `${p.id} -> ${tr.to.id} is "${tr.kind}" and must not offer an intermediate step`,
      );
    }
    expect(
      Boolean(getPublishedProfession(tr.to.id)),
      `${p.id} offers a step to "${tr.to.id}", which is not a published guide`,
    );
    // A gate states the requirement it gates on, verbatim from the guide.
    if (tr.kind === "formal_gate") {
      expect(
        tr.formalRequirements.length > 0,
        `${p.id} -> ${tr.to.id} is a formal gate but names no formal requirement`,
      );
    }
    // Nothing may claim a duration. No source in this dataset carries one.
    for (const bi of [...tr.notes, ...tr.experienceRequired]) {
      expect(
        !/\d+\s*(år|year|månad|month)/i.test(`${bi.sv} ${bi.en}`),
        `${p.id} -> ${tr.to.id} states a duration; no source in this dataset carries one`,
      );
    }
  }
  for (const tr of inboundTransitions(p)) {
    expect(
      Boolean(getPublishedProfession(tr.from.id)),
      `${p.id} names an inbound step from "${tr.from.id}", which is not a published guide`,
    );
  }
}

// The pilot's headline chain has to exist end to end.
const coordinator = getPublishedProfession("security-coordinator");
expect(
  Boolean(coordinator),
  "Säkerhetssamordnare must be a published guide — the operational route runs through it",
);
const operational = careerRoutes.find((r) => r.id === "operational");
expect(Boolean(operational), "the operational route must render");
const operationalIds = (operational?.stages ?? []).map((st) => st.professions.map((p) => p.id));
expect(
  operationalIds.length >= 4,
  "the operational route must not jump from a first-year appointment to Säkerhetschef",
);
const coordinatorStage = operationalIds.findIndex((ids) => ids.includes("security-coordinator"));
const managerStage = operationalIds.findIndex((ids) => ids.includes("security-manager"));
expect(
  coordinatorStage !== -1 && managerStage !== -1 && coordinatorStage < managerStage,
  "Säkerhetssamordnare must sit between the appointments and Säkerhetschef",
);
// Every stage transition carries the same three-way classification the guides
// use, so the two surfaces cannot mean different things by the same words.
for (const route of careerRoutes) {
  for (const stage of route.stages.slice(1)) {
    expect(
      stage.shift !== undefined &&
        ["adjacent", "formal_gate", "long_term"].includes(stage.shift.kind),
      `route "${route.id}" has a stage transition with no classification`,
    );
  }
}

// -----------------------------------------------------------------------
// 16c. Education: four facts per row, and money touches none of them
// -----------------------------------------------------------------------

expect(
  EDUCATION_PROVIDER_PLACEMENTS.length === 0,
  "the pilot ships the placement mechanism and no placement; adding one is a content decision with a disclosure obligation",
);

for (const p of publishedProfessions) {
  const edu = professionEducation(p);
  for (const offer of edu.offers) {
    expect(
      offer.countries.length > 0,
      `${p.id}/${offer.id}: an offer must state the jurisdiction it applies in`,
    );
    expect(
      Boolean(offer.lastVerified),
      `${p.id}/${offer.id}: an offer must state when it was last reviewed`,
    );
    expect(
      Boolean(offer.source?.label?.sv && offer.source?.label?.en),
      `${p.id}/${offer.id}: an offer must cite a source in both languages`,
    );
    // A formal requirement is a claim about law. It may only be made for a
    // profession that is personally regulated AND in a jurisdiction that
    // profession actually claims.
    if (offer.relevance === "formal_requirement") {
      expect(
        p.regulated && (p.formalRequirements?.length ?? 0) > 0,
        `${p.id}/${offer.id}: only a personally regulated role may carry a formal requirement`,
      );
      expect(
        offer.countries.some((c) => p.countries.includes(c)),
        `${p.id}/${offer.id}: a formal requirement must be scoped to a jurisdiction the guide claims`,
      );
    }
  }
  expect(
    orderIsPlacementBlind(edu.offers),
    `${p.id}: marking every offer sponsored must not change the order`,
  );
}

// Structural, not empirical: the ordering key's own input type must not carry
// a placement field, so no future edit can make ranking read one without
// changing a signature that a reviewer will see.
const educationSource = read("src/lib/career-center/education-offers.ts");
const orderableBlock = educationSource.slice(
  educationSource.indexOf("export interface OrderableOffer"),
  educationSource.indexOf("const RELEVANCE_RANK"),
);
expect(
  !/placement/i.test(orderableBlock),
  "OrderableOffer must not carry a placement field — the ordering must be structurally blind to money",
);
expect(
  educationOrderKey({ id: "z", kind: "education", relevance: "formal_requirement" })[0] <
    educationOrderKey({ id: "a", kind: "education", relevance: "recommended_development" })[0],
  "a formal requirement must always outrank recommended development",
);

// Disclosure has no off switch: the label is driven by the placement value
// itself, and the panel states what a paid placement does and does not do.
const educationPanel = code(read("src/components/career-center/EducationPanel.tsx"));
expect(
  educationPanel.includes('pl.placement === "sponsored"') &&
    educationPanel.includes('t("cc.p.education.sponsored")'),
  "a sponsored placement must render its disclosure label from the placement value",
);
expect(
  educationPanel.includes('t("cc.p.education.neutrality")'),
  "the education panel must state that the order is not affected by payment",
);
for (const lang of ["sv", "en"] as const) {
  const d = dictionaries[lang] as Record<string, string>;
  expect(
    /sponsr|sponsor/i.test(d["cc.p.education.sponsored"]),
    `${lang}: the sponsorship label must say it is sponsored`,
  );
  expect(
    /rekommend|recommend/i.test(d["cc.p.education.sponsored.help"]),
    `${lang}: the sponsorship note must state that payment does not affect what is recommended`,
  );
}

// -----------------------------------------------------------------------
// 16d. The personal section is personal only when it has the person
// -----------------------------------------------------------------------

expect(
  personalDirection(undefined, { signedIn: false }).state === "anonymous",
  "an anonymous visitor must reach the anonymous state, never a recommendation list",
);
expect(
  personalDirection(undefined, { signedIn: null }).state === "loading",
  "an unresolved session must not be treated as signed out",
);
expect(
  personalDirection({ state: "none" }, { signedIn: true }).state === "no_result",
  "a signed-in visitor with no analysis must be told so",
);
expect(
  personalDirection({ state: "unavailable" }, { signedIn: true }).state === "unreadable",
  "a failed read must never be reported as 'you have not taken the analysis'",
);
expect(
  personalDirection({ state: "legacy", completedAt: null, reportHref: "/r/1" }, { signedIn: true })
    .state === "no_roles_named",
  "a legacy result is a result, and names areas rather than occupations",
);
const readyFixture = personalDirection(
  {
    state: "ready",
    completedAt: "2026-09-01T00:00:00Z",
    reportHref: "/security-career-assessment/report/abc",
    topRole: {
      rank: 1,
      titleSv: "Väktare",
      titleEn: "Security Officer",
      cigSlug: "vaktare",
      confidence: "high",
    },
    alternativeRoles: [
      {
        rank: 2,
        titleSv: "Säkerhetssamordnare",
        titleEn: "Security Coordinator",
        cigSlug: "sakerhetssamordnare",
        confidence: "indicative",
      },
      {
        rank: 3,
        titleSv: "Polis",
        titleEn: "Police Officer",
        cigSlug: "polis",
        confidence: "high",
      },
    ],
    strengthThemes: [],
    frozenLocale: "sv",
  },
  { signedIn: true },
);
expect(readyFixture.state === "ready", "a readable v3.1 report must produce recommendations");
if (readyFixture.state === "ready") {
  expect(
    readyFixture.items.length <= MAX_PERSONAL_RECOMMENDATIONS,
    "the personal section must show at most three recommendations",
  );
  expect(
    readyFixture.formalRequirementsAssessed === false,
    "the personal section must always state that formal requirements were not assessed",
  );
  expect(
    readyFixture.items[0]?.profession?.slug === "security-officer",
    "a recommendation's guide link must be resolved through the slug bridge",
  );
  expect(
    readyFixture.items[1]?.reason === "ranked_indicative",
    "an indicative match must carry its own reason rather than being flattened",
  );
  expect(
    readyFixture.items[2]?.profession === null,
    "a recommendation with no published guide must render as text, not as a link",
  );
}
expect(
  personal.includes("formalRequirementsAssessed"),
  "the personal section must render its 'formal requirements not assessed' line from the model",
);

// -----------------------------------------------------------------------
// 16e. Passport: "not registered" is not "missing"
// -----------------------------------------------------------------------

const nextStepPanel = code(read("src/components/career-center/NextStepPanel.tsx"));
expect(
  nextStepPanel.includes('t("cc.p.act.passport.body")'),
  "the profession guide must state the Passport boundary",
);
// The sentence has two halves and BOTH are load-bearing. "Not registered"
// alone still leaves the reader to supply the other half themselves, and the
// half they supply is "so you must not have it". So the copy has to state the
// contrast explicitly, and the guard asserts the contrast rather than merely
// banning the word "lack" — which appears in the correct sentence, negated.
for (const [lang, registered, contrast, unqualified] of [
  ["sv", /inte (är )?registrerad/i, /inte att du saknar/i, /(?<!inte att du )\bsaknas\b/i],
  ["en", /not registered/i, /not that you lack/i, /\bis missing\b/i],
] as const) {
  const body = (dictionaries[lang] as Record<string, string>)["cc.p.act.passport.body"];
  expect(
    registered.test(body),
    `${lang}: a merit that is not shown must be described as NOT REGISTERED`,
  );
  expect(
    contrast.test(body),
    `${lang}: the boundary must say explicitly that "not registered" is not "you do not have it"`,
  );
  expect(
    !unqualified.test(body),
    `${lang}: the Passport boundary must not state, unqualified, that a merit is missing`,
  );
}
// The Career Center must not read the visitor's Passport at all: this is a
// public, indexed, cacheable page about a profession, and holding merits is
// not the same claim as being qualified for a role.
for (const file of [
  "src/components/career-center/NextStepPanel.tsx",
  "src/components/career-center/ProfessionTemplate.tsx",
  "src/routes/career-center.index.tsx",
  "src/routes/career-center.$profession.tsx",
]) {
  const source = code(read(file));
  expect(
    !/getMyPassport|getMyProfessionalIdentity|countMerits/.test(source),
    `${file} must not read Passport data — the Career Center links to the Passport, it does not interpret it`,
  );
}

// -----------------------------------------------------------------------
// 16f. No flow ends in a dead end
// -----------------------------------------------------------------------

for (const p of publishedProfessions) {
  const hasWayOn =
    onwardTransitions(p).length > 0 ||
    inboundTransitions(p).length > 0 ||
    publishedOnly(p.related ?? []).filter((r) => r.id !== p.id).length > 0;
  expect(hasWayOn, `${p.id} offers no onward route of any kind`);
}
expect(
  nextStepPanel.includes('t("cc.p.jobs.alt.all")') &&
    nextStepPanel.includes('t("cc.p.jobs.alt.related")'),
  "a profession with no job-catalogue node must still offer two live routes onward",
);

// -----------------------------------------------------------------------
// 16g. Measurement: organic and sponsored are separable
// -----------------------------------------------------------------------

expect(
  CAREER_CENTER_EVENT_WIRE_NAME.career_education_opened === "career_education_opened",
  "opening a training offer needs its own event name — no existing name means it",
);
const analyticsSource = read("src/lib/career-center/analytics.ts");
expect(
  analyticsSource.includes("payload.placement = detail.placement"),
  "the education event must carry its placement so organic and sponsored can be counted apart",
);
expect(
  template.includes("placement,") && template.includes("career_education_opened"),
  "the profession guide must forward the placement of the offer that was opened",
);

// =======================================================================
// Report
// =======================================================================

if (errors.length > 0) {
  console.error(`career-center:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `career-center:check OK — ${PUBLISHED_PROFESSION_COUNT} published guide(s), ${upcomingProfessions.length} upcoming, ${careerRoutes.length} career route(s)`,
);
