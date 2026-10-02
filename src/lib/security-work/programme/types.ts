import type { Database } from "@/integrations/supabase/types";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Mandate = Row<"sw_security_mandates">;
export type ProtectedAsset = Row<"sw_protected_assets">;
export type RiskAssetLink = Row<"sw_risk_assets">;
export type BaselineAssessment = Row<"sw_baseline_assessments">;
export type BaselineAnswer = Row<"sw_baseline_answers">;
export type Gap = Row<"sw_gaps">;
export type EvidenceLink = Row<"sw_evidence_links">;
export type AiSuggestion = Row<"sw_ai_suggestions">;
export type ProgrammePlan = Row<"sw_programme_plans">;
export type ManagementReport = Row<"sw_management_reports">;
export type Risk = Row<"sw_risks">;
export type Action = Row<"sw_actions">;
export type Analysis = Row<"sw_assessments">;
export type AnalysisReport = Row<"sw_reports">;

export type Lang = "sv" | "en";
export type Text = { sv: string; en: string };
export type Market = "global" | "se";
export type BaselineAnswerValue = "yes" | "partly" | "no" | "not_applicable";
export type MaturityLevel = 1 | 2 | 3 | 4;

export type SecurityDomainId =
  | "governance"
  | "personnel"
  | "physical"
  | "information_cyber"
  | "incident"
  | "continuity"
  | "suppliers"
  | "travel_events"
  | "culture_training"
  | "compliance";

export type ProgrammeAreaId =
  | "mandate"
  | "assets"
  | "risks"
  | "baseline"
  | "actions"
  | "reporting";
export type ProgrammeAreaStatus = "not_started" | "in_progress" | "needs_attention" | "complete";

/** Everything the deterministic rules need, as plain data. The server builds
 * it from RLS-scoped reads; the rules never read the database themselves. */
export type ProgrammeFacts = {
  today: string; // YYYY-MM-DD
  mandate: Mandate | null;
  assets: ProtectedAsset[];
  riskAssets: RiskAssetLink[];
  risks: Risk[];
  actions: Action[];
  gaps: Gap[];
  baseline: { assessment: BaselineAssessment | null; answers: BaselineAnswer[] };
  monitoring: { profileExists: boolean; requirements: number; pendingItems: number };
  analyses: Analysis[];
  analysisReports: AnalysisReport[];
  managementReports: ManagementReport[];
  plan: ProgrammePlan | null;
};
