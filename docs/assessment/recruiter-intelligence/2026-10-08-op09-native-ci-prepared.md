# OP09 native Auth/Storage and browser recovery: prepared, not executed

This test-only integration is prepared for a new GitHub-hosted Ubuntu runner. No local Docker/DB/service execution, push, installation, hosted write or published runtime proof was performed while preparing it. It does not replace the separate P0/native100 artifacts or convert earlier blocked checks to passes.

## Version and environment boundaries

The schema witness is `9c8b8159ce5f350c6ace074c917823599d19ce99` (#457, governed SQL fixture and restrictive dependent cleanup corrections), whose migrations/config are byte-identical to reviewed `4ff99bcbf680858ebc56b408a4557b6d0719ea0c`. The runner must be its descendant with **zero migrations/config diff**, and its own exact evidence SHA is supplied by the workflow. The separate application checkout must be exactly `a5dd89ebee2c30f4d2ff18df7117d07e2bb125d2` (#458, normal schema merge and older e2e-mock corrections). Its product `src` and44-probe script have zero diff from `219e78e0eeb63ec4fc83913b0a3286983d3887dd`; the earlier `d611440ada2bd15a7810da2346979797f93053c6` source remains unchanged. This artifact retains those exact pins even if later test-only fixes are source equivalent.

The new CLI project `cqj-ri-native-op09-20261008` uses loopback API55820, DB55821, shadow55819 and app35820. Existing directories, containers or occupied ports are refused. Official CLI2.111.0 creates native GoTrue2.194.0, Storage, PostgREST14.15 and PostgreSQL17. The installed SDK must be Supabase/Auth JS2.110.5. All387 canonical migrations are applied with `ON_ERROR_STOP=1` and individually hashed before any consumer starts. No bootstrap Auth/Storage substitute, fabricated JWT, role/claims SQL, skipped migrations or ledger repair is used. This is ephemeral integration; it does not assert a hosted installation ledger or public runtime.

The workflow checks out the app separately and invokes `scripts/passport-native-op09-run.mjs`. It never changes product source/generated types or release/install records. Its artifact name is `passport-native-op09-evidence`, separate from the P0 and P1 runs.

## Setup and actual probes

Eight newly named `.invalid` actors O1/A1/R1/M1/C1/C2/X2/V1 are created only through the native Auth admin API with `email_confirm:true`, random passwords, no invitations or mail. Intent is persisted before creation; unknown outcomes stop without a duplicate retry. Account UUIDs come from the real API. Each account is signed in through password Auth and its subject, role, issuer and session ID are checked. Actor aliases are fixture labels; they do not confer platform or Passport privileges.

Narrow local PostgreSQL setup creates one synthetic draft job and sets `receipt_enabled=false`; it creates zero applications. Readback before and after probes requires Auth8, one job, zero applications/receipts/messages/email attempts/AI runs/erasure jobs/queue work/cron jobs, and AI/transcript flags off. No retention worker or Edge Runtime starts.

The exact app's exported `verifyIsolatedUploadRecovery()` is dynamically imported by Bun. Fresh C1/C2 password sessions call real `sp_passport_ensure`, then C1 creates its own governed `INTL_ASIS_CPP` claim through `sp_save_international_credential`. Native owner RPC and Storage policies handle the44 probes, including unknown upload response, reload list/resume, idempotence, other-holder denial, durable cleanup fence, failed cleanup transport, late attach/upsert refusal, actual object absence, registered/withdrawn evidence protection and changed-byte integrity refusal. The SDK's response-loss/failure injections are explicitly client-side test faults; its writes/readbacks use real services.

Two simultaneous registration/cleanup races report **their actual observed winner labels**. `bothRaceOrdersObserved` is true only when both winners really occur. The44 count alone cannot establish that. Separate sequential probes establish registration-before-cleanup protection and cleanup-before-late-attachment refusal.

The final ten SDK checks perform real `signOut({scope:'local'})` on the dedicated C1 helper session, then replay its captured access JWT. They verify Passport's live-session guard, denied journal/reconcile/cleanup/begin/read access and absence of false empty-list/cleaned/resumed outcomes. Local logout revokes that session's refresh/session state; the evidence does **not** claim that the already issued JWT cryptographically expired or that every other C1 session was revoked. Browser journeys sign in afresh after these checks.

## Four genuine browser journeys

SV/EN are each tested at desktop1440 and Chromium mobile emulation375. This is not a physical-device claim. Each journey uses UI password login and the existing `/passport/entry/claim/:id` route, with its own claim and two real, owner-uploaded PDF objects and persistent journals. This setup isolates reload recovery; it does not claim the original upload was initiated through the browser file picker.

1. Reload the existing attempt list and prove it remains prepared with zero metadata until the user explicitly clicks resume. Click once, prove exactly one registered row and identical original bytes, then reload again.
2. Explicitly choose cleanup for the second unregistered object. A **test-only Node preload**, absent from product source/builds, returns one503 only for exact native origin, DELETE `/storage/v1/object/passport-evidence`, and a single `prefixes` entry matching that explicitly selected own attempt. It disarms durably before replying; all other traffic uses the real native services. Browser interception cannot substitute for this server-side Storage call.
3. Prove the actual journal is `cleanup_pending`, the bytes remain, a reload preserves the fence and disabled new-upload control, and no implicit cleanup retry or injector rearming occurred.
4. Click explicit retry, verify the native journal is cleaned and actual Storage list/download establish absence. Check the first registered row and original bytes remain, and its cleanup authorization still returns registered. Record no horizontal overflow and capture resumed/fenced/cleaned screenshots.

The workflow requires four completed tests with zero failed/flaky/skipped tests and zero retries, four successful fixed-field readbacks and twelve curated PNGs. Private screenshots/traces/raw errors are not deliverables. On failure it reports only fixed stage/operation/checkpoint/code fields; later stages retain `not_run`.

## Evidence and stop conditions

Keys, passwords, JWTs, CLI status, paths, request bodies, raw SDK/SQL/Playwright logs and signed URLs remain in the owned runner's private0700 directory/0600 files. Only redacted manifest data, fixed assertion labels, actual race outcomes, migration/helper hashes and twelve synthetic PNGs are exported. Public files are checked for secret patterns, allowed names, PNG signatures and hashes. No raw log, trace or private setup file is uploaded.

Any changed schema/app pin, inherited provider credential, nonnative service version, missing migration, unknown Auth creation, side effect, incorrect source bytes, unconfirmed absence, unauthorized action, incomplete44 or skipped/failed browser case prevents PASS. The runner stops only its own app PID and named CLI project, retaining its private data/backups; it does not touch existing stacks. Hosted/public Auth/Storage/runtime checks and a physical phone remain outside this preparation.

Local preparation checks passed11 new source/subprocess/stub guard tests and25 existing upload-fixture/history source controls (36 total), targeted TypeScript and ESLint with zero errors/warnings, all six `.mjs` syntax checks, and zero migration/config diff against the schema witness. The first combined guard invocation in this deliberately sparse checkout was blocked by absent rollback files; restoring three exact tracked Git blobs allowed the same36 checks to run successfully. No assertion or fixture was relaxed. They are **not** actual SQL, Auth, Storage or browser acceptance. Root must integrate/review the test-only commit and run this workflow before OP09 native acceptance is claimed. Pending080/0909 and the app's release status remain unchanged by this file.

## Primary contract sources

- [CLI2.111.0 native Auth provider/global signup environment mapping](https://github.com/supabase/cli/blob/v2.111.0/apps/cli-go/internal/start/start.go): email provider stays enabled for password login while global signup is disabled; SMTP/Mailpit remain excluded.
- [CLI2.111.0 status output](https://github.com/supabase/cli/blob/v2.111.0/apps/cli-go/internal/status/status.go#L102-L115): stdout JSON is captured separately from stderr warnings.
- [Auth admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser): local setup uses admin creation/autoconfirm, never invite.
- [Auth signOut scopes and access-JWT lifetime](https://supabase.com/docs/reference/javascript/auth-signout): local-session revocation is kept separate from JWT expiration.
- [Storage security](https://supabase.com/docs/guides/storage/security/access-control) and [Storage schema](https://supabase.com/docs/guides/storage/schema/design): metadata SQL cannot establish object-byte deletion; this preparation requires actual API bytes/list/download readbacks.
