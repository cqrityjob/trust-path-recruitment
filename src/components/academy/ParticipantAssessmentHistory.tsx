// #51 — The participant's own "Tester & bedömningar".
//
// The Academy home lists what a person has to DO. This lists what they have
// done, and it is the answer to the question that started this whole workstream:
// "where did the test I completed go?"
//
// It reads scp_my_assessment_history, the same objects the employer sees, with
// two deliberate differences:
//
//   * the vocabulary is the participant's -- "ready to release" is an employer
//     action, and to the person waiting it is "your result is being prepared";
//   * it links ONLY to the participant snapshot. The employer report is a
//     different document for a different audience and is never reachable here.
//
// It spans every organisation that has assessed this person. That breadth is
// theirs: each employer sees only its own context, while the person sees their
// whole professional record.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { History } from "lucide-react";
import { useT } from "@/i18n/context";
import { LifecycleChip } from "@/components/academy/LifecycleChip";
import {
  getMyAssessmentHistory,
  type MyAssessmentRow,
} from "@/lib/security-competency/assessment-lifecycle.functions";

export function ParticipantAssessmentHistory({ lang }: { lang: string }) {
  const { t } = useT();
  const listFn = useServerFn(getMyAssessmentHistory);
  const history = useQuery({
    queryKey: ["academy", "my-assessment-history"],
    queryFn: () => listFn(),
  });

  const rows = (history.data ?? []) as MyAssessmentRow[];
  if (history.isLoading || rows.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">{t("academy.history.heading")}</h2>
      </div>
      <p className="mb-4 max-w-[62ch] text-sm text-muted-foreground">{t("academy.history.lede")}</p>

      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.attemptId}
            className="rounded-[14px] border border-border bg-card p-4 shadow-[var(--shadow-xs)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {(lang === "en" ? r.assessmentNameEn : r.assessmentNameSv) ?? r.assessmentSlug}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.issuerName}
                  {" · "}
                  {t(
                    r.useCase === "recruitment"
                      ? "lifecycle.purpose.recruitment"
                      : "lifecycle.purpose.workforce",
                  )}
                  {r.submittedAt && ` · ${new Date(r.submittedAt).toLocaleDateString()}`}
                </p>
              </div>
              {r.useCase !== "recruitment" &&
              ["under_review", "processing", "ready_to_release", "result_available"].includes(
                r.lifecycleState,
              ) ? (
                <span className="inline-flex shrink-0 items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {t("academy.history.submitted")}
                </span>
              ) : (
                <LifecycleChip state={r.lifecycleState} audience="participant" />
              )}
            </div>

            {/* Recruitment only: workforce participant reports are not available
                in this flow, even if the database has a released snapshot. */}
            {r.useCase === "recruitment" &&
              r.lifecycleState === "result_available" &&
              r.participantSnapshotId && (
                <Link
                  to="/academy/report/$attemptId"
                  params={{ attemptId: r.attemptId }}
                  className="mt-3 inline-flex rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  {t("academy.history.viewResult")}
                </Link>
              )}
          </li>
        ))}
      </ul>
    </section>
  );
}
