# CQrityjob — Assessment Lifecycle Map

One object moves through this lifecycle: an **assignment** produces an **attempt**, which
produces **responses**, which produce **reviews** and **evidence**, which produce
**report snapshots**, which become **history**.

Everything below is grounded in the shipped schema, not in intent. Vocabularies are the
real CHECK constraints:

- `assessment_assignments.status` — `invited`, `started`, `completed`, `cancelled`, `expired`
- `assessment_assignments.use_case` — `recruitment`, `workforce`
- `scp_attempts.status` — `in_progress`, `submitted`, `scored`, `released`, `abandoned`

The product must never show these words raw. The label column below is what the user sees.

---

## 1. State ownership map

Every state has an owner, a next action, and a place it can be found. A state with no
owner is a dead state, and dead states are the defect this work exists to remove.

| # | State (db) | Label (participant / employer) | Who sees it | Owns next action | Action | Transition | UI surface |
|---|---|---|---|---|---|---|---|
| 1 | assignment `invited` | *Inbjuden* / *Inbjuden* | participant, employer | **participant** | open and start | → `started` / attempt `in_progress` | Academy work list; employer Deltagare |
| 2 | attempt `in_progress` | *Pågår* / *Pågår* | participant, employer | **participant** | answer, save, resume | → `submitted` on submit | Academy attempt runner |
| 3 | attempt `submitted`, reviews open | *Under granskning* / *Väntar på granskning* | participant, employer, reviewer | **reviewer** | complete each review | last review → `scored` (automatic) | Reviewer queue (Granskningar) |
| 4 | attempt `scored` | *Resultat förbereds* / *Klar att frisläppa* | participant, employer | **employer (issuing org)** | release report | → `released` + 2 snapshots | Employer pipeline → release action |
| 5 | attempt `released` | *Resultat tillgängligt* / *Resultat tillgängligt* | participant, employer | — (terminal) | open report | — | Participant history; employer person profile |
| 6 | attempt `abandoned` | *Avbruten* | participant, employer | employer | reassign if needed | — | Employer pipeline |
| 7 | assignment `expired` / `cancelled` | *Utgången* / *Återkallad* | participant, employer | employer | reassign | — | Employer pipeline |

**Automatic vs human.** Scoring is mechanical and already automatic in both directions:
`scp_submit_attempt` sets `scored` immediately when zero reviews are required, and
`scp_complete_human_review` sets `scored` when the last pending review closes. Release stays
a deliberate human act by the commissioning organisation — it is a disclosure decision, not a
calculation. It is made discoverable rather than automatic.

---

## 2. Journeys

### A. Recruitment (`use_case = 'recruitment'`)

Employer → assign to candidate → candidate completes → review where required → employer
receives the **employer-audience** report in the *application* context → employer decides.

The assessment supports the decision and never makes it. There is no PASS/FAIL, no ranking,
no suitability score. Closed-test content must not become recruitment selection evidence:
`scp_grant_permits_assignment` returns `closed_test`, and that governance mode travels with
the attempt (`scp_attempts.governance_mode`) into every downstream surface.

Candidate keeps a participant-facing history entry under their own account.

### B. Workforce / competence development (`use_case = 'workforce'`)

Employer → employee → assign → complete → review → release → result appears in the
**person profile** history → employer may assign a development programme → training progress
is visible → later reassessment compares new evidence with prior evidence.

Training completion is development activity: `scp_evidence_source_types.counts_toward_maturity`
is `false` for `training_completion`, and both maturity functions join on that flag. Completing
a programme never raises a competence level.

### C. Participant professional history

One history, with the distinctions preserved rather than flattened into "completed":

| Concept | Source | Means |
|---|---|---|
| Assessment result | `scp_attempts` + `scp_report_snapshots` (participant audience) | structured evidence of demonstrated judgement |
| Development programme | `scp_training_assignments` | participation in learning activity |
| Credential / certificate | Security Passport | third-party verified claim |

These are never merged. An assessment result is not a training completion and neither is a
credential. Security Passport consumes governed evidence; it does not become a second
assessment store. Sharing stays participant-controlled.

---

## 3. Reviewer journey

Reviewing is deliberately **cross-organisation**: an employer may never review their own
participant's responses, so the queue is scoped by the author/reviewer capability
(`scp_can_author`), not by employer membership. The participant appears as a pseudonymous
reference and the review is made on the response, not the person.

That design is correct. The defect is that the **counters** were employer-scoped
(`scp_employer_review_pressure`) while the **queue** was capability-scoped
(`scp_review_queue`), so the page could show `0 väntar` above a list of pending cards.
Counters, queue and cards must share one intentional scope.

A reviewer must see: what needs review, why (safety-critical vs no automated scorer), which
attempt, severity context, how many remain in that attempt, and whether finishing this one
unblocks a result.

---

## 4. Employer pipeline

The employer needs one operational workspace answering, without hunting:

- what have we assigned
- who has not started
- who is in progress
- which results wait on review
- which results are ready for us to release
- which results are released, and where to open them

Derived states come from the attempt and its open review count. The issuing organisation is
the one that must see "awaiting review" and "ready to release" — the current gap is that the
issuing org gets no signal at all while another org's reviewer holds the work.

**Dashboard** carries attention, not the workspace: a Tester card with *N aktiva*,
*N väntar på granskning*, *N klara att frisläppa*, linking into the workspace.

---

## 5. Person / employee view

There is currently **no employer per-person route** — `workforce.index` lists people and
nothing opens them. A lightweight person profile is needed (not an HRIS):

Overview · Assessments · Development · Competencies & certificates

Assessment history per person shows assessment, purpose, assigned, submitted, review state,
released date, and an action to open the governed employer report. **Attempts accumulate;
a new attempt never overwrites an earlier one.**

Recruitment candidates are not forced into the workforce person model. The evidence
architecture is shared; the business context stays explicit — candidate results are
discoverable from the application workflow, employee results from the workforce workflow.

---

## 6. Admin / governance

Minimum operational visibility so nothing becomes stuck invisibly, and so no ordinary
operation requires manual SQL:

- attempts blocked, and on what
- reviewer pressure across the platform
- closed-test grants in force
- content and validation status, outstanding SME/legal review
- assessment definitions and versions

This is deliberately not a full admin system. It exists to answer "why is this stuck".

---

## 7. Notifications

Existing infrastructure: `src/lib/email/send-invitation-email.server.ts`, with delivery state
already tracked on `assessment_assignments` (`email_delivery_status`, `email_sent_at`,
`email_delivery_error`). There is no general notification table or queue.

Events that warrant a signal:

| Event | Recipient | Status |
|---|---|---|
| participant invited | participant | **exists** (invitation email) |
| assessment submitted | employer | not built |
| review work available | reviewer | not built |
| result ready to release | employer | not built |
| result released | participant | not built |

In-product signals (dashboard counts, queue badges) cover these without a new external
service. Email beyond invitation is documented as later work rather than built here.

---

## 8. Governance invariants (not open for redesign)

No automated hire/reject · no PASS/FAIL · AI never makes the final employment decision ·
raw responses never exposed to employers · participant and employer report audiences stay
separate · human review cannot be bypassed · training completion never creates competence
maturity · `closed_test` never becomes recruitment validation · RLS and tenancy intact ·
Passport sharing participant-controlled · draft/design content truthfully governed.
