import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  AddSourceItemInput,
  CreateWorkspaceInput,
  DecideItemInput,
  DeleteRequirementInput,
  RetryInboxInput,
  SaveProfileInput,
  SaveRequirementInput,
  SaveSourceInput,
  SaveWorkspaceInput,
} from "./inputs";
import type {
  AuditEvent,
  IntelligenceItem,
  Membership,
  Profile,
  Requirement,
  Result,
  SavedSourceItem,
  Source,
  SourceItem,
  SourceItemsPage,
  SWErrorCode,
  Workspace,
  WorkspaceSnapshot,
} from "./types";

/** Supplied only by requireSupabaseAuth: a verified subject and its RLS client.
 * No administrator client, provider, organisation or Career authorization here. */
export type SecurityWorkCaller = { supabase: SupabaseClient<Database>; userId: string };
class WorkError extends Error {
  constructor(readonly code: SWErrorCode) {
    super(code);
  }
}
function fail(code: SWErrorCode): never {
  throw new WorkError(code);
}
function check(error: { code?: string } | null) {
  if (!error) return;
  if (["42501", "PGRST301", "PGRST303"].includes(error.code ?? "")) fail("ACCESS_DENIED");
  if (error.code === "23505") fail("CONFLICT");
  if (["23514", "22001", "22P02", "23503"].includes(error.code ?? "")) fail("INVALID_INPUT");
  fail("SAVE_FAILED");
}
/** Never return raw database errors, input text or internal identifiers in errors. */
export async function workResult<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return { ok: false, code: error instanceof WorkError ? error.code : "SAVE_FAILED" };
  }
}
export async function requireWorkspace(
  caller: SecurityWorkCaller,
  workspaceId: string,
  edit = false,
): Promise<Membership> {
  const { data, error } = await caller.supabase
    .from("sw_workspace_memberships")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", caller.userId)
    .eq("active", true)
    .maybeSingle();
  check(error);
  if (!data || (edit && data.role !== "owner" && data.role !== "editor")) fail("ACCESS_DENIED");
  return data;
}
async function changedOrConflict<T>(
  caller: SecurityWorkCaller,
  workspaceId: string,
  data: T | null,
): Promise<T> {
  if (data !== null) return data;
  // A membership change can win between our precheck and the RLS write.
  // Distinguish that from a stale version, so callers clear protected caches.
  await requireWorkspace(caller, workspaceId, true);
  return fail("CONFLICT");
}

export async function readEntry(caller: SecurityWorkCaller): Promise<{ workspaces: Workspace[] }> {
  const { data, error, count } = await caller.supabase
    .from("sw_workspaces")
    .select("*", { count: "exact" })
    .order("created_at")
    .limit(1000);
  check(error);
  if (!data || count === null || data.length !== count) fail("SAVE_FAILED");
  return { workspaces: data };
}
export async function createWorkspace(
  caller: SecurityWorkCaller,
  input: CreateWorkspaceInput,
): Promise<{ workspaceId: string }> {
  const { data, error } = await caller.supabase.rpc("sw_create_personal_workspace", {
    _name: input.name,
  });
  check(error);
  if (!data) fail("SAVE_FAILED");
  await requireWorkspace(caller, data);
  return { workspaceId: data };
}
export async function readWorkspace(
  caller: SecurityWorkCaller,
  workspaceId: string,
): Promise<WorkspaceSnapshot> {
  await requireWorkspace(caller, workspaceId);
  const [workspace, profile, requirements, sources, pending, total] = await Promise.all([
    caller.supabase.from("sw_workspaces").select("*").eq("id", workspaceId).maybeSingle(),
    caller.supabase
      .from("sw_monitoring_profiles")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    caller.supabase
      .from("sw_intelligence_requirements")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("created_at")
      .limit(1000),
    caller.supabase
      .from("sw_sources")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("created_at")
      .limit(1000),
    caller.supabase
      .from("sw_intelligence_items")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending"),
    caller.supabase
      .from("sw_source_items")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
  ]);
  for (const result of [workspace, profile, requirements, sources, pending, total])
    check(result.error);
  if (!workspace.data) fail("ACCESS_DENIED");
  // Refuse an oversized catalogue rather than silently treating truncation as
  // a complete list. The inbox is separately paginated, including orphan facts.
  if (
    !requirements.data ||
    !sources.data ||
    requirements.data.length !== requirements.count ||
    sources.data.length !== sources.count ||
    pending.count === null ||
    total.count === null
  )
    fail("SAVE_FAILED");
  const membership = await requireWorkspace(caller, workspaceId);
  return {
    workspace: workspace.data,
    membership,
    profile: profile.data,
    requirements: requirements.data,
    sources: sources.data,
    counts: { pending: pending.count, totalItems: total.count },
  };
}
export async function listSourceItems(
  caller: SecurityWorkCaller,
  input: { workspaceId: string; offset: number; sourceId?: string },
): Promise<SourceItemsPage> {
  await requireWorkspace(caller, input.workspaceId);
  let query = caller.supabase
    .from("sw_source_items")
    .select("*", { count: "exact" })
    .eq("workspace_id", input.workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (input.sourceId) query = query.eq("source_id", input.sourceId);
  const facts = await query.range(input.offset, input.offset + 49);
  check(facts.error);
  const sourceItems = facts.data ?? [];
  let intelligenceItems: IntelligenceItem[] = [];
  if (sourceItems.length) {
    const items = await caller.supabase
      .from("sw_intelligence_items")
      .select("*")
      .eq("workspace_id", input.workspaceId)
      .in(
        "source_item_id",
        sourceItems.map((row) => row.id),
      );
    check(items.error);
    intelligenceItems = items.data ?? [];
  }
  await requireWorkspace(caller, input.workspaceId);
  if (facts.count === null) fail("SAVE_FAILED");
  const total = facts.count;
  return {
    sourceItems,
    intelligenceItems,
    total,
    nextOffset:
      input.offset + sourceItems.length < total ? input.offset + sourceItems.length : null,
  };
}
export async function itemHistory(
  caller: SecurityWorkCaller,
  workspaceId: string,
  intelligenceItemId: string,
): Promise<AuditEvent[]> {
  await requireWorkspace(caller, workspaceId);
  const exists = await caller.supabase
    .from("sw_intelligence_items")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", intelligenceItemId)
    .maybeSingle();
  check(exists.error);
  if (!exists.data) fail("ACCESS_DENIED");
  const history = await caller.supabase
    .from("sw_audit_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("entity_table", "sw_intelligence_items")
    .eq("entity_id", intelligenceItemId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  check(history.error);
  await requireWorkspace(caller, workspaceId);
  return history.data ?? [];
}
export async function saveWorkspace(
  caller: SecurityWorkCaller,
  input: SaveWorkspaceInput,
): Promise<Workspace> {
  const membership = await requireWorkspace(caller, input.workspaceId, true);
  if (membership.role !== "owner") fail("ACCESS_DENIED");
  const result = await caller.supabase
    .from("sw_workspaces")
    .update({ name: input.name, language: input.language })
    .eq("id", input.workspaceId)
    .eq("owner_user_id", caller.userId)
    .eq("version", input.version)
    .select("*")
    .maybeSingle();
  check(result.error);
  return changedOrConflict(caller, input.workspaceId, result.data);
}
export async function saveProfile(
  caller: SecurityWorkCaller,
  input: SaveProfileInput,
): Promise<Profile> {
  const { workspaceId, id, version, ...fields } = input;
  await requireWorkspace(caller, workspaceId, true);
  const result = id
    ? await caller.supabase
        .from("sw_monitoring_profiles")
        .update(fields)
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .eq("version", version!)
        .select("*")
        .maybeSingle()
    : await caller.supabase
        .from("sw_monitoring_profiles")
        .insert({ ...fields, workspace_id: workspaceId, created_by: caller.userId })
        .select("*")
        .single();
  check(result.error);
  return changedOrConflict(caller, workspaceId, result.data);
}
export async function saveRequirement(
  caller: SecurityWorkCaller,
  input: SaveRequirementInput,
): Promise<Requirement> {
  const { workspaceId, id, version, ...fields } = input;
  await requireWorkspace(caller, workspaceId, true);
  const result = id
    ? await caller.supabase
        .from("sw_intelligence_requirements")
        .update(fields)
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .eq("version", version!)
        .select("*")
        .maybeSingle()
    : await caller.supabase
        .from("sw_intelligence_requirements")
        .insert({ ...fields, workspace_id: workspaceId, created_by: caller.userId })
        .select("*")
        .single();
  check(result.error);
  return changedOrConflict(caller, workspaceId, result.data);
}
export async function deleteRequirement(
  caller: SecurityWorkCaller,
  input: DeleteRequirementInput,
): Promise<{ deleted: true }> {
  await requireWorkspace(caller, input.workspaceId, true);
  const result = await caller.supabase
    .from("sw_intelligence_requirements")
    .delete()
    .eq("workspace_id", input.workspaceId)
    .eq("id", input.id)
    .eq("version", input.version)
    .select("id")
    .maybeSingle();
  if (result.error?.code === "23503") fail("REQUIREMENT_IN_USE");
  check(result.error);
  await changedOrConflict(caller, input.workspaceId, result.data);
  return { deleted: true };
}
export async function saveSource(
  caller: SecurityWorkCaller,
  input: SaveSourceInput,
): Promise<Source> {
  const { workspaceId, id, version, ...fields } = input;
  await requireWorkspace(caller, workspaceId, true);
  const result = id
    ? await caller.supabase
        .from("sw_sources")
        .update(fields)
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .eq("version", version!)
        .select("*")
        .maybeSingle()
    : await caller.supabase
        .from("sw_sources")
        .insert({ ...fields, workspace_id: workspaceId, created_by: caller.userId })
        .select("*")
        .single();
  check(result.error);
  return changedOrConflict(caller, workspaceId, result.data);
}
async function requireSource(
  caller: SecurityWorkCaller,
  workspaceId: string,
  sourceId: string,
  requireActive: boolean,
) {
  const source = await caller.supabase
    .from("sw_sources")
    .select("id, active")
    .eq("workspace_id", workspaceId)
    .eq("id", sourceId)
    .maybeSingle();
  check(source.error);
  if (!source.data) {
    await requireWorkspace(caller, workspaceId, true);
    fail("REFERENCE_CHANGED");
  }
  if (requireActive && !source.data.active) fail("SOURCE_INACTIVE");
}
async function requireRequirement(
  caller: SecurityWorkCaller,
  workspaceId: string,
  requirementId: string | null,
) {
  if (!requirementId) return;
  const requirement = await caller.supabase
    .from("sw_intelligence_requirements")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", requirementId)
    .maybeSingle();
  check(requirement.error);
  if (!requirement.data) {
    await requireWorkspace(caller, workspaceId, true);
    fail("REFERENCE_CHANGED");
  }
}
function sameFacts(row: SourceItem, input: AddSourceItemInput): boolean {
  return (
    row.source_id === input.sourceId &&
    row.deduplication_key === `manual:${input.requestId}` &&
    row.original_title === input.original_title &&
    row.publisher === input.publisher &&
    row.canonical_url === input.canonical_url &&
    row.author === input.author &&
    (row.published_at === null
      ? input.published_at === null
      : input.published_at !== null &&
        Date.parse(row.published_at) === Date.parse(input.published_at)) &&
    row.factual_extract === input.factual_extract &&
    row.language === input.language &&
    JSON.stringify(row.geography) === JSON.stringify(input.geography)
  );
}
async function completeInbox(
  caller: SecurityWorkCaller,
  sourceItem: SourceItem,
  input: Pick<RetryInboxInput, "requirementId" | "urgency">,
): Promise<SavedSourceItem> {
  await requireWorkspace(caller, sourceItem.workspace_id, true);
  // Never upsert: a retry cannot change an existing source fact or human decision.
  const existing = await caller.supabase
    .from("sw_intelligence_items")
    .select("*")
    .eq("workspace_id", sourceItem.workspace_id)
    .eq("source_item_id", sourceItem.id)
    .maybeSingle();
  check(existing.error);
  if (existing.data) {
    if (
      existing.data.requirement_id !== input.requirementId ||
      existing.data.urgency !== input.urgency
    )
      fail("IDEMPOTENCY_CONFLICT");
    return { sourceItemId: sourceItem.id, intelligenceItemId: existing.data.id };
  }
  await requireRequirement(caller, sourceItem.workspace_id, input.requirementId);
  const saved = await caller.supabase
    .from("sw_intelligence_items")
    .insert({
      workspace_id: sourceItem.workspace_id,
      source_item_id: sourceItem.id,
      title: sourceItem.original_title,
      requirement_id: input.requirementId,
      urgency: input.urgency,
      created_by: caller.userId,
    })
    .select("*")
    .single();
  if (saved.error?.code === "23505") {
    const winner = await caller.supabase
      .from("sw_intelligence_items")
      .select("*")
      .eq("workspace_id", sourceItem.workspace_id)
      .eq("source_item_id", sourceItem.id)
      .maybeSingle();
    check(winner.error);
    if (!winner.data) fail("INBOX_PENDING");
    if (winner.data.requirement_id !== input.requirementId || winner.data.urgency !== input.urgency)
      fail("IDEMPOTENCY_CONFLICT");
    return { sourceItemId: sourceItem.id, intelligenceItemId: winner.data.id };
  }
  if (saved.error || !saved.data) {
    if (["42501", "PGRST301", "PGRST303"].includes(saved.error?.code ?? "")) fail("ACCESS_DENIED");
    fail("INBOX_PENDING");
  }
  return { sourceItemId: sourceItem.id, intelligenceItemId: saved.data.id };
}
export async function addSourceItem(
  caller: SecurityWorkCaller,
  input: AddSourceItemInput,
): Promise<SavedSourceItem> {
  await requireWorkspace(caller, input.workspaceId, true);
  const deduplicationKey = `manual:${input.requestId}`;
  // The request UUID is also the primary key: even concurrent retries that
  // change source cannot create a second original under this request identity.
  const find = () =>
    caller.supabase
      .from("sw_source_items")
      .select("*")
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.requestId)
      .maybeSingle();
  const prior = await find();
  check(prior.error);
  let original = prior.data;
  if (!original) {
    await requireSource(caller, input.workspaceId, input.sourceId, true);
    await requireRequirement(caller, input.workspaceId, input.requirementId);
    const inserted = await caller.supabase
      .from("sw_source_items")
      .insert({
        id: input.requestId,
        workspace_id: input.workspaceId,
        source_id: input.sourceId,
        deduplication_key: deduplicationKey,
        original_title: input.original_title,
        publisher: input.publisher,
        canonical_url: input.canonical_url,
        author: input.author,
        published_at: input.published_at,
        factual_extract: input.factual_extract,
        language: input.language,
        geography: input.geography,
        created_by: caller.userId,
      })
      .select("*")
      .single();
    if (inserted.error?.code === "23505") {
      const winner = await find();
      check(winner.error);
      original = winner.data;
    } else {
      check(inserted.error);
      original = inserted.data;
    }
  }
  if (!original) fail("SAVE_FAILED");
  if (!sameFacts(original, input)) fail("IDEMPOTENCY_CONFLICT");
  return resumeSavedOriginal(caller, original, input);
}
async function resumeSavedOriginal(
  caller: SecurityWorkCaller,
  original: SourceItem,
  input: Pick<RetryInboxInput, "requirementId" | "urgency">,
): Promise<SavedSourceItem> {
  try {
    return await completeInbox(caller, original, input);
  } catch (error) {
    if (
      error instanceof WorkError &&
      ["ACCESS_DENIED", "IDEMPOTENCY_CONFLICT"].includes(error.code)
    )
      throw error;
    // Facts have committed. Missing/deleted requirements or transport failures
    // cannot be reported as an unsaved form or a lost workspace membership.
    return fail("INBOX_PENDING");
  }
}
export async function retryInboxItem(
  caller: SecurityWorkCaller,
  input: RetryInboxInput,
): Promise<SavedSourceItem> {
  await requireWorkspace(caller, input.workspaceId, true);
  const original = await caller.supabase
    .from("sw_source_items")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("id", input.sourceItemId)
    .maybeSingle();
  check(original.error);
  if (!original.data) fail("ACCESS_DENIED");
  return resumeSavedOriginal(caller, original.data, input);
}
export async function decideItem(
  caller: SecurityWorkCaller,
  input: DecideItemInput,
): Promise<IntelligenceItem> {
  await requireWorkspace(caller, input.workspaceId, true);
  const result = await caller.supabase
    .from("sw_intelligence_items")
    .update({ status: input.status, human_rationale: input.human_rationale })
    .eq("workspace_id", input.workspaceId)
    .eq("id", input.id)
    .eq("version", input.version)
    .neq("status", input.status)
    .select("*")
    .maybeSingle();
  check(result.error);
  return changedOrConflict(caller, input.workspaceId, result.data);
}
