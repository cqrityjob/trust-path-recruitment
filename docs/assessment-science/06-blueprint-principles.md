# Document 06 — Blueprint Principles

**Derives from:** [Document 00](./00-security-excellence-model.md), [Document 02](./02-competency-framework.md), [Document 04](./04-evidence-framework.md), [Document 05](./05-measurement-framework.md).
**Scope note:** permanent construction rules for every future Blueprint, regardless of Purpose (recruitment, annual review, supplier audit, etc.) or Environment.

## 1. Minimum evidence per competency/dimension

No competency or foundational dimension may be reported in a Standard
Competency Result on the strength of a single question. Minimum:

- **Foundational dimensions (D1–D6):** at least two evidence items,
  drawn from at least two methodologically distinct evidence classes
  (Document 04) — e.g. not two self-rating items, one self-rating and
  one situational-judgement item.
- **Advanced dimensions (D7–D12), when included in a Blueprint:** at
  least two evidence items as well; a Blueprint is not required to
  include every advanced dimension (Document 07 governs relevance per
  environment), but whichever it includes must meet this floor.
- **Competencies flagged as non-compensatory (§7 below):** at least
  one item drawn from the strongest available evidence class for that
  competency's underlying dimension, per the Document 03 §4 evidence
  table — self-rating alone is never sufficient for a non-compensatory
  competency.

This is a direct application of Document 04 §3's triangulation
principle: a single item's method-specific weakness becomes the whole
result's weakness if it is the only evidence.

## 2. Evidence diversity

Within a Blueprint, evidence methods (Document 04) should be
distributed across the item set, not concentrated in one method
class purely because it is fastest to author. A Blueprint that is 90%
self-rating items is a content-authoring shortcut, not a defensible
instrument, regardless of its length. Reviewers (human, and later
AI-assisted per Document 08) should be able to check the method
distribution of a draft Blueprint Version against this principle
before publication.

## 3. Competency and dimension coverage

A Blueprint's Module selection should be traceable to a stated
coverage rationale: which competencies (Document 02) and dimensions
(Document 03) it is designed to evidence, and why those were selected
for its Purpose/Role/Environment (Document 07 supplies the reasoning;
this principle requires that reasoning be recorded, not skipped).
Coverage does not mean "every competency in every Blueprint" — it
means the *selected* subset is a deliberate, stated choice, not an
accidental byproduct of which Modules happened to exist first.

## 4. Redundancy avoidance

Two items that produce highly correlated evidence (same method, same
dimension, same essential scenario reframed) add respondent burden
without adding measurement information — this is a real cost, not a
neutral "extra data point." Consistency checks (Document 04) are the
deliberate exception: they are *intentionally* correlated with another
item, but for the purpose of detecting response-quality issues, not
for additional dimension evidence, and should be recognized and
budgeted as such rather than miscounted toward diversity/coverage
targets.

## 5. Balancing assessment length

Length is a direct trade-off against completion quality: longer
assessments show declining response quality in the later portions
(fatigue effects, well documented in survey-methodology research) and
declining completion rates. The right length is the shortest Blueprint
that satisfies §1's minimum-evidence floor for its stated coverage
(§3) — length is a consequence of rigor requirements, not a target set
independently of them. A Blueprint that is long because it duplicates
evidence (violating §4) is worse, not more thorough, than a shorter
one that meets the floor efficiently.

## 6. Reliability principles

- **Internal consistency** (do items intended to measure the same
  dimension actually correlate with each other) must be checked once
  real response data exists (Document 09) — a Blueprint is a
  hypothesis about which items cohere until that data confirms it.
- **Test-retest stability** is expected to differ by dimension:
  foundational trait-like dimensions (D3, D4, D5) should show high
  retest stability over short intervals; state-dependent or
  experience-updated dimensions (D2, D8, D11) are expected to shift
  legitimately as a person gains experience — a Blueprint's retest
  expectations should be set per dimension, not assumed uniform
  (Document 09 detail).
- **Versioned, immutable content is a reliability precondition, not
  just an engineering nicety** — the locked architecture's requirement
  that published Question/Module/Blueprint/Scoring Profile Versions be
  immutable exists precisely so that reliability and validity
  statistics computed against one version remain meaningful; silently
  editing published content would invalidate any reliability estimate
  computed before the edit.

## 7. Validity principles

- **Content validity**: every item must trace to a specific competency/
  dimension via a stated rationale (§3), not be included because it
  "seems relevant."
- **Construct validity**: an item should be checked against the
  possibility that it is actually measuring something other than its
  intended dimension (e.g. a poorly worded D9 risk-perception item
  that actually measures reading comprehension) — a Phase 2B/ongoing
  content-review discipline, formalized fully in Document 09.
- **Non-compensatory competencies**: per Document 00 §2's minimum-
  acceptable-competence floor, certain competencies (centrally, C1
  Rule Adherence When Unobserved, C2 Honesty in Reporting) must never
  be averaged away by strong performance elsewhere. A Blueprint
  Principle, not a scoring-formula detail (which remains out of scope
  here): any future Scoring Profile design must preserve the ability
  to report these separately and non-compensatorily, rather than
  folding them into one weighted total where a high score elsewhere
  could mask a low score here. This is a direct, permanent constraint
  on how Document 03's dimensions may ever be combined, not merely a
  preference.

## 8. Reproducibility

A Blueprint Version's results must remain exactly reproducible from
its own pinned Question/Module/Scoring-Profile versions indefinitely
— already a locked architectural guarantee (immutability + version
pinning at run-start, plus label-snapshotting for display wording).
This document's addition is the *scientific* reason it matters beyond
data integrity: without reproducibility, no reliability or validity
statistic computed today remains meaningful tomorrow, and no
before/after comparison (e.g. an Annual Competency Review measuring
change) is trustworthy.

## 9. Versioning principles

- **A new version, never a silent edit**, for any change that could
  plausibly alter a respondent's answer or a scoring outcome — wording,
  scale, option set, weight, or coverage.
- **Version history is scientific record**, not just change-tracking —
  it is what makes it possible to know, years later, exactly what
  instrument produced a given historical result.
- **Retirement over deletion**: content that validity evidence no
  longer supports (Document 09) should be archived, not deleted,
  preserving the historical record while removing it from future use
  — matching the locked architecture's `archived` status convention
  exactly.

## 10. Transparency and explainability

- Every published Blueprint Version should have a stated coverage
  rationale (§3) available to reviewers, and, per Document 01 §6, a
  candidate-facing explanation of what is being assessed and why must
  be derivable from the same rationale — transparency is not an
  add-on written separately from the scientific design, it is a direct
  output of having done §3 properly.
- Explainability at the *result* level (why did this person receive
  this result) is the subject of Document 08's AI-explanation
  strategy; this principle is the precondition for that layer to have
  something honest to explain — an opaque Blueprint cannot produce an
  honest explanation downstream, no matter how good the AI layer is.

## 11. Summary checklist for any new Blueprint Version before publication

- [ ] Every foundational dimension included has ≥2 items from ≥2 evidence classes (§1).
- [ ] Non-compensatory competencies (§7) are evidenced by the strongest available method, not self-rating alone.
- [ ] Method distribution is diverse, not concentrated (§2).
- [ ] Coverage rationale is stated and traces to Document 07 reasoning (§3).
- [ ] No unbudgeted redundancy beyond deliberate consistency checks (§4).
- [ ] Length is the minimum that satisfies the above, not a separately chosen target (§5).
- [ ] Non-compensatory competencies remain separately reportable, not averaged away (§7).
- [ ] A candidate-facing rationale can be derived from the Blueprint's own coverage statement (§10).
