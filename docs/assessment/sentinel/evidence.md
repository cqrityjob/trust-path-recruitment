# Implementation evidence · 2026-10-06

All writes/test invitations use isolated loopback synthetic fixtures. No hosted migration, release activation, real candidate invitation, merge or deployment was performed. Proposed content approval, privacy/retention decisions and psychometric validation remain pending.

## Verified locally

- Generator: **21,600** deterministic items checked: ten families × 500 numeric seeds × four variants (20,000), plus forty 256-bit string seeds × forty bank items (1,600). Reproduction, forty/twenty/three assembly, broad coverage, difficulty ordering, independent constraints, negative controls for altered keys/rows/geometry/options and symmetry equivalences pass (`bun run sentinel:check`).
- Isolated PostgreSQL 16: full repository migration replay and regression suite (`scripts/db-test.sh`) passes; includes **35** new Sentinel assertions and privilege audit for both new private tables. Shared assignment, cancellation/report policy and existing profession-assessment suites remain in the full regression. Unused-installation rollback is included before legacy assessment rollback.
- Sentinel SQL checks cover disabled release, preview/grants, assignment retry, tenant/candidate isolation, server deadline/start idempotency, accommodation, private payload/table denial, tampered item refusal, generic scorer refusal, stale/duplicate saves, refresh, raw scoring, withholding/release, no competency evidence, late-answer timeout and deletion cascade registration.
- Chromium: complete SV and EN practice → twenty keyboard answers → submission → employer raw report → deliberate candidate release/report; refresh preserves deadline/accepted responses; second browser tab uses the same attempt; a deliberately aborted save shows unsaved state, blocks Next and succeeds after explicit retry; mobile 375px does not overflow. Scored POST responses exclude private explanatory metadata. Existing shared batch UI assigned two synthetic application recipients in the initial rehearsal; reruns reused those assignments. The English assignment language was configured in the disposable fixture to exercise assigned-language precedence.
- Shared regression guards: `send-test-dialog:check` (74), `recruitment-assessment-ux:check` (144), `library-direct-access:check` (16) pass.
- App/script type checks, production build and candidate-bundle private-engine scan pass. No dependencies were added.
- Private offline gallery: forty candidates plus three exercises rendered; mobile no-overflow check passes. Contact sheets inspected for rendering/layout and gross visual defects. This is engineering review, not owner approval or a proof against every alternative rule interpretation.

The local browser harness uses this repository's local authentication substitute with PostgREST/RLS and real PostgreSQL scoring, not hosted GoTrue. Invitation records and shared send receipts were exercised. Real email receipt/delivery was **not** tested; local email transport has no configured external provider. Two simultaneous conflicting saves are represented by stale revision SQL tests; this is not a claim of a browser-scale stress/load test. Blind-candidate equivalence and comprehensive assistive-technology/WCAG certification are not established.

## Reproduce safely

Run generator/type/build guards normally. Use `scripts/db-test.sh` only with a disposable local PostgreSQL as its own safety gate requires. It prepares synthetic private content outside the checkout and deletes the temporary import after applying it. `scripts/fixtures/sentinel-preview.sql` additionally refuses any database except `sentinel_e2e`.

The browser spec requires `E2E_LOCAL_STACK=1`, an explicit `http://127.0.0.1:3127` base, loopback Supabase-compatible gateway on 59231 and the isolated fixture. It is not automatically pointed at `.env`/hosted credentials. Test-only password and accounts are synthetic. Match `VITE_SUPABASE_URL`, server Supabase URL/keys and local gateway; never run this spec against a real project.

Public screenshots in `screenshots/` contain synthetic questions and accounts. The separately prepared proposed form/gallery stays outside the public repository. Do not publish its keys, seeds or solutions in PR attachments or CI artifacts.

CI is triggered only after the draft branch is pushed. The final delivery message records the exact commit and links to its runs; local passes are not a claim that an unobserved remote workflow passed. Release checklist and disable/rollback instructions are in [README.md](README.md); reviewed sources and limits in [sources.md](sources.md).
