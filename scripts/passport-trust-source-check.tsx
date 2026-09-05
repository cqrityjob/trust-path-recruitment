// Security Passport — a verification method belongs to the party who used it,
// and a record that cannot support source confirmation presents as Documented.
//
// Run via `bun run passport-trust-source:check`.
//
// ── WHAT WAS WRONG ─────────────────────────────────────────────────────
//
// The reviewer form offered a CQrityjob reviewer three methods for an
// approval: document review, "confirmed by employer", "confirmed by issuer".
// The reviewer is neither an employer nor an issuer, and no issuer or employer
// took part in a `cqrityjob_review` decision. Yet every surface follows the
// recorded METHOD when it chooses its words, so a reviewer who picked the
// third option produced "Confirmed by the issuer CQrityjob" on the holder's
// Passport, on the CV, on the card and on the anonymous recipient page.
//
// Hosted production holds three such rows. 20261029090000 makes another one
// unwritable; this guard holds the APPLICATION half of the same decision:
//
//   1. the reviewer form has no method to choose -- it shows document review
//      and says what that is not;
//   2. the server function cannot send `issuer_confirmation` at all;
//   3. the three legacy rows present, everywhere, as DOCUMENTED -- word,
//      shape, glyph, labels, title derivation, eligibility, tenure, counts --
//      through ONE effective level (provenance.ts), not a condition per route;
//   4. a legitimate employer confirmation, given by the employer, still reads
//      "Confirmed by <employer>" and a genuine CQrityjob review keeps its
//      standing -- containment must not flatten real trust;
//   5. the reviewer who opens such a record is told it needs a manual
//      re-review, before the facts, and offered no button.
//
// ── WHY IT RENDERS RATHER THAN ONLY READS ──────────────────────────────
//
// Point 3 is a property of what a person SEES. The recipient credential list,
// the recipient card, the single-credential page, the holder's claim row, the
// holder's verification panel and the chip itself are rendered for real with
// a legacy credential, in Swedish AND in English, and the markup is asserted.
// A guard that only banned "confirmed by the issuer" would pass a page that
// still wore a green VERIFIED pill; this one fails on that too.

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { AssertionChip } from "../src/components/security-passport/AssertionChip";
import { ClaimRow } from "../src/components/security-passport/ClaimRow";
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
import { isVerifiedClaim } from "../src/lib/professional-identity/types";
import type { Claim, ExperiencePeriod } from "../src/lib/security-passport/types";
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

/** The sentences a legacy row must never wear, in either language. The
 *  Swedish fallback itself contains "källbekräftelse" (source confirmation)
 *  in a NEGATED sentence, so the test is for the affirmative phrases. */
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

  for (const lang of ["sv", "en"] as const) {
    const fixed = passportT("vq.methodFixed", lang);
    const help = passportT("vq.methodFixed.help", lang);
    ck(`1.9 [${lang}] the fixed method names CQrityjob`, /CQrityjob/.test(fixed));
    ck(
      `1.10 [${lang}] the explanation says it is not employer or issuer confirmation`,
      lang === "sv"
        ? /inte en direkt bekräftelse från arbetsgivaren eller utfärdaren/.test(help)
        : /not direct confirmation from the employer or issuer/.test(help),
    );
  }
  ck(
    "1.11 the required Swedish wording is exact",
    passportT("vq.methodFixed", "sv") === "Dokumentgranskning av CQrityjob" &&
      passportT("vq.methodFixed.help", "sv") ===
        "CQrityjob har granskat det underlag som innehavaren lämnat. Detta är inte en direkt bekräftelse från arbetsgivaren eller utfärdaren.",
  );
  ck(
    "1.12 the required English wording is exact",
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
  ck("2.1 decideInput declares a method enum", enumLine !== null);
  ck(
    "2.2 the enum is exactly document_review and employer_confirmation",
    enumLine !== null &&
      /"document_review"/.test(enumLine[1]) &&
      /"employer_confirmation"/.test(enumLine[1]) &&
      !/issuer_confirmation/.test(enumLine[1]),
  );
  const employer = code(
    "src/routes/_authenticated.employer.$employerSlug.employment-verifications.$requestId.tsx",
  );
  ck(
    "2.3 the employer surface still records employer_confirmation and nothing else",
    employer.includes('decision === "approved" ? "employer_confirmation" : null'),
  );
  ck(
    "2.4 the employer surface has copy for the disallowed-method refusal",
    /method_not_permitted: "vq\.decline\.method_not_permitted"/.test(employer),
  );

  for (const raw of [
    "SP_ISSUER_CONFIRMATION_NOT_AVAILABLE",
    "SP_CQRITYJOB_REVIEW_REQUIRES_DOCUMENT_REVIEW",
    "SP_EMPLOYER_ATTESTATION_REQUIRES_EMPLOYER_CONFIRMATION",
  ]) {
    ck(
      `2.5 ${raw} classifies as method_not_permitted`,
      classifyDecisionError(`ERROR: ${raw}`) === "method_not_permitted",
    );
  }
  ck(
    "2.6 the browser reads the code back off the thrown error",
    decisionErrorCodeFrom(new Error(`${DECISION_ERROR_PREFIX}method_not_permitted`)) ===
      "method_not_permitted",
  );
  for (const lang of ["sv", "en"] as const) {
    ck(
      `2.7 [${lang}] the refusal is a real sentence`,
      passportT("vq.decline.method_not_permitted", lang).length > 40,
    );
  }
}

/* ================================================================== */
group("GROUP 3 — the database half is in the repository");
/* ================================================================== */
{
  const mig = read("supabase/migrations/20261029090000_sp_trust_source_containment.sql");
  ck(
    "3.1 the migration carries all three refusals",
    /SP_ISSUER_CONFIRMATION_NOT_AVAILABLE/.test(mig) &&
      /SP_CQRITYJOB_REVIEW_REQUIRES_DOCUMENT_REVIEW/.test(mig) &&
      /SP_EMPLOYER_ATTESTATION_REQUIRES_EMPLOYER_CONFIRMATION/.test(mig),
  );
  ck(
    "3.2 the migration rewrites no row",
    !/UPDATE public\.sp_verification_decisions/.test(mig) &&
      !/DELETE FROM public\.sp_verification_decisions/.test(mig) &&
      !/UPDATE public\.sp_claims/.test(
        mig.replace(/UPDATE public\.sp_claims\s+SET assertion_level = 'verified'/g, ""),
      ),
  );
  ck(
    "3.3 a rollback restoring the prior body exists",
    read("supabase/rollback/20261029090000_sp_trust_source_containment_rollback.sql").includes(
      "SP_APPROVAL_REQUIRES_METHOD",
    ),
  );
  const dbTest = read("scripts/db-test.sh");
  ck(
    "3.4 db-test.sh runs the containment suite",
    dbTest.includes("security_passport_trust_source_containment_test.sql"),
  );
  const suite = read("supabase/tests/security_passport_trust_source_containment_test.sql");
  ck(
    "3.5 the suite proves the migration leaves legacy rows byte-for-byte unchanged",
    // The SQL source doubles the apostrophe; the runtime NOTICE, which
    // db-test.sh greps, does not.
    suite.includes("7.3 the legacy holder''s record is byte-for-byte unchanged by the migration") &&
      suite.includes("7.4 the legacy methods are still recorded as written") &&
      dbTest.includes("7.3 the legacy holder's record is byte-for-byte unchanged by the migration"),
  );
  ck(
    "3.6 the suite proves an employer cannot be asked to attest to a credential",
    suite.includes("SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY") &&
      suite.includes("anon holds no table privilege on any sp_ table") &&
      suite.includes("the evidence bucket is private"),
  );
  ck(
    "3.7 the read-only operator report exists and selects nothing personal",
    (() => {
      // Comments stripped: the header LISTS the columns it refuses to select.
      const r = read("scripts/passport-legacy-provenance-report.sql").replace(/^\s*--.*$/gm, "");
      return (
        /decider_organisation = 'CQrityjob'/.test(r) &&
        !/display_name|email|title|holder_note|decision_note|storage_path/.test(r)
      );
    })(),
  );
}

/* ================================================================== */
group("GROUP 4 — the legacy shape is recognised once, and lowers the level once");
/* ================================================================== */
{
  ck(
    "4.1 issuer_confirmation by CQrityjob is legacy",
    isLegacyUnsupportedProvenance("issuer_confirmation", "CQrityjob"),
  );
  ck(
    "4.2 employer_confirmation by CQrityjob is legacy",
    isLegacyUnsupportedProvenance("employer_confirmation", CQRITYJOB_DECIDER_ORGANISATION),
  );
  ck(
    "4.3 employer_confirmation by an employer is NOT legacy",
    !isLegacyUnsupportedProvenance("employer_confirmation", "Bevakning AB"),
  );
  ck(
    "4.4 document_review by CQrityjob is NOT legacy",
    !isLegacyUnsupportedProvenance("document_review", "CQrityjob"),
  );
  ck(
    "4.5 no method or no decider is NOT legacy",
    !isLegacyUnsupportedProvenance(null, "CQrityjob") &&
      !isLegacyUnsupportedProvenance("issuer_confirmation", null),
  );
  ck(
    "4.6 the effective level of a legacy row is document_provided",
    effectiveAssertionLevel({
      assertionLevel: "verified",
      verifierName: "CQrityjob",
      verificationMethod: "issuer_confirmation",
    }) === "document_provided",
  );
  ck(
    "4.7 the effective level of a genuine review is unchanged",
    effectiveAssertionLevel({
      assertionLevel: "verified",
      verifierName: "CQrityjob",
      verificationMethod: "document_review",
    }) === "verified" &&
      effectiveAssertionLevel({ assertionLevel: "self_declared" }) === "self_declared",
  );
  ck(
    "4.8 the symbol state of a legacy row is documented, never verified",
    credentialPresentationOf(
      {
        assertionLevel: "verified",
        verifierName: "CQrityjob",
        verificationMethod: "employer_confirmation",
      },
      "active",
    ) === "documented",
  );
  ck(
    "4.9 the labels of a legacy row do not claim verification",
    (() => {
      const l = provenanceLabelKeys({
        assertionLevel: "verified",
        verifierName: "CQrityjob",
        verificationMethod: "issuer_confirmation",
      });
      return (
        l.by === "trust.reviewedBy" &&
        l.method === "trust.reviewMethod" &&
        l.at === "trust.reviewedAt"
      );
    })(),
  );
  ck(
    "4.10 the labels of a genuine record are the verification labels",
    provenanceLabelKeys({
      assertionLevel: "verified",
      verifierName: "CQrityjob",
      verificationMethod: "document_review",
    }).by === "rec.verifiedBy",
  );
}

/* ================================================================== */
group("GROUP 5 — describeTrust: legacy is documented, never a source");
/* ================================================================== */
{
  for (const method of ["issuer_confirmation", "employer_confirmation"] as const) {
    const t = describeTrust({
      assertionLevel: "verified",
      lifecycleState: "active",
      verifierName: "CQrityjob",
      verificationMethod: method,
      verifiedOn: "2026-08-21",
    });
    ck(`5.1 [${method}] status records that a verifier decided`, t.status === "verified");
    ck(`5.2 [${method}] sourceType is legacy_unsupported`, t.sourceType === "legacy_unsupported");
    ck(`5.3 [${method}] method is null downstream`, t.method === null);
    ck(`5.4 [${method}] is not an employer confirmation`, !isEmployerConfirmed(t));
    ck(`5.5 [${method}] does not present as verified`, !presentsAsVerified(t));
    ck(`5.6 [${method}] the Swedish line is the neutral fallback`, t.labelSv === LEGACY_SV);
    ck(`5.7 [${method}] the English line is the neutral fallback`, t.labelEn === LEGACY_EN);
    ck(
      `5.8 [${method}] the short word is Dokumenterad / Documented, not Verifierad`,
      t.shortSv === DOCUMENTED_SV && t.shortEn === DOCUMENTED_EN,
    );
    ck(
      `5.9 [${method}] no line wears a source-confirmation or verified-by phrase`,
      !wearsForbidden(t.labelSv) && !wearsForbidden(t.labelEn),
    );
    ck(`5.10 [${method}] public trust level is documented`, publicTrustLevel(t) === "documented");
    ck(
      `5.11 [${method}] the employment register uses the same fallback`,
      employmentTrustLine(t, "sv") === LEGACY_SV && employmentTrustLine(t, "en") === LEGACY_EN,
    );
    ck(
      `5.12 [${method}] trustLabel returns the fallback in both languages`,
      trustLabel(t, "sv") === LEGACY_SV && trustLabel(t, "en") === LEGACY_EN,
    );
  }

  // Containment must not flatten real trust.
  const real = describeTrust({
    assertionLevel: "verified",
    verifierName: "Bevakning AB",
    verificationMethod: "employer_confirmation",
    verifiedOn: "2026-08-21",
  });
  ck("5.13 an employer's own confirmation is still source-level", isEmployerConfirmed(real));
  ck(
    "5.14 and still reads 'Confirmed by Bevakning AB'",
    real.labelEn === "Confirmed by Bevakning AB" && real.labelSv === "Bekräftat av Bevakning AB",
  );
  ck("5.15 and is source_verified publicly", publicTrustLevel(real) === "source_verified");
  ck("5.16 and presents as verified", presentsAsVerified(real));

  const review = describeTrust({
    assertionLevel: "verified",
    lifecycleState: "active",
    verifierName: "CQrityjob",
    verificationMethod: "document_review",
    verifiedOn: "2026-08-21",
  });
  ck(
    "5.17 a document review still reads 'Document reviewed by CQrityjob'",
    review.labelEn === "Document reviewed by CQrityjob" && review.sourceType === "document_review",
  );
  ck("5.18 and is documented publicly", publicTrustLevel(review) === "documented");
  ck(
    "5.19 self-declared and document-provided are self_declared publicly",
    publicTrustLevel(describeTrust({ assertionLevel: "self_declared" })) === "self_declared" &&
      publicTrustLevel(describeTrust({ assertionLevel: "document_provided" })) === "self_declared",
  );
  ck(
    "5.20 an unreadable standing has no public level, and a word that says so",
    publicTrustLevel(describeTrust({ assertionLevel: "verified", provenanceUnavailable: true })) ===
      null && trustLevelWordKey(null) === "trust.level.unknown",
  );
  ck(
    "5.21 a lapsed legacy row is not verified at all",
    describeTrust({
      assertionLevel: "verified",
      lifecycleState: "revoked",
      verifierName: "CQrityjob",
      verificationMethod: "issuer_confirmation",
    }).status === "self_reported",
  );
  ck(
    "5.22 the level words exist in both languages and differ",
    (["self_declared", "documented", "source_verified"] as const).every((l) => {
      const k = trustLevelWordKey(l);
      return passportT(k, "sv") !== passportT(k, "en") && passportT(k, "sv").length > 0;
    }) &&
      DOCUMENTED_SV === "Dokumenterad" &&
      DOCUMENTED_EN === "Documented",
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
    "6.2 methodLabelKey: a real employer confirmation keeps its words",
    methodLabelKey("employer_confirmation", "Bevakning AB") === "ver.method.employer_confirmation",
  );
  ck(
    "6.3 methodLabelKey: document review keeps its words",
    methodLabelKey("document_review", "CQrityjob") === "ver.method.document_review",
  );
  ck(
    "6.4 methodLabelKey: an unknown method has no words, and says so",
    methodLabelKey("registry_check", "CQrityjob") === null && methodLabelKey(null, null) === null,
  );
  ck(
    "6.5 verifierAttributionKey: legacy takes the 'Reviewed by' label",
    verifierAttributionKey("issuer_confirmation", "CQrityjob") === "trust.reviewedBy" &&
      passportT("trust.reviewedBy", "sv") === "Granskad av" &&
      passportT("trust.reviewedBy", "en") === "Reviewed by",
  );
  ck(
    "6.6 verifierAttributionKey: without a decider the old mapping stands (history)",
    verifierAttributionKey("issuer_confirmation") === "claims.attribution.issuer_confirmation",
  );
  ck(
    "6.7 formatVerifierAttribution: legacy is the fallback alone, not '… CQrityjob CQrityjob'",
    formatVerifierAttribution("CQrityjob", "issuer_confirmation", "en") === LEGACY_EN &&
      formatVerifierAttribution("CQrityjob", "employer_confirmation", "sv") === LEGACY_SV,
  );
  ck(
    "6.8 formatVerifierAttribution: a real employer line is unchanged",
    formatVerifierAttribution("Bevakning AB", "employer_confirmation", "en") ===
      "Confirmed by Bevakning AB",
  );
  ck(
    "6.9 no surface keeps a private METHOD_KEY table",
    [
      "src/components/security-passport/live/RecipientCredentialList.tsx",
      "src/components/security-passport/live/CredentialVerificationPage.tsx",
      "src/components/security-passport/live/VerificationPanel.tsx",
      "src/routes/p.$token.tsx",
    ].every((p) => !/const METHOD_KEY/.test(code(p))),
  );
  ck(
    "6.10 no surface derives a symbol state from the stored level directly",
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
    "6.11 the holder's 'confirmed by employer' block asks the shared predicate",
    /employerGaveConfirmation\(latestApproval\)/.test(
      code("src/components/security-passport/live/VerificationPanel.tsx"),
    ),
  );
  ck(
    "6.12 the recipient route renders the list component and no inline credential list",
    /<RecipientCredentialList credentials=\{presentation\.credentials\}/.test(
      code("src/routes/p.$token.tsx"),
    ) && !/rec\.verifiedBy/.test(code("src/routes/p.$token.tsx")),
  );
  ck(
    "6.13 the required fallback wording is exact",
    LEGACY_SV ===
      "Granskning registrerad av CQrityjob. Direkt källbekräftelse kan inte visas för denna äldre post." &&
      LEGACY_EN ===
        "Review recorded by CQrityjob. Direct source confirmation is not available for this legacy record.",
  );
}

/* ================================================================== */
group("GROUP 7 — the recipient model carries the level, once");
/* ================================================================== */
const payloadFor = (
  method: string,
  organisation: string,
  over: Partial<RecipientPayloadActive["verified_claims"][number]> = {},
) =>
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

const TODAY = "2026-09-05";
const legacyIssuer = buildRecipientPresentation(
  payloadFor("issuer_confirmation", "CQrityjob"),
  TODAY,
);
const legacyEmployer = buildRecipientPresentation(
  payloadFor("employer_confirmation", "CQrityjob"),
  TODAY,
);
const genuine = buildRecipientPresentation(payloadFor("document_review", "CQrityjob"), TODAY);
{
  for (const [name, p] of [
    ["issuer_confirmation", legacyIssuer],
    ["employer_confirmation", legacyEmployer],
  ] as const) {
    const c = p.credentials[0];
    ck(
      `7.1 [${name}] the credential is still there -- documented, not hidden`,
      p.credentials.length === 1,
    );
    ck(`7.2 [${name}] legacyUnsupported is true`, c.legacyUnsupported);
    ck(
      `7.3 [${name}] effective level is document_provided`,
      c.effectiveAssertion === "document_provided",
    );
    ck(`7.4 [${name}] public level is documented`, c.level === "documented");
    ck(`7.5 [${name}] presentation is the documented state`, c.presentation === "documented");
    ck(
      `7.6 [${name}] the status word is Dokumenterad / Documented`,
      c.statusWordKey === "trust.level.documented",
    );
    ck(
      `7.7 [${name}] the labels are Reviewed by / Review method / Reviewed`,
      c.labels.by === "trust.reviewedBy",
    );
    ck(`7.8 [${name}] the stored assertion is reported as written`, c.assertion === "verified");
    ck(`7.9 [${name}] no verified title is derived from it`, p.titles.length === 0);
    ck(`7.10 [${name}] no eligibility is derived from it`, p.eligibility.length === 0);
  }
  const g = genuine.credentials[0];
  ck(
    "7.11 a genuine review is not legacy",
    !g.legacyUnsupported && g.effectiveAssertion === "verified",
  );
  ck("7.12 a genuine review is documented at the public level", g.level === "documented");
  ck(
    "7.13 a genuine review keeps the verified presentation",
    g.presentation === "verified" && g.statusWordKey === "assertion.verified",
  );
  ck("7.14 a genuine review keeps the verification labels", g.labels.by === "rec.verifiedBy");
  ck(
    "7.15 the same VU1, genuinely reviewed, DOES derive its title -- the engine is discriminating, not empty",
    genuine.titles.length > 0,
  );
}

/* ================================================================== */
group("GROUP 8 — the public recipient list, rendered");
/* ================================================================== */
{
  for (const [name, p] of [
    ["issuer_confirmation", legacyIssuer],
    ["employer_confirmation", legacyEmployer],
  ] as const) {
    const svMarkup = sv(<RecipientCredentialList credentials={p.credentials} />);
    const svText = text(svMarkup);
    ck(`8.1 [${name}] sv: the page says Dokumenterad`, svText.includes(DOCUMENTED_SV));
    ck(
      `8.2 [${name}] sv: the page wears no current Verifierad status`,
      !wearsCurrentVerified(svText, "sv"),
    );
    ck(`8.3 [${name}] sv: no source-confirmation or verified-by phrase`, !wearsForbidden(svText));
    ck(
      `8.4 [${name}] sv: the labels read Granskad av / Granskningsmetod`,
      svText.includes("Granskad av") && svText.includes("Granskningsmetod"),
    );
    ck(`8.5 [${name}] sv: the neutral explanation is printed`, svText.includes(LEGACY_SV));
    ck(
      `8.6 [${name}] no green verified pill, no check glyph, no verified symbol`,
      !/data-trust-pill="verified"/.test(svMarkup) &&
        !/bg-primary/.test(svMarkup) &&
        !/lucide-badge-check|lucide-circle-check/.test(svMarkup) &&
        /lucide-file-text/.test(svMarkup),
    );
    const enText = text(en(<RecipientCredentialList credentials={p.credentials} />));
    ck(`8.7 [${name}] en: the page says Documented`, enText.includes(DOCUMENTED_EN));
    ck(
      `8.8 [${name}] en: no current Verified status, no forbidden phrase`,
      !wearsCurrentVerified(enText, "en") && !wearsForbidden(enText),
    );
    ck(
      `8.9 [${name}] en: Reviewed by / Review method`,
      enText.includes("Reviewed by") && enText.includes("Review method"),
    );
    ck(`8.10 [${name}] en: the neutral explanation is printed`, enText.includes(LEGACY_EN));
  }
  const gMarkup = sv(<RecipientCredentialList credentials={genuine.credentials} />);
  ck(
    "8.11 a genuine review still wears the verified pill and 'Verifierad av'",
    /data-trust-pill="verified"/.test(gMarkup) &&
      text(gMarkup).includes("Verifierad av") &&
      !text(gMarkup).includes(LEGACY_SV),
  );
}

/* ================================================================== */
group("GROUP 9 — the single-credential page and the recipient card, rendered");
/* ================================================================== */
{
  const page = (p: typeof legacyIssuer, r: typeof sv) =>
    r(
      <CredentialVerificationPage
        credential={p.credentials[0]}
        holderLabel="Fiktiv Innehavare"
        jurisdiction="Sverige"
        verifyUrl="cqrityjob.example/p/abc"
      />,
    );
  for (const [name, p] of [
    ["issuer_confirmation", legacyIssuer],
    ["employer_confirmation", legacyEmployer],
  ] as const) {
    const svMarkup = page(p, sv);
    const svText = text(svMarkup);
    ck(`9.1 [${name}] sv: the credential page says Dokumenterad`, svText.includes(DOCUMENTED_SV));
    ck(
      `9.2 [${name}] sv: no current Verifierad, no forbidden phrase`,
      !wearsCurrentVerified(svText, "sv") && !wearsForbidden(svText),
    );
    ck(
      `9.3 [${name}] sv: Granskad av, and the explanation`,
      svText.includes("Granskad av") && svText.includes(LEGACY_SV),
    );
    ck(
      `9.4 [${name}] the pill is the current-but-not-verified state, not gold`,
      /data-trust-pill="current"/.test(svMarkup) && !/data-trust-pill="verified"/.test(svMarkup),
    );
    const enText = text(page(p, en));
    ck(
      `9.5 [${name}] en: Documented, Reviewed by, no Verified by`,
      enText.includes(DOCUMENTED_EN) &&
        enText.includes("Reviewed by") &&
        !wearsForbidden(enText) &&
        !wearsCurrentVerified(enText, "en"),
    );

    const cardMarkup = sv(
      <RecipientPassportCard presentation={p} verifyUrl="cqrityjob.example/p/abc" />,
    );
    const cardText = text(cardMarkup);
    ck(`9.6 [${name}] the card says Dokumenterad`, cardText.includes(DOCUMENTED_SV));
    ck(
      `9.7 [${name}] the card wears no current Verifierad and no forbidden phrase`,
      !wearsCurrentVerified(cardText, "sv") && !wearsForbidden(cardText),
    );
    ck(
      `9.8 [${name}] the card says Granskad av and prints the explanation`,
      cardText.includes("Granskad av") && cardText.includes(LEGACY_SV),
    );
    ck(
      `9.9 [${name}] the card derives no title from it`,
      cardText.includes(passportT("common.notStated", "sv")),
    );
  }
  const gPage = page(genuine, sv);
  ck(
    "9.10 a genuine review's page keeps the gold verified pill",
    /data-trust-pill="verified"/.test(gPage) && text(gPage).includes("Verifierad av"),
  );
  const gCard = text(sv(<RecipientPassportCard presentation={genuine} />));
  ck(
    "9.11 a genuine review's card still says VERIFIERAD and derives its title",
    wearsCurrentVerified(gCard, "sv") && !gCard.includes(passportT("common.notStated", "sv")),
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
  id: "claim-legacy",
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
{
  const legacy = claimOf("issuer_confirmation", "CQrityjob");
  const rowMarkup = sv(<ClaimRow claim={legacy} />);
  const rowText = text(rowMarkup);
  ck("10.1 the holder's claim row says Dokumenterad", rowText.includes(DOCUMENTED_SV));
  ck(
    "10.2 and wears no current Verifierad and no forbidden phrase",
    !wearsCurrentVerified(rowText, "sv") && !wearsForbidden(rowText),
  );
  ck("10.3 and labels the decider 'Granskad av'", rowText.includes("Granskad av"));
  ck(
    "10.4 and keeps the history: CQrityjob and the date are still printed",
    rowText.includes("CQrityjob") && rowText.includes("2026-08-21"),
  );
  ck("10.5 and prints the explanation", rowText.includes(LEGACY_SV));
  ck(
    "10.6 and no filled pill or check glyph",
    !/bg-primary/.test(rowMarkup) &&
      !/lucide-circle-check|lucide-badge-check/.test(rowMarkup) &&
      /lucide-file-text/.test(rowMarkup),
  );

  const genuineRow = text(sv(<ClaimRow claim={claimOf("document_review", "CQrityjob")} />));
  ck(
    "10.7 a genuine review's row still says VERIFIERAD and 'Dokument granskat av'",
    wearsCurrentVerified(genuineRow, "sv") && genuineRow.includes("Dokument granskat av"),
  );

  const chip = sv(
    <AssertionChip
      level="verified"
      lifecycleState="active"
      provenance={{ verifierName: "CQrityjob", verificationMethod: "employer_confirmation" }}
    />,
  );
  ck(
    "10.8 the chip itself renders Dokumenterad in the documented shape",
    text(chip).includes(DOCUMENTED_SV) && !/bg-primary/.test(chip) && /lucide-file-text/.test(chip),
  );
  ck(
    "10.9 the chip with no provenance is unchanged",
    text(sv(<AssertionChip level="verified" lifecycleState="active" />)).includes(
      passportT("assertion.verified", "sv"),
    ),
  );

  const decision: VerificationDecisionRecord = {
    id: "d1",
    requestId: "r1",
    decision: "approved",
    organisation: "CQrityjob",
    method: "issuer_confirmation",
    decidedAt: "2026-08-21T10:00:00Z",
    validFrom: null,
    validUntil: null,
  };
  const noopAsync = async () => {};
  const panel = sv(
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
      decisions={[decision]}
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
  const panelText = text(panel);
  ck(
    "10.10 the verification panel labels the decider 'Granskad av' and the method 'Granskningsmetod'",
    panelText.includes("Granskad av") && panelText.includes("Granskningsmetod"),
  );
  ck("10.11 and never 'Verifierad av' or 'Bekräftad av'", !wearsForbidden(panelText));
  ck(
    "10.12 and prints the explanation once",
    /data-legacy-provenance="note"/.test(panel) && panelText.includes(LEGACY_SV),
  );
  ck(
    "10.13 and does not render the employer-confirmed block",
    !panelText.includes(
      passportT("ver.employer.confirmedBy", "sv").replace("{employer}", "").trim().split(" ")[0] +
        " ",
    ) || !/Building2|lucide-building-2/.test(panel),
  );
  ck(
    "10.14 the decision history is still listed (audit not hidden)",
    panelText.includes("2026-08-21"),
  );
}

/* ================================================================== */
group("GROUP 11 — derivation: no verified title, eligibility, tenure or count");
/* ================================================================== */
{
  const legacyVu1 = claimOf("issuer_confirmation", "CQrityjob");
  const genuineVu1 = claimOf("document_review", "CQrityjob");
  const legacyApproval = claimOf("employer_confirmation", "CQrityjob", {
    id: "claim-approval",
    claimType: "licence",
    credentialCode: "SE_PERSONNEL_APPROVAL",
    titleSv: "Personalgodkännande (fiktivt)",
    titleEn: "Personnel approval (fictional)",
  });
  const genuineApproval = { ...legacyApproval, verificationMethod: "document_review" as const };

  ck(
    "11.1 a legacy VU1 derives nothing; the same VU1 genuinely reviewed derives its outcome",
    allDerived(deriveVerifiedIdentity([legacyVu1], MIRRORED_TITLE_RULES, TODAY)).length === 0 &&
      allDerived(deriveVerifiedIdentity([genuineVu1], MIRRORED_TITLE_RULES, TODAY)).length > 0,
  );
  ck(
    "11.2 a legacy personnel approval derives no local eligibility; a genuine one does",
    deriveVerifiedIdentity([legacyApproval], MIRRORED_TITLE_RULES, TODAY).localEligibility
      .length === 0 &&
      deriveVerifiedIdentity([genuineApproval], MIRRORED_TITLE_RULES, TODAY).localEligibility
        .length > 0,
  );
  ck(
    "11.3 isCurrentlyVerified is false for a legacy claim, true for a genuine one",
    !isCurrentlyVerified(legacyVu1) && isCurrentlyVerified(genuineVu1),
  );
  ck(
    "11.4 the professional-identity predicate agrees",
    !isVerifiedClaim(legacyVu1) && isVerifiedClaim(genuineVu1),
  );

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
  const legacyPeriod = periodOf("employer_confirmation", "CQrityjob");
  const realPeriod = periodOf("employer_confirmation", "Bevakning AB (fiktiv)");
  const t1 = totalsByEvidenceLevel([legacyPeriod], TODAY);
  const t2 = totalsByEvidenceLevel([realPeriod], TODAY);
  ck(
    "11.5 a legacy period counts as documented tenure, not verified tenure",
    t1.verified.elapsedDays === 0 && t1.documented.elapsedDays > 0,
  );
  ck("11.6 an employer's own confirmation counts as verified tenure", t2.verified.elapsedDays > 0);
  ck(
    "11.7 and is currently verified",
    isCurrentlyVerified(realPeriod) && !isCurrentlyVerified(legacyPeriod),
  );
  ck(
    "11.8 an employer confirmation reaches the identity engine through no path: it takes claims only",
    /deriveVerifiedIdentity\(\s*payload\.verified_claims\.map\(toDomainClaim\)/.test(
      code("src/lib/security-passport/recipient-presentation.ts"),
    ) &&
      read("supabase/tests/security_passport_trust_source_containment_test.sql").includes(
        "5.1 an employer still cannot be asked to attest to a credential",
      ),
  );
  ck(
    "11.9 the audience gate applies the effective level for every derivation",
    /withEffectiveAssertion\(claims\)/.test(
      code("src/lib/security-passport/identity/visibility.ts"),
    ),
  );
  ck(
    "11.10 the stored level is never rewritten by the projection",
    legacyVu1.assertionLevel === "verified" &&
      effectiveAssertionLevel(legacyVu1) === "document_provided",
  );
}

/* ================================================================== */
group("GROUP 12 — the reviewer and admin see the warning");
/* ================================================================== */
{
  ck(
    "12.1 a legacy approval in the history is recognised",
    hasLegacyUnsupportedApproval([
      { decision: "approved", method: "issuer_confirmation", organisation: "CQrityjob" },
    ]) &&
      hasLegacyUnsupportedApproval([
        { decision: "rejected", method: null, organisation: "CQrityjob" },
        { decision: "approved", method: "employer_confirmation", organisation: "CQrityjob" },
      ]),
  );
  ck(
    "12.2 a genuine review, a real employer confirmation and a refusal are not",
    !hasLegacyUnsupportedApproval([
      { decision: "approved", method: "document_review", organisation: "CQrityjob" },
      { decision: "approved", method: "employer_confirmation", organisation: "Bevakning AB" },
      { decision: "rejected", method: "issuer_confirmation", organisation: "CQrityjob" },
    ]),
  );
  const ws = code("src/routes/_authenticated.passport-review.tsx");
  ck(
    "12.3 the shared workspace renders the warning from the same predicate, before the facts",
    /hasLegacyUnsupportedApproval\(priorDecisions\)/.test(ws) &&
      /data-legacy-record="warning"/.test(ws) &&
      /pt\("vq\.legacy\.title"\)/.test(ws) &&
      /pt\("vq\.legacy\.body"\)/.test(ws) &&
      ws.indexOf('data-legacy-record="warning"') < ws.indexOf("<ReviewClaimFacts"),
  );
  ck(
    "12.4 and only for a record whose stored level is verified",
    /detail\.claim\?\.assertion === "verified" \|\|\s*detail\.period\?\.assertion === "verified"/.test(
      ws,
    ),
  );
  ck(
    "12.5 the admin route reuses the same workspace",
    /<PassportReviewWorkspace \/>/.test(
      code("src/routes/_authenticated.admin.passport-verification.tsx"),
    ),
  );
  ck(
    "12.6 the warning offers no remediation: no revoke, no edit, no bulk action beside it",
    !/onClick=\{[^}]*legacy/i.test(ws) && !/legacy[^\n]*revoke/i.test(ws),
  );
  ck(
    "12.7 the Swedish wording is exact",
    passportT("vq.legacy.title", "sv") === "Äldre verifieringspost – manuell omprövning krävs" &&
      passportT("vq.legacy.body", "sv") ===
        "Posten registrerades med en källmetod utan strukturell källbekräftelse. Den visas som Dokumenterad tills en behörig källa har bekräftat uppgiften.",
  );
  ck(
    "12.8 the English wording is exact",
    passportT("vq.legacy.title", "en") ===
      "Legacy verification record – manual re-review required" &&
      passportT("vq.legacy.body", "en") ===
        "The record was created with a source method without structural source confirmation. It is displayed as Documented until an authorised source confirms it.",
  );
}

console.log("");
if (fails.length) {
  console.error(`passport-trust-source-check: ${fails.length} assertion(s) failed:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("passport-trust-source-check: all assertions passed.");
