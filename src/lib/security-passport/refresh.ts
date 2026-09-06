// What has to be re-read after a Passport write.
//
// ── WHY THIS IS A LIST AND NOT A CALL SITE ─────────────────────────────
//
// The Passport routes hold their own state (`useState` + `useServerFn`) while
// My Career runs on TanStack Query. So a merit created in the Passport is
// invisible to the career home until its cached reads are invalidated — and
// the home's Next Best Action is computed from exactly those reads.
//
// The visible failure was small and corrosive: somebody added their first
// merit, went to My Career, and was told to add their first merit. The cache
// was right about what it had; nobody had told it the world moved.
//
// The keys live here rather than being retyped at each write, because the
// list is the thing that goes stale. A new read added to the home is one line
// here; a new write anywhere in the Passport calls one function.
//
// ── IT INVALIDATES, IT DOES NOT REFETCH EVERYTHING ─────────────────────
//
// `invalidateQueries` marks the entries stale and refetches only what is
// currently mounted. Somebody who saves a merit and stays in the Passport
// pays for nothing; the career home refetches when they arrive, which is when
// the answer matters.

import type { QueryClient } from "@tanstack/react-query";

/**
 * Every cached read whose answer changes when a merit is created.
 *
 * `professional-identity` is the important one: it is the single read the
 * career home's merit counts, trust summary and Next Best Action are all
 * derived from. The others are here because they are read on the same page
 * and a half-refreshed page is its own kind of wrong.
 */
export const PASSPORT_QUERY_KEYS: readonly (readonly string[])[] = [
  // The canonical "what does this person hold" read. Feeds the merit counter,
  // the trust summary and the NBA on /my-career.
  ["professional-identity"],
  // Open and decided verification requests. A new merit changes what is
  // "ready to send for verification", which is a P5 action on the home.
  ["passport", "my-verification-requests"],
  // The CV builder reads merits; a CV list rendered from a pre-merit snapshot
  // offers to build a document out of nothing.
  ["cv", "list"],
];

/**
 * Tell every cached Passport-derived read that the world moved.
 *
 * Awaited by callers on purpose. `invalidateQueries` returns once the
 * refetches it triggered have settled, so a navigation that happens after it
 * lands on a page that already agrees with the database rather than on one
 * that corrects itself a moment later in front of the reader.
 */
export async function invalidatePassportAndCareer(qc: QueryClient): Promise<void> {
  await Promise.all(
    PASSPORT_QUERY_KEYS.map((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] })),
  );
}
