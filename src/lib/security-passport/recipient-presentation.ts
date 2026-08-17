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

import { credentialPresentation } from "./design/credential-symbols";
import type { CredentialPresentationState } from "./design/credential-symbols";
import type { RecipientPayloadActive } from "./packages";
import type { AssertionLevel, IsoDate, LifecycleState } from "./types";
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
  readonly jurisdiction: string;
  readonly packageCode: string;
  readonly purpose: string | null;
  readonly expiresAt: string | null;
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
export function buildRecipientPresentation(
  payload: RecipientPayloadActive,
  evaluationOn: IsoDate,
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

  return {
    holderLabel: payload.holder,
    privacyMode: payload.privacy_mode,
    professionSlug: payload.profession_slug,
    jurisdiction: payload.jurisdiction,
    packageCode: payload.package,
    purpose: payload.purpose,
    expiresAt: payload.expires_at,
    lastUpdated: payload.last_updated,
    credentials,
    experience,
    verifiedExperienceDays: payload.verified_experience_days,
    containsExpired: credentials.some((c) => c.lifecycle === "expired"),
    isEmpty:
      credentials.length === 0 && experience.length === 0 && payload.verified_experience_days === 0,
  };
}
