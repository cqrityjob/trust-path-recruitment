import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  BarChart3,
  Briefcase,
  Building2,
  Check,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
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
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
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
  | "interviewIntelligence"
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
  /** A three-zone work surface needs more room than a form or a list. The
   *  default reading width stays 6xl everywhere else, so widening one screen
   *  never widens the rest of the portal. */
  wide?: boolean;
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
  | "/employer/$employerSlug/interview-intelligence"
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
// ── WHAT A CUSTOMER SEES ────────────────────────────────────────────────
//
// Navigation lists what actually works. Six items were removed from the
// customer sidebar because they render an intentional "controlled future
// state" panel and have no backend behind them:
//
//   Platser & risk, Rapporter & regelefterlevnad, Analys,
//   Kompetenser & certifikat  -- all EmployerModuleComingSoon shells
//   Inställningar (preferences) -- likewise; the working organisation
//                                  settings live on /settings, which stays
//   Fråga CQrity              -- promises an assistant and delivers four
//                                  navigation shortcuts
//
// The ROUTES are deliberately left in place: an existing bookmark still
// resolves to an honest page rather than a 404. What changes is that a
// prospective customer is no longer invited to click into an empty room.
// Restoring one is a one-line edit here once it has something behind it.
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
      {
        key: "assessments",
        labelKey: "employer.nav.assessments",
        icon: ClipboardCheck,
        to: "/employer/$employerSlug/assessments",
      },
      // Interview Intelligence. Added only now that the landing route, the
      // permission checks and the whole journey behind it actually work --
      // a navigation item that leads to a "coming soon" page is worse than
      // no item at all.
      {
        key: "interviewIntelligence",
        icon: MessagesSquare,
        labelKey: "employer.nav.interviewIntelligence",
        to: "/employer/$employerSlug/interview-intelligence",
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
        key: "organisation",
        labelKey: "employer.nav.organisation",
        icon: Building2,
        to: "/employer/$employerSlug/settings",
      },
    ],
  },
];

export function EmployerAppShell(props: EmployerAppShellProps) {
  const {
    employerSlug,
    employerName,
    role,
    status,
    activeSection,
    hasMultipleWorkspaces,
    wide = false,
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
    navigate({ to: "/login", replace: true });
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
          currentSlug={employerSlug}
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
                  currentSlug={employerSlug}
                  onSignOut={onSignOut}
                  t={t}
                />
              </div>
            </SheetContent>
          </Sheet>
          <p className="min-w-0 truncate text-sm font-semibold text-foreground">{employerName}</p>
          <LanguageSwitcher />
        </header>

        <main
          className={
            wide
              ? "mx-auto w-full max-w-[96rem] flex-1 px-4 py-6 sm:px-6 sm:py-8"
              : "mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8"
          }
        >
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
        {/* Not an h1. This is the workspace the user is inside, shown in the
            sidebar chrome; the page's own subject -- a candidate, a job, a
            report -- is the document heading. Two h1s on every employer page
            gave screen-reader users two competing answers to "what is this
            page about", and the sidebar always won because it comes first. */}
        <p className="min-w-0 truncate text-base font-semibold text-foreground">{employerName}</p>
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

/** The account menu inside a workspace.
 *
 *  -- WHY IT LISTS ORGANISATIONS BY NAME --------------------------------
 *
 *  It used to offer "Min karriar" and, for somebody in more than one
 *  organisation, a generic "switch organisation" link back to /employer --
 *  a router page, not a destination. Meanwhile the personal shell's account
 *  menu listed every organisation by name with a tick on the current one.
 *  Two menus, one account, two different stories about what a context is.
 *
 *  So this reads the same list, from the same query key, and shows the same
 *  three things: Personal, each organisation by name, sign out. Same
 *  contexts, same words, whichever side of the product you are standing on.
 *
 *  -- WHY IT FETCHES RATHER THAN TAKES A PROP ---------------------------
 *
 *  Threading the list through ~30 call sites to reach one dropdown would be
 *  a large diff for a small control, and every one of those sites already
 *  computes `hasMultipleWorkspaces` from this exact query. Reusing the key
 *  makes this a cache hit rather than a request.
 *
 *  It grants nothing. The list is what row-level security returned;
 *  selecting an entry changes the route, and /employer/$employerSlug
 *  re-verifies membership itself exactly as it did before.
 */
function SidebarFooter({
  email,
  currentSlug,
  onSignOut,
  t,
}: {
  email: string | null;
  currentSlug: string;
  onSignOut: () => void;
  t: (key: TranslationKey) => string;
}) {
  const fetchWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const workspaces = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => fetchWorkspaces(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const mine = workspaces.data ?? [];

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
            <Link to="/my-career">
              <UserIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("account.context.personal")}
            </Link>
          </DropdownMenuItem>

          {mine.length > 0 && (
            <>
              <DropdownMenuLabel className="pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("account.context.switchTo")}
              </DropdownMenuLabel>
              {mine.map((workspace) => (
                <DropdownMenuItem key={workspace.employerSlug} asChild>
                  <Link
                    to="/employer/$employerSlug"
                    params={{ employerSlug: workspace.employerSlug }}
                  >
                    <Building2 className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1 truncate">{workspace.employerName}</span>
                    {workspace.employerSlug === currentSlug && (
                      <Check className="ml-2 h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    )}
                  </Link>
                </DropdownMenuItem>
              ))}
            </>
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
