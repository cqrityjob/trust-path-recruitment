# Jobs product experience

Implemented from main `f785dd5` (merged PR #306), on `codex/jobs-product-experience`. The open pull-request list was checked before implementation; none were open. No migrations, RLS changes, deployment or merge are part of this change.

## Design decision

The product/UX, visual frontend and independent quality reviews selected the existing Sora headings, navy actions, blue selected state and quiet surfaces. Search comes first: one 1360px page, compact secondary filters and a readable 40/60 list/reader at desktop widths. Mobile uses the canonical standalone advertisement with filter and list-position recovery. The public jobs header has one row; other public pages and the candidate workspace retain their existing header.

The actual current-main page was run before editing. The attachment contained the brief as text; no separate reference image was available. Screenshots below are of the running implementation with an explicitly synthetic, intercepted catalogue, never inserted in a public database. Future fixture deadlines are intentional so the screenshots/tests remain stable.

## Before and after

| Surface        | Before (main)                         | After                                  |
| -------------- | ------------------------------------- | -------------------------------------- |
| Desktop 1440px | [Before](screenshots/before-1440.png) | [After](screenshots/after-sv-1440.png) |
| Mobile 390px   | [Before](screenshots/before-390.png)  | [After](screenshots/after-sv-390.png)  |

Additional reviewed captures: [1280px](screenshots/after-sv-1280.png), [768px](screenshots/after-sv-768.png), [mobile ad](screenshots/detail-sv-390.png), [English desktop](screenshots/after-en-1440.png), [English mobile](screenshots/after-en-390.png). English captures for all four widths are included in the same folder.

## Behavior

- Keyword, location, database filters, sorting, result page and selected ad have validated URL state. User actions create history entries. Selection does not re-fetch the whole list. Paging reads 20 results plus one lookahead; the UI never presents a truncated page length as a global total.
- Selected cards keep keyboard focus; the independent desktop reader is keyboard-scrollable. Mobile uses canonical ad links and restores the explicit return-to-results position and focus. Browser back/forward uses the router's existing restoration.
- Employer identity, broken/missing logo fallback, advertisement prose and structured vacancy requirements are shared with the employer's draft preview, including unsaved requirement edits.
- Existing application methods stay distinct. Login/signup carries the application intent and reopens the same form. Already-submitted applications link to their saved application. Successful submission links to the exact saved application. Passport sharing remains optional and explicit; receipt delivery logic is unchanged.
- Search results explicitly filter published/current dates even when an employer/admin's broader read policy applies. Database permissions remain authoritative. Removed or RLS-hidden closed advertisements are described as unavailable; an accessible expired detail disables applying.
- No public company profile route exists in this repository. The employer presentation therefore uses the employer's valid website and genuine published jobs from that employer. No new public-company route, saved-job feature, match score or paid service was invented.

## Review locally

```sh
bun install --frozen-lockfile
VITE_JOBS_ENABLED=true bun run dev -- --host 127.0.0.1 --port 3100 --strictPort
```

Open `http://127.0.0.1:3100/jobs`. Use the project's existing environment configuration for public backend reads. The release flag is set for this local process only, not changed in source or hosted configuration.

```sh
E2E_BASE_URL=http://127.0.0.1:3100 bun run e2e e2e/jobs-product-experience.spec.ts --project=chromium
E2E_BASE_URL=http://127.0.0.1:3100 bun run scripts/jobs-experience-capture.ts
bun run build
bunx tsc --noEmit
bun run job-back-navigation:check
bun run scripts/job-application-continuity-check.ts
bun run scripts/job-vacancy-requirements-check.tsx
```

The browser suite intercepts the backend and refuses writes. It proves UI interactions and outgoing database-query parameters, not Postgres authorization, persistence or email delivery. Real Auth, database, Storage, receipt and employer-preview evidence is recorded in [the local integration report](live-integration/README.md).

## Verification

- Production build, application TypeScript, scripts TypeScript and scoped ESLint passed (only the pre-existing Fast Refresh export warnings).
- **19/19 new browser scenarios passed**, covering search/filter/sort/history, permalink/mobile return, keyboard focus, bilingual responsive layouts, stale pagination, empty/error/closed/removed states, employer links and broken logos.
- Existing content, employer form/lifecycle, navigation, header, CV-source/privacy, application-dialog scrolling and notification checks passed.
- **88/88 existing homepage and candidate-header browser regressions passed.**
- **12/12 real local browser checks passed:** 10 navigation/authentication checks, one full application submission and one employer-preview comparison. Database read-back verified the private PDF, saved application and automatic in-app receipt. See [the integration report](live-integration/README.md).
- CI runs the new browser suite in the existing public-entry browser job and runs the application-continuity and shared-requirements checks alongside the existing job-navigation check. The existing real local-stack job-navigation workflow is retained, adapted to the split reader and extended with a no-skips application/preview proof and SQL persistence checks.

## Practical limits

Already-applied detection uses the existing 200-row application-history endpoint; server duplicate protection remains authoritative beyond that window. A closed/removed job can be indistinguishable under public RLS, so unavailable copy does not claim which event occurred. Email provider delivery is outside a browser-only UI test; the existing receipt status remains visible through the existing application journey.
