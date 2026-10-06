// Injected client lets synthetic tests exercise retries and partial Storage
// failures without connecting to any project. No client/browser calls this.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runRetentionWorker(client: any, limit = 10) {
  const result = { enqueued: 0, completed: 0, failed: 0, filesDeleted: 0 };
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  };
  result.enqueued = await call("rec_enqueue_due_retention", { _limit: limit });
  for (let i = 0; i < Math.min(Math.max(limit, 1), 50); i++) {
    const job = await call("rec_claim_erasure");
    if (!job) break;
    let failure: string | null = null;
    try {
      await call("rec_erase_rows", { _id: job.id, _token: job.lease_token });
      const { data: files, error } = await client
        .from("storage_erasure_queue")
        .select("id,bucket_id,object_path,attempts")
        .eq("recruitment_erasure_job_id", job.id)
        .is("completed_at", null)
        .limit(100);
      if (error) throw error;
      for (const file of files ?? []) {
        let fileError: string | null = null;
        try {
          const bucket = await client.storage.getBucket(file.bucket_id);
          if (bucket.error) throw bucket.error;
          const removed = await client.storage.from(file.bucket_id).remove([file.object_path]);
          if (removed.error) throw removed.error;
          // Empty remove responses alone are not proof. Read back the Storage
          // catalogue, including on retry after a lost acknowledgement.
          if (
            await call("rec_erasure_file_exists", {
              _bucket: file.bucket_id,
              _path: file.object_path,
            })
          )
            throw new Error("RETENTION_FILE_STILL_PRESENT");
        } catch (e) {
          fileError = e instanceof Error ? e.message : String(e);
        }
        const { error: settleError } = await client
          .from("storage_erasure_queue")
          .update({
            attempts: file.attempts + 1,
            last_attempt_at: new Date().toISOString(),
            completed_at: fileError ? null : new Date().toISOString(),
            last_error: fileError?.slice(0, 2000) ?? null,
          })
          .eq("id", file.id);
        if (settleError) throw settleError;
        if (fileError) failure = "RETENTION_FILE_DELETE_FAILED";
        else result.filesDeleted++;
      }
    } catch (e) {
      // Store a stable code, never candidate data or the dependency manifest.
      failure =
        String(e instanceof Error ? e.message : e).match(/RETENTION_[A-Z_]+/)?.[0] ??
        "RETENTION_ROWS_DELETE_FAILED";
    }
    const done = await call("rec_settle_erasure", {
      _id: job.id,
      _token: job.lease_token,
      _error: failure,
    });
    if (done) result.completed++;
    else result.failed++;
  }
  return result;
}
