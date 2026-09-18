// Query identity for the BESKT conduct surface.
//
// One module, because the isolation is the point. Every key below names the
// employer, the case and — where it exists — the session, so two cases open in
// two tabs cannot share a cache entry, and a workspace fetched for one
// employer can never be served to another.
//
// The independence rule leans on this too. `others` is part of the workspace
// payload, so it is cached under the workspace key and invalidated with it: a
// lock re-fetches the workspace and the withheld positions arrive in the same
// answer that says they are now visible. There is deliberately NO separate
// "other positions" key, because a separate key would be a separate fetch this
// surface must never make.

/** The module gate for one case: is there a BESKT module here at all? */
export const besktModuleKey = (employerSlug: string, caseId: string) =>
  ["beskt", "module", employerSlug, caseId] as const;

/** The interviewer's whole working surface for one conduct session. */
export const besktWorkspaceKey = (employerSlug: string, caseId: string, sessionId: string) =>
  ["beskt", "conduct", employerSlug, caseId, sessionId] as const;

/**
 * The method's own interviewer wordings for one session.
 *
 * Separate from the workspace key because the two have different lifetimes:
 * the wordings change only when the governed method version does, while the
 * workspace changes on every entry. Invalidating the workspace after a save
 * must not re-fetch governance content that cannot have moved.
 */
export const besktPromptsKey = (employerSlug: string, caseId: string, sessionId: string) =>
  ["beskt", "prompts", employerSlug, caseId, sessionId] as const;

/** The report surface: preview, finalised document and version history. */
export const besktReportKey = (employerSlug: string, caseId: string, sessionId: string) =>
  ["beskt", "report", employerSlug, caseId, sessionId] as const;

/** One entry's correction and verification history. */
export const besktEntryHistoryKey = (sessionId: string, entryId: string) =>
  ["beskt", "conduct", "entry", sessionId, entryId] as const;

/**
 * Exactly the keys a successful conduct mutation must invalidate.
 *
 * The module key is included because opening a session changes what the case
 * overview says about the module — and only those two. A blanket invalidation
 * would also re-run the interview case, its context and the candidate notice,
 * which have not changed and which cost a round trip each.
 */
export function besktInvalidateAfterMutation(
  employerSlug: string,
  caseId: string,
  sessionId: string | null,
): readonly (readonly string[])[] {
  const keys: (readonly string[])[] = [besktModuleKey(employerSlug, caseId)];
  if (sessionId !== null) {
    keys.push(besktWorkspaceKey(employerSlug, caseId, sessionId));
    // The report reads the whole record, so every conduct mutation moves it —
    // including the blockers, which are the reason a reader is on that screen.
    // The prompts key is deliberately NOT here: governance content cannot
    // move because an interviewer saved a note.
    keys.push(besktReportKey(employerSlug, caseId, sessionId));
  }
  return keys;
}
