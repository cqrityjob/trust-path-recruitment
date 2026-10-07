/** A navigation guard covers all editable interview drafts. A note can
 * change while the process record is being saved, and vice versa. */
export async function drainInterviewDrafts({
  flushNote,
  flushProcess,
  noteIsDirty,
  processIsDirty,
}: {
  flushNote: () => Promise<boolean>;
  flushProcess: () => Promise<boolean>;
  noteIsDirty: () => boolean;
  processIsDirty: () => boolean;
}): Promise<boolean> {
  for (;;) {
    if (!(await flushNote())) return false;
    if (!(await flushProcess())) return false;
    if (!noteIsDirty() && !processIsDirty()) return true;
  }
}
