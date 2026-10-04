import { Mail } from "lucide-react";
import { useT } from "@/i18n/context";
import type { PublicJobDetail } from "@/lib/job-intelligence/public-queries";
import { formatJobDate as formatDate } from "./JobAdContent";
import { Button } from "@/components/ui/button";
import { ExternalApplyDialog } from "./ExternalApplyDialog";
import { ApplyInternalDialog } from "./ApplyInternalDialog";
import { safeApplicationHref } from "@/lib/job-intelligence/application-url";

export function JobApplicationPanel({
  job,
  expired,
  returnTo,
}: {
  job: PublicJobDetail;
  expired: boolean;
  /** Where signing in to apply comes back to: this ad, with its search. */
  returnTo: string;
}) {
  const { t, lang } = useT();
  // A web address or nothing: a row stored before the address rule existed
  // (20270131090000) can hold `javascript:` or another scheme, and an anchor
  // must never be built from it. Such an ad reads as "apply unavailable".
  const externalUrl = safeApplicationHref(job.application_url);

  const applyBlock = () => {
    if (expired) {
      return (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-semibold text-destructive">{t("jobs.detail.expired.title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("jobs.detail.expired.body")}</p>
        </div>
      );
    }
    if (job.application_method === "internal") {
      return (
        <ApplyInternalDialog
          key={job.id}
          jobId={job.id}
          jobTitle={
            (lang === "en" ? job.title_en || job.title_sv : job.title_sv || job.title_en) ??
            t("jobs.detail.titleFallback")
          }
          employerName={job.employer?.name ?? null}
          label={t("jobs.detail.apply_internal")}
          returnTo={returnTo}
        />
      );
    }
    if (job.application_method === "external" && externalUrl) {
      return (
        <ExternalApplyDialog
          url={externalUrl}
          employerName={job.employer?.name ?? null}
          label={t("jobs.detail.apply_external")}
        />
      );
    }
    if (job.application_method === "email" && job.application_email) {
      return (
        <Button asChild className="w-full">
          <a href={`mailto:${job.application_email}`}>
            {t("jobs.detail.apply_email")}
            <Mail className="ml-2 h-4 w-4" aria-hidden="true" />
          </a>
        </Button>
      );
    }
    return <p className="text-sm text-muted-foreground">{t("jobs.detail.apply_unavailable")}</p>;
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 sm:max-w-sm sm:flex-1">{applyBlock()}</div>

      {job.deadline_at && (
        <div className="shrink-0 text-sm">
          <p className="text-xs text-muted-foreground">{t("jobs.detail.deadline")}</p>
          <p className="mt-0.5 font-medium">{formatDate(job.deadline_at, lang)}</p>
        </div>
      )}
    </div>
  );
}
