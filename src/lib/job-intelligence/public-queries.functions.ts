import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { serverPublicClient } from "@/integrations/supabase/public-server";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

// -----------------------------------------------------------------------------
// Jobs MVP v1 — H2: SSR-safe public job queries.
//
// The existing `public-queries.ts` module uses the browser Supabase client
// (with localStorage-backed session storage) so it cannot run during SSR.
// These server functions provide a server-safe path via `serverPublicClient`
// for use in loaders and `head()` — public routes only. Anon RLS on
// `jobs` and `employers` still enforces active-published visibility.
// -----------------------------------------------------------------------------

const DETAIL_COLUMNS =
  "id, slug, title_sv, title_en, description_sv, description_en, responsibilities, requirements, benefits, location_text, country, city, region, workplace_type, employment_type, experience_level, family_id, profession_slug, application_method, application_url, application_email, published_at, deadline_at, expires_at, employer_id, language_requirements, regulated, security_vetting_mentioned, driving_licence_required, sector, employer_type, salary_min, salary_max, salary_currency, salary_period, seniority, work_environment, leadership_responsibility";

export type PublicJobSsrEmployer = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string | null;
  country: string | null;
  description_sv: string | null;
  description_en: string | null;
};

export type PublicJobSsrDetail = {
  id: string;
  slug: string;
  title_sv: string | null;
  title_en: string | null;
  description_sv: string | null;
  description_en: string | null;
  responsibilities: JsonValue;
  requirements: JsonValue;
  benefits: JsonValue;
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
  expires_at: string | null;
  employer_id: string;
  language_requirements: string[];
  regulated: boolean;
  security_vetting_mentioned: boolean;
  driving_licence_required: boolean;
  sector: string | null;
  employer_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  seniority: string | null;
  work_environment: string | null;
  leadership_responsibility: boolean | null;
  employer: PublicJobSsrEmployer | null;
};

export const getPublicJobBySlugSSR = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }): Promise<PublicJobSsrDetail | null> => {
    const supa = serverPublicClient();
    const { data: row, error } = await supa
      .from("jobs")
      .select(DETAIL_COLUMNS)
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    // Attach employer (only for active employers, which anon RLS enforces).
    const { data: emp } = await supa
      .from("employers")
      .select(
        "id, name, slug, logo_url, website, country, description_sv, description_en",
      )
      .eq("id", (row as { employer_id: string }).employer_id)
      .maybeSingle();

    return {
      ...(row as unknown as PublicJobSsrDetail),
      employer: (emp as PublicJobSsrEmployer | null) ?? null,
    };
  });

export const listActivePublicJobSlugsSSR = createServerFn({ method: "GET" })
  .handler(async (): Promise<Array<{ slug: string; published_at: string | null }>> => {
    const supa = serverPublicClient();
    const { data, error } = await supa
      .from("jobs")
      .select("slug, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ slug: string; published_at: string | null }>;
  });