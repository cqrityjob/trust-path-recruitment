-- A CQrityjob CV is an application source, not a file the candidate must
-- re-upload into the platform that already holds it.
--
-- ══ THE GAP ══════════════════════════════════════════════════════════════
--
-- 20261010090000 gave a candidate somewhere to keep a CV. H3.4A gave them
-- somewhere to apply. Nothing connected the two: `submitJobApplication`
-- requires a PDF, so a person who built their professional identity here
-- had to print it to PDF and upload it back into the same product. Pilot
-- testing found exactly that, and it is the one promise this platform
-- cannot afford to break -- if the identity lives here, the identity is
-- reusable here.
--
-- ══ WHAT AN APPLICATION RECORDS NOW ══════════════════════════════════════
--
--   cv_source            which door the CV came through. 'upload' for every
--                        row that exists today and every external file
--                        after it; 'cqrityjob_cv' for a saved CV.
--   cv_document_id       WHICH saved CV, as a live reference. Provenance
--                        only -- it goes NULL if the person later deletes
--                        that CV, and the application is unharmed because
--                        the artefact is not stored there.
--   cv_document_snapshot WHAT WAS SENT. The facts and the wording, frozen
--                        at submission.
--
-- ══ WHY A SNAPSHOT AND NOT A LIVE READ ═══════════════════════════════════
--
-- Two independent reasons, either of which is sufficient.
--
-- PRODUCT. An application is a historical act. An employer reading it in
-- November must see what the candidate submitted in September, not a
-- document quietly rewritten by an edit made in between. cv_documents
-- already takes this position for its own facts -- it snapshots
-- source_bundle for the identical reason -- so this is that rule applied
-- one level out, not a new one invented here.
--
-- ACCESS. cv_documents has, deliberately, NO employer read policy. Its
-- header says why: "A recruiter who needs a candidate's CV receives it
-- through the application/disclosure machinery that already exists and
-- already records who saw what. Adding a second, quieter route here would
-- be a disclosure nobody logged." A live join from an application into
-- cv_documents would be that second route. Copying the document onto the
-- application at the moment the candidate authorised it keeps the
-- disclosure exactly where the candidate made it, and keeps the CV table
-- owner-only forever.
--
-- ══ WHAT THE SNAPSHOT DOES NOT CARRY ═════════════════════════════════════
--
-- `targetJobText` is stripped from the bundle and `tailoringRationale` from
-- the presentation. Neither is rendered on a CV, and both may quote the
-- advertisement of a DIFFERENT employer the candidate tailored an earlier
-- version against. Sending one employer another employer's job ad is not
-- something a CV was ever asked to do. Removed here, in the copy, so no
-- reader has to remember to omit it.
--
-- Verification PROVENANCE -- who confirmed a credential, by what method --
-- is not carried either, and could not be: trust-annotations.ts never
-- stores it, on any row, precisely so a revoked confirmation disappears
-- rather than persisting in a copy. The employer's view therefore renders
-- the submitted document with no verifier attribution at all. Verified
-- standing reaches an employer the one way it already does: through a
-- holder-authorised, application-scoped Passport disclosure, which this
-- migration does not touch. Nothing here upgrades, downgrades or restates
-- anybody's trust.
--
-- The per-credential `verified` flag inside source_bundle travels with the
-- bundle because it is part of the document the candidate reviewed and
-- chose to send. It was already, in 20261010090000's own words, "a COPY OF
-- A DISPLAY DECISION ... NOT evidence, NOT authorisation". It is not read
-- by any policy or function here either.
--
-- ══ OLD APPLICATIONS ═════════════════════════════════════════════════════
--
-- Untouched and still valid. `cv_source` defaults to 'upload', which is
-- what every existing row actually is: the uploaded-PDF path was the only
-- path that ever existed. No data is rewritten, no column is dropped, no
-- policy changes, and an application with a file renders exactly as it did
-- yesterday.
--
-- ══ WHY sp_submit_application_with_passport IS NOW A DELEGATE ════════════
--
-- Submission has to stay ONE transaction: the application row, the optional
-- Passport disclosure, and now the CV copy either all happen or none do.
-- 20260904090000 argued that at length and it is still right.
--
-- But its signature cannot simply grow. Application code reaches Lovable at
-- merge and migrations apply afterwards, so for a window the deployed
-- caller is the OLD one. Adding defaulted parameters to the same name would
-- leave two candidates PostgREST cannot choose between; replacing the
-- signature would break every submission in that window.
--
-- So this is the expand half of expand/contract:
--
--   sp_submit_application_with_cv_source   the one implementation
--   sp_submit_application_with_passport    unchanged signature, now a thin
--                                          delegate that passes 'upload'
--
-- One body, two doors, no ambiguity, and the old door keeps working for
-- exactly as long as an old caller might knock on it. A later CONTRACT
-- migration drops it once no deployed code calls it.
--
-- Reversible: supabase/rollback/20261018090000_job_application_cqrityjob_cv_rollback.sql
-- Idempotent: safe to replay from an empty database or over itself.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. The columns
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS cv_source text NOT NULL DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS cv_document_id uuid,
  ADD COLUMN IF NOT EXISTS cv_document_snapshot jsonb;

-- A defaulted, non-volatile ADD COLUMN does not rewrite the table on any
-- PostgreSQL this project runs on; existing rows read 'upload' without
-- being touched.

ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_cv_source_check;
ALTER TABLE public.job_applications
  ADD CONSTRAINT job_applications_cv_source_check
    CHECK (cv_source IN ('upload', 'cqrityjob_cv'));

-- The reference is ON DELETE SET NULL and NOT cascade, on purpose. A person
-- deleting a CV from their own list must not delete, alter or invalidate an
-- application an employer has already acted on. What they delete is the
-- editable document; what the employer keeps is the copy that was sent.
ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_cv_document_id_fkey;
ALTER TABLE public.job_applications
  ADD CONSTRAINT job_applications_cv_document_id_fkey
    FOREIGN KEY (cv_document_id) REFERENCES public.cv_documents(id) ON DELETE SET NULL;

-- ── THE SHAPE RULE ───────────────────────────────────────────────────────
--
-- What makes "the application says a CV was attached, and none was" a state
-- the database refuses rather than a bug the interface has to avoid.
--
--   upload        a file, or nothing at all. Never a CV snapshot.
--   cqrityjob_cv  a snapshot, always. Never an uploaded file as well --
--                 an application carries ONE submitted CV, and two would
--                 leave the employer to guess which one was meant.
--
-- Existing rows satisfy the first branch by construction, so the validating
-- scan cannot fail and no row is rewritten.
ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_cv_source_shape_check;
ALTER TABLE public.job_applications
  ADD CONSTRAINT job_applications_cv_source_shape_check CHECK (
    (cv_source = 'upload'
       AND cv_document_snapshot IS NULL
       AND cv_document_id IS NULL)
    OR
    (cv_source = 'cqrityjob_cv'
       AND cv_document_snapshot IS NOT NULL
       AND cv_storage_path IS NULL)
  );

COMMENT ON COLUMN public.job_applications.cv_source IS
  'Which door the submitted CV came through: ''upload'' (an external file in '
  'the job-application-cvs bucket -- the only path that existed before '
  '20261018090000, and what every pre-existing row is) or ''cqrityjob_cv'' (a '
  'saved CV from cv_documents, copied onto this row at submission).';

COMMENT ON COLUMN public.job_applications.cv_document_id IS
  'PROVENANCE ONLY: which saved cv_documents row the candidate chose. Goes '
  'NULL if they later delete that CV; the submitted artefact is '
  'cv_document_snapshot and is never affected. Never the thing an employer '
  'reads -- there is no employer read policy on cv_documents and this column '
  'does not create one.';

COMMENT ON COLUMN public.job_applications.cv_document_snapshot IS
  'WHAT WAS SENT. The saved CV''s facts and wording, frozen at submission, so '
  'an employer reading the application later sees what the candidate '
  'submitted rather than a document edited since. Carries no targetJobText '
  'and no tailoringRationale (either may quote a different employer''s '
  'advertisement) and no verification provenance (never stored anywhere, so a '
  'revoked confirmation cannot survive in a copy).';

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Submission — one implementation
-- ═════════════════════════════════════════════════════════════════════════
--
-- SECURITY INVOKER, exactly as its predecessor: RLS, the BEFORE INSERT
-- trigger and the duplicate-application index apply to this function's
-- writes precisely as they would to a direct insert by the same caller.
--
-- ── WHY THE SNAPSHOT IS BUILT HERE AND NOT SENT IN ───────────────────────
--
-- The caller supplies an ID, never a document. The copy is read out of
-- cv_documents inside this function, under the caller's own RLS, so:
--
--   * a candidate cannot attach another candidate's CV -- the owner-only
--     SELECT policy returns no row, and this raises rather than inserting;
--   * a candidate cannot attach a DOCUMENT they wrote by hand, because
--     there is no parameter through which one could arrive. An employer
--     reading a CQrityjob CV is reading something this database copied out
--     of the candidate's own saved row, not something a browser posted.
--
-- That is the same structural argument cv_documents makes about facts, and
-- it is the reason this is a database function rather than a server-side
-- assembly step.

CREATE OR REPLACE FUNCTION public.sp_submit_application_with_cv_source(
  _application_id        uuid,
  _job_id                uuid,
  _phone                 text,
  _cover_note            text,
  _cv_storage_path       text,
  _cv_original_filename  text,
  _cv_size_bytes         bigint,
  _cv_source             text DEFAULT 'upload',
  _cv_document_id        uuid DEFAULT NULL,
  _include_passport      boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _status    text;
  _shared    boolean := false;
  _eligible  boolean := false;
  _cv        public.cv_documents%ROWTYPE;
  _snapshot  jsonb   := NULL;
  _bundle    jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _cv_source NOT IN ('upload', 'cqrityjob_cv') THEN
    RAISE EXCEPTION 'CV_SOURCE_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  IF _cv_source = 'cqrityjob_cv' THEN
    IF _cv_document_id IS NULL THEN
      RAISE EXCEPTION 'CV_DOCUMENT_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;

    -- INVOKER + owner-only RLS. The `owner_user_id` predicate is defence in
    -- depth and says the intent out loud; RLS is the boundary.
    SELECT * INTO _cv
      FROM public.cv_documents
     WHERE id = _cv_document_id
       AND owner_user_id = auth.uid();

    -- Somebody else's CV, or none. Identical answer for both, and the
    -- application is NOT created: an application that claims a CV it does
    -- not have is the one outcome this whole file exists to prevent.
    IF _cv.id IS NULL THEN
      RAISE EXCEPTION 'CV_DOCUMENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
    END IF;

    _bundle := coalesce(_cv.source_bundle, '{}'::jsonb);

    -- ── ELIGIBILITY ────────────────────────────────────────────────────
    --
    -- The same rule the apply dialog shows in advance
    -- (isCvUsableForApplication, src/lib/professional-identity/cv/
    -- application-source.ts): a name to put at the top, and real
    -- professional history to read. Stated in two places because the
    -- interface has to explain it BEFORE submission and the database has to
    -- be the one that enforces it -- and this copy is the boundary.
    --
    -- It is not a new approval workflow and it invents no state. A saved CV
    -- can only be written by saveCvDraft, which already refuses anything
    -- computeCvReadiness calls `needs_information`; this catches the row
    -- whose profile emptied out afterwards.
    IF coalesce(btrim(_bundle #>> '{identity,displayName}'), '') = ''
       OR (jsonb_array_length(coalesce(_bundle -> 'employment', '[]'::jsonb)) = 0
           AND jsonb_array_length(coalesce(_bundle -> 'education', '[]'::jsonb)) = 0)
    THEN
      RAISE EXCEPTION 'CV_DOCUMENT_NOT_READY' USING ERRCODE = 'check_violation';
    END IF;

    _snapshot := jsonb_build_object(
      'snapshot_version', 'application-cv-snapshot-v1',
      -- Recorded INSIDE the artefact as well as in the column, because the
      -- column is a live reference that goes NULL on delete and this is the
      -- historical statement of which document was sent.
      'cv_document_id', _cv.id,
      'cv_updated_at', _cv.updated_at,
      'title', _cv.title,
      'locale', _cv.locale,
      'purpose', _cv.purpose,
      'origin', _cv.origin,
      'document_version', _cv.document_version,
      'bundle_version', _cv.bundle_version,
      -- See the header: neither of these is rendered on a CV and either may
      -- quote a different employer's advertisement.
      'source_bundle', _bundle - 'targetJobText',
      'presentation', coalesce(_cv.presentation, '{}'::jsonb) - 'tailoringRationale');
  END IF;

  INSERT INTO public.job_applications (
    id, job_id, applicant_user_id, phone, cover_note,
    cv_storage_path, cv_original_filename, cv_mime_type, cv_size_bytes,
    cv_source, cv_document_id, cv_document_snapshot,
    consent_given_at)
  VALUES (
    _application_id, _job_id, auth.uid(), _phone, _cover_note,
    CASE WHEN _cv_source = 'upload' THEN _cv_storage_path END,
    CASE WHEN _cv_source = 'upload' THEN _cv_original_filename END,
    -- Only claimed when there is a file to claim it about. A mime type on a
    -- row with no file is a statement about nothing.
    CASE WHEN _cv_source = 'upload' AND _cv_storage_path IS NOT NULL
         THEN 'application/pdf' END,
    CASE WHEN _cv_source = 'upload' THEN _cv_size_bytes END,
    _cv_source,
    CASE WHEN _cv_source = 'cqrityjob_cv' THEN _cv_document_id END,
    _snapshot,
    now())
  RETURNING status INTO _status;

  IF _include_passport THEN
    -- Unchanged from 20260904090000. "You have nothing verified yet" is a
    -- normal outcome that must submit the application, not roll it back.
    SELECT EXISTS (SELECT 1 FROM public.sp_passport_profiles
                    WHERE holder_user_id = auth.uid())
       AND (EXISTS (SELECT 1 FROM public.sp_claims c
                     WHERE c.holder_user_id = auth.uid()
                       AND c.assertion_level = 'verified'
                       AND c.lifecycle_state = 'active')
         OR EXISTS (SELECT 1 FROM public.sp_experience_periods e
                     WHERE e.holder_user_id = auth.uid()
                       AND e.assertion_level = 'verified'
                       AND e.lifecycle_state = 'active'))
      INTO _eligible;

    IF _eligible THEN
      PERFORM public.sp_share_passport_with_application(
        _application_id, 'employer_review', 30, NULL, NULL);
      _shared := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', _application_id,
    'status', _status,
    'cv_source', _cv_source,
    'passport_requested', _include_passport,
    'passport_shared', _shared,
    'passport_eligible', _eligible);
END; $$;

COMMENT ON FUNCTION public.sp_submit_application_with_cv_source(uuid, uuid, text, text, text, text, bigint, text, uuid, boolean) IS
  'Submits one job application, copying the chosen CQrityjob CV onto it when '
  'the candidate applied with one, and creating the application-scoped '
  'Passport disclosure when they asked for that and have verified content -- '
  'all in one transaction. The CV is READ from cv_documents under the '
  'caller''s own RLS and never accepted as a parameter, so a candidate cannot '
  'attach another person''s CV or a document they composed. SECURITY INVOKER: '
  'RLS, the eligibility trigger and duplicate-application protection are '
  'unchanged.';

REVOKE ALL     ON FUNCTION public.sp_submit_application_with_cv_source(uuid, uuid, text, text, text, text, bigint, text, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sp_submit_application_with_cv_source(uuid, uuid, text, text, text, text, bigint, text, uuid, boolean) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════
-- 3. The old door, kept open and pointed at the same room
-- ═════════════════════════════════════════════════════════════════════════
--
-- Same eight-parameter signature it has always had, so a caller deployed
-- before this migration lands keeps submitting uploads exactly as it did,
-- and PostgREST has no second candidate to choose between. The body is now
-- a delegation, so there is one implementation of "submit an application"
-- and not two to drift apart.

CREATE OR REPLACE FUNCTION public.sp_submit_application_with_passport(
  _application_id        uuid,
  _job_id                uuid,
  _phone                 text,
  _cover_note            text,
  _cv_storage_path       text,
  _cv_original_filename  text,
  _cv_size_bytes         bigint,
  _include_passport      boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.sp_submit_application_with_cv_source(
    _application_id, _job_id, _phone, _cover_note,
    _cv_storage_path, _cv_original_filename, _cv_size_bytes,
    'upload', NULL, _include_passport);
END; $$;

COMMENT ON FUNCTION public.sp_submit_application_with_passport(uuid, uuid, text, text, text, text, bigint, boolean) IS
  'COMPATIBILITY ENTRY POINT (expand phase of 20261018090000). Unchanged '
  'signature and unchanged behaviour: submits an application whose CV is an '
  'uploaded file. Delegates to sp_submit_application_with_cv_source so there '
  'is one implementation. Exists so a caller deployed before that migration '
  'applied keeps working; the CONTRACT migration drops it once none does.';

REVOKE ALL     ON FUNCTION public.sp_submit_application_with_passport(uuid, uuid, text, text, text, text, bigint, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sp_submit_application_with_passport(uuid, uuid, text, text, text, text, bigint, boolean) TO authenticated;
