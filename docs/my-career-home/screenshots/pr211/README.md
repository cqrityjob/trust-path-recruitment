# PR #211 — visual evidence

Every image here is a screenshot of the **real routed application** running
in a browser against stubbed backends: synthetic fixtures, invented people
and invented companies, no database and no hosted project. There are no
component-only renders and no mockups — the point of this evidence is the
real visual hierarchy, which a component photographed on its own does not
have.

Reproduce with a dev server on port 3100:

```bash
bun run dev -- --port 3100 --strictPort
```

then

```bash
E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/my-career-hub-screens.spec.ts --project=chromium
```

`e2e/my-career-hub-screens.spec.ts` writes the hub images; the CV and
sharing sets come from the suites that already own those screens:

```bash
CV_SHOTS=docs/my-career-home/screenshots/pr211/cv E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/cv-screens.spec.ts --project=chromium
PASSPORT_SHOTS=docs/my-career-home/screenshots/pr211/sharing PASSPORT_SHOTS_TAG=pr211 E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/passport-sharing.spec.ts --project=chromium
```

## The correction

| | file | what it shows |
|---|---|---|
| **Before** | `00-before-1440-sv.png` | /my-career at 0d697ea. **2838px tall at 1440.** Nine stacked sections. The CV is 1425px down, inside a list called "Karriärverktyg". Sharing is not on the page at all. |
| **Before** | `00-before-375-sv.png` | The same page at 375. |
| **After** | `01-hub-1440-sv.png` | The hub, every area occupied. **1455px.** Six named areas in the strip, the #190 next step and Passport figures unchanged above the fold, four status modules below. |
| **After** | `01-hub-1440-en.png` | The same, in English. |
| **After** | `03-hub-375-sv.png` / `03-hub-375-en.png` | 375px. The strip wraps to two rows; every area stays visible; no horizontal overflow. |

## The states

| file | state |
|---|---|
| `05-new-candidate-1440-sv.png` | A brand-new account. Four empty modules, four different sentences, four live invitations, and not one failure state. |
| `06-new-candidate-375-sv.png` | The same at 375. |
| `07-first-merit-1440-sv.png` | The moment after the first save. One merit, counted honestly: 1 registered, 0 source-confirmed. |
| `08-unavailable-1440-sv.png` | Two reads failed. Those two modules say so and offer a retry; the other two are untouched. Neither failed module says "you have none". |
| `09-passport-first-merit-1440-sv.png` | The Passport itself with that first merit. |
| `10-cv-list-1440-sv.png` | The CV area, reached by clicking the strip. Note "CV" marked current. |
| `12-applications-1440-sv.png` | Applications, reached the same way, "Ansökningar" current. |

## CV (`cv/`)

The full CV journey at 1440, 375 and at 200% browser zoom, in both
languages: `*-1-creator`, `*-2-preview`, `*-3-saved` (readback after save),
`*-4-drift` (the saved document disagreeing with the profile) and
`*-5-print` (the export view). `sv-1440-0-list-empty` and `sv-1440-0-list`
are the CV list before and after a document exists.

## Sharing and the recipient (`sharing/`)

| file | what it shows |
|---|---|
| `pr211-share-select-sv.png` / `-en.png` | Choosing which merits leave the Passport. Nothing is preselected. |
| `pr211-share-preview-sv.png` | The holder's preview — rendered by the same component and the same database function the recipient page uses. |
| `pr211-share-created-sv.png` | The created link, its expiry, and the way back. |
| `pr211-recipient-sv.png` / `-en.png` / `-375.png` | The recipient's view through the #207 private gateway. |
| `pr211-recipient-unavailable.png` | Revoked, expired, never-existed and rate-limited, all rendering identically — the one state that must not distinguish them. |
| `pr211-share-empty-sv.png`, `pr211-share-reissue-sv.png`, `pr211-share-zoom-200.png` | The empty state, re-issuing, and 200% zoom. |

## What is not photographed, and why

Signup and login are not in this set. The redirect behaviour they carry —
`/signup?redirect=/passport` landing in the Passport first run, and the
emailed confirmation link coming back to the same place — is asserted by
scenarios 24, 25 and 26 of `e2e/passport-first-run.spec.ts`, which drive
the real forms. Two of those three had been failing on `main` on an
unstubbed header read and are fixed in this PR.
