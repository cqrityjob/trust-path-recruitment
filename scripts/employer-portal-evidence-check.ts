/**
 * employer-portal-evidence:check — the committed before/after image pair is
 * complete, named for the commits it shows, and not stale.
 *
 * The pair in artifacts/employer-portal-ux/ is what a reviewer looks at
 * instead of running the suite. Two ways it can mislead:
 *
 *   1. INCOMPLETE. A cancelled or failed photograph job, or an artifact
 *      download that silently failed, leaves a manifest of five shots where
 *      twenty-four are expected, or a manifest naming files that are not
 *      there. The workflow once committed exactly that.
 *   2. STALE. An image commit on a newer head does not prove the images show
 *      the newer code: SOURCE.txt names the commit each set was photographed
 *      from, and if a watched path changed between that commit and the head
 *      under review, the pair describes code the reviewer is not looking at.
 *
 * (1) is checked from the files alone. (2) needs the head under review and a
 * way to compare commits: EVIDENCE_HEAD_SHA (and EVIDENCE_BASE_SHA for the
 * before-set) plus GH_TOKEN and GITHUB_REPOSITORY for GitHub's compare API.
 * Without them the staleness check is reported as not run, never as passed.
 *
 * On an intermediate head of a pull request this check is EXPECTED to fail
 * on staleness right after a code push, until employer-portal-ux-evidence.yml
 * commits the fresh pair; the stabilised head a reviewer reads is the one
 * where it passes.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = "artifacts/employer-portal-ux";
const AREAS = [
  "overview",
  "jobs",
  "applications",
  "assessments",
  "interviews",
  "reports",
  "requirements",
] as const;
const LANGS = ["sv", "en"] as const;
const WIDTHS = [1440, 375] as const;
/** The paths whose change makes a photograph out of date: the same list the
 *  evidence workflow's `changed` job watches. */
const WATCHED =
  /^src\/components\/(employer|recruitment|academy)\/|^src\/routes\/_authenticated\.employer\.|^src\/i18n\/|^e2e\/employer-portal-ux-evidence\.spec\.ts$|^e2e\/support\/(employer-portal-fixture|public-entry-harness)\.ts$/;
const SHA = /^[0-9a-f]{40}$/;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const failures: string[] = [];
const notes: string[] = [];
const fail = (m: string) => failures.push(m);

type Mode = "before" | "after";
type Source = Record<string, string>;

function readSource(mode: Mode): Source | null {
  const file = path.join(ROOT, mode, "SOURCE.txt");
  if (!existsSync(file)) {
    fail(`${mode}: SOURCE.txt is missing; nothing says which commit was photographed.`);
    return null;
  }
  const out: Source = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([a-z-]+):\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!.trim();
  }
  if (out.mode !== mode)
    fail(`${mode}: SOURCE.txt says mode "${out.mode ?? ""}", expected "${mode}".`);
  const shaKey = mode === "after" ? "head" : "base";
  if (!SHA.test(out[shaKey] ?? "")) fail(`${mode}: SOURCE.txt has no 40-hex "${shaKey}:" line.`);
  return out;
}

function checkSet(mode: Mode) {
  const dir = path.join(ROOT, mode);
  const expected = new Set<string>();
  for (const area of AREAS)
    for (const lang of LANGS)
      for (const width of WIDTHS) expected.add(`${mode}-${area}-${lang}-${width}.png`);

  const manifestFile = path.join(dir, "manifest.json");
  if (!existsSync(manifestFile)) {
    fail(`${mode}: manifest.json is missing.`);
    return;
  }
  let shots: { file: string; note: string }[] = [];
  try {
    shots = (JSON.parse(readFileSync(manifestFile, "utf8")) as { shots: typeof shots }).shots ?? [];
  } catch (e) {
    fail(`${mode}: manifest.json is not JSON (${(e as Error).message}).`);
    return;
  }
  const listed = new Set(shots.map((s) => s.file));
  for (const name of expected)
    if (!listed.has(name)) fail(`${mode}: manifest lacks ${name}; the set is incomplete.`);
  for (const name of listed)
    if (!expected.has(name))
      fail(`${mode}: manifest lists ${name}, which no area/language/width produces.`);
  for (const name of listed) {
    const file = path.join(dir, name);
    if (!existsSync(file)) {
      fail(`${mode}: manifest lists ${name} but the file is missing.`);
      continue;
    }
    const head = Buffer.alloc(8);
    const fd = readFileSync(file);
    fd.copy(head, 0, 0, 8);
    if (statSync(file).size === 0 || !head.equals(PNG))
      fail(`${mode}: ${name} is not a PNG image.`);
  }
  for (const entry of readdirSync(dir))
    if (entry.endsWith(".png") && !listed.has(entry))
      fail(
        `${mode}: ${entry} is on disk but not in the manifest; a stale file from an older pair.`,
      );
  if (failures.length === 0) notes.push(`${mode}: ${listed.size} shots, all present, all PNG.`);
}

async function changedFiles(
  repo: string,
  token: string,
  from: string,
  to: string,
): Promise<string[] | null> {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/compare/${from}...${to}?per_page=250`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { files?: { filename: string }[] };
  return (body.files ?? []).map((f) => f.filename);
}

async function checkStaleness(mode: Mode, source: Source | null, target: string | undefined) {
  if (!source) return;
  const photographed = source[mode === "after" ? "head" : "base"] ?? "";
  if (!target) {
    notes.push(
      `${mode}: staleness NOT checked (no ${mode === "after" ? "EVIDENCE_HEAD_SHA" : "EVIDENCE_BASE_SHA"}).`,
    );
    return;
  }
  if (!SHA.test(target)) {
    fail(`${mode}: the commit to compare with ("${target}") is not a 40-hex SHA.`);
    return;
  }
  if (photographed === target) {
    notes.push(`${mode}: photographed from ${target.slice(0, 7)}, the commit under review.`);
    return;
  }
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    fail(
      `${mode}: photographed from ${photographed.slice(0, 7)} but the commit under review is ${target.slice(0, 7)}, and without GITHUB_REPOSITORY and GH_TOKEN the two cannot be compared.`,
    );
    return;
  }
  const files = await changedFiles(repo, token, photographed, target);
  if (files === null) {
    fail(
      `${mode}: photographed from ${photographed.slice(0, 7)}; the range to ${target.slice(0, 7)} could not be compared (rewritten history, or the commit is gone).`,
    );
    return;
  }
  const hits = files.filter((f) => WATCHED.test(f));
  if (hits.length)
    fail(
      `${mode}: STALE. Photographed from ${photographed.slice(0, 7)}, but ${target.slice(0, 7)} changed what is photographed: ${hits.slice(0, 8).join(", ")}${hits.length > 8 ? ", …" : ""}. The evidence workflow commits a fresh pair for a push that changes these paths.`,
    );
  else
    notes.push(
      `${mode}: photographed from ${photographed.slice(0, 7)}; nothing photographed changed up to ${target.slice(0, 7)} (${files.length} other file(s) did).`,
    );
}

const before = readSource("before");
const after = readSource("after");
checkSet("before");
checkSet("after");
if (before && after && before.suite && after.head && before.suite !== after.head)
  notes.push(
    `before: suite taken from ${before.suite.slice(0, 7)}, after photographed from ${after.head.slice(0, 7)} (the pair may come from two runs; each set is checked on its own).`,
  );
await checkStaleness("after", after, process.env.EVIDENCE_HEAD_SHA || undefined);
await checkStaleness("before", before, process.env.EVIDENCE_BASE_SHA || undefined);

for (const n of notes) console.log(`[employer-portal-evidence:check] ${n}`);
for (const f of failures) console.error(`[employer-portal-evidence:check][error] ${f}`);
if (failures.length) {
  console.error(`employer-portal-evidence:check FAILED with ${failures.length} error(s).`);
  process.exit(1);
}
console.log("employer-portal-evidence:check PASS");
