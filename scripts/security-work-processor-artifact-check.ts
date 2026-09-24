/** Synthetic local artifact and redacted configuration checks. No network or external state. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const state = mkdtempSync(join(tmpdir(), "sw-artifact-check-"));
const a = join(state, "a");
const b = join(state, "b");
const runtime = JSON.parse(
  readFileSync(join(root, "scripts/security-work-processor-runtime.json"), "utf8"),
);
const node = process.env.SW_PROCESSOR_NODE_BINARY ?? "node";
const run = (binary: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(binary, args, {
    cwd: state,
    env: { PATH: process.env.PATH ?? "", ...env },
    encoding: "utf8",
    timeout: 30_000,
  });
let checks = 0;
try {
  for (const path of [a, b]) {
    const built = run("bun", ["run", join(root, "scripts/security-work-processor-build.ts"), path]);
    assert.equal(built.status, 0, "Standalone artifact build must pass.");
  }
  const marker = "sw-processor-artifact.json";
  assert.equal(readFileSync(join(a, marker), "utf8"), readFileSync(join(b, marker), "utf8"));
  checks += 1;
  writeFileSync(join(b, ".env"), "synthetic-secret-not-for-build-output");
  assert.notEqual(
    run("bun", ["run", join(root, "scripts/security-work-processor-build.ts"), b]).status,
    0,
  );
  assert.equal(readFileSync(join(b, ".env"), "utf8"), "synthetic-secret-not-for-build-output");
  rmSync(join(b, ".env"));
  checks += 1;
  assert.equal(
    run(node, [join(a, "verify.mjs")]).status,
    0,
    `Use Node ${runtime.node}, or set SW_PROCESSOR_NODE_BINARY to its path.`,
  );
  checks += 1;
  for (const mutate of [
    () => writeFileSync(join(b, "server.mjs"), "changed executable"),
    () => writeFileSync(join(b, "unexpected.env"), "synthetic unexpected content"),
    () => rmSync(join(b, "server.mjs")),
    () => {
      const value = JSON.parse(readFileSync(join(b, marker), "utf8"));
      value.runtime.node = "0.0.0";
      writeFileSync(join(b, marker), JSON.stringify(value));
    },
  ]) {
    rmSync(b, { recursive: true });
    cpSync(a, b, { recursive: true });
    mutate();
    assert.equal(
      run(node, [join(b, "verify.mjs")]).status,
      1,
      "Modified or incompatible artifact must be rejected.",
    );
    checks += 1;
  }
  const secret = "synthetic-secret-must-never-appear-0000000000";
  const env = {
    SW_PROCESSOR_ENABLED: "true",
    SW_PROCESSOR_URL: "https://processor.invalid/v1/extract",
    SW_PROCESSOR_EXPECTED_ORIGIN: "https://processor.invalid",
    SW_PROCESSOR_AUTH_TOKEN: secret,
    SW_PROCESSOR_DATA_PROCESSING_APPROVAL: "synthetic-offline-only",
    SW_WORKER_KEY_ID: "synthetic",
    SW_WORKER_SECRET: "synthetic-separate-worker-secret-000000000000",
  };
  const valid = run(node, [join(a, "config-check.mjs")], env);
  assert.equal(valid.status, 0);
  assert(!valid.stdout.includes(secret) && !valid.stderr.includes(secret));
  checks += 1;
  const invalid = run(node, [join(a, "config-check.mjs")], {
    ...env,
    SW_PROCESSOR_URL: `https://${secret}@processor.invalid/v1/extract`,
  });
  assert.equal(invalid.status, 1);
  assert(!invalid.stdout.includes(secret) && !invalid.stderr.includes(secret));
  checks += 1;
  const dockerfile = readFileSync(join(root, "deploy/security-work-processor/Dockerfile"), "utf8");
  assert(
    dockerfile.includes(`FROM ${runtime.nodeImage}`) &&
      dockerfile.includes(`FROM ${runtime.bunImage}`),
  );
  checks += 1;
  console.log(
    `Security Work processor artifact: ${checks} checks passed; deterministic files, tamper rejection, exact pins and redacted offline configuration.`,
  );
} finally {
  rmSync(state, { recursive: true, force: true });
}
