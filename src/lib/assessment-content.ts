import type { Lang } from "@/i18n/dictionaries";

export type QuestionType = "single" | "multi" | "rating";
type Bi = { sv: string; en: string };

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

export function pickText(v: Bi, lang: Lang): string { return v[lang]; }
