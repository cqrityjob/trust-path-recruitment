// Executes the P1 PostgREST functions, never imports a product/model substitute.
// Disposable local synthetic fixture only. Does mutate A076 and confirms V2.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
const base = process.env.RI_P1_API_URL;
const secret = process.env.RI_P1_LOCAL_JWT_SECRET;
if (!base || !secret || !["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Disposable loopback P1 API and synthetic JWT secret required");
const employer = "ee100000-1111-4000-8000-000000000001",
  job = "ee100000-2222-4000-8000-000000000001";
const owner = "ee100000-0000-4000-8000-000000000001",
  member = "ee100000-0000-4000-8000-000000000003",
  stranger = "ee100000-0000-4000-8000-000000000004";
const app = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function jwt(sub, role = "authenticated") {
  const now = Math.floor(Date.now() / 1000);
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const unsigned = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ role, ...(sub ? { sub } : {}), aud: "authenticated", iat: now, exp: now + 3600 })}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}
async function rpc(name, data, sub = owner, role = "authenticated") {
  const started = performance.now();
  const response = await fetch(`${base}/rpc/${name}`, {
    // Bound the proof: a domain40001 retry loop must fail, never hang CI.
    signal: AbortSignal.timeout(8000),
    method: "POST",
    headers: { Authorization: `Bearer ${jwt(sub, role)}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return {
    status: response.status,
    body: await response.json(),
    elapsedMs: performance.now() - started,
  };
}
async function read(filters = {}, page = 1, around = null) {
  const res = await rpc("rec_ri_candidate_view", {
    _employer_id: employer,
    _job_id: job,
    _filters: { stage: "received", ...filters },
    _sort: "requirements",
    _dir: null,
    _page: page,
    _size: 25,
    _around: around,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}
let assertions = 0;
const ok = (label, fn) => {
  fn();
  assertions++;
  console.log(`ok ${label}`);
};
const pages = await Promise.all([1, 2, 3, 4].map((page) => read({}, page)));
ok("100 received / 27 reviewed / 73 remaining via real API", () => {
  const c = pages[0].intelligenceCounts;
  assert.equal(c.received, 100);
  assert.equal(c.reviewed, 27);
  assert.equal(c.remaining, 73);
  assert.deepEqual([c.green, c.yellow, c.gray], [40, 25, 35]);
});
const ordered = [
  ...Array.from({ length: 40 }, (_, i) => 40 - i),
  ...Array.from({ length: 25 }, (_, i) => 65 - i),
  ...Array.from({ length: 35 }, (_, i) => 100 - i),
].map(app);
ok("four complete pages, global color/date/id order and no duplicates", () => {
  const ids = pages.flatMap((p) => p.rows.map((r) => r.id));
  assert.deepEqual(ids, ordered);
  assert.equal(new Set(ids).size, 100);
  assert.deepEqual(
    pages.map((p) => p.rows.length),
    [25, 25, 25, 25],
  );
});
const [yellowRemaining, grayReviewed, ownerPage, lateSearch, around] = await Promise.all([
  read({ requirement: "yellow", review: "remaining" }),
  read({ requirement: "gray", review: "reviewed" }),
  read({ owner }),
  read({ q: "Synthetic A099" }),
  read({}, 1, app(16)),
]);
ok("global combined yellow remaining filter gives 18", () =>
  assert.equal(yellowRemaining.total, 18),
);
ok("gray reviewed filter includes its ten human-reviewed gaps", () =>
  assert.equal(grayReviewed.total, 10),
);
ok("owner filter counts all fifty before paging", () => assert.equal(ownerPage.total, 50));
ok("search finds candidate on last unfiltered page", () =>
  assert.equal(lateSearch.rows[0].id, app(99)),
);
ok("around neighbours cross page edge", () =>
  assert.deepEqual(
    around.rows.map((r) => r.id),
    [app(17), app(16), app(15)],
  ),
);
const memberRead = await rpc("rec_ri_get_review", { _application_id: app(76) }, member);
ok("authorized member can read but cannot manage", () => {
  assert.equal(memberRead.status, 200);
  assert.equal(memberRead.body.canManage, false);
});
const denied = await Promise.all([
  rpc(
    "rec_ri_confirm_profile",
    {
      _job_id: job,
      _expected_version: 1,
      _operation_id: randomUUID(),
      _start_date: null,
      _rules: [],
    },
    member,
  ),
  rpc("rec_ri_get_review", { _application_id: app(76) }, stranger),
  rpc("rec_ri_get_profile", { _job_id: job }, null, "anon"),
]);
ok("member write, outsider read, anonymous RPC denied by direct API", () => {
  for (const r of denied) assert.ok(r.status >= 400);
  assert.match(denied[0].body.message, /RECRUITMENT_NOT_PERMITTED/);
});
const assignmentOld = await rpc("rec_ri_get_review", { _application_id: app(75) });
assert.equal(assignmentOld.status, 200);
const av = assignmentOld.body;
const ad = av.criteria.map((c) => ({
  requirementId: c.requirementId,
  state: c.state,
  sourceKind: c.source?.kind ?? null,
  sourceReference: c.source?.reference ?? null,
  sourceVersion: c.source?.version ?? null,
  sourceLabel: c.source?.label ?? null,
  validUntil: c.validUntil,
  note: c.note ?? "Synthetic assigned review",
  neutralQuestion: c.neutralQuestion,
}));
const assignmentRace = await Promise.all([
  rpc("rec_set_application_responsible", {
    _application_id: app(75),
    _user_id: "ee100000-0000-4000-8000-000000000002",
    _expected_version: av.assignmentVersion,
  }),
  rpc("rec_ri_save_review", {
    _application_id: app(75),
    _profile_id: av.profile.profileId,
    _expected_revision: av.revision,
    _binding_token: av.bindingToken,
    _operation_id: randomUUID(),
    _decisions: ad,
    _confirm: true,
    _next_action: "Concurrent human follow-up",
    _responsible_user_id: owner,
    _expected_assignment_version: av.assignmentVersion,
  }),
]);
const assignmentCurrent = await rpc("rec_ri_get_review", { _application_id: app(75) });
ok("actual parallel legacy assignment/new review never overwrites new owner", () => {
  assert.equal(assignmentRace[0].status, 200);
  assert.equal(assignmentCurrent.body.responsibleUserId, "ee100000-0000-4000-8000-000000000002");
  if (assignmentRace[1].status !== 200) {
    assert.equal(assignmentRace[1].status, 409);
    assert.equal(assignmentRace[1].body.code, "PT409");
    assert.equal(assignmentRace[1].body.message, "STALE_VERSION");
  }
  assert.equal(assignmentCurrent.body.reviewState, "reviewed");
});
const domainConflicts = [];
const assertDomainConflict = (result, message) => {
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(result.body.code, "PT409");
  assert.equal(result.body.message, message);
  assert.ok(result.elapsedMs < 8000, "domain conflict must complete without an unbounded retry");
  domainConflicts.push({
    status: result.status,
    code: result.body.code,
    message,
    elapsedMs: Math.round(result.elapsedMs * 100) / 100,
  });
};
for (const responsible of [owner, "ee100000-0000-4000-8000-000000000002"]) {
  const staleAssignment = await rpc("rec_ri_save_review", {
    _application_id: app(75),
    _profile_id: assignmentCurrent.body.profile.profileId,
    _expected_revision: assignmentCurrent.body.revision,
    _binding_token: assignmentCurrent.body.bindingToken,
    _operation_id: randomUUID(),
    _decisions: ad,
    _confirm: true,
    _next_action: "Must not persist stale assignment draft",
    _responsible_user_id: responsible,
    _expected_assignment_version: av.assignmentVersion,
  });
  ok(
    `deterministic stale assignment ${responsible === owner ? "changed" : "unchanged"} target returns PT409 without retry`,
    () => assertDomainConflict(staleAssignment, "STALE_VERSION"),
  );
}
const afterStaleAssignment = await rpc("rec_ri_get_review", { _application_id: app(75) });
ok(
  "both 409 assignment refusals leave owner, review revision, action and assignment version unchanged",
  () => {
    for (const key of ["responsibleUserId", "revision", "nextAction", "assignmentVersion"])
      assert.deepEqual(afterStaleAssignment.body[key], assignmentCurrent.body[key]);
  },
);
const original = await rpc("rec_ri_get_review", { _application_id: app(76) });
assert.equal(original.status, 200);
const v = original.body;
const decisions = v.criteria.map((c) => ({
  requirementId: c.requirementId,
  state: c.state,
  sourceKind: c.source?.kind ?? null,
  sourceReference: c.source?.reference ?? null,
  sourceVersion: c.source?.version ?? null,
  sourceLabel: c.source?.label ?? null,
  validUntil: c.validUntil,
  note: c.note ?? "Explicit synthetic review",
  neutralQuestion: c.neutralQuestion,
}));
const payload = {
  _application_id: app(76),
  _profile_id: v.profile.profileId,
  _expected_revision: v.revision,
  _binding_token: v.bindingToken,
  _operation_id: randomUUID(),
  _decisions: decisions,
  _confirm: true,
  _next_action: "Verify unreadable original",
  _responsible_user_id: owner,
  _expected_assignment_version: v.assignmentVersion,
};
const oldProfile = await rpc("rec_ri_confirm_profile", {
  _job_id: job,
  _expected_version: 0,
  _operation_id: randomUUID(),
  _start_date: null,
  _rules: v.profile.rules,
});
ok("stale profile confirmation returns precise PT409", () =>
  assertDomainConflict(oldProfile, "RI_STALE_VERSION"),
);
const replacedProfile = await rpc("rec_ri_save_review", {
  ...payload,
  _profile_id: randomUUID(),
  _operation_id: randomUUID(),
});
ok("replaced profile reference returns precise PT409", () =>
  assertDomainConflict(replacedProfile, "RI_SOURCE_STALE"),
);
const staleBinding = await rpc("rec_ri_save_review", {
  ...payload,
  _binding_token: "stale-binding",
  _operation_id: randomUUID(),
});
ok("changed source binding returns precise PT409", () =>
  assertDomainConflict(staleBinding, "RI_SOURCE_STALE"),
);
const changedSource = decisions.map((decision, index) =>
  index === 0 ? { ...decision, sourceVersion: "stale-original-version" } : decision,
);
const staleOriginal = await rpc("rec_ri_save_review", {
  ...payload,
  _decisions: changedSource,
  _operation_id: randomUUID(),
});
ok("changed selected original version returns precise PT409", () =>
  assertDomainConflict(staleOriginal, "RI_SOURCE_STALE"),
);
const secondPayload = {
  ...payload,
  _operation_id: randomUUID(),
  _next_action: "Competing human draft",
};
const competition = await Promise.all([
  rpc("rec_ri_save_review", payload),
  rpc("rec_ri_save_review", secondPayload),
]);
ok("actual simultaneous HTTP review: one CAS winner, one stale refusal", () => {
  assert.deepEqual(competition.map((r) => r.status).sort(), [200, 409]);
  const loser = competition.find((r) => r.status === 409);
  assertDomainConflict(loser, "RI_STALE_VERSION");
  assert.equal(competition.find((r) => r.status === 200).body.revision, v.revision + 1);
});
const winningIndex = competition.findIndex((r) => r.status === 200);
const retry = await rpc("rec_ri_save_review", winningIndex === 0 ? payload : secondPayload);
ok("exact winning operation retry returns same revision", () =>
  assert.deepEqual(retry.body, competition[winningIndex].body),
);
const after = await read();
ok("winner contributes one reviewed application, never double counts", () => {
  assert.equal(after.intelligenceCounts.reviewed, 28);
  assert.equal(after.intelligenceCounts.received, 100);
});
async function originalRows(table, query) {
  const response = await fetch(`${base}/${table}?${query}`, {
    headers: { Authorization: `Bearer ${jwt(owner)}` },
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}
const [pack] = await originalRows("scp_interview_packs", "select=id&slug=eq.vaktare-se");
assert.ok(pack);
const [packVersion] = await originalRows(
  "scp_interview_pack_versions",
  `select=id&pack_id=eq.${pack.id}&version_number=eq.1`,
);
assert.ok(packVersion);
const caseCreated = await rpc("scp_iv_create_case", {
  _employer_id: employer,
  _title: "Synthetic bounded stale handoff proof",
  _pack_version_id: packVersion.id,
  _candidate_display_name: "Synthetic A001",
  _candidate_user_id: "ee10aaaa-0000-4000-8000-000000000001",
  _candidate_external_ref: null,
  _job_id: job,
  _application_id: app(1),
});
assert.equal(caseCreated.status, 200, JSON.stringify(caseCreated.body));
const handoffReview = await rpc("rec_ri_get_review", { _application_id: app(1) });
const staleHandoff = await rpc("rec_ri_transfer_requirements", {
  _application_id: app(1),
  _case_id: caseCreated.body,
  _expected_revision: 0,
  _binding_token: handoffReview.body.bindingToken,
  _operation_id: randomUUID(),
  _requirement_ids: [handoffReview.body.criteria[0].requirementId],
});
const sourcesAfterStale = await originalRows(
  "scp_interview_case_sources",
  `select=id&case_id=eq.${caseCreated.body}`,
);
ok(
  "stale chosen-source handoff returns precise PT409 without copying any preparation source",
  () => {
    assertDomainConflict(staleHandoff, "RI_SOURCE_STALE");
    assert.equal(sourcesAfterStale.length, 0);
  },
);
const profile = await rpc("rec_ri_get_profile", { _job_id: job });
assert.equal(profile.status, 200);
const profileV2 = await rpc("rec_ri_confirm_profile", {
  _job_id: job,
  _expected_version: 1,
  _operation_id: randomUUID(),
  _start_date: "2026-12-01",
  _rules: profile.body.rules,
});
assert.equal(profileV2.status, 200);
const changed = await read();
ok("API V2 date change recomputes 30/35/35 and invalidates current confirmations", () => {
  const c = changed.intelligenceCounts;
  assert.deepEqual([c.green, c.yellow, c.gray], [30, 35, 35]);
  assert.equal(c.reviewed, 0);
  assert.equal(c.remaining, 100);
});
const missing = await rpc("rec_ri_get_review", { _application_id: app(96) });
ok("original missing is gray, no technical AI status or selection mutation", () => {
  assert.equal(missing.body.requirementStatus, "gray");
  assert.equal(missing.body.analysisState, "not_used");
  assert.equal(pages[0].rows[0].status, "submitted");
});
console.log(
  JSON.stringify(
    {
      kind: "executed-local-postgrest-api",
      assertions,
      baseline: { received: 100, green: 40, yellow: 25, gray: 35, reviewed: 27, remaining: 73 },
      concurrentStatuses: competition.map((r) => r.status),
      domainConflicts,
      v2: changed.intelligenceCounts,
    },
    null,
    2,
  ),
);
