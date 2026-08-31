// The public assessment buffer.
//
// ── WHY THIS EXISTS, AND WHY IT IS NOT ANONYMOUS SESSIONS ──────────────
//
// Before commit 15949db the assessment was a public route that held answers in
// sessionStorage and never touched the database until the candidate had a
// result. The v3 cutover replaced it with a database-backed flow behind
// `_authenticated`, and the public capability went with it — while /assessment
// still advertises "Inget konto krävs" / "No account required".
//
// This restores the old mechanism, not a new one. Answers live in the browser
// until the candidate signs in; only then are they written, through the normal
// authenticated v3.1 pipeline, owned by a real user_id from the first insert.
//
// That distinction is the whole security argument:
//
//   * no anonymous database grants — `anon` still holds nothing on any cd_
//     table, and PR1's assertion V9.6 stays intact;
//   * no anonymous RLS policies — nothing is keyed on a browser-held token;
//   * no anonymous report ownership — a report cannot exist before an owner
//     does, so there is no orphan row to claim, leak or garbage-collect.
//
// A bearer token in web storage that grants database read access would have
// been the alternative. This has no such token, because there is nothing in the
// database to read yet.
//
// ── sessionStorage, DELIBERATELY ───────────────────────────────────────
//
// Not localStorage. Progress should survive a refresh — which the old flow also
// did — but must not outlive the tab. An abandoned half-finished assessment
// resurfacing days later on a shared computer is a privacy problem, and the
// answers are about how someone wants to work.

import { CORE_ITEMS } from "./v31/core-items";
import {
  adaptiveItemsForStatus,
  CONTEXT_ITEMS,
  CONTEXT_STATUS_ITEM_ID,
  isContextStatus,
  isValidPersonalAnswer,
  type ContextStatus,
} from "./v31/personal-layer";
import { CONTENT_VERSION, DEFINITION_VERSION, type Locale } from "./v31/version";

/** Buffer format version. Bumped when the stored SHAPE changes, so a stale
 *  buffer from an older build is discarded rather than misread.
 *
 *  v1 → v2: the buffer gained the personal layer (2 context + 4 adaptive
 *  answers alongside the Career DNA answers, then 20 of them, now 22 with
 *  CQ21/CQ22 — see v31/personal-layer.ts's MVP_QUESTION_COUNT). A v1 buffer
 *  holds a Career-DNA-only run with no personal layer at all and is
 *  discarded rather than replayed as a full run, because completing it
 *  would silently produce a session with no context_status and therefore
 *  no Discovery Path. */
const BUFFER_VERSION = 2;

const KEY = "cqj:discovery:v31:public-buffer:v1";

/** One buffered answer.
 *
 *  `scale` and `single_choice` are the scored Career DNA formats and mirror
 *  the domain `Answer` union, kept structural so the buffer never depends on a
 *  domain value import.
 *
 *  `personal` covers both context and adaptive items: each is a pick from an
 *  authored option list, identified by the option's stable `value`. It is a
 *  separate variant precisely so it can never be mistaken for a scored answer
 *  — nothing that reads Career DNA accepts this shape. */
export type BufferedAnswer =
  | { readonly itemId: string; readonly format: "scale"; readonly value: number }
  | { readonly itemId: string; readonly format: "single_choice"; readonly optionId: string }
  | { readonly itemId: string; readonly format: "personal"; readonly value: string };

export interface PublicBuffer {
  readonly bufferVersion: number;
  /** The definition and content the answers were given against. A buffer from
   *  a different version is discarded: replaying answers into a changed
   *  instrument would silently produce a report the candidate never took. */
  readonly definitionVersion: string;
  readonly contentVersion: string;
  readonly locale: Locale;
  readonly answers: readonly BufferedAnswer[];
  readonly startedAt: string;
  /** Set once, by markComplete, the moment the final answer is recorded.
   *  Absent on an in-progress buffer. Frozen rather than recomputed on every
   *  render so the client-computed result (see PublicAssessmentFlow) reports
   *  the same completion time across a reload, and so the same timestamp is
   *  later handed to buildValidatedSnapshot again at claim time — the
   *  anonymous view and the claimed report describe the same event. */
  readonly completedAt?: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/** Reads the buffer, discarding anything stale, foreign or malformed.
 *
 *  Never throws and never returns a partially-trusted object: a buffer that
 *  cannot be fully validated is treated as absent, because replaying half of
 *  someone's answers is worse than asking them to start again. */
export function readBuffer(): PublicBuffer | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PublicBuffer;

    if (parsed.bufferVersion !== BUFFER_VERSION) return null;
    if (parsed.definitionVersion !== DEFINITION_VERSION) return null;
    if (parsed.contentVersion !== CONTENT_VERSION) return null;
    if (parsed.locale !== "sv" && parsed.locale !== "en") return null;
    if (!Array.isArray(parsed.answers)) return null;

    const coreItemIds = new Set(CORE_ITEMS.map((i) => i.id));
    for (const a of parsed.answers) {
      if (!a || typeof a.itemId !== "string") return null;
      if (a.format === "personal") {
        // Validated against the authored option list, so a hand-edited buffer
        // cannot introduce a value the instrument never offered.
        if (typeof a.value !== "string" || !isValidPersonalAnswer(a.itemId, a.value)) return null;
      } else if (!coreItemIds.has(a.itemId)) {
        return null;
      } else if (a.format === "scale") {
        if (!Number.isFinite(a.value) || a.value < 1 || a.value > 10) return null;
      } else if (a.format === "single_choice") {
        if (typeof a.optionId !== "string" || !a.optionId.startsWith(`${a.itemId}_`)) return null;
      } else {
        return null;
      }
    }

    // An adaptive answer from a path the candidate is not on means the buffer
    // has been edited or the bank has changed under it. Either way the run is
    // no longer coherent, and the database would refuse the evidence anyway.
    const status = contextStatusOf(parsed);
    const servedIds = new Set(sessionItemIds(status));
    if (parsed.answers.some((a) => a.format === "personal" && !servedIds.has(a.itemId))) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/** Creates or replaces the buffer for a fresh run. */
export function startBuffer(locale: Locale, startedAt: string): PublicBuffer {
  const buffer: PublicBuffer = {
    bufferVersion: BUFFER_VERSION,
    definitionVersion: DEFINITION_VERSION,
    contentVersion: CONTENT_VERSION,
    locale,
    answers: [],
    startedAt,
  };
  writeBuffer(buffer);
  return buffer;
}

function writeBuffer(buffer: PublicBuffer): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(buffer));
  } catch {
    // Storage full or disabled. The run continues in memory; the candidate
    // loses progress on refresh, which is strictly better than blocking them.
  }
}

/** Records an answer, replacing any previous answer to the same item.
 *
 *  Replacing rather than appending is what makes going back and changing an
 *  answer behave the way a candidate expects, and keeps exactly one answer per
 *  item — which the completion path requires. */
export function recordAnswer(buffer: PublicBuffer, answer: BufferedAnswer): PublicBuffer {
  let kept = buffer.answers.filter((a) => a.itemId !== answer.itemId);

  // Changing C1 changes the Discovery Path, which makes any adaptive answer
  // already given belong to a path this run is no longer on. Those answers are
  // dropped here rather than left to fail validation later, because `readBuffer`
  // discards a buffer it cannot fully trust — which would throw away all 20
  // Career DNA answers over a corrected first question.
  //
  // Career DNA answers are never dropped: the same 20 items are asked on every
  // path, so none of them is invalidated by a routing change.
  if (answer.itemId === CONTEXT_STATUS_ITEM_ID) {
    const previous = contextStatusOf(buffer);
    const next =
      answer.format === "personal" && isContextStatus(answer.value) ? answer.value : null;
    if (previous !== next) {
      const stillServed = new Set(sessionItemIds(next));
      kept = kept.filter((a) => a.format !== "personal" || stillServed.has(a.itemId));
    }
  }

  const nextBuffer: PublicBuffer = { ...buffer, answers: kept.concat(answer) };
  writeBuffer(nextBuffer);
  return nextBuffer;
}

/** The candidate's C1 answer, or null before they have given one.
 *
 *  This is the run's routing state: until it exists there is no Discovery
 *  Path, and therefore no way to know which four adaptive items to serve. */
export function contextStatusOf(buffer: PublicBuffer | null): ContextStatus | null {
  const a = buffer?.answers.find((x) => x.itemId === CONTEXT_STATUS_ITEM_ID);
  if (!a || a.format !== "personal") return null;
  return isContextStatus(a.value) ? a.value : null;
}

/** The full 28-question sequence for this run, in the frozen MVP order:
 *  2 Context → 22 Career DNA → 4 Discovery Path.
 *
 *  Ids rather than items, because the three stages are different shapes and
 *  the caller resolves each against its own bank. Before C1 is answered the
 *  tail is not yet knowable, so this returns the 24 ids that are — which is
 *  exactly what the flow can render at that point. */
export function sessionItemIds(status: ContextStatus | null): readonly string[] {
  return [
    ...CONTEXT_ITEMS.map((i) => i.id),
    ...CORE_ITEMS.map((i) => i.id),
    ...(status ? adaptiveItemsForStatus(status).map((i) => i.id) : []),
  ];
}

/** True when every question in the run has an answer.
 *
 *  Deliberately includes the personal layer: a run missing C1 has no
 *  Discovery Path, and one missing an adaptive answer is one question short.
 *  Either would be persisted as complete if this only counted core items. */
export function isComplete(buffer: PublicBuffer | null): boolean {
  if (!buffer) return false;
  const status = contextStatusOf(buffer);
  if (!status) return false;
  const answered = new Set(buffer.answers.map((a) => a.itemId));
  return sessionItemIds(status).every((id) => answered.has(id));
}

/** Freezes completedAt the first time the buffer is complete. Idempotent: a
 *  buffer that already has one keeps it, so re-entering the result view
 *  never shifts the completion time forward. */
export function markComplete(buffer: PublicBuffer, completedAt: string): PublicBuffer {
  if (buffer.completedAt) return buffer;
  const next: PublicBuffer = { ...buffer, completedAt };
  writeBuffer(next);
  return next;
}

/** True when every scored Career DNA item has an answer. Separate from
 *  `isComplete` because the two are asked at different points and only this
 *  one bears on whether a report can be produced. */
export function isCoreComplete(buffer: PublicBuffer | null): boolean {
  if (!buffer) return false;
  const answered = new Set(buffer.answers.map((a) => a.itemId));
  return CORE_ITEMS.every((i) => answered.has(i.id));
}

/**
 * Clears the buffer.
 *
 * Call this ONLY after persistence has succeeded. Clearing on failure would
 * destroy the candidate's answers with nothing stored in exchange — the one
 * outcome this whole design exists to avoid.
 */
export function clearBuffer(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Items still unanswered, in display order. Drives "resume where you left off".
 *
 *  Spans all 26 questions. Before C1 is answered the adaptive tail is unknown
 *  and simply absent — it appears as soon as the path is decided. */
export function remainingItemIds(buffer: PublicBuffer | null): string[] {
  const answered = new Set((buffer?.answers ?? []).map((a) => a.itemId));
  return sessionItemIds(contextStatusOf(buffer)).filter((id) => !answered.has(id));
}

// =========================================================================
// PENDING CLAIM — carrying a finished result across the account hop
// =========================================================================
//
// ── THE DEFECT ─────────────────────────────────────────────────────────
//
// The buffer above lives in sessionStorage, deliberately (see the file
// header): an abandoned half-finished assessment must not resurface days
// later on a shared computer. That reasoning is about an IN-PROGRESS run and
// it still holds.
//
// It does not hold for a FINISHED result the candidate has explicitly asked
// to save — and applying it there broke the single most important journey in
// the product. Creating an account requires confirming an email address, the
// confirmation link opens from a mail client, and that is a different TAB.
// sessionStorage is per-tab. So the result was destroyed by the very act of
// creating the account whose entire purpose was to keep it: the candidate
// signed in, landed on their dashboard, and their report was simply not
// there. Nothing had failed loudly; there was nothing to see.
//
// ── WHAT IS STORED, AND WHY IT IS STILL SAFE ───────────────────────────
//
// Only after the candidate presses "save", and only the completed run. It
// holds their ANSWERS and their optional career context — no name, no email,
// no identity of any kind, and still no database row: `anon` continues to
// hold nothing on any cd_ table, no RLS policy is keyed on anything a
// browser holds, and there remains no orphan report to leak or
// garbage-collect. The anonymous flow's security argument is unchanged; what
// changed is which browser store a candidate's own answers survive in
// between pressing save and finishing signup.
//
// ── WHY THERE IS A TOKEN ───────────────────────────────────────────────
//
// So that "whoever signs in on this browser next" is not the same thing as
// "the person who took this assessment". The token is minted when the
// candidate asks to save, and travels ONLY in the return URL handed to the
// auth flow — which, for email signup, means it travels inside the
// confirmation link sent to their own address. A different person signing in
// at /candidate/login arrives with no token and claims nothing, and a token
// that does not match the stored record claims nothing either.
//
// It is not a credential and grants no access: it authorises replaying
// answers that are already sitting in this browser, into whichever account
// completes the flow. The server-side write path is unchanged and still
// creates the session under a real user_id from the first insert.
//
// ── EXPIRY ─────────────────────────────────────────────────────────────
//
// Seven days, checked on read, and cleared the instant a claim succeeds. The
// shared-computer concern the sessionStorage choice was made for is answered
// by the token (another person cannot claim it) and by the expiry (it does
// not linger indefinitely), not by making the journey fail.

const CLAIM_KEY = "cqj:discovery:v31:pending-claim:v1";
const CLAIM_VERSION = 1;

/** Seven days. Long enough for "I'll confirm that email tomorrow", short
 *  enough that an abandoned result does not sit in a browser forever. */
const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingClaim {
  readonly claimVersion: number;
  readonly claimToken: string;
  readonly expiresAt: string;
  readonly buffer: PublicBuffer;
  /** The optional career-context answers, carried alongside so the claimed
   *  report is the same report the candidate saw — not a version of it that
   *  quietly lost its "you are here". */
  readonly careerContext: unknown;
}

function claimStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Storage disabled. The candidate can still save in this tab; they just
    // do not get the cross-tab hop. Never throws into the flow.
    return null;
  }
}

/** Mints the claim token.
 *
 *  `crypto.randomUUID` is the right answer and is used wherever it exists.
 *  It is absent in more places than it looks, though — most notably any
 *  non-secure context, which is exactly where a candidate testing a staging
 *  build ends up — and the previous fallback was `Date.now()` plus one
 *  `Math.random()`, which is neither unguessable nor unique enough for a
 *  value that decides who a finished result belongs to.
 *
 *  So the fallback now uses `getRandomValues`, which is available in every
 *  context `randomUUID` is missing from, and only degrades to `Math.random`
 *  when the platform offers no CSPRNG at all. 128 bits either way. */
function mintClaimToken(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = c.getRandomValues(new Uint8Array(16));
    // Written as a loop rather than an Array helper: this module is asserted
    // never to touch the database, and that assertion recognises a query by
    // its method call. Spelling the hex encoder out keeps the assertion
    // meaning what it says instead of being relaxed to accommodate it. See
    // scripts/public-assessment-auth-check.ts, group 3.
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return hex;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

/** Stage a finished result for claiming, and return the token that will be
 *  required to claim it. Overwrites any previous pending claim: there is one
 *  candidate per browser and the newest finished run is the one they asked
 *  to save. */
export function stageClaim(buffer: PublicBuffer, careerContext: unknown): string | null {
  const store = claimStore();
  if (!store) return null;
  if (!isComplete(buffer)) return null;
  const token = mintClaimToken();
  const record: PendingClaim = {
    claimVersion: CLAIM_VERSION,
    claimToken: token,
    expiresAt: new Date(Date.now() + CLAIM_TTL_MS).toISOString(),
    buffer,
    careerContext,
  };
  try {
    store.setItem(CLAIM_KEY, JSON.stringify(record));
  } catch {
    return null;
  }
  return token;
}

/** Why a staged claim could not be read.
 *
 *  ── WHY THIS IS A UNION AND NOT A NULL ──────────────────────────────
 *
 *  `readPendingClaim` collapses every failure into `null`, which is the
 *  right shape for the code that replays answers — it must never act on a
 *  half-trusted record. It is the wrong shape for the person standing in
 *  front of the screen. "We could not restore your result" is the same
 *  sentence for a claim that expired last week, a link opened in a browser
 *  that never held the result, and a token that does not match — and only
 *  one of those is worth them trying anything at all.
 *
 *  So the reason is preserved HERE, and thrown away by `readPendingClaim`.
 *  Nothing about the stored record is exposed by it: the reason describes
 *  the caller's own token, never the contents of a claim they cannot read.
 */
export type PendingClaimState =
  /** Nothing staged in this browser (or no token presented at all). */
  | { readonly status: "none" }
  /** Staged, but the seven-day window has passed. The record is destroyed. */
  | { readonly status: "expired" }
  /** Staged, but this token is not the one that was minted for it. */
  | { readonly status: "mismatch" }
  /** Staged against a different instrument version, or no longer a complete
   *  run. Replaying it would produce a report the candidate never took. */
  | { readonly status: "stale" }
  | { readonly status: "ok"; readonly claim: PendingClaim };

/** The staged result, IF this caller presented the matching token and the
 *  record is still valid — with the reason attached when it is not.
 *
 *  Never returns a partial or unverified record: a missing token, a
 *  mismatched token, an expired record, a record from a different
 *  buffer/claim version, or a run that is not actually complete all come
 *  back as a refusal. Replaying half of somebody's answers, or somebody
 *  else's, is worse than asking them to start again. */
export function inspectPendingClaim(token: string | null | undefined): PendingClaimState {
  const store = claimStore();
  if (!store || !token) return { status: "none" };
  try {
    const raw = store.getItem(CLAIM_KEY);
    if (!raw) return { status: "none" };
    const parsed = JSON.parse(raw) as PendingClaim;
    if (parsed.claimVersion !== CLAIM_VERSION) return { status: "stale" };
    // Constant-time comparison is not the point here — the token is not a
    // server-side secret and the attacker would already have to be sitting
    // at this browser. What matters is that a mismatch claims nothing.
    if (typeof parsed.claimToken !== "string" || parsed.claimToken !== token) {
      return { status: "mismatch" };
    }
    if (!parsed.expiresAt || Date.parse(parsed.expiresAt) <= Date.now()) {
      clearPendingClaim();
      return { status: "expired" };
    }
    const buffer = parsed.buffer;
    if (!buffer || buffer.bufferVersion !== BUFFER_VERSION) return { status: "stale" };
    if (buffer.definitionVersion !== DEFINITION_VERSION) return { status: "stale" };
    if (buffer.contentVersion !== CONTENT_VERSION) return { status: "stale" };
    if (!isComplete(buffer)) return { status: "stale" };
    return { status: "ok", claim: parsed };
  } catch {
    return { status: "stale" };
  }
}

/** The staged result, or null. The replay path's view of
 *  `inspectPendingClaim` — see that function for why the reason exists and
 *  why this one deliberately discards it. */
export function readPendingClaim(token: string | null | undefined): PendingClaim | null {
  const state = inspectPendingClaim(token);
  return state.status === "ok" ? state.claim : null;
}

/** Whether a pending claim exists at all, without needing the token.
 *
 *  Deliberately returns nothing but a boolean: it is used only to decide
 *  whether it is worth telling the candidate that a saved-but-unclaimed
 *  result is waiting. It can never be used to read or claim one. */
export function hasPendingClaim(): boolean {
  const store = claimStore();
  if (!store) return false;
  try {
    const raw = store.getItem(CLAIM_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as PendingClaim;
    return parsed.claimVersion === CLAIM_VERSION && Date.parse(parsed.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

export function clearPendingClaim(): void {
  const store = claimStore();
  if (!store) return;
  try {
    store.removeItem(CLAIM_KEY);
  } catch {
    /* nothing to clear */
  }
}

// =========================================================================
// CLAIMED RESULT — what the claim URL means AFTER it has been claimed
// =========================================================================
//
// ── THE DEFECT ─────────────────────────────────────────────────────────
//
// A claim is consumed exactly once: the staged record is destroyed the
// moment the write is confirmed (see clearPendingClaim's call site). That is
// correct, and it is also why the claim URL turned hostile the second it
// worked. The candidate lands on their saved report, presses Back, and the
// browser returns them to /security-career-assessment?claim=<token> — where
// there is now no staged claim at all. The honest reading of that state is
// "this link no longer carries a result", and telling somebody that thirty
// seconds after their result was saved is indistinguishable from losing it.
//
// So the token's OUTCOME is remembered where the token itself was: the
// snapshot the claim produced. Returning to the claim URL then means "you
// have already saved this — here it is", which is both true and useful.
//
// ── WHAT IS STORED ─────────────────────────────────────────────────────
//
// The token and the snapshot id it produced. No answers, no report content,
// no identity. The snapshot id is not a credential: reading that report
// still requires being signed in as its owner, enforced by RLS, and this
// record cannot make anybody its owner. Same seven-day window as the claim
// it replaces, so nothing outlives the journey it belongs to.

const CLAIMED_KEY = "cqj:discovery:v31:claimed-result:v1";
const CLAIMED_VERSION = 1;

interface ClaimedResult {
  readonly claimedVersion: number;
  readonly claimToken: string;
  readonly snapshotId: string;
  readonly expiresAt: string;
}

/** Record that this token has already produced a saved report. Called only
 *  after a confirmed write, alongside clearPendingClaim. */
export function rememberClaimedResult(token: string, snapshotId: string): void {
  const store = claimStore();
  if (!store || !token || !snapshotId) return;
  const record: ClaimedResult = {
    claimedVersion: CLAIMED_VERSION,
    claimToken: token,
    snapshotId,
    expiresAt: new Date(Date.now() + CLAIM_TTL_MS).toISOString(),
  };
  try {
    store.setItem(CLAIMED_KEY, JSON.stringify(record));
  } catch {
    // Storage full or disabled. The claim itself already succeeded; the
    // candidate loses only the Back-button courtesy.
  }
}

/** The snapshot this token already produced, if it produced one in this
 *  browser and the record is still current. Token-matched for the same
 *  reason the claim itself is: a different token learns nothing. */
export function readClaimedResult(token: string | null | undefined): string | null {
  const store = claimStore();
  if (!store || !token) return null;
  try {
    const raw = store.getItem(CLAIMED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClaimedResult;
    if (parsed.claimedVersion !== CLAIMED_VERSION) return null;
    if (parsed.claimToken !== token) return null;
    if (!parsed.expiresAt || Date.parse(parsed.expiresAt) <= Date.now()) {
      try {
        store.removeItem(CLAIMED_KEY);
      } catch {
        /* nothing to clear */
      }
      return null;
    }
    return typeof parsed.snapshotId === "string" && parsed.snapshotId ? parsed.snapshotId : null;
  } catch {
    return null;
  }
}

// =========================================================================
// CLAIM ENTRY — the one decision the claim URL makes on arrival
// =========================================================================
//
// Extracted as a pure function rather than left inline in the flow's boot
// effect, because it is the decision this whole PR turns on and it has to be
// testable without a browser, a router or a Supabase session. See
// scripts/career-discovery-claim-check.ts.
//
// The ORDER is the fix. The flow previously resolved the internal-tester
// allowlist first and returned early on a refusal, so a candidate who had
// legitimately completed the assessment anonymously and created an account
// to save it was shown "not open yet" and their finished run was never even
// looked at. Whether the product is open to a signed-in user STARTING a run
// and whether this browser is holding a finished run that belongs to
// whoever just signed in are two different questions; only the second one
// is asked here.

export type ClaimEntry =
  /** No claim token in the URL. The ordinary flow decides everything. */
  | { readonly kind: "none" }
  /** This token already produced a saved report. Go there. */
  | { readonly kind: "already-saved"; readonly snapshotId: string }
  /** A finished run is waiting to be claimed by whoever is signed in. */
  | { readonly kind: "claimable"; readonly claim: PendingClaim }
  /** A token was presented and cannot be honoured. `reason` is what to say. */
  | { readonly kind: "unclaimable"; readonly reason: "expired" | "mismatch" | "stale" | "none" };

/**
 * What a `?claim=` token means right now, in this browser.
 *
 * `already-saved` is deliberately checked FIRST: a token that has already
 * produced a report is answered by that report, not by the absence of the
 * staged record it consumed.
 */
export function resolveClaimEntry(token: string | null | undefined): ClaimEntry {
  if (!token) return { kind: "none" };
  const saved = readClaimedResult(token);
  if (saved) return { kind: "already-saved", snapshotId: saved };
  const state = inspectPendingClaim(token);
  if (state.status === "ok") return { kind: "claimable", claim: state.claim };
  return { kind: "unclaimable", reason: state.status };
}
