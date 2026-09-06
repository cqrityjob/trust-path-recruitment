// Security Passport — the first run.
//
// Signup sends a new person here (`/signup?redirect=/passport`, and the
// Passport overview hands over as soon as it sees no current merit). This
// route is the whole of what the homepage promised: create a private
// Passport, add one real merit, and be told honestly what was recorded.
//
// ── WHERE THE STATE COMES FROM ─────────────────────────────────────────
//
// From `getMyPassport`, through `deriveFirstRunState`. There is no local
// "step" the browser owns and no flag in storage: the screen is a function of
// whether a profile row exists, whether a CURRENT merit exists, and whether a
// draft was saved. A refresh mid-flow therefore lands exactly where the
// holder left off because the answer never lived in this component.
//
// Two deliberate exceptions:
//
//   * once a merit has been confirmed in THIS visit the confirmation screen is
//     held, because re-deriving would see the new merit and skip the only
//     screen that says what was recorded;
//   * a FAILED read is its own phase. An unreadable Passport is not the same
//     as no Passport, and offering "create your Security Passport" to somebody
//     who already has one is how a product invites a person to start again on
//     top of their own record.
//
// ── HOW A SAVE IS MADE HONEST ──────────────────────────────────────────
//
//   * the operation id is minted and PERSISTED — and the persistence awaited —
//     before any completion is attempted, so a retry, a refresh and a second
//     tab all carry the same key, and a lost response never produces a new one;
//   * draft saves are chained AND revision-numbered, and the database refuses
//     a stale revision and refuses to reopen a completed onboarding;
//   * the completion is single-flight: the in-flight promise is reused, so a
//     double-click is one request;
//   * the pending debounced save is flushed and AWAITED first, and the
//     completion sends the current field values as arguments rather than
//     reading them back out of the draft;
//   * "saved" is shown only after the exact returned subject id has been read
//     back over a fresh request and checked field by field, dates and country
//     included;
//   * a completion that FAILS is classified. A named server refusal is proof
//     that nothing was written and says so; anything else may have committed
//     and been lost on the way back, so it says that instead and offers a
//     retry that reconciles under the same operation id.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { getMyPassport } from "@/lib/security-passport/passport.functions";
import {
  completeFirstMerit,
  ensureFirstRunPassport,
  readBackFirstMerit,
  saveFirstRunDraft,
} from "@/lib/security-passport/first-run.functions";
import {
  DRAFT_COMPLETED,
  DRAFT_STALE,
  EMPTY_DRAFT,
  FIRST_RUN_SCREENS,
  checkReadback,
  classifyCompletionFailure,
  deriveFirstRunState,
  validateDraft,
  writeDraft,
  type FirstMeritDraft,
  type FirstMeritKind,
  type FirstMeritProblemId,
  type PersistedMerit,
} from "@/lib/security-passport/first-run";
import {
  ChooseMeritScreen,
  CreatePassportScreen,
  FirstRunLoadError,
  FirstRunLoading,
  MeritDetailsScreen,
  MeritSavedScreen,
  MeritUnconfirmedScreen,
} from "@/components/security-passport/FirstRunJourney";
import { invalidatePassportAndCareer } from "@/lib/security-passport/refresh";

export const Route = createFileRoute("/_authenticated/passport/onboarding")({
  ssr: false,
  component: FirstRunRoute,
});

/** Long enough that a burst of typing is one write, short enough that
 *  "Save and exit" a moment after the last keystroke already has it. The
 *  completion does not depend on it either way — it flushes first. */
const AUTOSAVE_DELAY_MS = 600;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A stable key for one submission.
 *
 *  `crypto.randomUUID` where it exists (every browser this product supports)
 *  and a v4-shaped fallback otherwise, because a completion with no
 *  idempotency key is refused by the server and an unsupported browser must
 *  not become "you cannot save your merit". */
function newOperationId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Phase =
  | { kind: "loading" }
  /** The Passport could not be READ. Not the same as not having one. */
  | { kind: "load_error" }
  | { kind: "create" }
  | { kind: "choose" }
  | { kind: "details" }
  | { kind: "done"; merit: PersistedMerit }
  /** The write may or may not have landed, and the product will not guess. */
  | { kind: "unconfirmed"; canReconcile: boolean };

/** What a failure means, so the copy can be specific about which thing did
 *  not happen and whether anything changed. */
type SaveError =
  | null
  /** The server refused before writing. Nothing changed, and it is safe to
   *  say so. */
  | { kind: "refused" }
  /** A lost response. The merit may exist; only a retry can establish it. */
  | { kind: "indeterminate" }
  /** Creating the Passport failed. A different sentence from a merit that did
   *  not save, because it is a different thing that did not happen. */
  | { kind: "create_failed" }
  /** "Save and exit" could not persist the draft, so the journey stayed put. */
  | { kind: "draft_failed" };

function FirstRunRoute() {
  const { pt } = usePassportCopy();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const load = useServerFn(getMyPassport);
  const createPassport = useServerFn(ensureFirstRunPassport);
  const saveDraft = useServerFn(saveFirstRunDraft);
  const complete = useServerFn(completeFirstMerit);
  const readBack = useServerFn(readBackFirstMerit);

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [draft, setDraft] = useState<FirstMeritDraft>(EMPTY_DRAFT);
  const [problems, setProblems] = useState<Readonly<Partial<Record<FirstMeritProblemId, string>>>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SaveError>(null);

  /** The answers already on the profile, so a draft save adds to them rather
   *  than replacing whatever else lives in that column. */
  const storedAnswers = useRef<Record<string, string>>({});
  const timer = useRef<number | null>(null);
  const pending = useRef<FirstMeritDraft | null>(null);
  /** ── THE SAVE CHAIN ──────────────────────────────────────────────
   *
   *  Every draft write is appended to one promise chain, so save B never
   *  starts before save A has finished. The database enforces the ordering
   *  independently (a strictly greater revision), which is what covers the
   *  second tab; this covers the ordinary case without paying for a refusal. */
  const chain = useRef<Promise<void>>(Promise.resolve());
  /** Monotonic, and seeded from what the server already holds so two tabs do
   *  not both start at 1. */
  const revision = useRef(0);
  /** Single-flight for the completion. A second click awaits the first
   *  request rather than starting another one. */
  const inFlightComplete = useRef<Promise<void> | null>(null);
  /** Set the moment a merit is written in THIS visit, so re-deriving from a
   *  refreshed snapshot cannot skip the confirmation screen. */
  const finished = useRef(false);
  /** True while the form holds values the server has not acknowledged. */
  const unsaved = useRef(false);

  /* ---- read the state, once, from what is stored -------------------- */

  const refresh = useCallback(async () => {
    // A merit was written in this visit. Re-deriving now would see it and
    // send the person to the overview, skipping the one screen that tells
    // them what was recorded and what it does and does not mean.
    if (finished.current) return;
    const snapshot = await load({ data: undefined });
    const profile = snapshot.profile;
    storedAnswers.current = { ...(profile?.onboardingAnswers ?? {}) };
    revision.current = Math.max(revision.current, profile?.onboardingDraftRevision ?? 0);

    const state = deriveFirstRunState({
      profile: profile
        ? { onboardingState: profile.onboardingState, onboardingAnswers: profile.onboardingAnswers }
        : null,
      meritLifecycleStates: [
        ...snapshot.holder.claims.map((c) => c.lifecycleState),
        ...snapshot.holder.periods.map((p) => p.lifecycleState),
      ],
    });

    if (state.screen === "overview") {
      // Somebody who already holds a current merit has no first run left.
      // `replace` so Back does not bounce them in again.
      void navigate({ to: "/passport", replace: true });
      return;
    }
    setDraft(state.draft);
    setPhase({ kind: state.screen });
  }, [load, navigate]);

  const loadOnce = useCallback(async () => {
    setError(null);
    setPhase({ kind: "loading" });
    try {
      await refresh();
    } catch (err) {
      // ── AN UNREADABLE PASSPORT IS NOT AN ABSENT ONE ────────────────
      //
      // This used to fall through to `create`, which offered somebody whose
      // Passport could not be loaded a button to make one — on top of the
      // record they already had.
      console.error("[passport] first-run load failed", err);
      setPhase({ kind: "load_error" });
    }
  }, [refresh]);

  useEffect(() => {
    void loadOnce();
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
    // `loadOnce` is stable; re-running on every render would refetch forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- the draft: chained, revisioned, flushable -------------------- */

  const writeNow = useCallback(
    async (next: FirstMeritDraft) => {
      const answers = writeDraft(storedAnswers.current, next);
      const step = FIRST_RUN_SCREENS.indexOf("details");
      revision.current += 1;
      const rev = revision.current;
      try {
        const result = await saveDraft({ data: { step, answers, revision: rev } });
        storedAnswers.current = answers;
        revision.current = Math.max(revision.current, result.revision);
        unsaved.current = false;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Overtaken by another tab. Catch up and let the next save win, rather
        // than fighting for a revision number.
        if (message.startsWith(DRAFT_STALE)) {
          const server = Number(message.split(":")[1] ?? 0);
          revision.current = Math.max(revision.current, Number.isFinite(server) ? server : 0);
          return;
        }
        // The holder finished in another tab. Their Passport is done; a draft
        // is no longer a thing that can exist, and calling that a failed save
        // would describe a rule working correctly as a fault.
        if (message === DRAFT_COMPLETED) return;
        throw err;
      }
    },
    [saveDraft],
  );

  /** Append to the chain, so writes never overlap. Returns the appended run,
   *  so a caller that must wait for THIS write can. */
  const enqueue = useCallback(
    (next: FirstMeritDraft) => {
      const run = chain.current.then(() => writeNow(next));
      // The chain must survive a rejection or every later save is skipped.
      chain.current = run.catch(() => {});
      return run;
    },
    [writeNow],
  );

  const scheduleDraft = useCallback(
    (next: FirstMeritDraft) => {
      pending.current = next;
      unsaved.current = true;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        const value = pending.current;
        pending.current = null;
        if (!value) return;
        // A failed autosave is logged, never destructive: the answers stay in
        // component state and the completion sends them directly, so losing a
        // draft write costs a resume and nothing else.
        void enqueue(value).catch((err: unknown) => {
          console.error("[passport] first-run draft save failed", err);
        });
      }, AUTOSAVE_DELAY_MS);
    },
    [enqueue],
  );

  /**
   * Cancel the debounce, perform the write it was going to perform, and wait
   * for the whole chain to drain. Rejects if that write failed, so a caller
   * that must not proceed on an unsaved draft can stop.
   */
  const flushDraft = useCallback(async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const value = pending.current;
    pending.current = null;
    if (value) {
      await enqueue(value);
      return;
    }
    await chain.current;
  }, [enqueue]);

  /**
   * The operation id, established DURABLY before any completion is attempted.
   *
   * A resumed legacy draft can carry a merit kind and no operation id. The
   * first version generated one inline inside the completion call, which meant
   * a lost response was followed by a retry under a DIFFERENT key — and a
   * different key is a different operation, which is how one submission
   * becomes two merits.
   */
  const ensureOperationId = useCallback(
    async (current: FirstMeritDraft): Promise<FirstMeritDraft> => {
      if (current.operationId) {
        await flushDraft();
        return current;
      }
      const withId = { ...current, operationId: newOperationId() };
      setDraft(withId);
      // Awaited, not scheduled: the id has to be on the server before the
      // first attempt, or a refresh mid-attempt loses it.
      await enqueue(withId);
      return withId;
    },
    [enqueue, flushDraft],
  );

  const onChange = useCallback(
    (patch: Partial<FirstMeritDraft>) => {
      setDraft((current) => {
        const next = { ...current, ...patch };
        scheduleDraft(next);
        return next;
      });
      // Clear only the problems the holder is now addressing. Wiping all of
      // them on the first keystroke hides the other fields they still have to
      // fix, which is how somebody presses Save three times.
      setProblems((current) => {
        const next = { ...current };
        for (const key of Object.keys(patch)) {
          if (key === "declared") delete next.declaration;
          else delete next[key as FirstMeritProblemId];
        }
        return next;
      });
      setError(null);
    },
    [scheduleDraft],
  );

  /* ---- leaving the page with unsaved answers ------------------------ */

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!unsaved.current) return;
      // The browser's own confirmation. It is the only guard that works for a
      // closed tab or a typed URL, and it is deliberately not used for in-app
      // navigation, which flushes instead.
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      // In-app navigation away from the journey: flush what is pending rather
      // than dropping it. The write is already queued on the chain, so it
      // completes even though this component is going.
      if (pending.current || timer.current !== null) void flushDraft().catch(() => {});
    };
  }, [flushDraft]);

  /* ---- screen 1: create the Passport -------------------------------- */

  const onCreate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Atomic and idempotent on the server, so the double-click this guard
      // also stops would have been harmless anyway — which is the order the
      // two belong in.
      await createPassport({ data: undefined });
      await invalidatePassportAndCareer(qc);
      await refresh();
    } catch (err) {
      console.error("[passport] passport creation failed", err);
      // Its OWN message. Saying "the merit was not saved" about a Passport
      // that could not be created describes the wrong thing.
      setError({ kind: "create_failed" });
    } finally {
      setBusy(false);
    }
  }, [busy, createPassport, qc, refresh]);

  /* ---- screen 2: choose a kind -------------------------------------- */

  const onChoose = useCallback(
    (kind: FirstMeritKind) => {
      // The operation id is minted HERE — before the first completion attempt
      // — and autosaved with the rest of the draft. `ensureOperationId` then
      // guarantees it has actually reached the server before any completion.
      const next: FirstMeritDraft = {
        ...EMPTY_DRAFT,
        ...draft,
        kind,
        operationId: draft.operationId ?? newOperationId(),
      };
      setDraft(next);
      setProblems({});
      setError(null);
      setPhase({ kind: "details" });
      scheduleDraft(next);
    },
    [draft, scheduleDraft],
  );

  /* ---- screen 3: save ----------------------------------------------- */

  const runCompletion = useCallback(
    async (submitted: FirstMeritDraft) => {
      // Everything the autosave was about to write, written and awaited, and
      // the operation id established durably, before anything is completed.
      const current = await ensureOperationId(submitted);

      const result = await complete({
        data: {
          operationId: current.operationId as string,
          meritKind: current.kind as FirstMeritKind,
          title: current.title.trim(),
          organisation: current.organisation.trim(),
          // "" is not a country. `null` is "nobody said", and the server
          // refuses an employment carrying it rather than defaulting one.
          country: current.country.trim() === "" ? null : current.country.trim(),
          startedOn: current.startedOn.trim() === "" ? null : current.startedOn.trim(),
          endedOn: current.ongoing || current.endedOn.trim() === "" ? null : current.endedOn.trim(),
          declared: true,
        },
      });

      // The write landed. From here on nothing may say "nothing changed".
      finished.current = true;
      unsaved.current = false;

      // ── THE READBACK ───────────────────────────────────────────────
      //
      // A separate request, for the exact id the completion returned, checked
      // field by field — dates and country included. Until it answers, nothing
      // on screen says "saved".
      let persisted: PersistedMerit | null = null;
      let outcome: "confirmed" | "mismatch" | "unknown";
      try {
        persisted = await readBack({
          data: { subjectKind: result.subjectKind, subjectId: result.subjectId },
        });
        const checked = checkReadback(
          { id: result.subjectId, kind: result.subjectKind, draft: current },
          persisted,
        );
        outcome = checked.outcome;
        if (checked.outcome === "mismatch") {
          console.error("[passport] first-merit readback mismatch", checked.mismatched);
        }
      } catch (err) {
        // The write may well have landed. "It failed" would be a guess, and
        // so would "it worked".
        console.error("[passport] first-merit readback failed", err);
        outcome = "unknown";
      }

      // Whatever the readback said, the write itself succeeded — so every
      // surface that counts merits has to be told, or My Career keeps
      // recommending the thing that has just been done.
      await invalidatePassportAndCareer(qc);

      if (outcome === "confirmed" && persisted) {
        setPhase({ kind: "done", merit: persisted });
        return;
      }
      // Reconciliation is safe here: the operation id is durable, so pressing
      // retry replays the same operation rather than making a second merit.
      setPhase({ kind: "unconfirmed", canReconcile: true });
    },
    [complete, ensureOperationId, qc, readBack],
  );

  const startCompletion = useCallback(
    (submitted: FirstMeritDraft) => {
      // ── SINGLE FLIGHT ────────────────────────────────────────────────
      //
      // The second click awaits the first request. Combined with the operation
      // id, a person who double-taps Save on a slow connection gets one merit
      // and one answer — and would get one merit even if both requests reached
      // the database, because the database refuses the second write.
      if (inFlightComplete.current) return;
      setBusy(true);
      setError(null);
      const run = runCompletion(submitted)
        .catch((err: unknown) => {
          console.error("[passport] first-merit completion failed", err);
          // ── REFUSED, OR MERELY UNANSWERED? ──────────────────────────
          //
          // A named server refusal is raised before the first INSERT, so it is
          // proof that nothing was written. Anything else — a dropped
          // connection, a timeout, a 500 — is not proof of anything, and
          // telling somebody "nothing has changed" may be false.
          setError(
            classifyCompletionFailure(err) === "refused"
              ? { kind: "refused" }
              : { kind: "indeterminate" },
          );
        })
        .finally(() => {
          inFlightComplete.current = null;
          setBusy(false);
        });
      inFlightComplete.current = run;
    },
    [runCompletion],
  );

  const onSubmit = useCallback(() => {
    const validation = validateDraft(draft, todayIso());
    if (!validation.ok) {
      setProblems(validation.problems);
      return;
    }
    startCompletion(draft);
  }, [draft, startCompletion]);

  /** "Save and exit": a draft, and nothing else.
   *
   *  No declaration, no merit, onboarding left `in_progress`. It used to be
   *  the same call as Finish, which meant leaving the flow recorded a
   *  truthfulness declaration on an empty Passport — and it used to navigate
   *  from a `finally`, so a FAILED save still took the person away and told
   *  them nothing. */
  const onSaveAndExit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await flushDraft();
      await enqueue(draft);
    } catch (err) {
      console.error("[passport] save and exit failed", err);
      // Stay on the form, keep every value, say what happened.
      setError({ kind: "draft_failed" });
      setBusy(false);
      return;
    }
    setBusy(false);
    void navigate({ to: "/my-career" });
  }, [busy, draft, enqueue, flushDraft, navigate]);

  /* ---- screen 4 -------------------------------------------------- */

  /** The confirmation's second action leaves first-run entirely.
   *
   *  It used to reset the journey and call the first-merit operation again
   *  with a new id, which would have minted a second declaration and a second
   *  `onboarding_completed` into an append-only log. The server now refuses
   *  that outright; this is the other half of the fix — the ordinary editor is
   *  where later merits belong. */
  const onAddAnother = useCallback(() => {
    void navigate({ to: "/passport/information", hash: "sp-employment" });
  }, [navigate]);

  const screen = useMemo(() => {
    switch (phase.kind) {
      case "loading":
        return <FirstRunLoading />;

      case "load_error":
        return <FirstRunLoadError onRetry={() => void loadOnce()} />;

      case "create":
        return (
          <CreatePassportScreen
            onCreate={() => void onCreate()}
            busy={busy}
            error={error?.kind === "create_failed" ? pt("fr.error.createFailed") : null}
          />
        );

      case "choose":
        return <ChooseMeritScreen onChoose={onChoose} />;

      case "details":
        return (
          <MeritDetailsScreen
            kind={(draft.kind ?? "employment") as FirstMeritKind}
            draft={draft}
            problems={problems}
            onChange={onChange}
            onSubmit={onSubmit}
            onSaveAndExit={() => void onSaveAndExit()}
            onBack={() => {
              setProblems({});
              setError(null);
              setPhase({ kind: "choose" });
            }}
            busy={busy}
            error={
              error?.kind === "refused"
                ? pt("fr.error.saveRefused")
                : error?.kind === "indeterminate"
                  ? pt("fr.error.saveIndeterminate")
                  : error?.kind === "draft_failed"
                    ? pt("fr.error.draftFailed")
                    : null
            }
            // A retry button appears only where it is a DIFFERENT action from
            // the primary CTA. An indeterminate completion is retried by
            // pressing "Save to my Passport" again — which replays the same
            // operation id — so adding a second button beside it would be two
            // controls doing one thing. A failed "Save and exit" is a
            // different action, so it gets its own.
            onRetry={error?.kind === "draft_failed" ? () => void onSaveAndExit() : undefined}
          />
        );

      case "done":
        return (
          <MeritSavedScreen
            title={phase.merit.title}
            onGoToPassport={() => void navigate({ to: "/passport" })}
            onAddAnother={onAddAnother}
            onCompleteProfile={() => void navigate({ to: "/passport/information" })}
          />
        );

      case "unconfirmed":
        return (
          <MeritUnconfirmedScreen
            onGoToPassport={() => void navigate({ to: "/passport" })}
            onReconcile={
              phase.canReconcile && draft.operationId ? () => startCompletion(draft) : undefined
            }
            busy={busy}
          />
        );
    }
  }, [
    busy,
    draft,
    error,
    loadOnce,
    navigate,
    onAddAnother,
    onChange,
    onChoose,
    onCreate,
    onSaveAndExit,
    onSubmit,
    phase,
    problems,
    pt,
    startCompletion,
  ]);

  return screen;
}
