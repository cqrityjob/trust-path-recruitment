import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { I18nProvider, useAdoptLangIntent } from "../i18n/context";
import { RootError, RootNotFound } from "@/components/site/RootFallbacks";
import { TermsAcceptanceGate } from "../components/legal/TermsAcceptanceGate";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTION_ORIGIN } from "@/lib/site-origin";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CQrityjob — Where trust comes first." },
      {
        name: "description",
        content:
          "Security careers, without limits. Career development, Security Passport, security jobs and recruitment of security professionals – for people in security and the employers who hire them.",
      },
      { name: "author", content: "CQrityjob" },
      { property: "og:site_name", content: "CQrityjob" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      // The site's own share image, absolute on the production domain:
      // crawlers resolve a relative og:image poorly, and without one the
      // host injected a Lovable editor preview. A route with its own image
      // (a job, a shared Passport) overrides these by name. No width, height
      // or alt here: a route that replaces only the image (a job with its
      // employer's logo) would inherit them and describe the wrong picture.
      { property: "og:image", content: `${PRODUCTION_ORIGIN}/og-cqrityjob.png` },
      { name: "twitter:image", content: `${PRODUCTION_ORIGIN}/og-cqrityjob.png` },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      // NO THIRD-PARTY FONT FETCH.
      //
      // Sora and Manrope are served from this origin -- see the @font-face
      // block in src/styles.css for why. In short: a printed CV whose webfont
      // had not arrived fell back to the platform UI font, which macOS does
      // not let Chromium embed, and the resulting PDF extracted the
      // candidate's own name out of order in an applicant tracking system.
      // A document that has to be right cannot depend on somebody else's CDN
      // having answered in time.
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  // Translated, and safe outside the providers: see RootFallbacks.tsx.
  notFoundComponent: RootNotFound,
  errorComponent: RootError,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="sv">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Clear cross-identity React Query cache leakage.
  //
  // Defect reproduced 2026-07-20: /employer/$employerSlug fired
  // getEmployerDashboardStats with an employerId belonging to a PRIOR
  // signed-in user in the same tab (a stale observer of
  // ["employer", <prev-employer-id>, "dashboard-stats"]). RLS correctly
  // returned "Access not available" for the new session, but the
  // rejection surfaced as a runtime error modal. Nothing about the
  // server function, the membership logic, or the RLS policies is
  // wrong — the fix is teardown of cross-identity cache on the client.
  //
  // The listener only reacts to real identity transitions
  // (SIGNED_OUT, and a SIGNED_IN / INITIAL_SESSION whose user.id differs
  // from the previously observed one) — TOKEN_REFRESHED / same-user
  // INITIAL_SESSION do not thrash the cache.
  useEffect(() => {
    let lastUserId: string | null | undefined = undefined;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user?.id ?? null;
      if (event === "SIGNED_OUT") {
        queryClient.cancelQueries();
        queryClient.clear();
        lastUserId = null;
        return;
      }
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
        if (lastUserId !== undefined && nextUserId !== lastUserId) {
          queryClient.cancelQueries();
          queryClient.clear();
        }
        lastUserId = nextUserId;
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <LangIntentFromUrl />
        {/* Every signed-in page: an account without accepted terms is asked
            before it can use the product (Google sign-in included). */}
        <TermsAcceptanceGate />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </I18nProvider>
    </QueryClientProvider>
  );
}

/** A link's `?lang=` (the India page's sign-up link) survives a tap made
 *  before hydration and a confirmation link opened on another device. See
 *  useAdoptLangIntent: an explicit, stored choice always wins. */
function LangIntentFromUrl() {
  const search = useRouterState({ select: (s) => s.location.searchStr });
  useAdoptLangIntent(search);
  return null;
}
