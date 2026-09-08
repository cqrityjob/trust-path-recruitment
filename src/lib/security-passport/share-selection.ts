// Security Passport — what a holder may put in a share, and how it is grouped.
//
// ── WHY THIS IS NOT A SECOND ELIGIBILITY RULE ──────────────────────────
//
// `share-policy.ts` states the rule once, and the database enforces it:
// `sp_create_selected_disclosure` refuses the whole create if any merit is not
// `lifecycle_state = 'active'` and the caller's own. That is the boundary, and
// nothing here moves it.
//
// This module exists so the holder is shown the SAME set the server would
// accept, rather than a list that offers them things the create will then
// reject. The guard asserts the policy module's text against the migration's.
// If the two ever disagree, the database wins and this is the bug — the same
// relationship packages.ts has with the payload builder.
//
// ── IT INVENTS NO TRUST VOCABULARY ─────────────────────────────────────
//
// Every row it returns is a `WorkspaceMerit`, built by
// `buildPassportWorkspace`, which asks the shared merit labeller. So the word
// beside a merit on the sharing screen is the same word the Passport
// workspace and the career home print for it, and a CQrityjob document review
// reads `documented` here exactly as it does everywhere else.
//
// ── A MERIT PAST ITS VALIDITY DATE IS STILL OFFERED ────────────────────
//
// `valid_until` in the past does not move `lifecycle_state`; expiry is derived
// at read time (validity.ts) precisely so nothing has to write it. So the
// server WILL carry such a credential, and the recipient page marks it expired
// through the same derivation. Hiding it here would mean the holder could not
// share a lapsed authorisation they have a perfectly good reason to evidence —
// and would also mean the screen disagreed with the create. It is offered, and
// it wears the `expired` label the labeller already gives it.

import { buildPassportWorkspace, type ReviewReadState, type WorkspaceMerit } from "./workspace";
import {
  caveatFor,
  isShareableMerit,
  shareEligibility,
  type ShareReviewCaveat,
} from "./share-policy";
import type { VerificationAttention } from "@/lib/professional-identity/verification-attention";
import type { PassportCopyKey } from "./i18n";
import type { Claim, ExperiencePeriod } from "./types";

/**
 * The three headings, in the order the sharing screen renders them.
 *
 * Employment first because it is what a recruiter reads first, then what the
 * holder was taught, then what an authority currently permits.
 */
export type ShareGroupId = "employment" | "qualification" | "authorisation";

/** One offered merit: the workspace's own row, plus what the holder must be
 *  told about its review state before they send it. */
export interface ShareCandidate {
  readonly merit: WorkspaceMerit;
  readonly caveat: ShareReviewCaveat;
}

export interface ShareGroup {
  readonly id: ShareGroupId;
  readonly titleKey: PassportCopyKey;
  readonly candidates: readonly ShareCandidate[];
}

/**
 * Which heading a credential sits under.
 *
 * Keyed on `claim_type`, which is the only classification the holder's
 * snapshot carries. The credential catalogue's own `category` (qualification
 * / appointment) would be the better key, but it is reference data the
 * Passport read does not fetch, and inventing a second classification to
 * avoid one extra query would be the worse trade.
 */
const GROUP_OF_CLAIM: Readonly<Record<Claim["claimType"], ShareGroupId>> = {
  training: "qualification",
  certification: "qualification",
  education: "qualification",
  professional_membership: "qualification",
  licence: "authorisation",
  specialisation: "authorisation",
};

/** What the holder holds that this screen cannot offer, and why. Counted so
 *  the empty state can say something true instead of "nothing here". */
export interface UnshareableCounts {
  /** Archived by lifecycle: expired, revoked, superseded, disputed. */
  readonly archived: number;
  /** Begun and not finished. Never a public merit. */
  readonly drafts: number;
}

export interface ShareSelectionModel {
  readonly groups: readonly ShareGroup[];
  /** Total merits across every group. Zero means the "nothing to share yet"
   *  state, which is a real state and not an error. */
  readonly eligibleCount: number;
  readonly unshareable: UnshareableCounts;
  /** Passed through from the workspace: the review read may have failed, and
   *  a screen that cannot read it must not print a review-derived word. */
  readonly reviewState: ReviewReadState;
  /** `reviewState !== "available"`. Every candidate then carries the `unknown`
   *  caveat, and the screen says so once, at the top, rather than letting a
   *  reader infer that no case is open. */
  readonly reviewUnavailable: boolean;
}

export interface ShareSelectionInput {
  readonly claims: readonly Claim[];
  readonly periods: readonly ExperiencePeriod[];
  readonly attention: VerificationAttention | null;
  readonly reviewState: ReviewReadState;
  readonly now: Date;
}

export function buildShareSelection(input: ShareSelectionInput): ShareSelectionModel {
  // `available` with no attention object is a contradiction: it claims the
  // review read answered while carrying no answer. The workspace trusts the
  // pairing and dereferences the object, so a caller that got it wrong took
  // the whole screen down rather than losing one badge.
  //
  // Normalised here instead, in the only direction that is honest: without an
  // answer the review-derived state is UNKNOWN. `loading` stays loading — the
  // answer may still be coming — and everything else becomes `failed`, which
  // is what "we do not have it" means once it is not still arriving.
  const reviewState: ReviewReadState =
    input.attention === null && input.reviewState === "available" ? "failed" : input.reviewState;

  const workspace = buildPassportWorkspace({
    claims: input.claims,
    periods: input.periods,
    attention: reviewState === "available" ? input.attention : null,
    reviewState,
    now: input.now,
  });

  // Every merit the workspace knows about, whichever group it put it in: a
  // credential with an open review is still current, and the holder may still
  // share it. The workspace's grouping answers "what needs you"; this screen
  // answers "what may be sent", and they are not the same question.
  const all: readonly WorkspaceMerit[] = [
    ...workspace.groups.current,
    ...workspace.groups.needsAnswer,
    ...workspace.groups.inReview,
    ...workspace.groups.reviewUnknown,
  ];

  const shareableClaimIds = new Set(input.claims.filter(isShareableMerit).map((c) => c.id));
  const shareablePeriodIds = new Set(input.periods.filter(isShareableMerit).map((p) => p.id));

  const eligible: readonly ShareCandidate[] = all
    .filter((m) => (m.kind === "claim" ? shareableClaimIds : shareablePeriodIds).has(m.id))
    .map((merit) => ({ merit, caveat: caveatFor(merit.label, reviewState) }));

  const claimById = new Map(input.claims.map((c) => [c.id, c] as const));
  const groupOf = (candidate: ShareCandidate): ShareGroupId =>
    candidate.merit.kind === "experience"
      ? "employment"
      : GROUP_OF_CLAIM[claimById.get(candidate.merit.id)?.claimType ?? "training"];

  const groups: readonly ShareGroup[] = (
    [
      { id: "employment", titleKey: "sel.group.employment" },
      { id: "qualification", titleKey: "sel.group.qualification" },
      { id: "authorisation", titleKey: "sel.group.authorisation" },
    ] as const satisfies readonly { id: ShareGroupId; titleKey: PassportCopyKey }[]
  )
    .map((g) => ({ ...g, candidates: eligible.filter((c) => groupOf(c) === g.id) }))
    .filter((g) => g.candidates.length > 0);

  const notShareable = [...input.claims, ...input.periods].map((row) => shareEligibility(row));

  return {
    groups,
    eligibleCount: eligible.length,
    unshareable: {
      archived: notShareable.filter((e) => e === "archived").length,
      drafts: notShareable.filter((e) => e === "unfinished").length,
    },
    reviewState,
    reviewUnavailable: reviewState !== "available",
  };
}

/** The ids a selection sends to the server, split the way the RPC takes them. */
export interface SelectedIds {
  readonly claimIds: readonly string[];
  readonly experienceIds: readonly string[];
}

/** A merit is keyed `claim:<id>` / `experience:<id>` so a claim and a period
 *  can never collide in one Set. */
export function meritKey(merit: Pick<WorkspaceMerit, "kind" | "id">): string {
  return `${merit.kind}:${merit.id}`;
}

export function splitSelection(selected: ReadonlySet<string>): SelectedIds {
  const claimIds: string[] = [];
  const experienceIds: string[] = [];
  for (const key of selected) {
    const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    if (kind === "claim") claimIds.push(id);
    else if (kind === "experience") experienceIds.push(id);
  }
  return { claimIds, experienceIds };
}
