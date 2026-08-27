-- ===========================================================================
-- CQrity Interview Intelligence — integrity hardening
-- ===========================================================================
--
-- Canonical, additive migration. Closes four gaps found in the final product
-- integrity review. Every one of them was a case where the CORRECT state
-- existed only because the seed happened to be written correctly, with nothing
-- preventing a later edit from breaking it.
--
--   1. RESEARCH INTEGRITY. Nothing stopped a claim derived from an UNREAD
--      source being marked "strong", or an implication resting on an unread
--      source being approved. One seeded claim was in fact over-stated:
--      claim-structured-same-questions carried evidence_strength = 'strong'
--      while its source was never inspected. Corrected here, and prevented by
--      trigger from recurring.
--
--   2. GRAPH ASSURANCE. Every edge looked alike. An edge asserting a mapping
--      nobody has confirmed was indistinguishable from one derived from a read
--      regulation. Edges now carry an explicit assurance level, and an edge
--      cannot claim more assurance than the record underneath it has.
--
--   3. PILOT ENTITLEMENT. A grant had no expiry, no environment, no cohort and
--      no revocation attribution, so "controlled pilot" was a promise rather
--      than a control. All four are added and enforced.
--
--   4. SOURCE READ STATUS. Three sources have now genuinely been inspected and
--      are recorded as such, with what was actually found. Four have not, and
--      say so.
--
-- Filename note: the next CANONICAL slot after 20260920090000.
-- ===========================================================================

DO $$
BEGIN
  IF to_regclass('public.scp_research_sources') IS NULL
     OR to_regclass('public.scp_intel_edges') IS NULL
     OR to_regclass('public.scp_interview_pack_pilot_grants') IS NULL THEN
    RAISE EXCEPTION 'SCP_IIH_PRECONDITION: the Interview Intelligence knowledge and runtime layers must be applied first.';
  END IF;
END $$;


-- ###########################################################################
-- SECTION 1 -- Research integrity, enforced
-- ###########################################################################

-- A claim whose source nobody has read is not "insufficient evidence" in the
-- scientific sense -- it is evidence nobody has checked. Those are different
-- statements and the registry now has a value for each.
ALTER TABLE public.scp_research_claims
  DROP CONSTRAINT IF EXISTS scp_research_claims_evidence_strength_check;
ALTER TABLE public.scp_research_claims
  ADD CONSTRAINT scp_research_claims_evidence_strength_check
  CHECK (evidence_strength IN (
    'strong', 'moderate', 'limited', 'contested', 'insufficient',
    'regulatory_fact',
    -- NEW: the source has not been inspected, so no strength can be asserted.
    'pending_source_verification'));

COMMENT ON COLUMN public.scp_research_claims.evidence_strength IS
  'pending_source_verification means NOBODY HAS READ THE SOURCE. It is not a '
  'weak finding; it is an unchecked one, and the guard below refuses to let it '
  'become a strong or moderate finding until someone reads the source.';


-- ---------------------------------------------------------------------------
-- 1.1  A claim may not out-run its source.
--
--      Two rules, both of which existed only as good intentions before:
--        * an unread source cannot support a strong/moderate/limited/contested
--          empirical strength -- only pending_source_verification;
--        * a claim cannot be APPROVED while its source is unread or unapproved.
--
--      A regulatory_fact is exempt from neither: a regulation nobody has opened
--      is still a regulation nobody has opened.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_research_guard_claim_not_ahead_of_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _access text;
  _review text;
BEGIN
  SELECT access_status, review_status INTO _access, _review
    FROM public.scp_research_sources WHERE id = NEW.source_id;

  IF _access IS NULL THEN
    RAISE EXCEPTION 'SCP_RESEARCH_SOURCE_MISSING: a claim must belong to a registered source.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _access <> 'verified_read'
     AND NEW.evidence_strength NOT IN ('pending_source_verification', 'insufficient') THEN
    RAISE EXCEPTION
      'SCP_RESEARCH_CLAIM_AHEAD_OF_SOURCE: source access_status is "%", so this claim cannot assert evidence_strength "%". Nobody has read it. Use pending_source_verification until someone has.',
      _access, NEW.evidence_strength USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'approved' AND (_access <> 'verified_read' OR _review <> 'approved') THEN
    RAISE EXCEPTION
      'SCP_RESEARCH_CLAIM_APPROVAL_BLOCKED: a claim cannot be approved while its source is access_status="%" / review_status="%". Approving a claim about a document nobody has read is the exact failure this registry exists to prevent.',
      _access, _review USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_research_guard_claim_not_ahead_of_source()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_research_claims_not_ahead_of_source ON public.scp_research_claims;
CREATE TRIGGER scp_research_claims_not_ahead_of_source
  BEFORE INSERT OR UPDATE ON public.scp_research_claims
  FOR EACH ROW EXECUTE FUNCTION public.scp_research_guard_claim_not_ahead_of_source();


-- ---------------------------------------------------------------------------
-- 1.2  An implication may not out-run its claim.
--
--      An approved product implication is the thing that actually licenses
--      product behaviour, so it is the last place an unverified claim may leak
--      into the system.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_research_guard_implication_not_ahead_of_claim()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _claim_status text;
  _strength text;
  _access text;
BEGIN
  SELECT c.status, c.evidence_strength, s.access_status
    INTO _claim_status, _strength, _access
    FROM public.scp_research_claims c
    JOIN public.scp_research_sources s ON s.id = c.source_id
   WHERE c.id = NEW.claim_id;

  IF _claim_status IS NULL THEN
    RAISE EXCEPTION 'SCP_RESEARCH_CLAIM_MISSING' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.approval_status = 'approved' THEN
    IF _claim_status <> 'approved' THEN
      RAISE EXCEPTION
        'SCP_RESEARCH_IMPLICATION_AHEAD_OF_CLAIM: the claim is "%", so this implication cannot be approved.',
        _claim_status USING ERRCODE = 'check_violation';
    END IF;

    -- A product-design decision or an unvalidated hypothesis may be approved as
    -- what it IS. What may never be approved is a SOURCE FACT resting on a
    -- source nobody read: that is the sentence that turns a summary into a
    -- citation.
    IF NEW.statement_kind = 'source_fact' AND _access <> 'verified_read' THEN
      RAISE EXCEPTION
        'SCP_RESEARCH_UNREAD_SOURCE_FACT: a statement_kind of "source_fact" cannot be approved while the source is "%". Record it as cqrityjob_interpretation or product_design_decision, or read the source.',
        _access USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_research_guard_implication_not_ahead_of_claim()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_research_implications_not_ahead_of_claim ON public.scp_research_implications;
CREATE TRIGGER scp_research_implications_not_ahead_of_claim
  BEFORE INSERT OR UPDATE ON public.scp_research_implications
  FOR EACH ROW EXECUTE FUNCTION public.scp_research_guard_implication_not_ahead_of_claim();


-- ---------------------------------------------------------------------------
-- 1.3  Record what was ACTUALLY read, and correct what was over-stated.
--
--      Three sources have now been inspected. Two of them were read in full
--      during this review; the third is the supplied product document.
-- ---------------------------------------------------------------------------

-- Arbetsmiljoverket: fetched and read 2026-08-27.
UPDATE public.scp_research_sources
   SET access_status = 'verified_read',
       summary =
         'INSPECTED 2026-08-27. Arbetsmiljoverket guidance page "Vald och hot om vald". '
         'States that employers must work systematically to reduce the risk of violence, '
         'that "med ett bra forebyggande arbete gar det att skapa en trygg arbetsplats", and '
         'that "manga vald- och hotsituationer [kan] undvikas med anpassade lokaler och '
         'genomtankta arbetsrutiner". It names at-risk groups including staff handling '
         'valuables and staff working alone or in exposed locations. It addresses the '
         'EMPLOYER''s duty to organise work safely. It says NOTHING about how to assess an '
         'individual candidate, which is why the claim derived from it is a regulatory/context '
         'fact and not an assessment method.'
 WHERE slug = 'av-vald-och-hot';

-- Polismyndigheten PMFS 2017:10: fetched and text-extracted 2026-08-27.
UPDATE public.scp_research_sources
   SET access_status = 'verified_read',
       publication_year = 2017,
       summary =
         'INSPECTED 2026-08-27 (full text extracted, ~193k characters). '
         'Polismyndighetens forfattningssamling ISSN 2002-0139, "Polismyndighetens '
         'foreskrifter och allmanna rad om bevakningsforetag och bevakningspersonal", '
         'beslutade den 5 oktober 2017, issued under 28 s forordningen (1989:149) om '
         'bevakningsforetag. Confirmed chapters include 2 kap. Auktorisation, 3 kap. '
         'Differentierad auktorisation, chapters on godkannande and Aterkallelse av '
         'godkannande, and 7 kap. Utbildning m.m. containing Vaktargrundutbildning, '
         'Arbetsplatsforlagt larande and Fortbildning. It regulates who may operate, who may '
         'be approved as personnel, and what training is required. It is a REGULATORY FACT '
         'about the role. It contains no selection method and supports no claim about '
         'assessing an individual.'
 WHERE slug = 'pmfs-2017-10-fap-573-1';

-- SIOP: the URL resolves to the correct document and its identity is confirmed
-- from extractable fragments ("SIOP White Paper Series", "Why Should You Care
-- About AI Used for Hiring?", "What Is AI?"), but the body text could not be
-- extracted. Identity confirmed is NOT content read.
UPDATE public.scp_research_sources
   SET access_status = 'pending_verification',
       summary =
         'NOT READ. Fetch attempted 2026-08-27: the URL resolves and the document is '
         'confirmed to be a SIOP White Paper on AI in hiring (extractable fragments include '
         '"SIOP White Paper Series", "Why Should You Care About AI Used for Hiring?" and '
         '"What Is AI?", 12 pages). The substantive text uses subset-embedded fonts and could '
         'not be extracted, so CQrityjob has NOT read its content. Document identity is '
         'confirmed; its contents are not. No product behaviour may cite it as a source fact '
         'until a human reads it.'
 WHERE slug = 'siop-ai-talent-assessment';

-- OPM: three fetch attempts, all timed out.
UPDATE public.scp_research_sources
   SET access_status = 'pending_verification',
       summary =
         'NOT READ. Three fetch attempts on 2026-08-27 all timed out (ETIMEDOUT). The URL is '
         'recorded from the Vaktare pack''s own reference list and has not been confirmed to '
         'resolve. Nothing in the product may cite this as a source fact until a human opens '
         'it.'
 WHERE slug = 'opm-structured-interviews';

-- The two method sources stay honestly unavailable.
UPDATE public.scp_research_sources
   SET summary = summary ||
         ' REVIEW 2026-08-27: still unavailable. No primary literature has been obtained, so '
         'every product behaviour leaning on this is a CQrityjob product-design decision, not '
         'a research finding.'
 WHERE slug IN ('peace-investigative-interviewing', 'orbit-rapport-based-interviewing')
   AND summary NOT LIKE '%REVIEW 2026-08-27%';


-- THE CORRECTION. Any claim whose source is not verified_read is downgraded to
-- pending_source_verification. On the seeded data this demotes exactly one
-- over-stated claim -- claim-structured-same-questions, which asserted "strong"
-- from a source nobody had opened -- plus the SIOP-derived claim.
UPDATE public.scp_research_claims c
   SET evidence_strength = 'pending_source_verification',
       limitations = c.limitations ||
         ' [2026-08-27 integrity review: downgraded from "' || c.evidence_strength ||
         '" because the source has not been inspected. No empirical strength may be asserted '
         'from a document nobody has read.]'
  FROM public.scp_research_sources s
 WHERE s.id = c.source_id
   AND s.access_status <> 'verified_read'
   AND c.evidence_strength NOT IN ('pending_source_verification', 'insufficient');

-- And the two now-read regulatory sources keep regulatory_fact, which is
-- correct AND now actually backed by a document somebody opened.
UPDATE public.scp_research_claims c
   SET evidence_strength = 'regulatory_fact'
  FROM public.scp_research_sources s
 WHERE s.id = c.source_id
   AND s.access_status = 'verified_read'
   AND c.slug IN ('claim-mandate-boundaries', 'claim-violence-risk-context');


-- ###########################################################################
-- SECTION 2 -- Graph assurance
-- ###########################################################################
--
-- Before this, every edge looked alike. An edge asserting that C1 maps to
-- SCC-03 -- which no expert has confirmed -- was indistinguishable from an edge
-- derived from a regulation somebody has actually read.
--
-- `assurance` makes the difference explicit, and the guard below stops an edge
-- claiming more assurance than the record underneath it has. There is still NO
-- weight column, and adding one remains prohibited: assurance describes HOW
-- WELL WE KNOW the relationship, never HOW STRONGLY it predicts anything.
-- ---------------------------------------------------------------------------

ALTER TABLE public.scp_intel_edges
  ADD COLUMN IF NOT EXISTS assurance text NOT NULL DEFAULT 'provisional',
  ADD COLUMN IF NOT EXISTS assurance_note text,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.scp_intel_edges(id) ON DELETE SET NULL;

ALTER TABLE public.scp_intel_edges
  DROP CONSTRAINT IF EXISTS scp_intel_edges_assurance_check;
ALTER TABLE public.scp_intel_edges
  ADD CONSTRAINT scp_intel_edges_assurance_check CHECK (assurance IN (
    'verified',                    -- rests on a read source or a canonical structural fact
    'expert_reviewed',             -- a qualified human has confirmed it
    'provisional',                 -- asserted, not yet confirmed
    'hypothesis',                  -- a CQrityjob product hypothesis
    'pending_source_verification', -- rests on a source nobody has read
    'superseded'));

COMMENT ON COLUMN public.scp_intel_edges.assurance IS
  'How well the relationship is KNOWN -- never how strongly it predicts. '
  'There is deliberately no weight column on this table and there must never '
  'be one: assurance is an epistemic label, and a numeric edge would be a '
  'scoring model one traversal away.';

CREATE INDEX IF NOT EXISTS scp_intel_edges_assurance_idx
  ON public.scp_intel_edges (assurance);


-- ---------------------------------------------------------------------------
-- 2.1  An edge may not out-run the record underneath it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_intel_guard_edge_assurance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _access text;
  _mapping_state text;
BEGIN
  -- An edge touching a research claim inherits that claim's read status as a
  -- ceiling. This is what stops an unread claim being wired into product
  -- behaviour as though it were established.
  IF NEW.from_kind = 'research_claim' OR NEW.to_kind = 'research_claim' THEN
    SELECT s.access_status INTO _access
      FROM public.scp_research_claims c
      JOIN public.scp_research_sources s ON s.id = c.source_id
     WHERE c.id = CASE WHEN NEW.from_kind = 'research_claim' THEN NEW.from_id ELSE NEW.to_id END;

    IF _access IS NOT NULL AND _access <> 'verified_read'
       AND NEW.assurance IN ('verified', 'expert_reviewed') THEN
      RAISE EXCEPTION
        'SCP_INTEL_EDGE_ASSURANCE: this edge touches a research claim whose source is "%", so it cannot be marked "%". Use pending_source_verification.',
        _access, NEW.assurance USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- A competency mapping edge may never claim more than the mapping row itself.
  -- This is the specific guard against a provisional C1->SCC-03 correspondence
  -- quietly becoming a confirmed scientific equivalence.
  IF NEW.relation = 'maps_to' AND NEW.from_kind = 'interview_competency' THEN
    SELECT min(m.mapping_state) INTO _mapping_state
      FROM public.scp_interview_pack_competency_map m
     WHERE m.pack_competency_id = NEW.from_id;

    IF _mapping_state IS DISTINCT FROM 'confirmed'
       AND NEW.assurance IN ('verified', 'expert_reviewed') THEN
      RAISE EXCEPTION
        'SCP_INTEL_MAPPING_ASSURANCE: the underlying competency mapping is "%", so this edge cannot be marked "%". A provisional correspondence is not a confirmed equivalence.',
        coalesce(_mapping_state, 'missing'), NEW.assurance USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF (NEW.assurance = 'superseded') <> (NEW.superseded_by IS NOT NULL) THEN
    RAISE EXCEPTION
      'SCP_INTEL_EDGE_SUPERSEDED: an edge is "superseded" exactly when it names what superseded it.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_intel_guard_edge_assurance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_intel_edges_assurance ON public.scp_intel_edges;
CREATE TRIGGER scp_intel_edges_assurance
  BEFORE INSERT OR UPDATE ON public.scp_intel_edges
  FOR EACH ROW EXECUTE FUNCTION public.scp_intel_guard_edge_assurance();


-- ---------------------------------------------------------------------------
-- 2.2  Backfill the existing 216 edges from what is actually known.
-- ---------------------------------------------------------------------------

-- Structural edges over canonical content: the relationship is a fact about the
-- pack, not a scientific claim. A question DOES address the competency it is
-- linked to, by construction.
UPDATE public.scp_intel_edges
   SET assurance = 'verified',
       assurance_note = 'Structural fact about governed content: the relationship is how the pack is built, not an empirical finding.'
 WHERE relation IN ('addresses', 'implements')
   AND from_kind IN ('interview_question', 'evidence_dimension', 'method_practice');

-- Competency mappings: provisional, because the mappings themselves are.
UPDATE public.scp_intel_edges
   SET assurance = 'provisional',
       assurance_note = 'Composite Vaktare competency to an exact SCC competency version. Directional and UNWEIGHTED. Five of six pack competencies span two canonical competencies and no source supplies a weighting between them, so this is a semantic correspondence awaiting expert review -- never a predictive relationship.'
 WHERE relation = 'maps_to' AND from_kind = 'interview_competency';

-- Anything resting on a research claim inherits the source's read status.
UPDATE public.scp_intel_edges e
   SET assurance = CASE WHEN s.access_status = 'verified_read' THEN 'verified'
                        ELSE 'pending_source_verification' END,
       assurance_note = CASE WHEN s.access_status = 'verified_read'
                        THEN 'Rests on a source that has been inspected.'
                        ELSE 'Rests on a source nobody has read yet. Provisional and NOT usable as evidence that the product is research-grounded.' END
  FROM public.scp_research_claims c
  JOIN public.scp_research_sources s ON s.id = c.source_id
 WHERE (e.from_kind = 'research_claim' AND e.from_id = c.id)
    OR (e.to_kind   = 'research_claim' AND e.to_id   = c.id);

-- Method governance edges are product-design decisions, stated as such.
UPDATE public.scp_intel_edges
   SET assurance = 'hypothesis',
       assurance_note = 'A CQrityjob product-design decision about how a method shapes the workspace. Not an empirical finding and not a claim that the method validates anything about a candidate.'
 WHERE relation = 'governs' AND from_kind = 'interview_method';

-- Prohibited-area restrictions are policy facts we authored and enforce.
UPDATE public.scp_intel_edges
   SET assurance = 'verified',
       assurance_note = 'A policy restriction authored and enforced by CQrityjob, and tested.'
 WHERE relation = 'restricts';

-- Implication -> claim support edges follow the implication''s own status.
UPDATE public.scp_intel_edges e
   SET assurance = CASE WHEN s.access_status = 'verified_read' THEN 'provisional'
                        ELSE 'pending_source_verification' END,
       assurance_note = 'Product implication linked to the claim it rests on; assurance follows whether that claim''s source has been read.'
  FROM public.scp_research_implications i
  JOIN public.scp_research_claims c ON c.id = i.claim_id
  JOIN public.scp_research_sources s ON s.id = c.source_id
 WHERE e.from_kind = 'research_implication' AND e.from_id = i.id;


-- ###########################################################################
-- SECTION 3 -- Pilot entitlement, made an actual control
-- ###########################################################################
--
-- A grant previously had an employer, a pack version, a rationale and a
-- revocation timestamp. That is a record, not a control: it never expired, was
-- not tied to an environment, could not be limited to a cohort, and nobody had
-- to say who revoked it or why.
--
-- The four usage modes the review asks to distinguish are now explicit:
--   synthetic_test  -- automated suites and fixtures
--   internal_qa     -- CQrityjob's own product QA
--   employer_pilot  -- a named external employer, time-boxed
--   (published production use needs no grant at all -- that is the point)
-- ---------------------------------------------------------------------------

ALTER TABLE public.scp_interview_pack_pilot_grants
  ADD COLUMN IF NOT EXISTS usage_mode text NOT NULL DEFAULT 'employer_pilot',
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'development',
  ADD COLUMN IF NOT EXISTS starts_on date NOT NULL DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS expires_on date,
  ADD COLUMN IF NOT EXISTS cohort_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revocation_reason text;

ALTER TABLE public.scp_interview_pack_pilot_grants
  DROP CONSTRAINT IF EXISTS scp_interview_pilot_usage_mode_check;
ALTER TABLE public.scp_interview_pack_pilot_grants
  ADD CONSTRAINT scp_interview_pilot_usage_mode_check
  CHECK (usage_mode IN ('synthetic_test', 'internal_qa', 'employer_pilot'));

ALTER TABLE public.scp_interview_pack_pilot_grants
  DROP CONSTRAINT IF EXISTS scp_interview_pilot_environment_check;
ALTER TABLE public.scp_interview_pack_pilot_grants
  ADD CONSTRAINT scp_interview_pilot_environment_check
  CHECK (environment IN ('development', 'staging', 'production'));

ALTER TABLE public.scp_interview_pack_pilot_grants
  DROP CONSTRAINT IF EXISTS scp_interview_pilot_revocation_check;
ALTER TABLE public.scp_interview_pack_pilot_grants
  ADD CONSTRAINT scp_interview_pilot_revocation_check
  CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL));

-- A grant that never ends is not a pilot. Existing rows get a bounded window.
UPDATE public.scp_interview_pack_pilot_grants
   SET expires_on = coalesce(expires_on, (granted_at + interval '90 days')::date)
 WHERE expires_on IS NULL;

ALTER TABLE public.scp_interview_pack_pilot_grants
  ALTER COLUMN expires_on SET NOT NULL;

ALTER TABLE public.scp_interview_pack_pilot_grants
  DROP CONSTRAINT IF EXISTS scp_interview_pilot_window_check;
ALTER TABLE public.scp_interview_pack_pilot_grants
  ADD CONSTRAINT scp_interview_pilot_window_check CHECK (expires_on > starts_on);

COMMENT ON TABLE public.scp_interview_pack_pilot_grants IS
  'A TIME-BOXED, environment-scoped, optionally cohort-limited authorisation for '
  'ONE employer to use ONE unpublished pack version. It does not change the '
  'pack''s content_status, does not change its validation_label, does not '
  'satisfy any of the four publication review gates, and expires on its own. '
  'A production-environment grant additionally requires the pack to have passed '
  'expert and legal review -- see scp_interview_guard_pilot_grant().';


-- ---------------------------------------------------------------------------
-- 3.1  What a grant may and may not authorise.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_guard_pilot_grant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _status text;
  _expert boolean;
  _legal boolean;
BEGIN
  SELECT content_status INTO _status
    FROM public.scp_interview_pack_versions WHERE id = NEW.pack_version_id;

  -- A published pack needs no grant. Issuing one implies the pack is
  -- unpublished, and silently granting against a published version would make
  -- the audit trail lie about why it was reachable.
  IF _status = 'published' THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_PILOT_UNNECESSARY: pack version is already published and needs no pilot grant.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _status IN ('retired', 'suspended') THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_PILOT_ON_WITHDRAWN_PACK: pack version is "%" and cannot be piloted.', _status
      USING ERRCODE = 'check_violation';
  END IF;

  -- A PRODUCTION pilot on unpublished content is the highest-risk case the
  -- product allows, so it carries the strictest precondition: the expert and
  -- legal gates must already have passed at the current content hash. It still
  -- does not publish the pack -- cognitive and product review remain outstanding
  -- and the pack keeps saying it is a hypothesis.
  IF NEW.environment = 'production' THEN
    SELECT
      EXISTS (SELECT 1 FROM public.scp_interview_pack_reviews r
               WHERE r.pack_version_id = NEW.pack_version_id AND r.gate = 'expert'
                 AND r.decision = 'approved'
                 AND r.content_hash_at_review = public.scp_interview_pack_content_hash(NEW.pack_version_id)),
      EXISTS (SELECT 1 FROM public.scp_interview_pack_reviews r
               WHERE r.pack_version_id = NEW.pack_version_id AND r.gate = 'legal'
                 AND r.decision = 'approved'
                 AND r.content_hash_at_review = public.scp_interview_pack_content_hash(NEW.pack_version_id))
      INTO _expert, _legal;

    IF NOT _expert OR NOT _legal THEN
      RAISE EXCEPTION
        'SCP_INTERVIEW_PILOT_PRODUCTION_BLOCKED: a production pilot on unpublished content requires the expert and legal gates approved at the CURRENT content hash (expert=%, legal=%). A pilot grant is not a way around review.',
        _expert, _legal USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_interview_guard_pilot_grant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_interview_pack_pilot_grants_guard ON public.scp_interview_pack_pilot_grants;
CREATE TRIGGER scp_interview_pack_pilot_grants_guard
  BEFORE INSERT OR UPDATE ON public.scp_interview_pack_pilot_grants
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_guard_pilot_grant();


-- ---------------------------------------------------------------------------
-- 3.2  The entitlement decision, in one place.
--
--      Replaces the inline EXISTS that scp_iv_create_case used, so expiry,
--      environment and cohort are enforced everywhere rather than in whichever
--      query happened to remember them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_interview_pilot_grant_active(
  _employer_id uuid, _pack_version_id uuid, _user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.scp_interview_pack_pilot_grants g
     WHERE g.employer_id = _employer_id
       AND g.pack_version_id = _pack_version_id
       AND g.revoked_at IS NULL
       AND current_date >= g.starts_on
       AND current_date < g.expires_on
       -- An empty cohort means "the whole employer". A non-empty one is an
       -- allowlist, and a user outside it gets nothing.
       AND (coalesce(array_length(g.cohort_user_ids, 1), 0) = 0
            OR _user_id IS NULL
            OR _user_id = ANY (g.cohort_user_ids)));
$$;

REVOKE ALL ON FUNCTION public.scp_interview_pilot_grant_active(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_pilot_grant_active(uuid, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_interview_pilot_grant_active(uuid, uuid, uuid) IS
  'The single entitlement decision for unpublished pack content: live grant, '
  'inside its date window, and the user inside the cohort allowlist if one is '
  'set. Expiry is checked here rather than at grant time so a grant stops '
  'working on its own, without anybody having to remember to revoke it.';


-- Route the case-creation RPC and the employer read entitlement through it.
CREATE OR REPLACE FUNCTION public.scp_iv_employer_may_read_pack(_pack_version_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    (EXISTS (SELECT 1 FROM public.scp_interview_pack_versions v
              WHERE v.id = _pack_version_id AND v.content_status = 'published')
     AND EXISTS (SELECT 1 FROM public.employer_memberships em
                  WHERE em.user_id = auth.uid() AND em.status = 'active'))
    -- Now expiry- and cohort-aware.
    OR EXISTS (SELECT 1 FROM public.employer_memberships em
               WHERE em.user_id = auth.uid() AND em.status = 'active'
                 AND public.scp_interview_pilot_grant_active(em.employer_id, _pack_version_id, auth.uid()))
    OR EXISTS (SELECT 1 FROM public.scp_interview_cases c
                JOIN public.employer_memberships em ON em.employer_id = c.employer_id
               WHERE c.pack_version_id = _pack_version_id
                 AND em.user_id = auth.uid() AND em.status = 'active')
  );
$$;

REVOKE ALL ON FUNCTION public.scp_iv_employer_may_read_pack(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_employer_may_read_pack(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.scp_iv_create_case(
  _employer_id uuid, _title text, _pack_version_id uuid, _candidate_display_name text,
  _candidate_user_id uuid DEFAULT NULL, _candidate_external_ref text DEFAULT NULL,
  _job_id uuid DEFAULT NULL, _application_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _pack public.scp_interview_pack_versions%ROWTYPE;
  _usable boolean;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner','admin','member']) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_EMPLOYER_MEMBER: creating an interview case requires an active membership of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _pack FROM public.scp_interview_pack_versions WHERE id = _pack_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_PACK_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  _usable := _pack.content_status = 'published'
          OR public.scp_interview_pilot_grant_active(_employer_id, _pack_version_id, auth.uid());

  IF NOT _usable THEN
    RAISE EXCEPTION
      'SCP_IV_PACK_NOT_USABLE: pack version is "%" and this employer holds no live, in-window pilot grant covering you for it.',
      _pack.content_status USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _job_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_IV_CROSS_TENANT_JOB: that job belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _application_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.job_applications a
        WHERE a.id = _application_id AND a.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_IV_CROSS_TENANT_APPLICATION: that application belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_external_ref,
     candidate_display_name, pack_version_id, role_version_id, pack_content_hash, title, created_by)
  VALUES
    (_employer_id, _job_id, _application_id, _candidate_user_id, _candidate_external_ref,
     _candidate_display_name, _pack_version_id, _pack.role_version_id, _pack.content_hash,
     _title, auth.uid())
  RETURNING id INTO _id;

  PERFORM public.scp_iv_record_event(_id, 'case_created', 'human', NULL, NULL, 'draft', NULL,
    jsonb_build_object('pack_version_id', _pack_version_id,
                       'pack_content_status', _pack.content_status,
                       'validation_label', _pack.validation_label,
                       'used_pilot_grant', _pack.content_status <> 'published'));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid)
  TO authenticated, service_role;


-- Grants and revocations are audited like everything else that changes what a
-- product may do.
CREATE OR REPLACE FUNCTION public.scp_interview_pilot_grant_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.scp_interview_pack_events
    (pack_id, pack_version_id, event, actor_id, previous_status, new_status, reason, metadata)
  SELECT v.pack_id, v.id,
         CASE WHEN TG_OP = 'INSERT' THEN 'draft_updated' ELSE 'draft_updated' END,
         auth.uid(), NULL, NULL,
         CASE WHEN TG_OP = 'INSERT' THEN NEW.rationale ELSE NEW.revocation_reason END,
         jsonb_build_object(
           'pilot_grant', CASE WHEN TG_OP = 'INSERT' THEN 'granted' ELSE 'updated' END,
           'employer_id', NEW.employer_id,
           'usage_mode', NEW.usage_mode,
           'environment', NEW.environment,
           'starts_on', NEW.starts_on,
           'expires_on', NEW.expires_on,
           'cohort_size', coalesce(array_length(NEW.cohort_user_ids, 1), 0),
           'revoked', NEW.revoked_at IS NOT NULL)
    FROM public.scp_interview_pack_versions v
   WHERE v.id = NEW.pack_version_id;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_interview_pilot_grant_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_interview_pack_pilot_grants_audit ON public.scp_interview_pack_pilot_grants;
CREATE TRIGGER scp_interview_pack_pilot_grants_audit
  AFTER INSERT OR UPDATE ON public.scp_interview_pack_pilot_grants
  FOR EACH ROW EXECUTE FUNCTION public.scp_interview_pilot_grant_audit();


-- ###########################################################################
-- SECTION 4 -- Fail-fast assertions
-- ###########################################################################

DO $assert$
DECLARE _n integer; _strength text;
BEGIN
  -- 1. No claim asserts strength its source cannot support.
  SELECT count(*) INTO _n
    FROM public.scp_research_claims c
    JOIN public.scp_research_sources s ON s.id = c.source_id
   WHERE s.access_status <> 'verified_read'
     AND c.evidence_strength NOT IN ('pending_source_verification', 'insufficient');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IIH_ASSERT: % claim(s) still assert strength from an unread source.', _n;
  END IF;

  -- 2. The specific over-statement found in review is actually corrected.
  SELECT evidence_strength INTO _strength
    FROM public.scp_research_claims WHERE slug = 'claim-structured-same-questions';
  IF _strength <> 'pending_source_verification' THEN
    RAISE EXCEPTION
      'SCP_IIH_ASSERT: claim-structured-same-questions is "%", expected pending_source_verification (its source has not been read).',
      _strength;
  END IF;

  -- 3. No approved implication rests on an unread source.
  SELECT count(*) INTO _n
    FROM public.scp_research_implications i
    JOIN public.scp_research_claims c ON c.id = i.claim_id
    JOIN public.scp_research_sources s ON s.id = c.source_id
   WHERE i.approval_status = 'approved' AND s.access_status <> 'verified_read';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IIH_ASSERT: % approved implication(s) rest on an unread source.', _n;
  END IF;

  -- 4. Every edge carries an assurance level, and none over-claims.
  SELECT count(*) INTO _n FROM public.scp_intel_edges WHERE assurance IS NULL;
  IF _n <> 0 THEN RAISE EXCEPTION 'SCP_IIH_ASSERT: % edge(s) have no assurance.', _n; END IF;

  SELECT count(*) INTO _n
    FROM public.scp_intel_edges e
    JOIN public.scp_research_claims c
      ON (e.from_kind = 'research_claim' AND e.from_id = c.id)
      OR (e.to_kind = 'research_claim' AND e.to_id = c.id)
    JOIN public.scp_research_sources s ON s.id = c.source_id
   WHERE s.access_status <> 'verified_read'
     AND e.assurance IN ('verified', 'expert_reviewed');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IIH_ASSERT: % edge(s) claim verified assurance from an unread source.', _n;
  END IF;

  -- 5. No competency mapping edge claims confirmed status while the mapping is
  --    provisional. This is the "invented scientific equivalence" check.
  SELECT count(*) INTO _n
    FROM public.scp_intel_edges e
   WHERE e.relation = 'maps_to' AND e.from_kind = 'interview_competency'
     AND e.assurance IN ('verified', 'expert_reviewed');
  IF _n <> 0 THEN
    RAISE EXCEPTION
      'SCP_IIH_ASSERT: % competency-mapping edge(s) claim confirmed assurance while the mappings are provisional.', _n;
  END IF;

  -- 6. The graph still carries no weight column.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'scp_intel_edges'
     AND (column_name LIKE '%weight%' OR column_name LIKE '%score%'
          OR column_name LIKE '%strength%');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IIH_ASSERT: the intelligence graph gained a numeric edge column.';
  END IF;

  -- 7. Every pilot grant is time-boxed.
  SELECT count(*) INTO _n FROM public.scp_interview_pack_pilot_grants WHERE expires_on IS NULL;
  IF _n <> 0 THEN RAISE EXCEPTION 'SCP_IIH_ASSERT: % pilot grant(s) never expire.', _n; END IF;

  -- 8. The Vaktare pack is STILL a draft hypothesis. Nothing in this migration
  --    may have promoted it.
  IF NOT EXISTS (
    SELECT 1 FROM public.scp_interview_pack_versions v
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
     WHERE p.slug = 'vaktare-se' AND v.content_status = 'draft'
       AND v.validation_label = 'pilot_hypothesis') THEN
    RAISE EXCEPTION 'SCP_IIH_ASSERT: the Vaktare pack is no longer a draft pilot hypothesis.';
  END IF;

  RAISE NOTICE 'SCP_IIH_ASSERT: integrity hardening verified. % edges carry assurance; % sources read of %.',
    (SELECT count(*) FROM public.scp_intel_edges),
    (SELECT count(*) FROM public.scp_research_sources WHERE access_status = 'verified_read'),
    (SELECT count(*) FROM public.scp_research_sources);
END
$assert$;


-- ###########################################################################
-- SECTION 5 -- The prohibition graph, made fail-closed
-- ###########################################################################
--
-- The review asked whether any edge asserts a relationship nobody established.
-- Working through the 216 edges by relation found the opposite problem in the
-- one relation where it matters most.
--
-- "restricts" held 99 edges: 9 of the 14 prohibited areas, each wired to all 11
-- AI tasks. The remaining 5 areas were wired to nothing at all --
--
--   inga_ledande_fragor              (no leading follow-up questions)
--   inga_anklagande_fragor           (no accusatory follow-up questions)
--   inga_trovardighetsfragor         (no credibility-judging remarks)
--   inga_hypotetiska_valdsscenarier  (no hypothetical force scenarios)
--   inga_irrelevanta_personuppgifter (no irrelevant personal data)
--
-- -- because they read as rules for the interviewer in the room. They are not.
-- Probes are selected by id, so no task can invent a probe; but the preparation
-- and report schemas carry free prose (roleSummary, openingGuidance,
-- closingGuidance, item descriptions) that a recruiter reads out or acts on.
-- Guidance telling a recruiter to press a candidate on why they broke a rule is
-- the prohibited question delivered one step removed.
--
-- The fix is not to guess which of the five bind which of the eleven. That
-- judgement is exactly the kind of invented relationship the review is looking
-- for. Instead the relation is made COMPLETE and the absence of an edge is made
-- impossible: every prohibited area restricts every AI task, and a guard
-- refuses to let a pair be deleted. Narrowing a prohibition then becomes a
-- deliberate, reviewable act rather than an omission nobody notices.
--
-- 14 x 11 = 154 restricts edges. Total graph: 271.
-- ---------------------------------------------------------------------------

INSERT INTO public.scp_intel_edges (from_kind, from_id, relation, to_kind, to_id, assurance, note)
SELECT 'prohibited_area', a.id, 'restricts', 'ai_task', t.id, 'verified',
       'Fail-closed: every governed prohibition binds every AI task unless an '
       'explicit, reviewed narrowing says otherwise.'
  FROM public.scp_interview_prohibited_areas a
 CROSS JOIN public.scp_ai_tasks t
 WHERE NOT EXISTS (
   SELECT 1 FROM public.scp_intel_edges e
    WHERE e.relation = 'restricts' AND e.from_id = a.id AND e.to_id = t.id);


CREATE OR REPLACE FUNCTION public.scp_intel_guard_prohibition_coverage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Deleting a restricts edge silently un-prohibits something. If a
  -- prohibition genuinely does not apply to a task, that is recorded by
  -- superseding the edge with a reason, not by removing it.
  IF OLD.relation = 'restricts' THEN
    RAISE EXCEPTION
      'SCP_INTEL_PROHIBITION_COVERAGE: a "restricts" edge cannot be deleted. To narrow a prohibition, set assurance = ''superseded'' with an assurance_note and a superseded_by edge, so the narrowing is visible and attributable.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END; $$;

REVOKE ALL ON FUNCTION public.scp_intel_guard_prohibition_coverage() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_intel_edges_prohibition_coverage ON public.scp_intel_edges;
CREATE TRIGGER scp_intel_edges_prohibition_coverage
  BEFORE DELETE ON public.scp_intel_edges
  FOR EACH ROW EXECUTE FUNCTION public.scp_intel_guard_prohibition_coverage();


-- The three conduct prohibitions the engine can now actually breach in prose
-- are enforced in the policy layer as of policy version 1.1.0. Recording the
-- version on the tasks keeps the database's claim and the code's behaviour in
-- step; a task asserting a policy version the code does not implement is the
-- kind of quiet drift this whole domain exists to prevent.
UPDATE public.scp_ai_tasks SET policy_version = '1.1.0' WHERE policy_version = '1.0.0';


DO $assert5$
DECLARE _n integer; _areas integer; _tasks integer;
BEGIN
  SELECT count(*) INTO _areas FROM public.scp_interview_prohibited_areas;
  SELECT count(*) INTO _tasks FROM public.scp_ai_tasks;
  SELECT count(*) INTO _n FROM public.scp_intel_edges WHERE relation = 'restricts';

  IF _n <> _areas * _tasks THEN
    RAISE EXCEPTION
      'SCP_IIH_ASSERT: prohibition coverage is incomplete -- % edges for % areas x % tasks. An unwired prohibition reads as permission.',
      _n, _areas, _tasks;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_ai_tasks WHERE policy_version <> '1.1.0') THEN
    RAISE EXCEPTION 'SCP_IIH_ASSERT: an AI task claims a policy version the code does not implement.';
  END IF;

  RAISE NOTICE 'SCP_IIH_ASSERT: prohibition graph complete -- % areas x % tasks = % restricts edges; % edges total.',
    _areas, _tasks, _n, (SELECT count(*) FROM public.scp_intel_edges);
END
$assert5$;


-- ###########################################################################
-- SECTION 6 -- Withheld source material, recorded and shown
-- ###########################################################################
--
-- The orchestrator now screens untrusted passages before any provider sees
-- them, and withholds the ones that carry text addressed to the system rather
-- than information about the candidate (src/lib/interview-intelligence/ai/
-- injection.ts).
--
-- That control has to be visible. A recruiter who is handed a preparation plan
-- built from six of a CV's seven paragraphs, and is not told about the seventh,
-- has been given an incomplete picture by a system that knew it was incomplete.
-- Worse, the withheld paragraph is exactly the one a person most needs to read
-- for themselves — someone tried to manipulate the assessment, and that is
-- information about the application.
--
-- So the run records what it withheld and why, and the case screen shows it.
-- ---------------------------------------------------------------------------

-- The ledger needs a name for it. Withholding source material is not an AI
-- result and not a failure -- it is a distinct thing that happened, and
-- folding it into ai_run_failed would hide it among ordinary provider errors.
ALTER TABLE public.scp_interview_case_events
  DROP CONSTRAINT IF EXISTS scp_interview_case_events_event_check;
ALTER TABLE public.scp_interview_case_events
  ADD CONSTRAINT scp_interview_case_events_event_check CHECK (event IN (
    'case_created','source_added','source_erased','transcript_authorised',
    'ai_run_started','ai_run_succeeded','ai_run_failed','source_passage_withheld',
    'prep_generated','prep_edited','prep_approved','interview_started',
    'interview_paused','interview_resumed','interview_completed','probe_used',
    'evidence_proposed','evidence_confirmed','evidence_edited','evidence_rejected',
    'evidence_authored','finding_recorded','finding_resolved','assessment_recorded',
    'assessment_superseded','report_drafted','report_finalised','case_cancelled',
    'retention_applied'));

ALTER TABLE public.scp_interview_ai_runs
  ADD COLUMN IF NOT EXISTS withheld_passages jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.scp_interview_ai_runs
  DROP CONSTRAINT IF EXISTS scp_interview_ai_runs_withheld_is_array;
ALTER TABLE public.scp_interview_ai_runs
  ADD CONSTRAINT scp_interview_ai_runs_withheld_is_array
  CHECK (jsonb_typeof(withheld_passages) = 'array');

COMMENT ON COLUMN public.scp_interview_ai_runs.withheld_passages IS
  'Passages screened out before the provider was called: [{passageId, reason, '
  'trigger, excerpt}]. Holds the ATTACK text, not candidate assessment data — '
  'it is source material quoted back so a human can judge the screen''s '
  'decision. An empty array means nothing was withheld, which is the ordinary '
  'case and must be distinguishable from "the screen did not run".';

CREATE OR REPLACE FUNCTION public.scp_iv_ai_run_settle(
  _run_id uuid, _status text, _failure_reason text DEFAULT NULL,
  _abstention_reason text DEFAULT NULL, _raw_response jsonb DEFAULT NULL,
  _input_tokens integer DEFAULT NULL, _output_tokens integer DEFAULT NULL,
  _latency_ms integer DEFAULT NULL, _cost_micros integer DEFAULT NULL,
  _withheld_passages jsonb DEFAULT '[]'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _case_id uuid; _withheld integer;
BEGIN
  SELECT case_id INTO _case_id FROM public.scp_interview_ai_runs WHERE id = _run_id;
  IF _case_id IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_RUN_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  _withheld := jsonb_array_length(coalesce(_withheld_passages, '[]'::jsonb));

  UPDATE public.scp_interview_ai_runs
     SET status = _status,
         failure_reason = _failure_reason,
         abstention_reason = _abstention_reason,
         raw_response = _raw_response,
         input_tokens = _input_tokens,
         output_tokens = _output_tokens,
         latency_ms = _latency_ms,
         cost_micros = _cost_micros,
         withheld_passages = coalesce(_withheld_passages, '[]'::jsonb),
         finished_at = now()
   WHERE id = _run_id;

  PERFORM public.scp_iv_record_event(_case_id,
    CASE WHEN _status = 'succeeded' THEN 'ai_run_succeeded' ELSE 'ai_run_failed' END,
    'ai', _run_id, NULL, NULL, coalesce(_failure_reason, _abstention_reason),
    jsonb_build_object('status', _status, 'withheld_passages', _withheld));

  -- A withholding is its own event. It is not an AI result, it is a fact about
  -- the application, and it belongs in the ledger where a person will see it
  -- even if they never open the run.
  IF _withheld > 0 THEN
    PERFORM public.scp_iv_record_event(_case_id, 'source_passage_withheld', 'system',
      _run_id, NULL, NULL,
      'Underlag undanhölls AI-stödet: text riktad till systemet i stället för information om kandidaten.',
      jsonb_build_object('withheld_passages', _withheld,
                         'reasons', (SELECT jsonb_agg(DISTINCT p->>'reason')
                                       FROM jsonb_array_elements(_withheld_passages) p)));
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer, jsonb)
  TO authenticated, service_role;

-- The 9-argument form is superseded. Dropping it rather than leaving it in
-- place means no caller can quietly settle a run without saying what it
-- withheld.
DROP FUNCTION IF EXISTS public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer);
