// Additional native HTTP proof, separate from the unchanged canonical 23.
// Called only inside the parent's pinned GitHub-hosted disposable stack.
import crypto from "node:crypto";
import { ACTORS, EMPLOYER, JOB, appId, failure } from "./recruiter-p1-native-contract.mjs";

export const WORKSPACE_STAGE = "workspace_six_rpc_real_auth_http";
const emptyJob = "ee100000-2222-4000-8000-000000000002";
const READS = ["impact", "history", "compare", "page", "next"];
const FUNCTIONS = Object.freeze({
  impact: "rec_ri_profile_change_impact",
  history: "rec_ri_profile_change_history",
  compare: "rec_ri_compare_applications",
  page: "rec_ri_page_evidence",
  next: "rec_ri_next_unreviewed",
  confirm: "rec_ri_confirm_reviewed_profile",
});
const PAGE_INVALID = [
  "apps_empty",
  "apps_null",
  "apps_duplicate",
  "apps_missing",
  "combined_cross_job_binding",
  "apps_101",
  "requirements_empty",
  "requirements_null",
  "requirements_duplicate",
  "requirements_missing",
  "requirements_four",
  "requirement_null_entry",
];
export const WORKSPACE_HTTP_IDS = Object.freeze([
  "current_profile",
  "current_review",
  "current_application_states",
  "owned_empty_profile_read",
  "owned_empty_profile_confirm",
  ...["owner", "member"].flatMap((role) => READS.map((rpc) => `${role}_${rpc}`)),
  ...["anon", "outsider"].flatMap((role) =>
    [...READS, "confirm"].map((rpc) => `${role}_${rpc}_denied`),
  ),
  "owner_compare_two",
  "member_confirm_denied",
  ...["one", "four", "duplicate", "missing", "cross_job"].map((kind) => `compare_${kind}_denied`),
  ...PAGE_INVALID.map((kind) => `page_${kind}_denied`),
  "impact_stale_denied",
  "confirm_blank_reason_denied",
  "confirm_null_reason_denied",
  "confirm_null_operation_denied",
  "confirm_stale_denied",
  "concurrent_owner",
  "concurrent_bob",
  "same_actor_operation_retry",
  "changed_reason_operation_denied",
  "new_current_profile",
  "owner_new_history",
  "member_new_history",
  "compare_old_profile_denied",
  "page_old_profile_denied",
  "new_impact",
  "new_job_queue",
  "new_global_queue",
  "owner_reject_to_archive",
  "owner_archive_closed",
  "owner_reject_decided",
  "candidate_own_withdraw",
  "excluded_impact",
  "excluded_job_queue",
  "excluded_global_queue",
]);
export const WORKSPACE_HTTP_COUNT = 70;
export const WORKSPACE_RPC_COUNT = 60;
export const WORKSPACE_SUPPORTING_COUNT = 10;
const PROOF_KEYS = [
  "kind",
  "httpRequests",
  "workspaceRpcRequests",
  "supportingRpcRequests",
  "checks",
  "concurrentStatuses",
  "oldReviewsAndSnapshotsUnchanged",
  "priorProfilePreserved",
  "queueBefore",
  "queueAfterProfile",
  "queueAfterExclusions",
  "impactAfterExclusions",
  "existingCandidateSession",
];
const keys = (value, expected) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === expected.slice().sort().join();
function allowedStatus(id, status) {
  if (id.startsWith("anon_") || id.startsWith("outsider_") || id === "member_confirm_denied")
    return [401, 403].includes(status);
  if (id.startsWith("concurrent_")) return [200, 409].includes(status);
  if (id === "owner_archive_closed") return status === 204;
  if (id.endsWith("_denied")) return status === (/stale|old_profile/.test(id) ? 409 : 400);
  return status === 200;
}

function refuse() {
  throw Error("P1_NATIVE_WORKSPACE_EXECUTED_PROOF_REQUIRED");
}
export function requireWorkspaceProof(report) {
  if (report.workspaceHttp != null) requireWorkspaceSummary(report.workspaceHttp);
  if (report.result !== "PASS") return;
  if (
    report.stages?.[WORKSPACE_STAGE] !== "passed" ||
    report.workspaceAuditCascadeReset !== true ||
    report.jobCascadeRetainsSnapshots !== true ||
    report.canonicalHttpAssertions !== 23 ||
    report.browser?.expected !== 5 ||
    report.browser?.unexpected !== 0 ||
    report.browser?.flaky !== 0 ||
    report.browser?.skipped !== 0
  )
    refuse();
  if (report.workspaceHttp == null) refuse();
}
function requireWorkspaceSummary(p) {
  if (
    !keys(p, PROOF_KEYS) ||
    p?.kind !== "executed-native-workspace-six-rpc-http" ||
    p.httpRequests !== WORKSPACE_HTTP_COUNT ||
    p.workspaceRpcRequests !== WORKSPACE_RPC_COUNT ||
    p.supportingRpcRequests !== WORKSPACE_SUPPORTING_COUNT ||
    !Array.isArray(p.checks) ||
    p.checks.length !== WORKSPACE_HTTP_COUNT ||
    p.checks.some(
      (c, i) =>
        !keys(c, ["id", "passed", "status"]) ||
        c.id !== WORKSPACE_HTTP_IDS[i] ||
        c.passed !== true ||
        !allowedStatus(c.id, c.status),
    ) ||
    !Array.isArray(p.concurrentStatuses) ||
    p.concurrentStatuses.length !== 2 ||
    p.concurrentStatuses.slice().sort().join() !== "200,409" ||
    !p.concurrentStatuses.every(
      (status, i) =>
        p.checks.find((c) => c.id === ["concurrent_owner", "concurrent_bob"][i])?.status === status,
    ) ||
    p.oldReviewsAndSnapshotsUnchanged !== true ||
    p.priorProfilePreserved !== true ||
    p.queueBefore?.remaining !== 100 ||
    p.queueBefore?.historicalExcluded !== 0 ||
    p.queueAfterProfile?.remaining !== 100 ||
    p.queueAfterProfile?.historicalExcluded !== 0 ||
    p.queueAfterExclusions?.remaining !== 97 ||
    p.queueAfterExclusions?.historicalExcluded !== 3 ||
    p.impactAfterExclusions?.received !== 100 ||
    p.impactAfterExclusions?.active !== 97 ||
    p.impactAfterExclusions?.archived !== 1 ||
    p.impactAfterExclusions?.withdrawn !== 1 ||
    p.impactAfterExclusions?.decided !== 2 ||
    p.existingCandidateSession !== true ||
    ![p.queueBefore, p.queueAfterProfile, p.queueAfterExclusions].every((q) =>
      keys(q, ["remaining", "historicalExcluded"]),
    ) ||
    !keys(p.impactAfterExclusions, ["received", "active", "archived", "withdrawn", "decided"])
  )
    refuse();
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const subset = (value, expected) => Object.entries(expected).every(([k, v]) => value?.[k] === v);
const counts = (v) => ({ remaining: v.remaining, historicalExcluded: v.historicalExcluded });
const uuid = (v) => typeof v === "string" && /^[a-f0-9-]{36}$/.test(v);

export async function runWorkspaceHttp({ clients, anonymous, candidate, readInvariant }) {
  const observations = new Map();
  let workspaceRpcRequests = 0;
  const assert = (condition) => {
    if (!condition)
      throw Object.assign(Error("P1_NATIVE_WORKSPACE_ASSERTION_FAILED"), {
        safeDiagnostic: {
          operation: "workspace_http",
          check: [...observations.keys()].at(-1) ?? "preflight",
        },
      });
  };
  const call = async (id, role, name, payload, accepts = (r) => !r.error && r.status === 200) => {
    assert(WORKSPACE_HTTP_IDS.includes(id) && !observations.has(id));
    const result = await (
      role === "anon" ? anonymous : role === "candidate" ? candidate : clients[role]
    ).rpc(name, payload);
    if (!accepts(result)) {
      if (result.error) {
        const e = failure(name, result);
        e.safeDiagnostic.check = id;
        throw e;
      }
      throw Object.assign(Error("P1_NATIVE_WORKSPACE_ASSERTION_FAILED"), {
        safeDiagnostic: { check: id, status: result.status },
      });
    }
    if (Object.values(FUNCTIONS).includes(name)) workspaceRpcRequests++;
    observations.set(id, { id, passed: true, status: result.status });
    return result;
  };
  const error = (code, status) => (r) =>
    Boolean(r.error) && r.error.code === code && r.status === status;
  const accessDenied = (r) =>
    Boolean(r.error) && r.error.code === "42501" && [401, 403].includes(r.status);
  const profile = (await call("current_profile", "owner", "rec_ri_get_profile", { _job_id: JOB }))
    .data;
  const review = (
    await call("current_review", "owner", "rec_ri_get_review", { _application_id: appId(1) })
  ).data;
  assert(
    uuid(profile?.profileId) &&
      Number.isInteger(profile.version) &&
      profile.version >= 2 &&
      profile.rules?.length === 6 &&
      review.profile?.profileId === profile.profileId,
  );
  const states = (
    await call("current_application_states", "owner", "rec_ri_candidate_view", {
      _employer_id: EMPLOYER,
      _job_id: JOB,
      _filters: { stage: "received" },
      _sort: "applied",
      _dir: "asc",
      _page: 1,
      _size: 100,
      _around: null,
    })
  ).data;
  assert(
    states?.rows?.length === 100 &&
      states.total === 100 &&
      states.intelligenceCounts?.received === 100,
  );
  assert(new Set(states.rows.map((a) => a.id)).size === 100);
  const currentStatus = (id) => states.rows.find((a) => a.id === appId(id))?.status;
  assert(
    [91, 92, 95].every((id) => ["submitted", "reviewing", "interview"].includes(currentStatus(id))),
  );
  // The existing owned second job has no applications or requirement rules.
  // Confirm its genuine empty profile so the cross-job page call passes the
  // current-profile gate and reaches input binding validation (not PT409).
  const emptyBefore = (
    await call("owned_empty_profile_read", "owner", "rec_ri_get_profile", { _job_id: emptyJob })
  ).data;
  assert(
    emptyBefore?.jobId === emptyJob &&
      emptyBefore.version === 0 &&
      emptyBefore.rules?.length === 0 &&
      emptyBefore.requirements?.length === 0,
  );
  const emptyProfile = (
    await call("owned_empty_profile_confirm", "owner", "rec_ri_confirm_profile", {
      _job_id: emptyJob,
      _expected_version: emptyBefore.version,
      _operation_id: crypto.randomUUID(),
      _start_date: null,
      _rules: [],
    })
  ).data;
  assert(
    emptyProfile?.jobId === emptyJob &&
      emptyProfile.version === 1 &&
      uuid(emptyProfile.profileId) &&
      emptyProfile.rules?.length === 0,
  );
  const requirements = profile.rules.slice(0, 3).map((r) => r.requirementId);
  assert(new Set(requirements).size === 3 && requirements.every(uuid));
  const applications = Array.from({ length: 100 }, (_, i) => appId(i + 1));
  const invariantBefore = readInvariant(profile.version);
  assert(typeof invariantBefore === "string" && invariantBefore.length > 2);
  const common = { _job_id: JOB, _profile_id: profile.profileId };
  const payloads = {
    impact: { _job_id: JOB, _expected_version: profile.version },
    history: { _job_id: JOB },
    compare: { ...common, _application_ids: [appId(1), appId(60), appId(90)] },
    page: { ...common, _application_ids: applications, _requirement_ids: requirements },
    next: { _employer_id: EMPLOYER, _job_id: null },
  };
  const functions = FUNCTIONS;
  const writePayload = () => ({
    _job_id: JOB,
    _expected_version: profile.version,
    _operation_id: crypto.randomUUID(),
    _start_date: "2027-01-01",
    _rules: profile.rules,
    _change_reason:
      "Synthetic reviewed start-date change; all active applications need renewed human review",
  });
  let oldHistory, initialQueue;
  for (const role of ["owner", "member"])
    for (const name of READS) {
      const data = (await call(`${role}_${name}`, role, functions[name], payloads[name])).data;
      if (name === "impact")
        assert(
          subset(data, {
            version: profile.version,
            received: 100,
            active: 100,
            archived: 0,
            withdrawn: 0,
            decided: 0,
            reviewedActive: 0,
          }),
        );
      if (name === "history") {
        assert(Array.isArray(data));
        if (role === "owner") oldHistory = data;
        else assert(same(data, oldHistory));
      }
      if (name === "compare")
        assert(
          data?.length === 3 &&
            data.every(
              (v, i) =>
                v.review?.applicationId === payloads.compare._application_ids[i] &&
                v.review.profile?.profileId === profile.profileId &&
                v.review.profile?.version === profile.version,
            ),
        );
      if (name === "page")
        assert(
          Object.keys(data ?? {}).length === 100 &&
            applications.every(
              (a) =>
                data[a]?.length === 3 &&
                data[a].every((c) => requirements.includes(c.requirementId)) &&
                new Set(data[a].map((c) => c.requirementId)).size === 3,
            ),
        );
      if (name === "next") {
        assert(
          subset(data, { remaining: 100, historicalExcluded: 0 }) &&
            data.next?.applicationId === appId(1),
        );
        initialQueue = data;
      }
    }
  for (const role of ["anon", "outsider"])
    for (const name of [...READS, "confirm"])
      await call(
        `${role}_${name}_denied`,
        role,
        functions[name],
        name === "confirm" ? writePayload() : payloads[name],
        accessDenied,
      );
  const twoIds = [appId(1), appId(60)];
  const two = (
    await call("owner_compare_two", "owner", functions.compare, {
      ...common,
      _application_ids: twoIds,
    })
  ).data;
  assert(
    two.length === 2 &&
      two.every(
        (v, i) =>
          v.review?.applicationId === twoIds[i] &&
          v.review.profile?.profileId === profile.profileId &&
          v.review.profile?.version === profile.version,
      ),
  );
  await call("member_confirm_denied", "member", functions.confirm, writePayload(), accessDenied);
  const invalidComparisons = {
    one: [appId(1)],
    four: applications.slice(0, 4),
    duplicate: [appId(1), appId(1)],
    missing: [appId(1), appId(101)],
    cross_job: [appId(1), appId(2)],
  };
  for (const [kind, ids] of Object.entries(invalidComparisons))
    await call(
      `compare_${kind}_denied`,
      "owner",
      functions.compare,
      { ...common, _job_id: kind === "cross_job" ? emptyJob : JOB, _application_ids: ids },
      error("23514", 400),
    );
  const badPages = {
    apps_empty: { _application_ids: [] },
    apps_null: { _application_ids: null },
    apps_duplicate: { _application_ids: [appId(1), appId(1)] },
    apps_missing: { _application_ids: [appId(101)] },
    combined_cross_job_binding: { _job_id: emptyJob, _profile_id: emptyProfile.profileId },
    apps_101: { _application_ids: [...applications, appId(101)] },
    requirements_empty: { _requirement_ids: [] },
    requirements_null: { _requirement_ids: null },
    requirements_duplicate: { _requirement_ids: [requirements[0], requirements[0]] },
    requirements_missing: { _requirement_ids: [appId(101)] },
    requirements_four: { _requirement_ids: profile.rules.slice(0, 4).map((r) => r.requirementId) },
    requirement_null_entry: { _requirement_ids: [requirements[0], null] },
  };
  for (const kind of PAGE_INVALID)
    await call(
      `page_${kind}_denied`,
      "owner",
      functions.page,
      { ...payloads.page, ...badPages[kind] },
      error("23514", 400),
    );
  await call(
    "impact_stale_denied",
    "owner",
    functions.impact,
    { _job_id: JOB, _expected_version: profile.version - 1 },
    error("PT409", 409),
  );
  for (const [id, patch, code, status] of [
    ["confirm_blank_reason_denied", { _change_reason: "  " }, "23514", 400],
    ["confirm_null_reason_denied", { _change_reason: null }, "23514", 400],
    ["confirm_null_operation_denied", { _operation_id: null }, "23514", 400],
    ["confirm_stale_denied", { _expected_version: profile.version - 1 }, "PT409", 409],
  ])
    await call(
      id,
      "owner",
      functions.confirm,
      { ...writePayload(), ...patch },
      error(code, status),
    );
  const writes = [writePayload(), writePayload()];
  const race = await Promise.all(
    ["owner", "bob"].map((role, i) =>
      call(
        `concurrent_${role}`,
        role,
        functions.confirm,
        writes[i],
        (r) => (!r.error && r.status === 200) || error("PT409", 409)(r),
      ),
    ),
  );
  assert(
    race
      .map((r) => r.status)
      .sort()
      .join() === "200,409",
  );
  const winningIndex = race.findIndex((r) => r.status === 200),
    winner = ["owner", "bob"][winningIndex];
  const saved = race[winningIndex].data;
  assert(
    saved?.version === profile.version + 1 &&
      uuid(saved.profileId) &&
      saved.profileId !== profile.profileId,
  );
  const retry = (
    await call("same_actor_operation_retry", winner, functions.confirm, writes[winningIndex])
  ).data;
  assert(same(retry, saved));
  await call(
    "changed_reason_operation_denied",
    winner,
    functions.confirm,
    { ...writes[winningIndex], _change_reason: "Synthetic different reason, same operation" },
    error("23514", 400),
  );
  assert(
    same(
      (await call("new_current_profile", "owner", "rec_ri_get_profile", { _job_id: JOB })).data,
      saved,
    ),
  );
  for (const role of ["owner", "member"]) {
    const history = (await call(`${role}_new_history`, role, functions.history, payloads.history))
      .data;
    assert(
      history.length === oldHistory.length + 1 &&
        same(history.slice(1), oldHistory) &&
        history[0].version === saved.version &&
        same(history[0].priorProfile, profile) &&
        history[0].actorId === ACTORS[winningIndex].id &&
        history[0].reason === writes[winningIndex]._change_reason,
    );
  }
  await call(
    "compare_old_profile_denied",
    "owner",
    functions.compare,
    payloads.compare,
    error("PT409", 409),
  );
  await call(
    "page_old_profile_denied",
    "owner",
    functions.page,
    payloads.page,
    error("PT409", 409),
  );
  assert(
    subset(
      (
        await call("new_impact", "owner", functions.impact, {
          _job_id: JOB,
          _expected_version: saved.version,
        })
      ).data,
      { received: 100, active: 100, reviewedActive: 0 },
    ),
  );
  let newQueue;
  for (const [id, job] of [
    ["new_job_queue", JOB],
    ["new_global_queue", null],
  ]) {
    newQueue = (await call(id, "owner", functions.next, { _employer_id: EMPLOYER, _job_id: job }))
      .data;
    assert(
      subset(newQueue, { remaining: 100, historicalExcluded: 0 }) &&
        newQueue.next?.applicationId === appId(1),
    );
  }
  await call("owner_reject_to_archive", "owner", "rec_set_application_stage", {
    _application_id: appId(91),
    _expected_status: currentStatus(91),
    _new_status: "rejected",
    _note: "Synthetic closed application for archive exclusion probe",
  });
  await call(
    "owner_archive_closed",
    "owner",
    "rec_archive_material",
    { _job_id: JOB, _application_id: appId(91), _archive: true },
    (r) => !r.error && r.status === 204,
  );
  await call("owner_reject_decided", "owner", "rec_set_application_stage", {
    _application_id: appId(92),
    _expected_status: currentStatus(92),
    _new_status: "rejected",
    _note: "Synthetic explicit decision for queue exclusion probe",
  });
  await call("candidate_own_withdraw", "candidate", "set_application_status", {
    _application_id: appId(95),
    _new_status: "withdrawn",
    _note: "Synthetic holder withdrawal for queue exclusion probe",
  });
  const impact = (
    await call("excluded_impact", "owner", functions.impact, {
      _job_id: JOB,
      _expected_version: saved.version,
    })
  ).data;
  assert(
    subset(impact, {
      received: 100,
      active: 97,
      archived: 1,
      withdrawn: 1,
      decided: 2,
      reviewedActive: 0,
    }),
  );
  let excludedQueue;
  for (const [id, job] of [
    ["excluded_job_queue", JOB],
    ["excluded_global_queue", null],
  ]) {
    excludedQueue = (
      await call(id, "member", functions.next, { _employer_id: EMPLOYER, _job_id: job })
    ).data;
    assert(
      subset(excludedQueue, { remaining: 97, historicalExcluded: 3 }) &&
        excludedQueue.next?.applicationId === appId(1),
    );
  }
  assert(
    readInvariant(profile.version) === invariantBefore &&
      observations.size === WORKSPACE_HTTP_COUNT &&
      WORKSPACE_HTTP_IDS.length === WORKSPACE_HTTP_COUNT,
  );
  const proof = {
    kind: "executed-native-workspace-six-rpc-http",
    httpRequests: observations.size,
    workspaceRpcRequests,
    supportingRpcRequests: observations.size - workspaceRpcRequests,
    checks: WORKSPACE_HTTP_IDS.map((id) => observations.get(id)),
    concurrentStatuses: race.map((r) => r.status),
    oldReviewsAndSnapshotsUnchanged: true,
    priorProfilePreserved: true,
    queueBefore: counts(initialQueue),
    queueAfterProfile: counts(newQueue),
    queueAfterExclusions: counts(excludedQueue),
    impactAfterExclusions: {
      received: impact.received,
      active: impact.active,
      archived: impact.archived,
      withdrawn: impact.withdrawn,
      decided: impact.decided,
    },
    existingCandidateSession: true,
  };
  requireWorkspaceSummary(proof);
  return proof;
}
