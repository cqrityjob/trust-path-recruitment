// The account menu — identity, workspace switch, settings, sign out.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
//
// Until it was built, the application had no account menu and therefore
// nowhere at all to sign out: /my-career carried the only sign-out control
// in the entire authenticated product, as a row pinned to the bottom of the
// candidate dashboard. So account concerns live here, in the header, on
// every authenticated page, once.
//
// ── IT IS THE WORKSPACE SWITCHER ───────────────────────────────────────
//
// One person may be a candidate, a Passport holder, an assessment
// participant, a recruiter at one or more organisations AND an authorised
// reviewer. Those are WORKSPACES within one account, not separate accounts,
// so switching between them belongs to the account control rather than to
// a second front door or to the candidate's primary navigation. Each
// organisation is listed BY NAME and by what it is -- "PT-M AB –
// Arbetsgivare"; the reviewer view is listed with what is waiting in it.
//
// "Granskningar · 34" used to sit in the primary navigation of the
// candidate's own workspace. Reviewing is a separate authorised capability
// and giving it equal billing beside somebody's own career said the
// opposite of what the product means. It is reached from here now, and the
// number is the queue -- what is waiting for the person -- never a count of
// everything they ever reviewed.
//
// ── THE SWITCHER GRANTS NOTHING ────────────────────────────────────────
//
// The organisation list is `listMyEmployerWorkspaces()` -- the rows
// row-level security actually returned for this caller -- and the reviewer
// entry is gated on the review queue, a security-invoker read that returns
// nothing to a non-reviewer. Not a client-side role string, not a JWT
// claim. Selecting an entry changes the ROUTE; every destination then
// re-verifies access itself, as it would if somebody typed the URL. Hiding a
// link has never been the boundary.
//
// ── AN ORGANISATION UNDER REVIEW IS STILL A WORKSPACE ──────────────────
//
// It is listed, wearing its status, and points at /employer/pending -- the
// page that states where the registration stands -- rather than at a
// workspace the database will refuse. The status is presentation: it
// decides a label and a destination, and grants nothing either way.

import { Link } from "@tanstack/react-router";
import { Building2, Check, ChevronDown, Gavel, LogOut, UserPen, UserRound } from "lucide-react";
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
  /** Responses waiting in this person's review queue. Zero for everybody
   *  who is not an authorised reviewer -- the queue read returns nothing to
   *  them -- and zero hides the entry. */
  readonly reviewQueueCount: number;
  /** Which workspace the current route is in, so the menu can show where the
   *  person already is instead of offering it as a destination. */
  readonly currentContext: "personal" | "reviewer" | { readonly employerSlug: string };
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
  const { t, tp } = useT();
  const inPersonal = identity.currentContext === "personal";
  const inReviewer = identity.currentContext === "reviewer";
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
        {identity.reviewQueueCount > 0 && (
          <span
            className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold tabular-nums text-accent-foreground"
            aria-hidden="true"
          >
            {identity.reviewQueueCount}
          </span>
        )}
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

        {/* ── Workspaces ─────────────────────────────────────────────── */}
        <DropdownMenuLabel className="pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("account.context.switchTo")}
        </DropdownMenuLabel>

        {/* Personal, always. The candidate's own career. */}
        <DropdownMenuItem asChild>
          <Link to="/my-career" className="cursor-pointer" data-workspace="personal">
            <UserRound className="mr-2 h-4 w-4" aria-hidden="true" />
            <span className="flex-1">{t("account.context.personal")}</span>
            {inPersonal && <Check className="ml-2 h-3.5 w-3.5 text-accent" aria-hidden="true" />}
          </Link>
        </DropdownMenuItem>

        {/* Organisations, by name and by what they are. */}
        {identity.workspaces.length > 0 && (
          <>
            {identity.workspaces.map((workspace) => {
              const statusKey = workspaceStatusLabelKey(workspace.employerStatus);
              const inner = (
                <>
                  <Building2 className="mr-2 h-4 w-4 flex-none" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">
                    {workspace.employerName} – {t("account.context.employer")}
                  </span>
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
                    <Link
                      to="/employer/pending"
                      className="cursor-pointer"
                      data-workspace="employer"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <Link
                      to="/employer/$employerSlug"
                      params={{ employerSlug: workspace.employerSlug }}
                      className="cursor-pointer"
                      data-workspace="employer"
                    >
                      {inner}
                    </Link>
                  )}
                </DropdownMenuItem>
              );
            })}
          </>
        )}

        {/* The reviewer view, only for somebody with a queue. */}
        {identity.reviewQueueCount > 0 && (
          <DropdownMenuItem asChild>
            <Link to="/reviews" className="cursor-pointer" data-workspace="reviewer">
              <Gavel className="mr-2 h-4 w-4 flex-none" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                {t("account.context.reviewer")} ·{" "}
                <span className="tabular-nums">{identity.reviewQueueCount}</span>{" "}
                {tp("account.context.reviewerPending", identity.reviewQueueCount)}
              </span>
              {inReviewer && (
                <Check className="ml-2 h-3.5 w-3.5 flex-none text-accent" aria-hidden="true" />
              )}
            </Link>
          </DropdownMenuItem>
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
