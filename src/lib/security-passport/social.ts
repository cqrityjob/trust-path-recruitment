// Security Passport — the socially-safe card.
//
// ── WHY THIS IS A SEPARATE MODEL, NOT A UI FLAG ────────────────────────
//
// A social image is the one artifact that leaves CQrityjob's control
// completely: it gets cached by platforms, re-shared, screenshotted and
// kept long after a credential expires or a share is revoked. So the safe
// subset is defined as its OWN type, built by its OWN function that reads
// only the permitted fields.
//
// That direction of travel matters. A "hideSensitive" boolean on the full
// card model would put one forgotten `&&` between a security professional
// and the publication of their employer history. Here the unsafe fields are
// not hidden — they are never read, and `buildSocialCard` has no parameter
// that could reintroduce them.
//
// ── WHAT IS DELIBERATELY ABSENT, AND WHY ───────────────────────────────
//
// Issuer and verifier attribution appear on the full Security Passport and on
// the verification page, but NOT here. For a Väktare, the issuer of a
// verified employment credential IS an employer, so publishing issuers
// publishes an employment history — which the owner's brief prohibits on a
// broadly-shared surface. The recipient who needs attribution gets it by
// following the verification link, where the holder's scope still applies.
//
// Also absent: certificate and licence numbers, document images, dates of
// any kind, exact employers, assignments, contact details and internal
// claim ids.
//
// ── WHY THE CARD TELLS YOU NOT TO TRUST IT ─────────────────────────────
//
// A cached image can outlive the credential it depicts. Every social card
// therefore carries a verify-at-source line: the image is a summary, and
// the live verification page is the only authoritative current status.

import { withoutSelfDeclared } from "./identity/visibility";
import { effectiveAssertionLevel } from "./provenance";
import { credentialPresentationOf, presentationWordKeyOf } from "./trust-presentation";
import type { CredentialPresentationState } from "./design/credential-symbols";
import type { PassportCopyKey } from "./i18n";
import type { RecipientCredential } from "./recipient-presentation";
import { toPublicTitles } from "./identity/presentation";
import type { PublicTitle } from "./identity/types";
import { totalsByEvidenceLevel } from "./experience";
import { recognitionFor } from "./recognition";
import { validityOf } from "./validity";
import type { Claim, IsoDate, PassportHolder } from "./types";

export type PrivacyMode = "full_name" | "initials" | "anonymous";

/** Fixture-only verification destination. Not a live route: Phase 1B claims
 *  no production URL, and /p/:token remains unclaimed. */
export const FIXTURE_VERIFY_ORIGIN = "cqrityjob.example/p";

export interface SocialCredentialName {
  readonly id: string;
  /** Taxonomy code for the credential symbol, or null for free text. */
  readonly code: string | null;
  readonly nameSv: string;
  readonly nameEn: string;
  /** The shield's treatment, from the shared presentation: verified only for
   *  a source confirmation, documented for a CQrityjob review, self-declared
   *  for the holder's own entry. Never raised for the image. */
  readonly state: CredentialPresentationState;
  /** The word beside the shield, from the shared labeller, for that state. */
  readonly statusWordKey: PassportCopyKey;
  /** Where the credential applies, for its flag and written scope: the same
   *  three facts the shared card resolves its shields from. */
  readonly scope: {
    readonly global: boolean;
    readonly jurisdictionCode: string | null;
    readonly subJurisdictionCode: string | null;
  };
}

export interface SocialCardModel {
  /** Already privacy-transformed. The raw name is not carried. */
  readonly holderLabel: string;
  readonly privacyMode: PrivacyMode;
  /** The headline titles, reduced to words and jurisdiction. Not a
   *  `ProfessionalIdentity`: an exported image must carry no dates, and the
   *  forbidden-key guard caught `expiresOn` here on the first attempt. */
  readonly titles: readonly PublicTitle[];
  /** NULL when the holder has not stated a work country. Rendered as "not
   *  stated" by formatJurisdiction — never silently as a country. */
  readonly jurisdictionCode: string | null;
  /** Verified years only, or null. The single permitted prominent number. */
  readonly milestoneYears: number | null;
  /** NAMES ONLY — no issuer, no dates, no numbers. The source-confirmed,
   *  current credentials: never anything less, under any builder. */
  readonly verifiedCredentials: readonly SocialCredentialName[];
  /** What the image draws, each at its own truthful state. The fixture card
   *  draws its verified list; the sharing centre's card draws the holder's
   *  selection (`buildSelectedSocialCard`). */
  readonly credentials: readonly SocialCredentialName[];
  /** The share link printed on the image with its QR code, or NULL: no link
   *  and no QR at all. A live social image is null unless the holder created
   *  a link for it and chose to show it. A fixture carries an opaque fixture
   *  address, never an id drawn from the holder's data. */
  readonly verifyUrl: string | null;
  /** True when the underlying share is no longer active — the card then
   *  leads with "check current status" rather than the milestone. */
  readonly staleWarning: boolean;
}

/** Field names that must NEVER appear in a serialized social card. Exported
 *  so scripts/passport-fixture-check.ts can assert it rather than trust it. */
export const SOCIAL_FORBIDDEN_KEYS: readonly string[] = [
  "issuerName",
  "verifierName",
  "employerName",
  "roleTitle",
  "periods",
  "claims",
  "issuedOn",
  "validUntil",
  "validFrom",
  "startedOn",
  "endedOn",
  "claimId",
  "limitationSv",
  "limitationEn",
  // The protected object, employer or principal a skyddsvakt approval is
  // limited to. It belongs to an application-scoped disclosure and to the
  // employer_review / full_verification packages — never to an image that
  // outlives the record it depicts.
  "authorisationScope",
  "authorisation_scope",
  "scopeRestriction",
  "assertionLevel",
  "lifecycleState",
  "fteFraction",
  "securityFraction",
  "email",
  "phone",
] as const;

function initialsOf(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(" ");
}

function holderLabelFor(holder: PassportHolder, mode: PrivacyMode, anonymousLabel: string): string {
  if (mode === "full_name") return holder.displayName;
  if (mode === "initials") return initialsOf(holder.displayName);
  return anonymousLabel;
}

/** A stable, opaque fixture token. Deliberately NOT derived from the
 *  holder's id or any claim id: a shareable URL that encodes an internal
 *  identifier is an enumeration surface in the eventual production system,
 *  and prototypes have a way of becoming the specification. */
function fixtureToken(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").repeat(4).slice(0, 32);
}

export interface SocialCardOptions {
  readonly privacyMode: PrivacyMode;
  /** Localised fallback used when privacyMode is "anonymous". */
  readonly anonymousLabel: string;
  /** How many verified credential names to name. Capped at three so the
   *  card stays a summary rather than a dossier. */
  readonly maxCredentials?: number;
  readonly staleWarning?: boolean;
  /** The live recipient URL for a real, revocable disclosure, or null for
   *  an image that carries no link at all.
   *
   *  Omitted, the fixture prototype keeps its opaque fixture token and stays
   *  incapable of pointing at a real page. The sharing centre always passes
   *  it: null, unless the holder created a link for exactly what the image
   *  shows and chose to print it. */
  readonly verifyUrl?: string | null;
}

const MAX_SOCIAL_CREDENTIALS = 3;
/** The most credentials one social image names. Exported so the sharing
 *  centre stops a selection at the same number the image would cut it to. */
export const SOCIAL_CREDENTIAL_LIMIT = MAX_SOCIAL_CREDENTIALS;

/**
 * Source-confirmed and current on the day it is read: what may be NAMED AS
 * VERIFIED on a social image. Nothing less, whatever its standing elsewhere.
 *
 * "Current" is DERIVED from the dates, never read from the stored state:
 * nothing writes `expired` on the day a licence lapses.
 */
function isVerifiedAndCurrent(c: Claim, evaluationOn: IsoDate): boolean {
  return (
    effectiveAssertionLevel(c) === "verified" &&
    validityOf(c.lifecycleState, c.validUntil, evaluationOn).effectiveState === "active"
  );
}

/**
 * Whether a credential, as the SHARED presentation derived it, may be drawn on
 * the holder's social image: when it is CURRENT -- the shared card's own rule
 * for a shield, which means "holds this now". An expired, revoked, superseded
 * or disputed credential is history, and history is never published to the
 * one surface that cannot be recalled.
 *
 * It is drawn at the state that presentation gave it, with that state's word:
 * a CQrityjob review stays "Dokumenterad", the holder's own entry stays
 * "Egenrapporterad", and only a source confirmation is ever verified. The
 * image says nothing the shared card would not.
 */
export function isSocialPublishable(credential: { readonly lifecycle: string }): boolean {
  return credential.lifecycle === "active";
}

export function buildSocialCard(
  holder: PassportHolder,
  evaluationOn: IsoDate,
  options: SocialCardOptions,
): SocialCardModel {
  const totals = totalsByEvidenceLevel(holder.periods, evaluationOn);
  const recognition = recognitionFor(totals);

  // Verified AND currently valid. An expired credential is honest content
  // on the Security Passport, where its state is shown beside it — but a social
  // image cannot carry that qualification reliably once it is cached, so it
  // is simply not published.
  //
  // "Currently valid" is DERIVED, not read from the stored state. Nothing
  // writes `expired` on the day a licence lapses, so a stored-state filter
  // would publish a lapsed authorisation to the one surface that can never
  // be recalled. That is the single worst failure this module could have.
  const verifiedCredentials = holder.claims
    .filter((c) => isVerifiedAndCurrent(c, evaluationOn))
    .slice(0, options.maxCredentials ?? MAX_SOCIAL_CREDENTIALS)
    .map((c) => ({
      id: c.id,
      code: c.credentialCode,
      nameSv: c.titleSv,
      nameEn: c.titleEn,
      state: credentialPresentationOf(c, "active"),
      statusWordKey: presentationWordKeyOf(c, credentialPresentationOf(c, "active")),
      // The holder's own record does not say whether a DEFINITION is
      // international, and a globe is never guessed: such a credential wears
      // its stated jurisdiction, or none.
      scope: {
        global: false,
        jurisdictionCode: c.jurisdictionCode,
        subJurisdictionCode: c.subJurisdictionCode,
      },
    }));

  return {
    holderLabel: holderLabelFor(holder, options.privacyMode, options.anonymousLabel),
    privacyMode: options.privacyMode,
    titles: toPublicTitles(withoutSelfDeclared(holder.identity)),
    // -- ELIGIBILITY IS DELIBERATELY ABSENT HERE ----------------------
    //
    // Every other surface that can show "currently permitted" is LIVE: the
    // holder's own view, the recipient page and the public token page are all
    // re-derived on each read, so an approval that lapses stops being claimed.
    //
    // A social image is not. It is a PNG that platforms fetch, cache and
    // cannot be told to forget, and it outlives the record it depicts. That is
    // already why an expired credential is never published here and why
    // PublicTitle carries no dates. "Currently approved" is a statement about
    // TODAY, and today is exactly what a cached image cannot keep saying
    // truthfully.
    //
    // So this is a judgement about the medium, not about sensitivity, and it
    // must stay a deliberate omission rather than a gap somebody fills in.
    jurisdictionCode: holder.jurisdictionCode,
    milestoneYears: recognition.earnedYears,
    verifiedCredentials,
    credentials: verifiedCredentials,
    verifyUrl:
      options.verifyUrl === undefined
        ? `${FIXTURE_VERIFY_ORIGIN}/${fixtureToken(holder.id)}`
        : options.verifyUrl,
    staleWarning: options.staleWarning ?? false,
  };
}

/**
 * The social card for a SELECTION, as the sharing centre draws it.
 *
 * Who the holder is comes from `buildSocialCard` -- their privacy setting, the
 * titles their credentials support, their work country -- exactly as before.
 * Which credentials it draws comes from the selected disclosure's own
 * presentation (`buildRecipientPresentation` over the server's preview), the
 * model the recipient card draws from: the same state, the same word, the
 * same shield and scope. Of those, only what `isSocialPublishable` admits, at
 * most `SOCIAL_CREDENTIAL_LIMIT`. Anything the holder did not select was never
 * in the preview, so it cannot appear.
 *
 * `verifiedCredentials` keeps its meaning under this builder too: only the
 * drawn credentials the presentation calls verified, which today -- with no
 * structural source confirmation for a credential -- is none.
 *
 * The presentation is in the image's language already, so each name is used
 * as given in both slots.
 */
export function buildSelectedSocialCard(
  holder: PassportHolder,
  evaluationOn: IsoDate,
  credentials: readonly RecipientCredential[],
  options: Omit<SocialCardOptions, "maxCredentials"> & { readonly verifyUrl: string | null },
): SocialCardModel {
  const identity = buildSocialCard(holder, evaluationOn, { ...options, maxCredentials: 0 });
  const drawn = credentials
    .filter(isSocialPublishable)
    .slice(0, MAX_SOCIAL_CREDENTIALS)
    .map((c) => ({
      id: c.key,
      code: c.code,
      nameSv: c.title,
      nameEn: c.title,
      state: c.presentation,
      statusWordKey: c.statusWordKey,
      scope: {
        global: c.definitionScope === "global",
        jurisdictionCode: c.jurisdiction,
        subJurisdictionCode: c.subJurisdiction,
      },
    }));
  return {
    ...identity,
    verifiedCredentials: drawn.filter((c) => c.state === "verified"),
    credentials: drawn,
  };
}

/** Prototype-only share destinations. No production API is contacted and no
 *  public post is created — these render intent, nothing more. */
export type ShareChannel =
  | "linkedin"
  | "facebook"
  | "x"
  | "whatsapp"
  | "email"
  | "copy_link"
  | "native"
  | "download_square"
  | "download_story";

export const SHARE_CHANNELS: readonly ShareChannel[] = [
  "linkedin",
  "facebook",
  "x",
  "whatsapp",
  "email",
  "copy_link",
  "native",
  "download_square",
  "download_story",
] as const;

/** Instagram is intentionally absent as a "post" channel: the platform has
 *  no web publishing API for this, so offering a button would promise
 *  something that cannot happen. The Story download serves that case and is
 *  labelled as such. */
export const INSTAGRAM_VIA_DOWNLOAD: ShareChannel = "download_story";
