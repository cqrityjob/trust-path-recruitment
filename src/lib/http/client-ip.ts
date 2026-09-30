// The client address a rate limit should key on.
//
// ── WHY NOT THE FIRST X-FORWARDED-FOR ENTRY ────────────────────────────
//
// Every hop APPENDS to X-Forwarded-For, so the first entry is whatever the
// caller sent — a fresh value per request defeats any per-client limit. The
// trustworthy values are the ones our own edge sets:
//
//   * `cf-connecting-ip` — set by Cloudflare (Lovable hosting) and overwritten
//     on every request, so a caller cannot choose it;
//   * otherwise the LAST X-Forwarded-For entry — the one the nearest reverse
//     proxy (e.g. a self-hosted node server behind nginx) appended itself.
//
// The value is only ever hashed into short-lived throttle buckets; it is not
// logged or stored as-is.

export function clientIpHint(headers: Headers | undefined | null): string {
  const cf = headers?.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const chain = (headers?.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return chain[chain.length - 1] || "unknown";
}
