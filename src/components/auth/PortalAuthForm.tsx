import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { safeReturnPath } from "@/lib/auth/safe-redirect";

// Phase H3.1 — shared auth form used by /candidate/login, /candidate/register,
// /employer/login, /employer/register. Portal intent controls ONLY which
// copy renders and where the caller navigates after success — it is never
// read by any server function, RLS policy, or trigger as a permission
// (docs/architecture/adr-candidate-employer-portal-separation.md, decision 7).
// This is the "shared internal component, distinct routing/copy" pattern
// the spec calls for (§ "Do not duplicate large authentication components
// unnecessarily") — one component, four thin route files supplying portal-
// specific copy and post-auth destinations.

export type Portal = "candidate" | "employer";
export type AuthMode = "signin" | "signup";

export interface PortalAuthFormProps {
  portal: Portal;
  mode: AuthMode;
  headingKey: TranslationKey;
  introKey: TranslationKey;
  /** Destination once a session already exists (mount check) or right after a successful signin/Google auth. Never called for email/password signup, which shows a check-your-email state instead. */
  defaultDestination: string;
  /** Route to swap to for the opposite mode (signin<->signup) within the same portal. */
  swapModeTo: string;
  /** Route to the OTHER portal's equivalent auth page (e.g. candidate login -> employer login). */
  otherPortalHref: string;
  otherPortalLabelKey: TranslationKey;
}

export function PortalAuthForm(props: PortalAuthFormProps) {
  const {
    portal,
    mode,
    headingKey,
    introKey,
    defaultDestination,
    swapModeTo,
    otherPortalHref,
    otherPortalLabelKey,
  } = props;
  const { t, lang } = useT();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function resolveDestination(): string {
    if (typeof window === "undefined") return defaultDestination;
    const params = new URLSearchParams(window.location.search);
    return safeReturnPath(params.get("redirect"), defaultDestination);
  }

  // If already signed in, bounce immediately — never render a login form to
  // an authenticated user.
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) navigate({ to: resolveDestination() });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const submitLabel =
    mode === "signin"
      ? t(portal === "candidate" ? "candidate.auth.signin.submit" : "employer.auth.signin.submit")
      : t(portal === "candidate" ? "candidate.auth.signup.submit" : "employer.auth.signup.submit");

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
            emailRedirectTo: window.location.origin + "/auth?intent=" + portal,
            data: { display_name: displayName || undefined, locale: lang, portal_intent: portal },
          },
        });
        if (err) throw err;
        setInfo(t("auth.signup.check_email"));
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate({ to: resolveDestination() });
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
      navigate({ to: resolveDestination() });
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
        redirectTo: window.location.origin + "/auth?intent=" + portal,
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
            {t(headingKey)}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{t(introKey)}</p>

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
                {submitLabel}
              </PrimaryButton>
            </form>

            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <Link
                  to={swapModeTo}
                  className="text-muted-foreground underline-offset-2 hover:underline"
                >
                  {t(
                    mode === "signin"
                      ? portal === "candidate"
                        ? "candidate.auth.swap.to_signup"
                        : "employer.auth.swap.to_signup"
                      : portal === "candidate"
                        ? "candidate.auth.swap.to_signin"
                        : "employer.auth.swap.to_signin",
                  )}
                </Link>
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
              <Link
                to={otherPortalHref}
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                {t(otherPortalLabelKey)}
              </Link>
            </div>

            <p className="pt-4 text-xs text-muted-foreground">{t("auth.privacy_note")}</p>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}
