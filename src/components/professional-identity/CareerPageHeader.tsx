// The career home's header — who this is, in one line, and where to change it.
//
// Three states, because the identity read has three: while it loads the
// heading already greets (the preferred name comes from the session, not
// the read) and the identity row is a skeleton; if it fails the row is an
// error with a retry and the rest of the page goes on; when it answers,
// the row is role, country and the way to edit them.
//
// The name rule: preferred name, then the account's first name, then no
// name. Never an email local part.

import { Link } from "@tanstack/react-router";
import { AlertTriangle, BadgeCheck, RefreshCcw } from "lucide-react";
import { useT } from "@/i18n/context";
import { homeRoleTitle, type HomeProfile } from "@/lib/professional-identity/home-presentation";
import { formatWorkLocation } from "@/lib/security-passport/format";
import { SECTION_DESTINATIONS } from "@/lib/professional-identity/profile-destinations";
import { L, Lf, type Lang } from "./copy";
import { COMMON, HEADER } from "./home-copy";
import { LINK } from "./home-format";

export function CareerPageHeader({
  profile,
  onRetry,
}: {
  profile: HomeProfile;
  onRetry?: () => void;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  return (
    <header data-career-header data-profile-state={profile.state}>
      <h1
        className="text-2xl font-semibold tracking-tight text-balance text-foreground md:text-3xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {profile.greetingName ? Lf(HEADER.title, l, profile.greetingName) : L(HEADER.titleAnon, l)}
      </h1>
      <p className="mt-2 max-w-[60ch] text-base text-muted-foreground">{L(HEADER.lede, l)}</p>

      {profile.state === "loading" ? (
        <div role="status" aria-live="polite" className="mt-4" data-loading>
          <p className="sr-only">{L(HEADER.loading, l)}</p>
          <div className="h-6 w-72 max-w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      ) : profile.state === "unavailable" ? (
        <div role="alert" className="mt-4 text-sm" data-failed>
          <p className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {L(HEADER.failedTitle, l)}
          </p>
          <p className="mt-0.5 text-muted-foreground">{L(HEADER.failedBody, l)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-5">
            {onRetry && (
              <button type="button" onClick={onRetry} className={LINK} data-retry>
                <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {L(COMMON.retry, l)}
              </button>
            )}
            <Link to="/my-career/profile" className={LINK}>
              {L(HEADER.editDetails, l)}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm font-medium text-foreground" data-identity-row>
              {[
                homeRoleTitle(profile, l) ?? L(HEADER.noTitle, l),
                profile.workCountry
                  ? formatWorkLocation(profile.workCountry, profile.workSubJurisdiction, l)
                  : L(HEADER.noCountry, l),
              ].join(" · ")}
            </p>
            {profile.complete && (
              <p className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-accent">
                <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                {L(HEADER.basicsComplete, l)}
              </p>
            )}
            <Link to={SECTION_DESTINATIONS.profession.href} data-edit-details className={LINK}>
              {L(HEADER.editDetails, l)}
            </Link>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{L(HEADER.selfReported, l)}</p>
          {profile.degraded && (
            <div role="alert" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {L(HEADER.degraded, l)}
              </span>
              {onRetry && (
                <button type="button" onClick={onRetry} className={LINK} data-retry>
                  <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {L(COMMON.retry, l)}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </header>
  );
}
