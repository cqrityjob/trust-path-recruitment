// Classifying why an Academy database call failed.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────
//
// The Assessment Center UI is released ahead of its migrations, so there is a
// real window in which the frontend is live and the RPCs it calls do not yet
// exist. PostgREST reports that as PGRST202 ("Could not find the function
// ... in the schema cache") or PGRST205 for a missing relation.
//
// Without this distinction every failure looks the same to the UI, and the
// honest message -- "this area is not available yet" -- is indistinguishable
// from "something went wrong". Getting it wrong in either direction is bad: a
// user told to retry forever, or a genuine outage described as planned work.
//
// What is NEVER surfaced is the database's own sentence. Function names,
// schema names and PostgREST codes go to the console for developers; the user
// sees a plain explanation and a retry.

export type AcademyErrorKind =
  /** The RPC or view does not exist yet -- migrations are behind the frontend. */
  | "backend_unavailable"
  /** The caller is not permitted. Not retryable. */
  | "not_permitted"
  /** Anything else: transient network, timeout, unexpected database error. */
  | "request_failed";

export type ClassifiedError = {
  kind: AcademyErrorKind;
  /** The database's identifier when it gave one, for logs only. */
  code: string | null;
  /** The original message. LOGS ONLY -- never render this. */
  detail: string;
};

const MISSING_OBJECT = [
  "PGRST202", // function not found in schema cache
  "PGRST205", // relation not found in schema cache
  "could not find the function",
  "could not find the table",
  "does not exist",
];

const NOT_PERMITTED = [
  "permission denied",
  "insufficient_privilege",
  "SCP_NOT_AUTHORISED",
  "SCP_NOT_A_REVIEWER",
];

export function classifyAcademyError(err: unknown): ClassifiedError {
  const detail =
    err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err ?? {});
  const haystack = detail.toLowerCase();
  const code = /(?:PGRST\d{3}|SCP_[A-Z_]+)/.exec(detail)?.[0] ?? null;

  if (MISSING_OBJECT.some((m) => haystack.includes(m.toLowerCase()))) {
    return { kind: "backend_unavailable", code, detail };
  }
  if (NOT_PERMITTED.some((m) => haystack.includes(m.toLowerCase()))) {
    return { kind: "not_permitted", code, detail };
  }
  return { kind: "request_failed", code, detail };
}

/** One structured line per failure, for developers. The user-facing component
 *  never receives `detail`, so this is the only place it appears. */
export function logAcademyError(surface: string, err: unknown): ClassifiedError {
  const c = classifyAcademyError(err);
  // eslint-disable-next-line no-console -- deliberate: this is the developer signal.
  console.error("[academy]", {
    surface,
    kind: c.kind,
    code: c.code,
    detail: c.detail,
    hint:
      c.kind === "backend_unavailable"
        ? "The Assessment Center migrations are not fully applied to this database."
        : undefined,
  });
  return c;
}
