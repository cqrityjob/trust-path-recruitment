-- Rollback of 20261216090000_scp_security_manager_recruitment_content.sql
--
-- Content only: the migration created no table, column, function or policy,
-- so this file deletes exactly the rows it authored, in reverse dependency
-- order, and nothing else.
--
-- REFUSES once the content has been used or judged: an attempt or assignment
-- on the strategic test, an interview case pinned to the strategic guide, a
-- review recorded on the pack, or a grant issued for either. Each of those is
-- a decision somebody made about this content, and a rollback must not
-- delete it; after adoption the supported path is retirement through the
-- governed ladder, not deletion.
--
-- The pack's governance ledger (scp_interview_pack_events) is append-only by
-- trigger. The two rows this migration wrote record the creation of the very
-- content this file removes, and they reference the pack and version by
-- RESTRICT foreign keys; while nothing else was ever recorded on the pack
-- (asserted below), un-creating the content includes un-creating its
-- creation record, so the append-only trigger is disabled for this
-- transaction only, on that table only, and re-enabled before COMMIT.

BEGIN;

DO $guard$
DECLARE _n bigint; _ver uuid; _def uuid;
BEGIN
  SELECT d.id INTO _def FROM public.scp_assessment_definitions d WHERE d.slug = 'security-manager-recruitment';
  SELECT v.id INTO _ver FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'security-manager-se';

  SELECT (SELECT count(*) FROM public.scp_attempts a
            JOIN public.scp_assessment_versions av ON av.id = a.assessment_version_id
           WHERE av.definition_id = _def)
       + (SELECT count(*) FROM public.assessment_assignments aa
            JOIN public.scp_assessment_versions av ON av.id = aa.scp_assessment_version_id
           WHERE av.definition_id = _def)
       + (SELECT count(*) FROM public.scp_test_grants g WHERE g.definition_id = _def)
       + (SELECT count(*) FROM public.scp_interview_cases c WHERE c.pack_version_id = _ver)
       + (SELECT count(*) FROM public.scp_interview_pack_reviews r WHERE r.pack_version_id = _ver)
       + (SELECT count(*) FROM public.scp_interview_pack_pilot_grants g WHERE g.pack_version_id = _ver)
       + (SELECT count(*) FROM public.scp_interview_pack_events e
           WHERE e.pack_version_id = _ver AND e.event NOT IN ('pack_created', 'version_created'))
    INTO _n;
  IF _n > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_REFUSED_ADOPTED: % row(s) use or judge the strategic content; retire it through the governed ladder instead', _n;
  END IF;
END
$guard$;

-- 8. the library setup
DELETE FROM public.scp_recruitment_content_links WHERE role_profile = 'security_manager';
DELETE FROM public.scp_recruitment_role_profiles WHERE role_profile = 'security_manager';

-- 7. the interview guide
ALTER TABLE public.scp_interview_pack_events DISABLE TRIGGER scp_interview_pack_events_append_only;
DELETE FROM public.scp_interview_pack_events e
 USING public.scp_interview_packs p
 WHERE e.pack_id = p.id AND p.slug = 'security-manager-se';
ALTER TABLE public.scp_interview_pack_events ENABLE TRIGGER scp_interview_pack_events_append_only;

DELETE FROM public.scp_interview_rating_anchors a
 USING public.scp_interview_core_questions q, public.scp_interview_pack_versions v, public.scp_interview_packs p
 WHERE a.question_id = q.id AND q.pack_version_id = v.id AND v.pack_id = p.id AND p.slug = 'security-manager-se';
DELETE FROM public.scp_interview_evidence_dimensions d
 USING public.scp_interview_core_questions q, public.scp_interview_pack_versions v, public.scp_interview_packs p
 WHERE d.question_id = q.id AND q.pack_version_id = v.id AND v.pack_id = p.id AND p.slug = 'security-manager-se';
DELETE FROM public.scp_interview_approved_probes pr
 USING public.scp_interview_pack_versions v, public.scp_interview_packs p
 WHERE pr.pack_version_id = v.id AND v.pack_id = p.id AND p.slug = 'security-manager-se';
DELETE FROM public.scp_interview_question_competencies qc
 USING public.scp_interview_core_questions q, public.scp_interview_pack_versions v, public.scp_interview_packs p
 WHERE qc.question_id = q.id AND q.pack_version_id = v.id AND v.pack_id = p.id AND p.slug = 'security-manager-se';
DELETE FROM public.scp_interview_core_questions q
 USING public.scp_interview_pack_versions v, public.scp_interview_packs p
 WHERE q.pack_version_id = v.id AND v.pack_id = p.id AND p.slug = 'security-manager-se';
DELETE FROM public.scp_interview_pack_competency_map m
 USING public.scp_interview_pack_competencies c, public.scp_interview_pack_versions v, public.scp_interview_packs p
 WHERE m.pack_competency_id = c.id AND c.pack_version_id = v.id AND v.pack_id = p.id AND p.slug = 'security-manager-se';
DELETE FROM public.scp_interview_pack_competencies c
 USING public.scp_interview_pack_versions v, public.scp_interview_packs p
 WHERE c.pack_version_id = v.id AND v.pack_id = p.id AND p.slug = 'security-manager-se';
DELETE FROM public.scp_interview_verification_rules r
 USING public.scp_interview_pack_versions v, public.scp_interview_packs p
 WHERE r.pack_version_id = v.id AND v.pack_id = p.id AND p.slug = 'security-manager-se';
-- The prohibitions' "restricts" edges: the coverage guard refuses a DELETE by
-- design (a narrowing must be a superseding, not a removal); a rollback that
-- removes the prohibitions themselves removes their edges with them.
ALTER TABLE public.scp_intel_edges DISABLE TRIGGER scp_intel_edges_prohibition_coverage;
DELETE FROM public.scp_intel_edges e
 USING public.scp_interview_prohibited_areas a, public.scp_interview_pack_versions v, public.scp_interview_packs p
 WHERE e.relation = 'restricts' AND e.from_kind = 'prohibited_area' AND e.from_id = a.id
   AND a.pack_version_id = v.id AND v.pack_id = p.id AND p.slug = 'security-manager-se';
ALTER TABLE public.scp_intel_edges ENABLE TRIGGER scp_intel_edges_prohibition_coverage;
DELETE FROM public.scp_interview_prohibited_areas a
 USING public.scp_interview_pack_versions v, public.scp_interview_packs p
 WHERE a.pack_version_id = v.id AND v.pack_id = p.id AND p.slug = 'security-manager-se';
DELETE FROM public.scp_interview_pack_versions v
 USING public.scp_interview_packs p
 WHERE v.pack_id = p.id AND p.slug = 'security-manager-se';
DELETE FROM public.scp_interview_packs WHERE slug = 'security-manager-se';

-- 6. the eight self-report prompts
DELETE FROM public.scp_interview_guide_prompts pr
 USING public.scp_competency_facets f, public.scp_competencies c
 WHERE pr.facet_id = f.id AND f.competency_id = c.id AND pr.focus = 'explore_self_report' AND pr.authored_by_ai
   AND (c.code, f.slug) IN (('SCC-09','sparbar-uppfoljning'), ('SCC-09','agarskap'),
                            ('SCC-06','aktivt-lyssnande'), ('SCC-06','saklig-tydlighet'),
                            ('SCC-01','transparens'), ('SCC-01','motstand-mot-otillborlig-paverkan'),
                            ('SCC-08','informationsdelning'), ('SCC-11','faktabaserad-bedomning'));

-- 5. rubrics (dimensions and levels cascade from the version)
DELETE FROM public.scp_rubric_versions rv USING public.scp_rubrics r
 WHERE rv.rubric_id = r.id AND r.slug LIKE 'sm-rj-e0%';
DELETE FROM public.scp_rubrics WHERE slug LIKE 'sm-rj-e0%';

-- 4. the items (texts, options and review requirements cascade from the version)
DELETE FROM public.scp_form_items fi USING public.scp_forms f
 WHERE fi.form_id = f.id AND f.slug = 'security-manager-recruitment-form-a';
DELETE FROM public.scp_item_versions iv USING public.scp_items i
 WHERE iv.item_id = i.id AND i.slug LIKE 'sm-rj-%';
DELETE FROM public.scp_items WHERE slug LIKE 'sm-rj-%';

-- 3. form, version, definition, programme
DELETE FROM public.scp_forms WHERE slug = 'security-manager-recruitment-form-a';
DELETE FROM public.scp_assessment_versions av USING public.scp_assessment_definitions d
 WHERE av.definition_id = d.id AND d.slug = 'security-manager-recruitment';
DELETE FROM public.scp_assessment_definitions WHERE slug = 'security-manager-recruitment';
DELETE FROM public.scp_program_versions pv USING public.scp_programs p
 WHERE pv.program_id = p.id AND p.slug = 'security-manager-recruitment';
DELETE FROM public.scp_programs WHERE slug = 'security-manager-recruitment';

-- 1. the requirement profile
DELETE FROM public.scp_behaviour_competency_map m
 USING public.scp_behaviour_versions bv, public.scp_observable_behaviours b
 WHERE m.behaviour_version_id = bv.id AND bv.behaviour_id = b.id
   AND b.slug IN ('risk_based_prioritisation','governance_and_mandate','incident_and_crisis_leadership',
                  'cross_functional_collaboration','compliance_and_follow_up','people_leadership');
DELETE FROM public.scp_behaviour_versions bv USING public.scp_observable_behaviours b
 WHERE bv.behaviour_id = b.id
   AND b.slug IN ('risk_based_prioritisation','governance_and_mandate','incident_and_crisis_leadership',
                  'cross_functional_collaboration','compliance_and_follow_up','people_leadership');
DELETE FROM public.scp_observable_behaviours
 WHERE slug IN ('risk_based_prioritisation','governance_and_mandate','incident_and_crisis_leadership',
                'cross_functional_collaboration','compliance_and_follow_up','people_leadership');
DELETE FROM public.scp_role_versions rv USING public.scp_roles r
 WHERE rv.role_id = r.id AND r.slug = 'security-manager-se';
DELETE FROM public.scp_roles WHERE slug = 'security-manager-se';
DELETE FROM public.scp_professions WHERE slug = 'security-manager-se';

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_assessment_definitions WHERE slug = 'security-manager-recruitment')
     OR EXISTS (SELECT 1 FROM public.scp_interview_packs WHERE slug = 'security-manager-se')
     OR EXISTS (SELECT 1 FROM public.scp_items WHERE slug LIKE 'sm-rj-%')
     OR EXISTS (SELECT 1 FROM public.scp_recruitment_role_profiles WHERE role_profile = 'security_manager')
     OR EXISTS (SELECT 1 FROM public.scp_professions WHERE slug = 'security-manager-se') THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETE: strategic content remains';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scp_recruitment_content_links l JOIN public.scp_interview_packs p ON p.id = l.interview_pack_id
                  WHERE l.role_profile = 'vaktare' AND p.slug = 'vaktare-se') THEN
    RAISE EXCEPTION 'ROLLBACK_OVERREACH: the operational setup was touched';
  END IF;
  IF (SELECT count(*) FROM public.scp_intel_edges WHERE relation = 'restricts')
     <> (SELECT count(*) FROM public.scp_interview_prohibited_areas) * (SELECT count(*) FROM public.scp_ai_tasks) THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETE: prohibition coverage is no longer complete';
  END IF;
END
$verify$;

COMMIT;
