import { describe, expect, mock, test } from "bun:test";
import { finishedBuffer } from "../e2e/support/career-analysis-fixtures";

// Exercise the real server handler and its input validator, with transport and
// database I/O replaced. This does not simulate Google or JWT verification.
type HandlerArgs = { data: unknown; context: { userId: string; supabase: unknown } };
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown): unknown => data;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (args: HandlerArgs) => unknown) => (args: HandlerArgs) =>
        fn({ ...args, data: validate(args.data) }),
    };
    return builder;
  },
}));
mock.module("../src/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
mock.module("../src/integrations/supabase/client", () => ({ supabase: {} }));
const { persistPublicV31Run } = await import("../src/lib/career-discovery/v31-public.functions");
const run = persistPublicV31Run as unknown as (args: HandlerArgs) => Promise<unknown>;
const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
const input = { locale: "sv", answers: finishedBuffer("sv").answers, expectedUserId: USER_A };

describe("career save account boundary", () => {
  test("a request authenticated as B cannot save a result confirmed for A", async () => {
    const rpc = mock(() => {
      throw new Error("database must not be reached");
    });
    await expect(
      run({ data: input, context: { userId: USER_B, supabase: { rpc } } }),
    ).rejects.toMatchObject({ code: "persist_failed" });
    expect(rpc).not.toHaveBeenCalled();
  });
  test("a matching account reaches the existing access checks", async () => {
    const rpc = mock(() => {
      throw new Error("synthetic access boundary");
    });
    await expect(
      run({ data: input, context: { userId: USER_A, supabase: { rpc } } }),
    ).rejects.toThrow("synthetic access boundary");
    expect(rpc).toHaveBeenCalledWith("cd_is_internal_tester", { _user_id: USER_A });
  });
});
