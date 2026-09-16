# CQrityjob Final UX/UI Product Polish

## Baseline and boundaries

- Work on the current isolated preview branch `edit/edt-ea14b9b0-8155-445e-880f-31ca9276d48d` from accepted main `93906a528cf38a835b0c4e26e7adc36e94afbd7e`.
- Keep the accepted generated Supabase types unchanged.
- Do not modify or apply Supabase schema, migrations, RLS, grants, policies, RPCs, hosted data, auth/redirect rules, feature gates, governed catalogues, assessments, Interview Intelligence, BESKT, or BCP.
- Do not merge, publish, or deploy. The editor Preview is the review surface.
- Preserve Swedish and English parity and existing security/product truth.

## Phase 1 — Homepage and public entry

Refine the first screen to explain CQrityjob immediately as one Security Career Intelligence Platform for individuals and employers.

- Make Security Passport the clearest trust product while preserving Career Discovery as a valid individual path.
- Present one clear candidate action and one secondary employer action without making login dominant.
- Replace the current large embedded sign-in treatment with a calm, compact account entry that keeps the governed `/login` and `/signup` routes unchanged.
- Add a truthful visual Security Passport preview using only generic labels and existing trust states; no fake holder, credential, score, licence, or verification data.
- Preserve the employer strip and connected Discover–Continue lifecycle, while tightening first-screen height and mobile hierarchy.
- Refine `/employers`, shared header, compact menu, footer, `/login`, and `/signup` only where needed for a coherent entry experience.

## Phase 2 — Security Passport

Improve presentation and navigation across the existing Passport journey without changing reads, writes, permissions, or governed content.

- Overview: clearer next action, credential grouping, attention/review visibility, status legend, and empty/loading/error states.
- Add credential: stronger progress and catalogue framing; candidates still choose only approved credentials, issuers, markets, and jurisdictions.
- Credential detail: separate trust state from lifecycle state and make evidence, review, correction, expiry, revocation, and dispute hierarchy easier to scan.
- Preview and sharing: clarify the four-step flow, selected scope, optional fields, expiry, language, private-by-default behavior, revocation, and existing links.
- Recipient view: improve authenticity hierarchy and readability while preserving fail-closed behavior and identical unavailable states.
- Navigation: improve desktop and 375/390px usability while using “Security Passport” exclusively.

Frozen distinctions remain explicit:

- Self-reported
- Evidence submitted
- Document reviewed
- Source verified
- Expired
- Revoked

Document review will never be presented as issuer/source verification.

## Phase 3 — Complete platform UX

Apply the same visual system and next-action clarity to the remaining journeys, in contained batches:

1. Registration, login, role intent, and onboarding
2. Candidate overview, Profile, CV, jobs, and applications
3. Employer onboarding, overview, job creation, and application management
4. Career Center and assessment entry/results presentation
5. Empty, loading, error, and success states
6. Footer, privacy, terms, and GDPR-facing pages

Each batch will reuse existing components and tokens and will not alter authorization, data ownership, scoring, matching, or decision semantics.

## Technical approach

- Reuse the existing Sora/Manrope typography, navy/trust-blue semantic tokens, shared buttons, cards, status components, and focus styles.
- Add small presentation components only where repetition or clarity warrants them.
- Keep route and server-function behavior intact; no package installs.
- Avoid fake product records and generic cybersecurity imagery.
- Keep cards compact, hierarchy strong, touch targets at least 44px, and layouts free of horizontal overflow.
- Add focused deterministic/browser assertions for every corrected defect rather than weakening existing guards.

## Verification and evidence

Before changes, capture baseline screenshots in Preview for the requested pages that are reachable without protected production data. After each phase, capture matching screenshots.

Test at minimum:

- Desktop, tablet, 390px, and 375px
- Swedish and English
- Keyboard focus, landmarks, heading order, accessible names, touch targets, overflow, reduced motion
- Governed redirect destinations and signed-in routing behavior where a safe preview session is available
- Console, hydration, and failed-network signals

Run:

- Type check
- Lint
- Production build
- Public-entry browser suite and deterministic guards
- Passport workspace, sharing, recipient, responsive/accessibility, catalogue, trust-source, and separation checks
- Relevant candidate/employer journey checks for every changed area

## Acceptance criteria

- The homepage immediately answers what CQrityjob is, who it serves, and why Security Passport matters.
- Candidate and employer paths are obvious; login is available but visually subordinate.
- Passport states and sharing controls are understandable without overstating verification.
- New users can distinguish Profile, CV, Security Passport, Career, jobs, and employer workspace, and can see the next recommended action.
- Swedish and English remain aligned; 375px and 390px are first-class layouts.
- No protected logic, hosted Supabase resource, generated type, migration, or security contract changes.
- All changed journeys pass focused checks and visual review.

## Risks and rollback

- **Copy drift:** guard terminology and SV/EN keys together.
- **False trust claims:** reuse existing trust-state presentation and source-of-truth labels.
- **Mobile regressions:** verify fixed viewport evidence before reporting readiness.
- **Protected-flow test limits:** use synthetic/local preview states only; report any journey that cannot be safely exercised.
- **Rollback:** revert the isolated UX branch commits; no database rollback is required because no database change is permitted.

## Delivery

Provide branch and commit SHA, draft PR URL if repository write access permits it, exact changed files and pages, before/after gallery, tests and conclusions, remaining risks, and either `READY FOR OWNER REVIEW` or `FIX REQUIRED`.

Final status will state: **Not merged and not published.**
