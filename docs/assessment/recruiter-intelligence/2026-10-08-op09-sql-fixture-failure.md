# OP09 governed-claim fixture failure

[Run37764891403](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37764891403) on `4ff99bcbf680858ebc56b408a4557b6d0719ea0c` failed in both database jobs: PostgreSQL16 `113270002498`, PostgreSQL17 `113270002653`. Both logs identify `supabase/tests/sp_evidence_upload_recovery_test.sql:26`, `SP_GOVERNED_METADATA_IMMUTABLE`, before any of the41 upload-journal assertions. The historical rollback probe was not reached.

The fixture directly inserted an OV licence with title `OP09 licence` and issuer `Synthetic`. The installed closed-catalogue trigger correctly refuses metadata differing from the approved definition. This is an invalid test fixture, not evidence that upload recovery or rollback fails.

The test-only correction calls the existing authenticated holder `sp_save_international_credential` for `INTL_ASIS_CPP` with valid dates and permitted personal fields, retains its generated UUID in a temporary table, and binds all subsequent upload/attach/list/deletion probes to that UUID. It does not rewrite claim IDs, disable triggers, change schema/permissions, shorten assertions, or change historical rollbacks. All41 original assertion labels and the transaction rollback remain.

Local source-contract checks and planted negative controls verify that a direct claim insert, disabled trigger, wrong writer, hardcoded ID, changed assertion, or committed fixture is rejected. These are static checks. No local database execution occurred because the owned Colima runtime is unavailable; a fresh PostgreSQL16/17 CI run must establish the actual41-suite and subsequent history/rollback results.
