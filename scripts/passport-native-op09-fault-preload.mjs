// Test-only Node preload. Exact native-origin and one explicit own DELETE only.
// This module is never imported by product code or a published runtime.
import fs from "node:fs";
import path from "node:path";
import { API, readPrivateJson, validUuid } from "./passport-native-op09-contract.mjs";

export function cleanupFaultFetch({ file }, originalFetch) {
  return async (input, init) => {
    const rawUrl =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      return originalFetch(input, init);
    }
    if (
      url.origin !== API ||
      url.pathname !== "/storage/v1/object/passport-evidence" ||
      (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase() !== "DELETE"
    )
      return originalFetch(input, init);
    const state = readPrivateJson(file);
    if (!state.armed) return originalFetch(input, init);
    if (!validUuid(state.ownerId) || !validUuid(state.attemptId) || state.injected !== 0)
      throw Error("OP09_NATIVE_INVALID_FAULT_INTENT");
    const request = new Request(input instanceof Request ? input.clone() : input, init);
    const body = await request.json();
    if (
      JSON.stringify(body.prefixes) !== JSON.stringify([`${state.ownerId}/${state.attemptId}.pdf`])
    )
      return originalFetch(input, init);
    // Disarm durably BEFORE returning the injected error. A page reload must
    // neither arm another failure nor silently retry cleanup on its own.
    fs.writeFileSync(file, JSON.stringify({ ...state, armed: false, injected: 1 }), {
      mode: 0o600,
    });
    return new Response(
      JSON.stringify({
        message: "Isolated explicit cleanup fault",
        statusCode: "503",
        error: "Injected",
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  };
}
if (process.env.RI_OP09_NATIVE_FAULT_FILE) {
  const stack = process.env.RI_OP09_NATIVE_STACK_ROOT;
  const file = process.env.RI_OP09_NATIVE_FAULT_FILE;
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.CI !== "true" ||
    process.env.RI_OP09_NATIVE_DISPOSABLE !== "1" ||
    !path.isAbsolute(stack ?? "") ||
    file !== path.join(stack, "supabase/.temp/cleanup-fault.json")
  )
    throw Error("OP09_NATIVE_FAULT_PRELOAD_REFUSED");
  readPrivateJson(file);
  globalThis.fetch = cleanupFaultFetch({ file }, globalThis.fetch.bind(globalThis));
}
