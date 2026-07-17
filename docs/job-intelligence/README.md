# Job Intelligence

Job Intelligence is the product capability behind the public "Jobs" surface
of CQrityjob — the Security Career Marketplace. This directory documents
its data model, guardrails, and delivery phases.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| A | Foundation, schema, RLS, feature flag, rollback docs | Delivered |
| B | Admin moderation | Not started |
| C | Public Jobs discovery (landing, search, filters, listings) | Not started |
| D | Job detail experience | Not started |
| E | Candidate personal relevance | Not started |
| F | Launch hardening (SEO, a11y, analytics, security review) | Not started |

## Feature flag

`VITE_JOBS_ENABLED` is a **release-control flag only**. It controls whether
the public Jobs experience (Phases C+) renders. It is NOT a security
boundary. Database RLS and server-side authorisation remain effective
regardless of the flag's value.

- Default in all environments (Phase A): `false`.
- With the flag off, `/jobs` continues to show the "Coming soon" page.
- With the flag on, the public surface renders but every access rule still
  applies (drafts hidden, admin metadata hidden, saved-jobs owner-only,
  etc.).

## Frozen surfaces

Job Intelligence does not modify:
- the Career Intelligence Engine (`src/lib/career-intelligence-engine/*`),
- assessment questions, mappings, or scoring,
- the Career Intelligence Graph taxonomy (`src/lib/career-center/*`,
  `src/lib/knowledge-graph/*`, `cig_*` tables).

See `schema.md` for the data model and access rules, and `rollback.md` for
how to revert Phase A.
