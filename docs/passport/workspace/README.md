# Security Passport — the workspace, before and after (PR #196)

Full-page screenshots of `/passport` for a signed-in holder whose first run
is over. Both sides were photographed against the **same fixtures** through
the same stub the browser suite uses (`e2e/passport-workspace.spec.ts`), so
the only difference in any pair is the code.

`before-*` is `main` at `a7324c3` (the merge of PR #195). `after-*` is this
branch.

| state | what it holds |
| --- | --- |
| `just-added` | one self-reported employment — the state a holder is in the moment the first run ends |
| `mixed` | a documented credential, a source-confirmed employment, an open review, a reviewer's question, a draft, an archived credential and a second employment |
| `clarification` | one credential with a reviewer's question against it |
| `review-read-failed` | the same rows as `mixed`, with `listMyVerificationRequests` returning 500 |

Each is captured at 1440 px and 375 px, in Swedish and in English.
`just-added` is 1440 only.

## What to look at

**`review-read-failed`** is the one to read first. On `before-*` the whole
Passport is replaced by "Vi kunde inte hämta ditt Security Passport" — the
verification read shared a `Promise.all` with the Passport read, so failing
it took the intact record down with it.

On `after-*` the merits render, the two review-derived figures read
"Kunde inte läsas" rather than a number, and the merits whose standing
depends on that read sit under **Granskningsstatus kunde inte läsas** rather
than among the ordinary registered ones. A credential CQrityjob reviewed
still reads **Dokumenterad**, because that is a function of stored
provenance and not of the request table.

**`mixed`** shows the structure: one status band, one recommended step, one
merits list grouped by what each merit needs, three uses of a Passport.
`before-*` is the same data as eleven stacked panels with the page title a
third of the way down.

## Regenerating

The images are produced by a throwaway harness against a dev server; the
committed browser evidence is the spec. To regenerate, run the dev server
and point the spec's `PASSPORT_SHOTS` at this directory:

```
PASSPORT_SHOTS=docs/passport/workspace PASSPORT_SHOTS_TAG=after \
  E2E_BASE_URL=http://127.0.0.1:3100 bun run e2e:workspace
```
