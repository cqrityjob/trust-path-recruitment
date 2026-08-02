# Pre-Phase 2 Architecture Audit

**Reviewer position:** Chief Product Architect, reviewing as the person who will maintain
this codebase for ten years.

**Verdict up front: the foundation is correct. Two things must change before Phase 2, and
both are cheap now and expensive later. Everything else I would leave alone.**

I went looking for problems and found two real ones. I am not going to manufacture a third
to make this document look thorough.

---

## The two Critical findings

### C1 — `source_ref` is nullable, and the maturity computation silently collapses NULLs

**What.** `scp_competency_evidence.source_ref` is nullable. `scp_compute_maturity()`
deduplicates with:

```sql
SELECT DISTINCT ON (source_type, source_ref, behaviour_version_id) *
```

Postgres treats NULLs as **equal** in `DISTINCT ON`. So every evidence row with a NULL
`source_ref`, for the same source type and behaviour, collapses to **one** observation.

**Why it matters.** The dedup exists for a good reason — an AI run and the human review
that corrected it must not count twice. But it means a future writer that omits
`source_ref` produces evidence that silently stops counting. Ten manager observations of
the same behaviour would register as one, and the person would sit at
`limited_evidence` forever with no error anywhere.

`assessment_response` evidence always has a response id, so the MVP is safe. The reserved
source types — `manager_observation`, `training_completion`, `practical_exercise` — are
exactly the ones most likely to be written without a natural row to point at.

**Risk if ignored.** Silent under-counting in the one function every projection, report,
dashboard and future agent reads through. It produces no error, so it would be found by a
customer noticing their maturity never moves.

**Cost to change later.** High and irreversible in character. Once real evidence exists you
cannot retroactively invent the identity you failed to record — you would have to either
discard historical rows or accept a permanently ambiguous ledger.

**Fix.** Make `source_ref` `NOT NULL` and require writers to supply a stable identity for
the observation. For sources with no natural row, that is a generated uuid per
observation — which is exactly right, because it *is* a distinct observation.

**Affects existing migrations:** no — an additive `ALTER` in a new migration, and the
ledger is still empty.
**Affects production safety:** no — nothing is deployed.

---

### C2 — the Academy has no assignment path that does not pollute the legacy catalogue

**What.** `scp_attempts.assignment_id` references `assessment_assignments`, and that table
carries:

```sql
assessment_id TEXT NOT NULL REFERENCES public.assessments(id)
assessment_version_id UUID NOT NULL REFERENCES public.assessment_versions(id)
```

Both point at the **legacy** catalogue — the one whose only employer-visible row was
deliberately retired on 2026-07-28. The Academy's content lives in
`scp_assessment_definitions` / `scp_assessment_versions`, which are different tables
entirely.

So today an employer cannot assign the Security Guard programme without first creating a
row in the legacy `assessments` table. That would re-entangle the new product with the one
we retired for being the wrong product.

**Why it matters.** Phase 2 is precisely the phase that builds the employer assignment
flow. Whatever it builds on becomes the assignment model, and it will have production rows
within weeks of launch.

**Risk if ignored.** Phase 2 does the natural thing — inserts a shim row into the legacy
catalogue for the Academy programme — and the retirement we performed becomes a fiction.
Every later question about "which product does this assignment belong to" has an ambiguous
answer.

**Cost to change later.** Very high. Migrating live assignments between models means
touching rows that participants have open links to.

**Fix — the smallest one.** Add a nullable `scp_assessment_version_id` to
`assessment_assignments`, relax the two legacy columns to nullable, and add a CHECK that
exactly one of the two lineages is populated. One table, one constraint, no new assignment
model, and the existing lifecycle functions keep working unchanged.

I deliberately do **not** recommend a separate `scp_assignments` table. It would duplicate
ten working server functions and a token-based recipient flow that is already proven.

**Affects existing migrations:** no — additive.
**Affects production safety:** no, but it is the last cheap moment.

---

## Recommended

### R1 — pseudonymisation does not anonymise free text

The erasure model (delete the `scp_subject_identities` row, keep the evidence) is correct
for the ledger, because the ledger carries no free text. It is **not** sufficient for
`scp_candidate_responses.response_text`, where a participant may write *"jag och Anna på
Kista-objektet"*. Unlinking the subject leaves self-identifying prose attached to a
pseudonymous key.

`scp_candidate_responses` is deliberately not append-only guarded, so redaction is already
possible. What is missing is the **statement** that erasure means unlink *plus* redact.
Make it an explicit, tested step rather than something the first DPA request discovers.

*Cost later: moderate. Affects migrations: no — a server function and a test.*

### R2 — retire `scp_item_versions.competency_id`

Two sources of truth held in agreement by a trigger is a correct *interim* answer, not a
correct permanent one. Once Phase 2 confirms nothing reads `competency_id` directly, drop
it and let the behaviour be the only path. Leaving it forever means every future author has
to be told why both exist.

*Cost later: low — it gets slightly worse each year, never suddenly expensive.*

### R3 — authoring scope is flat

`scp_can_author()` is global: any author can edit any content. Fine for a content team of
three; wrong for a platform that will use external SMEs, translators and legal reviewers
across many programmes. This is inherited from PR-A, not introduced here.

*Cost later: moderate — it touches every authoring policy, but the policies are uniform and
generated in a loop, so it is mechanical.*

---

## Future consideration

**F1 — the maturity projection will not scale, and that is fine.**
`scp_rm_competency_profile` calls `scp_compute_maturity()` per row inside a `GROUP BY`.
At 100M evidence rows this is unusable. It does **not** need fixing now, and this is the
architecture working as designed: consumers bind to `scp_rm_*`, so the view can be replaced
by a materialised, incrementally-refreshed projection without a single consumer changing.
The expensive thing — the ledger's shape — is already right. Revisit at roughly 1,000
employers.

**F2 — "Assessment Center" will become a misnomer.** The graph is the product; assessment
is one input. In ten years, training, manager observation and certification will feed more
evidence than assessments do. Renaming a navigation module later is cheap; renaming it now
would cost churn across routes, i18n and docs for no functional gain.

**F3 — employer-authored content has no home.** Correct for the MVP, which forbids it. When
it arrives, it needs a tenant-scoped content family rather than a column on the global
tables — but designing that now would be speculative.

---

## Reject — these are already correct, leave them alone

**The Competency Graph as system of record.** Right call, and the single most important
decision in the build. Role → Competency → Behaviour → Item, with evidence recorded against
a *behaviour version*, is what lets a training completion in 2029 land in the same profile
as an assessment from 2026 without a migration.

**Assessment Center as owner of competence evidence.** Correct. Nothing belongs elsewhere.
Personnel, Training, Analytics and Command Center consuming `scp_rm_*` projections is the
right coupling — read-only, versioned, and structurally unable to reach an item.

**Could the graph support every security profession without redesign?** Yes. `scp_roles`
is generic, links optionally to `scp_professions`, and role-specific vocabulary attaches as
behaviours on a stable competency spine. Modelling the eight Security Guard dimensions as
behaviours rather than new competencies was the decision that makes this true. An
ordningsvakt or skyddsvakt programme needs rows, not schema.

**The append-only ledger with supersession.** Sufficient. Security Passport needs a
projection filtered on `disclosure_class`, which exists. Workforce Intelligence needs
aggregation over the same rows. Neither needs a schema change — which was the whole point
of recording `disclosure_class` at write time.

**Learning / Assessment separation.** Strong enough. Three independent mechanisms: mode is
immutable once set, forms cannot mix modes, and a counterpart must itself be a learning
item. Answer leakage would require an authoring mistake that three guards refuse. Adaptive
assessment fits naturally — item selection is a form-assembly concern, and forms already
pin exactly what was served.

**Provider abstraction.** Correct, and better than I expected on review: the null provider
cannot record anything but `skipped_no_provider`, so "AI is off" is a database fact rather
than a config convention. Enabling Anthropic is an `UPDATE` plus a server-side key.

**Prompt and rubric versioning.** Sufficient. Every run pins model, prompt, rubric and
timestamp, and runs are append-only. If a provider is later found to have been compromised,
you can identify every affected run and supersede exactly that evidence. That is the
property that matters and it is present.

**Human review.** Future-proof. All eight triggers modelled, completed reviews immutable,
and `provenance_type` ranking means a human decision outranks an AI one for the same
response — without deleting the AI run.

**Security posture.** Malicious employer: no read policy reaches identities, attempts,
responses, keys, rubrics or prompts. Malicious participant: responses are typed, shape-
checked and labelled untrusted. Malicious insider: evidence and reviews are append-only and
provenance-stamped. Prompt injection: the envelope is versioned per prompt. The one honest
caveat is that `input_envelope_strategy` is currently a *label* — the enforcement lives in
Phase 4 application code that does not exist yet. The database records the intent; it
cannot enforce it.

**No biometric proctoring.** Correct and worth keeping as a stated product boundary, not
just an omission.

---

## Can the foundation carry all four products?

| Product | Verdict |
|---|---|
| Career Platform | Yes — structurally separated by the family guard, tested from the hostile direction |
| Security Competence Platform | Yes — this is it |
| Security Passport | Yes, via a projection on `disclosure_class`. No ledger change |
| Security Intelligence Platform | Yes, via aggregation. Needs F1's materialised projection at scale, not a redesign |

---

## What I would do

Fix **C1** and **C2** in one small additive migration before Phase 2 starts. Both are
free today and neither is free after launch.

Then build Phase 2.

I would not change anything else. The parts I was most prepared to find wrong — the
evidence grain, the mode separation, the provider abstraction — are right, and I would
rather say so plainly than pad this document.
