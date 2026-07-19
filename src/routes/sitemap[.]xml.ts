import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { professions } from "@/lib/career-center";
import { careerAreaLabels } from "@/lib/job-intelligence/career-area-labels";
import { serverPublicClient } from "@/integrations/supabase/public-server";

const BASE_URL = "https://trust-path-recruitment.lovable.app";

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

        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/assessment", changefreq: "monthly", priority: "0.9" },
          { path: "/security-career-assessment", changefreq: "monthly", priority: "0.9" },
          { path: "/career-center", changefreq: "weekly", priority: "0.9" },
          { path: "/career-center/start", changefreq: "monthly", priority: "0.7" },
          { path: "/jobs", changefreq: "daily", priority: "0.9" },
          { path: "/employers", changefreq: "monthly", priority: "0.8" },
          { path: "/about", changefreq: "monthly", priority: "0.6" },
          { path: "/contact", changefreq: "yearly", priority: "0.4" },
          ...professions.map((p) => ({
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
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});