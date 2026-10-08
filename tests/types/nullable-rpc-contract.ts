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
  | "scp_iv_case_content_manifest"
  | "scp_iv_case_frozen_content"
  | "scp_iv_acknowledge_observed_content"
  | "scp_iv_content_inventory"
  | "scp_iv_case_frozen_labels";
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
        "bcp_conduct_record_resolution" | "scp_iv_finalise_previewed_report" | FoundationKeys
      >,
      Omit<
        Generated["public"]["Functions"],
        "bcp_conduct_record_resolution" | "scp_iv_finalise_previewed_report" | FoundationKeys
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
type ReportPayload = Generated["public"]["Tables"]["scp_interview_reports"]["Row"]["payload"];
export type SnapshotAssertions = [
  Assert<Equal<Functions["scp_iv_case_frozen_content"]["Args"], { _case_id: string }>>,
  Assert<Equal<Functions["scp_iv_case_frozen_content"]["Returns"], ReportPayload>>,
  Assert<
    Equal<
      Functions["scp_iv_acknowledge_observed_content"]["Args"],
      {
        _case_id: string;
        _expected_manifest_hash: string;
        _note: string;
      }
    >
  >,
  Assert<Equal<Functions["scp_iv_acknowledge_observed_content"]["Returns"], ReportPayload>>,
  Assert<Equal<Functions["scp_iv_content_inventory"]["Args"], { _employer_id: string }>>,
  Assert<
    Equal<
      Functions["scp_iv_content_inventory"]["Returns"],
      {
        case_id: string;
        status: string;
        created_at: string;
        provenance: string;
        frozen_at: string;
        manifest_hash: string;
        requires_acknowledgement: boolean;
      }[]
    >
  >,
  Assert<Equal<Functions["scp_iv_case_frozen_labels"]["Args"], { _case_ids: string[] }>>,
  Assert<
    Equal<
      Functions["scp_iv_case_frozen_labels"]["Returns"],
      {
        case_id: string;
        name_sv_at_freeze: string | null;
        name_en_at_freeze: string | null;
        content_status_at_freeze: string | null;
        validation_label_at_freeze: string | null;
        provenance: string;
        frozen_at: string;
      }[]
    >
  >,
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
client.rpc("scp_iv_case_frozen_content", { _case_id: "synthetic" });
client.rpc("scp_iv_acknowledge_observed_content", {
  _case_id: "synthetic",
  _expected_manifest_hash: "synthetic",
  _note: "Reviewed observed content",
});
client.rpc("scp_iv_content_inventory", { _employer_id: "synthetic" });
client.rpc("scp_iv_case_frozen_labels", { _case_ids: ["synthetic"] });
client.rpc("scp_iv_case_frozen_labels", { _case_ids: [] });
// @ts-expect-error Frozen case IDs are required, never nullable.
client.rpc("scp_iv_case_frozen_content", { _case_id: null });
// @ts-expect-error Acknowledgement always names the exact expected manifest hash.
client.rpc("scp_iv_acknowledge_observed_content", { _case_id: "synthetic", _note: "Reviewed" });
// @ts-expect-error Inventory requires its employer UUID argument.
client.rpc("scp_iv_content_inventory", {});
// @ts-expect-error Frozen label batching requires an array, never one string.
client.rpc("scp_iv_case_frozen_labels", { _case_ids: "synthetic" });
// @ts-expect-error NULL array elements are rejected by the SQL contract.
client.rpc("scp_iv_case_frozen_labels", { _case_ids: [null] });
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
