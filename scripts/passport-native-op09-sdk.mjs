// Bun invokes the exact reviewed app's TypeScript helper, with real fresh
// password sessions. No service-role test actor or direct Auth/claim SQL.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  API,
  readContext,
  readPrivateJson,
  validateStatus,
  rpcFailure,
  sdkSummary,
} from "./passport-native-op09-contract.mjs";
const context = readContext();
const temp = path.join(context.stackRoot, "supabase/.temp");
const status = validateStatus(readPrivateJson(path.join(temp, "status.json")));
const actors = readPrivateJson(path.join(temp, "actors.json"));
function client() {
  return createClient(API, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const target = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );
        if (target.origin !== API) throw Error("OP09_NATIVE_EXTERNAL_FETCH_REFUSED");
        try {
          return await fetch(input, {
            ...init,
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
          });
        } catch {
          throw Error("OP09_NATIVE_PRIVATE_TRANSPORT_FAILED");
        }
      },
    },
  });
}
function good(result, operation) {
  if (result.error) throw rpcFailure(operation, result);
  return result.data;
}
try {
  const owner = client(),
    other = client();
  for (const [alias, c] of [
    ["C1", owner],
    ["C2", other],
  ]) {
    const result = await c.auth.signInWithPassword({
      email: actors[alias].email,
      password: actors[alias].password,
    });
    if (result.error || result.data.user?.id !== actors[alias].id || !result.data.session)
      throw Error("OP09_NATIVE_ACTUAL_PASSWORD_SESSION_REQUIRED");
    const claims = JSON.parse(
      Buffer.from(result.data.session.access_token.split(".")[1], "base64url").toString(),
    );
    if (
      claims.sub !== actors[alias].id ||
      claims.role !== "authenticated" ||
      !claims.session_id ||
      new URL(claims.iss).origin !== API
    )
      throw Error("OP09_NATIVE_ACTUAL_SESSION_BINDING_REQUIRED");
  }
  const passport = good(
    await owner.rpc("sp_passport_ensure", { _question_version: "sp-q-v1" }),
    "sp_passport_ensure",
  );
  if (!Array.isArray(passport) || passport.length !== 1)
    throw Error("OP09_NATIVE_PASSPORT_RESPONSE_INVALID");
  const claimId = good(
    await owner.rpc("sp_save_international_credential", {
      _input: {
        definition_code: "INTL_ASIS_CPP",
        market_country: "",
        market_region: "",
        identifier: `OP09-SDK-${crypto.randomUUID()}`,
        issued_on: "2026-01-01",
        valid_until: "2028-01-01",
        no_expiry: false,
      },
    }),
    "sp_save_international_credential",
  );
  const { verifyIsolatedUploadRecovery } = await import(
    pathToFileURL(path.join(context.appRoot, "scripts/passport-upload-recovery-operational.ts"))
      .href
  );
  const result = await verifyIsolatedUploadRecovery({
    apiUrl: API,
    publicAnonKey: status.ANON_KEY,
    owner,
    otherHolder: other,
    ownerId: actors.C1.id,
    claimId,
  });
  fs.writeFileSync(path.join(temp, "sdk-result.json"), JSON.stringify(sdkSummary(result)), {
    mode: 0o600,
  });
  console.log("OP09_NATIVE_SDK_44_COMPLETED");
} catch (error) {
  const code = /^OP09_NATIVE_[A-Z0-9_]+$/.test(error?.message ?? "")
    ? error.message
    : "OP09_NATIVE_SDK_FAILED";
  const assertion = error?.message?.match(/^OP09_ASSERTION_FAILED:([a-z_]{1,100})$/)?.[1];
  const source = fs.readFileSync(
    path.join(context.appRoot, "scripts/passport-upload-recovery-operational.ts"),
    "utf8",
  );
  const knownAssertion = assertion && source.includes(`"${assertion}"`) ? assertion : undefined;
  fs.writeFileSync(
    path.join(temp, "sdk-failure.json"),
    JSON.stringify({
      code,
      ...(error?.safeDiagnostic ? { diagnostic: error.safeDiagnostic } : {}),
      ...(knownAssertion ? { assertion: knownAssertion } : {}),
    }),
    { mode: 0o600 },
  );
  console.error(code);
  process.exitCode = 1;
}
