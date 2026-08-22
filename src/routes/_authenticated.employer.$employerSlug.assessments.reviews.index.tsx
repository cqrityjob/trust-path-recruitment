// The employer review workspace.
//
// ── WHAT THIS PAGE USED TO BE ─────────────────────────────────────────
//
// Three numbers and an empty box. On this platform's own reference tenant it
// read "Svar som väntar: 14 · Resultat som blockeras: 2 · Mina
// granskningsuppgifter: 0" above the sentence "Inget att granska just nu" —
// which was false, and the numbers on the same screen said so. None of the
// three was clickable, so the page reported a problem and offered no way to
// act on it, and the only route to the actual work was a hidden /reviews URL
// reached with a second login.
//
// ── THE THREE THINGS THAT EMPTY STATE WAS RUNNING TOGETHER ────────────
//
//   1. nothing is waiting                      — a real empty queue
//   2. work is waiting, you hold no authorisation to review it
//   3. work is waiting, you are authorised, but not for THIS attempt
//
// They call for completely different sentences and completely different next
// actions ("nothing to do", "ask an owner for authorisation", "a colleague
// must take this one"), and the page said the same words for all three. It
// could not do otherwise: it had no way to tell them apart, because the only
// thing it asked the database was "what may I review?", and the answer to that
// is empty in cases 1, 2 and 3 alike.
//
// scp_employer_review_board answers the other question — what is this
// ORGANISATION waiting on, and on what basis may the person reading act on each
// item — which is what makes the three distinguishable. It carries counts and a
// basis and no response content: the material under review still reaches a
// reviewer only through the queue, on the attempt route next door.
//
// ── EVERY NUMBER IS THE LIST BENEATH IT ───────────────────────────────
//
// All three counters are derived from the SAME board rows the page renders, so
// a count cannot disagree with what is under it. That is why "Mina
// granskningsuppgifter" is no longer read from scp_my_review_workload: that
// function is correctly scoped across every employer that has authorised the
// caller, which is the wrong scope for one tenant's page and would put a number
// here that this list could not account for.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Clock, Hourglass, ShieldCheck, UserCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyHeading, AcademyPage } from "@/components/academy/AcademyWorkspace";
import { AcademyQueryState } from "@/components/academy/AcademyQueryState";
import { LifecycleChip } from "@/components/academy/LifecycleChip";
import {
  getEmployerReviewBoard,
  getMyReviewCapability,
  type ReviewBoardRow,
} from "@/lib/security-competency/academy-employer.functions";
import {
  getEmployerAssessmentPipeline,
  type PipelineRow,
} from "@/lib/security-competency/assessment-lifecycle.functions";

const SCOPES = ["all", "mine"] as const;
type Scope = (typeof SCOPES)[number];

// `catch` rather than a hard failure: a stale bookmark should show the queue,
// not a validation error. Optional rather than defaulted, so a link that does
// not care about the filter does not have to name it.
const searchSchema = z.object({
  scope: z.enum(SCOPES).catch("all").optional(),
});

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/assessments/reviews/")(
  {
    ssr: false,
    component: ReviewsRoute,
    errorComponent: EmployerErrorState,
    validateSearch: (search) => searchSchema.parse(search),
  },
);

function ReviewsRoute() {
  const { employerSlug } = Route.useParams();
  return (
    <AcademyPage employerSlug={employerSlug}>
      {(ws) => <Reviews employerId={ws.employerId} employerSlug={ws.employerSlug} />}
    </AcademyPage>
  );
}

/** One board row with the context needed to decide whether to open it. */
type WorkItem = ReviewBoardRow & { attempt: PipelineRow | undefined };

function Reviews({ employerId, employerSlug }: { employerId: string; employerSlug: string }) {
  const { t, lang } = useT();
  const scope: Scope = Route.useSearch().scope ?? "all";
  const navigate = Route.useNavigate();

  const boardFn = useServerFn(getEmployerReviewBoard);
  const pipelineFn = useServerFn(getEmployerAssessmentPipeline);
  const capabilityFn = useServerFn(getMyReviewCapability);

  const board = useQuery({
    queryKey: ["academy", "review-board", employerId],
    queryFn: () => boardFn({ data: { employerId } }),
  });
  // The board deliberately carries no candidate, assessment or date: it is a
  // gate answer, not a read model. The pipeline is the read model this employer
  // already uses on Deltagare, and joining them here means the two surfaces can
  // never describe the same attempt differently.
  const pipeline = useQuery({
    queryKey: ["academy", "participants", employerId],
    queryFn: () => pipelineFn({ data: { employerId } }),
  });
  const capability = useQuery({
    queryKey: ["academy", "my-review-capability", employerId],
    queryFn: () => capabilityFn({ data: { employerId } }),
  });

  const rows = board.data ?? [];
  const byAttempt = new Map((pipeline.data ?? []).map((p) => [p.attemptId, p]));
  const items: WorkItem[] = rows.map((r) => ({ ...r, attempt: byAttempt.get(r.attemptId) }));

  const mine = items.filter((i) => canAct(i.basis));
  const responsesWaiting = items.reduce((n, i) => n + i.responsesOpen, 0);
  const myResponses = mine.reduce((n, i) => n + i.responsesOpen, 0);
  const visible = scope === "mine" ? mine : items;

  const isReviewer = capability.data?.isReviewer ?? false;
  const canManageReviewers = capability.data?.canManageReviewers ?? false;

  return (
    <>
      <AcademyHeading title={t("academy.reviews.title")} lede={t("academy.reviews.lede")} />

      <section className="mb-8 grid gap-4 sm:grid-cols-3">
        {/* RESPONSES, organisation-wide. Filters this page to everything that
            is waiting, which is the list these responses live in. */}
        <MetricLink
          icon={Clock}
          label="academy.reviews.awaiting"
          value={responsesWaiting}
          active={scope === "all"}
          onSelect={() => void navigate({ search: { scope: "all" }, replace: true })}
        />
        {/* ATTEMPTS whose result cannot progress. A different question from the
            one above, so a different destination: the participant list, where
            the attempt lives and where releasing it will happen. */}
        <MetricCard icon={Hourglass} label="academy.reviews.blocked" value={items.length}>
          <Link
            to="/employer/$employerSlug/assessments/participants"
            params={{ employerSlug }}
            search={{ state: "under_review" as const }}
            className="mt-3 inline-flex text-[13px] font-medium text-accent underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("academy.reviews.openBlockedList")}
          </Link>
        </MetricCard>
        {/* Mine. Same rows, filtered to the ones this person may actually act
            on -- which is why the number can never exceed the one on the left. */}
        <MetricLink
          icon={UserCheck}
          label="academy.reviews.myTasks"
          value={myResponses}
          active={scope === "mine"}
          onSelect={() => void navigate({ search: { scope: "mine" }, replace: true })}
        />
      </section>

      {/* PERMISSION is stated before work, and separately from it. "You have no
          authorisation" and "there is nothing to do" are different facts about
          different things, and merging them is what made the old empty state
          unreadable. */}
      {capability.isSuccess && !isReviewer && (
        <div className="mb-6 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            {t("academy.reviews.noCapabilityTitle")}
          </p>
          <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">
            {canManageReviewers
              ? t("academy.reviews.noCapabilityOwnerBody")
              : t("academy.reviews.noCapabilityMemberBody")}
          </p>
          {canManageReviewers && (
            <Link
              to="/employer/$employerSlug/settings"
              params={{ employerSlug }}
              className="mt-4 inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("academy.reviews.manageReviewers")}
            </Link>
          )}
        </div>
      )}

      {/* A reviewer whose authorisation does not cover recruitment is a fourth
          state again: authorised, and still unable to touch the work in front
          of them. Saying which use case is missing is the difference between a
          fixable problem and a mystery. */}
      {isReviewer &&
        !(capability.data?.useCases ?? []).includes("recruitment") &&
        items.some((i) => i.attempt?.useCase === "recruitment") && (
          <p className="mb-6 rounded-[12px] border border-border px-4 py-3 text-[13px] leading-relaxed text-foreground">
            {t("academy.reviews.recruitmentScopeMissing")}
          </p>
        )}

      <AcademyQueryState
        query={board}
        surface="assessments/reviews"
        isEmpty={() => visible.length === 0}
        emptyTitle={
          scope === "mine" && items.length > 0
            ? t("academy.reviews.emptyMineTitle")
            : t("academy.reviews.emptyQueueTitle")
        }
        emptyBody={
          scope === "mine" && items.length > 0
            ? t("academy.reviews.emptyMineBody")
            : t("academy.reviews.emptyQueueBody")
        }
        emptyAction={
          scope === "mine" && items.length > 0 ? (
            <button
              type="button"
              onClick={() => void navigate({ search: { scope: "all" }, replace: true })}
              className="inline-flex h-10 items-center rounded-[10px] border border-border px-4 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("academy.reviews.showAll")}
            </button>
          ) : undefined
        }
      >
        {() => (
          <ul className="space-y-3">
            {visible.map((item) => (
              <li key={item.attemptId}>
                <WorkRow
                  item={item}
                  employerSlug={employerSlug}
                  lang={lang}
                  canManageReviewers={canManageReviewers}
                />
              </li>
            ))}
          </ul>
        )}
      </AcademyQueryState>
    </>
  );
}

/** Whether the basis string permits this caller to open the review.
 *
 *  `break_glass` counts: a platform administrator working an incident can
 *  review, and scp_complete_human_review records that they did. It is not
 *  hidden from the row — the chip says which basis applies. */
function canAct(basis: string) {
  return basis === "authorised" || basis === "break_glass";
}

const BASIS_LABEL: Record<string, TranslationKey> = {
  authorised: "academy.reviews.basisAuthorised",
  break_glass: "academy.reviews.basisBreakGlass",
  not_authorised: "academy.reviews.basisNotAuthorised",
  "conflict:is_participant": "academy.reviews.basisOwnResponses",
  "conflict:recorded_employer_decision": "academy.reviews.basisAlreadyDecided",
  "conflict:unknown_attempt": "academy.reviews.basisUnknown",
};

const DISCLOSURE_LABEL: Record<string, TranslationKey> = {
  assigned_this_assessment: "academy.reviews.discloseAssigned",
  acted_on_this_application: "academy.reviews.discloseApplication",
};

/** One attempt waiting on a person.
 *
 *  Answers, in order: who it concerns, which assessment, in what context, how
 *  much is outstanding, what state it is in, when it arrived, and what this
 *  particular reader can do about it. The last of those is the row's whole
 *  reason for existing — a list of work nobody can explain is the page this
 *  one replaces. */
function WorkRow({
  item,
  employerSlug,
  lang,
  canManageReviewers,
}: {
  item: WorkItem;
  employerSlug: string;
  lang: "sv" | "en";
  canManageReviewers: boolean;
}) {
  const { t } = useT();
  const a = item.attempt;
  const assessment =
    (lang === "en" ? a?.assessmentNameEn : a?.assessmentNameSv) ?? t("academy.reviews.unknown");
  const submitted = a?.submittedAt
    ? new Date(a.submittedAt).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE")
    : "—";
  const actionable = canAct(item.basis);
  const basisKey = BASIS_LABEL[item.basis] ?? "academy.reviews.basisConflict";

  return (
    <article className="rounded-[14px] border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{assessment}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {/* The employer's own employment record supplies a name for staff.
                A recruitment candidate stays the pseudonymous reference until
                their result is released — the reviewer is judging an answer,
                not a person they know. */}
            {t("academy.reviews.participant")}: {a?.participantName ?? a?.participantRef ?? "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex shrink-0 items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {t(
              a?.useCase === "recruitment"
                ? "academy.participants.contextCandidate"
                : "academy.participants.contextEmployee",
            )}
          </span>
          {a && <LifecycleChip state={a.lifecycleState} />}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-[10px] border border-border bg-[color:var(--surface-subtle)] p-4 sm:grid-cols-3">
        <Fact label={t("academy.reviews.responsesOpen")} value={String(item.responsesOpen)} />
        <Fact label={t("academy.reviews.submittedAt")} value={submitted} />
        <Fact label={t("academy.reviews.myBasis")} value={t(basisKey)} />
      </dl>

      {/* A permitted involvement, said out loud. #63 stopped refusing the
          reviewer who commissioned the assessment; it did not make that fact
          invisible, here or in the audit record.
          Shown only where it changes what happens next: telling somebody who
          holds no authorisation that their involvement "does not stop them"
          would be answering a question they are not being asked. */}
      {actionable && item.disclosure && DISCLOSURE_LABEL[item.disclosure] && (
        <p className="mt-3 rounded-[10px] border border-border px-3 py-2 text-[12px] leading-relaxed text-foreground">
          {t(DISCLOSURE_LABEL[item.disclosure])}
        </p>
      )}

      <div className="mt-4">
        {actionable ? (
          <Link
            to="/employer/$employerSlug/assessments/reviews/$attemptId"
            params={{ employerSlug, attemptId: item.attemptId }}
            className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("academy.reviews.review")}
          </Link>
        ) : (
          // No disabled button. A control that cannot be used is a question
          // ("why not?") the row should already have answered, and the answer
          // is the sentence, not a greyed-out rectangle.
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t(
              item.basis === "conflict:is_participant"
                ? "academy.reviews.whyNotOwnResponses"
                : item.basis === "not_authorised"
                  ? "academy.reviews.whyNotAuthorised"
                  : "academy.reviews.whyNotConflict",
            )}
            {/* The queue's own version of the same dead end: this row cannot
                be actioned by this reader, and somebody has to be able to. The
                link only appears for a reader who can actually staff the team. */}
            {item.basis === "conflict:is_participant" && canManageReviewers && (
              <>
                {" "}
                {t("academy.reviews.ownResponsesFix")}{" "}
                <Link
                  to="/employer/$employerSlug/settings"
                  params={{ employerSlug }}
                  hash="team"
                  className="font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t("employer.team.manageLink")}
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-[13px] font-medium text-foreground">{value}</dd>
    </div>
  );
}

const METRIC_SHELL = "rounded-[14px] border bg-card p-5 text-left";

/** A counter that filters the list beneath it.
 *
 *  A button rather than a link because the destination is this page: the
 *  filter is written to the URL so the view is shareable, but the click is not
 *  navigation and should not read as it. `aria-pressed` says which one is on,
 *  because the border alone does not reach a screen reader. */
function MetricLink({
  icon: Icon,
  label,
  value,
  active,
  onSelect,
}: {
  icon: typeof Clock;
  label: TranslationKey;
  value: number;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useT();
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={`${METRIC_SHELL} ${
        active ? "border-accent" : "border-border"
      } transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none`}
    >
      <MetricBody icon={Icon} label={t(label)} value={value} />
    </button>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: typeof Clock;
  label: TranslationKey;
  value: number;
  children?: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <div className={`${METRIC_SHELL} border-border`}>
      <MetricBody icon={Icon} label={t(label)} value={value} />
      {children}
    </div>
  );
}

function MetricBody({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
}) {
  return (
    <>
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </>
  );
}
