# Interview configuration and scenario access

Status: expand (#404), application (#405) and contract (#406) implemented as
separate draft releases; validation is recorded below and in the PRs. No production mutation, merge or deployment. Owner requested implementation
and a separate worktree; Claude coordinates releases through the owner.

Baseline: origin/main d2c02b8a963f512747a45b8add5b7a7ae754d76e (PR #392).

## Reservation — PR #404

1. `20270206090000_interview_access_expand`: add
   `scp_iv_case_capabilities(uuid)` returning only `ai_enabled` and
   `transcript_enabled` after `scp_iv_can_read_case(case_id)` authorisation;
   narrow `scp_scenario_versions_read` to existing platform content authors.
2. Application PR: replace the direct configuration read in
   `getInterviewCase` with the case-bound RPC. No fallback to broad reads.
3. `20270207090000_interview_ai_config_contract`: make full configuration
   and audit metadata platform-admin-only; verify write restrictions.

The owner authorised proceeding after repository checks without another relay.
All remote branches were fetched and inspected and open PRs checked on 2026-10-03:
no 20270206/20270207 collision; #393 adds no schema, #392 is merged.
The reservation is recorded in PR #404. Expand depends on the case access model in
`20270204090000` (itself based on `20270203090000`) and follows #392's
`20270205090000` in canonical ordering. Contract requires the application
change to be published and verified, not merely merged. These are separate
schema/application/contract PRs to preserve the currently deployed interview
screen across the transition. Do not merge or deploy this draft.

## Established callers and access model

- `getInterviewCase` authenticates the caller, reads a case under RLS and stops
  with `INTERVIEW_CASE_NOT_FOUND` if it is unavailable. It currently reads only
  two booleans from `scp_interview_ai_config`, but the underlying table grants
  and unconditional read policy expose every column to every signed-in user.
- `scp_iv_can_read_case` enforces active employer standing, excludes the subject,
  and admits the creator, panel, scoped reviewer, responsible recruiter or
  owner/admin as specified in the existing report access model. Security-vetting
  restrictions additionally narrow this access. Reuse this gate; do not create
  a separate weaker membership check.
- `scp_iv_ai_real_model_permitted()` is an existing internal definer function,
  executable by service_role, with no authenticated/anon EXECUTE. Transcript
  ingestion also reads configuration inside the existing database operation.
  Preserve both enforcement paths and their application checks.
- No application caller of `scp_scenario_versions` was found. Its existing
  author policy uses `scp_can_author(auth.uid())`, meaning platform admin or
  platform content editor/reviewer/publisher. Ordinary employer membership,
  assessment assignment or publication status must not expose this raw table.
- Candidate assessment delivery uses the existing assigned-attempt delivery
  contract and item bank, not direct scenario-table reads. Test that contract
  and its answer-key boundary with synthetic assignments.
- The five `sp_` tables are shared definition/source/issuer/scope/recognition
  catalogues. Their policies remain unchanged; the completed point-in-time
  content review is recorded below.

## Required evidence and release gates

Synthetic anon, candidate, authorised reviewer, unrelated colleague, removed
member, company B, platform author and administrator; direct SQL/PostgREST and
intended application paths; denied writes and missing/cross-company case IDs;
pre-fix negative controls; interview/transcript and assigned-test regression;
full database replay, typecheck, build and CI. Catalogue free-text review must
report its scope and limitations without copying private information.

Read-only production verification is a post-application release gate. It cannot
be marked complete before Claude applies the change. No real candidate data
will be used as test fixtures.

## Catalogue content review, production read-only, 2026-10-03

Reviewed 10 definition versions (including every `note_en`, title and awarding
body), all 14 distinct bilingual validity descriptions across 70 definition
reviews, all 24 distinct source URLs across the 221 organisation-role rows and
70 reviews, all three scope descriptions and the single recognition-rule row.
These contain qualification standards, public regulators/issuers and generic
validity guidance. No internal or personal information was identified in this
review. Organisation UUIDs refer to registry authorities/issuers, not memberships.
Older (`superseded`) qualification standards still describe valid historical
awards; excluding them would be a product regression, not a privacy fix.

The five unchanged broad-read policies are justified shared catalogue access
for the reviewed content. This is a point-in-time content review, not a guarantee
about future free text. No candidate data was read or used as a test fixture.

## Dependency and privilege inventory

Production metadata found no dependent views for either target table. The only
function bodies reading configuration are the internal AI gate and transcript
gate; neither returns the configuration row. No function body reads the raw
scenario table. The app has one config reader, `getInterviewCase`; it checks case
visibility before requesting flags. Its returned object currently uses only
`ai_enabled`; transcript ingestion is still enforced in the database.

Production grants: authenticated SELECT only on the config; no authenticated
INSERT/UPDATE/DELETE. The existing admin UPDATE policy is dormant without its
grant. Contract preserves that no-client-write rule, including platform admins;
trusted owner/service operations remain the existing configuration write path.
The new private helper has a pinned empty search path and checks `auth.uid()` and
`scp_iv_can_read_case` before reading config. The public wrapper is invoker-rights;
PUBLIC/anon execution is explicitly revoked on both. No service client is added
to application code, and a platform admin gains no case bypass from this RPC.

| Principal | Raw scenarios after expand | Full config after contract | Flags for case A |
| --- | --- | --- | --- |
| anon / candidate | denied | denied | denied |
| case A reviewer / creator / panel / responsible recruiter | denied | denied | two flags |
| unrelated colleague / removed member / company B | denied | denied | denied |
| platform content editor/reviewer/publisher | allowed by existing content role | denied | only with separate case authority |
| platform admin | allowed | allowed | only with separate case authority |

Publication status alone never grants raw scenario access. Assigned-attempt
items remain on `scp_get_attempt_items`, which excludes option keys, scores and
rationale. Expand intentionally leaves the old config read until app publication;
it closes only the raw-scenario finding. Both findings are closed only after
contract and read-only hosted verification.

## Local expand evidence

- Strict empty-database replay through 20270206 passed on PostgreSQL 17.
- New SQL suite passed, including restoring the original open policy inside a
  savepoint and proving the candidate can then read all synthetic scenarios.
- Local PostgREST/JWT suite: 224 assertions passed (saved in `evidence/`).
- Typecheck, migrations, release frontier, SQL-security and schema-first checks
  passed. Production application state remains pending.
- Full `db:test` on native macOS stopped in the existing Passport rollback
  control, at `sp_employer_attestation_queue is not the hosted pre-fix body`.
  Unmodified main d2c02b8 reproduced the same failure. The BSD sed command used
  by `pa_plant_fn` captures the rollback postflight after the desired function
  instead of stopping at `END; $function$`. This is not a passing full suite;
  The subsequent GNU-BRE-compatible local run passed in full; see the final
  validation below. No assertion has been removed.

## Review and reproduction

PRs: [expand #404](https://github.com/cqrityjob/trust-path-recruitment/pull/404),
[application #405](https://github.com/cqrityjob/trust-path-recruitment/pull/405),
[contract #406](https://github.com/cqrityjob/trust-path-recruitment/pull/406).
See [reproduce.md](reproduce.md) for local SQL, HTTP and application checks.
The application PR intentionally remains blocked by schema-first while expand
is pending; neither a green schema check nor an app merge proves publication.

## Final local validation, 2026-10-03

Full `scripts/db-test.sh` passed with exit 0 on PostgreSQL 17 at source commit
`f9579d82fe057bb7038a1a94775f7d0c43065cf0`: all 369 migrations replayed strictly,
both new access suites passed, existing interview runtime (85) and integrity
(99) assertions passed, and full historical rollback verification passed.
See [the saved summary](evidence/full-db-summary.txt). CI status is recorded on
the PRs for each head SHA; local success is not labelled as CI success.

HTTP: 224 assertions passed before and after contract. Actual app reader: 8 actor
cases passed in each stage; deterministic reader: 30 assertions passed. Typecheck,
production build, SQL-security, migration policy and affected interview checks
passed. Recruiter workflow: 1,438; finalisation capability: 91; method tenant-read:
117; interview start: 16 assertions. No full browser recruiter journey was run
for this task. Production verification remains pending Claude's ordered rollout
and Astra's independent check.
