// Owner review / preview of the Layer 4 profession experience.
//
// Execution Mandate §2: exercise the entire profession-result experience,
// on the SAME production recommendation code path (matchProfessions,
// explainMatch, buildCareerCardData), WITHOUT weakening the production
// gate. The public path (fetchApprovedProfessionCatalog in
// v31-public.functions.ts) still reads ONLY approved_for_ranking = true —
// unchanged. This file is a second, admin-only read path that ignores that
// filter, so an owner can see exactly what a future approved result will
// look like before approving anything.
//
// Every export here is gated by requireSupabaseAuth AND is_platform_admin —
// checked server-side, not trusted from the client. Every export is
// read-only EXCEPT approveOwnerPreviewProfessions (Release Completion
// mandate §13), which is the one deliberate, explicit write path this file
// has — it exists to be called from a real owner click in the admin UI,
// never automatically and never from anywhere else in this codebase.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchCigReachableSlugs } from "./career-context.functions";
import { DIMENSION_IDS, type DimensionId } from "./v31/dimensions";
import {
  matchProfessionsDiagnostics,
  type ProfessionCatalogEntry,
  type ProfessionCareerStage,
  type ProfessionDimensionBand,
  type ProfessionMatchDiagnostics,
} from "./v31/professions";
import type { DimensionResult } from "./v31/scoring";
import type { ReportSnapshot } from "./v31/snapshot";
import { DEFINITION_VERSION } from "./v31/version";
import type { ContextStatus } from "./types";
import type { StoredReportVersions } from "./stored-report.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

class OwnerPreviewError extends Error {
  constructor(readonly code: "not_admin" | "query_failed" | "not_found" | "not_v31") {
    super(code);
    this.name = "OwnerPreviewError";
  }
}

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data } = await ctx.supabase.rpc("is_platform_admin", { _user_id: ctx.userId });
  if (!data) throw new OwnerPreviewError("not_admin");
}

interface ProfessionRow {
  readonly profession_id: string;
  readonly career_area_id: string;
  readonly title_sv: string;
  readonly title_en: string;
  readonly career_stage: string;
  readonly entry_role: boolean;
  readonly regulated: boolean;
  readonly transition_difficulty: number | null;
  readonly review_state: string;
  readonly derived_from_area: boolean;
  readonly approved_for_ranking: boolean;
  readonly inclusion_rationale_sv: string | null;
  readonly inclusion_rationale_en: string | null;
  readonly limitation_note_sv: string | null;
  readonly limitation_note_en: string | null;
  readonly cig_profession_slug: string | null;
}

interface ProfessionProfileRow {
  readonly profession_id: string;
  readonly calibration_version: string;
  readonly dimension_id: string;
  readonly band_low: number;
  readonly band_high: number;
  readonly weight: number;
  readonly centrality: string;
}

export interface OwnerPreviewProfession {
  readonly professionId: string;
  readonly titleSv: string;
  readonly titleEn: string;
  readonly reviewState: string;
  readonly approvedForRanking: boolean;
}

/** Every cd_professions row, regardless of approval state — for the owner
 *  review list (Execution Mandate §16). Admin-only. */
export const listOwnerPreviewProfessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly OwnerPreviewProfession[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const { data, error } = await ctx.supabase
      .from("cd_professions")
      .select("profession_id, title_sv, title_en, review_state, approved_for_ranking")
      .order("profession_id");
    if (error) throw new OwnerPreviewError("query_failed");
    return ((data ?? []) as ProfessionRow[]).map((p) => ({
      professionId: p.profession_id,
      titleSv: p.title_sv,
      titleEn: p.title_en,
      reviewState: p.review_state,
      approvedForRanking: p.approved_for_ranking,
    }));
  });

async function fetchFullCatalog(ctx: Ctx): Promise<ProfessionCatalogEntry[]> {
  const { data: professions, error: pErr } = await ctx.supabase
    .from("cd_professions")
    .select(
      "profession_id, career_area_id, title_sv, title_en, career_stage, entry_role, regulated, transition_difficulty, review_state, derived_from_area, approved_for_ranking, inclusion_rationale_sv, inclusion_rationale_en, limitation_note_sv, limitation_note_en, cig_profession_slug",
    );
  if (pErr) throw new OwnerPreviewError("query_failed");

  const rows = (professions ?? []) as ProfessionRow[];
  if (rows.length === 0) return [];

  // cd_profession_profiles_current, not the raw table: cd_profession_profiles
  // keeps every historical calibration_version batch for audit purposes, and
  // reading it unfiltered would combine two coexisting batches' bands into
  // one profession's scoring input (found during the Release Completion
  // mandate's real-data verification — see the view's own migration
  // comment). The view exposes exactly one row per (profession_id,
  // dimension_id): the most recently authored.
  const { data: profiles, error: profErr } = await ctx.supabase
    .from("cd_profession_profiles_current")
    .select(
      "profession_id, calibration_version, dimension_id, band_low, band_high, weight, centrality",
    )
    .in(
      "profession_id",
      rows.map((p) => p.profession_id),
    );
  if (profErr) throw new OwnerPreviewError("query_failed");

  const bandsByProfession = new Map<string, ProfessionDimensionBand[]>();
  for (const row of (profiles ?? []) as ProfessionProfileRow[]) {
    const list = bandsByProfession.get(row.profession_id) ?? [];
    list.push({
      dimensionId: row.dimension_id as DimensionId,
      centrality: row.centrality as "central" | "supporting" | "neutral",
      bandLow: Number(row.band_low),
      bandHigh: Number(row.band_high),
      weight: Number(row.weight),
    });
    bandsByProfession.set(row.profession_id, list);
  }

  return rows.map((p) => ({
    professionId: p.profession_id,
    careerAreaId: p.career_area_id,
    titleSv: p.title_sv,
    titleEn: p.title_en,
    careerStage: p.career_stage as ProfessionCareerStage,
    entryRole: p.entry_role,
    regulated: p.regulated,
    transitionDifficulty: p.transition_difficulty,
    inclusionRationaleSv: p.inclusion_rationale_sv ?? "",
    inclusionRationaleEn: p.inclusion_rationale_en ?? "",
    limitationNoteSv: p.limitation_note_sv,
    limitationNoteEn: p.limitation_note_en,
    bands: bandsByProfession.get(p.profession_id) ?? [],
    cigProfessionSlug: p.cig_profession_slug,
  }));
}

/**
 * Runs the exact production matching logic against the FULL catalogue
 * (every review state, not just approved_for_ranking) for a set of
 * dimension scores the admin supplies — PLUS the raw internal diagnostics
 * (§14 / Master Completion Mandate item 3): Profession Affinity and
 * Recommendation Priority shown separately, never combined, so an owner can
 * see WHY a recommendation landed where it did. Never touches
 * approved_for_ranking. Admin-only, read-only. See
 * matchProfessionsDiagnostics's own header for why this is a deliberately
 * separate function from the production matchProfessions path — the
 * candidate-facing "no percentages, ever" rule is enforced by that path
 * simply not existing here, not by a runtime check.
 */
export const runOwnerPreviewMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        contextStatus: z.enum([
          "exploring_security",
          "working_in_security",
          "developing_current_role",
          "changing_career_area",
          "security_leader",
        ]),
        dimensionScores: z.record(z.enum(DIMENSION_IDS), z.number().min(0).max(1)),
        // Master Completion Mandate item 2/3: lets the owner preview how a
        // self-reported current profession changes Recommendation Priority
        // for the SAME Career DNA — the exact "why did priority change"
        // comparison §14 asks for.
        currentProfessionCigSlug: z.string().nullable().optional(),
        // Mandate item 6: lets the owner preview see contextCorroborated
        // flip when Discovery Path tags are supplied.
        discoveryTags: z.array(z.string()).optional(),
        // Owner Security Manager scenario fix: lets the owner preview
        // resolveStageBaseline's real effect — a known senior current
        // profession + real experience must not stay pinned to C1's coarse
        // baseline. See professions.ts's resolveStageBaseline.
        experienceBand: z.enum(["under_1y", "1_3y", "4_7y", "8_plus_y"]).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ProfessionMatchDiagnostics> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const catalog = await fetchFullCatalog(ctx);

    const dimensions = Object.fromEntries(
      DIMENSION_IDS.map((id) => [
        id,
        {
          dimension: id,
          score: data.dimensionScores[id] ?? null,
          evidenceWeight: data.dimensionScores[id] !== undefined ? 1.5 : 0,
          dominance: data.dimensionScores[id] !== undefined ? 0.3 : null,
          coverage: data.dimensionScores[id] !== undefined ? 1 : 0,
          confidence:
            data.dimensionScores[id] !== undefined ? ("high" as const) : ("none" as const),
          sources: data.dimensionScores[id] !== undefined ? ["owner-preview"] : [],
          tertiaryOnly: false,
        },
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;

    // Item 7: real, published CIG transition edges — same helper the
    // production path uses, never a synthetic/test-only graph.
    const cigReachableSlugs = await fetchCigReachableSlugs(
      ctx.supabase,
      data.currentProfessionCigSlug ?? null,
    );

    return matchProfessionsDiagnostics(
      { scoringVersion: "owner-preview", dimensions, answeredItems: [], complete: true },
      catalog,
      data.contextStatus as ContextStatus,
      data.currentProfessionCigSlug ?? null,
      data.discoveryTags ?? [],
      cigReachableSlugs,
      data.experienceBand ?? null,
    );
  });

export interface OwnerPreviewFromReportResult {
  /** The candidate's own frozen report, with `professions` REPLACED by a
   *  fresh run against the full, unfiltered catalogue — everything else
   *  (Career DNA, patterns, career areas, currentProfession) is the exact
   *  frozen content the candidate actually saw. Feed this straight into
   *  V31ReportView (mode="authenticated") to render the real production
   *  UI — ProfessionRecommendations, PossiblePathway, MoveForwardSection,
   *  CareerCardCreator — exactly as an approved candidate would see it. */
  readonly snapshot: ReportSnapshot;
  readonly diagnostics: ProfessionMatchDiagnostics["diagnostics"];
  readonly generatedAt: string;
  readonly sourceSnapshotId: string;
  readonly sourceSessionId: string | null;
  readonly versions: StoredReportVersions;
}

/**
 * Final Career Discovery Release Completion mandate, section 5: lets the
 * owner review the REAL final candidate experience for a REAL completed
 * assessment — not a synthetic persona — against the FULL profession
 * catalogue, while approved_for_ranking stays false for everyone else.
 *
 * Deliberately scoped to the caller's OWN saved reports: the read goes
 * through the ordinary RLS-scoped client (same access pattern as
 * getStoredDiscoveryReport), so this adds no admin-bypass policy and no
 * broader access to other candidates' private answers. The owner's own
 * real completed assessment (e.g. the Sakerhetschef 8+ years acceptance
 * case) is reachable this way; reviewing another real candidate's data
 * would be a separate, explicit privacy decision this function does not
 * make on its own.
 *
 * Read-only. Never writes approved_for_ranking, review_state, or the
 * source report itself.
 */
export const runOwnerPreviewMatchFromReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ snapshotId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<OwnerPreviewFromReportResult> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    // RLS-scoped: another user's snapshot id simply returns no row, exactly
    // like getStoredDiscoveryReport (stored-report.functions.ts) — this
    // function reuses that same ownership boundary, not a wider one.
    const { data: row, error } = await ctx.supabase
      .from("cd_report_snapshots")
      .select(
        "id, session_id, generated_at, definition_version, content_version, scoring_version, taxonomy_version, dna_scores",
      )
      .eq("id", data.snapshotId)
      .maybeSingle();
    if (error) throw new OwnerPreviewError("query_failed");
    if (!row) throw new OwnerPreviewError("not_found");

    const stored = (row.dna_scores as { report?: unknown } | null)?.report ?? null;
    if (row.definition_version !== DEFINITION_VERSION || !stored) {
      throw new OwnerPreviewError("not_v31");
    }
    const snapshot = stored as ReportSnapshot;

    // ReportSnapshot does not carry contextStatus/experienceBand/the raw
    // current-profession slug — only the resolved currentProfession title
    // (see snapshot.ts's ReportSnapshot doc comment). Those three live on
    // the session row instead, read here the same RLS-scoped way.
    const { data: sessionRow, error: sessionError } = await ctx.supabase
      .from("cd_sessions")
      .select("context_status, current_profession_slug, current_experience_band")
      .eq("id", row.session_id)
      .maybeSingle();
    if (sessionError) throw new OwnerPreviewError("query_failed");
    const contextStatus = (sessionRow?.context_status as ContextStatus | null) ?? null;
    const currentProfessionCigSlug =
      (sessionRow?.current_profession_slug as string | null) ??
      snapshot.currentProfession?.cigSlug ??
      null;
    const experienceBand =
      (sessionRow?.current_experience_band as "under_1y" | "1_3y" | "4_7y" | "8_plus_y" | null) ??
      null;

    const catalog = await fetchFullCatalog(ctx);
    const cigReachableSlugs = await fetchCigReachableSlugs(ctx.supabase, currentProfessionCigSlug);

    // Unlike runOwnerPreviewMatch (which only ever has a golden persona's
    // bare scores to work with, hence its flat evidenceWeight/dominance
    // placeholders), a real ReportSnapshot's StoredDimension already carries
    // the ACTUAL evidenceWeight/dominance/coverage/sources/tertiaryOnly the
    // candidate's run produced (snapshot.ts's storedDimensions is a
    // byte-for-byte superset of DimensionScore). Substituting flat
    // placeholders here would silently discard real evidence strength and
    // dominance — verified live to flatten fit scores toward a uniform ~99.5
    // "strong" across every profession, i.e. exactly the overmatching defect
    // this scoring version was calibrated to avoid. Carry the real values
    // through instead.
    const dimensions = Object.fromEntries(
      DIMENSION_IDS.map((id) => {
        const stored = snapshot.outputA.dimensions.find((d) => d.id === id);
        return [
          id,
          {
            dimension: id,
            score: stored?.score ?? null,
            evidenceWeight: stored?.evidenceWeight ?? 0,
            dominance: stored?.dominance ?? null,
            coverage: stored?.coverage ?? 0,
            confidence: stored?.confidence ?? "none",
            sources: stored?.sources ?? [],
            tertiaryOnly: stored?.tertiaryOnly ?? false,
          },
        ];
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any as DimensionResult["dimensions"];

    const diagnostics = matchProfessionsDiagnostics(
      { scoringVersion: "owner-preview", dimensions, answeredItems: [], complete: true },
      catalog,
      contextStatus,
      currentProfessionCigSlug,
      // Discovery Path tags are not frozen onto ReportSnapshot today, so a
      // real preview cannot recover them — contextCorroborated stays false
      // for every match here, which only ever narrows Recommendation
      // Priority's bounded bonus, never Profession Affinity. Documented,
      // not silently guessed at.
      [],
      cigReachableSlugs,
      experienceBand,
    );

    const previewSnapshot: ReportSnapshot = {
      ...snapshot,
      professions: diagnostics.result.available
        ? {
            available: true,
            matches: diagnostics.result.matches,
            strongestDirections: diagnostics.result.strongestDirections,
            alsoWorthExploring: diagnostics.result.alsoWorthExploring,
            longerTermPossibilities: diagnostics.result.longerTermPossibilities,
            careerPivots: diagnostics.result.careerPivots,
            currentProfessionMatch: diagnostics.result.currentProfessionMatch,
          }
        : { available: false, reason: "no_approved_professions", matches: [] },
    };

    return {
      snapshot: previewSnapshot,
      diagnostics: diagnostics.diagnostics,
      generatedAt: row.generated_at as string,
      sourceSnapshotId: row.id as string,
      sourceSessionId: (row.session_id as string | null) ?? null,
      versions: {
        definition: (row.definition_version as string) ?? "—",
        content: (row.content_version as string) ?? "—",
        scoring: (row.scoring_version as string) ?? "—",
        taxonomy: (row.taxonomy_version as string) ?? "—",
      },
    };
  });

export interface ApproveProfessionsResult {
  readonly updated: readonly string[];
}

/**
 * Release Completion mandate §13: "Do NOT automatically set
 * approved_for_ranking=true. Provide the owner with a clear review state
 * for all 14 professions. The owner should be able to decide APPROVE ALL
 * or APPROVE SELECTED PROFESSIONS only after reviewing the final rendered
 * results. Any activation must require explicit owner instruction."
 *
 * This is that instruction's execution path — and only that. It writes
 * review_state='approved_for_ranking' + approved_for_ranking=true for the
 * given profession ids, nothing else. The existing
 * cd_professions_ranking_approval_trg trigger (cd_guard_profession_ranking_
 * approval) still independently re-checks derived_from_area and full
 * 17-dimension calibration server-side before allowing the flip — this
 * function adds no bypass of that guard, it only supplies the two columns
 * the guard reads.
 *
 * Building this function is part of the mandate ("Build an owner
 * approval-workflow UI... with working Approve All / Approve Selected
 * actions"). Calling it is not — per the mandate's own closing instruction,
 * nothing in this codebase invokes it until the owner explicitly does so
 * from the admin UI.
 */
export const approveOwnerPreviewProfessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ professionIds: z.array(z.string()).min(1) }).parse(d))
  .handler(async ({ data, context }): Promise<ApproveProfessionsResult> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: rows, error } = await ctx.supabase
      .from("cd_professions")
      .update({ review_state: "approved_for_ranking", approved_for_ranking: true })
      .in("profession_id", data.professionIds)
      .select("profession_id");
    if (error) throw new OwnerPreviewError("query_failed");

    return {
      updated: ((rows ?? []) as Array<{ profession_id: string }>).map((r) => r.profession_id),
    };
  });
