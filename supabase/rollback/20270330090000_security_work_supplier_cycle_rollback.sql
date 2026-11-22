-- Rollback for 20270330090000_security_work_supplier_cycle.sql.
-- Restores sw_private.audit_scope as installed by 20270329090000 and removes
-- every supplier-cycle object, the sharing right and the impact columns.
-- REFUSES while any supplier-cycle record exists, any member holds the sharing
-- right or any risk-asset link carries an impact status other than the
-- default: dropping them would erase decisions, responses, verifications and
-- what was shared with whom. Remove dependent application code first.
BEGIN;
LOCK TABLE public.sw_supplier_profiles, public.sw_asset_dependencies, public.sw_supplier_contracts, public.sw_supplier_obligations, public.sw_decisions,
  public.sw_supplier_requests, public.sw_supplier_request_events, public.sw_supplier_request_shares, public.sw_supplier_responses,
  public.sw_supplier_verifications, public.sw_supplier_reviews, public.sw_workspace_memberships, public.sw_risk_assets IN SHARE ROW EXCLUSIVE MODE;
DO $preserve$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sw_supplier_profiles) OR EXISTS (SELECT 1 FROM public.sw_asset_dependencies)
     OR EXISTS (SELECT 1 FROM public.sw_supplier_contracts) OR EXISTS (SELECT 1 FROM public.sw_supplier_obligations)
     OR EXISTS (SELECT 1 FROM public.sw_decisions) OR EXISTS (SELECT 1 FROM public.sw_supplier_requests)
     OR EXISTS (SELECT 1 FROM public.sw_supplier_reviews)
     OR EXISTS (SELECT 1 FROM public.sw_workspace_memberships WHERE can_share_external)
     OR EXISTS (SELECT 1 FROM public.sw_risk_assets WHERE impact_status <> 'confirmed' OR impact_note <> '') THEN
    RAISE EXCEPTION 'SW_SUPPLIER_CYCLE_ROLLBACK_DATA_PRESENT: supplier-cycle records, sharing rights or impact checks exist' USING ERRCODE = '23514';
  END IF;
END $preserve$;

CREATE OR REPLACE FUNCTION sw_private.audit_scope(_table text, _row jsonb) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN _table IN ('sw_risks', 'sw_actions') THEN array_remove(ARRAY[(_row->>'access_mission_id')::uuid], NULL)
    WHEN _table IN ('sw_controls', 'sw_citations', 'sw_risk_assets') THEN
      array_remove(ARRAY[sw_private.record_scope((_row->>'workspace_id')::uuid, 'risk', _row->>'risk_id')], NULL)
    WHEN _table = 'sw_evidence_links' THEN
      array_remove(ARRAY[sw_private.record_scope((_row->>'workspace_id')::uuid, _row->>'target_kind', _row->>'target_id')], NULL)
    WHEN _table = 'sw_management_reports' THEN
      coalesce(ARRAY(SELECT jsonb_array_elements_text(_row->'mission_scope'))::uuid[], '{}')
    WHEN _table = 'sw_ai_suggestions' THEN
      sw_private.refs_scopes((_row->>'workspace_id')::uuid, _row->>'context_kind', _row->>'context_id', _row->'source_records')
    ELSE '{}'::uuid[]
  END;
$$;

DROP TRIGGER sw_27_supplier_work ON public.sw_actions;
DROP TRIGGER sw_30_impact_stamp ON public.sw_risk_assets;

DROP FUNCTION public.sw_change_supplier_due(uuid, uuid, uuid, integer, text, date, text);
DROP FUNCTION public.sw_withdraw_supplier_request(uuid, uuid, uuid, integer, text);
DROP FUNCTION public.sw_reopen_supplier_request(uuid, uuid, uuid, integer, text);
DROP FUNCTION public.sw_verify_supplier_response(uuid, uuid, uuid, integer, uuid, text, text, text, text);
DROP FUNCTION public.sw_record_supplier_response(uuid, uuid, uuid, integer, jsonb);
DROP FUNCTION public.sw_record_supplier_dispatch(uuid, uuid, uuid, integer, text, text, timestamptz);
DROP FUNCTION public.sw_approve_supplier_share(uuid, uuid, uuid, integer, text, text);
DROP FUNCTION public.sw_save_supplier_request(uuid, uuid, uuid, integer, jsonb);
DROP FUNCTION public.sw_set_asset_impact(uuid, uuid, text, text);
DROP FUNCTION public.sw_set_member_sharing(uuid, uuid, boolean);

-- Commands and everything typed on the request row go before the tables.
DROP FUNCTION sw_private.change_supplier_due(uuid, uuid, uuid, integer, text, date, text);
DROP FUNCTION sw_private.withdraw_supplier_request(uuid, uuid, uuid, integer, text);
DROP FUNCTION sw_private.reopen_supplier_request(uuid, uuid, uuid, integer, text);
DROP FUNCTION sw_private.verify_supplier_response(uuid, uuid, uuid, integer, uuid, text, text, text, text);
DROP FUNCTION sw_private.record_supplier_response(uuid, uuid, uuid, integer, jsonb);
DROP FUNCTION sw_private.record_supplier_dispatch(uuid, uuid, uuid, integer, text, text, timestamptz);
DROP FUNCTION sw_private.approve_supplier_share(uuid, uuid, uuid, integer, text, text);
DROP FUNCTION sw_private.save_supplier_request(uuid, uuid, uuid, integer, jsonb);
DROP FUNCTION sw_private.guard_action_supplier_work();
DROP FUNCTION sw_private.supplier_replayed(uuid, uuid, uuid, text);
DROP FUNCTION sw_private.supplier_request_locked(uuid, uuid, integer);
DROP FUNCTION sw_private.supplier_event(public.sw_supplier_requests, text, text, jsonb, uuid);
DROP FUNCTION sw_private.supplier_share_content(public.sw_supplier_requests);
DROP FUNCTION sw_private.check_supplier_basis(public.sw_supplier_requests);

DROP TABLE public.sw_supplier_reviews;
DROP TABLE public.sw_supplier_verifications;
DROP TABLE public.sw_supplier_responses;
DROP TABLE public.sw_supplier_request_shares;
DROP TABLE public.sw_supplier_request_events;
DROP TABLE public.sw_supplier_requests;
DROP TABLE public.sw_decisions;
DROP TABLE public.sw_supplier_obligations;
DROP TABLE public.sw_supplier_contracts;
DROP TABLE public.sw_asset_dependencies;
DROP TABLE public.sw_supplier_profiles;

DROP FUNCTION sw_private.guard_decision();
DROP FUNCTION sw_private.can_see_subject(uuid, text, uuid);
DROP FUNCTION sw_private.subject_scope(uuid, text, uuid);
DROP FUNCTION sw_private.can_see_supplier_request(uuid, uuid);
DROP FUNCTION sw_private.guard_supplier_review();
DROP FUNCTION sw_private.guard_obligation();
DROP FUNCTION sw_private.guard_contract();
DROP FUNCTION sw_private.guard_dependency();
DROP FUNCTION sw_private.guard_supplier_profile();
DROP FUNCTION sw_private.set_asset_impact(uuid, uuid, text, text);
DROP FUNCTION sw_private.stamp_risk_asset_impact();
DROP FUNCTION sw_private.set_member_sharing(uuid, uuid, boolean);
DROP FUNCTION sw_private.can_share(uuid);

ALTER TABLE public.sw_risk_assets DROP COLUMN impact_checked_at, DROP COLUMN impact_checked_by, DROP COLUMN impact_note, DROP COLUMN impact_status;
ALTER TABLE public.sw_workspace_memberships DROP CONSTRAINT sw_memberships_share_role, DROP COLUMN can_share_external;
COMMIT;
