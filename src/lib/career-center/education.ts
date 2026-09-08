import type { Education, EducationId } from "./types";

export const education: readonly Education[] = [
  {
    id: "se-vaktarutbildning",
    status: "researched",
    lastVerified: "2026-09-08",
    name: {
      sv: "Väktarutbildning (VU1/VU2/VU3)",
      en: "Swedish Security Officer Training (VU1/VU2/VU3)",
    },
    provider: {
      sv: "Auktoriserade bevakningsföretag under Polismyndighetens tillsyn",
      en: "Authorised guarding companies under Swedish Police supervision",
    },
    scope: ["SE"],
    targetLevel: "entry",
    prerequisites: [
      {
        sv: "Ålder minst 18 år, godkänd lämplighetsprövning, anställning eller anställningsavsikt hos ett auktoriserat bevakningsföretag.",
        en: "Minimum age 18, approved suitability review, employment or intent to be employed at an authorised guarding company.",
      },
    ],
    relatedProfessions: ["security-officer"],
    officialSource: {
      // Replaced a polisen.se URL that now 404s. FAP 573-1 is the instrument
      // the training requirement actually comes from.
      label: {
        sv: "Polismyndighetens föreskrifter om bevakningsföretag och bevakningspersonal (FAP 573-1)",
        en: "Swedish Police Authority regulations on guarding companies and guarding personnel (FAP 573-1)",
      },
      publisher: "Polismyndigheten",
      url: "https://polisen.se/siteassets/forfattningssamling/fap-nummer/fap573-01-pmfs2017-10/",
      retrieved: "2026-09-08",
    },
  },
  {
    id: "se-ordningsvaktsutbildning",
    status: "researched",
    lastVerified: "2026-09-08",
    name: {
      sv: "Föreskriven grundutbildning för ordningsvakt",
      en: "Prescribed basic training for public order officers",
    },
    provider: {
      sv: "Polismyndigheten",
      en: "Swedish Police Authority",
    },
    scope: ["SE"],
    targetLevel: "entry",
    prerequisites: [
      {
        // The age condition belongs to the APPOINTMENT (9 §), and the guide
        // says so. It is repeated here because a reader looking at the course
        // first would otherwise not meet it until much later.
        sv: "Förordnande som ordningsvakt förutsätter dessutom att du har fyllt 20 år och bedöms lämplig. Utbildningen ensam ger inget förordnande.",
        en: "Appointment as a public order officer additionally requires that you are at least 20 years old and are assessed as suitable. The training alone confers no appointment.",
      },
    ],
    relatedProfessions: ["ordningsvakt"],
    officialSource: {
      label: {
        sv: "Polismyndigheten – Ordningsvakt: utbildning och förordnande",
        en: "Swedish Police Authority – Public order officer: training and appointment",
      },
      publisher: "Polismyndigheten",
      url: "https://polisen.se/lagar-och-regler/ordningsvakter/utbildning-till-ordningsvakt/",
      retrieved: "2026-09-08",
    },
  },
  {
    id: "se-skyddsvaktsutbildning",
    status: "researched",
    lastVerified: "2026-09-08",
    name: {
      sv: "Föreskriven skyddsvaktsutbildning",
      en: "Prescribed protective security guard training",
    },
    provider: {
      // NOT "the protected object's requirements". The training is prescribed
      // by an authority's regulations; the site operator sets additional
      // assignment requirements, which is a different thing entirely.
      sv: "Utbildning enligt Polismyndighetens föreskrifter (15 § skyddsförordningen), eller Försvarsmaktens föreskrifter för dess egen personal (14 §)",
      en: "Training under the Swedish Police Authority's regulations (section 15 of the Protective Security Ordinance), or the Armed Forces' regulations for its own personnel (section 14)",
    },
    scope: ["SE"],
    targetLevel: "entry",
    prerequisites: [
      {
        sv: "Utbildningen är inte godkännandet. Den som utses till skyddsvakt ska godkännas av länsstyrelsen i sitt bosättningslän (6 § skyddsförordningen); Försvarsmakten godkänner sin egen personal.",
        en: "The training is not the approval. A person appointed as a protective security guard must be approved by the county administrative board where they live (section 6 of the Protective Security Ordinance); the Armed Forces approve their own personnel.",
      },
    ],
    relatedProfessions: ["skyddsvakt"],
    officialSource: {
      label: {
        sv: "Skyddsförordning (2010:523), 6, 14 och 15 §§",
        en: "Swedish Protective Security Ordinance (2010:523), sections 6, 14 and 15",
      },
      publisher: "Sveriges riksdag",
      url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skyddsforordning-2010523_sfs-2010-523/",
      retrieved: "2026-09-08",
    },
  },
  {
    id: "se-polisprogrammet",
    status: "placeholder",
    name: { sv: "Polisutbildning (grundutbildning)", en: "Swedish Police Basic Programme" },
    provider: {
      sv: "Polismyndigheten och lärosäten",
      en: "Swedish Police Authority and universities",
    },
    scope: ["SE"],
    targetLevel: "entry",
    relatedProfessions: ["police-officer"],
    notes: {
      sv: "Land-specifik behörighet varierar. Innehållet behöver granskas och verifieras.",
      en: "Country-specific eligibility varies. Content requires review and verification.",
    },
  },
  {
    id: "intl-university-security",
    status: "placeholder",
    name: {
      sv: "Högskole-/universitetsutbildning inom säkerhet och risk",
      en: "University programme in security and risk",
    },
    scope: ["INTL"],
    targetLevel: "mid",
    relatedProfessions: ["security-manager", "risk-manager"],
    notes: {
      sv: "Innehåll och benämning varierar mellan lärosäten och länder.",
      en: "Content and titles vary between institutions and countries.",
    },
  },
  {
    id: "intl-vocational-tech",
    status: "placeholder",
    name: {
      sv: "Yrkesutbildning inom säkerhetsteknik",
      en: "Vocational programme in security technology",
    },
    scope: ["INTL"],
    targetLevel: "entry",
    relatedProfessions: ["security-technician"],
    notes: {
      sv: "Beteckningar och innehåll varierar mellan länder.",
      en: "Naming and content vary between countries.",
    },
  },
  {
    id: "eu-aml-training",
    status: "placeholder",
    name: { sv: "AML- och compliance-utbildning", en: "AML and compliance training" },
    scope: ["EU"],
    targetLevel: "mid",
    relatedProfessions: ["aml-specialist", "fraud-investigator"],
    notes: {
      sv: "Innehåll varierar mellan tillhandahållare och tillsynsmyndigheter.",
      en: "Content varies between providers and supervisors.",
    },
  },
  {
    id: "intl-continuity",
    status: "placeholder",
    name: {
      sv: "Utbildning inom kontinuitet och krishantering",
      en: "Business continuity and crisis training",
    },
    scope: ["INTL"],
    targetLevel: "mid",
    relatedProfessions: ["crisis-continuity-manager"],
    notes: {
      sv: "Ofta baserad på ISO 22301 och nationella myndighetsvägledningar.",
      en: "Often based on ISO 22301 and national authority guidance.",
    },
  },
];

export function getEducation(id: EducationId) {
  return education.find((e) => e.id === id);
}
