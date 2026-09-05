// Security Passport — a verification method belongs to the party who used it,
// and what the product SAYS about a record is what the method proves.
//
// Run via `bun run passport-trust-source:check`.
//
// ── THE OWNER DECISION THIS HOLDS ──────────────────────────────────────
//
// Three outward trust levels, and nothing else:
//
//   SELF-DECLARED     the holder supplied and attested it
//   DOCUMENTED        CQrityjob reviewed evidence the holder supplied
//   SOURCE-CONFIRMED  the employer, or a structurally supported issuer,
//                     directly confirmed the fact
//
// A CQrityjob document review means DOCUMENTED. It is not source
// confirmation and establishes no regulated title, licence, eligibility or
// authority recognition on its own. A legacy row whose source method
// CQrityjob recorded about itself is documented too. An employer's own
// confirmation of employment is source-confirmed for the employment facts
// it covers and can verify no credential.
//
// The stored assertion level, method, decision and audit history stay as
// written. One central derivation -- `effectiveTrust` /
// `effectiveAssertionLevel` in provenance.ts -- decides the outward meaning,
// and every consumer reads it: chips, symbols, labels, the identity engine,
// tenure tiers, counts, the card, the social and LinkedIn exports, the CV,
// the recipient model and the reviewer workspace.
//
// ── WHY IT RENDERS RATHER THAN ONLY READS ──────────────────────────────
//
// This is a property of what a person SEES. The recipient list, card and
// credential page, the holder's claim row, verification panel and chip are
// rendered for real in Swedish AND English with a document-reviewed, a legacy
// and a source-confirmed credential, and the markup is asserted. A guard
// that only banned "confirmed by the issuer" would pass a page that still
// wore a green VERIFIED pill; this one fails on that too.

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
import { allDerived } from "../src/lib/security-passport/identity/derive";
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

/** The phrases a DOCUMENTED record must never wear, in either language.
 *  The Swedish legacy sentence contains "källbekräftelse" in a NEGATED
 *  sentence, and the reviewer copy says what a review is NOT, so the test is
 *  for the affirmative phrases. */
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
group("GROUP 3 — the database half is in the repository, unchanged by this correction");
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
      // The SQL source doubles the apostrophe; the runtime NOTICE does not.
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
group("GROUP 4 — the central rule: what a method proves");
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
const EMPLOYER = {
  assertionLevel: "verified",
  verifierName: "Bevakning AB",
  verificationMethod: "employer_confirmation",
};
const ISSUER = {
  assertionLevel: "verified",
  verifierName: "Fiktiv utfärdare",
  verificationMethod: "issuer_confirmation",
};
{
  ck("4.1 a CQrityjob document review is documented", effectiveTrust(REVIEWED) === "documented");
  ck(
    "4.2 a legacy source method by CQrityjob is documented",
    effectiveTrust(LEGACY_ISSUER) === "documented" &&
      effectiveTrust(LEGACY_EMPLOYER) === "documented" &&
      isLegacyUnsupportedProvenance("issuer_confirmation", CQRITYJOB_DECIDER_ORGANISATION),
  );
  ck(
    "4.3 an employer's own confirmation is source-confirmed",
    effectiveTrust(EMPLOYER) === "source_confirmed",
  );
  ck(
    "4.4 a structurally supported issuer confirmation would be source-confirmed",
    effectiveTrust(ISSUER) === "source_confirmed",
  );
  ck(
    "4.5 verified with no recorded method fails closed to documented",
    effectiveTrust({ assertionLevel: "verified" }) === "documented" &&
      effectiveTrust({ assertionLevel: "verified", verifierName: "CQrityjob" }) === "documented",
  );
  ck(
    "4.6 self-declared and document-provided are what they are",
    effectiveTrust({ assertionLevel: "self_declared" }) === "self_declared" &&
      effectiveTrust({ assertionLevel: "document_provided" }) === "document_provided",
  );
  ck(
    "4.7 the engine-facing level: documented is document_provided, source-confirmed is verified",
    effectiveAssertionLevel(REVIEWED) === "document_provided" &&
      effectiveAssertionLevel(LEGACY_ISSUER) === "document_provided" &&
      effectiveAssertionLevel(EMPLOYER) === "verified" &&
      effectiveAssertionLevel({ assertionLevel: "self_declared" }) === "self_declared",
  );
  ck(
    "4.8 the symbol state: documented for a review, approved only for a source",
    credentialPresentationOf(REVIEWED, "active") === "documented" &&
      credentialPresentationOf(LEGACY_EMPLOYER, "active") === "documented" &&
      credentialPresentationOf(EMPLOYER, "active") === "verified",
  );
  ck(
    "4.9 the labels: Reviewed by / Review method / Reviewed for anything documented",
    (() => {
      const l = provenanceLabelKeys(REVIEWED);
      const m = provenanceLabelKeys(LEGACY_ISSUER);
      return (
        l.by === "trust.reviewedBy" &&
        l.method === "trust.reviewMethod" &&
        l.at === "trust.reviewedAt" &&
        m.by === "trust.reviewedBy"
      );
    })(),
  );
  ck(
    "4.10 and the verification labels only for a source confirmation",
    provenanceLabelKeys(EMPLOYER).by === "rec.verifiedBy",
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
    "5.2 and its short word is Dokumenterad / Documented",
    review.shortSv === DOCUMENTED_SV && review.shortEn === DOCUMENTED_EN,
  );
  ck(
    "5.3 and it does not present as verified",
    !presentsAsVerified(review) && publicTrustLevel(review) === "documented",
  );
  ck("5.4 and it is not an employer confirmation", !isEmployerConfirmed(review));

  for (const [name, input] of [
    ["issuer_confirmation", LEGACY_ISSUER],
    ["employer_confirmation", LEGACY_EMPLOYER],
  ] as const) {
    const t = describeTrust({ ...input, lifecycleState: "active", verifiedOn: "2026-08-21" });
    ck(
      `5.5 [${name}] legacy: sourceType legacy_unsupported, method null, documented, not verified-presenting`,
      t.sourceType === "legacy_unsupported" &&
        t.method === null &&
        publicTrustLevel(t) === "documented" &&
        !presentsAsVerified(t) &&
        !isEmployerConfirmed(t),
    );
    ck(
      `5.6 [${name}] legacy: the neutral sentence in both languages, and the short word Dokumenterad`,
      t.labelSv === LEGACY_SV &&
        t.labelEn === LEGACY_EN &&
        t.shortSv === DOCUMENTED_SV &&
        t.shortEn === DOCUMENTED_EN,
    );
    ck(
      `5.7 [${name}] legacy: the employment register and trustLabel use the same sentence`,
      employmentTrustLine(t, "sv") === LEGACY_SV && trustLabel(t, "en") === LEGACY_EN,
    );
    ck(
      `5.8 [${name}] legacy: no affirmative source or verified-by phrase`,
      !wearsForbidden(t.labelSv) && !wearsForbidden(t.labelEn),
    );
  }

  const real = describeTrust({ ...EMPLOYER, verifiedOn: "2026-08-21" });
  ck(
    "5.9 an employer's own confirmation is source-confirmed and presents as verified",
    isEmployerConfirmed(real) &&
      presentsAsVerified(real) &&
      publicTrustLevel(real) === "source_verified",
  );
  ck(
    "5.10 and still reads 'Confirmed by Bevakning AB'",
    real.labelEn === "Confirmed by Bevakning AB" && real.labelSv === "Bekräftat av Bevakning AB",
  );
  ck(
    "5.11 and its short word is Källbekräftad / Source-confirmed",
    real.shortSv === SOURCE_SV && real.shortEn === SOURCE_EN,
  );
  ck(
    "5.12 self-declared and document-provided are self_declared outwardly; unreadable has no level",
    publicTrustLevel(describeTrust({ assertionLevel: "self_declared" })) === "self_declared" &&
      publicTrustLevel(describeTrust({ assertionLevel: "document_provided" })) ===
        "self_declared" &&
      publicTrustLevel(
        describeTrust({ assertionLevel: "verified", provenanceUnavailable: true }),
      ) === null &&
      trustLevelWordKey(null) === "trust.level.unknown",
  );
  ck(
    "5.13 a lapsed record is not verified at all",
    describeTrust({ ...REVIEWED, lifecycleState: "revoked" }).status === "self_reported" &&
      describeTrust({ ...LEGACY_ISSUER, lifecycleState: "expired" }).status === "self_reported",
  );
  ck(
    "5.14 the level words exist in both languages and differ; the required fallback wording is exact",
    (["self_declared", "documented", "source_verified"] as const).every((l) => {
      const k = trustLevelWordKey(l);
      return passportT(k, "sv") !== passportT(k, "en") && passportT(k, "sv").length > 0;
    }) &&
      LEGACY_SV ===
        "Granskning registrerad av CQrityjob. Direkt källbekräftelse kan inte visas för denna äldre post." &&
      LEGACY_EN ===
        "Review recorded by CQrityjob. Direct source confirmation is not available for this legacy record.",
  );
}

/* ================================================================== */
group("GROUP 6 — the method and attribution keys follow the same rule");
/* ================================================================== */
{
  ck(
    "6.1 methodLabelKey: legacy takes the short neutral value",
    methodLabelKey("issuer_confirmation", "CQrityjob") === "trust.legacy.method" &&
      methodLabelKey("employer_confirmation", "CQrityjob") === "trust.legacy.method",
  );
  ck(
    "6.2 methodLabelKey: a review says Dokumentgranskning, an employer confirmation says so",
    methodLabelKey("document_review", "CQrityjob") === "ver.method.document_review" &&
      methodLabelKey("employer_confirmation", "Bevakning AB") ===
        "ver.method.employer_confirmation",
  );
  ck(
    "6.3 methodLabelKey: an unknown method has no words, and says so",
    methodLabelKey("registry_check", "CQrityjob") === null && methodLabelKey(null, null) === null,
  );
  ck(
    "6.4 verifierAttributionKey: a review is 'Dokument granskat av', legacy is 'Granskad av'",
    verifierAttributionKey("document_review", "CQrityjob") ===
      "claims.attribution.document_review" &&
      verifierAttributionKey("issuer_confirmation", "CQrityjob") === "trust.reviewedBy" &&
      passportT("trust.reviewedBy", "sv") === "Granskad av" &&
      passportT("trust.reviewedBy", "en") === "Reviewed by",
  );
  ck(
    "6.5 verifierAttributionKey: without a decider the old mapping stands (history)",
    verifierAttributionKey("issuer_confirmation") === "claims.attribution.issuer_confirmation",
  );
  ck(
    "6.6 formatVerifierAttribution: legacy is the sentence alone; a real employer line is unchanged",
    formatVerifierAttribution("CQrityjob", "issuer_confirmation", "en") === LEGACY_EN &&
      formatVerifierAttribution("Bevakning AB", "employer_confirmation", "en") ===
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
    "6.8 every 'verified' predicate reads the effective level, not the stored one",
    /effectiveAssertionLevel\(claim\) === "verified"/.test(
      code("src/lib/professional-identity/types.ts"),
    ) &&
      /effectiveAssertionLevel\(claim\) === "verified"/.test(
        code("src/lib/security-passport/linkedin-profile.ts"),
      ) &&
      /effectiveAssertionLevel\(c\) === "verified"/.test(
        code("src/lib/security-passport/social.ts"),
      ) &&
      /effectiveAssertionLevel\(p\), floor/.test(code("src/lib/security-passport/experience.ts")) &&
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
    "6.9 the recipient route renders the list component and no inline credential list",
    /<RecipientCredentialList credentials=\{presentation\.credentials\}/.test(
      code("src/routes/p.$token.tsx"),
    ) && !/rec\.verifiedBy/.test(code("src/routes/p.$token.tsx")),
  );
}

/* ================================================================== */
group("GROUP 7 — the recipient model carries the level, once");
/* ================================================================== */
const payloadFor = (method: string, organisation: string, over: Record<string, unknown> = {}) =>
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
        ...over,
      },
    ],
    verified_experience: [],
    verified_experience_days: 0,
  }) as unknown as RecipientPayloadActive;

const reviewed = buildRecipientPresentation(payloadFor("document_review", "CQrityjob"), TODAY);
const legacyIssuer = buildRecipientPresentation(
  payloadFor("issuer_confirmation", "CQrityjob"),
  TODAY,
);
const legacyEmployer = buildRecipientPresentation(
  payloadFor("employer_confirmation", "CQrityjob"),
  TODAY,
);
const sourced = buildRecipientPresentation(
  payloadFor("issuer_confirmation", "Fiktiv utfärdare"),
  TODAY,
);
const DOCUMENTED_CASES = [
  ["document_review", reviewed],
  ["legacy issuer_confirmation", legacyIssuer],
  ["legacy employer_confirmation", legacyEmployer],
] as const;
{
  for (const [name, p] of DOCUMENTED_CASES) {
    const c = p.credentials[0];
    ck(
      `7.1 [${name}] the credential is still there -- documented, not hidden`,
      p.credentials.length === 1 && c.assertion === "verified",
    );
    ck(
      `7.2 [${name}] effective level document_provided, public level documented, presentation documented`,
      c.effectiveAssertion === "document_provided" &&
        c.level === "documented" &&
        c.presentation === "documented",
    );
    ck(
      `7.3 [${name}] the status word is Dokumenterad / Documented and the labels are Reviewed by`,
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
    "7.5 only the legacy shape is flagged legacy",
    !reviewed.credentials[0].legacyUnsupported &&
      legacyIssuer.credentials[0].legacyUnsupported &&
      legacyEmployer.credentials[0].legacyUnsupported,
  );
  const s = sourced.credentials[0];
  ck(
    "7.6 a source-confirmed credential is source_verified, presentation verified, word Källbekräftad",
    s.level === "source_verified" &&
      s.presentation === "verified" &&
      s.statusWordKey === "trust.level.source_verified" &&
      s.labels.by === "rec.verifiedBy",
  );
  ck(
    "7.7 and the same VU1, source-confirmed, DOES derive its outcome -- the engine is discriminating, not empty",
    sourced.titles.length > 0,
  );
}

/* ================================================================== */
group("GROUP 8 — the public recipient list, rendered");
/* ================================================================== */
{
  for (const [name, p] of DOCUMENTED_CASES) {
    const svMarkup = sv(<RecipientCredentialList credentials={p.credentials} />);
    const svText = text(svMarkup);
    ck(
      `8.1 [${name}] sv: says Dokumenterad, Granskad av, Granskningsmetod, Granskad`,
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
  const rText = text(sv(<RecipientCredentialList credentials={reviewed.credentials} />));
  ck(
    "8.5 a document review says Dokumentgranskning and prints no legacy sentence",
    rText.includes("Dokumentgranskning") && !rText.includes(LEGACY_SV),
  );
  for (const [name, p] of [
    ["issuer", legacyIssuer],
    ["employer", legacyEmployer],
  ] as const) {
    ck(
      `8.6 [legacy ${name}] prints the neutral sentence in sv and en`,
      text(sv(<RecipientCredentialList credentials={p.credentials} />)).includes(LEGACY_SV) &&
        text(en(<RecipientCredentialList credentials={p.credentials} />)).includes(LEGACY_EN),
    );
  }
  const sMarkup = sv(<RecipientCredentialList credentials={sourced.credentials} />);
  ck(
    "8.7 a source-confirmed credential wears the pill with the word Källbekräftad",
    /data-trust-pill="verified"/.test(sMarkup) && text(sMarkup).includes(SOURCE_SV),
  );
}

/* ================================================================== */
group("GROUP 9 — the credential page and the recipient card, rendered");
/* ================================================================== */
{
  const page = (p: typeof reviewed, r: typeof sv) =>
    r(
      <CredentialVerificationPage
        credential={p.credentials[0]}
        holderLabel="Fiktiv Innehavare"
        jurisdiction="Sverige"
        verifyUrl="cqrityjob.example/p/abc"
      />,
    );
  for (const [name, p] of DOCUMENTED_CASES) {
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
    "9.5 a legacy card prints the neutral sentence",
    text(sv(<RecipientPassportCard presentation={legacyIssuer} />)).includes(LEGACY_SV),
  );
  const sPage = page(sourced, sv);
  ck(
    "9.6 a source-confirmed page keeps the gold pill and derives its title on the card",
    /data-trust-pill="verified"/.test(sPage) &&
      !text(sv(<RecipientPassportCard presentation={sourced} />)).includes(
        passportT("common.notStated", "sv"),
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
const sourcedClaim = claimOf("issuer_confirmation", "Fiktiv utfärdare", { id: "claim-sourced" });
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
  const legacyRow = sv(<ClaimRow claim={legacyClaim} />);
  const legacyText = text(legacyRow);
  ck(
    "10.4 a legacy row: Dokumenterad, Granskad av, the sentence, history kept, no pill",
    legacyText.includes(DOCUMENTED_SV) &&
      legacyText.includes("Granskad av") &&
      legacyText.includes(LEGACY_SV) &&
      legacyText.includes("CQrityjob") &&
      !wearsCurrentVerified(legacyText, "sv") &&
      !/bg-primary/.test(legacyRow),
  );
  const sourcedRow = sv(<ClaimRow claim={sourcedClaim} />);
  ck(
    "10.5 a source-confirmed row wears the settled pill and Källbekräftad",
    /bg-primary/.test(sourcedRow) && text(sourcedRow).includes(SOURCE_SV),
  );

  const chip = (p: { verifierName: string; verificationMethod: string }) =>
    sv(<AssertionChip level="verified" lifecycleState="active" provenance={p} />);
  ck(
    "10.6 the chip: review → Dokumenterad in the documented shape; source → Källbekräftad in the pill",
    text(chip(REVIEWED)).includes(DOCUMENTED_SV) &&
      !/bg-primary/.test(chip(REVIEWED)) &&
      /lucide-file-text/.test(chip(REVIEWED)) &&
      text(chip(EMPLOYER)).includes(SOURCE_SV) &&
      /bg-primary/.test(chip(EMPLOYER)),
  );
  ck(
    "10.7 the chip without provenance (legend) keeps the stored vocabulary",
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
  const panel = (d: VerificationDecisionRecord) =>
    sv(
      <VerificationPanel
        assertionLevel="verified"
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
  const reviewPanel = text(panel(decision("document_review", "CQrityjob")));
  ck(
    "10.8 the verification panel for a review: 'Dokument granskat av', 'Granskningsmetod', 'Dokumentgranskning'; never Verifierad av",
    reviewPanel.includes("Dokument granskat av") &&
      reviewPanel.includes("Granskningsmetod") &&
      reviewPanel.includes("Dokumentgranskning") &&
      !wearsForbidden(reviewPanel),
  );
  const legacyPanelMarkup = panel(decision("issuer_confirmation", "CQrityjob"));
  const legacyPanel = text(legacyPanelMarkup);
  ck(
    "10.9 the panel for a legacy row: Granskad av, the sentence once, history kept, no employer block",
    legacyPanel.includes("Granskad av") &&
      /data-legacy-provenance="note"/.test(legacyPanelMarkup) &&
      legacyPanel.includes(LEGACY_SV) &&
      legacyPanel.includes("2026-08-21") &&
      !wearsForbidden(legacyPanel),
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
    "10.10 an employer-confirmed period on the timeline: Källbekräftad and 'Bekräftat av Bevakning AB'",
    timeline.includes(SOURCE_SV) && timeline.includes("Bekräftat av Bevakning AB (fiktiv)"),
  );
}

/* ================================================================== */
group("GROUP 11 — derivation: title, eligibility, tenure, counts, card");
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
  ck(
    "11.1 a reviewed VU1 derives NO outcome; a source-confirmed VU1 derives its outcome",
    allDerived(deriveVerifiedIdentity([reviewedClaim], MIRRORED_TITLE_RULES, TODAY)).length === 0 &&
      allDerived(deriveVerifiedIdentity([legacyClaim], MIRRORED_TITLE_RULES, TODAY)).length === 0 &&
      allDerived(deriveVerifiedIdentity([sourcedClaim], MIRRORED_TITLE_RULES, TODAY)).length > 0,
  );
  ck(
    "11.2 a reviewed personnel approval derives NO local eligibility; a source-confirmed one does",
    deriveVerifiedIdentity(
      [approval("document_review", "CQrityjob", "a1")],
      MIRRORED_TITLE_RULES,
      TODAY,
    ).localEligibility.length === 0 &&
      deriveVerifiedIdentity(
        [approval("employer_confirmation", "CQrityjob", "a2")],
        MIRRORED_TITLE_RULES,
        TODAY,
      ).localEligibility.length === 0 &&
      deriveVerifiedIdentity(
        [approval("issuer_confirmation", "Länsstyrelsen (fiktiv)", "a3")],
        MIRRORED_TITLE_RULES,
        TODAY,
      ).localEligibility.length > 0,
  );
  ck(
    "11.3 isCurrentlyVerified and isVerifiedClaim: false for a review and a legacy row, true for a source",
    !isCurrentlyVerified(reviewedClaim) &&
      !isCurrentlyVerified(legacyClaim) &&
      isCurrentlyVerified(sourcedClaim) &&
      !isVerifiedClaim(reviewedClaim) &&
      isVerifiedClaim(sourcedClaim),
  );
  const reviewedPeriod = periodOf("document_review", "CQrityjob");
  const legacyPeriod = periodOf("employer_confirmation", "CQrityjob");
  const realPeriod = periodOf("employer_confirmation", "Bevakning AB (fiktiv)");
  const t1 = totalsByEvidenceLevel([reviewedPeriod], TODAY);
  const t2 = totalsByEvidenceLevel([legacyPeriod], TODAY);
  const t3 = totalsByEvidenceLevel([realPeriod], TODAY);
  ck(
    "11.4 tenure: a reviewed or legacy period counts as documented time, not verified time",
    t1.verified.elapsedDays === 0 &&
      t1.documented.elapsedDays > 0 &&
      t2.verified.elapsedDays === 0 &&
      t2.documented.elapsedDays > 0,
  );
  ck(
    "11.5 tenure: an employer's own confirmation counts as verified time",
    t3.verified.elapsedDays > 0 && isCurrentlyVerified(realPeriod),
  );
  ck(
    "11.6 an employer confirmation reaches the identity engine through no path: claims only, and the database refuses the request",
    /deriveVerifiedIdentity\(\s*payload\.verified_claims\.map\(toDomainClaim\)/.test(
      code("src/lib/security-passport/recipient-presentation.ts"),
    ) &&
      read("supabase/tests/security_passport_trust_source_containment_test.sql").includes(
        "5.1 an employer still cannot be asked to attest to a credential",
      ),
  );
  ck(
    "11.7 the stored level is never rewritten by the projection",
    reviewedClaim.assertionLevel === "verified" &&
      effectiveAssertionLevel(reviewedClaim) === "document_provided" &&
      legacyClaim.assertionLevel === "verified",
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
  const reviewedCard = buildPassportCard(holderOf([reviewedClaim]), TODAY);
  const sourcedCard = buildPassportCard(holderOf([sourcedClaim]), TODAY);
  ck(
    "11.8 the private card state: documented for a reviewed holder, verified for a source-confirmed one",
    reviewedCard.state === "documented" &&
      sourcedCard.state === "verified" &&
      buildPassportCard(holderOf([claimOf(null, null, { assertionLevel: "self_declared" })]), TODAY)
        .state === "self_declared_only",
  );
  ck(
    "11.9 the market bucket counts a reviewed credential as documented, and the copy says so",
    reviewedCard.marketProfiles.some((p) => p.verifiedCredentials.length === 1) &&
      passportT("market.verified.many", "sv") === "dokumenterade" &&
      passportT("card.verifiedMarkets", "sv") === "Dokumenterade marknader" &&
      passportT("market.verified.many", "en") === "documented",
  );
}

/* ================================================================== */
group("GROUP 12 — the social image and LinkedIn: source-confirmed only");
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
  ck(
    "12.1 the social image names no reviewed or legacy credential as verified",
    social([reviewedClaim, legacyClaim]).verifiedCredentials.length === 0,
  );
  ck(
    "12.2 and names a source-confirmed one",
    social([sourcedClaim]).verifiedCredentials.length === 1,
  );
  ck(
    "12.3 LinkedIn's add-to-profile offers a reviewed or legacy credential to nobody, a source-confirmed one to the holder",
    linkedInProfileEntries(
      holderOf([reviewedClaim, legacyClaim]),
      "cqrityjob.example/p/abcdef123456",
      "sv",
    ).length === 0 &&
      linkedInProfileEntries(holderOf([sourcedClaim]), "cqrityjob.example/p/abcdef123456", "sv")
        .length === 1,
  );
  ck(
    "12.4 the anonymous holder label no longer claims a verified guard",
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
    "13.7 the predicates: a review completes; a legacy approval does not count as one; a refusal counts as neither",
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
