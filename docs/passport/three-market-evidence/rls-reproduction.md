# The pilot catalogue RLS defect — reproduction and correction evidence

Text only. Every id below is synthetic; no hosted project was read or written.

## The defect

`20260817160000` made the credential taxonomy readable by any signed-in
holder under one condition:

```sql
CREATE POLICY sp_credential_types_read ON public.sp_credential_types
  FOR SELECT TO authenticated USING (is_active);
```

`20260915090000` added the internal-pilot axis. Every GB, GB-NI and AE-DU
credential type is `is_active = false, pilot_state = 'internal_pilot'`, and
`sp_market_access(uid, pack)` answers `'pilot'` for an entitled member. The
claim trigger and the read model were taught that answer; the SELECT policy
was not. A real entitled member, reading through PostgREST as `authenticated`,
therefore got the market opened for them and no catalogue in it.

## Reproduction

A fresh database, `supabase/tests/00_bootstrap.sql` then every file in
`supabase/migrations/` in order (273 files, strict replay, nothing skipped).
One synthetic administrator grants one synthetic member GB through
`sp_grant_pilot_member`. Then, exactly as PostgREST would run it:

```
--- the SELECT policy on sp_credential_types, as shipped:
 policyname               | qual
 sp_credential_types_read | is_active

--- as the ENTITLED member, role authenticated:
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<member>';
SELECT public.sp_market_access('<member>', 'GB');              -> pilot
SELECT count(*) FROM public.sp_credential_types
 WHERE market_pack_code = 'GB' AND pilot_state = 'internal_pilot';  -> 0
SELECT count(*) FROM public.sp_credential_types
 WHERE market_pack_code = 'SE';                                -> 8
SELECT code FROM public.sp_credential_types
 WHERE code = 'UK_SIA_LICENCE_DS';                             -> (0 rows)

--- the same rows exist for the owner (RLS bypassed):
SELECT count(*) ... WHERE market_pack_code = 'GB' AND pilot_state = 'internal_pilot';  -> 13
```

Second symptom, same cause. `sp_claims_credential_rules()` is SECURITY
INVOKER and looks the code up under the same policy:

```
INSERT INTO public.sp_claims (... credential_code = 'UK_SIA_LICENCE_DS', jurisdiction_code = 'GB' ...);
ERROR:  SP_CREDENTIAL_CODE_UNKNOWN: UK_SIA_LICENCE_DS
CONTEXT:  PL/pgSQL function sp_claims_credential_rules() line 79 at RAISE
```

Why the existing pilot suite was green: it files its claims as the table
owner, which bypasses row level security.

## Correction

`supabase/migrations/20261109090000_sp_pilot_catalogue_visibility.sql`
replaces the policy with the same three-way answer the rest of the domain
uses:

```sql
USING (
  is_active
  OR (pilot_state = 'internal_pilot' AND market_pack_code IS NOT NULL
      AND public.sp_market_access(auth.uid(), market_pack_code) = 'pilot')
  OR EXISTS (SELECT 1 FROM public.sp_claims c
              WHERE c.holder_user_id = auth.uid()
                AND c.credential_code = public.sp_credential_types.code)
)
```

Same database, same member, after applying that file:

```
sp_market_access('<member>', 'GB')                           -> pilot
GB rows visible to the member (role authenticated)           -> 13
SE rows visible                                              -> 8
code = 'UK_SIA_LICENCE_DS'                                   -> UK_SIA_LICENCE_DS
INSERT of the GB licence as role authenticated               -> INSERT 0 1
pilot rows visible to a NON-member (role authenticated)      -> 0
AE-DU rows visible to the GB member                          -> 0
```

The rollback (`supabase/rollback/20261109090000_..._rollback.sql`) restores
`USING (is_active)` and was round-tripped on the same database: rollback,
policy reads `is_active`, forward file re-applies, proof notice logged.

## What proves it from now on

- `supabase/tests/security_passport_pilot_catalogue_visibility_test.sql`,
  35 assertions, every read and claim as `SET LOCAL ROLE authenticated`:
  a public holder reads production only; a GB member reads all 13 GB rows
  (7 licences, 6 qualifications) and files a GB claim; a GB member reads no
  Dubai, Northern Ireland or Abu Dhabi row; a Dubai member reads 30 (15/15)
  and no GB row; a Northern Ireland member reads the one NI row and no
  ordinary GB row; revocation closes the catalogue but keeps the one type
  already claimed readable; anon is refused outright (42501); Sweden is
  still the only active market.
- `scripts/db-test.sh` runs that suite with a floor of 30, then proves the
  rollback round-trips (rollback → the suite refuses the old policy →
  re-apply → proof), and runs the rollback for good before the entitlement
  rollback that drops `sp_market_access()`.
- The suite fails against the shipped policy (verified before the fix:
  `ASSERTION FAILED: 1.1 the taxonomy read policy consults sp_market_access()`).

## What did not change

No `sp_market_packs` row. Sweden is the only active market; GB, GB-NI and
AE-DU remain `is_active = false`, `legal_review_state = 'pending'`,
`pilot_state = 'internal_pilot'`. `anon` still has no SELECT grant on the
taxonomy. No hosted project was touched: the migration is recorded as
`pending` in `supabase/release-state.json`.
