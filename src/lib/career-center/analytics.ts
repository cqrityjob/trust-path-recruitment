// Career Center measurement.
//
// ── NO NEW VENDOR, NO NEW PIPELINE ─────────────────────────────────────
//
// This product already has one funnel-event mechanism: `trackV31FunnelEvent`,
// which posts a bare event name (plus a small flat detail object of strings,
// numbers and booleans) through a SECURITY DEFINER entry point that derives
// identity from the database rather than the caller. It is anonymous for a
// signed-out visitor, fire-and-forget, and cannot degrade the page when it
// fails. The Career Center reuses it exactly as it stands.
//
// ── WHAT MAPS ONTO WHAT ────────────────────────────────────────────────
//
//   career_center_test_started  -> career_center_test_started  (new name)
//   career_test_completed       -> assessment_completed        (existing)
//   career_profession_opened    -> profession_explored         (existing)
//   career_filter_used          -> career_filter_used          (new name)
//
// Two of the four already have an allowlisted name that means precisely the
// right thing, and reusing them keeps the existing funnel readable rather
// than splitting one journey across two vocabularies. `career_test_completed`
// needs no code here at all: the assessment flow already emits
// `assessment_completed` at exactly the moment this event describes, and a
// second event fired from the Career Center would double-count it.
//
// ── WHY TWO NAMES ARE NEW ──────────────────────────────────────────────
//
// `career_center_test_started` is the hub CTA CLICK, which is a different
// measurement from `assessment_started` (the first question being answered)
// — the gap between them is the drop-off this section was rebuilt to close,
// and collapsing them into one name destroys the only number that shows
// whether the rebuild worked. `career_filter_used` has no existing analogue
// at all.
//
// `cd_v31_funnel_events.event_name` is CHECK-constrained to an explicit
// allowlist, so both names need that list extended — one additive migration,
// following the precedent of 20260816162000, which added `result_downloaded`
// the same way. Until it is applied the two new events are rejected by the
// database and logged; nothing renders differently and no other event is
// affected, because the tracker never throws to its caller.

import { useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  trackV31FunnelEvent,
  type FunnelEventName,
} from "@/lib/career-discovery/v31-feedback.functions";

/** The Career Center's own vocabulary, kept separate from the wire names so
 *  call sites read as the product event they mean rather than as whatever
 *  the funnel allowlist happens to call it. */
export type CareerCenterEvent =
  | "career_center_test_started"
  | "career_profession_opened"
  | "career_filter_used";

export const CAREER_CENTER_EVENT_WIRE_NAME: Readonly<Record<CareerCenterEvent, FunnelEventName>> = {
  career_center_test_started: "career_center_test_started",
  career_profession_opened: "profession_explored",
  career_filter_used: "career_filter_used",
};

/** Where in the Career Center an event came from. Kept to a closed set: a
 *  free-form surface string turns the detail column into an un-queryable
 *  grab bag within a release or two. */
export type CareerCenterSurface =
  | "hub_hero"
  | "hub_test_section"
  | "hub_explorer"
  | "hub_routes"
  | "profession_guide"
  | "profession_related";

export interface CareerCenterEventDetail {
  readonly surface: CareerCenterSurface;
  /** Profession slug for `career_profession_opened`; filter key for
   *  `career_filter_used`. Never free text typed by the visitor — a search
   *  query is content, and content does not belong in telemetry. */
  readonly subject?: string;
}

/**
 * Returns a fire-and-forget tracker.
 *
 * Never awaited, never throws, never blocks navigation: a click that is being
 * measured must behave exactly like a click that is not.
 */
export function useCareerCenterTracking(): (
  event: CareerCenterEvent,
  detail: CareerCenterEventDetail,
) => void {
  const track = useServerFn(trackV31FunnelEvent);

  return useCallback(
    (event: CareerCenterEvent, detail: CareerCenterEventDetail) => {
      const eventName = CAREER_CENTER_EVENT_WIRE_NAME[event];
      const payload: Record<string, string> = { surface: detail.surface };
      if (detail.subject) payload.subject = detail.subject;
      void track({ data: { eventName, detail: payload } }).catch(() => {
        // Deliberately silent. The visitor is reading a career guide; a
        // telemetry failure is not their problem and must not become one.
      });
    },
    [track],
  );
}
