// Security Career Discovery — the question flow.
//
// Stages: preparation → the five Discovery sections with transitions →
// completion. The two context questions come first, before preparation.
//
// ── PROGRESS ───────────────────────────────────────────────────────────
// Primary display is "Discovery X of 5". "Question X of Y in this section"
// is secondary and smaller. A bare "Question X of 26" is never primary.
//
// ── AUTOSAVE ───────────────────────────────────────────────────────────
// Every answer is saved BEFORE the flow advances. Saving / Saved / Retry
// are announced through an aria-live region. A refresh restores the
// question, the answer, the progress and the path from the server.
//
// ── ACCESSIBILITY ──────────────────────────────────────────────────────
// Semantic radiogroup with a labelled fieldset/legend, arrow-key roving
// selection via native radio inputs, visible focus, no colour-only state,
// section changes announced, no auto-submit on focus, reduced motion
// respected, and answers changeable before completion.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Loader2, RefreshCw } from "lucide-react";
import { AssessmentLayout } from "@/components/assessment/AssessmentLayout";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import {
  completeDiscoverySession,
  getDiscoverySessionState,
  saveDiscoveryAnswer,
  startDiscoverySession,
} from "@/lib/career-discovery/discovery.functions";
import { parseSessionId } from "@/lib/career-discovery/session-id";
import { PREPARATION_SCREEN } from "@/lib/career-discovery/sections";
import { assembleSession, progressFor } from "@/lib/career-discovery/session";
import type { AssembledSession, ContextStatus, DiscoveryItem } from "@/lib/career-discovery/types";
import { CONTEXT_ITEMS, isContextStatus } from "@/lib/career-discovery/context-items";

export const Route = createFileRoute("/_authenticated/discovery/session")({
  validateSearch: (s: Record<string, unknown>) => ({ session: String(s.session ?? "") }),
  component: DiscoverySessionRoute,
});

type SaveState = "idle" | "saving" | "saved" | "error";
type Stage = "context" | "preparation" | "questions" | "transition" | "completing";

function DiscoverySessionRoute() {
  const { session: sessionId } = Route.useSearch();
  const { t, lang } = useT();
  const navigate = useNavigate();

  const loadState = useServerFn(getDiscoverySessionState);
  const startSession = useServerFn(startDiscoverySession);
  const saveAnswer = useServerFn(saveDiscoveryAnswer);
  const complete = useServerFn(completeDiscoverySession);

  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [contextStatus, setContextStatus] = useState<ContextStatus | null>(null);
  const [stage, setStage] = useState<Stage>("context");
  const [contextIndex, setContextIndex] = useState(0);
  const [cursor, setCursor] = useState(0); // index into the section item list
  const [transitionFor, setTransitionFor] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastFailed, setLastFailed] = useState<{ itemId: string; value: string } | null>(null);
  const [recovering, setRecovering] = useState(false);

  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // ---- resume ------------------------------------------------------------
  useEffect(() => {
    let mounted = true;

    // Recovery path. The session id travels in the URL, and a query string
    // does not survive every round trip into an authenticated route — the
    // auth gate rebuilds the redirect from `window.location.pathname`,
    // which drops it. Rather than dead-end on an empty param, re-resolve
    // the session: startDiscoverySession is idempotent and returns the
    // caller's existing in-progress session, so this recovers the SAME run
    // and never creates a second one. The URL is then corrected in place.
    const resolved = parseSessionId(sessionId);
    if (!resolved) {
      setRecovering(true);
      startSession({ data: { locale: lang } })
        .then((r) => {
          if (!mounted) return;
          const recovered = parseSessionId(r?.sessionId);
          if (!recovered) {
            setFatal(t("careerDiscovery.session.error.missing"));
            setLoading(false);
            setRecovering(false);
            return;
          }
          // replace, not push: the broken URL must not stay in history.
          navigate({
            to: "/discovery/session",
            search: { session: recovered } as never,
            replace: true,
          });
        })
        .catch(() => {
          if (!mounted) return;
          setFatal(t("careerDiscovery.session.error.missing"));
          setLoading(false);
          setRecovering(false);
        });
      return () => {
        mounted = false;
      };
    }

    loadState({ data: { sessionId: resolved } })
      .then((s) => {
        if (!mounted) return;
        if (s.session.status === "completed" && s.snapshotId) {
          navigate({ to: "/discovery/report/$snapshotId", params: { snapshotId: s.snapshotId } });
          return;
        }
        setAnswers(s.answers);
        setContextStatus(s.session.contextStatus);

        // Resume exactly where they were. Both context answers present
        // means the context block is done.
        const ctxDone = CONTEXT_ITEMS.every((i) => s.answers[i.id]);
        if (!ctxDone) {
          setStage("context");
          setContextIndex(CONTEXT_ITEMS.findIndex((i) => !s.answers[i.id]));
        } else if (s.session.contextStatus) {
          const built = assembleSession(s.session.contextStatus);
          const sectionItems = built.items.filter((i) => i.indexInSection > 0);
          const firstUnanswered = sectionItems.findIndex((i) => !s.answers[i.item.id]);
          setStage(firstUnanswered === -1 ? "questions" : "questions");
          setCursor(firstUnanswered === -1 ? sectionItems.length - 1 : firstUnanswered);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setFatal(t("careerDiscovery.session.error.load"));
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [sessionId, loadState, startSession, navigate, t, lang]);

  const built: AssembledSession | null = useMemo(
    () => (contextStatus ? assembleSession(contextStatus) : null),
    [contextStatus],
  );
  const sectionItems = useMemo(
    () => (built ? built.items.filter((i) => i.indexInSection > 0) : []),
    [built],
  );

  // Move focus to the new heading whenever the visible question changes, so
  // a screen-reader user is taken to the new content rather than left at a
  // stale position.
  useEffect(() => {
    headingRef.current?.focus();
  }, [stage, cursor, contextIndex, transitionFor]);

  const persist = useCallback(
    async (itemId: string, value: string, section?: string) => {
      setSaveState("saving");
      try {
        await saveAnswer({
          data: {
            sessionId,
            itemId,
            answerValue: value,
            currentSection: section,
            currentItem: itemId,
          },
        });
        setSaveState("saved");
        setLastFailed(null);
        return true;
      } catch {
        setSaveState("error");
        setLastFailed({ itemId, value });
        return false;
      }
    },
    [saveAnswer, sessionId],
  );

  // ---- rendering helpers -------------------------------------------------

  if (recovering) {
    return (
      <AssessmentLayout narrow>
        <p role="status" className="text-sm text-muted-foreground">
          {t("careerDiscovery.session.recovering")}
        </p>
      </AssessmentLayout>
    );
  }
  if (loading) {
    return (
      <AssessmentLayout narrow>
        <p className="text-sm text-muted-foreground">{t("careerDiscovery.session.loading")}</p>
      </AssessmentLayout>
    );
  }
  if (fatal) {
    return (
      <AssessmentLayout narrow>
        <p role="alert" className="text-sm text-destructive">
          {fatal}
        </p>
      </AssessmentLayout>
    );
  }

  const SaveIndicator = () => (
    <p aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground">
      {saveState === "saving" && (
        <>
          <Loader2
            className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {t("careerDiscovery.session.saving")}
        </>
      )}
      {saveState === "saved" && (
        <>
          <Check className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          {t("careerDiscovery.session.saved")}
        </>
      )}
      {saveState === "error" && (
        <button
          type="button"
          onClick={() => lastFailed && persist(lastFailed.itemId, lastFailed.value)}
          className="inline-flex items-center gap-1.5 rounded text-destructive underline-offset-4 hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {t("careerDiscovery.session.retry")}
        </button>
      )}
    </p>
  );

  const QuestionCard = ({
    item,
    value,
    onChange,
  }: {
    item: DiscoveryItem;
    value: string | undefined;
    onChange: (v: string) => void;
  }) => (
    <fieldset className="border-0 p-0">
      <legend
        ref={headingRef as never}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight text-foreground focus:outline-none md:text-3xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {item.prompt[lang]}
      </legend>

      {item.stem && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {(["a", "b"] as const).map((k) => (
            <p
              key={k}
              className="rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground"
            >
              <span className="mr-2 font-semibold uppercase">{k}</span>
              {item.stem![k][lang]}
            </p>
          ))}
        </div>
      )}

      <div className="mt-8 space-y-3">
        {item.options.map((o) => {
          const selected = value === o.value;
          return (
            <label
              key={o.value}
              className={[
                "flex cursor-pointer items-start gap-3 rounded-md border p-4 text-sm leading-relaxed transition-colors",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                selected
                  ? "border-accent bg-accent/5 font-medium text-foreground"
                  : "border-border text-foreground hover:bg-muted/50",
              ].join(" ")}
            >
              <input
                type="radio"
                name={item.id}
                value={o.value}
                checked={selected}
                onChange={() => onChange(o.value)}
                className="mt-1 h-4 w-4 flex-shrink-0 accent-[var(--accent)]"
              />
              {/* Selection is conveyed by the radio, the border, the weight
                  and this mark — never by colour alone. */}
              <span className="flex-1">{o.label[lang]}</span>
              {selected && (
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" aria-hidden="true" />
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );

  // ---- stage: context ----------------------------------------------------

  if (stage === "context") {
    const item = CONTEXT_ITEMS[contextIndex];
    const value = answers[item.id];
    return (
      <AssessmentLayout narrow>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {t("careerDiscovery.session.contextStep")}
        </p>
        <div className="mt-8">
          <QuestionCard
            item={item}
            value={value}
            onChange={(v) => setAnswers((a) => ({ ...a, [item.id]: v }))}
          />
        </div>
        <div className="mt-12 flex items-center justify-between border-t border-border pt-6">
          <SaveIndicator />
          <PrimaryButton
            disabled={!value || saveState === "saving"}
            onClick={async () => {
              if (!value) return;
              const ok = await persist(item.id, value);
              if (!ok) return;
              if (item.id === CONTEXT_ITEMS[0].id && isContextStatus(value))
                setContextStatus(value);
              if (contextIndex + 1 < CONTEXT_ITEMS.length) setContextIndex(contextIndex + 1);
              else setStage("preparation");
            }}
          >
            {t("careerDiscovery.session.continue")}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </PrimaryButton>
        </div>
      </AssessmentLayout>
    );
  }

  // ---- stage: preparation ------------------------------------------------

  if (stage === "preparation") {
    return (
      <AssessmentLayout narrow>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-semibold tracking-tight text-foreground focus:outline-none md:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {PREPARATION_SCREEN.title[lang]}
        </h1>
        <div className="mt-8 space-y-5">
          {PREPARATION_SCREEN.body[lang].map((p) => (
            <p key={p} className="text-base leading-relaxed text-muted-foreground md:text-lg">
              {p}
            </p>
          ))}
        </div>
        <div className="mt-12">
          <PrimaryButton onClick={() => setStage("questions")}>
            {PREPARATION_SCREEN.cta[lang]}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </PrimaryButton>
        </div>
      </AssessmentLayout>
    );
  }

  if (!built) {
    return (
      <AssessmentLayout narrow>
        <p role="alert" className="text-sm text-destructive">
          {t("careerDiscovery.session.error.load")}
        </p>
      </AssessmentLayout>
    );
  }

  // ---- stage: transition -------------------------------------------------

  if (stage === "transition" && transitionFor) {
    const section = built.sections.find((s) => s.id === transitionFor);
    return (
      <AssessmentLayout narrow>
        <div role="status">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="whitespace-pre-line text-2xl font-semibold tracking-tight text-foreground focus:outline-none md:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {section?.transition?.[lang]}
          </h1>
        </div>
        <div className="mt-12">
          <PrimaryButton
            onClick={() => {
              setTransitionFor(null);
              setStage("questions");
            }}
          >
            {t("careerDiscovery.session.continue")}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </PrimaryButton>
        </div>
      </AssessmentLayout>
    );
  }

  // ---- stage: completing -------------------------------------------------

  if (stage === "completing") {
    return (
      <AssessmentLayout narrow>
        <p role="status" className="flex items-center gap-3 text-base text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t("careerDiscovery.session.generating")}
        </p>
      </AssessmentLayout>
    );
  }

  // ---- stage: questions --------------------------------------------------

  const current = sectionItems[cursor];
  const progress = progressFor(built, current.questionNumber);
  const value = answers[current.item.id];
  const isLast = cursor === sectionItems.length - 1;
  const section = built.sections.find((s) => s.id === current.sectionId)!;

  const advance = async () => {
    if (!value) return;
    const ok = await persist(current.item.id, value, current.sectionId);
    if (!ok) return;

    if (isLast) {
      setStage("completing");
      try {
        const { snapshotId } = await complete({ data: { sessionId } });
        navigate({ to: "/discovery/report/$snapshotId", params: { snapshotId } });
      } catch {
        setStage("questions");
        setFatal(t("careerDiscovery.session.error.complete"));
      }
      return;
    }

    const next = sectionItems[cursor + 1];
    if (next.sectionId !== current.sectionId && section.transition) {
      setTransitionFor(section.id);
      setStage("transition");
    }
    setCursor(cursor + 1);
  };

  return (
    <AssessmentLayout narrow>
      {/* Primary progress: the Discovery section. */}
      <div>
        <p className="text-sm font-semibold tracking-tight text-foreground">
          {t("careerDiscovery.session.discoveryOf")
            .replace("{n}", String(progress.sectionOrdinal))
            .replace("{total}", String(progress.sectionCount))}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {section.title[lang]} ·{" "}
          {t("careerDiscovery.session.questionInSection")
            .replace("{n}", String(progress.itemInSection))
            .replace("{total}", String(progress.itemsInSection))}
        </p>
        <div
          className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progress.sectionOrdinal}
          aria-valuemin={1}
          aria-valuemax={progress.sectionCount}
          aria-label={t("careerDiscovery.session.progressLabel")}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
            style={{
              width: `${((progress.sectionOrdinal - 1) / progress.sectionCount) * 100 + (progress.itemInSection / progress.itemsInSection) * (100 / progress.sectionCount)}%`,
            }}
          />
        </div>
      </div>

      <div className="mt-12">
        <QuestionCard
          item={current.item}
          value={value}
          onChange={(v) => setAnswers((a) => ({ ...a, [current.item.id]: v }))}
        />
      </div>

      <div className="mt-14 flex items-center justify-between border-t border-border pt-6">
        <button
          type="button"
          onClick={() => setCursor(Math.max(0, cursor - 1))}
          disabled={cursor === 0}
          className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("careerDiscovery.session.previous")}
        </button>

        <div className="flex items-center gap-4">
          <SaveIndicator />
          <PrimaryButton onClick={advance} disabled={!value || saveState === "saving"}>
            {isLast ? t("careerDiscovery.session.finish") : t("careerDiscovery.session.next")}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </PrimaryButton>
        </div>
      </div>
    </AssessmentLayout>
  );
}
