# Hostinger production checklist — CQrityjob application

**Purpose:** everything Hostinger needs to run this repository from GitHub, and the order to do it in. **No deployment, DNS change or purchase is made by this document.** Values are types and requirements, never secrets. Audited against `main` at `b7ed12f` (2026-09-28).

## 0. Migration principle

```
GitHub main  →  Hostinger STAGING (own subdomain)  →  smoke tests + owner UAT  →  production domain
```

Not: Lovable production → immediate DNS switch. Lovable keeps serving the current site until Hostinger staging has passed UAT; the Supabase project is shared by both (same database, same Auth), so both origins must be on the Auth allow-list during the overlap. Rollback = point DNS back at the previous host; nothing in the database depends on the host.

## 1. What the application is

- **Framework:** TanStack Start (React 19, Vite 8) with server-side rendering and server functions; build config from `@lovable.dev/vite-tanstack-config` (`vite.config.ts`).
- **Server:** Nitro 3 (`nitro@3.0.260603-beta`). The Lovable config **defaults the Nitro preset to `cloudflare-module`**; on Hostinger it must be the Node server preset. The config package documents `nitro: { preset: '…' }` as the override; Nitro also honours `NITRO_PRESET`. Use `node-server` (verify the exact preset name for the installed Nitro version on the first staging build; the build log prints the preset).
- **Custom server entry:** `src/server.ts` (`tanstackStart.server.entry = "server"`), an `export default { fetch(request) }` handler that answers `/p`, `/p/open`, `/p/handoff` (Passport share transport, its own CSP) before SSR and wraps SSR errors. Must be verified once under the Node preset (smoke test 9).
- **Backend:** Supabase only (PostgreSQL, Auth, Storage, RLS, RPCs, one edge function `passport-share`). The application server talks to Supabase with the anon key under the caller's JWT, and with the service-role key for the few server-only paths (`SUPABASE_SERVICE_ROLE_KEY`). No other database, cache or queue.
- **Runtime:** Node.js ≥ 22 LTS (the repo pins no `engines`; CI uses Bun for install/scripts, Node 22 is what the container ran). Package manager for install: **Bun** (`bun.lock`); npm works too via `package-lock.json` but is not what CI validates.

## 2. Build and start contract

| Step | Command | Notes |
|---|---|---|
| Install | `bun install --frozen-lockfile` | see the lockfile risk in §8 |
| Build | `bun run build` (`vite build`) with `NITRO_PRESET=node-server` (or the `nitro.preset` override) | output `.output/` (server + public); `dist/.lovable/routes.json` is Lovable-only and unused here |
| Start | `node .output/server/index.mjs` | listens on `PORT` (default 3000) and `HOST`; run under a process manager (PM2, systemd or a Docker container) |
| Health check | **none exists** — add one (e.g. `GET /api/health` returning 200 with the git SHA) before staging, or point the platform check at `GET /` with a 200 expectation | a dedicated endpoint is the smaller risk: `/` performs SSR |
| Logs | `console.error` / `console.log` to stdout/stderr; no log shipper. Capture stdout at the process manager and rotate | server errors are logged with their cause by `src/server.ts` |

Reverse proxy (Nginx/Caddy or the platform's edge): terminate TLS, forward `Host`, `X-Forwarded-Proto`, `X-Forwarded-For`; set `Strict-Transport-Security` at the edge (the app does not); allow request bodies for CV upload (≥ 6 MB for a 5 MB PDF).

## 3. Environment variables (see `environment-variables.md` for the full inventory)

Server-only (never exposed to the browser):

```
SUPABASE_URL                 = required, server   (https://<ref>.supabase.co)
SUPABASE_PUBLISHABLE_KEY     = required, server   (anon/publishable key; public by design but read server-side too)
SUPABASE_SERVICE_ROLE_KEY    = required, server SECRET
PUBLIC_SITE_URL              = required, server   (the public https origin of THIS deployment)
RESEND_API_KEY               = required for product mail, server SECRET
RESEND_FROM_EMAIL            = required for product mail, server
ADMIN_NOTIFICATION_EMAIL     = required for employer-registration notices, server
RECRUITMENT_SWEEP_TOKEN      = required if the receipts sweep is enabled, server SECRET
CQRITYJOB_MCP_ENABLED        = optional, server (default off)
CQRITYJOB_MCP_TOKEN          = optional, server SECRET (only with the above)
INTERVIEW_AI_PROVIDER, INTERVIEW_AI_ENVIRONMENT, ANTHROPIC_API_KEY   = leave unset (AI off)
SW_AI_ENABLED, SW_AI_PROVIDER, SW_AI_MODEL, SW_AI_ENVIRONMENT, SW_ANTHROPIC_API_KEY,
SW_WORKER_KEY_ID, SW_WORKER_SECRET, SW_PROCESSOR_URL, SW_PROCESSOR_AUTH_TOKEN         = leave unset (Security Work AI off)
NITRO_PRESET                 = node-server (build time)
PORT, HOST                   = runtime
```

Public (baked into the browser bundle at build time):

```
VITE_SUPABASE_URL             = required, public
VITE_SUPABASE_PUBLISHABLE_KEY = required, public (anon key)
VITE_PUBLIC_SITE_URL          = required, public (the same origin as PUBLIC_SITE_URL; share links and QR codes use it)
VITE_JOBS_ENABLED             = "true", public (release-control flag, not a security boundary)
VITE_EMPLOYER_PORTAL_ENABLED  = "true", public (same)
VITE_CIG_LIFECYCLE_ENFORCED   = "false", public (mirror of a DB setting; do not flip alone)
VITE_PASSPORT_LOCAL_INTEGRATION = unset in production
```

**Flag any `VITE_*` that carries a secret:** none today. Keep it that way; the build embeds every `VITE_*` value in public JavaScript.

## 4. Supabase-side settings that name the application origin

- Auth → URL configuration: Site URL and Redirect URLs (`https://<staging>/**`, `https://<production>/**`), see `auth-and-email.md`.
- Edge function `passport-share` secrets: `PUBLIC_SITE_URL` = the production origin (it redirects `…/functions/v1/passport-share#token` links there) and `PASSPORT_SHARE_ENTRY_PUBLISHED=1` only once `/p` answers on that origin.
- Storage: no origin dependency. CORS: PostgREST/Auth accept any origin with the anon key; nothing to configure.

## 5. Scheduled and background work

- **Recruitment receipts sweep:** `.github/workflows/recruitment-receipts-sweep.yml` (cron every 15 min) calls `POST <RECRUITMENT_SWEEP_URL>/api/recruitment/receipts-sweep` with `RECRUITMENT_SWEEP_TOKEN`. Repository secrets `RECRUITMENT_SWEEP_URL` and `RECRUITMENT_SWEEP_TOKEN` must point at the Hostinger origin after the move; the token must match the server variable. Receipts are also swept opportunistically when an employer opens the overview, so a missed cron only delays them.
- **Security Work processor** (`deploy/security-work-processor`, Dockerfile + `fly.toml`): a separate worker for Security Work AI processing. **Not required for launch** (Security Work AI is off). If ever enabled, it is its own service with its own secrets.
- No other cron, queue or long-running job. Edge function `passport-share` is deployed by Supabase, not by Hostinger.

## 6. Domain and TLS

- Production domain: the CQrityjob domain (owner decision on apex vs `www`); staging on a subdomain the owner names.
- TLS at Hostinger's edge; HSTS at the edge; `PUBLIC_SITE_URL` / `VITE_PUBLIC_SITE_URL` must equal the exact scheme+host users see (share links, mail links, QR codes are built from it).
- Update in the same window: Supabase Site URL / Redirect URLs, `passport-share` `PUBLIC_SITE_URL`, GitHub secret `RECRUITMENT_SWEEP_URL`, the hard-coded fallback `SITE_ORIGIN` in `src/lib/job-intelligence/seo.ts` (used only when `PUBLIC_SITE_URL` is unset; a code change to the new domain is recommended before launch), `sitemap.xml` / canonical URLs (`src/routes/sitemap[.]xml.ts`, route `head()` canonicals use `trust-path-recruitment.lovable.app` literally — code change required for the production domain).

## 7. Security headers and the `/p` route

- The app sets no global CSP/HSTS/X-Frame-Options; `/p`, `/p/open` and `/p/handoff` set their own strict headers (nonce CSP without `'self'`, `private, no-store`, `no-referrer`, `noindex`, `nosniff`). **The edge must not strip or rewrite headers on `/p*`**, must not inject scripts into HTML on `/p`, and must not log the URL fragment (browsers never send it; verify the platform's access log format prints only the path).
- Recommended edge headers for every other route: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or a CSP `frame-ancestors 'none'`). Adding a global CSP is a code/owner decision after staging; the SSR HTML uses inline styles/scripts from Vite.
- Analytics: Lovable injects `/~flock.js` on its host; Hostinger will not. If an analytics script is added later, it must be excluded from `/p*`.

## 8. Risks found in the repository for a non-Lovable host

1. **Lockfile registry.** `bun.lock` resolves 95 packages to `https://europe-west1-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/…` (Lovable's cache). `bun install --frozen-lockfile` therefore depends on that host being reachable from the Hostinger build (GitHub Actions can reach it today). **Recommendation (owner decision, separate PR):** re-resolve the lockfile against `registry.npmjs.org` so production builds do not depend on Lovable infrastructure. `@lovable.dev/vite-tanstack-config` itself is published on npm.
2. **Nitro preset** defaults to Cloudflare (see §1) — must be overridden.
3. **Hard-coded Lovable origin** in `seo.ts`, canonical URLs, `sitemap.xml` and the `passport-share` fallback — code change for the production domain.
4. **No health endpoint** — add before staging.
5. **`dist/.lovable/routes.json`** is written for Lovable's serving layer; harmless elsewhere.
6. The **preview auth-storage broker** (`src/integrations/supabase/previewAuthStorage.ts`) activates only on `id-preview--<uuid>` hosts inside the Lovable editor; on Hostinger it is plain `localStorage` — no change needed.

## 9. Staging smoke tests (must pass before the DNS switch)

1. `GET /` renders SSR HTML (200) in SV and EN; language toggle persists.
2. Sign up with a controlled mailbox → confirmation mail arrives (custom SMTP) → link lands signed in on the staging origin (allow-list).
3. Password reset lands on `/reset-password` and works.
4. `/jobs` lists the live ads; a job page renders; internal application with a 5 MB PDF succeeds (body size at the edge).
5. Employer registration → `/employer/pending`; an admin approval makes the workspace open.
6. Career Discovery: anonymous completion + claim at signup; signed-in start (after `cd_set_access_state('public')`).
7. Passport: add a credential with a document (Storage upload through the server function), share → copied link is `https://<staging>/p#…` → opens in a private window; `curl -sI https://<staging>/p` shows the nonce CSP without `'self'`; revoke → "not available".
8. Employer "Skicka test" → candidate completes → result released.
9. `curl -X POST https://<staging>/p/open` without a body → the "not available" page, not a 500; `curl -X PUT https://<staging>/p` → 405.
10. `POST /api/recruitment/receipts-sweep` with the token → 200; without → 401/403.
11. Mobile (375 px, 390 px): home, Career Discovery, My Career, Passport, Jobs, application dialog.
12. Server logs show no unhandled errors during the walk; process restarts on crash (process manager).

## 10. Cut-over and rollback

1. Freeze changes on `main`; confirm the Hostinger build is at the intended commit (print the SHA on the health endpoint).
2. Add the production domain to the Auth allow-list and set Site URL; set `PUBLIC_SITE_URL` on the function; keep the Lovable origins listed.
3. Switch DNS; verify smoke tests 1–3 and 7 on the production domain; set `PASSPORT_SHARE_ENTRY_PUBLISHED=1`.
4. Watch Supabase Auth logs (`mail.send` with your `mail_from`) and the app logs for 24 h.
5. **Rollback:** point DNS back at Lovable (still published at the same commit), unset the function switch if `/p` no longer answers, restore Site URL. No database step.
6. Retire the Lovable origins from the allow-list only after the overlap ends; Lovable stays as a development tool via GitHub.
