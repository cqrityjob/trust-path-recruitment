-- Rollback for 20270325090000_vsd_passport_disclosure.sql
--
-- Removes the Passport bridge and nothing else: after it no statement can be
-- previewed for, attached to or read through a Passport link, and every
-- 20270324090000 object is as that migration left it. The selections and the
-- record of recipients' reads go with their tables; no file is involved.
--
-- No BEGIN/COMMIT of its own: the suite runs this inside its transaction.

DROP FUNCTION IF EXISTS public.vsd_read_disclosed(text);
DROP FUNCTION IF EXISTS public.vsd_my_disclosure_selections();
DROP FUNCTION IF EXISTS public.vsd_withdraw_disclosure_selection(uuid);
DROP FUNCTION IF EXISTS public.vsd_share_operation(uuid);
DROP FUNCTION IF EXISTS public.vsd_create_credential_share(uuid[], text[], integer, text, uuid, uuid[], integer[]);
DROP FUNCTION IF EXISTS public.vsd_preview_disclosure(uuid[], integer[]);
DROP FUNCTION IF EXISTS public.vsd_my_passport_declarations();
DROP FUNCTION IF EXISTS public.vsd_assert_disclosure_choice(uuid, uuid[], integer[]);
DROP FUNCTION IF EXISTS public.vsd_disclosed_statement(public.vsd_declarations);
DROP FUNCTION IF EXISTS public.vsd_disclosure_authorization_for(public.vsd_declarations, text);
DROP FUNCTION IF EXISTS public.vsd_selection_disclosable(public.vsd_disclosure_selections);

DROP TABLE IF EXISTS public.vsd_disclosure_accesses;
DROP TABLE IF EXISTS public.vsd_disclosure_selections;
DROP TABLE IF EXISTS public.vsd_disclosure_choices;
DROP TABLE IF EXISTS public.vsd_disclosure_authorizations;

DROP FUNCTION IF EXISTS public.vsd_disclosure_selection_immutable();
DROP FUNCTION IF EXISTS public.vsd_disclosure_selection_within_seal();
DROP FUNCTION IF EXISTS public.vsd_disclosure_choice_at_creation();
DROP FUNCTION IF EXISTS public.vsd_choice_digest(uuid[], integer[]);
DROP FUNCTION IF EXISTS public.vsd_disclosure_authorization_admissible();

COMMENT ON TABLE public.vsd_declarations IS
  'A holder''s own affirmation of one fixed, versioned statement. Private to the holder; read and '
  'written only through the vsd_ functions. Not a credential, not verification, never shared.';

NOTIFY pgrst, 'reload schema';
