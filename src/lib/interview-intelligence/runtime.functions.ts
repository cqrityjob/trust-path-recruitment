// Interview Intelligence — the employer runtime server functions.
//
// Every function runs as the CALLER. `requireSupabaseAuth` builds a Supabase
// client from the user's own JWT, so RLS decides what they can see and the
// governed RPCs decide what they can change. There is no service-role client in
// this file: a service-role read here would be a general bypass of the tenant
// isolation the migration spent 21 tables establishing.
//
// The AI work happens SERVER-SIDE, in `runAiTask`. No browser ever reaches a
// provider, and no key is ever shipped to one.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { runAiTask } from "./ai/orchestrator";
import type { UntrustedBlock } from "./ai/provider";
import type { TaskKey } from "./ai/registry";
import { QUARANTINE_REASON_SV, screenPassages } from "./ai/injection";
import { selectProvider } from "./ai/orchestrator";

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export type CaseStatus =
  | "draft"
  | "sources_ready"
  | "prep_generated"
  | "prep_approved"
  | "interview_in_progress"
  | "interview_complete"
  | "evidence_review"
  | "assessed"
  | "reported"
  | "cancelled";

export type PeaceStage = "planning" | "engage_explain" | "account" | "closure" | "evaluation";

/**
 * A serializable JSON value.
 *
 * The report payload is a frozen SNAPSHOT rendered from rows that remain
 * individually typed and queryable in their own tables, so it crosses the
 * server-function boundary as data rather than as a typed object. `unknown`
 * cannot cross that boundary; this can.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Interview PROCESS quality. Every field counts process artefacts, never the candidate. */
export interface ProcessQuality {
  readonly case_id: string;
  readonly status: string;
  readonly questions_in_pack: number;
  readonly questions_answered: number;
  readonly questions_unresolved: number;
  readonly questions_skipped: number;
  readonly dimensions_in_pack: number;
  readonly dimensions_with_confirmed_evidence: number;
  readonly proposals_total: number;
  readonly proposals_awaiting_review: number;
  readonly proposals_corrected: number;
  readonly evidence_human_authored: number;
  readonly verifications_outstanding: number;
  readonly gaps_open: number;
  readonly insufficient_evidence_count: number;
  readonly assessments_recorded: number;
  readonly assessors_involved: number;
  readonly interviewer_reflected: boolean | null;
  readonly protocol_deviation_recorded: boolean | null;
}

/** The order a case moves through. Used by the UI to draw progress honestly. */
export const CASE_FLOW: readonly CaseStatus[] = [
  "draft",
  "sources_ready",
  "prep_generated",
  "prep_approved",
  "interview_in_progress",
  "interview_complete",
  "evidence_review",
  "assessed",
  "reported",
];

export interface CaseListItem {
  readonly id: string;
  readonly title: string;
  readonly candidateDisplayName: string;
  readonly status: CaseStatus;
  readonly updatedAt: string;
  readonly packName: string | null;
  readonly validationLabel: string | null;
  readonly proposalsAwaitingReview: number;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

const employerInput = z.object({ employerId: z.string().uuid() });

export const listInterviewCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => employerInput.parse(d))
  .handler(async ({ context, data }): Promise<{ readonly cases: readonly CaseListItem[] }> => {
    const db = context.supabase;

    const { data: rows, error } = await db
      .from("scp_interview_cases")
      .select(
        "id, title, candidate_display_name, status, updated_at, pack_version_id, scp_interview_pack_versions(validation_label, scp_interview_packs(name_sv))",
      )
      .eq("employer_id", data.employerId)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.id as string);
    const pending = new Map<string, number>();
    if (ids.length > 0) {
      const { data: props } = await db
        .from("scp_interview_evidence_proposals")
        .select("case_id")
        .in("case_id", ids)
        .eq("review_state", "pending");
      for (const p of props ?? []) {
        const key = p.case_id as string;
        pending.set(key, (pending.get(key) ?? 0) + 1);
      }
    }

    const cases = (rows ?? []).map((r) => {
      const version = Array.isArray(r.scp_interview_pack_versions)
        ? r.scp_interview_pack_versions[0]
        : r.scp_interview_pack_versions;
      const pack = version
        ? Array.isArray(version.scp_interview_packs)
          ? version.scp_interview_packs[0]
          : version.scp_interview_packs
        : null;
      return {
        id: r.id as string,
        title: r.title as string,
        candidateDisplayName: r.candidate_display_name as string,
        status: r.status as CaseStatus,
        updatedAt: r.updated_at as string,
        packName: pack?.name_sv ?? null,
        validationLabel: version?.validation_label ?? null,
        proposalsAwaitingReview: pending.get(r.id as string) ?? 0,
      };
    });

    return { cases };
  });

/**
 * Interview workload for the employer overview, by process stage.
 *
 * PROCESS counts only. Nothing here describes a candidate, nothing is compared
 * between candidates, and there is deliberately no total: the overview is a
 * place to see what needs a person's attention, and a sum of unrelated stages
 * would be a number with no meaning that people would nonetheless read as one.
 *
 * Every count is a real, RLS-scoped read of this employer's own cases. The
 * overview page shows nothing at zero, so an employer who has never opened
 * Interview Intelligence sees no interview rows in "Att göra idag" at all.
 */
export interface InterviewWorkload {
  /** Draft or sources gathered — a plan is still being built. */
  readonly inPreparation: number;
  /** A generated plan a human has not yet approved. */
  readonly awaitingPlanApproval: number;
  /** Approved plan, interview not yet held. */
  readonly readyToInterview: number;
  /** Interview held; evidence needs a human review. */
  readonly inEvidenceReview: number;
  /** AI proposals across all cases that no human has looked at. */
  readonly proposalsAwaitingReview: number;
  /** Assessed and ready for the report to be finalised. */
  readonly awaitingReport: number;
  readonly reported: number;
}

export const getInterviewWorkload = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => employerInput.parse(d))
  .handler(async ({ context, data }): Promise<InterviewWorkload> => {
    const db = context.supabase;

    const { data: rows, error } = await db
      .from("scp_interview_cases")
      .select("id, status")
      .eq("employer_id", data.employerId);
    if (error) throw new Error(error.message);

    const cases = (rows ?? []) as Array<{ id: string; status: string }>;
    const count = (...statuses: string[]) =>
      cases.filter((c) => statuses.includes(c.status)).length;

    let proposalsAwaitingReview = 0;
    const openIds = cases
      .filter((c) => c.status === "evidence_review" || c.status === "interview_complete")
      .map((c) => c.id);
    if (openIds.length > 0) {
      const { count: pending } = await db
        .from("scp_interview_evidence_proposals")
        .select("id", { count: "exact", head: true })
        .in("case_id", openIds)
        .eq("review_state", "pending");
      proposalsAwaitingReview = pending ?? 0;
    }

    return {
      inPreparation: count("draft", "sources_ready"),
      awaitingPlanApproval: count("prep_generated"),
      readyToInterview: count("prep_approved"),
      inEvidenceReview: count("interview_complete", "evidence_review"),
      proposalsAwaitingReview,
      awaitingReport: count("assessed"),
      reported: count("reported"),
    };
  });

/**
 * The Interview Intelligence cases attached to ONE application.
 *
 * The link this needed always existed in the schema —
 * scp_interview_cases.application_id has been there since the runtime
 * migration, foreign-keyed and cross-tenant guarded. What was missing was any
 * route that used it, so the employer's application view and the interview
 * workspace never met and a recruiter had to know both existed and navigate
 * between them by hand.
 *
 * Returns process state only. No level, no evidence, no assessment: the
 * application page links INTO the interview, it does not restate it.
 */
export interface ApplicationInterviewCase {
  readonly id: string;
  readonly title: string;
  readonly status: CaseStatus;
  readonly updatedAt: string;
  readonly packName: string | null;
  readonly validationLabel: string | null;
  readonly proposalsAwaitingReview: number;
  readonly reportFinalised: boolean;
  /**
   * The finalised report's own content hash — the governed reference the
   * decision rests on. Present only once a report is final, because until then
   * there is nothing immutable to refer to.
   */
  readonly reportContentHash: string | null;
}

const applicationInput = z.object({
  employerId: z.string().uuid(),
  applicationId: z.string().uuid(),
});

export const listInterviewCasesForApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => applicationInput.parse(d))
  .handler(
    async ({ context, data }): Promise<{ readonly cases: readonly ApplicationInterviewCase[] }> => {
      const db = context.supabase;

      // employer_id is filtered as well as application_id. RLS already scopes
      // this, but an application id is guessable and the belt is cheap.
      const { data: rows, error } = await db
        .from("scp_interview_cases")
        .select(
          "id, title, status, updated_at, scp_interview_pack_versions(validation_label, scp_interview_packs(name_sv))",
        )
        .eq("employer_id", data.employerId)
        .eq("application_id", data.applicationId)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);

      const ids = (rows ?? []).map((r) => r.id as string);
      const pending = new Map<string, number>();
      const finalised = new Set<string>();
      const hashes = new Map<string, string | null>();
      if (ids.length > 0) {
        const { data: props } = await db
          .from("scp_interview_evidence_proposals")
          .select("case_id")
          .in("case_id", ids)
          .eq("review_state", "pending");
        for (const p of props ?? []) {
          const key = p.case_id as string;
          pending.set(key, (pending.get(key) ?? 0) + 1);
        }
        const { data: reports } = await db
          .from("scp_interview_reports")
          .select("case_id, status, content_hash")
          .in("case_id", ids)
          .eq("status", "final");
        for (const r of reports ?? []) {
          finalised.add(r.case_id as string);
          hashes.set(r.case_id as string, (r.content_hash as string | null) ?? null);
        }
      }

      const cases = (rows ?? []).map((r) => {
        const version = Array.isArray(r.scp_interview_pack_versions)
          ? r.scp_interview_pack_versions[0]
          : r.scp_interview_pack_versions;
        const pack = version
          ? Array.isArray(version.scp_interview_packs)
            ? version.scp_interview_packs[0]
            : version.scp_interview_packs
          : null;
        return {
          id: r.id as string,
          title: r.title as string,
          status: r.status as CaseStatus,
          updatedAt: r.updated_at as string,
          packName: pack?.name_sv ?? null,
          validationLabel: version?.validation_label ?? null,
          proposalsAwaitingReview: pending.get(r.id as string) ?? 0,
          reportFinalised: finalised.has(r.id as string),
          reportContentHash: hashes.get(r.id as string) ?? null,
        };
      });

      return { cases };
    },
  );

/**
 * The pack versions this employer can start a NEW interview with right now.
 *
 * Backed by scp_iv_startable_pack_versions(), which shares its entitlement
 * decision with scp_iv_create_case(). That sharing is the point: the previous
 * implementation ran a plain RLS-filtered SELECT, accepted an employerId it
 * never used, and therefore answered "may this USER READ a pack?" while the
 * create button answered "may THIS EMPLOYER START one?". The two disagreed
 * whenever a version was readable for continuity (a case already pinned it)
 * or the user belonged to more than one employer -- so the screen offered a
 * pack and then refused it on submit.
 */
export const listStartableInterviewPacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => employerInput.parse(d))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      readonly canStart: boolean;
      readonly packs: readonly {
        readonly packVersionId: string;
        readonly name: string;
        readonly nameEn: string | null;
        readonly versionNumber: number;
        readonly contentStatus: string;
        readonly validationLabel: string;
        readonly locale: string;
        /** published | open_pilot | pilot_grant. Server-side provenance; the
         *  customer screen never renders it. */
        readonly entitlementBasis: string;
      }[];
    }> => {
      // Asked separately so the screen can say "your account is not active"
      // instead of rendering an unexplained empty selector.
      const canStartRes = await context.supabase.rpc("scp_iv_employer_can_start_interviews", {
        _employer_id: data.employerId,
      });
      if (canStartRes.error) throw new Error(canStartRes.error.message);

      const { data: rows, error } = await context.supabase.rpc("scp_iv_startable_pack_versions", {
        _employer_id: data.employerId,
      });
      if (error) throw new Error(error.message);

      const packs = (
        (rows ?? []) as Array<{
          pack_version_id: string;
          name_sv: string;
          name_en: string | null;
          version_number: number;
          content_status: string;
          validation_label: string;
          locale: string;
          entitlement_basis: string;
        }>
      ).map((r) => ({
        packVersionId: r.pack_version_id,
        name: r.name_sv,
        nameEn: r.name_en,
        versionNumber: r.version_number,
        contentStatus: r.content_status,
        validationLabel: r.validation_label,
        locale: r.locale,
        entitlementBasis: r.entitlement_basis,
      }));

      return { canStart: canStartRes.data === true, packs };
    },
  );

export interface CaseDetail {
  readonly id: string;
  readonly employerId: string;
  readonly title: string;
  readonly candidateDisplayName: string;
  readonly status: CaseStatus;
  readonly packVersionId: string;
  readonly packName: string | null;
  readonly packContentStatus: string | null;
  readonly validationLabel: string | null;
  readonly packContentHash: string | null;
  readonly transcriptConfirmedAt: string | null;
  readonly sources: readonly {
    readonly id: string;
    readonly kind: string;
    readonly label: string;
    readonly purposeCode: string;
    readonly origin: string;
    readonly passageCount: number;
  }[];
  readonly questions: readonly {
    readonly id: string;
    readonly code: string;
    readonly displayOrder: number;
    readonly questionType: string;
    readonly promptSv: string;
    readonly dimensions: readonly { id: string; code: string; labelSv: string }[];
    readonly anchors: readonly {
      id: string;
      level: number;
      labelSv: string;
      anchorSv: string;
      countsTowardAggregation: boolean;
    }[];
    readonly probes: readonly { id: string; purpose: string; wordingSv: string }[];
  }[];
  readonly generalProbes: readonly { id: string; purpose: string; wordingSv: string }[];
  readonly prohibitedAreas: readonly { id: string; statementSv: string; areaType: string }[];
  readonly plan: {
    readonly id: string;
    readonly status: string;
    readonly versionNumber: number;
    readonly roleSummary: string | null;
    readonly candidateSummary: string | null;
    readonly timePlan: string | null;
    readonly openingGuidance: string | null;
    readonly closingGuidance: string | null;
    readonly aiDisclosure: string;
    readonly items: readonly {
      readonly id: string;
      readonly itemKind: string;
      readonly statement: string;
      readonly claimClass: string;
      readonly questionId: string | null;
      readonly sourceQuote: string | null;
    }[];
  } | null;
  readonly session: {
    readonly id: string;
    readonly status: string;
    readonly peaceStage: PeaceStage;
    readonly questions: readonly {
      readonly questionId: string;
      readonly state: string;
      readonly displayOrder: number;
    }[];
    readonly notes: readonly {
      readonly id: string;
      readonly questionId: string | null;
      readonly noteKind: string;
      readonly body: string;
    }[];
  } | null;
  readonly proposals: readonly {
    readonly id: string;
    readonly excerpt: string;
    readonly questionId: string;
    readonly reviewState: string;
    readonly extractionConfidence: number | null;
    readonly relevanceRationale: string;
    readonly uncertaintyNote: string | null;
    readonly prohibitedConclusionNote: string | null;
  }[];
  readonly evidence: readonly {
    readonly id: string;
    readonly excerpt: string;
    readonly originalExcerpt: string | null;
    readonly questionId: string;
    readonly origin: string;
  }[];
  readonly findings: readonly {
    readonly id: string;
    readonly findingKind: string;
    readonly statement: string;
    readonly resolutionState: string;
  }[];
  readonly assessments: readonly {
    readonly id: string;
    readonly questionId: string;
    readonly level: number;
    readonly rationale: string;
  }[];
  readonly report: {
    readonly id: string;
    readonly status: string;
    readonly versionNumber: number;
    readonly contentHash: string | null;
    readonly payload: JsonValue;
  } | null;
  readonly blockers: readonly { readonly code: string; readonly message: string }[];
  readonly events: readonly {
    readonly seq: number;
    readonly event: string;
    readonly actorKind: string;
    readonly reason: string | null;
    readonly at: string;
  }[];
  readonly methodPractices: readonly {
    readonly id: string;
    readonly peaceStage: string | null;
    readonly practiceKind: string;
    readonly statementSv: string;
    readonly rationale: string | null;
    readonly hasResearchClaim: boolean;
  }[];
  readonly aiAvailable: boolean;
}

const caseInput = z.object({ caseId: z.string().uuid() });

export const getInterviewCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => caseInput.parse(d))
  .handler(async ({ context, data }): Promise<CaseDetail> => {
    const db = context.supabase;
    const { caseId } = data;

    const caseRes = await db
      .from("scp_interview_cases")
      .select(
        "id, employer_id, title, candidate_display_name, status, pack_version_id, pack_content_hash, transcript_lawful_basis_confirmed_at, scp_interview_pack_versions(content_status, validation_label, scp_interview_packs(name_sv))",
      )
      .eq("id", caseId)
      .maybeSingle();

    if (caseRes.error) throw new Error(caseRes.error.message);
    // RLS turns "not yours" into "not there". Both are the same answer, and
    // neither reveals whether the case exists.
    if (!caseRes.data) throw new Error("INTERVIEW_CASE_NOT_FOUND");
    const c = caseRes.data;
    const packVersionId = c.pack_version_id as string;

    const [
      sourcesRes,
      passagesRes,
      questionsRes,
      dimsRes,
      anchorsRes,
      probesRes,
      prohibitedRes,
      planRes,
      sessionRes,
      proposalsRes,
      evidenceRes,
      findingsRes,
      assessmentsRes,
      reportRes,
      blockersRes,
      eventsRes,
      practicesRes,
      configRes,
    ] = await Promise.all([
      db
        .from("scp_interview_case_sources")
        .select("id, source_kind, label, purpose_code, origin")
        .eq("case_id", caseId)
        .order("created_at"),
      db.from("scp_interview_source_passages").select("id, source_id"),
      db
        .from("scp_interview_core_questions")
        .select("id, code, display_order, question_type, prompt_sv")
        .eq("pack_version_id", packVersionId)
        .order("display_order"),
      db
        .from("scp_interview_evidence_dimensions")
        .select("id, question_id, code, label_sv")
        .order("display_order"),
      db
        .from("scp_interview_rating_anchors")
        .select("id, question_id, level, label_sv, anchor_sv, counts_toward_aggregation")
        .order("level"),
      db
        .from("scp_interview_approved_probes")
        .select("id, question_id, purpose, wording_sv, display_order")
        .eq("pack_version_id", packVersionId)
        .order("display_order"),
      db
        .from("scp_interview_prohibited_areas")
        .select("id, statement_sv, area_type")
        .eq("pack_version_id", packVersionId)
        .order("display_order"),
      db
        .from("scp_interview_prep_plans")
        .select(
          "id, status, version_number, role_summary, candidate_summary, time_plan, opening_guidance, closing_guidance, ai_disclosure",
        )
        .eq("case_id", caseId)
        .order("version_number", { ascending: false })
        .limit(1),
      db
        .from("scp_interview_sessions")
        .select("id, status, peace_stage")
        .eq("case_id", caseId)
        .order("started_at", { ascending: false })
        .limit(1),
      db
        .from("scp_interview_evidence_proposals")
        .select(
          "id, excerpt, question_id, review_state, extraction_confidence, relevance_rationale, uncertainty_note, prohibited_conclusion_note",
        )
        .eq("case_id", caseId)
        .order("created_at"),
      db
        .from("scp_interview_evidence")
        .select("id, excerpt, original_excerpt, question_id, origin")
        .eq("case_id", caseId)
        .order("created_at"),
      db
        .from("scp_interview_findings")
        .select("id, finding_kind, statement, resolution_state")
        .eq("case_id", caseId)
        .order("created_at"),
      db
        .from("scp_interview_assessments")
        .select("id, question_id, level, rationale, superseded_by")
        .eq("case_id", caseId)
        .is("superseded_by", null),
      db
        .from("scp_interview_reports")
        .select("id, status, version_number, content_hash, payload")
        .eq("case_id", caseId)
        .order("version_number", { ascending: false })
        .limit(1),
      db.rpc("scp_iv_report_blockers", { _case_id: caseId }),
      db
        .from("scp_interview_case_events")
        .select("seq, event, actor_kind, reason, at")
        .eq("case_id", caseId)
        .order("seq", { ascending: false })
        .limit(200),
      db
        .from("scp_interview_method_practices")
        .select("id, peace_stage, practice_kind, statement_sv, rationale, claim_id")
        .order("display_order"),
      db.from("scp_interview_ai_config").select("ai_enabled, transcript_enabled").maybeSingle(),
    ]);

    if (questionsRes.error) throw new Error(questionsRes.error.message);

    const sourceRows = (sourcesRes.data ?? []) as Array<Record<string, unknown>>;
    const passageRows = (passagesRes.data ?? []) as Array<{ id: string; source_id: string }>;
    const passageCount = new Map<string, number>();
    for (const p of passageRows) {
      passageCount.set(p.source_id, (passageCount.get(p.source_id) ?? 0) + 1);
    }

    const questionRows = (questionsRes.data ?? []) as Array<Record<string, unknown>>;
    const qIds = new Set(questionRows.map((q) => q.id as string));
    const dims = ((dimsRes.data ?? []) as Array<Record<string, unknown>>).filter((d) =>
      qIds.has(d.question_id as string),
    );
    const anchors = ((anchorsRes.data ?? []) as Array<Record<string, unknown>>).filter((a) =>
      qIds.has(a.question_id as string),
    );
    const probes = (probesRes.data ?? []) as Array<Record<string, unknown>>;

    const planRow = (planRes.data ?? [])[0] ?? null;
    let plan: CaseDetail["plan"] = null;
    if (planRow) {
      const itemsRes = await db
        .from("scp_interview_prep_items")
        .select("id, item_kind, statement, claim_class, question_id, source_quote")
        .eq("plan_id", planRow.id as string)
        .order("display_order");
      plan = {
        id: planRow.id as string,
        status: planRow.status as string,
        versionNumber: planRow.version_number as number,
        roleSummary: (planRow.role_summary as string) ?? null,
        candidateSummary: (planRow.candidate_summary as string) ?? null,
        timePlan: (planRow.time_plan as string) ?? null,
        openingGuidance: (planRow.opening_guidance as string) ?? null,
        closingGuidance: (planRow.closing_guidance as string) ?? null,
        aiDisclosure: planRow.ai_disclosure as string,
        items: ((itemsRes.data ?? []) as Array<Record<string, unknown>>).map((i) => ({
          id: i.id as string,
          itemKind: i.item_kind as string,
          statement: i.statement as string,
          claimClass: i.claim_class as string,
          questionId: (i.question_id as string) ?? null,
          sourceQuote: (i.source_quote as string) ?? null,
        })),
      };
    }

    const sessionRow = (sessionRes.data ?? [])[0] ?? null;
    let session: CaseDetail["session"] = null;
    if (sessionRow) {
      const [sqRes, notesRes] = await Promise.all([
        db
          .from("scp_interview_session_questions")
          .select("question_id, state, display_order")
          .eq("session_id", sessionRow.id as string)
          .order("display_order"),
        db
          .from("scp_interview_session_notes")
          .select("id, question_id, note_kind, body")
          .eq("session_id", sessionRow.id as string)
          .order("created_at"),
      ]);
      session = {
        id: sessionRow.id as string,
        status: sessionRow.status as string,
        peaceStage: sessionRow.peace_stage as PeaceStage,
        questions: ((sqRes.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
          questionId: s.question_id as string,
          state: s.state as string,
          displayOrder: s.display_order as number,
        })),
        notes: ((notesRes.data ?? []) as Array<Record<string, unknown>>).map((n) => ({
          id: n.id as string,
          questionId: (n.question_id as string) ?? null,
          noteKind: n.note_kind as string,
          body: n.body as string,
        })),
      };
    }

    const version = Array.isArray(c.scp_interview_pack_versions)
      ? c.scp_interview_pack_versions[0]
      : c.scp_interview_pack_versions;
    const pack = version
      ? Array.isArray(version.scp_interview_packs)
        ? version.scp_interview_packs[0]
        : version.scp_interview_packs
      : null;

    const reportRow = (reportRes.data ?? [])[0] ?? null;

    return {
      id: c.id as string,
      employerId: c.employer_id as string,
      title: c.title as string,
      candidateDisplayName: c.candidate_display_name as string,
      status: c.status as CaseStatus,
      packVersionId,
      packName: pack?.name_sv ?? null,
      packContentStatus: version?.content_status ?? null,
      validationLabel: version?.validation_label ?? null,
      packContentHash: (c.pack_content_hash as string) ?? null,
      transcriptConfirmedAt: (c.transcript_lawful_basis_confirmed_at as string) ?? null,
      sources: sourceRows.map((s) => ({
        id: s.id as string,
        kind: s.source_kind as string,
        label: s.label as string,
        purposeCode: s.purpose_code as string,
        origin: s.origin as string,
        passageCount: passageCount.get(s.id as string) ?? 0,
      })),
      questions: questionRows.map((q) => ({
        id: q.id as string,
        code: q.code as string,
        displayOrder: q.display_order as number,
        questionType: q.question_type as string,
        promptSv: q.prompt_sv as string,
        dimensions: dims
          .filter((d) => d.question_id === q.id)
          .map((d) => ({
            id: d.id as string,
            code: d.code as string,
            labelSv: d.label_sv as string,
          })),
        anchors: anchors
          .filter((a) => a.question_id === q.id)
          .map((a) => ({
            id: a.id as string,
            level: a.level as number,
            labelSv: a.label_sv as string,
            anchorSv: a.anchor_sv as string,
            countsTowardAggregation: a.counts_toward_aggregation as boolean,
          })),
        probes: probes
          .filter((p) => p.question_id === q.id)
          .map((p) => ({
            id: p.id as string,
            purpose: p.purpose as string,
            wordingSv: p.wording_sv as string,
          })),
      })),
      generalProbes: probes
        .filter((p) => p.question_id === null)
        .map((p) => ({
          id: p.id as string,
          purpose: p.purpose as string,
          wordingSv: p.wording_sv as string,
        })),
      prohibitedAreas: ((prohibitedRes.data ?? []) as Array<Record<string, unknown>>).map((a) => ({
        id: a.id as string,
        statementSv: a.statement_sv as string,
        areaType: a.area_type as string,
      })),
      plan,
      session,
      proposals: ((proposalsRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        id: p.id as string,
        excerpt: p.excerpt as string,
        questionId: p.question_id as string,
        reviewState: p.review_state as string,
        extractionConfidence: (p.extraction_confidence as number) ?? null,
        relevanceRationale: (p.relevance_rationale as string) ?? "",
        uncertaintyNote: (p.uncertainty_note as string) ?? null,
        prohibitedConclusionNote: (p.prohibited_conclusion_note as string) ?? null,
      })),
      evidence: ((evidenceRes.data ?? []) as Array<Record<string, unknown>>).map((e) => ({
        id: e.id as string,
        excerpt: e.excerpt as string,
        originalExcerpt: (e.original_excerpt as string) ?? null,
        questionId: e.question_id as string,
        origin: e.origin as string,
      })),
      findings: ((findingsRes.data ?? []) as Array<Record<string, unknown>>).map((f) => ({
        id: f.id as string,
        findingKind: f.finding_kind as string,
        statement: f.statement as string,
        resolutionState: f.resolution_state as string,
      })),
      assessments: ((assessmentsRes.data ?? []) as Array<Record<string, unknown>>).map((a) => ({
        id: a.id as string,
        questionId: a.question_id as string,
        level: a.level as number,
        rationale: a.rationale as string,
      })),
      report: reportRow
        ? {
            id: reportRow.id as string,
            status: reportRow.status as string,
            versionNumber: reportRow.version_number as number,
            contentHash: (reportRow.content_hash as string) ?? null,
            payload: (reportRow.payload ?? null) as JsonValue,
          }
        : null,
      blockers: ((blockersRes.data ?? []) as Array<{ code: string; message: string }>).map((b) => ({
        code: b.code,
        message: b.message,
      })),
      events: ((eventsRes.data ?? []) as Array<Record<string, unknown>>).map((e) => ({
        seq: e.seq as number,
        event: e.event as string,
        actorKind: e.actor_kind as string,
        reason: (e.reason as string) ?? null,
        at: e.at as string,
      })),
      methodPractices: ((practicesRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        id: p.id as string,
        peaceStage: (p.peace_stage as string) ?? null,
        practiceKind: p.practice_kind as string,
        statementSv: p.statement_sv as string,
        rationale: (p.rationale as string) ?? null,
        // Whether this interviewer practice cites a registered research claim.
        // NULL is honest: plenty of good practice is craft, not literature.
        hasResearchClaim: p.claim_id !== null,
      })),
      aiAvailable: Boolean(configRes.data?.ai_enabled) || true,
    };
  });

/* ------------------------------------------------------------------ */
/* Governed writes                                                     */
/* ------------------------------------------------------------------ */

export const createInterviewCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        title: z.string().min(1).max(300),
        packVersionId: z.string().uuid(),
        candidateDisplayName: z.string().min(1).max(200),
        candidateExternalRef: z.string().max(200).nullable().optional(),
        jobId: z.string().uuid().nullable().optional(),
        applicationId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly caseId: string }> => {
    const { data: id, error } = await context.supabase.rpc("scp_iv_create_case", {
      _employer_id: data.employerId,
      _title: data.title,
      _pack_version_id: data.packVersionId,
      _candidate_display_name: data.candidateDisplayName,
      _candidate_external_ref: data.candidateExternalRef ?? `EXT-${Date.now()}`,
      _job_id: data.jobId ?? undefined,
      _application_id: data.applicationId ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { caseId: id as unknown as string };
  });

export const addCaseSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        sourceKind: z.enum([
          "job_description",
          "employer_requirements",
          "candidate_cv",
          "application_answers",
          "interviewer_notes",
          "transcript",
        ]),
        label: z.string().min(1).max(200),
        contentText: z.string().min(1).max(200_000),
        purposeCode: z.string().min(1).max(80),
        lawfulBasisNote: z.string().min(1).max(1000),
        origin: z
          .enum(["employer_supplied", "candidate_application", "candidate_shared", "interviewer"])
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly sourceId: string }> => {
    const { data: id, error } = await context.supabase.rpc("scp_iv_add_source", {
      _case_id: data.caseId,
      _source_kind: data.sourceKind,
      _label: data.label,
      _content_text: data.contentText,
      _purpose_code: data.purposeCode,
      _lawful_basis_note: data.lawfulBasisNote,
      _origin: data.origin ?? "employer_supplied",
    });
    if (error) throw new Error(error.message);
    return { sourceId: id as unknown as string };
  });

export const markSourcesReady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => caseInput.parse(d))
  .handler(async ({ context, data }): Promise<{ readonly ok: true }> => {
    const { error } = await context.supabase.rpc("scp_iv_mark_sources_ready", {
      _case_id: data.caseId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* The AI bridge                                                       */
/*                                                                     */
/* Load governed context and passages -> run the task server-side ->   */
/* record the run and its typed output through the governed RPCs.      */
/**
 * Pick the engine before anything is written.
 *
 * Selection is deliberately done FIRST, ahead of scp_iv_ai_run_start. A
 * misconfigured deployment then fails with nothing recorded, instead of leaving
 * an orphaned run row that says an AI task started when no engine was ever
 * chosen. It also means the run row records the engine that actually ran rather
 * than a hardcoded literal — the previous code wrote "mock" unconditionally,
 * which would have described a real model run as synthetic.
 */
function chooseEngine() {
  const selected = selectProvider();
  return {
    provider: selected.provider,
    mode: selected.mode,
    // What goes in the run's provenance columns.
    providerName: selected.provider.name,
    modelName: selected.mode === "synthetic" ? "deterministic-rules-1.0.0" : selected.provider.name,
  };
}

/**
 * What the input screen withheld from the provider, in a shape a server
 * function may return.
 *
 * Surfaced rather than logged: the withheld paragraph is the one the recruiter
 * most needs to read for themselves, because someone tried to steer the
 * assessment with it. That is information about the application, not an
 * internal diagnostic.
 */
export interface WithheldPassage {
  readonly passageId: string;
  readonly reason: string;
  readonly excerpt: string;
}

/* A quarantined run is still RECORDED, so a reviewer can see that the */
/* engine produced something it was not allowed to produce.            */
/* ------------------------------------------------------------------ */

/**
 * The governed context an AI run is allowed to see, loaded as the CALLER so RLS
 * decides what is visible. Typed loosely on purpose: this is a query surface,
 * and the shapes it produces are validated by the task schemas downstream.
 */
type CallerDb = SupabaseClient<Database>;

async function loadAiContext(db: CallerDb, caseId: string, packVersionId: string) {
  const [sourcesRes, questionsRes, dimsRes, probesRes, compsRes] = await Promise.all([
    db.from("scp_interview_case_sources").select("id, source_kind").eq("case_id", caseId),
    db
      .from("scp_interview_core_questions")
      .select("id, code, prompt_sv")
      .eq("pack_version_id", packVersionId)
      .order("display_order"),
    db.from("scp_interview_evidence_dimensions").select("id, question_id, code, label_sv"),
    db
      .from("scp_interview_approved_probes")
      .select("id, question_id, purpose, wording_sv")
      .eq("pack_version_id", packVersionId),
    db
      .from("scp_interview_pack_competencies")
      .select("id, code, name_sv")
      .eq("pack_version_id", packVersionId),
  ]);

  const sourceKind = new Map<string, string>();
  for (const s of sourcesRes.data ?? []) sourceKind.set(s.id as string, s.source_kind as string);

  const passagesRes = await db
    .from("scp_interview_source_passages")
    .select("id, source_id, content, passage_index")
    .in("source_id", [...sourceKind.keys()])
    .order("passage_index");

  const passages: UntrustedBlock[] = ((passagesRes.data ?? []) as Array<Record<string, unknown>>)
    .filter((p) => (p.content as string).trim() !== "")
    .map((p) => ({
      passageId: p.id as string,
      sourceKind: sourceKind.get(p.source_id as string) ?? "unknown",
      text: p.content as string,
    }));

  const questions = ((questionsRes.data ?? []) as Array<Record<string, unknown>>).map((q) => ({
    id: q.id as string,
    code: q.code as string,
    prompt: q.prompt_sv as string,
    dimensions: ((dimsRes.data ?? []) as Array<Record<string, unknown>>)
      .filter((d) => d.question_id === q.id)
      .map((d) => ({ code: d.code as string, label: d.label_sv as string, id: d.id as string })),
  }));

  const probes = ((probesRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: p.id as string,
    purpose: p.purpose as string,
    wording: p.wording_sv as string,
    questionCode: questions.find((q) => q.id === p.question_id)?.code ?? null,
  }));

  const competencies = ((compsRes.data ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: c.id as string,
    code: c.code as string,
    name: c.name_sv as string,
  }));

  return { passages, questions, probes, competencies };
}

export const runPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => caseInput.parse(d))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      readonly status: string;
      readonly planId: string | null;
      readonly message: string | null;
      readonly withheld: readonly WithheldPassage[];
      readonly providerMode: string;
    }> => {
      const db = context.supabase;

      const caseRes = await db
        .from("scp_interview_cases")
        .select("id, pack_version_id")
        .eq("id", data.caseId)
        .maybeSingle();
      if (caseRes.error) throw new Error(caseRes.error.message);
      if (!caseRes.data) throw new Error("INTERVIEW_CASE_NOT_FOUND");

      const packVersionId = caseRes.data.pack_version_id as string;
      const ctx = await loadAiContext(db, data.caseId, packVersionId);

      const taskKey: TaskKey = "interview_preparation_generation";
      const engine = chooseEngine();
      const runRes = await db.rpc("scp_iv_ai_run_start", {
        _case_id: data.caseId,
        _task: taskKey,
        _provider: engine.providerName,
        _model: engine.modelName,
      });
      if (runRes.error) throw new Error(runRes.error.message);
      const runId = runRes.data as unknown as string;

      const result = await runAiTask({
        taskKey,
        passages: ctx.passages,
        governedContext: {
          questions: ctx.questions,
          probes: ctx.probes,
          competencies: ctx.competencies,
        },
        allowedProbeIds: ctx.probes.map((p) => p.id),
        governedQuestions: new Map(ctx.questions.map((q) => [q.code, q.prompt])),
        provider: engine.provider,
        providerMode: engine.mode,
      });

      // The run is settled FIRST and always, success or not. A quarantined run
      // that leaves no trace is indistinguishable from one that never happened.
      await db.rpc("scp_iv_ai_run_settle", {
        _run_id: runId,
        _status: result.status,
        _failure_reason: result.failureReason ?? undefined,
        _abstention_reason: result.abstentionReason ?? undefined,
        _raw_response: (result.rawResponse ?? null) as never,
        _input_tokens: result.usage.inputTokens,
        _output_tokens: result.usage.outputTokens,
        _latency_ms: result.latencyMs,
        _cost_micros: result.usage.costMicros,
        _withheld_passages: result.quarantinedPassages as never,
        _provider_mode: result.providerMode,
      });

      // Carried to the caller on every path, including failure: a recruiter
      // told only "the engine could not run" is missing the more important
      // half of what happened.
      const withheld: readonly WithheldPassage[] = result.quarantinedPassages.map((q) => ({
        passageId: q.passageId,
        reason: QUARANTINE_REASON_SV[q.reason],
        excerpt: q.excerpt,
      }));

      if (result.status !== "succeeded" || !result.output) {
        return {
          status: result.status,
          planId: null,
          withheld,
          providerMode: result.providerMode,
          message: result.failureReason ?? result.abstentionReason,
        };
      }

      const out = result.output as {
        plan: Record<string, string | null>;
        items: Array<Record<string, unknown>>;
      };

      const qByCode = new Map(ctx.questions.map((q) => [q.code, q.id]));
      const items = out.items.map((i) => ({
        itemKind: i.itemKind,
        questionId: i.questionCode ? (qByCode.get(i.questionCode as string) ?? "") : "",
        probeId: i.probeId ?? "",
        statement: i.statement,
        claimClass: i.claimClass,
        sourcePassageId: i.sourcePassageId ?? "",
        sourceQuote: i.sourceQuote ?? "",
      }));

      const planRes = await db.rpc("scp_iv_record_prep_plan", {
        _run_id: runId,
        _plan: out.plan as never,
        _items: items as never,
      });
      if (planRes.error) throw new Error(planRes.error.message);

      return {
        status: "succeeded",
        planId: planRes.data as unknown as string,
        message: null,
        withheld,
        providerMode: result.providerMode,
      };
    },
  );

export const approvePreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ planId: z.string().uuid(), note: z.string().max(2000).optional() }).parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly ok: true }> => {
    const { error } = await context.supabase.rpc("scp_iv_approve_prep_plan", {
      _plan_id: data.planId,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const startInterviewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ caseId: z.string().uuid(), interviewerNames: z.string().max(400).optional() })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly sessionId: string }> => {
    const { data: id, error } = await context.supabase.rpc("scp_iv_start_session", {
      _case_id: data.caseId,
      _interviewer_names: data.interviewerNames ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { sessionId: id as unknown as string };
  });

export const saveInterviewNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        questionId: z.string().uuid().nullable(),
        noteKind: z.enum(["observation", "clarification", "process", "closing_summary"]),
        body: z.string().min(1).max(20_000),
        noteId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly noteId: string }> => {
    const db = context.supabase;
    if (data.noteId) {
      const { error } = await db
        .from("scp_interview_session_notes")
        .update({ body: data.body, updated_at: new Date().toISOString() })
        .eq("id", data.noteId);
      if (error) throw new Error(error.message);
      return { noteId: data.noteId };
    }
    const { data: row, error } = await db
      .from("scp_interview_session_notes")
      .insert({
        session_id: data.sessionId,
        question_id: data.questionId,
        note_kind: data.noteKind,
        body: data.body,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { noteId: row.id as string };
  });

export const setQuestionState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        questionId: z.string().uuid(),
        state: z.enum([
          "not_started",
          "in_progress",
          "answered",
          "incomplete",
          "revisit",
          "skipped",
        ]),
        skipReason: z.string().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly ok: true }> => {
    const { error } = await context.supabase
      .from("scp_interview_session_questions")
      .update({ state: data.state, skip_reason: data.skipReason ?? null })
      .eq("session_id", data.sessionId)
      .eq("question_id", data.questionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setSessionState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        status: z.enum(["in_progress", "paused", "completed"]).optional(),
        peaceStage: z
          .enum(["planning", "engage_explain", "account", "closure", "evaluation"])
          .optional(),
        processReflection: z.string().max(4000).optional(),
        protocolDeviations: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly ok: true }> => {
    const { error } = await context.supabase.rpc("scp_iv_set_session_state", {
      _session_id: data.sessionId,
      _status: data.status ?? undefined,
      _peace_stage: data.peaceStage ?? undefined,
      _process_reflection: data.processReflection ?? undefined,
      _protocol_deviations: data.protocolDeviations ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runEvidenceExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => caseInput.parse(d))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      readonly status: string;
      readonly proposals: number;
      readonly message: string | null;
      readonly withheld: readonly WithheldPassage[];
      readonly providerMode: string;
    }> => {
      const db = context.supabase;

      const caseRes = await db
        .from("scp_interview_cases")
        .select("id, pack_version_id")
        .eq("id", data.caseId)
        .maybeSingle();
      if (caseRes.error) throw new Error(caseRes.error.message);
      if (!caseRes.data) throw new Error("INTERVIEW_CASE_NOT_FOUND");
      const packVersionId = caseRes.data.pack_version_id as string;

      const ctx = await loadAiContext(db, data.caseId, packVersionId);

      const sessionRes = await db
        .from("scp_interview_sessions")
        .select("id")
        .eq("case_id", data.caseId)
        .order("started_at", { ascending: false })
        .limit(1);
      const sessionId = (sessionRes.data ?? [])[0]?.id as string | undefined;
      if (!sessionId)
        return {
          status: "no_session",
          proposals: 0,
          message: "Ingen intervjusession finns.",
          withheld: [],
          // No session, so no run was attempted and no engine was chosen.
          providerMode: "synthetic",
        };

      const notesRes = await db
        .from("scp_interview_session_notes")
        .select("id, question_id, body")
        .eq("session_id", sessionId);

      const noteRows = (notesRes.data ?? []) as Array<Record<string, unknown>>;
      const allNotes = noteRows.map((n) => ({
        ref: n.id as string,
        questionCode: ctx.questions.find((q) => q.id === n.question_id)?.code ?? null,
        body: n.body as string,
      }));

      // Interview notes are UNTRUSTED content, even though a recruiter typed
      // them. They quote what a candidate said, and a recruiter working at
      // speed pastes -- from an application, an email, a document the candidate
      // supplied. Sending them through the governed context because they arrive
      // by a trusted route would put attacker-controllable text into the one
      // channel this product treats as authoritative, which is precisely the
      // confusion the six-layer model exists to prevent.
      //
      // So they are screened on the same rules as any source passage, and a
      // note that carries an instruction to the system is withheld and
      // reported rather than quietly analysed.
      const screenedNotes = screenPassages(
        allNotes.map((n) => ({ passageId: n.ref, sourceKind: "interviewer_notes", text: n.body })),
      );
      const withheldNoteIds = new Set(screenedNotes.quarantined.map((q) => q.passageId));
      const notes = allNotes.filter((n) => !withheldNoteIds.has(n.ref));

      const engine = chooseEngine();
      const runRes = await db.rpc("scp_iv_ai_run_start", {
        _case_id: data.caseId,
        _task: "evidence_extraction",
        _provider: engine.providerName,
        _model: engine.modelName,
      });
      if (runRes.error) throw new Error(runRes.error.message);
      const runId = runRes.data as unknown as string;

      const result = await runAiTask({
        taskKey: "evidence_extraction",
        passages: ctx.passages,
        governedContext: {
          questions: ctx.questions,
          probes: ctx.probes,
          competencies: ctx.competencies,
          notes,
        },
        allowedProbeIds: ctx.probes.map((p) => p.id),
        governedQuestions: new Map(ctx.questions.map((q) => [q.code, q.prompt])),
        provider: engine.provider,
        providerMode: engine.mode,
      });

      await db.rpc("scp_iv_ai_run_settle", {
        _run_id: runId,
        _status: result.status,
        _failure_reason: result.failureReason ?? undefined,
        _abstention_reason: result.abstentionReason ?? undefined,
        _raw_response: (result.rawResponse ?? null) as never,
        _input_tokens: result.usage.inputTokens,
        _output_tokens: result.usage.outputTokens,
        _latency_ms: result.latencyMs,
        _cost_micros: result.usage.costMicros,
        _withheld_passages: [...result.quarantinedPassages, ...screenedNotes.quarantined] as never,
      });

      // Carried to the caller on every path, including failure: a recruiter
      // told only "the engine could not run" is missing the more important
      // half of what happened.
      const withheld: readonly WithheldPassage[] = [
        ...result.quarantinedPassages,
        ...screenedNotes.quarantined,
      ].map((q) => ({
        passageId: q.passageId,
        reason: QUARANTINE_REASON_SV[q.reason],
        excerpt: q.excerpt,
      }));

      if (result.status !== "succeeded" || !result.output) {
        await db.rpc("scp_iv_begin_evidence_review", { _case_id: data.caseId });
        return {
          status: result.status,
          proposals: 0,
          withheld,
          providerMode: result.providerMode,
          message: result.failureReason ?? result.abstentionReason,
        };
      }

      const out = result.output as { proposals: Array<Record<string, unknown>> };
      const qByCode = new Map(ctx.questions.map((q) => [q.code, q]));
      const compByCode = new Map(ctx.competencies.map((c) => [c.code, c.id]));

      const payload = out.proposals.map((p) => {
        const q = qByCode.get(p.questionCode as string);
        const dim = q?.dimensions.find((d) => d.code === p.evidenceDimensionCode);
        return {
          noteId: p.noteRef,
          excerpt: p.excerpt,
          questionId: q?.id ?? "",
          evidenceDimensionId: dim?.id ?? "",
          packCompetencyId: p.competencyCode
            ? (compByCode.get(p.competencyCode as string) ?? "")
            : "",
          extractionConfidence: String(p.extractionConfidence ?? ""),
          relevanceRationale: p.relevanceRationale ?? "",
          uncertaintyNote: p.uncertaintyNote ?? null,
          prohibitedConclusionNote: p.prohibitedConclusionNote ?? null,
        };
      });

      const recRes = await db.rpc("scp_iv_record_evidence_proposals", {
        _run_id: runId,
        _items: payload as never,
      });
      if (recRes.error) throw new Error(recRes.error.message);

      await db.rpc("scp_iv_begin_evidence_review", { _case_id: data.caseId });

      return {
        status: "succeeded",
        proposals: (recRes.data as unknown as number) ?? 0,
        message: null,
        withheld,
        providerMode: result.providerMode,
      };
    },
  );

export const reviewEvidenceProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        proposalId: z.string().uuid(),
        decision: z.enum(["accept", "edit", "reject", "unresolved"]),
        editedExcerpt: z.string().max(2000).nullable().optional(),
        correctionClass: z
          .enum([
            "ai_model_error",
            "retrieval_error",
            "missing_source",
            "ambiguous_source",
            "incorrect_mapping",
            "inappropriate_probe",
            "policy_violation",
            "user_preference",
            "reviewer_disagreement",
          ])
          .nullable()
          .optional(),
        note: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly evidenceId: string | null }> => {
    const { data: id, error } = await context.supabase.rpc("scp_iv_confirm_evidence_proposal", {
      _proposal_id: data.proposalId,
      _decision: data.decision,
      _edited_excerpt: data.editedExcerpt ?? undefined,
      _correction_class: data.correctionClass ?? undefined,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { evidenceId: (id as unknown as string) ?? null };
  });

export const authorEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        questionId: z.string().uuid(),
        excerpt: z.string().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly evidenceId: string }> => {
    const { data: id, error } = await context.supabase.rpc("scp_iv_author_evidence", {
      _case_id: data.caseId,
      _question_id: data.questionId,
      _excerpt: data.excerpt,
    });
    if (error) throw new Error(error.message);
    return { evidenceId: id as unknown as string };
  });

export const recordAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        questionId: z.string().uuid(),
        level: z.number().int().min(0).max(4),
        rationale: z.string().trim().min(1).max(4000),
        uncertaintyNote: z.string().max(2000).nullable().optional(),
        supersedeReason: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly assessmentId: string }> => {
    const { data: id, error } = await context.supabase.rpc("scp_iv_record_assessment", {
      _case_id: data.caseId,
      _question_id: data.questionId,
      _level: data.level,
      _rationale: data.rationale,
      _uncertainty_note: data.uncertaintyNote ?? undefined,
      _supersede_reason: data.supersedeReason ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { assessmentId: id as unknown as string };
  });

export const markAssessed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => caseInput.parse(d))
  .handler(async ({ context, data }): Promise<{ readonly ok: true }> => {
    const { error } = await context.supabase.rpc("scp_iv_mark_assessed", { _case_id: data.caseId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const finaliseReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => caseInput.parse(d))
  .handler(async ({ context, data }): Promise<{ readonly reportId: string }> => {
    const { data: id, error } = await context.supabase.rpc("scp_iv_finalise_report", {
      _case_id: data.caseId,
    });
    if (error) throw new Error(error.message);
    return { reportId: id as unknown as string };
  });

/* ------------------------------------------------------------------ */
/* CQrity TRUST — which stage this case is in                          */
/* ------------------------------------------------------------------ */

/**
 * The TRUST stage a case is in, with the plain-language process support for it.
 *
 * What this deliberately does NOT return: `methodological_basis`, and the
 * stage-to-claim links. Those are the internal research rationale. A recruiter
 * mid-interview needs to know what the stage is for and what may not be
 * concluded there; they do not need the argument about why ORBIT transfers or
 * does not transfer from counter-terrorism interrogation, and putting it on the
 * screen would be the product marking its own homework in front of the user.
 * It is readable by platform admins, in the admin surface, where the argument
 * belongs.
 */
export interface TrustStageView {
  readonly stageKey: string | null;
  readonly letter: string | null;
  readonly ordinal: number | null;
  readonly nameSv: string | null;
  readonly purposeSv: string | null;
  readonly humanResponsibilitySv: string | null;
  readonly prohibitions: readonly string[];
  /**
   * Whether the stage permits any AI task at all. A boolean rather than the
   * task list: the individual task keys are internal registry identifiers, and
   * the banner only needs to say whether AI does anything here.
   */
  readonly permitsAi: boolean;
  readonly methodVersion: number | null;
}

export const getTrustStage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => caseInput.parse(d))
  .handler(async ({ context, data }): Promise<TrustStageView> => {
    // One call, through the case-scoped projection.
    //
    // The previous version read scp_trust_stages, _prohibitions and _ai_tasks
    // directly and filtered in the caller. That worked only because those
    // tables were readable by every authenticated identity -- which is the
    // disclosure the owner review found, since a candidate is authenticated
    // too. The projection is now the only door: it refuses a case the caller
    // cannot read, scopes the lookup by the case's PINNED method version, and
    // does not carry methodological_basis or claim links in its return type at
    // all.
    const { data: rows, error } = await context.supabase.rpc("scp_trust_stage_for_case", {
      _case_id: data.caseId,
    });
    if (error) throw new Error(error.message);

    const r = ((rows ?? []) as Array<Record<string, unknown>>)[0];
    if (!r) {
      return {
        stageKey: null,
        letter: null,
        ordinal: null,
        nameSv: null,
        purposeSv: null,
        humanResponsibilitySv: null,
        prohibitions: [],
        permitsAi: false,
        methodVersion: null,
      };
    }

    return {
      stageKey: r.stage_key as string,
      letter: r.letter as string,
      ordinal: r.ordinal as number,
      nameSv: r.name_sv as string,
      purposeSv: r.purpose_sv as string,
      humanResponsibilitySv: (r.human_responsibility_sv as string | null) ?? null,
      prohibitions: (r.prohibitions as string[] | null) ?? [],
      permitsAi: Boolean(r.permits_ai),
      methodVersion: (r.method_version as number | null) ?? null,
    };
  });

/* ------------------------------------------------------------------ */
/* Panel Review                                                        */
/* ------------------------------------------------------------------ */

export interface PanelAssessmentRow {
  readonly assessmentId: string;
  readonly questionId: string;
  readonly assessorId: string;
  readonly isMine: boolean;
  readonly level: number;
  readonly rationale: string;
  readonly uncertaintyNote: string | null;
}

export interface PanelMemberRow {
  readonly userId: string;
  readonly submittedAt: string | null;
}

export interface PanelState {
  readonly exists: boolean;
  readonly state: "individual" | "revealed" | "concluded" | null;
  readonly members: readonly PanelMemberRow[];
  readonly assessments: readonly PanelAssessmentRow[];
  readonly conclusion: string | null;
  readonly iAmMember: boolean;
  readonly iHaveSubmitted: boolean;
}

export const getPanel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => caseInput.parse(d))
  .handler(async ({ context, data }): Promise<PanelState> => {
    const db = context.supabase;

    const panelRes = await db
      .from("scp_interview_panels")
      .select("id, state, conclusion")
      .eq("case_id", data.caseId)
      .maybeSingle();
    if (panelRes.error) throw new Error(panelRes.error.message);

    // The assessments come through the definer projection, never from the table
    // directly: it is what withholds a colleague's judgement before the reveal,
    // and reading around it would put the anchoring protection in the UI where
    // a second browser tab defeats it.
    const seenRes = await db.rpc("scp_iv_panel_visible_assessments", {
      _case_id: data.caseId,
    });
    if (seenRes.error) throw new Error(seenRes.error.message);

    const assessments = ((seenRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      assessmentId: r.assessment_id as string,
      questionId: r.question_id as string,
      assessorId: r.assessor_id as string,
      isMine: Boolean(r.is_mine),
      level: r.level as number,
      rationale: r.rationale as string,
      uncertaintyNote: (r.uncertainty_note as string | null) ?? null,
    }));

    if (!panelRes.data) {
      return {
        exists: false,
        state: null,
        members: [],
        assessments,
        conclusion: null,
        iAmMember: false,
        iHaveSubmitted: false,
      };
    }

    const membersRes = await db
      .from("scp_interview_panel_members")
      .select("user_id, submitted_at")
      .eq("panel_id", panelRes.data.id as string);
    if (membersRes.error) throw new Error(membersRes.error.message);

    const members = ((membersRes.data ?? []) as Array<Record<string, unknown>>).map((m) => ({
      userId: m.user_id as string,
      submittedAt: (m.submitted_at as string | null) ?? null,
    }));
    const mine = members.find((m) => m.userId === context.userId);

    return {
      exists: true,
      state: panelRes.data.state as PanelState["state"],
      members,
      assessments,
      conclusion: (panelRes.data.conclusion as string | null) ?? null,
      iAmMember: Boolean(mine),
      iHaveSubmitted: Boolean(mine?.submittedAt),
    };
  });

export const openPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ caseId: z.string().uuid(), memberIds: z.array(z.string().uuid()).min(2) }).parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly panelId: string }> => {
    const { data: id, error } = await context.supabase.rpc("scp_iv_panel_open", {
      _case_id: data.caseId,
      _member_ids: data.memberIds,
    });
    if (error) throw new Error(error.message);
    return { panelId: id as unknown as string };
  });

export const submitToPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => caseInput.parse(d))
  .handler(async ({ context, data }): Promise<{ readonly ok: true }> => {
    const { error } = await context.supabase.rpc("scp_iv_panel_submit", {
      _case_id: data.caseId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revealPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => caseInput.parse(d))
  .handler(async ({ context, data }): Promise<{ readonly ok: true }> => {
    const { error } = await context.supabase.rpc("scp_iv_panel_reveal", {
      _case_id: data.caseId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const concludePanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ caseId: z.string().uuid(), conclusion: z.string().min(1).max(8000) }).parse(d),
  )
  .handler(async ({ context, data }): Promise<{ readonly ok: true }> => {
    const { error } = await context.supabase.rpc("scp_iv_panel_conclude", {
      _case_id: data.caseId,
      _conclusion: data.conclusion,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Process quality — about the interview, never about the candidate. */
export const getProcessQuality = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => caseInput.parse(d))
  .handler(async ({ context, data }): Promise<{ readonly quality: ProcessQuality | null }> => {
    const { data: row, error } = await context.supabase
      .from("scp_interview_process_quality")
      .select("*")
      .eq("case_id", data.caseId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { quality: (row as ProcessQuality | null) ?? null };
  });
