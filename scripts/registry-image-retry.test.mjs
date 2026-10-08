import { expect, test } from "bun:test";
import { ensureRegistryImage, REGISTRY_RETRY_DELAYS_MS } from "./registry-image-retry.mjs";

const image = "public.ecr.aws/supabase/postgrest:v14.15";
const failure = (stderr) => Object.assign(new Error("docker command failed"), { stderr });
function fixture(pulls, inspectError = failure("Error: No such image: " + image)) {
  const calls = [],
    waits = [],
    notices = [];
  return {
    calls,
    waits,
    notices,
    options: {
      run: (command, args, options) => {
        calls.push({ command, args, options });
        if (args[0] === "image") {
          if (inspectError) throw inspectError;
          return "cached";
        }
        const result = pulls.shift();
        if (result instanceof Error) throw result;
        return result;
      },
      wait: async (ms) => {
        waits.push(ms);
      },
      onRetry: (message) => notices.push(message),
    },
  };
}
test("cached pinned image needs no registry request", async () => {
  const f = fixture([], null);
  expect(await ensureRegistryImage(image, f.options)).toEqual({ source: "cache", attempts: 0 });
  expect(f.calls).toHaveLength(1);
  expect(f.waits).toEqual([]);
});
test("two throttles then success keeps the exact image and finite delays", async () => {
  const f = fixture([
    failure("toomanyrequests: Rate exceeded"),
    failure("Too Many Requests"),
    "pulled",
  ]);
  expect(await ensureRegistryImage(image, f.options)).toEqual({ source: "registry", attempts: 3 });
  expect(f.calls.slice(1).map((c) => c.args)).toEqual(Array(3).fill(["pull", image]));
  expect(f.waits).toEqual([15_000, 30_000]);
  expect(f.notices).toHaveLength(2);
  expect(f.calls.every((c) => c.options.timeout === 60_000)).toBe(true);
});
test("persistent throttling is a failure after exactly three pulls", async () => {
  const last = failure("toomanyrequests: Rate exceeded");
  const f = fixture([failure("Rate exceeded"), failure("Rate exceeded"), last]);
  await expect(ensureRegistryImage(image, f.options)).rejects.toBe(last);
  expect(f.calls).toHaveLength(4);
  expect(f.waits).toEqual(REGISTRY_RETRY_DELAYS_MS);
});
test.each([
  "unauthorized: authentication required",
  "manifest unknown",
  "connection refused",
  "pull timed out",
])("%s fails immediately without retry", async (message) => {
  const error = failure(message),
    f = fixture([error]);
  await expect(ensureRegistryImage(image, f.options)).rejects.toBe(error);
  expect(f.calls).toHaveLength(2);
  expect(f.waits).toEqual([]);
});
test("an unavailable daemon is not treated as a missing image", async () => {
  const error = failure("Cannot connect to the Docker daemon"),
    f = fixture([], error);
  await expect(ensureRegistryImage(image, f.options)).rejects.toBe(error);
  expect(f.calls).toHaveLength(1);
  expect(f.waits).toEqual([]);
});
