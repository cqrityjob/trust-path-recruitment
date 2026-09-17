// Security Passport — arriving at a fragment.
//
// A plain function, in its own module, because two things call it: the
// page-level `ScrollToHashOnceReady`, on every fragment the router reports, and
// the side panel's "View credential" step, on a press that leaves the fragment
// unchanged and therefore gives the router nothing to report.

/** Resolve a fragment to an element and take the reader there. Returns false
 *  when there is nothing to go to, so the caller can retry on the next frame
 *  while the page is still rendering its sections.
 *
 *  The fragment is PASSED IN rather than read off `window.location`: on a
 *  same-path navigation the router updates its own state before the browser
 *  URL, so an effect that read the window found an empty hash and did
 *  nothing — which is precisely the dead end this component exists to
 *  prevent. */
export function goToHash(raw: string): boolean {
  const hash = raw.replace(/^#/, "");
  if (!hash) return true;
  const el = document.getElementById(hash);
  if (!el) return false;

  // A collapsed disclosure is not a destination. Opening it is what makes
  // the arrival mean something, and the summary is the focusable thing
  // inside it.
  const focusTarget =
    el instanceof HTMLDetailsElement
      ? ((el.open = true), (el.querySelector("summary") as HTMLElement | null) ?? el)
      : el;

  el.scrollIntoView({ block: "start" });
  if (!focusTarget.hasAttribute("tabindex") && focusTarget.tagName !== "SUMMARY") {
    focusTarget.setAttribute("tabindex", "-1");
  }
  focusTarget.focus({ preventScroll: true });
  // ONE arrival at a time: the mark is what a surface styles, and a mark left
  // on the previous target would show two places as "where you just went".
  for (const prev of document.querySelectorAll("[data-hash-target]")) {
    if (prev !== el) prev.removeAttribute("data-hash-target");
  }
  el.setAttribute("data-hash-target", hash);
  return true;
}
