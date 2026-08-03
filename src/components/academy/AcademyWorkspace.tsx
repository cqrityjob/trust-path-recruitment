// The Assessment Center frame.
//
// Every Academy route resolves the workspace the same way the rest of
// /employer/$employerSlug/* does — the slug is a lookup key only, re-verified
// through listMyEmployerWorkspaces() on every load. Centralised here so that
// eight routes cannot drift into eight slightly different access checks.
//
// The sub-navigation is a tab strip INSIDE the existing Assessments section,
// not a new entry in the global sidebar. Assessment Center stays one module.

import type { ReactNode } from "react";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  EmployerAppShell,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerAppShell";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { cn } from "@/lib/utils";

export type AcademyWorkspace = {
  employerId: string;
  employerSlug: string;
  employerName: string;
  role: EmployerRole;
  status: EmployerStatus;
  hasMultipleWorkspaces: boolean;
};

const TABS: { to: string; label: TranslationKey }[] = [
  { to: "/employer/$employerSlug/assessments", label: "academy.nav.overview" },
  { to: "/employer/$employerSlug/assessments/library", label: "academy.nav.library" },
  { to: "/employer/$employerSlug/assessments/participants", label: "academy.nav.participants" },
  { to: "/employer/$employerSlug/assessments/reviews", label: "academy.nav.reviews" },
  { to: "/employer/$employerSlug/assessments/programmes", label: "academy.nav.programmes" },
];

/** Resolves the workspace, renders the shell and the Assessment Center tabs,
 *  and hands the verified workspace to the page. */
export function AcademyPage({
  employerSlug,
  children,
}: {
  employerSlug: string;
  children: (ws: AcademyWorkspace) => ReactNode;
}) {
  const { t } = useT();
  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const workspacesQuery = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => listWorkspaces(),
    enabled: employerPortalEnabled(),
  });

  if (!employerPortalEnabled()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.comingSoon.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
      </div>
    );
  }

  if (workspacesQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }

  const ws = workspacesQuery.data?.find((w) => w.employerSlug === employerSlug);
  if (workspacesQuery.isError || !ws) {
    return <EmployerAccessDenied workspaces={workspacesQuery.data} />;
  }

  const workspace: AcademyWorkspace = {
    employerId: ws.employerId,
    employerSlug: ws.employerSlug,
    employerName: ws.employerName,
    role: ws.role,
    status: ws.employerStatus,
    hasMultipleWorkspaces: (workspacesQuery.data?.length ?? 0) > 1,
  };

  return (
    <EmployerAppShell
      employerSlug={workspace.employerSlug}
      employerName={workspace.employerName}
      role={workspace.role}
      status={workspace.status}
      activeSection="assessments"
      hasMultipleWorkspaces={workspace.hasMultipleWorkspaces}
    >
      <AcademyTabs employerSlug={workspace.employerSlug} />
      {children(workspace)}
    </EmployerAppShell>
  );
}

export function AcademyTabs({ employerSlug }: { employerSlug: string }) {
  const { t } = useT();
  const matchRoute = useMatchRoute();
  return (
    <nav
      aria-label={t("academy.nav.aria")}
      className="mb-8 -mx-1 overflow-x-auto border-b border-border"
    >
      <ul className="flex min-w-max gap-1 px-1">
        {TABS.map((tab) => {
          const active = Boolean(
            matchRoute({ to: tab.to, params: { employerSlug }, fuzzy: false }),
          );
          return (
            <li key={tab.to}>
              <Link
                to={tab.to}
                params={{ employerSlug }}
                className={cn(
                  "-mb-px block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                {t(tab.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Page heading used across the Academy areas, so hierarchy stays consistent. */
export function AcademyHeading({
  title,
  lede,
  action,
}: {
  title: string;
  lede?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1
          className="text-[1.5rem] font-semibold leading-tight tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h1>
        {lede && (
          <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">{lede}</p>
        )}
      </div>
      {action}
    </header>
  );
}
