import { defineMcp } from "@lovable.dev/mcp-js";
import listDimensions from "./tools/list-dimensions";
import listQuestions from "./tools/list-questions";
import listProfessions from "./tools/list-professions";
import getProfession from "./tools/get-profession";
import computeCareerMatches from "./tools/compute-career-matches";

export default defineMcp({
  name: "cqrityjob-mcp",
  title: "CQrityjob Career Assessment",
  version: "0.1.0",
  instructions:
    "Tools that expose the CQrityjob Security Career Assessment: guidance dimensions, questions, profession target profiles, and the deterministic matching engine. Use `list_assessment_questions` to discover valid answer ids, then `compute_career_matches` to run the engine. All results are guidance indicators, not probability or eligibility claims.",
  tools: [listDimensions, listQuestions, listProfessions, getProfession, computeCareerMatches],
});
