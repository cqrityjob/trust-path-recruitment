import { useT } from "@/i18n/context";
import { JobCard } from "./JobCard";
import type { PublicJobCard } from "@/lib/job-intelligence/public-queries";

export function JobResults({
  jobs,
  isLoading,
  isError,
  lang,
}: {
  jobs: PublicJobCard[] | undefined;
  isLoading: boolean;
  isError: boolean;
  lang: "sv" | "en";
}) {
  const { t } = useT();

  if (isLoading) {
    return (
      <div
        className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy="true"
        aria-label={t("jobs.results.loading")}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-lg border border-border bg-muted/40"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="mt-8 rounded-lg border border-destructive/40 bg-destructive/5 p-6"
        role="alert"
      >
        <h2 className="text-lg font-semibold">{t("jobs.results.error.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("jobs.results.error.body")}
        </p>
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-border bg-muted/20 p-8 text-center">
        <h2 className="text-lg font-semibold">{t("jobs.results.empty.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("jobs.results.empty.body")}
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
        {(jobs.length === 1
          ? t("jobs.results.count_one")
          : t("jobs.results.count_other")
        ).replace("{n}", String(jobs.length))}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} lang={lang} />
        ))}
      </div>
    </>
  );
}