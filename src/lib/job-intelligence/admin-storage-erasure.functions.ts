// Storage erasure — draining what the database could not delete itself.
//
// Permanently deleting an account removes the holder's Passport evidence ROWS
// inside one transaction. The FILES those rows named live in the private
// `passport-evidence` bucket, behind an HTTP API, and no SQL transaction can
// delete them atomically with the rows. Pretending otherwise would produce the
// worst possible outcome: an erasure that reports success while the documents
// are still there.
//
// So the two halves are separated honestly:
//
//   1. admin_delete_user_if_safe() writes one storage_erasure_queue row per
//      object IN THE SAME TRANSACTION that deletes the evidence rows. Either
//      both happen or neither does. There is never a deleted row whose file
//      was not queued, and never an order to delete a file that still has a
//      live row.
//
//   2. This sweep does the object deletes afterwards, with the service key,
//      and marks each row done. A failure is RECORDED -- attempts incremented,
//      last_error kept, completed_at left null -- so the row stays owed and
//      the next sweep retries it.
//
// A pending row with a non-null last_error is therefore the visible, honest
// state of a failure, and admin_storage_erasure_backlog() is how it is seen.
//
// The sweep is called immediately after a deletion so the usual case finishes
// within the same request, and it is safe to call at any time by anyone who
// can reach it: it is idempotent, it claims a bounded batch, and deleting an
// object that is already gone is not an error in Supabase Storage.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// The same seam every sibling admin module names once: the generated Database
// types do not cover the RPCs this phase adds, so the client is untyped here
// rather than being pretended into a shape it does not have.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseRlsClient = any;

type Ctx = { supabase: SupabaseRlsClient; userId: string };

const BATCH = 100;

export type StorageErasureSweepResult = {
  claimed: number;
  deleted: number;
  failed: number;
};

/**
 * Delete queued Storage objects. Returns what it managed to do; it does NOT
 * throw on an individual object failure, because a failure is a recorded,
 * retryable state rather than a reason to fail the caller's request.
 */
export async function sweepStorageErasureQueue(): Promise<StorageErasureSweepResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: rows, error } = await supabaseAdmin
    .from("storage_erasure_queue")
    .select("id, bucket_id, object_path, attempts")
    .is("completed_at", null)
    .order("requested_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error("[storage-erasure] could not read the queue", error);
    return { claimed: 0, deleted: 0, failed: 0 };
  }

  const pending = rows ?? [];
  let deleted = 0;
  let failed = 0;

  // Grouped per bucket so one round trip covers many objects, but the result
  // is still recorded per row: Storage reports per-object errors, and a
  // partial success must not mark the whole batch done.
  const byBucket = new Map<string, typeof pending>();
  for (const row of pending) {
    const list = byBucket.get(row.bucket_id) ?? [];
    list.push(row);
    byBucket.set(row.bucket_id, list);
  }

  for (const [bucket, list] of byBucket) {
    const paths = list.map((r) => r.object_path as string);
    let removedPaths = new Set<string>();
    let failure: string | null = null;

    try {
      // The bucket is checked first, because remove() does NOT report a
      // missing bucket as an error -- it returns an empty removal list, which
      // is indistinguishable from "the objects were already gone". Without
      // this check a misdirected erasure would mark itself complete while
      // every file was still sitting in the real bucket, which is exactly the
      // silent failure this whole mechanism exists to prevent.
      const { error: bucketErr } = await supabaseAdmin.storage.getBucket(bucket);
      if (bucketErr) {
        throw new Error(`bucket "${bucket}" is not usable: ${bucketErr.message ?? bucketErr}`);
      }

      const { data, error: rmErr } = await supabaseAdmin.storage.from(bucket).remove(paths);
      if (rmErr) {
        failure = rmErr.message ?? String(rmErr);
      } else {
        // Storage returns the objects it actually removed. An object that was
        // already gone simply does not come back, and that is a success for
        // our purposes -- the file is not there, which is all we wanted.
        removedPaths = new Set((data ?? []).map((o: { name: string }) => o.name));
      }
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }

    for (const row of list) {
      const path = row.object_path as string;
      const ok = failure === null;
      if (ok) {
        const { error: updErr } = await supabaseAdmin
          .from("storage_erasure_queue")
          .update({
            completed_at: new Date().toISOString(),
            attempts: (row.attempts ?? 0) + 1,
            last_attempt_at: new Date().toISOString(),
            last_error: removedPaths.has(path) ? null : "object was already absent",
          })
          .eq("id", row.id);
        if (updErr) {
          console.error("[storage-erasure] deleted the object but could not mark it done", updErr);
          failed += 1;
        } else {
          deleted += 1;
        }
      } else {
        failed += 1;
        await supabaseAdmin
          .from("storage_erasure_queue")
          .update({
            attempts: (row.attempts ?? 0) + 1,
            last_attempt_at: new Date().toISOString(),
            last_error: (failure ?? "unknown storage error").slice(0, 2000),
          })
          .eq("id", row.id);
      }
    }
  }

  if (failed > 0) {
    console.error(
      `[storage-erasure] ${failed} object(s) still owed after this sweep; they remain queued`,
    );
  }
  return { claimed: pending.length, deleted, failed };
}

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", { _user_id: ctx.userId });
  if (error || !data) throw new Error("FORBIDDEN");
}

/** Run the sweep on demand. Platform admin only. */
export const adminRunStorageErasureSweep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StorageErasureSweepResult> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    return sweepStorageErasureQueue();
  });

export type StorageErasureBacklog = {
  pending: number;
  failed: number;
  completed: number;
  oldestPendingAt: string | null;
  recentErrors: Array<{ bucket: string; attempts: number; error: string }>;
};

const emptyInput = z.object({}).optional();

/** How much erasure is still owed, and what went wrong. Platform admin only. */
export const adminGetStorageErasureBacklog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => emptyInput.parse(d))
  .handler(async ({ context }): Promise<StorageErasureBacklog> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data, error } = await ctx.supabase.rpc("admin_storage_erasure_backlog");
    if (error) {
      console.error("[storage-erasure] backlog read failed", error);
      throw new Error("STORAGE_ERASURE_BACKLOG_FAILED");
    }
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      pending: Number(r.pending ?? 0),
      failed: Number(r.failed ?? 0),
      completed: Number(r.completed ?? 0),
      oldestPendingAt: (r.oldest_pending_at as string | null) ?? null,
      recentErrors: (r.recent_errors ?? []) as StorageErasureBacklog["recentErrors"],
    };
  });
