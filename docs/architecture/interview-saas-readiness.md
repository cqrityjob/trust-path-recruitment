# Interview Intelligence — SaaS readiness and product controls

Written from the code and the database as they stand, not from intent. Where
something is missing it is named as missing.

**This is not a GDPR compliance statement.** It is an inventory of technical
controls, and a list of decisions that need a lawyer rather than an engineer.

## 1. Tenancy and access

| Concern | State | Verdict |
|---|---|---|
| Organisation / tenant | `employers`, with slug-scoped routing | Sufficient for UAT |
| Membership | `employer_memberships` with role and status | Sufficient for UAT |
| Roles | owner / admin / member; report finalisation requires owner or admin | Sufficient for UAT |
| Case ownership | `scp_interview_cases.employer_id`, enforced by RLS | Sufficient for UAT |
| Cross-tenant reads | Refused. 24 assertions in `scp_interview_tenant_isolation_test.sql` | Sufficient for UAT |
| Cross-tenant writes | Refused twice over — see below | Sufficient for UAT |
| Candidate with a login and no seat | Sees nothing | Sufficient for UAT |
| `anon` | No table grant at all | Sufficient for UAT |

Two things the isolation suite established that were stronger than assumed:

- `scp_interview_cases`, `_evidence_proposals` and `_evidence` carry **no
  UPDATE or DELETE grant for `authenticated`**. A cross-tenant write is refused
  before RLS is consulted, because every state change goes through a governed
  SECURITY DEFINER routine.
- `scp_interview_session_notes` **does** carry an UPDATE grant, because a
  recruiter edits their own notes. There the boundary is RLS, and the suite
  asserts what actually matters: after employer B's attempt, employer A's note
  is byte-identical.

**Missing before public production:** a distinct *reviewer* role separate from
member; per-case assignment (today any active member of the employer can open
any of that employer's cases); and SSO/SCIM.

## 2. AI configuration

`scp_interview_ai_config.ai_enabled` is organisation-level and **fail-closed**:
with it false the product renders no AI control and the server refuses the run.
Verified — the entire recruiter journey in this branch was walked with
`ai_enabled = false`.

`transcript_enabled` is false and transcription is not built.

**Missing before public production:** per-employer AI configuration (the flag is
currently global), and a customer-visible record of when AI was enabled and by
whom.

## 3. Data minimisation and provenance

**Existing controls**

- Source material is stored per passage, with `source_kind`, `purpose_code`,
  `lawful_basis_note` and `origin` on every source — so *why* a document is
  held is recorded beside it.
- The AI input screen sends only permitted `allowedSourceKinds` per task, and
  quarantined passages are recorded as withheld rather than silently dropped.
- Every AI run records provider, model, prompt version, policy version, token
  counts, cost, latency and outcome.
- A proposal cites exactly one source, enforced by a database constraint.
- Confirmed material records who confirmed it and when, both NOT NULL.
- Editing an AI proposal preserves the original text alongside the correction.
- `scp_interview_case_events` carries the audit trail.
- Candidate statements are labelled as candidate statements everywhere they
  appear, and the six material states are distinguished by glyph and word.

**Decisions still required before production, and they are not engineering
decisions**

- Lawful basis per source kind, confirmed by counsel rather than by the free-text
  `lawful_basis_note` a recruiter types today.
- Retention periods. `retention_state`, `retain_until` and an erasure path exist;
  no policy sets the values, and nothing expires automatically.
- Candidate information and access rights: the product records interviews about
  a person who may have no account, and no candidate-facing disclosure or
  subject-access route exists here.
- Whether interview notes constitute a record the candidate may request.
- DPA and sub-processor position for the model provider before real AI.
- Whether the 5E structure or behavioural anchors ever touch special-category
  data in practice, which is a question about what recruiters actually type.

## 4. Lifecycle and language

Case status is a governed state machine with recorded transitions; every status
resolves to a next action, asserted by contract. All employer-facing copy is
bilingual SV/EN, enforced by a guard that fails on an untranslated pair or a
Swedish literal in a component.

## 5. Honest summary

Sufficient for a **controlled synthetic UAT**: tenancy, access, provenance,
audit, fail-closed AI, bilingual copy, and a lifecycle that cannot strand a user.

Required before **public production**: retention policy, candidate-facing
transparency, per-employer AI configuration, a reviewer role, per-case
assignment, and a legal review this document does not substitute for.
