import type { Database, Json } from "@/integrations/supabase/types";
import { AnalysisFailure, checked } from "../analysis-services";
import { requireWorkspace, type SecurityWorkCaller } from "../services";
import type * as inputs from "./inputs";
import {
  canTransition,
  evidenceLinkKinds,
  parseBrief,
  systemOnlyStates,
  type ExecutionState,
  type MissionKind,
} from "./model";

type Tables = Database["public"]["Tables"];
export type Mission = Tables["sw_missions"]["Row"];
export type MissionLink = Tables["sw_mission_links"]["Row"];
export type MissionEvent = Tables["sw_mission_events"]["Row"];
export interface MissionSummary extends Mission {
  evidenceCount: number;
  linkCount: number;
}
export interface LinkedRecord {
  link: MissionLink;
  title: string | null;
  status: string | null;
}
export interface MissionDetail {
  mission: Mission;
  members: { user_id: string; email: string | null }[];
  links: LinkedRecord[];
  events: MissionEvent[];
}

const LIMIT = 501;
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

/** Every mission this person may see; restricted ones only for their circle (RLS). */
export async function listMissions(
  caller: SecurityWorkCaller,
  workspaceId: string,
): Promise<MissionSummary[]> {
  await access(caller, workspaceId);
  const [missions, links] = await Promise.all([
    caller.supabase
      .from("sw_missions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(LIMIT),
    caller.supabase
      .from("sw_mission_links")
      .select("mission_id,target_kind")
      .eq("workspace_id", workspaceId)
      .limit(5000),
  ]);
  const rows = checked(missions) ?? [];
  if (rows.length >= LIMIT) throw new AnalysisFailure("LIST_LIMIT");
  const linkRows = checked(links) ?? [];
  return rows.map((mission) => {
    const own = linkRows.filter((link) => link.mission_id === mission.id);
    return {
      ...mission,
      linkCount: own.length,
      evidenceCount: own.filter((link) =>
        (evidenceLinkKinds as readonly string[]).includes(link.target_kind),
      ).length,
    };
  });
}

export async function createMission(
  caller: SecurityWorkCaller,
  data: inputs.CreateMissionInput,
): Promise<Mission> {
  await access(caller, data.workspaceId, true);
  const brief = parseBrief(data.kind as MissionKind, data.brief);
  const profile = checked(
    await caller.supabase
      .from("sw_operating_profiles")
      .select("profile_version")
      .eq("workspace_id", data.workspaceId)
      .order("profile_version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  const row = checked(
    await caller.supabase
      .from("sw_missions")
      .insert({
        workspace_id: data.workspaceId,
        kind: data.kind,
        title: data.title,
        restricted: data.restricted,
        brief: brief as unknown as Json,
        owner_id: caller.userId,
        // The mission records which version of the operating context it began from.
        operating_profile_version: profile?.profile_version ?? null,
      })
      .select("*")
      .single(),
  );
  if (!row) throw new AnalysisFailure("SAVE_FAILED");
  return row;
}

async function readMission(caller: SecurityWorkCaller, workspaceId: string, missionId: string) {
  const mission = checked(
    await caller.supabase
      .from("sw_missions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", missionId)
      .maybeSingle(),
  );
  // Absent and not-permitted look the same: a restricted mission is not acknowledged.
  if (!mission) throw new AnalysisFailure("ACCESS_DENIED");
  return mission;
}

const linkTables: Record<string, { table: string; title: string; status: string | null }> = {
  asset: { table: "sw_protected_assets", title: "name", status: "status" },
  risk: { table: "sw_risks", title: "title", status: "status" },
  action: { table: "sw_actions", title: "title", status: "status" },
  gap: { table: "sw_gaps", title: "title", status: "status" },
  source: { table: "sw_sources", title: "name", status: null },
  source_item: { table: "sw_source_items", title: "original_title", status: "retrieval_status" },
  assessment: { table: "sw_assessments", title: "title", status: "status" },
  report: { table: "sw_reports", title: "title", status: "status" },
  management_report: { table: "sw_management_reports", title: "title", status: "status" },
  requirement: { table: "sw_intelligence_requirements", title: "question", status: "status" },
};

export async function getMission(
  caller: SecurityWorkCaller,
  data: { workspaceId: string; missionId: string },
): Promise<MissionDetail> {
  await access(caller, data.workspaceId);
  const mission = await readMission(caller, data.workspaceId, data.missionId);
  const [members, links, events, directory] = await Promise.all([
    caller.supabase
      .from("sw_mission_members")
      .select("user_id")
      .eq("workspace_id", data.workspaceId)
      .eq("mission_id", mission.id)
      .limit(200),
    caller.supabase
      .from("sw_mission_links")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("mission_id", mission.id)
      .order("created_at")
      .limit(500),
    caller.supabase
      .from("sw_mission_events")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("mission_id", mission.id)
      .order("id", { ascending: false })
      .limit(200),
    caller.supabase.rpc("sw_list_members", { _workspace_id: data.workspaceId }),
  ]);
  const emails = new Map((checked(directory) ?? []).map((row) => [row.user_id, row.email]));
  const linkRows = checked(links) ?? [];
  const resolved: LinkedRecord[] = [];
  for (const [kind, spec] of Object.entries(linkTables)) {
    const wanted = linkRows.filter((link) => link.target_kind === kind);
    if (!wanted.length) continue;
    // Each record is read through the caller's own RLS: a link never reveals more.
    const { data: rows, error } = await caller.supabase
      .from(spec.table as "sw_risks")
      .select(`id,${spec.title}${spec.status ? `,${spec.status}` : ""}` as "id")
      .eq("workspace_id", data.workspaceId)
      .in(
        "id",
        wanted.map((link) => link.target_id),
      );
    if (error) throw new AnalysisFailure("SAVE_FAILED");
    const byId = new Map(
      ((rows ?? []) as unknown as Record<string, string | null>[]).map((row) => [row.id, row]),
    );
    for (const link of wanted) {
      const row = byId.get(link.target_id);
      resolved.push({
        link,
        title: row ? (row[spec.title] ?? null) : null,
        status: row && spec.status ? (row[spec.status] ?? null) : null,
      });
    }
  }
  return {
    mission,
    members: (checked(members) ?? []).map((member) => ({
      user_id: member.user_id,
      email: emails.get(member.user_id) ?? null,
    })),
    links: resolved,
    events: checked(events) ?? [],
  };
}

export async function updateMission(
  caller: SecurityWorkCaller,
  data: inputs.UpdateMissionInput,
): Promise<Mission> {
  await access(caller, data.workspaceId, true);
  const current = await readMission(caller, data.workspaceId, data.missionId);
  const patch: Tables["sw_missions"]["Update"] = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.brief !== undefined)
    patch.brief = parseBrief(current.kind as MissionKind, data.brief) as unknown as Json;
  if (data.ownerId !== undefined) patch.owner_id = data.ownerId;
  if (data.nextAction !== undefined) patch.next_action = data.nextAction;
  if (data.dueDate !== undefined) patch.due_date = data.dueDate;
  if (data.restricted !== undefined) patch.restricted = data.restricted;
  const row = checked(
    await caller.supabase
      .from("sw_missions")
      .update(patch)
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.missionId)
      .eq("version", data.version)
      .select("*")
      .maybeSingle(),
  );
  if (!row) throw new AnalysisFailure("CONFLICT");
  return row;
}

export async function transitionMission(
  caller: SecurityWorkCaller,
  data: inputs.TransitionMissionInput,
): Promise<Mission> {
  await access(caller, data.workspaceId, true);
  const current = await readMission(caller, data.workspaceId, data.missionId);
  if (current.version !== data.version) throw new AnalysisFailure("CONFLICT");
  if (data.executionState) {
    // People never press "running" or record a failure; the processing runtime does.
    if ((systemOnlyStates as readonly string[]).includes(data.executionState))
      throw new AnalysisFailure("INVALID_INPUT");
    const reviewAfter = data.reviewState ?? current.review_state;
    if (
      !canTransition(
        { execution_state: current.execution_state, review_state: reviewAfter },
        data.executionState as ExecutionState,
      )
    )
      throw new AnalysisFailure("INVALID_INPUT");
  }
  const row = checked(
    await caller.supabase
      .from("sw_missions")
      .update({
        ...(data.executionState ? { execution_state: data.executionState } : {}),
        ...(data.reviewState ? { review_state: data.reviewState } : {}),
      })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.missionId)
      .eq("version", data.version)
      .select("*")
      .maybeSingle(),
  );
  if (!row) throw new AnalysisFailure("CONFLICT");
  return row;
}

export async function setMissionMember(
  caller: SecurityWorkCaller,
  data: inputs.MissionMemberInput,
): Promise<{ member: boolean }> {
  await access(caller, data.workspaceId, true);
  checked(
    await caller.supabase.rpc("sw_set_mission_member", {
      _workspace_id: data.workspaceId,
      _mission_id: data.missionId,
      _user_id: data.userId,
      _member: data.member,
    }),
  );
  return { member: data.member };
}

export async function addMissionLink(
  caller: SecurityWorkCaller,
  data: inputs.MissionLinkInput,
): Promise<MissionLink> {
  await access(caller, data.workspaceId, true);
  const inserted = await caller.supabase
    .from("sw_mission_links")
    .insert({
      workspace_id: data.workspaceId,
      mission_id: data.missionId,
      target_kind: data.targetKind,
      target_id: data.targetId,
      note: data.note,
    })
    .select("*")
    .single();
  if (inserted.error?.code === "23505") {
    const existing = checked(
      await caller.supabase
        .from("sw_mission_links")
        .select("*")
        .eq("workspace_id", data.workspaceId)
        .eq("mission_id", data.missionId)
        .eq("target_kind", data.targetKind)
        .eq("target_id", data.targetId)
        .maybeSingle(),
    );
    if (existing) return existing;
  }
  const row = checked(inserted);
  if (!row) throw new AnalysisFailure("SAVE_FAILED");
  return row;
}

export async function removeMissionLink(
  caller: SecurityWorkCaller,
  data: inputs.RemoveMissionLinkInput,
): Promise<{ removed: boolean }> {
  await access(caller, data.workspaceId, true);
  const rows = checked(
    await caller.supabase
      .from("sw_mission_links")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("mission_id", data.missionId)
      .eq("id", data.linkId)
      .select("id"),
  );
  return { removed: Boolean(rows?.length) };
}
