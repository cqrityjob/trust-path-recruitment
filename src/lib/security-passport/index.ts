// Security Passport — domain barrel.
//
// Phase 1 is a fixture-only prototype. Nothing here touches a database, an
// API, or any other CQrityjob domain: no Career Discovery, no Career Card,
// no Security Competence Platform, no Supabase client. That isolation is
// enforced by scripts/passport-separation-check.ts rather than left to
// discipline.

export * from "./types";
export * from "./experience";
export * from "./format";
export * from "./recognition";
export * from "./disclosure";
export * from "./onboarding";
export * from "./i18n";
export * from "./use-passport-copy";
export * from "./prototype-state";
export * from "./fixtures/personas";
