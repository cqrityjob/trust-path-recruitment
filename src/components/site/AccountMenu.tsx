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
// A read that failed renders as "no context to switch to" — the switch
// appears when the answer arrives, rather than offering a door that may not
// open.
//
// ── AN ORGANISATION UNDER REVIEW IS STILL A CONTEXT ────────────────────
//
// It did not used to be. This comment claimed a pending organisation read
// as "no context to switch to"; the code below never filtered on status, so
// it was in fact listed, indistinguishable from an approved one, pointing
// at a dashboard that immediately bounced the person back out.
//
// Both halves were wrong, in opposite directions, and the honest answer is
// neither. Somebody who has just registered an organisation and is waiting
// for it to be approved has to be able to find it — an independent pilot
// audit found a registrant with no route to their own organisation from
// anywhere in the interface, who could only reach it by typing /employer.
// Hiding it is how that happened.
//
// So a non-active organisation IS listed, wearing its status, and points at
// /employer/pending — the page that states where the registration stands —
// rather than at a workspace that is not open. The status is presentation:
// it decides a label and a destination, and grants nothing either way.

import { Link } from "@tanstack/react-router";
import { Building2, Check, ChevronDown, LogOut, UserPen, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/context";
import { workspaceStatusLabelKey } from "./workspace-status";

/** One organisation this person actually belongs to, as the database
 *  returned it. Structurally a subset of `MyEmployerWorkspace` so the
 *  header can pass its query result straight through. */
export type AccountWorkspace = {
  readonly employerSlug: string;
  readonly employerName: string;
  /** The organisation's own lifecycle status, as the database returned it.
   *  Only `active` opens the workspace; everything else routes to the status
   *  page instead. Presentation only — never read as permission. */
  readonly employerStatus: string;
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
            {identity.workspaces.map((workspace) => {
              const statusKey = workspaceStatusLabelKey(workspace.employerStatus);
              // An organisation still being reviewed is reachable, and says
              // so, but does not pretend to be a workspace: it goes to the
              // status page rather than to a dashboard the database will
              // refuse. The tick marks where the person already is and is
              // meaningless for a destination they are not in.
              const inner = (
                <>
                  <Building2 className="mr-2 h-4 w-4 flex-none" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{workspace.employerName}</span>
                  {statusKey ? (
                    <span className="ml-2 flex-none rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t(statusKey)}
                    </span>
                  ) : (
                    currentSlug === workspace.employerSlug && (
                      <Check
                        className="ml-2 h-3.5 w-3.5 flex-none text-accent"
                        aria-hidden="true"
                      />
                    )
                  )}
                </>
              );

              return (
                <DropdownMenuItem key={workspace.employerSlug} asChild>
                  {statusKey ? (
                    <Link to="/employer/pending" className="cursor-pointer">
                      {inner}
                    </Link>
                  ) : (
                    <Link
                      to="/employer/$employerSlug"
                      params={{ employerSlug: workspace.employerSlug }}
                      className="cursor-pointer"
                    >
                      {inner}
                    </Link>
                  )}
                </DropdownMenuItem>
              );
            })}
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link to="/my-career/profile" className="cursor-pointer">
            <UserPen className="mr-2 h-4 w-4" aria-hidden="true" />
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
