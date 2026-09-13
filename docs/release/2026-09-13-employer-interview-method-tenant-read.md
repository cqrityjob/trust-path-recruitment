# Pilot blocker 2 — the employer read boundary of the interview-method library

**Status: draft PR, schema release only. Nothing hosted was written from this
work. The migration is `pending` on the release frontier until the owner
applies it through the official Supabase GitHub integration and records the
evidence.**

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
  migration takes version `20261115090000`. `supabase/hosted-ledger.json`
  was **not** refreshed here: recording that row is the Passport stream's
  evidence to record.
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
- `hosted-ledger.json` is one row behind production (see §7).

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
   from a read-only ledger read.
5. Do **not** publish through Lovable and do **not** apply through Lovable's
   migration mechanism; the integration is the only hosted write path for
   this file.
