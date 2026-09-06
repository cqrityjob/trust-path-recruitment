// Measuring the recommended next step — no new vendor, no new pipeline.
//
// ── WHAT IS MEASURED ───────────────────────────────────────────────────
//
//   next_action_impression   the recommendation was shown, with its state
//   next_action_click        the primary CTA was followed, and to where
//
// and the completion of the corresponding action, which is already
// measured where it happens (an assessment completion, a verification
// submission) and is deliberately NOT re-emitted from the home: a second
// event fired from a dashboard would double-count the one that matters.
//
// ── WHAT IS NOT MEASURED ───────────────────────────────────────────────
//
// The `state_key` is the ladder rung plus the action kind — `p5:
// submit_passport_verification` — and that is the whole payload besides the
// destination path, which is an in-app route. No count, no employer name,
// no credential title, no assessment answer, no report content, no
// identifier of any kind. `cd_record_funnel_event` derives identity from the
// database rather than from the caller, and this handler carries no
// candidate JWT, so the stored row is anonymous.
//
// ── WHY NOTHING IS RECORDED YET ────────────────────────────────────────
//
// `cd_v31_funnel_events.event_name` is CHECK-constrained to an explicit
// allowlist in the database. `next_action_impression` and
// `next_action_click` are not on it, and putting them there is one additive
// migration — which this change is explicitly not allowed to write.
//
// So the derivation is built, tested and wired, and the emitter refuses to
// send a name the database would reject: sending one would log an error on
// every page view and record nothing. `NEXT_ACTION_EVENTS` names exactly
// what the allowlist needs, `eventsEnabled()` answers whether it has it,
// and the day the migration lands this file starts recording with no other
// change. Silence is the honest behaviour until then; a rejected write is
// not measurement.

import { useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  FUNNEL_EVENT_NAMES,
  trackV31FunnelEvent,
} from "@/lib/career-discovery/v31-feedback.functions";
import type { NextActionStateKey } from "./next-best-action";

/** The two names this surface needs on the funnel allowlist. */
export const NEXT_ACTION_EVENTS = ["next_action_impression", "next_action_click"] as const;

export type NextActionEvent = (typeof NEXT_ACTION_EVENTS)[number];

/** True when the funnel's own allowlist already carries a name. Read from
 *  the constant the tracker validates against, so this cannot drift. */
export function eventsEnabled(): boolean {
  const allowed = new Set<string>(FUNNEL_EVENT_NAMES as readonly string[]);
  return NEXT_ACTION_EVENTS.every((name) => allowed.has(name));
}

export interface NextActionEventDetail {
  /** The ladder rung and the action kind. Nothing else about the person. */
  readonly state_key: NextActionStateKey;
  /** In-app destination path, for the click event only. Never a URL with a
   *  token, an id or a query string — the ladder only ever emits routes. */
  readonly destination?: string;
}

/**
 * The two recorders, as a hook so the server function is resolved the way
 * every other caller in this codebase resolves one.
 *
 * Fire-and-forget: a tracking failure must never block or degrade what the
 * candidate is doing, so nothing here is awaited by its caller and nothing
 * throws.
 */
export function useNextActionAnalytics() {
  const track = useServerFn(trackV31FunnelEvent);

  const record = useCallback(
    (event: NextActionEvent, detail: NextActionEventDetail) => {
      if (!eventsEnabled()) return;
      void track({
        data: {
          // Safe: `eventsEnabled` has just confirmed the name is on the
          // allowlist the validator uses.
          eventName: event as never,
          detail: { ...detail },
        },
      }).catch(() => {
        /* fire and forget — see the file header */
      });
    },
    [track],
  );

  return {
    impression: useCallback(
      (stateKey: NextActionStateKey) => record("next_action_impression", { state_key: stateKey }),
      [record],
    ),
    click: useCallback(
      (stateKey: NextActionStateKey, destination: string) =>
        record("next_action_click", { state_key: stateKey, destination }),
      [record],
    ),
  };
}
