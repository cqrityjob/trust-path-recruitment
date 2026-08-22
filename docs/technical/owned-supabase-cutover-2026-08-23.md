# Owned Supabase cutover record — 23 August 2026

## Decision

Move CQrityjob's canonical backend from Lovable Cloud
`zrahptwsnjcdyzfywbeh` to the owner-controlled Supabase project
`mlvzmiutmyyqeuvjglco`. Keep Lovable as frontend build/hosting and keep the
legacy backend untouched until production acceptance.

## Completed

- Applied 52 missing, production-verified canonical migrations to the target
  in order, transactionally, stopping on any error.
- Repaired two hosted ledger identities and registered the active canonical
  rescue migration.
- Imported 7 Auth users and identities while preserving user UUIDs and password
  hashes. Sessions and refresh tokens were intentionally not copied because
  they are signed by the legacy project's JWT secret.
- Imported all operational public data with canonical-ID mapping.
- Verified all 375 public foreign keys: zero orphans.
- Created the private `job-application-cvs` bucket and verified all five
  storage policies.
- Excluded owner-confirmed test CV/passport files and the transfer backup.
- Verified no target Edge Functions exist.
- Added a reversible frontend configuration override that Lovable Cloud cannot
  shadow.
- Built the production application successfully and ran the migration,
  authentication, separation, recruitment-flow and decision-support guards.

## Deliberately not changed

- No write, migration, deletion or cutover was performed against
  `zrahptwsnjcdyzfywbeh`.
- No production Lovable deployment was changed.
- The intentionally pending reporting-rubric migration was not applied.
- Dormant historical Blueprint Engine objects were not deleted.
- No service-role key was committed or exposed client-side.

## Remaining production gates

| Gate | State | Required action |
|---|---|---|
| Owned server secret | Blocked | Store target secret as `CQRITYJOB_SUPABASE_SERVICE_ROLE_KEY` in Lovable |
| Auth redirects | Needs UI verification | Set production and preview URLs in target Supabase Auth |
| Google OAuth | Blocked | Target currently reports `google: false`; configure target OAuth or remove Google login |
| Full authenticated smoke test | Pending previous gates | Verify admin, employer and candidate journeys |
| Production deploy | Not started | Deploy only after all gates pass |

## Safety invariant

If the owned public override is active but the owned server-only secret is
missing, the admin client fails closed. It never falls back to the legacy
service-role key and therefore cannot write to the wrong database.
