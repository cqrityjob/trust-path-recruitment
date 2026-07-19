// Phase G2 — /employer index: feature-flag gate, then routes the caller
// to the right experience based on their *active* employer memberships
// (listMyEmployerWorkspaces — Phase G1 RLS-scoped, re-derived fresh on
// every load, never trusted from any client-cached/stored value):
//
//   0 workspaces  -> neutral empty state, no self-registration CTA
//   1 workspace   -> auto-redirect straight into it, no unnecessary picker
//   2+ workspaces -> accessible picker (semantic <Link>s, keyboard-navigable)
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

  const workspaces = query.data ?? [];

  useEffect(() => {
    if (!query.isSuccess || workspaces.length === 0) return;

    if (workspaces.length === 1) {
      navigate({
        to: "/employer/$employerSlug",
        params: { employerSlug: workspaces[0].employerSlug },
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
    if (stored && workspaces.some((w) => w.employerSlug === stored)) {
      navigate({ to: "/employer/$employerSlug", params: { employerSlug: stored }, replace: true });
    }
    // else: fall through and render the picker below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isSuccess, workspaces.length]);

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

  if (workspaces.length === 0) {
    return (
      <SiteLayout>
        <Section containerClassName="max-w-2xl">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("employer.empty.heading")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("employer.empty.body")}</p>
          <div className="mt-6">
            <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
              {t("sca.report.backToMyCareer")}
            </Link>
          </div>
        </Section>
      </SiteLayout>
    );
  }

  // workspaces.length === 1 redirects via the effect above; a brief
  // loading state covers that instant. workspaces.length >= 2 (or a
  // stale/no stored slug on a multi-membership account) renders here.
  if (workspaces.length === 1) {
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
          {workspaces.map((w) => (
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
