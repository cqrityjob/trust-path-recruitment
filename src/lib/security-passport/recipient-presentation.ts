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
import { toPublicEligibility, toPublicTitles } from "./identity/presentation";
import { MIRRORED_TITLE_RULES } from "./identity/market-rules";
import type { PublicTitle, TitleRule } from "./identity/types";
import type { CredentialPresentationState } from "./design/credential-symbols";
import { effectiveAssertionLevel, isLegacyUnsupportedProvenance } from "./provenance";
import {
  credentialPresentationOf,
  describeTrust,
  presentationWordKeyOf,
  provenanceLabelKeys,
  publicTrustLevel,
  unsupportedSourceNoticeKey,
  type ProvenanceLabelKeys,
  type PublicTrustLevel,
} from "./trust-presentation";
import type { PassportCopyKey } from "./i18n";
import { presentationKeyOf, type RecipientPayloadActive } from "./packages";
import type { AssertionLevel, Claim, IsoDate, LifecycleState } from "./types";
import { validityOf } from "./validity";

export interface RecipientCredential {
  /** The payload's presentation key, never a database identifier. Used as the
   *  React key, as the `data-recipient-credential` hook and as the id the
   *  identity engine derives titles against — all of which need uniqueness
   *  within one render and nothing more. */
  readonly key: string;
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
  /** True for a source-confirmation method CQrityjob recorded about itself
   *  (pre-20261030090000). Stored facts above are untouched; everything
   *  below is derived from them once, here. */
  readonly legacyUnsupported: boolean;
  /** The neutral sentence this record carries, or null when it needs none.
   *  Any recorded source method the product cannot structurally support has
   *  one -- the legacy rows and every issuer confirmation. */
  readonly noticeKey: PassportCopyKey | null;
  /** The level every derivation and every chip reads. document_provided for
   *  a legacy unsupported row; the stored level otherwise. */
  readonly effectiveAssertion: AssertionLevel;
  /** self_declared · documented · source_verified, or null when the standing
   *  could not be read. Derived through `describeTrust`, never assembled by
   *  a route from the raw method and organisation. */
  readonly level: PublicTrustLevel | null;
  /** The status word beside the symbol. "Dokumenterad / Documented" for a
   *  legacy unsupported row; the symbol vocabulary's own word otherwise. */
  readonly statusWordKey: PassportCopyKey;
  /** Who / how / when labels that do not claim more than the record can. */
  readonly labels: ProvenanceLabelKeys;
}

export interface RecipientExperience {
  readonly key: string;
  readonly employer: string;
  readonly role: string;
  readonly startedOn: IsoDate;
  readonly endedOn: IsoDate | null;
  readonly jurisdiction: string | null;
  /** The DECIDER, and the act. Undefined when the share did not say — which
   *  is every package share, because no package emits employment provenance.
   *  A renderer must print nothing for undefined rather than assume a level:
   *  "verified with nobody named" and "we were not told" are different
   *  states, and only one of them is a claim. */
  readonly verifiedBy?: string | null;
  readonly verificationMethod?: string | null;
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
  /** What an authority currently PERMITS, as distinct from what the holder may
   *  be called. Reduced exactly like `titles`: no dates, no scope, no claim
   *  ids — the credential row beside it carries the validity. */
  readonly eligibility: readonly PublicTitle[];
  /** Where the HOLDER works. Never a credential's jurisdiction — each
   *  credential below carries its own, so a Swedish authorisation still reads
   *  Sweden however far from Sweden its holder now works. */
  readonly jurisdiction: string;
  /** The emirate, where there is one. Carried so a Dubai holder is not
   *  flattened into "United Arab Emirates" on the one surface a stranger
   *  sees — which is the UAE-wide reading the Dubai pack refuses. */
  readonly subJurisdiction: string | null;
  readonly packageCode: string;
  /** The language the holder chose for this recipient, or null for the
   *  reader's own. Carried, never applied here: this module produces a model,
   *  and choosing words from it is the renderer's job. */
  readonly locale: "sv" | "en" | null;
  /** "credential" when the holder shared exactly one credential. */
  readonly focus: "passport" | "credential";
  readonly purpose: string | null;
  readonly expiresAt: string | null;
  /** When the holder authorised the disclosure, where the payload carries it. */
  readonly authorisedAt: string | null;
  readonly lastUpdated: string;
  readonly credentials: readonly RecipientCredential[];
  readonly experience: readonly RecipientExperience[];
  /** CONFIRMED employment duration, in days.
   *
   *  Named for what it counts. A selected share sums the SELECTED periods and,
   *  among those, only the ones somebody confirmed — a self-declared
   *  employment appears in the list above and is deliberately not in this
   *  number. 0 when the share discloses no confirmed employment. */
  readonly confirmedEmploymentDays: number;
  /** When the server last re-read this record. Null on a preview, which
   *  re-reads nothing, and on a payload from before 20261101090000. */
  readonly checkedAt: string | null;
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
function toDomainClaim(c: RecipientPayloadActive["verified_claims"][number], index: number): Claim {
  return {
    // The presentation key stands in for the id here too. The identity engine
    // needs a value that is unique within this one derivation; it never
    // resolves it against anything.
    id: presentationKeyOf(c, index, "c"),
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
    // The EFFECTIVE level, so the identity engine reads a legacy unsupported
    // credential as documented and derives no title or eligibility from it.
    // (visibility.ts applies the same projection; this keeps the domain claim
    // honest for any other reader too.)
    assertionLevel: effectiveAssertionLevel({
      assertionLevel: c.assertion,
      verifierName: c.verifier_organisation,
      verificationMethod: c.verification_method,
    }),
    lifecycleState: c.lifecycle as LifecycleState,
    // Provenance travels from the disclosure payload unchanged. The recipient
    // surface is the one a stranger reads with no way to check anything
    // behind it, so "who decided, how, and when" arrives as three separate
    // recorded facts and is never assembled out of the issuer.
    verifierName: c.verifier_organisation,
    verificationMethod: (c.verification_method as Claim["verificationMethod"]) ?? null,
    // Sliced to a calendar day: `verifiedOn` is a date across the domain,
    // and the payload carries a timestamp.
    verifiedOn: c.verified_at ? c.verified_at.slice(0, 10) : null,
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
  const credentials: RecipientCredential[] = payload.verified_claims.map((c, index) => {
    const assertion = c.assertion as AssertionLevel;
    const validity = validityOf(c.lifecycle as LifecycleState, c.valid_until, evaluationOn);
    // Interpreted ONCE. Every recipient surface -- the page, the card, the
    // single-credential page, the downloadable image -- reads these fields
    // and never re-derives them from the raw method and organisation.
    const bearing = {
      assertionLevel: assertion,
      verifierName: c.verifier_organisation,
      verificationMethod: c.verification_method,
    };
    const legacyUnsupported = isLegacyUnsupportedProvenance(
      c.verification_method,
      c.verifier_organisation,
    );
    const presentation = credentialPresentationOf(bearing, validity.effectiveState);
    const level = publicTrustLevel(
      describeTrust({
        assertionLevel: assertion,
        lifecycleState: validity.effectiveState,
        verifierName: c.verifier_organisation,
        verificationMethod: c.verification_method,
        verifiedOn: c.verified_at ? c.verified_at.slice(0, 10) : null,
      }),
    );
    return {
      key: presentationKeyOf(c, index, "c"),
      title: c.title,
      code: c.credential_code,
      presentation,
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
      legacyUnsupported,
      noticeKey: unsupportedSourceNoticeKey(bearing),
      effectiveAssertion: effectiveAssertionLevel(bearing),
      level,
      statusWordKey: presentationWordKeyOf(bearing, presentation),
      labels: provenanceLabelKeys(bearing),
    };
  });

  const experience: RecipientExperience[] = payload.verified_experience.map((e, index) => ({
    key: presentationKeyOf(e, index, "e"),
    employer: e.employer,
    role: e.role,
    startedOn: e.started_on,
    endedOn: e.ended_on,
    jurisdiction: e.jurisdiction,
    // Carried through UNCHANGED and UNINTERPRETED. The sentence a reader gets
    // is composed by `employmentTrustLine` from these two recorded facts, in
    // employment's own register, so this module states no trust of its own —
    // exactly as it does for credentials above.
    verifiedBy: e.verifier_organisation,
    verificationMethod: e.verification_method,
  }));

  // Derived from the disclosed claims alone. A recipient sees a title exactly
  // when the credentials in front of them support it — never because the
  // holder's profile said so, and never for a credential the package withheld.
  const identity = deriveVerifiedIdentity(
    // `.map(toDomainClaim)` — Array.map supplies the index, which is the
    // fallback the presentation key needs. CLAIMS ONLY: an employment period
    // reaches the identity engine through no path, which
    // passport-trust-source:check asserts on this exact call.
    payload.verified_claims.map(toDomainClaim),
    rules,
    evaluationOn,
  );

  return {
    holderLabel: payload.holder,
    privacyMode: payload.privacy_mode,
    professionSlug: payload.profession_slug,
    titles: toPublicTitles(identity),
    // Derived from `payload.verified_claims` — the claims this package already
    // chose to disclose — so this adds NOTHING to the payload and widens no
    // permission. A package that withholds the approval claim derives no
    // eligibility, automatically and without a second rule to keep in step.
    eligibility: toPublicEligibility(identity),
    jurisdiction: payload.jurisdiction,
    subJurisdiction: payload.sub_jurisdiction ?? null,
    packageCode: payload.package,
    // Narrowed rather than trusted: the column is CHECK-constrained to the two
    // values, and a payload that somehow carried a third would fall back to
    // the reader's own language rather than to a locale nothing can render.
    locale: payload.locale === "sv" || payload.locale === "en" ? payload.locale : null,
    focus: payload.focus ?? "passport",
    purpose: payload.purpose,
    expiresAt: payload.expires_at,
    authorisedAt: payload.authorised_at ?? null,
    lastUpdated: payload.last_updated,
    credentials,
    experience,
    confirmedEmploymentDays: payload.verified_experience_days,
    checkedAt: payload.checked_at ?? null,
    containsExpired: credentials.some((c) => c.lifecycle === "expired"),
    isEmpty:
      credentials.length === 0 && experience.length === 0 && payload.verified_experience_days === 0,
  };
}
