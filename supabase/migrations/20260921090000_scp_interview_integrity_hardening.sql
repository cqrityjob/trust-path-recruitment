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

-- The permitted values are declared ONCE, in section 11, which splits
-- "verified" into the several different things it was being used to mean. This
-- section used to declare them too, and two declarations of the same list in
-- one migration is how a re-run fails against its own output.

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
   SET assurance = 'structurally_derived',
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
   SET assurance = CASE WHEN s.access_status = 'verified_read' THEN 'source_read'
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
   SET assurance = 'structurally_derived',
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

  RAISE NOTICE 'SCP_IIH_ASSERT: integrity hardening verified. % knowledge edges carry assurance; % sources read of %.',
    (SELECT count(*) FROM public.scp_intel_edges WHERE employer_id IS NULL),
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
SELECT 'prohibited_area', a.id, 'restricts', 'ai_task', t.id, 'structurally_derived',
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

  RAISE NOTICE 'SCP_IIH_ASSERT: prohibition graph complete -- % areas x % tasks = % restricts edges; % knowledge edges total.',
    _areas, _tasks, _n, (SELECT count(*) FROM public.scp_intel_edges WHERE employer_id IS NULL);
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

-- The ledger needs a name for withholding source material: it is not an AI
-- result and not a failure, and folding it into ai_run_failed would hide it
-- among ordinary provider errors.
--
-- The event list itself is declared ONCE, in section 7, which also renames two
-- transitions. It used to be declared here as well, and that earlier copy
-- predated the renames -- so on a re-run this statement rebuilt the constraint
-- without 'sources_marked_ready', section 7 had already written rows using it,
-- and the migration failed against its own output. A list of permitted values
-- gets one home.

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


-- ###########################################################################
-- SECTION 7 -- What walking the journey in a browser turned up
-- ###########################################################################
--
-- Three defects, all of the same family: the ledger and the report screen each
-- described the process slightly differently from how it actually ran. For a
-- product whose entire claim is traceability, a ledger that misnames what
-- happened is not cosmetic.
-- ---------------------------------------------------------------------------

-- 7.1  The report screen offered an action the database would refuse.
--
-- scp_iv_report_blockers() answered "nothing blocks the report" while the case
-- was still in evidence_review, so the screen showed a green panel and a
-- "Finalise" button, and the click came back as
--   SCP_IV_ILLEGAL_TRANSITION: "evidence_review" -> "reported"
-- -- an untranslated internal error in a Swedish interface, for a step the
-- product had just told the user was ready.
--
-- The screen was not wrong to trust the blocker list. The blocker list was
-- incomplete: it checked the CONTENT preconditions and left the STATE
-- precondition to the transition guard, so neither knew the whole answer. It
-- now owns both, and every caller inherits the fix.
CREATE OR REPLACE FUNCTION public.scp_iv_report_blockers(_case_id uuid)
RETURNS TABLE (code text, message text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.scp_interview_cases%ROWTYPE;
BEGIN
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'CASE_NOT_FOUND', 'Intervjun finns inte.';
    RETURN;
  END IF;

  IF NOT public.scp_iv_can_read_case(_case_id) THEN
    RETURN QUERY SELECT 'NOT_PERMITTED', 'Du saknar behörighet till den här intervjun.';
    RETURN;
  END IF;

  -- The state precondition, stated in the user's language rather than left to
  -- surface as a transition error after the button is pressed.
  IF _c.status NOT IN ('assessed', 'reported') THEN
    RETURN QUERY SELECT 'ASSESSMENT_NOT_COMPLETE',
      'Bedömningen är inte markerad som klar. Gå till Evidens och välj "Klar med bedömningen" när varje fråga har en bedömning.';
  END IF;

  RETURN QUERY
    SELECT 'QUESTION_NOT_ASSESSED',
           format('%s har ingen registrerad mänsklig bedömning.', q.code)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _c.pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_assessments a
                        WHERE a.case_id = _case_id AND a.question_id = q.id
                          AND a.superseded_by IS NULL);

  RETURN QUERY
    SELECT 'PROPOSALS_AWAITING_REVIEW',
           format('%s AI-förslag har inte granskats av en människa.', count(*)::text)
      FROM public.scp_interview_evidence_proposals p
     WHERE p.case_id = _case_id AND p.review_state = 'pending'
    HAVING count(*) > 0;

  RETURN;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_report_blockers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_report_blockers(uuid) TO authenticated, service_role;


-- 7.2  Two ledger entries named something other than what happened.
--
--   * Marking the sources complete (draft -> sources_ready) was recorded as
--     "source_added", so the trail showed three sources added when two were.
--   * Opening evidence review (interview_complete -> evidence_review) was
--     recorded as "evidence_proposed" by a human -- so a run that abstained and
--     proposed nothing still left an entry saying evidence had been proposed,
--     attributed to a person who had proposed none of it.
--
-- Both are state transitions and now say so. An auditor reading this trail is
-- reconstructing what a person did before a hiring decision; it has to be
-- literally true.
ALTER TABLE public.scp_interview_case_events
  DROP CONSTRAINT IF EXISTS scp_interview_case_events_event_check;
ALTER TABLE public.scp_interview_case_events
  ADD CONSTRAINT scp_interview_case_events_event_check CHECK (event IN (
    'case_created','source_added','sources_marked_ready','source_erased',
    'transcript_authorised','ai_run_started','ai_run_succeeded','ai_run_failed',
    'source_passage_withheld','prep_generated','prep_edited','prep_approved',
    'interview_started','interview_paused','interview_resumed','interview_completed',
    'probe_used','evidence_review_opened','evidence_proposed','evidence_confirmed',
    'evidence_edited','evidence_rejected','evidence_authored','finding_recorded',
    'finding_resolved','assessment_recorded','assessment_superseded','report_drafted',
    'report_finalised','case_cancelled','retention_applied'));

CREATE OR REPLACE FUNCTION public.scp_iv_mark_sources_ready(_case_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT count(*) INTO _n FROM public.scp_interview_case_sources
   WHERE case_id = _case_id AND retention_state = 'active';
  IF _n = 0 THEN
    RAISE EXCEPTION
      'SCP_IV_NO_SOURCES: a preparation brief grounded in nothing is not a brief. Add at least one source.'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public.scp_iv_set_case_status(_case_id, 'sources_ready');
  PERFORM public.scp_iv_record_event(_case_id, 'sources_marked_ready', 'human', NULL,
    'draft', 'sources_ready', NULL, jsonb_build_object('source_count', _n));
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_mark_sources_ready(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_mark_sources_ready(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.scp_iv_begin_evidence_review(_case_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.scp_iv_set_case_status(_case_id, 'evidence_review');
  PERFORM public.scp_iv_record_event(_case_id, 'evidence_review_opened', 'human', NULL,
    'interview_complete', 'evidence_review');
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_begin_evidence_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_begin_evidence_review(uuid) TO authenticated, service_role;

-- Existing rows are NOT corrected, deliberately.
--
-- The first version of this migration tried to UPDATE the mislabelled rows and
-- was refused by scp_iv_guard_event_append_only() -- which is the guard doing
-- exactly its job. On reflection the guard is also right on the merits: a
-- ledger that can be tidied up later is not a ledger, and "we only rewrote it
-- to make it more accurate" is the justification every such rewrite gives.
--
-- So the old entries keep their old names, the new names apply from here, and
-- anyone reading a trail that spans this migration can see both. That is the
-- honest shape of a correction to an append-only record.

DO $assert7$
DECLARE _blockers integer;
BEGIN
  -- The naming fix is proved forward, on the functions, not by rewriting rows.
  IF position('sources_marked_ready' in
        pg_get_functiondef('public.scp_iv_mark_sources_ready(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SCP_IIH_ASSERT: marking sources ready still records "source_added".';
  END IF;
  IF position('evidence_review_opened' in
        pg_get_functiondef('public.scp_iv_begin_evidence_review(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SCP_IIH_ASSERT: opening evidence review still records "evidence_proposed".';
  END IF;
  IF position('ASSESSMENT_NOT_COMPLETE' in
        pg_get_functiondef('public.scp_iv_report_blockers(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SCP_IIH_ASSERT: the blocker list still ignores the state precondition.';
  END IF;

  RAISE NOTICE 'SCP_IIH_ASSERT: ledger entries name what happened; report blockers own the state precondition.';
END
$assert7$;


-- ###########################################################################
-- SECTION 8 -- Privacy controls that exist rather than are declared
-- ###########################################################################
--
-- Auditing the transcript and retention model against the review found three
-- controls that the schema DESCRIBES and nothing IMPLEMENTS. That is worse
-- than not having them: a column called retention_state looks like a retention
-- control to anyone reading the schema, and answers a due-diligence question
-- with something that has never run.
--
--   1. The transcript gate raised "...has met its information/consent
--      obligations" while checking a single free-text lawful-basis field.
--      Having a lawful basis and having told the candidate are different
--      obligations, and the message asserted a check that did not exist.
--   2. scp_interview_cases.retain_until was declared and never referenced --
--      never set, never required, never enforced anywhere in the codebase.
--   3. retention_state = 'erased', erased_at and the 'source_erased' event
--      were all modelled, and NO FUNCTION COULD REACH THEM. There was no way
--      to erase a source at all.
--
-- None of this is a claim of legal compliance. See §11 of the final report for
-- what still requires legal and DPIA review.
-- ---------------------------------------------------------------------------

ALTER TABLE public.scp_interview_cases
  ADD COLUMN IF NOT EXISTS candidate_informed_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS candidate_informed_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS candidate_informed_statement text,
  ADD COLUMN IF NOT EXISTS transcript_purpose_code text,
  ADD COLUMN IF NOT EXISTS retention_set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retention_set_at timestamptz;

COMMENT ON COLUMN public.scp_interview_cases.candidate_informed_statement IS
  'A SEPARATE confirmation from the lawful basis: what the candidate was told, '
  'when and how. Recorded apart because "we have a lawful basis" and "we told '
  'the person" are different obligations and one free-text box covering both '
  'lets either go unanswered.';


-- 8.1  Four confirmations before a transcript, not one.
CREATE OR REPLACE FUNCTION public.scp_iv_confirm_transcript_basis(
  _case_id uuid,
  _statement text,
  _candidate_informed_statement text DEFAULT NULL,
  _purpose_code text DEFAULT NULL,
  _retain_until date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_employer_role(
       auth.uid(), public.scp_iv_case_employer(_case_id), ARRAY['owner','admin']) THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_CONFIRM_ROLE: confirming a lawful basis for transcript processing requires an employer owner or admin, not any member.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _statement IS NULL OR btrim(_statement) = '' THEN
    RAISE EXCEPTION 'SCP_IV_TRANSCRIPT_STATEMENT_REQUIRED: state the lawful basis in writing.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _candidate_informed_statement IS NULL OR btrim(_candidate_informed_statement) = '' THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_CANDIDATE_NOT_INFORMED: state separately what the candidate was told about the recording, when and how. A lawful basis is not the same obligation as informing the person.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _purpose_code IS NULL OR btrim(_purpose_code) = '' THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_PURPOSE_REQUIRED: name the permitted purpose. A transcript processed for an unstated purpose can be used for any purpose later.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Retention has to be a decision someone made, not a field left blank. An
  -- open-ended retention period is indistinguishable from keeping it forever.
  IF _retain_until IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_RETENTION_REQUIRED: set a date after which this material is no longer kept.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _retain_until <= current_date THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_RETENTION_IN_PAST: the retention date must be in the future.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('scp_iv.governed_transition', 'on', true);
  UPDATE public.scp_interview_cases
     SET transcript_lawful_basis_confirmed_at = now(),
         transcript_lawful_basis_confirmed_by = auth.uid(),
         transcript_lawful_basis_statement = btrim(_statement),
         candidate_informed_confirmed_at = now(),
         candidate_informed_confirmed_by = auth.uid(),
         candidate_informed_statement = btrim(_candidate_informed_statement),
         transcript_purpose_code = btrim(_purpose_code),
         retain_until = _retain_until,
         retention_set_by = auth.uid(),
         retention_set_at = now(),
         updated_at = now()
   WHERE id = _case_id;
  PERFORM set_config('scp_iv.governed_transition', 'off', true);

  PERFORM public.scp_iv_record_event(_case_id, 'transcript_authorised', 'human', NULL, NULL, NULL,
    btrim(_statement),
    jsonb_build_object('candidate_informed', true,
                       'purpose_code', btrim(_purpose_code),
                       'retain_until', _retain_until));
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_confirm_transcript_basis(uuid, text, text, text, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_confirm_transcript_basis(uuid, text, text, text, date)
  TO authenticated, service_role;

-- The two-argument form is dropped, not left alongside. Leaving it would mean
-- the weaker gate stays reachable and the stronger one is merely available.
DROP FUNCTION IF EXISTS public.scp_iv_confirm_transcript_basis(uuid, text);


-- 8.2  The gate checks all four, and stops claiming what it does not check.
CREATE OR REPLACE FUNCTION public.scp_iv_guard_transcript_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _enabled boolean; _c public.scp_interview_cases%ROWTYPE;
BEGIN
  IF NEW.source_kind <> 'transcript' THEN RETURN NEW; END IF;

  SELECT transcript_enabled INTO _enabled FROM public.scp_interview_ai_config WHERE id;
  IF NOT coalesce(_enabled, false) THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_DISABLED: transcript ingestion is switched off for this deployment. It is an owner decision, not a per-case setting.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = NEW.case_id;

  IF _c.transcript_lawful_basis_confirmed_at IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_NO_LAWFUL_BASIS: this case has no recorded lawful basis for transcript processing.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _c.candidate_informed_confirmed_at IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_CANDIDATE_NOT_INFORMED: no confirmation that the candidate was told about the recording.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _c.transcript_purpose_code IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_TRANSCRIPT_PURPOSE_REQUIRED: no permitted purpose recorded.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _c.retain_until IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_TRANSCRIPT_RETENTION_REQUIRED: no retention date recorded.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_transcript_gate() FROM PUBLIC, anon, authenticated;


-- 8.3  Erasure, which previously could not happen at all.
--
-- What erasure does and does not reach is stated rather than implied, because
-- "erased" that quietly leaves the text somewhere is the worst outcome here:
--
--   ERASED   the source text, and the text of every passage split from it.
--            The rows remain, holding no content, so the audit trail still
--            shows that a source existed and was erased.
--   ERASED   AI proposals quoting it. A layer-4 proposal is a machine's
--            unreviewed reading of the erased text; keeping it keeps the text.
--   KEPT     evidence a human CONFIRMED, and any finalised report. These are
--            the employer's record of a judgement a named person made, they
--            have their own retention basis and their own legal weight, and
--            silently rewriting them would corrupt the account of a decision
--            that has already been taken. Erasing those is a separate,
--            deliberate act with its own authority -- not a side effect.
--
-- The candidate-facing consequence of that boundary is a legal question, not a
-- technical one, and it is listed for DPIA review rather than settled here.
CREATE OR REPLACE FUNCTION public.scp_iv_erase_source(_source_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _case_id uuid; _passages integer; _proposals integer;
BEGIN
  SELECT case_id INTO _case_id FROM public.scp_interview_case_sources WHERE id = _source_id;
  IF _case_id IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_SOURCE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  IF auth.uid() IS NULL OR NOT public.has_employer_role(
       auth.uid(), public.scp_iv_case_employer(_case_id), ARRAY['owner','admin']) THEN
    RAISE EXCEPTION
      'SCP_IV_ERASE_ROLE: erasing candidate material requires an employer owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'SCP_IV_ERASE_REASON_REQUIRED: state why this material is being erased.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('scp_iv.governed_transition', 'on', true);

  UPDATE public.scp_interview_source_passages
     SET content = ''
   WHERE source_id = _source_id AND content <> '';
  GET DIAGNOSTICS _passages = ROW_COUNT;

  UPDATE public.scp_interview_evidence_proposals
     SET excerpt = '', relevance_rationale = '[raderat]'
   WHERE source_passage_id IN (
     SELECT id FROM public.scp_interview_source_passages WHERE source_id = _source_id);
  GET DIAGNOSTICS _proposals = ROW_COUNT;

  UPDATE public.scp_interview_case_sources
     SET content_text = '', retention_state = 'erased', erased_at = now()
   WHERE id = _source_id;

  PERFORM set_config('scp_iv.governed_transition', 'off', true);

  -- The fourth argument is _ai_run_id, not a generic subject. An erasure has no
  -- AI run behind it, so it is NULL and the source is named in the metadata.
  PERFORM public.scp_iv_record_event(_case_id, 'source_erased', 'human', NULL, NULL, NULL,
    btrim(_reason),
    jsonb_build_object('source_id', _source_id,
                       'passages_cleared', _passages,
                       'proposals_cleared', _proposals,
                       'confirmed_evidence_kept', true,
                       'reports_kept', true));
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_erase_source(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_erase_source(uuid, text) TO authenticated, service_role;


-- ###########################################################################
-- SECTION 9 -- Which engine ran, recorded rather than inferred
-- ###########################################################################
--
-- The run row named its provider from a hardcoded literal ("mock"), so a real
-- model run would have been recorded as synthetic. And nothing distinguished
-- the deterministic test instrument from a model in a development environment
-- from a model in production -- three situations a reader of the audit trail
-- has to be able to tell apart, because only one of them means the output
-- describes what a language model actually said about a candidate.
-- ---------------------------------------------------------------------------

ALTER TABLE public.scp_interview_ai_runs
  ADD COLUMN IF NOT EXISTS provider_mode text NOT NULL DEFAULT 'synthetic';

ALTER TABLE public.scp_interview_ai_runs
  DROP CONSTRAINT IF EXISTS scp_interview_ai_runs_provider_mode_check;
ALTER TABLE public.scp_interview_ai_runs
  ADD CONSTRAINT scp_interview_ai_runs_provider_mode_check
  CHECK (provider_mode IN ('synthetic', 'development_model', 'production_model'));

COMMENT ON COLUMN public.scp_interview_ai_runs.provider_mode IS
  'synthetic = the deterministic rule-based engine, permitted only in '
  'automated_test / synthetic_development / internal_qa. development_model and '
  'production_model = a real language model, outside and inside production '
  'respectively. Recorded per run because a reader six months later cannot '
  'recover it from a deployment variable nobody kept, and because output from '
  'a rule-based stand-in must never be mistaken for a model''s reading of a '
  'candidate''s material.';

CREATE OR REPLACE FUNCTION public.scp_iv_ai_run_settle(
  _run_id uuid, _status text, _failure_reason text DEFAULT NULL,
  _abstention_reason text DEFAULT NULL, _raw_response jsonb DEFAULT NULL,
  _input_tokens integer DEFAULT NULL, _output_tokens integer DEFAULT NULL,
  _latency_ms integer DEFAULT NULL, _cost_micros integer DEFAULT NULL,
  _withheld_passages jsonb DEFAULT '[]'::jsonb,
  _provider_mode text DEFAULT 'synthetic')
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
         provider_mode = coalesce(_provider_mode, 'synthetic'),
         finished_at = now()
   WHERE id = _run_id;

  PERFORM public.scp_iv_record_event(_case_id,
    CASE WHEN _status = 'succeeded' THEN 'ai_run_succeeded' ELSE 'ai_run_failed' END,
    'ai', _run_id, NULL, NULL, coalesce(_failure_reason, _abstention_reason),
    jsonb_build_object('status', _status,
                       'provider_mode', coalesce(_provider_mode, 'synthetic'),
                       'withheld_passages', _withheld));

  IF _withheld > 0 THEN
    PERFORM public.scp_iv_record_event(_case_id, 'source_passage_withheld', 'system',
      _run_id, NULL, NULL,
      'Underlag undanhölls AI-stödet: text riktad till systemet i stället för information om kandidaten.',
      jsonb_build_object('withheld_passages', _withheld,
                         'reasons', (SELECT jsonb_agg(DISTINCT p->>'reason')
                                       FROM jsonb_array_elements(_withheld_passages) p)));
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer, jsonb, text)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer, jsonb);


-- ###########################################################################
-- SECTION 10 -- Two firewalls, enforced rather than observed
-- ###########################################################################
--
-- Auditing found both boundaries intact: the interview domain references no
-- Career Discovery table and reaches Passport only through the disclosure the
-- holder created. Both held by ABSENCE -- nobody had written the code that
-- would break them -- and absence is not a control. Somebody adding a
-- reasonable-looking join in six months would breach either without noticing.
-- ---------------------------------------------------------------------------

-- 10.1  Career Discovery cannot enter an interview.
--
-- Career Discovery is candidate ORIENTATION: it tells a person which security
-- roles might suit them. It is not recruitment evidence, it was not produced
-- under an employer's lawful basis, and the candidate answered it believing it
-- was for them. A recommended profession or a career-fit result appearing in a
-- preparation brief would turn a self-exploration tool into a screening
-- instrument, retroactively, without anyone deciding to.
--
-- Publishing a Career Card publicly does not change this. A shared card is the
-- candidate showing something to the world; it is not evidence about their
-- suitability for one employer's role.
CREATE OR REPLACE FUNCTION public.scp_iv_guard_no_career_discovery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- The structural half. A source referencing a Career Discovery session or
  -- report is refused outright, whatever its declared kind.
  -- Matched on the label as well as the body, and on the product NAMES rather
  -- than on English result words: the first version looked for
  -- "career discovery report" and sailed past "Career Discovery-rapport",
  -- which is what a Swedish candidate's actually says. Source material has no
  -- legitimate reason to mention Career Discovery at all, so the whole name is
  -- the signal.
  IF coalesce(NEW.content_text, '') || ' ' || coalesce(NEW.label, '') ~*
       '(\ycd_(sessions|report_snapshots|shared_reports|professions)\y|career[ _-]?discovery|career[ _-]?card|karriärkort)' THEN
    RAISE EXCEPTION
      'SCP_IV_CAREER_DISCOVERY_EXCLUDED: Career Discovery output is candidate orientation, not recruitment evidence. It was answered for the candidate''s own use and cannot be entered as interview source material -- including a publicly shared Career Card.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_no_career_discovery() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_interview_case_sources_no_career_discovery
  ON public.scp_interview_case_sources;
CREATE TRIGGER scp_interview_case_sources_no_career_discovery
  BEFORE INSERT OR UPDATE ON public.scp_interview_case_sources
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_no_career_discovery();


-- 10.2  Passport material requires a live disclosure the holder created.
--
-- passport_disclosure is a permitted source kind, and that is correct: a
-- verified credential the candidate deliberately handed over is exactly the
-- kind of fact an interview should be able to rest on. What was missing is any
-- check that the disclosure is real, current and pointed at this employer's
-- application. A source could be labelled passport_disclosure and contain
-- anything.
--
-- The column is added rather than parsed out of the text: an identifier a guard
-- can follow is worth more than a string a guard has to trust.
ALTER TABLE public.scp_interview_case_sources
  ADD COLUMN IF NOT EXISTS disclosure_id uuid REFERENCES public.sp_disclosures(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.scp_interview_case_sources.disclosure_id IS
  'Required for source_kind = passport_disclosure and forbidden otherwise. '
  'Points at the holder-created disclosure this material came from, so expiry '
  'and revocation stay attached to the interview rather than being checked once '
  'at import and forgotten.';

CREATE OR REPLACE FUNCTION public.scp_iv_guard_passport_disclosure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.sp_disclosures%ROWTYPE; _case_app uuid;
BEGIN
  IF NEW.source_kind <> 'passport_disclosure' THEN
    IF NEW.disclosure_id IS NOT NULL THEN
      RAISE EXCEPTION
        'SCP_IV_DISCLOSURE_ON_NON_PASSPORT_SOURCE: only a passport_disclosure source carries a disclosure id.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.disclosure_id IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_PASSPORT_NO_DISCLOSURE: Passport material requires the holder-created disclosure it came from. Applying for a job is not consent, and neither is labelling a source "passport_disclosure".'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _d FROM public.sp_disclosures WHERE id = NEW.disclosure_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_PASSPORT_DISCLOSURE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  IF _d.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_IV_PASSPORT_DISCLOSURE_REVOKED: the holder withdrew this disclosure. Material already confirmed by a human stays in the record; nothing new may be taken from it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _d.expires_at IS NOT NULL AND _d.expires_at <= now() THEN
    RAISE EXCEPTION
      'SCP_IV_PASSPORT_DISCLOSURE_EXPIRED: this disclosure lapsed on %. A disclosure that has run out is not a smaller permission than one that was withdrawn.',
      _d.expires_at::date USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- And it must be the disclosure for THIS application. A holder sharing their
  -- Passport with one employer has not shared it with another, and has not
  -- shared it for a second unrelated role at the same employer.
  SELECT application_id INTO _case_app
    FROM public.scp_interview_cases WHERE id = NEW.case_id;
  IF _d.application_id IS DISTINCT FROM _case_app THEN
    RAISE EXCEPTION
      'SCP_IV_PASSPORT_DISCLOSURE_WRONG_APPLICATION: this disclosure was created for a different application. Consent is per application, not per employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_passport_disclosure() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_interview_case_sources_passport_disclosure
  ON public.scp_interview_case_sources;
CREATE TRIGGER scp_interview_case_sources_passport_disclosure
  BEFORE INSERT OR UPDATE ON public.scp_interview_case_sources
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_passport_disclosure();


-- 10.3  The interview never writes to Passport.
--
-- Nothing in the domain does this today. The guard exists so that it stays
-- true: an interview statement is one person's account, and a Passport claim is
-- a verified fact with an issuer behind it. Promoting the first into the second
-- silently would destroy the distinction the Passport exists to make.
--
-- The legitimate path is a candidate-visible verification SUGGESTION through
-- Passport's own governance, which the holder acts on. That is not this table.
CREATE OR REPLACE FUNCTION public.scp_iv_guard_no_passport_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('scp_iv.in_interview_write', true) = 'on' THEN
    RAISE EXCEPTION
      'SCP_IV_NO_PASSPORT_WRITE: Interview Intelligence cannot create or alter a Passport claim. An interview statement is an account; a Passport claim is a verified fact. Raise a verification suggestion through Passport governance instead.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_no_passport_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sp_claims_no_interview_write ON public.sp_claims;
CREATE TRIGGER sp_claims_no_interview_write
  BEFORE INSERT OR UPDATE ON public.sp_claims
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_no_passport_write();


-- ###########################################################################
-- SECTION 11 -- "Verified" was doing two jobs, and one of them was a claim
-- ###########################################################################
--
-- 228 of the 271 knowledge edges were labelled `verified`. Almost all of them
-- are STRUCTURAL: "this evidence dimension belongs to this question" restates a
-- foreign key, and "this prohibited area restricts this AI task" is a
-- fail-closed default the product asserts about itself. Neither is a scientific
-- finding, and neither was ever meant to read as one.
--
-- But `verified` next to a research claim means something else entirely, and an
-- admin screen showing "verified: 228" invites exactly the reading the whole
-- research registry exists to prevent -- that this product rests on 228
-- confirmed empirical results. It rests on three sources somebody has read.
--
-- So the word is split. Nothing about the graph's shape changes; what changes
-- is that each edge now says which KIND of confidence it carries.
-- ---------------------------------------------------------------------------

-- The constraint is dropped first and rebuilt at the end, because the rows
-- being relabelled below still carry the old value while they are relabelled.
ALTER TABLE public.scp_intel_edges
  DROP CONSTRAINT IF EXISTS scp_intel_edges_assurance_check;

-- Structural relations: foreign keys and fail-closed defaults, not findings.
UPDATE public.scp_intel_edges
   SET assurance = 'structurally_derived',
       assurance_note = coalesce(assurance_note,
         'Restates a relationship authored in this product. True by construction; not an empirical result.')
 WHERE assurance = 'verified'
   AND relation IN ('restricts', 'addresses', 'implements');

-- A claim-to-source edge is as good as whether the source was actually read.
UPDATE public.scp_intel_edges e
   SET assurance = CASE WHEN s.access_status = 'verified_read' THEN 'source_read'
                        ELSE 'pending_source_verification' END,
       assurance_note = CASE WHEN s.access_status = 'verified_read'
         THEN 'The source document was retrieved and read during the build. No independent party has confirmed it.'
         ELSE 'The source has not been read.' END
  FROM public.scp_research_claims c, public.scp_research_sources s
 WHERE e.assurance = 'verified'
   AND e.relation IN ('derived_from', 'supports')
   AND e.from_kind = 'research_claim' AND e.from_id = c.id AND s.id = c.source_id;

-- Anything still called `verified` at this point is a practice-to-claim edge,
-- which is an assertion by the build.
UPDATE public.scp_intel_edges
   SET assurance = 'provisional',
       assurance_note = coalesce(assurance_note,
         'Asserted by the build. No independent party has reviewed the connection.')
 WHERE assurance = 'verified';

ALTER TABLE public.scp_intel_edges
  DROP CONSTRAINT IF EXISTS scp_intel_edges_assurance_check;
ALTER TABLE public.scp_intel_edges
  ADD CONSTRAINT scp_intel_edges_assurance_check CHECK (assurance IN (
    -- The edge restates a relationship the product itself authored: a foreign
    -- key, a pack structure, a fail-closed default. True by construction, and
    -- evidence of nothing about the world.
    'structurally_derived',
    -- The underlying source document has been retrieved and read during the
    -- build. Says the text exists and says what we quote; says nothing about
    -- whether an independent party agrees.
    'source_read',
    -- An independent party confirmed the source supports this. None yet.
    'source_verified',
    -- A named domain expert with no involvement in the implementation reviewed
    -- it. None yet.
    'expert_reviewed',
    -- Asserted by the build and not established.
    'provisional',
    -- Explicitly a guess, recorded so it can be argued with.
    'hypothesis',
    -- The source has not been read at all.
    'pending_source_verification',
    'superseded'));

-- The guard from section 2 spoke in terms of `verified`; it now speaks in terms
-- of the levels that actually make a claim about the world.
CREATE OR REPLACE FUNCTION public.scp_intel_guard_edge_assurance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _unread boolean; _state text;
BEGIN
  IF (NEW.superseded_by IS NOT NULL) <> (NEW.assurance = 'superseded') THEN
    RAISE EXCEPTION
      'SCP_INTEL_EDGE_SUPERSEDED: an edge is superseded exactly when it names what supersedes it.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Nothing may claim a source was read, verified or expert-reviewed when the
  -- document behind it has not been opened.
  IF NEW.assurance IN ('source_read', 'source_verified', 'expert_reviewed') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.scp_research_claims c
      JOIN public.scp_research_sources s ON s.id = c.source_id
       WHERE ((NEW.from_kind = 'research_claim' AND NEW.from_id = c.id)
              OR (NEW.to_kind = 'research_claim' AND NEW.to_id = c.id))
         AND s.access_status <> 'verified_read')
      INTO _unread;
    IF _unread THEN
      RAISE EXCEPTION
        'SCP_INTEL_EDGE_ASSURANCE: this edge touches a research claim whose source has not been read, so it cannot assert "%".',
        NEW.assurance USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- A competency mapping cannot be promoted from the edge side. The mapping
  -- state lives on scp_interview_pack_competency_map, one row per
  -- pack-competency-to-SCC pair, so the weakest of them governs the edge.
  IF NEW.relation = 'maps_to' AND NEW.from_kind = 'interview_competency'
     AND NEW.assurance IN ('source_verified', 'expert_reviewed') THEN
    SELECT min(m.mapping_state) INTO _state
      FROM public.scp_interview_pack_competency_map m
     WHERE m.pack_competency_id = NEW.from_id;
    IF _state IS DISTINCT FROM 'confirmed' THEN
      RAISE EXCEPTION
        'SCP_INTEL_MAPPING_ASSURANCE: the underlying competency mapping is "%", so the edge cannot claim "%". A provisional correspondence is not a confirmed equivalence; promote the mapping, not the edge.',
        coalesce(_state, 'missing'), NEW.assurance USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_intel_guard_edge_assurance() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.scp_intel_edges.assurance IS
  'WHICH KIND of confidence this edge carries, not how much. '
  'structurally_derived = restates something this product authored (a foreign '
  'key, a pack structure, a fail-closed default) and is evidence of nothing '
  'about the world. source_read = the document was retrieved and read during '
  'the build. source_verified / expert_reviewed = an independent party '
  'confirmed it; there are none yet. Never display "verified research" because '
  'an edge was structurally generated.';


DO $assert11$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM public.scp_intel_edges WHERE assurance = 'verified';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IIH_ASSERT: % edge(s) still use the ambiguous "verified".', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_intel_edges
   WHERE assurance IN ('source_verified', 'expert_reviewed');
  IF _n <> 0 THEN
    RAISE EXCEPTION
      'SCP_IIH_ASSERT: % edge(s) claim independent verification, and no independent review has taken place.', _n;
  END IF;

  RAISE NOTICE 'SCP_IIH_ASSERT: assurance split -- % structural, % source_read, % provisional, % hypothesis, % pending.',
    (SELECT count(*) FROM public.scp_intel_edges WHERE assurance = 'structurally_derived'),
    (SELECT count(*) FROM public.scp_intel_edges WHERE assurance = 'source_read'),
    (SELECT count(*) FROM public.scp_intel_edges WHERE assurance = 'provisional'),
    (SELECT count(*) FROM public.scp_intel_edges WHERE assurance = 'hypothesis'),
    (SELECT count(*) FROM public.scp_intel_edges WHERE assurance = 'pending_source_verification');
END
$assert11$;


-- ###########################################################################
-- SECTION 12 -- What the candidate may see
-- ###########################################################################
--
-- scp_interview_cases is readable by employer members only, and stays that way.
-- The candidate's view is an explicit PROJECTION rather than a loosened policy,
-- so what a candidate can learn is a short list somebody wrote down on purpose
-- instead of whatever the table happens to contain.
--
-- The coarse status is the whole point. An employer's internal deliberation --
-- evidence under review, assessed, report written -- is collapsed into one
-- candidate-facing state, because a candidate who could watch their case move
-- from "evidence_review" to "assessed" would be watching the employer think.
-- That is not theirs to see, it would invite reading meaning into timing, and
-- it is exactly the kind of leak a status field acquires by accident.
--
-- Nothing before an approved plan is visible either: a case in draft means the
-- employer is considering an interview, and has not offered one.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scp_iv_candidate_interview_status()
RETURNS TABLE (
  application_id uuid,
  case_id uuid,
  employer_name text,
  role_title text,
  candidate_status text,
  updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.application_id,
    c.id,
    e.name,
    coalesce(j.title_sv, j.title_en, c.title),
    CASE
      WHEN c.status = 'prep_approved'         THEN 'interview_offered'
      WHEN c.status = 'interview_in_progress' THEN 'interview_in_progress'
      -- Everything after the interview collapses to one state. The employer's
      -- deliberation is not a candidate-facing progress bar.
      WHEN c.status IN ('interview_complete', 'evidence_review', 'assessed', 'reported')
                                              THEN 'employer_process_continuing'
      ELSE NULL
    END,
    c.updated_at
  FROM public.scp_interview_cases c
  JOIN public.employers e ON e.id = c.employer_id
  LEFT JOIN public.jobs j ON j.id = c.job_id
 WHERE auth.uid() IS NOT NULL
   AND c.candidate_user_id = auth.uid()
   AND c.status IN ('prep_approved', 'interview_in_progress', 'interview_complete',
                    'evidence_review', 'assessed', 'reported');
$$;

REVOKE ALL ON FUNCTION public.scp_iv_candidate_interview_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_candidate_interview_status() TO authenticated;

COMMENT ON FUNCTION public.scp_iv_candidate_interview_status() IS
  'The candidate''s own view of their interviews: employer, role, one coarse '
  'status, nothing else. Everything after the interview is a single state, '
  'because a candidate watching a case move from evidence_review to assessed '
  'would be watching the employer deliberate. Cases before an approved plan are '
  'not returned at all -- considering an interview is not offering one.';


-- The candidate-facing interview information surface. Says what is being
-- processed and why, and nothing about how it is going.
CREATE OR REPLACE FUNCTION public.scp_iv_candidate_interview_detail(_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.scp_interview_cases%ROWTYPE; _emp text; _role text; _sources jsonb;
BEGIN
  SELECT * INTO _c FROM public.scp_interview_cases
   WHERE id = _case_id AND candidate_user_id = auth.uid();
  IF NOT FOUND OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_CANDIDATE_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _c.status NOT IN ('prep_approved', 'interview_in_progress', 'interview_complete',
                       'evidence_review', 'assessed', 'reported') THEN
    RAISE EXCEPTION 'SCP_IV_CANDIDATE_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT e.name INTO _emp FROM public.employers e WHERE e.id = _c.employer_id;
  SELECT coalesce(j.title_sv, j.title_en) INTO _role FROM public.jobs j WHERE j.id = _c.job_id;

  -- WHICH KINDS of material are being processed, and where each came from.
  -- Not the material itself: a candidate is entitled to know their CV and their
  -- application answers are being read, and is not entitled to read the
  -- employer's own requirements document through this route.
  SELECT jsonb_agg(jsonb_build_object(
           'kind', s.source_kind,
           'label', s.label,
           'origin', s.origin,
           'purpose', s.purpose_code,
           'erased', s.retention_state = 'erased',
           'from_your_passport_disclosure', s.disclosure_id IS NOT NULL)
         ORDER BY s.created_at)
    INTO _sources
    FROM public.scp_interview_case_sources s
   WHERE s.case_id = _case_id
     AND s.source_kind IN ('candidate_cv', 'application_answers', 'passport_disclosure',
                           'transcript');

  RETURN jsonb_build_object(
    'case_id', _c.id,
    'employer_name', _emp,
    'role_title', coalesce(_role, _c.title),
    'candidate_status',
      CASE
        WHEN _c.status = 'prep_approved' THEN 'interview_offered'
        WHEN _c.status = 'interview_in_progress' THEN 'interview_in_progress'
        ELSE 'employer_process_continuing'
      END,
    'sources', coalesce(_sources, '[]'::jsonb),
    'transcript_in_use', EXISTS (
      SELECT 1 FROM public.scp_interview_case_sources s
       WHERE s.case_id = _case_id AND s.source_kind = 'transcript'
         AND s.retention_state = 'active'),
    'retain_until', _c.retain_until);
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_candidate_interview_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_candidate_interview_detail(uuid) TO authenticated;


-- A candidate correcting a FACT is not a candidate editing an assessment.
--
-- The correction lands as its own source, attributed to the candidate, which a
-- human reads. It cannot touch evidence, an assessment or a finalised report:
-- those are the employer's professional judgement, and a product that let the
-- subject of a judgement rewrite it would not be recording a judgement at all.
CREATE TABLE IF NOT EXISTS public.scp_interview_candidate_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,
  candidate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  what_is_wrong text NOT NULL CHECK (btrim(what_is_wrong) <> ''),
  what_is_correct text NOT NULL CHECK (btrim(what_is_correct) <> ''),
  employer_response text,
  responded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_interview_candidate_corrections IS
  'A candidate''s statement that a FACT in their material is wrong. Read by a '
  'human; never applied automatically. It cannot alter evidence, an assessment '
  'or a report -- a correction to what the employer concluded is a different '
  'conversation from a correction to what the record says.';

ALTER TABLE public.scp_interview_candidate_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scp_interview_candidate_corrections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.scp_interview_candidate_corrections TO authenticated;
GRANT ALL ON TABLE public.scp_interview_candidate_corrections TO service_role;

DROP POLICY IF EXISTS scp_iv_corrections_candidate ON public.scp_interview_candidate_corrections;
CREATE POLICY scp_iv_corrections_candidate ON public.scp_interview_candidate_corrections
  FOR SELECT TO authenticated USING (candidate_user_id = auth.uid());

-- "Is this the candidate's own case" has to be answered by a definer function.
-- The first version asked it with an inline EXISTS over scp_interview_cases,
-- which is readable by employer members only -- so the subquery ran under the
-- candidate's own RLS, found nothing, and every correction was rejected. The
-- policy was testing whether the candidate could read the case, not whether the
-- case was theirs.
CREATE OR REPLACE FUNCTION public.scp_iv_is_case_candidate(_case_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.scp_interview_cases c
                  WHERE c.id = _case_id AND c.candidate_user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.scp_iv_is_case_candidate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_is_case_candidate(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS scp_iv_corrections_candidate_insert ON public.scp_interview_candidate_corrections;
CREATE POLICY scp_iv_corrections_candidate_insert ON public.scp_interview_candidate_corrections
  FOR INSERT TO authenticated WITH CHECK (
    candidate_user_id = auth.uid()
    AND public.scp_iv_is_case_candidate(case_id));

DROP POLICY IF EXISTS scp_iv_corrections_employer ON public.scp_interview_candidate_corrections;
CREATE POLICY scp_iv_corrections_employer ON public.scp_interview_candidate_corrections
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.scp_interview_cases c
             WHERE c.id = case_id
               AND public.has_employer_role(auth.uid(), c.employer_id, NULL)));
