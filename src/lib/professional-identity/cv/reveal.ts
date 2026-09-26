// Taking the reader to the document.
//
// The CV creator puts a long form in one column and the document in the
// other. On a phone the columns stack, so a preview produced by the button
// at the bottom of the form appears BELOW the fold; on a desktop the
// document starts at the top of the page, above where the reader has
// scrolled to. Either way, pressing the button visibly did nothing -- which
// was the owner's report, word for word.
//
// So every control that produces or promises the document ends here: the
// region is scrolled into view and given focus, which is what a screen
// reader needs to announce it and what a keyboard needs to continue from
// it. The region is a `tabIndex={-1}` wrapper labelled by its heading.

/** Whether the person has asked their system for less motion. Read at the
 *  moment of the scroll, not at module load, so a change of preference
 *  mid-session is honoured. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Scroll `el` into view and move focus to it.
 *
 * Focus is moved with `preventScroll` so the smooth scroll started a line
 * above is not cut short by the browser's own jump-to-focus, and the scroll
 * is instant when reduced motion is preferred. The element needs
 * `tabIndex={-1}` to be focusable.
 */
export function revealElement(el: HTMLElement): void {
  el.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}
