// HAYAT — the hosted Open Badges 2.0 adapter (Credly).
//
// ── WHAT "HOSTED" MEANS, AND WHY THERE IS NO SIGNATURE TO CHECK ────────
//
// An Open Badges 2.0 hosted assertion is verified by WHERE IT IS SERVED: the
// issuer's platform publishes the assertion at a stable URL, and fetching it
// from that host over TLS is the verification. There is no signature. So the
// whole weight rests on three things this file controls and the holder does not:
//
//   1. WHICH URL IS FETCHED. The holder pastes a badge link. That link is only
//      ever PARSED for a badge id; the URL that is fetched is BUILT here, on the
//      one allow-listed host. A pasted link can never choose the destination.
//   2. WHICH ISSUER AND TEMPLATE COUNT. The assertion names its badge class; the
//      class's issuer id and template id must be the ones the source registry
//      records for the catalogue definition the holder selected.
//   3. WHOSE IT IS. The assertion's hashed recipient must match the account's
//      confirmed email, read from the session on the server.
//
// Nothing the browser read off a document takes part. The evidence is retrieved
// independently, and the only holder inputs are the link and the dates typed.
//
// ── WHAT IT CANNOT PROVE ───────────────────────────────────────────────
//
// The assertion carries no certificate number and no holder name, and dates the
// BADGE rather than the original certification. A positive result therefore
// states `credential_number_not_published` and `issue_date_not_compared`.
//
// Nothing from the assertion is stored: Credly's terms forbid keeping API
// content, hashed or not. A decision records our conclusion and the holder's
// own link.

import { emailBindingCheck, type BindingAccount, type RecipientIdentity } from "./holder-binding";
import { check, decide, unevaluated, type Check, type HayatDecision } from "./model";
import { safeFetchJson, type SafeFetchResult } from "./safe-fetch";
import type { HostedBadgeSource } from "./source-registry";

export const HOSTED_BADGE_ADAPTER = "credly-ob2-hosted/1";

export interface HostedBadgeInput {
  /** Untrusted: the badge link the holder pasted. Parsed, never fetched. */
  readonly link: string;
  /** Untrusted: what the holder selected and typed. */
  readonly claim: { readonly definitionCode: string; readonly validUntil: string | null };
  /** Trusted: read from the authenticated session by the server. */
  readonly account: BindingAccount;
}

export interface HostedBadgeDeps {
  readonly source: HostedBadgeSource;
  readonly now: Date;
  readonly fetchImpl?: typeof fetch;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** The badge id in a holder's link, or null. The link's host and shape are
 *  checked; its query, fragment and any trailing path are ignored. */
export function badgeIdFromLink(link: string, source: HostedBadgeSource): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!source.linkHosts.includes(url.hostname.toLowerCase())) return null;
  const match = new RegExp(`^/badges/(${UUID})(?:/.*)?$`, "i").exec(url.pathname);
  return match ? match[1].toLowerCase() : null;
}

/** The ONLY URL shapes this adapter ever fetches. */
const assertionUrl = (source: HostedBadgeSource, badgeId: string) =>
  `https://${source.assertionHost}/v1/obi/v2/badge_assertions/${badgeId}`;

/** issuer id and template id from a badge-class URL on the allow-listed host. */
function parseBadgeClass(
  value: unknown,
  source: HostedBadgeSource,
): { issuerId: string | null; templateId: string; url: string } | null {
  const raw = text(value) ?? (isObject(value) ? text(value.id) : null);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== source.assertionHost) return null;
  // Credly writes both /v1/... and /api/v1/... for the same resource.
  const match = new RegExp(
    `^/(?:api/)?v1/obi/v2/(?:issuers/(${UUID})/)?badge_classes/(${UUID})$`,
    "i",
  ).exec(url.pathname);
  if (!match) return null;
  return {
    issuerId: match[1]?.toLowerCase() ?? null,
    templateId: match[2].toLowerCase(),
    url: `https://${source.assertionHost}${url.pathname}`,
  };
}

const issuerIdFrom = (value: unknown): string | null => {
  const raw = text(value) ?? (isObject(value) ? text(value.id) : null);
  return raw
    ? (new RegExp(`/issuers/(${UUID})$`, "i").exec(raw)?.[1]?.toLowerCase() ?? null)
    : null;
};

/** Two attempts, then an honest "unavailable". An HTTP answer is never retried. */
async function fetchTwice(
  url: string,
  source: HostedBadgeSource,
  fetchImpl: typeof fetch | undefined,
): Promise<SafeFetchResult> {
  let last: SafeFetchResult = { ok: false, kind: "unavailable" };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    last = await safeFetchJson(url, { allowedHosts: [source.assertionHost], fetchImpl });
    if (last.ok || last.kind === "refused" || last.status !== undefined) return last;
  }
  return last;
}

export async function assessHostedBadge(
  input: HostedBadgeInput,
  deps: HostedBadgeDeps,
): Promise<HayatDecision> {
  const { source } = deps;
  const checks = unevaluated();
  const set = (c: Check) => {
    checks[c.key] = c;
  };
  let bound = false;
  const finish = (covered = false) =>
    decide(checks, {
      bindingLevel: bound ? "email_control" : "none",
      adapter: HOSTED_BADGE_ADAPTER,
      checkedAt: deps.now.toISOString(),
      scopeLimits: covered ? ["credential_number_not_published", "issue_date_not_compared"] : [],
    });

  // A source we may not call is not called -- not once, not "just to see".
  if (!source.enabled) {
    set(check("supported_profile", "failed", "source_not_enabled"));
    return finish();
  }
  const badgeId = badgeIdFromLink(input.link, source);
  if (!badgeId) {
    set(check("supported_profile", "failed", "link_not_recognised"));
    return finish();
  }
  set(check("supported_profile", "passed", "ok"));

  // ── The evidence, fetched by us from the URL we built.
  const fetched = await fetchTwice(assertionUrl(source, badgeId), source, deps.fetchImpl);
  if (!fetched.ok) {
    if (fetched.kind === "unavailable" && fetched.status === 410) {
      // Credly answers 410 Gone for a revoked badge. That is an established fact.
      set(check("authoritative_evidence", "passed", "ok"));
      set(check("revocation", "failed", "revoked"));
      // Scope is unknowable for a badge we cannot read; revoked outranks it.
      set(check("approved_issuer_for_claim_type", "not_applicable", "ok"));
      return finish();
    }
    if (fetched.kind === "unavailable" && fetched.status === 404) {
      set(check("authoritative_evidence", "failed", "evidence_not_found"));
      return finish();
    }
    set(check("authoritative_evidence", "unknown", "source_unavailable"));
    return finish();
  }
  const assertion = isObject(fetched.body) ? fetched.body : null;
  const verification =
    assertion && isObject(assertion.verification) ? assertion.verification : null;
  const hosted = /^hosted(badge)?$/i.test(text(verification?.type) ?? "");
  const servedId = text(assertion?.id) ?? "";
  if (
    !assertion ||
    assertion.type !== "Assertion" ||
    !hosted ||
    !servedId.toLowerCase().endsWith(`/badge_assertions/${badgeId}`)
  ) {
    set(check("authoritative_evidence", "failed", "malformed_credential"));
    return finish();
  }
  set(check("authoritative_evidence", "passed", "ok"));

  // ── Issuer and scope: the badge class must be the registry's, for THIS definition.
  const badgeClass = parseBadgeClass(assertion.badge, source);
  let issuerId = badgeClass?.issuerId ?? null;
  if (badgeClass && !issuerId) {
    const classJson = await fetchTwice(badgeClass.url, source, deps.fetchImpl);
    if (!classJson.ok) {
      set(check("authoritative_evidence", "unknown", "source_unavailable"));
      return finish();
    }
    issuerId = isObject(classJson.body) ? issuerIdFrom(classJson.body.issuer) : null;
  }
  const issuer = Object.values(source.issuers).find((i) => i.issuerId === issuerId);
  if (!badgeClass || !issuer) {
    set(check("approved_issuer_for_claim_type", "failed", "issuer_not_trusted"));
    return finish();
  }
  const permitted = issuer.templates[input.claim.definitionCode] ?? [];
  set(
    permitted.includes(badgeClass.templateId)
      ? check("approved_issuer_for_claim_type", "passed", "ok")
      : check("approved_issuer_for_claim_type", "failed", "issuer_not_authorised_for_type"),
  );

  // ── Claim vs evidence: the expiry, which the source does publish.
  const expires = text(assertion.expires);
  const expiresOn = expires && /^\d{4}-\d{2}-\d{2}/.test(expires) ? expires.slice(0, 10) : null;
  set(
    input.claim.validUntil !== null && input.claim.validUntil !== expiresOn
      ? check("claim_matches_evidence", "failed", "claim_field_mismatch")
      : check("claim_matches_evidence", "passed", "ok"),
  );

  // ── Holder binding.
  const recipient = isObject(assertion.recipient) ? assertion.recipient : null;
  const identities: RecipientIdentity[] =
    recipient && text(recipient.identity) && String(recipient.type).toLowerCase() === "email"
      ? [
          {
            hashed: recipient.hashed === true,
            identity: text(recipient.identity) as string,
            salt: text(recipient.salt),
          },
        ]
      : [];
  const binding = await emailBindingCheck(identities, input.account);
  bound = binding.result === "passed";
  set(binding);

  // ── Validity and status.
  const now = deps.now.getTime();
  const issuedAt = Date.parse(text(assertion.issuedOn) ?? "");
  const expiresAt = Date.parse(expires ?? "");
  if (!Number.isNaN(issuedAt) && issuedAt > now) set(check("validity", "failed", "not_yet_valid"));
  else if (!Number.isNaN(expiresAt) && expiresAt <= now)
    set(check("validity", "failed", "expired"));
  else set(check("validity", "passed", "ok"));
  // Served with 200 and not flagged: the hosted assertion is not revoked, now.
  set(
    assertion.revoked === true
      ? check("revocation", "failed", "revoked")
      : check("revocation", "passed", "ok"),
  );
  set(check("freshness", "passed", "ok"));
  return finish(true);
}
