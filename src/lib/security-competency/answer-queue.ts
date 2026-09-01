// Ordering the writes that carry somebody's answers.
//
// ── WHY THIS IS NOT JUST `void save(...)` ─────────────────────────────
//
// `scp_save_response` upserts the WHOLE response row from EXCLUDED — every
// column, every time. Two saves for one item are therefore not additive: they
// are two complete replacements of the same row, and whichever reaches the
// database last is the one that survives.
//
// Fired concurrently they can arrive in either order. Choosing "best" and then
// "worst" a moment later sends {best} and then {best, worst}; if the first
// request happens to land second, the stored answer loses the "worst" — while
// the screen, which never doubted either click, keeps showing both. The
// participant submits a pairing the database does not have, and nothing
// anywhere reports a failure, because nothing failed. Both writes succeeded.
//
// So writes for ONE item are serialised. Writes for DIFFERENT items still run
// concurrently, because they touch different rows and a run of fifty answers
// should not become fifty round trips in single file.
//
// The second job is `drain`. Submission has to wait for answers still in the
// air: submitting past an in-flight write makes the database correctly refuse
// a run that is, a few hundred milliseconds later, complete.
//
// ── WHY FAILURE IS SWALLOWED HERE ─────────────────────────────────────
//
// A queued write never rejects out of this module. Two reasons, and both are
// about not letting one bad save take something else down with it:
//
//   - the chain must continue. A failed save is very often followed by the
//     participant changing the answer, and that write must still be sent.
//   - `drain` must terminate. Submission waits on it, and a rejection that
//     nobody is positioned to catch would either hang the submit or surface as
//     an unhandled rejection.
//
// The caller reports the failure — it is the only party that knows which
// answer it was and what to say about it. `run` is expected to handle its own
// errors; this is the backstop for the ones it does not.

export type AnswerQueue = {
  /** Run `work` for `itemId` after everything already queued for that item.
   *
   *  Resolves when this piece of work has settled, successfully or not. Never
   *  rejects. */
  enqueue: (itemId: string, work: () => Promise<void>) => Promise<void>;
  /** Resolve once no work is outstanding for any item.
   *
   *  Re-checks rather than settling one snapshot: work queued WHILE this is
   *  waiting is waited for too, which is what makes it safe to call
   *  immediately after flushing a debounced save. */
  drain: () => Promise<void>;
  /** How many items have work outstanding. Zero means every answer that was
   *  handed to this queue has reached the server or failed trying. */
  size: () => number;
};

export function createAnswerQueue(): AnswerQueue {
  // One promise per item: the tail of that item's chain.
  const chains = new Map<string, Promise<void>>();

  const enqueue = (itemId: string, work: () => Promise<void>): Promise<void> => {
    const previous = chains.get(itemId) ?? Promise.resolve();
    const next: Promise<void> = previous
      // The previous link's outcome is its own business. A save that failed
      // must not stop the next attempt at the same item from being sent.
      .then(
        () => work(),
        () => work(),
      )
      .catch(() => undefined)
      .then(() => {
        // Only the tail clears the entry. A newer write has already replaced
        // it and is still owed a drain.
        if (chains.get(itemId) === next) chains.delete(itemId);
      });
    // Registered synchronously, before anything is awaited, so a drain
    // starting one tick later already sees it.
    chains.set(itemId, next);
    return next;
  };

  const drain = async (): Promise<void> => {
    while (chains.size > 0) {
      await Promise.allSettled([...chains.values()]);
    }
  };

  return { enqueue, drain, size: () => chains.size };
}
