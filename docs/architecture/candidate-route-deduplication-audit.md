# Candidate route and navigation de-duplication audit

Baseline: `origin/main` `7e338f2a43fbfe91b2c26228f04d7b3487d67d61` (merge of PR #242).

This is the inventory the owner's five-page architecture is decided from. It is
written before the routing change so that every retirement below is a decision
with a reason, not a deletion. Nothing here deletes candidate data: every
disposition is canonical, redirect, contextual, hidden-for-pilot or retired.

## 1. The five canonical destinations

The owner's sketches define the candidate's primary navigation by their
underlined item. Those five, and only those five:

| # | Label (sv / en) | Canonical route | Sketch |
| --- | --- | --- | --- |
| 1 | `Översikt` / `Overview` | `/my-career` | candidate overview sketch |
| 2 | `Security Passport` | `/passport` | sketch 2 |
| 3 | `Jobb` / `Jobs` | `/jobs` | sketch 3 |
| 4 | `Karriär` / `Career` | `/career-center` | sketch 4 |
| 5 | `Tester & utveckling` / `Tests & Development` | `/academy` | sketch 5 |

**The route path `/my-career` is kept and the visible label becomes `Översikt`.**
The owner's rule is about the label the candidate reads, and §3 of the brief
allows the internal route to stay where changing it would create needless risk.
`/my-career` is the parent of seven shipped child routes, is linked from the
account menu, the header, the employer-side candidate views and the e2e suites,
and is bookmarked by pilot users. Renaming the path buys nothing the label does
not already buy and breaks all of that. The URL is an implementation detail; the
label is the product.

## 2. Candidate route inventory, with disposition

### 2.1 Overview / My Career

| Route | Today | Disposition |
| --- | --- | --- |
| `/my-career` (index) | the candidate home | **canonical** — Overview |
| `/my-career` (layout) | shell + `MyCareerHubNav` section strip | **canonical shell**, strip retired (§3) |
| `/my-career/profile` | edit profile / my details | **contextual** — reached from Overview identity block |
| `/my-career/cv`, `/cv/new`, `/cv/$cvId`, `/cv` (layout) | the CV | **contextual** — from Overview and Jobs, never primary nav |
| `/my-career/applications` | my applications | **contextual** — belongs to Jobs (sketch 3) |
| `/my-career/reports/$runId` | saved Career Discovery report | **contextual** — belongs to Career (sketch 4) |
| `/my-career/career-card` | Career Card | **hidden for pilot** (§4) |
| `/my-career/interviews/$caseId` | candidate interview view | **contextual** — from applications |
| `/my-career/preparation/$assignmentId` | BESKT candidate preparation | **contextual** — from Tests & Development |

### 2.2 Security Passport

| Route | Disposition |
| --- | --- |
| `/passport` (index, layout) | **canonical** — destination 2 |
| `/passport/card`, `/information`, `/privacy`, `/share`, `/onboarding`, `/credentials/new`, `/entry/$kind/$entryId` | **canonical children** of the Passport workspace |
| `/passport-attestations` | **not a candidate surface** — employer attestation desk, authorised by `has_employer_role`. Already excluded from the candidate nav by the segment-boundary rule; stays excluded. |
| `/passport-review`, `/reviews` | **not a candidate surface** — reviewer capability, reached from the account menu's workspace switch. |

### 2.3 Career — the duplication that matters most

Career Discovery exists **twice** in the route tree, under two names, each with
a public and an authenticated half:

| Route | Disposition |
| --- | --- |
| `/career-center`, `/career-center/index`, `/career-center/$profession`, `/career-center/start` | **canonical** — destination 4 |
| `/security-career-assessment` + `/_authenticated/security-career-assessment/{session,report/$snapshotId,history}` | **canonical assessment flow** (`CANONICAL_ASSESSMENT_PATH`) |
| `/discovery` + `/_authenticated/discovery/{session,report/$snapshotId,history}` | **redirect** — already an alias of the canonical path; kept so existing links and mid-redirect sessions resolve |
| `/careers` | **public marketing page**, not a candidate app destination |
| `/journey`, `/journey/$targetId` | **canonical career-path destination** — this is what `Hur kommer jag dit?` must reach |
| `/assessment` | public entry; **redirect** to the canonical assessment path |

Career Discovery and Career Analysis are **one** product, reached through
destination 4. They are not a sixth navigation item.

**Refined by sketch 5 (PR C2).** The owner's Tests & Development sketch names
Career Discovery on that page. That is compatible with the rule above, and the
distinction is the one the Passport/profile split already draws: Tests &
Development **may name the analysis and link to it**; it **may not host the run
or offer a second entry into it**. The link is `CANONICAL_ASSESSMENT_PATH`, never
the `/discovery` alias, so it is a pointer at the one product rather than a
second way in with its own history. The earlier wording here — "must not appear
inside Tests & Development" — was too strong: it forbade the pointer as well as
the product.

**Emsoms #1 is not this row.** An earlier revision of this document attached
Emsoms #1 to the `Hur kommer jag dit?` journey link. Emsoms #1 is the universal
public landing-page structure, which belongs to the dedicated public-landing
phase and is untouched by the candidate-workspace PRs.

### 2.4 Jobs

| Route | Disposition |
| --- | --- |
| `/jobs`, `/jobs/index`, `/jobs/$slug`, `/jobs/profession/$professionSlug`, `/jobs/family/$familyId` | **canonical** — destination 3 |
| `/my-career/applications` | **contextual inside Jobs** — the supporting area of sketch 3 |

### 2.5 Tests & Development

| Route | Disposition |
| --- | --- |
| `/academy` (index) | **canonical** — destination 5. Path keeps its historical name; the label is the product name. |
| `/academy/$attemptId`, `/academy/report/$attemptId`, `/academy/learning/$formId`, `/academy/training/$assignmentId[/$moduleVersionId]` | **canonical children** |

Recruitment assessments and competence development are two areas of this one
destination and stay separated in terminology, state and reporting.

### 2.6 Career Card — hidden for pilot

| Surface | Disposition |
| --- | --- |
| `/my-career/career-card` route | **hidden for pilot** — redirects to Overview |
| `View/Show Career Card` controls | **hidden for pilot** |
| `CareerCard.tsx`, `CareerCardCreator.tsx`, card export/SVG libraries | **retained, unreferenced from pilot UI** — no data deleted, no historical record touched |

## 3. The two navigations, and why one goes

The candidate is currently shown **two** navigations at once on every page under
`/my-career`:

1. the global `CANDIDATE_APP_NAV` — five items, the first labelled `Min karriär`
   and pointing at `/my-career`; and
2. the `MY_CAREER_HUB` section strip — six items, the first labelled `Översikt`
   and pointing at **the same `/my-career`**.

That is Emsoms finding #11 (`Översikt` and `Min karriär` duplicate the same
destination) and #13 (repeated upper and lower navigation) in one place: the
same URL is presented as two differently-named destinations, one above the
other. Every remaining entry in the strip is also a destination the global
navigation already owns or that the owner's sketches move elsewhere:

| Strip entry | Where it belongs now |
| --- | --- |
| `overview` → `/my-career` | the global `Översikt` item — literally the same URL |
| `passport` → `/passport` | the global `Security Passport` item |
| `sharing` → `/passport/share` | inside the Passport workspace (sketch 2) |
| `discovery` → canonical assessment | the global `Karriär` item (sketch 4) |
| `applications` → `/my-career/applications` | the Jobs workspace (sketch 3) |
| `cv` → `/my-career/cv` | contextual from Overview and Jobs — explicitly *not* a navigation item |

So the strip is retired whole rather than trimmed. Trimming it would leave a
second navigation system with one or two entries, which is the thing the brief
forbids, and the Overview page already carries in-page access to CV,
applications, career analysis and tests through its existing status grid.

## 4. Active-state corrections

With `Min karriär` becoming `Översikt` and `Karriär` becoming a real
destination, the route ids that light each item change:

| Route id | Lit today | Lit after |
| --- | --- | --- |
| `/_authenticated/discovery/*` | `myCareer` | `career` |
| `/_authenticated/security-career-assessment/*` | `myCareer` | `career` |
| `/security-career-assessment`, `/discovery` | `myCareer` | `career` |
| `/_authenticated/journey/*` | `myCareer` | `career` |
| `/_authenticated/my-career/reports/*` | `myCareer` | `career` |
| `/_authenticated/my-career/applications` | `myCareer` | `jobs` |
| everything else under `/_authenticated/my-career` | `myCareer` | `overview` |

The applications and reports rows are the reason the strip had to go first: with
two navigations present, moving them would have made the two disagree about
where the reader is standing — which is exactly the bug #211 fixed by moving
them the other way. With one navigation there is nothing left to disagree with.

## 5. Retired duplicate labels a guard must keep out

A structural guard fails the build if any of these returns to the candidate
navigation:

- a `Min karriär` navigation label alongside `Översikt`
- two navigation entries resolving to the same destination
- Career Card in the pilot navigation or as a reachable pilot route
- CV as a primary navigation destination
- a second candidate section navigation rendered inside the shell
- a navigation item whose own `to` does not resolve to a real route
- the brand mark linking anywhere but `/`
