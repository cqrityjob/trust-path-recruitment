// Security Passport — a verification method belongs to the party who used it.
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
//   3. the three legacy rows render, everywhere, as a CQrityjob review and
//      never as a source confirmation -- through ONE helper, not a string
//      condition per route;
//   4. a legitimate employer confirmation, given by the employer, still reads
//      "Confirmed by <employer>" -- containment must not flatten real trust.
//
// ── WHY IT RENDERS RATHER THAN ONLY READS ──────────────────────────────
//
// Point 3 is a property of what a stranger SEES. The recipient credential
// page and the recipient card are rendered for real with a legacy credential
// and the markup is asserted, in Swedish (what `I18nProvider` renders) with
// the English half asserted from the copy module.

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { CredentialVerificationPage } from "../src/components/security-passport/live/CredentialVerificationPage";
import { RecipientPassportCard } from "../src/components/security-passport/live/RecipientPassportCard";
import { buildRecipientPresentation } from "../src/lib/security-passport/recipient-presentation";
import type { RecipientPayloadActive } from "../src/lib/security-passport/packages";
import { passportT } from "../src/lib/security-passport/i18n";
import {
  CQRITYJOB_DECIDER_ORGANISATION,
  isLegacyUnsupportedProvenance,
} from "../src/lib/security-passport/provenance";
import {
  formatVerifierAttribution,
  verifierAttributionKey,
} from "../src/lib/security-passport/format";
import {
  describeTrust,
  employmentTrustLine,
  isEmployerConfirmed,
  methodLabelKey,
  publicTrustLevel,
  trustLabel,
} from "../src/lib/security-passport/trust-presentation";
import {
  classifyDecisionError,
  decisionErrorCodeFrom,
  DECISION_ERROR_PREFIX,
} from "../src/lib/security-passport/decision-errors";

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

/** The sentences a legacy row must never wear, in either language. The
 *  Swedish fallback itself contains "källbekräftelse" (source confirmation)
 *  in a NEGATED sentence, so the test is for the affirmative phrases. */
const FORBIDDEN: readonly RegExp[] = [
  /Bekräftat av/i,
  /Bekräftad av/i,
  /Confirmed by/i,
  /Verified by the issuer/i,
  /Verifierad av utfärdaren/i,
  /Source[- ]verified/i,
  /Källverifierad/i,
];
const wearsForbidden = (s: string | null | undefined) =>
  typeof s === "string" && FORBIDDEN.some((re) => re.test(s));

const LEGACY_SV = passportT("trust.legacy.unsupported", "sv");
const LEGACY_EN = passportT("trust.legacy.unsupported", "en");

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
      !/DELETE FROM public\.sp_verification_decisions/.test(mig),
  );
  ck(
    "3.3 a rollback restoring the prior body exists",
    read("supabase/rollback/20261029090000_sp_trust_source_containment_rollback.sql").includes(
      "SP_APPROVAL_REQUIRES_METHOD",
    ),
  );
  ck(
    "3.4 db-test.sh runs the containment suite",
    read("scripts/db-test.sh").includes("security_passport_trust_source_containment_test.sql"),
  );
  ck(
    "3.5 the read-only operator report exists and selects nothing personal",
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
group("GROUP 4 — the legacy shape is recognised once");
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
}

/* ================================================================== */
group("GROUP 5 — describeTrust: legacy renders as a review, never as a source");
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
    ck(
      `5.1 [${method}] status stays verified -- a verifier really decided`,
      t.status === "verified",
    );
    ck(`5.2 [${method}] sourceType is legacy_unsupported`, t.sourceType === "legacy_unsupported");
    ck(`5.3 [${method}] method is null downstream`, t.method === null);
    ck(`5.4 [${method}] is not an employer confirmation`, !isEmployerConfirmed(t));
    ck(`5.5 [${method}] the Swedish line is the neutral fallback`, t.labelSv === LEGACY_SV);
    ck(`5.6 [${method}] the English line is the neutral fallback`, t.labelEn === LEGACY_EN);
    ck(
      `5.7 [${method}] neither line wears a source-confirmation phrase`,
      !wearsForbidden(t.labelSv) && !wearsForbidden(t.labelEn),
    );
    ck(`5.8 [${method}] public trust level is documented`, publicTrustLevel(t) === "documented");
    ck(
      `5.9 [${method}] the employment register uses the same fallback`,
      employmentTrustLine(t, "sv") === LEGACY_SV && employmentTrustLine(t, "en") === LEGACY_EN,
    );
    ck(
      `5.10 [${method}] trustLabel returns the fallback in both languages`,
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
  ck("5.11 an employer's own confirmation is still source-level", isEmployerConfirmed(real));
  ck(
    "5.12 and still reads 'Confirmed by Bevakning AB'",
    real.labelEn === "Confirmed by Bevakning AB" && real.labelSv === "Bekräftat av Bevakning AB",
  );
  ck("5.13 and is source_verified publicly", publicTrustLevel(real) === "source_verified");

  const review = describeTrust({
    assertionLevel: "verified",
    lifecycleState: "active",
    verifierName: "CQrityjob",
    verificationMethod: "document_review",
    verifiedOn: "2026-08-21",
  });
  ck(
    "5.14 a document review still reads 'Document reviewed by CQrityjob'",
    review.labelEn === "Document reviewed by CQrityjob" && review.sourceType === "document_review",
  );
  ck("5.15 and is documented publicly", publicTrustLevel(review) === "documented");
  ck(
    "5.16 self-declared and document-provided are self_declared publicly",
    publicTrustLevel(describeTrust({ assertionLevel: "self_declared" })) === "self_declared" &&
      publicTrustLevel(describeTrust({ assertionLevel: "document_provided" })) === "self_declared",
  );
  ck(
    "5.17 an unreadable standing has no public level",
    publicTrustLevel(describeTrust({ assertionLevel: "verified", provenanceUnavailable: true })) ===
      null,
  );
  ck(
    "5.18 a lapsed legacy row is not verified at all",
    describeTrust({
      assertionLevel: "verified",
      lifecycleState: "revoked",
      verifierName: "CQrityjob",
      verificationMethod: "issuer_confirmation",
    }).status === "self_reported",
  );
}

/* ================================================================== */
group("GROUP 6 — the method and attribution keys follow the same rule");
/* ================================================================== */
{
  ck(
    "6.1 methodLabelKey: legacy takes the fallback key",
    methodLabelKey("issuer_confirmation", "CQrityjob") === "trust.legacy.unsupported" &&
      methodLabelKey("employer_confirmation", "CQrityjob") === "trust.legacy.unsupported",
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
    "6.5 verifierAttributionKey: legacy takes the fallback key",
    verifierAttributionKey("issuer_confirmation", "CQrityjob") === "trust.legacy.unsupported",
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
      "src/routes/p.$token.tsx",
      "src/components/security-passport/live/CredentialVerificationPage.tsx",
      "src/components/security-passport/live/VerificationPanel.tsx",
    ].every((p) => !/const METHOD_KEY/.test(code(p)) && /methodLabelKey\(/.test(code(p))),
  );
  ck(
    "6.10 the holder's rows pass the decider into the attribution key",
    /verifierAttributionKey\(claim\.verificationMethod, claim\.verifierName\)/.test(
      code("src/components/security-passport/ClaimRow.tsx"),
    ) &&
      /verifierAttributionKey\(latestApproval\.method, latestApproval\.organisation\)/.test(
        code("src/components/security-passport/live/VerificationPanel.tsx"),
      ),
  );
  ck(
    "6.11 the holder's 'confirmed by employer' block asks the same predicate",
    /employerGaveConfirmation\(latestApproval\)/.test(
      code("src/components/security-passport/live/VerificationPanel.tsx"),
    ),
  );
  ck(
    "6.12 the fallback differs between languages and names CQrityjob in both",
    LEGACY_SV !== LEGACY_EN && /CQrityjob/.test(LEGACY_SV) && /CQrityjob/.test(LEGACY_EN),
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
group("GROUP 7 — the recipient surfaces, rendered");
/* ================================================================== */
{
  const html = (n: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{n}</I18nProvider>);
  const payloadFor = (method: string, organisation: string) =>
    ({
      status: "active",
      package: "public_card",
      focus: "credential",
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
          title: "Fiktiv kurs",
          credential_code: null,
          issuer: "Fiktiv utfärdare",
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

  for (const method of ["issuer_confirmation", "employer_confirmation"]) {
    const presentation = buildRecipientPresentation(payloadFor(method, "CQrityjob"), "2026-09-05");
    const page = html(
      <CredentialVerificationPage
        credential={presentation.credentials[0]}
        holderLabel="Fiktiv Innehavare"
        jurisdiction="Sverige"
        verifyUrl="cqrityjob.example/p/abc"
      />,
    );
    ck(`7.1 [${method}] the credential page prints the neutral fallback`, page.includes(LEGACY_SV));
    ck(
      `7.2 [${method}] and no source-confirmation phrase`,
      !wearsForbidden(page) && !/Bekräftad av utfärdare|Bekräftad av arbetsgivare/.test(page),
    );
    const card = html(
      <RecipientPassportCard presentation={presentation} verifyUrl="cqrityjob.example/p/abc" />,
    );
    ck(
      `7.3 [${method}] the recipient card wears no source-confirmation phrase`,
      !wearsForbidden(card),
    );
  }

  const real = buildRecipientPresentation(
    payloadFor("employer_confirmation", "Bevakning AB"),
    "2026-09-05",
  );
  const realPage = html(
    <CredentialVerificationPage
      credential={real.credentials[0]}
      holderLabel="Fiktiv Innehavare"
      jurisdiction="Sverige"
      verifyUrl="cqrityjob.example/p/abc"
    />,
  );
  ck(
    "7.4 a real employer confirmation still says so on the credential page",
    realPage.includes(passportT("ver.method.employer_confirmation", "sv")) &&
      !realPage.includes(LEGACY_SV),
  );
  const reviewPage = html(
    <CredentialVerificationPage
      credential={
        buildRecipientPresentation(payloadFor("document_review", "CQrityjob"), "2026-09-05")
          .credentials[0]
      }
      holderLabel="Fiktiv Innehavare"
      jurisdiction="Sverige"
      verifyUrl="cqrityjob.example/p/abc"
    />,
  );
  ck(
    "7.5 a document review still says 'Dokumentgranskning'",
    reviewPage.includes(passportT("ver.method.document_review", "sv")) &&
      !reviewPage.includes(LEGACY_SV),
  );
}

console.log("");
if (fails.length) {
  console.error(`passport-trust-source-check: ${fails.length} assertion(s) failed:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("passport-trust-source-check: all assertions passed.");
