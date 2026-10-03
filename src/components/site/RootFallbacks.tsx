import { useContext, useEffect } from "react";
import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { QueryClientContext } from "@tanstack/react-query";
import { useHasI18n, useTolerantT } from "@/i18n/context";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { SiteLayout } from "./SiteLayout";

/** ── THE ROOT'S TWO FALLBACK SCREENS ─────────────────────────────────────
 *
 *  The 404 (no route matched) and the error boundary (a route threw). Both
 *  were English-only on a Swedish-default site; they now read the dictionary
 *  through `useTolerantT()`, which gives the reader their own language and,
 *  unlike `useT()`, NEVER throws.
 *
 *  That last property is the point of this file. A hard crash unwinds the root
 *  component and the I18nProvider and QueryClientProvider inside it, so the
 *  error screen can render with no provider above it at all, and a screen that
 *  throws inside the error boundary is no screen. So:
 *
 *  - the ERROR screen is deliberately bare: no public chrome, no queries, just
 *    its own words and two actions (try again, go home). Nothing in it can
 *    fail for the reason the page already failed.
 *  - the 404 wears the public chrome (SiteLayout: header, footer) ONLY when it
 *    is inside both providers, which is how an unmatched URL renders it (the
 *    root's Outlet). Anywhere else -- a not-found caught by the root boundary
 *    after a render-time `notFound()` -- it falls back to the bare page rather
 *    than let the header's `useT()` / `useQuery()` crash the boundary.
 *
 *  Behaviour is unchanged: the 404 links home; the error screen retries
 *  (invalidate + reset) or reloads the home page. */

const PRIMARY_ACTION =
  "inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const SECONDARY_ACTION =
  "inline-flex min-h-[44px] items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function RootNotFound() {
  const { t, lang } = useTolerantT();
  const hasI18n = useHasI18n();
  const hasQueryClient = useContext(QueryClientContext) !== undefined;
  // The public chrome needs both providers; without them, the bare page.
  const framed = hasI18n && hasQueryClient;

  const content = (
    <div
      lang={lang}
      data-root-not-found
      className={`flex items-center justify-center bg-background px-4 ${
        framed ? "min-h-[60vh] py-16" : "min-h-screen"
      }`}
    >
      <div className="max-w-md text-center">
        <h1 className="text-foreground">
          <span className="block text-7xl font-bold">404</span>
          <span className="mt-4 block text-xl font-semibold">{t("root.notFound.title")}</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("root.notFound.body")}</p>
        <div className="mt-6">
          <Link to="/" className={PRIMARY_ACTION}>
            {t("root.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );

  return framed ? <SiteLayout>{content}</SiteLayout> : content;
}

export function RootError({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const { t, lang } = useTolerantT();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div
      lang={lang}
      data-root-error
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("root.error.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("root.error.body")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className={PRIMARY_ACTION}
          >
            {t("root.error.retry")}
          </button>
          {/* A plain anchor, on purpose: a full page load is the way out when
              the router itself is what failed. */}
          <a href="/" className={SECONDARY_ACTION}>
            {t("root.goHome")}
          </a>
        </div>
      </div>
    </div>
  );
}
