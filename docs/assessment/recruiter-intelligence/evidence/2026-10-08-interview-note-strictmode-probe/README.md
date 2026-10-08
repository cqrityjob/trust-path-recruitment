# Isolated React StrictMode and cached-case causal probe

This local Chromium probe uses real React 19 development StrictMode and TanStack Router with synthetic memory-router data. It accesses no application server, Auth, Storage or production service. Every browser network request is aborted. It is a component lifecycle regression and does not replace native Supabase verification of the integrated application.

Six checks passed: the source-equivalent old initial-string/passive-seed cleanup writes an unintended empty value; the new question-bound helpers perform no initial/replayed/unmount write; deliberate human clearing remains a write; prior-question text cannot become another target's write; cached A-to-B navigation with a shared role question ID remounts draft and observed note ID; within-case question search keeps the same coordinator.

The source was run at product fix `d2429f7d2cd86a6e47a557923fc9ba76ad786448`. The shared helper bytes match integrated app `0eab408debbe660d22825c2ffaa8fcc60de0b68c`. `witness.json` binds helper/probe/runner hashes. The two source files are unchanged probe bytes. To repeat, place them in `.temp/` of that product checkout with its frozen dependencies and an installed Playwright Chromium, then run `bun .temp/run-strict-note-probe.ts`. The source-equivalent control is intentionally a minimal lifecycle reproduction rather than a full app import.

The genuine native run `37767817371` previously proved blank Q8 after pause/reload in all twelve journeys using the old app. Native acceptance of the corrected integrated app remains a separate release gate. No conclusion about OP09 or P1 follows from this probe.
