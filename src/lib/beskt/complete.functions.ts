// BESKT as a complete product (20261130090000) — the application-side access
// to the security function, the start of an assignment by application or by
// invitation, the method preview, the interview preparation, the candidate's
// supplements, and the responsible human's stance and actions.
//
// Every function is a thin, typed pass-through to one governed RPC. It holds
// no authorisation logic: the database decides who may do what, and re-checks
// it on every call. A security vetting in particular is visible to the
// employer's appointed security function only — the rows simply do not come
// back for anyone else.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BesktMode = "recruitment_support" | "security_vetting_support";
const mode = z.enum(["recruitment_support", "security_vetting_support"]);

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v as string | null | undefined) ?? null;

// The RPCs are newer than the generated types; the cast keeps the call site
// honest about that rather than widening the generated file by hand.
async function rpc<T>(
  supabase: {
    rpc: (
      fn: never,
      args: never,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  },
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

/* ------------------------------------------------------------------ */
/* The employer's people and its security function                      */
/* ------------------------------------------------------------------ */

export interface BesktPerson {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly employerRole: string;
  readonly isSecurityOfficer: boolean;
  readonly officerId: string | null;
}

export const listBesktPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ employerId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<readonly BesktPerson[]> => {
    const rows = await rpc<Row[]>(context.supabase as never, "bcp_employer_people", {
      _employer_id: data.employerId,
    });
    return (rows ?? []).map((r) => ({
      userId: r.user_id as string,
      displayName: r.display_name as string,
      email: r.email as string,
      employerRole: r.employer_role as string,
      isSecurityOfficer: Boolean(r.is_security_officer),
      officerId: s(r.officer_id),
    }));
  });

export const appointBesktSecurityOfficer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        employerId: z.string().uuid(),
        userId: z.string().uuid(),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await rpc<Row>(context.supabase as never, "bcp_appoint_security_officer", {
      _operation_id: data.operationId,
      _employer_id: data.employerId,
      _user_id: data.userId,
      _reason: data.reason,
    });
    return { ok: true };
  });

export const revokeBesktSecurityOfficer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        officerId: z.string().uuid(),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await rpc<Row>(context.supabase as never, "bcp_revoke_security_officer", {
      _operation_id: data.operationId,
      _officer_id: data.officerId,
      _reason: data.reason,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* What the employer sees before starting                               */
/* ------------------------------------------------------------------ */

export interface BesktPreviewItem {
  readonly itemKey: string;
  readonly wordingSv: string | null;
  readonly wordingEn: string | null;
  readonly purposeSv: string | null;
  readonly purposeEn: string | null;
  readonly answerType: string;
  readonly requiredness: string;
  readonly discussOrallyAllowed: boolean;
  readonly isFollowUp: boolean;
}

export interface BesktPreviewSection {
  readonly sectionKey: string;
  readonly titleSv: string | null;
  readonly titleEn: string | null;
  readonly itemCount: number;
  readonly items: readonly BesktPreviewItem[];
}

export interface BesktMethodPreview {
  readonly methodVersionId: string;
  readonly mode: BesktMode;
  readonly contentStatus: string;
  readonly validationLabel: string;
  /** False when security-vetting wording is withheld from a non-officer. */
  readonly wordingVisible: boolean;
  readonly sections: readonly BesktPreviewSection[];
}

export const getBesktMethodPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        methodVersionId: z.string().uuid(),
        exposureProfileId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<BesktMethodPreview> => {
    const r = await rpc<Row>(context.supabase as never, "bcp_method_preview", {
      _employer_id: data.employerId,
      _method_version_id: data.methodVersionId,
      _exposure_profile_id: data.exposureProfileId,
    });
    return {
      methodVersionId: r.method_version_id as string,
      mode: r.mode as BesktMode,
      contentStatus: r.content_status as string,
      validationLabel: r.validation_label as string,
      wordingVisible: Boolean(r.wording_visible),
      sections: ((r.sections as Row[] | null) ?? []).map((sec) => ({
        sectionKey: sec.section_key as string,
        titleSv: s(sec.title_sv),
        titleEn: s(sec.title_en),
        itemCount: Number(sec.item_count ?? 0),
        items: ((sec.items as Row[] | null) ?? []).map((i) => ({
          itemKey: i.item_key as string,
          wordingSv: s(i.wording_sv),
          wordingEn: s(i.wording_en),
          purposeSv: s(i.purpose_sv),
          purposeEn: s(i.purpose_en),
          answerType: i.answer_type as string,
          requiredness: i.requiredness as string,
          discussOrallyAllowed: Boolean(i.discuss_orally_allowed),
          isFollowUp: Boolean(i.is_follow_up),
        })),
      })),
    };
  });

/* ------------------------------------------------------------------ */
/* Starting BESKT: by application, or by invitation                     */
/* ------------------------------------------------------------------ */

const startCommon = {
  mode,
  methodVersionId: z.string().uuid(),
  exposureProfileId: z.string().uuid(),
  expectedContentHash: z.string().regex(/^[0-9a-f]{64}$/),
  responsibleInterviewerId: z.string().uuid(),
  contactStatement: z.string().trim().min(3).max(1000),
  securityOwnerId: z.string().uuid().nullable(),
  roleSecurityAttestation: z.string().trim().max(2000).nullable(),
  lawfulBasisStatement: z.string().trim().max(2000).nullable(),
};

export const startBeskt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        applicationId: z.string().uuid(),
        ...startCommon,
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ assignmentId: string }> => {
    const r = await rpc<Row>(context.supabase as never, "bcp_start_beskt", {
      _operation_id: data.operationId,
      _application_id: data.applicationId,
      _mode: data.mode,
      _method_version_id: data.methodVersionId,
      _exposure_profile_id: data.exposureProfileId,
      _expected_content_hash: data.expectedContentHash,
      _responsible_interviewer_id: data.responsibleInterviewerId,
      _contact_statement: data.contactStatement,
      _security_owner_id: data.securityOwnerId,
      _role_security_attestation: data.roleSecurityAttestation,
      _lawful_basis_statement: data.lawfulBasisStatement,
    });
    return { assignmentId: r.assignment_id as string };
  });

export const createBesktInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        employerId: z.string().uuid(),
        invitedEmail: z.string().trim().email(),
        candidateDisplayName: z.string().trim().max(200).nullable(),
        roleTitle: z.string().trim().min(1).max(200),
        ...startCommon,
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ invitationId: string; token: string }> => {
    const r = await rpc<Row>(context.supabase as never, "bcp_create_invitation", {
      _operation_id: data.operationId,
      _employer_id: data.employerId,
      _invited_email: data.invitedEmail,
      _candidate_display_name: data.candidateDisplayName,
      _role_title: data.roleTitle,
      _mode: data.mode,
      _method_version_id: data.methodVersionId,
      _exposure_profile_id: data.exposureProfileId,
      _expected_content_hash: data.expectedContentHash,
      _responsible_interviewer_id: data.responsibleInterviewerId,
      _contact_statement: data.contactStatement,
      _security_owner_id: data.securityOwnerId,
      _role_security_attestation: data.roleSecurityAttestation,
      _lawful_basis_statement: data.lawfulBasisStatement,
    });
    return { invitationId: r.invitation_id as string, token: r.token as string };
  });

export const revokeBesktInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        invitationId: z.string().uuid(),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await rpc<Row>(context.supabase as never, "bcp_revoke_invitation", {
      _operation_id: data.operationId,
      _invitation_id: data.invitationId,
      _reason: data.reason,
    });
    return { ok: true };
  });

export interface BesktInvitationRow {
  readonly invitationId: string;
  readonly invitedEmail: string;
  readonly candidateDisplayName: string | null;
  readonly roleTitle: string;
  readonly mode: BesktMode;
  readonly state: "pending" | "accepted" | "revoked";
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly acceptedAt: string | null;
  readonly assignmentId: string | null;
}

export const listBesktInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ employerId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<readonly BesktInvitationRow[]> => {
    const rows = await rpc<Row[]>(context.supabase as never, "bcp_employer_invitations", {
      _employer_id: data.employerId,
    });
    return (rows ?? []).map((r) => ({
      invitationId: r.invitation_id as string,
      invitedEmail: r.invited_email as string,
      candidateDisplayName: s(r.candidate_display_name),
      roleTitle: r.role_title as string,
      mode: r.mode as BesktMode,
      state: r.state as BesktInvitationRow["state"],
      createdAt: r.created_at as string,
      expiresAt: r.expires_at as string,
      acceptedAt: s(r.accepted_at),
      assignmentId: s(r.assignment_id),
    }));
  });

export interface BesktInvitationView {
  readonly available: boolean;
  readonly reason: string | null;
  readonly invitationId: string | null;
  readonly employerName: string | null;
  readonly roleTitle: string | null;
  readonly mode: BesktMode | null;
  readonly contactStatement: string | null;
  readonly expiresAt: string | null;
  readonly assignmentId: string | null;
}

export const getBesktInvitation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }).parse(d))
  .handler(async ({ context, data }): Promise<BesktInvitationView> => {
    const r = await rpc<Row>(context.supabase as never, "bcp_invitation_for_token", {
      _token: data.token,
    });
    return {
      available: Boolean(r.available),
      reason: s(r.reason),
      invitationId: s(r.invitation_id),
      employerName: s(r.employer_name),
      roleTitle: s(r.role_title),
      mode: (s(r.mode) as BesktMode | null) ?? null,
      contactStatement: s(r.contact_statement),
      expiresAt: s(r.expires_at),
      assignmentId: s(r.assignment_id),
    };
  });

export const acceptBesktInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ operationId: z.string().uuid(), token: z.string().regex(/^[0-9a-f]{64}$/) })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ assignmentId: string }> => {
    const r = await rpc<Row>(context.supabase as never, "bcp_accept_invitation", {
      _operation_id: data.operationId,
      _token: data.token,
    });
    return { assignmentId: r.assignment_id as string };
  });

/* ------------------------------------------------------------------ */
/* The employer's BESKT assignments                                     */
/* ------------------------------------------------------------------ */

export interface BesktAssignmentListRow {
  readonly assignmentId: string;
  readonly mode: BesktMode;
  readonly applicationId: string | null;
  readonly invitationId: string | null;
  readonly roleTitle: string | null;
  readonly candidateDisplayName: string;
  readonly methodNameSv: string | null;
  readonly methodNameEn: string | null;
  readonly lifecycleState: string;
  readonly assignedAt: string;
  readonly submittedAt: string | null;
  readonly responsibleInterviewerId: string | null;
  readonly caseId: string | null;
  readonly reportFinalised: boolean;
}

export const listBesktAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ employerId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<readonly BesktAssignmentListRow[]> => {
    const rows = await rpc<Row[]>(context.supabase as never, "bcp_employer_beskt_assignments", {
      _employer_id: data.employerId,
    });
    return (rows ?? []).map((r) => ({
      assignmentId: r.assignment_id as string,
      mode: r.mode as BesktMode,
      applicationId: s(r.application_id),
      invitationId: s(r.invitation_id),
      roleTitle: s(r.role_title),
      candidateDisplayName: r.candidate_display_name as string,
      methodNameSv: s(r.method_name_sv),
      methodNameEn: s(r.method_name_en),
      lifecycleState: r.lifecycle_state as string,
      assignedAt: r.assigned_at as string,
      submittedAt: s(r.submitted_at),
      responsibleInterviewerId: s(r.responsible_interviewer_id),
      caseId: s(r.case_id),
      reportFinalised: Boolean(r.report_finalised),
    }));
  });

/* ------------------------------------------------------------------ */
/* The candidate's supplements                                          */
/* ------------------------------------------------------------------ */

export interface BesktSupplement {
  readonly supplementId: string;
  readonly itemKey: string | null;
  readonly kind: "correction" | "addition";
  readonly body: string;
  readonly submittedAt: string;
}

export const listBesktSupplements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ assignmentId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<readonly BesktSupplement[]> => {
    const rows = await rpc<Row[]>(context.supabase as never, "bcp_assignment_supplements", {
      _assignment_id: data.assignmentId,
    });
    return (rows ?? []).map((r) => ({
      supplementId: r.supplement_id as string,
      itemKey: s(r.item_key),
      kind: r.supplement_kind as BesktSupplement["kind"],
      body: r.body as string,
      submittedAt: r.submitted_at as string,
    }));
  });

export const submitBesktSupplement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        assignmentId: z.string().uuid(),
        kind: z.enum(["correction", "addition"]),
        itemKey: z
          .string()
          .regex(/^[a-z0-9][a-z0-9_]*$/)
          .nullable(),
        body: z.string().trim().min(3).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await rpc<Row>(context.supabase as never, "bcp_submit_supplement", {
      _operation_id: data.operationId,
      _assignment_id: data.assignmentId,
      _supplement_kind: data.kind,
      _item_key: data.itemKey,
      _body: data.body,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Interview preparation: three lists with provenance                    */
/* ------------------------------------------------------------------ */

export interface BesktPrepEntry {
  readonly itemKey: string;
  readonly sectionKey: string;
  readonly wordingSv: string | null;
  readonly wordingEn: string | null;
  readonly purposeSv: string | null;
  readonly purposeEn: string | null;
  readonly provenance: "base_question" | "candidate_statement" | "role_exposure";
  readonly reason: string | null;
  readonly triggerRuleKey: string | null;
}

export interface BesktInterviewPreparation {
  readonly mode: BesktMode;
  readonly role: {
    readonly roleTitle: string | null;
    readonly exposureArea: string | null;
    readonly dutiesSv: string | null;
    readonly dutiesEn: string | null;
    readonly rationaleSv: string | null;
    readonly rationaleEn: string | null;
    readonly roleSecurityAttestation: string | null;
  };
  readonly base: readonly BesktPrepEntry[];
  readonly candidate: readonly BesktPrepEntry[];
  readonly roleExposure: readonly BesktPrepEntry[];
  readonly supplements: ReadonlyArray<{
    readonly itemKey: string | null;
    readonly kind: string;
    readonly body: string;
    readonly submittedAt: string;
  }>;
}

const prepEntry = (r: Row): BesktPrepEntry => ({
  itemKey: r.item_key as string,
  sectionKey: r.section_key as string,
  wordingSv: s(r.wording_sv),
  wordingEn: s(r.wording_en),
  purposeSv: s(r.purpose_sv),
  purposeEn: s(r.purpose_en),
  provenance: r.provenance as BesktPrepEntry["provenance"],
  reason: s(r.reason),
  triggerRuleKey: s(r.trigger_rule_key),
});

export const getBesktInterviewPreparation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<BesktInterviewPreparation> => {
    const r = await rpc<Row>(context.supabase as never, "bcp_interview_preparation", {
      _session_id: data.sessionId,
    });
    const role = (r.role as Row | null) ?? {};
    return {
      mode: r.mode as BesktMode,
      role: {
        roleTitle: s(role.role_title),
        exposureArea: s(role.exposure_area),
        dutiesSv: s(role.duties_sv),
        dutiesEn: s(role.duties_en),
        rationaleSv: s(role.rationale_sv),
        rationaleEn: s(role.rationale_en),
        roleSecurityAttestation: s(role.role_security_attestation),
      },
      base: ((r.base as Row[] | null) ?? []).map(prepEntry),
      candidate: ((r.candidate as Row[] | null) ?? []).map(prepEntry),
      roleExposure: ((r.role_exposure as Row[] | null) ?? []).map(prepEntry),
      supplements: ((r.supplements as Row[] | null) ?? []).map((x) => ({
        itemKey: s(x.item_key),
        kind: x.kind as string,
        body: x.body as string,
        submittedAt: x.submitted_at as string,
      })),
    };
  });

/* ------------------------------------------------------------------ */
/* The responsible human's stance and the actions                       */
/* ------------------------------------------------------------------ */

export interface BesktStance {
  readonly version: number;
  readonly sufficiency: "sufficient" | "more_information_required";
  readonly sufficiencyReason: string;
  readonly stance: string;
  readonly rationale: string;
  readonly decidedByName: string;
  readonly decidedRole: string;
  readonly decidedAt: string;
  readonly correctionReason: string | null;
}

export interface BesktAction {
  readonly actionKey: string;
  readonly version: number;
  readonly description: string;
  readonly responsible: string;
  readonly dueOn: string | null;
  readonly status: "planned" | "in_progress" | "done" | "cancelled";
  readonly reviewOn: string | null;
  readonly note: string | null;
}

export interface BesktDecision {
  readonly mayRecord: boolean;
  readonly stanceVersion: number;
  readonly stance: BesktStance | null;
  readonly actions: readonly BesktAction[];
}

export function parseStance(x: Row | null | undefined): BesktStance | null {
  if (!x) return null;
  return {
    version: Number(x.version),
    sufficiency: x.sufficiency as BesktStance["sufficiency"],
    sufficiencyReason: x.sufficiency_reason as string,
    stance: x.stance as string,
    rationale: x.rationale as string,
    decidedByName: x.decided_by_name as string,
    decidedRole: x.decided_role as string,
    decidedAt: x.decided_at as string,
    correctionReason: s(x.correction_reason),
  };
}

export function parseActions(x: unknown): readonly BesktAction[] {
  return ((x as Row[] | null) ?? []).map((a) => ({
    actionKey: a.action_key as string,
    version: Number(a.version),
    description: a.description as string,
    responsible: a.responsible as string,
    dueOn: s(a.due_on),
    status: a.status as BesktAction["status"],
    reviewOn: s(a.review_on),
    note: s(a.note),
  }));
}

export const getBesktDecision = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<BesktDecision> => {
    const r = await rpc<Row>(context.supabase as never, "bcp_conduct_decision", {
      _session_id: data.sessionId,
    });
    return {
      mayRecord: Boolean(r.may_decide),
      stanceVersion: Number(r.stance_version ?? 0),
      stance: parseStance(r.stance as Row | null),
      actions: parseActions(r.actions),
    };
  });

export const recordBesktStance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        sessionId: z.string().uuid(),
        expectedVersion: z.number().int().min(0),
        sufficiency: z.enum(["sufficient", "more_information_required"]),
        sufficiencyReason: z.string().trim().min(10).max(4000),
        stance: z.string().trim().min(10).max(4000),
        rationale: z.string().trim().min(10).max(8000),
        decidedByName: z.string().trim().min(2).max(200),
        decidedRole: z.string().trim().min(2).max(200),
        correctionReason: z.string().trim().max(1000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await rpc<Row>(context.supabase as never, "bcp_conduct_record_stance", {
      _operation_id: data.operationId,
      _session_id: data.sessionId,
      _expected_version: data.expectedVersion,
      _sufficiency: data.sufficiency,
      _sufficiency_reason: data.sufficiencyReason,
      _stance: data.stance,
      _rationale: data.rationale,
      _decided_by_name: data.decidedByName,
      _decided_role: data.decidedRole,
      _correction_reason: data.correctionReason,
    });
    return { ok: true };
  });

export const recordBesktAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        sessionId: z.string().uuid(),
        actionKey: z.string().uuid().nullable(),
        expectedVersion: z.number().int().min(0),
        description: z.string().trim().min(3).max(2000),
        responsible: z.string().trim().min(2).max(200),
        dueOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        status: z.enum(["planned", "in_progress", "done", "cancelled"]),
        reviewOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        note: z.string().trim().max(2000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await rpc<Row>(context.supabase as never, "bcp_conduct_record_action", {
      _operation_id: data.operationId,
      _session_id: data.sessionId,
      _action_key: data.actionKey,
      _expected_version: data.expectedVersion,
      _description: data.description,
      _responsible: data.responsible,
      _due_on: data.dueOn,
      _status: data.status,
      _review_on: data.reviewOn,
      _note: data.note,
    });
    return { ok: true };
  });

/** Who the signed-in person is in this organisation, for what the screen
 *  offers. The database still decides every action on its own. */
export const getMyBesktStanding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ employerId: z.string().uuid() }).parse(d))
  .handler(
    async ({
      context,
      data,
    }): Promise<{ userId: string; isSecurityOfficer: boolean; employerRole: string | null }> => {
      const rows = await rpc<Row[]>(context.supabase as never, "bcp_employer_people", {
        _employer_id: data.employerId,
      });
      const me = (rows ?? []).find((r) => r.user_id === context.userId);
      return {
        userId: context.userId,
        isSecurityOfficer: Boolean(me?.is_security_officer),
        employerRole: s(me?.employer_role),
      };
    },
  );
