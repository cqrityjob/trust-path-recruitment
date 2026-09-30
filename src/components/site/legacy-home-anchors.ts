// Links into the homepage's RETIRED sections keep working.
//
// Until 2026-09-30 the homepage explained each product in its own section,
// and those anchors were linked from the header, shared Passport pages,
// emails and bookmarks: /#passport, /#security-intelligence, /#career … Each
// product now has its own page, so an arrival on one of the old anchors is
// forwarded — replacing the history entry, so Back does not bounce — to the
// page that now holds that content. Anchors that still exist are untouched.
//
// Presentation only: every destination is public and re-checks nothing it
// does not already check when its URL is typed.

import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

/** Retired anchor → where its content lives now. */
export const RETIRED_HOME_ANCHORS = {
  passport: { to: "/security-passport" },
  "security-intelligence": { to: "/sakerhetsarbete" },
  career: { to: "/career-center" },
  employers: { to: "/", hash: "for-arbetsgivare" },
  "get-started": { to: "/", hash: "for-dig" },
  faq: { to: "/about" },
} as const satisfies Record<
  string,
  {
    to: "/security-passport" | "/sakerhetsarbete" | "/career-center" | "/about" | "/";
    hash?: string;
  }
>;

export function useRetiredHomeAnchors(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const anchor = decodeURIComponent(window.location.hash.slice(1));
    if (!Object.hasOwn(RETIRED_HOME_ANCHORS, anchor)) return;
    const target: { to: string; hash?: string } =
      RETIRED_HOME_ANCHORS[anchor as keyof typeof RETIRED_HOME_ANCHORS];
    void navigate({
      to: target.to as "/",
      hash: target.hash,
      replace: true,
    });
  }, [navigate]);
}
