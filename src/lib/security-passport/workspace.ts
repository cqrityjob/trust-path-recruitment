// Security Passport — the holder's workspace, derived once.
//
// ── WHAT THIS ANSWERS ──────────────────────────────────────────────────
//
// After the first run the Passport stops being a form and becomes a place a
// person returns to. Four questions decide what that place shows:
//
//   1. what is in here            → the merit groups
//   2. how well is it backed      → the status counts
//   3. what should I do next      → ONE next step
//   4. is any of that unknowable  → `unavailable`
//
// All four are derived here, purely, from rows the route already reads. A
// component that decided any of them for itself would be a second answer to
// a question this product has to answer once.
//
// ── IT ADDS NO TRUST VOCABULARY ────────────────────────────────────────
//
// Every trust statement on this page comes from `labelMerit` in
// professional-identity/passport-merits.ts — the same function My Career
// counts with. That is deliberate and it is the whole reason this module
// imports across the domain boundary rather than counting for itself: the
// career home and the Passport were once two derivations of "how many
// merits do you have", and they disagreed. There is one derivation. This
// module groups and orders its output; it never relabels it.
//
// So: no rung is invented here, nothing is promoted here, and a document
// CQrityjob reviewed is `documented` on this page exactly as it is on every
// other one. `verified` remains what PR #189 made it — a SOURCE confirming
// a fact it was party to — and a document review can never reach it.
//
// ── LIFECYCLE COMES FROM ONE PLACE TOO ─────────────────────────────────
//
// `isCurrentMerit` / `isUnfinishedMerit` / `isArchivedMerit` from types.ts,
// unchanged. A draft is unfinished private work, an archived row is history,
// and neither is ever shown under the same heading as a current merit.
//
// ── UNKNOWN IS NOT ZERO, AND IT IS NOT "NOTHING TO DO" ─────────────────
//
// When the verification read did not answer, the review-derived counts are
// null and `nextStep` is null with `unavailable` true. A recommendation
// built on a trust standing nobody could read is exactly the misleading
// action the brief refuses, and "nothing needs you" is the sentence that
// must never be printed on top of an unread clarification.

import {
  countMeritRows,
  labelMerit,
  reviewStateOf,
  type MeritCounts,
  type MeritLabel,
  type MeritRow,
  type ReviewState,
} from "@/lib/professional-identity/passport-merits";
import { meritFigures, type MeritFigures } from "@/lib/professional-identity/merit-figures";
import type { VerificationAttention } from "@/lib/professional-identity/verification-attention";
import type { PassportCopyKey } from "./i18n";
import {
  isArchivedMerit,
  isCurrentMerit,
  isUnfinishedMerit,
  type Claim,
  type ExperiencePeriod,
  type IsoDate,
  type LifecycleState,
} from "./types";

export const PASSPORT_WORKSPACE_VERSION = "passport-workspace-v2" as const;

/**
 * How the verification read is doing.
 *
 * ── WHY LOADING IS NOT A THIRD NAME FOR FAILED ─────────────────────────
 *
 * It used to be. The route initialised its attention state to the shared
 * UNAVAILABLE sentinel, so for as long as a perfectly healthy request took
 * to answer, the page said the read had failed — a slow network announcing
 * an error that had not happened. Three states, and only one of them is an
 * error:
 *
 *   loading    the answer has not arrived. Say nothing about it.
 *   available  the answer arrived. Everything review-derived is known.
 *   failed     the read did not answer. Say so, once, with a retry.
 *
 * Both `loading` and `failed` suppress the recommended step, because both
 * mean the review-dependent state is UNKNOWN. Only `failed` says so out
 * loud.
 */
export type ReviewReadState = "loading" | "available" | "failed";

/* ------------------------------------------------------------------ */
/* One merit, as the workspace lists it                                */
/* ------------------------------------------------------------------ */

/** Which pair of dates a row carries, so a renderer never prints an issue
 *  date under the heading "employed". */
export type MeritDateKind = "period" | "validity";

/**
 * What the workspace may say about one merit's standing.
 *
 * The shared labeller's seven values, plus `unknown` — which exists because
 * FOUR of those seven are only reachable by knowing whether a review is
 * open, and the review read can fail.
 */
export type WorkspaceMeritStatus = MeritLabel | "unknown";

/**
 * The labels that are a statement about the REVIEW, not about stored data.
 *
 * ── WHY `added_by_you` IS ON THIS LIST ─────────────────────────────────
 *
 * It is the label `labelMerit` falls through to when nothing else applies —
 * including when `openReview` and `clarificationOpen` are both false. Fed an
 * EMPTY review set because the read failed, a merit that is actually pending,
 * or that actually has a reviewer's question against it, comes back
 * `added_by_you` and renders as an ordinary registered merit. That is the
 * page inventing the reassuring answer out of a failure, which is precisely
 * the class of defect this codebase spends its comments refusing.
 *
 * `documented`, `verified` and `expired` are NOT on the list: each is a
 * function of the stored assertion level, method, subject and lifecycle, and
 * remains exactly as true when the request table cannot be read. A merit
 * CQrityjob reviewed was reviewed whether or not we can see today's queue.
 */
const REVIEW_DEPENDENT: readonly MeritLabel[] = [
  "added_by_you",
  "document_provided",
  "verification_requested",
  "clarification_needed",
];

/**
 * One merit's status, failing CLOSED when the review state is unknown.
 *
 * `review.known` is false whenever the verification read did not answer.
 * The last two entries of REVIEW_DEPENDENT cannot occur then — the sets are
 * empty — and they are listed anyway so the rule reads as what it is: no
 * review-derived word may be printed from a read that did not happen.
 */
function statusOf(label: MeritLabel, review: ReviewState): WorkspaceMeritStatus {
  if (review.known) return label;
  return REVIEW_DEPENDENT.includes(label) ? "unknown" : label;
}

export interface WorkspaceMerit {
  readonly kind: "claim" | "experience";
  readonly id: string;
  /** Both languages, because the row is rendered in whichever the reader
   *  chose and a list must not fall back to Swedish for an English page. */
  readonly titleSv: string;
  readonly titleEn: string;
  /** The merit TYPE, as a copy key. Employment has no `claim_type`, so it
   *  carries its own key rather than borrowing one that means something
   *  else. */
  readonly typeKey: PassportCopyKey;
  /** Issuer for a credential, employer for an employment. Null when the
   *  holder did not state one — never a dash, never a guess. */
  readonly organisation: string | null;
  readonly dateKind: MeritDateKind;
  readonly from: IsoDate | null;
  readonly to: IsoDate | null;
  /**
   * The trust standing, from the shared labeller — or `unknown`.
   *
   * `unknown` is not a rung and not a downgrade. It is what an honest page
   * says about a merit whose standing DEPENDS on a read that failed: see
   * `statusOf` below. Nothing here can produce it from stored data alone.
   */
  readonly label: WorkspaceMeritStatus;
  /** The label the shared labeller returned, before the unknown rule. Kept
   *  so a caller can see WHY a row reads unknown without re-deriving it. */
  readonly rawLabel: MeritLabel;
  readonly lifecycleState: LifecycleState;
  /** Where this merit is opened. One destination, stated once. */
  readonly href: string;
}

/** Where a merit's own page lives. The same shape My Career's ladder uses
 *  (`subjectHref`), written here so the Passport does not import the ladder
 *  to build a URL. Guarded for agreement by the workspace check. */
export function meritHref(kind: "claim" | "experience", id: string): string {
  return `/passport/entry/${kind}/${id}`;
}

const CLAIM_TYPE_KEYS = {
  training: "claims.type.training",
  certification: "claims.type.certification",
  licence: "claims.type.licence",
  specialisation: "claims.type.specialisation",
  education: "claims.type.education",
  professional_membership: "claims.type.professional_membership",
} as const satisfies Record<Claim["claimType"], PassportCopyKey>;

/** `claimed_issuer_name` arrives as the em-dash sentinel when nobody stated
 *  one. It is a sentinel, not a name, and it never reaches a reader from
 *  here: the row carries null and the renderer says "not stated". */
function statedOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" || trimmed === "—" ? null : trimmed;
}

/* ------------------------------------------------------------------ */
/* The groups                                                          */
/* ------------------------------------------------------------------ */

/**
 * The four lists the workspace renders, in the order it renders them.
 *
 * A merit is in EXACTLY ONE of them. Two lists holding one credential is how
 * a page comes to tell somebody their licence is both current and archived.
 */
export interface WorkspaceGroups {
  /** Recorded, current, and no review case is open on it. */
  readonly current: readonly WorkspaceMerit[];
  /**
   * A reviewer has asked this holder a question.
   *
   * Its own group, never among the current merits: the review is open AND
   * the holder is the blocker, and a heading that says "aktuella meriter"
   * says neither. The figure that counts it (`open_cases`) says both halves
   * in its help text.
   */
  readonly needsAnswer: readonly WorkspaceMerit[];
  /** A review is open with somebody else. A status, never a task — see
   *  passport-merits.ts. */
  readonly inReview: readonly WorkspaceMerit[];
  /**
   * Current merits whose review state could not be read.
   *
   * Empty whenever the verification read answered. When it did not, every
   * merit whose standing depends on it comes here rather than into
   * `current`: a pending merit and a merit nobody has looked at must not sit
   * under one heading that says neither is being reviewed.
   */
  readonly reviewUnknown: readonly WorkspaceMerit[];
  /** Expired, revoked, superseded or disputed BY LIFECYCLE. History. */
  readonly archived: readonly WorkspaceMerit[];
  /** Begun and not finished. Never a recorded merit. */
  readonly drafts: readonly WorkspaceMerit[];
}

/** Which current merits are asking something of the holder, so the list can
 *  put them first without inventing a fifth group for them. */
const NEEDS_HOLDER: readonly WorkspaceMeritStatus[] = ["clarification_needed", "expired"];

export function meritNeedsHolder(merit: WorkspaceMerit): boolean {
  return NEEDS_HOLDER.includes(merit.label);
}

/* ------------------------------------------------------------------ */
/* The one next step                                                   */
/* ------------------------------------------------------------------ */

/**
 * What the workspace may recommend.
 *
 * The first four names are My Career's own `ActionKind` values and keep My
 * Career's meaning, classification and relative order — a person must not be
 * told one thing on the career home and a contradicting thing here. The
 * fifth is workspace-only and is a SUGGESTION, which is why it is allowed to
 * exist: it can never outrank something a reviewer is actually waiting for.
 *
 * `scripts/passport-workspace-check.tsx` proves both halves of that against
 * next-best-action.ts rather than leaving it to this comment.
 */
export type WorkspaceStepKind =
  | "respond_to_clarification"
  | "review_verification_outcome"
  | "resume_draft_merits"
  | "submit_passport_verification"
  | "add_more_merits";

export interface WorkspaceNextStep {
  readonly kind: WorkspaceStepKind;
  /** Rank among the steps. Lower acts first; mirrors the ladder's priority
   *  ordering for every kind the two share. */
  readonly rank: number;
  /** `action_required` and `new_for_you` come from somebody else waiting on
   *  this holder. `suggestion` is the product's idea. */
  readonly classification: "action_required" | "new_for_you" | "suggestion";
  /** The OBJECT, never a landing page, whenever exactly one qualifies. */
  readonly href: string;
  /** A fragment on that destination when the object is a section. */
  readonly hash: string | null;
  /** Search params when the object is reached by intent (`?draft=…`). */
  readonly search: Readonly<Record<string, string>> | null;
  /** How many subjects this step is about, when more than one. */
  readonly count: number;
  /**
   * What must become true for this card to disappear.
   *
   * Stated as data, so a reviewer can read it and a test can assert it. A
   * recommendation with no retiring condition is a permanent loop, which is
   * exactly what this page must not grow.
   */
  readonly retiresWhen: string;
}

export interface PassportWorkspace {
  readonly version: typeof PASSPORT_WORKSPACE_VERSION;
  readonly counts: MeritCounts;
  /** What the status overview renders, from the SHARED presentation
   *  contract (professional-identity/merit-figures.ts) — the same five
   *  exclusive figures My Career prints, under the same words. */
  readonly status: MeritFigures;
  readonly groups: WorkspaceGroups;
  /** Exactly one, or null when there is genuinely nothing to recommend and
   *  when the trust standing could not be read. Those two cases are told
   *  apart by `unavailable`, never by the absence alone. */
  readonly nextStep: WorkspaceNextStep | null;
  /** Loading, available or failed. The component needs all three: a slow
   *  successful read must never announce a failure. */
  readonly reviewState: ReviewReadState;
  /** `reviewState !== "available"` — the review-derived state is UNKNOWN.
   *  Counts derived from it are null and no step is recommended, whether the
   *  answer is still coming or never will. */
  readonly unavailable: boolean;
  /** True when the holder holds no CURRENT merit at all. The route hands
   *  such a holder to the first run, so the workspace never renders it —
   *  exposed so a caller can assert that rather than assume it. */
  readonly empty: boolean;
}

export interface WorkspaceInput {
  readonly claims: readonly Claim[];
  readonly periods: readonly ExperiencePeriod[];
  /** Null unless `reviewState` is `available`. */
  readonly attention: VerificationAttention | null;
  /** Defaults to `available` when an attention object is given and `failed`
   *  when it is not, so an existing caller keeps its behaviour; a caller
   *  that can tell loading from failure states it. */
  readonly reviewState?: ReviewReadState;
  readonly now: Date;
}

function meritOfClaim(claim: Claim, review: ReviewState, now: Date): WorkspaceMerit {
  const rawLabel = labelMerit(
    // The WHOLE provenance. Dropping the method or the subject does not
    // weaken the answer, it inverts it — see passport-merits.ts.
    {
      assertionLevel: claim.assertionLevel,
      lifecycleState: claim.lifecycleState,
      validUntil: claim.validUntil,
      verifierName: claim.verifierName,
      verificationMethod: claim.verificationMethod,
      subjectKind: "credential",
    },
    {
      openReview: review.open.has(claim.id),
      clarificationOpen: review.clarification.has(claim.id),
    },
    now,
  );
  return {
    kind: "claim",
    id: claim.id,
    titleSv: claim.titleSv,
    titleEn: claim.titleEn,
    typeKey: CLAIM_TYPE_KEYS[claim.claimType],
    organisation: statedOrNull(claim.issuerName),
    dateKind: "validity",
    from: claim.issuedOn,
    to: claim.validUntil,
    label: statusOf(rawLabel, review),
    rawLabel,
    lifecycleState: claim.lifecycleState,
    href: meritHref("claim", claim.id),
  };
}

function meritOfPeriod(period: ExperiencePeriod, review: ReviewState, now: Date): WorkspaceMerit {
  // One employment reads the same in both languages: a role title and an
  // employer name are the holder's own words and a proper noun. They are
  // carried in both fields rather than in one, so the renderer has the same
  // shape for every merit.
  const title = `${period.roleTitle}`;
  const rawLabel = labelMerit(
    {
      assertionLevel: period.assertionLevel,
      lifecycleState: period.lifecycleState,
      validUntil: null,
      verifierName: period.verifierName,
      verificationMethod: period.verificationMethod,
      // An EMPLOYMENT PERIOD: the one subject an employer confirmation may
      // source-confirm.
      subjectKind: "employment",
    },
    {
      openReview: review.open.has(period.id),
      clarificationOpen: review.clarification.has(period.id),
    },
    now,
  );
  return {
    kind: "experience",
    id: period.id,
    titleSv: title,
    titleEn: title,
    typeKey: "ws.type.employment",
    organisation: statedOrNull(period.employerName),
    dateKind: "period",
    from: period.startedOn,
    to: period.endedOn,
    label: statusOf(rawLabel, review),
    rawLabel,
    lifecycleState: period.lifecycleState,
    href: meritHref("experience", period.id),
  };
}

/** Newest first, by whichever date the row actually carries, with a stable
 *  tiebreak on id so two merits from the same day do not swap places between
 *  loads. Undated rows sort last rather than pretending to be old. */
function byRecency(a: WorkspaceMerit, b: WorkspaceMerit): number {
  const ka = a.to ?? a.from ?? "";
  const kb = b.to ?? b.from ?? "";
  if (ka !== kb) return ka === "" ? 1 : kb === "" ? -1 : kb > ka ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Within "current merits", anything asking the holder for something comes
 *  first. Not a separate group — the same merits, ordered by what they want. */
function byAttentionThenRecency(a: WorkspaceMerit, b: WorkspaceMerit): number {
  const na = meritNeedsHolder(a) ? 0 : 1;
  const nb = meritNeedsHolder(b) ? 0 : 1;
  return na !== nb ? na - nb : byRecency(a, b);
}

export function buildPassportWorkspace(input: WorkspaceInput): PassportWorkspace {
  const { claims, periods, attention, now } = input;
  const reviewState: ReviewReadState =
    input.reviewState ?? (attention && !attention.unavailable ? "available" : "failed");
  // `reviewStateOf` reads `unavailable` off the attention object; a loading
  // read has no object at all, and both reach the derivation as unknown.
  const review = reviewStateOf(reviewState === "available" ? attention : null);

  const merits = [
    ...claims.map((c) => meritOfClaim(c, review, now)),
    ...periods.map((p) => meritOfPeriod(p, review, now)),
  ];

  const drafts = merits.filter((m) => isUnfinishedMerit(m.lifecycleState)).sort(byRecency);
  const archived = merits.filter((m) => isArchivedMerit(m.lifecycleState)).sort(byRecency);
  const live = merits.filter((m) => isCurrentMerit(m.lifecycleState));
  const inReview = live.filter((m) => m.label === "verification_requested").sort(byRecency);
  const needsAnswer = live.filter((m) => m.label === "clarification_needed").sort(byRecency);
  // Separated from `current` rather than mixed into it: a merit that may be
  // under review, and one nobody has looked at, must not share a heading
  // that implies the second.
  const reviewUnknown = live.filter((m) => m.label === "unknown").sort(byRecency);
  const current = live
    .filter(
      (m) =>
        m.label !== "verification_requested" &&
        m.label !== "clarification_needed" &&
        m.label !== "unknown",
    )
    .sort(byAttentionThenRecency);

  const counts = countMeritRows(
    // The SAME rows the labels above were derived from, so the counts and
    // the list can never describe different merits.
    [
      ...claims.map((c): MeritRow => ({
        id: c.id,
        assertionLevel: c.assertionLevel,
        lifecycleState: c.lifecycleState,
        validUntil: c.validUntil,
        verifierName: c.verifierName,
        verificationMethod: c.verificationMethod,
        subjectKind: "credential",
      })),
      ...periods.map((p): MeritRow => ({
        id: p.id,
        assertionLevel: p.assertionLevel,
        lifecycleState: p.lifecycleState,
        validUntil: null,
        verifierName: p.verifierName,
        verificationMethod: p.verificationMethod,
        subjectKind: "employment",
      })),
    ],
    review,
    now,
  );

  // Unknown, whether it is still coming or will never come. Every figure and
  // every group treats the two identically; only the COPY differs, and that
  // is the component's business.
  const unavailable = reviewState !== "available";

  return {
    version: PASSPORT_WORKSPACE_VERSION,
    counts,
    // ── THE FIGURES, FROM THE SHARED CONTRACT ───────────────────────
    //
    // Not computed here. `meritFigures` is what My Career prints from too,
    // so the two surfaces cannot describe one merit differently or let two
    // categories silently overlap. Two of the five are statements about the
    // request table and are null when it could not be read; the other three
    // are statements about stored provenance and lifecycle.
    status: meritFigures(counts),
    groups: { current, needsAnswer, inReview, reviewUnknown, archived, drafts },
    nextStep: unavailable ? null : nextStepFor({ attention: attention!, live, drafts }),
    reviewState,
    unavailable,
    empty: live.length === 0,
  };
}

/* ------------------------------------------------------------------ */
/* The ladder                                                          */
/* ------------------------------------------------------------------ */

/**
 * ONE recommendation, chosen by rules, retiring on a stated condition.
 *
 * The order is My Career's, restricted to what the Passport itself owns:
 *
 *   1  a reviewer asked this holder a question                (action)
 *   2  a decision went against them and is unresolved         (news)
 *   3  a merit was begun and never finished                   (suggestion)
 *   4  a merit is ready to be sent to a verifier              (suggestion)
 *   5  the Passport holds a single merit                      (suggestion)
 *
 * Nothing PASSIVE is ever emitted. "A review is open" asks nothing of the
 * holder, so it is a row in the list and a figure in the summary, and it is
 * never the recommended step — the same rule next-best-action.ts states as
 * "a status is not a task".
 *
 * Every branch names its retirement. Step 5 retires the moment a second
 * current merit exists, and there is deliberately no standing "share your
 * Passport" step: a recommendation that can never be completed is the
 * permanent loop this page is not allowed to grow. When nothing qualifies
 * the card says so and offers no demand.
 */
function nextStepFor(args: {
  readonly attention: VerificationAttention;
  readonly live: readonly WorkspaceMerit[];
  readonly drafts: readonly WorkspaceMerit[];
}): WorkspaceNextStep | null {
  const { attention, live, drafts } = args;

  // 1 · a reviewer is waiting on this holder.
  if (attention.actionRequired.length > 0) {
    const only = attention.actionRequired.length === 1 ? attention.actionRequired[0]! : null;
    return {
      kind: "respond_to_clarification",
      rank: 1,
      classification: "action_required",
      href: only ? meritHref(only.subjectKind, only.subjectId) : "/passport",
      hash: only ? null : "attention",
      search: null,
      count: attention.actionRequired.length,
      retiresWhen: "the holder has answered and the request leaves clarification_requested",
    };
  }

  // 2 · somebody decided, and it did not go their way.
  if (attention.outcomes.length > 0) {
    const only = attention.outcomes.length === 1 ? attention.outcomes[0]! : null;
    return {
      kind: "review_verification_outcome",
      rank: 2,
      classification: "new_for_you",
      href: only ? meritHref(only.subjectKind, only.subjectId) : "/passport",
      hash: only ? null : "attention",
      search: null,
      count: attention.outcomes.length,
      retiresWhen: "the entry is corrected or resubmitted, retiring the rejected request",
    };
  }

  // 3 · something was begun and not finished. The FORM, resumed — a list
  //     the holder then has to search is the person re-finding their own
  //     work.
  if (drafts.length > 0) {
    return {
      kind: "resume_draft_merits",
      rank: 3,
      classification: "suggestion",
      href: "/passport/credentials/new",
      hash: null,
      search: { draft: drafts[0]!.id },
      count: drafts.length,
      retiresWhen: "no claim is in lifecycle_state draft",
    };
  }

  // 4 · a Passport holding a single merit is worth filling in before it is
  //     worth verifying, so this is asked ahead of step 5 and retires the
  //     moment a second merit exists. Both are suggestions, so neither can
  //     displace 1 or 2.
  if (live.length === 1) {
    return {
      kind: "add_more_merits",
      rank: 4,
      classification: "suggestion",
      // ── THE CHOOSER, NOT A PAGE ──────────────────────────────────
      //
      // "Lägg till en merit till" pointed first at the employment block —
      // a generic verb on one specific form — and then at the top of a long
      // page, where the person still had to find the right section. Neither
      // is the step. The step is: pick what kind of merit this is.
      //
      // So it opens the chooser that already exists on this page, in place.
      // `ScrollToHashOnceReady` opens a <details> target and focuses its
      // summary, so the three options are on screen and the keyboard is on
      // them the moment the card is pressed.
      href: "/passport",
      hash: "add-merit",
      search: null,
      count: 1,
      retiresWhen: "a second current merit is recorded",
    };
  }

  // 5 · recorded, current, nobody has reviewed it and nobody is looking.
  //     `documented` is deliberately absent: CQrityjob already decided on
  //     that merit, and asking again would be the product promoting an
  //     action out of a decision that has already happened.
  const ready = live.filter((m) => m.label === "added_by_you" || m.label === "document_provided");
  if (ready.length > 0) {
    const only = ready.length === 1 ? ready[0]! : null;
    return {
      kind: "submit_passport_verification",
      rank: 5,
      classification: "suggestion",
      href: only ? only.href : "/passport",
      hash: only ? null : "merits",
      search: null,
      count: ready.length,
      retiresWhen: "every recorded merit is verified, lapsed or under review",
    };
  }

  return null;
}
