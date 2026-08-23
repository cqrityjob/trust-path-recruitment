# Read-only platform/cutover check — external Supabase (`mlvzmiutmyyqeuvjglco`)

Nothing was edited, deployed, migrated or disabled. Current Cloud backend `zrahptwsnjcdyzfywbeh` is untouched.

## 1. Can this project be switched in place, keeping Cloud as rollback?

No — not as a supported in-place switch. Two independent confirmations:

- Lovable Cloud, once enabled on a project, cannot be disconnected from that project. Disabling Cloud in Connectors only affects future projects.
- Official documentation states there is no path to switch backends between built-in Cloud and an owned Supabase project in either direction; the documented route is a project that connects the owned Supabase project instead.

Verified locally that this is not merely a UI restriction: the runtime injects `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` as real process environment variables, all resolving to `zrahptwsnjcdyzfywbeh`. Vite's dotenv does not overwrite pre-existing process env, so committed `.env` values for those names are inert. Editing `.env` cannot repoint preview or published builds of this project.

## 2. Exact UI sequence for an in-place switch

Not applicable — there is no such sequence for a Cloud-enabled project. The "Already have a Supabase project? Connect it here" affordance appears for projects without a backend, which is not this project's state. Since no step exists, no step deletes, pauses or hides Cloud data. (Independently: the only Cloud-side actions that would make data inaccessible are pause or delete in Cloud advanced settings — neither is part of any cutover step recommended here, and neither should be performed.)

## 3. Is a second Lovable project the safest supported route?

Yes. Recommended shape:

1. New Lovable project, backend = the owned Supabase project (do not enable Cloud on it).
2. Link it to the same GitHub repository and a dedicated branch (e.g. `cutover/external-backend`), so hand-written code stays single-source. Expect generated files (`src/integrations/supabase/types.ts`, `client.ts`, `.env`) to diverge per project — treat them as project-local, not as shared code.
3. Test on that project's own preview/published URL with real journeys.
4. Move the custom domain only after owner acceptance. Rollback = point the domain back at this project; `zrahptwsnjcdyzfywbeh` still holds all data.

Since schema/data on `mlvz` is already replicated and verified, this route requires no data movement.

## 4. Injected values with an external Supabase project

- Browser/build: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (documented as build-time, browser-exposed values that live in the project `.env`; the connected project's values are what the generated client reads). `VITE_SUPABASE_PROJECT_ID` / `VITE_SUPABASE_ANON_KEY` follow the same generated pattern.
- Server-side: this codebase's server paths (`auth-middleware.ts`, `public-server.ts`, `client.server.ts`) read `process.env.SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. URL and publishable key are safe to supply.
- Service role: documentation describes the service-role key as a **secret you provide**, stored so that **Edge Functions** can read it — it does not state that it is auto-injected into a TanStack Start server runtime for a BYO-Supabase project.

**Unknown / must be confirmed with Lovable support before relying on it:** whether a BYO-Supabase connection auto-populates `SUPABASE_SERVICE_ROLE_KEY` (and `SUPABASE_DB_URL`) into the server/SSR process environment of a published TanStack Start app, or whether the owner must add it manually as a project secret. This matters because several admin paths in this codebase use `supabaseAdmin`. It cannot be verified from inside this Cloud-bound project.

## 5. Can the connection be completed by the agent/API?

No. There is no agent tool in this environment for linking or connecting an external Supabase project — all available Supabase tooling operates against the already-bound Cloud backend. Per documentation the link is established by connecting the Supabase **organization** to the Lovable **workspace** and then the project, which is an interactive action a workspace owner performs in the browser (docs describe it as an org/workspace link rather than a per-project OAuth grant). One signed-in browser session by a workspace owner is required; the owner's normal browser is sufficient and no remote/cloud browser is needed.

## 6. Project-specific blockers before an authenticated preview is safe

- **Google sign-in.** `src/integrations/lovable/index.ts` routes Google through the Lovable broker and then calls `supabase.auth.setSession`. The Google provider must be enabled in the target project's Auth; whether the Lovable broker works against a BYO-Supabase project, or whether the app must switch to native `signInWithOAuth` with owner-supplied Google credentials, is **unknown** and must be confirmed. This is the highest-risk item.
- **Auth URL allow-list.** The target project needs Site URL and Redirect URLs for the second project's preview URL, its published URL, and the final custom domain, or OAuth and email links fail.
- **Secrets.** Only `LOVABLE_API_KEY` exists today (AI Gateway; unrelated to the database but Lovable-managed and per-project — the second project needs its own if AI features are used). Any service-role need must be re-provisioned per point 4. `CQRITYJOB_MCP_ENABLED` / `CQRITYJOB_MCP_TOKEN` are intentionally unset, which keeps `/mcp` closed — verify they stay unset in the new project.
- **Edge Functions.** This codebase deliberately uses none (`createServerFn` and `src/routes/api/*` instead), so no function redeploy is needed — but that is also why the service-role question in point 4 is not answered by the Edge-Function-oriented documentation.
- **Generated client files.** `client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `types.ts`, `.env` and `supabase/config.toml` are platform-generated and must not be hand-edited; they will be regenerated for the target project. `supabase/config.toml` currently pins `project_id = "zrahptwsnjcdyzfywbeh"`, and `supabase/migrations-policy.json` records canonical→hosted mappings for the current backend — both are backend-specific and need review in the new project.
- **Storage.** Confirm the `job-application-cvs` bucket plus its policies exist on `mlvz` (stated as replicated; worth an explicit re-check, since bucket objects and policies are not always covered by a schema replication).
- **Release flags.** `VITE_JOBS_ENABLED`, `VITE_EMPLOYER_PORTAL_ENABLED`, `VITE_CIG_LIFECYCLE_ENFORCED` are read from `.env` (not injected) — confirmed — so they carry over with the repo, but `cig_governance_settings.lifecycle_enforced` must match on the target database.

## Summary

In-place switch: not supported. Safest route: second Lovable project on the owned Supabase project, same repo, separate branch and URL, domain cutover last, this project retained as rollback. Two items must be answered by Lovable support before an authenticated preview is trusted: server-side service-role availability for TanStack Start with BYO Supabase, and Google broker behaviour outside Lovable Cloud.
