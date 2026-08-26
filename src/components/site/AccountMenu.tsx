// The signed-in account menu — identity, workspace switch, sign out.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
//
// Until now the application had no account menu, and therefore nowhere at all
// to sign out. /my-career carried the only sign-out control in the entire
// authenticated product, as a row pinned to the bottom of the candidate
// dashboard — name, email, "Arbetsgivaryta", "Logga ut" — and the route said
// so in a comment: it was kept there because removing it would have stranded
// every candidate on the page.
//
// That is the actual defect. The row looked like an unfinished footer because
// it was doing chrome's job inside a page. Deleting it without building this
// first would have removed the product's only way out.
//
// So account concerns move to where account concerns belong: the header, on
// every authenticated page, once.
//
// ── WHAT IS GATED, AND WHAT IS NOT ─────────────────────────────────────
//
// "Arbetsgivaryta" is the workspace SWITCH: it appears only for someone who
// actually holds an active employer membership, because it is an entry into a
// workspace rather than an invitation to acquire one. The gate is the data —
// listMyEmployerWorkspaces returns what RLS lets this person see — not a
// client-side role string, so there is no second copy of the rule to drift
// from the one the database enforces.
//
// The header's existing "Arbetsgivarportal" entries are deliberately NOT
// touched. Those are the portal DOOR, shown to everyone by design (see
// scripts/header-entry-check.ts, which pins the two-door distinction); this is
// the switch into a workspace you already belong to. Different question,
// different audience.
//
// Authorisation is unchanged either way: /employer is behind _authenticated
// and its own membership checks. Hiding a link has never been the boundary.

import { Link } from "@tanstack/react-router";
import { Building2, ChevronDown, LogOut, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/context";

export type AccountIdentity = {
  /** Display name, or the email local-part when no name is set. May be "". */
  readonly name: string;
  readonly email: string;
  /** True only for an active employer membership the database returned. */
  readonly hasEmployerWorkspace: boolean;
};

/** First letter of the name, for the trigger. Falls back to the email so the
 *  control is never an empty circle. */
function initial(id: AccountIdentity): string {
  const source = id.name.trim() || id.email.trim();
  return source ? source[0]!.toUpperCase() : "?";
}

export function AccountMenu({
  identity,
  onSignOut,
}: {
  identity: AccountIdentity;
  onSignOut: () => void;
}) {
  const { t } = useT();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/40 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={t("account.menu.label")}
      >
        <span
          aria-hidden="true"
          className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
        >
          {initial(identity)}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        {/* Identity first: a menu that can sign you out has to say who it
            would be signing out. */}
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-foreground">
            {identity.name || identity.email}
          </span>
          {identity.email && identity.name ? (
            <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
              {identity.email}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link to="/my-career" className="cursor-pointer">
            <UserRound className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("nav.my_career")}
          </Link>
        </DropdownMenuItem>

        {identity.hasEmployerWorkspace && (
          <DropdownMenuItem asChild>
            <Link to="/employer" className="cursor-pointer">
              <Building2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("employer.workspace.label")}
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("account.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
