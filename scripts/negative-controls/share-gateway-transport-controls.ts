import { runControls, type Mutation } from "./runner";

const guard = "passport-share-gateway-transport:check";
const TRANSPORT = "src/lib/security-passport/share-transport.ts";
const BOUNDARY = "src/lib/security-passport/public-disclosure.server.ts";
const FUNCTION = "supabase/functions/passport-share/index.ts";
const mutations: readonly Mutation[] = [
  {
    id: "GATEWAY-TOKEN-IN-PATH",
    defect: "new links put the durable capability back in Lovable's request path",
    file: "src/lib/security-passport/public-origin.ts",
    find: "return `${publicShareOrigin()}${SHARE_ENTRY_PATH}#${token}`;",
    replace: "return `${publicShareOrigin()}/p/${token}`;",
    guard,
    expect: "new links must carry the durable token in a fragment",
  },
  {
    id: "ENTRY-NO-FRAGMENT-SCRUB",
    defect: "the entry page leaves the durable token in the address bar and the history entry",
    file: TRANSPORT,
    find: "'history.replaceState(null,\"\",location.pathname);',",
    replace: "'void 0;',",
    guard,
    expect: "the fragment must be removed before the token leaves the page",
  },
  {
    id: "ENTRY-SCRIPT-SELF",
    defect:
      "the entry page admits same-origin scripts, so the host's injected /~flock.js runs where the token is",
    file: TRANSPORT,
    find: "`script-src 'nonce-${nonce}'`,",
    replace: "`script-src 'self' 'nonce-${nonce}'`,",
    guard,
    expect: "only the page's own nonce'd script may run",
  },
  {
    id: "ENTRY-KEEPS-REFERRER",
    defect: "the share hops let the browser send the address onward",
    file: TRANSPORT,
    find: '  "Referrer-Policy": "no-referrer",\n} as const;',
    replace: "} as const;",
    guard,
    expect: "the entry page must suppress referrers",
  },
  {
    id: "ENTRY-AFTER-SSR",
    defect:
      "the /p entry is left to the page router, which renders the application's own document there",
    file: "src/server.ts",
    find: "if (new URL(request.url).pathname === SHARE_ENTRY_PATH) {",
    replace: "if (false as boolean) {",
    guard,
    expect: "the /p entry must be answered before the SSR handler renders anything",
  },
  {
    id: "OPEN-TOKEN-AS-COOKIE",
    defect: "the exchange hands the browser the durable token as a cookie instead of a session",
    file: "src/server.ts",
    find: "      return unavailableShare();\n  } catch {\n    return unavailableShare();\n  }\n  return buildShareSessionRedirect(session, isHttps(request));\n}\n\n// h3",
    replace:
      "      return unavailableShare();\n  } catch {\n    return unavailableShare();\n  }\n  return buildShareRedirect(token, isHttps(request));\n}\n\n// h3",
    guard,
    expect: "the browser must receive a separate session, never the durable token as a cookie",
  },
  {
    id: "OPEN-THROTTLE-IGNORED",
    defect: "the exchange counts a throttled caller but looks the token up anyway",
    file: BOUNDARY,
    find: "  if (throttle.error || throttle.data === false) return false;\n\n  const issued",
    replace: "  const issued",
    guard,
    expect: "a throttled caller must be refused before the token is looked up",
  },
  {
    id: "GATEWAY-RAW-HANDOFF-STORAGE",
    defect: "the exchange stores a raw one-time handoff",
    file: BOUNDARY,
    find: "_handoff_hash: hashShareSecret(handoff)",
    replace: "_handoff_hash: handoff",
    guard,
    expect: "only the handoff hash may reach storage",
  },
  {
    id: "FUNCTION-SERVES-HTML",
    defect:
      "the Supabase function answers a link with a page again, which hosted Supabase shows as text",
    file: FUNCTION,
    find: "return new Response(null, { status: 302, headers: { ...hopHeaders, Location: ENTRY_URL } });",
    replace:
      'return new Response("<!doctype html><p>Öppnar</p>", { status: 200, headers: { ...hopHeaders, "Content-Type": "text/html; charset=utf-8" } });',
    guard,
    expect: "the function must answer a link with a redirect",
  },
  {
    id: "FUNCTION-REDIRECTS-UNCONFIRMED",
    defect:
      "the function redirects before the owner confirms /p is published, so a site without the entry page lets the host's analytics read the token",
    file: FUNCTION,
    find: 'return Deno.env.get("PASSPORT_SHARE_ENTRY_PUBLISHED") === "1";',
    replace: "return true;",
    guard,
    expect: "a link must be refused until the owner confirms the entry is published",
  },
  {
    id: "GATEWAY-COOKIE-PATH",
    defect: "the recipient session cookie rides every same-origin request",
    file: TRANSPORT,
    find: "`${shareSessionCookieName(navigationId)}=${session}`,\n    `Path=${SHARE_COOKIE_PATH}`",
    replace: '`${shareSessionCookieName(navigationId)}=${session}`,\n    "Path=/"',
    guard,
    expect: "session cookie must not ride analytics or page requests",
  },
];

runControls("share-gateway-transport", mutations);
