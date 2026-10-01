# Catalogue read hardening: the four approved items of the "45 tables" review

**Status: PENDING. Schema-only PR, not merged. No hosted write was issued.**
Merging applies the migration to `wrygicdfxwjnrugduxnt` through the official
Supabase GitHub integration. After that, the hosted evidence is recorded in
`release-state.json` and `hosted-ledger.json`, and the name comes off
`expectedPending` in `scripts/release-frontier-check.ts`.

- **Baseline:** `origin/main` `8cfb61c` (merge of PR #346).
- **Migration:** `supabase/migrations/20270101090000_catalogue_read_hardening.sql`
- **Rollback:** `supabase/rollback/20270101090000_catalogue_read_hardening_rollback.sql`
- **Suite:** `supabase/tests/catalogue_read_hardening_test.sql`. It has 160 assertions and is wired into `scripts/db-test.sh`.
- **Contract change:** `supabase/tests/client_table_privilege_hardening_test.sql`. Its `USING (true)` inventory goes from 45 to 41.

## 1. The finding, and what it actually was

Lovable's security scan reported *"Some access rules let everyone through"*
(7 critical, 33 warnings, 5 info, affecting 45 tables). The owner stopped the
offered bulk fix. A read-only audit of hosted production on 2026-10-01 found:

- **Exactly 45 tables** carry a `USING (true)` SELECT policy for `anon` or
  `authenticated`. That matches the scanner's count.
- **All 45 are SELECT policies.** None is a `true` INSERT, UPDATE, DELETE or ALL
  policy.
- **None of the 45 tables has a user, holder or employer column.** Rolled-back
  probes as two candidates, two employers in different organisations and anon
  showed the same thing:
  - every authenticated principal read the *same* 840 rows;
  - anon read 3 public catalogues (13 rows) and was refused on the other 42;
  - no non-author principal could UPDATE any row;
  - INSERT and DELETE are refused by grant or by RLS predicate.
- **No cross-user or cross-tenant defect.** 41 of the 45 policies are the
  intended catalogue, and this change leaves them exactly as they were.

Four items were not leaks of personal data. They were **unpublished or
recruiter-only content readable by every signed-in account**, plus stray grants.
The owner approved hardening them.

| # | Table(s) | Before | After |
|---|---|---|---|
| 1 | `scp_behaviour_versions`, `scp_role_versions` | Every signed-in account read every row, including drafts (hosted: 24 draft behaviour versions, 3 draft role versions) | `content_status = 'published' OR scp_can_author(auth.uid())` |
| 2 | `cd_professions` | Every signed-in account read professions not approved for ranking (hosted: 4 of 18) | `approved_for_ranking OR is_platform_admin(auth.uid())` |
| 3 | `scp_interview_guide_prompts` | Every signed-in account, candidates included, read the interviewer question bank and its `listen_for` guidance | `scp_can_author(auth.uid())` |
| 4 | `scp_followup_prompts`, `scp_form_blocks`, `scp_interview_guide_prompts` | `authenticated` held INSERT/UPDATE/DELETE (RLS refused the writes) | Revoked from PUBLIC, anon and authenticated. SELECT is kept. |

## 2. Why each boundary is the smallest correct one

**1. Drafts.** `20260802090000` made "definitions and registries" readable so a
manager can see what a competency means. It never said drafts.

- **Who still sees drafts:** the role-pack authoring screens
  (`src/routes/_authenticated.admin.interview-role-packs.*`) read
  `scp_role_versions` as the caller. Their users hold a content role, which
  `scp_can_author()` admits.
- **Belt and braces:** the `FOR ALL` `*_author_write` policies already admit
  authors to SELECT. The author branch is restated so the read contract does
  not depend on a write policy.
- **Not affected:** `scp_development_recommendations`,
  `scp_release_attempt_report`, `scp_employer_content_library`,
  `scp_interview_create_version` and `scp_interview_pack_validate` are
  SECURITY DEFINER, owned by the table owner, on tables without FORCE RLS.

**2. Professions.** Every consumer was checked:

| Consumer | How it reads | Effect |
|---|---|---|
| `v31-public.functions.ts` (`fetchApprovedProfessionCatalog`, preview and save) | Service role, with `.eq('approved_for_ranking', true)` | Unaffected |
| `v31-owner-preview.functions.ts` | Caller's client, behind `assertAdmin()` → `is_platform_admin()` | Kept by the admin branch |
| `career-journey.functions.ts` | Caller's client, by `cig_profession_slug` and by the profession ids of a frozen, already-ranked report | Ranked ids are approved. An unmatched slug already falls back to `cig_professions`. |
| `cd_v31_complete_session` | SECURITY DEFINER | Unaffected |

**3. Interviewer guide.** `20260905054603` already states the contract: the
participant brief carries "no interview guide -- … handing them to the person
being assessed would be handing them somebody else's working notes."

- **Employer path, untouched:** the employer receives the guide inside the
  released employer brief, built by the SECURITY DEFINER
  `scp_release_attempt_report()` and read through the audience snapshot
  contract.
- **No direct readers:** no application code reads the table directly.
  `src/lib/interview-intelligence/context.ts` consumes the brief.

So the table itself becomes author-only. No RPC and no column split are needed.

**4. Stray grants.** No client, script or invoker-rights function writes these
three tables. Every write in the repository comes from a migration, the service
role or a SECURITY DEFINER function.

- **`scp_followup_prompts`:** `20260822090000` restated its write grants for
  replay parity with a Lovable re-issue, not for a consumer. Its
  `*_author_write` policy stays, dormant. Re-granting the privilege re-opens
  authoring with the predicate intact.
- **Replay vs hosted:** the hosted grants on `scp_form_blocks` and
  `scp_interview_guide_prompts` come from Supabase default privileges. A clean
  replay does not reproduce them, so the REVOKE is a no-op on replay and
  effective on the host. The rollback re-grants all three to restore the hosted
  state.

## 3. What did not change

- **Untouched:** every table, column, policy name, function, trigger and row;
  `anon`; `service_role`; every SECURITY DEFINER path.
- **The other 41 catalogue policies are untouched.**
- **No application code changes, and none needed**, so the schema-first rule
  holds trivially. The migration can be applied at any time.
- **`src/integrations/supabase/types.ts` is unchanged.** No column or function
  changed.

## 4. Tests

`catalogue_read_hardening_test.sql` runs against synthetic principals:

- candidate A and candidate B;
- an employer A member and an employer B owner;
- a holder of the legacy `assessment_editor` role, which is *not* a content
  author;
- a content editor, a content reviewer and a platform admin;
- anon.

It uses synthetic draft, published, approved and unapproved rows. Everything
rolls back.

| Group | Proves |
|---|---|
| CH1 | Ordinary principals read exactly the published behaviour and role versions, and a draft is not fetchable by id. Authors and the admin read every row. anon is refused. |
| CH2 | Ordinary principals and non-admin authors read exactly the approved professions; an unapproved one is not fetchable by id, an approved one still is. The admin reads every row. anon is refused. |
| CH3 | No ordinary principal reads a guide row or any `listen_for`. Authors and the admin read all of it. anon is refused. The employer-brief builder still reads the guide as its owner and still emits `listen_for`. |
| CH4 | No client role holds INSERT/UPDATE/DELETE on the three catalogues. Real UPDATE, DELETE and INSERT statements by all eight signed-in principals, authors included, are refused with 42501. SELECT is kept. |
| CH5 | Exactly 41 `USING (true)` catalogue reads remain. The author-write policies are unchanged. The 9 policies on the six tables are neither added nor removed. RLS stays on. |
| CH6 | **In-suite negative controls**, each inside a savepoint. Each re-plants the pre-hardening state (or a plausible wrong predicate) and requires the same probe to observe it: `USING (true)` on versions, professions and guide; an approved-only profession predicate without the admin branch; the stray grant. |

**Harness (`scripts/db-test.sh`).** The steps are:

1. Run the suite (floor: 150 assertions).
2. Run the rollback for real, and require the inventory to be back at 45.
3. Run the suite again, and require it to **fail on an assertion**.
4. Re-apply the migration, whose postflight must pass.

The migration is also idempotent: applied twice, the postflight passes twice.

**Postflight (in the migration).**

- The four predicates match, text-for-text.
- No unconditional permissive read remains on the four tables.
- No client write privilege remains on the three catalogues, and SELECT stays.
- anon reaches none of the hardened tables.

## 5. Production versus repository (read-only, 2026-10-01)

- **Policy sets match.** The four policies and the 9 policies on the six
  touched tables are the same names and commands on hosted and on a replay of
  the 330 canonical migrations.
- **Hosted grants on the three catalogues:** `authenticated` holds
  SELECT/INSERT/UPDATE/DELETE on all three. `service_role` holds full privileges
  on `scp_followup_prompts` and only REFERENCES/TRIGGER/TRUNCATE on the other
  two. This change does not touch the service role.
- **anon** holds no privilege on any of the four hardened read tables.
