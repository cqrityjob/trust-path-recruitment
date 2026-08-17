# Pilot Readiness Track 2 — Employer Assessment → Candidate → Review → Result

Verified live against the running application and the real backend. No product
logic, scoring, governance gate or database schema was changed. Career Discovery
and Security Passport were not touched.

## 1. Ground truth

Two assignment surfaces exist:

1. **SCP Academy (canonical, review-capable)** — `scp_employer_assign`,
   `scp_get_attempt_items`, `scp_save_response`, `scp_submit_attempt`,
   `scp_complete_human_review`, `scp_release_attempt_report`. Employer UI:
   `/employer/$slug/assessments/{library,participants,reviews,results/$attemptId}`.
   Candidate UI: `/academy`, `/academy/$attemptId`. Reviewer UI: `/reviews`.
2. **Legacy token invitation** (`assessment_assignments`,
   `/employer/$slug/assessments/assign`) — bound to catalogue definition
   `security-guard-foundation`, which is `employer_visible = false`, so the
   catalogue lists nothing and the surface is not linked from navigation.

Track 2 was therefore proven on the SCP Academy path, which is the only path
that includes human review and controlled result release.

`sg-operational-baseline` (Väktare – operativ baslinje) remains `draft` with
open review requirements and is correctly shown as "Under utveckling — kan inte
tilldelas ännu". Governance gates were **not** bypassed; the published,
employer-invisible-to-others fixture `TESTFIXTUR — leveranskedja` was used, with
access restricted to the closed-test organisation via `scp_fixture_access`.

## 2. End-to-end run (live, authenticated)

Organisation `STÄNGD TEST — CQrityjob internt` (`stangd-test-cqrityjob`, active).

| Step | Actor | Result |
|---|---|---|
| Assign from Testbibliotek | employer.owner@closed-test.invalid (owner) | assignment + attempt `440c178b…` created |
| Discover in Min kompetensutveckling and on Min karriär | participant@closed-test.invalid | assignment listed with purpose/processing notice |
| Complete 4 items (single-choice, best/worst, rating, free text) | participant | `scp_attempts.status = submitted`, correct "väntar på granskare" message |
| Human review of the free-text response | reviewer@closed-test.invalid (content role `reviewer`) | review `completed / upheld`; attempt advanced to `scored` |
| Release report | employer owner | `scp_report_snapshots` rows for `participant` and `employer` audiences |
| Employer result | employer owner | maturity levels, observation counts, suggested development modules, explicit limitations — **no raw answers** |
| Candidate result | participant | "Öppna rapport" available on `/academy` and on `/my-career` |

## 3. Security / privacy observations

- Employer report contains competence maturity and development suggestions only;
  individual responses are never exposed to the employer surface.
- `scp_report_snapshots` RLS: participant audience scoped to the subject,
  employer audience scoped to active membership in the issuing organisation.
- Reviewer capability is enforced server-side in `scp_complete_human_review`
  (`scp_can_author`), not by UI.
- Fixture assignment is gated by `scp_fixture_access`; other organisations
  receive `SCP_FIXTURE_NOT_AVAILABLE`.
- Copy on every surface states this is development-oriented and not a pass/fail
  or employability decision.

## 4. Open items (not fixed — outside the minimal Track 2 scope)

- P2: the legacy `/employer/$slug/assessments/assign` route remains reachable by
  direct URL although its only catalogue definition is not employer-visible; a
  submission there fails with a generic error. Unlinked from navigation, so no
  user-visible dead end today. Recommend retiring it once the Academy path is
  the single assignment surface.
- P3: pilot content `sg-operational-baseline` still needs its recorded review
  requirements (legal, SME) closed before it can be assigned to real employers.

## 5. Regression status

- `tsgo --noEmit`: clean
- `career-discovery-v31:check`: 599/599 passed
- `kg:check`: OK
- `cie:check`: PASS
