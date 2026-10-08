import type { Database as GeneratedDatabase, Json } from "./types";

// Keep the generator's output untouched. These SQL arguments have no DEFAULT,
// and their non-STRICT functions deliberately accept NULL. Lovable/Supabase
// regenerations therefore cannot erase the application's required nullability.
type Functions = GeneratedDatabase["public"]["Functions"];
type RequiredNullable<Args, Keys extends keyof Args> = Omit<Args, Keys> & {
  [Key in Keys]-?: Exclude<Args[Key], undefined> | null;
};
type RecruitmentIntelligenceFunctions = {
  rec_ri_get_profile: { Args: { _job_id: string }; Returns: Json };
  rec_ri_get_review: { Args: { _application_id: string }; Returns: Json };
  rec_ri_confirm_profile: {
    Args: {
      _job_id: string;
      _expected_version: number;
      _operation_id: string;
      _start_date: string | null;
      _rules: Json;
    };
    Returns: Json;
  };
  rec_ri_save_review: {
    Args: {
      _application_id: string;
      _profile_id: string;
      _expected_revision: number;
      _binding_token: string;
      _operation_id: string;
      _decisions: Json;
      _confirm: boolean;
      _next_action: string | null;
      _responsible_user_id: string | null;
      _expected_assignment_version: number | null;
    };
    Returns: Json;
  };
  rec_ri_manual_reference: { Args: { _application_id: string; _label: string }; Returns: Json };
  rec_ri_transfer_requirements: {
    Args: {
      _application_id: string;
      _case_id: string;
      _expected_revision: number;
      _binding_token: string;
      _operation_id: string;
      _requirement_ids: string[];
    };
    Returns: Json;
  };
  rec_ri_overview_counts: { Args: { _employer_id: string }; Returns: Json };
  rec_ri_candidate_view: {
    Args: {
      _employer_id: string;
      _job_id: string | null;
      _filters: Json;
      _sort: string;
      _dir: string | null;
      _page: number;
      _size: number;
      _around: string | null;
    };
    Returns: Json;
  };
};
type FoundationFunctions = {
  scp_iv_case_frozen_labels: {
    Args: { _case_ids: string[] };
    Returns: {
      case_id: string;
      name_sv_at_freeze: string | null;
      name_en_at_freeze: string | null;
      content_status_at_freeze: string | null;
      validation_label_at_freeze: string | null;
      provenance: string;
      frozen_at: string;
    }[];
  };
  scp_iv_case_frozen_content: {
    Args: { _case_id: string };
    Returns: GeneratedDatabase["public"]["Tables"]["scp_interview_reports"]["Row"]["payload"];
  };
  scp_iv_acknowledge_observed_content: {
    Args: { _case_id: string; _expected_manifest_hash: string; _note: string };
    Returns: GeneratedDatabase["public"]["Tables"]["scp_interview_reports"]["Row"]["payload"];
  };
  scp_iv_content_inventory: {
    Args: { _employer_id: string };
    Returns: {
      case_id: string;
      status: string;
      created_at: string;
      provenance: string;
      frozen_at: string;
      manifest_hash: string;
      requires_acknowledgement: boolean;
    }[];
  };
  // Schema-first RI v0.3 P0. Handwritten contracts live beside the existing
  // nullable overlay so a generator refresh cannot erase required NULLs.
  scp_iv_save_session_process: {
    Args: {
      _session_id: string;
      _reflection: string | null;
      _deviations: string | null;
      _expected_updated_at: string;
    };
    Returns: { session_id: string; updated_at: string }[];
  };
  scp_iv_create_manual_finding: {
    Args: {
      _case_id: string;
      _operation_id: string;
      _finding_kind: string;
      _statement: string;
      _neutral_question: string;
      _question_id: string | null;
      _source_passage_id: string | null;
      _source_label: string | null;
      _responsible_label: string | null;
      _next_action: string;
      _due_on: string | null;
    };
    Returns: { finding_id: string; revision: number; updated_at: string }[];
  };
  scp_iv_review_manual_finding: {
    Args: {
      _finding_id: string;
      _expected_revision: number;
      _resolution_state: string;
      _human_note: string;
      _responsible_label: string | null;
      _next_action: string;
      _due_on: string | null;
    };
    Returns: { finding_id: string; revision: number; updated_at: string }[];
  };
  scp_iv_case_content_manifest: {
    Args: { _case_id: string };
    Returns: GeneratedDatabase["public"]["Tables"]["scp_interview_reports"]["Row"]["payload"];
  };
  scp_iv_manual_finding_capabilities: {
    Args: { _case_id: string };
    Returns: { may_create: boolean; may_review: boolean }[];
  };
};
type Overrides = {
  bcp_conduct_record_resolution: Omit<Functions["bcp_conduct_record_resolution"], "Args"> & {
    Args: RequiredNullable<
      Functions["bcp_conduct_record_resolution"]["Args"],
      "_agreed_statement" | "_divergent_statement"
    >;
  };
  scp_iv_finalise_previewed_report: Omit<Functions["scp_iv_finalise_previewed_report"], "Args"> & {
    Args: RequiredNullable<Functions["scp_iv_finalise_previewed_report"]["Args"], "_draft_run_id">;
  };
};
type Tables = GeneratedDatabase["public"]["Tables"];
type FindingFields = {
  origin: string | null;
  neutral_question: string | null;
  source_label: string | null;
  responsible_label: string | null;
  next_action: string | null;
  due_on: string | null;
  operation_id: string | null;
  creation_request_hash: string | null;
  created_by: string | null;
  revision: number;
  updated_at: string;
};
type TableOverrides = {
  scp_interview_findings: Omit<Tables["scp_interview_findings"], "Row"> & {
    Row: Omit<Tables["scp_interview_findings"]["Row"], keyof FindingFields> & FindingFields;
  };
};
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions" | "Tables"> & {
    Functions: Omit<
      Functions,
      keyof Overrides | keyof FoundationFunctions | keyof RecruitmentIntelligenceFunctions
    > &
      Overrides &
      FoundationFunctions &
      RecruitmentIntelligenceFunctions;
    Tables: Omit<Tables, keyof TableOverrides> & TableOverrides;
  };
};
