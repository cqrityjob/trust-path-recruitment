import { z } from "zod";
import type { Text } from "./types";

/**
 * CQrityjob Security AI: one assistant, context-aware capabilities. Each
 * capability names the records that may be sent (and nothing else), the
 * shape of the proposal that comes back, and whether a human decision is
 * required before anything is created from it.
 *
 * Deterministic values (programme status, maturity, risk scores, ownership,
 * acceptance, approval) are never produced here.
 */
export const SW_ASSISTANT_PROMPT_VERSION = "sw-assistant-prompt-1.0.0";

export type AssistantContextKind =
  | "workspace"
  | "mandate"
  | "asset"
  | "risk"
  | "gap"
  | "baseline_question"
  | "action"
  | "management_report";

export type CapabilityId =
  | "mandate_draft"
  | "mandate_ceo_questions"
  | "asset_suggestions"
  | "asset_missing"
  | "risk_scenario"
  | "risk_controls"
  | "baseline_explain"
  | "baseline_good_looks_like"
  | "gap_action"
  | "report_narrative"
  | "explain_term";

export type SuggestionKind =
  | "mandate_draft"
  | "asset_suggestions"
  | "risk_scenario"
  | "gap_action"
  | "report_narrative"
  | "explanation"
  | "question_list";

export type Capability = {
  id: CapabilityId;
  kind: SuggestionKind;
  contexts: AssistantContextKind[];
  label: Text;
  /** Text shown while AI is unavailable: the deterministic help that exists anyway. */
  fallback: Text;
  decisionRequired: boolean;
};

export const CAPABILITIES: Capability[] = [
  {
    id: "mandate_draft",
    kind: "mandate_draft",
    contexts: ["mandate"],
    label: { sv: "Skriv utkast till mitt säkerhetsuppdrag", en: "Draft my security mandate" },
    fallback: {
      sv: "Skriv uppdraget själv utifrån fälten ovan: vad funktionen ska skydda, vem den rapporterar till, vem som får acceptera risk och när uppdraget ses över.",
      en: "Write the mandate yourself from the fields above: what the function protects, whom it reports to, who may accept risk and when it is reviewed.",
    },
    decisionRequired: true,
  },
  {
    id: "mandate_ceo_questions",
    kind: "question_list",
    contexts: ["mandate", "workspace"],
    label: { sv: "Hjälp mig förbereda frågor till VD", en: "Help me prepare questions for the CEO" },
    fallback: {
      sv: "Fråga: Vad får absolut inte hända? Vilka beslut vill du att jag tar själv? Vem accepterar risk? Vilka krav från kunder och myndigheter oroar dig mest?",
      en: "Ask: What must never happen? Which decisions do you want me to take myself? Who accepts risk? Which customer and regulatory requirements worry you most?",
    },
    decisionRequired: false,
  },
  {
    id: "asset_suggestions",
    kind: "asset_suggestions",
    contexts: ["workspace", "asset"],
    label: { sv: "Föreslå skyddsvärden utifrån verksamhetsbeskrivningen", en: "Suggest protected assets from the organisation description" },
    fallback: {
      sv: "Gå igenom kategorierna: personer, verksamhet, lokaler, information, system, leverantörer och anseende. Vad måste fungera för att ni ska nå era mål?",
      en: "Walk through the categories: people, operations, facilities, information, systems, suppliers and reputation. What must keep working for you to meet your goals?",
    },
    decisionRequired: true,
  },
  {
    id: "asset_missing",
    kind: "explanation",
    contexts: ["workspace", "asset"],
    label: { sv: "Vad kan jag ha missat?", en: "What might I be missing?" },
    fallback: {
      sv: "Vanliga luckor: nyckelpersoner, leverantörer som ni inte kan byta snabbt, information hos partner, platser utanför huvudkontoret och funktioner som ingen äger.",
      en: "Common gaps: key people, suppliers you cannot replace quickly, information held by partners, sites outside head office and functions nobody owns.",
    },
    decisionRequired: false,
  },
  {
    id: "risk_scenario",
    kind: "risk_scenario",
    contexts: ["risk", "asset"],
    label: { sv: "Hjälp mig beskriva scenariot", en: "Help me describe this scenario" },
    fallback: {
      sv: "Beskriv hotet (vem eller vad), hur skyddsvärdet påverkas, vilka skydd som finns i dag och vad som är osäkert. Sannolikhet och konsekvens bedömer du själv.",
      en: "Describe the threat (who or what), how the asset is affected, what protection exists today and what is uncertain. You rate likelihood and consequence yourself.",
    },
    decisionRequired: true,
  },
  {
    id: "risk_controls",
    kind: "explanation",
    contexts: ["risk"],
    label: { sv: "Föreslå möjliga skyddsåtgärder", en: "Suggest possible controls" },
    fallback: {
      sv: "Tänk i lager: förebygga, upptäcka, begränsa och återhämta. Vilka åtgärder finns redan, och vilken av dem skulle minska risken mest?",
      en: "Think in layers: prevent, detect, limit and recover. Which controls exist already, and which one would reduce the risk most?",
    },
    decisionRequired: false,
  },
  {
    id: "baseline_explain",
    kind: "explanation",
    contexts: ["baseline_question"],
    label: { sv: "Förklara frågan", en: "Explain this question" },
    fallback: {
      sv: "Läs 'Varför det spelar roll' och exemplet på underlag under frågan. Svara utifrån hur det faktiskt fungerar i dag, inte hur det borde vara.",
      en: "Read 'Why it matters' and the evidence example under the question. Answer from how things actually work today, not how they should be.",
    },
    decisionRequired: false,
  },
  {
    id: "baseline_good_looks_like",
    kind: "explanation",
    contexts: ["baseline_question"],
    label: { sv: "Förklara hur bra ser ut", en: "Explain what good looks like" },
    fallback: {
      sv: "Bra ser ut som: beslutat, dokumenterat, känt av berörda, uppföljt och justerat när något ändras.",
      en: "Good looks like: decided, documented, known by those concerned, followed up and adjusted when something changes.",
    },
    decisionRequired: false,
  },
  {
    id: "gap_action",
    kind: "gap_action",
    contexts: ["gap"],
    label: { sv: "Föreslå praktiska åtgärder för gapet", en: "Suggest practical actions for this gap" },
    fallback: {
      sv: "En bra åtgärd är konkret, har en ägare, ett datum och ett tydligt resultat. Börja med den minsta åtgärd som stänger gapet.",
      en: "A good action is concrete, has an owner, a date and a clear result. Start with the smallest action that closes the gap.",
    },
    decisionRequired: true,
  },
  {
    id: "report_narrative",
    kind: "report_narrative",
    contexts: ["management_report"],
    label: { sv: "Skriv utkast till ledningssammanfattningen", en: "Draft the management summary" },
    fallback: {
      sv: "Skriv tre stycken: läget i dag, vad som förändrats och vad ledningen behöver besluta. Använd siffrorna under 'Systemberäknat'.",
      en: "Write three paragraphs: the position today, what has changed and what management needs to decide. Use the numbers under 'System-calculated'.",
    },
    decisionRequired: true,
  },
  {
    id: "explain_term",
    kind: "explanation",
    contexts: ["workspace", "risk", "gap", "mandate", "asset", "action", "baseline_question", "management_report"],
    label: { sv: "Förklara en term", en: "Explain a term" },
    fallback: {
      sv: "Hjälptexterna i varje modul förklarar de begrepp som används. AI-förklaringar är inte tillgängliga just nu.",
      en: "The help texts in each module explain the terms used. AI explanations are not available right now.",
    },
    decisionRequired: false,
  },
];
export function capabilitiesFor(context: AssistantContextKind) {
  return CAPABILITIES.filter((capability) => capability.contexts.includes(context));
}
export function capability(id: CapabilityId) {
  const found = CAPABILITIES.find((capability) => capability.id === id);
  if (!found) throw new Error(`Unknown capability ${id}`);
  return found;
}

const bounded = (max: number) => z.string().trim().min(1).max(max);
/** The only shapes an AI answer may take. Anything else is rejected and no
 * suggestion is stored. No field carries a score, a level, an owner or a
 * decision. */
export const suggestionContentSchemas = {
  mandate_draft: z.object({ text: bounded(16000), caveats: z.array(bounded(500)).max(10) }).strict(),
  asset_suggestions: z
    .object({
      assets: z
        .array(
          z
            .object({
              name: bounded(300),
              category: z.enum(["people", "operations", "facilities", "information", "systems", "suppliers", "reputation", "other"]),
              reason: bounded(1000),
            })
            .strict(),
        )
        .min(1)
        .max(15),
    })
    .strict(),
  risk_scenario: z
    .object({
      threat_scenario: bounded(4000),
      description: bounded(8000),
      missing_information: z.array(bounded(500)).max(10),
      questions: z.array(bounded(500)).max(10),
    })
    .strict(),
  gap_action: z
    .object({
      actions: z
        .array(
          z
            .object({
              title: bounded(500),
              description: bounded(4000),
              why: bounded(1000),
            })
            .strict(),
        )
        .min(1)
        .max(5),
    })
    .strict(),
  report_narrative: z
    .object({
      sections: z.record(bounded(16000)).refine((value) => Object.keys(value).length <= 12),
      caveats: z.array(bounded(500)).max(10),
    })
    .strict(),
  explanation: z.object({ text: bounded(8000) }).strict(),
  question_list: z.object({ questions: z.array(bounded(500)).min(1).max(15) }).strict(),
} satisfies Record<SuggestionKind, z.ZodTypeAny>;
export type SuggestionContent<K extends SuggestionKind> = z.infer<(typeof suggestionContentSchemas)[K]>;
export function parseSuggestionContent<K extends SuggestionKind>(kind: K, value: unknown) {
  return suggestionContentSchemas[kind].safeParse(value) as z.SafeParseReturnType<unknown, SuggestionContent<K>>;
}
