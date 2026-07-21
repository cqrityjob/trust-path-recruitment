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

// Public Assessment v2.0. Redesigned per the approved CQrityjob Assessment
// DNA (docs/assessment-science/) and Question Library (docs/question-library/)
// frameworks. Each question's authoring rationale, competency/dimension
// mapping, evidence-signal intent, known limitations, and version metadata
// are documented in docs/job-intelligence/public-assessment-v2-questions.md
// -- this file intentionally carries only the candidate-facing content, per
// Question Library Document 04 ("do not expose internal scoring logic to
// candidates").
export const questions: Question[] = [
  {
    id: "q1",
    type: "single",
    topic: { sv: "Tillförlitlighet", en: "Reliability" },
    prompt: {
      sv: "Tänk på återkommande uppgifter du ansvarar för – kontroller, loggar, uppföljningar. Vilket alternativ beskriver bäst ditt faktiska mönster, inte din avsikt?",
      en: "Think about routine tasks you're responsible for — checks, logs, follow-ups. Which best describes your actual pattern, not your intention?",
    },
    options: [
      {
        id: "always",
        label: {
          sv: "Jag slutför dem fullt ut, varje gång, även när ingen skulle märka om jag hoppade över en",
          en: "I complete them fully, every time, even when no one would notice if I skipped one",
        },
      },
      {
        id: "mostly",
        label: {
          sv: "Jag slutför dem nästan alltid, med enstaka undantag vid hög arbetsbelastning",
          en: "I complete them almost every time, with rare lapses under heavy workload",
        },
      },
      {
        id: "variable",
        label: {
          sv: "Det beror mycket på hur upptagen eller motiverad jag är just den dagen",
          en: "It depends a lot on how busy or motivated I am that day",
        },
      },
      {
        id: "deprioritize",
        label: {
          sv: "Rutinuppgifter är oftast det första jag nedprioriterar när något annat dyker upp",
          en: "Routine tasks are usually the first thing I deprioritize when something else comes up",
        },
      },
    ],
  },

  {
    id: "q2",
    type: "single",
    topic: { sv: "Integritet i vardagen", en: "Everyday integrity" },
    prompt: {
      sv: "Du märker att en kollega du litar på tar en liten, vanlig genväg som formellt bryter mot en mindre regel men aldrig orsakat problem. Ingen annan har märkt det. Vad gör du?",
      en: "You notice a colleague you trust taking a small, common shortcut that technically breaks a minor rule but has never caused a problem. No one else has noticed. What do you do?",
    },
    options: [
      {
        id: "raise_privately",
        label: {
          sv: "Tar upp det direkt med kollegan först",
          en: "Raise it privately with the colleague first",
        },
      },
      {
        id: "follow_procedure",
        label: {
          sv: "Rapporterar det genom rätt kanal, även om det är litet",
          en: "Report it through the proper channel, even though it's minor",
        },
      },
      {
        id: "let_it_go",
        label: {
          sv: "Låter det vara den här gången eftersom det är litet och inte orsakat skada",
          en: "Let it go this time since it's minor and hasn't caused harm",
        },
      },
      {
        id: "adopt_it",
        label: {
          sv: "Börjar göra likadant själv eftersom det uppenbarligen fungerar",
          en: "Start doing the same thing myself since it clearly works",
        },
      },
    ],
  },

  {
    id: "q3",
    type: "single",
    topic: { sv: "Situationsmedvetenhet", en: "Situational awareness" },
    prompt: {
      sv: "Du gör en rutinmässig genomgång av ett område du känner väl. Vad skulle du mest sannolikt lägga märke till utan att bli ombedd att leta efter det?",
      en: "You're doing a routine walk-through of an area you know well. What would you be most likely to notice without being told to look for it?",
    },
    options: [
      {
        id: "unexplained",
        label: {
          sv: "Något litet som skiljer sig från hur det brukar se ut, även om jag inte genast vet varför det spelar roll",
          en: "Something small that's slightly different from how it normally looks, even if I can't say why it matters yet",
        },
      },
      {
        id: "unusual_person",
        label: {
          sv: "En person vars beteende inte passar sammanhanget, även om inget annat verkar fel",
          en: "A person behaving in a way that doesn't match the context, even if nothing else seems wrong",
        },
      },
      {
        id: "schedule_only",
        label: {
          sv: "Mest bara det som är ett uttalat, schemalagt kontrollmoment – annars registrerar jag det sällan",
          en: "Mainly the things that are an explicit, scheduled check-item — otherwise it rarely registers",
        },
      },
      {
        id: "told_only",
        label: {
          sv: "Realistiskt sett främst det jag specifikt blir tillsagd att kontrollera den dagen",
          en: "Realistically, mainly what I'm specifically told to check that day",
        },
      },
    ],
  },

  {
    id: "q4",
    type: "rating",
    topic: { sv: "Riskmedvetenhet", en: "Risk recognition" },
    prompt: {
      sv: "Jag funderar aktivt på vad som skulle kunna gå fel innan det händer, inte bara reagerar när det redan skett.",
      en: "I actively think about what could go wrong before it happens, not just react once it does.",
    },
    scaleMin: 1,
    scaleMax: 5,
    scaleLabels: {
      min: { sv: "Instämmer inte", en: "Strongly disagree" },
      max: { sv: "Instämmer helt", en: "Strongly agree" },
    },
  },

  {
    id: "q5",
    type: "rating",
    topic: { sv: "Rutindisciplin", en: "Procedural discipline" },
    prompt: {
      sv: "Även när jag är säker på att jag vet ett bättre sätt följer jag den etablerade rutinen om jag inte har uttryckligt godkännande att avvika.",
      en: "Even when I'm confident I know a better way, I follow the established procedure unless I have explicit approval to deviate.",
    },
    scaleMin: 1,
    scaleMax: 5,
    scaleLabels: {
      min: { sv: "Instämmer inte", en: "Strongly disagree" },
      max: { sv: "Instämmer helt", en: "Strongly agree" },
    },
  },

  {
    id: "q6",
    type: "rating",
    topic: { sv: "Kommunikation", en: "Communication" },
    prompt: {
      sv: "Jag kan förklara en komplicerad situation tydligt och lugnt, även för någon som är frustrerad eller stressad.",
      en: "I can explain a complicated situation clearly and calmly, even to someone who is frustrated or in a hurry.",
    },
    scaleMin: 1,
    scaleMax: 5,
    scaleLabels: {
      min: { sv: "Instämmer inte", en: "Strongly disagree" },
      max: { sv: "Instämmer helt", en: "Strongly agree" },
    },
  },

  {
    id: "q7",
    type: "single",
    topic: { sv: "Eskaleringsbedömning", en: "Escalation judgement" },
    prompt: {
      sv: "En situation utvecklas som ligger utanför vad du normalt kan lösa själv, men att eskalera känns som att det kanske är en överreaktion. Vad gör du i praktiken?",
      en: "A situation is unfolding that's outside your normal authority to resolve alone, but escalating feels like it might be an overreaction. What do you actually do?",
    },
    options: [
      {
        id: "escalate_now",
        label: {
          sv: "Eskalerar direkt och låter rätt person avgöra om det var en överreaktion",
          en: "Escalate immediately and let the right person decide if it's an overreaction",
        },
      },
      {
        id: "gather_more",
        label: {
          sv: "Samlar snabbt lite mer information först, sedan eskalerar jag utan större dröjsmål",
          en: "Quickly gather a bit more information first, then escalate without much delay",
        },
      },
      {
        id: "wait_and_see",
        label: {
          sv: "Väntar och ser om det löser sig innan jag involverar någon annan",
          en: "Wait to see if it resolves itself before involving anyone else",
        },
      },
      {
        id: "handle_alone",
        label: {
          sv: "Hanterar det själv, eftersom att eskalera kan få mig att verka oförmögen",
          en: "Handle it myself, since escalating might make me look unable to cope",
        },
      },
    ],
  },

  {
    id: "q8",
    type: "rating",
    topic: { sv: "Beslutskvalitet", en: "Decision quality" },
    prompt: {
      sv: "När jag har tillräckligt med information för att agera fattar jag ett beslut istället för att fortsätta tveka.",
      en: "Once I have enough information to act, I commit to a decision rather than continuing to second-guess it.",
    },
    scaleMin: 1,
    scaleMax: 5,
    scaleLabels: {
      min: { sv: "Instämmer inte", en: "Strongly disagree" },
      max: { sv: "Instämmer helt", en: "Strongly agree" },
    },
  },

  {
    id: "q9",
    type: "single",
    topic: { sv: "Bedömning under osäkerhet", en: "Judgement under uncertainty" },
    prompt: {
      sv: "Du måste fatta ett beslut, men två uppgifter du får verkar motsäga varandra och det finns ingen tid att helt reda ut vilken som stämmer. Vad ligger närmast det du faktiskt skulle göra?",
      en: "You have to make a call, but two pieces of information you're getting seem to conflict, and there's no time to fully resolve which is right. What's closest to what you'd actually do?",
    },
    options: [
      {
        id: "best_available",
        label: {
          sv: "Agerar på den mest pålitliga källan och noterar motsägelsen för uppföljning",
          en: "Act on the most reliable source available and note the conflict for follow-up",
        },
      },
      {
        id: "pause_briefly",
        label: {
          sv: "Pausar precis så länge att jag snabbt kan avgöra vilken källa som är mer trovärdig",
          en: "Pause just long enough to quickly check which source is more trustworthy",
        },
      },
      {
        id: "freeze",
        label: {
          sv: "Väntar med att agera tills motsägelsen är helt löst",
          en: "Hold off acting until the conflict is fully resolved",
        },
      },
      {
        id: "pick_convenient",
        label: {
          sv: "Går på den version som gör beslutet enklast",
          en: "Go with whichever version makes the decision easier",
        },
      },
    ],
  },

  {
    id: "q10",
    type: "rating",
    topic: { sv: "Anpassningsförmåga", en: "Adaptability" },
    prompt: {
      sv: "När en känd process ändras justerar jag snabbt mitt arbetssätt utan att behöva bli genomgången upprepade gånger.",
      en: "When a familiar process changes, I adjust my approach quickly without needing to be walked through it repeatedly.",
    },
    scaleMin: 1,
    scaleMax: 5,
    scaleLabels: {
      min: { sv: "Instämmer inte", en: "Strongly disagree" },
      max: { sv: "Instämmer helt", en: "Strongly agree" },
    },
  },

  {
    id: "q11",
    type: "rating",
    topic: { sv: "Lärandeorientering", en: "Learning orientation" },
    prompt: {
      sv: "På en skala 1–10: hur säker är du på din förmåga att snabbt sätta dig in i en obekant rutin, ett system eller en ny miljö?",
      en: "On a scale of 1 to 10, how confident are you in your ability to quickly get up to speed on an unfamiliar procedure, system, or environment?",
    },
    scaleMin: 1,
    scaleMax: 10,
    scaleLabels: {
      min: { sv: "Inte alls säker", en: "Not confident at all" },
      max: { sv: "Extremt säker", en: "Extremely confident" },
    },
  },

  {
    id: "q12",
    type: "rating",
    topic: { sv: "Lugn under press", en: "Calmness under pressure" },
    prompt: {
      sv: "Jag förblir effektiv och klartänkt när flera brådskande saker händer samtidigt.",
      en: "I stay effective and clear-headed when several urgent things are happening at once.",
    },
    scaleMin: 1,
    scaleMax: 5,
    scaleLabels: {
      min: { sv: "Sällan", en: "Rarely" },
      max: { sv: "Konsekvent", en: "Consistently" },
    },
  },

  {
    id: "q13",
    type: "rating",
    topic: { sv: "Samarbete", en: "Teamwork" },
    prompt: {
      sv: "Jag samordnar väl med andra under en gemensam uppgift, även under tidspress.",
      en: "I coordinate well with others during a shared task, even under time pressure.",
    },
    scaleMin: 1,
    scaleMax: 5,
    scaleLabels: {
      min: { sv: "Instämmer inte", en: "Strongly disagree" },
      max: { sv: "Instämmer helt", en: "Strongly agree" },
    },
  },

  {
    id: "q14",
    type: "single",
    topic: { sv: "Rapportering och dokumentation", en: "Reporting and documentation" },
    prompt: {
      sv: "Efter att något anmärkningsvärt hänt, hur brukar du faktiskt dokumentera det?",
      en: "After something notable happens, how do you actually tend to document it?",
    },
    options: [
      {
        id: "immediate_detailed",
        label: {
          sv: "Skriver ner det i detalj så snart som möjligt, medan det är färskt",
          en: "I write it up in detail as soon as possible, while it's fresh",
        },
      },
      {
        id: "immediate_brief",
        label: {
          sv: "Noterar de viktigaste fakta snabbt och utvecklar det senare vid behov",
          en: "I note the key facts quickly, then expand it later if needed",
        },
      },
      {
        id: "delayed",
        label: {
          sv: "Brukar göra det senare, ur minnet, när jag har tid",
          en: "I usually get to it later, from memory, when I have time",
        },
      },
      {
        id: "minimal",
        label: {
          sv: "Håller det kort och skriver bara ner det som verkar tydligt nödvändigt",
          en: "I keep it brief and only write down what seems clearly necessary",
        },
      },
    ],
  },

  {
    id: "q15",
    type: "single",
    topic: { sv: "Serviceorientering", en: "Service orientation" },
    prompt: {
      sv: "Hur ser du faktiskt på direkt kontakt med allmänheten som en central del av jobbet, inte bara en tillfällig del?",
      en: "How do you actually feel about direct interaction with the public as a core part of the job, not just an occasional part?",
    },
    options: [
      {
        id: "core",
        label: {
          sv: "Det är en del av jobbet jag verkligen värdesätter",
          en: "It's a part of the job I genuinely value",
        },
      },
      {
        id: "capable",
        label: {
          sv: "Jag hanterar det bra, men det är inte det som ger mig energi",
          en: "I handle it well, but it's not what energizes me",
        },
      },
      {
        id: "limited",
        label: {
          sv: "Jag föredrar att det är en begränsad del av min roll",
          en: "I prefer it to be a limited part of my role",
        },
      },
      {
        id: "minimal",
        label: {
          sv: "Jag föredrar starkt en roll med minimal kontakt med allmänheten",
          en: "I'd strongly prefer a role with minimal public interaction",
        },
      },
    ],
  },

  {
    id: "q16",
    type: "multi",
    topic: { sv: "Miljö och roll", en: "Environment and role" },
    prompt: {
      sv: "Vilka av dessa miljöer skulle verkligen passa hur du gillar att arbeta? (välj upp till tre)",
      en: "Which of these environments would genuinely suit how you like to work? (choose up to three)",
    },
    options: [
      { id: "office", label: { sv: "Kontor och analysarbete", en: "Office and analysis work" } },
      {
        id: "field",
        label: { sv: "Ute på fältet / patrullering", en: "Out in the field / patrol" },
      },
      {
        id: "datacenter",
        label: {
          sv: "Datacenter och kritisk infrastruktur",
          en: "Data centers and critical infrastructure",
        },
      },
      {
        id: "public",
        label: { sv: "Publika miljöer och evenemang", en: "Public environments and events" },
      },
      { id: "corporate", label: { sv: "Företagsmiljöer", en: "Corporate environments" } },
      {
        id: "gov",
        label: {
          sv: "Myndigheter och reglerade miljöer",
          en: "Government and regulated environments",
        },
      },
      {
        id: "casework",
        label: { sv: "Utredning och ärendearbete", en: "Investigation and casework" },
      },
      {
        id: "coordination",
        label: { sv: "Samordning och ledning av andra", en: "Coordinating and leading others" },
      },
    ],
  },
];

export function pickText(v: Bi, lang: Lang): string {
  return v[lang];
}
