// ONE COMPLETED ATTEMPT = ONE CANONICAL RESULT — regression.
//
// ── THE DEFECT ─────────────────────────────────────────────────────────
//
// A candidate completed Career Discovery signed out, read their report,
// downloaded it — and then signed in and found materially DIFFERENT career
// recommendations waiting for them. Nothing failed; nothing logged. The
// assessment had been answered once and scored twice, from two call sites,
// with two different sets of inputs:
//
//   * PublicAssessmentFlow.tsx built the pre-login report IN THE BROWSER and
//     passed no `professionCatalog` and no `cigReachableSlugs`. It could not
//     pass them: `cd_professions` is granted to `authenticated` only.
//     `matchProfessions` short-circuits on an empty catalogue, so
//     `professions.available` was false, `ranked` was empty, the report
//     showed a "matching not included" note, and the Career Card — gated on
//     `available` — was not offered at all.
//   * `persistPublicV31Run` rebuilt the very same answers SERVER-SIDE with
//     the approved catalogue, the real calibration version and the real CIG
//     transition edges, producing the full ranked Top 3.
//
// The engine was never the problem. `buildValidatedSnapshot` is pure and was
// pure throughout: given the same inputs it always produced the same report.
// The two callers simply never gave it the same inputs, and authentication
// was the thing that decided which caller ran.
//
// ── WHY THIS FILE ASSERTS WHAT IT ASSERTS ──────────────────────────────
//
// "Both paths produce the same result" is not a property that can be
// established by testing two implementations against each other — that only
// proves they agree TODAY, and the defect above is exactly what two
// implementations agreeing today looks like six months later. So the
// assertions are about the SHAPE of the code as much as its output:
//
//   1. There is exactly one builder. Both server functions call
//      `buildCanonicalSnapshot`; neither calls `buildValidatedSnapshot`
//      directly, and no client component calls it at all.
//   2. Given one run, that builder produces a byte-identical snapshot when
//      invoked as the anonymous preview and as the save path — including the
//      ranked Top 3, its order, and every deterministic score.
//   3. Re-running it (a refresh, a direct report URL, a retry) changes
//      nothing.
//   4. It is the CATALOGUE, not the caller, that decides whether
//      recommendations exist — proven by showing the old divergence is
//      reproducible on demand and that the shipped path can no longer reach
//      it, because only one call site exists.
//   5. The claim/save flow carries the same `completedAt` the preview built
//      for, so the stored report matches the one the candidate read.
//
// Runs headless against a stubbed Supabase client: the catalogue read is the
// only I/O `buildCanonicalSnapshot` performs, and stubbing it is what lets
// the real function — not a reimplementation of it — be the thing under test.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { CORE_ITEMS } from "../src/lib/career-discovery/v31/core-items";
import { OPTION_SET_BY_QUESTION } from "../src/lib/career-discovery/v31/option-matrix";
import { PATTERNS } from "../src/lib/career-discovery/v31/patterns";
import {
  ADAPTIVE_ITEMS_PER_SESSION,
  adaptiveItemsForStatus,
  CONTEXT_ITEMS,
} from "../src/lib/career-discovery/v31/personal-layer";
import {
  buildCanonicalSnapshot,
  splitAndValidateRun,
} from "../src/lib/career-discovery/v31-public.functions";
import type { ReportSnapshot } from "../src/lib/career-discovery/v31/snapshot";
import { FIRST_WAVE_CATALOG } from "./fixtures/first-wave-profession-catalog";

let failures = 0;
let checks = 0;

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  } else {
    console.log(`  ok  ${label}`);
  }
}

function eq<T>(actual: T, expected: T, label: string): void {
  ok(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label}${JSON.stringify(actual) === JSON.stringify(expected) ? "" : ` (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`}`,
  );
}

/** Every .ts/.tsx under a directory. Generated route trees are excluded for
 *  the same reason release-parity excludes types.ts: they describe the app,
 *  they do not call anything. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".gen.ts")) out.push(full);
  }
  return out;
}

function group(name: string): void {
  console.log(`\n${name}`);
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

// =========================================================================
// A complete buffered run, exactly as the browser sends it.
// =========================================================================

type Buffered =
  | { itemId: string; format: "scale"; value: number }
  | { itemId: string; format: "single_choice"; optionId: string }
  | { itemId: string; format: "personal"; value: string };

/** The 22 scored Career DNA answers for one pattern archetype, plus the 2
 *  context answers and the 4 Discovery Path answers that candidate's own
 *  path serves — the same shape v31-public-buffer.ts stores. */
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
    // C1 carries the routing answer; C2 takes its own first option.
    value: item.id === CONTEXT_ITEMS[0].id ? contextStatus : item.options[0].value,
  }));
  for (const item of adaptiveItemsForStatus(contextStatus as never)) {
    personal.push({ itemId: item.id, format: "personal", value: item.options[0].value });
  }
  return [...core, ...personal];
}

// =========================================================================
// A stubbed Supabase client.
//
// `buildCanonicalSnapshot` reads three things and nothing else: the approved
// profession catalogue, that catalogue's calibration bands, and the CIG
// tables behind the candidate's self-reported current profession. Stubbing
// exactly those lets the REAL builder run — the point of this file is to
// test the shipped function, not a copy of it.
// =========================================================================

function stubSupabase(options: { approvedCatalog: boolean }) {
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
  const bandRows = catalog.flatMap((c) =>
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

  return {
    from(table: string) {
      const rows =
        table === "cd_professions"
          ? professionRows
          : table === "cig_professions"
            ? [{ id: "cig-1", title_sv: "Säkerhetschef", title_en: "Head of Security" }]
            : [];
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then: (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data: rows }),
      };
      return builder;
    },
    rpc: async (fn: string) =>
      fn === "cd_profession_bands_for_matching" ? { data: bandRows } : { data: [] },
  };
}

// =========================================================================
group("1 · There is exactly ONE builder, and no client-side ranking");
// =========================================================================

const serverFns = read("src/lib/career-discovery/v31-public.functions.ts");
const publicFlow = read("src/components/career-discovery/v31/PublicAssessmentFlow.tsx");

ok(
  serverFns.includes("export const previewPublicV31Run"),
  "1.1 the anonymous preview is a server function, not a browser computation",
);
// The single most important assertion in this file. If the anonymous report
// is ever computed in the browser again, it is computed without the
// profession catalogue, and the defect is back verbatim.
ok(
  !/\bbuildValidatedSnapshot\b/.test(publicFlow.replace(/\/\/.*$/gm, "")),
  "1.2 PublicAssessmentFlow never builds a snapshot itself (no client-side ranking path)",
);
ok(
  !/from "@\/lib\/career-discovery\/v31\/snapshot"/.test(
    publicFlow.replace(/import type[^;]+;/g, ""),
  ),
  "1.3 PublicAssessmentFlow imports snapshot TYPES only, never the engine",
);
{
  const preview = serverFns.slice(serverFns.indexOf("export const previewPublicV31Run"));
  const persist = serverFns.slice(serverFns.indexOf("export const persistPublicV31Run"));
  ok(
    preview.includes("buildCanonicalSnapshot("),
    "1.4 previewPublicV31Run builds through buildCanonicalSnapshot",
  );
  ok(
    persist.includes("buildCanonicalSnapshot("),
    "1.5 persistPublicV31Run builds through the SAME buildCanonicalSnapshot",
  );
  ok(
    !preview.includes("buildValidatedSnapshot(") && !persist.includes("buildValidatedSnapshot("),
    "1.6 neither server function reaches past the canonical builder to the raw engine",
  );
  ok(
    preview.includes("splitAndValidateRun(") && persist.includes("splitAndValidateRun("),
    "1.7 both validate the run with the same splitter, so neither can accept what the other rejects",
  );
}

// ── AND "EXACTLY ONE" MEANS ACROSS THE WHOLE TREE ──────────────────────
//
// 1.2-1.6 above check three named files. That was not enough, and the gap
// was not hypothetical: `v31-completion.functions.ts` held a SECOND writer
// of cd_report_snapshots (`completeV31Session`) that called
// `buildValidatedSnapshot` directly with no catalogue, no career context and
// no CIG edges. Every report it wrote was frozen with `ranked: []` — no
// primary recommendation, no Top 3, no Career Card — and this guard, which
// exists precisely to stop that, never looked at the file. It was unrouted
// and therefore invisible in the product, which is the only reason it never
// reached a candidate.
//
// So the assertion is now about the tree, not about three paths: the raw
// engine has exactly ONE caller in src/, and that caller is the canonical
// builder. Anything else is a second result for one attempt.
{
  const callers: string[] = [];
  for (const file of sourceFiles(new URL("../src", import.meta.url).pathname)) {
    const body = readFileSync(file, "utf8")
      // Comments discuss it by name constantly; only real calls count.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    // v31/snapshot.ts is where it is DEFINED; a definition is not a caller.
    if (file.endsWith("career-discovery/v31/snapshot.ts")) continue;
    if (/\bbuildValidatedSnapshot\s*\(/.test(body)) {
      callers.push(file.slice(file.indexOf("/src/") + 1));
    }
  }
  eq(
    callers.length,
    1,
    `1.8 the raw engine has exactly one caller in src (found: ${callers.join(", ") || "none"})`,
  );
  ok(
    callers[0]?.endsWith("career-discovery/v31-public.functions.ts") === true,
    "1.9 that one caller is buildCanonicalSnapshot, the canonical builder",
  );
}
// Reading `cd_professions` for an anonymous caller has to happen somewhere.
// It happens server-side, through a dynamic import, so the service-role key
// cannot reach the browser bundle — *.functions.ts modules ship to the client.
ok(
  /await import\("@\/integrations\/supabase\/client\.server"\)/.test(serverFns),
  "1.8 the service-role client is imported dynamically, server-side only",
);
// Both paths read the CATALOGUE through the same client. They see the same
// rows today, so this is not a behaviour assertion — it removes a way for the
// defect to come back: an RLS policy that narrowed cd_professions per user
// would otherwise put two paths back on two different catalogues.
ok(
  (serverFns.match(/buildCanonicalSnapshot\(supabaseAdmin,/g) ?? []).length === 2,
  "1.8b BOTH the preview and the save path build from the same catalogue client",
);
ok(
  !/buildCanonicalSnapshot\(ctx\.supabase/.test(serverFns),
  "1.8c neither builds from a client whose visible rows could differ per user",
);
ok(
  !/^import .*client\.server/m.test(serverFns),
  "1.9 the service-role client is NEVER a top-level import in a *.functions.ts module",
);

// =========================================================================
group("2 · Anonymous and authenticated produce the SAME canonical result");
// =========================================================================

const RUN = bufferedRun("CP08", "working_in_security");
const COMPLETED_AT = "2026-08-29T10:00:00.000Z";
const CAREER_CONTEXT = {
  currentProfessionStatus: "selected" as const,
  currentProfessionSlug: "sakerhetschef",
  currentProfessionOther: null,
  experienceBand: "8_plus_y" as const,
};

const validated = splitAndValidateRun(RUN as never);
eq(validated.answers.length, CORE_ITEMS.length, "2.1 exactly the 22 scored answers reach scoring");
eq(
  validated.discoveryTags.length > 0,
  true,
  "2.2 Discovery Path tags are derived (explanation layer only, never scoring)",
);

const db = stubSupabase({ approvedCatalog: true });

// The anonymous preview — no account, nothing written.
const anonymous: ReportSnapshot = await buildCanonicalSnapshot(db as never, {
  run: validated,
  locale: "sv",
  completedAt: COMPLETED_AT,
  careerContext: CAREER_CONTEXT,
});

// The save path, after the candidate signs in. Same run, same completedAt —
// which is exactly what the client now echoes back from the preview.
const authenticated: ReportSnapshot = await buildCanonicalSnapshot(db as never, {
  run: splitAndValidateRun(RUN as never),
  locale: "sv",
  completedAt: COMPLETED_AT,
  careerContext: CAREER_CONTEXT,
});

ok(
  hash(anonymous) === hash(authenticated),
  "2.3 the anonymous report and the saved report are BYTE-IDENTICAL",
);

// Spelled out separately, because a single hash comparison tells you nothing
// about WHICH field drifted when it fails — and these are the fields the
// candidate actually noticed changing.
const topIds = (s: ReportSnapshot) => (s.professions.ranked ?? []).map((r) => r.match.professionId);
const topRanks = (s: ReportSnapshot) => (s.professions.ranked ?? []).map((r) => r.rank);
const topConfidence = (s: ReportSnapshot) => (s.professions.ranked ?? []).map((r) => r.confidence);
const dimScores = (s: ReportSnapshot) => s.outputA.dimensions.map((d) => [d.id, d.score]);

ok(
  (anonymous.professions.ranked ?? []).length > 0,
  "2.4 the anonymous report NAMES careers at all",
);
eq(topIds(anonymous), topIds(authenticated), "2.5 Top 3 profession ids are identical, in order");
eq(topIds(anonymous)[0], topIds(authenticated)[0], "2.6 Top 1 is identical");
eq(topRanks(anonymous), topRanks(authenticated), "2.7 stated ranks are identical");
eq(
  topConfidence(anonymous),
  topConfidence(authenticated),
  "2.8 recommendation confidence is identical",
);
eq(dimScores(anonymous), dimScores(authenticated), "2.9 every dimension score is identical");
eq(
  anonymous.outputA.leadingPattern,
  authenticated.outputA.leadingPattern,
  "2.10 the leading pattern is identical",
);
eq(
  anonymous.professions.available,
  authenticated.professions.available,
  "2.11 profession availability is identical — the Career Card is offered in both states",
);
eq(
  anonymous.versions,
  authenticated.versions,
  "2.12 every version identifier is identical (assessment, scoring, calibration, report schema)",
);
eq(
  anonymous.currentProfession,
  authenticated.currentProfession,
  "2.13 YOU ARE HERE resolves the same before and after login",
);

// =========================================================================
group("3 · A refresh, a retry and a direct report URL change nothing");
// =========================================================================

const again = await buildCanonicalSnapshot(stubSupabase({ approvedCatalog: true }) as never, {
  run: splitAndValidateRun(RUN as never),
  locale: "sv",
  completedAt: COMPLETED_AT,
  careerContext: CAREER_CONTEXT,
});
ok(hash(again) === hash(anonymous), "3.1 rebuilding the same run yields the same snapshot");
eq(topIds(again), topIds(anonymous), "3.2 Top 3 survives a refresh unchanged");

// A second, independent client (a different browser, the report URL opened
// fresh) is the same call with the same inputs, so it must land in the same
// place. This is what makes the stored snapshot and the previewed one one
// object rather than two that happen to agree.
const thirdParty = await buildCanonicalSnapshot(stubSupabase({ approvedCatalog: true }) as never, {
  run: splitAndValidateRun([...RUN].reverse() as never),
  locale: "sv",
  completedAt: COMPLETED_AT,
  careerContext: CAREER_CONTEXT,
});
ok(
  hash(thirdParty) === hash(anonymous),
  "3.3 answer ORDER on the wire does not change the result (the buffer is a set, not a sequence)",
);

// =========================================================================
group("4 · The catalogue decides recommendations — the caller never does");
// =========================================================================

// The old divergence, reproduced deliberately: this is what the browser's
// own build produced, and it is why signing in appeared to improve the
// result. It is still reachable HERE, on purpose, because the empty
// catalogue is a legitimate state of the product (nothing approved yet). It
// is no longer reachable from the shipped flow, because section 1 proves
// there is only one call site and it always reads the same catalogue.
const noCatalog = await buildCanonicalSnapshot(stubSupabase({ approvedCatalog: false }) as never, {
  run: splitAndValidateRun(RUN as never),
  locale: "sv",
  completedAt: COMPLETED_AT,
  careerContext: CAREER_CONTEXT,
});
eq(noCatalog.professions.available, false, "4.1 an empty catalogue still yields no recommendation");
eq((noCatalog.professions.ranked ?? []).length, 0, "4.2 and no ranking");
ok(
  hash(noCatalog) !== hash(anonymous),
  "4.3 catalogue presence DOES change the result — which is exactly why both paths must read it",
);
eq(
  noCatalog.outputA.dimensions.map((d) => [d.id, d.score]),
  dimScores(anonymous),
  "4.4 dimension scoring is untouched by the catalogue — only the profession layer depends on it",
);
eq(
  noCatalog.versions.professionCalibrationVersion,
  null,
  "4.5 no catalogue, no calibration version — a report never implies a calibration it did not use",
);
ok(
  anonymous.versions.professionCalibrationVersion !== null,
  "4.6 the anonymous report DOES carry a real calibration version, because it really was calibrated",
);

// =========================================================================
group("5 · Both locales, and a run with no career context at all");
// =========================================================================

for (const locale of ["sv", "en"] as const) {
  const a = await buildCanonicalSnapshot(stubSupabase({ approvedCatalog: true }) as never, {
    run: splitAndValidateRun(RUN as never),
    locale,
    completedAt: COMPLETED_AT,
    careerContext: CAREER_CONTEXT,
  });
  const b = await buildCanonicalSnapshot(stubSupabase({ approvedCatalog: true }) as never, {
    run: splitAndValidateRun(RUN as never),
    locale,
    completedAt: COMPLETED_AT,
    careerContext: CAREER_CONTEXT,
  });
  ok(hash(a) === hash(b), `5.1 ${locale}: anonymous and authenticated agree`);
  eq(a.locale, locale, `5.2 ${locale}: the report is frozen in the locale it was taken in`);
}

// The career-context step is skipped entirely for a candidate not already
// working in security. That path must be just as stable.
const studentRun = bufferedRun("CP08", "exploring_security");
const student = await buildCanonicalSnapshot(stubSupabase({ approvedCatalog: true }) as never, {
  run: splitAndValidateRun(studentRun as never),
  locale: "sv",
  completedAt: COMPLETED_AT,
});
const studentAgain = await buildCanonicalSnapshot(
  stubSupabase({ approvedCatalog: true }) as never,
  {
    run: splitAndValidateRun(studentRun as never),
    locale: "sv",
    completedAt: COMPLETED_AT,
  },
);
ok(
  hash(student) === hash(studentAgain),
  "5.3 a run with no career context is equally stable across the login hop",
);
eq(student.currentProfession, null, "5.4 unknown current profession stays unknown, never inferred");

// =========================================================================
group("6 · An incomplete or tampered run is refused, not repaired");
// =========================================================================

function refuses(answers: unknown, label: string): void {
  let threw = false;
  try {
    splitAndValidateRun(answers as never);
  } catch {
    threw = true;
  }
  ok(threw, label);
}

refuses(RUN.slice(0, 10), "6.1 a partial run is refused");
refuses(
  RUN.filter((a) => a.format !== "personal"),
  "6.2 a run with no context answers is refused",
);
// Value RANGE is bounded by the zod input validator, one layer above
// splitAndValidateRun — and the assertion that matters is that BOTH server
// functions use the same schema, so the preview cannot accept a payload the
// save path would reject (or the reverse, which would strand a candidate who
// had already read a report).
{
  const previewValidator = serverFns.slice(
    serverFns.indexOf("export const previewPublicV31Run"),
    serverFns.indexOf("export const previewPublicV31Run") + 1200,
  );
  const persistValidator = serverFns.slice(
    serverFns.indexOf("export const persistPublicV31Run"),
    serverFns.indexOf("export const persistPublicV31Run") + 1600,
  );
  ok(
    previewValidator.includes("bufferedAnswerSchema") &&
      persistValidator.includes("bufferedAnswerSchema"),
    "6.3 preview and save validate answers with the SAME schema",
  );
  ok(
    previewValidator.includes("careerContextSchema") &&
      persistValidator.includes("careerContextSchema"),
    "6.3b and the same career-context schema — experienceBand and slug both reach the ranking",
  );
  ok(
    /value: z\.number\(\)\.int\(\)\.min\(1\)\.max\(10\)/.test(serverFns),
    "6.3c that shared schema bounds a scale answer to 1-10",
  );
}
refuses(
  [...RUN, { itemId: "NOPE01", format: "scale", value: 5 }],
  "6.4 an unknown item is refused",
);
eq(
  adaptiveItemsForStatus("working_in_security" as never).length,
  ADAPTIVE_ITEMS_PER_SESSION,
  "6.5 the Discovery Path is exactly four items",
);

// =========================================================================
group("7 · The client sends the preview's own completedAt back when saving");
// =========================================================================

// `completedAt` is written into the snapshot. If the save path stamped a
// second `now`, the stored report would differ from the previewed one in
// that field alone — a smaller version of the same defect.
ok(
  /completedAt: previewQuery\.data\?\.completedAt \?\? buffer\.completedAt/.test(publicFlow),
  "7.1 the save call echoes the completedAt the preview built for",
);
const drifted = await buildCanonicalSnapshot(stubSupabase({ approvedCatalog: true }) as never, {
  run: splitAndValidateRun(RUN as never),
  locale: "sv",
  completedAt: "2026-08-29T11:00:00.000Z",
  careerContext: CAREER_CONTEXT,
});
eq(topIds(drifted), topIds(anonymous), "7.2 a different completedAt never moves the ranking");
ok(hash(drifted) !== hash(anonymous), "7.3 but it DOES change the snapshot — hence 7.1");

// =========================================================================
console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`career-discovery-canonical-result-check: all ${checks} checks passed.`);
