# Interview Intelligence — existing-product reuse map

Audit of what already exists before changing any UX, so the integration extends
the product rather than growing a parallel one beside it.

**Method.** Every row was established by reading the route or component, not by
assuming. Where the audit found the work already done, the row says
*preserve unchanged* and nothing was touched.

## Employer

| Existing route / component | Disposition | Note |
|---|---|---|
| `EmployerAppShell` nav, `REKRYTERING` group | **Preserve unchanged** | `Intervjuer` is already present, directly after `Tester & bedömningar`, using the same `NavGroup`/`NavItem` shape and `to:` convention. Nothing to add. |
| `EmployerAppShell` light sidebar, header, SV/EN switch | **Preserve unchanged** | The dark sidebar in the mockup is not adopted; the current shell is authoritative. |
| `_authenticated.employer.$employerSlug.index` — `Att göra idag` | **Extend** | Real `ActionItem[]` built from live queries, zero-suppressed. Interview actions appended in the same shape. |
| `_authenticated.employer.$employerSlug.index` — `PrimaryCard` grid | **Extend** | A fifth card in the same component family, process counts only. |
| `_authenticated.employer.$employerSlug.applications.$applicationId` | **Extend — actual defect** | Already has all six sections the brief asks for, including `candidate-interview`. But it contained **zero** links to Interview Intelligence, so the two halves of the product never met. This is the real integration gap. |
| `candidate-interview` section (assessment-era `scp_interview_notes`) | **Preserve + extend** | Phase 1's coexistence decision holds: the older notes stay, Interview Intelligence is added beside them and clearly distinguished. |
| `ApplicationPassportPanel` | **Preserve unchanged, link** | Owns the disclosure rules already. Interview Intelligence reads through the same disclosure, never around it. |
| `assessments.*` routes and lifecycle functions | **Preserve unchanged, link** | Assessment observations stay labelled as such. |
| `EmployerAccessDenied`, `EmployerErrorState` | **Preserve unchanged** | Reused for every new surface. |
| `jobs.*`, `workforce`, `training`, `settings` | **Preserve unchanged** | Out of scope. |

## Candidate

| Existing route / component | Disposition | Note |
|---|---|---|
| `_authenticated.my-career.index` shell, greeting, header | **Preserve unchanged** | No candidate sidebar is introduced. |
| `PassportSummaryCard` | **Preserve unchanged** | Primary card keeps its position and weight. |
| `DashboardCard` "Jobb & ansökningar" | **Extend** | Candidate-appropriate interview status added to the application row. |
| `DashboardCard` "Din karriärprofil" | **Preserve unchanged** | |
| Career Discovery section | **Preserve unchanged** | Orientation only; the firewall is enforced in tests, not by hiding the section. |
| `_authenticated.my-career.applications` | **Extend** | Timeline gains candidate-appropriate interview steps. |
| `passport.*` routes | **Preserve unchanged** | Interview Intelligence never writes here. |
| Candidate interview information surface | **New** | The one genuinely new candidate route; nothing existing covers it. |

## Data linkage

| Existing column | Disposition | Note |
|---|---|---|
| `scp_interview_cases.application_id` | **Preserve, use** | Already present and foreign-keyed; the link the product needed was in the UI, not the schema. |
| `scp_interview_cases.job_id` | **Preserve, use** | Cross-tenant guarded in `scp_iv_create_case`. |
| `scp_interview_cases.candidate_user_id` | **Preserve, use** | Optional; external reference supported for candidates without accounts. |
| `scp_interview_cases.pack_version_id` + `pack_content_hash` | **Preserve unchanged** | Version pinning already correct. |

## What was NOT created

No parallel employer dashboard. No second candidate journey. No duplicate
candidate list. No new shell, nav pattern, card family, error state or access
check — every new surface uses the ones above.
