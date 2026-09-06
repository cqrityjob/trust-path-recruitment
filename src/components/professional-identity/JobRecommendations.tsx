// Open roles — from the filter this product actually has, and said as such.
//
// There is no personal job-matching algorithm here and this section does
// not imply one. The filter is the career FAMILY the career analysis
// wrote; when a person has no analysis there is no filter, and the newest
// vacancies are shown under a sentence that says exactly that. Six states,
// each with its own sentence: loading, unavailable, filtered, filtered but
// empty, general, general but empty. A failed read is never "no jobs".

import { Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, MapPin } from "lucide-react";
import { useT } from "@/i18n/context";
import type { JobSummary, JobsModel } from "@/lib/professional-identity/home-presentation";
import { L, type Lang } from "./copy";
import { JOBS } from "./home-copy";
import { Failed, Group, Loading } from "./home-primitives";
import { LINK } from "./home-format";

function JobRows({ jobs }: { jobs: readonly JobSummary[] }) {
  const { lang } = useT();
  const l = lang as Lang;
  return (
    <ul className="mt-3 divide-y divide-border border-t border-border">
      {jobs.map((j) => (
        <li key={j.id}>
          <Link
            to="/jobs/$slug"
            params={{ slug: j.slug }}
            data-job-row
            className="group flex min-h-11 flex-col justify-center py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-sm font-medium text-balance text-foreground group-hover:underline">
              {(l === "sv" ? j.titleSv : j.titleEn) || j.titleEn || j.titleSv || ""}
            </span>
            {(j.employerName || j.location) && (
              <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                {j.location && <MapPin className="h-3 w-3" aria-hidden="true" />}
                {[j.employerName, j.location].filter(Boolean).join(" · ")}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function JobRecommendations({
  jobs,
  /** Where the filter came from, so the empty state can link to it. */
  analysisHref,
  onRetry,
  className,
}: {
  jobs: JobsModel;
  analysisHref: string | null;
  onRetry?: () => void;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  const all = (
    <Link to="/jobs" className={LINK}>
      {L(JOBS.all, l)}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );

  return (
    <Group
      id="jobs"
      title={L(JOBS.heading, l)}
      icon={<Briefcase className="h-5 w-5" />}
      className={className}
      data-job-recommendations=""
      data-jobs-state={jobs.state}
    >
      {jobs.state === "loading" ? (
        <Loading label={L(JOBS.loading, l)} className="mt-4" />
      ) : jobs.state === "unavailable" ? (
        <Failed
          message={L(JOBS.unavailable, l)}
          onRetry={onRetry}
          href="/jobs"
          hrefLabel={L(JOBS.all, l)}
          className="mt-3"
        />
      ) : jobs.state === "filtered" ? (
        <>
          <p className="mt-1 max-w-[60ch] text-xs text-muted-foreground">
            {L(JOBS.basisAnalysis, l)}
          </p>
          <JobRows jobs={jobs.jobs} />
          <div className="mt-3">{all}</div>
        </>
      ) : jobs.state === "filtered_empty" ? (
        <div data-jobs-empty>
          <p className="mt-3 text-base font-semibold text-balance text-foreground">
            {L(JOBS.filteredEmptyTitle, l)}
          </p>
          <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
            {L(JOBS.filteredEmptyBody, l)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            {all}
            {analysisHref && (
              <Link to={analysisHref} className={LINK}>
                {L(JOBS.seeAnalysis, l)}
              </Link>
            )}
          </div>
        </div>
      ) : jobs.state === "general" ? (
        <>
          <p className="mt-1 max-w-[60ch] text-xs text-muted-foreground">
            {L(JOBS.general, l)} {L(JOBS.generalHint, l)}
          </p>
          <JobRows jobs={jobs.jobs} />
          <div className="mt-3">{all}</div>
        </>
      ) : (
        <div data-jobs-empty className="mt-3">
          <p className="max-w-[60ch] text-sm text-muted-foreground">{L(JOBS.general, l)}</p>
          <div className="mt-2">{all}</div>
        </div>
      )}
    </Group>
  );
}
