import assert from "node:assert/strict";
import { acceptsSnapshot, isClosed } from "../src/components/sentinel/session-state";
import type { Session } from "../src/lib/sentinel/types";

const running: Session = {
  attemptId: "synthetic-attempt",
  language: "sv",
  version: "synthetic",
  status: "running",
  durationSeconds: 1500,
  deadline: "2026-10-06T12:25:00Z",
  serverNow: "2026-10-06T12:00:00Z",
  revision: 2,
  answers: {},
  questions: [],
  report: null,
  reportVisible: false,
};
assert.equal(isClosed(running), false);
assert.equal(isClosed(null), false);
assert.equal(acceptsSnapshot(null, running, running.attemptId), true);
assert.equal(
  acceptsSnapshot(running, { ...running, attemptId: "another-attempt" }, running.attemptId),
  false,
);
assert.equal(acceptsSnapshot(running, { ...running, revision: 1 }, running.attemptId), false);
assert.equal(
  acceptsSnapshot(running, { ...running, serverNow: "2026-10-06T11:59:59Z" }, running.attemptId),
  false,
);
for (const status of ["completed", "timed_out", "abandoned"] as const) {
  const closed: Session = { ...running, status, revision: 3 };
  assert.equal(isClosed(closed), true);
  assert.equal(acceptsSnapshot(running, closed, running.attemptId), true);
  // Even a malformed higher revision must never reopen or change a terminal state.
  for (const revision of [2, 3, 4]) {
    assert.equal(acceptsSnapshot(closed, { ...running, revision }, running.attemptId), false);
  }
  assert.equal(
    acceptsSnapshot(closed, { ...closed, reportVisible: true, revision: 4 }, running.attemptId),
    true,
  );
  assert.equal(
    acceptsSnapshot(closed, { ...closed, status: "ready", revision: 4 }, running.attemptId),
    false,
  );
}
console.log(
  "Sentinel snapshot regression: 27 assertions passed (all terminal states, stale revisions/time, other attempts and later report sharing).",
);
