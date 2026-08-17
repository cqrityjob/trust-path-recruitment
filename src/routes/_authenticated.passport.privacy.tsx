// Security Passport — privacy and stored information, live.
//
// Phase 2 privacy is narrow on purpose: the Passport is private, full stop.
// There is no visibility setting to get wrong because there is nothing to
// be visible to. What the holder can do here is see what is stored, choose
// how their name would appear if they ever share, and read what happens
// next.
//
// Export and deletion are described, not wired: both depend on the
// retention design in Product Architecture v1.1 §21.5, which needs legal
// validation before Phase 3 records anyone else's attestation. Saying so is
// better than a button that half-works.

import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  getMyPassport,
  setPrivacyMode,
  type PassportSnapshot,
} from "@/lib/security-passport/passport.functions";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import { PrivacyControls } from "@/components/security-passport/PrivacyControls";

export const Route = createFileRoute("/_authenticated/passport/privacy")({
  ssr: false,
  component: PassportPrivacyRoute,
});

const MODES = ["full_name", "initials", "anonymous"] as const;

function PassportPrivacyRoute() {
  const { pt } = usePassportCopy();
  const load = useServerFn(getMyPassport);
  const setMode = useServerFn(setPrivacyMode);

  const [snapshot, setSnapshot] = useState<PassportSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await load({ data: undefined }));
    } catch (err) {
      console.error("[passport] privacy load failed", err);
      setError(pt("live.error"));
    }
  }, [load, pt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function choose(mode: (typeof MODES)[number]) {
    setBusy(true);
    try {
      await setMode({ data: { privacyMode: mode } });
      await refresh();
    } catch (err) {
      console.error("[passport] privacy change failed", err);
      setError(pt("live.error"));
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot) return <p className="text-sm text-muted-foreground">{pt("live.loading")}</p>;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-5">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
          <Lock aria-hidden="true" className="h-3 w-3" />
          {pt("overview.privateNote")}
        </span>

        <h3 className="mt-3 text-base font-semibold tracking-tight text-foreground">
          {pt("share.privacyMode")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{pt("live.noVerificationBody")}</p>

        <fieldset className="mt-4" disabled={busy || !snapshot.profile}>
          <legend className="sr-only">{pt("share.privacyMode")}</legend>
          <div className="space-y-2">
            {MODES.map((mode) => (
              <label
                key={mode}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm text-foreground hover:bg-accent/5"
              >
                <input
                  type="radio"
                  name="sp-privacy-mode"
                  value={mode}
                  checked={snapshot.profile?.privacyMode === mode}
                  onChange={() => void choose(mode)}
                  className="h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                {pt(`share.privacy.${mode}` as PassportCopyKey)}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {/* Stored-information review: the holder can see exactly how much of
          their Passport exists, including the history count, without having
          to trust a summary. */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {pt("overview.sectionClaims")}
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              [pt("overview.sectionExperience"), snapshot.holder.periods.length],
              [pt("overview.sectionClaims"), snapshot.holder.claims.length],
              [pt("claims.history"), snapshot.eventCount],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <PrivacyControls />
    </div>
  );
}
