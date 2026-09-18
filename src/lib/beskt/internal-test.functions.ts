// BESKT — installing the v0.1 content, the owner's internal test activation,
// and governed content roles (20261129090000).
//
// Every write is a governed RPC run as the signed-in person; nothing here
// writes a table. The database decides who may do what:
//   - installing content needs the platform content role `editor`;
//   - a test activation and a content-role change need a platform admin.
//
// ── WHY THE INSTALL IS STEPPED ──────────────────────────────────────────
//
// The v0.1 recruitment method is about 170 governed rows. One server call
// that authored them all would exceed the per-request sub-request budget of
// the hosting runtime, and a timeout half-way would leave the editor unsure
// what exists. So the install is a sequence of small steps the page drives:
// step 0 creates the identity and the draft, every later step authors at
// most STEP_SIZE rows at the draft's CURRENT revision. Authoring upserts by
// key, so a retried step writes the same rows again rather than new ones.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SOURCE, SOURCE_VERSION } from "@/lib/beskt/import/beskt-v0-1.content";
import { buildPlan } from "@/lib/beskt/import/plan";

export const BESKT_V01_SLUG = "beskt-rekryteringsstod";
const STEP_SIZE = 30;

type Row = Record<string, unknown>;
type Family = { fn: string; param: string; rows: Row[] };

function families(lawfulBasisReference: string): Family[] {
  const plan = buildPlan("rekrytering", { synthetic: false, lawfulBasisReference });
  return [
    { fn: "beskt_author_exposure_profile", param: "_profile", rows: plan.profiles },
    { fn: "beskt_author_section", param: "_section", rows: plan.sections },
    { fn: "beskt_author_item", param: "_item", rows: plan.items },
    { fn: "beskt_author_routing_rule", param: "_rule", rows: plan.rules },
    { fn: "beskt_author_prompt", param: "_prompt", rows: plan.prompts },
    { fn: "beskt_author_evidence_anchor", param: "_anchor", rows: plan.anchors },
    { fn: "beskt_author_observation_field", param: "_field", rows: plan.fields },
  ];
}

function flatten(lawfulBasisReference: string): Array<{ fn: string; param: string; row: Row }> {
  return families(lawfulBasisReference).flatMap((f) =>
    f.rows.map((row) => ({ fn: f.fn, param: f.param, row })),
  );
}

export interface BesktInstallProgress {
  readonly methodVersionId: string;
  readonly done: number;
  readonly total: number;
  readonly finished: boolean;
  /** Blocking validator findings, once finished. Empty means complete. */
  readonly blocking: readonly string[];
}

/** Is v0.1 already installed? Readable by every governance reader. */
export const getBesktV01Installation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ methodVersionId: string; status: string; contentHash: string | null } | null> => {
      const db = context.supabase;
      const pack = await db
        .from("scp_interview_packs")
        .select("id")
        .eq("slug", BESKT_V01_SLUG)
        .eq("pack_kind", "beskt_method")
        .maybeSingle();
      if (pack.error) throw new Error(pack.error.message);
      if (!pack.data) return null;
      const v = await db
        .from("beskt_method_versions")
        .select("id, content_status, content_hash")
        .eq("pack_id", pack.data.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (v.error) throw new Error(v.error.message);
      return v.data
        ? {
            methodVersionId: v.data.id as string,
            status: v.data.content_status as string,
            contentHash: (v.data.content_hash as string | null) ?? null,
          }
        : null;
    },
  );

export const installBesktV01Step = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        step: z.number().int().min(0),
        methodVersionId: z.string().uuid().nullable(),
        lawfulBasisReference: z.string().trim().min(20).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<BesktInstallProgress> => {
    const db = context.supabase;
    const rpc = async <T>(fn: string, params: Record<string, unknown>): Promise<T> => {
      const { data: out, error } = await db.rpc(fn as never, params as never);
      if (error) throw new Error(error.message);
      return out as T;
    };
    const rows = flatten(data.lawfulBasisReference);

    if (data.step === 0) {
      const plan = buildPlan("rekrytering", { synthetic: false });
      const method = await rpc<{ pack_id: string }>("beskt_create_method", {
        _operation_id: crypto.randomUUID(),
        _slug: plan.method.slug,
        _name_sv: plan.method.nameSv,
        _purpose_sv: plan.method.purposeSv,
        _name_en: plan.method.nameEn,
      });
      const version = await rpc<{ method_version_id: string }>("beskt_create_method_version", {
        _operation_id: crypto.randomUUID(),
        _pack_id: method.pack_id,
        _mode: plan.version.mode,
        _source_reference: SOURCE,
        _source_document_version: SOURCE_VERSION,
        _content_provenance: "source_stated",
        _summary_sv: plan.version.summarySv,
        _summary_en: plan.version.summaryEn,
      });
      return {
        methodVersionId: version.method_version_id,
        done: 0,
        total: rows.length,
        finished: false,
        blocking: [],
      };
    }

    if (!data.methodVersionId) throw new Error("BESKT_VERSION_NOT_FOUND");
    const current = await db
      .from("beskt_method_versions")
      .select("revision")
      .eq("id", data.methodVersionId)
      .single();
    if (current.error) throw new Error(current.error.message);
    let revision = current.data.revision as number;

    const start = (data.step - 1) * STEP_SIZE;
    const slice = rows.slice(start, start + STEP_SIZE);
    for (const { fn, param, row } of slice) {
      const payload = { ...row };
      if (payload.evaluation_template_key) {
        payload.wording_sv = await rpc<string>("beskt_evaluation_template", {
          _key: payload.evaluation_template_key,
          _locale: "sv",
        });
        payload.wording_en = await rpc<string>("beskt_evaluation_template", {
          _key: payload.evaluation_template_key,
          _locale: "en",
        });
      }
      const r = await rpc<{ revision: number }>(fn, {
        _operation_id: crypto.randomUUID(),
        _method_version_id: data.methodVersionId,
        _expected_revision: revision,
        [param]: payload,
      });
      revision = r.revision;
    }

    const done = Math.min(rows.length, start + slice.length);
    const finished = done >= rows.length;
    let blocking: string[] = [];
    if (finished) {
      const findings = await rpc<Array<{ code: string; severity: string }>>(
        "beskt_method_validate",
        { _method_version_id: data.methodVersionId, _require_reviews: false },
      );
      blocking = (findings ?? []).filter((f) => f.severity === "blocking").map((f) => f.code);
    }
    return { methodVersionId: data.methodVersionId, done, total: rows.length, finished, blocking };
  });

/* ------------------------------------------------------------------ */
/* The owner's internal test activation                                */
/* ------------------------------------------------------------------ */

export interface BesktTestActivation {
  readonly activationId: string;
  readonly employerId: string;
  readonly employerName: string;
  readonly methodVersionId: string;
  readonly pinnedContentHash: string;
  readonly decisionReference: string;
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly expiresOn: string;
  readonly revokedAt: string | null;
  readonly revokeReason: string | null;
  readonly isLive: boolean;
}

export const listBesktTestActivations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid().nullable().optional(),
        methodVersionId: z.string().uuid().nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }): Promise<readonly BesktTestActivation[]> => {
    const { data: rows, error } = await context.supabase.rpc(
      "bcp_internal_test_activations_for" as never,
      {
        _employer_id: data.employerId ?? null,
        _method_version_id: data.methodVersionId ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      activationId: r.activation_id as string,
      employerId: r.employer_id as string,
      employerName: r.employer_name as string,
      methodVersionId: r.method_version_id as string,
      pinnedContentHash: r.pinned_content_hash as string,
      decisionReference: r.decision_reference as string,
      decidedBy: r.decided_by as string,
      decidedAt: r.decided_at as string,
      expiresOn: r.expires_on as string,
      revokedAt: (r.revoked_at as string | null) ?? null,
      revokeReason: (r.revoke_reason as string | null) ?? null,
      isLive: Boolean(r.is_live),
    }));
  });

export const grantBesktTestActivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        employerSlug: z.string().trim().min(1).max(200),
        methodVersionId: z.string().uuid(),
        decisionReference: z.string().trim().min(10).max(2000),
        expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ activationId: string }> => {
    const emp = await context.supabase
      .from("employers")
      .select("id")
      .eq("slug", data.employerSlug)
      .maybeSingle();
    if (emp.error) throw new Error(emp.error.message);
    if (!emp.data) throw new Error("BCP_EMPLOYER_NOT_FOUND");
    const { data: out, error } = await context.supabase.rpc(
      "bcp_grant_internal_test_activation" as never,
      {
        _operation_id: data.operationId,
        _employer_id: emp.data.id,
        _method_version_id: data.methodVersionId,
        _decision_reference: data.decisionReference,
        _expires_on: data.expiresOn,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { activationId: (out as { activation_id: string }).activation_id };
  });

export const revokeBesktTestActivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        activationId: z.string().uuid(),
        reason: z.string().trim().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ revoked: true }> => {
    const { error } = await context.supabase.rpc(
      "bcp_revoke_internal_test_activation" as never,
      {
        _operation_id: data.operationId,
        _activation_id: data.activationId,
        _reason: data.reason,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { revoked: true };
  });

/* ------------------------------------------------------------------ */
/* Content roles                                                        */
/* ------------------------------------------------------------------ */

export const setBesktContentRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        operationId: z.string().uuid(),
        email: z.string().trim().email(),
        role: z.enum(["editor", "reviewer", "publisher"]),
        grant: z.boolean(),
        reason: z.string().trim().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<{ action: string }> => {
    const { data: out, error } = await context.supabase.rpc(
      "beskt_set_content_role" as never,
      {
        _operation_id: data.operationId,
        _email: data.email,
        _role: data.role,
        _grant: data.grant,
        _reason: data.reason,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { action: (out as { action: string }).action };
  });
