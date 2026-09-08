import type { Profession } from "../types";

// Ten priority pilot profiles.
// Where sources are available, status = "researched".
// Records use IDs and relationships — no duplicated education/certification data.

export const securityOfficer: Profession = {
  id: "security-officer",
  slug: "security-officer",
  status: "researched",
  lastVerified: "2026-07-16",
  titleCanonical: "Security Officer",
  titleSv: "Väktare",
  titleEn: "Security Officer",
  aliases: [{ sv: "Bevakningsanställd", en: "Guard" }],
  family: "protective_operations",
  category: "guarding",
  level: "entry",
  sector: "private",
  orientation: ["operational"],
  icon: "shield-check",
  description: { sv: "Operativa bevakningsuppdrag inom auktoriserad bevakningsverksamhet.", en: "Operational guarding duties within authorised guarding companies." },
  overview: {
    sv: "Väktare arbetar inom auktoriserade bevakningsföretag och utför bevaknings-, ronderings- och larmuppdrag hos kund. Verksamheten och yrket regleras i Sverige av lagen (1974:191) om bevakningsföretag och Polismyndighetens föreskrifter.",
    en: "Security officers work for authorised guarding companies performing guarding, patrol and alarm response for clients. In Sweden the activity and role are regulated by the Guarding Companies Act (1974:191) and the Swedish Police Authority's regulations.",
  },
  roleFor: { sv: "Rollen passar dig som är lugn, strukturerad och trygg i mötet med människor.", en: "Suits people who are calm, structured and confident in interacting with others." },
  responsibilities: [
    { sv: "Utföra bevaknings-, rondering- och larmuppdrag enligt uppdragsinstruktion.", en: "Perform guarding, patrol and alarm response duties per assignment instructions." },
    { sv: "Rapportera händelser och avvikelser sakligt.", en: "Report events and deviations factually." },
    { sv: "Samverka med kund, kollegor och vid behov med polis.", en: "Collaborate with client, colleagues and, when needed, the police." },
  ],
  workEnvironments: [
    { sv: "Butiks-, kontors- och industrimiljöer.", en: "Retail, office and industrial environments." },
    { sv: "Rondering och larmutryckning.", en: "Patrols and alarm response." },
  ],
  industries: [
    { sv: "Bevakningsföretag, fastighet, handel, transport, industri.", en: "Guarding companies, real estate, retail, transport, industry." },
  ],
  competencies: [
    { competencyId: "integrity", requiredLevel: 3, critical: true },
    { competencyId: "observation", requiredLevel: 3 },
    { competencyId: "communication", requiredLevel: 3 },
    { competencyId: "reporting", requiredLevel: 3 },
    { competencyId: "customer_service", requiredLevel: 3 },
    { competencyId: "conflict", requiredLevel: 2 },
    { competencyId: "risk_awareness", requiredLevel: 3 },
  ],
  formalRequirements: [
    { sv: "Ålder minst 18 år och godkänd lämplighetsprövning enligt Polismyndighetens föreskrifter.", en: "Minimum age 18 and approved suitability review under Swedish Police regulations." },
    { sv: "Genomförd väktarutbildning hos auktoriserat bevakningsföretag.", en: "Completed security-officer training at an authorised guarding company." },
  ],
  regulated: true,
  regulatoryNotes: { sv: "Yrket är reglerat i Sverige. Motsvarande regelverk och benämning varierar mellan länder.", en: "The role is regulated in Sweden. Equivalent regulation and terminology vary between countries." },
  countries: ["SE"],
  educationPathways: ["se-vaktarutbildning"],
  certifications: [],
  previousRoles: [],
  nextRoles: ["ordningsvakt", "skyddsvakt", "security-coordinator"],
  related: ["ordningsvakt", "skyddsvakt", "close-protection", "data-center-security"],
  recommendedAssessment: "security-career-assessment",
  relatedJobsQuery: "security-officer",
  sources: [
    {
      label: {
        sv: "Lag (1974:191) om bevakningsföretag",
        en: "Guarding Companies Act (1974:191)",
      },
      publisher: "Sveriges riksdag",
      url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-1974191-om-bevakningsforetag_sfs-1974-191/",
      retrieved: "2026-09-08",
    },
    {
      // The previous source here was https://polisen.se/tjanster-tillstand/
      // tillstand/bevakningsforetag/, which now 404s. A dead source is not a
      // source: it is replaced with the Police Authority's own regulations for
      // guarding companies, which is the instrument the training requirement
      // actually comes from.
      label: {
        sv: "Polismyndighetens föreskrifter och allmänna råd om bevakningsföretag och bevakningspersonal (FAP 573-1)",
        en: "Swedish Police Authority regulations on guarding companies and guarding personnel (FAP 573-1)",
      },
      publisher: "Polismyndigheten",
      url: "https://polisen.se/siteassets/forfattningssamling/fap-nummer/fap573-01-pmfs2017-10/",
      retrieved: "2026-09-08",
    },
  ],
};

// ── ORDNINGSVAKT ───────────────────────────────────────────────────────
//
// ── THE ACT THIS GUIDE USED TO CITE IS REPEALED ────────────────────────
//
// Every reference here was to lagen (1980:578) om ordningsvakter, which was
// replaced by lagen (2023:421) om ordningsvakter. The guide was therefore
// citing repealed law as the current requirement — the single worst kind of
// error a regulatory career guide can make, because a reader has no way to
// tell a confident wrong answer from a right one.
//
// The 2023 Act's 9 § states three conditions for appointment, and the guide
// now states all three rather than compressing them:
//
//   * at least 20 years of age  (NOT 18 — the age this catalogue carries for
//     väktare, which is a different role under a different Act)
//   * prescribed training completed
//   * assessed as suitable, on lawfulness and other circumstances
//
// The appointment itself is a decision by Polismyndigheten (20 §).
//
// ── AND WORKING AS A VÄKTARE IS NOT A PREREQUISITE ─────────────────────
//
// Nothing in the Act requires it. The catalogue records a possible direction
// from väktare to ordningsvakt because people do move between them, but the
// guide must not present a guarding job as a legal step towards this
// appointment, and `careerPaths` no longer implies that either.
export const ordningsvakt: Profession = {
  id: "ordningsvakt",
  slug: "ordningsvakt",
  status: "researched",
  lastVerified: "2026-09-08",
  titleCanonical: "Public Order Officer",
  titleSv: "Ordningsvakt",
  titleEn: "Public Order Officer",
  family: "public_safety_justice",
  category: "public_safety",
  level: "entry",
  sector: "hybrid",
  orientation: ["operational"],
  icon: "shield",
  description: {
    sv: "Förordnad av Polismyndigheten för att medverka till att upprätthålla allmän ordning och säkerhet.",
    en: "Appointed by the Swedish Police Authority to help maintain public order and safety.",
  },
  overview: {
    sv: "Ordningsvakt är en särskild ställning enligt lagen (2023:421) om ordningsvakter. Ordningsvakter förordnas av Polismyndigheten och har vissa befogenheter att medverka till att upprätthålla allmän ordning och säkerhet där förordnandet gäller. Ställningen är inte en anställning: förordnandet är personligt och beslutas av myndigheten.",
    en: "A Swedish public order officer holds a statutory position under the Public Order Officers Act (2023:421). Officers are appointed by the Swedish Police Authority and hold limited powers to help maintain public order and safety where the appointment applies. The position is not an employment: the appointment is personal and decided by the authority.",
  },
  roleFor: {
    sv: "Rollen passar dig som vill arbeta operativt med allmän ordning under Polismyndighetens tillsyn, och som accepterar att befogenheterna följer av ett myndighetsbeslut snarare än av arbetsgivaren.",
    en: "Suits people who want to work operationally with public order under Swedish Police oversight, and who accept that the powers follow from an authority decision rather than from an employer.",
  },
  responsibilities: [
    {
      sv: "Medverka till att upprätthålla allmän ordning och säkerhet inom det som förordnandet omfattar.",
      en: "Help maintain public order and safety within the scope of the appointment.",
    },
    {
      sv: "Rapportera och dokumentera ingripanden och händelser till Polismyndigheten.",
      en: "Report and document interventions and incidents to the Swedish Police Authority.",
    },
    {
      sv: "Följa Polismyndighetens anvisningar och lyda order som meddelas av en polisman.",
      en: "Follow the Police Authority's instructions and obey orders given by a police officer.",
    },
  ],
  competencies: [
    { competencyId: "integrity", requiredLevel: 4, critical: true },
    { competencyId: "legal_regulatory", requiredLevel: 3, critical: true },
    { competencyId: "conflict", requiredLevel: 3 },
    { competencyId: "decision_making", requiredLevel: 3 },
    { competencyId: "communication", requiredLevel: 3 },
    { competencyId: "stress", requiredLevel: 3 },
  ],
  // The three conditions of 9 §, stated separately, plus the decision itself.
  // Not compressed into "godkänd lämplighetsprövning och grundutbildning":
  // the age condition disappeared in that wording, and it is the condition a
  // reader is most likely to be caught by.
  formalRequirements: [
    {
      sv: "Ha fyllt 20 år (9 § lagen [2023:421] om ordningsvakter).",
      en: "Be at least 20 years old (section 9 of the Public Order Officers Act [2023:421]).",
    },
    {
      sv: "Ha genomgått föreskriven utbildning för ordningsvakt.",
      en: "Have completed the prescribed training for public order officers.",
    },
    {
      sv: "Bedömas lämplig för uppdraget med hänsyn till laglydnad och andra omständigheter.",
      en: "Be assessed as suitable for the assignment with regard to lawfulness and other circumstances.",
    },
    {
      sv: "Förordnande beslutat av Polismyndigheten. Genomförd utbildning ger i sig inget förordnande.",
      en: "An appointment decided by the Swedish Police Authority. Completing the training confers no appointment by itself.",
    },
  ],
  regulated: true,
  regulatoryNotes: {
    sv: "Ordningsvakt är en svensk myndighetsförordnad ställning enligt lagen (2023:421) om ordningsvakter — motsvarigheter finns inte i alla länder. Att arbeta som väktare är inget rättsligt krav för att kunna förordnas.",
    en: "Swedish public order officer is a state-appointed position under the Public Order Officers Act (2023:421) — equivalents do not exist in every country. Working as a security officer is not a legal prerequisite for being appointed.",
  },
  countries: ["SE"],
  educationPathways: ["se-ordningsvaktsutbildning"],
  related: ["security-officer", "skyddsvakt", "police-officer"],
  nextRoles: ["security-coordinator"],
  recommendedAssessment: "security-career-assessment",
  sources: [
    {
      label: {
        sv: "Lag (2023:421) om ordningsvakter",
        en: "Public Order Officers Act (2023:421)",
      },
      publisher: "Sveriges riksdag",
      url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2023421-om-ordningsvakter_sfs-2023-421/",
      retrieved: "2026-09-08",
    },
    {
      label: {
        sv: "Polismyndigheten – Ordningsvakter",
        en: "Swedish Police Authority – Public order officers",
      },
      publisher: "Polismyndigheten",
      url: "https://polisen.se/lagar-och-regler/ordningsvakter/",
      retrieved: "2026-09-08",
    },
    {
      label: {
        sv: "Polismyndigheten – Ordningsvakt: utbildning och förordnande",
        en: "Swedish Police Authority – Public order officer: training and appointment",
      },
      publisher: "Polismyndigheten",
      url: "https://polisen.se/lagar-och-regler/ordningsvakter/utbildning-till-ordningsvakt/",
      retrieved: "2026-09-08",
    },
  ],
};

// ── SKYDDSVAKT ─────────────────────────────────────────────────────────
//
// ── THREE DIFFERENT THINGS THIS GUIDE USED TO RUN TOGETHER ─────────────
//
// The old formal requirement read "Godkännande som skyddsvakt och utbildning
// enligt skyddsobjektets krav", and the education record said the training was
// set by "Polismyndighetens föreskrifter och skyddsobjektets krav". Both make
// the operator of the site sound like the body that sets the training. It is
// not. Three separate things are involved and each has a different decider:
//
//   TRAINING     prescribed by Polismyndigheten's regulations (15 §
//                skyddsförordningen) for skyddsvakter outside the Armed
//                Forces, and by Försvarsmakten's (14 §) for its own personnel.
//
//   APPROVAL     "Den som utses till skyddsvakt ska vara godkänd av
//                länsstyrelsen i det län där han eller hon är bosatt" (6 §).
//                Not the Police, and not the site operator. Försvarsmakten
//                approves its own personnel.
//
//   ASSIGNMENT   a designated skyddsobjekt under skyddslagen, at which an
//                approved skyddsvakt is put to work. This is where the site
//                operator's own requirements live, and they are additional
//                to — never a substitute for — the two decisions above.
export const skyddsvakt: Profession = {
  id: "skyddsvakt",
  slug: "skyddsvakt",
  status: "researched",
  lastVerified: "2026-09-08",
  titleCanonical: "Protective Security Guard",
  titleSv: "Skyddsvakt",
  titleEn: "Protective Security Guard",
  family: "protective_operations",
  category: "protective",
  level: "entry",
  sector: "hybrid",
  orientation: ["operational"],
  icon: "user-check",
  description: {
    sv: "Bevakning av skyddsobjekt enligt skyddslagen (2010:305), efter godkännande av länsstyrelsen.",
    en: "Guarding of designated protected objects under the Protective Security Act (2010:305), after approval by a county administrative board.",
  },
  overview: {
    sv: "Skyddsvakter bevakar skyddsobjekt – anläggningar och områden som är särskilt skyddsvärda enligt skyddslagen. Rollen ger vissa befogenheter inom området. Tre beslut skiljer sig åt och blandas ofta ihop: den föreskrivna utbildningen, godkännandet som skyddsvakt, och uppdraget vid ett bestämt skyddsobjekt.",
    en: "Protective security guards guard 'skyddsobjekt' – installations and areas designated as especially worth protecting under the Protective Security Act. The role carries limited powers within the area. Three decisions differ and are often conflated: the prescribed training, the approval as a protective security guard, and the assignment at a particular protected object.",
  },
  roleFor: {
    sv: "Passar dig som är noggrann, disciplinerad och trivs med tydliga rutiner och ett tydligt avgränsat uppdrag.",
    en: "Suits people who are precise, disciplined and thrive on clear procedures and a clearly bounded assignment.",
  },
  responsibilities: [
    {
      sv: "Bevaka skyddsobjektet enligt uppdrag och instruktion.",
      en: "Guard the protected object per assignment and instruction.",
    },
    {
      sv: "Utföra kontroll av personer och fordon inom skyddsområdet.",
      en: "Conduct checks of persons and vehicles within the protected area.",
    },
    {
      sv: "Dokumentera och rapportera händelser till uppdragsgivaren och, när det krävs, till Polismyndigheten.",
      en: "Document and report incidents to the client and, where required, to the Swedish Police Authority.",
    },
  ],
  competencies: [
    { competencyId: "integrity", requiredLevel: 4, critical: true },
    { competencyId: "legal_regulatory", requiredLevel: 3, critical: true },
    { competencyId: "observation", requiredLevel: 4 },
    { competencyId: "reporting", requiredLevel: 3 },
    { competencyId: "risk_awareness", requiredLevel: 3 },
  ],
  formalRequirements: [
    {
      sv: "Genomgången föreskriven utbildning enligt Polismyndighetens föreskrifter (15 § skyddsförordningen [2010:523]), eller enligt Försvarsmaktens föreskrifter om du tillhör Försvarsmaktens personal (14 §).",
      en: "Completed prescribed training under the Swedish Police Authority's regulations (section 15 of the Protective Security Ordinance [2010:523]), or under the Armed Forces' regulations if you are Armed Forces personnel (section 14).",
    },
    {
      sv: "Godkännande som skyddsvakt av länsstyrelsen i det län där du är bosatt (6 § skyddsförordningen). Försvarsmakten godkänner sin egen personal.",
      en: "Approval as a protective security guard by the county administrative board in the county where you live (section 6 of the Protective Security Ordinance). The Armed Forces approve their own personnel.",
    },
    {
      sv: "Ett uppdrag vid ett skyddsobjekt. Uppdragsgivarens egna krav tillkommer utöver utbildningen och godkännandet — de ersätter dem inte.",
      en: "An assignment at a designated protected object. The client's own requirements come in addition to the training and the approval — they do not replace either.",
    },
  ],
  regulated: true,
  regulatoryNotes: {
    sv: "Rollen är svensk och reglerad genom skyddslagen (2010:305) och skyddsförordningen (2010:523). Utbildning, godkännande och uppdrag är tre skilda beslut med tre olika beslutsfattare.",
    en: "This is a Swedish role regulated by the Protective Security Act (2010:305) and Ordinance (2010:523). Training, approval and assignment are three separate decisions with three different deciders.",
  },
  countries: ["SE"],
  educationPathways: ["se-skyddsvaktsutbildning"],
  related: ["security-officer", "ordningsvakt", "military-security-specialist", "data-center-security"],
  nextRoles: ["data-center-security", "security-coordinator"],
  recommendedAssessment: "security-career-assessment",
  sources: [
    {
      label: { sv: "Skyddslag (2010:305)", en: "Protective Security Act (2010:305)" },
      publisher: "Sveriges riksdag",
      url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skyddslag-2010305_sfs-2010-305/",
      retrieved: "2026-09-08",
    },
    {
      label: {
        sv: "Skyddsförordning (2010:523), 6, 14 och 15 §§",
        en: "Protective Security Ordinance (2010:523), sections 6, 14 and 15",
      },
      publisher: "Sveriges riksdag",
      url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skyddsforordning-2010523_sfs-2010-523/",
      retrieved: "2026-09-08",
    },
  ],
};

export const securityManager: Profession = {
  id: "security-manager",
  slug: "security-manager",
  status: "researched",
  lastVerified: "2026-07-16",
  titleCanonical: "Security Manager",
  titleSv: "Säkerhetschef",
  titleEn: "Security Manager",
  family: "security_leadership_governance",
  category: "leadership",
  level: "senior",
  sector: "private",
  orientation: ["leadership", "analytical"],
  icon: "building",
  description: { sv: "Strategiskt ansvar för säkerhet, risk och kontinuitet i en organisation.", en: "Strategic responsibility for security, risk and continuity within an organisation." },
  overview: { sv: "Säkerhetschefen leder säkerhetsfunktionen – från policy och risk till operativ leverans och kontinuitet.", en: "The Security Manager leads the security function – from policy and risk to operational delivery and continuity." },
  roleFor: { sv: "Passar erfarna säkerhetsprofiler med tydlig ledaridentitet och affärsförståelse.", en: "Suits experienced security professionals with clear leadership identity and business acumen." },
  responsibilities: [
    { sv: "Utforma och underhålla säkerhetspolicy och styrande dokument.", en: "Design and maintain security policy and governance documents." },
    { sv: "Leda risk- och sårbarhetsanalyser.", en: "Lead risk and vulnerability assessments." },
    { sv: "Ansvara för budget, leverantörer och kontinuitetsplaner.", en: "Own budget, vendors and continuity plans." },
    { sv: "Rapportera till ledning och styrelse.", en: "Report to executive management and the board." },
  ],
  competencies: [
    { competencyId: "leadership", requiredLevel: 4, critical: true },
    { competencyId: "planning", requiredLevel: 4 },
    { competencyId: "risk_awareness", requiredLevel: 4 },
    { competencyId: "decision_making", requiredLevel: 4 },
    { competencyId: "communication", requiredLevel: 4 },
    { competencyId: "analytical", requiredLevel: 3 },
    { competencyId: "legal_regulatory", requiredLevel: 3 },
  ],
  regulated: false,
  countries: ["SE", "EU", "INTL"],
  educationPathways: ["intl-university-security"],
  certifications: ["asis-cpp", "iso-31000", "iso-22301"],
  previousRoles: ["security-coordinator", "risk-manager", "security-officer"],
  nextRoles: ["security-consultant"],
  related: ["risk-manager", "crisis-continuity-manager", "security-consultant"],
  recommendedAssessment: "security-career-assessment",
  sources: [
    { label: { sv: "ASIS International – CPP", en: "ASIS International – CPP" }, publisher: "ASIS International", url: "https://www.asisonline.org/certification/certified-protection-professional-cpp/" },
  ],
};

export const securityTechnician: Profession = {
  id: "security-technician",
  slug: "security-technician",
  status: "researched",
  lastVerified: "2026-07-16",
  titleCanonical: "Security Systems Technician",
  titleSv: "Säkerhetstekniker",
  titleEn: "Security Systems Technician",
  family: "security_technology",
  category: "tech",
  level: "mid",
  sector: "private",
  orientation: ["technical"],
  icon: "cpu",
  description: { sv: "Installation, drift och underhåll av tekniska säkerhetssystem.", en: "Installation, operation and maintenance of technical security systems." },
  overview: { sv: "Säkerhetstekniker knyter ihop det fysiska och digitala – genom passersystem, kameror, larm och integrationer.", en: "Security technicians bridge the physical and digital – through access control, cameras, alarms and integrations." },
  roleFor: { sv: "Passar tekniskt lagda, noggranna och lösningsorienterade.", en: "Suits technically minded, precise and solution-oriented people." },
  responsibilities: [
    { sv: "Installera och driftsätta säkerhetssystem.", en: "Install and commission security systems." },
    { sv: "Utföra service och felsökning.", en: "Perform service and troubleshooting." },
    { sv: "Dokumentera installationer och integrationer.", en: "Document installations and integrations." },
  ],
  competencies: [
    { competencyId: "technical", requiredLevel: 4, critical: true },
    { competencyId: "problem_solving", requiredLevel: 3 },
    { competencyId: "planning", requiredLevel: 3 },
    { competencyId: "communication", requiredLevel: 3 },
    { competencyId: "reporting", requiredLevel: 3 },
  ],
  regulated: false,
  regulatoryNotes: { sv: "Vissa installationer omfattas av branschregler (t.ex. SBSC) och nationella regelverk.", en: "Certain installations fall under industry rules (e.g. SBSC in Sweden) and national regulations." },
  countries: ["SE", "INTL"],
  educationPathways: ["intl-vocational-tech"],
  certifications: ["asis-psp", "se-sbsc"],
  related: ["data-center-security", "security-manager"],
  nextRoles: ["data-center-security", "security-manager"],
  recommendedAssessment: "security-career-assessment",
  sources: [
    { label: { sv: "SBSC – Svensk Brand- och Säkerhetscertifiering", en: "SBSC – Swedish Fire and Security Certification" }, publisher: "SBSC", url: "https://sbsc.se/" },
  ],
};

export const riskManager: Profession = {
  id: "risk-manager",
  slug: "risk-manager",
  status: "researched",
  lastVerified: "2026-07-16",
  titleCanonical: "Risk Manager",
  titleSv: "Risk Manager",
  titleEn: "Risk Manager",
  family: "risk_management",
  category: "risk",
  level: "senior",
  sector: "private",
  orientation: ["analytical", "leadership"],
  icon: "alert-triangle",
  description: { sv: "Identifiering, analys och hantering av operativa och organisatoriska risker.", en: "Identification, analysis and management of operational and organisational risk." },
  overview: { sv: "Risk managers ger ledningen ett strukturerat sätt att förstå och prioritera risker – från operativ till strategisk nivå.", en: "Risk managers give leadership a structured way to understand and prioritise risk – from operational to strategic level." },
  roleFor: { sv: "Passar analytiska profiler som trivs med struktur, siffror och beslut under osäkerhet.", en: "Suits analytical people who thrive on structure, numbers and decisions under uncertainty." },
  responsibilities: [
    { sv: "Etablera och underhålla ramverk för riskhantering.", en: "Establish and maintain risk-management frameworks." },
    { sv: "Genomföra risk- och sårbarhetsanalyser.", en: "Perform risk and vulnerability assessments." },
    { sv: "Rapportera risk till ledning och styrelse.", en: "Report risk to management and the board." },
  ],
  competencies: [
    { competencyId: "analytical", requiredLevel: 4, critical: true },
    { competencyId: "risk_awareness", requiredLevel: 4, critical: true },
    { competencyId: "communication", requiredLevel: 4 },
    { competencyId: "decision_making", requiredLevel: 4 },
    { competencyId: "planning", requiredLevel: 3 },
  ],
  regulated: false,
  countries: ["SE", "EU", "INTL"],
  certifications: ["iso-31000", "crisc"],
  related: ["security-manager", "aml-specialist", "crisis-continuity-manager"],
  nextRoles: ["security-manager"],
  recommendedAssessment: "security-career-assessment",
  sources: [
    { label: { sv: "ISO 31000:2018 – Riskhantering", en: "ISO 31000:2018 – Risk Management" }, publisher: "ISO", url: "https://www.iso.org/iso-31000-risk-management.html" },
  ],
};

export const amlSpecialist: Profession = {
  id: "aml-specialist",
  slug: "aml-specialist",
  status: "researched",
  lastVerified: "2026-07-16",
  titleCanonical: "AML Specialist",
  titleSv: "AML-specialist",
  titleEn: "AML Specialist",
  family: "financial_crime_compliance",
  category: "aml",
  level: "mid",
  sector: "private",
  orientation: ["analytical"],
  icon: "scale",
  description: { sv: "Motverkan av penningtvätt, finansiell brottslighet och regelefterlevnad.", en: "Anti-money-laundering, financial-crime prevention and regulatory compliance." },
  overview: { sv: "AML-specialister skyddar det finansiella systemet genom kontroll, transaktionsövervakning och rapportering till tillsynsmyndigheter.", en: "AML specialists protect the financial system through controls, transaction monitoring and regulatory reporting." },
  roleFor: { sv: "Passar noggranna, analytiska profiler med intresse för regelverk.", en: "Suits precise, analytical people with an interest in regulation." },
  responsibilities: [
    { sv: "Övervaka transaktioner och utreda misstänkta mönster.", en: "Monitor transactions and investigate suspicious patterns." },
    { sv: "Utföra kundkännedom (KYC) och skärpta åtgärder.", en: "Perform customer due diligence (KYC) and enhanced measures." },
    { sv: "Rapportera misstänkta transaktioner enligt lag.", en: "Report suspicious transactions in line with statutory obligations." },
  ],
  competencies: [
    { competencyId: "analytical", requiredLevel: 4, critical: true },
    { competencyId: "legal_regulatory", requiredLevel: 4, critical: true },
    { competencyId: "reporting", requiredLevel: 4 },
    { competencyId: "integrity", requiredLevel: 4, critical: true },
    { competencyId: "communication", requiredLevel: 3 },
  ],
  regulated: true,
  regulatoryNotes: { sv: "Verksamheten regleras i Sverige av penningtvättslagen (2017:630) och EU:s regelverk. Krav skiljer sig mellan verksamhetstyper.", en: "In Sweden the activity is regulated by the AML Act (2017:630) and EU rules. Requirements differ between business types." },
  countries: ["SE", "EU", "INTL"],
  educationPathways: ["eu-aml-training"],
  certifications: ["acams-cams"],
  related: ["risk-manager", "fraud-investigator", "security-investigator"],
  nextRoles: ["fraud-investigator", "security-consultant"],
  recommendedAssessment: "security-career-assessment",
  sources: [
    { label: { sv: "Lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism", en: "Swedish AML Act (2017:630)" }, publisher: "Sveriges riksdag", url: "https://www.riksdagen.se/sv/dokument-lagar/dokument/svensk-forfattningssamling/lag-2017630-om-atgarder-mot-penningtvatt-och_sfs-2017-630" },
    { label: { sv: "Finansinspektionen – Penningtvätt", en: "Swedish FSA – Money laundering" }, publisher: "Finansinspektionen", url: "https://www.fi.se/sv/bank/penningtvatt/" },
  ],
};

export const dataCenterSecurity: Profession = {
  id: "data-center-security",
  slug: "data-center-security",
  status: "researched",
  lastVerified: "2026-07-16",
  titleCanonical: "Data Center Security Specialist",
  titleSv: "Datacenter­säkerhetsspecialist",
  titleEn: "Data Center Security Specialist",
  family: "critical_infrastructure_security",
  category: "critical_infra",
  level: "mid",
  sector: "private",
  orientation: ["operational", "technical"],
  icon: "server",
  description: { sv: "Fysisk och operativ säkerhet för datacenter och kritisk digital infrastruktur.", en: "Physical and operational security for data centers and critical digital infrastructure." },
  overview: { sv: "Säkerhet i datacenter kräver stenhård rutin, teknisk förståelse och en tydlig känsla för det som inte får hända.", en: "Data center security demands rigorous routine, technical understanding and a clear sense of what must never happen." },
  roleFor: { sv: "Passar dig som gillar rutin, tekniska system och en stabil arbetsmiljö.", en: "Suits people who value routine, technical systems and a stable environment." },
  responsibilities: [
    { sv: "Utföra åtkomstkontroll och sitebevakning enligt kundens säkerhetspolicy.", en: "Perform access control and site security per client policy." },
    { sv: "Övervaka fysiska och tekniska säkerhetssystem.", en: "Monitor physical and technical security systems." },
    { sv: "Dokumentera händelser och samverka med drift och kund.", en: "Document events and collaborate with operations and client teams." },
  ],
  competencies: [
    { competencyId: "observation", requiredLevel: 4, critical: true },
    { competencyId: "reporting", requiredLevel: 3 },
    { competencyId: "technical", requiredLevel: 3 },
    { competencyId: "risk_awareness", requiredLevel: 3 },
    { competencyId: "integrity", requiredLevel: 4, critical: true },
  ],
  regulated: false,
  regulatoryNotes: { sv: "Krav på personal styrs ofta av kundens säkerhetsklassning och internationella standarder.", en: "Personnel requirements are usually driven by client security classification and international standards." },
  countries: ["SE", "EU", "INTL"],
  certifications: ["iso-27001", "asis-psp"],
  related: ["security-technician", "security-officer", "skyddsvakt"],
  nextRoles: ["security-manager", "security-consultant"],
  recommendedAssessment: "security-career-assessment",
  sources: [
    { label: { sv: "ISO/IEC 27001:2022", en: "ISO/IEC 27001:2022" }, publisher: "ISO", url: "https://www.iso.org/standard/27001" },
  ],
};

export const crisisContinuityManager: Profession = {
  id: "crisis-continuity-manager",
  slug: "crisis-continuity-manager",
  status: "researched",
  lastVerified: "2026-07-16",
  titleCanonical: "Crisis and Business Continuity Manager",
  titleSv: "Kris- och kontinuitetsansvarig",
  titleEn: "Crisis and Business Continuity Manager",
  family: "crisis_management",
  category: "emergency",
  level: "senior",
  sector: "private",
  orientation: ["leadership", "analytical"],
  icon: "siren",
  description: { sv: "Planering och ledning av kris- och incidenthantering och verksamhetskontinuitet.", en: "Planning and leading incident, crisis and business-continuity response." },
  overview: { sv: "Kris- och kontinuitetsansvariga förbereder organisationen på det som ännu inte hänt – och leder när det gör det.", en: "Crisis and continuity leaders prepare the organisation for what has not yet happened – and lead when it does." },
  roleFor: { sv: "Passar dig som är strukturerad, lugn och trygg i beslut under osäkerhet.", en: "Suits people who are structured, calm and confident making decisions under uncertainty." },
  responsibilities: [
    { sv: "Etablera kontinuitetsprogram enligt ISO 22301 eller motsvarande.", en: "Establish continuity programmes aligned to ISO 22301 or equivalent." },
    { sv: "Leda övningar, incidentrespons och efterlärande.", en: "Lead exercises, incident response and post-incident learning." },
  ],
  competencies: [
    { competencyId: "planning", requiredLevel: 4, critical: true },
    { competencyId: "leadership", requiredLevel: 4 },
    { competencyId: "decision_making", requiredLevel: 4 },
    { competencyId: "communication", requiredLevel: 4 },
    { competencyId: "risk_awareness", requiredLevel: 4 },
    { competencyId: "incident_mgmt", requiredLevel: 4, critical: true },
  ],
  regulated: false,
  countries: ["SE", "EU", "INTL"],
  educationPathways: ["intl-continuity"],
  certifications: ["iso-22301"],
  related: ["security-manager", "risk-manager"],
  nextRoles: ["security-manager"],
  recommendedAssessment: "security-career-assessment",
  sources: [
    { label: { sv: "ISO 22301:2019", en: "ISO 22301:2019" }, publisher: "ISO", url: "https://www.iso.org/standard/75106.html" },
    { label: { sv: "MSB – Myndigheten för samhällsskydd och beredskap", en: "Swedish Civil Contingencies Agency (MSB)" }, publisher: "MSB", url: "https://www.msb.se/" },
  ],
};

export const closeProtection: Profession = {
  id: "close-protection",
  slug: "close-protection",
  status: "researched",
  lastVerified: "2026-07-16",
  titleCanonical: "Close Protection Officer",
  titleSv: "Personskyddsväktare (livvakt)",
  titleEn: "Close Protection Officer",
  family: "protective_operations",
  category: "protective",
  level: "senior",
  sector: "private",
  orientation: ["operational"],
  icon: "user-check",
  description: { sv: "Personskydd för utsatta individer i olika miljöer och riskbilder.", en: "Personal protection for exposed individuals across varied environments and threat profiles." },
  overview: { sv: "Personskyddsväktare arbetar diskret, förberett och professionellt – nära individen som skyddas. I Sverige regleras yrket via lagen om bevakningsföretag och Polismyndighetens föreskrifter.", en: "Close protection officers operate discreetly, prepared and professional – close to the individual being protected. In Sweden the role is regulated via the Guarding Companies Act and the Swedish Police Authority's regulations." },
  roleFor: { sv: "Passar dig som är fysiskt och mentalt förberedd, disciplinerad och lugn under press.", en: "Suits people who are physically and mentally prepared, disciplined and calm under pressure." },
  responsibilities: [
    { sv: "Planera och genomföra personskyddsuppdrag.", en: "Plan and execute close-protection assignments." },
    { sv: "Genomföra hotbildsbedömningar och rekognosering.", en: "Perform threat assessments and reconnaissance." },
  ],
  competencies: [
    { competencyId: "risk_awareness", requiredLevel: 4, critical: true },
    { competencyId: "decision_making", requiredLevel: 4 },
    { competencyId: "planning", requiredLevel: 4 },
    { competencyId: "communication", requiredLevel: 3 },
    { competencyId: "stress", requiredLevel: 4 },
    { competencyId: "integrity", requiredLevel: 4, critical: true },
  ],
  formalRequirements: [
    { sv: "Godkänd väktarutbildning och personskyddsutbildning vid auktoriserat bevakningsföretag.", en: "Approved security-officer and close-protection training at an authorised guarding company." },
  ],
  regulated: true,
  countries: ["SE"],
  educationPathways: ["se-vaktarutbildning"],
  related: ["security-officer", "skyddsvakt", "military-security-specialist"],
  nextRoles: ["security-manager", "security-consultant"],
  recommendedAssessment: "security-career-assessment",
  sources: [
    { label: { sv: "Polismyndigheten – Bevakningsföretag och personskyddsväktare", en: "Swedish Police – Guarding companies and close protection" }, publisher: "Polismyndigheten", url: "https://polisen.se/tjanster-tillstand/tillstand/bevakningsforetag/" },
  ],
};
// ── SÄKERHETSSAMORDNARE ────────────────────────────────────────────────
//
// Promoted from `placeholders.ts` for the Career Center pilot, because the
// direction the Career Center is being built to explain runs through it.
//
// ── WHAT THE SOURCES ACTUALLY SUPPORT, AND WHAT THEY DO NOT ────────────
//
// The first version of this guide cited lagen (2006:544) as though it
// established the occupation. It does not. What it establishes is an
// OBLIGATION ON MUNICIPALITIES AND REGIONS: to analyse risks and
// vulnerabilities and to plan for extraordinary events. That obligation is
// real, it is documented, and coordinating the work it requires is what the
// public-sector version of this title does — so that is the only version this
// guide describes as fact.
//
// It does NOT support:
//
//   * the private-sector role description (varies by employer, unevidenced);
//   * any claim about how people arrive in the role;
//   * any claim that moving here from guarding is usual.
//
// The copy is narrowed to match, and `regulatoryNotes` states the limitation
// on the page rather than only here. When occupation-specific evidence exists
// — a classification entry, a sector study, an authority description of the
// function — this guide can widen again; until then it says less.
//
// ── THE TITLE IS NOT REGULATED ─────────────────────────────────────────
//
// Nobody appoints a säkerhetssamordnare, no authority approves one, and no
// training is mandated. It must not be confused with a SÄKERHETSSKYDDSCHEF,
// which is a statutory function under säkerhetsskyddslagen (2018:585): that
// Act applies to säkerhetskänslig verksamhet — activity of importance to
// Sweden's security or covered by an international security-protection
// commitment (1 kap. 1 §) — and 2 kap. 7 § requires such an operator to have
// a säkerhetsskyddschef "om det inte är uppenbart obehövligt". Neither the
// scope nor the "unless obviously unnecessary" qualifier may be dropped: a
// guide that says every organisation must appoint one has invented a duty.
export const securityCoordinator: Profession = {
  id: "security-coordinator",
  slug: "security-coordinator",
  status: "researched",
  lastVerified: "2026-09-08",
  titleCanonical: "Security Coordinator",
  titleSv: "Säkerhetssamordnare",
  titleEn: "Security Coordinator",
  aliases: [
    { sv: "Säkerhets- och beredskapssamordnare", en: "Security and preparedness coordinator" },
  ],
  family: "security_leadership_governance",
  category: "corporate",
  level: "mid",
  sector: "public",
  orientation: ["operational", "analytical", "leadership"],
  icon: "clipboard",
  description: {
    sv: "Samordnar risk-, säkerhets- och beredskapsarbetet i en kommun eller region.",
    en: "Coordinates risk, security and preparedness work in a Swedish municipality or region.",
  },
  overview: {
    sv: "Kommuner och regioner är enligt lag (2006:544) skyldiga att analysera vilka extraordinära händelser som kan inträffa, hur de påverkar den egna verksamheten, och att utifrån analysen fastställa en plan för hur händelserna ska hanteras. Säkerhetssamordnaren är den funktion som håller ihop det arbetet: analyserna, planerna, övningarna och kontakten med andra aktörer. Titeln är inte reglerad och kräver varken föreskriven utbildning eller förordnande.",
    en: "Swedish municipalities and regions are required by law (2006:544) to analyse which extraordinary events may occur, how those would affect their own activities, and to adopt a plan for handling them based on that analysis. The security coordinator is the function that holds that work together: the analyses, the plans, the exercises and the contact with other actors. The title is not regulated and requires neither prescribed training nor an appointment.",
  },
  roleFor: {
    sv: "Rollen passar dig som är strukturerad, hellre skriver ned en rutin än löser samma sak två gånger, och trivs med att arbeta mellan operativa verksamheter och ledning.",
    en: "Suits people who are structured, would rather write the routine down than solve the same thing twice, and are comfortable working between operational units and management.",
  },
  // Each of these is the coordinating side of a duty the Act names. Nothing
  // here describes a private-sector job, because nothing sourced here does.
  responsibilities: [
    {
      sv: "Samordna risk- och sårbarhetsanalyser och följa upp de åtgärder de leder till.",
      en: "Coordinate risk and vulnerability analyses and follow up the measures they lead to.",
    },
    {
      sv: "Hålla ihop planen för hantering av extraordinära händelser och hålla den aktuell.",
      en: "Maintain the plan for handling extraordinary events and keep it current.",
    },
    {
      sv: "Planera och genomföra utbildning och övning för förtroendevalda och medarbetare.",
      en: "Plan and run training and exercises for elected representatives and staff.",
    },
    {
      sv: "Vara kontaktväg mot länsstyrelsen, polisen och andra aktörer i samverkan.",
      en: "Act as the contact point towards the county administrative board, the police and other actors.",
    },
  ],
  workEnvironments: [
    {
      sv: "Kommun- eller regionförvaltning, i en säkerhets- eller beredskapsfunktion.",
      en: "Municipal or regional administration, in a security or preparedness function.",
    },
    {
      sv: "Kontorsarbete med inslag av platsbesök, övningar och beredskap.",
      en: "Office work with site visits, exercises and on-call elements.",
    },
  ],
  industries: [{ sv: "Offentlig förvaltning.", en: "Public administration." }],
  competencies: [
    { competencyId: "planning", requiredLevel: 4, critical: true },
    { competencyId: "communication", requiredLevel: 4, critical: true },
    { competencyId: "risk_awareness", requiredLevel: 4 },
    { competencyId: "reporting", requiredLevel: 4 },
    { competencyId: "analytical", requiredLevel: 3 },
    { competencyId: "teamwork", requiredLevel: 3 },
    { competencyId: "leadership", requiredLevel: 3 },
    { competencyId: "legal_regulatory", requiredLevel: 3 },
  ],
  // Deliberately none. The title carries no statutory requirement, and listing
  // "erfarenhet från branschen" under a heading reading "Formella krav" would
  // manufacture one. What employers ask for belongs in a job advert.
  regulated: false,
  regulatoryNotes: {
    sv: "Säkerhetssamordnare är inte ett reglerat yrke — titeln kräver varken föreskriven utbildning, godkännande eller förordnande. Den här guiden beskriver rollen som den ser ut i kommuner och regioner, där uppgifterna följer av lag (2006:544). Samma titel förekommer i privata verksamheter, men innehållet varierar mellan arbetsgivare och är inte källbelagt här. Rollen ska inte förväxlas med säkerhetsskyddschef: säkerhetsskyddslagen (2018:585) gäller för säkerhetskänslig verksamhet, och en sådan verksamhetsutövare ska ha en säkerhetsskyddschef om det inte är uppenbart obehövligt (2 kap. 7 §). En organisation kan ha båda funktionerna.",
    en: "Security coordinator is not a regulated profession — the title carries no mandated training, approval or appointment. This guide describes the role as it appears in Swedish municipalities and regions, where the duties follow from Act (2006:544). The same title is used in private organisations, but its content varies between employers and is not source-verified here. It should not be confused with a säkerhetsskyddschef: the Protective Security Act (2018:585) applies to security-sensitive activities, and such an operator must have a säkerhetsskyddschef unless it is obviously unnecessary (chapter 2, section 7). An organisation can have both functions.",
  },
  countries: ["SE"],
  educationPathways: [],
  certifications: ["iso-31000", "iso-22301"],
  previousRoles: ["security-officer", "ordningsvakt", "skyddsvakt"],
  nextRoles: ["security-manager"],
  related: ["security-manager", "risk-manager", "crisis-continuity-manager"],
  recommendedAssessment: "security-career-assessment",
  relatedJobsQuery: "security-coordinator",
  sources: [
    {
      label: {
        sv: "Lag (2006:544) om kommuners och regioners åtgärder inför och vid extraordinära händelser i fredstid och höjd beredskap, 2 kap. 1–2 §§",
        en: "Swedish Act (2006:544) on municipal and regional measures before and during extraordinary events in peacetime and during heightened alert, chapter 2, sections 1–2",
      },
      publisher: "Sveriges riksdag",
      url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2006544-om-kommuners-och-regioners-atgarder_sfs-2006-544/",
      retrieved: "2026-09-08",
    },
    {
      label: {
        sv: "Säkerhetsskyddslag (2018:585), 1 kap. 1 § och 2 kap. 7 §",
        en: "Swedish Protective Security Act (2018:585), chapter 1 section 1 and chapter 2 section 7",
      },
      publisher: "Sveriges riksdag",
      url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/sakerhetsskyddslag-2018585_sfs-2018-585/",
      retrieved: "2026-09-08",
    },
  ],
};
