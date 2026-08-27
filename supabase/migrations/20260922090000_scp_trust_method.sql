-- CQrity TRUST Interview Method — the binding orchestration model.
--
-- TRUST is CQrityjob's own governed SYNTHESIS of structured selection
-- interviewing, PEACE, ORBIT, the Security Competency Graph, the candidate's
-- permitted sources, AI orchestration and human decision rights. It is
-- proprietary as a system design and it is NOT scientifically validated as a
-- selection method. Everything here records it as a
-- research-grounded design hypothesis under controlled validation.
--
-- WHAT THIS MIGRATION DOES NOT DO, deliberately:
--
--   It does not rebuild the product. Every capability TRUST names already
--   exists -- governed packs, preparation, live interview, evidence review,
--   panel review, audit -- and this migration binds them into one named
--   journey rather than reimplementing them.
--
--   It does not create PEACE or ORBIT as separate product modules. They stay
--   what they are: independently attributed SOURCES inside TRUST, each with
--   its own limitation recorded.
--
--   It does not approve anything. Every stage, claim and source seeded here
--   starts draft or pending. A migration that seeded approved research would
--   be manufacturing the review it exists to require.
--
--   It adds no total, weight, threshold, ranking, score or recommendation.
-- ---------------------------------------------------------------------------

-- TRUST is registered in the method table that already exists rather than in a
-- new one. It is a method; the table is for methods; a second table would say
-- TRUST is a different kind of thing from the methods it synthesises, which is
-- exactly the confusion to avoid.
ALTER TABLE public.scp_interview_methods
  DROP CONSTRAINT IF EXISTS scp_interview_methods_method_family_check;
ALTER TABLE public.scp_interview_methods
  ADD CONSTRAINT scp_interview_methods_method_family_check CHECK (method_family IN (
    'structured_behavioural', 'situational', 'peace', 'orbit', 'rapport_based',
    'evidence_oriented_probing', 'verification_boundary', 'process_quality',
    'prohibited_practice',
    -- The synthesis itself. One row, and the only row that may carry stages.
    'cqrity_trust'));


-- ---------------------------------------------------------------------------
-- 1. The five stages.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scp_trust_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id uuid NOT NULL REFERENCES public.scp_interview_methods(id) ON DELETE CASCADE,
  stage_key text NOT NULL CHECK (stage_key IN (
    'target', 'ready', 'understand', 'structure', 'trace')),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 5),
  letter text NOT NULL CHECK (letter IN ('T', 'R', 'U', 'S', 'T')),
  name_sv text NOT NULL,
  name_en text NOT NULL,
  -- What the stage is for, in the recruiter's language. This is what the UI
  -- shows.
  purpose_sv text NOT NULL,
  purpose_en text NOT NULL,
  -- WHY it is designed this way. Internal: the UI must not show research
  -- rationale to an employer mid-interview, and never to a candidate.
  methodological_basis text NOT NULL,
  human_responsibility_sv text NOT NULL,
  output_sv text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (method_id, stage_key),
  UNIQUE (method_id, ordinal)
);

COMMENT ON TABLE public.scp_trust_stages IS
  'The five CQrity TRUST stages. purpose_sv/en is customer-facing; '
  'methodological_basis is internal and must never reach a candidate screen. '
  'The stage is DERIVED from existing case state rather than stored as a second '
  'status, so there is no way for a case to be in two different places at once.';

COMMENT ON COLUMN public.scp_trust_stages.methodological_basis IS
  'Internal design rationale. Not customer copy: an employer mid-interview does '
  'not need the research argument, and a candidate must never see it.';


-- ---------------------------------------------------------------------------
-- 2. Which AI tasks a stage permits, and the human gate that follows.
--
--    AI tasks were global. Binding them to a stage means "AI may draft the
--    report" is not a standing permission but a permission that exists at one
--    point in one journey, behind one named human gate.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scp_trust_stage_ai_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.scp_trust_stages(id) ON DELETE CASCADE,
  ai_task_id uuid NOT NULL REFERENCES public.scp_ai_tasks(id) ON DELETE RESTRICT,
  -- The human gate is NOT NULL and has no "none" value. A permitted AI task
  -- without a human gate is the thing this product exists not to have.
  human_gate_sv text NOT NULL CHECK (btrim(human_gate_sv) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, ai_task_id)
);

COMMENT ON TABLE public.scp_trust_stage_ai_tasks IS
  'The AI tasks each TRUST stage permits, each with the human gate that must '
  'follow it. There is no row without a gate and no gate value meaning "none".';


-- ---------------------------------------------------------------------------
-- 3. Stage-level prohibited interpretations.
--
--    Separate from the pack's prohibited AREAS (which are about what may be
--    ASKED). These are about what may be CONCLUDED at a given stage.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scp_trust_stage_prohibitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.scp_trust_stages(id) ON DELETE CASCADE,
  statement_sv text NOT NULL CHECK (btrim(statement_sv) <> ''),
  rationale text NOT NULL CHECK (btrim(rationale) <> ''),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Unique on the statement so a re-run updates rather than duplicates. A
  -- prohibition listed twice reads as two different rules.
  UNIQUE (stage_id, statement_sv)
);

COMMENT ON TABLE public.scp_trust_stage_prohibitions IS
  'What may NOT be concluded at a stage, as distinct from what may not be '
  'asked (scp_interview_prohibited_areas). Both exist because "do not ask about '
  'X" and "do not conclude Y from the answer" are different failures.';


-- ---------------------------------------------------------------------------
-- 4. Which research claim grounds a stage, and which claim LIMITS it.
--
--    Both directions are recorded. A stage that only listed its supporting
--    claims would read as better-evidenced than it is.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scp_trust_stage_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.scp_trust_stages(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES public.scp_research_claims(id) ON DELETE RESTRICT,
  relation text NOT NULL CHECK (relation IN ('grounds', 'limits')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, claim_id, relation)
);


-- ---------------------------------------------------------------------------
-- 5. Who established a source's access status.
--
--    The registry already recorded WHAT the access status is. It could not
--    record WHO established it, and the two are not the same claim: the owner's
--    Evidence Pack attests inspections this build could not perform (the OPM
--    pages timed out here), and silently adopting that as "read by the build"
--    would launder an attestation into a verification.
-- ---------------------------------------------------------------------------
ALTER TABLE public.scp_research_sources
  ADD COLUMN IF NOT EXISTS access_attested_by text
    CHECK (access_attested_by IS NULL OR access_attested_by IN (
      'build_retrieval',          -- this codebase fetched and read it
      'owner_evidence_pack_v1',   -- the owner documented the inspection
      'independent_reviewer')),   -- an independent party confirmed it; none yet
  ADD COLUMN IF NOT EXISTS access_attestation_note text;

COMMENT ON COLUMN public.scp_research_sources.access_attested_by IS
  'WHO established the access status. build_retrieval means this codebase '
  'fetched and read the document. owner_evidence_pack_v1 means the owner '
  'documented the inspection in the Evidence Pack; that is an attestation, not '
  'an independent verification, and the distinction is the point.';


-- ---------------------------------------------------------------------------
-- 6. The case pins the METHOD as well as the pack.
-- ---------------------------------------------------------------------------
ALTER TABLE public.scp_interview_cases
  ADD COLUMN IF NOT EXISTS trust_method_id uuid
    REFERENCES public.scp_interview_methods(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS trust_method_version integer;

COMMENT ON COLUMN public.scp_interview_cases.trust_method_id IS
  'The TRUST method version this interview was run under, pinned at creation '
  'like the pack content hash. A later revision of the method does not change '
  'what an interview already conducted was conducted under.';


ALTER TABLE public.scp_trust_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_trust_stage_ai_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_trust_stage_prohibitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_trust_stage_claims ENABLE ROW LEVEL SECURITY;

-- The hosted project grants anon and authenticated everything on new tables,
-- TRUNCATE included, which RLS does not filter. Revoke before granting.
REVOKE ALL ON TABLE public.scp_trust_stages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.scp_trust_stage_ai_tasks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.scp_trust_stage_prohibitions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.scp_trust_stage_claims FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.scp_trust_stages TO authenticated;
GRANT SELECT ON TABLE public.scp_trust_stage_ai_tasks TO authenticated;
GRANT SELECT ON TABLE public.scp_trust_stage_prohibitions TO authenticated;
GRANT ALL ON TABLE public.scp_trust_stages TO service_role;
GRANT ALL ON TABLE public.scp_trust_stage_ai_tasks TO service_role;
GRANT ALL ON TABLE public.scp_trust_stage_prohibitions TO service_role;
GRANT ALL ON TABLE public.scp_trust_stage_claims TO service_role;

-- Stage definitions are platform content, readable by any signed-in employer
-- user: a recruiter needs to know what stage they are in and what it permits.
DROP POLICY IF EXISTS scp_trust_stages_read ON public.scp_trust_stages;
CREATE POLICY scp_trust_stages_read ON public.scp_trust_stages
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS scp_trust_stage_ai_tasks_read ON public.scp_trust_stage_ai_tasks;
CREATE POLICY scp_trust_stage_ai_tasks_read ON public.scp_trust_stage_ai_tasks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS scp_trust_stage_prohibitions_read ON public.scp_trust_stage_prohibitions;
CREATE POLICY scp_trust_stage_prohibitions_read ON public.scp_trust_stage_prohibitions
  FOR SELECT TO authenticated USING (true);

-- Stage-to-claim links are NOT readable by employers. They are the internal
-- research rationale, and the pack is explicit that the UI shows process
-- support in plain language without exposing it.
DROP POLICY IF EXISTS scp_trust_stage_claims_read ON public.scp_trust_stage_claims;
CREATE POLICY scp_trust_stage_claims_read ON public.scp_trust_stage_claims
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));


-- ###########################################################################
-- SEED — sources, claim cards, TRUST v1.0
--
-- Nothing here is approved. Every source keeps the access status the Evidence
-- Pack documents, every claim starts `draft`, and the method starts `draft`.
-- Seeding approved research through a migration would manufacture the review
-- the whole registry exists to require.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- Sources S1-S8, with WHO established each access status.
--
-- The three that were already here keep their status and gain an attestation.
-- Note the OPM entries: the Evidence Pack records a full inspection, and this
-- build's own retrieval timed out. Both facts are now recorded, and they do not
-- contradict each other -- they are answers to different questions.
-- ---------------------------------------------------------------------------
UPDATE public.scp_research_sources
   SET access_attested_by = 'build_retrieval',
       access_attestation_note = 'Retrieved and read by the build.'
 WHERE slug IN ('av-vald-och-hot', 'pmfs-2017-10-fap-573-1', 'cqrityjob-vaktare-pack-v1')
   AND access_attested_by IS NULL;

UPDATE public.scp_research_sources
   SET access_status = 'verified_read',
       access_attested_by = 'owner_evidence_pack_v1',
       access_attestation_note =
         'Evidence Pack v1.0 S1: "Officiell sida fullständigt inspekterad." This '
         'build''s own retrieval timed out three times, so the read is the owner''s '
         'and not this codebase''s. Not independently verified.'
 WHERE slug = 'opm-structured-interviews';

UPDATE public.scp_research_sources
   SET access_attested_by = 'build_retrieval',
       access_attestation_note =
         'Identity confirmed by the build (SIOP White Paper Series, 12 pages); body not extractable.'
 WHERE slug = 'siop-ai-talent-assessment' AND access_attested_by IS NULL;

-- PEACE and ORBIT stay where the Evidence Pack puts them: partial. §10 of the
-- pack is explicit that they remain pending until full text and expert review
-- are documented, and neither has happened.
UPDATE public.scp_research_sources
   SET access_status = 'pending_verification',
       access_attested_by = 'owner_evidence_pack_v1',
       access_attestation_note =
         'Evidence Pack v1.0 S3: official identity and summary verified; the full '
         'page blocked automated retrieval. Remains partial until full text and '
         'method-expert review are documented.'
 WHERE slug = 'peace-investigative-interviewing';

UPDATE public.scp_research_sources
   SET access_status = 'pending_verification',
       access_attested_by = 'owner_evidence_pack_v1',
       access_attestation_note =
         'Evidence Pack v1.0 S4: metadata and abstract inspected; the full article '
         'was not reviewed. Field observation of 58 interrogators with '
         'terrorist suspects -- transfer to recruitment is a design hypothesis.'
 WHERE slug = 'orbit-rapport-based-interviewing';

INSERT INTO public.scp_research_sources
  (slug, title, authors, issuing_organisation, publication_year, publication_type,
   doi, url, access_status, review_status, access_attested_by, access_attestation_note, summary)
VALUES
  ('opm-structured-interview-guide-2008',
   'Structured Interview Guide',
   NULL, 'U.S. Office of Personnel Management', 2008, 'government_guidance',
   NULL, 'https://www.opm.gov/policy-data-oversight/assessment-and-selection/structured-interviews/guide/',
   'verified_read', 'unreviewed', 'owner_evidence_pack_v1',
   'Evidence Pack v1.0 S2: "PDF inspekterad med full text." Not retrieved by this build.',
   'Eight-step development: job analysis, competencies, questions, rating scales, probes, pilot testing, interviewer guide, documentation. Guidance, not an effect study, and an older document.'),

  ('mendez-principles-2021',
   'Principles on Effective Interviewing for Investigations and Information Gathering',
   NULL, 'Méndez Principles', 2021, 'professional_standard',
   NULL, 'https://interviewingprinciples.com/',
   'verified_read', 'unreviewed', 'owner_evidence_pack_v1',
   'Evidence Pack v1.0 S6: official 55-page PDF inspected. Not retrieved by this build.',
   'Non-coercive, rights-respecting, accountable information gathering. Normative and research-informed framework for investigation, NOT employment selection.'),

  ('campion-1997-structure-in-selection-interview',
   'A Review of Structure in the Selection Interview',
   'Campion, M. A.; Palmer, D. K.; Campion, J. E.', 'Personnel Psychology', 1997,
   'peer_reviewed_article',
   '10.1111/j.1744-6570.1997.tb00709.x',
   'https://doi.org/10.1111/j.1744-6570.1997.tb00709.x',
   'pending_verification', 'unreviewed', 'owner_evidence_pack_v1',
   'Evidence Pack v1.0 S7: metadata and published summary inspected; full text not reviewed.',
   'Structure components and improved psychometric properties. An older review; this product''s exact design must still be pilot tested.'),

  ('sackett-2022-revisiting-validity-estimates',
   'Revisiting Meta-Analytic Estimates of Validity in Personnel Selection',
   'Sackett, P. R.; Zhang, C.; Berry, C. M.; Lievens, F.', 'Journal of Applied Psychology', 2022,
   'meta_analysis',
   '10.1037/apl0000994', 'https://doi.org/10.1037/apl0000994',
   'paywalled', 'unreviewed', 'owner_evidence_pack_v1',
   'Evidence Pack v1.0 S8: abstract, metadata and author commentary inspected; full article paywalled.',
   'Caution about older corrected validity estimates. Must NOT be used to support a numeric CQrityjob effect claim.')
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------------
-- Claim cards C-STR-01 … C-AI-01, verbatim from Evidence Pack §6.
--
-- Every one starts `draft`. The `unsupported_use` column is where the pack's
-- "Begränsning" lives, and it is NOT NULL for exactly this reason: a claim
-- recorded without its limit is how a bounded finding becomes a product
-- promise.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_research_claims
  (slug, source_id, claim_summary, supported_use, unsupported_use, limitations,
   evidence_strength, status, construct_or_method, population)
SELECT v.slug, s.id, v.claim_summary, v.supported_use, v.unsupported_use, v.limitations,
       -- Strength follows the SOURCE's read state, enforced by the guard added
       -- in the integrity hardening migration. Nothing here can outrun it.
       CASE WHEN s.access_status = 'verified_read' THEN v.strength_if_read
            ELSE 'pending_source_verification' END,
       'draft', v.construct, v.population
  FROM (VALUES
    ('c-str-01', 'opm-structured-interviews',
     'Structured interviews use the same predetermined questions and the same rating standards for candidates in the same role.',
     'Lock Q1-Q8 and the anchors per pack version.',
     'Does not establish local validity: that needs correct job analysis and a pilot in this role and market.',
     'Strong support as a design principle. US federal guidance; Swedish law and a local job analysis are still required.',
     'moderate', 'structured selection interviewing', 'US federal hiring guidance'),

    ('c-str-02', 'opm-structured-interview-guide-2008',
     'Development should begin in job analysis and cover competency selection, questions, rating scales, probes, pilot testing, an interviewer guide and documentation.',
     'Binding content governance and the four publication review gates.',
     'Not in itself an effect study. It does not show that following the steps produces a valid instrument.',
     'Agency guidance, and an older document. Prescribes process, not outcome.',
     'moderate', 'interview development process', 'US federal hiring guidance'),

    ('c-str-03', 'campion-1997-structure-in-selection-interview',
     'Increased structure is generally associated with improved psychometric properties compared with an unstructured interview.',
     'Describe structure and traceability as design choices.',
     'No numeric effect promise. Exact validity magnitudes vary and older corrected estimates may be overstated.',
     'Older review; the size of the effect is contested and this product''s design has not been tested.',
     'limited', 'interview structure', 'selection interviewing literature'),

    ('c-peace-01', 'peace-investigative-interviewing',
     'PEACE organises an interview into planning, engage/explain, account/clarification, closure and evaluation.',
     'Use as a process backbone for the interviewer''s own work.',
     'NOT a candidate scale and NOT a recruitment instrument. It says nothing about job performance.',
     'Developed for investigative interviewing, not employment selection. Full source not yet reviewed.',
     'insufficient', 'interview process structure', 'investigative interviewing'),

    ('c-orbit-01', 'orbit-rapport-based-interviewing',
     'Adaptive rapport behaviours and motivational-interviewing strategies are associated with better information exchange in the security and interview contexts studied.',
     'Use ONLY as interviewer-conduct guidance.',
     'Not deception detection, not candidate profiling, and not demonstrated prediction of job performance.',
     'Field observation of 58 interrogators with terrorist suspects. Transfer to recruitment must be treated as a design hypothesis. Full article not reviewed.',
     'insufficient', 'interviewer conduct', 'counter-terrorism interrogation'),

    ('c-rap-01', 'orbit-rapport-based-interviewing',
     'Rapport research spans several professional information-gathering contexts and shows agreement about cooperation and disclosure, while varying in definition and measurement.',
     'Explain the method''s limits and evaluate it in a pilot.',
     'Not a single effect size and not a selection-validity study.',
     'Systematic map of 35 studies with heterogeneous definitions. Recorded against the ORBIT source until the Gabbert map is separately registered and read.',
     'insufficient', 'rapport', 'professional information gathering'),

    ('c-eth-01', 'mendez-principles-2021',
     'Effective interviewing should be non-coercive, rights-respecting, accountable, and aimed at accurate and reliable information.',
     'Prohibited-area policy, audit trail and human oversight.',
     'Not a claim about predictive validity or about any candidate.',
     'Normative and research-informed framework for investigation and information gathering, not for employment selection.',
     'regulatory_fact', 'interviewing ethics', 'investigation and information gathering'),

    ('c-ai-01', 'cqrityjob-vaktare-pack-v1',
     'AI must separate source, extraction, suggestion and human confirmation.',
     'The six-layer trust model in schema, RPC and UI.',
     'Not an external research finding. This is CQrityjob product governance and must never be cited as evidence about interviewing.',
     'An owner governance decision, recorded as such.',
     'regulatory_fact', 'AI governance', 'CQrityjob product')
  ) AS v(slug, source_slug, claim_summary, supported_use, unsupported_use, limitations,
         strength_if_read, construct, population)
  JOIN public.scp_research_sources s ON s.slug = v.source_slug
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------------
-- CQrity TRUST v1.0 itself.
--
-- approval_state = 'draft'. It is an owner-approved DESIGN HYPOTHESIS, which is
-- not the same as an approved method, and the pack's own version table says the
-- next gate is research/method review.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_interview_methods
  (slug, version_number, name, method_family, purpose, intended_context,
   supported_behaviours, prohibited_interpretations, product_implementation,
   required_reviewer_qualification, locale_notes, jurisdiction_code, approval_state)
VALUES
  ('cqrity-trust', 1, 'CQrity TRUST Interview Method', 'cqrity_trust',
   'CQrityjobs egna styrda syntes av strukturerad urvalsintervju, PEACE, ORBIT, Security Competency Graph, kandidatens tillåtna källor, AI-orkestrering och mänsklig beslutsrätt. Fem steg: Target, Ready, Understand, Structure, Trace.',
   'Rekrytering till säkerhetsroller. Research-grounded design hypothesis under controlled validation. INTE vetenskapligt validerad som sammanhållen urvalsmetod.',
   ARRAY[
     'Samma versionspinnade kärnfrågor i samma ordning för alla kandidater i samma roll',
     'Styrda, purpose-labelled följdfrågor',
     'Autonomistödjande, accepterande, anpassad, empatisk och evokativ intervjuarstil',
     'Källbunden AI-förberedelse och AI-evidensförslag med citat',
     'Mänsklig bekräftelse av varje evidens innan bedömning',
     'Enskild bedömning före paneldiskussion',
     'Immutable rapport och mänskligt beslut'],
   ARRAY[
     'Att TRUST är vetenskapligt validerad som helhet',
     'Att PEACE eller ORBIT i sig förutsäger arbetsprestation i rekrytering',
     'Att rapport innebär att ett svar är sant, fullständigt eller kompetensbevisande',
     'Att AI kan bedöma trovärdighet, personlighet, deception eller kulturpassning',
     'Att någon del av metoden ger totalpoäng, viktning, tröskel, rangordning eller anställningsrekommendation'],
   'Fem stage definitions med tillåtna AI-uppgifter, mänskliga gates, förbjudna tolkningar och forskningsspårbarhet. Stegen härleds ur befintligt case-tillstånd; ingen andra statuskolumn införs.',
   'Metodgranskare med kompetens inom urvalsintervju OCH investigative interviewing, plus svensk jobbanalys-SME.',
   'Svensk rekryteringskontext. OPM-vägledningen är amerikansk federal och kräver lokal jobbanalys.',
   'SE', 'draft')
ON CONFLICT (slug, version_number) DO NOTHING;


-- ---------------------------------------------------------------------------
-- The five stages.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_trust_stages
  (method_id, stage_key, ordinal, letter, name_sv, name_en, purpose_sv, purpose_en,
   methodological_basis, human_responsibility_sv, output_sv)
SELECT m.id, v.stage_key, v.ordinal, v.letter, v.name_sv, v.name_en,
       v.purpose_sv, v.purpose_en, v.basis, v.human_sv, v.output_sv
  FROM public.scp_interview_methods m,
  (VALUES
    ('target', 1, 'T', 'Målbild', 'Target',
     'Rollen, arbetet, riskerna och kompetenserna definieras och låses i en version.',
     'The role, the work, the risks and the competencies are defined and locked to a version.',
     'Structured selection interviewing / job analysis (C-STR-01, C-STR-02). Job analysis first, then competencies, questions, rating scales and probes.',
     'Kvalificerad innehållsägare godkänner roll, frågor, probes, evidensdimensioner, ankare och förbjudna områden.',
     'Versionspinnat Role Interview Pack med content hash och källspårbar kompetensmappning.'),

    ('ready', 2, 'R', 'Förberedelse', 'Ready',
     'Tillåtna källor samlas och en citerad förberedelseplan tas fram och godkänns av en människa.',
     'Permitted sources are gathered and a cited preparation plan is produced and approved by a human.',
     'PEACE planning (C-PEACE-01) plus source governance. Preparation is a named stage with its own output, not something that happens implicitly.',
     'Rekryteraren kontrollerar fakta, godkänner planen och ser vilka stycken som undanhållits AI-stödet.',
     'Human-approved Preparation Brief med citat, osäkerhet, verifieringspunkter och Q1-Q8.'),

    ('understand', 3, 'U', 'Kontakt och förståelse', 'Understand',
     'Intervjuaren förklarar syfte och process, skapar professionell kontakt och lyssnar aktivt.',
     'The interviewer explains purpose and process, establishes professional contact and listens actively.',
     'PEACE engage/explain plus ORBIT adaptive behaviours (C-ORBIT-01, C-RAP-01). BOTH are recorded as design hypotheses: ORBIT is field observation from counter-terrorism interrogation and its transfer to recruitment is unproven.',
     'Intervjuaren använder autonomistöd, acceptans, empati, anpassning och evokation utan påtryckning.',
     'Intervjuarnoteringar och processreflektion, åtskilda från bedömningen av kandidaten.'),

    ('structure', 4, 'S', 'Struktur och evidens', 'Structure',
     'Samma kärnfrågor i samma ordning, styrda följdfrågor, och evidens som pekar tillbaka på vad som faktiskt sades.',
     'The same core questions in the same order, governed follow-ups, and evidence that points back to what was actually said.',
     'Structured selection interviewing (C-STR-01). Comparability is the whole reason the questions are locked; a rewritten question is a different question.',
     'Intervjuaren dokumenterar situation, kandidatens eget agerande, resultat, reflektion och verifieringsbehov.',
     'Källbundna evidensförslag per fråga, dimension och Interview Competency.'),

    ('trace', 5, 'T', 'Granskning och beslut', 'Trace',
     'AI-förslag granskas av människor, verifiering hålls separat, enskilda bedömningar låses före panel, och beslutet dokumenteras.',
     'AI suggestions are reviewed by humans, verification is kept separate, individual assessments are sealed before the panel, and the decision is documented.',
     'Accountability and human oversight (C-ETH-01, C-AI-01). Méndez principles: non-coercive, rights-respecting, accountable. The six-layer separation is CQrityjob governance, not an external finding.',
     'Människor bekräftar, redigerar eller avvisar evidens, bedömer mot ankare, dokumenterar skäl och fattar beslutet.',
     'Immutable report snapshot, audit trail, versionsprovenans och mänsklig beslutsgräns.')
  ) AS v(stage_key, ordinal, letter, name_sv, name_en, purpose_sv, purpose_en, basis, human_sv, output_sv)
 WHERE m.slug = 'cqrity-trust' AND m.version_number = 1
ON CONFLICT (method_id, stage_key) DO NOTHING;


-- ---------------------------------------------------------------------------
-- Which AI task belongs to which stage, and the human gate that follows it.
-- Straight from Evidence Pack §7. Every row has a gate; there is no ungated
-- AI task anywhere in TRUST.
--
-- Note what is ABSENT: the `understand` stage permits NO AI task at all. The
-- pack allows process guidance there and forbids any candidate scoring,
-- emotion, voice or credibility analysis -- so rather than permit a task and
-- constrain it, the stage permits none. An empty allowlist cannot be widened
-- by a prompt.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_trust_stage_ai_tasks (stage_id, ai_task_id, human_gate_sv)
SELECT st.id, t.id, v.gate
  FROM (VALUES
    ('target',    'role_requirement_extraction',      'Godkänn rollkraven.'),
    ('ready',     'candidate_source_extraction',      'Korrigera fakta i underlaget.'),
    ('ready',     'interview_preparation_generation', 'Godkänn intervjuplanen.'),
    ('ready',     'contextual_probe_suggestion',      'Godkänn intervjuplanen.'),
    ('ready',     'governed_probe_selection',         'Godkänn intervjuplanen.'),
    ('ready',     'verification_item_detection',      'Avgör vilka uppgifter som ska verifieras separat.'),
    ('structure', 'evidence_extraction',              'Bekräfta, redigera eller avvisa varje förslag.'),
    ('structure', 'evidence_dimension_mapping',       'Bekräfta, redigera eller avvisa varje förslag.'),
    ('trace',     'gap_and_contradiction_detection',  'Intervjuare eller granskare avgör nästa steg.'),
    ('trace',     'interview_summary_draft',          'Mänsklig bedömning innan något används.'),
    ('trace',     'report_draft_generation',          'Mänsklig bedömning och finalisering.')
  ) AS v(stage_key, task_key, gate)
  JOIN public.scp_trust_stages st ON st.stage_key = v.stage_key
  JOIN public.scp_ai_tasks t ON t.task_key = v.task_key
ON CONFLICT (stage_id, ai_task_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- What may not be CONCLUDED at each stage. Evidence Pack §5.2 and §4.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_trust_stage_prohibitions (stage_id, statement_sv, rationale, display_order)
SELECT st.id, v.statement, v.rationale, v.ord
  FROM (VALUES
    ('target', 'AI får inte definiera nya urvalskriterier.',
     'A criterion nobody approved is a criterion nobody can defend. AI may structure and propose gaps; a qualified content owner decides.', 1),
    ('target', 'En provisorisk kompetensmappning får inte presenteras som en fastställd ekvivalens.',
     'Five of six pack competencies span two canonical competencies with no source supplying a weighting between them.', 2),

    ('ready', 'Underlag som inte är tillåtet för ändamålet får inte användas.',
     'The source manifest is an allowlist. Career Discovery output and undisclosed Passport material are outside it.', 1),
    ('ready', 'Ett AI-förslag utan källhänvisning får inte bli en del av planen.',
     'An uncited claim about a candidate cannot be checked, and the recruiter would have no way to know.', 2),

    ('understand', 'Ingen kandidatpoäng, emotions-, röst-, kroppsspråks- eller trovärdighetsanalys.',
     'ORBIT is interviewer-conduct guidance. Using rapport research to judge the candidate inverts what it is for.', 1),
    ('understand', 'Rapport innebär inte att ett svar är sant, fullständigt eller kompetensbevisande.',
     'Rapport is associated with better information exchange, not with truthfulness.', 2),
    ('understand', 'Ett kort eller ofullständigt svar får inte behandlas som låg kompetens eller oärlighet.',
     'Level 0 means insufficient evidence. It describes the material, not the person.', 3),

    ('structure', 'Q1-Q8 får aldrig skrivas om.',
     'A rewritten question is a different question, and comparability is the entire reason the questions are locked.', 1),
    ('structure', 'Ledande, anklagande, hotfulla eller manipulerande följdfrågor är inte tillåtna.',
     'A leading question supplies its own answer and destroys the evidential value of the response.', 2),
    ('structure', 'Hypotetiska tvångs- eller våldsscenarier får inte användas.',
     'They reward willingness to escalate and produce speculation, not evidence of what the person has done.', 3),

    ('trace', 'Ingen totalpoäng, viktning, tröskel, rangordning eller pass/fail.',
     'Averaging separate judgements produces a number that looks like a finding and is not one.', 1),
    ('trace', 'Ingen automatisk anställningsrekommendation.',
     'The decision is the employer''s, taken by a named person and documented as theirs.', 2),
    ('trace', 'Avvisat AI-material får inte följa med till rapporten.',
     'A rejected proposal was rejected. Carrying it forward would make the rejection meaningless.', 3),
    ('trace', 'Panelens slutsats får inte beräknas.',
     'No average, no majority vote. Automating agreement would make disagreement disappear.', 4)
  ) AS v(stage_key, statement, rationale, ord)
  JOIN public.scp_trust_stages st ON st.stage_key = v.stage_key
ON CONFLICT (stage_id, statement_sv) DO NOTHING;


-- ---------------------------------------------------------------------------
-- Which claim grounds a stage, and which claim LIMITS it.
--
-- Both directions, because a stage listing only its supporting claims reads as
-- better evidenced than it is. The `limits` rows are the ones that matter.
-- ---------------------------------------------------------------------------
INSERT INTO public.scp_trust_stage_claims (stage_id, claim_id, relation)
SELECT st.id, c.id, v.relation
  FROM (VALUES
    ('target',     'c-str-01',   'grounds'),
    ('target',     'c-str-02',   'grounds'),
    ('target',     'c-str-03',   'limits'),
    ('ready',      'c-peace-01', 'grounds'),
    ('ready',      'c-peace-01', 'limits'),
    ('ready',      'c-ai-01',    'grounds'),
    ('understand', 'c-orbit-01', 'grounds'),
    ('understand', 'c-orbit-01', 'limits'),
    ('understand', 'c-rap-01',   'limits'),
    ('understand', 'c-eth-01',   'grounds'),
    ('structure',  'c-str-01',   'grounds'),
    ('structure',  'c-str-03',   'limits'),
    ('trace',      'c-eth-01',   'grounds'),
    ('trace',      'c-ai-01',    'grounds'),
    ('trace',      'c-str-03',   'limits')
  ) AS v(stage_key, claim_slug, relation)
  JOIN public.scp_trust_stages st ON st.stage_key = v.stage_key
  JOIN public.scp_research_claims c ON c.slug = v.claim_slug
ON CONFLICT (stage_id, claim_id, relation) DO NOTHING;


-- Existing and future cases run under TRUST v1.0 unless pinned otherwise.
UPDATE public.scp_interview_cases c
   SET trust_method_id = m.id, trust_method_version = m.version_number
  FROM public.scp_interview_methods m
 WHERE m.slug = 'cqrity-trust' AND m.version_number = 1
   AND c.trust_method_id IS NULL;


-- ---------------------------------------------------------------------------
-- Where a case is in TRUST, DERIVED rather than stored.
--
-- A second status column would let a case be in two places at once, and the
-- two would drift the first time somebody updated one and not the other. The
-- stage is a reading of the state the case already has.
--
-- Target is deliberately absent from the runtime mapping: it happens in the
-- governed pack before any case exists, and a case that reached `draft` has
-- already passed it.
--
-- Understand and Structure BOTH live inside `interview_in_progress`, separated
-- by the PEACE stage the session is in. That is the one place where the
-- existing state genuinely needed a second dimension to read, and the session
-- already carried it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_trust_case_stage(_case_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN c.status IN ('draft', 'sources_ready', 'prep_generated', 'prep_approved')
      THEN 'ready'
    WHEN c.status = 'interview_in_progress' THEN
      CASE WHEN (SELECT s.peace_stage FROM public.scp_interview_sessions s
                  WHERE s.case_id = c.id ORDER BY s.started_at DESC LIMIT 1)
                IN ('planning', 'engage_explain')
           THEN 'understand'
           ELSE 'structure' END
    WHEN c.status = 'interview_complete' THEN 'structure'
    WHEN c.status IN ('evidence_review', 'assessed', 'reported') THEN 'trace'
    ELSE NULL
  END
  FROM public.scp_interview_cases c
 WHERE c.id = _case_id AND public.scp_iv_can_read_case(_case_id);
$$;

REVOKE ALL ON FUNCTION public.scp_trust_case_stage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_trust_case_stage(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_trust_case_stage(uuid) IS
  'The TRUST stage a case is in, derived from its existing status and the '
  'session''s PEACE stage. Derived rather than stored so a case cannot be in two '
  'places at once. Returns NULL for a cancelled case.';


-- ---------------------------------------------------------------------------
-- Fail-fast assertions.
-- ---------------------------------------------------------------------------
DO $trust_assert$
DECLARE _n integer; _m uuid;
BEGIN
  SELECT id INTO _m FROM public.scp_interview_methods
   WHERE slug = 'cqrity-trust' AND version_number = 1;
  IF _m IS NULL THEN
    RAISE EXCEPTION 'SCP_TRUST_ASSERT: CQrity TRUST v1 is not registered.';
  END IF;

  SELECT count(*) INTO _n FROM public.scp_trust_stages WHERE method_id = _m;
  IF _n <> 5 THEN
    RAISE EXCEPTION 'SCP_TRUST_ASSERT: expected five stages, found %.', _n;
  END IF;

  -- Nothing is approved by migration.
  IF EXISTS (SELECT 1 FROM public.scp_interview_methods
              WHERE slug = 'cqrity-trust' AND approval_state <> 'draft') THEN
    RAISE EXCEPTION 'SCP_TRUST_ASSERT: TRUST was seeded as something other than draft.';
  END IF;
  SELECT count(*) INTO _n FROM public.scp_research_claims
   WHERE slug LIKE 'c-%' AND status <> 'draft';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_TRUST_ASSERT: % claim card(s) seeded as approved.', _n;
  END IF;

  -- Every permitted AI task has a human gate, and every AI task in the product
  -- belongs to exactly one stage. An unbound task would be one nobody decided
  -- when it may run.
  SELECT count(*) INTO _n FROM public.scp_trust_stage_ai_tasks
   WHERE btrim(coalesce(human_gate_sv, '')) = '';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_TRUST_ASSERT: % permitted AI task(s) have no human gate.', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_ai_tasks t
   WHERE NOT EXISTS (SELECT 1 FROM public.scp_trust_stage_ai_tasks a WHERE a.ai_task_id = t.id);
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_TRUST_ASSERT: % AI task(s) belong to no TRUST stage.', _n;
  END IF;

  -- The Understand stage permits no AI task at all.
  SELECT count(*) INTO _n
    FROM public.scp_trust_stage_ai_tasks a
    JOIN public.scp_trust_stages s ON s.id = a.stage_id
   WHERE s.stage_key = 'understand';
  IF _n <> 0 THEN
    RAISE EXCEPTION
      'SCP_TRUST_ASSERT: the Understand stage permits % AI task(s). It must permit none: rapport work is the interviewer''s, and an empty allowlist cannot be widened by a prompt.', _n;
  END IF;

  -- PEACE and ORBIT stay partial until full text and expert review exist.
  IF EXISTS (SELECT 1 FROM public.scp_research_sources
              WHERE slug IN ('peace-investigative-interviewing', 'orbit-rapport-based-interviewing')
                AND access_status = 'verified_read') THEN
    RAISE EXCEPTION
      'SCP_TRUST_ASSERT: PEACE or ORBIT is marked fully read. The Evidence Pack keeps both partial until full text and method-expert review are documented.';
  END IF;

  -- No stage carries a numeric outcome of any kind.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name LIKE 'scp_trust%'
     AND column_name ~* 'score|weight|total|rank|threshold|recommend|suitab';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_TRUST_ASSERT: a TRUST table gained a scoring column.';
  END IF;

  RAISE NOTICE 'SCP_TRUST_ASSERT: TRUST v1 registered as draft — 5 stages, % AI bindings, % prohibitions, % claim links; Understand permits no AI task.',
    (SELECT count(*) FROM public.scp_trust_stage_ai_tasks),
    (SELECT count(*) FROM public.scp_trust_stage_prohibitions),
    (SELECT count(*) FROM public.scp_trust_stage_claims);
END
$trust_assert$;


-- ---------------------------------------------------------------------------
-- A new case pins the METHOD as well as the pack.
--
-- The backfill above covered cases that already existed. Without this, new ones
-- would be created with a NULL method and the pin would silently mean "whatever
-- TRUST happens to be now" -- which is the opposite of pinning.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_iv_create_case(
  _employer_id uuid, _title text, _pack_version_id uuid, _candidate_display_name text,
  _candidate_user_id uuid DEFAULT NULL, _candidate_external_ref text DEFAULT NULL,
  _job_id uuid DEFAULT NULL, _application_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _pack public.scp_interview_pack_versions%ROWTYPE;
  _usable boolean;
  _method_id uuid;
  _method_version integer;
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

  -- The highest TRUST version, pinned now. An interview conducted today was
  -- conducted under today's method, and a later revision does not reach back.
  SELECT id, version_number INTO _method_id, _method_version
    FROM public.scp_interview_methods
   WHERE slug = 'cqrity-trust'
   ORDER BY version_number DESC LIMIT 1;

  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_external_ref,
     candidate_display_name, pack_version_id, role_version_id, pack_content_hash, title,
     created_by, trust_method_id, trust_method_version)
  VALUES
    (_employer_id, _job_id, _application_id, _candidate_user_id, _candidate_external_ref,
     _candidate_display_name, _pack_version_id, _pack.role_version_id, _pack.content_hash,
     _title, auth.uid(), _method_id, _method_version)
  RETURNING id INTO _id;

  PERFORM public.scp_iv_record_event(_id, 'case_created', 'human', NULL, NULL, 'draft', NULL,
    jsonb_build_object('pack_version_id', _pack_version_id,
                       'pack_content_status', _pack.content_status,
                       'validation_label', _pack.validation_label,
                       'trust_method_version', _method_version,
                       'used_pilot_grant', _pack.content_status <> 'published'));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid)
  TO authenticated, service_role;
