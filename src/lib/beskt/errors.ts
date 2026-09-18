// Turning a governed database refusal into something a person can act on.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
//
// Every BESKT mutation is a `SECURITY DEFINER` RPC that refuses by raising,
// and it raises with a machine code and an operator-facing sentence:
//
//   BCP_STALE_REVISION: the draft is at revision 4 but the request expected
//   revision 3. Reload and retry.
//
// That text is written for whoever is reading the database log. Putting it on
// a candidate's screen is wrong twice over. It is not a sentence they can act
// on -- "revision" is our word, not theirs -- and it leaks the shape of the
// schema: table names, policy names, column names, and in the worst case a
// Postgres error with a query fragment in it.
//
// So the rule here is simple and absolute: the screen shows OUR sentence,
// chosen by code, in the reader's own language. The original never reaches
// the DOM.
//
// ── WHAT IS AND IS NOT LEAKED ───────────────────────────────────────────
//
// The CODE is ours: we wrote it, it names a governed refusal, and it appears
// in the migration this repository reviews. Mapping it to a sentence tells the
// reader what happened and nothing about how the database is built. The
// MESSAGE after the colon is the part that can carry identifiers, so it is
// dropped on the floor for display and kept only where the project's own
// logging rules already allow an operator to see it.
//
// An unrecognised failure -- a network error, a Postgres error we never
// raised, a bug -- gets the generic sentence. That is deliberate: a failure we
// did not anticipate is exactly the one whose text we cannot vouch for.

import type { TranslationKey } from "@/i18n/dictionaries";

/**
 * Every governed refusal the candidate or employer surfaces can actually
 * reach, mapped to the sentence we are willing to show.
 *
 * Codes the UI cannot provoke are deliberately absent rather than mapped to a
 * guess: `BCP_PROOF` is a migration-time assertion, `BCP_APPEND_ONLY` and the
 * `*_IMMUTABLE` family are trigger invariants that fire only against a direct
 * table write, which no client can make. If one of those ever did surface it
 * would mean something is wrong that a reassuring sentence should not paper
 * over, and the generic text is the honest answer.
 */
const MESSAGE_FOR_CODE: Readonly<Record<string, TranslationKey>> = {
  // ---- The draft moved under the candidate --------------------------------
  BCP_STALE_REVISION: "beskt.error.staleRevision",
  BCP_REVISION_REQUIRED: "beskt.error.staleRevision",
  BCP_RESPONSE_REVISION: "beskt.error.staleRevision",
  BCP_ASSIGNMENT_REVISION: "beskt.error.staleRevision",

  // ---- Submission ----------------------------------------------------------
  BCP_INCOMPLETE: "beskt.error.incomplete",
  BCP_ANSWER_INCOMPLETE: "beskt.error.incomplete",
  BCP_ALREADY_SUBMITTED: "beskt.error.alreadySubmitted",
  BCP_ANSWER_FROZEN: "beskt.error.alreadySubmitted",
  BCP_NO_OPEN_DRAFT: "beskt.error.alreadySubmitted",

  // ---- The notice ----------------------------------------------------------
  BCP_NOTICE_NOT_ACKNOWLEDGED: "beskt.error.noticeNotAcknowledged",
  BCP_NOTICE_ALREADY_ACKNOWLEDGED: "beskt.error.noticeAlreadyAcknowledged",
  BCP_NOTICE_HASH_MISMATCH: "beskt.error.noticeMoved",
  BCP_NOTICE_VERSION_MISMATCH: "beskt.error.noticeMoved",
  BCP_NOTICE_VERSION_UNKNOWN: "beskt.error.noticeMoved",
  BCP_NOTICE_COPY_UNGOVERNED: "beskt.error.noticeMoved",
  BCP_NOTICE_LOCALE_UNSUPPORTED: "beskt.error.noticeLocale",

  // ---- The governed method moved or is not offerable ----------------------
  BCP_CONTENT_HASH_MISMATCH: "beskt.error.methodMoved",
  BCP_METHOD_CONTENT_MOVED: "beskt.error.methodMoved",
  BCP_METHOD_NOT_PUBLISHED: "beskt.error.methodUnavailable",
  BCP_METHOD_NOT_CANDIDATE_SAFE: "beskt.error.methodUnavailable",
  BCP_METHOD_VERSION_NOT_FOUND: "beskt.error.methodUnavailable",
  BCP_METHOD_MODE_NOT_PERMITTED: "beskt.error.methodUnavailable",
  BCP_PROFILE_MODE_NOT_PERMITTED: "beskt.error.methodUnavailable",
  BCP_PROFILE_NOT_IN_VERSION: "beskt.error.profileNotInMethod",
  BCP_NOT_ASSIGNABLE: "beskt.error.notAssignable",

  // ---- Starting from an application ---------------------------------------
  BCP_ASSIGNMENT_EXISTS: "beskt.error.assignmentExists",
  BCP_APPLICATION_NOT_FOUND: "beskt.error.applicationNotFound",
  BCP_APPLICATION_WITHDRAWN: "beskt.error.applicationWithdrawn",
  BCP_CANDIDATE_UNKNOWN: "beskt.error.applicationNotFound",
  BCP_EMPLOYER_NOT_FOUND: "beskt.error.notAuthorised",
  BCP_EMPLOYER_NOT_ACTIVE: "beskt.error.employerNotActive",
  BCP_CROSS_TENANT_JOB: "beskt.error.notAuthorised",

  // ---- Cancellation --------------------------------------------------------
  BCP_ASSIGNMENT_CANCELLED: "beskt.error.assignmentCancelled",
  BCP_ASSIGNMENT_TRANSITION: "beskt.error.cannotCancelNow",
  BCP_ASSIGNMENT_SUBMITTED_IMMUTABLE: "beskt.error.cannotCancelNow",

  // ---- Access --------------------------------------------------------------
  BCP_NOT_AUTHORISED: "beskt.error.notAuthorised",
  BCP_NOT_CANDIDATE: "beskt.error.notAuthorised",
  BCP_NOT_EMPLOYER_MEMBER: "beskt.error.notAuthorised",
  BCP_NOT_PLATFORM_ADMIN: "beskt.error.notAuthorised",
  BCP_NOT_AUTHENTICATED: "beskt.error.notAuthenticated",
  BCP_ASSIGNMENT_NOT_FOUND: "beskt.error.assignmentNotFound",
  BCP_NOT_AVAILABLE_YET: "beskt.error.notAvailableYet",

  // ---- An answer the governed content does not admit -----------------------
  BCP_ITEM_NOT_VISIBLE: "beskt.error.itemNotVisible",
  BCP_ITEM_NOT_IN_VERSION: "beskt.error.itemNotVisible",
  BCP_ITEM_NOT_IN_PROFILE: "beskt.error.itemNotVisible",
  BCP_ITEM_NOT_PERMITTED: "beskt.error.itemNotVisible",
  BCP_ITEM_NOT_CANDIDATE_PHASE: "beskt.error.itemNotVisible",
  BCP_OPTION_NOT_IN_ITEM: "beskt.error.optionNotInItem",
  BCP_ORAL_NOT_ALLOWED: "beskt.error.oralNotAllowed",
  BCP_ANSWER_STATE_UNKNOWN: "beskt.error.answerRejected",
  BCP_ANSWERS_NOT_STRUCTURED: "beskt.error.answerRejected",

  // ---- Idempotency ---------------------------------------------------------
  BCP_OPERATION_PAYLOAD_MISMATCH: "beskt.error.operationConflict",
  BCP_OPERATION_ACTOR_MISMATCH: "beskt.error.operationConflict",
  BCP_OPERATION_ID_REQUIRED: "beskt.error.operationConflict",

  // ---- The bridge between a preparation and an interview case -------------
  BCP_CASE_LINK_NOT_FOUND: "beskt.error.linkNotFound",

  // ---- The owner's internal test activation (20261129090000) --------------
  BCP_TEST_ACTIVATION_INCOMPLETE: "beskt.error.testActivationRefused",
  BCP_TEST_ACTIVATION_EXPIRY: "beskt.error.testActivationRefused",
  BCP_TEST_ACTIVATION_DECISION_REQUIRED: "beskt.error.testActivationRefused",
  BCP_TEST_ACTIVATION_STATUS: "beskt.error.testActivationRefused",
  BCP_TEST_ACTIVATION_NOT_FOUND: "beskt.error.testActivationRefused",
  BCP_TEST_ACTIVATION_ALREADY_REVOKED: "beskt.error.testActivationRefused",
  BESKT_CONTENT_ROLE_UNKNOWN: "beskt.error.notAuthorised",
  BCP_TEST_ACTIVATION_EXISTS: "beskt.error.testActivationExists",

  BCP_NOT_SUBMITTED: "beskt.error.caseLinkNotSubmitted",
  BCP_CASE_LINK_EXISTS: "beskt.error.caseLinkExists",
  BCP_CASE_MISMATCH: "beskt.error.caseLinkMismatch",
  BCP_CASE_CANCELLED: "beskt.error.caseLinkCancelled",
  BCP_CASE_NOT_FOUND: "beskt.error.caseLinkNotFound",
  BCP_CONDUCT_LINK_NOT_LIVE: "beskt.error.linkNotLive",

  // ---- Conducting the interview -------------------------------------------
  //
  // These are the refusals an interviewer can actually provoke from the
  // screen. Each gets a sentence that says what happened AND what to do,
  // because every one of them is recoverable: reload, reopen, wait for a
  // colleague, or fill something in.
  BCP_CONDUCT_NOT_PERMITTED: "beskt.error.conductNotPermitted",
  BCP_CONDUCT_SESSION_NOT_FOUND: "beskt.error.conductSessionNotFound",
  BCP_CONDUCT_SESSION_CONCLUDED: "beskt.error.conductSessionConcluded",
  BCP_CONDUCT_ALREADY_JOINED: "beskt.error.conductAlreadyJoined",
  BCP_CONDUCT_ROLE_UNKNOWN: "beskt.error.conductRoleUnknown",
  BCP_CONDUCT_NOT_A_PARTICIPANT: "beskt.error.conductNotParticipant",

  // ---- Writing into a position --------------------------------------------
  BCP_CONDUCT_NOT_OWN_POSITION: "beskt.error.conductNotOwnPosition",
  BCP_CONDUCT_POSITION_NOT_FOUND: "beskt.error.conductPositionNotFound",
  BCP_CONDUCT_POSITION_LOCKED: "beskt.error.conductPositionLocked",
  BCP_CONDUCT_ALREADY_LOCKED: "beskt.error.conductAlreadyLocked",
  BCP_CONDUCT_NOT_LOCKED: "beskt.error.conductNotLocked",
  BCP_CONDUCT_NOTHING_TO_LOCK: "beskt.error.conductNothingToLock",
  BCP_CONDUCT_REOPEN_REASON_REQUIRED: "beskt.error.conductReopenReasonRequired",

  // ---- Entries and corrections --------------------------------------------
  BCP_CONDUCT_ENTRY_NOT_FOUND: "beskt.error.conductEntryNotFound",
  BCP_CONDUCT_ENTRY_NOT_STRUCTURED: "beskt.error.conductEntryRejected",
  BCP_CONDUCT_ENTRY_FROZEN: "beskt.error.conductPositionLocked",
  BCP_CONDUCT_ITEM_REQUIRED: "beskt.error.conductEntryRejected",
  BCP_CONDUCT_ITEM_NOT_IN_VERSION: "beskt.error.conductItemNotInVersion",
  BCP_CONDUCT_SUPERSEDES_UNKNOWN: "beskt.error.conductEntryNotFound",
  BCP_CONDUCT_ALREADY_CORRECTED: "beskt.error.conductAlreadyCorrected",
  BCP_CONDUCT_CORRECTION_REASON_REQUIRED: "beskt.error.conductCorrectionReasonRequired",

  // ---- Verification --------------------------------------------------------
  BCP_CONDUCT_VERIFICATION_STATE_UNKNOWN: "beskt.error.conductVerificationStateUnknown",
  BCP_CONDUCT_VERIFICATION_SOURCE_REQUIRED: "beskt.error.conductVerificationSourceRequired",

  // ---- The panel -----------------------------------------------------------
  BCP_CONDUCT_NOT_VISIBLE_YET: "beskt.error.conductNotVisibleYet",
  BCP_CONDUCT_REVEAL_TOO_EARLY: "beskt.error.conductRevealTooEarly",
  BCP_CONDUCT_PANEL_NEEDS_TWO: "beskt.error.conductPanelNeedsTwo",
  BCP_CONDUCT_PANEL_ALREADY_REVEALED: "beskt.error.conductPanelAlreadyRevealed",
  BCP_CONDUCT_PANEL_NOT_REVEALED: "beskt.error.conductPanelNotRevealed",
  BCP_CONDUCT_RESOLUTION_KIND_UNKNOWN: "beskt.error.conductResolutionKindUnknown",
  BCP_CONDUCT_AGREEMENT_REQUIRED: "beskt.error.conductAgreementRequired",
  BCP_CONDUCT_DIVERGENCE_REQUIRED: "beskt.error.conductDivergenceRequired",
  BCP_CONDUCT_RATIONALE_REQUIRED: "beskt.error.conductRationaleRequired",

  // ---- The report ----------------------------------------------------------
  //
  // The blocker codes are also raised as a refusal by the finalisation, so
  // they are translated once and reused by both the blocker list and the
  // error line. A blocker is never a quality judgement: every one of these
  // names a human step that has not happened yet.
  BCP_CONDUCT_NO_POSITION: "beskt.error.reportNoPosition",
  BCP_CONDUCT_POSITION_OPEN: "beskt.error.reportPositionOpen",
  BCP_CONDUCT_NOTHING_DOCUMENTED: "beskt.error.reportNothingDocumented",
  BCP_CONDUCT_PANEL_REQUIRED: "beskt.error.reportPanelRequired",
  BCP_CONDUCT_RESOLUTION_MISSING: "beskt.error.reportResolutionMissing",
  BCP_CONDUCT_REPORT_BLOCKED: "beskt.error.reportBlocked",
  BCP_CONDUCT_PREVIEW_REQUIRED: "beskt.error.reportPreviewRequired",
  BCP_CONDUCT_STALE_PREVIEW: "beskt.error.reportStalePreview",
  BCP_CONDUCT_REPORT_IMMUTABLE: "beskt.error.reportImmutable",

  // ---- Governing the method itself (the admin surface) ---------------------
  //
  // BESKT_-prefixed rather than BCP_: the governance contract is the
  // method's own and was named before the candidate runtime existed. Every
  // code below is raised by a migration in this repository; a code the admin
  // surface cannot provoke is deliberately absent rather than guessed at.
  BESKT_NOT_AUTHENTICATED: "beskt.error.notAuthenticated",
  BESKT_NOT_AUTHORISED: "beskt.error.notAuthorised",
  BESKT_NOT_EDITOR: "beskt.error.govNotEditor",
  BESKT_NOT_REVIEWER: "beskt.error.govNotReviewer",
  BESKT_NOT_PUBLISHER: "beskt.error.govNotPublisher",
  BESKT_NOT_PLATFORM_ADMIN: "beskt.error.govNotPlatformAdmin",

  // Who may decide which gate, and who may not decide at all.
  BESKT_GATE_NOT_GRANTED: "beskt.error.govGateNotGranted",
  BESKT_GATE_NOT_OPEN: "beskt.error.govGateNotOpen",
  BESKT_UNKNOWN_GATE: "beskt.error.govUnknownGate",
  BESKT_UNKNOWN_DECISION: "beskt.error.govUnknownDecision",
  BESKT_SELF_REVIEW: "beskt.error.govSelfReview",
  BESKT_PUBLISHER_IS_AUTHOR: "beskt.error.govPublisherIsAuthor",
  BESKT_REVIEW_ONE_GATE_PER_REVIEWER: "beskt.error.govOneGatePerReviewer",
  BESKT_REVIEW_HASH_MISMATCH: "beskt.error.govReviewHashMismatch",
  BESKT_RATIONALE_REQUIRED: "beskt.error.govRationaleRequired",
  BESKT_REASON_REQUIRED: "beskt.error.govReasonRequired",

  // The draft moved under the editor.
  BESKT_STALE_REVISION: "beskt.error.staleRevision",
  BESKT_REVISION_REQUIRED: "beskt.error.staleRevision",
  BESKT_REVISION_NOT_ADVANCED: "beskt.error.staleRevision",
  BESKT_REVISION_REGRESSION: "beskt.error.staleRevision",
  BESKT_CONTENT_HASH_STALE: "beskt.error.staleRevision",

  // The lifecycle refused the transition.
  BESKT_VERSION_NOT_FOUND: "beskt.error.govVersionNotFound",
  BESKT_NOT_DRAFT: "beskt.error.govNotDraft",
  BESKT_PUBLISHED_IMMUTABLE: "beskt.error.govPublishedImmutable",
  BESKT_ILLEGAL_TRANSITION: "beskt.error.govIllegalTransition",
  BESKT_OPEN_VERSION_EXISTS: "beskt.error.govOpenVersionExists",
  BESKT_SUBMIT_BLOCKED: "beskt.error.govSubmitBlocked",
  BESKT_PUBLISH_BLOCKED: "beskt.error.govPublishBlocked",
  BESKT_NOT_READY_TO_PUBLISH: "beskt.error.govNotReadyToPublish",
  BESKT_NOT_PUBLISHED: "beskt.error.govNotPublished",

  // Authoring one governed row.
  BESKT_CONTENT_KEY_REQUIRED: "beskt.error.govContentKeyRequired",
  BESKT_CONTENT_UNKNOWN_FIELD: "beskt.error.govContentUnknownField",
  BESKT_CONTENT_NOT_FOUND: "beskt.error.govContentNotFound",
  BESKT_CONTENT_FAMILY_UNKNOWN: "beskt.error.govContentFamilyUnknown",
  BESKT_CONTENT_PAYLOAD: "beskt.error.govContentPayload",
  BESKT_CONTENT_PARENT_REQUIRED: "beskt.error.govContentParentRequired",
  BESKT_CONTENT_PARENT_UNKNOWN: "beskt.error.govContentParentUnknown",
  BESKT_EXPOSURE_LINK_REQUIRED: "beskt.error.govExposureLinkRequired",
  BESKT_PROFILE_NOT_IN_VERSION: "beskt.error.profileNotInMethod",
  BESKT_ITEM_OPTIONS_NOT_APPLICABLE: "beskt.error.govOptionsNotApplicable",
  BESKT_PROMPT_STAGE_MISMATCH: "beskt.error.govPromptStageMismatch",
  BESKT_EVALUATION_NOT_TEMPLATED: "beskt.error.govEvaluationNotTemplated",
  BESKT_PROVENANCE_REQUIRED: "beskt.error.govProvenanceRequired",
  BESKT_MODE_UNKNOWN: "beskt.error.govModeUnknown",
  BESKT_MODE_NOT_PERMITTED: "beskt.error.govModeNotPermitted",

  // Structure the governed graph refuses.
  BESKT_PARENT_IMMUTABLE: "beskt.error.govParentImmutable",
  BESKT_IDENTITY_IMMUTABLE: "beskt.error.govIdentityImmutable",
  BESKT_CROSS_PROFILE_REFERENCE: "beskt.error.govCrossProfile",
  BESKT_CROSS_VERSION_REFERENCE: "beskt.error.govCrossVersion",
  BESKT_ROUTE_BACKWARD: "beskt.error.govRouteBackward",
  BESKT_ROUTE_NOT_ORDERED: "beskt.error.govRouteNotOrdered",
  BESKT_ROUTE_CONDITION_TYPE: "beskt.error.govRouteConditionType",
  BESKT_ROUTE_ITEM_UNKNOWN: "beskt.error.govRouteItemUnknown",
  BESKT_ROUTE_OPTION_SCOPE: "beskt.error.govRouteOptionScope",
  BESKT_ROUTE_PHASE: "beskt.error.govRoutePhase",
  BESKT_ROUTE_MODE_ESCALATION: "beskt.error.govRouteModeEscalation",

  // Creating the method identity.
  BESKT_INVALID_SLUG: "beskt.error.govInvalidSlug",
  BESKT_NAME_AND_PURPOSE_REQUIRED: "beskt.error.govNameAndPurposeRequired",
  BESKT_PACK_KIND_MISMATCH: "beskt.error.govPackKindMismatch",
  BESKT_VERSION_IDENTITY: "beskt.error.govVersionIdentity",

  // Governance grants.
  BESKT_GRANT_NOT_FOUND: "beskt.error.govGrantNotFound",
  BESKT_GRANT_ALREADY_REVOKED: "beskt.error.govGrantAlreadyRevoked",
  BESKT_USER_NOT_FOUND: "beskt.error.govUserNotFound",

  // Idempotency, the governance half.
  BESKT_OPERATION_ID_REQUIRED: "beskt.error.operationConflict",
  BESKT_OPERATION_PAYLOAD_MISMATCH: "beskt.error.operationConflict",
  BESKT_OPERATION_ACTOR_MISMATCH: "beskt.error.operationConflict",
};

/** What the reader is told when we do not recognise the failure. */
export const BESKT_GENERIC_ERROR: TranslationKey = "beskt.error.generic";

/**
 * The governed code at the head of a raised message, if there is one.
 *
 * PostgREST wraps the raise, so the code can arrive anywhere in the string
 * rather than only at position 0 -- `bcp_submit` refusing through a server
 * function reaches the browser as a message that has already been through two
 * layers. Matching the token anywhere is therefore correct; requiring it at
 * the start silently fell through to the generic text for every real refusal.
 */
export function besktErrorCode(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  // BESKT_ first, and as its own alternative rather than an optional prefix:
  // `BCP_[A-Z_]+` would otherwise match the tail of a BESKT_ code only by
  // accident of where the word boundary falls, and an ordered alternation
  // says which family a code belongs to instead of leaving it to chance.
  const m = /\bBESKT_[A-Z_]+\b|\bBCP_[A-Z_]+\b/.exec(raw);
  return m ? m[0] : null;
}

/**
 * The translation key to SHOW for a failure. Never the original text.
 *
 * Returns the generic key for anything unrecognised, which includes every
 * network failure and every error we did not raise ourselves.
 */
export function besktErrorKey(error: unknown): TranslationKey {
  const code = besktErrorCode(error);
  if (code === null) return BESKT_GENERIC_ERROR;
  return MESSAGE_FOR_CODE[code] ?? BESKT_GENERIC_ERROR;
}

/** The codes this module claims to translate — the guard reads this. */
export const BESKT_TRANSLATED_CODES: readonly string[] = Object.keys(MESSAGE_FOR_CODE);
