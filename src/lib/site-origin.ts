// The one place that says what this site is called to the outside world.
//
// ── WHY ONE MODULE ─────────────────────────────────────────────────────
//
// The product launched on a Lovable-assigned address
// (`trust-path-recruitment.lovable.app`) and that address was written out by
// hand in every public route's canonical and og:url, in the sitemap, in
// robots.txt, in the share and invitation links and in the e-mail link base.
// The production domain is https://www.cqrityjob.com, so a search engine was
// told that the old host is the real one and a shared link led there.
//
// Every public address now comes from here. `scripts/site-origin-check.ts`
// fails the build if a Lovable host is written into user-facing code again.
//
// ── WHAT THIS DELIBERATELY DOES NOT TOUCH ─────────────────────────────
//
// * Technical integration addresses: the Supabase project origin, the Lovable
//   OAuth broker and the preview-zone detection in the generated Supabase
//   client. They are not the site's public name.
// * Local development and test hosts. `shareableOrigin()` keeps a loopback
//   address as it is, so a developer's invitation link opens on the
//   developer's machine and the browser walks stay self-contained.
// * Auth return addresses. Those are built from the origin the visitor is on
//   (`window.location.origin`) and are allowed or refused by the Auth
//   provider's redirect allow-list, which is configuration, not code.

/** The production domain. Always `www`: the apex redirects to it. */
export const PRODUCTION_ORIGIN = "https://www.cqrityjob.com";

/** An absolute address on the production domain: `siteUrl("/jobs")`. */
export function siteUrl(path: string = "/"): string {
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return `${PRODUCTION_ORIGIN}${normalised}`;
}

/** `localhost`, `127.0.0.1` and `[::1]` — a developer machine or an isolated
 *  test stack, never a place a stranger can open a link. */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/**
 * The origin a link meant for ANOTHER person is built on — an invitation, a
 * share, a copied "send this to your colleague" address.
 *
 * Another person cannot open `localhost`, and should not be handed the old
 * published address or an ephemeral preview host either. So: a loopback origin
 * stays as it is (local development and the isolated test stacks keep working),
 * and every other origin becomes the production domain.
 *
 * `currentOrigin` is `window.location.origin` in a browser. It is a parameter
 * rather than read here so the same function is testable and works on the
 * server.
 */
export function shareableOrigin(currentOrigin?: string): string {
  if (currentOrigin && isLoopbackOrigin(currentOrigin)) return currentOrigin;
  return PRODUCTION_ORIGIN;
}

/** `shareableOrigin()` + a path, for a link another person will open. */
export function shareableUrl(path: string, currentOrigin?: string): string {
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return `${shareableOrigin(currentOrigin)}${normalised}`;
}

/** Hosts the platform assigns for editing and previewing. They are never an
 *  address a customer should be sent to, whatever a host setting says. */
const PLATFORM_ASSIGNED_HOST = /(^|\.)(lovable\.app|lovableproject\.com|lovableproject-dev\.com)$/i;

/**
 * The origin server-side code builds a link on when the link goes into an
 * e-mail or a stored message: a receipt, an invitation, a registration notice.
 *
 * `configured` is the deployment's `PUBLIC_SITE_URL`. It lets a real staging
 * host or an isolated test stack name itself, and it is honoured when it is a
 * clean https origin (or a loopback address). It is IGNORED, and the production
 * domain is used, when it is empty, malformed, plain http on a public host, or
 * one of the platform-assigned hosts: the value an owner was once told to set
 * (`*.lovable.app`) must not outlive the move to www.cqrityjob.com, because a
 * link in a mail that has been sent cannot be corrected afterwards.
 *
 * The result is always `new URL().origin`, so a trailing slash, a path or a
 * missing scheme in the setting never reaches a link.
 */
export function serverSiteOrigin(configured?: string | null): string {
  const raw = (configured ?? "").trim();
  if (!raw) return PRODUCTION_ORIGIN;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackOrigin(url.origin))) {
      return PRODUCTION_ORIGIN;
    }
    if (PLATFORM_ASSIGNED_HOST.test(url.hostname)) return PRODUCTION_ORIGIN;
    return url.origin;
  } catch {
    return PRODUCTION_ORIGIN;
  }
}
