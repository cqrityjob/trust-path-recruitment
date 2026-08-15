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
// checked server-side, not trusted from the client — and none of it writes
// approved_for_ranking, review_state, or anything else. Read-only.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DIMENSION_IDS, type DimensionId } from "./v31/dimensions";
import {
  matchProfessions,
  type ProfessionCatalogEntry,
  type ProfessionCareerStage,
  type ProfessionDimensionBand,
  type ProfessionMatchResult,
} from "./v31/professions";
import type { ContextStatus } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

class OwnerPreviewError extends Error {
  constructor(readonly code: "not_admin" | "query_failed") {
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

  const { data: profiles, error: profErr } = await ctx.supabase
    .from("cd_profession_profiles")
    .select("profession_id, calibration_version, dimension_id, band_low, band_high, weight")
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
 * Runs the exact production matchProfessions against the FULL catalogue
 * (every review state, not just approved_for_ranking) for a set of
 * dimension scores the admin supplies. Never touches approved_for_ranking.
 * Admin-only, read-only.
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
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ProfessionMatchResult> => {
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

    return matchProfessions(
      { scoringVersion: "owner-preview", dimensions, answeredItems: [], complete: true },
      catalog,
      data.contextStatus as ContextStatus,
    );
  });
