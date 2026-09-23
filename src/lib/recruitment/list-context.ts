// Where the recruiter came from, so they can go back to exactly it.
//
// A candidate list writes its current ORDER, its own address (path + filters +
// sorting) and its scroll position under a short key when a row is opened. The
// candidate view carries only that key in its URL (`?list=`), reads the order
// back to offer previous/next, and returns to the stored address, where the
// list restores its scroll position once.
//
// sessionStorage, deliberately: it survives a reload and the tab's own
// history, and dies with the tab. The key is not a secret and the ids are ids
// the reader is already authorised to see.
//
// A candidate view reached WITHOUT a key -- the way back from an assessment
// report or an interview, which do not carry it -- recalls the list this tab
// last opened, but only if that list contains this very candidate. A pasted
// link or a new tab has no such list, offers no previous/next, and goes back to
// the recruitment's candidate list, which is always correct.

export type ListContext = {
  ids: string[];
  href: string;
  scrollY: number;
  labelKey: "recruitment" | "applications";
  restorePending: boolean;
};

const PREFIX = "cqj.recruitment.list.";

export function listKeyFor(href: string): string {
  // A short, stable key per list address. Not a hash for security; only to
  // keep the URL short and the same list reusing the same slot.
  let h = 0;
  for (let i = 0; i < href.length; i++) h = (Math.imul(31, h) + href.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const LAST = "cqj.recruitment.list-last";

export function saveListContext(key: string, ctx: ListContext): void {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(ctx));
    window.sessionStorage.setItem(LAST, key);
  } catch {
    /* storage unavailable: previous/next is a convenience, never required */
  }
}

export function readListContext(key: string | undefined): ListContext | null {
  if (!key) return null;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ListContext;
    if (!Array.isArray(parsed.ids) || typeof parsed.href !== "string") return null;
    // Only same-origin paths, never an absolute URL somebody planted.
    if (!parsed.href.startsWith("/employer/")) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The key of the list this tab last opened a candidate from, when that list
 *  holds `applicationId`; otherwise undefined. */
export function recallListKeyFor(applicationId: string): string | undefined {
  try {
    const key = window.sessionStorage.getItem(LAST) ?? undefined;
    const ctx = readListContext(key);
    return ctx && ctx.ids.includes(applicationId) ? key : undefined;
  } catch {
    return undefined;
  }
}

/** Called by the list on mount: scroll back once to where the reader left. */
export function consumeScrollRestore(key: string): number | null {
  const ctx = readListContext(key);
  if (!ctx || !ctx.restorePending) return null;
  saveListContext(key, { ...ctx, restorePending: false });
  return ctx.scrollY;
}

export function markReturning(key: string): void {
  const ctx = readListContext(key);
  if (ctx) saveListContext(key, { ...ctx, restorePending: true });
}
