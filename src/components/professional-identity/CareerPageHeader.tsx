// The career home's header — the greeting, and what the page is for.
//
// Three states, because the identity read has three: while it loads the
// heading already greets (the preferred name comes from the session, not
// the read); if it fails the header says so with a retry and the rest of
// the page goes on; when it answers only in part, it says that instead.
//
// WHO the person is -- name, title, country and the way to edit them -- is
// the Profile card's, directly below (OverviewSurfaces.tsx).
//
// The name rule: preferred name, then the account's first name, then no
// name. Never an email local part.

import { AlertTriangle, RefreshCcw } from "lucide-react";
import { useT } from "@/i18n/context";
import type { HomeProfile } from "@/lib/professional-identity/home-presentation";
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
    <header
      data-career-header
      data-profile-state={profile.state}
      className="border-b border-border pb-6"
    >
      <h1
        className="text-3xl font-semibold tracking-tight text-balance text-foreground md:text-4xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {profile.greetingName ? Lf(HEADER.title, l, profile.greetingName) : L(HEADER.titleAnon, l)}
      </h1>
      <p className="mt-2 max-w-[60ch] text-base text-muted-foreground">{L(HEADER.lede, l)}</p>

      {/* Loading draws nothing here: the greeting is already true, and the
          Profile card below carries the skeleton for what is still being
          read. Two skeletons for one read is one too many. */}
      {profile.state === "loading" ? null : profile.state === "unavailable" ? (
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
          </div>
        </div>
      ) : (
        <>
          {/* The identity row and its edit link used to stand here. They are
              the Profile card now (OverviewSurfaces), directly below this
              header, where "who am I" has a name, a title, a country and one
              button -- instead of one line of text with a link beside it. */}
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
