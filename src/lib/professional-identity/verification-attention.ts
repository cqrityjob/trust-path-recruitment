// What a verification decision means TO THE HOLDER — one derivation, read by
// every candidate surface that reports on it.
//
// ── THE DEFECT THIS REPLACES ───────────────────────────────────────────
//
// The Passport overview built its attention list from a map of OPEN reviews:
// every request whose status was neither `pending` nor
// `clarification_requested` was skipped before the map was built. A decision
// therefore removed a request from the holder's attention entirely. An
// employer who answered "we cannot confirm this employment", and wrote the
// holder a message explaining why, produced a Passport that said "Inget
// väntar på dig". The candidate could only find the outcome by remembering
// which entry they had submitted and opening it.
//
// A decision is the single most important thing that happens to a
// verification request, and it was the one state the summary could not see.
//
// ── WHY OUTCOMES ARE NOT ALL THE SAME ──────────────────────────────────
//
// Lumping them into one "needs attention" count would be the opposite error:
// a holder whose credential was just approved has nothing to do, and a red
// badge telling them otherwise is a lie in the other direction. So each
// outcome is placed by what it actually asks of the person:
//
//   ACTION REQUIRED  a reviewer asked them for something. They are the
//                    blocker and there is a specific thing to go and do.
//   OUTCOME          somebody decided, it did not go their way, and there
//                    is a choice to make about what happens next.
//   INFORMATION      somebody decided and it did go their way. Worth
//                    seeing; not worth demanding anything for.
//   WAITING          a review is open. Explicitly "nothing you need to do",
//                    said in words, because silence about a submission
//                    reads as having been forgotten.
//
// ── WHY APPROVALS EXPIRE FROM THIS LIST AND REFUSALS DO NOT ────────────
//
// An approval is news. It stops being news, and a home page still
// announcing a credential verified four months ago is a notification centre
// with no dismiss button — which §14 of the brief and the ladder's own
// "what this must not become" both refuse. `RECENT_OUTCOME_DAYS` bounds it.
//
// A refusal is not news, it is an unresolved situation: the employment is
// still unverified and the holder still has a decision to make about it.
// It stays until the holder does something that changes the state — a
// corrected entry, or a fresh request, both of which produce a new request
// row and retire the old one from `latestPerSubject`.
//
// ── WHAT MAY NOT APPEAR HERE ───────────────────────────────────────────
//
// `decision_note` is the reviewer's internal reasoning and reaches no
// candidate surface in this repository; `listMyVerificationRequests` does
// not select it, and this module never sees it. `holderMessage` is the
// field written FOR the holder, and it is the only free text carried.
// Reviewer identity is likewise absent: `MyVerificationRequest` has no
// column for it. Those two omissions are the PR 6-9 privacy boundary, and
// they are preserved by having nothing to leak rather than by remembering
// not to render it.

import type {
  MyVerificationRequest,
  VerificationStatus,
} from "@/lib/security-passport/verification.functions";

export const VERIFICATION_ATTENTION_VERSION = "verification-attention-v1" as const;

/** How long a settled, favourable outcome stays worth announcing. */
export const RECENT_OUTCOME_DAYS = 30;

/**
 * What this item asks of the holder. Ordered by how much it asks, which is
 * the order the surfaces render in.
 */
export type AttentionTone =
  /** A reviewer asked for something. The holder is the blocker. */
  | "action_required"
  /** Decided, and not in the holder's favour. Nothing is broken, but there
   *  is a choice to make. */
  | "outcome"
  /** Decided in the holder's favour, recently. Purely to be seen. */
  | "information"
  /** Open with somebody else. Stated so it does not read as forgotten. */
  | "waiting";

/** What the holder can do about it next. Presentation resolves the words;
 *  this names the option so the copy cannot invent one the product does not
 *  support. */
export type AttentionNextStep =
  /** Answer the reviewer — the entry itself is where the answer goes. */
  | "respond_to_reviewer"
  /** Correct the entry, then ask again. */
  | "correct_and_resubmit"
  /** Ask CQrityjob to review documentation instead of the employer. */
  | "try_document_review"
  /** Nothing. Said explicitly. */
  | "none";

export interface VerificationAttentionItem {
  /** The request row. Stable, and the holder's own. */
  readonly requestId: string;
  /** Which entry this is about, so a surface can open it. */
  readonly subjectKind: "claim" | "experience";
  readonly subjectId: string;
  readonly status: VerificationStatus;
  readonly kind: MyVerificationRequest["kind"];
  readonly tone: AttentionTone;
  readonly nextStep: AttentionNextStep;
  /** What the decider wrote FOR the holder. Never an internal note. */
  readonly holderMessage: string | null;
  readonly decidedAt: string | null;
  readonly submittedAt: string;
}

export interface VerificationAttention {
  readonly version: typeof VERIFICATION_ATTENTION_VERSION;
  /** A reviewer is waiting on the holder. */
  readonly actionRequired: readonly VerificationAttentionItem[];
  /** Decided, not in their favour, still unresolved. */
  readonly outcomes: readonly VerificationAttentionItem[];
  /** Decided in their favour, recently. */
  readonly information: readonly VerificationAttentionItem[];
  /** Open elsewhere. Nothing for the holder to do. */
  readonly waiting: readonly VerificationAttentionItem[];
  /**
   * True only when NOTHING is in any of the four lists.
   *
   * Read by every surface that would otherwise print "nothing needs your
   * attention", which is the sentence this whole module exists to stop
   * being false.
   */
  readonly clear: boolean;
  /**
   * The verification state could not be read.
   *
   * Separate from `clear`, and the distinction is the point: a failed read
   * and a holder with nothing outstanding produce the same empty lists, and
   * telling somebody with an unanswered clarification that nothing needs
   * them is exactly the error this codebase records elsewhere as its worst
   * class of defect. A surface must say "we could not check" rather than
   * "you are up to date".
   */
  readonly unavailable: boolean;
}

const EMPTY_LISTS = {
  actionRequired: [] as readonly VerificationAttentionItem[],
  outcomes: [] as readonly VerificationAttentionItem[],
  information: [] as readonly VerificationAttentionItem[],
  waiting: [] as readonly VerificationAttentionItem[],
};

/** The read did not answer. Every list empty, `clear` FALSE. */
export const VERIFICATION_ATTENTION_UNAVAILABLE: VerificationAttention = {
  version: VERIFICATION_ATTENTION_VERSION,
  ...EMPTY_LISTS,
  clear: false,
  unavailable: true,
};

function daysSince(iso: string, now: Date): number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/**
 * The most recent request per subject.
 *
 * A holder who corrects an employment and resubmits has two rows about one
 * entry, and only the newer one describes where that entry stands. Showing
 * both would tell somebody their employment was simultaneously refused and
 * under review. Ties on `submittedAt` are broken by request id so the result
 * is stable across loads rather than dependent on array order.
 */
function latestPerSubject(
  requests: readonly MyVerificationRequest[],
): readonly MyVerificationRequest[] {
  const best = new Map<string, MyVerificationRequest>();
  for (const r of requests) {
    const subjectId = r.claimId ?? r.periodId;
    if (!subjectId) continue;
    const held = best.get(subjectId);
    if (
      !held ||
      r.submittedAt > held.submittedAt ||
      (r.submittedAt === held.submittedAt && r.id > held.id)
    ) {
      best.set(subjectId, r);
    }
  }
  return [...best.values()];
}

/**
 * What the holder may do about a refusal.
 *
 * An employer who could not confirm is answering about a fact they were
 * party to, so the two honest options are to correct what was stated or to
 * ask CQrityjob to read the documentation instead. A CQrityjob review that
 * refused has already looked at the documentation, so only correction is
 * left. Neither branch invents an external-invitation path: that is
 * explicitly not built.
 */
function refusalNextStep(kind: MyVerificationRequest["kind"]): AttentionNextStep {
  return kind === "employer_attestation" ? "try_document_review" : "correct_and_resubmit";
}

/**
 * Everything the candidate surfaces need, derived once.
 *
 * `now` is a parameter rather than a call to the clock so the recency
 * boundary is testable and so a surface rendering for a past moment answers
 * for that moment. Pure: same inputs, same output.
 */
export function deriveVerificationAttention(
  requests: readonly MyVerificationRequest[],
  now: Date = new Date(),
): VerificationAttention {
  const actionRequired: VerificationAttentionItem[] = [];
  const outcomes: VerificationAttentionItem[] = [];
  const information: VerificationAttentionItem[] = [];
  const waiting: VerificationAttentionItem[] = [];

  for (const r of latestPerSubject(requests)) {
    const subjectId = r.claimId ?? r.periodId;
    if (!subjectId) continue;

    const base = {
      requestId: r.id,
      subjectKind: (r.claimId ? "claim" : "experience") as "claim" | "experience",
      subjectId,
      status: r.status,
      kind: r.kind,
      holderMessage: r.holderMessage,
      decidedAt: r.decidedAt,
      submittedAt: r.submittedAt,
    };

    switch (r.status) {
      case "clarification_requested":
        actionRequired.push({ ...base, tone: "action_required", nextStep: "respond_to_reviewer" });
        break;

      case "rejected":
        outcomes.push({ ...base, tone: "outcome", nextStep: refusalNextStep(r.kind) });
        break;

      case "approved":
        // News, while it is still news. See the header.
        if (r.decidedAt && daysSince(r.decidedAt, now) <= RECENT_OUTCOME_DAYS) {
          information.push({ ...base, tone: "information", nextStep: "none" });
        }
        break;

      case "pending":
        waiting.push({ ...base, tone: "waiting", nextStep: "none" });
        break;

      case "withdrawn":
        // The holder withdrew it themselves. Reporting their own action back
        // to them as an outcome would be the product narrating.
        break;
    }
  }

  // Newest first inside each list: the decision somebody is most likely to
  // be looking for is the one that just happened.
  const byRecency = (a: VerificationAttentionItem, b: VerificationAttentionItem) =>
    (b.decidedAt ?? b.submittedAt).localeCompare(a.decidedAt ?? a.submittedAt);
  actionRequired.sort(byRecency);
  outcomes.sort(byRecency);
  information.sort(byRecency);
  waiting.sort(byRecency);

  return {
    version: VERIFICATION_ATTENTION_VERSION,
    actionRequired,
    outcomes,
    information,
    waiting,
    clear:
      actionRequired.length === 0 &&
      outcomes.length === 0 &&
      information.length === 0 &&
      waiting.length === 0,
    unavailable: false,
  };
}

/** Everything that genuinely asks something of the holder. The one number a
 *  surface may badge, and it deliberately excludes `information` and
 *  `waiting`. */
export function attentionDemandCount(attention: VerificationAttention): number {
  return attention.actionRequired.length + attention.outcomes.length;
}
