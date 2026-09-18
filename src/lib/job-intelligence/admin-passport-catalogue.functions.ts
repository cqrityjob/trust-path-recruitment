// Platform administration — the Security Passport catalogue, DIAGNOSED.
//
// READ-ONLY. It answers one question an administrator could not answer before:
// "this researched credential is missing from a holder's wizard — why?".
// The reasons are computed by `diagnoseDefinition`, which restates the approved
// catalogue's own predicate, so this page and the coverage matrix cannot
// disagree with what a holder is actually offered.
//
// It approves nothing. Approval of a definition, and activation of a market,
// remain a reviewed, versioned migration by an authorised catalogue
// administrator (docs/passport/closed-catalogue-governance.md); pilot access
// for a named user remains the existing grant on the user's page. This page
// names the outstanding decision and the source evidence for it, and links to
// nothing that could take it.
//
// Every read is against tables that already exist on the owner project
// (sp_credential_types, sp_market_packs, sp_authorities,
// sp_certification_definitions/-issuers, sp_credential_organisation_roles,
// sp_credential_definition_reviews, sp_credential_definition_metadata,
// sp_jurisdictions, sp_sub_jurisdictions): no new database object is needed,
// so this ships with the application release, not behind a migration.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  diagnoseDefinition,
  type DefinitionDiagnosis,
  type DiagnosticDefinition,
} from "@/lib/security-passport/catalogue-diagnostics";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", { _user_id: ctx.userId });
  if (error) throw new Error("ROLE_CHECK_FAILED");
  if (!data) throw new Error("FORBIDDEN_ADMIN_REQUIRED");
}

export interface AdminCatalogueRow extends DiagnosticDefinition, DefinitionDiagnosis {}

type Row = Record<string, unknown>;

export const adminListPassportCatalogue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly AdminCatalogueRow[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    // Service role AFTER the admin check: pilot-state rows are hidden from an
    // ordinary session by design (20261109090000), and an administrator is not
    // a pilot member. Nothing here is written, and nothing personal is read.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseClient;
    // The organisation-role and review tables are granted to `authenticated`
    // only (20261123090000), so they are read through the administrator's OWN
    // session — which is also the narrower of the two routes.
    const own = ctx.supabase as unknown as SupabaseClient;
    const [types, packs, authorities, definitions, issuers, roles, reviews, metadata, js, subs] =
      await Promise.all([
        db
          .from("sp_credential_types")
          .select(
            "code,name_sv,name_en,claim_type,category,scope_code,market_pack_code,jurisdiction_code,sub_jurisdiction_code,is_active,pilot_state,legal_review_state,requires_scope,authority_id,sort_order",
          )
          .order("sort_order", { ascending: true }),
        db.from("sp_market_packs").select("code,is_active,pilot_state,superseded_on"),
        db.from("sp_authorities").select("id,name_local,is_active"),
        db.from("sp_certification_definitions").select("credential_code,issuer_id,retired_on"),
        db.from("sp_certification_issuers").select("id,display_name,is_active"),
        own
          .from("sp_credential_organisation_roles")
          .select("credential_code,role,authority_id,certification_issuer_id,document_specific"),
        own
          .from("sp_credential_definition_reviews")
          .select("credential_code,source_url,checked_on"),
        db.from("sp_credential_definition_metadata").select("credential_code,deprecated_at"),
        db.from("sp_jurisdictions").select("code,is_active"),
        db.from("sp_sub_jurisdictions").select("code,is_active"),
      ]);
    for (const r of [types, packs, authorities, definitions, issuers, roles, reviews, js, subs])
      if (r.error) throw new Error(`CATALOGUE_DIAGNOSTICS_LOAD_FAILED: ${r.error.message}`);

    const authorityName = new Map(
      ((authorities.data ?? []) as Row[])
        .filter((a) => a.is_active)
        .map((a) => [a.id as string, a.name_local as string]),
    );
    const issuerName = new Map(
      ((issuers.data ?? []) as Row[])
        .filter((i) => i.is_active)
        .map((i) => [i.id as string, i.display_name as string]),
    );
    const definitionIssuer = new Map(
      ((definitions.data ?? []) as Row[]).map((d) => [
        d.credential_code as string,
        d.issuer_id as string,
      ]),
    );
    const packOf = new Map(((packs.data ?? []) as Row[]).map((p) => [p.code as string, p]));
    const reviewOf = new Map(
      ((reviews.data ?? []) as Row[]).map((v) => [v.credential_code as string, v]),
    );
    // Tolerated absence: the metadata table is optional to the predicate.
    const deprecated = new Set(
      (metadata.error ? [] : ((metadata.data ?? []) as Row[]))
        .filter((m) => m.deprecated_at)
        .map((m) => m.credential_code as string),
    );
    const activeJurisdiction = new Set(
      ((js.data ?? []) as Row[]).filter((j) => j.is_active).map((j) => j.code as string),
    );
    const activeSub = new Set(
      ((subs.data ?? []) as Row[]).filter((j) => j.is_active).map((j) => j.code as string),
    );

    return ((types.data ?? []) as Row[]).map((t) => {
      const code = t.code as string;
      const mine = ((roles.data ?? []) as Row[]).filter((r) => r.credential_code === code);
      const role = (name: string) => mine.find((r) => r.role === name);
      const regulatorId = role("regulator")?.authority_id as string | undefined;
      const pack = t.market_pack_code ? packOf.get(t.market_pack_code as string) : undefined;
      const review = reviewOf.get(code);
      const definition: DiagnosticDefinition = {
        code,
        nameSv: t.name_sv as string,
        nameEn: t.name_en as string,
        claimType: t.claim_type as string,
        category: t.category as string,
        scopeCode: (t.scope_code as string | null) ?? null,
        marketPackCode: (t.market_pack_code as string | null) ?? null,
        jurisdictionCode: (t.jurisdiction_code as string | null) ?? null,
        subJurisdictionCode: (t.sub_jurisdiction_code as string | null) ?? null,
        isActive: t.is_active === true,
        pilotState: (t.pilot_state as string | null) ?? null,
        legalReviewState: (t.legal_review_state as string | null) ?? null,
        requiresScope: t.requires_scope === true,
        deprecated: deprecated.has(code),
        governedAuthority: t.authority_id
          ? (authorityName.get(t.authority_id as string) ?? null)
          : null,
        governedCertificationIssuer: definitionIssuer.has(code)
          ? (issuerName.get(definitionIssuer.get(code) as string) ?? null)
          : null,
        regulator: regulatorId ? (authorityName.get(regulatorId) ?? null) : null,
        issuerStatedOnDocument: role("issuer")?.document_specific === true,
        trainingProviderStatedOnDocument: role("training_provider")?.document_specific === true,
        jurisdictionActive:
          !t.jurisdiction_code ||
          (activeJurisdiction.has(t.jurisdiction_code as string) &&
            (!t.sub_jurisdiction_code || activeSub.has(t.sub_jurisdiction_code as string))),
        packIsActive: pack ? pack.is_active === true && !pack.superseded_on : null,
        packPilotState: pack ? ((pack.pilot_state as string | null) ?? null) : null,
        review: review
          ? { sourceUrl: review.source_url as string, checkedOn: review.checked_on as string }
          : null,
      };
      return { ...definition, ...diagnoseDefinition(definition) };
    });
  });
