import { jobSearchFromFrom, jobSearchToFrom } from "./job-search";

// Only this tab's explicit return-to-results action consumes this position.
// Browser Back/Forward continues to use the router's own scroll restoration.
function key(from?: string) {
  const { selected: _selected, ...filters } = jobSearchFromFrom(from);
  return `jobs-position:${jobSearchToFrom(filters) ?? "all"}`;
}
/** `slug` is the advert being opened: on the way back its card gets focus. */
export function rememberJobListPosition(from?: string, slug?: string) {
  try {
    sessionStorage.setItem(key(from), JSON.stringify({ y: window.scrollY, selected: slug }));
  } catch {
    // Storage can be unavailable. Navigation still works.
  }
}
export function requestJobListRestore(from?: string) {
  try {
    sessionStorage.setItem("jobs-restore", key(from));
  } catch {
    // Optional continuity.
  }
}
export function restoreJobListPosition(from?: string): (() => void) | undefined {
  try {
    const storedKey = key(from);
    if (sessionStorage.getItem("jobs-restore") !== storedKey) return;
    const value = JSON.parse(sessionStorage.getItem(storedKey) ?? "null");
    if (!value || !Number.isFinite(value.y)) return;
    // Apply after the results render. Consume only when applied so React
    // effect cleanup/replay cannot lose the requested return position.
    const frame = requestAnimationFrame(() => {
      if (window.location.pathname.replace(/\/$/, "") !== "/jobs") return;
      try {
        if (sessionStorage.getItem("jobs-restore") !== storedKey) return;
        sessionStorage.removeItem("jobs-restore");
      } catch {
        return;
      }
      window.scrollTo({ top: value.y, behavior: "instant" });
      if (typeof value.selected === "string") {
        document.getElementById(`job-card-${value.selected}`)?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  } catch {
    // Optional restoration never blocks the search.
  }
}
