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
          profile_version: string | null
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
          locale: string
          profile_version?: string | null
          report: Json
          report_version?: string
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
          profile_version?: string | null
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
      employees: {
        Row: {
          created_at: string
          created_by: string
          email: string | null
          employer_id: string
          employment_status: string
          first_name: string
          id: string
          last_name: string
          role_title: string | null
          site_name: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          email?: string | null
          employer_id: string
          employment_status?: string
          first_name: string
          id?: string
          last_name: string
          role_title?: string | null
          site_name?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string | null
          employer_id?: string
          employment_status?: string
          first_name?: string
          id?: string
          last_name?: string
          role_title?: string | null
          site_name?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
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
          cv_mime_type: string | null
          cv_original_filename: string | null
          cv_size_bytes: number | null
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
          cv_mime_type?: string | null
          cv_original_filename?: string | null
          cv_size_bytes?: number | null
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
          cv_mime_type?: string | null
          cv_original_filename?: string | null
          cv_size_bytes?: number | null
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
          profession_slug: string | null
          published_at: string | null
          region: string | null
          regulated: boolean
          related_profession_slugs: string[]
          required_skill_ids: string[]
          requirements: Json | null
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
          profession_slug?: string | null
          published_at?: string | null
          region?: string | null
          regulated?: boolean
          related_profession_slugs?: string[]
          required_skill_ids?: string[]
          requirements?: Json | null
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
          profession_slug?: string | null
          published_at?: string | null
          region?: string | null
          regulated?: boolean
          related_profession_slugs?: string[]
          required_skill_ids?: string[]
          requirements?: Json | null
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
          family_id: string
          id: string
          is_test_fixture: boolean
          name_en: string
          name_sv: string
          profession_id: string | null
          purpose: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          is_test_fixture?: boolean
          name_en: string
          name_sv: string
          profession_id?: string | null
          purpose: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          is_test_fixture?: boolean
          name_en?: string
          name_sv?: string
          profession_id?: string | null
          purpose?: string
          slug?: string
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
          created_at: string
          form_id: string
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
        }
        Insert: {
          accommodation_granted?: boolean
          accommodation_note?: string | null
          assessment_version_id?: string | null
          assignment_id?: string | null
          created_at?: string
          form_id: string
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
        }
        Update: {
          accommodation_granted?: boolean
          accommodation_note?: string | null
          assessment_version_id?: string | null
          assignment_id?: string | null
          created_at?: string
          form_id?: string
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
      scp_evidence_source_types: {
        Row: {
          code: string
          created_at: string
          has_active_writer: boolean
          name_en: string
          name_sv: string
        }
        Insert: {
          code: string
          created_at?: string
          has_active_writer?: boolean
          name_en: string
          name_sv: string
        }
        Update: {
          code?: string
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
          reviewer_actor_id: string | null
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
          reviewer_actor_id?: string | null
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
          reviewer_actor_id?: string | null
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
          difficulty_target: string | null
          facet_id: string | null
          id: string
          information_available_sv: string | null
          information_withheld_sv: string | null
          intended_forms: string[]
          intended_professions: string[]
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
          legal_review_notes: string | null
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
          scenario_type: string | null
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
          difficulty_target?: string | null
          facet_id?: string | null
          id?: string
          information_available_sv?: string | null
          information_withheld_sv?: string | null
          intended_forms?: string[]
          intended_professions?: string[]
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
          legal_review_notes?: string | null
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
          scenario_type?: string | null
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
          difficulty_target?: string | null
          facet_id?: string | null
          id?: string
          information_available_sv?: string | null
          information_withheld_sv?: string | null
          intended_forms?: string[]
          intended_professions?: string[]
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
          legal_review_notes?: string | null
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
          scenario_type?: string | null
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
          id: string
          role_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string | null
          slug?: string
        }
        Relationships: [
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
          created_at: string
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
          created_at?: string
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
          created_at?: string
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
      admin_cancel_assessment_assignment: {
        Args: { _assignment_id: string; _reason: string }
        Returns: {
          id: string
          new_status: string
          previous_status: string
        }[]
      }
      admin_set_platform_role: {
        Args: { _grant: boolean; _role: string; _target_user_id: string }
        Returns: {
          granted: boolean
          granted_role: string
          target_user_id: string
        }[]
      }
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
      cd_begin_internal_test_session: {
        Args: {
          _context_status?: string
          _definition_version_id: string
          _locale?: string
        }
        Returns: string
      }
      cd_complete_session:
        | { Args: { _session_id: string }; Returns: undefined }
        | {
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
      cd_session_core_completion: {
        Args: { _session_id: string }
        Returns: {
          answered: number
          expected: number
          missing: string[]
          unexpected: string[]
        }[]
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
      job_is_active: {
        Args: {
          p_deadline_at: string
          p_expires_at: string
          p_published_at: string
          p_status: string
        }
        Returns: boolean
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
      scp_bundle_version_assignability: {
        Args: { _bundle_version_id: string }
        Returns: {
          assignability: string
          reason: string
        }[]
      }
      scp_can_author: { Args: { _user_id: string }; Returns: boolean }
      scp_complete_human_review: {
        Args: {
          _contribution?: number
          _outcome: string
          _rationale: string
          _review_id: string
          _safety_severity?: string
        }
        Returns: string
      }
      scp_complete_learning_module: {
        Args: { _attempt_id: string }
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
      scp_employer_assign: {
        Args: {
          _assessment_version_id: string
          _deadline?: string
          _employer_id: string
          _language?: string
          _recipient_email: string
        }
        Returns: {
          assignment_id: string
          attempt_id: string
          subject_id: string
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
      scp_employer_review_pressure: {
        Args: { _employer_id: string }
        Returns: {
          attempts_blocked: number
          awaiting_review: number
        }[]
      }
      scp_get_attempt_items: {
        Args: { _attempt_id: string; _language?: string }
        Returns: {
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
      scp_has_content_role: {
        Args: { _role: string; _user_id: string }
        Returns: boolean
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
      scp_release_attempt_report: {
        Args: { _attempt_id: string }
        Returns: {
          employer_snapshot: string
          participant_snapshot: string
        }[]
      }
      scp_resolve_participant_identity: {
        Args: { _employer_id: string; _subject_id: string }
        Returns: {
          display_email: string
          released: boolean
          subject_id: string
        }[]
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
      scp_subject_progress: {
        Args: { _subject_id: string }
        Returns: {
          attempt_id: string
          competency_code: string
          competency_name_en: string
          competency_name_sv: string
          maturity_level: string
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
      set_application_status: {
        Args: { _application_id: string; _new_status: string; _note?: string }
        Returns: {
          application_id: string
          new_status: string
          previous_status: string
          updated_at: string
        }[]
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
    },
  },
} as const
