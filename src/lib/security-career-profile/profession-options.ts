// Client-side query for the "current profession" picker. Reuses the
// existing published profession catalogue (cig_professions) instead of a
// second, freestanding taxonomy — mirrors src/lib/job-intelligence/
// public-queries.ts's pattern for reading anon/authenticated-safe,
// RLS-restricted (content_status = 'published') catalogue rows.

import { supabase } from "@/integrations/supabase/client";

export type CurrentProfessionOption = {
  slug: string;
  title_sv: string;
  title_en: string;
};

export async function listCurrentProfessionOptions(): Promise<CurrentProfessionOption[]> {
  const { data, error } = await supabase
    .from("cig_professions")
    .select("slug, title_sv, title_en")
    .eq("content_status", "published")
    .order("title_sv", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CurrentProfessionOption[];
}
