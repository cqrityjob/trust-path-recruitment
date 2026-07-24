// Admin Portal operational-scope pass — focused regression checks.
// Matches the established scripts/employer-taxonomy-check.ts /
// scripts/admin-employer-status-guard-check.ts pattern: a plain,
// importable-module + source-text check, not a JS/TS unit-test-runner
// suite (none is configured in this project). Server functions wrapped
// in createServerFn cannot be invoked outside the TanStack Start runtime
// (confirmed in prior phases), so this script exercises the pure/schema
// pieces directly where they're exported, and does structural source-text
// assertions everywhere the real guarantee lives in a migration's SQL
// (self-elevation block, last-superadmin protection, the unconditional
// employer-active publish gate) or in a specific call shape (audit
// logging, immutable-field writes). Run via `bun run admin-portal:check`.

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

// -----------------------------------------------------------------------
// 1. Role elevation protection + last-superadmin protection
//    (admin_set_platform_role, in the operational-scope migration).
// -----------------------------------------------------------------------
const roleMigration = read("supabase/migrations/20260724130000_admin_portal_operational_scope.sql");

expect(
  roleMigration.includes("IF NOT public.is_superadmin(_caller) THEN"),
  "admin_set_platform_role must require is_superadmin(), not just is_platform_admin() -- an ordinary admin must never grant/revoke platform roles",
);
expect(
  roleMigration.includes("_target_user_id = _caller THEN") &&
    roleMigration.includes("SELF_ROLE_CHANGE_NOT_ALLOWED"),
  "admin_set_platform_role must unconditionally block a caller from changing their own role (self-elevation protection)",
);
expect(
  roleMigration.includes("LAST_SUPERADMIN_PROTECTED") &&
    roleMigration.includes("_superadmin_count <= 1"),
  "admin_set_platform_role must block revoking 'superadmin' from the only remaining superadmin",
);
expect(
  roleMigration.includes("_role NOT IN ('admin', 'superadmin')"),
  "admin_set_platform_role must restrict itself to exactly the two platform-admin roles, not an arbitrary role string",
);

// -----------------------------------------------------------------------
// 2. Admin assignment cancellation -- required reason, fixed precondition.
// -----------------------------------------------------------------------
expect(
  roleMigration.includes("_clean_reason IS NULL THEN") &&
    roleMigration.includes("A reason is required to cancel an assignment as admin"),
  "admin_cancel_assessment_assignment must require a non-empty reason",
);
expect(
  roleMigration.includes("_current_status NOT IN ('invited', 'opened', 'started') THEN"),
  "admin_cancel_assessment_assignment must only allow cancelling invited/opened/started assignments -- never completed/expired/already-cancelled",
);
expect(
  roleMigration.includes("INSERT INTO public.audit_logs") &&
    roleMigration.includes("'assignment_cancelled'"),
  "admin_cancel_assessment_assignment must write an audit_logs row",
);

const assignmentFns = read("src/lib/job-intelligence/admin-assessment-assignments.functions.ts");
// Check the actual .select(...) column-list strings, not the file's own
// prose (which legitimately explains the guarantee by name in a comment).
const selectStringMatches = [...assignmentFns.matchAll(/ASSIGNMENT_SELECT\s*=\s*\n?([\s\S]*?);/g)];
const selectColumnLists = selectStringMatches.map((m) => m[1]);
expect(
  selectColumnLists.length > 0 &&
    selectColumnLists.every((cols) => !cols.includes("invitation_token")),
  "admin-assessment-assignments.functions.ts must never select the invitation token (hashed or raw) in any assignment query",
);

// -----------------------------------------------------------------------
// 3. Active-employer job publication invariant applies to EVERY caller,
//    including platform admins (the root-cause fix from the first audit
//    pass) -- structurally: the employer-active check for status=
//    'published' must appear BEFORE the `IF NOT is_platform_admin(...)`
//    branch begins, i.e. outside/ahead of the admin-exemption block, not
//    nested inside it.
// -----------------------------------------------------------------------
const jobsTrigger = read(
  "supabase/migrations/20260724120000_admin_audit_job_publish_requires_active_employer.sql",
);
const publishActiveCheckIdx = jobsTrigger.indexOf("Cannot publish job: employer organisation");
const adminExemptionIdx = jobsTrigger.indexOf("IF NOT public.is_platform_admin(auth.uid()) THEN");
expect(
  publishActiveCheckIdx !== -1 &&
    adminExemptionIdx !== -1 &&
    publishActiveCheckIdx < adminExemptionIdx,
  "the employer-active-required-to-publish check must appear before (outside) the admin-exemption block in jobs_validate_before_write(), so it applies unconditionally to every caller",
);

const adminFns = read("src/lib/job-intelligence/admin.functions.ts");
expect(
  adminFns.includes('if (data.action === "publish") {') && adminFns.includes("EMPLOYER_NOT_ACTIVE"),
  "adminTransitionJob must pre-check employer status before a publish attempt and throw EMPLOYER_NOT_ACTIVE",
);

// -----------------------------------------------------------------------
// 4. Assessment version immutability -- publish only ever INSERTs a new
//    row; retire only ever sets retired_at once. Neither ever performs an
//    arbitrary UPDATE of an existing version's identity (model_version /
//    disclaimer_version), and nothing in this file ever touches question
//    content or scoring.
// -----------------------------------------------------------------------
const catalogFns = read("src/lib/job-intelligence/admin-assessment-catalog.functions.ts");
expect(
  catalogFns.includes('.from("assessment_versions")\n      .insert({'),
  "adminPublishAssessmentVersion must INSERT a new assessment_versions row, never UPDATE an existing one",
);
expect(
  catalogFns.includes(".update({ retired_at: new Date().toISOString() })"),
  "adminRetireAssessmentVersion must only ever set retired_at -- never model_version/disclaimer_version/notes",
);
// Only reads question COUNT via byDefinition() (question-library) -- must
// never import the scoring engine or write to assessment_runs/assessment_run_reports.
// Checked against actual import statements and .from(...) table
// references only, not this file's own explanatory prose (which
// legitimately names career-intelligence-engine as "elsewhere, not here").
const catalogImportLines = catalogFns
  .split("\n")
  .filter((line) => line.trim().startsWith("import "));
const catalogFromCalls = [...catalogFns.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
expect(
  !catalogImportLines.some((line) => line.includes("career-intelligence-engine")) &&
    !catalogFromCalls.includes("assessment_runs") &&
    !catalogFromCalls.includes("assessment_run_reports"),
  "admin-assessment-catalog.functions.ts must never import the scoring engine or touch run/report tables -- catalog metadata only",
);
expect(
  catalogFromCalls.every((t) => ["assessments", "assessment_versions", "audit_logs"].includes(t)),
  `admin-assessment-catalog.functions.ts must only touch assessments/assessment_versions (+ audit_logs for its own audit trail), found: ${catalogFromCalls.join(", ")}`,
);
expect(
  catalogFns.includes("byDefinition(r.id).length"),
  "adminListAssessmentCatalog must derive question count from byDefinition().length (the real Question Library), never a hardcoded number",
);

// -----------------------------------------------------------------------
// 5. Audit logging -- every consequential admin write in this phase
//    produces an audit record (audit_logs, via writeAudit() or the
//    migration RPCs' own inserts already checked above).
// -----------------------------------------------------------------------
expect(
  catalogFns.includes('action: "assessment_visibility_changed"'),
  "adminSetAssessmentVisibility must write an audit_logs row",
);
expect(
  catalogFns.includes('action: "assessment_version_published"'),
  "adminPublishAssessmentVersion must write an audit_logs row",
);
expect(
  catalogFns.includes('action: "assessment_version_retired"'),
  "adminRetireAssessmentVersion must write an audit_logs row",
);

const workforceFns = read("src/lib/job-intelligence/admin-workforce.functions.ts");
expect(
  workforceFns.includes('"employee_reactivated"') &&
    workforceFns.includes('"employee_deactivated"'),
  "adminSetEmployeeStatus must write an audit_logs row for both directions",
);

// -----------------------------------------------------------------------
// 6. Admin route access -- every new admin route in this phase is nested
//    under _authenticated/admin (file-name prefix _authenticated.admin.),
//    which the existing AdminLayout gates on adminWhoAmI() (server-
//    verified is_platform_admin) before rendering an <Outlet/> --
//    confirmed once here structurally rather than per-file, since it's
//    the file-naming convention itself that guarantees the nesting.
// -----------------------------------------------------------------------
// Each list route is a sibling of its $id detail route under a shared
// Outlet-only layout file (that layout file legitimately has no
// AdminShellChrome of its own -- see the routing-bug fix commit for why
// that split is required), so this check targets the .index.tsx list
// content and the $id detail routes, not the bare layout files.
const newAdminRoutes = [
  "src/routes/_authenticated.admin.users.index.tsx",
  "src/routes/_authenticated.admin.users.$userId.tsx",
  "src/routes/_authenticated.admin.applications.index.tsx",
  "src/routes/_authenticated.admin.applications.$applicationId.tsx",
  "src/routes/_authenticated.admin.assessments.index.tsx",
  "src/routes/_authenticated.admin.assessments.$assessmentId.tsx",
  "src/routes/_authenticated.admin.assignments.index.tsx",
  "src/routes/_authenticated.admin.assignments.$assignmentId.tsx",
  "src/routes/_authenticated.admin.results.index.tsx",
  "src/routes/_authenticated.admin.results.$assignmentId.tsx",
  "src/routes/_authenticated.admin.workforce.index.tsx",
  "src/routes/_authenticated.admin.workforce.$employeeId.tsx",
];
for (const routeFile of newAdminRoutes) {
  const src = read(routeFile);
  expect(
    src.includes("AdminShellChrome"),
    `${routeFile} must render inside AdminShellChrome (the shared admin-gated shell)`,
  );
}

// Superadmin-only action must be gated in the UI on isSuperadmin, not
// merely isAdmin -- otherwise a plain admin would see (and could attempt)
// controls that only ever fail server-side, which is a worse UX than a
// security hole but still a real regression to guard against.
const userDetailRoute = read("src/routes/_authenticated.admin.users.$userId.tsx");
expect(
  userDetailRoute.includes("whoAmI.data?.isSuperadmin"),
  "the user detail page must gate platform-role grant/revoke controls on isSuperadmin, not isAdmin",
);

// -----------------------------------------------------------------------
// 7. List-route/detail-route sibling structure ("Granska" routing bug).
//    A list route file that renders full page content directly (no
//    <Outlet/>) while a $id detail route shares its dot-prefix gets
//    nested as that list route's CHILD by TanStack Router's flat-file
//    convention -- with no <Outlet/> in the parent, the child can never
//    render (confirmed via routeTree.gen.ts's getParentRoute and the
//    ?routes= debug marker on a live request). Every list module in this
//    phase now follows the same layout(Outlet)+index split already
//    proven correct by _authenticated.admin.jobs.tsx: the bare
//    "_authenticated.admin.<name>.tsx" file must be Outlet-only, and the
//    list content lives in "_authenticated.admin.<name>.index.tsx" with
//    a route path ending in "/" (making it a sibling of the $id route
//    under the shared layout, not its parent).
// -----------------------------------------------------------------------
const listModules = [
  "employers",
  "users",
  "applications",
  "assessments",
  "assignments",
  "results",
  "workforce",
];
for (const name of listModules) {
  const layout = read(`src/routes/_authenticated.admin.${name}.tsx`);
  expect(
    layout.includes("component: () => <Outlet />") && !layout.includes("AdminShellChrome"),
    `_authenticated.admin.${name}.tsx must be an Outlet-only layout (list content belongs in ${name}.index.tsx) -- otherwise its $id sibling route can never render`,
  );
  const indexRoute = read(`src/routes/_authenticated.admin.${name}.index.tsx`);
  expect(
    indexRoute.includes(`createFileRoute("/_authenticated/admin/${name}/")`),
    `_authenticated.admin.${name}.index.tsx must declare its route path with a trailing slash (a true index route, sibling of $id under the layout)`,
  );
}

// -----------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`admin-portal:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("admin-portal:check OK");
