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
import { SiteLayout } from "@/components/site/SiteLayout";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import {
  EMPLOYER_REGISTRATION_NOTICE_KEY,
  type EmployerRegistrationNotice,
} from "@/lib/job-intelligence/registration-notice-cache";

export const Route = createFileRoute("/_authenticated/employer/pending")({
  ssr: false,
  component: EmployerPendingPage,
  errorComponent: EmployerErrorState,
});

/** The three words this page must keep apart, and the order they happen in:
 *  the address was verified, the registration was RECEIVED, and approval has
 *  not happened yet. The steps are numbered so none of them can be read as
 *  the others. */
const NEXT_STEP_KEYS = [
  "employer.pending.step.received",
  "employer.pending.step.review",
  "employer.pending.step.activated",
] as const;

function EmployerPendingPage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);

  // What the confirmation email actually did, if this visit follows the
  // registration that sent it. Cache-only: nothing fetches this key, and a
  // reload legitimately clears it -- at which point the page says nothing
  // about email rather than repeating a claim it can no longer support.
  const noticeQuery = useQuery<EmployerRegistrationNotice | null>({
    queryKey: EMPLOYER_REGISTRATION_NOTICE_KEY,
    queryFn: async () => null,
    enabled: false,
    staleTime: Infinity,
  });
  const notice = noticeQuery.data ?? null;

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

  // Somebody who holds no membership at all is not waiting for anything, and
  // this page would otherwise tell them their organisation is under review --
  // a status invented for an organisation that does not exist. /employer owns
  // the 0/1/2+ decision; hand it back rather than answering it a second time
  // here. It never returns them, so there is no loop.
  const noMembership = query.isSuccess && workspaces.length === 0;
  useEffect(() => {
    if (noMembership) navigate({ to: "/employer", replace: true });
  }, [noMembership, navigate]);

  if (query.isLoading) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-xl px-4 py-16">
          <p className="text-sm text-muted-foreground">{t("employer.pending.checking")}</p>
        </div>
      </SiteLayout>
    );
  }

  // A failed read reached this page as "your organisation is under review",
  // with the company name and registration date silently absent -- the page
  // asserting a status it had not been able to look up. That is the same
  // untruth as showing a candidate "0 verified" when the claims query broke.
  // `errorComponent` does not catch it, because a useQuery error is a value,
  // not a throw. So it is handled here, as a value.
  if (query.isError) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-xl px-4 py-16">
          <span
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground"
            aria-hidden="true"
          >
            <ShieldX className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            {t("employer.statusUnknown.heading")}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("employer.statusUnknown.body")}
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
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
          </div>
        </div>
      </SiteLayout>
    );
  }

  // The redirect above is in flight. Rendering the review copy for this frame
  // would flash "your organisation is under review" at somebody who has no
  // organisation.
  if (noMembership) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-xl px-4 py-16">
          <p className="text-sm text-muted-foreground">{t("employer.pending.checking")}</p>
        </div>
      </SiteLayout>
    );
  }

  const org = rejected ?? unavailable ?? waiting ?? null;
  const state: "rejected" | "unavailable" | "waiting" = rejected
    ? "rejected"
    : unavailable
      ? "unavailable"
      : "waiting";

  return (
    <SiteLayout>
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

            {/* The steps, numbered. "Your address is verified" and "your
                company is approved" are different facts about different
                things, and a page that runs them together is how a
                verification email gets read as an approval. */}
            <div className="mt-6" data-testid="employer-pending-next-steps">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("employer.pending.nextSteps.heading")}
              </p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                {NEXT_STEP_KEYS.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ol>
            </div>

            {/* The email, said honestly or not said at all.
                `sent` means a provider ACCEPTED the message -- never that
                anybody received it, and the copy says exactly that. A send
                that did not happen says so, and points at the page that is
                authoritative regardless of mail: this one. */}
            {notice && (
              <p
                data-testid="employer-pending-email-outcome"
                className="mt-4 rounded-md border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-muted-foreground"
              >
                {t(
                  notice.applicant.status === "sent"
                    ? "employer.pending.email.sent"
                    : "employer.pending.email.notSent",
                )}
              </p>
            )}
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
              void supabase.auth.signOut().then(() => navigate({ to: "/login" }));
            }}
            className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            {t("employer.pending.signOut")}
          </button>
        </div>
      </div>
    </SiteLayout>
  );
}
