// CQrity Interview Intelligence — Phase 1: Role Interview Pack server functions.
//
// Every function here runs as the CALLER. `requireSupabaseAuth` builds a
// Supabase client from the user's own JWT and the publishable key, so RLS
// applies to every read and every RPC. There is no service-role client in this
// file, deliberately: a service-role read would be a general browser bypass of
// the policies the database spent a migration establishing.
//
// The division of labour is the same one the database enforces:
//
//   * READS go through the tables, filtered by RLS. A caller with no platform
//     content role sees nothing, and this file does not need to know that.
//   * WRITES that change governance state — submit, review, publish, suspend,
//     retire — go through a SECURITY DEFINER RPC that authorises itself. This
//     file never sets a status, never writes the audit ledger, and cannot.
//
// Nothing here calls an AI provider. There is no model, prompt, key or
// generation step in Phase 1, and scripts/interview-pack-contract-check.ts
// fails the build if one appears.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/** The review ladder, copied from the database CHECK constraint. */
export type PackStatus =
  | "draft"
  | "expert_review"
  | "legal_review"
  | "cognitive_review"
  | "published"
  | "suspended"
  | "retired";

/**
 * What may be claimed about the content scientifically. Separate from
 * PackStatus on purpose: a package can be fully published as process content
 * and still be an unvalidated hypothesis.
 */
export type ValidationLabel = "pilot_hypothesis" | "content_validated";

export type ReviewGate = "expert" | "legal" | "cognitive" | "product";
export type ReviewDecision = "approved" | "rejected";

export type QuestionType = "behavioural" | "situational";

/** The 5E purposes. A follow-up with no approved purpose may not be used. */
export type ProbePurpose =
  | "example"
  | "own_role"
  | "exact_action"
  | "reasoning"
  | "effect"
  | "reflection"
  | "neutral_check"
  | "correction";

export type ProbeProvenance = "source_stated" | "derived_in_import";

export type MappingRelation =
  | "equivalent"
  | "broader_than_source"
  | "narrower_than_source"
  | "partial_overlap";

export type MappingState = "provisional" | "confirmed";

export type ProhibitedAreaType = "capability" | "inference" | "topic" | "probe_practice";

/** The ONLY statuses a version may move between, mirroring the DB guard. */
export const ALLOWED_TRANSITIONS: Readonly<Record<PackStatus, readonly PackStatus[]>> = {
  draft: ["expert_review"],
  expert_review: ["legal_review", "draft"],
  legal_review: ["cognitive_review", "draft"],
  cognitive_review: ["published", "draft"],
  published: ["suspended", "retired"],
  suspended: ["published", "retired"],
  retired: [],
} as const;

export function isAllowedTransition(from: PackStatus, to: PackStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** A version is editable while it is a draft or under review — never after. */
export const EDITABLE_STATUSES: readonly PackStatus[] = [
  "draft",
  "expert_review",
  "legal_review",
  "cognitive_review",
];

export function isEditableStatus(status: PackStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

/**
 * Level 0 means INSUFFICIENT EVIDENCE. It is not low competence, it is not
 * dishonesty, and it never enters an average. The database enforces this with a
 * CHECK constraint; this mirror exists so the UI cannot render it as a score.
 */
export function levelCountsTowardAggregation(level: number): boolean {
  return level > 0;
}

/* ------------------------------------------------------------------ */
/* Read models                                                         */
/* ------------------------------------------------------------------ */

export interface PackListItem {
  readonly id: string;
  readonly slug: string;
  readonly nameSv: string;
  readonly nameEn: string | null;
  readonly purposeSv: string;
  readonly createdAt: string;
  readonly latestVersion: {
    readonly id: string;
    readonly versionNumber: number;
    readonly status: PackStatus;
    readonly validationLabel: ValidationLabel;
    readonly locale: string;
    readonly updatedAt: string;
  } | null;
  readonly publishedVersionNumber: number | null;
}

export interface PackCompetency {
  readonly id: string;
  readonly code: string;
  readonly displayOrder: number;
  readonly nameSv: string;
  readonly definitionSv: string;
  readonly observableIndicatorsSv: readonly string[];
  readonly mappings: readonly {
    readonly id: string;
    readonly competencyVersionId: string;
    readonly canonicalCode: string | null;
    readonly canonicalNameSv: string | null;
    readonly relation: MappingRelation;
    readonly state: MappingState;
    readonly rationaleSv: string;
  }[];
}

export interface PackProbe {
  readonly id: string;
  readonly questionId: string | null;
  readonly purpose: ProbePurpose;
  readonly provenance: ProbeProvenance;
  readonly wordingSv: string;
  readonly displayOrder: number;
}

export interface PackAnchor {
  readonly id: string;
  readonly level: number;
  readonly labelSv: string;
  readonly anchorSv: string;
  readonly countsTowardAggregation: boolean;
  readonly isSafetyCritical: boolean;
}

export interface PackQuestion {
  readonly id: string;
  readonly code: string;
  readonly displayOrder: number;
  readonly questionType: QuestionType;
  readonly promptSv: string;
  readonly promptEn: string | null;
  readonly durationMinMinutes: number | null;
  readonly durationMaxMinutes: number | null;
  readonly evidenceSourceNoteSv: string | null;
  readonly competencyCodes: readonly string[];
  readonly primaryCompetencyCode: string | null;
  readonly dimensions: readonly {
    readonly id: string;
    readonly code: string;
    readonly labelSv: string;
    readonly displayOrder: number;
  }[];
  readonly anchors: readonly PackAnchor[];
  readonly probes: readonly PackProbe[];
}

export interface PackVerificationRule {
  readonly id: string;
  readonly code: string;
  readonly requirementSv: string;
  readonly permittedSourceStates: readonly string[];
  readonly interviewActionSv: string;
  readonly subsequentVerificationSv: string;
  readonly passportBoundarySv: string;
  readonly displayOrder: number;
}

export interface PackProhibitedArea {
  readonly id: string;
  readonly areaType: ProhibitedAreaType;
  readonly code: string;
  readonly statementSv: string;
  readonly rationaleSv: string;
  readonly displayOrder: number;
}

export interface PackReviewRecord {
  readonly id: string;
  readonly gate: ReviewGate;
  readonly decision: ReviewDecision;
  readonly reviewerId: string;
  readonly rationale: string;
  readonly contentHashAtReview: string;
  readonly decidedAt: string;
  /** False once the content changed after this decision was recorded. */
  readonly stillAppliesToCurrentContent: boolean;
}

export interface PackAuditEvent {
  readonly id: string;
  readonly seq: number;
  readonly event: string;
  readonly actorId: string | null;
  readonly previousStatus: string | null;
  readonly newStatus: string | null;
  readonly reason: string | null;
  readonly contentHash: string | null;
  readonly at: string;
}

export interface BlockingReason {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
}

export interface PackVersionDetail {
  readonly pack: {
    readonly id: string;
    readonly slug: string;
    readonly nameSv: string;
    readonly purposeSv: string;
  };
  readonly version: {
    readonly id: string;
    readonly versionNumber: number;
    readonly status: PackStatus;
    readonly validationLabel: ValidationLabel;
    readonly locale: string;
    readonly sourceReference: string;
    readonly sourceDocumentVersion: string;
    readonly contentHash: string | null;
    readonly pilotAvailability: "restricted" | "open";
    readonly summarySv: string | null;
    readonly roleVersionId: string;
    readonly roleNameSv: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly publishedAt: string | null;
    readonly suspendedAt: string | null;
    readonly suspendedReason: string | null;
    readonly retiredAt: string | null;
    readonly retiredReason: string | null;
  };
  readonly competencies: readonly PackCompetency[];
  readonly questions: readonly PackQuestion[];
  readonly generalProbes: readonly PackProbe[];
  readonly verificationRules: readonly PackVerificationRule[];
  readonly prohibitedAreas: readonly PackProhibitedArea[];
  readonly reviews: readonly PackReviewRecord[];
  readonly events: readonly PackAuditEvent[];
  readonly blockingReasons: readonly BlockingReason[];
  /** What this specific caller is allowed to do, decided by the database. */
  readonly capabilities: {
    readonly canEdit: boolean;
    readonly canReview: boolean;
    readonly canPublish: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

type VersionRow = {
  id: string;
  pack_id: string;
  version_number: number;
  content_status: string;
  validation_label: string;
  locale: string;
  updated_at: string;
};

export const listRolePacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ readonly packs: readonly PackListItem[] }> => {
    const db = context.supabase;

    const [packsRes, versionsRes] = await Promise.all([
      db
        .from("scp_interview_packs")
        .select("id, slug, name_sv, name_en, purpose_sv, created_at")
        .order("name_sv", { ascending: true }),
      db
        .from("scp_interview_pack_versions")
        .select("id, pack_id, version_number, content_status, validation_label, locale, updated_at")
        .order("version_number", { ascending: false }),
    ]);

    if (packsRes.error) throw new Error(packsRes.error.message);
    if (versionsRes.error) throw new Error(versionsRes.error.message);

    const versions = (versionsRes.data ?? []) as VersionRow[];
    const byPack = new Map<string, VersionRow[]>();
    for (const v of versions) {
      const list = byPack.get(v.pack_id);
      if (list) list.push(v);
      else byPack.set(v.pack_id, [v]);
    }

    const packs = (
      (packsRes.data ?? []) as Array<{
        id: string;
        slug: string;
        name_sv: string;
        name_en: string | null;
        purpose_sv: string;
        created_at: string;
      }>
    ).map((p) => {
      const vs = byPack.get(p.id) ?? [];
      const latest = vs[0] ?? null;
      const published = vs.find((v) => v.content_status === "published") ?? null;
      return {
        id: p.id,
        slug: p.slug,
        nameSv: p.name_sv,
        nameEn: p.name_en,
        purposeSv: p.purpose_sv,
        createdAt: p.created_at,
        latestVersion: latest
          ? {
              id: latest.id,
              versionNumber: latest.version_number,
              status: latest.content_status as PackStatus,
              validationLabel: latest.validation_label as ValidationLabel,
              locale: latest.locale,
              updatedAt: latest.updated_at,
            }
          : null,
        publishedVersionNumber: published ? published.version_number : null,
      };
    });

    return { packs };
  });

const versionIdInput = z.object({ versionId: z.string().uuid() });

export const getRolePackVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => versionIdInput.parse(data))
  .handler(async ({ context, data }): Promise<PackVersionDetail> => {
    const db = context.supabase;
    const { userId } = context;

    const versionRes = await db
      .from("scp_interview_pack_versions")
      .select(
        "id, pack_id, version_number, content_status, validation_label, locale, role_version_id, source_reference, source_document_version, content_hash, pilot_availability, summary_sv, created_at, updated_at, published_at, suspended_at, suspended_reason, retired_at, retired_reason",
      )
      .eq("id", data.versionId)
      .maybeSingle();

    if (versionRes.error) throw new Error(versionRes.error.message);
    // RLS turns "not allowed" into "not there". Both are the same answer to the
    // caller, and neither reveals whether the version exists.
    if (!versionRes.data) throw new Error("INTERVIEW_PACK_VERSION_NOT_FOUND");

    const v = versionRes.data;

    const [
      packRes,
      roleRes,
      competencyRes,
      mappingRes,
      questionRes,
      qcRes,
      probeRes,
      dimensionRes,
      anchorRes,
      verificationRes,
      prohibitedRes,
      reviewRes,
      eventRes,
      blockersRes,
      canEditRes,
      canReviewRes,
      canPublishRes,
    ] = await Promise.all([
      db
        .from("scp_interview_packs")
        .select("id, slug, name_sv, purpose_sv")
        .eq("id", v.pack_id)
        .maybeSingle(),
      db.from("scp_role_versions").select("id, name_sv").eq("id", v.role_version_id).maybeSingle(),
      db
        .from("scp_interview_pack_competencies")
        .select("id, code, display_order, name_sv, definition_sv, observable_indicators_sv")
        .eq("pack_version_id", data.versionId)
        .order("display_order", { ascending: true }),
      db
        .from("scp_interview_pack_competency_map")
        .select(
          "id, pack_competency_id, competency_version_id, relation, mapping_state, rationale_sv",
        ),
      db
        .from("scp_interview_core_questions")
        .select(
          "id, code, display_order, question_type, prompt_sv, prompt_en, recommended_duration_min_minutes, recommended_duration_max_minutes, evidence_source_note_sv",
        )
        .eq("pack_version_id", data.versionId)
        .order("display_order", { ascending: true }),
      db
        .from("scp_interview_question_competencies")
        .select("question_id, pack_competency_id, is_primary"),
      db
        .from("scp_interview_approved_probes")
        .select("id, question_id, purpose, purpose_provenance, wording_sv, display_order")
        .eq("pack_version_id", data.versionId)
        .order("display_order", { ascending: true }),
      db
        .from("scp_interview_evidence_dimensions")
        .select("id, question_id, code, label_sv, display_order")
        .order("display_order", { ascending: true }),
      db
        .from("scp_interview_rating_anchors")
        .select(
          "id, question_id, level, label_sv, anchor_sv, counts_toward_aggregation, is_safety_critical",
        )
        .order("level", { ascending: true }),
      db
        .from("scp_interview_verification_rules")
        .select(
          "id, code, requirement_sv, permitted_source_states, interview_action_sv, subsequent_verification_sv, passport_boundary_sv, display_order",
        )
        .eq("pack_version_id", data.versionId)
        .order("display_order", { ascending: true }),
      db
        .from("scp_interview_prohibited_areas")
        .select("id, area_type, code, statement_sv, rationale_sv, display_order")
        .eq("pack_version_id", data.versionId)
        .order("display_order", { ascending: true }),
      db
        .from("scp_interview_pack_reviews")
        .select("id, gate, decision, reviewer_id, rationale, content_hash_at_review, decided_at")
        .eq("pack_version_id", data.versionId)
        .order("decided_at", { ascending: false }),
      db
        .from("scp_interview_pack_events")
        .select("id, seq, event, actor_id, previous_status, new_status, reason, content_hash, at")
        .eq("pack_version_id", data.versionId)
        .order("seq", { ascending: false })
        .limit(200),
      db.rpc("scp_interview_pack_validate", { _pack_version_id: data.versionId }),
      db.rpc("scp_interview_can_edit", { _user_id: userId }),
      db.rpc("scp_has_content_role", { _user_id: userId, _role: "reviewer" }),
      db.rpc("scp_has_content_role", { _user_id: userId, _role: "publisher" }),
    ]);

    if (packRes.error) throw new Error(packRes.error.message);
    if (!packRes.data) throw new Error("INTERVIEW_PACK_NOT_FOUND");
    if (competencyRes.error) throw new Error(competencyRes.error.message);
    if (questionRes.error) throw new Error(questionRes.error.message);
    if (blockersRes.error) throw new Error(blockersRes.error.message);

    const competencyRows = (competencyRes.data ?? []) as Array<{
      id: string;
      code: string;
      display_order: number;
      name_sv: string;
      definition_sv: string;
      observable_indicators_sv: string[] | null;
    }>;
    const competencyIds = new Set(competencyRows.map((c) => c.id));
    const codeById = new Map(competencyRows.map((c) => [c.id, c.code]));

    const mappingRows = (
      (mappingRes.data ?? []) as Array<{
        id: string;
        pack_competency_id: string;
        competency_version_id: string;
        relation: string;
        mapping_state: string;
        rationale_sv: string;
      }>
    ).filter((m) => competencyIds.has(m.pack_competency_id));

    // Resolve the canonical codes behind the pinned competency version ids, so
    // a reviewer sees WHICH construct a mapping claims — not a bare uuid.
    let canonicalByVersionId = new Map<string, { code: string; nameSv: string }>();
    if (mappingRows.length > 0) {
      const canonicalRes = await db
        .from("scp_competency_versions")
        .select("id, name_sv, competency_id, scp_competencies(code)")
        .in("id", [...new Set(mappingRows.map((m) => m.competency_version_id))]);
      if (!canonicalRes.error) {
        canonicalByVersionId = new Map(
          (
            (canonicalRes.data ?? []) as Array<{
              id: string;
              name_sv: string;
              scp_competencies: { code: string } | { code: string }[] | null;
            }>
          ).map((r) => {
            const rel = Array.isArray(r.scp_competencies)
              ? r.scp_competencies[0]
              : r.scp_competencies;
            return [r.id, { code: rel?.code ?? "", nameSv: r.name_sv }];
          }),
        );
      }
    }

    const competencies: PackCompetency[] = competencyRows.map((c) => ({
      id: c.id,
      code: c.code,
      displayOrder: c.display_order,
      nameSv: c.name_sv,
      definitionSv: c.definition_sv,
      observableIndicatorsSv: c.observable_indicators_sv ?? [],
      mappings: mappingRows
        .filter((m) => m.pack_competency_id === c.id)
        .map((m) => {
          const canonical = canonicalByVersionId.get(m.competency_version_id) ?? null;
          return {
            id: m.id,
            competencyVersionId: m.competency_version_id,
            canonicalCode: canonical?.code ?? null,
            canonicalNameSv: canonical?.nameSv ?? null,
            relation: m.relation as MappingRelation,
            state: m.mapping_state as MappingState,
            rationaleSv: m.rationale_sv,
          };
        }),
    }));

    const questionRows = (questionRes.data ?? []) as Array<{
      id: string;
      code: string;
      display_order: number;
      question_type: string;
      prompt_sv: string;
      prompt_en: string | null;
      recommended_duration_min_minutes: number | null;
      recommended_duration_max_minutes: number | null;
      evidence_source_note_sv: string | null;
    }>;
    const questionIds = new Set(questionRows.map((q) => q.id));

    const qcRows = (
      (qcRes.data ?? []) as Array<{
        question_id: string;
        pack_competency_id: string;
        is_primary: boolean;
      }>
    ).filter((r) => questionIds.has(r.question_id));

    const probeRows = (probeRes.data ?? []) as Array<{
      id: string;
      question_id: string | null;
      purpose: string;
      purpose_provenance: string;
      wording_sv: string;
      display_order: number;
    }>;

    const dimensionRows = (
      (dimensionRes.data ?? []) as Array<{
        id: string;
        question_id: string;
        code: string;
        label_sv: string;
        display_order: number;
      }>
    ).filter((d) => questionIds.has(d.question_id));

    const anchorRows = (
      (anchorRes.data ?? []) as Array<{
        id: string;
        question_id: string | null;
        level: number;
        label_sv: string;
        anchor_sv: string;
        counts_toward_aggregation: boolean;
        is_safety_critical: boolean;
      }>
    ).filter((a) => a.question_id !== null && questionIds.has(a.question_id));

    const toProbe = (p: (typeof probeRows)[number]): PackProbe => ({
      id: p.id,
      questionId: p.question_id,
      purpose: p.purpose as ProbePurpose,
      provenance: p.purpose_provenance as ProbeProvenance,
      wordingSv: p.wording_sv,
      displayOrder: p.display_order,
    });

    const questions: PackQuestion[] = questionRows.map((q) => {
      const links = qcRows.filter((r) => r.question_id === q.id);
      const primary = links.find((r) => r.is_primary) ?? null;
      return {
        id: q.id,
        code: q.code,
        displayOrder: q.display_order,
        questionType: q.question_type as QuestionType,
        promptSv: q.prompt_sv,
        promptEn: q.prompt_en,
        durationMinMinutes: q.recommended_duration_min_minutes,
        durationMaxMinutes: q.recommended_duration_max_minutes,
        evidenceSourceNoteSv: q.evidence_source_note_sv,
        competencyCodes: links
          .map((r) => codeById.get(r.pack_competency_id) ?? "")
          .filter((c) => c !== "")
          .sort(),
        primaryCompetencyCode: primary ? (codeById.get(primary.pack_competency_id) ?? null) : null,
        dimensions: dimensionRows
          .filter((d) => d.question_id === q.id)
          .map((d) => ({
            id: d.id,
            code: d.code,
            labelSv: d.label_sv,
            displayOrder: d.display_order,
          })),
        anchors: anchorRows
          .filter((a) => a.question_id === q.id)
          .map((a) => ({
            id: a.id,
            level: a.level,
            labelSv: a.label_sv,
            anchorSv: a.anchor_sv,
            countsTowardAggregation: a.counts_toward_aggregation,
            isSafetyCritical: a.is_safety_critical,
          })),
        probes: probeRows.filter((p) => p.question_id === q.id).map(toProbe),
      };
    });

    const currentHash = v.content_hash;
    const reviews: PackReviewRecord[] = (
      (reviewRes.data ?? []) as Array<{
        id: string;
        gate: string;
        decision: string;
        reviewer_id: string;
        rationale: string;
        content_hash_at_review: string;
        decided_at: string;
      }>
    ).map((r) => ({
      id: r.id,
      gate: r.gate as ReviewGate,
      decision: r.decision as ReviewDecision,
      reviewerId: r.reviewer_id,
      rationale: r.rationale,
      contentHashAtReview: r.content_hash_at_review,
      decidedAt: r.decided_at,
      // The whole point of storing the hash: an approval of content that has
      // since changed is shown as stale rather than silently counted.
      stillAppliesToCurrentContent:
        currentHash !== null && r.content_hash_at_review === currentHash,
    }));

    const events: PackAuditEvent[] = (
      (eventRes.data ?? []) as Array<{
        id: string;
        seq: number;
        event: string;
        actor_id: string | null;
        previous_status: string | null;
        new_status: string | null;
        reason: string | null;
        content_hash: string | null;
        at: string;
      }>
    ).map((e) => ({
      id: e.id,
      seq: e.seq,
      event: e.event,
      actorId: e.actor_id,
      previousStatus: e.previous_status,
      newStatus: e.new_status,
      reason: e.reason,
      contentHash: e.content_hash,
      at: e.at,
    }));

    const blockingReasons = (
      (blockersRes.data ?? []) as Array<{ code: string; severity: string; message: string }>
    ).map((b) => ({ code: b.code, severity: b.severity, message: b.message }));

    return {
      pack: {
        id: packRes.data.id,
        slug: packRes.data.slug,
        nameSv: packRes.data.name_sv,
        purposeSv: packRes.data.purpose_sv,
      },
      version: {
        id: v.id,
        versionNumber: v.version_number,
        status: v.content_status as PackStatus,
        validationLabel: v.validation_label as ValidationLabel,
        locale: v.locale,
        sourceReference: v.source_reference,
        sourceDocumentVersion: v.source_document_version,
        contentHash: v.content_hash,
        pilotAvailability: (v.pilot_availability ?? "restricted") as "restricted" | "open",
        summarySv: v.summary_sv,
        roleVersionId: v.role_version_id,
        roleNameSv: roleRes.data?.name_sv ?? null,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
        publishedAt: v.published_at,
        suspendedAt: v.suspended_at,
        suspendedReason: v.suspended_reason,
        retiredAt: v.retired_at,
        retiredReason: v.retired_reason,
      },
      competencies,
      questions,
      generalProbes: probeRows.filter((p) => p.question_id === null).map(toProbe),
      verificationRules: (
        (verificationRes.data ?? []) as Array<{
          id: string;
          code: string;
          requirement_sv: string;
          permitted_source_states: string[] | null;
          interview_action_sv: string;
          subsequent_verification_sv: string;
          passport_boundary_sv: string;
          display_order: number;
        }>
      ).map((r) => ({
        id: r.id,
        code: r.code,
        requirementSv: r.requirement_sv,
        permittedSourceStates: r.permitted_source_states ?? [],
        interviewActionSv: r.interview_action_sv,
        subsequentVerificationSv: r.subsequent_verification_sv,
        passportBoundarySv: r.passport_boundary_sv,
        displayOrder: r.display_order,
      })),
      prohibitedAreas: (
        (prohibitedRes.data ?? []) as Array<{
          id: string;
          area_type: string;
          code: string;
          statement_sv: string;
          rationale_sv: string;
          display_order: number;
        }>
      ).map((a) => ({
        id: a.id,
        areaType: a.area_type as ProhibitedAreaType,
        code: a.code,
        statementSv: a.statement_sv,
        rationaleSv: a.rationale_sv,
        displayOrder: a.display_order,
      })),
      reviews,
      events,
      blockingReasons,
      capabilities: {
        canEdit: canEditRes.data === true,
        canReview: canReviewRes.data === true,
        canPublish: canPublishRes.data === true,
      },
    };
  });

/**
 * The roles a new pack can be built for. Returned with their latest role
 * VERSION id, because a pack pins a version and never a bare role.
 */
export const listPackableRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      readonly roles: readonly {
        readonly roleId: string;
        readonly slug: string;
        readonly roleVersionId: string;
        readonly versionNumber: number;
        readonly nameSv: string;
      }[];
    }> => {
      const { data, error } = await context.supabase
        .from("scp_role_versions")
        .select("id, role_id, version_number, name_sv, scp_roles(slug)")
        .order("version_number", { ascending: false });

      if (error) throw new Error(error.message);

      const seen = new Set<string>();
      const roles: Array<{
        roleId: string;
        slug: string;
        roleVersionId: string;
        versionNumber: number;
        nameSv: string;
      }> = [];

      for (const r of (data ?? []) as Array<{
        id: string;
        role_id: string;
        version_number: number;
        name_sv: string;
        scp_roles: { slug: string } | { slug: string }[] | null;
      }>) {
        if (seen.has(r.role_id)) continue;
        seen.add(r.role_id);
        const rel = Array.isArray(r.scp_roles) ? r.scp_roles[0] : r.scp_roles;
        roles.push({
          roleId: r.role_id,
          slug: rel?.slug ?? "",
          roleVersionId: r.id,
          versionNumber: r.version_number,
          nameSv: r.name_sv,
        });
      }

      return { roles };
    },
  );

/* ------------------------------------------------------------------ */
/* Governed writes                                                     */
/*                                                                     */
/* Each of these is a thin call onto an RPC that authorises itself. The */
/* server function adds input shape and nothing else -- it holds no     */
/* authority of its own and cannot grant any.                           */
/* ------------------------------------------------------------------ */

const createPackInput = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "SLUG_FORMAT"),
  roleId: z.string().uuid(),
  nameSv: z.string().min(1).max(200),
  nameEn: z.string().max(200).nullable().optional(),
  purposeSv: z.string().min(1).max(2000),
});

export const createRolePack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => createPackInput.parse(data))
  .handler(async ({ context, data }): Promise<{ readonly packId: string }> => {
    const { data: id, error } = await context.supabase.rpc("scp_interview_create_pack", {
      _slug: data.slug,
      _role_id: data.roleId,
      _name_sv: data.nameSv,
      _purpose_sv: data.purposeSv,
      _name_en: data.nameEn ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { packId: id as unknown as string };
  });

const createVersionInput = z.object({
  packId: z.string().uuid(),
  locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/, "LOCALE_FORMAT"),
  roleVersionId: z.string().uuid(),
  sourceReference: z.string().min(1).max(400),
  sourceDocumentVersion: z.string().min(1).max(100),
  summarySv: z.string().max(4000).nullable().optional(),
});

export const createRolePackVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => createVersionInput.parse(data))
  .handler(async ({ context, data }): Promise<{ readonly versionId: string }> => {
    const { data: id, error } = await context.supabase.rpc("scp_interview_create_version", {
      _pack_id: data.packId,
      _locale: data.locale,
      _role_version_id: data.roleVersionId,
      _source_reference: data.sourceReference,
      _source_document_version: data.sourceDocumentVersion,
      _summary_sv: data.summarySv ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { versionId: id as unknown as string };
  });

const submitInput = z.object({
  versionId: z.string().uuid(),
  gate: z.enum(["expert", "legal", "cognitive", "product"]),
});

export const submitRolePackForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => submitInput.parse(data))
  .handler(async ({ context, data }): Promise<{ readonly status: PackStatus }> => {
    const { data: status, error } = await context.supabase.rpc("scp_interview_submit_for_review", {
      _pack_version_id: data.versionId,
      _gate: data.gate,
    });
    if (error) throw new Error(error.message);
    return { status: status as unknown as PackStatus };
  });

const reviewInput = z.object({
  versionId: z.string().uuid(),
  gate: z.enum(["expert", "legal", "cognitive", "product"]),
  decision: z.enum(["approved", "rejected"]),
  // A decision with no reasoning is not a review. The database refuses a blank
  // rationale too; this is the same rule, said early enough to show in a form.
  rationale: z.string().trim().min(1, "RATIONALE_REQUIRED").max(4000),
});

export const recordRolePackReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => reviewInput.parse(data))
  .handler(async ({ context, data }): Promise<{ readonly reviewId: string }> => {
    const { data: id, error } = await context.supabase.rpc("scp_interview_record_review", {
      _pack_version_id: data.versionId,
      _gate: data.gate,
      _decision: data.decision,
      _rationale: data.rationale,
    });
    if (error) throw new Error(error.message);
    return { reviewId: id as unknown as string };
  });

export const confirmCompetencyMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ mappingId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<{ readonly ok: true }> => {
    const { error } = await context.supabase.rpc("scp_interview_confirm_competency_mapping", {
      _mapping_id: data.mappingId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const publishRolePackVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ versionId: z.string().uuid(), reason: z.string().max(2000).nullable().optional() })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<{ readonly contentHash: string }> => {
    const { data: hash, error } = await context.supabase.rpc("scp_interview_publish_version", {
      _pack_version_id: data.versionId,
      _reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { contentHash: hash as unknown as string };
  });

const reasonedInput = z.object({
  versionId: z.string().uuid(),
  reason: z.string().trim().min(1, "REASON_REQUIRED").max(2000),
});

export const suspendRolePackVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => reasonedInput.parse(data))
  .handler(async ({ context, data }): Promise<{ readonly ok: true }> => {
    const { error } = await context.supabase.rpc("scp_interview_suspend_version", {
      _pack_version_id: data.versionId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const retireRolePackVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => reasonedInput.parse(data))
  .handler(async ({ context, data }): Promise<{ readonly ok: true }> => {
    const { error } = await context.supabase.rpc("scp_interview_retire_version", {
      _pack_version_id: data.versionId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Make one unpublished version openly available to ACTIVE employers for pilot
 * use, or withdraw it. A platform-wide CONTENT decision (publisher role, with
 * a mandatory reason, into the pack ledger) — never an employer-by-employer
 * switch. Opening freezes the version's content until withdrawn.
 */
export const setRolePackPilotAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        versionId: z.string().uuid(),
        available: z.boolean(),
        reason: z.string().trim().min(1, "REASON_REQUIRED").max(2000),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<{ readonly ok: true }> => {
    const { error } = await context.supabase.rpc("scp_interview_set_pilot_availability", {
      _pack_version_id: data.versionId,
      _available: data.available,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
