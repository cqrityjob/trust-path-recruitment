/**
 * BESKT PR1 — executable architecture contract.
 *
 * This parses the normative JSON in the ADR and asserts values and relationships,
 * not sentences printed elsewhere in the document. Negative controls plant one
 * defect at a time and require the matching computation to fail.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DOC = join(ROOT, "docs/architecture/beskt-recruitment-method-discovery.md");

type Contract = {
  schemaVersion: number;
  product: {
    kind: string;
    librarySection: string;
    libraryRoute: string;
    startRoute: string;
    reuseRuntime: string;
    inheritRoleInterviewScoring: boolean;
  };
  method: {
    nameSv: string;
    humanDecisionOwner: string;
    modes: string[];
    securityVettingActivation: string[];
  };
  evidenceStates: string[];
  observationFields: string[];
  roles: string[];
  privacy: Record<string, string>;
  security: {
    newExposedTables: string[];
    mutations: string;
    searchPath: string;
    publicAndAnonExecute: string;
    reportBinding: string;
  };
  prohibitedCapabilities: string[];
  delivery: string[];
  pilotGate: {
    data: string;
    requiredReviews: string[];
    requiredEvidenceWalks: string[];
  };
};

const failures: string[] = [];
let assertions = 0;

function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

function exact(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, i) => value === expected[i]);
}

const source = readFileSync(DOC, "utf8");
const match = source.match(/```json beskt-architecture-contract\n([\s\S]*?)\n```/);
if (!match) {
  console.error("BESKT-CONTRACT-MISSING: normative JSON block is absent or malformed");
  process.exit(1);
}

let contract: Contract;
try {
  contract = JSON.parse(match[1]) as Contract;
} catch (error) {
  console.error(`BESKT-CONTRACT-INVALID-JSON: ${String(error)}`);
  process.exit(1);
}

console.log("BESKT architecture contract\n");

check(contract.schemaVersion === 1, "BESKT-SCHEMA-VERSION: contract version is exactly 1");
check(
  contract.product.kind === "recruitment_method" &&
    contract.product.librarySection === "Metodstöd för rekrytering" &&
    contract.product.libraryRoute === "/employer/$employerSlug/assessments/library",
  "BESKT-PLACEMENT: sibling recruitment-method section on the existing library route",
);
check(
  contract.product.startRoute === "/employer/$employerSlug/interview-intelligence/new" &&
    contract.product.reuseRuntime === "interview_intelligence",
  "BESKT-RUNTIME: starts in and reuses Interview Intelligence",
);
check(
  contract.product.inheritRoleInterviewScoring === false,
  "BESKT-NO-INHERITED-SCORING: does not inherit the role-interview 0–4 contract",
);
check(
  contract.method.nameSv ===
    "BESKT — beteende- och evidensbaserad säkerhetsinriktad kompetensintervju",
  "BESKT-NAME: uses the non-statutory method name",
);
check(
  contract.method.humanDecisionOwner === "accountable_employer",
  "BESKT-HUMAN-OWNER: the accountable employer owns the decision",
);
check(
  exact(contract.method.modes, ["recruitment_support", "security_vetting_support"]),
  "BESKT-MODE-SEPARATION: recruitment and security-vetting support are distinct",
);
check(
  exact(contract.method.securityVettingActivation, [
    "security_sensitive_role_attested",
    "lawful_basis_recorded",
    "authorised_security_owner_assigned",
  ]),
  "BESKT-SECURITY-ACTIVATION: all three security-vetting gates are mandatory",
);
check(
  exact(contract.evidenceStates, [
    "unaddressed",
    "clarification_needed",
    "sufficiently_clarified",
    "external_verification_needed",
    "conflicting_information",
    "insufficient_basis",
    "not_applicable",
  ]),
  "BESKT-CATEGORICAL-EVIDENCE: evidence states are complete and non-numeric",
);
check(
  exact(contract.observationFields, [
    "fact",
    "source_provenance",
    "role_exposure_link",
    "interviewer_interpretation",
    "candidate_explanation",
    "counter_evidence",
    "protective_factor",
    "verification_need",
    "candidate_correction",
    "sensitivity_access_class",
  ]),
  "BESKT-OBSERVATION-SEPARATION: fact, interpretation and counter-context remain distinct",
);
check(
  exact(contract.roles, [
    "candidate",
    "recruiter",
    "beskt_interviewer",
    "independent_assessor",
    "authorised_security_function",
    "accountable_process_owner",
  ]),
  "BESKT-ROLE-SEPARATION: all six process roles are explicit",
);
check(
  contract.privacy.candidateDraftVisibility === "candidate_only" &&
    contract.privacy.employerVisibility === "submitted_frozen_projection_only" &&
    contract.privacy.candidateCorrections === "append_only_versioned" &&
    contract.privacy.reuseAcrossPurposes === "new_purpose_and_lawful_basis_required" &&
    contract.privacy.sensitiveModulesDefault === "disabled",
  "BESKT-PRIVACY: drafts, corrections, reuse and sensitive modules fail closed",
);
check(
  exact(contract.security.newExposedTables, ["enable_rls", "force_rls"]) &&
    contract.security.mutations === "narrow_security_definer_rpcs" &&
    contract.security.searchPath === "public" &&
    contract.security.publicAndAnonExecute === "revoked",
  "BESKT-DATABASE-BOUNDARY: FORCE RLS and narrow pinned RPCs are mandatory",
);
check(
  contract.security.reportBinding === "exact_preview_basis_hash_immutable_version_readback",
  "BESKT-REPORT-BINDING: reuses the immutable #216 report chain",
);
check(
  exact(contract.prohibitedCapabilities, [
    "total_score",
    "hidden_risk_score",
    "ranking",
    "pass_fail",
    "automatic_hiring_recommendation",
    "automatic_rejection",
    "suitability_inference",
    "credibility_or_deception_inference",
    "biometric_or_emotion_inference",
    "sensitive_trait_inference",
    "protected_trait_proxy",
    "omission_as_negative_evidence",
    "ai_confirmed_evidence",
    "ai_finalisation",
    "ai_application_status_change",
  ]),
  "BESKT-PROHIBITIONS: scoring, inference and autonomous decisions are all forbidden",
);
check(
  exact(contract.delivery, [
    "contract",
    "governed_content",
    "candidate_preparation",
    "interview_bridge",
    "conducted_method",
    "report_chain",
    "pilot_ui",
  ]),
  "BESKT-DELIVERY: schema-first seven-PR sequence is locked",
);
check(
  contract.pilotGate.data === "synthetic_only" &&
    exact(contract.pilotGate.requiredReviews, [
      "personnel_security",
      "senior_hr",
      "recruitment",
      "employment_privacy_legal",
      "data_protection",
    ]),
  "BESKT-PILOT-GATE: synthetic data and five human reviews are required",
);
check(
  exact(contract.pilotGate.requiredEvidenceWalks, [
    "candidate_sv_desktop",
    "candidate_sv_mobile",
    "candidate_en_desktop",
    "candidate_en_mobile",
    "employer_sv_desktop",
    "employer_sv_mobile",
    "employer_en_desktop",
    "employer_en_mobile",
  ]),
  "BESKT-WALK-COVERAGE: candidate and employer each cover SV/EN × desktop/mobile",
);
check(
  source.includes("No hosted\nmigration, Lovable publish or real-candidate pilot is authorised by this ADR."),
  "BESKT-NO-RELEASE-AUTHORITY: PR1 authorises no hosted or real-data action",
);

if (failures.length > 0) {
  console.error(`\nBESKT architecture contract FAILED (${failures.length} of ${assertions}).`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\nBESKT architecture contract: ${assertions} of ${assertions} assertions passed.`);
