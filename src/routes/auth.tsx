// COMPATIBILITY REDIRECT — the original auth entry point.
//
// /auth has been a redirect since H3.1, when it forwarded to one of four
// audience-specific doors. There is one door now, so it forwards there
// instead. It has never rendered a form since H3.1 and does not start now.
//
// `intent` is still READ, and now only to choose between sign-in and
// registration when `mode` did not say — it selects a destination and is
// never treated as a permission, which was true when the parameter was
// introduced and is the reason it costs nothing to keep honouring.
//
// Loop prevention: safeReturnPath refuses to return a path back into any
// auth surface, /auth and /login included, so a malformed or malicious
// `redirect` cannot bounce a visitor between them.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { unifiedAuthHref } from "@/lib/auth/legacy-entry";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Logga in — CQrityjob" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  beforeLoad: ({ location }) => {
    const searchStr = location.searchStr ?? "";
    const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr);
    const mode = params.get("mode") === "register" ? "signup" : "signin";
    throw redirect({ href: unifiedAuthHref(mode, searchStr), replace: true });
  },
});
