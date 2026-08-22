# Read-only cutover check: pointing the frontend at an externally owned backend

Target external project: `mlvzmiutmyyqeuvjglco`. Current Lovable Cloud backend `zrahptwsnjcdyzfywbeh` stays untouched and is the rollback.

No code, data, migrations or deployments were changed by this check.

## 1. Do preview/published builds use the committed root `.env`?

Partly — and not for the two variables you named.

- The committed `.env` contains `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, plus the server-side `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PROJECT_ID` and three release-control flags.
- The runtime also *injects* `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` as real process environment variables from the Cloud binding. Verified in this sandbox: all of them resolve to `zrahptwsnjcdyzfywbeh`, and the injected values are byte-identical to the committed ones.
- Vite's dotenv loading does not overwrite variables that already exist in the process environment, so where both exist the injected Cloud binding wins and `.env` is effectively inert. The reason nothing looks different today is only that the two sources currently agree.
- The flags (`VITE_JOBS_ENABLED`, `VITE_EMPLOYER_PORTAL_ENABLED`, `VITE_CIG_LIFECYCLE_ENFORCED`) are *not* injected, so those genuinely come from `.env` (with `.env.local` able to override them locally).

Practical consequence: editing `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` in the committed `.env` will most likely **not** repoint preview or published builds while Lovable Cloud remains bound to `zrahptwsnjcdyzfywbeh`.

## 2. Can this project keep Lovable as frontend/hosting and use an externally owned Supabase project?

Yes in principle, but not by editing `.env` alone, and it is a real architectural change rather than a config tweak. Three things must line up:

- **Client reads.** `src/integrations/supabase/client.ts` reads `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` with a `process.env.SUPABASE_*` SSR fallback. It is auto-generated and must not be edited.
- **Server reads.** `src/integrations/supabase/auth-middleware.ts`, `public-server.ts` and `client.server.ts` read `process.env.SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key for an external project is not something Lovable Cloud can supply; it would have to be provided as a project secret, and a Cloud-bound project keeps injecting its own.
- **Schema parity.** The app depends on the full hosted schema: ~66+ tables, 50+ RPCs, RLS policies, storage buckets (`job-application-cvs`), auth users, and the whole `scp_*` / `cd_*` / passport surface, plus generated `src/integrations/supabase/types.ts`. The external project must be a faithful replica (migrations replayed in order, storage buckets and policies recreated, auth users migrated) or large parts of the product fail at runtime, not at build time.

Also note Lovable-Cloud-specific pieces that do not travel: Google OAuth via the Lovable broker (`src/integrations/lovable/index.ts` calls `supabase.auth.setSession`, and the provider must be enabled on the *target* project's Auth), and the AI Gateway key (`LOVABLE_API_KEY`) which is unrelated to the database but is Lovable-managed.

Recommendation: treat this as "disconnect Cloud, then supply external config", not "override committed values". The decision of whether Cloud can be unbound for this project while hosting stays is a platform-level action and needs to be confirmed with Lovable support/settings before any cutover date is set — this plan does not assume it is available.

## 3. What would override the committed values

| Source | Overrides `.env`? | Notes |
| --- | --- | --- |
| Lovable Cloud binding (injected `VITE_SUPABASE_*`, `SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`) | Yes — highest precedence | Currently all `zrahptwsnjcdyzfywbeh` |
| Project Settings → Secrets | Yes, for server-side `process.env` names | Only `LOVABLE_API_KEY` exists today |
| `.env.local` / `.env.*.local` | Yes, over `.env`, but not over injected process env | git-ignored |
| Committed `.env` | Lowest | Effective only for the three `VITE_*` flags today |

Auto-generated and not to be edited: `client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `types.ts`, `supabase/config.toml`, and the Cloud-managed `.env` keys.

## 4. Safest reversible preview procedure

Ordered, each step reversible, nothing touching `zrahptwsnjcdyzfywbeh`:

1. **Freeze a rollback fingerprint.** Record current main commit, hosted migration ledger max version, table/function/policy counts, and the current injected project ref — into `docs/technical/production-fingerprints/pre-external-backend-cutover.md`. No behaviour change.
2. **Confirm the platform question** (Cloud unbinding vs. permanent injection) before spending effort on step 4. If injection cannot be turned off, cutover on this project is not possible and a new Lovable project bound to the external backend is the alternative path.
3. **Build schema parity on `mlvzmiutmyyqeuvjglco`.** Replay `supabase/migrations` in order against the external project, recreate storage buckets and their policies, seed reference/content data, and diff object counts against the fingerprint. Read-only with respect to the current backend.
4. **Preview locally, not in shared preview.** Use a git-ignored `.env.local` with the external `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (and `SUPABASE_*` equivalents) and confirm from the running app which project ref the client actually reached. If the injected Cloud values still win, that is the definitive answer to step 2 — stop there.
5. **Verify the journeys, not the boot.** Candidate discovery → report, employer job publish → application → CV download, assessment assign → attempt → review → release, admin portal, and both Swedish and English UI. Also verify denial cases (cross-tenant reads, anon access to `scp_*` and `cd_option_loadings`) on the external project's RLS.
6. **Regenerate `types.ts` only against a verified-parity external project**, on a branch, never on main.
7. **Cutover** only after owner approval, as a separate change with a documented one-step rollback: remove the external config, restore the Cloud binding, redeploy the recorded commit. `zrahptwsnjcdyzfywbeh` keeps all data throughout, so rollback is configuration-only.

Stop conditions: schema parity cannot be demonstrated; service-role access for the external project cannot be supplied without exposing it client-side; auth users cannot be migrated with sessions/identities intact; or the Cloud binding cannot be released.
