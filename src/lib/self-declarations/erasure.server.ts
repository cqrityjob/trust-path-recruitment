// Voluntary self-declarations — erasing one holder's queued files.
//
// The database queues a file in public.storage_erasure_queue in the same
// transaction that ends access to it. From that moment no client policy can
// read, overwrite or delete the object: the bucket has no client DELETE at
// all. Removing the bytes therefore needs the service key, exactly as the
// established erasure sweep does (admin-storage-erasure.functions.ts).
//
// This is that same mechanism, NARROWED to what a holder may trigger:
//
//   * only rows whose bucket is self-declaration-documents, and
//   * only rows whose subject is the signed-in holder, and
//   * only rows the database itself queued.
//
// It reads no declaration, no document row and no other bucket, takes no
// path from the caller, and never throws for a Storage failure: a failure is
// recorded on the queue row (attempts, last_error) so it stays owed, visible
// to the holder, and retryable -- here or by the administrator's sweep.
//
// Server-only: this file is never imported at module level by client code.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const SELF_DECLARATION_BUCKET = "self-declaration-documents";
const BATCH = 50;

export type OwnErasureDrain = {
  readonly claimed: number;
  readonly erased: number;
  readonly failed: number;
};

export async function drainOwnSelfDeclarationErasures(userId: string): Promise<OwnErasureDrain> {
  const { data: rows, error } = await supabaseAdmin
    .from("storage_erasure_queue")
    .select("id, object_path, attempts")
    .eq("bucket_id", SELF_DECLARATION_BUCKET)
    .eq("subject_user_id", userId)
    .is("completed_at", null)
    .order("requested_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    console.error("[self-declarations] could not read the holder's erasure queue", error.message);
    return { claimed: 0, erased: 0, failed: 0 };
  }
  // Defence in depth: a queued path is always inside the subject's own folder.
  const pending = (rows ?? []).filter((r) => String(r.object_path).startsWith(`${userId}/`));
  if (pending.length === 0) return { claimed: 0, erased: 0, failed: 0 };

  let failure: string | null = null;
  let removed = new Set<string>();
  try {
    // remove() reports a missing bucket as an empty success; check it first.
    const bucket = await supabaseAdmin.storage.getBucket(SELF_DECLARATION_BUCKET);
    if (bucket.error) throw new Error(`bucket is not usable: ${bucket.error.message}`);
    const result = await supabaseAdmin.storage
      .from(SELF_DECLARATION_BUCKET)
      .remove(pending.map((r) => String(r.object_path)));
    if (result.error) failure = result.error.message;
    else removed = new Set((result.data ?? []).map((o: { name: string }) => o.name));
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }

  let erased = 0;
  let failed = 0;
  const now = new Date().toISOString();
  for (const row of pending) {
    const attempts = (row.attempts ?? 0) + 1;
    const update =
      failure === null
        ? {
            completed_at: now,
            attempts,
            last_attempt_at: now,
            last_error: removed.has(String(row.object_path)) ? null : "object was already absent",
          }
        : { attempts, last_attempt_at: now, last_error: failure.slice(0, 2000) };
    const { error: updateError } = await supabaseAdmin
      .from("storage_erasure_queue")
      .update(update)
      .eq("id", row.id);
    if (failure === null && !updateError) erased += 1;
    else failed += 1;
  }
  if (failed > 0) {
    console.error(
      `[self-declarations] ${failed} file(s) still owed to erasure; they remain queued`,
    );
  }
  return { claimed: pending.length, erased, failed };
}
