// The public v3.1 assessment.
//
// Restores the pre-15949db capability: a signed-out visitor answers every
// question, and the database is not touched until they sign in. Answers live in
// sessionStorage (v31-public-buffer.ts); persistence goes through the normal
// authenticated v3.1 pipeline.
//
// ── ONLY v3.1 ──────────────────────────────────────────────────────────
//
// Questions come from v31/core-items and v31/option-matrix. Nothing here
// imports a v3.0 module, and no scoring happens client-side — the server builds
// the report from the replayed answers exactly as it does for a signed-in run.
//
// ── AVAILABILITY IS CHECKED FIRST, NOT LAST ────────────────────────────
//
// v3.1 sits at internal_test and the database refuses candidate sessions
// against it. Letting someone answer twenty questions and only then discover
// their result cannot be saved would be the worst possible version of this
// feature, so availability is resolved before the first question renders.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { useT } from "@/i18n/context";
import { supabase } from "@/integrations/supabase/client";
import { CORE_ITEMS } from "@/lib/career-discovery/v31/core-items";
import { OPTION_SET_BY_QUESTION } from "@/lib/career-discovery/v31/option-matrix";
import {
  clearBuffer,
  isComplete,
  readBuffer,
  recordAnswer,
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
          const answered = new Set(existing.answers.map((a) => a.itemId));
          const next = CORE_ITEMS.findIndex((i) => !answered.has(i.id));
          setIndex(next === -1 ? CORE_ITEMS.length - 1 : next);
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

  const item = CORE_ITEMS[index];
  const options = useMemo(() => {
    if (!item || item.format !== "single_choice" || !buffer) return [];
    return permute(OPTION_SET_BY_QUESTION[item.id].options, `${buffer.startedAt}:${item.id}`);
  }, [item, buffer]);

  const answerFor = (itemId: string) => buffer?.answers.find((a) => a.itemId === itemId);

  const advance = useCallback(
    (next: PublicBuffer) => {
      setBuffer(next);
      if (isComplete(next)) {
        setPhase("save");
        return;
      }
      const answered = new Set(next.answers.map((a) => a.itemId));
      const nextIndex = CORE_ITEMS.findIndex((i) => !answered.has(i.id));
      setIndex(nextIndex === -1 ? Math.min(index + 1, CORE_ITEMS.length - 1) : nextIndex);
    },
    [index],
  );

  async function onSaveAndSignIn() {
    if (!buffer) return;
    if (!signedIn) {
      // Return here after login. The buffer is untouched and survives the hop.
      navigate({
        to: "/candidate/login",
        search: { redirect: "/security-career-assessment" } as never,
      });
      return;
    }
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
    } catch {
      // The buffer is deliberately left intact so the candidate can retry.
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
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {t("cd.public.loading")}
      </p>
    );
  }

  if (phase === "unavailable") {
    return (
      <div role="status" className="rounded-lg border border-border bg-background p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("cd.public.unavailableTitle")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t("cd.public.unavailableBody")}
        </p>
        <Link
          to="/career-center"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          {t("cd.public.exploreInstead")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="max-w-prose">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {t("cd.public.introTitle")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t("cd.public.introBody")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("cd.public.introNoAccount")}
        </p>
        <button
          type="button"
          onClick={() => {
            setBuffer(startBuffer(lang === "en" ? "en" : "sv", new Date().toISOString()));
            setIndex(0);
            setPhase("questions");
          }}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          {t("cd.public.start")}
        </button>
      </div>
    );
  }

  if (phase === "questions" && item && buffer) {
    const current = answerFor(item.id);
    const answeredCount = buffer.answers.length;
    return (
      <div className="max-w-prose">
        {/* Progress: text, not colour or bar alone. */}
        <p className="text-xs uppercase tracking-widest text-muted-foreground" aria-live="polite">
          {t("cd.public.progress")} {answeredCount} / {CORE_ITEMS.length}
        </p>

        <fieldset className="mt-4 border-0 p-0">
          <legend className="text-lg font-medium leading-snug text-foreground">
            {item.stem[lang === "en" ? "en" : "sv"]}
          </legend>

          {item.format === "scale" ? (
            <div className="mt-6 space-y-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                <label
                  key={v}
                  className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted has-[:checked]:border-accent has-[:checked]:bg-muted"
                >
                  <input
                    type="radio"
                    name={item.id}
                    value={v}
                    checked={current?.format === "scale" && current.value === v}
                    onChange={() =>
                      advance(recordAnswer(buffer, { itemId: item.id, format: "scale", value: v }))
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
                    name={item.id}
                    value={o.id}
                    checked={current?.format === "single_choice" && current.optionId === o.id}
                    onChange={() =>
                      advance(
                        recordAnswer(buffer, {
                          itemId: item.id,
                          format: "single_choice",
                          optionId: o.id,
                        }),
                      )
                    }
                    className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--accent)]"
                  />
                  <span>{o.text[lang === "en" ? "en" : "sv"]}</span>
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
