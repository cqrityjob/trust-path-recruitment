// BESKT interview conduct — the only application-side access to the PR 5A
// runtime.
//
// Every function here is a thin, typed pass-through to one governed RPC. It
// holds NO authorisation logic of its own: the database decides who may open a
// conduct session, whose position anyone may write into, and — crucially —
// WHEN another assessor's position becomes readable. It re-checks on every
// call, so a crafted request that skips this file gains nothing.
//
// Two rules this file must keep:
//
//   It never sends service_role, and it never writes a table directly. Both
//   would step around the row policies that carry the independence rule.
//
//   It never sends a tenant or actor fact the database can derive itself. The
//   employer, the case, the candidate and the caller all come from the session
//   and the bound link; a client that could name them could name someone
//   else's.
//
// What this file must never grow: a score, a total, a ranking, a suitability
// or credibility judgement, an automatic recommendation, or any averaging of
// two assessors' positions. Those are prohibited outright by the PR 1
// contract, and the database has nowhere to store them.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The governed verification states. There is no other. */
export const BESKT_VERIFICATION_STATES = [
  "not_required",
  "requested",
  "in_progress",
  "verified",
  "not_verified",
  "inconclusive",
] as const;
export type BesktVerificationState = (typeof BESKT_VERIFICATION_STATES)[number];

/** The governed sensitivity classes. */
export const BESKT_SENSITIVITY_CLASSES = ["ordinary", "sensitive", "special_category"] as const;
export type BesktSensitivityClass = (typeof BESKT_SENSITIVITY_CLASSES)[number];

/** The candidate's own two neutral states, carried through from PR 4. */
export type BesktTopicReason = "omitted" | "discuss_orally";

/** A panel outcome. Exactly two, and neither is a score. */
export const BESKT_RESOLUTION_KINDS = ["agreed", "disagreed"] as const;
export type BesktResolutionKind = (typeof BESKT_RESOLUTION_KINDS)[number];

export interface BesktConductEntry {
  readonly entryId: string;
  readonly itemKey: string;
  readonly topicId: string | null;
  readonly entryVersion: number;
  readonly observableFact: string | null;
  readonly candidateExplanation: string | null;
  readonly interviewerInterpretation: string | null;
  readonly alternativeExplanation: string | null;
  readonly protectiveFactor: string | null;
  readonly verificationNeed: string | null;
  readonly verificationState: BesktVerificationState;
  readonly verificationSource: string | null;
  readonly sensitivityClass: BesktSensitivityClass;
  readonly recordedAt: string | null;
}

export interface BesktConductTopic {
  readonly topicId: string;
  readonly itemKey: string;
  readonly reason: BesktTopicReason;
  readonly wordingSv: string | null;
  readonly wordingEn: string | null;
  readonly purposeSv: string | null;
  readonly purposeEn: string | null;
}

export interface BesktOtherPosition {
  readonly positionId: string;
  readonly assessorId: string;
  readonly positionRole: string;
  readonly state: string;
  readonly lockedAt: string | null;
  readonly entries: readonly {
    readonly entryId: string;
    readonly itemKey: string;
    readonly observableFact: string | null;
    readonly candidateExplanation: string | null;
    readonly interviewerInterpretation: string | null;
    readonly alternativeExplanation: string | null;
    readonly protectiveFactor: string | null;
    readonly verificationState: BesktVerificationState;
  }[];
}

export interface BesktConductWorkspace {
  readonly sessionId: string;
  readonly caseId: string;
  readonly linkId: string;
  readonly state: string;
  readonly sessionRevision: number;
  readonly bound: {
    readonly responseId: string;
    readonly responseVersion: number;
    readonly methodVersionId: string;
    readonly contentHash: string;
    readonly answersContentHash: string;
  };
  readonly topics: readonly BesktConductTopic[];
  readonly myPosition: {
    readonly positionId: string;
    readonly state: string;
    readonly positionRole: string;
    readonly revision: number;
    readonly lockedAt: string | null;
    readonly reopenCount: number;
  } | null;
  readonly myEntries: readonly BesktConductEntry[];
  /** False until the reader's OWN position is locked. Absent, not empty. */
  readonly othersVisible: boolean;
  readonly others: readonly BesktOtherPosition[];
  readonly panel: {
    readonly panelId: string;
    readonly state: string;
    readonly revision: number;
    readonly revealedAt: string | null;
    readonly resolutions: readonly {
      readonly resolutionId: string;
      readonly itemKey: string;
      readonly resolutionKind: BesktResolutionKind;
      readonly agreedStatement: string | null;
      readonly divergentStatement: string | null;
      readonly rationale: string;
      readonly recordedAt: string;
    }[];
  } | null;
  /** Said by the database itself, so a client cannot render a total by mistake. */
  readonly producesScore: false;
  readonly producesRanking: false;
  readonly producesRecommendation: false;
  readonly interpretation: "none";
}

const asRecord = (v: unknown): Record<string, unknown> => (v ?? {}) as Record<string, unknown>;
const asArray = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function toEntry(r: Record<string, unknown>): BesktConductEntry {
  return {
    entryId: r.entry_id as string,
    itemKey: r.item_key as string,
    topicId: str(r.topic_id),
    entryVersion: (r.entry_version as number) ?? 1,
    observableFact: str(r.observable_fact),
    candidateExplanation: str(r.candidate_explanation),
    interviewerInterpretation: str(r.interviewer_interpretation),
    alternativeExplanation: str(r.alternative_explanation),
    protectiveFactor: str(r.protective_factor),
    verificationNeed: str(r.verification_need),
    verificationState: (r.verification_state as BesktVerificationState) ?? "not_required",
    verificationSource: str(r.verification_source),
    sensitivityClass: (r.sensitivity_class as BesktSensitivityClass) ?? "ordinary",
    recordedAt: str(r.recorded_at),
  };
}

/**
 * The interviewer's whole working surface for one linked case.
 *
 * The withholding of other assessors' positions is the DATABASE's, not this
 * function's: `others` comes back empty and `others_visible` false until the
 * reader's own position is locked. This shape is deliberate — the client is
 * told that something is being withheld and why, rather than being handed an
 * empty list it might render as "nobody else has recorded anything".
 */
export const getBesktConductWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<BesktConductWorkspace> => {
    const { data: row, error } = await context.supabase.rpc("bcp_conduct_workspace", {
      _session_id: data.sessionId,
    });
    if (error) throw new Error(error.message);
    const r = asRecord(row);
    const b = asRecord(r.bound);
    const panel = r.panel ? asRecord(r.panel) : null;
    const my = r.my_position ? asRecord(r.my_position) : null;
    return {
      sessionId: r.session_id as string,
      caseId: r.case_id as string,
      linkId: r.link_id as string,
      state: r.state as string,
      sessionRevision: r.session_revision as number,
      bound: {
        responseId: b.response_id as string,
        responseVersion: b.response_version as number,
        methodVersionId: b.method_version_id as string,
        contentHash: b.content_hash as string,
        answersContentHash: b.answers_content_hash as string,
      },
      topics: asArray(r.topics).map((t) => ({
        topicId: t.topic_id as string,
        itemKey: t.item_key as string,
        reason: t.reason as BesktTopicReason,
        wordingSv: str(t.wording_sv),
        wordingEn: str(t.wording_en),
        purposeSv: str(t.purpose_sv),
        purposeEn: str(t.purpose_en),
      })),
      myPosition: my
        ? {
            positionId: my.position_id as string,
            state: my.state as string,
            positionRole: my.position_role as string,
            revision: my.revision as number,
            lockedAt: str(my.locked_at),
            reopenCount: (my.reopen_count as number) ?? 0,
          }
        : null,
      myEntries: asArray(r.my_entries).map(toEntry),
      othersVisible: r.others_visible === true,
      others: asArray(r.others).map((o) => ({
        positionId: o.position_id as string,
        assessorId: o.assessor_id as string,
        positionRole: o.position_role as string,
        state: o.state as string,
        lockedAt: str(o.locked_at),
        entries: asArray(o.entries).map((e) => ({
          entryId: e.entry_id as string,
          itemKey: e.item_key as string,
          observableFact: str(e.observable_fact),
          candidateExplanation: str(e.candidate_explanation),
          interviewerInterpretation: str(e.interviewer_interpretation),
          alternativeExplanation: str(e.alternative_explanation),
          protectiveFactor: str(e.protective_factor),
          verificationState: (e.verification_state as BesktVerificationState) ?? "not_required",
        })),
      })),
      panel: panel
        ? {
            panelId: panel.panel_id as string,
            state: panel.state as string,
            revision: panel.revision as number,
            revealedAt: str(panel.revealed_at),
            resolutions: asArray(panel.resolutions).map((x) => ({
              resolutionId: x.resolution_id as string,
              itemKey: x.item_key as string,
              resolutionKind: x.resolution_kind as BesktResolutionKind,
              agreedStatement: str(x.agreed_statement),
              divergentStatement: str(x.divergent_statement),
              rationale: x.rationale as string,
              recordedAt: x.recorded_at as string,
            })),
          }
        : null,
      producesScore: false,
      producesRanking: false,
      producesRecommendation: false,
      interpretation: "none",
    };
  });

/** The correction and verification history of one entry chain. */
export const getBesktEntryHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ entryId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("bcp_conduct_entry_history", {
      _entry_id: data.entryId,
    });
    if (error) throw new Error(error.message);
    const r = asRecord(row);
    return {
      entryId: r.entry_id as string,
      itemKey: r.item_key as string,
      versions: asArray(r.versions).map((v) => ({
        entryId: v.entry_id as string,
        entryVersion: v.entry_version as number,
        observableFact: str(v.observable_fact),
        candidateExplanation: str(v.candidate_explanation),
        interviewerInterpretation: str(v.interviewer_interpretation),
        alternativeExplanation: str(v.alternative_explanation),
        protectiveFactor: str(v.protective_factor),
        verificationNeed: str(v.verification_need),
        verificationState: (v.verification_state as BesktVerificationState) ?? "not_required",
        verificationSource: str(v.verification_source),
        sensitivityClass: (v.sensitivity_class as BesktSensitivityClass) ?? "ordinary",
        correctionReason: str(v.correction_reason),
        supersededByEntryId: str(v.superseded_by_entry_id),
        recordedBy: str(v.recorded_by),
        recordedAt: str(v.recorded_at),
      })),
      verifications: asArray(r.verifications).map((v) => ({
        seq: v.seq as number,
        previousState: str(v.previous_state) as BesktVerificationState | null,
        newState: v.new_state as BesktVerificationState,
        source: str(v.source),
        note: str(v.note),
        recordedBy: str(v.recorded_by),
        recordedAt: v.recorded_at as string,
      })),
    };
  });

// ---------------------------------------------------------------------------
// Mutations.
//
// Each one names an operation id the caller generated, so a retry after a lost
// response replays the first answer instead of writing twice; and each one
// that touches an existing row names the revision the caller was looking at,
// so two interviewers editing the same position cannot silently overwrite one
// another. Both checks live in the database — repeating them here would be
// theatre, because a crafted request would not run this code at all.
// ---------------------------------------------------------------------------

const operation = z.object({ operationId: z.string().uuid() });

/** Open the conduct session for a linked case, taking the caller's position. */
export const startBesktConductSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => operation.extend({ linkId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("bcp_conduct_start_session", {
      _operation_id: data.operationId,
      _link_id: data.linkId,
    });
    if (error) throw new Error(error.message);
    const r = asRecord(row);
    return {
      sessionId: r.session_id as string,
      positionId: r.position_id as string,
      caseId: r.case_id as string,
      linkId: r.link_id as string,
    };
  });

/**
 * Join a session someone else opened.
 *
 * The role is the caller's own declaration of what they are doing here, and
 * the database holds the vocabulary: an assessor records an independent
 * position, a responsible owner records theirs in the same governed shape.
 * Neither is weighted against the other, because nothing here is weighted.
 */
export const joinBesktConductSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    operation
      .extend({
        sessionId: z.string().uuid(),
        positionRole: z.enum(["assessor", "responsible_owner"]).default("assessor"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("bcp_conduct_join_session", {
      _operation_id: data.operationId,
      _session_id: data.sessionId,
      _position_role: data.positionRole,
    });
    if (error) throw new Error(error.message);
    const r = asRecord(row);
    return {
      sessionId: r.session_id as string,
      positionId: r.position_id as string,
      positionRole: r.position_role as string,
    };
  });

/**
 * The structured entry contract.
 *
 * The separation is the point. An observable fact, what the candidate said
 * about it, what the interviewer makes of it, and what else could explain it
 * are four different kinds of claim, and collapsing them into one note box is
 * precisely how an interpretation ends up being read later as a fact. The
 * database stores them in four columns; this validator refuses to merge them.
 */
const entryFields = z.object({
  itemKey: z.string().min(1).max(200),
  topicId: z.string().uuid().nullable().optional(),
  observableFact: z.string().max(8000).optional(),
  candidateExplanation: z.string().max(8000).optional(),
  interviewerInterpretation: z.string().max(8000).optional(),
  alternativeExplanation: z.string().max(8000).optional(),
  protectiveFactor: z.string().max(8000).optional(),
  verificationNeed: z.string().max(8000).optional(),
  verificationState: z.enum(BESKT_VERIFICATION_STATES).optional(),
  verificationSource: z.string().max(2000).optional(),
  sensitivityClass: z.enum(BESKT_SENSITIVITY_CLASSES).optional(),
});

/** Record or correct one structured entry in the caller's own position. */
export const saveBesktConductEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    operation
      .extend({
        positionId: z.string().uuid(),
        expectedRevision: z.number().int().nonnegative(),
        entry: entryFields,
        correctsEntryId: z.string().uuid().nullable().optional(),
        correctionReason: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const e = data.entry;
    const { data: row, error } = await context.supabase.rpc("bcp_conduct_save_entry", {
      _operation_id: data.operationId,
      _position_id: data.positionId,
      _expected_revision: data.expectedRevision,
      _entry: {
        item_key: e.itemKey,
        topic_id: e.topicId ?? null,
        observable_fact: e.observableFact ?? null,
        candidate_explanation: e.candidateExplanation ?? null,
        interviewer_interpretation: e.interviewerInterpretation ?? null,
        alternative_explanation: e.alternativeExplanation ?? null,
        protective_factor: e.protectiveFactor ?? null,
        verification_need: e.verificationNeed ?? null,
        verification_state: e.verificationState ?? "not_required",
        verification_source: e.verificationSource ?? null,
        sensitivity_class: e.sensitivityClass ?? "ordinary",
      },
      _corrects_entry_id: data.correctsEntryId ?? undefined,
      _correction_reason: data.correctionReason ?? undefined,
    });
    if (error) throw new Error(error.message);
    const r = asRecord(row);
    return {
      entryId: r.entry_id as string,
      positionId: r.position_id as string,
      sessionId: r.session_id as string,
      itemKey: r.item_key as string,
      entryVersion: r.entry_version as number,
      supersedesEntryId: str(r.supersedes_entry_id),
      positionRevision: r.position_revision as number,
    };
  });

/**
 * Move one entry's verification along, appending to its history.
 *
 * An open verification need is a piece of work, not a finding. Nothing in this
 * path derives a conclusion from the state, and `not_verified` means exactly
 * "we did not manage to verify this" — never "the candidate was untruthful".
 */
export const recordBesktVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    operation
      .extend({
        entryId: z.string().uuid(),
        expectedRevision: z.number().int().nonnegative(),
        newState: z.enum(BESKT_VERIFICATION_STATES),
        source: z.string().max(2000).optional(),
        note: z.string().max(8000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("bcp_conduct_record_verification", {
      _operation_id: data.operationId,
      _entry_id: data.entryId,
      _expected_revision: data.expectedRevision,
      _new_state: data.newState,
      _source: data.source ?? undefined,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    const r = asRecord(row);
    return {
      entryId: r.entry_id as string,
      seq: r.seq as number,
      previousState: str(r.previous_state) as BesktVerificationState | null,
      newState: r.new_state as BesktVerificationState,
      positionRevision: r.position_revision as number,
    };
  });

/**
 * Lock the caller's own position.
 *
 * This is the moment the independence rule is satisfied, and it is deliberately
 * a separate, confirmed act: until it happens nobody else's position has been
 * fetched, and afterwards the caller can be shown what the database already
 * allowed them to see.
 */
export const lockBesktPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    operation
      .extend({
        positionId: z.string().uuid(),
        expectedRevision: z.number().int().nonnegative(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("bcp_conduct_lock_position", {
      _operation_id: data.operationId,
      _position_id: data.positionId,
      _expected_revision: data.expectedRevision,
    });
    if (error) throw new Error(error.message);
    const r = asRecord(row);
    return {
      positionId: r.position_id as string,
      sessionId: r.session_id as string,
      state: r.state as string,
      entryCount: r.entry_count as number,
      positionRevision: r.position_revision as number,
    };
  });

/** Reopen a locked position. Requires a reason and leaves an audit event. */
export const reopenBesktPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    operation
      .extend({
        positionId: z.string().uuid(),
        expectedRevision: z.number().int().nonnegative(),
        reason: z.string().min(3).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("bcp_conduct_reopen_position", {
      _operation_id: data.operationId,
      _position_id: data.positionId,
      _expected_revision: data.expectedRevision,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    const r = asRecord(row);
    return {
      positionId: r.position_id as string,
      sessionId: r.session_id as string,
      state: r.state as string,
      reopenCount: r.reopen_count as number,
      positionRevision: r.position_revision as number,
    };
  });

/** Open the panel for a session. Opening is not revealing. */
export const openBesktPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => operation.extend({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("bcp_conduct_open_panel", {
      _operation_id: data.operationId,
      _session_id: data.sessionId,
    });
    if (error) throw new Error(error.message);
    const r = asRecord(row);
    return {
      panelId: r.panel_id as string,
      sessionId: r.session_id as string,
      state: r.state as string,
    };
  });

/**
 * Reveal the panel: the locked positions become readable side by side.
 *
 * The database refuses this while any participant is still unlocked, which is
 * what keeps the reveal from being a way to read a colleague's work early.
 */
export const revealBesktPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    operation
      .extend({ panelId: z.string().uuid(), expectedRevision: z.number().int().nonnegative() })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("bcp_conduct_reveal_panel", {
      _operation_id: data.operationId,
      _panel_id: data.panelId,
      _expected_revision: data.expectedRevision,
    });
    if (error) throw new Error(error.message);
    const r = asRecord(row);
    return {
      panelId: r.panel_id as string,
      sessionId: r.session_id as string,
      state: r.state as string,
      positionCount: r.position_count as number,
      panelRevision: r.panel_revision as number,
    };
  });

/**
 * Record the panel's outcome for one governed item.
 *
 * `disagreed` is a first-class outcome, and it carries the divergent statement
 * with it. A panel that could only record agreement would push a minority view
 * out of the record, which is the opposite of what a documented disagreement is
 * for. Neither kind is a score, and recording one does not touch the
 * assessors' own positions.
 */
export const recordBesktPanelResolution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    operation
      .extend({
        panelId: z.string().uuid(),
        expectedRevision: z.number().int().nonnegative(),
        itemKey: z.string().min(1).max(200),
        resolutionKind: z.enum(BESKT_RESOLUTION_KINDS),
        agreedStatement: z.string().max(8000).optional(),
        divergentStatement: z.string().max(8000).optional(),
        rationale: z.string().min(3).max(8000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("bcp_conduct_record_resolution", {
      _operation_id: data.operationId,
      _panel_id: data.panelId,
      _expected_revision: data.expectedRevision,
      _item_key: data.itemKey,
      _resolution_kind: data.resolutionKind,
      // The generated types type these optional SQL arguments as non-nullable;
      // the database accepts NULL for "not provided".
      _agreed_statement: (data.agreedStatement ?? null) as unknown as string,
      _divergent_statement: (data.divergentStatement ?? null) as unknown as string,
      _rationale: data.rationale,
    });
    if (error) throw new Error(error.message);
    const r = asRecord(row);
    return {
      resolutionId: r.resolution_id as string,
      panelId: r.panel_id as string,
      itemKey: r.item_key as string,
      resolutionKind: r.resolution_kind as BesktResolutionKind,
      panelRevision: r.panel_revision as number,
    };
  });

// ---------------------------------------------------------------------------
// The module gate.
//
// BESKT appears inside an interview case only when four things are true at
// once, and all four are FACTS THE SERVER ESTABLISHES rather than flags the
// client sets:
//
//   1. the case has a live PR 4 link to a candidate preparation;
//   2. that preparation has actually been submitted;
//   3. the caller is a member of the employer that owns it — the database
//      refuses the read outright otherwise;
//   4. the bound method version still agrees with what was submitted.
//
// (4) is worth stating plainly. The link froze a method content hash at the
// moment it was made. If the governed content the answers were given against
// is no longer the content the session would be conducted against, the honest
// thing is to say so and NOT offer the tool, because every question, purpose
// and item key in the workspace would be from a different document than the
// one the candidate read.
// ---------------------------------------------------------------------------

export interface BesktSnapshotAnswer {
  readonly itemKey: string;
  readonly responseState: "answered" | "omitted" | "discuss_orally";
  readonly wordingSv: string | null;
  readonly wordingEn: string | null;
  readonly purposeSv: string | null;
  readonly purposeEn: string | null;
  readonly valueBoolean: boolean | null;
  readonly valueText: string | null;
  readonly valueDate: string | null;
  readonly selectedOptionKeys: readonly string[];
}

export interface BesktCaseModule {
  readonly caseId: string;
  readonly linked: boolean;
  readonly linkId: string | null;
  readonly assignmentId: string | null;
  readonly applicationId: string | null;
  readonly linkedAt: string | null;
  readonly submitted: boolean;
  /** The bound content hash still equals the one the answers were given against. */
  readonly methodBindingValid: boolean;
  readonly method: {
    readonly methodVersionId: string;
    readonly packSlug: string | null;
    readonly nameSv: string | null;
    readonly nameEn: string | null;
    readonly versionNumber: number | null;
    readonly mode: string | null;
    readonly validationLabel: string | null;
    readonly releaseScope: string | null;
    readonly contentHash: string;
    readonly answersContentHash: string;
  } | null;
  readonly answers: readonly BesktSnapshotAnswer[];
  readonly topics: readonly {
    readonly itemKey: string;
    readonly reason: BesktTopicReason;
    readonly wordingSv: string | null;
    readonly wordingEn: string | null;
    readonly purposeSv: string | null;
    readonly purposeEn: string | null;
  }[];
  /** The conduct session for this case, if one has been opened. */
  readonly sessionId: string | null;
  readonly sessionState: string | null;
  /** True only when all four gate conditions hold. */
  readonly available: boolean;
}

const EMPTY_MODULE = (caseId: string): BesktCaseModule => ({
  caseId,
  linked: false,
  linkId: null,
  assignmentId: null,
  applicationId: null,
  linkedAt: null,
  submitted: false,
  methodBindingValid: false,
  method: null,
  answers: [],
  topics: [],
  sessionId: null,
  sessionState: null,
  available: false,
});

/**
 * Everything the case overview and the BESKT route need to decide whether the
 * module exists, and to render its header and its immutable snapshot.
 *
 * The session lookup is a plain policy-governed SELECT, not a write and not a
 * privileged read: `bcp_conduct_sessions` carries a member-read policy, so a
 * caller who may not read the case gets no row for the same reason they get no
 * basis. There is one session per link by unique constraint, so this cannot
 * pick the wrong one.
 */
export const getBesktCaseModule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<BesktCaseModule> => {
    const { data: basisRow, error: basisError } = await context.supabase.rpc(
      "bcp_case_preparation_basis",
      { _case_id: data.caseId },
    );
    if (basisError) throw new Error(basisError.message);

    const basis = asRecord(basisRow);
    if (basis.linked !== true) return EMPTY_MODULE(data.caseId);

    const linkId = basis.link_id as string;
    const assignmentId = basis.assignment_id as string;
    const bound = asRecord(basis.bound);

    const { data: readbackRow, error: readbackError } = await context.supabase.rpc(
      "bcp_employer_readback",
      { _assignment_id: assignmentId },
    );
    if (readbackError) throw new Error(readbackError.message);
    const readback = asRecord(readbackRow);
    const method = asRecord(readback.method);
    const submittedResponse = readback.submitted_response
      ? asRecord(readback.submitted_response)
      : null;

    const submitted = readback.is_submitted === true && submittedResponse !== null;

    // The binding check. Equality of the two hashes is the whole claim: the
    // governed content the candidate answered against is the governed content
    // this session would be conducted against.
    const boundContentHash = str(bound.content_hash);
    const submittedMethodHash = submittedResponse
      ? str(submittedResponse.submitted_method_content_hash)
      : null;
    const methodBindingValid =
      boundContentHash !== null &&
      submittedMethodHash !== null &&
      boundContentHash === submittedMethodHash &&
      str(bound.method_version_id) !== null;

    const { data: sessionRow, error: sessionError } = await context.supabase
      .from("bcp_conduct_sessions")
      .select("id, state")
      .eq("case_id", data.caseId)
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message);

    return {
      caseId: data.caseId,
      linked: true,
      linkId,
      assignmentId,
      applicationId: str(basis.application_id),
      linkedAt: str(basis.linked_at),
      submitted,
      methodBindingValid,
      method: {
        methodVersionId: bound.method_version_id as string,
        packSlug: str(method.pack_slug),
        nameSv: str(method.name_sv),
        nameEn: str(method.name_en),
        versionNumber: typeof method.version_number === "number" ? method.version_number : null,
        mode: str(method.mode),
        validationLabel: str(method.validation_label),
        releaseScope: str(method.release_scope),
        contentHash: boundContentHash ?? "",
        answersContentHash: str(bound.answers_content_hash) ?? "",
      },
      answers: asArray(basis.answers).map((a) => ({
        itemKey: a.item_key as string,
        responseState: a.response_state as BesktSnapshotAnswer["responseState"],
        wordingSv: str(a.wording_sv),
        wordingEn: str(a.wording_en),
        purposeSv: str(a.purpose_sv),
        purposeEn: str(a.purpose_en),
        valueBoolean: typeof a.value_boolean === "boolean" ? a.value_boolean : null,
        valueText: str(a.value_text),
        valueDate: str(a.value_date),
        selectedOptionKeys: Array.isArray(a.selected_option_keys)
          ? (a.selected_option_keys as string[])
          : [],
      })),
      topics: asArray(basis.topics).map((t) => ({
        itemKey: t.item_key as string,
        reason: t.reason as BesktTopicReason,
        wordingSv: str(t.wording_sv),
        wordingEn: str(t.wording_en),
        purposeSv: str(t.purpose_sv),
        purposeEn: str(t.purpose_en),
      })),
      sessionId: sessionRow ? (sessionRow.id as string) : null,
      sessionState: sessionRow ? (sessionRow.state as string) : null,
      available: submitted && methodBindingValid,
    };
  });
