import { runControls, type Mutation } from "./runner";

const guard = "passport-share-gateway-transport:check";
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
    id: "GATEWAY-NO-FRAGMENT-SCRUB",
    defect: "the browser keeps the durable token in its visible address",
    file: "supabase/functions/passport-share/index.ts",
    find: "history.replaceState(null,'',location.pathname);",
    replace: "void 0;",
    guard,
    expect: "the fragment must be scrubbed before the exchange",
  },
  {
    id: "GATEWAY-RAW-HANDOFF-STORAGE",
    defect: "the edge sends a raw one-time handoff to the database",
    file: "supabase/functions/passport-share/index.ts",
    find: "_handoff_hash: await sha256(handoff)",
    replace: "_handoff_hash: handoff",
    guard,
    expect: "only the handoff hash may reach storage",
  },
  {
    id: "GATEWAY-COOKIE-PATH",
    defect: "the recipient session cookie rides every same-origin request",
    file: "src/lib/security-passport/share-transport.ts",
    find: "`${shareSessionCookieName(navigationId)}=${session}`,\n    `Path=${SHARE_COOKIE_PATH}`",
    replace: '`${shareSessionCookieName(navigationId)}=${session}`,\n    "Path=/"',
    guard,
    expect: "session cookie must not ride analytics or page requests",
  },
  {
    id: "ENTRY-REDIRECT-WITH-BODY",
    defect: "the /p entry answers with a document, so an injected script can read the token",
    file: "src/lib/security-passport/share-transport.ts",
    find: "return new Response(null, {\n    status: 302,\n    headers: { ...SHARE_HOP_HEADERS, Location: gatewayEntry },",
    replace:
      'return new Response("<!doctype html><title>Opening</title>", {\n    status: 302,\n    headers: { ...SHARE_HOP_HEADERS, Location: gatewayEntry },',
    guard,
    expect: "the /p redirect must have no body",
  },
  {
    id: "ENTRY-KEEPS-REFERRER",
    defect: "the /p redirect lets the browser send the application address onward",
    file: "src/lib/security-passport/share-transport.ts",
    find: '  "Referrer-Policy": "no-referrer",\n} as const;',
    replace: "} as const;",
    guard,
    expect: "the /p redirect must suppress referrers",
  },
  {
    id: "ENTRY-AFTER-SSR",
    defect:
      "the /p entry is left to the page router, which renders a document at the token's address",
    file: "src/server.ts",
    find: "if (new URL(request.url).pathname === SHARE_ENTRY_PATH) {",
    replace: "if (false as boolean) {",
    guard,
    expect: "the /p entry must be answered before the SSR handler renders anything",
  },
];

runControls("share-gateway-transport", mutations);
