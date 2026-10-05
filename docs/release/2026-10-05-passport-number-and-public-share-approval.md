# Security Passport number, founder and public share — what is prepared, and what needs approval

Status: **prepared, not applied.** Nothing in this note has been run against
production. No merge, no founder assignment, no exclusion change, no publication
and no social post is authorised by it.

## 1 · What PR #430 changes in the database (and nothing else)

`supabase/migrations/20270217090000_sp_passport_number_and_social_share.sql`

| Object | What it is |
|---|---|
| `sp_passport_numbers`, `sp_passport_numbers_retired`, `sp_passport_number_seq` | Server-held, unique, never-reused numbers. `#1` is reserved for the one holder carrying the `founder` designation; ordinary holders start at 2. |
| `sp_network_counts_holder(uuid)` | The one definition of "counts": completed + declared, not excluded, not a staff account — unless designated founder. |
| `sp_assign_passport_number(uuid)`, trigger `sp_passport_number_on_complete_trg` | Atomic (per-holder advisory lock + sequence + unique constraint), idempotent. |
| `sp_my_passport_number()` | The holder reads their own number and designation. |
| `sp_designate_founder(uuid)` | `service_role` only. Not callable by a client, a role or user metadata. |
| `sp_network_stats()` (replaced) | Same contract; founder is the one narrow exception to the staff filter. Rollback restores the previous body byte for byte (md5 `49f4cf6204e44e9345e886aa74ebfba7`). |
| `sp_social_shares`, `sp_social_share_items` | The separate **public** share: random 24-character public id, pinned credentials, the approved name label, expiry, revocation. **No image column.** |
| `sp_create_social_share`, `sp_revoke_social_share`, `sp_list_my_social_shares` | Holder-only. Creation is idempotent per request key and the 25-share cap is atomic per holder. |
| `sp_get_social_share(text)` | The **one** new anonymous read. Allowlisted in `security_hardening_test` S3.1, `scp_interview_method_library_tenant_read_test` ML10.8, `sql-security-guard-check` and the Passport anon-execute suites. |

It publishes nothing, designates nobody and writes no row.

## 2 · Verified before this request (isolated, synthetic)

* `scripts/db-test.sh` full history replay, green, including 111 new assertions,
  the rollback chain, and three real two-process races plus a fourth for the cap
  (one holder numbered twice at once; holders completed at the same moment; one
  share request key submitted twice; two creates at 24 shares → exactly one wins).
* Rollback is refused without `app.sp_rollback_confirm = 'drop-numbers-and-shares'`
  when numbers, **retired numbers** or shares exist, and restores the previous
  statistics function.
* `migrations:check`, `migrations-duplicate:check`, `sql-security:check`,
  `interview-method-tenant-read:check`, `passport-network-stats:check`,
  `schema-first-release`, `release-parity`, `release-frontier`,
  `nullable-rpc-contract`; full CI on the final commit.
* Not proven here, and said so: LinkedIn's Post Inspector, LinkedIn's real share
  box and a real phone. See §6.

## 3 · The exact production change, in order

Each step is a separate approval. None has been taken.

1. **Merge PR #430 alone** (no application code). The official Supabase GitHub
   integration applies this one migration. *No broad `db push`, no project
   change, no unrelated migration.*
2. **Read-only verification** (below) against `wrygicdfxwjnrugduxnt`; record the
   result in `supabase/release-state.json` as `applied` **with evidence**, in the
   usual follow-up PR. Never before.
3. **Founder designation** — an account-bound production write. Before it, repeat
   the targeted identity check (read-only): the account must be the superadmin the
   owner selected on 2026-10-04 (identified in the owner's message, deliberately
   not in this repository), with a completed, declared Passport and its own
   credentials. Then, once, as `service_role`:
   `SELECT public.sp_designate_founder('<founder-holder-id>');` → expect `1`.
   The designation changes no credential and no verification level.
4. **Exclusion list** — none proposed. The production audit (2026-10-04) found 4
   profiles, 2 completed (both staff), one `not_started` with a declaration; the
   count requires `completed`, so no entry is needed to keep test data out. If the
   owner wants one, it is a separate approval naming the account.
5. **Statistics stay `hidden`.** `sp_set_network_stats_display` is not called.
   Expected after step 3: with `display = 'hidden'` the function returns
   `{"display":"hidden"}`; if the owner later publishes, the founder alone counts
   as **1**, a second qualifying holder as **2**.
6. **Merge PR 2** (the application) only after step 2 is recorded.

## 4 · Read-only post-apply checks

```sql
-- objects exist, closed to clients
SELECT to_regclass('public.sp_passport_numbers'), to_regclass('public.sp_social_shares');
SELECT has_function_privilege('anon','public.sp_get_social_share(text)','EXECUTE');   -- true: the one new anon read
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'sp\_%' AND has_function_privilege('anon', p.oid, 'EXECUTE'); -- 2
SELECT has_function_privilege('authenticated','public.sp_designate_founder(uuid)','EXECUTE'); -- false
SELECT has_table_privilege('anon','public.sp_social_shares','SELECT'),
       has_table_privilege('authenticated','public.sp_passport_numbers','INSERT'); -- false, false
-- nothing was written, nothing published
SELECT count(*) FROM public.sp_passport_numbers;      -- 0 until a holder completes or step 3
SELECT count(*) FROM public.sp_social_shares;         -- 0
SELECT public.sp_network_stats();                     -- {"display": "hidden"}
-- the replaced function is the reviewed one
SELECT md5(prosrc) FROM pg_proc WHERE proname = 'sp_network_stats';  -- compare with the merged file
```

## 5 · What the application does with it (PR 2)

See `docs/passport/personal-share.md`. In short: a personal flow where every
shareable credential is already in; nothing public until the holder has seen the
preview and ticked the notice; LinkedIn's own dialog on `/s/<publicId>`; no image
is supplied by a client; withdrawal stops the page at CQrityjob.

## 6 · Checks that need an external login (not done, not claimed)

Prepared as soon as an HTTPS test environment with a **synthetic** Passport is
available (do not copy any real person's credentials there; no passwords in chat):

1. LinkedIn Post Inspector on `/s/<publicId>` — title, description, image.
2. LinkedIn's real share box opened from **Dela på LinkedIn** — cancel before
   publishing.
3. A real phone's share sheet from **Dela via appar**, and the QR/open-on-phone
   path.
4. Another channel the owner cares about (Facebook sharer, WhatsApp).
