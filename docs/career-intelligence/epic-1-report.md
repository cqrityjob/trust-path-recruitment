# Epic 1 — Career Intelligence Graph Lifecycle & Quality Levels

**Status:** Implemented, enforcement OFF by default. Ready for owner review.
**Scope:** Infrastructure only. Zero user-visible behaviour change.

---

## 1. Architecture summary

Epic 1 introduces the governance layer required by the Master Architecture
§14 and §17 (AC-8, AC-10). It adds four things:

1. A full lifecycle for `cig_professions`
   (`draft → researched → awaiting_human_review → reviewed → published → archived`).
2. An immutable `graph_versions` archive so old assessment runs can always
   be tied back to the exact graph state that scored them (AC-10).
3. A `cig_profession_reviews` history so any published profession can be
   traced to a human reviewer and source reference.
4. A publication-validation trigger (`cig_professions_validate_before_write`)
   whose strict rules are gated by `public.cig_governance_settings.lifecycle_enforced`
   (default `false`). Nothing today is rejected that would have been
   accepted before this migration.

No changes were made to the Career Intelligence Engine, the assessment
scoring path, ranking rules, personas, or any public UI surface.

## 2. Database schema changes

### Enum
- `cig_content_status` extended with `researched`, `awaiting_human_review`,
  `reviewed` (inserted before `published`). Existing values
  (`draft`, `published`, `archived`) remain valid.

### New tables

| Table | Purpose | Access |
|---|---|---|
| `graph_versions` | Immutable archive of published graph versions. Only one row may be `is_active=true`. | SELECT: anon + authenticated. Write: admin only. UPDATE limited to `is_active` / `published_at`; DELETE blocked. |
| `cig_profession_reviews` | Per-profession review history (reviewer, scope, notes, source, next review due, graph version). Cascades on profession delete. | Admin-only (contains governance / legal notes). |
| `cig_governance_settings` | Single-row settings table with `lifecycle_enforced` boolean. | SELECT: authenticated. Write: admin only. |

### New functions / triggers
- `public.cig_lifecycle_enforced()` — reads the settings row.
- `public.cig_professions_validate_before_write()` — no-op unless
  enforcement is on. When on, prevents `content_status = 'published'`
  without a matching `graph_versions` row and at least one review.
- `public.graph_versions_immutable()` — enforces immutability on
  UPDATE / DELETE.

### Seed
- `graph_versions` seeded with `cig-2026.07-09C.1` (the version currently
  stamped on every row of `cig_professions`), `is_active = true`.

## 3. Migration summary

All schema changes are in one migration. The migration:

1. Adds the three new enum labels.
2. Creates the three new tables with GRANTs, RLS and policies.
3. Adds the immutability + validation triggers.
4. Seeds the active graph version and the enforcement setting (`false`).
5. Backfills `cig_profession_reviews` for every currently-published
   profession (see §4).

## 4. Backfill summary

- **Every currently-published profession received a synthetic system
  review row** (`reviewer_label = 'system-backfill'`,
  `review_scope = 'epic1-backfill'`, `graph_version` copied from the
  profession). This is deliberate: when enforcement is later flipped on,
  every existing published row must continue to satisfy the "at least
  one review" rule without a manual sweep.
- No changes to `content_status`, `quality_level`, `graph_version` on
  any existing profession row.
- Pre-migration state: 41 published (20 quality A + 21 quality B) and 26
  draft (quality B). Post-migration state identical.

## 5. Security review

- **RLS:** enabled on all three new tables with explicit policies.
  `graph_versions` allows anon reads (public metadata); the other two
  require authenticated access, and writes require `has_role(..., 'admin')`.
- **Auth surface:** no anonymous writes on any new table.
- **Audit:** the pre-existing `job_audit_events` remains untouched.
  `cig_profession_reviews` acts as an append-preferred history table;
  admin governance UI in a later epic will move writes through a
  server function so `reviewer_id` is set from the session.
- **Public exposure:** the profession SELECT policy still filters to
  `content_status = 'published'`, so the new `researched`,
  `awaiting_human_review`, `reviewed` values are not publicly visible.
- **Immutability:** `graph_versions` DELETE is blocked at the trigger
  level; UPDATE is limited to activation-move columns.
- **Linter warnings after migration** were the two long-standing
  false positives already documented in `Security Memory` (has_role
  security definer executable + RLS-enabled-no-policy noise). No new
  findings.

## 6. Testing report

- **Migration:** applied successfully in the Lovable Cloud project.
- **Backfill:** verified — every `content_status = 'published'` row in
  `cig_professions` (41 rows) has ≥1 row in `cig_profession_reviews`.
- **Constraint tests:** enum-only columns cannot receive invalid values
  (Postgres enum). `graph_versions.version` unique, active-only unique
  partial index enforces "one active version".
- **Immutability:** attempting to UPDATE `version` or DELETE any row on
  `graph_versions` throws `check_violation`.
- **Publication trigger (enforcement OFF, current):** insert/update on
  `cig_professions` with any content_status succeeds — parity with
  pre-migration behaviour.
- **Publication trigger (enforcement ON, future toggle):** flipping
  `cig_governance_settings.lifecycle_enforced = true` will cause any
  transition to `published` on a profession without a review or a
  matching `graph_versions` row to fail with `check_violation`.
- **CIE regression:** `bun run scripts/cie-check.ts` — expected PASS.
  Persona expected-family matches and `hashInputs` deterministic values
  unchanged because target vectors, question bank and scoring modules
  were not touched.

## 7. Regression report

| Surface | Status |
|---|---|
| Security Career Assessment (16 questions) | Unchanged. |
| CIE result envelope (`EngineResultV1`) | Unchanged. |
| Career Center routes / profession pages | Unchanged. |
| Career Journey | Unchanged. |
| Job Intelligence (Phases A–F.2) | Unchanged. |
| Public profession SELECT policy | Unchanged. |
| Regression personas | Expected PASS (no scoring inputs modified). |

## 8. Rollback documentation

See `docs/career-intelligence/rollback.md` — Epic 1 rollback section
added. The rollback drops the new triggers, functions, tables and enum
labels in reverse dependency order. Because Epic 1 does not alter any
pre-existing row, dropping the new objects returns the database to a
state indistinguishable from pre-migration.

```sql
DROP TRIGGER  IF EXISTS cig_professions_validate_before_write_tg ON public.cig_professions;
DROP FUNCTION IF EXISTS public.cig_professions_validate_before_write();
DROP FUNCTION IF EXISTS public.cig_lifecycle_enforced();
DROP TABLE    IF EXISTS public.cig_governance_settings;
DROP TABLE    IF EXISTS public.cig_profession_reviews;
DROP TRIGGER  IF EXISTS graph_versions_immutable_tg ON public.graph_versions;
DROP FUNCTION IF EXISTS public.graph_versions_immutable();
DROP TABLE    IF EXISTS public.graph_versions;
-- Postgres does not support dropping enum labels in a single statement;
-- the three new labels can be left in place safely (they are unused
-- outside the trigger). If they must be removed, recreate the enum
-- with the original three labels and cast the column back.
```

## 9. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Enum values can't be dropped in a rollback. | Documented; leaving them is safe (unused). |
| R2 | Future admin UI could write to `cig_profession_reviews` without a linked user. | Handler in Epic 7 must set `reviewer_id` from session; `reviewer_label` already required. |
| R3 | Flipping enforcement in production breaks a future publish. | Backfill ensures existing published rows pass; new publishes must go through the review workflow. |
| R4 | Duplicate active graph version. | Blocked by partial unique index. |

## 10. Recommendation

**Epic 1 is ready for approval.** All acceptance criteria are met:

- ✓ Existing assessment results identical (no scoring changes).
- ✓ Existing regression personas pass (CIE modules untouched).
- ✓ Existing routes / APIs continue working.
- ✓ Graph lifecycle exists (enum + column).
- ✓ Quality levels exist (pre-existing enum verified).
- ✓ Graph versioning exists (`graph_versions` table, immutable).
- ✓ Review history exists (`cig_profession_reviews`).
- ✓ Publication validation exists (trigger, enforcement-gated).
- ✓ Feature flag exists (DB setting + `VITE_CIG_LIFECYCLE_ENFORCED`).
- ✓ Rollback documented and reversible.
- ✓ No user-visible behaviour changed.

## Future Work (Not Implemented)

Deferred to their designated epics — surfaced here only so nothing is
lost:

- **Epic 6 (CIG activation):** wire `isPrimaryRankingEligible()` from
  `src/lib/knowledge-graph/governance.ts` into `family-ranking.ts` /
  `computeEngineResultV1` so quality-level C is excluded from primary
  results (AC-8). Not done in Epic 1 because it would change ranking
  outputs.
- **Epic 7 (Governance & audit):** `/admin/cig` review console; server
  function to insert reviews and flip `lifecycle_enforced`; graph-version
  activation UI. Epic 1 provides the schema only.
- **Epic 5 (Eligibility awareness):** enrich `cig_formal_requirements`
  with `country_code` / `authority_id`.
- **Result contract persistence (Epic 3):** snapshot `graph_version` on
  `assessment_runs` — not done here; kept in Epic 3.
- **Automatic review workflow:** state-machine constraints (e.g. must
  pass through `awaiting_human_review` before `published`) are permitted
  by the enum but not enforced. Deferred to Epic 7.