# Sprint 09C — Revised Implementation Plan (Simplified)

Governed by the three constitution docs. Simplifications applied per your directives 1–12. No adaptive assessment, no employer ranking, no readiness %, no human-review workflow.

## Simplifications adopted

- **No review workflow**: no `profession_reviews`, no `reviewed_by/at`, no `awaiting_human_review`, no curator role, no manual publication gates.
- **Content status** (single field): `draft | published | archived`.
- **Quality level** (single field): `A | B | C`.
- **No Responsible-AI DB register** — principles stay in `/docs`.
- **No hidden matching bonuses** for Police/Armed Forces. Existing 16-Q scoring untouched.
- **Source health is a report**, not a publication gate: a temporarily broken link does not hide a profession.

## Phase A — Foundation (schema + read contract)

### A1. Additive migration (public schema)

Enums: `content_status ('draft','published','archived')`, `quality_level ('A','B','C')`, `link_status ('healthy','redirected','failed','needs_check')`, `source_type`, `alias_kind ('alias','specialisation','seniority','context','destination')`, `relationship_criticality ('mandatory','preferred','informative')`.

Entity tables (all additive, none touch Sprint 08 / 09B tables):

`profession_families`, `professions`, `profession_aliases`, `profession_specialisations`, `sectors`, `employer_types`, `work_environments`, `competencies`, `skills`, `knowledge_areas`, `work_preferences`, `assessment_dimensions`, `formal_requirements`, `education_pathways`, `certifications`, `experience_types`, `assessment_signals`, `source_references`, `career_transitions`.

Relationship tables: `profession_family_rel`, `profession_sector_rel`, `profession_employer_type_rel`, `profession_work_environment_rel`, `profession_competency_req`, `profession_skill_req`, `profession_knowledge_req`, `profession_work_preferences`, `profession_assessment_signals`, `profession_formal_requirements`, `profession_education_pathways`, `profession_certification_rel`, `profession_experience_req`, `profession_source_references`.

Common columns on every entity: `id uuid pk`, `slug text unique` (where meaningful), `content_status`, `graph_version text`, `valid_from timestamptz`, `last_verified timestamptz`, `created_at`, `updated_at`. Relationships carry: `importance smallint`, `criticality relationship_criticality`, `signal_polarity smallint`, `signal_weight numeric`, `legal_blocker boolean`, `country text`, `jurisdiction text`, `source_id uuid`, `content_status`, `graph_version`, `notes jsonb`.

`professions` gets a single `quality_level` and a single `content_status` (no duplicates), plus `primary_family_id`, `is_regulated`, `country`, `jurisdiction`, `title_sv`, `title_en`, `summary_sv`, `summary_en`, `overview_sv`, `overview_en`, `disclaimer_sv`, `disclaimer_en`.

`source_references`: id, stable_key, organisation, title, url, jurisdiction, language, source_type, accessed_at, last_checked_at, link_status, replacement_source_id (nullable, informational), notes, content_status.

**GRANTs / RLS**:
- All catalogue tables: `GRANT SELECT ON ... TO anon, authenticated` with `TO anon/authenticated` SELECT policies filtering `content_status = 'published'`. `service_role` gets ALL. No client writes — inserts/updates happen via server functions using `supabaseAdmin` (server-only) or seed migrations.
- Sprint 08/09B private tables untouched.
- Admin role: reuse the existing `app_role` enum + `has_role` (no new `curator` role).

### A2. Read contract v2

- Extend `src/lib/knowledge-graph/read.ts` with `readProfessionGraphV2()`, `listPublishedProfessions()`, `searchProfessions()`, `listFamilies()`.
- Server publishable client (no service role) reads `content_status='published'` rows.
- Old `readProfessionGraph()` keeps working (delegates to legacy TS seed) until Phase D swaps callers, so nothing breaks mid-migration.
- `graph-meta.ts`: bump `GRAPH_VERSION` to `cig-2026.07-09C.1`. Activation is gated in Phase E, not at merge.

### A3. Integrity scaffolding

- Extend `scripts/kg-check.ts` with: bilingual completeness by quality level, Level-C excluded from primary matcher pool, banned-phrase check (readiness %, "you are suitable", "approved by", "will pass"), formal-requirement separation, no direct `@/lib/career-center` imports from user-facing routes (allow-list), and canonical uniqueness (no duplicate `canonical_key`).
- New `scripts/sources-check.ts`: HEAD/GET each `source_references.url`, write `link_status` + `last_checked_at`, emit `docs/career-intelligence/source-health-report.md`. Never deletes rows; never hides professions.

## Phase B — Normalisation manifest (docs only, no inserts)

Deliverable: `docs/career-intelligence/normalisation-manifest.md`. Every proposed title → canonical id + family + level A/B/C. Police canonicals: Police Officer, Civilian Investigator, Police Investigator, Police Intelligence Analyst, Forensic Technician. Armed Forces canonicals: Soldier, Sailor, Officer, Specialist Officer, Reserve Officer, Military Police, Intelligence Soldier, Security Soldier, Cyber Soldier, Civilian Security Specialist. Internal police/military functions listed as specialisations/destinations, not canonical direct-entry professions.

## Phase C — Content seed migration

Second additive migration inserts 13 families + 55–65 canonical professions (≥20 A / ≥35 B / rest C) + aliases/specialisations + relationships + source records. Deterministic seed keyed by `stable_key` so re-runs are idempotent (upsert by key). Police & Armed Forces professions get `disclaimer_sv/_en` = "Formal eligibility, admission and selection are determined by the responsible authority." / equivalent SV. Formal-requirement rows require at least one source with `source_type in ('official','primary')`; integrity check enforces this.

## Phase D — UI integration

- Refactor to read-contract v2 (no direct `@/lib/career-center` in user-facing paths): `career-center.index.tsx`, `career-center.$profession.tsx`, `career-center.start.tsx`, `security-career-assessment.tsx`, `assessment/CareerMatchCard`, `assessment/result/*`, home `index.tsx`, `sitemap.xml.ts`, `dev.career-assessment-calibration.tsx`, MCP tools.
- Matcher gate: filter `quality_level='C'` out of primary results. No bonuses. Existing engine, weights, questions, dimensions untouched.
- Result screen relabelled to guidance framing: "What your answers indicate" / "Your strongest career paths" / "Professions close to your profile" / "Areas to explore" / "Why this result appears" / "Possible next steps". No readiness %, no pass/fail.
- Police / Armed Forces disclaimer rendered on affected profession pages and result cards.
- Where formal requirements are shown: static notice "Always verify current formal requirements with the responsible authority."
- Career Journey UI fully bilingual (SV/EN) via `src/i18n/dictionaries.ts`.

## Phase E — Verification & activation checkpoint

Install Vitest. Tests:
- graph integrity (kg:check)
- read-contract-only imports in user-facing routes
- deterministic matcher (same input → same output) against pinned personas
- Police + Armed Forces professions reachable as top matches for fitting personas, without hidden bonuses
- Level-C exclusion from primary results
- near-duplicate suppression
- banned-phrase / no-readiness-% scan
- formal-requirement separation
- i18n keys present for all Journey strings
- RLS matrix (anon / User A / User B / admin) via `supabase--read_query`
- bilingual completeness by quality level

Activation gate: bump `GRAPH_VERSION` to active only after all checks pass. Rollback documented in `docs/career-intelligence/rollback.md` — drop new tables, revert `GRAPH_VERSION`; no changes to legacy code paths so revert is clean.

## Blocking-conflict protocol

Halt before: any change to `career-assessment/*` scoring; any destructive change to Sprint 08/09B tables; any rename/delete of existing profession slugs already present in the TS seed.

## Approval

Proceeding with Phase A now — starting with the additive foundation migration.
