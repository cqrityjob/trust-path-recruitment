-- Rollback for 20270324090000_vsd_voluntary_self_declarations.sql
--
-- Removes every vsd_ object. Before the tables go, every document that still
-- has a row is queued for Storage erasure, so no file is orphaned by the
-- rollback: the existing storage erasure sweep removes the bytes. The bucket
-- row is left in place (private, and with no policy that admits a client)
-- because Storage refuses to drop a bucket that still holds objects; remove
-- it by hand once the queue has drained.
--
-- No BEGIN/COMMIT of its own: the suite runs this inside its transaction.

INSERT INTO public.storage_erasure_queue (bucket_id, object_path, reason, subject_user_id)
SELECT 'self-declaration-documents', x.storage_path, 'self_declaration_schema_rolled_back', x.holder_user_id
  FROM public.vsd_documents x
 WHERE x.status <> 'erasure_pending';

DROP POLICY IF EXISTS vsd_documents_anon_fence ON storage.objects;
DROP POLICY IF EXISTS vsd_documents_delete_fence ON storage.objects;
DROP POLICY IF EXISTS vsd_documents_update_fence ON storage.objects;
DROP POLICY IF EXISTS vsd_documents_select_fence ON storage.objects;
DROP POLICY IF EXISTS vsd_documents_insert_fence ON storage.objects;
DROP POLICY IF EXISTS vsd_documents_select ON storage.objects;
DROP POLICY IF EXISTS vsd_documents_insert ON storage.objects;

-- With the fences gone the bucket must not fall open to a broader policy.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                AND policyname = 'vsd_documents_closed') THEN
    DROP POLICY vsd_documents_closed ON storage.objects;
  END IF;
END $$;
CREATE POLICY vsd_documents_closed ON storage.objects AS RESTRICTIVE FOR ALL TO public
  USING (bucket_id <> 'self-declaration-documents')
  WITH CHECK (bucket_id <> 'self-declaration-documents');

DROP FUNCTION IF EXISTS public.vsd_document_storage_readable(text);
DROP FUNCTION IF EXISTS public.vsd_document_storage_writable(text);
DROP FUNCTION IF EXISTS public.vsd_purge_due();
DROP FUNCTION IF EXISTS public.vsd_reviewer_record_review(uuid, integer, text);
DROP FUNCTION IF EXISTS public.vsd_reviewer_queue();
DROP FUNCTION IF EXISTS public.vsd_set_document_review_request(uuid, boolean);
DROP FUNCTION IF EXISTS public.vsd_discard_document(uuid);
DROP FUNCTION IF EXISTS public.vsd_attach_document(uuid);
DROP FUNCTION IF EXISTS public.vsd_begin_document(uuid, uuid, integer, text, date, text, text, integer, text);
DROP FUNCTION IF EXISTS public.vsd_delete_declaration(uuid);
DROP FUNCTION IF EXISTS public.vsd_withdraw_declaration(uuid);
DROP FUNCTION IF EXISTS public.vsd_save_declaration(text, text, text, date, boolean, integer);
DROP FUNCTION IF EXISTS public.vsd_my_declarations();
DROP FUNCTION IF EXISTS public.vsd_declaration_payload(public.vsd_declarations);
DROP FUNCTION IF EXISTS public.vsd_document_payload(public.vsd_documents);
DROP FUNCTION IF EXISTS public.vsd_is_reviewer_for(uuid);
DROP FUNCTION IF EXISTS public.vsd_review_available(uuid);
DROP FUNCTION IF EXISTS public.vsd_reconcile(uuid);
DROP FUNCTION IF EXISTS public.vsd_queue_declaration_documents(uuid, text);
DROP FUNCTION IF EXISTS public.vsd_queue_document_erasure(uuid, text);
DROP FUNCTION IF EXISTS public.vsd_current_authorization(text, text);
DROP FUNCTION IF EXISTS public.vsd_assert_caller();

DROP TABLE IF EXISTS public.vsd_document_reviews;
DROP TABLE IF EXISTS public.vsd_document_reviewers;
DROP TABLE IF EXISTS public.vsd_documents;
DROP TABLE IF EXISTS public.vsd_declarations;
DROP TABLE IF EXISTS public.vsd_processing_authorizations;

DROP FUNCTION IF EXISTS public.vsd_document_intent_immutable();
DROP FUNCTION IF EXISTS public.vsd_document_erasure_manifest();
DROP FUNCTION IF EXISTS public.vsd_authorization_immutable();

NOTIFY pgrst, 'reload schema';
