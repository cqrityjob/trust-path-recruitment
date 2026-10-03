// CANONICAL public route for the candidate assessment journey.
//
// ── CUTOVER ────────────────────────────────────────────────────────────
// This path used to render the legacy 16-question instrument
// (`public-career-assessment`, v2.1). It now renders Security Career
// Discovery v3.
//
// The URL is deliberately unchanged: it is in the sitemap, it is indexed,
// and roughly a dozen CTAs across the site already point here. Keeping it
// means every one of those CTAs leads to v3 with no edit, and no SEO equity
// is discarded.
//
// The legacy instrument is NOT deleted. Its component, engine, mappings and
// stored reports remain intact so historical runs stay readable and exactly
// reproducible at /my-career/reports/$runId — see
// src/lib/career-discovery/legacy-retirement.ts and the accompanying
// migration, which stop new legacy runs at the database layer rather than
// by hiding links.
//
// Access is gated independently of lifecycle_status (which is `active` —
// the content is ready), by the release control (public.cd_access_policy):
// `internal_test` admits platform admins and allowlisted internal testers
// (cd_internal_testers, granted via cd_grant_internal_tester()) to START AND
// SAVE a run from inside the product, `public` admits every signed-in
// account, `paused` closes the analysis for everyone. Enforced server-side in
// src/lib/career-discovery/v31-public.functions.ts and read by every surface
// through one resolver (src/lib/career-discovery/analysis-access.ts). This
// keeps the assessment usable by a named test group ahead of the Career
// Intelligence recommendation layer's completion, without weakening or
// re-gating the lifecycle machinery itself.
//
// AMENDED 2026-08-31: the allowlist does NOT gate claiming a result the
// candidate completed anonymously. Anonymous completion is open to the whole
// public today and this page invites it; refusing the save afterwards left
// "start without an account, create one later to keep the result" as a
// promise the product broke, and cost the run. See resolveSaveGate.
//
// ── INDEXING FOLLOWS THE ACCESS STATE ──────────────────────────────────
//
// This page used to be hard-coded `noindex, nofollow` "while the instrument is
// in internal test", with the removal left as a separate manual change at
// launch — the kind of step that is remembered a month late. The robots rule
// and the sitemap now FOLLOW the release control:
//
//   public                      indexable (robots + canonical), in sitemap.xml
//   internal_test, paused,      noindex, nofollow, absent from sitemap.xml
//   or the state cannot be read
//
// It fails closed: a read that does not answer is `noindex`, never `index`.
//
// HOW, SAFELY: the route component cannot render on the server (it reads
// sessionStorage and the Supabase session), but its DATA can, so the route is
// `ssr: "data-only"`: the loader runs on the server for the first response and
// the head is written from its answer into the HTML a crawler receives. On a
// client-side navigation the loader answers `false` WITHOUT a round trip — a
// crawler loads the URL, it does not click — so no navigation waits on the
// read. Read per request, no server or HTTP cache; the sitemap's own cache is
// ten minutes (sitemap[.]xml.ts). scripts/career-analysis-availability-check.ts
// holds this together.

import { createFileRoute } from "@tanstack/react-router";
import { PublicAssessmentFlow } from "@/components/career-discovery/v31/PublicAssessmentFlow";
import { useLocalizedHead } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";
import { analysisIndexable, analysisRobots } from "@/lib/career-discovery/analysis-access";
import { CANONICAL_ASSESSMENT_PATH } from "@/lib/career-discovery/routes";
import { getV31Availability } from "@/lib/career-discovery/v31-public.functions";
import { siteUrl } from "@/lib/site-origin";

/** MVP text specification §14: the product name, explained as a career
 *  analysis, and the landing page's own ingress as the description. Swedish
 *  from the server; useLocalizedHead() swaps in English on the client. */
const SV = dictionaries.sv;

/** How long the first response waits for the release control before it fails
 *  closed to `noindex`. A hung read must never hold the page. */
const INDEXING_READ_TIMEOUT_MS = 2_000;

/**
 * Is the page indexable right now? Server only: on the client it answers
 * `false` immediately (see the header), and any failure answers `false`.
 */
async function readIndexable(): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answer = await Promise.race([
      getV31Availability(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), INDEXING_READ_TIMEOUT_MS);
      }),
    ]);
    return analysisIndexable(answer);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const Route = createFileRoute("/security-career-assessment")({
  ssr: "data-only",
  loader: async () => ({ indexable: await readIndexable() }),
  head: ({ loaderData }) => {
    const indexable = loaderData?.indexable === true;
    return {
      meta: [
        { title: SV["meta.careerDiscovery.title"] },
        { name: "description", content: SV["cd.public.introBody"] },
        // Follows the release control: indexable only while it says `public`.
        // Never hand-edited at launch; see the header.
        { name: "robots", content: analysisRobots(indexable) },
        ...(indexable ? [{ property: "og:url", content: siteUrl(CANONICAL_ASSESSMENT_PATH) }] : []),
      ],
      links: indexable ? [{ rel: "canonical", href: siteUrl(CANONICAL_ASSESSMENT_PATH) }] : [],
    };
  },
  component: CanonicalAssessmentRoute,
});

function CanonicalAssessmentRoute() {
  useLocalizedHead("meta.careerDiscovery.title", "cd.public.introBody");
  // The public v3.1 flow is the ONLY assessment this route serves. When v3.1
  // is not administrable it shows an explicit v3.1 unavailable state.
  //
  // The v3.0 fallback was removed deliberately: silently routing a candidate
  // into the old assessment means they answer a different instrument from the
  // one the page describes, and their result is scored by a model this product
  // has retired. An honest "not open yet" is better than a working page that
  // measures the wrong thing.
  return <PublicAssessmentFlow />;
}
