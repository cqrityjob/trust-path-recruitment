// The recruitment step, inside the application it belongs to.
//
// ── WHY IT LIVES HERE ───────────────────────────────────────────────────
//
// The employer already knows who this person is: they applied. Sending them an
// assessment should therefore not begin by asking for their email address —
// retyping it is not merely tedious, it is the moment a typo creates a second
// person and the result attaches to nobody. So this panel passes the
// APPLICATION, and the database resolves the candidate from it and refuses if
// the applicant and the recipient are not the same human.
//
// ── WHAT IT SHOWS AFTERWARDS ────────────────────────────────────────────
//
// The same panel is the way back: once an assessment exists it shows where the
// run has got to, and once a report is released it links to it. That is the
// Job -> Application -> Candidate -> Assessment -> Report chain, rendered as
// one place rather than as a trail the recruiter has to remember.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ClipboardCheck, FileText, Send } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  assignFromApplication,
  listApplicationAssessments,
  listContentLibrary,
  type ApplicationAssessment,
} from "@/lib/security-competency/academy-employer.functions";

/** The five states an employer needs to tell apart, derived from the attempt
 *  rather than stored: a status column that can disagree with the attempt is a
 *  status column that eventually does. */
function stageOf(a: ApplicationAssessment): TranslationKey {
  if (a.reportAvailable) return "journey.stage.report_available";
  if (a.attemptStatus === "scored") return "journey.stage.ready_to_release";
  if (a.reviewsOutstanding > 0) return "journey.stage.under_review";
  if (a.answered > 0) return "journey.stage.started";
  return "journey.stage.invited";
}

export function ApplicationAssessmentPanel({
  employerId,
  employerSlug,
  applicationId,
  canAssign,
}: {
  employerId: string;
  employerSlug: string;
  applicationId: string;
  canAssign: boolean;
}) {
  const { t, lang } = useT();
  const sv = lang !== "en";
  const qc = useQueryClient();
  const listFn = useServerFn(listApplicationAssessments);
  const libraryFn = useServerFn(listContentLibrary);
  const assignFn = useServerFn(assignFromApplication);

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const assessments = useQuery({
    queryKey: ["employer", employerId, "application", applicationId, "assessments"],
    queryFn: () => listFn({ data: { applicationId } }),
  });

  // Only assessments WRITTEN for recruitment, and only ones this organisation
  // may actually run. Offering anything else here would be offering a control
  // the assign path would refuse.
  const library = useQuery({
    queryKey: ["employer", employerId, "library", "recruitment"],
    queryFn: () => libraryFn({ data: { employerId } }),
    select: (rows) =>
      rows.filter(
        (r) =>
          r.libraryKind === "assessment" && r.designedFor === "recruitment_support" && r.assignable,
      ),
  });

  async function assign(assessmentVersionId: string) {
    setBusy(true);
    setFailed(null);
    try {
      // No address is passed, and none is held by this surface: the database
      // resolves the candidate from the application itself.
      await assignFn({ data: { employerId, applicationId, assessmentVersionId } });
      await qc.invalidateQueries({
        queryKey: ["employer", employerId, "application", applicationId, "assessments"],
      });
    } catch (e) {
      setFailed((e as { code?: string }).code ?? "assign_failed");
    } finally {
      setBusy(false);
    }
  }

  const rows = assessments.data ?? [];
  const options = library.data ?? [];

  if (rows.length === 0 && options.length === 0) return null;

  return (
    <div className="mt-3 rounded-[10px] border border-border bg-[color:var(--surface-subtle)] p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-accent">
        <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {t("journey.assessment")}
      </p>

      {rows.length > 0 ? (
        <ul className="mt-2.5 space-y-2">
          {rows.map((a) => (
            <li key={a.attemptId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-[13px] font-medium text-foreground">
                {sv ? a.nameSv : a.nameEn}
              </span>
              <span className="inline-flex rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground">
                {t(stageOf(a))}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {a.answered}/{a.totalItems}
              </span>
              {a.governanceMode === "closed_test" && (
                <span className="text-xs text-muted-foreground">{t("journey.closedTest")}</span>
              )}
              {a.reportAvailable && (
                <Link
                  to="/employer/$employerSlug/assessments/results/$attemptId"
                  params={{ employerSlug, attemptId: a.attemptId }}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("journey.openBrief")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-muted-foreground">{t("journey.noAssessmentYet")}</p>
      )}

      {canAssign && options.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {options.map((o) => (
            <button
              key={o.itemId}
              type="button"
              disabled={busy}
              onClick={() => void assign(o.itemId)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-accent/50 px-3 text-[13px] font-medium text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {busy ? t("journey.sending") : t("journey.sendAssessment")}
              <span className="text-muted-foreground">· {sv ? o.nameSv : o.nameEn}</span>
            </button>
          ))}
        </div>
      )}

      {failed && (
        <p role="alert" className="mt-2 text-[13px] text-foreground">
          {t("journey.assignFailed")}
        </p>
      )}
    </div>
  );
}
