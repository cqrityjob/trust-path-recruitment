# Document 04 — Question Metadata Model

**Derives from:** all preceding Question Library documents.
**Purpose:** every conceptual attribute a Question Library entry should carry. **This is conceptual only — no schema, no columns, no migrations.** Where an attribute already has a home in the locked architecture, that is noted; where it does not, that is flagged as a future schema-alignment consideration for Phase 2B/3 implementation, not decided here.

## 1. Why metadata is treated as a first-class design object

A Question Library entry's value is not only its content — it is
everything that lets a future author, reviewer, Blueprint designer, or
AI-assisted tool find, trust, and correctly use it. A library of
10,000 excellent items with no reliable metadata is barely more usable
than no library at all. Every attribute below exists to answer a
specific, real question someone will actually ask when the library is
large (Document 11 §9's "why this beats a flat question bank" argument
rests substantially on this document).

## 2. Purpose

**What it answers:** which Assessment Purpose(s) (recruitment, annual
review, supplier audit, etc. — the locked architecture's
`assessment_purposes` concept) this item is appropriate for.
**Why it matters:** the same item may be scientifically appropriate for
several Purposes (Document 00 §1's reusability goal) or may be
Purpose-specific (e.g. an item whose realism depends on an ongoing
employment relationship is not appropriate for a first-touch
Recruitment context).
**Existing schema home:** conceptually aligned with
`assessment_purposes` (Phase 1, already data-driven).

## 3. Competency & Dimension

**What it answers:** which Assessment DNA Competency (Document 02) and
Dimension (Document 03) this item produces evidence for.
**Why it matters:** the single most important piece of metadata — it
is what makes an item traceable to Assessment DNA at all (Document 00
§2 of this set) and what lets a Blueprint author find items that
satisfy Assessment DNA Document 06 §1's minimum-evidence and diversity
requirements.
**Existing schema home:** Competency aligns with `cig_competencies`/
Module↔Competency associations already in the locked architecture;
Dimension does not yet have a populated content home (Assessment DNA
Document 03 §5b flags `cig_assessment_dimensions` as schema-ready but
content-empty) — this metadata attribute is intended to be one of the
inputs that eventually populates it, not something this document
assumes already exists.

## 4. Evidence type

**What it answers:** which Taxonomy category (Document 01) and
Evidence Framework method (Assessment DNA Document 04) this item
instantiates.
**Why it matters:** the basis for Evidence Diversity checks (Document
02 §4) at both the item and library level.
**Existing schema home:** conceptually aligned with
`question_versions.question_type`, though the locked schema's current
type set (`single`/`multi`/`rating`/`scenario`) is coarser than this
document's fourteen-category taxonomy — a genuine gap between the
Question Library's conceptual richness and the current schema's
granularity, flagged here as a future consideration, not resolved.

## 5. Difficulty

**What it answers:** how discriminating the item is expected to be —
does it separate strong from average performers, or floor/ceiling
(nearly everyone answers the same way, providing little information).
**Why it matters:** a Blueprint composed entirely of low-discrimination
items produces a result with poor measurement precision regardless of
item count; difficulty/discrimination estimates become statistically
groundable only once real response data exists (Assessment DNA
Document 09 §3) — pre-data, this attribute is an author's estimate,
explicitly lower-confidence (Document 02 §5) until validated.
**Existing schema home:** none currently; a future consideration.

## 6. Environment & Profession

**What it answers:** which Environment(s) (`cig_work_environments`) and
Role/Profession(s) (`cig_professions`) this item is relevant or
validated for — directly grounded in Document 06 of this set.
**Why it matters:** enables environment/profession-specific Blueprint
composition without requiring separate, duplicated items per context
where the same item genuinely applies across several (Document 06's
overlap analysis).
**Existing schema home:** aligns with the locked architecture's
`cig_professions`/`cig_work_environments` and the `is_assessable`
curation mechanism.

## 7. Role level

**What it answers:** the seniority/authority level an item is
calibrated for (e.g. entry-level operational vs. supervisory vs.
leadership) — distinct from Profession, since the same Profession
spans multiple levels (Document 06's leadership cross-cutting layer,
Assessment DNA Document 07 §14).
**Why it matters:** a G-domain (Leadership) item calibrated for a
first-time supervisor is not interchangeable with one calibrated for a
senior security manager, even though both trace to the same
Competency domain.
**Existing schema home:** conceptually adjacent to
`assessment_levels` (Phase 1, already data-driven: baseline/standard/
advanced), though that attribute currently describes the *Blueprint's*
level, not necessarily an individual item's — a distinction worth
future schema-alignment attention, not resolved here.

## 8. Response format

**What it answers:** which format (Document 07 of this set — Likert,
Binary, Ranking, Forced Choice, Confidence, Frequency, SJT, Ordering,
Multi-select) the item uses, and its scale parameters where
applicable.
**Existing schema home:** `question_versions.scale_min`/`scale_max`/
`options` already store this per-version, exactly matching this
document's per-item (not global) philosophy.

## 9. Language

**What it answers:** which language(s) this item's content exists in,
and — critically — whether a non-primary-language version is an
Approved Translation (professionally translated and back-translated,
Assessment DNA Document 09 §7) or a Draft Translation not yet
validated for that market.
**Why it matters:** without this distinction, a library could silently
present unvalidated translated content as equivalent to validated
original-language content — a genuine scientific integrity risk at
scale (Document 11 §3).
**Existing schema home:** aligns with the existing bilingual-column
convention (`text_sv`/`text_en`) used throughout the platform; the
Approved-vs-Draft translation status is new metadata not yet
represented, flagged for future consideration.

## 10. Version

**What it answers:** which Question Version this metadata describes,
and its relationship to prior/later versions of the same logical
Question.
**Existing schema home:** directly the locked architecture's
`questions`/`question_versions` versioning model — no gap here.

## 11. Author

**What it answers:** who authored the item — a specific person
(and, where applicable per Document 09 of this set, whether and how AI
assisted) — for accountability and for routing review/revision
questions.
**Why it matters:** review workflows (Document 05) need to know who to
route feedback to; AI-assistance provenance (Document 09) needs to be
recorded, not inferred after the fact.
**Existing schema home:** conceptually adjacent to the audit-event
pattern already used for content actions (`question_content_events`),
which records actor and action per event — author-of-record as a
queryable item-level attribute (not just an event log) is a future
consideration.

## 12. Review status

**What it answers:** where the item currently sits in the Lifecycle
(Document 05) — Draft, Scientific Review, Expert Review, Pilot,
Psychometric Validation, Production, Monitoring, Revision, Retired.
**Existing schema home:** the locked architecture's `content_status`
(`draft`/`published`/`archived`) is coarser than this document's
nine-stage lifecycle — a deliberate, acknowledged gap (§14 below).

## 13. Scientific references

**What it answers:** which Assessment DNA sections (and, where
relevant, which external research basis cited there) justify this
item's target construct and method choice.
**Why it matters:** the direct, checkable link between a specific item
and Assessment DNA Document 02/03/04's reasoning — without this, an
item's justification lives only in an author's memory, not in the
library.
**Existing schema home:** none; a future consideration, likely best
represented as structured free text or a reference-tag list rather
than a rigid field.

## 14. Retirement status

**What it answers:** whether an item is active, retired-but-preserved
(for historical reproducibility, per the locked architecture's
`archived` status and Assessment DNA Document 06 §9), and — distinct
from simple retirement — the *reason* (validity failure, content
staleness per Document 01 §2.9's Knowledge Verification concern,
superseded by a better item, market/language withdrawal).
**Why it matters:** an item retired for "no longer scientifically
supported" is a materially different signal to future authors than one
retired for "regulation changed" — collapsing both into a single
`archived` flag loses information the Governance Model (Final
Synthesis, Document 11 §4) needs.
**Existing schema home:** `content_status = 'archived'` exists; the
reason taxonomy does not yet — future consideration.

## 15. Summary — the review-status/lifecycle gap, stated plainly

The most significant gap between this metadata model and the current
schema is §12: the locked architecture's three-state `content_status`
(`draft`/`published`/`archived`) is intentionally coarse — appropriate
for enforcing the immutability and RLS guarantees that are the
Blueprint Engine's job, but too coarse to represent the nine-stage
scientific lifecycle this document set requires (Document 05). This
document does not propose a schema change to close that gap — it
states the gap precisely so that a future Phase 2B/3 implementation
decision (a richer status field, a separate lifecycle-tracking
mechanism layered on top of `content_status`, or another approach) can
be made deliberately, against a clear specification, rather than
discovered ad hoc during content authoring.
