import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getProfessionProfile } from "@/lib/career-assessment";
import { getProfession } from "@/lib/career-center";

export default defineTool({
  name: "get_profession",
  title: "Get profession",
  description:
    "Return the full Career Center record plus the matching-engine target profile for one profession, looked up by id or slug (e.g. 'security-manager', 'ordningsvakt'). Includes bilingual titles, description, responsibilities, competencies, target dimensions, gate, and regulatory notes.",
  inputSchema: {
    id: z
      .string()
      .min(1)
      .describe("The profession id or slug, e.g. 'security-officer' or 'security-manager'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }) => {
    const profession = getProfession(id);
    if (!profession) {
      return {
        content: [{ type: "text", text: `No profession found for id/slug '${id}'.` }],
        isError: true,
      };
    }
    const profile = getProfessionProfile(profession.id);
    const payload = { profession, targetProfile: profile ?? null };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
