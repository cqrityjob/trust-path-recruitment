// Employer Assessment Center — catalogue read functions (foundation phase).
//
// Scope: list + read a single Assessment Definition for the employer
// portal's "Assessments" tab. No invitations, no candidate assignment, no
// scoring, no results. Every value returned here is either read directly
// from the existing Assessment Catalog (public.assessments /
// public.assessment_versions) or derived from the existing Question
// Library / Competency Library / Dimension Model at request time —
// nothing is hardcoded or duplicated from question content, and no
// scoring weight, threshold, or answer key is ever read or returned.
//
// Security model mirrors getEmployerDashboardStats
// (employer-dashboard.functions.ts) exactly: requireSupabaseAuth verifies
// the bearer and injects ctx.userId; every call re-derives the caller's
// *active* membership on the given employerId through ctx.supabase (the
// caller's own RLS-scoped client) before any read. The catalog tables
// themselves are public-read (assessments_public_read / assessment_
// versions_public_read, `USING (true)`), so this membership check is not
// what makes the catalog data itself confidential — it exists so the
// employer-scoped route behaves identically to every other
// /employer/$employerSlug/* page (fail closed with the same generic
// "Access not available" error for a non-member, an invalid employerId,
// or a foreign organisation), never distinguishing those cases.
//
// `employer_visible` (added by supabase/migrations/20260721120000_
// employer_assessment_catalog_visibility.sql) is the sole gate on which
// catalog rows are eligible to appear here at all — a definition with
// employer_visible = false (the default for every existing and future
// row, including 'public-career-assessment') is never returned by either
// function below, list or single-entry.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { byDefinition } from "@/lib/question-library/registry";
import { bySlug as competencyBySlug } from "@/lib/competency-library/registry";
import { dimensionById } from "@/lib/career-assessment/dimensions";

type Ctx = { supabase: any; userId: string };

type Bi = { sv: string; en: string };

export type EmployerAssessmentRoleCategory = "operational" | "strategic";
export type EmployerAssessmentPublicationStatus = "published" | "unpublished";

export type EmployerAssessmentCatalogEntry = {
  id: string;
  name: Bi;
  roleCategory: EmployerAssessmentRoleCategory;
  questionCount: number;
  estimatedMinutes: number;
  languages: string[];
  competencies: Bi[];
  dimensions: Bi[];
  version: {
    modelVersion: string;
    disclaimerVersion: string;
    publishedAt: string;
    notes: string | null;
  } | null;
  publicationStatus: EmployerAssessmentPublicationStatus;
  lastUpdated: string | null;
};

type AssessmentRow = {
  id: string;
  name_sv: string;
  name_en: string;
  role_category: EmployerAssessmentRoleCategory | null;
  employer_visible: boolean;
};

type AssessmentVersionRow = {
  assessment_id: string;
  model_version: string;
  disclaimer_version: string;
  published_at: string;
  retired_at: string | null;
  notes: string | null;
};

// ~18 seconds/question -- the same ratio the platform's own documented
// "16 questions, ~5 minutes" figure for this exact frozen question content
// implies (docs/job-intelligence/Public_Assessment_MVP_v2.1.md). A derived
// estimate from the real question count, never a fabricated number.
const SECONDS_PER_QUESTION = 18;

function estimateMinutes(questionCount: number): number {
  return Math.max(1, Math.round((questionCount * SECONDS_PER_QUESTION) / 60));
}

function buildEntry(
  row: AssessmentRow,
  latestVersion: AssessmentVersionRow | null,
): EmployerAssessmentCatalogEntry {
  const assets = byDefinition(row.id);
  const competencySlugs = Array.from(new Set(assets.flatMap((a) => a.competencies)));
  const dimensionIds = Array.from(new Set(assets.flatMap((a) => a.dimensions)));

  return {
    id: row.id,
    name: { sv: row.name_sv, en: row.name_en },
    // Non-null by construction: only rows with employer_visible = true
    // reach buildEntry, and the migration's CHECK constraint plus the
    // seed UPDATE guarantee every employer_visible row also carries a
    // role_category.
    roleCategory: row.role_category ?? "operational",
    questionCount: assets.length,
    estimatedMinutes: estimateMinutes(assets.length),
    // Every assessments row carries both name_sv and name_en (NOT NULL) —
    // the platform is bilingual by construction, not per-definition
    // configurable today.
    languages: ["sv", "en"],
    competencies: competencySlugs
      .map((slug) => competencyBySlug(slug)?.name)
      .filter((n): n is Bi => Boolean(n)),
    dimensions: dimensionIds
      .map((id) => dimensionById[id]?.name)
      .filter((n): n is Bi => Boolean(n)),
    version: latestVersion
      ? {
          modelVersion: latestVersion.model_version,
          disclaimerVersion: latestVersion.disclaimer_version,
          publishedAt: latestVersion.published_at,
          notes: latestVersion.notes,
        }
      : null,
    publicationStatus: latestVersion && !latestVersion.retired_at ? "published" : "unpublished",
    lastUpdated: latestVersion?.published_at ?? null,
  };
}

async function assertActiveMembership(ctx: Ctx, employerId: string): Promise<void> {
  const { data: membership, error } = await ctx.supabase
    .from("employer_memberships")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("employer_id", employerId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error("Access not available");
  if (!membership) throw new Error("Access not available");
}

// -------- listEmployerAssessmentCatalog --------

const listSchema = z.object({
  employerId: z.string().uuid(),
});

export const listEmployerAssessmentCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }): Promise<EmployerAssessmentCatalogEntry[]> => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const { data: rows, error } = await ctx.supabase
      .from("assessments")
      .select("id, name_sv, name_en, role_category, employer_visible")
      .eq("employer_visible", true)
      .order("id", { ascending: true });
    if (error) throw new Error("Could not load the assessment catalogue.");

    const assessmentRows = (rows ?? []) as AssessmentRow[];
    if (assessmentRows.length === 0) return [];

    const { data: versionRows, error: versionErr } = await ctx.supabase
      .from("assessment_versions")
      .select("assessment_id, model_version, disclaimer_version, published_at, retired_at, notes")
      .in(
        "assessment_id",
        assessmentRows.map((r) => r.id),
      )
      .order("published_at", { ascending: false });
    if (versionErr) throw new Error("Could not load the assessment catalogue.");

    const latestByAssessment = new Map<string, AssessmentVersionRow>();
    for (const v of (versionRows ?? []) as AssessmentVersionRow[]) {
      if (!latestByAssessment.has(v.assessment_id)) latestByAssessment.set(v.assessment_id, v);
    }

    return assessmentRows.map((row) => buildEntry(row, latestByAssessment.get(row.id) ?? null));
  });

// -------- getEmployerAssessmentCatalogEntry --------

const getEntrySchema = z.object({
  employerId: z.string().uuid(),
  assessmentId: z.string().min(1),
});

export const getEmployerAssessmentCatalogEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => getEntrySchema.parse(d))
  .handler(async ({ data, context }): Promise<EmployerAssessmentCatalogEntry | null> => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const { data: row, error } = await ctx.supabase
      .from("assessments")
      .select("id, name_sv, name_en, role_category, employer_visible")
      .eq("id", data.assessmentId)
      .eq("employer_visible", true)
      .maybeSingle();
    if (error) throw new Error("Could not load this assessment.");
    if (!row) return null;

    const { data: versionRows, error: versionErr } = await ctx.supabase
      .from("assessment_versions")
      .select("assessment_id, model_version, disclaimer_version, published_at, retired_at, notes")
      .eq("assessment_id", data.assessmentId)
      .order("published_at", { ascending: false })
      .limit(1);
    if (versionErr) throw new Error("Could not load this assessment.");

    const latestVersion = ((versionRows ?? []) as AssessmentVersionRow[])[0] ?? null;
    return buildEntry(row as AssessmentRow, latestVersion);
  });
