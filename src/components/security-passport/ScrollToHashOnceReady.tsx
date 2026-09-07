// Honour a `#section` arrival on a Passport page that loads its own data —
// on first paint AND every time the fragment changes afterwards.
//
// ── WHY THE BROWSER CANNOT DO THIS ─────────────────────────────────────
//
// Every Passport route is `ssr: false` and renders its sections only once
// its reads answer. By then the browser has long since given up on the
// fragment: it looked for the element at navigation time, found nothing, and
// left the viewport at the top. A client-side `<Link hash="…">` is worse —
// there is no document load at all.
//
// ── AND WHY ONCE WAS NOT ENOUGH ────────────────────────────────────────
//
// The first version ran on mount only. Every same-page fragment link on the
// Passport therefore did nothing at all: the recommended step's
// `/passport#attention` and `/passport#merits`, pressed while already on
// /passport, changed the URL and moved neither the viewport nor the focus.
// A button that changes the address bar and nothing else is a dead end that
// looks like a working control.
//
// `hashchange` alone does not catch it: a router `<Link>` to the same path
// with a different fragment is a `history.pushState`, and pushState fires no
// hash event at all. So the ROUTER's own location is the trigger, and the
// window event stays as the second one — it is what a back button, a
// forward button and an address-bar edit fire.
//
// ── WHY IT IS ONE COMPONENT AND NOT ONE PER ROUTE ──────────────────────
//
// Two routes need it and a third will. Written twice it drifts, and the
// copy that drifts is the one whose links quietly stop working.
//
//   /passport               #attention, #merits, #add-merit
//   /passport/information   #sp-employment, #sp-education, #sp-work-country
//
// ── IT MOVES FOCUS, NOT ONLY THE VIEWPORT ──────────────────────────────
//
// A keyboard or screen-reader user who follows "add a course" must arrive at
// the course section, not at the top of a page they then have to search. The
// target is made focusable if it is not already, and `data-hash-target` is
// stamped on it so a browser test can assert the arrival happened and which
// element it resolved to, rather than inferring it from a scroll offset.
//
// A <details> target is OPENED and its summary focused. The recommended step
// "add another merit" points at the merit-type chooser, and arriving at a
// collapsed disclosure would be arriving at nothing.

import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

/** Resolve a fragment to an element and take the reader there. Returns false
 *  when there is nothing to go to, so the caller can retry on the next frame
 *  while the page is still rendering its sections.
 *
 *  The fragment is PASSED IN rather than read off `window.location`: on a
 *  same-path navigation the router updates its own state before the browser
 *  URL, so an effect that read the window found an empty hash and did
 *  nothing — which is precisely the dead end this component exists to
 *  prevent. */
function goToHash(raw: string): boolean {
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
  el.setAttribute("data-hash-target", hash);
  return true;
}

export function ScrollToHashOnceReady() {
  // The ROUTER's fragment, not the window's. Two reasons, and both of them
  // were bugs: a same-path fragment navigation is a pushState, which fires
  // no hash event and so needs a subscription; and the router updates this
  // value BEFORE the browser URL, so an effect that then read
  // `window.location.hash` found it empty and did nothing at all.
  const hash = useRouterState({ select: (s) => s.location.hash });

  useEffect(() => {
    // On mount the section may still be a frame away: this effect has run,
    // but a sibling that renders the target can commit in the same tick.
    let raf = 0;
    const attempt = (tries: number) => {
      if (goToHash(hash) || tries === 0) return;
      raf = requestAnimationFrame(() => attempt(tries - 1));
    };
    attempt(2);

    // Same-document fragment navigation — the recommended step's own links,
    // pressed while already on this page.
    const onHashChange = () => attempt(2);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", onHashChange);
    };
    // Re-runs on every fragment change the router makes, which is what a
    // same-page "open the chooser" or "#merits" link actually produces.
  }, [hash]);
  return null;
}
