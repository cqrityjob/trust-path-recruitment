// Server functions for the minimal current-career-context step (Master
// Completion Mandate item 2).
//
// listCigProfessionsForPicker is public, deliberately — same pattern as
// getProfessionDetails in profession-detail.functions.ts: an anonymous
// visitor answering the assessment needs this before any account exists,
// and cig_professions already grants `anon` SELECT. It returns the whole
// small catalogue (well under a hundred rows) and lets the client filter —
// simpler and just as fast as a server-side search for this size of table.

import { createServerFn } from "@tanstack/react-start";
import { supabase as publicClient } from "@/integrations/supabase/client";

export interface CigProfessionOption {
  readonly slug: string;
  readonly titleSv: string;
  readonly titleEn: string;
}

export const listCigProfessionsForPicker = createServerFn({ method: "GET" }).handler(
  async (): Promise<readonly CigProfessionOption[]> => {
    const { data } = await publicClient
      .from("cig_professions")
      .select("slug, title_sv, title_en")
      .order("title_sv");
    return ((data ?? []) as { slug: string; title_sv: string; title_en: string }[]).map((r) => ({
      slug: r.slug,
      titleSv: r.title_sv,
      titleEn: r.title_en,
    }));
  },
);
