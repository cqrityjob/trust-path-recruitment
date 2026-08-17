// Security Passport — typed database surface for the `sp_*` domain.
//
// ── WHY THIS EXISTS INSTEAD OF AN EDIT TO types.ts ─────────────────────
//
// `src/integrations/supabase/types.ts` is GENERATED from the hosted schema.
// The Phase 2 tables are deliberately not applied to the hosted project yet
// — that is the owner's gate — so they cannot appear there, and hand-editing
// a generated file would be undone by the next Lovable sync, which rewrites
// this tree.
//
// So the Passport declares its own table shapes here and casts the client
// once, in one reviewable place, rather than scattering `as any` through the
// server functions. The result is fully type-checked queries against the
// Phase 2 schema.
//
// DELETE THIS FILE once the Phase 2 migration is applied to the hosted
// project and types.ts is regenerated: at that point the generated types are
// authoritative and this shim would be a second source of truth.

import type { SupabaseClient } from "@supabase/supabase-js";

type Timestamp = string;
type IsoDate = string;

export interface SpPassportProfileRow {
  holder_user_id: string;
  display_name: string | null;
  headline: string | null;
  profession_family: string | null;
  cig_profession_slug: string | null;
  jurisdiction_code: string;
  privacy_mode: string;
  is_private: boolean;
  onboarding_state: string;
  onboarding_step: number;
  onboarding_answers: Record<string, string>;
  question_version: string;
  declared_accurate_at: Timestamp | null;
  recognition_policy_version: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SpExperiencePeriodRow {
  id: string;
  holder_user_id: string;
  employer_name: string;
  employer_id: string | null;
  role_title: string;
  profession_family: string | null;
  cig_profession_slug: string | null;
  jurisdiction_code: string;
  employment_type: string;
  fte_fraction: number;
  security_relevance: string;
  security_fraction: number;
  started_on: IsoDate;
  ended_on: IsoDate | null;
  assertion_level: string;
  lifecycle_state: string;
  version_no: number;
  supersedes_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SpClaimRow {
  id: string;
  holder_user_id: string;
  claim_type: string;
  title: string;
  claimed_issuer_name: string | null;
  jurisdiction_code: string | null;
  issued_on: IsoDate | null;
  valid_from: IsoDate | null;
  valid_until: IsoDate | null;
  assertion_level: string;
  lifecycle_state: string;
  verified_by_user_id: string | null;
  verified_at: Timestamp | null;
  version_no: number;
  supersedes_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SpPassportEventRow {
  id: string;
  holder_user_id: string;
  actor_user_id: string | null;
  event_type: string;
  subject_type: string | null;
  subject_id: string | null;
  detail: Record<string, unknown>;
  occurred_at: Timestamp;
}

/** Insert and update shapes.
 *
 *  Deliberately plain: `Partial<Row>` with the key required field, rather
 *  than a precise Omit of every trust column.
 *
 *  An earlier version tried to make "you cannot set assertion_level" a TYPE
 *  error. It fought supabase-js's inference and, more importantly, it was
 *  the weakest of the three guarantees already in place — the database
 *  refuses the write for every caller including service_role, and
 *  scripts/passport-separation-check.ts fails the build if a literal trust
 *  value appears in server code at all. A type that merely inconveniences
 *  the one caller who reads it was not worth the complexity. */
export type SpProfileInsert = Partial<SpPassportProfileRow> &
  Pick<SpPassportProfileRow, "holder_user_id">;
export type SpProfileUpdate = Partial<SpPassportProfileRow>;

export type SpPeriodInsert = Partial<SpExperiencePeriodRow> &
  Pick<SpExperiencePeriodRow, "holder_user_id" | "employer_name" | "role_title" | "started_on">;

export type SpClaimInsert = Partial<SpClaimRow> &
  Pick<SpClaimRow, "holder_user_id" | "claim_type" | "title">;

export type SpEventInsert = Partial<SpPassportEventRow> &
  Pick<SpPassportEventRow, "holder_user_id" | "event_type">;

export interface SpDatabase {
  // Mirrors the generated types.ts exactly. supabase-js keys its Insert/Update
  // inference off this marker; without it every insert infers as `never`,
  // which is a confusing way for the client to say "this is not a Database".
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      sp_passport_profiles: {
        Row: SpPassportProfileRow;
        Insert: SpProfileInsert;
        Update: SpProfileUpdate;
        Relationships: [];
      };
      sp_experience_periods: {
        Row: SpExperiencePeriodRow;
        Insert: SpPeriodInsert;
        Update: Partial<SpPeriodInsert>;
        Relationships: [];
      };
      sp_claims: {
        Row: SpClaimRow;
        Insert: SpClaimInsert;
        Update: Partial<SpClaimInsert>;
        Relationships: [];
      };
      sp_passport_events: {
        Row: SpPassportEventRow;
        Insert: SpEventInsert;
        // Typed as an ordinary update shape rather than `never`: the
        // append-only guarantee is a database trigger that refuses every
        // caller, and expressing it here as an impossible type only broke
        // supabase-js's inference without adding a real defence.
        Update: Partial<SpPassportEventRow>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      sp_correct_claim: {
        Args: {
          _claim_id: string;
          _title: string;
          _claimed_issuer_name: string | null;
          _jurisdiction_code: string | null;
          _issued_on: string | null;
          _valid_from: string | null;
          _valid_until: string | null;
          _reason: string;
        };
        Returns: string;
      };
      sp_withdraw_claim: {
        Args: { _claim_id: string; _reason: string };
        Returns: undefined;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

/**
 * Views the caller's authenticated client through the Passport schema.
 *
 * The client itself is unchanged — same session, same RLS, same user, same
 * JWT. This only changes how TypeScript sees it.
 *
 * ── WHY THE GENERIC IS LOOSE, AND WHY THAT IS ACCEPTABLE HERE ──────────
 *
 * supabase-js infers Insert/Update shapes through a deep conditional type
 * keyed off its generated `Database`. A hand-written stand-in either has to
 * reproduce that contract exactly or every insert infers as `never`.
 * Reproducing it for four tables that will be generated properly the moment
 * the migration is applied is a lot of fragile type surface for no runtime
 * effect.
 *
 * The trade is explicit: Passport queries are not column-checked by the
 * compiler until then. What still holds, and is what actually matters:
 *
 *   * the DATABASE refuses every prohibited write, for every caller
 *     including service_role (34 assertions in the Phase 2 suite);
 *   * scripts/passport-separation-check.ts fails the build if server code
 *     names a literal trust value at all;
 *   * the Row types above are real and are used to shape every read, so the
 *     mapping functions in passport.functions.ts stay checked.
 *
 * DELETE THIS FILE once the migration is applied to the hosted project and
 * types.ts is regenerated. Full column-level checking returns for free.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the note above
export function spDb(client: unknown): SupabaseClient<any, "public"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the note above
  return client as SupabaseClient<any, "public">;
}
