# Interview evidence reliability — the contract (PR20)

PR18 connected the interview to its application. PR19 made the recruiter's
journey four stages: **Prepare → Interview → Assess → Report**. PR20 hardens
the evidence chain underneath that experience. This document states the
contracts the code now enforces, so a reader does not have to reconstruct them
from migrations.

The product question: *can a recruiter trust that what they captured during
the interview is exactly what reaches assessment and the final report, without
disappearing, duplicating, being silently rewritten, or leaking across
candidates?*

## The chain, and what is authoritative at each stage

| Stage | Authoritative record | Identity | Written by |
| --- | --- | --- | --- |
| Live question | `scp_interview_session_questions` | (session, question) unique | direct update under RLS |
| Recruiter notes | `scp_interview_session_notes` | `id` | direct insert/update under RLS |
| AI proposals | `scp_interview_evidence_proposals` | `id`; one proposal → at most one evidence row (`proposal_id` unique) | `scp_iv_record_evidence_proposals` (AI run) |
| Confirmed evidence | `scp_interview_evidence` | `id`; **append-only** for clients (SELECT only) | `scp_iv_confirm_evidence_proposal`, `scp_iv_author_evidence` |
| Assessment | `scp_interview_assessments` | `id`; one live row per (case, question, assessor); a change **supersedes** with a reason | `scp_iv_record_assessment` |
| Report blockers | `scp_iv_report_blockers()` | derived, never stored | — |
| Final report | `scp_interview_reports` | `(case, version)`; frozen `payload` + `content_hash` | `scp_iv_finalise_report` (owner/admin only) |

Every row above resolves to the case, and the case to one employer. Every
read policy and every RPC checks membership of that employer.

## Evidence identity

Confirmed evidence has a stable id from the moment it exists. It is never
edited or deleted by a client (no grant), and no RPC edits or deletes it.
The proposal it came from, the note it cites, the human who confirmed it and
the moment of confirmation are all on the row.

Draft material is the interviewer's note. A note may change until the report
is locked and beyond; changing it never changes evidence already confirmed
from it, because the evidence row carries its own copy of the words.

## Question, application and tenant binding

* A question referenced anywhere in a case must belong to the pinned pack
  (existing guard, unchanged).
* **New:** evidence, proposals and findings may cite only a note or source
  passage of **their own case**, a dimension of **their own question**, and a
  competency of the **pinned pack** (`scp_iv_guard_evidence_origin_in_case`).
  The same candidate interviewed for two jobs has two cases pinning the same
  questions; material from one cannot be cited in the other, by any path.
* Cross-tenant: every write RPC refuses a non-member; every read policy hides
  the rows; a note update from another tenant touches zero rows.

## Draft → confirmed

* AI proposals are proposals. Confirming, editing, rejecting or marking one
  unresolved is a human act recorded with the human's id. Only accept and
  edit create evidence. The report builder does not read the proposals table.
* Notes are a source. Nothing promotes a note to evidence except a human
  confirming it, and the note is not consumed by that.
* Confirmed evidence cannot be silently mutated: there is no path.

## Duplication protection (idempotent writers)

Each writer locks the case row for the duration of the call, so two
simultaneous calls run one after the other, and each returns the existing
record for an identical repeat:

| Action | Identical repeat returns |
| --- | --- |
| Author evidence | the existing item with the same words, note, dimension and competency for the question |
| Decide on a proposal | the evidence that decision already produced (same person, same decision) |
| Record an assessment | the live assessment when level, reasoning and uncertainty are identical |
| Mark assessed | nothing to do |
| Finalise report | the latest final report, when nothing has changed |

A **different** decision on a reviewed proposal, and a **changed** judgement
without a documented reason, are still refused exactly as before.

In the browser every important action is single-flight
(`src/lib/interview-intelligence/single-flight.ts`): a second click with the
same input returns the in-flight request. Notes are serialised instead
(saves run in order; the later text wins).

## Stale write protection (notes)

Notes are the only draft material a client updates directly. A save now
carries the version (`updated_at`) the text was typed over and updates only
that version. Zero rows updated is never reported as saved: the server reads
the row back and answers `SCP_IV_NOTE_STALE` (changed elsewhere) or
`SCP_IV_NOTE_NOT_WRITABLE`. A second insert for the same question and kind is
refused (`SCP_IV_NOTE_EXISTS`). The screen keeps the interviewer's text
unsaved, says so, and offers to load the stored version; the autosave stops
until they choose.

Confirmed evidence, assessments and reports are append-only or superseded,
so they need no version column: an older browser state cannot overwrite
them because nothing can overwrite them.

## Assessment → evidence binding, and change after assessment

**Contract:** an assessment covers the confirmed evidence that existed when
it was recorded. Because evidence is append-only, that set is exact:
`confirmed_at <= assessed_at`.

Material confirmed after the live assessment is **not covered** by it. The
assessment is neither invalidated nor edited — it stands, attributed, as it
was made — and the report is blocked (`ASSESSMENT_PREDATES_MATERIAL`) until
the question is assessed again through the existing supersede path, with the
existing documented reason. The Assess screen and the report material view
show the state in words ("New material after assessment"). Nothing drifts
silently.

## Report freeze

`scp_iv_finalise_report` builds the payload only from confirmed evidence,
live assessments, findings, sources and AI run provenance. It never reads the
application, the CV, the Passport, the profile, the job or the notes. A
finalised report cannot be updated or deleted by anyone; the immutability
trigger permits exactly one change, `final → superseded`, with the payload
and hash untouched.

Producing a later version after material changed is now actually possible:
`scp_interview_reports_final` used to forbid a superseded row keeping its
`finalised_at`, so every second finalisation failed with a raw constraint
error. The rule now reads "a draft has no finalisation moment; anything that
was final keeps it".

## Level 0 and missing material

Unchanged. Level 0 is "insufficient evidence"; its anchor does not count
toward any aggregate, and no aggregate exists. Missing material is shown as
material to follow up, never as a finding about the person.

## Error handling

A failed read of evidence, proposals, findings, assessments, session, notes,
report or blockers raises and renders as an error state, never as an empty
list. A failed save is shown as unsaved. A refused finalisation is shown with
the server's reason.

## Migration

`20261020090000_scp_interview_evidence_reliability.sql` — additive:
one trigger function, six `CREATE OR REPLACE` with unchanged signatures,
one CHECK constraint corrected. No table, column, policy, grant or index. The
report payload is unchanged, so reports frozen before and after hash
identically. Rollback:
`supabase/rollback/20261020090000_scp_interview_evidence_reliability_rollback.sql`.

Tests: `supabase/tests/scp_interview_evidence_reliability_test.sql` (database),
`scripts/interview-evidence-reliability-check.tsx` (source and runtime),
`e2e/interview-evidence-reliability.spec.ts` (signed-in walks, local stack).
