// Client-side (browser) queries for the public Jobs experience.
//
// RLS on `jobs` and `employers` restricts anon reads to active published
// rows (via public.job_is_active). Admin metadata is unreachable from
// this client — anon has no access to *_admin_meta.
//
// We use the browser supabase client so `jobs` child routes can stay
// `ssr: false` and hydrate purely on the client. SEO/SSR is out of scope
// for Phase C and is planned for Phase F (launch hardening).

import { supabase } from "@/integrations/supabase/client";

export type PublicJobCard = {
  id: string;
  slug: string;
  title_sv: string | null;
  title_en: string | null;
  description_sv?: string | null;
  description_en?: string | null;
  location_text: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  workplace_type: string | null;
  employment_type: string | null;
  experience_level: string | null;
  family_id: string | null;
  profession_slug: string | null;
  application_method: string;
  application_url: string | null;
  application_email: string | null;
  published_at: string | null;
  deadline_at: string | null;
  employer_id: string;
  employer?: PublicEmployer | null;
};

export type PublicEmployer = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string | null;
  country: string | null;
  description_sv: string | null;
  description_en: string | null;
};

export type PublicJobDetail = PublicJobCard & {
  description_sv: string | null;
  description_en: string | null;
  responsibilities: unknown;
  requirements: unknown;
  requirements_sv: string | null;
  requirements_en: string | null;
  benefits: unknown;
  language_requirements: string[];
  regulated: boolean;
  security_vetting_mentioned: boolean;
  driving_licence_required: boolean;
  sector: string | null;
  employer_type: string | null;
};

const CARD_COLUMNS =
  "id, slug, title_sv, title_en, description_sv, description_en, location_text, country, city, region, workplace_type, employment_type, experience_level, family_id, profession_slug, application_method, application_url, application_email, published_at, deadline_at, employer_id";

const DETAIL_COLUMNS =
  CARD_COLUMNS +
  ", responsibilities, requirements, requirements_sv, requirements_en, benefits, language_requirements, regulated, security_vetting_mentioned, driving_licence_required, sector, employer_type";

export type JobsQueryArgs = {
  q?: string;
  location?: string;
  familyId?: string;
  professionSlug?: string;
  employmentType?: string;
  workplaceType?: string;
  experienceLevel?: string;
  country?: string;
  limit?: number;
  offset?: number;
  sort?: "newest" | "deadline";
  employerId?: string;
};

async function attachEmployers<T extends { employer_id: string }>(
  rows: T[],
): Promise<Array<T & { employer: PublicEmployer | null }>> {
  const ids = Array.from(new Set(rows.map((r) => r.employer_id).filter(Boolean)));
  if (ids.length === 0) return rows.map((r) => ({ ...r, employer: null }));
  const { data, error } = await supabase
    .from("employers")
    .select("id, name, slug, logo_url, website, country, description_sv, description_en")
    .in("id", ids);
  if (error) throw error;
  const byId: Record<string, PublicEmployer> = {};
  for (const e of (data ?? []) as PublicEmployer[]) byId[e.id] = e;
  return rows.map((r) => ({ ...r, employer: byId[r.employer_id] ?? null }));
}

export async function listPublicJobs(args: JobsQueryArgs = {}): Promise<PublicJobCard[]> {
  const now = new Date().toISOString();
  let query = supabase
    .from("jobs")
    .select(CARD_COLUMNS)
    // RLS on jobs already enforces job_is_active; these filters make the
    // client contract explicit and cut network cost.
    .eq("status", "published")
    .lte("published_at", now)
    .or(`deadline_at.is.null,deadline_at.gt.${now}`)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order(args.sort === "deadline" ? "deadline_at" : "published_at", {
      ascending: args.sort === "deadline",
      nullsFirst: false,
    })
    .order("id", { ascending: true })
    .range(args.offset ?? 0, (args.offset ?? 0) + (args.limit ?? 60) - 1);

  if (args.employerId) query = query.eq("employer_id", args.employerId);
  if (args.familyId) query = query.eq("family_id", args.familyId);
  if (args.professionSlug) query = query.eq("profession_slug", args.professionSlug);
  if (args.employmentType) query = query.eq("employment_type", args.employmentType);
  if (args.workplaceType) query = query.eq("workplace_type", args.workplaceType);
  if (args.experienceLevel) query = query.eq("experience_level", args.experienceLevel);
  if (args.country) query = query.eq("country", args.country.toUpperCase());

  const q = args.q?.trim();
  if (q) {
    const like = JSON.stringify(`%${q.replace(/[%_]/g, "")}%`);
    query = query.or(
      `title_sv.ilike.${like},title_en.ilike.${like},description_sv.ilike.${like},description_en.ilike.${like}`,
    );
  }
  const loc = args.location?.trim();
  if (loc) {
    const like = JSON.stringify(`%${loc.replace(/[%_]/g, "")}%`);
    query = query.or(`location_text.ilike.${like},city.ilike.${like},region.ilike.${like}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return attachEmployers((data ?? []) as unknown as PublicJobCard[]);
}

export async function getPublicJobBySlug(slug: string): Promise<PublicJobDetail | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select(DETAIL_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [withEmployer] = await attachEmployers([data as unknown as PublicJobDetail]);
  return withEmployer as unknown as PublicJobDetail;
}

/** Related jobs: same profession first, then same family. Excludes the
 * current job. All returned rows are already RLS-filtered to active. */
export async function listRelatedPublicJobs(args: {
  excludeId: string;
  professionSlug: string | null;
  familyId: string | null;
  limit?: number;
}): Promise<PublicJobCard[]> {
  const limit = args.limit ?? 4;
  const seen = new Set<string>([args.excludeId]);
  const out: PublicJobCard[] = [];

  const runQuery = async (key: "profession_slug" | "family_id", value: string) => {
    const { data, error } = await supabase
      .from("jobs")
      .select(CARD_COLUMNS)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .or(`deadline_at.is.null,deadline_at.gt.${new Date().toISOString()}`)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .eq(key, value)
      .order("published_at", { ascending: false })
      .limit(limit + 1);
    if (error) throw error;
    return (data ?? []) as unknown as PublicJobCard[];
  };

  if (args.professionSlug) {
    for (const r of await runQuery("profession_slug", args.professionSlug)) {
      if (seen.has(r.id) || out.length >= limit) continue;
      seen.add(r.id);
      out.push(r);
    }
  }
  if (out.length < limit && args.familyId) {
    for (const r of await runQuery("family_id", args.familyId)) {
      if (seen.has(r.id) || out.length >= limit) continue;
      seen.add(r.id);
      out.push(r);
    }
  }

  return attachEmployers(out);
}

/** Best-effort check that a public job is still open for applications. */
export function isJobExpired(job: {
  deadline_at: string | null;
  published_at: string | null;
}): boolean {
  if (!job.deadline_at) return false;
  const d = new Date(job.deadline_at).getTime();
  if (!Number.isFinite(d)) return false;
  return d < Date.now();
}

// ── The vacancy's requirements and application questions ─────────────────
//
// Read through the same browser client and the same RLS: the policies on
// recruitment_requirements / recruitment_questions show a vacancy's frame to
// whoever may see the vacancy itself, so an active advertisement's frame is
// public and a draft's is nobody's outside its organisation.

export type PublicRequirement = {
  explanation_sv?: string | null;
  explanation_en?: string | null;
  id: string;
  kind: "mandatory" | "desirable";
  label_sv: string | null;
  label_en: string | null;
};
export type PublicQuestion = {
  id: string;
  requirement_id: string | null;
  prompt_sv: string | null;
  prompt_en: string | null;
  answer_kind: "text" | "yes_no";
  is_required: boolean;
};

export async function getPublicVacancyStructure(
  jobId: string,
): Promise<{ requirements: PublicRequirement[]; questions: PublicQuestion[] }> {
  const [r, q] = await Promise.all([
    supabase
      .from("recruitment_requirements")
      .select("id, kind, label_sv, label_en")
      .eq("job_id", jobId)
      .order("position"),
    supabase
      .from("recruitment_questions")
      .select("id, requirement_id, prompt_sv, prompt_en, answer_kind, is_required")
      .eq("job_id", jobId)
      .order("position"),
  ]);
  // A failed read is thrown, never returned as "no questions": an application
  // form that silently lost its required questions would then be refused at
  // submission for answers the candidate was never shown.
  if (r.error) throw r.error;
  if (q.error) throw q.error;
  const requirements = (r.data ?? []) as PublicRequirement[];
  if (requirements.length) {
    const fields = "title_sv, title_en, description_sv, description_en";
    const [sv, en] = await Promise.all([
      supabase
        .from("cig_competencies")
        .select(fields)
        .eq("content_status", "published")
        .in(
          "title_sv",
          requirements.flatMap((r) => (r.label_sv ? [r.label_sv] : [])),
        ),
      supabase
        .from("cig_competencies")
        .select(fields)
        .eq("content_status", "published")
        .in(
          "title_en",
          requirements.flatMap((r) => (r.label_en ? [r.label_en] : [])),
        ),
    ]);
    // Definitions supplement the employer's unchanged requirement and question.
    // If this optional read fails, the form still shows its required questions.
    for (const requirement of requirements) {
      const definition = [...(sv.data ?? []), ...(en.data ?? [])].find(
        (c) => c.title_sv === requirement.label_sv || c.title_en === requirement.label_en,
      );
      requirement.explanation_sv = definition?.description_sv ?? null;
      requirement.explanation_en = definition?.description_en ?? null;
    }
  }
  return { requirements, questions: (q.data ?? []) as PublicQuestion[] };
}
