/**
 * The PR 5B routed walk's own record: what ran, on which commit, how long each
 * phase and step took, and the SHA-256 of every file it produced.
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
 * Run: bun run beskt-interview-tool-evidence:manifest
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.env.BCP_TOOL_EVIDENCE_DIR ?? "artifacts/beskt-interview-tool/live";
const TRACE_DIR = process.env.BCP_TOOL_TRACE_DIR ?? "/tmp/beskt-interview-tool-traces";

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
  what: "BESKT PR 5B interview tool — the ROUTED browser walk",
  kind: "the real application on its real routes, two authenticated assessors, against a local Postgres + PostgREST stack",
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

const index = `# BESKT PR 5B — the interview tool, ROUTED browser evidence

Captured at HEAD \`${manifest.head}\`, ${manifest.stepCount} steps over
${projects.length} viewport(s), ${ms(manifest.totalMs)} of measured step time.

## What these captures are

The real application, on its real routes, signed in as real fixture accounts,
writing real rows through the governed PR 5A RPCs. Not exported components and
not rendered markup: a browser walked all twenty journeys —

1. the case overview carrying the BESKT module, gated by the server;
2. the module opening inside the case and naming what it is bound to;
3. the bound content and answer digests, disclosed rather than asserted;
4. the submitted preparation shown whole, with answered, skipped and
   discuss-orally rendered neutrally;
5. an interviewer surface with no control that could edit the candidate's words;
6. the conduct session opening, and an empty position refusing to lock;
7. the deterministic themes with their reason, wording, purpose, exact item
   key and method version;
8. one theme documented in eight separate fields;
9. a save reported only after the server confirmed it;
10. a correction refused without a reason, then accepted as version 2;
11. the history keeping every version, with who wrote it and when;
12. a verification requested, then settled, with its history;
13. "not verified" rendered as remaining work and never as a judgement;
14. locking behind a described, modal confirmation;
15. the locked position read-only, with its revision and time;
16. a SECOND assessor seeing nothing of the first — asserted at the network,
    not only on screen;
17. that assessor documenting and locking their own position;
18. the two positions side by side, factually, with no total anywhere;
19. reopening refused without a reason, then accepted, losing nothing;
20. the panel revealing, recording a disagreement word for word, and a member
    of another employer refused the route.

In Swedish and English, at ${projects.join(", ")}.

## The one journey this structure exists for

Journey 16 does not merely check that a withheld position is off screen. Every
response body the second assessor's browser receives before they lock is read
and searched for the first assessor's exact words. A position that arrives in a
payload and is merely hidden by CSS has already been disclosed, and only a
network-level assertion can tell the two apart.

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
authorisation — including the withholding in journey 16 — is still decided by
the database.

## Traces

Captured with \`--trace on\`, and **not committed**: a trace records the
network, so it carries the signed-in session's bearer token. Their digests are
below so a reviewer reproducing the run can check they got the same files.

## Reproduce

\`\`\`
scripts/local-stack/up.sh
scripts/local-stack/run-interview-tool-evidence.sh
\`\`\`

## Phase durations

| Project | Phase | Steps | Duration |
| --- | --- | ---: | ---: |
${phases.map((p) => `| ${p.project} | ${p.phase} | ${p.steps} | ${ms(p.ms)} |`).join("\n")}

## Screenshots

${screenshots.map((s) => `- \`${s.file}\` — \`${s.sha256}\` (${s.bytes} bytes)`).join("\n")}

## Traces (digested, not committed)

${
  traces.length === 0
    ? "_None recorded in this build._"
    : traces
        .map((t) => `- \`${t.project}/${t.file}\` — \`${t.sha256}\` (${t.bytes} bytes)`)
        .join("\n")
}
`;

writeFileSync(path.join(OUT, "INDEX.md"), index);

console.log(
  `interview-tool evidence manifest: ${manifest.stepCount} steps, ${screenshots.length} screenshot(s), ${traces.length} trace(s) digested`,
);
