# Follow-up: isolated delivery, CI alignment, job back-navigation, evidence

## Gate 0 — Delivery isolation (blocker, must pass before any code edit)

Current state reported by owner: main HEAD is 03ed5830 (the saved Lovable edit); the reported edit branch returns 404 on GitHub. So Lovable edits in this session sync straight to main.

- Owner action required: in the Lovable editor, switch the project branch selector to a new GitHub feature branch (e.g. `fix/mvp-homepage-ci-alignment`) created from 03ed5830. The agent cannot create or switch remote branches, and must not change repository protections or integration permissions.
- Agent verification before editing: `git branch --show-current`, `git log -1`, and confirmation from the owner (GitHub GET branches/<name>) that the branch exists remotely and main is unchanged after a first trivial save.
- If this cannot be confirmed: stop and report the blocker. No edits.

## Tasks (only after Gate 0 passes)

1. roadmap.md — record items 2–6 below as open tasks.
2. CI alignment (run 36272403026, jobs 108488719602 and 108488719561)
   - Read `public-homepage:check`, `e2e/landing-entry-experience.spec.ts`, `e2e/public-homepage*.spec.ts` and the public-entry harness. Classify each failing assertion as superseded (old hero text, `#lifecycle`, old headings, word budget) or a real regression.
   - Update superseded assertions to the owner-approved MVP homepage: new hero + Kom igång / Hitta jobb / För arbetsgivare, section IDs `value`, `employers`, `security-intelligence`, `get-started`, `passport`, `faq`. Keep all security, access, disclaimer, no-ranking and human-decision assertions. Do not skip or delete tests.
   - Word budget: shorten homepage copy (SV and EN) toward the check's limit. Only raise the limit if the owner approves a new number.
   - `home.ai.title`: the product name is the same in both languages. Check whether the untranslated-string guard has an allow-list for product names. If not, make the EN/SV strings deliberately equal in the existing documented way. Do not weaken the guard.
   - `/contact`, `/security-work`: check that the route files exist and that navigation works. If the check's route inventory is out of date, update the inventory. Do not remove the links.
   - Ranking regex: find which homepage sentence it matches (probably "rangordnar inte kandidater" / "does not rank candidates"). Reword the copy so the meaning is unchanged. Do not relax the regex.
3. Back to results on the job ad (jobs.$slug.tsx)
   - Replace `history.back()`. JobCard and related-job links carry the current validated `/jobs` search (q, location, filters) as a `from` search param. The detail page parses it with the jobs index search validator. The back link goes to `/jobs` with those params; the fallback is plain `/jobs`.
   - Login roundtrip: the apply sign-in link keeps the full detail URL, including `from`, through `safeReturnPath`.
   - Verify: direct entry, refresh, related-job hop, login redirect roundtrip.
4. Generated types report: document that the three `string | null` entries follow `scripts/nullable-rpc-contract-check.ts`, report the scope of the earlier large generated diff, and confirm `previewAuthStorage.ts` was not touched by this work.
5. Verification, with real exit statuses (`set -o pipefail`, `echo $?`):
   - tsgo, tsc and the production build.
   - `nullable-rpc-contract:check`, plus its negative controls after a clean save.
   - `public-homepage:check` and the public-entry browser suite locally.
   - Interview/BESKT checks.
   - SV/EN at 1280 and 390 px: homepage, job list, job ad and back navigation.
   - An application confirmation shown only locally or in a non-production test. No hosted writes.
6. Security findings: leave all three OPEN. If runtime evidence is wanted later, it needs a non-production, ordinary-role read test and a denied-write test.

## Out of scope
Security Work workspace, Career Center recommendations, prices or free promises, paid AI, migrations, hosted writes, merge, publication.

## Final report
Separate what is independently verifiable (commit SHA on the feature branch, CI run links, exit codes) from remaining gaps.
