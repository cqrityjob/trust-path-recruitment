// Admin Control Center — focused application-level regression check.
//
// Matches the established scripts/admin-portal-guard-check.ts pattern: a
// plain, importable-module + source-text check, not a JS/TS unit-test-runner
// suite (none is configured in this project). The BEHAVIOUR of every RPC is
// asserted for real against a live database in
// supabase/tests/admin_lifecycle_test.sql (128 assertions); this script guards
// the properties that live in a call SHAPE or a UI contract, where a
// behavioural test would only be able to observe the symptom.
//
// Run via `bun run admin-lifecycle:check`.

import { readFileSync } from "node:fs";
import path from "node:path";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const root = path.resolve(import.meta.dir, "..");
function read(relPath: string): string {
  return readFileSync(path.join(root, relPath), "utf8");
}

/** Source with `//` line comments removed. A file is allowed to EXPLAIN why it
 *  does not call window.confirm(); the check is about calls, not prose. */
function readCode(relPath: string): string {
  return read(relPath)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
}

// Two migrations now define this feature. The 2026-09-11 one built it; the
// 2026-09-17 one replaced two of its functions when permanent deletion stopped
// being conditional on history. Checking only the first would mean guarding a
// definition the database no longer runs, so the later file is searched first
// and the earlier one is the fallback -- the same "latest definition wins"
// rule Postgres itself applies to CREATE OR REPLACE.
const lifecycleMigration = read(
  "supabase/migrations/20260911090000_admin_control_center_lifecycle.sql",
);
const deletionMigration = read(
  "supabase/migrations/20260917090000_superadmin_permanent_account_deletion.sql",
);
const migration = lifecycleMigration;

/** The live definition of a function: from the newest migration that has one. */
function definitionOf(fn: string): string {
  for (const source of [deletionMigration, lifecycleMigration]) {
    const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    if (start === -1) continue;
    const end = source.indexOf(`REVOKE ALL ON FUNCTION public.${fn}`, start);
    return source.slice(start, end === -1 ? source.length : end);
  }
  return "";
}
const lifecycleFns = read("src/lib/job-intelligence/admin-lifecycle.functions.ts");
const dangerZone = read("src/components/admin/DangerZone.tsx");
const dangerZoneCode = readCode("src/components/admin/DangerZone.tsx");
const labels = read("src/lib/job-intelligence/admin-lifecycle-labels.ts");

// -----------------------------------------------------------------------
// 1. Role split. Irreversible operations on a platform identity are
//    superadmin-only; the reversible ones are not gratuitously escalated.
// -----------------------------------------------------------------------
for (const fn of [
  "admin_delete_employer_if_safe",
  "admin_delete_user_if_safe",
  "admin_anonymise_user",
]) {
  const body = definitionOf(fn);
  expect(
    body.length > 0 && body.includes("IF NOT public.is_superadmin(_caller) THEN"),
    `${fn} must require is_superadmin() -- an irreversible operation on a platform identity is never an ordinary admin action`,
  );
  expect(
    body.includes("INSERT INTO public.audit_logs"),
    `${fn} must write an audit_logs row in the same transaction as the mutation`,
  );
}

expect(
  migration.includes("IF _target_is_admin AND NOT public.is_superadmin(_caller) THEN"),
  "admin_set_user_disabled must require superadmin to disable an administrator account",
);
expect(
  migration.includes(
    "LAST_SUPERADMIN_PROTECTED: cannot disable the only remaining active superadmin",
  ),
  "admin_set_user_disabled must refuse to disable the last active superadmin -- the same invariant admin_set_platform_role protects, reached through a different door",
);

// -----------------------------------------------------------------------
// 2. Deletion is never taken on the caller's word: the delete functions
//    must RECOMPUTE the impact themselves rather than accept a flag.
// -----------------------------------------------------------------------
expect(
  migration.includes("_impact := public.admin_employer_deletion_impact(_employer_id);") &&
    migration.includes("IF NOT (_impact ->> 'deletable')::boolean THEN"),
  "admin_delete_employer_if_safe must recompute admin_employer_deletion_impact() inside its own transaction",
);
expect(
  migration.includes("_impact := public.admin_user_deletion_impact(_user_id);") &&
    migration.includes("USER_NOT_DELETABLE"),
  "admin_delete_user_if_safe must recompute admin_user_deletion_impact() inside its own transaction",
);
expect(
  migration.includes("CONFIRMATION_MISMATCH"),
  "the typed confirmation must be enforced in the database, not only in the dialog",
);
expect(
  !/deletable\s*boolean/i.test(lifecycleFns) &&
    !lifecycleFns.includes("_deletable:") &&
    !lifecycleFns.includes("_force"),
  "no server function may pass a client-supplied deletable/force flag to an RPC",
);

// -----------------------------------------------------------------------
// 3. The client never supplies who it is.
// -----------------------------------------------------------------------
expect(
  !/_(caller|admin|actor)_?(user_)?id\s*:/.test(lifecycleFns),
  "admin-lifecycle.functions.ts must never pass an admin/actor id into an RPC -- auth.uid() is the only accepted source",
);
expect(
  (lifecycleFns.match(/requireSupabaseAuth/g) ?? []).length >= 2,
  "every server function in admin-lifecycle.functions.ts must go through requireSupabaseAuth",
);

// Every exported server function must assert a role before doing anything.
const handlerCount = (lifecycleFns.match(/\.handler\(/g) ?? []).length;
const assertCount = (lifecycleFns.match(/await assert(Admin|Superadmin)\(ctx\)/g) ?? []).length;
expect(
  handlerCount > 0 && assertCount === handlerCount,
  `every handler in admin-lifecycle.functions.ts must call assertAdmin/assertSuperadmin (${assertCount} asserts for ${handlerCount} handlers)`,
);

// -----------------------------------------------------------------------
// 4. Every new function is revoked from PUBLIC and anon.
//    (Hosted Supabase grants EXECUTE to anon by default on new functions --
//    an explicit REVOKE is the only thing that stops it.)
// -----------------------------------------------------------------------
for (const [label, source, floor] of [
  ["the lifecycle migration", lifecycleMigration, 10],
  ["the permanent-deletion migration", deletionMigration, 3],
] as const) {
  const createdFunctions = [
    ...source.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g),
  ].map((m) => m[1]);
  expect(
    createdFunctions.length >= floor,
    `expected ${label} to define at least ${floor} functions, found ${createdFunctions.length}`,
  );
  for (const fn of new Set(createdFunctions)) {
    // Trigger functions take no arguments, are never granted to anyone, and
    // are revoked FROM PUBLIC only -- there is no role to name.
    if (fn === "employer_operational_guard") continue;
    if (fn === "assessment_assignments_immutable_guard") {
      expect(
        source.includes(`REVOKE ALL ON FUNCTION public.${fn}() FROM PUBLIC;`),
        `public.${fn} is a trigger function and must stay revoked FROM PUBLIC`,
      );
      continue;
    }
    expect(
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)\\s*\n?\\s*FROM PUBLIC, anon;`).test(
        source,
      ),
      `public.${fn} must be explicitly revoked FROM PUBLIC, anon -- hosted Supabase grants EXECUTE to anon by default`,
    );
  }
}

// -----------------------------------------------------------------------
// 4b. Permanent deletion handles history rather than refusing it, and the
//     guard exception that makes that possible stays narrow.
// -----------------------------------------------------------------------
{
  const del = definitionOf("admin_delete_user_if_safe");
  expect(
    !del.includes("USER_NOT_DELETABLE"),
    "admin_delete_user_if_safe must no longer refuse an account because it has history",
  );
  expect(
    del.includes("LAST_SUPERADMIN_PROTECTED"),
    "the last active superadmin must still be undeletable",
  );
  expect(
    del.includes("set_config('trustpath.deleting_account'"),
    "admin_delete_user_if_safe must announce the deletion to the immutability guards",
  );
  const markerSites = (
    deletionMigration.match(/set_config\('trustpath\.deleting_account'/g) ?? []
  ).length;
  expect(
    markerSites === 1,
    `exactly one function may ever set trustpath.deleting_account; found ${markerSites}`,
  );
  expect(
    deletionMigration.includes("public.is_superadmin(auth.uid())"),
    "account_deletion_releases() must re-check superadmin rather than trusting the marker alone",
  );
  const impact = definitionOf("admin_user_deletion_impact");
  for (const key of ["'deleted', _deleted", "'detached', _detached", "'preserved', _preserved"]) {
    expect(
      impact.includes(key),
      `the impact report must return ${key.split(",")[0]} so the dialog can show what happens to each row`,
    );
  }
}

// -----------------------------------------------------------------------
// 5. The employer status invariant is not weakened.
//    moderate_employer() must remain the ONLY function that sets the
//    transaction-local marker employers_validate_before_write() checks.
// -----------------------------------------------------------------------
const markerSites = (migration.match(/set_config\('app\.employer_moderation_in_progress'/g) ?? [])
  .length;
expect(
  markerSites === 1,
  `exactly one function may ever set app.employer_moderation_in_progress; this migration sets it ${markerSites} time(s)`,
);
expect(
  migration.includes("CREATE OR REPLACE FUNCTION public.moderate_employer(") &&
    migration.includes("_target_status := 'archived';"),
  "archiving must be added to moderate_employer() itself, not to a second status-changing function",
);
expect(
  /WHEN 'restored' THEN[\s\S]{0,200}_target_status := 'suspended';/.test(migration),
  "restoring an archived employer must land on 'suspended', never straight on 'active'",
);

// -----------------------------------------------------------------------
// 6. Danger Zone UX contract.
// -----------------------------------------------------------------------
expect(
  !dangerZoneCode.includes("window.confirm"),
  "DangerZone must never use window.confirm() -- it cannot carry an impact preview, a reason field or a translation",
);
for (const route of [
  "src/routes/_authenticated.admin.employers.$employerId.tsx",
  "src/routes/_authenticated.admin.users.$userId.tsx",
  "src/routes/_authenticated.admin.jobs.$id.tsx",
]) {
  const source = read(route);
  expect(
    source.includes("<DangerZone"),
    `${route} must route its destructive actions through the shared DangerZone component`,
  );
  expect(
    !readCode(route).includes("window.confirm"),
    `${route} must not use window.confirm() for a destructive action`,
  );
}
expect(
  dangerZone.includes("confirmPhrase") && dangerZone.includes("admin.danger.error.confirmMismatch"),
  "DangerZone must support a typed confirmation for high-impact deletion",
);

// -----------------------------------------------------------------------
// 7. Refusal codes are translated, never rendered raw.
// -----------------------------------------------------------------------
const rpcCodes = [...migration.matchAll(/RAISE EXCEPTION\s*\n?\s*'([A-Z][A-Z0-9_]{3,}):/g)].map(
  (m) => m[1],
);
expect(rpcCodes.length > 0, "expected the migration to raise stable CODE: message errors");
for (const code of new Set(rpcCodes)) {
  expect(
    labels.includes(`${code}:`),
    `refusal code ${code} has no entry in LIFECYCLE_ERROR_KEY -- it would reach an administrator untranslated`,
  );
}

const blockerCodes = [...migration.matchAll(/'code',\s*'([A-Z][A-Z0-9_]+)'/g)].map((m) => m[1]);
for (const code of new Set(blockerCodes)) {
  expect(
    labels.includes(`${code}:`),
    `blocker/finding code ${code} has no entry in the label maps -- it would render as an untranslated string`,
  );
}

// -----------------------------------------------------------------------
// 8. Passport and released assessment evidence are blockers, never targets.
//    Nothing in this migration may DELETE or UPDATE an evidence table.
// -----------------------------------------------------------------------
const EVIDENCE_TABLES = [
  "sp_claims",
  "sp_evidence",
  "sp_disclosures",
  "sp_verification_decisions",
  "scp_attempts",
  "scp_competency_evidence",
  "scp_report_snapshots",
  "scp_candidate_responses",
  "job_applications",
  "employees",
];
for (const table of EVIDENCE_TABLES) {
  expect(
    !new RegExp(`DELETE FROM public\\.${table}\\b`).test(migration),
    `this migration must never DELETE FROM public.${table} -- it is evidence, and a blocker rather than a target`,
  );
  expect(
    !new RegExp(`UPDATE public\\.${table}\\b`).test(migration),
    `this migration must never UPDATE public.${table} -- anonymisation clears profile data, not evidence`,
  );
}

// The two writes anonymisation IS allowed to make, asserted positively so a
// future edit that widens them is visible in this file's diff.
expect(
  migration.includes("UPDATE public.profiles SET display_name = NULL, country = NULL"),
  "anonymisation must clear the platform profile",
);
expect(
  migration.includes("UPDATE public.sp_passport_profiles SET display_name = NULL, headline = NULL"),
  "anonymisation must clear the Passport display profile (the profile, never the claims)",
);

// -----------------------------------------------------------------------
// 9. No bulk deletion anywhere.
// -----------------------------------------------------------------------
expect(
  !/DELETE FROM public\.employers\s*;/.test(migration) &&
    !/DELETE FROM auth\.users\s*;/.test(migration),
  "no unbounded DELETE may exist in this migration",
);
const dataPage = read("src/routes/_authenticated.admin.data.tsx");
expect(
  !dataPage.includes("adminDeleteEmployer") && !dataPage.includes("adminDeleteUser"),
  "the data-management page must not delete anything itself -- every deletion goes through the record's own danger zone",
);

// -----------------------------------------------------------------------
// 10. The audit read layer projects, never dumps.
// -----------------------------------------------------------------------
expect(
  lifecycleFns.includes("reason: (r.metadata?.reason as string | undefined) ?? null"),
  "adminListAuditEvents must project metadata down to its reason string, never return the raw metadata column",
);
expect(
  !/select\("[^"]*metadata[^"]*"\)[\s\S]{0,400}metadata: r\.metadata/.test(lifecycleFns),
  "adminListAuditEvents must never return the raw metadata object to the browser",
);

// -----------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`admin-lifecycle:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("admin-lifecycle:check OK");
