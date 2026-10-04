import { competencies } from "@/lib/career-center/competencies";

type Requirement = {
  label_sv: string | null;
  label_en: string | null;
  explanation_sv?: string | null;
  explanation_en?: string | null;
};
const normalize = (value: string | null) => value?.trim().toLocaleLowerCase() ?? "";
// Plain-language definitions approved in the user report, used only for exact
// labels when the published catalogue has no definition. They add no criteria.
const fallback = [
  {
    sv: "Ledarskap",
    en: "Leadership",
    definition: {
      sv: "Att leda och samordna människor, tydliggöra ansvar och följa upp arbetet.",
      en: "Leading and coordinating people, clarifying responsibilities and following up on work.",
    },
  },
  {
    sv: "Riskbedömning",
    en: "Risk assessment",
    definition: {
      sv: "Att identifiera vad som kan gå fel, bedöma sannolikhet och konsekvenser samt föreslå åtgärder.",
      en: "Identifying what could go wrong, assessing likelihood and consequences, and proposing measures.",
    },
  },
  {
    sv: "Strategisk säkerhet",
    en: "Strategic security",
    definition: {
      sv: "Att planera och utveckla säkerhetsarbetet utifrån verksamhetens mål, risker och långsiktiga behov.",
      en: "Planning and developing security work based on the organisation’s goals, risks and long-term needs.",
    },
  },
];
export function requirementExplanation(
  requirement: Requirement | undefined,
  lang: "sv" | "en",
): string | null {
  if (!requirement) return null;
  const published = lang === "sv" ? requirement.explanation_sv : requirement.explanation_en;
  if (published?.trim()) return published;
  const matches = (sv: string, en: string) =>
    normalize(requirement.label_sv) === normalize(sv) ||
    normalize(requirement.label_en) === normalize(en);
  const catalogue = competencies.find((c) => matches(c.name.sv, c.name.en));
  if (catalogue) return catalogue.definition[lang];
  return fallback.find((c) => matches(c.sv, c.en))?.definition[lang] ?? null;
}
