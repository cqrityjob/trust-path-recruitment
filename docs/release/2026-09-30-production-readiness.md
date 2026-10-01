# Production readiness — controlled pilot audit (2026-09-30)

**Scope.** This is an audit and activation pass on the existing platform
before controlled real-user testing. It is not a redesign and not new
product work.

**Baseline.**
- Repository: `main` at `5b9ea3c`, the PR #337 merge.
- Production: Supabase project `wrygicdfxwjnrugduxnt`, "CQrityjob
  Production", eu-central-1, Postgres 17.6, `ACTIVE_HEALTHY`.
- Lovable project "Security Talent Hub": published, and its latest commit is
  the same `5b9ea3c`.

**Method.**
- Production was read through the Supabase management tools.
- Every probe that wrote anything ran as a simulated `anon`, `authenticated`
  or `service_role` caller inside a transaction that was forced to roll
  back.
- No production row was created, changed or deleted. No migration was
  applied, no Edge Function was deployed and nothing was published.
- The container's network policy blocks `cqrityjob.com`, `*.lovable.app`, the
  Supabase HTTP API and the private npm registry. So live HTTP headers,
  browser journeys and Resend could not be observed from here (see
  "Not verifiable from here").

## 1. Inventory

### Git and migrations

| Item | Value |
|---|---|
| Base SHA | `5b9ea3cca2f6ae7ae1fb381b5af30dbb7c3c1f31` |
| Migrations in the repository | 329, latest `20261226090000_application_notes_column_privileges` |
| Migrations applied in production | 329, latest `20261226090000` |
| Drift | **None.** The two version sets are identical (diffed one by one). |
| Pending migrations | None |
| Migrations added by this work | None |

### Supabase

| Area | State |
|---|---|
| Project and Postgres health | `ACTIVE_HEALTHY`. No ERROR or FATAL in Postgres logs over the last 24 h. |
| Tables with RLS | 342 of 342 application tables (public, sw_private and the others) |
| Storage buckets | 3, all **private**: `passport-evidence` (10 MB, pdf/jpeg/png/heic), `sw-documents` (10 MB, pdf/docx), `job-application-cvs` (no bucket-level size or type limit; the app enforces 5 MB) |
| Edge Functions | 1: `passport-share` v3, `verify_jwt=false`. It is a body-less 302/503 redirect and never sees a token. |
| Security advisors | 1 ERROR, `security_definer_view` on `scp_scoring_version_lineage`. This is **intentional** (migrations `20260727150000` and `20260801100000`; left untouched by `20261116090000`): the view exposes only version metadata with no numbers, to authenticated users. **Reviewed / accepted risk / no action required**: see `production-readiness/supabase-production-hardening.md` §3. Plus WARN (see below) and 19 INFO `rls_enabled_no_policy` (service-role-only tables, by design). |
| Security WARN | `auth_leaked_password_protection` is off. `unaccent` is in the public schema (deferred, as recorded before). 343 authenticated and 5 anon SECURITY DEFINER functions are executable. That is the RPC architecture; they were not re-audited one by one here, and the escalation probes below cover the privileged paths. |
| Backups | Supabase Pro includes daily backups. PITR is a paid add-on and was **not** enabled; enabling it needs the owner's approval of the cost. The backup list is not visible through the tools available here. |

### Environment and secrets (names only)

App-host secrets live in Lovable hosting, and Edge Function secrets in
Supabase. Neither can be listed from here, so each status below is taken
from what production recorded.

| Name | Status | Evidence |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | PRESENT | Service-role paths work in production (10 CVs stored through `submitJobApplication`) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | **MISSING** | The latest product mail, 2026-09-29 16:52 UTC, was recorded `not_configured` |
| `ADMIN_NOTIFICATION_EMAIL` | UNKNOWN | Should be `info@cqrityjob.com` |
| `PUBLIC_SITE_URL` (app host and `passport-share`) | UNKNOWN | The code falls back to `https://trust-path-recruitment.lovable.app` |
| `PASSPORT_SHARE_ENTRY_PUBLISHED` (function) | UNKNOWN | Needed only for share links in the legacy gateway form |
| `RECRUITMENT_SWEEP_TOKEN` | NOT REQUIRED for pilot | Receipts are also swept when the page loads |
| `CQRITYJOB_MCP_ENABLED`, `CQRITYJOB_MCP_TOKEN` | NOT REQUIRED | Leave both unset, so MCP stays closed |
| `SW_AI_*`, `SW_ANTHROPIC_API_KEY`, `SW_WORKER_KEY_ID`, `SW_WORKER_SECRET` | MISSING | Required only for gate A. 0 worker-key rows. |
| `SW_PROCESSOR_AUTH_TOKEN` | NOT REQUIRED | No document processor is deployed |
| Supabase Auth custom SMTP | **MISSING** | The last Auth mail (2026-09-26) went via `noreply@mail.app.supabase.io`, the default mailer, which delivers only to project-team addresses |

## 2. Security findings

### RLS and data isolation: PASS

**Anonymous probe.** Of 41 tables readable by `anon`, the non-empty ones hold
only public catalogue data:
- occupation graph (`cig_*`), assessment catalogue, CD definition version;
- active employers (3) and active jobs (3), with the screening questions and
  requirements of those jobs.

No profile, application, Passport, BESKT, TRUST/interview, AI workspace or
report row is visible.

**Unaffiliated authenticated probe.** A synthetic `sub` with no memberships
sees data only in 325 reference tables (catalogues, credential taxonomy,
content definitions) and nothing personal.

**Cross-tenant probe.** Every real employer member and applicant (13 users)
was impersonated. The probe returned counts only, no content.
- Foreign applications, foreign non-public jobs, other users' profiles,
  other holders' Passport evidence objects and CVs outside the employer's
  own applications were all **0** for every non-admin user.
- The two users who saw foreign rows are the platform admin and superadmin,
  which is expected.

**Self-escalation probes** (rolled back):
- An owner setting their own employer from `pending` to `active` is blocked:
  "employers.status can only be changed via moderate_employer()".
- Inserting a membership in another employer is blocked by RLS.
- Updating another user's profile changes 0 rows.
- `authenticated` has no write grant on `user_roles`, `sw_ai_activations`,
  `sw_workspace_memberships`, `beskt_governance_grants`, `bcp_pilot_grants`,
  `sp_pilot_members`, `scp_test_grants`, `beskt_method_versions` or
  `sp_credential_adapter_mappings`.
- Profile column grants cover only `display_name`, `locale`, `country` and
  timestamps.

**Passport share expiry and revocation.**
- `sp_get_disclosure_session` re-checks `revoked_at` and `expires_at` for
  both the share and the session **on every read**.
- The gateway RPCs and the throttle are executable by `service_role` only.

**Storage.**
- Every bucket is private, with owner-folder policies.
- The employer CV read is tied to an application of the employer's own.
- The restrictive `sp_evidence_session_read` policy is RESTRICTIVE, as
  intended.

### Defects found and fixed in this PR

| Pri | Finding | Fix |
|---|---|---|
| **P1** | `/.mcp/list-tools` and `/.mcp/invoke-tool/$tool` mounted the whole MCP tool set (question bank, profession target profiles i.e. calibration, matching engine) **with no access control**, even though `/mcp` itself was closed. This was flagged in `docs/security/2026-09-27/reconciliation/handoff.md`, never fixed, and is live in the published build. | One gate, `src/lib/mcp/access.ts`, now guards `/mcp`, both side routes and `/.well-known/oauth-protected-resource`. Closed unless `CQRITYJOB_MCP_ENABLED=true` **and** a bearer token of at least 16 characters is configured and presented (the old "enabled without a token" mode is gone). `mcp-exposure:check` covers all four routes and now runs in CI. |
| P1 (contact) | The contact form's only abuse limits were in memory per isolate, which bounds nothing on edge hosting. A bot changing the typed address bypassed them, and could lock the form for everyone. | Durable limits through the existing `sp_throttle_public_access` (no migration): 5 per client per hour, and 3 per recipient address per day. Only salted hashes are stored. The in-memory limits stay as a backstop. |
| P2 | The assessment-invitation sender logged the provider's response body, which can contain the candidate's address. | Logs the status only, with a trimmed error. Guarded in `invitation-email-guard:check`, which now runs in CI. |
| P2 | No security headers on app responses (clickjacking on admin and employer pages, no HSTS). | Conservative baseline in `src/lib/http/security-headers.ts`: nosniff, Referrer-Policy, Permissions-Policy, HSTS on https, and CSP `frame-ancestors 'self' https://lovable.dev` only (the Lovable editor). A route's own headers (the `/p` CSP) are never overwritten. New `security-headers:check` in CI. |
| P2 | Passport `/passport/information` showed documented credentials, including document-reviewed ones, under "Verifierat i andra marknader" / "Verified in other markets". | Now "Dokumenterat i andra marknader" / "Documented in other markets", matching the card's existing "Dokumenterade marknader". Guarded in `passport-market-profiles:check`. |
| P3 | The share throttle keyed on the **first** `X-Forwarded-For` entry, which the caller chooses. | `src/lib/http/client-ip.ts`: `cf-connecting-ip`, otherwise the last hop. Used by the share and contact throttles. |
| P3 | No upper bound before decoding the CV upload, or on the answers array of the anonymous `previewPublicV31Run`. | Zod `.max()` on both. |
| P3 | The contact form stuck on "Skickar …" after a `closed` answer. | Resets to idle. |

### Findings recorded, not fixed here (see the debt register)

- About 239 server functions `throw new Error(error.message)` with raw
  Postgres messages. This exposes table and policy names, but no data and no
  stack.
- Registration, reset and resend rely on Supabase Auth's own rate limits.
  There is no CAPTCHA.
- `job-application-cvs` has no bucket-level size or type limit. The app
  enforces 5 MB.
- The legacy anonymous assessment-token server functions are dead surface.
  The tokens are 32 random bytes and stored hashed.

### Performance advisors

The findings: 453 INFO unindexed foreign keys, 313 WARN `auth_rls_initplan`,
134 INFO unused indexes and 86 WARN multiple permissive policies. None of
them affects stability at pilot scale (20 users, a handful of rows per
table). They are recorded as later debt.

## 3. Product gates, against production

| Gate | Production state | Result |
|---|---|---|
| A: AI | 0 `sw_ai_activations`, 0 `sw_private.worker_keys`, 0 `sw_ai_runs`. No provider key, no DPA. The provider adapter (Anthropic Messages API, server-side in `src/lib/security-work/processing/ai.server.ts`) is code-complete, and an activation row can be created only by the database owner. | **NOT LIVE** |
| B: HAYAT | The only source, `CREDLY_OB2`, is `enabled: false` because written permission from Credly/Pearson has not been obtained. `PRODUCTION_ISSUER_POLICIES = []`. 0 `sp_hayat_assessments`. OCR runs in the browser only and cannot produce Source-confirmed; `effectiveTrust` reaches `source_confirmed` only through employer confirmation. | **NOT LIVE** |
| C: BESKT | **0** `beskt_method_versions` rows: nothing authored, reviewed or published. Publication needs 5 independent governance-gate approvals and a publisher who is not the author. | **NOT LIVE** |

No gate was forced. No fake activation, source or publication was created,
and the public copy stays on its truthful temporary wording.
`docs/public-website/release-gates.md` records the re-check and adds the
missing `pilot_availability='open'` condition to gate C.

**Passport vocabulary.**
- The display labels map to `effectiveTrust()`, not to the stored
  `assertion_level`, which stores `verified` for CQrityjob document reviews
  too:
  - Egen uppgift / Self-declared
  - Dokument inlämnat / Document provided
  - Dokumenterad / Documented
  - Källbekräftad / Source-confirmed
- The one live surface that said "Verifierat" for documented credentials is
  fixed above.
- The prototype-only `disclosure.ts` package is reachable only under the
  DEV-guarded `/dev/security-passport`.

## 4. AI data path (as implemented; not active)

The path is: browser → TanStack server function (`requestWorkAiDraft`) →
`sw_reserve_processing` / `sw_dispatch_processing` (fenced, budgeted per
UTC day) → `POST https://api.anthropic.com/v1/messages` from the app server
→ validated JSON → `sw_processing_jobs.output` (at most 256 KB) → a draft
the user applies and edits → a separate `sw_approve_report`.

**What leaves Supabase for the provider:**
- the fixed system prompt;
- only **accepted** source extracts (text, hash, locator, title/publisher/date);
- the user's own inputs and answers;
- the method snapshot.

Segments that match prompt-injection patterns are withheld.

**What is stored and logged:**
- The validated output and its hash are stored. Thinking blocks are
  discarded.
- There is no `console` logging of content in the AI modules.

**Data-handling notes:**
- Personal data can reach the provider if a user types it or uploads it in
  a document.
- Documents are sent as extracted text, never as files.

Privacy copy and the DPA have to reflect this before activation.

## 5. Email routing map

| Mail | From | To | Reply-To |
|---|---|---|---|
| Contact enquiry (`/contact`) | `RESEND_FROM_EMAIL` (e.g. `CQrityjob <noreply@cqrityjob.com>`) | `ADMIN_NOTIFICATION_EMAIL` = `info@cqrityjob.com` | the enquirer |
| Contact acknowledgement (new, SV/EN, fixed text) | `RESEND_FROM_EMAIL` | the enquirer (at most 3 per address per day) | `info@cqrityjob.com` |
| Employer registration, to the applicant | `RESEND_FROM_EMAIL` | the registrant | none |
| Employer registration, to the admin | `RESEND_FROM_EMAIL` | `info@cqrityjob.com` | none |
| Application receipt (CQrityjob to candidate) | `RESEND_FROM_EMAIL` | the candidate | **`job@cqrityjob.com`** (new) |
| Employer message to a candidate | `RESEND_FROM_EMAIL` | the candidate | none (the reply belongs to the employer; owner decision) |
| Assessment and academy invitations | `RESEND_FROM_EMAIL` | the invitee | none |
| Auth: confirm, reset, magic link | Supabase Auth **default mailer**, to be replaced by custom SMTP through Resend | the user | n/a |

All links use `PUBLIC_SITE_URL`, falling back to the Lovable origin.
Failures log an HTTP status or error code only, never a body or an address.

## 6. Not verifiable from here

The following could not be checked, because the environment's network
policy denies these hosts:
- Resend domain status (SPF, DKIM, DMARC);
- delivery to `info@` and `job@`;
- live HTTP headers on `cqrityjob.com`;
- browser journeys, SV and EN, desktop and mobile;
- `curl` against `/.mcp/*`.

Each has a verification step in the owner actions.

## 7. Technical debt register

| Priority | Debt | Risk | Recommended action | When |
|---|---|---|---|---|
| P1 | Supabase Auth uses the default mailer | Non-team users receive no confirmation or reset mail | Custom SMTP through Resend (owner action 3) | Before public pilot |
| P1 | Resend secrets missing on the app host | Contact form closed; no product mail | Owner actions 1 and 2 | Before public pilot |
| P2 | About 239 server functions return raw Postgres error text | Schema and policy names disclosed (no data, no stack) | Map to error codes in the shared helpers, one module at a time | First 30 days |
| P2 | Leaked-password protection off; no CAPTCHA on sign-up or reset | Weak passwords; sign-up mail abuse | Toggle HIBP now; consider Supabase CAPTCHA | First 30 days |
| P2 | `PUBLIC_SITE_URL` falls back to the Lovable origin | Mail links to the Lovable subdomain | Set the secret, then remove the hard-coded fallback once the custom domain is the origin | First 30 days |
| P2 | Full CSP (script and style) not set | XSS impact is not reduced | Report-only CSP first, then enforce | First 30 days |
| P3 | `job-application-cvs` has no bucket size or MIME limit | Storage cost if the app check is bypassed | Set 5 MB and pdf/docx on the bucket | Later |
| P3 | Legacy anonymous assessment-token server functions | Dead attack surface (tokens are strong) | Remove with their retired route | Later |
| P3 | Performance advisors (FK indexes, `auth.uid()` initplan) | Latency at scale | Batch migration when traffic justifies it | Later |
| P3 | Employer-registration catch-up can double-send under concurrent tabs | A duplicate notice mail | Claim/lock as in the recruitment path | Later |

## 8. Owner actions (Mostafa)

1. **Resend domain.** Resend → Domains → add or verify `cqrityjob.com`, then
   publish the SPF (TXT), DKIM (CNAME/TXT) and return-path records Resend
   displays at the DNS host. Add or check DMARC; a safe start is
   `v=DMARC1; p=none; rua=mailto:info@cqrityjob.com`.
   Verify: Resend shows "Verified".
2. **App-host secrets** (Lovable → Project → Settings → Secrets; do not paste
   them into chat):
   - `RESEND_API_KEY` (a sending-only key)
   - `RESEND_FROM_EMAIL=CQrityjob <noreply@cqrityjob.com>`
   - `ADMIN_NOTIFICATION_EMAIL=info@cqrityjob.com`
   - `PUBLIC_SITE_URL=https://<public origin>`

   Verify: `/contact` shows the form (not "not open yet"), and one test
   enquiry reaches `info@` with the acknowledgement in the test mailbox.
3. **Supabase Auth SMTP** (Dashboard → Authentication → Emails → SMTP):
   host `smtp.resend.com`, port 465, user `resend`, password = a Resend key,
   sender `noreply@cqrityjob.com`, name `CQrityjob`. Then raise the email
   rate limit (for example 30/hour), set the Site URL and Redirect URLs, and
   enable **leaked-password protection**.
   Verify: a sign-up from a non-team test address receives the confirmation.
4. **Publish** the merged PR in Lovable.
   Verify: `curl -s -o /dev/null -w '%{http_code}' https://<origin>/.mcp/list-tools`
   returns `404`, and `curl -sI https://<origin>/` shows
   `x-content-type-options`, `referrer-policy`,
   `content-security-policy: frame-ancestors …`.
5. **Backups.** Dashboard → Database → Backups: confirm that daily backups
   are listed. Decide separately whether to buy PITR.
6. **Gates A, B and C** remain owner and business decisions (DPA and key;
   Credly permission; five BESKT reviews). Nothing in them blocks the pilot
   of the other features.
