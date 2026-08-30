# ADR: One account, one professional identity, several products

**Status:** Accepted (2026-08-30). **Supersedes decisions 1–3 of** `adr-candidate-employer-portal-separation.md`; **reaffirms its decisions 4–8 unchanged.**
**Related:** `adr-candidate-employer-portal-separation.md`, `adr-canonical-professional-profile-and-career-journey.md`, `docs/auth/candidate-employer-portal-spec-v1.md`

## Context

The 2026-07-19 portal-separation ADR settled a question that genuinely needed settling: whether an employer and a candidate are two products with two authentication systems. It answered no — one Supabase Auth identity, one authorisation source of truth — and that answer was right and is not revisited here.

It then went further and decided that the two audiences should also have **separate front doors**: `/candidate/login`, `/candidate/register`, `/employer/login`, `/employer/register`, four public routes, and a header that names two of them. It listed the cost honestly in its own Consequences section:

> a user with both a candidate and an employer identity must explicitly switch portals rather than seeing one merged view (accepted — this is the specific goal, not a limitation of shared auth)

Ten months of product has since made that cost the dominant one. The same human is now routinely a candidate, a Passport holder, an assessment participant, a Career Discovery user, an employee, an organisation member, a recruiter and a reviewer — often several at once. What the separated doors produce for that person is a choice they cannot answer correctly, before they have any information with which to answer it: a recruiter who also holds a Security Passport does not know, standing on the home page, which of two "log in" links is the one that will find their account. Both do. Neither says so.

There is a second, worse effect. Because the doors are named after audiences, the product reads as a bundle of separate systems — Career Discovery, Passport, assessments, jobs, an employer portal — rather than one place where a professional identity lives. That is a description of the software's internal boundaries, and those boundaries are not the user's to learn.

## Decision

1. **CQrityjob presents one account and one professional identity.** A person signs in once and reaches everything they are authorised to reach. Candidate and employer are CONTEXTS within one product, not products.

2. **There is exactly one public login entrance and exactly one public registration entrance:** `/login` and `/signup`. Public navigation offers one "Logga in" and one "Skapa konto" and no audience-specific alternative.

3. **The signed-in product has one shell.** Personal context and any authorised organisation context are reached through one navigation and one account control, and switching between them is a context switch, never a second sign-in.

4. **Registration is minimal, and everything else is progressive.** `/signup` asks for a name, an email address and a password. Anything a specific product needs is asked for by that product when it needs it — the Passport asks for evidence, an application asks for application answers, Career Discovery asks its own questions. Registering on behalf of an organisation is a disclosed, optional section of the one signup form, not a second form.

5. **Every superseded route survives as a compatibility redirect, indefinitely.** `/candidate/login`, `/candidate/register`, `/employer/login`, `/employer/register` and `/auth` are bookmarked, indexed and printed in emails already sent. They resolve to the unified entrance, preserving the validated `redirect` parameter. This is the treatment `/auth` already received in H3.1 and the reasoning is unchanged.

### Reaffirmed without amendment, from the superseded ADR

Its decisions 4 through 8 are the load-bearing half and they are strengthened, not weakened, by this change:

- **4. Shared authentication infrastructure.** One Supabase Auth backend, one `auth.users` identity, one session mechanism. Unifying the doors removes a presentation difference; it creates nothing new to secure.
- **5. Permissions are never derived from portal choice.** What a person may do is re-derived server-side from `employer_memberships` and `is_platform_admin()` on every request.
- **6. Employer access derives exclusively from `employer_memberships`,** through `has_employer_role()` and `employer_is_active_status()`, re-verified per request and never cached or inferred from how somebody arrived.
- **7. Intent is never a role.** This is the decision that makes the present ADR safe to adopt. Because portal intent was *already* nothing but a routing hint, collapsing four doors into one removes a hint and touches no authorisation surface anywhere. Had intent ever been load-bearing, this change would have been a security change; it is not one.
- **8. No separate employer authentication backend.** None existed; none is introduced.

The **extensibility corollary** also stands unchanged: every employer capability remains a nested route under `/employer/$employerSlug/*`, every module reuses the same two authorisation primitives, `employers` stays a thin identity table, and `employer_memberships.role` stays `text` + `CHECK`.

### The context switcher grants nothing

The switcher changes which context the application is presenting. It is not an authorisation mechanism and must never become one:

- It is populated from `listMyEmployerWorkspaces()` — that is, from what row-level security actually returned for this caller. It is not built from a client-side role string, a JWT claim or a cached list.
- Selecting a context changes the route. Every request made afterwards is authorised independently, exactly as before.
- An organisation id appearing in a URL, in `localStorage`, in a query string or in client state grants nothing. `/employer/$employerSlug` re-verifies membership itself, and did so before this ADR.

Hiding a control has never been the boundary in this codebase, and this ADR does not make it one.

## Consequences

**Positive.** A person with two relationships to CQrityjob has one place to sign in and one place to be. The product can be described in one sentence to a customer. Auth copy and validation exist once rather than four times. A new capability arrives inside an existing shell instead of needing a door of its own.

**Negative / accepted.** Audience-specific landing copy is lost from the auth pages — mitigated by keeping it where it belongs, on `/employers` and the marketing surfaces, which is where somebody deciding whether CQrityjob is for them actually is. Four compatibility redirects must be maintained indefinitely. `scripts/header-entry-check.ts` encoded the two-door model and has been rewritten to encode this one; the ambiguity regressions it was originally written to catch (one word, two destinations; a marketing page wearing an action button's clothes) remain asserted.

**Revisit triggers.** If a regulated market ever requires an organisation's users to authenticate through a separate, auditable boundary, decision 2 is revisited explicitly — and only decision 2. If enterprise SSO arrives, it is another way to reach the same identity and the same redirect layer, which decision 7 already anticipated.
