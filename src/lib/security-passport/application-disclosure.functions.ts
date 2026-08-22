// Security Passport — disclosing to one employer, through one application.
//
// ── WHY THIS IS NOT PART OF disclosure.functions.ts ────────────────────
//
// It is the same mechanism (an `sp_disclosures` row, the same packages, the
// same revocation) but a different AUDIENCE, and the two must not be
// confused at a call site. A token share produces a link the holder gives to
// whoever they like; an application share produces no link at all and is
// readable by exactly one organisation. Keeping them in separate modules
// means `createDisclosure` can never be reached from a recruitment surface
// by autocomplete, and an application share can never accidentally be
// rendered as something to copy.
//
// ── THE ONE RULE WORTH REPEATING HERE ──────────────────────────────────
//
// `readApplicationDisclosure` returns `{ status: "unavailable" }` for every
// negative case the database recognises — not a member, no such application,
// nothing shared, revoked, expired — and for its own errors as well. The
// server tier deliberately does not distinguish them: an employer surface
// that could tell "nothing was shared" from "there is nothing to share"
// would leak the existence of a Passport, which is the one thing applying
// must never reveal.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { orNull } from "./rpc";
import {
  DISCLOSURE_PACKAGE_CODES,
  type DisclosurePackageCode,
  type RecipientPayload,
} from "./packages";

export interface ApplicationDisclosureRecord {
  readonly disclosureId: string;
  readonly applicationId: string;
  readonly employerName: string | null;
  readonly jobTitleSv: string | null;
  readonly jobTitleEn: string | null;
  readonly packageCode: DisclosurePackageCode;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly accessCount: number;
  readonly state: "active" | "expired" | "revoked";
}

function toRecord(row: {
  disclosure_id: string;
  application_id: string;
  employer_name: string | null;
  job_title_sv: string | null;
  job_title_en: string | null;
  package_code: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  access_count: number;
}): ApplicationDisclosureRecord {
  return {
    disclosureId: row.disclosure_id,
    applicationId: row.application_id,
    employerName: row.employer_name,
    jobTitleSv: row.job_title_sv,
    jobTitleEn: row.job_title_en,
    packageCode: row.package_code as DisclosurePackageCode,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    accessCount: row.access_count,
    // Derived on the server, exactly as listMyDisclosures derives it, so the
    // sharing centre and the applications list cannot disagree about whether
    // a share is live.
    state: row.revoked_at
      ? "revoked"
      : row.expires_at && new Date(row.expires_at).getTime() < Date.now()
        ? "expired"
        : "active",
  };
}

// -------------------- the holder's side --------------------

const shareInput = z.object({
  applicationId: z.string().uuid(),
  packageCode: z.enum(DISCLOSURE_PACKAGE_CODES),
  /** Null means no expiry. The UI offers 30 days rather than never. */
  expiresDays: z.number().int().min(1).max(365).nullable(),
});

export const sharePassportWithApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => shareInput.parse(data))
  .handler(async ({ context, data }): Promise<{ disclosureId: string }> => {
    const { data: id, error } = await context.supabase.rpc("sp_share_passport_with_application", {
      _application_id: data.applicationId,
      _package_code: data.packageCode,
      _expires_days: orNull(data.expiresDays),
      // Optional in SQL and optional in the generated type. An
      // application share is always a whole package: focusing it on one
      // credential is the sharing centre's job, not the recruiter-facing
      // one, and a purpose string would be the holder describing a share
      // to an employer who already knows why it exists.
      _focus_claim_id: undefined,
      _purpose: undefined,
    });
    if (error) throw new Error(error.message);
    return { disclosureId: id as unknown as string };
  });

export const listMyApplicationDisclosures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly ApplicationDisclosureRecord[]> => {
    const { data, error } = await context.supabase.rpc("sp_my_application_disclosures");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Parameters<typeof toRecord>[0][]).map(toRecord);
  });

// -------------------- the employer's side --------------------

const readInput = z.object({ applicationId: z.string().uuid() });

/**
 * What one employer may read on one application.
 *
 * Returns the SAME payload shape as the public recipient page, so the
 * employer surface renders through `buildRecipientPresentation` and
 * `RecipientPassportCard` exactly as `/p/$token` does. One package contract,
 * one interpretation, one rendering — a second reader of this payload is how
 * two surfaces end up disagreeing about whether a licence is current.
 *
 * `unavailable` covers every negative case and is deliberately
 * undifferentiated: nothing shared, revoked, expired, not a member, no such
 * application. See the module comment.
 */
export const readApplicationDisclosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => readInput.parse(data))
  .handler(async ({ context, data }): Promise<RecipientPayload> => {
    const { data: payload, error } = await context.supabase.rpc("sp_application_disclosure", {
      _application_id: data.applicationId,
    });
    // A failure is indistinguishable from "nothing shared" on purpose: an
    // employer surface must not be able to tell an outage from a Passport.
    if (error) return { status: "unavailable" };
    const p = (payload ?? {}) as { status?: string };
    if (p.status !== "active") return { status: "unavailable" };
    return payload as unknown as RecipientPayload;
  });
