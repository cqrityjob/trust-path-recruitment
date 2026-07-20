// Phase H3.3 — shared admin chrome (navigation + pending-count badge +
// account menu) reused by every /admin/* page, mirroring the exact
// pattern already established for the employer workspace
// (EmployerWorkspaceChrome.tsx): purely presentational, never performs
// its own authorization decision -- each route that renders this has
// already independently verified admin access via _authenticated.admin.tsx.
//
// Sign-out reuses the same supabase.auth.signOut() call already used
// throughout the app, with an explicit redirect to /admin/login (staying
// on a now-inaccessible admin page after sign-out would be a worse
// experience).

import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { adminCountPendingEmployers } from "@/lib/job-intelligence/admin-employer-moderation.functions";

export type AdminNavSection = "overview" | "employers" | "jobs";

export interface AdminShellChromeProps {
  activeSection: AdminNavSection;
  children: React.ReactNode;
}

export function AdminShellChrome({ activeSection, children }: AdminShellChromeProps) {
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

  const pendingCountFn = useServerFn(adminCountPendingEmployers);
  const pendingCountQuery = useQuery({
    queryKey: ["admin", "pending-employers-count"],
    queryFn: () => pendingCountFn(),
    staleTime: 30_000,
  });
  const pendingCount = pendingCountQuery.data ?? 0;

  async function onSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  const navItems: Array<{ key: AdminNavSection; labelKey: TranslationKey; to: string }> = [
    { key: "overview", labelKey: "admin.nav.overview", to: "/admin" },
    { key: "employers", labelKey: "admin.nav.employers", to: "/admin/employers" },
    { key: "jobs", labelKey: "admin.nav.jobs", to: "/admin/jobs" },
  ];

  return (
    <div>
      <div className="border-b border-border bg-muted/20">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("admin.shell.title")}
              </p>
              <h1 className="mt-1 truncate text-lg font-semibold text-foreground">
                {t("admin.shell.subtitle")}
              </h1>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="max-w-[10rem] truncate">
                    {email ?? t("admin.accountMenu.account")}
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
                  <Link to="/my-career">{t("admin.accountMenu.myCareer")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/employer">{t("admin.accountMenu.employerPortal")}</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("admin.accountMenu.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <nav
            className="mt-4 -mb-4 flex gap-1 overflow-x-auto"
            aria-label={t("admin.shell.title")}
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
                {item.key === "employers" && pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {pendingCount}
                  </Badge>
                )}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6">{children}</div>
    </div>
  );
}
