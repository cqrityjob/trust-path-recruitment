# CQrityjob — Full Product Release UAT report

**Date:** 2026-09-28. **Tested commit:** `d9dc41a36dc5b2b2907e09757121fe75883d8328` (`origin/main`; includes merged #319 and #317). The UAT branch `claude/kind-ritchie-84l53x` is identical to `main`. **Hosted backend:** Supabase project `wrygicdfxwjnrugduxnt` (CQrityjob Production). **Lovable project** `9ec625ef…` reports `latest_commit_sha = d9dc41a`; whether the *published* site is at this commit could not be verified from here.

**PR #318** (Passport share link on the application domain + social sharing) was **open** throughout this UAT (head `ed211ffd`, base `d9dc41a`, `mergeable_state: unstable` at 12:40 UTC). Passport sharing was therefore **not** assessed, and no new sharing defect is reported. The sharing retest in §5.2 is still to be run after #318 merges and the site is republished.

---

## 1. Executive summary

**Overall state.** The product is architecturally sound where it matters most for release: every one of the 338 public tables has RLS, a simulated candidate, employer and anonymous visitor could read only their own or public rows in the live database, every privilege-escalation and self-verification write attempted was refused, all 324 repository migrations are applied to the hosted project (release parity PASS), no secret is shipped client-side, and every "AI" surface fails closed to a manual path with honest copy. The Security Passport (excluding sharing), Jobs, application, employer assessment dispatch and Interview Intelligence flows are wired end to end in code with server-side and database-side enforcement.

**What blocks the owner's UAT today** is not primarily code:

1. **Passport sharing is broken in production** (the current gateway link renders as text) and the fix, #318, is not yet merged or published. Known, in progress, out of scope for this report.
2. **New accounts cannot confirm their e-mail** outside the Supabase team: e-mail confirmation is ON in the hosted project, custom SMTP is not configured, and the last confirmation mail went out through Supabase's default mailer. EXTERNAL ACTIVATION REQUIRED (see §10, §14).
3. **The Career Discovery assessment is closed to every signed-in candidate** in production: the product gates "start and save a run while signed in" on `cd_internal_testers` (0 rows) or platform admin. Anonymous visitors can complete it and claim the result at signup; a signed-in candidate sees "Karriäranalysen är inte öppen just nu" and My Career hides the assessment CTAs. This is a deliberate release control that must be lifted (or testers granted) before real candidates use the product.

**Important limitation of this UAT.** No page was rendered in a browser. The session's network policy refused the private npm registry the lockfile pins (so the app could not be built), the deployed site, `cqrityjob.com`, and the Supabase HTTP API. Everything in this report comes from (a) direct checks on the hosted database through the Supabase management tools, run as simulated `anon`/`authenticated` roles inside rolled-back transactions (no production row was created, changed or deleted), and (b) a static reading of the code at `d9dc41a`. Findings are marked **live-confirmed**, **confirmed in code** or **needs browser verification**. Responsive behaviour is therefore NOT VERIFIED. To close that gap the environment needs these hosts allowed: `europe-west1-npm.pkg.dev`, `*.lovable.app`, `wrygicdfxwjnrugduxnt.supabase.co`, `cqrityjob.com`.

Counts: **P0: 0 · P1: 2 (both activation/owner decisions, not code defects) · P2: 9 · P3: ~30.**

---

## 2. Release blockers (P0/P1 only)

| ID | Sev | Area | Finding | Kind |
|---|---|---|---|---|
| — | P1 | Passport sharing | Current production share link (`…supabase.co/functions/v1/passport-share#token`) renders as text. Fixed by open PR #318 (merge, publish, deploy function, set `PASSPORT_SHARE_ENTRY_PUBLISHED=1`). | Known, in progress — not re-reported |
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

**Sharing retest after #318 (pending):** Passport → Share → recipient/public view → copy/share link → social options → open destination (must render on the app domain, never a Supabase text page); QR equals link; token only in the `POST /p/open` body; revocation ends the view; earlier gateway links open once `PASSPORT_SHARE_ENTRY_PUBLISHED=1`.

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

## 13. External activation checklist (cannot be completed by code)

1. Supabase Auth → custom SMTP (Resend relay or other), sender name/address, rate limits (EM-MAIL-01).
2. Supabase Auth → Site URL and Redirect URLs `https://…/**` for published, preview and custom domains (AU-02).
3. Supabase Auth → e-mail templates/branding; decide whether e-mail confirmation stays ON (it is ON today).
4. Supabase Auth → enable leaked-password protection (advisor WARN); Google OAuth provider credentials if the Google buttons are to work.
5. Application host secrets: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`, `PUBLIC_SITE_URL` (also for the `passport-share` function), `RECRUITMENT_SWEEP_TOKEN` for the receipts sweep.
6. Career Discovery access: grant `cd_internal_testers` rows (`cd_grant_internal_tester`) to the UAT group, or lift the signed-in gate for launch (CI-01); decide on the `noindex` and the "draft" content/scoring version labels.
7. After #318: publish the site, deploy `passport-share`, set `PASSPORT_SHARE_ENTRY_PUBLISHED=1`, run the §5.2 sharing checks; revoke the share whose token appeared in the reported screenshot.
8. AI (only when wanted): `INTERVIEW_AI_PROVIDER` + `ANTHROPIC_API_KEY` + DB `ai_enabled`; `SW_AI_*` + activation row. No key was added here.
9. Confirm the published Lovable build is at `d9dc41a` (editor is; publish state unknown from here).
10. Clean test content from production (junk jobs, demo employers, stale UAT accounts) before real users arrive.
11. Address the advisor ERROR (`scp_scoring_version_lineage` → `security_invoker`) and move `unaccent` out of `public` (schema changes; separate PR).

## 14. Release recommendation

**NOT READY FOR OWNER UAT.**

Exact P0/P1 blockers:

1. **Passport sharing broken in production** until PR #318 is merged, the site republished, the function deployed and `PASSPORT_SHARE_ENTRY_PUBLISHED=1` set (known; not re-reported).
2. **EM-MAIL-01** — no custom SMTP while e-mail confirmation is ON: nobody outside the Supabase team can complete registration. External activation.
3. **CI-01** — the Career Discovery assessment is closed to signed-in candidates (empty tester allowlist). Owner decision/activation.

No P0. No code defect was found that breaks a core journey. Once the three items above are resolved, the P2 list (JB-01, JB-02, SP-01, AS-01, AS-02, AU-02, EM-MAIL-02, data hygiene) can be fixed in parallel with the owner's UAT, and the browser/mobile pass that this environment could not perform must be run against the republished site.

---

### Appendix — method and evidence

- Database checks: Supabase management SQL as `postgres`, switching to `anon`/`authenticated` with `set_config('request.jwt.claims', …)` (real user ids and, for Passport reads, a real `auth.sessions` id), all inside `BEGIN … ROLLBACK`. No row was created, modified or deleted. Queries touched only counts, policy catalogues, function definitions and the specific rows named above.
- Static audit outputs (per area, with file:line evidence) are preserved in the session scratchpad; this document is the consolidated result.
- Environment blockers: `bun install` → 403 from `europe-west1-npm.pkg.dev` for every package; `*.lovable.app`, `cqrityjob.com` and `wrygicdfxwjnrugduxnt.supabase.co` → 403 CONNECT from the egress proxy; no Docker for `scripts/local-stack`. `tsc --noEmit` reports 250 errors, all consequences of the missing `@supabase/supabase-js` and Lovable packages (not code defects).
