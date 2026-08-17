// Security Passport — Phase 2 server functions.
//
// Owner-scoped CRUD over the `sp_*` domain, following the shape of
// src/lib/security-career-profile/profile.functions.ts. RLS already scopes
// every query to the caller; these functions add no trust boundary beyond
// `requireSupabaseAuth`, and they deliberately do not use the service-role
// client — a Passport read should fail closed if the session is wrong,
// not succeed because the server had a master key.
//
// ── WHY ROWS ARE MAPPED INTO THE PHASE 1 DOMAIN SHAPES ─────────────────
//
// `toPeriod` / `toClaim` convert database rows into exactly the
// `ExperiencePeriod` and `Claim` types the fixture prototype used. That is
// not ceremony: it means the interval-union calculation, the recognition
// ladder and the Passport Card model — all of which were reviewed and are
// covered by scripts/passport-fixture-check.ts — operate on live data
// unchanged, rather than being reimplemented against a second shape where
// they could quietly disagree.
//
// ── WHAT THIS FILE CANNOT DO ───────────────────────────────────────────
//
// Nothing here writes `assertion_level`, `lifecycle_state`,
// `verified_by_user_id` or `verified_at`. Inserts omit them entirely and
// take the column defaults, so Phase 2 has no expression anywhere in the
// codebase that could produce a verified claim. The database refuses it
// regardless (see the Phase 2 migration's trigger and CHECK constraints);
// this is the same rule stated where the writes happen.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Claim, ClaimType, ExperiencePeriod, PassportHolder } from "./types";
import { spDb } from "./sp-database.server";

/** The question set these answers were given against. Bumped when the
 *  authored wording changes, so a stored answer always means what the
 *  question asked at the time. */
export const PASSPORT_QUESTION_VERSION = "sp-q-v1";

export type OnboardingState = "not_started" | "in_progress" | "completed";
export type PrivacyMode = "full_name" | "initials" | "anonymous";

export interface PassportProfile {
  readonly displayName: string | null;
  readonly headline: string | null;
  readonly cigProfessionSlug: string | null;
  readonly jurisdictionCode: string;
  readonly privacyMode: PrivacyMode;
  readonly onboardingState: OnboardingState;
  readonly onboardingStep: number;
  readonly onboardingAnswers: Readonly<Record<string, string>>;
  readonly questionVersion: string;
  readonly declaredAccurateAt: string | null;
  readonly recognitionPolicyVersion: string;
  readonly updatedAt: string;
}

export interface PassportSnapshot {
  readonly profile: PassportProfile | null;
  readonly holder: PassportHolder;
  readonly eventCount: number;
}

/* ------------------------------------------------------------------ */
/* Row mapping                                                         */
/* ------------------------------------------------------------------ */

type ProfileRow = {
  display_name: string | null;
  headline: string | null;
  cig_profession_slug: string | null;
  jurisdiction_code: string;
  privacy_mode: string;
  onboarding_state: string;
  onboarding_step: number;
  onboarding_answers: Record<string, string> | null;
  question_version: string;
  declared_accurate_at: string | null;
  recognition_policy_version: string;
  updated_at: string;
};

type PeriodRow = {
  id: string;
  employer_name: string;
  role_title: string;
  cig_profession_slug: string | null;
  jurisdiction_code: string;
  employment_type: string;
  fte_fraction: string | number;
  security_relevance: string;
  security_fraction: string | number;
  started_on: string;
  ended_on: string | null;
  assertion_level: string;
  lifecycle_state: string;
};

type ClaimRow = {
  id: string;
  claim_type: string;
  title: string;
  claimed_issuer_name: string | null;
  jurisdiction_code: string | null;
  issued_on: string | null;
  valid_from: string | null;
  valid_until: string | null;
  assertion_level: string;
  lifecycle_state: string;
  version_no: number;
  supersedes_id: string | null;
};

function toProfile(row: ProfileRow | null): PassportProfile | null {
  if (!row) return null;
  return {
    displayName: row.display_name,
    headline: row.headline,
    cigProfessionSlug: row.cig_profession_slug,
    jurisdictionCode: row.jurisdiction_code,
    privacyMode: row.privacy_mode as PrivacyMode,
    onboardingState: row.onboarding_state as OnboardingState,
    onboardingStep: row.onboarding_step,
    onboardingAnswers: row.onboarding_answers ?? {},
    questionVersion: row.question_version,
    declaredAccurateAt: row.declared_accurate_at,
    recognitionPolicyVersion: row.recognition_policy_version,
    updatedAt: row.updated_at,
  };
}

function toPeriod(row: PeriodRow): ExperiencePeriod {
  return {
    id: row.id,
    employerName: row.employer_name,
    roleTitle: row.role_title,
    professionSlug: row.cig_profession_slug,
    jurisdictionCode: row.jurisdiction_code,
    employmentType: row.employment_type as ExperiencePeriod["employmentType"],
    fteFraction: Number(row.fte_fraction),
    securityRelevance: row.security_relevance as ExperiencePeriod["securityRelevance"],
    securityFraction: Number(row.security_fraction),
    startedOn: row.started_on,
    endedOn: row.ended_on,
    assertionLevel: row.assertion_level as ExperiencePeriod["assertionLevel"],
    lifecycleState: row.lifecycle_state as ExperiencePeriod["lifecycleState"],
    // Phase 2 never verifies, so there is never a verifier to name. Left
    // null rather than borrowing the employer name, which would read as an
    // attestation nobody made.
    verifierName: null,
  };
}

function toClaim(row: ClaimRow): Claim {
  // The prototype carried bilingual titles because its content was authored.
  // A holder types one title, in their own words; showing it unchanged in
  // both languages is more honest than machine-translating a credential name.
  const title = row.title;
  return {
    id: row.id,
    claimType: row.claim_type as ClaimType,
    titleSv: title,
    titleEn: title,
    issuerName: row.claimed_issuer_name ?? "—",
    jurisdictionCode: row.jurisdiction_code,
    issuedOn: row.issued_on,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    assertionLevel: row.assertion_level as Claim["assertionLevel"],
    lifecycleState: row.lifecycle_state as Claim["lifecycleState"],
    verifierName: null,
    limitationSv: null,
    limitationEn: null,
    versionNo: row.version_no,
    supersedesClaimId: row.supersedes_id,
  };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export const getMyPassport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PassportSnapshot> => {
    const { supabase, userId } = context;
    const db = spDb(supabase);

    const [profileRes, periodsRes, claimsRes, eventsRes] = await Promise.all([
      db
        .from("sp_passport_profiles")
        .select(
          "display_name, headline, cig_profession_slug, jurisdiction_code, privacy_mode, onboarding_state, onboarding_step, onboarding_answers, question_version, declared_accurate_at, recognition_policy_version, updated_at",
        )
        .eq("holder_user_id", userId)
        .maybeSingle(),
      db
        .from("sp_experience_periods")
        .select(
          "id, employer_name, role_title, cig_profession_slug, jurisdiction_code, employment_type, fte_fraction, security_relevance, security_fraction, started_on, ended_on, assertion_level, lifecycle_state",
        )
        .eq("holder_user_id", userId)
        .order("started_on", { ascending: false }),
      db
        .from("sp_claims")
        .select(
          "id, claim_type, title, claimed_issuer_name, jurisdiction_code, issued_on, valid_from, valid_until, assertion_level, lifecycle_state, version_no, supersedes_id",
        )
        .eq("holder_user_id", userId)
        .order("created_at", { ascending: false }),
      db
        .from("sp_passport_events")
        .select("id", { count: "exact", head: true })
        .eq("holder_user_id", userId),
    ]);

    if (profileRes.error) throw new Error(profileRes.error.message);

    const profile = toProfile((profileRes.data as ProfileRow | null) ?? null);
    const periods = ((periodsRes.data ?? []) as PeriodRow[]).map(toPeriod);
    // Superseded and withdrawn entries stay in the database as history but
    // are not part of the current Passport view.
    const claims = ((claimsRes.data ?? []) as ClaimRow[])
      .filter((r) => r.lifecycle_state !== "superseded" && r.lifecycle_state !== "withdrawn")
      .map(toClaim);

    const holder: PassportHolder = {
      id: userId,
      displayName: profile?.displayName ?? "",
      professionSlug: profile?.cigProfessionSlug ?? null,
      // Phase 2 ships one vertical. The labels are resolved in the UI from
      // the Passport copy module rather than stored per row.
      professionTitleSv: "Väktare",
      professionTitleEn: "Security Officer (Väktare)",
      jurisdictionCode: profile?.jurisdictionCode ?? "SE",
      periods: periods.filter((p) => p.lifecycleState !== "superseded"),
      claims,
      // Career Discovery is a separate product. Phase 2 stores no reference
      // to it and does not look for one.
      hasCareerDiscoveryResult: false,
    };

    return { profile, holder, eventCount: eventsRes.count ?? 0 };
  });

/* ------------------------------------------------------------------ */
/* Writes                                                             */
/* ------------------------------------------------------------------ */

/** Creates the Passport if the holder does not have one. Idempotent. */
export const ensureMyPassport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ created: boolean }> => {
    const { supabase, userId } = context;
    const db = spDb(supabase);

    const existing = await db
      .from("sp_passport_profiles")
      .select("holder_user_id")
      .eq("holder_user_id", userId)
      .maybeSingle();
    if (existing.data) return { created: false };

    const { error } = await db.from("sp_passport_profiles").insert({
      holder_user_id: userId,
      question_version: PASSPORT_QUESTION_VERSION,
    });
    if (error) throw new Error(error.message);

    await db.from("sp_passport_events").insert({
      holder_user_id: userId,
      actor_user_id: userId,
      event_type: "passport_created",
      subject_type: "profile",
      detail: { question_version: PASSPORT_QUESTION_VERSION },
    });

    return { created: true };
  });

const onboardingInput = z.object({
  step: z.number().int().min(0).max(50),
  answers: z.record(z.string(), z.string().max(400)),
  displayName: z.string().max(120).nullable().optional(),
  headline: z.string().max(200).nullable().optional(),
  professionSlug: z.string().max(80).nullable().optional(),
  jurisdictionCode: z.string().length(2).optional(),
});

/** Autosave. Called on every answer; writes the whole step state, so a
 *  resumed session lands exactly where the holder left off. */
export const saveOnboardingProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => onboardingInput.parse(data))
  .handler(async ({ context, data }): Promise<{ savedAt: string }> => {
    const { supabase, userId } = context;
    const db = spDb(supabase);

    const patch: Record<string, unknown> = {
      onboarding_step: data.step,
      onboarding_answers: data.answers,
      onboarding_state: "in_progress",
      question_version: PASSPORT_QUESTION_VERSION,
    };
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.headline !== undefined) patch.headline = data.headline;
    if (data.professionSlug !== undefined) patch.cig_profession_slug = data.professionSlug;
    if (data.jurisdictionCode !== undefined) patch.jurisdiction_code = data.jurisdictionCode;

    const { data: row, error } = await db
      .from("sp_passport_profiles")
      .update(patch)
      .eq("holder_user_id", userId)
      .select("updated_at")
      .single();
    if (error) throw new Error(error.message);

    return { savedAt: (row as { updated_at: string }).updated_at };
  });

/** Records the truthfulness declaration and closes onboarding. The database
 *  refuses a completed profile with no declaration, so the two cannot drift. */
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ completedAt: string }> => {
    const { supabase, userId } = context;
    const db = spDb(supabase);
    const now = new Date().toISOString();

    const { error } = await db
      .from("sp_passport_profiles")
      .update({ onboarding_state: "completed", declared_accurate_at: now })
      .eq("holder_user_id", userId);
    if (error) throw new Error(error.message);

    await db.from("sp_passport_events").insert([
      {
        holder_user_id: userId,
        actor_user_id: userId,
        event_type: "declaration_recorded",
        subject_type: "profile",
        detail: { declared_at: now, question_version: PASSPORT_QUESTION_VERSION },
      },
      {
        holder_user_id: userId,
        actor_user_id: userId,
        event_type: "onboarding_completed",
        subject_type: "profile",
        detail: {},
      },
    ]);

    return { completedAt: now };
  });

const experienceInput = z.object({
  employerName: z.string().min(1).max(160),
  roleTitle: z.string().min(1).max(160),
  professionSlug: z.string().max(80).nullable().optional(),
  jurisdictionCode: z.string().length(2).default("SE"),
  employmentType: z.enum(["full_time", "part_time", "hourly", "temporary"]),
  fteFraction: z.number().min(0.01).max(1),
  securityRelevance: z.enum(["primary", "partial", "none"]),
  securityFraction: z.number().min(0).max(1),
  startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export const addExperiencePeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => experienceInput.parse(data))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    const db = spDb(supabase);

    // assertion_level and lifecycle_state are deliberately absent: they take
    // their column defaults (self_declared / active). There is no parameter
    // for either, so no caller can supply one.
    const { data: row, error } = await db
      .from("sp_experience_periods")
      .insert({
        holder_user_id: userId,
        employer_name: data.employerName,
        role_title: data.roleTitle,
        cig_profession_slug: data.professionSlug ?? null,
        jurisdiction_code: data.jurisdictionCode,
        employment_type: data.employmentType,
        fte_fraction: data.fteFraction,
        security_relevance: data.securityRelevance,
        security_fraction: data.securityRelevance === "primary" ? 1 : data.securityFraction,
        started_on: data.startedOn,
        ended_on: data.endedOn,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const id = (row as { id: string }).id;
    await db.from("sp_passport_events").insert({
      holder_user_id: userId,
      actor_user_id: userId,
      event_type: "experience_created",
      subject_type: "experience",
      subject_id: id,
      detail: { employer_name: data.employerName, role_title: data.roleTitle },
    });

    return { id };
  });

const claimInput = z.object({
  claimType: z.enum([
    "training",
    "certification",
    "licence",
    "education",
    "professional_membership",
    "specialisation",
  ]),
  title: z.string().min(1).max(200),
  claimedIssuerName: z.string().max(160).nullable(),
  jurisdictionCode: z.string().length(2).nullable(),
  issuedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export const addClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => claimInput.parse(data))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    const db = spDb(supabase);

    const { data: row, error } = await db
      .from("sp_claims")
      .insert({
        holder_user_id: userId,
        claim_type: data.claimType,
        title: data.title,
        claimed_issuer_name: data.claimedIssuerName,
        jurisdiction_code: data.jurisdictionCode,
        issued_on: data.issuedOn,
        valid_from: data.issuedOn,
        valid_until: data.validUntil,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const id = (row as { id: string }).id;
    await db.from("sp_passport_events").insert({
      holder_user_id: userId,
      actor_user_id: userId,
      event_type: "claim_created",
      subject_type: "claim",
      subject_id: id,
      detail: { claim_type: data.claimType, title: data.title },
    });

    return { id };
  });

const correctionInput = z.object({
  claimId: z.string().uuid(),
  title: z.string().min(1).max(200),
  claimedIssuerName: z.string().max(160).nullable(),
  jurisdictionCode: z.string().length(2).nullable(),
  issuedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  reason: z.string().max(300),
});

/** Correction goes through the database RPC rather than two client writes,
 *  so the new version, the supersession and the event are one transaction
 *  with one author. */
export const correctClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => correctionInput.parse(data))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { supabase } = context;
    const db = spDb(supabase);
    const { data: newId, error } = await db.rpc("sp_correct_claim", {
      _claim_id: data.claimId,
      _title: data.title,
      _claimed_issuer_name: data.claimedIssuerName,
      _jurisdiction_code: data.jurisdictionCode,
      _issued_on: data.issuedOn,
      _valid_from: data.issuedOn,
      _valid_until: data.validUntil,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { id: newId as unknown as string };
  });

export const withdrawClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ claimId: z.string().uuid(), reason: z.string().max(300) }).parse(data),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const db = spDb(supabase);
    const { error } = await db.rpc("sp_withdraw_claim", {
      _claim_id: data.claimId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPrivacyMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ privacyMode: z.enum(["full_name", "initials", "anonymous"]) }).parse(data),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const db = spDb(supabase);
    const { error } = await db
      .from("sp_passport_profiles")
      .update({ privacy_mode: data.privacyMode })
      .eq("holder_user_id", userId);
    if (error) throw new Error(error.message);

    await db.from("sp_passport_events").insert({
      holder_user_id: userId,
      actor_user_id: userId,
      event_type: "privacy_changed",
      subject_type: "profile",
      detail: { privacy_mode: data.privacyMode },
    });
    return { ok: true };
  });
