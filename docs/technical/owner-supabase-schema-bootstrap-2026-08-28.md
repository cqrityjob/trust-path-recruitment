# CQrityjob owner Supabase — schema bootstrap runbook

**Status:** owner authorisation PR · schema only · no application cutover · 2026-08-28

## Purpose

Bootstrap the complete canonical CQrityjob database schema into the empty,
owner-controlled Supabase project without changing the live Lovable application
or writing to the current Lovable Cloud backend.

This is intentionally a **schema/reference-data bootstrap only**. Auth users,
customer/candidate data and Storage objects are not migrated in this step.

## Locked identities

| Role | Identifier |
|---|---|
| Lovable application | `9ec625ef-34a1-4b4b-8cbb-712cae168579` |
| Current live backend — remains live | `zrahptwsnjcdyzfywbeh` |
| Owner Supabase schema target | `vcgwvtmzftmulmoxmufv` |
| Permanently excluded | `mlvzmiutmyyqeuvjglco` |

Any other target is a stop condition.

## Repository proof before authorisation

PR #127 established the backend target lock and the transition plan.
PR #126 then merged the open-pilot entitlement onto that locked baseline.

Post-merge main:

- commit: `cd0e5d8b7c9bed9224682f25289072126e723e9e`
- GitHub CI #449: success
- clean full-history migration replay: success
- RLS/rollback tests: success
- lint/typecheck/deterministic guards: success
- backend deployment target lock: success
- latest canonical migration: `20260925090000_scp_interview_open_pilot_entitlement.sql`

The schema bootstrap must therefore deploy **the repository's full canonical
migration history at this exact or later reviewed main**, never copied SQL from
chat and never a Lovable-generated migration.

## Current live inventory — read-only evidence

Read-only inventory was taken from Lovable project
`9ec625ef-34a1-4b4b-8cbb-712cae168579` immediately after PR #126 merged.
No row was changed.

- hosted migration ledger: 187 rows
- latest hosted migration: `20260924090000`
- database size: approximately 36 MB
- Auth: 16 users / 15 identities
- Storage: 3 private buckets / 19 objects
- `database_export_22_08_26`: 1 object, approximately 2.7 MB
- `job-application-cvs`: 9 objects
- `passport-evidence`: 9 objects
- public profiles: 15
- employers: 11
- employer memberships: 10
- jobs: 21
- job applications: 11
- assessment assignments: 27
- Passport profiles: 4
- Passport claims: 37
- Passport evidence rows: 11
- Interview Intelligence cases/sessions: 0 / 0

The 22 August export is **not** accepted as the final migration backup because it
predates the current state. A fresh source export is mandatory before any Auth,
customer/candidate data or Storage import and before application cutover.

That fresh export is not a prerequisite for this isolated schema bootstrap:
the live backend is not written, disconnected or replaced here. If bootstrap
fails, rollback is simply to disable deployment to the unused owner project and
leave the existing live application on `zrahptwsnjcdyzfywbeh`.

## Bootstrap mechanism

Use **only the official Supabase GitHub integration attached to the owner
project `vcgwvtmzftmulmoxmufv`**.

Repository:

`cqrityjob/trust-path-recruitment`

Integration configuration:

- Working directory: `.`
- Production branch: `main`
- Automatic branching: OFF
- Deploy to production: enable only after this PR is merged and owner approval

Do not add a second GitHub Actions deployment workflow. Do not add Supabase
access tokens or database passwords to this repository for this bootstrap.
Do not run `supabase link`, `supabase db push` or `supabase migration repair`
from a developer machine or from GitHub Actions.

Supabase's GitHub integration is the deployment runner. GitHub remains the
canonical schema source.

## Exact owner sequence

1. Merge this PR only after CI is green.
2. Open owner project `vcgwvtmzftmulmoxmufv` in Supabase.
3. Project Settings → Integrations → GitHub.
4. Confirm the connected repository is exactly `cqrityjob/trust-path-recruitment`.
5. Confirm working directory `.` and production branch `main`.
6. Confirm the project shown in the Supabase dashboard is
   `vcgwvtmzftmulmoxmufv` — stop if it is any other ref.
7. Enable **Deploy to production**.
8. Let the Supabase deployment finish. Do not retry a running deployment.
9. Record the deployment result before any application configuration changes.

No Lovable publish or application environment change occurs in this sequence.

## Required post-bootstrap verification

Before any data import or Lovable cutover, prove all of the following against
`vcgwvtmzftmulmoxmufv`:

1. Remote migration history reaches canonical `20260925090000` with no failed
   migration.
2. Expected public schemas/tables/functions exist.
3. RLS is enabled on governed tables and candidate/employer/admin negative
   boundaries match the repository suites.
4. The Interview Intelligence / CQrity TRUST objects and open-pilot entitlement
   exist.
5. No production AI provider or transcription credential has been enabled.
6. The new project contains no migrated Auth users yet unless a separately
   approved Auth-import step has occurred.
7. Storage contains no migrated CV or Passport evidence objects yet unless a
   separately approved Storage-import step has occurred.
8. Generate TypeScript types from the owner project and compare them to the
   repository contract before cutover; do not overwrite repository types merely
   because formatting/order differs.

## Data/Auth/Storage phase — separate gate

After schema proof, take a **fresh** export/inventory of the current live backend
and classify records into:

- production/user data to migrate;
- disposable UAT/test data to recreate or omit;
- reference data already recreated by canonical migrations;
- obsolete data retained only in rollback evidence.

Auth identities and Storage objects are separate migration workstreams. No
candidate CV, Passport evidence or authentication identity may be silently lost
or relinked to the wrong user id.

## Application cutover — explicitly not authorised here

This PR does **not** authorise:

- changing `.env` from `zrahptwsnjcdyzfywbeh`;
- changing `supabase/config.toml` to the owner project;
- changing `supabase/migrations-policy.json` canonical hosted identity;
- connecting Lovable runtime to the owner project;
- publishing Lovable against the owner project;
- migrating Auth users or personal/customer data;
- migrating Storage objects;
- enabling AI or transcription.

Those changes require post-bootstrap verification, migration evidence and a
separate owner-approved cutover PR.

## Rollback

Until application cutover, rollback is deliberately simple:

1. Disable **Deploy to production** in the owner project's Supabase GitHub
   integration.
2. Make no change to Lovable runtime configuration.
3. Keep the current live backend `zrahptwsnjcdyzfywbeh` serving the application.
4. Investigate or recreate the unused owner project if schema bootstrap failed.

No rollback SQL against the live backend is required because this bootstrap
never writes there.

## Stop conditions

Stop immediately if:

- the Supabase dashboard project ref is not `vcgwvtmzftmulmoxmufv`;
- the repository is not `cqrityjob/trust-path-recruitment`;
- production branch is not `main`;
- the project is discovered to contain unexpected pre-existing application data;
- Supabase proposes a migration outside the canonical repository history;
- the excluded ref `mlvzmiutmyyqeuvjglco` appears anywhere as a target;
- Lovable generates or applies a migration independently;
- the live application is repointed before owner-project UAT is complete.
