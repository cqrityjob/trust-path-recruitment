-- =============================================================================
-- TRUST Evidence Report — PR-R1: REPRODUCIBLE PROVENANCE
--
-- "Från evidens till en bättre intervju."
--
-- A released report must be reproducible and traceable: a second person must
-- be able to answer, from frozen data alone, "exactly which inputs, versions,
-- mappings, rubric decisions and rules created this report?". PR-R0
-- characterised what the chain freezes today (docs/assessment/architecture/
-- trust-evidence-report-r0-characterisation.md §10) and found that the
-- included evidence rows, the excluded ones and why, the per-item
-- contribution and confidence, the item / option-key / rubric / mapping
-- versions, the threshold VALUES, the guide-prompt rows and the denominator
-- behind every area signal were not frozen anywhere, and that nothing hashed
-- the result. This migration freezes all of it, privately, at release.
--
-- ── WHAT THIS FILE DOES (EXPAND only) ──────────────────────────────────────
--
--   1. scp_report_manifest_hash(jsonb)          the canonical hash rule:
--      SHA-256 over the canonical jsonb text of a body. IMMUTABLE, so the
--      table below can refuse a row whose hash does not match its body.
--
--   2. scp_report_computation_manifests         PRIVATE, IMMUTABLE. One row
--      per release (both audience snapshots point at the same row, because
--      there is one calculation). RLS on with NO policy; no privilege for
--      PUBLIC, anon or authenticated; service_role only. Written inside
--      scp_release_attempt_report in the same transaction as the snapshots.
--
--   3. scp_report_snapshots.manifest_id / canonical_sha256   nullable link
--      from the frozen document to its manifest. Historical snapshots keep
--      NULL: they are LEGACY PROVENANCE and nothing here invents data that
--      was never captured.
--
--   4. scp_report_manifest_computation(attempt, calculated_at, ...)   builds
--      the computation part of the body from the ledger. NOT a second engine:
--      every area signal, maturity level and evidence state in it comes from
--      the existing scp_attempt_assessment_signal / scp_attempt_maturity /
--      scp_attempt_evidence_state / scp_attempt_self_report_pattern, and the
--      builder RAISES if its own weighted sum, denominator or spread disagree
--      with them. It merely records what those routines were given.
--
--   5. scp_release_attempt_report                 gains ONE calculated_at
--      (the transaction's now(), passed to every maturity call instead of a
--      fresh now()), collects the guide-prompt and follow-up-prompt row ids it
--      already selects, builds the manifest and inserts it before the two
--      snapshots. Payload, brief, context, safety_flags and derivation_input
--      are byte-identical to 20260830093000: no scoring, threshold, question,
--      competency, maturity or report-content change of any kind.
--
--   6. scp_verify_report_manifest(manifest_id)    recomputes the computation
--      part from the live ledger with the FROZEN calculated_at and reports
--      integrity (stored hash = hash of stored body) and reproducibility
--      (stored computation = recomputed computation). service_role only.
--
-- ── WHAT THIS FILE DOES NOT DO ────────────────────────────────────────────
--
-- It does not touch scp_participant_report, scp_employer_report,
-- scp_audience_brief or scp_report_snapshot_readable: neither audience
-- document gains a key, and neither can reach the manifest. It grants
-- nothing to any audience role. It rewrites no stored row. It does not
-- backfill historical snapshots. mean/spread stay in the stored brief
-- exactly as before (the read path strips them, R2A-1). No self-report
-- interpretation label is introduced: c07/c19 remain methodologically open
-- by Product Owner decision and the manifest records them as self_report
-- rows, nothing more.
--
-- Rollback: supabase/rollback/20261027090000_scp_trust_evidence_report_r1_provenance_rollback.sql
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- §0  Refuse unless the ground this stands on is there
-- ═══════════════════════════════════════════════════════════════════════════

DO $pre$
BEGIN
  -- The R2A chain (EXPAND, continuity, CONTRACT) must be applied: the
  -- manifest is private only if the base row already is.
  IF has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_R1_PRECONDITION: authenticated can still SELECT scp_report_snapshots -- apply 20261026090000 (R2A-3 CONTRACT) first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report' AND p.prosecdef
                    AND p.prosrc LIKE '%LEFT JOIN public.scp_report_versions%') THEN
    RAISE EXCEPTION 'SCP_R1_PRECONDITION: scp_employer_report is not the #182 continuity definition';
  END IF;
  -- The release function must be the 20260830093000 body this file extends.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_release_attempt_report' AND p.prosecdef
                    AND p.prosrc LIKE '%_observed_scope%'
                    AND p.prosrc LIKE '%scp_interview_guide_prompts%'
                    AND p.prosrc NOT LIKE '%scp_report_computation_manifests%') THEN
    RAISE EXCEPTION 'SCP_R1_PRECONDITION: scp_release_attempt_report is not the expected pre-R1 definition';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'scp_report_computation_manifests') THEN
    RAISE EXCEPTION 'SCP_R1_PRECONDITION: scp_report_computation_manifests already exists';
  END IF;
END
$pre$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  The canonical hash rule
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_report_manifest_hash(_body jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  -- Canonical form = PostgreSQL's jsonb text serialisation: object keys in
  -- jsonb's canonical order, duplicate keys collapsed, whitespace normalised,
  -- numerics at the scale they were written, array order preserved. Two
  -- bodies that are equal as jsonb therefore hash identically however their
  -- keys were typed. Encoded as UTF-8 explicitly so the session encoding
  -- cannot change the digest. Hex, lower-case, 64 characters.
  SELECT encode(sha256(convert_to(_body::text, 'UTF8')), 'hex');
$$;

COMMENT ON FUNCTION public.scp_report_manifest_hash(jsonb) IS
  'SHA-256 (hex) over the canonical jsonb text of a computation-manifest '
  'body. The one hash rule: the release function stores it, the table CHECK '
  'refuses a row that does not satisfy it, and the verifier recomputes it.';

REVOKE ALL ON FUNCTION public.scp_report_manifest_hash(jsonb) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §2  The private, immutable manifest
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.scp_report_computation_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity: one release, two snapshots, one calculation.
  attempt_id uuid NOT NULL UNIQUE
    REFERENCES public.scp_attempts(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL
    REFERENCES public.scp_subjects(id) ON DELETE RESTRICT,
  issuer_organization_id uuid
    REFERENCES public.employers(id) ON DELETE RESTRICT,
  -- DEFERRABLE: the manifest is inserted BEFORE the snapshots (their
  -- manifest_id references it), with ids generated up front.
  participant_snapshot_id uuid NOT NULL,
  employer_snapshot_id uuid NOT NULL,
  participant_report_version_id uuid NOT NULL
    REFERENCES public.scp_report_versions(id) ON DELETE RESTRICT,
  employer_report_version_id uuid NOT NULL
    REFERENCES public.scp_report_versions(id) ON DELETE RESTRICT,

  -- Time: the single instant every maturity / signal call used.
  calculated_at timestamptz NOT NULL,

  -- Versions, as columns so they can be indexed and read without the body.
  calculation_schema_version text NOT NULL,
  scoring_model_version      text NOT NULL,
  signal_model_version       text NOT NULL,
  threshold_version          text NOT NULL,
  evidence_state_version     text NOT NULL,
  evidence_scope_version     text NOT NULL,
  brief_version              text NOT NULL,
  competency_mapping_version text NOT NULL,

  -- Who released. A role and a pseudonymous account, never a name.
  released_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  released_by_role text NOT NULL CHECK (released_by_role IN ('owner', 'admin')),

  -- The frozen body and its hash. Identity and time live in the columns
  -- above, NOT in the body: the hash is over frozen inputs, versions and
  -- computation only.
  body jsonb NOT NULL,
  canonical_sha256 text NOT NULL CHECK (canonical_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_manifest_participant_snapshot_fkey
    FOREIGN KEY (participant_snapshot_id) REFERENCES public.scp_report_snapshots(id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT scp_manifest_employer_snapshot_fkey
    FOREIGN KEY (employer_snapshot_id) REFERENCES public.scp_report_snapshots(id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT scp_manifest_participant_snapshot_key UNIQUE (participant_snapshot_id),
  CONSTRAINT scp_manifest_employer_snapshot_key UNIQUE (employer_snapshot_id),
  CONSTRAINT scp_manifest_hash_matches_body
    CHECK (canonical_sha256 = public.scp_report_manifest_hash(body)),
  CONSTRAINT scp_manifest_snapshots_differ
    CHECK (participant_snapshot_id <> employer_snapshot_id),
  CONSTRAINT scp_manifest_body_is_object
    CHECK (jsonb_typeof(body) = 'object' AND body ? 'computation' AND body ? 'versions')
);

COMMENT ON TABLE public.scp_report_computation_manifests IS
  'PRIVATE, IMMUTABLE. The frozen provenance of one released report: every '
  'evidence row counted and every one not counted and why, per-item '
  'contribution and confidence, item / option-key / rubric / mapping / '
  'template / prompt versions, the threshold rows actually used, per-area '
  'weighted sum, denominator, spread, rule and resulting signal, and a '
  'canonical SHA-256 over all of it. Written by scp_release_attempt_report '
  'in the same transaction as the snapshots. No participant policy, no '
  'employer policy, no audience privilege: an authorised traceability '
  'projection (a later PR) is the only way any of this ever reaches a '
  'person, and never as this row.';

CREATE INDEX IF NOT EXISTS scp_report_computation_manifests_org_idx
  ON public.scp_report_computation_manifests (issuer_organization_id, calculated_at DESC);

-- Immutable once written. A correction is a new release of a new attempt,
-- never an edit of provenance somebody may already have relied on. Trigger,
-- not policy, so it binds the table owner and service_role too.
CREATE OR REPLACE FUNCTION public.scp_guard_manifest_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    'SCP_MANIFEST_IMMUTABLE: a computation manifest cannot be % -- it is the '
    'frozen provenance of a released report.', lower(TG_OP)
    USING ERRCODE = 'check_violation';
END; $$;

DROP TRIGGER IF EXISTS scp_report_computation_manifests_immutable
  ON public.scp_report_computation_manifests;
CREATE TRIGGER scp_report_computation_manifests_immutable
  BEFORE UPDATE OR DELETE ON public.scp_report_computation_manifests
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_manifest_immutable();

ALTER TABLE public.scp_report_computation_manifests ENABLE ROW LEVEL SECURITY;
-- No policy, deliberately. With RLS on and no policy, even a role that held
-- a privilege would read zero rows; and no audience role holds one.
REVOKE ALL ON public.scp_report_computation_manifests FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.scp_report_computation_manifests TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- §3  The link from the frozen document to its manifest
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_report_snapshots
  ADD COLUMN IF NOT EXISTS manifest_id uuid
    REFERENCES public.scp_report_computation_manifests(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS canonical_sha256 text
    CHECK (canonical_sha256 IS NULL OR canonical_sha256 ~ '^[0-9a-f]{64}$');

ALTER TABLE public.scp_report_snapshots
  DROP CONSTRAINT IF EXISTS scp_report_snapshots_manifest_pair;
ALTER TABLE public.scp_report_snapshots
  ADD CONSTRAINT scp_report_snapshots_manifest_pair
    CHECK ((manifest_id IS NULL) = (canonical_sha256 IS NULL));

CREATE INDEX IF NOT EXISTS scp_report_snapshots_manifest_idx
  ON public.scp_report_snapshots (manifest_id) WHERE manifest_id IS NOT NULL;

COMMENT ON COLUMN public.scp_report_snapshots.manifest_id IS
  'The private computation manifest this document was derived from. NULL on '
  'every snapshot released before PR-R1: legacy provenance, never backfilled.';
COMMENT ON COLUMN public.scp_report_snapshots.canonical_sha256 IS
  'The manifest''s canonical hash, copied at release so the document names '
  'its provenance without a join. NULL together with manifest_id.';

-- The new columns are covered by the R2A-3 posture: authenticated and anon
-- hold no privilege on this table at all, so there is nothing to revoke.

-- ═══════════════════════════════════════════════════════════════════════════
-- §4  The computation part of the body
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_report_manifest_computation(
  _attempt_id uuid,
  _calculated_at timestamptz,
  _threshold_version text DEFAULT 'v1',
  _signal_version text DEFAULT 'ras-v1')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
-- VOLATILE by declaration only because it stages its working set in
-- transaction-scoped temp tables; it writes nothing durable.
DECLARE
  _a public.scp_attempts%ROWTYPE;
  _thresholds jsonb; _sources jsonb; _map jsonb; _map_version text;
  _evidence jsonb; _reviews jsonb; _areas jsonb; _self jsonb; _rubrics jsonb;
  _obs int; _selfn int;
  _rule constant text :=
    'ras-v1: n<3 -> limited; spread >= 0.600 -> mixed; mean >= 0.800 -> strong; '
    'mean >= 0.620 -> consistent; else developing. n, mean and spread are taken '
    'over the INCLUDED evidence rows of the area (counting source type, not '
    'superseded, source is a response of this attempt): mean = '
    'sum(contribution*confidence)/sum(confidence), spread = max(contribution)-'
    'min(contribution). Maturity: the frozen threshold rows of the named '
    'version, over the same rows within validity at calculated_at, best row per '
    '(source_type, source_ref, behaviour) by provenance precedence '
    '(human_review > ai_scoring_run > deterministic); safety cap: '
    'consistent_evidence/strong_evidence -> developing_evidence when any '
    'counted row carries a finding. des-v2 evidence state: a high/critical '
    'finding or an open safety review -> critical_follow_up; a disputed '
    '(adjusted/overturned) review -> follow_up; strong_evidence -> '
    'strongly_shown; consistent_evidence -> shown; no_evidence -> '
    'not_yet_shown; else follow_up. Self-report (ras-v1, per facet): '
    'n = 0 -> not_described; mean >= 0.750 -> consistently_described; '
    'mean >= 0.550 -> mostly_described; else rarely_described; consistency '
    'varied when n >= 2 and spread >= 0.500. Self-report never enters an area.';
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _a.id IS NULL THEN
    RAISE EXCEPTION 'SCP_MANIFEST_NO_ATTEMPT: no attempt %', _attempt_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The responses of this attempt, in form order, with what the item was.
  CREATE TEMP TABLE _mf_resp ON COMMIT DROP AS
  SELECT r.id AS response_id, r.item_version_id, r.selected_option_id,
         r.best_option_id, r.worst_option_id,
         fi.display_order, fi.block_key,
         iv.item_id, i.slug AS item_slug, iv.version_number AS item_version_number,
         iv.item_format, iv.evidence_source_type, iv.is_safety_critical,
         iv.requires_human_review, iv.primary_behaviour_id, iv.facet_id
    FROM public.scp_candidate_responses r
    JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
    JOIN public.scp_items i ON i.id = iv.item_id
    LEFT JOIN public.scp_form_items fi
           ON fi.item_version_id = r.item_version_id AND fi.form_id = _a.form_id
   WHERE r.attempt_id = _attempt_id;

  -- The latest review per response (the workflow opens one; this is defensive).
  CREATE TEMP TABLE _mf_rev ON COMMIT DROP AS
  SELECT DISTINCT ON (hr.response_id)
         hr.response_id, hr.id AS review_id, hr.trigger_reason, hr.review_status,
         hr.outcome, hr.completed_at, hr.reviewed_under_break_glass,
         (SELECT d.rubric_version_id
            FROM public.scp_review_rubric_scores s
            JOIN public.scp_rubric_dimensions d ON d.id = s.rubric_dimension_id
           WHERE s.review_id = hr.id LIMIT 1) AS rubric_version_id,
         (SELECT jsonb_object_agg(d.dimension_key, s.level ORDER BY d.dimension_key)
            FROM public.scp_review_rubric_scores s
            JOIN public.scp_rubric_dimensions d ON d.id = s.rubric_dimension_id
           WHERE s.review_id = hr.id) AS rubric_levels
    FROM public.scp_human_reviews hr
   WHERE hr.response_id IN (SELECT response_id FROM _mf_resp)
   ORDER BY hr.response_id, hr.opened_at DESC, hr.id DESC;

  -- Every evidence row that a response of this attempt produced, classified.
  -- `included` is the ras-v1 signal predicate (counting source, not
  -- superseded); `counted_for_maturity` additionally honours valid_until at
  -- calculated_at, as scp_attempt_maturity does.
  CREATE TEMP TABLE _mf_ev ON COMMIT DROP AS
  SELECT e.id AS evidence_id, e.source_ref AS response_id, e.behaviour_version_id,
         e.source_type, st.counts_toward_maturity, e.provenance_type, e.provenance_ref,
         e.scoring_model_version, e.contribution, e.confidence, e.derivation_basis,
         e.is_safety_critical, e.safety_finding, e.safety_severity,
         e.context_type, e.context_ref, e.observed_at, e.valid_until,
         e.superseded_by, e.review_status AS evidence_review_status,
         bcm.competency_version_id, c.code AS competency_code,
         (st.counts_toward_maturity AND e.superseded_by IS NULL) AS included,
         (st.counts_toward_maturity AND e.superseded_by IS NULL
            AND (e.valid_until IS NULL OR e.valid_until > _calculated_at)) AS counted_for_maturity
    FROM public.scp_competency_evidence e
    JOIN public.scp_evidence_source_types st ON st.code = e.source_type
    LEFT JOIN public.scp_behaviour_competency_map bcm
           ON bcm.behaviour_version_id = e.behaviour_version_id AND bcm.is_primary
    LEFT JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
    LEFT JOIN public.scp_competencies c ON c.id = cv.competency_id
   WHERE e.source_ref IN (SELECT response_id FROM _mf_resp);

  -- 4.1 The threshold ROWS actually used (not only the version string).
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'level', t.level,
           'min_mean_contribution', t.min_mean_contribution,
           'min_observations', t.min_observations,
           'min_contexts', t.min_contexts,
           'min_source_types', t.min_source_types,
           'max_age_days', t.max_age_days)
         ORDER BY t.min_mean_contribution, t.min_observations), '[]'::jsonb)
    INTO _thresholds
    FROM public.scp_maturity_thresholds t
   WHERE t.threshold_version = _threshold_version AND t.is_active;

  -- 4.2 The registry rule for every source type present: this is what makes
  -- self-report non-counting, and it is frozen here so a registry change
  -- later cannot silently re-explain a released report.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'code', st.code, 'counts_toward_maturity', st.counts_toward_maturity)
         ORDER BY st.code), '[]'::jsonb)
    INTO _sources
    FROM public.scp_evidence_source_types st
   WHERE st.code IN (SELECT DISTINCT source_type FROM _mf_ev);

  -- 4.3 The competency mapping rows this attempt's behaviours resolve
  -- through, and a canonical hash of them as the mapping version (the map
  -- table carries no version column; the hash is the version).
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'behaviour_version_id', bcm.behaviour_version_id,
           'competency_version_id', bcm.competency_version_id,
           'competency_code', c.code,
           'competency_version', cv.version_number,
           'weight', bcm.weight,
           'is_primary', bcm.is_primary)
         ORDER BY bcm.behaviour_version_id, bcm.competency_version_id), '[]'::jsonb)
    INTO _map
    FROM public.scp_behaviour_competency_map bcm
    JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
    JOIN public.scp_competencies c ON c.id = cv.competency_id
   WHERE bcm.behaviour_version_id IN (
           SELECT primary_behaviour_id FROM _mf_resp WHERE primary_behaviour_id IS NOT NULL
           UNION SELECT behaviour_version_id FROM _mf_ev);
  _map_version := 'bcm-sha256:' || public.scp_report_manifest_hash(_map);

  -- 4.4 Every response, with its evidence row or the reason it has none.
  -- Option keys and scores are answer-key material: this body is private,
  -- and that is exactly why it can hold them.
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'display_order')::int NULLS LAST,
                                      x->>'response_id', x->>'evidence_id'), '[]'::jsonb)
    INTO _evidence
    FROM (
      SELECT jsonb_build_object(
        'display_order',        r.display_order,
        'block_key',            r.block_key,
        'response_id',          r.response_id,
        'item_id',              r.item_id,
        'item_slug',            r.item_slug,
        'item_version_id',      r.item_version_id,
        'item_version',         r.item_version_number,
        'item_format',          r.item_format,
        'evidence_source_type', r.evidence_source_type,
        'option_key_version',   r.item_version_id,
        'selected_option_key',  so.option_key,
        'selected_score_value', so.score_value,
        'best_option_key',      bo.option_key,
        'worst_option_key',     wo.option_key,
        'item_max_score',       (SELECT max(o.score_value) FROM public.scp_item_options o
                                  WHERE o.item_version_id = r.item_version_id),
        'is_safety_critical',   r.is_safety_critical,
        'behaviour_version_id', coalesce(e.behaviour_version_id, r.primary_behaviour_id),
        'competency_code',      coalesce(e.competency_code, rc.code),
        'competency_version_id', coalesce(e.competency_version_id, rcv.id),
        'competency_mapping_version', _map_version,
        'evidence_id',          e.evidence_id,
        'source_type',          e.source_type,
        'classification',       CASE
                                  WHEN e.evidence_id IS NULL THEN 'none'
                                  WHEN e.counts_toward_maturity THEN 'observed'
                                  WHEN e.source_type = 'self_report' THEN 'self_report'
                                  ELSE 'non_counting' END,
        'provenance_type',      e.provenance_type,
        'provenance_ref',       e.provenance_ref,
        'scoring_model_version', e.scoring_model_version,
        'contribution',         e.contribution,
        'confidence',           e.confidence,
        'derivation_basis',     e.derivation_basis,
        'rubric_version_id',    coalesce((e.derivation_basis->>'rubric_version_id')::uuid, v.rubric_version_id),
        'safety_finding',       e.safety_finding,
        'safety_severity',      e.safety_severity,
        'context_type',         e.context_type,
        'context_ref',          e.context_ref,
        'observed_at',          to_jsonb(e.observed_at AT TIME ZONE 'UTC'),
        'valid_until',          to_jsonb(e.valid_until AT TIME ZONE 'UTC'),
        'superseded_by',        e.superseded_by,
        'review_id',            v.review_id,
        'review_status',        v.review_status,
        'review_outcome',       v.outcome,
        'included',             coalesce(e.included, false),
        'counted_for_maturity', coalesce(e.counted_for_maturity, false),
        'exclusion_reason',     CASE
          WHEN coalesce(e.included, false)                         THEN NULL
          WHEN e.evidence_id IS NULL
               AND v.review_status IN ('pending', 'in_review')      THEN 'review_pending'
          WHEN e.evidence_id IS NULL
               AND v.outcome IN ('adjusted', 'overturned')          THEN 'review_disputed'
          WHEN e.evidence_id IS NULL                                THEN 'no_evidence_row'
          WHEN e.superseded_by IS NOT NULL                          THEN 'superseded'
          WHEN e.source_type = 'self_report'                        THEN 'self_report_non_counting'
          ELSE                                                           'training_non_counting' END
      ) AS x
      FROM _mf_resp r
      LEFT JOIN _mf_ev e ON e.response_id = r.response_id
      LEFT JOIN _mf_rev v ON v.response_id = r.response_id
      LEFT JOIN public.scp_item_options so ON so.id = r.selected_option_id
      LEFT JOIN public.scp_item_options bo ON bo.id = r.best_option_id
      LEFT JOIN public.scp_item_options wo ON wo.id = r.worst_option_id
      LEFT JOIN public.scp_behaviour_competency_map rbcm
             ON rbcm.behaviour_version_id = r.primary_behaviour_id AND rbcm.is_primary
      LEFT JOIN public.scp_competency_versions rcv ON rcv.id = rbcm.competency_version_id
      LEFT JOIN public.scp_competencies rc ON rc.id = rcv.competency_id
    ) q;

  -- 4.5 The human reviews: state, outcome, rubric version and levels. The
  -- reviewer's rationale stays on the review row; it is not provenance of a
  -- number and it is not copied anywhere.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'review_id',        v.review_id,
           'response_id',      v.response_id,
           'item_version_id',  r.item_version_id,
           'trigger_reason',   v.trigger_reason,
           'review_status',    v.review_status,
           'outcome',          v.outcome,
           'rubric_version_id', v.rubric_version_id,
           'rubric_levels',    v.rubric_levels,
           'completed_at',     to_jsonb(v.completed_at AT TIME ZONE 'UTC'),
           'reviewed_under_break_glass', v.reviewed_under_break_glass)
         ORDER BY r.display_order NULLS LAST, v.review_id), '[]'::jsonb)
    INTO _reviews
    FROM _mf_rev v JOIN _mf_resp r ON r.response_id = v.response_id;

  SELECT coalesce(jsonb_agg(DISTINCT to_jsonb(rv)), '[]'::jsonb)
    INTO _rubrics
    FROM (SELECT v.rubric_version_id AS rv FROM _mf_rev v WHERE v.rubric_version_id IS NOT NULL
          UNION
          SELECT (e.derivation_basis->>'rubric_version_id')::uuid FROM _mf_ev e
           WHERE e.derivation_basis ? 'rubric_version_id') x;

  -- 4.6 Per area: the numbers the signal was derived from, and the signal,
  -- maturity and state the existing routines produce from them. The area set
  -- is the release function's: competencies with observed evidence, plus
  -- competencies a disputed review reached and deliberately left no row for.
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'competency_code'), '[]'::jsonb)
    INTO _areas
    FROM (
      SELECT jsonb_build_object(
        'competency_code',       c.code,
        'competency_version_id', cv.id,
        'competency_version',    cv.version_number,
        'item_count',            n.item_count,
        'weighted_sum',          n.weighted_sum,
        'denominator',           n.denominator,
        'mean',                  n.mean,
        'spread',                n.spread,
        'context_count',         n.context_count,
        'source_type_count',     n.source_type_count,
        'safety_finding_present', n.safety_finding_present,
        'disputed_review_present', EXISTS (
          SELECT 1 FROM _mf_rev v JOIN _mf_resp r ON r.response_id = v.response_id
           JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = r.primary_behaviour_id
          WHERE m.competency_version_id = cv.id
            AND v.review_status = 'completed' AND v.outcome IN ('adjusted', 'overturned')),
        'evidence_ids',          n.evidence_ids,
        'classification_rule',   _rule,
        'signal_model_version',  _signal_version,
        'threshold_version',     _threshold_version,
        'final_area_signal',     sig.signal,
        'maturity_level',        mat.level,
        'evidence_state',        public.scp_attempt_evidence_state(_attempt_id, cv.id, mat.level)
      ) AS x
      FROM (
        SELECT DISTINCT bcm.competency_version_id AS cvid
          FROM _mf_ev e
          JOIN public.scp_behaviour_competency_map bcm
            ON bcm.behaviour_version_id = e.behaviour_version_id
         WHERE e.included
        UNION
        SELECT DISTINCT bcm.competency_version_id
          FROM _mf_rev v
          JOIN _mf_resp r ON r.response_id = v.response_id
          JOIN public.scp_behaviour_competency_map bcm
            ON bcm.behaviour_version_id = r.primary_behaviour_id
         WHERE v.review_status = 'completed' AND v.outcome IN ('adjusted', 'overturned')
      ) scope
      JOIN public.scp_competency_versions cv ON cv.id = scope.cvid
      JOIN public.scp_competencies c ON c.id = cv.competency_id
      CROSS JOIN LATERAL (
        -- The ras-v1 predicate, verbatim: every map row of the behaviour.
        SELECT count(e.evidence_id)::int AS item_count,
               coalesce(round(sum(e.contribution * e.confidence), 6), 0) AS weighted_sum,
               coalesce(round(sum(e.confidence), 6), 0) AS denominator,
               coalesce(round(sum(e.contribution * e.confidence) / nullif(sum(e.confidence), 0), 3), 0) AS mean,
               coalesce(round(max(e.contribution) - min(e.contribution), 3), 0) AS spread,
               count(DISTINCT coalesce(e.context_type || ':' || coalesce(e.context_ref::text, ''),
                                       e.behaviour_version_id::text))::int AS context_count,
               count(DISTINCT e.source_type)::int AS source_type_count,
               coalesce(bool_or(e.safety_finding IN ('low','medium','high','critical')), false) AS safety_finding_present,
               coalesce(jsonb_agg(e.evidence_id ORDER BY e.evidence_id) FILTER (WHERE e.evidence_id IS NOT NULL), '[]'::jsonb) AS evidence_ids
          FROM _mf_ev e
          JOIN public.scp_behaviour_competency_map bcm
            ON bcm.behaviour_version_id = e.behaviour_version_id
         WHERE bcm.competency_version_id = cv.id AND e.included
      ) n
      CROSS JOIN LATERAL public.scp_attempt_assessment_signal(_attempt_id, cv.id, _signal_version) sig
      CROSS JOIN LATERAL (
        SELECT public.scp_attempt_maturity(_attempt_id, cv.id, _threshold_version, _calculated_at) AS level
      ) mat
    ) q;

  -- The self-verifying step: what this manifest records as the inputs must
  -- be exactly what the signal routine computed from. If a future change to
  -- either predicate ever made them disagree, release fails here rather than
  -- freezing a provenance that does not explain its own report.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_areas) a
    CROSS JOIN LATERAL public.scp_attempt_assessment_signal(
      _attempt_id, (a->>'competency_version_id')::uuid, _signal_version) sig
    WHERE (a->>'item_count')::int <> sig.observations
       OR (a->>'mean')::numeric <> sig.mean
       OR (a->>'spread')::numeric <> sig.spread
       OR (a->>'final_area_signal') <> sig.signal) THEN
    RAISE EXCEPTION 'SCP_MANIFEST_DERIVATION_MISMATCH: the manifest''s per-area inputs '
      'disagree with scp_attempt_assessment_signal for attempt %', _attempt_id
      USING ERRCODE = 'data_exception';
  END IF;

  -- 4.7 Self-report, per facet, kept apart: what the person SAID. Recorded
  -- with its own numbers so the pattern is reproducible, and never merged
  -- into an area. classification is 'self_report'; no interpretation label
  -- is asserted here (c07/c19 stay methodologically open by decision).
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'facet_slug'), '[]'::jsonb)
    INTO _self
    FROM (
      SELECT jsonb_build_object(
        'facet_id',        f.id,
        'facet_slug',      f.slug,
        'competency_code', c.code,
        'classification',  'self_report',
        'item_count',      n.item_count,
        'weighted_sum',    n.weighted_sum,
        'denominator',     n.denominator,
        'mean',            n.mean,
        'spread',          n.spread,
        'evidence_ids',    n.evidence_ids,
        'item_slugs',      n.item_slugs,
        'signal_model_version', _signal_version,
        'pattern',         p.pattern,
        'consistency',     p.consistency
      ) AS x
      FROM (SELECT DISTINCT r.facet_id
              FROM _mf_ev e JOIN _mf_resp r ON r.response_id = e.response_id
             WHERE e.source_type = 'self_report' AND e.superseded_by IS NULL
               AND r.facet_id IS NOT NULL) src
      JOIN public.scp_competency_facets f ON f.id = src.facet_id
      JOIN public.scp_competencies c ON c.id = f.competency_id
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS item_count,
               coalesce(round(sum(e.contribution * e.confidence), 6), 0) AS weighted_sum,
               coalesce(round(sum(e.confidence), 6), 0) AS denominator,
               coalesce(round(sum(e.contribution * e.confidence) / nullif(sum(e.confidence), 0), 3), 0) AS mean,
               coalesce(round(max(e.contribution) - min(e.contribution), 3), 0) AS spread,
               coalesce(jsonb_agg(e.evidence_id ORDER BY e.evidence_id), '[]'::jsonb) AS evidence_ids,
               coalesce(jsonb_agg(r.item_slug ORDER BY r.item_slug), '[]'::jsonb) AS item_slugs
          FROM _mf_ev e JOIN _mf_resp r ON r.response_id = e.response_id
         WHERE e.source_type = 'self_report' AND e.superseded_by IS NULL
           AND r.facet_id = f.id
      ) n
      CROSS JOIN LATERAL public.scp_attempt_self_report_pattern(_attempt_id, f.id, _signal_version) p
    ) q;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_self) s
    CROSS JOIN LATERAL public.scp_attempt_self_report_pattern(
      _attempt_id, (s->>'facet_id')::uuid, _signal_version) p
    WHERE (s->>'item_count')::int <> p.items
       OR (s->>'mean')::numeric <> p.mean
       OR (s->>'spread')::numeric <> p.spread) THEN
    RAISE EXCEPTION 'SCP_MANIFEST_DERIVATION_MISMATCH: the manifest''s self-report inputs '
      'disagree with scp_attempt_self_report_pattern for attempt %', _attempt_id
      USING ERRCODE = 'data_exception';
  END IF;

  SELECT count(*) FILTER (WHERE included), count(*) FILTER (WHERE source_type = 'self_report' AND superseded_by IS NULL)
    INTO _obs, _selfn FROM _mf_ev;

  DROP TABLE IF EXISTS _mf_resp;
  DROP TABLE IF EXISTS _mf_rev;
  DROP TABLE IF EXISTS _mf_ev;

  RETURN jsonb_build_object(
    'classification_rule',     _rule,
    'thresholds',              _thresholds,
    'source_types',            _sources,
    'competency_mapping',      jsonb_build_object('version', _map_version, 'rows', _map),
    'rubric_versions',         _rubrics,
    'evidence',                _evidence,
    'reviews',                 _reviews,
    'areas',                   _areas,
    'self_report_areas',       _self,
    'included_evidence_count', _obs,
    'self_report_evidence_count', _selfn);
END;
$function$;

COMMENT ON FUNCTION public.scp_report_manifest_computation(uuid, timestamptz, text, text) IS
  'The computation part of a report''s provenance: every response of the '
  'attempt with its evidence row or its exclusion reason, the threshold rows, '
  'the mapping rows and their hash, the reviews, and per area the weighted '
  'sum, denominator, spread and the signal / maturity / state the existing '
  'routines produce from them. Not a second engine: it calls those routines '
  'and refuses to return if its own inputs disagree with them.';

REVOKE ALL ON FUNCTION public.scp_report_manifest_computation(uuid, timestamptz, text, text)
  FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §5  The release function: same report, now with its provenance frozen
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Diff against 20260830093000, in full:
--   * _calculated_at := now() once; passed to both scp_attempt_maturity calls
--     (which previously each evaluated now() -- the same instant inside one
--     transaction, so no value changes) and used for released_at;
--   * the payload SELECT gains a fourth aggregate collecting the follow-up
--     prompt row ids; the guide objects carry prompt_id / prompt_version while
--     being built and lose them again before the brief is stored;
--   * the manifest is built and inserted; the two snapshot INSERTs name their
--     ids and carry manifest_id / canonical_sha256.
-- Everything an audience receives is unchanged.

CREATE OR REPLACE FUNCTION public.scp_release_attempt_report(_attempt_id uuid)
RETURNS TABLE(participant_snapshot uuid, employer_snapshot uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _a public.scp_attempts%ROWTYPE;
  _role text; _flags jsonb; _emp_payload jsonb; _par_payload jsonb;
  _pv uuid; _ev uuid; _p_id uuid; _e_id uuid; _derivation jsonb;
  _emp_ctx jsonb; _par_ctx jsonb; _emp_brief jsonb; _par_brief jsonb;
  _org text; _purpose text; _slug text; _name_sv text; _name_en text;
  _version int; _lang text; _person text; _ref text;
  _rev_total int; _rev_done int; _obs int; _ctx int; _concerns int;
  _self int; _quick int; _answered int;
  _pv_key text; _ev_key text; _pv_num int; _ev_num int;
  _modules jsonb; _observed jsonb; _selfrep jsonb; _guide jsonb;
  _state_version constant text := 'des-v2';
  _scope_version constant text := 'attempt-v1';
  _brief_version constant text := 'rab-v1';
  _signal_version constant text := 'ras-v1';
  -- PR-R1
  _calculated_at timestamptz := now();
  _schema_version constant text := 'rcm-v1';
  _m_id uuid := gen_random_uuid();
  _fp_ids jsonb; _guide_ids jsonb; _computation jsonb; _body jsonb; _hash text;
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _a.id IS NULL THEN RETURN; END IF;

  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _a.issuer_organization_id
     AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_RELEASE: releasing a development '
      'report requires owner or admin in the commissioning organisation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _a.scored_at IS NULL THEN
    RAISE EXCEPTION 'SCP_RELEASE_BEFORE_SCORED: this attempt still has work '
      'outstanding -- a report cannot be released over an unreviewed response.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_ALREADY_RELEASED: this attempt''s report is already '
      'released; snapshots are immutable.' USING ERRCODE = 'unique_violation';
  END IF;

  CREATE TEMP TABLE _scope ON COMMIT DROP AS
  SELECT e.id
    FROM public.scp_competency_evidence e
   WHERE e.superseded_by IS NULL
     AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                           WHERE r.attempt_id = _attempt_id);

  -- The evidence-kind boundary, established once and used everywhere below.
  CREATE TEMP TABLE _observed_scope ON COMMIT DROP AS
  SELECT e.id
    FROM public.scp_competency_evidence e
    JOIN public.scp_evidence_source_types t
      ON t.code = e.source_type AND t.counts_toward_maturity
   WHERE e.id IN (SELECT id FROM _scope);

  SELECT e.name INTO _org FROM public.employers e WHERE e.id = _a.issuer_organization_id;
  SELECT pv2.purpose_code INTO _purpose
    FROM public.scp_purpose_versions pv2 WHERE pv2.id = _a.purpose_version_id;
  SELECT d.slug, d.name_sv, d.name_en, av.version_number
    INTO _slug, _name_sv, _name_en, _version
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.id = _a.assessment_version_id;
  SELECT aa.language,
         CASE WHEN aa.employee_id IS NOT NULL OR aa.use_case = 'workforce'
              THEN 'employee' ELSE 'candidate' END
    INTO _lang, _person
    FROM public.assessment_assignments aa WHERE aa.id = _a.assignment_id;

  _ref := upper(substr(replace(_a.subject_id::text, '-', ''), 1, 6));

  SELECT count(*), count(DISTINCT e.context_ref)
    INTO _obs, _ctx
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _observed_scope);

  SELECT count(*) INTO _self
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope) AND e.source_type = 'self_report';

  SELECT count(*), count(*) FILTER (WHERE hr.review_status = 'completed')
    INTO _rev_total, _rev_done
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
   WHERE r.attempt_id = _attempt_id;

  SELECT count(*) INTO _concerns
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope)
     AND e.safety_finding IN ('low','medium','high','critical');

  -- A pace observation, and nothing more than that. Counts answers recorded
  -- within three seconds of the previous one, and is reported as a fact about
  -- the RUN rather than a finding about the person: fast answering has many
  -- innocent explanations -- a re-read pass, a resumed session, a confident
  -- reader -- and the product must not turn a timestamp into a character claim.
  --
  -- Reported PROPORTIONALLY, and only above a quarter of the run. A raw count
  -- is unreadable ("11 rapid answers" out of what?) and a signal that fires on
  -- two quick clicks is noise that trains the reader to skip the section. Both
  -- numbers are carried so the surface can state the denominator.
  SELECT count(*) FILTER (WHERE g.gap IS NOT NULL AND g.gap < interval '3 seconds'),
         count(*)
    INTO _quick, _answered
    FROM (SELECT r.responded_at
                 - lag(r.responded_at) OVER (ORDER BY fi.display_order) AS gap
            FROM public.scp_candidate_responses r
            JOIN public.scp_form_items fi
              ON fi.item_version_id = r.item_version_id AND fi.form_id = _a.form_id
           WHERE r.attempt_id = _attempt_id) g;

  WITH scope_comp AS (
    -- Competencies this attempt produced OBSERVED evidence for. Self-report is
    -- deliberately excluded here: a competency the person only DESCRIBED must
    -- not appear on an observed line, at any state, with any count.
    SELECT DISTINCT bcm.competency_version_id
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map bcm
        ON bcm.behaviour_version_id = e.behaviour_version_id
     WHERE e.id IN (SELECT id FROM _observed_scope)
    UNION
    -- Plus the ones a disputed review reached but deliberately left no evidence
    -- for. Without this the line disappears rather than reading "needs a
    -- follow-up", which is the opposite of what a disputed reading should say.
    SELECT DISTINCT bcm.competency_version_id
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
      JOIN public.scp_behaviour_competency_map bcm
        ON bcm.behaviour_version_id = iv.primary_behaviour_id
     WHERE r.attempt_id = _attempt_id
       AND hr.review_status = 'completed'
       AND hr.outcome IN ('adjusted','overturned')
  ), lines AS (
    SELECT c.code AS competency_code, cv.id AS competency_version_id,
           cv.name_sv, cv.name_en,
           public.scp_attempt_maturity(_attempt_id, cv.id, 'v1', _calculated_at) AS maturity,
           count(e.id) AS observations,
           coalesce(array_agg(DISTINCT e.source_type)
                      FILTER (WHERE e.source_type IS NOT NULL), ARRAY[]::text[]) AS source_types,
           string_agg(DISTINCT bv.statement_sv, ' ') AS behaviour_sv,
           string_agg(DISTINCT bv.statement_en, ' ') AS behaviour_en,
           coalesce(bool_or(e.provenance_type = 'human_review'), false) AS human_reviewed
      FROM scope_comp sc
      JOIN public.scp_competency_versions cv ON cv.id = sc.competency_version_id
      JOIN public.scp_competencies c ON c.id = cv.competency_id
      LEFT JOIN public.scp_behaviour_competency_map bcm
             ON bcm.competency_version_id = cv.id
      LEFT JOIN public.scp_competency_evidence e
             ON e.behaviour_version_id = bcm.behaviour_version_id
            AND e.id IN (SELECT id FROM _observed_scope)
      LEFT JOIN public.scp_behaviour_versions bv ON bv.id = bcm.behaviour_version_id
     GROUP BY c.code, cv.id, cv.name_sv, cv.name_en
  ), stated AS (
    SELECT l.*,
           public.scp_attempt_evidence_state(_attempt_id, l.competency_version_id, l.maturity) AS state
      FROM lines l
  )
  SELECT
    jsonb_agg(jsonb_build_object(
      'competency_code',    s.competency_code,
      'competency_name_sv', s.name_sv,
      'competency_name_en', s.name_en,
      'evidence_state',     s.state,
      'observations',       s.observations,
      'source_types',       to_jsonb(coalesce(s.source_types, ARRAY[]::text[])),
      'behaviour_sv',       s.behaviour_sv,
      'behaviour_en',       s.behaviour_en,
      'followup_sv',        fpe.prompt_sv,
      'followup_en',        fpe.prompt_en
    ) ORDER BY s.competency_code),
    jsonb_agg(jsonb_build_object(
      'competency_code',    s.competency_code,
      'competency_name_sv', s.name_sv,
      'competency_name_en', s.name_en,
      'evidence_state',     s.state,
      'observations',       s.observations,
      'behaviour_sv',       s.behaviour_sv,
      'behaviour_en',       s.behaviour_en,
      'human_reviewed',     s.human_reviewed,
      'reflection_sv',      fpp.prompt_sv,
      'reflection_en',      fpp.prompt_en
    ) ORDER BY s.competency_code),
    jsonb_agg(jsonb_build_object(
      'competency_code', s.competency_code,
      'maturity_level',  s.maturity,
      'threshold_version', 'v1'
    ) ORDER BY s.competency_code),
    -- PR-R1: the follow-up prompt rows the two payloads were built from.
    jsonb_agg(jsonb_build_object(
      'competency_code',                  s.competency_code,
      'employer_followup_prompt_id',      fpe.id,
      'participant_reflection_prompt_id', fpp.id
    ) ORDER BY s.competency_code)
    INTO _emp_payload, _par_payload, _derivation, _fp_ids
    FROM stated s
    LEFT JOIN public.scp_competency_versions cv2 ON cv2.id = s.competency_version_id
    LEFT JOIN public.scp_followup_prompts fpe
           ON fpe.competency_id = cv2.competency_id AND fpe.audience = 'employer'
          AND fpe.content_status = 'published'
    LEFT JOIN public.scp_followup_prompts fpp
           ON fpp.competency_id = cv2.competency_id AND fpp.audience = 'participant'
          AND fpp.content_status = 'published';

  -- ── The brief ─────────────────────────────────────────────────────────

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'block_key', b.block_key, 'name_sv', b.name_sv, 'name_en', b.name_en,
           'asks', b.asks,
           'items', (SELECT count(*) FROM public.scp_form_items fi
                      WHERE fi.form_id = _a.form_id AND fi.block_key = b.block_key),
           'answered', (SELECT count(*) FROM public.scp_form_items fi
                          JOIN public.scp_candidate_responses r
                            ON r.item_version_id = fi.item_version_id
                           AND r.attempt_id = _attempt_id
                         WHERE fi.form_id = _a.form_id AND fi.block_key = b.block_key)
         ) ORDER BY b.display_order), '[]'::jsonb)
    INTO _modules
    FROM public.scp_form_blocks b WHERE b.form_id = _a.form_id;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'competency_code'), '[]'::jsonb)
    INTO _observed
    FROM (
      SELECT jsonb_build_object(
               'area_code',    c.code,
               'area_sv',      cv.name_sv,
               'area_en',      cv.name_en,
               'evidence_type','observed',
               'signal',       sig.signal,
               'items',        sig.observations,
               'mean',         sig.mean,
               'spread',       sig.spread,
               'evidence_state', public.scp_attempt_evidence_state(
                                   _attempt_id, cv.id,
                                   public.scp_attempt_maturity(_attempt_id, cv.id, 'v1', _calculated_at)),
               'behaviour_sv', bstat.sv,
               'behaviour_en', bstat.en,
               'why_sv', CASE sig.signal
                 WHEN 'strong'     THEN format('Svaren höll en jämn och hög nivå över %s uppgifter i den här bedömningen.', sig.observations)
                 WHEN 'consistent' THEN format('Svaren pekade åt samma håll över %s uppgifter i den här bedömningen.', sig.observations)
                 WHEN 'mixed'      THEN format('Svaren skilde sig åt mellan jämförbara uppgifter (%s uppgifter, spännvidd %s).', sig.observations, to_char(sig.spread,'FM0.00'))
                 WHEN 'developing' THEN format('Svaren valde genomgående handlingsalternativ som uppgifterna beskriver som mindre välavvägda (%s uppgifter).', sig.observations)
                 ELSE format('Endast %s uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.', sig.observations)
               END,
               'why_en', CASE sig.signal
                 WHEN 'strong'     THEN format('Answers were consistently strong across %s tasks in this assessment.', sig.observations)
                 WHEN 'consistent' THEN format('Answers pointed the same way across %s tasks in this assessment.', sig.observations)
                 WHEN 'mixed'      THEN format('Answers differed between comparable tasks (%s tasks, spread %s).', sig.observations, to_char(sig.spread,'FM0.00'))
                 WHEN 'developing' THEN format('Answers consistently chose options the tasks describe as less well-judged (%s tasks).', sig.observations)
                 ELSE format('Only %s task(s) in this assessment touched this area — too few to say anything about it.', sig.observations)
               END
             ) AS x
        FROM (SELECT DISTINCT bcm.competency_version_id AS cvid
                FROM public.scp_competency_evidence e
                JOIN public.scp_behaviour_competency_map bcm
                  ON bcm.behaviour_version_id = e.behaviour_version_id
               WHERE e.id IN (SELECT id FROM _observed_scope)) src
        JOIN public.scp_competency_versions cv ON cv.id = src.cvid
        JOIN public.scp_competencies c ON c.id = cv.competency_id
        CROSS JOIN LATERAL public.scp_attempt_assessment_signal(
                     _attempt_id, cv.id, _signal_version) sig
        LEFT JOIN LATERAL (
          SELECT string_agg(DISTINCT bv.statement_sv, ' ') AS sv,
                 string_agg(DISTINCT bv.statement_en, ' ') AS en
            FROM public.scp_behaviour_competency_map bcm2
            JOIN public.scp_behaviour_versions bv ON bv.id = bcm2.behaviour_version_id
           WHERE bcm2.competency_version_id = cv.id) bstat ON true
    ) q;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'domain_key'), '[]'::jsonb)
    INTO _selfrep
    FROM (
      SELECT jsonb_build_object(
               'domain_key',    f.slug,
               'domain_sv',     f.name_sv,
               'domain_en',     f.name_en,
               'area_code',     c.code,
               'evidence_type', 'self_reported',
               'pattern',       p.pattern,
               'consistency',   p.consistency,
               'items',         p.items,
               'mean',          p.mean,
               'spread',        p.spread,
               'why_sv', CASE
                 WHEN p.consistency = 'varied'
                   THEN format('Svaren varierade mellan närliggande frågor om %s. Utforska området i intervju.', lower(f.name_sv))
                 WHEN p.pattern = 'consistently_described'
                   THEN format('Deltagaren beskriver genomgående att hen arbetar så (%s frågor). Detta är självrapporterat och inte observerat.', p.items)
                 WHEN p.pattern = 'mostly_described'
                   THEN format('Deltagaren beskriver för det mesta att hen arbetar så (%s frågor). Detta är självrapporterat och inte observerat.', p.items)
                 ELSE format('Deltagaren beskriver att hen sällan arbetar så (%s frågor). Detta är självrapporterat och inte observerat.', p.items)
               END,
               'why_en', CASE
                 WHEN p.consistency = 'varied'
                   THEN format('Answers varied across related questions about %s. Explore this area in interview.', lower(f.name_en))
                 WHEN p.pattern = 'consistently_described'
                   THEN format('The participant consistently describes working this way (%s questions). This is self-reported, not observed.', p.items)
                 WHEN p.pattern = 'mostly_described'
                   THEN format('The participant mostly describes working this way (%s questions). This is self-reported, not observed.', p.items)
                 ELSE format('The participant describes rarely working this way (%s questions). This is self-reported, not observed.', p.items)
               END
             ) AS x
        FROM (SELECT DISTINCT iv.facet_id
                FROM public.scp_competency_evidence e
                JOIN public.scp_candidate_responses r ON r.id = e.source_ref
                JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
               WHERE r.attempt_id = _attempt_id
                 AND e.source_type = 'self_report'
                 AND e.superseded_by IS NULL
                 AND iv.facet_id IS NOT NULL) src
        JOIN public.scp_competency_facets f ON f.id = src.facet_id
        JOIN public.scp_competencies c ON c.id = f.competency_id
        CROSS JOIN LATERAL public.scp_attempt_self_report_pattern(
                     _attempt_id, f.id, _signal_version) p
    ) q;

  -- The guide. Selection is deterministic: what the evidence produced decides
  -- the FOCUS, and the focus selects an authored question. Development first,
  -- then self-report answers that need an example behind them, then thin
  -- areas, then a strength worth testing the depth of -- which is the order a
  -- recruiter with forty minutes should spend them in.
  --
  -- PR-R1: each entry carries the prompt row's id and version while the guide
  -- is built; both are moved to the manifest and stripped before the brief is
  -- stored, so the audience document is unchanged.
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'guide_order')::int, x->>'area_code'), '[]'::jsonb)
    INTO _guide
    FROM (
      SELECT jsonb_build_object(
               'guide_order', CASE g.focus
                         WHEN 'explore_development'      THEN 1
                         WHEN 'explore_self_report'      THEN 2
                         WHEN 'explore_limited_evidence' THEN 3
                         ELSE 4 END,
               'area_code',     g.area_code,
               'area_sv',       g.area_sv,
               'area_en',       g.area_en,
               'focus',         g.focus,
               'evidence_type', g.evidence_type,
               'why_sv',        g.why_sv,
               'why_en',        g.why_en,
               'question_sv',   p.question_sv,
               'question_en',   p.question_en,
               'followup_sv',   p.followup_sv,
               'followup_en',   p.followup_en,
               'listen_for_sv', to_jsonb(p.listen_for_sv),
               'listen_for_en', to_jsonb(p.listen_for_en),
               'prompt_id',     p.id,
               'prompt_version', p.version_number
             ) AS x
        FROM (
          -- Observed areas that need exploring, or are worth confirming.
          SELECT (o->>'area_code') AS area_code,
                 (o->>'area_sv')   AS area_sv,
                 (o->>'area_en')   AS area_en,
                 'observed'        AS evidence_type,
                 CASE WHEN o->>'signal' IN ('developing','mixed') THEN 'explore_development'
                      WHEN o->>'signal' = 'limited'               THEN 'explore_limited_evidence'
                      ELSE 'confirm_strength' END AS focus,
                 (o->>'why_sv') AS why_sv,
                 (o->>'why_en') AS why_en,
                 NULL::text     AS facet_slug
            FROM jsonb_array_elements(_observed) o
          UNION ALL
          -- Self-descriptions whose related answers disagreed, and
          -- self-descriptions with no observed counterpart at all: both need a
          -- concrete example before anybody relies on them.
          SELECT (s->>'area_code'), (s->>'domain_sv'), (s->>'domain_en'),
                 'self_reported',
                 'explore_self_report',
                 (s->>'why_sv'), (s->>'why_en'),
                 (s->>'domain_key')
            FROM jsonb_array_elements(_selfrep) s
           WHERE s->>'consistency' = 'varied'
              OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_observed) o2
                              WHERE o2->>'area_code' = s->>'area_code'
                                AND o2->>'signal' <> 'limited')
        ) g
        JOIN public.scp_competencies c ON c.code = g.area_code
        JOIN public.scp_interview_guide_prompts p
          ON p.competency_id = c.id
         AND p.focus = g.focus
         AND p.content_status = 'published'
         AND ((g.facet_slug IS NULL AND p.facet_id IS NULL)
           OR (g.facet_slug IS NOT NULL
               AND p.facet_id = (SELECT f2.id FROM public.scp_competency_facets f2
                                  WHERE f2.slug = g.facet_slug)))
    ) q;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'prompt_id',      g.value -> 'prompt_id',
           'prompt_version', g.value -> 'prompt_version',
           'area_code',      g.value -> 'area_code',
           'focus',          g.value -> 'focus',
           'evidence_type',  g.value -> 'evidence_type',
           'guide_order',    g.ordinality) ORDER BY g.ordinality), '[]'::jsonb)
    INTO _guide_ids
    FROM jsonb_array_elements(_guide) WITH ORDINALITY g;
  SELECT coalesce(jsonb_agg((g.value - 'prompt_id' - 'prompt_version') ORDER BY g.ordinality), '[]'::jsonb)
    INTO _guide
    FROM jsonb_array_elements(_guide) WITH ORDINALITY g;

  _emp_brief := jsonb_build_object(
    'brief_version',   _brief_version,
    'signal_version',  _signal_version,
    'audience',        'employer',
    'modules',         _modules,
    'observed',        _observed,
    'self_reported',   _selfrep,
    'interview_guide', _guide,
    'coverage', jsonb_build_object(
      'observed_observations',    _obs,
      'self_report_observations', _self,
      'evidence_contexts',        _ctx,
      'reviews_total',            _rev_total,
      'reviews_completed',        _rev_done),
    'pace', CASE
      WHEN _answered > 0 AND _quick::numeric / _answered >= 0.25
        THEN jsonb_build_object('rapid_answers', _quick, 'answered', _answered)
      ELSE NULL END);

  -- The participant's brief. Deliberately a SUBSET, not a softened version:
  -- the modules they completed and what they themselves said. No strengths
  -- ordering, no development framing, no interview guide -- those are written
  -- for a recruiter preparing a conversation, and handing them to the person
  -- being assessed would be handing them somebody else's working notes.
  _par_brief := jsonb_build_object(
    'brief_version',  _brief_version,
    'signal_version', _signal_version,
    'audience',       'participant',
    'modules',        _modules,
    'self_reported',  (
      SELECT coalesce(jsonb_agg(s - 'why_sv' - 'why_en' - 'mean' - 'spread'
                                  ORDER BY s->>'domain_key'), '[]'::jsonb)
        FROM jsonb_array_elements(_selfrep) s),
    'coverage', jsonb_build_object(
      'observed_observations',    _obs,
      'self_report_observations', _self,
      'evidence_contexts',        _ctx));

  -- Real findings only. A safety-critical item that a reviewer cleared is not a
  -- flag, and an alert that fires for everybody is not an alert.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'behaviour_version_id', e.behaviour_version_id,
           'severity', e.safety_severity,
           'finding', e.safety_finding,
           'observed_at', e.observed_at)), '[]'::jsonb)
    INTO _flags
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope)
     AND e.safety_finding IN ('low','medium','high','critical');

  SELECT id, report_key, version_number INTO _pv, _pv_key, _pv_num
    FROM public.scp_report_versions
   WHERE audience = 'participant' AND content_status = 'published'
     AND (governance_mode = _a.governance_mode OR governance_mode IS NULL)
   ORDER BY (governance_mode IS NOT NULL) DESC, version_number DESC LIMIT 1;
  SELECT id, report_key, version_number INTO _ev, _ev_key, _ev_num
    FROM public.scp_report_versions
   WHERE audience = 'employer' AND content_status = 'published'
     AND (governance_mode = _a.governance_mode OR governance_mode IS NULL)
   ORDER BY (governance_mode IS NOT NULL) DESC, version_number DESC LIMIT 1;
  IF _pv IS NULL OR _ev IS NULL THEN
    RAISE EXCEPTION 'SCP_NO_PUBLISHED_REPORT_TEMPLATE: a report cannot be '
      'rendered without a published template for each audience.'
      USING ERRCODE = 'check_violation';
  END IF;

  _emp_ctx := jsonb_build_object(
    'participant_ref', _ref, 'person_context', _person,
    'organisation_name', _org, 'purpose_code', _purpose,
    'assessment_slug', _slug, 'assessment_name_sv', _name_sv,
    'assessment_name_en', _name_en, 'assessment_version', _version,
    'language', _lang, 'started_at', _a.started_at,
    'submitted_at', _a.submitted_at, 'scored_at', _a.scored_at,
    'governance_mode', _a.governance_mode,
    'validation_status', _a.validation_status_at_assignment,
    'content_status', _a.content_status_at_assignment,
    'attempt_status', 'released',
    'reviews_total', _rev_total, 'reviews_completed', _rev_done,
    'safety_concerns', _concerns,
    'evidence_observations', _obs, 'evidence_contexts', _ctx,
    'self_report_observations', _self,
    'report_key', _ev_key, 'report_version', _ev_num,
    'evidence_state_version', _state_version,
    'evidence_scope_version', _scope_version,
    'brief_version', _brief_version,
    'signal_version', _signal_version,
    'threshold_version', 'v1',
    'scoring_model_version', _a.scoring_model_version);

  -- Unchanged from 20260823090000 except for two additions, and the omissions
  -- are the point: no attempt_status, no review counts, no scoring model
  -- version and no participant_ref. RA8.4 and RA8.5 in the report-audience
  -- suite assert those absences, and they are absences by intent -- the person
  -- is told what concerns them, not how the machine ran.
  _par_ctx := jsonb_build_object(
    'person_context', _person, 'organisation_name', _org,
    'purpose_code', _purpose, 'assessment_name_sv', _name_sv,
    'assessment_name_en', _name_en, 'assessment_version', _version,
    'language', _lang, 'submitted_at', _a.submitted_at,
    'governance_mode', _a.governance_mode,
    'validation_status', _a.validation_status_at_assignment,
    'human_review_occurred', (_rev_total > 0),
    'safety_concern_present', (_concerns > 0),
    'evidence_observations', _obs, 'evidence_contexts', _ctx,
    'self_report_observations', _self,
    'report_key', _pv_key, 'report_version', _pv_num,
    'evidence_scope_version', _scope_version,
    'brief_version', _brief_version);

  -- ── PR-R1: the provenance, frozen before the documents ────────────────
  --
  -- Identity (manifest id, snapshot ids) and time (calculated_at) are columns
  -- of the manifest row and NOT part of the hashed body: the hash covers
  -- frozen inputs, versions and computation, so the same frozen inputs under
  -- the same versions hash the same however often they are recomputed.
  _p_id := gen_random_uuid();
  _e_id := gen_random_uuid();
  -- The manifest is inserted before the snapshots it names. Its two snapshot
  -- links are DEFERRABLE; a previous release in the same transaction may have
  -- switched them to IMMEDIATE (below), so defer them again explicitly here.
  SET CONSTRAINTS public.scp_manifest_participant_snapshot_fkey,
                  public.scp_manifest_employer_snapshot_fkey DEFERRED;
  _computation := public.scp_report_manifest_computation(
                    _attempt_id, _calculated_at, 'v1', _signal_version);

  _body := jsonb_build_object(
    'schema_version', _schema_version,
    'attempt', jsonb_build_object(
      'attempt_id',                     _attempt_id,
      'subject_id',                     _a.subject_id,
      'issuer_organization_id',         _a.issuer_organization_id,
      'assignment_id',                  _a.assignment_id,
      'assessment_version_id',          _a.assessment_version_id,
      'assessment_slug',                _slug,
      'assessment_version',             _version,
      'form_id',                        _a.form_id,
      'purpose_version_id',             _a.purpose_version_id,
      'purpose_code',                   _purpose,
      'role_version_id',                _a.role_version_id,
      'jurisdiction_id',                _a.jurisdiction_id,
      'test_grant_id',                  _a.test_grant_id,
      'option_order_seed',              _a.option_order_seed,
      'governance_mode',                _a.governance_mode,
      'validation_status_at_assignment', _a.validation_status_at_assignment,
      'content_status_at_assignment',   _a.content_status_at_assignment,
      'language',                       _lang,
      'person_context',                 _person,
      'started_at',                     to_jsonb(_a.started_at AT TIME ZONE 'UTC'),
      'submitted_at',                   to_jsonb(_a.submitted_at AT TIME ZONE 'UTC'),
      'scored_at',                      to_jsonb(_a.scored_at AT TIME ZONE 'UTC')),
    'versions', jsonb_build_object(
      'calculation_schema_version', _schema_version,
      'scoring_model_version',      coalesce(_a.scoring_model_version, 'det-v1'),
      'signal_model_version',       _signal_version,
      'threshold_version',          'v1',
      'evidence_state_version',     _state_version,
      'evidence_scope_version',     _scope_version,
      'brief_version',              _brief_version,
      'competency_mapping_version', _computation -> 'competency_mapping' ->> 'version',
      'rubric_versions',            _computation -> 'rubric_versions',
      'trust_question_version',     jsonb_build_object(
                                      'source', 'scp_interview_guide_prompts',
                                      'prompts', _guide_ids),
      'report_template_version',    jsonb_build_object(
                                      'participant', jsonb_build_object(
                                        'report_version_id', _pv, 'report_key', _pv_key,
                                        'version_number', _pv_num),
                                      'employer', jsonb_build_object(
                                        'report_version_id', _ev, 'report_key', _ev_key,
                                        'version_number', _ev_num))),
    'prompts', jsonb_build_object(
      'interview_guide', _guide_ids,
      'followup',        coalesce(_fp_ids, '[]'::jsonb)),
    'coverage', jsonb_build_object(
      'observed_observations',    _obs,
      'self_report_observations', _self,
      'evidence_contexts',        _ctx,
      'reviews_total',            _rev_total,
      'reviews_completed',        _rev_done,
      'safety_findings',          _concerns,
      'answered',                 _answered),
    'computation', _computation);
  _hash := public.scp_report_manifest_hash(_body);

  INSERT INTO public.scp_report_computation_manifests
    (id, attempt_id, subject_id, issuer_organization_id,
     participant_snapshot_id, employer_snapshot_id,
     participant_report_version_id, employer_report_version_id,
     calculated_at, calculation_schema_version, scoring_model_version,
     signal_model_version, threshold_version, evidence_state_version,
     evidence_scope_version, brief_version, competency_mapping_version,
     released_by, released_by_role, body, canonical_sha256)
  VALUES
    (_m_id, _attempt_id, _a.subject_id, _a.issuer_organization_id,
     _p_id, _e_id, _pv, _ev,
     _calculated_at, _schema_version, coalesce(_a.scoring_model_version, 'det-v1'),
     _signal_version, 'v1', _state_version,
     _scope_version, _brief_version, _computation -> 'competency_mapping' ->> 'version',
     auth.uid(), _role, _body, _hash);

  INSERT INTO public.scp_report_snapshots
    (id, attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, brief, safety_flags, threshold_version,
     scoring_model_version, evidence_state_version, evidence_scope_version,
     derivation_input, context, released_at, manifest_id, canonical_sha256)
  VALUES
    (_p_id, _attempt_id, _a.subject_id, _a.issuer_organization_id, _pv,
     'participant', coalesce(_par_payload,'[]'::jsonb), _par_brief,
     '[]'::jsonb, 'v1', _a.scoring_model_version, _state_version,
     _scope_version, _derivation, _par_ctx, _calculated_at, _m_id, _hash);

  INSERT INTO public.scp_report_snapshots
    (id, attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, brief, safety_flags, threshold_version,
     scoring_model_version, evidence_state_version, evidence_scope_version,
     derivation_input, context, released_at, manifest_id, canonical_sha256)
  VALUES
    (_e_id, _attempt_id, _a.subject_id, _a.issuer_organization_id, _ev,
     'employer', coalesce(_emp_payload,'[]'::jsonb), _emp_brief,
     _flags, 'v1', _a.scoring_model_version, _state_version,
     _scope_version, _derivation, _emp_ctx, _calculated_at, _m_id, _hash);

  -- Both snapshots now exist: check the deferred links here rather than at
  -- commit, so a wrong id fails inside this call and never inside a caller
  -- that only rolls back.
  SET CONSTRAINTS public.scp_manifest_participant_snapshot_fkey,
                  public.scp_manifest_employer_snapshot_fkey IMMEDIATE;

  UPDATE public.scp_attempts
     SET released_at = _calculated_at, status = 'released'
   WHERE id = _attempt_id;

  DROP TABLE IF EXISTS _scope;
  DROP TABLE IF EXISTS _observed_scope;
  RETURN QUERY SELECT _p_id, _e_id;
END;
$function$;

COMMENT ON FUNCTION public.scp_release_attempt_report(uuid) IS
  'Freezes one attempt into two immutable snapshots and their briefs, and '
  '(PR-R1) the private computation manifest they were derived from, in one '
  'transaction under one calculated_at. The observed lines are built from '
  'counting evidence source types only, so a self-description can never be '
  'rendered as an observation; self-reported patterns occupy their own key. '
  'Neither brief contains a total, a percentage, a ranking, a suitability '
  'statement or an employment recommendation -- those are absent from the '
  'derivation rather than filtered from it.';

REVOKE ALL     ON FUNCTION public.scp_release_attempt_report(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_release_attempt_report(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §6  The verifier
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_verify_report_manifest(_manifest_id uuid)
RETURNS TABLE(
  manifest_id uuid,
  attempt_id uuid,
  stored_sha256 text,
  body_sha256 text,
  integrity_ok boolean,
  stored_computation_sha256 text,
  recomputed_computation_sha256 text,
  reproducible boolean,
  snapshots_linked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _m public.scp_report_computation_manifests%ROWTYPE; _re jsonb;
BEGIN
  SELECT m.* INTO _m FROM public.scp_report_computation_manifests m WHERE m.id = _manifest_id;
  IF _m.id IS NULL THEN RETURN; END IF;
  -- Rebuilt from the live ledger under the FROZEN instant and versions. A
  -- difference is information, not an error: it says the live sources no
  -- longer explain the released report the way they did at release.
  _re := public.scp_report_manifest_computation(
           _m.attempt_id, _m.calculated_at, _m.threshold_version, _m.signal_model_version);
  RETURN QUERY SELECT
    _m.id, _m.attempt_id,
    _m.canonical_sha256,
    public.scp_report_manifest_hash(_m.body),
    _m.canonical_sha256 = public.scp_report_manifest_hash(_m.body),
    public.scp_report_manifest_hash(_m.body -> 'computation'),
    public.scp_report_manifest_hash(_re),
    (_m.body -> 'computation') = _re,
    (SELECT count(*) = 2
       FROM public.scp_report_snapshots s
      WHERE s.manifest_id = _m.id
        AND s.canonical_sha256 = _m.canonical_sha256
        AND s.id IN (_m.participant_snapshot_id, _m.employer_snapshot_id));
END;
$function$;

COMMENT ON FUNCTION public.scp_verify_report_manifest(uuid) IS
  'Integrity and reproducibility of one manifest: the stored hash against '
  'the stored body, and the stored computation against one rebuilt from the '
  'live ledger under the frozen calculated_at and versions. Internal: '
  'service_role only. Never an audience read.';

REVOKE ALL     ON FUNCTION public.scp_verify_report_manifest(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.scp_verify_report_manifest(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- §7  Proof, at apply time
-- ═══════════════════════════════════════════════════════════════════════════

DO $proof$
DECLARE _def text; _bad text; _fn text; _h1 text; _h2 text;
BEGIN
  -- 7.1 Privacy posture of the manifest: RLS on, no policy, no audience
  -- privilege at table or column level, service_role kept.
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'scp_report_computation_manifests'
                    AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: RLS is not enabled on scp_report_computation_manifests';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
              AND tablename = 'scp_report_computation_manifests') THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: a policy exists on the manifest -- it must have none';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.table_privileges
              WHERE table_schema = 'public' AND table_name = 'scp_report_computation_manifests'
                AND grantee IN ('anon', 'authenticated', 'PUBLIC'))
     OR EXISTS (SELECT 1 FROM information_schema.column_privileges
                 WHERE table_schema = 'public' AND table_name = 'scp_report_computation_manifests'
                   AND grantee IN ('anon', 'authenticated', 'PUBLIC')) THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: an audience role holds a privilege on the manifest';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.scp_report_computation_manifests', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.scp_report_computation_manifests', 'INSERT') THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: service_role lost its manifest privileges';
  END IF;
  IF has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT')
     OR has_table_privilege('anon', 'public.scp_report_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: the R2A-3 posture on scp_report_snapshots moved';
  END IF;

  -- 7.2 The link columns exist, are nullable (legacy provenance), and pair.
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'scp_report_snapshots'
         AND column_name IN ('manifest_id', 'canonical_sha256') AND is_nullable = 'YES') <> 2 THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: manifest_id / canonical_sha256 are missing or not nullable';
  END IF;

  -- 7.3 Immutability trigger present.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                  WHERE c.relname = 'scp_report_computation_manifests'
                    AND t.tgname = 'scp_report_computation_manifests_immutable' AND NOT t.tgisinternal) THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: the manifest immutability trigger is missing';
  END IF;

  -- 7.4 Routine posture: definer + pinned for the builder and the verifier;
  -- the hash rule immutable; no audience role can execute any of the three.
  FOR _fn IN SELECT unnest(ARRAY['scp_report_manifest_computation', 'scp_verify_report_manifest']) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = _fn AND p.prosecdef
                      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'SCP_R1_PROOF: %() is missing, not SECURITY DEFINER, or has no pinned search_path', _fn;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_report_manifest_hash' AND p.provolatile = 'i') THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: scp_report_manifest_hash is not IMMUTABLE';
  END IF;
  IF has_function_privilege('anon', 'public.scp_report_manifest_hash(jsonb)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.scp_report_manifest_hash(jsonb)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public.scp_report_manifest_computation(uuid,timestamptz,text,text)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.scp_report_manifest_computation(uuid,timestamptz,text,text)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public.scp_verify_report_manifest(uuid)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.scp_verify_report_manifest(uuid)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.scp_verify_report_manifest(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: manifest routine grants are not internal-only';
  END IF;
  IF has_function_privilege('anon', 'public.scp_release_attempt_report(uuid)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('service_role', 'public.scp_release_attempt_report(uuid)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.scp_release_attempt_report(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: the release function grants moved';
  END IF;

  -- 7.5 The hash rule: canonical (key order does not matter), sensitive to
  -- content, and pinned to a known digest of a known canonical text so a
  -- future serialisation change cannot pass unnoticed.
  _h1 := public.scp_report_manifest_hash('{"b": 1, "a": 2}'::jsonb);
  _h2 := public.scp_report_manifest_hash('{"a":2,"b":1}'::jsonb);
  IF _h1 <> _h2 OR _h1 <> '21501dbaf73f5223934d22283f01caff4132bc1de4a9550c1ed0dffeb397a323'
     OR _h1 = public.scp_report_manifest_hash('{"a": 2, "b": 2}'::jsonb)
     OR public.scp_report_manifest_hash(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: the canonical hash rule changed (got %)', _h1;
  END IF;

  -- 7.6 The release function: still the only snapshot writer, now also the
  -- manifest writer, under one instant; and the same vocabulary proof as
  -- 20260830093000 §7, over the release function AND the two new routines.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosrc ILIKE '%INSERT INTO public.scp_report_snapshots%') <> 1
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.prosrc ILIKE '%INSERT INTO public.scp_report_computation_manifests%') <> 1 THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: snapshot / manifest writers are not exactly one routine';
  END IF;
  _def := lower(pg_get_functiondef('public.scp_release_attempt_report(uuid)'::regprocedure));
  IF position('_calculated_at' IN _def) = 0 OR position('now()' IN replace(_def, '_calculated_at timestamptz := now()', '')) > 0 THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: the release function does not use one calculated_at';
  END IF;
  FOR _fn IN SELECT unnest(ARRAY['public.scp_release_attempt_report(uuid)',
                                 'public.scp_report_manifest_computation(uuid,timestamptz,text,text)',
                                 'public.scp_verify_report_manifest(uuid)']) LOOP
    _def := lower(pg_get_functiondef(_fn::regprocedure));
    FOREACH _bad IN ARRAY ARRAY[
      'hire', 'reject', 'suitab', 'unsuitab', 'recommend', 'rank',
      'percentile', 'overall_score', 'total_score', 'pass_fail', 'risk_score',
      'trust_score', 'integrity_score', 'personality'
    ] LOOP
      IF position(_bad IN _def) > 0 THEN
        RAISE EXCEPTION
          'SCP_FORBIDDEN_REPORT_VOCABULARY: % contains "%". CQrityjob produces '
          'decision support, never an employment decision.', _fn, _bad;
      END IF;
    END LOOP;
  END LOOP;
  _def := lower(pg_get_functiondef('public.scp_release_attempt_report(uuid)'::regprocedure));
  IF position('counts_toward_maturity' IN _def) = 0 THEN
    RAISE EXCEPTION
      'SCP_OBSERVED_BOUNDARY_MISSING: the release function no longer separates '
      'observed evidence from self-report. That separation is the product.';
  END IF;

  -- 7.7 Neither audience contract projects the manifest link or reads the
  -- manifest table (a comment in scp_employer_report has named the manifest
  -- since R2A-1; the projection is what matters).
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report', 'scp_employer_report')
                AND (p.prosrc ILIKE '%s.manifest_id%' OR p.prosrc ILIKE '%s.canonical_sha256%'
                     OR p.prosrc ILIKE '%scp_report_computation_manifests%')) THEN
    RAISE EXCEPTION 'SCP_R1_PROOF: an audience contract reaches the manifest';
  END IF;

  RAISE NOTICE 'PR-R1 provenance proven: private immutable manifest, one calculated_at, canonical hash pinned, audience contracts untouched';
END
$proof$;
