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

## Deployed frontend status

Canonical public origin recorded in the application:
`https://trust-path-recruitment.lovable.app`.
Expected entry after deployment:
`https://trust-path-recruitment.lovable.app/security-work`.

No deployed commit or frontend asset version has been verified in this audit.
The browser inventory exposed no browser tabs; the native Chrome read stalled
and was cancelled without a successful page observation. No credentials were
collected, no production form was submitted, and no deployment was performed.
A stale deployment must therefore not be presented as an established cause.

Before publishing, verify the actual preview/published asset version and the
seven-entry menu in a real signed-in desktop and mobile session. Record the
observed commit or asset digest separately from the GitHub merge SHA. Merging
and publication remain owner-controlled, and application changes that depend
on the analysis schema must wait for its verified application.
