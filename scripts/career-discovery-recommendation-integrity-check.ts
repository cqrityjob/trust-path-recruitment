// PROFESSION RECOMMENDATIONS — the promises around the ranking, not the
// ranking itself.
//
// `career-discovery-recommendation-check.ts` already proves the ranking is
// deterministic, always present, correctly ordered and honestly worded, and
// `career-discovery-canonical-result-check.ts` proves the anonymous and the
// saved report are byte-identical. Neither of them can see the three ways a
// correct ranking still failed to reach a real candidate:
//
//   1. A FAILED READ LOOKED LIKE AN EMPTY CATALOGUE.
//      `fetchApprovedProfessionCatalog` and the CIG helpers discarded their
//      `error` and fell through to `data ?? []`. So a dropped connection, a
//      revoked grant or a renamed RPC produced a complete-looking report
//      with no primary recommendation, no Top 3, no Career Card and a note
//      saying profession matching is "not included in this version" — a
//      false statement about the product, frozen into an immutable report
//      the candidate owns forever. "Nothing is approved for ranking" and "we
//      could not ask" are different facts and must not share a shape.
//
//   2. THE PRODUCT ADVERTISED THREE DIFFERENT DURATIONS.
//      One 28-question instrument was "about 5 minutes" on the Career Centre
//      hub and the profession guides, "about 12–15 minutes" on the Discovery
//      landing and preparation screens, and "about 15 minutes" on the Career
//      Card — and the landing page contradicted itself between its own meta
//      description and its own fact list. Somebody promised five minutes and
//      then asked twenty-eight questions has been misled before the product
//      has told them anything, and that same page then asks them to trust
//      its recommendation.
//
//   3. THE CARD'S "NO RANKING" STATE WAS A LOOP.
//      A report issued before profession ranking existed names no
//      professions, so the Career Card cannot be built from it. The card
//      said so — and offered exactly one button: open that same report,
//      which names no professions either. No statement of WHY, and no route
//      to anything that would produce a ranking.
//
// Plus the fairness contract the recommendation has always held but nothing
// asserted: which inputs are allowed to move a profession's rank.
//
// Source-level where the property is about the SHAPE of the code, behavioural
// where the real function can be run. Credential-free and network-free.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { CORE_ITEMS } from "../src/lib/career-discovery/v31/core-items";
import { OPTION_SET_BY_QUESTION } from "../src/lib/career-discovery/v31/option-matrix";
import { PATTERNS } from "../src/lib/career-discovery/v31/patterns";
import {
  adaptiveItemsForStatus,
  CONTEXT_ITEMS,
} from "../src/lib/career-discovery/v31/personal-layer";
import {
  DIMENSIONS,
  DIMENSION_IDS,
  type DimensionId,
} from "../src/lib/career-discovery/v31/dimensions";
import {
  DURATION_CLAIM,
  DURATION_CLAIM_MINUTES,
  DURATION_CLAIM_SENTENCE,
  ESTIMATED_MINUTES,
} from "../src/lib/career-discovery/v31/duration";
import {
  buildCanonicalSnapshot,
  splitAndValidateRun,
  v31PublicErrorCode,
} from "../src/lib/career-discovery/v31-public.functions";
import { FIRST_WAVE_CATALOG } from "./fixtures/first-wave-profession-catalog";

let failures = 0;
let checks = 0;

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

function eq<T>(actual: T, expected: T, label: string): void {
  ok(
    Object.is(actual, expected),
    Object.is(actual, expected)
      ? label
      : `${label} (got ${String(actual)}, expected ${String(expected)})`,
  );
}

function group(name: string): void {
  console.log(`\n${name}`);
}

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".gen.ts")) out.push(full);
  }
  return out;
}

const SRC = new URL("../src", import.meta.url).pathname;

// =========================================================================
// A complete buffered run and a stubbed client, so the REAL
// `buildCanonicalSnapshot` is what runs — not a reimplementation of it.
// =========================================================================

type Buffered =
  | { itemId: string; format: "scale"; value: number }
  | { itemId: string; format: "single_choice"; optionId: string }
  | { itemId: string; format: "personal"; value: string };

function bufferedRun(patternId: keyof typeof PATTERNS, contextStatus: string): Buffered[] {
  const def = PATTERNS[patternId];
  const core: Buffered[] = CORE_ITEMS.map((item) => {
    if (item.format === "scale") {
      const central = def.central.includes(item.primary);
      const supporting = def.supporting.includes(item.primary);
      return { itemId: item.id, format: "scale", value: central ? 10 : supporting ? 7 : 2 };
    }
    const set = OPTION_SET_BY_QUESTION[item.id];
    let best = set.options[0];
    let bestScore = -Infinity;
    for (const o of set.options) {
      const s = o.loadings.reduce(
        (acc, l) =>
          acc +
          (def.central.includes(l.dimension) ? l.value * 2 : 0) +
          (def.supporting.includes(l.dimension) ? l.value : 0),
        0,
      );
      if (s > bestScore) {
        bestScore = s;
        best = o;
      }
    }
    return { itemId: item.id, format: "single_choice", optionId: best.id };
  });

  const personal: Buffered[] = CONTEXT_ITEMS.map((item) => ({
    itemId: item.id,
    format: "personal",
    value: item.id === CONTEXT_ITEMS[0].id ? contextStatus : item.options[0].value,
  }));
  for (const item of adaptiveItemsForStatus(contextStatus as never)) {
    personal.push({ itemId: item.id, format: "personal", value: item.options[0].value });
  }
  return [...core, ...personal];
}

/** `failing` names which read breaks. Everything else answers normally, so a
 *  thrown error can only have come from the read under test. */
function stubSupabase(options: {
  approvedCatalog: boolean;
  failing?: "cd_professions" | "bands" | "cig_professions" | "cig_career_transitions";
  /** Approved professions come back, their calibration bands do not. */
  bandsMissing?: boolean;
}) {
  const catalog = options.approvedCatalog ? FIRST_WAVE_CATALOG : [];
  const professionRows = catalog.map((c) => ({
    profession_id: c.professionId,
    career_area_id: c.careerAreaId,
    title_sv: c.titleSv,
    title_en: c.titleEn,
    career_stage: c.careerStage,
    entry_role: c.entryRole,
    regulated: c.regulated,
    transition_difficulty: c.transitionDifficulty,
    inclusion_rationale_sv: c.inclusionRationaleSv,
    inclusion_rationale_en: c.inclusionRationaleEn,
    limitation_note_sv: c.limitationNoteSv,
    limitation_note_en: c.limitationNoteEn,
    cig_profession_slug: c.cigProfessionSlug,
  }));
  const bandRows = options.bandsMissing
    ? []
    : catalog.flatMap((c) =>
        c.bands.map((b) => ({
          profession_id: c.professionId,
          calibration_version: "cal-first-wave",
          dimension_id: b.dimensionId,
          band_low: b.bandLow,
          band_high: b.bandHigh,
          weight: b.weight,
          centrality: b.centrality,
        })),
      );

  const err = (table: string) =>
    options.failing === table ? { message: `${table} unavailable`, code: "57P01" } : null;

  return {
    from: (table: string) => {
      const rows: unknown[] =
        table === "cd_professions"
          ? professionRows
          : table === "cig_professions"
            ? [{ id: "cig-1", title_sv: "Säkerhetschef", title_en: "Head of Security" }]
            : [];
      const error = err(table);
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        maybeSingle: async () => ({ data: error ? null : (rows[0] ?? null), error }),
        then: (resolve: (v: { data: unknown[]; error: unknown }) => unknown) =>
          resolve({ data: error ? [] : rows, error }),
      };
      return builder;
    },
    rpc: async (fn: string) =>
      fn === "cd_profession_bands_for_matching"
        ? { data: options.failing === "bands" ? null : bandRows, error: err("bands") }
        : { data: [], error: null },
  };
}

const RUN = splitAndValidateRun(bufferedRun("CP01", "working_in_security") as never);
const COMPLETED_AT = "2026-08-31T09:00:00.000Z";
const CONTEXT = {
  currentProfessionStatus: "selected" as const,
  currentProfessionSlug: "sakerhetschef",
  experienceBand: "5_to_10" as const,
};

async function buildWith(stub: ReturnType<typeof stubSupabase>) {
  return buildCanonicalSnapshot(stub as never, {
    run: RUN,
    locale: "sv",
    completedAt: COMPLETED_AT,
    careerContext: CONTEXT as never,
  });
}

async function errorCodeFrom(stub: ReturnType<typeof stubSupabase>): Promise<string | null> {
  try {
    await buildWith(stub);
    return null;
  } catch (e) {
    return v31PublicErrorCode(e);
  }
}

// =========================================================================
group("1 · A partial input never becomes a report");
// =========================================================================

{
  const healthy = await buildWith(stubSupabase({ approvedCatalog: true }));
  eq(healthy.professions.ranked?.length ?? 0, 3, "1.1 a healthy read produces the Top 3");
  ok(healthy.professions.available === true, "1.2 and the gated tiers are available");
}

// The distinction the whole section exists for: an EMPTY approved catalogue
// is a real, honest answer and must keep working. Only a FAILED read is an
// error. If this assertion ever flips, the fix has over-corrected and an
// owner who has approved nothing yet can no longer issue a report at all.
{
  const empty = await buildWith(stubSupabase({ approvedCatalog: false }));
  eq(empty.professions.available, false, "1.3 an empty approved catalogue still builds a report");
  eq(
    empty.versions.professionCalibrationVersion,
    null,
    "1.4 and claims no calibration version for it",
  );
}

for (const [table, label] of [
  ["cd_professions", "the approved catalogue"],
  ["bands", "the calibration bands"],
  ["cig_professions", "the CIG profession lookup"],
  ["cig_career_transitions", "the CIG transition edges"],
] as const) {
  const code = await errorCodeFrom(
    stubSupabase({ approvedCatalog: true, failing: table as never }),
  );
  eq(code, "catalog_unavailable", `1.5 a failed read of ${label} refuses rather than degrades`);
}

{
  // Approved professions with no bands cannot be scored, so they would
  // silently vanish from the ranking — the owner's approval would simply
  // have no effect, with nothing anywhere saying so.
  const code = await errorCodeFrom(stubSupabase({ approvedCatalog: true, bandsMissing: true }));
  eq(
    code,
    "catalog_unavailable",
    "1.6 approved professions returning no calibration bands are refused, not dropped",
  );
}

{
  const fns = read("src/lib/career-discovery/v31-public.functions.ts");
  const helpers = read("src/lib/career-discovery/career-context.functions.ts");
  // The shape assertion behind the behaviour: a read whose error is never
  // bound cannot be checked, and this is exactly how the defect was written.
  const catalogFn = fns.slice(
    fns.indexOf("async function fetchApprovedProfessionCatalog"),
    fns.indexOf("type Ctx = "),
  );
  ok(
    /error: professionsError/.test(catalogFn) && /throw new V31PublicError/.test(catalogFn),
    "1.7 the catalogue read binds its error and throws on it",
  );
  ok(
    /if \(currentError\) throw new CigReadError/.test(helpers) &&
      /if \(transitionsError\) throw new CigReadError/.test(helpers),
    "1.8 both CIG reads bind their error and throw on it",
  );
  ok(
    /catalog_unavailable/.test(fns),
    "1.9 the refusal has its own error code, distinct from persist_failed",
  );
}

// The candidate must be able to recover: nothing is written on the preview
// path, the buffer survives, and the result screen already renders a retry.
{
  const flow = read("src/components/career-discovery/v31/PublicAssessmentFlow.tsx");
  ok(
    flow.includes("cd.public.resultUnavailable") && flow.includes("cd.public.retryResult"),
    "1.10 a failed build lands on the honest retry screen, not on a degraded report",
  );
  ok(flow.includes("cd.public.answersKept"), "1.11 and says the answers are kept");
}

// =========================================================================
group("2 · One duration, derived from the instrument");
// =========================================================================

ok(
  ESTIMATED_MINUTES >= DURATION_CLAIM_MINUTES.low - 1 &&
    ESTIMATED_MINUTES <= DURATION_CLAIM_MINUTES.high + 1,
  `2.1 the authored estimate (${ESTIMATED_MINUTES} min) is inside the advertised claim`,
);

// Every "N minutes" a candidate can read about Career Discovery, in the
// dictionaries and in the surfaces that link to it. Other products have
// their own durations and are not in scope here.
const DURATION_RE = /(\d+)(?:\s*[–—-]\s*(\d+))?\s*(minuter|minutes)/gi;

function claimsIn(body: string): { text: string; low: number; high: number }[] {
  const out: { text: string; low: number; high: number }[] = [];
  for (const m of body.matchAll(DURATION_RE)) {
    const low = Number(m[1]);
    const high = m[2] ? Number(m[2]) : low;
    out.push({ text: m[0], low, high });
  }
  return out;
}

{
  const dict = read("src/i18n/dictionaries.ts");
  // Only lines belonging to a Career Discovery / Career Centre key. The
  // interview, academy and employer-assessment products state their own
  // (different, correct) durations.
  const CAREER_KEY = /^\s*"(careerDiscovery|sca|cc)\./;
  const lines = dict.split("\n");
  const offenders: string[] = [];
  let key = "";
  for (const line of lines) {
    const m = line.match(/^\s*"([\w.]+)":/);
    if (m) key = m[1];
    if (!CAREER_KEY.test(`  "${key}.`)) continue;
    for (const claim of claimsIn(line)) {
      if (claim.low !== DURATION_CLAIM_MINUTES.low || claim.high !== DURATION_CLAIM_MINUTES.high) {
        offenders.push(`${key}: "${claim.text}"`);
      }
    }
  }
  eq(
    offenders.length,
    0,
    `2.2 no Career Discovery dictionary string states another duration (${offenders.join("; ") || "none"})`,
  );
}

{
  // The surfaces that own the claim in code rather than in the dictionary.
  const SURFACES = [
    "src/components/career-discovery/v31/shell/AssessmentIntro.tsx",
    "src/routes/career-center.index.tsx",
    "src/routes/_authenticated/my-career/career-card.tsx",
    "src/components/professional-identity/NextActions.tsx",
    "src/components/career-discovery/DiscoveryLanding.tsx",
  ];
  const offenders: string[] = [];
  for (const rel of SURFACES) {
    let body: string;
    try {
      body = read(rel);
    } catch {
      // Route files are flat-named in this repository; try that form.
      body = read(
        rel.replace(/^src\/routes\/(.*)$/, (_, p: string) => `src/routes/${p.replace(/\//g, ".")}`),
      );
    }
    const stripped = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const claim of claimsIn(stripped)) {
      if (claim.low !== DURATION_CLAIM_MINUTES.low || claim.high !== DURATION_CLAIM_MINUTES.high) {
        offenders.push(`${rel}: "${claim.text}"`);
      }
    }
  }
  eq(
    offenders.length,
    0,
    `2.3 no Career Discovery surface hardcodes another duration (${offenders.join("; ") || "none"})`,
  );
}

{
  const hub = read("src/routes/career-center.index.tsx");
  const landing = read("src/components/career-discovery/DiscoveryLanding.tsx");
  const intro = read("src/components/career-discovery/v31/shell/AssessmentIntro.tsx");
  ok(
    hub.includes("DURATION_CLAIM") && landing.includes("DURATION_CLAIM"),
    "2.4 the hub and the landing render the derived claim rather than a typed number",
  );
  // The page where somebody actually decides to start said nothing about
  // duration at all, which left the Career Centre making the only (and
  // wrong) promise about it.
  ok(
    intro.includes("DURATION_CLAIM"),
    "2.4b the assessment's own intro states the duration, derived",
  );
  eq(DURATION_CLAIM.sv, "Cirka 12–15 minuter", "2.5 the Swedish claim reads as expected");
  eq(DURATION_CLAIM.en, "About 12–15 minutes", "2.6 the English claim reads as expected");
  ok(
    DURATION_CLAIM_SENTENCE.sv.includes("12–15") && DURATION_CLAIM_SENTENCE.en.includes("12–15"),
    "2.7 the sentence form carries the same range",
  );
}

// =========================================================================
group("3 · The Career Card is never a dead end");
// =========================================================================

{
  const card = read("src/routes/_authenticated.my-career.career-card.tsx");

  ok(
    card.includes('to="/security-career-assessment"'),
    "3.1 the no-assessment state offers the assessment",
  );
  // The loop: this state used to offer only the report it is complaining
  // about. It must now also offer the thing that actually produces a ranking.
  const noRanking = card.slice(
    card.indexOf("ranked.length === 0"),
    card.indexOf("ranked.length > 0"),
  );
  ok(
    noRanking.includes('to="/security-career-assessment"'),
    "3.2 the no-ranking state offers a route that can produce a ranking",
  );
  ok(
    noRanking.includes("openOldReport"),
    "3.3 and still lets the older report be opened, labelled as the older one",
  );
  ok(
    /namnger yrken|names professions/.test(card),
    "3.4 and says WHY the older report has no ranking",
  );
  // Truthfulness: a stored report is frozen, so the copy must not imply the
  // old one will gain a ranking on its own.
  ok(
    /aldrig om|never recomputed/.test(card),
    "3.5 without implying a saved report will be recomputed",
  );

  // The card still consumes the canonical ranking and computes none of its own.
  ok(
    card.includes("snapshot?.professions?.ranked"),
    "3.6 the card reads the canonical ranked Top 3",
  );
  ok(!/matchProfessions|rankCareerAreas/.test(card), "3.7 and ranks nothing itself");
}

// =========================================================================
group("4 · Only approved inputs can move a profession's rank");
// =========================================================================

// The complete, stated list. `matchProfessions`' signature IS the contract:
// anything not passed here cannot reach a rank, because the module is pure
// and reads nothing else.
const RANKING_INPUTS = [
  "dims", // the 17 Career DNA dimensions, from the 22 scored items
  "catalog", // owner-approved professions and their calibration bands
  "contextStatus", // C1 — the candidate's own stated situation
  "currentProfessionCigSlug", // C-context — the job they say they hold
  "discoveryTags", // the 4 Discovery Path answers
  "cigReachableSlugs", // published transition edges from that job
  "experienceBand", // C-context — years they say they have
] as const;

{
  const professions = read("src/lib/career-discovery/v31/professions.ts");
  const sig = professions.slice(
    professions.indexOf("export function matchProfessions("),
    professions.indexOf("): ProfessionMatchResult {"),
  );
  const declared = [...sig.matchAll(/^\s{2}(\w+)[?]?:/gm)].map((m) => m[1]);
  eq(
    declared.join(","),
    RANKING_INPUTS.join(","),
    "4.1 the ranking takes exactly the approved inputs, in the documented order",
  );
}

// No protected characteristic exists as a dimension. The instrument measures
// preference and working style; none of these is measurable from it, and a
// dimension named for one would be the first sign that changed.
const PROTECTED = [
  "sex",
  "gender",
  "ethnic",
  "race",
  "religio",
  "disab",
  "age",
  "birth",
  "nationalit",
  "citizen",
  "marital",
  "pregnan",
  "sexual",
];
{
  const offenders: string[] = [];
  for (const id of DIMENSION_IDS) {
    const def = DIMENSIONS[id as DimensionId];
    const text = `${id} ${def.name.sv} ${def.name.en}`.toLowerCase();
    for (const word of PROTECTED) {
      // "age" is a substring of far too much ordinary English ("manage",
      // "engagement"), so it is matched as a whole word only.
      const re = word === "age" ? /\bage\b/ : new RegExp(word);
      if (re.test(text)) offenders.push(`${id} (${word})`);
    }
  }
  eq(
    offenders.length,
    0,
    `4.2 no scored dimension names a protected characteristic (${offenders.join("; ") || "none"})`,
  );
}

{
  // The domain module is pure and reads nothing outside its arguments — so
  // the profile fields that DO hold personal data (name, date of birth,
  // photo, nationality) cannot reach it. Asserted rather than assumed: an
  // import is how that would change.
  const domain = sourceFiles(path.join(SRC, "lib/career-discovery/v31"));
  const offenders: string[] = [];
  for (const file of domain) {
    const body = readFileSync(file, "utf8");
    for (const m of body.matchAll(/from "([^"]+)"/g)) {
      const spec = m[1];
      if (/professional-identity|security-passport|profile|identity\.functions/.test(spec)) {
        offenders.push(`${path.basename(file)} -> ${spec}`);
      }
    }
  }
  eq(
    offenders.length,
    0,
    `4.3 the ranking domain imports no identity or profile module (${offenders.join("; ") || "none"})`,
  );
}

{
  // CID15 is the one dimension deliberately excluded from matching (owner
  // decision A-4). It informs wording only, and the contract says so.
  const dimensions = read("src/lib/career-discovery/v31/dimensions.ts");
  ok(
    /CID15 is excluded/.test(dimensions),
    "4.4 the one non-matching dimension is still documented as such",
  );
}

// Behavioural: the self-reported context fields are allowed to influence
// PRIORITY, never eligibility — and swapping the whole context must never
// invent an affinity the answers do not support. Same run, two very
// different self-reports.
{
  const a = await buildWith(stubSupabase({ approvedCatalog: true }));
  const b = await buildCanonicalSnapshot(stubSupabase({ approvedCatalog: true }) as never, {
    run: RUN,
    locale: "sv",
    completedAt: COMPLETED_AT,
  });
  eq(a.professions.ranked?.length ?? 0, 3, "4.5 a ranking exists with career context supplied");
  eq(b.professions.ranked?.length ?? 0, 3, "4.6 and without it");
  const dimsA = JSON.stringify(a.outputA.dimensions);
  const dimsB = JSON.stringify(b.outputA.dimensions);
  eq(dimsA, dimsB, "4.7 self-reported context never changes a single Career DNA score");
}

// =========================================================================
console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`career-discovery-recommendation-integrity-check: all ${checks} checks passed.`);
