# Unified Account & Professional Identity — Release A

## Product change

CQrityjob now follows one account model:

**One person → one account → one professional identity → multiple authorised contexts.**

Candidate and employer access no longer require separate authentication identities. Organisation capabilities still derive from valid organisation membership, roles and RLS; intent is never treated as a role.

## Included

- Unified public `/login` and `/signup`
- Legacy candidate/employer auth routes preserved as redirects
- Canonical Professional Identity integration around `security_career_profiles`
- Premium personal account shell and context-aware navigation
- Unified personal dashboard / My Career overview
- Professional Profile destination
- Career Card promoted to a first-class destination
- CV readiness, source-bundle and generation architecture
- `cv_documents` schema migration
- CV privacy/RLS tests
- Backwards-compatibility guards and updated architecture ADR

## Not included yet

Persistent saved CV documents are intentionally deferred to Release B.

The repository's schema-first release policy requires the `cv_documents` schema to be applied and recorded as applied before application code may query or write that table.

## Release B

After the migration is applied, Release B adds:

- create saved CV
- review/edit presentation
- save
- leave and return
- reopen
- safe regeneration as a proposal
- explicit acceptance
- export from saved state

## Regulatory source check

`regulatory-sources:check` is classified as:

**PRE-EXISTING EXTERNAL DRIFT / NON-REGRESSION**

The same seven-source failure set was reproduced on the exact base SHA and on this branch. The monitor script and baseline are byte-identical; this PR does not modify the regulatory baseline.

## Security and trust boundaries

- Professional Profile remains self-reported professional data.
- Security Passport verification remains separate and cannot be minted by profile editing.
- Career Discovery results remain historical/versioned assessment data.
- Career Card is presentation/derived data, not a competing canonical profile.
- CV schema is private by default and protected by RLS.
- Organisation access remains membership- and policy-derived.

## Release order

1. Merge Release A.
2. Apply `supabase/migrations/20261010090000_cv_documents.sql`.
3. Verify RLS/policies and record the migration as `applied` with evidence in `supabase/release-state.json`.
4. Rebase/refresh Release B against latest `main`.
5. Require schema-first gate and full CI to pass before Release B review.
