# Security Work visibility

## Verified starting point

The application work starts from `e54bfe9` on `main`, which includes PR #288.
At that revision, `/security-work` and its authenticated personal-workspace
onboarding exist. The signed-in primary navigation still contains only:

Overview · Security Passport · CV · Jobs · Career · Tests & development.

Security Work is reachable from the account/workspace switch in AccountMenu,
the mobile SiteHeader account area and EmployerAppShell. It is absent from
`CANDIDATE_APP_NAV`, the shared definition used by the desktop and mobile main
navigation. This is a verified code-level discoverability problem: a user
looking immediately after Passport cannot find it in that menu. Employer
registration is not a prerequisite for the personal Security Work route.

## Owner-authorized change

The current delivery adds My Security Work / Mitt säkerhetsarbete immediately
after Passport in that shared navigation definition. Its destination remains
`/security-work`, including for a signed-in person without a workspace. The
route continues to enforce identity and workspace membership; the visible link
grants no additional access. The former six-item canon is explicitly replaced
with seven items in its existing checks and mutation controls.

The application navigation uses the desktop layout from 1280px; narrower
viewports use the same seven entries in the mobile menu. The public site's
navigation retains its existing breakpoint and destinations.

The Security Work overview reuses the career overview's presentational Group
component, spacing, typography and row composition. Its data is read only from
the current Security Work workspace. It does not join career, employer or
Passport relationships to derive authorization.

## Fresh public asset check, 25 September 2026

A read-only HTTPS check now serves `/assets/index-DXfpbkpq.js`, SHA-256
`9f7866de7d03e43ed529ee8b5791db292ab67709969a281c53cf3375e6ae4212`.
Unlike the dated observation below, its actual shared navigation contains
`overview, passport, security-work, cv, jobs, career, assessments` in that order.
Its route definitions include Security Work analysis list/detail routes.

This establishes that a newer public frontend contains the navigation and
analysis entry points. It does **not** map the asset to a Git commit or verify an
authenticated customer's session, server settings, processor endpoint or live AI.
The post-#291 branch additions still need their own release decision. No sign-in,
customer-record access, upload or deployment was performed for this observation.
Use the [customer pilot guide](customer-pilot-guide.md) only after its operator
prerequisites and data-processing decisions have been met.

## Historical deployed frontend check, 24 September 2026

Canonical public origin recorded in the application:
`https://trust-path-recruitment.lovable.app`.
Expected entry after deployment:
`https://trust-path-recruitment.lovable.app/security-work`.

The initial audit could not reach the public origin. A fresh read-only HTTPS
check on 24 September 2026 after #289 merged now succeeded. The observed HTML
references `/assets/index-YY6hPNuF.js`; the fetched 468,572-byte bundle has SHA-256
`133f826cecd87050e70747108ff56a3bb50a8f18fdf368059740df1ec1adfbd8`.
This is an observed **asset version**, not a mapped Git commit.

Its actual candidate navigation array contains these six keys in order:
`overview, passport, cv, jobs, career, assessments`. The array has no
`security-work` entry. Its route manifest includes the earlier Security Work
workspace but not the new analysis routes from #290. Thus the publicly served
code still carries the old navigation and does not contain this analysis
delivery. This is stronger evidence than assuming the published build follows
main, but it is not a signed-in browser acceptance test.

No production credentials were collected, no customer records read, no form
submitted, and no deployment performed. The HTML itself is dynamic and its
digest is not used as a stable release identity. Local browser verification
and CI exercise #290 independently of the published build.

Before publishing, verify the actual preview/published asset version and the
seven-entry menu in a real signed-in desktop and mobile session. Record the
observed commit or asset digest separately from the GitHub merge SHA. Merging
and publication remain owner-controlled, and application changes that depend
on the analysis schema must wait for its verified application.
