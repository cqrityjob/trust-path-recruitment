# Interview configuration contract release

Depends on #404 (20270206090000) and #405 **published and verified**. Claude owns
merge/deployment. This draft must not be merged merely because the app PR merged.
The old deployed app would no longer see AI availability after this migration.

20270207090000 makes the full configuration row, including `updated_by`, readable
only by `is_platform_admin(auth.uid())`. It preserves trusted owner/service writes
and prohibits client INSERT/UPDATE/DELETE, including platform-admin clients, as
the existing production grants already do. The dormant admin UPDATE policy does
not grant UPDATE. Column grants are cleared too. No five-`sp_`-catalogue policy,
AI-provider gate, transcript write gate, case gate or candidate delivery function
is changed.

The actual application reader passes its 8 local PostgREST actor checks after
contract, and the full HTTP matrix passes 224 assertions. SQL contract regression
restores the previous policy inside a savepoint and proves the same candidate
then reads the synthetic admin UUID; after rollback that read is hidden again.

Rollback reopens the known broad config read. Use only as reviewed recovery; no
automatic rollback or production action was performed. Expand rollback is only
safe after app usage has been removed and contract rolled back. The narrow RPC
has no dependence on granting a client direct config access.

Production verification is deliberately pending. `verify-production.sql` reads
only metadata and the migration ledger; no real candidate data is test data.
Compare its definitions/grants with reviewed SQL, then update hosted ledger and
release-state in a separate evidence PR. Independently verify runtime behaviour
using approved synthetic/test accounts before marking the launch findings closed.
