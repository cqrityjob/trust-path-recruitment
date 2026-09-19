/**
 * Planted defects for beskt-complete:check.
 *
 * Run: bun run negative-controls:beskt-complete
 */

import { runControls, type Mutation } from "./runner";

const MIG = "supabase/migrations/20261130090000_bcp_beskt_complete.sql";
const GUARD = "beskt-complete:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "BC-NC-ANY-MEMBER-READS-VETTING",
    defect: "any member of the employer becomes a party to a security vetting",
    file: MIG,
    find: "       AND (a.mode = 'recruitment_support'\n            OR public.bcp_is_security_officer(a.employer_id, auth.uid())));",
    replace: "       AND (a.mode IS NOT NULL));",
    guard: GUARD,
    expect: "BC-PARTY",
  },
  {
    id: "BC-NC-CASE-OPEN",
    defect: "a vetting case stays readable by every member after it is linked",
    file: MIG,
    find: "  SELECT auth.uid() IS NOT NULL\n     AND public.has_employer_role(auth.uid(), public.scp_iv_case_employer(_case_id), NULL)\n     AND public.bcp_case_access_ok(_case_id);",
    replace:
      "  SELECT auth.uid() IS NOT NULL\n     AND public.has_employer_role(auth.uid(), public.scp_iv_case_employer(_case_id), NULL);",
    guard: GUARD,
    expect: "BC-CASE",
  },
  {
    id: "BC-NC-NO-ATTESTATION",
    defect: "a security vetting starts without the employer's attestation",
    file: MIG,
    find: "      RAISE EXCEPTION 'BCP_ATTESTATION_REQUIRED",
    replace: "      RAISE NOTICE 'BCP_ATTESTATION_OPTIONAL",
    guard: GUARD,
    expect: "BC-START",
  },
  {
    id: "BC-NC-ANY-ACCOUNT-ACCEPTS",
    defect: "anyone holding the link accepts an invitation meant for someone else",
    file: MIG,
    find: "  IF NOT FOUND OR _i.invited_email <> _email THEN\n    RAISE EXCEPTION 'BCP_INVITATION_NOT_AVAILABLE",
    replace: "  IF NOT FOUND THEN\n    RAISE EXCEPTION 'BCP_INVITATION_NOT_AVAILABLE",
    guard: GUARD,
    expect: "BC-INVITE",
  },
  {
    id: "BC-NC-SIGNATURE-FINALISES",
    defect: "a report finalises without a documented stance",
    file: MIG,
    find: "    code := 'BCP_CONDUCT_STANCE_MISSING';",
    replace: "    code := 'BCP_CONDUCT_NOTHING';",
    guard: GUARD,
    expect: "BC-STANCE",
  },
  {
    id: "BC-NC-VETTING-ITEM-IN-RECRUITMENT",
    defect: "security-vetting content can be answered in a recruitment assignment",
    file: MIG,
    find: "    IF _a.mode <> 'security_vetting_support'\n       AND (_item.permitted_mode <> 'recruitment_support'",
    replace: "    IF false\n       AND (_item.permitted_mode <> 'recruitment_support'",
    guard: GUARD,
    expect: "BC-CONTENT",
  },
];

await runControls("beskt-complete", MUTATIONS);
