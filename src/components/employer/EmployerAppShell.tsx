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
  Inbox,
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
// a persistent sidebar on desktop, a slide-in Sheet drawer on mobile,
// replacing the earlier horizontal tab bar (EmployerWorkspaceChrome).
//
// The sidebar is grouped by what a manager comes here to do -- recruit,
// manage their people, test people, develop people, then administer the
// organisation -- rather than listing the underlying product modules
// flat. Fråga CQrity sits apart at the bottom: it is a utility, not one
// of the daily workflows. Deliberately does NOT wrap in the public
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
  | "overview"
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

type NavTarget =
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

type NavItem = {
  key: EmployerNavSection;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  to: NavTarget;
};

type NavGroup = {
  key: string;
  /** Every group is labelled except the first: a heading reading
   *  "Översikt" directly above a single item reading "Översikt" is pure
   *  noise, so the landing page is simply pinned to the top instead. */
  labelKey?: TranslationKey;
  items: NavItem[];
};

// Routes and permissions are unchanged from the flat version of this
// navigation -- only the grouping and the labels differ.
const NAV_GROUPS: NavGroup[] = [
  {
    key: "overview",
    items: [
      {
        key: "overview",
        labelKey: "employer.nav.overview",
        icon: LayoutDashboard,
        to: "/employer/$employerSlug",
      },
    ],
  },
  {
    key: "recruitment",
    labelKey: "employer.nav.group.recruitment",
    items: [
      {
        key: "jobs",
        labelKey: "employer.nav.jobs",
        icon: Briefcase,
        to: "/employer/$employerSlug/jobs",
      },
      {
        key: "applications",
        labelKey: "employer.nav.applications",
        icon: Inbox,
        to: "/employer/$employerSlug/applications",
      },
    ],
  },
  {
    key: "people",
    labelKey: "employer.nav.group.people",
    items: [
      {
        key: "workforce",
        labelKey: "employer.nav.workforce",
        icon: Users,
        to: "/employer/$employerSlug/workforce",
      },
      {
        key: "competencies",
        labelKey: "employer.nav.competencies",
        icon: BadgeCheck,
        to: "/employer/$employerSlug/competencies",
      },
    ],
  },
  {
    key: "development",
    labelKey: "employer.nav.group.development",
    items: [
      {
        key: "assessments",
        labelKey: "employer.nav.assessments",
        icon: ClipboardCheck,
        to: "/employer/$employerSlug/assessments",
      },
      {
        key: "training",
        labelKey: "employer.nav.training",
        icon: GraduationCap,
        to: "/employer/$employerSlug/training",
      },
    ],
  },
  {
    key: "organisation",
    labelKey: "employer.nav.group.organisation",
    items: [
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
    ],
  },
];

// Kept out of the groups on purpose: a help/utility capability, not one
// of the four daily workflows, so it sits alone at the foot of the list.
const ASK_CQRITY_ITEM: NavItem = {
  key: "ask-cqrity",
  labelKey: "employer.nav.askCqrity",
  icon: Sparkles,
  to: "/employer/$employerSlug/ask-cqrity",
};

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

  return (
    <div className="flex min-h-screen bg-muted/10">
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-border bg-background md:flex">
        <SidebarHeader employerName={employerName} status={status} role={role} t={t} />
        <nav
          className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4"
          aria-label={t("employer.nav.ariaLabel")}
        >
          <NavGroups employerSlug={employerSlug} activeSection={activeSection} t={t} />
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
        <header className="no-print flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 md:hidden">
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
                  className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4"
                  aria-label={t("employer.nav.ariaLabel")}
                >
                  <NavGroups
                    employerSlug={employerSlug}
                    activeSection={activeSection}
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

function NavGroups({
  employerSlug,
  activeSection,
  t,
  onNavigate,
}: {
  employerSlug: string;
  activeSection: EmployerNavSection;
  t: (key: TranslationKey) => string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <div key={group.key}>
          {group.labelKey && (
            <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {t(group.labelKey)}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.key}>
                <NavLink
                  item={item}
                  employerSlug={employerSlug}
                  active={item.key === activeSection}
                  t={t}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="mt-auto border-t border-border pt-3">
        <ul>
          <li>
            <NavLink
              item={ASK_CQRITY_ITEM}
              employerSlug={employerSlug}
              active={ASK_CQRITY_ITEM.key === activeSection}
              t={t}
              onNavigate={onNavigate}
            />
          </li>
        </ul>
      </div>
    </>
  );
}

function NavLink({
  item,
  employerSlug,
  active,
  t,
  onNavigate,
}: {
  item: NavItem;
  employerSlug: string;
  active: boolean;
  t: (key: TranslationKey) => string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
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
      {/* `truncate` is visual only — the full label is still in the DOM
          for screen readers, but a sighted user reading
          "Kompetenser & certif…" has no way to finish the sentence.
          A native title costs no layout and works in both languages,
          where the Swedish labels are the longer ones. */}
      <span className="min-w-0 truncate" title={t(item.labelKey)}>
        {t(item.labelKey)}
      </span>
    </Link>
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
