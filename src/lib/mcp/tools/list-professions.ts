import { defineTool } from "@lovable.dev/mcp-js";
import { professionProfiles } from "@/lib/career-assessment";
import { getProfession } from "@/lib/career-center";

export default defineTool({
  name: "list_professions",
  title: "List professions",
  description:
    "List the pilot security-industry professions supported by the Career Center and matching engine. Returns id, slug, bilingual titles, family, content status, whether the role is regulated, and the profile status. Use `get_profession` for full detail.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const items = professionProfiles.map((p) => {
      const prof = getProfession(p.professionId);
      return {
        id: p.professionId,
        slug: prof?.slug ?? p.professionId,
        titleSv: prof?.titleSv,
        titleEn: prof?.titleEn,
        family: p.family,
        gate: p.gate,
        regulated: p.regulated ?? prof?.regulated ?? false,
        profileStatus: p.status,
        contentStatus: prof?.status,
      };
    });
    return {
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      structuredContent: { professions: items },
    };
  },
});
