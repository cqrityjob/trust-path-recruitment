/**
 * Does the artifact contain what the manifest says it contains?
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────
 *
 * The manifest lists every evidence file with a SHA-256 and asks a reviewer
 * to believe it. Nothing checked that those digests describe the bytes
 * actually being uploaded, that the captures the walk claims to take were
 * taken, or that the head recorded is the head the job ran on. A manifest
 * that is wrong about its own artifact is worse than no manifest: it is a
 * false assurance in the one place a reviewer looks for assurance.
 *
 * This runs after the manifest and BEFORE the upload, and fails the job
 * rather than publishing an artifact that misdescribes itself.
 *
 * It also prints the evidence inventory to the job log, in full. That is
 * deliberate: a reviewer who cannot download the artifact — an egress policy,
 * a expired retention, a phone — can still read what was in it, and can check
 * a downloaded copy against this listing later.
 *
 * Run: bun run scripts/e4-evidence-verify.ts
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const OUT = "artifacts/employer-final-report-e4";

/** Every capture the walk claims to take, and what each one is evidence of.
 *  Named here rather than counted, so a walk that silently stops taking one
 *  fails instead of publishing a smaller artifact. */
const REQUIRED_CAPTURES: readonly (readonly [string, string])[] = [
  ["01-sv-1440-preview-first", "sv · 1440 · before a preview, finalisation is not offered"],
  ["02-sv-1440-exact-preview-two-assessors", "sv · 1440 · the exact preview, both assessors"],
  ["03-sv-1440-stale-preview-refused", "sv · 1440 · the basis moved, the server refused"],
  ["04-sv-1440-finalise-focused", "sv · 1440 · the act reached BY KEYBOARD"],
  ["05-sv-1440-immutable-final-v1", "sv · 1440 · the immutable report, version 1"],
  ["06-sv-1440-two-versions", "sv · 1440 · a correction made version 2"],
  ["07-sv-1440-historical-version-opened", "sv · 1440 · version 1 still readable"],
  ["08-sv-1440-member-not-offered-finalisation", "sv · 1440 · a member may read, not finalise"],
  ["09-sv-1440-candidate-denied", "sv · 1440 · the candidate is denied"],
  ["10-en-375-preview-first", "en · 375 · before a preview"],
  ["11-en-375-exact-preview", "en · 375 · the exact preview"],
  ["12-en-375-finalise-focused", "en · 375 · the act reached BY KEYBOARD"],
  ["13-en-375-immutable-final", "en · 375 · the immutable report"],
  ["14-en-1440-immutable-final", "en · 1440 · the immutable report"],
  ["15-en-1440-two-assessors-disagreement", "en · 1440 · both assessors, disagreement stated"],
  ["16-sv-375-version-two", "sv · 375 · the corrected report"],
  ["17-sv-375-history-version-one", "sv · 375 · the version it kept"],
];

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

const manifestPath = path.join(root, OUT, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("REFUSED: there is no manifest, so nothing describes this artifact.");
  process.exit(1);
}

interface EvidenceEntry {
  file: string;
  bytes: number;
  sha256: string;
}
interface Manifest {
  head?: string;
  mergeSha?: string | null;
  baseSha?: string;
  migrationCount?: number;
  migrationTreeSha256?: string;
  toolchain?: Record<string, string | null>;
  locales?: string[];
  viewports?: string[];
  results?: unknown;
  evidence?: EvidenceEntry[];
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
const problems: string[] = [];

/* ── 1 · the head is the commit this job ran on ────────────────────── */
const expectedHead = process.env.E4_HEAD_SHA?.trim();
if (expectedHead && manifest.head !== expectedHead) {
  problems.push(`the manifest names head ${manifest.head}, but this job ran on ${expectedHead}`);
}

/* ── 2 · every listed digest describes the bytes on disk ───────────── */
const evidence = manifest.evidence ?? [];
let rechecked = 0;
for (const entry of evidence) {
  const abs = path.join(root, entry.file);
  if (!existsSync(abs)) {
    problems.push(`the manifest lists ${entry.file}, which is not there`);
    continue;
  }
  const buf = readFileSync(abs);
  if (sha256(buf) !== entry.sha256) {
    problems.push(`${entry.file} does not match its recorded digest`);
  }
  if (buf.length !== entry.bytes) {
    problems.push(`${entry.file} is ${buf.length} bytes, recorded as ${entry.bytes}`);
  }
  rechecked += 1;
}

/* ── 3 · every capture the walk claims to take was taken ───────────── */
const captures = new Map<string, EvidenceEntry>();
for (const entry of evidence) {
  if (entry.file.startsWith(`${OUT}/`) && entry.file.endsWith(".png")) {
    captures.set(path.basename(entry.file, ".png"), entry);
  }
}
for (const [name] of REQUIRED_CAPTURES) {
  if (!captures.has(name)) problems.push(`the capture ${name}.png was never taken`);
}
// An empty PNG is a file, not a screenshot.
for (const [name, entry] of captures) {
  if (entry.bytes < 5_000)
    problems.push(`${name}.png is only ${entry.bytes} bytes — too small to be a screenshot`);
}

/* ── 4 · both languages at both widths are represented ─────────────── */
for (const marker of ["-sv-1440-", "-en-1440-", "-sv-375-", "-en-375-"]) {
  const seen = [...captures.keys()].filter((n) => n.includes(marker)).length;
  if (seen === 0) problems.push(`no capture covers ${marker.replaceAll("-", " ").trim()}`);
}

/* ── 5 · a trace exists, because a green run must still show its work ─ */
const traces = evidence.filter((e) => e.file.endsWith("trace.zip"));
if (traces.length === 0) {
  problems.push("no trace was retained, so nothing records what the browser actually did");
}

/* ── the inventory, printed in full ────────────────────────────────── */
console.log("e4 evidence verification");
console.log(`  head              ${manifest.head}`);
console.log(`  merge commit      ${manifest.mergeSha ?? "(none — not a pull_request event)"}`);
console.log(`  base              ${manifest.baseSha}`);
console.log(`  migrations        ${manifest.migrationCount} (${manifest.migrationTreeSha256})`);
console.log(
  `  supabase CLI      ${manifest.toolchain?.supabaseCli} (pinned ${manifest.toolchain?.supabaseCliPinned})`,
);
console.log(
  `  locales/viewports ${(manifest.locales ?? []).join(", ")} · ${(manifest.viewports ?? []).join(", ")}`,
);
console.log(
  `  files             ${evidence.length}, ${rechecked} digest(s) recomputed and matched`,
);
console.log(`  traces            ${traces.length}`);

console.log("\n  CAPTURES (name · bytes · sha256 · what it shows)");
for (const [name, what] of REQUIRED_CAPTURES) {
  const e = captures.get(name);
  console.log(
    `    ${e ? "ok " : "MISSING "} ${name}  ${e?.bytes ?? "-"}  ${e?.sha256 ?? "-"}  ${what}`,
  );
}

console.log("\n  EVERY FILE (sha256 · bytes · path)");
for (const e of [...evidence].sort((a, b) => a.file.localeCompare(b.file))) {
  console.log(`    ${e.sha256}  ${String(e.bytes).padStart(9)}  ${e.file}`);
}

/* ── the walk's own results and timings, so a hang is visible ──────── */
const timingsPath = path.join(root, OUT, "timings.json");
if (existsSync(timingsPath)) {
  const timings = JSON.parse(readFileSync(timingsPath, "utf8")) as {
    test: string;
    step: string;
    ms: number;
  }[];
  console.log("\n  DURATIONS (ms · test · step)");
  for (const t of timings) {
    console.log(`    ${String(t.ms).padStart(7)}  ${t.test}  ${t.step}`);
  }
}

const results = manifest.results as
  | { suites?: { specs?: { title?: string; ok?: boolean }[] }[]; stats?: Record<string, unknown> }
  | null
  | undefined;
if (results?.stats) {
  console.log(`\n  PLAYWRIGHT STATS  ${JSON.stringify(results.stats)}`);
}
for (const suite of results?.suites ?? []) {
  for (const spec of suite.specs ?? []) {
    console.log(`    ${spec.ok ? "pass" : "FAIL"}  ${spec.title}`);
    if (!spec.ok) problems.push(`the walk did not pass: ${spec.title}`);
  }
}

if (problems.length > 0) {
  console.error("\nREFUSED: the artifact does not match what the manifest claims.\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\nNothing was uploaded. An artifact that misdescribes itself is worse than\n" +
      "no artifact: it is a false assurance in the one place a reviewer looks.",
  );
  process.exit(1);
}

console.log(
  `\n  verified — ${statSync(manifestPath).size} byte manifest describes every one of ${evidence.length} files`,
);
