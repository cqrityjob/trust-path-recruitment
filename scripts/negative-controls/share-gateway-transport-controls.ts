import { runControls, type Mutation } from "./runner";

const guard = "passport-share-gateway-transport:check";
const mutations: readonly Mutation[] = [
  {
    id: "GATEWAY-TOKEN-IN-PATH",
    defect: "new links put the durable capability back in Lovable's request path",
    file: "src/lib/security-passport/public-origin.ts",
    find: "`${publicShareGatewayOrigin()}/functions/v1/passport-share#${token}`",
    replace: "`${publicShareOrigin()}/p/${token}`",
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
    replace: "`${shareSessionCookieName(navigationId)}=${session}`,\n    \"Path=/\"",
    guard,
    expect: "session cookie must not ride analytics or page requests",
  },
];

runControls("share-gateway-transport", mutations);
