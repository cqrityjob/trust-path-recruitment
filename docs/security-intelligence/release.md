# Security Intelligence — PR A release gate

Baseline: `bb4e849b43960f9c82907e08965e51c57a9a3261`.
Branch: `codex/security-intelligence-foundation`.
Migration: `20261210090000_security_work_foundation.sql` (pending).

This is the schema/security foundation for **Mitt säkerhetsarbete / My Security Work**. The product journey and live AI are not yet delivered. [Implementation map](implementation-map.md), [threat model](threat-model.md), and [read-only hosted baseline](hosted-baseline.md) record what was examined and what remains.

## Reviewable change

- Sixteen independent `sw_*` tables, separate current memberships, owner/editor/viewer roles and explicit approval capability.
- Atomic, idempotent personal workspace creation through one invoker RPC and private checked implementation. No invitation or membership-administration API.
- Source facts separated from triage and AI provenance; manual-source and URL-reference storage only, no URL retrieval.
- Composite workspace foreign keys, immutable identity/parent fields, human state transitions, source-backed citations, final content protection and eight formal report sections.
- Trigger-owned immutable audit/version history, explicit grants/RLS, no anonymous or service-role domain access.
- Generated schema descriptions only; no running application consumer depends on an unapplied object.
- Empty-domain rollback refuses adopted professional work. Production data is never used for fixtures.
- Existing #286 hosted evidence reconciled without hosted writes. Deploy plan names exactly one pending migration, this foundation.

## Validation and evidence

The exact baseline passes all 311 migrations and the full native PostgreSQL 16 `db:test` harness, including existing rollback and connection-race checks. New tests use synthetic users and independent workspaces, with real PostgreSQL roles and strict SQLSTATE assertions. Planted database defects run transactionally, reuse the same assertions and restore enforcement by rollback.

`scripts/db-test.sh` runs the new foundation suite and controls, refuses rollback with adopted data, proves empty-domain stand-down/reapply, reruns the foundation suite, and executes `scripts/security-work-concurrency-test.sh` in its own disposable database. Concurrent onboarding returns one identity; both orderings of citation removal versus approval preserve the rule that approved work retains evidence.

Local app build and both TypeScript checks pass with the frozen lockfile dependencies. Final head counts, lint comparison and CI conclusions are recorded in the PR description and evidence file. New-product browser evidence is deferred to application phases; existing browser regressions remain part of required CI.

## Owner-controlled merge/application gate

1. Review the draft PR and its final-head CI evidence. Merge **A only** when approved; do not enable auto-merge from this task.
2. Allow the configured official Supabase GitHub integration to apply the reviewed migration. Do not manually rerun it on a timeout. Check the hosted ledger first.
3. Verify read-only on `wrygicdfxwjnrugduxnt`: canonical ledger identity, sixteen RLS-enabled tables, exact constraints/triggers and function definitions versus replay, anonymous/service-role revocations, authenticated grants, and `sw_private` absent from exposed API schemas. Rerun hosted security advisors and explain any new finding.
4. Record application evidence in `release-state.json`, refresh the hosted-ledger snapshot and remove this migration from `expectedPending`. `deploy-plan:gate` and `release-parity:gate` must then pass.
5. Fetch fresh `origin/main` and start **B** from that exact clean baseline: workspace shell, bilingual onboarding, requirements, sources and monitoring. Source adapters and worker activation may require a separately reviewed additive schema step before their runtime consumers; schema-first rules still apply.

No production write, provider call, external message, secret configuration or publication is authorized by completion of local tests. This task stops at the requested owner merge/application gate.

## Rollback and limitations

The rollback removes only new Security Work objects and only while `sw_workspaces` is empty. Once adopted, preserve records and use a separately reviewed forward recovery migration. Never force this rollback or edit published migration history. Revert dependent application consumers before schema stand-down.

The named operating-manual/vision/source-list files are still needed for later reconciliation. No feed/API terms, upload handling, source fetcher, job scheduler, AI adapter activation, provider contract, export endpoint, UI, browser UAT or retention/erasure policy is claimed complete. The existing hosted security-definer-view advisory predates this work. Live provider testing and owner-approved privacy/retention decisions are pilot gates, not reasons to grant a generic service role access now.
