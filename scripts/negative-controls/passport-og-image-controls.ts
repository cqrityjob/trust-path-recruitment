/**
 * Negative controls for the server-drawn preview image guard
 * (scripts/passport-og-image-check.ts).
 *
 * Each mutation plants one defect the guard exists for: a route that reads
 * the client, an image that can be cached after revocation, an unavailable
 * share that still answers 200, a document review drawn as something better,
 * a founder line in the gold reserved for verified, an issuer that reaches the
 * image, a named-share rule that is not enforced, an anonymity choice that is
 * accepted, an uncapped list, a name drawn as boxes, an active share that
 * points back at the generic image.
 *
 * Run: bun run negative-controls:passport-og-image
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "passport-og-image:check";
const ROUTE = "src/routes/og.share.$publicId.ts";
const PAGE = "src/routes/s.$publicId.tsx";
const MODEL = "src/lib/security-passport/og-image/model.ts";
const DRAW = "src/lib/security-passport/og-image/draw.ts";
const PUBLIC = "src/lib/security-passport/social-share-public.ts";
const FNS = "src/lib/security-passport/social-share.functions.ts";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "OG-NC-READS-CLIENT",
    defect: "the image route takes something from the request's query",
    file: ROUTE,
    find: "GET: async ({ params }) => {",
    replace:
      'GET: async ({ params, request }) => {\n        void new URL(request.url).searchParams.get("title");',
    guard: GUARD,
    expect: "the route reads nothing from the client",
  },
  {
    id: "OG-NC-CACHEABLE",
    defect: "the image is cacheable, so a revoked share keeps serving it",
    file: ROUTE,
    find: '"cache-control": "no-store",',
    replace: '"cache-control": "public, max-age=86400",',
    guard: GUARD,
    expect: "the image is never cacheable",
  },
  {
    id: "OG-NC-UNAVAILABLE-SERVES",
    defect: "an expired or revoked share still gets an image",
    file: ROUTE,
    find: 'if (share.status !== "active") return gone();',
    replace: 'if (share.status === "error") return gone();',
    guard: GUARD,
    expect: "an unavailable share answers 404",
  },
  {
    id: "OG-NC-REVIEW-AS-VERIFIED",
    defect: "a CQrityjob document review is drawn as a verified shield",
    file: MODEL,
    find: 'if (presentation === "documented") return "documented";',
    replace: 'if (presentation === "documented") return "verified";',
    guard: GUARD,
    expect: "a CQrityjob document review is a documented shield",
  },
  {
    id: "OG-NC-FOUNDER-GOLD",
    defect: "the founder line takes the gold reserved for verified credentials",
    file: DRAW,
    find: "MARGIN, y + 2, 21, C.blue);",
    replace: "MARGIN, y + 2, 21, C.gold);",
    guard: GUARD,
    expect: "the founder line never takes the gold reserved for verified",
  },
  {
    id: "OG-NC-ISSUER-REACHES-IMAGE",
    defect: "the public parse carries the issuer through to the image",
    file: PUBLIC,
    find: "      issuer: null,\n      jurisdiction: str(c.jurisdiction),",
    replace: "      issuer: str(c.issuer),\n      jurisdiction: str(c.jurisdiction),",
    guard: GUARD,
    expect: "a planted issuer reaches neither the parsed share nor the image model",
  },
  {
    id: "OG-NC-NAME-RULE-OFF",
    defect: "a share is created even though the privacy setting hides the name",
    file: FNS,
    find: 'if (profile && profile.privacy_mode !== "full_name") {',
    replace: 'if (profile && profile.privacy_mode === "never") {',
    guard: GUARD,
    expect: "a hidden name stops the create with its own code",
  },
  {
    id: "OG-NC-ANONYMITY-CHOICE",
    defect: "the create accepts an anonymity or initials choice",
    file: FNS,
    find: 'holderLabel: z.literal("full_name"),',
    replace: 'holderLabel: z.enum(["full_name", "initials", "anonymous"]),',
    guard: GUARD,
    expect: "a personal share cannot be created anonymous or with initials",
  },
  {
    id: "OG-NC-UNCAPPED-ROWS",
    defect: "every credential is drawn, however many, until the card overflows",
    file: MODEL,
    find: "export const MAX_ROWS = 6;",
    replace: "export const MAX_ROWS = 60;",
    guard: GUARD,
    expect: "at most six rows are drawn",
  },
  {
    id: "OG-NC-NAME-AS-BOXES",
    defect: "a name the faces cannot draw is drawn anyway, as empty boxes",
    file: MODEL,
    find: 'if (share.holder !== null && !canDraw("heading", share.holder)) return null;',
    replace: "",
    guard: GUARD,
    expect: "a name in a script the faces lack is not drawn as boxes",
  },
  {
    id: "OG-NC-PAGE-GENERIC-IMAGE",
    defect: "an active share's page points back at the generic image",
    file: PAGE,
    find: "`${origin}/og/share/${params.publicId}?v=",
    replace: "`${origin}/og-share-generic/${params.publicId}?v=",
    guard: GUARD,
    expect: "an active share's og:image is its own personal image",
  },
];

runControls("passport-og-image", MUTATIONS);
