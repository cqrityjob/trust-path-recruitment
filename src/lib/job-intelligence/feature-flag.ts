// Job Intelligence release-control flag.
//
// IMPORTANT: this is a release-control flag ONLY. It gates rendering of the
// public Jobs experience while the surface is under owner review. It is NOT a
// security boundary — database RLS and server-side authorisation remain
// effective regardless of this flag.
//
// Read at call sites: `if (!jobsEnabled()) return <ComingSoon />;`

export function jobsEnabled(): boolean {
  // Vite exposes VITE_* at build time on both client and (via process.env
  // fallback) SSR. Compare to the string "true" so an unset variable is
  // treated as disabled.
  const raw =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_JOBS_ENABLED) ??
    (typeof process !== "undefined" ? process.env?.VITE_JOBS_ENABLED : undefined);
  return String(raw).toLowerCase() === "true";
}
