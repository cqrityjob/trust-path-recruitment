import type { Database } from "@/integrations/supabase/types";
type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Analysis = Row<"sw_assessments">;
export type Risk = Row<"sw_risks">;
export type Action = Row<"sw_actions">;
export type Report = Row<"sw_reports">;
export type AnalysisInput = Row<"sw_analysis_inputs">;
export type AnalysisQuestion = Row<"sw_analysis_questions">;
export type Document = Row<"sw_documents">;
export type ProcessingJob = Row<"sw_processing_jobs">;
export type Approval = Row<"sw_report_approvals">;
export type AiQuestionBasis = {
  jobId: string;
  originalQuestion: string;
  reason: string;
  citations: { sourceItemId: string; sourceTitle: string; quote: string }[];
};
export type Portfolio = {
  analyses: Analysis[];
  risks: Risk[];
  actions: Action[];
  reports: Report[];
  documents: Document[];
};
export type AnalysisDetail = {
  analysis: Analysis;
  inputs: AnalysisInput[];
  questions: AnalysisQuestion[];
  sourceItems: Row<"sw_source_items">[];
  citations: Row<"sw_citations">[];
  risks: Risk[];
  actions: Action[];
  reports: Report[];
  jobs: ProcessingJob[];
  questionBasis: Record<string, AiQuestionBasis>;
};
