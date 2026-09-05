// The career home's header — who this is, in one line, and where to change it.
//
// ── WHY IT IS TWO LINES AND A ROW ──────────────────────────────────────
//
// The full hero -- a framed panel with a trust grid, a self-reported note
// and an action row -- occupied most of the first screen and pushed the one
// thing the page had decided about below the fold. What the platform has
// established about this person lives where it is actionable: the Passport
// summary and the recommended next step, both above the fold. The header
// says who they are and gets out of the way.
//
// ── THE NAME RULE ──────────────────────────────────────────────────────
//
// Preferred name when the person set one, otherwise the account's first
// name, otherwise NO name. The heading used to fall back to the local part
// of the email address, which greeted people by a string they had never
// offered as a name. `HomeProfile.greetingName` has already applied the
// rule; this component only renders the answer.

import { Link } from "@tanstack/react-router";
import { AlertTriangle, BadgeCheck, RefreshCcw } from "lucide-react";
import { useT } from "@/i18n/context";
import type { HomeProfile } from "@/lib/professional-identity/home-presentation";
import { homeRoleTitle } from "@/lib/professional-identity/home-presentation";
// The work location is Passport-owned, and so is the only correct way to
// render it. `formatWorkLocation` keeps the emirate: a Dubai holder is not
// "a UAE holder", and a bare `AE` says the second thing.
import { formatWorkLocation } from "@/lib/security-passport/format";
import { SECTION_DESTINATIONS } from "@/lib/professional-identity/profile-destinations";
import { L, Lf, type Lang } from "./copy";
import { HEADER } from "./home-copy";

export function CareerPageHeader({
  profile,
  onRetry,
}: {
  profile: HomeProfile;
  /** Re-run the identity read. Given one, the degraded notice offers it:
   *  somebody told that something failed must be able to act on it without
   *  reloading the page. */
  onRetry?: () => void;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  const role = homeRoleTitle(profile, l) ?? L(HEADER.noTitle, l);
  const location = profile.workCountry
    ? formatWorkLocation(profile.workCountry, profile.workSubJurisdiction, l)
    : L(HEADER.noCountry, l);

  return (
    <header data-career-header>
      <h1
        className="text-2xl font-semibold tracking-tight text-balance text-foreground md:text-3xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {profile.greetingName ? Lf(HEADER.title, l, profile.greetingName) : L(HEADER.titleAnon, l)}
      </h1>
      <p className="mt-2 max-w-[60ch] text-base text-muted-foreground">{L(HEADER.lede, l)}</p>

      {/* The identity row: role, country, and the way to change either.
          Self-reported, and it says so — this is not the Passport. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground" data-identity-row>
          {[role, location].join(" · ")}
        </p>
        {profile.complete && (
          <p className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-accent">
            <BadgeCheck className="h-3 w-3" aria-hidden="true" />
            {L(HEADER.basicsComplete, l)}
          </p>
        )}
        <Link
          to={SECTION_DESTINATIONS.profession.href}
          data-edit-details
          className="inline-flex min-h-11 items-center font-semibold text-sm text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {L(HEADER.editDetails, l)}
        </Link>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">{L(HEADER.selfReported, l)}</p>

      {profile.degraded ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {L(HEADER.degraded, l)}
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {L(HEADER.retry, l)}
            </button>
          )}
        </div>
      ) : null}
    </header>
  );
}
