// H3.4A — candidate application history (/my-career/applications). New in
// this phase, alongside the submission flow itself (ApplyInternalDialog on
// /jobs/$slug). Reads via listMyApplications (RLS-scoped to the caller's
// own rows) and allows withdrawing an eligible application via
// withdrawMyApplication (now backed by the database-validated,
// atomically-audited set_application_status() RPC).

import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { formatDate } from "@/lib/job-intelligence/date-format";
import { APPLICATION_STATUS_LABEL_KEY } from "@/lib/job-intelligence/application-status-labels";
import { ApplicationPassportShare } from "@/components/jobs/ApplicationPassportShare";
import { MyPreparations } from "@/components/beskt/MyPreparations";
import { ConfirmAction } from "@/components/employer/ConfirmAction";
import { CandidateApplicationInbox } from "@/components/recruitment/CandidateApplicationInbox";
import { listMyRecruitmentInbox } from "@/lib/recruitment/recruitment.functions";
import {
  listMyApplications,
  withdrawMyApplication,
  getApplicationCvSignedUrl,
  type MyApplicationRow,
  type ApplicationStatus,
} from "@/lib/job-intelligence/applications.functions";

export const Route = createFileRoute("/_authenticated/my-career/applications")({
  // `application` names the card to land on: the link in an automatic
  // receipt carries it, and it survives a sign-in redirect where a hash
  // would not.
  validateSearch: (search) =>
    z.object({ application: z.string().uuid().optional().catch(undefined) }).parse(search),
  ssr: false,
  head: () => ({
    meta: [
      { title: "My applications — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MyApplicationsPage,
});

// Moved to a shared module when sketch 3 gave the Jobs workspace a summary
// of these same applications: two copies of this map is how the two
// surfaces start calling the same status different things.
const STATUS_LABEL_KEY = APPLICATION_STATUS_LABEL_KEY;

const WITHDRAWABLE: ApplicationStatus[] = ["submitted", "reviewing", "interview"];

function MyApplicationsPage() {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyApplications);
  const withdrawFn = useServerFn(withdrawMyApplication);
  const signCvFn = useServerFn(getApplicationCvSignedUrl);
  const [actionError, setActionError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<MyApplicationRow | null>(null);
  const inboxFn = useServerFn(listMyRecruitmentInbox);

  const query = useQuery({
    queryKey: ["my-career", "applications"],
    queryFn: () => listFn(),
  });
  // What employers have sent: interview invitations and messages. Its own
  // read, so a failure here costs these cards and not the application list.
  const inboxQuery = useQuery({
    queryKey: ["my-career", "recruitment-inbox"],
    queryFn: () => inboxFn(),
  });
  const inbox = new Map((inboxQuery.data ?? []).map((i) => [i.applicationId, i]));
  const { application: focusId } = Route.useSearch();
  const focusRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focusId && focusRef.current) focusRef.current.scrollIntoView({ block: "start" });
  }, [focusId, query.isSuccess]);

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
    <>
      {/* py-20 md:py-28 is Section's default and is right for a marketing
          page. Inside the My Career shell it put a screen of nothing
          between the section strip and the heading. The Passport shell
          made the same correction when it became a product shell. */}
      <Section className="py-10 md:py-14" containerClassName="max-w-3xl">
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
                  <li
                    key={r.id}
                    id={`application-${r.id}`}
                    ref={r.id === focusId ? focusRef : undefined}
                    className={
                      "rounded-lg border bg-background p-4 " +
                      (r.id === focusId ? "border-accent ring-2 ring-accent/30" : "border-border")
                    }
                  >
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
                      {/* A CQrityjob CV is not a file, so there is nothing to
                          download -- and offering a button that cannot work
                          would be worse than saying plainly which CV went. The
                          document itself lives under Min karriar, where it has
                          always lived. */}
                      {r.cvSource === "cqrityjob_cv" ? (
                        <span className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground">
                          {t("candidate.applications.cv.cqrityjob")}
                        </span>
                      ) : (
                        r.hasCv && (
                          <button
                            type="button"
                            onClick={() => onDownloadCv(r.id)}
                            className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                          >
                            {t("candidate.applications.action.downloadCv")}
                          </button>
                        )
                      )}
                      {WITHDRAWABLE.includes(r.status) && (
                        <button
                          type="button"
                          disabled={withdraw.isPending}
                          onClick={() => setWithdrawing(r)}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                        >
                          {t("candidate.applications.action.withdraw")}
                        </button>
                      )}
                    </div>

                    {/* The Passport decision belongs here, next to the
                        employer it concerns — not in a sharing centre, and
                        never as a link pasted into a cover note. */}
                    <ApplicationPassportShare applicationId={r.id} />

                    <CandidateApplicationInbox
                      item={inbox.get(r.id)}
                      employerName={r.employerName ?? ""}
                      jobTitle={jobTitle}
                      onChanged={() => void inboxQuery.refetch()}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {inboxQuery.isError && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
          >
            {t("rec.inbox.unavailable")}
          </p>
        )}

        {/* Withdrawing ends the application for this employer; it is asked
            once, with what it means, rather than one stray click away. */}
        {withdrawing && (
          <ConfirmAction
            open
            onOpenChange={(o) => !o && setWithdrawing(null)}
            tone="destructive"
            busy={withdraw.isPending}
            title={t("rec.withdraw.title")}
            consequence={t("rec.withdraw.body")}
            confirmLabel={t("candidate.applications.action.withdraw")}
            cancelLabel={t("rec.common.cancel")}
            onConfirm={() => {
              const id = withdrawing.id;
              setWithdrawing(null);
              withdraw.mutate(id);
            }}
          />
        )}

        {/* BESKT preparation — part of the application journey, next to the
            applications it belongs to. It shows a truthful state and a way
            in, and no score, because there is none. */}
        <MyPreparations />
      </Section>
    </>
  );
}
