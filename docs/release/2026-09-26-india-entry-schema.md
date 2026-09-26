# India entry — schema release (20261214090000, 20261215090000)

Schema-only release. No file under `src/` changes in this PR; the application
that uses these objects is the India entry app PR, which must not merge until
both entries in `supabase/release-state.json` are recorded **applied** with
hosted evidence (`scripts/schema-first-release-check.ts` enforces it).

Base: `main` @ `eefad07`. Nothing here is applied to any hosted database.

**Hosted status (2026-09-26): applied and verified.** PR #297 merged as `cb12fcb`; the official
Supabase GitHub integration applied both files at their canonical versions (ledger rows 316 and 317).
Verified read-only, not inferred from the merge: every declared `verify` statement as expected, the
eight function bodies and the catalogue view byte-identical to a local replay by md5, no personal row
changed, no new advisor finding. Evidence: `supabase/release-state.json` and
`supabase/hosted-ledger.json` (317 rows, digest `42e0ff1e56bd462b91aceb01be8873bf`).

## 20261214090000 — `sp_india_national_qualifications`

| What | Detail |
|---|---|
| New scope | `national_qualification`: a country's NSQF-type qualification. Constraint `sp_credential_type_national_qualification_bound` makes it structurally unable to carry rules — jurisdiction required; no sub-jurisdiction, market pack, authority_id, regulated role, required scope or required expiry; never `local_eligibility` or `active_title`. |
| Country | `IN` in `sp_jurisdictions` and `sp_credential_jurisdictions`. **No market pack.** The legal gate (`sp_market_pack_active_needs_review`) is untouched and no legal review is claimed. |
| Regulator | `IN_NCVET` — National Council for Vocational Education and Training. |
| Definitions (approved for every registered holder, owner instruction 2026-09-26; `legal_review_state = 'pending'`) | `IN_MEPSC_Q7101` Security Guard · `IN_MEPSC_Q7201` Security Supervisor · `IN_MEPSC_Q7104` CCTV Supervisor · `IN_MEPSC_Q7204` CCTV Video Footage Auditor |
| Issuer | Stated on the certificate (`document_specific`); training provider likewise. MEPSC is recorded as **awarding body** per version. The regulator's name is refused as an issuer. |
| Versions | New `sp_credential_definition_versions` (catalogue data, read-only to signed-in users, closed to anon). 4 current + 6 superseded, each with its official source. `superseded` is the standard's status, never a holder's expiry. |
| Holder's version | New optional `sp_credential_details.definition_version`, checked against the definition by the details guard and the save RPC. |
| Replaced (verbatim + marked addition) | `sp_approved_credential_catalogue` (national_qualification branch), `sp_claims_credential_rules` (market gate skips ONLY a national qualification of its own country with no region), `sp_closed_catalogue_details_guard`, `sp_save_international_credential` (optional `definition_version`), `sp_verifier_request_detail` (`claim.definition_version`). |
| Sources | Four unchecked `sp_regulatory_sources` rows (NQR, NCVET, MEPSC, MHA PSARA). |
| Personal data | None created, changed or deleted. |

Excluded deliberately: any personal "PSARA licence" (PSARA licenses agencies;
a guard's credential is a Form VIII training certificate from a licensed
institute — state-specific, not modelled), armed-security permissions, a 2018
"Unarmed Security Guard" NSQF-4 version and an NQR code for MEP/Q7204 v4.0
(neither substantiated by an official source on 2026-09-26).

## 20261215090000 — `candidate_location_and_destinations`

`candidate_current_location` (Profile: ISO country + optional Unicode
locality) and `candidate_job_preferences` (closed destination vocabulary
`IN, AE-DU, AE, GB, SE`, ordered, no duplicates; relocation interest).
Holder-only by RLS; `REVOKE ALL` from PUBLIC, anon, authenticated and
service_role, then `SELECT/INSERT/UPDATE/DELETE` to authenticated only — no
TRUNCATE, no server-side reader. No nationality, passport, visa, permit or
right-to-work column. `admin_anonymise_user` reproduced verbatim with two
DELETEs. Six anonymous funnel names added to `cd_v31_funnel_events`.

## Proof (local, isolated)

`bash scripts/db-test.sh` against a fresh `postgres:16` (the CI image): **exit 0**.

- `security_passport_india_national_qualifications_test.sql` — 75 assertions,
  before and after the Passport rollback/reapply cycle, plus a negative control
  (the suite must fail without the migration).
- `candidate_location_and_destinations_test.sql` — 21 assertions, before and
  after its own rollback/reapply, plus a negative control.
- Updated pins: catalogue completeness (70 in scope / 77 taxonomy / 26 visible
  to a Swedish holder, 19 to an application without the catalogue contract),
  foundation (8 credential classes), pilot bug fix #1 6.3/6.3b (a third governed
  route, held to a stricter shape).
- Both rollbacks refuse once adopted (an Indian claim, a stated version, an IN
  work country, a location/preference row or a new funnel event).

## Release order

1. Merge this schema PR. The official Supabase GitHub integration applies both
   files to the owner project.
2. Verify read-only with the `verify` statements recorded in
   `supabase/release-state.json` (counts, grants, `relforcerowsecurity`, and
   md5 of every replaced function against a local replay of the merged files).
3. Record the evidence: both entries `applied`, `supabase/hosted-ledger.json`,
   and take both names off `expectedPending` in
   `scripts/release-frontier-check.ts` — one follow-up commit.
4. Only then merge the application PR, whose schema-first gate is red until 3.

Rollback: `supabase/rollback/20261215090000_…` then `…/20261214090000_…`; both
refuse after adoption — use a forward fix.
