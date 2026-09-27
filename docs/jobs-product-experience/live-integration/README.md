# Real local application and employer preview evidence

Verified 2026-09-27 against the running implementation on `127.0.0.1:3101` and an isolated Supabase API on `127.0.0.1:58921`. All people, companies, jobs and CV content are synthetic. Existing local stacks and hosted databases were not written to.

- **10/10 routed browser tests passed** on desktop and 375px: database-backed search, direct advertisements, related jobs, back navigation, Swedish/English, and real password sign-in returning to the same ad with the application dialog automatically opened.
- **Real submission passed** through the browser, GoTrue, the application server function, PostgREST/RLS, and private Storage: upload PDF, consent, submit, confirmation, exact application link, saved application, and existing-application state after returning to the ad.
- **Database read-back passed:** exactly one `submitted` application, its `upload` CV in the private bucket, and exactly one automatic receipt with in-app status `sent` and email status `not_configured`. No outbound mail provider was configured, so email sending was not exercised or claimed.
- **Employer preview passed** through a real isolated employer membership: public and preview title, company name and requirement text match; the preview uses the same employer presentation and missing-description fallback. The preview screenshot was visually inspected.

## Artifacts

- [Application confirmation](real-application-confirmation.png)
- [Saved application](real-saved-application.png)
- [Employer preview](real-employer-preview.png)
- [Application proof](application-proof.json)
- [Database read-back](persistence-proof.txt)
- [Navigation log](navigation.log), [submission log](submission.log), [preview log](preview.log)

## Reproducing

The `job-back-navigation-evidence.yml` workflow now runs the existing desktop/mobile navigation suite, then the application and employer-preview suite once in Chromium. Its fresh loopback stack replays repository migrations, seeds `job-back-navigation-fixture.sql` followed by `jobs-application-proof-fixture.sql`, and rejects skipped tests. `jobs-application-proof-verify.sql` additionally verifies the actual persisted row, PDF and receipt. The submission test intentionally requires a fresh fixture: duplicate prevention must not be bypassed to rerun a submission.

For this local run, new Docker containers, volumes and network named `jobs-ux-proof` used the existing local test-service images. A schema-only copy of the local recruitment test database supplied the application schema, with the auth schema-version ledger and no existing user data. Ownership restoration used the local database administrator; existing extension objects and an unrelated private-schema dependency required setup corrections. The repository's synthetic fixtures then supplied the single candidate and three jobs. This is real flow evidence against that isolated schema, **not a claim of a fresh local full migration replay**; CI performs the fresh replay.

Local services are limited to the proof stack. The app process explicitly overrides Supabase bindings to loopback and disables email provider credentials. No schema change is included in this PR.
