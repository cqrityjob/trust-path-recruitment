// Where a candidate is sent to apply must be a web address.
//
// zod's .url() accepts any scheme that parses -- `javascript:`, `data:`,
// `file:` -- and the public ad puts the stored value in an anchor's href. The
// rule is therefore stated once here and applied at every layer:
//
//   * employer-jobs.functions.ts and admin.functions.ts refuse it on write;
//   * jobs_validate_before_write() (20270131090000) refuses it in the database,
//     when the value is written and when an external job is published;
//   * JobApplicationPanel and ExternalApplyDialog refuse to render one, so a row
//     stored before either rule existed can never become a link.
//
// The database's form of the same test is
//   application_url ~* '^https?://[^/?#[:space:]]+'
// -- the scheme anchored at the very start (a browser strips leading whitespace
// and control characters from a URL, so a trimmed or unanchored test would let
// " javascript:..." through) and at least one host character after it. This
// function additionally requires that the platform's URL parser reads it as
// http(s), so what is accepted is what a browser will treat as a web address.

const DATABASE_FORM = /^https?:\/\/[^/?#\s]+/i;

export function isHttpApplicationUrl(value: string | null | undefined): value is string {
  if (typeof value !== "string" || !DATABASE_FORM.test(value)) return false;
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname !== "";
  } catch {
    return false;
  }
}

/** The address to put in an href, or null when it is not a web address. */
export function safeApplicationHref(value: string | null | undefined): string | null {
  return isHttpApplicationUrl(value) ? value : null;
}
