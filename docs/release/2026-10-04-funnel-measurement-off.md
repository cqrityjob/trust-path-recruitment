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
  a destructive production action that is not decided: the content and
  classification are checked first (section "Not decided" below).
- **The database function.** `cd_record_funnel_event` is still `EXECUTE`-granted to
  `anon` and `authenticated` (`20260916090000_security_hardening_expand.sql`).
  Nothing in the application calls it, but a client holding the public key can
  still write a row directly through PostgREST; for a signed-in caller the
  function derives the user id from the session. Revoking the grant is an
  optional hardening that needs a migration, which this change does not write
  (version 2 backlog, `docs/release/2026-10-04-version-1-launch-status.md`).
- **The hosting layer's own visitor analytics.** The published site is served
  with a script that the host adds to every HTML response at build time, outside
  this application and not in the build output:
  `<script defer src="/~flock.js" data-proxy-url="/~api/analytics">`. Verified
  on www.cqrityjob.com on 2026-10-04 by the release session (deployment
  e3ecf917): it is Lovable's "Visitor analytics", which Lovable's documentation
  says is built on Tinybird. It posts a `page_hit` with the user agent, the
  language, a country derived from the time zone, the referrer, the path and the
  whole URL to `/~api/analytics`, and sets a cookie `session-id` (a random UUID,
  Max-Age 1800, Secure); depending on configuration it may also use
  localStorage or sessionStorage. Per Lovable's documentation it can be turned
  off under Project settings, General, Publishing, Visitor analytics. That needs
  the owner's Lovable access and has not been done. `FUNNEL_MEASUREMENT_ENABLED`
  does not cover it and no change in this repository can switch it off
  (`src/lib/security-passport/share-transport.ts` explains why Security Passport
  share links are built so that the share key never reaches it). So the privacy
  policy does not say "we do not measure". It says that CQrityjob's own
  measurement is off, and what the supplier's statistics register while it is
  on, and it lists Tinybird as an open point in the supplier table
  (`open-facts-2026-10-04.md`, item 4). `launch-legal:check` 1.14 requires that
  wording and forbids "Vi mäter inte". After the owner turns it off and the live
  site has been checked, the text can be tightened in a later change.
- **The privacy policy.** Its sentence about anonymous measurement is replaced in
  this same PR by "Vi gör ingen egen mätning av hur du använder tjänsten, och vi lagrar
  ingen statistikmarkering i webbläsaren." `launch-legal:check` 1.14 holds that
  sentence only while the constant is `false`.

## Not decided: classify first, then decide (the 339 rows)

Owner decision, 2026-10-04: the 339 old rows stay until their content and
classification have been checked. No new collection and no deletion. Whether
they are deleted, kept for a period or anonymised is **not decided and needs the
classification first**. The statements below are a reading aid for that check,
not a prepared deletion:

```sql
-- Count and range (read-only); compare with the 339 rows read on 2026-10-04.
select count(*), min(occurred_at), max(occurred_at) from public.cd_v31_funnel_events;
```

A deletion is a separate decision with its own statement, written after the
classification, and is never run by an automated session.

## Turning measurement on again

Not by changing the constant alone. `funnel-measurement:check` fails on a caller
that can still reach the server or storage while it is `false`, and
`launch-legal:check` (1.14) fails when it is `true` while the policy still says
CQrityjob does not measure. The policy must be changed to describe the measurement,
its purpose, its retention and who can read it, in the same change.
