import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

export const REGISTRY_RETRY_DELAYS_MS = Object.freeze([15_000, 30_000]);
const commandOptions = { stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 };
function diagnostic(error) {
  return String(error?.stderr ?? "") + " " + String(error?.message ?? "");
}

/** Retry only a public-registry throttle while obtaining the same pinned image.
 * No container/database operation is retried or accepted on a failed pull. */
export async function ensureRegistryImage(
  image,
  { run = execFileSync, wait = sleep, onRetry = console.warn } = {},
) {
  try {
    run("docker", ["image", "inspect", image], commandOptions);
    return { source: "cache", attempts: 0 };
  } catch (error) {
    // A broken daemon, denied access or inspect timeout is not a cache miss.
    if (!/no such (?:image|object)|image.*not found/i.test(diagnostic(error))) throw error;
  }
  for (let attempt = 0; attempt <= REGISTRY_RETRY_DELAYS_MS.length; attempt++) {
    try {
      run("docker", ["pull", image], commandOptions);
      return { source: "registry", attempts: attempt + 1 };
    } catch (error) {
      const delay = REGISTRY_RETRY_DELAYS_MS[attempt];
      if (
        delay === undefined ||
        !/toomanyrequests|rate exceeded|too many requests/i.test(diagnostic(error))
      )
        throw error;
      onRetry(
        "Registry throttle for " +
          image +
          "; bounded retry " +
          (attempt + 2) +
          "/3 in " +
          delay +
          "ms.",
      );
      await wait(delay);
    }
  }
  throw new Error("REGISTRY_RETRY_EXHAUSTED");
}
