# OP09: durable upload recovery — schema contract

Base: snapshot app `8f437e85d146e3e2804f09fb01f555f0507c7f2c`.
Canonical migration: `20270309090000_sp_evidence_upload_recovery.sql`, created by the CLI and renamed to the approved unused slot.

This additive schema has **not been installed or SQL-tested locally**. Root stopped local database writes during the disk/Colima I/O incident. Schema replay/SQL assertions and actual GoTrue/Storage concurrency/reload tests are required before its consumer is released. No hosted database or Storage writes were performed by this change's author.

A holder's immutable intent is persisted before any Storage call: own claim or period, generated UUID path, display name, allowed MIME, 1–8 MiB and SHA256. Only a live authenticated holder can begin, reconcile, list or fence cleanup. Direct journal writes and anonymous/service-role function grants are absent. Existing successful `sp_attach_evidence` and `EvidenceRecord` contracts remain unchanged; historical paths without a journal retain their rules.

The `sp_evidence` trigger acquires the journal row lock in the attachment transaction. Storage INSERT/UPDATE policies acquire that same lock and only admit a prepared journal. Explicit cleanup first reconciles every evidence lifecycle, then installs an irreversible cleanup fence while holding the lock. Either registration commits first and prevents orphan deletion, or cleanup commits first and refuses any late attachment and upload. No external Storage request occurs while a database transaction is held. Authenticated owner Storage DELETE remains the existing policy; runtime cleanup only accepts an opaque attempt UUID and derives the path from the holder-owned journal.

`registered` is never treated as an unregistered orphan while its metadata remains, including withdrawn/replaced evidence. Cleanup confirmation requires absence of both evidence and Storage metadata; the runtime must additionally verify the authenticated Storage result with live-session checks. A missing network reply is never proof of deletion. The journal does not claim to independently inspect physical Storage bytes. Resume verifies the downloaded bytes' length, MIME and SHA256 before using the original attach RPC. No verification level above the existing document-provided ceiling is introduced.

Targets deliberately have no cascading journal FK. If a claim/period disappears, its pending intent remains on the holder's global recovery list. On permanent account deletion, uncleaned paths are added to the existing private erasure queue before the holder FK removes the journal; this does not start any worker or cron.

Historical orphan files created before this journal have no durable intent. This migration does not invent their target, hash or state, and does not automatically delete or backfill them. A privileged operator's existing erasure process and direct holder Storage capabilities remain separate boundaries.

Required release evidence:

1. Full migration replay plus `supabase/tests/sp_evidence_upload_recovery_test.sql` on disposable PG17 and supported PG16. This uses synthetic Storage metadata and SQL actor/session context, and cannot substitute for GoTrue/physical bytes.
2. Actual GoTrue/Storage: own create → upload response loss → reload → explicit resume → exactly one evidence record; cleanup failure → reload → explicit retry → verified absence; renewed own session; other holder/anon/revoked-session direct API denial.
3. Two simultaneous clients: delayed attach versus cleanup and delayed Storage metadata write versus cleanup, both possible lock orders. Registered bytes must survive; fenced attempts must refuse late writes. Preserve logs without credentials, bearer URLs, raw bytes or tokens.
4. Swedish/English recovery UI and browser reload; desktop and honestly labelled mobile emulation. No worker, mail, AI or hosted mutation is needed for these isolated checks.

The app release must follow applied-schema proof. An app rollback can leave this private additive schema installed. Schema rollback refuses any nonempty journal (`SP_UPLOAD_ROLLBACK_REQUIRES_EMPTY_JOURNAL`) so a rollback cannot discard unresolved orphan intentions. Do not force-drop pending history to make rollback pass.

Installation order is chronological and schema first: verified07100000 → P1’s08090000 → this09090000 → the recovery application. Do not install09090000 ahead of a lower-numbered pending08090000. This stacked preparation branch must merge fresh main and record the preceding applied states before release. Its current SQL suite remains NOT RUN until exact-head mandatory CI executes it.

Integration observation 2026-10-08: installed071 metadata is normally merged
from6039; hosted baseline is385 identities. Only080 and0909 remain pending,
canonical full history has387 files. The strict runner preserves all41 recovery
and95 P1 assertions before testing0909 rollback refusal on a transactional,
nonempty synthetic journal. It requires the exact P0001 domain denial, rolls
back the probe and verifies no probe Auth/journal rows remain. The existing
empty-journal rollback then removes all10 new functions/table/Storage/attach
fences before older080/071/snapshot/wallet rollback eras. It verifies the old
attach/session functions remain. No CASCADE, ignored SQL error or shortened
assertion floor replaces dependency ordering. Fourteen planted source-contract
controls pass locally; actual SQL execution and native recovery remain pending.
The mandatory workflow runs these controls and their separate typecheck.
