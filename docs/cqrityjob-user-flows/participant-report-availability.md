# Participant report availability after the owner decision

The current participant flow does not offer employee/workforce development reports. This is an **application availability gate**, not a database authorization change. No migration, grant, SQL function or RLS policy is changed by this gate. The separately approved F09 application-Passport migration does not address this report boundary.

## Application behavior

- Academy and assessment history offer report links only for recruitment. Completed workforce history says that the assessment was submitted, without promising a report.
- The direct participant report route renders a neutral unavailable state and a link to My assessments for missing, workforce or unknown report context. It does not start recommendations/progress reads for such a report, including if an old report exists in the client cache.
- `getAcademyReport` returns participant data only when the authorized RPC snapshot explicitly carries `context.person_context = candidate`. Historical missing context fails closed. Employer-audience reads and the issuer's candidate-document preview retain their existing contracts.
- `getDevelopmentRecommendations` and `getSubjectProgress` resolve the source attempt through the same gate. Progress returned for a candidate attempt is additionally filtered by each returned attempt's authorized snapshot context, so a subject's workforce/unknown history is not returned through a candidate report.
- Recommendations are aggregated by subject in SQL and cannot be filtered after computation. Participant recommendations are therefore withheld when the participant's snapshot history includes workforce/unknown context for that subject. The history check includes empty-payload snapshots that have no progress rows. Employer recommendations and progress retain their existing behavior.

Implementation: `src/lib/security-competency/academy-employer.functions.ts`, `src/routes/_authenticated.academy.index.tsx`, `src/routes/_authenticated.academy.report.$attemptId.tsx`, and `src/components/academy/ParticipantAssessmentHistory.tsx`.

## Remaining release blocker: direct database API

The application gate does **not** prevent a signed-in participant from invoking the Supabase RPCs directly with their own session. The repository's SQL still permits:

1. `scp_participant_report(attempt_id)` for the subject's own released participant snapshot. The definition in `20260904171840_scp_trust_evidence_report_r2a_report_version_continuity.sql` uses the audience readability predicate. The participant branch of `scp_report_snapshot_readable` in `20270203090000_employer_report_access_model.sql` checks the subject identity against `auth.uid()` but does not restrict workforce or unknown context.
2. `scp_subject_progress(subject_id)` for the participant's own subject across participant snapshots. Its latest definition in `20270203090000_employer_report_access_model.sql` does not filter participant snapshots by recruitment context.
3. `scp_development_recommendations(subject_id)` for the participant's own subject. The same migration grants authenticated execution and computes across the subject's evidence; no participant use-case launch gate applies in SQL.

The report table's direct SELECT contract is separate from the callable SECURITY DEFINER projection. Hiding a link or adding an app-server condition cannot change either SQL contract. `supabase/tests/scp_report_audience_test.sql` RA6.1 currently expects a workforce participant's own report to remain readable. This document records repository behavior, not a fresh hosted authorization test.

Enforcing the owner decision at the database API boundary remains a launch blocker requiring a separate explicit policy decision, approved migration, rollback and audience regression tests. Preserve recruitment participant access, employer-audience access and issuer preview when designing that change. Do not claim this application patch or F09 migration fixes database permissions.

## Focused verification

`bun run participant-report-availability:check` executes the real application server handlers with scripted RPC responses, tests candidate/workforce/missing/unknown contexts for both audiences, exercises mixed histories, and renders actual participant history in Swedish and English. It also checks route/worklist wiring. This is offline application evidence, not RLS or browser/backend integration proof.

Existing `employer-lifecycle:check`, `trust-evidence-report:check` and `employer-assessment-release:check` cover unchanged employer workflows.

## Email confirmation on two browser contexts

On 2026-10-04 the existing local `cqrityjob-passport-phase2` stack was inspected without printing credentials. It runs real GoTrue and local Mailpit, but its running GoTrue configuration has `GOTRUE_MAILER_AUTOCONFIRM=true`. Its site URL is `http://127.0.0.1:3119` and redirect allowlist is `https://127.0.0.1:3000`. This stack cannot currently prove the required pre-confirmation refusal and confirmation transition. No account or mail was created, and the shared stack was not reconfigured.

A reproducible focused run should use a separate disposable local stack:

1. Follow `.github/workflows/passport-public-pilot-evidence.yml` for real GoTrue/Mailpit setup with `[auth.email] enable_confirmations = true`. Configure the chosen loopback app URL in both `site_url` and `additional_redirect_urls`. Point both browser and server Supabase settings at this local backend; never reuse hosted credentials.
2. Start the application on that allowed loopback origin. Create independent desktop and phone browser contexts with no shared storage. Register a synthetic address from desktop; assert the pending-confirmation explanation, no desktop session, and refusal of sign-in before confirmation.
3. Read the actual message through the Mailpit helper pattern in `e2e/passport-public-pilot-local.spec.ts` (`readLatestMail` and `confirmationLink`). Open the verification URL only in the phone context. Do not print the URL/token, record a trace containing it, or include it in screenshots.
4. Return to the original desktop context. Assert it did not inherit the phone session; use the explicit continue/sign-in action and assert successful access after entering that account's password. Check a reload preserves the appropriate pending state before sign-in. Exercise Swedish and English independently.
5. Save sanitized assertions/screenshots, then remove the disposable stack. No production or external email writes are needed.

`e2e/employer-registration-confirmation.spec.ts` already supplies the two-context sequence but currently reads the substitute gateway's `/__local/inbox`, not Mailpit. Adapt that helper for a real-Mailpit run and update its old `/annan enhet/i` copy assertion. Its current success would not prove real GoTrue/Mailpit delivery. The public-pilot test does use real mail, but runs additional Passport operations; do not run that whole scenario merely to prove F03.
