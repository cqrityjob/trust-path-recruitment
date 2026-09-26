// Where a reader came from when they opened a profession.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
//
// A profession page is reached from five places — the catalogue (often
// filtered), the personal recommendation, "Vägar från ditt yrke", the career
// routes, the report — and its only way back used to be a breadcrumb to the
// top of the hub. A reader who had narrowed the catalogue to entry-level
// guarding roles lost that view unless they knew to press the browser's Back.
//
// The browser's Back still works and is still the primary mechanism: every
// hub view is a URL. This adds a VISIBLE way back that names where it goes
// ("Tillbaka till yrkeskatalogen") and restores the same URL, filters and
// section included.
//
// ── WHY sessionStorage AND NOT THE URL ─────────────────────────────────
//
// A profession guide has one canonical URL, shared and indexed. Carrying
// the hub's filters in it would mint a new URL per filter combination for
// the same guide. The return context is a per-tab convenience, so it lives
// in per-tab storage, keyed by the profession page it was written for — a
// stale context from an earlier visit to a DIFFERENT profession is never
// used. Every read and write tolerates storage being unavailable.

export type ReturnOrigin =
  | "catalogue"
  | "recommendation"
  | "current_role"
  | "routes"
  | "report"
  | "my_career"
  | "profession";

const KEY = "cqrityjob.career-center.return";
const ORIGINS: readonly ReturnOrigin[] = [
  "catalogue",
  "recommendation",
  "current_role",
  "routes",
  "report",
  "my_career",
  "profession",
];

export interface ReturnContext {
  readonly origin: ReturnOrigin;
  /** Same-origin path + search + hash. */
  readonly href: string;
}

/** Only same-site absolute paths are ever navigated to. */
function isSafeHref(href: unknown): href is string {
  return (
    typeof href === "string" && href.startsWith("/") && !href.startsWith("//") && href.length < 600
  );
}

/** The current location as a return href, with the section to land on. */
export function currentHrefWithHash(hash: string): string {
  if (typeof window === "undefined") return `/career-center#${hash}`;
  return `${window.location.pathname}${window.location.search}#${hash}`;
}

/** Record where the reader is, for the profession page at `targetPath`. */
export function rememberReturn(targetPath: string, origin: ReturnOrigin, href: string): void {
  if (!isSafeHref(targetPath) || !isSafeHref(href)) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ target: targetPath, origin, href }));
  } catch {
    // Storage unavailable (private mode, blocked): the breadcrumb default
    // and the browser's Back still work.
  }
}

/** The return context written for exactly this profession page, if any. */
export function readReturn(targetPath: string): ReturnContext | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { target?: unknown; origin?: unknown; href?: unknown };
    if (parsed.target !== targetPath) return null;
    if (!ORIGINS.includes(parsed.origin as ReturnOrigin)) return null;
    if (!isSafeHref(parsed.href)) return null;
    return { origin: parsed.origin as ReturnOrigin, href: parsed.href };
  } catch {
    return null;
  }
}
