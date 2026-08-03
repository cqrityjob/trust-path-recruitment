# Phase 2 — Functional Assessment Center (Security Competence Academy)

Draft. **Do not merge.** Opened for staging verification, which has not yet run —
see *Known limitations*.

10 commits, unsquashed, from `42dff14`.

---

## Scope

The Assessment Center becomes a working product area: an employer can assign a
development programme, a participant can complete it, responses become evidence
in the Security Competency Graph, a human reviews what no machine may score, and
a maturity profile is released and tracked over time.

Everything lives under the existing `/employer/$employerSlug/assessments`
hierarchy plus a participant surface at `/academy`. No second route hierarchy, no
new sidebar entry, no change to Career Platform, Recruitment or Passport.

## Employer flows

Overview (counters, recruitment-unavailable notice) · Library (assignable and
in-development programmes, with each programme's own limitations) · Assign with
deadline · Participants (pseudonymous, with progress and review counts) ·
Release · Identity resolution · Results (maturity levels, recommendations,
safety flags, limitations) · Reviews · Programmes · Reassessment · Progress.

## Participant flows

`/academy` home with purpose and privacy stated on the card **before** starting ·
start · resume · all four supported formats · submit · released development
report · Learning Mode · progress.

## Learning Mode

Runs on **separate learning-mode item versions**. Disjointness is enforced three
ways (mode immutable once set, no form may mix modes, a counterpart must itself
be a learning item) and now a fourth: assessment options may not carry learning
feedback at all.

Feedback is a **separate call**, requiring a learning attempt, a learning item
*and* an existing answer. It explains every option — naming only the preferred
one teaches recognition; explaining the weaker ones teaches judgement.

Completion writes `training_completion` evidence at contribution **0.250**,
confidence **0.500**. Nobody trains their way to a maturity level.

## Scoring and human review

Closed formats score deterministically, server-side. Constructed responses and
anything safety-critical route to a human and are **never** auto-scored — with
the null provider that is the only honest destination, recorded as the new
`no_provider_available` trigger rather than mislabelled "confidence below
threshold" when there was no run to have confidence about.

An attempt reaches `scored` only when no review is outstanding, so a report
cannot be released over an unreviewed answer.

**An employer can never adjudicate its own candidate.** Completing a review
requires the content-review capability. An employer without it sees two integers
— how many responses wait, how many results they block — and none of the
material.

## Evidence and maturity

Evidence is appended against a behaviour version with its source named. Scores
are projections, never stored truths. Reports are **immutable snapshots**, so
recomputation can never retroactively change something already read.

Maturity levels only: `no_evidence` → `limited_evidence` →
`developing_evidence` → `consistent_evidence` → `strong_evidence`. No
percentage, pass/fail, ranking, suitability score or hiring recommendation
exists anywhere in the model — `MaturityRow` has no prop that could accept one.

Safety-critical findings are snapshotted in their own column, so no template can
structurally omit one.

## Reassessment and progress

Reassessment requires a prior **released** result — which both makes the
comparison meaningful and prevents it becoming a way to assign to an arbitrary
subject. Progress reads the immutable snapshots rather than recomputing;
recomputation would make history move whenever evidence changed.

## Test fixture status

Two published fixtures — a four-item delivery fixture (one per format) and a
two-item Learning Mode fixture — marked by
`scp_assessment_definitions.is_test_fixture`. That flag is a **database fact**,
not a naming convention, and every boundary assertion is written against it.

## Real Security Guard content status

**Draft. Unpublished. Unassignable. Not employer-visible as an active product.**

`scp_employer_assign` re-checks assignability in the database, so a crafted
request cannot assign it. It appears in the library honestly marked *In
development / not yet validated*, with no Assign control.

No expert, legal, cognitive, language or accessibility review has been marked
complete. Asserted in-migration and in the suite.

## Security model

- Identity resolution is a scoped `SECURITY DEFINER` RPC, never a view, and
  returns zero rows on any failure so it cannot enumerate.
- Employers cannot read `scp_subject_identities`, raw responses, keys, rubrics,
  anchors or prompts — absent policies, not hidden columns.
- Delivery cannot leak a key **by construction**: the columns are absent from
  the function's return type, asserted against the signature itself.
- Evidence and review history are append-only; snapshots immutable.
- Every attempt and evidence row pins exact content and scoring versions.
- Cross-organisation isolation asserted from the hostile direction.

## Migration order — authoritative manifest

**TEN migrations, not six.** The original plan predated local staging, which
found four further faults. Derived from the branch itself
(`git diff --diff-filter=A main..HEAD -- supabase/migrations`), applied in
filename order. All additive; **none modified**, so there is no checksum hazard.

| # | Migration | Why |
|---|---|---|
| 1 | `20260807090000` …read_models_and_identity_rpc | read models + scoped identity RPC |
| 2 | `20260808090000` …phase2b_fixture_and_delivery | delivery, scoring, review, release |
| 3 | `20260808100000` …phase2c_test_fixture_programme | published delivery fixture |
| 4 | `20260809090000` …phase2e_employer_learning_progress | employer ops, Learning Mode, progress |
| 5 | `20260809100000` …phase2f_learning_fixture | Learning Mode fixture |
| 6 | `20260810090000` …phase2h_staging_corrections | learning-feedback hazard + programme matching |
| 7 | `20260811090000` …phase2i_seed_processing_purpose_version | **without it nothing can be assigned at all** |
| 8 | `20260811100000` …phase2j_assign_token_without_pgcrypto | pgcrypto unreachable under pinned search_path |
| 9 | `20260812090000` …phase2k_partial_bestworst_while_open | best/worst was unanswerable |
| 10 | `20260812100000` …phase2l_submit_requires_every_item | partial run skipped human review |

Reviewer-route and Learning-Mode UI fixes are **code-only** and need no migration.

## ⚠️ Coordinated release required

**The frontend and the database must be released together.** Merging this
branch without applying all ten migrations first breaks the Assessment Center
in production: the UI calls RPCs that would not exist, and even with the schema
present, migration 7 is what makes assignment possible at all.

Order: apply migrations → verify → merge → let Lovable rebuild.

---

## The controlled one-time backfill in `20260810090000`

This is the only place in Phase 2 where a guard is deliberately switched off,
so it is documented in full.

### Why the immutability trigger is temporarily removed

`scp_guard_published_immutable` refuses **any** column change on a version whose
`content_status` is `published`, permitting only lifecycle columns
(`content_status`, `validation_status`, `approved_*`, `published_*`,
`retired_*`, `content_hash`, `updated_at`).

Phase 2h adds `scp_assessment_versions.program_version_id`. Two of the three
versions needing a value are already published fixtures, so the guard refuses
the backfill.

Adding the column to the allowlist was rejected: that would leave a published
version's programme link mutable **forever**, which is a permanent weakening to
solve a one-time problem.

### Exactly which statements run

Between `ALTER TABLE public.scp_assessment_versions DISABLE TRIGGER USER;` and
`ALTER TABLE public.scp_assessment_versions ENABLE TRIGGER USER;`, exactly two
`UPDATE`s run, both setting only `program_version_id`, both guarded by
`AND av.program_version_id IS NULL`:

1. definition slug `sg-operational-baseline` → the
   `security-guard-operational-development` programme version.
2. definition slugs `fixture-delivery-e2e` and `fixture-learning-e2e` → the
   `fixture-learning-programme` version.

Nothing else is inside the window. No content column is written.

The link is set by **naming** the versions, not by inferring it through the
behaviour graph. The first draft inferred it and assertion **J9.11** caught it
linking the fixture to the *real* Security Guard programme — the fixture
deliberately reuses a real behaviour that the real modules also address. That is
the exact ambiguity this column exists to remove.

### Why this is not a content mutation

The column **did not exist** when those versions were published. Nothing a
reviewer approved is being altered; a newly added column is being given its
first value. That is a backfill, and a backfill is the one operation an
immutability guard cannot express — it can only see "a column changed".

`NULL → value` on a column no reviewer ever saw is not the thing the guard
exists to prevent.

### How the trigger is restored, and what proves it

`ENABLE TRIGGER USER` runs immediately after the second `UPDATE`, inside the same
migration and transaction. `program_version_id` is **not** added to the
allowlist, so from this migration onwards a published version's programme link
is frozen like everything else — link it before publishing.

**Proof:** the in-migration `DO` block in Section 3 raises
`SCP_P2H_TRIGGERS_LEFT_DISABLED` unless at least one non-internal trigger on
`scp_assessment_versions` has `tgenabled <> 'D'`. The migration cannot succeed
with the guard left off.

---

## Test results

```
DB suite OK: 162 domain, 131 Career Discovery, 55 v3.1 schema,
             39 v3.1 completion, 25 public flow, 81 personal layer,
             51 Competency Graph, 39 Academy, 55 Phase 1F content,
             18 Phase 2 identity, 85 Phase 2 journey, 30 rollback
```

Full migration replay from a clean database · rollback verification · 16 guard
scripts · `tsc --noEmit` · production build · Swedish/English parity (181 academy
keys, 1809 per language) — **all pass**.

The journey suite runs every assertion as a **real principal** under RLS, and
tests the hostile direction throughout.

## Local staging setup and verification

Verified against a **full local Supabase stack** (Colima + Docker + Supabase
CLI, Postgres 17), never a cloud project. Migrations replayed into an empty
database: **85 applied, 18 documented legacy failures, 0 unexpected.** Three
synthetic accounts (employer owner, participant, reviewer) plus a second
organisation for isolation testing.

**Browser journey: 34/34 pass.** Assign → deliver → resume → all four formats →
submit → human review → release → identity resolution → reports → Learning Mode
→ reassessment → progress.

**Security: 18/18 pass.** Cross-org participants/identity/progress/snapshots all
return zero rows; employers cannot read identities, raw responses, option
scores, rubric levels or prompts; participants cannot read another's attempt or
the item bank. Prohibited operations fail with named errors:
`SCP_ALREADY_RELEASED`, `SCP_NOT_A_REVIEWER`, `SCP_PROGRAMME_NOT_ASSIGNABLE`,
`SCP_RECIPIENT_HAS_NO_ACCOUNT`, `SCP_ATTEMPT_ALREADY_SUBMITTED`. Evidence
deletion refused by the append-only guard.

**Swedish and English:** both complete, zero raw keys, 181 academy keys at
parity. **Mobile 375px:** no horizontal overflow. **Keyboard:** focus ring
confirmed rendering.

## Defects found and fixed during verification

Seven, of which **three made the product non-functional** and none were caught
by 85 passing SQL assertions:

1. **No clean database could assign anything** — the purpose vocabulary was
   seeded but never a purpose *version*.
2. **`gen_random_bytes` unreachable** — pgcrypto is not on the function's
   pinned `search_path`.
3. **Best/worst unanswerable** — the guard demanded both choices per save; a
   person makes them one at a time.
4. **A partial run submitted, scored and skipped human review** — the missing
   answer *removed* the review requirement instead of blocking the result.
5. **Reviewers had no way in** — the queue was gated on employer membership,
   and reviewers are deliberately not members.
6. Learning Mode infinite render loop.
7. `Boolean([])` lockout in Learning Mode.

All seven share one cause: **fixtures did in one step what a person does in
several.** Group J10 now asserts seeded state and builds nothing; J11 answers
incrementally.

## Known limitations

- **Cloud migrations have NOT been applied.** No privileged access to the
  Supabase project exists in this environment — no service-role key, no
  database password, no access token, CLI not logged in. The migration ledger
  cannot be read and no recoverable backup can be created or verified.
- Safety-critical flag display is asserted in SQL but was not exercised
  visually — the fixture contains no safety-critical item.
- Phase 1G's 60 learning-feedback strings were removed from assessment options
  and preserved in `scp_content_events`; reinstating them on the Learning
  counterparts is a content decision.
- Phase 1G's 60 misplaced learning-feedback strings were removed from assessment
  options and preserved in `scp_content_events`. They have **not** been
  reinstated on the Learning counterparts — that is a content decision.
- Progress needs two released results before it displays anything, by design.
- Visual refinement deliberately deferred.

## Rollback

`supabase/tests/scp_a_rollback_test.sql` documents and **verifies** the full
teardown on every CI run (30 assertions). Layer order: Phase 2h → Phase 2e/2f →
Phase 2a/2b → Phase 1 → Phase 0.

Phase 2 layers unpublish fixture content before removing it, because published
content is immutable by design and that friction is the guard working, not an
obstacle to route around. Report snapshots drop with Phase 2 — the evidence they
project from lives in the ledger, which is why they are safe to drop.

The evidence ledger is empty in a fresh database, which is what makes Phase 0
reversible at all.

## Anthropic

**Disabled.** `null_provider` is the only enabled provider, and
`scp_guard_null_provider_cannot_score` means "AI is off" is a database fact
rather than a config convention. Enabling Anthropic is a separate, deliberate
`UPDATE` plus a server-side key — no schema change. Asserted in every Phase 2
migration and in the suite.
