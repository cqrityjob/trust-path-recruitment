import type { QuestionAsset } from "../types";
import { legacyQuestion, legacyMapping } from "../legacy";

// Q9-Q16 of the `career_changer` profile (Career changer from another
// industry). 6 new questions + 2 reused (chg-06 = q10, chg-07 = q16). All
// new Swedish text is an AI-authored first draft pending native-speaker
// review. See docs/job-intelligence/public-career-assessment-v1-spec.md for
// full reasoning per question.
export const careerChangerAssets: QuestionAsset[] = [
  {
    id: "chg-01",
    version: 1,
    status: "draft",
    category: "responsibility-transferable",
    competencies: ["comp-reliability"],
    dimensions: ["structure_documentation", "independent_decision_making"],
    tags: ["profile:career_changer", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "scenario-based",
    content: {
      id: "chg-01",
      type: "single",
      topic: { sv: "Ansvar i en ny bransch", en: "Responsibility in a new field" },
      prompt: {
        sv: "I ett tidigare jobb, i en helt annan bransch, fick du ett ansvar som ingen följde upp regelbundet. Vad ligger närmast hur du faktiskt hanterade eller skulle hantera det?",
        en: "In a previous job, in a completely different industry, you were given a responsibility that no one regularly followed up on. What's closest to how you actually handled it — or would?",
      },
      options: [
        {
          id: "consistent",
          label: {
            sv: "Höll samma standard hela tiden, oavsett om någon kollade upp det",
            en: "Kept the same standard throughout, whether or not anyone checked",
          },
        },
        {
          id: "mostly",
          label: {
            sv: "Höll god standard, men blev något mindre noggrann över tid",
            en: "Kept a good standard, but became somewhat less careful over time",
          },
        },
        {
          id: "inconsistent",
          label: {
            sv: "Var inkonsekvent beroende på hur mycket annat jag hade att göra",
            en: "Was inconsistent depending on how much else I had going on",
          },
        },
        {
          id: "deprioritized",
          label: {
            sv: "Prioriterade ofta ner det eftersom ingen efterfrågade det",
            en: "Often deprioritised it since no one was asking for it",
          },
        },
      ],
    },
    mapping: {
      questionId: "chg-01",
      maxAbsPerDimension: 3,
      options: [
        { optionId: "consistent", weights: [{ dimension: "structure_documentation", weight: 3 }] },
        { optionId: "mostly", weights: [{ dimension: "structure_documentation", weight: 1 }] },
        {
          optionId: "inconsistent",
          weights: [{ dimension: "structure_documentation", weight: -1 }],
        },
        {
          optionId: "deprioritized",
          weights: [
            { dimension: "structure_documentation", weight: -2 },
            { dimension: "independent_decision_making", weight: -1 },
          ],
        },
      ],
    },
  },
  {
    id: "chg-02",
    version: 1,
    status: "draft",
    category: "ethics",
    competencies: ["comp-integrity"],
    dimensions: ["structure_documentation", "conflict_management"],
    tags: ["profile:career_changer", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "scenario-based",
    content: {
      id: "chg-02",
      type: "single",
      topic: { sv: "Etik i en ny miljö", en: "Ethics in a new setting" },
      prompt: {
        sv: "En ny arbetsledare ber dig fortsätta ett arbetssätt som en tidigare kollega använde, men som du misstänker formellt bryter mot en mindre regel. Vad gör du faktiskt?",
        en: "A new manager asks you to continue a working method a previous colleague used, which you suspect technically breaks a minor rule. What do you actually do?",
      },
      options: [
        {
          id: "raise_first",
          label: {
            sv: "Tar upp min tveksamhet direkt med arbetsledaren innan jag fortsätter",
            en: "Raise my concern directly with the manager before continuing",
          },
        },
        {
          id: "continue_and_raise_later",
          label: {
            sv: "Fortsätter för tillfället, men nämner det vid nästa lämpliga tillfälle",
            en: "Continue for now, but mention it at the next suitable opportunity",
          },
        },
        {
          id: "continue_no_question",
          label: {
            sv: "Fortsätter utan att ifrågasätta det, eftersom det redan var praxis",
            en: "Continue without questioning it, since it was already practice",
          },
        },
        {
          id: "assume_fine",
          label: {
            sv: "Fortsätter och antar att det är okej eftersom en arbetsledare bad om det",
            en: "Continue and assume it's fine since a manager asked for it",
          },
        },
      ],
    },
    mapping: {
      questionId: "chg-02",
      maxAbsPerDimension: 3,
      options: [
        {
          optionId: "raise_first",
          weights: [
            { dimension: "structure_documentation", weight: 3 },
            { dimension: "conflict_management", weight: 1 },
          ],
        },
        {
          optionId: "continue_and_raise_later",
          weights: [{ dimension: "structure_documentation", weight: 1 }],
        },
        {
          optionId: "continue_no_question",
          weights: [{ dimension: "structure_documentation", weight: -1 }],
        },
        {
          optionId: "assume_fine",
          weights: [
            { dimension: "structure_documentation", weight: -2 },
            { dimension: "conflict_management", weight: -1 },
          ],
        },
      ],
    },
  },
  {
    id: "chg-03",
    version: 1,
    status: "draft",
    category: "communication",
    competencies: ["comp-clear-communication"],
    dimensions: ["communication"],
    tags: ["profile:career_changer", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "scenario-based",
    content: {
      id: "chg-03",
      type: "single",
      topic: { sv: "Att förklara tydligt", en: "Explaining clearly" },
      prompt: {
        sv: "Något gick fel på ett sätt som är ovanligt för dig i den nya rollen. Din arbetsledare vill ha en snabb förklaring, utan att du hunnit tänka igenom allt. Vad börjar du med?",
        en: "Something went wrong in a way that's unfamiliar to you in the new role. Your manager wants a quick explanation, before you've had time to think it all through. What do you lead with?",
      },
      options: [
        {
          id: "facts_ordered",
          label: {
            sv: "De konkreta fakta om vad som hände, i rätt ordning",
            en: "The concrete facts of what happened, in the right order",
          },
        },
        {
          id: "facts_and_guess",
          label: {
            sv: "Fakta, plus min bästa gissning om varför",
            en: "The facts, plus my best guess at why",
          },
        },
        {
          id: "apology_only",
          label: {
            sv: "Mest en ursäkt och ett löfte att det inte händer igen",
            en: "Mostly an apology and a promise it won't happen again",
          },
        },
        {
          id: "whatever_urgent",
          label: {
            sv: "Det som känns viktigast just då, även om det blir rörigt",
            en: "Whatever feels most important in the moment, even if it comes out messy",
          },
        },
      ],
    },
    mapping: {
      questionId: "chg-03",
      maxAbsPerDimension: 3,
      options: [
        { optionId: "facts_ordered", weights: [{ dimension: "communication", weight: 3 }] },
        { optionId: "facts_and_guess", weights: [{ dimension: "communication", weight: 2 }] },
        { optionId: "apology_only", weights: [{ dimension: "communication", weight: 0 }] },
        { optionId: "whatever_urgent", weights: [{ dimension: "communication", weight: -1 }] },
      ],
    },
  },
  {
    id: "chg-04",
    version: 1,
    status: "draft",
    category: "customer-interaction",
    competencies: ["comp-service-disposition"],
    dimensions: ["service_orientation", "conflict_management"],
    tags: ["profile:career_changer", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "scenario-based",
    content: {
      id: "chg-04",
      type: "single",
      topic: { sv: "Att hantera en missnöjd person", en: "Handling a frustrated person" },
      prompt: {
        sv: "En person du interagerar med i jobbet blir tydligt irriterad, även om du inte gjort något fel. Vad ligger närmast det du faktiskt gör?",
        en: "Someone you're interacting with at work becomes visibly irritated, even though you haven't done anything wrong. What's closest to what you actually do?",
      },
      options: [
        {
          id: "resolve",
          label: {
            sv: "Håller mig lugn, lyssnar och försöker faktiskt lösa det som stör dem",
            en: "Stay calm, listen, and actually try to resolve what's bothering them",
          },
        },
        {
          id: "calm_minimal",
          label: {
            sv: "Håller mig lugn och professionell, utan att engagera mig extra",
            en: "Stay calm and professional, without engaging much further",
          },
        },
        {
          id: "defensive",
          label: {
            sv: "Blir lite defensiv, även om jag försöker dölja det",
            en: "Get a little defensive, even if I try to hide it",
          },
        },
        {
          id: "handoff",
          label: {
            sv: "Föredrar att någon annan tar över situationen",
            en: "Prefer that someone else takes over the situation",
          },
        },
      ],
    },
    mapping: {
      questionId: "chg-04",
      maxAbsPerDimension: 3,
      options: [
        {
          optionId: "resolve",
          weights: [
            { dimension: "service_orientation", weight: 3 },
            { dimension: "conflict_management", weight: 2 },
          ],
        },
        {
          optionId: "calm_minimal",
          weights: [
            { dimension: "service_orientation", weight: 1 },
            { dimension: "conflict_management", weight: 1 },
          ],
        },
        { optionId: "defensive", weights: [{ dimension: "conflict_management", weight: -1 }] },
        {
          optionId: "handoff",
          weights: [
            { dimension: "service_orientation", weight: -1 },
            { dimension: "conflict_management", weight: -1 },
          ],
        },
      ],
    },
  },
  {
    id: "chg-05",
    version: 1,
    status: "draft",
    category: "stress-handling",
    competencies: ["comp-composure-under-pressure"],
    dimensions: ["conflict_management", "communication"],
    tags: ["profile:career_changer", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "scenario-based",
    content: {
      id: "chg-05",
      type: "single",
      topic: { sv: "Press från flera håll", en: "Pressure from multiple directions" },
      prompt: {
        sv: "Du får ett upprört telefonsamtal precis innan ett viktigt möte du inte kan skjuta upp. Vad gör du faktiskt?",
        en: "You get an upset phone call right before an important meeting you can't postpone. What do you actually do?",
      },
      options: [
        {
          id: "compartmentalize",
          label: {
            sv: "Hanterar samtalet lugnt och kortfattat, går sedan rakt in i mötet fokuserad",
            en: "Handle the call calmly and briefly, then go straight into the meeting focused",
          },
        },
        {
          id: "carry_some",
          label: {
            sv: "Hanterar samtalet, men bär med mig lite av det in i mötet",
            en: "Handle the call, but carry a bit of it into the meeting",
          },
        },
        {
          id: "affected",
          label: {
            sv: "Känner mig påverkad under en stor del av mötet",
            en: "Feel affected for a good part of the meeting",
          },
        },
        {
          id: "unfocused",
          label: {
            sv: "Har svårt att fokusera på mötet överhuvudtaget",
            en: "Struggle to focus on the meeting at all",
          },
        },
      ],
    },
    mapping: {
      questionId: "chg-05",
      maxAbsPerDimension: 3,
      options: [
        {
          optionId: "compartmentalize",
          weights: [{ dimension: "conflict_management", weight: 3 }],
        },
        { optionId: "carry_some", weights: [{ dimension: "conflict_management", weight: 1 }] },
        { optionId: "affected", weights: [{ dimension: "conflict_management", weight: -1 }] },
        {
          optionId: "unfocused",
          weights: [
            { dimension: "conflict_management", weight: -2 },
            { dimension: "communication", weight: -1 },
          ],
        },
      ],
    },
  },
  {
    // Reused verbatim = q10 ("Adaptability"), also present as sgf-05. The
    // scenario is illustrative ("for example a new access-control step"),
    // not experiential -- answerable without ever having worked security.
    id: "chg-06",
    version: 1,
    status: "published",
    category: "adaptability",
    competencies: ["comp-adaptability"],
    dimensions: ["learning_development", "operational_orientation"],
    tags: ["profile:career_changer", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "scenario-based",
    content: legacyQuestion("q10"),
    mapping: legacyMapping("q10"),
  },
  {
    // Reused verbatim = q16 ("Environment and role"), also present as sgf-08 / stu-07.
    id: "chg-07",
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
    tags: ["profile:career_changer", "preference"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "preference",
    content: legacyQuestion("q16"),
    mapping: legacyMapping("q16"),
  },
  {
    id: "chg-08",
    version: 1,
    status: "draft",
    category: "career-interests",
    competencies: ["comp-career-direction-preference"],
    dimensions: [
      "structure_documentation",
      "operational_orientation",
      "service_orientation",
      "technical_orientation",
      "analytical_orientation",
      "leadership_orientation",
    ],
    tags: ["profile:career_changer", "preference"],
    supportedAssessmentDefinitions: ["public-career-assessment"],
    evidenceType: "preference",
    content: {
      id: "chg-08",
      type: "single",
      topic: { sv: "Vad du vill ta med dig", en: "What you want to bring with you" },
      prompt: {
        sv: "Tänk på det du var bäst på i din tidigare bransch. Vilken typ av roll skulle bäst låta dig använda det vidare?",
        en: "Think about what you were best at in your previous field. Which kind of role would best let you keep using that?",
      },
      options: [
        {
          id: "structured",
          label: {
            sv: "En roll som belönar struktur och noggrannhet, som jag redan är bra på",
            en: "A role that rewards structure and precision, which I'm already good at",
          },
        },
        {
          id: "people",
          label: {
            sv: "En roll där jag fortsätter arbeta nära människor och kunder",
            en: "A role where I keep working closely with people and customers",
          },
        },
        {
          id: "analytical",
          label: {
            sv: "En roll där jag kan specialisera mig tekniskt eller analytiskt",
            en: "A role where I can specialise technically or analytically",
          },
        },
        {
          id: "leadership",
          label: {
            sv: "En roll där jag kan växa in i att leda andra",
            en: "A role where I can grow into leading others",
          },
        },
      ],
    },
    mapping: {
      questionId: "chg-08",
      maxAbsPerDimension: 3,
      options: [
        {
          optionId: "structured",
          weights: [
            { dimension: "structure_documentation", weight: 2 },
            { dimension: "operational_orientation", weight: 1 },
          ],
        },
        { optionId: "people", weights: [{ dimension: "service_orientation", weight: 3 }] },
        {
          optionId: "analytical",
          weights: [
            { dimension: "technical_orientation", weight: 2 },
            { dimension: "analytical_orientation", weight: 2 },
          ],
        },
        { optionId: "leadership", weights: [{ dimension: "leadership_orientation", weight: 3 }] },
      ],
    },
  },
];
