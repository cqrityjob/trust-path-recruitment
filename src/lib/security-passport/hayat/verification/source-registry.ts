// HAYAT — the verification source registry.
//
// A source is somewhere HAYAT can fetch authoritative evidence FROM, independent
// of anything the holder's browser read off a document. Each entry records what
// the source is, what it can and cannot prove, where its identifiers came from,
// and -- separately from whether the code works -- whether we are PERMITTED to
// use it.
//
// ── CREDLY: TECHNICALLY AVAILABLE, NOT YET PERMITTED ───────────────────
//
// Investigated 2026-09-20 from primary sources (docs.credly.com, archived Credly
// API docs, Credly/Pearson terms, the ASIS certification handbook, and
// unauthenticated reads of ASIS's own public issuer and badge-class metadata):
//
//   * ASIS issues CPP, PSP, PCI and APP through Credly. ASIS itself offers no
//     API; its credential search sits behind a bot challenge.
//   * Credly's authenticated API is scoped to the ISSUING organisation. A relying
//     party cannot look up another organisation's badges with it.
//   * Credly publishes each PUBLIC badge as an Open Badges 2.0 HOSTED assertion
//     (not a signed credential, not the baked-JWS format of ./signed-credential):
//       GET https://api.credly.com/v1/obi/v2/badge_assertions/<badge-id>
//     unauthenticated; 404 for an unknown id, 410 Gone for a revoked badge.
//     It carries badge (class URL), issuedOn, expires and
//     recipient { type: "email", hashed: true, identity: "sha256$<hex>" }.
//     It carries NO certificate number and NO holder name.
//   * PERMISSION IS NOT CONFIRMED. Credly's website and user terms prohibit bots
//     and scraping without written permission; its API terms cover signed clients
//     only, forbid storing API content (hashes included) and allow a 30-day
//     cache; and the page documenting these endpoints was removed from the live
//     docs. Nothing found grants a non-client relying party automated retrieval,
//     storage or periodic re-checking.
//
// So the adapter is complete and tested, and `enabled` is false. Turning it on
// is a one-line reviewed change that must cite the written permission in
// `permission`. It is deliberately NOT an environment variable: whether we may
// call a third party's service is a decision that belongs in review, with its
// evidence beside it. See docs/passport/hayat-sources.md for the request text.
//
// The identifiers below are not guesses and are not keys: they are ASIS's public
// Credly issuer id and badge-template ids, each confirmed by reading the public
// badge class and matching its `name`. A holder cannot influence them.

export interface HostedBadgeSource {
  readonly id: "credly_ob2";
  readonly name: string;
  /** May HAYAT call this source at all? Code-reviewed, never configured. */
  readonly enabled: boolean;
  /** Why not, in one line. Null only when `enabled`. */
  readonly blockedBy: string | null;
  /** The written permission this source is used under. Null while disabled. */
  readonly permission: string | null;
  /** Hosts a holder may paste a badge link from. The link is only PARSED. */
  readonly linkHosts: readonly string[];
  /** The one host HAYAT fetches from. Exact match, https, no redirects. */
  readonly assertionHost: string;
  /** Catalogue issuer -> that issuer's Open Badges issuer id on this source. */
  readonly issuers: Readonly<
    Record<
      string,
      {
        readonly name: string;
        readonly issuerId: string;
        /** Catalogue definition code -> the badge-template ids that ARE that credential. */
        readonly templates: Readonly<Record<string, readonly string[]>>;
        readonly confirmedOn: string;
      }
    >
  >;
  /** A positive result older than this is no longer current (also Credly's cache limit). */
  readonly maxEvidenceAgeDays: number;
  /** Credly's terms forbid storing API content, hashed or not. */
  readonly storeEvidenceContent: false;
}

const ASIS_CREDLY_ISSUER = "780a5807-d294-4ded-be0a-f8ae225f997b";

export const CREDLY_OB2: HostedBadgeSource = {
  id: "credly_ob2",
  name: "Credly (Open Badges 2.0 hosted assertion)",
  enabled: false,
  blockedBy:
    "Written permission from Credly/Pearson for automated retrieval and re-checking by a non-client relying party has not been obtained.",
  permission: null,
  linkHosts: ["www.credly.com", "credly.com"],
  assertionHost: "api.credly.com",
  issuers: {
    ASIS: {
      name: "ASIS International",
      issuerId: ASIS_CREDLY_ISSUER,
      templates: {
        INTL_ASIS_CPP: ["71fbf093-3a3c-4bf5-8ef3-c6d6a8e9649c"],
        INTL_ASIS_PSP: ["931c53b1-b32f-48d6-b741-bc5447b69dc6"],
        INTL_ASIS_PCI: ["7c038c8c-45d5-4586-9791-4b5aa39e1a8c"],
        INTL_ASIS_APP: ["c59ac211-0ca6-442d-8435-b1bfd3b5a806"],
      },
      confirmedOn: "2026-09-20",
    },
  },
  maxEvidenceAgeDays: 30,
  storeEvidenceContent: false,
};

export const PRODUCTION_SOURCES: readonly HostedBadgeSource[] = [CREDLY_OB2];

/** The definition codes a source can currently verify. Empty while it is disabled. */
export function verifiableDefinitionCodes(sources: readonly HostedBadgeSource[]): string[] {
  return sources
    .filter((s) => s.enabled)
    .flatMap((s) => Object.values(s.issuers).flatMap((i) => Object.keys(i.templates)));
}
