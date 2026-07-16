import { defineTool } from "@lovable.dev/mcp-js";
import { questions } from "@/lib/assessment-content";

export default defineTool({
  name: "list_assessment_questions",
  title: "List assessment questions",
  description:
    "List the 16 Security Career Assessment questions. Each question includes id, type (single | multi | rating), bilingual prompt and topic, options (for single/multi) and scale bounds (for rating). Answer IDs from this list are what `compute_career_matches` accepts as input.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    return {
      content: [{ type: "text", text: JSON.stringify(questions, null, 2) }],
      structuredContent: { questions },
    };
  },
});
