-- Reconciliation: the live scp_item_versions was created by a re-issued copy of
-- the Phase A1 foundation migration that omitted eight authored columns.
-- On that database the table is empty, so the required columns can be added as
-- NOT NULL directly.
--
-- On a clean replay of the full history there is nothing to reconcile: the
-- authored A1 (20260727120000) already declares observable_behavior and
-- response_process NOT NULL, and Phase 1D (20260803120000) has legitimately
-- seeded content rows by the time this runs. The NOT NULL step is therefore
-- conditional on the columns actually still being nullable. The non-empty
-- guard is kept for the case it was written for -- a table that still needs
-- the constraint -- because SET NOT NULL on populated data cannot be done
-- blind.

ALTER TABLE public.scp_item_versions
  ADD COLUMN IF NOT EXISTS observable_behavior text,
  ADD COLUMN IF NOT EXISTS response_process text,
  ADD COLUMN IF NOT EXISTS context_note text,
  ADD COLUMN IF NOT EXISTS market text,
  ADD COLUMN IF NOT EXISTS legal_source text,
  ADD COLUMN IF NOT EXISTS legal_reviewed_by text,
  ADD COLUMN IF NOT EXISTS legal_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_review_expires_at timestamptz;

DO $$
DECLARE _still_nullable integer;
BEGIN
  SELECT count(*) INTO _still_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'scp_item_versions'
     AND column_name IN ('observable_behavior', 'response_process')
     AND is_nullable = 'YES';

  IF _still_nullable > 0 THEN
    IF EXISTS (SELECT 1 FROM public.scp_item_versions) THEN
      RAISE EXCEPTION 'SCP_RECONCILE_ITEM_VERSIONS: table is not empty, refusing to set NOT NULL';
    END IF;
    ALTER TABLE public.scp_item_versions ALTER COLUMN observable_behavior SET NOT NULL;
    ALTER TABLE public.scp_item_versions ALTER COLUMN response_process SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'scp_item_versions'
       AND column_name IN ('observable_behavior','response_process','context_note','market',
                           'legal_source','legal_reviewed_by','legal_reviewed_at',
                           'legal_review_expires_at')
     GROUP BY table_name HAVING count(*) <> 8
  ) THEN
    RAISE EXCEPTION 'SCP_RECONCILE_ITEM_VERSIONS: expected all 8 columns present';
  END IF;
END $$;