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
// v3.1 sits at internal_test and the database refuses candidate sessions
// against it. Letting someone answer twenty questions and only then discover
// their result cannot be saved would be the worst possible version of this
// feature, so availability is resolved before the first question renders.

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
import { supabase } from "@/integrations/supabase/client";
import { CORE_ITEM_BY_ID } from "@/lib/career-discovery/v31/core-items";
import { OPTION_SET_BY_QUESTION } from "@/lib/career-discovery/v31/option-matrix";
import {
  isAdaptiveItemId,
  isPersonalItemId,
  MVP_QUESTION_COUNT,
  personalItem,
} from "@/lib/career-discovery/v31/personal-layer";
import {
  clearBuffer,
  contextStatusOf,
  isComplete,
  readBuffer,
  recordAnswer,
  sessionItemIds,
  startBuffer,
  type PublicBuffer,
} from "@/lib/career-discovery/v31-public-buffer";
import {
  getV31Availability,
  persistPublicV31Run,
} from "@/lib/career-discovery/v31-public.functions";

type Phase = "checking" | "unavailable" | "intro" | "questions" | "save" | "persisting" | "failed";

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
  const persist = useServerFn(persistPublicV31Run);

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
      ([availability, session]) => {
        if (!alive) return;
        setSignedIn(Boolean(session.data.session));
        if (!availability.available) {
          setPhase("unavailable");
          return;
        }
        // Resume an in-flight run if this tab has one.
        const existing = readBuffer();
        if (existing) {
          setBuffer(existing);
          const ids = sessionItemIds(contextStatusOf(existing));
          const answered = new Set(existing.answers.map((a) => a.itemId));
          const next = ids.findIndex((id) => !answered.has(id));
          setIndex(next === -1 ? Math.max(0, ids.length - 1) : next);
          setPhase(isComplete(existing) ? "save" : "questions");
          return;
        }
        setPhase("intro");
      },
    );
    return () => {
      alive = false;
    };
  }, [checkAvailability]);

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
      setBuffer(next);
      if (isComplete(next)) {
        setPhase("save");
        return;
      }
      // Recomputed from `next`, not from `itemIds`: answering C1 decides the
      // path, which is what makes the last four questions exist at all.
      const ids = sessionItemIds(contextStatusOf(next));
      const answered = new Set(next.answers.map((a) => a.itemId));
      const nextIndex = ids.findIndex((id) => !answered.has(id));
      setIndex(nextIndex === -1 ? Math.min(index + 1, ids.length - 1) : nextIndex);
    },
    [index],
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
      const result = await persist({ data: { locale: buffer.locale, answers: buffer.answers } });
      // ONLY now. Clearing before a confirmed write would destroy the
      // candidate's answers with nothing stored in exchange.
      clearBuffer();
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

  // A signed-in visitor returning with a complete buffer persists immediately.
  useEffect(() => {
    if (phase === "save" && signedIn && buffer && isComplete(buffer)) {
      void onSaveAndSignIn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, signedIn]);

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
      <div className="max-w-prose">
        {/* Progress: text, not colour or bar alone. */}
        <p className="text-xs uppercase tracking-widest text-muted-foreground" aria-live="polite">
          {stageLabel} · {t("cd.public.progress")} {answeredCount} / {MVP_QUESTION_COUNT}
        </p>

        <fieldset className="mt-4 border-0 p-0">
          <legend className="text-lg font-medium leading-snug text-foreground">
            {personal ? personal.prompt[locale] : coreItem!.stem[locale]}
          </legend>

          {personal ? (
            <div className="mt-6 space-y-3">
              {personal.options.map((o) => (
                <label
                  key={o.value}
                  className="flex min-h-[44px] w-full cursor-pointer items-start gap-3 rounded-md border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground transition-colors hover:bg-muted has-[:checked]:border-accent has-[:checked]:bg-muted"
                >
                  <input
                    type="radio"
                    name={itemId}
                    value={o.value}
                    checked={current?.format === "personal" && current.value === o.value}
                    onChange={() =>
                      advance(
                        recordAnswer(buffer, {
                          itemId,
                          format: "personal",
                          value: o.value,
                        }),
                      )
                    }
                    className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--accent)]"
                  />
                  <span>{o.label[locale]}</span>
                </label>
              ))}
            </div>
          ) : coreItem!.format === "scale" ? (
            <div className="mt-6 space-y-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                <label
                  key={v}
                  className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted has-[:checked]:border-accent has-[:checked]:bg-muted"
                >
                  <input
                    type="radio"
                    name={itemId}
                    value={v}
                    checked={current?.format === "scale" && current.value === v}
                    onChange={() =>
                      advance(recordAnswer(buffer, { itemId, format: "scale", value: v }))
                    }
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span>{v}</span>
                  {v === 1 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {t("cd.public.scaleLow")}
                    </span>
                  )}
                  {v === 10 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {t("cd.public.scaleHigh")}
                    </span>
                  )}
                </label>
              ))}
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {options.map((o) => (
                <label
                  key={o.id}
                  className="flex min-h-[44px] w-full cursor-pointer items-start gap-3 rounded-md border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground transition-colors hover:bg-muted has-[:checked]:border-accent has-[:checked]:bg-muted"
                >
                  <input
                    type="radio"
                    name={itemId}
                    value={o.id}
                    checked={current?.format === "single_choice" && current.optionId === o.id}
                    onChange={() =>
                      advance(
                        recordAnswer(buffer, {
                          itemId,
                          format: "single_choice",
                          optionId: o.id,
                        }),
                      )
                    }
                    className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--accent)]"
                  />
                  <span>{o.text[locale]}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-4 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t("cd.public.back")}
          </button>
          {isComplete(buffer) && (
            <button
              type="button"
              onClick={() => setPhase("save")}
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-xs font-medium text-accent-foreground"
            >
              {t("cd.public.toResult")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === "persisting") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {t("cd.public.saving")}
      </p>
    );
  }

  if (phase === "failed") {
    return (
      <div role="alert" className="rounded-lg border border-border bg-background p-6">
        <h2 className="text-base font-semibold text-foreground">{t("cd.public.failedTitle")}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t("cd.public.failedBody")}
        </p>
        <button
          type="button"
          onClick={() => setPhase("save")}
          className="mt-4 inline-flex h-10 items-center rounded-md border border-border px-4 text-xs font-medium text-foreground hover:bg-muted"
        >
          {t("cd.public.retry")}
        </button>
      </div>
    );
  }

  // phase === "save"
  return (
    <div className="max-w-prose">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
        <Check className="h-5 w-5 text-accent" aria-hidden="true" />
        {t("cd.public.doneTitle")}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {t("cd.public.doneBody")}
      </p>
      <button
        type="button"
        onClick={() => void onSaveAndSignIn()}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        {signedIn ? t("cd.public.saveNow") : t("cd.public.signInToSave")}
      </button>
      <p className="mt-3 text-xs text-muted-foreground">{t("cd.public.answersKept")}</p>
    </div>
  );
}
