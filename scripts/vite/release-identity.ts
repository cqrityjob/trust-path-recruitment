import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { Plugin } from "vite";

/** Public build provenance contains no environment values or user data.
 * The source digest also works when the publisher omits Git metadata. */
export function releaseIdentity(root = process.cwd()) {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const item of readdirSync(resolve(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${item.name}`;
      if (item.isDirectory()) walk(path);
      else if (item.isFile() && path !== "src/routeTree.gen.ts") files.push(path);
    }
  };
  walk("src");
  walk("scripts/vite");
  files.push("package.json", "bun.lock", "vite.config.ts");
  const digest = createHash("sha256");
  for (const file of files.sort()) {
    digest
      .update(relative(root, resolve(root, file)))
      .update("\0")
      .update(readFileSync(resolve(root, file)))
      .update("\0");
  }
  let commitSha: string | null = null;
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (/^[a-f0-9]{40}$/.test(sha)) commitSha = sha;
  } catch {
    /* The source digest is the fallback proof, never an invented SHA. */
  }
  return { formatVersion: 1, commitSha, sourceTreeSha256: digest.digest("hex") };
}

export function releaseIdentityAsset(): Plugin {
  return {
    name: "cqrity-release-identity",
    apply: "build",
    generateBundle() {
      if (this.environment && this.environment.name !== "client") return;
      this.emitFile({
        type: "asset",
        fileName: "release-identity.json",
        source: JSON.stringify(releaseIdentity()),
      });
    },
  };
}
