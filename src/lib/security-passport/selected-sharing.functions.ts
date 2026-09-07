// Security Passport — the holder's chosen-scope share, server side.
//
// Three calls, and every one of them is a thin wrapper over a database
// function that makes the actual decision:
//
//   previewSelectedShare  sp_preview_selected_disclosure
//   createSelectedShare   sp_create_selected_disclosure
//   listMyShares          a holder-scoped read under RLS
//
// ── THE VALIDATION HERE IS A COURTESY, NOT A BOUNDARY ──────────────────
//
// The Zod schemas below refuse a bad expiry or locale before a round trip, so
// the holder gets an immediate answer. They are NOT what makes those values
// safe: `sp_assert_share_inputs` refuses the same three things inside the
// database, by name, because this RPC is callable by any authenticated
// principal with a session and a HTTP client and everything the browser
// believes is advisory by the time it arrives. The database suite asserts the
// refusals against direct RPC calls with no browser involved.
//
// ── WHY THE SCOPE IS NOT DECIDED HERE ──────────────────────────────────
//
// A share's contents could have been assembled in this file: read the
// holder's merits, filter to the ticked ones, hand the result to the page.
// That would put the boundary in a process the holder's browser talks to,
// which means the boundary is whatever the request body says it is. The
// selection therefore travels as a list of ids to a SECURITY DEFINER
// function that checks every one of them against `auth.uid()` and refuses
// the whole create if any fails. Nothing here filters, hides or assembles.
//
// ── THE PREVIEW GOES THROUGH THE LIVE BUILDER ──────────────────────────
//
// `sp_preview_selected_disclosure` returns a payload built by
// `sp_selected_merits_payload` — the same function `sp_get_disclosure`
// reaches for a real link. So the preview cannot show the holder something
// the recipient will not see, and it cannot hide something they will.
//
// ── THE TOKEN LEAVES EXACTLY ONCE ──────────────────────────────────────
//
// `createSelectedShare` is the only place a plaintext token exists. It is
// returned to the caller and never logged, never put in a URL this file
// constructs, and never stored — only its SHA-256 reaches the database.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RecipientPayload } from "./packages";

/** One share, as the holder's own list shows it. */
export interface ShareRecord {
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  /** Every open, including the holder's own. NOT a read receipt — see the
   *  route's note. */
  readonly accessCount: number;
  /** Derived on the server so the list and the recipient page cannot
   *  disagree about which of the three states a share is in. */
  readonly state: "active" | "expired" | "revoked";
  /** How many merits the holder chose. Null for a share created through a
   *  PACKAGE, whose scope is a contract rather than a list — the two are
   *  genuinely different things and the list says so rather than printing a
   *  count that would mean something else. */
  readonly meritCount: number | null;
  /** How many of those are still current, and therefore still rendered to a
   *  recipient. Null alongside `meritCount`. Lower than `meritCount` when a
   *  chosen merit has since been revoked, superseded or archived. */
  readonly currentMeritCount: number | null;
}

const SELECTION = {
  claimIds: z.array(z.string().uuid()).max(200),
  experienceIds: z.array(z.string().uuid()).max(200),
  /** 7, 30 or 90. The screen offers no permanent link, and neither does this:
   *  an unbounded share is a decision the holder never gets asked about
   *  again. */
  expiresDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  locale: z.enum(["sv", "en"]),
};

export const previewSelectedShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object(SELECTION).parse(data))
  .handler(async ({ context, data }): Promise<RecipientPayload> => {
    const { data: payload, error } = await context.supabase.rpc("sp_preview_selected_disclosure", {
      _claim_ids: data.claimIds,
      _experience_ids: data.experienceIds,
      _expires_days: data.expiresDays,
      _purpose: null,
      _locale: data.locale,
    });
    if (error) throw new Error(error.message);
    return payload as unknown as RecipientPayload;
  });

export type CreateShareResult =
  | {
      readonly status: "created";
      readonly token: string;
      readonly disclosureId: string;
      readonly expiresAt: string | null;
      /** Only a reissue answers this: whether the link it replaced was
       *  revoked. Null for an ordinary creation, which replaced nothing. */
      readonly previousRevoked: boolean | null;
    }
  | {
      /** This request key had already produced a share. The token is gone —
       *  only its hash was ever stored — so the caller is given the share's
       *  id and nothing else. Exactly one row exists either way, which is the
       *  property that matters. */
      readonly status: "already_created";
      readonly disclosureId: string;
      readonly expiresAt: string | null;
    };

export const createSelectedShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ ...SELECTION, requestKey: z.string().uuid() }).parse(data),
  )
  .handler(async ({ context, data }): Promise<CreateShareResult> => {
    const { data: result, error } = await context.supabase.rpc("sp_create_selected_disclosure", {
      _claim_ids: data.claimIds,
      _experience_ids: data.experienceIds,
      _expires_days: data.expiresDays,
      _purpose: null,
      _recipient_hint: null,
      _locale: data.locale,
      _request_key: data.requestKey,
    });
    if (error) throw new Error(error.message);

    return readCreateResult(result);
  });

/** The two shapes `sp_create_selected_disclosure` and
 *  `sp_replace_selected_disclosure` both return. Read in one place so a
 *  replay cannot be mistaken for a creation by one caller and not the other —
 *  the difference is whether a token came back, and a missing token must never
 *  be reported as a link the holder can send. */
function readCreateResult(result: unknown): CreateShareResult {
  const row = result as {
    status?: string;
    token?: string;
    disclosure_id?: string;
    expires_at?: string | null;
    previous_revoked?: boolean;
  } | null;
  if (row?.status === "created" && row.token) {
    return {
      status: "created",
      token: row.token,
      disclosureId: String(row.disclosure_id),
      expiresAt: row.expires_at ?? null,
      previousRevoked: row.previous_revoked ?? null,
    };
  }
  return {
    status: "already_created",
    disclosureId: String(row?.disclosure_id),
    expiresAt: row?.expires_at ?? null,
  };
}

/**
 * A NEW link over the same contents.
 *
 * The holder's safe answer to "I lost the link". A stored token would make
 * every share recoverable forever from a backup, which is the liability the
 * hash exists to avoid — so a lost link is not recovered, it is replaced, and
 * the holder says explicitly whether the previous one should stop working.
 *
 * Idempotent on `requestKey` exactly as creation is, so a lost response
 * reconciles to the link that already exists rather than minting a third.
 */
export const replaceShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        disclosureId: z.string().uuid(),
        revokePrevious: z.boolean(),
        requestKey: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<CreateShareResult> => {
    const { data: result, error } = await context.supabase.rpc("sp_replace_selected_disclosure", {
      _disclosure_id: data.disclosureId,
      _revoke_previous: data.revokePrevious,
      _request_key: data.requestKey,
    });
    if (error) throw new Error(error.message);
    return readCreateResult(result);
  });

export const revokeShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ disclosureId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("sp_revoke_disclosure", {
      _id: data.disclosureId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Every link share this holder has, newest first.
 *
 * `token_hash` is deliberately not selected: it is of no use to the holder
 * and there is no reason for it to leave the database. Application-scoped
 * disclosures are excluded — those are not links, they are answers attached
 * to one job application, and they are managed where the application is.
 *
 * The two counts are read through RLS, which is what makes them safe: the
 * item policy resolves the holder's own shares and nothing else, and the
 * claim and period tables answer only for their own holder.
 */
export const listMyShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly ShareRecord[]> => {
    const { supabase, userId } = context;

    const { data, error } = await supabase
      .from("sp_disclosures")
      .select("id, package_code, created_at, expires_at, revoked_at, access_count")
      .eq("holder_user_id", userId)
      .is("application_id", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as {
      id: string;
      package_code: string;
      created_at: string;
      expires_at: string | null;
      revoked_at: string | null;
      access_count: number;
    }[];

    const selectedIds = rows.filter((r) => r.package_code === "selected_merits").map((r) => r.id);

    const chosen = new Map<string, { claims: string[]; periods: string[] }>();
    if (selectedIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("sp_disclosure_items")
        .select("disclosure_id, claim_id, experience_id")
        .in("disclosure_id", selectedIds);
      if (itemsError) throw new Error(itemsError.message);
      for (const item of (items ?? []) as {
        disclosure_id: string;
        claim_id: string | null;
        experience_id: string | null;
      }[]) {
        const bucket = chosen.get(item.disclosure_id) ?? { claims: [], periods: [] };
        if (item.claim_id) bucket.claims.push(item.claim_id);
        if (item.experience_id) bucket.periods.push(item.experience_id);
        chosen.set(item.disclosure_id, bucket);
      }
    }

    // Which of the chosen merits are STILL current. The recipient sees this
    // set, not the set the holder ticked, because the payload intersects the
    // item list with the verified-and-active filter. The holder is the only
    // person who can notice the difference, so they are the one told.
    const currentClaims = new Set<string>();
    const currentPeriods = new Set<string>();
    const allClaimIds = [...new Set([...chosen.values()].flatMap((c) => c.claims))];
    const allPeriodIds = [...new Set([...chosen.values()].flatMap((c) => c.periods))];

    if (allClaimIds.length > 0) {
      // THE SHARING POLICY, not a verification filter: a merit is still in a
      // share while its lifecycle is `active`, at whatever standing it has.
      const { data: live, error: liveError } = await supabase
        .from("sp_claims")
        .select("id")
        .in("id", allClaimIds)
        .eq("lifecycle_state", "active");
      if (liveError) throw new Error(liveError.message);
      for (const row of (live ?? []) as { id: string }[]) currentClaims.add(row.id);
    }
    if (allPeriodIds.length > 0) {
      const { data: live, error: liveError } = await supabase
        .from("sp_experience_periods")
        .select("id")
        .in("id", allPeriodIds)
        .eq("lifecycle_state", "active");
      if (liveError) throw new Error(liveError.message);
      for (const row of (live ?? []) as { id: string }[]) currentPeriods.add(row.id);
    }

    const now = Date.now();
    return rows.map((row): ShareRecord => {
      const bucket = chosen.get(row.id);
      const isSelected = row.package_code === "selected_merits";
      return {
        id: row.id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        accessCount: row.access_count,
        state: row.revoked_at
          ? "revoked"
          : row.expires_at && new Date(row.expires_at).getTime() < now
            ? "expired"
            : "active",
        meritCount: isSelected
          ? (bucket?.claims.length ?? 0) + (bucket?.periods.length ?? 0)
          : null,
        currentMeritCount: isSelected
          ? (bucket?.claims.filter((id) => currentClaims.has(id)).length ?? 0) +
            (bucket?.periods.filter((id) => currentPeriods.has(id)).length ?? 0)
          : null,
      };
    });
  });
