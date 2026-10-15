import { expect, test } from "bun:test";
import fs from "node:fs";
import {
  ensurePinnedImage,
  POSTGREST_14_IMAGE,
  REGISTRY_RETRY_DELAYS_MS,
} from "./registry-image-retry.mjs";

const pin = POSTGREST_14_IMAGE;
const [ecr, hub] = pin.sources.map((repo) => `${repo}@${pin.digest}`);
const failure = (stderr) => Object.assign(new Error("docker command failed"), { stderr });
const missing = (ref) => failure("Error: No such image: " + ref);
const inspected = (ref, over = {}) =>
  `${JSON.stringify(over.repoDigests ?? [ref])}|${over.id ?? pin.imageId}|${over.platform ?? pin.platform}`;

/** A fake docker: `cached` refs exist locally; `pulls` answers each pull in
 * order; after a successful pull of a ref, inspect reports `pulled[ref]`. */
function fixture({ pulls = [], cached = {}, pulled = {}, inspectError } = {}) {
  const calls = [],
    waits = [],
    notices = [],
    present = { ...cached };
  return {
    calls,
    waits,
    notices,
    options: {
      run: (command, args, options) => {
        calls.push({ command, args, options });
        const ref = args.at(-1);
        if (args[0] === "image" && args[1] === "inspect") {
          if (inspectError) throw inspectError;
          if (!(ref in present)) throw missing(ref);
          return present[ref];
        }
        if (args[0] === "image" && args[1] === "rm") {
          delete present[ref];
          return "";
        }
        const result = pulls.shift();
        if (result instanceof Error) throw result;
        present[ref] = pulled[ref] ?? inspected(ref);
        return "pulled";
      },
      wait: async (ms) => {
        waits.push(ms);
      },
      onRetry: (message) => notices.push(message),
    },
  };
}
const pullsOf = (f) => f.calls.filter((c) => c.args[0] === "pull").map((c) => c.args);

test("the pin is the verified linux/amd64 manifest, by digest, from two registries", () => {
  expect(pin.platform).toBe("linux/amd64");
  expect(pin.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(pin.imageId).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(pin.sources).toEqual(["public.ecr.aws/supabase/postgrest", "postgrest/postgrest"]);
});

test("a cached, verified copy needs no registry request", async () => {
  const f = fixture({ cached: { [ecr]: inspected(ecr) } });
  expect(await ensurePinnedImage(pin, f.options)).toEqual({
    ref: ecr,
    source: pin.sources[0],
    via: "cache",
    attempts: 0,
    digest: pin.digest,
    imageId: pin.imageId,
    platform: pin.platform,
  });
  expect(pullsOf(f)).toEqual([]);
});

test("the primary registry serves the pinned digest", async () => {
  const f = fixture({ pulls: ["ok"] });
  const got = await ensurePinnedImage(pin, f.options);
  expect(got).toMatchObject({ ref: ecr, source: pin.sources[0], via: "registry", attempts: 1 });
  expect(pullsOf(f)).toEqual([["pull", "--platform", "linux/amd64", ecr]]);
  expect(f.calls.every((c) => c.options.timeout === 60_000)).toBe(true);
});

test("a throttled primary falls back to the verified mirror, same digest", async () => {
  const f = fixture({ pulls: [failure("toomanyrequests: Data limit exceeded"), "ok"] });
  const got = await ensurePinnedImage(pin, f.options);
  expect(got).toEqual({
    ref: hub,
    source: "postgrest/postgrest",
    via: "registry",
    attempts: 2,
    digest: pin.digest,
    imageId: pin.imageId,
    platform: "linux/amd64",
  });
  expect(pullsOf(f)).toEqual([
    ["pull", "--platform", "linux/amd64", ecr],
    ["pull", "--platform", "linux/amd64", hub],
  ]);
  expect(f.waits).toEqual([]);
});

test.each([
  ["another image id", { id: "sha256:" + "0".repeat(64) }],
  ["another platform", { platform: "linux/arm64" }],
  ["another repo digest", { repoDigests: ["postgrest/postgrest@sha256:" + "1".repeat(64)] }],
])("a mirror copy with %s is refused and removed, never run", async (_label, over) => {
  const f = fixture({
    pulls: [failure("toomanyrequests: Rate exceeded"), "ok"],
    pulled: { [hub]: inspected(hub, over) },
  });
  await expect(ensurePinnedImage(pin, f.options)).rejects.toThrow("REGISTRY_DIGEST_MISMATCH");
  expect(f.calls.at(-1).args).toEqual(["image", "rm", hub]);
  expect(f.waits).toEqual([]);
});

test("the containerd image store reports the manifest digest as the id: accepted", async () => {
  const f = fixture({ pulls: ["ok"], pulled: { [ecr]: inspected(ecr, { id: pin.digest }) } });
  expect(await ensurePinnedImage(pin, f.options)).toMatchObject({ ref: ecr, imageId: pin.digest });
});

test("a cached copy that does not match is refused", async () => {
  const f = fixture({ cached: { [ecr]: inspected(ecr, { id: "sha256:" + "2".repeat(64) }) } });
  await expect(ensurePinnedImage(pin, f.options)).rejects.toThrow("REGISTRY_DIGEST_MISMATCH");
  expect(pullsOf(f)).toEqual([]);
});

test("both sources throttled: bounded rounds, then unavailable", async () => {
  const last = failure("toomanyrequests: Rate exceeded");
  const throttles = [...Array(5)].map(() => failure("Too Many Requests"));
  const f = fixture({ pulls: [...throttles, last] });
  const error = await ensurePinnedImage(pin, f.options).catch((e) => e);
  expect(error.message).toBe("REGISTRY_SOURCES_UNAVAILABLE");
  expect(error.cause).toBe(last);
  expect(pullsOf(f)).toHaveLength(2 * (REGISTRY_RETRY_DELAYS_MS.length + 1));
  expect(f.waits).toEqual([...REGISTRY_RETRY_DELAYS_MS]);
});

test("both throttled once, then the primary answers on the bounded retry", async () => {
  const f = fixture({ pulls: [failure("Rate exceeded"), failure("Rate exceeded"), "ok"] });
  expect(await ensurePinnedImage(pin, f.options)).toMatchObject({ ref: ecr, attempts: 3 });
  expect(f.waits).toEqual([15_000]);
});

test.each([
  "unauthorized: authentication required",
  "manifest unknown",
  "connection refused",
  "pull timed out",
])("%s stops at once: no retry and no fallback", async (message) => {
  const error = failure(message),
    f = fixture({ pulls: [error] });
  await expect(ensurePinnedImage(pin, f.options)).rejects.toBe(error);
  expect(pullsOf(f)).toHaveLength(1);
  expect(f.waits).toEqual([]);
});

test("a mirror that does not hold the digest stops the run", async () => {
  const error = failure("manifest for postgrest/postgrest@sha256:… not found: manifest unknown");
  const f = fixture({ pulls: [failure("toomanyrequests: Data limit exceeded"), error] });
  await expect(ensurePinnedImage(pin, f.options)).rejects.toBe(error);
  expect(f.waits).toEqual([]);
});

test("an unavailable daemon is not treated as a missing image", async () => {
  const error = failure("Cannot connect to the Docker daemon"),
    f = fixture({ inspectError: error });
  await expect(ensurePinnedImage(pin, f.options)).rejects.toBe(error);
  expect(f.calls).toHaveLength(1);
});

test("the transport check runs exactly the verified reference and records it", () => {
  const check = fs.readFileSync("scripts/recruiter-domain-conflict-check.mjs", "utf8");
  expect(check).toContain("ensurePinnedImage(POSTGREST_14_IMAGE)");
  // The image run is the returned reference: no tag is ever passed to docker.
  expect(check).toMatch(/`127\.0\.0\.1:\$\{port\}:3000`,\s*postgrest\.ref,/);
  expect(check).not.toMatch(/postgrest:v14\.15/);
  expect(check).toContain("postgrestImage: postgrestEvidence");
});
