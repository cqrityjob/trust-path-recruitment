import { createFileRoute, redirect } from "@tanstack/react-router";
import type { ProfessionDetail } from "@/lib/career-discovery/profession-detail.functions";
import {
  careerCenterProfessionSlug,
  isWellFormedCigSlug,
} from "@/lib/career-center/profession-links";
import { CatalogueProfessionView } from "@/components/career-center/CatalogueProfession";
import { catalogueProfessionQuery } from "@/components/career-center/catalogue-profession-query";

// One profession as the reviewed Career Intelligence Graph describes it.
//
// ── WHY THIS PAGE EXISTS ───────────────────────────────────────────────
//
// Career Discovery can recommend fourteen professions; nine have a published
// Career Center guide. The other five (Personskyddsvakt, Polis,
// SOC-analytiker, Cybersäkerhetsanalytiker, Säkerhetsutredare) used to end
// in the Career Center at "Vi har ingen publicerad yrkesguide" — while the
// report opened an in-card panel of catalogue facts for the very same
// recommendation. One recommendation, two answers, one of them a dead end.
//
// This page is that catalogue content with an address: the same
// `getProfessionDetails` read, for exactly one CIG profession, reachable
// from every surface through `professionInfoDestination`.
//
// ── WHAT IT WILL NOT DO ────────────────────────────────────────────────
//
//   * Stand in for a guide. A profession WITH a published guide redirects to
//     it, so there is one canonical description per profession.
//   * Show unreviewed content. Only rows with content_status 'published' are
//     readable at all (the `cig read published` RLS policy); an unknown or
//     unpublished slug renders an honest "not published" state.
//   * Invent anything. A section with no catalogue rows says so.
//   * Get indexed. It is supplementary material, `noindex`; the guides are
//     what the Career Center publishes for search.

export const Route = createFileRoute("/career-center/yrke/$cigSlug")({
  beforeLoad: ({ params }) => {
    // One canonical description per profession: a published guide wins.
    const guide = careerCenterProfessionSlug(params.cigSlug);
    if (guide) {
      throw redirect({
        to: "/career-center/$profession",
        params: { profession: guide },
        replace: true,
      });
    }
  },
  loader: async ({ params, context }) => {
    if (!isWellFormedCigSlug(params.cigSlug)) return null;
    try {
      return await context.queryClient.ensureQueryData(catalogueProfessionQuery(params.cigSlug));
    } catch {
      // The page renders its own error state with a retry; the head falls
      // back to a neutral title.
      return null;
    }
  },
  head: ({ loaderData }) => {
    const detail = loaderData as ProfessionDetail | null | undefined;
    return {
      meta: [
        {
          title: detail
            ? `${detail.titleSv} — yrkesinformation | CQrityjob`
            : "Yrkesinformation — CQrityjob",
        },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: CatalogueProfessionPage,
});

function CatalogueProfessionPage() {
  const { cigSlug } = Route.useParams();
  return <CatalogueProfessionView cigSlug={cigSlug} />;
}
