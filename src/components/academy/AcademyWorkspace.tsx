// The frame for both Utveckling areas: Tester and Kompetensutveckling.
//
// Every route in either area resolves the workspace the same way the rest of
// /employer/$employerSlug/* does — the slug is a lookup key only, re-verified
// through listMyEmployerWorkspaces() on every load. Centralised here so that a
// dozen routes cannot drift into a dozen slightly different access checks.
//
// ── TWO AREAS, ONE RESOLUTION PATH ────────────────────────────────────
//
// Tester and Kompetensutveckling are separate top-level destinations in the
// sidebar, and they answer different questions:
//
//   Tester              what structured assessment has this person completed,
//                       and what evidence did it produce?
//   Kompetensutveckling what development has this person been assigned,
//                       started or completed?
//
// They share this file because they share an access check, not because they
// are the same product. Each has its own tab strip and its own activeSection,
// so the sidebar always shows where you actually are.
//
// Utvecklingsprogram used to be the fifth tab under Tester. It rendered
// learning modules — training functionality living inside the assessment
// workspace — and it now lives under Kompetensutveckling, once.

import type { ReactNode } from "react";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  EmployerAppShell,
  type EmployerNavSection,
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

type Tab = {
  to: string;
  label: TranslationKey;
  /** Highlight this tab on its child routes too. Only Granskningar has any:
   *  reviewing one submission lives at .../reviews/$attemptId, and the tab
   *  going dark there told the reviewer they had left the workspace. */
  matchesChildren?: boolean;
};

const ASSESSMENT_TABS: Tab[] = [
  { to: "/employer/$employerSlug/assessments", label: "academy.nav.overview" },
  { to: "/employer/$employerSlug/assessments/library", label: "academy.nav.library" },
  { to: "/employer/$employerSlug/assessments/participants", label: "academy.nav.participants" },
  {
    to: "/employer/$employerSlug/assessments/reviews",
    label: "academy.nav.reviews",
    matchesChildren: true,
  },
];

const TRAINING_TABS: Tab[] = [
  { to: "/employer/$employerSlug/training", label: "academy.nav.overview" },
  { to: "/employer/$employerSlug/training/programmes", label: "training.nav.programmes" },
  { to: "/employer/$employerSlug/training/participants", label: "academy.nav.participants" },
];

/** Resolves the workspace, renders the shell and the assessment tabs, and
 *  hands the verified workspace to the page. */
export function AcademyPage({
  employerSlug,
  children,
}: {
  employerSlug: string;
  children: (ws: AcademyWorkspace) => ReactNode;
}) {
  return (
    <WorkspaceFrame employerSlug={employerSlug} section="assessments" tabs={ASSESSMENT_TABS}>
      {children}
    </WorkspaceFrame>
  );
}

/** The same frame for one person under Min personal.
 *
 *  Medarbetare > [Person] used to borrow AcademyPage, which meant clicking a
 *  colleague from the people list moved the sidebar highlight to Bedomningar
 *  and put the assessment tab bar above their name. The page is about a
 *  person, so it keeps the People section and shows no tab bar at all -- the
 *  way back is the link to the people list, which the page already has. */
export function WorkforcePage({
  employerSlug,
  children,
}: {
  employerSlug: string;
  children: (ws: AcademyWorkspace) => ReactNode;
}) {
  return (
    <WorkspaceFrame employerSlug={employerSlug} section="workforce" tabs={[]}>
      {children}
    </WorkspaceFrame>
  );
}

/** The same frame for one candidate under Ansokningar.
 *
 *  Candidate 360 is reached from the applications list and is about a person,
 *  so it keeps the Applications section highlighted and shows no tab bar --
 *  exactly as Medarbetare > [Person] does. It borrows this frame for the
 *  access check and nothing else: the slug is re-verified through
 *  listMyEmployerWorkspaces() here as on every other employer route. */
export function RecruitmentPage({
  employerSlug,
  children,
}: {
  employerSlug: string;
  children: (ws: AcademyWorkspace) => ReactNode;
}) {
  return (
    <WorkspaceFrame employerSlug={employerSlug} section="applications" tabs={[]}>
      {children}
    </WorkspaceFrame>
  );
}

/** The same frame for Kompetensutveckling. Same access check, different tabs,
 *  and activeSection="training" so the sidebar highlights the right entry. */
export function TrainingPage({
  employerSlug,
  children,
}: {
  employerSlug: string;
  children: (ws: AcademyWorkspace) => ReactNode;
}) {
  return (
    <WorkspaceFrame employerSlug={employerSlug} section="training" tabs={TRAINING_TABS}>
      {children}
    </WorkspaceFrame>
  );
}

function WorkspaceFrame({
  employerSlug,
  section,
  tabs,
  children,
}: {
  employerSlug: string;
  section: EmployerNavSection;
  tabs: Tab[];
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
      activeSection={section}
      hasMultipleWorkspaces={workspace.hasMultipleWorkspaces}
    >
      {tabs.length > 0 && <AcademyTabs employerSlug={workspace.employerSlug} tabs={tabs} />}
      {children(workspace)}
    </EmployerAppShell>
  );
}

export function AcademyTabs({
  employerSlug,
  tabs = ASSESSMENT_TABS,
}: {
  employerSlug: string;
  tabs?: Tab[];
}) {
  const { t } = useT();
  const matchRoute = useMatchRoute();
  return (
    <nav
      aria-label={t("academy.nav.aria")}
      className="no-print mb-8 -mx-1 overflow-x-auto border-b border-border"
    >
      <ul className="flex min-w-max gap-1 px-1">
        {tabs.map((tab) => {
          const active = Boolean(
            matchRoute({
              to: tab.to,
              params: { employerSlug },
              fuzzy: tab.matchesChildren === true,
            }),
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
