// Where an employer waits while their registration is reviewed.
//
// Before this page existed, a person who registered a company was sent
// straight into the employer dashboard. The organisation is created as
// `pending`, and roughly thirty RLS policies require
// employer_is_active_status() -- so the dashboard loaded, and then every
// meaningful action quietly refused. That reads as a broken product rather
// than as a review in progress.
//
// The page states the position plainly and offers nothing it cannot deliver.
// It is not a gate: the gate is in the database, where it belongs. This is the
// honest account of why the workspace is not open yet.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { Clock, RefreshCw, ShieldX } from "lucide-react";
import { useT } from "@/i18n/context";
import { supabase } from "@/integrations/supabase/client";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";

export const Route = createFileRoute("/_authenticated/employer/pending")({
  ssr: false,
  component: EmployerPendingPage,
  errorComponent: EmployerErrorState,
});

function EmployerPendingPage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);

  // Approval happens somewhere else, in someone else's browser. Without a
  // poll, the person sitting on this page would keep reading that they are
  // waiting for as long as they left the tab open -- and would only discover
  // otherwise by signing out and back in. Twelve seconds is frequent enough to
  // feel immediate and cheap enough to leave running; it stops the moment an
  // active workspace appears, which is also the moment this page redirects.
  const query = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => listWorkspaces(),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((w) => w.employerStatus === "active") ? false : 12_000,
    refetchOnWindowFocus: true,
  });

  const workspaces = query.data ?? [];
  const active = workspaces.find((w) => w.employerStatus === "active");
  const rejected = workspaces.find((w) => w.employerStatus === "rejected");
  // Suspended and archived are not refusals of a registration -- the
  // organisation was approved once and is closed now. Saying "your
  // registration was not approved" would be untrue.
  const unavailable = workspaces.find(
    (w) => w.employerStatus === "suspended" || w.employerStatus === "archived",
  );
  const waiting = workspaces.find(
    (w) => w.employerStatus === "pending" || w.employerStatus === "draft",
  );

  // Approved while this page was open: send them where they now belong rather
  // than leaving them reading that they are still waiting.
  useEffect(() => {
    if (active) {
      navigate({
        to: "/employer/$employerSlug",
        params: { employerSlug: active.employerSlug },
        replace: true,
      });
    }
  }, [active, navigate]);

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.pending.checking")}</p>
      </div>
    );
  }

  const org = rejected ?? unavailable ?? waiting ?? null;
  const state: "rejected" | "unavailable" | "waiting" = rejected
    ? "rejected"
    : unavailable
      ? "unavailable"
      : "waiting";

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <span
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        {state === "waiting" ? <Clock className="h-5 w-5" /> : <ShieldX className="h-5 w-5" />}
      </span>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
        {t(
          state === "rejected"
            ? "employer.rejected.heading"
            : state === "unavailable"
              ? "employer.unavailable.heading"
              : "employer.pending.heading",
        )}
      </h1>

      {state === "rejected" ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("employer.rejected.body")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("employer.rejected.contact")}
          </p>
        </>
      ) : state === "unavailable" ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("employer.unavailable.body")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("employer.rejected.contact")}
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("employer.pending.thanks")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("employer.pending.body")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("employer.pending.access")}
          </p>
        </>
      )}

      {/* What we hold about them, so the page is a receipt as well as a
          message. No status vocabulary from the database -- the heading
          already says where the registration stands. */}
      {org && (
        <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-border p-4 text-sm">
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("employer.pending.company")}
            </dt>
            <dd className="mt-0.5 truncate font-medium text-foreground">{org.employerName}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("employer.pending.registered")}
            </dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {org.employerCreatedAt
                ? new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "sv-SE").format(
                    new Date(org.employerCreatedAt),
                  )
                : "—"}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        {state === "waiting" && (
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-60"
          >
            <RefreshCw
              className={"h-3.5 w-3.5" + (query.isFetching ? " animate-spin" : "")}
              aria-hidden="true"
            />
            {t("employer.pending.checkStatus")}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            void supabase.auth.signOut().then(() => navigate({ to: "/employer/login" }));
          }}
          className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          {t("employer.pending.signOut")}
        </button>
      </div>
    </div>
  );
}
