// Security Career Discovery — landing and start experience.
//
// ONE implementation, mounted at two paths:
//   /security-career-assessment  — the canonical public route
//   /discovery                   — temporary internal alias, redirects here
//
// Extracted from the former /discovery route file so the cutover reuses the
// v3 components, server functions, session handling, question engine and
// report generation rather than duplicating any of it.

// Public by design: the CTA must be reachable while signed out. Clicking it
// signed out routes through the EXISTING /auth flow with a redirect back to
// the canonical route, so the candidate lands where they intended. No second
// auth provider, no temporary login.
//
// Authorisation is decided SERVER-side by getDiscoveryAccess. This page only
// reflects it — while lifecycle_status is internal_test, a non-tester sees
// the approved unavailable state and can never start a session.

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, Clock, Compass, Save, ShieldCheck } from "lucide-react";
import { AssessmentLayout } from "@/components/assessment/AssessmentLayout";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { supabase } from "@/integrations/supabase/client";
import {
  getDiscoveryAccess,
  startDiscoverySession,
} from "@/lib/career-discovery/discovery.functions";
import { parseSessionId } from "@/lib/career-discovery/session-id";
import { DURATION_CLAIM } from "@/lib/career-discovery/v31/duration";

type Access = Awaited<ReturnType<typeof getDiscoveryAccess>> | null;

/** Canonical paths. The component is path-agnostic so the same
 *  implementation serves the canonical route and the temporary alias. */
export interface DiscoveryLandingProps {
  /** Where Start navigates to, e.g. "/security-career-assessment/session". */
  sessionPath: string;
  /** Where the login redirect returns to, e.g. "/security-career-assessment". */
  returnPath: string;
  /** Report history hub. */
  historyPath: string;
}

export function DiscoveryLanding({ sessionPath, returnPath, historyPath }: DiscoveryLandingProps) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const access = useServerFn(getDiscoveryAccess);
  const start = useServerFn(startDiscoverySession);

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [state, setState] = useState<Access>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const isIn = !!data.session;
      setSignedIn(isIn);
      if (!isIn) return;
      try {
        setState(await access({}));
      } catch {
        setState(null);
      }
    });
    return () => {
      mounted = false;
    };
  }, [access]);

  const goToLogin = () => navigate({ to: "/login", search: { redirect: "/discovery" } as never });

  const beginOrResume = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await start({ data: { locale: lang } });

      // Never navigate on anything other than a real session id. Previously
      // the raw value went straight into the URL, so a missing or malformed
      // id produced `/discovery/session?session=` and a dead end that looked
      // like a broken product rather than a failed call.
      const sessionId = parseSessionId(result?.sessionId);
      if (!sessionId) {
        setError(t("careerDiscovery.landing.error.noSession"));
        setBusy(false);
        return;
      }

      navigate({ to: sessionPath, search: { session: sessionId } as never });
    } catch {
      // Sanitised: the user is told it failed and what to do, never the
      // error code, the session id, or anything about the database.
      setError(t("careerDiscovery.landing.error.start"));
      setBusy(false);
    }
  };

  const points = [
    // Derived from the instrument, never typed into copy — see
    // v31/duration.ts for the five surfaces that used to disagree about how
    // long this takes, including this page's own meta description.
    { icon: Clock, label: DURATION_CLAIM[lang === "en" ? "en" : "sv"] },
    { icon: CheckCircle2, label: t("careerDiscovery.landing.point.questions") },
    { icon: Save, label: t("careerDiscovery.landing.point.autosave") },
    { icon: ShieldCheck, label: t("careerDiscovery.landing.point.noPassFail") },
    { icon: Compass, label: t("careerDiscovery.landing.point.guidance") },
  ];

  return (
    <AssessmentLayout>
      <div className="grid grid-cols-1 gap-16 md:grid-cols-5 md:items-start">
        <div className="md:col-span-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
            {t("careerDiscovery.landing.badge")}
          </span>

          <h1
            className="mt-6 text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("careerDiscovery.landing.title")}
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {t("careerDiscovery.landing.lead")}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            {signedIn === false && (
              <PrimaryButton onClick={goToLogin}>
                {t("careerDiscovery.landing.cta.start")}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </PrimaryButton>
            )}

            {signedIn && state?.isInternalTester && (
              <PrimaryButton onClick={beginOrResume} disabled={busy}>
                {state.resumableSessionId
                  ? t("careerDiscovery.landing.cta.resume")
                  : t("careerDiscovery.landing.cta.start")}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </PrimaryButton>
            )}

            {signedIn && state && !state.isInternalTester && (
              <div
                role="status"
                className="rounded-md border border-border bg-muted/40 p-5 text-sm text-muted-foreground"
              >
                {t("careerDiscovery.landing.notTester")}
              </div>
            )}

            {signedIn && (
              <a
                href={historyPath}
                className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {t("careerDiscovery.landing.cta.history")}
              </a>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <ul className="rounded-lg border border-border bg-background p-2 md:col-span-2">
          {points.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-start gap-3 border-b border-border/60 px-4 py-4 text-sm text-foreground last:border-b-0"
            >
              <Icon
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-20 rounded-lg border border-border bg-muted/30 p-6 text-sm leading-relaxed text-muted-foreground">
        {t("careerDiscovery.landing.internalNotice")}
      </div>
    </AssessmentLayout>
  );
}
