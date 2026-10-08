/** Only an explicit edit belongs to a draft. Stored text is displayed
 * synchronously, so mounting/changing question cannot turn the initial empty
 * React state (or the previous question's text) into a clearing operation. */
export type QuestionNoteDraft = {
  readonly questionId: string;
  readonly body: string;
};

export function questionNoteBody(
  questionId: string | null,
  draft: QuestionNoteDraft | null,
  savedBody: string,
): string {
  if (!questionId) return "";
  return draft?.questionId === questionId ? draft.body : savedBody;
}

/** null means no write intention. An empty string means a deliberate clear
 * of an existing note and must be sent to the ordinary CAS writer. */
export function pendingQuestionNoteBody(
  questionId: string | null,
  draft: QuestionNoteDraft | null,
  savedBody: string,
  hasSavedNote: boolean,
): string | null {
  if (!questionId || draft?.questionId !== questionId) return null;
  if (draft.body === savedBody) return null;
  if (!hasSavedNote && draft.body.trim() === "") return null;
  return draft.body;
}

/** An explicit reload may apply only to the still-current, unedited draft
 * it was requested for. A late response must not replace another question
 * or text typed while the read was pending. */
export function mayApplyStoredQuestionNote(
  requestedQuestionId: string,
  currentQuestionId: string | null,
  requestedEditRevision: number,
  currentEditRevision: number,
  readSucceeded: boolean,
): boolean {
  return (
    readSucceeded &&
    requestedQuestionId === currentQuestionId &&
    requestedEditRevision === currentEditRevision
  );
}

/** Read explicitly outside the shared case query. A failed read must not
 * mark that query as errored and cause its boundary to unmount the draft. */
export async function reloadQuestionNote<T>({
  read,
  mayApply,
  apply,
}: {
  read: () => Promise<T>;
  mayApply: () => boolean;
  apply: (stored: T) => void;
}): Promise<"applied" | "superseded" | "failed"> {
  let stored: T;
  try {
    stored = await read();
  } catch {
    return "failed";
  }
  if (!mayApply()) return "superseded";
  apply(stored);
  return "applied";
}
