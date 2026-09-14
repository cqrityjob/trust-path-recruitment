/**
 * Sketch 3's supporting column: the candidate's own applications, and their
 * CV, beside the job search.
 *
 * ── WHY THIS IS ON /jobs AT ALL ────────────────────────────────────────
 *
 * The navigation already lights "Jobb" when the reader is on
 * /my-career/applications -- the route dispositions put applications in
 * this workspace. But the Jobs page itself offered no way to reach them:
 * the only routes in were the Overview status grid and an email. So the
 * destination claimed a surface it could not reach, and a candidate who
 * wanted to check an application had to go back to Översikt to find it.
 *
 * ── A SUMMARY, NOT A SECOND APPLICATIONS PAGE ──────────────────────────
 *
 * This lists the most recent few and links to /my-career/applications for
 * the rest. It deliberately carries no withdraw control and no CV
 * download: those act on an application and belong with the full row that
 * explains what it is doing, not beside a search field. One writer, one
 * place -- the same rule the Passport/profile split follows.
 *
 * The status labels come from the shared APPLICATION_STATUS_LABEL_KEY, so
 * this panel and the applications page cannot disagree about what a
 * status is called.
 *
 * ── /jobs IS A PUBLIC PAGE ─────────────────────────────────────────────
 *
 * It serves anonymous visitors too, and is deliberately kept publicly
 * cacheable: useCareerProfileForJobs only calls an authenticated server
 * function once it has observed a live session on the client. This column
 * follows the same rule and renders NOTHING until that signal says the
 * reader is signed in -- an anonymous visitor must not be shown an empty
 * "your applications" panel, which reads as "you have none" rather than
 * "this is not for you".
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, ChevronRight } from "lucide-react";
import { useT } from "@/i18n/context";
import { formatDate } from "@/lib/job-intelligence/date-format";
import { listMyApplications } from "@/lib/job-intelligence/applications.functions";
import { APPLICATION_STATUS_LABEL_KEY } from "@/lib/job-intelligence/application-status-labels";

/** How many rows the summary shows before deferring to the full page.
 *  Three is what sketch 3 draws, and enough that "Se alla" is obviously
 *  about more of the same rather than a different feature. */
const SUMMARY_LIMIT = 3;

export function JobsSideColumn({ signedIn }: { signedIn: boolean }) {
  // Not signed in: render nothing at all. See the header note -- an empty
  // panel would be a false statement about this reader's applications.
  if (!signedIn) return null;
  return (
    <aside className="space-y-6" data-jobs-side-column>
      <MyApplicationsSummary />
      <MyCvCard />
    </aside>
  );
}

function MyApplicationsSummary() {
  const { t, lang } = useT();
  const load = useServerFn(listMyApplications);
  const q = useQuery({
    queryKey: ["jobs", "side", "applications"],
    queryFn: () => load(),
  });

  const rows = (q.data ?? []).slice(0, SUMMARY_LIMIT);

  return (
    <section
      className="rounded-lg border border-border bg-background p-5"
      data-jobs-applications-summary
      aria-labelledby="jobs-applications-summary-title"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="jobs-applications-summary-title"
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          {t("jobs.side.applications.title")}
        </h2>
        <Link
          to="/my-career/applications"
          data-cta="jobs-applications-all"
          className="shrink-0 text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("jobs.side.applications.seeAll")}
        </Link>
      </div>

      {/* A failed read is reported as a failed read. Rendering the empty
          state here would tell somebody with applications that they have
          none -- the same untruth this codebase already refuses on the
          Overview's verification state. */}
      {q.isError ? (
        <p className="mt-4 text-sm text-muted-foreground" data-jobs-applications-error>
          {t("candidate.applications.error.load")}
        </p>
      ) : q.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {t("candidate.applications.loading")}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground" data-jobs-applications-empty>
          {t("candidate.applications.empty")}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {rows.map((r) => {
            const title =
              (lang === "sv" ? r.jobTitleSv : r.jobTitleEn) ?? r.jobTitleSv ?? r.jobTitleEn ?? "";
            // The row links to the JOB, which is the thing it names. An
            // application has no page of its own; the full list is one
            // click away under "Se alla".
            const body = (
              <>
                <span className="block font-medium text-foreground">{title}</span>
                {r.employerName ? (
                  <span className="block text-sm text-muted-foreground">{r.employerName}</span>
                ) : null}
                <span className="block text-xs text-muted-foreground">
                  {t("jobs.side.applications.sent")} {formatDate(r.createdAt, lang)}
                </span>
              </>
            );
            return (
              <li key={r.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  {r.jobSlug ? (
                    <Link
                      to="/jobs/$slug"
                      params={{ slug: r.jobSlug }}
                      className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </div>
                <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                  {t(APPLICATION_STATUS_LABEL_KEY[r.status])}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MyCvCard() {
  const { t } = useT();
  return (
    <Link
      to="/my-career/cv"
      data-cta="jobs-my-cv"
      className="flex items-center gap-4 rounded-lg border border-border bg-background p-5 transition hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <FileText className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.5} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{t("jobs.side.cv.title")}</span>
        <span className="block text-sm text-muted-foreground">{t("jobs.side.cv.body")}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
