# TRUST strategic level (Säkerhetschef): content approval and activation

**Date:** 2026-09-26. **Status:** the content exists as a governed DRAFT
(`supabase/migrations/20261216090000_scp_security_manager_recruitment_content.sql`,
hosted state `pending`) and is **activated at parity with the operational
level** by `20261217090000_scp_security_manager_recruitment_activation.sql`
(hosted state `pending`): designated as standard recruitment content and its
guide opened for pilot, the same two acts the Väktare content received in
20260905090000 and 20260925090000. That follows the owner update of
2026-09-26 that both levels must be usable at launch and that a visible but
unsendable option does not meet the requirement. It is **not** a content
approval: every review gate stays outstanding, the test runs and reports as a
closed test ("pilotversion"), and the product never calls it validated. One
owner decision is requested: the combined content approval below. The
activation can be reversed at any time by the documented rollback.

## What the owner asked for, and what exists

Owner update 2026-09-26: both assessment levels must be available at launch,
the strategic level must not be a visible-but-disabled choice or the
operational test renamed, and missing content must be handled concretely:
searched for first, then produced as a coherent review proposal marked as a
draft, with a combined content approval requested before activation.

No decided strategic content existed anywhere (repository, hosted database,
documentation): the owner's specification of 2026-09-19 (§3.1) lists what
the level must contain and calls its six competency areas *proposals to try
in the review, not decisions*. The migration above authors every part of
that list, in the same governed model the operational level uses:

| Part (spec §3.1) | What exists now | Status |
|---|---|---|
| 1. Kravprofil | profession `security-manager-se`, role v1, six observable behaviours mapped to SCC-11/09/04/08/01/06 | draft |
| 2. Intervjuguide | role interview pack `security-manager-se` v1: 6 competencies, 8 fixed questions, 48 approved probes, 40 evidence dimensions, 40 anchors, 5 verification rules, 14 prohibited areas, content hash stamped | draft, pilot_hypothesis, **restricted** |
| 3. Kandidatmoment | assessment `security-manager-recruitment` v1, form A: 37 items in 5 sections (18 scenario + 3 written reflection observed; 16 self-reported), 3 rubrics | draft/design, all 5 review gates outstanding on every item, **not designated** |
| 4. Rapportavsnitt | the evidence report reads this content by competency; 8 leadership-phrased self-report interview prompts added for the facets it describes | published prompts (AI-authored, unreviewed) |
| 5. Granskning | 185 outstanding review-gate rows; pack at the bottom of the draft → expert → legal → cognitive → published ladder; competency mapping provisional | outstanding |

The full proposal, generated from the rows themselves:
`docs/assessment/security-manager-recruitment-review-proposal.md`
(`bun run scripts/strategic-review-proposal.ts`).

**Nothing in it is validated, expert-reviewed or approved.** It is
AI-authored against the product's construct rules and the owner's
specification. No psychometric claim is made.

## What the product shows where only the content migration is applied

- "Skicka test" shows both levels. The strategic level names its own test as
  a draft awaiting content approval, lists the five parts that exist as
  drafts, and cannot be sent (the library answers `not_permitted`). It never
  offers the operational test under the strategic heading.
- The library route offers no strategic setup: the guide is restricted, so
  nothing can be started with it.
- Where the migration is not applied at all, the level says the content is
  not installed in this environment, with the same list.

## What the product does after activation (proved on the loopback stack)

`e2e/send-test-strategic-journey.spec.ts`, on a stack that replayed both
migrations and holds no per-organisation grant, walks: the activated state
(library setup startable, both levels sendable, the strategic card said as a
closed test and never as validated) → send with the level recorded and the
strategic version pinned → invitation in the candidate's inbox → sign-in
continuation → interrupted attempt resumed → all 37 items → single submit →
human review of the three reflections against the strategic rubrics → release
→ employer completion (never a failure) → *Förbered intervju* opens a case
with the TRUST · Security Manager setup and the Säkerhetschef guide → another
organisation and the candidate read none of the recruiter material.

## Decision 1 (requested): combined content approval

Approve, or return with changes, the review proposal as a whole:
requirement profile, items with scoring and rubrics, interview guide, report
prompts. Approval is recorded through the existing governance, not by a
migration:

- items: the five gates per item (`scp_review_requirements`) by the
  designated reviewers; content status moves through the editor/reviewer/
  publisher roles;
- guide: `scp_interview_pack_reviews` per gate (expert, legal, cognitive,
  product), bound to the version's content hash as stamped where the
  migration was applied (read it from `scp_interview_pack_versions`; the
  hash covers the rows and differs per database); a reviewer may not be the
  author;
- mapping: `scp_interview_pack_competency_map.mapping_state` →
  `confirmed` by the expert reviewer.

Changes requested in review are made as a new item version or pack version
through the same ladder, never by editing a reviewed row.

## Activation (performed in this change, at parity with the operational level)

`supabase/migrations/20261217090000_scp_security_manager_recruitment_activation.sql`
performs both activation acts together and proves them:

1. `standard_for_recruitment = true` on `security-manager-recruitment`, the
   act 20260905090000 performed for the operational test: an ACTIVE employer
   may assign it without a per-employer grant; it still runs and reports as a
   **closed test**, and confers no `recruitment` governance mode.
2. `pilot_availability = 'open'` on `security-manager-se` v1, the act
   20260925090000 performed for the Väktare guide: usable by every active
   employer, content frozen while open.

They are applied together because a test that can be sent while its guide
cannot be started would leave every completed strategic test without an
interview preparation. Release order: the content migration first, then the
activation, both recorded in `supabase/release-state.json` as pending until
the official integration applies them and the hosted evidence is recorded.
`supabase/rollback/20261217090000_..._rollback.sql` reverses both acts
through the governed `pilot_withdrawn` event and refuses to touch the
operational designation; cases already pinned keep continuity read access.

If the owner wants the strategic level withheld until decision 1 is taken,
the activation file is removed from the migration set before merge (or its
rollback applied afterwards); the content migration stands on its own.

## What this does not do

- It does not publish anything, validate anything, or claim that the
  strategic level measures leadership. Reports carry the closed-test basis
  and the interview material is a pilot hypothesis until the ladder says
  otherwise.
- It does not change the operational level.
- Known limitation for the review: the evidence report's interview prompts
  for OBSERVED areas are the competency-level prompts that exist today, three
  of which are phrased for guarding work; a profession-scoped prompt set is a
  follow-up decision, not part of this proposal.
