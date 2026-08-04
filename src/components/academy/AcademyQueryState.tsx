// The three states every Academy query can be in.
//
// ── THE BUG THIS REPLACES ─────────────────────────────────────────────
//
// Each Academy route rendered only two branches: `isLoading` and
// `data.length === 0`. There was no branch for `isError`.
//
// react-query's default is three retries with exponential backoff, so a failing
// call held `isLoading` true for several seconds -- the "Laddar…" the employer
// reported -- and then, once retries were exhausted, `isLoading` went false,
// `data` stayed undefined, and BOTH remaining branches were falsy. The page
// went blank with no explanation and no way forward.
//
// Rendering `children` only on real success is what makes that structurally
// impossible: there is no path where the component renders nothing.

import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { NoEvidenceState } from "@/components/academy/MaturityDisplay";
import { logAcademyError, type AcademyErrorKind } from "@/lib/security-competency/rpc-errors";

type QueryLike<T> = {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  data: T | undefined;
  isFetching: boolean;
  refetch: () => unknown;
};

const ERROR_TITLE: Record<AcademyErrorKind, TranslationKey> = {
  backend_unavailable: "academy.error.unavailableTitle",
  not_permitted: "academy.error.deniedTitle",
  request_failed: "academy.error.failedTitle",
};

const ERROR_BODY: Record<AcademyErrorKind, TranslationKey> = {
  backend_unavailable: "academy.error.unavailableBody",
  not_permitted: "academy.error.deniedBody",
  request_failed: "academy.error.failedBody",
};

/**
 * Renders loading, error or empty; renders `children` only on success.
 *
 * `surface` names the calling page in the developer log so a report of "it did
 * not load" can be traced without asking which page.
 */
export function AcademyQueryState<T>({
  query,
  surface,
  isEmpty,
  emptyTitle,
  emptyBody,
  children,
}: {
  query: QueryLike<T>;
  surface: string;
  isEmpty: (data: T) => boolean;
  emptyTitle: string;
  emptyBody: string;
  children: (data: T) => ReactNode;
}) {
  const { t } = useT();

  if (query.isLoading) {
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {t("employer.loading")}
      </p>
    );
  }

  if (query.isError || query.data === undefined) {
    // Logged here rather than in the routes, so every surface reports
    // identically and no route can forget to.
    const { kind } = logAcademyError(surface, query.error);
    // Retrying a missing RPC or a refused permission just fails again; the
    // control is offered only where it can actually help.
    const retryable = kind === "request_failed";

    return (
      <div
        role="alert"
        className="rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-6"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <AlertTriangle className="h-4 w-4 text-accent" aria-hidden="true" />
          {t(ERROR_TITLE[kind])}
        </p>
        <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
          {t(ERROR_BODY[kind])}
        </p>
        {retryable && (
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border bg-card px-4 text-[13px] font-medium text-foreground hover:bg-muted/60 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {query.isFetching ? t("academy.error.retrying") : t("academy.error.retry")}
          </button>
        )}
      </div>
    );
  }

  if (isEmpty(query.data)) {
    return <NoEvidenceState title={emptyTitle} body={emptyBody} />;
  }

  return <>{children(query.data)}</>;
}
