# Interview access, expand (`20270206090000`): hosted verification (2026-10-03)

Read-only. No production write was made by the author of this record and no write probe was run. The two role probes
ran inside `BEGIN ... ROLLBACK` as a synthetic user id that belongs to no person, membership or role. Counts, names,
hashes and privilege flags only; no candidate data was read.

## What happened

PR #404 (Astra's expand release: case-scoped interview capability flags and the raw scenario bank restricted to content
authors) merged to `main` as `dae5c004` at 21:10 UTC (head `333d3d1a`, every mandatory CI job green). The official Supabase integration applied, after the employer-notice
migration recorded in `2026-10-03-employer-notice-hosted-verification.md`:

| Version | Name |
|---|---|
| `20270206090000` | `interview_access_expand` |

This is release 1 of 3 of the interview access fix (expand, application, contract). The application half (#405) and the
contract (`20270207090000`, #406) are separate releases; the order is in `docs/security/interview-access/README.md`
and in `2026-10-03-release-order.md`. Nothing in this record says they are applied or published.

## After (read ~21:18-21:21 UTC, project `wrygicdfxwjnrugduxnt`; the production session independently read the ledger count and last version, the existence of the capability function and the
  policy qualifier; the function bodies, privileges and probes below are this author's read)

- **Ledger:** 368 rows, last version `20270206090000`, name `interview_access_expand`. md5 of `version:name` joined by newline
  over all rows `c086806d9fb5f0c92609678f037b73ba`; over the first 367 rows `77e07c074bb73aac9ac11a569b5ca214`
  (unchanged since #392). `supabase/hosted-ledger.json` hashes to the same values.
- **Function bodies:** both `md5(prosrc)` equal a strict local replay of `main` (368 migrations, zero failures).

  | Function | Security | `search_path` | `md5(prosrc)` |
  |---|---|---|---|
  | `public.scp_iv_case_capabilities(uuid)` | INVOKER | pinned empty | `3022f4137f432fe0a44f3fc8eca4b060` |
  | `scp_private.case_capabilities(uuid)` | DEFINER | pinned empty | `bebbd9f70ccc4b9078fe25235979d5f7` |

- **Privileges:** `anon`, `PUBLIC` and `service_role` hold no EXECUTE on either function; `authenticated` does. `anon` has
  no `USAGE` on schema `scp_private`; `authenticated` does. The schema holds one function.
- **Raw scenario bank:** `scp_scenario_versions_read` is `SELECT` to `authenticated` with qual
  `scp_can_author(auth.uid())`; `scp_scenario_versions_author_write` (ALL, `scp_can_author`) is unchanged. `anon` has no
  `SELECT`. The table holds 0 rows in production today, so the exposure this closes was latent.
- **Catalogue reads:** 40 `USING (true)` client reads remain (41 before; the raw scenario bank is the one removed) and the
  five shared `sp_` catalogue policies are preserved.
- **Legacy configuration read, by design:** `scp_interview_ai_config_read` (`SELECT`, `true`) is still present and the one
  `scp_interview_ai_config` row is still readable by every signed-in user. That is closed only by the contract release
  after the application is published and verified; this record does not claim it is closed.
- **Rolled-back probes:** as a synthetic signed-in user with no role, `scp_iv_case_capabilities` on a case that does not
  exist raises `INTERVIEW_CASE_NOT_FOUND` (SQLSTATE `42501`), i.e. it fails closed; as `anon`, `permission denied for function
  scp_iv_case_capabilities`.

## Not done

No probe as a real authorised case reader was run (the connector reads only, and no real case was touched). Positive and
negative behaviour is proven on the identical bodies by `interview_access_expand_test` IA1-IA12 and the saved PostgREST/JWT
assertions in `docs/security/interview-access`; the hosted application path is verified only after #405 is published.

## Recorded in

`supabase/release-state.json` (`hostedState: applied`), `supabase/hosted-ledger.json` (368 rows) and
`scripts/release-frontier-check.ts` (`expectedPending` is empty).
