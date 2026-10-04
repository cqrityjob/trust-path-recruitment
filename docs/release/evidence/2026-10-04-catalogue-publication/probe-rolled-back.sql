-- Rolled-back behavioural probe run on production after the publication (nothing persisted: the block
-- ends in RAISE EXCEPTION, so every write inside it is rolled back; production was re-read afterwards:
-- 51 claims with the same fingerprint, 7 details, 0 requests, 373 ledger rows).
--
-- It runs as an ordinary NON-administrator holder (the first passport holder for whom
-- is_platform_admin() is false). The JWT claim role is set to 'probe' so that sp_passport_session_active()
-- passes without writing a session row to the auth schema: this probe therefore does not exercise the
-- session-revocation check, which the SQL suites cover.
--
-- The 140 added codes are captured BEFORE the role switch because sp_catalogue_research_records is
-- administrator-only under RLS (a holder reads 0 rows).
do $probe$
declare
  _uid uuid;
  _codes text[];
  _code text;
  _r jsonb := '{}'::jsonb;
  d public.sp_approved_credential_catalogue%rowtype;
  _id uuid;
  _c public.sp_claims%rowtype;
  _saved int := 0;
  _bad text := '';
  _err text;
begin
  select array_agg(x.credential_code order by x.credential_code) into _codes
    from public.sp_catalogue_research_records x where x.reconciliation_outcome = 'added_approved';
  select p.holder_user_id into _uid from public.sp_passport_profiles p
   where not public.is_platform_admin(p.holder_user_id) order by p.holder_user_id limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'probe')::text, true);
  perform set_config('role', 'authenticated', true);

  perform set_config('request.headers', '{"x-passport-catalogue-contract":"2"}', true);
  _r := _r || jsonb_build_object('offered_of_the_140', (select count(*) from public.sp_approved_credential_catalogue c where c.code = any(_codes)),
                                 'offered_total', (select count(*) from public.sp_approved_credential_catalogue));
  perform set_config('request.headers', '{}', true);

  perform set_config('request.path', '/rpc/sp_save_international_credential', true);
  foreach _code in array _codes loop
    select * into d from public.sp_approved_credential_catalogue where code = _code;
    if not found then _bad := _bad || _code || ':not offered; '; continue; end if;
    begin
      _id := public.sp_save_international_credential(jsonb_build_object('definition_code', _code, 'market_country', '', 'market_region', '',
               'identifier', '', 'issued_on', '2024-05-01', 'valid_until', '2027-05-01', 'no_expiry', false));
      select * into _c from public.sp_claims where id = _id and holder_user_id = _uid;
      if not found or _c.credential_code <> _code or _c.jurisdiction_code is not null or _c.sub_jurisdiction_code is not null
         or _c.claimed_issuer_name is distinct from d.issuer_name or _c.authorisation_scope is not null
         or _c.assertion_level <> 'self_declared' or _c.lifecycle_state <> 'active'
         or not exists (select 1 from public.sp_credential_details x where x.claim_id = _id) then
        _bad := _bad || _code || ':read back wrong; ';
      else
        _saved := _saved + 1;
      end if;
    exception when others then
      get stacked diagnostics _err = message_text;
      _bad := _bad || _code || ':' || left(_err, 60) || '; ';
    end;
  end loop;
  _r := _r || jsonb_build_object('saved_and_read_back', _saved, 'failures', nullif(_bad, ''));

  begin
    perform public.sp_save_international_credential(jsonb_build_object('definition_code', 'INTL_OFFSEC_OSCP', 'market_country', '', 'market_region', '',
              'identifier', '', 'issued_on', '2024-05-01', 'valid_until', '', 'no_expiry', true));
    _r := _r || jsonb_build_object('oscp_no_expiry', 'accepted?!');
  exception when others then
    get stacked diagnostics _err = message_text;
    _r := _r || jsonb_build_object('oscp_no_expiry', left(_err, 80));
  end;
  begin
    perform public.sp_save_international_credential(jsonb_build_object('definition_code', 'INTL_DOES_NOT_EXIST', 'market_country', '', 'market_region', '',
              'identifier', '', 'issued_on', '2024-05-01', 'valid_until', '2027-05-01', 'no_expiry', false));
    _r := _r || jsonb_build_object('unknown_code', 'accepted?!');
  exception when others then
    get stacked diagnostics _err = message_text;
    _r := _r || jsonb_build_object('unknown_code', left(_err, 80));
  end;
  perform set_config('request.path', '', true);
  _r := _r || jsonb_build_object('cafs_still_unavailable', (select count(*) from public.sp_catalogue_unavailable_matches('CAFS', 8)));

  perform set_config('role', 'postgres', true);
  raise exception 'PROBE_RESULT %', _r::text;
end
$probe$;
