// Output B — the Candidate Story.
//
// Seven answers per pattern, in both languages, owner-approved in Delivery B
// revision 3. Deterministic template selection: same pattern, same locale,
// same story, forever.
//
// ── NO LANGUAGE MODEL RUNS HERE ────────────────────────────────────────
//
// Not at completion, not at render time, not ever. The story reads like an
// adviser because the templates are written like an adviser, not because
// anything is improvised. That is a reproducibility decision as much as a
// trust one: a stored report must be re-derivable from its inputs, and text
// that was sampled once cannot be.
//
// ── THE RULES THIS CONTENT MUST OBEY ───────────────────────────────────
//
// Enforced by scripts/career-discovery-v31-check.ts against the rendered
// output, not left to authoring discipline:
//
//   * no numerals anywhere in candidate-facing text;
//   * no dimension names shown to candidates;
//   * no personality claims — "your answers suggest", never "you are";
//   * no deficit language — no "du saknar" / "you lack" / "you struggle with";
//   * frustrations describe conditions, never defects;
//   * the growth edge names something to build, never a flaw;
//   * CP00 gets the same seven answers and the same quality as every pattern.
//
// ── WHY THE SEVEN ANSWERS ARE FROZEN INTO THE SNAPSHOT ─────────────────
//
// Because this file will change. Rewriting every template here must not alter
// one word of a report already issued, so completion renders the story once
// and stores it. Nothing below is read when a historical report is opened.

import type { ResolvedPatternId } from "./patterns";
import type { Locale } from "./version";

/** Bumped whenever any string in this file changes. Stored on every snapshot
 *  so a report always names the templates that produced it.
 *
 *  draft-2: five bare assertions about the candidate were reworded to comply
 *  with the Output B safety rules ("och du är bekväm" -> "och verkar bekväm";
 *  "one default you always return to" -> "one fixed default to fall back on";
 *  "how right you are" -> "how right the analysis is"). No candidate had
 *  received a v3.1 report, but the approved content changed after the first
 *  frozen draft, so the version moves with it. Version discipline is worth
 *  nothing if it only starts once someone is watching.
 *
 *  Deliberately NOT bumped alongside this: the scoring, option matrix,
 *  pattern definition and report schema versions. None of those contracts
 *  changed, and moving them would falsely imply a report scored differently. */
export const STORY_TEMPLATE_VERSION = "v3.1-draft-2" as const;

/** The seven questions, in presentation order. */
export const STORY_QUESTIONS = [
  "howYouWork",
  "givesEnergy",
  "takesEnergy",
  "superpower",
  "growthEdge",
  "whyTheseCareers",
  "whereItLeads",
] as const;

export type StoryQuestion = (typeof STORY_QUESTIONS)[number];

export type StoryAnswers = Readonly<Record<StoryQuestion, string>>;

export interface PatternStory {
  readonly patternId: ResolvedPatternId;
  /** The candidate-facing pattern name. */
  readonly name: string;
  readonly answers: StoryAnswers;
  /** The single sentence a share link may expose. Nothing else is shareable. */
  readonly shareSummary: string;
}

type LocalisedStory = Readonly<Record<Locale, { name: string; share: string } & StoryAnswers>>;

/** Section headings, as the candidate sees them. */
export const STORY_HEADINGS: Readonly<Record<Locale, Record<StoryQuestion, string>>> = {
  sv: {
    howYouWork: "Så arbetar du",
    givesEnergy: "Det här ger dig energi",
    takesEnergy: "Det här tar energi över tid",
    superpower: "Din superkraft",
    growthEdge: "Där du kan växa",
    whyTheseCareers: "Därför passar de här yrkena",
    whereItLeads: "Vart det brukar leda",
  },
  en: {
    howYouWork: "How you work",
    givesEnergy: "What gives you energy",
    takesEnergy: "What slowly drains you",
    superpower: "Your Superpower",
    growthEdge: "Your Growth Edge",
    whyTheseCareers: "Why these careers fit you",
    whereItLeads: "Where it usually leads",
  },
};

const STORIES: Readonly<Record<ResolvedPatternId, LocalisedStory>> = {
  CP00: {
    sv: {
      name: "Bred profil",
      share: "Min säkerhetsprofil: Bred profil — flera lika starka sätt att arbeta.",
      howYouWork:
        "Dina svar visar flera lika starka sätt att arbeta i stället för ett tydligt dominerande. Det är ett resultat i sig, och ett vanligare än man tror. Det brukar betyda att du anpassar dig efter vad situationen kräver snarare än att du har ett givet läge du alltid går tillbaka till.",
      givesEnergy:
        "Omväxling. Miljöer där arbetsdagarna inte ser likadana ut. Att kunna kliva in i olika roller beroende på vad som behövs — vilket ofta är precis vad mindre organisationer och nystartade verksamheter behöver.",
      takesEnergy:
        "Du tappar ofta energi i mycket smala roller där du gör samma sak varje dag, eller i miljöer där du förväntas välja en inriktning innan du hunnit prova något.",
      superpower:
        "Bredd. Andra brukar märka att du kan gå in i flera olika sammanhang och fungera i dem — och att du förstår vad kollegor med helt olika roller faktiskt håller på med.",
      growthEdge:
        "Att välja något att bli djup i. Bredd är en verklig styrka, men de flesta karriärer tar fart först när bredden får något att stå på. Du behöver inte välja slutgiltigt — det räcker att prova en riktning ordentligt.",
      whyTheseCareers:
        "Dina svar pekar inte mot en enda riktning utan mot flera. Det gör att fler vägar står öppna för dig just nu än för de flesta, och att du kan välja utifrån vad som faktiskt lockar snarare än utifrån vad som passar.",
      whereItLeads:
        "För de flesta klarnar bilden genom att göra, inte genom att fundera. Titta på yrkena i dina starkaste riktningar, hitta det som lockar mest, och gör om testet när du har provat något. Ditt mönster blir tydligare med erfarenhet — det är så det brukar gå till.",
    },
    en: {
      name: "Balanced Profile",
      share: "My security profile: Balanced Profile — several equally strong ways of working.",
      howYouWork:
        "Your answers show several equally strong ways of working rather than one that clearly dominates. That's a result in itself, and a more common one than people think. It usually means you adapt to what the situation needs rather than having one fixed default to fall back on.",
      givesEnergy:
        "Variety. Environments where the days don't look the same. Being able to step into different roles depending on what's needed — which is often exactly what smaller organisations and early-stage businesses need.",
      takesEnergy:
        "You may find you lose energy in very narrow roles doing the same thing every day, or in environments that expect you to pick a direction before you've had a chance to try anything.",
      superpower:
        "Range. People tend to notice that you can step into several different settings and function in them — and that you understand what colleagues in quite different roles are actually doing.",
      growthEdge:
        "Choosing something to go deep in. Range is a genuine strength, but most careers take off once it has something to stand on. You don't have to choose permanently — trying one direction properly is enough.",
      whyTheseCareers:
        "Your answers point toward several directions rather than one. That leaves more paths open to you right now than most people have, and lets you choose by what actually appeals rather than by what fits.",
      whereItLeads:
        "For most people the picture clears through doing rather than through thinking. Look at the professions in your strongest directions, find the one that pulls hardest, and retake the assessment once you've tried something. Your pattern gets clearer with experience — that's how it normally goes.",
    },
  },

  CP01: {
    sv: {
      name: "Operativ trygghetsskapare",
      share: "Min säkerhetsprofil: Operativ trygghetsskapare — trygg nära verksamheten.",
      howYouWork:
        "Dina svar tyder på att du fungerar bäst när du är på plats och kan agera själv. Du verkar lägga märke till det som avviker innan andra gör det, och verkar bekväm med att fatta beslut inom ditt eget ansvar utan att först fråga någon.",
      givesEnergy:
        "När något faktiskt händer och du är den som är där. När du får ansvara för en plats och känna den. När dagen slutar med att du vet att inget missades.",
      takesEnergy:
        "Du tappar ofta energi när arbetet blir långa perioder av planering utan att något syns hända, när varje beslut måste stämmas av innan du får agera, eller när du hamnar långt från det som pågår.",
      superpower:
        "Att vara närvarande på riktigt. Andra brukar märka att du har koll på läget utan att göra något nummer av det, och att du gör något åt saker i stället för att rapportera vidare.",
      growthEdge:
        "Att arbeta genom andra. Ditt mönster visar stark självständighet — nästa nivå för många med den profilen handlar om att få ett helt lag att fungera lika bra som man själv gör. Börja med att visa någon nyare hur du tänker.",
      whyTheseCareers:
        "Du valde att agera direkt när en kontroll hade hoppats över, och du beskrev en arbetsmiljö nära den dagliga verksamheten som mest naturlig. Det är precis så arbetet ser ut i de här rollerna: någon behöver ha överblick över en plats och kunna hantera det som händer där.",
      whereItLeads:
        "Många börjar som väktare och går vidare till senior väktare eller mer krävande objekt som datacenter och samhällsviktiga anläggningar. Därifrån delar sig vägen: arbetsledning om du vill få andra att fungera, teknik om systemen lockar, eller risk och beredskap om det förebyggande arbetet gör det.",
    },
    en: {
      name: "Operational Protector",
      share: "My security profile: Operational Protector — steady close to operations.",
      howYouWork:
        "Your answers suggest you work best on site, where you can act yourself. You seem to notice what's out of place before others do, and you're comfortable deciding within your own responsibility without asking first.",
      givesEnergy:
        "When something actually happens and you're the one there. Having a place to be responsible for and getting to know it properly. Ending the day knowing nothing was missed.",
      takesEnergy:
        "You may find you lose energy when work becomes long stretches of planning with nothing visible happening, when every decision has to be cleared before you can act, or when you end up far from what's going on.",
      superpower:
        "Being genuinely present. People tend to notice that you have a handle on things without making a fuss about it, and that you deal with things rather than passing them on.",
      growthEdge:
        "Working through other people. Your pattern shows strong independence — for many with that profile, the next level is getting a whole team to work as well as you do alone. Start by showing someone newer how you think.",
      whyTheseCareers:
        "You chose to act directly when a control had been skipped, and you described a working environment close to day-to-day operations as the most natural. That's exactly what these roles look like: someone needs to hold the overview of a place and handle what happens there.",
      whereItLeads:
        "Many start as a security officer and move to senior officer or to more demanding sites such as data centres and critical facilities. From there the path forks: team leadership if you want to make others work well, technology if the systems pull at you, or risk and preparedness if the preventive side does.",
    },
  },

  CP02: {
    sv: {
      name: "Samhällsskyddande insatsperson",
      share: "Min säkerhetsprofil: Samhällsskyddande insatsperson — lugn i laddade lägen.",
      howYouWork:
        "Dina svar tyder på att du behåller omdömet när stämningen blir spänd, och att du går in i situationer i stället för att undvika dem. Gränssättning och omtanke verkar inte vara motsatser för dig.",
      givesEnergy:
        "När du märker att din närvaro faktiskt gjorde skillnad för någon. Att arbeta tillsammans med en kollega du litar på. Dagar där du inte vet exakt vad som kommer.",
      takesEnergy:
        "Du tappar ofta energi när arbetet blir ensamt och utan människor, när ingenting händer under långa perioder, eller när du ser en situation som behöver hanteras och inte får göra något åt den.",
      superpower:
        "Att kunna möta människor som har en dålig dag utan att det blir personligt. De flesta backar när det blir spänt — andra brukar märka att du inte gör det, och att du gör det utan att trappa upp.",
      growthEdge:
        "Att ta ansvar för mer än din egen insats. Många med ditt mönster växer naturligt in i att leda ett arbetslag — inte genom att bli en annan person, utan genom att göra samma bedömningar för fler än sig själv.",
      whyTheseCareers:
        "Du valde att prata direkt med den som ansvarade när något gått fel, och du beskrev arbete med människor som mest meningsfullt. De här rollerna handlar nästan alltid om just det: att möta människor i lägen där de inte är som bäst.",
      whereItLeads:
        "De flesta yrken i den här riktningen har en formell väg in med krav på utbildning, hälsa och bakgrund — krav som det här testet varken mäter eller kan uttala sig om. Om riktningen lockar är nästa steg att titta på de faktiska kraven. Därifrån finns operativ arbetsledning, utredning om det är pusslet som intresserar, eller beredskap och krishantering.",
    },
    en: {
      name: "Public Safety Responder",
      share: "My security profile: Public Safety Responder — composed when things get charged.",
      howYouWork:
        "Your answers suggest you keep your judgement when the atmosphere tightens, and that you move toward situations rather than away from them. Setting boundaries and caring about people don't seem to be opposites for you.",
      givesEnergy:
        "Noticing that your being there actually made a difference to someone. Working alongside a colleague you trust. Days where you don't know exactly what's coming.",
      takesEnergy:
        "You may find you lose energy when work becomes solitary and without people, when nothing happens for long stretches, or when you see a situation that needs handling and aren't allowed to act.",
      superpower:
        "Being able to meet people having a bad day without taking it personally. Most people step back when things get tense — others tend to notice that you don't, and that you manage it without escalating.",
      growthEdge:
        "Taking responsibility for more than your own contribution. Many with your pattern grow naturally into leading a team — not by becoming a different person, but by making the same judgements on behalf of more than themselves.",
      whyTheseCareers:
        "You chose to speak directly to the person responsible when something had gone wrong, and you described work with people as the most meaningful. These roles are almost always about exactly that: meeting people at moments when they're not at their best.",
      whereItLeads:
        "Most professions in this direction have a formal route in, with requirements covering training, health and background — requirements this assessment neither measures nor can speak to. If the direction appeals, the next step is to look at what they actually are. From there: operational team leadership, investigation if the puzzle interests you, or preparedness and crisis work.",
    },
  },

  CP03: {
    sv: {
      name: "Utredande analytiker",
      share: "Min säkerhetsprofil: Utredande analytiker — vill veta vad som faktiskt hände.",
      howYouWork:
        "Dina svar tyder på att du går igenom material, jämför uppgifter och drar slutsatser av det som faktiskt går att belägga. Du verkar också beredd att stå för din bedömning när den väl är klar.",
      givesEnergy:
        "När något inte går ihop och du får tid att ta reda på varför. När bitarna till slut faller på plats. Ärenden där svaret inte är givet på förhand.",
      takesEnergy:
        "Du tappar ofta energi när du pressas till en slutsats innan materialet bär den, när du avbryts precis när du kommit in i något, eller när svaret redan är bestämt och din uppgift bara är att skriva ned det.",
      superpower:
        "Att inte släppa taget. Andra brukar märka att du fortsätter ställa frågan när alla andra nöjt sig — och att du har rätt tillräckligt ofta för att det ska vara värt besväret.",
      growthEdge:
        "Att få dina slutsatser att landa hos andra. En utredning är bara värd något om någon agerar på den, och många med ditt mönster upptäcker att den svåraste delen inte är analysen utan att förklara den för någon som inte satt med materialet.",
      whyTheseCareers:
        "Du prioriterade att ta reda på vad som faktiskt hänt framför att gå vidare, och du valde att gå igenom underlaget innan du ändrade din bedömning. Det är själva arbetssättet i utredande roller.",
      whereItLeads:
        "Vanligt är att börja med enklare ärenden och successivt ta mer komplexa. Finansiell brottsprevention är just nu den bredaste ingången och tar emot många utan tidigare säkerhetsbakgrund. Längre fram: specialisering, rådgivande arbete, eller cyberutredning.",
    },
    en: {
      name: "Investigative Thinker",
      share: "My security profile: Investigative Thinker — wants to know what actually happened.",
      howYouWork:
        "Your answers suggest you go through material, compare accounts and draw conclusions from what can actually be established. You also seem willing to stand behind your judgement once it's formed.",
      givesEnergy:
        "When something doesn't add up and you get time to find out why. When the pieces finally fall into place. Cases where the answer isn't given in advance.",
      takesEnergy:
        "You may find you lose energy when you're pushed to a conclusion before the material supports it, when you're interrupted just as you get into something, or when the answer is already decided and your job is just to write it down.",
      superpower:
        "Not letting go. People tend to notice that you keep asking the question after everyone else has settled — and that you're right often enough to make it worth the trouble.",
      growthEdge:
        "Making your conclusions land with other people. An investigation is only worth something if someone acts on it, and many with your pattern find the hard part isn't the analysis but explaining it to someone who didn't sit with the material.",
      whyTheseCareers:
        "You prioritised finding out what actually happened over moving on, and you chose to work through new information before changing your assessment. That is the working method in investigative roles.",
      whereItLeads:
        "The common route is starting with simpler cases and taking on more complex ones. Financial crime prevention is currently the widest way in and takes many people with no prior security background. Later: specialisation, advisory work, or cyber investigation.",
    },
  },

  CP04: {
    sv: {
      name: "Teknisk problemlösare",
      share: "Min säkerhetsprofil: Teknisk problemlösare — vill förstå hur det fungerar.",
      howYouWork:
        "Dina svar tyder på att du vill förstå hur något fungerar, och att ett fel är en fråga snarare än ett hinder. Du verkar lära dig nytt löpande för att du vill, inte för att någon säger till.",
      givesEnergy:
        "När något krånglat länge och du till slut hittar varför. Att få händerna i ett system. Ny teknik som du får sätta dig in i ordentligt.",
      takesEnergy:
        "Du tappar ofta energi när tekniken står stilla och det inte finns något nytt att lära, när du hålls borta från systemet du ansvarar för, eller när dagarna fylls av möten i stället för arbete.",
      superpower:
        "Att inte ge upp inför något som inte fungerar. Andra brukar märka att du fortsätter när felet är svårfångat — och att du sedan kan förklara vad som var fel utan att göra det obegripligt.",
      growthEdge:
        "Att göra tekniken begriplig för dem som ska betala för den. Många tekniker som växer vidare gör det inte genom mer teknik, utan genom att kunna förklara varför en lösning är värd pengarna för någon som inte kan tekniken.",
      whyTheseCareers:
        "Du valde att ta reda på varför ett system inte fungerade framför tre andra uppgifter, och du beskrev en arbetsmiljö nära system och teknik som mest naturlig. Det är kärnan i de här rollerna.",
      whereItLeads:
        "En av branschens tydligaste vägar: tekniker, ingenjör, teknisk chef — och praktisk erfarenhet väger här tyngre än formell examen. Vidare mot cybersäkerhet om det lockar att försvara system i drift, eller mot rådgivning via design och kravställning.",
    },
    en: {
      name: "Technical Problem Solver",
      share: "My security profile: Technical Problem Solver — wants to know how it works.",
      howYouWork:
        "Your answers suggest you want to understand how something works, and that a fault is a question rather than an obstacle. You seem to learn new things continuously because you want to, not because you're told to.",
      givesEnergy:
        "When something has been playing up for ages and you finally find why. Getting your hands into a system. New technology you get to properly understand.",
      takesEnergy:
        "You may find you lose energy when the technology stands still and there's nothing new to learn, when you're kept away from the system you're responsible for, or when the days fill with meetings instead of work.",
      superpower:
        "Not giving up on something that isn't working. People tend to notice that you keep going when the fault is elusive — and that you can then explain what was wrong without making it incomprehensible.",
      growthEdge:
        "Making the technology make sense to the people paying for it. Many technicians who grow further do it not through more technology, but by being able to explain why a solution is worth the money to someone who doesn't know the technology.",
      whyTheseCareers:
        "You chose working out why a system was failing over three other tasks, and you described an environment close to systems and technology as the most natural. That's the core of these roles.",
      whereItLeads:
        "One of the clearest ladders in the sector: technician, engineer, technical manager — and practical experience counts for more here than a formal degree. Onward into cyber security if defending live systems appeals, or into advisory work through design and specification.",
    },
  },

  CP05: {
    sv: {
      name: "Risk- och kontinuitetsplanerare",
      share: "Min säkerhetsprofil: Risk- och kontinuitetsplanerare — ser vad som kan gå fel.",
      howYouWork:
        "Dina svar tyder på att du ser konsekvenser flera steg bort och vill omsätta den bilden i något konkret — en plan, en rutin, en övning. Du verkar också veta att den bara är värd något om den fungerar den dag den behövs.",
      givesEnergy:
        "När en övning avslöjar något ingen tänkt på. Att bygga något som håller även när du inte är där. Verksamheter där beredskap tas på allvar.",
      takesEnergy:
        "Du tappar ofta energi i verksamheter som bara släcker bränder och aldrig hinner förbereda sig, när en plan du arbetat med ställs i en hylla, eller när besluten aldrig sträcker sig längre än till nästa kvartal.",
      superpower:
        "Att se runt hörnet. Andra brukar märka att du ställer frågan om vad som händer om något inte fungerar innan det behövs — och att du har ett svar förberett när det väl gör det.",
      growthEdge:
        "Att få andra att prioritera det du ser. Risk- och kontinuitetsarbete misslyckas sällan på analysen och ofta på förankringen. Nästa nivå handlar om att äga frågan i organisationen, inte bara att äga planen.",
      whyTheseCareers:
        "Du valde att bygga bort ett återkommande problem framför att lösa det varje gång, och du prioriterade att bedöma om det kunde hända igen och vad det skulle innebära. Det är exakt vad rollerna går ut på.",
      whereItLeads:
        "Analytiker, specialist, ansvarig — en tydlig trappa inom risk och kontinuitet. Vidare mot säkerhetsledning för hela verksamheten, mot rådgivning, eller mot regelefterlevnad där kraven kommer utifrån.",
    },
    en: {
      name: "Risk & Resilience Planner",
      share: "My security profile: Risk & Resilience Planner — sees what could go wrong.",
      howYouWork:
        "Your answers suggest you see consequences several steps out and want to turn that picture into something concrete — a plan, a procedure, an exercise. You also seem to know it's only worth something if it works on the day it's needed.",
      givesEnergy:
        "When an exercise reveals something nobody had thought of. Building something that holds even when you're not there. Organisations that take preparedness seriously.",
      takesEnergy:
        "You may find you lose energy in organisations that only firefight and never get to prepare, when a plan you worked on ends up on a shelf, or when decisions never reach beyond the next quarter.",
      superpower:
        "Seeing round corners. People tend to notice that you ask what happens if something doesn't work before it's needed — and that you have an answer ready when it is.",
      growthEdge:
        "Getting other people to prioritise what you can see. Risk and continuity work rarely fails on the analysis and often fails on the buy-in. The next level is owning the question in the organisation, not just owning the plan.",
      whyTheseCareers:
        "You chose to design out a recurring problem rather than solve it each time, and you prioritised judging whether it could happen again and what that would mean. That is exactly what these roles do.",
      whereItLeads:
        "Analyst, specialist, manager — a clear ladder within risk and continuity. Onward into enterprise security leadership, into advisory work, or into compliance where the requirements come from outside.",
    },
  },

  CP06: {
    sv: {
      name: "Regelefterlevnadsspecialist",
      share: "Min säkerhetsprofil: Regelefterlevnadsspecialist — håller ordning och står fast.",
      howYouWork:
        "Dina svar tyder på att du håller ordning och spårbarhet, men det som utmärker ditt mönster är att du också verkar klara det obekväma — att säga ifrån, eskalera och stå kvar vid en bedömning när det finns press att göra annorlunda.",
      givesEnergy:
        "När din bedömning faktiskt avgör något. Tydliga krav och tydliga eskaleringsvägar. Att veta att det du gjort går att följa i efterhand.",
      takesEnergy:
        "Du tappar ofta energi när det är otydligt vad som faktiskt gäller, när du blir överkörd utan att få veta varför, eller när dokumentationen är så slarvig att ingen kan följa vad som hänt.",
      superpower:
        "Att stå kvar. Andra brukar märka att du inte viker dig när någon tycker att en bedömning är obekväm — och att du gör det sakligt i stället för att göra det till en konflikt.",
      growthEdge:
        "Att gräva djupare i de svåra ärendena. Många i den här riktningen växer genom att gå från att tillämpa reglerna till att förstå mönstren bakom det de granskar — det är där arbetet blir riktigt intressant och också bäst betalt.",
      whyTheseCareers:
        "Du valde att rapportera och dokumentera enligt rutin när en kontroll hoppats över, och du beskrev ordning och spårbarhet som något du själv söker upp. De här rollerna bygger på båda delarna, plus förmågan att stå fast.",
      whereItLeads:
        "KYC, AML-analytiker, AML-specialist — en väl upptrampad väg med stark efterfrågan, och en av de mest öppna ingångarna i branschen för den som byter bana. Certifieringar är ett konkret nästa steg. Vidare mot utredning när ärendena blir komplexa, eller mot risk.",
    },
    en: {
      name: "Compliance Guardian",
      share: "My security profile: Compliance Guardian — keeps things in order and holds firm.",
      howYouWork:
        "Your answers suggest you keep things ordered and traceable, but what marks out your pattern is that you also seem able to handle the uncomfortable part — saying no, escalating, and holding a position when there's pressure to do otherwise.",
      givesEnergy:
        "When your judgement actually decides something. Clear requirements and clear escalation paths. Knowing that what you did can be traced afterwards.",
      takesEnergy:
        "You may find you lose energy when it's unclear what actually applies, when you're overruled without being told why, or when the record is so careless that nobody can trace what happened.",
      superpower:
        "Holding your ground. People tend to notice that you don't fold when someone finds a judgement inconvenient — and that you do it matter-of-factly rather than turning it into a fight.",
      growthEdge:
        "Digging deeper into the hard cases. Many in this direction grow by moving from applying the rules to understanding the patterns behind what they're reviewing — that's where the work gets genuinely interesting, and where it pays best.",
      whyTheseCareers:
        "You chose to report and document according to procedure when a control had been skipped, and you described order and traceability as something you seek out yourself. These roles are built on both, plus the ability to hold firm.",
      whereItLeads:
        "KYC, AML analyst, AML specialist — a well-worn path with strong demand, and one of the most open ways into the sector for anyone changing career. Certification is a concrete next step. Onward into investigation as cases get complex, or into risk.",
    },
  },

  CP07: {
    sv: {
      name: "Samordnande kraft",
      share: "Min säkerhetsprofil: Samordnande kraft — får människor att dra åt samma håll.",
      howYouWork:
        "Dina svar tyder på att du samlar dem som berörs i stället för att lösa saker ensam, och att du kan förklara vad som behöver göras så att andra förstår varför. Du verkar inte nöja dig med att alla pratat — du vill att det leder någonstans.",
      givesEnergy:
        "När en grupp som drog åt olika håll börjar dra åt samma. När någon du hjälpt tar ett steg framåt. Arbete som spänner över flera funktioner.",
      takesEnergy:
        "Du tappar ofta energi under långa perioder ensam med egna uppgifter, i möten som inte leder någonstans, eller när du har ansvar för ett resultat men inte får involvera de människor som behövs för att nå dit.",
      superpower:
        "Att få saker att hända mellan människor. Andra brukar märka att det börjar röra på sig när du är med — inte för att du tar över, utan för att du får alla att veta vad som gäller.",
      growthEdge:
        "Att lyfta blicken från uppdraget till helheten. Nästa nivå handlar mindre om att samordna bättre och mer om att avgöra vad som borde samordnas alls — vilket kräver att man ser hela verksamheten, inte bara sitt eget uppdrag.",
      whyTheseCareers:
        "Du valde att samla de berörda och driva fram en lösning tillsammans, och du beskrev ett team med gemensamma mål som den mest naturliga arbetsmiljön. Säkerhetsarbete fungerar så: nästan inget säkerhetsproblem ägs av en enda funktion.",
      whereItLeads:
        "Den tydligaste bryggan i branschen: operativ roll, arbetsledare, samordnare, säkerhetsansvarig. Vidare mot strategisk säkerhetsledning när uppdraget växer, eller mot risk och kontinuitet om planeringen lockar.",
    },
    en: {
      name: "Collaborative Coordinator",
      share: "My security profile: Collaborative Coordinator — gets people pulling together.",
      howYouWork:
        "Your answers suggest you gather the people affected rather than solving things alone, and that you can explain what needs doing so others understand why. You don't seem satisfied that everyone talked — you want it to lead somewhere.",
      givesEnergy:
        "When a group pulling in different directions starts pulling the same way. When someone you helped moves forward. Work that spans several functions.",
      takesEnergy:
        "You may find you lose energy during long stretches alone with your own tasks, in meetings that lead nowhere, or when you're responsible for a result but not allowed to involve the people needed to reach it.",
      superpower:
        "Making things happen between people. Others tend to notice that things start moving when you're involved — not because you take over, but because you get everyone clear on what applies.",
      growthEdge:
        "Lifting your view from the task to the whole. The next level is less about coordinating better and more about deciding what should be coordinated at all — which means seeing the whole organisation, not just your own remit.",
      whyTheseCareers:
        "You chose to bring the affected people together and drive it to a resolution, and you described a team with shared goals as the most natural environment. Security work runs on that: almost no security problem is owned by a single function.",
      whereItLeads:
        "The clearest bridge in the sector: operational role, team leader, coordinator, security lead. Onward into strategic security leadership as the remit grows, or into risk and continuity if the planning side appeals.",
    },
  },

  CP08: {
    sv: {
      name: "Strategisk säkerhetsledare",
      share: "Min säkerhetsprofil: Strategisk säkerhetsledare — ser helheten och tar beslut.",
      howYouWork:
        "Dina svar tyder på att du ser hur beslut hänger ihop över tid och mellan avdelningar, och att du är bekväm med att välja väg även när underlaget inte är komplett — vilket det sällan är på den nivån.",
      givesEnergy:
        "När en riktning du satt börjar synas i hur andra arbetar. Uppdrag som spänner över hela verksamheten. Att få bestämma, och stå för det.",
      takesEnergy:
        "Du tappar ofta energi när du hålls kvar på uppgiftsnivå fast du ser hela bilden, när beslut fastnar i processer utan att någon äger dem, eller när du får ansvar men inte mandat.",
      superpower:
        "Att kunna bestämma utan fullständigt underlag. Andra brukar märka att du väljer väg när alla andra väntar på mer information — och att du kan förklara varför du valde som du gjorde.",
      growthEdge:
        "Att få andra att agera på det du ser. På den här nivån är det sällan kunskapen som är begränsningen, utan om ledningen faktiskt gör något. Det avgörs av hur du lägger fram saken, inte av hur rätt du har.",
      whyTheseCareers:
        "Du valde att bestämma hur arbetet skulle gå vidare och ta ansvar för beslutet, och du beskrev långsiktighet och helhetsperspektiv som naturligt. De här rollerna handlar om just det: att säkerhet blir en fråga för hela verksamheten.",
      whereItLeads:
        "Det här är nästan alltid ett mönster man växer in i, oftast via operativt arbete, samordning eller risk. Ser du det här tidigt i karriären är det en riktning att bygga mot snarare än ett steg att ta nu — vägen dit går via bredare ansvar, formell ledarskapsutbildning och tid i verksamheten.",
    },
    en: {
      name: "Strategic Security Leader",
      share: "My security profile: Strategic Security Leader — sees the whole picture.",
      howYouWork:
        "Your answers suggest you see how decisions connect over time and across departments, and that you're comfortable choosing a direction even when the information isn't complete — which at that level it rarely is.",
      givesEnergy:
        "When a direction you set starts showing up in how other people work. Remits that span the whole organisation. Getting to decide, and standing behind it.",
      takesEnergy:
        "You may find you lose energy when you're kept at task level despite seeing the whole picture, when decisions get stuck in process with nobody owning them, or when you're given responsibility without mandate.",
      superpower:
        "Being able to decide without complete information. People tend to notice that you choose a direction while everyone else is waiting for more — and that you can explain why you chose as you did.",
      growthEdge:
        "Getting others to act on what you can see. At this level the constraint is rarely what you know, it's whether the leadership does anything. That's decided by how the case is put, not by how right the analysis is.",
      whyTheseCareers:
        "You chose to decide how the work would proceed and take responsibility for the decision, and you described long-term thinking and a whole-organisation view as natural. These roles are about exactly that: security becoming a question for the whole business.",
      whereItLeads:
        "This is almost always a pattern you grow into, usually through operational work, coordination or risk. If you're seeing it early in your career, it's a direction to build toward rather than a step to take now — the route runs through broader responsibility, formal leadership education and time in the business.",
    },
  },

  CP09: {
    sv: {
      name: "Betrodd säkerhetsrådgivare",
      share: "Min säkerhetsprofil: Betrodd säkerhetsrådgivare — gör det svåra begripligt.",
      howYouWork:
        "Dina svar tyder på att du kan ta något komplext och göra det begripligt utan att förenkla bort det som spelar roll. Du verkar tänka längre än den enskilda frågan — den som ska följa ett råd behöver förstå varför.",
      givesEnergy:
        "När någon fattar ett bättre beslut för att du förklarade något väl. Nya verksamheter och nya frågor. Ämnesdjup som du får fortsätta bygga på.",
      takesEnergy:
        "Du tappar ofta energi när du ska leverera ett svar utan att få förstå sammanhanget först, när det blir samma leverans om och om igen, eller när råd du gett aldrig leder till något.",
      superpower:
        "Att göra det svåra begripligt utan att göra det fel. Andra brukar märka att de förstår något efter att ha pratat med dig som de inte förstod innan — och att förenklingen höll.",
      growthEdge:
        "Att lämna efter dig något som håller. Rådgivning som bara finns i huvudet på rådgivaren försvinner när uppdraget tar slut. Nästa nivå handlar om att bygga något verksamheten kan använda själv.",
      whyTheseCareers:
        "Du valde att ändra din bedömning och förklara varför när ny information kom, och du beskrev det som meningsfullt när något fungerar bättre än det gjorde. Rådgivande arbete lever på just den kombinationen.",
      whereItLeads:
        "Rådgivning byggs nästan alltid ovanpå ett ämnesdjup — teknik, utredning, risk eller cyber. Har du inte det ännu är specialiseringen första steget och rådgivningen kommer sedan. Därifrån: djupare specialisering, eller ledande roller om du hellre bestämmer än råder.",
    },
    en: {
      name: "Trusted Security Adviser",
      share: "My security profile: Trusted Security Adviser — makes the difficult understandable.",
      howYouWork:
        "Your answers suggest you can take something complex and make it understandable without simplifying away what matters. You seem to think beyond the immediate question — whoever has to follow advice needs to understand why.",
      givesEnergy:
        "When someone makes a better decision because you explained something well. New organisations and new questions. Subject depth you get to keep building.",
      takesEnergy:
        "You may find you lose energy when you're expected to deliver an answer without understanding the context first, when it becomes the same delivery over and over, or when advice you gave never leads anywhere.",
      superpower:
        "Making the difficult understandable without making it wrong. People tend to notice they understand something after talking to you that they didn't before — and that the simplification held.",
      growthEdge:
        "Leaving something behind that lasts. Advice that only exists in the adviser's head disappears when the engagement ends. The next level is building something the organisation can use on its own.",
      whyTheseCareers:
        "You chose to change your assessment and explain why when new information arrived, and you described it as meaningful when something works better than it did. Advisory work runs on exactly that combination.",
      whereItLeads:
        "Advisory work is almost always built on top of subject depth — technology, investigation, risk or cyber. If you don't have that yet, the specialism comes first and the advisory role follows. From there: deeper specialisation, or leading roles if you'd rather decide than advise.",
    },
  },

  CP10: {
    sv: {
      name: "Digital systemförsvarare",
      share: "Min säkerhetsprofil: Digital systemförsvarare — lugn när larmet går.",
      howYouWork:
        "Dina svar tyder på att du kombinerar tekniskt intresse med uppmärksamhet på vad som kan gå fel — och med förmågan att hålla huvudet kallt när larmet faktiskt går. Det är den kombinationen som skiljer övervakningsarbete från teknikarbete i allmänhet.",
      givesEnergy:
        "När ett larm visar sig vara något på riktigt och du får följa spåret. System som är i drift och faktiskt betyder något. Ett område där det alltid finns mer att lära.",
      takesEnergy:
        "Du tappar ofta energi i miljöer där ingenting förändras, när larm efter larm ska kvitteras utan tid att ta reda på vad som låg bakom, eller när du hålls borta från den tekniska detaljen.",
      superpower:
        "Att vara lugn och nyfiken samtidigt. De flesta är antingen tekniskt intresserade eller stabila under press — andra brukar märka att du är båda, och det är en ovanligare kombination än den låter.",
      growthEdge:
        "Att översätta teknisk risk till något verksamheten kan agera på. Det är den vanligaste flaskhalsen i cybersäkerhet, och den som klarar det blir snabbt svår att ersätta.",
      whyTheseCareers:
        "Du valde att ta reda på vad som faktiskt hänt efter en löst incident, och du beskrev system och teknik som en naturlig arbetsmiljö. Övervakning och incidenthantering bygger på precis den kombinationen.",
      whereItLeads:
        "Från första linjens övervakning vidare till specialisering — incidenthantering, hotunderrättelse eller styrning och regelefterlevnad. Cyber är ett av de områden där vägen in är mest öppen för den som är villig att lära sig, oavsett bakgrund, och certifiering är den vanliga ingångsbiljetten.",
    },
    en: {
      name: "Digital Systems Defender",
      share: "My security profile: Digital Systems Defender — steady when the alarm goes off.",
      howYouWork:
        "Your answers suggest you combine technical interest with attention to what can go wrong — and with the ability to stay level when the alarm actually goes off. That combination is what separates monitoring work from technology work in general.",
      givesEnergy:
        "When an alert turns out to be something real and you get to follow the trail. Systems that are live and actually matter. A field where there's always more to learn.",
      takesEnergy:
        "You may find you lose energy in environments where nothing changes, when alert after alert has to be cleared with no time to find out what was behind them, or when you're kept away from the technical detail.",
      superpower:
        "Being calm and curious at the same time. Most people are either technically interested or steady under pressure — others tend to notice you're both, and that's a rarer combination than it sounds.",
      growthEdge:
        "Translating technical risk into something the business can act on. It's the most common bottleneck in cyber security, and anyone who manages it quickly becomes hard to replace.",
      whyTheseCareers:
        "You chose to find out what had actually happened after an incident was resolved, and you described systems and technology as a natural environment. Monitoring and incident work are built on exactly that combination.",
      whereItLeads:
        "From first-line monitoring onward into specialisation — incident response, threat intelligence, or governance and compliance. Cyber is one of the areas where the way in is most open to anyone willing to learn, whatever their background, and certification is the usual ticket in.",
    },
  },
};

/**
 * Render the seven answers for a pattern in one locale.
 *
 * Pure lookup. No interpolation of scores, no conditional phrasing on
 * numbers, no generation. The result is frozen into the snapshot by the
 * completion orchestration and never recomputed.
 */
export function buildPatternStory(patternId: ResolvedPatternId, locale: Locale): PatternStory {
  const s = STORIES[patternId][locale];
  return {
    patternId,
    name: s.name,
    shareSummary: s.share,
    answers: {
      howYouWork: s.howYouWork,
      givesEnergy: s.givesEnergy,
      takesEnergy: s.takesEnergy,
      superpower: s.superpower,
      growthEdge: s.growthEdge,
      whyTheseCareers: s.whyTheseCareers,
      whereItLeads: s.whereItLeads,
    },
  };
}

/** Every pattern that has a story. Used by the guard script to prove there
 *  are no gaps rather than discovering one at render time. */
export const STORY_PATTERN_IDS = Object.keys(STORIES) as ResolvedPatternId[];
