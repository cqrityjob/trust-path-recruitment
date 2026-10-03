/**
 * Employer access lifecycle negative controls.
 *
 * ── WHY THESE EXIST ────────────────────────────────────────────────────
 *
 * employer-access-lifecycle:check asserts that a leaver can be taken out, that a
 * removed member is told, that a layout does not render before it has decided,
 * that an identity change asks first and that a refusal names its reason. None of
 * its assertions proves it would NOTICE if one of those stopped being true. Each
 * mutation below introduces exactly one of those defects, in the real file, in
 * the shape a careless edit would produce, and requires the guard to fail with a
 * named diagnostic.
 *
 * The harness restores every file byte-for-byte and verifies the tree is clean
 * afterwards. See scripts/negative-controls/runner.ts.
 *
 * Run: bun run negative-controls:employer-access-lifecycle
 */

import { runControls, type Mutation } from "./runner";

const GUARD = "employer-access-lifecycle:check";

const MEMBERSHIP = "src/lib/job-intelligence/membership-admin.ts";
const MEMBERS_UI = "src/components/admin/AdminEmployerMembers.tsx";
const ADMIN_ROUTE = "src/routes/_authenticated.admin.employers.$employerId.tsx";
const STATE = "src/lib/job-intelligence/employer-access-state.ts";
const GATE = "src/routes/_authenticated.employer.$employerSlug.tsx";
const PENDING = "src/routes/_authenticated.employer.pending.tsx";
const ONBOARDING = "src/routes/_authenticated.employer.onboarding.tsx";
const SETTINGS = "src/routes/_authenticated.employer.$employerSlug.settings.tsx";
const SETTINGS_FN = "src/lib/job-intelligence/employer-settings.functions.ts";
const IDENTITY = "src/lib/job-intelligence/identity-rereview.ts";
const ACCESS = "src/lib/library/test-assignment-access.ts";
const START = "src/lib/library/start.functions.ts";
const DIALOG = "src/components/recruitment/SendTestDialog.tsx";
const ADMIN_ERROR = "src/lib/admin/admin-error.ts";
const DICT = "src/i18n/dictionaries.ts";

const MUTATIONS: readonly Mutation[] = [
  /* ---- 1 · members ------------------------------------------------ */
  {
    id: "AC-FINAL-OWNER-IGNORES-OTHER-OWNERS",
    defect:
      "the page decides an owner is the only one even when another ACTIVE owner exists, so a second owner could never be removed",
    file: MEMBERSHIP,
    find: '  return !members.some((m) => m.id !== membershipId && m.role === "owner" && m.status === "active");',
    replace: "  return true;",
    guard: GUARD,
    expect: "with a second ACTIVE owner either may go",
  },
  {
    id: "AC-FINAL-OWNER-REFUSAL-NOT-RECOGNISED",
    defect:
      "the database's final-owner refusal is no longer recognised, so it reaches the administrator as 'could not be completed'",
    file: MEMBERSHIP,
    find: "  if (/only active owner/i.test(message)) {",
    replace: "  if (/never matches this wording/i.test(message)) {",
    guard: GUARD,
    expect: "the final-owner refusal is recognised and carried as a stable code",
  },
  {
    id: "AC-FINAL-OWNER-CODE-UNMAPPED",
    defect: "the final-owner code has no sentence of its own and falls to 'unknown'",
    file: ADMIN_ERROR,
    find: '  ADMIN_MEMBERSHIP_FINAL_OWNER: "membership_final_owner",',
    replace: '  ADMIN_MEMBERSHIP_FINAL_OWNER: "unknown_error",',
    guard: GUARD,
    expect: "and resolves to its own sentence, in both languages",
  },
  {
    id: "AC-CONFIRM-WITHOUT-FINAL-OWNER-BLOCK",
    defect:
      "the confirm button stays enabled for the organisation's only active owner, offering an action that cannot work",
    file: MEMBERS_UI,
    find: "disabled={change.isPending || blockedByFinalOwner || roleUnchanged}",
    replace: "disabled={change.isPending}",
    guard: GUARD,
    expect: "the final-owner case is said BEFORE the button and the button is withheld",
  },
  {
    id: "AC-RAW-ERROR-ON-SCREEN",
    defect: "a failed membership change renders the server's own message",
    file: MEMBERS_UI,
    find: '<AdminActionError error={change.error} className="mt-2 text-sm text-destructive" />',
    replace: '<p role="alert">{(change.error as Error | null)?.message}</p>',
    guard: GUARD,
    expect: "a failure goes through the admin error contract, never a raw message",
  },
  {
    id: "AC-PAGE-NOT-REFRESHED",
    defect:
      "the organisation page is not refetched after a change, so a removed member still looks active",
    file: MEMBERS_UI,
    find: '      void qc.invalidateQueries({ queryKey: ["admin", "employer-detail", employerId] });\n',
    replace: "",
    guard: GUARD,
    expect: "success is visible, and the page's own read and the moderation list are refreshed",
  },
  {
    id: "AC-CONTROLS-UNMOUNTED",
    defect:
      "the organisation page goes back to a read-only members table, so the controls exist and nothing mounts them",
    file: ADMIN_ROUTE,
    find: "<AdminEmployerMembers employerId={employerId} memberships={employer.memberships} />",
    replace: "<p>{employer.memberships.length}</p>",
    guard: GUARD,
    expect: "the organisation page mounts the member controls with the page's own memberships",
  },

  /* ---- 2 · dead ends ---------------------------------------------- */
  {
    id: "AC-GATE-RENDERS-WHILE-LOADING",
    defect:
      "the workspace layout answers 'open' while the workspace list is still loading, so a pending organisation's pages fire refused calls",
    file: STATE,
    find: '  if (input.loaded === "pending") return "wait";',
    replace: '  if (input.loaded === "pending") return "open";',
    guard: GUARD,
    expect: "while the list is loading the gate WAITS",
  },
  {
    id: "AC-GATE-OUTLET-BEFORE-DECISION",
    defect:
      "the layout only holds back a redirect, so children render for every state in which it has not decided",
    file: GATE,
    find: 'if (decision !== "open") {',
    replace: 'if (decision === "redirect") {',
    guard: GUARD,
    expect: "the layout uses the decision and returns BEFORE <Outlet />",
  },
  {
    id: "AC-REMOVED-NOT-DETECTED",
    defect: "a removed membership is no longer recognised, so a leaver is offered the company form",
    file: STATE,
    find: '  if (memberships.some((m) => m.status === "removed")) return "removed";',
    replace: '  if (memberships.some((m) => m.status === "gone")) return "removed";',
    guard: GUARD,
    expect: "a removed membership is 'removed'",
  },
  {
    id: "AC-ONBOARDING-FLASHES-FORM",
    defect:
      "onboarding no longer waits for the memberships, so the company form is shown to a leaver for a frame",
    file: ONBOARDING,
    find: "  if (membershipsQuery.isPending) {",
    replace: "  if (false) {",
    guard: GUARD,
    expect: "and shows nothing but a wait until they have answered",
  },
  {
    id: "AC-ONBOARDING-IGNORES-MEMBERSHIPS",
    defect: "onboarding stops consulting the membership standing at all",
    file: ONBOARDING,
    find: "  const accessEnded = accessEndedKind(membershipsQuery.data);",
    replace: "  const accessEnded = null as ReturnType<typeof accessEndedKind>;",
    guard: GUARD,
    expect: "onboarding reads the caller's own memberships",
  },
  {
    id: "AC-REJECTED-DEAD-END",
    defect: "a rejected organisation is told to 'contact us' with no address, as before",
    file: PENDING,
    find: '            {/* "Hör av dig till oss" with nowhere to write to was a dead end. */}\n            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">\n              {t("employer.contact.writeTo")} <ContactMailto organisationName={org?.employerName} />\n              .\n            </p>\n',
    replace: "",
    guard: GUARD,
    expect: "a rejected organisation has an address to write to",
  },
  {
    id: "AC-POLL-SLOWED",
    defect: "the review page's 12 second poll is changed, so approval is noticed late",
    file: PENDING,
    find: "? false : 12_000,",
    replace: "? false : 120_000,",
    guard: GUARD,
    expect: "the 12 second poll is intact",
  },
  {
    id: "AC-TURNAROUND-PROMISED",
    defect: "the waiting copy promises a review time",
    file: DICT,
    find: "We cannot say how long the review takes. This page updates by itself",
    replace: "The review takes 2 business days. This page updates by itself",
    guard: GUARD,
    expect: "no turnaround is promised anywhere in the review copy",
  },

  /* ---- 3 · identity ----------------------------------------------- */
  {
    id: "AC-IDENTITY-CASE-SENSITIVE",
    defect:
      "the comparison is stricter than the trigger's, so a cosmetic re-type is announced as a review",
    file: IDENTITY,
    find: '  return (value ?? "").trim().toLowerCase();',
    replace: '  return value ?? "";',
    guard: GUARD,
    expect: "a cosmetic re-type (case, surrounding space) is not a change",
  },
  {
    id: "AC-SAVE-WITHOUT-ASKING",
    defect: "the form goes straight to the mutation again, as before",
    file: SETTINGS,
    find: "            submit();\n",
    replace: "            mutation.mutate();\n",
    guard: GUARD,
    expect: "the form submits through submit(), never straight to the mutation",
  },
  {
    id: "AC-CONFIRM-NEVER-OPENS",
    defect: "a changed identity no longer opens the confirmation",
    file: SETTINGS,
    find: "    if (changes.length > 0) {",
    replace: "    if (changes.length > 9999) {",
    guard: GUARD,
    expect: "a changed identity of an ACTIVE organisation opens the confirmation instead of saving",
  },
  {
    id: "AC-REREVIEW-NOT-RECORDED",
    defect:
      "the settings page never records that the save sent the organisation back, so the review page thanks the owner for registering",
    file: SETTINGS,
    find: '      if (status === "active" && result.status === "pending") {',
    replace: "      if (false) {",
    guard: GUARD,
    expect: "the re-review is recorded from THAT answer",
  },
  {
    id: "AC-SERVER-STATUS-NOT-READ",
    defect: "the server function stops reading back the status the write produced",
    file: SETTINGS_FN,
    find: '      .select("status")',
    replace: '      .select("id")',
    guard: GUARD,
    expect: "the server function reports the status the database holds AFTER the write",
  },

  /* ---- 4 · send test ---------------------------------------------- */
  {
    id: "AC-PENDING-CALLED-NOT-ACTIVE",
    defect:
      "an organisation under review is reported as 'not active', so the owner is not told a review is the reason",
    file: ACCESS,
    find: '  if (status === "pending" || status === "draft") {',
    replace: '  if (status === "draft") {',
    guard: GUARD,
    expect: "an owner of a pending organisation is told it is UNDER REVIEW",
  },
  {
    id: "AC-ACCESS-READS-ROLE-ONLY",
    defect: "the access read stops looking at the organisation's status, as before",
    file: START,
    find: '      .select("role, employers(status)")',
    replace: '      .select("role")',
    guard: GUARD,
    expect: "the server function reads the organisation's status with the membership",
  },
  {
    id: "AC-DIALOG-BARE-BOOLEAN",
    defect: "the dialog compares the answer to a bare boolean again and never shows the reason",
    file: DIALOG,
    find: "    access.data?.allowed === true &&",
    replace: "    access.data !== undefined &&",
    guard: GUARD,
    expect: "both places that ask render the reason",
  },
];

runControls("employer-access-lifecycle", MUTATIONS);
