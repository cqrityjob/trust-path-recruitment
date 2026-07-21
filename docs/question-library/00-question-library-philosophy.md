# Document 00 — Question Library Philosophy

**Status:** Foundational for the Question Library document set. Inherits from, and must never contradict, [Assessment DNA v1.0](../assessment-science/00-security-excellence-model.md) (approved, locked). Sits between Assessment DNA and the locked Blueprint Engine architecture.
**Scope:** documentation only — no questions, no SQL, no schema, no weights, no Blueprints.

## 1. Purpose

The Question Library is the **content asset layer** of the platform:
the durable, growing collection of individual assessment items from
which every future Blueprint (recruitment, career, employer, supplier
validation, annual review, leadership, promotion) is composed. It is
not itself an assessment — a Question Library entry has no meaning or
use until a Blueprint selects and composes it (locked architecture:
Module ↔ Question Version, Blueprint Version ↔ Module Version). Its
purpose is to be the single, scientifically governed place where
*content* is created, so that every Blueprint draws from the same
disciplined source rather than each product reinventing its own
question set from scratch.

This is a deliberate contrast with how most assessment content is
built in practice — one instrument at a time, by whoever is building
that instrument, with reuse happening informally if at all. The
Question Library exists specifically so that CQrityjob does not
accumulate dozens of siloed, inconsistent item sets as it expands
across Purposes and professions (Document 06's core objective: the
same content should serve many purposes when scientifically
appropriate, not be rewritten per purpose).

## 2. Scientific role

The Question Library is where Assessment DNA becomes *measurable*. It
does not invent constructs — every item in it exists to produce
evidence for a Competency (Assessment DNA Document 02) and/or
Dimension (Assessment DNA Document 03) that Assessment DNA already
defined. Its scientific responsibility is narrower and more concrete
than Assessment DNA's: not "what should excellence mean" but "given
that Assessment DNA has already answered that, what is the actual,
well-constructed, well-evidenced item that measures it." This is the
same layering relationship as, e.g., a validated psychometric item
bank sitting beneath a construct theory in established assessment
science — the theory does not change item-by-item; the item bank
grows and is refined against a fixed theoretical target.

Concretely, every Question Library entry must be traceable to:

- The **Evidence Framework** method it instantiates (Assessment DNA
  Document 04 — behavioural, situational judgement, dilemma, ranking,
  etc.).
- The **Measurement Framework** format it uses (Assessment DNA
  Document 05 — chosen per the target construct, never a default).
- The **Competency/Dimension** it produces evidence for (Assessment
  DNA Documents 02–03).
- The **Blueprint Principles** it must satisfy in combination with
  other items (Assessment DNA Document 06 — diversity, non-redundancy,
  non-compensatory treatment where relevant).

A Question Library entry that cannot state all four is not ready for
Scientific Review (Document 05).

## 3. Relationship to Assessment DNA

Strictly one-directional: Assessment DNA is upstream and authoritative;
the Question Library is downstream and derivative. The Question
Library:

- **May never introduce a construct Assessment DNA does not already
  define.** If a real authoring need reveals a genuine gap in the
  Competency or Dimension model, the correct action is to propose a
  revision to Assessment DNA itself (through the same rigor Document
  11 of that set describes), not to quietly measure something new
  inside the Question Library.
- **May never contradict an Assessment DNA principle** — e.g. an item
  that defaults to a universal scale would contradict Measurement
  Framework §1; an item that treats a self-report response as
  sufficient evidence for Integrity Orientation would contradict the
  Evidence Framework's explicit caution (Assessment DNA Document 04)
  and the non-compensatory principle (Assessment DNA Document 06 §7).
- **Inherits the AI boundary wholesale** — nothing in AI-assisted
  authoring (Document 09) may compute a score, weight, or decision;
  that boundary is Assessment DNA's, not re-derived here.

## 4. Relationship to the Blueprint Engine

The Blueprint Engine (locked architecture, Phase 1) is the *structural
and security* layer: it defines how Questions, Question Versions,
Modules, and Blueprints are versioned, published, associated, and
protected (immutability, RLS, `SECURITY DEFINER` RPCs). The Question
Library is the *content-governance* layer that sits logically above
that structure and tells it what should go into it and why.
Concretely: the Blueprint Engine already has `questions`,
`question_versions`, `evidence_signals`, and their association tables
(`question_version_evidence_signals`, `question_version_module_versions`)
— real, working infrastructure. This document set does not redesign
any of that. It defines the **content discipline** that should govern
what gets authored into those existing structures: taxonomy (Document
01), evidence design (Document 02), construction principles (Document
03), the full metadata a content author should track conceptually
(Document 04, deliberately not mapped to columns here), and the
lifecycle a piece of content moves through before and after it reaches
those tables (Document 05).

Where this document set names a metadata attribute or lifecycle state
that does not yet have a database home (Document 04 §7 flags these
explicitly), that is a **future schema-alignment consideration for
Phase 2B/3 implementation**, not a redesign proposal — consistent with
the same discipline Assessment DNA itself used when it found schema
gaps.

## 5. Relationship to the Career Intelligence Graph

The Career Intelligence Graph (`cig_*` tables) is the platform's
existing vocabulary for Roles, Environments, Competencies, Skills, and
Knowledge Areas. The Question Library does not duplicate this
vocabulary: a question's Profession/Environment/Competency metadata
(Document 04) references the same graph entities Assessment DNA
Document 02 already grounded itself in, not a parallel taxonomy.
Where the graph does not yet have a needed entity populated (e.g. a
specific Environment), the correct action is content authoring within
the existing graph structure (already anticipated by the locked
architecture's `is_assessable` curation flags), not a new,
Question-Library-specific classification system.

## 6. What "one of the company's core intellectual assets" means in practice

A flat, ungoverned question bank is a liability that grows harder to
trust as it grows larger — duplicated effort, inconsistent quality,
unclear provenance, no defensible way to know which items are still
valid. A disciplined Question Library, by contrast, becomes more
valuable as it grows, because every new item is added against the same
standard and can be combined confidently with every prior item. This
document set exists to make growth an asset rather than a liability —
the concrete argument for why is made in full in the Final Synthesis
(Document 11 §9), after the mechanisms that produce it (Documents
01–10) have been defined.
