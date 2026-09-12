// BESKT candidate preparation — the only application-side access to the
// PR 3 runtime.
//
// Every function here is a thin, typed pass-through to one governed RPC. It
// holds NO authorisation logic of its own: the database decides who may start
// a preparation, who may answer it, who may read a draft and who may read a
// submitted basis, and it re-checks on every call. A crafted request that
// skips this file therefore gains nothing.
//
// What this file must never grow: a score, a ranking, a suitability or
// credibility judgement, a recommendation, a report, or anything that writes
// a job-application status. Those are PR 4 onwards, and several of them are
// prohibited outright by the PR 1 contract.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The candidate's three explicit response states. There is no fourth. */
export type BesktResponseState = "answered" | "omitted" | "discuss_orally";

/** The governed typed answer contract, mirrored from the governed item. */
export type BesktAnswerType =
  | "single_choice"
  | "multi_choice"
  | "boolean"
  | "short_text"
  | "long_text"
  | "date"
  | "acknowledgement";

export type BesktLifecycleState =
  | "assigned"
  | "notice_acknowledged"
  | "in_progress"
  | "submitted"
  | "cancelled";

export interface BesktAssignableMethod {
  readonly methodVersionId: string;
  readonly packSlug: string;
  readonly nameSv: string | null;
  readonly nameEn: string | null;
  readonly purposeSv: string | null;
  readonly versionNumber: number;
  readonly mode: string;
  readonly validationLabel: string;
  readonly releaseScope: string;
  readonly contentHash: string;
  readonly summarySv: string | null;
  readonly summaryEn: string | null;
  readonly grantExpiresOn: string;
}

const employerInput = z.object({ employerId: z.string().uuid() });
const assignmentInput = z.object({ assignmentId: z.string().uuid() });

/**
 * The BESKT methods this employer may actually start right now.
 *
 * An empty list is the HONEST answer, not a failure: until a governed method
 * has passed its five human review gates AND the owner has admitted this
 * employer to the pilot, there is nothing to offer. The screen says so.
 */
export const listAssignableBesktMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => employerInput.parse(d))
  .handler(async ({ context, data }): Promise<readonly BesktAssignableMethod[]> => {
    const { data: rows, error } = await context.supabase.rpc("bcp_assignable_method_versions", {
      _employer_id: data.employerId,
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      methodVersionId: r.method_version_id as string,
      packSlug: r.pack_slug as string,
      nameSv: (r.name_sv as string | null) ?? null,
      nameEn: (r.name_en as string | null) ?? null,
      purposeSv: (r.purpose_sv as string | null) ?? null,
      versionNumber: r.version_number as number,
      mode: r.mode as string,
      validationLabel: r.validation_label as string,
      releaseScope: r.release_scope as string,
      contentHash: r.content_hash as string,
      summarySv: (r.summary_sv as string | null) ?? null,
      summaryEn: (r.summary_en as string | null) ?? null,
      grantExpiresOn: r.grant_expires_on as string,
    }));
  });

export interface BesktEmployerAssignmentRow {
  readonly assignmentId: string;
  readonly applicationId: string;
  readonly jobId: string;
  readonly jobTitleSv: string | null;
  readonly jobTitleEn: string | null;
  readonly candidateUserId: string;
  readonly methodNameSv: string | null;
  readonly methodNameEn: string | null;
  readonly methodVersionNumber: number;
  readonly contentHash: string;
  readonly lifecycleState: BesktLifecycleState;
  readonly assignedAt: string;
  readonly dueAt: string | null;
  readonly submittedAt: string | null;
}

export const listEmployerBesktPreparations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => employerInput.parse(d))
  .handler(async ({ context, data }): Promise<readonly BesktEmployerAssignmentRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("bcp_employer_assignments", {
      _employer_id: data.employerId,
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      assignmentId: r.assignment_id as string,
      applicationId: r.application_id as string,
      jobId: r.job_id as string,
      jobTitleSv: (r.job_title_sv as string | null) ?? null,
      jobTitleEn: (r.job_title_en as string | null) ?? null,
      candidateUserId: r.candidate_user_id as string,
      methodNameSv: (r.method_name_sv as string | null) ?? null,
      methodNameEn: (r.method_name_en as string | null) ?? null,
      methodVersionNumber: r.method_version_number as number,
      contentHash: r.content_hash as string,
      lifecycleState: r.lifecycle_state as BesktLifecycleState,
      assignedAt: r.assigned_at as string,
      dueAt: (r.due_at as string | null) ?? null,
      submittedAt: (r.submitted_at as string | null) ?? null,
    }));
  });

/**
 * Start a preparation from an EXISTING application.
 *
 * The caller names the content hash it was looking at; if the governed method
 * moved since the screen rendered, the database refuses rather than quietly
 * assigning different questions.
 */
export const startBesktPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        applicationId: z.string().uuid(),
        methodVersionId: z.string().uuid(),
        exposureProfileId: z.string().uuid(),
        expectedContentHash: z.string().regex(/^[0-9a-f]{64}$/),
        noticeVersion: z.string().min(1),
        dueAt: z.string().datetime().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly assignmentId: string }> => {
    const { data: row, error } = await context.supabase.rpc("bcp_assign", {
      _operation_id: data.operationId,
      _application_id: data.applicationId,
      _method_version_id: data.methodVersionId,
      _exposure_profile_id: data.exposureProfileId,
      _expected_content_hash: data.expectedContentHash,
      _notice_version: data.noticeVersion,
      _due_at: data.dueAt ?? undefined,
    });
    if (error) throw new Error(error.message);
    const r = row as unknown as Record<string, unknown>;
    return { assignmentId: r.assignment_id as string };
  });

export interface BesktSubmittedAnswer {
  readonly itemKey: string;
  readonly wordingSv: string | null;
  readonly wordingEn: string | null;
  readonly purposeSv: string | null;
  readonly purposeEn: string | null;
  readonly answerType: BesktAnswerType;
  readonly responseState: BesktResponseState;
  readonly valueBoolean: boolean | null;
  readonly valueText: string | null;
  readonly valueDate: string | null;
  readonly optionKeys: readonly string[];
  readonly optionLabels: ReadonlyArray<{
    readonly optionKey: string;
    readonly labelSv: string | null;
    readonly labelEn: string | null;
  }>;
}

export interface BesktInterviewTopic {
  readonly itemKey: string;
  /** "omitted" or "discuss_orally" — the candidate's own choice, never a judgement. */
  readonly reason: Extract<BesktResponseState, "omitted" | "discuss_orally">;
  readonly wordingSv: string | null;
  readonly wordingEn: string | null;
  readonly purposeSv: string | null;
  readonly purposeEn: string | null;
}

export interface BesktEmployerReadback {
  readonly assignmentId: string;
  readonly applicationId: string;
  readonly lifecycleState: BesktLifecycleState;
  readonly assignedAt: string;
  readonly dueAt: string | null;
  readonly submittedAt: string | null;
  readonly isSubmitted: boolean;
  readonly method: {
    readonly nameSv: string | null;
    readonly nameEn: string | null;
    readonly versionNumber: number;
    readonly contentHash: string;
    readonly contentHashAlgorithm: string;
    readonly validationLabel: string;
    readonly releaseScope: string;
    readonly exposureArea: string;
    readonly retentionClass: string;
  };
  /** ABSENT until submission. A draft is the candidate's alone. */
  readonly answers: readonly BesktSubmittedAnswer[] | null;
  readonly topicsForInterview: readonly BesktInterviewTopic[] | null;
}

function mapAnswers(raw: unknown): readonly BesktSubmittedAnswer[] | null {
  if (raw === null || raw === undefined) return null;
  return (raw as Array<Record<string, unknown>>).map((a) => ({
    itemKey: a.item_key as string,
    wordingSv: (a.wording_sv as string | null) ?? null,
    wordingEn: (a.wording_en as string | null) ?? null,
    purposeSv: (a.purpose_sv as string | null) ?? null,
    purposeEn: (a.purpose_en as string | null) ?? null,
    answerType: a.answer_type as BesktAnswerType,
    responseState: a.response_state as BesktResponseState,
    valueBoolean: (a.value_boolean as boolean | null) ?? null,
    valueText: (a.value_text as string | null) ?? null,
    valueDate: (a.value_date as string | null) ?? null,
    optionKeys: (a.option_keys as string[] | null) ?? [],
    optionLabels: ((a.option_labels ?? []) as Array<Record<string, unknown>>).map((o) => ({
      optionKey: o.option_key as string,
      labelSv: (o.label_sv as string | null) ?? null,
      labelEn: (o.label_en as string | null) ?? null,
    })),
  }));
}

export const getBesktEmployerReadback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => assignmentInput.parse(d))
  .handler(async ({ context, data }): Promise<BesktEmployerReadback> => {
    const { data: raw, error } = await context.supabase.rpc("bcp_employer_readback", {
      _assignment_id: data.assignmentId,
    });
    if (error) throw new Error(error.message);
    const d = raw as unknown as Record<string, unknown>;
    const m = d.method as Record<string, unknown>;
    const topics = d.topics_for_interview;
    return {
      assignmentId: d.assignment_id as string,
      applicationId: d.application_id as string,
      lifecycleState: d.lifecycle_state as BesktLifecycleState,
      assignedAt: d.assigned_at as string,
      dueAt: (d.due_at as string | null) ?? null,
      submittedAt: (d.submitted_at as string | null) ?? null,
      isSubmitted: Boolean(d.is_submitted),
      method: {
        nameSv: (m.name_sv as string | null) ?? null,
        nameEn: (m.name_en as string | null) ?? null,
        versionNumber: m.version_number as number,
        contentHash: m.content_hash as string,
        contentHashAlgorithm: m.content_hash_algorithm as string,
        validationLabel: m.validation_label as string,
        releaseScope: m.release_scope as string,
        exposureArea: m.exposure_area as string,
        retentionClass: m.retention_class as string,
      },
      answers: mapAnswers(d.answers),
      topicsForInterview:
        topics === null || topics === undefined
          ? null
          : (topics as Array<Record<string, unknown>>).map((t) => ({
              itemKey: t.item_key as string,
              reason: t.reason as "omitted" | "discuss_orally",
              wordingSv: (t.wording_sv as string | null) ?? null,
              wordingEn: (t.wording_en as string | null) ?? null,
              purposeSv: (t.purpose_sv as string | null) ?? null,
              purposeEn: (t.purpose_en as string | null) ?? null,
            })),
    };
  });

export const cancelBesktPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        assignmentId: z.string().uuid(),
        reason: z.string().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly lifecycleState: string }> => {
    const { data: row, error } = await context.supabase.rpc("bcp_cancel", {
      _operation_id: data.operationId,
      _assignment_id: data.assignmentId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return {
      lifecycleState: (row as unknown as Record<string, unknown>).lifecycle_state as string,
    };
  });

// ── The candidate side ────────────────────────────────────────────────────

export interface BesktCandidateAssignmentRow {
  readonly assignmentId: string;
  readonly applicationId: string;
  readonly jobTitleSv: string | null;
  readonly jobTitleEn: string | null;
  readonly employerName: string | null;
  readonly methodNameSv: string | null;
  readonly methodNameEn: string | null;
  readonly lifecycleState: BesktLifecycleState;
  readonly availableFrom: string;
  readonly dueAt: string | null;
  readonly submittedAt: string | null;
}

export const listMyBesktPreparations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly BesktCandidateAssignmentRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("bcp_candidate_assignments");
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      assignmentId: r.assignment_id as string,
      applicationId: r.application_id as string,
      jobTitleSv: (r.job_title_sv as string | null) ?? null,
      jobTitleEn: (r.job_title_en as string | null) ?? null,
      employerName: (r.employer_name as string | null) ?? null,
      methodNameSv: (r.method_name_sv as string | null) ?? null,
      methodNameEn: (r.method_name_en as string | null) ?? null,
      lifecycleState: r.lifecycle_state as BesktLifecycleState,
      availableFrom: r.available_from as string,
      dueAt: (r.due_at as string | null) ?? null,
      submittedAt: (r.submitted_at as string | null) ?? null,
    }));
  });

export interface BesktPreparationOption {
  readonly optionKey: string;
  readonly labelSv: string | null;
  readonly labelEn: string | null;
}

export interface BesktPreparationItem {
  readonly sequencePosition: number;
  readonly itemKey: string;
  readonly sectionKey: string;
  readonly wordingSv: string | null;
  readonly wordingEn: string | null;
  readonly purposeSv: string | null;
  readonly purposeEn: string | null;
  readonly answerType: BesktAnswerType;
  readonly requiredness: "required" | "voluntary";
  readonly discussOrallyAllowed: boolean;
  readonly options: readonly BesktPreparationOption[];
  readonly answer: {
    readonly responseState: BesktResponseState;
    readonly valueBoolean: boolean | null;
    readonly valueText: string | null;
    readonly valueDate: string | null;
    readonly optionKeys: readonly string[];
  } | null;
}

export interface BesktCandidatePreparation {
  readonly assignmentId: string;
  readonly applicationId: string;
  readonly lifecycleState: BesktLifecycleState;
  readonly availableFrom: string;
  readonly dueAt: string | null;
  readonly submittedAt: string | null;
  readonly readOnly: boolean;
  readonly method: {
    readonly nameSv: string | null;
    readonly nameEn: string | null;
    readonly purposeSv: string | null;
    readonly versionNumber: number;
    readonly validationLabel: string;
    readonly summarySv: string | null;
    readonly summaryEn: string | null;
    readonly contentHash: string;
  };
  readonly exposureProfile: {
    readonly exposureArea: string;
    readonly dutiesSv: string | null;
    readonly dutiesEn: string | null;
    readonly rationaleSv: string | null;
    readonly rationaleEn: string | null;
    readonly retentionClass: string;
    readonly lawfulBasisReference: string | null;
    readonly jurisdictionReference: string | null;
  };
  readonly notice: {
    readonly noticeVersion: string;
    readonly noticeContentHash: string;
    readonly acknowledgedAt: string | null;
    readonly sections: readonly string[];
  };
  readonly response: {
    readonly responseId: string;
    readonly responseVersion: number;
    readonly responseState: "draft" | "submitted";
    readonly revision: number;
    readonly submittedAt: string | null;
    readonly submittedContentHash: string | null;
  } | null;
  readonly items: readonly BesktPreparationItem[];
}

export const getMyBesktPreparation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => assignmentInput.parse(d))
  .handler(async ({ context, data }): Promise<BesktCandidatePreparation> => {
    const { data: raw, error } = await context.supabase.rpc("bcp_candidate_preparation", {
      _assignment_id: data.assignmentId,
    });
    if (error) throw new Error(error.message);
    const d = raw as unknown as Record<string, unknown>;
    const m = d.method as Record<string, unknown>;
    const p = d.exposure_profile as Record<string, unknown>;
    const n = d.notice as Record<string, unknown>;
    const descriptor = n.descriptor as Record<string, unknown>;
    const resp = d.response as Record<string, unknown> | null;
    return {
      assignmentId: d.assignment_id as string,
      applicationId: d.application_id as string,
      lifecycleState: d.lifecycle_state as BesktLifecycleState,
      availableFrom: d.available_from as string,
      dueAt: (d.due_at as string | null) ?? null,
      submittedAt: (d.submitted_at as string | null) ?? null,
      readOnly: Boolean(d.read_only),
      method: {
        nameSv: (m.name_sv as string | null) ?? null,
        nameEn: (m.name_en as string | null) ?? null,
        purposeSv: (m.purpose_sv as string | null) ?? null,
        versionNumber: m.version_number as number,
        validationLabel: m.validation_label as string,
        summarySv: (m.summary_sv as string | null) ?? null,
        summaryEn: (m.summary_en as string | null) ?? null,
        contentHash: m.content_hash as string,
      },
      exposureProfile: {
        exposureArea: p.exposure_area as string,
        dutiesSv: (p.duties_sv as string | null) ?? null,
        dutiesEn: (p.duties_en as string | null) ?? null,
        rationaleSv: (p.role_relevance_rationale_sv as string | null) ?? null,
        rationaleEn: (p.role_relevance_rationale_en as string | null) ?? null,
        retentionClass: p.retention_class as string,
        lawfulBasisReference: (p.lawful_basis_reference as string | null) ?? null,
        jurisdictionReference: (p.jurisdiction_reference as string | null) ?? null,
      },
      notice: {
        noticeVersion: n.notice_version as string,
        noticeContentHash: n.notice_content_hash as string,
        acknowledgedAt: (n.acknowledged_at as string | null) ?? null,
        sections: (descriptor.sections as string[] | null) ?? [],
      },
      response: resp
        ? {
            responseId: resp.response_id as string,
            responseVersion: resp.response_version as number,
            responseState: resp.response_state as "draft" | "submitted",
            revision: resp.revision as number,
            submittedAt: (resp.submitted_at as string | null) ?? null,
            submittedContentHash: (resp.submitted_content_hash as string | null) ?? null,
          }
        : null,
      items: ((d.items ?? []) as Array<Record<string, unknown>>).map((i) => {
        const a = i.answer as Record<string, unknown> | null;
        return {
          sequencePosition: i.sequence_position as number,
          itemKey: i.item_key as string,
          sectionKey: i.section_key as string,
          wordingSv: (i.wording_sv as string | null) ?? null,
          wordingEn: (i.wording_en as string | null) ?? null,
          purposeSv: (i.purpose_sv as string | null) ?? null,
          purposeEn: (i.purpose_en as string | null) ?? null,
          answerType: i.answer_type as BesktAnswerType,
          requiredness: i.requiredness as "required" | "voluntary",
          discussOrallyAllowed: Boolean(i.discuss_orally_allowed),
          options: ((i.options ?? []) as Array<Record<string, unknown>>).map((o) => ({
            optionKey: o.option_key as string,
            labelSv: (o.label_sv as string | null) ?? null,
            labelEn: (o.label_en as string | null) ?? null,
          })),
          answer: a
            ? {
                responseState: a.response_state as BesktResponseState,
                valueBoolean: (a.value_boolean as boolean | null) ?? null,
                valueText: (a.value_text as string | null) ?? null,
                valueDate: (a.value_date as string | null) ?? null,
                optionKeys: (a.option_keys as string[] | null) ?? [],
              }
            : null,
        };
      }),
    };
  });

export const markBesktPreparationOpened = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ operationId: z.string().uuid(), assignmentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly lifecycleState: string }> => {
    const { data: row, error } = await context.supabase.rpc("bcp_mark_opened", {
      _operation_id: data.operationId,
      _assignment_id: data.assignmentId,
    });
    if (error) throw new Error(error.message);
    return {
      lifecycleState: (row as unknown as Record<string, unknown>).lifecycle_state as string,
    };
  });

/**
 * Record that the candidate read the notice.
 *
 * Deliberately NOT called consent, here or in the database: the lawful basis
 * for the preparation is the employer's and is stated on the governed
 * exposure profile. This records that the information was given.
 */
export const acknowledgeBesktNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        assignmentId: z.string().uuid(),
        noticeVersion: z.string().min(1),
        noticeContentHash: z.string().regex(/^[0-9a-f]{64}$/),
        locale: z.enum(["sv-SE", "en-GB"]),
      })
      .parse(d),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{ readonly responseId: string | null; readonly revision: number }> => {
      const { data: row, error } = await context.supabase.rpc("bcp_acknowledge_notice", {
        _operation_id: data.operationId,
        _assignment_id: data.assignmentId,
        _notice_version: data.noticeVersion,
        _notice_content_hash: data.noticeContentHash,
        _locale: data.locale,
      });
      if (error) throw new Error(error.message);
      const r = row as unknown as Record<string, unknown>;
      return {
        responseId: (r.response_id as string | null) ?? null,
        revision: r.revision as number,
      };
    },
  );

const answerEntry = z.object({
  itemKey: z.string().regex(/^[a-z0-9][a-z0-9_]*$/),
  responseState: z.enum(["answered", "omitted", "discuss_orally"]),
  valueBoolean: z.boolean().nullable().optional(),
  valueText: z.string().max(4000).nullable().optional(),
  valueDate: z.string().nullable().optional(),
  optionKeys: z.array(z.string()).optional(),
});

export type BesktAnswerEntry = z.infer<typeof answerEntry>;

export const saveBesktAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        assignmentId: z.string().uuid(),
        expectedRevision: z.number().int().min(1),
        answers: z.array(answerEntry).min(1).max(200),
      })
      .parse(d),
  )
  .handler(
    async ({ context, data }): Promise<{ readonly revision: number; readonly saved: number }> => {
      const { data: row, error } = await context.supabase.rpc("bcp_save_answers", {
        _operation_id: data.operationId,
        _assignment_id: data.assignmentId,
        _expected_revision: data.expectedRevision,
        _answers: data.answers.map((a) => ({
          item_key: a.itemKey,
          response_state: a.responseState,
          value_boolean: a.valueBoolean ?? null,
          value_text: a.valueText ?? null,
          value_date: a.valueDate ?? null,
          option_keys: a.optionKeys ?? [],
        })),
      });
      if (error) throw new Error(error.message);
      const r = row as unknown as Record<string, unknown>;
      return { revision: r.revision as number, saved: r.saved as number };
    },
  );

export const submitBesktPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        assignmentId: z.string().uuid(),
        expectedRevision: z.number().int().min(1),
      })
      .parse(d),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{ readonly submittedContentHash: string; readonly lifecycleState: string }> => {
      const { data: row, error } = await context.supabase.rpc("bcp_submit", {
        _operation_id: data.operationId,
        _assignment_id: data.assignmentId,
        _expected_revision: data.expectedRevision,
      });
      if (error) throw new Error(error.message);
      const r = row as unknown as Record<string, unknown>;
      return {
        submittedContentHash: r.submitted_content_hash as string,
        lifecycleState: r.lifecycle_state as string,
      };
    },
  );

export interface BesktExposureProfileOption {
  readonly exposureProfileId: string;
  readonly profileKey: string;
  readonly exposureArea: string;
  readonly dutiesSv: string | null;
  readonly dutiesEn: string | null;
  readonly rationaleSv: string | null;
  readonly rationaleEn: string | null;
  readonly retentionClass: string;
  readonly candidateItemCount: number;
}

/**
 * Which documented role exposure the preparation is for.
 *
 * The employer chooses one, and every governed question in the preparation
 * hangs off it — which is what lets the candidate be told, truthfully, why a
 * particular question is being asked at all.
 */
export const listAssignableBesktExposureProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), methodVersionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }): Promise<readonly BesktExposureProfileOption[]> => {
    const { data: rows, error } = await context.supabase.rpc("bcp_assignable_exposure_profiles", {
      _employer_id: data.employerId,
      _method_version_id: data.methodVersionId,
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      exposureProfileId: r.exposure_profile_id as string,
      profileKey: r.profile_key as string,
      exposureArea: r.exposure_area as string,
      dutiesSv: (r.duties_sv as string | null) ?? null,
      dutiesEn: (r.duties_en as string | null) ?? null,
      rationaleSv: (r.role_relevance_rationale_sv as string | null) ?? null,
      rationaleEn: (r.role_relevance_rationale_en as string | null) ?? null,
      retentionClass: r.retention_class as string,
      candidateItemCount: r.candidate_item_count as number,
    }));
  });
