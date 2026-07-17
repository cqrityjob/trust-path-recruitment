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
  employer?: { name: string; slug: string } | null;
};

export type PublicJobDetail = PublicJobCard & {
  description_sv: string | null;
  description_en: string | null;
  responsibilities: unknown;
  requirements: unknown;
  benefits: unknown;
  language_requirements: string[];
  regulated: boolean;
  security_vetting_mentioned: boolean;
  driving_licence_required: boolean;
  sector: string | null;
  employer_type: string | null;
};

const CARD_COLUMNS =
  "id, slug, title_sv, title_en, location_text, country, city, region, workplace_type, employment_type, experience_level, family_id, profession_slug, application_method, application_url, application_email, published_at, deadline_at, employer_id";

const DETAIL_COLUMNS =
  CARD_COLUMNS +
  ", description_sv, description_en, responsibilities, requirements, benefits, language_requirements, regulated, security_vetting_mentioned, driving_licence_required, sector, employer_type";

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
};

async function attachEmployers<T extends { employer_id: string }>(
  rows: T[],
): Promise<Array<T & { employer: { name: string; slug: string } | null }>> {
  const ids = Array.from(new Set(rows.map((r) => r.employer_id).filter(Boolean)));
  if (ids.length === 0) return rows.map((r) => ({ ...r, employer: null }));
  const { data, error } = await supabase
    .from("employers")
    .select("id, name, slug")
    .in("id", ids);
  if (error) throw error;
  const byId: Record<string, { name: string; slug: string }> = {};
  for (const e of data ?? []) byId[e.id as string] = { name: e.name, slug: e.slug };
  return rows.map((r) => ({ ...r, employer: byId[r.employer_id] ?? null }));
}

export async function listPublicJobs(
  args: JobsQueryArgs = {},
): Promise<PublicJobCard[]> {
  let query = supabase
    .from("jobs")
    .select(CARD_COLUMNS)
    // RLS on jobs already enforces job_is_active; these filters make the
    // client contract explicit and cut network cost.
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(args.limit ?? 60);

  if (args.familyId) query = query.eq("family_id", args.familyId);
  if (args.professionSlug) query = query.eq("profession_slug", args.professionSlug);
  if (args.employmentType) query = query.eq("employment_type", args.employmentType);
  if (args.workplaceType) query = query.eq("workplace_type", args.workplaceType);
  if (args.experienceLevel) query = query.eq("experience_level", args.experienceLevel);
  if (args.country) query = query.eq("country", args.country.toUpperCase());

  const q = args.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(
      `title_sv.ilike.${like},title_en.ilike.${like},description_sv.ilike.${like},description_en.ilike.${like}`,
    );
  }
  const loc = args.location?.trim();
  if (loc) {
    const like = `%${loc.replace(/[%_]/g, "")}%`;
    query = query.or(
      `location_text.ilike.${like},city.ilike.${like},region.ilike.${like}`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return attachEmployers(data ?? []) as any;
}

export async function getPublicJobBySlug(
  slug: string,
): Promise<PublicJobDetail | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select(DETAIL_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [withEmployer] = await attachEmployers([data as any]);
  return withEmployer as unknown as PublicJobDetail;
}