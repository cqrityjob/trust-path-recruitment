# CQrityjob Employer Product Source of Truth v1.1

**Status:** READY FOR OWNER PRODUCT LOCK — v1.1 · **Prepared:** 18 August 2026 · **Owner:** Mostafa Alshawi

> **v1.1 changes (owner decisions locked in Phase 0C).** Development/workforce-first
> pilot with recruitment excluded (A). The evidence-over-time model is owner-approved
> and binding (B). Career Discovery corrected to **28 questions, 22 scored** (C).
> GDPR wording separates configured processing basis from final legal approval (D).
> Only the Väktare baseline must be pilot-ready; Reception, Rondering and Datacenter
> move to the next-content roadmap (E). Blueprint Engine parked (F). Legacy public
> assessment is historical-read-only, retired for new runs (G). No percentages or
> readiness scores, the conservative Assessment → Passport boundary, and the final
> human decision all remain binding and unchanged.
**Type:** product definition and architecture alignment. No code, no schema, no migration, no content change follows from this document by itself.
**Supremacy:** where this document conflicts with an earlier document, this document wins for the **employer product**. It does not override the ADRs it cites; it applies them. It does not change Passport implementation or Career Discovery scoring.

---

## 1. Product definition

### 1.1 What CQrityjob's employer product is

**A competence evidence system for security work.** It collects structured evidence about how a person acts in security situations, routes the safety-critical parts to a human, and gives the employer a defensible record and a follow-up action — for candidates and for existing staff, in the same place, about the same person, over time.

It is **not** a test vendor, not an ATS, not a training provider, and not a decision engine.

### 1.2 Why a security company would use it every week

The honest answer has to come from the mechanics of the system, not from marketing. It does.

`scp_compute_maturity` requires **3 observations across 2 contexts** before evidence reaches `consistent_evidence`, and **5 observations across 3 contexts from 2 source types** for `strong_evidence`. A single assessment is one context and one source type. Therefore:

> **One assessment can never produce a "shown" competency. By construction, a single run leaves every competency at *Behöver följdfråga*.**

That is not a defect to hide — it is the product. It means:

| The employer's real weekly work | What the product does with it |
|---|---|
| A new person starts on a customer site | Assign the role assessment → first evidence context |
| A customer requires documented instruction | Assign the instruction/site module → second **source type** (`training_completion`), second **context** (`module`) |
| A reviewer flags a safety-critical answer | Employer gets a named follow-up, records a decision |
| A supervisor observes work on site | `manager_observation` evidence → third context *(post-pilot)* |
| An incident is reviewed | `incident_review` evidence → the evidence that actually matters *(post-pilot)* |
| Evidence ages past 730 / 365 days | The competency drops back and the person surfaces as needing re-evidence |

The weekly reason is **placement and evidence decay**, not assessment volume. Security employers rotate people between sites and customers constantly, and every rotation is a new readiness question about a person whose evidence is already in the system. A recruitment-only test is used a few times a month by one recruiter. An evidence system is used every week by every operations manager who has to place somebody.

### 1.3 The three sentences the whole product obeys

1. **AI explains. Deterministic rules calculate. Humans decide.**
2. **No pass/fail, no suitability, no ranking, no hiring recommendation — ever, in any surface, by any path.**
3. **The system states what the evidence supports and what it does not, including when the answer is "not enough yet".**

### 1.4 What the product measures

The twelve Security Competency Core constructs (SCC-01 … SCC-12), defined in [Security Competency Core v2.0](../assessment/security-competency-core-v2.0.md). Facets exist for item design and coverage only and are **never reported as separate scales**.

### 1.5 What the product will not claim

Not a lie detector, background check, vetting instrument, medical or psychiatric assessment, intelligence measure, personality profile, or a prediction of future dishonesty or performance. No employer surface may label a person *lämplig/olämplig, pålitlig/opålitlig, stresstålig*, or equivalent.

---

## 2. The four employer use cases

Common to all four:

- **Data spine:** `auth.users` → `scp_subject_identities` → `scp_subjects` → `scp_attempts`. One human is one professional identity; the employment relationship is a property of the assignment (`assessment_assignments.use_case`), never of the person.
- **Human review:** every safety-critical and constructed-response answer routes to a reviewer holding the content-review capability. An employer may **never** adjudicate its own participant's evidence.
- **Output:** two audience-scoped, immutable report snapshots per released attempt (employer, participant), built from separate allowlists.
- **Decision:** recorded append-only in `scp_employer_report_decisions`, beside the report, never inside it.

---

### Use case 1 — RECRUITMENT

Job / application → candidate → assessment → human review → employer report → interview → **human hiring decision**.

| | |
|---|---|
| **Problem solved** | Interviews for security roles are unstructured and the same weak signals repeat. The employer needs evidence about judgement in security situations, plus the specific questions worth asking this candidate. |
| **Target user** | Recruiter or operations manager who hires; owner/admin role on the employer workspace. |
| **Required data** | Job, application, candidate account, programme bundle version, `selection_support` purpose version, assignment, attempt, responses, human reviews, released employer report. |
| **Workflow** | Application received → employer assigns the role assessment (`use_case = 'recruitment'`, person context locked by the recipient being an applicant) → candidate is informed of purpose, controller, recipients, retention, rights and that a human decides → candidate completes → safety-critical and constructed responses route to a reviewer → report released → interview using the report's follow-up prompts → employer records a follow-up decision → **hiring decision is made and documented outside the product**. |
| **Employer actions** | Assign · monitor status · read the report · request identity reveal (audited) · record a decision · export/print. |
| **Candidate actions** | Consent-informed start · complete · read their **own** participant report · keep it. |
| **Human review** | Mandatory for every safety-critical item and every constructed response. Employer cannot complete reviews. |
| **Output** | Employer report (§6) + participant report (§7) + recorded follow-up decision. |
| **Limitations** | Instrument validation status is `design`; content is closed-test. No comparison between candidates. No score. No automatic status change on the application. |
| **MVP** | **The technical sentence that stood here is superseded by the implementation (correction, 3 September 2026).** It said `scp_employer_assign` refuses every recruitment assignment with `SCP_PURPOSE_NOT_AVAILABLE`. Since `20260831090000_scp_closed_test_recruitment_purpose` that is no longer what the code does: a recruitment-context assignment is accepted and lands on the purpose **`closed_test_recruitment`**, so the candidate is recorded as a candidate rather than as somebody's employee. What remains true is the part that carries the governance: **`selection_support` is still unpublished and inactive**, so operational selection still fails closed, and a closed test confers no selection, ranking, suitability or employability use. See [closed-test-runbook.md](../assessment/governance/closed-test-runbook.md) §6. **Owner decision A below is a Product Owner decision about whether to run a recruitment pilot, and is untouched by this correction** — the code being able to do a thing is not a decision to do it. `scp_employer_assign` still requires the recipient to already hold an account; `scp_invite_participant` is the path for one who does not. |
| **Waits** | Owner + legal decision on the [purpose governance pack](./purpose-governance-decision-pack.md); the Phase 8.5B invitation slice; validation status ≥ `operational-development`. |

> **Owner recommendation:** do not open recruitment for the pilot. Pilot on use cases 2–4, where the lawful basis is already published and the closed-test grant is legitimate. Recruitment is the second commercial motion, not the first.

---

### Use case 2 — NEW EMPLOYEE / CLIENT PLACEMENT

Employee → role / site / customer requirement → relevant assessment → instruction / training → readiness evidence → **manager decision**.

| | |
|---|---|
| **Problem solved** | A customer contract says people on this site must be instructed and demonstrably able to handle its situations. Today that is a signed paper list. The employer cannot show *evidence*, only *attendance*. |
| **Target user** | Operations manager / site manager placing staff; the customer is the indirect beneficiary. |
| **Required data** | Employee record, role, site (text today), customer *(no schema until Phase 9)*, assessment assignment (`use_case = 'workforce'`), instruction/site module, `training_completion` evidence, released report. |
| **Workflow** | Person is assigned to a site → employer assigns the role assessment **and** the site/customer instruction module → person completes both → safety-critical answers reviewed → evidence now spans two contexts and two source types → manager reads the readiness picture → manager decides to place, place with supervision, or instruct further → decision recorded. |
| **Employer actions** | Assign assessment · assign instruction module · read report · record decision · re-assign instruction when the customer's requirement changes. |
| **Employee actions** | Complete assessment · complete instruction · acknowledge site rules · read own report. |
| **Human review** | Same rule. Safety-critical observations are surfaced to the employer separately and can never be concealed by a competency state. |
| **Output** | Per-person readiness view: which competencies have evidence, from how many contexts, what is outstanding, what is safety-flagged. Plus a per-site completion list. |
| **Limitations** | "Customer" and "site" are not first-class entities yet (`employees.site_name` is free text). The product must not imply a site-level certification. Instruction completion evidences *that the instruction was completed and its checks answered*, not that the person is competent on site. |
| **MVP** | **Yes — this is the pilot's primary use case.** Current configured processing basis: legitimate interests / Art. 6(1)(f), notice `pn-2026-08-competence-development-v1` — **subject to final GDPR/legal review before external pilot.** A published purpose row is a technical configuration, not a legal conclusion. |
| **Waits** | First-class customer/site entities · site-scoped requirement templates · automatic expiry of site instructions. |

---

### Use case 3 — EXISTING WORKFORCE DEVELOPMENT

Employee → assessment → development need → training / development action → reassessment → history.

| | |
|---|---|
| **Problem solved** | Development conversations in security run on opinion. The manager needs a specific, competency-anchored starting point and a way to show that something changed. |
| **Target user** | Line manager, HR, quality manager. |
| **Required data** | Employee, assessment, evidence per competency, development modules mapped to SCC competencies, completions, history over time. |
| **Workflow** | Assess → the report names the competencies where evidence is thin and gives a follow-up prompt per competency → manager has the conversation and records a decision (`assign_development`) → development module assigned → completion writes `training_completion` evidence → the person's evidence picture changes because a second context now exists → reassessment later re-measures with **different items** *(blocked, see below)*. |
| **Employer actions** | Assign · read · decide · assign development · follow up · view history. |
| **Employee actions** | Complete · read own report and reflection prompts · complete development. |
| **Human review** | As above. Reviewer rationale and severity stay employer-side; the participant sees only that a human reviewed. |
| **Output** | Employer: development need per competency with follow-up prompt. Participant: own state per competency with a reflection prompt. Both: history. |
| **Limitations** | A change in evidence is **not** a change in the person. Nothing here may drive pay, scheduling or discipline automatically. Comparison is against the person's own earlier evidence, never against colleagues. |
| **MVP** | **Yes** for assess → decide → develop → re-evidence-through-training. |
| **Waits** | **Reassessment delivery is blocked**: the `reassessment` purpose has no published version, so the control is disabled with an explanation rather than failing on click. Requires the purpose pack decision **and** a second, non-overlapping form (reusing the original form measures recall of the question). |

---

### Use case 4 — CONTINUOUS QUALITY ASSURANCE

Employer → workforce overview → expiring / re-evidence needs → pending reviews → training needs → evidence history.

| | |
|---|---|
| **Problem solved** | A security company is audited by its customers. It needs to answer "show me that the people on our site are instructed and assessed, and show me what you did about the exceptions" without assembling it by hand. |
| **Target user** | Quality manager, owner, operations director. |
| **Required data** | All of the above, aggregated per employer, plus evidence age (`max_age_days` 730 / 365), open reviews, released-but-undecided reports, open safety follow-ups. |
| **Workflow** | Command Center states what needs attention today → the employer clears it → the history remains as evidence of what was done and when. |
| **Employer actions** | Work the attention list · export a person's or a group's evidence record. |
| **Employee actions** | None. |
| **Human review** | Pending-review pressure is a first-class QA state: an unreviewed safety-critical answer is a *blocked report*, and the employer must be told that without seeing the material. |
| **Output** | Attention list, coverage statement, exportable per-person record. |
| **Limitations** | No workforce score, no benchmark, no percentile, no comparison against other companies. Counts and states only. |
| **MVP** | Attention list + counts + per-person export. |
| **Waits** | Group/period reports, customer-facing compliance packs, trend analytics. |

---

## 3. Pilot assessment catalogue

**Owner decision E (locked).** Only the Väktare / Security Guard baseline must be fully pilot-ready before the first pilot. Reception, Rondering and Datacenter are approved NEXT content directions on the post-pilot roadmap; they are **not Phase 2 implementation requirements and must not block the first pilot.**

Four products, in this sequence, all as **profession/context modules on the shared Security Competency Core**, all `content_status = draft`, `validation_status = design`, all runnable **only** under an organisation-scoped `closed_test` grant, all producing artefacts permanently labelled as such.

Common to all four:

- **Type:** SJT (situational judgement, primary) + BIQ (behaviour-frequency) + a small number of constructed-response items. Core + module scores and evidence stay separate.
- **Safety-critical review:** required. Any item flagged `is_safety_critical` routes to a human, and the deterministic path can never produce safety-critical evidence.
- **Delivery target:** module 12–15 minutes; Core + module 42–55 minutes before pilot evidence supports reduction.
- **Employer output:** the §6 report. **Development output:** the §7 report plus mapped development modules.
- **Never:** a legal-qualification claim, a licence, or an implication of BYA/regulated training.

### 3.1 Väktare / Security Guard baseline — `security-officer-se` *(exists)*

| | |
|---|---|
| **Purpose** | Baseline occupational competence evidence for general guarding work. |
| **Target user** | New and existing väktare; the broadest population an employer has. |
| **Competency areas** | Weighted toward SCC-01 Integrity, SCC-02 Security Awareness, SCC-03 Situational Awareness, SCC-09 Accountability, SCC-11 Professional Judgement; SCC-04/05/06/07 present. |
| **State today** | 18 authored items, 12 safety-critical, draft/design. Runnable only under closed-test grant. |
| **Safety-critical review** | Required — this is the module that proved the routing. |
| **Must be validated before recruitment use** | SME review (≥15 SMEs, ≥5 environments) · cognitive pilot 20–30 candidates in both languages · bias and accessibility review · legal review for any item touching Swedish legal powers · DPIA · `selection_support` purpose published. |

### 3.2 Reception / Reception i säkerhetsroll — **next content, post-pilot**

| | |
|---|---|
| **Purpose** | Evidence for reception and host-facing security roles, where the tension is service versus boundary-holding. |
| **Target user** | Reception staff placed at customer premises; high placement churn. |
| **Competency areas** | SCC-07 Service Orientation and boundary-holding (lead), SCC-06 Communication, SCC-05 Emotional Regulation, SCC-02 Security Awareness, SCC-03 Situational Awareness, SCC-01 Integrity (tailgating, "just this once" pressure). |
| **Safety-critical review** | Required, but fewer safety-critical items than Väktare — access control and escalation refusal are the ones that qualify. |
| **Employer output** | Where the person holds the boundary, where they yield under social pressure, and the interview/coaching question that follows. |
| **Development output** | Boundary-holding and de-escalation micro-modules. |
| **Why second** | No regulated legal content ⇒ **no legal-review gate**, so it can reach pilot faster than Ordningsvakt/Skyddsvakt, and reception placements turn over weekly. |
| **Must be validated** | SME review from reception environments specifically · language and bias review · pilot statistics. |

### 3.3 Rondering / Mobile patrol — **next content, post-pilot**

| | |
|---|---|
| **Purpose** | Evidence for mobile and rounds-based work: alone, unobserved, deciding without backup. |
| **Target user** | Mobile patrol and rounds staff. |
| **Competency areas** | SCC-09 Accountability (lead — traceability from assignment to closure), SCC-03 Situational Awareness, SCC-04 Decision Under Pressure, SCC-01 Integrity (working unobserved), SCC-10 Adaptability, SCC-06 Communication (reporting quality). |
| **Safety-critical review** | Required — lone-working escalation decisions are the safety-critical core of this module. |
| **Employer output** | Reporting discipline and escalation judgement, with the observed exceptions named. |
| **Development output** | Reporting quality, escalation thresholds, route discipline. |
| **Why third** | Shares the most content lineage with Väktare, so authoring is cheapest **after** Reception has proven that a genuinely different context module works. Reuse must be a reviewed declaration in `scp_item_version_professions`, never a copy. |
| **Must be validated** | SME review from mobile operations · pilot statistics · confirmation that shared items behave the same in both roles. |

### 3.4 Datacenter — **next content, post-pilot**

| | |
|---|---|
| **Purpose** | Evidence for critical-infrastructure site work where the *customer* sets the requirement. |
| **Target user** | Staff placed at datacenter and critical-facility customers. |
| **Competency areas** | SCC-02 Security Awareness (lead — protected assets, barriers), SCC-01 Integrity, SCC-09 Accountability, SCC-08 Teamwork/coordination, SCC-11 Proportionality, SCC-03 Situational Awareness. |
| **Safety-critical review** | Required — access control, escort discipline and incident handling are safety-critical by definition here. |
| **Employer output** | A record the employer can show its customer: assessed, instructed, reviewed, with exceptions and what was done about them. |
| **Development output** | Site-specific instruction paired with the module (use case 2). |
| **Why fourth** | Highest commercial value and the clearest "customer requires it" motion, but it depends on the site/customer instruction product being real. Build it when §4 exists. |
| **Must be validated** | SME review with datacenter customers · customer-requirement mapping reviewed · pilot statistics · explicit statement that this is not a certification. |

### 3.5 Explicitly not in the pilot catalogue

Ordningsvakt and Skyddsvakt. Their content may be drafted, but every item touching legal powers is blocked from publication and assignment until legal review is recorded — so they cannot be the instrument that proves the product. **No psychometric claim of any kind is made for any of the four modules above.**

---

## 4. Pilot training / development catalogue

### 4.1 The positioning decision

**CQrityjob does not provide regulated training.** Not VU1, not VU2, not BYA-governed courses, not ordningsvakts- or skyddsvaktsutbildning, and nothing that could be read as a step toward a förordnande. No CQrityjob artefact may state or imply that a regulated requirement has been met.

What CQrityjob provides is **the employer's own instruction, delivered, recorded, and turned into evidence.**

### 4.2 What is offered

| Product | What it is | Evidence it writes |
|---|---|---|
| **Employer instruction** | The company's own rules, routines and expectations, delivered as a short module with comprehension checks and acknowledgement | `training_completion`, context `module` |
| **Client / site onboarding** | The customer's site-specific rules, access routines, escalation path | `training_completion`, context `module` (site-scoped when sites become first-class) |
| **Role development micro-learning** | Short modules mapped to SCC competencies, assigned after a report names a need | `training_completion`, context `module` |
| **Post-assessment development** | The path from a recorded `assign_development` decision to a completed module | as above |
| **Reassessment** | Re-measurement with different items | *(blocked — purpose not published)* |

### 4.3 What is not offered

Regulated training · certification or licence issuing · CPD credits · anything with a pass mark · exam proctoring · any claim of legal competence.

### 4.4 Minimum training product for the pilot

Four things, and nothing more:

1. **An employer-authored instruction module**: title, content blocks, 3–8 comprehension checks, acknowledgement.
2. **Assignment to an employee**, with the same person-context rules as an assessment.
3. **A completion record that writes `training_completion` evidence** with `context_type = 'module'` — the writer is already enabled; this is what gives the pilot a second source type and second context.
4. **A manager view**: who was assigned what, who completed, who has not.

That is the smallest product that makes the evidence model produce something an assessment alone cannot, which is the entire pilot argument.

> Comprehension checks in a training module are **not** an assessment. They may write `training_completion` evidence with honest confidence; they may never write assessment-response evidence and may never be reported as competency measurement.

---

## 5. Employer Command Center — MVP specification

**One question: WHAT NEEDS MY ATTENTION TODAY?**

Every item is a factual operational state derived from a real row. No score, no percentage, no index, no readiness meter.

> **Removal decision:** the current "readiness" progress element on the Command Center measures which internal modules are connected, presented as an organisational readiness figure. It is a fabricated readiness score by the definition in this document and is **removed**, not relabelled. Its honest replacement is a coverage statement (§5.4).

### 5.1 ACTION REQUIRED — ordered by consequence

| # | State | Source of truth | Why it is first |
|---|---|---|---|
| 1 | *N safety follow-ups open* | released employer snapshots with `critical_follow_up`, or reviewer severity high/critical, with no `scp_employer_report_decisions` row | Somebody observed something unsafe and nobody has acted |
| 2 | *N responses awaiting review, blocking M reports* | `scp_employer_review_pressure()` | The employer is waiting on us — say so, show no material |
| 3 | *N released reports with no recorded decision* | snapshots minus decisions | The evidence exists and the loop is open |
| 4 | *N assessments invited but not started (> 7 days)* | `assessment_assignments` + `scp_open` | Nothing will happen unless someone chases |
| 5 | *N assessments started but not submitted (> 3 days)* | attempts `in_progress` | Abandonment is the main data-loss path |
| 6 | *N instruction modules assigned, not completed* | training assignments | Use case 2's actual failure mode |
| 7 | *N people with evidence older than the validity window* | `max_age_days` 730 / 365 | Re-evidence need, stated as need, not as expiry of a person |
| 8 | *Organisation state* (pending approval, profile incomplete) | `employers` | Blocks everything else |

Empty state is a real state: **"Nothing needs your attention today."**

Governance-blocked paths (recruitment assignment, reassessment) are **not** attention items. They appear once, where the action would be, with the reason.

### 5.2 RECRUITMENT

Open jobs · applications awaiting first review · applications by stage. Assessment-in-recruitment shows its honest blocked state at pilot rather than an empty widget.

### 5.3 ASSESSMENTS

Per programme: assigned · in progress · submitted · awaiting review · released. Plus closed-test grant state and expiry, because an expiring grant silently stops the product.

### 5.4 WORKFORCE / DEVELOPMENT

- Employees with **no evidence at all** (count + list)
- Employees with evidence from **only one context** — the honest coverage statement, and the natural next action
- Competencies most often at *Behöver följdfråga* across the workforce (counts of people, never a score)
- Development modules assigned vs completed
- People needing re-evidence

### 5.5 QUICK ACTIONS

Assign development assessment · Assign instruction module · Add employee · Open reviews · Open participants · Create job.

### 5.6 Forbidden on this page

Readiness scores · percentages · percentiles · benchmarks · league tables of employees or sites · anything labelled "top" or "bottom" · any aggregate that reduces a person to a number.

---

## 6. Employer report specification

One immutable snapshot per attempt per audience. Context is **frozen at release**, not joined at render — reading it in six months must show what applied on the day it was issued.

| Section | Contents | Rule |
|---|---|---|
| **1. Participant** | Pseudonymous reference + person context (candidate / employee). Name only through the audited reveal (`scp_resolve_participant_identity`, owner/admin, one person at a time, after release) | A name is never frozen into an immutable snapshot — it could never be erased |
| **2. Assessment** | Programme, assessment version, form version, language, administered and released timestamps | Frozen |
| **3. Purpose** | Processing purpose, lawful basis reference, privacy-notice version, jurisdiction | The report states why this person was processed |
| **4. Governance context** | Governance mode (`development` / `closed_test` / `recruitment`), validation status, and — when closed test — a permanent statement that the content is unvalidated | Never removable, never a footnote |
| **5. Competencies** | Per competency: name, **evidence state**, observation count, and the employer follow-up prompt | Five states only: *Starkt visat · Visat · Behöver följdfråga · Ännu inte visat · Kritisk följdfråga* |
| **6. Evidence / result** | What the states were derived from, at competency level: how many observations, across how many contexts | Never raw candidate responses. Never scoring keys |
| **7. Human review** | Whether review is complete, how many responses were human-reviewed, reviewer role — not reviewer identity to the employer by default | An incomplete review is stated as incomplete |
| **8. Safety-critical observations** | Stored separately from competency lines so no template can drop them: severity and what was observed, in reviewer-authored factual terms | An evidence state may never conceal a safety observation |
| **9. Limitations** | What this instrument does not measure; that a single assessment is one context; that this is decision support; that a human decides | Versioned template, attached at release |
| **10. Suggested follow-up** | Per-competency interview or development prompts from the published prompt library | Questions, never conclusions |
| **11. Employer decision** | Composed beside the report, never inside it: action, reason code, short factual note, who and when; corrections are new rows | Vocabulary excludes hire/reject/suitable |

### Forbidden in the employer report

PASS · FAIL · HIRE · REJECT · suitable/unsuitable · lämplig/olämplig · pålitlig/opålitlig · stresstålig · any percentage, percentile, index, band, ranking, comparison to other candidates or to an industry norm · any 0–100 competency score · any AI-authored statement that cannot be traced to specific evidence.

Permitted framing: *"Resultatet tyder på … i de testade situationerna."*

---

## 7. Participant report specification

A **different document from the same frozen run**, built from its own allowlist — not the employer report with fields hidden.

**Contains:** the same competency spine (name, evidence state, observation count) · the fact that a human reviewed, where one did · a **reflection prompt** per competency from the participant prompt library · assessment, purpose and governance context · limitations, in second person · what the person can do next.

**Never contains:** reviewer rationale or private notes · safety severity or the safety-observation block · the employer's decision or reason code · scoring keys, per-option values, scoring rationale, weights · internal maturity levels or threshold version · employer follow-up prompts (they are interview support, not self-development) · other participants, in any form.

**Why it is useful:** it names the competency, says honestly how much evidence exists, and asks a question the person can act on. It is the only assessment artefact many of them will ever own, and it belongs to them.

---

## 8. Candidate vs employee lifecycle

```
One human ─ one auth user ─ one subject identity ─ one assessment history
                                    │
                     ┌──────────────┴──────────────┐
              use_case='recruitment'        use_case='workforce'
              (candidate)                   (employee)
              may reference job/application may reference employee
              may NOT reference employee    may NOT reference job/application
```

- The **recipient determines the relationship**: applicant → recruitment, locked; employee → development, locked; bare email → the employer states which.
- A person who was a candidate and is now an employee yields **two rows** in the participants read model. That is correct and must be shown, not collapsed.
- Hiring is an explicit, separate, audited act. **Nothing in the product converts a candidate into an employee**, and no score writes to an application status.
- Recruitment evidence does not silently become development evidence: reuse for a different purpose requires a fresh lawful and transparent assessment.
- No employer-facing read model may carry `subject_id`. Identity resolution goes through the authorising RPC only.

---

## 9. Employer navigation — pilot

| Module | Classification | Reasoning |
|---|---|---|
| **Overview (Command Center)** | **CORE** | The product's front door; §5 |
| **Assessments** — Library | **CORE** | Shows what exists and why it cannot yet be assigned |
| **Assessments** — Assign | **CORE** | The primary action |
| **Assessments** — Participants | **CORE** | Status, progress, release, audited identity reveal |
| **Assessments** — Reviews | **CORE** | Truthful review pressure without exposing material |
| **Assessments** — Results / Reports | **CORE** | The deliverable |
| **Workforce** | **CORE** | Use cases 2–4 start here |
| **Training** | **CORE** *(build)* | Currently a coming-soon page; §4 makes it the second evidence source |
| **Jobs** | **SECONDARY** | Real and working, but not why an employer opens the product weekly at pilot |
| **Applications** | **SECONDARY** | Same; recruitment assessment is blocked at pilot |
| **Assessments** — Programmes | **SECONDARY** | Fold into Library as a tab; not its own destination |
| **Assessments** — Assignments *(legacy CIE screens)* | **HIDE FOR PILOT** | Legacy lineage, superseded by Participants; keep the route alive for the token path only |
| **Sites** | **HIDE FOR PILOT** | No sites table; `employees.site_name` is free text |
| **Competencies** | **HIDE FOR PILOT** | No backend; the competency vocabulary is already in the report |
| **Reports** *(module)* | **HIDE FOR PILOT** | Reports live on the attempt; a separate empty module teaches the wrong mental model |
| **Analytics** | **HIDE FOR PILOT** | Would invite exactly the aggregate scoring this product forbids |
| **Ask CQrity** | **HIDE FOR PILOT** | No AI touches this product until the §11 controls exist |
| **Settings / Organisation** | **SECONDARY** | Needed, not daily |
| **Sites & Risk (full)** · **Competencies & Certificates** · **Reports & Compliance** · **Analytics** · **Ask CQrity** | **POST-LAUNCH** | Each needs its own backend and its own governance decision |

**Pilot sidebar, in order:** Overview · Assessments *(Library · Assign · Participants · Reviews · Results)* · Workforce · Training · Jobs · Applications · Settings.

Hidden modules are hidden in one place, and hiding is presentation only — permission is always re-derived server-side.

---

## 10. MVP / Later

### In the pilot MVP

| Area | Scope |
|---|---|
| Use cases | 2 (placement), 3 (development), 4 (QA) |
| Purpose | `competence_development` only |
| Governance mode | `closed_test` under an organisation-scoped grant |
| Assessments | Väktare baseline live; Reception authored; Rondering and Datacenter drafted |
| Training | Employer instruction + client/site onboarding + role micro-modules, writing `training_completion` evidence |
| Reports | Employer + participant snapshots with frozen context, safety block, limitations, follow-up prompts |
| Decisions | Recorded, append-only, corrections as new rows |
| Command Center | §5, readiness meter removed |
| Participants | Status, release, audited reveal, re-evidence need |
| Reviews | Pressure counts for employers; queue for reviewers |
| Navigation | §9 pilot set |

### Waits

| Area | Why |
|---|---|
| Recruitment assessment | `selection_support` purpose undecided; validation status too low |
| Candidate without an account | `SCP_RECIPIENT_HAS_NO_ACCOUNT`; Phase 8.5B invitation slice |
| Reassessment | `reassessment` purpose undecided + needs a second non-overlapping form |
| Sites / customers as entities | Phase 9 |
| Manager observation & incident evidence | Writers not enabled; each needs its own governance decision |
| Analytics, benchmarking, workforce aggregates | Governance decision first, product second |
| Ask CQrity / any AI in this product | §11 controls must exist first |
| Assessment → Passport projection | §12 |
| Norms, percentiles, comparisons | Requires approved norm data; a further gate beyond `operational-selection` |
| 0–100 competency scores and description bands | Deferred; see §14.10 |

---

## 11. Governance rules (binding on every surface)

1. **No pass/fail, suitability, ranking or hiring recommendation**, produced by any mechanism, shown anywhere.
2. **No automatic write path from a result to an application status, employment status, pay, scheduling or placement.** A human decides and documents.
3. **Human review is mandatory** for every safety-critical and constructed response. The deterministic path may never produce safety-critical evidence. An employer may never complete a review of its own participant.
4. **Two-person publication.** Content is approved by a reviewer who is not the publisher; nothing is born published.
5. **Published content is immutable.** Change means a new version. Historical results are never silently recalculated.
6. **Purposes fail closed.** No published purpose version ⇒ the path refuses with a named error and the UI explains it instead of failing on click.
7. **A closed-test grant never becomes recruitment permission.**
8. **Validation status is displayed on every report** and never raised automatically.
9. **Scoring keys, per-option values, rationales and weights never reach a candidate or employer account.**
10. **Employer read models never carry `subject_id`.** Identity reveal is scoped, authorised and audited.
11. **Free text about a person is bounded and factual.** Controlled vocabularies over prose wherever a decision is recorded.
12. **AI may not compute, adjust or influence a score, produce a person-statement, or publish content.** Any future AI narrative sits beside the deterministic result, is traceable to specific evidence, and can never replace it.
13. **Stop-the-line:** irreproducible historical results, automatic pass/fail reaching production, item or key leakage, a missing DPIA, or an AI-produced person-statement halts release regardless of phase.

---

## 12. Assessment → Passport boundary

**Direction:** one-way, holder-initiated, opt-in per share. There is no automatic projection and no foreign key between the domains.

| | Rule |
|---|---|
| **Trigger** | Only the holder, only from a **released** attempt, only as an explicit act |
| **Permitted payload (pilot)** | Programme name · assessment version · administered and released dates · governance mode and validation status · whether a human review was completed · issuer (CQrityjob) |
| **Not permitted (pilot)** | Competency evidence states · observation counts · safety observations and severity · reviewer rationale · employer decisions · raw responses · scoring keys · maturity levels · `subject_id` |
| **Labelling** | A record originating from `closed_test`/`design` content carries that status permanently and visibly in the Passport, in every disclosure |
| **Employer visibility** | An employer sees a Passport record only through the holder's own disclosure — never through the assessment product |
| **Uploaded evidence** | Stays in the private evidence bucket, visible to a verifier only while a review is open, never in a disclosure. Only the verification **outcome** is disclosable |
| **Integration point** | `scp_resolve_participant_identity` — never a join into `sp_*` tables, never a new person record |
| **Later** | Competency-level projection is deferred until validation status ≥ `operational-development`, and is its own owner decision |

**Career Discovery never enters Passport as competence evidence, and never reaches an employer in any form, aggregated or derived.**

---

## 13. Canonical taxonomy decisions

| Question | Canonical answer |
|---|---|
| Career taxonomy name | **Security Career Area** / **Säkerhetsområde**. "Career Family" is retired from all product copy, documentation, frontend, new API and new schema |
| Career taxonomy identity | The **14 canonical snake_case career-area ids** reconciled in Career Intelligence Epic 2, which `jobs.family_id` already validates against |
| `cig_profession_families` | An internal CIG grouping with uuid ids. **Not** the canonical taxonomy and not mapped to it. Building a mapping is a separate, evidenced decision |
| `scp_assessment_families` | A **governance** concept — which product content belongs to. Never renamed, never displayed to an employer or candidate, never confused with a career area |
| Competence vocabulary | **SCC-01 … SCC-12** owns everything employer-facing |
| Orientation vocabulary | **CDA-01 … CDA-08** owns Career Discovery, candidate-facing only |
| Assessment DNA's 12 Dimensions | Method and ethics reference framework. Supplies vocabulary to neither product |
| Legacy 14 dimensions | Frozen for historical reproduction only. Never mapped to anything new |
| Existing identifiers | **No renames.** The standard governs new work only |

### The graph naming convention — one name per graph, permanently

| Graph | Name to use | Tables | Role |
|---|---|---|---|
| Career taxonomy | **Career Intelligence Graph (CIG)** | `cig_*` | Career areas, professions, requirements, pathways, regulatory disclaimers. **Contributes zero scoring signal to anything** — enrichment and labels only |
| Competence evidence | **the Competency Graph** (a layer of the Security Competency Platform) | `scp_*` | Behaviours → competencies → evidence → maturity |

"Knowledge Graph" is retired as a product or documentation term; the module of that name is the CIG read layer and is not renamed. There is no third graph, and Passport is not a graph.

### Product relationships — CIG · CD · SCP · SP

```
                    CIG  (taxonomy, labels, requirements — no scoring signal)
                     │ names and enrichment only
      ┌──────────────┼───────────────┬────────────────────┐
      ▼              ▼               ▼                    ▼
Career Discovery   Jobs        Security Competency    Security Passport
 (CDA-01..08)                    Platform (SCC-01..12)   (holder-owned)
 candidate-owned                 employer-facing         holder-controlled
      │                                │                       ▲
      │  never to an employer          │  released record,     │
      └────────────────────────────────┴──holder-initiated ────┘
```

Permitted: CIG → everything (labels only) · SCP → SP (§12) · SCP → CD at Evidence-Object level with consent *(Future, never a competency score)*.
Forbidden: CD → SCP · CD → employer · SP → employer except by holder disclosure · any competency score becoming a career axis, or the reverse.

---

## 14. Contradictions resolved

Each has one owner recommendation. Where a document loses, it is downgraded explicitly rather than quietly ignored.

**14.1 Canonical Career Family taxonomy.** Three candidates existed: the 14 snake_case ids, `cig_profession_families`, and `scp_assessment_families`. **Resolved:** the 14 ids are canonical and are called Security Career Areas; the other two are unrelated internal objects (§13). No renames.

**14.2 Percentages in candidate or employer UI.** Documents disagreed — bands and a 0–100 scale in one place, "no percentages, ever" in another, and a live build that hid fit percentages in one section and printed them two sections later. **Resolved: forbidden.** No percentage, percentile, fit score, readiness score, index or 0–100 competency value in any candidate-facing or employer-facing surface. Numeric diagnostics are permitted **only** in platform-admin and internal calibration tools, and must be structurally unreachable from the production path.

**14.3 Deterministic vs randomised.** **Resolved: deterministic is absolute.** Same responses + same form version + same threshold/scoring version ⇒ same result, always. The only permitted randomisation is controlled **option-order** randomisation within an item, and only where the key is order-independent. Never item selection, never branching that changes the measured set. Career Discovery's adaptive layer is framing and carries no axis loadings.

**14.4 One graph naming convention.** **Resolved** in §13: CIG and the Competency Graph. "Knowledge Graph" retired as a term.

**14.5 Relationship between CIG / CD / SCP / SP.** **Resolved** in §13: four products, one directional flow diagram, three explicit prohibitions.

**14.6 May Passport include uploaded evidence?** **Resolved: yes, privately.** Uploads support a verification request, are readable by a verifier only while the review is open, and never appear in a disclosure. Only the outcome is shareable. An employer never receives a document.

**14.7 What may Assessment project into Passport?** **Resolved** in §12: the existence and provenance of a released assessment record, holder-initiated, permanently labelled with its governance and validation status. No competency states, no safety observations, no employer decisions — at pilot.

**14.8 Recruitment vs development assessment boundary.** **Resolved:** the same instrument, distinguished by purpose and gate, never by content. Development runs today on a configured and published processing basis (legitimate interests / Art. 6(1)(f), pending final legal review); recruitment requires a published `selection_support` purpose **and** content that is published **and** validation ≥ `operational-development`. A closed-test grant never confers recruitment. **The pilot is development-first.**

**14.9 Status of legacy v3.0 Career Discovery.** **Resolved:** v3.1's frozen 28-question structure (2 context + 22 scored Career DNA + 4 contextual Discovery Path) is the live instrument. The v3.0 document set remains the architecture and evidence-model reference; its draft C1–C3 context block is superseded in full and was never administered. The v2.1 `public-career-assessment` stays frozen and readable for its historical runs and is retired for new runs. None of it is employer-facing.

**14.10 The scoring model — 0–100 bands vs evidence states.** Not on the brief's list, but the sharpest live contradiction: `scoring-engine-v1.md` specifies 70/30 SJT/BIQ weighting, a 0–100 competency score, a Core Summary Index and four *preliminär utvecklingsprofil* bands. **None of it is implemented.** What ships is the Competency Graph: per-option values 0–3 → behaviour evidence → `scp_compute_maturity` → five display states. **Resolved: the evidence-state model is canonical for all employer and participant output.** The 0–100 model, the Core Summary Index and the description bands are **deferred, not adopted**; `scp_scoring_versions` remains as governed lineage. `scoring-engine-v1.md` is downgraded to "specified, deferred, superseded for reporting". Nobody may implement bands from it.

**14.11 "One assessment gives an answer" vs the sufficiency thresholds.** **Resolved in favour of the thresholds, and made the product's spine.** A single run cannot produce *Visat*. The report says so in its coverage section, the Command Center says so in its coverage statement, and the training product exists to supply the second context (§1.2, §4.4).

**14.12 Blueprint Engine vs SCP.** **Resolved (already, and restated because it keeps resurfacing):** the Blueprint Engine stays parked and untouched. Its conventions are reused; its tables are not. It is not a third assessment product.

**14.13 Employer "completes human reviews" vs employers may not adjudicate.** **Resolved by precision, not by weakening:** Reviews is a real employer surface showing review pressure and nothing else; completing a review requires the content-review capability.

---

## 15. Phase 2 — exact implementation scope for Claude

Backend and product logic only. Additive migrations, governed read models, server functions, and the surfaces that render them. **Every item below is stated as a bounded deliverable with acceptance criteria.**

**P2-1 · Command Center attention model.**
One governed read path returning the eight ACTION REQUIRED states in §5.1 with counts and target links.
*Accept:* every state derives from real rows; no state is computed in the browser; an employer sees only its own organisation; zero states renders the empty state.
*Non-goal:* trends, history, forecasting.

**P2-2 · Remove the readiness meter.**
Delete the module-connectivity progress element and its copy; replace with the coverage statement (people with no evidence · people with evidence from only one context).
*Accept:* no percentage or progress figure representing organisational readiness remains anywhere in the employer product.

**P2-3 · Minimum training product (§4.4).**
Employer instruction module authoring, assignment, completion with comprehension checks, and completion writing `training_completion` evidence at `context_type = 'module'`; manager completion view.
*Accept:* a completion measurably changes the person's context and source-type counts; a comprehension check can never write assessment-response evidence; person-context rules match assessments; the module is never described as regulated training.
*Non-goal:* certificates, pass marks, proctoring, regulated content.

**P2-4 · Decision loop wiring.**
The employer decision surface composed beside the released report, writing through the existing append-only path; corrections as new rows; decision state feeds ACTION REQUIRED item 3.
*Accept:* no decision vocabulary implies hire/reject/suitability; a corrected decision preserves the superseded one.

**P2-5 · Re-evidence surfacing.**
Participants and Workforce show evidence age against the validity windows and surface people needing re-evidence.
*Accept:* stated as an evidence-validity fact, never as expiry of a person or a competence; the blocked reassessment control keeps explaining why.

**P2-6 · Honest refusals, in one place.**
A single mapping from governance refusal codes (`SCP_PURPOSE_NOT_AVAILABLE`, `SCP_RECIPIENT_HAS_NO_ACCOUNT`, `LEGAL_REVIEW_PENDING`, assignability reasons, `SCP_ASSIGNMENT_ALREADY_OPEN`) to translated, actionable employer copy.
*Accept:* no raw database error text reaches the browser; every blocked control explains itself before it is clicked.

**P2-7 · Navigation gating (§9).**
Hide-for-pilot modules hidden in one place, behind one flag.
*Accept:* hiding is presentation only; permission still re-derived server-side; no route is deleted.

**P2-8 · Väktare baseline, pilot-ready — and nothing else.**
Owner decision E: the ONLY content deliverable in Phase 2 is bringing the existing Väktare / Security Guard baseline (18 items, draft/design, 12 safety-critical) to full pilot readiness under a closed-test grant: complete safety-critical review routing, follow-up and reflection prompts for every competency it evidences, Swedish source with approved English adaptation, and an end-to-end run proven against real content rather than the 4-item fixture.

Reception, Rondering and Datacenter are **explicitly out of Phase 2**. They are approved next-content directions and must not block the first pilot. Any deliberate item reuse across professions, when they are authored, is a reviewed declaration in `scp_item_version_professions`, never a copy.
*Accept:* every module stays draft/design and runnable only under a closed-test grant; every safety-critical item routes to human review; no legally dependent item is published without recorded legal review.

**P2-9 · Report completeness against §6.**
Verify each of the eleven sections is present in the employer snapshot and each participant exclusion in §7 is absent by construction, and assert absence — not just presence — in tests.

**Explicit Phase 2 non-goals:** recruitment assignment · reassessment delivery · invitation of account-less recipients · sites/customers as entities · manager-observation or incident evidence writers · analytics · any AI · any Passport projection · any 0–100 score or band · any change to Passport implementation, Career Discovery scoring, or existing migrations.

---

## 16. Phase 5 — exact UX scope for Lovable

Visual and interaction design only. **No schema, no migration, no RPC, no scoring, no assessment content, no governance logic.**

**P5-1 · Command Center.** Five blocks in the §5 order, ACTION REQUIRED visually dominant, consequence-ordered, real empty state, blocked paths explained where the action would be. No meters, gauges, scores or progress rings representing people.

**P5-2 · Employer report reading experience.** The eleven sections of §6, with the safety block and the governance/validation banner impossible to miss and impossible to lose in print. Evidence states as clear qualitative labels — never coloured scores, never a scale that reads as a grade.

**P5-3 · Participant report.** A visibly different document with its own voice, second person, reflection prompts, and a design that makes it feel owned by the person rather than issued about them.

**P5-4 · Assign flow.** Person context locked by the recipient; the bare-email case asks explicitly; blocked purposes explained before the click.

**P5-5 · Participants.** Pseudonymous by default; "Show who this is" as a deliberate, single-person, audited act — never a column.

**P5-6 · Training.** Assign, consume, acknowledge, complete; manager completion view; wording that never implies regulated training or certification.

**P5-7 · Refusal and empty states.** A designed set covering every governance refusal in P2-6. These are the most-seen screens in a governed pilot and must not look like errors.

**P5-8 · Bilingual SV/EN throughout**, Swedish as the source voice, and a copy pass that removes every prohibited term in §6.

**Explicit Phase 5 non-goals:** inventing metrics, charts, scores, badges or gamification · designing modules classified HIDE FOR PILOT · designing recruitment assessment flows · designing anything the backend cannot truthfully populate.

---

## 17. Owner decisions locked in Phase 0C

These are approved and binding. They are not open questions.

| # | Decision | Effect on this document |
|---|---|---|
| **A** | The first external pilot is **development / workforce first**: placement, workforce development, continuous QA. **Recruitment assessment is not part of the first pilot** and `selection_support` stays blocked until its purpose governance, lawful basis, DPIA and validation requirements are explicitly approved. The gate must not be weakened | Still binding as an **owner decision**. Note (3 Sep 2026) that it is no longer also a description of the code: closed-test recruitment assignment is implemented and runs on `closed_test_recruitment`, while `selection_support` remains unpublished exactly as this decision requires. Whether a recruitment pilot opens is the Product Owner's call, not an engineering state — see the §2 correction and [pilot-governance-open-items.md](../assessment/governance/pilot-governance-open-items.md) |
| **B** | The **evidence-over-time model** is a locked product principle. A single assessment is ONE evidence source and ONE context. One assessment must not be presented as proof of fully established professional competence when the maturity model requires multiple observations, contexts or source types. The system states when evidence is insufficient. **No readiness score may be invented to compensate for sparse evidence** | Confirms §1.2, §5.4 and §5.6; makes §4.4 the pilot's load-bearing product |
| **C** | Career Discovery v3.1 is **28 questions: 2 Career Context + 22 scored Career DNA + 4 adaptive Discovery Path**. Documentation correction only — no scoring or content change. Career Discovery remains frozen | Applied in §14.9. Verified against `MVP_QUESTION_COUNT = 28` |
| **D** | Where the system uses legitimate interests / Art. 6(1)(f), documents say **"current configured processing basis … subject to final GDPR/legal review before external pilot."** A technical purpose row is not a legal conclusion | Applied in §2 use case 2 and §14.8 |
| **E** | Only the **Väktare baseline** must be fully pilot-ready now. Reception, Rondering, Datacenter are approved next-content directions, not Phase 2 requirements, and must not block the first pilot | Applied in §3 and §15 P2-8 |
| **F** | The **Blueprint Engine is parked** and must not be applied to hosted production. Removed from the active migration path, historical source retained | Confirms §14.12. Mechanism in the Phase 0C report |
| **G** | The **legacy public v2.1 assessment** is readable for historical runs and **retired for new runs** | Confirms §14.9 |

Still binding and unchanged from v1: no percentages or readiness scores anywhere in a candidate- or employer-facing surface (§14.2); the conservative Assessment → Passport boundary (§12); and the human decision as final (§11.1–11.2).

---

## Open decisions this document cannot make

1. **Purpose governance pack** — lawful basis, controller/processor allocation and retention for `selection_support` and `reassessment`. Blocks use case 1 and reassessment. Owner decision A keeps both closed for the first pilot.
2. **DPIA** — required before any real recruitment use.
3. **Pilot customer and scope** — which organisation holds the closed-test grant, for which programme, for how long.
4. **Content authoring capacity** — the three next-content modules are real authoring work with real SME dependencies, scheduled after the pilot per decision E.
5. **Career Discovery consent** — the experience presents no consent step, so there is no technical record to persist. Authoring one requires consent text and a lawful basis, which is an owner + legal decision (Phase 0C report §8.3).
6. **`cd_profession_profiles` exposure** — closing it changes a frozen Career Discovery object; two prepared options await a decision (Phase 0C report §8.2).

---

READY FOR OWNER PRODUCT LOCK — v1.1, owner decisions A–G locked
