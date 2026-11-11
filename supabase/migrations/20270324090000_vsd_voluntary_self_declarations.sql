-- =============================================================================
-- Voluntary profile self-declarations (vsd_*)
-- =============================================================================
--
-- Rollback: supabase/rollback/20270324090000_vsd_voluntary_self_declarations_rollback.sql
-- Suite:    supabase/tests/vsd_voluntary_self_declarations_test.sql
-- Design:   docs/legal/voluntary-self-declarations-processing.md
--
-- Written directly at the next canonical slot (the repository's versions run
-- ahead of the wall clock; see docs/release/release-sequence.md).
--
-- ── WHAT THIS IS ────────────────────────────────────────────────────────
--
-- A holder may, if they choose, record a dated statement of their own on
-- /my-career/profile. Three kinds, kept apart:
--
--   enforcement_debt_none   no current debts registered with the enforcement
--                           authority (Sweden: Kronofogden)
--   payment_remarks_none    no current payment remarks
--   criminal_history        a criminal-history statement, only inside an
--                           explicitly reviewed jurisdiction, period and
--                           processing purpose
--
-- It is SELF-DECLARATION. It is not verification, identity verification,
-- security clearance or approval for employment, and nothing here can turn
-- it into one: there is no score, rank, badge or decision column, no free
-- text, no amount, creditor, offence or identity-number column, and no
-- "negative" answer -- the only thing that can be stored is the holder's own
-- affirmation of a fixed, versioned statement, or nothing at all.
--
-- ── WHAT IT IS NOT PART OF ──────────────────────────────────────────────
--
-- Not the Security Passport. Nothing is written to sp_claims or any sp_*
-- table, and no existing function is replaced, so Passport completion,
-- numbering, titles, sharing payloads, talent cards, CV sources and
-- application payloads cannot see these rows: no reader of theirs names a
-- vsd_ object (the suite proves that from the catalogue).
--
-- ── THE PROCESSING GATE ─────────────────────────────────────────────────
--
-- vsd_processing_authorizations records, per kind and jurisdiction, the
-- actual operator, purpose, legal basis, retention and permitted operations.
-- EVERY write below requires a current row there, and the Storage policies
-- require it too, so a direct Data API or Storage call is refused exactly as
-- the screen is.
--
-- THIS MIGRATION INSERTS NO AUTHORIZATION. No legal assessment exists in this
-- repository and none is invented here: after installation every kind is
-- closed, and stays closed until an authorization is recorded by a later,
-- reviewed migration. No client role, and no RPC, can write that table.
--
-- A criminal-history authorization additionally cannot rest on consent, and
-- must name the national-law authority (GDPR Art. 10) and the period it was
-- reviewed for. The table refuses the row otherwise.
--
-- ── DOCUMENTS ───────────────────────────────────────────────────────────
--
-- An optional supporting document (where the authorization permits storing
-- one) lives in its own private bucket, `self-declaration-documents`, never
-- in passport-evidence. A document is bound to the exact declaration
-- revision it was attached to. Changing or renewing the statement, or
-- replacing the document, sends the old file to erasure, and a review is a
-- row about ONE document at ONE revision -- so an old review cannot be
-- inherited.
--
-- Provenance is derived, never stored: self_declared, document_provided, or
-- document_reviewed (only when an appointed reviewer has recorded that the
-- document matches the declared details). Passport verifiers and platform
-- admins are NOT reviewers here; a reviewer is a row in
-- vsd_document_reviewers for one authorization, and sees a document only
-- while its holder has asked for the review.
--
-- ── ERASURE ─────────────────────────────────────────────────────────────
--
-- Withdrawing, deleting, changing or replacing moves the document row to
-- `erasure_pending` and writes public.storage_erasure_queue in the SAME
-- transaction. From that moment no client policy reads the object. The row
-- stays -- visible to the holder as an owed cleanup, retryable -- until the
-- object is really absent from storage.objects; only then does it go.
-- Account erasure reaches these tables through the existing catalogue-driven
-- cascade, and the BEFORE DELETE manifest below queues the files first.
--
-- No worker, cron, mail, AI, OCR, provider call or backfill. No existing
-- table, function, policy or row changes.

-- ── Preflight ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.storage_erasure_queue') IS NULL THEN
    RAISE EXCEPTION 'VSD_PREFLIGHT: the storage erasure queue is missing.';
  END IF;
  IF to_regprocedure('public.sp_passport_session_active()') IS NULL THEN
    RAISE EXCEPTION 'VSD_PREFLIGHT: the live-session check is missing.';
  END IF;
  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'VSD_PREFLIGHT: Storage is missing.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relname LIKE 'vsd\_%') THEN
    RAISE EXCEPTION 'VSD_PREFLIGHT: a vsd_ object already exists.';
  END IF;
END $$;

-- ── 1 · Processing authorizations ───────────────────────────────────────

CREATE TABLE public.vsd_processing_authorizations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_kind         text NOT NULL
    CHECK (declaration_kind IN ('enforcement_debt_none', 'payment_remarks_none', 'criminal_history')),
  jurisdiction             text NOT NULL CHECK (jurisdiction ~ '^[A-Z]{2}$'),
  -- The exact wording the holder affirms. The application holds the text; a
  -- declaration is refused unless it names this version.
  statement_version        text NOT NULL CHECK (statement_version ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  operator_name            text NOT NULL CHECK (length(btrim(operator_name)) BETWEEN 2 AND 200),
  operator_registration    text NOT NULL CHECK (length(btrim(operator_registration)) BETWEEN 2 AND 100),
  purpose                  text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 20 AND 2000),
  legal_basis              text NOT NULL
    CHECK (legal_basis IN ('consent', 'contract', 'legal_obligation', 'legitimate_interests', 'public_task')),
  legal_basis_detail       text NOT NULL CHECK (length(btrim(legal_basis_detail)) BETWEEN 20 AND 4000),
  -- The assessment (DPIA / legal review) this row was approved in.
  assessment_reference     text NOT NULL CHECK (length(btrim(assessment_reference)) BETWEEN 3 AND 500),
  -- GDPR Art. 10: the national-law authority for offence data.
  offence_data_authority   text CHECK (offence_data_authority IS NULL
                                       OR length(btrim(offence_data_authority)) BETWEEN 10 AND 2000),
  -- The period a criminal-history statement speaks about, as reviewed.
  statement_period         text CHECK (statement_period IS NULL
                                       OR length(btrim(statement_period)) BETWEEN 3 AND 200),
  retention_days           integer NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
  permitted_operations     text[] NOT NULL,
  permitted_document_types text[] NOT NULL DEFAULT '{}',
  approved_by_name         text NOT NULL CHECK (length(btrim(approved_by_name)) BETWEEN 2 AND 200),
  approved_on              date NOT NULL,
  effective_from           timestamptz NOT NULL DEFAULT now(),
  revoked_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  -- There is deliberately no disclosure operation: nothing here authorizes
  -- showing a declaration to anybody but its holder (and an appointed
  -- reviewer, for one document, on the holder's request).
  CONSTRAINT vsd_auth_operations_known CHECK (
    permitted_operations <@ ARRAY['collect_declaration', 'store_document', 'human_document_review']
    AND 'collect_declaration' = ANY (permitted_operations)),
  CONSTRAINT vsd_auth_review_needs_document CHECK (
    NOT ('human_document_review' = ANY (permitted_operations))
    OR 'store_document' = ANY (permitted_operations)),
  CONSTRAINT vsd_auth_document_types_match_kind CHECK (
    permitted_document_types <@ CASE declaration_kind
      WHEN 'enforcement_debt_none' THEN ARRAY['enforcement_authority_statement']
      WHEN 'payment_remarks_none'  THEN ARRAY['credit_report']
      ELSE ARRAY['police_extract'] END),
  CONSTRAINT vsd_auth_document_types_iff_storage CHECK (
    (cardinality(permitted_document_types) > 0) = ('store_document' = ANY (permitted_operations))),
  -- A consent box does not authorize offence-data processing.
  CONSTRAINT vsd_auth_criminal_needs_reviewed_basis CHECK (
    declaration_kind <> 'criminal_history'
    OR (legal_basis <> 'consent'
        AND offence_data_authority IS NOT NULL
        AND statement_period IS NOT NULL)),
  CONSTRAINT vsd_auth_revoked_after_effective CHECK (revoked_at IS NULL OR revoked_at >= effective_from)
);

CREATE UNIQUE INDEX vsd_auth_one_current_idx
  ON public.vsd_processing_authorizations (declaration_kind, jurisdiction)
  WHERE revoked_at IS NULL;

ALTER TABLE public.vsd_processing_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vsd_processing_authorizations FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.vsd_processing_authorizations IS
  'The recorded operator, purpose, legal basis, retention and permitted operations for one kind of '
  'voluntary self-declaration in one jurisdiction. Written only by a reviewed migration; no client '
  'role and no RPC can write it. Without a current row the kind collects nothing.';

CREATE FUNCTION public.vsd_authorization_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'VSD_AUTHORIZATION_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  -- The one permitted change: revoking, once.
  IF OLD.revoked_at IS NOT NULL
     OR NEW.revoked_at IS NULL
     OR (to_jsonb(NEW) - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at') THEN
    RAISE EXCEPTION 'VSD_AUTHORIZATION_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.vsd_authorization_immutable() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER vsd_authorization_immutable BEFORE UPDATE OR DELETE ON public.vsd_processing_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.vsd_authorization_immutable();

-- ── 2 · Declarations ────────────────────────────────────────────────────

CREATE TABLE public.vsd_declarations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  authorization_id  uuid NOT NULL REFERENCES public.vsd_processing_authorizations(id) ON DELETE RESTRICT,
  declaration_kind  text NOT NULL
    CHECK (declaration_kind IN ('enforcement_debt_none', 'payment_remarks_none', 'criminal_history')),
  jurisdiction      text NOT NULL CHECK (jurisdiction ~ '^[A-Z]{2}$'),
  statement_version text NOT NULL,
  -- The day the statement speaks about.
  as_of_date        date NOT NULL,
  -- Moves on every change, renewal and withdrawal. A document or review
  -- names the revision it belongs to.
  revision          integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status            text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'withdrawn', 'deletion_pending')),
  declared_at       timestamptz NOT NULL DEFAULT now(),
  withdrawn_at      timestamptz,
  retain_until      timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vsd_decl_withdrawn_stamp CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL))
);

-- One statement per holder, kind and jurisdiction. A row whose files are
-- still being erased does not block a new one.
CREATE UNIQUE INDEX vsd_decl_one_per_kind_idx
  ON public.vsd_declarations (holder_user_id, declaration_kind, jurisdiction)
  WHERE status <> 'deletion_pending';
CREATE INDEX vsd_decl_holder_idx ON public.vsd_declarations (holder_user_id);
CREATE INDEX vsd_decl_retention_idx ON public.vsd_declarations (retain_until);

ALTER TABLE public.vsd_declarations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vsd_declarations FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.vsd_declarations IS
  'A holder''s own affirmation of one fixed, versioned statement. Private to the holder; read and '
  'written only through the vsd_ functions. Not a credential, not verification, never shared.';

-- ── 3 · Documents ───────────────────────────────────────────────────────

CREATE TABLE public.vsd_documents (
  -- Chosen by the caller before the upload, so a lost response can be retried.
  id                   uuid PRIMARY KEY,
  holder_user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  declaration_id       uuid NOT NULL REFERENCES public.vsd_declarations(id) ON DELETE CASCADE,
  declaration_revision integer NOT NULL CHECK (declaration_revision > 0),
  document_type        text NOT NULL
    CHECK (document_type IN ('enforcement_authority_statement', 'credit_report', 'police_extract')),
  jurisdiction         text NOT NULL CHECK (jurisdiction ~ '^[A-Z]{2}$'),
  issue_date           date NOT NULL,
  storage_path         text NOT NULL UNIQUE,
  file_name            text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 300),
  mime_type            text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes           integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  sha256               text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  status               text NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared', 'attached', 'erasure_pending')),
  review_requested_at  timestamptz,
  erasure_requested_at timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vsd_doc_path_is_owned CHECK (
    storage_path = holder_user_id::text || '/' || id::text || '.' ||
      CASE mime_type WHEN 'application/pdf' THEN 'pdf' WHEN 'image/jpeg' THEN 'jpg' ELSE 'png' END),
  CONSTRAINT vsd_doc_erasure_stamp CHECK ((status = 'erasure_pending') = (erasure_requested_at IS NOT NULL))
);

CREATE UNIQUE INDEX vsd_doc_one_attached_idx ON public.vsd_documents (declaration_id) WHERE status = 'attached';
CREATE UNIQUE INDEX vsd_doc_one_prepared_idx ON public.vsd_documents (declaration_id) WHERE status = 'prepared';
CREATE INDEX vsd_doc_holder_idx ON public.vsd_documents (holder_user_id);

ALTER TABLE public.vsd_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vsd_documents FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.vsd_documents IS
  'An optional supporting document for one declaration at one revision, in the private '
  'self-declaration-documents bucket. erasure_pending means the file is owed to the erasure queue '
  'and is no longer readable; the row leaves only once the object is absent.';

-- ── 4 · Reviewers and reviews ───────────────────────────────────────────

CREATE TABLE public.vsd_document_reviewers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  authorization_id  uuid NOT NULL REFERENCES public.vsd_processing_authorizations(id) ON DELETE RESTRICT,
  appointed_by_name text NOT NULL CHECK (length(btrim(appointed_by_name)) BETWEEN 2 AND 200),
  appointed_on      date NOT NULL,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX vsd_reviewer_one_current_idx
  ON public.vsd_document_reviewers (user_id, authorization_id) WHERE revoked_at IS NULL;
ALTER TABLE public.vsd_document_reviewers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vsd_document_reviewers FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.vsd_document_reviewers IS
  'People appointed to review documents under ONE processing authorization. Not derived from any '
  'platform role: a Passport verifier or an administrator is not a reviewer here. Written only by a '
  'reviewed migration.';

CREATE TABLE public.vsd_document_reviews (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id          uuid NOT NULL UNIQUE REFERENCES public.vsd_documents(id) ON DELETE CASCADE,
  declaration_id       uuid NOT NULL REFERENCES public.vsd_declarations(id) ON DELETE CASCADE,
  declaration_revision integer NOT NULL,
  reviewer_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- What a human can honestly say about a file: that it is the stated type
  -- of document, issued on the stated date. Never that a record is "clean".
  outcome              text NOT NULL CHECK (outcome IN ('matches_declared_details', 'not_confirmed')),
  reviewed_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vsd_document_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vsd_document_reviews FROM PUBLIC, anon, authenticated, service_role;

-- ── 5 · The bucket ──────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('self-declaration-documents', 'self-declaration-documents', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 6 · Internal helpers (no client role can execute these) ─────────────

CREATE FUNCTION public.vsd_assert_caller()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR auth.role() IS DISTINCT FROM 'authenticated'
     OR NOT public.sp_passport_session_active() THEN
    RAISE EXCEPTION 'VSD_NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  RETURN _uid;
END $$;
REVOKE ALL ON FUNCTION public.vsd_assert_caller() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.vsd_current_authorization(_kind text, _jurisdiction text)
RETURNS public.vsd_processing_authorizations
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a FROM public.vsd_processing_authorizations a
   WHERE a.declaration_kind = _kind AND a.jurisdiction = _jurisdiction
     AND a.revoked_at IS NULL AND a.effective_from <= now()
$$;
REVOKE ALL ON FUNCTION public.vsd_current_authorization(text, text) FROM PUBLIC, anon, authenticated, service_role;

-- The file is owed to the erasure queue from this statement on.
CREATE FUNCTION public.vsd_queue_document_erasure(_document_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _doc public.vsd_documents;
BEGIN
  SELECT * INTO _doc FROM public.vsd_documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND OR _doc.status = 'erasure_pending' THEN RETURN; END IF;
  UPDATE public.vsd_documents
     SET status = 'erasure_pending', erasure_requested_at = now(),
         review_requested_at = NULL, updated_at = now()
   WHERE id = _doc.id;
  DELETE FROM public.vsd_document_reviews WHERE document_id = _doc.id;
  INSERT INTO public.storage_erasure_queue (bucket_id, object_path, reason, subject_user_id, requested_by)
  VALUES ('self-declaration-documents', _doc.storage_path, _reason, _doc.holder_user_id, auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.vsd_queue_document_erasure(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.vsd_queue_declaration_documents(_declaration_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _id uuid;
BEGIN
  FOR _id IN SELECT id FROM public.vsd_documents
              WHERE declaration_id = _declaration_id AND status <> 'erasure_pending' ORDER BY id LOOP
    PERFORM public.vsd_queue_document_erasure(_id, _reason);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.vsd_queue_declaration_documents(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- Bring one holder's rows in line with the truth:
--   * a statement past its retention, or whose authorization was revoked,
--     is deleted like any other deletion;
--   * a document owed to erasure leaves once its object is really absent,
--     and is queued again if the object is there with nothing queued;
--   * a deleted statement leaves once none of its documents remain.
CREATE FUNCTION public.vsd_reconcile(_holder uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _d record; _doc record;
BEGIN
  FOR _d IN
    SELECT d.id FROM public.vsd_declarations d
      JOIN public.vsd_processing_authorizations a ON a.id = d.authorization_id
     WHERE d.holder_user_id = _holder AND d.status <> 'deletion_pending'
       AND (d.retain_until <= now() OR a.revoked_at IS NOT NULL)
     ORDER BY d.id FOR UPDATE OF d
  LOOP
    PERFORM public.vsd_queue_declaration_documents(_d.id, 'self_declaration_retention_ended');
    UPDATE public.vsd_declarations
       SET status = 'deletion_pending', withdrawn_at = NULL, revision = revision + 1, updated_at = now()
     WHERE id = _d.id;
  END LOOP;

  FOR _doc IN
    SELECT id, storage_path FROM public.vsd_documents
     WHERE holder_user_id = _holder AND status = 'erasure_pending' ORDER BY id FOR UPDATE
  LOOP
    IF NOT EXISTS (SELECT 1 FROM storage.objects
                    WHERE bucket_id = 'self-declaration-documents' AND name = _doc.storage_path) THEN
      DELETE FROM public.vsd_documents WHERE id = _doc.id;
    ELSIF NOT EXISTS (SELECT 1 FROM public.storage_erasure_queue
                       WHERE bucket_id = 'self-declaration-documents'
                         AND object_path = _doc.storage_path AND completed_at IS NULL) THEN
      INSERT INTO public.storage_erasure_queue (bucket_id, object_path, reason, subject_user_id, requested_by)
      VALUES ('self-declaration-documents', _doc.storage_path, 'self_declaration_erasure_requeued', _holder, auth.uid());
    END IF;
  END LOOP;

  DELETE FROM public.vsd_declarations d
   WHERE d.holder_user_id = _holder AND d.status = 'deletion_pending'
     AND NOT EXISTS (SELECT 1 FROM public.vsd_documents x WHERE x.declaration_id = d.id);
END $$;
REVOKE ALL ON FUNCTION public.vsd_reconcile(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Account erasure and any other row delete: capture the path before the row
-- that names it disappears. A row already owed to erasure is already queued.
CREATE FUNCTION public.vsd_document_erasure_manifest()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.status <> 'erasure_pending' THEN
    INSERT INTO public.storage_erasure_queue (bucket_id, object_path, reason, subject_user_id, requested_by)
    VALUES ('self-declaration-documents', OLD.storage_path, 'self_declaration_rows_erased',
            OLD.holder_user_id, auth.uid());
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.vsd_document_erasure_manifest() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER vsd_document_erasure_manifest BEFORE DELETE ON public.vsd_documents
  FOR EACH ROW EXECUTE FUNCTION public.vsd_document_erasure_manifest();

-- What a document was uploaded as never changes, and erasure is one-way.
CREATE FUNCTION public.vsd_document_intent_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (OLD.id, OLD.holder_user_id, OLD.declaration_id, OLD.declaration_revision, OLD.document_type,
      OLD.jurisdiction, OLD.issue_date, OLD.storage_path, OLD.file_name, OLD.mime_type,
      OLD.size_bytes, OLD.sha256, OLD.created_at)
     IS DISTINCT FROM
     (NEW.id, NEW.holder_user_id, NEW.declaration_id, NEW.declaration_revision, NEW.document_type,
      NEW.jurisdiction, NEW.issue_date, NEW.storage_path, NEW.file_name, NEW.mime_type,
      NEW.size_bytes, NEW.sha256, NEW.created_at) THEN
    RAISE EXCEPTION 'VSD_DOCUMENT_INTENT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'erasure_pending' AND NEW.status <> 'erasure_pending' THEN
    RAISE EXCEPTION 'VSD_DOCUMENT_ERASURE_FENCED' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'attached' AND NEW.status = 'prepared' THEN
    RAISE EXCEPTION 'VSD_DOCUMENT_INTENT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.vsd_document_intent_immutable() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER vsd_document_intent_immutable BEFORE UPDATE ON public.vsd_documents
  FOR EACH ROW EXECUTE FUNCTION public.vsd_document_intent_immutable();

CREATE FUNCTION public.vsd_review_available(_authorization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vsd_processing_authorizations a
     WHERE a.id = _authorization_id AND a.revoked_at IS NULL AND a.effective_from <= now()
       AND 'human_document_review' = ANY (a.permitted_operations)
       AND EXISTS (SELECT 1 FROM public.vsd_document_reviewers r
                    WHERE r.authorization_id = a.id AND r.revoked_at IS NULL))
$$;
REVOKE ALL ON FUNCTION public.vsd_review_available(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.vsd_is_reviewer_for(_authorization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.vsd_document_reviewers r
      JOIN public.vsd_processing_authorizations a ON a.id = r.authorization_id
     WHERE r.user_id = auth.uid() AND r.authorization_id = _authorization_id AND r.revoked_at IS NULL
       AND a.revoked_at IS NULL AND a.effective_from <= now()
       AND 'human_document_review' = ANY (a.permitted_operations))
$$;
REVOKE ALL ON FUNCTION public.vsd_is_reviewer_for(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.vsd_document_payload(_doc public.vsd_documents)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', _doc.id, 'documentType', _doc.document_type, 'jurisdiction', _doc.jurisdiction,
    'issueDate', _doc.issue_date, 'fileName', _doc.file_name, 'mimeType', _doc.mime_type,
    'sizeBytes', _doc.size_bytes, 'sha256', _doc.sha256, 'status', _doc.status,
    'declarationRevision', _doc.declaration_revision, 'storagePath', _doc.storage_path,
    'reviewRequestedAt', _doc.review_requested_at, 'createdAt', _doc.created_at,
    'review', (SELECT jsonb_build_object('outcome', r.outcome, 'reviewedAt', r.reviewed_at,
                                         'declarationRevision', r.declaration_revision)
                 FROM public.vsd_document_reviews r WHERE r.document_id = _doc.id))
$$;
REVOKE ALL ON FUNCTION public.vsd_document_payload(public.vsd_documents) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.vsd_declaration_payload(_d public.vsd_declarations)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', _d.id, 'kind', _d.declaration_kind, 'jurisdiction', _d.jurisdiction,
    'statementVersion', _d.statement_version, 'asOfDate', _d.as_of_date,
    'declaredAt', _d.declared_at, 'revision', _d.revision, 'status', _d.status,
    'withdrawnAt', _d.withdrawn_at, 'retainUntil', _d.retain_until,
    'authorizationId', _d.authorization_id,
    -- Derived on every read; nothing stores a level that could go stale.
    'provenance', CASE
      WHEN _d.status <> 'active' THEN NULL
      WHEN EXISTS (SELECT 1 FROM public.vsd_documents x
                     JOIN public.vsd_document_reviews r ON r.document_id = x.id
                    WHERE x.declaration_id = _d.id AND x.status = 'attached'
                      AND x.declaration_revision = _d.revision
                      AND r.declaration_revision = _d.revision
                      AND r.outcome = 'matches_declared_details') THEN 'document_reviewed'
      WHEN EXISTS (SELECT 1 FROM public.vsd_documents x
                    WHERE x.declaration_id = _d.id AND x.status = 'attached'
                      AND x.declaration_revision = _d.revision) THEN 'document_provided'
      ELSE 'self_declared' END,
    'document', (SELECT public.vsd_document_payload(x) FROM public.vsd_documents x
                  WHERE x.declaration_id = _d.id AND x.status = 'attached'
                    AND x.declaration_revision = _d.revision),
    'pendingUpload', (SELECT public.vsd_document_payload(x) FROM public.vsd_documents x
                       WHERE x.declaration_id = _d.id AND x.status = 'prepared'),
    'erasures', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'documentId', x.id, 'fileName', x.file_name, 'requestedAt', x.erasure_requested_at,
               'attempts', coalesce(q.attempts, 0), 'failed', coalesce(q.failed, false))
             ORDER BY x.erasure_requested_at, x.id)
        FROM public.vsd_documents x
        LEFT JOIN LATERAL (
          SELECT max(e.attempts) AS attempts, bool_or(e.last_error IS NOT NULL) AS failed
            FROM public.storage_erasure_queue e
           WHERE e.bucket_id = 'self-declaration-documents' AND e.object_path = x.storage_path
             AND e.completed_at IS NULL) q ON true
       WHERE x.declaration_id = _d.id AND x.status = 'erasure_pending'), '[]'::jsonb),
    'reviewAvailable', public.vsd_review_available(_d.authorization_id))
$$;
REVOKE ALL ON FUNCTION public.vsd_declaration_payload(public.vsd_declarations) FROM PUBLIC, anon, authenticated, service_role;

-- ── 7 · The holder's functions ──────────────────────────────────────────

CREATE FUNCTION public.vsd_my_declarations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _uid uuid := public.vsd_assert_caller();
BEGIN
  PERFORM public.vsd_reconcile(_uid);
  RETURN jsonb_build_object(
    -- What is open, and on whose authority: shown to the holder before they
    -- declare anything. A kind that is absent here collects nothing.
    'authorizations', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'kind', a.declaration_kind, 'jurisdiction', a.jurisdiction,
               'statementVersion', a.statement_version, 'operatorName', a.operator_name,
               'operatorRegistration', a.operator_registration, 'purpose', a.purpose,
               'legalBasis', a.legal_basis, 'legalBasisDetail', a.legal_basis_detail,
               'statementPeriod', a.statement_period, 'retentionDays', a.retention_days,
               'permittedOperations', to_jsonb(a.permitted_operations),
               'permittedDocumentTypes', to_jsonb(a.permitted_document_types))
             ORDER BY a.declaration_kind, a.jurisdiction)
        FROM public.vsd_processing_authorizations a
       WHERE a.revoked_at IS NULL AND a.effective_from <= now()), '[]'::jsonb),
    'declarations', coalesce((
      SELECT jsonb_agg(public.vsd_declaration_payload(d) ORDER BY d.declaration_kind, d.jurisdiction, d.created_at, d.id)
        FROM public.vsd_declarations d WHERE d.holder_user_id = _uid), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.vsd_my_declarations() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_my_declarations() TO authenticated;

-- Save, change or renew. The holder's own affirmation is required on every
-- call; a change or renewal moves the revision and sends any document that
-- supported the previous one to erasure.
CREATE FUNCTION public.vsd_save_declaration(
  _kind text, _jurisdiction text, _statement_version text, _as_of_date date,
  _affirmed boolean, _expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _uid uuid := public.vsd_assert_caller();
  _auth public.vsd_processing_authorizations;
  _row public.vsd_declarations;
BEGIN
  IF _affirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'VSD_AFFIRMATION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF _kind IS NULL OR _jurisdiction IS NULL OR _statement_version IS NULL THEN
    RAISE EXCEPTION 'VSD_INVALID_INPUT' USING ERRCODE = '23514';
  END IF;
  _auth := public.vsd_current_authorization(_kind, _jurisdiction);
  IF _auth.id IS NULL THEN
    RAISE EXCEPTION 'VSD_PROCESSING_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _auth.statement_version <> _statement_version THEN
    RAISE EXCEPTION 'VSD_STATEMENT_VERSION_MISMATCH' USING ERRCODE = '23514';
  END IF;
  -- One day of slack for a holder ahead of the server's date.
  IF _as_of_date IS NULL OR _as_of_date > current_date + 1 OR _as_of_date < current_date - 31 THEN
    RAISE EXCEPTION 'VSD_INVALID_DATE' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO _row FROM public.vsd_declarations
   WHERE holder_user_id = _uid AND declaration_kind = _kind AND jurisdiction = _jurisdiction
     AND status <> 'deletion_pending'
   FOR UPDATE;

  IF NOT FOUND THEN
    IF _expected_revision IS NOT NULL THEN
      RAISE EXCEPTION 'VSD_STALE_REVISION' USING ERRCODE = '23514';
    END IF;
    BEGIN
      INSERT INTO public.vsd_declarations
        (holder_user_id, authorization_id, declaration_kind, jurisdiction, statement_version,
         as_of_date, retain_until)
      VALUES (_uid, _auth.id, _kind, _jurisdiction, _statement_version, _as_of_date,
              now() + make_interval(days => _auth.retention_days))
      RETURNING * INTO _row;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'VSD_DECLARATION_EXISTS' USING ERRCODE = '23505';
    END;
  ELSE
    -- A second "save" from a stale screen must not silently renew.
    IF _expected_revision IS NULL THEN
      RAISE EXCEPTION 'VSD_DECLARATION_EXISTS' USING ERRCODE = '23505';
    END IF;
    IF _expected_revision <> _row.revision THEN
      RAISE EXCEPTION 'VSD_STALE_REVISION' USING ERRCODE = '23514';
    END IF;
    PERFORM public.vsd_queue_declaration_documents(_row.id, 'self_declaration_changed');
    UPDATE public.vsd_declarations
       SET authorization_id = _auth.id, statement_version = _statement_version,
           as_of_date = _as_of_date, revision = revision + 1, status = 'active',
           declared_at = now(), withdrawn_at = NULL,
           retain_until = now() + make_interval(days => _auth.retention_days), updated_at = now()
     WHERE id = _row.id
     RETURNING * INTO _row;
  END IF;
  PERFORM public.vsd_reconcile(_uid);
  RETURN public.vsd_declaration_payload(_row);
END $$;
REVOKE ALL ON FUNCTION public.vsd_save_declaration(text, text, text, date, boolean, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_save_declaration(text, text, text, date, boolean, integer) TO authenticated;

-- Withdrawing never needs an authorization: a holder can always take a
-- statement back.
CREATE FUNCTION public.vsd_withdraw_declaration(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _uid uuid := public.vsd_assert_caller(); _row public.vsd_declarations;
BEGIN
  SELECT * INTO _row FROM public.vsd_declarations WHERE id = _id AND holder_user_id = _uid FOR UPDATE;
  IF NOT FOUND OR _row.status = 'deletion_pending' THEN
    RAISE EXCEPTION 'VSD_DECLARATION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF _row.status = 'active' THEN
    PERFORM public.vsd_queue_declaration_documents(_row.id, 'self_declaration_withdrawn');
    UPDATE public.vsd_declarations
       SET status = 'withdrawn', withdrawn_at = now(), revision = revision + 1, updated_at = now()
     WHERE id = _row.id RETURNING * INTO _row;
  END IF;
  PERFORM public.vsd_reconcile(_uid);
  RETURN public.vsd_declaration_payload(_row);
END $$;
REVOKE ALL ON FUNCTION public.vsd_withdraw_declaration(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_withdraw_declaration(uuid) TO authenticated;

-- Deleting removes the statement from every normal read at once. The row
-- itself leaves when its files are really gone; until then it is returned
-- as an owed cleanup, never as "deleted".
CREATE FUNCTION public.vsd_delete_declaration(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _uid uuid := public.vsd_assert_caller(); _row public.vsd_declarations;
BEGIN
  SELECT * INTO _row FROM public.vsd_declarations WHERE id = _id AND holder_user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VSD_DECLARATION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF _row.status <> 'deletion_pending' THEN
    PERFORM public.vsd_queue_declaration_documents(_row.id, 'self_declaration_deleted');
    UPDATE public.vsd_declarations
       SET status = 'deletion_pending', withdrawn_at = NULL, revision = revision + 1, updated_at = now()
     WHERE id = _row.id;
  END IF;
  PERFORM public.vsd_reconcile(_uid);
  SELECT * INTO _row FROM public.vsd_declarations WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', true, 'pendingFiles', 0);
  END IF;
  RETURN jsonb_build_object('deleted', false,
    'pendingFiles', (SELECT count(*) FROM public.vsd_documents WHERE declaration_id = _id));
END $$;
REVOKE ALL ON FUNCTION public.vsd_delete_declaration(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_delete_declaration(uuid) TO authenticated;

-- ── 8 · Documents ───────────────────────────────────────────────────────

CREATE FUNCTION public.vsd_begin_document(
  _id uuid, _declaration_id uuid, _declaration_revision integer, _document_type text,
  _issue_date date, _file_name text, _mime_type text, _size_bytes integer, _sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _uid uuid := public.vsd_assert_caller();
  _decl public.vsd_declarations;
  _auth public.vsd_processing_authorizations;
  _row public.vsd_documents;
  _old uuid;
  _path text;
BEGIN
  IF _id IS NULL OR _declaration_id IS NULL OR _declaration_revision IS NULL THEN
    RAISE EXCEPTION 'VSD_INVALID_INPUT' USING ERRCODE = '23514';
  END IF;
  IF _mime_type IS NULL OR _mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png')
     OR _size_bytes IS NULL OR _size_bytes NOT BETWEEN 1 AND 8388608
     OR _sha256 IS NULL OR _sha256 !~ '^[0-9a-f]{64}$'
     OR _file_name IS NULL OR length(_file_name) NOT BETWEEN 1 AND 300
     OR _issue_date IS NULL OR _issue_date > current_date + 1 THEN
    RAISE EXCEPTION 'VSD_INVALID_INPUT' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO _decl FROM public.vsd_declarations
   WHERE id = _declaration_id AND holder_user_id = _uid FOR UPDATE;
  IF NOT FOUND OR _decl.status <> 'active' THEN
    RAISE EXCEPTION 'VSD_DECLARATION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF _decl.revision <> _declaration_revision THEN
    RAISE EXCEPTION 'VSD_STALE_REVISION' USING ERRCODE = '23514';
  END IF;
  _auth := public.vsd_current_authorization(_decl.declaration_kind, _decl.jurisdiction);
  IF _auth.id IS NULL OR _auth.id <> _decl.authorization_id
     OR NOT ('store_document' = ANY (_auth.permitted_operations))
     OR _document_type IS NULL OR NOT (_document_type = ANY (_auth.permitted_document_types)) THEN
    RAISE EXCEPTION 'VSD_PROCESSING_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.vsd_documents WHERE id = _id FOR UPDATE;
  IF FOUND THEN
    -- A retry of the same intention, or nothing.
    IF _row.holder_user_id <> _uid THEN
      RAISE EXCEPTION 'VSD_DOCUMENT_NOT_FOUND' USING ERRCODE = '42501';
    END IF;
    IF (_row.declaration_id, _row.declaration_revision, _row.document_type, _row.issue_date,
        _row.file_name, _row.mime_type, _row.size_bytes, _row.sha256)
       IS DISTINCT FROM
       (_declaration_id, _declaration_revision, _document_type, _issue_date,
        _file_name, _mime_type, _size_bytes, _sha256) THEN
      RAISE EXCEPTION 'VSD_UPLOAD_INTENT_MISMATCH' USING ERRCODE = '23514';
    END IF;
    RETURN public.vsd_document_payload(_row);
  END IF;

  IF EXISTS (SELECT 1 FROM public.vsd_documents
              WHERE declaration_id = _declaration_id AND status = 'attached' AND sha256 = _sha256) THEN
    RAISE EXCEPTION 'VSD_DOCUMENT_DUPLICATE' USING ERRCODE = '23505';
  END IF;
  -- An earlier upload that never finished is abandoned, not left behind.
  FOR _old IN SELECT id FROM public.vsd_documents
               WHERE declaration_id = _declaration_id AND status = 'prepared' LOOP
    PERFORM public.vsd_queue_document_erasure(_old, 'self_declaration_upload_abandoned');
  END LOOP;

  _path := _uid::text || '/' || _id::text || '.' ||
    CASE _mime_type WHEN 'application/pdf' THEN 'pdf' WHEN 'image/jpeg' THEN 'jpg' ELSE 'png' END;
  INSERT INTO public.vsd_documents
    (id, holder_user_id, declaration_id, declaration_revision, document_type, jurisdiction,
     issue_date, storage_path, file_name, mime_type, size_bytes, sha256)
  VALUES (_id, _uid, _declaration_id, _declaration_revision, _document_type, _decl.jurisdiction,
          _issue_date, _path, _file_name, _mime_type, _size_bytes, _sha256)
  RETURNING * INTO _row;
  RETURN public.vsd_document_payload(_row);
END $$;
REVOKE ALL ON FUNCTION public.vsd_begin_document(uuid, uuid, integer, text, date, text, text, integer, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_begin_document(uuid, uuid, integer, text, date, text, text, integer, text) TO authenticated;

-- The object must really be there, and the statement must still be the one
-- the upload was begun for. Attaching replaces: the previous document goes
-- to erasure in the same transaction, and its review with it.
CREATE FUNCTION public.vsd_attach_document(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _uid uuid := public.vsd_assert_caller();
  _row public.vsd_documents;
  _decl public.vsd_declarations;
  _auth public.vsd_processing_authorizations;
  _old uuid;
BEGIN
  SELECT * INTO _row FROM public.vsd_documents WHERE id = _id AND holder_user_id = _uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VSD_DOCUMENT_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  -- Statement first, then document: the order every other writer locks in.
  SELECT * INTO _decl FROM public.vsd_declarations WHERE id = _row.declaration_id FOR UPDATE;
  SELECT * INTO _row FROM public.vsd_documents WHERE id = _id FOR UPDATE;
  IF _row.status = 'attached' THEN RETURN public.vsd_document_payload(_row); END IF;
  IF _row.status <> 'prepared' THEN
    RAISE EXCEPTION 'VSD_DOCUMENT_ERASURE_FENCED' USING ERRCODE = '23514';
  END IF;
  IF _decl.status <> 'active' OR _decl.revision <> _row.declaration_revision THEN
    RAISE EXCEPTION 'VSD_STALE_REVISION' USING ERRCODE = '23514';
  END IF;
  _auth := public.vsd_current_authorization(_decl.declaration_kind, _decl.jurisdiction);
  IF _auth.id IS NULL OR _auth.id <> _decl.authorization_id
     OR NOT ('store_document' = ANY (_auth.permitted_operations))
     OR NOT (_row.document_type = ANY (_auth.permitted_document_types)) THEN
    RAISE EXCEPTION 'VSD_PROCESSING_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects
                  WHERE bucket_id = 'self-declaration-documents' AND name = _row.storage_path) THEN
    RAISE EXCEPTION 'VSD_OBJECT_NOT_FOUND' USING ERRCODE = '23514';
  END IF;
  FOR _old IN SELECT id FROM public.vsd_documents
               WHERE declaration_id = _decl.id AND status = 'attached' AND id <> _row.id LOOP
    PERFORM public.vsd_queue_document_erasure(_old, 'self_declaration_document_replaced');
  END LOOP;
  UPDATE public.vsd_documents SET status = 'attached', updated_at = now()
   WHERE id = _row.id RETURNING * INTO _row;
  PERFORM public.vsd_reconcile(_uid);
  RETURN public.vsd_document_payload(_row);
END $$;
REVOKE ALL ON FUNCTION public.vsd_attach_document(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_attach_document(uuid) TO authenticated;

-- Remove a document (or abandon an unfinished upload). Returns whether the
-- file is confirmed gone yet.
CREATE FUNCTION public.vsd_discard_document(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _uid uuid := public.vsd_assert_caller(); _row public.vsd_documents;
BEGIN
  SELECT * INTO _row FROM public.vsd_documents WHERE id = _id AND holder_user_id = _uid;
  IF NOT FOUND THEN
    -- Already gone is the outcome that was asked for.
    RETURN jsonb_build_object('erased', true);
  END IF;
  PERFORM 1 FROM public.vsd_declarations WHERE id = _row.declaration_id FOR UPDATE;
  PERFORM public.vsd_queue_document_erasure(_id, 'self_declaration_document_removed');
  PERFORM public.vsd_reconcile(_uid);
  RETURN jsonb_build_object('erased', NOT EXISTS (SELECT 1 FROM public.vsd_documents WHERE id = _id));
END $$;
REVOKE ALL ON FUNCTION public.vsd_discard_document(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_discard_document(uuid) TO authenticated;

-- The holder asks for (or takes back) a human review of one document. Only
-- this opens the file to an appointed reviewer.
CREATE FUNCTION public.vsd_set_document_review_request(_id uuid, _requested boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _uid uuid := public.vsd_assert_caller(); _row public.vsd_documents; _decl public.vsd_declarations;
BEGIN
  SELECT * INTO _row FROM public.vsd_documents WHERE id = _id AND holder_user_id = _uid FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'attached' THEN
    RAISE EXCEPTION 'VSD_DOCUMENT_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _decl FROM public.vsd_declarations WHERE id = _row.declaration_id;
  IF _requested IS TRUE THEN
    IF _decl.status <> 'active' OR _decl.revision <> _row.declaration_revision THEN
      RAISE EXCEPTION 'VSD_STALE_REVISION' USING ERRCODE = '23514';
    END IF;
    IF NOT public.vsd_review_available(_decl.authorization_id) THEN
      RAISE EXCEPTION 'VSD_REVIEW_UNAVAILABLE' USING ERRCODE = '42501';
    END IF;
    UPDATE public.vsd_documents SET review_requested_at = coalesce(review_requested_at, now()), updated_at = now()
     WHERE id = _id RETURNING * INTO _row;
  ELSE
    UPDATE public.vsd_documents SET review_requested_at = NULL, updated_at = now()
     WHERE id = _id RETURNING * INTO _row;
  END IF;
  RETURN public.vsd_document_payload(_row);
END $$;
REVOKE ALL ON FUNCTION public.vsd_set_document_review_request(uuid, boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_set_document_review_request(uuid, boolean) TO authenticated;

-- ── 9 · The appointed reviewer ──────────────────────────────────────────

CREATE FUNCTION public.vsd_reviewer_queue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE _uid uuid := public.vsd_assert_caller();
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'documentId', x.id, 'kind', d.declaration_kind, 'jurisdiction', d.jurisdiction,
             'documentType', x.document_type, 'issueDate', x.issue_date, 'asOfDate', d.as_of_date,
             'declarationRevision', d.revision, 'storagePath', x.storage_path,
             'mimeType', x.mime_type, 'requestedAt', x.review_requested_at)
           ORDER BY x.review_requested_at, x.id)
      FROM public.vsd_documents x
      JOIN public.vsd_declarations d ON d.id = x.declaration_id
     WHERE x.status = 'attached' AND x.review_requested_at IS NOT NULL
       AND d.status = 'active' AND d.revision = x.declaration_revision
       AND d.holder_user_id <> _uid
       AND public.vsd_is_reviewer_for(d.authorization_id)
       AND NOT EXISTS (SELECT 1 FROM public.vsd_document_reviews r WHERE r.document_id = x.id)), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.vsd_reviewer_queue() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_reviewer_queue() TO authenticated;

CREATE FUNCTION public.vsd_reviewer_record_review(_document_id uuid, _declaration_revision integer, _outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _uid uuid := public.vsd_assert_caller(); _doc public.vsd_documents; _decl public.vsd_declarations;
BEGIN
  IF _outcome IS NULL OR _outcome NOT IN ('matches_declared_details', 'not_confirmed') THEN
    RAISE EXCEPTION 'VSD_INVALID_INPUT' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO _doc FROM public.vsd_documents WHERE id = _document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'VSD_DOCUMENT_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _decl FROM public.vsd_declarations WHERE id = _doc.declaration_id FOR UPDATE;
  SELECT * INTO _doc FROM public.vsd_documents WHERE id = _document_id FOR UPDATE;
  IF NOT public.vsd_is_reviewer_for(_decl.authorization_id) OR _decl.holder_user_id = _uid
     OR _doc.status <> 'attached' OR _doc.review_requested_at IS NULL THEN
    RAISE EXCEPTION 'VSD_DOCUMENT_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  -- The decision is bound to the statement the reviewer was looking at.
  IF _decl.status <> 'active' OR _decl.revision <> _doc.declaration_revision
     OR _declaration_revision IS DISTINCT FROM _decl.revision THEN
    RAISE EXCEPTION 'VSD_STALE_REVISION' USING ERRCODE = '23514';
  END IF;
  BEGIN
    INSERT INTO public.vsd_document_reviews
      (document_id, declaration_id, declaration_revision, reviewer_user_id, outcome)
    VALUES (_doc.id, _decl.id, _decl.revision, _uid, _outcome);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'VSD_ALREADY_REVIEWED' USING ERRCODE = '23505';
  END;
END $$;
REVOKE ALL ON FUNCTION public.vsd_reviewer_record_review(uuid, integer, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_reviewer_record_review(uuid, integer, text) TO authenticated;

-- ── 10 · Retention, for a scheduler that does not exist yet ─────────────
--
-- A holder's own rows are brought up to date on every read (vsd_reconcile).
-- This does the same for holders who never come back. service_role only;
-- nothing calls it until an operator schedules it.
CREATE FUNCTION public.vsd_purge_due()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _holder uuid; _n integer := 0;
BEGIN
  FOR _holder IN
    SELECT DISTINCT d.holder_user_id FROM public.vsd_declarations d
      JOIN public.vsd_processing_authorizations a ON a.id = d.authorization_id
     WHERE d.status = 'deletion_pending' OR d.retain_until <= now() OR a.revoked_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.vsd_documents x
                    WHERE x.declaration_id = d.id AND x.status = 'erasure_pending')
  LOOP
    PERFORM public.vsd_reconcile(_holder);
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.vsd_purge_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vsd_purge_due() TO service_role;

-- ── 11 · Storage: the bucket obeys the same gate ────────────────────────

-- A write is the upload of one prepared document, by its holder, while the
-- statement it was begun for still stands and its processing is authorized.
-- The row lock is held through Storage's own transaction, so an erasure
-- request either sees the object or refuses the write.
CREATE FUNCTION public.vsd_document_storage_writable(_path text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE _doc public.vsd_documents; _decl public.vsd_declarations; _auth public.vsd_processing_authorizations;
BEGIN
  IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated'
     OR NOT public.sp_passport_session_active()
     OR split_part(_path, '/', 1) IS DISTINCT FROM auth.uid()::text THEN
    RETURN false;
  END IF;
  SELECT * INTO _doc FROM public.vsd_documents
   WHERE holder_user_id = auth.uid() AND storage_path = _path FOR UPDATE;
  IF NOT FOUND OR _doc.status <> 'prepared' THEN RETURN false; END IF;
  SELECT * INTO _decl FROM public.vsd_declarations WHERE id = _doc.declaration_id;
  IF _decl.status <> 'active' OR _decl.revision <> _doc.declaration_revision THEN RETURN false; END IF;
  _auth := public.vsd_current_authorization(_decl.declaration_kind, _decl.jurisdiction);
  RETURN _auth.id IS NOT NULL AND _auth.id = _decl.authorization_id
     AND 'store_document' = ANY (_auth.permitted_operations)
     AND _doc.document_type = ANY (_auth.permitted_document_types);
END $$;
REVOKE ALL ON FUNCTION public.vsd_document_storage_writable(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_document_storage_writable(text) TO authenticated;

-- A read is the holder's own live document, or -- for an appointed reviewer
-- only -- a document whose holder has asked for the review. A file owed to
-- erasure is readable by nobody.
CREATE FUNCTION public.vsd_document_storage_readable(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
     AND auth.role() = 'authenticated'
     AND public.sp_passport_session_active()
     AND EXISTS (
       SELECT 1 FROM public.vsd_documents x
         JOIN public.vsd_declarations d ON d.id = x.declaration_id
        WHERE x.storage_path = _path
          AND ((x.holder_user_id = auth.uid() AND x.status IN ('prepared', 'attached'))
            OR (x.status = 'attached' AND x.review_requested_at IS NOT NULL
                AND d.status = 'active' AND d.revision = x.declaration_revision
                AND x.holder_user_id <> auth.uid()
                AND public.vsd_is_reviewer_for(d.authorization_id))))
$$;
REVOKE ALL ON FUNCTION public.vsd_document_storage_readable(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vsd_document_storage_readable(text) TO authenticated;

-- A rollback leaves the bucket closed behind this policy; re-applying opens
-- it again through the policies below.
DROP POLICY IF EXISTS vsd_documents_closed ON storage.objects;

CREATE POLICY vsd_documents_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'self-declaration-documents' AND public.vsd_document_storage_writable(name));
CREATE POLICY vsd_documents_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'self-declaration-documents' AND public.vsd_document_storage_readable(name));

-- Restrictive fences, so no broader policy on storage.objects -- present or
-- future -- can open this bucket. There is no client UPDATE or DELETE at
-- all: bytes leave through the erasure queue only. anon is closed outright.
CREATE POLICY vsd_documents_insert_fence ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'self-declaration-documents' OR public.vsd_document_storage_writable(name));
CREATE POLICY vsd_documents_select_fence ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id <> 'self-declaration-documents' OR public.vsd_document_storage_readable(name));
CREATE POLICY vsd_documents_update_fence ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'self-declaration-documents')
  WITH CHECK (bucket_id <> 'self-declaration-documents');
CREATE POLICY vsd_documents_delete_fence ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'self-declaration-documents');
CREATE POLICY vsd_documents_anon_fence ON storage.objects AS RESTRICTIVE FOR ALL TO anon
  USING (bucket_id <> 'self-declaration-documents')
  WITH CHECK (bucket_id <> 'self-declaration-documents');

-- ── Postflight ──────────────────────────────────────────────────────────

DO $$
DECLARE _t text; _f record;
BEGIN
  FOREACH _t IN ARRAY ARRAY['vsd_processing_authorizations', 'vsd_declarations', 'vsd_documents',
                            'vsd_document_reviewers', 'vsd_document_reviews'] LOOP
    IF has_table_privilege('anon', 'public.' || _t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
       OR has_table_privilege('authenticated', 'public.' || _t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'VSD_POSTFLIGHT: a client role holds a privilege on %.', _t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || _t)::regclass) THEN
      RAISE EXCEPTION 'VSD_POSTFLIGHT: row level security is off on %.', _t;
    END IF;
  END LOOP;

  FOR _f IN SELECT p.oid, p.proname FROM pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'vsd\_%' LOOP
    IF has_function_privilege('anon', _f.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'VSD_POSTFLIGHT: anon can execute %.', _f.proname;
    END IF;
  END LOOP;

  -- Nothing is authorized by installing this.
  IF EXISTS (SELECT 1 FROM public.vsd_processing_authorizations) THEN
    RAISE EXCEPTION 'VSD_POSTFLIGHT: this migration must not record an authorization.';
  END IF;
  IF (SELECT public FROM storage.buckets WHERE id = 'self-declaration-documents') IS NOT FALSE THEN
    RAISE EXCEPTION 'VSD_POSTFLIGHT: the document bucket is not private.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
