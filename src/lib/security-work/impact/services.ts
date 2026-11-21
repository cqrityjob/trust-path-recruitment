import type { Database, Json } from "@/integrations/supabase/types";
import { AnalysisFailure, checked } from "../analysis-services";
import { coverage, type Coverage } from "../knowledge/coverage";
import { assessRelevance, type Relevance } from "../knowledge/relevance";
import { readProfile, type OperatingProfile } from "../operating-context/schema";
import { requireWorkspace, type SecurityWorkCaller } from "../services";
import type * as inputs from "./inputs";

type Tables = Database["public"]["Tables"];
export type ChangeBrief = Tables["sw_change_briefs"]["Row"];
export type ReviewFlag = Tables["sw_review_flags"]["Row"];
export type BriefApplication = Tables["sw_change_brief_applications"]["Row"];
export interface Development {
  itemId: string;
  sourceId: string;
  sourceName: string;
  title: string;
  publisher: string;
  url: string | null;
  publishedAt: string | null;
  observedAt: string | null;
  retrievedAt: string;
  excerpt: string;
  clusterId: string | null;
  independentSources: number;
  hasCopies: boolean;
  relevance: Relevance;
}
export interface ImpactOverview {
  coverage: Coverage;
  approvedHosts: { host: string; publisher: string; terms_reference: string }[];
  developments: Development[];
  briefs: ChangeBrief[];
  openFlags: ReviewFlag[];
  profileVersion: number | null;
}
export interface BriefDetail {
  brief: ChangeBrief;
  application: BriefApplication | null;
  followUp: {
    risk: { id: string; title: string; status: string } | null;
    actions: {
      id: string;
      title: string;
      status: string;
      due_date: string | null;
      priority: string;
    }[];
  };
  flags: ReviewFlag[];
  revisions: { id: string; status: string; title: string }[];
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

async function latestProfile(caller: SecurityWorkCaller, workspaceId: string) {
  const row = checked(
    await caller.supabase
      .from("sw_operating_profiles")
      .select("profile_version,schema_version,profile")
      .eq("workspace_id", workspaceId)
      .order("profile_version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (!row) return { version: null, profile: null as OperatingProfile | null };
  try {
    return { version: row.profile_version, profile: readProfile(row.schema_version, row.profile) };
  } catch {
    // An unreadable profile gives no relevance basis; it never invents one.
    return { version: row.profile_version, profile: null };
  }
}

export async function readImpact(
  caller: SecurityWorkCaller,
  workspaceId: string,
): Promise<ImpactOverview> {
  await access(caller, workspaceId);
  const db = caller.supabase;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [sources, hosts, items, briefs, flags, assets, profile] = await Promise.all([
    db
      .from("sw_sources")
      .select(
        "id,name,source_type,active,poll_target_minutes,last_checked_at,last_success_at,last_failure_at,last_failure",
      )
      .eq("workspace_id", workspaceId)
      .limit(500),
    db.from("sw_feed_hosts").select("host,publisher,terms_reference").eq("active", true).limit(200),
    db
      .from("sw_source_items")
      .select(
        "id,source_id,original_title,publisher,canonical_url,published_at,observed_at,retrieved_at,factual_extract",
      )
      .eq("workspace_id", workspaceId)
      .eq("retrieval_status", "fetched")
      .gte("retrieved_at", since)
      .order("retrieved_at", { ascending: false })
      .limit(100),
    db
      .from("sw_change_briefs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(200),
    db
      .from("sw_review_flags")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .limit(200),
    db
      .from("sw_protected_assets")
      .select("name")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .limit(200),
    latestProfile(caller, workspaceId),
  ]);
  const sourceRows = checked(sources) ?? [];
  const itemRows = checked(items) ?? [];
  const links = itemRows.length
    ? (checked(
        await db
          .from("sw_cluster_items")
          .select("source_item_id,cluster_id")
          .eq("workspace_id", workspaceId)
          .in(
            "source_item_id",
            itemRows.map((item) => item.id),
          ),
      ) ?? [])
    : [];
  const clusterIds = [...new Set(links.map((link) => link.cluster_id))];
  const clusters = clusterIds.length
    ? (checked(
        await db
          .from("sw_story_clusters")
          .select("id,independent_sources,has_copies")
          .eq("workspace_id", workspaceId)
          .in("id", clusterIds),
      ) ?? [])
    : [];
  const assetNames = (checked(assets) ?? []).map((asset) => asset.name);
  const names = new Map(sourceRows.map((source) => [source.id, source.name]));
  return {
    coverage: coverage(sourceRows, new Date()),
    approvedHosts: checked(hosts) ?? [],
    developments: itemRows.map((item) => {
      const clusterId = links.find((link) => link.source_item_id === item.id)?.cluster_id ?? null;
      const cluster = clusters.find((row) => row.id === clusterId);
      return {
        itemId: item.id,
        sourceId: item.source_id,
        sourceName: names.get(item.source_id) ?? "",
        title: item.original_title,
        publisher: item.publisher,
        url: item.canonical_url,
        publishedAt: item.published_at,
        observedAt: item.observed_at,
        retrievedAt: item.retrieved_at,
        excerpt: item.factual_extract.slice(0, 400),
        clusterId,
        independentSources: cluster?.independent_sources ?? 1,
        hasCopies: cluster?.has_copies ?? false,
        relevance: assessRelevance(
          { title: item.original_title, text: item.factual_extract },
          { profile: profile.profile, assets: assetNames },
        ),
      };
    }),
    briefs: checked(briefs) ?? [],
    openFlags: checked(flags) ?? [],
    profileVersion: profile.version,
  };
}

const briefColumns = (
  data: Omit<inputs.CreateBriefInput, "workspaceId" | "missionId" | "clusterId">,
) => ({
  title: data.title,
  what_changed: data.whatChanged,
  known: data.known,
  why_it_matters: data.whyItMatters,
  uncertain: data.uncertain,
  proposed_actions: data.proposedActions as unknown as Json,
  evidence_item_ids: data.evidenceItemIds,
  relevance: data.relevance as Json,
});

export async function createBrief(
  caller: SecurityWorkCaller,
  data: inputs.CreateBriefInput,
): Promise<ChangeBrief> {
  await access(caller, data.workspaceId, true);
  const { version } = await latestProfile(caller, data.workspaceId);
  const row = checked(
    await caller.supabase
      .from("sw_change_briefs")
      .insert({
        workspace_id: data.workspaceId,
        mission_id: data.missionId,
        cluster_id: data.clusterId,
        operating_profile_version: version,
        ...briefColumns(data),
      })
      .select("*")
      .single(),
  );
  if (!row) throw new AnalysisFailure("SAVE_FAILED");
  return row;
}

export async function updateBrief(
  caller: SecurityWorkCaller,
  data: inputs.UpdateBriefInput,
): Promise<ChangeBrief> {
  await access(caller, data.workspaceId, true);
  const row = checked(
    await caller.supabase
      .from("sw_change_briefs")
      .update(briefColumns(data))
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.briefId)
      .eq("version", data.version)
      .eq("status", "draft")
      .select("*")
      .maybeSingle(),
  );
  if (!row) throw new AnalysisFailure("CONFLICT");
  return row;
}

export async function transitionBrief(
  caller: SecurityWorkCaller,
  data: inputs.TransitionBriefInput,
): Promise<ChangeBrief> {
  await access(caller, data.workspaceId, true);
  const row = checked(
    await caller.supabase
      .from("sw_change_briefs")
      .update({ status: data.status, decision_note: data.decisionNote })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.briefId)
      .eq("version", data.version)
      .select("*")
      .maybeSingle(),
  );
  if (!row) throw new AnalysisFailure("CONFLICT");
  return row;
}

/** A new draft of an approved brief; the approved one stays until the revision is approved. */
export async function reviseBrief(
  caller: SecurityWorkCaller,
  data: { workspaceId: string; briefId: string },
): Promise<ChangeBrief> {
  await access(caller, data.workspaceId, true);
  const source = checked(
    await caller.supabase
      .from("sw_change_briefs")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.briefId)
      .maybeSingle(),
  );
  if (!source) throw new AnalysisFailure("ACCESS_DENIED");
  if (source.status !== "approved") throw new AnalysisFailure("CONFLICT");
  const flagged = (
    checked(
      await caller.supabase
        .from("sw_review_flags")
        .select("source_item_id")
        .eq("workspace_id", data.workspaceId)
        .eq("brief_id", source.id)
        .eq("status", "open"),
    ) ?? []
  ).map((flag) => flag.source_item_id);
  const { version } = await latestProfile(caller, data.workspaceId);
  const row = checked(
    await caller.supabase
      .from("sw_change_briefs")
      .insert({
        workspace_id: data.workspaceId,
        mission_id: source.mission_id,
        requirement_id: source.requirement_id,
        cluster_id: source.cluster_id,
        supersedes_id: source.id,
        title: source.title,
        what_changed: source.what_changed,
        known: source.known,
        why_it_matters: source.why_it_matters,
        uncertain: source.uncertain,
        proposed_actions: source.proposed_actions,
        relevance: source.relevance,
        // The new evidence that raised the flags is cited from the start.
        evidence_item_ids: [...new Set([...source.evidence_item_ids, ...flagged])],
        operating_profile_version: version,
      })
      .select("*")
      .single(),
  );
  if (!row) throw new AnalysisFailure("SAVE_FAILED");
  return row;
}

export async function applyBrief(
  caller: SecurityWorkCaller,
  data: inputs.ApplyBriefInput,
): Promise<BriefApplication> {
  await access(caller, data.workspaceId, true);
  const row = checked(
    await caller.supabase.rpc("sw_apply_change_brief", {
      _workspace_id: data.workspaceId,
      _brief_id: data.briefId,
      _expected_version: data.version,
      _request_id: data.requestId,
      _apply: { risk: data.risk, actions: data.actions } as unknown as Json,
    }),
  );
  if (!row) throw new AnalysisFailure("SAVE_FAILED");
  return row;
}

export async function resolveFlag(
  caller: SecurityWorkCaller,
  data: inputs.ResolveFlagInput,
): Promise<ReviewFlag> {
  await access(caller, data.workspaceId, true);
  const row = checked(
    await caller.supabase
      .from("sw_review_flags")
      .update({ status: "resolved", resolution_note: data.note })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.flagId)
      .eq("status", "open")
      .select("*")
      .maybeSingle(),
  );
  if (!row) throw new AnalysisFailure("CONFLICT");
  return row;
}

export async function getBrief(
  caller: SecurityWorkCaller,
  data: { workspaceId: string; briefId: string },
): Promise<BriefDetail> {
  await access(caller, data.workspaceId);
  const db = caller.supabase;
  const brief = checked(
    await db
      .from("sw_change_briefs")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.briefId)
      .maybeSingle(),
  );
  // A brief the person may not see answers like one that does not exist.
  if (!brief) throw new AnalysisFailure("ACCESS_DENIED");
  const [application, flags, revisions] = await Promise.all([
    db
      .from("sw_change_brief_applications")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("brief_id", brief.id)
      .maybeSingle(),
    db
      .from("sw_review_flags")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("brief_id", brief.id)
      .limit(100),
    db
      .from("sw_change_briefs")
      .select("id,status,title")
      .eq("workspace_id", data.workspaceId)
      .eq("supersedes_id", brief.id)
      .limit(20),
  ]);
  const applied = checked(application);
  let followUp: BriefDetail["followUp"] = { risk: null, actions: [] };
  if (applied) {
    const [risk, actions] = await Promise.all([
      applied.risk_id
        ? db
            .from("sw_risks")
            .select("id,title,status")
            .eq("workspace_id", data.workspaceId)
            .eq("id", applied.risk_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      applied.action_ids.length
        ? db
            .from("sw_actions")
            .select("id,title,status,due_date,priority")
            .eq("workspace_id", data.workspaceId)
            .in("id", applied.action_ids)
        : Promise.resolve({ data: [], error: null }),
    ]);
    followUp = { risk: checked(risk), actions: checked(actions) ?? [] };
  }
  return {
    brief,
    application: applied,
    followUp,
    flags: checked(flags) ?? [],
    revisions: checked(revisions) ?? [],
  };
}

export async function createFeedSource(
  caller: SecurityWorkCaller,
  data: inputs.CreateFeedSourceInput,
) {
  await access(caller, data.workspaceId, true);
  const host = new URL(data.feedUrl).hostname.toLowerCase();
  const approved = checked(
    await caller.supabase
      .from("sw_feed_hosts")
      .select("host,publisher")
      .eq("host", host)
      .eq("active", true)
      .maybeSingle(),
  );
  // Refused before the database is asked, with a reason a person can act on.
  if (!approved) throw new AnalysisFailure("FEED_HOST_NOT_APPROVED");
  const row = checked(
    await caller.supabase
      .from("sw_sources")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        publisher: approved.publisher,
        source_type: "official_feed",
        feed_url: data.feedUrl,
        reliability_category: "official",
        poll_target_minutes: data.pollTargetMinutes,
      })
      .select("id,name")
      .single(),
  );
  if (!row) throw new AnalysisFailure("SAVE_FAILED");
  return row;
}
