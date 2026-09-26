// India entry — the funnel, measured without anything about the person.
//
// Six anonymous event NAMES on the product's only first-party analytics
// (cd_v31_funnel_events, 20261215090000). This helper takes a name and nothing
// else: there is no parameter through which a name, a certificate number,
// document text, a HAYAT reading, a share token or a recipient could travel.
// The server entry point records no identity for these calls either — it uses
// the publishable key — so an event says "somebody did this", never who.
//
// Fire-and-forget. A tracking failure never blocks or degrades what the person
// was doing, and before the migration is applied the database simply refuses
// the name and the call resolves quietly.
//
// Once per browser session per name: a reload of the landing page is not a
// second visit, and a second credential is not a "first credential".

import { trackV31FunnelEvent } from "@/lib/career-discovery/v31-feedback.functions";

export const INDIA_FUNNEL_EVENTS = [
  "india_landing_viewed",
  "india_registration_started",
  "india_registration_completed",
  "passport_first_credential_saved",
  "passport_review_requested",
  "passport_share_link_created",
] as const;
export type IndiaFunnelEvent = (typeof INDIA_FUNNEL_EVENTS)[number];

const ONCE_PREFIX = "cqj:funnel:once:";

export function trackFunnelOnce(event: IndiaFunnelEvent): void {
  if (typeof window === "undefined") return;
  try {
    const key = ONCE_PREFIX + event;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Storage unavailable (private mode, blocked site data): record anyway.
  }
  try {
    void trackV31FunnelEvent({ data: { eventName: event } }).catch(() => undefined);
  } catch {
    // A tracker that cannot even start is still never the visitor's problem.
  }
}
