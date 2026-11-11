// Voluntary self-declarations — the two multi-step operations, with their
// I/O injected so the ordering rules can be tested without a database.
//
// UPLOAD. Three steps that cannot be one transaction: record the intention,
// write the bytes, attach. Whatever fails, nothing may be left half-done and
// invisible: a failed upload is discarded (which queues any bytes that did
// land), and "saved" is said only after the attach succeeded.
//
// ENDING ACCESS. Withdrawing, deleting, renewing and removing a document all
// end access in the database first. Erasing the bytes is a separate,
// retryable step. A Storage failure must never undo the access decision and
// must never be reported as a completed deletion: the outcome is read back
// from the database, which only lets a file's row go once its object is
// really absent.

import type { SelfDeclarationsPayload } from "./model";

export type UploadSteps = {
  /** Record the intention. Throws the database's refusal code. */
  readonly begin: () => Promise<{ readonly storagePath: string }>;
  /** Write the bytes to exactly that path. */
  readonly put: (storagePath: string) => Promise<{ readonly ok: boolean }>;
  /** Bind the bytes to the statement. Throws the database's refusal code. */
  readonly attach: () => Promise<void>;
  /** Abandon the intention; queues any bytes that landed. Never throws here. */
  readonly discard: () => Promise<void>;
};

export type UploadOutcome =
  | { readonly status: "attached" }
  | { readonly status: "failed"; readonly code: string };

function codeOf(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  const match = /VSD_[A-Z_]+/.exec(message);
  return match ? match[0] : fallback;
}

export async function uploadDeclarationDocument(steps: UploadSteps): Promise<UploadOutcome> {
  let storagePath: string;
  try {
    ({ storagePath } = await steps.begin());
  } catch (error) {
    // Nothing was recorded, so there is nothing to discard.
    return { status: "failed", code: codeOf(error, "VSD_UPLOAD_FAILED") };
  }

  let code: string | null = null;
  try {
    const put = await steps.put(storagePath);
    if (!put.ok) code = "VSD_UPLOAD_FAILED";
    else await steps.attach();
  } catch (error) {
    code = codeOf(error, "VSD_UPLOAD_FAILED");
  }
  if (code === null) return { status: "attached" };

  try {
    await steps.discard();
  } catch {
    // The intention stays visible as an unfinished upload the holder can remove.
  }
  return { status: "failed", code };
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
