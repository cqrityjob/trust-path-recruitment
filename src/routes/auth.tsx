import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — CQrityjob" },
      {
        name: "description",
        content: "Sign in or create an account to save your Security Career Assessment results.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Sign in — CQrityjob" },
      {
        property: "og:description",
        content: "Sign in to CQrityjob to save your Security Career Assessment results.",
      },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/auth" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/auth" }],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // If already signed in, bounce to home.
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) navigate({ to: "/my-career" });
    });
    return () => {
      alive = false;
    };
  }, [navigate]);

  const copy = {
    title: mode === "signin" ? t("auth.signin.title") : t("auth.signup.title"),
    submit: mode === "signin" ? t("auth.signin.submit") : t("auth.signup.submit"),
    swap: mode === "signin" ? t("auth.swap.to_signup") : t("auth.swap.to_signin"),
  };

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/auth",
            data: { display_name: displayName || undefined, locale: lang },
          },
        });
        if (err) throw err;
        setInfo(t("auth.signup.check_email"));
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate({ to: "/my-career" });
      }
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
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/my-career" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    setError(null);
    setInfo(null);
    if (!email) {
      setError(t("auth.reset.need_email"));
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/auth",
      });
      if (err) throw err;
      setInfo(t("auth.reset.sent"));
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
            {copy.title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("auth.intro")}</p>

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
              {mode === "signup" && (
                <label className="block text-sm">
                  <span className="text-foreground">{t("auth.name")}</span>
                  <input
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>
              )}
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
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {info && (
                <p role="status" className="text-sm text-muted-foreground">
                  {info}
                </p>
              )}

              <PrimaryButton type="submit" disabled={busy} className="w-full justify-center">
                {copy.submit}
              </PrimaryButton>
            </form>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                className="text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setInfo(null);
                }}
              >
                {copy.swap}
              </button>
              {mode === "signin" && (
                <button
                  type="button"
                  className="text-muted-foreground underline-offset-2 hover:underline"
                  onClick={onReset}
                >
                  {t("auth.reset.link")}
                </button>
              )}
            </div>

            <p className="pt-4 text-xs text-muted-foreground">{t("auth.privacy_note")}</p>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}