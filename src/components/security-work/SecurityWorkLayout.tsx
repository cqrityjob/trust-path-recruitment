import { useEffect, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  ClipboardList,
  FileText,
  ListChecks,
  LayoutDashboard,
  Menu,
  Radio,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { AccountMenu } from "@/components/site/AccountMenu";
import { LanguageSwitcher } from "@/components/site/LanguageSwitcher";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { countMyReviewQueue } from "@/lib/security-competency/academy-employer.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { SecurityIdentityProvider, useSecurityIdentity, useSecurityWorkspace } from "./context";
import { SafetyNotice, WorkButton } from "./ui";

function SecurityTopBar() {
  const identity = useSecurityIdentity();
  const { t } = useT();
  const getEmployers = useServerFn(listMyEmployerWorkspaces);
  const getReviews = useServerFn(countMyReviewQueue);
  // These existing reads only populate the account's navigation. Security
  // Work authorization never consumes an employer or reviewer relationship.
  const employers = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => getEmployers(),
    enabled: employerPortalEnabled(),
    retry: 1,
  });
  const reviews = useQuery({
    queryKey: ["academy", "review-queue-count"],
    queryFn: () => getReviews(),
    retry: false,
  });
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-20 max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          to="/security-work"
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ShieldCheck className="size-6 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate font-display text-sm font-semibold sm:text-base">
              {t("sw.name")}
            </span>
            <span className="hidden text-[11px] text-muted-foreground sm:block">
              {t("sw.product")}
            </span>
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher />
          <AccountMenu
            identity={{
              name: identity.name,
              email: identity.email,
              currentContext: "security-work",
              workspaces: employers.data ?? [],
              reviewQueueCount: reviews.data ?? 0,
            }}
            onSignOut={() => void supabase.auth.signOut()}
          />
        </div>
      </div>
    </header>
  );
}

export function SecurityWorkRoot() {
  return (
    <SecurityIdentityProvider>
      <div className="min-h-screen bg-background" data-security-work>
        <SecurityTopBar />
        <Outlet />
      </div>
    </SecurityIdentityProvider>
  );
}

export function SecurityWorkLayout({ children }: { children?: ReactNode }) {
  const { workspace, canEdit } = useSecurityWorkspace();
  const { t, lang } = useT();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [location.pathname]);
  const items = [
    {
      to: "/security-work/$workspaceId",
      label: t("sw.nav.overview"),
      icon: LayoutDashboard,
      path: `/security-work/${workspace.id}`,
    },
    {
      to: "/security-work/$workspaceId/monitoring",
      label: t("sw.nav.monitoring"),
      icon: Radio,
      path: `/security-work/${workspace.id}/monitoring`,
    },
    {
      to: "/security-work/$workspaceId/analyses",
      label: lang === "sv" ? "Analyser" : "Analyses",
      icon: ClipboardList,
      path: `/security-work/${workspace.id}/analyses`,
    },
    {
      to: "/security-work/$workspaceId/risks",
      label: lang === "sv" ? "Risker & åtgärder" : "Risks & actions",
      icon: ListChecks,
      path: `/security-work/${workspace.id}/risks`,
    },
    {
      to: "/security-work/$workspaceId/reports",
      label: lang === "sv" ? "Rapporter" : "Reports",
      icon: FileText,
      path: `/security-work/${workspace.id}/reports`,
    },
    {
      to: "/security-work/$workspaceId/sources",
      label: lang === "sv" ? "Underlag" : "Evidence",
      icon: BookOpen,
      path: `/security-work/${workspace.id}/sources`,
    },
    {
      to: "/security-work/$workspaceId/settings",
      label: t("sw.nav.settings"),
      icon: Settings2,
      path: `/security-work/${workspace.id}/settings`,
    },
  ] as const;
  const navigation = (
    <nav aria-label={t("sw.nav.label")} className="space-y-1">
      {items.map((item, index) => {
        const active =
          index === 0
            ? location.pathname.replace(/\/$/, "") === item.path
            : location.pathname.startsWith(item.path);
        return (
          <Link
            key={item.to}
            to={item.to}
            params={{ workspaceId: workspace.id }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 min-w-11 items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div className="mx-auto max-w-[1600px] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="border-b border-border px-4 py-4 lg:min-h-[calc(100dvh-5rem)] lg:border-r lg:border-b-0 lg:px-5 lg:py-7">
        <div className="flex items-center justify-between gap-3 lg:block">
          <div className="min-w-0 lg:mb-6">
            <p className="truncate text-sm font-semibold" title={workspace.name}>
              {workspace.name}
            </p>
            <Link
              to="/security-work"
              className="inline-flex min-h-11 items-center rounded text-xs text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t("sw.switch")}
            </Link>
          </div>
          <WorkButton
            variant="outline"
            className="p-3 lg:hidden"
            aria-label={open ? t("sw.nav.close") : t("sw.nav.menu")}
            aria-expanded={open}
            aria-controls="security-work-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </WorkButton>
        </div>
        <div
          id="security-work-navigation"
          className={cn(open ? "block" : "hidden", "lg:block")}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          {navigation}
        </div>
        <p className="mt-5 hidden text-xs leading-relaxed text-muted-foreground lg:block">
          {t("sw.manual.body")}
        </p>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-9 lg:py-9">
        <div className="mx-auto max-w-6xl space-y-7">
          {!canEdit && (
            <p role="status" className="rounded-lg border border-border bg-secondary p-4 text-sm">
              {t("sw.viewer")}
            </p>
          )}
          {children ?? <Outlet />}
          <SafetyNotice />
        </div>
      </main>
    </div>
  );
}
