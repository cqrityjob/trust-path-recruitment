// Server function: compute Career Intelligence Engine v1 result with
// CIG-backed enrichment. Uses the anonymous publishable-key server client
// with an explicit content_status='published' filter for every CIG read.
//
// Signal-source-of-truth for scoring is the TS profession profiles
// (Phase D scope). CIG provides:
//   - published-slug set (matching-set filter)
//   - per-match: formal requirements (joined to cig_formal_requirements),
//     disclaimer, transitions, education pathways, certifications, sources.
//
// If a matched legacy slug has no CIG counterpart, enrichment for that
// match is empty and the envelope reports dataStatus='cig_enrichment_missing'.

import { createServerFn } from "@tanstack/react-start";
import { serverPublicClient } from "@/integrations/supabase/public-server";
import type { AnswerMap } from "@/lib/career-assessment/types";
import type { ScoringQuestionSet } from "@/lib/career-assessment/matching-engine";
import { assembleQuestionSet } from "@/lib/question-library/query";
import type { AssessmentProfileId } from "@/lib/question-library/types";
import { buildTargetVectorsFromLegacy, computeEngineResultV1, toCigSlug } from "./index";
import type { EnrichmentBundle, EnrichmentSource } from "./types";

type EnrichmentMap = Record<string, EnrichmentBundle>;

function bi(sv: string | null | undefined, en: string | null | undefined) {
  return { sv: sv ?? en ?? "", en: en ?? sv ?? "" };
}

function optStr(v: string | null | undefined): string | undefined {
  return v == null ? undefined : v;
}

export async function loadEnrichmentForSlugs(legacySlugs: string[]): Promise<EnrichmentMap> {
  const supabase = serverPublicClient();
  const result: EnrichmentMap = {};

  const cigSlugs = legacySlugs
    .map((s) => ({ legacy: s, cig: toCigSlug(s) }))
    .filter((x): x is { legacy: string; cig: string } => !!x.cig);
  if (cigSlugs.length === 0) return result;

  const { data: professions } = await supabase
    .from("cig_professions")
    .select("id, slug, title_sv, title_en, disclaimer_sv, disclaimer_en, is_regulated")
    .eq("content_status", "published")
    .in(
      "slug",
      cigSlugs.map((x) => x.cig),
    );
  if (!professions) return result;

  const bySlug = new Map(professions.map((p) => [p.slug, p]));
  const ids = professions.map((p) => p.id);
  if (ids.length === 0) return result;

  // Formal requirements need a join to cig_formal_requirements for labels.
  const formalPromise = supabase
    .from("cig_profession_formal_requirements")
    .select(
      "profession_id, criticality, legal_blocker, country, jurisdiction, requirement:cig_formal_requirements(title_sv, title_en, authority_sv, authority_en)",
    )
    .eq("content_status", "published")
    .in("profession_id", ids);

  const transitionsPromise = supabase
    .from("cig_career_transitions")
    .select("from_profession_id, to_profession_id, transition_kind, rationale_sv, rationale_en")
    .eq("content_status", "published")
    .or(`from_profession_id.in.(${ids.join(",")}),to_profession_id.in.(${ids.join(",")})`);

  const eduPromise = supabase
    .from("cig_profession_education_pathways")
    .select(
      "profession_id, pathway:cig_education_pathways(slug, title_sv, title_en, typical_duration_months)",
    )
    .eq("content_status", "published")
    .in("profession_id", ids);

  const certsPromise = supabase
    .from("cig_profession_certification_rel")
    .select(
      "profession_id, certification:cig_certifications(slug, title_sv, title_en, issuer_sv, issuer_en)",
    )
    .eq("content_status", "published")
    .in("profession_id", ids);

  const sourcesPromise = supabase
    .from("cig_profession_source_references")
    .select("profession_id, source:cig_source_references(title, url, source_type, accessed_at)")
    .eq("content_status", "published")
    .in("profession_id", ids);

  const [formal, transitions, edu, certs, sources] = await Promise.all([
    formalPromise,
    transitionsPromise,
    eduPromise,
    certsPromise,
    sourcesPromise,
  ]);

  for (const { legacy, cig } of cigSlugs) {
    const p = bySlug.get(cig);
    if (!p) continue;
    const profId = p.id;

    type FormalRow = {
      profession_id: string;
      criticality: string | null;
      legal_blocker: boolean | null;
      country: string | null;
      jurisdiction: string | null;
      requirement: {
        title_sv: string | null;
        title_en: string | null;
        authority_sv: string | null;
        authority_en: string | null;
      } | null;
    };
    const formalRows = ((formal.data ?? []) as unknown as FormalRow[]).filter(
      (r) => r.profession_id === profId,
    );

    type TransRow = {
      from_profession_id: string;
      to_profession_id: string;
      transition_kind: string | null;
      rationale_sv: string | null;
      rationale_en: string | null;
    };
    const transRows = ((transitions.data ?? []) as unknown as TransRow[]).filter(
      (r) => r.from_profession_id === profId || r.to_profession_id === profId,
    );

    type EduRow = {
      profession_id: string;
      pathway: {
        slug: string;
        title_sv: string | null;
        title_en: string | null;
        typical_duration_months: number | null;
      } | null;
    };
    const eduRows = ((edu.data ?? []) as unknown as EduRow[]).filter(
      (r) => r.profession_id === profId,
    );

    type CertRow = {
      profession_id: string;
      certification: {
        slug: string;
        title_sv: string | null;
        title_en: string | null;
        issuer_sv: string | null;
        issuer_en: string | null;
      } | null;
    };
    const certRows = ((certs.data ?? []) as unknown as CertRow[]).filter(
      (r) => r.profession_id === profId,
    );

    type SrcRow = {
      profession_id: string;
      source: {
        title: string | null;
        url: string | null;
        source_type: string | null;
        accessed_at: string | null;
      } | null;
    };
    const srcRows = ((sources.data ?? []) as unknown as SrcRow[]).filter(
      (r) => r.profession_id === profId,
    );

    const disclaimer =
      p.disclaimer_sv || p.disclaimer_en ? bi(p.disclaimer_sv, p.disclaimer_en) : null;

    const enrichedSources: EnrichmentSource[] = [];
    for (const r of srcRows) {
      if (!r.source) continue;
      enrichedSources.push({
        label: r.source.title ?? "",
        url: optStr(r.source.url),
        kind: optStr(r.source.source_type),
        retrievedAt: optStr(r.source.accessed_at),
      });
    }

    const sourceCoverage = Math.min(1, enrichedSources.length / 3);

    result[legacy] = {
      cigSlug: cig,
      titleSv: optStr(p.title_sv),
      titleEn: optStr(p.title_en),
      disclaimer,
      formalRequirements: formalRows.map((r) => ({
        label: bi(r.requirement?.title_sv, r.requirement?.title_en),
        isLegal: !!r.legal_blocker,
        // No dedicated is_employer column; treat non-legal 'mandatory' rows as employer-required.
        isEmployer:
          !r.legal_blocker && (r.criticality === "mandatory" || r.criticality === "preferred"),
        kind: optStr(r.criticality),
        jurisdiction: optStr(r.jurisdiction),
      })),
      transitions: transRows.map((r) => ({
        direction: r.from_profession_id === profId ? "to" : "from",
        otherSlug:
          r.from_profession_id === profId
            ? String(r.to_profession_id)
            : String(r.from_profession_id),
        effort: optStr(r.transition_kind),
        notes: r.rationale_sv || r.rationale_en ? bi(r.rationale_sv, r.rationale_en) : undefined,
      })),
      educationPathways: eduRows
        .filter((r): r is EduRow & { pathway: NonNullable<EduRow["pathway"]> } => !!r.pathway)
        .map((r) => ({
          slug: r.pathway.slug,
          title: bi(r.pathway.title_sv, r.pathway.title_en),
          // Locale-neutral: the UI formats months per language ("24 månader" / "24 months").
          // `level` remains undefined on newly computed reports; older saved snapshots may still
          // carry an English-only "X months" string, which the UI treats as legacy fallback.
          durationMonths:
            typeof r.pathway.typical_duration_months === "number"
              ? r.pathway.typical_duration_months
              : undefined,
        })),
      certifications: certRows
        .filter(
          (r): r is CertRow & { certification: NonNullable<CertRow["certification"]> } =>
            !!r.certification,
        )
        .map((r) => ({
          slug: r.certification.slug,
          title: bi(r.certification.title_sv, r.certification.title_en),
          issuer: optStr(r.certification.issuer_sv ?? r.certification.issuer_en),
        })),
      relatedProfessions: [],
      sources: enrichedSources,
      sourceCoverage,
    };
  }

  return result;
}

async function loadPublishedCigSlugs(): Promise<Set<string>> {
  const supabase = serverPublicClient();
  const { data } = await supabase
    .from("cig_professions")
    .select("slug")
    .eq("content_status", "published");
  return new Set((data ?? []).map((r) => r.slug));
}

// Builds a ScoringQuestionSet from the Question Library's assembled
// questions/mappings for a given Assessment Definition + profile. Returns
// undefined for the legacy (no assessmentDefinitionId) call shape, which
// leaves computeEngineResultV1 -> computeUserVector on their default,
// unchanged, module-level legacy question set.
export function resolveQuestionSet(
  assessmentDefinitionId: string | undefined,
  profileId: AssessmentProfileId | undefined,
): ScoringQuestionSet | undefined {
  if (!assessmentDefinitionId) return undefined;
  const { questions, mappings } = assembleQuestionSet(assessmentDefinitionId, profileId);
  return {
    questions,
    mappingById: Object.fromEntries(mappings.map((m) => [m.questionId, m])),
  };
}

export const computeCareerIntelligenceMatches = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      answers: AnswerMap;
      topN?: number;
      restrictToPublished?: boolean;
      // Career Intelligence as a platform service: any Assessment Definition in
      // the catalog may pass its own id + (optionally) a Question Library
      // profile to score against its own assembled question set. Omitted
      // entirely, this call behaves exactly as it did before -- the legacy,
      // fixed 16-question `security-guard-foundation` content.
      assessmentDefinitionId?: string;
      profileId?: AssessmentProfileId;
    }) => {
      if (
        !input ||
        typeof input !== "object" ||
        typeof input.answers !== "object" ||
        input.answers === null
      ) {
        throw new Error("answers is required");
      }
      return input;
    },
  )
  .handler(async ({ data }) => {
    const targets = buildTargetVectorsFromLegacy();
    const legacySlugs = targets.map((t) => t.legacySlug);

    let enrichmentByLegacySlug: EnrichmentMap = {};
    let publishedCigSlugs: Set<string> | undefined = undefined;
    try {
      const [enr, pubs] = await Promise.all([
        loadEnrichmentForSlugs(legacySlugs),
        data.restrictToPublished ? loadPublishedCigSlugs() : Promise.resolve(undefined),
      ]);
      enrichmentByLegacySlug = enr;
      publishedCigSlugs = pubs;
    } catch {
      // graceful fallback — envelope reports dataStatus='cig_enrichment_missing'.
    }

    const questionSet = resolveQuestionSet(data.assessmentDefinitionId, data.profileId);

    return computeEngineResultV1({
      answers: data.answers,
      targets,
      enrichmentByLegacySlug,
      publishedCigSlugs,
      options: { topN: data.topN ?? 3 },
      assessmentDefinitionId: data.assessmentDefinitionId,
      questionSet,
    });
  });
