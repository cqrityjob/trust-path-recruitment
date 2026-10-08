// Genuine caller-authenticated setup for a newly created synthetic holder.
// No admin client, direct fixture DML, grant change or Storage write is used.
const operations = new Set([
  "real-password-login",
  "ensure-own-passport",
  "create-own-synthetic-credential",
  "list-own-object",
  "real-global-signout",
  "actor-session",
  "control-same-session",
  "own-cleanup-read",
  "own-cleanup-withdrawal",
  "own-cleanup-remove",
]);
const domainCodes = new Set([
  "SP_NO_PASSPORT",
  "SP_NOT_AUTHENTICATED",
  "SP_SESSION_REVOKED",
  "SP_APPROVED_DEFINITION_REQUIRED",
  "SP_DEFINITION_NOT_AVAILABLE_IN_MARKET",
  "SP_CREDENTIAL_REQUIRES_ISSUER",
  "SP_INVALID_CREDENTIAL_INPUT",
  "SP_INVALID_CREDENTIAL_DATE",
  "SP_INVALID_DATES",
  "SP_CREDENTIAL_REQUIRES_VALID_UNTIL",
]);

/** Fixed, auth-free diagnostic taxonomy. Raw errors/messages never escape. */
export function storageFailureSummary(operation, result) {
  const status = result?.status ?? result?.error?.status;
  return {
    operation: operations.has(operation) ? operation : "unclassified",
    httpStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0,
    sqlState: /^[A-Z0-9]{5}$/.test(result?.error?.code ?? "") ? result.error.code : "unclassified",
    domainCode: domainCodes.has(result?.error?.message) ? result.error.message : "unclassified",
  };
}

export async function prepareNativeStorageClaim(holder, identifier, check) {
  // Fresh GoTrue users do not already have a Passport. The save RPC requires
  // it; create the caller's profile and receipt through the ordinary own RPC.
  const passport = check(
    await holder.rpc("sp_passport_ensure", { _question_version: "sp-q-v1" }),
    "ensure-own-passport",
  );
  if (!Array.isArray(passport) || passport.length !== 1)
    throw Error("REAL_CI_STORAGE_PASSPORT_RESPONSE_INVALID");
  return check(
    await holder.rpc("sp_save_international_credential", {
      _input: {
        definition_code: "INTL_ASIS_CPP",
        market_country: "",
        market_region: "",
        identifier,
        issued_on: "2026-01-01",
        valid_until: "2028-01-01",
        no_expiry: false,
      },
    }),
    "create-own-synthetic-credential",
  );
}
