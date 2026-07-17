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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
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
    },
  },
} as const
