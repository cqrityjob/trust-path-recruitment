import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { computeMatches } from "@/lib/career-assessment";
import { getProfession } from "@/lib/career-center";

// Answers per question. Values may be:
//   - a string (single-choice option id)
//   - a string array (multi-select option ids)
//   - a number (1..5 rating)
//   - null (skipped)
// Kept intentionally permissive; the engine validates ids against the question mappings.
const AnswerValue = z.union([z.string(), z.array(z.string()), z.number(), z.null()]);

export default defineTool({
  name: "compute_career_matches",
  title: "Compute career matches",
  description:
    "Run the Security Career Assessment matching engine against a set of answers and return ranked career matches. Input is a map from question id (q1..q16) to an answer value: option id string, array of option ids, 1..5 rating, or null. Use `list_assessment_questions` to discover valid ids. Results include displayed match indicator (0..100), confidence (limited | moderate | stronger), top contributing dimensions, gaps, and the user dimension vector. The indicator is guidance only, not a probability of professional success or eligibility.",
  inputSchema: {
    answers: z
      .record(z.string(), AnswerValue)
      .describe("Object keyed by question id (e.g. 'q1') with answer values."),
    topN: z
      .number()
      .int()
      .describe(
        "How many top matches to return (default 5). Values below 1 or above the profile count are clamped.",
      )
      .optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ answers, topN }) => {
    // Normalize null to undefined (engine treats missing answers as skipped).
    const cleaned: Record<string, string | string[] | number | undefined> = {};
    for (const [k, v] of Object.entries(answers ?? {})) cleaned[k] = v ?? undefined;

    const engine = computeMatches(cleaned);
    const limit = Math.max(1, Math.min(topN ?? 5, engine.matches.length));
    const top = engine.matches.slice(0, limit).map((m) => {
      const prof = getProfession(m.professionId);
      return {
        professionId: m.professionId,
        slug: prof?.slug ?? m.professionId,
        titleSv: prof?.titleSv,
        titleEn: prof?.titleEn,
        family: m.family,
        displayedMatch: m.displayedMatch,
        confidence: m.confidence,
        gatePassed: m.gatePassed,
        topDimensions: m.topDimensions,
        gaps: m.gaps,
        regulated: m.regulated,
        profileStatus: m.status,
      };
    });

    const payload = {
      matches: top,
      userVector: engine.userVector,
      disclaimer:
        "This is a guidance indicator based on the provided answers, not a probability of professional success or eligibility. Formal requirements are evaluated separately.",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
