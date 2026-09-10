/**
 * The evidence manifest: what a reader needs to believe a screenshot.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────
 *
 * A directory of PNGs proves nothing on its own. It does not say which commit
 * produced them, whether that commit is the one under review, which stack they
 * were taken against, or whether every state the phase claims was actually
 * exercised. A reviewer who cannot answer those questions is being asked to
 * take the pictures on trust, which is the thing this whole phase exists to
 * avoid.
 *
 * So every run writes a machine-readable record beside the captures: the HEAD
 * they were taken at, the base, the workflow run, the tool versions, the
 * SHA-256 of the spec and the workflow that produced them, the SHA-256 of the
 * migration tree the stack was built from, and the SHA-256 of every evidence
 * file. `manifest.head` is what a reviewer compares against the PR head; if
 * they differ, the artifact is from another commit and is not evidence for
 * this one.
 *
 * Written on success AND failure, because a failed run's manifest is how
 * somebody works out what it got as far as.
 *
 * Run: bun run scripts/e4-evidence-manifest.ts
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const OUT_DIR = "artifacts/employer-final-report-e4";

const sha256 = (buf: Buffer | string) => createHash("sha256").update(buf).digest("hex");

const fileHash = (rel: string) =>
  existsSync(path.join(root, rel)) ? sha256(readFileSync(path.join(root, rel))) : null;

/** Every file under a directory, recursively, repo-relative. */
function walk(rel: string): string[] {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const child = path.join(rel, name);
    if (statSync(path.join(root, child)).isDirectory()) out.push(...walk(child));
    else out.push(child);
  }
  return out.sort();
}

/** A version string, or the reason there isn't one. Never throws: a manifest
 *  that fails to build tells a reader nothing at all. */
function version(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" }).trim().split("\n")[0];
  } catch (err) {
    return `unavailable (${(err as Error).message.split("\n")[0]})`;
  }
}

/** One hash over the whole migration tree, so "the stack was built from this
 *  schema" is checkable rather than asserted. */
function migrationTreeHash(): { count: number; digest: string } {
  const files = walk("supabase/migrations").filter((f) => f.endsWith(".sql"));
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f);
    h.update(readFileSync(path.join(root, f)));
  }
  return { count: files.length, digest: h.digest("hex") };
}

/** Playwright's own JSON, when the reporter produced one: the authoritative
 *  answer to "which states were actually exercised". */
function playwrightResults(): unknown {
  for (const candidate of ["playwright-report/results.json", "test-results/results.json"]) {
    if (existsSync(path.join(root, candidate))) {
      try {
        return JSON.parse(readFileSync(path.join(root, candidate), "utf8"));
      } catch {
        return { unparseable: candidate };
      }
    }
  }
  return null;
}

const evidenceFiles = [...walk(OUT_DIR), ...walk("playwright-report"), ...walk("test-results")];

const migrations = migrationTreeHash();

const manifest = {
  kind: "e4-employer-final-report-browser-evidence",
  schemaVersion: 1,

  repository: process.env.GITHUB_REPOSITORY ?? "(local run)",
  pullRequest:
    process.env.GITHUB_EVENT_NAME === "pull_request" ? (process.env.GITHUB_REF_NAME ?? null) : null,
  pullRequestNumber: process.env.PR_NUMBER ?? null,

  // What a reviewer compares against the PR head. If these differ, the
  // artifact belongs to another commit.
  head: process.env.GITHUB_SHA ?? version("git", ["rev-parse", "HEAD"]),
  base: process.env.GITHUB_BASE_REF ?? null,
  baseSha: version("git", ["rev-parse", "origin/main"]),

  workflowRunId: process.env.GITHUB_RUN_ID ?? null,
  workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  workflowRunUrl:
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null,

  capturedAtUtc: new Date().toISOString(),

  // The two files that decide what the walk does. A capture set is only
  // comparable with another if these match.
  workflowSha256: fileHash(".github/workflows/e4-evidence.yml"),
  specSha256: fileHash("e2e/employer-final-report-evidence.spec.ts"),
  fixtureSha256: fileHash("scripts/fixtures/employer-final-report-fixture.sql"),
  journeyFixtureSha256: fileHash("scripts/fixtures/interview-journey-fixture.sql"),

  migrationCount: migrations.count,
  migrationTreeSha256: migrations.digest,

  toolchain: {
    supabaseCli: version("supabase", ["--version"]),
    docker: version("docker", ["--version"]),
    node: version("node", ["--version"]),
    bun: version("bun", ["--version"]),
    playwright: version("bunx", ["playwright", "--version"]),
    chromium: (() => {
      try {
        const dirs = readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium"));
        return dirs.join(", ") || "unknown";
      } catch {
        return "unknown";
      }
    })(),
  },

  // What the walk is supposed to cover. Recorded so a reviewer can compare
  // intent against `results`, rather than counting PNGs.
  locales: ["sv", "en"],
  viewports: ["1440x1000", "375x812"],

  results: playwrightResults(),

  evidence: evidenceFiles.map((f) => ({
    file: f,
    bytes: statSync(path.join(root, f)).size,
    sha256: sha256(readFileSync(path.join(root, f))),
  })),
};

const target = path.join(root, OUT_DIR, "manifest.json");
writeFileSync(target, JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(`evidence manifest written: ${OUT_DIR}/manifest.json`);
console.log(`  head              ${manifest.head}`);
console.log(
  `  migrations        ${manifest.migrationCount} (${manifest.migrationTreeSha256.slice(0, 16)}…)`,
);
console.log(`  evidence files    ${manifest.evidence.length}`);
if (manifest.evidence.length === 0) {
  console.log("  NOTE: no evidence files were produced — the walk did not capture anything.");
}
