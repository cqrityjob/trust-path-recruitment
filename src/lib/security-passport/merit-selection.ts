// Security Passport — "select all" over a list of choosable merits.
//
// Pure, so the tri-state rule is one function and not three copies of an
// `if` inside three components. A selection is a set of merit keys; a group
// and the whole list are each a list of keys. Selecting all only ever adds
// keys the caller passes in, so a rule that makes a merit unchoosable stays
// in force: the caller decides what is choosable, this decides nothing about
// permissions.

export type SelectState = "none" | "some" | "all";

/** Whether none, some or all of `keys` are in `selected`. An empty list is
 *  "none": there is nothing to select. */
export function selectState(keys: readonly string[], selected: ReadonlySet<string>): SelectState {
  if (keys.length === 0) return "none";
  let hit = 0;
  for (const k of keys) if (selected.has(k)) hit += 1;
  if (hit === 0) return "none";
  return hit === keys.length ? "all" : "some";
}

/** A new selection with every key in `keys` on or off, leaving the rest alone. */
export function withAll(
  selected: ReadonlySet<string>,
  keys: readonly string[],
  on: boolean,
): ReadonlySet<string> {
  const next = new Set(selected);
  for (const k of keys) {
    if (on) next.add(k);
    else next.delete(k);
  }
  return next;
}

/** What a click on a tri-state box does: "all" turns everything off; "none" and
 *  "some" turn everything on. (A browser reports `checked` as the value the box
 *  is moving TO, which for "some" is true.) */
export function nextOnClick(state: SelectState): boolean {
  return state !== "all";
}
