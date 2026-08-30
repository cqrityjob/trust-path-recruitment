// The four superseded auth doors, kept alive.
//
// /candidate/login, /candidate/register, /employer/login and
// /employer/register were public routes for ten months. They are in
// bookmarks, in search indexes, in invitation emails already sent and in
// documents already printed. Breaking them would strand exactly the people
// who have been using the product longest, so they resolve to the unified
// entrance instead — the same treatment /auth received in H3.1, for the
// same reason.
//
// ── WHAT IS AND IS NOT CARRIED ACROSS ──────────────────────────────────
//
// The `redirect` parameter is carried, VALIDATED. It is what makes an
// organisation invitation and the anonymous Career Discovery claim token
// survive the round trip, and `safeReturnPath` is what stops it becoming an
// open redirect — it refuses an absolute URL, a protocol-relative one, and
// a path back into an auth route.
//
// `intent` is deliberately NOT carried. It selected a door, and there is
// one door now. It was never a permission (the portal-separation ADR's
// decision 7), so dropping it grants and forecloses nothing.

import { safeReturnPath } from "./safe-redirect";

/**
 * Build the unified destination for a legacy auth URL.
 *
 * Takes the raw query string rather than a parsed object so a route can
 * call it from `beforeLoad` without declaring a search schema for a page
 * that renders nothing.
 */
export function unifiedAuthHref(mode: "signin" | "signup", searchStr: string): string {
  const base = mode === "signup" ? "/signup" : "/login";
  const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr);
  const validated = safeReturnPath(params.get("redirect"), "");
  return validated ? `${base}?redirect=${encodeURIComponent(validated)}` : base;
}
