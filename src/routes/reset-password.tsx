// H3.4B — secure password-reset landing page, using Supabase Auth's
// built-in recovery flow (supabase.auth.resetPasswordForEmail /
// supabase.auth.updateUser). This closes a real gap: PortalAuthForm
// already sent a reset email, but its redirectTo previously pointed at
// /auth?intent=<portal>, which -- once the recovery link established a
// session -- would immediately bounce the user straight to their portal
// home without ever giving them a chance to set a new password.
// PortalAuthForm's redirectTo now points here instead.
//
// Public route (no `_authenticated` prefix): the user arrives with no
// "normal" prior session. Supabase's client SDK auto-detects the recovery
// token in the URL on load and establishes a short-lived session itself --
// this page only ever decides whether to show the "set a new password"
// form (a session is present) or a safe "link invalid/expired" state (it
// is not). The actual password change goes through
// supabase.auth.updateUser(), Supabase Auth's own API -- no custom
// server-side password-handling code is introduced here.
//
// After a successful reset, redirects through /auth?intent=<intent> (the
// existing compatibility-redirect route, reused rather than duplicated),
// which sends the now-genuinely-signed-in user to the correct portal home.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset your password — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function allowedIntent(raw: string | null): "candidate" | "employer" | "admin" {
  if (raw === "employer" || raw === "admin") return raw;
  return "candidate";
}

function ResetPasswordPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [sessionState, setSessionState] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSessionState(data.session ? "ready" : "invalid");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "PASSWORD_RECOVERY" || session) setSessionState("ready");
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("auth.reset.new.tooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.reset.new.mismatch"));
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      const params = new URLSearchParams(window.location.search);
      const intent = allowedIntent(params.get("intent"));
      window.setTimeout(() => {
        navigate({ to: "/auth", search: { intent } as any, replace: true });
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteLayout>
      <Section>
        <div className="mx-auto max-w-md">
          <h1
            className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("auth.reset.new.title")}
          </h1>

          {sessionState === "checking" && (
            <p className="mt-6 text-sm text-muted-foreground">{t("auth.reset.new.checking")}</p>
          )}

          {sessionState === "invalid" && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-destructive">{t("auth.reset.new.invalidLink")}</p>
              <a href="/auth" className="text-sm font-medium text-accent hover:underline">
                {t("auth.reset.new.backToSignIn")}
              </a>
            </div>
          )}

          {sessionState === "ready" && done && (
            <p className="mt-6 text-sm text-foreground">{t("auth.reset.new.success")}</p>
          )}

          {sessionState === "ready" && !done && (
            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <label className="block text-sm">
                <span className="text-foreground">{t("auth.reset.new.passwordLabel")}</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="block text-sm">
                <span className="text-foreground">{t("auth.reset.new.confirmLabel")}</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <PrimaryButton type="submit" disabled={busy} className="w-full justify-center">
                {busy ? t("auth.reset.new.submitting") : t("auth.reset.new.submit")}
              </PrimaryButton>
            </form>
          )}
        </div>
      </Section>
    </SiteLayout>
  );
}
