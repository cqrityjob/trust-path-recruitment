// Security Passport — what a holder may put in a share, and how it is grouped.
//
// ── WHY THIS IS NOT A SECOND ELIGIBILITY RULE ──────────────────────────
//
// `sp_create_selected_disclosure` decides what may be shared, and it decides
// it in the database: a merit must belong to the caller, be
// `assertion_level = 'verified'` and be `lifecycle_state = 'active'`, or the
// whole create is refused by name. That is the boundary, and nothing here
// moves it.
//
// This module exists so the holder is shown the SAME set the server would
// accept, rather than a list that offers them things the create will then
// reject. `ELIGIBLE` below is that rule restated once, in one place, and the
// guard script asserts it against the migration's own text. If the two ever
// disagree, the database wins and this is the bug — the same relationship
// packages.ts has with `sp_disclosure_payload`.
//
// ── IT INVENTS NO TRUST VOCABULARY ─────────────────────────────────────
//
// Every row it returns is a `WorkspaceMerit`, built by
// `buildPassportWorkspace`, which asks the shared merit labeller. So the word
// beside a merit on the sharing screen is the same word the Passport
// workspace and the career home print for it, and a CQrityjob document review
// reads `documented` here exactly as it does everywhere else.
//
// ── WHY A MERIT PAST ITS VALIDITY DATE IS STILL OFFERED ────────────────
//
// `valid_until` in the past does not move `lifecycle_state`; expiry is
// derived at read time (validity.ts) precisely so nothing has to write it.
// So the server WILL carry such a credential, and the recipient page marks it
// expired through the same derivation. Hiding it here would mean the holder
// could not share a lapsed authorisation they have a perfectly good reason to
// evidence — a completed training, a licence they are renewing — and would
// also mean the screen disagreed with the create. It is offered, and it wears
// the `expired` label the labeller already gives it.

import { buildPassportWorkspace, type ReviewReadState, type WorkspaceMerit } from "./workspace";
import type { VerificationAttention } from "@/lib/professional-identity/verification-attention";
import type { PassportCopyKey } from "./i18n";
import type { Claim, ExperiencePeriod } from "./types";

/**
 * The server's rule, restated. Applied to the RAW row rather than to a
 * derived label: the labels are a presentation grouping and several of them
 * (`verification_requested`, `clarification_needed`) say nothing about
 * whether the underlying merit is verified and active.
 */
export function isShareable(row: {
  readonly assertionLevel: string;
  readonly lifecycleState: string;
}): boolean {
  return row.assertionLevel === "verified" && row.lifecycleState === "active";
}

/**
 * The three headings, in the order the sharing screen renders them.
 *
 * Employment first because it is what a recruiter reads first, then what the
 * holder was taught, then what an authority currently permits.
 */
export type ShareGroupId = "employment" | "qualification" | "authorisation";

export interface ShareGroup {
  readonly id: ShareGroupId;
  readonly titleKey: PassportCopyKey;
  readonly merits: readonly WorkspaceMerit[];
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
  /** Recorded or document-provided: real merits, not yet verified. */
  readonly notVerified: number;
  /** Archived by lifecycle: revoked, superseded, disputed, withdrawn. */
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
  // credential with an open review is still verified and active, and the
  // holder may still share it. The workspace's grouping answers "what needs
  // you"; this screen answers "what may be sent", and they are not the same
  // question.
  const all: readonly WorkspaceMerit[] = [
    ...workspace.groups.current,
    ...workspace.groups.needsAnswer,
    ...workspace.groups.inReview,
    ...workspace.groups.reviewUnknown,
  ];

  const shareableClaimIds = new Set(input.claims.filter(isShareable).map((c) => c.id));
  const shareablePeriodIds = new Set(input.periods.filter(isShareable).map((p) => p.id));

  const eligible = all.filter((m) =>
    m.kind === "claim" ? shareableClaimIds.has(m.id) : shareablePeriodIds.has(m.id),
  );

  const claimById = new Map(input.claims.map((c) => [c.id, c] as const));

  const groups: readonly ShareGroup[] = (
    [
      {
        id: "employment",
        titleKey: "sel.group.employment",
        merits: eligible.filter((m) => m.kind === "experience"),
      },
      {
        id: "qualification",
        titleKey: "sel.group.qualification",
        merits: eligible.filter(
          (m) =>
            m.kind === "claim" &&
            GROUP_OF_CLAIM[claimById.get(m.id)?.claimType ?? "training"] === "qualification",
        ),
      },
      {
        id: "authorisation",
        titleKey: "sel.group.authorisation",
        merits: eligible.filter(
          (m) =>
            m.kind === "claim" &&
            GROUP_OF_CLAIM[claimById.get(m.id)?.claimType ?? "training"] === "authorisation",
        ),
      },
    ] as const satisfies readonly ShareGroup[]
  ).filter((g) => g.merits.length > 0);

  return {
    groups,
    eligibleCount: eligible.length,
    unshareable: {
      notVerified:
        input.claims.filter((c) => c.lifecycleState === "active" && !isShareable(c)).length +
        input.periods.filter((p) => p.lifecycleState === "active" && !isShareable(p)).length,
      archived: workspace.groups.archived.length,
      drafts: workspace.groups.drafts.length,
    },
    reviewState: workspace.reviewState,
    reviewUnavailable: workspace.unavailable,
  };
}

/** The ids a selection sends to the server, split the way the RPC takes them. */
export interface SelectedIds {
  readonly claimIds: readonly string[];
  readonly experienceIds: readonly string[];
}

/** Splits a flat set of selected merit keys back into the two id lists.
 *  A merit is keyed `claim:<id>` / `experience:<id>` so a claim and a period
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
