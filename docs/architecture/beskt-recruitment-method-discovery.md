# BESKT — recruitment method discovery and architecture contract

**Status:** Accepted for implementation planning; no candidate pilot authorised

**Date:** 2026-09-11

**Baseline:** `main` `98113fd708996e9e3b24b3a45c2de2b423c7cb92`

**Owners consulted:** product, HR, recruitment, method, architecture

**Depends on:** Interview Intelligence and the immutable final-report chain merged in PR #216

## 1. Decision

BESKT is a **structured method and documentation aid for a behaviour- and
evidence-based, security-oriented competency interview**. It helps authorised
people identify what is supported, what needs clarification and what requires
verification. It does not score, rank, approve or reject a person.

The Swedish working name is:

> **BESKT — beteende- och evidensbaserad säkerhetsinriktad kompetensintervju.**

BESKT is not a public-authority check, register check, special personal
investigation, medical assessment or automated employment/security-vetting
decision. In particular, it must not be called *särskild
säkerhetsskyddsbedömning*: that is a different statutory concept in chapter 4
of the Swedish Protective Security Act.

The accountable employer decides. CQrityjob records the basis and the human
actor. This follows the product principle: **AI explains; humans decide.**

## 2. Product placement

BESKT is not an assessment-library item. The existing assessment read model
assumes test/training semantics, item counts and scoring that would misdescribe
this method.

It appears in a sibling section, **Metodstöd för rekrytering**, on
`/employer/$employerSlug/assessments/library`. Starting it continues into the
existing Interview Intelligence case-creation route,
`/employer/$employerSlug/interview-intelligence/new`, with the application, job
and governed method version preselected.

The existing Interview Intelligence spine is reused for employer
authorisation, jobs/applications, cases, sources/passages, sessions, confirmed
evidence, events, panels and PR #216's preview → basis hash → immutable report →
readback chain. BESKT gets its own method kind, content rules, categorical
anchors and access boundaries. It does not inherit the role-interview pack's
0–4 per-question contract.

## 3. Two modes, one hard boundary

| Mode | Permitted scope | Activation |
|---|---|---|
| Recruitment support | Role-relevant security awareness, integrity, judgement and behaviour | Governed published method and documented role relevance |
| Security-vetting support | Reliability, loyalty and security-related vulnerabilities only where the role actually participates in security-sensitive activity | Employer attestation of the scope and legal basis, plus an appointed authorised security owner |

A normal recruiter cannot enable the second mode by selecting a checkbox.
Security-vetting material has separate access, retention and export controls and
must never flow into ordinary candidate ranking or the ordinary recruitment
report.

## 4. End-to-end flow

| Step | Primary actor | Required result | Fail-closed condition |
|---:|---|---|---|
| 1 | Recruiter | Real employer, job, application and candidate selected | No free-standing person assessment |
| 2 | HR/process owner | Purpose, lawful basis, retention, role exposure and mode recorded | No generic sensitive questions without role relevance |
| 3 | Process owner | Published method version and accountable owner selected | Draft, revoked or wrong-tenant version refused |
| 4 | Candidate | Receives purpose, recipients, retention, rights and human-decision notice | No start without complete information |
| 5 | Candidate | Saves, reviews and submits a versioned preparation; may choose “discuss orally” where allowed | Drafts invisible to employer; omission is not negative evidence |
| 6 | Recruiter/interviewer | Receives a neutral brief of submitted facts, oral topics, verification needs, possible contradictions and role-linked questions | No hidden risk score or unsupported inference |
| 7 | Interviewer | Conducts a structured interview and records each evidence component separately | No leading/deception technique or overwrite of candidate answers |
| 8 | Candidate | Confirms or corrects factual statements; history remains | Open correction blocks finalisation |
| 9 | Assessors | Each records and locks an independent view | Other views hidden until own lock |
| 10 | Panel | Makes disagreement visible and records resolution and remaining uncertainty | No averaging or silent removal of disagreement |
| 11 | Accountable human owner | Previews the exact report basis and records a reasoned human position | Stale preview, incomplete basis or unauthorised actor refused |
| 12 | Process owner | Closes, follows up, corrects by new version and enforces retention | No overwrite of final report or access after retention |

## 5. Evidence, not person scoring

The canonical evidence states are:

- `unaddressed`
- `clarification_needed`
- `sufficiently_clarified`
- `external_verification_needed`
- `conflicting_information`
- `insufficient_basis`
- `not_applicable`

Each governed anchor needs a definition, inclusion criteria, exclusion criteria,
supporting-evidence examples, counter-evidence/protective factors, prohibited
inferences and a required next action.

An observation never collapses facts and judgement into one field. It preserves
the factual statement, source/provenance, role/exposure link, interviewer
interpretation, candidate explanation, counter-evidence, protective factor,
verification need, candidate correction and sensitivity/access class.

The system may say that the employer has sufficient basis, needs a limited
supplement, should pause for verification, or must refer the matter to an
authorised security function. It may not generate a suitability, credibility,
truthfulness or hiring verdict.

## 6. Candidate and role boundaries

Before starting, the candidate is told why data is requested, who controls it,
who can read it, the retention period, what is required or voluntary, how to
request access/correction and that the system makes no employment decision.
Candidate drafts remain private until submission. Corrections are versioned;
history is not silently rewritten.

The principal roles are candidate, recruiter, BESKT interviewer, independent
assessor, authorised security function and accountable process owner. A
recruitment decision and any statutory security-vetting decision remain two
separate decisions with separate authority, basis and access.

Sensitive categories and criminal-offence data are disabled until a reviewed,
jurisdiction-specific configuration permits them. Data is not reused in the
candidate profile, Career Intelligence Graph or another recruitment without a
new purpose assessment and an appropriate lawful basis.

## 7. Absolute prohibitions

BESKT has no total or hidden risk score, ranking, pass/fail, automatic rejection
or automatic hiring recommendation. It performs no face, voice, gaze, tone,
emotion, body-language, lie or deception analysis. It does not diagnose mental
health, misuse or personality; infer protected/sensitive traits; treat
nationality, family background, religion or foreign ties as risk proxies; or
treat a voluntary omission as negative evidence.

Any AI output is a proposal traceable to a governed question, a submitted answer
or a documented role requirement. It cannot publish content, confirm evidence,
lock an assessor position, resolve panel disagreement, finalise a report or
change application status.

## 8. Schema-first delivery sequence

1. **PR1 — contract only:** this discovery, executable guard and negative controls.
2. **PR2 — governed content:** additive `pack_kind`; BESKT method versions, role-exposure profiles, questionnaire/items/options, prompts, deterministic routing and categorical anchors. Existing role-interview behaviour stays byte-for-byte compatible.
3. **PR3 — candidate preparation:** assignment, notice/acknowledgement, response versions, typed answers, idempotency, expected-revision compare-and-swap, immutable submit snapshot/hash.
4. **PR4 — interview bridge:** link assignment to the existing case and derive deterministic topics from exact submitted answers.
5. **PR5 — conducted method:** structured observations, corrections, verification, independent assessor locks, panel resolution and accountable-owner position.
6. **PR6 — report chain:** BESKT-specific completeness branch reusing PR #216's exact preview, basis hash, immutable version, finalisation and readback.
7. **PR7 — pilot UI:** method library, candidate and employer journeys, and Swedish/English × desktop/mobile evidence on synthetic cases.

There is no destructive CONTRACT/drop phase during the pilot. No hosted
migration, Lovable publish or real-candidate pilot is authorised by this ADR.

## 9. Security and release gates

Every new exposed BESKT table must use both `ENABLE ROW LEVEL SECURITY` and
`FORCE ROW LEVEL SECURITY`. Prefer mutation RPCs with narrow grants, pinned
`search_path`, explicit actor/tenant/subject checks and immediate revocation from
`PUBLIC` and `anon`. Candidate drafts are visible only to the candidate; an
employer reads only the submitted frozen projection.

Every schema PR requires a clean full migration replay, database behaviour tests,
cross-tenant and wrong-subject refusals, stale-revision and idempotency tests,
grant/RLS/`SECURITY DEFINER` assertions, source guards and planted negative
controls. Pilot UI requires both languages at both widths for candidate and
employer, plus inspection of the published evidence bytes.

Before real candidate data, the owner must obtain documented review of the
method and question bank by personnel-security expertise, senior HR,
recruitment, employment/privacy counsel and the data-protection function. A DPIA,
lawful-basis decision, data-category decision, retention schedule, access model,
candidate information, accessibility/language review and incident process must
be accepted. Until then: synthetic data and closed internal testing only.

## 10. Normative machine-readable contract

The following JSON is the executable source for PR1's architecture guard. Later
PRs may add detail, but weakening a boundary requires an explicit ADR change and
a corresponding negative control.

```json beskt-architecture-contract
{
  "schemaVersion": 1,
  "product": {
    "kind": "recruitment_method",
    "librarySection": "Metodstöd för rekrytering",
    "libraryRoute": "/employer/$employerSlug/assessments/library",
    "startRoute": "/employer/$employerSlug/interview-intelligence/new",
    "reuseRuntime": "interview_intelligence",
    "inheritRoleInterviewScoring": false
  },
  "method": {
    "nameSv": "BESKT — beteende- och evidensbaserad säkerhetsinriktad kompetensintervju",
    "humanDecisionOwner": "accountable_employer",
    "modes": ["recruitment_support", "security_vetting_support"],
    "securityVettingActivation": ["security_sensitive_role_attested", "lawful_basis_recorded", "authorised_security_owner_assigned"]
  },
  "evidenceStates": ["unaddressed", "clarification_needed", "sufficiently_clarified", "external_verification_needed", "conflicting_information", "insufficient_basis", "not_applicable"],
  "observationFields": ["fact", "source_provenance", "role_exposure_link", "interviewer_interpretation", "candidate_explanation", "counter_evidence", "protective_factor", "verification_need", "candidate_correction", "sensitivity_access_class"],
  "roles": ["candidate", "recruiter", "beskt_interviewer", "independent_assessor", "authorised_security_function", "accountable_process_owner"],
  "privacy": {
    "candidateDraftVisibility": "candidate_only",
    "employerVisibility": "submitted_frozen_projection_only",
    "candidateCorrections": "append_only_versioned",
    "reuseAcrossPurposes": "new_purpose_and_lawful_basis_required",
    "sensitiveModulesDefault": "disabled"
  },
  "security": {
    "newExposedTables": ["enable_rls", "force_rls"],
    "mutations": "narrow_security_definer_rpcs",
    "searchPath": "public",
    "publicAndAnonExecute": "revoked",
    "reportBinding": "exact_preview_basis_hash_immutable_version_readback"
  },
  "prohibitedCapabilities": ["total_score", "hidden_risk_score", "ranking", "pass_fail", "automatic_hiring_recommendation", "automatic_rejection", "suitability_inference", "credibility_or_deception_inference", "biometric_or_emotion_inference", "sensitive_trait_inference", "protected_trait_proxy", "omission_as_negative_evidence", "ai_confirmed_evidence", "ai_finalisation", "ai_application_status_change"],
  "delivery": ["contract", "governed_content", "candidate_preparation", "interview_bridge", "conducted_method", "report_chain", "pilot_ui"],
  "pilotGate": {
    "data": "synthetic_only",
    "requiredReviews": ["personnel_security", "senior_hr", "recruitment", "employment_privacy_legal", "data_protection"],
    "requiredEvidenceWalks": ["candidate_sv_desktop", "candidate_sv_mobile", "candidate_en_desktop", "candidate_en_mobile", "employer_sv_desktop", "employer_sv_mobile", "employer_en_desktop", "employer_en_mobile"]
  }
}
```

## 11. Primary legal and regulatory references

- [Swedish Protective Security Act (2018:585), chapters 3 and 4](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/sakerhetsskyddslag-2018585_sfs-2018-585/)
- [Swedish Discrimination Act (2008:567)](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/diskrimineringslag-2008567_sfs-2008-567/)
- [GDPR, including Article 22](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng)
- [EU AI Act, including Annex III employment systems](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng)
- [Swedish Security Service — personnel security](https://www.sakerhetspolisen.se/sakerhetsskydd/personalsakerhet.html)
