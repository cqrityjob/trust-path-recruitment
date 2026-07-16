import type { Lang } from "@/i18n/dictionaries";

export type QuestionType = "single" | "multi" | "rating";
type Bi = { sv: string; en: string };
type BiList = { sv: string[]; en: string[] };

export type Question = {
  id: string;
  type: QuestionType;
  topic: Bi;
  prompt: Bi;
  options?: { id: string; label: Bi }[];
  scaleMin?: number;
  scaleMax?: number;
  scaleLabels?: { min: Bi; max: Bi };
};

export const questions: Question[] = [
  { id: "q1", type: "single", topic: { sv: "Motivation", en: "Motivation" },
    prompt: { sv: "Vad drar dig mest till en karriär inom säkerhet?", en: "What draws you most to a career in security?" },
    options: [
      { id: "protect", label: { sv: "Skydda människor och egendom", en: "Protecting people and property" } },
      { id: "problem", label: { sv: "Lösa komplexa problem", en: "Solving complex problems" } },
      { id: "tech", label: { sv: "Arbeta med teknik och system", en: "Working with technology and systems" } },
      { id: "lead", label: { sv: "Leda team och beslut", en: "Leading teams and decisions" } },
    ] },
  { id: "q2", type: "rating", topic: { sv: "Kommunikation", en: "Communication" },
    prompt: { sv: "Hur bekväm är du med att kommunicera tydligt under press?", en: "How comfortable are you communicating clearly under pressure?" },
    scaleMin: 1, scaleMax: 5,
    scaleLabels: { min: { sv: "Inte alls bekväm", en: "Not comfortable" }, max: { sv: "Mycket bekväm", en: "Very comfortable" } } },
  { id: "q3", type: "rating", topic: { sv: "Ledarskap", en: "Leadership" },
    prompt: { sv: "Jag trivs med att ta ansvar för andras arbete.", en: "I enjoy taking responsibility for other people's work." },
    scaleMin: 1, scaleMax: 5,
    scaleLabels: { min: { sv: "Instämmer inte", en: "Strongly disagree" }, max: { sv: "Instämmer helt", en: "Strongly agree" } } },
  { id: "q4", type: "single", topic: { sv: "Konflikthantering", en: "Conflict handling" },
    prompt: { sv: "Hur föredrar du att hantera en upptrappad situation?", en: "How do you prefer to handle an escalating situation?" },
    options: [
      { id: "deesc", label: { sv: "Deeskalera med lugn dialog", en: "De-escalate through calm dialogue" } },
      { id: "protocol", label: { sv: "Följa etablerade protokoll", en: "Follow established protocols" } },
      { id: "delegate", label: { sv: "Koordinera och delegera", en: "Coordinate and delegate" } },
      { id: "act", label: { sv: "Agera direkt och beslutsamt", en: "Act directly and decisively" } },
    ] },
  { id: "q5", type: "rating", topic: { sv: "Analytiskt tänkande", en: "Analytical thinking" },
    prompt: { sv: "Jag gillar att bryta ner problem i mönster och data.", en: "I enjoy breaking problems down into patterns and data." },
    scaleMin: 1, scaleMax: 5,
    scaleLabels: { min: { sv: "Instämmer inte", en: "Strongly disagree" }, max: { sv: "Instämmer helt", en: "Strongly agree" } } },
  { id: "q6", type: "rating", topic: { sv: "Tekniskt intresse", en: "Technical interest" },
    prompt: { sv: "Jag är nyfiken på hur säkerhetssystem fungerar tekniskt.", en: "I'm curious about how security systems work technically." },
    scaleMin: 1, scaleMax: 5,
    scaleLabels: { min: { sv: "Inte alls", en: "Not at all" }, max: { sv: "Mycket nyfiken", en: "Very curious" } } },
  { id: "q7", type: "multi", topic: { sv: "Miljöer", en: "Environments" },
    prompt: { sv: "I vilka miljöer skulle du helst arbeta? (välj upp till tre)", en: "In which environments would you prefer to work? (choose up to three)" },
    options: [
      { id: "office", label: { sv: "Kontor och analysrum", en: "Offices and analysis rooms" } },
      { id: "field", label: { sv: "Ute på fältet", en: "Out in the field" } },
      { id: "datacenter", label: { sv: "Datacenter och kritisk infrastruktur", en: "Data centers and critical infrastructure" } },
      { id: "public", label: { sv: "Publika miljöer och evenemang", en: "Public environments and events" } },
      { id: "corporate", label: { sv: "Företagsmiljöer", en: "Corporate environments" } },
      { id: "gov", label: { sv: "Myndigheter", en: "Government agencies" } },
    ] },
  { id: "q8", type: "rating", topic: { sv: "Riskmedvetenhet", en: "Risk awareness" },
    prompt: { sv: "Jag noterar naturligt potentiella risker i min omgivning.", en: "I naturally notice potential risks in my surroundings." },
    scaleMin: 1, scaleMax: 5,
    scaleLabels: { min: { sv: "Sällan", en: "Rarely" }, max: { sv: "Nästan alltid", en: "Almost always" } } },
  { id: "q9", type: "single", topic: { sv: "Kundservice", en: "Customer service" },
    prompt: { sv: "Hur ser du på att interagera med allmänheten som en del av jobbet?", en: "How do you feel about interacting with the public as part of the job?" },
    options: [
      { id: "core", label: { sv: "Det är en central del jag uppskattar", en: "A core part I truly enjoy" } },
      { id: "ok", label: { sv: "Jag hanterar det bra när det behövs", en: "I handle it well when needed" } },
      { id: "limited", label: { sv: "Helst i begränsad utsträckning", en: "Preferably in limited doses" } },
      { id: "no", label: { sv: "Jag föredrar bakomkulisserna-arbete", en: "I prefer behind-the-scenes work" } },
    ] },
  { id: "q10", type: "single", topic: { sv: "Beslutsfattande", en: "Decision making" },
    prompt: { sv: "Hur fattar du bäst beslut?", en: "How do you make decisions best?" },
    options: [
      { id: "data", label: { sv: "Med data och analys", en: "With data and analysis" } },
      { id: "gut", label: { sv: "Baserat på erfarenhet och intuition", en: "Based on experience and intuition" } },
      { id: "team", label: { sv: "Genom konsensus i team", en: "Through team consensus" } },
      { id: "rules", label: { sv: "Enligt tydliga regler och rutiner", en: "Following clear rules and procedures" } },
    ] },
  { id: "q11", type: "rating", topic: { sv: "Stresstålighet", en: "Stress tolerance" },
    prompt: { sv: "Jag håller mig fokuserad även i pressade situationer.", en: "I stay focused even in high-pressure situations." },
    scaleMin: 1, scaleMax: 5,
    scaleLabels: { min: { sv: "Sällan", en: "Rarely" }, max: { sv: "Konsekvent", en: "Consistently" } } },
  { id: "q12", type: "rating", topic: { sv: "Samarbete", en: "Teamwork" },
    prompt: { sv: "Jag arbetar hellre i team än ensam.", en: "I prefer working in a team over working alone." },
    scaleMin: 1, scaleMax: 5,
    scaleLabels: { min: { sv: "Ensam", en: "Alone" }, max: { sv: "I team", en: "In a team" } } },
  { id: "q13", type: "rating", topic: { sv: "Planering", en: "Planning" },
    prompt: { sv: "Jag tycker om att strukturera projekt över längre tid.", en: "I enjoy structuring projects over longer time horizons." },
    scaleMin: 1, scaleMax: 5,
    scaleLabels: { min: { sv: "Instämmer inte", en: "Strongly disagree" }, max: { sv: "Instämmer helt", en: "Strongly agree" } } },
  { id: "q14", type: "single", topic: { sv: "Lärstil", en: "Learning style" },
    prompt: { sv: "Hur lär du dig helst nya färdigheter?", en: "How do you prefer to learn new skills?" },
    options: [
      { id: "hands", label: { sv: "Praktiskt, genom att göra", en: "Hands-on, by doing" } },
      { id: "read", label: { sv: "Läsa och studera material", en: "Reading and studying material" } },
      { id: "mentor", label: { sv: "Med en mentor eller kollega", en: "With a mentor or colleague" } },
      { id: "course", label: { sv: "Strukturerade kurser och certifikat", en: "Structured courses and certifications" } },
    ] },
  { id: "q15", type: "multi", topic: { sv: "Intresseområden", en: "Areas of interest" },
    prompt: { sv: "Vilka områden intresserar dig mest? (välj upp till fyra)", en: "Which areas interest you the most? (choose up to four)" },
    options: [
      { id: "invest", label: { sv: "Utredning och analys", en: "Investigation and analysis" } },
      { id: "physec", label: { sv: "Fysisk säkerhet", en: "Physical security" } },
      { id: "cyber", label: { sv: "Cybersäkerhet", en: "Cybersecurity" } },
      { id: "compliance", label: { sv: "Regelefterlevnad", en: "Regulatory compliance" } },
      { id: "crisis", label: { sv: "Krisberedskap", en: "Crisis preparedness" } },
      { id: "strategy", label: { sv: "Strategi och ledarskap", en: "Strategy and leadership" } },
    ] },
  { id: "q16", type: "rating", topic: { sv: "Långsiktig ambition", en: "Long-term ambition" },
    prompt: { sv: "Jag vill arbeta mot en specialistroll eller ledarroll på sikt.", en: "I want to work toward a specialist or leadership role over time." },
    scaleMin: 1, scaleMax: 5,
    scaleLabels: { min: { sv: "Osäker", en: "Unsure" }, max: { sv: "Väldigt tydligt mål", en: "Very clear goal" } } },
];

export type CareerMatch = {
  id: string;
  score: number;
  title: Bi;
  why: Bi;
  strengths: BiList;
  develop: BiList;
  education: Bi;
  certifications: BiList;
  nextStep: Bi;
};

export const careerMatches: CareerMatch[] = [
  { id: "security_manager", score: 92,
    title: { sv: "Säkerhetschef", en: "Security Manager" },
    why: { sv: "Din profil visar tydligt intresse för strategiskt tänkande, planering och att leda andra — kärnegenskaper för en säkerhetschef.", en: "Your profile shows a clear interest in strategic thinking, planning and leading others — core qualities for a Security Manager." },
    strengths: { sv: ["Strategiskt tänkande", "Struktur och planering", "Kommunikation i team"], en: ["Strategic thinking", "Structure and planning", "Team communication"] },
    develop: { sv: ["Fördjupning i riskmetodik", "Erfarenhet av budgetansvar"], en: ["Deeper risk methodology", "Budget-ownership experience"] },
    education: { sv: "Eftergymnasial utbildning inom säkerhet, risk eller ledarskap.", en: "Post-secondary education in security, risk or leadership." },
    certifications: { sv: ["CPP", "PSP", "ISO 22301 Lead Implementer"], en: ["CPP", "PSP", "ISO 22301 Lead Implementer"] },
    nextStep: { sv: "Utforska yrkesguiden för säkerhetschef och identifiera en mentor.", en: "Explore the Security Manager profession guide and identify a mentor." } },
  { id: "risk_manager", score: 87,
    title: { sv: "Risk Manager", en: "Risk Manager" },
    why: { sv: "Din analytiska förmåga och riskmedvetenhet gör dig särskilt lämpad för att identifiera och hantera organisatoriska risker.", en: "Your analytical ability and risk awareness make you well-suited to identifying and managing organisational risk." },
    strengths: { sv: ["Analytiskt tänkande", "Riskbedömning", "Långsiktig planering"], en: ["Analytical thinking", "Risk assessment", "Long-term planning"] },
    develop: { sv: ["Kvantitativa metoder", "Regulatorisk expertis"], en: ["Quantitative methods", "Regulatory expertise"] },
    education: { sv: "Akademisk bakgrund inom risk management, ekonomi eller säkerhet.", en: "Academic background in risk management, finance or security." },
    certifications: { sv: ["ISO 31000", "CRISC", "FRM"], en: ["ISO 31000", "CRISC", "FRM"] },
    nextStep: { sv: "Läs mer om riskhantering och sök en junior risk-roll.", en: "Read up on risk management and target a junior risk role." } },
  { id: "police", score: 78,
    title: { sv: "Polis", en: "Police Officer" },
    why: { sv: "Ditt intresse för att skydda samhället, hantera situationer under press och arbeta med tydliga rutiner speglar polisyrkets kärna.", en: "Your interest in protecting communities, handling pressure and following clear procedures reflects the core of police work." },
    strengths: { sv: ["Stresstålighet", "Beslutsfattande under press", "Möten med människor"], en: ["Stress tolerance", "Decision-making under pressure", "Public interaction"] },
    develop: { sv: ["Fysisk träning", "Rättslig grundkunskap"], en: ["Physical training", "Foundational legal knowledge"] },
    education: { sv: "Polisutbildningen (Polismyndigheten).", en: "National police academy programme." },
    certifications: { sv: ["Nationell polisutbildning"], en: ["National police academy"] },
    nextStep: { sv: "Utforska antagningskrav och prova en ride-along om möjligt.", en: "Explore admission requirements and try a ride-along if available." } },
  { id: "security_technician", score: 74,
    title: { sv: "Säkerhetstekniker", en: "Security Technician" },
    why: { sv: "Ditt tekniska intresse och praktiska lärstil passar en roll där du bygger, driftar och utvecklar tekniska säkerhetssystem.", en: "Your technical curiosity and hands-on learning style fit a role building, operating and improving technical security systems." },
    strengths: { sv: ["Tekniskt intresse", "Praktiskt lärande", "Systemtänk"], en: ["Technical interest", "Hands-on learning", "Systems thinking"] },
    develop: { sv: ["Nätverksgrunder", "Certifikat inom passersystem"], en: ["Networking fundamentals", "Access-control certifications"] },
    education: { sv: "Yrkesutbildning inom säkerhetsteknik eller elektronik.", en: "Vocational training in security technology or electronics." },
    certifications: { sv: ["SBSC", "ONVIF-relaterade certifikat"], en: ["Manufacturer certifications", "ONVIF-related credentials"] },
    nextStep: { sv: "Praktisera med en installatör eller genomför en grundkurs i CCTV.", en: "Apprentice with an installer or take an introductory CCTV course." } },
  { id: "aml", score: 69,
    title: { sv: "AML-specialist", en: "AML Specialist" },
    why: { sv: "Din nyfikenhet på mönster, regelefterlevnad och analys skulle komma till nytta i arbete mot finansiell brottslighet.", en: "Your interest in patterns, compliance and analysis translates well to fighting financial crime." },
    strengths: { sv: ["Mönsterigenkänning", "Noggrannhet", "Regelverk"], en: ["Pattern recognition", "Attention to detail", "Regulatory literacy"] },
    develop: { sv: ["Finansmarknadskunskap", "Erfarenhet av transaktionsövervakning"], en: ["Financial-markets literacy", "Transaction-monitoring exposure"] },
    education: { sv: "Utbildning inom ekonomi, juridik eller compliance.", en: "Education in economics, law or compliance." },
    certifications: { sv: ["CAMS", "ICA Diploma"], en: ["CAMS", "ICA Diploma"] },
    nextStep: { sv: "Läs om AML-ramverket och sök en analytikerroll som ingång.", en: "Read up on the AML framework and target an analyst role as an entry point." } },
];

export function pickText(v: Bi, lang: Lang): string { return v[lang]; }
export function pickList(v: BiList, lang: Lang): string[] { return v[lang]; }
