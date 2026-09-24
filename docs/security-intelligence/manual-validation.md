# PR B — executed validation

Executed 2026-09-24 from baseline
`14e25672551657a7cafb67870fb7a28ac47a05c9`. All test users and material are
synthetic, in isolated local databases. Production verification was read-only.

| Check | Executed result |
| --- | --- |
| Full native PostgreSQL 16 `db:test` | PASS: all 312 migrations, every existing suite, 322 Security Work assertions before and after rollback/reapply, 12 planted defects and 3 connection races. |
| Real caller-scoped service integration | **74 assertions PASS**, real GoTrue/PostgREST/PostgreSQL 17, no service-role application client. |
| New Security Work browser journeys | **6/6 PASS**, Chromium desktop, 375 px and 390 px, each in SV and EN; no skips/retries. |
| Browser evidence gate | **9/9 controls PASS**, including eight deliberately invalid or unsafe evidence packages rejected. All 24 actual screenshots and manifest pass the strict shared leak scan. |
| Existing source negative controls | **48 suites / 1,423 mutations PASS** at `dc47673` and `dcfad72`; every file restored byte-for-byte and working tree clean. Final-head CI repeats the controls. |
| Application / script TypeScript | Both PASS. |
| Production build | PASS. |
| Full lint comparison | Exact baseline **942 errors / 78 warnings**; branch **942 / 84**. Zero new errors, six new `react-refresh/only-export-components` warnings in mixed context/UI helper modules. Full lint is not green; unrelated `.claude` worktrees excluded from both comparison scope and claims. |
| Release guards | Release parity, empty deploy plan, release frontier and schema-first PASS. |

The initial CI run exposed one stale homepage guard: its destination allowlist
also scans authenticated header links and did not yet recognize the new real
`/security-work` route. The guard now checks that route's backing file and adds
SV/EN assertions that the public homepage content still has no Security Work
entry. Both homepage and employer landing guards pass locally; no public page
content or test strictness was removed to resolve the failure.

A subsequent CI run exposed a test-stack startup race: the anonymous RPC
permission response arrived before PostgREST had loaded the new table routes
(`PGRST205`). Startup now logs in a synthetic ordinary user and requires exact
HTTP 200 / `[]` reads of all 16 tables before any test starts. Only a missing
schema-cache route or the exact local JWT issued-at clock-boundary response can
wait within the bounded readiness window; unexpected responses fail immediately.
No failed assertion or product mutation is retried, and no RLS grant changes.
Temporary readiness credentials are private and removed on success or failure.
A fresh 312-migration replay passed the new 16-table readiness gate and all
74 unchanged service assertions; the owned stack was then stopped.

Service assertions cover concurrent/idempotent onboarding, profile persistence,
version conflicts, read-only viewers, unrelated users, revoked membership,
direct Data API access, cross-workspace references, immutable facts and human
audit history. They also cover request UUID reuse across different sources,
partial-save recovery, 51-record pagination, paused sources, reference deletion
before/after original commit, UTF-8 limits and a real logout/new login.

Each browser journey performs the actual UI login and personal bootstrap,
optional profile save/resume, question/source registration, preview, original
save, rationale and state transitions, history, reload and new login. It checks
keyboard focus, pending/save behavior, empty and error states, mobile overflow,
a conflicting human decision with draft preservation, a recovered original,
owner-B direct URL/server-function/Data-API denial, viewer writes and revoked
access. Credential-bearing URLs and whitespace-only originals are rejected
before preview. A real TCP canary observes zero automatic connections to the
reference URL, and HTML-like source text remains literal.

The local evidence run is `1790225870-56260`; its manifest truthfully records
`workingTreeDirty: true` because capture preceded the implementation commit.
The screenshots therefore document this local working tree, not an invented
final commit. CI reruns the new service/browser checks on the PR commit and
publishes all 24 images with final-run hashes and provenance. Four unmodified
examples are committed here; the complete local manifest lists all 24 files,
including the 20 omitted from this compact review selection:

- [Swedish desktop inbox and human history](evidence/manual-workspace/chromium-sv-monitoring.png)
- [English desktop registered source](evidence/manual-workspace/chromium-en-sources.png)
- [Swedish 375 px saved profile](evidence/manual-workspace/mobile-375-sv-settings.png)
- [English 390 px original and human history](evidence/manual-workspace/mobile-390-en-monitoring.png)
- [Complete local capture manifest](evidence/manual-workspace/manifest.json)

No authenticated traces, raw browser reports, environment files or tokens are
published. The final PR records its exact head and CI links, including existing
Career, Passport, recruitment and database regression jobs. Local screenshots
alone are not a claim of pilot readiness, hosted deployment or provider testing.
