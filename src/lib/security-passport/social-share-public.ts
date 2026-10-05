// Security Passport — the public social share, as the application reads it.
//
// A social post is addressed to no one, so it gets its OWN public page and its
// OWN identifier (`/s/<publicId>`), separate from the private, token-based
// `/p` links. The identifier is 24 random URL-safe characters: not a token that
// opens anything private, not derived from a user id, an e-mail or a private
// link. What it opens is the bounded payload `sp_get_social_share` builds from
// the holder's CURRENT rows for exactly the credentials they approved.
//
// This module is pure: parsing, the shape the shared renderer expects, the
// link-preview text and the address. It imports no database or server code.
//
// ── THE PAGE IS THE RECORD, THE PREVIEW IS A TEASER ─────────────────────
//
// The link preview a platform draws (title, description, image) is a copy that
// the platform may keep after the link is revoked. The page behind the link is
// re-read on every open. So the preview text says what the Passport IS and
// names what was approved, and the page says what is true NOW.
//
// ── NO IMAGE COMES FROM A CLIENT ────────────────────────────────────────
//
// The preview image is the branded CQrityjob Passport image. A personalised
// image is only ever drawn from this controlled payload, never uploaded: a
// client-supplied picture can say anything. See the migration for the reason.

import type { RecipientClaim, RecipientPayloadActive } from "./packages";
import { publicShareOrigin } from "./public-origin";

/** 144 random bits, URL-safe. */
export const PUBLIC_SHARE_ID_RE = /^[A-Za-z0-9_-]{24}$/;

export type PublicShareLabel = "full_name" | "initials" | "anonymous";

export interface PublicSocialShareActive {
  readonly status: "active";
  readonly locale: "sv" | "en";
  /** When the holder approved this share. */
  readonly approvedAt: string;
  readonly expiresAt: string;
  /** When the SERVER read this, stamped there: the page never asserts a time
   *  from the visitor's own clock. */
  readonly checkedAt: string;
  /** Already reduced to the more restrictive of what the holder approved and
   *  their privacy setting now. Null: no name is shown. */
  readonly holder: string | null;
  readonly holderLabel: PublicShareLabel;
  readonly jurisdiction: string | null;
  readonly passportNumber: number | null;
  /** A product designation, not proof of a credential. */
  readonly designation: "founder" | null;
  readonly claims: readonly RecipientClaim[];
}

export type PublicSocialShare =
  | PublicSocialShareActive
  // One answer for an unknown id, an expired share and a revoked one.
  | { readonly status: "unavailable" }
  // The read itself failed. Never presented as "unavailable": a transport
  // failure says nothing about the share.
  | { readonly status: "error" };

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Allow-list parse. Anything unexpected is "unavailable", never rendered. */
export function parsePublicSocialShare(raw: unknown, checkedAt: string): PublicSocialShare {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { status: "unavailable" };
  }
  const r = raw as Record<string, unknown>;
  if (r.status !== "active") return { status: "unavailable" };
  const approvedAt = str(r.snapshot_at);
  const expiresAt = str(r.expires_at);
  if (!approvedAt || !expiresAt || !Array.isArray(r.claims)) return { status: "unavailable" };

  const label: PublicShareLabel =
    r.holder_label === "initials" || r.holder_label === "anonymous" ? r.holder_label : "full_name";
  const number =
    typeof r.passport_number === "number" &&
    Number.isSafeInteger(r.passport_number) &&
    r.passport_number >= 1
      ? r.passport_number
      : null;

  const claims: RecipientClaim[] = [];
  for (const item of r.claims) {
    if (typeof item !== "object" || item === null) continue;
    const c = item as Record<string, unknown>;
    const title = str(c.title);
    const assertion = str(c.assertion);
    const lifecycle = str(c.lifecycle);
    if (!title || !assertion || !lifecycle) continue;
    claims.push({
      key: str(c.key) ?? `c${claims.length + 1}`,
      type: str(c.type) ?? "certification",
      title,
      credential_code: str(c.credential_code),
      // Never published, by design of the database function.
      issuer: null,
      jurisdiction: str(c.jurisdiction),
      sub_jurisdiction: str(c.sub_jurisdiction),
      scope_code: str(c.scope_code),
      no_expiry: c.no_expiry === true,
      issued_on: null,
      valid_until: str(c.valid_until),
      assertion,
      lifecycle,
      verified_at: str(c.verified_at),
      verifier_organisation: str(c.verifier_organisation),
      verification_method: str(c.verification_method),
    });
  }

  return {
    status: "active",
    locale: r.locale === "en" ? "en" : "sv",
    approvedAt,
    expiresAt,
    checkedAt,
    holder: label === "anonymous" ? null : str(r.holder),
    holderLabel: label,
    jurisdiction: str(r.jurisdiction),
    passportNumber: number,
    designation: r.designation === "founder" ? "founder" : null,
    claims,
  };
}

/** The shape the shared recipient renderer reads, so the opened page draws the
 *  same shields, words and scopes as every other Passport surface. */
export function toRecipientPayload(share: PublicSocialShareActive): RecipientPayloadActive {
  return {
    status: "active",
    package: "selected_merits",
    focus: "passport",
    purpose: null,
    locale: share.locale,
    expires_at: share.expiresAt,
    authorised_at: share.approvedAt,
    checked_at: share.checkedAt,
    last_updated: share.approvedAt,
    holder: share.holder,
    privacy_mode: share.holderLabel,
    profession_slug: null,
    jurisdiction: share.jurisdiction ?? "",
    verified_claims: share.claims,
    verified_experience: [],
    verified_experience_days: 0,
  };
}

/** The public address of a share. Always the configured public origin, never
 *  the browser's own, so a preview host cannot end up in a post. */
export function publicSocialShareUrl(publicId: string): string {
  return `${publicShareOrigin()}/s/${publicId}`;
}

/** The founder's separate designation, by language. A designation of the
 *  product, not a professional qualification. */
export const FOUNDER_DESIGNATION: Readonly<Record<"sv" | "en", string>> = {
  sv: "Grundare av CQrityjob",
  en: "Founder of CQrityjob",
};

export interface LinkPreview {
  readonly title: string;
  readonly description: string;
}

const MAX_NAMED = 4;

/** The text a platform draws under the link, in the language the holder chose
 *  for this share. It names the approved credentials without claiming a
 *  standing: standing is on the page. */
export function linkPreviewFor(share: PublicSocialShare): LinkPreview {
  if (share.status !== "active") {
    // Generic and bilingual: whoever holds the link learns nothing about a
    // person, an expired share or a withdrawn one.
    return {
      title: "Security Passport — CQrityjob",
      description:
        "Den här delningen är inte längre tillgänglig. / This share is no longer available.",
    };
  }
  const l = share.locale;
  const number = share.passportNumber !== null ? ` #${share.passportNumber}` : "";
  const title = share.holder
    ? `${share.holder} · Security Passport${number}`
    : `Security Passport${number}`;
  const names = share.claims.slice(0, MAX_NAMED).map((c) => c.title);
  const more = share.claims.length - names.length;
  const parts: string[] = [];
  if (share.designation) parts.push(FOUNDER_DESIGNATION[l]);
  if (names.length > 0) {
    parts.push(
      names.join(", ") + (more > 0 ? (l === "sv" ? ` och ${more} till` : ` and ${more} more`) : ""),
    );
  }
  parts.push(
    l === "sv"
      ? "Öppna länken för aktuell status. Varje merit visar sin egen källa."
      : "Open the link for current status. Each credential shows its own source.",
  );
  return { title, description: parts.join(" · ") };
}

/** A transport failure or an invalid id, as the page renders it. */
export function isWellFormedPublicId(id: unknown): id is string {
  return typeof id === "string" && PUBLIC_SHARE_ID_RE.test(id);
}

// ── The holder's side of the same feature: results and refusals ─────────

export type CreateSocialShareResult =
  | {
      readonly status: "created" | "already_created";
      readonly publicId: string;
      readonly expiresAt: string;
    }
  | { readonly status: "failed"; readonly code: SocialShareErrorCode };

export type SocialShareErrorCode =
  | "nothing_selected"
  | "not_shareable"
  | "too_many"
  | "key_conflict"
  | "no_passport"
  // The holder's privacy setting hides their name; a personal share shows it.
  | "name_not_approved"
  | "unknown";

/** The database's own refusal codes, mapped to a closed set the page words. */
export function socialShareErrorCode(message: string): SocialShareErrorCode {
  if (message.includes("SP_NOTHING_SELECTED")) return "nothing_selected";
  if (message.includes("SP_MERIT_NOT_SHAREABLE")) return "not_shareable";
  if (message.includes("SP_TOO_MANY_SOCIAL_SHARES")) return "too_many";
  if (message.includes("SP_REQUEST_KEY_CONFLICT")) return "key_conflict";
  if (message.includes("SP_NO_PASSPORT")) return "no_passport";
  if (message.includes("SP_NAME_NOT_APPROVED")) return "name_not_approved";
  return "unknown";
}

export interface MySocialShare {
  readonly publicId: string;
  readonly locale: "sv" | "en";
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly status: "active" | "expired" | "revoked";
  readonly claims: number;
}

export interface MyPassportNumber {
  readonly number: number | null;
  readonly designation: "founder" | null;
}
