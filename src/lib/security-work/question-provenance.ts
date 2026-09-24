import type { Database } from "@/integrations/supabase/types";
import type { AiQuestionBasis } from "./analysis-types";
import { analysisOutputSchema } from "./processing/contracts";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
type Job = Pick<
  Row<"sw_processing_jobs">,
  "id" | "workspace_id" | "assessment_id" | "status" | "output"
>;
type Receipt = Pick<
  Row<"sw_ai_draft_applications">,
  "workspace_id" | "assessment_id" | "job_id" | "question_ids"
>;
type Source = Pick<
  Row<"sw_source_items">,
  "id" | "workspace_id" | "original_title" | "factual_extract"
>;

/** Recover original proposal context from immutable application receipts, never
 * by matching editable question wording or guessing the most recent AI job. */
export function originalQuestionBasis(
  workspaceId: string,
  assessmentId: string,
  questionIds: readonly string[],
  jobs: readonly Job[],
  receipts: readonly Receipt[],
  sources: readonly Source[],
): Record<string, AiQuestionBasis> {
  const questions = new Set(questionIds);
  const sourceById = new Map(
    sources.filter((s) => s.workspace_id === workspaceId).map((s) => [s.id, s]),
  );
  const jobById = new Map(
    jobs
      .filter(
        (j) =>
          j.workspace_id === workspaceId &&
          j.assessment_id === assessmentId &&
          j.status === "succeeded",
      )
      .map((j) => [j.id, j]),
  );
  const result: Record<string, AiQuestionBasis> = {};
  for (const receipt of receipts) {
    if (receipt.workspace_id !== workspaceId || receipt.assessment_id !== assessmentId) continue;
    const job = jobById.get(receipt.job_id);
    const parsed = analysisOutputSchema.safeParse(job?.output);
    if (!job || !parsed.success || receipt.question_ids.length !== parsed.data.followups.length)
      continue;
    receipt.question_ids.forEach((questionId, index) => {
      if (!questions.has(questionId)) return;
      const proposal = parsed.data.followups[index];
      if (!proposal.uncertainty.trim()) return;
      const citations = proposal.citations.flatMap((citation) => {
        const source = sourceById.get(citation.sourceItemId);
        return source?.factual_extract.includes(citation.quote)
          ? [{ sourceItemId: source.id, sourceTitle: source.original_title, quote: citation.quote }]
          : [];
      });
      result[questionId] = {
        jobId: job.id,
        originalQuestion: proposal.statement,
        reason: proposal.uncertainty,
        citations,
      };
    });
  }
  return result;
}
