import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BadgeCheck,
  BarChart3,
  Briefcase,
  Building2,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  Sparkles,
  MapPin,
  User as UserIcon,
  Users,
} from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/site/LanguageSwitcher";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// Employer OS Phase 1 — the employer workspace's own application shell:
// a persistent sidebar of the twelve Employer OS modules on desktop, a
// slide-in Sheet drawer on mobile, replacing the earlier horizontal tab
// bar (EmployerWorkspaceChrome). Deliberately does NOT wrap in the public
// SiteLayout (marketing header/footer) — the brief's own instruction is
// that the authenticated workspace "must feel like its own enterprise
// product" and that public site navigation stays outside the workspace,
// not inside it.
//
// Purely presentational, same as its predecessor: every route rendering
// this component has already independently resolved and access-checked
// its own workspace data (listMyEmployerWorkspaces()); this component
// never performs an authorization decision itself.

export type EmployerRole = "owner" | "admin" | "member";
export type EmployerStatus = "draft" | "pending" | "active" | "rejected" | "suspended" | "archived";

export type EmployerNavSection =
  | "command-center"
  | "jobs"
  | "applications"
  | "workforce"
  | "assessments"
  | "competencies"
  | "training"
  | "sites"
  | "reports"
  | "analytics"
  | "ask-cqrity"
  | "organisation"
  | "settings";

export interface EmployerAppShellProps {
  employerSlug: string;
  employerName: string;
  role: EmployerRole;
  status: EmployerStatus;
  activeSection: EmployerNavSection;
  hasMultipleWorkspaces: boolean;
  children: React.ReactNode;
}

const STATUS_BADGE_VARIANT: Record<
  EmployerStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  pending: "secondary",
  draft: "secondary",
  rejected: "destructive",
  suspended: "destructive",
  archived: "outline",
};

const STATUS_LABEL_KEY: Record<EmployerStatus, TranslationKey> = {
  active: "employer.status.active.badge",
  pending: "employer.status.pending.badge",
  draft: "employer.status.pending.badge",
  rejected: "employer.status.rejected.badge",
  suspended: "employer.status.suspended.badge",
  archived: "employer.status.archived.badge",
};

type NavLeaf = {
  key: EmployerNavSection;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  to:
    | "/employer/$employerSlug"
    | "/employer/$employerSlug/jobs"
    | "/employer/$employerSlug/applications"
    | "/employer/$employerSlug/workforce"
    | "/employer/$employerSlug/assessments"
    | "/employer/$employerSlug/competencies"
    | "/employer/$employerSlug/training"
    | "/employer/$employerSlug/sites"
    | "/employer/$employerSlug/reports"
    | "/employer/$employerSlug/analytics"
    | "/employer/$employerSlug/ask-cqrity"
    | "/employer/$employerSlug/settings"
    | "/employer/$employerSlug/preferences";
  children?: NavLeaf[];
};

function useNavItems(): NavLeaf[] {
  return [
    {
      key: "command-center",
      labelKey: "employer.nav.commandCenter",
      icon: LayoutDashboard,
      to: "/employer/$employerSlug",
    },
    {
      key: "jobs",
      labelKey: "employer.nav.recruitment",
      icon: Briefcase,
      to: "/employer/$employerSlug/jobs",
      children: [
        {
          key: "jobs",
          labelKey: "employer.nav.jobs",
          icon: Briefcase,
          to: "/employer/$employerSlug/jobs",
        },
        {
          key: "applications",
          labelKey: "employer.nav.applications",
          icon: Briefcase,
          to: "/employer/$employerSlug/applications",
        },
      ],
    },
    {
      key: "workforce",
      labelKey: "employer.nav.workforce",
      icon: Users,
      to: "/employer/$employerSlug/workforce",
    },
    {
      key: "assessments",
      labelKey: "employer.nav.assessments",
      icon: ClipboardCheck,
      to: "/employer/$employerSlug/assessments",
    },
    {
      key: "competencies",
      labelKey: "employer.nav.competencies",
      icon: BadgeCheck,
      to: "/employer/$employerSlug/competencies",
    },
    {
      key: "training",
      labelKey: "employer.nav.training",
      icon: GraduationCap,
      to: "/employer/$employerSlug/training",
    },
    {
      key: "sites",
      labelKey: "employer.nav.sites",
      icon: MapPin,
      to: "/employer/$employerSlug/sites",
    },
    {
      key: "reports",
      labelKey: "employer.nav.reports",
      icon: FileCheck2,
      to: "/employer/$employerSlug/reports",
    },
    {
      key: "analytics",
      labelKey: "employer.nav.analytics",
      icon: BarChart3,
      to: "/employer/$employerSlug/analytics",
    },
    {
      key: "ask-cqrity",
      labelKey: "employer.nav.askCqrity",
      icon: Sparkles,
      to: "/employer/$employerSlug/ask-cqrity",
    },
    {
      key: "organisation",
      labelKey: "employer.nav.organisation",
      icon: Building2,
      to: "/employer/$employerSlug/settings",
    },
    {
      key: "settings",
      labelKey: "employer.nav.settings",
      icon: Settings2,
      to: "/employer/$employerSlug/preferences",
    },
  ];
}

export function EmployerAppShell(props: EmployerAppShellProps) {
  const {
    employerSlug,
    employerName,
    role,
    status,
    activeSection,
    hasMultipleWorkspaces,
    children,
  } = props;
  const { t } = useT();
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = useNavItems();

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setEmail(data.session?.user?.email ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function onSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/candidate/login", replace: true });
  }

  function isActive(item: NavLeaf): boolean {
    if (item.key === activeSection) return true;
    return item.children?.some((c) => c.key === activeSection) ?? false;
  }

  return (
    <div className="flex min-h-screen bg-muted/10">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-background md:flex">
        <SidebarHeader employerName={employerName} status={status} role={role} t={t} />
        <nav
          className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4"
          aria-label={t("employer.nav.ariaLabel")}
        >
          <NavList
            items={navItems}
            employerSlug={employerSlug}
            activeSection={activeSection}
            isActive={isActive}
            t={t}
          />
        </nav>
        <SidebarFooter
          email={email}
          hasMultipleWorkspaces={hasMultipleWorkspaces}
          onSignOut={onSignOut}
          t={t}
        />
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label={t("employer.nav.openMenu")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground"
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">{t("employer.nav.ariaLabel")}</SheetTitle>
              <SheetDescription className="sr-only">{employerName}</SheetDescription>
              <div className="flex h-full flex-col">
                <SidebarHeader employerName={employerName} status={status} role={role} t={t} />
                <nav
                  className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4"
                  aria-label={t("employer.nav.ariaLabel")}
                >
                  <NavList
                    items={navItems}
                    employerSlug={employerSlug}
                    activeSection={activeSection}
                    isActive={isActive}
                    t={t}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </nav>
                <SidebarFooter
                  email={email}
                  hasMultipleWorkspaces={hasMultipleWorkspaces}
                  onSignOut={onSignOut}
                  t={t}
                />
              </div>
            </SheetContent>
          </Sheet>
          <p className="min-w-0 truncate text-sm font-semibold text-foreground">{employerName}</p>
          <LanguageSwitcher />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarHeader({
  employerName,
  status,
  role,
  t,
}: {
  employerName: string;
  status: EmployerStatus;
  role: EmployerRole;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="border-b border-border px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {t("employer.workspace.label")}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 truncate text-base font-semibold text-foreground">{employerName}</h1>
        <Badge variant={STATUS_BADGE_VARIANT[status]}>{t(STATUS_LABEL_KEY[status])}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("employer.shell.roleLabel")}: {t(`employer.role.${role}` as TranslationKey)}
      </p>
      <div className="mt-3 hidden md:block">
        <LanguageSwitcher />
      </div>
    </div>
  );
}

function NavList({
  items,
  employerSlug,
  activeSection,
  isActive,
  t,
  onNavigate,
}: {
  items: NavLeaf[];
  employerSlug: string;
  activeSection: EmployerNavSection;
  isActive: (item: NavLeaf) => boolean;
  t: (key: TranslationKey) => string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item);
        return (
          <li key={item.key}>
            <Link
              to={item.to}
              params={{ employerSlug }}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{t(item.labelKey)}</span>
            </Link>
            {item.children && (
              <ul className="ml-6 mt-0.5 space-y-0.5 border-l border-border pl-3">
                {item.children.map((child) => (
                  <li key={child.key}>
                    <Link
                      to={child.to}
                      params={{ employerSlug }}
                      onClick={onNavigate}
                      className={cn(
                        "block truncate rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors",
                        child.key === activeSection
                          ? "text-accent"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t(child.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SidebarFooter({
  email,
  hasMultipleWorkspaces,
  onSignOut,
  t,
}: {
  email: string | null;
  hasMultipleWorkspaces: boolean;
  onSignOut: () => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="border-t border-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-medium text-foreground hover:bg-muted/60"
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 truncate">{email ?? t("employer.accountMenu.account")}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {email && (
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/my-career">{t("employer.accountMenu.myCareer")}</Link>
          </DropdownMenuItem>
          {hasMultipleWorkspaces && (
            <DropdownMenuItem asChild>
              <Link to="/employer">{t("employer.switchOrg")}</Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSignOut} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("employer.accountMenu.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
