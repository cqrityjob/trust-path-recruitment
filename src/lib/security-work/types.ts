import type { Database } from "@/integrations/supabase/types";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Workspace = Row<"sw_workspaces">;
export type Membership = Row<"sw_workspace_memberships">;
export type Profile = Row<"sw_monitoring_profiles">;
export type Requirement = Row<"sw_intelligence_requirements">;
export type Source = Row<"sw_sources">;
export type SourceItem = Row<"sw_source_items">;
export type IntelligenceItem = Row<"sw_intelligence_items">;
export type AuditEvent = Row<"sw_audit_events">;

export type SWErrorCode =
  | "ACCESS_DENIED"
  | "CONFLICT"
  | "REQUIREMENT_IN_USE"
  | "INVALID_INPUT"
  | "SAVE_FAILED"
  | "INBOX_PENDING"
  | "SOURCE_INACTIVE"
  | "REFERENCE_CHANGED"
  | "IDEMPOTENCY_CONFLICT";
export type Result<T> = { ok: true; data: T } | { ok: false; code: SWErrorCode };
export type WorkspaceSnapshot = {
  workspace: Workspace;
  membership: Membership;
  profile: Profile | null;
  requirements: Requirement[];
  sources: Source[];
  counts: { pending: number; totalItems: number };
};
export type SourceItemsPage = {
  sourceItems: SourceItem[];
  intelligenceItems: IntelligenceItem[];
  total: number;
  nextOffset: number | null;
};
export type SavedSourceItem = { sourceItemId: string; intelligenceItemId: string };
