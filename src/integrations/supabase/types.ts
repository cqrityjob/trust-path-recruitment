export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assessment_assignments: {
        Row: {
          answers: Json | null
          application_id: string | null
          assessment_id: string | null
          assessment_run_id: string | null
          assessment_version_id: string | null
          assigned_by: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          completion_id: string | null
          created_at: string
          email_delivery_error: string | null
          email_delivery_status: string
          email_sent_at: string | null
          employee_id: string | null
          employer_id: string
          employer_message: string | null
          engine_result: Json | null
          expires_at: string
          id: string
          invitation_token_hash: string
          invited_at: string
          job_id: string | null
          language: string
          opened_at: string | null
          profile_id: string | null
          recipient_email: string
          recipient_user_id: string | null
          scp_assessment_version_id: string | null
          scp_open: boolean
          started_at: string | null
          status: string
          updated_at: string
          use_case: string
        }
        Insert: {
          answers?: Json | null
          application_id?: string | null
          assessment_id?: string | null
          assessment_run_id?: string | null
          assessment_version_id?: string | null
          assigned_by: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completion_id?: string | null
          created_at?: string
          email_delivery_error?: string | null
          email_delivery_status?: string
          email_sent_at?: string | null
          employee_id?: string | null
          employer_id: string
          employer_message?: string | null
          engine_result?: Json | null
          expires_at: string
          id?: string
          invitation_token_hash: string
          invited_at?: string
          job_id?: string | null
          language?: string
          opened_at?: string | null
          profile_id?: string | null
          recipient_email: string
          recipient_user_id?: string | null
          scp_assessment_version_id?: string | null
          scp_open?: boolean
          started_at?: string | null
          status?: string
          updated_at?: string
          use_case: string
        }
        Update: {
          answers?: Json | null
          application_id?: string | null
          assessment_id?: string | null
          assessment_run_id?: string | null
          assessment_version_id?: string | null
          assigned_by?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completion_id?: string | null
          created_at?: string
          email_delivery_error?: string | null
          email_delivery_status?: string
          email_sent_at?: string | null
          employee_id?: string | null
          employer_id?: string
          employer_message?: string | null
          engine_result?: Json | null
          expires_at?: string
          id?: string
          invitation_token_hash?: string
          invited_at?: string
          job_id?: string | null
          language?: string
          opened_at?: string | null
          profile_id?: string | null
          recipient_email?: string
          recipient_user_id?: string | null
          scp_assessment_version_id?: string | null
          scp_open?: boolean
          started_at?: string | null
          status?: string
          updated_at?: string
          use_case?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_assignments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_assignments_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_assignments_assessment_run_id_fkey"
            columns: ["assessment_run_id"]
            isOneToOne: false
            referencedRelation: "assessment_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_assignments_assessment_version_id_fkey"
            columns: ["assessment_version_id"]
            isOneToOne: false
            referencedRelation: "assessment_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_assignments_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_assignments_scp_assessment_version_id_fkey"
            columns: ["scp_assessment_version_id"]
            isOneToOne: false
            referencedRelation: "scp_assessment_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_responses: {
        Row: {
          answer: Json
          created_at: string
          id: string
          question_id: string
          run_id: string
          user_id: string
        }
        Insert: {
          answer: Json
          created_at?: string
          id?: string
          question_id: string
          run_id: string
          user_id: string
        }
        Update: {
          answer?: Json
          created_at?: string
          id?: string
          question_id?: string
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_responses_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "assessment_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_run_reports: {
        Row: {
          completion_id: string
          created_at: string
          engine_version: string
          graph_version: string
          inputs_hash: string
          locale: string
          profile_version: string
          report: Json
          report_version: string
          run_id: string
          user_id: string
        }
        Insert: {
          completion_id: string
          created_at?: string
          engine_version: string
          graph_version: string
          inputs_hash: string
          locale?: string
          profile_version: string
          report: Json
          report_version: string
          run_id: string
          user_id: string
        }
        Update: {
          completion_id?: string
          created_at?: string
          engine_version?: string
          graph_version?: string
          inputs_hash?: string
          locale?: string
          profile_version?: string
          report?: Json
          report_version?: string
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_run_reports_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "assessment_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_runs: {
        Row: {
          assessment_id: string
          assessment_version_id: string
          completed_at: string | null
          created_at: string
          graph_version: string
          id: string
          locale: string
          profile_snapshot: Json | null
          result_summary: Json
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assessment_id: string
          assessment_version_id: string
          completed_at?: string | null
          created_at?: string
          graph_version: string
          id?: string
          locale?: string
          profile_snapshot?: Json | null
          result_summary?: Json
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assessment_id?: string
          assessment_version_id?: string
          completed_at?: string | null
          created_at?: string
          graph_version?: string
          id?: string
          locale?: string
          profile_snapshot?: Json | null
          result_summary?: Json
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_runs_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_runs_assessment_version_id_fkey"
            columns: ["assessment_version_id"]
            isOneToOne: false
            referencedRelation: "assessment_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_versions: {
        Row: {
          assessment_id: string
          disclaimer_version: string
          id: string
          model_version: string
          notes: string | null
          published_at: string
          retired_at: string | null
          retired_reason: string | null
        }
        Insert: {
          assessment_id: string
          disclaimer_version: string
          id?: string
          model_version: string
          notes?: string | null
          published_at?: string
          retired_at?: string | null
          retired_reason?: string | null
        }
        Update: {
          assessment_id?: string
          disclaimer_version?: string
          id?: string
          model_version?: string
          notes?: string | null
          published_at?: string
          retired_at?: string | null
          retired_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_versions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          created_at: string
          employer_visible: boolean
          id: string
          kind: string
          name_en: string
          name_sv: string
          role_category: string | null
        }
        Insert: {
          created_at?: string
          employer_visible?: boolean
          id: string
          kind: string
          name_en: string
          name_sv: string
          role_category?: string | null
        }
        Update: {
          created_at?: string
          employer_visible?: boolean
          id?: string
          kind?: string
          name_en?: string
          name_sv?: string
          role_category?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          at: string
          id: string
          ip_hash: string | null
          metadata: Json
          org_id: string | null
          subject_id: string | null
          subject_type: string | null
          ua_hash: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          org_id?: string | null
          subject_id?: string | null
          subject_type?: string | null
          ua_hash?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          org_id?: string | null
          subject_id?: string | null
          subject_type?: string | null
          ua_hash?: string | null
        }
        Relationships: []
      }
      beta_feedback: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          page_path: string | null
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          message: string
          page_path?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          page_path?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      career_milestones: {
        Row: {
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          milestone_kind: string
          plan_id: string
          position: number
          status: string
          target_ref: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          milestone_kind?: string
          plan_id: string
          position?: number
          status?: string
          target_ref?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          milestone_kind?: string
          plan_id?: string
          position?: number
          status?: string
          target_ref?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_milestones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "career_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      career_plans: {
        Row: {
          created_at: string
          graph_version: string | null
          id: string
          notes: string | null
          target_profession_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          graph_version?: string | null
          id?: string
          notes?: string | null
          target_profession_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          graph_version?: string | null
          id?: string
          notes?: string | null
          target_profession_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_plans_target_profession_id_fkey"
            columns: ["target_profession_id"]
            isOneToOne: false
            referencedRelation: "target_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      cd_career_goals: {
        Row: {
          chosen_profession_id: string
          id: string
          note: string | null
          session_id: string
          set_at: string
          user_id: string
        }
        Insert: {
          chosen_profession_id: string
          id?: string
          note?: string | null
          session_id: string
          set_at?: string
          user_id: string
        }
        Update: {
          chosen_profession_id?: string
          id?: string
          note?: string | null
          session_id?: string
          set_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cd_career_goals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cd_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cd_definition_items: {
        Row: {
          adaptive_path: string | null
          created_at: string
          definition_version_id: string
          display_order: number
          evidence_class: string
          id: string
          is_active: boolean
          is_scored: boolean
          item_id: string
          item_kind: string
          item_version: number
          retired_at: string | null
          section_id: string | null
        }
        Insert: {
          adaptive_path?: string | null
          created_at?: string
          definition_version_id: string
          display_order: number
          evidence_class: string
          id?: string
          is_active?: boolean
          is_scored: boolean
          item_id: string
          item_kind: string
          item_version: number
          retired_at?: string | null
          section_id?: string | null
        }
        Update: {
          adaptive_path?: string | null
          created_at?: string
          definition_version_id?: string
          display_order?: number
          evidence_class?: string
          id?: string
          is_active?: boolean
          is_scored?: boolean
          item_id?: string
          item_kind?: string
          item_version?: number
          retired_at?: string | null
          section_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cd_definition_items_definition_version_id_fkey"
            columns: ["definition_version_id"]
            isOneToOne: false
            referencedRelation: "cd_definition_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      cd_definition_versions: {
        Row: {
          assessment_id: string
          assessment_version_id: string
          available_locales: string[]
          content_version: string
          created_at: string
          definition_version: string
          id: string
          lifecycle_status: string
          review_status: Json
          scoring_version: string
          taxonomy_version: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          assessment_version_id: string
          available_locales?: string[]
          content_version: string
          created_at?: string
          definition_version: string
          id?: string
          lifecycle_status?: string
          review_status?: Json
          scoring_version: string
          taxonomy_version: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          assessment_version_id?: string
          available_locales?: string[]
          content_version?: string
          created_at?: string
          definition_version?: string
          id?: string
          lifecycle_status?: string
          review_status?: Json
          scoring_version?: string
          taxonomy_version?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cd_definition_versions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cd_definition_versions_assessment_version_id_fkey"
            columns: ["assessment_version_id"]
            isOneToOne: false
            referencedRelation: "assessment_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      cd_evidence: {
        Row: {
          adaptive_path: string | null
          answer_tags: string[]
          answer_value: string
          answered_at: string
          display_order: number | null
          evidence_class: string | null
          id: string
          is_scored: boolean | null
          item_id: string
          item_kind: string | null
          item_version: number | null
          option_id: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          adaptive_path?: string | null
          answer_tags?: string[]
          answer_value: string
          answered_at?: string
          display_order?: number | null
          evidence_class?: string | null
          id?: string
          is_scored?: boolean | null
          item_id: string
          item_kind?: string | null
          item_version?: number | null
          option_id?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          adaptive_path?: string | null
          answer_tags?: string[]
          answer_value?: string
          answered_at?: string
          display_order?: number | null
          evidence_class?: string | null
          id?: string
          is_scored?: boolean | null
          item_id?: string
          item_kind?: string | null
          item_version?: number | null
          option_id?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cd_evidence_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cd_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cd_internal_testers: {
        Row: {
          granted_at: string
          granted_by: string | null
          note: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cd_option_loadings: {
        Row: {
          created_at: string
          dimension_id: string
          id: string
          option_id: string
          question_id: string
          rationale: string
          role: string
          role_weight: number
          scoring_version: string
          value: number
        }
        Insert: {
          created_at?: string
          dimension_id: string
          id?: string
          option_id: string
          question_id: string
          rationale: string
          role: string
          role_weight: number
          scoring_version: string
          value: number
        }
        Update: {
          created_at?: string
          dimension_id?: string
          id?: string
          option_id?: string
          question_id?: string
          rationale?: string
          role?: string
          role_weight?: number
          scoring_version?: string
          value?: number
        }
        Relationships: []
      }
      cd_profession_profiles: {
        Row: {
          band_high: number
          band_low: number
          calibration_version: string
          centrality: string
          confidence: string
          created_at: string
          dimension_id: string
          evidence_basis: string
          profession_id: string
          source_reference: string | null
          weight: number
        }
        Insert: {
          band_high: number
          band_low: number
          calibration_version: string
          centrality: string
          confidence: string
          created_at?: string
          dimension_id: string
          evidence_basis: string
          profession_id: string
          source_reference?: string | null
          weight?: number
        }
        Update: {
          band_high?: number
          band_low?: number
          calibration_version?: string
          centrality?: string
          confidence?: string
          created_at?: string
          dimension_id?: string
          evidence_basis?: string
          profession_id?: string
          source_reference?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "cd_profession_profiles_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cd_professions"
            referencedColumns: ["profession_id"]
          },
        ]
      }
      cd_professions: {
        Row: {
          approved_for_ranking: boolean
          career_area_id: string
          career_stage: string
          cig_profession_slug: string | null
          created_at: string
          derived_from_area: boolean
          entry_role: boolean
          inclusion_rationale_en: string | null
          inclusion_rationale_sv: string | null
          limitation_note_en: string | null
          limitation_note_sv: string | null
          next_review_date: string | null
          profession_id: string
          regulated: boolean
          review_state: string
          title_en: string
          title_sv: string
          transition_difficulty: number | null
          updated_at: string
        }
        Insert: {
          approved_for_ranking?: boolean
          career_area_id: string
          career_stage: string
          cig_profession_slug?: string | null
          created_at?: string
          derived_from_area?: boolean
          entry_role?: boolean
          inclusion_rationale_en?: string | null
          inclusion_rationale_sv?: string | null
          limitation_note_en?: string | null
          limitation_note_sv?: string | null
          next_review_date?: string | null
          profession_id: string
          regulated?: boolean
          review_state?: string
          title_en: string
          title_sv: string
          transition_difficulty?: number | null
          updated_at?: string
        }
        Update: {
          approved_for_ranking?: boolean
          career_area_id?: string
          career_stage?: string
          cig_profession_slug?: string | null
          created_at?: string
          derived_from_area?: boolean
          entry_role?: boolean
          inclusion_rationale_en?: string | null
          inclusion_rationale_sv?: string | null
          limitation_note_en?: string | null
          limitation_note_sv?: string | null
          next_review_date?: string | null
          profession_id?: string
          regulated?: boolean
          review_state?: string
          title_en?: string
          title_sv?: string
          transition_difficulty?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      cd_report_snapshots: {
        Row: {
          candidate_story: Json
          career_areas: Json
          confidence: Json
          content_version: string
          context_status: string | null
          contextual_tags: string[]
          coverage: Json
          definition_version: string
          discovery_goal: string | null
          dna_scores: Json
          generated_at: string
          id: string
          pattern_definition_version: string | null
          patterns: Json
          scoring_version: string
          session_id: string
          taxonomy_version: string
        }
        Insert: {
          candidate_story?: Json
          career_areas?: Json
          confidence?: Json
          content_version: string
          context_status?: string | null
          contextual_tags?: string[]
          coverage?: Json
          definition_version: string
          discovery_goal?: string | null
          dna_scores?: Json
          generated_at?: string
          id?: string
          pattern_definition_version?: string | null
          patterns?: Json
          scoring_version: string
          session_id: string
          taxonomy_version: string
        }
        Update: {
          candidate_story?: Json
          career_areas?: Json
          confidence?: Json
          content_version?: string
          context_status?: string | null
          contextual_tags?: string[]
          coverage?: Json
          definition_version?: string
          discovery_goal?: string | null
          dna_scores?: Json
          generated_at?: string
          id?: string
          pattern_definition_version?: string | null
          patterns?: Json
          scoring_version?: string
          session_id?: string
          taxonomy_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "cd_report_snapshots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "cd_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cd_sessions: {
        Row: {
          adaptive_path: string | null
          anon_session_token: string | null
          completed_at: string | null
          consent: Json
          context_status: string | null
          created_at: string
          current_experience_band: string | null
          current_item: string | null
          current_profession_other: string | null
          current_profession_slug: string | null
          current_profession_status: string | null
          current_section: string | null
          definition_version_id: string
          discovery_goal: string | null
          id: string
          is_internal_test: boolean
          locale: string
          option_order_seed: number | null
          started_at: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          adaptive_path?: string | null
          anon_session_token?: string | null
          completed_at?: string | null
          consent?: Json
          context_status?: string | null
          created_at?: string
          current_experience_band?: string | null
          current_item?: string | null
          current_profession_other?: string | null
          current_profession_slug?: string | null
          current_profession_status?: string | null
          current_section?: string | null
          definition_version_id: string
          discovery_goal?: string | null
          id?: string
          is_internal_test?: boolean
          locale?: string
          option_order_seed?: number | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          adaptive_path?: string | null
          anon_session_token?: string | null
          completed_at?: string | null
          consent?: Json
          context_status?: string | null
          created_at?: string
          current_experience_band?: string | null
          current_item?: string | null
          current_profession_other?: string | null
          current_profession_slug?: string | null
          current_profession_status?: string | null
          current_section?: string | null
          definition_version_id?: string
          discovery_goal?: string | null
          id?: string
          is_internal_test?: boolean
          locale?: string
          option_order_seed?: number | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cd_sessions_definition_version_id_fkey"
            columns: ["definition_version_id"]
            isOneToOne: false
            referencedRelation: "cd_definition_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      cd_shared_reports: {
        Row: {
          created_at: string
          locale: string
          revoked_at: string | null
          snapshot_id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          locale: string
          revoked_at?: string | null
          snapshot_id: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          locale?: string
          revoked_at?: string | null
          snapshot_id?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cd_shared_reports_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "cd_my_report_history"
            referencedColumns: ["snapshot_id"]
          },
          {
            foreignKeyName: "cd_shared_reports_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "cd_report_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cd_shared_reports_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "cd_v31_stored_reports"
            referencedColumns: ["snapshot_id"]
          },
        ]
      }
      cd_test_feedback: {
        Row: {
          explored_profession_id: string | null
          free_text: string | null
          id: string
          locale: string
          missing_career_note: string | null
          pathway_realistic: boolean | null
          relevant: number | null
          requirements_useful: boolean | null
          session_id: string | null
          submitted_at: string
          understood_why: boolean | null
          user_id: string | null
        }
        Insert: {
          explored_profession_id?: string | null
          free_text?: string | null
          id?: string
          locale: string
          missing_career_note?: string | null
          pathway_realistic?: boolean | null
          relevant?: number | null
          requirements_useful?: boolean | null
          session_id?: string | null
          submitted_at?: string
          understood_why?: boolean | null
          user_id?: string | null
        }
        Update: {
          explored_profession_id?: string | null
          free_text?: string | null
          id?: string
          locale?: string
          missing_career_note?: string | null
          pathway_realistic?: boolean | null
          relevant?: number | null
          requirements_useful?: boolean | null
          session_id?: string | null
          submitted_at?: string
          understood_why?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cd_test_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cd_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cd_v31_funnel_events: {
        Row: {
          detail: Json
          event_name: string
          id: string
          occurred_at: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          detail?: Json
          event_name: string
          id?: string
          occurred_at?: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          detail?: Json
          event_name?: string
          id?: string
          occurred_at?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cd_v31_funnel_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cd_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_assessment_dimensions: {
        Row: {
          category: string | null
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          description_en: string | null
          description_sv: string | null
          graph_version: string
          id: string
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version: string
          id?: string
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version?: string
          id?: string
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
        }
        Relationships: []
      }
      cig_assessment_signals: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          description_en: string | null
          description_sv: string | null
          dimension_id: string | null
          graph_version: string
          id: string
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          dimension_id?: string | null
          graph_version: string
          id?: string
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          dimension_id?: string | null
          graph_version?: string
          id?: string
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_assessment_signals_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "cig_assessment_dimensions"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_career_transitions: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          from_profession_id: string
          graph_version: string
          id: string
          rationale_en: string | null
          rationale_sv: string | null
          to_profession_id: string
          transition_kind: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          from_profession_id: string
          graph_version: string
          id?: string
          rationale_en?: string | null
          rationale_sv?: string | null
          to_profession_id: string
          transition_kind?: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          from_profession_id?: string
          graph_version?: string
          id?: string
          rationale_en?: string | null
          rationale_sv?: string | null
          to_profession_id?: string
          transition_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_career_transitions_from_profession_id_fkey"
            columns: ["from_profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_career_transitions_to_profession_id_fkey"
            columns: ["to_profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_certifications: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          description_en: string | null
          description_sv: string | null
          graph_version: string
          id: string
          issuer_en: string | null
          issuer_sv: string | null
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version: string
          id?: string
          issuer_en?: string | null
          issuer_sv?: string | null
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version?: string
          id?: string
          issuer_en?: string | null
          issuer_sv?: string | null
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
        }
        Relationships: []
      }
      cig_competencies: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          description_en: string | null
          description_sv: string | null
          graph_version: string
          id: string
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version: string
          id?: string
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version?: string
          id?: string
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
        }
        Relationships: []
      }
      cig_education_pathways: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          description_en: string | null
          description_sv: string | null
          graph_version: string
          id: string
          slug: string
          title_en: string
          title_sv: string
          typical_duration_months: number | null
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version: string
          id?: string
          slug: string
          title_en: string
          title_sv: string
          typical_duration_months?: number | null
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version?: string
          id?: string
          slug?: string
          title_en?: string
          title_sv?: string
          typical_duration_months?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      cig_employer_types: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          graph_version: string
          id: string
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version: string
          id?: string
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version?: string
          id?: string
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
        }
        Relationships: []
      }
      cig_experience_types: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          description_en: string | null
          description_sv: string | null
          graph_version: string
          id: string
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version: string
          id?: string
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version?: string
          id?: string
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
        }
        Relationships: []
      }
      cig_formal_requirements: {
        Row: {
          authority_en: string | null
          authority_sv: string | null
          content_status: Database["public"]["Enums"]["cig_content_status"]
          country: string | null
          created_at: string
          description_en: string | null
          description_sv: string | null
          graph_version: string
          id: string
          jurisdiction: string | null
          legal_basis: string | null
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
        }
        Insert: {
          authority_en?: string | null
          authority_sv?: string | null
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          country?: string | null
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version: string
          id?: string
          jurisdiction?: string | null
          legal_basis?: string | null
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
        }
        Update: {
          authority_en?: string | null
          authority_sv?: string | null
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          country?: string | null
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version?: string
          id?: string
          jurisdiction?: string | null
          legal_basis?: string | null
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
        }
        Relationships: []
      }
      cig_governance_settings: {
        Row: {
          id: boolean
          lifecycle_enforced: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          lifecycle_enforced?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          lifecycle_enforced?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cig_knowledge_areas: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          description_en: string | null
          description_sv: string | null
          graph_version: string
          id: string
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version: string
          id?: string
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version?: string
          id?: string
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
        }
        Relationships: []
      }
      cig_profession_aliases: {
        Row: {
          alias_en: string | null
          alias_kind: Database["public"]["Enums"]["cig_alias_kind"]
          alias_sv: string | null
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          graph_version: string
          id: string
          profession_id: string
          updated_at: string
        }
        Insert: {
          alias_en?: string | null
          alias_kind?: Database["public"]["Enums"]["cig_alias_kind"]
          alias_sv?: string | null
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version: string
          id?: string
          profession_id: string
          updated_at?: string
        }
        Update: {
          alias_en?: string | null
          alias_kind?: Database["public"]["Enums"]["cig_alias_kind"]
          alias_sv?: string | null
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version?: string
          id?: string
          profession_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_aliases_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_assessment_signals: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          graph_version: string
          id: string
          profession_id: string
          signal_id: string
          signal_polarity: number
          signal_weight: number
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version: string
          id?: string
          profession_id: string
          signal_id: string
          signal_polarity?: number
          signal_weight?: number
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version?: string
          id?: string
          profession_id?: string
          signal_id?: string
          signal_polarity?: number
          signal_weight?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_assessment_signals_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_assessment_signals_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "cig_assessment_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_certification_rel: {
        Row: {
          certification_id: string
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          criticality: Database["public"]["Enums"]["cig_relationship_criticality"]
          graph_version: string
          id: string
          profession_id: string
          updated_at: string
        }
        Insert: {
          certification_id: string
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          criticality?: Database["public"]["Enums"]["cig_relationship_criticality"]
          graph_version: string
          id?: string
          profession_id: string
          updated_at?: string
        }
        Update: {
          certification_id?: string
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          criticality?: Database["public"]["Enums"]["cig_relationship_criticality"]
          graph_version?: string
          id?: string
          profession_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_certification_rel_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "cig_certifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_certification_rel_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_competency_req: {
        Row: {
          competency_id: string
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          criticality: Database["public"]["Enums"]["cig_relationship_criticality"]
          graph_version: string
          id: string
          importance: number
          profession_id: string
          updated_at: string
        }
        Insert: {
          competency_id: string
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          criticality?: Database["public"]["Enums"]["cig_relationship_criticality"]
          graph_version: string
          id?: string
          importance?: number
          profession_id: string
          updated_at?: string
        }
        Update: {
          competency_id?: string
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          criticality?: Database["public"]["Enums"]["cig_relationship_criticality"]
          graph_version?: string
          id?: string
          importance?: number
          profession_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_competency_req_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "cig_competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_competency_req_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_education_pathways: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          education_pathway_id: string
          graph_version: string
          id: string
          importance: number
          profession_id: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          education_pathway_id: string
          graph_version: string
          id?: string
          importance?: number
          profession_id: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          education_pathway_id?: string
          graph_version?: string
          id?: string
          importance?: number
          profession_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_education_pathways_education_pathway_id_fkey"
            columns: ["education_pathway_id"]
            isOneToOne: false
            referencedRelation: "cig_education_pathways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_education_pathways_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_employer_type_rel: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          employer_type_id: string
          graph_version: string
          id: string
          importance: number
          profession_id: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          employer_type_id: string
          graph_version: string
          id?: string
          importance?: number
          profession_id: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          employer_type_id?: string
          graph_version?: string
          id?: string
          importance?: number
          profession_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_employer_type_rel_employer_type_id_fkey"
            columns: ["employer_type_id"]
            isOneToOne: false
            referencedRelation: "cig_employer_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_employer_type_rel_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_experience_req: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          criticality: Database["public"]["Enums"]["cig_relationship_criticality"]
          experience_type_id: string
          graph_version: string
          id: string
          importance: number
          profession_id: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          criticality?: Database["public"]["Enums"]["cig_relationship_criticality"]
          experience_type_id: string
          graph_version: string
          id?: string
          importance?: number
          profession_id: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          criticality?: Database["public"]["Enums"]["cig_relationship_criticality"]
          experience_type_id?: string
          graph_version?: string
          id?: string
          importance?: number
          profession_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_experience_req_experience_type_id_fkey"
            columns: ["experience_type_id"]
            isOneToOne: false
            referencedRelation: "cig_experience_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_experience_req_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_families: {
        Row: {
          archived_at: string | null
          canonical_id: string | null
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          description_en: string | null
          description_sv: string | null
          graph_version: string
          id: string
          last_verified: string | null
          resolves_to_canonical: string | null
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
          valid_from: string
        }
        Insert: {
          archived_at?: string | null
          canonical_id?: string | null
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version: string
          id?: string
          last_verified?: string | null
          resolves_to_canonical?: string | null
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
          valid_from?: string
        }
        Update: {
          archived_at?: string | null
          canonical_id?: string | null
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version?: string
          id?: string
          last_verified?: string | null
          resolves_to_canonical?: string | null
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
          valid_from?: string
        }
        Relationships: []
      }
      cig_profession_families_legacy_backup: {
        Row: {
          archived_at: string | null
          canonical_id: string | null
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          description_en: string | null
          description_sv: string | null
          graph_version: string
          id: string
          last_verified: string | null
          resolves_to_canonical: string | null
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
          valid_from: string
        }
        Insert: {
          archived_at?: string | null
          canonical_id?: string | null
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version: string
          id?: string
          last_verified?: string | null
          resolves_to_canonical?: string | null
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
          valid_from?: string
        }
        Update: {
          archived_at?: string | null
          canonical_id?: string | null
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version?: string
          id?: string
          last_verified?: string | null
          resolves_to_canonical?: string | null
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
          valid_from?: string
        }
        Relationships: []
      }
      cig_profession_family_rel: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          family_id: string
          graph_version: string
          id: string
          importance: number
          profession_id: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          family_id: string
          graph_version: string
          id?: string
          importance?: number
          profession_id: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          family_id?: string
          graph_version?: string
          id?: string
          importance?: number
          profession_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_family_rel_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "cig_profession_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_family_rel_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_formal_requirements: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          country: string | null
          created_at: string
          criticality: Database["public"]["Enums"]["cig_relationship_criticality"]
          formal_requirement_id: string
          graph_version: string
          id: string
          jurisdiction: string | null
          legal_blocker: boolean
          notes: Json
          profession_id: string
          source_id: string | null
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          country?: string | null
          created_at?: string
          criticality?: Database["public"]["Enums"]["cig_relationship_criticality"]
          formal_requirement_id: string
          graph_version: string
          id?: string
          jurisdiction?: string | null
          legal_blocker?: boolean
          notes?: Json
          profession_id: string
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          country?: string | null
          created_at?: string
          criticality?: Database["public"]["Enums"]["cig_relationship_criticality"]
          formal_requirement_id?: string
          graph_version?: string
          id?: string
          jurisdiction?: string | null
          legal_blocker?: boolean
          notes?: Json
          profession_id?: string
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_formal_requirements_formal_requirement_id_fkey"
            columns: ["formal_requirement_id"]
            isOneToOne: false
            referencedRelation: "cig_formal_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_formal_requirements_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_formal_requirements_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "cig_source_references"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_knowledge_req: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          criticality: Database["public"]["Enums"]["cig_relationship_criticality"]
          graph_version: string
          id: string
          importance: number
          knowledge_area_id: string
          profession_id: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          criticality?: Database["public"]["Enums"]["cig_relationship_criticality"]
          graph_version: string
          id?: string
          importance?: number
          knowledge_area_id: string
          profession_id: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          criticality?: Database["public"]["Enums"]["cig_relationship_criticality"]
          graph_version?: string
          id?: string
          importance?: number
          knowledge_area_id?: string
          profession_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_knowledge_req_knowledge_area_id_fkey"
            columns: ["knowledge_area_id"]
            isOneToOne: false
            referencedRelation: "cig_knowledge_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_knowledge_req_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_reviews: {
        Row: {
          created_at: string
          graph_version: string
          id: string
          next_review_due: string | null
          profession_id: string
          review_date: string
          review_notes: string | null
          review_scope: string
          reviewer_id: string | null
          reviewer_label: string
          source_reference: string | null
        }
        Insert: {
          created_at?: string
          graph_version: string
          id?: string
          next_review_due?: string | null
          profession_id: string
          review_date?: string
          review_notes?: string | null
          review_scope: string
          reviewer_id?: string | null
          reviewer_label: string
          source_reference?: string | null
        }
        Update: {
          created_at?: string
          graph_version?: string
          id?: string
          next_review_due?: string | null
          profession_id?: string
          review_date?: string
          review_notes?: string | null
          review_scope?: string
          reviewer_id?: string | null
          reviewer_label?: string
          source_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_reviews_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_sector_rel: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          graph_version: string
          id: string
          importance: number
          profession_id: string
          sector_id: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version: string
          id?: string
          importance?: number
          profession_id: string
          sector_id: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version?: string
          id?: string
          importance?: number
          profession_id?: string
          sector_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_sector_rel_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_sector_rel_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "cig_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_skill_req: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          criticality: Database["public"]["Enums"]["cig_relationship_criticality"]
          graph_version: string
          id: string
          importance: number
          profession_id: string
          skill_id: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          criticality?: Database["public"]["Enums"]["cig_relationship_criticality"]
          graph_version: string
          id?: string
          importance?: number
          profession_id: string
          skill_id: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          criticality?: Database["public"]["Enums"]["cig_relationship_criticality"]
          graph_version?: string
          id?: string
          importance?: number
          profession_id?: string
          skill_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_skill_req_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_skill_req_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "cig_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_source_references: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          graph_version: string
          id: string
          profession_id: string
          purpose: string | null
          source_id: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version: string
          id?: string
          profession_id: string
          purpose?: string | null
          source_id: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version?: string
          id?: string
          profession_id?: string
          purpose?: string | null
          source_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_source_references_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_source_references_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "cig_source_references"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_specialisations: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          description_en: string | null
          description_sv: string | null
          graph_version: string
          id: string
          profession_id: string
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version: string
          id?: string
          profession_id: string
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version?: string
          id?: string
          profession_id?: string
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_specialisations_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_work_environment_rel: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          graph_version: string
          id: string
          importance: number
          profession_id: string
          updated_at: string
          work_environment_id: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version: string
          id?: string
          importance?: number
          profession_id: string
          updated_at?: string
          work_environment_id: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version?: string
          id?: string
          importance?: number
          profession_id?: string
          updated_at?: string
          work_environment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_work_environment_rel_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_work_environment_rel_work_environment_id_fkey"
            columns: ["work_environment_id"]
            isOneToOne: false
            referencedRelation: "cig_work_environments"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_profession_work_preferences: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          graph_version: string
          id: string
          importance: number
          profession_id: string
          updated_at: string
          work_preference_id: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version: string
          id?: string
          importance?: number
          profession_id: string
          updated_at?: string
          work_preference_id: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version?: string
          id?: string
          importance?: number
          profession_id?: string
          updated_at?: string
          work_preference_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_profession_work_preferences_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cig_profession_work_preferences_work_preference_id_fkey"
            columns: ["work_preference_id"]
            isOneToOne: false
            referencedRelation: "cig_work_preferences"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_professions: {
        Row: {
          canonical_key: string
          content_status: Database["public"]["Enums"]["cig_content_status"]
          country: string | null
          created_at: string
          disclaimer_en: string | null
          disclaimer_sv: string | null
          esco_uri: string | null
          graph_version: string
          id: string
          is_regulated: boolean
          jurisdiction: string | null
          last_verified: string | null
          notes: Json
          overview_en: string | null
          overview_sv: string | null
          primary_family_id: string | null
          quality_level: Database["public"]["Enums"]["cig_quality_level"]
          slug: string
          ssyk_code: string | null
          summary_en: string | null
          summary_sv: string | null
          title_en: string
          title_sv: string
          updated_at: string
          valid_from: string
        }
        Insert: {
          canonical_key: string
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          country?: string | null
          created_at?: string
          disclaimer_en?: string | null
          disclaimer_sv?: string | null
          esco_uri?: string | null
          graph_version: string
          id?: string
          is_regulated?: boolean
          jurisdiction?: string | null
          last_verified?: string | null
          notes?: Json
          overview_en?: string | null
          overview_sv?: string | null
          primary_family_id?: string | null
          quality_level?: Database["public"]["Enums"]["cig_quality_level"]
          slug: string
          ssyk_code?: string | null
          summary_en?: string | null
          summary_sv?: string | null
          title_en: string
          title_sv: string
          updated_at?: string
          valid_from?: string
        }
        Update: {
          canonical_key?: string
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          country?: string | null
          created_at?: string
          disclaimer_en?: string | null
          disclaimer_sv?: string | null
          esco_uri?: string | null
          graph_version?: string
          id?: string
          is_regulated?: boolean
          jurisdiction?: string | null
          last_verified?: string | null
          notes?: Json
          overview_en?: string | null
          overview_sv?: string | null
          primary_family_id?: string | null
          quality_level?: Database["public"]["Enums"]["cig_quality_level"]
          slug?: string
          ssyk_code?: string | null
          summary_en?: string | null
          summary_sv?: string | null
          title_en?: string
          title_sv?: string
          updated_at?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_professions_primary_family_id_fkey"
            columns: ["primary_family_id"]
            isOneToOne: false
            referencedRelation: "cig_profession_families"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_sectors: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          graph_version: string
          id: string
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version: string
          id?: string
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version?: string
          id?: string
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
        }
        Relationships: []
      }
      cig_skills: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          description_en: string | null
          description_sv: string | null
          esco_uri: string | null
          graph_version: string
          id: string
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          esco_uri?: string | null
          graph_version: string
          id?: string
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          esco_uri?: string | null
          graph_version?: string
          id?: string
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
        }
        Relationships: []
      }
      cig_source_references: {
        Row: {
          accessed_at: string | null
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          graph_version: string
          id: string
          jurisdiction: string | null
          language: string | null
          last_checked_at: string | null
          link_status: Database["public"]["Enums"]["cig_link_status"]
          notes: string | null
          organisation: string
          replacement_source_id: string | null
          source_type: Database["public"]["Enums"]["cig_source_type"]
          stable_key: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          accessed_at?: string | null
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version: string
          id?: string
          jurisdiction?: string | null
          language?: string | null
          last_checked_at?: string | null
          link_status?: Database["public"]["Enums"]["cig_link_status"]
          notes?: string | null
          organisation: string
          replacement_source_id?: string | null
          source_type?: Database["public"]["Enums"]["cig_source_type"]
          stable_key: string
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          accessed_at?: string | null
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version?: string
          id?: string
          jurisdiction?: string | null
          language?: string | null
          last_checked_at?: string | null
          link_status?: Database["public"]["Enums"]["cig_link_status"]
          notes?: string | null
          organisation?: string
          replacement_source_id?: string | null
          source_type?: Database["public"]["Enums"]["cig_source_type"]
          stable_key?: string
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "cig_source_references_replacement_source_id_fkey"
            columns: ["replacement_source_id"]
            isOneToOne: false
            referencedRelation: "cig_source_references"
            referencedColumns: ["id"]
          },
        ]
      }
      cig_work_environments: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          graph_version: string
          id: string
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version: string
          id?: string
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version?: string
          id?: string
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
        }
        Relationships: []
      }
      cig_work_preferences: {
        Row: {
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          graph_version: string
          id: string
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version: string
          id?: string
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          graph_version?: string
          id?: string
          slug?: string
          title_en?: string
          title_sv?: string
          updated_at?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          granted_at: string
          id: string
          metadata: Json
          policy_version: string
          purpose: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          metadata?: Json
          policy_version: string
          purpose: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          metadata?: Json
          policy_version?: string
          purpose?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cv_documents: {
        Row: {
          bundle_version: string
          created_at: string
          document_version: string
          id: string
          locale: string
          model_id: string | null
          origin: string
          owner_user_id: string
          presentation: Json
          provider_mode: string | null
          purpose: string
          source_bundle: Json
          title: string
          updated_at: string
        }
        Insert: {
          bundle_version?: string
          created_at?: string
          document_version?: string
          id?: string
          locale?: string
          model_id?: string | null
          origin?: string
          owner_user_id: string
          presentation?: Json
          provider_mode?: string | null
          purpose?: string
          source_bundle?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          bundle_version?: string
          created_at?: string
          document_version?: string
          id?: string
          locale?: string
          model_id?: string | null
          origin?: string
          owner_user_id?: string
          presentation?: Json
          provider_mode?: string | null
          purpose?: string
          source_bundle?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      deleted_accounts: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          had_history: boolean
          reason: string
          user_id: string
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          had_history?: boolean
          reason: string
          user_id: string
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          had_history?: boolean
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          cig_profession_slug: string | null
          created_at: string
          created_by: string
          email: string | null
          employer_id: string
          employment_status: string
          first_name: string
          hired_from_application_id: string | null
          hired_from_job_id: string | null
          id: string
          last_name: string
          role_title: string | null
          site_name: string | null
          start_date: string | null
          subject_id: string | null
          updated_at: string
        }
        Insert: {
          cig_profession_slug?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          employer_id: string
          employment_status?: string
          first_name: string
          hired_from_application_id?: string | null
          hired_from_job_id?: string | null
          id?: string
          last_name: string
          role_title?: string | null
          site_name?: string | null
          start_date?: string | null
          subject_id?: string | null
          updated_at?: string
        }
        Update: {
          cig_profession_slug?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          employer_id?: string
          employment_status?: string
          first_name?: string
          hired_from_application_id?: string | null
          hired_from_job_id?: string | null
          id?: string
          last_name?: string
          role_title?: string | null
          site_name?: string | null
          start_date?: string | null
          subject_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_cig_profession_slug_fkey"
            columns: ["cig_profession_slug"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "employees_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_hired_from_application_id_fkey"
            columns: ["hired_from_application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_hired_from_job_id_fkey"
            columns: ["hired_from_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "scp_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      employer_access_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          employer_id: string
          granted_role: string | null
          id: string
          message: string | null
          requester_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          employer_id: string
          granted_role?: string | null
          id?: string
          message?: string | null
          requester_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          employer_id?: string
          granted_role?: string | null
          id?: string
          message?: string | null
          requester_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employer_access_requests_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      employer_admin_meta: {
        Row: {
          created_at: string
          created_by: string | null
          employer_id: string
          updated_at: string
          updated_by: string | null
          verification_notes: string | null
          verified: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employer_id: string
          updated_at?: string
          updated_by?: string | null
          verification_notes?: string | null
          verified?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employer_id?: string
          updated_at?: string
          updated_by?: string | null
          verification_notes?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employer_admin_meta_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: true
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      employer_memberships: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          employer_id: string
          id: string
          invited_at: string | null
          invited_by: string | null
          job_title: string | null
          removed_at: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          employer_id: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          job_title?: string | null
          removed_at?: string | null
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          employer_id?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          job_title?: string | null
          removed_at?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employer_memberships_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      employer_moderation_events: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string
          employer_id: string
          id: string
          new_status: string
          note: string | null
          previous_status: string
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          employer_id: string
          id?: string
          new_status: string
          note?: string | null
          previous_status: string
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          employer_id?: string
          id?: string
          new_status?: string
          note?: string | null
          previous_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employer_moderation_events_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      employers: {
        Row: {
          country: string | null
          created_at: string
          description_en: string | null
          description_sv: string | null
          id: string
          logo_url: string | null
          name: string
          registration_number: string | null
          slug: string
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          id?: string
          logo_url?: string | null
          name: string
          registration_number?: string | null
          slug: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          registration_number?: string | null
          slug?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      evidence_items: {
        Row: {
          created_at: string
          evidence_type: string
          graph_version: string | null
          id: string
          payload: Json
          source_run_id: string | null
          status: string
          target_id: string
          target_kind: string
          updated_at: string
          user_id: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          evidence_type: string
          graph_version?: string | null
          id?: string
          payload?: Json
          source_run_id?: string | null
          status?: string
          target_id: string
          target_kind: string
          updated_at?: string
          user_id: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          evidence_type?: string
          graph_version?: string | null
          id?: string
          payload?: Json
          source_run_id?: string | null
          status?: string
          target_id?: string
          target_kind?: string
          updated_at?: string
          user_id?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_items_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "assessment_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      gap_snapshots: {
        Row: {
          competence_gaps: Json
          created_at: string
          experience_gaps: Json
          formal_requirement_gaps: Json
          graph_version: string
          id: string
          profession_id: string
          source_run_id: string | null
          target_profession_id: string
          user_id: string
        }
        Insert: {
          competence_gaps?: Json
          created_at?: string
          experience_gaps?: Json
          formal_requirement_gaps?: Json
          graph_version: string
          id?: string
          profession_id: string
          source_run_id?: string | null
          target_profession_id: string
          user_id: string
        }
        Update: {
          competence_gaps?: Json
          created_at?: string
          experience_gaps?: Json
          formal_requirement_gaps?: Json
          graph_version?: string
          id?: string
          profession_id?: string
          source_run_id?: string | null
          target_profession_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gap_snapshots_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "assessment_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gap_snapshots_target_profession_id_fkey"
            columns: ["target_profession_id"]
            isOneToOne: false
            referencedRelation: "target_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      graph_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          published_at: string | null
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          published_at?: string | null
          version: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          published_at?: string | null
          version?: string
        }
        Relationships: []
      }
      job_admin_meta: {
        Row: {
          created_at: string
          created_by: string | null
          duplicate_of: string | null
          imported_at: string | null
          job_id: string
          moderation_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duplicate_of?: string | null
          imported_at?: string | null
          job_id: string
          moderation_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duplicate_of?: string | null
          imported_at?: string | null
          job_id?: string
          moderation_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_admin_meta_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_admin_meta_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          job_id: string | null
          properties: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          job_id?: string | null
          properties?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          job_id?: string | null
          properties?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_analytics_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_application_status_events: {
        Row: {
          actor_role: string
          actor_user_id: string | null
          application_id: string
          created_at: string
          employer_id: string
          id: string
          job_id: string
          new_status: string
          note: string | null
          notified_at: string | null
          notify_attempts: number
          notify_error: string | null
          previous_status: string
        }
        Insert: {
          actor_role: string
          actor_user_id?: string | null
          application_id: string
          created_at?: string
          employer_id: string
          id?: string
          job_id: string
          new_status: string
          note?: string | null
          notified_at?: string | null
          notify_attempts?: number
          notify_error?: string | null
          previous_status: string
        }
        Update: {
          actor_role?: string
          actor_user_id?: string | null
          application_id?: string
          created_at?: string
          employer_id?: string
          id?: string
          job_id?: string
          new_status?: string
          note?: string | null
          notified_at?: string | null
          notify_attempts?: number
          notify_error?: string | null
          previous_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_application_status_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_application_status_events_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_application_status_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          applicant_user_id: string
          consent_given_at: string
          cover_note: string | null
          created_at: string
          cv_document_id: string | null
          cv_document_snapshot: Json | null
          cv_mime_type: string | null
          cv_original_filename: string | null
          cv_size_bytes: number | null
          cv_source: string
          cv_storage_path: string | null
          employer_id: string
          employer_note: string | null
          id: string
          job_id: string
          phone: string | null
          status: string
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          applicant_user_id: string
          consent_given_at: string
          cover_note?: string | null
          created_at?: string
          cv_document_id?: string | null
          cv_document_snapshot?: Json | null
          cv_mime_type?: string | null
          cv_original_filename?: string | null
          cv_size_bytes?: number | null
          cv_source?: string
          cv_storage_path?: string | null
          employer_id: string
          employer_note?: string | null
          id?: string
          job_id: string
          phone?: string | null
          status?: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          applicant_user_id?: string
          consent_given_at?: string
          cover_note?: string | null
          created_at?: string
          cv_document_id?: string | null
          cv_document_snapshot?: Json | null
          cv_mime_type?: string | null
          cv_original_filename?: string | null
          cv_size_bytes?: number | null
          cv_source?: string
          cv_storage_path?: string | null
          employer_id?: string
          employer_note?: string | null
          id?: string
          job_id?: string
          phone?: string | null
          status?: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_cv_document_id_fkey"
            columns: ["cv_document_id"]
            isOneToOne: false
            referencedRelation: "cv_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          job_id: string | null
          job_slug_snapshot: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          job_id?: string | null
          job_slug_snapshot?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          job_id?: string | null
          job_slug_snapshot?: string | null
        }
        Relationships: []
      }
      job_import_sources: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          name: string
          terms_of_use: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: string
          name: string
          terms_of_use?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name?: string
          terms_of_use?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          application_email: string | null
          application_method: string
          application_url: string | null
          archived_at: string | null
          benefits: Json | null
          canonical_url: string | null
          city: string | null
          confidence_level: string | null
          content_hash: string | null
          country: string | null
          created_at: string
          deadline_at: string | null
          description_en: string | null
          description_sv: string | null
          driving_licence_required: boolean
          education_requirements: string | null
          employer_id: string
          employer_type: string | null
          employment_type: string | null
          experience_level: string | null
          expires_at: string | null
          family_id: string | null
          family_other: boolean
          family_other_text: string | null
          formal_requirement_ids: string[]
          id: string
          inference_method: string | null
          language_requirements: string[]
          leadership_responsibility: boolean | null
          location_text: string | null
          mapping_reviewed_at: string | null
          mapping_reviewed_by: string | null
          model_version: string | null
          night_work: boolean | null
          preferred_skill_ids: string[]
          profession_other: boolean
          profession_other_text: string | null
          profession_slug: string | null
          published_at: string | null
          region: string | null
          regulated: boolean
          related_profession_slugs: string[]
          required_skill_ids: string[]
          requirements: Json | null
          requirements_en: string | null
          requirements_sv: string | null
          responsibilities: Json | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          salary_period: string | null
          sector: string | null
          security_vetting_mentioned: boolean
          seniority: string | null
          shift_work: boolean | null
          short_id: string
          slug: string
          source_id: string | null
          source_job_id: string | null
          source_type: string | null
          source_url: string | null
          status: string
          title_en: string | null
          title_sv: string | null
          travel_required: boolean | null
          updated_at: string
          work_environment: string | null
          workplace_type: string | null
        }
        Insert: {
          application_email?: string | null
          application_method: string
          application_url?: string | null
          archived_at?: string | null
          benefits?: Json | null
          canonical_url?: string | null
          city?: string | null
          confidence_level?: string | null
          content_hash?: string | null
          country?: string | null
          created_at?: string
          deadline_at?: string | null
          description_en?: string | null
          description_sv?: string | null
          driving_licence_required?: boolean
          education_requirements?: string | null
          employer_id: string
          employer_type?: string | null
          employment_type?: string | null
          experience_level?: string | null
          expires_at?: string | null
          family_id?: string | null
          family_other?: boolean
          family_other_text?: string | null
          formal_requirement_ids?: string[]
          id?: string
          inference_method?: string | null
          language_requirements?: string[]
          leadership_responsibility?: boolean | null
          location_text?: string | null
          mapping_reviewed_at?: string | null
          mapping_reviewed_by?: string | null
          model_version?: string | null
          night_work?: boolean | null
          preferred_skill_ids?: string[]
          profession_other?: boolean
          profession_other_text?: string | null
          profession_slug?: string | null
          published_at?: string | null
          region?: string | null
          regulated?: boolean
          related_profession_slugs?: string[]
          required_skill_ids?: string[]
          requirements?: Json | null
          requirements_en?: string | null
          requirements_sv?: string | null
          responsibilities?: Json | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          sector?: string | null
          security_vetting_mentioned?: boolean
          seniority?: string | null
          shift_work?: boolean | null
          short_id: string
          slug: string
          source_id?: string | null
          source_job_id?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string
          title_en?: string | null
          title_sv?: string | null
          travel_required?: boolean | null
          updated_at?: string
          work_environment?: string | null
          workplace_type?: string | null
        }
        Update: {
          application_email?: string | null
          application_method?: string
          application_url?: string | null
          archived_at?: string | null
          benefits?: Json | null
          canonical_url?: string | null
          city?: string | null
          confidence_level?: string | null
          content_hash?: string | null
          country?: string | null
          created_at?: string
          deadline_at?: string | null
          description_en?: string | null
          description_sv?: string | null
          driving_licence_required?: boolean
          education_requirements?: string | null
          employer_id?: string
          employer_type?: string | null
          employment_type?: string | null
          experience_level?: string | null
          expires_at?: string | null
          family_id?: string | null
          family_other?: boolean
          family_other_text?: string | null
          formal_requirement_ids?: string[]
          id?: string
          inference_method?: string | null
          language_requirements?: string[]
          leadership_responsibility?: boolean | null
          location_text?: string | null
          mapping_reviewed_at?: string | null
          mapping_reviewed_by?: string | null
          model_version?: string | null
          night_work?: boolean | null
          preferred_skill_ids?: string[]
          profession_other?: boolean
          profession_other_text?: string | null
          profession_slug?: string | null
          published_at?: string | null
          region?: string | null
          regulated?: boolean
          related_profession_slugs?: string[]
          required_skill_ids?: string[]
          requirements?: Json | null
          requirements_en?: string | null
          requirements_sv?: string | null
          responsibilities?: Json | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          sector?: string | null
          security_vetting_mentioned?: boolean
          seniority?: string | null
          shift_work?: boolean | null
          short_id?: string
          slug?: string
          source_id?: string | null
          source_job_id?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string
          title_en?: string | null
          title_sv?: string | null
          travel_required?: boolean | null
          updated_at?: string
          work_environment?: string | null
          workplace_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_profession_slug_fkey"
            columns: ["profession_slug"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "job_import_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          country: string | null
          created_at: string
          display_name: string | null
          id: string
          locale: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      recommendation_instances: {
        Row: {
          created_at: string
          graph_version: string
          id: string
          rationale: Json
          recommendation_kind: string
          source_run_id: string | null
          status: string
          target_profession_id: string | null
          target_ref: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          graph_version: string
          id?: string
          rationale?: Json
          recommendation_kind: string
          source_run_id?: string | null
          status?: string
          target_profession_id?: string | null
          target_ref: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          graph_version?: string
          id?: string
          rationale?: Json
          recommendation_kind?: string
          source_run_id?: string | null
          status?: string
          target_profession_id?: string | null
          target_ref?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_instances_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "assessment_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_instances_target_profession_id_fkey"
            columns: ["target_profession_id"]
            isOneToOne: false
            referencedRelation: "target_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_jobs: {
        Row: {
          job_id: string
          saved_at: string
          user_id: string
        }
        Insert: {
          job_id: string
          saved_at?: string
          user_id: string
        }
        Update: {
          job_id?: string
          saved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_ai_providers: {
        Row: {
          code: string
          created_at: string
          is_enabled: boolean
          model_identifier: string | null
          name: string
          notes: string | null
        }
        Insert: {
          code: string
          created_at?: string
          is_enabled?: boolean
          model_identifier?: string | null
          name: string
          notes?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          is_enabled?: boolean
          model_identifier?: string | null
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      scp_ai_scoring_dimensions: {
        Row: {
          confidence: number
          created_at: string
          evidence_excerpt: string | null
          id: string
          level: number
          rubric_dimension_id: string
          scoring_run_id: string
        }
        Insert: {
          confidence: number
          created_at?: string
          evidence_excerpt?: string | null
          id?: string
          level: number
          rubric_dimension_id: string
          scoring_run_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          evidence_excerpt?: string | null
          id?: string
          level?: number
          rubric_dimension_id?: string
          scoring_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_ai_scoring_dimensions_rubric_dimension_id_fkey"
            columns: ["rubric_dimension_id"]
            isOneToOne: false
            referencedRelation: "scp_rubric_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_ai_scoring_dimensions_scoring_run_id_fkey"
            columns: ["scoring_run_id"]
            isOneToOne: false
            referencedRelation: "scp_ai_scoring_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_ai_scoring_dimensions_scoring_run_id_fkey"
            columns: ["scoring_run_id"]
            isOneToOne: false
            referencedRelation: "scp_rm_review_queue"
            referencedColumns: ["scoring_run_id"]
          },
        ]
      }
      scp_ai_scoring_runs: {
        Row: {
          attempt_number: number
          created_at: string
          id: string
          min_confidence: number | null
          model_version: string | null
          output: Json | null
          prompt_version_id: string | null
          provider_code: string
          response_id: string
          rubric_version_id: string | null
          run_at: string
          run_status: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          id?: string
          min_confidence?: number | null
          model_version?: string | null
          output?: Json | null
          prompt_version_id?: string | null
          provider_code: string
          response_id: string
          rubric_version_id?: string | null
          run_at?: string
          run_status: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          id?: string
          min_confidence?: number | null
          model_version?: string | null
          output?: Json | null
          prompt_version_id?: string | null
          provider_code?: string
          response_id?: string
          rubric_version_id?: string | null
          run_at?: string
          run_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_ai_scoring_runs_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "scp_prompt_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_ai_scoring_runs_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "scp_ai_providers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "scp_ai_scoring_runs_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "scp_candidate_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_ai_scoring_runs_rubric_version_id_fkey"
            columns: ["rubric_version_id"]
            isOneToOne: false
            referencedRelation: "scp_rubric_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_ai_tasks: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          activation_status: string
          allowed_provider_capabilities: string[]
          allowed_source_kinds: string[]
          business_purpose: string
          created_at: string
          evaluation_set_version: string | null
          id: string
          input_schema_version: string
          output_schema_version: string
          policy_version: string
          prohibited_inputs: string[]
          prompt_version: string
          required_governed_context: string[]
          requires_human_review: boolean
          retention_behaviour: string
          risk_classification: string
          rollback_to_version: string | null
          task_key: string
          task_version: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          activation_status?: string
          allowed_provider_capabilities?: string[]
          allowed_source_kinds?: string[]
          business_purpose: string
          created_at?: string
          evaluation_set_version?: string | null
          id?: string
          input_schema_version: string
          output_schema_version: string
          policy_version: string
          prohibited_inputs?: string[]
          prompt_version: string
          required_governed_context?: string[]
          requires_human_review?: boolean
          retention_behaviour: string
          risk_classification?: string
          rollback_to_version?: string | null
          task_key: string
          task_version: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          activation_status?: string
          allowed_provider_capabilities?: string[]
          allowed_source_kinds?: string[]
          business_purpose?: string
          created_at?: string
          evaluation_set_version?: string | null
          id?: string
          input_schema_version?: string
          output_schema_version?: string
          policy_version?: string
          prohibited_inputs?: string[]
          prompt_version?: string
          required_governed_context?: string[]
          requires_human_review?: boolean
          retention_behaviour?: string
          risk_classification?: string
          rollback_to_version?: string | null
          task_key?: string
          task_version?: string
        }
        Relationships: []
      }
      scp_anchor_responses: {
        Row: {
          anchor_type: string
          created_at: string
          id: string
          language: string
          level: number | null
          rationale: string
          response_text: string
          rubric_dimension_id: string
        }
        Insert: {
          anchor_type: string
          created_at?: string
          id?: string
          language?: string
          level?: number | null
          rationale: string
          response_text: string
          rubric_dimension_id: string
        }
        Update: {
          anchor_type?: string
          created_at?: string
          id?: string
          language?: string
          level?: number | null
          rationale?: string
          response_text?: string
          rubric_dimension_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_anchor_responses_rubric_dimension_id_fkey"
            columns: ["rubric_dimension_id"]
            isOneToOne: false
            referencedRelation: "scp_rubric_dimensions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_assessment_definitions: {
        Row: {
          created_at: string
          designed_for: string
          display_name_en: string | null
          display_name_sv: string | null
          family_id: string
          id: string
          is_test_fixture: boolean
          name_en: string
          name_sv: string
          owner_employer_id: string | null
          profession_id: string | null
          purpose: string
          slug: string
          standard_for_recruitment: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          designed_for?: string
          display_name_en?: string | null
          display_name_sv?: string | null
          family_id: string
          id?: string
          is_test_fixture?: boolean
          name_en: string
          name_sv: string
          owner_employer_id?: string | null
          profession_id?: string | null
          purpose: string
          slug: string
          standard_for_recruitment?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          designed_for?: string
          display_name_en?: string | null
          display_name_sv?: string | null
          family_id?: string
          id?: string
          is_test_fixture?: boolean
          name_en?: string
          name_sv?: string
          owner_employer_id?: string | null
          profession_id?: string | null
          purpose?: string
          slug?: string
          standard_for_recruitment?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_assessment_definitions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "scp_assessment_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_assessment_definitions_owner_employer_id_fkey"
            columns: ["owner_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_assessment_definitions_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "scp_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_assessment_families: {
        Row: {
          created_at: string
          description_en: string | null
          description_sv: string | null
          id: string
          name_en: string
          name_sv: string
          product_type: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          id?: string
          name_en: string
          name_sv: string
          product_type: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          id?: string
          name_en?: string
          name_sv?: string
          product_type?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      scp_assessment_invitations: {
        Row: {
          application_id: string | null
          assessment_version_id: string
          bound_assignment_id: string | null
          bound_at: string | null
          bound_subject_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          closed_reason: string | null
          deadline: string | null
          email: string
          employer_id: string
          expires_at: string
          id: string
          invited_at: string
          invited_by: string
          invited_name: string | null
          job_id: string | null
          language: string
          status: string
          use_case: string
        }
        Insert: {
          application_id?: string | null
          assessment_version_id: string
          bound_assignment_id?: string | null
          bound_at?: string | null
          bound_subject_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closed_reason?: string | null
          deadline?: string | null
          email: string
          employer_id: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by: string
          invited_name?: string | null
          job_id?: string | null
          language?: string
          status?: string
          use_case: string
        }
        Update: {
          application_id?: string | null
          assessment_version_id?: string
          bound_assignment_id?: string | null
          bound_at?: string | null
          bound_subject_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closed_reason?: string | null
          deadline?: string | null
          email?: string
          employer_id?: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string
          invited_name?: string | null
          job_id?: string | null
          language?: string
          status?: string
          use_case?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_assessment_invitations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_assessment_invitations_assessment_version_id_fkey"
            columns: ["assessment_version_id"]
            isOneToOne: false
            referencedRelation: "scp_assessment_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_assessment_invitations_bound_assignment_id_fkey"
            columns: ["bound_assignment_id"]
            isOneToOne: false
            referencedRelation: "assessment_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_assessment_invitations_bound_assignment_id_fkey"
            columns: ["bound_assignment_id"]
            isOneToOne: false
            referencedRelation: "scp_rm_employer_assignments"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "scp_assessment_invitations_bound_subject_id_fkey"
            columns: ["bound_subject_id"]
            isOneToOne: false
            referencedRelation: "scp_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_assessment_invitations_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_assessment_invitations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_assessment_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content_hash: string | null
          content_status: string
          created_at: string
          definition_id: string
          id: string
          language_scope: string[]
          notes: string | null
          program_version_id: string | null
          published_at: string | null
          published_by: string | null
          retired_at: string | null
          retired_reason: string | null
          updated_at: string
          validation_status: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content_hash?: string | null
          content_status?: string
          created_at?: string
          definition_id: string
          id?: string
          language_scope?: string[]
          notes?: string | null
          program_version_id?: string | null
          published_at?: string | null
          published_by?: string | null
          retired_at?: string | null
          retired_reason?: string | null
          updated_at?: string
          validation_status?: string
          version_number: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content_hash?: string | null
          content_status?: string
          created_at?: string
          definition_id?: string
          id?: string
          language_scope?: string[]
          notes?: string | null
          program_version_id?: string | null
          published_at?: string | null
          published_by?: string | null
          retired_at?: string | null
          retired_reason?: string | null
          updated_at?: string
          validation_status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_assessment_versions_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "scp_assessment_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_assessment_versions_program_version_id_fkey"
            columns: ["program_version_id"]
            isOneToOne: false
            referencedRelation: "scp_program_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_attempts: {
        Row: {
          accommodation_granted: boolean
          accommodation_note: string | null
          assessment_version_id: string | null
          assignment_id: string | null
          content_status_at_assignment: string | null
          created_at: string
          form_id: string
          governance_mode:
            | Database["public"]["Enums"]["scp_governance_mode"]
            | null
          id: string
          issuer_organization_id: string | null
          jurisdiction_id: string | null
          mode: string
          program_version_id: string | null
          purpose_version_id: string | null
          released_at: string | null
          role_version_id: string | null
          scored_at: string | null
          scoring_model_version: string | null
          started_at: string
          status: string
          subject_id: string
          submitted_at: string | null
          test_grant_id: string | null
          validation_status_at_assignment: string | null
        }
        Insert: {
          accommodation_granted?: boolean
          accommodation_note?: string | null
          assessment_version_id?: string | null
          assignment_id?: string | null
          content_status_at_assignment?: string | null
          created_at?: string
          form_id: string
          governance_mode?:
            | Database["public"]["Enums"]["scp_governance_mode"]
            | null
          id?: string
          issuer_organization_id?: string | null
          jurisdiction_id?: string | null
          mode: string
          program_version_id?: string | null
          purpose_version_id?: string | null
          released_at?: string | null
          role_version_id?: string | null
          scored_at?: string | null
          scoring_model_version?: string | null
          started_at?: string
          status?: string
          subject_id: string
          submitted_at?: string | null
          test_grant_id?: string | null
          validation_status_at_assignment?: string | null
        }
        Update: {
          accommodation_granted?: boolean
          accommodation_note?: string | null
          assessment_version_id?: string | null
          assignment_id?: string | null
          content_status_at_assignment?: string | null
          created_at?: string
          form_id?: string
          governance_mode?:
            | Database["public"]["Enums"]["scp_governance_mode"]
            | null
          id?: string
          issuer_organization_id?: string | null
          jurisdiction_id?: string | null
          mode?: string
          program_version_id?: string | null
          purpose_version_id?: string | null
          released_at?: string | null
          role_version_id?: string | null
          scored_at?: string | null
          scoring_model_version?: string | null
          started_at?: string
          status?: string
          subject_id?: string
          submitted_at?: string | null
          test_grant_id?: string | null
          validation_status_at_assignment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_attempts_assessment_version_id_fkey"
            columns: ["assessment_version_id"]
            isOneToOne: false
            referencedRelation: "scp_assessment_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_attempts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assessment_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_attempts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "scp_rm_employer_assignments"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "scp_attempts_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "scp_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_attempts_issuer_organization_id_fkey"
            columns: ["issuer_organization_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_attempts_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "scp_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_attempts_program_version_id_fkey"
            columns: ["program_version_id"]
            isOneToOne: false
            referencedRelation: "scp_program_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_attempts_purpose_version_id_fkey"
            columns: ["purpose_version_id"]
            isOneToOne: false
            referencedRelation: "scp_purpose_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_attempts_role_version_id_fkey"
            columns: ["role_version_id"]
            isOneToOne: false
            referencedRelation: "scp_role_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_attempts_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "scp_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_attempts_test_grant_id_fkey"
            columns: ["test_grant_id"]
            isOneToOne: false
            referencedRelation: "scp_test_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_behaviour_competency_map: {
        Row: {
          behaviour_version_id: string
          competency_version_id: string
          created_at: string
          id: string
          is_primary: boolean
          weight: number
        }
        Insert: {
          behaviour_version_id: string
          competency_version_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          weight?: number
        }
        Update: {
          behaviour_version_id?: string
          competency_version_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_behaviour_competency_map_behaviour_version_id_fkey"
            columns: ["behaviour_version_id"]
            isOneToOne: false
            referencedRelation: "scp_behaviour_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_behaviour_competency_map_competency_version_id_fkey"
            columns: ["competency_version_id"]
            isOneToOne: false
            referencedRelation: "scp_competency_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_behaviour_versions: {
        Row: {
          behaviour_id: string
          content_status: string
          contraindications_sv: string[]
          created_at: string
          id: string
          is_safety_critical: boolean
          positive_indicators_sv: string[]
          published_at: string | null
          retired_at: string | null
          statement_en: string
          statement_sv: string
          updated_at: string
          version_number: number
        }
        Insert: {
          behaviour_id: string
          content_status?: string
          contraindications_sv?: string[]
          created_at?: string
          id?: string
          is_safety_critical?: boolean
          positive_indicators_sv?: string[]
          published_at?: string | null
          retired_at?: string | null
          statement_en: string
          statement_sv: string
          updated_at?: string
          version_number: number
        }
        Update: {
          behaviour_id?: string
          content_status?: string
          contraindications_sv?: string[]
          created_at?: string
          id?: string
          is_safety_critical?: boolean
          positive_indicators_sv?: string[]
          published_at?: string | null
          retired_at?: string | null
          statement_en?: string
          statement_sv?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_behaviour_versions_behaviour_id_fkey"
            columns: ["behaviour_id"]
            isOneToOne: false
            referencedRelation: "scp_observable_behaviours"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_bundle_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bundle_id: string
          content_hash: string | null
          content_status: string
          core_assessment_version_id: string
          core_form_id: string
          created_at: string
          disclaimer_version: string
          id: string
          module_assessment_version_id: string
          module_form_id: string
          published_at: string | null
          published_by: string | null
          report_version: string
          retired_at: string | null
          retired_reason: string | null
          role_weight_profile_id: string | null
          scoring_version_id: string | null
          updated_at: string
          validation_status: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bundle_id: string
          content_hash?: string | null
          content_status?: string
          core_assessment_version_id: string
          core_form_id: string
          created_at?: string
          disclaimer_version?: string
          id?: string
          module_assessment_version_id: string
          module_form_id: string
          published_at?: string | null
          published_by?: string | null
          report_version?: string
          retired_at?: string | null
          retired_reason?: string | null
          role_weight_profile_id?: string | null
          scoring_version_id?: string | null
          updated_at?: string
          validation_status?: string
          version_number: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bundle_id?: string
          content_hash?: string | null
          content_status?: string
          core_assessment_version_id?: string
          core_form_id?: string
          created_at?: string
          disclaimer_version?: string
          id?: string
          module_assessment_version_id?: string
          module_form_id?: string
          published_at?: string | null
          published_by?: string | null
          report_version?: string
          retired_at?: string | null
          retired_reason?: string | null
          role_weight_profile_id?: string | null
          scoring_version_id?: string | null
          updated_at?: string
          validation_status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_bundle_versions_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "scp_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_bundle_versions_core_assessment_version_id_fkey"
            columns: ["core_assessment_version_id"]
            isOneToOne: false
            referencedRelation: "scp_assessment_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_bundle_versions_core_form_id_fkey"
            columns: ["core_form_id"]
            isOneToOne: false
            referencedRelation: "scp_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_bundle_versions_module_assessment_version_id_fkey"
            columns: ["module_assessment_version_id"]
            isOneToOne: false
            referencedRelation: "scp_assessment_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_bundle_versions_module_form_id_fkey"
            columns: ["module_form_id"]
            isOneToOne: false
            referencedRelation: "scp_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_bundle_versions_role_weight_profile_fkey"
            columns: ["role_weight_profile_id"]
            isOneToOne: false
            referencedRelation: "scp_role_weight_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_bundle_versions_scoring_version_id_fkey"
            columns: ["scoring_version_id"]
            isOneToOne: false
            referencedRelation: "scp_scoring_version_lineage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_bundle_versions_scoring_version_id_fkey"
            columns: ["scoring_version_id"]
            isOneToOne: false
            referencedRelation: "scp_scoring_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_bundles: {
        Row: {
          created_at: string
          id: string
          name_en: string
          name_sv: string
          profession_id: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name_en: string
          name_sv: string
          profession_id: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name_en?: string
          name_sv?: string
          profession_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_bundles_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "scp_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_candidate_responses: {
        Row: {
          attempt_id: string
          best_option_id: string | null
          created_at: string
          display_order: number | null
          id: string
          item_version_id: string
          responded_at: string
          response_text: string | null
          selected_option_id: string | null
          worst_option_id: string | null
        }
        Insert: {
          attempt_id: string
          best_option_id?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          item_version_id: string
          responded_at?: string
          response_text?: string | null
          selected_option_id?: string | null
          worst_option_id?: string | null
        }
        Update: {
          attempt_id?: string
          best_option_id?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          item_version_id?: string
          responded_at?: string
          response_text?: string | null
          selected_option_id?: string | null
          worst_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_candidate_responses_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_candidate_responses_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_rm_employer_assignments"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "scp_candidate_responses_best_option_id_fkey"
            columns: ["best_option_id"]
            isOneToOne: false
            referencedRelation: "scp_item_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_candidate_responses_item_version_id_fkey"
            columns: ["item_version_id"]
            isOneToOne: false
            referencedRelation: "scp_item_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_candidate_responses_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "scp_item_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_candidate_responses_worst_option_id_fkey"
            columns: ["worst_option_id"]
            isOneToOne: false
            referencedRelation: "scp_item_options"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_competencies: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order: number
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
        }
        Relationships: []
      }
      scp_competency_evidence: {
        Row: {
          assessor_actor_id: string | null
          behaviour_version_id: string
          confidence: number
          context_ref: string | null
          context_type: string | null
          contribution: number
          created_at: string
          created_by_service: string | null
          derivation_basis: Json | null
          disclosure_class: string
          id: string
          is_safety_critical: boolean
          issuer_organization_id: string | null
          jurisdiction_id: string | null
          observed_at: string
          provenance_ref: string | null
          provenance_type: string
          purpose_version_id: string | null
          requires_human_review: boolean
          review_status: string
          role_version_id: string | null
          safety_finding: string | null
          safety_severity: string | null
          scoring_model_version: string | null
          source_ref: string
          source_snapshot_hash: string | null
          source_type: string
          subject_id: string
          superseded_at: string | null
          superseded_by: string | null
          superseded_by_actor_id: string | null
          superseded_reason: string | null
          valid_until: string | null
        }
        Insert: {
          assessor_actor_id?: string | null
          behaviour_version_id: string
          confidence: number
          context_ref?: string | null
          context_type?: string | null
          contribution: number
          created_at?: string
          created_by_service?: string | null
          derivation_basis?: Json | null
          disclosure_class?: string
          id?: string
          is_safety_critical?: boolean
          issuer_organization_id?: string | null
          jurisdiction_id?: string | null
          observed_at?: string
          provenance_ref?: string | null
          provenance_type: string
          purpose_version_id?: string | null
          requires_human_review?: boolean
          review_status?: string
          role_version_id?: string | null
          safety_finding?: string | null
          safety_severity?: string | null
          scoring_model_version?: string | null
          source_ref: string
          source_snapshot_hash?: string | null
          source_type: string
          subject_id: string
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_by_actor_id?: string | null
          superseded_reason?: string | null
          valid_until?: string | null
        }
        Update: {
          assessor_actor_id?: string | null
          behaviour_version_id?: string
          confidence?: number
          context_ref?: string | null
          context_type?: string | null
          contribution?: number
          created_at?: string
          created_by_service?: string | null
          derivation_basis?: Json | null
          disclosure_class?: string
          id?: string
          is_safety_critical?: boolean
          issuer_organization_id?: string | null
          jurisdiction_id?: string | null
          observed_at?: string
          provenance_ref?: string | null
          provenance_type?: string
          purpose_version_id?: string | null
          requires_human_review?: boolean
          review_status?: string
          role_version_id?: string | null
          safety_finding?: string | null
          safety_severity?: string | null
          scoring_model_version?: string | null
          source_ref?: string
          source_snapshot_hash?: string | null
          source_type?: string
          subject_id?: string
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_by_actor_id?: string | null
          superseded_reason?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_competency_evidence_behaviour_version_id_fkey"
            columns: ["behaviour_version_id"]
            isOneToOne: false
            referencedRelation: "scp_behaviour_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_competency_evidence_issuer_organization_id_fkey"
            columns: ["issuer_organization_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_competency_evidence_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "scp_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_competency_evidence_purpose_version_id_fkey"
            columns: ["purpose_version_id"]
            isOneToOne: false
            referencedRelation: "scp_purpose_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_competency_evidence_role_version_id_fkey"
            columns: ["role_version_id"]
            isOneToOne: false
            referencedRelation: "scp_role_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_competency_evidence_source_type_fkey"
            columns: ["source_type"]
            isOneToOne: false
            referencedRelation: "scp_evidence_source_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "scp_competency_evidence_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "scp_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_competency_evidence_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "scp_competency_evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_competency_facets: {
        Row: {
          competency_id: string
          created_at: string
          definition_en: string
          definition_sv: string
          display_order: number
          id: string
          name_en: string
          name_sv: string
          slug: string
        }
        Insert: {
          competency_id: string
          created_at?: string
          definition_en: string
          definition_sv: string
          display_order?: number
          id?: string
          name_en: string
          name_sv: string
          slug: string
        }
        Update: {
          competency_id?: string
          created_at?: string
          definition_en?: string
          definition_sv?: string
          display_order?: number
          id?: string
          name_en?: string
          name_sv?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_competency_facets_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "scp_competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_competency_versions: {
        Row: {
          competency_id: string
          content_status: string
          created_at: string
          definition_en: string
          definition_sv: string
          development_indicators_sv: string[]
          does_not_measure_sv: string[]
          id: string
          interpretation_rule_en: string | null
          interpretation_rule_sv: string | null
          name_en: string
          name_sv: string
          published_at: string | null
          retired_at: string | null
          risk_indicators_sv: string[]
          strong_indicators_sv: string[]
          updated_at: string
          version_number: number
        }
        Insert: {
          competency_id: string
          content_status?: string
          created_at?: string
          definition_en: string
          definition_sv: string
          development_indicators_sv?: string[]
          does_not_measure_sv?: string[]
          id?: string
          interpretation_rule_en?: string | null
          interpretation_rule_sv?: string | null
          name_en: string
          name_sv: string
          published_at?: string | null
          retired_at?: string | null
          risk_indicators_sv?: string[]
          strong_indicators_sv?: string[]
          updated_at?: string
          version_number: number
        }
        Update: {
          competency_id?: string
          content_status?: string
          created_at?: string
          definition_en?: string
          definition_sv?: string
          development_indicators_sv?: string[]
          does_not_measure_sv?: string[]
          id?: string
          interpretation_rule_en?: string | null
          interpretation_rule_sv?: string | null
          name_en?: string
          name_sv?: string
          published_at?: string | null
          retired_at?: string | null
          risk_indicators_sv?: string[]
          strong_indicators_sv?: string[]
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_competency_versions_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "scp_competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_content_events: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          id: string
          metadata: Json
          reason: string | null
          subject_id: string | null
          subject_ref: string | null
          subject_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          subject_id?: string | null
          subject_ref?: string | null
          subject_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          subject_id?: string | null
          subject_ref?: string | null
          subject_type?: string
        }
        Relationships: []
      }
      scp_content_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      scp_contract_versions: {
        Row: {
          contract_version: string
          created_at: string
          deprecated_at: string | null
          id: string
          intended_consumer: string | null
          read_model: string
          scope_note: string
          status: string
        }
        Insert: {
          contract_version: string
          created_at?: string
          deprecated_at?: string | null
          id?: string
          intended_consumer?: string | null
          read_model: string
          scope_note: string
          status?: string
        }
        Update: {
          contract_version?: string
          created_at?: string
          deprecated_at?: string | null
          id?: string
          intended_consumer?: string | null
          read_model?: string
          scope_note?: string
          status?: string
        }
        Relationships: []
      }
      scp_employer_report_decisions: {
        Row: {
          action: string
          attempt_id: string
          created_at: string
          decided_at: string
          decided_by: string
          employer_id: string
          id: string
          next_step: string | null
          next_step_owner: string | null
          reason_code: string
          reason_note: string | null
          supersedes_id: string | null
        }
        Insert: {
          action: string
          attempt_id: string
          created_at?: string
          decided_at?: string
          decided_by: string
          employer_id: string
          id?: string
          next_step?: string | null
          next_step_owner?: string | null
          reason_code: string
          reason_note?: string | null
          supersedes_id?: string | null
        }
        Update: {
          action?: string
          attempt_id?: string
          created_at?: string
          decided_at?: string
          decided_by?: string
          employer_id?: string
          id?: string
          next_step?: string | null
          next_step_owner?: string | null
          reason_code?: string
          reason_note?: string | null
          supersedes_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_employer_report_decisions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_employer_report_decisions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_rm_employer_assignments"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "scp_employer_report_decisions_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_employer_report_decisions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "scp_employer_report_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_employer_reviewers: {
        Row: {
          allowed_use_cases: string[]
          employer_id: string
          granted_at: string
          granted_by: string | null
          id: string
          revoked_at: string | null
          revoked_by: string | null
          user_id: string
        }
        Insert: {
          allowed_use_cases?: string[]
          employer_id: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          user_id: string
        }
        Update: {
          allowed_use_cases?: string[]
          employer_id?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_employer_reviewers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_evidence_source_types: {
        Row: {
          code: string
          counts_toward_maturity: boolean
          created_at: string
          has_active_writer: boolean
          name_en: string
          name_sv: string
        }
        Insert: {
          code: string
          counts_toward_maturity?: boolean
          created_at?: string
          has_active_writer?: boolean
          name_en: string
          name_sv: string
        }
        Update: {
          code?: string
          counts_toward_maturity?: boolean
          created_at?: string
          has_active_writer?: boolean
          name_en?: string
          name_sv?: string
        }
        Relationships: []
      }
      scp_fixture_access: {
        Row: {
          employer_id: string
          granted_at: string
          granted_by: string | null
          reason: string
        }
        Insert: {
          employer_id: string
          granted_at?: string
          granted_by?: string | null
          reason: string
        }
        Update: {
          employer_id?: string
          granted_at?: string
          granted_by?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_fixture_access_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: true
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_followup_prompts: {
        Row: {
          audience: string
          competency_id: string
          content_status: string
          created_at: string
          id: string
          prompt_en: string
          prompt_sv: string
          version_number: number
        }
        Insert: {
          audience: string
          competency_id: string
          content_status?: string
          created_at?: string
          id?: string
          prompt_en: string
          prompt_sv: string
          version_number?: number
        }
        Update: {
          audience?: string
          competency_id?: string
          content_status?: string
          created_at?: string
          id?: string
          prompt_en?: string
          prompt_sv?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_followup_prompts_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "scp_competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_form_blocks: {
        Row: {
          asks: string
          block_key: string
          created_at: string
          display_order: number
          form_id: string
          id: string
          intro_en: string
          intro_sv: string
          name_en: string
          name_sv: string
        }
        Insert: {
          asks: string
          block_key: string
          created_at?: string
          display_order: number
          form_id: string
          id?: string
          intro_en: string
          intro_sv: string
          name_en: string
          name_sv: string
        }
        Update: {
          asks?: string
          block_key?: string
          created_at?: string
          display_order?: number
          form_id?: string
          id?: string
          intro_en?: string
          intro_sv?: string
          name_en?: string
          name_sv?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_form_blocks_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "scp_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_form_items: {
        Row: {
          block_key: string
          created_at: string
          display_order: number
          form_id: string
          id: string
          item_version_id: string
          randomise_options: boolean
        }
        Insert: {
          block_key?: string
          created_at?: string
          display_order: number
          form_id: string
          id?: string
          item_version_id: string
          randomise_options?: boolean
        }
        Update: {
          block_key?: string
          created_at?: string
          display_order?: number
          form_id?: string
          id?: string
          item_version_id?: string
          randomise_options?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "scp_form_items_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "scp_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_form_items_item_version_id_fkey"
            columns: ["item_version_id"]
            isOneToOne: false
            referencedRelation: "scp_item_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_forms: {
        Row: {
          assessment_version_id: string
          content_hash: string | null
          created_at: string
          id: string
          name_en: string
          name_sv: string
          randomise_within_block: boolean
          slug: string
          target_minutes_max: number | null
          target_minutes_min: number | null
          updated_at: string
        }
        Insert: {
          assessment_version_id: string
          content_hash?: string | null
          created_at?: string
          id?: string
          name_en: string
          name_sv: string
          randomise_within_block?: boolean
          slug: string
          target_minutes_max?: number | null
          target_minutes_min?: number | null
          updated_at?: string
        }
        Update: {
          assessment_version_id?: string
          content_hash?: string | null
          created_at?: string
          id?: string
          name_en?: string
          name_sv?: string
          randomise_within_block?: boolean
          slug?: string
          target_minutes_max?: number | null
          target_minutes_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_forms_assessment_version_id_fkey"
            columns: ["assessment_version_id"]
            isOneToOne: false
            referencedRelation: "scp_assessment_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_human_reviews: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          opened_at: string
          outcome: string | null
          response_id: string
          review_status: string
          reviewed_under_break_glass: boolean
          reviewer_actor_id: string | null
          reviewer_conflict_disclosed: string | null
          reviewer_rationale: string | null
          scoring_run_id: string | null
          trigger_reason: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          outcome?: string | null
          response_id: string
          review_status?: string
          reviewed_under_break_glass?: boolean
          reviewer_actor_id?: string | null
          reviewer_conflict_disclosed?: string | null
          reviewer_rationale?: string | null
          scoring_run_id?: string | null
          trigger_reason: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          outcome?: string | null
          response_id?: string
          review_status?: string
          reviewed_under_break_glass?: boolean
          reviewer_actor_id?: string | null
          reviewer_conflict_disclosed?: string | null
          reviewer_rationale?: string | null
          scoring_run_id?: string | null
          trigger_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_human_reviews_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "scp_candidate_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_human_reviews_scoring_run_id_fkey"
            columns: ["scoring_run_id"]
            isOneToOne: false
            referencedRelation: "scp_ai_scoring_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_human_reviews_scoring_run_id_fkey"
            columns: ["scoring_run_id"]
            isOneToOne: false
            referencedRelation: "scp_rm_review_queue"
            referencedColumns: ["scoring_run_id"]
          },
        ]
      }
      scp_integrity_flags: {
        Row: {
          attempt_id: string
          created_at: string
          detail: string | null
          flag_type: string
          id: string
          raised_at: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          detail?: string | null
          flag_type: string
          id?: string
          raised_at?: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          detail?: string | null
          flag_type?: string
          id?: string
          raised_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_integrity_flags_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_integrity_flags_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_rm_employer_assignments"
            referencedColumns: ["attempt_id"]
          },
        ]
      }
      scp_intel_edges: {
        Row: {
          assurance: string
          assurance_note: string | null
          created_at: string
          created_by: string | null
          employer_id: string | null
          from_id: string
          from_kind: string
          from_version: string | null
          id: string
          implication_id: string | null
          note: string | null
          relation: string
          superseded_by: string | null
          to_id: string
          to_kind: string
          to_version: string | null
        }
        Insert: {
          assurance?: string
          assurance_note?: string | null
          created_at?: string
          created_by?: string | null
          employer_id?: string | null
          from_id: string
          from_kind: string
          from_version?: string | null
          id?: string
          implication_id?: string | null
          note?: string | null
          relation: string
          superseded_by?: string | null
          to_id: string
          to_kind: string
          to_version?: string | null
        }
        Update: {
          assurance?: string
          assurance_note?: string | null
          created_at?: string
          created_by?: string | null
          employer_id?: string | null
          from_id?: string
          from_kind?: string
          from_version?: string | null
          id?: string
          implication_id?: string | null
          note?: string | null
          relation?: string
          superseded_by?: string | null
          to_id?: string
          to_kind?: string
          to_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_intel_edges_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_intel_edges_implication_id_fkey"
            columns: ["implication_id"]
            isOneToOne: false
            referencedRelation: "scp_research_implications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_intel_edges_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "scp_intel_edges"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_ai_config: {
        Row: {
          ai_enabled: boolean
          id: boolean
          transcript_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_enabled?: boolean
          id?: boolean
          transcript_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_enabled?: boolean
          id?: boolean
          transcript_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      scp_interview_ai_run_retrievals: {
        Row: {
          ai_run_id: string
          created_at: string
          embedding_model_version: string | null
          filtered_reason: string | null
          id: string
          record_id: string
          record_kind: string
          record_version: string | null
          retrieval_method: string
          similarity: number | null
          used_in_prompt: boolean
        }
        Insert: {
          ai_run_id: string
          created_at?: string
          embedding_model_version?: string | null
          filtered_reason?: string | null
          id?: string
          record_id: string
          record_kind: string
          record_version?: string | null
          retrieval_method?: string
          similarity?: number | null
          used_in_prompt?: boolean
        }
        Update: {
          ai_run_id?: string
          created_at?: string
          embedding_model_version?: string | null
          filtered_reason?: string | null
          id?: string
          record_id?: string
          record_kind?: string
          record_version?: string | null
          retrieval_method?: string
          similarity?: number | null
          used_in_prompt?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_ai_run_retrievals_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_ai_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_ai_runs: {
        Row: {
          abstention_reason: string | null
          ai_task_id: string | null
          case_id: string
          cost_micros: number | null
          eval_set_version: string | null
          failure_reason: string | null
          finished_at: string | null
          id: string
          input_hash: string | null
          input_schema_version: string
          input_tokens: number | null
          latency_ms: number | null
          model: string
          model_confirmed_by_provider: boolean
          output_schema_version: string
          output_tokens: number | null
          policy_version: string
          prompt_version: string
          provider: string
          provider_mode: string
          raw_request: Json | null
          raw_response: Json | null
          requires_human_review: boolean
          started_at: string
          started_by: string | null
          status: string
          task: string
          task_version: string
          withheld_passages: Json
        }
        Insert: {
          abstention_reason?: string | null
          ai_task_id?: string | null
          case_id: string
          cost_micros?: number | null
          eval_set_version?: string | null
          failure_reason?: string | null
          finished_at?: string | null
          id?: string
          input_hash?: string | null
          input_schema_version?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          model_confirmed_by_provider?: boolean
          output_schema_version?: string
          output_tokens?: number | null
          policy_version?: string
          prompt_version: string
          provider: string
          provider_mode?: string
          raw_request?: Json | null
          raw_response?: Json | null
          requires_human_review?: boolean
          started_at?: string
          started_by?: string | null
          status?: string
          task: string
          task_version: string
          withheld_passages?: Json
        }
        Update: {
          abstention_reason?: string | null
          ai_task_id?: string | null
          case_id?: string
          cost_micros?: number | null
          eval_set_version?: string | null
          failure_reason?: string | null
          finished_at?: string | null
          id?: string
          input_hash?: string | null
          input_schema_version?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          model_confirmed_by_provider?: boolean
          output_schema_version?: string
          output_tokens?: number | null
          policy_version?: string
          prompt_version?: string
          provider?: string
          provider_mode?: string
          raw_request?: Json | null
          raw_response?: Json | null
          requires_human_review?: boolean
          started_at?: string
          started_by?: string | null
          status?: string
          task?: string
          task_version?: string
          withheld_passages?: Json
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_ai_runs_ai_task_id_fkey"
            columns: ["ai_task_id"]
            isOneToOne: false
            referencedRelation: "scp_ai_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_ai_runs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_ai_runs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
        ]
      }
      scp_interview_approved_probes: {
        Row: {
          created_at: string
          display_order: number
          id: string
          pack_version_id: string
          purpose: string
          purpose_provenance: string
          question_id: string | null
          wording_en: string | null
          wording_sv: string
        }
        Insert: {
          created_at?: string
          display_order: number
          id?: string
          pack_version_id: string
          purpose: string
          purpose_provenance: string
          question_id?: string | null
          wording_en?: string | null
          wording_sv: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          pack_version_id?: string
          purpose?: string
          purpose_provenance?: string
          question_id?: string | null
          wording_en?: string | null
          wording_sv?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_approved_probes_pack_version_id_fkey"
            columns: ["pack_version_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_approved_probes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_core_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_assessments: {
        Row: {
          anchor_id: string
          assessed_at: string
          assessor_id: string
          case_id: string
          created_at: string
          id: string
          level: number
          locked_at: string | null
          question_id: string
          rationale: string
          supersede_reason: string | null
          superseded_by: string | null
          uncertainty_note: string | null
        }
        Insert: {
          anchor_id: string
          assessed_at?: string
          assessor_id: string
          case_id: string
          created_at?: string
          id?: string
          level: number
          locked_at?: string | null
          question_id: string
          rationale: string
          supersede_reason?: string | null
          superseded_by?: string | null
          uncertainty_note?: string | null
        }
        Update: {
          anchor_id?: string
          assessed_at?: string
          assessor_id?: string
          case_id?: string
          created_at?: string
          id?: string
          level?: number
          locked_at?: string | null
          question_id?: string
          rationale?: string
          supersede_reason?: string | null
          superseded_by?: string | null
          uncertainty_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_assessments_anchor_id_fkey"
            columns: ["anchor_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_rating_anchors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_assessments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_assessments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "scp_interview_assessments_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_core_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_assessments_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "scp_interview_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_candidate_corrections: {
        Row: {
          candidate_user_id: string
          case_id: string
          created_at: string
          employer_response: string | null
          id: string
          responded_at: string | null
          responded_by: string | null
          what_is_correct: string
          what_is_wrong: string
        }
        Insert: {
          candidate_user_id: string
          case_id: string
          created_at?: string
          employer_response?: string | null
          id?: string
          responded_at?: string | null
          responded_by?: string | null
          what_is_correct: string
          what_is_wrong: string
        }
        Update: {
          candidate_user_id?: string
          case_id?: string
          created_at?: string
          employer_response?: string | null
          id?: string
          responded_at?: string | null
          responded_by?: string | null
          what_is_correct?: string
          what_is_wrong?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_candidate_corrections_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_candidate_corrections_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
        ]
      }
      scp_interview_candidate_facts: {
        Row: {
          ai_run_id: string | null
          case_id: string
          claim_class: string
          created_at: string
          display_order: number
          fact_kind: string
          human_actor_at: string | null
          human_actor_id: string | null
          human_state: string
          id: string
          source_passage_id: string | null
          source_quote: string | null
          source_status: string
          statement: string
        }
        Insert: {
          ai_run_id?: string | null
          case_id: string
          claim_class?: string
          created_at?: string
          display_order?: number
          fact_kind: string
          human_actor_at?: string | null
          human_actor_id?: string | null
          human_state?: string
          id?: string
          source_passage_id?: string | null
          source_quote?: string | null
          source_status?: string
          statement: string
        }
        Update: {
          ai_run_id?: string | null
          case_id?: string
          claim_class?: string
          created_at?: string
          display_order?: number
          fact_kind?: string
          human_actor_at?: string | null
          human_actor_id?: string | null
          human_state?: string
          id?: string
          source_passage_id?: string | null
          source_quote?: string | null
          source_status?: string
          statement?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_candidate_facts_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_candidate_facts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_candidate_facts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "scp_interview_candidate_facts_source_passage_id_fkey"
            columns: ["source_passage_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_source_passages"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_case_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          ai_run_id: string | null
          at: string
          case_id: string
          event: string
          id: string
          metadata: Json
          new_status: string | null
          previous_status: string | null
          reason: string | null
          seq: number
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          ai_run_id?: string | null
          at?: string
          case_id: string
          event: string
          id?: string
          metadata?: Json
          new_status?: string | null
          previous_status?: string | null
          reason?: string | null
          seq?: never
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          ai_run_id?: string | null
          at?: string
          case_id?: string
          event?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          previous_status?: string | null
          reason?: string | null
          seq?: never
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_case_events_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
        ]
      }
      scp_interview_case_sources: {
        Row: {
          case_id: string
          content_text: string | null
          created_at: string
          disclosure_id: string | null
          erased_at: string | null
          id: string
          label: string
          lawful_basis_note: string
          linked_application_id: string | null
          origin: string
          provided_at: string
          provided_by: string | null
          purpose_code: string
          retention_state: string
          source_kind: string
        }
        Insert: {
          case_id: string
          content_text?: string | null
          created_at?: string
          disclosure_id?: string | null
          erased_at?: string | null
          id?: string
          label: string
          lawful_basis_note: string
          linked_application_id?: string | null
          origin?: string
          provided_at?: string
          provided_by?: string | null
          purpose_code: string
          retention_state?: string
          source_kind: string
        }
        Update: {
          case_id?: string
          content_text?: string | null
          created_at?: string
          disclosure_id?: string | null
          erased_at?: string | null
          id?: string
          label?: string
          lawful_basis_note?: string
          linked_application_id?: string | null
          origin?: string
          provided_at?: string
          provided_by?: string | null
          purpose_code?: string
          retention_state?: string
          source_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_case_sources_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_case_sources_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "scp_interview_case_sources_disclosure_id_fkey"
            columns: ["disclosure_id"]
            isOneToOne: false
            referencedRelation: "sp_disclosures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_case_sources_linked_application_id_fkey"
            columns: ["linked_application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_cases: {
        Row: {
          application_id: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          candidate_display_name: string
          candidate_external_ref: string | null
          candidate_informed_confirmed_at: string | null
          candidate_informed_confirmed_by: string | null
          candidate_informed_statement: string | null
          candidate_user_id: string | null
          created_at: string
          created_by: string | null
          employer_id: string
          id: string
          job_id: string | null
          pack_content_hash: string | null
          pack_version_id: string
          purpose_code: string
          retain_until: string | null
          retention_set_at: string | null
          retention_set_by: string | null
          retention_state: string
          role_version_id: string
          status: string
          title: string
          transcript_lawful_basis_confirmed_at: string | null
          transcript_lawful_basis_confirmed_by: string | null
          transcript_lawful_basis_statement: string | null
          transcript_purpose_code: string | null
          trust_method_id: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          candidate_display_name: string
          candidate_external_ref?: string | null
          candidate_informed_confirmed_at?: string | null
          candidate_informed_confirmed_by?: string | null
          candidate_informed_statement?: string | null
          candidate_user_id?: string | null
          created_at?: string
          created_by?: string | null
          employer_id: string
          id?: string
          job_id?: string | null
          pack_content_hash?: string | null
          pack_version_id: string
          purpose_code?: string
          retain_until?: string | null
          retention_set_at?: string | null
          retention_set_by?: string | null
          retention_state?: string
          role_version_id: string
          status?: string
          title: string
          transcript_lawful_basis_confirmed_at?: string | null
          transcript_lawful_basis_confirmed_by?: string | null
          transcript_lawful_basis_statement?: string | null
          transcript_purpose_code?: string | null
          trust_method_id?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          candidate_display_name?: string
          candidate_external_ref?: string | null
          candidate_informed_confirmed_at?: string | null
          candidate_informed_confirmed_by?: string | null
          candidate_informed_statement?: string | null
          candidate_user_id?: string | null
          created_at?: string
          created_by?: string | null
          employer_id?: string
          id?: string
          job_id?: string | null
          pack_content_hash?: string | null
          pack_version_id?: string
          purpose_code?: string
          retain_until?: string | null
          retention_set_at?: string | null
          retention_set_by?: string | null
          retention_state?: string
          role_version_id?: string
          status?: string
          title?: string
          transcript_lawful_basis_confirmed_at?: string | null
          transcript_lawful_basis_confirmed_by?: string | null
          transcript_lawful_basis_statement?: string | null
          transcript_purpose_code?: string | null
          trust_method_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_cases_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_cases_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_cases_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_cases_pack_version_id_fkey"
            columns: ["pack_version_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_cases_role_version_id_fkey"
            columns: ["role_version_id"]
            isOneToOne: false
            referencedRelation: "scp_role_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_cases_trust_method_id_fkey"
            columns: ["trust_method_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_conduct_guidance: {
        Row: {
          created_at: string
          display_order: number
          guidance_key: string
          id: string
          method_id: string
          statement_en: string
          statement_sv: string
          surface: string
          trust_stage: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          guidance_key: string
          id?: string
          method_id: string
          statement_en: string
          statement_sv: string
          surface: string
          trust_stage: string
        }
        Update: {
          created_at?: string
          display_order?: number
          guidance_key?: string
          id?: string
          method_id?: string
          statement_en?: string
          statement_sv?: string
          surface?: string
          trust_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_conduct_guidance_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_conduct_prohibitions: {
        Row: {
          created_at: string
          display_order: number
          id: string
          method_id: string
          prohibition_key: string
          statement_en: string
          statement_sv: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          method_id: string
          prohibition_key: string
          statement_en: string
          statement_sv: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          method_id?: string
          prohibition_key?: string
          statement_en?: string
          statement_sv?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_conduct_prohibitions_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_conduct_steps: {
        Row: {
          created_at: string
          guidance_en: string
          guidance_sv: string
          id: string
          label_en: string
          label_sv: string
          method_id: string
          ordinal: number
          step_key: string
        }
        Insert: {
          created_at?: string
          guidance_en: string
          guidance_sv: string
          id?: string
          label_en: string
          label_sv: string
          method_id: string
          ordinal: number
          step_key: string
        }
        Update: {
          created_at?: string
          guidance_en?: string
          guidance_sv?: string
          id?: string
          label_en?: string
          label_sv?: string
          method_id?: string
          ordinal?: number
          step_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_conduct_steps_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_core_questions: {
        Row: {
          code: string
          created_at: string
          display_order: number
          evidence_source_note_sv: string | null
          id: string
          pack_version_id: string
          prompt_en: string | null
          prompt_sv: string
          question_type: string
          recommended_duration_max_minutes: number | null
          recommended_duration_min_minutes: number | null
        }
        Insert: {
          code: string
          created_at?: string
          display_order: number
          evidence_source_note_sv?: string | null
          id?: string
          pack_version_id: string
          prompt_en?: string | null
          prompt_sv: string
          question_type: string
          recommended_duration_max_minutes?: number | null
          recommended_duration_min_minutes?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          evidence_source_note_sv?: string | null
          id?: string
          pack_version_id?: string
          prompt_en?: string | null
          prompt_sv?: string
          question_type?: string
          recommended_duration_max_minutes?: number | null
          recommended_duration_min_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_core_questions_pack_version_id_fkey"
            columns: ["pack_version_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_evidence: {
        Row: {
          case_id: string
          confirmed_at: string
          confirmed_by: string
          correction_note: string | null
          created_at: string
          e1_situation: string | null
          e2_own_role: string | null
          e3_action: string | null
          e4_effect: string | null
          e5_reflection: string | null
          evidence_dimension_id: string | null
          excerpt: string
          id: string
          note_id: string | null
          origin: string
          original_excerpt: string | null
          pack_competency_id: string | null
          proposal_id: string | null
          question_id: string
          source_passage_id: string | null
        }
        Insert: {
          case_id: string
          confirmed_at?: string
          confirmed_by: string
          correction_note?: string | null
          created_at?: string
          e1_situation?: string | null
          e2_own_role?: string | null
          e3_action?: string | null
          e4_effect?: string | null
          e5_reflection?: string | null
          evidence_dimension_id?: string | null
          excerpt: string
          id?: string
          note_id?: string | null
          origin: string
          original_excerpt?: string | null
          pack_competency_id?: string | null
          proposal_id?: string | null
          question_id: string
          source_passage_id?: string | null
        }
        Update: {
          case_id?: string
          confirmed_at?: string
          confirmed_by?: string
          correction_note?: string | null
          created_at?: string
          e1_situation?: string | null
          e2_own_role?: string | null
          e3_action?: string | null
          e4_effect?: string | null
          e5_reflection?: string | null
          evidence_dimension_id?: string | null
          excerpt?: string
          id?: string
          note_id?: string | null
          origin?: string
          original_excerpt?: string | null
          pack_competency_id?: string | null
          proposal_id?: string | null
          question_id?: string
          source_passage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_evidence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_evidence_dimension_id_fkey"
            columns: ["evidence_dimension_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_evidence_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_session_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_pack_competency_id_fkey"
            columns: ["pack_competency_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "scp_interview_evidence_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_core_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_source_passage_id_fkey"
            columns: ["source_passage_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_source_passages"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_evidence_dimensions: {
        Row: {
          code: string
          created_at: string
          description_sv: string | null
          display_order: number
          id: string
          label_en: string | null
          label_sv: string
          question_id: string
        }
        Insert: {
          code: string
          created_at?: string
          description_sv?: string | null
          display_order: number
          id?: string
          label_en?: string | null
          label_sv: string
          question_id: string
        }
        Update: {
          code?: string
          created_at?: string
          description_sv?: string | null
          display_order?: number
          id?: string
          label_en?: string | null
          label_sv?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_evidence_dimensions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_core_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_evidence_proposals: {
        Row: {
          ai_run_id: string
          case_id: string
          correction_class: string | null
          created_at: string
          e1_situation: string | null
          e2_own_role: string | null
          e3_action: string | null
          e4_effect: string | null
          e5_reflection: string | null
          evidence_dimension_id: string | null
          excerpt: string
          extraction_confidence: number | null
          id: string
          note_id: string | null
          pack_competency_id: string | null
          prohibited_conclusion_note: string | null
          question_id: string
          relevance_rationale: string
          review_note: string | null
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_passage_id: string | null
          uncertainty_note: string | null
        }
        Insert: {
          ai_run_id: string
          case_id: string
          correction_class?: string | null
          created_at?: string
          e1_situation?: string | null
          e2_own_role?: string | null
          e3_action?: string | null
          e4_effect?: string | null
          e5_reflection?: string | null
          evidence_dimension_id?: string | null
          excerpt: string
          extraction_confidence?: number | null
          id?: string
          note_id?: string | null
          pack_competency_id?: string | null
          prohibited_conclusion_note?: string | null
          question_id: string
          relevance_rationale?: string
          review_note?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_passage_id?: string | null
          uncertainty_note?: string | null
        }
        Update: {
          ai_run_id?: string
          case_id?: string
          correction_class?: string | null
          created_at?: string
          e1_situation?: string | null
          e2_own_role?: string | null
          e3_action?: string | null
          e4_effect?: string | null
          e5_reflection?: string | null
          evidence_dimension_id?: string | null
          excerpt?: string
          extraction_confidence?: number | null
          id?: string
          note_id?: string | null
          pack_competency_id?: string | null
          prohibited_conclusion_note?: string | null
          question_id?: string
          relevance_rationale?: string
          review_note?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_passage_id?: string | null
          uncertainty_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_evidence_proposals_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_proposals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_proposals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_proposals_evidence_dimension_id_fkey"
            columns: ["evidence_dimension_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_evidence_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_proposals_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_session_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_proposals_pack_competency_id_fkey"
            columns: ["pack_competency_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_proposals_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_core_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_evidence_proposals_source_passage_id_fkey"
            columns: ["source_passage_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_source_passages"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_findings: {
        Row: {
          ai_run_id: string | null
          case_id: string
          claim_class: string
          created_at: string
          finding_kind: string
          human_actor_at: string | null
          human_actor_id: string | null
          human_note: string | null
          human_state: string
          id: string
          question_id: string | null
          rationale: string | null
          resolution_state: string
          source_passage_id: string | null
          statement: string
          verification_rule_id: string | null
        }
        Insert: {
          ai_run_id?: string | null
          case_id: string
          claim_class?: string
          created_at?: string
          finding_kind: string
          human_actor_at?: string | null
          human_actor_id?: string | null
          human_note?: string | null
          human_state?: string
          id?: string
          question_id?: string | null
          rationale?: string | null
          resolution_state?: string
          source_passage_id?: string | null
          statement: string
          verification_rule_id?: string | null
        }
        Update: {
          ai_run_id?: string | null
          case_id?: string
          claim_class?: string
          created_at?: string
          finding_kind?: string
          human_actor_at?: string | null
          human_actor_id?: string | null
          human_note?: string | null
          human_state?: string
          id?: string
          question_id?: string | null
          rationale?: string | null
          resolution_state?: string
          source_passage_id?: string | null
          statement?: string
          verification_rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_findings_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_findings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_findings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "scp_interview_findings_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_core_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_findings_source_passage_id_fkey"
            columns: ["source_passage_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_source_passages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_findings_verification_rule_id_fkey"
            columns: ["verification_rule_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_verification_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_guide_prompts: {
        Row: {
          authored_by_ai: boolean
          competency_id: string
          content_status: string
          created_at: string
          facet_id: string | null
          focus: string
          followup_en: string
          followup_sv: string
          id: string
          listen_for_en: string[]
          listen_for_sv: string[]
          question_en: string
          question_sv: string
          version_number: number
        }
        Insert: {
          authored_by_ai?: boolean
          competency_id: string
          content_status?: string
          created_at?: string
          facet_id?: string | null
          focus: string
          followup_en: string
          followup_sv: string
          id?: string
          listen_for_en: string[]
          listen_for_sv: string[]
          question_en: string
          question_sv: string
          version_number?: number
        }
        Update: {
          authored_by_ai?: boolean
          competency_id?: string
          content_status?: string
          created_at?: string
          facet_id?: string | null
          focus?: string
          followup_en?: string
          followup_sv?: string
          id?: string
          listen_for_en?: string[]
          listen_for_sv?: string[]
          question_en?: string
          question_sv?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_guide_prompts_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "scp_competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_guide_prompts_facet_id_fkey"
            columns: ["facet_id"]
            isOneToOne: false
            referencedRelation: "scp_competency_facets"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_method_practices: {
        Row: {
          claim_id: string | null
          created_at: string
          display_order: number
          id: string
          method_id: string
          peace_stage: string | null
          practice_kind: string
          rationale: string | null
          statement_en: string | null
          statement_sv: string
        }
        Insert: {
          claim_id?: string | null
          created_at?: string
          display_order?: number
          id?: string
          method_id: string
          peace_stage?: string | null
          practice_kind: string
          rationale?: string | null
          statement_en?: string | null
          statement_sv: string
        }
        Update: {
          claim_id?: string | null
          created_at?: string
          display_order?: number
          id?: string
          method_id?: string
          peace_stage?: string | null
          practice_kind?: string
          rationale?: string | null
          statement_en?: string | null
          statement_sv?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_method_practices_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "scp_research_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_method_practices_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_methods: {
        Row: {
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          intended_context: string
          jurisdiction_code: string | null
          locale_notes: string | null
          method_family: string
          name: string
          product_implementation: string
          prohibited_interpretations: string[]
          purpose: string
          required_reviewer_qualification: string | null
          slug: string
          supported_behaviours: string[]
          updated_at: string
          version_number: number
        }
        Insert: {
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          intended_context: string
          jurisdiction_code?: string | null
          locale_notes?: string | null
          method_family: string
          name: string
          product_implementation: string
          prohibited_interpretations?: string[]
          purpose: string
          required_reviewer_qualification?: string | null
          slug: string
          supported_behaviours?: string[]
          updated_at?: string
          version_number?: number
        }
        Update: {
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          intended_context?: string
          jurisdiction_code?: string | null
          locale_notes?: string | null
          method_family?: string
          name?: string
          product_implementation?: string
          prohibited_interpretations?: string[]
          purpose?: string
          required_reviewer_qualification?: string | null
          slug?: string
          supported_behaviours?: string[]
          updated_at?: string
          version_number?: number
        }
        Relationships: []
      }
      scp_interview_notes: {
        Row: {
          area_code: string
          attempt_id: string
          employer_id: string
          id: string
          note: string | null
          outcome: string
          recorded_at: string
          recorded_by: string
        }
        Insert: {
          area_code: string
          attempt_id: string
          employer_id: string
          id?: string
          note?: string | null
          outcome: string
          recorded_at?: string
          recorded_by: string
        }
        Update: {
          area_code?: string
          attempt_id?: string
          employer_id?: string
          id?: string
          note?: string | null
          outcome?: string
          recorded_at?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_notes_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_notes_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_rm_employer_assignments"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "scp_interview_notes_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_pack_competencies: {
        Row: {
          code: string
          created_at: string
          definition_en: string | null
          definition_sv: string
          display_order: number
          id: string
          name_en: string | null
          name_sv: string
          observable_indicators_sv: string[]
          pack_version_id: string
        }
        Insert: {
          code: string
          created_at?: string
          definition_en?: string | null
          definition_sv: string
          display_order: number
          id?: string
          name_en?: string | null
          name_sv: string
          observable_indicators_sv?: string[]
          pack_version_id: string
        }
        Update: {
          code?: string
          created_at?: string
          definition_en?: string | null
          definition_sv?: string
          display_order?: number
          id?: string
          name_en?: string | null
          name_sv?: string
          observable_indicators_sv?: string[]
          pack_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_pack_competencies_pack_version_id_fkey"
            columns: ["pack_version_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_pack_competency_map: {
        Row: {
          behaviour_version_id: string | null
          competency_version_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          mapping_state: string
          pack_competency_id: string
          rationale_sv: string
          relation: string
        }
        Insert: {
          behaviour_version_id?: string | null
          competency_version_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          mapping_state?: string
          pack_competency_id: string
          rationale_sv: string
          relation: string
        }
        Update: {
          behaviour_version_id?: string | null
          competency_version_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          mapping_state?: string
          pack_competency_id?: string
          rationale_sv?: string
          relation?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_pack_competency_map_behaviour_version_id_fkey"
            columns: ["behaviour_version_id"]
            isOneToOne: false
            referencedRelation: "scp_behaviour_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_pack_competency_map_competency_version_id_fkey"
            columns: ["competency_version_id"]
            isOneToOne: false
            referencedRelation: "scp_competency_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_pack_competency_map_pack_competency_id_fkey"
            columns: ["pack_competency_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_pack_events: {
        Row: {
          actor_id: string | null
          at: string
          content_hash: string | null
          event: string
          id: string
          metadata: Json
          new_status: string | null
          pack_id: string
          pack_version_id: string | null
          previous_status: string | null
          reason: string | null
          seq: number
          source_version: string | null
        }
        Insert: {
          actor_id?: string | null
          at?: string
          content_hash?: string | null
          event: string
          id?: string
          metadata?: Json
          new_status?: string | null
          pack_id: string
          pack_version_id?: string | null
          previous_status?: string | null
          reason?: string | null
          seq?: never
          source_version?: string | null
        }
        Update: {
          actor_id?: string | null
          at?: string
          content_hash?: string | null
          event?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          pack_id?: string
          pack_version_id?: string | null
          previous_status?: string | null
          reason?: string | null
          seq?: never
          source_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_pack_events_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_pack_events_pack_version_id_fkey"
            columns: ["pack_version_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_pack_pilot_grants: {
        Row: {
          cohort_user_ids: string[]
          employer_id: string
          environment: string
          expires_on: string
          granted_at: string
          granted_by: string | null
          id: string
          pack_version_id: string
          rationale: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          starts_on: string
          usage_mode: string
        }
        Insert: {
          cohort_user_ids?: string[]
          employer_id: string
          environment?: string
          expires_on: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          pack_version_id: string
          rationale: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          starts_on?: string
          usage_mode?: string
        }
        Update: {
          cohort_user_ids?: string[]
          employer_id?: string
          environment?: string
          expires_on?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          pack_version_id?: string
          rationale?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          starts_on?: string
          usage_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_pack_pilot_grants_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_pack_pilot_grants_pack_version_id_fkey"
            columns: ["pack_version_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_pack_reviews: {
        Row: {
          content_hash_at_review: string
          decided_at: string
          decision: string
          gate: string
          id: string
          pack_version_id: string
          rationale: string
          reviewer_id: string
        }
        Insert: {
          content_hash_at_review: string
          decided_at?: string
          decision: string
          gate: string
          id?: string
          pack_version_id: string
          rationale: string
          reviewer_id: string
        }
        Update: {
          content_hash_at_review?: string
          decided_at?: string
          decision?: string
          gate?: string
          id?: string
          pack_version_id?: string
          rationale?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_pack_reviews_pack_version_id_fkey"
            columns: ["pack_version_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_pack_versions: {
        Row: {
          content_hash: string | null
          content_status: string
          created_at: string
          created_by: string | null
          id: string
          locale: string
          pack_id: string
          pilot_availability: string
          published_at: string | null
          published_by: string | null
          retired_at: string | null
          retired_by: string | null
          retired_reason: string | null
          role_version_id: string
          source_document_version: string
          source_reference: string
          summary_sv: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspended_reason: string | null
          updated_at: string
          validation_label: string
          version_number: number
        }
        Insert: {
          content_hash?: string | null
          content_status?: string
          created_at?: string
          created_by?: string | null
          id?: string
          locale: string
          pack_id: string
          pilot_availability?: string
          published_at?: string | null
          published_by?: string | null
          retired_at?: string | null
          retired_by?: string | null
          retired_reason?: string | null
          role_version_id: string
          source_document_version: string
          source_reference: string
          summary_sv?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          updated_at?: string
          validation_label?: string
          version_number: number
        }
        Update: {
          content_hash?: string | null
          content_status?: string
          created_at?: string
          created_by?: string | null
          id?: string
          locale?: string
          pack_id?: string
          pilot_availability?: string
          published_at?: string | null
          published_by?: string | null
          retired_at?: string | null
          retired_by?: string | null
          retired_reason?: string | null
          role_version_id?: string
          source_document_version?: string
          source_reference?: string
          summary_sv?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          updated_at?: string
          validation_label?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_pack_versions_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_pack_versions_role_version_id_fkey"
            columns: ["role_version_id"]
            isOneToOne: false
            referencedRelation: "scp_role_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_packs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name_en: string | null
          name_sv: string
          purpose_sv: string
          role_id: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name_en?: string | null
          name_sv: string
          purpose_sv: string
          role_id: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name_en?: string | null
          name_sv?: string
          purpose_sv?: string
          role_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_packs_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "scp_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_panel_members: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          panel_id: string
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          panel_id: string
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          panel_id?: string
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_panel_members_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_panels"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_panels: {
        Row: {
          case_id: string
          concluded_at: string | null
          concluded_by: string | null
          conclusion: string | null
          id: string
          opened_at: string
          opened_by: string | null
          revealed_at: string | null
          revealed_by: string | null
          state: string
        }
        Insert: {
          case_id: string
          concluded_at?: string | null
          concluded_by?: string | null
          conclusion?: string | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          revealed_at?: string | null
          revealed_by?: string | null
          state?: string
        }
        Update: {
          case_id?: string
          concluded_at?: string | null
          concluded_by?: string | null
          conclusion?: string | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          revealed_at?: string | null
          revealed_by?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_panels_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_panels_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
        ]
      }
      scp_interview_prep_items: {
        Row: {
          claim_class: string
          created_at: string
          display_order: number
          human_state: string
          id: string
          item_kind: string
          plan_id: string
          probe_id: string | null
          question_id: string | null
          source_passage_id: string | null
          source_quote: string | null
          statement: string
        }
        Insert: {
          claim_class?: string
          created_at?: string
          display_order?: number
          human_state?: string
          id?: string
          item_kind: string
          plan_id: string
          probe_id?: string | null
          question_id?: string | null
          source_passage_id?: string | null
          source_quote?: string | null
          statement: string
        }
        Update: {
          claim_class?: string
          created_at?: string
          display_order?: number
          human_state?: string
          id?: string
          item_kind?: string
          plan_id?: string
          probe_id?: string | null
          question_id?: string | null
          source_passage_id?: string | null
          source_quote?: string | null
          statement?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_prep_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_prep_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_prep_items_probe_id_fkey"
            columns: ["probe_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_approved_probes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_prep_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_core_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_prep_items_source_passage_id_fkey"
            columns: ["source_passage_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_source_passages"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_prep_plans: {
        Row: {
          ai_disclosure: string
          ai_disclosure_en: string | null
          ai_run_id: string | null
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          candidate_summary: string | null
          case_id: string
          closing_guidance: string | null
          created_at: string
          id: string
          opening_guidance: string | null
          role_summary: string | null
          status: string
          time_plan: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          ai_disclosure?: string
          ai_disclosure_en?: string | null
          ai_run_id?: string | null
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          candidate_summary?: string | null
          case_id: string
          closing_guidance?: string | null
          created_at?: string
          id?: string
          opening_guidance?: string | null
          role_summary?: string | null
          status?: string
          time_plan?: string | null
          updated_at?: string
          version_number?: number
        }
        Update: {
          ai_disclosure?: string
          ai_disclosure_en?: string | null
          ai_run_id?: string | null
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          candidate_summary?: string | null
          case_id?: string
          closing_guidance?: string | null
          created_at?: string
          id?: string
          opening_guidance?: string | null
          role_summary?: string | null
          status?: string
          time_plan?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_prep_plans_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_prep_plans_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_prep_plans_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
        ]
      }
      scp_interview_probe_usages: {
        Row: {
          contextual_text: string | null
          id: string
          outcome: string
          probe_id: string | null
          question_id: string
          session_id: string
          used_at: string
          used_by: string | null
        }
        Insert: {
          contextual_text?: string | null
          id?: string
          outcome?: string
          probe_id?: string | null
          question_id: string
          session_id: string
          used_at?: string
          used_by?: string | null
        }
        Update: {
          contextual_text?: string | null
          id?: string
          outcome?: string
          probe_id?: string | null
          question_id?: string
          session_id?: string
          used_at?: string
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_probe_usages_probe_id_fkey"
            columns: ["probe_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_approved_probes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_probe_usages_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_core_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_probe_usages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_prohibited_areas: {
        Row: {
          area_type: string
          code: string
          created_at: string
          display_order: number
          id: string
          pack_version_id: string
          rationale_sv: string
          statement_en: string | null
          statement_sv: string
        }
        Insert: {
          area_type: string
          code: string
          created_at?: string
          display_order: number
          id?: string
          pack_version_id: string
          rationale_sv: string
          statement_en?: string | null
          statement_sv: string
        }
        Update: {
          area_type?: string
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          pack_version_id?: string
          rationale_sv?: string
          statement_en?: string | null
          statement_sv?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_prohibited_areas_pack_version_id_fkey"
            columns: ["pack_version_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_question_competencies: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          pack_competency_id: string
          question_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          pack_competency_id: string
          question_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          pack_competency_id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_question_competencies_pack_competency_id_fkey"
            columns: ["pack_competency_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_question_competencies_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_core_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_rating_anchors: {
        Row: {
          anchor_en: string | null
          anchor_sv: string
          counts_toward_aggregation: boolean
          created_at: string
          id: string
          is_safety_critical: boolean
          label_en: string | null
          label_sv: string
          level: number
          pack_competency_id: string | null
          question_id: string | null
        }
        Insert: {
          anchor_en?: string | null
          anchor_sv: string
          counts_toward_aggregation: boolean
          created_at?: string
          id?: string
          is_safety_critical?: boolean
          label_en?: string | null
          label_sv: string
          level: number
          pack_competency_id?: string | null
          question_id?: string | null
        }
        Update: {
          anchor_en?: string | null
          anchor_sv?: string
          counts_toward_aggregation?: boolean
          created_at?: string
          id?: string
          is_safety_critical?: boolean
          label_en?: string | null
          label_sv?: string
          level?: number
          pack_competency_id?: string | null
          question_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_rating_anchors_pack_competency_id_fkey"
            columns: ["pack_competency_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_rating_anchors_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_core_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_reports: {
        Row: {
          case_id: string
          content_hash: string | null
          created_at: string
          draft_ai_run_id: string | null
          draft_summary: string | null
          finalised_at: string | null
          finalised_by: string | null
          id: string
          pack_content_hash: string | null
          pack_version_id: string
          payload: Json | null
          role_version_id: string
          status: string
          version_number: number
        }
        Insert: {
          case_id: string
          content_hash?: string | null
          created_at?: string
          draft_ai_run_id?: string | null
          draft_summary?: string | null
          finalised_at?: string | null
          finalised_by?: string | null
          id?: string
          pack_content_hash?: string | null
          pack_version_id: string
          payload?: Json | null
          role_version_id: string
          status?: string
          version_number?: number
        }
        Update: {
          case_id?: string
          content_hash?: string | null
          created_at?: string
          draft_ai_run_id?: string | null
          draft_summary?: string | null
          finalised_at?: string | null
          finalised_by?: string | null
          id?: string
          pack_content_hash?: string | null
          pack_version_id?: string
          payload?: Json | null
          role_version_id?: string
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "scp_interview_reports_draft_ai_run_id_fkey"
            columns: ["draft_ai_run_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_reports_pack_version_id_fkey"
            columns: ["pack_version_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_reports_role_version_id_fkey"
            columns: ["role_version_id"]
            isOneToOne: false
            referencedRelation: "scp_role_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_role_requirements: {
        Row: {
          ai_run_id: string | null
          case_id: string
          claim_class: string
          created_at: string
          display_order: number
          human_actor_at: string | null
          human_actor_id: string | null
          human_state: string
          id: string
          requirement_kind: string
          source_passage_id: string | null
          source_quote: string | null
          statement: string
        }
        Insert: {
          ai_run_id?: string | null
          case_id: string
          claim_class?: string
          created_at?: string
          display_order?: number
          human_actor_at?: string | null
          human_actor_id?: string | null
          human_state?: string
          id?: string
          requirement_kind: string
          source_passage_id?: string | null
          source_quote?: string | null
          statement: string
        }
        Update: {
          ai_run_id?: string | null
          case_id?: string
          claim_class?: string
          created_at?: string
          display_order?: number
          human_actor_at?: string | null
          human_actor_id?: string | null
          human_state?: string
          id?: string
          requirement_kind?: string
          source_passage_id?: string | null
          source_quote?: string | null
          statement?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_role_requirements_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_role_requirements_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_role_requirements_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "scp_interview_role_requirements_source_passage_id_fkey"
            columns: ["source_passage_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_source_passages"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_session_notes: {
        Row: {
          author_id: string | null
          body: string
          candidate_correction: string | null
          created_at: string
          id: string
          note_kind: string
          question_id: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          candidate_correction?: string | null
          created_at?: string
          id?: string
          note_kind?: string
          question_id?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          candidate_correction?: string | null
          created_at?: string
          id?: string
          note_kind?: string
          question_id?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_session_notes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_core_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_session_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_session_questions: {
        Row: {
          completed_at: string | null
          display_order: number
          elapsed_seconds: number | null
          id: string
          question_id: string
          session_id: string
          skip_reason: string | null
          started_at: string | null
          state: string
        }
        Insert: {
          completed_at?: string | null
          display_order: number
          elapsed_seconds?: number | null
          id?: string
          question_id: string
          session_id: string
          skip_reason?: string | null
          started_at?: string | null
          state?: string
        }
        Update: {
          completed_at?: string | null
          display_order?: number
          elapsed_seconds?: number | null
          id?: string
          question_id?: string
          session_id?: string
          skip_reason?: string | null
          started_at?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_session_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_core_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_session_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_sessions: {
        Row: {
          case_id: string
          completed_at: string | null
          created_by: string | null
          id: string
          interviewer_names: string | null
          last_autosave_at: string | null
          paused_at: string | null
          peace_stage: string
          plan_id: string
          process_reflection: string | null
          protocol_deviations: string | null
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          case_id: string
          completed_at?: string | null
          created_by?: string | null
          id?: string
          interviewer_names?: string | null
          last_autosave_at?: string | null
          paused_at?: string | null
          peace_stage?: string
          plan_id: string
          process_reflection?: string | null
          protocol_deviations?: string | null
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          completed_at?: string | null
          created_by?: string | null
          id?: string
          interviewer_names?: string | null
          last_autosave_at?: string | null
          paused_at?: string | null
          peace_stage?: string
          plan_id?: string
          process_reflection?: string | null
          protocol_deviations?: string | null
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_sessions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_interview_sessions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_process_quality"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "scp_interview_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_prep_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_source_passages: {
        Row: {
          char_end: number | null
          char_start: number | null
          content: string
          created_at: string
          id: string
          passage_index: number
          source_id: string
        }
        Insert: {
          char_end?: number | null
          char_start?: number | null
          content: string
          created_at?: string
          id?: string
          passage_index: number
          source_id: string
        }
        Update: {
          char_end?: number | null
          char_start?: number | null
          content?: string
          created_at?: string
          id?: string
          passage_index?: number
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_source_passages_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_case_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_verification_rules: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
          interview_action_sv: string
          pack_version_id: string
          passport_boundary_sv: string
          permitted_source_states: string[]
          requirement_sv: string
          subsequent_verification_sv: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order: number
          id?: string
          interview_action_sv: string
          pack_version_id: string
          passport_boundary_sv: string
          permitted_source_states?: string[]
          requirement_sv: string
          subsequent_verification_sv: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          interview_action_sv?: string
          pack_version_id?: string
          passport_boundary_sv?: string
          permitted_source_states?: string[]
          requirement_sv?: string
          subsequent_verification_sv?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_verification_rules_pack_version_id_fkey"
            columns: ["pack_version_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_item_exposure: {
        Row: {
          attempt_id: string | null
          created_at: string
          exposed_at: string
          id: string
          item_version_id: string
        }
        Insert: {
          attempt_id?: string | null
          created_at?: string
          exposed_at?: string
          id?: string
          item_version_id: string
        }
        Update: {
          attempt_id?: string | null
          created_at?: string
          exposed_at?: string
          id?: string
          item_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_item_exposure_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_item_exposure_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_rm_employer_assignments"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "scp_item_exposure_item_version_id_fkey"
            columns: ["item_version_id"]
            isOneToOne: false
            referencedRelation: "scp_item_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_item_option_texts: {
        Row: {
          created_at: string
          id: string
          item_option_id: string
          label: string
          language: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_option_id: string
          label: string
          language: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_option_id?: string
          label?: string
          language?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_item_option_texts_item_option_id_fkey"
            columns: ["item_option_id"]
            isOneToOne: false
            referencedRelation: "scp_item_options"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_item_options: {
        Row: {
          created_at: string
          display_order: number
          distractor_error_type: string | null
          id: string
          is_best_key: boolean
          is_preferred: boolean
          is_worst_key: boolean
          item_version_id: string
          learning_feedback_en: string | null
          learning_feedback_sv: string | null
          option_key: string
          reverse_scored: boolean
          score_value: number
          scoring_rationale_en: string | null
          scoring_rationale_sv: string
        }
        Insert: {
          created_at?: string
          display_order: number
          distractor_error_type?: string | null
          id?: string
          is_best_key?: boolean
          is_preferred?: boolean
          is_worst_key?: boolean
          item_version_id: string
          learning_feedback_en?: string | null
          learning_feedback_sv?: string | null
          option_key: string
          reverse_scored?: boolean
          score_value: number
          scoring_rationale_en?: string | null
          scoring_rationale_sv: string
        }
        Update: {
          created_at?: string
          display_order?: number
          distractor_error_type?: string | null
          id?: string
          is_best_key?: boolean
          is_preferred?: boolean
          is_worst_key?: boolean
          item_version_id?: string
          learning_feedback_en?: string | null
          learning_feedback_sv?: string | null
          option_key?: string
          reverse_scored?: boolean
          score_value?: number
          scoring_rationale_en?: string | null
          scoring_rationale_sv?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_item_options_item_version_id_fkey"
            columns: ["item_version_id"]
            isOneToOne: false
            referencedRelation: "scp_item_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_item_texts: {
        Row: {
          adaptation_notes: string | null
          adaptation_status: string
          created_at: string
          id: string
          item_version_id: string
          language: string
          prompt: string
          reviewed_at: string | null
          reviewed_by: string | null
          scenario: string
          updated_at: string
        }
        Insert: {
          adaptation_notes?: string | null
          adaptation_status?: string
          created_at?: string
          id?: string
          item_version_id: string
          language: string
          prompt: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scenario: string
          updated_at?: string
        }
        Update: {
          adaptation_notes?: string | null
          adaptation_status?: string
          created_at?: string
          id?: string
          item_version_id?: string
          language?: string
          prompt?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scenario?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_item_texts_item_version_id_fkey"
            columns: ["item_version_id"]
            isOneToOne: false
            referencedRelation: "scp_item_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_item_version_professions: {
        Row: {
          created_at: string
          id: string
          item_version_id: string
          job_analysis_reference: string | null
          profession_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          sme_review_status: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_version_id: string
          job_analysis_reference?: string | null
          profession_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sme_review_status?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_version_id?: string
          job_analysis_reference?: string | null
          profession_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sme_review_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_item_version_professions_item_version_id_fkey"
            columns: ["item_version_id"]
            isOneToOne: false
            referencedRelation: "scp_item_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_item_version_professions_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "scp_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_item_versions: {
        Row: {
          accessibility_review_status: string
          authored_by_ai: boolean
          bias_review_notes: string | null
          bias_review_status: string
          cognitive_demand: string | null
          cognitive_review_status: string
          competency_id: string
          content_hash: string | null
          content_status: string
          context_note: string | null
          created_at: string
          depends_on_employer_instruction: boolean
          difficulty: string | null
          evidence_source_type: string
          facet_id: string | null
          id: string
          information_available_sv: string | null
          information_withheld_sv: string | null
          is_safety_critical: boolean
          item_format: string
          item_id: string
          jurisdiction_id: string | null
          language_review_status: string
          learning_counterpart_decision: string | null
          learning_counterpart_id: string | null
          legal_assumption_sv: string | null
          legal_basis_required: boolean
          legal_review_expires_at: string | null
          legal_review_status: string
          legal_reviewed_at: string | null
          legal_reviewed_by: string | null
          legal_source: string | null
          market: string | null
          mode: string | null
          observable_behavior: string
          overgeneralisation_guard_sv: string | null
          pilot_stats: Json
          primary_behaviour_id: string | null
          primary_construct: string | null
          published_at: string | null
          requires_human_review: boolean
          response_process: string
          retired_at: string | null
          secondary_competency_id: string | null
          sme_review_notes: string | null
          sme_review_status: string
          sme_reviewer_count: number
          tests_what: string | null
          updated_at: string
          validation_status: string
          version_number: number
          work_context_sv: string | null
        }
        Insert: {
          accessibility_review_status?: string
          authored_by_ai?: boolean
          bias_review_notes?: string | null
          bias_review_status?: string
          cognitive_demand?: string | null
          cognitive_review_status?: string
          competency_id: string
          content_hash?: string | null
          content_status?: string
          context_note?: string | null
          created_at?: string
          depends_on_employer_instruction?: boolean
          difficulty?: string | null
          evidence_source_type?: string
          facet_id?: string | null
          id?: string
          information_available_sv?: string | null
          information_withheld_sv?: string | null
          is_safety_critical?: boolean
          item_format: string
          item_id: string
          jurisdiction_id?: string | null
          language_review_status?: string
          learning_counterpart_decision?: string | null
          learning_counterpart_id?: string | null
          legal_assumption_sv?: string | null
          legal_basis_required?: boolean
          legal_review_expires_at?: string | null
          legal_review_status?: string
          legal_reviewed_at?: string | null
          legal_reviewed_by?: string | null
          legal_source?: string | null
          market?: string | null
          mode?: string | null
          observable_behavior: string
          overgeneralisation_guard_sv?: string | null
          pilot_stats?: Json
          primary_behaviour_id?: string | null
          primary_construct?: string | null
          published_at?: string | null
          requires_human_review?: boolean
          response_process: string
          retired_at?: string | null
          secondary_competency_id?: string | null
          sme_review_notes?: string | null
          sme_review_status?: string
          sme_reviewer_count?: number
          tests_what?: string | null
          updated_at?: string
          validation_status?: string
          version_number: number
          work_context_sv?: string | null
        }
        Update: {
          accessibility_review_status?: string
          authored_by_ai?: boolean
          bias_review_notes?: string | null
          bias_review_status?: string
          cognitive_demand?: string | null
          cognitive_review_status?: string
          competency_id?: string
          content_hash?: string | null
          content_status?: string
          context_note?: string | null
          created_at?: string
          depends_on_employer_instruction?: boolean
          difficulty?: string | null
          evidence_source_type?: string
          facet_id?: string | null
          id?: string
          information_available_sv?: string | null
          information_withheld_sv?: string | null
          is_safety_critical?: boolean
          item_format?: string
          item_id?: string
          jurisdiction_id?: string | null
          language_review_status?: string
          learning_counterpart_decision?: string | null
          learning_counterpart_id?: string | null
          legal_assumption_sv?: string | null
          legal_basis_required?: boolean
          legal_review_expires_at?: string | null
          legal_review_status?: string
          legal_reviewed_at?: string | null
          legal_reviewed_by?: string | null
          legal_source?: string | null
          market?: string | null
          mode?: string | null
          observable_behavior?: string
          overgeneralisation_guard_sv?: string | null
          pilot_stats?: Json
          primary_behaviour_id?: string | null
          primary_construct?: string | null
          published_at?: string | null
          requires_human_review?: boolean
          response_process?: string
          retired_at?: string | null
          secondary_competency_id?: string | null
          sme_review_notes?: string | null
          sme_review_status?: string
          sme_reviewer_count?: number
          tests_what?: string | null
          updated_at?: string
          validation_status?: string
          version_number?: number
          work_context_sv?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_item_versions_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "scp_competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_item_versions_evidence_source_type_fkey"
            columns: ["evidence_source_type"]
            isOneToOne: false
            referencedRelation: "scp_evidence_source_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "scp_item_versions_facet_id_fkey"
            columns: ["facet_id"]
            isOneToOne: false
            referencedRelation: "scp_competency_facets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_item_versions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "scp_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_item_versions_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "scp_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_item_versions_learning_counterpart_id_fkey"
            columns: ["learning_counterpart_id"]
            isOneToOne: false
            referencedRelation: "scp_item_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_item_versions_primary_behaviour_id_fkey"
            columns: ["primary_behaviour_id"]
            isOneToOne: false
            referencedRelation: "scp_behaviour_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_item_versions_secondary_competency_id_fkey"
            columns: ["secondary_competency_id"]
            isOneToOne: false
            referencedRelation: "scp_competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_items: {
        Row: {
          created_at: string
          id: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          slug?: string
        }
        Relationships: []
      }
      scp_jurisdictions: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_en: string
          name_sv: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_en: string
          name_sv: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string
          name_sv?: string
        }
        Relationships: []
      }
      scp_maturity_thresholds: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          level: string
          max_age_days: number | null
          min_contexts: number
          min_mean_contribution: number
          min_observations: number
          min_source_types: number
          threshold_version: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          level: string
          max_age_days?: number | null
          min_contexts: number
          min_mean_contribution: number
          min_observations: number
          min_source_types: number
          threshold_version: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          level?: string
          max_age_days?: number | null
          min_contexts?: number
          min_mean_contribution?: number
          min_observations?: number
          min_source_types?: number
          threshold_version?: string
        }
        Relationships: []
      }
      scp_module_behaviour_map: {
        Row: {
          behaviour_version_id: string
          created_at: string
          id: string
          module_version_id: string
        }
        Insert: {
          behaviour_version_id: string
          created_at?: string
          id?: string
          module_version_id: string
        }
        Update: {
          behaviour_version_id?: string
          created_at?: string
          id?: string
          module_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_module_behaviour_map_behaviour_version_id_fkey"
            columns: ["behaviour_version_id"]
            isOneToOne: false
            referencedRelation: "scp_behaviour_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_module_behaviour_map_module_version_id_fkey"
            columns: ["module_version_id"]
            isOneToOne: false
            referencedRelation: "scp_module_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_module_versions: {
        Row: {
          content_status: string
          created_at: string
          display_order: number
          estimated_minutes: number | null
          id: string
          learning_form_id: string | null
          module_id: string
          name_en: string
          name_sv: string
          program_version_id: string
          published_at: string | null
          retired_at: string | null
          summary_en: string
          summary_sv: string
          updated_at: string
          version_number: number
        }
        Insert: {
          content_status?: string
          created_at?: string
          display_order: number
          estimated_minutes?: number | null
          id?: string
          learning_form_id?: string | null
          module_id: string
          name_en: string
          name_sv: string
          program_version_id: string
          published_at?: string | null
          retired_at?: string | null
          summary_en: string
          summary_sv: string
          updated_at?: string
          version_number: number
        }
        Update: {
          content_status?: string
          created_at?: string
          display_order?: number
          estimated_minutes?: number | null
          id?: string
          learning_form_id?: string | null
          module_id?: string
          name_en?: string
          name_sv?: string
          program_version_id?: string
          published_at?: string | null
          retired_at?: string | null
          summary_en?: string
          summary_sv?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_module_versions_learning_form_id_fkey"
            columns: ["learning_form_id"]
            isOneToOne: false
            referencedRelation: "scp_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_module_versions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "scp_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_module_versions_program_version_id_fkey"
            columns: ["program_version_id"]
            isOneToOne: false
            referencedRelation: "scp_program_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_modules: {
        Row: {
          created_at: string
          id: string
          owner_employer_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_employer_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_employer_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_modules_owner_employer_id_fkey"
            columns: ["owner_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_observable_behaviours: {
        Row: {
          created_at: string
          id: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          slug?: string
        }
        Relationships: []
      }
      scp_processing_purposes: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          name_en: string
          name_sv: string
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          name_en: string
          name_sv: string
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          name_en?: string
          name_sv?: string
        }
        Relationships: []
      }
      scp_professions: {
        Row: {
          created_at: string
          description_en: string | null
          description_sv: string | null
          id: string
          legally_regulated: boolean
          market: string
          name_en: string
          name_sv: string
          regulator_note_sv: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          id?: string
          legally_regulated?: boolean
          market: string
          name_en: string
          name_sv: string
          regulator_note_sv?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          id?: string
          legally_regulated?: boolean
          market?: string
          name_en?: string
          name_sv?: string
          regulator_note_sv?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      scp_program_versions: {
        Row: {
          content_status: string
          created_at: string
          does_not_measure_en: string[]
          does_not_measure_sv: string[]
          id: string
          jurisdiction_id: string | null
          name_en: string
          name_sv: string
          program_id: string
          published_at: string | null
          purpose_en: string
          purpose_sv: string
          retired_at: string | null
          updated_at: string
          validation_status: string
          version_number: number
        }
        Insert: {
          content_status?: string
          created_at?: string
          does_not_measure_en?: string[]
          does_not_measure_sv?: string[]
          id?: string
          jurisdiction_id?: string | null
          name_en: string
          name_sv: string
          program_id: string
          published_at?: string | null
          purpose_en: string
          purpose_sv: string
          retired_at?: string | null
          updated_at?: string
          validation_status?: string
          version_number: number
        }
        Update: {
          content_status?: string
          created_at?: string
          does_not_measure_en?: string[]
          does_not_measure_sv?: string[]
          id?: string
          jurisdiction_id?: string | null
          name_en?: string
          name_sv?: string
          program_id?: string
          published_at?: string | null
          purpose_en?: string
          purpose_sv?: string
          retired_at?: string | null
          updated_at?: string
          validation_status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_program_versions_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "scp_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_program_versions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "scp_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_programs: {
        Row: {
          created_at: string
          display_name_en: string | null
          display_name_sv: string | null
          id: string
          is_test_fixture: boolean
          owner_employer_id: string | null
          role_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          display_name_en?: string | null
          display_name_sv?: string | null
          id?: string
          is_test_fixture?: boolean
          owner_employer_id?: string | null
          role_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          display_name_en?: string | null
          display_name_sv?: string | null
          id?: string
          is_test_fixture?: boolean
          owner_employer_id?: string | null
          role_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_programs_owner_employer_id_fkey"
            columns: ["owner_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_programs_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "scp_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_prompt_versions: {
        Row: {
          content_status: string
          created_at: string
          id: string
          input_envelope_strategy: string
          prompt_key: string
          published_at: string | null
          retired_at: string | null
          system_prompt: string
          version_number: number
        }
        Insert: {
          content_status?: string
          created_at?: string
          id?: string
          input_envelope_strategy?: string
          prompt_key: string
          published_at?: string | null
          retired_at?: string | null
          system_prompt: string
          version_number: number
        }
        Update: {
          content_status?: string
          created_at?: string
          id?: string
          input_envelope_strategy?: string
          prompt_key?: string
          published_at?: string | null
          retired_at?: string | null
          system_prompt?: string
          version_number?: number
        }
        Relationships: []
      }
      scp_publication_approvals: {
        Row: {
          approved_at: string
          approved_by: string
          id: string
          notes: string | null
          subject_id: string
          subject_type: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          id?: string
          notes?: string | null
          subject_id: string
          subject_type: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          id?: string
          notes?: string | null
          subject_id?: string
          subject_type?: string
        }
        Relationships: []
      }
      scp_purpose_versions: {
        Row: {
          created_at: string
          id: string
          jurisdiction_id: string
          lawful_basis_reference: string
          privacy_notice_version: string
          published_at: string | null
          purpose_code: string
          retired_at: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          jurisdiction_id: string
          lawful_basis_reference: string
          privacy_notice_version: string
          published_at?: string | null
          purpose_code: string
          retired_at?: string | null
          version_number: number
        }
        Update: {
          created_at?: string
          id?: string
          jurisdiction_id?: string
          lawful_basis_reference?: string
          privacy_notice_version?: string
          published_at?: string | null
          purpose_code?: string
          retired_at?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_purpose_versions_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "scp_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_purpose_versions_purpose_code_fkey"
            columns: ["purpose_code"]
            isOneToOne: false
            referencedRelation: "scp_processing_purposes"
            referencedColumns: ["code"]
          },
        ]
      }
      scp_report_snapshots: {
        Row: {
          attempt_id: string
          audience: string
          brief: Json | null
          context: Json | null
          created_at: string
          derivation_input: Json | null
          evidence_scope_version: string | null
          evidence_state_version: string | null
          id: string
          issuer_organization_id: string | null
          payload: Json
          released_at: string
          report_version_id: string
          safety_flags: Json
          scoring_model_version: string | null
          subject_id: string
          threshold_version: string
        }
        Insert: {
          attempt_id: string
          audience: string
          brief?: Json | null
          context?: Json | null
          created_at?: string
          derivation_input?: Json | null
          evidence_scope_version?: string | null
          evidence_state_version?: string | null
          id?: string
          issuer_organization_id?: string | null
          payload: Json
          released_at?: string
          report_version_id: string
          safety_flags?: Json
          scoring_model_version?: string | null
          subject_id: string
          threshold_version?: string
        }
        Update: {
          attempt_id?: string
          audience?: string
          brief?: Json | null
          context?: Json | null
          created_at?: string
          derivation_input?: Json | null
          evidence_scope_version?: string | null
          evidence_state_version?: string | null
          id?: string
          issuer_organization_id?: string | null
          payload?: Json
          released_at?: string
          report_version_id?: string
          safety_flags?: Json
          scoring_model_version?: string | null
          subject_id?: string
          threshold_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_report_snapshots_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_report_snapshots_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_rm_employer_assignments"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "scp_report_snapshots_issuer_organization_id_fkey"
            columns: ["issuer_organization_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_report_snapshots_report_version_id_fkey"
            columns: ["report_version_id"]
            isOneToOne: false
            referencedRelation: "scp_report_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_report_snapshots_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "scp_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_report_versions: {
        Row: {
          audience: string
          content_status: string
          created_at: string
          governance_mode:
            | Database["public"]["Enums"]["scp_governance_mode"]
            | null
          id: string
          limitations_en: string[]
          limitations_sv: string[]
          published_at: string | null
          report_key: string
          retired_at: string | null
          threshold_version: string
          version_number: number
        }
        Insert: {
          audience: string
          content_status?: string
          created_at?: string
          governance_mode?:
            | Database["public"]["Enums"]["scp_governance_mode"]
            | null
          id?: string
          limitations_en?: string[]
          limitations_sv?: string[]
          published_at?: string | null
          report_key: string
          retired_at?: string | null
          threshold_version?: string
          version_number: number
        }
        Update: {
          audience?: string
          content_status?: string
          created_at?: string
          governance_mode?:
            | Database["public"]["Enums"]["scp_governance_mode"]
            | null
          id?: string
          limitations_en?: string[]
          limitations_sv?: string[]
          published_at?: string | null
          report_key?: string
          retired_at?: string | null
          threshold_version?: string
          version_number?: number
        }
        Relationships: []
      }
      scp_research_claims: {
        Row: {
          bounded_quote: string | null
          claim_summary: string
          construct_or_method: string | null
          created_at: string
          created_by: string | null
          evidence_strength: string
          id: string
          limitations: string
          population: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          source_id: string
          status: string
          superseded_by: string | null
          supported_use: string
          unsupported_use: string
          updated_at: string
        }
        Insert: {
          bounded_quote?: string | null
          claim_summary: string
          construct_or_method?: string | null
          created_at?: string
          created_by?: string | null
          evidence_strength?: string
          id?: string
          limitations: string
          population?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          source_id: string
          status?: string
          superseded_by?: string | null
          supported_use: string
          unsupported_use: string
          updated_at?: string
        }
        Update: {
          bounded_quote?: string | null
          claim_summary?: string
          construct_or_method?: string | null
          created_at?: string
          created_by?: string | null
          evidence_strength?: string
          id?: string
          limitations?: string
          population?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          source_id?: string
          status?: string
          superseded_by?: string | null
          supported_use?: string
          unsupported_use?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_research_claims_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "scp_research_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_research_claims_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "scp_research_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_research_implications: {
        Row: {
          affects_ai_task: string | null
          affects_method_id: string | null
          affects_pack_version_id: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          claim_id: string
          created_at: string
          created_by: string | null
          does_not_justify: string
          id: string
          legal_or_scientific_warning: string | null
          permits: string
          required_human_safeguard: string
          statement_kind: string
        }
        Insert: {
          affects_ai_task?: string | null
          affects_method_id?: string | null
          affects_pack_version_id?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          claim_id: string
          created_at?: string
          created_by?: string | null
          does_not_justify: string
          id?: string
          legal_or_scientific_warning?: string | null
          permits: string
          required_human_safeguard: string
          statement_kind: string
        }
        Update: {
          affects_ai_task?: string | null
          affects_method_id?: string | null
          affects_pack_version_id?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          claim_id?: string
          created_at?: string
          created_by?: string | null
          does_not_justify?: string
          id?: string
          legal_or_scientific_warning?: string | null
          permits?: string
          required_human_safeguard?: string
          statement_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_research_implications_affects_pack_version_id_fkey"
            columns: ["affects_pack_version_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_pack_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_research_implications_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "scp_research_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_research_implications_method_fkey"
            columns: ["affects_method_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_research_sources: {
        Row: {
          access_attestation_note: string | null
          access_attested_by: string | null
          access_status: string
          authors: string | null
          created_at: string
          created_by: string | null
          document_reference: string | null
          doi: string | null
          edition_or_version: string | null
          id: string
          issuing_organisation: string | null
          jurisdiction_code: string | null
          language: string | null
          population_context: string | null
          publication_type: string
          publication_year: number | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          summary: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          access_attestation_note?: string | null
          access_attested_by?: string | null
          access_status?: string
          authors?: string | null
          created_at?: string
          created_by?: string | null
          document_reference?: string | null
          doi?: string | null
          edition_or_version?: string | null
          id?: string
          issuing_organisation?: string | null
          jurisdiction_code?: string | null
          language?: string | null
          population_context?: string | null
          publication_type: string
          publication_year?: number | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          summary?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          access_attestation_note?: string | null
          access_attested_by?: string | null
          access_status?: string
          authors?: string | null
          created_at?: string
          created_by?: string | null
          document_reference?: string | null
          doi?: string | null
          edition_or_version?: string | null
          id?: string
          issuing_organisation?: string | null
          jurisdiction_code?: string | null
          language?: string | null
          population_context?: string | null
          publication_type?: string
          publication_year?: number | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          summary?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      scp_review_requirements: {
        Row: {
          created_at: string
          id: string
          item_version_id: string
          reason: string
          required: boolean
          review_type: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_version_id: string
          reason: string
          required?: boolean
          review_type: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_version_id?: string
          reason?: string
          required?: boolean
          review_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_review_requirements_item_version_id_fkey"
            columns: ["item_version_id"]
            isOneToOne: false
            referencedRelation: "scp_item_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_review_rubric_scores: {
        Row: {
          created_at: string
          id: string
          level: number
          review_id: string
          rubric_dimension_id: string
          scored_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          level: number
          review_id: string
          rubric_dimension_id: string
          scored_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          level?: number
          review_id?: string
          rubric_dimension_id?: string
          scored_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_review_rubric_scores_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "scp_human_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_review_rubric_scores_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "scp_rm_review_queue"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "scp_review_rubric_scores_rubric_dimension_id_fkey"
            columns: ["rubric_dimension_id"]
            isOneToOne: false
            referencedRelation: "scp_rubric_dimensions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_role_competency_map: {
        Row: {
          competency_version_id: string
          created_at: string
          criticality: string
          id: string
          role_version_id: string
        }
        Insert: {
          competency_version_id: string
          created_at?: string
          criticality?: string
          id?: string
          role_version_id: string
        }
        Update: {
          competency_version_id?: string
          created_at?: string
          criticality?: string
          id?: string
          role_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_role_competency_map_competency_version_id_fkey"
            columns: ["competency_version_id"]
            isOneToOne: false
            referencedRelation: "scp_competency_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_role_competency_map_role_version_id_fkey"
            columns: ["role_version_id"]
            isOneToOne: false
            referencedRelation: "scp_role_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_role_versions: {
        Row: {
          content_status: string
          created_at: string
          description_en: string
          description_sv: string
          id: string
          jurisdiction_id: string | null
          name_en: string
          name_sv: string
          published_at: string | null
          retired_at: string | null
          role_id: string
          updated_at: string
          version_number: number
        }
        Insert: {
          content_status?: string
          created_at?: string
          description_en: string
          description_sv: string
          id?: string
          jurisdiction_id?: string | null
          name_en: string
          name_sv: string
          published_at?: string | null
          retired_at?: string | null
          role_id: string
          updated_at?: string
          version_number: number
        }
        Update: {
          content_status?: string
          created_at?: string
          description_en?: string
          description_sv?: string
          id?: string
          jurisdiction_id?: string | null
          name_en?: string
          name_sv?: string
          published_at?: string | null
          retired_at?: string | null
          role_id?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_role_versions_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "scp_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_role_versions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "scp_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_role_weight_profile_weights: {
        Row: {
          competency_id: string
          created_at: string
          id: string
          role_weight_profile_id: string
          weight: number
        }
        Insert: {
          competency_id: string
          created_at?: string
          id?: string
          role_weight_profile_id: string
          weight: number
        }
        Update: {
          competency_id?: string
          created_at?: string
          id?: string
          role_weight_profile_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_role_weight_profile_weights_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "scp_competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_role_weight_profile_weights_role_weight_profile_id_fkey"
            columns: ["role_weight_profile_id"]
            isOneToOne: false
            referencedRelation: "scp_role_weight_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_role_weight_profiles: {
        Row: {
          content_hash: string | null
          content_status: string
          created_at: string
          id: string
          notes: string | null
          profession_id: string
          published_at: string | null
          retired_at: string | null
          updated_at: string
          validation_status: string
          version_number: number
        }
        Insert: {
          content_hash?: string | null
          content_status?: string
          created_at?: string
          id?: string
          notes?: string | null
          profession_id: string
          published_at?: string | null
          retired_at?: string | null
          updated_at?: string
          validation_status?: string
          version_number: number
        }
        Update: {
          content_hash?: string | null
          content_status?: string
          created_at?: string
          id?: string
          notes?: string | null
          profession_id?: string
          published_at?: string | null
          retired_at?: string | null
          updated_at?: string
          validation_status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_role_weight_profiles_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "scp_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_roles: {
        Row: {
          created_at: string
          id: string
          profession_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          profession_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          profession_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_roles_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "scp_professions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_rubric_dimensions: {
        Row: {
          assesses_writing_quality: boolean
          created_at: string
          dimension_key: string
          display_order: number
          id: string
          name_en: string
          name_sv: string
          observable_criteria_en: string
          observable_criteria_sv: string
          rubric_version_id: string
        }
        Insert: {
          assesses_writing_quality?: boolean
          created_at?: string
          dimension_key: string
          display_order: number
          id?: string
          name_en: string
          name_sv: string
          observable_criteria_en: string
          observable_criteria_sv: string
          rubric_version_id: string
        }
        Update: {
          assesses_writing_quality?: boolean
          created_at?: string
          dimension_key?: string
          display_order?: number
          id?: string
          name_en?: string
          name_sv?: string
          observable_criteria_en?: string
          observable_criteria_sv?: string
          rubric_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_rubric_dimensions_rubric_version_id_fkey"
            columns: ["rubric_version_id"]
            isOneToOne: false
            referencedRelation: "scp_rubric_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_rubric_levels: {
        Row: {
          created_at: string
          descriptor_en: string
          descriptor_sv: string
          id: string
          level: number
          rubric_dimension_id: string
        }
        Insert: {
          created_at?: string
          descriptor_en: string
          descriptor_sv: string
          id?: string
          level: number
          rubric_dimension_id: string
        }
        Update: {
          created_at?: string
          descriptor_en?: string
          descriptor_sv?: string
          id?: string
          level?: number
          rubric_dimension_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_rubric_levels_rubric_dimension_id_fkey"
            columns: ["rubric_dimension_id"]
            isOneToOne: false
            referencedRelation: "scp_rubric_dimensions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_rubric_versions: {
        Row: {
          content_status: string
          created_at: string
          id: string
          item_version_id: string | null
          must_not_infer: string[]
          name_en: string
          name_sv: string
          published_at: string | null
          retired_at: string | null
          rubric_id: string
          updated_at: string
          version_number: number
        }
        Insert: {
          content_status?: string
          created_at?: string
          id?: string
          item_version_id?: string | null
          must_not_infer?: string[]
          name_en: string
          name_sv: string
          published_at?: string | null
          retired_at?: string | null
          rubric_id: string
          updated_at?: string
          version_number: number
        }
        Update: {
          content_status?: string
          created_at?: string
          id?: string
          item_version_id?: string | null
          must_not_infer?: string[]
          name_en?: string
          name_sv?: string
          published_at?: string | null
          retired_at?: string | null
          rubric_id?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_rubric_versions_item_version_id_fkey"
            columns: ["item_version_id"]
            isOneToOne: false
            referencedRelation: "scp_item_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_rubric_versions_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "scp_rubrics"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_rubrics: {
        Row: {
          created_at: string
          id: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          slug?: string
        }
        Relationships: []
      }
      scp_scenario_versions: {
        Row: {
          content_status: string
          created_at: string
          id: string
          jurisdiction_id: string | null
          mode: string
          module_version_id: string | null
          scenario_id: string
          situation_en: string
          situation_sv: string
          updated_at: string
          version_number: number
        }
        Insert: {
          content_status?: string
          created_at?: string
          id?: string
          jurisdiction_id?: string | null
          mode: string
          module_version_id?: string | null
          scenario_id: string
          situation_en: string
          situation_sv: string
          updated_at?: string
          version_number: number
        }
        Update: {
          content_status?: string
          created_at?: string
          id?: string
          jurisdiction_id?: string | null
          mode?: string
          module_version_id?: string | null
          scenario_id?: string
          situation_en?: string
          situation_sv?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_scenario_versions_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "scp_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_scenario_versions_module_version_id_fkey"
            columns: ["module_version_id"]
            isOneToOne: false
            referencedRelation: "scp_module_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_scenario_versions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scp_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_scenarios: {
        Row: {
          created_at: string
          id: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          slug?: string
        }
        Relationships: []
      }
      scp_scoring_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          biq_weight: number
          content_hash: string | null
          content_status: string
          core_summary_is_indicative: boolean
          created_at: string
          id: string
          norm_comparison_permitted: boolean
          notes: string | null
          published_at: string | null
          published_by: string | null
          retired_at: string | null
          retired_reason: string | null
          sjt_weight: number
          slug: string
          updated_at: string
          validation_status: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          biq_weight: number
          content_hash?: string | null
          content_status?: string
          core_summary_is_indicative?: boolean
          created_at?: string
          id?: string
          norm_comparison_permitted?: boolean
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          retired_at?: string | null
          retired_reason?: string | null
          sjt_weight: number
          slug: string
          updated_at?: string
          validation_status?: string
          version_number: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          biq_weight?: number
          content_hash?: string | null
          content_status?: string
          core_summary_is_indicative?: boolean
          created_at?: string
          id?: string
          norm_comparison_permitted?: boolean
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          retired_at?: string | null
          retired_reason?: string | null
          sjt_weight?: number
          slug?: string
          updated_at?: string
          validation_status?: string
          version_number?: number
        }
        Relationships: []
      }
      scp_subject_identities: {
        Row: {
          linked_at: string
          subject_id: string
          user_id: string
        }
        Insert: {
          linked_at?: string
          subject_id: string
          user_id: string
        }
        Update: {
          linked_at?: string
          subject_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_subject_identities_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: true
            referencedRelation: "scp_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_subjects: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id?: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      scp_test_grants: {
        Row: {
          authorised_by: string | null
          definition_id: string | null
          employer_id: string
          expires_at: string | null
          granted_at: string
          id: string
          purpose: Database["public"]["Enums"]["scp_governance_mode"]
          reason: string
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          authorised_by?: string | null
          definition_id?: string | null
          employer_id: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          purpose: Database["public"]["Enums"]["scp_governance_mode"]
          reason: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          authorised_by?: string | null
          definition_id?: string | null
          employer_id?: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          purpose?: Database["public"]["Enums"]["scp_governance_mode"]
          reason?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_test_grants_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "scp_assessment_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_test_grants_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_training_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          due_at: string | null
          employer_id: string
          employer_message: string | null
          id: string
          language: string
          program_version_id: string
          purpose_version_id: string
          source_decision_id: string | null
          started_at: string | null
          status: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          employer_id: string
          employer_message?: string | null
          id?: string
          language: string
          program_version_id: string
          purpose_version_id: string
          source_decision_id?: string | null
          started_at?: string | null
          status?: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          employer_id?: string
          employer_message?: string | null
          id?: string
          language?: string
          program_version_id?: string
          purpose_version_id?: string
          source_decision_id?: string | null
          started_at?: string | null
          status?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_training_assignments_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_training_assignments_program_version_id_fkey"
            columns: ["program_version_id"]
            isOneToOne: false
            referencedRelation: "scp_program_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_training_assignments_purpose_version_id_fkey"
            columns: ["purpose_version_id"]
            isOneToOne: false
            referencedRelation: "scp_purpose_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_training_assignments_source_decision_id_fkey"
            columns: ["source_decision_id"]
            isOneToOne: false
            referencedRelation: "scp_employer_report_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_training_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "scp_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_training_module_progress: {
        Row: {
          assignment_id: string
          attempt_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          module_version_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          attempt_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          module_version_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          attempt_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          module_version_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_training_module_progress_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "scp_training_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_training_module_progress_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_training_module_progress_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "scp_rm_employer_assignments"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "scp_training_module_progress_module_version_id_fkey"
            columns: ["module_version_id"]
            isOneToOne: false
            referencedRelation: "scp_module_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_trust_stage_ai_tasks: {
        Row: {
          ai_task_id: string
          created_at: string
          human_gate_sv: string
          id: string
          stage_id: string
        }
        Insert: {
          ai_task_id: string
          created_at?: string
          human_gate_sv: string
          id?: string
          stage_id: string
        }
        Update: {
          ai_task_id?: string
          created_at?: string
          human_gate_sv?: string
          id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_trust_stage_ai_tasks_ai_task_id_fkey"
            columns: ["ai_task_id"]
            isOneToOne: false
            referencedRelation: "scp_ai_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_trust_stage_ai_tasks_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "scp_trust_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_trust_stage_claims: {
        Row: {
          claim_id: string
          created_at: string
          id: string
          relation: string
          stage_id: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          id?: string
          relation: string
          stage_id: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          id?: string
          relation?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_trust_stage_claims_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "scp_research_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_trust_stage_claims_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "scp_trust_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_trust_stage_prohibitions: {
        Row: {
          created_at: string
          display_order: number
          id: string
          rationale: string
          stage_id: string
          statement_en: string | null
          statement_sv: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          rationale: string
          stage_id: string
          statement_en?: string | null
          statement_sv: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          rationale?: string
          stage_id?: string
          statement_en?: string | null
          statement_sv?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_trust_stage_prohibitions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "scp_trust_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_trust_stages: {
        Row: {
          created_at: string
          human_responsibility_en: string | null
          human_responsibility_sv: string
          id: string
          letter: string
          method_id: string
          methodological_basis: string
          name_en: string
          name_sv: string
          ordinal: number
          output_sv: string
          purpose_en: string
          purpose_sv: string
          stage_key: string
        }
        Insert: {
          created_at?: string
          human_responsibility_en?: string | null
          human_responsibility_sv: string
          id?: string
          letter: string
          method_id: string
          methodological_basis: string
          name_en: string
          name_sv: string
          ordinal: number
          output_sv: string
          purpose_en: string
          purpose_sv: string
          stage_key: string
        }
        Update: {
          created_at?: string
          human_responsibility_en?: string | null
          human_responsibility_sv?: string
          id?: string
          letter?: string
          method_id?: string
          methodological_basis?: string
          name_en?: string
          name_sv?: string
          ordinal?: number
          output_sv?: string
          purpose_en?: string
          purpose_sv?: string
          stage_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "scp_trust_stages_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "scp_interview_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      security_career_profile_reconciliations: {
        Row: {
          canonical_value: string | null
          created_at: string
          field: string
          id: string
          passport_value: string | null
          resolution: string
          resolved_at: string | null
          user_id: string
        }
        Insert: {
          canonical_value?: string | null
          created_at?: string
          field: string
          id?: string
          passport_value?: string | null
          resolution: string
          resolved_at?: string | null
          user_id: string
        }
        Update: {
          canonical_value?: string | null
          created_at?: string
          field?: string
          id?: string
          passport_value?: string | null
          resolution?: string
          resolved_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      security_career_profiles: {
        Row: {
          created_at: string
          current_profession_other: string | null
          current_profession_slug: string | null
          current_status: string | null
          profile_version: string
          updated_at: string
          user_id: string
          years_of_experience: string | null
        }
        Insert: {
          created_at?: string
          current_profession_other?: string | null
          current_profession_slug?: string | null
          current_status?: string | null
          profile_version?: string
          updated_at?: string
          user_id: string
          years_of_experience?: string | null
        }
        Update: {
          created_at?: string
          current_profession_other?: string | null
          current_profession_slug?: string | null
          current_status?: string | null
          profile_version?: string
          updated_at?: string
          user_id?: string
          years_of_experience?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_career_profiles_current_profession_slug_fkey"
            columns: ["current_profession_slug"]
            isOneToOne: false
            referencedRelation: "cig_professions"
            referencedColumns: ["slug"]
          },
        ]
      }
      sp_authorities: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          jurisdiction_code: string
          name_ar: string | null
          name_en: string
          name_local: string
          official_url: string | null
          sub_jurisdiction_code: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          jurisdiction_code: string
          name_ar?: string | null
          name_en: string
          name_local: string
          official_url?: string | null
          sub_jurisdiction_code?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          jurisdiction_code?: string
          name_ar?: string | null
          name_en?: string
          name_local?: string
          official_url?: string | null
          sub_jurisdiction_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_authorities_jurisdiction_code_fkey"
            columns: ["jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "sp_jurisdictions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_authorities_sub_jurisdiction_code_fkey"
            columns: ["sub_jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "sp_sub_jurisdictions"
            referencedColumns: ["code"]
          },
        ]
      }
      sp_claims: {
        Row: {
          assertion_level: string
          authorisation_scope: string | null
          claim_type: string
          claimed_issuer_name: string | null
          created_at: string
          credential_code: string | null
          credential_reference: string | null
          holder_note: string | null
          holder_user_id: string
          id: string
          issued_on: string | null
          jurisdiction_code: string | null
          lifecycle_state: string
          skill_code: string | null
          skill_level: string | null
          sub_jurisdiction_code: string | null
          supersedes_id: string | null
          title: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          verified_at: string | null
          verified_by_user_id: string | null
          version_no: number
        }
        Insert: {
          assertion_level?: string
          authorisation_scope?: string | null
          claim_type: string
          claimed_issuer_name?: string | null
          created_at?: string
          credential_code?: string | null
          credential_reference?: string | null
          holder_note?: string | null
          holder_user_id: string
          id?: string
          issued_on?: string | null
          jurisdiction_code?: string | null
          lifecycle_state?: string
          skill_code?: string | null
          skill_level?: string | null
          sub_jurisdiction_code?: string | null
          supersedes_id?: string | null
          title: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          verified_at?: string | null
          verified_by_user_id?: string | null
          version_no?: number
        }
        Update: {
          assertion_level?: string
          authorisation_scope?: string | null
          claim_type?: string
          claimed_issuer_name?: string | null
          created_at?: string
          credential_code?: string | null
          credential_reference?: string | null
          holder_note?: string | null
          holder_user_id?: string
          id?: string
          issued_on?: string | null
          jurisdiction_code?: string | null
          lifecycle_state?: string
          skill_code?: string | null
          skill_level?: string | null
          sub_jurisdiction_code?: string | null
          supersedes_id?: string | null
          title?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          verified_at?: string | null
          verified_by_user_id?: string | null
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "sp_claims_credential_code_fkey"
            columns: ["credential_code"]
            isOneToOne: false
            referencedRelation: "sp_credential_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_claims_jurisdiction_code_fkey"
            columns: ["jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "sp_jurisdictions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_claims_skill_code_fkey"
            columns: ["skill_code"]
            isOneToOne: false
            referencedRelation: "sp_skill_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_claims_sub_jurisdiction_code_fkey"
            columns: ["sub_jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "sp_sub_jurisdictions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_claims_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "sp_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_credential_types: {
        Row: {
          authority_id: string | null
          category: string
          claim_type: string
          code: string
          contributes_to: string[]
          created_at: string
          is_active: boolean
          jurisdiction_code: string | null
          legal_review_state: string
          market_pack_code: string | null
          name_ar: string | null
          name_en: string
          name_sv: string
          narrow_result_only: boolean
          pilot_state: string
          reference_label_en: string | null
          reference_label_local: string | null
          reference_pattern: string | null
          regulated_role_id: string | null
          requires_issuer: boolean
          requires_scope: boolean
          requires_valid_until: boolean
          sort_order: number
          sub_jurisdiction_code: string | null
          symbol_label: string
          title_is_holder_written: boolean
          typical_validity_months: number | null
        }
        Insert: {
          authority_id?: string | null
          category: string
          claim_type: string
          code: string
          contributes_to?: string[]
          created_at?: string
          is_active?: boolean
          jurisdiction_code?: string | null
          legal_review_state?: string
          market_pack_code?: string | null
          name_ar?: string | null
          name_en: string
          name_sv: string
          narrow_result_only?: boolean
          pilot_state?: string
          reference_label_en?: string | null
          reference_label_local?: string | null
          reference_pattern?: string | null
          regulated_role_id?: string | null
          requires_issuer?: boolean
          requires_scope?: boolean
          requires_valid_until?: boolean
          sort_order?: number
          sub_jurisdiction_code?: string | null
          symbol_label: string
          title_is_holder_written?: boolean
          typical_validity_months?: number | null
        }
        Update: {
          authority_id?: string | null
          category?: string
          claim_type?: string
          code?: string
          contributes_to?: string[]
          created_at?: string
          is_active?: boolean
          jurisdiction_code?: string | null
          legal_review_state?: string
          market_pack_code?: string | null
          name_ar?: string | null
          name_en?: string
          name_sv?: string
          narrow_result_only?: boolean
          pilot_state?: string
          reference_label_en?: string | null
          reference_label_local?: string | null
          reference_pattern?: string | null
          regulated_role_id?: string | null
          requires_issuer?: boolean
          requires_scope?: boolean
          requires_valid_until?: boolean
          sort_order?: number
          sub_jurisdiction_code?: string | null
          symbol_label?: string
          title_is_holder_written?: boolean
          typical_validity_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_credential_types_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "sp_authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_credential_types_jurisdiction_code_fkey"
            columns: ["jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "sp_jurisdictions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_credential_types_market_pack_code_fkey"
            columns: ["market_pack_code"]
            isOneToOne: false
            referencedRelation: "sp_market_packs"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_credential_types_regulated_role_id_fkey"
            columns: ["regulated_role_id"]
            isOneToOne: false
            referencedRelation: "sp_regulated_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_credential_types_sub_jurisdiction_code_fkey"
            columns: ["sub_jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "sp_sub_jurisdictions"
            referencedColumns: ["code"]
          },
        ]
      }
      sp_disclosure_accesses: {
        Row: {
          accessed_at: string
          client_hint_hash: string | null
          disclosure_id: string
          id: string
        }
        Insert: {
          accessed_at?: string
          client_hint_hash?: string | null
          disclosure_id: string
          id?: string
        }
        Update: {
          accessed_at?: string
          client_hint_hash?: string | null
          disclosure_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sp_disclosure_accesses_disclosure_id_fkey"
            columns: ["disclosure_id"]
            isOneToOne: false
            referencedRelation: "sp_disclosures"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_disclosures: {
        Row: {
          access_count: number
          application_id: string | null
          created_at: string
          expires_at: string | null
          focus_claim_id: string | null
          holder_user_id: string
          id: string
          package_code: string
          purpose: string | null
          recipient_hint: string | null
          revoked_at: string | null
          token_hash: string | null
        }
        Insert: {
          access_count?: number
          application_id?: string | null
          created_at?: string
          expires_at?: string | null
          focus_claim_id?: string | null
          holder_user_id: string
          id?: string
          package_code: string
          purpose?: string | null
          recipient_hint?: string | null
          revoked_at?: string | null
          token_hash?: string | null
        }
        Update: {
          access_count?: number
          application_id?: string | null
          created_at?: string
          expires_at?: string | null
          focus_claim_id?: string | null
          holder_user_id?: string
          id?: string
          package_code?: string
          purpose?: string | null
          recipient_hint?: string | null
          revoked_at?: string | null
          token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_disclosures_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_disclosures_focus_claim_id_fkey"
            columns: ["focus_claim_id"]
            isOneToOne: false
            referencedRelation: "sp_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_evidence: {
        Row: {
          claim_id: string | null
          file_name: string
          holder_user_id: string
          id: string
          lifecycle_state: string
          mime_type: string
          period_id: string | null
          sha256: string | null
          size_bytes: number
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          claim_id?: string | null
          file_name: string
          holder_user_id: string
          id?: string
          lifecycle_state?: string
          mime_type: string
          period_id?: string | null
          sha256?: string | null
          size_bytes: number
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          claim_id?: string | null
          file_name?: string
          holder_user_id?: string
          id?: string
          lifecycle_state?: string
          mime_type?: string
          period_id?: string | null
          sha256?: string | null
          size_bytes?: number
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sp_evidence_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "sp_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_evidence_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "sp_experience_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_experience_periods: {
        Row: {
          assertion_level: string
          cig_profession_slug: string | null
          created_at: string
          employer_id: string | null
          employer_name: string
          employment_type: string
          ended_on: string | null
          fte_fraction: number
          holder_user_id: string
          id: string
          jurisdiction_code: string
          lifecycle_state: string
          profession_family: string | null
          role_title: string
          security_fraction: number
          security_relevance: string
          started_on: string
          supersedes_id: string | null
          updated_at: string
          version_no: number
        }
        Insert: {
          assertion_level?: string
          cig_profession_slug?: string | null
          created_at?: string
          employer_id?: string | null
          employer_name: string
          employment_type?: string
          ended_on?: string | null
          fte_fraction?: number
          holder_user_id: string
          id?: string
          jurisdiction_code?: string
          lifecycle_state?: string
          profession_family?: string | null
          role_title: string
          security_fraction?: number
          security_relevance?: string
          started_on: string
          supersedes_id?: string | null
          updated_at?: string
          version_no?: number
        }
        Update: {
          assertion_level?: string
          cig_profession_slug?: string | null
          created_at?: string
          employer_id?: string | null
          employer_name?: string
          employment_type?: string
          ended_on?: string | null
          fte_fraction?: number
          holder_user_id?: string
          id?: string
          jurisdiction_code?: string
          lifecycle_state?: string
          profession_family?: string | null
          role_title?: string
          security_fraction?: number
          security_relevance?: string
          started_on?: string
          supersedes_id?: string | null
          updated_at?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "sp_experience_periods_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_experience_periods_jurisdiction_code_fkey"
            columns: ["jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "sp_jurisdictions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_experience_periods_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "sp_experience_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_jurisdictions: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          name_en: string
          name_sv: string
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          name_en: string
          name_sv: string
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          name_en?: string
          name_sv?: string
        }
        Relationships: []
      }
      sp_market_packs: {
        Row: {
          code: string
          created_at: string
          effective_from: string | null
          is_active: boolean
          jurisdiction_code: string
          legal_review_state: string
          legal_reviewed_by: string | null
          legal_reviewed_on: string | null
          name_ar: string | null
          name_en: string
          name_sv: string
          pilot_state: string
          sub_jurisdiction_code: string | null
          superseded_on: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          effective_from?: string | null
          is_active?: boolean
          jurisdiction_code: string
          legal_review_state?: string
          legal_reviewed_by?: string | null
          legal_reviewed_on?: string | null
          name_ar?: string | null
          name_en: string
          name_sv: string
          pilot_state?: string
          sub_jurisdiction_code?: string | null
          superseded_on?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          effective_from?: string | null
          is_active?: boolean
          jurisdiction_code?: string
          legal_review_state?: string
          legal_reviewed_by?: string | null
          legal_reviewed_on?: string | null
          name_ar?: string | null
          name_en?: string
          name_sv?: string
          pilot_state?: string
          sub_jurisdiction_code?: string | null
          superseded_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sp_market_packs_jurisdiction_code_fkey"
            columns: ["jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "sp_jurisdictions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_market_packs_sub_jurisdiction_code_fkey"
            columns: ["sub_jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "sp_sub_jurisdictions"
            referencedColumns: ["code"]
          },
        ]
      }
      sp_passport_events: {
        Row: {
          actor_user_id: string | null
          detail: Json
          event_type: string
          holder_user_id: string
          id: string
          occurred_at: string
          subject_id: string | null
          subject_type: string | null
        }
        Insert: {
          actor_user_id?: string | null
          detail?: Json
          event_type: string
          holder_user_id: string
          id?: string
          occurred_at?: string
          subject_id?: string | null
          subject_type?: string | null
        }
        Update: {
          actor_user_id?: string | null
          detail?: Json
          event_type?: string
          holder_user_id?: string
          id?: string
          occurred_at?: string
          subject_id?: string | null
          subject_type?: string | null
        }
        Relationships: []
      }
      sp_passport_profiles: {
        Row: {
          cig_profession_slug: string | null
          created_at: string
          declared_accurate_at: string | null
          display_name: string | null
          headline: string | null
          holder_user_id: string
          is_private: boolean
          jurisdiction_code: string | null
          onboarding_answers: Json
          onboarding_state: string
          onboarding_step: number
          privacy_mode: string
          profession_family: string | null
          question_version: string
          recognition_policy_version: string
          sub_jurisdiction_code: string | null
          updated_at: string
          work_location_confirmed_at: string | null
        }
        Insert: {
          cig_profession_slug?: string | null
          created_at?: string
          declared_accurate_at?: string | null
          display_name?: string | null
          headline?: string | null
          holder_user_id: string
          is_private?: boolean
          jurisdiction_code?: string | null
          onboarding_answers?: Json
          onboarding_state?: string
          onboarding_step?: number
          privacy_mode?: string
          profession_family?: string | null
          question_version?: string
          recognition_policy_version?: string
          sub_jurisdiction_code?: string | null
          updated_at?: string
          work_location_confirmed_at?: string | null
        }
        Update: {
          cig_profession_slug?: string | null
          created_at?: string
          declared_accurate_at?: string | null
          display_name?: string | null
          headline?: string | null
          holder_user_id?: string
          is_private?: boolean
          jurisdiction_code?: string | null
          onboarding_answers?: Json
          onboarding_state?: string
          onboarding_step?: number
          privacy_mode?: string
          profession_family?: string | null
          question_version?: string
          recognition_policy_version?: string
          sub_jurisdiction_code?: string | null
          updated_at?: string
          work_location_confirmed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_passport_profiles_jurisdiction_code_fkey"
            columns: ["jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "sp_jurisdictions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_passport_profiles_recognition_policy_version_fkey"
            columns: ["recognition_policy_version"]
            isOneToOne: false
            referencedRelation: "sp_recognition_policies"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "sp_passport_profiles_sub_jurisdiction_code_fkey"
            columns: ["sub_jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "sp_sub_jurisdictions"
            referencedColumns: ["code"]
          },
        ]
      }
      sp_pilot_members: {
        Row: {
          granted_at: string
          granted_by: string | null
          market_pack_code: string
          note: string | null
          revoked_at: string | null
          revoked_by: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          market_pack_code: string
          note?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          market_pack_code?: string
          note?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sp_pilot_members_market_pack_code_fkey"
            columns: ["market_pack_code"]
            isOneToOne: false
            referencedRelation: "sp_market_packs"
            referencedColumns: ["code"]
          },
        ]
      }
      sp_profession_families: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          name_ar: string | null
          name_en: string
          name_sv: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          name_sv: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          name_sv?: string
          sort_order?: number
        }
        Relationships: []
      }
      sp_professional_titles: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          market_pack_code: string
          name_ar: string | null
          name_en: string
          name_local: string
          output_kind: string
          priority: number
          profession_family_code: string | null
          regulated_role_id: string | null
          requires_assertion_level: string
          requires_credential_codes: string[]
          requires_current_validity: boolean
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          market_pack_code: string
          name_ar?: string | null
          name_en: string
          name_local: string
          output_kind: string
          priority?: number
          profession_family_code?: string | null
          regulated_role_id?: string | null
          requires_assertion_level?: string
          requires_credential_codes: string[]
          requires_current_validity?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          market_pack_code?: string
          name_ar?: string | null
          name_en?: string
          name_local?: string
          output_kind?: string
          priority?: number
          profession_family_code?: string | null
          regulated_role_id?: string | null
          requires_assertion_level?: string
          requires_credential_codes?: string[]
          requires_current_validity?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sp_professional_titles_market_pack_code_fkey"
            columns: ["market_pack_code"]
            isOneToOne: false
            referencedRelation: "sp_market_packs"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_professional_titles_profession_family_code_fkey"
            columns: ["profession_family_code"]
            isOneToOne: false
            referencedRelation: "sp_profession_families"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_professional_titles_regulated_role_id_fkey"
            columns: ["regulated_role_id"]
            isOneToOne: false
            referencedRelation: "sp_regulated_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_public_access_throttle: {
        Row: {
          attempts: number
          client_hash: string
          window_start: string
        }
        Insert: {
          attempts?: number
          client_hash: string
          window_start: string
        }
        Update: {
          attempts?: number
          client_hash?: string
          window_start?: string
        }
        Relationships: []
      }
      sp_recognition_policies: {
        Row: {
          basis: string
          created_at: string
          is_active: boolean
          threshold_years: number[]
          version: string
        }
        Insert: {
          basis: string
          created_at?: string
          is_active?: boolean
          threshold_years: number[]
          version: string
        }
        Update: {
          basis?: string
          created_at?: string
          is_active?: boolean
          threshold_years?: number[]
          version?: string
        }
        Relationships: []
      }
      sp_regulated_roles: {
        Row: {
          authority_id: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          market_pack_code: string
          name_ar: string | null
          name_en: string
          name_local: string
          profession_family_code: string
          sort_order: number
        }
        Insert: {
          authority_id?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          market_pack_code: string
          name_ar?: string | null
          name_en: string
          name_local: string
          profession_family_code: string
          sort_order?: number
        }
        Update: {
          authority_id?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          market_pack_code?: string
          name_ar?: string | null
          name_en?: string
          name_local?: string
          profession_family_code?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "sp_regulated_roles_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "sp_authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_regulated_roles_market_pack_code_fkey"
            columns: ["market_pack_code"]
            isOneToOne: false
            referencedRelation: "sp_market_packs"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_regulated_roles_profession_family_code_fkey"
            columns: ["profession_family_code"]
            isOneToOne: false
            referencedRelation: "sp_profession_families"
            referencedColumns: ["code"]
          },
        ]
      }
      sp_regulatory_sources: {
        Row: {
          authority_id: string | null
          availability: string
          checked_on: string | null
          content_fingerprint: string | null
          created_at: string
          effective_from: string | null
          id: string
          jurisdiction_code: string
          market_pack_code: string | null
          review_state: string
          source_key: string
          source_type: string
          superseded_on: string | null
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          authority_id?: string | null
          availability?: string
          checked_on?: string | null
          content_fingerprint?: string | null
          created_at?: string
          effective_from?: string | null
          id?: string
          jurisdiction_code: string
          market_pack_code?: string | null
          review_state?: string
          source_key: string
          source_type: string
          superseded_on?: string | null
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          authority_id?: string | null
          availability?: string
          checked_on?: string | null
          content_fingerprint?: string | null
          created_at?: string
          effective_from?: string | null
          id?: string
          jurisdiction_code?: string
          market_pack_code?: string | null
          review_state?: string
          source_key?: string
          source_type?: string
          superseded_on?: string | null
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "sp_regulatory_sources_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "sp_authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_regulatory_sources_jurisdiction_code_fkey"
            columns: ["jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "sp_jurisdictions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sp_regulatory_sources_market_pack_code_fkey"
            columns: ["market_pack_code"]
            isOneToOne: false
            referencedRelation: "sp_market_packs"
            referencedColumns: ["code"]
          },
        ]
      }
      sp_skill_types: {
        Row: {
          allowed_levels: string[]
          claim_type: string
          code: string
          created_at: string
          is_active: boolean
          level_scale: string
          name_en: string
          name_sv: string
          requires_jurisdiction: boolean
          requires_valid_until: boolean
          sort_order: number
        }
        Insert: {
          allowed_levels?: string[]
          claim_type: string
          code: string
          created_at?: string
          is_active?: boolean
          level_scale: string
          name_en: string
          name_sv: string
          requires_jurisdiction?: boolean
          requires_valid_until?: boolean
          sort_order?: number
        }
        Update: {
          allowed_levels?: string[]
          claim_type?: string
          code?: string
          created_at?: string
          is_active?: boolean
          level_scale?: string
          name_en?: string
          name_sv?: string
          requires_jurisdiction?: boolean
          requires_valid_until?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      sp_source_review_items: {
        Row: {
          detected_at: string
          id: string
          observation: string
          observed_fingerprint: string | null
          previous_fingerprint: string | null
          resolution: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          source_id: string
        }
        Insert: {
          detected_at?: string
          id?: string
          observation: string
          observed_fingerprint?: string | null
          previous_fingerprint?: string | null
          resolution?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          source_id: string
        }
        Update: {
          detected_at?: string
          id?: string
          observation?: string
          observed_fingerprint?: string | null
          previous_fingerprint?: string | null
          resolution?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sp_source_review_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sp_regulatory_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_sub_jurisdictions: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          jurisdiction_code: string
          name_ar: string | null
          name_en: string
          name_sv: string
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          jurisdiction_code: string
          name_ar?: string | null
          name_en: string
          name_sv: string
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          jurisdiction_code?: string
          name_ar?: string | null
          name_en?: string
          name_sv?: string
        }
        Relationships: [
          {
            foreignKeyName: "sp_sub_jurisdictions_jurisdiction_code_fkey"
            columns: ["jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "sp_jurisdictions"
            referencedColumns: ["code"]
          },
        ]
      }
      sp_verification_decisions: {
        Row: {
          decided_at: string
          decided_by: string | null
          decider_organisation: string | null
          decision: string
          decision_note: string | null
          holder_user_id: string
          id: string
          request_id: string
          valid_from: string | null
          valid_until: string | null
          verification_method: string | null
        }
        Insert: {
          decided_at?: string
          decided_by?: string | null
          decider_organisation?: string | null
          decision: string
          decision_note?: string | null
          holder_user_id: string
          id?: string
          request_id: string
          valid_from?: string | null
          valid_until?: string | null
          verification_method?: string | null
        }
        Update: {
          decided_at?: string
          decided_by?: string | null
          decider_organisation?: string | null
          decision?: string
          decision_note?: string | null
          holder_user_id?: string
          id?: string
          request_id?: string
          valid_from?: string | null
          valid_until?: string | null
          verification_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_verification_decisions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "sp_verification_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sp_verification_requests: {
        Row: {
          claim_id: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          holder_message: string | null
          holder_user_id: string
          id: string
          period_id: string | null
          request_kind: string
          status: string
          submitted_at: string
          target_employer_id: string | null
          valid_from: string | null
          valid_until: string | null
          verification_method: string | null
        }
        Insert: {
          claim_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          holder_message?: string | null
          holder_user_id: string
          id?: string
          period_id?: string | null
          request_kind: string
          status?: string
          submitted_at?: string
          target_employer_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
          verification_method?: string | null
        }
        Update: {
          claim_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          holder_message?: string | null
          holder_user_id?: string
          id?: string
          period_id?: string | null
          request_kind?: string
          status?: string
          submitted_at?: string
          target_employer_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
          verification_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_verification_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "sp_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_verification_requests_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "sp_experience_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_verification_requests_target_employer_id_fkey"
            columns: ["target_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_erasure_queue: {
        Row: {
          attempts: number
          bucket_id: string
          completed_at: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          object_path: string
          reason: string
          requested_at: string
          requested_by: string | null
          subject_user_id: string | null
        }
        Insert: {
          attempts?: number
          bucket_id: string
          completed_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          object_path: string
          reason: string
          requested_at?: string
          requested_by?: string | null
          subject_user_id?: string | null
        }
        Update: {
          attempts?: number
          bucket_id?: string
          completed_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          object_path?: string
          reason?: string
          requested_at?: string
          requested_by?: string | null
          subject_user_id?: string | null
        }
        Relationships: []
      }
      target_professions: {
        Row: {
          chosen_at: string
          created_at: string
          graph_version: string
          id: string
          is_primary: boolean
          notes: string | null
          profession_id: string
          source_run_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chosen_at?: string
          created_at?: string
          graph_version: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          profession_id: string
          source_run_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chosen_at?: string
          created_at?: string
          graph_version?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          profession_id?: string
          source_run_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "target_professions_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "assessment_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      cd_my_report_history: {
        Row: {
          content_version: string | null
          context_status: string | null
          definition_version: string | null
          discovery_goal: string | null
          generated_at: string | null
          is_internal_test: boolean | null
          locale: string | null
          scoring_version: string | null
          session_id: string | null
          snapshot_id: string | null
          taxonomy_version: string | null
          top_area_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cd_report_snapshots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "cd_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cd_outstanding_reviews: {
        Row: {
          cleared: boolean | null
          definition_version: string | null
          lifecycle_status: string | null
          review_gate: string | null
        }
        Relationships: []
      }
      cd_profession_profiles_current: {
        Row: {
          band_high: number | null
          band_low: number | null
          calibration_version: string | null
          centrality: string | null
          confidence: string | null
          created_at: string | null
          dimension_id: string | null
          evidence_basis: string | null
          profession_id: string | null
          source_reference: string | null
          weight: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cd_profession_profiles_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "cd_professions"
            referencedColumns: ["profession_id"]
          },
        ]
      }
      cd_v31_stored_reports: {
        Row: {
          career_areas: Json | null
          content_version: string | null
          definition_version: string | null
          generated_at: string | null
          locale: Json | null
          output_a: Json | null
          output_b: Json | null
          pattern_definition_version: string | null
          scoring_version: string | null
          session_id: string | null
          snapshot_id: string | null
          versions: Json | null
        }
        Insert: {
          career_areas?: Json | null
          content_version?: string | null
          definition_version?: string | null
          generated_at?: string | null
          locale?: never
          output_a?: Json | null
          output_b?: Json | null
          pattern_definition_version?: string | null
          scoring_version?: string | null
          session_id?: string | null
          snapshot_id?: string | null
          versions?: never
        }
        Update: {
          career_areas?: Json | null
          content_version?: string | null
          definition_version?: string | null
          generated_at?: string | null
          locale?: never
          output_a?: Json | null
          output_b?: Json | null
          pattern_definition_version?: string | null
          scoring_version?: string | null
          session_id?: string | null
          snapshot_id?: string | null
          versions?: never
        }
        Relationships: [
          {
            foreignKeyName: "cd_report_snapshots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "cd_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_interview_process_quality: {
        Row: {
          assessments_recorded: number | null
          assessors_involved: number | null
          case_id: string | null
          dimensions_in_pack: number | null
          dimensions_with_confirmed_evidence: number | null
          employer_id: string | null
          evidence_human_authored: number | null
          gaps_open: number | null
          insufficient_evidence_count: number | null
          interviewer_reflected: boolean | null
          proposals_awaiting_review: number | null
          proposals_corrected: number | null
          proposals_total: number | null
          protocol_deviation_recorded: boolean | null
          questions_answered: number | null
          questions_in_pack: number | null
          questions_skipped: number | null
          questions_unresolved: number | null
          status: string | null
          verifications_outstanding: number | null
        }
        Insert: {
          assessments_recorded?: never
          assessors_involved?: never
          case_id?: string | null
          dimensions_in_pack?: never
          dimensions_with_confirmed_evidence?: never
          employer_id?: string | null
          evidence_human_authored?: never
          gaps_open?: never
          insufficient_evidence_count?: never
          interviewer_reflected?: never
          proposals_awaiting_review?: never
          proposals_corrected?: never
          proposals_total?: never
          protocol_deviation_recorded?: never
          questions_answered?: never
          questions_in_pack?: never
          questions_skipped?: never
          questions_unresolved?: never
          status?: string | null
          verifications_outstanding?: never
        }
        Update: {
          assessments_recorded?: never
          assessors_involved?: never
          case_id?: string | null
          dimensions_in_pack?: never
          dimensions_with_confirmed_evidence?: never
          employer_id?: string | null
          evidence_human_authored?: never
          gaps_open?: never
          insufficient_evidence_count?: never
          interviewer_reflected?: never
          proposals_awaiting_review?: never
          proposals_corrected?: never
          proposals_total?: never
          protocol_deviation_recorded?: never
          questions_answered?: never
          questions_in_pack?: never
          questions_skipped?: never
          questions_unresolved?: never
          status?: string | null
          verifications_outstanding?: never
        }
        Relationships: [
          {
            foreignKeyName: "scp_interview_cases_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_rm_competency_profile: {
        Row: {
          competency_id: string | null
          competency_version_id: string | null
          has_open_review: boolean | null
          has_safety_flag: boolean | null
          last_observed_at: string | null
          live_evidence_count: number | null
          maturity_level: string | null
          name_en: string | null
          name_sv: string | null
          source_type_count: number | null
          subject_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_behaviour_competency_map_competency_version_id_fkey"
            columns: ["competency_version_id"]
            isOneToOne: false
            referencedRelation: "scp_competency_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_competency_evidence_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "scp_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_competency_versions_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "scp_competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_rm_employer_assignments: {
        Row: {
          assignment_id: string | null
          attempt_id: string | null
          attempt_status: string | null
          created_at: string | null
          employer_id: string | null
          expires_at: string | null
          released_at: string | null
          scored_at: string | null
          scp_assessment_version_id: string | null
          status: string | null
          subject_id: string | null
          submitted_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_assignments_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_assignments_scp_assessment_version_id_fkey"
            columns: ["scp_assessment_version_id"]
            isOneToOne: false
            referencedRelation: "scp_assessment_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_attempts_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "scp_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_rm_employer_participants: {
        Row: {
          application_id: string | null
          assignment_count: number | null
          completed_count: number | null
          employee_id: string | null
          employer_id: string | null
          first_invited_at: string | null
          job_id: string | null
          last_invited_at: string | null
          recipient_email: string | null
          recipient_user_id: string | null
          relationship: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_assignments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_assignments_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_rm_review_queue: {
        Row: {
          issuer_organization_id: string | null
          item_version_id: string | null
          min_confidence: number | null
          opened_at: string | null
          response_text: string | null
          review_id: string | null
          review_status: string | null
          run_status: string | null
          scoring_run_id: string | null
          subject_id: string | null
          trigger_reason: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scp_attempts_issuer_organization_id_fkey"
            columns: ["issuer_organization_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_attempts_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "scp_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_candidate_responses_item_version_id_fkey"
            columns: ["item_version_id"]
            isOneToOne: false
            referencedRelation: "scp_item_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scp_scoring_version_lineage: {
        Row: {
          content_status: string | null
          core_summary_is_indicative: boolean | null
          id: string | null
          norm_comparison_permitted: boolean | null
          published_at: string | null
          retired_at: string | null
          slug: string | null
          validation_status: string | null
          version_number: number | null
        }
        Insert: {
          content_status?: string | null
          core_summary_is_indicative?: boolean | null
          id?: string | null
          norm_comparison_permitted?: boolean | null
          published_at?: string | null
          retired_at?: string | null
          slug?: string | null
          validation_status?: string | null
          version_number?: number | null
        }
        Update: {
          content_status?: string | null
          core_summary_is_indicative?: boolean | null
          id?: string | null
          norm_comparison_permitted?: boolean | null
          published_at?: string | null
          retired_at?: string | null
          slug?: string | null
          validation_status?: string | null
          version_number?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      account_deletion_only_released: {
        Args: { _cols: string[]; _new: Json; _old: Json }
        Returns: boolean
      }
      account_deletion_releases: { Args: { _actor: string }; Returns: boolean }
      admin_anonymise_user: {
        Args: { _confirm_email: string; _reason: string; _user_id: string }
        Returns: Json
      }
      admin_cancel_assessment_assignment: {
        Args: { _assignment_id: string; _reason: string }
        Returns: {
          id: string
          new_status: string
          previous_status: string
        }[]
      }
      admin_delete_employer_if_safe: {
        Args: { _confirm_name: string; _employer_id: string; _reason: string }
        Returns: Json
      }
      admin_delete_job_if_safe: {
        Args: { _job_id: string; _reason: string }
        Returns: Json
      }
      admin_delete_user_if_safe: {
        Args: { _confirm_email: string; _reason: string; _user_id: string }
        Returns: Json
      }
      admin_disposable_records: { Args: { _limit?: number }; Returns: Json }
      admin_employer_deletion_impact: {
        Args: { _employer_id: string }
        Returns: Json
      }
      admin_identity_diagnostics: { Args: never; Returns: Json }
      admin_person_overview: { Args: { _user_id: string }; Returns: Json }
      admin_set_platform_role: {
        Args: { _grant: boolean; _role: string; _target_user_id: string }
        Returns: {
          granted: boolean
          granted_role: string
          target_user_id: string
        }[]
      }
      admin_set_user_disabled: {
        Args: { _disabled: boolean; _reason: string; _user_id: string }
        Returns: Json
      }
      admin_storage_erasure_backlog: { Args: never; Returns: Json }
      admin_user_deletion_impact: { Args: { _user_id: string }; Returns: Json }
      approve_access_request: {
        Args: { _decision: string; _granted_role?: string; _request_id: string }
        Returns: {
          employer_id: string
          membership_id: string
          request_id: string
          status: string
        }[]
      }
      assert_cig_family_id: { Args: { p_family_id: string }; Returns: boolean }
      cd_assert_session_writable: {
        Args: { _caller: string; _session_id: string }
        Returns: undefined
      }
      cd_begin_internal_test_session: {
        Args: {
          _context_status?: string
          _definition_version_id: string
          _locale?: string
        }
        Returns: string
      }
      cd_complete_session: {
        Args: {
          _career_areas: Json
          _confidence: Json
          _contextual_tags: string[]
          _coverage: Json
          _dna_scores: Json
          _session_id: string
        }
        Returns: string
      }
      cd_derive_adaptive_path: {
        Args: { _context_status: string }
        Returns: string
      }
      cd_get_shared_report: {
        Args: { _token: string }
        Returns: {
          locale: string
          pattern_id: string
          pattern_name: string
          shared_at: string
          summary: string
        }[]
      }
      cd_grant_internal_tester: {
        Args: { _note?: string; _user_id: string }
        Returns: undefined
      }
      cd_is_internal_tester: { Args: { _user_id: string }; Returns: boolean }
      cd_profession_bands_for_matching: {
        Args: { _profession_ids: string[] }
        Returns: {
          band_high: number
          band_low: number
          calibration_version: string
          centrality: string
          dimension_id: string
          profession_id: string
          weight: number
        }[]
      }
      cd_record_funnel_event: {
        Args: { _detail?: Json; _event_name: string; _session_id?: string }
        Returns: undefined
      }
      cd_session_core_completion: {
        Args: { _session_id: string }
        Returns: {
          answered: number
          expected: number
          missing: string[]
          unexpected: string[]
        }[]
      }
      cd_submit_test_feedback: {
        Args: {
          _explored_profession_id?: string
          _free_text?: string
          _locale: string
          _missing_career_note?: string
          _pathway_realistic?: boolean
          _relevant?: number
          _requirements_useful?: boolean
          _session_id?: string
          _understood_why?: boolean
        }
        Returns: undefined
      }
      cd_v31_complete_session: {
        Args: {
          _completed_at: string
          _pattern_definition_version: string
          _payload: Json
          _session_id: string
        }
        Returns: {
          snapshot_id: string
          was_created: boolean
        }[]
      }
      cd_v31_funnel_event_names: { Args: never; Returns: string[] }
      cd_v31_validate_session_evidence: {
        Args: { _session_id: string }
        Returns: {
          code: string
          detail: string
        }[]
      }
      cd_validate_option_matrix: {
        Args: { _scoring_version: string }
        Returns: {
          question_id: string
          violation: string
        }[]
      }
      cig_lifecycle_enforced: { Args: never; Returns: boolean }
      create_employer_self_service: {
        Args: {
          p_country?: string
          p_description_en?: string
          p_description_sv?: string
          p_name: string
          p_website?: string
        }
        Returns: {
          employer_id: string
          employer_slug: string
        }[]
      }
      create_my_employer_company: {
        Args: {
          _country: string
          _job_title?: string
          _name: string
          _registration_number?: string
          _slug_base: string
          _website?: string
        }
        Returns: {
          employer_id: string
          employer_slug: string
          membership_id: string
        }[]
      }
      employer_accepts_operations: {
        Args: { _employer_id: string }
        Returns: boolean
      }
      employer_is_active_status: {
        Args: { _employer_id: string }
        Returns: boolean
      }
      employer_members_can_edit: {
        Args: { _employer_id: string }
        Returns: boolean
      }
      has_employer_role: {
        Args: { _employer_id: string; _roles?: string[]; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      jase_notification_payload: {
        Args: { _event_id: string }
        Returns: {
          employer_name: string
          event_id: string
          job_title: string
          language: string
          new_status: string
          recipient_email: string
        }[]
      }
      jase_record_notification: {
        Args: { _error?: string; _event_id: string; _ok: boolean }
        Returns: undefined
      }
      job_is_active: {
        Args: {
          p_deadline_at: string
          p_expires_at: string
          p_published_at: string
          p_status: string
        }
        Returns: boolean
      }
      jobs_delete_draft: {
        Args: { _employer_id: string; _job_id: string }
        Returns: string
      }
      moderate_employer: {
        Args: { _action: string; _employer_id: string; _note?: string }
        Returns: {
          action: string
          admin_user_id: string
          created_at: string
          employer_id: string
          new_status: string
          note: string
          previous_status: string
        }[]
      }
      reject_job: {
        Args: { _job_id: string; _note: string }
        Returns: {
          job_id: string
          status: string
          updated_at: string
        }[]
      }
      save_career_report: {
        Args: {
          p_assessment_id: string
          p_assessment_version_id: string
          p_completion_id: string
          p_engine_version: string
          p_graph_version: string
          p_inputs_hash: string
          p_locale: string
          p_profile_snapshot: Json
          p_profile_version: string
          p_report: Json
          p_report_version: string
          p_result_summary: Json
          p_user_id: string
        }
        Returns: {
          created_new: boolean
          run_id: string
        }[]
      }
      scp_application_assessments: {
        Args: { _application_id: string }
        Returns: {
          answered: number
          assessment_slug: string
          assignment_id: string
          attempt_id: string
          attempt_status: string
          deadline: string
          designed_for: string
          governance_mode: Database["public"]["Enums"]["scp_governance_mode"]
          invited_at: string
          name_en: string
          name_sv: string
          released_at: string
          report_available: boolean
          reviews_outstanding: number
          scored_at: string
          subject_id: string
          submitted_at: string
          total_items: number
          use_case: string
        }[]
      }
      scp_application_candidate: {
        Args: { _application_id: string }
        Returns: {
          application_id: string
          application_status: string
          applied_at: string
          cover_note: string
          display_name: string
          employer_id: string
          has_cv: boolean
          job_id: string
          job_slug: string
          job_title_en: string
          job_title_sv: string
          phone: string
          subject_id: string
          updated_at: string
        }[]
      }
      scp_assign_from_application: {
        Args: {
          _application_id: string
          _assessment_version_id: string
          _deadline?: string
          _employer_id: string
          _language?: string
        }
        Returns: {
          assignment_id: string
          attempt_id: string
          governance_mode: Database["public"]["Enums"]["scp_governance_mode"]
          subject_id: string
        }[]
      }
      scp_assign_training: {
        Args: {
          _due_at?: string
          _employer_id: string
          _language?: string
          _message?: string
          _program_version_id: string
          _recipient_email: string
          _source_decision_id?: string
        }
        Returns: {
          assignment_id: string
          modules_seeded: number
          subject_id: string
        }[]
      }
      scp_attempt_assessment_signal: {
        Args: {
          _attempt_id: string
          _competency_version_id: string
          _signal_version?: string
        }
        Returns: {
          mean: number
          observations: number
          signal: string
          spread: number
        }[]
      }
      scp_attempt_evidence_state: {
        Args: {
          _attempt_id: string
          _competency_version_id: string
          _maturity: string
        }
        Returns: string
      }
      scp_attempt_lifecycle_state: {
        Args: {
          _attempt_status: string
          _released_at: string
          _reviews_open?: number
          _scored_at: string
          _started_at: string
          _submitted_at: string
        }
        Returns: string
      }
      scp_attempt_maturity: {
        Args: {
          _at?: string
          _attempt_id: string
          _competency_version_id: string
          _threshold_version?: string
        }
        Returns: string
      }
      scp_attempt_self_report_pattern: {
        Args: {
          _attempt_id: string
          _facet_id: string
          _signal_version?: string
        }
        Returns: {
          consistency: string
          items: number
          mean: number
          pattern: string
          spread: number
        }[]
      }
      scp_audience_brief: { Args: { _brief: Json }; Returns: Json }
      scp_bind_employee_subject: {
        Args: { _employee_id: string; _user_id: string }
        Returns: string
      }
      scp_brief_executive_summary: {
        Args: { _lang: string; _observed: Json; _self_reported: Json }
        Returns: string
      }
      scp_bundle_version_assignability: {
        Args: { _bundle_version_id: string }
        Returns: {
          assignability: string
          reason: string
        }[]
      }
      scp_can_author: { Args: { _user_id: string }; Returns: boolean }
      scp_can_review_for: {
        Args: { _employer_id: string; _use_case?: string; _user_id: string }
        Returns: boolean
      }
      scp_cancel_assessment_invitation: {
        Args: { _invitation_id: string; _reason?: string }
        Returns: undefined
      }
      scp_claim_assessment_invitations: {
        Args: never
        Returns: {
          assignment_id: string
          attempt_id: string
          employer_id: string
          invitation_id: string
          outcome: string
        }[]
      }
      scp_complete_human_review: {
        Args: {
          _outcome: string
          _rationale: string
          _review_id: string
          _rubric_levels?: Json
          _safety_finding?: string
        }
        Returns: string
      }
      scp_complete_learning_module: {
        Args: { _attempt_id: string }
        Returns: number
      }
      scp_complete_training_module: {
        Args: { _assignment_id: string; _module_version_id: string }
        Returns: boolean
      }
      scp_complete_training_programme: {
        Args: { _assignment_id: string }
        Returns: number
      }
      scp_compute_maturity: {
        Args: {
          _at?: string
          _competency_version_id: string
          _subject_id: string
          _threshold_version?: string
        }
        Returns: string
      }
      scp_development_recommendations: {
        Args: { _subject_id: string }
        Returns: {
          addresses_competency_en: string
          addresses_competency_sv: string
          estimated_minutes: number
          maturity_level: string
          module_name_en: string
          module_name_sv: string
          module_version_id: string
          summary_en: string
          summary_sv: string
        }[]
      }
      scp_display_evidence_state: {
        Args: {
          _competency_version_id: string
          _maturity: string
          _subject_id: string
        }
        Returns: string
      }
      scp_employer_assessment_pipeline: {
        Args: { _employer_id: string }
        Returns: {
          answered: number
          assessment_name_en: string
          assessment_name_sv: string
          assessment_slug: string
          assignment_id: string
          attempt_id: string
          can_release: boolean
          deadline: string
          employee_id: string
          governance_mode: Database["public"]["Enums"]["scp_governance_mode"]
          identity_resolvable: boolean
          invited_at: string
          lifecycle_state: string
          participant_name: string
          participant_ref: string
          purpose_code: string
          released_at: string
          reviews_open: number
          reviews_total: number
          scored_at: string
          started_at: string
          subject_id: string
          submitted_at: string
          total_items: number
          use_case: string
        }[]
      }
      scp_employer_assign: {
        Args: {
          _application_id?: string
          _assessment_version_id: string
          _deadline?: string
          _employee_id?: string
          _employer_id: string
          _job_id?: string
          _language?: string
          _purpose_intent?: string
          _recipient_email: string
          _use_case?: string
        }
        Returns: {
          assignment_id: string
          attempt_id: string
          governance_mode: Database["public"]["Enums"]["scp_governance_mode"]
          subject_id: string
        }[]
      }
      scp_employer_content_library: {
        Args: { _employer_id: string }
        Returns: {
          assignable: boolean
          competencies_en: string[]
          competencies_sv: string[]
          content_status: string
          designed_for: string
          does_not_measure_en: string[]
          does_not_measure_sv: string[]
          governance_mode: Database["public"]["Enums"]["scp_governance_mode"]
          is_test_fixture: boolean
          item_count: number
          item_id: string
          languages: string[]
          library_kind: string
          lifecycle_state: string
          minutes_max: number
          minutes_min: number
          module_count: number
          name_en: string
          name_sv: string
          owner_employer_id: string
          ownership: string
          parent_id: string
          published_at: string
          requires_human_review: boolean
          slug: string
          summary_en: string
          summary_sv: string
          target_role_en: string
          target_role_sv: string
          unassignable_reason: string
          updated_at: string
          validation_status: string
          version_number: number
        }[]
      }
      scp_employer_decisions: {
        Args: { _attempt_id: string }
        Returns: {
          action: string
          decided_at: string
          decided_by_email: string
          id: string
          is_current: boolean
          next_step: string
          next_step_owner: string
          reason_code: string
          reason_note: string
          supersedes_id: string
        }[]
      }
      scp_employer_invitations: {
        Args: { _employer_id: string }
        Returns: {
          application_id: string
          bound_assignment_id: string
          bound_at: string
          closed_reason: string
          email: string
          expires_at: string
          invitation_id: string
          invited_at: string
          invited_name: string
          job_id: string
          job_title_en: string
          job_title_sv: string
          name_en: string
          name_sv: string
          status: string
          use_case: string
        }[]
      }
      scp_employer_library: {
        Args: { _employer_id: string }
        Returns: {
          assessment_version_id: string
          assignable: boolean
          content_status: string
          definition_slug: string
          does_not_measure_en: string[]
          does_not_measure_sv: string[]
          governance_mode: Database["public"]["Enums"]["scp_governance_mode"]
          is_test_fixture: boolean
          item_count: number
          name_en: string
          name_sv: string
          programme_purpose_en: string
          programme_purpose_sv: string
          target_minutes_max: number
          target_minutes_min: number
          validation_status: string
        }[]
      }
      scp_employer_participants: {
        Args: { _employer_id: string }
        Returns: {
          answered: number
          assignment_id: string
          attempt_id: string
          attempt_status: string
          deadline: string
          identity_resolvable: boolean
          programme_name_en: string
          programme_name_sv: string
          released_at: string
          reviews_outstanding: number
          scored_at: string
          started_at: string
          subject_id: string
          submitted_at: string
          total_items: number
        }[]
      }
      scp_employer_person_assessments: {
        Args: { _employee_id: string; _employer_id: string }
        Returns: {
          assessment_name_en: string
          assessment_name_sv: string
          assessment_slug: string
          assigned_at: string
          attempt_id: string
          employer_snapshot_id: string
          governance_mode: Database["public"]["Enums"]["scp_governance_mode"]
          lifecycle_state: string
          purpose_code: string
          released_at: string
          reviews_open: number
          reviews_total: number
          scored_at: string
          started_at: string
          submitted_at: string
          use_case: string
        }[]
      }
      scp_employer_person_overview: {
        Args: { _employer_id: string; _subject_id: string }
        Returns: {
          application_id: string
          attempt_id: string
          job_id: string
          occurred_at: string
          released_at: string
          report_available: boolean
          row_id: string
          row_kind: string
          status: string
          title_en: string
          title_sv: string
          use_case: string
        }[]
      }
      scp_employer_report: {
        Args: { _attempt_id: string }
        Returns: {
          attempt_id: string
          audience: string
          brief: Json
          context: Json
          id: string
          limitations_en: string[]
          limitations_sv: string[]
          payload: Json
          released_at: string
          safety_flags: Json
          subject_id: string
        }[]
      }
      scp_employer_review_board: {
        Args: { _employer_id: string }
        Returns: {
          attempt_id: string
          my_basis: string
          my_disclosure: string
          responses_open: number
        }[]
      }
      scp_employer_review_pressure: {
        Args: { _employer_id: string }
        Returns: {
          attempts_blocked: number
          awaiting_review: number
        }[]
      }
      scp_employer_team: {
        Args: { _employer_id: string }
        Returns: {
          display_name: string
          employer_role: string
          is_reviewer: boolean
          is_self: boolean
          membership_status: string
          reviewer_granted_at: string
          reviewer_use_cases: string[]
          user_id: string
        }[]
      }
      scp_employer_training_status: {
        Args: { _employer_id: string }
        Returns: {
          assigned_at: string
          assignment_id: string
          completed_at: string
          due_at: string
          identity_resolvable: boolean
          language: string
          modules_completed: number
          modules_total: number
          programme_name_en: string
          programme_name_sv: string
          started_at: string
          status: string
          subject_id: string
          version_number: number
        }[]
      }
      scp_employment_from_application: {
        Args: { _application_id: string }
        Returns: string
      }
      scp_get_attempt_blocks: {
        Args: { _attempt_id: string; _language?: string }
        Returns: {
          answered: number
          asks: string
          block_key: string
          display_order: number
          intro: string
          item_count: number
          name: string
        }[]
      }
      scp_get_attempt_items: {
        Args: { _attempt_id: string; _language?: string }
        Returns: {
          block_key: string
          display_order: number
          is_safety_critical: boolean
          item_format: string
          item_version_id: string
          options: Json
          prompt: string
          saved_best_id: string
          saved_option_id: string
          saved_text: string
          saved_worst_id: string
          scenario: string
        }[]
      }
      scp_get_learning_feedback: {
        Args: {
          _attempt_id: string
          _item_version_id: string
          _language?: string
        }
        Returns: {
          chosen: boolean
          error_type: string
          feedback: string
          is_preferred: boolean
          label: string
          option_id: string
        }[]
      }
      scp_grant_employer_reviewer: {
        Args: { _employer_id: string; _use_cases?: string[]; _user_id: string }
        Returns: string
      }
      scp_grant_permits_assignment: {
        Args: {
          _content_status: string
          _definition_id: string
          _employer_id: string
          _is_test_fixture: boolean
          _validation_status: string
        }
        Returns: Database["public"]["Enums"]["scp_governance_mode"]
      }
      scp_has_content_role: {
        Args: { _role: string; _user_id: string }
        Returns: boolean
      }
      scp_has_test_grant: {
        Args: {
          _definition_id?: string
          _employer_id: string
          _purpose: Database["public"]["Enums"]["scp_governance_mode"]
        }
        Returns: boolean
      }
      scp_interview_can_edit: { Args: { _user_id: string }; Returns: boolean }
      scp_interview_can_read: { Args: { _user_id: string }; Returns: boolean }
      scp_interview_can_write_version: {
        Args: { _pack_version_id: string }
        Returns: boolean
      }
      scp_interview_competency_version: {
        Args: { _pack_competency_id: string }
        Returns: string
      }
      scp_interview_confirm_competency_mapping: {
        Args: { _mapping_id: string }
        Returns: undefined
      }
      scp_interview_create_pack: {
        Args: {
          _name_en?: string
          _name_sv: string
          _purpose_sv: string
          _role_id: string
          _slug: string
        }
        Returns: string
      }
      scp_interview_create_version: {
        Args: {
          _locale: string
          _pack_id: string
          _role_version_id: string
          _source_document_version: string
          _source_reference: string
          _summary_sv?: string
        }
        Returns: string
      }
      scp_interview_notes: {
        Args: { _attempt_id: string }
        Returns: {
          area_code: string
          id: string
          note: string
          outcome: string
          recorded_at: string
          recorded_by_email: string
        }[]
      }
      scp_interview_pack_content_hash: {
        Args: { _pack_version_id: string }
        Returns: string
      }
      scp_interview_pack_validate: {
        Args: { _pack_version_id: string }
        Returns: {
          code: string
          message: string
          severity: string
        }[]
      }
      scp_interview_pilot_grant_active: {
        Args: {
          _employer_id: string
          _pack_version_id: string
          _user_id?: string
        }
        Returns: boolean
      }
      scp_interview_publish_version: {
        Args: { _pack_version_id: string; _reason?: string }
        Returns: string
      }
      scp_interview_question_version: {
        Args: { _question_id: string }
        Returns: string
      }
      scp_interview_record_event: {
        Args: {
          _content_hash: string
          _event: string
          _metadata?: Json
          _new_status: string
          _pack_id: string
          _pack_version_id: string
          _previous_status: string
          _reason: string
        }
        Returns: string
      }
      scp_interview_record_review: {
        Args: {
          _decision: string
          _gate: string
          _pack_version_id: string
          _rationale: string
        }
        Returns: string
      }
      scp_interview_retire_version: {
        Args: { _pack_version_id: string; _reason: string }
        Returns: undefined
      }
      scp_interview_set_pilot_availability: {
        Args: { _available: boolean; _pack_version_id: string; _reason: string }
        Returns: undefined
      }
      scp_interview_submit_for_review: {
        Args: { _gate: string; _pack_version_id: string }
        Returns: string
      }
      scp_interview_suspend_version: {
        Args: { _pack_version_id: string; _reason: string }
        Returns: undefined
      }
      scp_interview_touch_draft: {
        Args: { _pack_version_id: string; _summary?: string }
        Returns: string
      }
      scp_interview_version_is_editable: {
        Args: { _pack_version_id: string }
        Returns: boolean
      }
      scp_invite_participant: {
        Args: {
          _application_id?: string
          _assessment_version_id: string
          _deadline?: string
          _email: string
          _employer_id: string
          _invited_name?: string
          _job_id?: string
          _language?: string
          _use_case?: string
        }
        Returns: {
          assignment_id: string
          attempt_id: string
          governance_mode: Database["public"]["Enums"]["scp_governance_mode"]
          invitation_id: string
          outcome: string
          subject_id: string
        }[]
      }
      scp_is_standard_recruitment_content: {
        Args: { _definition_id: string; _employer_id: string }
        Returns: boolean
      }
      scp_iv_add_source: {
        Args: {
          _case_id: string
          _content_text: string
          _label: string
          _lawful_basis_note: string
          _linked_application_id?: string
          _origin?: string
          _purpose_code: string
          _source_kind: string
        }
        Returns: string
      }
      scp_iv_ai_real_model_permitted: { Args: never; Returns: boolean }
      scp_iv_ai_run_settle: {
        Args: {
          _abstention_reason?: string
          _cost_micros?: number
          _failure_reason?: string
          _input_tokens?: number
          _latency_ms?: number
          _output_tokens?: number
          _provider_mode?: string
          _raw_response?: Json
          _resolved_model?: string
          _run_id: string
          _status: string
          _withheld_passages?: Json
        }
        Returns: undefined
      }
      scp_iv_ai_run_start: {
        Args: {
          _case_id: string
          _input_hash?: string
          _model: string
          _provider: string
          _provider_mode?: string
          _raw_request?: Json
          _task: string
        }
        Returns: string
      }
      scp_iv_approve_prep_plan: {
        Args: { _note?: string; _plan_id: string }
        Returns: undefined
      }
      scp_iv_author_evidence: {
        Args: {
          _case_id: string
          _evidence_dimension_id?: string
          _excerpt: string
          _note_id?: string
          _pack_competency_id?: string
          _question_id: string
        }
        Returns: string
      }
      scp_iv_begin_evidence_review: {
        Args: { _case_id: string }
        Returns: undefined
      }
      scp_iv_can_read_case: { Args: { _case_id: string }; Returns: boolean }
      scp_iv_can_write_case: { Args: { _case_id: string }; Returns: boolean }
      scp_iv_candidate_interview_detail: {
        Args: { _case_id: string }
        Returns: Json
      }
      scp_iv_candidate_interview_status: {
        Args: never
        Returns: {
          application_id: string
          candidate_status: string
          case_id: string
          employer_name: string
          role_title: string
          updated_at: string
        }[]
      }
      scp_iv_case_employer: { Args: { _case_id: string }; Returns: string }
      scp_iv_case_start_basis: {
        Args: {
          _employer_id: string
          _pack_version_id: string
          _user_id?: string
        }
        Returns: string
      }
      scp_iv_confirm_evidence_proposal: {
        Args: {
          _correction_class?: string
          _decision: string
          _e1?: string
          _e2?: string
          _e3?: string
          _e4?: string
          _e5?: string
          _edited_excerpt?: string
          _note?: string
          _proposal_id: string
        }
        Returns: string
      }
      scp_iv_confirm_transcript_basis: {
        Args: {
          _candidate_informed_statement?: string
          _case_id: string
          _purpose_code?: string
          _retain_until?: string
          _statement: string
        }
        Returns: undefined
      }
      scp_iv_create_case: {
        Args: {
          _application_id?: string
          _candidate_display_name: string
          _candidate_external_ref?: string
          _candidate_user_id?: string
          _employer_id: string
          _job_id?: string
          _pack_version_id: string
          _title: string
        }
        Returns: string
      }
      scp_iv_employer_can_start_interviews: {
        Args: { _employer_id: string }
        Returns: boolean
      }
      scp_iv_employer_may_read_pack: {
        Args: { _pack_version_id: string }
        Returns: boolean
      }
      scp_iv_erase_source: {
        Args: { _reason: string; _source_id: string }
        Returns: undefined
      }
      scp_iv_finalise_report: {
        Args: { _case_id: string; _draft_run_id?: string }
        Returns: string
      }
      scp_iv_is_case_candidate: { Args: { _case_id: string }; Returns: boolean }
      scp_iv_mark_assessed: { Args: { _case_id: string }; Returns: undefined }
      scp_iv_mark_sources_ready: {
        Args: { _case_id: string }
        Returns: undefined
      }
      scp_iv_open_pilot_available: {
        Args: { _pack_version_id: string }
        Returns: boolean
      }
      scp_iv_pack_competency_pack: {
        Args: { _pack_competency_id: string }
        Returns: string
      }
      scp_iv_panel_conclude: {
        Args: { _case_id: string; _conclusion: string }
        Returns: undefined
      }
      scp_iv_panel_open: {
        Args: { _case_id: string; _member_ids: string[] }
        Returns: string
      }
      scp_iv_panel_reveal: { Args: { _case_id: string }; Returns: undefined }
      scp_iv_panel_submit: { Args: { _case_id: string }; Returns: undefined }
      scp_iv_panel_visible_assessments: {
        Args: { _case_id: string }
        Returns: {
          assessed_at: string
          assessment_id: string
          assessor_id: string
          is_mine: boolean
          level: number
          question_id: string
          rationale: string
          uncertainty_note: string
        }[]
      }
      scp_iv_plan_case: { Args: { _plan_id: string }; Returns: string }
      scp_iv_question_pack: { Args: { _question_id: string }; Returns: string }
      scp_iv_record_assessment: {
        Args: {
          _case_id: string
          _level: number
          _question_id: string
          _rationale: string
          _supersede_reason?: string
          _uncertainty_note?: string
        }
        Returns: string
      }
      scp_iv_record_candidate_facts: {
        Args: { _items: Json; _run_id: string }
        Returns: number
      }
      scp_iv_record_event: {
        Args: {
          _actor_kind?: string
          _ai_run_id?: string
          _case_id: string
          _event: string
          _metadata?: Json
          _new_status?: string
          _previous_status?: string
          _reason?: string
        }
        Returns: string
      }
      scp_iv_record_evidence_proposals: {
        Args: { _items: Json; _run_id: string }
        Returns: number
      }
      scp_iv_record_findings: {
        Args: { _items: Json; _run_id: string }
        Returns: number
      }
      scp_iv_record_manual_prep_plan: {
        Args: {
          _case_id: string
          _closing_guidance?: string
          _opening_guidance?: string
          _time_plan?: string
        }
        Returns: string
      }
      scp_iv_record_prep_plan: {
        Args: { _items: Json; _plan: Json; _run_id: string }
        Returns: string
      }
      scp_iv_record_role_requirements: {
        Args: { _items: Json; _run_id: string }
        Returns: number
      }
      scp_iv_report_blockers: {
        Args: { _case_id: string }
        Returns: {
          code: string
          message: string
        }[]
      }
      scp_iv_session_case: { Args: { _session_id: string }; Returns: string }
      scp_iv_set_case_status: {
        Args: { _case_id: string; _new_status: string }
        Returns: undefined
      }
      scp_iv_set_session_state: {
        Args: {
          _peace_stage?: string
          _process_reflection?: string
          _protocol_deviations?: string
          _session_id: string
          _status?: string
        }
        Returns: undefined
      }
      scp_iv_source_case: { Args: { _source_id: string }; Returns: string }
      scp_iv_start_session: {
        Args: { _case_id: string; _interviewer_names?: string }
        Returns: string
      }
      scp_iv_startable_pack_versions: {
        Args: { _employer_id: string }
        Returns: {
          content_status: string
          entitlement_basis: string
          locale: string
          name_en: string
          name_sv: string
          pack_id: string
          pack_slug: string
          pack_version_id: string
          validation_label: string
          version_number: number
        }[]
      }
      scp_join_human: {
        Args: { _items: string[]; _lang: string }
        Returns: string
      }
      scp_lifecycle_state: {
        Args: {
          _content_status: string
          _is_test_fixture: boolean
          _retired_at: string
        }
        Returns: string
      }
      scp_my_academy_assignments: {
        Args: never
        Returns: {
          answered: number
          attempt_id: string
          attempt_status: string
          deadline: string
          employer_name: string
          mode: string
          programme_name_en: string
          programme_name_sv: string
          purpose_en: string
          purpose_sv: string
          released_at: string
          total_items: number
        }[]
      }
      scp_my_academy_work: {
        Args: never
        Returns: {
          assigned_at: string
          deadline: string
          employer_name: string
          job_title_en: string
          job_title_sv: string
          progress_done: number
          progress_total: number
          purpose_en: string
          purpose_sv: string
          released_at: string
          status: string
          title_en: string
          title_sv: string
          use_case: string
          work_id: string
          work_kind: string
        }[]
      }
      scp_my_assessment_history: {
        Args: never
        Returns: {
          assessment_name_en: string
          assessment_name_sv: string
          assessment_slug: string
          attempt_id: string
          invited_at: string
          issuer_name: string
          lifecycle_state: string
          participant_snapshot_id: string
          purpose_code: string
          released_at: string
          started_at: string
          submitted_at: string
          use_case: string
        }[]
      }
      scp_my_review_workload: {
        Args: never
        Returns: {
          attempts_waiting: number
          employers_covered: number
          responses_waiting: number
        }[]
      }
      scp_my_training_modules: {
        Args: { _assignment_id: string }
        Returns: {
          answered: number
          attempt_id: string
          completed_at: string
          display_order: number
          estimated_minutes: number
          has_activity: boolean
          module_version_id: string
          name_en: string
          name_sv: string
          started_at: string
          status: string
          summary_en: string
          summary_sv: string
          total_items: number
        }[]
      }
      scp_my_training_programme: {
        Args: { _assignment_id: string }
        Returns: {
          assigned_at: string
          assignment_id: string
          completed_at: string
          does_not_measure_en: string[]
          does_not_measure_sv: string[]
          due_at: string
          employer_name: string
          estimated_minutes: number
          language: string
          modules_completed: number
          modules_total: number
          name_en: string
          name_sv: string
          program_version_id: string
          purpose_en: string
          purpose_sv: string
          started_at: string
          status: string
          version_number: number
        }[]
      }
      scp_participant_report: {
        Args: { _attempt_id: string }
        Returns: {
          attempt_id: string
          audience: string
          brief: Json
          context: Json
          id: string
          limitations_en: string[]
          limitations_sv: string[]
          payload: Json
          released_at: string
          safety_flags: Json
          subject_id: string
        }[]
      }
      scp_record_employer_decision: {
        Args: {
          _action: string
          _attempt_id: string
          _next_step?: string
          _next_step_owner?: string
          _reason_code: string
          _reason_note?: string
          _supersedes_id?: string
        }
        Returns: string
      }
      scp_record_interview_note: {
        Args: {
          _area_code: string
          _attempt_id: string
          _note?: string
          _outcome: string
        }
        Returns: string
      }
      scp_release_attempt_report: {
        Args: { _attempt_id: string }
        Returns: {
          employer_snapshot: string
          participant_snapshot: string
        }[]
      }
      scp_report_snapshot_readable: {
        Args: {
          _audience: string
          _issuer_organization_id: string
          _subject_id: string
        }
        Returns: boolean
      }
      scp_required_purpose_code:
        | {
            Args: { _purpose_intent?: string; _use_case: string }
            Returns: string
          }
        | {
            Args: {
              _governance_mode: Database["public"]["Enums"]["scp_governance_mode"]
              _purpose_intent: string
              _use_case: string
            }
            Returns: string
          }
      scp_resolve_employment_for_assignment: {
        Args: { _email: string; _employer_id: string; _subject_id: string }
        Returns: string
      }
      scp_resolve_participant_identity: {
        Args: { _employer_id: string; _subject_id: string }
        Returns: {
          display_email: string
          released: boolean
          subject_id: string
        }[]
      }
      scp_review_authorisation: {
        Args: { _attempt_id: string; _user_id: string }
        Returns: string
      }
      scp_review_conflict: {
        Args: { _attempt_id: string; _user_id: string }
        Returns: string
      }
      scp_review_conflict_disclosure: {
        Args: { _attempt_id: string; _user_id: string }
        Returns: string
      }
      scp_review_queue: {
        Args: { _language?: string }
        Returns: {
          assessment_name: string
          assessment_slug: string
          attempt_id: string
          chosen_best_label: string
          chosen_label: string
          chosen_worst_label: string
          finding_required: boolean
          governance_mode: Database["public"]["Enums"]["scp_governance_mode"]
          is_safety_critical: boolean
          item_display_order: number
          item_format: string
          item_prompt: string
          item_scenario: string
          opened_at: string
          organisation_name: string
          outstanding_in_attempt: number
          participant_ref: string
          purpose_code: string
          response_text: string
          review_id: string
          rubric: Json
          trigger_reason: string
          validation_status_at_assignment: string
        }[]
      }
      scp_revoke_employer_reviewer: {
        Args: { _employer_id: string; _user_id: string }
        Returns: boolean
      }
      scp_save_response: {
        Args: {
          _attempt_id: string
          _best_option_id?: string
          _item_version_id: string
          _response_text?: string
          _selected_option_id?: string
          _worst_option_id?: string
        }
        Returns: string
      }
      scp_schedule_reassessment: {
        Args: { _deadline?: string; _employer_id: string; _subject_id: string }
        Returns: {
          assignment_id: string
          attempt_id: string
        }[]
      }
      scp_start_learning_attempt: {
        Args: { _form_id: string }
        Returns: string
      }
      scp_start_training_module: {
        Args: { _assignment_id: string; _module_version_id: string }
        Returns: string
      }
      scp_subject_progress: {
        Args: { _subject_id: string }
        Returns: {
          attempt_id: string
          competency_code: string
          competency_name_en: string
          competency_name_sv: string
          evidence_state: string
          observations: number
          released_at: string
          safety_flag_count: number
        }[]
      }
      scp_submit_attempt: {
        Args: { _attempt_id: string }
        Returns: {
          attempt_status: string
          evidence_written: number
          reviews_opened: number
        }[]
      }
      scp_training_permits_assignment: {
        Args: {
          _content_status: string
          _employer_id: string
          _is_test_fixture: boolean
          _validation_status: string
        }
        Returns: Database["public"]["Enums"]["scp_governance_mode"]
      }
      scp_trust_case_method_version: {
        Args: { _case_id: string }
        Returns: number
      }
      scp_trust_case_stage: { Args: { _case_id: string }; Returns: string }
      scp_trust_eligible_method: {
        Args: { _usage_mode?: string }
        Returns: string
      }
      scp_trust_stage_for_case: {
        Args: { _case_id: string }
        Returns: {
          human_responsibility_en: string
          human_responsibility_sv: string
          letter: string
          method_version: number
          name_en: string
          name_sv: string
          ordinal: number
          permits_ai: boolean
          prohibitions: string[]
          prohibitions_en: string[]
          purpose_en: string
          purpose_sv: string
          stage_key: string
        }[]
      }
      set_application_status: {
        Args: { _application_id: string; _new_status: string; _note?: string }
        Returns: {
          application_id: string
          new_status: string
          previous_status: string
          updated_at: string
        }[]
      }
      sp_application_disclosure: {
        Args: { _application_id: string }
        Returns: Json
      }
      sp_archive_claim: {
        Args: { _claim_id: string; _reason: string }
        Returns: undefined
      }
      sp_attach_evidence: {
        Args: {
          _claim_id: string
          _file_name: string
          _mime_type: string
          _period_id: string
          _sha256: string
          _size_bytes: number
          _storage_path: string
        }
        Returns: string
      }
      sp_correct_claim: {
        Args: {
          _authorisation_scope?: string
          _claim_id: string
          _claimed_issuer_name: string
          _credential_code: string
          _credential_reference: string
          _holder_note: string
          _issued_on: string
          _jurisdiction_code: string
          _reason: string
          _skill_code?: string
          _skill_level?: string
          _sub_jurisdiction_code?: string
          _title: string
          _valid_from: string
          _valid_until: string
        }
        Returns: string
      }
      sp_create_credential_disclosure: {
        Args: {
          _claim_id: string
          _expires_days: number
          _purpose: string
          _recipient_hint: string
        }
        Returns: string
      }
      sp_create_disclosure: {
        Args: {
          _expires_days: number
          _package_code: string
          _purpose: string
          _recipient_hint: string
        }
        Returns: string
      }
      sp_disclosure_payload: { Args: { _disclosure_id: string }; Returns: Json }
      sp_dispute_queue: { Args: never; Returns: Json }
      sp_employer_attestation_queue: {
        Args: { _employer_id: string }
        Returns: Json
      }
      sp_get_disclosure: { Args: { _token: string }; Returns: Json }
      sp_grant_pilot_member: {
        Args: { _market_pack_code: string; _note?: string; _user_id: string }
        Returns: undefined
      }
      sp_is_pilot_member: {
        Args: { _market_pack_code: string; _user_id: string }
        Returns: boolean
      }
      sp_is_verifier: { Args: { _user_id: string }; Returns: boolean }
      sp_market_access: {
        Args: { _market_pack_code: string; _user_id: string }
        Returns: string
      }
      sp_my_application_disclosures: {
        Args: never
        Returns: {
          access_count: number
          application_id: string
          created_at: string
          disclosure_id: string
          employer_name: string
          expires_at: string
          focus_claim_id: string
          job_title_en: string
          job_title_sv: string
          package_code: string
          revoked_at: string
        }[]
      }
      sp_raise_dispute: {
        Args: { _claim_id: string; _period_id: string; _reason: string }
        Returns: undefined
      }
      sp_resolve_dispute: {
        Args: {
          _claim_id: string
          _note: string
          _outcome: string
          _period_id: string
        }
        Returns: undefined
      }
      sp_revoke_disclosure: { Args: { _id: string }; Returns: undefined }
      sp_revoke_pilot_member: {
        Args: { _market_pack_code: string; _user_id: string }
        Returns: undefined
      }
      sp_share_passport_with_application: {
        Args: {
          _application_id: string
          _expires_days?: number
          _focus_claim_id?: string
          _package_code: string
          _purpose?: string
        }
        Returns: string
      }
      sp_submit_application_with_cv_source: {
        Args: {
          _application_id: string
          _cover_note: string
          _cv_document_id?: string
          _cv_original_filename: string
          _cv_size_bytes: number
          _cv_source?: string
          _cv_storage_path: string
          _include_passport?: boolean
          _job_id: string
          _phone: string
        }
        Returns: Json
      }
      sp_submit_application_with_passport: {
        Args: {
          _application_id: string
          _cover_note: string
          _cv_original_filename: string
          _cv_size_bytes: number
          _cv_storage_path: string
          _include_passport?: boolean
          _job_id: string
          _phone: string
        }
        Returns: Json
      }
      sp_submit_for_verification: {
        Args: {
          _claim_id: string
          _employer_id: string
          _kind: string
          _period_id: string
        }
        Returns: string
      }
      sp_throttle_public_access: {
        Args: { _client_hash: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      sp_verifier_decide: {
        Args: {
          _decision: string
          _decision_note: string
          _holder_message: string
          _method: string
          _request_id: string
          _valid_from: string
          _valid_until: string
        }
        Returns: undefined
      }
      sp_verifier_queue: { Args: { _status?: string }; Returns: Json }
      sp_verifier_request_detail: {
        Args: { _request_id: string }
        Returns: Json
      }
      sp_verifier_revoke: {
        Args: { _claim_id: string; _period_id: string; _reason: string }
        Returns: undefined
      }
      sp_withdraw_claim: {
        Args: { _claim_id: string; _reason: string }
        Returns: undefined
      }
      sp_withdraw_evidence: {
        Args: { _evidence_id: string }
        Returns: undefined
      }
      sp_withdraw_verification_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      sweep_analytics_retention: {
        Args: never
        Returns: {
          deidentified: number
          purged: number
        }[]
      }
      sweep_application_retention: {
        Args: never
        Returns: {
          application_id: string
          cv_storage_path: string
        }[]
      }
      sweep_expired_jobs: { Args: never; Returns: number }
      unaccent: { Args: { "": string }; Returns: string }
      update_employer_membership: {
        Args: {
          _membership_id: string
          _new_role?: string
          _new_status?: string
        }
        Returns: {
          accepted_at: string
          changed: boolean
          created_at: string
          employer_id: string
          id: string
          invited_at: string
          removed_at: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "superadmin"
        | "admin"
        | "content_editor"
        | "assessment_editor"
        | "support"
        | "passport_verifier"
      cig_alias_kind:
        | "alias"
        | "specialisation"
        | "seniority"
        | "context"
        | "destination"
      cig_content_status:
        | "draft"
        | "researched"
        | "awaiting_human_review"
        | "reviewed"
        | "published"
        | "archived"
      cig_link_status: "healthy" | "redirected" | "failed" | "needs_check"
      cig_quality_level: "A" | "B" | "C"
      cig_relationship_criticality: "mandatory" | "preferred" | "informative"
      cig_source_type:
        | "official"
        | "primary"
        | "secondary"
        | "community"
        | "internal"
      scp_governance_mode: "development" | "closed_test" | "recruitment"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "superadmin",
        "admin",
        "content_editor",
        "assessment_editor",
        "support",
        "passport_verifier",
      ],
      cig_alias_kind: [
        "alias",
        "specialisation",
        "seniority",
        "context",
        "destination",
      ],
      cig_content_status: [
        "draft",
        "researched",
        "awaiting_human_review",
        "reviewed",
        "published",
        "archived",
      ],
      cig_link_status: ["healthy", "redirected", "failed", "needs_check"],
      cig_quality_level: ["A", "B", "C"],
      cig_relationship_criticality: ["mandatory", "preferred", "informative"],
      cig_source_type: [
        "official",
        "primary",
        "secondary",
        "community",
        "internal",
      ],
      scp_governance_mode: ["development", "closed_test", "recruitment"],
    },
  },
} as const
