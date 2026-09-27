// Security Passport — does the administrator's answer agree with what a holder
// actually gets? (Proof case K of the completion work order.)
//
//   PASSPORT_MATRIX_DB_URL=postgresql://…/db bun run scripts/passport-availability-agreement.ts
//   … --pin-route-a      the same, with the UK and Dubai pinned to internal pilot
//
// `/admin/passport-catalogue` tells an administrator, per definition, whether it
// is selectable and by whom. That answer is computed in TypeScript
// (catalogue-diagnostics.ts) from the definition's rows, and the database
// decides the real answer on its own (sp_approved_credential_catalogue, the
// claim rules). Two implementations of one rule drift, and a drifted admin
// page would tell the owner a market is open that is not, or the reverse.
//
// So this reads every definition from a migrated LOCAL database, diagnoses each
// one exactly as the admin page does, and PRINTS SQL that checks the diagnosis
// against the database for real principals, inside one rolled-back
// transaction (db-test.sh pipes it into psql, as it does the rds-v1 parity):
//
//   * an ORDINARY holder with no grant is offered, and can save through the
//     real RPC, exactly the definitions diagnosed "selectable" or
//     "selectable_public_pilot" -- and is refused every other with
//     SP_APPROVED_DEFINITION_REQUIRED;
//   * with --pin-route-a, a holder with a valid grant of all three pilot
//     markets is offered and can save exactly those diagnosed "selectable" or
//     "selectable_pilot_members" as well.
//
// Reads a local database; writes nothing itself. The printed SQL rolls back.

import { diagnoseDefinition } from "../src/lib/security-passport/catalogue-diagnostics";
import { loadCatalogueDefinitions, localCatalogueDatabaseUrl } from "./passport-catalogue-rows";

const PIN = process.argv.includes("--pin-route-a");
const PILOT_MARKETS = ["GB", "GB-NI", "AE-DU"];

const rows = loadCatalogueDefinitions(localCatalogueDatabaseUrl()).map((d) =>
  // The same move the Route A fixture makes in the database, so the diagnosis
  // is of the state the SQL below will be run against.
  PIN && d.marketPackCode !== null && PILOT_MARKETS.includes(d.marketPackCode)
    ? {
        ...d,
        packPilotState: d.packPilotState === "public_pilot" ? "internal_pilot" : d.packPilotState,
        pilotState: d.pilotState === "public_pilot" ? "internal_pilot" : d.pilotState,
      }
    : d,
);
if (rows.length === 0) {
  console.error("passport-availability-agreement: no definitions read -- refusing to prove nothing");
  process.exit(1);
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const verdicts = rows.map((d) => {
  const a = diagnoseDefinition(d).availability;
  return {
    code: d.code,
    availability: a,
    ordinary: a === "selectable" || a === "selectable_public_pilot",
    member: a === "selectable" || a === "selectable_public_pilot" || a === "selectable_pilot_members",
  };
});

const ORDINARY = "fe229000-0000-4000-8000-000000000001";
const MEMBER = "fe229000-0000-4000-8000-000000000002";
const ADMIN = "fe229000-0000-4000-8000-000000000009";

const values = verdicts
  .map((v) => `(${q(v.code)},${q(v.availability)},${v.ordinary},${v.member})`)
  .join(",\n ");

console.log(`\\set ON_ERROR_STOP on
BEGIN;
${PIN ? "\\i supabase/tests/security_passport_route_a_markets_fixture.sql" : "-- the replayed state, unpinned"}
CREATE TEMP TABLE diagnosis(code text PRIMARY KEY, availability text NOT NULL, ordinary boolean NOT NULL, member boolean NOT NULL);
INSERT INTO diagnosis VALUES
 ${values};
GRANT SELECT ON diagnosis TO authenticated;
INSERT INTO auth.users(id,email) VALUES
 ('${ORDINARY}','agreement-ordinary@fixture.invalid'),
 ('${MEMBER}','agreement-member@fixture.invalid'),
 ('${ADMIN}','agreement-admin@fixture.invalid');
INSERT INTO public.sp_passport_profiles(holder_user_id,jurisdiction_code,work_location_confirmed_at) VALUES
 ('${ORDINARY}','SE',now()),('${MEMBER}','SE',now());
${
  PIN
    ? `INSERT INTO public.sp_pilot_members(user_id,market_pack_code,granted_by,note) VALUES
 ('${MEMBER}','GB','${ADMIN}','agreement proof'),('${MEMBER}','GB-NI','${ADMIN}','agreement proof'),('${MEMBER}','AE-DU','${ADMIN}','agreement proof');`
    : "-- no grant for anybody: the ordinary holder's answer is the whole proof"
}
DO $$
DECLARE
  d record; t public.sp_credential_types%ROWTYPE; c public.sp_approved_credential_catalogue%ROWTYPE;
  _who text; _uid uuid; _expected boolean; _seen boolean; _in jsonb; _msg text; _saved boolean;
  _offered integer := 0; _refused integer := 0;
BEGIN
  FOREACH _who IN ARRAY ARRAY['ordinary'${PIN ? ",'member'" : ""}] LOOP
    _uid := CASE _who WHEN 'ordinary' THEN '${ORDINARY}'::uuid ELSE '${MEMBER}'::uuid END;
    FOR d IN SELECT * FROM diagnosis ORDER BY code LOOP
      _expected := CASE _who WHEN 'ordinary' THEN d.ordinary ELSE d.member END;
      SELECT * INTO t FROM public.sp_credential_types WHERE code = d.code;
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
      SELECT * INTO c FROM public.sp_approved_credential_catalogue WHERE code = d.code;
      _seen := FOUND;
      IF _seen IS DISTINCT FROM _expected THEN
        RAISE EXCEPTION 'AGREEMENT FAILED: % -- the administrator says % (% %), the % holder % it',
          d.code, d.availability, CASE WHEN _expected THEN 'offered to' ELSE 'withheld from' END, _who,
          _who, CASE WHEN _seen THEN 'is offered' ELSE 'is not offered' END;
      END IF;
      _in := jsonb_build_object('definition_code', d.code,
        'market_country', coalesce(t.jurisdiction_code, ''), 'market_region', coalesce(t.sub_jurisdiction_code, ''),
        'identifier', '', 'issued_on', '2024-05-01', 'valid_until', '2029-05-01', 'no_expiry', false);
      IF t.requires_scope THEN _in := _in || jsonb_build_object('authorisation_scope', 'Fiktivt bevakningsbolag'); END IF;
      IF _seen AND c.issuer_name IS NULL THEN _in := _in || jsonb_build_object('issuer_name', 'Fiktiv Utbildning'); END IF;
      BEGIN
        PERFORM public.sp_save_international_credential(_in);
        _saved := true;
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
        _saved := false;
        IF _expected THEN
          RAISE EXCEPTION 'AGREEMENT FAILED: % -- offered to the % holder, but the save was refused: %', d.code, _who, _msg;
        END IF;
        IF position('SP_APPROVED_DEFINITION_REQUIRED' IN _msg) = 0 THEN
          RAISE EXCEPTION 'AGREEMENT FAILED: % -- withheld from the % holder, and refused for another reason: %', d.code, _who, _msg;
        END IF;
      END;
      IF _saved AND NOT _expected THEN
        RAISE EXCEPTION 'AGREEMENT FAILED: % -- the administrator says % (withheld), but the % holder saved it', d.code, d.availability, _who;
      END IF;
      RESET ROLE;
      IF _expected THEN _offered := _offered + 1; ELSE _refused := _refused + 1; END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'passport availability agreement%: % definitions, % holder answer(s) offered and saved, % withheld and refused -- the administrator''s diagnosis matches the catalogue and the save path',
    ${PIN ? "' (UK and Dubai pinned to internal pilot)'" : "''"}, (SELECT count(*) FROM diagnosis), _offered, _refused;
END $$;
ROLLBACK;`);
