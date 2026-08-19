# Closed-test runbook — SG operational baseline

The governance record for the first closed test of `sg-operational-baseline`
(Väktare – operativ baslinje). Written so that nobody has to reconstruct, later,
what was known at the time.

**Status:** prepared, **not approved**. No `closed_test` grant exists.
**Owner:** Mostafa Alshawi · **Prepared against:** `bf8252f5220f6dd279529119215db8b647dd51fd`

---

## 1. What this content is

Stated plainly, because a runbook that flatters the material is worthless.

- **The content is AI-authored draft.** All eighteen item versions carry
  `authored_by_ai = true`. Scenarios, options, scoring keys, distractor error
  types, rubrics and anchors were authored without a working security
  professional in the loop.
- **SME review is outstanding.** `security_sme` is `outstanding` on all eighteen
  items in `scp_review_requirements`, and `sme_review_status` is `pending` on all
  eighteen item versions.
- **Legal review is outstanding where applicable.** `swedish_legal` is
  `outstanding` on six items (`sg-b-02`, `04`, `05`, `06`, `15`, `18`).
  `legal_review_status` is `pending` on three of them.
- **Bias, cognitive, language and accessibility review are all outstanding** —
  every gate, every item, ninety-six register rows, none cleared.
- **Psychometric properties are unknown.** `pilot` is itself an outstanding
  review requirement. There is no reliability estimate, no item analysis and no
  inter-rater agreement figure for the rubrics.
- **The pilot exists to test the content and the process**, not to measure the
  participants. That is the purpose to state to every participating
  organisation.

**This content is not validated.** It must not be described as validated,
verified, benchmarked or normed, in a contract, a deck, a demo or an email. It
is `content_status = draft`, `validation_status = design`, and it is runnable
only under an explicit, scoped, time-limited `closed_test` grant.

No participant-facing warning about AI authorship is added to the assessment
surface. The disclosure lives here, in the grant record, and in the closed-test
limitations already printed on both report templates. Adding an alarming banner
to the participant's own screen would change how they answer without telling
them anything they can act on.

## 2. Scale of the first closed test

**Owner target: a maximum of 8 participants.**

Human review is the binding constraint, not delivery. Every submitted attempt
opens **13 review events** — the twelve safety-critical items plus `sg-b-17`,
which is a constructed response. Twelve of the thirteen currently require an
explicit safety severity from the reviewer.

| Participants   | Review events | Severity judgements | Reviewer hours @ 4–6 min |
| -------------- | ------------- | ------------------- | ------------------------ |
| **8 (target)** | **104**       | 96                  | **7–10 h**               |
| 12             | 156           | 144                 | 10–16 h                  |
| 20             | 260           | 240                 | 17–26 h                  |

The per-review estimate covers reading the scenario and prompt, reading the
answer, choosing an outcome, choosing a severity and writing a rationale —
`scp_complete_human_review` refuses an empty rationale, so that time is not
optional. The three constructed responses take longer than the SJT items,
because the rubric has four dimensions and seven of the twelve dimensions across
the three rubrics currently have no worked anchor.

Scale beyond 8 only once the severity distribution from the first cohort shows
the safety classification is discriminating rather than firing on everyone.

## 3. Operational assumptions

- **Named reviewers.** Reviewing requires `scp_can_author`. Reviewers must not
  hold an active `employer_memberships` row in the participating organisation —
  an employer must never adjudicate its own participant's evidence. In practice
  this means named CQrityjob staff, identified before the pilot opens.
- **Reviews complete before report release.** `scp_submit_attempt` leaves the
  attempt `submitted`; it becomes `scored` only when no pending review remains,
  and `scp_release_attempt_report` refuses to release before `scored_at` is set.
  One outstanding review blocks that participant's entire report.
- **No promise of an instant report.** The participant surface already says so
  (`academy.home.nextReview`, `academy.home.nextRelease`). Do not commit to a
  turnaround time in any pilot agreement that the reviewer roster cannot hold.
- **Duplicate completion is unhandled and must be avoided by convention.**
  `scp_complete_human_review` reads the review `WHERE review_status = 'pending'`.
  If two reviewers open the same card and both submit, the second call finds no
  pending row and raises `SCP_REVIEW_NOT_PENDING`. `ReviewQueue` has no mapping
  for that code, so the second reviewer sees the generic
  `academy.reviews.failed` message **after** writing their rationale, and their
  work is lost. There is no claim or assignment mechanism in the queue.
  **Mitigation for this pilot: one reviewer works the queue at a time**, agreed
  verbally. Queue triage, claim and assignment are deliberately out of scope
  (see §5).

## 4. Maturity thresholds

`scp_maturity_thresholds` v1 stays exactly as it is for the closed test.

The thresholds are **authored, uncalibrated, and an input to the pilot** — not
an output of one. They are not tuned before pilot data exists, because tuning
them against nothing would replace one guess with a guess that looks
authoritative.

Two consequences the owner has accepted:

- Every evidence row from a single sitting carries the same
  `context_type = 'assessment_form'` and `context_ref = form_id`, so a single
  assessment is **one evidence context**. `consistent_evidence` requires two and
  `strong_evidence` requires three. Neither is reachable from one sitting, by
  design.
- Therefore every competency line in a closed-test report reads
  "Behöver följdfråga" / "Needs a follow-up". The report copy states this
  explicitly rather than implying that some lines might read otherwise.

The raw thresholds are internal. They are frozen per report in
`scp_report_snapshots.derivation_input`, which no audience payload selects.
**No readiness score, no percentage, no total and no ranking is derived from
them, now or as a consequence of this pilot.**

## 5. Deliberately not built for this pilot

Recorded so their absence is a decision rather than an oversight: queue triage,
claim and assignment; a new reviewer dashboard; a calibration engine; a new
maturity model; LMS functionality; Security Passport integration; recruitment
assessment; an AI reviewer; advanced analytics; SCORM/xAPI; certificates; broad
terminology redesign; full rubric reauthoring; level-1 and level-3 anchor
expansion.

Of these, the ones that pilot data should actually inform are the anchor
expansion, the rubric work and threshold calibration — post-pilot, using pilot
responses as the raw material rather than inventing examples now.

## 6. What a closed_test grant does not confer

`scp_test_grants` carries a CHECK constraint that makes `purpose = 'recruitment'`
unstorable, and `scp_grant_permits_assignment` returns `recruitment` only for
content that is genuinely `published` **and** `operational-development` /
`operational-selection`. A grant can never produce that answer.

A closed test therefore confers no recruitment, selection, ranking, suitability
or employability use, and the employer remains the decision-maker. Every attempt
freezes its `governance_mode`, the content and validation status on the day, and
the authorising grant, so a later publication event cannot make an old pilot
report look validated.
