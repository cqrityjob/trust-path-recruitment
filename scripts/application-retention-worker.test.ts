import { test, expect } from "bun:test";
import { runRetentionWorker } from "../supabase/functions/_shared/retention-worker";

function fixture(
  options: {
    removeFails?: boolean;
    stillExists?: boolean;
    settleFails?: boolean;
    rowFails?: boolean;
    bucketFails?: boolean;
  } = {},
) {
  const state = {
    claimed: false,
    removed: 0,
    marked: false,
    attempts: 0,
    error: null as string | null,
    done: false,
    rowCalls: 0,
    settled: 0,
    filePresent: true,
  };
  const file = {
    id: "file",
    bucket_id: "job-application-cvs",
    object_path: "synthetic/unique.pdf",
    attempts: 0,
  };
  const client = {
    async rpc(name: string, args: Record<string, unknown> = {}) {
      if (name === "rec_enqueue_due_retention") return { data: 0, error: null };
      if (name === "rec_claim_erasure") {
        if (state.claimed || state.done) return { data: null, error: null };
        state.claimed = true;
        return { data: { id: "job", lease_token: "token" }, error: null };
      }
      if (name === "rec_erase_rows") {
        state.rowCalls++;
        return {
          error: options.rowFails
            ? { message: "RETENTION_SHARED_MATERIAL_REQUIRES_HANDLING" }
            : null,
        };
      }
      if (name === "rec_erasure_file_exists")
        return { data: options.stillExists || state.filePresent, error: null };
      if (name === "rec_settle_erasure") {
        state.settled++;
        state.done = state.marked && !args._error;
        state.error = args._error as string | null;
        return { data: state.done, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    storage: {
      async getBucket() {
        return { error: options.bucketFails ? new Error("bucket unavailable") : null };
      },
      from() {
        return {
          async remove() {
            state.removed++;
            if (!options.removeFails && !options.stillExists) state.filePresent = false;
            return {
              data: [],
              error: options.removeFails ? new Error("synthetic storage failure") : null,
            };
          },
        };
      },
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                is() {
                  return {
                    async limit() {
                      return {
                        data: state.marked ? [] : [{ ...file, attempts: state.attempts }],
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
        update(value: { completed_at: string | null; attempts: number }) {
          return {
            async eq() {
              state.attempts = value.attempts;
              if (!options.settleFails) state.marked = Boolean(value.completed_at);
              return {
                error: options.settleFails ? new Error("lost database acknowledgement") : null,
              };
            },
          };
        },
      };
    },
  };
  return {
    client,
    state,
    options,
    retry() {
      state.claimed = false;
    },
  };
}
test("Storage failure stays owed and reports failure", async () => {
  const f = fixture({ removeFails: true });
  const result = await runRetentionWorker(f.client);
  expect(result.failed).toBe(1);
  expect(result.completed).toBe(0);
  expect(f.state.marked).toBe(false);
  expect(f.state.attempts).toBe(1);
  expect(f.state.error).toBe("RETENTION_FILE_DELETE_FAILED");
});
test("Empty remove response is not proof if object still exists", async () => {
  const f = fixture({ stillExists: true });
  await runRetentionWorker(f.client);
  expect(f.state.done).toBe(false);
  expect(f.state.error).toBe("RETENTION_FILE_DELETE_FAILED");
});
test("Absent file verified after remove completes; rerun is idempotent", async () => {
  const f = fixture();
  const result = await runRetentionWorker(f.client);
  expect(result.completed).toBe(1);
  expect(f.state.marked).toBe(true);
  f.retry();
  await runRetentionWorker(f.client);
  expect(f.state.removed).toBe(1);
});
test("Lost acknowledgement remains incomplete and succeeds on a later retry", async () => {
  const f = fixture({ settleFails: true });
  await runRetentionWorker(f.client);
  expect(f.state.done).toBe(false);
  expect(f.state.filePresent).toBe(false);
  f.options.settleFails = false;
  f.retry();
  await runRetentionWorker(f.client);
  expect(f.state.done).toBe(true);
  expect(f.state.attempts).toBe(2);
});
test("Missing bucket never counts as absent file", async () => {
  const f = fixture({ bucketFails: true });
  await runRetentionWorker(f.client);
  expect(f.state.removed).toBe(0);
  expect(f.state.done).toBe(false);
});
test("Shared or blocked row deletion does not remove files", async () => {
  const f = fixture({ rowFails: true });
  await runRetentionWorker(f.client);
  expect(f.state.removed).toBe(0);
  expect(f.state.done).toBe(false);
  expect(f.state.error).toBe("RETENTION_SHARED_MATERIAL_REQUIRES_HANDLING");
});
