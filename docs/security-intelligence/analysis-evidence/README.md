# Synthetic local browser evidence

These selected captures were visually inspected from a real local application,
Supabase Auth, PostgreSQL/RLS, private Storage and packaged document processor.
All content is synthetic. No private reference reports or authenticated traces
are included. The manifest records the source run and SHA-256 digests; application
changes were uncommitted during that run, so these are not deployed-version proof.

- [Workspace overview, desktop Swedish](chromium-sv-overview.png)
- [Reviewed PDF extraction, desktop Swedish](chromium-sv-evidence.png)
- [Immutable approved report, desktop Swedish](chromium-sv-report-approved.png)
- [Private documents, 375px Swedish](mobile-375-sv-sources.png)
- [Workspace overview, 375px English](mobile-375-en-overview.png)
- [Report review and approval, 390px English](mobile-390-en-report-review.png)
- [Synthetic AI proposal for human review, desktop Swedish](chromium-sv-ai-review.png)
- [Unknown AI outcome without automatic resend, 390px English](mobile-390-en-ai-unknown.png)

The complete run passed all six language/viewport combinations once, with no
skip or retry. CI reproduces all 42 captures and publishes only the validated
screenshots and minimal manifest. Live external AI was not used.

The separate AI manifest covers six further passing browser journeys and 24
captures. Those journeys use signed synthetic provider results to verify review,
application, idempotence, stale-state rejection and no resend after an uncertain
outcome. They exercise the real application/API/database; model quality and live
provider calls are not part of this evidence.
