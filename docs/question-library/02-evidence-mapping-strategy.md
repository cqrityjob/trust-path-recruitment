# Document 02 — Evidence Mapping Strategy

**Derives from:** [Assessment DNA — Evidence Framework](../assessment-science/04-evidence-framework.md), [Question Taxonomy](./01-question-taxonomy.md).
**Purpose:** how a Question Library item's response should be mapped onto Evidence Signals — the discipline of *what counts as evidence and how good it is*, not how it is scored into a result. Scoring formulas remain out of scope for this entire document set.

## 1. Evidence, restated precisely

An Evidence Signal (locked architecture) is an atomic, named,
weighted, polarity-signed observation a Question Version can produce.
This document governs the *mapping discipline* — which signals a given
item should be authored to produce, and how much confidence that
mapping deserves — not the numeric weight itself (a Phase 2B/Scoring
Profile authoring decision, explicitly out of scope here as
elsewhere in this document set).

## 2. Evidence richness

**Definition:** how much genuinely distinct information a single item
produces — a rich item's response meaningfully constrains more than
one plausible interpretation; a poor item's response is compatible
with many different underlying dispositions.
**Design implication:** richness should be evaluated at authoring time
by asking "if a respondent gives this specific response, what does it
rule out, not just what does it suggest?" An item whose every response
option is compatible with a wide range of underlying trait levels is
low-richness regardless of how sophisticated its scenario reads.
**Relationship to signal count:** a rich item may legitimately produce
more than one Evidence Signal (e.g. a single SJT response can carry
information about both Judgement Under Uncertainty and Risk
Perception) — richness is not the same as complexity; a long,
elaborate scenario that only produces one thin signal is not rich.

## 3. Evidence quality

**Definition:** how reliably a produced signal actually reflects the
target construct, as established per Evidence Framework method
(Assessment DNA Document 04) and Dimension (Assessment DNA Document
03 §4's evidence-quality table).
**Design implication:** every item's quality expectation is set by its
Taxonomy category (Document 01) and target Dimension *before* the item
is written — a Behavioural item targeting D3 (Integrity) starts with a
higher quality expectation than a Self-Rating item targeting the same
Dimension would, independent of how well either is executed. Quality
is therefore partly a property of the *method chosen*, and partly a
property of *execution quality* (Document 03's construction
principles) — both must be tracked, and a well-executed weak-method
item should never be miscategorized as equivalent to a moderately-
executed strong-method item.

## 4. Evidence diversity

**Definition:** the degree to which the Question Library as a whole,
and any given Blueprint's selection from it, draws on genuinely
different evidence methods for the same construct rather than many
superficially different items that are methodologically identical.
**Design implication:** diversity must be tracked at the Question
Library level (are there enough methodologically distinct items
available per Dimension for Blueprint authors to satisfy Assessment
DNA Document 06 §2's diversity principle) and is a library-health
metric, not only a per-Blueprint concern — a library that has 200
Situational Judgement items and zero Behavioural items for D3 cannot
support a diverse Blueprint no matter how large it is.

## 5. Confidence in a signal

**Definition:** distinct from a Confidence Rating item (Document 01
§2.11) — this is the *library's* confidence that a given item-to-
signal mapping is correct, which starts low at authoring time and
should only increase through the lifecycle stages that actually test
it (Document 05: expert review, pilot, psychometric validation).
**Design implication:** a newly authored item's evidence should be
treated as provisional/lower-confidence until it has survived
Scientific and Expert Review; a piloted-but-not-yet-psychometrically-
validated item is higher confidence than a draft but still not
equivalent to a fully validated one. This confidence level is
itself a piece of metadata (Document 04) that downstream consumers
(a future Scoring Profile, an AI explanation) should be able to
account for, rather than treating every published item as equally
trustworthy evidence merely because it reached "published" status.

## 6. Consistency

**Definition:** whether an individual respondent's evidence across
multiple items targeting the same Dimension coheres, versus
contradicts itself in a way that suggests careless responding rather
than genuine trait variation.
**Design implication:** this is the scientific basis for Assessment
DNA's Consistency Check method (Document 04 of that set) operating at
the *response-quality* layer, not the construct layer — a Question
Library entry tagged as (or paired with) a consistency check produces
a data-quality signal, never a Dimension-level Evidence Signal itself.
This distinction must be preserved in the item's metadata so it is
never mistakenly aggregated as construct evidence.

## 7. Repeated evidence

**Definition:** multiple items producing signals for the same
Dimension across a single Blueprint (by design, satisfying Assessment
DNA Document 06 §1's minimum-evidence floor) or across multiple runs
over time (e.g. Annual Competency Review).
**Design implication, within one run:** repeated evidence should be
genuinely independent in method and framing (Document 4 above), not
the same underlying question reworded — near-duplicate items should be
flagged and consolidated, not treated as adding real evidence weight
(directly the redundancy-avoidance principle, Assessment DNA Document
06 §4).
**Design implication, across runs over time:** repeated evidence
across administrations is the raw material for test-retest reliability
analysis (Assessment DNA Document 09 §3) and for detecting genuine
change over time (relevant to Annual Competency Review specifically)
— the Question Library must preserve enough version-level provenance
(Document 04, Document 05) that a later analysis can tell whether an
observed change reflects real change in the person or a change in the
instrument version used.

## 8. Conflicting evidence

**Definition:** where two or more items targeting the same Dimension
produce meaningfully divergent signals for the same respondent within
one run.
**Design implication:** conflicting evidence is itself informative and
must never be silently resolved by an authoring or content decision —
it is a *result-interpretation* concern (how a Scoring Profile or an
AI explanation handles divergent signals) that this document
deliberately leaves to that later, explicitly out-of-scope layer.
What belongs here, at the content layer: an item pair that conflicts
*consistently, across many respondents* is a signal of a construction
problem (poor wording, unintended second construct being measured,
translation drift) rather than genuine trait complexity, and should
trigger Document 05's Revision stage — the Question Library's
responsibility is to flag and investigate a systematic conflict
pattern, not to explain away any single respondent's divergent
answers.

## 9. Summary: what belongs in this document vs. what does not

**Belongs here:** how to judge whether an item is well-mapped to the
evidence it claims to produce, and how much trust that mapping
deserves at a given point in the item's lifecycle.
**Does not belong here (explicitly deferred):** the numeric weight a
signal receives in any Scoring Profile; how conflicting or repeated
evidence is numerically combined into a Dimension result; any
threshold for "how much evidence is enough" beyond what Assessment DNA
Document 06 §1 already states as a minimum floor.
