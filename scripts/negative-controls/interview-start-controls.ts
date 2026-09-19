/**
 * Planted defects for interview-start:check.
 *
 * Run: bun run negative-controls:interview-start
 */

import { runControls, type Mutation } from "./runner";

const GUARD = "interview-start:check";
const START = "src/lib/library/start.functions.ts";
const MIG = "supabase/migrations/20261202090000_scp_interview_starts.sql";
const NEW_CASE = "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.new.tsx";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "IS-NC-TEST-RELABELLED",
    defect:
      "the start no longer checks the test's definition, so a Väktare test can be relabelled as another role's",
    file: MIG,
    find: "  IF _source_kind = 'assessment_assignment'\n     AND _link.assessment_definition_id IS DISTINCT FROM _test_def THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "IS-DB-VERIFY",
  },
  {
    id: "IS-NC-GUIDE-TRUSTED",
    defect:
      "a supplied guide is trusted because the employer may start it, not because it is the setup's guide",
    file: MIG,
    find: "        WHERE v.id = _pack_version_id AND v.pack_id = _link.interview_pack_id) THEN",
    replace: "        WHERE v.id = _pack_version_id) THEN",
    guard: GUARD,
    expect: "IS-DB-VERIFY",
  },
  {
    id: "IS-NC-GROUP-IGNORED",
    defect: "a role profile is accepted under any role group",
    file: MIG,
    find: "  IF NOT FOUND OR _profile.role_group <> _g THEN",
    replace: "  IF NOT FOUND THEN",
    guard: GUARD,
    expect: "IS-DB-VERIFY",
  },
  {
    id: "IS-NC-LINK-ANY-ROLE",
    defect: "a content link may name another role's guide",
    file: MIG,
    find: "        WHERE p.id = NEW.interview_pack_id AND p.pack_kind = 'role_interview' AND p.role_id = rp.role_id) THEN",
    replace: "        WHERE p.id = NEW.interview_pack_id AND p.pack_kind = 'role_interview') THEN",
    guard: GUARD,
    expect: "IS-DB-LINK",
  },
  {
    id: "IS-NC-CATALOGUE-DRIFT",
    defect: "the library's display catalogue names a guide the database does not link",
    file: "src/lib/library/catalogue.ts",
    find: 'vaktare: { guidePackSlug: "vaktare-se", assessmentSlug: "security-officer-recruitment" },',
    replace:
      'vaktare: { guidePackSlug: "vaktare-se-v2", assessmentSlug: "security-officer-recruitment" },',
    guard: GUARD,
    expect: "IS-PARITY",
  },
  {
    id: "IS-NC-APP-CREATES",
    defect: "the app creates the case itself instead of through the serialised start",
    file: START,
    find: '    "scp_iv_start_interview" as never,',
    replace: '    "scp_iv_create_case" as never,',
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
    find: "  application_id uuid REFERENCES public.job_applications(id) ON DELETE RESTRICT,",
    replace:
      "  application_id uuid UNIQUE REFERENCES public.job_applications(id) ON DELETE RESTRICT,",
    guard: GUARD,
    expect: "IS-ATOMIC-3",
  },
  {
    id: "IS-NC-BESKT-UNLINKED",
    defect:
      "a BESKT start creates the case without its governed link, so a vetting case is open to every member",
    file: MIG,
    find: "    PERFORM public.bcp_link_preparation_to_case(\n",
    replace: "    PERFORM public.bcp_link_preparation_to_case_later(\n",
    guard: GUARD,
    expect: "IS-BESKT-1",
  },
  {
    id: "IS-NC-BESKT-FORM-DIRECT",
    defect: "the new-case form creates a BESKT case directly again, outside the atomic start",
    file: NEW_CASE,
    find: "      if (besktAssignment || applicationId) {",
    replace: "      if (false) {",
    guard: GUARD,
    expect: "IS-BESKT-2",
  },
  {
    id: "IS-NC-DB-CALLER-AS-CANDIDATE",
    defect: "the start binds the case to the caller instead of the application's applicant",
    file: MIG,
    find: "    _candidate := _app.applicant_user_id;",
    replace: "    _candidate := auth.uid();",
    guard: GUARD,
    expect: "IS-BIND-1",
  },
  {
    id: "IS-NC-CLIENT-APPLICATION-CASE",
    defect: "the client path creates application-bound cases again, beside the start",
    file: "src/lib/interview-intelligence/runtime.functions.ts",
    find: "  if (data.applicationId) {\n    throw new Error(",
    replace: "  if (false) {\n    throw new Error(",
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
    find: "    complete: res.setup_recorded && res.material > 0,",
    replace: "    complete: true,",
    guard: GUARD,
    expect: "IS-HONEST",
  },
];

await runControls("interview-start", MUTATIONS);
