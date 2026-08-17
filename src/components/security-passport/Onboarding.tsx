// Progressive Väktare onboarding.
//
// ── ONE GROUP PER SCREEN, AND A REASON FOR EACH ────────────────────────
//
// Every step states why the information is wanted. A person handing over
// their employment history deserves that before they type, not in a policy
// they will never open.
//
// ── PROGRESS AS DOTS, NOT A BAR ────────────────────────────────────────
//
// A filled progress bar is a meter, and meters are the visual language this
// product reserves for nothing at all — the Trust product must not render
// anything a reader could mistake for a measurement of them. Discrete dots
// plus "Step 3 of 13" is unmistakably navigation.
//
// ── THE CLAIM NOTICE APPEARS WHERE THE CLAIM IS MADE ───────────────────
//
// Steps that create an entry say so, on that step, in words: the answer
// becomes SELF_DECLARED, which means it came from the holder and nobody has
// checked it. Explaining that once at the end would let a holder complete
// the whole flow believing they had built verified evidence.
//
// ── PROTOTYPE PERSISTENCE ONLY ─────────────────────────────────────────
//
// Autosave and resume run through sessionStorage (prototype-state.ts). No
// server, no database, no real personal data — the fields are fictional
// reviewer input and the harness offers a visible reset.

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Info, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { ONBOARDING_STEPS } from "@/lib/security-passport/onboarding";
import {
  emptyState,
  goToStep,
  markSkipped,
  readState,
  recordAnswer,
  type PrototypeState,
} from "@/lib/security-passport/prototype-state";

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <li
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i < current ? "w-4 bg-accent" : i === current ? "w-6 bg-primary" : "w-1.5 bg-border",
          )}
        />
      ))}
    </ol>
  );
}

/** Where progress is kept.
 *
 *  Phase 2 gave this component a second home: the dev prototype still saves
 *  to sessionStorage, while the authenticated product saves to the holder's
 *  own database row. Parameterising the persistence — rather than forking
 *  the component — keeps one reviewed onboarding UX instead of two that
 *  drift apart the first time a step changes. */
export interface OnboardingPersistence {
  readonly read: () => PrototypeState | null;
  /** Called after every mutation. The sessionStorage helpers already write
   *  on their own, so the prototype's implementation is a no-op. */
  readonly save: (state: PrototypeState) => void;
}

const SESSION_PERSISTENCE: OnboardingPersistence = {
  read: readState,
  save: () => {},
};

export function Onboarding({
  onFinish,
  className,
  persistence = SESSION_PERSISTENCE,
}: {
  onFinish: () => void;
  className?: string;
  persistence?: OnboardingPersistence;
}) {
  const { pt } = usePassportCopy();
  const [state, setState] = useState<PrototypeState>(() => persistence.read() ?? emptyState());
  const [errorFieldIds, setErrorFieldIds] = useState<readonly string[]>([]);
  const [savedFlash, setSavedFlash] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const stepIndex = Math.min(state.stepIndex, ONBOARDING_STEPS.length - 1);
  const step = ONBOARDING_STEPS[stepIndex];
  const total = ONBOARDING_STEPS.length;

  // Move focus to the new step heading on navigation. Without this a
  // keyboard or screen-reader user stays focused on a button that has just
  // been replaced, and has to hunt for where they are.
  useEffect(() => {
    headingRef.current?.focus();
    setErrorFieldIds([]);
  }, [stepIndex]);

  const answerFor = useMemo(
    () => (fieldId: string) => state.answers[`${step.id}.${fieldId}`] ?? "",
    [state.answers, step.id],
  );

  function setAnswer(fieldId: string, value: string) {
    setState((s) => {
      const next = recordAnswer(s, step.id, fieldId, value);
      persistence.save(next);
      return next;
    });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  }

  function goNext() {
    const missing = step.fields
      .filter((f) => f.required && answerFor(f.id).trim() === "")
      .map((f) => f.id);
    if (missing.length > 0) {
      setErrorFieldIds(missing);
      return;
    }
    if (stepIndex === total - 1) {
      onFinish();
      return;
    }
    setState((s) => {
      const next = goToStep(s, stepIndex + 1);
      persistence.save(next);
      return next;
    });
  }

  function goBack() {
    if (stepIndex === 0) return;
    setState((s) => {
      const next = goToStep(s, stepIndex - 1);
      persistence.save(next);
      return next;
    });
  }

  function skip() {
    setState((s) => {
      const next = goToStep(markSkipped(s, step.id), stepIndex + 1);
      persistence.save(next);
      return next;
    });
  }

  return (
    <div className={cn("mx-auto w-full max-w-2xl", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm tabular-nums text-muted-foreground">
          {pt("onboarding.step")} {stepIndex + 1} {pt("onboarding.of")} {total}
        </p>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs transition-opacity",
            savedFlash ? "text-emerald-700 opacity-100 dark:text-emerald-400" : "opacity-0",
          )}
          role="status"
        >
          <Save aria-hidden="true" className="h-3.5 w-3.5" />
          {pt("onboarding.saved")}
        </span>
      </div>
      <div className="mt-3">
        <StepDots current={stepIndex} total={total} />
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
              step.required
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground",
            )}
          >
            {step.required ? pt("onboarding.required") : pt("onboarding.optional")}
          </span>
        </div>

        <h3
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 text-2xl font-semibold tracking-tight text-foreground outline-none"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt(step.titleKey)}
        </h3>

        {step.bodyKey ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pt(step.bodyKey)}</p>
        ) : null}

        {step.fields.length > 0 ? (
          <div className="mt-6 space-y-4">
            {step.fields.map((field) => {
              const invalid = errorFieldIds.includes(field.id);
              const describedBy = invalid ? `${step.id}-${field.id}-error` : undefined;
              const inputId = `${step.id}-${field.id}`;

              return (
                <div key={field.id}>
                  <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
                    {pt(field.labelKey)}
                    {field.required ? <span className="ml-1 text-muted-foreground">*</span> : null}
                  </label>

                  {field.type === "select" ? (
                    <select
                      id={inputId}
                      value={answerFor(field.id)}
                      aria-invalid={invalid}
                      aria-describedby={describedBy}
                      onChange={(e) => setAnswer(field.id, e.target.value)}
                      className={cn(
                        "mt-1.5 block h-11 w-full rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        invalid ? "border-destructive" : "border-input",
                      )}
                    >
                      <option value="">—</option>
                      {field.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "checkbox" ? (
                    <div className="mt-1.5 flex items-start gap-2.5">
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={answerFor(field.id) === "yes"}
                        aria-invalid={invalid}
                        aria-describedby={describedBy}
                        onChange={(e) => setAnswer(field.id, e.target.checked ? "yes" : "")}
                        className="mt-0.5 h-5 w-5 rounded border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      />
                      <span className="text-sm leading-relaxed text-foreground">
                        {pt(field.labelKey)}
                      </span>
                    </div>
                  ) : (
                    <input
                      id={inputId}
                      type={field.type === "date" ? "date" : "text"}
                      value={answerFor(field.id)}
                      aria-invalid={invalid}
                      aria-describedby={describedBy}
                      onChange={(e) => setAnswer(field.id, e.target.value)}
                      className={cn(
                        "mt-1.5 block h-11 w-full rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        invalid ? "border-destructive" : "border-input",
                      )}
                    />
                  )}

                  {invalid ? (
                    <p
                      id={`${step.id}-${field.id}-error`}
                      role="alert"
                      className="mt-1.5 text-sm text-destructive"
                    >
                      {pt("onboarding.required")}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {step.createsClaim ? (
          <p className="mt-6 rounded-lg border border-dashed border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
            {pt("onboarding.createsClaim")}
          </p>
        ) : null}

        <div className="mt-6 flex items-start gap-2.5 border-t border-border pt-4">
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{pt("onboarding.why")}: </span>
            {pt(step.whyKey)}
          </p>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={stepIndex === 0}
          className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {pt("onboarding.back")}
        </button>

        <button
          type="button"
          onClick={goNext}
          className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {stepIndex === total - 1 ? pt("onboarding.finish") : pt("onboarding.continue")}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>

        {!step.required ? (
          <button
            type="button"
            onClick={skip}
            className="inline-flex h-11 items-center rounded-md px-3 text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("onboarding.skip")}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onFinish}
          className="inline-flex h-11 items-center rounded-md px-3 text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt("onboarding.saveExit")}
        </button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{pt("onboarding.savedAt")}</p>
    </div>
  );
}
