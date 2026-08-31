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
import { isCalendarDate } from "./dates";
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { derivePreviewIdentity } from "./identity/visibility";
import type { TitleRule } from "./identity/types";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { orNull } from "./rpc";
import { confirmedWorkLocation, splitWorkCountry } from "./onboarding";
import type {
  Claim,
  ClaimType,
  ExperiencePeriod,
  PassportHolder,
  VerificationMethod,
} from "./types";

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
  /** NULL until the holder states one. Never defaulted to a country. */
  readonly jurisdictionCode: string | null;
  readonly subJurisdictionCode: string | null;
  /** When the HOLDER confirmed the two above are where they work. NULL means
   *  the stored value is unconfirmed provenance — a legacy row carrying 'SE'
   *  from the old DEFAULT, which no surface may present as current truth. */
  readonly workLocationConfirmedAt: string | null;
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
  jurisdiction_code: string | null;
  sub_jurisdiction_code: string | null;
  work_location_confirmed_at: string | null;
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
    subJurisdictionCode: row.sub_jurisdiction_code,
    workLocationConfirmedAt: row.work_location_confirmed_at,
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

/** Who verified one subject, how, and when -- resolved from the decision
 *  record and from nowhere else.
 *
 *  Keyed by claim id or period id. Absent means exactly what it says: nobody
 *  has verified this. The surfaces then print no attribution, which is the
 *  whole correction -- the alternative they used to reach for was the
 *  candidate's own issuer text. */
type Provenance = {
  readonly organisation: string | null;
  readonly method: VerificationMethod | null;
  readonly decidedOn: string | null;
};
type ProvenanceMap = ReadonlyMap<string, Provenance>;

function toPeriod(row: PeriodRow, provenance: ProvenanceMap): ExperiencePeriod {
  // Attribution is gated on the CURRENT assertion level, not on the mere
  // existence of a past approval. A verification that was later revoked is
  // real history and stays in the decision log, but printing "Confirmed by
  // Bevakning AB" beside an entry that is no longer verified would restate a
  // withdrawn conclusion as a present fact.
  const p = row.assertion_level === "verified" ? provenance.get(row.id) : undefined;
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
    // Never `row.employer_name`. The company a period NAMES and the company
    // that CONFIRMED it are different facts, and borrowing the first for the
    // second would read as an attestation nobody made.
    verifierName: p?.organisation ?? null,
    verificationMethod: p?.method ?? null,
    verifiedOn: p?.decidedOn ?? null,
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

function toClaim(row: ClaimRow, provenance: ProvenanceMap): Claim {
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
    // ── THE VERIFIER IS THE DECIDER, OR NOBODY ─────────────────────────
    //
    // This was `null`, unconditionally, on every claim the holder owns. It
    // was not merely incomplete: `buildPassportCard` computed its "Verified
    // by" line as `verifierName ?? issuerName`, so a permanently-null
    // verifier meant that heading ALWAYS resolved to `claimed_issuer_name`
    // -- a string the candidate typed. A Passport Card could print
    //
    //     Verified by
    //     BYA
    //
    // for a credential nobody had ever verified, on the one surface built
    // to be screenshotted and sent to an employer.
    //
    // Both halves are fixed: the fallback is gone, and the real answer is
    // read from `sp_verification_decisions`, which is the only record of
    // who actually decided. Gated on `verified` for the same reason as
    // periods above.
    verifierName:
      row.assertion_level === "verified" ? (provenance.get(row.id)?.organisation ?? null) : null,
    verificationMethod:
      row.assertion_level === "verified" ? (provenance.get(row.id)?.method ?? null) : null,
    verifiedOn:
      row.assertion_level === "verified" ? (provenance.get(row.id)?.decidedOn ?? null) : null,
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

    // Destructured on its own line: seven names do not fit the print width,
    // and letting the formatter wrap the call would re-indent every read
    // below it for no reason a reader benefits from.
    const reads = await Promise.all([
      db
        .from("sp_passport_profiles")
        .select(
          "display_name, headline, cig_profession_slug, jurisdiction_code, sub_jurisdiction_code, work_location_confirmed_at, privacy_mode, onboarding_state, onboarding_step, onboarding_answers, question_version, declared_accurate_at, recognition_policy_version, updated_at",
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
      // ── PROVENANCE ──────────────────────────────────────────────────
      //
      // Which subject a decision was about lives on the REQUEST; who decided
      // it, how and when lives on the DECISION. Two reads because that is
      // two tables, joined by hand below rather than through an embedded
      // select: the relationship a holder needs runs request -> subject, and
      // PostgREST embedding would name the decision's own request in a shape
      // this mapper would have to unpick anyway.
      //
      // `decision_note` is absent from both column lists, as it is from
      // every holder-facing read in this repository. Since migration
      // 20261014090000 asking for it here would also be REFUSED rather than
      // merely omitted, which is the difference between a convention and a
      // boundary.
      db
        .from("sp_verification_requests")
        .select("id, claim_id, period_id")
        .eq("holder_user_id", userId),
      db
        .from("sp_verification_decisions")
        .select("request_id, decision, decider_organisation, verification_method, decided_at")
        .eq("holder_user_id", userId)
        .order("decided_at", { ascending: true }),
    ]);
    const [profileRes, periodsRes, claimsRes, eventsRes, rulesRes, reqRes, decRes] = reads;

    // ── EVERY ESSENTIAL READ FAILS LOUDLY ──────────────────────────────
    //
    // Four of these five reads used to be treated as optional, and the two
    // that mattered most were the two that were silent. `periodsRes.error`
    // and `claimsRes.error` fell into `?? []`, and `eventsRes.count` fell
    // into `?? 0`, so a Passport whose claims query had been REFUSED — an
    // RLS change, a dropped column, an expired token mid-flight — rendered
    // as a Passport with no credentials in it.
    //
    // "You have no verified credentials" and "we could not read your
    // credentials" are different sentences said to a person about their own
    // professional standing, and the first one, said falsely, is the exact
    // failure this product exists not to commit. Every caller of this
    // function already distinguishes a rejected promise from an empty
    // snapshot — My Career renders `home.passport.unavailable`, the Passport
    // routes render their own error state — so throwing is not merely more
    // honest, it reaches copy that is already written and already correct.
    //
    // An empty ARRAY is still a perfectly good answer. A new holder has no
    // claims and no periods, and that is not an error. What can no longer
    // happen is emptiness manufactured out of a failure.
    if (profileRes.error) throw new Error(profileRes.error.message);
    if (periodsRes.error) throw new Error(periodsRes.error.message);
    if (claimsRes.error) throw new Error(claimsRes.error.message);
    // The event count drives "what has happened to your Passport" on the
    // holder's own history surface. A failed count coalescing to 0 says
    // "nothing has ever happened here", which for a holder with a verified
    // credential is false.
    if (eventsRes.error) throw new Error(eventsRes.error.message);
    // ── A FAILED PROVENANCE READ IS NOT "NOT VERIFIED" ─────────────────
    //
    // Same rule the reads above were given, for the same reason. If these
    // two are allowed to fall into empty arrays, every verified credential
    // the holder owns renders with its verifier missing -- "verified", with
    // nothing willing to say by whom. That is the unfalsifiable claim the
    // decision record exists to prevent, produced by a query failure nobody
    // was told about. The callers already distinguish a rejected promise
    // from an empty Passport.
    if (reqRes.error) throw new Error(reqRes.error.message);
    if (decRes.error) throw new Error(decRes.error.message);

    // ── SUBJECT -> WHO DECIDED IT ──────────────────────────────────────
    //
    // Decisions arrive oldest-first, so a later decision on the same subject
    // overwrites an earlier one and the map ends holding the CURRENT answer.
    // Only `approved` writes an attribution: a rejection has a decider too,
    // and naming them beside the entry would read as an endorsement of it.
    const subjectOf = new Map<string, string>();
    for (const r of (reqRes.data ?? []) as Array<{
      id: string;
      claim_id: string | null;
      period_id: string | null;
    }>) {
      const subject = r.claim_id ?? r.period_id;
      if (subject) subjectOf.set(r.id, subject);
    }

    const provenance = new Map<string, Provenance>();
    for (const d of (decRes.data ?? []) as Array<{
      request_id: string;
      decision: string;
      decider_organisation: string | null;
      verification_method: string | null;
      decided_at: string;
    }>) {
      if (d.decision !== "approved") continue;
      const subject = subjectOf.get(d.request_id);
      if (!subject) continue;
      provenance.set(subject, {
        organisation: d.decider_organisation,
        method: (d.verification_method as VerificationMethod | null) ?? null,
        decidedOn: d.decided_at.slice(0, 10),
      });
    }

    const profile = toProfile((profileRes.data as ProfileRow | null) ?? null);
    const periods = ((periodsRes.data ?? []) as PeriodRow[]).map((r) => toPeriod(r, provenance));
    // Superseded and withdrawn entries stay in the database as history but
    // are not part of the current Passport view.
    const claims = ((claimsRes.data ?? []) as ClaimRow[])
      .filter((r) => r.lifecycle_state !== "superseded" && r.lifecycle_state !== "withdrawn")
      .map((r) => toClaim(r, provenance));

    // A Passport with no derivation rules would silently show every holder as
    // having no professional identity at all, which is indistinguishable from
    // the truth for a new holder. Failing loudly is the only honest response:
    // the rules are seeded by migration and their absence is a broken
    // deployment, not an empty Passport.
    if (rulesRes.error) throw new Error(rulesRes.error.message);
    const rules = toTitleRules(rulesRes.data ?? []);

    // Provenance gate. `work_location_confirmed_at` is NULL for every row that
    // predates the country question having more than one answer, so those keep
    // their stored value without it being shown as current truth.
    const workLocation = confirmedWorkLocation(profile);

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
      // CONFIRMED work location only, decided here so all seven rendering
      // surfaces inherit it and none can form its own opinion.
      //
      // A stored country is not the same fact as a country the holder has
      // stated. Legacy rows carry 'SE' from the old `DEFAULT 'SE'`, and
      // presenting that as their current work country is the same false
      // assertion the default was making — just made once instead of
      // continuously. So an unconfirmed value is withheld from every reader,
      // including the holder's own card, and the raw value stays on `profile`
      // for the onboarding form to pre-fill and for the holder to correct.
      jurisdictionCode: workLocation.jurisdictionCode,
      subJurisdictionCode: workLocation.subJurisdictionCode,
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

/** The caller's own RLS-scoped client. There is no service-role path in this
 *  file, so the holder's row is reachable only because the holder asked. */
type HolderDb = SupabaseClient<Database>;

/** Creates the holder's profile row if it is missing, and records the
 *  creation. Returns true when it created one.
 *
 *  Extracted from `ensureMyPassport` because the profile-basics editor needs
 *  the same guarantee: an UPDATE against a row that does not exist affects
 *  nothing and reports no error, so a holder who reached "Mina uppgifter"
 *  before their Passport existed would have watched a save succeed and change
 *  nothing. Creating the row is idempotent and takes every column default,
 *  exactly as the overview's own create button does.
 */
async function ensureProfileRow(db: HolderDb, userId: string): Promise<boolean> {
  const existing = await db
    .from("sp_passport_profiles")
    .select("holder_user_id")
    .eq("holder_user_id", userId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return false;

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
  return true;
}

/** Creates the Passport if the holder does not have one. Idempotent. */
export const ensureMyPassport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ created: boolean }> => {
    const { supabase, userId } = context;
    return { created: await ensureProfileRow(supabase, userId) };
  });

const onboardingInput = z.object({
  step: z.number().int().min(0).max(50),
  answers: z.record(z.string(), z.string().max(400)),
  displayName: z.string().max(120).nullable().optional(),
  headline: z.string().max(200).nullable().optional(),
  // No `professionSlug`, for the same reason it left profileBasicsInput: the
  // canonical Professional Profile owns current profession, and a second
  // writer here is what let the two answers drift apart. The onboarding
  // ROUTE writes it through setMyCurrentProfession instead, so a holder who
  // answers the wizard's profession question fills in the canonical row —
  // one home, reached from two doors, rather than two homes.
  // The WORK COUNTRY answer, which may be a country ("SE") or a
  // sub-jurisdiction ("AE-DU"). Split by `splitWorkCountry` below into the two
  // columns the profile keeps apart; `length(2)` would have refused Dubai.
  jurisdictionCode: z.string().max(6).optional(),
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
    // One answer, three columns, split in exactly one place. An empty answer
    // clears ALL of them rather than leaving a stale emirate beside a new
    // country, or a confirmation standing over a value nobody gave.
    //
    // The timestamp is what turns a stored code into a stated fact. It is set
    // ONLY here, on a real answer from a list with real alternatives — never
    // back-filled, because a legacy 'SE' that nobody chose is exactly what it
    // exists to keep apart from a Sweden somebody did.
    if (data.jurisdictionCode !== undefined) {
      const work = splitWorkCountry(data.jurisdictionCode);
      patch.jurisdiction_code = work.jurisdictionCode;
      patch.sub_jurisdiction_code = work.subJurisdictionCode;
      patch.work_location_confirmed_at = work.jurisdictionCode ? new Date().toISOString() : null;
    }

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
      .select("onboarding_answers, jurisdiction_code, work_location_confirmed_at")
      .eq("holder_user_id", userId)
      .maybeSingle();

    const answers = ((profileRes.data as { onboarding_answers: Record<string, string> } | null)
      ?.onboarding_answers ?? {}) as Record<string, string>;
    // The country the holder STATED, with no fallback.
    //
    // This used to be `?? "SE"`, and it wrote that Sweden onto the experience
    // period created from the onboarding answers — so a holder's first job
    // record could be stamped with a country they never gave. The country step
    // is `required: true`, so the wizard cannot reach here without one; if it
    // somehow does, refusing is correct. An employment record in a country
    // nobody named is not a record, it is a guess.
    // Confirmed, not merely stored: a legacy 'SE' nobody chose must not become
    // the country on a new employment record either.
    const profileRow = profileRes.data as {
      jurisdiction_code?: string | null;
      work_location_confirmed_at?: string | null;
    } | null;
    const jurisdiction = profileRow?.work_location_confirmed_at
      ? (profileRow.jurisdiction_code ?? null)
      : null;
    if (!jurisdiction) throw new Error("SP_WORK_COUNTRY_REQUIRED");

    const employer = (answers["currentRole.employer"] ?? "").trim();
    const role = (answers["currentRole.role"] ?? "").trim();
    const startedOn = (answers["currentRole.startedOn"] ?? "").trim();

    let createdPeriod = false;
    if (employer && role && isCalendarDate(startedOn)) {
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

/**
 * Set the holder's work country, from anywhere in the Passport.
 *
 * ── WHY THIS IS NOT `saveOnboardingProgress` ───────────────────────────
 *
 * The obvious shortcut is to reuse the onboarding autosave, which already
 * writes these columns. It also writes `onboarding_step`, `onboarding_answers`
 * and `onboarding_state = 'in_progress'` — so calling it from a settings
 * screen would knock a holder who FINISHED onboarding back into the middle of
 * it, months later, because they corrected their country. A permanent control
 * needs a function that changes only what it claims to change.
 *
 * The country and the emirate are split in one place (`splitWorkCountry`) and
 * the confirmation timestamp is stamped here, because arriving at this form and
 * choosing is exactly the act `work_location_confirmed_at` records. That is
 * what lets a legacy 'SE' row — stored by the old `DEFAULT`, chosen by nobody —
 * become a stated fact without ever being guessed at.
 */
export const setWorkCountry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ workCountry: z.string().max(6) }).parse(data))
  .handler(async ({ context, data }): Promise<{ savedAt: string }> => {
    const { supabase, userId } = context;
    const work = splitWorkCountry(data.workCountry);
    if (!work.jurisdictionCode) throw new Error("SP_WORK_COUNTRY_REQUIRED");

    const now = new Date().toISOString();
    type ProfileUpdate = Database["public"]["Tables"]["sp_passport_profiles"]["Update"];
    const patch: ProfileUpdate = {
      jurisdiction_code: work.jurisdictionCode,
      sub_jurisdiction_code: work.subJurisdictionCode,
      work_location_confirmed_at: now,
    };

    const { error } = await supabase
      .from("sp_passport_profiles")
      .update(patch)
      .eq("holder_user_id", userId);
    if (error) throw new Error(error.message);

    return { savedAt: now };
  });

/** The editable half of the six profile basics.
 *
 *  Every field is optional and `undefined` means "not submitted", so a form
 *  that renders three questions cannot blank a fourth it never showed. */
const profileBasicsInput = z.object({
  displayName: z.string().max(120).nullable().optional(),
  headline: z.string().max(200).nullable().optional(),
  // `professionSlug` USED TO BE HERE, and its absence is the point.
  //
  // Current profession is one fact that had two editable homes: this
  // function, and the canonical Professional Profile in
  // security_career_profiles. Two writers, two tables, no synchronisation --
  // so a holder who corrected their profession in "Mina uppgifter" found the
  // old answer still waiting on /my-career, and neither surface could tell
  // them which one the product believed.
  //
  // The canonical profile is now the only writer, and
  // sp_passport_profiles.cig_profession_slug is a mirror the database keeps
  // in step (career_profile_mirror_profession_to_passport, 20261007090000) so the
  // disclosure package an employer receives still carries a profession.
  // Removing the field from the SCHEMA rather than merely from the UI is
  // what makes that true of an old client too: a stale tab still sending
  // professionSlug is rejected by the validator instead of quietly
  // reopening the second writer.
  /** AFFIRM-ONLY, and `z.literal(true)` is how that is enforced rather than
   *  left to the UI.
   *
   *  `sp_profile_completed_has_declaration` refuses a completed profile whose
   *  `declared_accurate_at` is NULL, so a control that could clear the
   *  declaration would either break that CHECK or require weakening it — and
   *  the constraint is doing exactly the job it was written for. A holder can
   *  re-affirm, and the date moves; nobody can un-say a declaration through
   *  this function. */
  declared: z.literal(true).optional(),
});

/**
 * The six profile basics, edited from "Mina uppgifter" at any time.
 *
 * ── WHY THIS IS NOT `saveOnboardingProgress` ───────────────────────────
 *
 * The same reason `setWorkCountry` is not. The autosave writes
 * `onboarding_step` and `onboarding_state = 'in_progress'`, so reusing it from
 * a permanent editor would knock a holder who FINISHED onboarding back into
 * the middle of it, months later, because they corrected a typo in their
 * headline. Neither column appears in the patch below and no branch adds one.
 *
 * ── WHAT IT CANNOT REACH ───────────────────────────────────────────────
 *
 * `assertion_level`, `lifecycle_state`, `verified_by_user_id` and `verified_at`
 * are absent, as everywhere else in this file — and so are `sp_claims` and
 * `sp_experience_periods` entirely. Saving something a holder said about
 * themselves must not touch a credential, an employment record or a
 * verification state, so the two basics whose answers ARE domain rows — the
 * work country and the current role — are written by `setWorkCountry` and by
 * the entries functions, and this function is structurally unable to write
 * either. Editing your headline cannot promote anything to verified, because
 * there is no statement here that could.
 */
export const savePassportBasics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => profileBasicsInput.parse(data))
  .handler(async ({ context, data }): Promise<{ savedAt: string; declaredAt: string | null }> => {
    const { supabase, userId } = context;
    const db = supabase;

    // An UPDATE against a missing row affects nothing and reports no error.
    // A holder who opened "Mina uppgifter" before their Passport existed
    // would otherwise watch a save succeed and change nothing.
    await ensureProfileRow(db, userId);

    const current = await db
      .from("sp_passport_profiles")
      .select("onboarding_answers")
      .eq("holder_user_id", userId)
      .maybeSingle();
    if (current.error) throw new Error(current.error.message);

    // ── THE WIZARD AND THE EDITOR MUST AGREE ────────────────────────
    //
    // These are one fact with two doors. A holder who is still mid-wizard
    // and also corrects their name here must not find the old name waiting
    // for them on the next step, so the same answers are mirrored back into
    // `onboarding_answers` under the wizard's own `stepId.fieldId` keys.
    // MERGED, never replaced: the current-role answers live in this column
    // too and are none of this function's business.
    const previous = ((current.data as { onboarding_answers: Record<string, string> | null } | null)
      ?.onboarding_answers ?? {}) as Record<string, string>;
    const answers: Record<string, string> = { ...previous };

    type ProfileUpdate = Database["public"]["Tables"]["sp_passport_profiles"]["Update"];
    const patch: ProfileUpdate = {};

    if (data.displayName !== undefined) {
      patch.display_name = data.displayName;
      answers["identity.displayName"] = data.displayName ?? "";
    }
    if (data.headline !== undefined) {
      patch.headline = data.headline;
      answers["identity.headline"] = data.headline ?? "";
    }
    const declaredAt = data.declared ? new Date().toISOString() : null;
    if (declaredAt) {
      patch.declared_accurate_at = declaredAt;
      answers["declaration.declared"] = "true";
    }

    patch.onboarding_answers = answers;

    const { data: row, error } = await db
      .from("sp_passport_profiles")
      .update(patch)
      .eq("holder_user_id", userId)
      .select("updated_at, declared_accurate_at")
      .single();
    if (error) throw new Error(error.message);

    // A declaration is an act, not a field, so it is recorded as one. The
    // same event type the wizard writes, from the same holder, about the
    // same statement — a later reader should not have to know which screen
    // it was given on to find it.
    if (declaredAt) {
      await db.from("sp_passport_events").insert({
        holder_user_id: userId,
        actor_user_id: userId,
        event_type: "declaration_recorded",
        subject_type: "profile",
        detail: { declared_at: declaredAt, question_version: PASSPORT_QUESTION_VERSION },
      });
    }

    const saved = row as { updated_at: string; declared_accurate_at: string | null };
    return { savedAt: saved.updated_at, declaredAt: saved.declared_accurate_at };
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
  startedOn: z.string().refine(isCalendarDate, { message: "SP_INVALID_DATE" }),
  endedOn: z.string().refine(isCalendarDate, { message: "SP_INVALID_DATE" }).nullable(),
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
  issuedOn: z.string().refine(isCalendarDate, { message: "SP_INVALID_DATE" }).nullable(),
  validUntil: z.string().refine(isCalendarDate, { message: "SP_INVALID_DATE" }).nullable(),
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
  issuedOn: z.string().refine(isCalendarDate, { message: "SP_INVALID_DATE" }).nullable(),
  validUntil: z.string().refine(isCalendarDate, { message: "SP_INVALID_DATE" }).nullable(),
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
