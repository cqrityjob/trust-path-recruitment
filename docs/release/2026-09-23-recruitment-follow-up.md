# Recruitment follow-up: configuration, retention and assignment retries

## State verified on 2026-09-23

PR #285 is merged (65b5532746255dc63136592391b1c300441eeaf9).
The production AI database switch is false. Server environment variables are
not exposed by the available connector, so their current presence has NOT been
independently verified. No secrets were read, changed or committed; no production
data or configuration was written.

## Email activation

The TanStack server function already calls Resend through
src/lib/email/send-recruitment-message-email.server.ts. Configure the environment
of that SERVER deployment, not browser VITE variables or an unrelated Supabase
Edge Function:

- RESEND_API_KEY: restricted credential, entered directly in the secret settings.
- RESEND_FROM_EMAIL: an approved sender on a domain verified with Resend.

After deployment, send one recruitment message to an explicitly chosen,
controlled test recipient. Verify both the candidate's portal message and actual
receipt in the email inbox. A Resend 2xx response only establishes provider
acceptance, not inbox delivery. Do not resend an already-sent portal message
merely to test email. The sender and test recipient remain owner inputs.

## AI activation

Existing server configuration:

- INTERVIEW_AI_PROVIDER=anthropic
- ANTHROPIC_API_KEY: entered directly in the secret settings.
- INTERVIEW_AI_ENVIRONMENT=production is recommended explicitly; the code already
  defaults to production when it is absent, so this is NOT a missing prerequisite.
- INTERVIEW_AI_MODEL: verify an actual model ID available to this account. The
  adapter must not silently substitute a model when an ID is unavailable.
- public.scp_interview_ai_config.ai_enabled=true, only after server configuration
  and explicit approval to activate production AI.

The switch is shared with Interview Intelligence: activation is broader than
the recruitment drafting UI. Preserve all existing purpose, transcript and
candidate-data gates. Recruitment drafts currently send the employer's job
description and requirements, not candidate answers or CVs.

Verify a draft against synthetic job text, the recorded provider/model,
labelled fallback on provider failure, and the existing manual editing flow.
Do not label templates as model output. No activation or model call was made in
this change.

## Retention and account erasure: decision required

The earlier report overstated the account-deletion gap. The existing
admin_delete_user_if_safe function supports erasure when history prevents a
hard delete. It clears application phone, cover note and CV metadata and queues
the original CV path in storage_erasure_queue. It retains the employer's
recruitment record. New application answers, messages and internal notes are not
covered by that earlier migration. Time-based recruitment retention is still
missing.

An application DELETE alone is not a complete erasure policy:

| Data | Existing relationship | Required retention decision |
| --- | --- | --- |
| Answers, messages, internal comments, bookings, status events and application metadata | Cascade from application | Common recruitment expiry, with explicit exceptions |
| CV objects | Stored separately | Reuse storage_erasure_queue; capture path before clearing it; retry failed object deletion |
| Assessment assignments, pending invitations, interview cases and case sources | Application link becomes NULL | Own expiry/erasure rules; do not leave personal text merely detached |
| Interview starts and BESKT assignments/case links | Restrict application deletion | Governed handling of these records before application deletion |
| Passport disclosures | Cascade from application | Employer record purpose/retention; preserve the separate holder Passport |
| Signed/immutable reports and evidence | Governed immutable lineage | Lawful retention and erasure policy; do not rewrite payloads or hashes as “anonymisation” |

Owner decision record to complete before implementing destructive execution:

1. Retention duration after recruitment completion/cancellation, by relevant
   market/controller. No universal duration is assumed.
2. How withdrawals, reopened recruitments, accepted candidates and legacy
   applications lacking a completion date are treated.
3. Which legal holds block scheduled deletion, who can set/release them, and
   whether security-vetting/report records have a different schedule.
4. Whether any separate, explicit consent supports a future-opportunities pool.

Implementation sequence once decided: configurable policy -> read-only preview
with counts and blockers -> tests on expired/non-expired/held/reopened records
and cross-tenant denials -> approved deletion worker in bounded transactions ->
retryable Storage erasure -> audit of counts/results without retaining erased
free text. Manual account-erasure requests and scheduled expiry must share the
same data inventory. Include failed deletion retries and backup retention in the
operational policy.

Source for the need for purpose-specific retention rather than an arbitrary
default: [IMY, Recruitment systems and competence databases](https://www.imy.se/verksamhet/dataskydd/dataskydd-pa-olika-omraden/arbetsliv/rekryteringssystem-och-kompetensdatabaser/).
This document is a decision/implementation plan, not an implemented retention
worker. No deletion schedule has been enabled.

## Assignment idempotency implemented in this branch

Migration 20261209090000 updates the shared scp_employer_assign function.
scp_assign_from_application delegates to it, so both RPC routes reuse work.
The key is application + test definition, matching the UI's test-slug rule
across assessment versions. An explicitly abandoned attempt allows a new one.

The function locks the application row after caller, tenant and applicant
checks. Before insertion it returns an existing non-abandoned attempt, preserving
the pinned version, subject, deadline, language and governance. Existing
permission, purpose and governance gates still run. Workforce and standalone
assignment semantics are unchanged. Existing open-assignment table guards remain.
This change does not grant new table writes or claim to deduplicate arbitrary
privileged direct SQL.

The migration rejects an unexpected prior function body and historical
duplicates rather than deleting/merging records. Read-only production preflight
found zero duplicate non-abandoned application/test-definition groups.

Verification: full canonical migration replay in local PGlite/PostgreSQL,
the new functional suite, existing recruitment-journey and pilot-security suites,
old-body negative control, rollback/reapply, and repository migration/release
checks. Two real PostgreSQL connections are tested by
scripts/recruitment-assignment-race-test.sh inside db:test/CI; PGlite does not
establish that concurrency result. Consult the PR checks for the CI result.

The migration is marked pending. Production application and verification through
the repository's tracked release mechanism remain a separate release step.
