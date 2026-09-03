// Kandidater — every recruitment candidate with an assigned test, and what to
// do about each one.
//
// ── ONE CARD, ONE PRIMARY ACTION ──────────────────────────────────────
//
// The list this replaces described states and offered controls that had
// nothing to do with them. A card reading "Test genomfört · Svar att granska:
// 10" carried no way to review those ten: the only route to the work was a
// tab two clicks away, and the card that reported the problem was a dead end.
// That is the defect this file exists to make structurally impossible.
//
// So every row now resolves to exactly one primary control, chosen by the
// lifecycle state the database derived, and the states that have work always
// have a button:
//
//   Pågående              -> Visa kandidat        (the application it came from)
//   Väntar på granskning  -> Granska svar         (the review workspace)
//   Underlag klart        -> Dela kandidatunderlaget
//   Slutförd              -> Öppna kandidatunderlag
//
// Nothing is a disabled rectangle. Where an action genuinely does not exist —
// a member without release rights, an assignment that never came from an
// application — the card says so in a sentence, because a greyed-out control
// is a question ("why not?") the card should already have answered.
//
// ── RECRUITMENT ONLY ──────────────────────────────────────────────────
//
// This area sits under Rekrytering. It used to carry an Alla / Kandidater /
// Medarbetare toggle and show both populations, which meant "Kandidater" was
// a filter on a page that was also about employees, and the same list mixed
// two products with two different governance stories. Existing staff are
// assessed under Kompetensutveckling and read on their own person page; this
// list is candidates, always, with no toggle to get that wrong with.
//
// ── WHO THE CARD IS ABOUT ─────────────────────────────────────────────
//
// One rule, and it is the employer's existing entitlement rather than a new
// one:
//
//   assessment came from a job application  ->  the candidate's name
//   assessment sent straight to an address  ->  the pseudonymous reference
//
// A candidate who applied is a person this employer already knows. Their name,
// their job and their CV are on the application, on a page one click away, and
// the recruiter reading this list has been looking at that name all morning.
// Printing "Referens 4C42C8" next to it does not protect anybody — it just
// makes the recruiter go and look the reference up.
//
// The name is READ FROM THAT APPLICATION, through listApplicationsForEmployer:
// the same governed, membership-verified, RLS-scoped call the Ansökningar page
// already makes, on the same react-query key, so this page adds no fetch of
// its own and no new access path. Nothing here queries profiles, subjects or
// identities.
//
// What is deliberately NOT taken from the pipeline is participantName. That
// field resolves the employer's own EMPLOYMENT record, it is the workforce
// product's disclosure, and a recruitment assignment never carries one.
//
// Where no application exists there is no identified context to inherit, so
// the reference stays — and "Visa vem detta är" is untouched: it still asks
// the server, which still only agrees once the brief has been shared.
//
// The blind-assessment surface is Granskning, not this page. A reviewer judges
// an answer, not a person they know, and the queue and the review workspace
// stay pseudonymous for that reason.

import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, CalendarClock, ClipboardCheck, Eye, FileText, Send, UserRound } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { ConfirmAction } from "@/components/employer/ConfirmAction";
import { AcademyHeading, AcademyPage } from "@/components/academy/AcademyWorkspace";
import { AcademyQueryState } from "@/components/academy/AcademyQueryState";
import { listApplicationsForEmployer } from "@/lib/job-intelligence/applications.functions";
import {
  cancelAcademyAssignment,
  listAssignmentApplications,
  releaseAcademyReport,
  resolveParticipantIdentity,
  listAvailablePurposeCodes,
  scheduleAcademyReassessment,
} from "@/lib/security-competency/academy-employer.functions";
import {
  getEmployerAssessmentPipeline,
  type PipelineRow,
} from "@/lib/security-competency/assessment-lifecycle.functions";
import { LifecycleChip } from "@/components/academy/LifecycleChip";

// ── ARRIVING FROM A NUMBER ────────────────────────────────────────────
//
// The status cards on Oversikt used to be printed metrics. They are entry
// points now, and `state` is what makes the destination match the card that
// was clicked: "Underlag klara: 3" opens this list showing those three, not
// all thirty with the three somewhere in them.
//
// A single state, not a list, because a card names exactly one. Anything else
// falls back to `all` rather than erroring -- a stale bookmark should show the
// candidates, not a validation failure.
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
 *  called "Pagaende kandidater" counts invited AND started, because to an
 *  employer both mean the same thing -- sent out, not back yet. */
const MATCHES: Record<
  Exclude<StateFilter, "all">,
  (s: PipelineRow["lifecycleState"]) => boolean
> = {
  active: (s) => s === "invited" || s === "in_progress",
  under_review: (s) => s === "under_review",
  ready_to_release: (s) => s === "ready_to_release",
  result_available: (s) => s === "result_available",
};

// The filter chips name the employer's states, not the engine's. They are
// their own keys rather than borrowed from the Oversikt tiles: a tile is a
// count of a population ("Pagaende kandidater") and a chip is a status
// ("Pagaende"), and one string cannot read correctly as both.
const URGENCY: Record<PipelineRow["lifecycleState"], number> = {
  under_review: 0,
  ready_to_release: 1,
  in_progress: 2,
  invited: 3,
  processing: 4,
  result_available: 5,
  abandoned: 6,
};

function byUrgency(a: PipelineRow, b: PipelineRow): number {
  const u = URGENCY[a.lifecycleState] - URGENCY[b.lifecycleState];
  if (u !== 0) return u;
  // A deadline that has passed matters more than one three weeks out; a row
  // with no deadline at all sorts last rather than first.
  const da = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY;
  const db = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return a.attemptId.localeCompare(b.attemptId);
}

const STATE_LABEL: Record<StateFilter, TranslationKey> = {
  all: "academy.participants.filterStateAll",
  active: "academy.participants.filterOngoing",
  under_review: "academy.participants.filterUnderReview",
  ready_to_release: "academy.participants.filterReady",
  result_available: "academy.participants.filterCompleted",
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
        <Candidates
          employerId={ws.employerId}
          employerSlug={ws.employerSlug}
          canManage={ws.role !== "member"}
        />
      )}
    </AcademyPage>
  );
}

function Candidates({
  employerId,
  employerSlug,
  canManage,
}: {
  employerId: string;
  employerSlug: string;
  canManage: boolean;
}) {
  const { t, lang } = useT();
  const list = useServerFn(getEmployerAssessmentPipeline);
  const query = useQuery({
    queryKey: ["academy", "participants", employerId],
    queryFn: () => list({ data: { employerId } }),
  });

  // Which assignments came from an application. Asked once for the list rather
  // than once per row, and never blocking: a row whose mapping is missing
  // simply shows no candidate link rather than failing the page.
  const appsFn = useServerFn(listAssignmentApplications);
  const applications = useQuery({
    queryKey: ["academy", "assignment-applications", employerId],
    queryFn: () => appsFn({ data: { employerId } }),
    staleTime: 5 * 60 * 1000,
  });

  // Who those applications are from. Deliberately the SAME query key the
  // Ansökningar page and the employer dashboard use, so this is one cache
  // entry across three surfaces rather than a second read of the same rows --
  // and so a name can never differ between the two pages that show it.
  const candidatesFn = useServerFn(listApplicationsForEmployer);
  const applicants = useQuery({
    queryKey: ["employer", employerId, "applications"],
    queryFn: () => candidatesFn({ data: { employerId } }),
    staleTime: 5 * 60 * 1000,
  });
  const identified = new Map(
    (applicants.data ?? []).map((a) => [
      a.id,
      {
        name: a.applicantDisplayName,
        role: (lang === "en" ? a.jobTitleEn : a.jobTitleSv) ?? null,
      },
    ]),
  );

  // The lifecycle filter lives in the URL rather than in state, because it is
  // how another page hands this one a subject: a card on Oversikt links here
  // with the state it was counting. That also makes the view shareable and
  // survivable across a reload, which local state is not.
  const state: StateFilter = Route.useSearch().state ?? "all";
  const navigate = Route.useNavigate();

  const visible = (rows: PipelineRow[]) => {
    const recruitment = rows.filter((r) => r.useCase === "recruitment");
    const matched =
      state === "all" ? recruitment : recruitment.filter((r) => MATCHES[state](r.lifecycleState));
    return [...matched].sort(byUrgency);
  };

  return (
    <>
      <AcademyHeading
        title={t("academy.participants.title")}
        lede={t("academy.participants.lede")}
      />

      {/* The filter is shown, not just applied. Arriving from a card and seeing
          an unexplained short list is the same confusion as a dead card, one
          step later -- so the active state names itself and offers the way out. */}
      <div
        role="tablist"
        aria-label={t("academy.participants.stateFilter")}
        className="mb-4 flex flex-wrap gap-1"
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
                ? "rounded-[7px] border border-accent bg-[color:var(--surface-subtle)] px-3 py-1.5 text-[13px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                : "rounded-[7px] border border-transparent px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            }
          >
            {t(STATE_LABEL[sf])}
          </button>
        ))}
      </div>

      {/* The rule behind every reference on this page, said once. It used to be
          said nowhere, which is why an employer reading "Referens 4C42C8" had
          no way to know whether a name was missing or withheld. */}
      <p className="mb-5 max-w-[74ch] text-[12px] leading-relaxed text-muted-foreground">
        {t("academy.participants.referenceExplain")}
      </p>

      <AcademyQueryState
        query={query}
        surface="assessments/participants"
        isEmpty={(rows) => visible(rows).length === 0}
        // A filter that matches nothing is not an empty workspace. Telling
        // someone who just clicked "Underlag klara" to go and assign their
        // first test would be answering a question they did not ask.
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
              <CandidateCard
                key={p.attemptId}
                row={p}
                employerId={employerId}
                employerSlug={employerSlug}
                applicationId={(p.assignmentId && applications.data?.[p.assignmentId]) || null}
                candidate={
                  (p.assignmentId && identified.get(applications.data?.[p.assignmentId] ?? "")) ||
                  null
                }
                canManage={canManage}
              />
            ))}
          </div>
        )}
      </AcademyQueryState>
    </>
  );
}

function CandidateCard({
  row,
  employerId,
  employerSlug,
  applicationId,
  candidate,
  canManage,
}: {
  row: PipelineRow;
  employerId: string;
  employerSlug: string;
  /** The application this assignment came from, when it came from one. */
  applicationId: string | null;
  /** The candidate as the employer's own application record already names
   *  them, when the assignment came from an identified application. Null for
   *  an assessment sent straight to an address: there is no identified context
   *  to inherit, so the reference stands. */
  candidate: { name: string | null; role: string | null } | null;
  canManage: boolean;
}) {
  const { t, tp, lang } = useT();
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
  // Sharing is irreversible and the copy under the button has always said
  // so -- but the click ran straight through, so the sentence was a warning
  // nobody had the chance to act on. Cancelling leaves everything exactly as
  // it was: no state beyond this flag is touched until the confirm.
  //
  // The confirmation is the product's own ConfirmAction dialog (an alert
  // dialog): focus moves into it, Escape and the Cancel button close it, the
  // title and the consequence are its accessible name and description, and
  // the page behind it cannot be clicked. It replaced an inline panel that
  // did none of that.
  const [confirmRelease, setConfirmRelease] = useState(false);
  // Single-flight for the release itself. A ref, not state: it updates
  // synchronously, so a second activation of the confirm button that lands
  // before React re-renders still sees it. The state flag alone missed that
  // window, and the database's SCP_ALREADY_RELEASED was the only backstop.
  const releasingRef = useRef(false);

  const assessment = (lang === "en" ? row.assessmentNameEn : row.assessmentNameSv) ?? "—";
  const state = row.lifecycleState;
  const reviewed = Math.max(row.reviewsTotal - row.reviewsOpen, 0);

  const identityM = useMutation({
    mutationFn: () => resolve({ data: { employerId, subjectId: row.subjectId } }),
    onSuccess: (r) => setIdentity(r?.email ?? t("academy.participants.identityRefused")),
  });

  const releaseM = useMutation({
    mutationFn: () => release({ data: { attemptId: row.attemptId } }),
    onSettled: () => {
      releasingRef.current = false;
    },
    onSuccess: () => {
      setConfirmRelease(false);
      void qc.invalidateQueries({ queryKey: ["academy", "participants"] });
    },
    onError: (e: unknown) => {
      setConfirmRelease(false);
      const code = (e as { code?: string }).code ?? "";
      // ── ALREADY SHARED IS NOT A FAILURE ────────────────────────────────
      //
      // Sharing is one-way and the database says so: a second call raises
      // SCP_ALREADY_RELEASED. That reached this handler as "the brief could
      // not be shared", which is false in the one way that matters — it WAS
      // shared, and the recruiter was being told to go and do it again.
      //
      // The button is single-flight, so this is not a double click. It is the
      // reply that got lost on the way back, the second tab, and the second
      // admin who pressed it a moment later. All three are the success case
      // arriving late, and the row is refetched exactly as it would have been.
      if (code === "SCP_ALREADY_RELEASED") {
        setNotice(t("academy.participants.releaseAlready"));
        void qc.invalidateQueries({ queryKey: ["academy", "participants"] });
        return;
      }
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
  // scored or shared attempt is completed work and the database refuses to
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

  const canShare = row.canRelease && canManage;

  return (
    <article className="rounded-[14px] border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {/* The candidate leads, because the card is about a person: their
              name where this employer's own application record supplies one,
              the governed reference where nothing identified it. */}
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {candidate?.name ? (
              <span>{candidate.name}</span>
            ) : (
              <span className="font-mono">
                {t("academy.participants.subject")} {row.participantRef}
              </span>
            )}
          </h2>
          {candidate?.role && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t("academy.participants.candidateRole")} {candidate.role}
            </p>
          )}
          <p className="mt-1 text-[13px] text-muted-foreground">{assessment}</p>
        </div>
        <LifecycleChip state={state} useCase="recruitment" />
      </div>

      <div className="mt-4 grid gap-3 text-[13px] sm:grid-cols-4">
        <Fact label={t("academy.participants.progress")}>
          <span className="tabular-nums">
            {row.answered} {t("academy.participants.progressOf")} {row.totalItems}
          </span>{" "}
          {t("academy.participants.progressAnswered")}
        </Fact>
        {/* Only where there is review work, or review work that has been
            partly done. A row with nothing to review does not need a zero. */}
        {row.reviewsTotal > 0 && (
          <Fact label={t("academy.participants.reviewLabel")}>
            {row.reviewsOpen > 0 ? (
              <>
                <span className="tabular-nums">{row.reviewsOpen}</span>{" "}
                {tp("academy.participants.reviewLeft", row.reviewsOpen)}
              </>
            ) : (
              <>
                <span className="tabular-nums">
                  {reviewed} {t("academy.participants.progressOf")} {row.reviewsTotal}
                </span>{" "}
                {t("academy.participants.reviewedCount")}
              </>
            )}
          </Fact>
        )}
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

      {/* One sentence saying what this state means for the reader, above the
          one control that acts on it. */}
      <p className="mt-4 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
        {supportText(t, tp, state, row, applicationId, canShare)}
      </p>

      {identity && (
        <p className="mt-3 rounded-[10px] bg-[color:var(--surface-subtle)] px-3 py-2 text-[13px] text-foreground">
          {identity}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-[13px] leading-relaxed text-foreground">
          {notice}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* ── THE PRIMARY CONTROL ───────────────────────────────────────
         *
         *  Exactly one per card, chosen by state. The under_review branch is
         *  the one this rebuild exists for: a card that says ten responses
         *  need a person must be the thing that opens those ten responses. */}
        {state === "under_review" && (
          <Link
            to="/employer/$employerSlug/assessments/reviews/$attemptId"
            params={{ employerSlug, attemptId: row.attemptId }}
            className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            {t("academy.participants.ctaReview")}
          </Link>
        )}

        {state === "result_available" && row.releasedAt && (
          <Link
            to="/employer/$employerSlug/assessments/results/$attemptId"
            params={{ employerSlug, attemptId: row.attemptId }}
            search={applicationId ? { application: applicationId } : {}}
            className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {t("academy.participants.ctaOpenBrief")}
          </Link>
        )}

        {/* "Frisläpp" said nothing to anybody outside this codebase. What the
            button does is share the material — and because the same click also
            gives the candidate their own copy and unlocks the identity
            request, and because none of it can be undone, the confirmation
            below says so before anything happens. */}
        {state === "ready_to_release" && canShare && (
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setConfirmRelease(true);
            }}
            disabled={releaseM.isPending}
            className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {t("academy.participants.ctaShare")}
          </button>
        )}

        {/* Pågående, and anywhere else the candidate's own page is the useful
            destination. It is the application, because that is where this
            employer already holds their name, their CV and the decision. */}
        {applicationId && state !== "under_review" && state !== "result_available" && (
          <Link
            to="/employer/$employerSlug/applications/$applicationId"
            params={{ employerSlug, applicationId }}
            className={
              state === "ready_to_release" && canShare
                ? "inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                : "inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            }
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            {t("academy.participants.ctaViewCandidate")}
          </Link>
        )}

        {/* Secondary controls. Never competing with the primary: they are the
            things a manager occasionally needs, not the thing this card is
            asking for. */}
        {applicationId && (state === "under_review" || state === "result_available") && (
          <Link
            to="/employer/$employerSlug/applications/$applicationId"
            params={{ employerSlug, applicationId }}
            className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            {t("academy.participants.ctaViewCandidate")}
          </Link>
        )}

        {canManage && row.identityResolvable && !identity && (
          <button
            type="button"
            onClick={() => identityM.mutate()}
            disabled={identityM.isPending}
            className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-border px-4 text-[13px] font-medium text-foreground hover:bg-muted/60 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            {t("academy.participants.showIdentity")}
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
            className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-border px-4 text-[13px] font-medium text-foreground hover:bg-muted/60 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            {t("academy.participants.reassess")}
          </button>
        )}

        {canManage &&
          (state === "invited" || state === "in_progress") &&
          row.assignmentId &&
          !confirmCancel && (
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setConfirmCancel(true);
              }}
              className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-border px-4 text-[13px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Ban className="h-4 w-4" aria-hidden="true" />
              {t("academy.participants.cancel")}
            </button>
          )}
      </div>

      {/* What sharing actually does, before the click rather than after it.
          The confirmation below repeats it at the moment of the decision; this
          is the sentence that lets somebody decide not to click at all. */}
      {state === "ready_to_release" && canShare && (
        <p className="mt-3 max-w-[74ch] text-[12px] leading-relaxed text-muted-foreground">
          {t("academy.participants.releaseExplain")}
        </p>
      )}

      {canManage && row.releasedAt && !reassessmentAvailable && (
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          {t("academy.participants.reassessmentPurposePending")}
        </p>
      )}

      {/* The share confirmation. It names the three things that happen at once,
          says plainly that a person -- not the system -- is doing the sharing,
          and Cancel changes nothing. An alert dialog rather than an inline
          panel: the decision is irreversible, so it gets the interaction the
          rest of the employer workspace uses for irreversible things. */}
      <ConfirmAction
        open={confirmRelease}
        onOpenChange={(open) => {
          // Closing is refused while the release is in flight: the answer to
          // "did it go through?" is about to arrive, and hiding the dialog
          // would not stop the call.
          if (!open && releaseM.isPending) return;
          setConfirmRelease(open);
        }}
        title={t("academy.participants.releaseConfirmTitleRecruitment")}
        consequence={
          <>
            <span className="block">{t("academy.participants.releaseConfirmBodyRecruitment")}</span>
            <span className="mt-2 block">
              {t("academy.participants.releaseConfirmResponsibility")}
            </span>
          </>
        }
        confirmLabel={
          releaseM.isPending
            ? t("academy.participants.releaseConfirmPending")
            : t("academy.participants.releaseConfirmActionRecruitment")
        }
        cancelLabel={t("academy.participants.releaseConfirmCancel")}
        busy={releaseM.isPending}
        onConfirm={() => {
          if (releasingRef.current) return;
          releasingRef.current = true;
          releaseM.mutate();
        }}
      />

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
              className="inline-flex h-11 items-center rounded-[10px] border border-destructive/50 px-4 text-[13px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {cancelM.isPending
                ? t("academy.participants.cancelling")
                : t("academy.participants.cancelConfirmAction")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="inline-flex h-11 items-center rounded-[10px] border border-border px-4 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("academy.participants.cancelKeep")}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/** What this state means for the reader, in one sentence.
 *
 *  Never invents an action the lifecycle does not support, and never leaves a
 *  card silent: where the primary control is absent, this is the sentence that
 *  explains why instead of a disabled button. */
function supportText(
  t: (k: TranslationKey) => string,
  tp: (k: "academy.participants.reviewNeeded", n: number) => string,
  state: PipelineRow["lifecycleState"],
  row: PipelineRow,
  applicationId: string | null,
  canShare: boolean,
): string {
  switch (state) {
    case "invited":
    case "in_progress":
      return applicationId
        ? t("lifecycle.next.recruitment.awaitingCandidate")
        : t("academy.participants.awaitingCandidateNoApplication");
    case "under_review":
      return `${row.reviewsOpen} ${tp("academy.participants.reviewNeeded", row.reviewsOpen)}`;
    case "ready_to_release":
      return canShare
        ? t("academy.participants.readySupport")
        : t("academy.participants.releaseNeedsAdmin");
    case "result_available":
      return t("academy.participants.completedSupport");
    case "processing":
      return t("lifecycle.next.processing");
    case "abandoned":
      return t("lifecycle.next.none");
  }
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{children}</p>
    </div>
  );
}
