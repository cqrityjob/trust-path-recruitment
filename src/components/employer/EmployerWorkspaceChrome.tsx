import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, User as UserIcon } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
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

export type EmployerRole = "owner" | "admin" | "member";
export type EmployerStatus = "draft" | "pending" | "active" | "rejected" | "suspended" | "archived";

// Phase H3.2 — shared workspace chrome (navigation + org identity/status +
// account menu) reused by every /employer/$employerSlug/* page, so the
// employer experience reads as one coherent workspace rather than a set of
// disconnected pages — matching the brief's own "must feel as complete and
// intentional as My Career" goal.
//
// Purely presentational: each route that renders this component has
// already independently resolved and access-checked its own workspace
// data (the existing G2 "every route re-verifies, slug is never
// authorization" pattern, unchanged) — this component never performs its
// own authorization decision, it only displays what its caller already
// verified.
//
// Sign-out reuses the exact existing call from
// _authenticated.my-career.index.tsx (`supabase.auth.signOut()`) rather
// than reinventing auth logic, plus an explicit post-signout redirect
// (the My Career implementation doesn't redirect; here we do, since
// staying on an now-inaccessible employer page after sign-out would be a
// worse experience than on the public-facing My Career page).

export type EmployerNavSection = "overview" | "jobs" | "applications" | "settings";

export interface EmployerWorkspaceChromeProps {
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

const STATUS_EXPLANATION_KEY: Record<EmployerStatus, TranslationKey | null> = {
  active: "employer.status.active.body",
  pending: "employer.status.pending.body",
  draft: "employer.status.pending.body",
  rejected: "employer.status.rejected.body",
  suspended: "employer.status.suspended.body",
  archived: null,
};

export function EmployerWorkspaceChrome(props: EmployerWorkspaceChromeProps) {
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

  const navItems: Array<{
    key: EmployerNavSection;
    labelKey: TranslationKey;
    to: string;
    enabled: boolean;
  }> = [
    {
      key: "overview",
      labelKey: "employer.nav.overview",
      to: `/employer/${employerSlug}`,
      enabled: true,
    },
    {
      key: "jobs",
      labelKey: "employer.nav.jobs",
      to: `/employer/${employerSlug}/jobs`,
      enabled: true,
    },
    {
      key: "applications",
      labelKey: "employer.nav.applications",
      to: `/employer/${employerSlug}/applications`,
      enabled: true,
    },
    {
      key: "settings",
      labelKey: "employer.nav.settings",
      to: `/employer/${employerSlug}/settings`,
      enabled: true,
    },
  ];

  return (
    <div>
      <div className="border-b border-border bg-muted/20">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("employer.workspace.label")}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-semibold text-foreground">{employerName}</h1>
                <Badge variant={STATUS_BADGE_VARIANT[status]}>{t(STATUS_LABEL_KEY[status])}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("employer.shell.roleLabel")}: {t(`employer.role.${role}` as TranslationKey)}
              </p>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="max-w-[10rem] truncate">
                    {email ?? t("employer.accountMenu.account")}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
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
                <DropdownMenuItem
                  onClick={onSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("employer.accountMenu.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {STATUS_EXPLANATION_KEY[status] && (
            <p className="mt-3 text-sm text-muted-foreground">
              {t(STATUS_EXPLANATION_KEY[status]!)}
            </p>
          )}

          <nav
            className="mt-4 -mb-4 flex gap-1 overflow-x-auto"
            aria-label={t("employer.nav.ariaLabel")}
          >
            {navItems.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className={cn(
                  "flex-none whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  activeSection === item.key
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-10 pt-6 sm:px-6">{children}</div>
    </div>
  );
}
