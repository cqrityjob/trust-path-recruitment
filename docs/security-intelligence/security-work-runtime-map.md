# Security Work — runtime implementation map (Releases A and B)

Brief: _CQrityjob Security Work — implementation specification_, v1.0, 21 November 2026
(product owner). This map records what was verified, what is reused, what is added and
in which order. It is a plan plus the state of the first schema PR. It is **not** a claim
that the later work exists.

## 1. Verified starting point (2026-11-21)

| Item                          | Verified                                                                                                                                                                           | How                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Main                          | `93ef36025a51a34c7b57edcbd36d35747594e2e7`, same as the reviewed baseline                                                                                                          | `git fetch`, `git rev-parse`                                                                      |
| Open PRs                      | none                                                                                                                                                                               | GitHub REST API                                                                                   |
| Hosted migration ledger       | 404 rows ending `20270325090000` per `supabase/release-state.json`                                                                                                                 | Repository record only. The hosted DB, deployed site and provider account were **not** inspected. |
| Generative AI                 | Off in version 1. `externalAiAllowed()` is `false` unless a lab override is set, so `workAiStatus` reports `AI_NOT_ENABLED` and no assistant or analysis call can reach a provider | `src/lib/ai/generative-ai-gate.ts`, `processing/ai-jobs.server.ts`                                |
| Findings A and B of the brief | Confirmed in code (see §3)                                                                                                                                                         | Reading `programme/assistant.server.ts` and the 20261211/20270117 migrations                      |

Not verified: hosted row counts (for example, whether `sw_ai_suggestions` is empty
in production), the owner's screenshots and anything outside this repository.

## 2. Reuse (nothing here is replaced)

| Need in the brief                                            | Existing object                                                                                                                                                  | Use                                                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Workspace boundary, roles                                    | `sw_workspaces`, `sw_workspace_memberships`, `sw_private.can_read/can_edit/can_approve`, `is_human`                                                              | Unchanged. Every new function checks them on each call.                                                         |
| Billable reservation, single dispatch, signed result, budget | `sw_processing_jobs`, `sw_reserve_processing`, `sw_dispatch_processing`, `sw_complete_processing`, `sw_private.worker_keys`, `sw_ai_activations` (+ revocations) | **The one ledger.** The assistant joins it (kind `assistant`). No second ledger.                                |
| Provider adapter                                             | `processing/ai.server.ts` (`dispatchSwAiOnce`, `resolveSwAiConfiguration`)                                                                                       | App PR routes the assistant through it; the assistant's private `callProvider` is deleted once parity is shown. |
| Proposals                                                    | `sw_ai_suggestions` (immutable content, trigger-stamped decision)                                                                                                | Kept; bound to its job (§3).                                                                                    |
| Atomic apply precedent                                       | `sw_apply_ai_draft` + `sw_ai_draft_applications` (analysis drafts)                                                                                               | Same pattern for programme suggestions: `sw_decide_suggestion`.                                                 |
| Evidence                                                     | `sw_sources`, `sw_source_items`, `sw_documents`, `sw_extraction_segments`, `sw_citations`, `sw_evidence_links`                                                   | Release B adds metadata and retrieval only; identities stay.                                                    |
| Decisions and lifecycle                                      | `sw_assessments`, `sw_risks`, `sw_controls`, `sw_actions`, `sw_gaps`, `sw_reports`, `sw_report_approvals`, `sw_management_reports`                               | Unchanged lifecycle triggers; AI never approves, rates or accepts.                                              |
| Audit                                                        | `sw_audit_events`, `sw_record_versions`, `record_change()`                                                                                                       | Every write in the new functions runs as the caller, so it is audited as before.                                |
| UI shell                                                     | `SecurityWorkLayout`, `Overview`, `SecurityAssistant`, `AiDraft`, the 19 `/security-work` routes                                                                 | Evolved in place; deep links kept.                                                                              |

## 3. PR 1 — schema: one dispatch path and an atomic decision (this branch)

`supabase/migrations/20270326090000_security_work_assistant_dispatch_and_decision.sql`

**Finding A (duplicate billable dispatch).** The assistant checked for an existing
suggestion by id and, finding none, called the provider; the suggestion was inserted
afterwards. Two concurrent requests with one id both reached the provider, and the spend
was outside the workspace's daily budget.

- `sw_processing_jobs.kind` gains `assistant` (no assessment, no document, an activation).
- `sw_reserve_assistant(workspace, request_id, activation, manifest)`: workspace lock, request
  id = operation id, manifest = everything the model will see, `max_cost_micros` reserved
  against the **same** daily budget as analysis drafts (`reserve_processing` now sums both).
  A retry returns the same job in whatever state it is in (including `dispatched` and
  `outcome_unknown`). The same id with a different input, activation or person is refused.
- Dispatch and completion reuse the existing fence and HMAC receipt. Changes: dispatch
  requires the activation to still be live for an assistant job, and completion stores
  the assistant output.

**Finding B (non-atomic application).**

- `sw_ai_suggestions.job_id` + trigger `sw_15_suggestion_job`: a suggestion can only be
  the stored result of a succeeded assistant job with the same id, created by the
  same person. Its kind, context, request, sources, prompt version, provider, model
  and content must equal the reserved manifest and the signed output.
- `sw_decide_suggestion(workspace, suggestion, expected_version, status, note, apply)`:
  `SECURITY INVOKER`, one transaction. It locks the suggestion first, then its single
  target, and writes the exact reviewed change plus the decision. A retry of the same
  decision by the same person returns the stored row. A different decision, a second
  approver, a stale suggestion or a stale target version gets `PT409`. If any record
  fails, nothing is written.

**Proof (local, isolated PostgreSQL 17, synthetic fixtures):**

- 72 assertions run as real roles.
- 12 negative controls: each planted defect is caught by its named assertion.
- 2 two-connection races. Each one proves that the second session waited.
- Rollback is refused once data has been adopted.
- Rollback restores the 20261211090000 bodies byte for byte.
- The existing programme, analysis and foundation suites pass, including the
  existing race proofs.

The full `scripts/db-test.sh` could not finish on this machine because an unrelated
recruiter check needs a PostgREST 14 binary. Its Security Work section was run on
its own, unchanged. CI runs the whole script.

**Not changed:** analysis manifests and checks, extraction, `sw_apply_ai_draft` (already
refuses non-`ai` jobs), RLS policies, activations. Nothing activates a provider.

## 4. PR 2 — application (after PR 1 is installed and verified hosted)

The schema-first gate (`schema-first-release:check`) blocks this until
`release-state.json` records PR 1 as `applied` with evidence.

- `programme/assistant.server.ts`:
  1. Build the manifest from `collectContext`.
  2. Call `sw_reserve_assistant`.
  3. Before `sw_dispatch_processing`, re-collect the context and require deep equality
     with the stored manifest.
  4. Call `dispatchSwAiOnce` with the existing `beforeDispatch` recheck.
  5. Sign the result and complete it, then insert the suggestion from the job's output.
  6. A retry after a crash between completion and insert inserts from the stored
     output. It never re-sends.
  7. A timeout, or a job in `dispatched` or `outcome_unknown`, shows the user
     _outcome unknown_ and does not resend.
- `decideSuggestion` becomes one `sw_decide_suggestion` RPC. The approve-and-apply loop and
  `crypto.randomUUID()` record creation are deleted.
- `attestation.server.ts` signs kind `assistant`.
- TS checks (`security-work-ai-jobs-check`, programme check) cover the new states.
- The UI shows _outcome unknown_, the cost-cap refusal, and a stale-version conflict
  with the current values.

## 5. Release A, remaining

The brief asks for this. None of it is built yet; each item is a schema PR followed by
an app PR wherever the gate requires one.

1. **Operating profile.** The new table is `sw_operating_profiles`, versioned and
   append-only, with a provenance field for each value. It is prefilled from the mandate
   and assets, and every prefilled value needs the user's confirmation. Role focus is a
   presentation preference and grants no permission.
2. **Missions.** The minimal model is `sw_missions`, `sw_mission_members` (need-to-know,
   enforced in RLS) and `sw_mission_links` (links to existing records). Runs and steps
   reference `sw_processing_jobs`; there is no second job table. The states are those of
   §7 of the brief: execution state, content review state and the business-record
   lifecycle are kept in separate columns.
3. **Collaboration.** Owners need a way to invite members and change their roles, both
   audited. A role removed while a job is queued must stop that job (the SQL suite
   already proves this for the assistant path).
4. **Task-oriented Overview.** The Overview gets these sections:
   - _Vad behöver du få gjort?_ (What do you need done?)
   - _Förändringar som berör er_ (Changes that affect you)
   - _Behöver ditt beslut_ (Needs your decision)
   - _Pågående uppdrag_ (Missions in progress)

   The navigation becomes Översikt (Overview), Uppdrag (Missions), Bevakning
   (Monitoring), Risker och åtgärder (Risks and actions), Underlag (Evidence),
   Rapporter (Reports) and Er verksamhet (Your organisation). The six-area programme
   stays as Säkerhetsprogram (Security programme). Finding F: _no attention items_ and
   _no connected evidence_ must render as different states.

## 6. Release B — monitoring to a reviewed risk/action (first pilot slice)

| Piece            | Addition                                                                                                                                                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connectors       | `sw_connector_registry` (approved type, version, license/terms, polling support) and `sw_source_bindings`, `sw_fetch_runs`, coverage health (last success, delay, window). Fetches run in an isolated worker with egress, redirect and IP rules. They start with permitted official RSS/API sources and user uploads/URLs. |
| Change detection | Content hash plus conditional requests, then `sw_story_clusters` and versioned change sets. Syndication and copies never count as independent corroboration.                                                                                                                                                               |
| Retrieval        | A permission-filtered keyword search first. Semantic search (pgvector in the same Supabase) is added only if an evaluation shows a benefit. Index rows reference immutable segment ids and an access version, and deleting or restricting evidence blocks retrieval.                                                       |
| Change brief     | A capability that reads a permission-checked evidence manifest (finding C). It never reads the whole workspace. A source outage is shown as _coverage unavailable_.                                                                                                                                                        |
| Proposal bundles | `applyProposalBundle` generalises `sw_decide_suggestion` to several records. It sorts its locks, checks expected versions and records a receipt.                                                                                                                                                                           |
| Export           | The existing frozen report approval and export.                                                                                                                                                                                                                                                                            |

### 6a. Release B as built (schema 20270328090000, application branch `claude/security-work-release-b-app`)

The first pilot slice is narrower than the plan above. Each difference is deliberate.

| Step             | What exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permitted source | `sw_feed_hosts` is the approved-publisher allowlist. It is empty on install, and the platform adds rows with a terms reference. A workspace can connect an `official_feed` source only on an approved host; the trigger enforces this and the service gives the reason `FEED_HOST_NOT_APPROVED`. There is no connector registry yet.                                                                                                                                                                                                                                                                                  |
| Fetch            | `connectors/fetch.server.ts`: https only, DNS checked against private, loopback, link-local and metadata ranges on every redirect hop (at most 3), 2 MB and 10 s limits, conditional `If-None-Match` and `If-Modified-Since`, and an RSS/Atom parser that refuses DTDs and entities. The result is signed (HMAC kind `fetch`) and recorded through `sw_record_fetch`, which is idempotent per run. The health columns are writable only inside that function. Without `SW_WORKER_KEY_ID`/`SW_WORKER_SECRET` it answers `FETCH_NOT_CONFIGURED` and contacts nothing. "Fetch now" is manual; no scheduler is installed. |
| Coverage         | `knowledge/coverage.ts`: no source / never checked / failing / stale (more than twice the target interval) / current. The workspace's state is its weakest feed. "Nothing relevant" is only ever said about current feeds.                                                                                                                                                                                                                                                                                                                                                                                            |
| Relevance        | `knowledge/relevance.ts`: named matches against the operating profile, protected assets and monitoring terms. Each match carries its weight; exclusions win. The threshold only filters the list.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Corroboration    | Story clusters are keyed on the first five normalised headline words. Independent sources = min(distinct publishers, distinct content hashes), so copies never corroborate.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Impact brief     | Written by a person; no AI is involved. The database builds the evidence from the cited items and stamps the operating-profile version. Lifecycle: draft → in_review (content frozen) → approved/rejected; only an approver may decide.                                                                                                                                                                                                                                                                                                                                                                               |
| Risk and actions | `sw_apply_change_brief`: once per brief, with a receipt keyed by request id. It creates a monitoring risk, its actions, evidence links and mission links.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Follow-up        | The brief page shows the risk's and actions' live status. A new item in the same story raises a review flag on an approved brief; a revision cites the flagged item, and approving it supersedes the old brief and resolves the flags.                                                                                                                                                                                                                                                                                                                                                                                |
| Export           | Markdown download and print. The status, approval, profile version, follow-up and every source as retrieved are stated, and a draft says it is unreviewed.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Not built in this slice: scheduled polling, semantic retrieval, AI-drafted briefs,
and proposal bundles across several records.

Evidence:

- `supabase/tests/security_work_monitoring_impact_test.sql` (56 assertions)
- `scripts/security-work-monitoring-negative-controls.sh` (11 mutations)
- `scripts/security-work-release-b-check.ts` (13 pure and controlled-transport checks)
- `scripts/security-work-release-b-postgrest-check.ts` (8 checks over real PostgREST 14.15)
- `e2e/security-work-impact.spec.ts` (3 journeys on desktop and a 375 px phone)

Release C (events and staffing) and D (cyber/privacy, investigations, supplier
assurance, management reporting) reuse the same runtime. No navigation item or card
appears for them until they work.

## 7. Activation and deployment proposal (for owner review)

1. Review PR 1 and merge it. The official Supabase integration then installs it in
   production. Verify it read-only against the `verify` list in `release-state.json` and
   record the evidence.
2. PR 2 (application) passes the schema-first gate. Merge it and Publish. AI stays off,
   so users see no change except the safer manual path.
3. Separate decisions are needed for any live AI use:
   - the current provider terms, region and retention, checked against the
     customer contract;
   - a workspace `sw_ai_activations` row with a cost cap;
   - the `SW_*` environment and worker key, provisioned out of band;
   - lifting the version 1 generative AI gate.

   None of these is requested or performed here.
