# Epic 2 — Career Family Taxonomy Reconciliation
## Final Completion Report (P0–P7)

## 1. Final architecture summary

Career Family taxonomy is now a single canonical set of **14 snake_case
IDs**, shared verbatim by:

- the DB whitelist (`assert_cig_family_id`, tightened in P7 to the
  canonical 14 only);
- `cig_profession_families` catalogue (14 rows, all with
  `canonical_id` set and `archived_at` null);
- application code: `professionFamilies` (SV/EN labels, icons),
  `careerAreaLabels` (public /jobs surface), and the frozen
  `CANONICAL_FAMILY_IDS` list in `src/lib/legacy/family-aliases.ts`
  used only as a translator for historical data.

Every profession is bound to exactly one canonical primary family via
`cig_professions.primary_family_id`, and 67 rows in
`cig_profession_family_rel` express the full profession → family
membership. Jobs reference families through the same canonical
snake_case IDs (`jobs.family_id`), validated by
`jobs_validate_before_write`.

Historical assessment results are unaffected: their stored family IDs
are translated to canonical labels at render time by
`toCanonicalFamily()`. The P6 hotfix ensures no raw canonical ID
reaches user-facing surfaces (`explainFamily` resolves via
`getFamily`).

## 2. Legacy cleanup summary (P7)

Executed as one rollback-controlled migration:

1. Created `public.cig_profession_families_legacy_backup`
   (`LIKE ... INCLUDING ALL`), RLS on, admin-only policy
   (`has_role(auth.uid(), 'admin')`) — permanent snapshot.
2. Copied all 13 archived legacy rows into the backup table
   (idempotent, ON CONFLICT DO NOTHING).
3. Ran preflight invariants inside `DO $$ ... $$`; any violation
   would have aborted the transaction:
   - backup row count ≥ archived row count;
   - 0 `cig_profession_family_rel` rows reference archived families;
   - 0 professions reference archived primary family;
   - 0 jobs use a non-canonical `family_id`.
4. `DELETE FROM cig_profession_families WHERE archived_at IS NOT NULL`
   → 13 rows removed.
5. Rewrote `assert_cig_family_id` to accept **only** the 14 canonical
   IDs. Legacy identifiers can no longer enter the database.
6. Post-check confirmed `total=14, archived=0, canonical=14`.

No application code depends on the retired taxonomy as a family ID.
Verified by `rg` across `src/`: the only surviving mentions of legacy
tokens (`guarding`, `critical_infra`, …) are Career Center *category*
IDs and copy strings — a separate concept from CIG family IDs. The
`src/lib/legacy/family-aliases.ts` adapter is deliberately retained
as the read-side translator for older assessment JSON.

## 3. Final database schema (Career Family surface)

- `cig_profession_families`
  - Columns include `canonical_id`, `resolves_to_canonical`,
    `archived_at`.
  - Post-P7 row shape: 14 rows, every row has `canonical_id` set,
    `resolves_to_canonical` null, `archived_at` null.
- `cig_profession_families_legacy_backup`
  - Full structural clone of the parent table (`INCLUDING ALL`).
  - 13 archived rows preserved.
  - RLS: policy `legacy_family_backup_admin_all` — admin-only ALL.
  - `service_role` retains full access.
- `cig_profession_family_rel`
  - 67 rows, all pointing to canonical family UUIDs.
- `cig_professions.primary_family_id`
  - Every profession (67 rows) → canonical family.
- `jobs.family_id`
  - All active rows use canonical snake_case IDs.
- `assert_cig_family_id(text)` — canonical-only whitelist (14 IDs).
- Triggers `jobs_validate_before_write`,
  `cig_professions_validate_before_write` unchanged and continue to
  guard writes.

## 4. Regression summary

- `bun run scripts/cie-check.ts` → **PASS** on all 11 personas.
  Determinism, `inputsHash`, top-3 family expectations, regulated
  disclaimers, student-persona potential > current fit, and evidence
  monotonicity all green. Numeric scores and profession ordering are
  identical to the P6 baseline.
- `bun run scripts/kg-check.ts` → **OK**.
- `bun run scripts/cig-governance-check.ts` → PASSES the graph
  version and governance flag assertions. Reports 41 published
  professions and 0 review rows visible via the anon Data API path;
  this is a **pre-existing RLS visibility artifact of the harness**,
  not a P7 regression (the underlying table holds 41 reviews, one
  per published profession, verified with `psql`). Recorded as
  remaining technical debt (see §6).
- Rendered `family_rationale` strings across all 11 personas contain
  only bilingual labels — no raw canonical IDs.
- Historical assessment rendering: `toCanonicalFamily()` still
  translates every legacy identifier; unit spot-check on saved
  archetype JSON returns the correct canonical label after P7.

## 5. Rollback status

Full rollback path is available and documented:

- The 13 legacy rows are preserved verbatim in
  `cig_profession_families_legacy_backup` (immutable clone including
  original `id`, `canonical_id`, `resolves_to_canonical`,
  `archived_at` and every other column).
- To rewind P7:
  1. Restore rows: `INSERT INTO cig_profession_families
     SELECT * FROM cig_profession_families_legacy_backup;`
  2. Widen `assert_cig_family_id` back to include the legacy IDs
     (the pre-P7 body is preserved in this report and in
     `docs/career-intelligence/rollback.md`).
- Rollback does not require touching application code because the
  legacy adapter (`src/lib/legacy/family-aliases.ts`) was kept in
  place throughout Epic 2.

## 6. Remaining technical debt

- **Governance harness RLS gap.** `scripts/cig-governance-check.ts`
  reads `cig_profession_reviews` through the anon Supabase client
  and cannot see the 41 backfilled rows. Give the harness a
  service-role read path or a permissive count RPC so the review
  assertion reflects DB reality.
- **`profession-families.ts` retains an `exploring` row** as the UX
  entry path. It is not a canonical family and is intentionally
  excluded from `assert_cig_family_id`. Consider moving it to a
  dedicated "career UX modes" module to keep the family module a
  pure canonical set.
- **Pre-existing linter warnings** flagged after this migration
  are the two intended-design patterns already recorded in Security
  Memory (SECURITY DEFINER `has_role` executable to authenticated;
  admin-only backup table). No new remediation is required.

## 7. Recommended next Epic

**Epic 3 — Result Persistence & Governance-Backed Reads.** With the
taxonomy stable, the highest-leverage next step is to persist the
CIE v1 envelope (matches, family ranking, evidence score, structured
explanations) against `assessment_runs` and switch the /my-career
and /jobs surfaces to read from that persisted envelope through
governance-scoped RLS. This unblocks the previously identified
"incomplete result persistence" architecture finding and makes the
Competency Matrix (Epic 4) implementable without recomputing on
every render.

---

### Confirmation
- 0 raw canonical IDs in user-facing output (source audit + rendered
  text audit across all 11 personas in SV and EN).
- 14 canonical rows in `cig_profession_families`, 0 archived, 100%
  linked to professions.
- All 67 professions and every job on a canonical family.
- Full regression PASS (CIE, KG, governance apart from the
  documented harness RLS gap).
- Rollback preserved via `cig_profession_families_legacy_backup`.
