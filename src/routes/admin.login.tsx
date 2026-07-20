// Phase H3.3 — /admin/login: dedicated platform-admin sign-in entry
// point. Public/unauthenticated route (no "_authenticated." prefix,
// matching the exact convention already established by
// employer.login.tsx / candidate.login.tsx) — a signed-out user must be
// able to reach it.
//
// Deliberately NOT built on PortalAuthForm (the shared candidate/employer
// signin+signup component): admin has no self-service registration at
// all (accounts are provisioned directly, out of band, by an existing
// platform admin or via Supabase), and this flow needs an extra step
// PortalAuthForm doesn't have -- verifying is_platform_admin() *after*
// a successful sign-in and showing a controlled "not an admin" message
// without navigating away, per this phase's explicit requirement that
// using this page must never itself grant admin access.
//
// Security: this page only ever decides where to *look* (post-auth
// destination). The actual authorization decision is
// is_platform_admin(auth.uid()), checked server-side via adminWhoAmI()
// -- exactly the same function _authenticated.admin.tsx already uses to
// gate every nested admin route, so there is exactly one source of truth
// for "is this user an admin," not two.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { safeReturnPath } from "@/lib/auth/safe-redirect";
import { adminWhoAmI } from "@/lib/job-intelligence/admin.functions";

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Administrator sign in — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLoginPage,
});

function resolveDestination(): string {
  if (typeof window === "undefined") return "/admin";
  const params = new URLSearchParams(window.location.search);
  return safeReturnPath(params.get("redirect"), "/admin");
}

function AdminLoginPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const whoAmIFn = useServerFn(adminWhoAmI);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetInfo, setResetInfo] = useState<string | null>(null);
  const [signedInNonAdminEmail, setSignedInNonAdminEmail] = useState<string | null>(null);

  // Verify admin status for whatever session already exists on mount --
  // this is also what completes the flow after a redirect-based Google
  // OAuth round trip lands back on this page.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive || !data.session) return;
      try {
        const who = await whoAmIFn();
        if (!alive) return;
        if (who.isAdmin) {
          navigate({ to: resolveDestination(), replace: true });
        } else {
          setSignedInNonAdminEmail(data.session.user.email ?? null);
        }
      } catch {
        // Session exists but the admin check itself failed (e.g. expired
        // token mid-flight) -- stay on the login page and let the user
        // retry rather than guessing at access.
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verifyAdminAndProceed() {
    const who = await whoAmIFn();
    if (who.isAdmin) {
      navigate({ to: resolveDestination(), replace: true });
    } else {
      const { data } = await supabase.auth.getSession();
      setSignedInNonAdminEmail(data.session?.user?.email ?? null);
      setError(t("admin.auth.login.notAdmin"));
    }
  }

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      await verifyAdminAndProceed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/admin/login",
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      await verifyAdminAndProceed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSignOutAndRetry() {
    await supabase.auth.signOut();
    setSignedInNonAdminEmail(null);
    setError(null);
  }

  async function onForgotPassword() {
    setError(null);
    setResetInfo(null);
    if (!email.trim()) {
      setError(t("auth.reset.need_email"));
      return;
    }
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password?intent=admin",
      });
      if (err) throw err;
      setResetInfo(t("auth.reset.sent"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
            {t("admin.auth.login.title")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.auth.login.intro")}</p>

          {signedInNonAdminEmail ? (
            <div className="mt-8 space-y-4">
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {t("admin.auth.login.notAdmin")}
              </div>
              <p className="text-xs text-muted-foreground">{signedInNonAdminEmail}</p>
              <button
                type="button"
                onClick={onSignOutAndRetry}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                {t("admin.auth.login.signOutAndTryAgain")}
              </button>
              <a
                href="/"
                className="block text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {t("admin.auth.login.backToSite")}
              </a>
            </div>
          ) : (
            <div className="mt-8 space-y-4">
              <button
                type="button"
                onClick={onGoogle}
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                {t("auth.google")}
              </button>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                <span>{t("auth.or")}</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={onEmailSubmit} className="space-y-3">
                <label className="block text-sm">
                  <span className="text-foreground">{t("auth.email")}</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-foreground">{t("auth.password")}</span>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>

                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  {t("auth.reset.link")}
                </button>

                {resetInfo && <p className="text-sm text-foreground">{resetInfo}</p>}
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}

                <PrimaryButton type="submit" disabled={busy} className="w-full justify-center">
                  {busy ? t("admin.auth.login.signingIn") : t("admin.auth.login.submit")}
                </PrimaryButton>
              </form>

              <a
                href="/"
                className="block text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {t("admin.auth.login.backToSite")}
              </a>
            </div>
          )}
        </div>
      </Section>
    </SiteLayout>
  );
}
