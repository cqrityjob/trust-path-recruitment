// Admin Portal — Assessment Catalog management.
//
// Reads/writes exactly two existing tables: public.assessments and
// public.assessment_versions. Both already carry an
// `*_admin_write` RLS policy (FOR ALL, gated on has_role(assessment_editor
// /admin/superadmin)) from the original schema -- this file adds no new
// RLS, it exposes a narrow, validated TS surface over what that policy
// already allows a platform admin to do directly. Question content,
// competency/dimension mappings, and scoring all live in code
// (src/lib/question-library, src/lib/career-intelligence-engine) --
// nothing in either table this file touches can affect scoring. Only
// employer_visible, role_category (assessments) and model_version/
// disclaimer_version/notes/retired_at (assessment_versions, INSERT-new-
// row or set-retired_at-once only -- never an arbitrary UPDATE of an
// existing version's identity) are ever written here.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { byDefinition } from "@/lib/question-library/registry";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error("ROLE_CHECK_FAILED");
  if (!data) throw new Error("FORBIDDEN_ADMIN_REQUIRED");
}

async function writeAudit(params: {
  actorId: string;
  action: string;
  assessmentId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: params.actorId,
    actor_role: "platform_admin",
    action: params.action,
    subject_type: "assessment",
    subject_id: params.assessmentId,
    metadata: params.metadata as any,
  });
}

export type AdminAssessmentVersionRow = {
  id: string;
  modelVersion: string;
  disclaimerVersion: string;
  publishedAt: string;
  retiredAt: string | null;
  notes: string | null;
};

export type AdminAssessmentCatalogRow = {
  id: string;
  nameSv: string;
  nameEn: string;
  kind: string;
  employerVisible: boolean;
  roleCategory: "operational" | "strategic" | null;
  questionCount: number;
  versions: AdminAssessmentVersionRow[];
  publicationStatus: "published" | "unpublished";
};

async function buildRows(ctx: Ctx): Promise<AdminAssessmentCatalogRow[]> {
  const { data: rows, error } = await ctx.supabase
    .from("assessments")
    .select("id, name_sv, name_en, kind, employer_visible, role_category")
    .order("id", { ascending: true });
  if (error) {
    console.error("[admin-assessment-catalog] list failed", error);
    throw new Error("CATALOG_LOAD_FAILED");
  }
  const assessmentIds = (rows ?? []).map((r: any) => r.id as string);

  const { data: versionRows, error: versionErr } =
    assessmentIds.length > 0
      ? await ctx.supabase
          .from("assessment_versions")
          .select(
            "id, assessment_id, model_version, disclaimer_version, published_at, retired_at, notes",
          )
          .in("assessment_id", assessmentIds)
          .order("published_at", { ascending: false })
      : { data: [], error: null };
  if (versionErr) {
    console.error("[admin-assessment-catalog] versions load failed", versionErr);
    throw new Error("CATALOG_LOAD_FAILED");
  }

  const versionsByAssessment = new Map<string, AdminAssessmentVersionRow[]>();
  for (const v of versionRows ?? []) {
    const list = versionsByAssessment.get(v.assessment_id) ?? [];
    list.push({
      id: v.id,
      modelVersion: v.model_version,
      disclaimerVersion: v.disclaimer_version,
      publishedAt: v.published_at,
      retiredAt: v.retired_at ?? null,
      notes: v.notes ?? null,
    });
    versionsByAssessment.set(v.assessment_id, list);
  }

  return (rows ?? []).map((r: any) => {
    const versions = versionsByAssessment.get(r.id) ?? [];
    const latest = versions[0] ?? null;
    return {
      id: r.id,
      nameSv: r.name_sv,
      nameEn: r.name_en,
      kind: r.kind,
      employerVisible: Boolean(r.employer_visible),
      roleCategory: r.role_category ?? null,
      questionCount: byDefinition(r.id).length,
      versions,
      publicationStatus: latest && !latest.retiredAt ? "published" : "unpublished",
    };
  });
}

const listSchema = z.object({
  status: z.enum(["all", "published", "unpublished"]).default("all"),
  visibility: z.enum(["all", "visible", "hidden"]).default("all"),
  roleCategory: z.enum(["all", "operational", "strategic", "none"]).default("all"),
});

export const adminListAssessmentCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AdminAssessmentCatalogRow[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const rows = await buildRows(ctx);
    return rows.filter((r) => {
      if (data.status !== "all" && r.publicationStatus !== data.status) return false;
      if (data.visibility === "visible" && !r.employerVisible) return false;
      if (data.visibility === "hidden" && r.employerVisible) return false;
      if (data.roleCategory === "none" && r.roleCategory !== null) return false;
      if (
        (data.roleCategory === "operational" || data.roleCategory === "strategic") &&
        r.roleCategory !== data.roleCategory
      )
        return false;
      return true;
    });
  });

const entrySchema = z.object({ assessmentId: z.string().min(1) });

export const adminGetAssessmentCatalogEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entrySchema.parse(d))
  .handler(async ({ data, context }): Promise<AdminAssessmentCatalogRow | null> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const rows = await buildRows(ctx);
    return rows.find((r) => r.id === data.assessmentId) ?? null;
  });

const visibilitySchema = z.object({
  assessmentId: z.string().min(1),
  visible: z.boolean(),
});

export const adminSetAssessmentVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => visibilitySchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const { error } = await ctx.supabase
      .from("assessments")
      .update({ employer_visible: data.visible })
      .eq("id", data.assessmentId);
    if (error) {
      console.error("[admin-assessment-catalog] set visibility failed", error);
      throw new Error("CATALOG_UPDATE_FAILED");
    }
    await writeAudit({
      actorId: ctx.userId,
      action: "assessment_visibility_changed",
      assessmentId: data.assessmentId,
      metadata: { employer_visible: data.visible },
    });
    return { id: data.assessmentId };
  });

const roleCategorySchema = z.object({
  assessmentId: z.string().min(1),
  roleCategory: z.enum(["operational", "strategic"]).nullable(),
});

export const adminSetAssessmentRoleCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => roleCategorySchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const { error } = await ctx.supabase
      .from("assessments")
      .update({ role_category: data.roleCategory })
      .eq("id", data.assessmentId);
    if (error) {
      console.error("[admin-assessment-catalog] set role category failed", error);
      throw new Error("CATALOG_UPDATE_FAILED");
    }
    await writeAudit({
      actorId: ctx.userId,
      action: "assessment_role_category_changed",
      assessmentId: data.assessmentId,
      metadata: { role_category: data.roleCategory },
    });
    return { id: data.assessmentId };
  });

const publishSchema = z.object({
  assessmentId: z.string().min(1),
  modelVersion: z.string().trim().min(1).max(64),
  disclaimerVersion: z.string().trim().min(1).max(64),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const adminPublishAssessmentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => publishSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const { data: inserted, error } = await ctx.supabase
      .from("assessment_versions")
      .insert({
        assessment_id: data.assessmentId,
        model_version: data.modelVersion,
        disclaimer_version: data.disclaimerVersion,
        notes: data.notes || null,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[admin-assessment-catalog] publish version failed", error);
      if (error.code === "23505") throw new Error("VERSION_ALREADY_EXISTS");
      throw new Error("VERSION_PUBLISH_FAILED");
    }
    await writeAudit({
      actorId: ctx.userId,
      action: "assessment_version_published",
      assessmentId: data.assessmentId,
      metadata: { model_version: data.modelVersion, disclaimer_version: data.disclaimerVersion },
    });
    return { id: inserted.id as string };
  });

const retireSchema = z.object({
  assessmentId: z.string().min(1),
  versionId: z.string().uuid(),
});

export const adminRetireAssessmentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => retireSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const { data: updated, error } = await ctx.supabase
      .from("assessment_versions")
      .update({ retired_at: new Date().toISOString() })
      .eq("id", data.versionId)
      .eq("assessment_id", data.assessmentId)
      .is("retired_at", null)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[admin-assessment-catalog] retire version failed", error);
      throw new Error("VERSION_RETIRE_FAILED");
    }
    if (!updated) throw new Error("VERSION_ALREADY_RETIRED");
    await writeAudit({
      actorId: ctx.userId,
      action: "assessment_version_retired",
      assessmentId: data.assessmentId,
      metadata: { version_id: data.versionId },
    });
    return { id: updated.id as string };
  });
