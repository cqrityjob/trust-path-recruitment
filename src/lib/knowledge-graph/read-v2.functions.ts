// Sprint 09C — Read-contract v2 for the DB-backed Career Intelligence Graph.
//
// These server functions read the canonical `cig_*` catalogue with a
// publishable-key client. They only return rows with content_status =
// 'published' (enforced both by RLS anon policy and by explicit filters).
//
// Not yet wired into the UI. Phase D swaps callers. Phase E activates.

import { createServerFn } from "@tanstack/react-start";
import { serverPublicClient } from "@/integrations/supabase/public-server";

export const listPublishedProfessionsV2 = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = serverPublicClient();
  const { data, error } = await supabase
    .from("cig_professions")
    .select("id, slug, canonical_key, quality_level, is_regulated, country, jurisdiction, title_sv, title_en, summary_sv, summary_en, disclaimer_sv, disclaimer_en, primary_family_id")
    .eq("content_status", "published");
  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null as string | null };
});

export const listFamiliesV2 = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = serverPublicClient();
  const { data, error } = await supabase
    .from("cig_profession_families")
    .select("id, slug, title_sv, title_en, description_sv, description_en")
    .eq("content_status", "published");
  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null as string | null };
});

export const readProfessionGraphV2 = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => {
    if (!input || typeof input.slug !== "string" || input.slug.length === 0) {
      throw new Error("slug is required");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const supabase = serverPublicClient();
    const { data: profession, error } = await supabase
      .from("cig_professions")
      .select("*")
      .eq("slug", data.slug)
      .eq("content_status", "published")
      .maybeSingle();
    if (error) return { profession: null, error: error.message };
    if (!profession) return { profession: null, error: null };

    // Related rows are fetched in parallel; every table has the same
    // "read published" policy so anon reads are safe.
    const [aliases, specialisations, competencies, skills, knowledge, formal, education, certs, experience, transitions, sources] = await Promise.all([
      supabase.from("cig_profession_aliases").select("*").eq("profession_id", profession.id).eq("content_status", "published"),
      supabase.from("cig_profession_specialisations").select("*").eq("profession_id", profession.id).eq("content_status", "published"),
      supabase.from("cig_profession_competency_req").select("*").eq("profession_id", profession.id).eq("content_status", "published"),
      supabase.from("cig_profession_skill_req").select("*").eq("profession_id", profession.id).eq("content_status", "published"),
      supabase.from("cig_profession_knowledge_req").select("*").eq("profession_id", profession.id).eq("content_status", "published"),
      supabase.from("cig_profession_formal_requirements").select("*").eq("profession_id", profession.id).eq("content_status", "published"),
      supabase.from("cig_profession_education_pathways").select("*").eq("profession_id", profession.id).eq("content_status", "published"),
      supabase.from("cig_profession_certification_rel").select("*").eq("profession_id", profession.id).eq("content_status", "published"),
      supabase.from("cig_profession_experience_req").select("*").eq("profession_id", profession.id).eq("content_status", "published"),
      supabase.from("cig_career_transitions").select("*").or(`from_profession_id.eq.${profession.id},to_profession_id.eq.${profession.id}`).eq("content_status", "published"),
      supabase.from("cig_profession_source_references").select("*").eq("profession_id", profession.id).eq("content_status", "published"),
    ]);

    return {
      error: null as string | null,
      profession,
      aliases: aliases.data ?? [],
      specialisations: specialisations.data ?? [],
      competencies: competencies.data ?? [],
      skills: skills.data ?? [],
      knowledge: knowledge.data ?? [],
      formalRequirements: formal.data ?? [],
      educationPathways: education.data ?? [],
      certifications: certs.data ?? [],
      experience: experience.data ?? [],
      transitions: transitions.data ?? [],
      sources: sources.data ?? [],
    };
  });