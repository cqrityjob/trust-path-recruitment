# CQrityjob — Pilot Readiness Track 1 report

Scope: make the existing non-Passport journey (Candidate → Job → Employer →
Assessment) coherent and pilot-verified with the smallest reasonable change.
Security Passport core, Career Discovery logic, scoring, questions and the
Career Intelligence Graph were **not** modified.

## 1. Ground-truth audit findings

| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | `/my-career` Career Journey had `apply` and `develop` hardcoded to `false`, so a candidate who had applied or been assigned development work still saw an unfinished journey | P1 | Fixed (real signals) |
| 2 | No published job and no application existed in the environment, so the end-to-end journey could not be proven at all | P1 | Seeded one clearly-labelled synthetic pilot listing |
| 3 | Employer-side verification would otherwise require the Product Owner's own superadmin account | P2 | Granted the existing synthetic closed-test employer user `admin` membership of the existing test organisation |

No defects were found in the apply flow, application history, employer
status transitions, CV storage access or tenant isolation.

## 2. Code change

`src/routes/_authenticated.my-career.index.tsx` only:

- `apply` step now reads `listMyApplications()` (count > 0).
- `develop` step now reads `listMyAcademyWork()` (count > 0), reusing the
  `["academy","my-work"]` query key already used by `MyAcademyWorkCard`, so
  no extra request is issued.
- Both queries use `retry: false` and have no error UI — a backend problem in
  either must never break the candidate home.

No business logic, scoring, RLS or server functions were changed.

## 3. Database changes

Both are test data only, applied through the tracked migration workflow:

1. `pilot_track1_internal_pilot_job` — one `status='published'`,
   `application_method='internal'` job (`short_id PILOT001`,
   slug `sakerhet-ab-vaktare-stockholm-pilot001`) for the existing test
   organisation "Säkerhet AB" (`h31-test-co-etlqoz`). Body text states
   explicitly that it is test data and not a real vacancy.
2. Membership insert — synthetic user `employer.owner@closed-test.invalid`
   given `role='admin'`, `status='active'` on `h31-test-co-etlqoz`.

No schema, policy, grant, trigger or function was altered.

## 4. End-to-end verification (real browser, live Lovable Cloud)

Driven with Playwright against the running app, using minted sessions for
existing synthetic test accounts.

| Step | Actor | Result |
|---|---|---|
| Public job detail renders (`/jobs/sakerhet-ab-…-pilot001`) | anonymous/candidate | PASS — structured header, localised enum labels, no raw enums |
| Apply via CQrityjob (phone, cover note, PDF CV, explicit consent) | candidate `mvp-audit-candidate-20260725@example.com` | PASS — application accepted, CV stored in the private `job-application-cvs` bucket |
| `/my-career/applications` shows the application | candidate | PASS — status `Submitted`, Download CV + Withdraw offered |
| `/employer/h31-test-co-etlqoz/applications` shows the application | employer `employer.owner@closed-test.invalid` | PASS — candidate name, date, cover note, CV download, Assign assessment |
| Advance status `Submitted → Reviewing` | employer | PASS — UI advanced, next action became "Invite to interview" |
| Candidate sees the employer's status change | candidate | PASS — status now `Reviewing` |
| Career Journey step 4 "Apply for a role" completes | candidate | PASS — step marked complete on `/my-career` |
| Career Journey step 5 "Continue developing" | candidate | Correctly incomplete (no assigned development work) |

## 5. Regression status

- `bunx tsgo --noEmit` — clean.
- `career-discovery-v31:check` — 599/599 passed.
- `cie:check` — PASS.
- `kg:check` — OK.
- Career Discovery, scoring, assessment content and CIG taxonomy untouched.

## 6. Security / privacy

- CV downloads remain short-lived signed URLs from the private bucket; no
  public object URLs are produced.
- Application reads stay RLS-scoped: candidate to own rows, employer to own
  organisation's rows. The synthetic membership grants access to the test
  organisation only.
- No candidate PII was logged or written into this report beyond the
  clearly-synthetic test identities.

## 7. Residual risks / handoff

- The pilot listing and the synthetic membership are test data and should be
  removed (or the listing expired) before any public launch.
- One pre-existing React warning ("state update on a component that hasn't
  mounted yet") appears on the employer applications page. It is cosmetic,
  pre-dates this work, and was left untouched to stay in scope.
- Security Passport surfaces were not modified; the `/my-career` Passport
  entry point remains the handoff point for that stream.

Rollback: revert the single UI file, delete the seeded job row and the
synthetic membership row. No schema to roll back.
