// The career picture, read off the frozen report — never recomputed.
//
// ── WHAT THIS IS AND IS NOT ────────────────────────────────────────────
//
// The personal career home shows the candidate's own career analysis
// result: the occupation the report actually recommended, up to two
// alternatives, and the themes the report named as their strengths. Every
// one of those values is READ from the stored snapshot. Nothing here
// scores, ranks, re-orders, re-weights or re-interprets anything, and
// deleting this file would change no result — it would only mean the home
// had nothing to show.
//
// That matters because the snapshot is frozen on purpose (§36): reopening
// a two-year-old report must show exactly what it said when it was
// generated. A dashboard that recomputed "your top profession" from live
// catalogue data would quietly disagree with the report it links to.
//
// ── TWO CONTRACTS, AND ONLY ONE OF THEM NAMES OCCUPATIONS ──────────────
//
// v3.1 stores `professions.ranked` — the top-3 occupational recommendation,
// rank 1 first, each with its own confidence. v3.0 stores career AREAS and
// axis strengths and names no occupation at all.
//
// So v3.0 returns NO recommended occupation, and the surface says so rather
// than promoting an area into a job title. "Utredning och analys" is a
// field of work; "Säkerhetssamordnare" is a job. Printing the first where
// the second belongs would be this product inventing a recommendation the
// instrument never made.
//
// ── CONFIDENCE TRAVELS WITH THE NAME ───────────────────────────────────
//
// `indicative` means "closest in the catalogue", not "a good fit", and the
// copy that renders it has to be able to say so. The confidence is carried
// out of this module for exactly that reason and is never flattened away.

import type { StoredReportResult } from "@/lib/career-discovery/stored-report.functions";
import type { RecommendationConfidence } from "@/lib/career-discovery/v31/professions";

export const CAREER_DIRECTION_VERSION = "career-direction-v1" as const;

/** How many alternatives the home may show beside the top recommendation. */
export const MAX_ALTERNATIVE_ROLES = 2;
/** How many strength themes the home may show. */
export const MAX_STRENGTH_THEMES = 3;

/** One occupation the report named, in the language it was frozen in. */
export interface RoleSummary {
  /** 1, 2, 3 — the report's own presentation order, carried rather than
   *  implied by array position so nothing can re-sort it into a different
   *  claim. */
  readonly rank: number;
  readonly titleSv: string;
  readonly titleEn: string;
  /** The catalogue slug, when the match carries one, so a surface can link
   *  to the profession guide instead of to a search. */
  readonly cigSlug: string | null;
  readonly confidence: RecommendationConfidence;
}

/** A theme the report named. Pattern names for v3.1, axis names for v3.0. */
export interface StrengthTheme {
  readonly id: string;
  readonly labelSv: string;
  readonly labelEn: string;
}

export type CareerDirection =
  /** The report read has not answered yet. */
  | { readonly state: "loading" }
  /** There is no completed report. */
  | { readonly state: "none" }
  /** A report exists and this build cannot read it. Its own state: the
   *  candidate has a result, and saying "not taken yet" would be false. */
  | { readonly state: "unreadable"; readonly completedAt: string | null }
  /** The read failed. Distinct from `none` for the same reason. */
  | { readonly state: "unavailable" }
  /** The newest result is a v2.1 report. That instrument named career AREAS
   *  and no occupation, and its report is rendered by its own route — so the
   *  home links to it rather than restating a conclusion it cannot read. A
   *  candidate whose only assessment is legacy must never be told they have
   *  not taken one. */
  | {
      readonly state: "legacy";
      readonly completedAt: string | null;
      readonly reportHref: string;
    }
  | {
      readonly state: "ready";
      readonly completedAt: string | null;
      readonly reportHref: string;
      /** Rank 1, when the report names occupations at all. Null for a v3.0
       *  report, which names career areas and no occupation. */
      readonly topRole: RoleSummary | null;
      /** Ranks 2 and 3. Empty when the report names none. */
      readonly alternativeRoles: readonly RoleSummary[];
      readonly strengthThemes: readonly StrengthTheme[];
      /** The locale the snapshot was frozen in. Carried because the stored
       *  strings are in THAT language whatever the reader has selected, and
       *  a surface that pretends otherwise is mislabelling its own content. */
      readonly frozenLocale: "sv" | "en" | null;
    };

/** A bilingual value as v3.0 stores it. */
type Bi = { readonly sv: string; readonly en: string };

function isBi(v: unknown): v is Bi {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Bi).sv === "string" &&
    typeof (v as Bi).en === "string"
  );
}

/**
 * Derive the home's career picture from ONE stored report result.
 *
 * Pure, total and defensive: the snapshot is stored JSON and an old one may
 * legitimately lack a field that was added later (§36). Every access below
 * therefore checks rather than asserts, and a missing field yields "the
 * report did not say" — never a guess and never a throw that would take
 * the home down with it.
 */
export function deriveCareerDirection(
  result: StoredReportResult | undefined,
  options: { readonly isError?: boolean } = {},
): CareerDirection {
  if (options.isError) return { state: "unavailable" };
  if (!result) return { state: "loading" };
  if (result.status === "not_found") return { state: "none" };
  if (result.status === "unreadable") {
    return { state: "unreadable", completedAt: result.generatedAt ?? null };
  }

  const reportHref = `/security-career-assessment/report/${result.snapshotId}`;

  if (result.status === "v3.0") {
    // v3.0 names career AREAS, not occupations. The strengths it does name
    // are axis-level and bilingual, so they survive a language switch.
    const strengths = Array.isArray(result.report?.strengths) ? result.report!.strengths : [];
    return {
      state: "ready",
      completedAt: result.generatedAt ?? null,
      reportHref,
      topRole: null,
      alternativeRoles: [],
      strengthThemes: strengths
        .slice(0, MAX_STRENGTH_THEMES)
        .filter((s) => isBi(s?.axisName))
        .map((s) => ({
          id: String(s.axis),
          labelSv: (s.axisName as Bi).sv,
          labelEn: (s.axisName as Bi).en,
        })),
      // v3.0's own content is bilingual, so nothing is frozen to one side.
      frozenLocale: null,
    };
  }

  // v3.1.
  const snapshot = result.snapshot;
  const ranked = Array.isArray(snapshot?.professions?.ranked) ? snapshot.professions.ranked : [];
  const roles: RoleSummary[] = ranked
    .filter((r) => r && r.match && typeof r.match.titleSv === "string")
    .map((r) => ({
      rank: typeof r.rank === "number" ? r.rank : 0,
      titleSv: r.match.titleSv,
      titleEn: r.match.titleEn,
      cigSlug: r.match.cigProfessionSlug ?? null,
      confidence: r.confidence,
    }))
    .sort((a, b) => a.rank - b.rank);

  // The leading pattern and its supporting patterns, in the report's own
  // words. These are the candidate-facing NAMES the report gives to how
  // this person works — the closest thing the instrument has to a
  // "strength theme", and already frozen, so the home cannot say something
  // the report does not.
  const themes: StrengthTheme[] = [];
  const leading = snapshot?.outputB?.leading;
  if (leading?.name) {
    themes.push({ id: String(leading.patternId), labelSv: leading.name, labelEn: leading.name });
  }
  for (const s of snapshot?.outputB?.supporting ?? []) {
    if (themes.length >= MAX_STRENGTH_THEMES) break;
    if (!s?.name) continue;
    themes.push({ id: String(s.patternId), labelSv: s.name, labelEn: s.name });
  }

  return {
    state: "ready",
    completedAt: snapshot?.completedAt ?? result.generatedAt ?? null,
    reportHref,
    topRole: roles[0] ?? null,
    alternativeRoles: roles.slice(1, 1 + MAX_ALTERNATIVE_ROLES),
    strengthThemes: themes,
    frozenLocale: (snapshot?.locale as "sv" | "en" | undefined) ?? null,
  };
}
