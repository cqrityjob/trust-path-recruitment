// HAYAT — fetching from a source without being steered by the document.
//
// A credential can carry a URL: a status list, a key, a JSON-LD context. Every
// one of them is written by whoever made the credential, which for a forged
// credential is the forger. Following such a URL from a server is how
// "verify my badge" becomes "please GET http://169.254.169.254/".
//
// So the rule is not a block-list of bad addresses. It is an ALLOW-list:
//
//   a URL is fetched only if its host is, character for character, a host the
//   governed issuer policy names -- and the policy is chosen by the VERIFIED
//   issuer, never by the URL.
//
// Everything else here is belt and braces around that: https only, no
// credentials, no explicit port, no IP literals in any spelling, redirects
// never followed, a hard timeout and a hard size cap.
//
// What this cannot do on Cloudflare Workers is resolve DNS itself, so it
// cannot pin the resolved address against rebinding. The allow-list is what
// carries that risk: a host is only ever listed after review, and a listed
// host that starts resolving to a private address is a compromised issuer.

export type FetchRefusal =
  | "not_https"
  | "has_credentials"
  | "explicit_port"
  | "ip_literal"
  | "local_name"
  | "host_not_allowed"
  | "malformed";

export type SafeFetchResult =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly kind: "refused"; readonly refusal: FetchRefusal }
  /** `status` is set when the source ANSWERED with something other than 200 --
   *  a 404 or a 410 is information; a timeout is not. */
  | { readonly ok: false; readonly kind: "unavailable"; readonly status?: number };

export interface SafeFetchOptions {
  readonly allowedHosts: readonly string[];
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly fetchImpl?: typeof fetch;
}

const IPV4_ANY_SPELLING = /^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+)){0,3}$/i;
const LOCAL_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".arpa"];

/** Returns the refusal, or null when the URL may be fetched. Never fetches. */
export function refuseUrl(raw: string, allowedHosts: readonly string[]): FetchRefusal | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "malformed";
  }
  if (url.protocol !== "https:") return "not_https";
  if (url.username || url.password) return "has_credentials";
  if (url.port) return "explicit_port";
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // Bracketed IPv6, dotted/decimal/hex/octal IPv4 -- no spelling of an address.
  if (host.startsWith("[") || host.includes(":") || IPV4_ANY_SPELLING.test(host))
    return "ip_literal";
  if (host === "localhost" || !host.includes(".") || LOCAL_SUFFIXES.some((s) => host.endsWith(s)))
    return "local_name";
  if (!allowedHosts.map((h) => h.toLowerCase()).includes(host)) return "host_not_allowed";
  return null;
}

export async function safeFetchJson(
  raw: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const refusal = refuseUrl(raw, options.allowedHosts);
  if (refusal) return { ok: false, kind: "refused", refusal };
  const maxBytes = options.maxBytes ?? 262_144;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(raw, {
      method: "GET",
      // A redirect is a second URL nobody reviewed. It is not followed, and it
      // is not an answer: the source is simply unavailable.
      redirect: "manual",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status !== 200) return { ok: false, kind: "unavailable", status: response.status };
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > maxBytes) return { ok: false, kind: "unavailable" };
    const reader = response.body?.getReader();
    if (!reader) return { ok: false, kind: "unavailable" };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, kind: "unavailable" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, body: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    // Timeout, network failure, invalid JSON: all "the source did not answer".
    return { ok: false, kind: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
