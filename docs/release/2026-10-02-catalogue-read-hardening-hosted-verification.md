# Catalogue read hardening: hosted verification

**Status: APPLIED and verified read-only on production `wrygicdfxwjnrugduxnt`.**
Merging PR #355 to `main` (head `a7d4138`, CI fully green) triggered the
official Supabase GitHub integration, which applied
`20270101090000_catalogue_read_hardening.sql`. This verification wrote nothing
to the hosted database. Every statement was a read. The behavioural probe ran
inside a transaction that ended in `RAISE`, so it was rolled back.

Change and contract: `docs/release/2026-10-01-catalogue-read-hardening.md`.

## Ledger

| Check | Result |
|---|---|
| `supabase_migrations.schema_migrations` | 335 rows; highest is `20270101090000 / catalogue_read_hardening`, 10 statements |
| Previous 334 identities | preserved |
| md5 of `version:name` joined by newline, all 335 rows | `1ae98c1c7b2b17300e5bade67516ad30`, equal on the connector read and in `supabase/hosted-ledger.json` |

## Objects

| Object | Hosted state |
|---|---|
| `scp_behaviour_versions_read` | `((content_status = 'published'::text) OR scp_can_author(auth.uid()))` |
| `scp_role_versions_read` | `((content_status = 'published'::text) OR scp_can_author(auth.uid()))` |
| `cd_professions_read` | `(approved_for_ranking OR is_platform_admin(auth.uid()))` |
| `scp_interview_guide_prompts_read` | `scp_can_author(auth.uid())` |
| `USING (true)` SELECT policies for anon/authenticated | 41 (was 45) |
| Client INSERT/UPDATE/DELETE on `scp_followup_prompts`, `scp_form_blocks`, `scp_interview_guide_prompts` | none |
| anon SELECT on the four hardened tables | none |

The four predicates are exactly the strings the migration's own postflight
asserts.

## Data

| Table | Rows (unchanged) |
|---|---|
| `scp_behaviour_versions` | 24, all draft |
| `scp_role_versions` | 3, all draft |
| `cd_professions` | 18, of which 4 unapproved |
| `scp_interview_guide_prompts` | 72 |
| `scp_followup_prompts` | 48 |
| `scp_form_blocks` | 15 |

## Behaviour (rolled-back probe)

| Principal | Behaviour drafts | Role drafts | Professions (unapproved) | Guide prompts |
|---|---|---|---|---|
| Real candidate | 0 | 0 | 14 (0) | 0 |
| Real non-author employer member | 0 | 0 | 14 (0) | 0 |
| Real platform admin | 24 | 3 | 18 (4) | 72 |
| anon | — | — | refused, `42501` | — |

The transaction ended in `RAISE`, so it was rolled back.

## Bookkeeping in this change

- `supabase/release-state.json`: the entry is now `applied`, with this evidence.
- `supabase/hosted-ledger.json`: refreshed to all 335 rows.
- `scripts/release-frontier-check.ts`: `expectedPending` is empty.
