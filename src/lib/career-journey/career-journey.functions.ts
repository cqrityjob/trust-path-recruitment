// Career Journey — the one place the four products are read together.
//
// ── WHY THE COMPOSITION IS HERE AND NOT IN CAREER DISCOVERY ────────────
//
// Because Career Discovery may not see the Passport, and must not. That is
// not a style preference: scripts/passport-separation-check.ts fails the
// build if anything under src/lib/career-discovery or
// src/components/career-discovery so much as imports a Passport module, and
// it does that because a boundary held by convention had already failed
// once elsewhere in this codebase.
//
// So this module is the seam. It is the only file that reads the canonical
// professional profile, the Layer 4 catalogue, the Career Intelligence
// Graph and the Passport's evidence counts in one breath, and it hands the
// PURE engine four plain values. The engine has no client, no auth and no
// tables; the report component receives a finished CareerJourney and has no
// idea any of these systems exist.
//
// ── WHAT THIS READS, AND WITH WHOSE AUTHORITY ─────────────────────────
//
// Everything through the caller's own RLS-scoped client. No service role,
// no privileged path, nothing about anybody else. `security_career_profiles`
// is owner-scoped by policy; the Passport read is the holder's own; the
// catalogue and the graph are the same rows any signed-in candidate may
// already read.
//
// `professionIds` comes from the report the caller is looking at. They are
// public catalogue identifiers, they are capped, and nothing in the
// response is derived from anything but those rows and the caller's own
// profile — so a caller who passed identifiers from somebody else's report
// would learn precisely nothing they could not read directly.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readPassportEvidenceProvenance } from "@/lib/security-passport/journey-evidence.functions";
import { computeCareerJourney } from "./readiness";
import type {
  CareerJourney,
  JourneyCareerStage,
  JourneyProfileInput,
  JourneyTargetInput,
} from "./types";
import type { CurrentStatus, YearsOfExperience } from "@/lib/security-career-profile/types";

/** Three professions are recommended; a handful more may be shown as
 *  longer-term possibilities. Twelve is generous and bounded. */
const MAX_PROFESSIONS = 12;

const inputSchema = z.object({
  professionIds: z.array(z.string().min(1)).max(MAX_PROFESSIONS).default([]),
});

type ProfessionRow = {
  profession_id: string;
  career_area_id: string;
  title_sv: string;
  title_en: string;
  career_stage: string;
  entry_role: boolean;
  regulated: boolean;
  transition_difficulty: number | null;
  cig_profession_slug: string | null;
};

const CATALOG_COLUMNS =
  "profession_id, career_area_id, title_sv, title_en, career_stage, entry_role, regulated, transition_difficulty, cig_profession_slug";

function isCareerStage(v: string): v is JourneyCareerStage {
  return v === "entry" || v === "developing" || v === "senior";
}

/**
 * The candidate's OWN profession, looked up in the same Layer 4 catalogue
 * the targets come from.
 *
 * Returns null rather than a guess when the slug is not in the catalogue.
 * That is the whole point of the nullable `currentProfessionStage`: an
 * uncatalogued job places the person nowhere, so the journey falls back to
 * what their status alone can support instead of inventing a career level
 * for a role nobody has authored.
 */
async function resolveCurrentProfession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  slug: string | null,
): Promise<{
  stage: JourneyCareerStage | null;
  areaId: string | null;
  titleSv: string | null;
  titleEn: string | null;
}> {
  const empty = { stage: null, areaId: null, titleSv: null, titleEn: null };
  if (!slug) return empty;

  const { data, error } = await supabase
    .from("cd_professions")
    .select("career_area_id, title_sv, title_en, career_stage")
    .eq("cig_profession_slug", slug)
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    // Still worth a readable title: the profession may exist in the CIG
    // catalogue without a Layer 4 row. A name with no career level is
    // honest; a career level with no row would not be.
    const cig = await supabase
      .from("cig_professions")
      .select("title_sv, title_en")
      .eq("slug", slug)
      .maybeSingle();
    const row = cig.data as { title_sv: string; title_en: string } | null;
    return row ? { ...empty, titleSv: row.title_sv, titleEn: row.title_en } : empty;
  }

  const row = data as {
    career_area_id: string;
    title_sv: string;
    title_en: string;
    career_stage: string;
  };
  return {
    stage: isCareerStage(row.career_stage) ? row.career_stage : null,
    areaId: row.career_area_id,
    titleSv: row.title_sv,
    titleEn: row.title_en,
  };
}

/** Slugs reachable from the candidate's current profession by a PUBLISHED
 *  transition edge. A duplicate of career-discovery's own
 *  fetchCigReachableSlugs in behaviour and deliberately not an import of
 *  it: that helper is an internal detail of the assessment's persistence
 *  path, and the Journey reading it would tie a live, re-computed
 *  interpretation to a module whose job is to freeze one. */
async function fetchReachableSlugs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  slug: string | null,
): Promise<ReadonlySet<string>> {
  if (!slug) return new Set();
  const { data: current } = await supabase
    .from("cig_professions")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!current?.id) return new Set();

  const { data } = await supabase
    .from("cig_career_transitions")
    .select(
      "to_profession_id, content_status, cig_professions!cig_career_transitions_to_profession_id_fkey(slug)",
    )
    .eq("from_profession_id", current.id)
    .eq("content_status", "published");

  const out = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    const s = row.cig_professions?.slug;
    if (typeof s === "string") out.add(s);
  }
  return out;
}

export const getMyCareerJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<CareerJourney> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase } = context as { supabase: any; userId: string };
    const { userId } = context as { userId: string };

    const [{ data: profileRow, error: profileErr }, { data: catalogRows }] = await Promise.all([
      supabase
        .from("security_career_profiles")
        .select(
          "current_status, current_profession_slug, current_profession_other, years_of_experience",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      data.professionIds.length > 0
        ? supabase
            .from("cd_professions")
            .select(CATALOG_COLUMNS)
            .in("profession_id", data.professionIds)
        : Promise.resolve({ data: [] as ProfessionRow[] }),
    ]);
    if (profileErr) throw new Error(profileErr.message);

    const row = profileRow as {
      current_status: string | null;
      current_profession_slug: string | null;
      current_profession_other: string | null;
      years_of_experience: string | null;
    } | null;

    // Catalogue rows come back in whatever order Postgres produced them.
    // The report's ranking is the frozen one, so the requested order is
    // restored here — a journey that silently re-ordered the Top 3 would
    // contradict the report it is rendered inside.
    const byId = new Map<string, ProfessionRow>();
    for (const r of (catalogRows ?? []) as ProfessionRow[]) byId.set(r.profession_id, r);
    const targets: JourneyTargetInput[] = data.professionIds
      .map((id) => byId.get(id))
      .filter((r): r is ProfessionRow => r !== undefined && isCareerStage(r.career_stage))
      .map((r) => ({
        professionId: r.profession_id,
        cigProfessionSlug: r.cig_profession_slug,
        careerAreaId: r.career_area_id,
        titleSv: r.title_sv,
        titleEn: r.title_en,
        careerStage: r.career_stage as JourneyCareerStage,
        entryRole: r.entry_role,
        regulated: r.regulated,
        transitionDifficulty: r.transition_difficulty,
      }));

    if (!row) {
      return computeCareerJourney({
        profile: null,
        targets,
        reachableCigSlugs: new Set(),
        evidence: null,
      });
    }

    const slug = row.current_profession_slug;
    const [current, reachable, evidence] = await Promise.all([
      resolveCurrentProfession(supabase, slug),
      fetchReachableSlugs(supabase, slug),
      readPassportEvidenceProvenance(supabase, userId),
    ]);

    const profile: JourneyProfileInput = {
      currentStatus: row.current_status as CurrentStatus | null,
      currentProfessionSlug: slug,
      currentProfessionTitleSv: current.titleSv,
      currentProfessionTitleEn: current.titleEn,
      currentProfessionOther: row.current_profession_other,
      yearsOfExperience: row.years_of_experience as YearsOfExperience | null,
      currentProfessionStage: current.stage,
      currentProfessionAreaId: current.areaId,
    };

    return computeCareerJourney({ profile, targets, reachableCigSlugs: reachable, evidence });
  });
