/**
 * Egress rules for the feed connector. Pure. A request may only go to an
 * https URL with no credentials and the default port, on a host the platform
 * approved, and every address that host resolves to must be public global
 * unicast. Addresses are parsed by ipaddr.js (IPv4-mapped and expanded IPv6
 * forms are normalised first); loopback, private, link-local (the
 * 169.254.169.254 metadata service included), carrier-grade NAT, unspecified,
 * broadcast, multicast, reserved, unique-local, NAT64/6to4/Teredo, IPv4-
 * compatible and site-local forms are refused, and so is anything that does
 * not parse or carries a zone. The connection is then pinned to the checked
 * address (see pinned-https.server.ts); each redirect hop is checked again.
 */
import ipaddr from "ipaddr.js";

export class EgressError extends Error {
  constructor(
    readonly code:
      | "egress_scheme"
      | "egress_credentials"
      | "egress_port"
      | "egress_ip_literal"
      | "egress_host_not_approved"
      | "egress_private_address"
      | "egress_unresolved"
      | "egress_dns_timeout"
      | "egress_transport_unavailable",
  ) {
    super(code);
  }
}

/** The canonical public address, or null for anything a fetch must never reach. */
export function publicAddress(address: string): { address: string; family: 4 | 6 } | null {
  const value = address.trim().replace(/^\[|\]$/g, "");
  if (!value || value.includes("%") || !ipaddr.isValid(value)) return null;
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.process(value);
  } catch {
    return null;
  }
  if (parsed.range() !== "unicast") return null;
  if (parsed.kind() === "ipv4") {
    const [a, b] = (parsed as ipaddr.IPv4).octets;
    if (a === 198 && (b === 18 || b === 19)) return null; // benchmarking
    return { address: parsed.toString(), family: 4 };
  }
  // ipaddr.js calls IPv4-compatible (::a.b.c.d) and fec0::/10 "unicast";
  // only 2000::/3 is global unicast.
  if (!(parsed as ipaddr.IPv6).match(ipaddr.IPv6.parse("2000::"), 3)) return null;
  return { address: parsed.toString(), family: 6 };
}

/** True for any address a server-side fetch must never reach. Unknown forms count as private. */
export function isPrivateAddress(address: string): boolean {
  return publicAddress(address) === null;
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
  if (ipaddr.isValid(host.replace(/^\[|\]$/g, "")) || host.includes(":") || host.startsWith("["))
    throw new EgressError("egress_ip_literal");
  if (!approvedHosts.includes(host)) throw new EgressError("egress_host_not_approved");
  return url;
}

/**
 * Every resolved address must be public; an empty answer is refused too, and
 * one private answer refuses the whole host. Returns the canonical addresses
 * the connection may be pinned to.
 */
export function checkResolved(addresses: readonly string[]): { address: string; family: 4 | 6 }[] {
  if (!addresses.length) throw new EgressError("egress_unresolved");
  const checked = addresses.map(publicAddress);
  if (checked.some((entry) => entry === null)) throw new EgressError("egress_private_address");
  return checked as { address: string; family: 4 | 6 }[];
}
