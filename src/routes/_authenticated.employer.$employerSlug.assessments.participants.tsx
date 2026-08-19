// Participants — status, progress, release, identity and reassessment.
//
// ── EVERY ROW IS PSEUDONYMOUS UNTIL ASKED OTHERWISE ───────────────────
//
// The list is built from subject ids. Nobody's name or address appears until an
// owner or admin explicitly asks for one specific participant, one at a time,
// and the server agrees — which it only does once a result has been released.
//
// That is why there is a "Show who this is" control rather than an email
// column. An email column would have to resolve every row on load, which is
// exactly the bulk disclosure the architecture refuses.

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, CalendarClock, Eye, FileText, Send } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyHeading, AcademyPage } from "@/components/academy/AcademyWorkspace";
import { AcademyQueryState } from "@/components/academy/AcademyQueryState";
import {
  cancelAcademyAssignment,
  listAcademyParticipants,
  listTrainingStatus,
  type TrainingStatusRow,
  releaseAcademyReport,
  resolveParticipantIdentity,
  listAvailablePurposeCodes,
  scheduleAcademyReassessment,
  type ParticipantRow,
} from "@/lib/security-competency/academy-employer.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/participants",
)({
  ssr: false,
  component: ParticipantsRoute,
  errorComponent: EmployerErrorState,
});

function ParticipantsRoute() {
  const { employerSlug } = Route.useParams();
  return (
    <AcademyPage employerSlug={employerSlug}>
      {(ws) => (
        <Participants
          employerId={ws.employerId}
          employerSlug={ws.employerSlug}
          canManage={ws.role !== "member"}
        />
      )}
    </AcademyPage>
  );
}

function Participants({
  employerId,
  employerSlug,
  canManage,
}: {
  employerId: string;
  employerSlug: string;
  canManage: boolean;
}) {
  const { t, lang } = useT();
  const list = useServerFn(listAcademyParticipants);
  const trainingFn = useServerFn(listTrainingStatus);
  const query = useQuery({
    queryKey: ["academy", "participants", employerId],
    queryFn: () => list({ data: { employerId } }),
  });
  const training = useQuery({
    queryKey: ["academy", "training-status", employerId],
    queryFn: () => trainingFn({ data: { employerId } }),
  });

  return (
    <>
      <AcademyHeading
        title={t("academy.participants.title")}
        lede={t("academy.participants.lede")}
      />

      {/* Training progress sits alongside assessment participation rather than
          on its own page: an employer asking "how is this person doing?" means
          both, and two separate screens would make them reconcile it by hand.
          Status and module counts only -- the answers a participant gives in a
          development activity are theirs. */}
      {(training.data ?? []).length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-foreground">
            {t("employer.training.statusHeading")}
          </h2>
          <p className="mb-3 mt-1 max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">
            {t("employer.training.statusLede")}
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-card">
            {(training.data ?? []).map((r) => (
              <TrainingStatusItem key={r.assignmentId} row={r} lang={lang} />
            ))}
          </ul>
        </section>
      )}

      <AcademyQueryState
        query={query}
        surface="assessments/participants"
        isEmpty={(rows) => rows.length === 0}
        emptyTitle={t("academy.participants.emptyTitle")}
        emptyBody={t("academy.participants.emptyBody")}
        // The empty state already told people to go to the library. Now it
        // takes them there.
        emptyAction={
          <Link
            to="/employer/$employerSlug/assessments/library"
            params={{ employerSlug }}
            className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("academy.overview.openLibrary")}
          </Link>
        }
      >
        {(rows) => (
          <div className="space-y-3">
            {rows.map((p) => (
              <ParticipantCard
                key={p.attemptId}
                row={p}
                employerId={employerId}
                employerSlug={employerSlug}
                canManage={canManage}
              />
            ))}
          </div>
        )}
      </AcademyQueryState>
    </>
  );
}

function ParticipantCard({
  row,
  employerId,
  employerSlug,
  canManage,
}: {
  row: ParticipantRow;
  employerId: string;
  employerSlug: string;
  canManage: boolean;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const resolve = useServerFn(resolveParticipantIdentity);
  const release = useServerFn(releaseAcademyReport);
  const reassess = useServerFn(scheduleAcademyReassessment);
  // Reassessment resolves the `reassessment` processing purpose, which has no
  // approved published version yet. Asking first means the control can say so
  // instead of failing on click.
  const purposesFn = useServerFn(listAvailablePurposeCodes);
  const purposes = useQuery({
    queryKey: ["academy", "purposes"],
    queryFn: () => purposesFn(),
    staleTime: 5 * 60 * 1000,
  });
  const reassessmentAvailable = (purposes.data ?? []).includes("reassessment");
  const cancelAssignment = useServerFn(cancelAcademyAssignment);
  const [identity, setIdentity] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const programme = (lang === "en" ? row.programmeNameEn : row.programmeNameSv) ?? "—";

  const identityM = useMutation({
    mutationFn: () => resolve({ data: { employerId, subjectId: row.subjectId } }),
    onSuccess: (r) => setIdentity(r?.email ?? t("academy.participants.identityRefused")),
  });

  const releaseM = useMutation({
    mutationFn: () => release({ data: { attemptId: row.attemptId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["academy", "participants"] }),
    onError: (e: unknown) => {
      const code = (e as { code?: string }).code ?? "";
      setNotice(
        code === "SCP_RELEASE_BEFORE_SCORED"
          ? t("academy.participants.releaseBlocked")
          : t("academy.participants.releaseFailed"),
      );
    },
  });

  // Withdrawing an assignment nobody has finished.
  //
  // Offered only while the attempt is still in progress, which is the same
  // condition scp_sync_assignment_terminal_status enforces — a submitted,
  // scored or released attempt is completed work and the database refuses to
  // let it be cancelled. Showing the control there and letting the refusal
  // arrive after the click would read as a bug rather than as a rule.
  const cancelM = useMutation({
    mutationFn: () =>
      cancelAssignment({ data: { employerId, assignmentId: row.assignmentId as string } }),
    onSuccess: () => {
      setConfirmCancel(false);
      setNotice(t("academy.participants.cancelDone"));
      void qc.invalidateQueries({ queryKey: ["academy", "participants"] });
      void qc.invalidateQueries({ queryKey: ["academy", "review-pressure"] });
    },
    onError: (e: unknown) => {
      setConfirmCancel(false);
      const code = (e as { code?: string }).code ?? "";
      setNotice(
        code === "SCP_ASSIGNMENT_NOT_CANCELLABLE"
          ? t("academy.participants.cancelNotAllowed")
          : t("academy.participants.cancelFailed"),
      );
    },
  });

  const reassessM = useMutation({
    mutationFn: () => reassess({ data: { employerId, subjectId: row.subjectId, deadline: null } }),
    onSuccess: () => {
      setNotice(t("academy.participants.reassessmentScheduled"));
      void qc.invalidateQueries({ queryKey: ["academy", "participants"] });
    },
    onError: (e: unknown) => {
      const code = (e as { code?: string }).code ?? "";
      setNotice(
        code === "SCP_PURPOSE_NOT_AVAILABLE"
          ? t("academy.participants.reassessmentPurposePending")
          : t("academy.participants.reassessmentFailed"),
      );
    },
  });

  return (
    <article className="rounded-[14px] border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{programme}</h2>
          {/* The pseudonymous reference is shown deliberately: it is what the
              employer actually holds, and naming it makes the model visible
              rather than pretending a person is missing. */}
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {t("academy.participants.subject")} {row.subjectId.slice(0, 8)}
          </p>
        </div>
        <StatusPill status={row.attemptStatus} />
      </div>

      <div className="mt-4 grid gap-3 text-[13px] sm:grid-cols-4">
        <Fact label={t("academy.participants.progress")}>
          <span className="tabular-nums">
            {row.answered}/{row.totalItems}
          </span>
        </Fact>
        <Fact label={t("academy.participants.awaitingReview")}>
          <span className="tabular-nums">{row.reviewsOutstanding}</span>
        </Fact>
        <Fact label={t("academy.participants.deadline")}>
          {row.deadline
            ? new Date(row.deadline).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE")
            : "—"}
        </Fact>
        <Fact label={t("academy.participants.released")}>
          {row.releasedAt
            ? new Date(row.releasedAt).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE")
            : "—"}
        </Fact>
      </div>

      {identity && (
        <p className="mt-4 rounded-[10px] bg-[color:var(--surface-subtle)] px-3 py-2 text-[13px] text-foreground">
          {identity}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 text-[13px] leading-relaxed text-foreground">
          {notice}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {row.releasedAt && (
          <Link
            to="/employer/$employerSlug/assessments/results/$attemptId"
            params={{ employerSlug, attemptId: row.attemptId }}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-3.5 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {t("academy.participants.openReport")}
          </Link>
        )}

        {canManage && row.identityResolvable && !identity && (
          <button
            type="button"
            onClick={() => identityM.mutate()}
            disabled={identityM.isPending}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-3.5 text-[13px] font-medium text-foreground hover:bg-muted/60 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            {t("academy.participants.showIdentity")}
          </button>
        )}

        {canManage && !row.releasedAt && (
          <button
            type="button"
            onClick={() => releaseM.mutate()}
            disabled={releaseM.isPending || row.attemptStatus !== "scored"}
            title={
              row.attemptStatus !== "scored" ? t("academy.participants.releaseBlocked") : undefined
            }
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-accent px-3.5 text-[13px] font-semibold text-accent-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {t("academy.participants.release")}
          </button>
        )}

        {canManage && row.releasedAt && (
          <button
            type="button"
            onClick={() => reassessM.mutate()}
            disabled={reassessM.isPending || !reassessmentAvailable}
            title={
              reassessmentAvailable
                ? undefined
                : t("academy.participants.reassessmentPurposePending")
            }
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-3.5 text-[13px] font-medium text-foreground hover:bg-muted/60 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            {t("academy.participants.reassess")}
          </button>
        )}
        {canManage && row.attemptStatus === "in_progress" && row.assignmentId && !confirmCancel && (
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setConfirmCancel(true);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-3.5 text-[13px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Ban className="h-4 w-4" aria-hidden="true" />
            {t("academy.participants.cancel")}
          </button>
        )}

        {canManage && row.releasedAt && !reassessmentAvailable && (
          <p className="w-full text-[12px] leading-relaxed text-muted-foreground">
            {t("academy.participants.reassessmentPurposePending")}
          </p>
        )}
      </div>

      {/* Withdrawing an assignment is not destructive, but it does take work
          away from somebody who may already be part-way through it. The
          confirmation says what actually happens to what they have written,
          because "cancel" on its own does not tell an employer whether they are
          about to erase somebody's answers. */}
      {confirmCancel && (
        <div className="mt-4 rounded-[10px] border border-border bg-[color:var(--surface-subtle)] p-4">
          <p className="text-[13px] font-semibold text-foreground">
            {t("academy.participants.cancelConfirmTitle")}
          </p>
          <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.participants.cancelConfirmBody")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => cancelM.mutate()}
              disabled={cancelM.isPending}
              className="inline-flex h-10 items-center rounded-[10px] border border-destructive/50 px-3.5 text-[13px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {cancelM.isPending
                ? t("academy.participants.cancelling")
                : t("academy.participants.cancelConfirmAction")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="inline-flex h-10 items-center rounded-[10px] border border-border px-3.5 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("academy.participants.cancelKeep")}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function TrainingStatusItem({ row, lang }: { row: TrainingStatusRow; lang: string }) {
  const { t } = useT();
  const name = lang === "en" ? row.programmeNameEn : row.programmeNameSv;
  const stateKey =
    row.status === "completed"
      ? "academy.state.completed"
      : row.status === "in_progress"
        ? "academy.state.inProgress"
        : "academy.state.notStarted";
  const locale = lang === "en" ? "en-GB" : "sv-SE";

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold leading-snug text-foreground">{name}</h3>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {t(stateKey as never)}
          </span>
        </div>
        {/* The subject reference, not a name. Identity resolution is a separate,
            governed act and this surface is not it. */}
        <p className="mt-1 font-mono text-[12px] text-muted-foreground">
          {t("academy.participants.subject")} {row.subjectId.slice(0, 8)}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
          <span className="tabular-nums">
            {row.modulesCompleted}/{row.modulesTotal} {t("employer.training.modules")}
          </span>
          <span>
            {t("employer.training.assigned")}{" "}
            {row.assignedAt ? new Date(row.assignedAt).toLocaleDateString(locale) : "—"}
          </span>
          {row.completedAt && (
            <span>
              {t("employer.training.completed")}{" "}
              {new Date(row.completedAt).toLocaleDateString(locale)}
            </span>
          )}
        </p>
      </div>
      <div className="w-full max-w-[160px] shrink-0">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-subtle)]"
          role="progressbar"
          aria-valuenow={row.modulesCompleted}
          aria-valuemin={0}
          aria-valuemax={row.modulesTotal}
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{
              width: `${row.modulesTotal > 0 ? Math.round((row.modulesCompleted / row.modulesTotal) * 100) : 0}%`,
            }}
          />
        </div>
      </div>
    </li>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{children}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const { t } = useT();
  const key =
    status === "in_progress"
      ? "academy.attempt.inProgress"
      : status === "submitted"
        ? "academy.attempt.submitted"
        : status === "scored"
          ? "academy.attempt.scored"
          : status === "released"
            ? "academy.attempt.released"
            : "academy.attempt.other";
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      {t(key)}
    </span>
  );
}
