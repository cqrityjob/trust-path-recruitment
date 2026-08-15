// The public v3.1 assessment.
//
// Restores the pre-15949db capability: a signed-out visitor answers every
// question, and the database is not touched until they sign in. Answers live in
// sessionStorage (v31-public-buffer.ts); persistence goes through the normal
// authenticated v3.1 pipeline.
//
// ── THE FROZEN MVP: 26 QUESTIONS ───────────────────────────────────────
//
//     Stage 1 ·  2 Career Context questions   → decides the Discovery Path
//     Stage 2 · 20 Career DNA questions       → the only scored items
//     Stage 3 ·  4 Discovery Path questions   → contextual, never scored
//
// The Career DNA questions come from v31/core-items and v31/option-matrix. The
// context and Discovery Path questions come from the owner-locked banks in
// ../context-items and ../adaptive-items via v31/personal-layer — reused
// unchanged, not re-authored, and not replaced by the Career Intelligence
// Excel's wording. The Excel is the engine that runs after the assessment.
//
// No scoring happens client-side: the server builds the report from the
// replayed answers exactly as it does for a signed-in run, and it builds it
// from the 20 Career DNA answers alone.
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
// answer twenty-six questions and only then discover their result cannot
// be saved would still be the worst version of this feature, which is why
// a signed-in non-tester is stopped here instead of at the save button.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRight, Check, Loader2 } from "lucide-react";
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
import { V31ReportView } from "@/components/career-discovery/v31/V31ReportView";
import { supabase } from "@/integrations/supabase/client";
import { CORE_ITEM_BY_ID } from "@/lib/career-discovery/v31/core-items";
import { OPTION_SET_BY_QUESTION } from "@/lib/career-discovery/v31/option-matrix";
import {
  isAdaptiveItemId,
  isPersonalItemId,
  MVP_QUESTION_COUNT,
  personalItem,
} from "@/lib/career-discovery/v31/personal-layer";
import type { Answer } from "@/lib/career-discovery/v31/scoring";
import {
  buildValidatedSnapshot,
  SnapshotValidationError,
  type ReportSnapshot,
} from "@/lib/career-discovery/v31/snapshot";
import {
  clearBuffer,
  contextStatusOf,
  isComplete,
  markComplete,
  readBuffer,
  recordAnswer,
  sessionItemIds,
  startBuffer,
  type PublicBuffer,
} from "@/lib/career-discovery/v31-public-buffer";
import {
  getV31Availability,
  getV31TesterStatus,
  persistPublicV31Run,
} from "@/lib/career-discovery/v31-public.functions";
import {
  FUNNEL_EVENT_NAMES,
  trackV31FunnelEvent,
  type FunnelEventName,
} from "@/lib/career-discovery/v31-feedback.functions";

// "result" is the terminal state for BOTH an anonymous and a signed-in
// visitor while they are still looking at it: the full report, computed
// client-side from the buffer via the exact same pure buildValidatedSnapshot
// the server calls, with NOTHING written to the database yet. See
// clientSnapshot below and the file header — this is what actually restores
// "no login wall before the result"; a signed-in visitor still moves straight
// on to "persisting" via the effect below, same as before.
type Phase =
  | "checking"
  | "unavailable"
  | "intro"
  | "questions"
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
  /** In-flight guard for persistence. See onSaveAndSignIn. */
  const persistingRef = useRef(false);

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
        }
        // Resume an in-flight run if this tab has one.
        const existing = readBuffer();
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
          setPhase(isComplete(resumed) ? "result" : "questions");
          return;
        }
        setPhase("intro");
      },
    );
    return () => {
      alive = false;
    };
  }, [checkAvailability, checkTesterStatus]);

  // The run's own question order: 2 context → 20 Career DNA → 4 Discovery
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

  const advance = useCallback(
    (next: PublicBuffer) => {
      if (isComplete(next)) {
        // Frozen exactly once here — the moment completion actually happens
        // — so the result view and, later, the saved report agree on when
        // the run finished (see PublicBuffer.completedAt).
        setBuffer(markComplete(next, new Date().toISOString()));
        setPhase("result");
        track("assessment_completed");
        return;
      }
      setBuffer(next);
      // Recomputed from `next`, not from `itemIds`: answering C1 decides the
      // path, which is what makes the last four questions exist at all.
      const ids = sessionItemIds(contextStatusOf(next));
      const answered = new Set(next.answers.map((a) => a.itemId));
      const nextIndex = ids.findIndex((id) => !answered.has(id));
      setIndex(nextIndex === -1 ? Math.min(index + 1, ids.length - 1) : nextIndex);
    },
    [index, track],
  );

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
      // Return here after login. The buffer is untouched and survives the hop.
      navigate({
        to: "/candidate/login",
        search: { redirect: "/security-career-assessment" } as never,
      });
      return;
    }
    persistingRef.current = true;
    setPhase("persisting");
    try {
      const result = await persist({
        data: { locale: buffer.locale, answers: buffer.answers, completedAt: buffer.completedAt },
      });
      // ONLY now. Clearing before a confirmed write would destroy the
      // candidate's answers with nothing stored in exchange.
      clearBuffer();
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

  // A signed-in visitor returning with a complete buffer persists immediately
  // rather than sitting on the client-computed preview — they already have
  // somewhere for the canonical, saved report to live.
  useEffect(() => {
    if (phase === "result" && signedIn && buffer && isComplete(buffer)) {
      void onSaveAndSignIn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, signedIn]);

  // The full result, computed entirely client-side from the buffer — the
  // exact same pure buildValidatedSnapshot the server calls at persist time,
  // given the exact same answers. Nothing is written to the database to
  // produce this: see v31-public-buffer.ts's header for why that is the
  // whole security argument for the anonymous flow, and why this is safe to
  // compute and render in the browser before any account exists.
  const clientSnapshot = useMemo<ReportSnapshot | null>(() => {
    if (!buffer || !isComplete(buffer)) return null;
    const contextStatus = contextStatusOf(buffer);
    if (!contextStatus) return null;

    const answers: Answer[] = [];
    for (const a of buffer.answers) {
      if (a.format === "scale") answers.push({ itemId: a.itemId, format: "scale", value: a.value });
      else if (a.format === "single_choice") {
        answers.push({ itemId: a.itemId, format: "single_choice", optionId: a.optionId });
      }
      // "personal" (context/adaptive) answers are never scored — excluded
      // exactly as the server's own byItem/personal split excludes them.
    }

    try {
      return buildValidatedSnapshot({
        answers,
        locale: buffer.locale,
        completedAt: buffer.completedAt ?? new Date().toISOString(),
        contextStatus,
        // No professionCatalog: an anonymous browser session has no
        // business reading cd_professions (RLS grants it to `authenticated`
        // only), and nothing is approved for ranking yet regardless — the
        // result would be identical either way, `available: false`.
      });
    } catch (err) {
      if (!(err instanceof SnapshotValidationError)) throw err;
      // Should not happen: the flow already guarantees a well-formed,
      // complete 26-answer buffer before this runs. If it ever does, fail
      // toward "let the candidate sign in and let the server try" rather
      // than showing a broken page.
      console.error("[v31] client-side result computation failed", err.failures);
      return null;
    }
  }, [buffer]);

  useEffect(() => {
    if (phase === "result" && clientSnapshot) track("result_viewed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, clientSnapshot !== null]);

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
                      advance(recordAnswer(buffer, { itemId, format: "scale", value: v }))
                    }
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

          <AssessmentNavigation
            onBack={() => setIndex((i) => Math.max(0, i - 1))}
            backDisabled={index === 0}
            forward={
              isComplete(buffer)
                ? { label: t("cd.public.toResult"), onClick: () => setPhase("result") }
                : undefined
            }
          />
        </AssessmentCard>
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
  // clientSnapshot above: this is the actual fix for "no login wall before
  // the result". Signed-in visitors pass through here for a moment before
  // the effect above hands off to the real, saved report.
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
      <button
        type="button"
        onClick={() => void onSaveAndSignIn()}
        className="mt-7 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-accent px-7 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto motion-reduce:transition-none"
      >
        {signedIn ? t("cd.public.saveNow") : t("cd.public.signInToSave")}
      </button>
      <p className="mt-4 text-xs text-muted-foreground">{t("cd.public.answersKept")}</p>
    </AssessmentPanel>
  );

  if (!clientSnapshot) {
    // The rare fallback: something about this browser's computed snapshot
    // did not validate. The candidate has not lost anything — the buffer is
    // untouched — so signing in and letting the server (which runs the same
    // validation against the same answers) try is still a real path forward.
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
            {t("cd.public.doneBody")}
          </p>
        </AssessmentPanel>
        {saveCta}
      </AssessmentShell>
    );
  }

  return (
    <AssessmentShell wide>
      <V31ReportView
        snapshot={clientSnapshot}
        generatedAt={clientSnapshot.completedAt}
        versions={{
          definition: clientSnapshot.versions.definitionVersion,
          content: clientSnapshot.versions.contentVersion,
          scoring: clientSnapshot.versions.scoringVersion,
          taxonomy: clientSnapshot.versions.taxonomyVersion,
        }}
        mode="anonymous"
        onCareerCardEvent={(name) => {
          if ((FUNNEL_EVENT_NAMES as readonly string[]).includes(name))
            track(name as FunnelEventName);
        }}
      />
      {!signedIn && saveCta}
    </AssessmentShell>
  );
}
