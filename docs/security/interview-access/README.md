# Interview configuration and scenario access

Status: design and migration-number coordination only. No migration created,
no production mutation, no merge or deployment. Owner requested implementation
and a separate worktree; Claude coordinates releases through the owner.

Baseline: origin/main d2c02b8a963f512747a45b8add5b7a7ae754d76e (PR #392).

## Proposed reservation — awaiting Claude

1. `20270206090000_interview_access_expand`: add
   `scp_iv_case_capabilities(uuid)` returning only `ai_enabled` and
   `transcript_enabled` after `scp_iv_can_read_case(case_id)` authorisation;
   narrow `scp_scenario_versions_read` to existing platform content authors.
2. Application PR: replace the direct configuration read in
   `getInterviewCase` with the case-bound RPC. No fallback to broad reads.
3. `20270207090000_interview_ai_config_contract`: make full configuration
   and audit metadata platform-admin-only; verify write restrictions.

Both numbers are proposals, not reserved or created yet. The owner will relay
Claude's confirmation. Expand depends on the case access model in
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
  catalogues. Keep their policies unchanged; content review is still pending.

## Required evidence (not yet run)

Synthetic anon, candidate, authorised reviewer, unrelated colleague, removed
member, company B, platform author and administrator; direct SQL/PostgREST and
intended application paths; denied writes and missing/cross-company case IDs;
pre-fix negative controls; interview/transcript and assigned-test regression;
full database replay, typecheck, build and CI. Catalogue free-text review must
report its scope and limitations without copying private information.

Read-only production verification is a post-application release gate. It cannot
be marked complete before Claude applies the change. No real candidate data
will be used as test fixtures.
