/**
 * Single-flight for the interview's important actions.
 *
 * ── THE DEFECT CLASS ────────────────────────────────────────────────────
 *
 * Confirm, save, assess, finish and finalise are each one click. A second
 * click in the same frame -- a double-click, a trembling hand on a phone, a
 * keyboard repeat -- reaches the handler before React has re-rendered the
 * button as disabled, and TanStack's `mutate()` starts a second request. The
 * database now refuses or absorbs the duplicate (20261020090000), but a
 * browser that sends two requests for one intention is still a browser that
 * shows the recruiter two outcomes for one action.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────
 *
 * While a request is in flight, a second call with the SAME input returns the
 * in-flight promise rather than starting another. A call with a DIFFERENT
 * input is a different intention -- confirming proposal B while A is still
 * saving -- and proceeds; the database keys idempotency per item, so that is
 * safe.
 *
 * Inputs are compared by their JSON form, which is exact for the plain object
 * variables every interview mutation takes.
 *
 * The note autosave does NOT use this: two saves of one note in quick
 * succession carry different text and the later one must win, in order. That
 * path is serialised instead (see the interview route).
 */

export function singleFlight<A, R>(fn: (vars: A) => Promise<R>): (vars: A) => Promise<R> {
  const inFlight = new Map<string, Promise<R>>();
  return (vars: A) => {
    const key = keyOf(vars);
    const running = inFlight.get(key);
    if (running) return running;
    const p = fn(vars).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, p);
    return p;
  };
}

function keyOf(vars: unknown): string {
  try {
    return JSON.stringify(vars) ?? "undefined";
  } catch {
    return String(vars);
  }
}
