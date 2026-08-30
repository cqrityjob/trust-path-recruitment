// The account menu — identity, context switch, settings, sign out.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
//
// Until it was built, the application had no account menu and therefore
// nowhere at all to sign out: /my-career carried the only sign-out control
// in the entire authenticated product, as a row pinned to the bottom of the
// candidate dashboard. That row looked like an unfinished footer because it
// was doing chrome's job inside a page. So account concerns live here, in
// the header, on every authenticated page, once.
//
// ── IT IS NOW THE CONTEXT SWITCHER TOO ─────────────────────────────────
//
// One person may be a candidate, a Passport holder, an assessment
// participant AND a recruiter at one or more organisations. Those are
// CONTEXTS within one account, not separate accounts, so switching between
// them belongs to the account control rather than to a second front door.
// Each organisation is listed BY NAME: "Arbetsgivaryta" told somebody who
// belongs to two organisations nothing about which one they were about to
// open.
//
// ── THE SWITCHER GRANTS NOTHING ────────────────────────────────────────
//
// This is the load-bearing sentence and it is worth being exact about.
//
// The list is `listMyEmployerWorkspaces()` — that is, the rows row-level
// security actually returned for this caller. It is not a client-side role
// string, not a JWT claim, and not a cached list. Selecting an entry
// changes the ROUTE; /employer/$employerSlug then re-verifies membership
// itself, as it did before this control existed and would do if somebody
// typed the URL. An organisation id in a URL, in localStorage or in client
// state grants nothing.
//
// So there is no second copy of the access rule here to drift out of step
// with the database, and hiding a link has never been the boundary.
//
// A workspace that is still pending, or a read that failed, both render as
// "no context to switch to" — the switch appears when the answer arrives,
// rather than offering a door that may not open.

import { Link } from "@tanstack/react-router";
import { Building2, Check, ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/context";

/** One organisation this person actually belongs to, as the database
 *  returned it. Structurally a subset of `MyEmployerWorkspace` so the
 *  header can pass its query result straight through. */
export type AccountWorkspace = {
  readonly employerSlug: string;
  readonly employerName: string;
};

export type AccountIdentity = {
  /** Display name, or the email local-part when no name is set. May be "". */
  readonly name: string;
  readonly email: string;
  /** Active memberships the database returned. Empty for everybody else. */
  readonly workspaces: readonly AccountWorkspace[];
  /** Which context the current route is in, so the menu can show where the
   *  person already is instead of offering it as a destination. */
  readonly currentContext: "personal" | { readonly employerSlug: string };
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
  const inPersonal = identity.currentContext === "personal";
  const currentSlug =
    typeof identity.currentContext === "object" ? identity.currentContext.employerSlug : null;

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

      <DropdownMenuContent align="end" className="w-72">
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

        {/* ── Personal ───────────────────────────────────────────────── */}
        <DropdownMenuItem asChild>
          <Link to="/my-career" className="cursor-pointer">
            <UserRound className="mr-2 h-4 w-4" aria-hidden="true" />
            <span className="flex-1">{t("account.context.personal")}</span>
            {inPersonal && <Check className="ml-2 h-3.5 w-3.5 text-accent" aria-hidden="true" />}
          </Link>
        </DropdownMenuItem>

        {/* ── Organisations, by name ─────────────────────────────────── */}
        {identity.workspaces.length > 0 && (
          <>
            <DropdownMenuLabel className="pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("account.context.switchTo")}
            </DropdownMenuLabel>
            {identity.workspaces.map((workspace) => (
              <DropdownMenuItem key={workspace.employerSlug} asChild>
                <Link
                  to="/employer/$employerSlug"
                  params={{ employerSlug: workspace.employerSlug }}
                  className="cursor-pointer"
                >
                  <Building2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  <span className="flex-1 truncate">{workspace.employerName}</span>
                  {currentSlug === workspace.employerSlug && (
                    <Check className="ml-2 h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  )}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link to="/my-career/profile" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("account.settings")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={onSignOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("account.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
