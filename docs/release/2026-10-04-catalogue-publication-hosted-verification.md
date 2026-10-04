# Certification catalogue, release 3: hosted verification (20270214090000)

**Status 2026-10-04 ~09:50 UTC.** #412 was merged to `main` as `3e3a66c633548c370c7f3c264001a98efc9e75c4` (head
`1d06c8a89ea90f21d159c2bf92a2f604da17cce8`, every mandatory CI job green on that exact head, `schema-first-release:check`
included and unchanged) after the application that renders the new certifications (#411, merge `2ba7f20f`) had been
published in Lovable (deployment `e3ecf917-cb99-430f-bad8-8c0a0b292349`, live entry `index-DVhrLd6r.js`) and checked
in the published app. The official Supabase integration then applied `20270214090000_sp_catalogue_research_publish`.
This record is a read-only verification of production plus one rolled-back behavioural probe; nothing was written to it
by the author, who also did not apply the migration (merging is what applies it).

## What was applied

| Version          | Name                            | Effect                                                                                                                                                                          |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20270214090000` | `sp_catalogue_research_publish` | `is_active = true` on exactly the 140 codes the import added. `sp_credential_types` has no triggers in production, so no other row or table is touched by the statement itself. |

Publication makes a definition **selectable**. It is not a verification of any holder, not an approval to work anywhere
and not an endorsement of the issuer's programme: `legal_review_state` stays `pending`, `allows_no_expiry` stays false
(OSCP included), maintenance stays `not_assessed`.

## Before the merge (read-only, 2026-10-04 ~09:40 UTC)

Ledger 372 rows (digest `868e9c610f78ced1c5f529596ca273c2`, highest version `20270213090000`, so `20270214090000` applies
in order); 217 credential types of which 26 active; 154 certification definitions of which 140 inactive; 170 research
records; 0 requests; 51 claims. `verify.sql` was run in that state and its output kept as the "before" column.

## After the apply

`evidence/2026-10-04-catalogue-publication/verify.sql`, same query, with its before/after output in `results.txt`:

- **Ledger:** 373 rows, digest `339b270ff57e60c0e7e024081e3102bd`; the first 372 rows unchanged
  (`868e9c610f78ced1c5f529596ca273c2`); `supabase/hosted-ledger.json` carries the same 373 rows and digest.
- **Activation:** 140 of the 140 added definitions are active, every one still global, without jurisdiction or market
  pack, `allows_no_expiry` false, legal review pending. 154 international types active (14 + 140), 166 types active in
  total (26 + 140), 217 types in all.
- **Nothing else changed (five lines differ between before and after, all intended):** every other column of every
  credential type, the 77 previous types, the active non-international set and the previously active international
  set, market packs, pilot members, definition metadata, reviews, versions, jurisdictions and adapter mappings,
  certification definitions, issuers, aliases, sources, organisation roles and the 170 research records are
  byte-identical to their fingerprints from before the apply.
- **Holders' data:** 51 claims with the same fingerprint (`fc460b1d610f2918c9371c2c0a58b5b3`), 7 credential details,
  12 evidence rows, 40 disclosures, 0 claims on the new codes, 0 requests.

## Behaviour on production (rolled back, nothing persisted)

`evidence/2026-10-04-catalogue-publication/probe-rolled-back.sql` and `probe-results.txt`, run as an ordinary
non-administrator holder:

- the holder is offered **210** definitions (was 70), including all 140 new ones, and no Abu Dhabi definition;
- **all 140 new certifications register and read back** through `sp_save_international_credential`: `self_declared`,
  `active`, no country, no scope, the definition's own governed issuer, a credential-details row;
- a no-expiry OSCP is refused (`SP_NO_EXPIRY_NOT_APPROVED`), an unknown code is refused
  (`SP_APPROVED_DEFINITION_REQUIRED`), and CAFS (a retained, unpublished research record) is still found as
  "not available yet";
- afterwards production was re-read: 51 claims with the same fingerprint, 0 requests, 373 ledger rows.

Between the application's publication and this release the following was checked the same way (also rolled back, as the
same holder, before the publication): a holder files a catalogue request and sees it listed; the eleventh open request
is refused (`SP_REQUEST_LIMIT`); a non-administrator is refused both administrator RPCs
(`SP_CATALOGUE_ADMIN_REQUIRED`), reads no research record and no other holder's request, and cannot write the request
table directly; an administrator is accepted.

## Not verified, stated plainly

- **No signed-in browser session on production.** The published app was checked logged out (header and logo, login,
  `/security-passport`, `/passport/credentials/new` redirecting to `/login`, no page error or failed request at 1440 and
  390 px) and by its live bundle (the new picker and administrator catalogue chunks are served). The signed-in picker
  and the administrator pages were exercised against a real local backend with this exact migration chain
  (real PostgREST and RLS; journey 9/9 at desktop and 390 px) and in CI, not against production with a real account.
- The rolled-back probes bypass the session-revocation check (the JWT role claim is not `authenticated`, so no row is
  written to the auth schema); the SQL suites cover it.
- Twelve research records still have an unclosed source recheck, 16 are retained for review (each names its issue),
  and the owner decisions listed in `docs/passport/certification-catalogue-integration.md` are open; none of them
  blocks this release and none is changed by it.

## Rollback

`supabase/rollback/20270214090000_sp_catalogue_research_publish_rollback.sql` sets the same 140 definitions back to
inactive and deletes nothing: a credential a holder registered meanwhile stays in their Passport and is simply no
longer offered to new registrations.
