/**
 * Planted defects for interview-start:check.
 *
 * Run: bun run negative-controls:interview-start
 */

import { runControls, type Mutation } from "./runner";

const GUARD = "interview-start:check";
const ROUTING = "src/lib/library/start-routing.ts";
const START = "src/lib/library/start.functions.ts";
const MIG = "supabase/migrations/20261202090000_scp_interview_starts.sql";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "IS-NC-VAKTARE-DEFAULT",
    defect:
      "an interview before any test silently falls back to Väktare in the general environment",
    file: ROUTING,
    find: "  const setup = recorded ?? chosen;",
    replace:
      '  const setup: StartSetup | null = recorded ?? chosen ?? { roleGroup: "operational", roleProfile: "vaktare", environment: "general" };',
    guard: GUARD,
    expect: "IS-NO-GUESS-1",
  },
  {
    id: "IS-NC-SETUP-SWAPPED",
    defect: "a caller's choice silently replaces the setup the test was sent with",
    file: ROUTING,
    find: "  if (recorded && chosen && !same(recorded, chosen)) {",
    replace: "  if (recorded && chosen && !same(recorded, chosen) && false) {",
    guard: GUARD,
    expect: "IS-ROUTE-2",
  },
  {
    id: "IS-NC-WRONG-TEST-GUIDE",
    defect:
      "a role whose test was not the one taken is accepted, so the interview follows another test",
    file: ROUTING,
    find: "  if (testSlug !== null && content.assessmentSlug !== testSlug) {",
    replace: "  if (false) {",
    guard: GUARD,
    expect: "IS-ROUTE-2",
  },
  {
    id: "IS-NC-APP-CREATES",
    defect: "the app creates the case itself instead of through the serialised start",
    file: START,
    find: '    const res = (await rpc(db, "scp_iv_start_interview", {',
    replace: '    const res = (await rpc(db, "scp_iv_create_case", {',
    guard: GUARD,
    expect: "IS-ATOMIC-1",
  },
  {
    id: "IS-NC-NO-LOCK",
    defect: "the start no longer serialises two concurrent callers",
    file: MIG,
    find: "  PERFORM pg_advisory_xact_lock(hashtextextended('scp_iv_start:' || _employer_id::text || ':' || _key, 0));\n",
    replace: "",
    guard: GUARD,
    expect: "IS-ATOMIC-2",
  },
  {
    id: "IS-NC-APPLICATION-UNIQUE",
    defect:
      "one interview per application is forced, so TRUST and BESKT (or two tests) cannot each have one",
    file: MIG,
    find: "  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE RESTRICT,",
    replace:
      "  application_id uuid NOT NULL UNIQUE REFERENCES public.job_applications(id) ON DELETE RESTRICT,",
    guard: GUARD,
    expect: "IS-ATOMIC-3",
  },
  {
    id: "IS-NC-DB-EXTERNAL-REF",
    defect: "the database start files the candidate under a reference instead of their account",
    file: MIG,
    find: "    _app.applicant_user_id,\n    CASE WHEN _app.applicant_user_id IS NULL THEN 'APP-'",
    replace: "    NULL,\n    CASE WHEN _app.applicant_user_id IS NULL THEN 'APP-'",
    guard: GUARD,
    expect: "IS-BIND-1",
  },
  {
    id: "IS-NC-EXT-FALLBACK",
    defect: "a TRUST case from an application is filed under an invented EXT- id again",
    file: "src/lib/interview-intelligence/runtime.functions.ts",
    find: "  if (data.applicationId) {\n    const app = await context.supabase",
    replace:
      "  if (data.bindApplicant && data.applicationId) {\n    const app = await context.supabase",
    guard: GUARD,
    expect: "IS-BIND-2",
  },
  {
    id: "IS-NC-LATEST-TEST",
    defect: "every Förbered intervju button carries the first test on the application, not its own",
    file: "src/components/academy/ApplicationAssessmentPanel.tsx",
    find: "                assessmentAssignmentId={a.assignmentId}",
    replace: "                assessmentAssignmentId={rows[0]!.assignmentId}",
    guard: GUARD,
    expect: "IS-SOURCE",
  },
  {
    id: "IS-NC-CLAIMS-COMPLETE",
    defect: "a reopened case with missing setup or material is presented as complete",
    file: START,
    find: "      complete: res.setup_recorded && res.material > 0,",
    replace: "      complete: true,",
    guard: GUARD,
    expect: "IS-HONEST",
  },
];

await runControls("interview-start", MUTATIONS);
