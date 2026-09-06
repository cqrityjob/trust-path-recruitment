// The career home, rendered from fixtures. DEVELOPMENT ONLY.
//
// The guard is `beforeLoad` throwing `notFound()`, the same pattern every
// other development-only route in this repository uses: it refuses at
// routing time, so a production build cannot render this even if something
// later links to it.
//
// The fixtures are the SAME ones the guard script asserts against and the
// browser harness stubs the real route with, so what a reviewer looks at
// here and what CI checks are one account. No authentication, no Supabase
// client, no server function, no network.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { CareerPageHeader } from "@/components/professional-identity/CareerPageHeader";
import { NextBestAction } from "@/components/professional-identity/NextBestAction";
import { PassportSummary } from "@/components/professional-identity/PassportSummary";
import { CareerDirectionSection } from "@/components/professional-identity/CareerDirectionSection";
import { JobRecommendations } from "@/components/professional-identity/JobRecommendations";
import { EmployerProcesses } from "@/components/professional-identity/EmployerProcesses";
import { DevelopmentSection } from "@/components/professional-identity/DevelopmentSection";
import { CareerTools } from "@/components/professional-identity/CareerTools";
import { RecentActivity } from "@/components/professional-identity/RecentActivity";
import { buildCareerHomeViewModel } from "@/lib/professional-identity/home-presentation";
import {
  FIXTURES,
  FIXTURE_NOW,
  fixtureById,
} from "@/lib/professional-identity/fixtures/career-home-fixtures";

const IS_DEV = !!import.meta.env?.DEV;

export const Route = createFileRoute("/dev/career-home")({
  beforeLoad: () => {
    if (!IS_DEV) throw notFound();
  },
  validateSearch: (search: Record<string, unknown>): { fixture?: string } => ({
    fixture: typeof search.fixture === "string" ? search.fixture : undefined,
  }),
  ssr: false,
  head: () => ({
    meta: [{ title: "Career home preview (dev)" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: CareerHomePreview,
});

function CareerHomePreview() {
  const { fixture } = Route.useSearch();
  if (!IS_DEV) return null;
  const chosen = fixtureById(fixture ?? "") ?? FIXTURES[0]!;
  const model = buildCareerHomeViewModel(chosen.input);
  const analysisHref =
    model.career.state === "ready" || model.career.state === "legacy"
      ? model.career.reportHref
      : null;

  return (
    <SiteLayout>
      <Section className="py-8 md:py-10" containerClassName="max-w-[1240px]">
        <p className="mb-6 rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <strong className="font-semibold text-foreground">Fixture: {chosen.id}</strong> —{" "}
          {chosen.description}
        </p>
        <CareerPageHeader profile={model.profile} />
        <div className="mt-8 grid items-stretch gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <NextBestAction next={model.nextAction} />
          </div>
          <div className="lg:col-span-5">
            <PassportSummary passport={model.passport} />
          </div>
        </div>
        <CareerDirectionSection
          career={model.career}
          closed={chosen.input.careerDiscoveryOpen === false}
          className="mt-10"
        />
        <JobRecommendations jobs={model.jobs} analysisHref={analysisHref} className="mt-10" />
        <EmployerProcesses
          applications={model.applications}
          work={model.employerWork}
          className="mt-10"
        />
        <DevelopmentSection work={model.employerWork} className="mt-10" />
        <CareerTools tools={model.tools} className="mt-10" />
        <RecentActivity activity={model.activity} now={FIXTURE_NOW} className="mt-10" />
      </Section>
    </SiteLayout>
  );
}
