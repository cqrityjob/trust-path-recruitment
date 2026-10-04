# Funnel measurement is off in version 1 (2026-10-04)

Owner decision: switch off the optional funnel measurement before version 1,
including the "once per session" markers written to sessionStorage; keep login
and sharing as they are; do not call an event anonymous only because `user_id`
and `session_id` are empty.

## What changed

| Where | Before | Now |
| --- | --- | --- |
| `src/lib/analytics/funnel-measurement.ts` | – | `FUNNEL_MEASUREMENT_ENABLED = false`, a constant. Turning it on is a reviewed change with an owner decision, a privacy policy that describes it and a retention routine. |
| Browser callers (assessment flow, India helper, Career Center, next-step tracker) | sent `trackV31FunnelEvent` | return before the request and before any storage access |
| India helper | wrote `cqj:funnel:once:<event>` to sessionStorage | writes nothing |
| Server function `trackV31FunnelEvent` | wrote a row through `cd_record_funnel_event` | returns `recorded: false` before the database is called, so a stale page cannot write either |

Not touched, on purpose: sign-in round trips, terms acceptance, language,
return-to state, unfinished-assessment buffers, share links. They are not
measurement. `funnel-measurement:check` pins the full list of storage keys the
product names, so a new statistics marker cannot arrive unnoticed.

## What was proven

- `funnel-measurement:check` (CI): every India event through a fake window whose
  sessionStorage and fetch record everything: nothing touched, nothing sent; the
  server write handed a recording client: the database is not called; every
  caller of the server function asks the switch first; the storage-key set, the
  analytics-host list and the dependency list are the reviewed ones. Eight
  planted controls.
- A real browser: `e2e/india-landing.spec.ts` now answers **no** server
  function at all, and asserts that after the page is idle no server-function
  request was made and no `cqj:funnel*` key exists. Run locally against the dev
  server it passes (6/6 on desktop and a 375 px phone); with the constant
  flipped to `true` the same spec fails.

## What is NOT changed here

- **The stored rows.** `cd_v31_funnel_events` holds 339 rows (read-only count,
  2026-10-04), every one with empty `user_id` and `session_id`. An empty id does
  not make an event anonymous: each row has a time, an event name and a small
  detail object. They are not read by anything in the product. Deleting them is
  a destructive production action and needs the owner's approval; the statement
  below is prepared, not run.
- **The database function.** `cd_record_funnel_event` is still granted to
  `anon`. Nothing in the application calls it; revoking the grant is an
  optional hardening that needs a migration, which this change does not write.
- **The privacy policy.** Its sentence about anonymous measurement belongs to the
  legal PR, which is updated for this decision.

## Prepared, not run (needs the owner's approval)

```sql
-- Count first; compare with the 339 rows read on 2026-10-04.
select count(*), min(created_at), max(created_at) from public.cd_v31_funnel_events;

-- Delete (destructive; run once, by the owner or with the owner's explicit approval).
delete from public.cd_v31_funnel_events;
```

## Turning measurement on again

Not by changing the constant alone. `funnel-measurement:check` fails on it, and
the privacy policy's guard fails until the policy describes the measurement, its
purpose, its retention and who can read it.
