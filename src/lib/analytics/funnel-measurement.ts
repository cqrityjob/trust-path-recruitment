// Version 1 measures nothing about how people use the product (owner decision,
// 2026-10-04).
//
// The optional first-party funnel (`cd_v31_funnel_events`) counted visits to
// the India landing page, assessment steps, Career Center clicks and the like.
// It was described as anonymous because it stores no user id and no session id.
// That is not the same as anonymous: an event still carries a time, a name and
// a small detail object, and it is written from a browser the product could
// recognise. The owner has not approved it for the launch, and the privacy
// policy therefore does not describe it.
//
// So it is off, in two places that do not depend on each other:
//
//   * every caller in the browser returns before it calls the server and before
//     it writes the "once per session" marker to sessionStorage, and
//   * the server function refuses to write whatever a stale browser sends.
//
// Login, sharing and the buffers that keep an unfinished assessment alive are
// not measurement and are untouched.
//
// This is a CONSTANT, not a setting. Turning measurement on again is a reviewed
// change that comes together with an owner decision, an updated privacy policy
// and a retention routine for what it stores; `funnel-measurement:check` fails
// until the policy no longer says it is off.

/** Version 1: no usage measurement. */
export const FUNNEL_MEASUREMENT_ENABLED = false;
