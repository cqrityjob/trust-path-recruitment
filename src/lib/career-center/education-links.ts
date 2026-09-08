// What a specific education or standard has to do with a specific profession.
//
// ── WHY THIS IS A TABLE AND NOT AN INFERENCE ───────────────────────────
//
// The first version of the education surface DERIVED "formal requirement"
// from three facts that happened to be true together:
//
//   the destination profession is `regulated`
//   ...and states at least one formal requirement
//   ...and the education's `scope` overlaps the profession's `countries`
//
// None of those is the same statement as "this course is what that
// requirement means". The inference produces a legal claim — *you must have
// completed this in order to work in this role* — out of three pieces of
// metadata, none of which is about the relationship between the two records.
// It is right for Väktarutbildning and Ordningsvaktsutbildning by luck, and
// it would be wrong the first time a regulated profession gained an optional
// pathway, or a course that supports one of several requirements, or a course
// that is required only for one class of holder.
//
// A legal claim needs an author. So the relationship is authored, one row per
// (profession, offer) pair, and each row states four things the inference
// could never produce:
//
//   relevance   formal requirement, or recommended development
//   supports    WHICH requirement it satisfies — required for a formal one,
//               because "this is a formal requirement" without saying a
//               requirement FOR WHAT is not a checkable claim
//   countries   the jurisdiction that statement is made in
//   authority   the source that says so, plus the date it was read
//
// ── AND WHAT NO ROW MAY EVER IMPLY ─────────────────────────────────────
//
// That completing something guarantees suitability, approval, appointment or
// eligibility. Every regulated role in this catalogue also requires a
// suitability assessment and a decision by an authority; a course is one
// input to that decision and never the decision itself. `supports` is written
// to say which part of the requirement is met, and the surface prints the
// remainder as still outstanding.

import type { Bi, CertificationId, EducationId, ProfessionId, Region, SourceRef } from "./types";

export type EducationRelevance = "formal_requirement" | "recommended_development";

export type OfferKind = "education" | "certification";

export interface ProfessionEducationLink {
  readonly professionId: ProfessionId;
  readonly offerId: EducationId | CertificationId;
  readonly kind: OfferKind;
  readonly relevance: EducationRelevance;
  /**
   * Exactly which part of the profession's formal requirement this satisfies,
   * and what it does not.
   *
   * Mandatory for `formal_requirement`: a row that says "this is required"
   * without saying required *for what* cannot be checked by a reader, and
   * cannot be reviewed by anybody either.
   */
  readonly supports: Bi;
  readonly countries: readonly Region[];
  /** The authority or instrument that establishes the statement above. */
  readonly authority?: SourceRef;
  /** ISO date the authority was last read. */
  readonly lastVerified: string;
}

export const PROFESSION_EDUCATION_LINKS: readonly ProfessionEducationLink[] = [
  // ── VÄKTARE ────────────────────────────────────────────────────────────
  {
    professionId: "security-officer",
    offerId: "se-vaktarutbildning",
    kind: "education",
    relevance: "formal_requirement",
    supports: {
      sv: "Uppfyller utbildningskravet för att få arbeta som väktare hos ett auktoriserat bevakningsföretag. Utbildningen ensam ger ingen behörighet: företaget måste vara auktoriserat och du måste vara godkänd i Polismyndighetens lämplighetsprövning.",
      en: "Satisfies the training requirement for working as a security officer at an authorised guarding company. The training alone confers no authorisation: the company must hold authorisation and you must pass the Police Authority's suitability review.",
    },
    countries: ["SE"],
    authority: {
      label: {
        sv: "Lag (1974:191) om bevakningsföretag",
        en: "Swedish Guarding Companies Act (1974:191)",
      },
      publisher: "Sveriges riksdag",
      url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-1974191-om-bevakningsforetag_sfs-1974-191/",
    },
    lastVerified: "2026-09-08",
  },

  // ── ORDNINGSVAKT ───────────────────────────────────────────────────────
  //
  // The training is one of THREE conditions in 9 § of the 2023 Act, and the
  // row says so rather than letting a reader infer that finishing the course
  // is the whole of it.
  {
    professionId: "ordningsvakt",
    offerId: "se-ordningsvaktsutbildning",
    kind: "education",
    relevance: "formal_requirement",
    supports: {
      sv: "Uppfyller kravet på föreskriven utbildning i 9 § lagen (2023:421) om ordningsvakter. Det är ett av tre villkor: du måste dessutom ha fyllt 20 år och bedömas lämplig, och det är Polismyndigheten som beslutar om förordnande. Genomförd utbildning ger i sig inget förordnande.",
      en: "Satisfies the prescribed-training condition in section 9 of the Public Order Officers Act (2023:421). It is one of three conditions: you must also be at least 20 years old and be assessed as suitable, and the Police Authority decides on the appointment. Completing the training confers no appointment by itself.",
    },
    countries: ["SE"],
    authority: {
      label: {
        sv: "Lag (2023:421) om ordningsvakter, 9 §",
        en: "Public Order Officers Act (2023:421), section 9",
      },
      publisher: "Sveriges riksdag",
      url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2023421-om-ordningsvakter_sfs-2023-421/",
    },
    lastVerified: "2026-09-08",
  },

  // ── SKYDDSVAKT ─────────────────────────────────────────────────────────
  //
  // Three separate things that the previous copy ran together: the prescribed
  // training (Police or Armed Forces regulations), the approval (a county
  // administrative board, or the Armed Forces for its own personnel), and the
  // assignment at a designated protected object.
  {
    professionId: "skyddsvakt",
    offerId: "se-skyddsvaktsutbildning",
    kind: "education",
    relevance: "formal_requirement",
    supports: {
      sv: "Uppfyller kravet på föreskriven utbildning enligt Polismyndighetens föreskrifter (15 § skyddsförordningen), eller Försvarsmaktens för dess egen personal (14 §). Utbildningen är inte detsamma som godkännandet: den som utses till skyddsvakt ska godkännas av länsstyrelsen i sitt bosättningslän, och uppdraget vid ett skyddsobjekt är ett tredje, separat beslut.",
      en: "Satisfies the prescribed-training requirement under the Police Authority's regulations (section 15 of the Protective Security Ordinance), or the Armed Forces' regulations for its own personnel (section 14). The training is not the approval: a person appointed as a protective security guard must be approved by the county administrative board where they live, and the assignment at a designated protected object is a third, separate decision.",
    },
    countries: ["SE"],
    authority: {
      label: {
        sv: "Skyddsförordning (2010:523), 6, 14 och 15 §§",
        en: "Swedish Protective Security Ordinance (2010:523), sections 6, 14 and 15",
      },
      publisher: "Sveriges riksdag",
      url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skyddsforordning-2010523_sfs-2010-523/",
    },
    lastVerified: "2026-09-08",
  },

  // ── RECOMMENDED DEVELOPMENT ────────────────────────────────────────────
  //
  // Nothing below is required by anybody. Each row says what the thing is
  // good for and, for the ISO standards, what it is NOT: none of the three is
  // a credential a person can hold.
  {
    professionId: "security-manager",
    offerId: "asis-cpp",
    kind: "certification",
    relevance: "recommended_development",
    supports: {
      sv: "En frivillig yrkescertifiering för erfarna säkerhetsansvariga, utfärdad av ASIS International. Den krävs inte av något svenskt regelverk för att arbeta som säkerhetschef.",
      en: "A voluntary professional credential for experienced security leaders, awarded by ASIS International. No Swedish regulation requires it in order to work as a security manager.",
    },
    countries: ["INTL"],
    lastVerified: "2026-09-08",
  },
  {
    professionId: "security-manager",
    offerId: "iso-31000",
    kind: "certification",
    relevance: "recommended_development",
    supports: {
      sv: "Kunskapsområde. ISO 31000 är vägledning för riskhantering och är inte avsedd för certifiering — det finns ingen ISO 31000-certifiering att skaffa, varken för dig eller för en organisation.",
      en: "A knowledge area. ISO 31000 is guidance on risk management and is not intended for certification purposes — there is no ISO 31000 certification to obtain, for you or for an organisation.",
    },
    countries: ["INTL"],
    lastVerified: "2026-09-08",
  },
  {
    professionId: "security-manager",
    offerId: "iso-22301",
    kind: "certification",
    relevance: "recommended_development",
    supports: {
      sv: "Kunskapsområde. ISO 22301 är en standard för organisationers ledningssystem för kontinuitet. Certifiering mot den görs av oberoende certifieringsorgan och avser verksamheten, inte en enskild person.",
      en: "A knowledge area. ISO 22301 is a standard for an organisation's business-continuity management system. Certification against it is carried out by independent certification bodies and applies to the organisation, not to an individual.",
    },
    countries: ["INTL"],
    lastVerified: "2026-09-08",
  },
  {
    professionId: "security-coordinator",
    offerId: "iso-31000",
    kind: "certification",
    relevance: "recommended_development",
    supports: {
      sv: "Kunskapsområde. Riskhantering enligt ISO 31000 är det ramverk mycket av samordningsarbetet utgår från. Standarden är vägledning och kan inte certifieras.",
      en: "A knowledge area. Risk management along ISO 31000 lines is the framework much of the coordination work starts from. The standard is guidance and cannot be certified against.",
    },
    countries: ["INTL"],
    lastVerified: "2026-09-08",
  },
  {
    professionId: "security-coordinator",
    offerId: "iso-22301",
    kind: "certification",
    relevance: "recommended_development",
    supports: {
      sv: "Kunskapsområde. Kontinuitetshantering enligt ISO 22301 ligger nära det som samordnas i rollen. Certifiering avser en organisations ledningssystem, inte en person.",
      en: "A knowledge area. Business-continuity management along ISO 22301 lines is close to what this role coordinates. Certification applies to an organisation's management system, not to a person.",
    },
    countries: ["INTL"],
    lastVerified: "2026-09-08",
  },
  {
    professionId: "risk-manager",
    offerId: "iso-31000",
    kind: "certification",
    relevance: "recommended_development",
    supports: {
      sv: "Kunskapsområde. ISO 31000 är vägledning för riskhantering och kan inte certifieras — varken för en person eller för en organisation.",
      en: "A knowledge area. ISO 31000 is guidance on risk management and cannot be certified against — for a person or for an organisation.",
    },
    countries: ["INTL"],
    lastVerified: "2026-09-08",
  },
  {
    professionId: "crisis-continuity-manager",
    offerId: "iso-22301",
    kind: "certification",
    relevance: "recommended_development",
    supports: {
      sv: "Kunskapsområde. ISO 22301 beskriver ledningssystem för kontinuitet. Certifiering görs av oberoende certifieringsorgan och avser organisationen.",
      en: "A knowledge area. ISO 22301 describes business-continuity management systems. Certification is carried out by independent certification bodies and applies to the organisation.",
    },
    countries: ["INTL"],
    lastVerified: "2026-09-08",
  },
  {
    professionId: "aml-specialist",
    offerId: "acams-cams",
    kind: "certification",
    relevance: "recommended_development",
    supports: {
      sv: "En frivillig yrkescertifiering inom penningtvättsbekämpning, utfärdad av ACAMS. Den svenska penningtvättsregleringen binder verksamhetsutövaren och kräver ingen personlig certifiering.",
      en: "A voluntary professional credential in anti-money-laundering, awarded by ACAMS. Swedish AML regulation binds the firm and requires no personal certification.",
    },
    countries: ["INTL"],
    lastVerified: "2026-09-08",
  },
  {
    professionId: "security-technician",
    offerId: "asis-psp",
    kind: "certification",
    relevance: "recommended_development",
    supports: {
      sv: "En frivillig yrkescertifiering inom fysiskt skydd, utfärdad av ASIS International. Inget svenskt regelverk kräver den.",
      en: "A voluntary professional credential in physical security, awarded by ASIS International. No Swedish regulation requires it.",
    },
    countries: ["INTL"],
    lastVerified: "2026-09-08",
  },
  {
    professionId: "security-technician",
    offerId: "se-sbsc",
    kind: "certification",
    relevance: "recommended_development",
    supports: {
      sv: "Branschcertifiering från SBSC. Den efterfrågas av vissa uppdragsgivare och försäkringsvillkor, men är inte ett myndighetskrav för att arbeta som säkerhetstekniker.",
      en: "An industry certification from SBSC. Some clients and insurance terms ask for it, but it is not a statutory requirement for working as a security systems technician.",
    },
    countries: ["SE"],
    lastVerified: "2026-09-08",
  },
  {
    professionId: "data-center-security",
    offerId: "asis-psp",
    kind: "certification",
    relevance: "recommended_development",
    supports: {
      sv: "En frivillig yrkescertifiering inom fysiskt skydd, utfärdad av ASIS International.",
      en: "A voluntary professional credential in physical security, awarded by ASIS International.",
    },
    countries: ["INTL"],
    lastVerified: "2026-09-08",
  },
  {
    professionId: "data-center-security",
    offerId: "iso-27001",
    kind: "certification",
    relevance: "recommended_development",
    supports: {
      sv: "Kunskapsområde. ISO/IEC 27001 är en standard för informationssäkerhetsledning. Certifiering avser en organisations ledningssystem och görs av oberoende certifieringsorgan.",
      en: "A knowledge area. ISO/IEC 27001 is an information-security management standard. Certification applies to an organisation's management system and is carried out by independent certification bodies.",
    },
    countries: ["INTL"],
    lastVerified: "2026-09-08",
  },
];

export function educationLinksFor(professionId: ProfessionId): ProfessionEducationLink[] {
  return PROFESSION_EDUCATION_LINKS.filter((l) => l.professionId === professionId);
}
