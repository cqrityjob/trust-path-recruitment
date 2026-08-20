// #51 — The lifecycle vocabulary, rendered in one place.
//
// The state itself is derived in SQL (scp_attempt_lifecycle_state) and arrives
// on the row. This component only chooses words and colour for it. Keeping that
// mapping here is what stops the employer pipeline, the person page and the
// participant's history from inventing three different labels for one attempt.
//
// Employer and participant read the same state but are told different things
// about it: "Klar att frisläppa" is an employer action, and to the participant
// the same moment is "Resultatet förbereds". Same fact, different audience --
// which is why audience is a parameter and not a second derivation.

import { useT } from "@/i18n/context";
import type { LifecycleState } from "@/lib/security-competency/assessment-lifecycle.functions";

const TONE: Record<LifecycleState, string> = {
  invited: "border-border text-muted-foreground",
  in_progress: "border-sky-500/40 bg-sky-500/10 text-foreground",
  under_review: "border-amber-500/40 bg-amber-500/10 text-foreground",
  processing: "border-border bg-muted/60 text-muted-foreground",
  ready_to_release: "border-emerald-500/50 bg-emerald-500/10 text-foreground",
  result_available: "border-emerald-600/50 bg-emerald-600/15 text-foreground",
  abandoned: "border-border text-muted-foreground line-through",
};

export function LifecycleChip({
  state,
  audience = "employer",
}: {
  state: LifecycleState;
  audience?: "employer" | "participant";
}) {
  const { t } = useT();
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[state]}`}
    >
      {lifecycleLabel(t, state, audience)}
    </span>
  );
}

/** Exported so tables and cards can label without rendering a chip. */
export function lifecycleLabel(
  t: (k: never) => string,
  state: LifecycleState,
  audience: "employer" | "participant" = "employer",
): string {
  const tt = t as unknown as (k: string) => string;
  if (audience === "participant") {
    switch (state) {
      case "invited": return tt("lifecycle.participant.invited");
      case "in_progress": return tt("lifecycle.participant.in_progress");
      case "under_review": return tt("lifecycle.participant.under_review");
      case "processing": return tt("lifecycle.participant.processing");
      case "ready_to_release": return tt("lifecycle.participant.processing");
      case "result_available": return tt("lifecycle.participant.result_available");
      case "abandoned": return tt("lifecycle.abandoned");
    }
  }
  switch (state) {
    case "invited": return tt("lifecycle.employer.invited");
    case "in_progress": return tt("lifecycle.employer.in_progress");
    case "under_review": return tt("lifecycle.employer.under_review");
    case "processing": return tt("lifecycle.employer.processing");
    case "ready_to_release": return tt("lifecycle.employer.ready_to_release");
    case "result_available": return tt("lifecycle.employer.result_available");
    case "abandoned": return tt("lifecycle.abandoned");
  }
}

/** What the employer should do next. Never invents an action the lifecycle
 *  does not support: waiting states say who is being waited on. */
export function nextActionLabel(t: (k: never) => string, state: LifecycleState): string {
  const tt = t as unknown as (k: string) => string;
  switch (state) {
    case "invited": return tt("lifecycle.next.awaitingParticipant");
    case "in_progress": return tt("lifecycle.next.awaitingParticipant");
    case "under_review": return tt("lifecycle.next.awaitingReview");
    case "processing": return tt("lifecycle.next.processing");
    case "ready_to_release": return tt("lifecycle.next.release");
    case "result_available": return tt("lifecycle.next.viewResult");
    case "abandoned": return tt("lifecycle.next.none");
  }
}
