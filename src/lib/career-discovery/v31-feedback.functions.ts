// Test-group feedback, funnel analytics, and career-goal persistence
// (Execution Mandate §17, §31, §34). See the migration
// 20260815090000_cd_v31_feedback_analytics_goals.sql for the RLS shape this
// relies on: anyone may insert an event or a feedback row (both are the
// point of an anonymous-first funnel), only an authenticated candidate may
// read or write their OWN career goal.

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
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

/**
 * Records one funnel event. Fire-and-forget by design: a tracking failure
 * must never block or degrade the candidate's actual experience, so this
 * never throws to the caller — it logs and returns.
 */
export const trackV31FunnelEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        eventName: z.enum(FUNNEL_EVENT_NAMES),
        detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ readonly recorded: boolean }> => {
    const { error } = await publicClient.from("cd_v31_funnel_events").insert({
      event_name: data.eventName,
      detail: data.detail ?? {},
    });
    if (error) {
      console.error("[v31] funnel event insert failed", data.eventName, error.message);
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
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ readonly submitted: boolean }> => {
    const { error } = await publicClient.from("cd_test_feedback").insert({
      relevant: data.relevant ?? null,
      understood_why: data.understoodWhy ?? null,
      pathway_realistic: data.pathwayRealistic ?? null,
      requirements_useful: data.requirementsUseful ?? null,
      missing_career_note: data.missingCareerNote ?? null,
      explored_profession_id: data.exploredProfessionId ?? null,
      free_text: data.freeText ?? null,
      locale: data.locale,
    });
    if (error) {
      console.error("[v31] feedback insert failed", error.message);
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
