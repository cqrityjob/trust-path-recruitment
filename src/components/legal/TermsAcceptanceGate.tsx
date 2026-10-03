import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useTolerantT } from "@/i18n/context";
import { TERMS_PATH } from "@/lib/legal/documents";
import {
  acceptanceMetadata,
  consumeRememberedAcceptance,
  needsTermsAcceptance,
} from "@/lib/legal/terms-acceptance";

// ── NOBODY USES THE PRODUCT WITHOUT HAVING ACCEPTED THE TERMS ───────────
//
// Mounted once, in the root layout, so it holds on every page a session can
// land on — a Google sign-in returns to whatever page it started from, public
// or not. See src/lib/legal/terms-acceptance.ts for who is asked.
//
// While it is open nothing behind it can be used: a modal that cannot be
// dismissed, with two ways out, accept or sign out. The box is unticked and
// about the terms only, exactly as at signup.

type Phase = "checking" | "clear" | "ask";

export function TermsAcceptanceGate() {
  const { t } = useTolerantT();
  const ids = useId();
  const [phase, setPhase] = useState<Phase>("checking");
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const decide = async (user: Parameters<typeof needsTermsAcceptance>[0]) => {
      if (!alive) return;
      if (!needsTermsAcceptance(user)) {
        setPhase("clear");
        return;
      }
      // Google from the signup page with the box ticked: write what was
      // accepted before the round trip, and ask nothing.
      const remembered = consumeRememberedAcceptance();
      if (remembered) {
        const { error } = await supabase.auth.updateUser({ data: acceptanceMetadata(remembered) });
        if (!alive) return;
        if (!error) {
          setPhase("clear");
          return;
        }
      }
      setPhase("ask");
    };
    void supabase.auth.getSession().then(({ data }) => decide(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void decide(session?.user ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (phase !== "ask") return null;

  async function accept() {
    if (!ticked) return;
    setBusy(true);
    setFailed(false);
    const { error } = await supabase.auth.updateUser({ data: acceptanceMetadata() });
    setBusy(false);
    if (error) {
      console.error("[terms] recording acceptance failed", error);
      setFailed(true);
      return;
    }
    setPhase("clear");
  }

  async function signOut() {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
    setPhase("clear");
  }

  const sentence = t("terms.gate.accept");
  const at = sentence.indexOf("{terms}");

  return (
    <div
      data-testid="terms-acceptance-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${ids}-title`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
        <h2
          id={`${ids}-title`}
          className="text-lg font-semibold text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("terms.gate.title")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("terms.gate.body")}</p>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
          <input
            type="checkbox"
            data-testid="terms-gate-box"
            checked={ticked}
            disabled={busy}
            onChange={(e) => setTicked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-[color:var(--accent)]"
          />
          <span>
            {at === -1 ? (
              sentence
            ) : (
              <>
                {sentence.slice(0, at)}
                <a
                  href={TERMS_PATH}
                  target="_blank"
                  rel="noopener"
                  className="font-medium text-accent underline underline-offset-4"
                >
                  {t("auth.terms.link")}
                </a>
                {sentence.slice(at + "{terms}".length)}
              </>
            )}
          </span>
        </label>
        {failed && (
          <p role="alert" className="mt-3 text-sm font-medium text-destructive">
            {t("terms.gate.failed")}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline disabled:opacity-60"
          >
            {t("terms.gate.signOut")}
          </button>
          <PrimaryButton
            type="button"
            data-testid="terms-gate-continue"
            onClick={accept}
            disabled={!ticked || busy}
            className="justify-center gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("terms.gate.continue")}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
