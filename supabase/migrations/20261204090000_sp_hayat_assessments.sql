-- Security Passport — HAYAT assessments: what a machine checked, kept apart from
-- what the holder said and from what a person decided.
--
-- ── WHAT THIS IS ────────────────────────────────────────────────────────
--
-- HAYAT checks a credential against evidence it can fetch or verify itself (a
-- signed credential, an issuer's hosted assertion). This table records the
-- RESULT of such a check. It is a third thing, and it stays a third thing:
--
--   * sp_claims.assertion_level      -- what the holder declared / a reviewer decided
--   * sp_verification_decisions      -- a human decision on a request
--   * sp_hayat_assessments  (this)   -- a server-produced check, with its scope
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────
--
-- It does NOT touch sp_claims.assertion_level, sp_verification_decisions or any
-- disclosure payload. A HAYAT assessment is shown to the holder on the
-- credential's own page and nowhere else. Promoting a machine result into the
-- trust level a recipient sees is a change to the trust-source containment
-- (20261030090000) and is NOT made here: it needs its own reviewed migration and
-- an owner decision about which sources may do it.
--
-- ── WHO MAY WRITE ───────────────────────────────────────────────────────
--
-- Nobody with a holder's session. The only writer is sp_hayat_record_assessment,
-- EXECUTE granted to service_role alone: a holder can reach PostgREST directly,
-- so a function they could call would let them record their own "verified".
-- The function re-checks everything it is told: the claim belongs to the named
-- holder, the evidence belongs to the claim and is active, and the fields the
-- server assessed are STILL the fields on the claim (SP_HAYAT_STALE_ASSESSMENT).
--
-- ── WHAT AN ASSESSMENT IS BOUND TO ─────────────────────────────────────
--
--   the credential            claim_id
--   the submitted fields      fields_fingerprint  (sha256 over the five fields
--                             a check depends on; computed by the database)
--   the exact document        evidence_id + evidence_sha256, when a file was the
--                             evidence
--   the source and method     adapter, source_kind, source_reference
--   the time and the policy   checked_at, rule_version
--
-- HOW A CREDENTIAL ACTUALLY CHANGES: sp_save_international_credential never
-- edits in place. Every correction goes through sp_correct_claim, which creates
-- a SUCCESSOR claim (new id, self_declared) and marks the old one superseded;
-- the document stays on the old claim. So a corrected credential starts with no
-- assessment BY CONSTRUCTION -- nothing can transfer -- and the old claim's
-- assessment is invalidated the moment it is superseded.
--
-- Change any relevant field in place (a path other than that RPC), supersede
-- the claim, or replace/withdraw the document, and the assessment is
-- INVALIDATED by trigger -- kept as history, never shown as current. sp_hayat_current_assessment additionally re-derives currency at read
-- time, so a path that slipped past a trigger still cannot present a stale
-- result as current.
--
-- Nothing fetched from a source is stored: no assertion body, no recipient
-- hash. `source_reference` is the HOLDER'S OWN link; `checks` holds check names,
-- results and reason codes only. (Credly's terms forbid storing API content,
-- hashed or not; this table would satisfy them.)
--
-- Personal rows changed by this migration: 0. No backfill.

BEGIN;

CREATE TABLE public.sp_hayat_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- recording order: two checks can share a timestamp, never a sequence number
  seq bigint GENERATED ALWAYS AS IDENTITY,
  claim_id uuid NOT NULL REFERENCES public.sp_claims(id) ON DELETE CASCADE,
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- what was assessed
  claim_version_no integer NOT NULL CHECK (claim_version_no >= 1),
  fields_fingerprint text NOT NULL CHECK (fields_fingerprint ~ '^[a-f0-9]{64}$'),
  evidence_id uuid REFERENCES public.sp_evidence(id) ON DELETE SET NULL,
  evidence_sha256 text CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[a-f0-9]{64}$'),

  -- how
  adapter text NOT NULL CHECK (length(btrim(adapter)) BETWEEN 1 AND 100),
  source_kind text NOT NULL CHECK (source_kind IN ('signed_credential','hosted_open_badge')),
  source_reference text CHECK (source_reference IS NULL OR
    (source_reference LIKE 'https://%' AND length(source_reference) <= 400)),
  rule_version text NOT NULL CHECK (length(btrim(rule_version)) BETWEEN 1 AND 40),

  -- the result
  status text NOT NULL CHECK (status IN (
    'verified','source_verified_binding_missing','action_needed',
    'cannot_verify_automatically','temporarily_unavailable','mismatch',
    'expired','revoked','recheck_needed')),
  reasons text[] NOT NULL DEFAULT '{}',
  checks jsonb NOT NULL CHECK (jsonb_typeof(checks) = 'object'),
  binding_level text NOT NULL CHECK (binding_level IN ('none','email_control')),
  scope_limits text[] NOT NULL DEFAULT '{}',
  checked_at timestamptz NOT NULL,
  -- after this instant a positive result is history until it is re-checked
  current_until timestamptz,

  invalidated_at timestamptz,
  invalidated_reason text CHECK (invalidated_reason IN
    ('fields_changed','evidence_changed','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK ((invalidated_at IS NULL) = (invalidated_reason IS NULL)),
  -- a file-bound assessment names its file; a link-bound one names its link
  CHECK (source_kind <> 'signed_credential' OR evidence_sha256 IS NOT NULL),
  CHECK (source_kind <> 'hosted_open_badge' OR source_reference IS NOT NULL),
  -- an outage is not worth keeping and must never look like a result
  CHECK (status <> 'temporarily_unavailable')
);
CREATE INDEX sp_hayat_assessments_claim_idx
  ON public.sp_hayat_assessments (claim_id, checked_at DESC);
-- at most ONE current assessment per credential
CREATE UNIQUE INDEX sp_hayat_assessments_one_current
  ON public.sp_hayat_assessments (claim_id) WHERE invalidated_at IS NULL;

COMMENT ON TABLE public.sp_hayat_assessments IS
  'Server-produced HAYAT check results, bound to a claim, its assessed fields and its evidence. Separate from assertion_level and from human decisions; never disclosed; never promotes a claim. Written only by sp_hayat_record_assessment (service_role).';

ALTER TABLE public.sp_hayat_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sp_hayat_assessments FROM PUBLIC, anon, authenticated, service_role;
-- The holder reads their own. Nobody else reads any. (TRUNCATE is not covered by
-- RLS, which is why the REVOKE ALL above names every role explicitly.)
GRANT SELECT ON public.sp_hayat_assessments TO authenticated;
CREATE POLICY sp_hayat_assessments_holder_read ON public.sp_hayat_assessments
  FOR SELECT TO authenticated
  USING (holder_user_id = (SELECT auth.uid()));

-- ── The fingerprint: the five fields a check depends on ────────────────
-- Read through to_jsonb so the function keeps working in a database where a
-- later column has been rolled back; a missing key is simply NULL.
CREATE FUNCTION public.sp_hayat_fields_fingerprint(_claim public.sp_claims)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  -- Built-in sha256(bytea): no extension, so it replays on a bare PostgreSQL.
  SELECT encode(sha256(convert_to(
    concat_ws(E'\x1f',
      coalesce(j->>'credential_code',''),
      coalesce(j->>'credential_reference',''),
      coalesce(j->>'claimed_issuer_name',''),
      coalesce(j->>'issued_on',''),
      coalesce(j->>'valid_until','')),
    'UTF8')), 'hex')
  FROM (SELECT to_jsonb(_claim) AS j) s;
$$;
-- Reveals nothing the caller cannot already read: it hashes a row they hold.
REVOKE ALL ON FUNCTION public.sp_hayat_fields_fingerprint(public.sp_claims) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_hayat_fields_fingerprint(public.sp_claims)
  TO authenticated, service_role;

-- The holder's server session asks for the fingerprint of THEIR claim, so that
-- what the server assessed can be compared with what is on the claim at write
-- time. SECURITY INVOKER: RLS on sp_claims is the boundary.
CREATE FUNCTION public.sp_hayat_claim_fingerprint(_claim_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT public.sp_hayat_fields_fingerprint(c)
  FROM public.sp_claims c
  WHERE c.id = _claim_id AND c.holder_user_id = (SELECT auth.uid());
$$;
REVOKE ALL ON FUNCTION public.sp_hayat_claim_fingerprint(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_hayat_claim_fingerprint(uuid) TO authenticated;

-- ── The one writer ─────────────────────────────────────────────────────
CREATE FUNCTION public.sp_hayat_record_assessment(
  _holder_user_id uuid,
  _claim_id uuid,
  _assessed_fingerprint text,
  _evidence_id uuid,
  _adapter text,
  _source_kind text,
  _source_reference text,
  _rule_version text,
  _status text,
  _reasons text[],
  _checks jsonb,
  _binding_level text,
  _scope_limits text[],
  _checked_at timestamptz,
  _current_for_days integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _claim public.sp_claims;
  _evidence public.sp_evidence;
  _id uuid;
BEGIN
  SELECT * INTO _claim FROM public.sp_claims WHERE id = _claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_HAYAT_CLAIM_NOT_FOUND'; END IF;
  IF _claim.holder_user_id IS DISTINCT FROM _holder_user_id THEN
    RAISE EXCEPTION 'SP_HAYAT_NOT_HOLDER';
  END IF;
  -- What was assessed must still be what is on the claim.
  IF public.sp_hayat_fields_fingerprint(_claim) IS DISTINCT FROM _assessed_fingerprint THEN
    RAISE EXCEPTION 'SP_HAYAT_STALE_ASSESSMENT';
  END IF;
  IF _evidence_id IS NOT NULL THEN
    SELECT * INTO _evidence FROM public.sp_evidence WHERE id = _evidence_id;
    IF NOT FOUND OR _evidence.claim_id IS DISTINCT FROM _claim_id
       OR _evidence.holder_user_id IS DISTINCT FROM _holder_user_id THEN
      RAISE EXCEPTION 'SP_HAYAT_EVIDENCE_NOT_ON_CLAIM';
    END IF;
    IF _evidence.lifecycle_state <> 'active' THEN
      RAISE EXCEPTION 'SP_HAYAT_EVIDENCE_NOT_ACTIVE';
    END IF;
  END IF;
  IF _status = 'verified' AND _binding_level = 'none' THEN
    -- The rule already forbids this; the database refuses to store it too.
    RAISE EXCEPTION 'SP_HAYAT_VERIFIED_REQUIRES_BINDING';
  END IF;
  IF _current_for_days IS NOT NULL AND _current_for_days NOT BETWEEN 1 AND 366 THEN
    RAISE EXCEPTION 'SP_HAYAT_INVALID_CURRENCY';
  END IF;

  UPDATE public.sp_hayat_assessments
     SET invalidated_at = now(), invalidated_reason = 'superseded'
   WHERE claim_id = _claim_id AND invalidated_at IS NULL;

  INSERT INTO public.sp_hayat_assessments (
    claim_id, holder_user_id, claim_version_no, fields_fingerprint,
    evidence_id, evidence_sha256, adapter, source_kind, source_reference,
    rule_version, status, reasons, checks, binding_level, scope_limits,
    checked_at, current_until)
  VALUES (
    _claim_id, _holder_user_id, _claim.version_no, _assessed_fingerprint,
    _evidence_id, _evidence.sha256, _adapter, _source_kind, _source_reference,
    _rule_version, _status, coalesce(_reasons,'{}'), _checks, _binding_level,
    coalesce(_scope_limits,'{}'), _checked_at,
    CASE WHEN _current_for_days IS NULL THEN NULL
         ELSE _checked_at + make_interval(days => _current_for_days) END)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sp_hayat_record_assessment(
  uuid,uuid,text,uuid,text,text,text,text,text,text[],jsonb,text,text[],timestamptz,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_hayat_record_assessment(
  uuid,uuid,text,uuid,text,text,text,text,text,text[],jsonb,text,text[],timestamptz,integer)
  TO service_role;

-- ── History is append-only; only invalidation may change a row ─────────
CREATE FUNCTION public.sp_hayat_assessments_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Rows go only with their claim or their holder (ON DELETE CASCADE).
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'SP_HAYAT_ASSESSMENT_APPEND_ONLY';
  END IF;
  -- The evidence row going away (ON DELETE SET NULL) is not an edit: the
  -- assessment keeps evidence_sha256, which is what it was bound to.
  IF NEW.evidence_id IS NULL AND OLD.evidence_id IS NOT NULL
     AND (to_jsonb(NEW) - 'evidence_id') = (to_jsonb(OLD) - 'evidence_id') THEN
    RETURN NEW;
  END IF;
  IF OLD.invalidated_at IS NOT NULL THEN RAISE EXCEPTION 'SP_HAYAT_ASSESSMENT_APPEND_ONLY'; END IF;
  IF (to_jsonb(NEW) - 'invalidated_at' - 'invalidated_reason' - 'evidence_id')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'invalidated_at' - 'invalidated_reason' - 'evidence_id')
     OR NEW.invalidated_at IS NULL THEN
    RAISE EXCEPTION 'SP_HAYAT_ASSESSMENT_APPEND_ONLY';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_hayat_assessments_guard()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER sp_hayat_assessments_guard
  BEFORE UPDATE OR DELETE ON public.sp_hayat_assessments
  FOR EACH ROW EXECUTE FUNCTION public.sp_hayat_assessments_guard();

-- ── Invalidation: the claim's relevant fields changed ──────────────────
CREATE FUNCTION public.sp_hayat_invalidate_on_claim_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.sp_hayat_fields_fingerprint(NEW) IS DISTINCT FROM public.sp_hayat_fields_fingerprint(OLD)
     -- a correction supersedes the claim: what was checked is no longer the credential
     OR (NEW.lifecycle_state = 'superseded' AND OLD.lifecycle_state IS DISTINCT FROM 'superseded') THEN
    UPDATE public.sp_hayat_assessments
       SET invalidated_at = now(), invalidated_reason = 'fields_changed'
     WHERE claim_id = NEW.id AND invalidated_at IS NULL;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sp_hayat_invalidate_on_claim_change()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER sp_hayat_invalidate_on_claim_change
  AFTER UPDATE ON public.sp_claims
  FOR EACH ROW EXECUTE FUNCTION public.sp_hayat_invalidate_on_claim_change();

-- ── Invalidation: the assessed document was replaced or withdrawn ──────
CREATE FUNCTION public.sp_hayat_invalidate_on_evidence_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.lifecycle_state <> 'active' AND OLD.lifecycle_state = 'active' THEN
    UPDATE public.sp_hayat_assessments
       SET invalidated_at = now(), invalidated_reason = 'evidence_changed'
     WHERE evidence_id = NEW.id AND invalidated_at IS NULL;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sp_hayat_invalidate_on_evidence_change()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER sp_hayat_invalidate_on_evidence_change
  AFTER UPDATE ON public.sp_evidence
  FOR EACH ROW EXECUTE FUNCTION public.sp_hayat_invalidate_on_evidence_change();

-- ── What the credential page reads ─────────────────────────────────────
-- The latest assessment for a claim, with `is_current` derived at READ time:
-- not invalidated, fingerprint still matching, document still active, and not
-- past its currency window. Anything else is history and is labelled as such.
-- SECURITY INVOKER: the holder's own RLS decides which rows exist at all.
CREATE FUNCTION public.sp_hayat_current_assessment(_claim_id uuid)
RETURNS TABLE (
  id uuid, status text, reasons text[], checks jsonb, binding_level text,
  scope_limits text[], adapter text, source_kind text, source_reference text,
  rule_version text, checked_at timestamptz, current_until timestamptz,
  is_current boolean, not_current_reason text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT a.id, a.status, a.reasons, a.checks, a.binding_level, a.scope_limits,
         a.adapter, a.source_kind, a.source_reference, a.rule_version,
         a.checked_at, a.current_until,
         (s.why IS NULL) AS is_current, s.why AS not_current_reason
  FROM public.sp_hayat_assessments a
  JOIN public.sp_claims c ON c.id = a.claim_id
  LEFT JOIN public.sp_evidence e ON e.id = a.evidence_id
  CROSS JOIN LATERAL (SELECT CASE
      WHEN a.invalidated_at IS NOT NULL THEN a.invalidated_reason
      WHEN c.lifecycle_state = 'superseded' THEN 'fields_changed'
      WHEN public.sp_hayat_fields_fingerprint(c) <> a.fields_fingerprint THEN 'fields_changed'
      WHEN a.evidence_sha256 IS NOT NULL
           AND (e.id IS NULL OR e.lifecycle_state <> 'active' OR e.sha256 IS DISTINCT FROM a.evidence_sha256)
        THEN 'evidence_changed'
      WHEN a.current_until IS NOT NULL AND a.current_until <= now() THEN 'recheck_needed'
      ELSE NULL END AS why) s
  WHERE a.claim_id = _claim_id
  -- The row that has not been invalidated is THE row (there is at most one);
  -- only when there is none does the most recent history row stand in for it.
  ORDER BY (a.invalidated_at IS NULL) DESC, a.seq DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.sp_hayat_current_assessment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_hayat_current_assessment(uuid) TO authenticated;

COMMIT;
