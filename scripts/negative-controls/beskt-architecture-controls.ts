/** BESKT PR1 negative controls: every material architecture assertion must detect a planted defect. */
import { runControls, type Mutation } from "./runner";

const DOC = "docs/architecture/beskt-recruitment-method-discovery.md";
const GUARD = "beskt-architecture:check";

const MUTATIONS: readonly Mutation[] = [
  { id: "BESKT-NC-PLACEMENT", defect: "BESKT is misclassified as an assessment", file: DOC, find: '"kind": "recruitment_method"', replace: '"kind": "assessment"', guard: GUARD, expect: "BESKT-PLACEMENT" },
  { id: "BESKT-NC-RUNTIME", defect: "BESKT starts in an unrelated runtime", file: DOC, find: '"reuseRuntime": "interview_intelligence"', replace: '"reuseRuntime": "assessment_runner"', guard: GUARD, expect: "BESKT-RUNTIME" },
  { id: "BESKT-NC-SCORING", defect: "the role-interview 0–4 contract is inherited", file: DOC, find: '"inheritRoleInterviewScoring": false', replace: '"inheritRoleInterviewScoring": true', guard: GUARD, expect: "BESKT-NO-INHERITED-SCORING" },
  { id: "BESKT-NC-NAME", defect: "the method takes a misleading statutory name", file: DOC, find: '"nameSv": "BESKT — beteende- och evidensbaserad säkerhetsinriktad kompetensintervju"', replace: '"nameSv": "BESKT — särskild säkerhetsskyddsbedömning"', guard: GUARD, expect: "BESKT-NAME" },
  { id: "BESKT-NC-HUMAN-OWNER", defect: "the system becomes the decision owner", file: DOC, find: '"humanDecisionOwner": "accountable_employer"', replace: '"humanDecisionOwner": "system"', guard: GUARD, expect: "BESKT-HUMAN-OWNER" },
  { id: "BESKT-NC-MODE", defect: "security vetting collapses into ordinary recruitment", file: DOC, find: '"modes": ["recruitment_support", "security_vetting_support"]', replace: '"modes": ["recruitment_support"]', guard: GUARD, expect: "BESKT-MODE-SEPARATION" },
  { id: "BESKT-NC-ACTIVATION", defect: "a lawful-basis gate is removed", file: DOC, find: '["security_sensitive_role_attested", "lawful_basis_recorded", "authorised_security_owner_assigned"]', replace: '["security_sensitive_role_attested", "authorised_security_owner_assigned"]', guard: GUARD, expect: "BESKT-SECURITY-ACTIVATION" },
  { id: "BESKT-NC-EVIDENCE", defect: "a numeric risk level replaces a categorical evidence state", file: DOC, find: '"not_applicable"],\n  "observationFields"', replace: '"risk_level_4"],\n  "observationFields"', guard: GUARD, expect: "BESKT-CATEGORICAL-EVIDENCE" },
  { id: "BESKT-NC-OBSERVATION", defect: "candidate explanation disappears from the evidence model", file: DOC, find: '"candidate_explanation", "counter_evidence"', replace: '"counter_evidence"', guard: GUARD, expect: "BESKT-OBSERVATION-SEPARATION" },
  { id: "BESKT-NC-ROLES", defect: "the authorised security function disappears", file: DOC, find: '"independent_assessor", "authorised_security_function", "accountable_process_owner"', replace: '"independent_assessor", "accountable_process_owner"', guard: GUARD, expect: "BESKT-ROLE-SEPARATION" },
  { id: "BESKT-NC-DRAFT", defect: "employers may read candidate drafts", file: DOC, find: '"candidateDraftVisibility": "candidate_only"', replace: '"candidateDraftVisibility": "employer_and_candidate"', guard: GUARD, expect: "BESKT-PRIVACY" },
  { id: "BESKT-NC-RLS", defect: "FORCE RLS is weakened to ordinary RLS", file: DOC, find: '["enable_rls", "force_rls"]', replace: '["enable_rls"]', guard: GUARD, expect: "BESKT-DATABASE-BOUNDARY" },
  { id: "BESKT-NC-REPORT", defect: "the report is no longer basis-hash bound", file: DOC, find: '"reportBinding": "exact_preview_basis_hash_immutable_version_readback"', replace: '"reportBinding": "latest_mutable_preview"', guard: GUARD, expect: "BESKT-REPORT-BINDING" },
  { id: "BESKT-NC-PROHIBITION", defect: "credibility/deception inference is permitted by omission", file: DOC, find: '"credibility_or_deception_inference", ', replace: "", guard: GUARD, expect: "BESKT-PROHIBITIONS" },
  { id: "BESKT-NC-SEQUENCE", defect: "runtime work starts before governed content", file: DOC, find: '["contract", "governed_content", "candidate_preparation"', replace: '["contract", "candidate_preparation", "governed_content"', guard: GUARD, expect: "BESKT-DELIVERY" },
  { id: "BESKT-NC-PILOT", defect: "real candidate data is allowed before review", file: DOC, find: '"data": "synthetic_only"', replace: '"data": "real_candidates"', guard: GUARD, expect: "BESKT-PILOT-GATE" },
  { id: "BESKT-NC-WALKS", defect: "the English candidate mobile walk is removed", file: DOC, find: '"candidate_en_mobile", ', replace: "", guard: GUARD, expect: "BESKT-WALK-COVERAGE" },
  { id: "BESKT-NC-RELEASE", defect: "the ADR silently authorises a hosted release", file: DOC, find: "No hosted\nmigration, Lovable publish or real-candidate pilot is authorised by this ADR.", replace: "A hosted\nmigration and real-candidate pilot are authorised by this ADR.", guard: GUARD, expect: "BESKT-NO-RELEASE-AUTHORITY" }
];

runControls("beskt-architecture", MUTATIONS);
