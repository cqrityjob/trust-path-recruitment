// The Career Center's personal reads, and the writes that must refresh them.
//
// ── WHY THE KEYS CARRY THE ACCOUNT ─────────────────────────────────────
//
// The Career Center used to key its personal reads on a boolean — "signed in
// or not". Two different accounts in the same tab therefore shared one cache
// entry. The root layout does clear the whole cache on an identity change,
// but clearing a cache does not re-render a mounted component: the hook kept
// its observer on the removed query and went on showing the previous
// account's analysis until something else happened to re-render it. With the
// account id in the key, the id changing IS a re-render with a new key, and
// no entry written for account A can ever be read under account B — not even
// a response that arrives late from A's session.
//
// ── WHICH WRITES INVALIDATE WHICH READS ────────────────────────────────
//
// Three surfaces read the same saved assessment result (My Career, the
// Career Center, the report history) and two read the same current
// profession (the profile, the Career Center's "Vägar från ditt yrke").
// They keep their own keys; what they must share is the list of keys a
// write invalidates. That list lives here, once, so a new reader is added
// in one place instead of being forgotten at every writer.

import type { QueryClient } from "@tanstack/react-query";

/** Every Career Center personal key starts with this, then the account id. */
export const CAREER_CENTER_KEY_ROOT = "career-center" as const;

export const careerCenterKeys = {
  root: [CAREER_CENTER_KEY_ROOT] as const,
  account: (userId: string) => [CAREER_CENTER_KEY_ROOT, userId] as const,
  statedProfession: (userId: string) =>
    [CAREER_CENTER_KEY_ROOT, userId, "stated-profession"] as const,
  activeReport: (userId: string) => [CAREER_CENTER_KEY_ROOT, userId, "active-report"] as const,
  storedReport: (userId: string, snapshotId: string | null) =>
    [CAREER_CENTER_KEY_ROOT, userId, "stored-report", snapshotId] as const,
};

/** Reads that show the active saved assessment result. */
export const ASSESSMENT_RESULT_READ_KEYS: readonly (readonly unknown[])[] = [
  careerCenterKeys.root,
  ["my-career", "active-report"],
  ["my-career", "stored-report"],
  ["my-career", "runs"],
  ["career-discovery", "my-reports"],
  ["professional-identity"],
];

/** Reads that show the person's saved current profession. */
export const CURRENT_PROFESSION_READ_KEYS: readonly (readonly unknown[])[] = [
  careerCenterKeys.root,
  ["professional-identity"],
  ["career-profile-for-jobs"],
];

function invalidateAll(qc: QueryClient, keys: readonly (readonly unknown[])[]): void {
  for (const queryKey of keys) void qc.invalidateQueries({ queryKey: [...queryKey] });
}

/** Call after a new assessment result has been saved to the account. */
export function invalidateAssessmentResultReads(qc: QueryClient): void {
  invalidateAll(qc, ASSESSMENT_RESULT_READ_KEYS);
}

/** Call after the profile's current profession has been written. */
export function invalidateCurrentProfessionReads(qc: QueryClient): void {
  invalidateAll(qc, CURRENT_PROFESSION_READ_KEYS);
}
