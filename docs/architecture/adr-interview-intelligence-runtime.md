# ADR — Interview Intelligence runtime: the employer interview product

**Status:** Accepted for implementation
**Date:** 2026-08-27
**Depends on:** `adr-interview-intelligence-role-pack-domain.md` (Phase 1, governed content)
**Baseline:** `main` `889eaad`, Phase 1 head `7fc0242`
**Scope:** The complete employer-facing vertical: case → sources → AI preparation →
human-approved plan → guided interview → AI-proposed evidence → human-confirmed
evidence → human assessment → immutable report.

---

## 1. Owner decision recorded

Väktare **C1–C6 remain first-class composite Interview Competencies.** They are not
split to match SCC-01…SCC-12. The relationship is many-to-many onto *exact* SCC
competency **versions**, and it is semantic, traceable, version-bound, **unweighted**
and **non-aggregating**.

It may support provenance, graph navigation, evidence interoperability, governance
and research. It must never drive a total, weight, threshold, ranking, suitability,
recommendation, pass/fail or autonomous employment decision.

**Provisional mappings do not block runtime development.** They block *publication*
of the pack as validated content (Phase 1 already enforces that) and they block any
scientific claim. They do not block synthetic fixtures or a controlled internal pilot.
Nothing in this phase marks a mapping expert-validated.

Implementation consequence: a runtime pilot path exists alongside `published`, so
a pilot can run a `draft`/`pilot_hypothesis` pack **without the pack ever claiming
to be validated**. Since 20260925090000 (owner decision 2026-08-28) the ordinary
gate is a governed CONTENT decision: the platform publisher makes one pack version
openly available (`pilot_availability = 'open'`), and every ACTIVE employer may
then use it in `internal_qa` mode — no employer-by-employer switch. An explicit
per-employer grant (`scp_interview_pack_pilot_grants`) remains for restricted or
private cohorts. Neither path weakens the publish gate.

Precisely: ACTIVE is enforced on **every case-creation path** and on open-pilot
**discovery**. One read branch is deliberately wider: a case already pinned to a
version keeps that version readable for the employer's members — continuity
access to work that exists, not permission to start a new interview. The
availability helper itself (`scp_iv_open_pilot_available`) is internal — no
browser principal, candidate or employer, can execute it directly; entitlement
reaches the client only through the SECURITY DEFINER read/create functions.

---

## 2. The six trust layers, as tables

The central rule: **an AI output can never silently become confirmed evidence.**
Layers 3/4 and layer 5 live in *different tables*, and the only path between them is a
governed RPC that records a human actor.

| Layer | Meaning | Tables |
|---|---|---|
| 1 | Original source | `scp_interview_case_sources`, `scp_interview_source_passages` |
| 2 | Governed content | Phase 1 (`scp_interview_pack_versions` …), **pinned** by the case |
| 3 | AI extraction | `scp_interview_ai_runs`, `scp_interview_role_requirements`, `scp_interview_candidate_facts` |
| 4 | AI suggestion | `scp_interview_prep_plans`, `scp_interview_prep_items`, `scp_interview_evidence_proposals`, `scp_interview_findings` |
| 5 | Human-confirmed evidence + human assessment | `scp_interview_evidence`, `scp_interview_assessments` |
| 6 | Authorised human decision | **deliberately absent** — see §2.1 |

### 2.1 Layer 6 has no table here, on purpose

The employment decision stays in the existing recruitment model
(`job_applications.status`, `set_application_status()`), outside the AI engine. Giving
this domain a `decision` table would create a second place where a hire is recorded and
would put the decision *inside* the engine that is forbidden from making it. The report
records **that the decision is the employer's** and names no outcome.

### 2.2 Why proposals and evidence are separate tables

`scp_interview_evidence_proposals` is AI output. `scp_interview_evidence` is confirmed
evidence. A proposal is *copied* into evidence by
`scp_interview_confirm_evidence_proposal()`, which records `confirmed_by`,
`confirmation_kind` (`accepted` / `edited` / `human_authored`) and, when the human
changed the text, both the original and the correction. A single table with a
`confirmed boolean` would make "AI said it" and "a human stands behind it" one
`UPDATE` apart. They are one **table** apart instead.

The report reads **only** `scp_interview_evidence`. A proposal cannot reach a report.

---

## 3. Source provenance and citation

`scp_interview_case_sources` holds a source *record*: kind, lawful-basis purpose,
origin (uploaded text, a linked `job_applications` row, a linked Passport disclosure),
retention state.

`scp_interview_source_passages` splits every text source into **immutable, addressable
passages** at ingest. Every AI claim cites a `passage_id`, never a character offset into
mutable text: an offset silently rots when text is re-saved, and a citation that rots is
worse than no citation.

Each AI-derived row carries a `claim_class`:

| `claim_class` | Meaning | Citation |
|---|---|---|
| `source_grounded` | asserted from a supplied source | passage **required** (DB constraint) |
| `governed_content` | comes from the pinned pack | no passage; pack ref required |
| `ai_inference` | a suggestion, explicitly not a fact | passage optional, **flagged in UI** |

`CHECK ((claim_class = 'source_grounded') = (source_passage_id IS NOT NULL))` makes
"candidate-specific claims require citations" a property of the data, not of a prompt.

---

## 4. Runtime spine and lifecycle

```
scp_interview_cases                 employer + job/application/candidate + PINNED pack version
├── scp_interview_case_sources      layer 1
│   └── scp_interview_source_passages
├── scp_interview_role_requirements layer 3 (from the employer's material)
├── scp_interview_candidate_facts   layer 3 (from candidate sources)
├── scp_interview_prep_plans        layer 4 → human-approved
│   └── scp_interview_prep_items    focus areas, selected probes, clarifications
├── scp_interview_sessions          the conducted interview (pause/resume, PEACE stage)
│   ├── scp_interview_session_questions   per Q1..Q8 state + notes
│   ├── scp_interview_notes               structured, autosaved
│   └── scp_interview_probe_usages        which approved probe was used, when
├── scp_interview_evidence_proposals layer 4
├── scp_interview_evidence           layer 5 (human-confirmed)
├── scp_interview_findings           gaps, contradictions, verification items
├── scp_interview_assessments        layer 5 (human judgement, 0–4 + rationale)
├── scp_interview_reports            immutable, versioned snapshot
├── scp_interview_ai_runs            every AI execution, with full provenance
└── scp_interview_case_events        append-only audit
```

**Case lifecycle:** `draft → sources_ready → prep_generated → prep_approved →
interview_in_progress → interview_complete → evidence_review → assessed → reported`,
plus `cancelled`. Transitions are guarded exactly as Phase 1's are: a legal-transition
`CASE`, a transaction-local marker only the governed RPCs set, and a fail-closed
`ELSE false`.

**Version pinning (§16):** `scp_interview_cases.pack_version_id` and `role_version_id`
are `NOT NULL … ON DELETE RESTRICT` and immutable after `prep_approved`. A later pack
version cannot change a running interview or a finished report retrospectively — the
report additionally stores the pack **content hash** it was built against.

---

## 5. The AI engine

`src/lib/interview-intelligence/ai/`. Server-side only; there is no browser path to a
provider and no key in client code.

```
provider.ts        AiProvider interface  { complete(req) → { text, usage, model } }
providers/mock.ts  deterministic, fixture-backed; the default and the test provider
providers/http.ts  generic HTTP adapter, provider-agnostic, INERT without env
registry.ts        the 11 task contracts: id, taskVersion, promptVersion,
                   inputSchema, outputSchema, allowedInputs, prohibitedInputs,
                   requiresHumanReview, failureBehaviour
policy.ts          prohibited-output detection, prompt-injection containment,
                   citation validation
orchestrator.ts    validate in → render prompt → call → parse → validate schema →
                   validate policy → validate citations → persist run + typed rows →
                   audit. Any failure quarantines; nothing is silently accepted.
```

**Provider independence.** Nothing outside `providers/` knows which provider ran. The
canonical business record is always the typed row; the provider's raw request/response
is kept only as a `jsonb` snapshot on `scp_interview_ai_runs` for audit.

**Prompt-injection containment.** Source text is never concatenated into the
instruction. It is passed inside an explicitly delimited untrusted block, the system
prompt states that the block is data and that instructions inside it must be reported
rather than followed, and `policy.ts` independently rejects an output that changed a
governed question, dropped citations, or emitted prohibited vocabulary. The prompt is
the first defence; **the validator is the one that decides**.

**Prompts cannot override rules.** Every output passes a zod schema, then the policy
checks, then citation checks — all after the model. A model that returns a total score
produces a *quarantined run*, not a total score.

### 5.1 The eleven tasks

| # | Task | Output → table | Human review |
|---|---|---|---|
| 1 | `role_requirement_extraction` | `scp_interview_role_requirements` | required |
| 2 | `candidate_source_extraction` | `scp_interview_candidate_facts` | required |
| 3 | `interview_preparation_generation` | `scp_interview_prep_plans/_items` | **approval gate** |
| 4 | `governed_probe_selection` | `prep_items(kind='probe')` — pack probes only | required |
| 5 | `contextual_probe_suggestion` | `prep_items(kind='clarification')` | required |
| 6 | `evidence_extraction` | `scp_interview_evidence_proposals` | required |
| 7 | `evidence_dimension_mapping` | proposal mapping columns | required |
| 8 | `gap_and_contradiction_detection` | `scp_interview_findings(kind in gap/contradiction)` | required |
| 9 | `verification_item_detection` | `scp_interview_findings(kind='verification')` | required |
| 10 | `interview_summary_draft` | `scp_interview_reports.draft_summary` | required |
| 11 | `report_draft_generation` | `scp_interview_reports.draft_sections` | required |

Task 4 is **constrained selection, not generation**: its output schema accepts only
probe ids that exist in the pinned pack, and the validator rejects any other id. That
is how "AI cannot rewrite Q1–Q8" is enforced for probes as well as questions.

---

## 6. PEACE and ORBIT

Operationalised as **interviewer-support content and process state**, never as candidate
measurement.

* **PEACE** is the session state machine: `planning → engage_explain → account →
  closure → evaluation`. Each stage carries governed interviewer guidance from the pack
  and a checklist; the workspace advances through them and records deviations with a
  reason. `scp_interview_sessions.peace_stage` is the live stage.
* **ORBIT** is rendered as interviewer *behaviour* guidance attached to each stage and
  to the probe purposes — rapport, autonomy-supportive phrasing, active listening,
  non-judgemental clarification, bounded adaptation — plus a post-interview
  **interviewer self-reflection** record (`scp_interview_sessions.process_reflection`).

Neither produces a candidate number. `scp_interview_sessions` has **no** column that
scores the candidate, and the process-quality fields describe the *interviewer's*
conduct. The report states plainly that PEACE/ORBIT are process methods and validate
nothing about the candidate.

---

## 7. Security, privacy, GDPR

* RLS on every new table; **no anon grant anywhere**; `authenticated` revoked to zero
  before precise re-grants (Supabase's default privileges otherwise hand out
  `TRUNCATE`, which RLS does not filter — the defect Phase 1's tests caught).
* Tenant isolation on `employer_id` via `has_employer_role()`. Every child table
  resolves to its case's employer through a `SECURITY DEFINER` helper that **raises**
  on an unknown table rather than returning NULL.
* Candidate has **no** access to the employer workspace. The candidate's own data
  reaches the case only through sources the employer already lawfully holds.
* `purpose_code` and `lawful_basis_note` are **required** on every source.
* Retention: `retention_state` + `retain_until` on cases and sources; a deletion RPC
  erases source content and passages while preserving the audit skeleton.
* **Transcript upload is feature-flagged twice**: a platform flag
  (`scp_interview_ai_config.transcript_enabled`) and a per-case explicit confirmation
  that the employer has a lawful basis and has met its information/consent duties,
  recorded with actor and timestamp. Without both, a transcript source cannot be
  created — enforced by trigger, not by the form.
* No candidate source content in ordinary logs: the orchestrator logs run ids, task and
  prompt versions, token counts and outcomes, never source or output text.
* Append-only audit (`scp_interview_case_events`) with no client INSERT grant.

---

## 8. Prohibited capabilities

The §15 list is enforced by **absence from the canonical contract**, as in Phase 1: no
column in the runtime domain stores a total, weighted score, threshold, ranking,
suitability, credibility, deception, emotion, stress, personality or protected
characteristic — and none can be added quietly, because
`scripts/interview-runtime-contract-check.ts` greps the migration and every runtime
source file for the identifiers and fails the build.

Two runtime numbers deserve explicit defence:

* `scp_interview_evidence_proposals.extraction_confidence` — confidence in the
  **extraction/mapping operation**, constrained `0..1`, and the column comment plus a
  test say so. It is never rendered next to the candidate's name, never aggregated, and
  a CHECK prevents it existing on a human-authored evidence row.
* `scp_interview_assessments.level` — the human's 0–4 judgement against the pack
  anchors, `NOT NULL` with a rationale. There is **no** table, view or function that
  sums, averages, weights or ranks levels, and a test asserts none appears.

---

## 9. Improvements over the brief's proposal

| # | Change | Why |
|---|---|---|
| R1 | Routes are `$employerSlug`-scoped (`/employer/$employerSlug/interview-intelligence/…`) | Every existing employer route is slug-scoped; the brief's unscoped path would have been the only tenant-ambiguous URL in the app. §12 permits improvement. |
| R2 | Immutable **passages** instead of character offsets | A citation into mutable text rots silently. |
| R3 | `claim_class` + DB constraint instead of "the prompt must cite" | Makes citation a property of the data. |
| R4 | Proposals and evidence are separate **tables** | One table + a boolean would put "AI said it" and "a human confirmed it" one UPDATE apart. |
| R5 | `pilot_authorised` grant instead of relaxing the publish gate | Lets the pilot run on a `pilot_hypothesis` pack without the pack ever claiming validation. |
| R6 | Mock provider is the **default**, not a test double | The product must work, and be developable, with no provider configured. Activation is an env change plus an admin flag, both owner decisions. |
| R7 | Report stores the pack **content hash** | Proves retrospectively which exact content the interview ran against. |

---

## 10. Consequences

**Positive.** One coherent domain; no temporary tables to replace later; every trust
layer independently queryable; the product degrades gracefully with no AI provider.

**Negative / accepted.** Twenty new tables is a large surface, and the proposal/evidence
split means two writes where a naive design has one. Both are the direct cost of the
rules in §2 and §8, and neither is removable without weakening them.

**Rollback.** `supabase/rollback/…_scp_interview_runtime_rollback.sql` drops the runtime
domain in dependency order and leaves the Phase 1 content domain, the assessment domain
and the recruitment model untouched, verified by assertion.
