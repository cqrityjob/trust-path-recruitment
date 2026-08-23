// Security Passport — the recipient presentation model.
//
// ── ONE MODEL, THREE SURFACES ──────────────────────────────────────────
//
// The recipient page, the Passport card rendered on it and the downloadable
// image are three renderings of ONE thing. Before this module they were
// three independent readings of the payload, which is how a page and a PNG
// end up disagreeing about whether a licence is current — the single most
// damaging kind of drift a trust product can have.
//
// So the payload is interpreted exactly once, here, and every surface
// renders the result. Adding a surface means consuming this model, not
// re-reading `sp_get_disclosure`.
//
// ── EVERYTHING COMES FROM THE SERVER ───────────────────────────────────
//
// The input is `RecipientPayloadActive`, assembled by `sp_get_disclosure`
// from the package contract. This module adds no field the server did not
// send. In particular the credential SYMBOL is derived from
// `credential_code` — server-authored and FK-constrained — and never from
// the holder-typed `title`, which would let a holder choose the mark a
// stranger sees.
//
// ── EXPIRY IS DERIVED HERE TOO ─────────────────────────────────────────
//
// The disclosure only carries claims stored `active`, but nothing writes
// `expired` on the day a licence lapses. `validityOf` is therefore applied
// to every disclosed claim, so a lapsed authorisation is presented as
// expired on the page AND in the image, rather than as currently verified.

import { deriveVerifiedIdentity } from "./identity/visibility";
import { toPublicTitles } from "./identity/presentation";
import { MIRRORED_TITLE_RULES } from "./identity/market-rules";
import type { PublicTitle, TitleRule } from "./identity/types";
import { credentialPresentation } from "./design/credential-symbols";
import type { CredentialPresentationState } from "./design/credential-symbols";
import type { RecipientPayloadActive } from "./packages";
import type { AssertionLevel, Claim, IsoDate, LifecycleState } from "./types";
import { validityOf } from "./validity";

export interface RecipientCredential {
  readonly id: string;
  readonly title: string;
  /** Taxonomy code, or null for a free-text credential. */
  readonly code: string | null;
  /** Derived from the two axes plus the calendar. Never stored. */
  readonly presentation: CredentialPresentationState;
  /** Effective lifecycle on the reading date. */
  readonly lifecycle: LifecycleState;
  readonly assertion: AssertionLevel;
  /** True when the calendar overtook the stored state. */
  readonly lapsed: boolean;
  readonly issuer: string | null;
  readonly jurisdiction: string | null;
  /** The emirate or region, where the regulator is sub-national. */
  readonly subJurisdiction: string | null;
  /** The approval has boundaries. True on every package, including the public
   *  card, where the exact scope is deliberately withheld. */
  readonly scopeLimited: boolean;
  /** What it is limited to. Null unless this reader is entitled to it. */
  readonly authorisationScope: string | null;
  readonly issuedOn: IsoDate | null;
  readonly validUntil: IsoDate | null;
  readonly verifiedAt: string | null;
  readonly verifierOrganisation: string | null;
  readonly verificationMethod: string | null;
}

export interface RecipientExperience {
  readonly id: string;
  readonly employer: string;
  readonly role: string;
  readonly startedOn: IsoDate;
  readonly endedOn: IsoDate | null;
  readonly jurisdiction: string | null;
}

export interface RecipientPresentation {
  readonly holderLabel: string | null;
  readonly privacyMode: string;
  readonly professionSlug: string | null;
  /** What the DISCLOSED credentials support, derived here by the same engine
   *  the holder's own Passport uses.
   *
   *  The page used to print a fixed "Väktare" for anybody whose
   *  `profession_slug` was non-null — to a stranger, on a public URL, on
   *  evidence that was never checked. The slug is still carried above because
   *  other things read it, but nothing renders a title from it any more. */
  readonly titles: readonly PublicTitle[];
  readonly jurisdiction: string;
  readonly packageCode: string;
  /** "credential" when the holder shared exactly one credential. */
  readonly focus: "passport" | "credential";
  readonly purpose: string | null;
  readonly expiresAt: string | null;
  /** When the holder authorised the disclosure, where the payload carries it. */
  readonly authorisedAt: string | null;
  readonly lastUpdated: string;
  readonly credentials: readonly RecipientCredential[];
  readonly experience: readonly RecipientExperience[];
  /** 0 when the package does not disclose a tenure total. */
  readonly verifiedExperienceDays: number;
  /** True when at least one disclosed credential is no longer current. */
  readonly containsExpired: boolean;
  /** True when the package disclosed nothing at all. */
  readonly isEmpty: boolean;
}

/** Interprets one disclosure payload. Pure: no network, no clock of its own
 *  — the reading date is passed in so the same payload renders identically
 *  on the page and in the exported image. */
/** One disclosed credential, in the shape the derivation engine reads.
 *
 *  The recipient payload is deliberately narrower than a `Claim` — it carries
 *  no holder note, no version lineage and no private reference — so the unused
 *  fields are filled with the values that mean "not disclosed". None of them
 *  affects derivation: the engine reads the code, the jurisdiction, the
 *  evidence and the dates, all four of which the payload does carry. */
function toDomainClaim(c: RecipientPayloadActive["verified_claims"][number]): Claim {
  return {
    id: c.id,
    claimType: c.type as Claim["claimType"],
    credentialCode: c.credential_code,
    skillCode: null,
    skillLevel: null,
    titleSv: c.title,
    titleEn: c.title,
    issuerName: c.issuer ?? "—",
    jurisdictionCode: c.jurisdiction,
    subJurisdictionCode: c.sub_jurisdiction ?? null,
    // Present only when the reader is entitled to it; sp_disclosure_payload
    // decides, and this never second-guesses it.
    authorisationScope: c.authorisation_scope ?? null,
    issuedOn: c.issued_on,
    validFrom: null,
    validUntil: c.valid_until,
    assertionLevel: c.assertion as AssertionLevel,
    lifecycleState: c.lifecycle as LifecycleState,
    verifierName: c.verifier_organisation,
    limitationSv: null,
    limitationEn: null,
    versionNo: 1,
    supersedesClaimId: null,
  };
}

export function buildRecipientPresentation(
  payload: RecipientPayloadActive,
  evaluationOn: IsoDate,
  /** The derivation rules. Defaults to the mirrored set because the public
   *  recipient page renders without a session and cannot query the rules
   *  table; a caller that HAS them should pass them. */
  rules: readonly TitleRule[] = MIRRORED_TITLE_RULES,
): RecipientPresentation {
  const credentials: RecipientCredential[] = payload.verified_claims.map((c) => {
    const assertion = c.assertion as AssertionLevel;
    const validity = validityOf(c.lifecycle as LifecycleState, c.valid_until, evaluationOn);
    return {
      id: c.id,
      title: c.title,
      code: c.credential_code,
      presentation: credentialPresentation(assertion, validity.effectiveState),
      lifecycle: validity.effectiveState,
      assertion,
      lapsed: validity.hasExpired,
      issuer: c.issuer,
      jurisdiction: c.jurisdiction,
      subJurisdiction: c.sub_jurisdiction ?? null,
      scopeLimited: c.scope_limited === true,
      authorisationScope: c.authorisation_scope ?? null,
      issuedOn: c.issued_on,
      validUntil: c.valid_until,
      verifiedAt: c.verified_at,
      verifierOrganisation: c.verifier_organisation,
      verificationMethod: c.verification_method,
    };
  });

  const experience: RecipientExperience[] = payload.verified_experience.map((e) => ({
    id: e.id,
    employer: e.employer,
    role: e.role,
    startedOn: e.started_on,
    endedOn: e.ended_on,
    jurisdiction: e.jurisdiction,
  }));

  // Derived from the disclosed claims alone. A recipient sees a title exactly
  // when the credentials in front of them support it — never because the
  // holder's profile said so, and never for a credential the package withheld.
  const identity = deriveVerifiedIdentity(
    payload.verified_claims.map(toDomainClaim),
    rules,
    evaluationOn,
  );

  return {
    holderLabel: payload.holder,
    privacyMode: payload.privacy_mode,
    professionSlug: payload.profession_slug,
    titles: toPublicTitles(identity),
    jurisdiction: payload.jurisdiction,
    packageCode: payload.package,
    focus: payload.focus ?? "passport",
    purpose: payload.purpose,
    expiresAt: payload.expires_at,
    authorisedAt: payload.authorised_at ?? null,
    lastUpdated: payload.last_updated,
    credentials,
    experience,
    verifiedExperienceDays: payload.verified_experience_days,
    containsExpired: credentials.some((c) => c.lifecycle === "expired"),
    isEmpty:
      credentials.length === 0 && experience.length === 0 && payload.verified_experience_days === 0,
  };
}
