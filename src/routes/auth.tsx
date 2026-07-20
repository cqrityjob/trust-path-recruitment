import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import { supabase } from "@/integrations/supabase/client";
import { safeReturnPath } from "@/lib/auth/safe-redirect";

// Phase H3.1 — /auth is now a compatibility redirect ONLY. It never renders
// its own login/registration form. Every existing bookmark/indexed link to
// /auth keeps working; new traffic should go to /candidate/login,
// /candidate/register, /employer/login, or /employer/register directly.
//
// `intent` (candidate|employer) and `mode` (login|register) are read ONLY
// to choose a destination route — never treated as a permission or passed
// to any server function (docs/architecture/adr-candidate-employer-portal-separation.md,
// decision 7). Loop prevention: safeReturnPath() explicitly refuses to
// return a path back into /auth itself, so a malformed or malicious
// `redirect` param can never bounce a user back here.

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Sign in — CQrityjob" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AuthCompatibilityRedirect,
});

function destinationFor(params: URLSearchParams, alreadySignedIn: boolean): string {
  const intentParam = params.get("intent");
  const intent =
    intentParam === "employer" ? "employer" : intentParam === "admin" ? "admin" : "candidate";
  const mode = params.get("mode") === "register" ? "register" : "login";
  const redirect = params.get("redirect");

  if (alreadySignedIn) {
    // Already authenticated: skip any login form entirely. Candidate
    // intent (or no intent, matching every pre-H3.1 link's implicit
    // behaviour) preserves the exact prior default of landing on
    // /my-career; employer intent goes to the smart /employer router,
    // which independently re-derives workspace state itself; admin
    // intent (Phase H3.3) goes to /admin, whose own layout independently
    // re-verifies is_platform_admin() regardless of how the user arrived.
    if (intent === "employer") return safeReturnPath(redirect, "/employer");
    if (intent === "admin") return safeReturnPath(redirect, "/admin");
    return safeReturnPath(redirect, "/my-career");
  }

  // Admin has no self-service registration -- "mode" is meaningless for
  // this intent, always /admin/login.
  const base =
    intent === "admin"
      ? "/admin/login"
      : intent === "employer"
        ? mode === "register"
          ? "/employer/register"
          : "/employer/login"
        : mode === "register"
          ? "/candidate/register"
          : "/candidate/login";
  const validatedRedirect = safeReturnPath(redirect, "");
  return validatedRedirect ? `${base}?redirect=${encodeURIComponent(validatedRedirect)}` : base;
}

function AuthCompatibilityRedirect() {
  const { t } = useT();
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search);
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const dest = destinationFor(params, Boolean(data.session));
      navigate({ to: dest, replace: true });
    });
    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <SiteLayout>
      <Section>
        <div className="mx-auto max-w-md">
          <p className="text-sm text-muted-foreground">{t("auth.redirecting")}</p>
        </div>
      </Section>
    </SiteLayout>
  );
}
