import { candidateViewSchema } from "./definitions";

/** Old bookmarks keep their exact lifecycle filter; every new view uses the
 * shared server list contract. This parses navigation, never authorisation. */
export function applicationListSearch(raw: Record<string, unknown>) {
  const input = { ...raw };
  if (input.status === "archived") {
    input.stage = "archived";
    delete input.status;
  } else if (typeof input.status === "string" && !input.stage) input.stage = "all";
  if (input.sort === "newest" || input.sort === "oldest") {
    input.dir = input.sort === "oldest" ? "asc" : "desc";
    input.sort = "applied";
  } else if (input.sort === "waiting") {
    input.sort = "activity";
    input.stage = "open";
  }
  return candidateViewSchema.parse(input);
}
