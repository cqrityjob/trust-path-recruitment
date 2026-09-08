import type { Certification, CertificationId } from "./types";

// Personal credentials and published standards — and the difference between
// them, which this catalogue used to lose.
//
// ── WHAT WAS WRONG ─────────────────────────────────────────────────────
//
// ISO 31000, ISO 22301 and ISO/IEC 27001 were carried here as certifications
// with `issuer: "ISO"` and rendered beside CPP and CAMS under a heading
// reading "Certifikat". Every part of that is false:
//
//   * ISO does not certify anybody. It develops and publishes standards;
//     conformity assessment is carried out by independent certification
//     bodies, and ISO says so itself.
//   * ISO 31000 is guidance and is not intended for certification purposes.
//     There is no such thing as "being ISO 31000 certified".
//   * ISO 22301 and ISO/IEC 27001 certify an ORGANISATION's management
//     system. Neither is automatically a credential a person holds, and
//     neither is something a reader can go and obtain for themselves.
//
// A career guide that tells somebody to acquire a credential that does not
// exist, from a body that does not award it, is worse than saying nothing.
//
// `credentialType` now carries the distinction, and the surface renders the
// two under different headings with different wording. The ISO records keep
// their place — knowing ISO 31000 is genuinely relevant to a risk role — but
// as KNOWLEDGE AREAS, with the issuer described as the publisher of the
// standard rather than as the awarder of a certificate.

export const certifications: readonly Certification[] = [
  {
    id: "asis-cpp",
    credentialType: "personal_credential",
    status: "researched",
    lastVerified: "2026-07-16",
    shortName: "CPP",
    fullName: {
      sv: "Certified Protection Professional (CPP)",
      en: "Certified Protection Professional (CPP)",
    },
    issuer: { sv: "ASIS International", en: "ASIS International" },
    scope: ["INTL"],
    careerLevel: "senior",
    experienceRequirement: {
      sv: "Flera års relevant erfarenhet inom säkerhetshantering – exakta krav publiceras av utgivaren.",
      en: "Several years of relevant experience in security management – exact requirements published by the issuer.",
    },
    validity: {
      sv: "Certifikatet upprätthålls via kontinuerlig kompetensutveckling enligt utgivarens regler.",
      en: "Maintained through continuing professional education per issuer rules.",
    },
    relatedProfessions: ["security-manager", "security-consultant"],
    officialSource: {
      label: { sv: "ASIS CPP", en: "ASIS CPP" },
      publisher: "ASIS International",
      url: "https://www.asisonline.org/certification/certified-protection-professional-cpp/",
    },
  },
  {
    id: "asis-psp",
    credentialType: "personal_credential",
    status: "researched",
    lastVerified: "2026-07-16",
    shortName: "PSP",
    fullName: {
      sv: "Physical Security Professional (PSP)",
      en: "Physical Security Professional (PSP)",
    },
    issuer: { sv: "ASIS International", en: "ASIS International" },
    scope: ["INTL"],
    careerLevel: "mid",
    relatedProfessions: ["security-technician", "data-center-security"],
    officialSource: {
      label: { sv: "ASIS PSP", en: "ASIS PSP" },
      publisher: "ASIS International",
      url: "https://www.asisonline.org/certification/physical-security-professional/",
    },
  },
  {
    id: "acams-cams",
    credentialType: "personal_credential",
    status: "researched",
    lastVerified: "2026-07-16",
    shortName: "CAMS",
    fullName: {
      sv: "Certified Anti-Money Laundering Specialist (CAMS)",
      en: "Certified Anti-Money Laundering Specialist (CAMS)",
    },
    issuer: { sv: "ACAMS", en: "ACAMS" },
    scope: ["INTL"],
    careerLevel: "mid",
    relatedProfessions: ["aml-specialist", "fraud-investigator"],
    officialSource: {
      label: { sv: "ACAMS CAMS", en: "ACAMS CAMS" },
      publisher: "ACAMS",
      url: "https://www.acams.org/en/about-certifications",
    },
  },
  {
    id: "iso-22301",
    credentialType: "standard",
    status: "researched",
    lastVerified: "2026-07-16",
    fullName: {
      sv: "ISO 22301 – Ledningssystem för kontinuitetshantering",
      en: "ISO 22301 – Business Continuity Management Systems",
    },
    issuer: {
      sv: "Standard utgiven av ISO. ISO utfärdar inga certifikat — certifiering av ledningssystem görs av oberoende certifieringsorgan och avser organisationen, inte en person.",
      en: "Standard published by ISO. ISO issues no certificates — management-system certification is carried out by independent certification bodies and applies to the organisation, not to a person.",
    },
    scope: ["INTL"],
    careerLevel: "senior",
    relatedProfessions: ["crisis-continuity-manager", "security-manager", "security-coordinator"],
    officialSource: {
      label: { sv: "ISO 22301:2019", en: "ISO 22301:2019" },
      publisher: "International Organization for Standardization",
      url: "https://www.iso.org/standard/75106.html",
    },
  },
  {
    id: "iso-31000",
    credentialType: "standard",
    status: "researched",
    lastVerified: "2026-07-16",
    fullName: { sv: "ISO 31000 – Riskhantering", en: "ISO 31000 – Risk Management" },
    issuer: {
      sv: "Standard utgiven av ISO. ISO 31000 är vägledning och är inte avsedd för certifiering — det finns ingen ISO 31000-certifiering, varken för en person eller för en organisation.",
      en: "Standard published by ISO. ISO 31000 is guidance and is not intended for certification purposes — there is no ISO 31000 certification, for a person or for an organisation.",
    },
    scope: ["INTL"],
    careerLevel: "senior",
    relatedProfessions: ["risk-manager", "security-manager", "security-coordinator"],
    officialSource: {
      label: {
        sv: "ISO 31000:2018 — standardens egen sida",
        en: "ISO 31000:2018 — the standard's own page",
      },
      publisher: "International Organization for Standardization",
      url: "https://www.iso.org/standard/65694.html",
    },
  },
  {
    id: "iso-27001",
    credentialType: "standard",
    status: "researched",
    lastVerified: "2026-07-16",
    fullName: {
      sv: "ISO/IEC 27001 – Informationssäkerhet",
      en: "ISO/IEC 27001 – Information Security Management",
    },
    issuer: {
      sv: "Standard utgiven av ISO/IEC. Certifiering mot standarden görs av oberoende certifieringsorgan och avser en organisations ledningssystem, inte en enskild person.",
      en: "Standard published by ISO/IEC. Certification against it is carried out by independent certification bodies and applies to an organisation's management system, not to an individual.",
    },
    scope: ["INTL"],
    careerLevel: "senior",
    relatedProfessions: ["data-center-security", "soc-analyst", "security-manager"],
    officialSource: {
      label: { sv: "ISO/IEC 27001:2022", en: "ISO/IEC 27001:2022" },
      publisher: "International Organization for Standardization",
      url: "https://www.iso.org/standard/27001",
    },
  },
  {
    id: "se-sbsc",
    credentialType: "personal_credential",
    status: "researched",
    lastVerified: "2026-07-16",
    fullName: { sv: "SBSC-certifiering (bransch)", en: "SBSC industry certification (Sweden)" },
    issuer: {
      sv: "Svensk Brand- och Säkerhetscertifiering (SBSC)",
      en: "Svensk Brand- och Säkerhetscertifiering (SBSC)",
    },
    scope: ["SE"],
    careerLevel: "mid",
    relatedProfessions: ["security-technician"],
    officialSource: {
      label: { sv: "SBSC", en: "SBSC" },
      publisher: "SBSC",
      url: "https://sbsc.se/",
    },
  },
  {
    id: "crisc",
    credentialType: "personal_credential",
    status: "placeholder",
    shortName: "CRISC",
    fullName: {
      sv: "Certified in Risk and Information Systems Control (CRISC)",
      en: "Certified in Risk and Information Systems Control (CRISC)",
    },
    issuer: { sv: "ISACA", en: "ISACA" },
    scope: ["INTL"],
    careerLevel: "senior",
    relatedProfessions: ["risk-manager", "soc-analyst"],
  },
  {
    id: "cissp",
    credentialType: "personal_credential",
    status: "placeholder",
    shortName: "CISSP",
    fullName: {
      sv: "Certified Information Systems Security Professional",
      en: "Certified Information Systems Security Professional",
    },
    issuer: { sv: "(ISC)²", en: "(ISC)²" },
    scope: ["INTL"],
    careerLevel: "senior",
    relatedProfessions: ["soc-analyst", "security-manager"],
  },
  {
    id: "cfe",
    credentialType: "personal_credential",
    status: "placeholder",
    shortName: "CFE",
    fullName: { sv: "Certified Fraud Examiner (CFE)", en: "Certified Fraud Examiner (CFE)" },
    issuer: { sv: "ACFE", en: "ACFE" },
    scope: ["INTL"],
    careerLevel: "mid",
    relatedProfessions: ["fraud-investigator", "security-investigator"],
  },
];

export function getCertification(id: CertificationId) {
  return certifications.find((c) => c.id === id);
}
