// The candidate's way IN to the Assessment Center.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────
//
// An employer assigns a programme, a row appears in scp_attempts, and the
// candidate is told nothing. /academy was reachable only by typing the URL:
// nothing in the header, the dashboard or any email linked to it. The whole
// participant half of the journey was complete and undiscoverable.
//
// This card is the missing link, and it appears ONLY when the person actually
// has Academy work. A permanent "Assessment Center" entry for every candidate
// would be a dead end for the overwhelming majority who have never been
// assigned anything -- and a dead end on a career dashboard reads as a broken
// product, not an empty one.
//
// It deliberately says who asked and what state the work is in, because
// "you have been assessed by someone" is not information a person should have
// to click through to discover.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, FileText, GraduationCap } from "lucide-react";
import { useT } from "@/i18n/context";
import { listMyAcademyWork } from "@/lib/security-competency/academy-learning.functions";

export function MyAcademyWorkCard() {
  const { t, lang } = useT();
  const listWork = useServerFn(listMyAcademyWork);

  const work = useQuery({
    queryKey: ["academy", "my-work"],
    queryFn: () => listWork(),
    // A failure here must not break the career dashboard, which is a page
    // about something else entirely. The card simply does not appear.
    retry: false,
  });

  const rows = work.data ?? [];
  const assessments = rows.filter((r) => r.mode === "assessment");

  // Nothing assigned, still loading, or the Academy backend is not migrated
  // yet -- in all three cases the right answer is to render nothing.
  if (assessments.length === 0) return null;

  const outstanding = assessments.filter((a) => a.attemptStatus === "in_progress");
  const released = assessments.filter((a) => a.releasedAt);

  return (
    <section className="mt-8 rounded-[14px] border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <ClipboardCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            {t("academy.myWork.title")}
          </h2>
          <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.myWork.lede")}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {assessments.slice(0, 3).map((a) => {
          const name = (lang === "en" ? a.programmeNameEn : a.programmeNameSv) ?? "—";
          return (
            <li
              key={a.attemptId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{name}</p>
                {a.employerName && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("academy.home.requestedBy")} {a.employerName}
                  </p>
                )}
              </div>
              {a.releasedAt ? (
                <Link
                  to="/academy/report/$attemptId"
                  params={{ attemptId: a.attemptId }}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] border border-border px-3 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("academy.home.openReport")}
                </Link>
              ) : a.attemptStatus === "in_progress" ? (
                <Link
                  to="/academy/$attemptId"
                  params={{ attemptId: a.attemptId }}
                  className="inline-flex h-9 shrink-0 items-center rounded-[8px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {a.answered > 0 ? t("academy.resume") : t("academy.start")}
                </Link>
              ) : (
                <span className="shrink-0 text-[13px] text-muted-foreground">
                  {t("academy.home.awaitingRelease")}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          to="/academy"
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-4 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <GraduationCap className="h-4 w-4" aria-hidden="true" />
          {t("academy.myWork.openCenter")}
        </Link>
        <p className="text-xs text-muted-foreground">
          {outstanding.length > 0
            ? `${outstanding.length} ${t("academy.myWork.outstanding")}`
            : released.length > 0
              ? `${released.length} ${t("academy.myWork.released")}`
              : null}
        </p>
      </div>
    </section>
  );
}
