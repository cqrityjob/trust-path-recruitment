import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { professions } from "@/lib/career-center";
import { publishedProfessions } from "@/lib/career-center/publishability";
import { careerAreaLabels } from "@/lib/job-intelligence/career-area-labels";
import { serverPublicClient } from "@/integrations/supabase/public-server";
import { analysisIndexable } from "@/lib/career-discovery/analysis-access";
import { CANONICAL_ASSESSMENT_PATH } from "@/lib/career-discovery/routes";
import { getV31Availability } from "@/lib/career-discovery/v31-public.functions";
import { PRODUCTION_ORIGIN } from "@/lib/site-origin";

const BASE_URL = PRODUCTION_ORIGIN;

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "daily" | "weekly" | "monthly" | "yearly";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // H2: pull active job slugs from the DB so every published job is
        // individually discoverable. Anon RLS on `jobs` restricts this to
        // rows currently visible to the public.
        let jobRows: Array<{ slug: string; published_at: string | null }> = [];
        try {
          const supa = serverPublicClient();
          const { data } = await supa
            .from("jobs")
            .select("slug, published_at")
            .eq("status", "published")
            .order("published_at", { ascending: false })
            .limit(5000);
          jobRows = (data ?? []) as Array<{ slug: string; published_at: string | null }>;
        } catch {
          jobRows = [];
        }

        // The career analysis is listed ONLY while the release control says
        // `public` — the same answer that decides the route's own robots rule
        // (src/routes/security-career-assessment.tsx), read per request. Any
        // failure, a timeout included, leaves it out: a sitemap never invites
        // a crawler to a page that is noindex or closed.
        let analysisListed = false;
        {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const answer = await Promise.race([
              getV31Availability(),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("timeout")), 2_000);
              }),
            ]);
            analysisListed = analysisIndexable(answer);
          } catch {
            analysisListed = false;
          } finally {
            if (timer) clearTimeout(timer);
          }
        }

        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/assessment", changefreq: "monthly", priority: "0.9" },
          // A sitemap invites a crawler to index. It lists only pages that may
          // be indexed: /security-career-assessment only while it is public
          // (below), and NOT /career-center/start (a redirect to
          // /career-center). The guard is scripts/site-origin-check.ts, which
          // reads each route.
          { path: "/career-center", changefreq: "weekly", priority: "0.9" },
          { path: "/jobs", changefreq: "daily", priority: "0.9" },
          { path: "/employers", changefreq: "monthly", priority: "0.8" },
          { path: "/security-passport", changefreq: "monthly", priority: "0.8" },
          { path: "/sakerhetsarbete", changefreq: "monthly", priority: "0.8" },
          { path: "/security-passport/india", changefreq: "monthly", priority: "0.8" },
          { path: "/plattformen", changefreq: "monthly", priority: "0.7" },
          { path: "/about", changefreq: "monthly", priority: "0.6" },
          { path: "/contact", changefreq: "yearly", priority: "0.4" },
          // The career analysis follows the release control (see above).
          ...(analysisListed
            ? [{ path: CANONICAL_ASSESSMENT_PATH, changefreq: "monthly" as const, priority: "0.8" }]
            : []),
          // Published guides only: an unpublished profession either redirects
          // to its catalogue page or renders a noindex "not published yet" page.
          ...publishedProfessions.map((p) => ({
            path: `/career-center/${p.slug}`,
            changefreq: "monthly" as const,
            priority: p.status === "researched" ? "0.7" : "0.5",
          })),
          // Jobs discovery — career-area landing pages
          ...careerAreaLabels.map((a) => ({
            path: `/jobs/family/${a.id}`,
            changefreq: "daily" as const,
            priority: "0.7",
          })),
          // Jobs discovery — profession landing pages (researched roles only)
          ...professions
            .filter((p) => p.status === "researched")
            .map((p) => ({
              path: `/jobs/profession/${p.slug}`,
              changefreq: "daily" as const,
              priority: "0.6",
            })),
          // Individual published jobs
          ...jobRows.map((j) => ({
            path: `/jobs/${j.slug}`,
            changefreq: "daily" as const,
            priority: "0.6",
            lastmod: j.published_at
              ? new Date(j.published_at).toISOString().slice(0, 10)
              : undefined,
          })),
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            // Ten minutes, not an hour: the analysis's membership follows the
            // release control, and a pause should leave the list promptly.
            "Cache-Control": "public, max-age=600",
          },
        });
      },
    },
  },
});
