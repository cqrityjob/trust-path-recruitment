# ADR: Security Competency is a separate product from Career Guidance

**Status:** Accepted
**Date:** 2026-07-27
**Normative source:** *CQrityjob Security Competency Core Specification v2.0*, chapters 2, 2.2, 13.1–13.3
**Supersedes for this domain:** the "one catalog, many definitions" framing in [`assessment-catalog.md`](./assessment-catalog.md), which remains accurate for the legacy `assessments` catalogue but is not how Security Competency is built.

## Context

The catalogue entry `security-guard-foundation` was registered as a professional, employer-assignable assessment named "Väktare / Ordningsvakt (grundbedömning)". A content and lineage audit established that its sixteen questions, every answer option and every scoring weight were the same in-memory objects as the public Career Guidance assessment, reused by reference through `legacyQuestion()` / `legacyMapping()`. No question had been authored for either role. The role names appeared in exactly one place: the catalogue row's display name.

That is a career-guidance instrument presented as occupational competence measurement. It had one already-completed employer assignment in the live environment.

A decision was needed on how to build the real product without repeating the mistake and without disturbing anything already in production.

## Decision

1. **Career Guidance and Security Competency are two separate products** with separate assessment families, separate identifiers, separate content, separate scoring and separate reports.

2. **No Career Guidance content may be reused.** Not item IDs, item objects, options, mappings, scoring keys, dimensions, forms or report language. Career Guidance's fourteen dimensions and nineteen competencies are *not* Security Competency constructs; the twelve SCC constructs are authored independently.

3. **The separation is enforced, not merely intended.** Three mechanisms, all of which fail closed:
   - A database trigger rejects any Security Competency definition attached to the `career-guidance` family.
   - `scripts/security-competency-separation-check.ts` fails CI if any Security Competency module imports a Career Guidance module, if any Career Guidance identifier appears in the Security Competency schema, or if any SCC construct collides with a Career Guidance dimension or competency slug.
   - No `scp_` table carries a foreign key into a Career Guidance content table or into the legacy `assessments` catalogue.

4. **Published content is immutable.** A published assessment version, item version, bundle version or role-weight profile cannot be edited in place — through the UI, the API, a service-role client or direct SQL. The guard is a `BEFORE UPDATE` trigger, so it applies to every caller. Any change requires a new version. Lifecycle columns (status, approval, publication, retirement, content hash) stay writable so legitimate transitions still work.

5. **`security-guard-foundation` is retired, never mutated or deleted.** Its questions, scoring, historical attempts and historical reports are preserved exactly and remain reproducible. `retired_at` and `retired_reason` are stamped, it is removed from the employer catalogue, and a `BEFORE INSERT` trigger blocks *new* assignments with the stable code `ASSESSMENT_RETIRED`. Existing rows are never evaluated by that trigger, so historical data is structurally untouched. Historical results are not migrated into the new product and historical reports are not recalculated.

6. **Core and Profession Modules are version-linked, never merged.** A bundle version pins a Core assessment version, a module assessment version, both forms, a scoring version, a report version and a disclaimer version. The candidate may experience one journey; Core and module scores are calculated, stored and reported separately.

7. **Assessment output is decision support only.** No pass/fail, no suitability classification, no ranking, no hiring recommendation, and no automatic write path from a score to a candidate's application status. A human makes and documents the decision.

8. **Publication requires two people.** An assessment editor cannot create, approve and publish the same content alone. Approval is recorded as a separate row by a reviewer who is not the publisher.

## Considered and rejected: extend the H4.1 Blueprint Engine

The Blueprint Engine already provides versioned questions and modules with a draft → published → archived lifecycle and content-event auditing, and it was the obvious candidate. It was rejected for three reasons:

- Its competency layer is `cig_competencies` — the Career Intelligence Graph taxonomy, i.e. Career Guidance lineage. Building the Security Competency constructs on it would reproduce exactly the coupling this ADR exists to prevent.
- Its composition model is Purpose × Role × Environment × Level, not Core version + Profession Module version with separately stored scores.
- It has no item format, no per-option scoring key with rationale, no language adaptation objects, no validation status, no content hash, no SME/bias/legal review evidence and no two-person publication principle — the majority of what the specification requires.

Its *conventions* are reused throughout (versioned tables, content-event auditing, `SECURITY DEFINER` RPCs, RLS naming). Its tables are untouched and it remains parked exactly as it was.

## Consequences

**Positive.** The mistake that produced `security-guard-foundation` cannot recur silently: reusing Career Guidance content now fails CI and, at the database level, is impossible for the family link. Historical data is provably safe — the retirement guard is INSERT-only and the test suite asserts that a historical completed assignment still reads back with its original score. Scoring keys are unreachable by candidate and employer accounts by table design rather than by query discipline. New professions are additive: a row, a definition, a version, a form, a bundle.

**Negative / accepted.** Two parallel assessment schemas now exist (legacy `assessments` + `scp_*`), and the Blueprint Engine is a third, parked one. This is accepted deliberately: converging them would require touching live Career Guidance data, which is explicitly out of scope. The `scp_` prefix is slightly more verbose than the specification's generic names; the mapping is documented in the platform overview. Content authoring is now genuinely gated — nothing can be published quickly, by one person, which is the intended cost.

**Revisit triggers.** If the legacy `assessments` catalogue is ever fully retired, the `scp_` prefix could be reconsidered. If a psychometric specialist establishes that a Career Guidance construct and an SCC construct are genuinely the same measured thing, that is a documented owner + specialist decision, not a code change made in passing.
