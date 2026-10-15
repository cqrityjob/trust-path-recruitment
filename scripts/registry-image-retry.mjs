import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

export const REGISTRY_RETRY_DELAYS_MS = Object.freeze([15_000, 30_000]);
const commandOptions = { stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 };
const THROTTLE = /toomanyrequests|rate exceeded|too many requests|data limit exceeded/i;
function diagnostic(error) {
  return String(error?.stderr ?? "") + " " + String(error?.message ?? "");
}

/**
 * The one PostgREST image the CI transport checks may run: PostgREST v14.15
 * for linux/amd64 (the GitHub-hosted runner), pinned by its platform manifest
 * digest. Verified on 2026-10-15 against both registries' manifest APIs: the
 * same OCI index (sha256:2f8e7b65…0326) and the same linux/amd64 manifest,
 * whose sha256 over the served bytes is `digest`, with config `imageId`.
 * Docker reports the image id as the config digest with the classic image
 * store and as the manifest digest with the containerd store; those two
 * values, and no other, are accepted. Docker Hub is a fallback ONLY because it serves those identical
 * bytes: a pull by digest cannot return anything else, and what arrives is
 * inspected again before it may run. A source that does not hold this digest
 * fails its pull and is never used.
 */
export const POSTGREST_14_IMAGE = Object.freeze({
  tag: "v14.15",
  platform: "linux/amd64",
  digest: "sha256:8b0f6ea9d98a9b13ac7ed331ba7084abc75b39e5222fb8b1a276b3437a307e7e",
  imageId: "sha256:517a249b3cd058c5515551410da1f5ad4270d74a91fb925ee78f6a9e96fcb241",
  sources: Object.freeze(["public.ecr.aws/supabase/postgrest", "postgrest/postgrest"]),
});

const INSPECT_FORMAT = "{{json .RepoDigests}}|{{.Id}}|{{.Os}}/{{.Architecture}}";

function verify(run, pin, ref) {
  const out = String(
    run("docker", ["image", "inspect", "--format", INSPECT_FORMAT, ref], commandOptions),
  ).trim();
  const [digests, id, platform] = out.split("|");
  let repoDigests = [];
  try {
    repoDigests = JSON.parse(digests);
  } catch {
    /* unreadable inspect output is a mismatch, below */
  }
  if (
    !Array.isArray(repoDigests) ||
    !repoDigests.includes(ref) ||
    ![pin.imageId, pin.digest].includes(id) ||
    platform !== pin.platform
  ) {
    const error = new Error("REGISTRY_DIGEST_MISMATCH");
    error.detail = { ref, repoDigests, id, platform };
    throw error;
  }
  return { imageId: id, platform };
}

/**
 * Obtain the pinned image and return the immutable reference to run, with
 * where it came from.
 *
 * Order: an already present copy from any source; then each source in turn,
 * by digest. Only a registry throttle moves on to the next source, and only a
 * throttle from every source waits for a bounded retry (two, at 15 s and
 * 30 s). Any other failure (denied, unknown manifest, a broken daemon, a
 * timeout) stops at once. Every copy, cached or pulled, is inspected: a
 * different repo digest, image id or platform is refused, and a pulled one is
 * removed again.
 */
export async function ensurePinnedImage(
  pin,
  { run = execFileSync, wait = sleep, onRetry = console.warn } = {},
) {
  for (const repo of pin.sources) {
    const ref = `${repo}@${pin.digest}`;
    try {
      run("docker", ["image", "inspect", ref], commandOptions);
    } catch (error) {
      // A broken daemon, denied access or inspect timeout is not a cache miss.
      if (!/no such (?:image|object)|image.*not found/i.test(diagnostic(error))) throw error;
      continue;
    }
    return {
      ref,
      source: repo,
      via: "cache",
      attempts: 0,
      digest: pin.digest,
      ...verify(run, pin, ref),
    };
  }
  let attempts = 0;
  let last;
  for (let round = 0; ; round++) {
    for (const repo of pin.sources) {
      const ref = `${repo}@${pin.digest}`;
      attempts++;
      try {
        run("docker", ["pull", "--platform", pin.platform, ref], commandOptions);
      } catch (error) {
        if (!THROTTLE.test(diagnostic(error))) throw error;
        last = error;
        onRetry(`Registry throttle for ${ref}.`);
        continue;
      }
      try {
        return {
          ref,
          source: repo,
          via: "registry",
          attempts,
          digest: pin.digest,
          ...verify(run, pin, ref),
        };
      } catch (error) {
        try {
          run("docker", ["image", "rm", ref], commandOptions);
        } catch {
          /* nothing to remove */
        }
        throw error;
      }
    }
    const delay = REGISTRY_RETRY_DELAYS_MS[round];
    if (delay === undefined) break;
    onRetry(
      `Every verified source throttled; bounded retry ${round + 2}/${REGISTRY_RETRY_DELAYS_MS.length + 1} in ${delay}ms.`,
    );
    await wait(delay);
  }
  const error = new Error("REGISTRY_SOURCES_UNAVAILABLE");
  error.cause = last;
  throw error;
}
