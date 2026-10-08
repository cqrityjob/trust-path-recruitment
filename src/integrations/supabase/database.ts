import type { Database as GeneratedDatabase } from "./types";

// Keep the generator's output untouched. These SQL arguments have no DEFAULT,
// and their non-STRICT functions deliberately accept NULL. Lovable/Supabase
// regenerations therefore cannot erase the application's required nullability.
type Functions = GeneratedDatabase["public"]["Functions"];
type RequiredNullable<Args, Keys extends keyof Args> = Omit<Args, Keys> & {
  [Key in Keys]-?: Exclude<Args[Key], undefined> | null;
};
type UploadAttemptJson =
  GeneratedDatabase["public"]["Tables"]["scp_interview_reports"]["Row"]["payload"];
type EvidenceUploadFunctions = {
  sp_begin_evidence_upload: {
    Args: {
      _attempt_id: string;
      _claim_id: string | null;
      _period_id: string | null;
      _file_name: string;
      _mime_type: string;
      _size_bytes: number;
      _sha256: string;
    };
    Returns: UploadAttemptJson;
  };
  sp_reconcile_evidence_upload: { Args: { _attempt_id: string }; Returns: UploadAttemptJson };
  sp_list_my_evidence_upload_attempts: {
    Args: { _claim_id: string | null; _period_id: string | null };
    Returns: UploadAttemptJson;
  };
  sp_authorize_evidence_upload_cleanup: {
    Args: { _attempt_id: string };
    Returns: UploadAttemptJson;
  };
  sp_confirm_evidence_upload_cleanup: { Args: { _attempt_id: string }; Returns: UploadAttemptJson };
  sp_evidence_upload_storage_writable: { Args: { _path: string }; Returns: boolean };
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
      keyof Overrides | keyof FoundationFunctions | keyof EvidenceUploadFunctions
    > &
      Overrides &
      FoundationFunctions &
      EvidenceUploadFunctions;
    Tables: Omit<Tables, keyof TableOverrides> & TableOverrides;
  };
};
