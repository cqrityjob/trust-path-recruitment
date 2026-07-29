// Canonical route constants for Security Career Discovery.
//
// One place decides where the product lives, so the temporary /discovery
// alias and the canonical route can never drift apart, and so a redirect
// can never be pointed at itself.

/** The canonical public entry point. Unchanged from the legacy instrument
 *  so existing CTAs, the sitemap and search equity all carry over. */
export const CANONICAL_ASSESSMENT_PATH = "/security-career-assessment" as const;
export const CANONICAL_SESSION_PATH = "/security-career-assessment/session" as const;
export const CANONICAL_REPORT_PATH = "/security-career-assessment/report/$snapshotId" as const;
export const CANONICAL_HISTORY_PATH = "/security-career-assessment/history" as const;

/** Temporary internal alias from the implementation phase. Every one of
 *  these redirects to its canonical counterpart. None may ever be a
 *  redirect target, which is what makes a loop impossible. */
export const ALIAS_ASSESSMENT_PATH = "/discovery" as const;
export const ALIAS_SESSION_PATH = "/discovery/session" as const;
export const ALIAS_HISTORY_PATH = "/discovery/history" as const;

/** Guard used by the tests: an alias must never point at another alias. */
export function isAliasPath(path: string): boolean {
  return path === ALIAS_ASSESSMENT_PATH || path.startsWith(ALIAS_ASSESSMENT_PATH + "/");
}

export function isCanonicalPath(path: string): boolean {
  return path === CANONICAL_ASSESSMENT_PATH || path.startsWith(CANONICAL_ASSESSMENT_PATH + "/");
}
