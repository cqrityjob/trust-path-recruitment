import type { Json } from "@/integrations/supabase/types";
import { AnalysisFailure, checked } from "../analysis-services";
import { requireWorkspace, type SecurityWorkCaller } from "../services";
import type { SaveOperatingProfileInput, SavePreferenceInput } from "./inputs";
import {
  OPERATING_PROFILE_SCHEMA,
  UnknownProfileSchema,
  confirmedOnly,
  emptyProfile,
  prefillFrom,
  readProfile,
  type OperatingProfile,
  type Prefill,
  type Provenance,
} from "./schema";

export interface OperatingContext {
  current: {
    version: number;
    profile: OperatingProfile;
    provenance: Provenance;
    createdAt: string;
    createdBy: string;
  } | null;
  /** True when a stored version uses a schema this build cannot read. */
  unreadable: boolean;
  history: { version: number; createdAt: string; createdBy: string; changeNote: string }[];
  prefill: Prefill;
  roleFocus: string;
}

async function access(caller: SecurityWorkCaller, workspaceId: string, edit = false) {
  try {
    return await requireWorkspace(caller, workspaceId, edit);
  } catch (error) {
    throw new AnalysisFailure(
      error instanceof Error && "code" in error && error.code === "ACCESS_DENIED"
        ? "ACCESS_DENIED"
        : "SAVE_FAILED",
    );
  }
}

export async function readOperatingContext(
  caller: SecurityWorkCaller,
  workspaceId: string,
): Promise<OperatingContext> {
  await access(caller, workspaceId);
  const db = caller.supabase;
  const [versions, mandate, assets, monitoring, preference] = await Promise.all([
    db
      .from("sw_operating_profiles")
      .select("profile_version,schema_version,profile,provenance,created_at,created_by,change_note")
      .eq("workspace_id", workspaceId)
      .order("profile_version", { ascending: false })
      .limit(50),
    db
      .from("sw_security_mandates")
      .select("organisation_description,geographic_scope")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    db
      .from("sw_protected_assets")
      .select("name,category,status")
      .eq("workspace_id", workspaceId)
      .limit(200),
    db
      .from("sw_monitoring_profiles")
      .select("sector,countries,threat_categories")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    db
      .from("sw_member_preferences")
      .select("role_focus")
      .eq("workspace_id", workspaceId)
      .eq("user_id", caller.userId)
      .maybeSingle(),
  ]);
  const rows = checked(versions) ?? [];
  let current: OperatingContext["current"] = null;
  let unreadable = false;
  if (rows[0]) {
    try {
      current = {
        version: rows[0].profile_version,
        profile: readProfile(rows[0].schema_version, rows[0].profile),
        provenance: (rows[0].provenance ?? {}) as Provenance,
        createdAt: rows[0].created_at,
        createdBy: rows[0].created_by,
      };
    } catch (error) {
      if (!(error instanceof UnknownProfileSchema)) throw new AnalysisFailure("SAVE_FAILED");
      unreadable = true;
    }
  }
  return {
    current,
    unreadable,
    history: rows.map((row) => ({
      version: row.profile_version,
      createdAt: row.created_at,
      createdBy: row.created_by,
      changeNote: row.change_note,
    })),
    prefill: prefillFrom({
      mandate: checked(mandate),
      assets: checked(assets) ?? [],
      monitoring: checked(monitoring),
    }),
    roleFocus: checked(preference)?.role_focus ?? "combined",
  };
}

/** Writes the next version. A stale starting version is a conflict, never a fork. */
export async function saveOperatingProfile(
  caller: SecurityWorkCaller,
  data: SaveOperatingProfileInput,
): Promise<{ version: number }> {
  await access(caller, data.workspaceId, true);
  const { profile, provenance } = confirmedOnly(data.profile, data.provenance);
  const stamped: Provenance = {};
  for (const [field, entry] of Object.entries(provenance))
    stamped[field] =
      entry.origin !== "user" && entry.confirmed && !entry.confirmedBy
        ? { ...entry, confirmedBy: caller.userId, confirmedAt: new Date().toISOString() }
        : entry;
  const inserted = await caller.supabase
    .from("sw_operating_profiles")
    .insert({
      workspace_id: data.workspaceId,
      profile_version: data.expectedVersion + 1,
      schema_version: OPERATING_PROFILE_SCHEMA,
      profile: profile as unknown as Json,
      provenance: stamped as unknown as Json,
      change_note: data.changeNote,
    })
    .select("profile_version")
    .single();
  const row = checked(inserted);
  if (!row) throw new AnalysisFailure("SAVE_FAILED");
  return { version: row.profile_version };
}

export async function savePreference(caller: SecurityWorkCaller, data: SavePreferenceInput) {
  await access(caller, data.workspaceId);
  // Only role_focus/updated_at are updatable, so no upsert (it would re-set the key).
  const updated = checked(
    await caller.supabase
      .from("sw_member_preferences")
      .update({ role_focus: data.roleFocus, updated_at: new Date().toISOString() })
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", caller.userId)
      .select("role_focus"),
  );
  if (!updated?.length) {
    const inserted = await caller.supabase.from("sw_member_preferences").insert({
      workspace_id: data.workspaceId,
      user_id: caller.userId,
      role_focus: data.roleFocus,
    });
    if (inserted.error?.code === "23505") return savePreference(caller, data);
    checked(inserted);
  }
  return { roleFocus: data.roleFocus };
}

export { emptyProfile };
