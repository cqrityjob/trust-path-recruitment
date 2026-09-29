# CQrityjob — Production Readiness report (Full Product Release UAT, refreshed)

**Date:** 2026-09-28. **Tested commit:** `d9dc41a36dc5b2b2907e09757121fe75883d8328` (`origin/main`; includes merged #319 and #317). The UAT branch `claude/kind-ritchie-84l53x` is identical to `main`. **Hosted backend:** Supabase project `wrygicdfxwjnrugduxnt` (CQrityjob Production). **Lovable project** `9ec625ef…` reports `latest_commit_sha = d9dc41a`; whether the *published* site is at this commit could not be verified from here.

**PR #318** (Passport share link on the application domain + social sharing) was open during the main pass and **merged at 15:39 UTC** (`main` = `f25e05f`, no migration). Its head passed 13 of 13 checks including the Passport public-pilot browser evidence. The sharing retest against the merged code is in §5.3; it is limited to what this environment can reach (code at `f25e05f`, the hosted database and the edge-function deployment state), because the published site is still unreachable from here.

---

## 0. Production readiness — release state (refreshed 2026-09-28 evening against `main` `b7ed12f`)

This section is the authoritative release checklist. Sections 1–14 below are the original UAT record of 2026-09-28 (tested at `d9dc41a`, sharing retested at `f25e05f`) and are kept as evidence; where they disagree with this section, this section wins.

**What changed since the original pass.** `main` is now `b7ed12f`: #318 (Passport share link on the application domain + social sharing) and #321 (the sharing e2e suite runs in CI, case 12 fixed) are merged; no newer merge. Both are test/transport changes with no migration. Two Passport migrations from the separate Passport Completion work (`20261220090000`, `20261221090000`) are merged and *pending by design* on the hosted project. Passport social sharing is **not** marked complete here: that is the Passport Completion Work Order's deliverable and stays open until it passes the owner's UAT. The four code fixes below were prepared as isolated draft PRs from `b7ed12f`; the six readiness documents are in `docs/release/production-readiness/`.

### RELEASE STATUS

**NOT READY FOR OWNER UAT.** No P0 exists and no core journey is broken by code. Owner UAT is blocked by external activations (mail, publish/switch, Career Discovery access) and by four unmerged code fixes. Everything on the path to READY is listed below with an owner.

### BLOCKERS (only what actually stops owner UAT)

| # | Blocker | Kind | Clears when |
|---|---|---|---|
| 1 | **Nobody outside the Supabase team receives a confirmation or reset mail** (EM-MAIL-01). Registration is impossible for a real UAT tester. | External activation | Custom SMTP + Site URL + Redirect URLs set (`production-readiness/auth-and-email.md` §3, items 1–3) and the §5 probe passes |
| 2 | **Passport share links end in a blank 503/404** until the site is published at ≥ `f25e05f` and `PASSPORT_SHARE_ENTRY_PUBLISHED=1` is set on the `passport-share` function (§5.3). | External activation | Publish + function secret; `curl -sI …/p` shows the nonce CSP |
| 3 | **Career Discovery is closed to every signed-in candidate** (CI-01; 0 tester rows). | Code (PRs #322 schema, #327 application) + owner decision | #322 merged and applied, #327 merged; owner runs `cd_set_access_state('public', …)` or grants the UAT group as testers |
| 4 | **JB-02 privacy defect**: the employer's internal note is readable by the applicant through the API. Gate item 11. | Code (PRs #323 EXPAND, #329 application, #330 CONTRACT) | all three merged and applied, in that order |
| 5 | **Four of the five fix migrations are `pending`** on the hosted project (20261223090000 is applied; #331 recorded it and **merged 04:55 UTC 2026-09-29** as `3e7c8c8`); `release-parity:gate` refuses a deploy until they are applied through the tracked mechanism. | Release step (after each schema merge) | Supabase GitHub integration applies them on merge; `release-state.json` updated to `applied` with evidence; the stacked application PRs then go green |

Not blockers (kept visible): the browser/mobile pass this environment could not run (gate item 14, owner UAT); the P2 product defects JB-01 / AS-01 / AS-02 (fixed in #324 / #325, wanted before UAT but not blocking it); test content on the public job board (clean before *public* release).

### OWNER ACTIONS (Mostafa)

Decisions:

1. **Career Discovery governance.** The active definition `2026-scd-v3.1.0` still carries `content_version v3.1-draft-5`, `scoring_version v3.1-draft-4`, all 7 review flags false and the route is `noindex`. #322 separates *technical availability* (`internal_test` / `public` / `paused`, DB-backed, admin-only switch) from this governance status and changes none of it. Decide: open `public` with the instrument labelled as it is (and the noindex kept), or keep `internal_test` and grant the UAT group as testers. Detail: `docs/career-discovery/release-control.md` in #322.
2. **AS-02 deadline: informational or enforced?** #325 makes the employer's deadline visible to the candidate (invitation message + Academy card, "Sista dag" / "Utgången") and does not enforce it in `scp_save_response` / `scp_submit_attempt`, because no product text or migration states enforcement. If it should be enforced, that is a follow-up migration (category D).
3. **Google OAuth**: configure the provider or hide the two buttons before launch (`auth-and-email.md` §3.8).
4. **Data cleanup classes** in `production-readiness/production-data-hygiene.md`: approve the REMOVE BEFORE LAUNCH rows, decide the UNKNOWN — OWNER REVIEW rows (Säkerhet AB, cqrityjob, Buller o bång, emma@, carl@, shkachmed@). Nothing is deleted until approved.
5. **Merges**, in the order under CODE FIXES: #323 (done) → #331 (done) → #329 → #330 (JB-02), #322 → #327 (Career Discovery), #324 → #328 (JB-01), #325 (AS-01/AS-02); each schema merge is followed by apply-verify-record before its application PR. Then #320 once the state below is true.
6. **Hosting plan**: confirm the Hostinger staging subdomain and the production domain (apex vs `www`), and the Supabase production/staging separation option (`supabase-production-hardening.md` §2.3).

Hands-on (dashboard / secrets; none can be done from the repository):

7. Supabase Auth: SMTP, Site URL, Redirect URLs, templates, rate limits, HIBP (`auth-and-email.md` §3, 1–7).
8. Application host: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`, `PUBLIC_SITE_URL` (`auth-and-email.md` §4); `RECRUITMENT_SWEEP_TOKEN` + GitHub secrets if the receipts cron is to run.
9. Publish the Lovable site at current `main`; set `PUBLIC_SITE_URL` and then `PASSPORT_SHARE_ENTRY_PUBLISHED=1` on `passport-share`; run the §5.3 deployed checks; revoke the share whose token appeared in the reported screenshot.
10. After the four merges: confirm the integration applied the migrations (`supabase_migrations` rows), run the verify SQL from `release-state.json`, mark them `applied`.
11. Run the owner UAT checklist at the end of this section with a controlled non-team mailbox.

### CODE FIXES (isolated PRs, all draft, none merged; owner decides merges)

The repository's schema-first release contract (`scripts/schema-first-release-check.ts`) refuses application code that calls a function its own migration introduces, so every fix that adds a database object ships as a **schema PR** (merged and applied first, evidence recorded) and a stacked **application PR** (held by the guard until then). JB-02 needs a third, CONTRACT step because the boundary is a column privilege the application must stop reading before it can be revoked.

| Finding | Step | PR | What it does | Regression evidence | Status |
|---|---|---|---|---|---|
| CI-01 (P1) | 1 schema | [#322](https://github.com/cqrityjob/trust-path-recruitment/pull/322) `claude/cd-release-control` | `cd_access_policy` singleton (`internal_test` / `public` / `paused`), `cd_access_state()`, `cd_v31_may_start()`, admin-only `cd_set_access_state()`; ships in `internal_test`; registered as the fifth reviewed anon-executable definer; governance status untouched | SQL suite 33 assertions incl. rollback refusal while `public`; full isolated replay exit 0 | Draft, **CI green** |
| CI-01 | 2 application | [#327](https://github.com/cqrityjob/trust-path-recruitment/pull/327) `claude/cd-release-control-app` | availability, tester status and `resolveSaveGate` honour the state; paused is honest for anonymous visitors | truth table 1.5a–1.5f | Draft, current with `main`; every job green except the schema-first guard, **blocked by design** until #322 is applied and recorded |
| JB-02 (P2 privacy) | 1 EXPAND | [#323](https://github.com/cqrityjob/trust-path-recruitment/pull/323) `claude/jb02-application-note-privacy` | `rec_application_status_events()` / `rec_application_employer_note()` for active members **or platform admins**; `rec_submit_application` reads named fields; no privilege changes | 24 assertions (candidate refused through both, employer A reads, employer B refused, admin reads, anon cannot execute, service role untouched) | **Merged** 20:05 UTC as `10efc1b`; applied and verified read-only on the owner project (functions present, bodies byte-identical, grants right, no privilege moved); the release record [#331](https://github.com/cqrityjob/trust-path-recruitment/pull/331) **merged 04:55 UTC 2026-09-29** as `3e7c8c8` |
| JB-02 | 2 application | [#329](https://github.com/cqrityjob/trust-path-recruitment/pull/329) `claude/jb02-application-note-privacy-app` | employer workspace and admin detail read the timeline through the function; candidate read drops the note it never rendered | — | Draft; carries `main` at `3e7c8c8` (the #331 record), so the schema-first guard passes; **every job green on head `d61d867` (05:15 UTC 2026-09-29), ready for the owner's merge** |
| JB-02 | 3 CONTRACT | [#330](https://github.com/cqrityjob/trust-path-recruitment/pull/330) `claude/jb02-application-notes-contract` | `employer_note` and `note` leave the `authenticated` grant (column list); refuses to apply without #323 | 20 assertions (column, wildcard and both functions refused for the candidate; employer reads through the functions only; resubmission still replays) | Draft, stacked on #329 and current with `main` (head `a6728d1`, CI running); **merge only after #329 is live** |
| JB-01 (P2) | 1 schema | [#324](https://github.com/cqrityjob/trust-path-recruitment/pull/324) `claude/jb01-application-history` | `rec_my_application_context()` returns title, employer and `job_open` for the caller's own applications only; public job RLS untouched | 14 assertions; full isolated replay exit 0 | Draft, **CI green** |
| JB-01 | 2 application | [#328](https://github.com/cqrityjob/trust-path-recruitment/pull/328) `claude/jb01-application-history-app` | the history card keeps its context after the vacancy closes, shows "Annonsen är stängd", links only while open | — | Draft, current with `main`; every job green except the schema-first guard, **blocked by design** until #324 is applied and recorded |
| AS-01 (P2), AS-02 (P2, informational half) | single | [#325](https://github.com/cqrityjob/trust-path-recruitment/pull/325) `claude/as01-as02-assessment-state` | `scp_employer_assign` refuses a closed application or a completed recruitment; button hidden / bulk send disabled in the same states; the deadline reaches the candidate (invitation message, Academy card). Not enforced at save/submit (owner decision 2). The migration introduces no object, so schema and application ship together | 14 assertions incl. rollback → old body accepts a closed application → re-apply; full isolated replay exit 0 | Draft, **CI green** (the second push reworded one English label the pilot-truth guard read as a verdict word) |
| SP-01 (P2) | — | — | Not resolved by the Passport Completion work. **Deferred to an isolated Passport fix after Passport Completion passes UAT** | — | Not started (category C) |

**Merge order for the owner:** #323 (done) → #331 (done 04:55 UTC 2026-09-29; also booked the two Passport rows the ledger already held) → #329 → #330 → (apply, verify, record); #322 → (apply, verify, record) → #327; #324 → (apply, verify, record) → #328; #325 any time. "Apply, verify, record" = the official Supabase GitHub integration applies the migration on merge, the hosted schema is verified read-only against the `verify` SQL in `release-state.json`, and a small release commit marks it `applied` with evidence and removes it from `expectedPending` in `scripts/release-frontier-check.ts`. Each application PR then merges `main` and its guard turns green.

Each PR body states the finding, acceptance criteria and the tests; none refactors outside its area. The frontier-list entries the schema PRs add are the repository's own convention for a migration pending by design.

### EXTERNAL ACTIVATIONS

| Service | Item | Doc |
|---|---|---|
| Supabase Auth | custom SMTP; Site URL; Redirect URLs (published + preview + staging + production); templates/branding; confirm-email stays ON; rate limits; HIBP on; Google OAuth or hide buttons | `production-readiness/auth-and-email.md` |
| Supabase project | backups/PITR, plan upgrade window, staging separation, secrets rotation, network restrictions once Hostinger egress is known, advisor ERROR recorded as accepted, `unaccent` deferred | `production-readiness/supabase-production-hardening.md` |
| Supabase edge function `passport-share` | `PUBLIC_SITE_URL`; `PASSPORT_SHARE_ENTRY_PUBLISHED=1` after `/p` is live | §5.3 |
| Resend | verified sending domain (SPF/DKIM/DMARC); `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`; the same domain relays Supabase Auth mail | `auth-and-email.md` §4 |
| Hostinger | Node ≥ 22, Bun install, `NITRO_PRESET=node-server`, `node .output/server/index.mjs`, env per inventory, edge headers, body size, health check, process manager; staging first, smoke tests 1–12, then DNS; rollback = DNS back to Lovable | `production-readiness/HOSTINGER_PRODUCTION_CHECKLIST.md` |
| Domain | production domain + staging subdomain; update Site URL, allow-list, `PUBLIC_SITE_URL`, `VITE_PUBLIC_SITE_URL`, `RECRUITMENT_SWEEP_URL`, and the hard-coded Lovable origin in code (category C) in the same window | Hostinger checklist §6 |
| GitHub | repository secrets `RECRUITMENT_SWEEP_URL`, `RECRUITMENT_SWEEP_TOKEN` for the receipts cron | Hostinger checklist §5 |
| AI | nothing for launch; when wanted: provider DPA, `ANTHROPIC_API_KEY` server-only, `INTERVIEW_AI_PROVIDER`, DB `ai_enabled` per feature; first feature recommended: recruitment writing help | `production-readiness/ai-readiness.md` |
| Environment variables | one inventory, classes, required per environment, browser exposure (no `VITE_*` carries a secret) | `production-readiness/environment-variables.md` |

### DEFERRED (explicitly safe after initial release)

- SP-02–SP-07 (Passport correction UX, copy, UTC day boundary), JB-03–JB-09 (404 shapes, list caps, document titles, literals), AS-03/AS-04, II-01/II-02, AU-01/AU-03/AU-04, EM-MAIL-03 (dead status-mail module), AI-01 ("Fråga CQrity" naming).
- AS-02 enforcement at save/submit (only if the owner decides "enforced").
- `unaccent` out of `public`; tightening the 20 boolean/id oracle functions to `auth.uid()`; a global CSP; a `/api/health` endpoint before Hostinger staging (needed for staging, not for owner UAT).
- Lockfile re-resolution off Lovable's npm cache (needed before a Hostinger *production* build, not for owner UAT).
- Performance advisor review after the data cleanup.

### RECLASSIFICATION OF EVERY #320 FINDING (A–E)

A = must fix before owner UAT · B = must configure/activate before owner UAT · C = should fix before public release · D = safe after initial release · E = observation / no action

| Finding | Original | Class | Resolution / owner |
|---|---|---|---|
| Passport share links (§5.3) | P1 | **B** | publish at ≥ `f25e05f` + `PASSPORT_SHARE_ENTRY_PUBLISHED=1`; social sharing completion stays with the Passport Completion work until owner UAT |
| EM-MAIL-01 no SMTP | P1 | **B** | `auth-and-email.md` §3.1 |
| CI-01 signed-in Career Discovery closed | P1 | **A** + decision | PRs #322 + #327; owner decision 1 |
| JB-02 employer note readable by applicant | P2 | **A** | PRs #323 + #329 + #330 |
| JB-01 application history loses context | P2 | **A** | PRs #324 + #328 |
| AS-01 test sendable on closed application | P2 | **A** | PR #325 |
| AS-02 deadline hidden from candidate | P2 | **A** (visible) / decision (enforced) | PR #325; owner decision 2 |
| SP-01 correction error unmapped | P2 | **C** | isolated Passport fix after Passport Completion UAT |
| AU-02 Site URL / Redirect URLs | P2 | **B** | `auth-and-email.md` §3.2–3.3 |
| EM-MAIL-02 Resend variables | P2 | **B** | `auth-and-email.md` §4 |
| Data hygiene: junk published job, demo employers, `[TEST DATA]` ads | P2 content | **C** (before public release) | `production-data-hygiene.md`; REMOVE BEFORE LAUNCH rows |
| Data hygiene: exposed share token, 13 pre-#318 live shares | — | **B** | revoke via "Dina delningar" |
| Data hygiene: UAT accounts, test grants, storage erasure backlog | — | **D** (after owner UAT) | `production-data-hygiene.md` §7 |
| HIBP leaked-password protection off | WARN | **B** | `auth-and-email.md` §3.7 |
| Google OAuth buttons visible, provider unconfigured | — | **B** / decision | owner decision 3 |
| Lovable publish state unknown | — | **B** | publish at current `main` |
| Responsive / mobile NOT VERIFIED | — | owner UAT (gate 14) | checklist below |
| SP-02, SP-03, SP-05, SP-06, SP-07 | P3 | **D** | — |
| SP-04 iOS numeric keypad | P3 | **E** until device check in owner UAT | gate 14 |
| JB-03, JB-04, JB-05, JB-06, JB-07, JB-08 | P3 | **D** | — |
| JB-09 flag-off SSR head | P3 info | **E** | flag is true |
| AS-03, AS-04 | P3 | **D** | — |
| II-01 raw provider text if AI flipped without keys | P3 latent | **D** (AI stays off) | `ai-readiness.md` §4 |
| II-02, AI-01 | P3 | **D** | — |
| AU-01, AU-03, AU-04, EM-MAIL-03 | P3 | **D** | `auth-and-email.md` §6 |
| Advisor ERROR `scp_scoring_version_lineage` definer view | ERROR | **E** (accepted, reviewed design) | `supabase-production-hardening.md` §3 |
| Advisor WARN `unaccent` in `public` | WARN | **D** | separate schema PR after launch |
| 18 tables RLS without policy | — | **E** | intended deny-all |
| 20 boolean/id oracles without `auth.uid()` check | — | **D** | pattern in `sp_market_access` |
| Hostinger: Nitro preset defaults to Cloudflare | new | **B** for staging | `NITRO_PRESET=node-server` |
| Hostinger: hard-coded Lovable origin (`seo.ts`, canonicals, sitemap, function fallback) | new | **C** | code change to the production domain |
| Hostinger: lockfile on Lovable's npm cache; no health endpoint | new | **C** | Hostinger checklist §8 |
| BESKT preparation closed (0 method versions / grants) | — | **E** | honest state |

### FINAL OWNER UAT CHECKLIST (READY FOR OWNER UAT when every line is true)

- [ ] 1. Passport Completion work merged and verified by the owner (share link, QR, revoke, social image; the §5.3 deployed checks).
- [ ] 2. Career Discovery available to the intended UAT users: #322 merged + applied, #327 merged, and the owner has run `cd_set_access_state('public', …)` or granted the testers; a signed-in candidate can start, complete and save; My Career shows the CTA.
- [ ] 3. Candidate registration and employer registration complete on the published site.
- [ ] 4. The confirmation e-mail arrives at a non-team mailbox from the CQrityjob sender (Auth log `mail_from` is yours).
- [ ] 5. Password reset lands on `/reset-password` and the new password works.
- [ ] 6. Candidate journey: Career Discovery → My Career → Jobs → apply with a PDF → "Mina ansökningar" (with #324 + #328, a closed vacancy keeps its title/employer).
- [ ] 7. Employer journey: register → pending → approved → draft job → publish → application pipeline → status change → candidate message delivered in-app (and by mail once Resend is set).
- [ ] 8. Assessment: "Skicka test" on an open application → candidate completes at `/academy` (deadline visible with #325) → review → result released; the button is absent on a rejected/withdrawn application.
- [ ] 9. Interview Intelligence manual journey: case → preparation → guided interview → evidence → human assessment → finalised report; no AI text anywhere.
- [ ] 10. Passport: create → add credential with a document → share → open in a private window → revoke → "not available".
- [ ] 11. JB-02 fixed: #323, #329 and #330 merged + applied in that order; `GET /rest/v1/job_applications?select=employer_note` as the applicant returns a column error, not the note.
- [ ] 12. Hostinger staging deployed from `main` and smoke tests 1–12 of the Hostinger checklist pass (not required for the Lovable-hosted UAT round; required before the DNS switch).
- [ ] 13. Production environment/secrets checklist complete (`environment-variables.md` every "R" for Prod set; no `VITE_*` secret).
- [ ] 14. Mobile core journeys tested at 375/390 px: home, Career Discovery, My Career, Passport, Jobs, application dialog, employer pipeline.
- [ ] 15. No P0/P1 blocker remains: blockers 1–5 above cleared; `release-parity:gate` green; data-hygiene REMOVE BEFORE LAUNCH rows done or explicitly postponed to before public release.

---

## 1. Executive summary

**Overall state.** The product is architecturally sound where it matters most for release: every one of the 338 public tables has RLS, a simulated candidate, employer and anonymous visitor could read only their own or public rows in the live database, every privilege-escalation and self-verification write attempted was refused, all 324 repository migrations are applied to the hosted project (release parity PASS), no secret is shipped client-side, and every "AI" surface fails closed to a manual path with honest copy. The Security Passport (excluding sharing), Jobs, application, employer assessment dispatch and Interview Intelligence flows are wired end to end in code with server-side and database-side enforcement.

**What blocks the owner's UAT today** is not primarily code:

1. **Passport share links do not open in production yet.** #318 is merged and the edge function redeployed (v3), so the text-page failure cannot recur; the links start working once the site is published at `f25e05f` and the owner sets `PASSPORT_SHARE_ENTRY_PUBLISHED=1` (§5.3). EXTERNAL ACTIVATION REQUIRED.
2. **New accounts cannot confirm their e-mail** outside the Supabase team: e-mail confirmation is ON in the hosted project, custom SMTP is not configured, and the last confirmation mail went out through Supabase's default mailer. EXTERNAL ACTIVATION REQUIRED (see §10, §14).
3. **The Career Discovery assessment is closed to every signed-in candidate** in production: the product gates "start and save a run while signed in" on `cd_internal_testers` (0 rows) or platform admin. Anonymous visitors can complete it and claim the result at signup; a signed-in candidate sees "Karriäranalysen är inte öppen just nu" and My Career hides the assessment CTAs. This is a deliberate release control that must be lifted (or testers granted) before real candidates use the product.

**Important limitation of this UAT.** No page was rendered in a browser. The session's network policy refused the private npm registry the lockfile pins (so the app could not be built), the deployed site, `cqrityjob.com`, and the Supabase HTTP API. Everything in this report comes from (a) direct checks on the hosted database through the Supabase management tools, run as simulated `anon`/`authenticated` roles inside rolled-back transactions (no production row was created, changed or deleted), and (b) a static reading of the code at `d9dc41a`. Findings are marked **live-confirmed**, **confirmed in code** or **needs browser verification**. Responsive behaviour is therefore NOT VERIFIED. To close that gap the environment needs these hosts allowed: `europe-west1-npm.pkg.dev`, `*.lovable.app`, `wrygicdfxwjnrugduxnt.supabase.co`, `cqrityjob.com`.

Counts: **P0: 0 · P1: 2 (both activation/owner decisions, not code defects) · P2: 9 · P3: ~30.**

---

## 2. Release blockers (P0/P1 only) — original record; the live list is §0 BLOCKERS

| ID | Sev | Area | Finding | Kind |
|---|---|---|---|---|
| — | P1 | Passport sharing | Share links do not open in production until the site is published at `f25e05f` (so `/p` exists) and the function secret `PASSPORT_SHARE_ENTRY_PUBLISHED=1` is set. #318 is merged and the function is deployed (v3); the text-page failure cannot recur. See §5.3. | EXTERNAL ACTIVATION REQUIRED (publish + secret) |
| EM-MAIL-01 | P1 | Auth / e-mail | Hosted project uses Supabase's default mailer (team-only delivery) with e-mail confirmation ON. A real candidate or employer who registers is shown "Kontrollera din e-post" and never receives the mail, so they cannot sign in. Evidence: `docs/release/2026-09-26-auth-confirmation-email-owner-actions.md` (Auth log `mail_from: noreply@mail.app.supabase.io`); 2 of 20 `auth.users` rows are unconfirmed. | EXTERNAL ACTIVATION REQUIRED |
| CI-01 | P1 | Career Discovery | Signed-in candidates cannot start the assessment: `PublicAssessmentFlow.tsx:362-366` sets phase `unavailable` unless `getV31TesterStatus` (`v31-public.functions.ts:404-408` → `cd_is_internal_tester` OR `is_platform_admin`) allows; `cd_internal_testers` has **0 rows** in production. My Career derives the same gate and shows "Karriäranalysen är inte öppen för nya deltagare just nu" with no CTA (`dictionaries.ts:263`). Anonymous completion + claim at signup still works. | Owner decision / activation (grant testers via `cd_grant_internal_tester` or remove the gate) |

No P0 (security/privacy/data-loss) finding. One privacy finding (JB-02) is rated P2 because the leaked field is reachable only through the API, not the UI; the owner may choose to treat it as blocking (§13).

---

## 3. Candidate journey — PASS (static) with P2/P3 findings

Verified in code: homepage → header (Säkerhetsarbete, Security Passport, Karriär, Jobb, För arbetsgivare, Om oss, Logga in, Skapa konto, SV/EN, Företagsinloggning; mobile menu with the same items) → `/career-center`, `/jobs`, `/signup`, `/login` → `/my-career` hub (identity, CVs, shares, assessment state, applications, interviews, verifications, jobs; every query has loading/error handling) → `/my-career/profile` (pending/error states) → `/passport` → `/jobs` → `/jobs/:slug` → application → `/my-career/applications`.

- **Link integrity — PASS.** Script over `src/` at d9dc41a: 148 distinct internal navigation targets (including template literals) resolved against the 165 file-based routes; 0 unmatched.
- **Dev routes — PASS.** `/dev/*` throw `notFound()` unless `import.meta.env.DEV`.
- **Auth redirects — PASS.** `/_authenticated` sends signed-out users to `/login?redirect=<path+search>`; signed-in visitors on `/` go to `/my-career`; legacy `/auth`, `/candidate/*`, `/employer/login|register` redirect to the unified pages with an open-redirect guard.
- **i18n — PASS.** `sv` and `en` dictionaries hold the same 6 482 keys (0 missing either way); language is stored in `localStorage` and can be set by URL intent; a scan of candidate routes/components found no JSX text literal in either language outside `t()`. Residual P3s: JB-07 (English-only `<title>` on applications/family/profession pages), II-02 (same on candidate interview pages), JB-08 (literal "Filter", raw "SE" country code in employer presentation, ISO date slices on the Passport share card).
- **Data persistence — PASS.** Assessment answers of an anonymous run live in `sessionStorage`/`localStorage` until claimed at signup; profile, CV, Passport, applications are server rows; sign-out clears the react-query cache (`__root.tsx`). AU-03 (P3): a pending-registration e-mail address survives sign-out for 24 h on a shared browser.
- **Findings carried from other sections:** CI-01 (P1), JB-01 (P2, live-confirmed), AU-02 (P2 external).
- **Not verified:** rendering, Back button behaviour in a real browser, mobile layout.

## 4. Employer journey — PASS (static + database)

- **Registration → pending → approval:** `create_my_employer_company` creates the organisation as `pending` with the caller as owner (`20260719190845…sql`); `/employer` routes 0 memberships → `/employer/onboarding`, non-active organisation → `/employer/pending` (`_authenticated.employer.index.tsx:118-158`); the workspace layout blocks every non-`active` status (pending, draft, rejected, suspended, archived) (`$employerSlug.tsx:54-66`); the pending page distinguishes rejected / unavailable / waiting and reports the registration e-mail outcome honestly (`not_configured`). Admin approval is `moderate_employer` with a strict state machine (pending→active/rejected, active→suspended, suspended→active; `20260720140000`). **No pending organisation exists in production** (all 11 employers are `active`, 5 of them "(demo)"), so the pending state was not observed live.
- **Create → edit → publish job:** drafts only via RLS (`jobs_employer_insert_draft` requires membership + status draft); publish is an RLS-scoped update whose `published_at` is stamped by trigger; publishing requires an active employer (`admin_audit_job_publish_requires_active_employer`); drafts deletable via `jobs_delete_draft`; every server function re-derives active membership (`employer-jobs.functions.ts:51-64`).
- **Permissions — PASS (live).** As candidate A: 0 rows of any employer's applications, employees, drafts, memberships, assignments, interview data; inserting herself as owner of employer B → RLS refusal; inserting an admin role → no grant. As employer owner A: only applications to its own jobs (2), its own draft, its own employee; 0 rows of employer B. As employer owner B (no jobs): 0 everywhere. A non-member opening `/employer/<other-slug>` gets the "not available" state (`$employerSlug.index.tsx:147`) and every server function throws `ACCESS_NOT_AVAILABLE`. Admin routes require `is_platform_admin` client-side and in RLS.
- **Pipeline:** status changes only through `set_application_status` (role derived server-side, fixed transitions, audit row); internal comments have no candidate policy; messages reach the candidate only when `status='sent'`.
- **Findings:** JB-02 (P2, live-confirmed, employer note readable by applicant through the API — §13); AS-01/AS-02 (§8); AI-01 (P3, "Fråga CQrity" opens a static shortcuts page); wide tables/kanban not verified on small screens.
- **Data hygiene (P2, content):** the public job board currently exposes test content: employer "cqrityjob" has a published job titled "jkdshfkjdhsf" (hidden today only because its deadline passed), an archived job "Bajskorv" exists, and 5 "(demo)" employers with 8 "[TEST DATA]" archived jobs remain; 3 demo employers are publicly readable. Clean before real candidates arrive.

## 5. Career Intelligence — FAIL for signed-in candidates (CI-01); PASS otherwise (static)

- **Instrument state (live):** active `cd_definition_versions` row `2026-scd-v3.1.0`, `content_version "v3.1-draft-5"`, `scoring_version "v3.1-draft-4"`, every `review_status` flag false (SME, bias, content, language, psychometric, accessibility, privacy/legal). This is the version served to the public; the route is `noindex` "while the instrument is in internal test". Scoring was not modified.
- **Anonymous flow — PASS (code):** 28 items answered into `sessionStorage`, canonical report computed server-side by the same builder used for saved runs (`buildCanonicalSnapshot`), result shown without writing; "create an account to keep it" stages a claim token (7 days) and the claim is not gated by the allowlist (`resolveSaveGate`). Depends on e-mail confirmation → AU-02/EM-MAIL-01.
- **Signed-in flow — FAIL:** CI-01 above.
- **Result rendering — PASS (code):** confidence is a closed vocabulary read through `readRecommendationConfidence` with an "unavailable" fallback (`RecommendedProfessions.tsx:233-240`); axis bars guard `null`/`undefined`/context-dependent positions (`DiscoveryCareerSummary.tsx:150-160`); all 18 `cd_professions` map to published `cig_professions` (live), so recommendation links resolve.
- **Career Center — PASS (code):** `/career-center/:profession` resolves aliases and CIG slugs through one bridge and redirects, unknown slugs reach an explicit unavailable state (`career-center.$profession.tsx:40-58`); `/career-center/yrke/:cigSlug` renders its own error state with retry; personal direction is read from the frozen report and never recomputed (`personal-direction.ts`); logged-out visitors get the general product without personal sections (`career-center.index.tsx:238-264`).
- **Not verified:** the full walk in a browser (answers, refresh mid-assessment, history pages).

## 5.2 Security Passport — PASS (excluding sharing) — 0 P0 · 0 P1 · 1 P2 · 6 P3

Live database checks (holder with a real session id): sees exactly her 8 claims, 1 evidence row, 1 profile, 1 share, 1 evidence file, 0 of anyone else's; direct writes refused: self-verify (`SP_TRUST_FIELD_IMMUTABLE`), edit governed metadata (`SP_GOVERNED_METADATA_IMMUTABLE`), insert a credential as verified / with an unknown `credential_code` / free-text certification (`SP_APPROVED_DEFINITION_REQUIRED`), set own passport public directly (RLS). Storage bucket `passport-evidence` is private, 10 MB, PDF/JPEG/PNG/HEIC, folder = `auth.uid()`, verifier read only while a review is open. Markets: SE active; GB, GB-NI, AE-DU `public_pilot` (`is_active=false`, legal review pending); AE-AZ closed; India via 4 national qualifications.

Static verification (full detail in the audit): controlled catalogue (no free-text credential type), reviewer-only state transitions, default sharing selects nothing and never carries evidence/scope text/notes, expiry derived at read time on both sides, reviewer/admin surfaces gated by `sp_is_verifier`/`is_platform_admin`, HAYAT OCR entirely in-browser from the app's own origin with no external call reachable, #319's 390 px fixes present, empty states and onboarding wired.

| ID | Sev | Finding |
|---|---|---|
| SP-01 | P2 | Correcting a document-backed or verified credential without changing an `sp_claims` field (e.g. only the certificate version or "no expiry") raises `SP_METADATA_REVIEW_REQUIRED`, which the client does not map: the holder sees "Could not save. Check your details" and any chosen file is never uploaded (`20261214090000…sql:807`; `international.functions.ts:196-216`; `InternationalCredentialForm.tsx:544-547`). |
| SP-02 | P3 | A material correction creates a new version and leaves the uploaded evidence on the superseded one without telling the holder. |
| SP-03 | P3 | The international correction form has no Cancel. |
| SP-04 | P3 | Date field `inputMode="numeric"` on iOS lacks "-" while the placeholder shows ÅÅÅÅ-MM-DD (8 digits work). Needs device verification. |
| SP-05 | P3 | Share-settings copy says scope is always included; the payload never carries scope text (safer behaviour wins; copy is wrong). |
| SP-06 | P3 | A row stored as `lifecycle_state='expired'` would show a correction button that fails. Edge case. |
| SP-07 | P3 | Expiry day boundary is UTC, not local day. |

**Sharing retest after #318: see §5.3.**

## 5.3 Security Passport sharing — retest against merged main `f25e05f` (2026-09-28, 15:45–16:00 UTC)

What could be verified from this environment (no browser; the published site is unreachable):

| Step | Result | Evidence |
|---|---|---|
| Share page offers "Dela via länk" and "Dela på sociala medier" | PASS (code) | `share.tsx:61-62, 263` (`via: "link" \| "social"`, opens on link); `i18n.ts:2236-2239` |
| Copied link / QR is on the application's domain, token in the fragment only | PASS (code) | `public-origin.ts:37, 58-95`: `VITE_PUBLIC_SITE_URL` or fallback `https://trust-path-recruitment.lovable.app`, `SHARE_ENTRY_PATH = "/p"`, `publicShareUrl(token)` → `/p#<token>`; the QR encodes the same string |
| `GET /p` answers before SSR with a nonce-only CSP, `private, no-store`, `no-referrer`, `noindex, nofollow, noarchive`, `nosniff`; other methods 405 | PASS (code) | `share-transport.ts:268-273, 304-318, 339-371, 400-413`; the inline script clears the fragment with `history.replaceState` before POSTing to `/p/open` |
| `POST /p/open` exchanges the token: throttle → `sp_share_gateway_issue` → `sp_share_gateway_consume` → `303 /p/<navigation id>` + `HttpOnly; SameSite=Lax; Secure; Path=/_serverFn` cookie; every failure lands on one "not available" page | PASS (code) | `share-transport.ts:183-211, 421`; `public-disclosure.server.ts` |
| Gateway RPCs are not callable by browser roles | PASS (live DB) | `sp_share_gateway_issue`, `sp_share_gateway_consume`, `sp_throttle_public_access`, `sp_get_disclosure_session`: EXECUTE only for `service_role`; `sp_disclosure_payload`: no client role; create/preview/revoke: `authenticated` only |
| Edge function `passport-share` no longer serves HTML: `GET`/`HEAD` → body-less `302` to `<site>/p` once `PASSPORT_SHARE_ENTRY_PUBLISHED=1`, otherwise body-less `503` + `Retry-After`; other methods `405` | PASS (code) | `supabase/functions/passport-share/index.ts:29-61` |
| Edge function deployed from the merged code | PASS (live) | Supabase reports `passport-share` **version 3**, updated 2026-09-28 15:40:01 UTC (a minute after the merge) |
| Function secret `PASSPORT_SHARE_ENTRY_PUBLISHED=1` set | **UNKNOWN — EXTERNAL ACTIVATION REQUIRED** | Secrets are not readable from here; no request has reached the function since 04:55 UTC, so its current answer (302 vs 503) has not been observed |
| Published site serves `/p` (i.e. Lovable publish of `f25e05f`) | **UNKNOWN — EXTERNAL ACTIVATION REQUIRED** | Lovable editor is at `f25e05f`; publish state not exposed; `curl -sI …/p` must show the nonce CSP without `'self'` (release note step 2) |
| Existing shares | 13 live disclosures (36 total, last created 04:52 UTC) still carry gateway-form links. Until the secret is set they answer `503` (blank), which is the same failure class the owner reported, just without the exposed source. | live DB |
| Social image: no link/QR by default, snapshot note, truthful trust words, no expired/issuer/date drawn; platform buttons open a composer with nothing posted | PASS (code, per the PR's 116-assertion `passport-social-image:check` and 7 negative controls in CI) | `share-image.ts:28-45` (`snapshotNote`), `share-channels.ts:57-99` (intents only; Instagram has none) |
| Recipient view content, expiry, revocation | Unchanged RPCs (`20261104090000_passport_share_gateway.sql`); covered by the PR's real-backend walk case G (22/22 runs) in CI, not re-run here | CI run 36441729426 |

**Outcome:** the code and the deployed function are correct for the designed journey, and no dead Supabase text page can be served any more (the function returns no HTML at all). The journey is **not yet usable in production** until two owner actions land: publish the site so `/p` exists, then set `PASSPORT_SHARE_ENTRY_PUBLISHED=1` on the function. Until then every share link (new or old) ends in a blank `503`/404. This replaces blocker 1 in §2 and §14: it is now an activation item, not a code defect. Deployed checks the owner must still run in a private window: new link renders with no `#` left in the address; QR opens the same view; token appears only in the `POST /p/open` body; an earlier gateway link opens; revoke → reload → "not available"; social image download equals its preview with no link. Also revoke the share whose token appeared in the reported screenshot ("Dina delningar").

## 6. Jobs — PASS with 1 P2 — 0 P0 · 0 P1 · 1 P2 · 8 P3

Live: 3 jobs visible to the public (query + RLS `job_is_active AND employer_is_active_status`); past-deadline and expired jobs are hidden; `recruitment_questions` visible only for visible jobs; duplicate applications blocked by the partial unique index `(job_id, applicant_user_id) WHERE status <> 'withdrawn'`.

Static: search/filter/sort/pagination are validated URL state with restore-to-results back navigation; closed/removed/unknown slug → not-found page with back link; external application interstitial (new tab, `noopener`); internal dialog with required questions, PDF checks (5 MB, magic bytes), consent; logged-out Apply → `/login?redirect=<ad+search+apply>`; three independent refusals for a closed job; confirmation state; withdraw via RPC; candidate sees only sent messages.

| ID | Sev | Finding |
|---|---|---|
| JB-01 | P2 **live-confirmed** | Application history loses the job title, employer and link once the vacancy closes: `listMyApplications` embeds `jobs(…, employers(name))` through the candidate's RLS client and the only candidate policy is `jobs_public_active_select`. On the hosted DB the two existing applications to archived job `gvimckhlqk` return `job_visible=false, employer_visible=false` for their applicants, so the cards render "—". |
| JB-02 | P2 **live-confirmed** (privacy) | `job_applications.employer_note` and `job_application_status_events.note` are readable by the applicant (owner SELECT policy on all columns). One production application carries a 129-character employer note and its applicant can read it through the REST API. The UI never renders it and no current employer screen writes the note, but employer copy promises "Syns bara för er organisation – aldrig för kandidaten". |
| JB-03 | P3 | `/jobs/profession/<unknown>` renders "Jobb som <slug>" instead of 404. |
| JB-04 | P3 | `/jobs/family/<unknown>` 404 reads as an empty search. |
| JB-05 | P3 | Family/profession lists: 60-row cap, no pagination; Back from an ad goes to `/jobs`. |
| JB-06 | P3 | "Mina ansökningar" shown to anonymous visitors (redirects to login, return path kept). |
| JB-07 | P3 | English-only document titles on applications/family/profession pages. |
| JB-08 | P3 | Literal "Filter", raw "SE", ISO date slices on the Passport share card. |
| JB-09 | P3 info | With `VITE_JOBS_ENABLED=false` the ad route still SSR-loads head/JSON-LD (flag is true). |

Needs browser verification: signup-with-apply-intent surviving e-mail confirmation; multiple PostgREST `or=` params on the live API; sticky apply bar vs "open on own page" link at 1024–1280 px. Saved jobs: table exists, no UI. Salary: neither collected nor rendered.

## 7. Assessment (employer "Skicka test") — PASS with 2 P2

Live: two definitions flagged `standard_for_recruitment` (security-officer-recruitment, security-manager-recruitment), both `draft/design`; any **active** employer may assign them under `governance_mode = closed_test` (attempts are stamped "must not inform selection"). 29 `assessment_assignments`, `email_delivery_status = not_attempted` on all (no invitation mail ever attempted from production); 23 still "invited".

Static: five entry points → one dialog → `scp_assign_from_application`/`scp_employer_assign` (owner/admin only, DB idempotency per application+definition, one assignment + one in-progress attempt); in-app message via the recruitment channel, e-mail only if Resend is configured (stated honestly); candidate `/academy` list, attempt runner with per-item saves, resume, server-verified submit; result requires human review of constructed items then explicit owner/admin release; employer decisions use a closed vocabulary (no hire/reject); **the assessment never creates an interview case** (quoted code + e2e assertion). AS-05 is resolved: migration `20261217090000` is applied in production, so the strategic (security-manager) level is sendable.

| ID | Sev | Finding |
|---|---|---|
| AS-01 | P2 | "Skicka test" is offered on rejected/withdrawn/completed applications and the DB accepts it (`applications.$applicationId.tsx:973-976` computes `canAssign`, but `ApplicationAssessmentPanel.tsx:245-256` renders the button unconditionally; `scp_employer_assign` never checks `job_applications.status`). |
| AS-02 | P2 | The employer's optional deadline is never shown to the candidate (not in the invitation message, not on the `/academy` card) and not enforced by `scp_save_response`/`scp_submit_attempt`, while the employer sees "Utgången". |
| AS-03 | P3 | Single-candidate bulk send bypasses the "already sent" guard and reports a fresh "sent" for a no-op. |
| AS-04 | P3 | Unused `sendTest.sent.email.failed` string; generic "not confirmed" shown instead. |

## 8. Interview Intelligence — PASS (static) — 0 P0/P1/P2 · 2 P3

Live: 3 interview pack versions `pilot_availability=open` (content `draft`), 0 employer-specific grants needed; `scp_interview_ai_config.ai_enabled=false`, `transcript_enabled=false`; any active employer member can start (`scp_iv_employer_can_start_interviews`). RLS: `scp_interview_cases_read` = employer membership (+ vetting restriction); a candidate sees 0 case rows directly (candidate view goes through a bounded RPC: employer/role/status/source kinds/retention + correction form).

Static: case creation bound to the applicant; manual preparation/approval; guided interview with prohibited areas; manual evidence → per-question human assessment → blockers → preview-bound finalise (owner/admin); no automatic status change anywhere; AI proposals are decision support only and are disabled. II-01 (P3 latent): if `ai_enabled` is flipped without `INTERVIEW_AI_PROVIDER`/`ANTHROPIC_API_KEY`, raw provider error text reaches recruiter screens. II-02 (P3): English-only `<title>` on candidate interview/preparation pages. BESKT candidate preparation: 0 method versions and 0 pilot grants in production → "Förberedelsen är inte öppen ännu" (honest state).

## 9. Authentication & e-mail

**Code defects**

| ID | Sev | Finding |
|---|---|---|
| AU-01 | P3 | `/reset-password` shows the new-password form to an already signed-in browser even on an expired link (fragment error not read; `reset-password.tsx:60-69`). |
| AU-03 | P3 | Pending-registration address persists in `localStorage` across sign-out for 24 h. |
| AU-04 | P3 | `/admin/login` prints raw Supabase error text. |
| EM-MAIL-03 | P3 | `send-application-status-email.server.ts` has no runtime caller; `docs/release/auth-email-branding.md` describes it as active and still names the old project. |

Verified PASS in code: unified `/login`/`/signup` with legacy redirects and open-redirect guard; sign-up metadata → `profiles` trigger; mapped error copy (wrong password, existing account, rate limit, network); session persistence in `localStorage` on the published domain (the preview broker only activates inside the Lovable editor iframe); protected routes with return path; candidate/employer/admin separation re-derived per load; sign-out clears cache; both confirmation modes handled; no auth surface indexable; Google OAuth wired (provider config external).

**External activation / configuration (not code defects)**

| ID | Sev | Item | Status |
|---|---|---|---|
| EM-MAIL-01 | P1 | Custom SMTP on the Supabase project (default mailer delivers only to team members; confirmation is ON) | EXTERNAL ACTIVATION REQUIRED |
| AU-02 | P2 | Site URL + Redirect URLs allow-list (`https://<origin>/**` for published, preview and custom domain); without it confirmation/reset links land on `/` → `/my-career` and lose the reset form / destination | EXTERNAL ACTIVATION REQUIRED |
| EM-MAIL-02 | P2 | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`, `PUBLIC_SITE_URL` on the application host; every product mail is `not_configured` until then (journeys still complete in-app) | EXTERNAL ACTIVATION REQUIRED |

**E-mail-dependent journeys**

| Journey | Classification |
|---|---|
| Account verification, password reset, magic link (Supabase Auth) | NOT TESTABLE UNTIL EXTERNAL SERVICE ACTIVATION (SMTP) |
| Employer registration receipt + admin notice (Resend) | NOT TESTABLE UNTIL ACTIVATION; UI states `not_configured` |
| Company approval/rejection notice | WORKING in-app (no e-mail exists; none promised) |
| Application receipt (Resend, swept) | NOT TESTABLE UNTIL ACTIVATION (+ `RECRUITMENT_SWEEP_TOKEN`) |
| Recruitment messages incl. interview invitation/booking, rejection, offer | WORKING in-app; e-mail NOT TESTABLE UNTIL ACTIVATION |
| Assessment/training invitation (Academy) | WORKING in-app + share link; e-mail NOT TESTABLE UNTIL ACTIVATION |
| Legacy token invitation `/invite/:token` | Retired, not user-reachable |
| Candidate status e-mails (interview/rejected/hired) | Dead module (EM-MAIL-03); nothing promised |
| Passport verification/attestation/share notifications | WORKING (in-app; share by e-mail is a client `mailto:`) |
| Admin notifications | NOT TESTABLE UNTIL ACTIVATION |

## 10. AI readiness

No provider key, provider selection or activation exists in the repository; nothing was activated by this UAT. No AI path approves or rejects candidates (interview policy forbids employment recommendations; review proposals cannot carry verdicts; status changes are human RPCs).

| Surface | Class |
|---|---|
| Interview Intelligence proposals (role requirements, candidate facts, brief, evidence, report draft) | **B** AI-ready, off (`INTERVIEW_AI_PROVIDER`, `ANTHROPIC_API_KEY`, DB `ai_enabled=false`) |
| Recruitment writing help ("Föreslå text med AI") | **A** template fallback + **B** model |
| "Fråga CQrity" | **A/D** static shortcuts (AI-01, P3 naming) |
| Academy reviewer "AI-förslag" | **B** contract only; `null_provider` seeded; human review |
| CV drafting | **B** (factual CV works = A) |
| Security Work "AI-stöd" | **B** (`SW_AI_*` + approved activation row + budget) |
| HAYAT credential verification | **A** deterministic (signature/issuer registry); `sp_evidence_extractions` **D** unused |
| Career Discovery matching, Passport employer matching, assessment scoring | **A** deterministic |
| MCP endpoint `/mcp` | **A**, closed unless `CQRITYJOB_MCP_ENABLED` + token |

Requires an external AI provider before it does anything: Interview Intelligence proposals, recruitment writing help (model path), Academy proposals, CV AI drafting, Security Work AI. All degrade honestly today.

## 11. Responsive / mobile — NOT VERIFIED

No viewport was rendered. Static review found: #319's 390 px Passport fixes present in main; no unguarded fixed widths in Passport or Jobs; jobs filters stack on phones; application dialog uses the guarded scroll pattern; header has a mobile menu; employer tables/kanban unreviewed at small widths. To be run in the owner's UAT or once the environment can reach the site: homepage/navigation, Career Discovery, Career Center, My Career, Passport, Jobs, applications at 375/390 px, tablet and desktop.

## 12. Security / privacy observations (evidence-based)

- **Visibility sweep (live, 338 tables):** anon reads only catalogue content; candidate A, employer owner A and employer owner B see only their own rows (details in §4, §5.2, §6). Passport tables carry an additional restrictive policy `sp_passport_session_active()` that requires a live `auth.sessions` row matching the JWT `session_id`, so a revoked session cannot read Passport data.
- **Write attempts (live, rolled back):** self-verify, governed-metadata edit, non-catalogue credential, direct `is_private=false`, own application status → `hired`, `employer_note` write, self-membership as owner, self admin role, archiving another employer's job, suspending an employer, editing other profiles — all refused or 0 rows.
- **Storage:** all three buckets private; policies key on `auth.uid()` folder; employer CV read only via own active employer's application row.
- **Migrations / privileges:** all 324 migrations applied; `TRUNCATE` for anon/authenticated on 0/338 tables (hardening `20261218090000` effective).
- **RPC surface:** 392 functions callable by anon/authenticated, 337 SECURITY DEFINER; every user-defined function sets `search_path`; no authenticated-callable definer function found that returns or changes another party's data. 4 anon-callable definers are guarded/telemetry (`employer_is_active_status` is a boolean oracle on an employer UUID). 20 boolean/id oracles accept caller-supplied ids without an `auth.uid()` check (`has_role`, `is_platform_admin`, `has_employer_role`, `scp_iv_case_employer`, `scp_interview_pack_validate` leaks codes of unpublished packs, `cd_v31_validate_session_evidence`…). Low risk, no PII.
- **Supabase security advisor:** 1 ERROR — view `public.scp_scoring_version_lineage` is SECURITY DEFINER; WARN — leaked-password (HIBP) protection **disabled**, extension `unaccent` in `public`; 18 tables with RLS but no policy (deny-all, intended).
- **JB-02** (P2): employer note about a candidate readable by that candidate through the API (one live row). Recommended: column-level revoke or a view for the applicant policy.
- **Data hygiene:** test/junk content on the live board; earlier UAT accounts (mailinator.com, example.com, closed-test.invalid) and 5 anonymised deleted accounts remain in `auth.users`.

## 13. External activation checklist (cannot be completed by code) — original record; the live list is §0 EXTERNAL ACTIVATIONS and OWNER ACTIONS

1. Supabase Auth → custom SMTP (Resend relay or other), sender name/address, rate limits (EM-MAIL-01).
2. Supabase Auth → Site URL and Redirect URLs `https://…/**` for published, preview and custom domains (AU-02).
3. Supabase Auth → e-mail templates/branding; decide whether e-mail confirmation stays ON (it is ON today).
4. Supabase Auth → enable leaked-password protection (advisor WARN); Google OAuth provider credentials if the Google buttons are to work.
5. Application host secrets: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`, `PUBLIC_SITE_URL` (also for the `passport-share` function), `RECRUITMENT_SWEEP_TOKEN` for the receipts sweep.
6. Career Discovery access: grant `cd_internal_testers` rows (`cd_grant_internal_tester`) to the UAT group, or lift the signed-in gate for launch (CI-01); decide on the `noindex` and the "draft" content/scoring version labels.
7. Passport sharing (#318 merged, function v3 deployed): publish the site at `f25e05f`, confirm `curl -sI …/p` shows the nonce CSP, set `PASSPORT_SHARE_ENTRY_PUBLISHED=1`, run the §5.3 deployed checks; revoke the share whose token appeared in the reported screenshot.
8. AI (only when wanted): `INTERVIEW_AI_PROVIDER` + `ANTHROPIC_API_KEY` + DB `ai_enabled`; `SW_AI_*` + activation row. No key was added here.
9. Confirm the published Lovable build is at `d9dc41a` (editor is; publish state unknown from here).
10. Clean test content from production (junk jobs, demo employers, stale UAT accounts) before real users arrive.
11. Address the advisor ERROR (`scp_scoring_version_lineage` → `security_invoker`) and move `unaccent` out of `public` (schema changes; separate PR).

## 14. Release recommendation (original, 2026-09-28 afternoon; superseded by §0 RELEASE STATUS)

**NOT READY FOR OWNER UAT.**

Exact P0/P1 blockers:

1. **Passport share links do not open in production** until the site is published at `f25e05f` and `PASSPORT_SHARE_ENTRY_PUBLISHED=1` is set on the `passport-share` function (#318 merged 15:39 UTC, function v3 deployed 15:40 UTC; §5.3).
2. **EM-MAIL-01** — no custom SMTP while e-mail confirmation is ON: nobody outside the Supabase team can complete registration. External activation.
3. **CI-01** — the Career Discovery assessment is closed to signed-in candidates (empty tester allowlist). Owner decision/activation.

No P0. No code defect was found that breaks a core journey. Once the three items above are resolved, the P2 list (JB-01, JB-02, SP-01, AS-01, AS-02, AU-02, EM-MAIL-02, data hygiene) can be fixed in parallel with the owner's UAT, and the browser/mobile pass that this environment could not perform must be run against the republished site.

---

### Appendix — method and evidence

- Database checks: Supabase management SQL as `postgres`, switching to `anon`/`authenticated` with `set_config('request.jwt.claims', …)` (real user ids and, for Passport reads, a real `auth.sessions` id), all inside `BEGIN … ROLLBACK`. No row was created, modified or deleted. Queries touched only counts, policy catalogues, function definitions and the specific rows named above.
- Static audit outputs (per area, with file:line evidence) are preserved in the session scratchpad; this document is the consolidated result.
- Environment blockers: `bun install` → 403 from `europe-west1-npm.pkg.dev` for every package; `*.lovable.app`, `cqrityjob.com` and `wrygicdfxwjnrugduxnt.supabase.co` → 403 CONNECT from the egress proxy; no Docker for `scripts/local-stack`. `tsc --noEmit` reports 250 errors, all consequences of the missing `@supabase/supabase-js` and Lovable packages (not code defects).
