# Employer OS Phase 1 — Integration & Live Verification Report

Date: 2026-07-23
Verifier: Lovable agent (build mode)

## 1. Main commit verified

- Local `main` HEAD: `5e98b32` — "Merge pull request #6 from cqrityjob/feat/employer-assessment-center".
- All Phase 1 surfaces present as route files under `src/routes/`:
  Command Center (`_authenticated.employer.$employerSlug.index.tsx`),
  Workforce (`.workforce.index.tsx`), Assessment Center
  (`.assessments.index.tsx` + `.assessments.$assessmentSlug.tsx`),
  Competencies, Training, Sites, Reports, Analytics, Ask CQrity, Settings,
  Preferences.

## 2. Migration review

Two pending migrations, both additive:

1. `20260721120000_employer_assessment_catalog_visibility.sql`
2. `20260722090000_employer_workforce_employees.sql`

Pre-check via `psql`: neither `employer_visible` / `role_category` columns
nor `public.employees` existed. No filename collision with existing
`supabase/migrations/*`. Both files inspected line-by-line: no ALTER on
existing rows apart from a single UPDATE that sets the two brand-new
columns on the `security-guard-foundation` catalog row; no touch to
assessment_runs, assessment_versions, question content, scoring, or any
report/historical data. Employees table uses the existing
`has_employer_role` + `employer_members_can_edit` helpers — same pattern
as `jobs` — for tenant-scoped RLS.

## 3. Migration application

Both migrations applied in a single transactional call via the platform
migration tool. No errors. Post-apply verification:

### Assessment catalogue

```
 id                        | employer_visible | role_category
---------------------------+------------------+---------------
 career-guidance           | f                |
 public-career-assessment  | f                |
 security_career_guidance  | f                |
 security-guard-foundation | t                | operational
```

Only `security-guard-foundation` is opted in; every other catalog row —
including `public-career-assessment` — remains invisible to the employer
portal. No unrelated column was modified.

### Employees

- Table exists with 12 columns (id, employer_id, first_name, last_name,
  email, role_title, site_name, employment_status, start_date, created_by,
  created_at, updated_at).
- Organisation ownership: `employer_id` (NOT NULL, FK → `public.employers`
  ON DELETE CASCADE).
- Indexes: `employees_pkey`, `employees_employer_idx (employer_id,
  employment_status)`.
- `set_employees_updated_at` trigger installed; `set_updated_at()` reused.
- RLS enabled (`relrowsecurity = t`).
- Policies: `employees_employer_select_own`, `employees_employer_insert`,
  `employees_employer_update` — all gated by `has_employer_role +
  employer_members_can_edit`. No DELETE policy (deactivation is a status
  update, per product spec).

## 4. Command Center test matrix

Signed-in verification against `/employer/h31-test-co-etlqoz` (owner
membership, employer status = pending):

| Check | Result |
| --- | --- |
| Workspace opens without public marketing header/footer | ✅ |
| Desktop sidebar renders | ✅ |
| Active module highlighting | ✅ (aria-current visible in module probes) |
| Organisation name + user role display | ✅ ("H31 Test Co etlqoz" / "Din roll: Ägare") |
| Real organisation data (no fabricated Readiness Score) | ✅ |
| Recruitment / Workforce / Assessment quick actions link correctly | ✅ |
| No console errors on dashboard | ✅ |
| No failed application/Supabase requests | ✅ |

## 5. Workforce CRUD matrix

Executed against the signed-in owner's own org via UI + DB verification.

| Step | Result |
| --- | --- |
| Empty state renders | ✅ |
| Create employee ("QA-Verify Phase1") via `createEmployerEmployee` | ✅ (row visible in DB) |
| Update (add email `qa@example.com`) via `updateEmployerEmployee` | ✅ (email persisted) |
| Deactivate via `setEmployerEmployeeStatus` (`inactive`) | ✅ (`employment_status='inactive'`) |
| RLS: other-org read blocked | Structural (policy: `has_employer_role + employer_members_can_edit`; verified in `tests/database/phase-h3-2-3/` regression pattern) |
| Test record cleanup | ✅ (DELETE via service_role after verification) |

No real personal data used.

## 6. Assessment Center matrix

| Check | Result |
| --- | --- |
| `/assessments` opens inside Employer OS shell | ✅ |
| Operational category selected by default | ✅ (per `listEmployerAssessmentCatalog` filtering to employer_visible + tab defaults) |
| `security-guard-foundation` appears once | ✅ (only employer_visible row) |
| Detail route `/assessments/$slug` loads | ✅ |
| Scoring logic / protected question payloads not exposed | ✅ (server fn returns only names, counts, competencies, dimensions; no answer keys or weights) |
| Strategic empty state | ✅ (no strategic-categorised row published) |
| Future categories clearly future-state | ✅ (Leadership/Compliance/Custom/AI shown as coming soon) |
| Decision-support disclaimer visible | ✅ (unchanged from Phase D.2.1) |

## 7. Foundation module matrix

All routes probed while signed in:

| Module | HTTP | Console errors |
| --- | --- | --- |
| /workforce | 200 | none |
| /assessments | 200 | none |
| /competencies | 200 | none |
| /training | 200 | none |
| /sites | 200 | none |
| /reports | 200 | none |
| /analytics | 200 | none |
| /ask-cqrity | 200 | none |
| /settings | 200 | none |
| /preferences | 200 | none |
| /jobs | 200 | none |
| /applications | 200 | none |

All foundation modules render with future-state messaging via
`EmployerModuleComingSoon`; no fake metrics, no broken buttons.

## 8. Languages / responsive

- SV/EN switcher present on every module (verified via probe).
- Sidebar labels translated for both locales.
- Mobile viewport (390×844) renders Command Center without overflow;
  drawer navigation reachable.

## 9. Security / tenant isolation

- Unauthenticated access to `/employer/*` → redirect handled by
  `_authenticated` layout gate (unchanged).
- Employees RLS uses the same helper-based pattern as `jobs`; foreign-org
  reads are structurally impossible without `has_employer_role`.
- Assessment catalog server functions require `requireSupabaseAuth` and
  re-derive active membership on every call; only `employer_visible = true`
  rows leave the server.
- CV storage policies (established in prior phase) unchanged; no new PII
  surface introduced by `employees` — no personnummer, health, criminal,
  or vetting fields exist in the schema.

## 10. Regression

| Check | Result |
| --- | --- |
| `bunx tsgo --noEmit` | ✅ 0 errors |
| `bun run cie:check` | ✅ CIE v1 harness: PASS |
| `bun run kg:check` | ✅ kg:check OK |
| `bun run question-library:check` | ✅ Question Library harness: PASS |
| `bun run employer-taxonomy:check` | ✅ OK |
| `bun run employer-job-form:check` | ✅ OK |
| `bun run admin-employer-status-guard:check` | ✅ OK |

`bunx tsc --noEmit` — CI job uses this; `tsgo --noEmit` is the project's
preferred TS check per instructions and passed clean.

- Public career assessment: no code, migration, or seed change touches
  it; verified by CIE + Question Library harnesses PASS and by the
  catalog opt-in defaulting `public-career-assessment` to
  `employer_visible=false`.
- Historical reports: no touch to `assessment_run_reports`,
  `assessment_runs`, or scoring code; catalog UPDATE only writes the two
  new columns on `security-guard-foundation`.
- Session storage progress: unchanged (`security-career-assessment.tsx`
  not modified).
- `security-guard-foundation` scoring: unchanged (no touch to
  `assessment_versions`, question mappings, or engine).

## 11. Defects found / fixed

None. No product code changed this turn. Migration state is now aligned
with `main`.

## 12. Files changed

- Applied migrations (both already present in repo, now applied to DB):
  - `supabase/migrations/20260721120000_employer_assessment_catalog_visibility.sql`
  - `supabase/migrations/20260722090000_employer_workforce_employees.sql`
- Added: this verification report.

## 13. Remaining limitations

- Only a single owner test account was available in the sandbox
  (`sandleradam191@gmail.com`, superadmin + owner of `h31-test-co-etlqoz`).
  Direct cross-account tenant-isolation UI probe wasn't run with a second
  non-admin user in this pass; DB-level RLS is structurally verified and
  matches the `jobs` pattern that already has database regression coverage
  under `tests/database/phase-h3-2*/`.
- Cross-organisation navigation as superadmin returns 200 (expected: admin
  path). No PII exposed.

## 14. Readiness verdict

**Ready for the ten-person live test group.** Migrations applied and
verified; every foundation route loads clean; Workforce full CRUD
persists correctly; Assessment Center exposes only opted-in metadata; all
regression harnesses pass and nothing in the public career assessment,
historical reports, or `security-guard-foundation` scoring has changed.

No further development performed after verification, per instructions.