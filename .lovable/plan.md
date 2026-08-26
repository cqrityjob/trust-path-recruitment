# Preview runtime repair after the latest main merge — diagnosis and minimum safe sequence

Read-only inspection only. Nothing was edited, applied, written or deployed.

## Error 1 — "Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY"

Classification: **(a) server environment / backend binding — not a code defect, not a migration issue.**

Evidence:
- `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are both present in the current build environment (checked by presence only, never printed).
- The message text comes from `src/integrations/supabase/client.server.ts`, which reads the key inside `createSupabaseAdminClient()` at first use, server-side only. That file is generated and correct.
- Every `supabaseAdmin` use in the codebase is a dynamic `await import(...)` inside a server handler, so nothing leaks into the browser bundle. Spot-checked across `src/lib/**` — no top-level import in a `*.functions.ts` or route file.

Meaning: the failure is a runtime process that was started before the managed backend env was (re)bound, i.e. a stale server process env — the same class of failure resolved earlier by re-binding the managed backend secrets. No secret needs to be invented, pasted or committed.

## Error 2 — "column sp_market_packs.pilot_state does not exist"

Classification: **(b) unapplied canonical migration.** Code on main is ahead of the hosted database.

Confirmed against the hosted database:
- `public.sp_market_packs` columns: no `pilot_state`.
- `sp_market_access`, `sp_is_pilot_member`, `sp_grant_pilot_member`, `sp_revoke_pilot_member`: none exist.
- `public.sp_pilot_members`: does not exist.

The consumer is `src/lib/security-passport/credentials.functions.ts`, which selects `pilot_state` and calls `sp_market_access`. Both are introduced only by canonical `supabase/migrations/20260915090000_sp_market_pilot_entitlement.sql`.

### This is not an isolated gap

The hosted database is behind main by the whole tail of the frontier. `supabase/release-state.json` already records 11 files as `pending`, and independent hosted probes agree with it:

| Canonical file | Hosted probe |
| --- | --- |
| 20260909090000_jobs_delete_unpublished_draft | pending (per release-state) |
| 20260909093000_application_status_notifications | `job_applications.notified_at` absent, `jase_record_notification` absent |
| 20260909094000_job_audit_vocabulary_lifecycle | pending (per release-state) |
| 20260910091000_cd_v31_content_v3_question_refinement | pending (per release-state) |
| 20260911090000_admin_control_center_lifecycle | `admin_person_overview` absent |
| 20260912090000_cd_ranking_guard_recommendation | pending (per release-state) |
| 20260913090000_cd_v31_content_v4_context_intent_separation | pending (per release-state) |
| 20260913091000_cd_career_context_other_profession | `cd_sessions.current_profession_other` absent |
| 20260913092000_cig_security_leadership_professions | pending (per release-state) |
| 20260914090000_sp_uk_vehicle_immobilisation | no immobilisation credential type |
| 20260914091000_sp_uae_dubai_cadre_catalogue | pending (per release-state) |
| 20260914092000_sp_uae_abu_dhabi_market_pack | no `AE-AZ` market pack row |
| 20260915090000_sp_market_pilot_entitlement | `pilot_state` / pilot functions / `sp_pilot_members` absent |

Applying only 20260915090000 would clear the visible error and leave the rest of that list as latent SAVE/READ failures of exactly the class the parity guard was created for. Governance state today: `SE` active/grandfathered, `GB` and `AE-DU` inactive/pending — unchanged, and none of these migrations activates them (20260915090000 aborts if GB/AE-DU are no longer `pending`/inactive).

## Error 3 — none found

No third defect. `read_runtime_errors` returned no captured errors for the service-role message, so both reports come from server-side logs rather than a client crash.

## Minimum safe sequence

Order matters: 1 before 2, because the pilot Passport paths need a working server env to be verifiable at all.

1. **Re-bind the managed backend env** (`supabase--rebind_secrets`), then restart the preview server process and re-check the failing page. No code change, no secret entered by hand, nothing exposed to the browser. Stop and report if the key is still missing after a restart.
2. **Apply the pending canonical migrations in version order, one tracked Lovable migration per file, verbatim** — 20260909090000 → 20260915090000, in the table order above. No `db push`, no rewriting, no merging files, no ledger edits. After each: verify the objects that file introduces (the `verify` query in `release-state.json` where present) and confirm holder/candidate row counts are unchanged.
3. **Re-assert governance after 20260914092000 and 20260915090000**: `GB`, `AE-DU` (and new `AE-AZ`) must remain `is_active = false`, `legal_review_state = 'pending'`, `legal_reviewed_by` NULL, with `pilot_state` left at its default `closed` and `sp_pilot_members` empty unless the owner separately grants a tester.
4. **Reconcile the repository**: update each applied entry in `supabase/release-state.json` to `applied` with its hosted generated version/UUID as `evidenceSource` (`appliedThroughLovable` mapping), and run `scripts/release-parity-check.ts` plus `scripts/migration-safety-check.ts` until clean.
5. **Verify** the previously failing surfaces: Passport credential/market surface (the `pilot_state` path), employer job save/publish, admin control-center pages, Career Discovery session start. Type-check and the relevant guard scripts.
6. **No publish.** Production deployment stays out of scope until the owner approves separately.

Rollback: each of these files has a matching `supabase/rollback/*_rollback.sql`; per-file rollback is possible in reverse order. Step 1 is non-destructive and needs no rollback.

## Risk notes

- Two of the pending files carry content-version bumps for Career Discovery (`20260910091000`, `20260913090000`) and one changes the ranking guard (`20260912090000`). Existing stored reports must be spot-checked for unchanged output after they land; that is the only part of this sequence that touches assessment behaviour.
- `20260911090000_admin_control_center_lifecycle` introduces deletion/anonymisation functions. Verify their access control (admin-only, denial case) before considering that step complete.
- Applying 13 files is more than the reported symptom requires; the smaller alternative (20260915090000 only) is available but leaves known-broken surfaces. Say which you prefer.
