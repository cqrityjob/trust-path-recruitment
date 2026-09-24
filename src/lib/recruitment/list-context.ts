// Where the recruiter came from, so they can go back to exactly it.
//
// A candidate list writes its own DEFINITION -- the vacancy, the filters and
// the sort (`query`) -- its address (path + filters + sorting) and its scroll
// position under a short key when a row is opened. The candidate view carries
// only that key in its URL (`?list=`), asks the server where this candidate
// sits in that list (previous/next, from the same ordering the page was read
// from, without the rest of the list), and returns to the stored address,
// where the list restores its scroll position once.
//
// The organisation-wide applications list, which reads its rows in one go,
// still stores their ids (`ids`); a context carries one or the other.
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

import type { CandidateView } from "./definitions";

/** One recruitment's list: which vacancy, and the view of it. */
export type ListQuery = { employerId: string; jobId: string; view: CandidateView };

export type ListContext = {
  /** The rows' ids, for a list that was read whole (the applications page). */
  ids?: string[];
  /** The list's definition, for a paged recruitment list. */
  query?: ListQuery;
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
    if (typeof parsed.href !== "string") return null;
    const hasIds = Array.isArray(parsed.ids);
    const hasQuery =
      typeof parsed.query === "object" &&
      parsed.query !== null &&
      typeof parsed.query.jobId === "string" &&
      typeof parsed.query.employerId === "string";
    if (!hasIds && !hasQuery) return null;
    // Only same-origin paths, never an absolute URL somebody planted.
    if (!parsed.href.startsWith("/employer/")) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The key of the list this tab last opened a candidate from, when that list
 *  can hold `applicationId`: a whole-read list that contains it, or a
 *  recruitment list of the vacancy it belongs to (`jobId`, once known);
 *  otherwise undefined. */
export function recallListKeyFor(applicationId: string, jobId?: string | null): string | undefined {
  try {
    const key = window.sessionStorage.getItem(LAST) ?? undefined;
    const ctx = readListContext(key);
    if (!ctx) return undefined;
    if (ctx.ids?.includes(applicationId)) return key;
    if (ctx.query && jobId && ctx.query.jobId === jobId) return key;
    return undefined;
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
