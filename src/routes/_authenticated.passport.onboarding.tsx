// Security Passport — live progressive onboarding.
//
// The same reviewed onboarding component the prototype uses, with its
// persistence pointed at the holder's own database row instead of
// sessionStorage. One UX, two homes — see the `OnboardingPersistence`
// note in components/security-passport/Onboarding.tsx.
//
// Autosave is debounced rather than fired on every keystroke: a Passport
// step holds a handful of fields, and a write per character would be a lot
// of round trips to save something the holder is still typing.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  completeOnboarding,
  getMyPassport,
  saveOnboardingProgress,
} from "@/lib/security-passport/passport.functions";
import type { PrototypeState } from "@/lib/security-passport/prototype-state";
import { Onboarding, type OnboardingPersistence } from "@/components/security-passport/Onboarding";

export const Route = createFileRoute("/_authenticated/passport/onboarding")({
  ssr: false,
  component: LiveOnboardingRoute,
});

const AUTOSAVE_DELAY_MS = 600;

function LiveOnboardingRoute() {
  const { pt } = usePassportCopy();
  const navigate = useNavigate();
  const load = useServerFn(getMyPassport);
  const save = useServerFn(saveOnboardingProgress);
  const complete = useServerFn(completeOnboarding);

  const [initial, setInitial] = useState<PrototypeState | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const snapshot = await load({ data: undefined });
        if (!alive) return;
        const profile = snapshot.profile;
        setInitial(
          profile
            ? {
                stateVersion: 1,
                stepIndex: profile.onboardingStep,
                answers: profile.onboardingAnswers,
                skipped: [],
                startedAt: profile.updatedAt,
                savedAt: profile.updatedAt,
              }
            : null,
        );
      } catch (err) {
        console.error("[passport] onboarding load failed", err);
        if (alive) setError(pt("live.error"));
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load, pt]);

  const persistence: OnboardingPersistence = useMemo(
    () => ({
      read: () => initial,
      save: (state) => {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          void save({
            data: {
              step: state.stepIndex,
              answers: state.answers,
              displayName: state.answers["identity.displayName"] ?? undefined,
              headline: state.answers["identity.headline"] ?? undefined,
              professionSlug: state.answers["profession.profession"] ?? undefined,
              jurisdictionCode: state.answers["jurisdiction.jurisdiction"] || undefined,
            },
          }).catch((err: unknown) => {
            // Never destroys the holder's in-progress answers: the component
            // keeps them in state, and a failed autosave is reported rather
            // than silently discarding work.
            console.error("[passport] autosave failed", err);
            setError(pt("live.error"));
          });
        }, AUTOSAVE_DELAY_MS);
      },
    }),
    [initial, save, pt],
  );

  const onFinish = useCallback(async () => {
    try {
      await complete({ data: undefined });
      void navigate({ to: "/passport" });
    } catch (err) {
      console.error("[passport] completion failed", err);
      setError(pt("live.error"));
    }
  }, [complete, navigate, pt]);

  if (!ready) return <p className="text-sm text-muted-foreground">{pt("live.loading")}</p>;

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Onboarding
        persistence={persistence}
        onFinish={() => void onFinish()}
        onAddCredential={() => void navigate({ to: "/passport/credentials/new" })}
      />
    </div>
  );
}
