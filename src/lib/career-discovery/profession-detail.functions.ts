// Live CIG content for a set of recommended professions.
//
// ── WHY THIS IS SEPARATE FROM THE FROZEN SNAPSHOT ───────────────────────
//
// Owner instruction (Execution Mandate §36): "Frozen recommendations remain
// frozen. Current jobs can remain live/dynamic." The v3.1 snapshot freezes
// WHICH professions were recommended, WHY (aligned dimensions, stage) and
// their cig_profession_slug identity — that never changes once written.
// Everything in THIS file — requirements, education, certifications,
// pathway edges — is read live, every time a report renders, from the
// canonical CIG graph. A profession's education pathway can be corrected or
// extended next year without ever touching a stored report.
//
// ── NO AUTH REQUIRED, DELIBERATELY ───────────────────────────────────────
//
// Anonymous visitors see the full result (Execution Mandate §3), so this
// cannot sit behind requireSupabaseAuth — same pattern as getV31Availability
// in v31-public.functions.ts: a plain createServerFn using the public
// client. cig_* tables already grant `anon` SELECT (verified directly
// against the hosted project); this file only shapes what RLS already
// allows into a typed, classified structure.
//
// ── CLASSIFICATION, NOT INVENTION ─────────────────────────────────────────
//
// The four candidate-facing buckets (Execution Mandate §12) are derived
// mechanically from fields the CIG schema already carries for exactly this
// purpose (see cig_profession_formal_requirements.legal_blocker and
// .criticality, and cig_profession_education_pathways.importance) — nothing
// here decides on its own whether something is "really" required.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase as publicClient } from "@/integrations/supabase/client";

export type RequirementLevel =
  | "formally_required"
  | "employer_requirement"
  | "recommended_development"
  | "optional_differentiating";

export interface ProfessionRequirement {
  readonly titleSv: string;
  readonly titleEn: string;
  readonly level: RequirementLevel;
  readonly jurisdiction: string | null;
}

export interface ProfessionLearningItem {
  readonly titleSv: string;
  readonly titleEn: string;
  readonly level: RequirementLevel;
}

export interface ProfessionPathwayEdge {
  readonly direction: "from" | "to";
  readonly otherSlug: string;
  readonly otherTitleSv: string;
  readonly otherTitleEn: string;
  readonly transitionKind: string;
}

export interface ProfessionDetail {
  readonly slug: string;
  readonly summarySv: string | null;
  readonly summaryEn: string | null;
  readonly overviewSv: string | null;
  readonly overviewEn: string | null;
  readonly ssykCode: string | null;
  readonly requirements: readonly ProfessionRequirement[];
  readonly education: readonly ProfessionLearningItem[];
  readonly certifications: readonly ProfessionLearningItem[];
  readonly pathway: readonly ProfessionPathwayEdge[];
}

function classifyFormal(criticality: string, legalBlocker: boolean): RequirementLevel {
  if (legalBlocker) return "formally_required";
  if (criticality === "mandatory") return "employer_requirement";
  if (criticality === "preferred") return "recommended_development";
  return "optional_differentiating";
}

/** importance>=3 rows are, in practice, the specific training programme a
 *  regulated profession's legal appointment depends on (Väktarutbildning,
 *  Polisprogrammet, Skyddsvaktsutbildning, ...) — required to qualify, even
 *  though the appointment itself is the separate formal-requirement row. */
function classifyEducation(importance: number | null): RequirementLevel {
  if (importance !== null && importance >= 3) return "formally_required";
  if (importance !== null && importance === 2) return "recommended_development";
  return "optional_differentiating";
}

function classifyCertification(criticality: string): RequirementLevel {
  if (criticality === "mandatory") return "employer_requirement";
  if (criticality === "preferred") return "recommended_development";
  return "optional_differentiating";
}

interface CigProfessionRow {
  readonly id: string;
  readonly slug: string;
  readonly title_sv: string;
  readonly title_en: string;
  readonly summary_sv: string | null;
  readonly summary_en: string | null;
  readonly overview_sv: string | null;
  readonly overview_en: string | null;
  readonly ssyk_code: string | null;
}

/**
 * Live CIG content for a set of profession slugs. Pure data assembly over
 * RLS-scoped reads — every field here already exists in the graph; nothing
 * is synthesised.
 */
export const getProfessionDetails = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slugs: z.array(z.string()).min(1).max(20) }).parse(d))
  .handler(async ({ data }): Promise<Record<string, ProfessionDetail>> => {
    const { data: professions } = await publicClient
      .from("cig_professions")
      .select(
        "id, slug, title_sv, title_en, summary_sv, summary_en, overview_sv, overview_en, ssyk_code",
      )
      .in("slug", data.slugs);

    const rows = (professions ?? []) as CigProfessionRow[];
    if (rows.length === 0) return {};

    const idBySlug = new Map(rows.map((r) => [r.slug, r.id] as const));
    const slugById = new Map(rows.map((r) => [r.id, r.slug] as const));
    const ids = rows.map((r) => r.id);

    const [formalRes, eduRes, certRes, transRes] = await Promise.all([
      publicClient
        .from("cig_profession_formal_requirements")
        .select(
          "profession_id, criticality, legal_blocker, jurisdiction, cig_formal_requirements(title_sv, title_en)",
        )
        .in("profession_id", ids),
      publicClient
        .from("cig_profession_education_pathways")
        .select("profession_id, importance, cig_education_pathways(title_sv, title_en)")
        .in("profession_id", ids),
      publicClient
        .from("cig_profession_certification_rel")
        .select("profession_id, criticality, cig_certifications(title_sv, title_en)")
        .in("profession_id", ids),
      publicClient
        .from("cig_career_transitions")
        .select(
          "transition_kind, from_profession_id, to_profession_id, from:cig_professions!cig_career_transitions_from_profession_id_fkey(slug, title_sv, title_en), to:cig_professions!cig_career_transitions_to_profession_id_fkey(slug, title_sv, title_en)",
        )
        .or(`from_profession_id.in.(${ids.join(",")}),to_profession_id.in.(${ids.join(",")})`),
    ]);

    const result: Record<string, ProfessionDetail> = {};
    for (const p of rows) {
      result[p.slug] = {
        slug: p.slug,
        summarySv: p.summary_sv,
        summaryEn: p.summary_en,
        overviewSv: p.overview_sv,
        overviewEn: p.overview_en,
        ssykCode: p.ssyk_code,
        requirements: [],
        education: [],
        certifications: [],
        pathway: [],
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (formalRes.data ?? []) as any[]) {
      const slug = slugById.get(r.profession_id);
      const fr = r.cig_formal_requirements;
      if (!slug || !fr || !result[slug]) continue;
      (result[slug].requirements as ProfessionRequirement[]).push({
        titleSv: fr.title_sv,
        titleEn: fr.title_en,
        level: classifyFormal(r.criticality, r.legal_blocker),
        jurisdiction: r.jurisdiction ?? null,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (eduRes.data ?? []) as any[]) {
      const slug = slugById.get(r.profession_id);
      const e = r.cig_education_pathways;
      if (!slug || !e || !result[slug]) continue;
      (result[slug].education as ProfessionLearningItem[]).push({
        titleSv: e.title_sv,
        titleEn: e.title_en,
        level: classifyEducation(r.importance),
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (certRes.data ?? []) as any[]) {
      const slug = slugById.get(r.profession_id);
      const c = r.cig_certifications;
      if (!slug || !c || !result[slug]) continue;
      (result[slug].certifications as ProfessionLearningItem[]).push({
        titleSv: c.title_sv,
        titleEn: c.title_en,
        level: classifyCertification(r.criticality),
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (transRes.data ?? []) as any[]) {
      const fromSlug: string | undefined = t.from?.slug;
      const toSlug: string | undefined = t.to?.slug;
      if (!fromSlug || !toSlug) continue;
      if (idBySlug.has(fromSlug) && result[fromSlug]) {
        (result[fromSlug].pathway as ProfessionPathwayEdge[]).push({
          direction: "to",
          otherSlug: toSlug,
          otherTitleSv: t.to.title_sv,
          otherTitleEn: t.to.title_en,
          transitionKind: t.transition_kind,
        });
      }
      if (idBySlug.has(toSlug) && result[toSlug]) {
        (result[toSlug].pathway as ProfessionPathwayEdge[]).push({
          direction: "from",
          otherSlug: fromSlug,
          otherTitleSv: t.from.title_sv,
          otherTitleEn: t.from.title_en,
          transitionKind: t.transition_kind,
        });
      }
    }

    return result;
  });

export const REQUIREMENT_LEVEL_LABEL: Readonly<
  Record<RequirementLevel, { sv: string; en: string }>
> = {
  formally_required: { sv: "Formellt krav", en: "Formal requirement" },
  employer_requirement: { sv: "Vanligt arbetsgivarkrav", en: "Common employer requirement" },
  recommended_development: { sv: "Rekommenderad utveckling", en: "Recommended development" },
  optional_differentiating: { sv: "Valfritt / meriterande", en: "Optional / differentiating" },
};
