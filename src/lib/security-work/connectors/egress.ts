/**
 * Egress rules for the feed connector. Pure. A request may only go to an
 * https URL with no credentials and the default port, on a host the platform
 * approved, and every address that host resolves to must be public: no
 * loopback, private, link-local (including the 169.254.169.254 metadata
 * service), carrier-grade NAT, multicast, unique-local or mapped forms of
 * them. Each redirect hop is checked again by the caller.
 */
export class EgressError extends Error {
  constructor(
    readonly code:
      | "egress_scheme"
      | "egress_credentials"
      | "egress_port"
      | "egress_ip_literal"
      | "egress_host_not_approved"
      | "egress_private_address"
      | "egress_unresolved",
  ) {
    super(code);
  }
}

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? numbers : null;
}

function privateV4([a, b]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** True for any address a server-side fetch must never reach. Unknown forms count as private. */
export function isPrivateAddress(address: string): boolean {
  const value = address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .split("%")[0];
  const v4 = ipv4Parts(value);
  if (v4) return privateV4(v4);
  if (!value.includes(":")) return true;
  if (value === "::" || value === "::1") return true;
  const mapped = /^(?:0*:)*:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped) {
    const parts = ipv4Parts(mapped[1]);
    return parts ? privateV4(parts) : true;
  }
  const first = parseInt(value.split(":")[0] || "0", 16);
  if (!Number.isFinite(first)) return true;
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link local
    (first & 0xff00) === 0xff00 || // multicast
    first === 0x64 || // 64:ff9b::/96 NAT64 can reach anything
    (first === 0x2001 && parseInt(value.split(":")[1] || "0", 16) === 0x0db8) // documentation
  );
}

/** Validates the URL and returns its host. Throws EgressError. */
export function checkFeedUrl(raw: string, approvedHosts: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EgressError("egress_scheme");
  }
  if (url.protocol !== "https:") throw new EgressError("egress_scheme");
  if (url.username || url.password) throw new EgressError("egress_credentials");
  if (url.port && url.port !== "443") throw new EgressError("egress_port");
  const host = url.hostname.toLowerCase();
  if (ipv4Parts(host) || host.includes(":") || host.startsWith("["))
    throw new EgressError("egress_ip_literal");
  if (!approvedHosts.includes(host)) throw new EgressError("egress_host_not_approved");
  return url;
}

/** Every resolved address must be public; an empty answer is refused too. */
export function checkResolved(addresses: readonly string[]): void {
  if (!addresses.length) throw new EgressError("egress_unresolved");
  if (addresses.some(isPrivateAddress)) throw new EgressError("egress_private_address");
}
