/**
 * The routed walk's own record: what ran, on which commit, how long each phase
 * and step took, and the digest of every file it produced.
 *
 * It reads what the walk itself wrote — `timings.jsonl`, one line per step, in
 * the order the steps happened — rather than being told. A manifest that
 * described a run it did not observe would be a story, not evidence.
 *
 * Traces are DIGESTED, NOT COPIED. A Playwright trace records the network, so
 * it carries the signed-in session's bearer token; it is kept out of the
 * repository for that reason and named here so a reviewer reproducing the run
 * knows exactly which files to expect.
 *
 * Run: bun run beskt-routed-evidence:manifest
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.env.BCP_EVIDENCE_DIR ?? "artifacts/beskt-candidate-preparation/live";
const TRACE_DIR = process.env.BCP_TRACE_DIR ?? "/tmp/beskt-routed-traces";

interface Timing {
  readonly phase: string;
  readonly step: string;
  readonly ms: number;
  readonly project: string;
  readonly at: string;
}

function head(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

function readTimings(): Timing[] {
  const file = path.join(OUT, "timings.jsonl");
  if (!existsSync(file)) {
    console.error(`REFUSED: ${file} does not exist — the walk has not run.`);
    process.exit(1);
  }
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Timing);
}

const timings = readTimings();
const projects = [...new Set(timings.map((t) => t.project))].sort();

/** Phase totals, per project, in the order the phases first occurred. */
const phases: { project: string; phase: string; steps: number; ms: number }[] = [];
for (const t of timings) {
  const found = phases.find((p) => p.project === t.project && p.phase === t.phase);
  if (found) {
    found.steps += 1;
    found.ms += t.ms;
  } else {
    phases.push({ project: t.project, phase: t.phase, steps: 1, ms: t.ms });
  }
}

const screenshots = readdirSync(OUT)
  .filter((f) => f.endsWith(".png"))
  .sort()
  .map((f) => ({
    file: f,
    bytes: statSync(path.join(OUT, f)).size,
    sha256: digest(path.join(OUT, f)),
  }));

const traces = existsSync(TRACE_DIR)
  ? readdirSync(TRACE_DIR)
      .filter((p) => statSync(path.join(TRACE_DIR, p)).isDirectory())
      .flatMap((project) =>
        readdirSync(path.join(TRACE_DIR, project))
          .filter((f) => f.endsWith(".zip"))
          .sort()
          .map((f) => ({
            project,
            file: f,
            bytes: statSync(path.join(TRACE_DIR, project, f)).size,
            sha256: digest(path.join(TRACE_DIR, project, f)),
          })),
      )
  : [];

const manifest = {
  what: "BESKT PR 3 candidate preparation — the ROUTED browser walk",
  kind: "the real application on its real routes, signed in, against a local Postgres + PostgREST stack",
  head: head(),
  builtAt: new Date().toISOString(),
  projects,
  totalMs: timings.reduce((sum, t) => sum + t.ms, 0),
  stepCount: timings.length,
  phases,
  steps: timings,
  screenshots,
  traces: {
    committed: false,
    why: "a trace records the network and therefore carries the session's bearer token",
    directory: TRACE_DIR,
    files: traces,
  },
};

writeFileSync(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const ms = (n: number) => `${(n / 1000).toFixed(1)} s`;

const index = `# BESKT PR 3 — candidate preparation, ROUTED browser evidence

Captured at HEAD \`${manifest.head}\`, ${manifest.stepCount} steps over
${projects.length} viewport(s), ${ms(manifest.totalMs)} of measured step time.

## What these captures are

The real application, on its real routes, signed in as real fixture accounts,
writing real rows through the governed RPCs. Not exported components and not
rendered markup: a browser walked

1. the employer's Testbibliotek, which names the method support and never
   calls it a test;
2. starting a preparation from an existing application, and the employer
   seeing **nothing** of the candidate's while it is still a draft;
3. the candidate's notice — all nine matters — with no question answerable
   until it is acknowledged;
4. answering, saving, leaving and resuming with the exact same answers;
5. taking one question orally and skipping another;
6. reviewing every response and correcting one;
7. submitting once, after which the screen is read-only;
8. the employer reading back the submitted basis, the omitted and
   discuss-orally states and the interview topics;
9. a second candidate refused this preparation, and a member of another
   employer refused the readback.

In Swedish and English, at ${projects.join(", ")}.

## The stack it ran against

Real PostgreSQL 16 carrying the full migration history, replayed as
\`postgres\` against the hosted privilege baseline. Real PostgREST enforcing
the real RLS as \`authenticator\`. Real routes, real server functions, real
\`auth.uid()\` read from a verified JWT.

**One part is substituted and it is named here rather than glossed:** GoTrue.
Its container image could not be fetched in the environment this was captured
in — every registry blob CDN answered 403 — so password sign-in, token refresh
and \`/auth/v1/user\` are served by \`scripts/local-stack/auth-gateway.mjs\`
against the same \`auth.users\` rows, with the same bcrypt verification and the
same HS256 secret PostgREST verifies with. Everything the walk asserts about
authorisation is still decided by the database.

## Traces

Captured with \`--trace on\`, and **not committed**: a trace records the
network, so it carries the signed-in session's bearer token. Their digests are
below so a reviewer reproducing the run can check they got the same files.

## Reproduce

\`\`\`
scripts/local-stack/up.sh
scripts/local-stack/run-routed-evidence.sh
\`\`\`

## Phase durations

| Project | Phase | Steps | Duration |
| --- | --- | ---: | ---: |
${phases.map((p) => `| ${p.project} | ${p.phase} | ${p.steps} | ${ms(p.ms)} |`).join("\n")}

## Screenshots

${screenshots.map((s) => `- \`${s.file}\` — \`${s.sha256.slice(0, 16)}…\` (${s.bytes} bytes)`).join("\n")}

## Traces (digested, not committed)

${
  traces.length === 0
    ? "_None recorded in this build._"
    : traces
        .map(
          (t) => `- \`${t.project}/${t.file}\` — \`${t.sha256.slice(0, 16)}…\` (${t.bytes} bytes)`,
        )
        .join("\n")
}
`;

writeFileSync(path.join(OUT, "INDEX.md"), index);

console.log(
  `routed evidence manifest: ${manifest.stepCount} steps, ${screenshots.length} screenshot(s), ${traces.length} trace(s) digested`,
);
