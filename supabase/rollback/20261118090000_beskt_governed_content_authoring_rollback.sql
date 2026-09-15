-- ROLLBACK for 20261118090000_beskt_governed_content_authoring.
--
-- Drops the nine authoring doors and their two internals, and narrows the one
-- governed vocabulary this migration widened back to exactly the members it
-- had before. One transaction, no CASCADE.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────
--
-- It does not delete a single row of authored content. The doors are how
-- content was written; they are not what it is. Removing them takes away the
-- ability to author, exactly as before this migration -- the method content
-- itself belongs to the method versions that carry it, and to the five human
-- gates that approved it.
--
-- ── WHAT IT REFUSES ─────────────────────────────────────────────────────
--
-- It refuses while a content_upserted or content_deleted event is on the
-- append-only ledger. beskt_method_events cannot be deleted from by any
-- caller, the table owner included, so a narrower CHECK could never be
-- validated over those rows: the rollback would fail halfway through, having
-- already dropped the functions. Saying so up front is the difference between
-- a refusal and a half-applied rollback.
--
-- That refusal is also the honest one. Once real editors have authored
-- through these doors, the governance history records it, and taking the
-- doors away without taking the history away would leave a ledger describing
-- operations the schema can no longer express. Removing them after adoption
-- is a forward migration, not an unwind.

BEGIN;

DO $$
DECLARE _events integer;
BEGIN
  SELECT count(*) INTO _events FROM public.beskt_method_events
   WHERE event IN ('content_upserted', 'content_deleted');
  IF _events <> 0 THEN
    RAISE EXCEPTION
      'BESKT_CONTENT_AUTHORING_ROLLBACK: % content authoring event(s) are on the append-only '
      'ledger. beskt_method_events refuses DELETE for every caller including the owner, so the '
      'event vocabulary cannot be narrowed back over them. Authored content has already been '
      'written through these doors; removing them is a forward migration, not an unwind.', _events;
  END IF;
END $$;

-- ---- the nine doors ------------------------------------------------------
DROP FUNCTION IF EXISTS public.beskt_delete_content(uuid, uuid, integer, text, text);
DROP FUNCTION IF EXISTS public.beskt_author_activation_requirement(uuid, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.beskt_author_observation_field(uuid, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.beskt_author_evidence_anchor(uuid, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.beskt_author_routing_rule(uuid, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.beskt_author_prompt(uuid, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.beskt_author_item(uuid, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.beskt_author_section(uuid, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.beskt_author_exposure_profile(uuid, uuid, integer, jsonb);

-- ---- then the internals they stood on ------------------------------------
DROP FUNCTION IF EXISTS public.beskt_content_commit(
  jsonb, uuid, text, text, text, text, uuid, boolean);
DROP FUNCTION IF EXISTS public.beskt_content_gate(uuid, integer);
DROP FUNCTION IF EXISTS public.beskt_content_reject_unknown_keys(text, jsonb, text[]);

-- ---- the vocabulary, back to its 20261108090000 members -------------------
ALTER TABLE public.beskt_method_events DROP CONSTRAINT IF EXISTS beskt_method_events_event_check;
ALTER TABLE public.beskt_method_events
  ADD CONSTRAINT beskt_method_events_event_check
  CHECK (event IN (
    'method_created', 'version_created', 'new_version_created',
    'draft_touched', 'submitted_for_review',
    'review_approved', 'review_rejected',
    'published', 'suspended', 'retired'));

-- ---- and prove the way back is actually clear ----------------------------
DO $proof$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('beskt_author_exposure_profile', 'beskt_author_section',
                       'beskt_author_item', 'beskt_author_prompt', 'beskt_author_routing_rule',
                       'beskt_author_evidence_anchor', 'beskt_author_observation_field',
                       'beskt_author_activation_requirement', 'beskt_delete_content',
                       'beskt_content_gate', 'beskt_content_commit',
                       'beskt_content_reject_unknown_keys');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BESKT_CONTENT_AUTHORING_ROLLBACK: % authoring function(s) survived.', _n;
  END IF;

  -- The ten lifecycle RPCs of 20261108090000 are untouched: this rollback is
  -- about the authoring doors and nothing else.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('beskt_create_method', 'beskt_create_method_version', 'beskt_touch_draft',
                       'beskt_submit_for_review', 'beskt_record_review', 'beskt_publish_version',
                       'beskt_suspend_version', 'beskt_retire_version',
                       'beskt_grant_governance', 'beskt_revoke_governance');
  IF _n <> 10 THEN
    RAISE EXCEPTION
      'BESKT_CONTENT_AUTHORING_ROLLBACK: the ten governed lifecycle RPCs should all survive, found %.', _n;
  END IF;

  -- The law is still attached to all nine content tables: this rollback
  -- removes doors, never guards.
  SELECT count(*) INTO _n
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_proc p ON p.oid = tg.tgfoid
   WHERE p.proname = 'beskt_guard_child_row' AND NOT tg.tgisinternal
     AND c.relname IN ('beskt_exposure_profiles', 'beskt_activation_requirements',
                       'beskt_sections', 'beskt_items', 'beskt_item_options', 'beskt_prompts',
                       'beskt_routing_rules', 'beskt_evidence_anchors', 'beskt_observation_fields');
  IF _n <> 9 THEN
    RAISE EXCEPTION
      'BESKT_CONTENT_AUTHORING_ROLLBACK: the child guard should remain on all nine content tables, found %.', _n;
  END IF;

  -- And no browser role gained table DML on the way out.
  SELECT count(*) INTO _n
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('beskt_exposure_profiles', 'beskt_sections', 'beskt_items',
                        'beskt_item_options', 'beskt_prompts', 'beskt_routing_rules',
                        'beskt_evidence_anchors', 'beskt_observation_fields',
                        'beskt_activation_requirements')
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF _n <> 0 THEN
    RAISE EXCEPTION
      'BESKT_CONTENT_AUTHORING_ROLLBACK: a browser role holds % table DML privilege(s) on BESKT content.', _n;
  END IF;

  RAISE NOTICE 'BESKT_GOVERNED_CONTENT_AUTHORING_ROLLBACK ok';
END $proof$;

COMMIT;
