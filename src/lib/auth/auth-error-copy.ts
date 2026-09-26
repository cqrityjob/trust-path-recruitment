// What a Supabase Auth refusal means to the person reading it.
//
// The panel used to print `err.message` straight from the provider: "email
// rate limit exceeded", "Email not confirmed", "User already registered" --
// in English on a Swedish product, and none of them saying what to do next.
// This turns the provider's error CODE (stable, documented) into a kind the
// dictionary has a sentence for, and keeps the raw message for the console.
//
// Codes: https://supabase.com/docs/guides/auth/debugging/error-codes

export type AuthErrorKind =
  | "rate_limited"
  | "existing_account"
  | "email_not_confirmed"
  | "invalid_credentials"
  | "weak_password"
  | "invalid_email"
  | "link_expired"
  | "network"
  | "unknown";

export type ClassifiedAuthError = {
  readonly kind: AuthErrorKind;
  /** From a 429's message ("after 42 seconds"), when the provider says so. */
  readonly retryAfterSeconds: number | null;
  readonly raw: string;
};

const KEY_OF_CODE: Record<string, AuthErrorKind> = {
  over_email_send_rate_limit: "rate_limited",
  over_request_rate_limit: "rate_limited",
  over_sms_send_rate_limit: "rate_limited",
  user_already_exists: "existing_account",
  email_exists: "existing_account",
  email_not_confirmed: "email_not_confirmed",
  invalid_credentials: "invalid_credentials",
  weak_password: "weak_password",
  validation_failed: "invalid_email",
  email_address_invalid: "invalid_email",
  otp_expired: "link_expired",
  bad_code_verifier: "link_expired",
};

export function classifyAuthError(err: unknown): ClassifiedAuthError {
  const e = (err ?? {}) as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
    name?: unknown;
  };
  const raw = typeof e.message === "string" ? e.message : String(err);
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;
  const retry = /after (\d+) seconds?/i.exec(raw);
  const retryAfterSeconds = retry ? Number(retry[1]) : null;

  const known = KEY_OF_CODE[code];
  if (known) return { kind: known, retryAfterSeconds, raw };
  if (status === 429 || /rate limit/i.test(raw))
    return { kind: "rate_limited", retryAfterSeconds, raw };
  if (/already registered|already exists/i.test(raw))
    return { kind: "existing_account", retryAfterSeconds, raw };
  if (/not confirmed/i.test(raw)) return { kind: "email_not_confirmed", retryAfterSeconds, raw };
  if (/invalid login credentials/i.test(raw))
    return { kind: "invalid_credentials", retryAfterSeconds, raw };
  if (e.name === "AuthRetryableFetchError" || /failed to fetch|network|load failed/i.test(raw))
    return { kind: "network", retryAfterSeconds, raw };
  return { kind: "unknown", retryAfterSeconds, raw };
}

/** The dictionary key for a kind. `rateLimitedSeconds` takes the seconds. */
export function authErrorKey(
  c: ClassifiedAuthError,
):
  | "auth.error.rateLimited"
  | "auth.error.rateLimitedSeconds"
  | "auth.error.existingAccount"
  | "auth.error.emailNotConfirmed"
  | "auth.error.invalidCredentials"
  | "auth.error.weakPassword"
  | "auth.error.emailInvalid"
  | "auth.error.linkExpired"
  | "auth.error.network"
  | "auth.error.unknown" {
  switch (c.kind) {
    case "rate_limited":
      return c.retryAfterSeconds ? "auth.error.rateLimitedSeconds" : "auth.error.rateLimited";
    case "existing_account":
      return "auth.error.existingAccount";
    case "email_not_confirmed":
      return "auth.error.emailNotConfirmed";
    case "invalid_credentials":
      return "auth.error.invalidCredentials";
    case "weak_password":
      return "auth.error.weakPassword";
    case "invalid_email":
      return "auth.error.emailInvalid";
    case "link_expired":
      return "auth.error.linkExpired";
    case "network":
      return "auth.error.network";
    default:
      return "auth.error.unknown";
  }
}

/** The confirmation-link error Supabase puts in the URL fragment when a link
 *  is opened late or twice: `#error=access_denied&error_code=otp_expired&…`.
 *  Read once and removed from the address bar. */
export function consumeAuthErrorFragment(): ClassifiedAuthError | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const code = params.get("error_code");
  const error = params.get("error");
  if (!code && !error) return null;
  const description = params.get("error_description") ?? error ?? "";
  try {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch {
    /* leave the fragment */
  }
  return classifyAuthError({ code: code ?? undefined, message: description.replace(/\+/g, " ") });
}
