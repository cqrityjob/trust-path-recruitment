-- Self-publication was unreachable for anyone who is BOTH a platform admin
-- and a member of an employer organisation.
--
-- WHAT WENT WRONG. 20260906091000 stamped published_at only when
-- `NOT public.is_platform_admin(auth.uid())`. That made "is this person a
-- platform admin" decide whether the database fills in the publication
-- timestamp -- but the two facts are unrelated. A platform admin who also
-- owns an employer workspace publishes through the EMPLOYER path, and that
-- path never sends published_at (see publishEmployerJob(), which writes only
-- status and updated_at). So the stamp was skipped, and the very next check
-- refused the write:
--
--     A published job requires published_at set to a past or current timestamp
--
-- On the live database that blocked `buller-o-bang` and `cqrityjob`, whose
-- only active member is a platform admin, while employers with ordinary
-- members published perfectly well. Admin moderation was never affected,
-- because that path sends published_at explicitly.
--
-- THE CORRECTION. The question the trigger should have been asking is not
-- "who is the caller" but "did the caller supply a publication timestamp".
-- Nobody supplied one -> the database supplies it. That is a property of the
-- WRITE, not of the person, so it is right for every caller: an ordinary
-- employer member, an employer member who is also an admin, and a moderator
-- publishing without naming a timestamp.
--
--   before:  AND NOT v_is_admin
--            AND NEW.status = 'published'
--            AND OLD.status IN ('draft', 'rejected')
--
--   after:   AND NEW.status = 'published'
--            AND OLD.status IS DISTINCT FROM 'published'
--            AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at
--
-- Three deliberate consequences:
--
--  * `OLD.status IS DISTINCT FROM 'published'` means "a transition INTO
--    published", which is wider than the old `IN ('draft','rejected')` in
--    exactly one useful way: a moderator taking a job from pending_review to
--    published without naming a timestamp now gets one. It also keeps the
--    stamp OFF ordinary edits to an already-published advertisement, which
--    would otherwise silently move its publication date on every save. No new
--    transition is permitted -- the employer allow-list further down is
--    untouched, and it, not this block, decides what may move where.
--
--  * `NEW.published_at IS NOT DISTINCT FROM OLD.published_at` is the whole
--    security story. An ordinary employer who sends nothing gets a stamped
--    timestamp. An ordinary employer who tries to send or backdate one does
--    NOT match this condition, so nothing is stamped, v_stamped_published_at
--    stays false, and the existing moderation-owned guard rejects the write
--    outright. The forged value is refused rather than silently overwritten,
--    which is the stricter of the two behaviours and the one the owner asked
--    for. A platform admin still bypasses that guard and may set published_at
--    explicitly, exactly as the admin moderation path already does.
--
--  * Republication gets a fresh date. An advertisement that was published,
--    archived, restored to draft and published again transitions INTO
--    published with nothing supplied, so it is stamped now(). published_at
--    means "this publication event", and the owner's rule is that an older
--    date must not be carried forward. No original_published_at column is
--    added here.
--
-- NOTHING ELSE CHANGES. No table, column, status, role, RLS policy or grant
-- is touched. The published-job quality gate, the employer status-transition
-- allow-list and the archive-immutability rule are byte-for-byte the ones
-- 20260906091000 installed; this file re-declares the whole function only
-- because CREATE OR REPLACE has no way to patch one condition in place.

CREATE OR REPLACE FUNCTION public.jobs_validate_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_employer_status text;
  v_is_admin boolean;
  -- Set only when THIS trigger stamped published_at a few lines below.
  -- It exempts that one write -- and nothing else -- from the
  -- moderation-owned published_at guard, safely, because the value being
  -- exempted is the one the database just produced itself, never one the
  -- caller sent.
  v_stamped_published_at boolean := false;
BEGIN
  v_is_admin := public.is_platform_admin(auth.uid());

  IF NEW.status = 'rejected' THEN
    IF current_setting('app.job_rejection_in_progress', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'jobs.status can only be set to rejected via reject_job()'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.family_id IS NOT NULL AND NOT public.assert_cig_family_id(NEW.family_id) THEN
    RAISE EXCEPTION 'Invalid family_id %; must be a canonical Career Family', NEW.family_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.profession_slug IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.cig_professions p WHERE p.slug = NEW.profession_slug) THEN
    RAISE EXCEPTION 'Invalid profession_slug %; not found in cig_professions', NEW.profession_slug
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---------------------------------------------------------------------
  -- Employer self-publication: stamp the publication moment.
  -- ---------------------------------------------------------------------
  -- Deliberately placed BEFORE the published-job validation below, so that
  -- block sees the stamped timestamp and applies every one of its rules to
  -- it -- including the 90-day window, which is measured from this exact
  -- value. Placing it after would either bypass those checks or evaluate
  -- them against a value the row never keeps.
  --
  -- Re-stamped on every transition INTO published rather than preserved:
  -- for an advertisement that was published before, archived, restored to
  -- draft and published again, "when did this become visible to candidates"
  -- is today, not last spring. That is also the meaning schema.org
  -- JobPosting.datePosted carries on the public page.
  --
  -- Who this applies to: everyone who does not name a timestamp. A caller
  -- that DOES name one -- which on the admin moderation path means
  -- admin.functions.ts sending published_at explicitly -- fails the last
  -- condition, is not stamped, and keeps the value it chose. A non-admin
  -- that names one is not stamped either, and is then refused outright by
  -- the moderation-owned guard further down. Admin status decides whether
  -- you may SET this column; it no longer decides whether the database
  -- fills it in for you.
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'published'
     AND OLD.status IS DISTINCT FROM 'published'
     AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at THEN
    v_stamped_published_at := true;
    NEW.published_at := now();
  END IF;

  IF NEW.status = 'published' THEN
    SELECT status INTO v_employer_status FROM public.employers WHERE id = NEW.employer_id;
    IF v_employer_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Cannot publish job: employer organisation is not approved (status=%). Approve the employer first.', v_employer_status
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.published_at IS NULL OR NEW.published_at > now() THEN
      RAISE EXCEPTION 'A published job requires published_at set to a past or current timestamp'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.deadline_at IS NOT NULL AND NEW.deadline_at < NEW.published_at THEN
      RAISE EXCEPTION 'deadline_at must be on or after published_at'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.application_method = 'unavailable' THEN
      RAISE EXCEPTION 'A published job cannot have application_method=unavailable'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.application_method = 'external'
       AND (NEW.application_url IS NULL OR btrim(NEW.application_url) = '') THEN
      RAISE EXCEPTION 'Published external job requires a non-empty application_url'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.application_method = 'email'
       AND (NEW.application_email IS NULL OR NEW.application_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
      RAISE EXCEPTION 'Published email job requires a valid application_email'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.expires_at IS NULL THEN
      RAISE EXCEPTION 'A published job requires expires_at to be set (JobPosting validThrough)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.expires_at > NEW.published_at + INTERVAL '90 days' THEN
      RAISE EXCEPTION 'expires_at cannot be more than 90 days after published_at'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT v_is_admin THEN

    IF TG_OP = 'INSERT' THEN
      -- Unchanged, and load-bearing: an employer still cannot INSERT a row
      -- that is already published. Publication is only ever reachable as a
      -- transition off an existing draft, which is what makes the checks
      -- above unavoidable.
      IF NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Employers may only create a job with status=draft'
          USING ERRCODE = 'check_violation';
      END IF;

    ELSIF TG_OP = 'UPDATE' THEN

      IF NEW.employer_id IS DISTINCT FROM OLD.employer_id THEN
        RAISE EXCEPTION 'employer_id cannot be changed'
          USING ERRCODE = 'check_violation';
      END IF;

      -- Unchanged for every write except the self-publication transition,
      -- where the trigger itself has already replaced the value with now()
      -- and whatever the caller sent is gone.
      IF NEW.published_at IS DISTINCT FROM OLD.published_at AND NOT v_stamped_published_at THEN
        RAISE EXCEPTION 'published_at is a moderation-owned field'
          USING ERRCODE = 'check_violation';
      END IF;

      IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT (
          -- The two new ones. An active employer publishes its own advert.
          (OLD.status = 'draft'     AND NEW.status = 'published') OR
          (OLD.status = 'rejected'  AND NEW.status = 'published') OR
          -- Kept, deliberately. pending_review is not deleted and not
          -- orphaned: legacy adverts already sitting in it remain valid and
          -- manageable, and the route into it stays open for the
          -- exceptional advert and for any future moderation policy.
          (OLD.status = 'draft'     AND NEW.status = 'pending_review') OR
          (OLD.status = 'rejected'  AND NEW.status = 'pending_review') OR
          (OLD.status = 'published' AND NEW.status = 'archived')   OR
          (OLD.status = 'draft'     AND NEW.status = 'archived')   OR
          (OLD.status = 'rejected'  AND NEW.status = 'archived')   OR
          -- Restore still lands in draft, never straight back in published.
          -- Combined with the new draft -> published above this is no longer
          -- a way around moderation -- there is no moderation to go around
          -- for an active employer -- but it does keep a restored advert
          -- passing the full publication gate again before it goes live.
          (OLD.status = 'archived'  AND NEW.status = 'draft')
        ) THEN
          RAISE EXCEPTION 'Employers cannot change status from % to %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.status = 'pending_review' THEN
          SELECT status INTO v_employer_status FROM public.employers WHERE id = NEW.employer_id;
          IF v_employer_status IS DISTINCT FROM 'active' THEN
            RAISE EXCEPTION 'Cannot submit job for review: employer organisation is not yet approved (status=%). Contact CQrityjob support.', v_employer_status
              USING ERRCODE = 'check_violation';
          END IF;
        END IF;
      END IF;

      IF OLD.status = 'published' AND NEW.status = 'archived' THEN
        IF NEW.title_sv IS DISTINCT FROM OLD.title_sv
           OR NEW.title_en IS DISTINCT FROM OLD.title_en
           OR NEW.description_sv IS DISTINCT FROM OLD.description_sv
           OR NEW.description_en IS DISTINCT FROM OLD.description_en
           OR NEW.responsibilities IS DISTINCT FROM OLD.responsibilities
           OR NEW.requirements IS DISTINCT FROM OLD.requirements
           OR NEW.requirements_sv IS DISTINCT FROM OLD.requirements_sv
           OR NEW.requirements_en IS DISTINCT FROM OLD.requirements_en
           OR NEW.benefits IS DISTINCT FROM OLD.benefits
           OR NEW.profession_slug IS DISTINCT FROM OLD.profession_slug
           OR NEW.family_id IS DISTINCT FROM OLD.family_id
           OR NEW.related_profession_slugs IS DISTINCT FROM OLD.related_profession_slugs
           OR NEW.sector IS DISTINCT FROM OLD.sector
           OR NEW.employer_type IS DISTINCT FROM OLD.employer_type
           OR NEW.location_text IS DISTINCT FROM OLD.location_text
           OR NEW.country IS DISTINCT FROM OLD.country
           OR NEW.region IS DISTINCT FROM OLD.region
           OR NEW.city IS DISTINCT FROM OLD.city
           OR NEW.workplace_type IS DISTINCT FROM OLD.workplace_type
           OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
           OR NEW.experience_level IS DISTINCT FROM OLD.experience_level
           OR NEW.language_requirements IS DISTINCT FROM OLD.language_requirements
           OR NEW.travel_required IS DISTINCT FROM OLD.travel_required
           OR NEW.shift_work IS DISTINCT FROM OLD.shift_work
           OR NEW.night_work IS DISTINCT FROM OLD.night_work
           OR NEW.regulated IS DISTINCT FROM OLD.regulated
           OR NEW.formal_requirement_ids IS DISTINCT FROM OLD.formal_requirement_ids
           OR NEW.security_vetting_mentioned IS DISTINCT FROM OLD.security_vetting_mentioned
           OR NEW.driving_licence_required IS DISTINCT FROM OLD.driving_licence_required
           OR NEW.application_method IS DISTINCT FROM OLD.application_method
           OR NEW.application_url IS DISTINCT FROM OLD.application_url
           OR NEW.application_email IS DISTINCT FROM OLD.application_email
        THEN
          RAISE EXCEPTION 'Only status may change when archiving a published job'
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.jobs_validate_before_write() IS
  'Job write guard: taxonomy validation, the published-job quality gate '
  '(employer must be active, published_at set and not future, valid '
  'application target, expires_at set and within 90 days), the employer '
  'status-transition allow-list, and the archive-immutability rule. An ACTIVE '
  'employer may take its own advertisement straight to published. As of '
  '20260906100000 published_at is stamped whenever a write transitions a job '
  'INTO published without supplying one -- for every caller, admin or not -- '
  'and a caller-supplied published_at from a non-admin is refused by the '
  'moderation-owned guard rather than overwritten.';

-- ---------------------------------------------------------------------------
-- In-migration assertions
-- ---------------------------------------------------------------------------

DO $$
DECLARE _src text;
BEGIN
  SELECT prosrc INTO _src FROM pg_proc
   WHERE proname = 'jobs_validate_before_write'
     AND pronamespace = 'public'::regnamespace;

  IF _src IS NULL THEN
    RAISE EXCEPTION 'SELF_PUBLISH_FIX: jobs_validate_before_write() is missing';
  END IF;

  -- The defect itself: admin status must no longer gate the stamp.
  -- `AND NOT v_is_admin` existed ONLY in the old stamping condition; the
  -- surviving use is `IF NOT v_is_admin THEN`, which has no `AND`. So this
  -- is exact, where a looser `%NOT v_is_admin%...%` pattern would also match
  -- the employer allow-list further down and fail on a correct function.
  IF _src LIKE '%AND NOT v_is_admin%' THEN
    RAISE EXCEPTION 'SELF_PUBLISH_FIX: the stamp is still gated on is_platform_admin()';
  END IF;

  IF _src NOT LIKE '%NEW.published_at IS NOT DISTINCT FROM OLD.published_at%' THEN
    RAISE EXCEPTION 'SELF_PUBLISH_FIX: the caller-supplied-timestamp condition is missing';
  END IF;

  IF _src NOT LIKE '%NEW.published_at := now()%' THEN
    RAISE EXCEPTION 'SELF_PUBLISH_FIX: published_at is no longer stamped by the trigger';
  END IF;

  -- Everything the previous two migrations installed must still be here.
  IF _src NOT LIKE '%published_at is a moderation-owned field%' THEN
    RAISE EXCEPTION 'SELF_PUBLISH_FIX: the moderation-owned guard is gone';
  END IF;
  IF _src NOT LIKE '%Cannot publish job: employer organisation is not approved%' THEN
    RAISE EXCEPTION 'SELF_PUBLISH_FIX: the employer-must-be-active gate is gone';
  END IF;
  IF _src NOT LIKE '%OLD.status = ''draft''     AND NEW.status = ''published''%' THEN
    RAISE EXCEPTION 'SELF_PUBLISH_FIX: draft -> published left the employer allow-list';
  END IF;
  IF _src NOT LIKE '%NEW.status = ''pending_review''%' THEN
    RAISE EXCEPTION 'SELF_PUBLISH_FIX: pending_review was removed';
  END IF;
  IF _src NOT LIKE '%Only status may change when archiving a published job%' THEN
    RAISE EXCEPTION 'SELF_PUBLISH_FIX: the archive-immutability rule is gone';
  END IF;
  IF _src NOT LIKE '%NEW.requirements_sv IS DISTINCT FROM OLD.requirements_sv%' THEN
    RAISE EXCEPTION 'SELF_PUBLISH_FIX: requirements_sv left the archive-immutability list';
  END IF;
END $$;
