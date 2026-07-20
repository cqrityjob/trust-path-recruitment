// H3.4A — candidate application history (/my-career/applications). New in
// this phase, alongside the submission flow itself (ApplyInternalDialog on
// /jobs/$slug). Reads via listMyApplications (RLS-scoped to the caller's
// own rows) and allows withdrawing an eligible application via
// withdrawMyApplication (now backed by the database-validated,
// atomically-audited set_application_status() RPC).

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { formatDate } from "@/lib/job-intelligence/date-format";
import {
  listMyApplications,
  withdrawMyApplication,
  getApplicationCvSignedUrl,
  type MyApplicationRow,
  type ApplicationStatus,
} from "@/lib/job-intelligence/applications.functions";

export const Route = createFileRoute("/_authenticated/my-career/applications")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My applications — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MyApplicationsPage,
});

const STATUS_LABEL_KEY: Record<ApplicationStatus, TranslationKey> = {
  submitted: "candidate.applications.status.submitted",
  reviewing: "candidate.applications.status.reviewing",
  interview: "candidate.applications.status.interview",
  rejected: "candidate.applications.status.rejected",
  hired: "candidate.applications.status.hired",
  withdrawn: "candidate.applications.status.withdrawn",
};

const WITHDRAWABLE: ApplicationStatus[] = ["submitted", "reviewing", "interview"];

function MyApplicationsPage() {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyApplications);
  const withdrawFn = useServerFn(withdrawMyApplication);
  const signCvFn = useServerFn(getApplicationCvSignedUrl);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["my-career", "applications"],
    queryFn: () => listFn(),
  });

  const withdraw = useMutation({
    mutationFn: (applicationId: string) => withdrawFn({ data: { applicationId } }),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ["my-career", "applications"] });
    },
    onError: () => setActionError(t("candidate.applications.error.withdraw")),
  });

  async function onDownloadCv(applicationId: string) {
    setActionError(null);
    try {
      const result = await signCvFn({ data: { applicationId } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      setActionError(t("candidate.applications.error.cvDownload"));
    }
  }

  const rows: MyApplicationRow[] = query.data ?? [];

  return (
    <SiteLayout>
      <Section containerClassName="max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            {t("candidate.applications.heading")}
          </h1>
          <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
            {t("candidate.applications.backToMyCareer")}
          </Link>
        </div>

        {actionError && (
          <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {actionError}
          </div>
        )}

        <div className="mt-6">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("candidate.applications.loading")}</p>
          ) : query.isError ? (
            <p className="text-sm text-destructive">{t("candidate.applications.error.load")}</p>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              {t("candidate.applications.empty")}
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => {
                const jobTitle =
                  (lang === "sv" ? r.jobTitleSv : r.jobTitleEn) ||
                  r.jobTitleSv ||
                  r.jobTitleEn ||
                  "—";
                return (
                  <li key={r.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        {r.jobSlug ? (
                          <Link
                            to="/jobs/$slug"
                            params={{ slug: r.jobSlug }}
                            className="text-sm font-medium text-foreground hover:underline"
                          >
                            {jobTitle}
                          </Link>
                        ) : (
                          <p className="text-sm font-medium text-foreground">{jobTitle}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {r.employerName ?? "—"} · {formatDate(r.createdAt, lang)}
                        </p>
                      </div>
                      <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium">
                        {t(STATUS_LABEL_KEY[r.status])}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.hasCv && (
                        <button
                          type="button"
                          onClick={() => onDownloadCv(r.id)}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                        >
                          {t("candidate.applications.action.downloadCv")}
                        </button>
                      )}
                      {WITHDRAWABLE.includes(r.status) && (
                        <button
                          type="button"
                          disabled={withdraw.isPending}
                          onClick={() => withdraw.mutate(r.id)}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                        >
                          {t("candidate.applications.action.withdraw")}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>
    </SiteLayout>
  );
}
