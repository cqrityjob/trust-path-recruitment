# Document 05 — Question Lifecycle

**Derives from:** [Question Construction Principles](./03-question-construction-principles.md), [Question Metadata Model §12](./04-question-metadata-model.md), [Assessment DNA — Reliability & Validity Strategy](../assessment-science/09-reliability-validity-strategy.md).
**Purpose:** the nine-stage path every Question Library item moves through, and the gate criteria between stages. Conceptual — maps loosely onto, but is more granular than, the locked architecture's `draft`/`published`/`archived` `content_status` (Document 04 §15).

## Stage 1 — Draft

**Entry:** an author (human, or AI-assisted per Document 09) proposes
new item content.
**Requirements to progress:** complete Metadata Model attributes
(Document 04 §2–9 at minimum: Purpose, Competency, Dimension, Evidence
type, Environment/Profession, Response format); self-checked against
all ten Construction Principles (Document 03).
**Gate to next stage:** author confirms the item satisfies Document 03
§10's checklist. This is a self-check, not yet an independent review.

## Stage 2 — Scientific Review

**Purpose:** verify the item's claimed Competency/Dimension mapping
and Evidence Framework method choice are actually correct and
consistent with Assessment DNA — a check against the *science*, not
the writing quality.
**Reviewer:** someone (or, per Document 09, an AI-assisted process
supporting a human reviewer) with working knowledge of Assessment DNA
Documents 02–05, checking the item against Document 02 (Evidence
Mapping) of this set specifically.
**Requirements to progress:** confirmed traceability to a real
Competency/Dimension; confirmed the Evidence method and Response
format (Document 07) are appropriate for that target, not merely
plausible.
**Gate to next stage:** if the item measures something Assessment DNA
does not define, or misapplies a method (e.g. self-rating proposed for
D3), it returns to Draft with specific feedback — it does not silently
proceed with a "close enough" mapping.

## Stage 3 — Expert Review

**Purpose:** subject-matter-expert review for realism, security
relevance, and — for keyed items (SJT, Ranking, Forced Choice,
Ethical Dilemmas) — the actual effectiveness/priority key itself.
**Reviewer:** a genuine domain expert in the item's target Profession/
Environment (Document 06), not the item's own author.
**Requirements to progress:** expert confirms realism (Document 03
§2) and security relevance (§3); for keyed items, expert-derived
ranking/key is recorded and, where multiple experts are available,
inter-expert agreement is checked (a lightweight precursor to the
full inter-rater reliability work of Assessment DNA Document 09 §3).
**Gate to next stage:** an item whose expert-derived key cannot
achieve reasonable agreement across reviewers is returned to Draft —
this is the practical enforcement of Document 03 §7's Ambiguity
Avoidance principle.

## Stage 4 — Pilot

**Purpose:** administer the item to a limited, real (or realistic)
respondent group before any production use, to observe actual
response behavior — the first point in the lifecycle where the item
meets real respondents.
**Requirements to progress:** pilot administration completed with a
sample sufficient to observe basic response-distribution sanity (not
yet full statistical validation — that is Stage 5); face-validity
feedback collected from pilot respondents where feasible (Assessment
DNA Document 11 §7's face-validity pilot recommendation, applied at
the individual-item level here).
**Gate to next stage:** items showing obviously broken response
patterns (everyone selects the same option, response times suggest
the item cannot be understood, respondent feedback indicates
confusion or distress) return to Draft or are discarded — they do not
proceed to statistical validation on the assumption that more data
will fix a construction problem.

## Stage 5 — Psychometric Validation

**Purpose:** the statistical checks from Assessment DNA Document 09
§2–3 applied at the item level once sufficient pilot/early-production
data exists: item-level contribution to internal consistency for its
target Dimension, preliminary bias/differential-item-functioning
screening where subgroup samples allow, difficulty/discrimination
estimation (Document 04 §5).
**Requirements to progress:** item meets the reliability and bias
thresholds the platform's standing psychometric practice defines
(Assessment DNA Document 09 §8) — thresholds themselves are a
statistical/governance decision made under that document's ongoing
practice, not fixed here.
**Gate to next stage:** an item that fails these checks returns to
Revision (Stage 8) with the specific statistical finding attached, or
is retired if the finding indicates a fundamental construction problem
rather than a fixable one.

## Stage 6 — Production

**Purpose:** the item is published (locked architecture:
`content_status = 'published'`) and available for Blueprint composition.
**Requirements to enter:** completion of Stages 1–5 in full — no stage
may be skipped for expedience, including under delivery pressure; a
Blueprint's scientific defensibility is only as strong as its weakest
included item's lifecycle completion.
**What changes at this stage:** the item becomes immutable per the
locked architecture's versioning guarantee — any future change is a
new Question Version, re-entering this lifecycle from Stage 1 for that
version, never an edit to the published one.

## Stage 7 — Monitoring

**Purpose:** ongoing surveillance of a production item's real-world
performance — the operationalization of Assessment DNA Document 09
§8's "ongoing" validation phase at the item level.
**What is monitored:** continued internal-consistency contribution as
more data accumulates; continued absence of adverse impact (Assessment
DNA Document 09 §6); for Knowledge Verification items specifically
(Document 01 §2.9), continued factual/regulatory currency; general
response-pattern drift over time (e.g. an item becoming "known" and
losing discriminating power, the coachability risk Assessment DNA
Document 04 flags for SJT content).
**Trigger to leave this stage:** any monitoring finding that suggests
the item no longer meets its original validation bar routes to
Revision, not silent tolerance — production status is not a permanent
exemption from ongoing scrutiny.

## Stage 8 — Revision

**Purpose:** address an identified problem (statistical, factual,
realism-drift, or bias finding) in a controlled way.
**Mechanism:** because published content is immutable, Revision always
produces a **new Question Version** of the same logical Question, re-
entering the lifecycle at whichever stage is appropriate to the scope
of the change (a wording fix might re-enter at Scientific/Expert
Review; a fundamental construct problem re-enters at Draft). The
prior version is not deleted — it moves toward Retirement (Stage 9)
once the new version reaches Production, preserving the historical
record (Assessment DNA Document 06 §9) for any run that already used
it.
**Gate:** a revised item must independently satisfy every gate its
severity level requires — revision is not a shortcut around the
lifecycle, only a re-entry into it at an appropriately scoped point.

## Stage 9 — Retirement

**Purpose:** permanently remove an item from future selection while
preserving its historical record (locked architecture: `archived`
status; never deletion, consistent with Assessment DNA Document 06 §9
and the platform-wide `ON DELETE RESTRICT` posture).
**Reasons for retirement** (recorded per Document 04 §14's reason
taxonomy): validity failure (Stage 5/7 finding that revision cannot
fix); content staleness (regulation/procedure changed, Document 01
§2.9); superseded by a materially better item covering the same
Competency/Dimension; market/language withdrawal (a translation that
never achieved Approved status, Document 04 §9, and is withdrawn
rather than left in limbo).
**What retirement does not do:** it does not affect any historical
Assessment Run that already used the item — reproducibility (Assessment
DNA Document 06 §8) is preserved exactly as the locked architecture
already guarantees for any published, referenced version.

## Summary flow

```
Draft → Scientific Review → Expert Review → Pilot → Psychometric Validation → Production → Monitoring
                                                                                    ↓              ↑
                                                                                Revision ──────────┘
                                                                                    ↓
                                                                               Retirement
```

Any stage may route back to Draft or directly to Retirement on
failure; the forward path is never assumed, only earned.
