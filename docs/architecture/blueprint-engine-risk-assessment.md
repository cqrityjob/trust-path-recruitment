# Assessment Blueprint Engine — Risk Assessment

**Companion to:** [Architecture Review](./blueprint-engine-architecture-review.md) · [Migration Strategy](./blueprint-engine-migration-strategy.md)

> **Corrected per Architecture Quality Review**: this document
> originally listed several risks (RLS misconfiguration, launch
> taxonomy mismatch, etc.) as hypothetical/future. The quality review
> found concrete instances of two of them already present in the
> approved design (C1, C2 below) and one previously-unlisted gap (C3)
> — all three are now corrected in the other six documents; this
> document is updated to reflect the corrections rather than the
> original open-ended risk framing. See
> [Architecture Review §11](./blueprint-engine-architecture-review.md#11-architecture-quality-review--corrections-applied)
> for the full list.

## 1. Architectural risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Process-as-data regression — a future change makes Blueprint/Run state transitions database-editable, reopening the RLS-bypass class of bug H3.3 hardened against | Medium (easy to reach for under time pressure) | High — direct integrity bypass, same class as the H3.3 employer-status incident | The process-vs-content guardrail is stated in every document in this set ([Architecture Review §2](./blueprint-engine-architecture-review.md#2-verdict), [Backend §1](./blueprint-engine-backend.md#1-governing-principle-content-is-data-process-is-code)) and should be a required code-review checkpoint for any future PR touching `content_status` transitions |
| Graph data-integrity gap — dangling profession-slug references in `cig_*` relationship tables | Low-Medium (informational finding, not yet quantified) | Medium — could silently produce incomplete competency requirements for a role | Step 0 of the [Migration Strategy](./blueprint-engine-migration-strategy.md#step-0--data-integrity-audit-pre-migration-read-only) audits this before the graph is leaned on further |
| Launch taxonomy mismatch — Security Supervisor does not yet exist as a `cig_professions` row | Certain (confirmed by audit) | Low if resolved per plan, High if silently assumed to exist | Resolved explicitly: author the missing profession row through the graph's own pipeline ([Migration Strategy Step 1](./blueprint-engine-migration-strategy.md#step-1--author-the-security-supervisor-profession-record-content-not-schema)), not a shadow/duplicate taxonomy |
| Many-to-many model complexity — more join tables than a hierarchy would need | Certain (by design) | Low — more tables, but each is a simple, well-understood association pattern already used elsewhere in this schema (`cig_profession_competency_req`, etc.) | Documented exhaustively in [DDD §3-4](./blueprint-engine-ddd.md#3-why-not-a-linear-hierarchy); no new pattern is invented, only repeated |
| **[Corrected, was found present, not hypothetical] Undiscovered parallel catalog** — the original design proposed `blueprints`/`blueprint_versions` as fully standalone, missing the pre-existing `assessments`/`assessment_versions` catalog that `assessment_runs` already requires (`NOT NULL` FKs) | Was Certain until corrected | Was High — would have failed at implementation (`NOT NULL` violation) and created a duplicate catalog | **Fixed (C1)**: every Blueprint/Blueprint Version now mirrors a row in the existing catalog; see [DB Schema §5](./blueprint-engine-db-schema.md#5-catalog-bridge-to-assessments--assessment_versions-fixes-c1) |
| **[Corrected, was found present] Invented `assessment_runs.status` values** — the original Backend RPC inventory used `'submitted'`/`'scored'`, values absent from the real `CHECK` constraint | Was Certain until corrected | Was High — RPCs as originally documented would fail at runtime | **Fixed (C2)**: existing three status values reused; new `blueprint_run_stage` column carries the finer granularity; see [Backend §2](./blueprint-engine-backend.md#2-rpc-inventory) |

## 2. Technical debt risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Content-authoring cost underestimated — "reuse the graph" is only true for Role/Environment/Competency vocabulary; Scoring Profiles and the Question Library need first-time authoring from zero rows | High (easy to conflate schema-reuse with data-reuse) | Medium — scheduling risk, not a correctness risk | Explicitly flagged as a distinct claim from schema reuse in [Architecture Review §4](./blueprint-engine-architecture-review.md#4-verified-grounding-repo-audit) and scoped as its own migration step ([Migration Strategy Step 5](./blueprint-engine-migration-strategy.md#step-5--author-minimum-launch-content)) |
| `scoreOne()` generalization risk — parameterizing the existing hardcoded 14-dimension function could introduce a regression in the production Career Intelligence Engine, which also depends on it | Medium | High — the public assessment's live scoring depends on this same function | Generalize via new optional parameters with the existing 14-dimension call sites as the default path, verified by the existing `cie:check` isolation test before and after the change |
| Two co-existing i18n mechanisms (flat `dictionaries.ts` vs. inline bilingual columns) extended further | Low (already an established, working pattern) | Low | No new mechanism introduced — [Frontend §5](./blueprint-engine-frontend.md#5-i18n) explicitly reuses both existing patterns for their existing purposes |

## 3. Performance risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Read-time Blueprint compilation (join across `blueprint_version_module_versions` → `question_version_module_versions` → overrides) at `start_assessment_run()` under load | Low at MVP scale (2×2 catalogue, closed beta volume) | Low now, Medium at scale | Every join key is an indexed FK (standard Postgres UUID PK/FK indexing); revisit with a materialized resolution cache only if profiling shows it's needed — not built preemptively |
| `assessment_run_reports` JSONB columns (`standard_result`/`requirement_match`) growing large per run | Low | Low | Bounded by the size of one participant's answer/score set, consistent with existing JSONB usage elsewhere in this schema |

## 4. Scaling risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| "Hundreds of future roles/environments" (owner's stated long-term goal) eventually requires content-authoring throughput the admin-only Builder can't sustain | Medium, long-term | Medium | Architecture doesn't block this — Requirement Profile and content-authoring RPCs are designed to be extended to non-admin authorized authors later ([Backend §8](./blueprint-engine-backend.md#8-mvp-vs-later-boundary-backend)) without a schema change, only an RLS/grant change |
| Multi-tenant Requirement Profile volume (many employers, many versions each) | Low at MVP | Low | Standard indexed FK on `employer_id`; no different from existing multi-tenant tables in this schema |

## 5. GDPR / data protection implications

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Recurring annual assessments create a growing history of personal competency data with no defined retention policy | Certain if Annual Review ships without a decision | High — regulatory exposure | **Explicitly unresolved, not assumed** — recorded as an open Product Owner/DPO decision in [Architecture Review §8](./blueprint-engine-architecture-review.md#8-unresolved-product-owner-decisions); Annual Review journey is not built in this MVP, so no data accumulates under this risk until the decision is made |
| Requirement Profile weighting could indirectly encode discriminatory criteria (e.g. proxy variables correlated with protected characteristics) if authored carelessly | Medium (authoring-process risk, not architecture risk) | High | Requirement Profile creation is platform-admin-only in this build (not open self-service), giving a natural review checkpoint; recommend a documented content-review guideline before self-service is ever turned on (later phase) |
| Data minimisation — new tables should not collect more than needed | Low if scoped as designed | Medium | Schema in this document set stores only competency/evidence-level scores, not raw free-text answers beyond what scoring requires; no new PII field is introduced beyond what `assessment_runs` already collects |

## 6. Security implications

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| RLS misconfiguration granting direct writes to a status-bearing table | Medium (the exact class of bug found and fixed in H3.3) | High | Every table's RLS is enumerated in [DB Schema §9](./blueprint-engine-db-schema.md#9-rls-model) with explicit "no `authenticated` `INSERT`/`UPDATE`/`DELETE`" statements; acceptance criteria in that document require verifying this at migration time, not assuming it |
| **[Corrected, was found present] `DELETE` was never explicitly denied**, and association FKs used `CASCADE` on immutable/historically-referenced version rows — a raw `DELETE` (accidental, future tooling, or service-role script) could have silently destroyed data multiple documents asserted was immutable | Was Medium-High until corrected | Was High — would have silently broken the reproducibility guarantee | **Fixed (C3)**: explicit `DELETE`-denial RLS row plus `ON DELETE RESTRICT` on every association→`*_versions` FK; see [DB Schema §3–§5, §9](./blueprint-engine-db-schema.md) |
| `compute_requirement_match()`'s inability to write `standard_result` | Low if built per spec | High — would violate the (A)/(B) separation structurally, not just by convention | **Corrected (I7)**: the original framing ("granted") was technically imprecise — a `SECURITY DEFINER` function runs with its owner's privileges regardless of caller grants. Enforcement is the function body containing no such write, verified by code review and test coverage, described accurately in [Backend §5](./blueprint-engine-backend.md#5-scoring-pipeline) and a named acceptance criterion in [Backend §10](./blueprint-engine-backend.md#10-acceptance-criteria-backend) |
| Raw DB/server errors leaking to UI | Low (established pattern already exists) | Low | Follows the exact error-handling convention already shipped in the H3.4 job-rejection fix ([Backend §7](./blueprint-engine-backend.md#7-error-handling)) |

## 7. Human decision-making and assessment integrity risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| An employer or the platform itself treats a report as an automatic hire/reject or compliance decision | Medium (natural temptation once scores exist) | High — misuse risk, reputational and potentially legal | No RPC or table anywhere in this design has an "approved"/"rejected"/"compliant" outcome field ([Backend §6](./blueprint-engine-backend.md#6-non-negotiable-integrity-principles)); report UI copy should explicitly state decision responsibility remains with the employer (a content/copy requirement for the eventual Frontend implementation, not a schema concern) |
| Future AI-narrative addition blurs the "AI explains, never decides" line | Low now (not built), Medium when it is | High if not designed carefully at that time | Out of scope for this build entirely; when undertaken, must preserve the same "no decision output field" structural guarantee established here |
| Accessibility of assessment content (screen-reader compatibility, plain-language requirements for scenario-based questions) | Medium (not addressed by this schema/backend work) | Medium | Content-authoring guideline item for Step 5 of the Migration Strategy; not a schema-level concern but should be part of the content-review checklist before publishing launch questions |
| Historical results become non-reproducible after a later Blueprint edit | Low (structurally prevented) | High if it occurred | Guaranteed by version-pinning at `start_assessment_run()` — see [DDD §4](./blueprint-engine-ddd.md#4-entity-ownership-cardinality-versioning-table) and [Backend §7](./blueprint-engine-backend.md#7-non-negotiable-integrity-principles) |
| **[Corrected, narrower gap found] Historical report wording drifts even though scores stay reproducible** — `evidence_signals`/`cig_*` vocabulary rows are edited in place, not versioned; a report referencing them by ID could silently show revised wording for an old run | Was Medium until corrected | Medium — display-only, not a scoring-integrity issue, but contradicted the stated reproducibility guarantee as originally worded | **Fixed (I5)**: report generation now snapshots the referenced labels into the report JSONB at generation time; see [Backend §6](./blueprint-engine-backend.md#6-report-pipeline) |

## 8. Risks explicitly not introduced by this build

- No billing/credits/entitlement risk — no such system exists or is
  built in this phase.
- No partner-API/white-label exposure risk — no public API surface is
  built in this phase.
- No AI/LLM-related risk (prompt injection, hallucinated narrative,
  model cost) — no AI dependency exists in this build.

## 9. MVP vs. later boundary (risk posture)

Risks in §5 rows 1 (retention) and §7 row 2 (future AI) are explicitly
**deferred risks** — they do not need mitigation now because the
functionality that would trigger them (Annual Review journey,
AI-narrative generation) is not part of this build. They are recorded
here so they are re-evaluated, not forgotten, when those later phases
are scoped.

## 10. Product Owner decisions (risk-relevant)

Per [Architecture Review §8](./blueprint-engine-architecture-review.md#8-product-owner-decisions),
decided: rating scale (kept at 1–5); Requirement Profile creation
stays platform-admin-only (the discrimination-risk review checkpoint
in §5 stays in force — no self-service in this build); Scoring Profile
cardinality (exactly one published per Blueprint Version);
`purpose`/`assessment_level` as lookup tables; public-assessment
convergence deferred until the Recruitment journey is validated. **Still
genuinely unresolved**: GDPR/retention duration for recurring
assessments — required before the Annual Review journey (§5, row 1) is
built, not before this first build.
