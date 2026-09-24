# Security Work analysis application

This application follows schema PR #289. Its hosted application and complete
catalog parity are now [verified read-only](analysis-hosted-verification.md).
The release ledger and schema gate record that evidence. Processor configuration,
AI approval and live quality validation, and publication remain separate steps.

## User journey

The signed-in main menu places **Mitt säkerhetsarbete / My Security Work** directly
after Security Passport, including on mobile. A personal account can create its
first workspace without employer registration. The overview reuses the existing
career overview's presentation and shows real analyses, review tasks and reports.

RSA and monitoring analyses pin a method version, purpose, scope, horizon and
editable organisation-context snapshot. Five steps separate context, evidence,
follow-up questions, assessment and reporting. PDF/DOCX originals are private;
extracted page/section text must be reviewed before it is used. Manual evidence
remains available. Unknown risks stay unrated until the required calibration is
explicitly supplied. The exact owner-approved 25-cell RSA matrix is deterministic.

Users can edit assessments, risks, actions and method-specific report sections,
review the exact approval bundle, approve it, sign out and return. Approval freezes
the report and its evidence. Follow-up actions can change without rewriting that
version; revisions create a new draft with predecessor lineage. Export downloads
an escaped, self-contained HTML report that can be printed to PDF.

## Processing and activation

Document extraction uses the actual separately packaged Node processor over a
pinned authenticated HTTPS endpoint. Cloudflare remains the application target.
Scanned/empty PDFs and unsupported documents fail explicitly; OCR is not claimed.

The real Anthropic integration is prepared but **not activated**. It has separate
Security Work configuration, workspace approval, exact model, processing consent,
budget reservation and signed completion. No live provider request was performed.
The application states this clearly and supports completing the work manually.
Synthetic provider tests must not be described as live AI verification.

See [processing activation](processing-activation.md) for exact environment,
signing-key, first-party processor and provider prerequisites. Private source
reports and their extracted text are excluded from the repository and test data.

## Verification

- Six real local Supabase/browser RSA journeys: Swedish and English at desktop,
  375px and 390px; upload, actual extraction, review, questions, human edits,
  citations, approval, immutable export, follow-up and relogin.
- Six existing manual workspace journeys and 74 service/RLS assertions pass.
- Six further real browser journeys apply explicitly synthetic AI completions:
  human review, provenance, same/new-request retries, stale-version rejection
  within ten seconds and no resend after an unknown outcome. 24 captures pass
  the separate publication gate.
- 42 synthetic screenshots pass a publication gate requiring all six journeys
  without retry or skip; authenticated traces and logs remain private.
- 60 analysis/export checks, including all 25 independently specified matrix cells.
- Parser/provider and AI orchestration checks, 8 processor transport checks and
  13 actual packaged Node HTTP/TLS checks. Provider responses are synthetic.
- Full application and scripts TypeScript checks and Cloudflare production build.
- Database and concurrency evidence is recorded in [analysis release](analysis-release.md).

The CI workflow runs both the existing manual workspace journeys and the new
analysis journeys against an owned disposable stack. The separate analysis
browser runner automatically builds and owns its local TLS processor.

The real AI-review browser test exposed a transport issue that direct SQL tests
did not: intentionally raising `40001` for a stale draft makes PostgREST 14 retry
until the gateway times out. Business conflicts in this new contract use `PT409`
and the application maps that to `CONFLICT`. This follows the official
[Supabase explanation](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b)
and [PostgREST custom status contract](https://docs.postgrest.org/en/stable/references/errors.html#raise-errors-with-http-status-codes).
Concurrency checks still reject stale versions; they do not retry the write.

## Visibility and release

The verified prior visibility defect was the missing primary-navigation entry.
The previously deployed frontend commit could not be established; this work does
not claim that GitHub main is already published. See [visibility audit](frontend-visibility.md).

Review schema first, have the official integration apply it, verify parity, then
review the dependent application and configure approved processing. Merge and
publication remain owner actions. Local preview uses `http://127.0.0.1:3127` while
the disposable browser runner is active; it is not a shared or production preview.
