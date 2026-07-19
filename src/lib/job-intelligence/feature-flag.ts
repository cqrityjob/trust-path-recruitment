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

// Employer Portal release-control flag (Phase G2).
//
// IMPORTANT: this is a release-control flag ONLY, same as jobsEnabled()
// above. It gates rendering of the employer-context experience
// (/employer*, and the "Employer workspace" entry point on /my-career)
// while the surface is under owner review. It is NOT a security boundary
// — database RLS (employer_memberships_self_select, employers_member_
// select, has_employer_role) remains effective and authoritative
// regardless of this flag's value. The founder decision for Phase G2 is
// stricter than jobsEnabled()'s own usage: the employer entry point must
// be completely hidden while this is false, not merely gated at the
// destination — see call sites in /my-career and the /employer routes.
//
// Read at call sites: `if (!employerPortalEnabled()) return <ComingSoon />;`

export function employerPortalEnabled(): boolean {
  const raw =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_EMPLOYER_PORTAL_ENABLED) ??
    (typeof process !== "undefined" ? process.env?.VITE_EMPLOYER_PORTAL_ENABLED : undefined);
  return String(raw).toLowerCase() === "true";
}
