# Pilot blocker 2 — the employer read boundary of the interview-method library

**Status: merged, and APPLIED to production. The official Supabase GitHub
integration applied the migration to `wrygicdfxwjnrugduxnt` when PR #241 merged
to main as `7e338f2a43fbfe91b2c26228f04d7b3487d67d61`. The release frontier now
records it as `applied` with read-only hosted evidence, and no active migration
remains pending. No hosted write was issued from the evidence session: every
statement behind section 10 is a read.**

- Baseline: `origin/main` `5267e29d24ad873dab0a41fee52a0a8a26b66f54`
  (merge of PR #239), CI run 34767671763 green on that SHA.
- Migration: `supabase/migrations/20261115090000_scp_interview_method_library_tenant_read.sql`
- Rollback: `supabase/rollback/20261115090000_scp_interview_method_library_tenant_read_rollback.sql`
- Suite: `supabase/tests/scp_interview_method_library_tenant_read_test.sql`
- Guard / controls: `scripts/interview-method-tenant-read-check.ts`,
  `scripts/negative-controls/interview-method-tenant-read-controls.ts`
- Canonical hosted project: `wrygicdfxwjnrugduxnt`. Lovable Cloud is not a
  source of truth for this contract and must not regenerate it.

## 1. The finding, and what it actually is

Reported wording: *“Draft interview-method design content may be readable by
employers outside the owning organisation.”* Lovable's agent, on 2026-09-13,
summarised its own scan as “draft interview-method content visible across
employer organisations” and inspected exactly the five policies below. The
owner answered its question with **Pause for review**; this task is that
review.

The finding is real. It is not about `scp_interview_pack_versions` (governed
pack content, whose employer read already carries published / open-pilot /
grant / pinned-case) and not about any `beskt_*` or `bcp_*` table (governance
readers and preparation parties only). It is the **interview-method library**:

| Table | Employer read policy | Predicate before this change |
| --- | --- | --- |
| `scp_interview_methods` | `scp_interview_methods_employer_read` | *caller holds an active membership anywhere* |
| `scp_interview_method_practices` | `scp_interview_method_practices_employer_read` | same |
| `scp_interview_conduct_steps` | `scp_interview_conduct_steps_read` | governance reader **or** same |
| `scp_interview_conduct_prohibitions` | `scp_interview_conduct_prohibitions_read` | governance reader **or** same |
| `scp_interview_conduct_guidance` | `scp_interview_conduct_guidance_read` | governance reader **or** same |

The runtime migration (20260920090000) wrote above the first two: “Approved
methods only, and read only.” The predicate implemented only the second half.
Every method in the library is `approval_state = 'draft'` — the six seeded
rows, CQrity TRUST included, which 20260922090000 records as an owner-approved
**design hypothesis**, not an approved method — so the whole library is
readable by every active employer member of every employer, with no case, no
grant and no governed availability decision behind it.

“Outside the owning organisation” is the scanner's phrasing: the library rows
carry `created_by`, not an owning employer. The tenant boundary that is
actually crossed is *employer ↔ platform draft content*: a draft that no case
of the reader's employer pins and that nobody has approved.

## 2. Reproduction

Against a full replay of the canonical history (278 migrations, disposable
Postgres 16), with the five policy predicates confirmed **md5-identical** to
production's `pg_policies.qual`:

| Principal | methods | draft methods | practices | conduct steps | prohibitions | guidance |
| --- | --- | --- | --- | --- | --- | --- |
| Employer A owner, no case, no grant | 6 | 6 | 17 | 36 | 48 | 180 |
| Employer B member, no case, no grant | 6 | 6 | 17 | 36 | 48 | 180 |
| Candidate (login, no seat) | 0 | 0 | 0 | 0 | 0 | 0 |
| anon | permission denied on every table |

Production (read-only, 2026-09-13): 6 methods all `draft`, 17 practices,
11 active employers, 9 active memberships, 9 interview cases (8 pinned to
`cqrity-trust`). Every one of those 9 members reads all of it today.

## 3. Root cause

A membership-existence predicate with no approval-state and no entitlement
predicate. `TO authenticated` plus “has a membership somewhere” was treated as
authorisation. The pack content next to it never had this defect because its
policies route through `scp_iv_employer_may_read_pack()`.

## 4. The contract applied, and where it comes from

Existing owner decisions govern draft-versus-published visibility:

1. 20260920090000 / 20260921090000 and the owner decision of 2026-08-28
   (20260925090000): an employer reaches governed content through
   *published*, *openly available pilot*, *explicit grant* or *a case it
   already pinned* — never by membership alone.
2. PR #123 owner review (20260923090000): TRUST stage tables are not
   directly readable by employers; the employer receives a case-scoped
   projection.
3. The runtime migration's own stated contract for this library: approved
   methods only.

So, for the library:

```text
employer may read method M  =  (M is APPROVED  and caller holds an active membership)
                             or (a case of the caller's OWN employer pins M)
```

The second branch is continuity access to work that exists and is
deliberately **not** re-gated on employer status, exactly as the pack read
entitlement's pinned-case branch is not. Governance readers keep their own
untouched policies.

## 5. What changed

One function, `scp_iv_employer_may_read_method(uuid)`: SECURITY DEFINER
(genuinely necessary — the policy on `scp_interview_methods` must read its own
table's approval state, and an invoker-rights read recurses), `search_path`
pinned, `auth.uid()` verified first, membership resolved from
`employer_memberships` only (never a JWT claim), EXECUTE revoked from PUBLIC
and anon, granted to `authenticated` and `service_role`.

The five policies are re-pointed with `ALTER POLICY`, so no policy is ever
absent and no name changes. The migration ends with a postflight that reads
the catalogue and exercises the predicate, and refuses to complete otherwise.

Not changed: any table, column, grant, trigger or RPC signature; any
`beskt_*`, `bcp_*` or `sp_*` object; any pack-content or case policy;
`src/integrations/supabase/types.ts` (no application code calls the new
function; it is reached only through the policies).

**Consequence for the live workspace, stated rather than hidden.** A case
pinned to CQrity TRUST keeps rendering its six conduct steps, eight
prohibitions and thirty stage-guidance rows (they are pinned per method, and
the workspace already de-duplicates them per pinned method). The PEACE/ORBIT
*practice statements* belong to five library methods that no case pins and
that are not approved, so they stop rendering for employers until a content
role approves those methods. That is the governed path becoming the only
path.

## 6. Tests

`supabase/tests/scp_interview_method_library_tenant_read_test.sql` — twelve
groups, 123 assertions, all synthetic, everything rolls back:

| # | Required proof | Group |
| --- | --- | --- |
| 1 | Employer A reads its own permitted draft | ML1 (granted pack; case-pinned method and its conduct rows) |
| 2 | Employer A cannot read Employer B's draft | ML2 |
| 3 | Employer B cannot infer whether A's draft exists | ML3 (no row, identity, grant, listing, predicate, projection) |
| 4 | Candidate cannot read employer design content | ML4 |
| 5 | Anonymous user cannot read it | ML5 (tables **and** RPCs: permission denied) |
| 6 | Published platform content only through its approved contract | ML6 (approve → visible; retire → refused; governance readers unchanged) |
| 7 | Suspended / pending employer behaviour unchanged | ML7 (continuity kept, no new case, invited member gets nothing) |
| 8 | Forged user_metadata cannot grant access | ML8 (forged admin + employer claims; predicate and policies consult none) |
| 9 | Direct table reads and direct RPC calls fail closed | ML9 |
| 10 | SECURITY DEFINER grants match an explicit allowlist | ML10 (exact executor sets; schema-wide PUBLIC = none; anon = the four reviewed) |
| 11 | Existing Interview Intelligence and BESKT isolation tests stay green | full `bun run db:test` |

Negative controls, three layers:

- **In-suite (ML11):** four savepoint controls plant the membership-only
  policy, a predicate without its approval and case checks, an anon EXECUTE
  grant and an unconditional policy, and require the same assertions to fail.
- **Harness:** `scripts/db-test.sh` plants the original defect back in
  place (the membership-only method policy, with the predicate still
  present), runs the suite and **requires it to fail** on an assertion; then
  runs the rollback for real and re-applies the migration with its
  postflight proof.
- **Source-level:** 27 planted mutations in
  `scripts/negative-controls/interview-method-tenant-read-controls.ts`, each
  of which the guard must reject with the named diagnostic, files restored
  byte-for-byte.

### 6.1 What was actually run in the authoring session, and what could not be

| Check | Result |
| --- | --- |
| `bun run db:test` (full clean replay, every suite) | exit 0 — 279 migrations; new suite 123/123; planted-defect run fails on ML1.5 as required; rollback and re-apply proved |
| `migrations:check`, `schema-first-release:check`, `release-parity:check`, `release-frontier:check`, `sql-security:check` | OK (one migration pending by design) |
| `interview-method-tenant-read:check` | 115/115 |
| `negative-controls:interview-method-tenant-read` | 27/27 detected, tree clean |
| `negative-controls:all` | the chain stops at `beskt-candidate-preparation` on one control whose guard renders React and cannot resolve `@supabase/supabase-js` in this sandbox (see below); every suite before it and every suite after it, run individually, is recorded in the PR |
| Interview Intelligence, employer and BESKT guards (37) | 30 pass; 4 cannot resolve `@supabase/supabase-js`; `employer-library-purpose:check` fails identically at the baseline SHA (an i18n plural key, untouched here); `interview-finalisation-rpc:check` and `interview-context-bridge-history:check` are local-stack-only and need a Supabase auth schema and a browser-walked interview, which this sandbox has neither of |
| `bun run lint`, both typechecks, `bun run build` | **not reproducible here**: `bun install --frozen-lockfile` received 403 from Lovable's private registry proxy, leaving `@lovable.dev/vite-tanstack-config` and `@supabase/supabase-js` absent and a different prettier installed. The build cannot load `vite.config.ts`, the app typecheck reports implicit-`any` on the auth hooks, and `eslint .` reports 841 pre-existing formatting errors on untouched files. Every file this change adds or edits is eslint- and prettier-clean under the installed toolchain. CI on the PR is the authoritative run. |

## 7. Production versus repository (read-only, 2026-09-13)

- The five policies: identical (`md5(qual)` matches the replay).
- RLS: enabled on all `scp_interview_*`, `scp_trust_*`, `beskt_*`, `bcp_*`
  tables; FORCE on `beskt_*` and `bcp_*` only, as the domain suites require.
- Table privileges: anon holds SELECT on none of the interview, TRUST, BESKT
  or BCP tables; PUBLIC holds no grant on any of them; the five library
  tables carry the grants their migrations declare.
- Functions: every SECURITY DEFINER function in `public` (396) pins
  `search_path`; none is PUBLIC-executable; the anon-executable set is
  exactly the four reviewed names the security-hardening suite allowlists
  (`cd_get_shared_report`, `cd_record_funnel_event`,
  `cd_submit_test_feedback`, `employer_is_active_status`). The
  `authenticated_security_definer_function_executable` advisor group (266
  functions) is the RPC API by design; each named function verifies
  `auth.uid()` and membership inside. **The related warning is therefore not
  a finding beyond the reviewed allowlist.**
- Migration ledger: production holds **279** rows; the repository's active
  path holds 278. The extra row is `20261114090000
  sp_global_certification_governed_issuer` — Security Passport work from
  the separate PR #228/#230 stream, applied ahead of merge. It is outside
  this task and this migration does not depend on it; it is why this
  migration takes version `20261115090000`. PR #230 and PR #240 have since
  merged to main with that migration and its hosted evidence, and this branch
  carries main merged in; `supabase/hosted-ledger.json` is refreshed by that
  evidence, not by this change.
- Nothing else differs materially for this domain.

## 8. Remaining risks

- Approval of a library method is an editor `UPDATE` under
  `scp_interview_methods_update`; no governed approval RPC exists, so an
  editor can self-approve. Out of scope here (it is a governance-role
  question, not a tenant one) and recorded so it is not forgotten.
- Until a content role approves the PEACE/ORBIT methods, the workspace's
  stage-practice panel is empty for employers. That is the product cost of
  closing the finding and is the owner's call to change by approval, not by
  policy.

## 9. Merge and hosted-apply order

1. Review and merge this draft PR (schema release only; no application code
   depends on the new function, so `schema-first-release:check` passes).
2. The official Supabase GitHub integration applies
   `20261115090000_scp_interview_method_library_tenant_read.sql` to
   `wrygicdfxwjnrugduxnt` on merge. It must raise
   `SCP_IV_METHOD_LIBRARY_TENANT_READ_PROOF ok`; on any exception nothing is
   applied (the integration runs the file transactionally).
3. Verify read-only, and record the result:

   ```sql
   SELECT version, name FROM supabase_migrations.schema_migrations
    WHERE version = '20261115090000';                       -- expect 1 row
   SELECT tablename, policyname, qual FROM pg_policies
    WHERE policyname IN ('scp_interview_methods_employer_read',
                         'scp_interview_method_practices_employer_read',
                         'scp_interview_conduct_steps_read',
                         'scp_interview_conduct_prohibitions_read',
                         'scp_interview_conduct_guidance_read');
   -- every qual names scp_iv_employer_may_read_method( and none names employer_memberships
   SELECT has_function_privilege('anon', 'public.scp_iv_employer_may_read_method(uuid)', 'EXECUTE');  -- false
   SELECT prosecdef, proconfig FROM pg_proc
    WHERE proname = 'scp_iv_employer_may_read_method';      -- true, {search_path=public}
   ```

4. In the same change: set `hostedState` to `applied` with that evidence in
   `supabase/release-state.json`, remove the file from `expectedPending` in
   `scripts/release-frontier-check.ts`, update the `IMTR-REGISTRATION`
   pending assertion in the guard, and refresh `supabase/hosted-ledger.json`
   from a read-only ledger read. **Done — see section 10.**
5. Do **not** publish through Lovable and do **not** apply through Lovable's
   migration mechanism; the integration is the only hosted write path for
   this file.

## 10. Hosted evidence (read-only, 2026-09-13T17:43:43Z)

Step 9.3's queries were run against `wrygicdfxwjnrugduxnt` through the Supabase
management API. Every statement was a read; nothing was applied, re-applied or
repaired, and no row was inserted, updated or deleted.

**Recorded identity.** `supabase_migrations.schema_migrations` carries version
`20261115090000`, name `scp_interview_method_library_tenant_read` — the
canonical filename's own version and slug, not a generated uuid, so no
canonical-to-hosted alias is needed and a clean replay executes nothing twice.
It is the ledger frontier, row 280.

**Ledger, proved rather than assumed.** `md5(string_agg(version || ':' || name,
',' ORDER BY version))` over production's rows *excluding* `20261115090000` is
`9c77cb921cae6a46a233ffb5b9cd308c` — exactly the all-rows digest the previous
evidence recorded, and exactly the digest of the previously committed 279-row
`supabase/hosted-ledger.json`. So no earlier row was rewritten. Over all 280
rows, production and the refreshed committed file both give
`cbe34f3fef140aa15c8810e8b8169425`.

**The predicate.** `public.scp_iv_employer_may_read_method(_method_id uuid)` is
`SECURITY DEFINER`, `STABLE`, and pins `proconfig = {search_path=public}`.
`has_function_privilege` is **false** for `anon`, **true** for `authenticated`
and `service_role`; `aclexplode` finds no grantee `0`, so PUBLIC cannot execute
it. The stored body matches none of `raw_user_meta_data`, `user_metadata`,
`app_metadata`, `jwt.claims` — membership is resolved from
`employer_memberships`, never from a user-editable claim.

**Body equivalence.** `md5(prosrc)` on production is
`608dd25e6f7db6a10f619b042b6273a9`, byte-identical to the body extracted from
the merged migration (file sha256
`9c6aaa4f6344e5184c28bda914b12d66ab7a470ad269823afbd9f2545be7258d`). Zero
differing, zero repo-only, zero hosted-only.

**The five policies.** Each is a `SELECT` policy whose `qual` names
`scp_iv_employer_may_read_method(`, and **none** still names
`employer_memberships`:

| Table | Policy | Routed through predicate | Still bare membership |
| --- | --- | --- | --- |
| `scp_interview_methods` | `scp_interview_methods_employer_read` | yes | no |
| `scp_interview_method_practices` | `scp_interview_method_practices_employer_read` | yes | no |
| `scp_interview_conduct_steps` | `scp_interview_conduct_steps_read` | yes | no |
| `scp_interview_conduct_prohibitions` | `scp_interview_conduct_prohibitions_read` | yes | no |
| `scp_interview_conduct_guidance` | `scp_interview_conduct_guidance_read` | yes | no |

**The five tables.** All carry `relrowsecurity`. None carries an unconditional
policy (no `qual = 'true'`, no `with_check = 'true'`, no `SELECT`/`ALL` policy
with a NULL `qual`). Each retains a `SELECT` policy whose `qual` names
`scp_interview_can_read(auth.uid())`, so the governance reader was not
collateral damage. `has_table_privilege('anon', …, 'SELECT')` is false on all
five, and `information_schema.role_table_grants` shows no `PUBLIC` grant on any
of them.

**Exercised, not only inspected.** With no signed-in principal, `bool_or` of the
predicate over every method in the library returns **false** — it fails closed
at the door — and `scp_iv_employer_may_read_method(NULL)` returns **false**.

**Live consequence, stated rather than hidden.** Production holds 6 library
methods, **0 approved** and all 6 `draft`, and 9 interview cases pinning 2
distinct methods. The approved branch therefore admits nothing today, and the
pinned-case continuity branch is the only live path — exactly the outcome
section 5 predicted. Approving the PEACE/ORBIT methods remains a governed
content-role decision, not a policy change.

**Advisors.** Security advisors return six lint groups. Exactly one names an
object of this migration:
`authenticated_security_definer_function_executable` (WARN), which names the
predicate because the migration deliberately grants it to `authenticated`,
matching its own `GRANT` list. `anon_security_definer_function_executable` does
**not** name the predicate, so anon is closed on production as well as in the
catalogue. The single ERROR group (`security_definer_view`) and the remaining
groups (`rls_enabled_no_policy`, `extension_in_public`,
`auth_leaked_password_protection`) name no object of this migration and are
pre-existing.
