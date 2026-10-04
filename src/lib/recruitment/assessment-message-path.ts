import { PRODUCTION_ORIGIN } from "@/lib/site-origin";

/** Only the application's own assessment destinations become actions. Message
 * content remains React text; neither HTML nor arbitrary URLs are trusted. */
export function assessmentMessagePath(value: string): string | null {
  try {
    const url = new URL(value);
    const allowedHost = new URL(PRODUCTION_ORIGIN).hostname;
    if (
      url.protocol !== "https:" ||
      ![allowedHost, allowedHost.replace(/^www\./, "")].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      return null;
    return /^\/academy(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\/?$/i.test(
      url.pathname,
    )
      ? url.pathname
      : null;
  } catch {
    return null;
  }
}
