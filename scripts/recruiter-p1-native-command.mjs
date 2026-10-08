import fs from "node:fs";
import { spawnSync } from "node:child_process";

const MAX_OUTPUT_BYTES = 2_000_000;

// Machine-readable CLI status must use stdout only. The pinned CLI writes
// stopped-service warnings to stderr even when its JSON status succeeds.
// Both streams remain private; no process error, stack or output is exposed.
export function capturePrivateOutput(name, args, { cwd, env, stdoutFile, stderrFile }) {
  let stdoutFd, stderrFd;
  try {
    stdoutFd = fs.openSync(stdoutFile, "wx", 0o600);
    stderrFd = fs.openSync(stderrFile, "wx", 0o600);
    const result = spawnSync(name, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    const stdout = Buffer.from(result.stdout ?? "");
    const stderr = Buffer.from(result.stderr ?? "");
    fs.writeFileSync(stdoutFd, stdout.subarray(0, MAX_OUTPUT_BYTES));
    fs.writeFileSync(stderrFd, stderr.subarray(0, MAX_OUTPUT_BYTES));
    if (
      result.error ||
      result.status !== 0 ||
      stdout.length > MAX_OUTPUT_BYTES ||
      stderr.length > MAX_OUTPUT_BYTES
    )
      throw Error("P1_NATIVE_PRIVATE_STATUS_COMMAND_FAILED");
    return stdout.toString("utf8").trim();
  } catch {
    throw Error("P1_NATIVE_PRIVATE_STATUS_COMMAND_FAILED");
  } finally {
    if (stdoutFd !== undefined) fs.closeSync(stdoutFd);
    if (stderrFd !== undefined) fs.closeSync(stderrFd);
  }
}
