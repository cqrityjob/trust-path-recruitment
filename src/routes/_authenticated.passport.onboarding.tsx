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
// The one exception is deliberate and narrow: once a merit has been saved in
// THIS visit, the confirmation screen is held (`finished`). Re-deriving would
// see the new merit and send the person straight to the overview, skipping
// the only screen that tells them what was recorded.
//
// ── HOW A SAVE IS MADE HONEST ──────────────────────────────────────────
//
//   * the operation id is minted BEFORE the first attempt and autosaved, so a
//     retry, a refresh and a second tab all carry the same key;
//   * the completion is single-flight: the in-flight promise is reused, so a
//     double-click is one request;
//   * the pending debounced draft save is flushed and AWAITED first, and the
//     completion sends the current field values as arguments rather than
//     reading them back out of the draft — so a save that lands mid-autosave
//     uses what is on screen;
//   * "saved" is shown only after the exact returned subject id has been read
//     back over a fresh request and checked field by field;
//   * a readback that does not answer is neither success nor failure, and has
//     its own screen.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { ensureMyPassport, getMyPassport } from "@/lib/security-passport/passport.functions";
import {
  completeFirstMerit,
  readBackFirstMerit,
  saveFirstRunDraft,
} from "@/lib/security-passport/first-run.functions";
import {
  EMPTY_DRAFT,
  FIRST_RUN_SCREENS,
  confirmReadback,
  deriveFirstRunState,
  validateDraft,
  writeDraft,
  type FirstMeritDraft,
  type FirstMeritKind,
  type FirstMeritProblemId,
  type PersistedMerit,
  type ReadbackOutcome,
} from "@/lib/security-passport/first-run";
import {
  ChooseMeritScreen,
  CreatePassportScreen,
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
  | { kind: "create" }
  | { kind: "choose" }
  | { kind: "details" }
  | { kind: "done"; merit: PersistedMerit }
  | { kind: "unconfirmed" };

function FirstRunRoute() {
  const { pt } = usePassportCopy();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const load = useServerFn(getMyPassport);
  const create = useServerFn(ensureMyPassport);
  const saveDraft = useServerFn(saveFirstRunDraft);
  const complete = useServerFn(completeFirstMerit);
  const readBack = useServerFn(readBackFirstMerit);

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [draft, setDraft] = useState<FirstMeritDraft>(EMPTY_DRAFT);
  const [problems, setProblems] = useState<Readonly<Partial<Record<FirstMeritProblemId, string>>>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The answers already on the profile, so a draft save adds to them rather
   *  than replacing whatever else lives in that column. */
  const storedAnswers = useRef<Record<string, string>>({});
  const timer = useRef<number | null>(null);
  /** The write the debounce is going to make, and the promise it becomes.
   *  `flushDraft` awaits this, which is what stops a completion from racing
   *  the autosave that carries the same values. */
  const pending = useRef<FirstMeritDraft | null>(null);
  const inFlightDraft = useRef<Promise<unknown> | null>(null);
  /** Single-flight for the completion. A second click awaits the first
   *  request rather than starting another one. */
  const inFlightComplete = useRef<Promise<void> | null>(null);
  /** Set the moment a merit is confirmed in THIS visit, so re-deriving from a
   *  refreshed snapshot cannot skip the confirmation screen. */
  const finished = useRef(false);

  /* ---- read the state, once, from what is stored -------------------- */

  const refresh = useCallback(async () => {
    // A merit was confirmed in this visit. Re-deriving now would see it and
    // send the person to the overview, skipping the one screen that tells
    // them what was recorded and what it does and does not mean.
    if (finished.current) return;
    const snapshot = await load({ data: undefined });
    const profile = snapshot.profile;
    storedAnswers.current = { ...(profile?.onboardingAnswers ?? {}) };

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
      // Requirement 21: somebody who already holds a current merit has no
      // first run left. `replace` so Back does not bounce them in again.
      void navigate({ to: "/passport", replace: true });
      return;
    }
    setDraft(state.draft);
    setPhase({ kind: state.screen });
  }, [load, navigate]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await refresh();
      } catch (err) {
        console.error("[passport] first-run load failed", err);
        if (alive) {
          setError(pt("live.readError"));
          setPhase({ kind: "create" });
        }
      }
    })();
    return () => {
      alive = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
    // `refresh` is stable; re-running on every render would refetch forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- the draft: debounced, flushable, awaited --------------------- */

  const writeNow = useCallback(
    async (next: FirstMeritDraft) => {
      const answers = writeDraft(storedAnswers.current, next);
      storedAnswers.current = answers;
      const step = FIRST_RUN_SCREENS.indexOf("details");
      const promise = saveDraft({ data: { step, answers } });
      inFlightDraft.current = promise;
      try {
        await promise;
      } finally {
        if (inFlightDraft.current === promise) inFlightDraft.current = null;
      }
    },
    [saveDraft],
  );

  const scheduleDraft = useCallback(
    (next: FirstMeritDraft) => {
      pending.current = next;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        const value = pending.current;
        pending.current = null;
        if (!value) return;
        // A failed autosave is logged, never destructive: the answers stay in
        // component state and the completion sends them directly, so losing a
        // draft write costs a resume and nothing else.
        void writeNow(value).catch((err: unknown) => {
          console.error("[passport] first-run draft save failed", err);
        });
      }, AUTOSAVE_DELAY_MS);
    },
    [writeNow],
  );

  /**
   * Requirement 11, made explicit.
   *
   * Cancels the debounce, performs the write it was going to perform, and
   * waits for whatever write is already in the air. The completion still
   * sends the current values as arguments — so this is not what makes the
   * save correct — but leaving a stale draft behind after a completion would
   * mean a later resume showed older answers than the merit that exists.
   */
  const flushDraft = useCallback(async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const value = pending.current;
    pending.current = null;
    if (value) {
      try {
        await writeNow(value);
      } catch (err) {
        console.error("[passport] first-run draft flush failed", err);
      }
    }
    if (inFlightDraft.current) {
      try {
        await inFlightDraft.current;
      } catch {
        /* already logged by the writer */
      }
    }
  }, [writeNow]);

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

  /* ---- screen 1: create the Passport -------------------------------- */

  const onCreate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Idempotent on the server (INSERT … ON CONFLICT DO NOTHING), so the
      // double-click this guard also stops would have been harmless anyway —
      // which is the order the two belong in.
      await create({ data: undefined });
      await invalidatePassportAndCareer(qc);
      await refresh();
    } catch (err) {
      console.error("[passport] passport creation failed", err);
      setError(pt("fr.error.saveFailed"));
    } finally {
      setBusy(false);
    }
  }, [busy, create, qc, refresh, pt]);

  /* ---- screen 2: choose a kind -------------------------------------- */

  const onChoose = useCallback(
    (kind: FirstMeritKind) => {
      // The operation id is minted HERE — before the first completion attempt
      // — and autosaved with the rest of the draft. That is what makes a
      // retry after a lost response return the merit that already exists
      // rather than making a second one.
      const next: FirstMeritDraft = {
        ...EMPTY_DRAFT,
        ...draft,
        kind,
        operationId: draft.operationId ?? newOperationId(),
      };
      setDraft(next);
      setProblems({});
      setPhase({ kind: "details" });
      scheduleDraft(next);
    },
    [draft, scheduleDraft],
  );

  /* ---- screen 3: save ----------------------------------------------- */

  const runCompletion = useCallback(
    async (current: FirstMeritDraft) => {
      // Everything the autosave was about to write, written and awaited,
      // before anything is completed.
      await flushDraft();

      const result = await complete({
        data: {
          operationId: current.operationId ?? newOperationId(),
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

      // ── THE READBACK ───────────────────────────────────────────────
      //
      // A separate request, for the exact id the completion returned, checked
      // field by field. Until it answers, nothing on screen says "saved".
      let persisted: PersistedMerit | null = null;
      let outcome: ReadbackOutcome;
      try {
        persisted = await readBack({
          data: { subjectKind: result.subjectKind, subjectId: result.subjectId },
        });
        outcome = confirmReadback(
          { id: result.subjectId, kind: result.subjectKind, draft: current },
          persisted,
        );
      } catch (err) {
        // The write may well have landed. "It failed" would be a guess, and
        // so would "it worked".
        console.error("[passport] first-merit readback failed", err);
        outcome = "unknown";
      }

      // Whatever the readback said, the write itself succeeded — so every
      // surface that counts merits has to be told, or My Career keeps
      // recommending the thing that has just been done.
      finished.current = true;
      await invalidatePassportAndCareer(qc);

      if (outcome === "confirmed" && persisted) {
        setPhase({ kind: "done", merit: persisted });
        return;
      }
      setPhase({ kind: "unconfirmed" });
    },
    [complete, flushDraft, qc, readBack],
  );

  const onSubmit = useCallback(() => {
    const validation = validateDraft(draft, todayIso());
    if (!validation.ok) {
      setProblems(validation.problems);
      return;
    }
    // ── SINGLE FLIGHT ────────────────────────────────────────────────
    //
    // The second click awaits the first request. Combined with the operation
    // id, a person who double-taps Save on a slow connection gets one merit
    // and one answer — and would get one merit even if both requests reached
    // the database, because the database refuses the second write.
    if (inFlightComplete.current) return;
    setBusy(true);
    setError(null);
    const run = runCompletion(draft)
      .catch((err: unknown) => {
        console.error("[passport] first-merit completion failed", err);
        setError(pt("fr.error.saveFailed"));
      })
      .finally(() => {
        inFlightComplete.current = null;
        setBusy(false);
      });
    inFlightComplete.current = run;
  }, [draft, pt, runCompletion]);

  /** "Save and exit": a draft, and nothing else.
   *
   *  No declaration, no merit, onboarding left `in_progress`. This used to be
   *  the same call as Finish, which meant leaving the flow recorded a
   *  truthfulness declaration on an empty Passport. */
  const onSaveAndExit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await flushDraft();
      await writeNow(draft);
    } catch (err) {
      console.error("[passport] save and exit failed", err);
    } finally {
      setBusy(false);
      void navigate({ to: "/my-career" });
    }
  }, [busy, draft, flushDraft, navigate, writeNow]);

  /* ---- screen 4 -------------------------------------------------- */

  const onAddAnother = useCallback(() => {
    // A NEW operation. Reusing the finished one would replay it and return
    // the merit that already exists, which reads as "nothing happened".
    finished.current = false;
    setDraft({ ...EMPTY_DRAFT, operationId: newOperationId() });
    setProblems({});
    setPhase({ kind: "choose" });
  }, []);

  const screen = useMemo(() => {
    switch (phase.kind) {
      case "loading":
        return <FirstRunLoading />;

      case "create":
        return <CreatePassportScreen onCreate={() => void onCreate()} busy={busy} error={error} />;

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
              setPhase({ kind: "choose" });
            }}
            busy={busy}
            error={error}
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
        return <MeritUnconfirmedScreen onGoToPassport={() => void navigate({ to: "/passport" })} />;
    }
  }, [
    busy,
    draft,
    error,
    navigate,
    onAddAnother,
    onChange,
    onChoose,
    onCreate,
    onSaveAndExit,
    onSubmit,
    phase,
    problems,
  ]);

  return screen;
}
