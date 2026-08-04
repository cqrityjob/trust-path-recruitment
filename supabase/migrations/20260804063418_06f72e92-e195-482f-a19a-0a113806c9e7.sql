-- Reconciliation: the live scp_item_versions was created by a re-issued copy of
-- the Phase A1 foundation migration that omitted eight authored columns.
-- The table is empty, so the required columns can be added as NOT NULL directly.

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
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_item_versions) THEN
    RAISE EXCEPTION 'SCP_RECONCILE_ITEM_VERSIONS: table is not empty, refusing to set NOT NULL';
  END IF;
  ALTER TABLE public.scp_item_versions ALTER COLUMN observable_behavior SET NOT NULL;
  ALTER TABLE public.scp_item_versions ALTER COLUMN response_process SET NOT NULL;

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