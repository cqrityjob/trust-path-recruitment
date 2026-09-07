# Security Passport first run — reviewed visual evidence

Captured from the **real routes** in Chromium against stubbed server functions
(no database), by a temporary Playwright spec. Every image is `fullPage`, so
the whitespace and the footer are what a reader actually gets.

## Files

| File | What it shows |
| ---- | ------------- |
| `sv-desktop-1440-1-create.png` … `-4-done.png` | all four screens, Swedish, 1440 px |
| `sv-mobile-375-1-create.png` … `-4-done.png` | all four screens, Swedish, 375 px |
| `en-desktop-1440-1-create.png` … `-4-done.png` | the English journey, 1440 px (the confirmation is `-4-done`) |
| `state-load-failure.png` | the Passport could not be READ |
| `state-draft-save-failure.png` | "Save and exit" failed; the journey stayed put |
| `state-indeterminate-completion.png` | the write may have landed and the response was lost |
| `state-reconciled-after-retry.png` | the same operation replayed, one merit, confirmed |
| `state-unconfirmed-readback.png` | the write landed and the readback did not answer |

## Measured, not asserted by eye

Measured in the browser at 1440 px, 375 px and at 200 % (a 720 px viewport with
a 32 px root font), on the choose and details screens:

| Property | Result |
| -------- | ------ |
| horizontal overflow | **0 px** at every width, including 200 % |
| touch targets below 44 px | **none** — every button, link, input and select is ≥ 44 px tall, and the declaration checkbox is measured on its whole row |
| `h1` per screen | exactly **1** |
| dominant primary buttons per screen | exactly **1** on details; the choose screen has none by design (the five tiles are the choice) |
| visible focus | `outline: 2px solid`, offset 2 px, on the tile that has focus |
| distance from viewport top to `h1` | 236 px at 1440, 212 px at 375 |
| distance from viewport top to the journey's own root | 121 px at 1440, 105 px at 375 |

## What the evidence changed

Two things were corrected because these captures showed them.

**Vertical whitespace.** `Section` is `py-20 md:py-28`, which is right for a
marketing page and wrong for a four-field form: it pushed the heading a third
of the way down a 1440 px window. The first run now gets `py-10 md:py-14`.

**Two buttons doing one thing.** The indeterminate-completion state first
rendered a "Try again" button inside the error, directly above "Save to my
Passport" — two controls, one action, no stated precedence. The retry button is
now shown only for a failed *Save and exit*, which is a genuinely different
action; the indeterminate copy names the primary button instead.

## The Passport sub-navigation

The four Passport tabs are **hidden for the duration of the first run**. They
were both a distraction and a data-loss path: one click on "Mina uppgifter"
mid-form and the draft was whatever the last debounce had managed. They return
the moment the first run is over, which is the moment there is something to
navigate between. `e2e/passport-first-run.spec.ts` scenario 38 asserts their
absence; the route still flushes pending answers on unmount and guards the
browser's own unload.

## How to re-capture

The capture spec is deliberately **not** part of the suite — it writes files
and asserts nothing. Recreate it from this note's git history, or drive the
real routes with the same stub table `e2e/passport-first-run.spec.ts` uses, and
run with `SHOT_DIR` pointing here.
