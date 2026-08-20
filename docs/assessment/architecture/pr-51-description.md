# Employer self-service assessment lifecycle

**NO MERGE — NO DEPLOY — NO LOVABLE PUBLICATION.** Draft for review only.

## 1. Problem

Reviewing a participant's response was gated on `scp_can_author`:

    is_platform_admin OR content_role IN (editor, reviewer, publisher)

`scp_content_roles` has no `employer_id`, so the capability was global by
construction. Measured before this branch: an owner of one employer, holding
platform admin, saw **66 pending review items belonging to a different tenant**,
including `response_text` and that tenant's name. Platform-wide, exactly three
accounts could review anything and **two were CQrityjob platform administrators**.
No employer could finish its own competence-development cycle without the
platform operator doing the reviewing.

Separately, a completed assessment was not coherently reachable afterwards. The
employer workspace, the person's profile and the participant's own account each
answered "where is this?" differently, or not at all: there was no employer
person route, no participant history, and `scored` was a dead state that nobody
was told about.

## 2. Solution

- **Employer-scoped response reviewer** (`scp_employer_reviewers`), granted and
  revoked by the employer, scoped by use case.
- **Separation of duties in the database**, stricter for recruitment: never the
  participant, never whoever assigned it, and for recruitment never anyone in
  that candidate's hiring chain.
- **Identity spine**: `employees.subject_id -> scp_subjects`. The employment
  record points at the professional identity rather than at an email string.
- **One lifecycle derivation** (`scp_attempt_lifecycle_state`) with three
  projections: employer pipeline, person history, participant history.
- **Employer assessment pipeline**, **person detail route**, **participant
  history**, **reviewer workload**, **dashboard Tester metrics**, all reading the
  governed model.
- Recruitment/workforce contexts preserved; no second person or result model.

## 3. SaaS outcome

The normal workforce assessment journey — authorise a reviewer, assign, complete,
review, score, release, read the result — runs end to end **without CQrityjob
platform-admin intervention**. Proven by an automated E2E asserting that no
participant in the journey is a platform admin or content-role holder.

## 4. Security and privacy

- Tenant isolation, including one human employed by two organisations.
- Reviewer sees a pseudonymous reference, the item and the response; no name, no
  address. `identity_resolvable` still gates disclosure on release.
- Employer and participant report audiences never cross, asserted both ways.
- Content author is no longer a customer response reviewer.
- Platform-admin break-glass remains possible, is excluded from the routine
  queue, and is recorded on the review row.

## 5. Testing

Product Owner acceptance test: **PASS**. 1311 DB assertions (100 new), clean
replay, upgrade replay, rollback round trip, migration policy, typecheck,
production build, sv/en parity. Two-tenant proof throughout. Rendered
verification on desktop and at 375px in both languages, including a review
completed through the UI and a release performed through the UI.

## 6. Known limitation

Recruitment cannot be exercised end to end: no assessment version is currently
`published` + operationally validated, so the assign guard refuses recruitment on
closed-test content. **That is correct governance, not a defect — do not weaken
the guard.** The recruitment separation-of-duties rules are covered at function
level instead.

## 7. Status

**NO MERGE. NO DEPLOY. NO LOVABLE PUBLICATION.**
