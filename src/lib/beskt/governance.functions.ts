// BESKT method governance — the only application-side access to the PR 2 and
// PR 7 contracts.
//
// ── THE TWO HALVES, AND WHY THEY DIFFER ─────────────────────────────────
//
// READS are plain PostgREST selects. That is not a shortcut around the
// governed contract: the thirteen BESKT tables carry ENABLE and FORCE ROW
// LEVEL SECURITY and a single governance-read policy
// (`scp_interview_can_read`), so the database itself decides whether the
// caller is a platform admin or holds a platform content role. An employer
// member, a candidate and anon read nothing at all — an empty list and a
// refused read are the same answer here, and neither leaks.
//
// WRITES are exclusively the governed RPCs. Not one `.insert()`, `.update()`
// or `.delete()` appears in this file, and none can be added usefully:
// `beskt_method_reviews` and `beskt_governance_grants` are SELECT-only for
// every client role including service_role, and no client role holds INSERT
// on any governed child table. The privilege is the authority; the RPCs hold
// it through their owner.
//
// ── WHAT THIS FILE NEVER SENDS ──────────────────────────────────────────
//
// The actor. Every RPC reads `auth.uid()` for itself, so reviewer identity,
// publisher identity, grantor identity and author identity are all the
// database's own and cannot be named by a caller. This file also never sends
// service_role, and there is no path here that could.
//
// ── WHAT THIS FILE MUST NEVER GROW ──────────────────────────────────────
//
// A way to record a review without a grant, to publish without five gates,
// to edit published content, or to seed content as a side effect of reading
// it. Each of those is refused by the database as well — but a client that
// tried would be a defect worth failing a guard over.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ###########################################################################
// The governed vocabularies, mirrored from the CHECK constraints.
// ###########################################################################

/** The five human review gates. `internal_qa` is a grant, never a gate. */
export const BESKT_GATES = [
  "personnel_security",
  "senior_hr",
  "recruitment",
  "employment_privacy_legal",
  "data_protection",
] as const;
export type BesktGate = (typeof BESKT_GATES)[number];

/** Everything `beskt_grant_governance` can grant: the five gates, plus QA read. */
export const BESKT_GRANT_KINDS = [...BESKT_GATES, "internal_qa"] as const;
export type BesktGrantKind = (typeof BESKT_GRANT_KINDS)[number];

export const BESKT_CONTENT_STATUSES = [
  "draft",
  "in_review",
  "published",
  "suspended",
  "retired",
] as const;
export type BesktContentStatus = (typeof BESKT_CONTENT_STATUSES)[number];

export const BESKT_MODES = ["recruitment_support", "security_vetting_support"] as const;
export type BesktMode = (typeof BESKT_MODES)[number];

export const BESKT_PROVENANCE = [
  "source_stated",
  "derived_in_authoring",
  "cqrity_design_hypothesis",
] as const;
export type BesktProvenance = (typeof BESKT_PROVENANCE)[number];

/**
 * The content families `beskt_author_*` and `beskt_delete_content` address.
 *
 * The strings are the database's own family names, which is why they are
 * here and not invented: `beskt_delete_content` matches on them exactly.
 */
export const BESKT_CONTENT_FAMILIES = [
  "exposure_profile",
  "section",
  "item",
  "prompt",
  "routing_rule",
  "evidence_anchor",
  "observation_field",
  "activation_requirement",
] as const;
export type BesktContentFamily = (typeof BESKT_CONTENT_FAMILIES)[number];

// ###########################################################################
// Reads
// ###########################################################################

const asArray = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

export interface BesktMethodVersionSummary {
  readonly methodVersionId: string;
  readonly versionNumber: number;
  readonly contentStatus: BesktContentStatus;
  readonly validationLabel: string;
  readonly mode: string;
  readonly releaseScope: string;
  readonly revision: number;
  readonly reviewCycle: number;
  readonly contentHash: string | null;
  readonly updatedAt: string | null;
  readonly publishedAt: string | null;
}

export interface BesktMethodSummary {
  readonly packId: string;
  readonly slug: string;
  readonly nameSv: string;
  readonly nameEn: string | null;
  readonly purposeSv: string;
  readonly createdAt: string | null;
  readonly versions: readonly BesktMethodVersionSummary[];
}

function toVersionSummary(v: Record<string, unknown>): BesktMethodVersionSummary {
  return {
    methodVersionId: v.id as string,
    versionNumber: v.version_number as number,
    contentStatus: v.content_status as BesktContentStatus,
    validationLabel: v.validation_label as string,
    mode: v.mode as string,
    releaseScope: v.release_scope as string,
    revision: v.revision as number,
    reviewCycle: v.review_cycle as number,
    contentHash: str(v.content_hash),
    updatedAt: str(v.updated_at),
    publishedAt: str(v.published_at),
  };
}

/**
 * Who may open the BESKT governance surface, and as what.
 *
 * `canRead` is `scp_interview_can_read` -- the SAME predicate every governance
 * table's SELECT policy applies -- so the screen and the rows cannot disagree
 * about who belongs here. The content roles are the caller's own rows, which
 * `scp_content_roles_self_select` lets them read. None of this authorises an
 * action: every lifecycle step is still decided by its governed RPC.
 */
export interface BesktGovernanceAccess {
  readonly canRead: boolean;
  readonly isPlatformAdmin: boolean;
  readonly contentRoles: readonly string[];
}

export const getBesktGovernanceAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BesktGovernanceAccess> => {
    const db = context.supabase;
    const userId = (context as { userId: string }).userId;
    const [readRes, adminRes, rolesRes] = await Promise.all([
      db.rpc("scp_interview_can_read", { _user_id: userId }),
      db.rpc("is_platform_admin", { _user_id: userId }),
      db.from("scp_content_roles").select("role").eq("user_id", userId),
    ]);
    if (readRes.error) throw new Error(readRes.error.message);
    if (adminRes.error) throw new Error(adminRes.error.message);
    if (rolesRes.error) throw new Error(rolesRes.error.message);
    return {
      canRead: readRes.data === true,
      isPlatformAdmin: adminRes.data === true,
      contentRoles: (rolesRes.data ?? []).map((r) => String(r.role)),
    };
  });

/**
 * Every BESKT method identity and its versions, in every lifecycle state.
 *
 * `pack_kind = 'beskt_method'` and nothing else: the identity table also
 * carries the role-interview packs, and listing one in the other's editor is
 * exactly the mix-up the two spines exist to prevent.
 */
export const listBesktMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly BesktMethodSummary[]> => {
    const db = context.supabase;
    const [packsRes, versionsRes] = await Promise.all([
      db
        .from("scp_interview_packs")
        .select("id, slug, name_sv, name_en, purpose_sv, created_at")
        .eq("pack_kind", "beskt_method")
        .order("name_sv", { ascending: true }),
      db
        .from("beskt_method_versions")
        .select(
          "id, pack_id, version_number, content_status, validation_label, mode, release_scope, revision, review_cycle, content_hash, updated_at, published_at",
        )
        .order("version_number", { ascending: false }),
    ]);
    if (packsRes.error) throw new Error(packsRes.error.message);
    if (versionsRes.error) throw new Error(versionsRes.error.message);

    const byPack = new Map<string, Record<string, unknown>[]>();
    for (const v of asArray(versionsRes.data)) {
      const key = v.pack_id as string;
      const list = byPack.get(key);
      if (list) list.push(v);
      else byPack.set(key, [v]);
    }

    return asArray(packsRes.data).map((p) => ({
      packId: p.id as string,
      slug: p.slug as string,
      nameSv: p.name_sv as string,
      nameEn: str(p.name_en),
      purposeSv: p.purpose_sv as string,
      createdAt: str(p.created_at),
      versions: (byPack.get(p.id as string) ?? []).map(toVersionSummary),
    }));
  });

/** One governed row, carried as the raw column bag the editor renders and edits. */
export type BesktContentRow = Readonly<Record<string, string | number | boolean | null>>;

export interface BesktReviewRecord {
  readonly gate: BesktGate;
  readonly decision: "approved" | "rejected";
  readonly reviewerId: string;
  readonly rationale: string;
  readonly contentHashAtReview: string;
  readonly revisionAtReview: number;
  readonly reviewCycleAtReview: number;
  readonly decidedAt: string;
}

export interface BesktMethodEvent {
  readonly seq: number;
  readonly event: string;
  readonly actorId: string | null;
  readonly previousStatus: string | null;
  readonly newStatus: string | null;
  readonly reason: string | null;
  readonly revision: number | null;
  readonly at: string;
}

export interface BesktVersionWorkspace {
  readonly method: {
    readonly packId: string;
    readonly slug: string;
    readonly nameSv: string;
    readonly nameEn: string | null;
    readonly purposeSv: string;
  };
  readonly version: BesktMethodVersionSummary & {
    readonly sourceReference: string;
    readonly sourceDocumentVersion: string;
    readonly contentProvenance: string;
    readonly summarySv: string | null;
    readonly summaryEn: string | null;
    readonly suspendedReason: string | null;
    readonly retiredReason: string | null;
  };
  readonly exposureProfiles: readonly BesktContentRow[];
  readonly sections: readonly BesktContentRow[];
  readonly items: readonly BesktContentRow[];
  readonly itemOptions: readonly BesktContentRow[];
  readonly prompts: readonly BesktContentRow[];
  readonly routingRules: readonly BesktContentRow[];
  readonly evidenceAnchors: readonly BesktContentRow[];
  readonly observationFields: readonly BesktContentRow[];
  readonly activationRequirements: readonly BesktContentRow[];
  readonly reviews: readonly BesktReviewRecord[];
  readonly events: readonly BesktMethodEvent[];
}

const versionInput = z.object({ methodVersionId: z.string().uuid() });

/**
 * Everything an authoring screen needs about one version, in one round trip.
 *
 * Deliberately one call rather than nine: a screen that fetched the families
 * separately could render a routing rule beside an item list that no longer
 * contains its target, which would make a valid draft look broken.
 */
export const getBesktVersionWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => versionInput.parse(d))
  .handler(async ({ context, data }): Promise<BesktVersionWorkspace> => {
    const db = context.supabase;
    const id = data.methodVersionId;

    const versionRes = await db
      .from("beskt_method_versions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (versionRes.error) throw new Error(versionRes.error.message);
    if (!versionRes.data) throw new Error("BESKT_VERSION_NOT_FOUND: no such method version.");
    const v = versionRes.data as unknown as Record<string, unknown>;

    const packRes = await db
      .from("scp_interview_packs")
      .select("id, slug, name_sv, name_en, purpose_sv")
      .eq("id", v.pack_id as string)
      .maybeSingle();
    if (packRes.error) throw new Error(packRes.error.message);
    if (!packRes.data) throw new Error("BESKT_VERSION_NOT_FOUND: no such method version.");
    const p = packRes.data as unknown as Record<string, unknown>;

    // Written out rather than driven by a table-name variable. A helper that
    // took the table as a string would type the name as `string`, which the
    // generated Database type cannot check — and the whole value of those
    // types here is that a renamed or dropped column fails the build.
    const [
      profiles,
      sections,
      items,
      prompts,
      rules,
      anchors,
      fields,
      requirements,
      reviews,
      events,
    ] = await Promise.all([
      db
        .from("beskt_exposure_profiles")
        .select("*")
        .eq("method_version_id", id)
        .order("display_order", { ascending: true }),
      db
        .from("beskt_sections")
        .select("*")
        .eq("method_version_id", id)
        .order("display_order", { ascending: true }),
      db
        .from("beskt_items")
        .select("*")
        .eq("method_version_id", id)
        .order("display_order", { ascending: true }),
      db
        .from("beskt_prompts")
        .select("*")
        .eq("method_version_id", id)
        .order("display_order", { ascending: true }),
      db
        .from("beskt_routing_rules")
        .select("*")
        .eq("method_version_id", id)
        .order("evaluation_order", { ascending: true }),
      db
        .from("beskt_evidence_anchors")
        .select("*")
        .eq("method_version_id", id)
        .order("evidence_state", { ascending: true }),
      db
        .from("beskt_observation_fields")
        .select("*")
        .eq("method_version_id", id)
        .order("ordinal", { ascending: true }),
      db
        .from("beskt_activation_requirements")
        .select("*")
        .eq("method_version_id", id)
        .order("requirement_key", { ascending: true }),
      db
        .from("beskt_method_reviews")
        .select("*")
        .eq("method_version_id", id)
        .order("decided_at", { ascending: false }),
      db
        .from("beskt_method_events")
        .select("*")
        .eq("method_version_id", id)
        .order("seq", { ascending: false })
        .limit(200),
    ]);

    for (const res of [
      profiles,
      sections,
      items,
      prompts,
      rules,
      anchors,
      fields,
      requirements,
      reviews,
      events,
    ]) {
      if (res.error) throw new Error(res.error.message);
    }

    // Options hang off items, not off the version, so they are fetched by the
    // item ids this version actually has. An empty item list means no query
    // at all rather than an unfiltered read.
    const itemIds = asArray(items.data).map((i) => i.id as string);
    let optionRows: Record<string, unknown>[] = [];
    if (itemIds.length > 0) {
      const optionsRes = await db
        .from("beskt_item_options")
        .select("*")
        .in("item_id", itemIds)
        .order("display_order", { ascending: true });
      if (optionsRes.error) throw new Error(optionsRes.error.message);
      optionRows = asArray(optionsRes.data);
    }

    const rows = (r: { data: unknown }): readonly BesktContentRow[] =>
      asArray(r.data) as unknown as readonly BesktContentRow[];

    return {
      method: {
        packId: p.id as string,
        slug: p.slug as string,
        nameSv: p.name_sv as string,
        nameEn: str(p.name_en),
        purposeSv: p.purpose_sv as string,
      },
      version: {
        ...toVersionSummary(v),
        sourceReference: v.source_reference as string,
        sourceDocumentVersion: v.source_document_version as string,
        contentProvenance: v.content_provenance as string,
        summarySv: str(v.summary_sv),
        summaryEn: str(v.summary_en),
        suspendedReason: str(v.suspended_reason),
        retiredReason: str(v.retired_reason),
      },
      exposureProfiles: rows(profiles),
      sections: rows(sections),
      items: rows(items),
      itemOptions: optionRows as unknown as readonly BesktContentRow[],
      prompts: rows(prompts),
      routingRules: rows(rules),
      evidenceAnchors: rows(anchors),
      observationFields: rows(fields),
      activationRequirements: rows(requirements),
      reviews: asArray(reviews.data).map((r) => ({
        gate: r.gate as BesktGate,
        decision: r.decision as "approved" | "rejected",
        reviewerId: r.reviewer_id as string,
        rationale: r.rationale as string,
        contentHashAtReview: r.content_hash_at_review as string,
        revisionAtReview: r.revision_at_review as number,
        reviewCycleAtReview: r.review_cycle_at_review as number,
        decidedAt: r.decided_at as string,
      })),
      events: asArray(events.data).map((e) => ({
        seq: e.seq as number,
        event: e.event as string,
        actorId: str(e.actor_id),
        previousStatus: str(e.previous_status),
        newStatus: str(e.new_status),
        reason: str(e.reason),
        revision: num(e.revision),
        at: e.at as string,
      })),
    };
  });

export interface BesktValidationFinding {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
}

/**
 * The validator's own findings.
 *
 * `requireReviews` mirrors the two questions the lifecycle asks: content
 * completeness alone at submission, and completeness plus five approvals at
 * the current hash, revision and cycle at publication. The screen asks both
 * so an editor can see what is missing from each without provoking a refusal.
 */
export const validateBesktVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => versionInput.extend({ requireReviews: z.boolean() }).parse(d))
  .handler(async ({ context, data }): Promise<readonly BesktValidationFinding[]> => {
    const { data: rows, error } = await context.supabase.rpc("beskt_method_validate", {
      _method_version_id: data.methodVersionId,
      _require_reviews: data.requireReviews,
    });
    if (error) throw new Error(error.message);
    return asArray(rows).map((r) => ({
      code: r.code as string,
      severity: r.severity as string,
      message: r.message as string,
    }));
  });

export interface BesktGovernanceGrant {
  readonly grantId: string;
  readonly userId: string;
  readonly grantKind: BesktGrantKind;
  readonly grantedBy: string | null;
  readonly grantedAt: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly sourceReference: string;
  readonly revokedAt: string | null;
  readonly revokeReason: string | null;
}

/** Who may record which gate. Revoked grants are kept and shown, never hidden. */
export const listBesktGovernanceGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly BesktGovernanceGrant[]> => {
    const { data, error } = await context.supabase
      .from("beskt_governance_grants")
      .select("*")
      .order("granted_at", { ascending: false });
    if (error) throw new Error(error.message);
    return asArray(data).map((g) => ({
      grantId: g.id as string,
      userId: g.user_id as string,
      grantKind: g.grant_kind as BesktGrantKind,
      grantedBy: str(g.granted_by),
      grantedAt: g.granted_at as string,
      validFrom: g.valid_from as string,
      validUntil: str(g.valid_until),
      sourceReference: g.source_reference as string,
      revokedAt: str(g.revoked_at),
      revokeReason: str(g.revoke_reason),
    }));
  });

export interface BesktPilotGrant {
  readonly grantId: string;
  readonly employerId: string;
  readonly employerName: string | null;
  readonly methodVersionId: string;
  readonly sourceReference: string;
  readonly startsOn: string;
  readonly expiresOn: string;
  readonly revokedAt: string | null;
  readonly revokedReason: string | null;
}

/**
 * Which employers are admitted to this version, and which were.
 *
 * The employer name comes from a second read rather than an embedded join:
 * PostgREST would need a foreign-key relationship it may or may not expose,
 * and a missing name must degrade to an id rather than to a failed screen.
 */
export const listBesktPilotGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => versionInput.parse(d))
  .handler(async ({ context, data }): Promise<readonly BesktPilotGrant[]> => {
    const db = context.supabase;
    const { data: rows, error } = await db
      .from("bcp_pilot_grants")
      .select("*")
      .eq("method_version_id", data.methodVersionId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const grants = asArray(rows);
    const employerIds = [...new Set(grants.map((g) => g.employer_id as string))];
    const names = new Map<string, string>();
    if (employerIds.length > 0) {
      const empRes = await db.from("employers").select("id, name").in("id", employerIds);
      if (!empRes.error) {
        for (const e of asArray(empRes.data)) {
          const n = str(e.name);
          if (n !== null) names.set(e.id as string, n);
        }
      }
    }

    return grants.map((g) => ({
      grantId: g.id as string,
      employerId: g.employer_id as string,
      employerName: names.get(g.employer_id as string) ?? null,
      methodVersionId: g.method_version_id as string,
      sourceReference: g.source_reference as string,
      startsOn: g.starts_on as string,
      expiresOn: g.expires_on as string,
      revokedAt: str(g.revoked_at),
      revokedReason: str(g.revoked_reason),
    }));
  });

// ###########################################################################
// Writes — every one a governed RPC, every one idempotent by operation id.
// ###########################################################################

const opId = z.string().uuid();
const revision = z.number().int().min(1);

/** The method identity. Its slug, names and purpose are immutable afterwards. */
export const createBesktMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: opId,
        slug: z.string().min(1),
        nameSv: z.string().min(1),
        purposeSv: z.string().min(1),
        nameEn: z.string().min(1).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("beskt_create_method", {
      _operation_id: data.operationId,
      _slug: data.slug,
      _name_sv: data.nameSv,
      _purpose_sv: data.purposeSv,
      _name_en: data.nameEn ?? undefined,
    });
    if (error) throw new Error(error.message);
    const r = (row ?? {}) as Record<string, unknown>;
    return { packId: r.pack_id as string, slug: str(r.slug) };
  });

/** A new open version. The database refuses a second one for the same method. */
export const createBesktMethodVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: opId,
        packId: z.string().uuid(),
        mode: z.enum(BESKT_MODES),
        sourceReference: z.string().min(1),
        sourceDocumentVersion: z.string().min(1),
        contentProvenance: z.enum(BESKT_PROVENANCE),
        summarySv: z.string().nullable(),
        summaryEn: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("beskt_create_method_version", {
      _operation_id: data.operationId,
      _pack_id: data.packId,
      _mode: data.mode,
      _source_reference: data.sourceReference,
      _source_document_version: data.sourceDocumentVersion,
      _content_provenance: data.contentProvenance,
      _summary_sv: data.summarySv ?? undefined,
      _summary_en: data.summaryEn ?? undefined,
    });
    if (error) throw new Error(error.message);
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      methodVersionId: r.method_version_id as string,
      versionNumber: num(r.version_number),
      revision: num(r.revision),
    };
  });

/**
 * One governed content row, created or updated.
 *
 * The payload is passed through as the jsonb the RPC expects, which is also
 * why the RPC rejects unknown keys: a form that grew a field the contract
 * does not have is refused by name (`BESKT_CONTENT_UNKNOWN_FIELD`) rather
 * than silently dropped. An ABSENT key leaves the stored column alone; a key
 * sent as explicit null clears it.
 */
/**
 * What a governed content field can hold.
 *
 * Scalars, an explicit null, or an array of keys — which is what
 * `permitted_probe_bases` and the other text[] columns are. Nothing nested:
 * the governed tables have a column per claim precisely so that no field can
 * carry a structure the contract has not named, and a payload type that
 * admitted objects would let a form send one.
 */
const authorValue = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]);
export type BesktAuthorValue = z.infer<typeof authorValue>;
export type BesktAuthorPayload = Record<string, BesktAuthorValue>;

const authorInput = z.object({
  operationId: opId,
  methodVersionId: z.string().uuid(),
  expectedRevision: revision,
  payload: z.record(z.string(), authorValue),
});

interface AuthorResult {
  readonly family: string | null;
  readonly key: string | null;
  readonly rowId: string | null;
  readonly created: boolean;
  readonly revision: number | null;
}

/** Every `beskt_author_*` RPC answers the same receipt. */
function authorResult(row: unknown): AuthorResult {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    family: str(r.family),
    key: str(r.key),
    rowId: str(r.row_id),
    created: r.created === true,
    revision: num(r.revision),
  };
}

// The eight authoring RPCs, one server function each and written out in
// full. A single generic function taking an RPC name would type that name as
// `string`, which means the generated Database type could no longer check it
// — and a caller who could name the function could name any function in the
// schema. The payload argument is named differently by each contract, which
// is the second reason these cannot collapse into one.

export const authorBesktExposureProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => authorInput.parse(d))
  .handler(async ({ context, data }): Promise<AuthorResult> => {
    const { data: row, error } = await context.supabase.rpc("beskt_author_exposure_profile", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
      _profile: data.payload,
    });
    if (error) throw new Error(error.message);
    return authorResult(row);
  });

export const authorBesktSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => authorInput.parse(d))
  .handler(async ({ context, data }): Promise<AuthorResult> => {
    const { data: row, error } = await context.supabase.rpc("beskt_author_section", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
      _section: data.payload,
    });
    if (error) throw new Error(error.message);
    return authorResult(row);
  });

export const authorBesktItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => authorInput.parse(d))
  .handler(async ({ context, data }): Promise<AuthorResult> => {
    const { data: row, error } = await context.supabase.rpc("beskt_author_item", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
      _item: data.payload,
    });
    if (error) throw new Error(error.message);
    return authorResult(row);
  });

export const authorBesktPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => authorInput.parse(d))
  .handler(async ({ context, data }): Promise<AuthorResult> => {
    const { data: row, error } = await context.supabase.rpc("beskt_author_prompt", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
      _prompt: data.payload,
    });
    if (error) throw new Error(error.message);
    return authorResult(row);
  });

export const authorBesktRoutingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => authorInput.parse(d))
  .handler(async ({ context, data }): Promise<AuthorResult> => {
    const { data: row, error } = await context.supabase.rpc("beskt_author_routing_rule", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
      _rule: data.payload,
    });
    if (error) throw new Error(error.message);
    return authorResult(row);
  });

export const authorBesktEvidenceAnchor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => authorInput.parse(d))
  .handler(async ({ context, data }): Promise<AuthorResult> => {
    const { data: row, error } = await context.supabase.rpc("beskt_author_evidence_anchor", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
      _anchor: data.payload,
    });
    if (error) throw new Error(error.message);
    return authorResult(row);
  });

export const authorBesktObservationField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => authorInput.parse(d))
  .handler(async ({ context, data }): Promise<AuthorResult> => {
    const { data: row, error } = await context.supabase.rpc("beskt_author_observation_field", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
      _field: data.payload,
    });
    if (error) throw new Error(error.message);
    return authorResult(row);
  });

export const authorBesktActivationRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => authorInput.parse(d))
  .handler(async ({ context, data }): Promise<AuthorResult> => {
    const { data: row, error } = await context.supabase.rpc("beskt_author_activation_requirement", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
      _requirement: data.payload,
    });
    if (error) throw new Error(error.message);
    return authorResult(row);
  });

/** Remove one governed row from a draft. Refused from published onward. */
export const deleteBesktContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: opId,
        methodVersionId: z.string().uuid(),
        expectedRevision: revision,
        family: z.enum(BESKT_CONTENT_FAMILIES),
        key: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("beskt_delete_content", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
      _family: data.family,
      _key: data.key,
    });
    if (error) throw new Error(error.message);
    return authorResult(row);
  });

const lifecycleInput = z.object({
  operationId: opId,
  methodVersionId: z.string().uuid(),
  expectedRevision: revision,
});

/** Open a new review cycle. Every gate must be decided again afterwards. */
export const submitBesktForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => lifecycleInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("beskt_submit_for_review", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
    });
    if (error) throw new Error(error.message);
    const r = (row ?? {}) as Record<string, unknown>;
    return { status: str(r.content_status), revision: num(r.revision) };
  });

/**
 * One gate, decided by the signed-in reviewer.
 *
 * The reviewer is never sent: `beskt_record_review` reads `auth.uid()`, and
 * the row trigger independently requires an active grant for exactly this
 * gate. A screen therefore cannot record a decision on somebody else's
 * behalf even if it tried to.
 */
export const recordBesktReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    lifecycleInput
      .extend({
        gate: z.enum(BESKT_GATES),
        decision: z.enum(["approved", "rejected"]),
        rationale: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("beskt_record_review", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
      _gate: data.gate,
      _decision: data.decision,
      _rationale: data.rationale,
    });
    if (error) throw new Error(error.message);
    const r = (row ?? {}) as Record<string, unknown>;
    return { status: str(r.content_status), revision: num(r.revision) };
  });

/** Publish. The publisher is never the author, and the database re-checks. */
export const publishBesktVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => lifecycleInput.extend({ reason: z.string().nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("beskt_publish_version", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
      _reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);
    const r = (row ?? {}) as Record<string, unknown>;
    return { status: str(r.content_status), revision: num(r.revision) };
  });

export const suspendBesktVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => lifecycleInput.extend({ reason: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("beskt_suspend_version", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    const r = (row ?? {}) as Record<string, unknown>;
    return { status: str(r.content_status), revision: num(r.revision) };
  });

export const retireBesktVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => lifecycleInput.extend({ reason: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("beskt_retire_version", {
      _operation_id: data.operationId,
      _method_version_id: data.methodVersionId,
      _expected_revision: data.expectedRevision,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    const r = (row ?? {}) as Record<string, unknown>;
    return { status: str(r.content_status), revision: num(r.revision) };
  });

/** Grant one reviewer one gate, with the documented decision it came from. */
export const grantBesktGovernance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: opId,
        userId: z.string().uuid(),
        grantKind: z.enum(BESKT_GRANT_KINDS),
        sourceReference: z.string().min(1),
        validUntil: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("beskt_grant_governance", {
      _operation_id: data.operationId,
      _user_id: data.userId,
      _grant_kind: data.grantKind,
      _source_reference: data.sourceReference,
      _valid_until: data.validUntil ?? undefined,
    });
    if (error) throw new Error(error.message);
    const r = (row ?? {}) as Record<string, unknown>;
    return { grantId: str(r.grant_id) };
  });

export const revokeBesktGovernance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: opId,
        grantId: z.string().uuid(),
        reason: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("beskt_revoke_governance", {
      _operation_id: data.operationId,
      _grant_id: data.grantId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    const r = (row ?? {}) as Record<string, unknown>;
    return { grantId: str(r.grant_id) };
  });

/**
 * Admit one employer to one published version, for a bounded window.
 *
 * This is the ONLY thing that makes a published method assignable to a
 * candidate, anywhere, production included. It is per employer and it
 * expires, so a pilot cannot quietly become general availability.
 */
export const grantBesktPilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: opId,
        employerId: z.string().uuid(),
        methodVersionId: z.string().uuid(),
        sourceReference: z.string().min(1),
        expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("bcp_grant_pilot", {
      _operation_id: data.operationId,
      _employer_id: data.employerId,
      _method_version_id: data.methodVersionId,
      _source_reference: data.sourceReference,
      _expires_on: data.expiresOn,
    });
    if (error) throw new Error(error.message);
    const r = (row ?? {}) as Record<string, unknown>;
    return { grantId: str(r.grant_id) };
  });

export const revokeBesktPilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: opId,
        employerId: z.string().uuid(),
        methodVersionId: z.string().uuid(),
        reason: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.rpc("bcp_revoke_pilot", {
      _operation_id: data.operationId,
      _employer_id: data.employerId,
      _method_version_id: data.methodVersionId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    const r = (row ?? {}) as Record<string, unknown>;
    return { grantId: str(r.grant_id) };
  });
