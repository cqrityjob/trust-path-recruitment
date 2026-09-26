// The authentication panel — the card itself, and every handler behind it.
//
// ── WHY THIS IS ITS OWN COMPONENT ──────────────────────────────────────
//
// It was the right-hand column of UnifiedAuthForm, and UnifiedAuthForm was
// a whole PAGE: it returned <SiteLayout>, so the only way to show a login
// form anywhere else was to nest one page inside another.
//
// The owner's image 0 puts a working login panel on the public landing
// page. That must not become a second authentication implementation, so
// nothing here was copied: the state, the handlers, the validation, the
// error region, the OAuth return handling and the organisation intent all
// MOVED, whole, out of UnifiedAuthForm and into this file. There is still
// exactly one implementation of each; it now has two mount points.
//
// The cut is along a seam that already existed. The proposition column
// reads none of this state — it renders copy and one icon — so nothing is
// shared across the boundary and no state had to be lifted.
//
// UnifiedAuthForm still owns the PAGE at /login: the shell, the
// proposition, and this panel. / mounts this panel beside its own hero.
//
// Everything below this header is unchanged from the original component
// apart from indentation and the two layout-only imports the page kept.

import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { Building2, Loader2 } from "lucide-react";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { supabase } from "@/integrations/supabase/client";
import { safeReturnPath, splitReturnPath } from "@/lib/auth/safe-redirect";
import { CANONICAL_ASSESSMENT_PATH } from "@/lib/career-discovery/routes";
import {
  clearOAuthReturn,
  consumeOAuthReturn,
  consumeOrganisationIntent,
  oauthErrorMessage,
  oauthRedirectUri,
  rememberOAuthReturn,
  rememberOrganisationIntent,
} from "@/lib/auth/oauth-return";
import { hasEmployerSignupIntent } from "@/lib/job-intelligence/employer-signup-intent";
// The employer-entrance predicate lives in its own pure module so the guard
// script can prove it over hand-written inputs without mounting this panel —
// same reason, and same shape, as employer-signup-intent.ts.
import { registrationTargetsOrganisation } from "@/lib/auth/organisation-entrance";
import { ensureMyEmployerCompanyFromSignup } from "@/lib/job-intelligence/employer-onboarding.functions";
import { EMPLOYER_SIGNUP_PROVISION_KEY } from "@/lib/job-intelligence/use-employer-signup-provisioning";
import { EMPLOYER_REGISTRATION_NOTICE_KEY } from "@/lib/job-intelligence/registration-notice-cache";
import {
  clearPendingConfirmation,
  readPendingConfirmation,
  rememberPendingConfirmation,
} from "@/lib/auth/pending-confirmation";
import {
  authErrorKey,
  classifyAuthError,
  consumeAuthErrorFragment,
  type ClassifiedAuthError,
} from "@/lib/auth/auth-error-copy";
export type UnifiedAuthMode = "signin" | "signup";

/** The provider's resend interval. Supabase Auth refuses a second email to
 *  the same address inside it, so the button counts it down instead of
 *  letting the person press it into a 429. */
const RESEND_COOLDOWN_SECONDS = 60;
/** How often the panel checks, with the person's own credentials, whether
 *  the address has been confirmed elsewhere -- and for how long. Every check
 *  is a real sign-in attempt on THIS device: nothing is transferred. */
const AUTO_CHECK_INTERVAL_MS = 30_000;
const AUTO_CHECK_MAX_ATTEMPTS = 20;

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

/**
 * Writes a stashed organisation intent onto the account that just came back
 * from Google, so an OAuth registration reaches the rest of the product
 * carrying what an email registration would have carried.
 *
 * Deliberately narrow:
 *
 *   * it consumes the stash unconditionally, so an abandoned attempt cannot
 *     wait around and attach itself to a later, unrelated sign-in;
 *   * it refuses to overwrite an account that already names a company,
 *     because that value came from a real registration and this one may not
 *     have;
 *   * it never throws. The account is valid without it, and the onboarding
 *     form is the fallback — the same one somebody registering before this
 *     existed would have used.
 *
 * It is not a permission. `employer_memberships` decides that, server-side,
 * and the organisation this eventually produces is created `pending`.
 */
async function applyPendingOrganisationIntent(user: {
  user_metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const stashed = consumeOrganisationIntent();
  if (!stashed) return;
  if (hasEmployerSignupIntent(user.user_metadata ?? null)) return;
  try {
    const { error } = await supabase.auth.updateUser({
      data: { company_name: stashed.companyName, company_country: stashed.companyCountry },
    });
    if (error) throw error;
  } catch (err) {
    console.error("[auth] could not carry the organisation intent across Google sign-in", err);
  }
}
export function UnifiedAuthPanel({ mode }: { mode: UnifiedAuthMode }) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const ids = useId();
  const queryClient = useQueryClient();
  const ensureCompany = useServerFn(ensureMyEmployerCompanyFromSignup);

  const [sessionKnown, setSessionKnown] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  // Opened and ticked when the person arrived through the employer entrance,
  // so "register your company" collects a company. Lazy, because it reads the
  // URL; safe against SSR because the form is not painted until `sessionKnown`
  // is true, which only happens in a client effect.
  const [forOrganisation, setForOrganisation] = useState(() =>
    typeof window === "undefined"
      ? false
      : registrationTargetsOrganisation(window.location.search, mode === "signup"),
  );
  const [companyName, setCompanyName] = useState("");
  const [companyCountry, setCompanyCountry] = useState("");

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  // ── THE INBOX-CONFIRMATION STATE ────────────────────────────────────
  //
  // Non-null once sign-up has succeeded WITHOUT returning a session, which
  // is the only case where there is an email to go and read. It carries
  // the address the link was sent to and the destination the link will
  // come back to, so the panel can state both rather than imply them.
  //
  // It REPLACES the form. Previously the form stayed on screen behind a
  // one-line notice, so the only control the page still offered was the
  // button that had already worked -- press it again and the answer is
  // "User already registered", an error about the thing that succeeded.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<{
    readonly email: string;
    readonly returnTo: string;
    readonly forOrganisation: boolean;
    /** True while the password is still in this tab's memory, so "I have
     *  confirmed -- continue" can sign in HERE. False when the state was
     *  restored after a reload: the password is never stored, so the honest
     *  next step is the sign-in form. */
    readonly canSignInHere: boolean;
  } | null>(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [checking, setChecking] = useState(false);
  // The address already has an account. Supabase answers a confirmation-
  // required signUp for a taken address WITHOUT an error and WITHOUT sending
  // anything (the user comes back with no identities), so this is a state of
  // its own rather than a line inside the inbox panel.
  const [existingAccount, setExistingAccount] = useState<string | null>(null);
  /** The registration this browser is waiting on, shown as a notice on the
   *  sign-in form (the panel itself is restored only in signup mode). */
  const [pendingForSignIn, setPendingForSignIn] = useState<{
    readonly email: string;
    readonly returnTo: string;
    readonly forOrganisation: boolean;
  } | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const awaitingRef = useRef(awaitingConfirmation);
  awaitingRef.current = awaitingConfirmation;
  const passwordRef = useRef(password);
  passwordRef.current = password;

  /** One sentence per refusal, from the provider's error code. The raw
   *  message goes to the console, where a developer will look for it. */
  function describe(err: unknown): string {
    const c = classifyAuthError(err);
    console.error("[auth]", c.kind, c.raw);
    const key = authErrorKey(c);
    return key === "auth.error.rateLimitedSeconds"
      ? t(key).replace("{0}", String(c.retryAfterSeconds))
      : t(key);
  }

  function startCooldown(seconds: number) {
    setResendCooldown(Math.max(0, Math.ceil(seconds)));
  }
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendCooldown]);

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
        // A confirmation link opened late or twice comes back to this page
        // with the refusal in the URL fragment. Say it, and clear the URL.
        const linkError: ClassifiedAuthError | null = consumeAuthErrorFragment();
        // A registration this browser is still waiting on: after a reload,
        // or on the laptop after the link was opened on a phone.
        const pending = readPendingConfirmation(DEFAULT_DESTINATION);
        if (pending) {
          setEmail(pending.email);
          setPendingForSignIn({
            email: pending.email,
            returnTo: pending.returnTo,
            forOrganisation: pending.forOrganisation,
          });
          if (isSignup) {
            setForOrganisation(pending.forOrganisation);
            setAwaitingConfirmation({
              email: pending.email,
              returnTo: pending.returnTo,
              forOrganisation: pending.forOrganisation,
              canSignInHere: false,
            });
          }
        }
        if (linkError) {
          setErrors([
            linkError.kind === "link_expired" ? t("auth.confirm.linkExpired") : describe(linkError),
          ]);
        }
        setSessionKnown(true);
        return;
      }
      // A Google registration that named an organisation: apply the two
      // strings signInWithOAuth could not carry, so the rest of the product
      // sees the same intent an email registration would have produced.
      //
      // NEVER overwrites: if this account already carries a company name, the
      // stored value is stale (an abandoned attempt in the same tab) and the
      // account's own metadata wins. It grants nothing either way -- metadata
      // is user-writable by design, and what it buys is a `pending`
      // organisation awaiting the same approval as any other.
      //
      // Failure is not fatal. The account exists and works; the person is
      // asked for the company name on the onboarding form, which is where
      // they would have been without this at all.
      void applyPendingOrganisationIntent(data.session.user).finally(() => {
        // Returning from OAuth onto the auth page means the path in
        // `redirectTo` was not honoured — with Supabase Auth that happens when
        // the URL is not in the project's redirect allowlist and it falls back
        // to the Site URL. The stashed destination is the fallback.
        const pending = consumeOAuthReturn();
        if (pending) {
          const { to, search } = splitReturnPath(pending);
          navigate({ to, search: search as never });
          return;
        }
        goToDestination();
      });
    });
    // The link opened in ANOTHER TAB of this same browser: supabase-js
    // broadcasts the new session across tabs, and the tab that is still
    // showing "check your email" follows it to the destination. This is the
    // same browser's own session, not a transfer between devices.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const waiting = awaitingRef.current;
      if (event !== "SIGNED_IN" || !session || !waiting) return;
      clearPendingConfirmation();
      void (waiting.forOrganisation ? ensureCompany().catch(() => null) : Promise.resolve()).then(
        () => {
          const { to, search } = splitReturnPath(waiting.returnTo);
          navigate({ to, search: search as never });
        },
      );
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  /** "I have confirmed -- continue", on THIS device.
   *
   *  A real sign-in with the person's own email and the password still in
   *  this tab's memory. Success means the address was confirmed (on any
   *  device) and this device now has its own session; `email_not_confirmed`
   *  means not yet. Nothing about the account is readable without the
   *  credentials, and no session is copied from anywhere. */
  async function tryContinue(silent: boolean): Promise<boolean> {
    const waiting = awaitingRef.current;
    const pwd = passwordRef.current;
    if (!waiting || !waiting.canSignInHere || !pwd) return false;
    if (!silent) {
      setErrors([]);
      setInfo(null);
      setChecking(true);
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: waiting.email,
        password: pwd,
      });
      if (error) {
        const c = classifyAuthError(error);
        if (c.kind === "email_not_confirmed") {
          if (!silent) setInfo(t("auth.confirm.notYet"));
          return false;
        }
        if (!silent) reportErrors([describe(error)]);
        return false;
      }
      clearPendingConfirmation();
      if (waiting.forOrganisation) {
        try {
          const provisioned = await ensureCompany();
          queryClient.setQueryData(EMPLOYER_SIGNUP_PROVISION_KEY, provisioned);
          if (provisioned.created) {
            queryClient.setQueryData(EMPLOYER_REGISTRATION_NOTICE_KEY, provisioned.notice);
          }
        } catch (err) {
          console.error("[auth] could not provision the organisation after confirmation", err);
        }
      }
      const { to, search } = splitReturnPath(waiting.returnTo);
      navigate({ to, search: search as never });
      return true;
    } finally {
      if (!silent) setChecking(false);
    }
  }

  // The automatic check: every 30 seconds while the panel is showing and
  // the tab is visible, and once more the moment the tab becomes visible
  // again -- which is exactly when somebody comes back from their phone.
  useEffect(() => {
    if (!awaitingConfirmation?.canSignInHere) return;
    let attempts = 0;
    let stopped = false;
    const run = () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (attempts >= AUTO_CHECK_MAX_ATTEMPTS) return;
      attempts += 1;
      void tryContinue(true).then((done) => {
        if (done) stopped = true;
      });
    };
    const id = window.setInterval(run, AUTO_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingConfirmation?.canSignInHere, awaitingConfirmation?.email]);

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
        const { data, error } = await supabase.auth.signUp({
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
        if (error) {
          if (classifyAuthError(error).kind === "existing_account") {
            setExistingAccount(email.trim());
            return;
          }
          throw error;
        }

        // ── AN ADDRESS THAT ALREADY HAS AN ACCOUNT ─────────────────────
        //
        // With confirmations required, Supabase answers a signUp for a taken
        // address with NO error, a user object with NO identities, and sends
        // NOTHING -- so the panel used to say "check your email" about a
        // message that was never sent. That is its own state: sign in, or
        // reset the password.
        if (
          !data.session &&
          data.user &&
          Array.isArray(data.user.identities) &&
          data.user.identities.length === 0
        ) {
          setExistingAccount(email.trim());
          return;
        }

        // Sign-up does not always mean "go and check your email". When the
        // project does not require confirmation, signUp returns a SESSION and
        // the person is already signed in -- and this form used to tell them
        // to check their inbox for a message that was never sent, then leave
        // them standing on the registration page. Whatever they did next, the
        // destination they had just earned was gone: an employer registrant
        // ended up on the personal home, and their organisation was never
        // created, because the only thing that created it was arriving at
        // /employer.
        //
        // Provisioning no longer depends on that arrival, but the destination
        // still matters -- being taken somewhere that explains what happens
        // next is the difference between a product and a form that submitted.
        if (data.session) {
          // ── SAVE THE APPLICATION IN THE REQUEST THEY ARE WAITING ON ──
          //
          // Provisioning is a lifecycle event of the authenticated shell, and
          // that is still true — but it means the organisation is created by
          // a SECOND call, issued after a navigation, from a page that has
          // not mounted yet. Somebody who submits and immediately closes the
          // tab is in that gap: their account exists, their company name sits
          // in metadata, and no application was ever saved for an
          // administrator to see.
          //
          // So it is done here as well, while the submit button is still
          // spinning and the person is still on the page. The server creates
          // the row and sends both messages inside this one request, so
          // closing the tab after this point cannot lose either.
          //
          // It does not replace the shell's call and cannot conflict with it:
          // `ensureMyEmployerCompanyFromSignup` refuses a caller who already
          // holds a membership, so whichever runs second answers
          // `already_member`. Seeding the shared cache simply saves it the
          // round trip.
          //
          // A failure here is NOT fatal and is deliberately not shown: the
          // account is real, the destination still explains where things
          // stand, and the shell retries and owns the error state. Blocking
          // the navigation on it would strand somebody whose account was
          // created successfully.
          if (forOrganisation) {
            try {
              const provisioned = await ensureCompany();
              queryClient.setQueryData(EMPLOYER_SIGNUP_PROVISION_KEY, provisioned);
              if (provisioned.created) {
                queryClient.setQueryData(EMPLOYER_REGISTRATION_NOTICE_KEY, provisioned.notice);
              }
            } catch (err) {
              console.error("[auth] could not provision the organisation at signup", err);
            }
          }
          goToDestination();
          return;
        }

        // No session means the project requires confirmation, so there IS
        // an email to go and read. Hand over to the confirmation panel and
        // take the form off the page. Remembered in this browser too, so a
        // reload -- or coming back to this laptop after opening the link on
        // a phone -- finds the same panel and not the form.
        rememberPendingConfirmation(
          { email: email.trim(), returnTo, forOrganisation },
          DEFAULT_DESTINATION,
        );
        setAwaitingConfirmation({
          email: email.trim(),
          returnTo,
          forOrganisation,
          canSignInHere: true,
        });
        startCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          // Signing in before the link was opened is the cross-device case
          // in another form: say so, and offer the resend right here.
          if (classifyAuthError(error).kind === "email_not_confirmed") {
            const returnTo = resolveDestination();
            rememberPendingConfirmation(
              { email: email.trim(), returnTo, forOrganisation: false },
              DEFAULT_DESTINATION,
            );
            setAwaitingConfirmation({
              email: email.trim(),
              returnTo,
              forOrganisation: false,
              canSignInHere: true,
            });
            setInfo(t("auth.confirm.notYet"));
            return;
          }
          throw error;
        }
        clearPendingConfirmation();
        goToDestination();
      }
    } catch (err) {
      reportErrors([describe(err)]);
    } finally {
      setBusy(false);
    }
  }

  /** Send the verification link again, to the SAME address and with the
   *  SAME return path. Both come from the stored state rather than from
   *  the form's fields, which are no longer on screen -- so a resend can
   *  never quietly change where the link goes. */
  async function onResend() {
    if (!awaitingConfirmation) return;
    await onResendFor(awaitingConfirmation.email, awaitingConfirmation.returnTo);
  }
  async function onResendFor(toAddress: string, returnTo: string) {
    setErrors([]);
    setInfo(null);
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: toAddress,
        options: {
          emailRedirectTo: `${window.location.origin}/login?redirect=${encodeURIComponent(
            returnTo,
          )}`,
        },
      });
      if (error) throw error;
      setInfo(t("auth.confirm.resent"));
      startCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const c = classifyAuthError(err);
      if (c.kind === "rate_limited") startCooldown(c.retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS);
      reportErrors([describe(err)]);
    } finally {
      setResending(false);
    }
  }

  /** Back to the form, with the address still in the field so a typo is a
   *  correction rather than a re-type. The password is deliberately kept
   *  too: the account does not exist until the link is opened, so
   *  submitting again is a legitimate retry of the same registration. */
  function onChangeEmail() {
    clearPendingConfirmation();
    setAwaitingConfirmation(null);
    setExistingAccount(null);
    setInfo(null);
    setErrors([]);
  }

  /** The restored panel has no password to sign in with (it is never
   *  stored), so the honest continuation is the sign-in form, with the
   *  address filled in and the destination kept. */
  function onSignInToContinue() {
    const returnTo = awaitingConfirmation?.returnTo ?? DEFAULT_DESTINATION;
    navigate({ to: "/login", search: { redirect: returnTo } as never });
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
    // The company name has to survive the provider round trip too. Without
    // this it was simply dropped: signInWithOAuth carries no metadata, so a
    // person who typed their organisation and then chose Google arrived as an
    // ordinary account and was asked for the name a second time.
    if (isSignup && forOrganisation) {
      rememberOrganisationIntent({
        companyName: companyName.trim(),
        companyCountry: companyCountry.trim(),
      });
    }
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
      reportErrors([describe(err)]);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1.5 block w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60";
  const label = "block text-sm font-medium text-foreground";

  return (
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
      ) : existingAccount ? (
        /* ── THE ADDRESS ALREADY HAS AN ACCOUNT ──────────────────────
           No email was sent, so no inbox panel. The two things that
           actually help: sign in, or a reset link. */
        <div data-testid="auth-existing-account" className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">{t("auth.existing.heading")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("auth.existing.body").replace("{0}", existingAccount)}
          </p>
          {info && (
            <p
              role="status"
              data-testid="auth-existing-info"
              className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm text-foreground"
            >
              {info}
            </p>
          )}
          {errors.length > 0 && (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ul className="list-disc space-y-1 pl-4 text-sm text-destructive">
                {errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/login"
              search={{ redirect: resolveDestination() } as never}
              data-testid="auth-existing-signin"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-[color:var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("auth.existing.signIn")}
            </Link>
            <button
              type="button"
              onClick={onReset}
              disabled={busy}
              data-testid="auth-existing-reset"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("auth.existing.reset")}
            </button>
            <button
              type="button"
              onClick={onChangeEmail}
              className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-accent underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("auth.existing.back")}
            </button>
          </div>
        </div>
      ) : awaitingConfirmation ? (
        /* ── REGISTERED: THE INBOX IS THE NEXT STEP ──────────────
           The form is GONE, not disabled and not merely captioned.
           What replaces it says three things the one-line notice
           never did: which address the link went to, what to do if
           it does not arrive, and that the destination the person
           was heading for is still waiting for them. */
        <div data-testid="auth-awaiting-confirmation" className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">{t("auth.confirm.heading")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t(forOrganisation ? "auth.confirm.bodyEmployer" : "auth.confirm.body")}
          </p>

          {/* The address, shown rather than assumed. A typo in an
              email address is invisible until nothing arrives. */}
          <div className="mt-4 rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t("auth.confirm.sentTo")}
            </p>
            <p
              data-testid="auth-confirmation-email"
              className="mt-1 break-all text-sm font-medium text-foreground"
            >
              {awaitingConfirmation.email}
            </p>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">{t("auth.confirm.notArrived")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.confirm.destinationKept")}</p>

          {/* ── THE LINK MAY BE OPENED ON ANOTHER DEVICE ─────────────
              Said before it happens: the account is activated where the
              link is opened, this device gets no session handed to it,
              and continuing here means a real sign-in here. With the
              password still in this tab's memory that is one button; after
              a reload it is the sign-in form. */}
          <p
            data-testid="auth-confirmation-cross-device"
            className="mt-4 rounded-md border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground"
          >
            {awaitingConfirmation.canSignInHere
              ? t("auth.confirm.otherDevice")
              : t("auth.confirm.restored")}
          </p>
          {awaitingConfirmation.canSignInHere && (
            <p
              className="mt-2 text-xs text-muted-foreground"
              data-testid="auth-confirmation-autocheck"
            >
              {t("auth.confirm.autoChecking")}
            </p>
          )}

          {/* Announced, not merely painted: a resend that only
              changes a colour tells a screen-reader user nothing. */}
          {info && (
            <p
              role="status"
              className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm text-foreground"
            >
              {info}
            </p>
          )}
          {errors.length > 0 && (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ul className="list-disc space-y-1 pl-4 text-sm text-destructive">
                {errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            {awaitingConfirmation.canSignInHere ? (
              <PrimaryButton
                type="button"
                onClick={() => void tryContinue(false)}
                disabled={checking}
                data-testid="auth-confirmation-continue"
                className="gap-2"
              >
                {checking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {checking ? t("auth.confirm.checking") : t("auth.confirm.continue")}
              </PrimaryButton>
            ) : (
              <PrimaryButton
                type="button"
                onClick={onSignInToContinue}
                data-testid="auth-confirmation-signin"
              >
                {t("auth.confirm.signInToContinue")}
              </PrimaryButton>
            )}
            <button
              type="button"
              onClick={onResend}
              disabled={resending || resendCooldown > 0}
              data-testid="auth-confirmation-resend"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resending
                ? t("auth.confirm.resending")
                : resendCooldown > 0
                  ? t("auth.confirm.resendIn").replace("{0}", String(resendCooldown))
                  : t("auth.confirm.resend")}
            </button>
            <button
              type="button"
              onClick={onChangeEmail}
              data-testid="auth-confirmation-change-email"
              className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-accent underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("auth.confirm.changeEmail")}
            </button>
          </div>
        </div>
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
              <p id={`${ids}-errors-title`} className="text-sm font-semibold text-destructive">
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

          {/* On the sign-in form, a registration this browser is waiting on
              is named rather than restored as a panel: the person came here
              to sign in, and after the link was opened that IS the next step.
              The address is already in the field. */}
          {!isSignup && pendingForSignIn && (
            <div
              data-testid="auth-signin-pending"
              className="mb-4 rounded-md border border-border bg-secondary/40 p-3 text-sm text-foreground"
            >
              <p>{t("auth.login.pendingNotice").replace("{0}", pendingForSignIn.email)}</p>
              <button
                type="button"
                onClick={() => {
                  setAwaitingConfirmation({ ...pendingForSignIn, canSignInHere: false });
                  void onResendFor(pendingForSignIn.email, pendingForSignIn.returnTo);
                }}
                disabled={resending || resendCooldown > 0}
                className="mt-2 inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline disabled:opacity-60"
              >
                {resendCooldown > 0
                  ? t("auth.confirm.resendIn").replace("{0}", String(resendCooldown))
                  : t("auth.confirm.resend")}
              </button>
            </div>
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
                <p id={`${ids}-password-hint`} className="mt-1.5 text-xs text-muted-foreground">
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
                    {/* The three steps, in order, before any of them
                        happens. Without this the verification email is the
                        only thing the person hears about, and a message that
                        says "confirm your address" is read as "you are in". */}
                    <p
                      data-testid="signup-organisation-note"
                      className="text-xs leading-relaxed text-muted-foreground"
                    >
                      {t("auth.unified.organisation.note")}
                    </p>
                  </div>
                )}
              </div>
            )}

            <PrimaryButton type="submit" disabled={busy} className="w-full justify-center gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {busy
                ? t(isSignup ? "auth.busy.signup" : "auth.busy.signin")
                : t(isSignup ? "auth.signup.submit" : "auth.signin.submit")}
            </PrimaryButton>
          </form>

          {/* Both controls below carry min-h-11, like every other control in
              this panel. They did not, because /login does not assert a
              minimum hit area — and the panel now also mounts on the public
              landing page, which does: public-homepage.spec.ts fails any
              target under 44x44 in main, at every required width. The
              homepage holds the stricter and better rule, so the controls
              meet it rather than the rule being relaxed for them, and
              /login gets the same improvement. */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
            <Link
              to={isSignup ? "/login" : "/signup"}
              search={swapSearch as never}
              className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline"
            >
              {t(isSignup ? "auth.swap.to_signin" : "auth.swap.to_signup")}
            </Link>
            {!isSignup && (
              <button
                type="button"
                onClick={onReset}
                disabled={busy}
                className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-4 hover:underline disabled:opacity-60"
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
  );
}
