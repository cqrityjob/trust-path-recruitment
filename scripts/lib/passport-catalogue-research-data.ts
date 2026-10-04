/**
 * The reviewed decisions for the 2026-10-03 certification research snapshot.
 *
 * WHAT THIS FILE IS. The research package (docs/passport/research/
 * 2026-10-03-certification-catalogue/catalogue.json) is a set of RESEARCH
 * RECORDS. None of them is an approved catalogue definition. This module is
 * the reviewed, deliberate layer between the two: every exception to the
 * default disposition, every mapping of a research vocabulary onto a product
 * field, and every issuer the catalogue is asked to carry, is written here,
 * where a reviewer can read it, rather than inferred inside the importer.
 *
 * The default disposition of a research record that matches no existing
 * definition and appears in no table below is `added_approved`: a definition
 * created in the existing catalogue tables, INACTIVE. Publication is a
 * separate migration (docs/passport/closed-catalogue-governance.md). A record
 * is retained for review only with a specific unresolved issue and a named
 * action; nothing is silently approved and nothing is silently dropped.
 *
 * WHAT THIS FILE NEVER DOES
 *   * never turns `research_scope` or `jurisdiction_context` into a
 *     jurisdiction, a market pack or an access rule (they are kept verbatim
 *     as research metadata);
 *   * never treats an acronym as an identity: a match needs the issuer AND
 *     the exact award name;
 *   * never infers a renewal cycle, a lifetime validity or an equivalence.
 */

export type ResearchKind =
  | "person_certification"
  | "professional_qualification"
  | "designation"
  | "assessed_certificate"
  | "course_certificate";

/** The product's credential classes (sp_credential_classes), by research kind. */
export const CLASS_BY_KIND: Readonly<Record<ResearchKind, string>> = {
  person_certification: "certification",
  professional_qualification: "professional_qualification",
  designation: "professional_designation",
  assessed_certificate: "assessed_certificate",
  course_certificate: "course_certificate",
};

/**
 * What a definition "contributes to". Global scope forbids local_eligibility
 * and active_title structurally (sp_credential_type_global_scope_unbound), and
 * contributes_to is read only by the market-pack title rules in SQL, so this
 * is descriptive. A course or assessed certificate is not claimed as
 * professional competence.
 */
export const CONTRIBUTES_BY_KIND: Readonly<Record<ResearchKind, readonly string[]>> = {
  person_certification: ["professional_competence"],
  designation: ["professional_competence"],
  professional_qualification: ["education_completed"],
  assessed_certificate: ["education_completed"],
  course_certificate: ["education_completed"],
};

/** Label for the holder's reference number, by class. The reference stays optional. */
export const REFERENCE_LABEL_BY_KIND: Readonly<Record<ResearchKind, string>> = {
  person_certification: "Certification / member number",
  designation: "Certification / member number",
  professional_qualification: "Certificate / registration number",
  assessed_certificate: "Certificate number",
  course_certificate: "Certificate number",
};

/** The subject filter vocabulary (sp_credential_definition_reviews.professional_domain). */
export type ProfessionalDomain =
  | "security_operations"
  | "security_management"
  | "physical_security"
  | "information_security"
  | "investigation"
  | "financial_crime"
  | "insurance"
  | "risk_compliance"
  | "resilience_safety";

/** Research `domain` -> product subject, for the research areas that need a finer cut. */
const DOMAIN_OVERRIDE: Readonly<Record<string, ProfessionalDomain>> = {
  // physical area
  security_management: "security_management",
  security_training: "security_operations",
  physical_security: "physical_security",
  cultural_property_security: "physical_security",
  healthcare_security: "physical_security",
  loss_prevention: "physical_security",
  investigations: "investigation",
  cyber_investigations: "investigation",
  intelligence_analysis: "investigation",
  threat_assessment: "security_management",
  financial_crime: "financial_crime",
  // risk area
  aml: "financial_crime",
  sanctions: "financial_crime",
  customer_due_diligence: "financial_crime",
  fraud_investigation: "investigation",
};

export function professionalDomainFor(area: string, domain: string): ProfessionalDomain {
  switch (area) {
    case "cyber":
      return "information_security";
    case "insurance":
      return "insurance";
    case "resilience":
      return domain === "information_security" ? "information_security" : "resilience_safety";
    case "physical":
    case "risk":
      return (
        DOMAIN_OVERRIDE[domain] ?? (area === "physical" ? "physical_security" : "risk_compliance")
      );
    default:
      throw new Error(`unknown research area: ${area}`);
  }
}

/* ------------------------------------------------------------------ */
/* Issuers                                                              */
/* ------------------------------------------------------------------ */

export type IssuerPlan = {
  /** sp_certification_issuers.issuer_code. */
  code: string;
  /** True when the issuer already exists in the catalogue: it is reused, never re-created. */
  existing: boolean;
  /** The controlled display name (new issuers only). */
  displayName?: string;
  /** The issuer's own site (new issuers only): never a third-party badge host. */
  officialUrl?: string;
  /** Search aliases (the issuer's own acronym where the display name does not carry it). */
  aliases?: readonly string[];
  /**
   * The compact plate legend used when an award publishes no abbreviation of
   * its own: the ISSUER's acronym, never initials composed from a title.
   */
  mark: string;
};

/** Keyed by the research package's issuer name, verbatim. */
export const ISSUERS: Readonly<Record<string, IssuerPlan>> = {
  "ASIS International": { code: "ASIS", existing: true, mark: "ASIS" },
  ISC2: { code: "ISC2", existing: true, mark: "ISC2" },
  ISACA: { code: "ISACA", existing: true, mark: "ISACA" },
  ACAMS: { code: "ACAMS", existing: true, mark: "ACAMS" },
  "Association of Certified Fraud Examiners (ACFE)": { code: "ACFE", existing: true, mark: "ACFE" },

  CompTIA: {
    code: "COMPTIA",
    existing: false,
    displayName: "CompTIA",
    officialUrl: "https://www.comptia.org/",
    mark: "CompTIA",
  },
  "EC-Council": {
    code: "ECCOUNCIL",
    existing: false,
    displayName: "EC-Council",
    officialUrl: "https://www.eccouncil.org/",
    mark: "EC-Counc",
  },
  GIAC: {
    code: "GIAC",
    existing: false,
    displayName: "GIAC",
    officialUrl: "https://www.giac.org/",
    mark: "GIAC",
  },
  IAPP: {
    code: "IAPP",
    existing: false,
    displayName: "IAPP",
    officialUrl: "https://iapp.org/",
    mark: "IAPP",
  },
  OffSec: {
    code: "OFFSEC",
    existing: false,
    displayName: "OffSec",
    officialUrl: "https://www.offsec.com/",
    mark: "OffSec",
  },
  "Australian and New Zealand Institute of Insurance and Finance": {
    code: "ANZIIF",
    existing: false,
    displayName: "Australian and New Zealand Institute of Insurance and Finance (ANZIIF)",
    officialUrl: "https://anziif.com/",
    aliases: ["ANZIIF"],
    mark: "ANZIIF",
  },
  "Chartered Institute of Loss Adjusters": {
    code: "CILA",
    existing: false,
    displayName: "Chartered Institute of Loss Adjusters (CILA)",
    officialUrl: "https://cila.co.uk/",
    // The Institute's 2025 Charter Review adopts "Chartered Institute of Loss Adjusting",
    // subject to Privy Council ratification (CILA, indexed 2026-10-03). Searchable, not displayed.
    aliases: ["CILA", "Chartered Institute of Loss Adjusting"],
    mark: "CILA",
  },
  "Chartered Insurance Institute": {
    code: "CII",
    existing: false,
    displayName: "Chartered Insurance Institute (CII)",
    officialUrl: "https://www.cii.co.uk/",
    aliases: ["CII"],
    mark: "CII",
  },
  "Insurance Institute of Canada": {
    code: "IIC",
    existing: false,
    displayName: "Insurance Institute of Canada",
    officialUrl: "https://www.insuranceinstitute.ca/",
    mark: "IIC",
  },
  "The Institutes": {
    code: "INSTITUTES",
    existing: false,
    displayName: "The Institutes",
    officialUrl: "https://www.theinstitutes.org/",
    mark: "Institut",
  },
  "Association of Threat Assessment Professionals (ATAP)": {
    code: "ATAP",
    existing: false,
    displayName: "Association of Threat Assessment Professionals (ATAP)",
    officialUrl: "https://www.atapworldwide.org/",
    mark: "ATAP",
  },
  "International Association for Healthcare Security and Safety (IAHSS)": {
    code: "IAHSS",
    existing: false,
    displayName: "International Association for Healthcare Security and Safety (IAHSS)",
    officialUrl: "https://iahss.org/",
    mark: "IAHSS",
  },
  "International Association of Financial Crimes Investigators (IAFCI)": {
    code: "IAFCI",
    existing: false,
    displayName: "International Association of Financial Crimes Investigators (IAFCI)",
    officialUrl: "https://www.iafci.org/",
    mark: "IAFCI",
  },
  "International Association of Law Enforcement Intelligence Analysts (IALEIA)": {
    code: "IALEIA",
    existing: false,
    displayName: "International Association of Law Enforcement Intelligence Analysts (IALEIA)",
    officialUrl: "https://www.ialeia.org/",
    mark: "IALEIA",
  },
  "International Foundation for Cultural Property Protection (IFCPP)": {
    code: "IFCPP",
    existing: false,
    displayName: "International Foundation for Cultural Property Protection (IFCPP)",
    officialUrl: "https://ifcpp.org/",
    mark: "IFCPP",
  },
  "International Foundation for Protection Officers (IFPO)": {
    code: "IFPO",
    existing: false,
    displayName: "International Foundation for Protection Officers (IFPO)",
    officialUrl: "https://ifpo.org/",
    mark: "IFPO",
  },
  "International Security Management Institute (ISMI)": {
    code: "ISMI",
    existing: false,
    displayName: "International Security Management Institute (ISMI)",
    officialUrl: "https://www.ismi.org.uk/",
    mark: "ISMI",
  },
  "Loss Prevention Foundation": {
    code: "LPF",
    existing: false,
    displayName: "Loss Prevention Foundation",
    officialUrl: "https://www.yourlpf.org/",
    aliases: ["LPF"],
    mark: "LPF",
  },
  "Worshipful Company of Security Professionals / Chartered Security Professionals Registration Authority":
    {
      code: "WCOSP",
      existing: false,
      displayName:
        "Worshipful Company of Security Professionals / Chartered Security Professionals Registration Authority",
      officialUrl: "https://www.security-institute.org/",
      mark: "WCoSP",
    },
  "Board of Certified Safety Professionals": {
    code: "BCSP",
    existing: false,
    displayName: "Board of Certified Safety Professionals (BCSP)",
    officialUrl: "https://www.bcsp.org/",
    aliases: ["BCSP"],
    mark: "BCSP",
  },
  "Business Continuity Institute": {
    code: "BCI",
    existing: false,
    displayName: "Business Continuity Institute (BCI)",
    officialUrl: "https://www.thebci.org/",
    aliases: ["BCI"],
    mark: "BCI",
  },
  "DRI International": {
    code: "DRI",
    existing: false,
    displayName: "DRI International",
    officialUrl: "https://drii.org/",
    aliases: ["DRI"],
    mark: "DRI",
  },
  "Institution of Occupational Safety and Health": {
    code: "IOSH",
    existing: false,
    displayName: "Institution of Occupational Safety and Health (IOSH)",
    officialUrl: "https://iosh.com/",
    aliases: ["IOSH"],
    mark: "IOSH",
  },
  NEBOSH: {
    code: "NEBOSH",
    existing: false,
    displayName: "NEBOSH",
    officialUrl: "https://www.nebosh.org.uk/",
    mark: "NEBOSH",
  },
  "National Fire Protection Association": {
    code: "NFPA",
    existing: false,
    displayName: "National Fire Protection Association (NFPA)",
    officialUrl: "https://www.nfpa.org/",
    aliases: ["NFPA"],
    mark: "NFPA",
  },
  PECB: {
    code: "PECB",
    existing: false,
    displayName: "PECB",
    officialUrl: "https://pecb.com/",
    mark: "PECB",
  },
  "Global Association of Risk Professionals (GARP)": {
    code: "GARP",
    existing: false,
    displayName: "Global Association of Risk Professionals (GARP)",
    officialUrl: "https://www.garp.org/",
    mark: "GARP",
  },
  "Institute of Risk Management (IRM)": {
    code: "IRM",
    existing: false,
    displayName: "Institute of Risk Management (IRM)",
    officialUrl: "https://www.theirm.org/",
    mark: "IRM",
  },
  "International Compliance Association (ICA)": {
    code: "ICA",
    existing: false,
    displayName: "International Compliance Association (ICA)",
    officialUrl: "https://www.int-comp.org/",
    mark: "ICA",
  },
  "Professional Risk Managers' International Association (PRMIA)": {
    code: "PRMIA",
    existing: false,
    displayName: "Professional Risk Managers' International Association (PRMIA)",
    officialUrl: "https://www.prmia.org/",
    mark: "PRMIA",
  },
  "Project Management Institute": {
    code: "PMI",
    existing: false,
    displayName: "Project Management Institute (PMI)",
    officialUrl: "https://www.pmi.org/",
    aliases: ["PMI"],
    mark: "PMI",
  },
  RIMS: {
    code: "RIMS",
    existing: false,
    displayName: "RIMS",
    officialUrl: "https://www.rims.org/",
    mark: "RIMS",
  },
  "Risk & Insurance Education Alliance": {
    code: "RIEA",
    existing: false,
    displayName: "Risk & Insurance Education Alliance",
    officialUrl: "https://www.riskeducation.org/",
    aliases: ["RIEA"],
    mark: "RIEA",
  },
  "The Institute of Internal Auditors (IIA)": {
    code: "IIA",
    existing: false,
    displayName: "The Institute of Internal Auditors (IIA)",
    officialUrl: "https://www.theiia.org/",
    mark: "IIA",
  },
  "The Open Group": {
    code: "OPENGROUP",
    existing: false,
    displayName: "The Open Group",
    officialUrl: "https://www.opengroup.org/",
    mark: "OpenGrp",
  },
};

/* ------------------------------------------------------------------ */
/* Existing definitions: the reconciliation targets                     */
/* ------------------------------------------------------------------ */

/**
 * The definitions that already exist (20261111090000), mirrored here so the
 * matcher is a pure function. supabase/tests/security_passport_catalogue_
 * research_import_test.sql asserts that these rows are exactly what the
 * database holds, so a drift between this mirror and the catalogue fails CI.
 */
export const EXISTING_DEFINITIONS: ReadonlyArray<{
  code: string;
  issuerCode: string;
  nameEn: string;
  abbreviation: string;
}> = [
  {
    code: "INTL_ACAMS_CAMS",
    issuerCode: "ACAMS",
    nameEn: "Certified Anti-Money Laundering Specialist (CAMS)",
    abbreviation: "CAMS",
  },
  {
    code: "INTL_ACFE_CFE",
    issuerCode: "ACFE",
    nameEn: "Certified Fraud Examiner (CFE)",
    abbreviation: "CFE",
  },
  {
    code: "INTL_ASIS_APP",
    issuerCode: "ASIS",
    nameEn: "Associate Protection Professional (APP)",
    abbreviation: "APP",
  },
  {
    code: "INTL_ASIS_CPP",
    issuerCode: "ASIS",
    nameEn: "Certified Protection Professional (CPP)",
    abbreviation: "CPP",
  },
  {
    code: "INTL_ASIS_PCI",
    issuerCode: "ASIS",
    nameEn: "Professional Certified Investigator (PCI)",
    abbreviation: "PCI",
  },
  {
    code: "INTL_ASIS_PSP",
    issuerCode: "ASIS",
    nameEn: "Physical Security Professional (PSP)",
    abbreviation: "PSP",
  },
  {
    code: "INTL_ISACA_CISA",
    issuerCode: "ISACA",
    nameEn: "Certified Information Systems Auditor (CISA)",
    abbreviation: "CISA",
  },
  {
    code: "INTL_ISACA_CISM",
    issuerCode: "ISACA",
    nameEn: "Certified Information Security Manager (CISM)",
    abbreviation: "CISM",
  },
  {
    code: "INTL_ISACA_CRISC",
    issuerCode: "ISACA",
    nameEn: "Certified in Risk and Information Systems Control (CRISC)",
    abbreviation: "CRISC",
  },
  {
    code: "INTL_ISC2_CC",
    issuerCode: "ISC2",
    nameEn: "Certified in Cybersecurity (CC)",
    abbreviation: "CC",
  },
  {
    code: "INTL_ISC2_CCSP",
    issuerCode: "ISC2",
    nameEn: "Certified Cloud Security Professional (CCSP)",
    abbreviation: "CCSP",
  },
  {
    code: "INTL_ISC2_CGRC",
    issuerCode: "ISC2",
    nameEn: "Certified in Governance, Risk and Compliance (CGRC)",
    abbreviation: "CGRC",
  },
  {
    code: "INTL_ISC2_CISSP",
    issuerCode: "ISC2",
    nameEn: "Certified Information Systems Security Professional (CISSP)",
    abbreviation: "CISSP",
  },
  {
    code: "INTL_ISC2_SSCP",
    issuerCode: "ISC2",
    nameEn: "Systems Security Certified Practitioner (SSCP)",
    abbreviation: "SSCP",
  },
];

/* ------------------------------------------------------------------ */
/* Definition naming                                                    */
/* ------------------------------------------------------------------ */

/**
 * Short, stable code suffixes for awards that publish no abbreviation of
 * their own. Keyed by the research id's first 6 hex digits after `cred_`.
 * A code is an identity, not a label: it is never shown to a holder.
 */
export const CODE_SLUG_NO_ACRONYM: Readonly<Record<string, string>> = {
  "9b6fa5": "ADV_DIPLOMA_INSURANCE",
  b4a37e: "AWARD_GENERAL_INSURANCE_NON_UK",
  cc4190: "CERT_INSURANCE",
  "1edb82": "DIPLOMA_INSURANCE",
  "49b4d5": "EXEC_CERT_INSURANCE",
  "9ef067": "FOUND_CERT_INSURANCE",
  "53a61a": "AQF_DIP_GENERAL_INSURANCE",
  "79e702": "AQF_DIP_INSURANCE_BROKING",
  d4da35: "AQF_DIP_LOSS_ADJUSTING",
  "893ee3": "CERTIFICATE",
  "721a6a": "DIPLOMA",
  a1c73f: "ISO22301_LEAD_AUDITOR",
  e9b23c: "ISO22301_LEAD_IMPLEMENTER",
  "9cc13a": "ISO31000_LEAD_RISK_MANAGER",
  "425cf5": "ISO27001_LEAD_AUDITOR",
  "246a15": "ISO27001_LEAD_IMPLEMENTER",
  b12db7: "L3_CERT_OSH",
  b5a6c7: "L6_DIP_OSH",
  "6fe921": "MANAGING_SAFELY",
  "34256b": "CERT_FIRE_SAFETY",
  "4a461b": "HSM_CONSTRUCTION_INTL",
  ecf2ef: "INTL_CERT_TERRORISM_PROTECTION",
  "2eed38": "L6_INTL_DIP_OHS_MANAGEMENT",
  "8efc7a": "HSE_CERT_PROCESS_SAFETY",
  "22fb2a": "IIRSM_CERT_MANAGING_RISK",
  c36b3b: "CYBER_RISK_MANAGEMENT",
  d670cf: "OPEN_FAIR_2_FOUNDATION",
  // Retained records never receive a definition; listed so the slug table is total.
  b3cbbb: "CSMP",
  "12490b": "LPC",
  "63a628": "LPQ",
};

/**
 * Where the research `acronym` is not an abbreviation of the award, so it must
 * not be stored as one. W01 is a CII UNIT code ("W01 identifies the associated
 * unit", research evidence note). It stays searchable as an alias.
 */
export const ACRONYM_IS_NOT_AN_ABBREVIATION: ReadonlySet<string> = new Set(["b4a37e"]);

/** Definition aliases that are SUPPORTED by the research text itself. */
export const DEFINITION_ALIASES: Readonly<
  Record<string, ReadonlyArray<{ alias: string; kind: "historical_name" | "search_alias" }>>
> = {
  // Research limitation: "Current issuer label is SMP; older SMS names require alias/version review."
  c1fcf6: [{ alias: "SMS", kind: "historical_name" }],
  // The CII unit code the research ties to this award.
  b4a37e: [{ alias: "W01", kind: "search_alias" }],
};

/* ------------------------------------------------------------------ */
/* Retained for review                                                  */
/* ------------------------------------------------------------------ */

export type HolderReason =
  | "awaiting_source_check"
  | "awaiting_name_check"
  | "awaiting_issuer_check"
  | "awaiting_kind_check"
  | "retired_for_new_candidates"
  | "not_offered";

export type Retained = {
  holderReason: HolderReason;
  unresolvedIssue: string;
  requiredAction: string;
  /** What the 2026-10-03 recheck established, and what it could not. */
  recheckNote?: string;
};

const EGRESS =
  "Direct fetch of the issuer site from the review environment was refused by its network egress policy (EGRESS_BLOCKED), so the official page could not be opened.";
const SEARCH_NOT_EVIDENCE =
  "A web-search index restricted to the issuer's own domain was consulted instead; that is the same class of evidence as the original excerpt (provisional) and is not accepted as the stronger evidence the research package requires before approval.";

function sourceCheck(url: string, what: string, index: string): Retained {
  return {
    holderReason: "awaiting_source_check",
    unresolvedIssue:
      "The programme page was never opened: the research recorded index evidence only (page refused direct access), and the 2026-10-03 recheck could not open it either.",
    requiredAction: `From a network that can reach the issuer, open ${url} and confirm ${what}; then publish through a reviewed catalogue migration (set the record to approved in scripts/lib/passport-catalogue-research-data.ts and regenerate).`,
    recheckNote: `${EGRESS} ${SEARCH_NOT_EVIDENCE} Index result (2026-10-03): ${index}`,
  };
}

/** Keyed by the research id's first 6 hex digits after `cred_`. */
export const RETAINED: Readonly<Record<string, Retained>> = {
  "2ca9c5": sourceCheck(
    "https://www.acams.org/en/certifications/cafs-certification",
    "the exact title, the awarding body and the maintenance route",
    "official acams.org pages for the CAFS certification, its candidate handbook and the specialist recertification route were listed; the summary describes five courses plus a proctored exam, an active ACAMS membership, 40 eligibility credits, and recertification every three years with 30 credits.",
  ),
  "059626": sourceCheck(
    "https://www.acams.org/en/certifications/certified-cryptoasset-anti-financial-crime-specialist-certification-ccas",
    "the exact title (the issuer page says 'Certified Cryptoasset AFC Specialist'), the awarding body and the maintenance route",
    "official acams.org pages for the CCAS certification and its candidate handbook were listed; the summary describes four certificate courses, an active membership, 40 eligibility credits and a 175-minute exam. No maintenance rule was shown.",
  ),
  d824dc: sourceCheck(
    "https://www.acams.org/en/certifications/certified-global-sanctions-specialist-cgss",
    "the exact title, the awarding body and the maintenance route",
    "official acams.org pages for the CGSS certification, its candidate handbook and the specialist recertification route were listed; the summary describes recertification every three years with 30 credits (15 from ACAMS) and an active membership.",
  ),
  "784999": sourceCheck(
    "https://www.int-comp.org/courses/ica-advanced-certificate-in-managing-sanctions-risk/",
    "the exact title, level, the awarding body and any former title",
    "official int-comp.org pages for the Advanced Certificate in Managing Sanctions Risk (course page and qualification page) were listed; no further detail was shown.",
  ),
  "0b76ac": {
    ...sourceCheck(
      "https://www.int-comp.org/courses/ica-diploma-in-managing-sanctions-risk/",
      "the exact title, that the award is ICA's (the index summary says 'awarded in association with Alliance Manchester Business School, the University of Manchester') and any former 'International Diploma' title",
      "the official int-comp.org course page was listed: Level 6, designation (Dip.Sanctions), nine months, awarded in association with Alliance Manchester Business School, the University of Manchester.",
    ),
    holderReason: "awaiting_issuer_check",
    unresolvedIssue:
      "The programme page was never opened, and the index summary says the diploma is awarded in association with a university, so the awarding organisation (ICA alone, or jointly) is not established.",
  },
  "9c7b04": sourceCheck(
    "https://www.nfpa.org/en/for-professionals/certification/cwbsp",
    "the exact title and the awarding body (NFPA)",
    "an official nfpa.org CWBSP programme overview (2025) and learning-path pages were listed; the summary describes recertification every three years with 60 points.",
  ),
  d7909b: sourceCheck(
    "https://www.theiia.org/en/certifications/crma/",
    "the exact title, the awarding body and the maintenance route",
    "official theiia.org pages for the CRMA and the certification candidate handbook were listed; the summary describes a 150-minute, 120-question exam and experience-based eligibility. No maintenance rule was shown.",
  ),
  "12e054": sourceCheck(
    "https://www.theiia.org/en/certifications/cia/",
    "the exact title, the awarding body and the maintenance route",
    "official theiia.org pages for the CIA, the CPE requirements and the annual renewal policy were listed; the summary describes 40 CPE hours annually (2 in ethics), renewal by 31 December, a two-year grace period and revocation after three unreported years.",
  ),
  "6bc06a": {
    ...sourceCheck(
      "https://www.theiia.org/en/certifications/iap/",
      "the exact title, whether the issuer presents the IAP as a certification or a designation (its page is titled 'Internal Audit Practitioner (IAP) designation'), and the maintenance route",
      "the official theiia.org IAP page and guidebook were listed; the page is titled 'Internal Audit Practitioner (IAP) designation'; the summary describes 20 CPE hours a year and an annual renewal beginning in 2026.",
    ),
    holderReason: "awaiting_kind_check",
    unresolvedIssue:
      "The programme page was never opened, and the issuer's own page title calls the IAP a 'designation' while the research classes it as a personal certification: the credential kind is not settled.",
  },
  "12490b": sourceCheck(
    "https://www.yourlpf.org/page/certification_costs/Certification-Types-and-Costs.htm",
    "the exact title, the awarding body, the renewal rule and whether holders outside the United States can hold it",
    "official yourlpf.org pages for LPC (LPCertified) were listed; the summary describes 20 CEUs a year and an annual fee, and that LPF's credentials are 'internationally sanctioned'. Research priority is P3 (defer).",
  ),
  "63a628": sourceCheck(
    "https://www.yourlpf.org/page/LPQ_about",
    "the exact title, the awarding body, the renewal rule (the index summary says LPQ does not expire once earned) and international availability",
    "official yourlpf.org pages for LPQ (LPQualified) were listed; the summary says it does not expire once earned and that international applicants must take the LPQ prep course. Research priority is P3 (defer).",
  ),
  b60201: {
    holderReason: "retired_for_new_candidates",
    unresolvedIssue:
      "The issuer's 2025 Charter Review (indexed on cila.co.uk, 2026-10-03) says the Advanced Diploma is being retired for new candidates and the Institute is renaming itself. A retired award cannot be offered as a new registration, but existing holders may still hold it.",
    requiredAction:
      "Owner decision: either leave the Advanced Diploma out of the catalogue, or publish it as a historical definition for existing holders (this needs a retired-award registration rule the catalogue does not have today). Confirm the retirement date and the successor naming on https://cila.co.uk/qualifications/advanced-diploma/ and https://cila.co.uk/about-us/the-charter/.",
    recheckNote: `${EGRESS} Index result (2026-10-03): cila.co.uk's Advanced Diploma page lists AD1 and AD2 exams for members who hold the CILA Diploma; cila.co.uk's 'Announcing Charter changes' page and the 2025 Charter Review say the Advanced Diploma is retired for new candidates and the Institute becomes 'The Chartered Institute of Loss Adjusting' subject to Privy Council ratification. Search-index text, not a direct read.`,
  },
  b3cbbb: {
    holderReason: "awaiting_issuer_check",
    unresolvedIssue:
      "The awarding organisation and the regulated award identifier are not established: the research says the qualification belongs to a UK qualification framework and that ISMI's delivery must be kept apart from the awarding organisation.",
    requiredAction:
      "Identify the awarding organisation and award identifier for the CSMP from https://www.ismi.org.uk/ and the UK qualification register, then add the record with that issuer through a reviewed catalogue migration.",
  },
  "351604": {
    holderReason: "awaiting_issuer_check",
    unresolvedIssue:
      "The research names two organisations as one issuer (the Worshipful Company of Security Professionals and the Chartered Security Professionals Registration Authority) and says the Security Institute administers the register: the single awarding organisation and the verification route are not established. The designation is also register-dependent (annual CPD and fee).",
    requiredAction:
      "Decide which organisation is the awarding issuer and which register verifies it, then publish through a reviewed catalogue migration. Do not store the register as a lifetime award.",
  },
  af3bde: {
    holderReason: "awaiting_kind_check",
    unresolvedIssue:
      "Research priority P3 (defer), and the record describes an online certification programme for visitor-facing frontline staff: it is not established whether the award is an assessed certification or a course-completion certificate.",
    requiredAction:
      "Confirm on https://ifcpp.org/cvrs whether the award is assessed, then choose the credential kind (personal certification or course certificate) and publish through a reviewed catalogue migration.",
  },
  fbb122: {
    holderReason: "awaiting_name_check",
    unresolvedIssue:
      "The research says the award's name differs across issuer pages ('Enterprise and Operational Risk' versus 'Operational Risk') and instructs that aliases be resolved before approval.",
    requiredAction:
      "Confirm the exact award title and the former or alternative title on prmia.org, record the other as an alias, then publish through a reviewed catalogue migration.",
  },
};

/** Records excluded from the catalogue, with the reason shown to administrators. Empty by design: see RECONCILIATION.md. */
export const EXCLUDED: Readonly<Record<string, { reason: string }>> = {};

/** The reviewer string stored on every imported disposition. */
export const REVIEWER =
  "Claude Code (owner-instructed catalogue reconciliation, 2026-10-03); effective only when the owner merges the import pull request";

export const SNAPSHOT_DATE = "2026-10-03";
export const REVIEWED_AT = "2026-10-03T00:00:00Z";
