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

import { CREDENTIAL_CODE_MAX_LENGTH } from "./credentials";
import { createServerFn } from "@tanstack/react-start";
import { derivePreviewIdentity } from "./identity/visibility";
import type { TitleRule } from "./identity/types";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { orNull } from "./rpc";
import type { Claim, ClaimType, ExperiencePeriod, PassportHolder } from "./types";

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
  credential_code: string | null;
  skill_code: string | null;
  skill_level: string | null;
  title: string;
  claimed_issuer_name: string | null;
  jurisdiction_code: string | null;
  sub_jurisdiction_code: string | null;
  authorisation_scope: string | null;
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

type TitleRuleRow = {
  code: string;
  market_pack_code: string;
  profession_family_code: string | null;
  output_kind: string;
  name_local: string;
  name_en: string;
  name_ar: string | null;
  requires_credential_codes: string[] | null;
  requires_assertion_level: string;
  requires_current_validity: boolean;
  priority: number;
  sp_regulated_roles: { code: string } | null;
};

function toTitleRules(rows: unknown): readonly TitleRule[] {
  return (rows as TitleRuleRow[]).map((r) => ({
    code: r.code,
    marketPackCode: r.market_pack_code,
    professionFamilyCode: r.profession_family_code,
    regulatedRoleCode: r.sp_regulated_roles?.code ?? null,
    outputKind: r.output_kind as TitleRule["outputKind"],
    nameLocal: r.name_local,
    nameEn: r.name_en,
    nameAr: r.name_ar,
    requiresCredentialCodes: r.requires_credential_codes ?? [],
    requiresAssertionLevel: r.requires_assertion_level as Claim["assertionLevel"],
    requiresCurrentValidity: r.requires_current_validity,
    priority: r.priority,
  }));
}

/** The evaluation date, as a plain ISO day.
 *
 *  Derivation is a function of the calendar, so it needs one — and it needs
 *  the SAME one for every title in a single read, or a Passport rendered
 *  across midnight could show an appointment as both current and lapsed. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toClaim(row: ClaimRow): Claim {
  // The prototype carried bilingual titles because its content was authored.
  // A holder types one title, in their own words; showing it unchanged in
  // both languages is more honest than machine-translating a credential name.
  const title = row.title;
  return {
    id: row.id,
    claimType: row.claim_type as ClaimType,
    credentialCode: row.credential_code,
    skillCode: row.skill_code,
    skillLevel: row.skill_level,
    titleSv: title,
    titleEn: title,
    issuerName: row.claimed_issuer_name ?? "—",
    jurisdictionCode: row.jurisdiction_code,
    subJurisdictionCode: row.sub_jurisdiction_code,
    authorisationScope: row.authorisation_scope,
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
    const db = supabase;

    const [profileRes, periodsRes, claimsRes, eventsRes, rulesRes] = await Promise.all([
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
          "id, claim_type, credential_code, skill_code, skill_level, title, claimed_issuer_name, jurisdiction_code, sub_jurisdiction_code, authorisation_scope, issued_on, valid_from, valid_until, assertion_level, lifecycle_state, version_no, supersedes_id",
        )
        .eq("holder_user_id", userId)
        .order("created_at", { ascending: false }),
      db
        .from("sp_passport_events")
        .select("id", { count: "exact", head: true })
        .eq("holder_user_id", userId),
      // The derivation rules. Fetched with everything else rather than in a
      // second round trip: the Passport cannot be rendered without them, so
      // making them a follow-up query would only add a serial hop.
      db
        .from("sp_professional_titles")
        .select(
          "code, market_pack_code, profession_family_code, output_kind, name_local, name_en, name_ar, requires_credential_codes, requires_assertion_level, requires_current_validity, priority, sp_regulated_roles(code)",
        )
        .eq("is_active", true)
        .order("priority", { ascending: true }),
    ]);

    if (profileRes.error) throw new Error(profileRes.error.message);

    const profile = toProfile((profileRes.data as ProfileRow | null) ?? null);
    const periods = ((periodsRes.data ?? []) as PeriodRow[]).map(toPeriod);
    // Superseded and withdrawn entries stay in the database as history but
    // are not part of the current Passport view.
    const claims = ((claimsRes.data ?? []) as ClaimRow[])
      .filter((r) => r.lifecycle_state !== "superseded" && r.lifecycle_state !== "withdrawn")
      .map(toClaim);

    // A Passport with no derivation rules would silently show every holder as
    // having no professional identity at all, which is indistinguishable from
    // the truth for a new holder. Failing loudly is the only honest response:
    // the rules are seeded by migration and their absence is a broken
    // deployment, not an empty Passport.
    if (rulesRes.error) throw new Error(rulesRes.error.message);
    const rules = toTitleRules(rulesRes.data ?? []);

    const holder: PassportHolder = {
      id: userId,
      displayName: profile?.displayName ?? "",
      professionSlug: profile?.cigProfessionSlug ?? null,
      // Derived from this holder's own claims, against the rules in
      // sp_professional_titles.
      //
      // These two lines used to read:
      //
      //     professionTitleSv: "Väktare",
      //     professionTitleEn: "Security Officer (Väktare)",
      //
      // for EVERY holder who had ever signed in — somebody with one
      // self-declared VU1, somebody with an empty Passport, and somebody
      // holding a current ordningsvaktsförordnande were all labelled the same
      // thing, and six surfaces printed it. It was a placeholder from the
      // single-vertical phase that outlived its phase.
      //
      // The preview derivation is used because this is the HOLDER'S OWN view:
      // a title their evidence would support once verified is worth showing
      // them, and every such title carries `selfDeclared: true` so the surface
      // must label it. Nothing that leaves the product uses this value —
      // buildPassportCard, buildDisclosurePayload and buildSocialCard each
      // strip self-declared titles on the way out.
      identity: derivePreviewIdentity(claims, rules, todayIso()),
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
    const db = supabase;

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
    const db = supabase;

    // Typed against the generated Update shape rather than
    // Record<string, unknown>. That is not cosmetic: the loose record let a
    // misspelled column compile, and PostgREST would have accepted the write
    // and silently ignored the field. Every key here is now checked.
    //
    // `assertion_level`, `lifecycle_state`, `verified_by_user_id` and
    // `verified_at` are absent, as everywhere else in this file. There is no
    // branch that could add one.
    type ProfileUpdate = Database["public"]["Tables"]["sp_passport_profiles"]["Update"];

    const patch: ProfileUpdate = {
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
/**
 * Closes onboarding, and — new in Phase 8 — turns the current-role answers
 * into a real employment period.
 *
 * Until Phase 8 every onboarding answer went into `onboarding_answers` and
 * stopped there, so a holder who told us where they work still had an empty
 * Passport. The wizard asks for employer, role and start date; those three
 * are exactly an `sp_experience_periods` row, and this is where the answer
 * becomes the record.
 *
 * It is deliberately idempotent-ish: the insert is skipped when the holder
 * already has any period, so completing onboarding twice — or completing it
 * after adding employment on /passport/information — cannot duplicate a job.
 * The period is written with no assertion or lifecycle argument, so it takes
 * the `self_declared` / `active` column defaults like every other holder
 * write.
 */
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ completedAt: string; createdPeriod: boolean }> => {
    const { supabase, userId } = context;
    const db = supabase;
    const now = new Date().toISOString();

    const profileRes = await db
      .from("sp_passport_profiles")
      .select("onboarding_answers, jurisdiction_code")
      .eq("holder_user_id", userId)
      .maybeSingle();

    const answers = ((profileRes.data as { onboarding_answers: Record<string, string> } | null)
      ?.onboarding_answers ?? {}) as Record<string, string>;
    const jurisdiction =
      (profileRes.data as { jurisdiction_code?: string } | null)?.jurisdiction_code ?? "SE";

    const employer = (answers["currentRole.employer"] ?? "").trim();
    const role = (answers["currentRole.role"] ?? "").trim();
    const startedOn = (answers["currentRole.startedOn"] ?? "").trim();

    let createdPeriod = false;
    if (employer && role && /^\d{4}-\d{2}-\d{2}$/.test(startedOn)) {
      const existing = await db
        .from("sp_experience_periods")
        .select("id")
        .eq("holder_user_id", userId)
        .limit(1);
      if ((existing.data ?? []).length === 0) {
        const { error: periodError } = await db.from("sp_experience_periods").insert({
          holder_user_id: userId,
          employer_name: employer,
          role_title: role,
          jurisdiction_code: jurisdiction,
          started_on: startedOn,
          ended_on: null,
        });
        if (periodError) throw new Error(periodError.message);
        createdPeriod = true;
      }
    }

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

    return { completedAt: now, createdPeriod };
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
    const db = supabase;

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
    const db = supabase;

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
  /** Phase 11. Material like every other replacement field: B1 and C2 are
   *  different assertions about the same person, so correcting the level
   *  resets a verification that was made against the old one. Null for every
   *  claim that is not a language or a practical skill. */
  /** Correctable, and material: picking the wrong row from a long list is an
   *  ordinary mistake, and a holder must not be stuck with it. The database
   *  refuses a code whose claim_type does not match, so a language cannot be
   *  corrected into a licence. */
  skillCode: z.string().max(32).nullable(),
  skillLevel: z.string().max(16).nullable(),
  /** Phase 6 fields. Required rather than optional on purpose: the RPC treats
   *  every parameter as a full replacement, so an omitted credential code
   *  would blank it. The correction form is pre-filled with the current
   *  values, so "unchanged" arrives as the same value rather than as absence. */
  credentialCode: z.string().max(CREDENTIAL_CODE_MAX_LENGTH).nullable(),
  credentialReference: z.string().max(120).nullable(),
  holderNote: z.string().max(2000).nullable(),
  /** Both added because omitting them made a legacy claim permanently
   *  uncorrectable.
   *
   *  `sp_correct_claim` coalesces an omitted value with the superseded row's,
   *  which carries forward correctly for a row that HAS one. A Skyddsvakt
   *  approval created before `authorisation_scope` existed has none — and `SV`
   *  is `requires_scope`, so coalescing NULL with NULL produced an INSERT the
   *  write guard refused. The holder could read and withdraw that claim but
   *  never correct it, and correcting it is the only way to supply the scope
   *  the rule now demands. Reproduced against the real RPC as the real
   *  authenticated holder; one such row exists in production today.
   *
   *  Nullable, and coalesced by the RPC, so a correction that does not mention
   *  either one still carries the stored value forward. */
  subJurisdictionCode: z.string().max(8).nullable(),
  authorisationScope: z.string().max(200).nullable(),
});

/** Correction goes through the database RPC rather than two client writes,
 *  so the new version, the supersession and the event are one transaction
 *  with one author.
 *
 *  The RPC decides what happens to trust: a correction that changes what is
 *  being asserted resets the claim to self_declared and drops the verifier
 *  attribution, so a verified credential cannot be edited into a different
 *  one while keeping its seal. Nothing here can influence that. */
export const correctClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => correctionInput.parse(data))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { supabase } = context;
    const db = supabase;
    const { data: newId, error } = await db.rpc("sp_correct_claim", {
      _claim_id: data.claimId,
      _title: data.title,
      _claimed_issuer_name: orNull(data.claimedIssuerName),
      _jurisdiction_code: orNull(data.jurisdictionCode),
      _issued_on: orNull(data.issuedOn),
      _valid_from: orNull(data.issuedOn),
      _valid_until: orNull(data.validUntil),
      _reason: data.reason,
      _credential_code: orNull(data.credentialCode),
      _credential_reference: orNull(data.credentialReference),
      _holder_note: orNull(data.holderNote),
      _skill_code: orNull(data.skillCode),
      _skill_level: orNull(data.skillLevel),
      _sub_jurisdiction_code: orNull(data.subJurisdictionCode),
      _authorisation_scope: orNull(data.authorisationScope),
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
    const db = supabase;
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
    const db = supabase;
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

/* ------------------------------------------------------------------ */
/* What the candidate is about to include with an application          */
/* ------------------------------------------------------------------ */
//
// The apply form has to say what the employer will receive BEFORE the
// candidate authorises it. "Ta med mitt verifierade Security Passport" with
// no idea what is in it is not an informed choice.
//
// It lives here rather than in application-disclosure.functions.ts because it
// is a read of the holder's OWN Passport, not a disclosure operation: that
// module may call only the three holder-scoped disclosure RPCs and may never
// touch a table, and scripts/passport-separation-check.ts enforces both.
//
// It reads with the holder's OWN client, so RLS is the boundary and no
// privileged path is involved. It deliberately returns counts and credential
// titles only — never issuers, dates, reference numbers or anything the
// employer_review package would not carry — because it renders on a page that
// is not yet a disclosure.

/** Whether this holder has anything an application disclosure could carry,
 *  and a short, safe description of it. */
export interface ApplicationPassportOffer {
  /** False when the holder has no Passport profile at all. */
  readonly hasPassport: boolean;
  /** True when at least one verified, active claim or period exists — the
   *  same condition sp_submit_application_with_passport checks before it
   *  creates anything, so the form cannot promise what the database refuses. */
  readonly hasShareableContent: boolean;
  /** Verified, active credential titles. Names only. */
  readonly verifiedCredentials: readonly string[];
  readonly verifiedCredentialCount: number;
  readonly verifiedExperienceCount: number;
}

export const getApplicationPassportOffer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApplicationPassportOffer> => {
    const { supabase, userId } = context;

    const [profileRes, claimRes, expRes] = await Promise.all([
      supabase
        .from("sp_passport_profiles")
        .select("holder_user_id")
        .eq("holder_user_id", userId)
        .maybeSingle(),
      supabase
        .from("sp_claims")
        .select("title")
        .eq("holder_user_id", userId)
        .eq("assertion_level", "verified")
        .eq("lifecycle_state", "active"),
      supabase
        .from("sp_experience_periods")
        .select("id", { count: "exact", head: true })
        .eq("holder_user_id", userId)
        .eq("assertion_level", "verified")
        .eq("lifecycle_state", "active"),
    ]);

    // A failure to read the holder's own Passport must not block applying.
    // The form falls back to "nothing to include", the submission proceeds
    // without a disclosure, and the copy stays true.
    if (profileRes.error || claimRes.error || expRes.error) {
      console.error("[passport] application offer read failed", {
        profile: profileRes.error?.message,
        claims: claimRes.error?.message,
        experience: expRes.error?.message,
      });
      return {
        hasPassport: false,
        hasShareableContent: false,
        verifiedCredentials: [],
        verifiedCredentialCount: 0,
        verifiedExperienceCount: 0,
      };
    }

    const titles = ((claimRes.data ?? []) as { title: string }[]).map((r) => r.title);
    const experienceCount = expRes.count ?? 0;

    return {
      hasPassport: profileRes.data !== null,
      hasShareableContent: titles.length > 0 || experienceCount > 0,
      verifiedCredentials: titles,
      verifiedCredentialCount: titles.length,
      verifiedExperienceCount: experienceCount,
    };
  });
