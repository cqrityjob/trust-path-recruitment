import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ArrowRight, Briefcase } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";
import { jobsEnabled } from "@/lib/job-intelligence/feature-flag";

export const Route = createFileRoute("/jobs")({
  head: () => ({
    meta: [
      // The section's defaults; the list and every ad set their own.
      { title: dictionaries.sv["meta.jobs.title"] },
      { name: "description", content: dictionaries.sv["jobs.discover.lead"] },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    // canonical + og:url are set on leaf routes (jobs.index, jobs.$slug,
    // jobs.family.$familyId, jobs.profession.$professionSlug) to avoid the
    // duplicate-canonical issue caused by non-deduped `links` merging.
  }),
  component: JobsLayout,
});

function JobsLayout() {
  // Release-control flag: while off, always show the coming-soon page.
  // Not a security boundary — RLS still gates all data server-side.
  if (!jobsEnabled()) return <ComingSoonPage />;
  return <Outlet />;
}

function ComingSoonPage() {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section>
        <div className="max-w-3xl">
          <h1
            className="text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("jobs.title")}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{t("jobs.lead")}</p>
        </div>
        <div className="mt-16 rounded-lg border border-border bg-background p-10 md:p-14">
          <Briefcase className="h-6 w-6 text-accent" strokeWidth={1.5} />
          <p className="mt-6 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("status.coming_soon")}
          </p>
          <h2
            className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("jobs.coming_soon.title")}
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">{t("jobs.coming_soon.body")}</p>
          <div className="mt-8">
            {/* No "notify me at launch": nothing records such a request, and
                the contact page does not accept messages (MVP text
                specification §12.4). The Career Center is open meanwhile. */}
            <PrimaryLink to="/career-center">
              {t("nav.exploreProfessions")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryLink>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}
