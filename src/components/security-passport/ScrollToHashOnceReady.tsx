// Honour a `#section` arrival on a Passport page that loads its own data.
//
// ── WHY THE BROWSER CANNOT DO THIS ─────────────────────────────────────
//
// Every Passport route is `ssr: false` and renders its sections only once
// its reads answer. By then the browser has long since given up on the
// fragment: it looked for the element at navigation time, found nothing, and
// left the viewport at the top. A client-side `<Link hash="…">` is worse —
// there is no document load at all.
//
// So the scroll happens HERE, from inside the ready branch, once.
//
// ── WHY IT IS ONE COMPONENT AND NOT ONE PER ROUTE ──────────────────────
//
// Two routes need it and a third will. Written twice it drifts, and the
// copy that drifts is the one whose links quietly stop working — which is
// indistinguishable, from the outside, from a button that does nothing.
//
//   /passport               #attention, #merits   (the career home links here)
//   /passport/information   #sp-employment, #sp-education, #sp-work-country
//                                                 (the workspace links here)
//
// ── IT MOVES FOCUS, NOT ONLY THE VIEWPORT ──────────────────────────────
//
// A keyboard or screen-reader user who follows "add a course" must arrive at
// the course section, not at the top of a page they then have to search. The
// target is made focusable if it is not already, and `data-hash-target` is
// stamped on it so a browser test can assert the arrival happened and which
// element it resolved to, rather than inferring it from a scroll offset.

import { useEffect } from "react";

export function ScrollToHashOnceReady() {
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    if (!hash) return;
    // The section may still be a frame away: React has committed this effect
    // but a sibling that renders the target can commit in the same tick.
    // One animation frame is enough and costs nothing when it was already
    // there.
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(hash);
      if (!el) return;
      el.scrollIntoView({ block: "start" });
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      (el as HTMLElement).focus({ preventScroll: true });
      el.setAttribute("data-hash-target", hash);
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}
