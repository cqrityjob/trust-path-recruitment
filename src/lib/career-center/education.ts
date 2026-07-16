import type { Education, EducationId } from "./types";

export const education: readonly Education[] = [
  {
    id: "se-vaktarutbildning",
    status: "researched",
    lastVerified: "2026-07-16",
    name: { sv: "Väktarutbildning (VU1/VU2/VU3)", en: "Swedish Security Officer Training (VU1/VU2/VU3)" },
    provider: { sv: "Auktoriserade bevakningsföretag under Polismyndighetens tillsyn", en: "Authorised guarding companies under Swedish Police supervision" },
    scope: ["SE"],
    targetLevel: "entry",
    prerequisites: [
      { sv: "Ålder minst 18 år, godkänd lämplighetsprövning, anställning eller anställningsavsikt hos ett auktoriserat bevakningsföretag.", en: "Minimum age 18, approved suitability review, employment or intent to be employed at an authorised guarding company." },
    ],
    relatedProfessions: ["security-officer"],
    officialSource: {
      label: { sv: "Polismyndigheten – Bevakningsföretag och väktare", en: "Swedish Police Authority – Guarding companies and security officers" },
      publisher: "Polismyndigheten",
      url: "https://polisen.se/tjanster-tillstand/tillstand/bevakningsforetag/",
    },
  },
  {
    id: "se-ordningsvaktsutbildning",
    status: "researched",
    lastVerified: "2026-07-16",
    name: { sv: "Ordningsvaktsgrundutbildning", en: "Swedish Public Order Officer Training" },
    provider: { sv: "Polismyndigheten (grundutbildning)", en: "Swedish Police Authority (basic training)" },
    scope: ["SE"],
    targetLevel: "entry",
    relatedProfessions: ["ordningsvakt"],
    officialSource: {
      label: { sv: "Polismyndigheten – Ordningsvakter", en: "Swedish Police – Public order officers" },
      publisher: "Polismyndigheten",
      url: "https://polisen.se/tjanster-tillstand/tillstand/ordningsvakt/",
    },
  },
  {
    id: "se-skyddsvaktsutbildning",
    status: "researched",
    lastVerified: "2026-07-16",
    name: { sv: "Skyddsvaktsutbildning", en: "Swedish Protective Security Guard Training" },
    provider: { sv: "Utbildning enligt Polismyndighetens föreskrifter och skyddsobjektets krav", en: "Training under Swedish Police regulations and the protected-object operator's requirements" },
    scope: ["SE"],
    targetLevel: "entry",
    relatedProfessions: ["skyddsvakt"],
    officialSource: {
      label: { sv: "Skyddslagen (2010:305) och skyddsförordningen (2010:523)", en: "Swedish Protective Security Act (2010:305) and Regulation (2010:523)" },
      publisher: "Sveriges riksdag",
      url: "https://www.riksdagen.se/sv/dokument-lagar/dokument/svensk-forfattningssamling/skyddslag-2010305_sfs-2010-305",
    },
  },
  {
    id: "se-polisprogrammet",
    status: "placeholder",
    name: { sv: "Polisutbildning (grundutbildning)", en: "Swedish Police Basic Programme" },
    provider: { sv: "Polismyndigheten och lärosäten", en: "Swedish Police Authority and universities" },
    scope: ["SE"],
    targetLevel: "entry",
    relatedProfessions: ["police-officer"],
    notes: { sv: "Land-specifik behörighet varierar. Innehållet behöver granskas och verifieras.", en: "Country-specific eligibility varies. Content requires review and verification." },
  },
  {
    id: "intl-university-security",
    status: "placeholder",
    name: { sv: "Högskole-/universitetsutbildning inom säkerhet och risk", en: "University programme in security and risk" },
    scope: ["INTL"],
    targetLevel: "mid",
    relatedProfessions: ["security-manager", "risk-manager"],
    notes: { sv: "Innehåll och benämning varierar mellan lärosäten och länder.", en: "Content and titles vary between institutions and countries." },
  },
  {
    id: "intl-vocational-tech",
    status: "placeholder",
    name: { sv: "Yrkesutbildning inom säkerhetsteknik", en: "Vocational programme in security technology" },
    scope: ["INTL"],
    targetLevel: "entry",
    relatedProfessions: ["security-technician"],
    notes: { sv: "Beteckningar och innehåll varierar mellan länder.", en: "Naming and content vary between countries." },
  },
  {
    id: "eu-aml-training",
    status: "placeholder",
    name: { sv: "AML- och compliance-utbildning", en: "AML and compliance training" },
    scope: ["EU"],
    targetLevel: "mid",
    relatedProfessions: ["aml-specialist", "fraud-investigator"],
    notes: { sv: "Innehåll varierar mellan tillhandahållare och tillsynsmyndigheter.", en: "Content varies between providers and supervisors." },
  },
  {
    id: "intl-continuity",
    status: "placeholder",
    name: { sv: "Utbildning inom kontinuitet och krishantering", en: "Business continuity and crisis training" },
    scope: ["INTL"],
    targetLevel: "mid",
    relatedProfessions: ["crisis-continuity-manager"],
    notes: { sv: "Ofta baserad på ISO 22301 och nationella myndighetsvägledningar.", en: "Often based on ISO 22301 and national authority guidance." },
  },
];

export function getEducation(id: EducationId) {
  return education.find((e) => e.id === id);
}