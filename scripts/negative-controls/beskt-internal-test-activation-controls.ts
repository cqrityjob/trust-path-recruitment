/**
 * Planted defects for beskt-internal-test-activation:check.
 *
 * Run: bun run negative-controls:beskt-internal-test-activation
 */

import { runControls, type Mutation } from "./runner";

const MIG = "supabase/migrations/20261129090000_bcp_internal_test_activation.sql";
const GUARD = "beskt-internal-test-activation:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "ITA-NC-WORDINGS-ANY-DRAFT",
    defect: "the interviewer's wordings open for any draft, not only covered content",
    file: MIG,
    find: "     OR (_v.content_status <> 'published'\n         AND NOT public.bcp_internal_test_activation_covers(_a.employer_id, _v.id,\n                                                             _a.pinned_content_hash))",
    replace: "     OR _v.content_status NOT IN ('published', 'draft')",
    guard: GUARD,
    expect: "ITA-WORDINGS: the interviewer's wordings open only for the content",
  },
  {
    id: "ITA-NC-ANYONE-ACTIVATES",
    defect: "any signed-in user can record a test activation",
    file: MIG,
    find: "  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN\n    RAISE EXCEPTION 'BCP_NOT_PLATFORM_ADMIN: only a platform administrator may record an internal test activation.'",
    replace:
      "  IF auth.uid() IS NULL THEN\n    RAISE EXCEPTION 'BCP_NOT_PLATFORM_ADMIN: only a platform administrator may record an internal test activation.'",
    guard: GUARD,
    expect: "ITA-GRANT: only a platform admin records an activation",
  },
  {
    id: "ITA-NC-HASH-UNPINNED",
    defect: "an activation keeps working after the content changes",
    file: MIG,
    find: "         AND v.content_hash = t.pinned_content_hash\n         AND v.content_status IN ('draft', 'in_review', 'published'))\n    AND public.bcp_version_is_structurally_candidate_safe(_method_version_id);\n$$;\n\n-- May a PARTY",
    replace:
      "         AND v.content_status IN ('draft', 'in_review', 'published'))\n    AND public.bcp_version_is_structurally_candidate_safe(_method_version_id);\n$$;\n\n-- May a PARTY",
    guard: GUARD,
    expect: "ITA-PIN: the decision pins the content hash",
  },
  {
    id: "ITA-NC-ANY-EMPLOYER",
    defect: "an activation for one employer lets every employer use the version",
    file: MIG,
    find: "       WHERE t.employer_id = _employer_id\n         AND t.method_version_id = _method_version_id\n         AND t.revoked_at IS NULL",
    replace:
      "       WHERE t.method_version_id = _method_version_id\n         AND t.revoked_at IS NULL",
    guard: GUARD,
    expect: "ITA-SCOPE: an activation is live only for its own employer",
  },
  {
    id: "ITA-NC-PREDICATE-EXPOSED",
    defect: "the internal predicate becomes callable by any signed-in user",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.bcp_internal_test_activation_active(uuid, uuid) FROM PUBLIC, anon, authenticated;",
    replace:
      "REVOKE ALL ON FUNCTION public.bcp_internal_test_activation_active(uuid, uuid) FROM PUBLIC, anon;",
    guard: GUARD,
    expect: "ITA-PRIVILEGE: the predicates are internal",
  },
];

await runControls("beskt-internal-test-activation", MUTATIONS);
