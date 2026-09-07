// Security Passport — the sharing refusals, as codes a screen can act on.
//
// Every refusal in the selected-sharing functions raises a named identifier:
// SP_MERIT_NOT_SHAREABLE, SP_UNSUPPORTED_EXPIRY, SP_REQUEST_KEY_CONFLICT and
// the rest. Those names are the contract; the sentence after the colon is for
// a log and a developer, and it is not translated.
//
// So the route does not read messages. It reads a CODE, and chooses its own
// sentence in the holder's language. Matching on prose would break the first
// time somebody rewords a RAISE, and rendering the database's own English
// sentence to a Swedish holder would be worse.
//
// `unknown` is a real answer: a failure this build has no words for gets the
// generic "try again", never a guess at which rule was broken.

export type ShareErrorCode =
  | "merit_not_shareable"
  | "nothing_selected"
  | "too_many_merits"
  | "unsupported_expiry"
  | "unsupported_locale"
  | "request_key_required"
  | "request_key_conflict"
  | "share_not_replaceable"
  | "no_passport"
  | "not_authenticated"
  | "unknown";

const CODES: readonly (readonly [string, ShareErrorCode])[] = [
  ["SP_MERIT_NOT_SHAREABLE", "merit_not_shareable"],
  ["SP_NOTHING_SELECTED", "nothing_selected"],
  ["SP_TOO_MANY_MERITS", "too_many_merits"],
  ["SP_UNSUPPORTED_EXPIRY", "unsupported_expiry"],
  ["SP_UNSUPPORTED_LOCALE", "unsupported_locale"],
  ["SP_REQUEST_KEY_REQUIRED", "request_key_required"],
  ["SP_REQUEST_KEY_CONFLICT", "request_key_conflict"],
  ["SP_SHARE_NOT_REPLACEABLE", "share_not_replaceable"],
  ["SP_NO_PASSPORT", "no_passport"],
  ["SP_NOT_AUTHENTICATED", "not_authenticated"],
];

export function shareErrorCode(error: unknown): ShareErrorCode {
  const message = String((error as { message?: unknown })?.message ?? error ?? "");
  for (const [needle, code] of CODES) {
    if (message.includes(needle)) return code;
  }
  return "unknown";
}
