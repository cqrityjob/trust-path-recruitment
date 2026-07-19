# ADR: Candidate Portal and Employer Portal Separation

**Status:** Accepted (product/UX decision — no code, migration, or environment change accompanies this ADR)
**Date:** 2026-07-19
**Related:** `docs/auth/candidate-employer-portal-spec-v1.md` (full specification), `docs/job-intelligence/jobs-mvp-v1-spec.md` / `jobs-mvp-v1-data-model.md` (jobs/application layer this sits beneath)

## Context

CQrityjob serves two structurally different users through one application: security-industry candidates taking assessments and applying to jobs, and employers publishing jobs and (eventually) ordering assessments, searching candidates, and managing a recruitment team. Today both are funneled through a single `/auth` page whose copy, fields, and post-login redirect are entirely candidate-oriented ("Ditt konto sparar dina karriärtestresultat säkert...", always landing on `/my-career`), and there is no self-service way for an employer to create a company account at all — company creation is currently a platform-admin-only action. This is confirmed by direct inspection of `src/routes/auth.tsx`, `src/components/site/SiteHeader.tsx`, and the current `employers`/`employer_memberships` RLS policies (both admin-write-only, per Phase G1's own migration comments).

A decision is needed on whether Candidate and Employer are two skins over one login flow, two entirely separate products with separate authentication systems, or something in between — before any further employer-facing UI (job authoring, company onboarding) is built on top of whatever is decided.

## Decision

1. **Candidate Portal and Employer Portal are separate user experiences.** They have distinct entry points, distinct visual/copy framing, and are never presented as one blended product to the end user.
2. **They have separate public login and registration routes** (`/candidate/login`, `/candidate/register`, `/employer/login`, `/employer/register`) — not one shared form with a toggle.
3. **They have separate dashboards and navigation.** `/my-career` and `/employer/$employerSlug` never share a layout, and the site header renders a materially different navigation set depending on which portal context the signed-in user is in.
4. **Authentication infrastructure may be shared.** Both portals authenticate against the same Supabase Auth backend and the same `auth.users` identity — there is no second login system, no second password store, no second session mechanism.
5. **Permissions remain separate and are never derived from portal choice.** Which UI a user sees is a presentation/routing decision; what a user is *allowed to do* is always re-derived server-side from `employer_memberships` (role, status) and `is_platform_admin()` — the same authorization primitives already established in Phase G1.
6. **Employer access derives exclusively from `employer_memberships` and existing database security** (`has_employer_role()`, `employer_is_active_status()`), re-verified on every request, never cached or inferred from how the user arrived at a page.
7. **Portal intent is never a role.** A URL parameter, form selection, or "I am an employer" UI choice controls only which page renders and where a post-login redirect points — it is never read by any RLS policy, trigger, or server function as evidence of permission. Choosing "Employer" during sign-in grants nothing; not choosing it forecloses nothing.
8. **No separate employer authentication backend is required for MVP**, and none is introduced. If a genuine technical limitation of the shared backend is discovered later that this ADR did not anticipate, that is grounds to revisit this decision — it is not assumed away.

### Extensibility corollary (locked alongside the above, not a future amendment)

The Employer Portal is architected from the outset as CQrityjob's future commercial platform — subscriptions, assessment ordering, recruitment projects, candidate search, employer branding, invoices, team management, analytics, and AI recruitment assistants must all be addable later **without revisiting decisions 1–8 above**. Concretely:

- Every current and future employer-facing capability is a nested route under `/employer/$employerSlug/*` (a workspace shell, not a flat page set) — matching how this codebase's file-based router already works, so this requires no change today, only a commitment not to break the pattern later.
- Every future module reuses the same two authorization primitives (`has_employer_role()`, `employer_is_active_status()`) rather than inventing per-module authorization.
- `employers` stays a thin identity/profile table. Billing, subscriptions, branding assets, and analytics each get their own future table keyed by `employer_id`, never new columns bolted directly onto `employers`.
- `employer_memberships.role` stays a `text` + `CHECK` list (this codebase's existing convention over a native Postgres enum) specifically so new roles are one additive migration, not a type change.
- Because portal choice is presentation-only (decision 7), adding an enterprise SSO sign-in method later is just another way to reach the same shared identity and the same redirect layer — it does not require forking the auth backend the candidate side also depends on.

## Consequences

**Positive:** a candidate never sees employer-oriented copy and vice versa; an employer's onboarding, dashboard, and future commercial features can grow independently of the candidate product's own roadmap; security reasoning stays simple because there is exactly one identity system and exactly one authorization source of truth, regardless of how many portal-facing routes exist on top of it; the pattern already proven safe in Phase G1/G2 (route re-verifies membership independently, slug is never authorization) extends unchanged to every new route this decision produces.

**Negative / accepted trade-offs:** two registration forms mean two sets of copy and two sets of validation to maintain (mitigated: both wrap the same underlying auth component, so the duplication is presentational, not logical); a user with both a candidate and an employer identity must explicitly switch portals rather than seeing one merged view (accepted — this is the specific goal, not a limitation of shared auth); `/auth` as a historical entry point must be preserved as a compatibility redirect indefinitely, since it may be bookmarked or indexed (see the spec's route architecture section for its exact behavior going forward).

**Revisit triggers:** if a future requirement genuinely cannot be satisfied by shared Supabase Auth (e.g., a mandated separate compliance boundary for employer credentials), or if the nested-workspace-shell route pattern proves insufficient for a specific future module, this ADR should be revisited explicitly rather than worked around silently.
