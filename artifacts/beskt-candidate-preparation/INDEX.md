# BESKT PR 3 — candidate preparation, browser evidence

Captured at HEAD `b86df352e3f4984b840385dd7a947d1fa90afce6` in 2252 ms, 100 assertions,
0 failures.

## What these captures are

Real Chromium, at 1440x900 and 375x812, loading the markup the product's own
components rendered, with the product's own compiled stylesheet from the
production build. Swedish and English. Every assertion is measured from the
laid-out page: real document width, computed hit-target sizes, a real focus
ring, and the visible text.

## What these captures are NOT

They are not the routed walk, and they do not stand in for one. The full
journey — employer start, candidate notice and acknowledgement, save and
resume, omission and discuss-orally, review and correction, submission,
employer submitted readback, and the denied cross-user and cross-tenant paths
— is walked in a browser by `e2e/beskt-candidate-preparation.spec.ts`
against a real stack, and its captures are in
`artifacts/beskt-candidate-preparation/live/`.

These SUPPLEMENT that walk. They measure layout, hit targets and focus on
markup that needs no database, so they run anywhere — including in CI, where
there is no stack at all. Every transition and refusal is additionally proved
in the database by the 206 assertions in
`supabase/tests/bcp_candidate_preparation_test.sql`.

## Reproduce

```
npm run build
bun run beskt-candidate-preparation-render:check
bun run beskt-candidate-preparation-evidence
```

## Files

- `candidate-notice-en-desktop.png` — `ade309fe86e94e00…`
- `candidate-notice-en-mobile.png` — `8b1e02f0f4a544e0…`
- `candidate-notice-en.html` — `24c146f589ce9e16…`
- `candidate-notice-sv-desktop.png` — `b9297ec5659b4c5e…`
- `candidate-notice-sv-mobile.png` — `afe20f4afa1220b4…`
- `candidate-notice-sv.html` — `d2c531117decd133…`
- `candidate-questions-en-desktop.png` — `94b285cb2fa0d454…`
- `candidate-questions-en-mobile.png` — `19e40999d1f26fcb…`
- `candidate-questions-en.html` — `5df4175bc98cde03…`
- `candidate-questions-sv-desktop.png` — `92132a080057b197…`
- `candidate-questions-sv-mobile.png` — `c382bc8e9acc27aa…`
- `candidate-questions-sv.html` — `a50e812e3061a945…`
- `candidate-review-en-desktop.png` — `ea7dd5a51597fd93…`
- `candidate-review-en-mobile.png` — `4a7a36a3d946e154…`
- `candidate-review-en.html` — `6be640de5a90be84…`
- `candidate-review-sv-desktop.png` — `4c16f72b6ef3d725…`
- `candidate-review-sv-mobile.png` — `60a9594df6928f17…`
- `candidate-review-sv.html` — `7160546ec68b95dc…`
- `candidate-submitted-sv-desktop.png` — `6c205f3f843642db…`
- `candidate-submitted-sv-mobile.png` — `ea1d7a1b9170a2be…`
- `candidate-submitted-sv.html` — `d1a81c7d0fa23968…`
- `styles.css` — `388794e9c7721a0c…`
