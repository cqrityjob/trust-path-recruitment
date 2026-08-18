// Security Passport — the holder's own record entries (Phase 8).
//
// Employment periods and the free-text claim kinds — education, courses,
// certifications, specialisations, professional memberships — are what a
// holder spends most of their time entering, and until Phase 8 the product
// could not store any of them from the UI. Onboarding collected answers into
// a JSON blob on the profile and stopped there, so a holder could complete
// thirteen steps and still have an empty Passport.
//
// This file is the missing write path. It is deliberately separate from:
//
//   * `credentials.functions.ts`, which owns the four TAXONOMY credentials
//     (VU1/VU2/OV/SV) and their draft/activation rules;
//   * `passport.functions.ts`, which owns the profile, the snapshot read and
//     correction/withdrawal.
//
// ── WHAT IT CANNOT DO ──────────────────────────────────────────────────
//
// Nothing here writes `assertion_level`, `lifecycle_state` beyond `active`,
// `verified_by_user_id` or `verified_at`. There is no parameter for any of
// them and the strings never appear in a write position, so an entry created
// here is `self_declared` by column default. Only `sp_attach_evidence` and
// `sp_verifier_decide` can move it, and both live in the database.
//
// ── WHY "REMOVE" WITHDRAWS RATHER THAN DELETES ─────────────────────────
//
// There is no DELETE grant on any `sp_*` table, for anyone. That is a design
// decision, not an oversight: a Passport is a record other people act on, and
// a record that can be erased is not evidence of anything. So "remove" marks
// the entry `withdrawn`, which is what the holder means — it leaves their
// Passport and stops being disclosed — while the row and its history survive.
//
// Withdrawn entries are filtered out of `listMyEntries` and out of the
// snapshot, so the holder sees exactly what they expect: it is gone.
//
// The guard is still `self_declared` + `active`. Once evidence is attached or
// a review is open, even withdrawal has to go through the workflow, because
// somebody else is mid-decision on it.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

/** The claim kinds a holder enters as free text. The taxonomy credentials
 *  (VU1/VU2/OV/SV) are deliberately absent: they have their own form, their
 *  own rules and their own server file, and routing them through here would
 *  bypass the taxonomy trigger's expectations about who wrote them. */
export const FREE_CLAIM_KINDS = [
  "education",
  "training",
  "certification",
  "specialisation",
  "professional_membership",
] as const;

export type FreeClaimKind = (typeof FREE_CLAIM_KINDS)[number];

export interface ExperienceEntry {
  readonly id: string;
  readonly employerName: string;
  readonly roleTitle: string;
  readonly employmentType: string;
  readonly fteFraction: number;
  readonly securityRelevance: string;
  readonly securityFraction: number;
  readonly startedOn: string;
  readonly endedOn: string | null;
  readonly jurisdictionCode: string;
  readonly assertionLevel: string;
  readonly lifecycleState: string;
  /** True while the holder may still edit or delete it outright. */
  readonly editable: boolean;
}

export interface ClaimEntry {
  readonly id: string;
  readonly claimType: string;
  readonly credentialCode: string | null;
  /** Phase 11. Controlled language or practical-capability code, FK-backed.
   *  Never both this and `credentialCode`: a language does not wear a
   *  credential symbol, and the database refuses an entry that tries. */
  readonly skillCode: string | null;
  /** A value from the scale the skill type declares. Never free text. */
  readonly skillLevel: string | null;
  readonly title: string;
  readonly issuerName: string | null;
  readonly jurisdictionCode: string | null;
  readonly issuedOn: string | null;
  readonly validUntil: string | null;
  readonly assertionLevel: string;
  readonly lifecycleState: string;
  readonly versionNo: number;
  readonly editable: boolean;
}

/** An entry stops being freely editable the moment it is no longer a plain
 *  self-declared active row. Computed on the server so the UI cannot offer a
 *  destructive control the database would refuse. */
function isEditable(assertion: string, lifecycle: string): boolean {
  return assertion === "self_declared" && lifecycle === "active";
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export const listMyEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      experience: readonly ExperienceEntry[];
      claims: readonly ClaimEntry[];
    }> => {
      const { supabase, userId } = context;

      const [expRes, claimRes] = await Promise.all([
        supabase
          .from("sp_experience_periods")
          .select(
            "id, employer_name, role_title, employment_type, fte_fraction, security_relevance, security_fraction, started_on, ended_on, jurisdiction_code, assertion_level, lifecycle_state",
          )
          .eq("holder_user_id", userId)
          .neq("lifecycle_state", "superseded")
          .neq("lifecycle_state", "withdrawn")
          .order("started_on", { ascending: false }),
        supabase
          .from("sp_claims")
          .select(
            "id, claim_type, credential_code, skill_code, skill_level, title, claimed_issuer_name, jurisdiction_code, issued_on, valid_until, assertion_level, lifecycle_state, version_no",
          )
          .eq("holder_user_id", userId)
          .neq("lifecycle_state", "superseded")
          .neq("lifecycle_state", "withdrawn")
          .order("created_at", { ascending: false }),
      ]);

      if (expRes.error) throw new Error(expRes.error.message);
      if (claimRes.error) throw new Error(claimRes.error.message);

      const experience = (expRes.data ?? []).map((r): ExperienceEntry => {
        const row = r as Record<string, unknown>;
        return {
          id: row.id as string,
          employerName: row.employer_name as string,
          roleTitle: row.role_title as string,
          employmentType: row.employment_type as string,
          fteFraction: Number(row.fte_fraction),
          securityRelevance: row.security_relevance as string,
          securityFraction: Number(row.security_fraction),
          startedOn: row.started_on as string,
          endedOn: (row.ended_on as string | null) ?? null,
          jurisdictionCode: row.jurisdiction_code as string,
          assertionLevel: row.assertion_level as string,
          lifecycleState: row.lifecycle_state as string,
          editable: isEditable(row.assertion_level as string, row.lifecycle_state as string),
        };
      });

      const claims = (claimRes.data ?? []).map((r): ClaimEntry => {
        const row = r as Record<string, unknown>;
        return {
          id: row.id as string,
          claimType: row.claim_type as string,
          credentialCode: (row.credential_code as string | null) ?? null,
          skillCode: (row.skill_code as string | null) ?? null,
          skillLevel: (row.skill_level as string | null) ?? null,
          title: row.title as string,
          issuerName: (row.claimed_issuer_name as string | null) ?? null,
          jurisdictionCode: (row.jurisdiction_code as string | null) ?? null,
          issuedOn: (row.issued_on as string | null) ?? null,
          validUntil: (row.valid_until as string | null) ?? null,
          assertionLevel: row.assertion_level as string,
          lifecycleState: row.lifecycle_state as string,
          versionNo: Number(row.version_no),
          editable: isEditable(row.assertion_level as string, row.lifecycle_state as string),
        };
      });

      return { experience, claims };
    },
  );

/* ------------------------------------------------------------------ */
/* Employment                                                          */
/* ------------------------------------------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const experienceInput = z
  .object({
    /** Present when editing an existing row. */
    id: z.string().uuid().nullable().optional(),
    employerName: z.string().min(1).max(160),
    roleTitle: z.string().min(1).max(160),
    employmentType: z.enum(["full_time", "part_time", "hourly", "temporary"]),
    fteFraction: z.number().min(0.01).max(1),
    securityRelevance: z.enum(["primary", "partial", "none"]),
    securityFraction: z.number().min(0).max(1),
    startedOn: z.string().regex(ISO_DATE),
    /** Null means ongoing. */
    endedOn: z.string().regex(ISO_DATE).nullable(),
    jurisdictionCode: z.string().length(2).default("SE"),
  })
  // An end before the start is not an incomplete entry, it is a contradiction,
  // and the database CHECK would refuse it anyway. Refusing here gives the
  // holder a field-level message instead of a PostgREST error.
  .refine((v) => v.endedOn === null || v.endedOn > v.startedOn, {
    message: "SP_PERIOD_END_BEFORE_START",
    path: ["endedOn"],
  });

export const saveExperienceEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => experienceInput.parse(data))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { supabase, userId } = context;

    // `security_fraction` is forced to 1 for a primary-relevance role rather
    // than trusted from the client: a role that IS security work is wholly
    // security work, and letting the two disagree would let a holder weight
    // their own experience.
    const fraction = data.securityRelevance === "primary" ? 1 : data.securityFraction;

    if (data.id) {
      // RLS scopes the update to the holder; the explicit filter is belt and
      // braces. The lifecycle/assertion columns are absent, so an edit can
      // never change what the entry claims about its own trust.
      const patch: TablesUpdate<"sp_experience_periods"> = {
        employer_name: data.employerName,
        role_title: data.roleTitle,
        employment_type: data.employmentType,
        fte_fraction: data.fteFraction,
        security_relevance: data.securityRelevance,
        security_fraction: fraction,
        started_on: data.startedOn,
        ended_on: data.endedOn,
        jurisdiction_code: data.jurisdictionCode,
      };
      const { error } = await supabase
        .from("sp_experience_periods")
        .update(patch)
        .eq("id", data.id)
        .eq("holder_user_id", userId)
        .eq("assertion_level", "self_declared")
        .eq("lifecycle_state", "active");
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const insert: TablesInsert<"sp_experience_periods"> = {
      holder_user_id: userId,
      employer_name: data.employerName,
      role_title: data.roleTitle,
      employment_type: data.employmentType,
      fte_fraction: data.fteFraction,
      security_relevance: data.securityRelevance,
      security_fraction: fraction,
      started_on: data.startedOn,
      ended_on: data.endedOn,
      jurisdiction_code: data.jurisdictionCode,
    };
    const { data: row, error } = await supabase
      .from("sp_experience_periods")
      .insert(insert)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const id = (row as { id: string }).id;
    await supabase.from("sp_passport_events").insert({
      holder_user_id: userId,
      actor_user_id: userId,
      event_type: "experience_created",
      subject_type: "experience",
      subject_id: id,
      detail: { employer_name: data.employerName, role_title: data.roleTitle },
    });
    return { id };
  });

/* ------------------------------------------------------------------ */
/* Languages and practical skills (Phase 11)                           */
/* ------------------------------------------------------------------ */
//
// These are `sp_claims` rows like everything else, so they inherit evidence,
// review, correction, versioning, withdrawal and disclosure for free. What
// makes them different is that the WHAT and the LEVEL both come from a
// controlled vocabulary, never from something the holder typed. A language
// nobody can check is a self-declaration, and it says so.

export interface SkillType {
  readonly code: string;
  readonly claimType: "language" | "practical_skill";
  readonly nameSv: string;
  readonly nameEn: string;
  /** Presentation only: whether the field reads as a proficiency or a
   *  category. The permitted VALUES are `allowedLevels`. */
  readonly levelScale: string;
  /** The scale's content, straight from the vocabulary. Empty means the
   *  capability has no level and recording one is refused. */
  readonly allowedLevels: readonly string[];
  readonly requiresJurisdiction: boolean;
  readonly requiresValidUntil: boolean;
}

/** The vocabulary the forms render. Read with the caller's own client: the
 *  table is SELECT-only for `authenticated` and carries no personal data. */
export const listSkillTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly SkillType[]> => {
    const { data, error } = await context.supabase
      .from("sp_skill_types")
      .select(
        "code, claim_type, name_sv, name_en, level_scale, requires_jurisdiction, requires_valid_until",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    return (
      (data ?? []) as Array<{
        code: string;
        claim_type: string;
        name_sv: string;
        name_en: string;
        level_scale: string;
        allowed_levels: string[] | null;
        requires_jurisdiction: boolean;
        requires_valid_until: boolean;
      }>
    ).map((r) => ({
      code: r.code,
      claimType: r.claim_type as SkillType["claimType"],
      nameSv: r.name_sv,
      nameEn: r.name_en,
      levelScale: r.level_scale,
      allowedLevels: r.allowed_levels ?? [],
      requiresJurisdiction: r.requires_jurisdiction,
      requiresValidUntil: r.requires_valid_until,
    }));
  });

const skillInput = z
  .object({
    id: z.string().uuid().nullable().optional(),
    claimType: z.enum(["language", "practical_skill"]),
    skillCode: z.string().min(2).max(32),
    /** Null only where the type declares the `none` scale. The database is
     *  the authority on that; this is a shape check, not the rule. */
    skillLevel: z.string().max(16).nullable(),
    jurisdictionCode: z.string().length(2).nullable(),
    validUntil: z.string().regex(ISO_DATE).nullable(),
    holderNote: z.string().max(2000).nullable(),
  })
  .strict();

export const saveSkillEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => skillInput.parse(data))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { supabase, userId } = context;

    // The title is derived from the vocabulary rather than accepted from the
    // browser. It is what a reader sees, so letting the client supply it would
    // reintroduce the free-text badge the controlled model exists to prevent.
    const { data: typeRow, error: typeError } = await supabase
      .from("sp_skill_types")
      .select("code, claim_type, name_sv")
      .eq("code", data.skillCode)
      .eq("is_active", true)
      .maybeSingle();
    if (typeError) throw new Error(typeError.message);
    if (!typeRow) throw new Error("SP_SKILL_CODE_UNKNOWN");
    if ((typeRow as { claim_type: string }).claim_type !== data.claimType) {
      throw new Error("SP_SKILL_CLAIM_TYPE_MISMATCH");
    }
    const title = (typeRow as { name_sv: string }).name_sv;

    if (data.id) {
      const patch: TablesUpdate<"sp_claims"> = {
        skill_level: data.skillLevel,
        jurisdiction_code: data.jurisdictionCode,
        valid_until: data.validUntil,
        holder_note: data.holderNote,
      };
      const { error } = await supabase
        .from("sp_claims")
        .update(patch)
        .eq("id", data.id)
        .eq("holder_user_id", userId)
        .eq("assertion_level", "self_declared")
        .eq("lifecycle_state", "active");
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const insert: TablesInsert<"sp_claims"> = {
      holder_user_id: userId,
      claim_type: data.claimType,
      skill_code: data.skillCode,
      skill_level: data.skillLevel,
      title,
      jurisdiction_code: data.jurisdictionCode,
      valid_until: data.validUntil,
      holder_note: data.holderNote,
    };
    const { data: row, error } = await supabase
      .from("sp_claims")
      .insert(insert)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const id = (row as { id: string }).id;
    const { error: eventError } = await supabase.from("sp_passport_events").insert({
      holder_user_id: userId,
      actor_user_id: userId,
      event_type: "claim_created",
      subject_type: "claim",
      subject_id: id,
      detail: { skill_code: data.skillCode, skill_level: data.skillLevel },
    });
    if (eventError) throw new Error(eventError.message);

    return { id };
  });

/* ------------------------------------------------------------------ */
/* Free-text claims                                                    */
/* ------------------------------------------------------------------ */

const claimInput = z
  .object({
    id: z.string().uuid().nullable().optional(),
    claimType: z.enum(FREE_CLAIM_KINDS),
    title: z.string().min(1).max(200),
    issuerName: z.string().max(160).nullable(),
    jurisdictionCode: z.string().length(2).nullable(),
    issuedOn: z.string().regex(ISO_DATE).nullable(),
    validUntil: z.string().regex(ISO_DATE).nullable(),
  })
  .refine((v) => v.validUntil === null || v.issuedOn === null || v.validUntil >= v.issuedOn, {
    message: "SP_CLAIM_END_BEFORE_START",
    path: ["validUntil"],
  });

export const saveClaimEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => claimInput.parse(data))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { supabase, userId } = context;

    if (data.id) {
      const patch: TablesUpdate<"sp_claims"> = {
        claim_type: data.claimType,
        title: data.title,
        claimed_issuer_name: data.issuerName,
        jurisdiction_code: data.jurisdictionCode,
        issued_on: data.issuedOn,
        valid_from: data.issuedOn,
        valid_until: data.validUntil,
      };
      const { error } = await supabase
        .from("sp_claims")
        .update(patch)
        .eq("id", data.id)
        .eq("holder_user_id", userId)
        .eq("assertion_level", "self_declared")
        .eq("lifecycle_state", "active");
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    // `credential_code` is deliberately never set here. A free-text claim is
    // not one of the four supported credentials, and letting this path assign
    // a code would put a VU1 symbol on something no taxonomy rule checked.
    const insert: TablesInsert<"sp_claims"> = {
      holder_user_id: userId,
      claim_type: data.claimType,
      title: data.title,
      claimed_issuer_name: data.issuerName,
      jurisdiction_code: data.jurisdictionCode,
      issued_on: data.issuedOn,
      valid_from: data.issuedOn,
      valid_until: data.validUntil,
    };
    const { data: row, error } = await supabase
      .from("sp_claims")
      .insert(insert)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const id = (row as { id: string }).id;
    await supabase.from("sp_passport_events").insert({
      holder_user_id: userId,
      actor_user_id: userId,
      event_type: "claim_created",
      subject_type: "claim",
      subject_id: id,
      detail: { claim_type: data.claimType, title: data.title },
    });
    return { id };
  });

/* ------------------------------------------------------------------ */
/* Removal                                                             */
/* ------------------------------------------------------------------ */

export const removeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ kind: z.enum(["claim", "experience"]), id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ context, data }): Promise<{ removed: boolean }> => {
    const { supabase, userId } = context;

    // Read first, so the decision to refuse is made on the row's real state
    // rather than inferred from an update that affected nothing.
    const table = data.kind === "claim" ? "sp_claims" : "sp_experience_periods";
    const { data: current, error: readError } = await supabase
      .from(table)
      .select("assertion_level, lifecycle_state")
      .eq("id", data.id)
      .eq("holder_user_id", userId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const row = current as { assertion_level: string; lifecycle_state: string } | null;
    if (!row || row.assertion_level !== "self_declared" || row.lifecycle_state !== "active") {
      return { removed: false };
    }

    if (data.kind === "claim") {
      // The existing RPC: it marks the claim withdrawn and appends the event
      // in one transaction, with its own ownership check.
      const { error } = await supabase.rpc("sp_withdraw_claim", {
        _claim_id: data.id,
        _reason: "removed_while_self_declared",
      });
      if (error) throw new Error(error.message);
      return { removed: true };
    }

    // Periods have no withdraw RPC; the UPDATE is holder-scoped by RLS and
    // touches only the lifecycle, never the assertion level.
    const patch: TablesUpdate<"sp_experience_periods"> = { lifecycle_state: "withdrawn" };
    const { error } = await supabase
      .from("sp_experience_periods")
      .update(patch)
      .eq("id", data.id)
      .eq("holder_user_id", userId)
      .eq("assertion_level", "self_declared")
      .eq("lifecycle_state", "active");
    if (error) throw new Error(error.message);

    await supabase.from("sp_passport_events").insert({
      holder_user_id: userId,
      actor_user_id: userId,
      event_type: "experience_withdrawn",
      subject_type: "experience",
      subject_id: data.id,
      detail: { removed_while_self_declared: true },
    });
    return { removed: true };
  });
