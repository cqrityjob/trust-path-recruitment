# CQrityjob — Assessment & Training Content Architecture Map

**Baseline** `origin/main` @ `3d825f347a8f201a0de6cbc7e2f44ba75ed89510`
**Purpose** Map the authoritative content architecture BEFORE schema change, so #47 extends rather than replaces.
**Rule applied** existing table → existing relationship → additive extension → (only then) new table.

---

## 1. Authoritative objects

| Concern | Authoritative object | Verdict |
|---|---|---|
| Assessment family (product grouping) | `scp_assessment_families` (`product_type`, `name_sv/en`, `description_sv/en`) | **REUSE** |
| Assessment definition (identity) | `scp_assessment_definitions` (`slug`, `name_sv/en`, `purpose`, `profession_id`, `is_test_fixture`) | **REUSE + extend** |
| Assessment version (governed content) | `scp_assessment_versions` (`content_status`, `validation_status`, `language_scope`, `content_hash`, `published_at`, `retired_at`, `program_version_id`) | **REUSE** |
| Programme identity | `scp_programs` (`slug`, `role_id`) | **REUSE + extend** |
| Programme version | `scp_program_versions` (`content_status`, `validation_status`, `name_sv/en`, `purpose_sv/en`, `does_not_measure_sv/en`) | **REUSE** |
| Module identity | `scp_modules` (`slug`) | **REUSE + extend** |
| Module version | `scp_module_versions` (`name_sv/en`, `summary_sv/en`, `estimated_minutes`, `display_order`, `content_status`) | **REUSE + extend** |
| Items / questions | `scp_items`, `scp_item_versions` (56 governance cols, `mode IN ('learning','assessment')`, `item_format`) | **REUSE** |
| Item text / options | `scp_item_texts`, `scp_item_options`, `scp_item_option_texts` (`learning_feedback_sv/en`, `is_preferred`, `distractor_error_type`) | **REUSE** |
| Form (ordered delivery) | `scp_forms`, `scp_form_items` (`assessment_version_id`, `target_minutes_min/max`) | **REUSE** |
| Rubrics | `scp_rubrics`, `scp_rubric_versions`, `scp_rubric_dimensions`, `scp_rubric_levels` | **REUSE** |
| Competencies | `scp_competencies`, `scp_competency_versions`, `scp_competency_facets` | **REUSE** |
| Behaviours | `scp_observable_behaviours`, `scp_behaviour_versions` | **REUSE** |
| Behaviour → competency | `scp_behaviour_competency_map` | **REUSE** |
| Module → behaviour | `scp_module_behaviour_map` | **REUSE** (tenancy-sensitive) |
| Profession / role | `scp_professions`, `scp_roles`, `scp_role_versions`, `scp_role_competency_map`, `scp_role_weight_profiles`, `scp_item_version_professions` | **REUSE** |
| Assignment | `assessment_assignments` + `scp_employer_assign()` | **REUSE (assessment)**; training needs its own carrier |
| Attempts | `scp_attempts` (`mode`, `governance_mode`, `validation_status_at_assignment`, `test_grant_id`) | **REUSE** |
| Responses | `scp_candidate_responses` | **REUSE** |
| Human review | `scp_human_reviews`, `scp_review_requirements` (141 rows), `scp_review_rubric_scores` | **REUSE** |
| Reports | `scp_report_versions`, `scp_report_snapshots`, `scp_release_attempt_report()` | **REUSE** |
| Evidence | `scp_competency_evidence`, `scp_evidence_source_types` | **REUSE + extend** |
| Learning Mode | `scp_start_learning_attempt`, `scp_get_learning_feedback`, `scp_complete_learning_module` | **REUSE + correct** |
| Development recommendations | `scp_development_recommendations()` | **REUSE + correct** |
| Processing purposes | `scp_processing_purposes`, `scp_purpose_versions` | **REUSE** |
| Publication / content status | `content_status` + `validation_status` + `scp_grant_permits_assignment()` | **REUSE — no new enum** |
| Languages | `*_sv` / `*_en` column pairs + `scp_assessment_versions.language_scope` | **REUSE** |
| Employer ownership / tenancy | **DOES NOT EXIST** | **ADD — additive column** |
| Library read model | `scp_employer_library(_employer_id)` | **REUSE + extend** |
| Closed-test governance | `scp_governance_mode`, `scp_test_grants`, `scp_fixture_access`, `scp_has_test_grant()` | **REUSE** |

---

## 2. The content status model already exists — do not add an enum

The five conceptual states in the #47 brief map onto existing mechanisms with **no new vocabulary**:

| Conceptual state | Existing mechanism | Assignable? |
|---|---|---|
| **Draft** | `content_status = 'draft'` | No — `scp_grant_permits_assignment` returns NULL without a closed-test grant |
| **Internal testing** | `is_test_fixture = true` + `scp_fixture_access`/`scp_test_grants` → `governance_mode = 'development'`; or draft/approved + design/pilot + closed-test grant → `'closed_test'` | Only inside the granted context |
| **Under review** | `content_status = 'in_review'` | No — absent from every permitted list |
| **Published** | `content_status = 'published'` + `validation_status IN ('operational-development','operational-selection')` → `'recruitment'` | Yes, per purpose/permission/ownership |
| **Retired** | `retired_at IS NOT NULL` | No new assignments; history preserved |

**Two vocabularies coexist and must both be honoured:**

- `scp_assessment_versions.content_status` — `draft, in_review, approved, published, retired`
- `scp_program_versions` / `scp_module_versions.content_status` — `draft, expert_review, legal_review, cognitive_review, published, suspended, retired`

The library read model must normalise these to one presentation vocabulary **without** rewriting either CHECK constraint. Normalisation belongs in the read model, not in the storage.

---

## 3. Live content inventory (local replay of `origin/main`)

| Object | Rows | Note |
|---|---|---|
| Assessment versions | 3 | 2 are `TESTFIXTUR` fixtures; 1 real (`sg-operational-baseline`, draft, 18 items) |
| Programme versions | 2 | `Väktare – Operativt säkerhetsutvecklingsprogram` (draft), 1 fixture |
| Module versions | 7 | **6 real `sg-*` modules (draft)** + 1 fixture module (published) |
| Module → behaviour links | 11 | |
| Items / item versions | 39 | |
| Competencies / behaviours | 12 / 8 | |
| Assessment evidence | 72 | `assessment_response`, contribution 0.500–1.000 |
| **Training evidence** | **0** | The maturity-isolation window is open and free |
| Attempts | 4 | |

**The six real training modules already exist as draft content** and map directly onto the #47 training examples:

| Module | #47 training category |
|---|---|
| Tillträde och behörighet | Access control |
| Observation och avvikelsehantering | Observation and reporting |
| Konfliktförebyggande och nedtrappning | De-escalation |
| Incidenthantering och första åtgärder | Emergency response |
| Rapportering och dokumentation | Incident reporting |
| Etik och yrkesansvar | Security culture |

No new training content needs inventing. It needs surfacing.

---

## 4. Gaps that #47 must close

| # | Gap | Nature |
|---|---|---|
| G1 | **No tenancy anywhere.** `owner_employer_id` exists on no table | Additive column + RLS |
| G2 | **32 `USING (true)` SELECT policies.** The content-bearing subset leaks employer-private content the moment it exists | Policy replacement |
| G3 | **The library shows assessments only.** `scp_employer_library` returns `scp_assessment_versions`; the 6 real training modules and their programme are invisible to employers | Read-model extension |
| G4 | **No `counts_toward_maturity`.** Training completion enters the maturity mean and *lowers* computed levels | Additive column + `scp_compute_maturity` join |
| G5 | **Module has no learning content, no knowledge-check link, no acknowledgement.** `getLearningFormForModule` is hard-coded to `"fixture-learning-form"` | New table + columns |
| G6 | **No training assignment carrier.** `scp_employer_assign` hard-codes `mode='assessment'` | New table + RPCs |
| G7 | **`scp_my_academy_assignments` is attempt-rooted** — cannot represent training without a phantom attempt | Read-model change (UNION) |
| G8 | **`scp_development_recommendations` has no `content_status`/`retired_at` filter** — recommends unassignable content | Query fix |
| G9 | **Library metadata is thin**: no description, no competencies, no module count, no language availability, no review requirement, no ownership | Read-model extension |
| G10 | **Fixture names are the customer-facing product** (`TESTFIXTUR — leveranskedja`) | Presentation labels |

---

## 5. Design decisions taken from this map

1. **No parallel database.** Every gap above is an additive column, a policy, a read model, or one of two new tables that hang off the existing spine.
2. **No new status enum.** Section 2 shows the lifecycle already exists; the read model normalises.
3. **One library read model** spanning assessments *and* programmes, discriminated by a `library_kind` derived from existing `product_type` + programme/module structure — not a new stored classification where one can be derived.
4. **Tenancy is a nullable column**, `NULL` = CQrityjob-global. This preserves every existing row's visibility while making employer-private content expressible.
5. **Training evidence is excluded from maturity by source type**, not by contribution tuning — tuning fails in both directions (see the Training Architecture Lock v2, §8).
