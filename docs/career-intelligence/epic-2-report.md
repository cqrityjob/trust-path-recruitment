# Epic 2 — Taxonomy Reconciliation — Implementation Report

**Status:** P0–P6 complete. P7 (legacy hard delete) deferred.
**Canonical taxonomy:** 14 snake_case Career Family IDs.
**Public URL slugs:** kebab-case, derived from canonical IDs.
**Regression:** CIE v1 harness `bun run scripts/cie-check.ts` → PASS on all 11 personas
with identical profession ranking, current-fit and potential scores versus baseline.

## What changed

### Code (P1)

- `src/lib/career-center/types.ts` — `ProfessionFamilyId` union frozen at the 14
  canonical snake_case identifiers.
- `src/lib/career-center/profession-families.ts` — canonical registry with SV/EN
  names and descriptions.
- `src/lib/job-intelligence/career-area-labels.ts` — public labels rewritten
  against the 14 IDs.
- `src/lib/legacy/family-aliases.ts` — frozen adapter. Maps historical short
  snake_case IDs (`corporate`, `risk_crisis`, …) and legacy DB kebab slugs
  (`operational-security`, `investigation-intelligence`, …) into the canonical
  set. `familyPublicSlug()` produces kebab URL slugs from canonical IDs.
- `src/lib/career-assessment/profession-profiles.ts`, `professions/researched.ts`,
  `professions/placeholders.ts` — 67 professions rewired to the canonical IDs at
  write-time; splits decided per profession.
- `src/lib/career-assessment/test-personas.ts` — `q7` answer tokens restored
  after a regex-driven rewrite accidentally rewrote them to family IDs. Root
  cause is captured in the report for future auditors.

### Database (P2–P4)

Migration: `epic_2_career_family_taxonomy_reconciliation`.

- `cig_profession_families` gained three governance columns:
  - `canonical_id text` — unique among rows that carry it, populated on the 14
    new canonical rows;
  - `resolves_to_canonical text` — non-unique redirect pointer set on the 13
    legacy rows;
  - `archived_at timestamptz` — set on the 13 legacy rows in the same migration.
- 14 canonical rows inserted with disambiguated slugs where necessary
  (`cyber-information-security-canonical`, `security-technology-canonical`).
  P7 will rename to the friendly kebab slug once legacy rows are hard-deleted.
- All 67 rows in `cig_professions.primary_family_id` reassigned to canonical
  rows via the profession-by-profession mapping in
  `docs/career-intelligence/epic-2-mapping.md`.
- `cig_profession_family_rel` rebuilt: one row per profession, pointing at the
  canonical family (exactly 67 rows).
- `jobs.family_id` on 8 demo rows rewritten to canonical IDs.
- `assert_cig_family_id()` widened to accept the 14 canonical IDs plus the
  legacy 12 during transition. Once all historical rows are on canonical IDs the
  legacy tokens can be removed (part of P7).
- In-migration invariants (all enforced with `RAISE EXCEPTION`):
  - exactly 14 canonical family rows;
  - every profession has a `primary_family_id`;
  - no active profession points at a non-canonical (legacy) family;
  - no orphaned `cig_profession_family_rel` rows;
  - no duplicate `(profession_id, family_id)` rows;
  - `count(professions) == count(family_rel)` (one canonical primary per role);
  - no `jobs.family_id` outside the 14 canonical IDs.

### SEO / URL surface (P5)

No public URL breakage. All Jobs and Career Center routes read canonical
snake_case IDs directly and derive kebab-case URL slugs via `familyPublicSlug`.
No legacy kebab slugs were exposed to end users during Phase C/D, so no
`301` redirect list is required. Legacy rows remain in place (soft-archived) so
internal analytics and any cached links continue to resolve.

### Governance & audit (P6)

- Regression: `bun run scripts/cie-check.ts` → PASS. All 11 personas produce
  identical ranked professions, identical current-fit and identical potential
  scores compared to pre-Epic-2 baseline.
- Governance harness: `bun run scripts/cig-governance-check.ts` remains PASS
  (Epic 1 objects untouched).
- Assessment IDs, engine reference numbers, profession IDs, and score formulas
  were not modified. Only the family label attached to each profession moved to
  the canonical taxonomy.

## Deferred to P7 (legacy hard delete)

P7 will run automatically only when a follow-up review re-confirms every check
above still holds and no active row points at a legacy family. Its scope:

1. `DELETE` the 13 archived rows from `cig_profession_families` (nothing
   references them any more).
2. Rename `cyber-information-security-canonical` → `cyber-information-security`
   and `security-technology-canonical` → `security-technology`.
3. Remove the 12 legacy tokens from `assert_cig_family_id()`.
4. Retire `LEGACY_FAMILY_ALIASES` / `LEGACY_DB_KEBAB_ALIASES` in
   `src/lib/legacy/family-aliases.ts` once no historical
   `assessment_runs.result_summary` payload references them (audit pending).

## Rollback

All changes are additive at the schema level. To roll Epic 2 back:

1. Revert profession primary-family assignments to the previous mapping.
2. `DELETE` the 14 canonical rows (they have no dependants once step 1 lands).
3. Restore `assert_cig_family_id()` to the pre-Epic-2 whitelist.
4. Clear `archived_at` / `resolves_to_canonical` / `canonical_id` on the legacy
   rows.
5. Re-run the CIE harness to confirm parity.

A dry-run rollback SQL is captured alongside the mapping document
(`docs/career-intelligence/epic-2-mapping.md`).

## What did NOT change

- The 16-question assessment.
- The engine version, scoring formulas, evidence weights, and confidence bands.
- Profession IDs, slugs, and canonical titles.
- Recommendation ordering for any of the 11 regression personas.
- Any user-facing copy outside Career Family names.

Ready for approval before proceeding to P7 or Epic 3.