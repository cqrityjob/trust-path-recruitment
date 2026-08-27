# ADR — Interview Intelligence Phase 1: the Role Interview Pack domain

**Status:** Accepted for Phase 1 implementation
**Date:** 2026-08-27
**Baseline:** `cqrityjob/trust-path-recruitment` · `main` · `5bfaf60ac03e6077036a2ec58b72715f60e2735d`
**Scope:** Role Interview Builder only. No candidate runtime, no AI provider, no employer surface.

---

## 1. Context

CQrity Interview Intelligence needs a canonical, versioned, governed definition of
*what a role interview asks and how its evidence is anchored*. Phase 1 builds the
authoring and publication machinery for that definition and imports one package —
Väktare v1 — as a pilot hypothesis.

Five owner decisions bind this phase:

1. Role-pack authoring is a **platform-governed admin capability**, not employer authoring.
2. The new domain **coexists** with `scp_interview_guide_prompts`; that table is not touched.
3. Väktare v1 enters as **draft + pilot hypothesis**, never as validated science.
4. **No AI provider** is activated.
5. **No employer navigation** item is added.

The prompt proposed a physical model. This ADR records where the implementation
follows it, where it diverges, and why each divergence is safer.

---

## 2. The decisive discovery: the generic guards cannot be reused

The assignment explicitly warned against attaching an existing generic trigger to a
new table without verifying its semantics. That warning was correct — both candidate
guards are unsafe here, for different reasons.

### 2.1 `scp_guard_published_immutable()` — wrong status vocabulary

Latest definition: `20260728181422_cff0d76a-c34f-46c1-98c1-dd28126902fb.sql:341`.

```sql
IF OLD.content_status IN ('draft', 'in_review') THEN RETURN NEW; END IF;
```

Its editable set is `{draft, in_review}`. The review ladder this phase requires is
`draft → expert_review → legal_review → cognitive_review → published`. Under this
guard a version sitting in `expert_review` would be treated as **immutable**, because
`expert_review` is not in its editable set. A reviewer asking for a wording change
could never have it applied — the draft would be frozen mid-review, and the only
recovery would be a new version for every review comment.

It also carries an `_allowed` array naming columns that belong to other tables
(`pilot_stats`, `validation_status`), which would silently permit writes to any
same-named column added here later.

### 2.2 `scp_guard_child_of_published()` — fails OPEN on unknown tables

Latest definition: `20260728181803_500542a9-3dc2-4e13-8505-7113dc859560.sql:96`.

It dispatches on `TG_TABLE_NAME` through a hardcoded `IF/ELSIF` chain covering
`scp_item_texts`, `scp_item_options`, `scp_item_option_texts`, `scp_form_items` and
`scp_role_weight_profile_weights`. For any other table `_status` stays `NULL`, and:

```sql
IF _status IS NOT NULL AND _status NOT IN ('draft', 'in_review') THEN ... END IF;
RETURN COALESCE(NEW, OLD);
```

…the row is allowed through. Attaching this trigger to the eight new child tables
would produce a trigger that **exists, is visible in `pg_trigger`, and enforces
nothing**. That is worse than no trigger: it reads as protection in review.

### 2.3 `scp_guard_version_starts_as_draft()` — permits skipping draft

Latest definition: `20260728181901_0db6ed3c-faa0-4b55-8509-c24ed96e7b4a.sql:1`.
It accepts `draft` *or* `in_review` on insert. §9 of the assignment requires that
every new pack version **begins as draft**. Reusing it would allow a version to be
inserted directly into a review state.

### 2.4 Decision

Write three purpose-built guards for this domain:

| New guard | Replaces | Difference that matters |
|---|---|---|
| `scp_interview_guard_version_starts_as_draft()` | `scp_guard_version_starts_as_draft()` | Accepts `draft` and nothing else. |
| `scp_interview_guard_version_transition()` | `scp_guard_published_immutable()` | Knows the six-state ladder; enforces the legal transition set; freezes content only from `published` onward; whitelists lifecycle columns explicitly by name for this table. |
| `scp_interview_guard_child_of_locked_parent()` | `scp_guard_child_of_published()` | Resolves the owning pack version through a `CASE` over `TG_TABLE_NAME` that covers **every** child table, and **raises** when it meets a table it does not know. Fails closed. |

The existing guards are left untouched and keep serving the assessment-content tables.

---

## 3. What is reused, unchanged

| Reused | How |
|---|---|
| `scp_content_roles` (`editor` / `reviewer` / `publisher`) | The authority model. No new role table. |
| `scp_has_content_role(uuid, text)` | Authority checks inside every RPC and policy. |
| `is_platform_admin(uuid)` | Oversight read access. |
| `scp_roles` / `scp_role_versions` | A pack version pins exactly one `scp_role_versions.id`. |
| `scp_competency_versions` | Pack competencies map to pinned canonical competency versions. |
| `scp_behaviour_versions` | Optional pinned observable-behaviour reference on a mapping row. |
| The status vocabulary of `scp_role_versions` | Adopted verbatim (see §4). |
| `AdminShellChrome` | The admin surface, one new nav destination. |
| `requireSupabaseAuth` server-function middleware | Every server function runs as the caller under RLS. |
| `supabase/tests/*.sql` assertion style + `scripts/db-test.sh` registration | The database suite. |
| `supabase/release-state.json` frontier entry | Release parity. |

### 3.1 The status vocabulary is not invented — it already exists

`scp_role_versions` and `scp_behaviour_versions` (migration
`20260802090000_scp_phase0_competency_graph.sql`) already declare:

```sql
CHECK (content_status IN (
  'draft', 'expert_review', 'legal_review', 'cognitive_review',
  'published', 'suspended', 'retired'))
```

This is precisely the ladder §9 of the assignment recommends, including the two
post-publication controlled states. The new domain adopts it **verbatim** rather
than inventing a parallel vocabulary. This is the "stronger governed pattern already
in the repository" that §9 invited.

---

## 4. Divergences from the proposed model, and why

### D1 — A dedicated audit table instead of `scp_content_events`

**Proposed:** reuse `scp_content_events`.
**Implemented:** `scp_interview_pack_events`.

`scp_content_events` constrains `action` to nine generic values
(`created, updated, submitted_for_review, approved, rejected, published, retired,
role_granted, role_revoked`) and `subject_type` to seventeen assessment-content
types. §15 of the assignment requires eighteen *specific* event names that
distinguish which gate was submitted, approved or rejected.

Reusing it would require widening two `CHECK` constraints on a shared governed table
— a change to existing governed functionality — and would still collapse
`expert_review_approved`, `legal_review_approved`, `cognitive_review_approved` and
`product_approved` into one indistinguishable `approved`. The audit contract would
be satisfied only inside a `metadata` JSON blob, which §8 forbids ("no binding rule
exists only inside JSON").

The dedicated table also closes a gap the existing one has: `scp_content_events`
grants `INSERT` directly to `authenticated`. §15 requires that ordinary clients hold
no direct audit-table mutation. `scp_interview_pack_events` carries **no client
INSERT grant at all** — the only writer is a `SECURITY DEFINER` RPC.

### D2 — Reviews are hash-bound, and approvals die when content changes

**Proposed:** review/approval records.
**Implemented:** `scp_interview_pack_reviews` rows carry
`content_hash_at_review`, and `scp_interview_publish_version()` refuses to publish
unless all four gates are approved **at the version's current content hash**.

Without this, the ordering `submit → approve all four gates → edit the questions →
publish` yields a published pack whose content nobody approved. Binding an approval
to the exact bytes it approved makes that sequence structurally impossible: any edit
after approval silently invalidates every gate, and the validation function reports
it as a blocking reason.

### D3 — Reviewer may not be the version's author

`scp_interview_record_review()` refuses when `reviewer_id = pack_version.created_by`.
§9 requires preventing "self-bypassing of required reviews". Holding all three
content roles is possible in this repo (they are independent grants), so without this
rule a single editor-reviewer-publisher could walk a version from draft to published
alone. This mirrors the two-person principle already stated for
`scp_publication_approvals`.

### D4 — The competency mapping is an explicit artifact with a confidence state

**Proposed:** "Pack Competency — reference to an exact `scp_competency_version`."
**Implemented:** `scp_interview_pack_competencies` (the pack's own governed C1–C6
definition text) **plus** `scp_interview_pack_competency_map` (one or more pinned
`scp_competency_versions.id` per pack competency, each with a `relation`, a
`mapping_state` and a mandatory `rationale`).

A single FK could not express the truth. Väktare C1–C6 are **compound** constructs
and the canonical library holds twelve **atomic** ones (SCC-01…SCC-12). For example
C1 "Situationsmedvetenhet och riskprioritering" spans SCC-03 (Situationsmedvetenhet)
and SCC-02 (Säkerhetsmedvetenhet); C6 spans SCC-07 and SCC-08. Forcing a 1:1 FK would
have required either inventing a false equivalence or duplicating six competencies —
both explicitly forbidden by §11.

`mapping_state` is `provisional` for every Väktare row, and
`scp_interview_pack_validate()` emits a blocking reason while any mapping is
provisional. The ambiguity is therefore *contained by the publish gate* rather than
resolved by guesswork. See §6 and the mapping report for the exact ambiguity raised
to the owner.

### D5 — Level 0 semantics are enforced in the data contract

`scp_interview_rating_anchors` carries
`counts_toward_aggregation boolean NOT NULL` with

```sql
CHECK (level BETWEEN 0 AND 4)
CHECK ((level = 0) = (counts_toward_aggregation = false))
```

The source (§6.1) states that level 0 "Får användas i sammanvägning? **Nej**" while
levels 1–4 may. §10 of the assignment requires that level 0 must never be converted
into a low score or folded into an average. Encoding it as a column constraint makes
the rule true of the *data*, not merely of the UI that renders it. It is a
permission flag, not a score: it stores no number, weight or total.

### D6 — Probe purpose provenance is recorded

Every probe carries `purpose` from the governed 5E taxonomy of source §4.2 *and*
`purpose_provenance ∈ {source_stated, derived_in_import}`.

The eight general probes in §4.2 have their purpose stated in the source table. The
forty question-specific probes (five per question) do not. Assigning them a purpose is
a judgement made during import; recording that it *was* a judgement keeps the
import traceable and gives the expert reviewer an explicit list to confirm. Silently
labelling all fifty as governed would have been the dishonest option.

### D7 — English wording is absent rather than invented

`prompt_en`, and the English columns of anchors, indicators and probes, are
**nullable and NULL** for the Väktare import. The source pack is Swedish, and its
core questions must be "läs ordagrant" (read verbatim). Machine-translating governed
interview wording would create an unreviewed second instrument. An English rendering
is itself governed content and needs its own review pass. The UI renders the Swedish
source and labels the locale.

### D8 — A pack version carries a truthfulness label separate from workflow status

`validation_label ∈ {pilot_hypothesis, content_validated}`, default
`pilot_hypothesis`. Workflow status answers "where is this in the process"; the label
answers "what may be claimed about it scientifically". Owner decision 3 requires the
Väktare package to communicate that it is not validated and not approved for
predictive claims. Conflating that with `content_status` would mean a pack could only
stop being a hypothesis by being published, which inverts the relationship.

---

## 5. Physical model

Twelve tables, all prefixed `scp_interview_` and all inside the existing Security
Competency Platform domain in `public`.

```
scp_interview_packs                     stable identity (slug, role_id)
└── scp_interview_pack_versions         the immutable versioned aggregate
    │   pins role_version_id, carries content_status, validation_label,
    │   locale, source_reference, content_hash, lifecycle attribution
    ├── scp_interview_pack_competencies         C1..C6, definition + indicators
    │   └── scp_interview_pack_competency_map   → pinned scp_competency_versions
    │                                             (+ optional behaviour version)
    ├── scp_interview_core_questions            Q1..Q8, fixed order, exact wording
    │   ├── scp_interview_question_competencies → pack competencies (n:n)
    │   ├── scp_interview_approved_probes       purpose-labelled probes
    │   ├── scp_interview_evidence_dimensions   what evidence to seek
    │   └── scp_interview_rating_anchors        levels 0–4  (also competency-level)
    ├── scp_interview_verification_rules        separate-verification boundaries
    ├── scp_interview_prohibited_areas          forbidden topics/inferences/practices
    ├── scp_interview_pack_reviews              append-only, hash-bound gate records
    └── scp_interview_pack_events               append-only governance history
```

`scp_interview_approved_probes` also permits `question_id IS NULL` for the eight
pack-level general probes of source §4.2, which apply to every question.

`scp_interview_rating_anchors` attaches to exactly one of `question_id` or
`pack_competency_id`, enforced by `CHECK (num_nonnulls(...) = 1)` with two partial
unique indexes. The Väktare import uses question-level anchors only.

### 5.1 Every logical entity remains independently traceable

| § 8 logical entity | Physical home |
|---|---|
| 1 Role Interview Pack | `scp_interview_packs` |
| 2 Pack Version | `scp_interview_pack_versions` |
| 3 Pack Competency | `scp_interview_pack_competencies` + `_competency_map` |
| 4 Core Question | `scp_interview_core_questions` |
| 5 Question–Competency Mapping | `scp_interview_question_competencies` |
| 6 Approved Probe | `scp_interview_approved_probes` |
| 7 Evidence Dimension | `scp_interview_evidence_dimensions` |
| 8 Rating Anchor | `scp_interview_rating_anchors` |
| 9 Verification Rule | `scp_interview_verification_rules` |
| 10 Prohibited Area | `scp_interview_prohibited_areas` |
| 11 Review / Approval | `scp_interview_pack_reviews` |
| 12 Audit Event | `scp_interview_pack_events` |

Nothing was consolidated. No entity lives only inside a JSON column.

---

## 6. The competency-mapping decision (assignment §11)

C1–C6 are **not** identical to any SCC construct. The import therefore does not
assert equivalence. Each pack competency is mapped to the canonical competency
versions it spans, with `relation` and a written rationale, and every row is
`mapping_state = 'provisional'`.

| Pack | Mapped to (pinned `scp_competency_versions`) | Relation |
|---|---|---|
| C1 Situationsmedvetenhet och riskprioritering | SCC-03, SCC-02 | broader_than_source |
| C2 Konflikthantering och självkontroll | SCC-05, SCC-07 | broader_than_source |
| C3 Integritet, regelmedvetenhet och mandat | SCC-01, SCC-11 | broader_than_source |
| C4 Kommunikation och dokumentation | SCC-06 | equivalent |
| C5 Omdöme och agerande under press | SCC-04, SCC-11 | broader_than_source |
| C6 Service, samarbete och professionellt bemötande | SCC-07, SCC-08 | broader_than_source |

**Ambiguity reported to the owner, not resolved here:** five of the six pack
competencies are unions of two canonical competencies, which means a later runtime
cannot mechanically attribute an interview rating on C1 to either SCC-02 or SCC-03
without a weighting rule that no source document supplies. Inventing that weighting
would be an unsupported scientific assumption, and §5 forbids competency weighting
outright in Phase 1. The mappings are therefore recorded as directional and
provisional, the pack cannot publish while they are provisional, and confirming or
splitting them is the first item of the expert review gate.

C4 is the single clean 1:1 (SCC-06 "Kommunikation och informationskvalitet"), and is
still marked provisional so that the expert gate approves the whole mapping set as
one artifact rather than a mixture the reviewer must dissect.

---

## 7. Prohibited-capability posture

The assignment's §5 list is enforced by absence, not by hiding:

* No column in any of the twelve tables stores a total, a weight, a score, a
  threshold, a ranking, a recommendation, a credibility value or a probability.
* The only numeric columns are `version_number`, `display_order`, `level` (0–4),
  and `recommended_duration_min` / `recommended_duration_max` (minutes).
* `counts_toward_aggregation` is a boolean permission flag whose only legal value at
  level 0 is `false`; it is not a weight and cannot carry one.
* A CI guard (`scripts/interview-pack-contract-check.ts`) greps the migration and the
  domain's source files for the forbidden vocabulary and fails on a match, so a
  future edit cannot reintroduce a dormant field quietly.

No AI provider, model identifier, prompt template, API key or generation call exists
anywhere in the domain. The same CI guard asserts that too.

---

## 8. Permissions

RLS is enabled on all twelve tables. No `anon` grant on any of them, and no `anon`
EXECUTE on any function.

| Actor | Draft read | Draft write | Review | Publish/suspend/retire | Published read |
|---|---|---|---|---|---|
| `anon` | – | – | – | – | – |
| candidate / ordinary authenticated | – | – | – | – | – |
| employer owner/admin/member | – | – | – | – | – |
| content `editor` | yes | yes | – | – | yes |
| content `reviewer` | yes | – | yes | – | yes |
| content `publisher` | yes | – | – | yes | yes |
| platform admin | yes | – | – | – | yes |

Write access to content tables is granted through policies to editors only, and only
while the owning version is in an editable state. Review, publication, suspension and
retirement are reachable **only** through `SECURITY DEFINER` RPCs, each of which
performs its own authority check and pins `search_path = public`. Every such function
is `REVOKE ALL ... FROM PUBLIC, anon` and granted to `authenticated` only, which keeps
the anon SECDEF allowlist in `supabase/tests/security_hardening_test.sql` (S3.1) and
`scripts/sql-security-guard-check.ts` unchanged.

Platform admin deliberately has read-only oversight rather than authoring rights:
`scp_can_author()` already treats admin as an author for the assessment domain, and
Phase 1's separation of duties is cleaner if oversight and authorship are distinct.

---

## 9. Publication is transactional and fails closed

`scp_interview_publish_version()` runs `scp_interview_pack_validate()` first and
aborts on any blocking reason, inside the same transaction that would flip the
status. The validation function checks, at minimum:

1. exactly eight core questions, codes `Q1`–`Q8`, `display_order` 1–8 with no gaps;
2. Q1–Q6 `behavioural`, Q7–Q8 `situational`;
3. every question maps to at least one pack competency;
4. every question has all five levels 0–4 of anchors, and no other level;
5. every question has at least one evidence dimension and one approved probe;
6. at least one verification rule and one prohibited area;
7. every pack competency has at least one mapping row, and **no mapping is provisional**;
8. all four review gates approved at the current content hash;
9. `role_version_id` resolves to an existing role version.

A partial or invalid pack cannot reach `published`, and the guard on the table
independently refuses any transition into `published` that did not come from the RPC
(the RPC sets a transaction-local marker the guard requires).

---

## 10. Consequences

**Positive.** The domain is self-contained and additive; nothing existing changes
behaviour. The review ladder matches the repository's own. Approvals cannot outlive
the content they approved. The competency ambiguity is visible and blocking rather
than buried. Prohibited capabilities are absent from the contract and guarded in CI.

**Negative / accepted.** Twelve new tables is a large surface for one phase, and the
purpose-built guards duplicate a little logic that the generic guards would have
supplied had their semantics matched. Both costs are accepted: §2 shows the generic
guards would have been unsafe, and the entity count is the direct consequence of §8's
requirement that each logical entity stay independently traceable.

**Migration consequences.** One additive migration, no modification of any applied
file, clean full-history replay, and a `release-state.json` frontier entry marking it
`pending` — it is **not** applied to any hosted environment.

**Rollback.** `supabase/rollback/20260918090000_scp_interview_role_packs_rollback.sql`
drops the twelve tables, the guards and the RPCs in dependency order. Because the
domain is additive and nothing outside it references these objects, the rollback
restores the exact pre-migration schema.
