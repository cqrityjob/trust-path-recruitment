-- Rollback for 20261011090000_cv_documents_editing_provenance.sql.
--
-- Restores the three column comments to the wording 20261010090000 set.
-- Nothing else exists to reverse: that migration changed no column, no
-- constraint, no policy and no grant, so this destroys no data and cannot
-- fail against any row.
--
-- Running it alongside a rollback of the application half is the only time
-- it makes sense. Running it on its own leaves the database describing
-- `presentation` as AI-written-only while the deployed code stores a
-- person's edits in it -- true of the comment, false of the column.

COMMENT ON COLUMN public.cv_documents.presentation IS
  'AI-written wording only: headline, summary, bullets keyed by a source id, '
  'an emphasis ordering and a rationale. Employer names, role titles, dates '
  'and credential titles are NOT stored here and are not fields the '
  'generator is given -- which is what makes an invented employer '
  'structurally impossible rather than merely detectable.';

COMMENT ON COLUMN public.cv_documents.origin IS NULL;
COMMENT ON COLUMN public.cv_documents.title IS NULL;
