-- Career analysis availability -- the owner's READ-ONLY checklist.
--
-- Run it in the Supabase SQL editor (as the database owner) BEFORE and AFTER
-- opening the analysis, and again after a rollback. It changes nothing: every
-- statement is a SELECT, and scripts/career-analysis-availability-check.ts
-- fails if one ever stops being. The state is changed elsewhere, on purpose
-- and by hand:
--
--     SELECT public.cd_set_access_state('public', 'Public launch 2026-10-...');
--
-- (docs/release/2026-10-03-career-analysis-availability.md has the full
-- sequence, the browser checklist and the rollback.)
--
-- Read each result as a sentence:
--
--   1  the control      "state is internal_test|public|paused; changed by/at"
--   2  the instrument   "v3.1 is active; these labels; N review gates are
--                        FALSE" -- opening does not change a single one of
--                        them. That is the decision the owner is making.
--   3  who is in        "N internal testers" (irrelevant under public)
--   4  usage            "N sessions, N internal tests" -- under public, new
--                        sessions are ordinary candidate sessions
--                        (is_internal_test = false)
--   5  the boundary     "anon may read the state; nobody on the client may
--                        read the table or change the state without being an
--                        admin" -- all four must read as stated
--   6  what it means    the state in product terms, so no one has to remember
--                        the table above

-- 1 · THE CONTROL -----------------------------------------------------------
SELECT state, note, changed_by, changed_at
  FROM public.cd_access_policy;

-- 2 · THE INSTRUMENT: lifecycle, labels, and every review gate -------------
SELECT definition_version, lifecycle_status, content_version, scoring_version
  FROM public.cd_definition_versions
 WHERE definition_version = '2026-scd-v3.1.0';

SELECT g.key AS review_gate, g.value AS cleared
  FROM public.cd_definition_versions dv
 CROSS JOIN LATERAL jsonb_each(dv.review_status) AS g(key, value)
 WHERE dv.definition_version = '2026-scd-v3.1.0'
 ORDER BY g.key;

SELECT count(*) FILTER (WHERE g.value <> 'true'::jsonb) AS gates_not_cleared,
       count(*)                                         AS gates_total
  FROM public.cd_definition_versions dv
 CROSS JOIN LATERAL jsonb_each(dv.review_status) AS g(key, value)
 WHERE dv.definition_version = '2026-scd-v3.1.0';

-- 3 · WHO IS IN ------------------------------------------------------------
SELECT count(*) AS internal_testers FROM public.cd_internal_testers;

-- 4 · USAGE ----------------------------------------------------------------
SELECT count(*)                                  AS sessions_total,
       count(*) FILTER (WHERE s.is_internal_test) AS sessions_internal_test,
       count(*) FILTER (WHERE s.status = 'completed') AS sessions_completed
  FROM public.cd_sessions s
  JOIN public.cd_definition_versions dv ON dv.id = s.definition_version_id
 WHERE dv.definition_version = '2026-scd-v3.1.0';

-- Sessions begun since the state last changed: the number to look at the day
-- after opening. Everything here should be is_internal_test = false.
SELECT count(*)                                   AS sessions_since_state_change,
       count(*) FILTER (WHERE s.is_internal_test) AS of_which_internal_test
  FROM public.cd_sessions s
  JOIN public.cd_definition_versions dv ON dv.id = s.definition_version_id
  CROSS JOIN public.cd_access_policy p
 WHERE dv.definition_version = '2026-scd-v3.1.0'
   AND s.started_at >= p.changed_at;

SELECT count(*) AS snapshots_total
  FROM public.cd_report_snapshots sn
  JOIN public.cd_sessions s ON s.id = sn.session_id
  JOIN public.cd_definition_versions dv ON dv.id = s.definition_version_id
 WHERE dv.definition_version = '2026-scd-v3.1.0';

-- 5 · THE BOUNDARY (all four must read exactly as stated) -------------------
SELECT
  has_function_privilege('anon',          'public.cd_access_state()',                  'EXECUTE') AS anon_may_read_state,        -- true
  has_function_privilege('anon',          'public.cd_v31_may_start(uuid)',             'EXECUTE') AS anon_may_ask_may_start,     -- false
  has_function_privilege('anon',          'public.cd_set_access_state(text, text)',    'EXECUTE') AS anon_may_set_state,         -- false
  has_table_privilege   ('authenticated', 'public.cd_access_policy',                   'SELECT')  AS client_may_read_table;      -- false

-- 6 · WHAT THE STATE MEANS IN THE PRODUCT ---------------------------------
SELECT state,
       CASE state WHEN 'paused' THEN 'CLOSED' ELSE 'open' END                        AS anonymous_entrance_and_result,
       CASE state
         WHEN 'public'        THEN 'every signed-in account may start and save'
         WHEN 'internal_test' THEN 'only internal testers and platform admins may start; anyone may claim a run finished anonymously'
         ELSE                      'CLOSED for start, save and claim (platform admins only at the database)'
       END                                                                           AS signed_in,
       CASE state WHEN 'public' THEN 'indexable, listed in sitemap.xml'
                  ELSE 'noindex, not in sitemap.xml' END                             AS search_engines
  FROM public.cd_access_policy;

-- OPTIONAL, one person at a time (replace the uuid; a SELECT, changes nothing):
--   SELECT public.cd_v31_may_start('00000000-0000-0000-0000-000000000000'::uuid);
