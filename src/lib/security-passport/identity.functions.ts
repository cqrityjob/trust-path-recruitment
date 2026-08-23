// Security Passport — loading the derivation rules.
//
// Separate from the engine on purpose: `identity/` is a pure domain module
// with no database dependency, which is what lets the same derivation run in
// the browser, on the server and in the table-driven tests from one
// definition. This file is the only place that knows the rules are rows.
//
// ── WHY THE RULES ARE NOT A CONSTANT ───────────────────────────────────
//
// Adding a market pack must not require a deploy. A rule is an INSERT into
// sp_professional_titles, exactly as adding a credential is an INSERT into
// sp_credential_types — and for the same reason: the alternative is a
// TypeScript table that agrees with the database today and disagrees the first
// time somebody fixes a rule in production.
//
// `identity/market-rules.ts` mirrors the Swedish seed for callers that have no
// database at all (fixtures, tests). It is never read here, and
// scripts/passport-title-derivation-check.ts fails the build if the two drift.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AssertionLevel } from "./types";
import type { TitleOutputKind, TitleRule } from "./identity/types";

type RuleRow = {
  code: string;
  market_pack_code: string;
  profession_family_code: string | null;
  output_kind: string;
  name_local: string;
  name_en: string;
  name_ar: string | null;
  requires_credential_codes: string[];
  requires_assertion_level: string;
  requires_current_validity: boolean;
  priority: number;
  sp_regulated_roles: { code: string } | null;
};

/** Every active derivation rule, in display order.
 *
 *  Not filtered by market here: the engine decides what a holder's claims can
 *  satisfy, and a rule for a market the holder has nothing in simply produces
 *  no output. Filtering early would mean two places that know which markets
 *  are live. */
export const listTitleRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly TitleRule[]> => {
    const { data, error } = await context.supabase
      .from("sp_professional_titles")
      .select(
        "code, market_pack_code, profession_family_code, output_kind, name_local, name_en, name_ar, requires_credential_codes, requires_assertion_level, requires_current_validity, priority, sp_regulated_roles(code)",
      )
      .eq("is_active", true)
      .order("priority", { ascending: true });

    if (error) throw new Error(error.message);

    return ((data ?? []) as unknown as RuleRow[]).map((r) => ({
      code: r.code,
      marketPackCode: r.market_pack_code,
      professionFamilyCode: r.profession_family_code,
      regulatedRoleCode: r.sp_regulated_roles?.code ?? null,
      outputKind: r.output_kind as TitleOutputKind,
      nameLocal: r.name_local,
      nameEn: r.name_en,
      nameAr: r.name_ar,
      requiresCredentialCodes: r.requires_credential_codes ?? [],
      requiresAssertionLevel: r.requires_assertion_level as AssertionLevel,
      requiresCurrentValidity: r.requires_current_validity,
      priority: r.priority,
    }));
  });
