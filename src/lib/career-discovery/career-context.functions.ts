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

/**
 * Profession slugs directly reachable from `currentCigSlug` via a real,
 * published `cig_career_transitions` edge (Master Completion Mandate item
 * 7). An internal helper, not a client-callable server function — called
 * server-side by persistPublicV31Run and runOwnerPreviewMatch, both of
 * which already hold a Supabase client. Reads ONLY `content_status =
 * 'published'` edges — never fabricates a transition to make a persona or
 * test look better; an owner-reviewed, real graph or nothing.
 *
 * `supabase` is typed loosely (matches the existing Ctx.supabase pattern in
 * v31-public.functions.ts / v31-owner-preview.functions.ts) because the
 * generated Database type does not yet know this branch's cig_* tables.
 */
export async function fetchCigReachableSlugs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  currentCigSlug: string | null,
): Promise<ReadonlySet<string>> {
  if (!currentCigSlug) return new Set();

  const { data: current } = await supabase
    .from("cig_professions")
    .select("id")
    .eq("slug", currentCigSlug)
    .maybeSingle();
  if (!current?.id) return new Set();

  const { data: transitions } = await supabase
    .from("cig_career_transitions")
    .select("to_profession_id, content_status, cig_professions!cig_career_transitions_to_profession_id_fkey(slug)")
    .eq("from_profession_id", current.id)
    .eq("content_status", "published");

  const reachable = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (transitions ?? []) as any[]) {
    const slug = row.cig_professions?.slug;
    if (typeof slug === "string") reachable.add(slug);
  }
  return reachable;
}

/**
 * Resolves the display title for a self-reported current profession
 * (Master Completion Mandate item 8 — "YOU ARE HERE"), so the orchestration
 * layer can freeze it onto ReportSnapshot.currentProfession at build time.
 * Not a client-callable server function, same internal-helper pattern as
 * fetchCigReachableSlugs above. Returns null rather than a fabricated title
 * when the slug does not resolve — the frozen snapshot then correctly omits
 * "YOU ARE HERE" rather than showing a blank or invented name.
 */
export async function fetchCigProfessionTitle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  currentCigSlug: string | null,
): Promise<{ sv: string; en: string } | null> {
  if (!currentCigSlug) return null;

  const { data } = await supabase
    .from("cig_professions")
    .select("title_sv, title_en")
    .eq("slug", currentCigSlug)
    .maybeSingle();

  if (!data?.title_sv || !data?.title_en) return null;
  return { sv: data.title_sv, en: data.title_en };
}
