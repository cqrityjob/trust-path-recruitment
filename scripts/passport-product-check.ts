import assert from "node:assert/strict";
import { personaById } from "../src/lib/security-passport/fixtures/personas";
import { credentialProductStatus } from "../src/lib/security-passport/product-status";
import type { Claim } from "../src/lib/security-passport/types";
const base: Claim = {
  ...personaById("overlapping-employers").claims[0],
  id: "product-test",
  claimType: "certification",
  assertionLevel: "self_declared",
  lifecycleState: "active",
  validUntil: "2030-01-01",
  verifierName: null,
  verificationMethod: null,
  verifiedOn: null,
};
const day = "2026-09-16";
assert.equal(credentialProductStatus(base, [], day).status, "registered");
assert.equal(
  credentialProductStatus({ ...base, assertionLevel: "document_provided" }, [], day).status,
  "evidence",
);
const approval = {
  claimId: base.id,
  result: "approved",
  decidedAt: "2026-09-10",
  validUntil: "2030-01-01",
};
assert.equal(
  credentialProductStatus(base, [approval], day).checked,
  false,
  "an approval cannot promote an assertion by itself",
);
const reviewed: Claim = {
  ...base,
  assertionLevel: "verified",
  verificationMethod: "document_review",
  verifierName: "CQrityjob",
  verifiedOn: "2026-09-10",
};
assert.equal(credentialProductStatus(reviewed, [approval], day).status, "reviewed");
assert.equal(
  credentialProductStatus(reviewed, [], day).checked,
  false,
  "missing decisions fail closed",
);
assert.equal(
  credentialProductStatus(reviewed, [{ ...approval, validUntil: "2026-09-01" }], day).checked,
  false,
);
assert.equal(
  credentialProductStatus(reviewed, [{ ...approval, result: "rejected" }], day).status,
  "rejected",
);
assert.equal(credentialProductStatus(reviewed, [approval], day, "pending").status, "review");
assert.equal(
  credentialProductStatus(reviewed, [approval], day, "clarification_requested").status,
  "clarification",
);
for (const lifecycleState of ["revoked", "expired", "disputed", "superseded"] as const) {
  const state = credentialProductStatus({ ...reviewed, lifecycleState }, [approval], day);
  assert.equal(state.checked, false);
  assert.equal(state.status, lifecycleState);
  assert.ok(state.label.sv && state.label.en);
}
assert.equal(
  credentialProductStatus({ ...base, validUntil: "2026-01-01" }, [], day).status,
  "expired",
);
console.log("Passport product: truthful status transitions and bilingual labels passed");
