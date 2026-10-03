// What a failed application submission tells us about the COMMIT.
//
// The submission RPC (rec_submit_application) is one database transaction. An
// error that carries a five-character SQLSTATE is the DATABASE's verdict on it
// -- a unique violation, a check failure, a raised exception, a cancelled
// statement -- and means the transaction did not commit. An error with no
// SQLSTATE is not a verdict at all: a timeout, a dropped connection, a gateway
// 5xx, a PostgREST code (PGRST...). The request may have reached the database,
// committed, and lost only its answer. Connection-loss classes (08xxx, 57P0x)
// say the same.
//
// submitJobApplication() has just uploaded the candidate's CV, and removes it
// when the submission fails. That is right when nothing committed and
// destructive when something did: the application then keeps a cv_storage_path
// to an object that is gone, and the retry's replay shortcut answers
// "submitted" for an application with no CV. So it asks first. Pure, so a guard
// can exhaust it.

export function isAmbiguousSubmissionFailure(
  err: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  const code = typeof err?.code === "string" ? err.code : "";
  if (!/^[0-9A-Z]{5}$/.test(code)) return true;
  return code.startsWith("08") || code.startsWith("57P0");
}
