# Generated Supabase types and `previewAuthStorage.ts` on main, 2026-09-26

A record of what the Lovable regeneration on 2026-09-26 changed in the two
generated files under `src/integrations/supabase/`, and of the one thing the
MVP-alignment branch (`claude/mvp-homepage-jobs-rpc-alignment`) changes in
them. Written so the owner can see the scope without reading a 2,094-line diff.

## In one paragraph

One regeneration, `98deb78f` (gpt-engineer-app, 2026-09-26 20:52 UTC,
"Work in progress"), rewrote `types.ts` and changed seven lines of
`previewAuthStorage.ts` (together +1,166 / −935 against `84b9a1b`). It added
the recruitment-receipt schema, and it erased two kinds of hand-maintained
precision: the three nullable RPC arguments guarded by
`scripts/nullable-rpc-contract-check.ts`, and `NonNullable<Json>` on nine
Security Work entries, which no guard covers. Two later Lovable commits
toggled the three arguments back and forth. **This branch restores exactly
those three arguments (commit `1b297437`, three lines) and touches nothing else
in either file.**

## `types.ts`: what `98deb78f` changed (`84b9a1b` → `98deb78f`)

Compared entry by entry (schema → section → name): 828 entries before, 841
after. **Added 13, removed 0, changed 17.**

### Added — schema the repository's migrations already define

| Entries                                                                                                                                                                                                                                                                                                                                                | Source                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 13 functions: `rec_candidate_view`, `rec_claim_due_receipts`, `rec_claim_receipt_send`, `rec_job_counts`, `rec_receipt_actor`, `rec_receipt_default`, `rec_receipt_provider_key`, `rec_receipt_take_attempt`, `rec_receipt_window_open`, `rec_receipts_needing_attention`, `rec_render_receipt`, `rec_set_receipt_settings`, `rec_settle_receipt_send` | `supabase/migrations/20261213090000_recruitment_application_receipts.sql` |

### Changed — new columns and parameters, from the same migrations

| Entry                                                       | Change                                                                                                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tables.recruitment_messages`                               | +6 e-mail delivery columns (`email_attempt_id`, `email_key_first_used_at`, `email_key_generation`, `email_provider_id`, `email_recipient`, `email_settled_at`), in Row / Insert / Update |
| `Tables.recruitment_settings`, `Functions.rec_settings_row` | +7 `receipt_*` columns                                                                                                                                                                   |
| `Functions.scp_assign_training`                             | + optional `_employee_id` (`20261206090000_scp_training_assignment_person_context.sql`)                                                                                                  |

### Changed — hand-maintained precision the regeneration erased

| Entries                                                                                                                                                                                                                                                                                                                                                                                                     | Before              | After    | This branch                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bcp_conduct_record_resolution` `_agreed_statement`, `_divergent_statement`; `scp_iv_finalise_previewed_report` `_draft_run_id`                                                                                                                                                                                                                                                                             | `string \| null`    | `string` | **Restored** to `string \| null` (`1b297437`)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `sw_assessments` (`conflicts`, `context_snapshot`, `knowledge_gaps`), `sw_audit_events.details`, `sw_method_versions.definition`, `sw_processing_jobs.input_manifest`, `sw_record_versions.snapshot`, `sw_report_approvals.bundle`, `sw_reports.sections`; functions `sw_approve_report.bundle`, `sw_export_report.bundle`, `sw_complete_processing.input_manifest`, `sw_reserve_processing.input_manifest` | `NonNullable<Json>` | `Json`   | **Not changed.** Introduced by hand in `7a3a4638` (2026-09-24, "schema-first Security Work analysis and processing contracts"); no guard asserts it. CI type-checked the wider `Json` without an error in run 36272403026 (commit `03ed5830`: "Type-check" and "Type-check the Passport guard scripts" both green). Outside this task, which was the three documented arguments only. For the Security Work owner to decide whether it needs the same kind of guard. |

## The three arguments, commit by commit

| Commit                        | When (UTC)        | Author           | `_agreed_statement`, `_divergent_statement`, `_draft_run_id` |
| ----------------------------- | ----------------- | ---------------- | ------------------------------------------------------------ |
| `84b9a1b`                     | before 2026-09-26 | —                | `string \| null`                                             |
| `98deb78f`                    | 2026-09-26 20:52  | gpt-engineer-app | `string` (regenerated)                                       |
| `41578532`                    | 2026-09-26 21:09  | gpt-engineer-app | `string \| null`                                             |
| `f24e4959`                    | 2026-09-26 22:07  | gpt-engineer-app | `string`                                                     |
| `41d1daa5`, `7044387a` (main) | —                 | —                | `string`                                                     |
| `1b297437` (this branch)      | 2026-09-27        | this branch      | `string \| null`                                             |

Why they must be nullable is recorded in `scripts/nullable-rpc-contract-check.ts`
and in the CI comment above the "Nullable RPC argument contract check" step:
both RPCs take a real SQL `NULL` for "not provided", and the interview callers
pass `?? null`. With `string`, a caller is pushed toward `""`, which violates
the resolution table's shape CHECK at runtime.

Evidence, on this branch:

- `bun run nullable-rpc-contract:check` — exit 1 on main (five failures), exit 0
  after `1b297437`, and again after the branch's last save.
- `bun run negative-controls:nullable-rpc-contract` — all 10 mutations
  detected, every file restored byte for byte.
- No interview code and no database object was changed; after the fix,
  `types.ts` is byte-identical to its state before `f24e4959`.

A future regeneration will erase the three arguments again; the CI step fails
when it does, which is the intended signal.

## `previewAuthStorage.ts`

- The file says so itself: "This file is automatically generated. Do not edit
  it directly." Its only user is `src/integrations/supabase/client.ts`, as the
  auth `storage`.
- It brokers the Supabase session to the Lovable editor over `postMessage`, so
  preview surfaces share one login — and only when the page runs on a Lovable
  preview host that carries a project id in its host name **and** is framed by
  the editor. Everywhere else it returns plain `localStorage`. The published
  host (`trust-path-recruitment.lovable.app`) carries no project id in that
  position, so it takes the `localStorage` path.
- `98deb78f` changed `setItem` (7 lines). It used to write locally, send
  `lovable-preview-auth:set`, and ignore the reply. It now reads the reply: if
  the broker answers `ok` with a string, and the local value is still the one
  just written, the local copy takes the broker's value — or is removed when
  the broker answers `''`, the logout tombstone `getItem` already honoured.
- **This branch does not touch the file.** `git diff origin/main...HEAD --
src/integrations/supabase/previewAuthStorage.ts` is empty, and the Preview
  login is unchanged.
