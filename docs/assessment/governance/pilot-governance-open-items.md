# Väktare shadow pilot — open governance items

**Status:** engineering record of what is NOT decided. · **Created:** 3 September 2026 (PR-V2)
**Type:** a list of open items. This document decides nothing, approves nothing and
records no legal conclusion.

## Why this file exists

Two different kinds of statement were sitting in the same documents and reading as
one: what the code does, and what the Product Owner has decided. PR-V2 corrected the
first kind where it had gone stale — the technical claim that every recruitment
assignment is refused was no longer true of the code — and correcting it makes it
more important, not less, to say plainly that **nothing here has been approved**.

An implementation being capable of something is not a decision to do it.

## 1. DPIA — NOT DONE

No DPIA exists in this repository, and none has been recorded as complete anywhere
this document can verify.

Owner decision B (`owner-decisions.md`) requires a DPIA **before the product is used
for real recruitment decisions or operational candidate selection**. It is explicitly
not a blocker for architecture, development, synthetic testing, staging, internal
demonstration or controlled content review.

- **State:** open. Owner + DPO.
- **This file does not assert that a shadow pilot does or does not require one.**
  That is the decision, and it belongs to the Product Owner and the DPO.

## 2. Whether a recruitment pilot opens at all — OWNER DECISION, OPEN

Owner decision A excludes recruitment assessment from the first pilot. It is still
binding.

What changed is only the accuracy of the surrounding description: since
`20260831090000_scp_closed_test_recruitment_purpose` the code accepts a
recruitment-context assignment onto the purpose `closed_test_recruitment`, while
`selection_support` remains unpublished and inactive so operational selection still
fails closed. Decision A was previously written as though the refusal were the
mechanism enforcing it. The mechanism enforcing it is the decision.

- **State:** open. Product Owner.

## 3. Language adaptation of the English instrument — CONTENT REVIEWED, NOT VALIDATED

PR-V3 (`20261022090000`) reviewed all 50 English texts against the Swedish for the
same scenario, behavioural demand, key and option plausibility, and recorded them
`adaptation_reviewed` with the reviewer named on the row: an AI assistant acting as
content preparer, **not a named human language reviewer**. The outstanding finding
"Språklig likvärdighet mellan sv-SE och en-GB" is therefore still open on all 50 item
versions, and no text is `approved`.

PR-V2 made delivery *structurally* equivalent and proved it
(`supabase/tests/scp_language_contract_test.sql`): same items, same option
identities, same served order, same scoring, whichever language the run is delivered
in. That is a delivery guarantee. It is **not** a claim of psychometric equivalence,
and it must not be described as one.

- **State:** open. A named bilingual reviewer with guarding experience must clear the
  `language` requirement; the reviewer pack is
  `docs/assessment/governance/vaktare-content-review-pack-2026-09-03.md`.
- **Practical consequence today:** an English shadow-pilot run is a run of a
  content-reviewed but unvalidated translation and should be described that way to
  the participating organisation.

## 4. Assignment language is not immutable — KNOWN GAP, NOT CLOSED

`assessment_assignments_immutable_guard` protects the employer, assessment, version,
profile, recipient email, token hash, assigner and creation time. It does **not**
protect `language`.

Nothing in the product offers a way to change it, and the employer update policy is
the only path that could. If it were changed after a candidate had begun, the
released report's context would name the new value while the run had been delivered
under the old one — the same class of defect PR-V2 closed everywhere else.

- **State:** open. Closing it is a one-line addition to the guard, which is a
  migration, and PR-V2 deliberately carried none.
- **Risk today:** low. It requires a deliberate database-level or employer-API write.

## 5. Reviewer seat in the pilot tenant — OPERATIONAL, OPEN

A submitted attempt cannot be scored or released until every mandatory human review
is complete, and only an employer-authorised reviewer can complete one. A tenant with
no authorised reviewer leaves every attempt stuck at `submitted`.

- **State:** open, per pilot tenant. See `closed-test-runbook.md` §3.
- Also required: the reviewer must not be the person who assigned the attempt, and
  for recruitment must not have acted on the candidate's application.

## What this file does not say

- It does not say a DPIA is complete, in progress, or unnecessary.
- It does not say a recruitment pilot is approved.
- It does not state a lawful basis, and does not review one.
- It records no legal conclusion of any kind.

## 6. Self-report keys on c07 and c19 — PRODUCT OWNER / SME SCORING DECISION, OPEN

The human content review (PR-V3 revision 2) found that c07's key (0 / 2 / 3 / 2) may
conflate autopilot behaviour with self-awareness, and that c19's peak key ("Ibland" = 3)
is too context-dependent. Neither can be made monotonic, or purely descriptive in the
product output, without changing score values: the self-report facet pattern
(`scp_attempt_self_report_pattern`) is a mean of stored contributions, so any score is
an ordered input to "rarely / mostly / consistently describes working this way".

PR-V3 therefore left both items **exactly as authored** — text and scores — and holds
them BLOCKED. c03's context was rewritten instead (the pair no longer says "neither is
wrong"), which leaves its authored 1 / 3 key defensible as a two-point description;
c06, c18 and c24 keep the authored "Inget av dem är fel" with the same shape and were
not raised by the reviewers.

- **State:** open. Product Owner + SME. Options: flatten to a constant score
  (descriptive only), re-key monotonically, or accept the authored keys with the
  interview prompt as the only interpretation.
- **Until decided:** the employer brief's self-report pattern for the facets
  *avvikelseigenkänning* and *eskalering och överlämning* includes these two items.
