// Every decision the BESKT governance surface makes for itself, in one file.
//
// ── WHY THESE ARE NOT INSIDE THE COMPONENTS ─────────────────────────────
//
// Each function below encodes a rule that is easy to get subtly wrong and
// impossible to see wrong from a rendered screen:
//
//   what a save actually sends, given the absent-versus-null contract
//   whether a recorded approval still counts
//   whether a mandate or a pilot grant is live right now
//
// A guard that asserted these through a render would be asserting the
// rendering. Pulling them out means the guard can call them with the exact
// inputs that matter — an unchanged field, an emptied one, an approval whose
// cycle moved, a grant that expired yesterday — and a planted negative
// control can break each one on its own.
//
// Nothing here is an authority. The database re-decides all three, and it is
// the database's answer that governs. These exist so the SCREEN does not
// mislead the person reading it in the moment before the database answers.

import type {
  BesktAuthorPayload,
  BesktContentRow,
  BesktGate,
  BesktReviewRecord,
} from "@/lib/beskt/governance.functions";
import type { BesktFieldSpec } from "./content-schema";

/** The draft state of one form: every governed field as a string, list or flag. */
export type BesktFormState = Record<string, string | string[] | boolean>;

/** What a form starts as: the stored row, or empty for a new one. */
export function besktInitialFormState(
  spec: readonly BesktFieldSpec[],
  row: BesktContentRow | null,
): BesktFormState {
  const state: BesktFormState = {};
  for (const field of spec) {
    const stored = row ? (row as Record<string, unknown>)[field.name] : undefined;
    if (field.kind === "multiselect") {
      state[field.name] = Array.isArray(stored) ? (stored as string[]) : [];
    } else if (field.kind === "boolean") {
      state[field.name] = stored === true;
    } else {
      state[field.name] =
        stored === null || stored === undefined ? "" : String(stored as string | number);
    }
  }
  return state;
}

/**
 * The payload to send, given what the form holds and what was stored.
 *
 * The `beskt_author_*` RPCs distinguish `? 'key'` from a json null: a key
 * that is NOT in the payload leaves the stored column untouched, and a key
 * sent as null clears it. So three cases, and all three matter:
 *
 *   unchanged  →  absent, so a partial edit cannot blank a governed field
 *                 the editor never looked at
 *   changed    →  present, with the new value
 *   emptied    →  present as null, so clearing is expressible at all
 *
 * On a CREATE there is nothing to leave alone, so every field that has a
 * value is sent and an empty optional one is simply omitted — which is how
 * the column takes its own default rather than an explicit null.
 */
export function besktAuthorPayload(
  spec: readonly BesktFieldSpec[],
  state: BesktFormState,
  stored: BesktContentRow | null,
): BesktAuthorPayload {
  const payload: BesktAuthorPayload = {};
  const storedBag = stored as Record<string, unknown> | null;

  for (const field of spec) {
    const value = state[field.name];

    if (field.kind === "multiselect") {
      const next = (value as string[]) ?? [];
      const before = Array.isArray(storedBag?.[field.name])
        ? (storedBag![field.name] as string[])
        : [];
      // Sorted before comparing as well as before sending: the stored array
      // comes back in the database's order, and a reordering that selects
      // exactly the same values is not a change worth bumping a revision for.
      const nextSorted = [...next].sort();
      const beforeSorted = [...before].sort();
      const changed =
        nextSorted.length !== beforeSorted.length ||
        nextSorted.some((v, i) => v !== beforeSorted[i]);
      if (stored === null || changed) payload[field.name] = nextSorted;
      continue;
    }

    if (field.kind === "boolean") {
      const next = value === true;
      const before = storedBag?.[field.name] === true;
      if (stored === null || next !== before) payload[field.name] = next;
      continue;
    }

    const text = String(value ?? "").trim();
    const beforeRaw = storedBag?.[field.name];
    const before = beforeRaw === null || beforeRaw === undefined ? "" : String(beforeRaw);

    if (stored === null) {
      if (text !== "") payload[field.name] = field.kind === "integer" ? Number(text) : text;
      continue;
    }

    if (text === before) continue;
    if (text === "") {
      payload[field.name] = null;
      continue;
    }
    payload[field.name] = field.kind === "integer" ? Number(text) : text;
  }

  return payload;
}

/**
 * Why one gate does or does not currently count.
 *
 * `undecided` means nobody has decided it. `stale` means somebody did and it
 * no longer binds — a different fact, worded differently, because a reviewer
 * who is told "not decided" about their own approval will reasonably think
 * the system lost it.
 */
export type BesktGateState =
  | { readonly kind: "undecided" }
  | { readonly kind: "approved"; readonly review: BesktReviewRecord }
  | { readonly kind: "rejected"; readonly review: BesktReviewRecord }
  | {
      readonly kind: "stale";
      readonly review: BesktReviewRecord;
      readonly reason: "hash" | "revision" | "cycle";
    };

/**
 * The three things an approval binds to, checked in the order that explains
 * the most: the CYCLE first, because after a rejection and a resubmission
 * every gate is stale for that reason and saying "the content changed" would
 * be wrong; then the HASH; then the REVISION, which catches an edit that
 * restored byte-identical content and therefore left the hash alone.
 *
 * The REVISION binds only while the content can still be edited. Publishing,
 * suspending and retiring each advance the revision without touching the
 * content, which is frozen from publication on -- so on a published version
 * the approvals it was published on are exactly the ones recorded one
 * revision earlier. Comparing revisions there would call every approval that
 * published the method "no longer counts", which is false. Cycle and hash
 * still apply, because they are still facts about the content.
 */
export function besktGateState(
  gate: BesktGate,
  reviews: readonly BesktReviewRecord[],
  version: {
    readonly contentHash: string | null;
    readonly revision: number;
    readonly reviewCycle: number;
    readonly contentStatus?: string;
  },
): BesktGateState {
  // The workspace returns reviews newest first, so the first match is the
  // one that stands.
  const review = reviews.find((r) => r.gate === gate);
  if (!review) return { kind: "undecided" };
  if (review.decision === "rejected") return { kind: "rejected", review };
  if (review.reviewCycleAtReview !== version.reviewCycle)
    return { kind: "stale", review, reason: "cycle" };
  if (review.contentHashAtReview !== version.contentHash)
    return { kind: "stale", review, reason: "hash" };
  const contentFrozen =
    version.contentStatus === "published" ||
    version.contentStatus === "suspended" ||
    version.contentStatus === "retired";
  if (!contentFrozen && review.revisionAtReview !== version.revision)
    return { kind: "stale", review, reason: "revision" };
  return { kind: "approved", review };
}

/**
 * A governance mandate is live when it is unrevoked AND inside its window.
 *
 * All three conditions, because the database checks all three: a revoked
 * mandate, one that has not started and one that has expired each record
 * nothing, and a screen that showed any of them as live would be telling a
 * reviewer they can decide a gate they cannot.
 */
export function besktGrantIsLive(
  grant: {
    readonly revokedAt: string | null;
    readonly validFrom?: string;
    readonly validUntil: string | null;
  },
  now: Date,
): boolean {
  if (grant.revokedAt !== null) return false;
  if (grant.validFrom !== undefined && new Date(grant.validFrom) > now) return false;
  if (grant.validUntil !== null && new Date(grant.validUntil) <= now) return false;
  return true;
}

/**
 * A pilot grant is live on a given day.
 *
 * Half-open, exactly as `bcp_pilot_grant_active` reads it: the start day
 * counts and the expiry day does not. Comparing ISO date strings is correct
 * here and deliberate — both values are `date` columns with no time and no
 * zone, and putting them through `Date` would introduce one.
 */
export function besktPilotIsLive(
  grant: {
    readonly revokedAt: string | null;
    readonly startsOn: string;
    readonly expiresOn: string;
  },
  today: string,
): boolean {
  if (grant.revokedAt !== null) return false;
  return grant.startsOn <= today && today < grant.expiresOn;
}
