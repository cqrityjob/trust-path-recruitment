/** Flush the current question's newest draft before navigation. The existing
 * note writer still owns serialization, note IDs and optimistic versions. */
export async function drainInterviewNoteDraft({
  readDraft,
  readSaved,
  hasSavedNote,
  isCurrentQuestion,
  write,
}: {
  readDraft: () => string;
  readSaved: () => string;
  hasSavedNote: () => boolean;
  isCurrentQuestion: () => boolean;
  write: (body: string) => Promise<unknown>;
}): Promise<boolean> {
  while (isCurrentQuestion()) {
    const body = readDraft();
    if (body === readSaved()) return true;
    if (!hasSavedNote() && body.trim() === "") return true;
    try {
      // The writer advances readSaved only after the write succeeds. If the
      // user typed during this request, the next iteration stores that text
      // before allowing navigation to replace the current draft.
      await write(body);
    } catch {
      return false;
    }
  }
  // A different guarded action already moved the workspace. Never save that
  // new question's text into the previous question's record.
  return false;
}
