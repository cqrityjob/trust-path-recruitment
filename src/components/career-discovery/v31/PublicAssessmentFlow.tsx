// The public v3.1 assessment.
//
// Restores the pre-15949db capability: a signed-out visitor answers every
// question, and the database is not touched until they sign in. Answers live in
// sessionStorage (v31-public-buffer.ts); persistence goes through the normal
// authenticated v3.1 pipeline.
//
// ── THE FROZEN MVP: 28 QUESTIONS ───────────────────────────────────────
//
//     Stage 1 ·  2 Career Context questions   → decides the Discovery Path
//     Stage 2 · 22 Career DNA questions       → the only scored items
//     Stage 3 ·  4 Discovery Path questions   → contextual, never scored
//
// 20 -> 22 with CQ21/CQ22 (Final Autonomous Matching Engine Completion
// Mandate — CID17 Regulatory & Compliance Orientation). See
// v31/personal-layer.ts's MVP_QUESTION_COUNT, asserted rather than
// hardcoded, so a future drift is caught at import time rather than here.
//
// The Career DNA questions come from v31/core-items and v31/option-matrix. The
// context and Discovery Path questions come from the owner-locked banks in
// ../context-items and ../adaptive-items via v31/personal-layer — reused
// unchanged, not re-authored, and not replaced by the Career Intelligence
// Excel's wording. The Excel is the engine that runs after the assessment.
//
// No scoring happens client-side, for anybody, at any point. The server
// builds the report from the buffered answers — via previewPublicV31Run
// before there is an account and persistPublicV31Run after — and both go
// through the one canonical builder, from the 22 Career DNA answers alone.
// See v31-public.functions.ts's "ONE COMPLETED ATTEMPT = ONE CANONICAL
// RESULT" header for why that single builder is the whole point.
//
// ── AVAILABILITY IS CHECKED FIRST, NOT LAST ────────────────────────────
//
// Two independent checks, both resolved before the first question renders:
// `getV31Availability` (is the content live at all — currently yes) and,
// for a signed-in visitor only, `getV31TesterStatus` (is the Career
// Intelligence layer built on top of it open to this specific person yet —
// see v31-public.functions.ts for why that is a separate question right
// now). An anonymous visitor cannot be checked for tester status before
// they exist as a user, so they proceed to the questions same as always;
// the real enforcement is server-side at persistPublicV31Run regardless,
// so nothing is actually exposed by letting them start. Letting someone
// answer every question and only then discover their result cannot
// be saved would still be the worst version of this feature, which is why
// a signed-in non-tester is stopped here instead of at the save button.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRight, Check, Download, Loader2, Share2 } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  AssessmentPanel,
  AssessmentShell,
} from "@/components/career-discovery/v31/shell/AssessmentShell";
import { AssessmentIntro } from "@/components/career-discovery/v31/shell/AssessmentIntro";
import {
  AssessmentCard,
  AssessmentNavigation,
  AssessmentProgressBar,
  LikertScale,
  SelectableAnswer,
} from "@/components/career-discovery/v31/shell/QuestionCard";
import { CareerContextStep } from "@/components/career-discovery/v31/CareerContextStep";
import { ProfileConnectionGate } from "@/components/career-journey/ProfileConnectionGate";
import {
  getMySecurityCareerProfile,
  setMyCurrentProfession,
} from "@/lib/security-career-profile/profile.functions";
import type { SecurityCareerProfileDraft } from "@/lib/security-career-profile/types";
import { getMyCareerJourney } from "@/lib/career-journey/career-journey.functions";
import type { CareerJourney } from "@/lib/career-journey/types";
import { V31ReportView } from "@/components/career-discovery/v31/V31ReportView";
import { supabase } from "@/integrations/supabase/client";
import {
  copyResultTextToClipboard,
  shareResultText,
} from "@/lib/career-discovery/v31/career-card-export";
import { DISCOVER_URL_PATH } from "@/lib/career-discovery/v31/career-card";
import {
  clearCareerContext,
  EMPTY_CAREER_CONTEXT,
  isCareerContextComplete,
  parseCareerContext,
  readCareerContext,
  shouldCollectCareerContext,
  writeCareerContext,
  type CareerContext,
} from "@/lib/career-discovery/career-context";
import { CORE_ITEM_BY_ID } from "@/lib/career-discovery/v31/core-items";
import { OPTION_SET_BY_QUESTION } from "@/lib/career-discovery/v31/option-matrix";
import {
  isAdaptiveItemId,
  isPersonalItemId,
  MVP_QUESTION_COUNT,
  personalItem,
} from "@/lib/career-discovery/v31/personal-layer";
import type { ReportSnapshot } from "@/lib/career-discovery/v31/snapshot";
import {
  clearBuffer,
  clearPendingClaim,
  contextStatusOf,
  isComplete,
  markComplete,
  readBuffer,
  readPendingClaim,
  recordAnswer,
  sessionItemIds,
  stageClaim,
  startBuffer,
  type PublicBuffer,
} from "@/lib/career-discovery/v31-public-buffer";
import {
  getV31Availability,
  getV31TesterStatus,
  persistPublicV31Run,
  previewPublicV31Run,
} from "@/lib/career-discovery/v31-public.functions";
import {
  FUNNEL_EVENT_NAMES,
  trackV31FunnelEvent,
  type FunnelEventName,
} from "@/lib/career-discovery/v31-feedback.functions";

// "result" is the terminal state for BOTH an anonymous and a signed-in
// visitor while they are still looking at it: the full canonical report,
// fetched from previewPublicV31Run, with NOTHING written to the database
// yet. See canonicalSnapshot below — this is what restores "no login wall
// before the result" WITHOUT the result changing when the wall is crossed;
// a signed-in visitor still moves straight on to "persisting" via the
// effect below, same as before.
type Phase =
  | "checking"
  | "unavailable"
  // The signed-in candidate's one screen about their own profile, before the
  // intro. Its own phase rather than a banner ON the intro because the two
  // ask for different decisions and stacking them produced a screen with
  // four buttons. Never reached by an anonymous visitor -- see
  // ProfileConnectionGate's header for why that is a commitment, not an
  // omission.
  | "profile-gate"
  | "intro"
  | "questions"
  // Master Completion Mandate item 2: a short, optional, non-scored step
  // between the 26th question and the report, shown only when C1 means the
  // candidate already works in security in some capacity — see
  // shouldCollectCareerContext. Its own phase, not folded into "questions",
  // because it is not one of the frozen 26 and must never be counted as one
  // (see AssessmentProgressBar's `total`, which stays MVP_QUESTION_COUNT).
  | "career-context"
  | "result"
  | "persisting"
  | "failed";

/** Deterministic option order.
 *
 *  Owner decision A-5 requires randomised order with the permutation stable for
 *  a session. Derived from the run's own startedAt plus the item id, so the same
 *  run always renders the same order — across a refresh, and without adding a
 *  field to the buffer that would have to be validated and versioned.
 */
function permute<T>(items: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function PublicAssessmentFlow() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const checkAvailability = useServerFn(getV31Availability);
  const checkTesterStatus = useServerFn(getV31TesterStatus);
  const persist = useServerFn(persistPublicV31Run);
  const previewRun = useServerFn(previewPublicV31Run);
  const trackEventFn = useServerFn(trackV31FunnelEvent);
  // Fire-and-forget: a tracking failure must never block or degrade the
  // candidate's actual experience (see trackV31FunnelEvent's own doc).
  const track = useCallback(
    (eventName: FunnelEventName, detail?: Record<string, string | number | boolean>) => {
      void trackEventFn({ data: { eventName, detail } }).catch(() => {
        /* best-effort only */
      });
    },
    [trackEventFn],
  );

  const [phase, setPhase] = useState<Phase>("checking");
  const [buffer, setBuffer] = useState<PublicBuffer | null>(null);
  const [index, setIndex] = useState(0);
  const [signedIn, setSignedIn] = useState(false);
  const [careerContext, setCareerContext] = useState<CareerContext>(EMPTY_CAREER_CONTEXT);
  /** The canonical Professional Profile, for a signed-in candidate. Read
   *  once at boot; `null` means "not signed in, or genuinely empty". */
  const [profile, setProfile] = useState<SecurityCareerProfileDraft | null>(null);
  const loadProfile = useServerFn(getMySecurityCareerProfile);
  const saveProfession = useServerFn(setMyCurrentProfession);
  const loadJourney = useServerFn(getMyCareerJourney);
  /** In-flight guard for persistence. See onSaveAndSignIn. */
  const persistingRef = useRef(false);
  /** Transient feedback for the share button — see onShareResult. Cleared on
   *  the next interaction rather than a timer, so it never disappears mid-read. */
  const [shareFeedback, setShareFeedback] = useState<"copied" | "shared" | null>(null);

  // The terminal phase for a just-completed buffer: the career
  // context step when C1 makes it relevant and it isn't already answered,
  // the report otherwise. Shared by the resume path and the live-advance
  // path below so they can never disagree.
  const phaseAfterQuestions = useCallback(
    (status: ReturnType<typeof contextStatusOf>, ctx: CareerContext): Phase =>
      shouldCollectCareerContext(status) && !isCareerContextComplete(ctx)
        ? "career-context"
        : "result",
    [],
  );

  // Availability and auth state, resolved together before anything renders.
  useEffect(() => {
    let alive = true;
    void Promise.all([checkAvailability({}), supabase.auth.getSession()]).then(
      async ([availability, session]) => {
        if (!alive) return;
        const isSignedIn = Boolean(session.data.session);
        setSignedIn(isSignedIn);
        if (!availability.available) {
          setPhase("unavailable");
          return;
        }
        // A signed-in visitor's eligibility can be checked now; an anonymous
        // one's cannot (see the file header) and is deferred to the save
        // step, same as the rest of this flow already defers persistence.
        if (isSignedIn) {
          const status = await checkTesterStatus({});
          if (!alive) return;
          if (!status.allowed) {
            setPhase("unavailable");
            return;
          }
          // The canonical profile, read ONCE, here. Best-effort: a failure
          // costs the gate and the career-context prefill, never the
          // assessment -- which is the same trade every optional read in
          // this flow already makes.
          try {
            const existing = await loadProfile();
            if (!alive) return;
            if (existing) {
              setProfile({
                currentStatus: existing.currentStatus,
                currentProfessionSlug: existing.currentProfessionSlug,
                currentProfessionOther: existing.currentProfessionOther,
                yearsOfExperience: existing.yearsOfExperience,
              });
            }
          } catch (err) {
            console.error("[v31] career profile read failed", err);
          }
        }
        // ── RECOVER A STAGED CLAIM ────────────────────────────────────
        //
        // The candidate finished, asked to save, created an account, and
        // came back through the confirmation link — which is a DIFFERENT
        // TAB, so this tab's sessionStorage buffer does not exist. The
        // staged copy does, and the token in the return URL is what
        // authorises replaying it here (see v31-public-buffer.ts).
        //
        // Ahead of readBuffer() deliberately: a claim token names a
        // specific finished run, and it must win over whatever half-run
        // this tab happens to be holding.
        const claimToken = new URLSearchParams(window.location.search).get("claim");
        const claimed = readPendingClaim(claimToken);
        if (claimed) {
          const recoveredContext = parseCareerContext(claimed.careerContext);
          setBuffer(claimed.buffer);
          setCareerContext(recoveredContext);
          // Mirror it back into this tab's own storage so the rest of the
          // flow — which reads and writes sessionStorage — sees the same
          // context the candidate answered, not an empty one.
          writeCareerContext(recoveredContext);
          setIndex(sessionItemIds(contextStatusOf(claimed.buffer)).length - 1);
          setPhase("result");
          return;
        }

        // Resume an in-flight run if this tab has one.
        const existing = readBuffer();
        const resumedCareerContext = readCareerContext();
        setCareerContext(resumedCareerContext);
        if (existing) {
          // A buffer completed before this build shipped markComplete has no
          // frozen completedAt yet — stamp it now, once, same as a fresh
          // completion would.
          const resumed =
            isComplete(existing) && !existing.completedAt
              ? markComplete(existing, new Date().toISOString())
              : existing;
          setBuffer(resumed);
          const ids = sessionItemIds(contextStatusOf(resumed));
          const answered = new Set(resumed.answers.map((a) => a.itemId));
          const next = ids.findIndex((id) => !answered.has(id));
          setIndex(next === -1 ? Math.max(0, ids.length - 1) : next);
          setPhase(
            isComplete(resumed)
              ? phaseAfterQuestions(contextStatusOf(resumed), resumedCareerContext)
              : "questions",
          );
          return;
        }
        // A signed-in candidate is shown what the product already knows
        // about them before they answer twenty-eight questions; an anonymous
        // one goes straight to the intro, with nothing in the way.
        setPhase(isSignedIn ? "profile-gate" : "intro");
      },
    );
    return () => {
      alive = false;
    };
  }, [checkAvailability, checkTesterStatus, loadProfile]);

  // The run's own question order: 2 context → 22 Career DNA → 4 Discovery
  // Path. Twenty-two ids until C1 is answered, because the Discovery Path —
  // and therefore its four questions — is not decided before then.
  const itemIds = useMemo(() => sessionItemIds(contextStatusOf(buffer)), [buffer]);
  const itemId = itemIds[index];

  const coreItem = itemId && !isPersonalItemId(itemId) ? CORE_ITEM_BY_ID[itemId] : undefined;
  const personal = itemId && isPersonalItemId(itemId) ? personalItem(itemId) : undefined;

  const options = useMemo(() => {
    if (!coreItem || coreItem.format !== "single_choice" || !buffer) return [];
    return permute(
      OPTION_SET_BY_QUESTION[coreItem.id].options,
      `${buffer.startedAt}:${coreItem.id}`,
    );
    // Context and Discovery Path options keep their authored order. They are a
    // sequence of distinct situations rather than interchangeable statements,
    // and shuffling them would only make the list harder to read.
  }, [coreItem, buffer]);

  const answerFor = (id: string) => buffer?.answers.find((a) => a.itemId === id);

  /** Record an answer and move on.
   *
   *  ── REVISITS MOVE ONE STEP, FIRST PASSES JUMP TO THE GAP ─────────────
   *
   *  On a first pass the right target is "the first question still without
   *  an answer", which is the next one and stays the next one all the way
   *  down the run. On a REVISIT it is not: somebody who stepped back four
   *  questions to reconsider one of them wants the fourth-from-last, not to
   *  be catapulted to wherever the run had got to — and if the buffer is
   *  already complete, the old rule sent them straight to the result page
   *  the instant they touched an answer, ending the review they had just
   *  started. `wasAnswered` tells the two apart. */
  const advance = useCallback(
    (next: PublicBuffer, wasAnswered: boolean) => {
      // Recomputed from `next`, not from `itemIds`: answering C1 decides the
      // path, which is what makes the last four questions exist at all.
      const ids = sessionItemIds(contextStatusOf(next));
      const answered = new Set(next.answers.map((a) => a.itemId));
      const last = ids.length - 1;

      // A revisit that is not the final question steps forward by one and
      // stays in the questions phase. Completion is decided below only when
      // there is genuinely nowhere further to go.
      if (wasAnswered && index < last) {
        setBuffer(next);
        setIndex(index + 1);
        return;
      }

      if (isComplete(next)) {
        // Frozen exactly once here — the moment completion actually happens
        // — so the result view and, later, the saved report agree on when
        // the run finished (see PublicBuffer.completedAt).
        setBuffer(markComplete(next, new Date().toISOString()));
        setPhase(phaseAfterQuestions(contextStatusOf(next), careerContext));
        track("assessment_completed");
        return;
      }
      setBuffer(next);
      const nextIndex = ids.findIndex((id) => !answered.has(id));
      setIndex(nextIndex === -1 ? Math.min(index + 1, last) : nextIndex);
    },
    [index, track, careerContext, phaseAfterQuestions],
  );

  /** Move on WITHOUT touching the answer.
   *
   *  ── THE DEFECT THIS CLOSES ───────────────────────────────────────────
   *
   *  There was no forward control on an answered question at all: the only
   *  way onward was to select an option, and re-selecting the option that
   *  is already selected fires no change event on a radio group. So a
   *  candidate who stepped back to check an answer and was happy with it
   *  had no way forward — Back worked, Forward did not exist, and the run
   *  was stuck until they changed an answer they did not want to change.
   *
   *  Nothing here writes to the buffer. An unchanged answer stays exactly
   *  the answer it was, with its original ordering and its original
   *  routing. */
  const continueForward = useCallback(() => {
    if (!buffer) return;
    const ids = sessionItemIds(contextStatusOf(buffer));
    if (index < ids.length - 1) {
      setIndex(index + 1);
      return;
    }
    if (isComplete(buffer)) {
      setBuffer(markComplete(buffer, new Date().toISOString()));
      setPhase(phaseAfterQuestions(contextStatusOf(buffer), careerContext));
    }
  }, [buffer, index, careerContext, phaseAfterQuestions]);

  async function onSaveAndSignIn() {
    if (!buffer) return;
    // Persistence creates a NEW session per call, so the completion RPC's
    // idempotency — which is keyed on session — does not protect against a
    // double submit. Two calls would produce two sessions and therefore two
    // reports for one run.
    //
    // A ref, not state: it updates synchronously, so a second call that
    // arrives before React re-renders still sees the flag. That is precisely
    // the case a state flag would miss, and it is reachable from a
    // StrictMode double-invoked effect or from the effect racing the button.
    if (persistingRef.current) return;
    track("save_journey_clicked");
    if (!signedIn) {
      // ── CARRYING THE RESULT ACROSS THE ACCOUNT HOP ────────────────────
      //
      // This used to send the candidate to /candidate/login and rely on the
      // sessionStorage buffer being here when they came back. For an
      // EXISTING user in the same tab that worked. For a NEW user — the
      // whole point of the screen — it could not: signing up requires
      // confirming an email address, the confirmation link opens in a
      // different tab, and sessionStorage is per-tab. The result was
      // destroyed by the act of creating the account to save it.
      //
      // The finished run is now staged for claiming (localStorage, token,
      // seven-day expiry — see v31-public-buffer.ts for the full security
      // argument) and the token travels in the return URL, which means it
      // travels inside the confirmation email's own link.
      const token = stageClaim(buffer, careerContext);
      const back = token
        ? `/security-career-assessment?claim=${encodeURIComponent(token)}`
        : "/security-career-assessment";
      // Registration, not login. A first-time anonymous candidate who has
      // just finished the assessment does not have an account — offering
      // "log in" as the primary route asks them to do the one thing they
      // cannot. The register page links to login for everybody else.
      navigate({ to: "/candidate/register", search: { redirect: back } as never });
      return;
    }
    persistingRef.current = true;
    setPhase("persisting");
    try {
      const result = await persist({
        data: {
          locale: buffer.locale,
          answers: buffer.answers,
          // The instant the preview built the report FOR, echoed back, so the
          // stored snapshot's completedAt matches the one the candidate
          // already read rather than drifting to a second `now`. Falls back to
          // the buffer's own frozen stamp when there is no preview in hand
          // (a legacy buffer resumed in another tab).
          completedAt: previewQuery.data?.completedAt ?? buffer.completedAt,
          // Contextual self-report, never scored — see career-context.ts.
          // Absent (undefined) when the step was never relevant/shown for
          // this candidate, distinct from an answered "prefer not to say".
          careerContext: careerContext.currentProfessionStatus ? careerContext : undefined,
        },
      });
      // ONLY now. Clearing before a confirmed write would destroy the
      // candidate's answers with nothing stored in exchange.
      clearBuffer();
      clearCareerContext();
      // Claimed exactly once: the staged copy goes at the same moment the
      // buffer does, and only after a confirmed write.
      clearPendingClaim();
      track("result_claimed");
      navigate({
        to: "/security-career-assessment/report/$snapshotId",
        params: { snapshotId: result.snapshotId },
      });
    } catch (err) {
      // Log the real reason. The candidate still sees the calm failure state,
      // but "Rapporten kunde inte sparas" with nothing in the console is what
      // turned a NOT NULL violation on cd_evidence.answer_tags into a
      // reproduce-and-isolate cycle in the live environment. The server now
      // puts the SQLSTATE and message in the error's detail; print it.
      console.error("[v31] saving the report failed", err);
      // The buffer is deliberately left intact so the candidate can retry, and
      // the guard is released so the retry is actually possible.
      persistingRef.current = false;
      setPhase("failed");
    }
  }

  /** The secondary route for somebody who already has an account.
   *
   *  Stages the same claim and carries the same token — the difference is
   *  only which auth page they land on. Without this, "log in" would be the
   *  one path that silently dropped the finished result. */
  function onSignInInstead() {
    if (!buffer) return;
    track("save_journey_clicked");
    const token = stageClaim(buffer, careerContext);
    const back = token
      ? `/security-career-assessment?claim=${encodeURIComponent(token)}`
      : "/security-career-assessment";
    navigate({ to: "/candidate/login", search: { redirect: back } as never });
  }

  /** DOWNLOAD — Final Candidate Result Delivery & Save Flow Fix, section 2.
   *  The simplest robust architecture available: the browser's own
   *  print-to-PDF, over the existing print stylesheet (see styles.css's
   *  `@media print` block and the `.no-print` classes already applied
   *  throughout V31ReportView/AssessmentShell) rather than a new PDF
   *  renderer. Needs no server round-trip, so it works identically before
   *  and after an account exists. */
  function onDownloadResult() {
    track("result_downloaded");
    window.print();
  }

  /** SHARE — section 3. Text-only and privacy-safe: never the private
   *  report, always the public assessment landing page (the same URL a
   *  Career Card's QR code points at). Web Share API first, clipboard copy
   *  as the fallback everywhere it's unavailable (most desktop browsers). */
  async function onShareResult() {
    track("share_initiated");
    const shareUrl = `${window.location.origin}${DISCOVER_URL_PATH}`;
    const shareText = t("cd.public.shareText");
    const outcome = await shareResultText(t("cd.public.shareTitle"), shareText, shareUrl);
    if (outcome === "shared") {
      setShareFeedback("shared");
      return;
    }
    if (outcome === "cancelled") return;
    // "unsupported" — no Web Share API on this browser/context.
    const copied = await copyResultTextToClipboard(shareText, shareUrl);
    if (copied) setShareFeedback("copied");
  }

  // A signed-in visitor returning with a complete buffer persists immediately
  // rather than sitting on the client-computed preview — they already have
  // somewhere for the canonical, saved report to live.
  useEffect(() => {
    if (phase === "result" && signedIn && buffer && isComplete(buffer)) {
      void onSaveAndSignIn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, signedIn]);

  // ── THE CANONICAL RESULT ────────────────────────────────────────────
  //
  // Built by the SERVER, for a signed-out visitor exactly as for a signed-in
  // one: `previewPublicV31Run` runs the same `buildCanonicalSnapshot` the
  // save path runs, with the same approved profession catalogue and the same
  // published CIG edges, and writes nothing.
  //
  // This replaces a client-side `buildValidatedSnapshot` call that passed no
  // `professionCatalog` and no `cigReachableSlugs` — the browser cannot read
  // `cd_professions` — and therefore produced a report with NO career
  // recommendations. Signing in rebuilt the same answers with the catalogue,
  // and the Top 3 appeared out of nowhere. Same answers, same engine,
  // different inputs, different result. See v31-public.functions.ts's header.
  //
  // There is deliberately no client-side fallback. A fallback IS the defect:
  // it would silently serve a differently-ranked report whenever the call
  // failed, which is the one thing this must never do. A failure shows a
  // retry instead, with the buffer untouched.
  const previewInput = useMemo(() => {
    if (!buffer || !isComplete(buffer)) return null;
    if (!contextStatusOf(buffer)) return null;
    return {
      locale: buffer.locale,
      answers: buffer.answers,
      // Frozen at completion (markComplete), so a refresh re-requests the
      // report for the SAME instant and gets the same snapshot back.
      completedAt: buffer.completedAt ?? undefined,
      // Contextual self-report, never scored — see career-context.ts. Absent
      // (undefined) when the step was never relevant for this candidate,
      // distinct from an answered "prefer not to say". The same value the
      // save path sends, so the two builds agree.
      careerContext: careerContext.currentProfessionStatus
        ? {
            currentProfessionStatus: careerContext.currentProfessionStatus,
            currentProfessionSlug: careerContext.currentProfessionSlug,
            currentProfessionOther: careerContext.currentProfessionOther,
            experienceBand: careerContext.experienceBand,
          }
        : undefined,
    };
  }, [buffer, careerContext]);

  const previewQuery = useQuery({
    queryKey: ["v31", "public-preview", previewInput],
    queryFn: () => previewRun({ data: previewInput! }),
    enabled: previewInput !== null,
    // The result of a finished run is a fact about answers that cannot
    // change while the candidate looks at it. Never refetch it in the
    // background: a silent refetch is exactly how a report could change
    // under the reader.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  const canonicalSnapshot: ReportSnapshot | null = previewQuery.data?.snapshot ?? null;

  // ── THE CAREER JOURNEY ──────────────────────────────────────────────
  //
  // A SEPARATE query from the report, deliberately, and the separation is
  // the architecture rather than a fetching detail. The snapshot above is
  // frozen: same answers, same bytes, forever. The journey is the opposite
  // kind of thing — it is recomputed from whatever the candidate's profile
  // says TODAY, so that changing jobs updates where they stand without
  // touching a single byte of the assessment they took last spring.
  //
  // Signed-in only. There is no anonymous journey to fetch: with no account
  // there is no profile, and the section renders its honest
  // "not enough information" state from a null.
  const journeyProfessionIds = useMemo(
    () => (canonicalSnapshot?.professions?.ranked ?? []).map((r) => r.match.professionId),
    [canonicalSnapshot],
  );
  const journeyQuery = useQuery({
    queryKey: ["career-journey", journeyProfessionIds],
    queryFn: () => loadJourney({ data: { professionIds: journeyProfessionIds } }),
    enabled: signedIn && journeyProfessionIds.length > 0,
    retry: 1,
  });
  const journey: CareerJourney | null = journeyQuery.data ?? null;

  useEffect(() => {
    if (phase === "result" && canonicalSnapshot) track("result_viewed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, canonicalSnapshot !== null]);

  if (phase === "checking") {
    return (
      <AssessmentShell>
        <AssessmentPanel role="status">
          <p className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <Loader2
              className="h-4 w-4 animate-spin text-accent motion-reduce:animate-none"
              aria-hidden="true"
            />
            {t("cd.public.loading")}
          </p>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  if (phase === "unavailable") {
    return (
      <AssessmentShell>
        <AssessmentPanel role="status">
          <h1
            className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {t("cd.public.unavailableTitle")}
          </h1>
          <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
            {t("cd.public.unavailableBody")}
          </p>
          <Link
            to="/career-center"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            {t("cd.public.exploreInstead")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  if (phase === "profile-gate") {
    return (
      <AssessmentShell wide>
        <ProfileConnectionGate
          profile={profile}
          // The picker's own titles are not loaded on this screen, and a raw
          // slug is not a profession name — so the gate shows the free-text
          // answer or nothing rather than "vaktare". The full, resolved
          // profile is one click away behind "Review my profile".
          professionTitle={null}
          locale={lang === "en" ? "en" : "sv"}
          onStart={() => setPhase("intro")}
          onOpenProfile={() => void navigate({ to: "/my-career" })}
        />
      </AssessmentShell>
    );
  }

  if (phase === "intro") {
    return (
      <AssessmentShell wide>
        <AssessmentIntro
          onStart={() => {
            setBuffer(startBuffer(lang === "en" ? "en" : "sv", new Date().toISOString()));
            setIndex(0);
            setPhase("questions");
            track("assessment_started");
          }}
        />
      </AssessmentShell>
    );
  }

  if (phase === "questions" && itemId && buffer && (coreItem || personal)) {
    const current = answerFor(itemId);
    const answeredCount = buffer.answers.length;
    const locale = lang === "en" ? "en" : "sv";

    // Which of the three stages this question belongs to. Named so the
    // candidate can see the shape of what they are doing rather than facing an
    // undifferentiated run of twenty-six.
    const stageLabel = personal
      ? isAdaptiveItemId(itemId)
        ? t("cd.public.stageDiscoveryPath")
        : t("cd.public.stageContext")
      : t("cd.public.stageCareerDna");

    return (
      <AssessmentShell showExit>
        <AssessmentCard>
          {/* Progress is stated as text as well as drawn — see AssessmentProgressBar. */}
          <AssessmentProgressBar
            stageLabel={stageLabel}
            current={Math.min(index + 1, MVP_QUESTION_COUNT)}
            total={MVP_QUESTION_COUNT}
            answered={answeredCount}
          />

          <div className="px-5 py-7 sm:px-8 sm:py-9">
            <fieldset className="border-0 p-0">
              <legend
                className="text-[1.25rem] font-semibold leading-snug tracking-tight text-foreground sm:text-[1.4375rem]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {personal ? personal.prompt[locale] : coreItem!.stem[locale]}
              </legend>

              {personal ? (
                <div className="mt-7 space-y-2.5">
                  {personal.options.map((o) => (
                    <SelectableAnswer
                      key={o.value}
                      name={itemId}
                      value={o.value}
                      checked={current?.format === "personal" && current.value === o.value}
                      onSelect={() =>
                        advance(
                          recordAnswer(buffer, {
                            itemId,
                            format: "personal",
                            value: o.value,
                          }),
                          current !== undefined,
                        )
                      }
                    >
                      {o.label[locale]}
                    </SelectableAnswer>
                  ))}
                </div>
              ) : coreItem!.format === "scale" ? (
                <div className="mt-7">
                  <LikertScale
                    name={itemId}
                    value={current?.format === "scale" ? current.value : undefined}
                    onSelect={(v) =>
                      advance(
                        recordAnswer(buffer, { itemId, format: "scale", value: v }),
                        current !== undefined,
                      )
                    }
                    instruction={t("cd.public.scaleInstruction")}
                    lowLabel={t("cd.public.scaleLow")}
                    highLabel={t("cd.public.scaleHigh")}
                  />
                </div>
              ) : (
                <div className="mt-7 space-y-2.5">
                  {options.map((o) => (
                    <SelectableAnswer
                      key={o.id}
                      name={itemId}
                      value={o.id}
                      checked={current?.format === "single_choice" && current.optionId === o.id}
                      onSelect={() =>
                        advance(
                          recordAnswer(buffer, {
                            itemId,
                            format: "single_choice",
                            optionId: o.id,
                          }),
                          current !== undefined,
                        )
                      }
                    >
                      {o.text[locale]}
                    </SelectableAnswer>
                  ))}
                </div>
              )}
            </fieldset>
          </div>

          {/* Forward is offered whenever this question already HAS an answer
              — not only once the whole run is complete, which is what left a
              candidate stranded on a question they had stepped back to and
              were happy with (see continueForward). On the final question of
              a complete run it still says "see your result"; anywhere else it
              says "next", because that is where it goes. */}
          <AssessmentNavigation
            onBack={() => setIndex((i) => Math.max(0, i - 1))}
            backDisabled={index === 0}
            forward={
              index === itemIds.length - 1
                ? isComplete(buffer)
                  ? {
                      label: t("cd.public.toResult"),
                      onClick: () =>
                        setPhase(phaseAfterQuestions(contextStatusOf(buffer), careerContext)),
                    }
                  : undefined
                : current !== undefined
                  ? { label: t("cd.public.next"), onClick: continueForward }
                  : undefined
            }
          />
        </AssessmentCard>
      </AssessmentShell>
    );
  }

  if (phase === "career-context") {
    return (
      <AssessmentShell showExit>
        <CareerContextStep
          value={careerContext}
          onChange={(next) => {
            setCareerContext(next);
            writeCareerContext(next);
          }}
          onContinue={() => {
            track("career_context_completed", {
              currentProfessionStatus: careerContext.currentProfessionStatus ?? "",
              experienceBand: careerContext.experienceBand ?? "",
            });
            // ── ONE ANSWER, ONE HOME ─────────────────────────────────
            //
            // The profession the candidate just named goes to the canonical
            // Professional Profile, not to a third private copy. The
            // cd_sessions columns still record it as part of THIS run --
            // that record is immutable and is what keeps a historical report
            // honest -- but the durable, editable answer now lives in the one
            // row that owns it.
            //
            // Only the profession. The experience band is deliberately NOT
            // written back: Career Discovery bands (under_1y / 1_3y / 4_7y /
            // 8_plus_y) and the profile's own bands (<1 / 1-3 / 3-5 / 5-10 /
            // 10+) are two vocabularies with no honest mapping between them
            // -- 4-7 years is neither "3-5" nor "5-10" -- and inventing one
            // would silently change what a candidate had said about
            // themselves. See the branch notes.
            //
            // Fire-and-forget: a profile write must never stand between a
            // candidate and the report they have just earned.
            if (signedIn && careerContext.currentProfessionStatus !== null) {
              const slug =
                careerContext.currentProfessionStatus === "selected"
                  ? careerContext.currentProfessionSlug
                  : null;
              const other =
                careerContext.currentProfessionStatus === "not_listed"
                  ? careerContext.currentProfessionOther
                  : null;
              if (slug || other) {
                void saveProfession({
                  data: { currentProfessionSlug: slug, currentProfessionOther: other },
                }).catch((err: unknown) => {
                  console.error("[v31] career profile profession write failed", err);
                });
              }
            }
            setPhase("result");
          }}
          locale={lang === "en" ? "en" : "sv"}
          // Signed in with a profession already on file: the question is
          // shown pre-answered rather than asked from scratch. Null for an
          // anonymous candidate, who has no profile to prefill from.
          prefillProfessionSlug={profile?.currentProfessionSlug ?? null}
        />
      </AssessmentShell>
    );
  }

  if (phase === "persisting") {
    return (
      <AssessmentShell>
        <AssessmentPanel role="status">
          <p className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <Loader2
              className="h-4 w-4 animate-spin text-accent motion-reduce:animate-none"
              aria-hidden="true"
            />
            {t("cd.public.saving")}
          </p>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  if (phase === "failed") {
    return (
      <AssessmentShell showExit>
        <AssessmentPanel role="alert">
          <h1
            className="text-lg font-semibold tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("cd.public.failedTitle")}
          </h1>
          <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
            {t("cd.public.failedBody")}
          </p>
          <button
            type="button"
            onClick={() => setPhase("result")}
            className="mt-5 inline-flex h-11 items-center rounded-[10px] border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-[color:var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {t("cd.public.retry")}
          </button>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  // phase === "result" — the full report, no account required. See
  // canonicalSnapshot above: this is the actual fix for "no login wall before
  // the result". Signed-in visitors pass through here for a moment before
  // the effect above hands off to the real, saved report.
  // DOWNLOAD / SHARE — section 5's intended order (complete -> see result ->
  // download/share -> optionally save). Rendered for every candidate,
  // signed in or not: keeping a copy or sharing it never required an
  // account and still doesn't. Hidden on print via .no-print so the
  // download itself never includes the button that triggered it.
  const resultActions = (
    <AssessmentPanel className="no-print mt-10 sm:p-10">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onDownloadResult}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-border px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {t("cd.public.downloadResult")}
        </button>
        <button
          type="button"
          onClick={() => void onShareResult()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-border px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {t("cd.public.shareResult")}
        </button>
        {shareFeedback && (
          <span role="status" className="text-xs text-muted-foreground">
            {shareFeedback === "shared" ? t("cd.public.shareShared") : t("cd.public.shareCopied")}
          </span>
        )}
      </div>
    </AssessmentPanel>
  );

  const saveCta = (
    <AssessmentPanel className="no-print mt-10 text-center sm:p-10">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[color:var(--secondary)]">
        <Check className="h-6 w-6 text-accent" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <h2
        className="mt-5 text-xl font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t("cd.public.doneTitle")}
      </h2>
      <p className="mx-auto mt-3 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
        {t("cd.public.doneBody")}
      </p>
      {/* PRIMARY: create an account. Somebody who has just finished the
          assessment anonymously most likely does not have one — leading with
          "log in", as this did, asked them to do the one thing they could
          not. Signing in stays available immediately below, and both routes
          carry the same claim token, so an existing user loses nothing. */}
      <button
        type="button"
        onClick={() => void onSaveAndSignIn()}
        className="mt-7 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-accent px-7 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto motion-reduce:transition-none"
      >
        {signedIn ? t("cd.public.saveNow") : t("cd.public.createAccountToSave")}
      </button>
      {!signedIn && (
        <p className="mt-4">
          <button
            type="button"
            onClick={() => onSignInInstead()}
            className="text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("cd.public.haveAccount")}
          </button>
        </p>
      )}
      <p className="mt-4 text-xs text-muted-foreground">{t("cd.public.answersKept")}</p>
    </AssessmentPanel>
  );

  // The canonical report is still on its way. Explicitly a WAIT, not a
  // degraded report: showing anything result-shaped here would mean showing
  // a result that changes when the real one arrives, which is the exact
  // defect this whole path exists to close.
  if (previewQuery.isPending) {
    return (
      <AssessmentShell>
        <AssessmentPanel className="text-center sm:p-10">
          <Loader2
            className="mx-auto h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p role="status" className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            {t("cd.public.buildingResult")}
          </p>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  if (!canonicalSnapshot) {
    // The report could not be built. The candidate has lost NOTHING — the
    // buffer is untouched and the run is still complete — so a retry is a
    // real path forward, and so is signing in and letting the save path build
    // the very same report.
    //
    // Deliberately no locally-computed stand-in. The browser cannot read the
    // approved profession catalogue, so anything it produced here would rank
    // differently from the report this candidate gets on every other screen.
    // A visible retry is honest; a silently different Top 3 is not.
    return (
      <AssessmentShell>
        <AssessmentPanel className="text-center sm:p-10">
          <h1
            className="text-xl font-semibold tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("cd.public.doneTitle")}
          </h1>
          <p className="mx-auto mt-3 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
            {t("cd.public.resultUnavailable")}
          </p>
          <button
            type="button"
            onClick={() => void previewQuery.refetch()}
            disabled={previewQuery.isFetching}
            className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-accent px-7 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 motion-reduce:transition-none"
          >
            {previewQuery.isFetching && (
              <Loader2
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {t("cd.public.retryResult")}
          </button>
          <p className="mt-4 text-xs text-muted-foreground">{t("cd.public.answersKept")}</p>
        </AssessmentPanel>
        {saveCta}
      </AssessmentShell>
    );
  }

  return (
    <AssessmentShell wide>
      <V31ReportView
        snapshot={canonicalSnapshot}
        generatedAt={canonicalSnapshot.completedAt}
        versions={{
          definition: canonicalSnapshot.versions.definitionVersion,
          content: canonicalSnapshot.versions.contentVersion,
          scoring: canonicalSnapshot.versions.scoringVersion,
          taxonomy: canonicalSnapshot.versions.taxonomyVersion,
        }}
        // Anonymous mode even for a signed-in visitor who is mid-save: the
        // stored report, with its history links, is one navigation away and
        // this screen is not it.
        mode="anonymous"
        // Null for an anonymous candidate, which is what makes the journey
        // section render its honest "we do not know your background yet"
        // state rather than nothing at all.
        journey={journey}
        onCareerCardEvent={(name) => {
          if ((FUNNEL_EVENT_NAMES as readonly string[]).includes(name))
            track(name as FunnelEventName);
        }}
      />
      {resultActions}
      {!signedIn && saveCta}
    </AssessmentShell>
  );
}
