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
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, CalendarClock, Eye, FileText, Send } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyHeading, AcademyPage } from "@/components/academy/AcademyWorkspace";
import { AcademyQueryState } from "@/components/academy/AcademyQueryState";
import {
  cancelAcademyAssignment,
  releaseAcademyReport,
  resolveParticipantIdentity,
  listAvailablePurposeCodes,
  scheduleAcademyReassessment,
} from "@/lib/security-competency/academy-employer.functions";
import {
  getEmployerAssessmentPipeline,
  type PipelineRow,
} from "@/lib/security-competency/assessment-lifecycle.functions";
import { LifecycleChip, nextActionLabel } from "@/components/academy/LifecycleChip";

// ── ARRIVING FROM A NUMBER ────────────────────────────────────────────
//
// The status cards on Oversikt used to be printed metrics. They are entry
// points now, and `state` is what makes the destination match the card that
// was clicked: "Klara att frislappa: 3" opens this list showing those three,
// not all thirty with the three somewhere in them.
//
// A single state, not a list, because a card names exactly one. Anything else
// falls back to `all` rather than erroring -- a stale bookmark should show the
// participants, not a validation failure.
const STATE_FILTERS = [
  "all",
  "active",
  "under_review",
  "ready_to_release",
  "result_available",
] as const;
type StateFilter = (typeof STATE_FILTERS)[number];

// Optional, not defaulted. A defaulted search param becomes a REQUIRED prop on
// every <Link> to this route, which would mean the twelve links that do not
// care about the filter all have to name it. Absent means "all", decided once
// where the filter is read.
const searchSchema = z.object({
  state: z.enum(STATE_FILTERS).catch("all").optional(),
});

/** `active` is the one filter that is not a lifecycle state: the Oversikt card
 *  called "Pagaende" counts invited AND started, because to an employer both
 *  mean the same thing -- sent out, not back yet. */
const MATCHES: Record<
  Exclude<StateFilter, "all">,
  (s: PipelineRow["lifecycleState"]) => boolean
> = {
  active: (s) => s === "invited" || s === "in_progress",
  under_review: (s) => s === "under_review",
  ready_to_release: (s) => s === "ready_to_release",
  result_available: (s) => s === "result_available",
};

const STATE_LABEL: Record<StateFilter, TranslationKey> = {
  all: "academy.participants.filterStateAll",
  active: "academy.overview.active",
  under_review: "academy.overview.attemptsAwaitingReview",
  ready_to_release: "academy.overview.readyToRelease",
  result_available: "academy.overview.released",
};

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/participants",
)({
  ssr: false,
  component: ParticipantsRoute,
  errorComponent: EmployerErrorState,
  validateSearch: (search) => searchSchema.parse(search),
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
  const { t } = useT();
  const list = useServerFn(getEmployerAssessmentPipeline);
  const query = useQuery({
    queryKey: ["academy", "participants", employerId],
    queryFn: () => list({ data: { employerId } }),
  });

  // Recruitment candidates and existing staff sit in one list because they run
  // the same assessments, but they are not the same people to a manager: one is
  // being considered, the other is employed. The filter is how you look at one
  // group without the other, and the chip on each row is how you never confuse
  // the two -- a candidate is a candidate on this page and nowhere near
  // Medarbetare.
  const [context, setContext] = useState<"all" | "recruitment" | "workforce">("all");

  // The lifecycle filter lives in the URL rather than in state, because it is
  // how another page hands this one a subject: a card on Oversikt links here
  // with the state it was counting. That also makes the view shareable and
  // survivable across a reload, which local state is not.
  const state: StateFilter = Route.useSearch().state ?? "all";
  const navigate = Route.useNavigate();

  const visible = (rows: PipelineRow[]) => {
    const byContext = context === "all" ? rows : rows.filter((r) => r.useCase === context);
    return state === "all" ? byContext : byContext.filter((r) => MATCHES[state](r.lifecycleState));
  };

  return (
    <>
      <AcademyHeading
        title={t("academy.participants.title")}
        lede={t("academy.participants.lede")}
      />

      <div
        role="tablist"
        aria-label={t("academy.participants.contextFilter")}
        className="mb-5 inline-flex gap-1 rounded-[10px] border border-border p-1"
      >
        {(["all", "recruitment", "workforce"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={context === c}
            onClick={() => setContext(c)}
            className={
              context === c
                ? "rounded-[7px] bg-[color:var(--surface-subtle)] px-3 py-1.5 text-[13px] font-medium text-foreground"
                : "rounded-[7px] px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {t(
              c === "all"
                ? "academy.participants.filterAll"
                : c === "recruitment"
                  ? "academy.participants.filterCandidates"
                  : "academy.participants.filterEmployees",
            )}
          </button>
        ))}
      </div>

      {/* The filter is shown, not just applied. Arriving from a card and seeing
          an unexplained short list is the same confusion as a dead card, one
          step later -- so the active state names itself and offers the way out. */}
      <div
        role="tablist"
        aria-label={t("academy.participants.stateFilter")}
        className="mb-5 ml-0 flex flex-wrap gap-1 sm:ml-3 sm:inline-flex"
      >
        {STATE_FILTERS.map((sf) => (
          <button
            key={sf}
            type="button"
            role="tab"
            aria-selected={state === sf}
            onClick={() => void navigate({ search: { state: sf }, replace: true })}
            className={
              state === sf
                ? "rounded-[7px] border border-accent bg-[color:var(--surface-subtle)] px-3 py-1.5 text-[13px] font-medium text-foreground"
                : "rounded-[7px] border border-transparent px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {t(STATE_LABEL[sf])}
          </button>
        ))}
      </div>

      <AcademyQueryState
        query={query}
        surface="assessments/participants"
        isEmpty={(rows) => visible(rows).length === 0}
        // A filter that matches nothing is not an empty workspace. Telling
        // someone who just clicked "Klara att frislappa" to go and assign their
        // first assessment would be answering a question they did not ask.
        emptyTitle={
          state === "all"
            ? t("academy.participants.emptyTitle")
            : t("academy.participants.emptyFilteredTitle")
        }
        emptyBody={
          state === "all"
            ? t("academy.participants.emptyBody")
            : t("academy.participants.emptyFilteredBody")
        }
        // The empty state already told people to go to the library. Now it
        // takes them there.
        emptyAction={
          state === "all" ? (
            <Link
              to="/employer/$employerSlug/assessments/library"
              params={{ employerSlug }}
              className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("academy.overview.openLibrary")}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void navigate({ search: { state: "all" }, replace: true })}
              className="inline-flex h-10 items-center rounded-[10px] border border-border px-4 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("academy.participants.clearStateFilter")}
            </button>
          )
        }
      >
        {(rows) => (
          <div className="space-y-3">
            {visible(rows).map((p) => (
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
  row: PipelineRow;
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

  const programme = (lang === "en" ? row.assessmentNameEn : row.assessmentNameSv) ?? "—";

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
          {/* A NAME only where this employer's own employment record supplies
              one -- its data about its own staff, and the way into that
              person's profile. Everyone else stays the pseudonymous reference
              the architecture deliberately shows. */}
          {row.participantName && row.employeeId ? (
            <Link
              to="/employer/$employerSlug/workforce/$personId"
              params={{ employerSlug, personId: row.employeeId }}
              className="mt-1 inline-block text-xs text-foreground underline-offset-2 hover:underline"
            >
              {row.participantName}
            </Link>
          ) : (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {t("academy.participants.subject")} {row.subjectId.slice(0, 8)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {t(
                row.useCase === "recruitment"
                  ? "academy.participants.contextCandidate"
                  : "academy.participants.contextEmployee",
              )}
            </span>
            <LifecycleChip state={row.lifecycleState} />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {nextActionLabel(t, row.lifecycleState)}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-[13px] sm:grid-cols-4">
        <Fact label={t("academy.participants.progress")}>
          <span className="tabular-nums">
            {row.answered}/{row.totalItems}
          </span>
        </Fact>
        <Fact label={t("academy.participants.awaitingReview")}>
          <span className="tabular-nums">{row.reviewsOpen}</span>
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

        {row.canRelease && (
          <button
            type="button"
            onClick={() => releaseM.mutate()}
            disabled={releaseM.isPending}
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
        {canManage &&
          (row.lifecycleState === "invited" || row.lifecycleState === "in_progress") &&
          row.assignmentId &&
          !confirmCancel && (
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

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{children}</p>
    </div>
  );
}
