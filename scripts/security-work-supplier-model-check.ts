// The supplier cycle's pure rules (src/lib/security-work/suppliers/model.ts).
import assert from "node:assert/strict";
import {
  inView,
  mayVerify,
  nextStep,
  requestTimes,
  shareToMarkdown,
  sortQueue,
  supplierFigures,
  supplierOverdue,
  type RequestLike,
} from "../src/lib/security-work/suppliers/model";

let checks = 0;
const check = (label: string, run: () => void) => {
  try {
    run();
    checks += 1;
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
};
const base: RequestLike & { created_at: string; responseDays: number | null } = {
  id: "q",
  status: "awaiting_response",
  requested_due: "2026-11-10",
  agreed_due: null,
  supplier_proposed_due: "2026-11-30",
  share_stale: false,
  share_version: 1,
  cycle: 1,
  internal_owner_id: "owner",
  created_by: "maker",
  requires_separate_verifier: false,
  created_at: "2026-11-01T08:00:00Z",
  responseDays: 5,
};
check(
  "overdue is measured against the agreed date when there is one, else the requested date",
  () => {
    assert.equal(supplierOverdue(base, "2026-11-11"), true);
    assert.equal(supplierOverdue({ ...base, agreed_due: "2026-11-20" }, "2026-11-11"), false);
    assert.equal(
      supplierOverdue({ ...base, status: "awaiting_verification" }, "2026-12-30"),
      false,
      "waiting for our verification is not the supplier's delay",
    );
  },
);
check("the next step follows the state, and a stale share comes first", () => {
  assert.equal(
    nextStep({ ...base, status: "draft", share_version: null }, "2026-11-01").step,
    "approve_share",
  );
  assert.equal(nextStep({ ...base, share_stale: true }, "2026-11-01").step, "reapprove_share");
  assert.equal(nextStep({ ...base, status: "awaiting_verification" }, "2026-11-01").step, "verify");
  assert.equal(nextStep({ ...base, status: "accepted" }, "2026-11-01").step, "done");
});
check("a separate verifier is someone other than the owner, creator and recorder", () => {
  const r = { ...base, status: "awaiting_verification", requires_separate_verifier: true };
  const done = {
    id: "d",
    request_id: "q",
    kind: "done",
    received_at: "",
    claimed_done_at: null,
    recorded_by: "clerk",
    cycle: 1,
    seq: 1,
  };
  assert.equal(mayVerify(r, done, { id: "owner", canApprove: true }), false);
  assert.equal(mayVerify(r, done, { id: "clerk", canApprove: true }), false);
  assert.equal(mayVerify(r, done, { id: "other", canApprove: true }), true);
  assert.equal(mayVerify(r, done, { id: "other", canApprove: false }), false);
});
const events = [
  {
    request_id: "q",
    event: "dispatched",
    created_at: "2026-11-02T08:00:00Z",
    details: {},
    cycle: 1,
  },
];
const responses = [
  {
    id: "a",
    request_id: "q",
    kind: "done",
    received_at: "2026-11-05T08:00:00Z",
    claimed_done_at: null,
    recorded_by: "c",
    cycle: 1,
    seq: 1,
  },
  {
    id: "b",
    request_id: "q",
    kind: "done",
    received_at: "2026-11-12T08:00:00Z",
    claimed_done_at: null,
    recorded_by: "c",
    cycle: 1,
    seq: 2,
  },
];
const verifications = [
  {
    request_id: "q",
    response_id: "a",
    outcome: "needs_revision",
    verified_at: "2026-11-08T08:00:00Z",
    cycle: 1,
  },
  {
    request_id: "q",
    response_id: "b",
    outcome: "accepted",
    verified_at: "2026-11-14T08:00:00Z",
    cycle: 1,
  },
];
check("the supplier's time and the customer's verification time are measured separately", () => {
  const t = requestTimes(base, events, responses, verifications, "2026-11-20T00:00:00Z");
  assert.equal(t.firstResponseHours, 72, "dispatch 2 Nov to first response 5 Nov");
  assert.equal(t.verificationWaitHours, 48, "latest done 12 Nov to its verification 14 Nov");
  assert.equal(t.acceptedFirstTime, false);
  assert.equal(t.revisions, 1);
});
check(
  "the supplier's time starts when the request was sent, not when the sending was recorded",
  () => {
    const recordedLate = [
      {
        ...events[0],
        created_at: "2026-11-06T08:00:00Z",
        details: { sentAt: "2026-11-02T08:00:00Z" },
      },
    ];
    assert.equal(
      requestTimes(base, recordedLate, responses, verifications, "2026-11-20T00:00:00Z")
        .firstResponseHours,
      72,
    );
  },
);
check("figures name their denominators and say when data is missing", () => {
  const f = supplierFigures(
    [base],
    events,
    responses,
    verifications,
    { from: "2026-11-01", to: "2026-11-30" },
    "2026-11-20T00:00:00Z",
  );
  assert.deepEqual(f.respondedOnTime, { numerator: 1, denominator: 1 });
  assert.deepEqual(f.acceptedFirstTime, { numerator: 0, denominator: 1 });
  const none = supplierFigures(
    [{ ...base, responseDays: null }],
    [],
    [],
    [],
    { from: "2026-11-01", to: "2026-11-30" },
    "2026-11-20T00:00:00Z",
  );
  assert.equal(
    none.respondedOnTime,
    null,
    "no response rule and no response: missing, never zero or green",
  );
  assert.equal(none.medianFirstResponseHours, null);
});
check("views filter and never widen: an item without a category is in every view", () => {
  assert.equal(inView("cyber", ["facilities"]), false);
  assert.equal(inView("security", ["facilities"]), true);
  assert.equal(inView("cyber", []), true);
  assert.equal(inView("cyber", ["suppliers"]), true);
});
check("the queue follows the plan's order", () => {
  const q = sortQueue([
    { kind: "coverage_gap", id: "1", title: "a", to: "", due: null, owner: null, categories: [] },
    {
      kind: "needs_assessment",
      id: "2",
      title: "b",
      to: "",
      due: null,
      owner: null,
      categories: [],
    },
    {
      kind: "needs_verification",
      id: "3",
      title: "c",
      to: "",
      due: null,
      owner: null,
      categories: [],
    },
  ]);
  assert.deepEqual(
    q.map((i) => i.kind),
    ["needs_assessment", "needs_verification", "coverage_gap"],
  );
});
check("the export is the approved external version and nothing internal", () => {
  const md = shareToMarkdown(
    {
      reference: "LB-2026-0001",
      title: "Impact",
      task: "Confirm versions",
      expectedResult: "Statement",
      responseInstruction: "",
      requestedDue: "2026-11-10",
      basisKind: "contract_obligation",
      contract: { title: "Service agreement", version: 1, clause: "7.2" },
      supplier: "Passage AB",
    },
    {
      shareVersion: 2,
      recipient: "support@passage.example.test",
      approvedAt: "2026-11-02T08:00:00Z",
    },
    "sv",
  );
  assert.match(md, /Referens: LB-2026-0001/);
  assert.match(md, /punkt 7\.2/);
  assert.match(md, /Godkänd extern version 2/);
  assert.doesNotMatch(md, /\n\n\n/);
});
console.log(`Security Work supplier model: ${checks} checks passed; pure.`);
