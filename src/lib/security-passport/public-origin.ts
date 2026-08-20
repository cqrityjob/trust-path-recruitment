// Security Passport — the origin an externally shared link must carry.
//
// ── THE BUG THIS EXISTS TO PREVENT ─────────────────────────────────────
//
// The sharing centre used to build its link as
// `${window.location.origin}/p/${token}`. That is correct exactly when the
// holder happens to be sitting on the canonical production host, and wrong
// every other time: on a Lovable preview build it produces
// `https://preview--<something>.lovable.app/p/<token>`, and on a developer
// machine `http://localhost:8080/p/<token>`.
//
// A share link is not an in-app navigation. It is pasted into LinkedIn, sent
// by email and opened weeks later by a stranger. A link carrying an ephemeral
// preview host is not a durable public address: the Product Owner's LinkedIn
// test produced `preview--<id>.lovable.app/p/<token>` and no preview, and a
// recipient handed that URL is holding one that dies with the deployment.
//
// So the external origin is CONFIGURATION, never a reading of the current
// browser location. `window.location` is deliberately not consulted here:
// that is the whole point of the module.
//
// ── WHY A CONSTANT WITH AN ENV OVERRIDE ────────────────────────────────
//
// `VITE_PUBLIC_SITE_URL` lets a real deployment (a custom domain, a staging
// host that is genuinely public) state its own canonical origin without a
// code change. When it is unset the value falls back to the same canonical
// origin `src/routes/sitemap[.]xml.ts` and `src/lib/job-intelligence/seo.ts`
// already hardcode, so nothing silently disagrees about what this site is
// called.
//
// It is read through `import.meta.env` rather than `process.env` because the
// sharing centre builds the link in the browser, where `process` does not
// exist. Vite inlines `VITE_`-prefixed values at build time, which is what
// makes the same constant available on both tiers.

/** The canonical public origin, matching sitemap[.]xml.ts and seo.ts. */
const FALLBACK_ORIGIN = "https://trust-path-recruitment.lovable.app";

/** Hosts that must never appear in a link handed to a third party. A share
 *  URL on one of these is unreachable for a crawler and short-lived for a
 *  recipient, which is precisely the failure this module was written for. */
function isEphemeralHost(origin: string): boolean {
  return (
    /^https?:\/\/preview--/i.test(origin) ||
    /^https?:\/\/localhost(:|$)/i.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:|$)/i.test(origin)
  );
}

/**
 * The origin every externally shared Passport URL is built on.
 *
 * Always configuration, never `window.location.origin`. An override that is
 * itself an ephemeral preview or loopback host is refused rather than
 * honoured — misconfiguring it must not reintroduce the original bug.
 */
export function publicShareOrigin(): string {
  const configured = import.meta.env?.VITE_PUBLIC_SITE_URL;
  if (typeof configured === "string" && configured.trim() !== "") {
    const trimmed = configured.trim().replace(/\/+$/, "");
    if (/^https?:\/\//i.test(trimmed) && !isEphemeralHost(trimmed)) return trimmed;
  }
  return FALLBACK_ORIGIN;
}

/** The full public verification URL for one share token. The single place
 *  this shape is built, so the sharing centre and the single-credential
 *  share cannot drift apart. */
export function publicShareUrl(token: string): string {
  return `${publicShareOrigin()}/p/${token}`;
}
