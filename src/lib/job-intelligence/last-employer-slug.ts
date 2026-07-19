// Phase G2 — shared localStorage key for the optional "last visited
// employer workspace" UX convenience. Matches the naming convention
// already used for `cqrityjob.lang` (src/i18n/context.tsx).
//
// Never authorization: both _authenticated.employer.index.tsx and
// _authenticated.employer.$employerSlug.tsx treat a value read from
// this key as nothing more than a candidate slug that must still
// appear in that request's fresh listMyEmployerWorkspaces() result
// before it is used for anything.

export const LAST_EMPLOYER_SLUG_KEY = "cqrityjob.lastEmployerSlug";
