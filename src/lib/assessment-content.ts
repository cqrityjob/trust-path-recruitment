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
      sv: "Det är mot slutet av ett långt pass. En rutinkontroll återstår – ingen skulle märka om du hoppade över den, och inget har verkat avvikande under dagen. Vad gör du?",
      en: "It's near the end of a long shift. One routine check remains — no one would notice if you skipped it, and nothing has seemed unusual all day. What do you actually do?",
    },
    options: [
      {
        id: "always",
        label: {
          sv: "Genomför den fullt ut, precis som vanligt",
          en: "Complete it fully, exactly as usual",
        },
      },
      {
        id: "mostly",
        label: {
          sv: "Genomför den, men något snabbare än vanligt eftersom inget verkar fel",
          en: "Complete it, but a little faster than usual since nothing seems wrong",
        },
      },
      {
        id: "variable",
        label: {
          sv: "Hoppar över den den här gången – jag är säker på att allt är okej",
          en: "Skip it this time — I'm confident everything's fine",
        },
      },
      {
        id: "deprioritize",
        label: {
          sv: "Rutinkontroller i slutet av passet är oftast det första jag hoppar över när jag är trött eller sen",
          en: "End-of-shift routine checks are usually the first thing I skip when I'm tired or running late",
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
          sv: "Noterar att det verkar fungera för dem, och utesluter inte att göra något liknande själv när det passar",
          en: "Note that it seems to work for them, and don't rule out doing something similar myself when it's convenient",
        },
      },
    ],
  },

  {
    id: "q3",
    type: "single",
    topic: { sv: "Situationsmedvetenhet", en: "Situational awareness" },
    prompt: {
      sv: "Du går igenom ett område du känner väl under en rutinkontroll. En hög besöksbrickor ligger lite fel, en dörr som brukar stå uppställd är stängd, och en person du inte känner igen står vid lastintaget och tittar på sin telefon. Vad skulle du faktiskt lägga märke till först, utan att bli ombedd att leta efter något av detta?",
      en: "You're walking through an area you know well during a routine check. A stack of visitor badges is slightly out of place, a door that's normally propped open is closed, and someone you don't recognise is standing near the loading area, looking at their phone. What would you actually register first, without being told to look for any of it?",
    },
    options: [
      {
        id: "unexplained",
        label: {
          sv: "De små sakerna som skiljer sig lite från det normala – brickorna, den stängda dörren",
          en: "The small things that are slightly off from normal — the badges, the closed door",
        },
      },
      {
        id: "unusual_person",
        label: {
          sv: "Personen vid lastintaget som inte verkar höra hemma där",
          en: "The person near the loading area who doesn't look like they belong there",
        },
      },
      {
        id: "schedule_only",
        label: {
          sv: "Ärligt talat, förmodligen inget av det om det inte står på min schemalagda checklista",
          en: "Honestly, probably none of it unless it's part of my scheduled checklist",
        },
      },
      {
        id: "told_only",
        label: {
          sv: "Realistiskt sett bara om någon specifikt hade bett mig kontrollera det",
          en: "Realistically, only if someone had specifically told me to check for it",
        },
      },
    ],
  },

  {
    id: "q4",
    type: "single",
    topic: { sv: "Riskmedvetenhet", en: "Risk recognition" },
    prompt: {
      sv: "Innan du påbörjar en rutinuppgift, vad ligger närmast det som faktiskt går genom huvudet på dig?",
      en: "Before starting a routine task, what's closest to what actually goes through your mind?",
    },
    options: [
      {
        id: "proactive",
        label: {
          sv: "Jag tänker på vad som realistiskt skulle kunna gå fel och hur jag skulle upptäcka det tidigt",
          en: "I think about what could realistically go wrong and how I'd notice it early",
        },
      },
      {
        id: "task_focused",
        label: {
          sv: "Jag fokuserar mest på att göra uppgiften rätt – problem löser jag om de dyker upp",
          en: "I mostly focus on doing the task correctly; I'll deal with problems if they come up",
        },
      },
      {
        id: "reactive",
        label: {
          sv: "Jag tänker inte direkt på det i förväg – jag reagerar om något går fel",
          en: "I don't really think about it in advance — I react if something goes wrong",
        },
      },
      {
        id: "assume_fine",
        label: {
          sv: "Jag utgår från att det kommer gå bra, eftersom det oftast gör det",
          en: "I assume it'll be fine, since it usually is",
        },
      },
    ],
  },

  {
    id: "q5",
    type: "single",
    topic: { sv: "Rutindisciplin", en: "Procedural discipline" },
    prompt: {
      sv: "Du är säker på att du hittat ett snabbare sätt att genomföra en rutinkontroll, men det är inte formellt godkänt. Det är slutet på ett långt pass. Vad gör du?",
      en: "You're confident you've found a faster way to complete a routine check, but it hasn't been formally approved. It's the end of a long shift. What do you actually do?",
    },
    options: [
      {
        id: "follow_and_raise",
        label: {
          sv: "Följer den fastställda rutinen exakt, och tar upp min idé efteråt",
          en: "Follow the established procedure exactly, and raise my idea afterward",
        },
      },
      {
        id: "follow_and_note",
        label: {
          sv: "Följer rutinen, men noterar för mig själv att ta upp det senare",
          en: "Follow the procedure, but make a mental note to bring it up later",
        },
      },
      {
        id: "use_own_this_time",
        label: {
          sv: "Använder mitt eget sätt den här gången, eftersom jag är säker på att det är bättre",
          en: "Use my own approach this time, since I'm confident it's better",
        },
      },
      {
        id: "use_own_regularly",
        label: {
          sv: "Använder mitt eget sätt och tänker inte mer på det",
          en: "Use my own approach and don't think much more about it",
        },
      },
    ],
  },

  {
    id: "q6",
    type: "single",
    topic: { sv: "Kommunikation", en: "Communication" },
    prompt: {
      sv: 'Något oklart har precis hänt. Din chef frågar "vad hände?" med bara en minut kvar innan nästa samtal. Vad börjar du med?',
      en: 'Something ambiguous just happened. Your supervisor asks "what happened?" with only a minute before their next call. What do you lead with?',
    },
    options: [
      {
        id: "facts_first",
        label: {
          sv: "De rena fakta om vad som hände, tydligt och i ordning",
          en: "The plain facts of what happened, clearly and in order",
        },
      },
      {
        id: "facts_and_read",
        label: {
          sv: "Fakta, plus vad jag tror det kan betyda",
          en: "The facts, plus what I think it might mean",
        },
      },
      {
        id: "next_steps",
        label: {
          sv: "Mest vad jag tycker borde hända härnäst",
          en: "Mainly what I think should happen next",
        },
      },
      {
        id: "whatever_urgent",
        label: {
          sv: "Det som känns mest akut för stunden, även om det blir lite osorterat",
          en: "Whatever feels most urgent in the moment, even if it comes out a bit disorganised",
        },
      },
    ],
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
          sv: "Hanterar det själv för tillfället – att eskalera kanske inte är värt det om det visar sig vara ingenting",
          en: "Handle it myself for now — escalating might not be worth it if it turns out to be nothing",
        },
      },
    ],
  },

  {
    id: "q8",
    type: "single",
    topic: { sv: "Beslutskvalitet", en: "Decision quality" },
    prompt: {
      sv: "Du har fattat ett beslut och börjat agera utifrån det. Ny information dyker upp – inte avgörande, men den väcker viss tvekan. Vad gör du faktiskt?",
      en: "You've made a decision and started acting on it. New information arrives — not conclusive, but it raises some doubt. What do you actually do?",
    },
    options: [
      {
        id: "continue_alert",
        label: {
          sv: "Fortsätter med mitt beslut, men håller mig uppmärksam och omprövar om starkare belägg dyker upp",
          en: "Continue with my decision, but stay alert and reconsider if stronger evidence appears",
        },
      },
      {
        id: "pause_then_continue",
        label: {
          sv: "Pausar kort för att väga in den nya informationen, fortsätter sedan eller justerar",
          en: "Pause briefly to weigh the new information, then continue or adjust",
        },
      },
      {
        id: "second_guess",
        label: {
          sv: "Börjar tvivla på mig själv och saktar ner, även utan tydlig anledning att ändra kurs",
          en: "Start second-guessing myself and slow down, even without a clear reason to change course",
        },
      },
      {
        id: "reverse_to_be_safe",
        label: {
          sv: "Ändrar kurs direkt för säkerhets skull",
          en: "Immediately reverse course to be safe",
        },
      },
    ],
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
    type: "single",
    topic: { sv: "Anpassningsförmåga", en: "Adaptability" },
    prompt: {
      sv: "En rutin du känner väl förändras – till exempel införs ett nytt passersteg mitt under passet. Vad ligger närmast det som faktiskt händer?",
      en: "A procedure you know well changes — for example, a new access-control step is introduced mid-shift. What's closest to what actually happens?",
    },
    options: [
      {
        id: "adjust_same_shift",
        label: {
          sv: "Jag ställer om under samma pass, kollar detaljer när jag är osäker",
          en: "I adjust within the same shift, checking details when I'm unsure",
        },
      },
      {
        id: "adjust_with_guidance",
        label: {
          sv: "Jag ställer om, men behöver lite extra vägledning de första gångerna",
          en: "I adjust, but need a bit of extra guidance the first couple of times",
        },
      },
      {
        id: "revert_to_old",
        label: {
          sv: "Jag ertappar mig med att falla tillbaka på det gamla sättet mer än en gång, av vana",
          en: "I catch myself reverting to the old way more than once, out of habit",
        },
      },
      {
        id: "find_it_frustrating",
        label: {
          sv: "Jag tycker förändringen är frustrerande, och det tar ett tag innan det sitter",
          en: "I find the change frustrating, and it takes a while to stick",
        },
      },
    ],
  },

  {
    id: "q11",
    type: "single",
    topic: { sv: "Lärandeorientering", en: "Learning orientation" },
    prompt: {
      sv: "Tänk på senaste gången du behövde sätta dig in i något obekant på jobbet – ett system, en rutin eller en ny miljö. Vad hände egentligen?",
      en: "Think about the last time you had to get up to speed on something unfamiliar at work — a system, procedure, or environment. What actually happened?",
    },
    options: [
      {
        id: "fast_proactive",
        label: {
          sv: "Jag lärde mig det snabbt och frågade när jag behövde",
          en: "I picked it up quickly, asking questions when I needed to",
        },
      },
      {
        id: "normal_pace",
        label: {
          sv: "Jag lärde mig det i normal takt, ungefär som de flesta",
          en: "I picked it up at a normal pace, similar to most people",
        },
      },
      {
        id: "slower_than_liked",
        label: {
          sv: "Det tog märkbart längre tid än jag hade velat",
          en: "It took me noticeably longer than I would have liked",
        },
      },
      {
        id: "still_not_comfortable",
        label: {
          sv: "Jag känner mig fortfarande inte helt bekväm med det",
          en: "I'm still not fully comfortable with it",
        },
      },
    ],
  },

  {
    id: "q12",
    type: "single",
    topic: { sv: "Lugn under press", en: "Calmness under pressure" },
    prompt: {
      sv: "Du hanterar samtidigt två brådskande situationer. Ingen av dem kan bara vänta. Vad gör du faktiskt först?",
      en: "You are simultaneously handling two urgent situations. Neither can simply wait. What do you actually do first?",
    },
    options: [
      {
        id: "triage_and_flag",
        label: {
          sv: "Bedömer snabbt vilken som har störst potentiell konsekvens, tar den först och flaggar den andra för omedelbar uppföljning",
          en: "Quickly judge which one has the higher potential consequence, address that first, and flag the other for immediate follow-up",
        },
      },
      {
        id: "fastest_first",
        label: {
          sv: "Tar den jag snabbast kan lösa först, sedan den andra",
          en: "Handle whichever one I can resolve fastest first, then move to the other",
        },
      },
      {
        id: "both_at_once",
        label: {
          sv: "Försöker göra framsteg på båda samtidigt",
          en: "Try to make progress on both at the same time",
        },
      },
      {
        id: "freeze",
        label: {
          sv: "Fryser till ett ögonblick, osäker på vilken jag ska prioritera",
          en: "Freeze for a moment, unsure which to prioritise",
        },
      },
    ],
  },

  {
    id: "q13",
    type: "single",
    topic: { sv: "Samarbete", en: "Teamwork" },
    prompt: {
      sv: "Du och en kollega samordnar en gemensam uppgift, men ni är oense om hur brådskande en del av den är. Vad gör du faktiskt?",
      en: "You and a colleague are coordinating a shared task, but you disagree about how urgent part of it is. What do you actually do?",
    },
    options: [
      {
        id: "discuss_and_agree",
        label: {
          sv: "Diskuterar det kort, kommer överens om ett tillvägagångssätt och fortsätter tillsammans",
          en: "Discuss it briefly, agree on an approach, and proceed together",
        },
      },
      {
        id: "defer_to_them",
        label: {
          sv: "Går på deras linje för tillfället, eftersom det skulle bromsa upp att diskutera",
          en: "Go with their view for now, since arguing would slow things down",
        },
      },
      {
        id: "split_and_go_own_way",
        label: {
          sv: "Gör min del på mitt sätt och låter dem sköta sin del separat",
          en: "Do my part my own way and let them handle theirs separately",
        },
      },
      {
        id: "push_my_view",
        label: {
          sv: "Driver min ståndpunkt eftersom jag är säker på att jag har rätt",
          en: "Push my view since I'm confident I'm right",
        },
      },
    ],
  },

  {
    id: "q14",
    type: "single",
    topic: { sv: "Rapportering och dokumentation", en: "Reporting and documentation" },
    prompt: {
      sv: "Något anmärkningsvärt har precis hänt i slutet av ditt pass, och du vill gärna komma hem. Vad gör du faktiskt?",
      en: "Something notable just happened at the very end of your shift, and you're eager to head home. What do you actually do?",
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
