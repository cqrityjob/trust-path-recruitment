import { URL } from "node:url";
import { FixtureStop, HOSTED_TARGET, LOCAL_CONTRACT_TARGET, assertTarget } from "./core.mjs";

export function adminOnlyFetch(target, actorIds, network = globalThis.fetch) {
  assertTarget(target, target.kind === "local_contract" ? LOCAL_CONTRACT_TARGET : HOSTED_TARGET);
  const readPaths = new Set(actorIds.map((id) => `/auth/v1/admin/users/${id}`));
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const base = new URL(target.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const isCreate = method === "POST" && url.pathname === "/auth/v1/admin/users";
    const isRead = method === "GET" && readPaths.has(url.pathname);
    if (
      url.origin !== base.origin ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      (!isCreate && !isRead)
    ) {
      throw new FixtureStop("OUTBOUND_REQUEST_DENIED");
    }
    // Redirects must never forward a server credential. No automatic retry is added by this adapter.
    return network(input, {
      ...init,
      redirect: "error",
      signal: globalThis.AbortSignal.timeout(30_000),
    });
  };
}

export async function officialAdmin(target, actorIds, serverKey) {
  // Dynamic import keeps plan/dry-run completely independent of network clients and credentials.
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(target.url, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: adminOnlyFetch(target, actorIds) },
  });
  return {
    createUser: (attributes) => client.auth.admin.createUser(attributes),
    getUserById: (id) => client.auth.admin.getUserById(id),
  };
}
