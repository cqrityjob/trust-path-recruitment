# Security Passport — the workspace, before and after (PR #196)

Full-page screenshots of `/passport` for a signed-in holder whose first run
is over. Both sides were photographed by **the committed browser suite
itself** (`e2e/passport-workspace.spec.ts`, the "review screenshots" block),
against the same fixtures and the same stub, so the only difference in any
pair is the product code.

`before-*` is `main` at `a7324c3` — the merge of PR #195, and the last commit
before this branch. `after-*` is this branch.

| state | what it holds |
| --- | --- |
| `just-added` | one self-reported employment — the state a holder is in the moment the first run ends |
| `mixed` | a documented credential, a source-confirmed employment, an open review, a reviewer's question, a draft, an archived credential and a second employment |
| `clarification` | one credential with a reviewer's question against it |
| `review-read-failed` | the same rows as `mixed`, with `listMyVerificationRequests` returning 500 |

Widths: 1440, 375, and 720 — which is 1440 at 200% zoom (WCAG 1.4.10),
emulated as the width, which is what a browser actually does. Swedish and
English throughout; `just-added` and the 200% pair are 1440/720 only.

## What to look at

**`review-read-failed`** is the one to read first.

On `before-*` the whole Passport is replaced by "Vi kunde inte hämta ditt
Security Passport" — the verification read shared a `Promise.all` with the
Passport read, so failing it took the intact record down with it.

On `after-*`:

* the merits render;
* the two review-derived figures keep their headings — "Registrerade",
  "Pågående granskningsärenden" — and say "Tillfälligt otillgängligt"
  underneath, rather than being replaced by two identical error headings;
* the merits whose standing depends on that read sit under
  **Granskningsstatus kunde inte läsas**, not among the ordinary current
  ones: one of them may be pending, and the page cannot say it is not;
* a credential CQrityjob reviewed still reads **Dokumenterad**, because that
  is a function of stored provenance and not of the request table;
* the failure is explained **once**, in the recommended-step card, which
  owns the retry.

**`mixed`** shows the structure: one status band, one recommended step, one
merits list grouped by what each merit needs — including **Kräver ditt svar**
for a reviewer's question, which is neither an ordinary current merit nor
something somebody else is handling — and three uses of a Passport.
`before-*` is the same data as eleven stacked panels with the page title a
third of the way down.

Dates read as dates ("2 maj 2024"), not as ISO days.

## Regenerating

Run the dev server, then point the spec's `PASSPORT_SHOTS` at this
directory:

```
PASSPORT_SHOTS=docs/passport/workspace PASSPORT_SHOTS_TAG=after \
  E2E_BASE_URL=http://127.0.0.1:3100 bun run e2e:workspace
```

For the `before-*` side, check the product code out of `main` first
(`git checkout a7324c3 -- src/`), capture with `PASSPORT_SHOTS_TAG=before`,
then restore it (`git checkout HEAD -- src/`). The screenshot block
deliberately makes no assertions and does not wait for the workspace marker,
so it runs against the page this PR replaces as well.
