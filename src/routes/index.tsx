import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteLayout } from "@/components/site/SiteLayout";
import {
  HomeEmployers,
  HomeForIndividuals,
  HomeHero,
  HomeLatestJobs,
  HomeRecruitmentServices,
  HomeWhy,
} from "@/components/site/HomeSections";
import { SecurityPassportNetwork } from "@/components/site/SecurityPassportNetwork";
import { useRetiredHomeAnchors } from "@/components/site/legacy-home-anchors";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { useLocalizedHead } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";

/** ── THE PUBLIC HOMEPAGE (locked decisions, 2026-09-30) ────────────────
 *
 *    HOMEPAGE = BREADTH. SUBPAGE = DEPTH. CTA = THE PATH FORWARD.
 *
 *  Exactly six sections, in this order, and nothing else:
 *
 *    1. hero                  "Security careers, without limits." (locked
 *                             owner decision, 2026-10-01; English in both
 *                             languages), the positioning for both
 *                             audiences, and two equal entrances: for a
 *                             person, and for an employer
 *    2. for-dig               Karriär, Jobb, Security Passport and
 *                             Säkerhetsarbete — one card and ONE action each,
 *                             to that part's own page
 *    3. senaste-jobben        real vacancies and "Se alla lediga jobb"
 *    4. for-arbetsgivare      ANNONSERA → TA EMOT OCH HANTERA → BEDÖM →
 *                             INTERVJUA → BESLUTA, benefit first
 *    5. rekryteringstjanster  "Vill ni ha hjälp med hela rekryteringen?"
 *    6. varfor                why CQrityjob, ending in the brand promise
 *                             "Where trust comes first."
 *
 *  This SUPERSEDES the seven-section page of 2026-09-27, which explained
 *  Säkerhetsarbete, the Passport and the career area IN DEPTH on the
 *  homepage, so a visitor who chose one product kept scrolling through the
 *  others. Depth now lives on each product's own page (/career-center,
 *  /jobs, /security-passport, /sakerhetsarbete, /employers), and the
 *  homepage only points the way.
 *
 *  ── WHAT THIS PAGE MAY NOT SAY ─────────────────────────────────────────
 *
 *  * that the career analysis measures competence, or is a test or exam;
 *  * that the Passport is recognised, approved or valid anywhere, or that it
 *    replaces a licence, security vetting or an employer's own checks;
 *  * that CQrityjob or a model decides suitability, hires, rejects or ranks
 *    anybody. Humans make and document every employment decision, and the
 *    employer band ends in that decision;
 *  * that AI is active where it is not — availability is the workspace's to
 *    show;
 *  * a price, a count, a customer or a person that the product cannot back.
 *
 *  ONE conditional band sits between 2 and 3: the Security Passport Network
 *  figures (real, aggregate, database-approved). It renders nothing while the
 *  owner's publication setting is not `public`, so the page above is exactly
 *  the six-section page until the owner chooses otherwise. It is the one
 *  place a count may appear, because the database backs it.
 *
 *  The sections live in components/site/HomeSections.tsx. */

/** The server renders the Swedish page, so the indexed <head> is the Swedish
 *  one; useLocalizedHead() swaps in the English pair on the client. Read from
 *  the dictionary so the visible page and its metadata cannot describe two
 *  different offers. */
const SV = dictionaries.sv;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: SV["meta.home.title"] },
      { name: "description", content: SV["meta.home.description"] },
      { property: "og:title", content: SV["meta.home.title"] },
      { property: "og:description", content: SV["meta.home.description"] },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "CQrityjob",
          slogan: "Where trust comes first.",
          description: SV["brand.description"],
          url: "https://www.cqrityjob.com",
        }),
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useLocalizedHead("meta.home.title", "meta.home.description");
  // A bookmark or an old shared link to a retired section (/#passport,
  // /#security-intelligence …) lands on the page that holds it now.
  useRetiredHomeAnchors();
  // Authenticated visitors land on their personal dashboard. Runs
  // client-side only; SSR still serves the public landing page for crawlers
  // and signed-out users. This is the ONLY redirect implementation on this
  // route, it fires only on a real session, and a session read that fails
  // simply leaves the visitor here rather than bouncing them into a loop.
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) {
        navigate({ to: "/my-career", replace: true });
      }
    });
    return () => {
      alive = false;
    };
  }, [navigate]);

  // Release control, not a security boundary — the employer surfaces
  // re-authorise themselves server-side regardless. With the flag off the
  // employer band explains the platform and links to /employers, and no
  // registration action is drawn at all.
  const employerOpen = employerPortalEnabled();

  return (
    <SiteLayout>
      <HomeHero />
      <HomeForIndividuals />
      {/* Not a seventh section: a quiet proof band that draws NOTHING until the
          owner publishes it (publication setting 'public') and the
          figures exist. */}
      <SecurityPassportNetwork surface="homepage" />
      <HomeLatestJobs />
      <HomeEmployers employerOpen={employerOpen} />
      <HomeRecruitmentServices />
      <HomeWhy />
    </SiteLayout>
  );
}
