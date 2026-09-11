/**
 * The employer final report — the sequence, and what a readback can say.
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────
 *
 * The employer final report is the CANONICAL output of the assessment and
 * interview process. A recruitment owner reviews it, explicitly finalises it,
 * and uses it as decision support. It is never an automatic recommendation,
 * ranking, total score, pass/fail or employment decision, and finalising it
 * is not sharing it with anybody.
 *
 * Two things live here, both pure, so both can be exercised exhaustively
 * offline rather than only through a browser:
 *
 *   1. THE SEQUENCE. Seven acts, in order, with exactly one of them current.
 *      The page shows one clear next action at a time; this module decides
 *      which, from state the server already reported.
 *
 *   2. WHAT A READBACK MAY CLAIM. A finalisation is not finished when the
 *      mutation resolves. It is finished when a governed read comes back
 *      carrying the version, and the digest recomputed from the stored basis
 *      matches the digest stored beside it. Anything less has its own state
 *      and its own sentence, and none of them says "done" while it isn't.
 *
 * No React, no I/O, no clock.
 */

/* ------------------------------------------------------------------ */
/* The sequence                                                        */
/* ------------------------------------------------------------------ */

/** The seven acts, in the order a recruitment owner performs them. */
export const REPORT_STEPS = [
  /** 1. Read the assessment material the process ran on. */
  "reviewAssessmentMaterial",
  /** 2. Read the confirmed interview evidence, requirement by requirement. */
  "reviewEvidence",
  /** 3. Resolve what is missing or contradictory — or record that it stays open. */
  "resolveOutstanding",
  /** 4. Confirm the basis: every requirement carries a human assessment. */
  "confirmBasis",
  /** 5. Preview the complete employer report as it will be finalised. */
  "previewReport",
  /** 6. Explicitly finalise. The irreversible act, by an authorised human. */
  "finalise",
  /** 7. Read the immutable final report back, and check its integrity. */
  "readback",
] as const;

export type ReportStep = (typeof REPORT_STEPS)[number];

export type StepState =
  /** Behind the current step: done, and re-readable. */
  | "done"
  /** The one thing to do now. Exactly one step is ever `current`. */
  | "current"
  /** Ahead of the current step. Reachable, not yet actionable. */
  | "ahead"
  /** Ahead AND this person may never do it. Stated, never silently hidden. */
  | "notPermitted";

export interface StepView {
  readonly step: ReportStep;
  readonly state: StepState;
}

export interface ReportProgress {
  /** Requirements the pinned pack asks about. */
  readonly requirementCount: number;
  /** Requirements carrying a recorded human assessment. */
  readonly assessedCount: number;
  /** Findings still open, needing verification, or an unresolved difference. */
  readonly outstandingCount: number;
  /** What the server says still blocks finalisation. Empty is not "ready" on
   *  its own — a case with no requirements at all has no blockers either. */
  readonly blockerCount: number;
  /** A final report exists for this case. */
  readonly isFinal: boolean;
  /** This person holds owner or admin, the two roles the database accepts. */
  readonly canFinalise: boolean;
}

/**
 * Which act is current.
 *
 * Deliberately NOT "the first step whose work is incomplete": the last step is
 * reading the finalised report back, and that is current for as long as a
 * final report exists. Everything before it is then done, because it was done
 * — the report was built from it.
 */
export function currentStep(p: ReportProgress): ReportStep {
  if (p.isFinal) return "readback";
  if (p.blockerCount > 0 || p.assessedCount < p.requirementCount) {
    // Something is still owed. WHICH thing is owed decides which act it is.
    if (p.assessedCount === 0) return "reviewAssessmentMaterial";
    if (p.assessedCount < p.requirementCount) return "reviewEvidence";
    return "resolveOutstanding";
  }
  if (p.requirementCount === 0) return "reviewAssessmentMaterial";
  if (p.outstandingCount > 0) return "resolveOutstanding";
  if (!p.canFinalise) return "previewReport";
  return "finalise";
}

/**
 * The whole ladder, with one step current and the rest placed around it.
 *
 * `notPermitted` exists so that a member who may read but not finalise is TOLD
 * that finalising is somebody else's act, rather than being shown a control
 * that does nothing or no control at all. A missing button explains nothing.
 */
export function reportSteps(p: ReportProgress): readonly StepView[] {
  const current = currentStep(p);
  const at = REPORT_STEPS.indexOf(current);
  return REPORT_STEPS.map((step, i) => {
    if (i < at) return { step, state: "done" as const };
    if (i === at) return { step, state: "current" as const };
    if (step === "finalise" && !p.canFinalise) return { step, state: "notPermitted" as const };
    return { step, state: "ahead" as const };
  });
}

/** Exactly one step is current, always. The guard asserts this over every
 *  combination rather than trusting the reading. */
export function stepIsCurrent(views: readonly StepView[], step: ReportStep): boolean {
  return views.some((v) => v.step === step && v.state === "current");
}

/* ------------------------------------------------------------------ */
/* What a readback may claim                                           */
/* ------------------------------------------------------------------ */

/** One finalised version, as the governed read returns it. */
export interface FinalReportReadback {
  readonly reportId: string;
  readonly versionNumber: number;
  readonly status: string;
  readonly finalisedAt: string | null;
  readonly finalisedBy: string | null;
  /** The governed actor, resolved: a display name where the account has
   *  one, and the account address either way. A uuid is an identity, not an
   *  answer to "who did this". */
  readonly finalisedByName: string | null;
  readonly finalisedByEmail: string | null;
  readonly contentHash: string | null;
  readonly contentHashAlgorithm: string;
  /** The identity the owner previewed and then finalised. */
  readonly basisHash: string | null;
  readonly recomputedHash: string | null;
  readonly hashVerified: boolean;
  /** The exact basis that was finalised, parsed. */
  readonly payload: ReportPayload | null;
}

export type ReadbackOutcome =
  /** Nothing has been asked for yet. */
  | { readonly kind: "idle" }
  /** The read is in flight. Not a zero, and not a failure. */
  | { readonly kind: "loading" }
  /** A version came back AND its digest recomputes to the stored value. The
   *  only state that may be presented as a finalised, intact report. */
  | { readonly kind: "verified"; readonly report: FinalReportReadback }
  /** A version came back and the digest does NOT match. Never rendered as a
   *  finalised report: the stored basis and the stored hash disagree, and a
   *  human has to be told that in those words. */
  | { readonly kind: "notVerified"; readonly report: FinalReportReadback }
  /** The read succeeded and there is no finalised version. An honest "none". */
  | { readonly kind: "none" }
  /** The read was refused. NOT "none" — this says nothing about whether a
   *  report exists, and must never be rendered as though it did. */
  | { readonly kind: "refused" }
  /** The read broke. Also not "none", and retrying could change it. */
  | { readonly kind: "failed" };

/**
 * The verdict, from the row the governed read returned.
 *
 * `null` means the read came back empty, which is a genuine "no finalised
 * version". A read that FAILED or was REFUSED never reaches here — those are
 * their own members, produced by the caller, because collapsing them into
 * "none" is the single most common way a product states something false.
 */
export function readbackOutcome(row: FinalReportReadback | null): ReadbackOutcome {
  if (!row) return { kind: "none" };
  return row.hashVerified
    ? { kind: "verified", report: row }
    : { kind: "notVerified", report: row };
}

/** Codes PostgREST and Postgres use for "you may not", as opposed to "it
 *  broke". One is actionable by a person, the other by a retry. */
const REFUSAL_CODES = new Set(["42501", "PGRST301", "PGRST116"]);

export function readbackErrorOutcome(code: string | null | undefined): ReadbackOutcome {
  return code && REFUSAL_CODES.has(code) ? { kind: "refused" } : { kind: "failed" };
}

/** Only a verified readback may be presented as the finalised report. */
export function readbackIsTrustworthy(o: ReadbackOutcome): boolean {
  return o.kind === "verified";
}

/**
 * Whether the finalise control does anything if pressed.
 *
 * A courtesy, never a boundary: scp_iv_finalise_report re-decides the role and
 * the blockers on every call, and refuses a member whatever this returns.
 */
export function finaliseEnabled(p: ReportProgress, busy: boolean): boolean {
  if (busy) return false;
  if (p.isFinal) return false;
  if (!p.canFinalise) return false;
  return p.blockerCount === 0 && p.requirementCount > 0 && p.assessedCount >= p.requirementCount;
}

/* ------------------------------------------------------------------ */
/* The audience boundary, stated where the act happens                 */
/* ------------------------------------------------------------------ */

/** What finalising DOES. Enumerated so the confirmation names the exact
 *  irreversible effect rather than gesturing at it. */
export const FINALISE_EFFECTS = [
  "freezesTheBasis",
  "createsAVersion",
  "recordsWhoAndWhen",
  "staysReadableAfterwards",
] as const;

/** What finalising does NOT do. The first entry is the one a recruitment owner
 *  most needs to be sure of, and the reason this list exists at all. */
export const FINALISE_NON_EFFECTS = [
  "doesNotShareWithCandidate",
  "doesNotDecide",
  "doesNotRankOrScore",
  "doesNotEditLiveMaterial",
] as const;

export type FinaliseEffect = (typeof FINALISE_EFFECTS)[number];
export type FinaliseNonEffect = (typeof FINALISE_NON_EFFECTS)[number];

/* ------------------------------------------------------------------ */
/* Preview, and finalising exactly what was previewed                  */
/* ------------------------------------------------------------------ */

/** What a preview returns: the complete payload, its basis identity, its
 *  content digest, and what still blocks finalisation. */
export interface ReportPreview {
  readonly payload: ReportPayload;
  readonly basisHash: string;
  readonly contentHash: string;
  readonly blockerCount: number;
  readonly blockers: readonly { readonly code: string; readonly message: string }[];
}

export type FinaliseOutcome =
  | { readonly kind: "idle" }
  | { readonly kind: "finalising" }
  /** The call returned AND the readback verified a version. */
  | { readonly kind: "confirmed"; readonly reportId: string }
  /** The call returned; the readback has not (yet) verified it. Irreversible
   *  work that succeeded; do not repeat it. */
  | { readonly kind: "writtenNotConfirmed"; readonly reportId: string }
  /** SCP_IV_STALE_PREVIEW — the basis moved between preview and the act.
   *  Nothing was written. The owner must preview again and read what changed. */
  | { readonly kind: "stalePreview" }
  /** SCP_IV_PREVIEW_REQUIRED — the act was attempted with no preview identity.
   *  A client that reaches this has a bug; the server refused regardless. */
  | { readonly kind: "previewRequired" }
  /** SCP_IV_REPORT_BLOCKED — the server's own readiness rule. */
  | { readonly kind: "blocked" }
  /** SCP_IV_FINALISE_ROLE — the database re-decided and said no. */
  | { readonly kind: "refused" }
  | { readonly kind: "failed" };

/** The messages scp_iv_finalise_report actually raises, mapped once, by
 *  prefix. Data rather than a chain of `if`s, and an unknown message falls to
 *  `failed`, which claims nothing. */
const FINALISE_ERROR: readonly (readonly [string, FinaliseOutcome])[] = [
  ["SCP_IV_STALE_PREVIEW", { kind: "stalePreview" }],
  ["SCP_IV_PREVIEW_REQUIRED", { kind: "previewRequired" }],
  ["SCP_IV_REPORT_BLOCKED", { kind: "blocked" }],
  ["SCP_IV_FINALISE_ROLE", { kind: "refused" }],
];

export function finaliseErrorOutcome(message: string | null | undefined): FinaliseOutcome {
  const m = message ?? "";
  for (const [prefix, outcome] of FINALISE_ERROR) if (m.includes(prefix)) return outcome;
  return { kind: "failed" };
}

/**
 * Whether the finalise control does anything if pressed.
 *
 * Nothing may be finalised that has not been previewed: the identity the
 * button sends is the identity the owner read. A courtesy, never a boundary —
 * scp_iv_finalise_report re-decides role, blockers and basis on every call.
 */
export function finaliseEnabledWithPreview(
  p: ReportProgress,
  preview: ReportPreview | null,
  outcome: FinaliseOutcome,
): boolean {
  if (!finaliseEnabled(p, outcome.kind === "finalising")) return false;
  if (!preview || preview.blockerCount > 0) return false;
  // A stale preview is not a preview: the owner must read again first.
  if (outcome.kind === "stalePreview") return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* The payload, as a typed view model                                  */
/* ------------------------------------------------------------------ */
//
// One parser, used for a preview, the current final report and a historical
// version alike. The document renders THIS and nothing else: no live case
// detail, no live notes, no live competencies. If it is not in the payload the
// server produced, it is not in the locked document.

export type EvidenceClassification =
  | "interviewer_observation"
  | "candidate_statement"
  | "candidate_supplied_document"
  | "passport_disclosure"
  | "employer_supplied_material"
  | "unclassified"
  | "unattributed";

export interface ReportEvidence {
  readonly id: string;
  readonly excerpt: string;
  readonly origin: string;
  readonly confirmedBy: string | null;
  readonly confirmedAt: string | null;
  readonly wasCorrected: boolean;
  readonly classification: EvidenceClassification;
}

export interface ReportAssessment {
  readonly id: string;
  readonly level: number;
  readonly rationale: string;
  readonly uncertainty: string | null;
  readonly assessorId: string;
  readonly assessedAt: string | null;
  readonly anchorSv: string | null;
  readonly anchorEn: string | null;
  readonly levelMeaningSv: string | null;
  readonly levelMeaningEn: string | null;
  readonly kind: string;
}

export interface ReportQuestion {
  readonly id: string;
  readonly code: string;
  readonly order: number;
  readonly promptSv: string;
  readonly promptEn: string | null;
  readonly requirement: {
    readonly code: string;
    readonly nameSv: string;
    readonly nameEn: string | null;
  } | null;
  readonly evidence: readonly ReportEvidence[];
  readonly assessments: readonly ReportAssessment[];
  readonly assessorCount: number;
  readonly levelsAgree: boolean;
}

export interface ReportEmployerAssessment {
  readonly snapshotId: string;
  readonly reportVersionId: string | null;
  readonly releasedAt: string | null;
  readonly competencies: readonly {
    readonly competencyCode: string;
    readonly maturityLevel: string;
    readonly thresholdVersion: string | null;
  }[];
  readonly findings: readonly {
    readonly finding: string;
    readonly severity: string | null;
    readonly observedAt: string | null;
  }[];
  readonly limitationsSv: readonly string[];
  readonly limitationsEn: readonly string[];
  readonly snapshotHash: string;
}

export interface ReportAssessmentMaterial {
  readonly attemptId: string;
  readonly assignmentId: string;
  readonly attemptStatus: string;
  readonly employerReport: ReportEmployerAssessment | null;
}

export interface ReportPayload {
  readonly candidate: string;
  readonly internalTitle: string;
  readonly statusAtReport: string | null;
  readonly packNameSv: string | null;
  readonly packNameEn: string | null;
  readonly packVersionNumber: number | null;
  readonly packContentHash: string | null;
  readonly applicationId: string | null;
  readonly jobId: string | null;
  readonly advertisedRoleSv: string | null;
  readonly advertisedRoleEn: string | null;
  readonly interview: readonly {
    readonly startedAt: string | null;
    readonly completedAt: string | null;
    readonly interviewerNames: string | null;
  }[];
  readonly assessmentMaterial: readonly ReportAssessmentMaterial[];
  readonly sources: readonly {
    readonly id: string;
    readonly kind: string;
    readonly label: string;
    readonly disclosureBacked: boolean;
  }[];
  readonly questions: readonly ReportQuestion[];
  readonly panel: {
    readonly state: string;
    readonly conclusion: string | null;
    readonly concludedAt: string | null;
    readonly memberCount: number;
  } | null;
  readonly unresolved: readonly {
    readonly id: string;
    readonly kind: string;
    readonly statement: string;
    readonly state: string;
  }[];
  readonly aiStatement: string | null;
  readonly aiRuns: number;
  readonly decisionBoundary: string | null;
}

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string");

const CLASSIFICATIONS: readonly EvidenceClassification[] = [
  "interviewer_observation",
  "candidate_statement",
  "candidate_supplied_document",
  "passport_disclosure",
  "employer_supplied_material",
  "unclassified",
  "unattributed",
];

/**
 * From the server's payload to the view model. Total: an unknown
 * classification becomes `unclassified` rather than a crash or a silent
 * promotion, and every array defaults to empty rather than to undefined. Never
 * invents a value: what the payload does not carry stays null.
 */
export function parseReportPayload(raw: unknown): ReportPayload {
  const p = obj(raw);
  const c = obj(p.case);
  const r = obj(p.recruitment);
  const ai = obj(p.ai_disclosure);
  const panel = p.panel && typeof p.panel === "object" ? obj(p.panel) : null;
  return {
    candidate: str(c.candidate) ?? "",
    internalTitle: str(c.title) ?? "",
    statusAtReport: str(c.status_at_report),
    packNameSv: str(c.pack_name_sv),
    packNameEn: str(c.pack_name_en),
    packVersionNumber: typeof c.pack_version_number === "number" ? c.pack_version_number : null,
    packContentHash: str(obj(p.pinned).pack_content_hash),
    applicationId: str(r.application_id),
    jobId: str(r.job_id),
    advertisedRoleSv: str(r.advertised_role_sv),
    advertisedRoleEn: str(r.advertised_role_en),
    interview: arr(p.interview).map((x) => {
      const s = obj(x);
      return {
        startedAt: str(s.started_at),
        completedAt: str(s.completed_at),
        interviewerNames: str(s.interviewer_names),
      };
    }),
    assessmentMaterial: arr(p.assessment_material).map((x) => {
      const m = obj(x);
      const er =
        m.employer_report && typeof m.employer_report === "object" ? obj(m.employer_report) : null;
      return {
        attemptId: str(m.attempt_id) ?? "",
        assignmentId: str(m.assignment_id) ?? "",
        attemptStatus: str(m.attempt_status) ?? "",
        employerReport: er
          ? {
              snapshotId: str(er.snapshot_id) ?? "",
              reportVersionId: str(er.report_version_id),
              releasedAt: str(er.released_at),
              competencies: arr(er.competencies).map((y) => {
                const k = obj(y);
                return {
                  competencyCode: str(k.competency_code) ?? "",
                  maturityLevel: str(k.maturity_level) ?? "",
                  thresholdVersion: str(k.threshold_version),
                };
              }),
              findings: arr(er.findings).map((y) => {
                const f = obj(y);
                return {
                  finding: str(f.finding) ?? "",
                  severity: str(f.severity),
                  observedAt: str(f.observed_at),
                };
              }),
              limitationsSv: strs(er.limitations_sv),
              limitationsEn: strs(er.limitations_en),
              snapshotHash: str(er.snapshot_hash) ?? "",
            }
          : null,
      };
    }),
    sources: arr(p.sources).map((x) => {
      const s = obj(x);
      return {
        id: str(s.id) ?? "",
        kind: str(s.kind) ?? "",
        label: str(s.label) ?? "",
        disclosureBacked: s.disclosure_backed === true,
      };
    }),
    questions: arr(p.questions).map((x) => {
      const q = obj(x);
      const req = q.requirement && typeof q.requirement === "object" ? obj(q.requirement) : null;
      return {
        id: str(q.id) ?? "",
        code: str(q.code) ?? "",
        order: num(q.order),
        promptSv: str(q.prompt_sv) ?? "",
        promptEn: str(q.prompt_en),
        requirement:
          req && str(req.code)
            ? {
                code: str(req.code) ?? "",
                nameSv: str(req.name_sv) ?? "",
                nameEn: str(req.name_en),
              }
            : null,
        evidence: arr(q.evidence).map((y) => {
          const e = obj(y);
          const cl = str(e.classification);
          return {
            id: str(e.id) ?? "",
            excerpt: str(e.excerpt) ?? "",
            origin: str(e.origin) ?? "",
            confirmedBy: str(e.confirmed_by),
            confirmedAt: str(e.confirmed_at),
            wasCorrected: e.was_corrected === true,
            classification: (CLASSIFICATIONS as readonly string[]).includes(cl ?? "")
              ? (cl as EvidenceClassification)
              : "unclassified",
          };
        }),
        assessments: arr(q.assessments).map((y) => {
          const a = obj(y);
          return {
            id: str(a.id) ?? "",
            level: num(a.level, -1),
            rationale: str(a.rationale) ?? "",
            uncertainty: str(a.uncertainty),
            assessorId: str(a.assessor_id) ?? "",
            assessedAt: str(a.assessed_at),
            anchorSv: str(a.anchor_sv),
            anchorEn: str(a.anchor_en),
            levelMeaningSv: str(a.level_meaning_sv),
            levelMeaningEn: str(a.level_meaning_en),
            kind: str(a.kind) ?? "",
          };
        }),
        assessorCount: num(q.assessor_count),
        levelsAgree: q.levels_agree !== false,
      };
    }),
    panel: panel
      ? {
          state: str(panel.state) ?? "",
          conclusion: str(panel.conclusion),
          concludedAt: str(panel.concluded_at),
          memberCount: num(panel.member_count),
        }
      : null,
    unresolved: arr(p.unresolved).map((x) => {
      const u = obj(x);
      return {
        id: str(u.id) ?? "",
        kind: str(u.kind) ?? "",
        statement: str(u.statement) ?? "",
        state: str(u.state) ?? "",
      };
    }),
    aiStatement: str(ai.statement),
    aiRuns: arr(ai.runs).length,
    decisionBoundary: str(p.decision_boundary),
  };
}

/** The finalising actor, resolved: a display name where the account has one,
 *  the account address otherwise, and null when neither can be resolved any
 *  more -- which the caller states in words rather than printing a uuid. */
export function actorLabel(r: {
  readonly finalisedByName: string | null;
  readonly finalisedByEmail: string | null;
}): string | null {
  return r.finalisedByName?.trim() || r.finalisedByEmail?.trim() || null;
}
