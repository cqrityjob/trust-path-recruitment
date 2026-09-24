-- Created with supabase migration new; only the filename was moved forward
-- to the next canonical slot because this repository's ledger leads the clock.
--
-- The recruitment candidate list, read by the database.
--
-- ── WHY ──────────────────────────────────────────────────────────────────
--
-- The case page read every application of a vacancy into the server's
-- memory -- at most 5 000 of them -- and filtered, sorted and paged there.
-- A vacancy with more applications than that showed a list, a total and
-- stage counts that quietly left the rest out, and every page shipped the
-- ids of the whole list to the browser so that previous/next could walk
-- it. Nothing said so.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────
--
-- Two SECURITY DEFINER read functions with the same membership rule the
-- rest of the recruitment workspace uses (rec_is_member: an active member
-- of an active organisation), refusing everyone else with one and the same
-- error whether the vacancy exists or not:
--
--   rec_job_counts(_employer_id, _job_id)
--     the stage counts of every application of an organisation's vacancies,
--     counted by the database. No limit, no page.
--
--   rec_candidate_view(_job_id, _stage, _owner, _q, _answers, _sort, _dir,
--                      _page, _size, _around)
--     ONE page of the filtered, ordered candidate list, each row carrying
--     its rank and the filtered total; or, with _around, the row before,
--     the row itself and the row after -- what previous/next needs, and
--     nothing about the rest of the list. The order is stable: every sort
--     breaks ties on the application id, so two calls with the same
--     arguments walk the same list, and a page past the end opens the last
--     page rather than nothing.
--
-- Filters: stage (all / open / decided / new / review / interview), the
-- responsible person ('none' or a member's id), a name search, and yes/no
-- selection answers -- where 'no' means "answered no", so a candidate who
-- never answered matches neither yes nor no. Sorts: applied (default,
-- newest first), name (Swedish collation, unnamed last), stage, and the
-- next planned activity (unplanned last either way round). Nothing in the
-- vacancy's data is written; both functions are STABLE.
--
-- No table changes, no data changes, no new grant to anon. Rollback drops
-- the two functions and nothing else (supabase/rollback/...).

-- ── rec_job_counts ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rec_job_counts(_employer_id uuid, _job_id uuid DEFAULT NULL)
RETURNS TABLE (
  job_id uuid,
  total bigint,
  new_count bigint,
  review_count bigint,
  interview_count bigint,
  hired_count bigint,
  decided_count bigint,
  unresolved_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.rec_is_member(_employer_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT ja.job_id,
           count(*)::bigint,
           count(*) FILTER (WHERE ja.status = 'submitted'),
           count(*) FILTER (WHERE ja.status = 'reviewing'),
           count(*) FILTER (WHERE ja.status = 'interview'),
           count(*) FILTER (WHERE ja.status = 'hired'),
           count(*) FILTER (WHERE ja.status NOT IN ('submitted', 'reviewing', 'interview')),
           count(*) FILTER (WHERE ja.status IN ('submitted', 'reviewing', 'interview'))
      FROM public.job_applications ja
     WHERE ja.employer_id = _employer_id
       AND (_job_id IS NULL OR ja.job_id = _job_id)
     GROUP BY ja.job_id;
END
$$;

REVOKE ALL ON FUNCTION public.rec_job_counts(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_job_counts(uuid, uuid) TO authenticated;

-- ── rec_candidate_view ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rec_candidate_view(
  _job_id uuid,
  _stage text DEFAULT 'open',
  _owner text DEFAULT NULL,
  _q text DEFAULT NULL,
  _answers jsonb DEFAULT '[]'::jsonb,
  _sort text DEFAULT 'applied',
  _dir text DEFAULT NULL,
  _page integer DEFAULT 1,
  _size integer DEFAULT 25,
  _around uuid DEFAULT NULL
)
RETURNS TABLE (
  application_id uuid,
  applicant_user_id uuid,
  display_name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  cv_storage_path text,
  cv_source text,
  responsible_user_id uuid,
  first_viewed_at timestamptz,
  meta_version integer,
  next_activity_at timestamptz,
  next_activity_timezone text,
  next_activity_status text,
  rank bigint,
  total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  _employer uuid;
  _asc boolean;
  _like text;
  _owner_uuid uuid;
  _stage_v text := coalesce(_stage, 'open');
  _sort_v text := coalesce(_sort, 'applied');
  _dir_v text := _dir;
  _page_v integer := coalesce(_page, 1);
  _size_v integer := coalesce(_size, 25);
BEGIN
  -- One refusal for "no such vacancy" and "not your vacancy": the read must
  -- not answer whether another organisation's vacancy id exists.
  SELECT j.employer_id INTO _employer FROM public.jobs j WHERE j.id = _job_id;
  IF _employer IS NULL OR NOT public.rec_is_member(_employer) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _stage_v NOT IN ('all', 'open', 'decided', 'new', 'review', 'interview') THEN
    RAISE EXCEPTION 'CANDIDATE_VIEW_INVALID: stage' USING ERRCODE = 'check_violation';
  END IF;
  IF _sort_v NOT IN ('applied', 'name', 'stage', 'activity') THEN
    RAISE EXCEPTION 'CANDIDATE_VIEW_INVALID: sort' USING ERRCODE = 'check_violation';
  END IF;
  IF _dir_v IS NULL THEN
    _dir_v := CASE WHEN _sort_v = 'applied' THEN 'desc' ELSE 'asc' END;
  END IF;
  IF _dir_v NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'CANDIDATE_VIEW_INVALID: dir' USING ERRCODE = 'check_violation';
  END IF;
  _asc := _dir_v = 'asc';
  IF _size_v < 1 OR _size_v > 100 THEN
    RAISE EXCEPTION 'CANDIDATE_VIEW_INVALID: size' USING ERRCODE = 'check_violation';
  END IF;
  IF _page_v < 1 THEN
    _page_v := 1;
  END IF;
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'array' THEN
    RAISE EXCEPTION 'CANDIDATE_VIEW_INVALID: answers' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_answers) f
     WHERE jsonb_typeof(f) <> 'object'
        OR jsonb_typeof(f -> 'value') <> 'boolean'
        OR (f ->> 'question_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'CANDIDATE_VIEW_INVALID: answers' USING ERRCODE = 'check_violation';
  END IF;
  IF _owner IS NOT NULL AND _owner <> 'none' THEN
    IF _owner !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'CANDIDATE_VIEW_INVALID: owner' USING ERRCODE = 'check_violation';
    END IF;
    _owner_uuid := _owner::uuid;
  END IF;
  IF _q IS NOT NULL AND btrim(_q) <> '' THEN
    _like := '%' || replace(replace(replace(btrim(_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT ja.id,
           ja.applicant_user_id,
           p.display_name,
           ja.status,
           ja.created_at,
           ja.updated_at,
           ja.cv_storage_path,
           ja.cv_source,
           m.responsible_user_id,
           m.first_viewed_at,
           m.version,
           -- A planned activity belongs to an open process only: a decided
           -- candidate's leftover booking is not next.
           CASE WHEN ja.status IN ('submitted', 'reviewing', 'interview') THEN b.starts_at END AS next_at,
           CASE WHEN ja.status IN ('submitted', 'reviewing', 'interview') THEN b.timezone END AS next_tz,
           CASE WHEN ja.status IN ('submitted', 'reviewing', 'interview') THEN b.status END AS next_status
      FROM public.job_applications ja
      LEFT JOIN public.profiles p ON p.id = ja.applicant_user_id
      LEFT JOIN public.recruitment_application_meta m ON m.application_id = ja.id
      LEFT JOIN LATERAL (
        SELECT bk.starts_at, bk.timezone, bk.status
          FROM public.recruitment_interview_bookings bk
         WHERE bk.application_id = ja.id
           AND bk.status IN ('planned', 'invited', 'confirmed')
           AND bk.starts_at >= now() - interval '1 hour'
         ORDER BY bk.starts_at
         LIMIT 1
      ) b ON true
     WHERE ja.job_id = _job_id
       AND ja.employer_id = _employer
       AND CASE _stage_v
             WHEN 'all' THEN true
             WHEN 'open' THEN ja.status IN ('submitted', 'reviewing', 'interview')
             WHEN 'decided' THEN ja.status NOT IN ('submitted', 'reviewing', 'interview')
             WHEN 'new' THEN ja.status = 'submitted'
             WHEN 'review' THEN ja.status = 'reviewing'
             WHEN 'interview' THEN ja.status = 'interview'
           END
       AND (_owner IS NULL
            OR (_owner = 'none' AND m.responsible_user_id IS NULL)
            OR (_owner_uuid IS NOT NULL AND m.responsible_user_id = _owner_uuid))
       AND (_like IS NULL OR p.display_name ILIKE _like ESCAPE '\')
       -- Every answer filter must be met by an answer that says so. An
       -- unanswered question is neither yes nor no.
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(_answers) f
          WHERE NOT EXISTS (
            SELECT 1 FROM public.job_application_answers a
             WHERE a.application_id = ja.id
               AND a.question_id = (f ->> 'question_id')::uuid
               AND a.answer_bool = (f ->> 'value')::boolean))
  ), ordered AS (
    SELECT base.*,
           row_number() OVER (ORDER BY
             CASE WHEN _sort_v = 'applied' AND _asc THEN base.created_at END ASC,
             CASE WHEN _sort_v = 'applied' AND NOT _asc THEN base.created_at END DESC,
             CASE WHEN _sort_v = 'name' AND _asc THEN base.display_name COLLATE "sv-SE-x-icu" END ASC NULLS LAST,
             CASE WHEN _sort_v = 'name' AND NOT _asc THEN base.display_name COLLATE "sv-SE-x-icu" END DESC NULLS LAST,
             CASE WHEN _sort_v = 'stage' THEN
               (CASE base.status
                  WHEN 'submitted' THEN 0 WHEN 'reviewing' THEN 1 WHEN 'interview' THEN 2
                  WHEN 'hired' THEN 3 WHEN 'rejected' THEN 4 WHEN 'withdrawn' THEN 5 ELSE 9 END)
               * (CASE WHEN _asc THEN 1 ELSE -1 END) END ASC,
             CASE WHEN _sort_v = 'activity' AND _asc THEN base.next_at END ASC NULLS LAST,
             CASE WHEN _sort_v = 'activity' AND NOT _asc THEN base.next_at END DESC NULLS LAST,
             base.id ASC) AS rn,
           count(*) OVER () AS n
      FROM base
  ), pick AS (
    SELECT o.rn AS around_rn FROM ordered o WHERE _around IS NOT NULL AND o.id = _around
  )
  SELECT o.id, o.applicant_user_id, o.display_name, o.status, o.created_at, o.updated_at,
         o.cv_storage_path, o.cv_source, o.responsible_user_id, o.first_viewed_at, o.version,
         o.next_at, o.next_tz, o.next_status, o.rn, o.n
    FROM ordered o
   WHERE CASE
           WHEN _around IS NOT NULL THEN
             o.rn BETWEEN (SELECT around_rn - 1 FROM pick) AND (SELECT around_rn + 1 FROM pick)
           ELSE
             -- The page, clamped into range: a stale link to page 9 of a
             -- two-page list opens page 2, not nothing.
             o.rn > (LEAST(_page_v, GREATEST(1, ceil(o.n::numeric / _size_v)::integer)) - 1) * _size_v
             AND o.rn <= LEAST(_page_v, GREATEST(1, ceil(o.n::numeric / _size_v)::integer)) * _size_v
         END
   ORDER BY o.rn;
END
$$;

REVOKE ALL ON FUNCTION public.rec_candidate_view(uuid, text, text, text, jsonb, text, text, integer, integer, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_candidate_view(uuid, text, text, text, jsonb, text, text, integer, integer, uuid)
  TO authenticated;

-- ── Apply-time proof ───────────────────────────────────────────────────
-- Anon cannot execute either read; a signed-in person can (and is then
-- refused inside unless a member). Checked here so a stack whose default
-- privileges hand anon every new function is caught by the apply itself.
DO $proof$
BEGIN
  IF has_function_privilege('anon', 'public.rec_job_counts(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rec_candidate_view(uuid,text,text,text,jsonb,text,text,integer,integer,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'REC_CANDIDATE_VIEW_PROOF: anon may execute a recruitment read';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rec_job_counts(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rec_candidate_view(uuid,text,text,text,jsonb,text,text,integer,integer,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'REC_CANDIDATE_VIEW_PROOF: authenticated cannot execute the recruitment reads';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'sv-SE-x-icu') THEN
    RAISE EXCEPTION 'REC_CANDIDATE_VIEW_PROOF: the sv-SE-x-icu collation the name sort relies on is missing';
  END IF;
END
$proof$;
