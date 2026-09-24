// Executes the actual application services against real local GoTrue/PostgREST.
// Fixtures are synthetic; test administration never enters application code.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import * as service from "../src/lib/security-work/services";
import * as input from "../src/lib/security-work/inputs";
import type { SWErrorCode } from "../src/lib/security-work/types";

const api = new URL(process.env.SW_API_URL ?? "https://invalid.invalid");
const database = new URL(process.env.SW_DATABASE_URL ?? "https://invalid.invalid");
const key = process.env.SW_ANON_KEY;
if (
  process.env.E2E_LOCAL_STACK !== "1" ||
  !key ||
  api.protocol !== "http:" ||
  !["postgres:", "postgresql:"].includes(database.protocol) ||
  !["localhost", "127.0.0.1"].includes(api.hostname) ||
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  api.port !== "57321" ||
  database.port !== "57322" ||
  database.pathname !== "/postgres"
) {
  throw new Error("Security Work checks require the dedicated isolated local stack on 57321/57322");
}
const psql = process.env.SW_PSQL_BIN ?? "psql";
function sql(query: string): string {
  return execFileSync(psql, [database.toString(), "-XAt", "-v", "ON_ERROR_STOP=1", "-c", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
const marker = "SW-SERVICE-" + randomUUID();
let assertions = 0;
function ok(condition: unknown, label: string): asserts condition {
  assert.ok(condition, label);
  assertions++;
  console.log(`  ok ${label}`);
}
async function refused(code: SWErrorCode, operation: () => Promise<unknown>, label: string) {
  const result = await service.workResult(operation);
  ok(!result.ok && result.code === code, `${label} (${code})`);
}
async function login(actor: string) {
  const client = createClient<Database>(api.toString(), key!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const result = await client.auth.signInWithPassword({
    email: `sw-service-${actor}@example.test`,
    password: "LocalJourney!2026",
  });
  if (result.error || !result.data.user || !result.data.session)
    throw new Error(`Local fixture login failed: ${actor}`);
  // Local GoTrue/PostgREST clocks can straddle the issued-at second. Wait only
  // for this exact authentication-readiness error; never retry a failed test or
  // a mutation and never relax JWT verification in application or database.
  for (let attempt = 0; ; attempt++) {
    const probe = await client.from("sw_workspaces").select("id").limit(0);
    if (!probe.error) break;
    if (
      attempt >= 10 ||
      probe.error.code !== "PGRST303" ||
      probe.error.message !== "JWT issued at future"
    ) {
      throw new Error(`Local token readiness failed: ${probe.error.code}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { supabase: client, userId: result.data.user.id, token: result.data.session.access_token };
}
const [a, b, viewer, revoked] = await Promise.all(["a", "b", "viewer", "revoked"].map(login));
ok(
  Number(
    sql(
      `SELECT count(*) FROM auth.sessions WHERE user_id IN ('${a.userId}','${b.userId}','${viewer.userId}','${revoked.userId}')`,
    ),
  ) >= 4,
  "real GoTrue sessions exist",
);
const [first, repeated] = await Promise.all([
  service.createWorkspace(a, { name: marker }),
  service.createWorkspace(a, { name: marker }),
]);
const workspaceId = first.workspaceId;
const otherWorkspaceId = (
  await service.createWorkspace(b, { name: "Independent professional context" })
).workspaceId;
ok(workspaceId === repeated.workspaceId, "concurrent onboarding returns one workspace");
ok(
  sql(
    `SELECT count(*) FROM public.sw_workspaces WHERE owner_user_id='${a.userId}' AND kind='personal'`,
  ) === "1",
  "one personal workspace stored",
);
ok(workspaceId !== otherWorkspaceId, "same product keeps independent users separate");
const claims = JSON.stringify({ sub: a.userId, role: "authenticated" });
function asOwner(query: string) {
  return sql(`BEGIN; SELECT set_config('request.jwt.claims','${claims}',true); ${query}; COMMIT;`);
}
asOwner(`INSERT INTO public.sw_workspace_memberships(workspace_id,user_id,role,active) VALUES
 ('${workspaceId}','${viewer.userId}','viewer',true),('${workspaceId}','${revoked.userId}','editor',true)
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role,active=true`);
ok(
  (await service.readEntry(a)).workspaces.some((x) => x.id === workspaceId),
  "owner entry contains own workspace",
);
ok(
  !(await service.readEntry(b)).workspaces.some((x) => x.id === workspaceId),
  "other user's entry excludes workspace",
);
await refused(
  "ACCESS_DENIED",
  () => service.readWorkspace(b, workspaceId),
  "B cannot read A through service",
);
await refused(
  "ACCESS_DENIED",
  () => service.listSourceItems(b, { workspaceId, offset: 0 }),
  "B cannot enumerate A's originals",
);
let snapshot = await service.readWorkspace(a, workspaceId);
const renamed = await service.saveWorkspace(a, {
  workspaceId,
  version: snapshot.workspace.version,
  name: marker,
  language: "en",
});
ok(
  renamed.version === snapshot.workspace.version + 1,
  "workspace update advances database version",
);
await refused(
  "CONFLICT",
  () =>
    service.saveWorkspace(a, {
      workspaceId,
      version: snapshot.workspace.version,
      name: "stale",
      language: "sv",
    }),
  "stale workspace edit refused",
);
const profileFields = {
  workspaceId,
  sector: "Synthetic events",
  countries: ["Sweden"],
  regions: ["North"],
  important_locations: ["Fictional hall"],
  important_functions: ["Duty manager"],
  critical_operations: ["Entry"],
  assets: ["Personnel"],
  threat_categories: ["Disruption"],
  frequency: "manual" as const,
  decisions_supported: "Access planning",
  onboarding_completed: false,
};
const profile = await service.saveProfile(a, {
  ...profileFields,
  ...(snapshot.profile ? { id: snapshot.profile.id, version: snapshot.profile.version } : {}),
});
ok(
  profile.important_locations[0] === "Fictional hall",
  "partial onboarding persists existing schema fields",
);
const completed = await service.saveProfile(a, {
  ...profileFields,
  id: profile.id,
  version: profile.version,
  onboarding_completed: true,
});
ok(
  completed.onboarding_completed && completed.version === profile.version + 1,
  "onboarding completes without another workspace",
);
await refused(
  "CONFLICT",
  () => service.saveProfile(a, { ...profileFields, id: profile.id, version: profile.version }),
  "stale profile edit refused",
);
await refused(
  "ACCESS_DENIED",
  () =>
    service.saveProfile(viewer, { ...profileFields, id: profile.id, version: completed.version }),
  "viewer service write denied",
);
const requirementFields = {
  workspaceId,
  question: marker + " Could access be disrupted?",
  decision_supported: "Staff access",
  priority: "high" as const,
  status: "active" as const,
  horizon_days: 30,
};
const requirement = await service.saveRequirement(a, requirementFields);
const paused = await service.saveRequirement(a, {
  ...requirementFields,
  id: requirement.id,
  version: requirement.version,
  status: "paused",
});
ok(paused.status === "paused", "requirement pause persists");
await refused(
  "CONFLICT",
  () =>
    service.saveRequirement(a, {
      ...requirementFields,
      id: requirement.id,
      version: requirement.version,
    }),
  "stale requirement edit refused",
);
const active = await service.saveRequirement(a, {
  ...requirementFields,
  id: requirement.id,
  version: paused.version,
});
const unused = await service.saveRequirement(a, {
  ...requirementFields,
  question: marker + " unused",
});
ok(
  (await service.deleteRequirement(a, { workspaceId, id: unused.id, version: unused.version }))
    .deleted,
  "unused requirement can be deleted",
);
const sourceFields = {
  workspaceId,
  name: marker + " manual source",
  publisher: "Synthetic publisher",
  source_type: "url_reference" as const,
  canonical_url: "https://example.test/original",
  language: "sv" as const,
  geography: ["Sweden"],
  topics: ["Access"],
  reliability_category: "observation" as const,
  usage_notes: "Synthetic local test",
  active: true,
};
const source = await service.saveSource(a, sourceFields);
const secondSource = await service.saveSource(a, {
  ...sourceFields,
  name: marker + " another source",
});
const facts = {
  workspaceId,
  sourceId: source.id,
  requestId: randomUUID(),
  original_title: marker + " source facts",
  publisher: "Original publisher",
  canonical_url: "https://example.test/reference",
  author: "Synthetic author",
  published_at: "2026-09-23T11:00:00+02:00",
  factual_extract: "<script>window.__swInjected=true</script> Untrusted source text.",
  language: "sv" as const,
  geography: ["Fictional location"],
  requirementId: requirement.id,
  urgency: "soon" as const,
};
const saved = await service.addSourceItem(a, facts);
const retried = await service.addSourceItem(a, facts);
ok(
  saved.sourceItemId === facts.requestId && saved.intelligenceItemId === retried.intelligenceItemId,
  "stable request identity deduplicates source and inbox",
);
await refused(
  "IDEMPOTENCY_CONFLICT",
  () => service.addSourceItem(a, { ...facts, factual_extract: "Changed text" }),
  "retry cannot silently replace original facts",
);
await refused(
  "IDEMPOTENCY_CONFLICT",
  () => service.addSourceItem(a, { ...facts, sourceId: secondSource.id }),
  "retry under another source cannot create another original",
);
await refused(
  "IDEMPOTENCY_CONFLICT",
  () => service.addSourceItem(a, { ...facts, urgency: "urgent" }),
  "retry cannot silently change inbox intent",
);
const racingFacts = {
  ...facts,
  requestId: randomUUID(),
  original_title: marker + " concurrent source choice",
};
const raced = await Promise.all([
  service.workResult(() => service.addSourceItem(a, racingFacts)),
  service.workResult(() => service.addSourceItem(a, { ...racingFacts, sourceId: secondSource.id })),
]);
ok(
  raced.filter((x) => x.ok).length === 1 &&
    raced.some((x) => !x.ok && x.code === "IDEMPOTENCY_CONFLICT"),
  "concurrent changed-source retry has one original and an explicit conflict",
);
const changedSource = await service.saveSource(a, {
  ...sourceFields,
  id: source.id,
  version: source.version,
  publisher: "Updated catalogue publisher",
});
await refused(
  "CONFLICT",
  () => service.saveSource(a, { ...sourceFields, id: source.id, version: source.version }),
  "stale source edit refused",
);
await refused(
  "ACCESS_DENIED",
  () => service.saveSource(b, { ...sourceFields, id: source.id, version: changedSource.version }),
  "B cannot change A's source through service",
);
await refused(
  "ACCESS_DENIED",
  () => service.addSourceItem(b, { ...facts, requestId: randomUUID() }),
  "B cannot insert into A's workspace through service",
);
let page = await service.listSourceItems(a, { workspaceId, sourceId: source.id, offset: 0 });
const original = page.sourceItems.find((x) => x.id === saved.sourceItemId)!;
ok(
  original.publisher === "Original publisher" && original.factual_extract === facts.factual_extract,
  "source catalogue edit leaves recorded facts untouched",
);
ok(
  page.intelligenceItems.some((x) => x.id === saved.intelligenceItemId),
  "manual facts are visible in the inbox",
);
await refused(
  "REQUIREMENT_IN_USE",
  () => service.deleteRequirement(a, { workspaceId, id: active.id, version: active.version }),
  "linked requirement deletion explains history constraint",
);
const item = page.intelligenceItems.find((x) => x.id === saved.intelligenceItemId)!;
const relevant = await service.decideItem(a, {
  workspaceId,
  id: item.id,
  version: item.version,
  status: "relevant",
  human_rationale: "Human first decision",
});
ok(
  relevant.decided_by === a.userId && relevant.human_rationale === "Human first decision",
  "decision attributed by database",
);
await refused(
  "CONFLICT",
  () =>
    service.decideItem(a, {
      workspaceId,
      id: item.id,
      version: item.version,
      status: "dismissed",
      human_rationale: "Stale decision",
    }),
  "concurrent stale triage denied",
);
await refused(
  "CONFLICT",
  () =>
    service.decideItem(a, {
      workspaceId,
      id: item.id,
      version: relevant.version,
      status: "relevant",
      human_rationale: "Rewrite attribution",
    }),
  "same-state rationale cannot be rewritten",
);
const dismissed = await service.decideItem(a, {
  workspaceId,
  id: item.id,
  version: relevant.version,
  status: "dismissed",
  human_rationale: "Human revised decision",
});
const history = await service.itemHistory(a, workspaceId, item.id);
ok(
  JSON.stringify(history).includes("Human first decision") &&
    JSON.stringify(history).includes("Human revised decision"),
  "immutable decision history retains both rationales",
);
ok(dismissed.version > relevant.version, "revised decision has a new version");
await refused(
  "ACCESS_DENIED",
  () => service.itemHistory(b, workspaceId, item.id),
  "B cannot read decision history",
);
const bOriginal = await b.supabase.from("sw_source_items").select("*").eq("id", original.id);
ok(!bOriginal.error && bOriginal.data?.length === 0, "direct Data API hides A's original from B");
const bMutation = await b.supabase
  .from("sw_sources")
  .update({ name: "forged" })
  .eq("id", source.id)
  .select("id");
ok(
  Boolean(bMutation.error) || bMutation.data?.length === 0,
  "B cannot mutate A's source through direct Data API",
);
const membershipEscalation = await viewer.supabase
  .from("sw_workspace_memberships")
  .update({ role: "owner", can_approve: true })
  .eq("workspace_id", workspaceId)
  .eq("user_id", viewer.userId);
ok(
  Boolean(membershipEscalation.error),
  "viewer cannot escalate membership through direct Data API",
);
const viewerWrite = await viewer.supabase
  .from("sw_intelligence_items")
  .update({ status: "relevant", human_rationale: "Forged" })
  .eq("id", item.id)
  .select("id");
ok(
  Boolean(viewerWrite.error) || viewerWrite.data?.length === 0,
  "viewer direct Data API cannot write",
);
const immutable = await a.supabase
  .from("sw_source_items")
  .update({ factual_extract: "tampered" })
  .eq("id", original.id);
ok(Boolean(immutable.error), "direct API cannot alter original facts");
const noHistoryRewrite = await a.supabase
  .from("sw_audit_events")
  .update({ details: {} })
  .eq("entity_id", item.id);
ok(Boolean(noHistoryRewrite.error), "direct API cannot alter history");
const crossWorkspace = await b.supabase.from("sw_intelligence_items").insert({
  workspace_id: otherWorkspaceId,
  source_item_id: original.id,
  title: "Cross-workspace injection",
});
ok(Boolean(crossWorkspace.error), "cross-workspace foreign key rejects injected reference");

// Real HTTP and database with one injected transport outage, not a fake store.
const removedRequirement = await service.saveRequirement(a, {
  ...requirementFields,
  question: marker + " removed before save",
});
await service.deleteRequirement(a, {
  workspaceId,
  id: removedRequirement.id,
  version: removedRequirement.version,
});
const beforeSave = { ...facts, requestId: randomUUID(), requirementId: removedRequirement.id };
await refused(
  "REFERENCE_CHANGED",
  () => service.addSourceItem(a, beforeSave),
  "deleted requirement before save is a reference conflict, not lost membership",
);
ok(
  (await a.supabase.from("sw_source_items").select("id").eq("id", beforeSave.requestId)).data
    ?.length === 0,
  "reference conflict before save creates no original",
);
ok(
  (await service.readWorkspace(a, workspaceId)).membership.active,
  "reference conflict retains valid workspace access",
);
const afterRequirement = await service.saveRequirement(a, {
  ...requirementFields,
  question: marker + " removed after original",
});
let removedAfterOriginal = false;
const referenceRaceClient = createClient<Database>(api.toString(), key!, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { Authorization: `Bearer ${a.token}` },
    fetch: async (url, init) => {
      const response = await fetch(url, init);
      if (
        !removedAfterOriginal &&
        response.ok &&
        String(url).includes("/rest/v1/sw_source_items") &&
        init?.method === "POST"
      ) {
        removedAfterOriginal = true;
        asOwner(
          `DELETE FROM public.sw_intelligence_requirements WHERE workspace_id='${workspaceId}' AND id='${afterRequirement.id}'`,
        );
      }
      return response;
    },
  },
});
const afterSave = { ...facts, requestId: randomUUID(), requirementId: afterRequirement.id };
await refused(
  "INBOX_PENDING",
  () => service.addSourceItem({ supabase: referenceRaceClient, userId: a.userId }, afterSave),
  "deleted requirement after saving facts preserves explicit orphan recovery",
);
ok(
  (await a.supabase.from("sw_source_items").select("id").eq("id", afterSave.requestId)).data
    ?.length === 1,
  "original survives deleted-reference race",
);
ok(
  (
    await service.retryInboxItem(a, {
      workspaceId,
      sourceItemId: afterSave.requestId,
      requirementId: null,
      urgency: "soon",
    })
  ).sourceItemId === afterSave.requestId,
  "orphan recovers with deliberate revised requirement selection",
);

let failedInbox = false;
const faultClient = createClient<Database>(api.toString(), key!, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { Authorization: `Bearer ${a.token}` },
    fetch: async (url, init) => {
      if (
        !failedInbox &&
        String(url).includes("/rest/v1/sw_intelligence_items") &&
        init?.method === "POST"
      ) {
        failedInbox = true;
        return new Response(
          JSON.stringify({ code: "503", message: "Synthetic transport outage" }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
      return fetch(url, init);
    },
  },
});
const interrupted = {
  ...facts,
  requestId: randomUUID(),
  original_title: marker + " interrupted after saving original",
};
await refused(
  "INBOX_PENDING",
  () => service.addSourceItem({ supabase: faultClient, userId: a.userId }, interrupted),
  "partial transport failure is explicit",
);
page = await service.listSourceItems(a, { workspaceId, sourceId: source.id, offset: 0 });
ok(
  page.sourceItems.some((x) => x.id === interrupted.requestId) &&
    !page.intelligenceItems.some((x) => x.source_item_id === interrupted.requestId),
  "saved orphan remains visible after fresh read",
);
const resumed = await service.retryInboxItem(a, {
  workspaceId,
  sourceItemId: interrupted.requestId,
  requirementId: requirement.id,
  urgency: "soon",
});
ok(resumed.sourceItemId === interrupted.requestId, "orphan resumes without another original");
ok(
  (await service.addSourceItem(a, interrupted)).intelligenceItemId === resumed.intelligenceItemId,
  "lost-response retry returns recovered inbox record",
);
// Real append-only records exercise paging, including timestamp ties.
const paginationSource = await service.saveSource(a, {
  ...sourceFields,
  name: marker + " pagination",
});
const bulk = await a.supabase.from("sw_source_items").insert(
  Array.from({ length: 51 }, (_, i) => ({
    workspace_id: workspaceId,
    source_id: paginationSource.id,
    deduplication_key: `${marker}:${i}`,
    original_title: `${marker} page ${i}`,
    factual_extract: "Synthetic pagination fixture",
    created_by: a.userId,
  })),
);
ok(!bulk.error, "51 synthetic originals stored for pagination proof");
const pageOne = await service.listSourceItems(a, {
  workspaceId,
  sourceId: paginationSource.id,
  offset: 0,
});
ok(
  pageOne.total === 51 && pageOne.sourceItems.length === 50 && pageOne.nextOffset === 50,
  "first inbox page reports exact total and next position",
);
const pageTwo = await service.listSourceItems(a, {
  workspaceId,
  sourceId: paginationSource.id,
  offset: pageOne.nextOffset!,
});
ok(
  pageTwo.sourceItems.length === 1 &&
    pageTwo.nextOffset === null &&
    !pageOne.sourceItems.some((x) => x.id === pageTwo.sourceItems[0].id),
  "second inbox page has no omission or duplicate at timestamp tie",
);
await service.saveSource(a, {
  ...sourceFields,
  id: source.id,
  version: changedSource.version,
  active: false,
});
await refused(
  "SOURCE_INACTIVE",
  () => service.addSourceItem(a, { ...facts, requestId: randomUUID() }),
  "inactive source rejects new material",
);
ok(
  (await service.addSourceItem(a, facts)).sourceItemId === original.id,
  "receipt retry works after source is paused",
);

// Revoke during the service's precheck/write gap. RLS denies the write; the
// application recheck must return ACCESS_DENIED rather than a stale-data error.
let revokedAtWrite = false;
const revocationClient = createClient<Database>(api.toString(), key!, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { Authorization: `Bearer ${revoked.token}` },
    fetch: async (url, init) => {
      if (
        !revokedAtWrite &&
        String(url).includes("/rest/v1/sw_monitoring_profiles") &&
        init?.method === "PATCH"
      ) {
        revokedAtWrite = true;
        asOwner(
          `UPDATE public.sw_workspace_memberships SET active=false WHERE workspace_id='${workspaceId}' AND user_id='${revoked.userId}'`,
        );
      }
      return fetch(url, init);
    },
  },
});
await refused(
  "ACCESS_DENIED",
  () =>
    service.saveProfile(
      { supabase: revocationClient, userId: revoked.userId },
      { ...profileFields, id: completed.id, version: completed.version },
    ),
  "revocation winning write race clears access rather than returning a version conflict",
);
await refused(
  "ACCESS_DENIED",
  () => service.readWorkspace(revoked, workspaceId),
  "revoked membership denied with still-valid JWT",
);
const afterRevoke = await revoked.supabase
  .from("sw_source_items")
  .select("*")
  .eq("workspace_id", workspaceId);
ok(!afterRevoke.error && afterRevoke.data?.length === 0, "revoked member direct Data API is empty");
const anon = createClient<Database>(api.toString(), key!, { auth: { persistSession: false } });
ok(
  Boolean((await anon.from("sw_workspaces").select("id")).error),
  "anonymous Data API has no domain grants",
);
const oldSession = a.token;
await a.supabase.auth.signOut();
const signedInAgain = await login("a");
ok(signedInAgain.token !== oldSession, "new sign-in creates a different session token");
snapshot = await service.readWorkspace(signedInAgain, workspaceId);
ok(
  snapshot.profile?.onboarding_completed && snapshot.profile.critical_operations[0] === "Entry",
  "profile persists after genuine logout/login",
);
ok(
  (
    await service.listSourceItems(signedInAgain, { workspaceId, sourceId: source.id, offset: 0 })
  ).intelligenceItems.some((x) => x.id === item.id && x.status === "dismissed"),
  "decision persists after genuine logout/login",
);

for (const url of [
  "javascript:alert(1)",
  "http://example.test",
  "https://user:secret@example.test",
  "data:text/html,hello",
]) {
  ok(!input.referenceUrl.safeParse(url).success, "unsafe reference scheme or credentials rejected");
}
ok(
  input.referenceUrl.safeParse("https://127.0.0.1/reference-only").success,
  "reference URL validation makes no fetching promise",
);
ok(
  !input.saveProfileInput.safeParse({ ...profileFields, userId: b.userId }).success,
  "user-editable caller identity rejected",
);
ok(
  !input.saveProfileInput.safeParse({ ...profileFields, id: profile.id }).success,
  "edit without expected version rejected",
);
ok(
  !input.decideItemInput.safeParse({
    workspaceId,
    id: item.id,
    version: 1,
    status: "approved",
    human_rationale: "AI",
  }).success,
  "approval cannot be smuggled into triage endpoint",
);
ok(
  !input.decideItemInput.safeParse({
    workspaceId,
    id: item.id,
    version: 1,
    status: "relevant",
    human_rationale: "🔒".repeat(501),
  }).success,
  "rationale UTF-8 byte limit enforced before database",
);
ok(
  !input.addSourceItemInput.safeParse({ ...facts, created_by: b.userId }).success,
  "creator attribution cannot be forged in input",
);
ok(
  !input.workspaceInput.safeParse({ workspaceId: "../another-user" }).success,
  "malicious workspace identifier rejected",
);
console.log(
  `Security Work service integration: ${assertions} assertions passed against real local GoTrue/PostgREST/PostgreSQL.`,
);
