# Participant report API boundary after #428

Prepared from fresh `origin/main` `ce3d93d` (#428). This is a schema-only change; no production migration, merge, publication or external mail was performed. The production boundary remains open until the owner approves and applies this migration.

## Decision and implementation

`20270216090000_participant_report_api_boundary.sql` enforces the existing owner decision:

- Participant report RPC and participant snapshot RLS require the released snapshot's explicit `context.person_context = candidate`. Missing, null, unknown and workforce context return no report. The identity predicate remains an identity predicate; it does not independently confer snapshot access.
- Participant progression returns only candidate snapshots, including when the subject has mixed history.
- Participant recommendations remain available for candidate-only evidence. Because the calculation aggregates subject-wide evidence, any workforce/unknown participant snapshot, including an empty payload, withholds recommendations. Unsuperseded evidence that cannot resolve through a response to a released candidate snapshot also withholds recommendations. This prevents evidence without report context entering the aggregate. No maturity/scoring formula changes.
- Employer branches and issuer preview stay unchanged. No table SELECT grant is added. The RLS restriction is proved separately with a temporary SELECT grant inside the fixture.
- `cd_record_funnel_event(text,jsonb,uuid)` loses EXECUTE for PUBLIC, anon and authenticated. Its service role grant, validation and historical rows remain. `cd_submit_test_feedback` is untouched and actual writes by both client roles are tested.

The migration file was created with the CLI and placed after the repository's existing canonical future-dated frontier `20270215090000`, so later historical definitions cannot overwrite it.

## Reused evidence and focused additions

The #390 full-replay/pipefail repair, #396–397 employer audience matrix, #417 measurement-off guards, #428 participant application gate and real local Passport evidence remain the baseline. No new total audit, lint cleanup, browser framework or external account was created.

New SQL suite reuses `employer_report_access_fixture.sql`, including real assignment, response, human review and release functions. It checks workforce denial, candidate access, other-account/anon denial, RLS, issuer access, missing/unknown context, mixed history, empty snapshots, unresolvable evidence and feedback. The existing complete employer matrix runs with `participant_launch_gate=true`; only participant expectations change, and employer/issuer/reviewer/recruiter/offboarding expectations remain intact.

`participant-report-api-db-check.sh` runs that final-state suite and matrix, independently restores each old report/progression/recommendation function, the old RLS policy and the old funnel grant, and requires the suite to fail on PB1/PB2/PB3/PB9/PB17 respectively. It also applies the real rollback, proves the old report access returns, reapplies the migration and checks unchanged stored-row fingerprints.

CI runs this gate immediately after strict full-history replay. It then explicitly restores the pre-launch policy for older historical suites, whose old workforce/funnel expectations and rollback proofs are retained as historical contracts. In particular old RA6.1 is historical proof, not the final launch decision; PB1 and the final-state employer matrix prove the new decision. The final-state test is not inferred from a green historical suite.

`participant-report-api-http-check.py` uses the existing local `codex-interview-access-db` backend, a dedicated cloned database and temporary loopback PostgREST process using the existing image/network. It reuses the standard JWT claim readers from `scripts/local-stack/harness.sql`. Real signed local test JWTs go through real PostgREST and PostgreSQL; there is no API interception. This is direct authorization proof, not Google or GoTrue sign-in proof. It shows the old RPC accesses and funnel write succeed after rollback and the new boundary closes them. Historical report/evidence/funnel/feedback row digests are checked across both directions with populated fixtures. Credentials and bearer tokens are never recorded.

## Production preparation (not approval to execute)

Target: `wrygicdfxwjnrugduxnt`, the owner backend. Apply only the exact reviewed SQL file, atomically. Do not run a blanket `db push`, reconcile unrelated history or reapply F09. The rollback is `supabase/rollback/20270216090000_participant_report_api_boundary_rollback.sql`. Both files contain their own transaction and a five-second lock timeout. They perform no data writes.

Read-only production preflight on 2026-10-04 confirmed the previous function definitions and grants. `md5(pg_get_functiondef(oid))`:

| Function                                  | Existing definition MD5            |
| ----------------------------------------- | ---------------------------------- |
| `scp_participant_report(uuid)`            | `28cc6baf1c32668ed04e896fe3ffc48e` |
| `scp_subject_progress(uuid)`              | `2132ff68eed1eec5d6c215decb404507` |
| `scp_development_recommendations(uuid)`   | `a736c866c17961dd4301713d3b903e3b` |
| `cd_record_funnel_event(text,jsonb,uuid)` | `1b57baa44ef5c8e33bab7aca981a518c` |
| `scp_participant_report_for_issuer(uuid)` | `3d38aa3d7056718bd6ecd86c72e627df` |

All report functions grant EXECUTE to authenticated only (besides owner); funnel currently grants anon/authenticated/service_role. The participant policy still uses ownership without candidate context. Repeat this read-only comparison immediately before an approved apply and stop on drift. Record the current relevant definitions, policy and ACLs as the rollback baseline. The production query read no report contents.

After approval: apply the migration; verify the three changed definitions, candidate-only participant policy, unchanged employer/issuer definitions, revoked client funnel EXECUTE and retained feedback privileges. Check row counts/digests without exporting personal data and run approved synthetic authenticated probes. Record the actual ledger version and verified canonical alias only after successful apply, following the existing release process. Do not mark release-state/hosted-ledger applied in advance.

Rollback is operational recovery only: it restores the old access and therefore **reopens this launch blocker**. If used, record the rollback and keep the product unlaunched until the boundary is restored. No historical rows need restoring because neither direction deletes or updates them.

## Remaining external tests and access inventory

| Test                                                           | Existing proof reused                                                                                                                                                         | What is actually still missing                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google F02, A/B and cross-tab result ownership                 | #428 auth handler tests, 12 fixture browser cases, real SQL ownership/isolation                                                                                               | External OAuth return in a clean profile and app A/Google B profile; verify app identity and saved-result owner, not just account picker. Two Google accounts are now supplied privately in this chat. A configured isolated OAuth test/preview URL and user-controlled secure sign-in remain needed.                                                                            |
| Email F03, confirmation on phone then return to desktop, SV/EN | #428 copy/state tests; existing real-Mailpit public-pilot harness; prior actual delivery receipts in `2026-10-04-test-round-cleanup.md`                                       | The full two-context confirmation transition. Existing shared local GoTrue auto-confirms, so those receipts/fixtures do not prove it. A test mailbox is supplied in chat; the user enters password/MFA securely. No additional external account is needed. A disposable confirmation-enabled local setup is an alternative, as documented in participant-report-availability.md. |
| Passport F05 recipient/QR/revoke after publication             | #428 real GoTrue/PostgREST local SV/1280 and EN/375 chain, clipboard/QR equality, logged-out reload, revoke and invalid link; F09 production apply and history reconciliation | Recheck a freshly created link on the published version, including QR on a real phone and revoked reload. The supplied Passport account's test merits and published target still need confirming. No need to repeat the local fixture chain or request a new recipient account; recipient is logged out.                                                                         |

Account addresses, passwords, MFA, sessions and bearer share URLs are intentionally absent from this repository. Account addresses were requested together; only secure interactive login is appropriate for secrets. No external login was attempted against an unspecified environment.

## Real launch blockers and separate operations

For this security delivery: (1) approved production application and postflight of this prepared migration, (2) the remaining Google, two-context email and published Passport tests above. Code success is not production enforcement or external-provider proof.

Existing launch operations remain separately owned in `2026-10-04-version-1-launch-status.md`: legal approval/provider facts, retention classification and first operational run, remaining owner browser tests, decision on test-like public job ads, and hosting cookie/analytics verification after the next publication. This PR does not reopen resolved #390–428 findings or perform those operations. The former backlog item to close direct funnel access is covered here; historical measurement-row retention/classification is still separate.
