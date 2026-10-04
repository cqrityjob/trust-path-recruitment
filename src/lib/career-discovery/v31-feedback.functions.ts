// Test-group feedback, funnel analytics, and career-goal persistence
// (Execution Mandate §17, §31, §34).
//
// FUNNEL MEASUREMENT IS OFF IN VERSION 1 (src/lib/analytics/funnel-measurement.ts):
// `trackV31FunnelEvent` records nothing, and nothing in the browser calls it.
// What follows describes how a funnel event WAS written, and what a later
// version would have to decide again. An event with no user id and no session
// id is not thereby anonymous -- it still carries a time, a name and a detail --
// so no text may call it that. What changed in
// 20260916090000_security_hardening_lovable_findings.sql is HOW it is written:
// the two tables no longer accept a direct INSERT from anon or authenticated,
// because the policy that allowed it was `WITH CHECK (true)` over a table with
// a user_id column. Anyone holding the publishable key could therefore attach
// a funnel event or a feedback row to somebody else's account and somebody
// else's session, and a platform admin would read it as though the victim had
// written it.
//
// Both writes now go through a narrow SECURITY DEFINER entry point that takes
// no user_id parameter at all — it derives one from auth.uid() — and refuses a
// session_id that belongs to a different candidate. A visitor who has not
// signed in still records events and still submits feedback; the row simply
// carries the identity the database observed rather than the one the caller
// claimed.
//
// Only an authenticated candidate may read or write their OWN career goal;
// that path is unchanged.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import { FUNNEL_MEASUREMENT_ENABLED } from "@/lib/analytics/funnel-measurement";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

// The generated Database type does not yet know this branch's cd_* objects
// (same situation as v31-public.functions.ts's Ctx.supabase) — cast once,
// here, rather than sprinkling `as any` at every call site below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const publicClient = supabase as any;

export const FUNNEL_EVENT_NAMES = [
  "assessment_started",
  "assessment_completed",
  "career_context_completed",
  "result_viewed",
  "profession_explored",
  "pathway_opened",
  "jobs_clicked",
  "career_card_opened",
  "career_card_generated",
  "share_initiated",
  "image_saved",
  "save_journey_clicked",
  "result_claimed",
  "feedback_submitted",
  // Final Candidate Result Delivery & Save Flow Fix: the anonymous result's
  // own download action (window.print()), tracked the same privacy-safe way
  // as every other funnel event here — event name only, no report content.
  "result_downloaded",
  // Security Career Center measurement. `career_center_test_started` is the
  // hub CTA click, which is deliberately NOT `assessment_started` (the first
  // answered question): the gap between the two is the hub's conversion
  // drop-off, and one name cannot carry both. `career_filter_used` has no
  // existing analogue. Both are mirrored in the table's CHECK allowlist by
  // 20261004090000_cd_v31_funnel_events_career_center.sql — see
  // src/lib/career-center/analytics.ts for why the other two Career Center
  // events reuse `profession_explored` and `assessment_completed` instead of
  // adding names here.
  "career_center_test_started",
  "career_filter_used",
  // India entry journey (20261215090000). Event NAME only -- the India helper
  // (src/lib/india-entry/analytics.ts) never sends a detail, so no name,
  // certificate number, document content, HAYAT output, share token or
  // recipient can travel with one. Mirrored in the table CHECK and in
  // cd_v31_funnel_event_names().
  "india_landing_viewed",
  "india_registration_started",
  "india_registration_completed",
  "passport_first_credential_saved",
  "passport_review_requested",
  "passport_share_link_created",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

/** What the write needs from a database client: the one RPC and its error. */
export interface FunnelRpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ readonly error: { readonly message: string } | null }>;
}

/**
 * The write itself, apart from the server function, so that a guard can hand it
 * a recording client and prove that version 1 never reaches the database.
 *
 * Fire-and-forget by design: a tracking failure must never block or degrade
 * the candidate's actual experience, so this never throws to the caller — it
 * logs and returns.
 *
 * Version 1 measures nothing (src/lib/analytics/funnel-measurement.ts): the
 * browser callers no longer send, and this refuses what a stale page still
 * does, before the database is touched.
 */
export async function recordFunnelEvent(
  client: FunnelRpcClient,
  data: {
    readonly eventName: FunnelEventName;
    readonly detail?: Record<string, string | number | boolean>;
    readonly sessionId?: string;
  },
): Promise<{ readonly recorded: boolean }> {
  if (!FUNNEL_MEASUREMENT_ENABLED) return { recorded: false };
  const { error } = await client.rpc("cd_record_funnel_event", {
    _event_name: data.eventName,
    _detail: data.detail ?? {},
    _session_id: data.sessionId ?? null,
  });
  if (error) {
    console.error("[v31] funnel event record failed", data.eventName, error.message);
    return { recorded: false };
  }
  return { recorded: true };
}

/**
 * Records one funnel event, when measurement is on. It is off in version 1, and
 * then this records nothing.
 *
 * (When it was on:) this handler talked to the database with the PUBLISHABLE
 * key and carried no candidate JWT, so auth.uid() inside
 * cd_record_funnel_event() was NULL and the row stored no user id and no
 * session id. That is not "anonymous": the row still has a time, a name and a
 * detail, and no text may call it anonymous on that ground alone.
 */
export const trackV31FunnelEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        eventName: z.enum(FUNNEL_EVENT_NAMES),
        detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        // Optional, and validated server-side against session ownership: the
        // entry point refuses a session that belongs to another candidate.
        sessionId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(
    async ({ data }): Promise<{ readonly recorded: boolean }> =>
      recordFunnelEvent(publicClient, data),
  );

export const submitV31Feedback = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        relevant: z.number().int().min(1).max(5).optional(),
        understoodWhy: z.boolean().optional(),
        pathwayRealistic: z.boolean().optional(),
        requirementsUseful: z.boolean().optional(),
        missingCareerNote: z.string().max(500).optional(),
        exploredProfessionId: z.string().max(20).optional(),
        freeText: z.string().max(1000).optional(),
        locale: z.enum(["sv", "en"]),
        // Same ownership rule as the funnel entry point above.
        sessionId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ readonly submitted: boolean }> => {
    const { error } = await publicClient.rpc("cd_submit_test_feedback", {
      _locale: data.locale,
      _relevant: data.relevant ?? null,
      _understood_why: data.understoodWhy ?? null,
      _pathway_realistic: data.pathwayRealistic ?? null,
      _requirements_useful: data.requirementsUseful ?? null,
      _missing_career_note: data.missingCareerNote ?? null,
      _explored_profession_id: data.exploredProfessionId ?? null,
      _free_text: data.freeText ?? null,
      _session_id: data.sessionId ?? null,
    });
    if (error) {
      console.error("[v31] feedback submit failed", error.message);
      return { submitted: false };
    }
    return { submitted: true };
  });

/**
 * Sets the candidate's chosen career goal. Never validated against the
 * profession catalogue here — the UI only ever offers a profession id that
 * came from the candidate's OWN snapshot, so there is nothing to check
 * against that wouldn't just be trusting the client anyway; this table
 * only remembers a choice, it does not grant a claim about the profession.
 */
export const setCareerGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        professionId: z.string().min(1).max(20),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ readonly saved: boolean }> => {
    const ctx = context as Ctx;
    const { error } = await ctx.supabase.from("cd_career_goals").upsert(
      {
        user_id: ctx.userId,
        session_id: data.sessionId,
        chosen_profession_id: data.professionId,
        note: data.note ?? null,
        set_at: new Date().toISOString(),
      },
      { onConflict: "user_id,session_id" },
    );
    if (error) {
      console.error("[v31] career goal upsert failed", error.message);
      return { saved: false };
    }
    return { saved: true };
  });
