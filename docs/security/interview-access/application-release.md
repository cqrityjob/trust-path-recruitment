# Interview capability application release

Stacked after schema PR #404. `getInterviewCase` keeps the caller's JWT and its
existing case-visibility check, then calls `readInterviewCaseCapabilities` with
that case ID. The reader uses only `scp_iv_case_capabilities`; there is no raw
configuration-table fallback. Database/transport/shape errors remain errors,
rather than silently reporting a disabled feature. Only the two boolean fields
are retained, even if a malformed response includes extra metadata.

Do not merge until 20270206090000 is applied, verified read-only and recorded in
release-state.json. The schema-first guard must remain red until that evidence
exists. Do not mark the pending migration applied just to make this PR green.

After merge, Claude must publish the application and verify a permitted case
with AI disabled and enabled using approved test accounts. Only then may the
separate 20270207090000 configuration contract be applied. During expand the
old reader remains supported; after contract only the new reader works for
non-admins. No production write or publication was performed by this task.

Local tests: 30 deterministic reader assertions and 8 actual application-reader
checks against synthetic actors over real local PostgREST passed before contract.
Contract must rerun the actual reader to prove it no longer depends on table access.
