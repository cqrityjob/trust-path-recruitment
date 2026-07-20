// H3.3 final integrity pass — focused application-level regression check
// (matching the established scripts/employer-taxonomy-check.ts /
// scripts/employer-job-form-check.ts pattern: a plain, importable-module
// check, not a JS/TS unit-test-runner suite -- no such runner is
// configured in this project, see package.json).
//
// adminUpsertEmployer() itself cannot be invoked directly outside the
// TanStack Start server runtime (confirmed while building this check:
// calling it in a plain script throws "No Start context found in
// AsyncLocalStorage"), so admin.functions.ts exports the exact pure
// pieces this integrity fix depends on -- employerPayloadSchema,
// assertNoExistingEmployerStatusChange, resolveNewEmployerStatus -- and
// this script exercises them directly, for real, rather than re-deriving
// or assuming their behaviour.
//
// Guards against exactly the regression this pass exists to close: an
// existing employer's status silently changing through the "manually
// create an employer" admin tool instead of moderate_employer().
//
// Run via `bun run admin-employer-status-guard:check`.

import {
  employerPayloadSchema,
  assertNoExistingEmployerStatusChange,
  resolveNewEmployerStatus,
} from "../src/lib/job-intelligence/admin.functions";

const errors: string[] = [];

function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

// -----------------------------------------------------------------------
// 1. Creation-time status is restricted to 'draft'/'pending' at the
//    schema layer -- 'active'/'suspended'/'archived'/'rejected' (every
//    moderation outcome) must be rejected before the handler even runs.
// -----------------------------------------------------------------------
for (const allowed of ["draft", "pending"] as const) {
  const result = employerPayloadSchema.safeParse({ name: "Test Co", status: allowed });
  expect(result.success, `employerPayloadSchema should accept status='${allowed}'`);
}

for (const forbidden of ["active", "suspended", "archived", "rejected"]) {
  const result = employerPayloadSchema.safeParse({ name: "Test Co", status: forbidden });
  expect(
    !result.success,
    `employerPayloadSchema should REJECT status='${forbidden}' -- moderation outcomes must never be settable at creation time`,
  );
}

// status omitted entirely must still be a valid payload (both create and
// update flows send no status in the common case).
expect(
  employerPayloadSchema.safeParse({ name: "Test Co" }).success,
  "employerPayloadSchema should accept a payload with no status field at all",
);

// -----------------------------------------------------------------------
// 2. resolveNewEmployerStatus: a brand-new employer defaults to 'pending',
//    never the bare column default ('active'), unless 'draft' was
//    explicitly requested.
// -----------------------------------------------------------------------
expect(
  resolveNewEmployerStatus(undefined) === "pending",
  "resolveNewEmployerStatus(undefined) must default to 'pending', not 'active'",
);
expect(
  resolveNewEmployerStatus("draft") === "draft",
  "resolveNewEmployerStatus('draft') must return 'draft' when explicitly requested",
);
expect(
  resolveNewEmployerStatus("pending") === "pending",
  "resolveNewEmployerStatus('pending') must return 'pending' when explicitly requested",
);

// -----------------------------------------------------------------------
// 3. assertNoExistingEmployerStatusChange: the actual integrity guard.
//    An update (isUpdate=true) with any status value must throw. Creation
//    (isUpdate=false) or an update with no status field must not throw.
// -----------------------------------------------------------------------
try {
  assertNoExistingEmployerStatusChange(true, "pending");
  errors.push(
    "assertNoExistingEmployerStatusChange(true, 'pending') should have thrown -- an existing employer's status must never be settable through this path",
  );
} catch (e) {
  const message = (e as Error).message ?? "";
  expect(
    message.startsWith("EMPLOYER_STATUS_UPDATE_NOT_ALLOWED"),
    `assertNoExistingEmployerStatusChange should throw a stable EMPLOYER_STATUS_UPDATE_NOT_ALLOWED code, got: ${message}`,
  );
}

try {
  assertNoExistingEmployerStatusChange(true, "draft");
  errors.push(
    "assertNoExistingEmployerStatusChange(true, 'draft') should have thrown -- the guard must reject ANY status value on an update, not just moderation outcomes",
  );
} catch {
  // expected
}

try {
  assertNoExistingEmployerStatusChange(true, undefined);
} catch (e) {
  errors.push(
    `assertNoExistingEmployerStatusChange(true, undefined) should NOT throw -- an ordinary metadata-only edit (name/website/etc, no status field) must keep working: ${(e as Error).message}`,
  );
}

try {
  assertNoExistingEmployerStatusChange(false, "pending");
} catch (e) {
  errors.push(
    `assertNoExistingEmployerStatusChange(false, 'pending') should NOT throw -- creating a new employer with an initial status must keep working: ${(e as Error).message}`,
  );
}

// -----------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`admin-employer-status-guard:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("admin-employer-status-guard:check OK");
