# Owner UAT release checklist (2026-10-01)

Release candidate: `main` at `cb5c668` (merge of #343, 2026-10-01 08:46 UTC).
No new features. Nothing in DNS, Supabase configuration, secrets, production
data or deployment was changed while preparing this list.

**Audit basis (read-only, 2026-10-01 ~10:00 UTC).**

| Surface | State |
|---|---|
| GitHub `main` | `cb5c668`, CI run 1281 green (lint, typecheck, deterministic guards, migration replay, browser suites at desktop and 375/390 px). #341, #342, #343 merged. |
| Lovable "Security Talent Hub" | `latest_commit_sha = cb5c668`, `is_published = true`, last edit 08:46 UTC. The editor screenshot shows the #343 hero. Whether the **published** snapshot is `cb5c668` cannot be read through the API; the owner confirms it on the live site (item 1.2). |
| Supabase `wrygicdfxwjnrugduxnt` | `ACTIVE_HEALTHY`, Postgres 17.6. 329 migrations hosted = 329 in the repository, latest `20261226090000`. No drift. |
| Edge Functions | `passport-share` v3 and `transactional-email` v1 (deployed 2026-09-30 17:27 UTC), both `verify_jwt=false` as designed. **No invocation of either in the last 24 h.** |
| Auth mail | Last `mail.send` 2026-09-30 12:47 UTC, `mail_from: noreply@mail.app.supabase.io` (the default mailer). No Auth mail has been sent since, so the configured SMTP is not yet proven by a delivery. |
| Product mail | Last product mail outcome `not_configured` (2026-09-29 16:52 UTC, before the function existed). No mail has gone through the new transport yet. |
| Security advisors | 1 ERROR (`scp_scoring_version_lineage`, accepted risk, #342). The `auth_leaked_password_protection` WARN of 2026-09-30 is **no longer reported**. |
| Auth providers | `email` (15 identities) and `google` (1 identity): Google OAuth is configured and has been used. |
| Career Discovery | `cd_access_policy.state = internal_test`, `cd_internal_testers` = 0 rows. |
| Gates A / B / C | 0 AI activations, Credly source disabled, 0 published BESKT versions. Temporary copy live, as decided. |
| Production data | 21 users, 11 employers (5 "(demo)"), 26 jobs (6 open), 14 applications, 13 live Passport shares, 9 storage-erasure rows, 2 live assessment test grants. Nothing from the hygiene list has been removed yet. |

Container limits: `cqrityjob.com`, `*.lovable.app` and the Supabase HTTP API
are refused by this environment's network policy, so live headers, the
published build and mail delivery were not observed from here. Each has an
owner tick below.

Legend: **DONE** · **OWNER ACTION** · **BLOCKER** · **DEFER AFTER LAUNCH**

---

## 1. DOMAIN & PRODUCTION URLs

| # | Item | Status |
|---|---|---|
| 1.1 | Lovable remains production hosting for the initial launch; the project is published, public audience. | DONE |
| 1.2 | Published snapshot is `cb5c668`: the live homepage h1 reads "Security careers, without limits." and `/plattformen` loads. Click "Update" in Lovable if it does not. | OWNER ACTION |
| 1.3 | Live security checks on the published origin: `curl -s -o /dev/null -w '%{http_code}' https://<origin>/.mcp/list-tools` → `404`; `curl -sI https://<origin>/` shows `x-content-type-options`, `referrer-policy`, `strict-transport-security`, `content-security-policy: frame-ancestors …`. | OWNER ACTION |
| 1.4 | `cqrityjob.com` connected in Lovable (DNS records at the registrar, certificate issued, site answers on the domain). Decide the canonical host: apex `cqrityjob.com` or `www.cqrityjob.com` (the homepage JSON-LD already says `https://www.cqrityjob.com`). | OWNER ACTION |
| 1.5 | Code still hard-codes `https://trust-path-recruitment.lovable.app` as the canonical origin: `SITE_ORIGIN` (`src/lib/job-intelligence/seo.ts`), `sitemap.xml`, `canonical` and `og:url` on the public routes, the Passport share fallback origin and the `passport-share` function fallback. On the custom domain this sends search engines, share links and mail links to the Lovable subdomain. Needs one small code PR (constant + `VITE_PUBLIC_SITE_URL` / `PUBLIC_SITE_URL`) **after** 1.4 is decided. Not opened (owner approval required; no speculative PRs). Not a blocker for UAT on the Lovable origin. | BLOCKER for the domain cutover |
| 1.6 | After 1.4: Supabase Auth → URL configuration: Site URL = the production domain; Redirect URLs include `https://cqrityjob.com/**` (and `www` if used) next to the Lovable origins. Google Cloud OAuth client: add the domain as an authorised JavaScript origin. | OWNER ACTION |
| 1.7 | Hostinger staging/production checklist (`production-readiness/HOSTINGER_PRODUCTION_CHECKLIST.md`). Not needed while Lovable hosts. | DEFER AFTER LAUNCH |

## 2. AUTH & EMAIL

| # | Item | Status |
|---|---|---|
| 2.1 | Supabase Pro active. | DONE (owner statement; the plan is not readable through the tools) |
| 2.2 | Custom SMTP configured in Supabase Auth. | DONE (owner statement) |
| 2.3 | SMTP **proven**: register from a non-team mailbox on the live site → "Kontrollera din e-post" → the Auth log `mail.send` carries your CQrityjob `mail_from` (not `noreply@mail.app.supabase.io`) → the mail arrives → the link opens signed in on a phone → desktop "Jag har bekräftat – fortsätt" continues. No Auth mail has been sent since SMTP was set, so this is still unproven. | OWNER ACTION |
| 2.4 | Password reset from `/login` lands on `/reset-password`; new password works; old refused. | OWNER ACTION |
| 2.5 | Auth templates (Confirm signup, Reset password, Magic link): sender name `CQrityjob`, Swedish subject with an English line, `{{ .ConfirmationURL }}` only. Check the received mail in 2.3. | OWNER ACTION |
| 2.6 | Leaked-password (HIBP) protection: no longer flagged by the security advisor. | DONE |
| 2.7 | Google OAuth: provider configured, one real Google identity exists. | DONE |
| 2.8 | Product e-mail architecture: app server → `transactional-email` Edge Function (holds `RESEND_API_KEY`) → Resend; eight kinds, fixed sender `CQrityjob <no-reply@cqrityjob.com>`, Reply-To per kind (#339). Function deployed v1. | DONE |
| 2.9 | Product e-mail **proven**: submit one `/contact` enquiry on the live site → `info@cqrityjob.com` receives it, the acknowledgement arrives with Reply-To `info@`, and Edge Functions → `transactional-email` → Logs show `contact_enquiry 200` and `contact_acknowledgement 200`. If `/contact` says the form is not open, `RESEND_API_KEY` is missing on the function. | OWNER ACTION |
| 2.10 | Resend domain `cqrityjob.com` shows **Verified** (SPF, DKIM, DMARC). Check in Resend → Domains. | OWNER ACTION |
| 2.11 | One real "Skicka test" to a synthetic candidate on your mailbox: `recruitment_messages.email_status = 'sent'` and the mail arrives. | OWNER ACTION |
| 2.12 | Receipts sweep cron (`RECRUITMENT_SWEEP_TOKEN` + GitHub secrets). Receipts are also swept on page load, so not required for launch. | DEFER AFTER LAUNCH |
| 2.13 | AU-01, AU-03, AU-04, EM-MAIL-03 (P3 items in `production-readiness/auth-and-email.md` §6). | DEFER AFTER LAUNCH |

## 3. SECURITY PASSPORT

| # | Item | Status |
|---|---|---|
| 3.1 | One holder, one Passport, one shareable image (#336): grouped credentials, six density tiers, one file per share, 1038 guard assertions, 21 negative controls, browser scenarios, evidence in `docs/passport/one-passport-evidence/`. | DONE |
| 3.2 | Status vocabulary (Egen uppgift / Dokument inlämnat / Dokumenterad / Källbekräftad) consistent from the public page to the shared card; "Documented in other markets" fix (#338). | DONE |
| 3.3 | Share links on the application domain (`/p/<token>`), `passport-share` v3 redirect-only, throttle keyed on the edge-set client IP. | DONE |
| 3.4 | Live share walk on the published site, private window and phone: create a share → link has no `#` → opens → QR opens the same view → revoke → reload → "not available" → social image download equals its preview. The last share session recorded is 2026-09-28 15:48 UTC, before #336 was published, so this has not been walked on the current build. | OWNER ACTION |
| 3.5 | 13 live disclosures still carry pre-#318 gateway links (one token was exposed in a screenshot). Revoke them under "Dina delningar" before UAT. | OWNER ACTION |
| 3.6 | `PASSPORT_SHARE_ENTRY_PUBLISHED=1` on the `passport-share` function: needed only if old gateway links must keep resolving. If 3.5 revokes them all, leave it unset. | OWNER ACTION (decision) |
| 3.7 | Gate B (HAYAT issuer verification): Credly permission not obtained; temporary copy live and truthful. | DEFER AFTER LAUNCH |
| 3.8 | Grouping the HTML Passport cards like the social image; the 15-credential readability bound. | DEFER AFTER LAUNCH |

## 4. CAREER DISCOVERY

| # | Item | Status |
|---|---|---|
| 4.1 | Release control `cd_access_policy` (internal_test / public / paused) applied hosted; anonymous v3.1 preview bounded (#338); CI-01 code complete (#322, #327). | DONE |
| 4.2 | Hosted state is `internal_test` with **0 testers**: no signed-in candidate can start or save Career Discovery today (platform admins only). Decide: `select public.cd_set_access_state('public', 'Owner UAT 2026-10')` as a platform admin, **or** `cd_grant_internal_tester(<user_id>, …)` for each UAT candidate. Without this, candidate UAT item 5.3 cannot pass. | BLOCKER (owner decision) |
| 4.3 | After 4.2: a signed-in candidate starts, completes and saves a run; My Career shows the result and the CTA; the report renders in SV and EN. | OWNER ACTION |
| 4.4 | Anonymous entrance → claim after sign-up carries the result to the account. | OWNER ACTION |
| 4.5 | Gate A (Säkerhetsarbete AI support): no activation, no key, no DPA; temporary copy live. | DEFER AFTER LAUNCH |

## 5. CANDIDATE UAT

Run on the published site, once in Swedish and once in English, desktop and phone, with a non-team mailbox.

| # | Item | Status |
|---|---|---|
| 5.1 | Register as a candidate → confirmation mail (2.3) → signed in at `/my-career`. | OWNER ACTION |
| 5.2 | Profile and CV: fill the profile, build the CQrityjob CV, export PDF. | OWNER ACTION |
| 5.3 | Career Discovery run saved (depends on 4.2). | OWNER ACTION |
| 5.4 | Jobs: search and filters keep URL state; open an ad; apply with a PDF CV (≤ 5 MB); "Mina ansökningar" shows it; application receipt mail arrives (Reply-To `job@`). A closed vacancy keeps its title and employer (#324/#328). | OWNER ACTION |
| 5.5 | Passport: create → add a credential with a document → HAYAT reads it in the browser → share (3.4). | OWNER ACTION |
| 5.6 | Academy: receive a test invitation (in-app and mail), complete at `/academy` with the deadline visible, see the released result. | OWNER ACTION |
| 5.7 | Privacy tick (JB-02): as the applicant, `GET /rest/v1/job_applications?select=employer_note` returns a column error, not the note. Database boundary already verified 2026-09-29; the HTTP tick is the owner's. | OWNER ACTION |
| 5.8 | Account deletion / anonymisation path from the profile. | OWNER ACTION |
| 5.9 | Code fixes behind these journeys (JB-01, JB-02, AS-01, AS-02, SP-01, contact-form reset, CV bound). | DONE |

## 6. EMPLOYER UAT

| # | Item | Status |
|---|---|---|
| 6.1 | Register an organisation at `/signup?redirect=%2Femployer` from a non-team mailbox → confirmation → `/employer/pending` "Företagskonto granskas" → registration receipt mail and the admin notice to `info@`. | OWNER ACTION |
| 6.2 | Admin approves (`moderate_employer`) → workspace opens; the employer gets no mail by design (status shown in-app). | OWNER ACTION |
| 6.3 | Draft a job → publish → it appears on `/jobs` and in the sitemap; archive works. | OWNER ACTION |
| 6.4 | Application pipeline: status change → in-app message to the candidate → mail delivered (Reply-To `job@`); employer note never visible to the candidate. | OWNER ACTION |
| 6.5 | "Skicka test" on an open application; button absent on a rejected or withdrawn application (#325); review → release result. | OWNER ACTION |
| 6.6 | Interview Intelligence manual journey: case → preparation → guided interview → evidence → human assessment → finalised report; no AI text anywhere. | OWNER ACTION |
| 6.7 | A member of another organisation cannot open this workspace (verified read-only on the database 2026-09-30; UI tick is the owner's). | OWNER ACTION |
| 6.8 | Gate C (BESKT): 0 published method versions; "Förberedelsen är inte öppen ännu" is the honest state. | DEFER AFTER LAUNCH |
| 6.9 | Employer-registration catch-up double-send under concurrent tabs (P3). | DEFER AFTER LAUNCH |

## 7. MOBILE / SV / EN

| # | Item | Status |
|---|---|---|
| 7.1 | Automated: CI runs the public entry, jobs bilingual responsive, Passport three-market and Passport sharing browser suites at desktop and 375 px, and the homepage hero at 390/1440 px in both languages; all green on `cb5c668`. | DONE |
| 7.2 | Locked hero "Security careers, without limits." is English on both language pages by decision (#343), `lang="en"`, never hyphenated. | DONE |
| 7.3 | Real-device pass (iPhone and Android, 375/390 px): home, `/plattformen` film and pills, Career Discovery, My Career, Passport incl. the share sheet, Jobs with the filter button, application dialog scroll, employer pipeline. Not run on a device yet. | OWNER ACTION |
| 7.4 | SV/EN language switch persists across sign-up, confirmation and setup (URL `lang` intent); no English leak on Swedish pages beyond the two brand lines. | OWNER ACTION |
| 7.5 | Known P3: SP-04 iOS numeric keypad on Passport date fields; II-02 English-only `<title>` on candidate interview pages. | DEFER AFTER LAUNCH |

## 8. PRODUCTION DATA CLEANUP

Inventory re-read today; it matches `production-readiness/production-data-hygiene.md` and nothing has been removed. Nothing is deleted until the owner ticks the row; removals go through the product's admin paths, never raw SQL.

| # | Item | Status |
|---|---|---|
| 8.1 | Revoke the 13 live Passport shares (same as 3.5). | OWNER ACTION |
| 8.2 | Test ads: "jkdshfkjdhsf" (cqrityjob, published, past deadline), "Bajskorv", "Testtitel SV", the untitled and "H32 … Draft" drafts (Säkerhet AB), `DEMO0001`–`DEMO0008` "[TEST DATA]". Remove (archive, then delete). | OWNER ACTION (approve) |
| 8.3 | 5 "(demo)" employers (Nordic Guarding, Aurora Corporate Security, Fjord Cyber Sentinel, Sentinel Public Safety, Kärnkraft Skyddscentrum): archive via `moderate_employer`, then remove. | OWNER ACTION (approve) |
| 8.4 | Unconfirmed test accounts `northstar.uat1@example.com`, `mvp-audit-candidate-20260725@example.com`: delete. | OWNER ACTION (approve) |
| 8.5 | Owner review rows: Säkerhet AB (11 jobs, 1 open), cqrityjob (2 open ads), Buller o bång (3 open ads), emma@, carl@hoglund.nu, shkachmed@gmail.com, the 51 Passport claims per holder. Decide keep / remove; the 6 open ads are what the public job board shows at launch. | OWNER ACTION (decide) |
| 8.6 | UAT accounts (5 mailinator, 3 closed-test.invalid, "STÄNGD TEST", Northstar, Shieldguard) and the 2 live assessment test grants: remove after UAT via `admin_delete_user_if_safe` / `admin_anonymise_user`. | DEFER AFTER LAUNCH (after UAT) |
| 8.7 | Storage erasure backlog: 9 rows in `storage_erasure_queue`; run `/admin/data` so deleted accounts' files are actually removed; confirm the queue drains. | OWNER ACTION |
| 8.8 | Anonymised `raderad+…@removed.invalid` accounts, catalogue and reference data, `sp_public_access_throttle`. | DONE (keep) |

## 9. GO-LIVE GATE

| # | Item | Status |
|---|---|---|
| 9.1 | Code complete and frozen at `cb5c668`; CI green; migrations in parity (329 = 329); no open PR. | DONE |
| 9.2 | Lovable's own agent commits land on `main` directly (ten "Changes" commits on 2026-09-30 re-pinned dependencies, regenerated types and the route tree; CI was red on that commit and recovered with #341–#343). No Lovable-chat edits during UAT; every change through a reviewed PR. | OWNER ACTION (process) |
| 9.3 | Security baseline merged and in CI: MCP gate closed, security headers, contact-form durable limits, no provider bodies in logs (#338). Live tick is 1.3. | DONE |
| 9.4 | RLS and isolation probes passed 2026-09-30 (342/342 tables with RLS, cross-tenant 0 rows, self-escalation refused); advisor ERROR accepted (#342). | DONE |
| 9.5 | Backups: Supabase Pro daily backups listed under Database → Backups; PITR decision recorded. | OWNER ACTION |
| 9.6 | Blockers cleared: 4.2 (Career Discovery access) decided and applied; 1.5 only before the domain cutover. | BLOCKER |
| 9.7 | Email proven end to end: 2.3, 2.9, 2.11 ticked. | OWNER ACTION |
| 9.8 | Candidate (5) and employer (6) UAT ticked in SV and EN; real-device pass (7.3) ticked. | OWNER ACTION |
| 9.9 | Data cleanup rows 8.1–8.5 and 8.7 done or explicitly postponed to before public release. | OWNER ACTION |
| 9.10 | Debt register (raw Postgres error text in ~239 server functions, full CSP, bucket MIME/size limits, performance advisors, CAPTCHA). | DEFER AFTER LAUNCH |

---

## MOSTAFA — DO THESE NEXT

1. In Lovable, press **Update/Publish** on `cb5c668` and confirm on the live site: hero "Security careers, without limits.", `/plattformen` loads, `curl …/.mcp/list-tools` → 404, security headers present (1.2, 1.3).
2. Prove Auth SMTP: register a candidate from a non-team mailbox on the live site, check the Auth log `mail_from`, open the link on a phone, then run a password reset (2.3, 2.4, 2.5).
3. Prove product mail: send one `/contact` enquiry; confirm `info@` receipt, the acknowledgement, and `contact_enquiry 200` in the `transactional-email` logs; confirm the Resend domain is Verified (2.9, 2.10).
4. Open Career Discovery for UAT: as platform admin run `select public.cd_set_access_state('public', 'Owner UAT 2026-10')`, or grant the UAT testers (4.2).
5. Revoke the 13 live Passport shares, then walk one new share on the live site in a private window and on a phone, incl. revoke (3.4, 3.5).
6. Run the candidate UAT (5.1–5.8) in SV and EN, desktop and phone.
7. Run the employer UAT (6.1–6.7) with a non-team organisation registration, incl. one "Skicka test" (2.11).
8. Tick the data-cleanup rows 8.2–8.5 and 8.7 (approve / decide); nothing is removed before your tick.
9. Finish `cqrityjob.com` in Lovable, decide apex vs `www`, add the domain to Supabase Auth Site/Redirect URLs and to the Google OAuth client, then approve the one code PR that moves `SITE_ORIGIN`, canonicals, sitemap and the share origin to the domain (1.4, 1.5, 1.6).
10. Confirm daily backups are listed and record the PITR decision, then sign the GO-LIVE GATE (9.5–9.9).
