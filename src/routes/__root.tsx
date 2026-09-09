import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider } from "../i18n/context";
import { supabase } from "@/integrations/supabase/client";
import { BrandMark } from "@/components/patterns/BrandMark";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--cq-ivory)] px-6 py-16">
      <div className="w-full max-w-xl rounded-[var(--cq-radius-scene)] border border-[var(--cq-border)] bg-white p-8 text-center shadow-[var(--cq-shadow-lg)] md:p-12">
        <BrandMark className="mx-auto" />
        <p className="cq-eyebrow mt-10 text-[var(--cq-blue-ink)]">404</p>
        <h1 className="cq-h2 mt-4">Page not found</h1>
        <p className="cq-body mt-4 text-[var(--cq-text-muted)]">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link to="/" className="cq-button-primary">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--cq-ice)] px-6 py-16">
      <div className="w-full max-w-xl rounded-[var(--cq-radius-scene)] border border-[var(--cq-border)] bg-white p-8 text-center shadow-[var(--cq-shadow-lg)] md:p-12">
        <BrandMark className="mx-auto" />
        <h1 className="cq-h2 mt-10">This page didn't load</h1>
        <p className="cq-body mt-4 text-[var(--cq-text-muted)]">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="cq-button-primary"
          >
            Try again
          </button>
          <a href="/" className="cq-button-secondary">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CQrityjob — Where trust comes first." },
      {
        name: "description",
        content:
          "The modern recruitment, verification and assessment platform built exclusively for the security industry.",
      },
      { name: "author", content: "CQrityjob" },
      { property: "og:site_name", content: "CQrityjob" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
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
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
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
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </I18nProvider>
    </QueryClientProvider>
  );
}
