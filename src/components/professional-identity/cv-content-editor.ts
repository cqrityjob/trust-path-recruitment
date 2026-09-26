// What the CV page needs to know about the editors it mounts.
//
// EmploymentHistoryEditor and GeneralProfileClaims each keep their own open
// form and their own in-flight write. The "Show my CV" control at the bottom
// of /my-career/cv has to SAVE whatever is open before it navigates away --
// leaving with an unsaved employment in the form would lose it silently --
// so each editor reports its state and lends the page one method to flush.

export type CvContentFlushResult =
  /** There was nothing open, or what was open has now been written and
   *  read back. */
  | "saved"
  /** The open form failed its own validation. The fields are marked in the
   *  editor; nothing was written. */
  | "invalid"
  /** The write was attempted and refused or lost. The editor shows its own
   *  error; nothing was lost from the form. */
  | "failed";

export interface CvContentEditorHandle {
  /** Save every open form in this editor, in order. Resolves "saved" when
   *  nothing remains open. */
  flush(): Promise<CvContentFlushResult>;
}

export interface CvContentEditorState {
  /** A form is open with something that has not been written. */
  readonly open: boolean;
  /** One of the editor's own writes is in flight. */
  readonly busy: boolean;
}
