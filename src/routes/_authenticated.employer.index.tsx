// Phase G2 — /employer index: feature-flag gate, then routes the caller
// to the right experience based on their *active* employer memberships
// (listMyEmployerWorkspaces — Phase G1 RLS-scoped, re-derived fresh on
// every load, never trusted from any client-cached/stored value):
//
//   0 workspaces  -> Phase H3.1: auto-redirect to /employer/onboarding
//                    (was a dead-end empty state pre-H3.1 — self-service
//                    company creation now lives on that dedicated page,
//                    not inline here — see the H3.1 reconciliation note
//                    below for why the inline form that briefly existed
//                    on this route was removed rather than kept)
//   1 workspace   -> auto-redirect straight into it, no unnecessary picker
//   2+ workspaces -> accessible picker (semantic <Link>s, keyboard-navigable)
//
// H3.1 reconciliation note: an inline "create your company" form
// (EmployerZeroState/EmployerOnboardingForm, calling
// createSelfServiceEmployer/create_employer_self_service) was briefly
// implemented directly on this route in parallel, independently of the
// approved candidate-employer-portal-spec-v1.md work. It is intentionally
// NOT kept here — the canonical zero-workspace experience is the fuller
// /employer/onboarding page (create-company form with duplicate detection,
// registration number, job title, plus the contact-CQrityjob guidance for
// an already-existing company), per the approved spec. The underlying
// create_employer_self_service()/employer_members_can_edit() database
// functions from that parallel work are left untouched (not dropped) in
// case other already-shipped code depends on them (see the H3.1
// implementation report for the full reconciliation record) — only this
// route's inline form was removed, in favour of the redirect below.
//
// Optional UX convenience: a last-visited employer slug in localStorage
// (set by the $employerSlug route on successful access) lets a
// multi-membership user skip the picker on return visits. It is never
// treated as authorization — it is only ever used as a candidate slug
// that must still appear in this load's fresh, RLS-scoped workspace
// list; if it doesn't (revoked, typo, tampered), it is silently ignored
// and the normal 0/1/2+ behaviour applies.
//
// The founder decision for this flag is stricter than jobsEnabled()'s
// own precedent: while VITE_EMPLOYER_PORTAL_ENABLED is false, this page
// never fetches or reveals any membership data at all, regardless of
// what the caller actually has.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { ensureMyEmployerCompanyFromSignup } from "@/lib/job-intelligence/employer-onboarding.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { LAST_EMPLOYER_SLUG_KEY } from "@/lib/job-intelligence/last-employer-slug";

export const Route = createFileRoute("/_authenticated/employer/")({
  ssr: false,
  component: EmployerIndexPage,
});

function EmployerIndexPage() {
  if (!employerPortalEnabled()) {
    return <EmployerComingSoon />;
  }
  return <EmployerWorkspacePicker />;
}

function EmployerComingSoon() {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section containerClassName="max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.comingSoon.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
        <div className="mt-6">
          <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
            {t("sca.report.backToMyCareer")}
          </Link>
        </div>
      </Section>
    </SiteLayout>
  );
}

function EmployerWorkspacePicker() {
  const { t } = useT();
  const navigate = useNavigate();
  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);

  const query = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => listWorkspaces(),
  });

  // The first authenticated visit after verification is where a registration
  // becomes an organisation an administrator can review. It runs once, before
  // any redirect decision, and is a no-op for everybody who already has a
  // workspace or who never named a company at signup.
  const ensureCompany = useServerFn(ensureMyEmployerCompanyFromSignup);
  const provision = useQuery({
    queryKey: ["employer", "ensure-company-from-signup"],
    queryFn: () => ensureCompany(),
    enabled: query.isSuccess && (query.data ?? []).length === 0,
    retry: false,
    staleTime: Infinity,
  });

  // A newly created organisation is not in the workspace list yet.
  const refetchWorkspaces = query.refetch;
  useEffect(() => {
    if (provision.data?.created) void refetchWorkspaces();
  }, [provision.data, refetchWorkspaces]);

  const workspaces = query.data ?? [];

  useEffect(() => {
    if (!query.isSuccess) return;

    if (workspaces.length === 0) {
      // Wait for provisioning to answer before deciding this person has no
      // company -- otherwise a fresh registration is bounced to the manual
      // onboarding form a moment before its organisation appears.
      if (provision.isLoading || provision.data?.created) return;
      navigate({ to: "/employer/onboarding", replace: true });
      return;
    }

    // Route by what the organisation actually is. Sending a pending or
    // rejected employer into the dashboard shows them a workspace where the
    // database refuses every real action -- a permissions failure dressed up
    // as a product.
    const active = workspaces.filter((w) => w.employerStatus === "active");
    if (active.length === 0) {
      navigate({ to: "/employer/pending", replace: true });
      return;
    }

    if (active.length === 1) {
      navigate({
        to: "/employer/$employerSlug",
        params: { employerSlug: active[0].employerSlug },
        replace: true,
      });
      return;
    }

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LAST_EMPLOYER_SLUG_KEY);
    } catch {
      /* ignore */
    }
    if (stored && active.some((w) => w.employerSlug === stored)) {
      navigate({ to: "/employer/$employerSlug", params: { employerSlug: stored }, replace: true });
    }
    // else: fall through and render the picker below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isSuccess, workspaces.length, provision.isLoading, provision.data]);

  if (query.isLoading) {
    return (
      <SiteLayout>
        <Section containerClassName="max-w-2xl">
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        </Section>
      </SiteLayout>
    );
  }

  if (query.isError) {
    return (
      <SiteLayout>
        <Section containerClassName="max-w-2xl">
          <p className="text-sm text-destructive">
            {(query.error as Error)?.message ?? t("employer.accessDenied.body")}
          </p>
          <div className="mt-6">
            <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
              {t("sca.report.backToMyCareer")}
            </Link>
          </div>
        </Section>
      </SiteLayout>
    );
  }

  // The picker offers workspaces this person can actually open. An
  // organisation still under review is not one of them -- listing it as a
  // clickable card would hand out the exact route the status check exists to
  // withhold, and the dashboard behind it refuses every real action anyway.
  const openable = workspaces.filter((w) => w.employerStatus === "active");

  // 0 and 1 openable workspaces both redirect via the effect above (0 ->
  // onboarding or the review page, 1 -> auto-select); a brief loading state
  // covers that instant for either case. 2+ renders the picker.
  if (openable.length <= 1) {
    return (
      <SiteLayout>
        <Section containerClassName="max-w-2xl">
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        </Section>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <Section containerClassName="max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">{t("employer.picker.heading")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.picker.body")}</p>

        <ul className="mt-6 space-y-3">
          {openable.map((w) => (
            <li key={w.employerId}>
              <Link
                to="/employer/$employerSlug"
                params={{ employerSlug: w.employerSlug }}
                className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-left transition-colors hover:border-accent/60 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {w.employerLogoUrl ? (
                  <img
                    src={w.employerLogoUrl}
                    alt=""
                    className="h-8 w-8 flex-none rounded object-contain"
                  />
                ) : (
                  <span
                    className="flex h-8 w-8 flex-none items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground"
                    aria-hidden="true"
                  >
                    {w.employerName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="text-sm font-medium text-foreground">{w.employerName}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
            {t("sca.report.backToMyCareer")}
          </Link>
        </div>
      </Section>
    </SiteLayout>
  );
}
