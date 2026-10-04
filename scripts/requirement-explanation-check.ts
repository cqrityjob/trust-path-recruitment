import assert from "node:assert/strict";
import { requirementExplanation } from "../src/lib/recruitment/requirement-explanation";
const risk = { label_sv: "Riskbedömning", label_en: "Risk assessment" };
assert.match(requirementExplanation(risk, "sv")!, /sannolikhet och konsekvenser/);
assert.match(requirementExplanation(risk, "en")!, /likelihood and consequences/);
assert.equal(
  requirementExplanation(
    { ...risk, explanation_sv: "Arbetsgivarens publicerade katalogdefinition" },
    "sv",
  ),
  "Arbetsgivarens publicerade katalogdefinition",
);
assert.equal(
  requirementExplanation({ label_sv: "Okänt krav", label_en: "Unknown requirement" }, "sv"),
  null,
);
assert.equal(
  requirementExplanation({ label_sv: "Ledarskap i minst fem år", label_en: null }, "sv"),
  null,
  "Never replace employer qualifications using fuzzy label matching",
);
assert.equal(requirementExplanation(undefined, "en"), null);
console.log(
  "Requirement explanations: published definition, locale, fallback and no invented criteria passed.",
);
