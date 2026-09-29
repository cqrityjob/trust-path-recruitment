# Career Discovery — release control

**Migration:** `20261222090000_cd_access_policy.sql`. **Resolves:** CI-01 of the
2026-09-28 release UAT (`docs/release/2026-09-28-release-uat-report.md`).

## The problem it removes

Since 2026-08-14 a signed-in person could start and save a Career Discovery run
only when `cd_is_internal_tester()` said so: a row in `cd_internal_testers`, or
a platform admin. Production has no tester rows. So an anonymous visitor could
complete the analysis and claim the result at signup, while a signed-in
candidate saw "Karriäranalysen är inte öppen just nu" and My Career hid every
assessment door. Right for an internal test, wrong for a launch.

## The control

One row in `public.cd_access_policy` with three states:

| state | anonymous entrance | signed-in start/save | who decides for a signed-in user |
| --- | --- | --- | --- |
| `internal_test` (shipped) | open | allowlisted testers and platform admins | `cd_is_internal_tester()` |
| `public` | open | every signed-in user | nobody; the allowlist is kept but not consulted |
| `paused` | closed | platform admins only | `is_platform_admin()` |

- `cd_access_state()` reads it (callable by `anon`, so the public entrance can
  close). A missing row reads as `paused`.
- `cd_v31_may_start(_user_id)` answers the signed-in question above.
- `cd_set_access_state(_state, _note)` changes it; platform admins only; the
  row records who and when.
- No client role can read or write the table directly (RLS, no policy).

The application reads the two functions in `getV31Availability` (paused closes
everything, the anonymous preview included) and in `getV31TesterStatus` and the
save path (`resolveSaveGate`). My Career derives its assessment doors from those
same server functions (`scripts/my-career-assessment-gate-check.ts`), so no
page carries its own copy of the rule.

## Opening the analysis (owner action)

Applying the migration changes nothing. To open:

```sql
-- as a signed-in platform admin (auth.uid() must resolve):
SELECT public.cd_set_access_state('public', 'Public launch 2026-10-…');

-- or from the Supabase SQL editor, as the database owner:
UPDATE public.cd_access_policy
   SET state = 'public', note = 'Public launch 2026-10-…', changed_at = now();
```

To close again: `'paused'` (closed to everyone; admins can still verify) or
`'internal_test'` (back to the allowlist). The rollback artifact refuses while
the state is `public`, so closing by rollback is never silent.

## What this deliberately does not decide

The control is **technical availability**. It never edits, and the owner must
decide separately:

1. `cd_definition_versions.lifecycle_status` for `2026-scd-v3.1.0` is `active`
   (content is administrable). Unchanged.
2. `review_status` on that row: all seven governance gates (SME, bias,
   content, language, psychometric, accessibility, privacy/legal) are
   **false**. Unchanged. Opening the product publicly with the gates
   outstanding is an owner decision, not something this migration makes.
3. The version labels read `content_version = v3.1-draft-5`,
   `scoring_version = v3.1-draft-4`. Unchanged; renaming a scoring version is a
   scientific/governance act (`scripts/cd-*` guards pin the lineage).
4. `/security-career-assessment` is `noindex, nofollow` "while the instrument
   is in internal test" (`src/routes/security-career-assessment.tsx`).
   Unchanged; removing it is a separate, owner-approved change at public launch.
5. The signed-out unavailable copy (`cd.public.unavailableTitle/Body`) is the
   same for `paused` and for a non-tester under `internal_test`. Under `public`
   nobody sees it.

Deterministic scoring, frozen snapshots, the claim flow, Career Intelligence
versioning, explainability and the privacy boundaries are untouched: the
migration adds no policy on a candidate table and grants nothing on one.
