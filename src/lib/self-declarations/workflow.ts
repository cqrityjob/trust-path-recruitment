// Voluntary self-declarations — the two multi-step operations, with their
// I/O injected so the ordering rules can be tested without a database.
//
// ── UPLOAD ──────────────────────────────────────────────────────────────
//
// Four steps that cannot be one transaction: record the intention, write the
// bytes, have the server vouch for them, attach. Any of them can COMMIT and
// lose its acknowledgement, and the whole request can succeed and lose its
// response, after which the browser sends it again with the same upload id.
//
// So an error is never, by itself, taken to mean "it did not happen":
//
//   * before anything destructive, the PERSISTED state is read: what the
//     database says became of this upload, and what bytes are really in
//     Storage, compared with the size, hash and type that were declared;
//   * an upload that is already attached with matching bytes is simply a
//     success. Nothing is rewritten and nothing is deleted;
//   * bytes already in place and matching are not written again;
//   * the only compensation is `abandon`, which the database applies to an
//     UNFINISHED upload only -- it cannot touch an attached document -- and
//     it is used only once the state is known to be unfinished and wrong;
//   * when the state cannot be determined, nothing is destroyed and the
//     outcome is "unconfirmed": the same upload id can be sent again.
//
// What is still refused, without destroying anything that was saved: content
// that differs from the recorded intention, and a statement that has moved on.
//
// ── ENDING ACCESS ───────────────────────────────────────────────────────
//
// Withdrawing, deleting, renewing and removing a document all end access in
// the database first. Erasing the bytes is a separate, retryable step. A
// Storage failure must never undo the access decision and must never be
// reported as a completed deletion: the outcome is read back from the
// database, which only lets a file's row go once its object is really absent.

import type { SelfDeclarationsPayload } from "./model";

export type UploadStatus = "absent" | "prepared" | "attached" | "erasure_pending";
/** What is really stored at the upload's path, against what was declared. */
export type StoredBytes = "absent" | "matching" | "different";

export type UploadSteps = {
  /** Record the intention, or find the one already recorded. Throws the database's refusal. */
  readonly begin: () => Promise<{ readonly status: UploadStatus; readonly storagePath: string }>;
  /** Read the object back and compare its real size, hash and type. Throws if it cannot tell. */
  readonly inspect: (storagePath: string) => Promise<StoredBytes>;
  /** Write the bytes to exactly that path. May fail, or succeed and say it failed. */
  readonly put: (storagePath: string) => Promise<void>;
  /** The server's record that the stored bytes match. Throws the database's refusal. */
  readonly stamp: () => Promise<void>;
  /** Bind the bytes to the statement. Throws the database's refusal. */
  readonly attach: () => Promise<void>;
  /** What the database says became of this upload. */
  readonly state: () => Promise<UploadStatus>;
  /** Abandon an UNFINISHED upload. The database ignores it for anything else. */
  readonly abandon: () => Promise<void>;
};

export type UploadOutcome =
  | { readonly status: "attached" }
  /** Definitely not saved. Nothing of this upload remains attached. */
  | { readonly status: "failed"; readonly code: string }
  /** Could not be determined. Nothing was destroyed; send the same upload id again. */
  | { readonly status: "unconfirmed" };

/** The database's own refusal code, if the error carries one. */
function refusalOf(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  const match = /VSD_[A-Z_]+/.exec(message);
  // These two are this server's "could not tell", not a refusal.
  if (!match || match[0] === "VSD_STORAGE_UNAVAILABLE" || match[0] === "VSD_UPLOAD_UNCONFIRMED") {
    return null;
  }
  return match[0];
}

async function quietly<T>(run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch {
    return undefined;
  }
}

/** Give up on an upload KNOWN to be unfinished. The database enforces "unfinished". */
async function giveUp(steps: UploadSteps, code: string): Promise<UploadOutcome> {
  await quietly(steps.abandon);
  return { status: "failed", code };
}

export async function uploadDeclarationDocument(steps: UploadSteps): Promise<UploadOutcome> {
  // 1 · The intention. A refusal here recorded nothing new.
  let begun: { status: UploadStatus; storagePath: string };
  try {
    begun = await steps.begin();
  } catch (error) {
    const code = refusalOf(error);
    return code ? { status: "failed", code } : { status: "unconfirmed" };
  }
  if (begun.status === "erasure_pending" || begun.status === "absent") {
    return { status: "failed", code: "VSD_DOCUMENT_ERASURE_FENCED" };
  }

  // 2 · What is really there.
  let stored: StoredBytes;
  try {
    stored = await steps.inspect(begun.storagePath);
  } catch {
    return { status: "unconfirmed" };
  }

  // 3 · Already completed: accept it, exactly as it is.
  if (begun.status === "attached") {
    return stored === "matching"
      ? { status: "attached" }
      : // An attached document is never deleted from here, whatever its bytes.
        { status: "failed", code: "VSD_CONTENT_MISMATCH" };
  }

  // 4 · Unfinished. Write the bytes unless matching bytes are already there.
  if (stored === "different") return giveUp(steps, "VSD_CONTENT_MISMATCH");
  if (stored === "absent") {
    // Whatever put() says, the object is asked again: a put can land and
    // report failure, or report success for something else's bytes.
    await quietly(() => steps.put(begun.storagePath));
    try {
      stored = await steps.inspect(begun.storagePath);
    } catch {
      return { status: "unconfirmed" };
    }
    if (stored === "different") return giveUp(steps, "VSD_CONTENT_MISMATCH");
    if (stored === "absent") return giveUp(steps, "VSD_UPLOAD_FAILED");
  }

  // 5 · Vouch for the bytes, then attach. If either fails, ask the database
  // what became of the upload before doing anything about it.
  let failure: unknown = null;
  try {
    await steps.stamp();
    await steps.attach();
  } catch (error) {
    failure = error;
  }
  if (failure === null) return { status: "attached" };

  let status: UploadStatus;
  try {
    status = await steps.state();
  } catch {
    return { status: "unconfirmed" };
  }
  // The attach committed and only its acknowledgement was lost.
  if (status === "attached") return { status: "attached" };
  if (status !== "prepared") return { status: "failed", code: "VSD_DOCUMENT_ERASURE_FENCED" };
  const code = refusalOf(failure);
  // A definite refusal of an unfinished upload: abandon it. Anything else is
  // left exactly as it is, to be resumed with the same id.
  return code ? giveUp(steps, code) : { status: "unconfirmed" };
}

export type EndAccessSteps = {
  /** The access decision. If this throws, nothing changed and nothing is reported. */
  readonly end: () => Promise<void>;
  /** Erase this holder's queued files. May fail; that is a recorded, retryable state. */
  readonly drain: () => Promise<void>;
  /** The truth afterwards, from the database. */
  readonly reload: () => Promise<SelfDeclarationsPayload>;
};

export type EndAccessOutcome = {
  readonly accessEnded: true;
  /** "confirmed" only when no file of this holder is owed to erasure any more. */
  readonly fileDeletion: "confirmed" | "pending";
  readonly payload: SelfDeclarationsPayload;
};

export function filesOwed(payload: SelfDeclarationsPayload): number {
  return payload.declarations.reduce((n, d) => n + d.erasures.length, 0);
}

export async function endAccessAndErase(steps: EndAccessSteps): Promise<EndAccessOutcome> {
  await steps.end();
  try {
    await steps.drain();
  } catch {
    // Still owed. The reload below says so, and the holder can retry.
  }
  const payload = await steps.reload();
  return {
    accessEnded: true,
    fileDeletion: filesOwed(payload) === 0 ? "confirmed" : "pending",
    payload,
  };
}
