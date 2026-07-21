import type { QuestionAsset } from "../types";
import { legacyQuestion, legacyMapping } from "../legacy";

// Q9-Q16 of the `student_or_new` profile (Student / New to the security
// industry). 7 new questions + 1 reused (stu-07, verbatim = q16). All new
// Swedish text is an AI-authored first draft pending native-speaker review.
// See docs/job-intelligence/public-career-assessment-v1-spec.md for full
// reasoning per question.
export const studentOrNewAssets: QuestionAsset[] = [
  {
    id: "stu-01",
    version: 1,
    status: "draft",
    category: "motivation",
    competencies: ["comp-work-motivation"],
    dimensions: ["operational_orientation", "structure_documentation"],
    tags: ["profile:student_or_new", "preference", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "scenario-based",
    content: {
      id: "stu-01",
      type: "single",
      topic: { sv: "Motivation", en: "Motivation" },
      prompt: {
        sv: "Du blir tilldelad en enkel, upprepande arbetsuppgift under din första vecka – inget spännande, men det behöver göras noggrant varje gång. Vad ligger närmast hur du skulle känna och agera?",
        en: "You're given a simple, repetitive task during your first week — nothing exciting, but it needs to be done carefully every time. What's closest to how you'd actually feel and act?",
      },
      options: [
        {
          id: "committed",
          label: {
            sv: "Jag gör den lika noggrant varje gång, oavsett hur enkel eller tråkig den känns",
            en: "I do it just as carefully every time, no matter how simple or dull it feels",
          },
        },
        {
          id: "willing_but_impatient",
          label: {
            sv: "Jag gör den ordentligt, men hoppas snart få mer varierande uppgifter",
            en: "I do it properly, but hope to get more varied tasks soon",
          },
        },
        {
          id: "coasting",
          label: {
            sv: "Jag gör det som krävs, men lägger inte extra energi på något som känns oviktigt",
            en: "I do what's required, but don't put extra energy into something that feels unimportant",
          },
        },
        {
          id: "resistant",
          label: {
            sv: "Uppgifter som den här får mig snabbt att tappa intresset för jobbet",
            en: "Tasks like this quickly make me lose interest in the job",
          },
        },
      ],
    },
    mapping: {
      questionId: "stu-01",
      maxAbsPerDimension: 3,
      options: [
        {
          optionId: "committed",
          weights: [
            { dimension: "operational_orientation", weight: 3 },
            { dimension: "structure_documentation", weight: 1 },
          ],
        },
        {
          optionId: "willing_but_impatient",
          weights: [{ dimension: "operational_orientation", weight: 1 }],
        },
        { optionId: "coasting", weights: [{ dimension: "operational_orientation", weight: -1 }] },
        { optionId: "resistant", weights: [{ dimension: "operational_orientation", weight: -2 }] },
      ],
    },
  },
  {
    id: "stu-02",
    version: 1,
    status: "draft",
    category: "learning-onboarding",
    competencies: ["comp-learning-agility"],
    dimensions: ["learning_development"],
    tags: ["profile:student_or_new", "behavioural"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "behavioural",
    content: {
      id: "stu-02",
      type: "single",
      topic: { sv: "Lärande i en ny roll", en: "Learning in a new role" },
      prompt: {
        sv: "Du får en kort introduktionsguide att sätta dig in i innan ditt första riktiga pass, med ont om tid. Vad gör du faktiskt?",
        en: "You're given a short onboarding guide to get through before your first real shift, with limited time. What do you actually do?",
      },
      options: [
        {
          id: "thorough",
          label: {
            sv: "Går igenom den noga och antecknar frågor jag vill ha svar på",
            en: "Go through it carefully and note questions I want answered",
          },
        },
        {
          id: "skim",
          label: {
            sv: "Skummar igenom det viktigaste och frågar om resten när det behövs",
            en: "Skim the key parts and ask about the rest when it comes up",
          },
        },
        {
          id: "quick_no_retain",
          label: {
            sv: "Läser den snabbt utan att det riktigt fastnar",
            en: "Read through it quickly without much of it sticking",
          },
        },
        {
          id: "defer",
          label: {
            sv: "Skjuter upp det och tänker lära mig på plats istället",
            en: "Put it off and plan to learn on the job instead",
          },
        },
      ],
    },
    mapping: {
      questionId: "stu-02",
      maxAbsPerDimension: 3,
      options: [
        { optionId: "thorough", weights: [{ dimension: "learning_development", weight: 3 }] },
        { optionId: "skim", weights: [{ dimension: "learning_development", weight: 1 }] },
        {
          optionId: "quick_no_retain",
          weights: [{ dimension: "learning_development", weight: -1 }],
        },
        { optionId: "defer", weights: [{ dimension: "learning_development", weight: -2 }] },
      ],
    },
  },
  {
    id: "stu-03",
    version: 1,
    status: "draft",
    category: "responsibility",
    competencies: ["comp-reliability"],
    dimensions: ["structure_documentation", "independent_decision_making"],
    tags: ["profile:student_or_new", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "scenario-based",
    content: {
      id: "stu-03",
      type: "single",
      topic: { sv: "Ansvar utan uppsikt", en: "Responsibility without oversight" },
      prompt: {
        sv: "Du får en liten uppgift att sköta själv, och ingen kommer kontrollera den förrän nästa dag. Vad gör du faktiskt?",
        en: "You're given a small task to handle on your own, and no one will check it until the next day. What do you actually do?",
      },
      options: [
        {
          id: "full_check",
          label: {
            sv: "Slutför den fullt ut och dubbelkollar att den är rätt",
            en: "Complete it fully and double-check it's right",
          },
        },
        {
          id: "full_no_check",
          label: {
            sv: "Slutför den, men skulle inte lägga extra tid på att dubbelkolla",
            en: "Complete it, but wouldn't spend extra time double-checking",
          },
        },
        {
          id: "partial",
          label: {
            sv: "Gör det mesta av den, men lämnar mindre delar ofärdiga",
            en: "Do most of it, but leave smaller parts unfinished",
          },
        },
        {
          id: "defer",
          label: {
            sv: "Skjuter upp den eftersom ingen kollar upp den ändå",
            en: "Put it off since no one's checking it anyway",
          },
        },
      ],
    },
    mapping: {
      questionId: "stu-03",
      maxAbsPerDimension: 3,
      options: [
        { optionId: "full_check", weights: [{ dimension: "structure_documentation", weight: 3 }] },
        {
          optionId: "full_no_check",
          weights: [{ dimension: "structure_documentation", weight: 1 }],
        },
        { optionId: "partial", weights: [{ dimension: "structure_documentation", weight: -1 }] },
        {
          optionId: "defer",
          weights: [
            { dimension: "structure_documentation", weight: -2 },
            { dimension: "independent_decision_making", weight: -1 },
          ],
        },
      ],
    },
  },
  {
    id: "stu-04",
    version: 1,
    status: "draft",
    category: "service",
    competencies: ["comp-service-disposition"],
    dimensions: ["service_orientation", "communication"],
    tags: ["profile:student_or_new", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "scenario-based",
    content: {
      id: "stu-04",
      type: "single",
      topic: { sv: "Att möta människor", en: "Meeting people" },
      prompt: {
        sv: "En person du inte känner ber dig om hjälp med något som egentligen inte är din uppgift, mitt i något annat du håller på med. Vad gör du faktiskt?",
        en: "Someone you don't know asks for help with something that isn't really your job, right in the middle of something else you're doing. What do you actually do?",
      },
      options: [
        {
          id: "full_help",
          label: {
            sv: "Stannar upp, hjälper till ordentligt och återgår sedan till det jag gjorde",
            en: "Stop, help properly, then return to what I was doing",
          },
        },
        {
          id: "quick_help",
          label: {
            sv: "Hjälper snabbt till, men håller det kort",
            en: "Help quickly, but keep it brief",
          },
        },
        {
          id: "redirect",
          label: {
            sv: "Pekar dem mot någon annan om jag kan",
            en: "Point them toward someone else if I can",
          },
        },
        {
          id: "decline",
          label: {
            sv: "Säger att jag inte har tid just nu",
            en: "Say I don't have time right now",
          },
        },
      ],
    },
    mapping: {
      questionId: "stu-04",
      maxAbsPerDimension: 3,
      options: [
        {
          optionId: "full_help",
          weights: [
            { dimension: "service_orientation", weight: 3 },
            { dimension: "communication", weight: 1 },
          ],
        },
        { optionId: "quick_help", weights: [{ dimension: "service_orientation", weight: 1 }] },
        { optionId: "redirect", weights: [{ dimension: "service_orientation", weight: -1 }] },
        { optionId: "decline", weights: [{ dimension: "service_orientation", weight: -2 }] },
      ],
    },
  },
  {
    id: "stu-05",
    version: 1,
    status: "draft",
    category: "handling-pressure",
    competencies: ["comp-composure-under-pressure"],
    dimensions: ["operational_orientation", "conflict_management"],
    tags: ["profile:student_or_new", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "scenario-based",
    content: {
      id: "stu-05",
      type: "single",
      topic: {
        sv: "Att hantera press för första gången",
        en: "Handling pressure for the first time",
      },
      prompt: {
        sv: "Något oväntat och lite kaotiskt händer runt omkring dig – något du aldrig varit med om förut. Vad ligger närmast det du faktiskt skulle göra?",
        en: "Something unexpected and a little chaotic happens around you — something you've never experienced before. What's closest to what you'd actually do?",
      },
      options: [
        {
          id: "calm_read",
          label: {
            sv: "Tar ett andetag, försöker förstå läget och agerar lugnt utifrån det jag vet",
            en: "Take a breath, try to read the situation, and act calmly based on what I know",
          },
        },
        {
          id: "unsettled_ok",
          label: {
            sv: "Blir lite orolig men gör mitt bästa för att hantera det",
            en: "Get a bit unsettled but do my best to handle it",
          },
        },
        {
          id: "stressed",
          label: {
            sv: "Blir tydligt stressad och tvekar innan jag agerar",
            en: "Get visibly stressed and hesitate before acting",
          },
        },
        {
          id: "freeze",
          label: {
            sv: "Fryser till och väntar på att någon annan tar över",
            en: "Freeze up and wait for someone else to take over",
          },
        },
      ],
    },
    mapping: {
      questionId: "stu-05",
      maxAbsPerDimension: 3,
      options: [
        {
          optionId: "calm_read",
          weights: [
            { dimension: "operational_orientation", weight: 3 },
            { dimension: "conflict_management", weight: 1 },
          ],
        },
        {
          optionId: "unsettled_ok",
          weights: [{ dimension: "operational_orientation", weight: 1 }],
        },
        { optionId: "stressed", weights: [{ dimension: "operational_orientation", weight: -1 }] },
        {
          optionId: "freeze",
          weights: [
            { dimension: "operational_orientation", weight: -2 },
            { dimension: "conflict_management", weight: -1 },
          ],
        },
      ],
    },
  },
  {
    id: "stu-06",
    version: 1,
    status: "draft",
    category: "teamwork-peer-learning",
    competencies: ["comp-collaboration"],
    dimensions: ["teamwork", "learning_development"],
    tags: ["profile:student_or_new", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "scenario-based",
    content: {
      id: "stu-06",
      type: "single",
      topic: { sv: "Att lära av andra", en: "Learning from others" },
      prompt: {
        sv: "Du blir parad med en mer erfaren kollega som gör saker på ett annat sätt än det du blivit tillsagd. Vad gör du faktiskt?",
        en: "You're paired with a more experienced colleague who does things differently from what you were taught. What do you actually do?",
      },
      options: [
        {
          id: "curious",
          label: {
            sv: "Frågar nyfiket varför de gör det så, och lär mig av det",
            en: "Curiously ask why they do it that way, and learn from it",
          },
        },
        {
          id: "go_along",
          label: {
            sv: "Följer med deras sätt för tillfället utan att fråga för mycket",
            en: "Go along with their way for now without asking too much",
          },
        },
        {
          id: "stick_to_training",
          label: {
            sv: "Håller mig till det jag lärt mig, även om det skapar lite friktion",
            en: "Stick to what I was taught, even if it creates some friction",
          },
        },
        {
          id: "unsure",
          label: {
            sv: "Blir osäker och vet inte riktigt vems sätt jag ska följa",
            en: "Get unsure and don't really know whose way to follow",
          },
        },
      ],
    },
    mapping: {
      questionId: "stu-06",
      maxAbsPerDimension: 3,
      options: [
        {
          optionId: "curious",
          weights: [
            { dimension: "teamwork", weight: 3 },
            { dimension: "learning_development", weight: 1 },
          ],
        },
        { optionId: "go_along", weights: [{ dimension: "teamwork", weight: 1 }] },
        { optionId: "stick_to_training", weights: [{ dimension: "teamwork", weight: -1 }] },
        { optionId: "unsure", weights: [{ dimension: "teamwork", weight: -2 }] },
      ],
    },
  },
  {
    // Reused verbatim = q16 ("Environment and role"), also present as sgf-08.
    id: "stu-07",
    version: 1,
    status: "published",
    category: "preferred-work-environment",
    competencies: ["comp-work-environment-preference", "comp-career-direction-preference"],
    dimensions: [
      "analytical_orientation",
      "strategic_orientation",
      "operational_orientation",
      "technical_orientation",
      "structure_documentation",
      "service_orientation",
      "investigation_orientation",
      "leadership_orientation",
      "teamwork",
    ],
    tags: ["profile:student_or_new", "preference"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "preference",
    content: legacyQuestion("q16"),
    mapping: legacyMapping("q16"),
  },
  {
    id: "stu-08",
    version: 1,
    status: "draft",
    category: "career-interests",
    competencies: ["comp-career-direction-preference"],
    dimensions: [
      "operational_orientation",
      "investigation_orientation",
      "analytical_orientation",
      "technical_orientation",
      "leadership_orientation",
      "strategic_orientation",
    ],
    tags: ["profile:student_or_new", "preference"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "preference",
    content: {
      id: "stu-08",
      type: "single",
      topic: { sv: "Framtida intressen", en: "Future interests" },
      prompt: {
        sv: "Om du får välja riktning längre fram, vilket av dessa lockar dig mest just nu?",
        en: "If you could choose a direction further down the line, which of these appeals to you most right now?",
      },
      options: [
        {
          id: "hands_on",
          label: {
            sv: "Praktiskt, händerna-på arbete ute i verkligheten",
            en: "Hands-on, practical work out in the real world",
          },
        },
        {
          id: "investigate",
          label: {
            sv: "Att gräva djupare i saker och ta reda på vad som faktiskt hände",
            en: "Digging deeper into things and finding out what actually happened",
          },
        },
        {
          id: "tech",
          label: {
            sv: "Att arbeta med teknik och säkerhetssystem",
            en: "Working with technology and security systems",
          },
        },
        {
          id: "lead",
          label: {
            sv: "Att så småningom leda och ansvara för ett team",
            en: "Eventually leading and being responsible for a team",
          },
        },
      ],
    },
    mapping: {
      questionId: "stu-08",
      maxAbsPerDimension: 3,
      options: [
        { optionId: "hands_on", weights: [{ dimension: "operational_orientation", weight: 3 }] },
        {
          optionId: "investigate",
          weights: [
            { dimension: "investigation_orientation", weight: 2 },
            { dimension: "analytical_orientation", weight: 2 },
          ],
        },
        { optionId: "tech", weights: [{ dimension: "technical_orientation", weight: 3 }] },
        {
          optionId: "lead",
          weights: [
            { dimension: "leadership_orientation", weight: 2 },
            { dimension: "strategic_orientation", weight: 1 },
          ],
        },
      ],
    },
  },
];
