
# Sprint 09B — Final Corrections (planning only, no code changed)

The revised Career Intelligence Graph plan stands as previously approved, with the following mandatory corrections applied. Nothing else changes.

---

## 1. Corrected regulated-role seed table

### 1.1 Väktare (Security Officer)

| Stable id | SV label | EN label | Subtype | Applies to | Authority | Legal blocker | Source anchor |
|---|---|---|---|---|---|---|---|
| `fr.se.vaktare.company-authorization` | Auktorisation av bevakningsföretag | Authorization of security company | `company_authorization` | organization | Länsstyrelsen | yes (org must be authorized) | Lag (1974:191) om bevakningsföretag; Förordning (1989:149) |
| `fr.se.vaktare.training` | Föreskriven väktarutbildning | Prescribed security-guard training | `mandatory_training` | person | Auktoriserat bevakningsföretag under Polismyndighetens tillsyn (FAP 573-1) | yes | RPSFS / PMFS FAP 573-1 |
| `fr.se.vaktare.personnel-approval` | Länsstyrelsens godkännande som väktare | County Administrative Board personnel approval as security officer | `personnel_approval` | person | Länsstyrelsen | yes | Lag (1974:191); Förordning (1989:149) |

**Removed:** `fr.se.vaktare.employment` (employment/engagement in an authorized company is a future employment/assignment relationship, not a candidate qualification).

### 1.2 Ordningsvakt (Public Order Officer)

| Stable id | SV | EN | Subtype | Applies to | Authority | Blocker | Source anchor |
|---|---|---|---|---|---|---|---|
| `fr.se.ordningsvakt.training` | Ordningsvaktsgrundutbildning | Public order officer basic training | `mandatory_training` | person | Polismyndigheten | yes | Ordningsvaktslag (2023:421); PMFS |
| `fr.se.ordningsvakt.appointment` | Förordnande som ordningsvakt | Appointment as public order officer | `government_appointment` | person | Polismyndigheten | yes | Ordningsvaktslag (2023:421) |
| `fr.se.ordningsvakt.appointment.renewal` | Förnyelse och giltighet av förordnande | Appointment renewal and validity | `government_appointment` (renewal facet) | person | Polismyndigheten | yes on expiry | Ordningsvaktslag (2023:421); PMFS |

### 1.3 Skyddsvakt (Protective Security Guard)

| Stable id | SV | EN | Subtype | Applies to | Authority | Blocker | Source anchor |
|---|---|---|---|---|---|---|---|
| `fr.se.skyddsvakt.training` | Skyddsvaktsutbildning | Protective security guard training | `mandatory_training` | person | Utbildning enligt Polismyndighetens föreskrifter (PMFS) | yes | Skyddslag (2010:305); Skyddsförordning (2010:523) |
| `fr.se.skyddsvakt.approval` | Godkännande som skyddsvakt | Approval as protective security guard | `government_approval` | person | **Länsstyrelsen** (ordinary approval); **Försvarsmakten** only for personnel appointed within the Swedish Armed Forces | yes | **Skyddsförordning (2010:523) 6 §** |

**Removed:** `fr.se.skyddsvakt.scope` (`employer_authorization`). Object/assignment scope is not modelled as a canonical candidate qualification. A future entity `ProtectiveGuardAssignment` will link an approved skyddsvakt to a specific employer, principal or protected-object assignment; **out of scope for Sprint 09B**.

### 1.4 Cross-cutting SE requirements (corrected)

Retained: `fr.common.age-18`, `fr.se.residency-eligible-to-work`, `fr.common.driving-licence-b` (only where actually required), `fr.common.medical-fitness-basic` (only where actually required), `fr.eu.gdpr-training` (non-blocking).

**Removed:** `fr.se.criminal-record-check` as a separate candidate-visible requirement. Personnel approval and appointment processes (Länsstyrelsen for väktare/skyddsvakt, Polismyndigheten for ordningsvakt, Försvarsmakten for Armed-Forces skyddsvakt) already include suitability and background checks. The graph may describe that the authority performs these checks; **the candidate is never asked to upload criminal-record documentation.**

`fr.se.security-screening.basic` (`security_screening_requirement`) is kept only for roles where a formal `säkerhetsprövning` under Säkerhetsskyddslagen (2018:585) is documented (e.g. Data Center Security Specialist in scope, some Skyddsvakt objects) — never as a duplicate of a personnel-approval background check.

---

## 2. Updated Sprint 09B scope

All items from the previously approved Sprint 09B stand, with the following overrides.

**Included (unchanged from prior plan):**
1. `src/lib/knowledge-graph/` module with `types.ts`, `graph-meta.ts`, `read.ts`, `entities/*`, `relationships/*`, `integrity.ts`.
2. Ten-profession pilot populated per the approved plan, using the corrected regulated-role seed above.
3. FormalRequirement seed exactly as §1; misfiled entries removed from `Certification`.
4. SourceReference records for all Sprint 09B claims (Skyddslag 2010:305, Skyddsförordning 2010:523 §6, Lag 1974:191, Förordning 1989:149, Ordningsvaktslag 2023:421, PMFS/FAP 573-1, etc.).
5. Explicit relationship records (`ProfessionCompetencyRequirement`, `…Skill…`, `…Knowledge…`, `…Formal…`, `…Education…`, `…Certification…`, `…Experience…`, `…AssessmentSignal`, `CareerTransition`).
6. Backward-compat barrel at `src/lib/career-center/index.ts` re-exporting from `knowledge-graph`.
7. Additive migrations for CIP tables: `assessment_runs`, `assessment_responses`, `target_professions`, `evidence_items`, `gap_snapshots`, `career_plans`, `career_milestones`, `recommendation_instances` — each with GRANTs (authenticated + service_role, no anon), RLS enabled, policies scoped to `auth.uid()`.
8. `assessments` product-row seed `career-guidance` and initial `assessment_versions` row `2026.07.1`.
9. Server functions (`requireSupabaseAuth`): assessment run lifecycle, target management, evidence CRUD, gap snapshot, milestones — as previously listed.
10. Gap engine v1 (competence + formal + experience) as a pure function.
11. Career Center refactor to read via the graph contract, showing legal-blocker requirements distinct from development recommendations.
12. Assessment result screen: Requirements, Development, Sources, Set-as-target.
13. Career Journey MVP at `_authenticated/journey/`.
14. Beta caveat banner on `researched` (not-yet-`reviewed`) tiles.
15. `bun run kg:check` integrity script; vitest tests for gap engine, RLS, read contract.

**Overrides for the weekend beta UI (mandatory):**

- The Sprint 09B beta UI **will not** include any of the following, even though the underlying schema supports them: document uploads, identity documents, criminal-record documents, medical documents, government decisions, employer verification, manual verification workflows, revocation workflows.
- `evidence_items` remains defined per the approved schema, but the only `evidence_type` values written from the beta UI are: `self_assessment`, `career_guidance_dimension`, and self-reported formal-requirement acknowledgements. All other evidence types remain schema-only for later sprints.
- Beta flow, end-to-end: **assessment → saved result → target profession → profession requirements → legal vs. developmental distinction → competencies → education and certifications → career pathway → next-action milestone**. Nothing beyond this in the beta UI.
- Formal-gap presentation uses exactly four statuses in the UI: **required**, **self-reported as met**, **not provided**, **not applicable**. No "verified" / "expiring" / "revoked" chips in the beta.
- Competence information derived from the Career Guidance Assessment is presented as **guidance signals, strengths, or development areas** — never as verified demonstrated competence. Copy is updated accordingly.
- **No readiness percentage anywhere.** No combined score across competence / formal / experience.
- No candidate-facing criminal-record upload, prompt, or checklist item. Where authority checks apply, the UI states that the authority performs suitability and background checks as part of approval/appointment.

**Explicitly deferred (unchanged):** OrganizationRoleProfile, CourseOffering marketplace, ESCO import pipeline, AI coach, jobs, employer dashboards, admin CMS, `ProtectiveGuardAssignment`, document uploads, verification and revocation workflows.

---

## 3. Updated acceptance criteria

1. `src/lib/knowledge-graph/read.ts` is the only knowledge import used by Career Center, Assessment result, and Career Journey.
2. Ten pilot professions render via the read contract with SV+EN labels, aliases, family, definition, ESCO URI (nullable, never invented), ISCO where applicable, competencies, skills, knowledge, formal requirements, education, certifications, experience, career transitions, assessment signals, sources, review status, `lastVerified`.
3. FormalRequirement seed exactly matches §1: no `fr.se.vaktare.employment`, no `fr.se.skyddsvakt.scope`, no separate candidate-visible `fr.se.criminal-record-check`. `vaktarutbildning-appointment` does not exist. Väktare has training + personnel-approval + company-authorization only. Ordningsvakt has training + appointment + renewal facet. Skyddsvakt has training + approval where the approving authority is **Länsstyrelsen** (ordinary) and **Försvarsmakten** only for Armed-Forces personnel, cited to Skyddsförordning (2010:523) §6.
4. Every relationship in the approved §5 catalogue exists as an explicit record with metadata; no critical metadata lives in parent arrays.
5. Sprint 08 tables are untouched; new CIP tables are additive; all have GRANTs, RLS, and `auth.uid()`-scoped policies. `service_role` grants present for admin paths.
6. `assessment_runs` and `assessment_responses` cleanly separate user history from `assessments` / `assessment_versions`.
7. The beta flow is completable end-to-end by an authenticated user: assessment → saved result → target profession → requirements → legal vs. developmental → competencies → education & certifications → career pathway → next-action milestone.
8. Beta UI contains **no** document upload, identity/medical/criminal-record document capture, government decision upload, employer verification, manual verification, or revocation workflow.
9. Formal-gap UI shows only the four statuses `required` / `self-reported as met` / `not provided` / `not applicable`.
10. Career Guidance Assessment output is presented only as guidance signals / strengths / development areas — never as verified competence.
11. No readiness percentage or aggregate score appears anywhere.
12. No candidate-facing criminal-record request or upload exists; where relevant, the UI notes that the authority performs suitability and background checks as part of approval/appointment.
13. Every reviewed regulated claim carries a reliability-tier-1 source; `researched` tiles show a caveat banner.
14. `graphVersion` is stamped on published records and on every `gap_snapshots` and `recommendation_instances` row.
15. `bun run kg:check` passes; TypeScript passes; existing matching-engine personas and validation suites continue to pass unchanged.
16. Swedish and English copy complete; mobile layout works.
17. No AI, jobs, employer, admin CMS, `ProtectiveGuardAssignment`, or verification code is introduced.

---

## 4. Confirmation

No code, migration, or backend configuration has been changed. This response is planning only. Sprint 09B is ready to move to Build on your approval.
