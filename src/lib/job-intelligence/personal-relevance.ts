// Phase E — client-side helpers that turn a saved
// `CareerProfileForJobsV1` into per-job relevance guidance for the UI.
//
// Pure functions. No network, no AI, no scoring changes. The engine's
// per-slug and per-family scores are the sole numeric source; this
// module maps those signals into a natural-language band and a small
// bundle of dimension IDs to render.
//
// Never expose raw score numbers or CIG objects from callers of this
// module — the UI only presents bands, labels and prose derived here.

import { LEGACY_TO_CIG_SLUG } from "@/lib/career-intelligence-engine/slug-map";
import type {
  CareerProfileForJobsV1,
  SlugScoreForJobs,
  FamilyScoreForJobs,
} from "@/lib/career-intelligence-engine/profile-for-jobs";
import type { PublicJobCard } from "@/lib/job-intelligence/public-queries";
import { dimensions } from "@/lib/career-assessment/dimensions";
import type { DimensionId } from "@/lib/career-assessment/types";

// Reverse map — CIG published slug → legacy scoring slug. Built once at
// module load, deterministic. Legacy slugs that share the same CIG proxy
// resolve to the first entry; the engine's scoring for either legacy
// slug is close enough for relevance framing and no raw score is
// exposed.
const CIG_TO_LEGACY_SLUG: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [legacy, cig] of Object.entries(LEGACY_TO_CIG_SLUG)) {
    if (!(cig in out)) out[cig] = legacy;
  }
  return out;
})();

/**
 * Relevance band. Names are deliberately non-recruitment: no "match
 * score", no "qualified", no "approved". A `none` band means the badge
 * is not shown; the panel falls back to a generic Career-Center hint.
 */
export type RelevanceBand = "strong" | "promising" | "exploratory" | "none";

export interface RelevanceForJob {
  band: RelevanceBand;
  /** How the band was derived — profession-level or family-level. */
  basis: "profession" | "family" | "none";
  /** Confidence signal from the engine (never a numeric score). */
  confidence: "stronger" | "moderate" | "limited" | "unknown";
  /** Dimension IDs the user's answers currently support strongly. */
  strongDims: DimensionId[];
  /** Dimension IDs the user could develop to move closer to this role. */
  developDims: DimensionId[];
  /** True when profession-level guidance is available. */
  hasProfessionMatch: boolean;
}

function bandForCurrentFit(
  currentFit: number,
  confidence: "stronger" | "moderate" | "limited",
): RelevanceBand {
  if (confidence === "limited") return "none";
  if (currentFit >= 70) return "strong";
  if (currentFit >= 55) return "promising";
  if (currentFit >= 40) return "exploratory";
  return "none";
}

function bandForFamilyFit(currentFit: number): RelevanceBand {
  // Family-level bands are more conservative than profession-level so a
  // vague family match never rides on top of the "Relevant to your
  // profile" badge.
  if (currentFit >= 65) return "promising";
  if (currentFit >= 50) return "exploratory";
  return "none";
}

/**
 * Resolve the legacy scoring slug for a job when possible.
 *
 * `job.profession_slug` follows the CIG-published slug convention. The
 * assessment engine scores against legacy TS slugs, so we look up the
 * reverse map. If the job already uses a legacy slug directly (e.g. in
 * dev seeds) it will still resolve via the raw slug branch.
 */
export function legacySlugForJob(
  job: Pick<PublicJobCard, "profession_slug">,
  profile: CareerProfileForJobsV1,
): string | null {
  const raw = job.profession_slug;
  if (!raw) return null;
  if (profile.slugScores[raw]) return raw;
  const mapped = CIG_TO_LEGACY_SLUG[raw];
  if (mapped && profile.slugScores[mapped]) return mapped;
  return null;
}

/** Compute the relevance band for a single job. Pure. */
export function relevanceForJob(
  job: Pick<PublicJobCard, "profession_slug" | "family_id">,
  profile: CareerProfileForJobsV1,
): RelevanceForJob {
  const legacySlug = legacySlugForJob(job, profile);
  if (legacySlug) {
    const s: SlugScoreForJobs = profile.slugScores[legacySlug];
    return {
      band: bandForCurrentFit(s.currentFit, s.confidence),
      basis: "profession",
      confidence: s.confidence,
      strongDims: s.strongDims as DimensionId[],
      developDims: s.developDims as DimensionId[],
      hasProfessionMatch: true,
    };
  }
  if (job.family_id) {
    const f: FamilyScoreForJobs | undefined = profile.familyScores[job.family_id];
    if (f) {
      return {
        band: bandForFamilyFit(f.currentFit),
        basis: "family",
        confidence: "unknown",
        strongDims: [],
        developDims: [],
        hasProfessionMatch: false,
      };
    }
  }
  return {
    band: "none",
    basis: "none",
    confidence: "unknown",
    strongDims: [],
    developDims: [],
    hasProfessionMatch: false,
  };
}

/** Bilingual public labels for the band chip / heading. Career-coach voice. */
export function relevanceBandLabel(band: RelevanceBand): { sv: string; en: string } {
  switch (band) {
    case "strong":
      return { sv: "Nära din profil", en: "Close to your profile" };
    case "promising":
      return { sv: "Relevant för din profil", en: "Relevant to your profile" };
    case "exploratory":
      return { sv: "Värd att utforska", en: "Worth exploring" };
    case "none":
    default:
      return { sv: "", en: "" };
  }
}

/** Lookup a dimension label by ID. Falls back to the raw ID if unknown. */
export function dimensionLabel(
  id: DimensionId,
  lang: "sv" | "en",
): string {
  const dim = dimensions.find((d) => d.id === id);
  if (!dim) return String(id);
  return dim.name[lang];
}