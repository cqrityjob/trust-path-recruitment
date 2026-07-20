# Assessment Blueprint Engine — Frontend Architecture

**Companion to:** [Backend](./blueprint-engine-backend.md) · [DDD](./blueprint-engine-ddd.md)

> **Corrected per Architecture Quality Review** (findings I1, I4
> addressed in this document).

## 1. Route table (new)

All new routes nest under the existing employer workspace shell
(`src/components/employer/EmployerWorkspaceChrome.tsx`) or a new
platform-admin area, following the file-based router convention
already used by `/employer/$employerSlug/*` (G2/G3) and
`/_authenticated/admin/*` (H3.x).

| Route | Access | Purpose |
|---|---|---|
| `/_authenticated/admin/blueprints` | `is_platform_admin()` | Blueprint list (draft/published/archived) |
| `/_authenticated/admin/blueprints/new` | `is_platform_admin()` | Universal Assessment Builder — step 1 entry |
| `/_authenticated/admin/blueprints/$blueprintId/builder` | `is_platform_admin()` | Universal Assessment Builder — steps 2-8 for an existing draft |
| `/_authenticated/admin/blueprints/$blueprintId/versions/$versionId` | `is_platform_admin()` | Read-only view of a published/archived version |
| `/employer/$employerSlug/assessments` | employer membership (`has_employer_role`) | Recruitment journey entry — list available published Blueprints |
| `/employer/$employerSlug/assessments/$blueprintVersionId/invite` | employer membership | Assign the assessment to a candidate/participant (Recruitment journey only, this build) |
| `/employer/$employerSlug/assessments/runs/$runId/report` | employer membership | View (A) + (B) report for a completed run |

Public assessment routes are **unchanged** — no new route is added
for it in this build.

## 2. Universal Assessment Builder — 8 steps

Admin-only wizard, gated by `is_platform_admin()` at the route loader
level (same pattern as the existing admin job-moderation routes).

| Step | UI | Backing data |
|---|---|---|
| 1. Purpose | Dropdown, **data-driven** (fixes I1 — no longer a hardcoded list), filtered to `assessment_purposes.is_assessable = true` for the default view, with an "all purposes" toggle for admins authoring ahead of launch | `assessment_purposes` |
| 2. Role | Dropdown, data-driven, filtered to `cig_professions.is_assessable = true` | `cig_professions` |
| 3. Environment | Dropdown, data-driven, filtered to `cig_work_environments.is_assessable = true` | `cig_work_environments` |
| 4. Assessment Level | Dropdown, **data-driven** (fixes I1), filtered to `assessment_levels.is_assessable = true` | `assessment_levels` |
| 5. Modules | Checkboxes, reusable. **Fixes I4**: pre-checks/highlights Modules whose `module_version_competencies` overlap the selected Role's `cig_profession_competency_req` and the selected Environment's `environment_competency_requirements` — the one defined MVP consumer of those two advisory tables. This is a UI suggestion only; the admin's final selection is what's written to `blueprint_version_module_versions`, not the suggestion itself | published `module_versions`, cross-referenced against `cig_profession_competency_req`/`environment_competency_requirements` |
| 6. Requirement Profile | Optional attach of an existing **published** Requirement Profile Version; **creation of a new one is admin-only in this build** (PO-confirmed). Fixes I6: only `published` versions are ever listed here, for any caller | `requirement_profile_versions` |
| 7. Participants | Single-level scope selector (`employer_id` only in this build — no Region/Contract/Site/Team hierarchy yet) | existing `employers`/`employer_memberships` |
| 8. Preview | Read-only summary: Purpose/Role/Environment/Modules/Estimated Time/Languages/Question Count | computed from the draft Blueprint Version's resolved question set |

Each step writes to the **draft** Blueprint Version only (via
`attach_module_to_blueprint_version()`, etc.) — nothing is visible to
employers until `publish_blueprint_version()` is called from a final
"Publish" action outside the 8-step flow.

## 3. Recruitment journey (only journey built in this build)

```mermaid
flowchart LR
    A[/employer/:slug/assessments] --> B[Select published Blueprint]
    B --> C[/employer/:slug/assessments/:versionId/invite]
    C --> D[Candidate completes Assessment Run]
    D --> E[/employer/:slug/assessments/runs/:runId/report]
    E --> F["Report shows (A) Standard Result + (B) Requirement Match if attached"]
```

Annual Review, Supplier Audit, Onboarding, and every other
`assessment_purposes` row are **selectable in the admin Builder** (so
Blueprints can be authored for them ahead of time) but have **no
employer-facing journey UI in this build** — only Recruitment gets one.
Adding a journey for another Purpose later is additive (a new thin
screen set), not a schema or RPC change — and per I1, adding the
Purpose *value* itself is now a data insert into `assessment_purposes`,
not a code change either.

## 4. Admin gating

Every new admin route reuses the existing `is_platform_admin()` guard
pattern already established for `/_authenticated/admin/jobs/*` — no
new authorization primitive is introduced.

## 5. i18n

Follows the existing dual-mechanism convention already established in
this codebase: UI chrome strings (buttons, labels, wizard step titles)
go in the flat `dictionaries.ts` pattern; Question/Module/Blueprint
*content* (bilingual `text_sv`/`text_en`, etc.) is stored inline in
its own table columns, matching the `Bi = {sv, en}` pattern already
used by `assessment-content.ts` and the `cig_*` tables' bilingual
columns.

## 6. MVP vs. later boundary (frontend)

**Built now:** admin Builder (8 steps, gated), Blueprint list/detail
views, Recruitment journey (list → invite → report), single-level
Participants scope.

**Not built now:** Annual Review / Supplier Audit / Onboarding / etc.
employer-facing journey screens (Purpose is selectable for future
authoring, but no UI consumes those Blueprints yet); full organisation
hierarchy picker (Org→Region→Contract→Site→Team); employer
self-service Requirement Profile builder UI; any partner/white-label
UI; any AI-narrative display in the report (the `ai_narrative` field
is not rendered — reserved for later).

## 7. Acceptance criteria (frontend)

- [ ] The Purpose, Role, Environment, and Assessment Level dropdowns
      (steps 1–4) show exactly the curated `is_assessable = true` rows
      by default — adding a third role, purpose, or level via data
      alone (flipping the flag / inserting a lookup row) makes it
      appear with zero code change (fixes I1).
- [ ] Step 5 (Modules) visibly distinguishes "suggested" (matching the
      Role/Environment's baseline competency requirements) from
      "selected" Modules, and the admin's explicit selection — not the
      suggestion — is what gets written (fixes I4).
- [ ] Step 6 (Requirement Profile) offers only "attach an existing
      **published** profile" to any caller, admin or employer; profile
      *creation* UI is only reachable from the admin area, and no
      draft Requirement Profile Version is ever listed here (fixes
      I6).
- [ ] The report view at
      `/employer/$employerSlug/assessments/runs/$runId/report` renders
      (A) and (B) as visually and structurally distinct sections, with
      (B) absent entirely when no Requirement Profile was attached.
- [ ] No route in §1 is reachable without the corresponding
      `is_platform_admin()` or `has_employer_role()` guard passing.
