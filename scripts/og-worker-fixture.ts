// Synthetic public-share fixtures for the preview-image evidence jobs, shaped
// exactly like `sp_get_social_share`'s answer. Invented people and merits only.
//
// ── DETERMINISTIC, BY ID ───────────────────────────────────────────────
//
// Every public id below is exactly 24 URL-safe characters, as a real one is,
// and each id ALWAYS answers the same way: no state is kept anywhere. That is
// what makes the public test deployment's evidence trustworthy -- Cloudflare
// runs a Worker in many isolates and restarts them freely, so a stand-in that
// remembered "revoked" in a module-level Map would forget it between two
// requests. Instead there is one id that is always active, one that always
// answers like a revoked share, one like an expired share and one whose read
// always fails. What they prove is how the APPLICATION answers each kind of
// database answer. Production's real revocation and expiry are proved
// separately, against a real database: the SQL tests and the pilot spec's
// case S.
//
// The database gives ONE answer, `{"status":"unavailable"}`, for an unknown, a
// revoked and an expired share (so a stranger cannot tell them apart). The
// revoked and expired fixtures therefore answer identically; both exist so the
// instructions can name each case and so a later change to the database's
// answer has two places to be noticed.

export const ACTIVE_ID = "AbCdEfGhIjKlMnOpQrStUvWx";
export const LONG_ID = "LongLongLongLongLongLong";
export const ARABIC_ID = "ArabicArabicArabicArabic";
export const FOUNDER_ID = "FounderFounderFounderFou";
/** Always answers as a revoked share does: "unavailable". */
export const REVOKED_ID = "RevokedRevokedRevokedRev";
/** Always answers as an expired share does: "unavailable". */
export const EXPIRED_ID = "ExpiredExpiredExpiredExp";
/** The read itself always fails (HTTP 500 from the stand-in). */
export const READ_ERROR_ID = "ReadErrorReadErrorReadEr";

/** Every id the stand-ins know. The public test workflow's `share` choice is
 *  checked against this list, and against nothing wider. */
export const FIXTURE_IDS: readonly string[] = [
  ACTIVE_ID,
  LONG_ID,
  ARABIC_ID,
  FOUNDER_ID,
  REVOKED_ID,
  EXPIRED_ID,
  READ_ERROR_ID,
];

/** The values a test build is given INSTEAD of the real project's. Plainly
 *  synthetic: the key is not a key, the ref is not a project. The isolation
 *  check requires them in the built client and refuses the real ones. */
export const SYNTHETIC_SUPABASE_KEY = "sb_publishable_synthetic_test_only_not_a_key";
export const SYNTHETIC_SUPABASE_REF = "synthetictestrefzzzz";

const claim = (n: number, title: string, assertion = "self_declared") => ({
  key: `c${n}`,
  type: "certification",
  title,
  credential_code: null,
  jurisdiction: "SE",
  sub_jurisdiction: null,
  scope_code: null,
  no_expiry: true,
  valid_until: null,
  assertion,
  lifecycle: "active",
  verified_at: null,
  verifier_organisation: null,
  verification_method: null,
});

export function payloadFor(id: string): Record<string, unknown> | null {
  const base = {
    status: "active",
    locale: "sv",
    snapshot_at: "2026-10-01T10:00:00Z",
    expires_at: "2027-01-01T10:00:00Z",
    holder: "Selma Dahlberg (fiktiv)",
    holder_label: "full_name",
    jurisdiction: "SE",
    passport_number: 17,
    designation: null,
  };
  switch (id) {
    case ACTIVE_ID:
      return {
        ...base,
        claims: [
          claim(1, "Ordningsvaktsutbildning (grundutbildning)"),
          claim(2, "Certified Protection Professional (CPP)"),
          claim(3, "Första hjälpen och HLR"),
        ],
      };
    case LONG_ID:
      return {
        ...base,
        claims: Array.from({ length: 40 }, (_, i) =>
          claim(i + 1, `Merit nummer ${i + 1} med ett ganska långt och detaljerat namn åäö`),
        ),
      };
    case ARABIC_ID:
      return { ...base, holder: "محمد الشاوي", claims: [claim(1, "Brandskydd grund")] };
    case FOUNDER_ID:
      return {
        ...base,
        locale: "en",
        holder: "Founder Example (fiktiv)",
        passport_number: 1,
        designation: "founder",
        claims: [claim(1, "Brandskydd grund")],
      };
    default:
      return null;
  }
}

export type FixtureAnswer =
  | { readonly kind: "payload"; readonly body: Record<string, unknown> }
  | { readonly kind: "unavailable" }
  | { readonly kind: "error" };

/** What `sp_get_social_share` answers for an id, deterministically. */
export function fixtureAnswer(id: string): FixtureAnswer {
  if (id === READ_ERROR_ID) return { kind: "error" };
  if (id === REVOKED_ID || id === EXPIRED_ID) return { kind: "unavailable" };
  const body = payloadFor(id);
  return body ? { kind: "payload", body } : { kind: "unavailable" };
}

/** The stand-in's HTTP answer for one RPC call. Shared by the loopback stub
 *  (CI) and the public test Worker, so the two cannot disagree. */
export function rpcResponse(answer: FixtureAnswer): Response {
  if (answer.kind === "error") return new Response("boom", { status: 500 });
  if (answer.kind === "unavailable") return Response.json({ status: "unavailable" });
  return Response.json(answer.body);
}
