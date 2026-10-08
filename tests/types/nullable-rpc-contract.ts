// Compiled by nullable-rpc-contract:check with BOTH current and regenerated
// generator output. These calls are type tests only and are never executed.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/database";
import type { Database as Generated } from "../../src/integrations/supabase/types";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type Functions = Database["public"]["Functions"];
type Bcp = Functions["bcp_conduct_record_resolution"]["Args"];
type Finalise = Functions["scp_iv_finalise_previewed_report"]["Args"];
type FoundationKeys =
  | "scp_iv_save_session_process"
  | "scp_iv_create_manual_finding"
  | "scp_iv_review_manual_finding"
  | "scp_iv_manual_finding_capabilities"
  | "scp_iv_case_content_manifest";
type RecruitmentIntelligenceKeys =
  | "rec_ri_get_profile"
  | "rec_ri_get_review"
  | "rec_ri_confirm_profile"
  | "rec_ri_save_review"
  | "rec_ri_manual_reference"
  | "rec_ri_transfer_requirements"
  | "rec_ri_candidate_view"
  | "rec_ri_overview_counts";
type FoundationColumns =
  | "origin"
  | "neutral_question"
  | "source_label"
  | "responsible_label"
  | "next_action"
  | "due_on"
  | "created_by"
  | "operation_id"
  | "creation_request_hash"
  | "revision"
  | "updated_at";
export type ContractAssertions = [
  Assert<Equal<Bcp["_agreed_statement"], string | null>>,
  Assert<Equal<Bcp["_divergent_statement"], string | null>>,
  Assert<Equal<Finalise["_draft_run_id"], string | null>>,
  Assert<Equal<Bcp["_rationale"], string>>,
  Assert<Equal<Bcp["_expected_revision"], number>>,
  Assert<Equal<Finalise["_case_id"], string>>,
  Assert<Equal<Finalise["_expected_basis_hash"], string>>,
  Assert<
    Equal<
      Omit<Database["public"]["Tables"], "scp_interview_findings">,
      Omit<Generated["public"]["Tables"], "scp_interview_findings">
    >
  >,
  Assert<
    Equal<
      Omit<Database["public"]["Tables"]["scp_interview_findings"], "Row">,
      Omit<Generated["public"]["Tables"]["scp_interview_findings"], "Row">
    >
  >,
  Assert<
    Equal<
      Omit<Database["public"]["Tables"]["scp_interview_findings"]["Row"], FoundationColumns>,
      Omit<Generated["public"]["Tables"]["scp_interview_findings"]["Row"], FoundationColumns>
    >
  >,
  Assert<Equal<Database["public"]["Views"], Generated["public"]["Views"]>>,
  Assert<
    Equal<
      Omit<
        Functions,
        | "bcp_conduct_record_resolution"
        | "scp_iv_finalise_previewed_report"
        | FoundationKeys
        | RecruitmentIntelligenceKeys
      >,
      Omit<
        Generated["public"]["Functions"],
        | "bcp_conduct_record_resolution"
        | "scp_iv_finalise_previewed_report"
        | FoundationKeys
        | RecruitmentIntelligenceKeys
      >
    >
  >,
  Assert<
    Equal<Functions["sentinel_session"], Generated["public"]["Functions"]["sentinel_session"]>
  >,
  Assert<
    Equal<
      Functions["scp_iv_finalise_previewed_report"]["Returns"],
      Generated["public"]["Functions"]["scp_iv_finalise_previewed_report"]["Returns"]
    >
  >,
];
export type FoundationAssertions = [
  Assert<Equal<Functions["scp_iv_create_manual_finding"]["Args"]["_question_id"], string | null>>,
  Assert<
    Equal<Functions["scp_iv_create_manual_finding"]["Args"]["_source_passage_id"], string | null>
  >,
  Assert<Equal<Functions["scp_iv_review_manual_finding"]["Args"]["_due_on"], string | null>>,
  Assert<Equal<Functions["scp_iv_save_session_process"]["Args"]["_expected_updated_at"], string>>,
  Assert<Equal<Database["public"]["Tables"]["scp_interview_findings"]["Row"]["revision"], number>>,
];
declare const client: SupabaseClient<Database>;
const resolution = {
  _operation_id: "synthetic",
  _panel_id: "synthetic",
  _expected_revision: 1,
  _item_key: "synthetic",
  _resolution_kind: "agreed",
  _rationale: "synthetic",
};
client.rpc("bcp_conduct_record_resolution", {
  ...resolution,
  _agreed_statement: "Agreed",
  _divergent_statement: null,
});
client.rpc("bcp_conduct_record_resolution", {
  ...resolution,
  _agreed_statement: null,
  _divergent_statement: "Divergent",
});
client.rpc("scp_iv_finalise_previewed_report", {
  _case_id: "synthetic",
  _expected_basis_hash: "synthetic",
  _draft_run_id: null,
});
client.rpc("scp_iv_create_manual_finding", {
  _case_id: "synthetic",
  _operation_id: "synthetic",
  _finding_kind: "gap",
  _statement: "Missing document",
  _neutral_question: "Which document applies?",
  _question_id: null,
  _source_passage_id: null,
  _source_label: "Application",
  _responsible_label: null,
  _next_action: "Request copy",
  _due_on: null,
});
// @ts-expect-error New nullable arguments are also required by their SQL contracts.
client.rpc("scp_iv_save_session_process", {
  _session_id: "synthetic",
  _reflection: null,
  _expected_updated_at: "synthetic",
});
// @ts-expect-error Nullable is not optional: both statement arguments must be supplied.
client.rpc("bcp_conduct_record_resolution", { ...resolution, _agreed_statement: null });
// @ts-expect-error Nullable is not optional: the draft argument must be supplied.
client.rpc("scp_iv_finalise_previewed_report", {
  _case_id: "synthetic",
  _expected_basis_hash: "synthetic",
});
const invalidRationale = {
  ...resolution,
  _rationale: null,
  _agreed_statement: null,
  _divergent_statement: null,
};
// @ts-expect-error Only the three documented arguments are nullable.
client.rpc("bcp_conduct_record_resolution", invalidRationale);
const invalidDraftId = {
  _case_id: "synthetic",
  _expected_basis_hash: "synthetic",
  _draft_run_id: 42,
};
// @ts-expect-error A nullable UUID is still a string, never a number.
client.rpc("scp_iv_finalise_previewed_report", invalidDraftId);

export type RecruitmentIntelligenceAssertions = [
  Assert<
    Equal<Functions["rec_ri_save_review"]["Args"]["_expected_assignment_version"], number | null>
  >,
  Assert<Equal<Functions["rec_ri_candidate_view"]["Args"]["_job_id"], string | null>>,
  Assert<Equal<Functions["rec_ri_confirm_profile"]["Args"]["_start_date"], string | null>>,
  Assert<Equal<Functions["rec_ri_save_review"]["Args"]["_responsible_user_id"], string | null>>,
  Assert<Equal<Functions["rec_ri_save_review"]["Args"]["_confirm"], boolean>>,
];
client.rpc("rec_ri_candidate_view", {
  _employer_id: "synthetic",
  _job_id: null,
  _filters: {},
  _sort: "requirements",
  _dir: null,
  _page: 1,
  _size: 25,
  _around: null,
});
// @ts-expect-error Required nullable job scope is not an optional SQL argument.
client.rpc("rec_ri_candidate_view", {
  _employer_id: "synthetic",
  _filters: {},
  _sort: "requirements",
  _dir: null,
  _page: 1,
  _size: 25,
  _around: null,
});
const invalidProfileVersion = {
  _job_id: "synthetic",
  _expected_version: null,
  _operation_id: "synthetic",
  _start_date: null,
  _rules: [],
};
// @ts-expect-error Profile version remains numeric; nullability does not loosen other fields.
client.rpc("rec_ri_confirm_profile", invalidProfileVersion);
