// Test-group feedback, funnel analytics, and career-goal persistence
// (Execution Mandate §17, §31, §34).
//
// ANONYMOUS TELEMETRY IS STILL ANONYMOUS. What changed in
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
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

/**
 * Records one funnel event. Fire-and-forget by design: a tracking failure
 * must never block or degrade the candidate's actual experience, so this
 * never throws to the caller — it logs and returns.
 *
 * This handler talks to the database with the PUBLISHABLE key and carries no
 * candidate JWT, so auth.uid() inside cd_record_funnel_event() is NULL and the
 * stored event is anonymous — exactly as it was before, when this code simply
 * omitted user_id. The difference is that it is now anonymous because the
 * database observed no identity, not because the caller chose not to send one.
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
  .handler(async ({ data }): Promise<{ readonly recorded: boolean }> => {
    const { error } = await publicClient.rpc("cd_record_funnel_event", {
      _event_name: data.eventName,
      _detail: data.detail ?? {},
      _session_id: data.sessionId ?? null,
    });
    if (error) {
      console.error("[v31] funnel event record failed", data.eventName, error.message);
      return { recorded: false };
    }
    return { recorded: true };
  });

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
