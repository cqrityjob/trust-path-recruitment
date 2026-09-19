/**
 * Planted defects for library-direct-access:check.
 *
 * Run: bun run negative-controls:library-direct-access
 */

import { runControls, type Mutation } from "./runner";

const MIG = "supabase/migrations/20261201090000_scp_library_direct_access.sql";
const GUARD = "library-direct-access:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "LD-NC-GRANT-REQUIRED-AGAIN",
    defect:
      "a start path goes back to demanding a per-employer pilot grant -- the manual queue returns",
    file: MIG,
    find: "  -- 20261201090000: the one entitlement rule, no per-employer grant.\n  IF NOT public.bcp_offer_covers(_employer_id, _method_version_id) THEN",
    replace:
      "  -- 20261201090000: the one entitlement rule, no per-employer grant.\n  IF NOT (public.bcp_offer_covers(_employer_id, _method_version_id) AND public.bcp_pilot_grant_active(_employer_id, _method_version_id)) THEN",
    guard: GUARD,
    expect: "LD-PATHS",
  },
  {
    id: "LD-NC-INACTIVE-EMPLOYER",
    defect: "an employer that is not active reaches the offer",
    file: MIG,
    find: "  SELECT coalesce(public.employer_is_active_status(_employer_id), false)\n     AND (public.bcp_version_is_runnable(_method_version_id)",
    replace: "  SELECT true\n     AND (public.bcp_version_is_runnable(_method_version_id)",
    guard: GUARD,
    expect: "LD-OFFER",
  },
  {
    id: "LD-NC-EMPLOYER-OPENS-CONTENT",
    defect: "any signed-in user can make content available, not only the platform publisher",
    file: MIG,
    find: "  IF NOT public.scp_has_content_role(auth.uid(), 'publisher') THEN\n    RAISE EXCEPTION 'BESKT_NOT_PUBLISHER: changing availability",
    replace: "  IF false THEN\n    RAISE EXCEPTION 'BESKT_NOT_PUBLISHER: changing availability",
    guard: GUARD,
    expect: "LD-SETTER",
  },
  {
    id: "LD-NC-AVAILABILITY-PUBLISHES",
    defect: "making content available quietly publishes it, as if it had been reviewed",
    file: MIG,
    find: "     SET pilot_availability = _target, revision = _v.revision + 1, updated_at = now()",
    replace:
      "     SET pilot_availability = _target, content_status = 'published', revision = _v.revision + 1, updated_at = now()",
    guard: GUARD,
    expect: "LD-NO-REVIEW",
  },
  {
    id: "LD-NC-OPEN-CONTENT-EDITABLE",
    defect: "content employers can start stays editable, so it drifts under their assignments",
    file: MIG,
    find: "  IF _v.pilot_availability = 'open' THEN\n    RAISE EXCEPTION\n      'BESKT_OPEN_FROZEN",
    replace: "  IF false THEN\n    RAISE EXCEPTION\n      'BESKT_OPEN_FROZEN",
    guard: GUARD,
    expect: "LD-FROZEN",
  },
  {
    id: "LD-NC-PREDICATE-PUBLIC",
    defect:
      "the entitlement predicate becomes callable by signed-in users, an oracle over other employers",
    file: MIG,
    find: "REVOKE ALL ON FUNCTION public.bcp_offer_covers(uuid, uuid) FROM PUBLIC, anon, authenticated;",
    replace: "REVOKE ALL ON FUNCTION public.bcp_offer_covers(uuid, uuid) FROM PUBLIC, anon;",
    guard: GUARD,
    expect: "LD-GRANTS",
  },
  {
    id: "LD-NC-SETUP-CROSS-TENANT",
    defect: "a setup is written for a case the caller may not work on",
    file: MIG,
    find: "          AND public.scp_iv_can_write_case(c.id)) THEN",
    replace: "          ) THEN",
    guard: GUARD,
    expect: "LD-SETUP-WRITE",
  },
  {
    id: "LD-NC-SUITE-SHRUNK",
    defect: "the harness accepts a direct-access suite that lost its assertions",
    file: "scripts/db-test.sh",
    find: 'if [ "$LD_PASSED" -lt 34 ]; then',
    replace: 'if [ "$LD_PASSED" -lt 1 ]; then',
    guard: GUARD,
    expect: "LD-HARNESS",
  },
];

await runControls("library-direct-access", MUTATIONS);
