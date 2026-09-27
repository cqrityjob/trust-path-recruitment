// Where a reader came from when they opened a profession.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
//
// A profession page is reached from many places — the list of all
// professions, the personal recommendation, "Vilket yrke arbetar du i i
// dag?", another profession's next steps, the career routes, the report, My
// Career — and its only way back used to be a breadcrumb to the top of the
// hub. A reader who had chosen their own profession on the hub lost that
// choice unless they knew to press the browser's Back.
//
// The browser's Back still works and is still the primary mechanism: every
// hub view is a URL. This adds a VISIBLE way back that names where it goes
// ("Tillbaka till ditt nuvarande yrke", "Tillbaka till Väktare") and
// restores the same URL, chosen profession and section included.
//
// ── WHY sessionStorage AND NOT THE URL ─────────────────────────────────
//
// A profession guide has one canonical URL, shared and indexed. Carrying
// the hub's state in it would mint a new URL per combination for the same
// guide. The return context is a per-tab convenience, so it lives in per-tab
// storage, keyed by the profession page it was written for — a stale context
// written for a DIFFERENT profession is never used. Every read and write
// tolerates storage being unavailable.
//
// ── ONE ENTRY PER PAGE, SO A CHAIN UNWINDS ─────────────────────────────
//
// It used to be one slot. Hub → Väktare → Ordningsvakt wrote Ordningsvakt's
// context over Väktare's, so "Tillbaka till Väktare" worked once and Väktare
// then offered only the generic breadcrumb: the reader's way back to their
// own chosen profession on the hub was gone. Each profession page now keeps
// its own entry (the most recent few, bounded), so the chain unwinds the way
// it was walked. A move from one profession to another also records the
// origin's name, so the way back can say where it goes: "Tillbaka till
// Väktare".

export type ReturnOrigin =
  | "catalogue"
  | "recommendation"
  | "current_role"
  | "routes"
  | "report"
  | "my_career"
  | "profession";

const KEY = "cqrityjob.career-center.return";
/** Entries kept per tab. A reader does not unwind further than this. */
const MAX_ENTRIES = 12;
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
  /** The profession the way back leads to, when it leads to one. */
  readonly title?: { readonly sv: string; readonly en: string };
}

interface StoredEntry {
  readonly origin: unknown;
  readonly href: unknown;
  readonly titleSv?: unknown;
  readonly titleEn?: unknown;
  readonly at?: unknown;
}

/** Only same-site absolute paths are ever navigated to. */
function isSafeHref(href: unknown): href is string {
  return (
    typeof href === "string" && href.startsWith("/") && !href.startsWith("//") && href.length < 600
  );
}

function isShortText(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= 120;
}

/** The stored entries, whatever shape an earlier version of this module left
 *  in the tab: the single-slot `{ target, origin, href }` becomes one entry. */
function loadEntries(): Record<string, StoredEntry> {
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as {
    v?: unknown;
    entries?: unknown;
    target?: unknown;
    origin?: unknown;
    href?: unknown;
  };
  if (parsed?.v === 2 && parsed.entries && typeof parsed.entries === "object") {
    return parsed.entries as Record<string, StoredEntry>;
  }
  if (typeof parsed?.target === "string") {
    return { [parsed.target]: { origin: parsed.origin, href: parsed.href, at: 0 } };
  }
  return {};
}

/** The current location as a return href, with the section to land on. */
export function currentHrefWithHash(hash: string): string {
  if (typeof window === "undefined") return `/career-center#${hash}`;
  return `${window.location.pathname}${window.location.search}#${hash}`;
}

/** Record where the reader is, for the profession page at `targetPath`.
 *  `title` names the page the way back leads to, when that is a profession. */
export function rememberReturn(
  targetPath: string,
  origin: ReturnOrigin,
  href: string,
  title?: { readonly sv: string; readonly en: string },
): void {
  if (!isSafeHref(targetPath) || !isSafeHref(href)) return;
  try {
    let entries: Record<string, StoredEntry> = {};
    try {
      entries = loadEntries();
    } catch {
      // Unreadable: start over rather than refuse to record anything.
    }
    entries[targetPath] = {
      origin,
      href,
      at: Date.now(),
      ...(title && isShortText(title.sv) && isShortText(title.en)
        ? { titleSv: title.sv, titleEn: title.en }
        : {}),
    };
    const newestFirst = Object.keys(entries).sort(
      (a, b) => Number(entries[b]?.at ?? 0) - Number(entries[a]?.at ?? 0),
    );
    for (const stale of newestFirst.slice(MAX_ENTRIES)) delete entries[stale];
    window.sessionStorage.setItem(KEY, JSON.stringify({ v: 2, entries }));
  } catch {
    // Storage unavailable (private mode, blocked): the breadcrumb default
    // and the browser's Back still work.
  }
}

/** The return context written for exactly this profession page, if any. */
export function readReturn(targetPath: string): ReturnContext | null {
  try {
    const entry = loadEntries()[targetPath];
    if (!entry) return null;
    if (!ORIGINS.includes(entry.origin as ReturnOrigin)) return null;
    if (!isSafeHref(entry.href)) return null;
    const title =
      isShortText(entry.titleSv) && isShortText(entry.titleEn)
        ? { sv: entry.titleSv, en: entry.titleEn }
        : undefined;
    return { origin: entry.origin as ReturnOrigin, href: entry.href, ...(title ? { title } : {}) };
  } catch {
    return null;
  }
}
