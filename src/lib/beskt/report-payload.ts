// Reading the frozen BESKT report payload.
//
// ── WHY A READER AND NOT A RENDERER'S OWN PARSING ───────────────────────
//
// The payload is one immutable jsonb value hashed at the instant a human
// signed it. Every field inside it was written into a typed conduct column
// first — the jsonb is a FROZEN RENDERING of that record, not a loose bag.
//
// Parsing it in one place means the report screen and the print view read the
// same shape, and it means a source guard has exactly one file to check for
// the thing this document must never grow: a score, a total, an average, a
// rank, a percentage, a verdict or a recommendation. There is no arithmetic
// in this module at all, and the only counting it does is counting things the
// reader needs to be TOLD about — how many themes nobody documented, how many
// entries are still unverified. A count of what is missing is the opposite of
// a score: it reports what is not known instead of compressing what is.
//
// ── WHAT THIS MODULE DOES NOT DO ────────────────────────────────────────
//
// It does not merge two assessors' positions, order them by anything but the
// order the database returned, or derive a "consensus". Two positions are two
// positions. Where they differ, the panel's own recorded words are the only
// thing that speaks to the difference.

/** One value from the payload, read defensively: the payload is data. */
const rec = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x) => x !== null && typeof x === "object") : [];
const s = (v: unknown): string | null => (typeof v === "string" ? v : null);
const n = (v: unknown): number | null => (typeof v === "number" ? v : null);

export interface BesktReportCase {
  readonly caseId: string | null;
  readonly candidateDisplayName: string | null;
  readonly title: string | null;
  readonly applicationId: string | null;
}

export interface BesktReportBound {
  readonly methodVersionId: string | null;
  readonly packSlug: string | null;
  readonly methodNameSv: string | null;
  readonly methodNameEn: string | null;
  readonly versionNumber: number | null;
  readonly mode: string | null;
  readonly validationLabel: string | null;
  readonly releaseScope: string | null;
  readonly contentHash: string | null;
  readonly answersContentHash: string | null;
  readonly responseVersion: number | null;
  readonly noticeVersion: string | null;
  readonly noticeContentHash: string | null;
  readonly linkedAt: string | null;
}

export interface BesktReportAnswer {
  readonly itemKey: string;
  readonly responseState: string | null;
  readonly valueBoolean: boolean | null;
  readonly valueText: string | null;
  readonly valueDate: string | null;
  readonly selectedOptionKeys: readonly string[];
  readonly wordingSv: string | null;
  readonly wordingEn: string | null;
  readonly purposeSv: string | null;
  readonly purposeEn: string | null;
}

export interface BesktReportTheme {
  readonly itemKey: string;
  readonly reason: string | null;
  readonly wordingSv: string | null;
  readonly wordingEn: string | null;
  readonly purposeSv: string | null;
  readonly purposeEn: string | null;
}

export interface BesktReportCorrection {
  readonly entryId: string | null;
  readonly entryVersion: number | null;
  readonly correctionReason: string | null;
  readonly observableFact: string | null;
  readonly candidateExplanation: string | null;
  readonly interviewerInterpretation: string | null;
  readonly alternativeExplanation: string | null;
  readonly protectiveFactor: string | null;
  readonly eventTiming: string | null;
  readonly consequence: string | null;
  readonly supportingInformation: string | null;
  readonly contradictingInformation: string | null;
  readonly measuresTaken: string | null;
  readonly roleLink: string | null;
  readonly informationGap: string | null;
  readonly candidateResponse: string | null;
  readonly recordedBy: string | null;
  readonly recordedAt: string | null;
}

export interface BesktReportVerificationStep {
  readonly seq: number | null;
  readonly previousState: string | null;
  readonly newState: string | null;
  readonly source: string | null;
  readonly note: string | null;
  readonly recordedBy: string | null;
  readonly recordedAt: string | null;
}

export interface BesktReportEntry {
  readonly entryId: string | null;
  readonly itemKey: string;
  readonly entryVersion: number | null;
  readonly observableFact: string | null;
  readonly candidateExplanation: string | null;
  readonly interviewerInterpretation: string | null;
  readonly alternativeExplanation: string | null;
  readonly protectiveFactor: string | null;
  readonly eventTiming: string | null;
  readonly consequence: string | null;
  readonly supportingInformation: string | null;
  readonly contradictingInformation: string | null;
  readonly measuresTaken: string | null;
  readonly roleLink: string | null;
  readonly informationGap: string | null;
  readonly candidateResponse: string | null;
  readonly verificationNeed: string | null;
  readonly verificationState: string | null;
  readonly verificationSource: string | null;
  readonly sensitivityClass: string | null;
  readonly recordedBy: string | null;
  readonly recordedAt: string | null;
  readonly corrections: readonly BesktReportCorrection[];
  readonly verifications: readonly BesktReportVerificationStep[];
}

export interface BesktReportPosition {
  readonly positionId: string | null;
  readonly assessorId: string | null;
  readonly positionRole: string | null;
  readonly state: string | null;
  readonly lockedAt: string | null;
  readonly reopenCount: number | null;
  readonly entries: readonly BesktReportEntry[];
  /** Themes THIS assessor did not document. Named, not inferred by the reader. */
  readonly informationGaps: readonly string[];
}

export interface BesktReportResolution {
  readonly itemKey: string;
  readonly resolutionKind: string | null;
  readonly agreedStatement: string | null;
  readonly divergentStatement: string | null;
  readonly rationale: string | null;
  readonly recordedBy: string | null;
  readonly recordedAt: string | null;
}

export interface BesktReportPanel {
  readonly panelId: string | null;
  readonly state: string | null;
  readonly revealedAt: string | null;
  readonly resolutions: readonly BesktReportResolution[];
}

export interface BesktReportEvent {
  readonly event: string | null;
  readonly recordedAt: string | null;
  readonly actorId: string | null;
  readonly reason: string | null;
}

export interface BesktReportDocumentData {
  readonly case: BesktReportCase;
  readonly bound: BesktReportBound;
  readonly candidatePreparation: readonly BesktReportAnswer[];
  readonly themes: readonly BesktReportTheme[];
  readonly positions: readonly BesktReportPosition[];
  readonly panel: BesktReportPanel | null;
  readonly auditEvents: readonly BesktReportEvent[];
  /** 20261130090000: the assignment's purpose and people, the participants,
   *  the candidate's supplements, the responsible human's stance and the
   *  follow-up actions -- all in the frozen, previewed basis. */
  readonly assignment: BesktReportAssignment | null;
  readonly participants: ReadonlyArray<{
    readonly name: string | null;
    readonly positionRole: string | null;
    readonly lockedAt: string | null;
  }>;
  readonly supplements: ReadonlyArray<{
    readonly itemKey: string | null;
    readonly kind: string | null;
    readonly body: string | null;
    readonly submittedAt: string | null;
  }>;
  readonly stance: BesktReportStance | null;
  readonly actions: readonly BesktReportAction[];
  /**
   * The document's own statement about itself, carried through rather than
   * asserted by the client. All three are false in every payload the
   * database can build; reading them keeps the screen honest even if that
   * ever stopped being true.
   */
  readonly producesScore: boolean;
  readonly producesRanking: boolean;
  readonly producesRecommendation: boolean;
  readonly interpretation: string | null;
}

export interface BesktReportAssignment {
  readonly purpose: string | null;
  readonly roleTitle: string | null;
  readonly entrance: string | null;
  readonly assignedAt: string | null;
  readonly submittedAt: string | null;
  readonly responsibleInterviewer: string | null;
  readonly securityOwner: string | null;
  readonly roleSecurityAttestation: string | null;
  readonly lawfulBasisStatement: string | null;
  readonly exposureDutiesSv: string | null;
  readonly exposureDutiesEn: string | null;
}

export interface BesktReportStance {
  readonly version: number | null;
  readonly sufficiency: string | null;
  readonly sufficiencyReason: string | null;
  readonly stance: string | null;
  readonly rationale: string | null;
  readonly decidedByName: string | null;
  readonly decidedRole: string | null;
  readonly decidedAt: string | null;
}

export interface BesktReportAction {
  readonly description: string | null;
  readonly responsible: string | null;
  readonly dueOn: string | null;
  readonly status: string | null;
  readonly reviewOn: string | null;
}

function toCorrection(c: Record<string, unknown>): BesktReportCorrection {
  return {
    entryId: s(c.entry_id),
    entryVersion: n(c.entry_version),
    correctionReason: s(c.correction_reason),
    observableFact: s(c.observable_fact),
    candidateExplanation: s(c.candidate_explanation),
    interviewerInterpretation: s(c.interviewer_interpretation),
    alternativeExplanation: s(c.alternative_explanation),
    protectiveFactor: s(c.protective_factor),
    eventTiming: s(c.event_timing),
    consequence: s(c.consequence),
    supportingInformation: s(c.supporting_information),
    contradictingInformation: s(c.contradicting_information),
    measuresTaken: s(c.measures_taken),
    roleLink: s(c.role_link),
    informationGap: s(c.information_gap),
    candidateResponse: s(c.candidate_response),
    recordedBy: s(c.recorded_by),
    recordedAt: s(c.recorded_at),
  };
}

function toEntry(e: Record<string, unknown>): BesktReportEntry {
  return {
    entryId: s(e.entry_id),
    itemKey: s(e.item_key) ?? "",
    entryVersion: n(e.entry_version),
    observableFact: s(e.observable_fact),
    candidateExplanation: s(e.candidate_explanation),
    interviewerInterpretation: s(e.interviewer_interpretation),
    alternativeExplanation: s(e.alternative_explanation),
    protectiveFactor: s(e.protective_factor),
    eventTiming: s(e.event_timing),
    consequence: s(e.consequence),
    supportingInformation: s(e.supporting_information),
    contradictingInformation: s(e.contradicting_information),
    measuresTaken: s(e.measures_taken),
    roleLink: s(e.role_link),
    informationGap: s(e.information_gap),
    candidateResponse: s(e.candidate_response),
    verificationNeed: s(e.verification_need),
    verificationState: s(e.verification_state),
    verificationSource: s(e.verification_source),
    sensitivityClass: s(e.sensitivity_class),
    recordedBy: s(e.recorded_by),
    recordedAt: s(e.recorded_at),
    corrections: arr(e.corrections).map(toCorrection),
    verifications: arr(e.verifications).map((v) => ({
      seq: n(v.seq),
      previousState: s(v.previous_state),
      newState: s(v.new_state),
      source: s(v.source),
      note: s(v.note),
      recordedBy: s(v.recorded_by),
      recordedAt: s(v.recorded_at),
    })),
  };
}

/** Read one frozen payload into the shape every BESKT report surface renders. */
export function readBesktReportPayload(payload: unknown): BesktReportDocumentData {
  const p = rec(payload);
  const c = rec(p.case);
  const b = rec(p.bound);
  const panelRaw = p.panel;
  const panel =
    panelRaw !== null && typeof panelRaw === "object" && !Array.isArray(panelRaw)
      ? rec(panelRaw)
      : null;

  return {
    case: {
      caseId: s(c.case_id),
      candidateDisplayName: s(c.candidate_display_name),
      title: s(c.title),
      applicationId: s(c.application_id),
    },
    bound: {
      methodVersionId: s(b.method_version_id),
      packSlug: s(b.pack_slug),
      methodNameSv: s(b.method_name_sv),
      methodNameEn: s(b.method_name_en),
      versionNumber: n(b.version_number),
      mode: s(b.mode),
      validationLabel: s(b.validation_label),
      releaseScope: s(b.release_scope),
      contentHash: s(b.content_hash),
      answersContentHash: s(b.answers_content_hash),
      responseVersion: n(b.response_version),
      noticeVersion: s(b.notice_version),
      noticeContentHash: s(b.notice_content_hash),
      linkedAt: s(b.linked_at),
    },
    candidatePreparation: arr(p.candidate_preparation).map((a) => ({
      itemKey: s(a.item_key) ?? "",
      responseState: s(a.response_state),
      valueBoolean: typeof a.value_boolean === "boolean" ? a.value_boolean : null,
      valueText: s(a.value_text),
      valueDate: s(a.value_date),
      selectedOptionKeys: Array.isArray(a.selected_option_keys)
        ? (a.selected_option_keys as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      wordingSv: s(a.wording_sv),
      wordingEn: s(a.wording_en),
      purposeSv: s(a.purpose_sv),
      purposeEn: s(a.purpose_en),
    })),
    themes: arr(p.themes).map((th) => ({
      itemKey: s(th.item_key) ?? "",
      reason: s(th.reason),
      wordingSv: s(th.wording_sv),
      wordingEn: s(th.wording_en),
      purposeSv: s(th.purpose_sv),
      purposeEn: s(th.purpose_en),
    })),
    positions: arr(p.positions).map((pos) => ({
      positionId: s(pos.position_id),
      assessorId: s(pos.assessor_id),
      positionRole: s(pos.position_role),
      state: s(pos.state),
      lockedAt: s(pos.locked_at),
      reopenCount: n(pos.reopen_count),
      entries: arr(pos.entries).map(toEntry),
      informationGaps: arr(pos.information_gaps)
        .map((g) => s(g.item_key))
        .filter((k): k is string => k !== null),
    })),
    panel:
      panel === null
        ? null
        : {
            panelId: s(panel.panel_id),
            state: s(panel.state),
            revealedAt: s(panel.revealed_at),
            resolutions: arr(panel.resolutions).map((r) => ({
              itemKey: s(r.item_key) ?? "",
              resolutionKind: s(r.resolution_kind),
              agreedStatement: s(r.agreed_statement),
              divergentStatement: s(r.divergent_statement),
              rationale: s(r.rationale),
              recordedBy: s(r.recorded_by),
              recordedAt: s(r.recorded_at),
            })),
          },
    auditEvents: arr(p.audit_events).map((e) => ({
      event: s(e.event),
      recordedAt: s(e.recorded_at),
      actorId: s(e.actor_id),
      reason: s(e.reason),
    })),
    assignment: p.assignment
      ? (() => {
          const a = rec(p.assignment);
          return {
            purpose: s(a.purpose),
            roleTitle: s(a.role_title),
            entrance: s(a.entrance),
            assignedAt: s(a.assigned_at),
            submittedAt: s(a.submitted_at),
            responsibleInterviewer: s(a.responsible_interviewer),
            securityOwner: s(a.security_owner),
            roleSecurityAttestation: s(a.role_security_attestation),
            lawfulBasisStatement: s(a.lawful_basis_statement),
            exposureDutiesSv: s(a.exposure_duties_sv),
            exposureDutiesEn: s(a.exposure_duties_en),
          };
        })()
      : null,
    participants: arr(p.participants).map((x) => ({
      name: s(x.name),
      positionRole: s(x.position_role),
      lockedAt: s(x.locked_at),
    })),
    supplements: arr(p.supplements).map((x) => ({
      itemKey: s(x.item_key),
      kind: s(x.kind),
      body: s(x.body),
      submittedAt: s(x.submitted_at),
    })),
    stance: p.stance
      ? (() => {
          const x = rec(p.stance);
          return {
            version: n(x.version),
            sufficiency: s(x.sufficiency),
            sufficiencyReason: s(x.sufficiency_reason),
            stance: s(x.stance),
            rationale: s(x.rationale),
            decidedByName: s(x.decided_by_name),
            decidedRole: s(x.decided_role),
            decidedAt: s(x.decided_at),
          };
        })()
      : null,
    actions: arr(p.actions).map((x) => ({
      description: s(x.description),
      responsible: s(x.responsible),
      dueOn: s(x.due_on),
      status: s(x.status),
      reviewOn: s(x.review_on),
    })),
    producesScore: p.produces_score === true,
    producesRanking: p.produces_ranking === true,
    producesRecommendation: p.produces_recommendation === true,
    interpretation: s(p.interpretation),
  };
}

/**
 * What the document does NOT establish, derived from the document itself.
 *
 * This is the uncertainty the report is required to expose, and it is
 * deliberately expressed as three lists of item keys rather than three
 * numbers with a bar beside them. A reader has to be able to see WHICH theme
 * nobody documented, not merely that some number of them exist.
 */
export interface BesktReportLimitations {
  /** Themes no assessor documented at all. */
  readonly undocumentedThemes: readonly string[];
  /** Entries whose verification a human asked for and has not finished. */
  readonly awaitingVerification: readonly string[];
  /** Entries a human tried to verify and could not confirm either way. */
  readonly unresolvedVerification: readonly string[];
  /** Themes two assessors both documented and the panel has not spoken to. */
  readonly unresolvedDifferences: readonly string[];
}

const OPEN_VERIFICATION = new Set(["requested", "in_progress"]);
const UNRESOLVED_VERIFICATION = new Set(["not_verified", "inconclusive"]);

export function besktReportLimitations(d: BesktReportDocumentData): BesktReportLimitations {
  const documented = new Set<string>();
  const awaiting = new Set<string>();
  const unresolved = new Set<string>();
  const byItemPositions = new Map<string, Set<string>>();

  for (const pos of d.positions) {
    for (const e of pos.entries) {
      documented.add(e.itemKey);
      if (e.verificationState !== null && OPEN_VERIFICATION.has(e.verificationState)) {
        awaiting.add(e.itemKey);
      }
      if (e.verificationState !== null && UNRESOLVED_VERIFICATION.has(e.verificationState)) {
        unresolved.add(e.itemKey);
      }
      const seen = byItemPositions.get(e.itemKey) ?? new Set<string>();
      if (pos.positionId !== null) seen.add(pos.positionId);
      byItemPositions.set(e.itemKey, seen);
    }
  }

  const resolvedItems = new Set((d.panel?.resolutions ?? []).map((r) => r.itemKey));

  return {
    undocumentedThemes: d.themes.map((th) => th.itemKey).filter((k) => !documented.has(k)),
    awaitingVerification: [...awaiting],
    unresolvedVerification: [...unresolved],
    unresolvedDifferences: [...byItemPositions.entries()]
      .filter(([itemKey, positions]) => positions.size > 1 && !resolvedItems.has(itemKey))
      .map(([itemKey]) => itemKey),
  };
}
