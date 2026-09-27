# Security Passport: public-pilot availability (schema)

**Migration:** `20261220090000_sp_public_pilot_availability.sql` ·
**Rollback:** `supabase/rollback/20261220090000_sp_public_pilot_availability_rollback.sql` ·
**Suite:** `supabase/tests/security_passport_public_pilot_availability_test.sql`

PR 2 of `docs/passport/completion-work-order.md` (revision 3). Schema only; no
data moves and no application code depends on it yet.

## What it does

- **A third availability state, `public_pilot`**, for market packs and
  definitions: any signed-in holder may register, with no individual grant.
  `is_active` and `legal_review_state` stay exactly as they are, and
  `sp_market_pack_active_needs_review` is untouched, so a pack still cannot be
  made active while its legal review is pending. A public pilot opens
  registration; it approves nothing and grants no permission to work.
- **Every layer agrees.** `sp_market_access()` reports `public_pilot`; the
  `sp_credential_types` read policy and `sp_approved_credential_catalogue`
  admit public-pilot definitions of a public-pilot market; the claim rules
  admit them on the write path. The save RPC and the closed-catalogue guards
  read the view and follow.
- **The operation policy (G3).** The claim rules gated every UPDATE on the
  acting user's pilot grant, so a reviewer without one could not decide a UK
  or Dubai claim, and maintenance failed after a withdrawal or revocation. They
  now gate only writes that assert a credential anew: registration, a
  correction's successor, a move into `active`, and any change of holder
  content. That is the closed-catalogue guard's own predicate, word for word.
  Withdrawal, review decisions and evidence need no availability. A decision
  that also re-dates a claim edits holder content and follows the registration
  rule.
- **Error text.** `SP_MARKET_PACK_NOT_ACTIVE` now says a market is not open for
  new registration, instead of naming the legal review as the reason.
- **The review queue names the territory.** `sp_verifier_queue` returned the
  country only, so the list a reviewer chooses from read "United Arab Emirates"
  for a Dubai licence and "United Kingdom" for a Northern Irish one. It now also
  returns `sub_jurisdiction`, as the review detail and the dispute queue already
  do. One key is added. Nothing else in the body changes, and the grants and the
  authority check are the same. An application that doesn't read the key is
  unaffected.
- **Nothing moves.** No market pack, definition, claim or grant changes.
  `sp_pilot_members` stays as history.

## Verified (isolated local replay only)

- `scripts/db-test.sh`: strict replay of 323 migrations and every suite.
- The new suite, 43 assertions: an ordinary holder with no grant saves UK and
  Dubai credentials in a public-pilot fixture; Abu Dhabi stays closed; blocked
  registration cannot be reached through reactivation, draft activation, a
  change of credential or jurisdiction, an in-place edit or a correction;
  evidence, review requests, withdrawal and decisions by a reviewer without a
  grant still work after a withdrawal and after a revocation; the review queue
  names a Dubai claim `AE-DU` and a Northern Irish one `GB-NI`; each write layer
  refuses on its own.
- Mutation checks: gating every write again (the old G3) fails at 3.3; an
  INSERT-only credential gate fails at 5.2; a view without the new branch fails
  at 2.4; a queue without the new key fails at 4.3a.
- The rollback refuses while any market is `public_pilot`, restores every body
  byte-identical (md5) to its state before this file, the review queue included, and the forward file
  re-applies on top of it. The suite fails without the migration.

## Production status: pending

No production write was made. **Merging this PR is the production release:**
the Supabase GitHub integration applies merged migrations to
`wrygicdfxwjnrugduxnt` automatically. After merge, verify read-only with the
`verify` statement recorded in `supabase/release-state.json`, then record the
evidence there and take the file off `expectedPending` in
`scripts/release-frontier-check.ts`.

## Order

1. PR 1 (foundation remainder) merges first; this branch is stacked on it.
2. This PR merges; the integration applies it; read-only verification.
3. The application support (PR 3) and the data change that opens the UK and
   Dubai (PR 4) follow. The application degrades to today's behaviour against a
   database without this file, but the public pilot needs it applied.
