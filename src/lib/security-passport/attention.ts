// Security Passport — what needs the holder's attention, and what is waiting.
//
// ── WHY THIS IS A MODULE AND NOT A BLOCK OF JSX ────────────────────────
//
// An overview that lists everything a holder owns is a report. An overview
// that says "one thing is being reviewed, one thing is waiting on you, one
// licence lapses in six weeks" is a product. The difference is entirely in
// this derivation, so it lives where it can be read and tested rather than
// inside a component.
//
// ── WHY IT IS NOT A COUNT OF PROBLEMS ──────────────────────────────────
//
// Three buckets, each with a plain meaning:
//
//   * WAITING   — somebody else is acting. The holder does nothing.
//   * ACTION    — the holder is the blocker: a reviewer asked for something,
//                 or a credential is about to lapse.
//   * EXPIRING  — a dated warning, separate from ACTION because it is not a
//                 failure and must not read as one.
//
// Nothing here scores the Passport or grades the person. There is no total,
// no percentage complete and no "health" figure: a holder with two
// self-declared entries is not 40% of a professional.
//
// ── WHY EXPIRY IS 60 DAYS ──────────────────────────────────────────────
//
// An ordningsvakt appointment is renewed through an authority, not overnight.
// Sixty days is long enough to start that and short enough that the notice
// still feels current. It is one constant, here, rather than a number chosen
// twice in two components.

import type { Claim, ExperiencePeriod, IsoDate } from "./types";
import { validityOf } from "./validity";

/** How far ahead a lapse is worth mentioning. */
export const EXPIRY_HORIZON_DAYS = 60;

/** The status of an open review for one entry, keyed by the entry's id.
 *  Absent means no review is open. */
export type OpenReviews = ReadonlyMap<string, "pending" | "clarification_requested">;

export interface AttentionItem {
  readonly kind: "claim" | "experience";
  readonly id: string;
  readonly title: string;
  /** Days until it lapses. Only present for `expiring`. */
  readonly daysLeft?: number;
}

export interface AttentionSummary {
  /** Under review by somebody else. The holder waits. */
  readonly waiting: readonly AttentionItem[];
  /** A reviewer asked the holder for something. */
  readonly needsHolder: readonly AttentionItem[];
  /** Verified and currently valid, but lapsing within the horizon. */
  readonly expiring: readonly AttentionItem[];
  /** Already lapsed while still stored active — visible so it can be renewed
   *  rather than quietly presenting as current. */
  readonly expired: readonly AttentionItem[];
  /** True when none of the four buckets has anything in it. */
  readonly clear: boolean;
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Everything the overview needs, derived once.
 *
 * `evaluationOn` rather than "today" because expiry is derived, and a card
 * rendered for a past date must answer for that date. `openReviews` comes from
 * the holder's own verification requests; when the caller has not loaded them
 * the waiting and action buckets are simply empty rather than guessed at.
 */
export function attentionFor(
  claims: readonly Claim[],
  periods: readonly ExperiencePeriod[],
  evaluationOn: IsoDate,
  openReviews: OpenReviews = new Map(),
): AttentionSummary {
  const waiting: AttentionItem[] = [];
  const needsHolder: AttentionItem[] = [];
  const expiring: AttentionItem[] = [];
  const expired: AttentionItem[] = [];

  const consider = (
    kind: "claim" | "experience",
    id: string,
    title: string,
    lifecycle: Claim["lifecycleState"],
    validUntil: IsoDate | null,
    assertion: Claim["assertionLevel"],
  ): void => {
    const review = openReviews.get(id);
    if (review === "clarification_requested") {
      needsHolder.push({ kind, id, title });
    } else if (review === "pending") {
      waiting.push({ kind, id, title });
    }

    // Expiry is only interesting for something that was actually checked: a
    // self-declared entry with a past date needs correcting, not renewing,
    // and saying "renew" about it would be the wrong instruction.
    if (assertion !== "verified") return;

    const validity = validityOf(lifecycle, validUntil, evaluationOn);
    if (validity.hasExpired) {
      expired.push({ kind, id, title });
      return;
    }
    if (validUntil) {
      const left = daysBetween(evaluationOn, validUntil);
      if (left >= 0 && left <= EXPIRY_HORIZON_DAYS) {
        expiring.push({ kind, id, title, daysLeft: left });
      }
    }
  };

  for (const c of claims) {
    if (c.lifecycleState === "draft") continue; // drafts are their own section
    consider("claim", c.id, c.titleSv, c.lifecycleState, c.validUntil, c.assertionLevel);
  }
  for (const p of periods) {
    consider(
      "experience",
      p.id,
      `${p.roleTitle} · ${p.employerName}`,
      p.lifecycleState,
      null,
      p.assertionLevel,
    );
  }

  // Soonest first: the one that lapses in nine days matters more than the one
  // that lapses in fifty.
  expiring.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  return {
    waiting,
    needsHolder,
    expiring,
    expired,
    clear:
      waiting.length === 0 &&
      needsHolder.length === 0 &&
      expiring.length === 0 &&
      expired.length === 0,
  };
}
