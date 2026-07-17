import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { professions } from "@/lib/career-center";
import { careerAreaLabels } from "@/lib/job-intelligence/career-area-labels";

const BASE_URL = "https://trust-path-recruitment.lovable.app";

interface SitemapEntry {
  path: string;
  changefreq?: "daily" | "weekly" | "monthly" | "yearly";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
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
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
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