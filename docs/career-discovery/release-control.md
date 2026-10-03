# Career Discovery — release control

**Migration:** `20261222090000_cd_access_policy.sql`. **Resolves:** CI-01 of the
2026-09-28 release UAT (`docs/release/2026-09-28-release-uat-report.md`).

> **Updated 2026-10-03.** The full state x actor truth table, the exact opening
> sequence, the before/after checks, the browser checklist and the rollback are
> in `docs/release/2026-10-03-career-analysis-availability.md`; the owner's
> read-only SQL checklist is `supabase/readiness/career-analysis-availability.sql`.
> Items 4 and 5 below, and the sentence about administrators under `paused`,
> were corrected there and here: indexing now follows the state, the closed
> screen says three different true things, and under `paused` the product UI is
> closed to everyone, administrators included.

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
save path (`resolveSaveGate`). Every surface that offers the analysis decides
through ONE resolver (`resolveAnalysisAccess`, `src/lib/career-discovery/
analysis-access.ts`) and ONE client hook (`useCareerAnalysisOpen`), so no page
carries its own copy of the rule (`scripts/career-analysis-availability-check.ts`,
`scripts/my-career-assessment-gate-check.ts`).

The database does **not** refuse a signed-in person's own `cd_sessions` insert
under `paused` or for a non-tester: the gate is the application's
(`resolveSaveGate`). That is pinned by `supabase/tests/cd_availability_matrix_test.sql`
(group M3) so a change on either side is noticed.

## Opening the analysis (owner action)

Applying the migration changes nothing. To open:

```sql
-- as a signed-in platform admin (auth.uid() must resolve):
SELECT public.cd_set_access_state('public', 'Public launch 2026-10-…');

-- or from the Supabase SQL editor, as the database owner:
UPDATE public.cd_access_policy
   SET state = 'public', note = 'Public launch 2026-10-…', changed_at = now();
```

To close again: `'paused'` (closed to everyone) or `'internal_test'` (back to
the allowlist). Under `paused`, `cd_v31_may_start` still answers yes for a
platform admin, but the product UI is closed to everyone (availability is false
and the anonymous result build refuses whoever asks), so verify as an admin
under `internal_test` before opening. The rollback artifact refuses while the
state is `public`, so closing by rollback is never silent.

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
4. Indexing. `/security-career-assessment` is `noindex, nofollow` and absent
   from `sitemap.xml` in every state except `public`, where it is indexable and
   listed. It follows `cd_access_state()` per request and fails closed
   (`src/routes/security-career-assessment.tsx`, `src/routes/sitemap[.]xml.ts`),
   so there is nothing to change by hand at launch (it used to be a hard-coded
   `noindex` with a separate manual removal).
5. The closed screen (`ClosedAnalysisPanel`) says one of three things: paused
   for everyone, not open to this signed-in account (the test group), or the
   instrument unavailable. It names where a finished result is kept and offers
   the career centre, jobs and the Security Passport, never a retry. Under
   `public` nobody sees it.

Deterministic scoring, frozen snapshots, the claim flow, Career Intelligence
versioning, explainability and the privacy boundaries are untouched: the
migration adds no policy on a candidate table and grants nothing on one.
