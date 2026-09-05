// Security Passport — what a recorded verification method actually PROVES.
//
// Run via `bun run passport-trust-source:check`.
//
// ── THE OWNER DECISION THIS HOLDS ──────────────────────────────────────
//
// Three outward trust levels, and nothing else:
//
//   SELF-DECLARED     the holder supplied and attested it
//   DOCUMENTED        CQrityjob reviewed evidence the holder supplied
//   SOURCE-CONFIRMED  the employer, or a structurally identified issuer,
//                     directly confirmed the fact
//
// Source-confirmed has exactly ONE shape today: an employer confirming an
// EMPLOYMENT PERIOD through the authorised employer-attestation path, which
// the database proves structurally (has_employer_role, no self-decision,
// employment-only). Everything else is DOCUMENTED:
//
//   * a CQrityjob document review -- it is a review, not the source;
//   * ANY issuer confirmation, whatever organisation is named, because the
//     product has no issuer identity, membership, receipt, signature or
//     revocation authority behind that name. It fails closed until the
//     Issuer Foundation release introduces a structural signal;
//   * an employer confirmation attached to a credential -- an employer has no
//     standing over a qualification;
//   * a verified level with no recorded method.
//
// The consequence is stated plainly rather than hidden: NO CREDENTIAL CAN
// REACH SOURCE-CONFIRMED TODAY, so no credential derives a regulated title,
// licence, eligibility or authority recognition, and none is published to a
// social image or offered to LinkedIn. The rules that would derive them are
// intact and are asserted firing on the raw engine; the GATE is the bar.
//
// Stored assertion levels, methods, decisions and audit history are never
// rewritten. Only what the product SAYS about them is decided here.
//
// ── WHY IT RENDERS RATHER THAN ONLY READS ──────────────────────────────
//
// This is a property of what a person SEES. The recipient list, card and
// credential page, the holder's claim row, verification panel, chip and
// timeline are rendered for real, in Swedish AND English, and the markup is
// asserted. A guard that only banned "confirmed by the issuer" would pass a
// page that still wore a green VERIFIED pill; this one fails on that too.

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { AssertionChip } from "../src/components/security-passport/AssertionChip";
import { ClaimRow } from "../src/components/security-passport/ClaimRow";
import { ExperienceTimeline } from "../src/components/security-passport/ExperienceTimeline";
import { CredentialVerificationPage } from "../src/components/security-passport/live/CredentialVerificationPage";
import { RecipientCredentialList } from "../src/components/security-passport/live/RecipientCredentialList";
import { RecipientPassportCard } from "../src/components/security-passport/live/RecipientPassportCard";
import { VerificationPanel } from "../src/components/security-passport/live/VerificationPanel";
import { buildRecipientPresentation } from "../src/lib/security-passport/recipient-presentation";
import type { RecipientPayloadActive } from "../src/lib/security-passport/packages";
import { passportT } from "../src/lib/security-passport/i18n";
import {
  CQRITYJOB_DECIDER_ORGANISATION,
  effectiveAssertionLevel,
  effectiveTrust,
  isLegacyUnsupportedProvenance,
  isUnsupportedSourceClaim,
} from "../src/lib/security-passport/provenance";
import {
  formatVerifierAttribution,
  verifierAttributionKey,
} from "../src/lib/security-passport/format";
import {
  credentialPresentationOf,
  describeTrust,
  employmentTrustLine,
  hasCompletedDocumentReview,
  hasLegacyUnsupportedApproval,
  isCurrentlyVerified,
  isEmployerConfirmed,
  methodLabelKey,
  presentsAsVerified,
  provenanceLabelKeys,
  publicTrustLevel,
  trustLabel,
  trustLevelWordKey,
} from "../src/lib/security-passport/trust-presentation";
import {
  classifyDecisionError,
  decisionErrorCodeFrom,
  DECISION_ERROR_PREFIX,
} from "../src/lib/security-passport/decision-errors";
import { deriveVerifiedIdentity } from "../src/lib/security-passport/identity/visibility";
import {
  allDerived,
  deriveProfessionalIdentity,
} from "../src/lib/security-passport/identity/derive";
import { MIRRORED_TITLE_RULES } from "../src/lib/security-passport/identity/market-rules";
import { totalsByEvidenceLevel } from "../src/lib/security-passport/experience";
import { buildPassportCard } from "../src/lib/security-passport/card";
import { buildSocialCard } from "../src/lib/security-passport/social";
import { linkedInProfileEntries } from "../src/lib/security-passport/linkedin-profile";
import { isVerifiedClaim } from "../src/lib/professional-identity/types";
import type { Claim, ExperiencePeriod, PassportHolder } from "../src/lib/security-passport/types";
import type { VerificationDecisionRecord } from "../src/lib/security-passport/verification.functions";

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
/** Source with comments removed: these files DISCUSS the very tokens being
 *  banned, and a naive scan would read the explanation as the offence. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const sv = (n: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{n}</I18nProvider>);
const en = (n: React.ReactNode) =>
  renderToStaticMarkup(<I18nProvider initialLang="en">{n}</I18nProvider>);
/** What a reader sees: tags gone, entities decoded enough to search. */
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

/** The phrases a DOCUMENTED record must never wear, in either language. The
 *  neutral sentences say what a record is NOT, so the test is for the
 *  affirmative claims. */
const FORBIDDEN: readonly RegExp[] = [
  /Bekräftat av/i,
  /Bekräftad av/i,
  /Confirmed by/i,
  /Verified by/i,
  /Verifierad av/i,
  /Verifierat av/i,
  /Source[- ]verified/i,
  /Källverifierad/i,
  /Källbekräftad/i,
  /Source[- ]confirmed/i,
];
const wearsForbidden = (s: string | null | undefined) =>
  typeof s === "string" && FORBIDDEN.some((re) => re.test(s));

/** A CURRENT verified status word, as opposed to "previously verified". */
const wearsCurrentVerified = (visible: string, lang: "sv" | "en") =>
  visible
    .split(passportT("assertion.verified.historical", lang))
    .join("")
    .includes(passportT("assertion.verified", lang));

const LEGACY_SV = passportT("trust.legacy.unsupported", "sv");
const LEGACY_EN = passportT("trust.legacy.unsupported", "en");
const UNSUPPORTED_SV = passportT("trust.unsupportedSource", "sv");
const UNSUPPORTED_EN = passportT("trust.unsupportedSource", "en");
const DOCUMENTED_SV = passportT("trust.level.documented", "sv");
const DOCUMENTED_EN = passportT("trust.level.documented", "en");
const SOURCE_SV = passportT("trust.level.source_verified", "sv");
const SOURCE_EN = passportT("trust.level.source_verified", "en");
const TODAY = "2026-09-05";

/* ================================================================== */
group("GROUP 1 — the reviewer form offers no method");
/* ================================================================== */
{
  const route = code("src/routes/_authenticated.passport-review.tsx");
  ck("1.1 no <select> for the method remains", !/id="sp-method"/.test(route));
  ck("1.2 no issuer_confirmation option", !/["']issuer_confirmation["']/.test(route));
  ck("1.3 no employer_confirmation option", !/["']employer_confirmation["']/.test(route));
  ck("1.4 the fixed method is rendered", /pt\("vq\.methodFixed"\)/.test(route));
  ck("1.5 with its explanation", /pt\("vq\.methodFixed\.help"\)/.test(route));
  ck(
    "1.6 the decision is sent with the fixed document_review method",
    /const REVIEW_METHOD = "document_review" as const;/.test(route) &&
      /const method = REVIEW_METHOD;/.test(route),
  );
  ck("1.7 no setter for a method exists", !/setMethod/.test(route));
  ck(
    "1.8 the refusal for a disallowed method has copy",
    /method_not_permitted: "vq\.decline\.method_not_permitted"/.test(route),
  );
  ck(
    "1.9 the required fixed-method wording is exact in both languages",
    passportT("vq.methodFixed", "sv") === "Dokumentgranskning av CQrityjob" &&
      passportT("vq.methodFixed.help", "sv") ===
        "CQrityjob har granskat det underlag som innehavaren lämnat. Detta är inte en direkt bekräftelse från arbetsgivaren eller utfärdaren." &&
      passportT("vq.methodFixed", "en") === "Document review by CQrityjob" &&
      passportT("vq.methodFixed.help", "en") ===
        "CQrityjob has reviewed evidence provided by the holder. This is not direct confirmation from the employer or issuer.",
  );
}

/* ================================================================== */
group("GROUP 2 — the server function cannot send issuer_confirmation");
/* ================================================================== */
{
  const fn = code("src/lib/security-passport/verification.functions.ts");
  const enumLine = fn.match(/method:\s*z\.enum\(\[([^\]]*)\]\)/);
  ck(
    "2.1 decideInput's method enum is exactly document_review and employer_confirmation",
    enumLine !== null &&
      /"document_review"/.test(enumLine[1]) &&
      /"employer_confirmation"/.test(enumLine[1]) &&
      !/issuer_confirmation/.test(enumLine[1]),
  );
  const employer = code(
    "src/routes/_authenticated.employer.$employerSlug.employment-verifications.$requestId.tsx",
  );
  ck(
    "2.2 the employer surface still records employer_confirmation and nothing else",
    employer.includes('decision === "approved" ? "employer_confirmation" : null') &&
      /method_not_permitted: "vq\.decline\.method_not_permitted"/.test(employer),
  );
  for (const raw of [
    "SP_ISSUER_CONFIRMATION_NOT_AVAILABLE",
    "SP_CQRITYJOB_REVIEW_REQUIRES_DOCUMENT_REVIEW",
    "SP_EMPLOYER_ATTESTATION_REQUIRES_EMPLOYER_CONFIRMATION",
  ]) {
    ck(
      `2.3 ${raw} classifies as method_not_permitted`,
      classifyDecisionError(`ERROR: ${raw}`) === "method_not_permitted",
    );
  }
  ck(
    "2.4 the browser reads the code back off the thrown error, and it has copy",
    decisionErrorCodeFrom(new Error(`${DECISION_ERROR_PREFIX}method_not_permitted`)) ===
      "method_not_permitted" &&
      passportT("vq.decline.method_not_permitted", "sv").length > 40 &&
      passportT("vq.decline.method_not_permitted", "en").length > 40,
  );
}

/* ================================================================== */
group("GROUP 3 — the database half is in the repository, unchanged");
/* ================================================================== */
{
  const mig = read("supabase/migrations/20261030090000_sp_trust_source_containment.sql");
  ck(
    "3.1 the migration carries all three refusals and rewrites no row",
    /SP_ISSUER_CONFIRMATION_NOT_AVAILABLE/.test(mig) &&
      /SP_CQRITYJOB_REVIEW_REQUIRES_DOCUMENT_REVIEW/.test(mig) &&
      /SP_EMPLOYER_ATTESTATION_REQUIRES_EMPLOYER_CONFIRMATION/.test(mig) &&
      !/UPDATE public\.sp_verification_decisions/.test(mig) &&
      !/DELETE FROM public\.sp_verification_decisions/.test(mig),
  );
  ck(
    "3.2 a rollback restoring the prior body exists",
    read("supabase/rollback/20261030090000_sp_trust_source_containment_rollback.sql").includes(
      "SP_APPROVAL_REQUIRES_METHOD",
    ),
  );
  const dbTest = read("scripts/db-test.sh");
  const suite = read("supabase/tests/security_passport_trust_source_containment_test.sql");
  ck(
    "3.3 db-test.sh runs the containment suite, which proves legacy rows survive byte-for-byte",
    dbTest.includes("security_passport_trust_source_containment_test.sql") &&
      suite.includes(
        "7.3 the legacy holder''s record is byte-for-byte unchanged by the migration",
      ) &&
      suite.includes("7.4 the legacy methods are still recorded as written") &&
      dbTest.includes("7.3 the legacy holder's record is byte-for-byte unchanged by the migration"),
  );
  ck(
    "3.4 the suite keeps self-verification, employment-only, locking, uniqueness, anon and evidence privacy",
    suite.includes("SP_SELF_VERIFICATION_FORBIDDEN") &&
      suite.includes("SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY") &&
      suite.includes("FOR UPDATE") &&
      suite.includes("sp_vd_one_final_decision_per_request") &&
      suite.includes("anon holds no table privilege on any sp_ table") &&
      suite.includes("the evidence bucket is private"),
  );
  ck(
    "3.5 the read-only operator report selects nothing personal",
    (() => {
      const r = read("scripts/passport-legacy-provenance-report.sql").replace(/^\s*--.*$/gm, "");
      return (
        /decider_organisation = 'CQrityjob'/.test(r) &&
        !/display_name|email|title|holder_note|decision_note|storage_path/.test(r)
      );
    })(),
  );
}

/* ================================================================== */
group("GROUP 4 — the central rule: exactly one way to reach source-confirmed");
/* ================================================================== */
const REVIEWED = {
  assertionLevel: "verified",
  verifierName: "CQrityjob",
  verificationMethod: "document_review",
};
const LEGACY_ISSUER = {
  assertionLevel: "verified",
  verifierName: "CQrityjob",
  verificationMethod: "issuer_confirmation",
};
const LEGACY_EMPLOYER = {
  assertionLevel: "verified",
  verifierName: "CQrityjob",
  verificationMethod: "employer_confirmation",
};
/** An issuer confirmation naming a real authority. Fails closed: the name is
 *  a string somebody typed, not an identity the product can check. */
const NAMED_ISSUER = {
  assertionLevel: "verified",
  verifierName: "Polismyndigheten (fiktiv)",
  verificationMethod: "issuer_confirmation",
};
/** An employer confirmation attached to a CREDENTIAL. Fails closed: an
 *  employer has no standing over a qualification. */
const EMPLOYER_ON_CREDENTIAL = {
  assertionLevel: "verified",
  verifierName: "Bevakning AB",
  verificationMethod: "employer_confirmation",
};
/** The one shape that reaches source-confirmed. */
const EMPLOYMENT = {
  assertionLevel: "verified",
  verifierName: "Bevakning AB",
  verificationMethod: "employer_confirmation",
  subjectKind: "employment" as const,
};
const NO_METHOD = { assertionLevel: "verified", verifierName: "CQrityjob" };

const FAIL_CLOSED = [
  ["a CQrityjob document review", REVIEWED],
  ["a legacy issuer confirmation by CQrityjob", LEGACY_ISSUER],
  ["a legacy employer confirmation by CQrityjob", LEGACY_EMPLOYER],
  ["an issuer confirmation naming an authority", NAMED_ISSUER],
  ["an employer confirmation on a credential", EMPLOYER_ON_CREDENTIAL],
  ["a verified level with no recorded method", NO_METHOD],
] as const;
{
  for (const [label, entry] of FAIL_CLOSED) {
    ck(`4.1 ${label} is documented`, effectiveTrust(entry) === "documented");
    ck(
      `4.2 ${label} reaches the engine as document_provided, never verified`,
      effectiveAssertionLevel(entry) === "document_provided",
    );
    ck(
      `4.3 ${label} takes the documented symbol state and the review labels`,
      credentialPresentationOf(entry, "active") === "documented" &&
        provenanceLabelKeys(entry).by === "trust.reviewedBy" &&
        provenanceLabelKeys(entry).method === "trust.reviewMethod" &&
        provenanceLabelKeys(entry).at === "trust.reviewedAt",
    );
  }
  ck(
    "4.4 an employer confirming an EMPLOYMENT PERIOD is source-confirmed",
    effectiveTrust(EMPLOYMENT) === "source_confirmed" &&
      effectiveAssertionLevel(EMPLOYMENT) === "verified" &&
      credentialPresentationOf(EMPLOYMENT, "active") === "verified" &&
      provenanceLabelKeys(EMPLOYMENT).by === "rec.verifiedBy",
  );
  ck(
    "4.5 the SAME method and organisation on a credential is not -- the subject is half the rule",
    effectiveTrust({ ...EMPLOYMENT, subjectKind: "credential" }) === "documented" &&
      effectiveTrust({ ...EMPLOYMENT, subjectKind: undefined }) === "documented",
  );
  ck(
    "4.6 and CQrityjob naming itself as the employer on an employment is not either",
    effectiveTrust({ ...LEGACY_EMPLOYER, subjectKind: "employment" }) === "documented",
  );
  ck(
    "4.7 no issuer name reaches source-confirmed -- not on a credential, not on an employment",
    ["Polismyndigheten (fiktiv)", "BYA", "Länsstyrelsen", "SIA", "CQrityjob"].every(
      (org) =>
        effectiveTrust({
          assertionLevel: "verified",
          verifierName: org,
          verificationMethod: "issuer_confirmation",
        }) === "documented" &&
        effectiveTrust({
          assertionLevel: "verified",
          verifierName: org,
          verificationMethod: "issuer_confirmation",
          subjectKind: "employment",
        }) === "documented",
    ),
  );
  ck(
    "4.8 self-declared and document-provided are what they are",
    effectiveTrust({ assertionLevel: "self_declared" }) === "self_declared" &&
      effectiveTrust({ assertionLevel: "document_provided" }) === "document_provided" &&
      effectiveAssertionLevel({ assertionLevel: "self_declared" }) === "self_declared",
  );
  ck(
    "4.9 every unsupported SOURCE method is recognised as one; a review is not",
    isUnsupportedSourceClaim(LEGACY_ISSUER) &&
      isUnsupportedSourceClaim(NAMED_ISSUER) &&
      isUnsupportedSourceClaim(EMPLOYER_ON_CREDENTIAL) &&
      !isUnsupportedSourceClaim(REVIEWED) &&
      !isUnsupportedSourceClaim(EMPLOYMENT),
  );
  ck(
    "4.10 the legacy predicate still names exactly the CQrityjob rows",
    isLegacyUnsupportedProvenance("issuer_confirmation", CQRITYJOB_DECIDER_ORGANISATION) &&
      !isLegacyUnsupportedProvenance("issuer_confirmation", "Polismyndigheten (fiktiv)"),
  );
  ck(
    "4.11 the required Swedish words: Dokumenterad · Dokument granskat av · Granskad · Dokumentgranskning",
    DOCUMENTED_SV === "Dokumenterad" &&
      passportT("claims.attribution.document_review", "sv") === "Dokument granskat av" &&
      passportT("trust.reviewedAt", "sv") === "Granskad" &&
      passportT("ver.method.document_review", "sv") === "Dokumentgranskning",
  );
  ck(
    "4.12 the required English words: Documented · Document reviewed by · Reviewed · Document review",
    DOCUMENTED_EN === "Documented" &&
      passportT("claims.attribution.document_review", "en") === "Document reviewed by" &&
      passportT("trust.reviewedAt", "en") === "Reviewed" &&
      passportT("ver.method.document_review", "en") === "Document review",
  );
  ck(
    "4.13 the central rule names no issuer by organisation, and says why",
    (() => {
      const src = read("src/lib/security-passport/provenance.ts");
      return (
        /ISSUER CONFIRMATION REACHES SOURCE-CONFIRMED THROUGH NO NAME/.test(src) &&
        /Issuer Foundation/.test(src) &&
        !/issuer_confirmation"\s*&&/.test(code("src/lib/security-passport/provenance.ts"))
      );
    })(),
  );
}

/* ================================================================== */
group("GROUP 5 — describeTrust: the words follow the level");
/* ================================================================== */
{
  const review = describeTrust({ ...REVIEWED, lifecycleState: "active", verifiedOn: "2026-08-21" });
  ck(
    "5.1 a document review keeps its true attribution line",
    review.labelEn === "Document reviewed by CQrityjob" &&
      review.labelSv === "Dokument granskat av CQrityjob",
  );
  ck(
    "5.2 its short word is Dokumenterad / Documented, and it does not present as verified",
    review.shortSv === DOCUMENTED_SV &&
      review.shortEn === DOCUMENTED_EN &&
      !presentsAsVerified(review) &&
      publicTrustLevel(review) === "documented" &&
      !isEmployerConfirmed(review),
  );

  for (const [name, input] of [
    ["legacy issuer_confirmation", LEGACY_ISSUER],
    ["legacy employer_confirmation", LEGACY_EMPLOYER],
    ["issuer_confirmation naming an authority", NAMED_ISSUER],
    ["employer_confirmation on a credential", EMPLOYER_ON_CREDENTIAL],
  ] as const) {
    const t = describeTrust({ ...input, lifecycleState: "active", verifiedOn: "2026-08-21" });
    ck(
      `5.3 [${name}] sourceType unsupported_source, method null, documented, not verified-presenting`,
      t.sourceType === "unsupported_source" &&
        t.method === null &&
        publicTrustLevel(t) === "documented" &&
        !presentsAsVerified(t) &&
        !isEmployerConfirmed(t),
    );
    ck(
      `5.4 [${name}] the short word is Dokumenterad / Documented`,
      t.shortSv === DOCUMENTED_SV && t.shortEn === DOCUMENTED_EN,
    );
    ck(
      `5.5 [${name}] no affirmative source or verified-by phrase in either language`,
      !wearsForbidden(t.labelSv) && !wearsForbidden(t.labelEn),
    );
    const cq = input.verifierName === CQRITYJOB_DECIDER_ORGANISATION;
    ck(
      `5.6 [${name}] takes the ${cq ? "pinned legacy" : "general unsupported"} sentence`,
      t.labelSv === (cq ? LEGACY_SV : UNSUPPORTED_SV) &&
        t.labelEn === (cq ? LEGACY_EN : UNSUPPORTED_EN),
    );
    ck(
      `5.7 [${name}] the employment register and trustLabel use the same sentence`,
      employmentTrustLine(t, "sv") === t.labelSv && trustLabel(t, "en") === t.labelEn,
    );
  }

  const employment = describeTrust({ ...EMPLOYMENT, verifiedOn: "2026-08-21" });
  ck(
    "5.8 an employer's confirmation of an employment is source-confirmed and presents as verified",
    isEmployerConfirmed(employment) &&
      presentsAsVerified(employment) &&
      publicTrustLevel(employment) === "source_verified",
  );
  ck(
    "5.9 and reads 'Confirmed by Bevakning AB' / 'Employment confirmed by Bevakning AB'",
    employment.labelEn === "Confirmed by Bevakning AB" &&
      employment.labelSv === "Bekräftat av Bevakning AB" &&
      employmentTrustLine(employment, "en") === "Employment confirmed by Bevakning AB",
  );
  ck(
    "5.10 and its short word is Källbekräftad / Source-confirmed",
    employment.shortSv === SOURCE_SV && employment.shortEn === SOURCE_EN,
  );
  ck(
    "5.11 self-declared and document-provided are self_declared outwardly; unreadable has no level",
    publicTrustLevel(describeTrust({ assertionLevel: "self_declared" })) === "self_declared" &&
      publicTrustLevel(describeTrust({ assertionLevel: "document_provided" })) ===
        "self_declared" &&
      publicTrustLevel(
        describeTrust({ assertionLevel: "verified", provenanceUnavailable: true }),
      ) === null &&
      trustLevelWordKey(null) === "trust.level.unknown",
  );
  ck(
    "5.12 a lapsed record is not verified at all, whatever its method",
    describeTrust({ ...REVIEWED, lifecycleState: "revoked" }).status === "self_reported" &&
      describeTrust({ ...NAMED_ISSUER, lifecycleState: "expired" }).status === "self_reported",
  );
  ck(
    "5.13 the level words exist in both languages and differ; the neutral sentences are exact",
    (["self_declared", "documented", "source_verified"] as const).every((l) => {
      const k = trustLevelWordKey(l);
      return passportT(k, "sv") !== passportT(k, "en") && passportT(k, "sv").length > 0;
    }) &&
      LEGACY_SV ===
        "Granskning registrerad av CQrityjob. Direkt källbekräftelse kan inte visas för denna äldre post." &&
      LEGACY_EN ===
        "Review recorded by CQrityjob. Direct source confirmation is not available for this legacy record." &&
      UNSUPPORTED_SV.length > 40 &&
      UNSUPPORTED_EN.length > 40 &&
      !wearsForbidden(UNSUPPORTED_SV) &&
      !wearsForbidden(UNSUPPORTED_EN),
  );
}

/* ================================================================== */
group("GROUP 6 — the method and attribution keys follow the same rule");
/* ================================================================== */
{
  ck(
    "6.1 methodLabelKey: every unsupported source method takes the short neutral value",
    (["issuer_confirmation"] as const).every(
      (m) =>
        methodLabelKey(m, "CQrityjob") === "trust.legacy.method" &&
        methodLabelKey(m, "Polismyndigheten (fiktiv)") === "trust.legacy.method",
    ) && methodLabelKey("employer_confirmation", "CQrityjob") === "trust.legacy.method",
  );
  ck(
    "6.2 methodLabelKey: a review says Dokumentgranskning; an employer confirmation says so only on an EMPLOYMENT",
    methodLabelKey("document_review", "CQrityjob") === "ver.method.document_review" &&
      methodLabelKey("employer_confirmation", "Bevakning AB", "employment") ===
        "ver.method.employer_confirmation" &&
      methodLabelKey("employer_confirmation", "Bevakning AB") === "trust.legacy.method",
  );
  ck(
    "6.3 methodLabelKey: an unknown method has no words, and says so",
    methodLabelKey("registry_check", "CQrityjob") === null && methodLabelKey(null, null) === null,
  );
  ck(
    "6.4 verifierAttributionKey: a review keeps its words; every unsupported source takes 'Granskad av'",
    verifierAttributionKey("document_review", "CQrityjob") ===
      "claims.attribution.document_review" &&
      verifierAttributionKey("issuer_confirmation", "CQrityjob") === "trust.reviewedBy" &&
      verifierAttributionKey("issuer_confirmation", "Polismyndigheten (fiktiv)") ===
        "trust.reviewedBy" &&
      verifierAttributionKey("employer_confirmation", "Bevakning AB") === "trust.reviewedBy" &&
      passportT("trust.reviewedBy", "sv") === "Granskad av" &&
      passportT("trust.reviewedBy", "en") === "Reviewed by",
  );
  ck(
    "6.5 verifierAttributionKey: the employer keeps their words on an EMPLOYMENT",
    verifierAttributionKey("employer_confirmation", "Bevakning AB", "employment") ===
      "claims.attribution.employer_confirmation",
  );
  ck(
    "6.6 formatVerifierAttribution: an unsupported source is the sentence alone, never '… X X'",
    formatVerifierAttribution("CQrityjob", "issuer_confirmation", "en") === LEGACY_EN &&
      formatVerifierAttribution("Polismyndigheten (fiktiv)", "issuer_confirmation", "sv") ===
        UNSUPPORTED_SV &&
      formatVerifierAttribution("Bevakning AB", "employer_confirmation", "en", "employment") ===
        "Confirmed by Bevakning AB",
  );
  ck(
    "6.7 no surface keeps a private METHOD_KEY table or derives a symbol from the stored level",
    [
      "src/components/security-passport/live/RecipientCredentialList.tsx",
      "src/components/security-passport/live/CredentialVerificationPage.tsx",
      "src/components/security-passport/live/VerificationPanel.tsx",
      "src/routes/p.$token.tsx",
    ].every((p) => !/const METHOD_KEY/.test(code(p))) &&
      [
        "src/components/security-passport/ClaimRow.tsx",
        "src/components/security-passport/card/useCardContent.ts",
        "src/routes/_authenticated.passport.entry.$kind.$entryId.tsx",
        "src/routes/_authenticated.passport.information.tsx",
        "src/lib/security-passport/recipient-presentation.ts",
      ].every(
        (p) =>
          !/\bcredentialPresentation\(/.test(code(p)) && /credentialPresentationOf\(/.test(code(p)),
      ),
  );
  ck(
    "6.8 every 'verified' predicate reads the central rule, not the stored level",
    /effectiveAssertionLevel\(claim\) === "verified"/.test(
      code("src/lib/professional-identity/types.ts"),
    ) &&
      /effectiveAssertionLevel\(claim\) === "verified"/.test(
        code("src/lib/security-passport/linkedin-profile.ts"),
      ) &&
      /effectiveAssertionLevel\(c\) === "verified"/.test(
        code("src/lib/security-passport/social.ts"),
      ) &&
      /withEffectiveAssertion\(claims\)/.test(
        code("src/lib/security-passport/identity/visibility.ts"),
      ) &&
      /effectiveTrust\(/.test(code("src/lib/security-passport/market-profiles.ts")) &&
      /effectiveTrust\(/.test(code("src/lib/security-passport/card.ts")) &&
      /presentsAsVerified\(t\)/.test(
        code("src/components/professional-identity/CvDocumentView.tsx"),
      ) &&
      /presentsAsVerified\(trust\)/.test(code("src/lib/professional-identity/trust-summary.ts")),
  );
  ck(
    "6.9 every EMPLOYMENT reader declares its subject -- the default cannot manufacture trust",
    /subjectKind: "employment"/.test(code("src/lib/security-passport/experience.ts")) &&
      /subjectKind: "employment" as const/.test(code("src/lib/security-passport/card.ts")) &&
      /subjectKind: "employment"/.test(code("src/lib/professional-identity/trust-summary.ts")) &&
      /subjectKind: "employment"/.test(
        code("src/lib/professional-identity/cv/trust-annotations.ts"),
      ) &&
      /subjectKind: "employment"/.test(
        code("src/components/security-passport/ExperienceTimeline.tsx"),
      ) &&
      /subjectKind: "employment"/.test(
        code("src/components/security-passport/ExperienceTotals.tsx"),
      ) &&
      /subjectKind: isClaim \? "credential" : "employment"/.test(
        code("src/routes/_authenticated.passport.entry.$kind.$entryId.tsx"),
      ) &&
      /subjectKind=\{isClaim \? "credential" : "employment"\}/.test(
        code("src/routes/_authenticated.passport.entry.$kind.$entryId.tsx"),
      ) &&
      /subjectKind: "employment"/.test(code("src/routes/_authenticated.passport.information.tsx")),
  );
  ck(
    "6.10 the recipient route renders the list component and no inline credential list",
    /<RecipientCredentialList credentials=\{presentation\.credentials\}/.test(
      code("src/routes/p.$token.tsx"),
    ) && !/rec\.verifiedBy/.test(code("src/routes/p.$token.tsx")),
  );
}

/* ================================================================== */
group("GROUP 7 — the recipient model: no credential reaches source-confirmed");
/* ================================================================== */
const payloadFor = (method: string, organisation: string) =>
  ({
    status: "active",
    package: "public_card",
    focus: "passport",
    purpose: null,
    expires_at: "2026-10-05",
    authorised_at: "2026-09-05",
    last_updated: "2026-09-05",
    holder: "Fiktiv Innehavare",
    privacy_mode: "full_name",
    profession_slug: null,
    jurisdiction: "SE",
    verified_claims: [
      {
        id: "c1",
        type: "training",
        title: "Väktarutbildning del 1 (fiktiv)",
        credential_code: "VU1",
        issuer: "Fiktiv utbildningsanordnare",
        jurisdiction: "SE",
        issued_on: "2025-01-01",
        valid_until: "2027-12-31",
        assertion: "verified",
        lifecycle: "active",
        verified_at: "2026-08-21T10:00:00Z",
        verifier_organisation: organisation,
        verification_method: method,
      },
    ],
    verified_experience: [],
    verified_experience_days: 0,
  }) as unknown as RecipientPayloadActive;

const RECIPIENT_CASES = [
  [
    "document_review",
    buildRecipientPresentation(payloadFor("document_review", "CQrityjob"), TODAY),
  ],
  [
    "legacy issuer_confirmation",
    buildRecipientPresentation(payloadFor("issuer_confirmation", "CQrityjob"), TODAY),
  ],
  [
    "issuer_confirmation naming an authority",
    buildRecipientPresentation(
      payloadFor("issuer_confirmation", "Polismyndigheten (fiktiv)"),
      TODAY,
    ),
  ],
  [
    "employer_confirmation on a credential",
    buildRecipientPresentation(payloadFor("employer_confirmation", "Bevakning AB"), TODAY),
  ],
] as const;
{
  for (const [name, p] of RECIPIENT_CASES) {
    const c = p.credentials[0];
    ck(
      `7.1 [${name}] the credential is still there -- documented, not hidden`,
      p.credentials.length === 1 && c.assertion === "verified",
    );
    ck(
      `7.2 [${name}] effective document_provided, level documented, presentation documented`,
      c.effectiveAssertion === "document_provided" &&
        c.level === "documented" &&
        c.presentation === "documented",
    );
    ck(
      `7.3 [${name}] status word Dokumenterad / Documented, labels Reviewed`,
      c.statusWordKey === "trust.level.documented" &&
        c.labels.by === "trust.reviewedBy" &&
        c.labels.at === "trust.reviewedAt",
    );
    ck(
      `7.4 [${name}] no verified title and no eligibility are derived from it`,
      p.titles.length === 0 && p.eligibility.length === 0,
    );
  }
  ck(
    "7.5 only the two CQrityjob shapes are flagged legacy; the others are unsupported all the same",
    RECIPIENT_CASES[1][1].credentials[0].legacyUnsupported &&
      !RECIPIENT_CASES[0][1].credentials[0].legacyUnsupported &&
      !RECIPIENT_CASES[2][1].credentials[0].legacyUnsupported,
  );
  ck(
    "7.6 NO disclosed credential can present as verified today -- the pill is unreachable",
    RECIPIENT_CASES.every(([, p]) => p.credentials.every((c) => c.presentation !== "verified")),
  );
}

/* ================================================================== */
group("GROUP 8 — the public recipient list, rendered");
/* ================================================================== */
{
  for (const [name, p] of RECIPIENT_CASES) {
    const svMarkup = sv(<RecipientCredentialList credentials={p.credentials} />);
    const svText = text(svMarkup);
    ck(
      `8.1 [${name}] sv: Dokumenterad, Granskad av, Granskningsmetod, Granskad`,
      svText.includes(DOCUMENTED_SV) &&
        svText.includes("Granskad av") &&
        svText.includes("Granskningsmetod") &&
        / Granskad /.test(svText),
    );
    ck(
      `8.2 [${name}] sv: no current Verifierad status and no source/verified-by phrase`,
      !wearsCurrentVerified(svText, "sv") && !wearsForbidden(svText),
    );
    ck(
      `8.3 [${name}] no green pill, no check glyph, no verified symbol -- the documented glyph instead`,
      !/data-trust-pill="verified"/.test(svMarkup) &&
        !/bg-primary/.test(svMarkup) &&
        !/lucide-badge-check|lucide-circle-check/.test(svMarkup) &&
        /lucide-file-text/.test(svMarkup),
    );
    const enText = text(en(<RecipientCredentialList credentials={p.credentials} />));
    ck(
      `8.4 [${name}] en: Documented, Reviewed by, Review method, Reviewed; no Verified`,
      enText.includes(DOCUMENTED_EN) &&
        enText.includes("Reviewed by") &&
        enText.includes("Review method") &&
        !wearsCurrentVerified(enText, "en") &&
        !wearsForbidden(enText),
    );
  }
  const rText = text(
    sv(<RecipientCredentialList credentials={RECIPIENT_CASES[0][1].credentials} />),
  );
  ck(
    "8.5 a document review says Dokumentgranskning and prints no neutral sentence",
    rText.includes("Dokumentgranskning") &&
      !rText.includes(LEGACY_SV) &&
      !rText.includes(UNSUPPORTED_SV),
  );
  ck(
    "8.6 a legacy row prints the pinned sentence; a named issuer prints the general one",
    text(sv(<RecipientCredentialList credentials={RECIPIENT_CASES[1][1].credentials} />)).includes(
      LEGACY_SV,
    ) &&
      text(
        en(<RecipientCredentialList credentials={RECIPIENT_CASES[1][1].credentials} />),
      ).includes(LEGACY_EN) &&
      text(
        sv(<RecipientCredentialList credentials={RECIPIENT_CASES[2][1].credentials} />),
      ).includes(UNSUPPORTED_SV) &&
      text(
        en(<RecipientCredentialList credentials={RECIPIENT_CASES[2][1].credentials} />),
      ).includes(UNSUPPORTED_EN),
  );
}

/* ================================================================== */
group("GROUP 9 — the credential page and the recipient card, rendered");
/* ================================================================== */
{
  const page = (p: (typeof RECIPIENT_CASES)[number][1], r: typeof sv) =>
    r(
      <CredentialVerificationPage
        credential={p.credentials[0]}
        holderLabel="Fiktiv Innehavare"
        jurisdiction="Sverige"
        verifyUrl="cqrityjob.example/p/abc"
      />,
    );
  for (const [name, p] of RECIPIENT_CASES) {
    const svMarkup = page(p, sv);
    const svText = text(svMarkup);
    ck(
      `9.1 [${name}] credential page sv: Dokumenterad, Granskad av; no Verifierad, no forbidden phrase`,
      svText.includes(DOCUMENTED_SV) &&
        svText.includes("Granskad av") &&
        !wearsCurrentVerified(svText, "sv") &&
        !wearsForbidden(svText),
    );
    ck(
      `9.2 [${name}] the pill is current-but-not-verified, not gold`,
      /data-trust-pill="current"/.test(svMarkup) && !/data-trust-pill="verified"/.test(svMarkup),
    );
    const enText = text(page(p, en));
    ck(
      `9.3 [${name}] credential page en: Documented, Reviewed by; no Verified`,
      enText.includes(DOCUMENTED_EN) &&
        enText.includes("Reviewed by") &&
        !wearsForbidden(enText) &&
        !wearsCurrentVerified(enText, "en"),
    );
    const cardText = text(
      sv(<RecipientPassportCard presentation={p} verifyUrl="cqrityjob.example/p/abc" />),
    );
    ck(
      `9.4 [${name}] the card says Dokumenterad and Granskad av, wears no Verifierad, derives no title`,
      cardText.includes(DOCUMENTED_SV) &&
        cardText.includes("Granskad av") &&
        !wearsCurrentVerified(cardText, "sv") &&
        !wearsForbidden(cardText) &&
        cardText.includes(passportT("common.notStated", "sv")),
    );
  }
  ck(
    "9.5 the neutral sentence reaches the card too",
    text(sv(<RecipientPassportCard presentation={RECIPIENT_CASES[1][1]} />)).includes(LEGACY_SV) &&
      text(sv(<RecipientPassportCard presentation={RECIPIENT_CASES[2][1]} />)).includes(
        UNSUPPORTED_SV,
      ),
  );
}

/* ================================================================== */
group("GROUP 10 — the holder's own surfaces, rendered");
/* ================================================================== */
const claimOf = (
  method: string | null,
  verifierName: string | null,
  over: Partial<Claim> = {},
): Claim => ({
  id: "claim-1",
  claimType: "training",
  credentialCode: "VU1",
  skillCode: null,
  skillLevel: null,
  titleSv: "Väktarutbildning del 1 (fiktiv)",
  titleEn: "Security guard training part 1 (fictional)",
  issuerName: "Fiktiv utbildningsanordnare",
  jurisdictionCode: "SE",
  subJurisdictionCode: null,
  authorisationScope: null,
  issuedOn: "2025-01-01",
  validFrom: "2025-01-01",
  validUntil: "2027-12-31",
  assertionLevel: "verified",
  lifecycleState: "active",
  verifierName,
  verificationMethod: method as Claim["verificationMethod"],
  verifiedOn: "2026-08-21",
  limitationSv: null,
  limitationEn: null,
  versionNo: 1,
  supersedesClaimId: null,
  ...over,
});
const periodOf = (method: string, verifierName: string): ExperiencePeriod => ({
  id: "p1",
  employerName: "Bevakning AB (fiktiv)",
  roleTitle: "Väktare",
  professionSlug: "vaktare",
  jurisdictionCode: "SE",
  employmentType: "full_time",
  fteFraction: 1,
  securityRelevance: "primary",
  securityFraction: 1,
  startedOn: "2022-01-01",
  endedOn: "2024-01-01",
  assertionLevel: "verified",
  lifecycleState: "active",
  verifierName,
  verificationMethod: method as ExperiencePeriod["verificationMethod"],
  verifiedOn: "2026-08-21",
});
const reviewedClaim = claimOf("document_review", "CQrityjob");
const legacyClaim = claimOf("issuer_confirmation", "CQrityjob", { id: "claim-legacy" });
const namedIssuerClaim = claimOf("issuer_confirmation", "Polismyndigheten (fiktiv)", {
  id: "claim-issuer",
});
{
  const row = sv(<ClaimRow claim={reviewedClaim} />);
  const rowText = text(row);
  ck(
    "10.1 the holder's claim row: Dokumenterad, 'Dokument granskat av CQrityjob', 'Granskad'",
    rowText.includes(DOCUMENTED_SV) &&
      rowText.includes("Dokument granskat av") &&
      rowText.includes("CQrityjob") &&
      / Granskad /.test(rowText) &&
      rowText.includes("2026-08-21"),
  );
  ck(
    "10.2 and wears no current Verifierad, no filled pill, no check glyph",
    !wearsCurrentVerified(rowText, "sv") &&
      !wearsForbidden(rowText) &&
      !/bg-primary/.test(row) &&
      !/lucide-circle-check|lucide-badge-check/.test(row) &&
      /lucide-file-text/.test(row),
  );
  const enRow = text(en(<ClaimRow claim={reviewedClaim} />));
  ck(
    "10.3 en: Documented, 'Document reviewed by CQrityjob', 'Reviewed'",
    enRow.includes(DOCUMENTED_EN) &&
      enRow.includes("Document reviewed by") &&
      / Reviewed /.test(enRow) &&
      !wearsCurrentVerified(enRow, "en"),
  );
  for (const [name, c, sentence] of [
    ["legacy", legacyClaim, LEGACY_SV],
    ["named issuer", namedIssuerClaim, UNSUPPORTED_SV],
  ] as const) {
    const markup = sv(<ClaimRow claim={c} />);
    const t = text(markup);
    ck(
      `10.4 [${name}] the row is Dokumenterad, Granskad av, the sentence, history kept, no pill`,
      t.includes(DOCUMENTED_SV) &&
        t.includes("Granskad av") &&
        t.includes(sentence) &&
        t.includes(c.verifierName ?? "") &&
        !wearsCurrentVerified(t, "sv") &&
        !/bg-primary/.test(markup),
    );
  }

  const chip = (p: {
    verifierName: string;
    verificationMethod: string;
    subjectKind?: "employment";
  }) => sv(<AssertionChip level="verified" lifecycleState="active" provenance={p} />);
  ck(
    "10.5 the chip: every credential shape → Dokumenterad in the documented shape",
    [REVIEWED, LEGACY_ISSUER, NAMED_ISSUER, EMPLOYER_ON_CREDENTIAL].every((p) => {
      const m = chip(p as never);
      return text(m).includes(DOCUMENTED_SV) && !/bg-primary/.test(m) && /lucide-file-text/.test(m);
    }),
  );
  ck(
    "10.6 the chip: an employment an employer confirmed → Källbekräftad in the settled pill",
    text(chip(EMPLOYMENT)).includes(SOURCE_SV) && /bg-primary/.test(chip(EMPLOYMENT)),
  );
  ck(
    "10.7 the chip without provenance (the legend) keeps the stored vocabulary",
    text(sv(<AssertionChip level="verified" lifecycleState="active" />)).includes(
      passportT("assertion.verified", "sv"),
    ),
  );

  const decision = (method: string, organisation: string): VerificationDecisionRecord => ({
    id: "d1",
    requestId: "r1",
    decision: "approved",
    organisation,
    method,
    decidedAt: "2026-08-21T10:00:00Z",
    validFrom: null,
    validUntil: null,
  });
  const noopAsync = async () => {};
  const panel = (d: VerificationDecisionRecord, subjectKind?: "employment" | "credential") =>
    sv(
      <VerificationPanel
        assertionLevel="verified"
        subjectKind={subjectKind}
        validity={
          {
            effectiveState: "active",
            hasExpired: false,
            expiresSoon: false,
            daysRemaining: null,
          } as never
        }
        openRequest={null}
        rejectedRequest={null}
        requests={[]}
        decisions={[d]}
        hasEvidence
        canAskEmployer={false}
        employerSearch={{ query: "", results: [], loading: false, truncated: false } as never}
        onEmployerSearch={() => {}}
        openRequestEmployerName={null}
        onSubmit={noopAsync as never}
        onWithdrawRequest={noopAsync}
        onDispute={noopAsync}
      />,
    );
  const reviewPanel = text(panel(decision("document_review", "CQrityjob"), "credential"));
  ck(
    "10.8 the panel for a review: 'Dokument granskat av', 'Granskningsmetod', 'Dokumentgranskning'; never Verifierad av",
    reviewPanel.includes("Dokument granskat av") &&
      reviewPanel.includes("Granskningsmetod") &&
      reviewPanel.includes("Dokumentgranskning") &&
      !wearsForbidden(reviewPanel),
  );
  for (const [name, d, sentence] of [
    ["legacy", decision("issuer_confirmation", "CQrityjob"), LEGACY_SV],
    ["named issuer", decision("issuer_confirmation", "Polismyndigheten (fiktiv)"), UNSUPPORTED_SV],
    ["employer on a credential", decision("employer_confirmation", "Bevakning AB"), UNSUPPORTED_SV],
  ] as const) {
    const markup = panel(d, "credential");
    const t = text(markup);
    ck(
      `10.9 [${name}] the panel says Granskad av, prints the sentence once, keeps the history, and offers no employer block`,
      t.includes("Granskad av") &&
        /data-legacy-provenance="note"/.test(markup) &&
        t.includes(sentence) &&
        t.includes("2026-08-21") &&
        !wearsForbidden(t),
    );
  }
  const employmentPanel = text(
    panel(decision("employer_confirmation", "Bevakning AB"), "employment"),
  );
  ck(
    "10.10 the SAME decision on an employment says 'Anställningen är bekräftad av Bevakning AB'",
    employmentPanel.includes("Anställningen är bekräftad av Bevakning AB") &&
      !employmentPanel.includes(UNSUPPORTED_SV),
  );
  const timeline = text(
    sv(
      <ExperienceTimeline
        periods={[periodOf("employer_confirmation", "Bevakning AB (fiktiv)")]}
        evaluationOn={TODAY}
      />,
    ),
  );
  ck(
    "10.11 the timeline: Källbekräftad and 'Bekräftat av Bevakning AB (fiktiv)'",
    timeline.includes(SOURCE_SV) && timeline.includes("Bekräftat av Bevakning AB (fiktiv)"),
  );
  const reviewedTimeline = text(
    sv(
      <ExperienceTimeline
        periods={[periodOf("document_review", "CQrityjob")]}
        evaluationOn={TODAY}
      />,
    ),
  );
  ck(
    "10.12 a CQrityjob-reviewed employment is Dokumenterad on the same timeline",
    reviewedTimeline.includes(DOCUMENTED_SV) && !reviewedTimeline.includes(SOURCE_SV),
  );
}

/* ================================================================== */
group("GROUP 11 — derivation: no credential derives a title or an eligibility");
/* ================================================================== */
{
  const approval = (method: string, org: string, id: string) =>
    claimOf(method, org, {
      id,
      claimType: "licence",
      credentialCode: "SE_PERSONNEL_APPROVAL",
      titleSv: "Personalgodkännande (fiktivt)",
      titleEn: "Personnel approval (fictional)",
    });
  const gate = (claims: readonly Claim[]) =>
    deriveVerifiedIdentity(claims, MIRRORED_TITLE_RULES, TODAY);
  const engine = (claims: readonly Claim[]) =>
    deriveProfessionalIdentity(claims, MIRRORED_TITLE_RULES, TODAY);

  ck(
    "11.1 the RULES are intact: VU1 and a personnel approval derive on the raw engine",
    allDerived(engine([reviewedClaim])).length > 0 &&
      engine([approval("document_review", "CQrityjob", "a0")]).localEligibility.length > 0,
  );
  for (const [name, c] of [
    ["a document review", reviewedClaim],
    ["a legacy issuer confirmation", legacyClaim],
    ["an issuer confirmation naming an authority", namedIssuerClaim],
    [
      "an employer confirmation on a credential",
      claimOf("employer_confirmation", "Bevakning AB", { id: "c-emp" }),
    ],
    ["a verified level with no method", claimOf(null, null, { id: "c-none" })],
  ] as const) {
    ck(
      `11.2 ${name} derives NOTHING through the audience gate`,
      allDerived(gate([c])).length === 0,
    );
  }
  ck(
    "11.3 nor does any personnel approval -- no licence, no local eligibility, no authority recognition",
    (
      [
        ["document_review", "CQrityjob"],
        ["issuer_confirmation", "CQrityjob"],
        ["issuer_confirmation", "Länsstyrelsen (fiktiv)"],
        ["employer_confirmation", "Bevakning AB"],
      ] as const
    ).every(([m, o], i) => gate([approval(m, o, `a${i + 1}`)]).localEligibility.length === 0),
  );
  ck(
    "11.4 isCurrentlyVerified and isVerifiedClaim are false for every credential shape",
    [reviewedClaim, legacyClaim, namedIssuerClaim].every(
      (c) => !isCurrentlyVerified(c) && !isVerifiedClaim(c),
    ),
  );

  const reviewedPeriod = periodOf("document_review", "CQrityjob");
  const legacyPeriod = periodOf("employer_confirmation", "CQrityjob");
  const realPeriod = periodOf("employer_confirmation", "Bevakning AB (fiktiv)");
  const t1 = totalsByEvidenceLevel([reviewedPeriod], TODAY);
  const t2 = totalsByEvidenceLevel([legacyPeriod], TODAY);
  const t3 = totalsByEvidenceLevel([realPeriod], TODAY);
  ck(
    "11.5 tenure: a reviewed or legacy period counts as documented time, not verified time",
    t1.verified.elapsedDays === 0 &&
      t1.documented.elapsedDays > 0 &&
      t2.verified.elapsedDays === 0 &&
      t2.documented.elapsedDays > 0,
  );
  ck(
    "11.6 tenure: an employer's own confirmation of an employment counts as verified time",
    t3.verified.elapsedDays > 0 &&
      isCurrentlyVerified({ ...realPeriod, subjectKind: "employment" }),
  );
  ck(
    "11.7 an employer confirmation reaches the identity engine through no path: claims only, and the database refuses the request",
    /deriveVerifiedIdentity\(\s*payload\.verified_claims\.map\(toDomainClaim\)/.test(
      code("src/lib/security-passport/recipient-presentation.ts"),
    ) &&
      read("supabase/tests/security_passport_trust_source_containment_test.sql").includes(
        "5.1 an employer still cannot be asked to attest to a credential",
      ),
  );
  ck(
    "11.8 the stored level is never rewritten by the projection",
    reviewedClaim.assertionLevel === "verified" &&
      namedIssuerClaim.assertionLevel === "verified" &&
      effectiveAssertionLevel(reviewedClaim) === "document_provided" &&
      effectiveAssertionLevel(namedIssuerClaim) === "document_provided",
  );

  const holderOf = (
    claims: readonly Claim[],
    periods: readonly ExperiencePeriod[] = [],
  ): PassportHolder => ({
    id: "h1",
    displayName: "Fiktiv Innehavare",
    professionSlug: "vaktare",
    identity: deriveVerifiedIdentity(claims, MIRRORED_TITLE_RULES, TODAY),
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    periods,
    claims,
    hasCareerDiscoveryResult: false,
  });
  ck(
    "11.9 the private card state: documented for a reviewed holder, verified once an employer confirmed the employment",
    buildPassportCard(holderOf([reviewedClaim]), TODAY).state === "documented" &&
      buildPassportCard(holderOf([], [realPeriod]), TODAY).state === "verified" &&
      buildPassportCard(holderOf([claimOf(null, null, { assertionLevel: "self_declared" })]), TODAY)
        .state === "self_declared_only",
  );
  ck(
    "11.10 the market bucket counts a reviewed credential as documented, and the copy says so",
    buildPassportCard(holderOf([reviewedClaim]), TODAY).marketProfiles.some(
      (p) => p.verifiedCredentials.length === 1,
    ) &&
      passportT("market.verified.many", "sv") === "dokumenterade" &&
      passportT("card.verifiedMarkets", "sv") === "Dokumenterade marknader" &&
      passportT("market.verified.many", "en") === "documented",
  );
}

/* ================================================================== */
group("GROUP 12 — the social image and LinkedIn carry no credential today");
/* ================================================================== */
{
  const holderOf = (claims: readonly Claim[]): PassportHolder => ({
    id: "h1",
    displayName: "Fiktiv Innehavare",
    professionSlug: "vaktare",
    identity: deriveVerifiedIdentity(claims, MIRRORED_TITLE_RULES, TODAY),
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    periods: [],
    claims,
    hasCareerDiscoveryResult: false,
  });
  const social = (claims: readonly Claim[]) =>
    buildSocialCard(holderOf(claims), TODAY, {
      privacyMode: "full_name",
      anonymousLabel: passportT("share.anonymousLabel", "sv"),
    });
  const every = [
    reviewedClaim,
    legacyClaim,
    namedIssuerClaim,
    claimOf("employer_confirmation", "Bevakning AB", { id: "c-emp" }),
  ];
  ck(
    "12.1 the social image names none of them as verified",
    social(every).verifiedCredentials.length === 0,
  );
  ck(
    "12.2 LinkedIn's add-to-profile offers none of them",
    linkedInProfileEntries(holderOf(every), "cqrityjob.example/p/abcdef123456", "sv").length === 0,
  );
  ck(
    "12.3 the anonymous holder label no longer claims a verified guard",
    !/verifierad|verified/i.test(passportT("share.anonymousLabel", "sv")) &&
      !/verifierad|verified/i.test(passportT("share.anonymousLabel", "en")),
  );
}

/* ================================================================== */
group("GROUP 13 — the reviewer and admin workspace");
/* ================================================================== */
{
  const ws = code("src/routes/_authenticated.passport-review.tsx");
  ck(
    "13.1 the approval action is 'Godkänn dokumentgranskning' / 'Approve document review', never 'Verifiera'",
    passportT("vq.approve", "sv") === "Godkänn dokumentgranskning" &&
      passportT("vq.approve", "en") === "Approve document review" &&
      !/verifiera/i.test(passportT("vq.approve", "sv")) &&
      !/^verify$/i.test(passportT("vq.approve", "en")),
  );
  ck(
    "13.2 the confirmation says the entry will show as Documented, not Verified",
    /Dokumenterad/.test(passportT("vq.confirmApprove", "sv")) &&
      !/Verifierad/.test(passportT("vq.confirmApprove", "sv")) &&
      /Documented/.test(passportT("vq.confirmApprove", "en")) &&
      !/Verified/.test(passportT("vq.confirmApprove", "en")),
  );
  ck(
    "13.3 a completed review is described operationally, with the holder-facing result",
    passportT("vq.review.completed", "sv") === "Dokumentgranskning slutförd" &&
      passportT("vq.review.holderResult", "sv") === "Resultat för användaren: Dokumenterad" &&
      passportT("vq.review.completed", "en") === "Document review completed" &&
      passportT("vq.review.holderResult", "en") === "Holder-facing result: Documented",
  );
  ck(
    "13.4 and explains that this is not direct source confirmation",
    /inte en direkt bekräftelse/.test(passportT("vq.review.notSource", "sv")) &&
      /not direct confirmation/.test(passportT("vq.review.notSource", "en")),
  );
  ck(
    "13.5 the shared workspace renders the completed block from the central predicate, before the facts",
    /hasCompletedDocumentReview\(priorDecisions\)/.test(ws) &&
      /data-review-completed="documented"/.test(ws) &&
      /pt\("vq\.review\.completed"\)/.test(ws) &&
      /pt\("vq\.review\.holderResult"\)/.test(ws) &&
      /pt\("vq\.review\.notSource"\)/.test(ws) &&
      ws.indexOf('data-review-completed="documented"') < ws.indexOf("<ReviewClaimFacts"),
  );
  ck(
    "13.6 the legacy warning is preserved, with its exact wording",
    /hasLegacyUnsupportedApproval\(priorDecisions\)/.test(ws) &&
      /data-legacy-record="warning"/.test(ws) &&
      passportT("vq.legacy.title", "sv") === "Äldre verifieringspost – manuell omprövning krävs" &&
      passportT("vq.legacy.title", "en") ===
        "Legacy verification record – manual re-review required",
  );
  ck(
    "13.7 the predicates: a review completes; a legacy approval is not one; a refusal is neither",
    hasCompletedDocumentReview([
      { decision: "approved", method: "document_review", organisation: "CQrityjob" },
    ]) &&
      !hasCompletedDocumentReview([
        { decision: "approved", method: "issuer_confirmation", organisation: "CQrityjob" },
      ]) &&
      !hasCompletedDocumentReview([
        { decision: "rejected", method: "document_review", organisation: "CQrityjob" },
      ]) &&
      hasLegacyUnsupportedApproval([
        { decision: "approved", method: "issuer_confirmation", organisation: "CQrityjob" },
      ]) &&
      !hasLegacyUnsupportedApproval([
        { decision: "approved", method: "document_review", organisation: "CQrityjob" },
      ]),
  );
  ck(
    "13.8 the admin route reuses the same workspace, and no remediation control sits beside either block",
    /<PassportReviewWorkspace \/>/.test(
      code("src/routes/_authenticated.admin.passport-verification.tsx"),
    ) && !/onClick=\{[^}]*legacy/i.test(ws),
  );
}

console.log("");
if (fails.length) {
  console.error(`passport-trust-source-check: ${fails.length} assertion(s) failed:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("passport-trust-source-check: all assertions passed.");
