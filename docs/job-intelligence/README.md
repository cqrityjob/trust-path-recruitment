 C — Public Jobs discovery.*Not started# Job Intelligence
 C — Public Jobs discovery.*Not started
 C — Public Jobs discovery.*Not startedJob Intelligence is the product capability behind the public "Jobs" surface
 C — Public Jobs discovery.*Not startedof CQrityjob — the Security Career Marketplace. This directory documents
 C — Public Jobs discovery.*Not startedits data model, guardrails, and delivery phases.
 C — Public Jobs discovery.*Not started
 C — Public Jobs discovery.*Not started## Phase status
 C — Public Jobs discovery.*Not started
 C — Public Jobs discovery.*Not started| Phase | Scope | Status |
 C — Public Jobs discovery.*Not started|---|---|---|
 C — Public Jobs discovery.*Not started| A | Foundation, schema, RLS, feature flag, rollback docs | Delivered |
 C — Public Jobs discovery.*Not started| B | Admin moderation (MVP: internal console) | Delivered |
 C — Public Jobs discovery.*Not started| C | Public Jobs discovery (landing, search, filters, listings) | Not started |
 C — Public Jobs discovery.*Not started| D | Job detail experience | Not started |
 C — Public Jobs discovery.*Not started| E | Candidate personal relevance | Not started |
 C — Public Jobs discovery.*Not started| F | Launch hardening (SEO, a11y, analytics, security review) | Not started |
 C — Public Jobs discovery.*Not started
 C — Public Jobs discovery.*Not started## Feature flag
 C — Public Jobs discovery.*Not started
 C — Public Jobs discovery.*Not started`VITE_JOBS_ENABLED` is a **release-control flag only**. It controls whether
 C — Public Jobs discovery.*Not startedthe public Jobs experience (Phases C+) renders. It is NOT a security
 C — Public Jobs discovery.*Not startedboundary. Database RLS and server-side authorisation remain effective
 C — Public Jobs discovery.*Not startedregardless of the flag's value.
 C — Public Jobs discovery.*Not started
 C — Public Jobs discovery.*Not started- Default in all environments (Phase A): `false`.
 C — Public Jobs discovery.*Not started- With the flag off, `/jobs` continues to show the "Coming soon" page.
 C — Public Jobs discovery.*Not started- With the flag on, the public surface renders but every access rule still
 C — Public Jobs discovery.*Not started  applies (drafts hidden, admin metadata hidden, saved-jobs owner-only,
 C — Public Jobs discovery.*Not started  etc.).
 C — Public Jobs discovery.*Not started
 C — Public Jobs discovery.*Not started## Frozen surfaces
 C — Public Jobs discovery.*Not started
 C — Public Jobs discovery.*Not startedJob Intelligence does not modify:
 C — Public Jobs discovery.*Not started- the Career Intelligence Engine (`src/lib/career-intelligence-engine/*`),
 C — Public Jobs discovery.*Not started- assessment questions, mappings, or scoring,
 C — Public Jobs discovery.*Not started- the Career Intelligence Graph taxonomy (`src/lib/career-center/*`,
 C — Public Jobs discovery.*Not started  `src/lib/knowledge-graph/*`, `cig_*` tables).
 C — Public Jobs discovery.*Not started
 C — Public Jobs discovery.*Not startedSee `schema.md` for the data model and access rules, and `rollback.md` for
 C — Public Jobs discovery.*Not startedhow to revert Phase A.
