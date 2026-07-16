import { defineTool } from "@lovable.dev/mcp-js";
import { dimensions } from "@/lib/career-assessment";

export default defineTool({
  name: "list_dimensions",
  title: "List guidance dimensions",
  description:
    "List the 14 guidance dimensions used by the Security Career Assessment matching engine (id, bilingual name and description, content status).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const payload = dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      status: d.status,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: { dimensions: payload },
    };
  },
});
