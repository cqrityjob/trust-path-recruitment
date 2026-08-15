// Regression check for the minimal AI Experience Layer (Master Completion
// Mandate items 13-15): the report must work completely without AI, a
// supplied AI call is used when it succeeds, and an AI failure degrades
// silently to the deterministic path rather than breaking the report.

import {
  buildAiExplanationContext,
  generateEnrichedExplanation,
  type AiExplanationContext,
} from "../src/lib/career-discovery/v31/ai-explanation";
import { explainMatch } from "../src/lib/career-discovery/v31/profession-explanations";
import type { ProfessionMatch } from "../src/lib/career-discovery/v31/professions";
import type { DimensionId } from "../src/lib/career-discovery/v31/dimensions";

let failures = 0;
let checks = 0;

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

function group(name: string): void {
  console.log(`\n${name}`);
}

const MATCH: ProfessionMatch = {
  professionId: "SP008",
  cigProfessionSlug: "soc-analytiker",
  careerAreaId: "SCA09",
  titleSv: "SOC-analytiker",
  titleEn: "SOC Analyst",
  fitTier: "strong",
  stage: "explore_now",
  regulated: false,
  inclusionRationaleSv: "test",
  inclusionRationaleEn: "test",
  limitationNoteSv: null,
  limitationNoteEn: null,
  alignedDimensions: ["CID04", "CID03"] as DimensionId[],
  coverage: 1,
  contextCorroborated: true,
};

const dimensionScores: Readonly<Record<DimensionId, number | null>> = {
  CID01: null, CID02: null, CID03: 0.85, CID04: 0.9, CID05: null, CID06: null, CID07: null,
  CID08: null, CID09: null, CID10: null, CID11: null, CID12: null, CID13: null, CID14: null,
  CID15: null, CID16: null,
};

function buildContext(locale: "sv" | "en"): AiExplanationContext {
  return buildAiExplanationContext({
    match: MATCH,
    explanation: explainMatch(MATCH, locale),
    locale,
    leadingPatternName: "Test pattern",
    dimensionScores,
    experienceBand: "1_3y",
  });
}

// =========================================================================
group("1 · Context assembly never leaks raw data beyond the deterministic explanation");
// =========================================================================

const ctxSv = buildContext("sv");
ok(ctxSv.profession.professionId === "SP008", "1.1 context carries the profession id");
ok(ctxSv.profession.title === "SOC-analytiker", "1.2 title resolved to the requested locale");
ok(
  ctxSv.dimensionHighlights.every((h) => h.id === "CID03" || h.id === "CID04"),
  "1.3 dimension highlights are exactly the match's own alignedDimensions -- nothing invented",
);
ok(
  ctxSv.dimensionHighlights.find((h) => h.id === "CID04")?.band === "high",
  "1.4 a 0.9 score bands as 'high', qualitative only -- no raw number reaches the context",
);
ok(
  !JSON.stringify(ctxSv).includes("0.9") && !JSON.stringify(ctxSv).includes("0.85"),
  "1.5 no raw dimension score value appears anywhere in the serialized context",
);

// =========================================================================
group("2 · Deterministic fallback works completely with no AI call supplied");
// =========================================================================

const fallbackSv = await generateEnrichedExplanation(ctxSv);
ok(fallbackSv.provenance.source === "deterministic_fallback", "2.1 source is deterministic_fallback when no aiCall is given");
ok(fallbackSv.text.length > 0, "2.2 fallback produces non-empty text");
ok(fallbackSv.text.includes("SOC-analytiker"), "2.3 fallback text mentions the actual profession");
ok(!("provider" in fallbackSv.provenance) || fallbackSv.provenance.provider === undefined, "2.4 no provider/model recorded for a fallback-sourced explanation");

const fallbackEn = await generateEnrichedExplanation(buildContext("en"));
ok(fallbackEn.text.includes("SOC Analyst"), "2.5 English fallback resolves the English title, not a mix of locales");

// =========================================================================
group("3 · A supplied AI call is used when it succeeds");
// =========================================================================

const mockAiText = "A mocked, provider-generated explanation.";
// The timestamp is injected at the boundary — the module itself never reads
// the clock, so the same context+timestamp always yields the same result.
const STAMP = "2026-08-15T00:00:00.000Z";
const successResult = await generateEnrichedExplanation(ctxSv, async () => mockAiText, STAMP);
ok(successResult.text === mockAiText, "3.1 the AI call's text is used verbatim when it succeeds");
ok(successResult.provenance.source === "ai", "3.2 provenance.source is 'ai' when the call succeeds");
ok(
  successResult.provenance.generatedAt === STAMP,
  "3.3 the caller-injected generation timestamp is recorded verbatim",
);
ok(
  (await generateEnrichedExplanation(ctxSv, async () => mockAiText)).provenance.generatedAt === null,
  "3.4 omitting the timestamp yields null provenance rather than a clock read",
);
ok(
  JSON.stringify(await generateEnrichedExplanation(ctxSv, undefined, STAMP)) ===
    JSON.stringify(await generateEnrichedExplanation(ctxSv, undefined, STAMP)),
  "3.5 two runs with identical input are byte-identical (no clock, no randomness)",
)

// =========================================================================
group("4 · An AI failure degrades silently to the deterministic path");
// =========================================================================

const failureResult = await generateEnrichedExplanation(ctxSv, async () => {
  throw new Error("simulated provider outage");
});
ok(failureResult.provenance.source === "deterministic_fallback", "4.1 a throwing aiCall falls back, does not propagate the error");
ok(failureResult.text.length > 0, "4.2 the report still gets valid explanation text after an AI failure");

const emptyResult = await generateEnrichedExplanation(ctxSv, async () => "");
ok(emptyResult.provenance.source === "deterministic_fallback", "4.3 an empty AI response also falls back rather than showing blank text");

// =========================================================================
console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`career-discovery-v31-ai-explanation-check: all ${checks} checks passed.`);
