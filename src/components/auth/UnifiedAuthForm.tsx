// The single front door.
//
// ── WHY THERE IS ONE OF THESE AND NOT FOUR ─────────────────────────────
//
// Until now CQrityjob had four public auth routes named after audiences.
// A person who is both a recruiter and a Passport holder — which is the
// ordinary case, not an edge case — had to answer "which of these is my
// account?" before the product had told them that both are. Both were.
// Neither said so.
//
// `docs/architecture/adr-unified-account-and-professional-identity.md`
// supersedes that decision and explains why it is safe to: portal intent
// was never a role (the original ADR's own decision 7), so collapsing the
// doors removes a routing hint and touches no authorisation surface. The
// four old routes remain as compatibility redirects, indefinitely.
//
// ── WHAT "PREMIUM" MEANS HERE, CONCRETELY ──────────────────────────────
//
// Not decoration. The things that actually make a B2B sign-in feel built:
//
//   * a password manager can fill it — real <label for>, real autocomplete
//     tokens, a stable form, and no field that appears after focus
//   * one visible error region, announced, focusable, listing what to fix,
//     rather than a raw provider message dropped under a button
//   * the submit control says what it is doing and cannot be pressed twice
//   * nothing flashes: an already-signed-in visitor never sees the form,
//     and the page renders a quiet placeholder until the session is known
//   * it works at 375px without a horizontal scrollbar
//
// ── THE ORGANISATION SECTION ───────────────────────────────────────────
//
// Registration is minimal by default. The one exception is a disclosed,
// collapsed section for somebody registering on behalf of an organisation,
// which preserves a real fix: an employer registration that never names a
// company used to produce nothing an administrator could review. The
// values go into user metadata (there is no session yet, so nothing can be
// written under this person's identity) and the organisation is created
// from them on their first authenticated visit to /employer, by the
// existing `ensureMyEmployerCompanyFromSignup`.
//
// Choosing it grants nothing. It selects a post-signup destination and
// carries two strings; every permission is still derived from
// `employer_memberships` server-side.

import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Building2, Loader2, ShieldCheck } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Container } from "@/components/site/Container";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { supabase } from "@/integrations/supabase/client";
import { safeReturnPath, splitReturnPath } from "@/lib/auth/safe-redirect";
import { CANONICAL_ASSESSMENT_PATH } from "@/lib/career-discovery/routes";
import {
  clearOAuthReturn,
  consumeOAuthReturn,
  oauthErrorMessage,
  oauthRedirectUri,
  rememberOAuthReturn,
} from "@/lib/auth/oauth-return";

export type UnifiedAuthMode = "signin" | "signup";

/** Where a person lands when nothing else was requested. The personal home
 *  is right for everyone: a recruiter reaches their workspace from the
 *  account switcher, and somebody who is only a recruiter is one click from
 *  it — whereas sending a candidate to /employer would be a dead end. */
const DEFAULT_DESTINATION = "/my-career";

/** Where a person lands when they registered on behalf of an organisation.
 *  /employer already contains the 0/1/2+ workspace branching and the
 *  provisioning shortcut; this route deliberately duplicates neither. */
const ORGANISATION_DESTINATION = "/employer";

const MIN_PASSWORD_LENGTH = 8;

export function UnifiedAuthForm({ mode }: { mode: UnifiedAuthMode }) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const ids = useId();

  const [sessionKnown, setSessionKnown] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [forOrganisation, setForOrganisation] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyCountry, setCompanyCountry] = useState("");

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  const isSignup = mode === "signup";

  function resolveDestination(): string {
    if (typeof window === "undefined") return DEFAULT_DESTINATION;
    const params = new URLSearchParams(window.location.search);
    const fallback = isSignup && forOrganisation ? ORGANISATION_DESTINATION : DEFAULT_DESTINATION;
    return safeReturnPath(params.get("redirect"), fallback);
  }

  /** Somebody following an organisation invitation. Read from the ALREADY
   *  VALIDATED return path, never from a parameter a sender could set on its
   *  own, and it changes one sentence of copy and nothing else. No
   *  organisation name is echoed: a non-member cannot read the row, and
   *  printing a name out of a URL would be printing the sender's choice. */
  const fromOrganisationInvite =
    typeof window !== "undefined" && resolveDestination().startsWith("/employer/join");

  /** Somebody who finished Career Discovery signed out and is here for one
   *  reason: to keep the result.
   *
   *  Read from the ALREADY VALIDATED return path, same as the invitation
   *  above, and it changes one sentence of copy and nothing else. Without it
   *  the most motivated arrival in the product — a person who has answered
   *  twenty-eight questions and is one form away from keeping the answer —
   *  is greeted by a generic account-creation screen that says nothing about
   *  the result, which is the moment they decide it was not worth it. The
   *  token is never echoed; only the fact that one is present. */
  const fromDiscoveryClaim = (() => {
    if (typeof window === "undefined") return false;
    const destination = resolveDestination();
    if (!destination.startsWith(CANONICAL_ASSESSMENT_PATH)) return false;
    const q = destination.indexOf("?");
    return q !== -1 && new URLSearchParams(destination.slice(q + 1)).has("claim");
  })();

  /** Carry the return path across the sign-in / create-account swap. Losing
   *  it here is how somebody who clicked "I already have an account" ends up
   *  on a dashboard instead of the report they were claiming. */
  const swapSearch: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const validated = safeReturnPath(
      new URLSearchParams(window.location.search).get("redirect"),
      "",
    );
    // An empty object rather than `{ redirect: "" }`, so an ordinary visit
    // keeps a clean URL.
    if (validated) swapSearch.redirect = validated;
  }

  function goToDestination() {
    const { to, search } = splitReturnPath(resolveDestination());
    navigate({ to, search: search as never });
  }

  // An authenticated visitor must never see a login form. `sessionKnown`
  // gates the render so the form does not paint and then vanish.
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (!data.session) {
        setSessionKnown(true);
        return;
      }
      // Returning from OAuth onto the auth page means the path in `redirectTo`
      // was not honoured — with Supabase Auth that happens when the URL is not
      // in the project's redirect allowlist and it falls back to the Site URL.
      // The stashed destination is the fallback.
      const pending = consumeOAuthReturn();
      if (pending) {
        const { to, search } = splitReturnPath(pending);
        navigate({ to, search: search as never });
        return;
      }
      goToDestination();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  /** Client-side validation exists to spare a round trip and to point at the
   *  field, never as a security control — the server decides. */
  function validate(): string[] {
    const found: string[] = [];
    if (!email.trim()) found.push(t("auth.error.emailRequired"));
    else if (!email.includes("@")) found.push(t("auth.error.emailInvalid"));
    if (password.length < MIN_PASSWORD_LENGTH) found.push(t("auth.error.passwordShort"));
    if (isSignup && forOrganisation) {
      if (!companyName.trim()) found.push(t("auth.error.companyNameRequired"));
      if (!companyCountry.trim()) found.push(t("auth.error.companyCountryRequired"));
    }
    return found;
  }

  function reportErrors(found: readonly string[]) {
    setErrors(found);
    // Move focus to the summary so a screen reader announces it and a
    // keyboard user is standing next to what they have to fix.
    if (found.length > 0) requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInfo(null);
    const found = validate();
    if (found.length > 0) {
      reportErrors(found);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      if (isSignup) {
        // The confirmation link has to come back to where they were going.
        // This matters most for the anonymous Career Discovery journey: the
        // return path carries the claim token for a finished result, so
        // dropping it means the account is created and the report it was
        // created to save is never claimed.
        const returnTo = resolveDestination();
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login?redirect=${encodeURIComponent(returnTo)}`,
            data: {
              display_name: displayName.trim() || undefined,
              locale: lang,
              ...(forOrganisation
                ? {
                    company_name: companyName.trim(),
                    company_country: companyCountry.trim(),
                  }
                : {}),
            },
          },
        });
        if (error) throw error;
        setInfo(
          t(forOrganisation ? "auth.signup.check_email_employer" : "auth.signup.check_email"),
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        goToDestination();
      }
    } catch (err) {
      reportErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setErrors([]);
    setInfo(null);
    setBusy(true);
    // The browser is about to leave the app, so the destination has to
    // survive outside React state. Stored AND carried in redirectTo: a
    // return that normalises the path away is exactly the failure that was
    // observed, so relying on redirectTo alone would trust the thing that
    // broke.
    const destination = rememberOAuthReturn(resolveDestination(), DEFAULT_DESTINATION);
    try {
      // Google goes through this project's OWN Supabase Auth, not the Lovable
      // Cloud OAuth broker. The broker resolved its provider configuration
      // from the Lovable Cloud backend, which was disconnected in the
      // 2026-08-29 cutover to the owner-controlled project; it answered every
      // request with "provider 'google' is not supported" before Google ever
      // opened. Using the shared client keeps Google on the same project, and
      // the same unified identity, as email/password.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: oauthRedirectUri(destination) },
      });
      if (error) throw error;
      // Leaving for the provider. Do NOT clear busy — the page is unloading,
      // and dropping it makes the button look clickable mid-redirect. The
      // round trip is completed by the mount effect above, which reads the
      // restored session and consumes the stashed destination.
      return;
    } catch (err) {
      // Raw provider and Supabase errors are never shown: they leak
      // infrastructure detail and read as a crash. The real error still goes
      // to the console, which is where a developer will look.
      console.error("[auth] Google sign-in failed", err);
      clearOAuthReturn();
      reportErrors([oauthErrorMessage(lang === "sv" ? "sv" : "en")]);
      setBusy(false);
    }
  }

  async function onReset() {
    setErrors([]);
    setInfo(null);
    if (!email.trim()) {
      reportErrors([t("auth.reset.need_email")]);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setInfo(t("auth.reset.sent"));
    } catch (err) {
      reportErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1.5 block w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60";
  const label = "block text-sm font-medium text-foreground";

  return (
    <SiteLayout>
      <div className="border-b border-border bg-secondary/40">
        <Container className="py-10 md:py-16 lg:py-20">
          <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_minmax(0,26rem)] lg:gap-16">
            {/* ── The proposition ─────────────────────────────────────
                Present on every viewport, condensed rather than hidden on
                mobile: somebody arriving from an email link has no other
                way to tell what this account is for. */}
            <div className="lg:pt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                {t("brand.name")}
              </p>
              <h1
                className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl lg:text-[2.75rem] lg:leading-[1.1]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {t("auth.unified.proposition")}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
                {t("auth.unified.lede")}
              </p>

              <ul className="mt-8 hidden space-y-3 lg:block">
                {(
                  [
                    "auth.unified.benefit.identity",
                    "auth.unified.benefit.passport",
                    "auth.unified.benefit.jobs",
                    "auth.unified.benefit.context",
                  ] as const
                ).map((key) => (
                  <li key={key} className="flex items-start gap-3 text-sm text-foreground">
                    <ShieldCheck
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-8 hidden text-sm italic text-muted-foreground lg:block">
                {t("brand.slogan")}
              </p>
            </div>

            {/* ── The form ────────────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
              <h2
                className="text-xl font-semibold tracking-tight text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {t(isSignup ? "auth.signup.title" : "auth.signin.title")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(isSignup ? "auth.unified.signup.intro" : "auth.unified.signin.intro")}
              </p>

              {fromOrganisationInvite && (
                <p className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm text-foreground">
                  {t("auth.invite.organisationContext")}
                </p>
              )}

              {fromDiscoveryClaim && (
                <p
                  data-testid="auth-claim-waiting"
                  className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm text-foreground"
                >
                  {t("auth.discoveryClaim.waiting")}
                </p>
              )}

              {!sessionKnown ? (
                // Never paint a form we may be about to navigate away from.
                <p className="mt-8 text-sm text-muted-foreground">{t("auth.redirecting")}</p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onGoogle}
                    disabled={busy}
                    className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t("auth.google")}
                  </button>

                  <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="h-px flex-1 bg-border" />
                    <span>{t("auth.or")}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  {/* One error region, announced once, listing everything to
                      fix. Focusable so submitting an invalid form puts a
                      keyboard user next to the problem. */}
                  {errors.length > 0 && (
                    <div
                      ref={errorRef}
                      tabIndex={-1}
                      role="alert"
                      aria-labelledby={`${ids}-errors-title`}
                      className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <p
                        id={`${ids}-errors-title`}
                        className="text-sm font-semibold text-destructive"
                      >
                        {t("auth.error.title")}
                      </p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-destructive">
                        {errors.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {info && (
                    <p
                      role="status"
                      className="mb-4 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm text-foreground"
                    >
                      {info}
                    </p>
                  )}

                  <form onSubmit={onSubmit} noValidate className="space-y-4">
                    {isSignup && (
                      <div>
                        <label htmlFor={`${ids}-name`} className={label}>
                          {t("auth.name")}
                        </label>
                        <input
                          id={`${ids}-name`}
                          name="name"
                          type="text"
                          autoComplete="name"
                          disabled={busy}
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className={field}
                        />
                      </div>
                    )}

                    <div>
                      <label htmlFor={`${ids}-email`} className={label}>
                        {t("auth.email")}
                      </label>
                      <input
                        id={`${ids}-email`}
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        inputMode="email"
                        disabled={busy}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={field}
                      />
                    </div>

                    <div>
                      <label htmlFor={`${ids}-password`} className={label}>
                        {t("auth.password")}
                      </label>
                      <input
                        id={`${ids}-password`}
                        name="password"
                        type="password"
                        required
                        minLength={MIN_PASSWORD_LENGTH}
                        autoComplete={isSignup ? "new-password" : "current-password"}
                        aria-describedby={isSignup ? `${ids}-password-hint` : undefined}
                        disabled={busy}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={field}
                      />
                      {isSignup && (
                        <p
                          id={`${ids}-password-hint`}
                          className="mt-1.5 text-xs text-muted-foreground"
                        >
                          {t("auth.password.hint")}
                        </p>
                      )}
                    </div>

                    {isSignup && (
                      <div className="rounded-md border border-border bg-secondary/40 p-3.5">
                        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                          <input
                            type="checkbox"
                            checked={forOrganisation}
                            disabled={busy}
                            onChange={(e) => setForOrganisation(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-input accent-[color:var(--accent)]"
                          />
                          <span>
                            <span className="flex items-center gap-1.5 font-medium text-foreground">
                              <Building2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                              {t("auth.unified.organisation.toggle")}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {t("auth.unified.organisation.help")}
                            </span>
                          </span>
                        </label>

                        {forOrganisation && (
                          <div className="mt-3.5 space-y-3 border-t border-border pt-3.5">
                            <div>
                              <label htmlFor={`${ids}-company`} className={label}>
                                {t("auth.companyName")}
                              </label>
                              <input
                                id={`${ids}-company`}
                                name="organization"
                                type="text"
                                autoComplete="organization"
                                disabled={busy}
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                className={field}
                              />
                            </div>
                            <div>
                              <label htmlFor={`${ids}-country`} className={label}>
                                {t("auth.companyCountry")}
                              </label>
                              <input
                                id={`${ids}-country`}
                                name="country"
                                type="text"
                                autoComplete="country-name"
                                disabled={busy}
                                value={companyCountry}
                                onChange={(e) => setCompanyCountry(e.target.value)}
                                className={field}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <PrimaryButton
                      type="submit"
                      disabled={busy}
                      className="w-full justify-center gap-2"
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {busy
                        ? t(isSignup ? "auth.busy.signup" : "auth.busy.signin")
                        : t(isSignup ? "auth.signup.submit" : "auth.signin.submit")}
                    </PrimaryButton>
                  </form>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
                    <Link
                      to={isSignup ? "/login" : "/signup"}
                      search={swapSearch as never}
                      className="font-medium text-accent underline-offset-4 hover:underline"
                    >
                      {t(isSignup ? "auth.swap.to_signin" : "auth.swap.to_signup")}
                    </Link>
                    {!isSignup && (
                      <button
                        type="button"
                        onClick={onReset}
                        disabled={busy}
                        className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-60"
                      >
                        {t("auth.reset.link")}
                      </button>
                    )}
                  </div>

                  {/* Consent belongs to the moment it is given. Somebody
                      signing in accepted the policy when they registered, and
                      telling them that logging in constitutes acceptance is a
                      small untruth a trust product cannot afford. */}
                  <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
                    {t(isSignup ? "auth.privacy_note" : "auth.privacy_note.signin")}
                  </p>
                </>
              )}
            </div>
          </div>
        </Container>
      </div>
    </SiteLayout>
  );
}
