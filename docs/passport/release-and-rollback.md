# Security Passport — release and rollback

How this work reaches an environment, and how it comes back out.

_(Status markers as defined in [three-market-architecture.md](./three-market-architecture.md).)_

---

## The migrations

| Version          | File                         | Changes triggers/RPCs?                      |
| ---------------- | ---------------------------- | ------------------------------------------- |
| `20260907090000` | `sp_three_market_foundation` | yes — claim trigger, new title-rule trigger |
| `20260907091000` | `sp_sweden_truth_model`      | yes — claim trigger, `sp_correct_claim`     |
| `20260907092000` | `sp_uk_market_pack`          | yes — claim trigger                         |
| `20260907093000` | `sp_uae_dubai_market_pack`   | **no** — one column and rows                |

That last row is the point of the foundation: once it is in place, a market
costs data.

### Why the versions run ahead of the calendar

They were created with `supabase migration new`, which stamped a wall-clock
timestamp. This repository's versions deliberately run ahead of the calendar —
the latest applied is `20260906100000` — so an honest wall-clock stamp would
have sorted **before** five migrations already in the hosted ledger and
replayed out of order. Each was renamed to the next canonical slot; nothing but
the filename changed.

## Rollback, in order

```
Dubai  →  UK  →  Sweden  →  foundation
```

**The order is enforced, not documented.** The Swedish rollback restores the
original 16-character limit on credential codes, and
`AE_DU_PEOPLE_OF_DETERMINATION` is 29 characters long. Running it first
aborts with:

```
ROLLBACK BLOCKED: 9 credential code(s) are longer than the original
16-character limit. They arrived with a later market pack, which must be
rolled back first.
```

That is how the ordering was established rather than assumed.

All four rollback files are **executed** by `scripts/db-test.sh` on every run,
in that order, and each asserts the markets below it survived. A rollback file
that has never been run is a hope, not a procedure.

### A rollback refuses rather than destroys

Three of these rollbacks used to issue a blind `DELETE FROM sp_claims`. That had
two failure modes and **both were real**:

- `sp_claims.supersedes_id` is `ON DELETE RESTRICT`. A holder who **corrected**
  one of these credentials has two rows, and if the correction changed the
  `credential_code` the filter catches only one of them — so the delete aborts
  on a foreign key, mid-transaction, reporting a constraint name rather than
  what actually happened.
- When it did _not_ abort, it silently deleted a holder's claims, their version
  history and their verifier attributions, to tidy a schema.

CI never saw either, because the suites clean up after themselves and the
rollback then had nothing left to delete.

Each now counts first and **refuses**:

```
ROLLBACK REFUSED: 1 Swedish truth-model holder claim(s) exist, 1 of them
corrected. This rollback will not destroy a holder's record to tidy a schema.
```

**Recovery**, in preference order:

1. Export the rows — every rollback header carries the exact `\copy`.
2. Have each holder withdraw or correct the claim, which preserves their
   history.
3. Only if the loss is genuinely intended, accept it deliberately:
   `SET LOCAL sp.rollback_may_delete_holder_claims = 'yes';` — which then logs
   a `WARNING` naming the count it is about to destroy.

Destruction is possible, but it can no longer happen as a side effect of
tidying up.

### Prefer the switch to the hammer

Withdrawing a market needs **no schema change at all**:

```sql
UPDATE public.sp_market_packs
   SET is_active = false, legal_review_state = 'pending'
 WHERE code = 'GB';
```

The claim trigger turns that one row into an immediate, fail-closed refusal of
every new claim in that market, while every stored row keeps its history, its
evidence and its verification. Reach for this first. The rollback files are for
removing a pack entirely.

## Verification gate

Run all of these before a PR:

```bash
bunx tsc --noEmit
bun run build
bun run migrations:check
bun run passport-separation:check
bun run passport-fixture:check
bun run passport-error-scope:check
bun run passport-title-derivation:check
bun run passport-identity-engine:check
bun run passport-credential-form:check
```

Full replay from empty plus every SQL suite — **port 54322**, the local
Supabase Postgres (the script defaults to 5432, where nothing listens):

```bash
PGPASSWORD=postgres LC_ALL=C PGPORT=54322 PGUSER=postgres bash scripts/db-test.sh
```

`LC_ALL=C` gives English error messages; without it psql reports in Swedish and
the suites' error-matching becomes hard to read.

## Applying to a hosted project

**Not done by this work.** Every PR is labelled
**CODE COMPLETE — HOSTED VERIFICATION PENDING**.

Two Supabase projects exist and confusing them costs real time:

- `zrahptwsnjcdyzfywbeh` — the **live** application backend, owned by Lovable
  Cloud, not by the repository owner. It does not appear in
  `supabase projects list`.
- `mlvzmiutmyyqeuvjglco` — the only project in the owner's account. Connected
  to the repo, but **not** the live backend.

"Hosted" alone is ambiguous. Always name the ref.

### Runbook

1. Merge in stack order: **#79 → #80 → #81 → docs**.
2. Verify the merge SHA on `origin/main`.
3. Read the hosted migration ledger and confirm which of the four versions are
   absent.
4. Apply **only** the merged, missing migrations, each as one transaction, with
   its canonical version and filename stem inserted into
   `supabase_migrations.schema_migrations` **in the same transaction**.
5. Verify read-only afterwards: the exact ledger row; the eight new tables
   exist; `relrowsecurity` is true on each; `information_schema.role_table_grants`
   shows **no** `anon` grant on any of them; `prosecdef` and `proconfig` on the
   changed functions; the ledger grew by exactly the number applied.
6. Confirm no market pack is active with `legal_review_state` in
   `('pending','in_review')`.
7. Allow Lovable's automatic GitHub sync; confirm the synced SHA.
8. Owner-assisted browser verification of the authenticated journeys.

**Never**: a generic `supabase db push`; a ledger row for SQL that was never
executed; Lovable Build, Ask, a chat prompt, a visual edit or Publish.

## What cannot be verified from here

**Authenticated production journeys.** They need a real user on
`trust-path-recruitment.lovable.app`. That is owner-driven browser
verification, not evidence this work can produce, and it is not claimed.

Playwright coverage at desktop / 375×812 / 390×844 in sv, en-GB and ar is
**Future** — the Arabic locale does not exist yet.

## The acceptance line

`SECURITY PASSPORT THREE-MARKET REGULATORY FOUNDATION ACCEPTED` requires the
merged code, the hosted migration applied, the synced build and real production
journeys all proven.

**It is not claimable from this work**, and claiming it would be the one thing
this whole architecture is built to prevent: asserting something nobody
checked.
