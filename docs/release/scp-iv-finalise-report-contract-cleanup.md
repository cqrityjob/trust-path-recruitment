# `scp_iv_finalise_report` — contract removal (the CONTRACT step)

**Status: NOT SCHEDULED. A separate, explicit, owner-approved migration and
pull request. Nothing in #213 or #216 drops the legacy function.**

## The rollout this belongs to

| Step | Where | What |
| --- | --- | --- |
| **EXPAND** | `20261107090000_scp_iv_report_basis_integrity.sql` (#213) | Adds `scp_iv_finalise_previewed_report(uuid, text, uuid)` — the preview-bound finalisation, a separate name, no overload, no defaulted argument — beside the builder, the preview and the governed readbacks. Leaves `scp_iv_finalise_report(uuid, uuid)` **exactly as `20261020090000` defined it**: not dropped, not redefined, not taught to accept or manufacture a preview hash. The apply-time proof asserts both contracts exist; `scp_interview_runtime_test.sql` and group BC of `scp_iv_report_basis_integrity_test.sql` execute the exact legacy call after the migration. |
| **CUTOVER** | The E4 application release (#216) | Every application call site uses `scp_iv_finalise_previewed_report` only. `employer-final-report:check` proves no runtime path calls the legacy name, and a negative control restores a legacy call and detects it. |
| **CONTRACT** | *This document — a future migration* | Drops `scp_iv_finalise_report(uuid, uuid)`. |

The legacy function remains the **temporary legacy production contract** for
the deployed bundle between EXPAND being applied and CUTOVER being published.
Reports it finalises carry an md5 digest and `content_hash_algorithm IS NULL`;
the governed readback names them md5 and verifies them, and the previewed
contract supersedes them like any earlier version.

## Preconditions — all of them, verified, before the CONTRACT migration is written

1. #216 is **merged**.
2. Lovable has **published** the #216 application.
3. The **deployed bundle** is verified to call the new contract: the served
   JavaScript contains `scp_iv_finalise_previewed_report` and does not contain
   `"scp_iv_finalise_report"` as an RPC name.
4. A **real employer preview → finalise → readback journey succeeds** on the
   deployed application against the hosted project (an authorised owner, a
   real case, a verified readback of the version just finalised).
5. **No legacy calls are observed or remain in source**: the hosted Postgres
   logs / `pg_stat_user_functions` show no calls of
   `scp_iv_finalise_report(uuid, uuid)` since the publish, and `git grep
   'rpc("scp_iv_finalise_report"'` on `main` is empty.

None of these can be asserted from a branch. They are checked by the owner on
the deployed system, and the CONTRACT migration is written only afterwards.

## What the CONTRACT migration will contain

```sql
-- <timestamp>_scp_iv_finalise_report_contract.sql
DROP FUNCTION IF EXISTS public.scp_iv_finalise_report(uuid, uuid);

DO $proof$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'scp_iv_finalise_report') THEN
    RAISE EXCEPTION 'SCP_IV_CONTRACT: the legacy finalisation survived';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'scp_iv_finalise_previewed_report') <> 1 THEN
    RAISE EXCEPTION 'SCP_IV_CONTRACT: the previewed finalisation is not exactly one function';
  END IF;
  RAISE NOTICE 'SCP_IV_CONTRACT ok';
END $proof$;
```

With: a rollback that restores the `20261020090000` body verbatim (the text is
in that migration); a `release-state.json` entry; the `scp_a_rollback_test.sql`
Phase 2 drop; `interview-finalisation-capability-check.tsx` updated to expect
the legacy definitions to be gone; and the removal of group BC and the legacy
call in `scp_interview_runtime_test.sql`, which exist only to prove the
transition.

## What it must not do

* Not ship in #213, #216, or any PR before the five preconditions hold.
* Not be applied to hosted Supabase without the owner's explicit approval of
  that specific migration.
* Not touch any finalised report row: versions finalised through the legacy
  contract stay, md5 and all, and remain readable through the governed
  readbacks.
