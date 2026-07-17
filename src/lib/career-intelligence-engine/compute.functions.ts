// Server function: compute Career Intelligence Engine v1 result with
// CIG-backed enrichment. Uses the anonymous publishable-key server client
// with an explicit content_status='published' filter for every CIG read.
//
// Signals live in TS profession profiles (Phase D scope). CIG provides:
//   - list of published profession slugs (matching-set filter)
//   - families
//   - per-match: formal requirements, disclaimer, transitions,
//     education pathways, certifications, sources, related professions
//
// If a matched legacy slug has no CIG counterpart, enrichment for that
// match is empty and the envelope reports dataStatus='cig_enrichment_missing'.

import { createServerFn } from "@tanstack/react-start";
import { serverPublicClient } from "@/integrations/supabase/public-server";
import type { AnswerMap } from "@/lib/career-assessment/types";
import {
  buildTargetVectorsFromLegacy,
  computeEngineResultV1,
  toCigSlug,
  type EngineResultV1,
  type EnrichmentBundle,
} from "./index";

function firstNonNull<T>(...vals: (T | null | undefined)[]): T | undefined {
  for (const v of vals) if (v != null) return v;
  return undefined;
}

type EnrichmentMap = Record<string, EnrichmentBundle>;

async function loadEnrichmentForSlugs(
  legacySlugs: string[],
): Promise<EnrichmentMap> {
  const supabase = serverPublicClient();
  const result: EnrichmentMap = {};

  // Resolve CIG rows for the slugs we care about (published only).
  const cigSlugs = legacySlugs
    .map((s) => ({ legacy: s, cig: toCigSlug(s) }))
    .filter((x): x is { legacy: string; cig: string } => !!x.cig);
  if (cigSlugs.length === 0) return result;

  const { data: professions, error: pErr } = await supabase
    .from("cig_professions")
    .select(
      "id, slug, title_sv, title_en, disclaimer_sv, disclaimer_en, is_regulated, primary_family_id",
    )
    .eq("content_status", "published")
    .in(
      "slug",
      cigSlugs.map((x) => x.cig),
    );
  if (pErr || !professions) return result;

  const bySlug = new Map(professions.map((p) => [p.slug, p]));
  const ids = professions.map((p) => p.id);
  if (ids.length === 0) return result;

  // Batch enrichment reads.
  const [formal, transitions, edu, certs, sources] = await Promise.all([
    supabase
      .from("cig_profession_formal_requirements")
      .select("*")
      .eq("content_status", "published")
      .in("profession_id", ids),
    supabase
      .from("cig_career_transitions")
      .select("*")
      .eq("content_status", "published")
      .or(
        `from_profession_id.in.(${ids.join(",")}),to_profession_id.in.(${ids.join(",")})`,
      ),
    supabase
      .from("cig_profession_education_pathways")
      .select(
        "profession_id, pathway:cig_education_pathways(slug, title_sv, title_en, level)",
      )
      .eq("content_status", "published")
      .in("profession_id", ids),
    supabase
      .from("cig_profession_certification_rel")
      .select(
        "profession_id, certification:cig_certifications(slug, title_sv, title_en, issuer)",
      )
      .eq("content_status", "published")
      .in("profession_id", ids),
    supabase
      .from("cig_profession_source_references")
      .select(
        "profession_id, source:cig_source_references(label, url, source_kind, retrieved_at)",
      )
      .eq("content_status", "published")
      .in("profession_id", ids),
  ]);

  for (const { legacy, cig } of cigSlugs) {
    const p = bySlug.get(cig);
    if (!p) continue;
    const profId = p.id;

    const formalRows = (formal.data ?? []).filter((r) => r.profession_id === profId);
    const transRows = (transitions.data ?? []).filter(
      (r) => r.from_profession_id === profId || r.to_profession_id === profId,
    );
    const eduRows = (edu.data ?? []).filter((r) => r.profession_id === profId);
    const certRows = (certs.data ?? []).filter((r) => r.profession_id === profId);
    const srcRows = (sources.data ?? []).filter((r) => r.profession_id === profId);

    const disclaimer =
      p.disclaimer_sv || p.disclaimer_en
        ? {
            sv: p.disclaimer_sv ?? p.disclaimer_en ?? "",
            en: p.disclaimer_en ?? p.disclaimer_sv ?? "",
          }
        : null;

    const sourceCoverage = Math.min(1, srcRows.length / 3);

    result[legacy] = {
      cigSlug: cig,
      titleSv: p.title_sv ?? undefined,
      titleEn: p.title_en ?? undefined,
      disclaimer,
      formalRequirements: formalRows.map((r) => ({
        label: {
          sv: r.label_sv ?? r.label_en ?? "",
          en: r.label_en ?? r.label_sv ?? "",
        },
        isLegal: !!r.is_legal,
        isEmployer: !!r.is_employer,
        kind: r.requirement_kind ?? undefined,
        jurisdiction: r.jurisdiction ?? null,
      })),
      transitions: transRows.map((r) => ({
        direction: r.from_profession_id === profId ? "to" : "from",
        otherSlug:
          r.from_profession_id === profId
            ? String(r.to_profession_id)
            : String(r.from_profession_id),
        effort: r.transition_effort ?? null,
        notes:
          r.notes_sv || r.notes_en
            ? { sv: r.notes_sv ?? "", en: r.notes_en ?? "" }
            : null,
      })),
      educationPathways: eduRows
        .map((r) => {
          const pw = (r as unknown as { pathway?: { slug: string; title_sv?: string; title_en?: string; level?: string } }).pathway;
          if (!pw) return null;
          return {
            slug: pw.slug,
            title: {
              sv: pw.title_sv ?? pw.title_en ?? "",
              en: pw.title_en ?? pw.title_sv ?? "",
            },
            level: firstNonNull(pw.level, null) ?? null,
          };
        })
        .filter((v): v is { slug: string; title: { sv: string; en: string }; level: string | null } => v !== null),
      certifications: certRows
        .map((r) => {
          const c = (r as unknown as { certification?: { slug: string; title_sv?: string; title_en?: string; issuer?: string } }).certification;
          if (!c) return null;
          return {
            slug: c.slug,
            title: {
              sv: c.title_sv ?? c.title_en ?? "",
              en: c.title_en ?? c.title_sv ?? "",
            },
            issuer: c.issuer ?? null,
          };
        })
        .filter((v): v is { slug: string; title: { sv: string; en: string }; issuer: string | null } => v !== null),
      relatedProfessions: [], // populated below
      sources: srcRows
        .map((r) => {
          const s = (r as unknown as { source?: { label?: string; url?: string; source_kind?: string; retrieved_at?: string } }).source;
          if (!s) return null;
          return {
            label: s.label ?? "",
            url: s.url ?? undefined,
            kind: s.source_kind ?? undefined,
            retrievedAt: s.retrieved_at ?? null,
          };
        })
        .filter((v): v is { label: string; url?: string; kind?: string; retrievedAt: string | null } => v !== null),
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

export const computeCareerIntelligenceMatches = createServerFn({ method: "POST" })
  .inputValidator((input: { answers: AnswerMap; topN?: number; restrictToPublished?: boolean }) => {
    if (!input || typeof input !== "object" || typeof input.answers !== "object" || input.answers === null) {
      throw new Error("answers is required");
    }
    return input;
  })
  .handler(async ({ data }): Promise<EngineResultV1> => {
    const targets = buildTargetVectorsFromLegacy();
    const legacySlugs = targets.map((t) => t.legacySlug);

    // Try to enrich from CIG. If it fails (network etc.), fall back to
    // empty enrichment — scoring still works.
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
      // ignore; envelope will report dataStatus='cig_enrichment_missing'.
    }

    return computeEngineResultV1({
      answers: data.answers,
      targets,
      enrichmentByLegacySlug,
      publishedCigSlugs,
      options: { topN: data.topN ?? 3 },
    });
  });
