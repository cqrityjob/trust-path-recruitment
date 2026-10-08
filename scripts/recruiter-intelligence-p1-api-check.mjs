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
  const response = await fetch(`${base}/rpc/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt(sub, role)}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return { status: response.status, body: await response.json() };
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
};
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
  assert.deepEqual(competition.map((r) => r.status).sort(), [200, 400]);
  const loser = competition.find((r) => r.status === 400);
  assert.match(loser.body.message, /RI_STALE_VERSION/);
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
  assert.equal(((awaitNotUsed) => awaitNotUsed)(pages[0].rows[0].status), "submitted");
});
console.log(
  JSON.stringify(
    {
      kind: "executed-local-postgrest-api",
      assertions,
      baseline: { received: 100, green: 40, yellow: 25, gray: 35, reviewed: 27, remaining: 73 },
      concurrentStatuses: competition.map((r) => r.status),
      v2: changed.intelligenceCounts,
    },
    null,
    2,
  ),
);
