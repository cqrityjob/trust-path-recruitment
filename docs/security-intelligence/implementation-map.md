# CQrityjob Security Intelligence — implementation map

Baseline: `bb4e849b43960f9c82907e08965e51c57a9a3261`, fetched 2026-09-23 after PR #286.
Product: **Mitt säkerhetsarbete / My Security Work**, **Från signal till säkerhetsbeslut / From signal to security decision**.

## Evidence and delivery boundary

PR #283 (application, `27e60ee`) precedes #284 (CONTRACT, `20f49eb`); both are ancestors of the baseline. PR #286 merges as the baseline. All seven jobs on each final PR head passed: deterministic/type checks/build, database replay, CV export, CV browser, Passport browser, public entry browser, and E4 routed evidence. Final heads: #283 `ea7379dcbf7dab06e6b81211409592e67d198f99`, #284 `2c6833b9c97544ad255eee7f039e0662811021c9`, #286 `62b6987d7c932406dd08cc503a74c15313e6f6b3`.

The supplied programme is the product specification. The named AI Operating Manual, Product Vision 2030 and `hemsidor.txt` were not present in the repository or attached-file directory. Their contents, source permissions and legal approvals have **not** been verified. The owner has been asked for their paths. This does not prevent an isolated schema foundation; reconcile them before source activation and final product acceptance.

This PR is **A: domain and security foundation**. No runtime application consumer, network ingestion, AI call, Storage bucket, schedule or production write is introduced. It is not a pilot-ready product. The schema-first policy requires merge and evidenced hosted application before PR B depends on these objects.

## Reuse and gaps

| Area            | Repository evidence                                                                                                          | Decision                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity        | `docs/architecture/adr-unified-account-and-professional-identity.md`, `src/routes/_authenticated.tsx`, `requireSupabaseAuth` | Keep the same session; independently authorize Security Work membership on every object.                                                                                              |
| Navigation      | `src/components/site/AccountMenu.tsx`, `candidate-app-nav.ts`, employer shell                                                | Extend the account context choice. Preserve the six Career destinations. Give Security Work its own shell and routes.                                                                 |
| UI and language | `src/styles.css`, shared Radix components, `useT`, `dictionaries.ts`, modular recruitment copy                               | Reuse tokens, responsive Sheet/sidebar patterns and typed Swedish/English copy. Verify 44px targets rather than assuming shared controls meet them.                                   |
| Server          | TanStack `createServerFn`, Zod, caller-scoped `ctx.supabase`                                                                 | Authenticate server-side and keep RLS authoritative. Do not use employer membership predicates.                                                                                       |
| AI              | `src/lib/interview-intelligence/ai/provider.ts`, `providers/anthropic.ts`, injection/policy/orchestrator modules             | Reuse transport patterns with independent task schemas, quotas, consent/configuration and run records. Never reuse interview data or its governance flag as Security Work permission. |
| Exports         | Existing CV/Career/BESKT browser-print flows                                                                                 | Reuse user-triggered print/export after object authorization and exact approved-version checks.                                                                                       |
| Background work | No durable ingestion queue, feed adapter or Cron implementation found                                                        | Implement bounded idempotent jobs in B after adapter/source review. No speculative schedule enabled in A.                                                                             |
| Security tests  | `scripts/db-test.sh`, synthetic SQL fixtures, replay/rollback, negative controls                                             | Extend the executed database harness, including transaction-scoped planted defects.                                                                                                   |
| Release         | `release-state.json`, hosted ledger, frontier/deploy-plan/schema-first guards                                                | Add one pending canonical migration; preserve the owner merge/application gate.                                                                                                       |

## Boundary and routes

Proposed authenticated entry: `/security-work`, with an independent workspace context and descendants for overview, monitoring, assessments, risks-actions, reports, sources and settings. Route placement, account-switch labels and cache keys must never derive authority from a Career profile, employer slug, organisation membership, application, Passport share or Interview Intelligence case. Identity and workspace belong in query keys; sign-out and workspace switching must clear protected cached content.

`sw_*` records belong only to Security Work. Cross-record foreign keys carry `workspace_id`; the same user having access to two workspaces does not permit moving records between them. An owner starts one personal workspace atomically and idempotently. The model supports organisational workspaces later without borrowing recruitment membership. Membership administration/invitations are deferred; an owner role is immutable in the personal bootstrap.

The data model separates source facts (`sw_source_items`), analysis provenance (`sw_ai_runs`), triage decisions (`sw_intelligence_items`), assessments, risks, controls, actions, reports and citations. Monitoring profiles and requirements capture the user's purpose before collection. Audit events and version snapshots are protected from ordinary writers. Reports carry the eight formal sections, including contacts. Human approval requires an explicit capability and cited evidence; AI/provider roles have no domain execution or write privileges in A.

## Phases and activation

1. **A:** schema, constraints, RLS, narrow atomic bootstrap, history, generated types, replay/rollback/negative controls. Owner reviews/merges; verify hosted identity, privileges and schema before recording application.
2. **B:** workspace choice, onboarding with save/return, requirements, approved-source catalogue, bounded ingestion, durable retries, monitoring/triage, Swedish/English. Begin from newly fetched main after A is applied. Select verified feed/API terms; manual observations are the first safe fallback. Do not approve a source merely because a URL is stored.
3. **C:** provider adapter and activation boundary, structured task outputs and citations, assessment review, risks/actions, editable eight-section reports, explicit approval and version-specific export. A configured provider must be exercised in an authorized environment before claiming live AI.
4. **D only if needed:** whole-journey proof, accessibility, mobile/desktop, both languages, UAT and recovery.

Live AI was not tested. Existing Interview Intelligence AI is disabled in the hosted configuration, and no server-secret values were read. Security Work needs its own reviewed activation, provider/model setting, secret, cost bounds and data-processing terms. Do not infer provider training exclusions from the presence of an adapter.

Later phases must enforce download protocol/DNS/redirect/private-network limits, MIME/size/time bounds, parser isolation, deterministic deduplication and network-free fixtures. Retrieved text is untrusted input; it cannot become system instructions or authorize tools. Validate structured outputs, input reference ownership and citation IDs before saving proposals. A model cannot approve, accept a risk, complete/cancel actions, change access, send or publish.

## Scope and pilot proof

Deferred deliberately: unrestricted crawling, dark web, autonomous alerts/distribution, SIEM, native apps, predictive scores, enterprise SSO, billing, broad invitations, marketplace, embeddings, classified handling and cross-domain automatic sharing.

Before pilot release, execute the supplied end-to-end UAT journey with synthetic demonstration, travel/operations and supplier-disruption scenarios. Include reload/re-login persistence; evidence and uncertainty; assessment approval; risk/action follow-up; report editing/approval/export; inaccessible-workspace attempts; both languages; keyboard/focus; 375px and desktop overflow/target checks. No browser evidence for the new product is claimed by this schema-only PR.

## Current official references checked

- [Supabase row security and grants](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Explicit Data API grants change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Supabase changelog](https://supabase.com/changelog)

New objects explicitly revoke inherited/default grants before granting the intended access. Private helpers use pinned search paths and are not exposed RPC routes. No existing project's global default privileges are changed.
