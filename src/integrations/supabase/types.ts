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
      assessment_runs: {
        Row: {
          assessment_id: string
          assessment_version_id: string
          completed_at: string | null
          created_at: string
          graph_version: string
          id: string
          locale: string
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
        }
        Insert: {
          assessment_id: string
          disclaimer_version: string
          id?: string
          model_version: string
          notes?: string | null
          published_at?: string
          retired_at?: string | null
        }
        Update: {
          assessment_id?: string
          disclaimer_version?: string
          id?: string
          model_version?: string
          notes?: string | null
          published_at?: string
          retired_at?: string | null
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
          id: string
          kind: string
          name_en: string
          name_sv: string
        }
        Insert: {
          created_at?: string
          id: string
          kind: string
          name_en: string
          name_sv: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name_en?: string
          name_sv?: string
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
          content_status: Database["public"]["Enums"]["cig_content_status"]
          created_at: string
          description_en: string | null
          description_sv: string | null
          graph_version: string
          id: string
          last_verified: string | null
          slug: string
          title_en: string
          title_sv: string
          updated_at: string
          valid_from: string
        }
        Insert: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version: string
          id?: string
          last_verified?: string | null
          slug: string
          title_en: string
          title_sv: string
          updated_at?: string
          valid_from?: string
        }
        Update: {
          content_status?: Database["public"]["Enums"]["cig_content_status"]
          created_at?: string
          description_en?: string | null
          description_sv?: string | null
          graph_version?: string
          id?: string
          last_verified?: string | null
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
      employers: {
        Row: {
          country: string | null
          created_at: string
          description_en: string | null
          description_sv: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
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
          slug: string
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
          slug?: string
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
          content_hash: string | null
          country: string | null
          created_at: string
          deadline_at: string | null
          description_en: string | null
          description_sv: string | null
          driving_licence_required: boolean
          employer_id: string
          employer_type: string | null
          employment_type: string | null
          experience_level: string | null
          expires_at: string | null
          family_id: string | null
          formal_requirement_ids: string[]
          id: string
          language_requirements: string[]
          location_text: string | null
          night_work: boolean | null
          profession_slug: string | null
          published_at: string | null
          region: string | null
          regulated: boolean
          related_profession_slugs: string[]
          requirements: Json | null
          responsibilities: Json | null
          sector: string | null
          security_vetting_mentioned: boolean
          shift_work: boolean | null
          short_id: string
          slug: string
          source_id: string | null
          source_job_id: string | null
          source_url: string | null
          status: string
          title_en: string | null
          title_sv: string | null
          travel_required: boolean | null
          updated_at: string
          workplace_type: string | null
        }
        Insert: {
          application_email?: string | null
          application_method: string
          application_url?: string | null
          benefits?: Json | null
          canonical_url?: string | null
          city?: string | null
          content_hash?: string | null
          country?: string | null
          created_at?: string
          deadline_at?: string | null
          description_en?: string | null
          description_sv?: string | null
          driving_licence_required?: boolean
          employer_id: string
          employer_type?: string | null
          employment_type?: string | null
          experience_level?: string | null
          expires_at?: string | null
          family_id?: string | null
          formal_requirement_ids?: string[]
          id?: string
          language_requirements?: string[]
          location_text?: string | null
          night_work?: boolean | null
          profession_slug?: string | null
          published_at?: string | null
          region?: string | null
          regulated?: boolean
          related_profession_slugs?: string[]
          requirements?: Json | null
          responsibilities?: Json | null
          sector?: string | null
          security_vetting_mentioned?: boolean
          shift_work?: boolean | null
          short_id: string
          slug: string
          source_id?: string | null
          source_job_id?: string | null
          source_url?: string | null
          status?: string
          title_en?: string | null
          title_sv?: string | null
          travel_required?: boolean | null
          updated_at?: string
          workplace_type?: string | null
        }
        Update: {
          application_email?: string | null
          application_method?: string
          application_url?: string | null
          benefits?: Json | null
          canonical_url?: string | null
          city?: string | null
          content_hash?: string | null
          country?: string | null
          created_at?: string
          deadline_at?: string | null
          description_en?: string | null
          description_sv?: string | null
          driving_licence_required?: boolean
          employer_id?: string
          employer_type?: string | null
          employment_type?: string | null
          experience_level?: string | null
          expires_at?: string | null
          family_id?: string | null
          formal_requirement_ids?: string[]
          id?: string
          language_requirements?: string[]
          location_text?: string | null
          night_work?: boolean | null
          profession_slug?: string | null
          published_at?: string | null
          region?: string | null
          regulated?: boolean
          related_profession_slugs?: string[]
          requirements?: Json | null
          responsibilities?: Json | null
          sector?: string | null
          security_vetting_mentioned?: boolean
          shift_work?: boolean | null
          short_id?: string
          slug?: string
          source_id?: string | null
          source_job_id?: string | null
          source_url?: string | null
          status?: string
          title_en?: string | null
          title_sv?: string | null
          travel_required?: boolean | null
          updated_at?: string
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
      [_ in never]: never
    }
    Functions: {
      assert_cig_family_id: { Args: { p_family_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      cig_content_status: "draft" | "published" | "archived"
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
      cig_content_status: ["draft", "published", "archived"],
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
