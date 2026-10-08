import fs from "node:fs";
import { spawnSync } from "node:child_process";
// Stdout-only machine reads: CLI status warnings must never enter JSON.
export function privateOutput(
  command,
  args,
  { cwd, env, stdoutFile, stderrFile, timeout = 60_000 },
) {
  let outFd, errFd;
  try {
    outFd = fs.openSync(stdoutFile, "w", 0o600);
    errFd = fs.openSync(stderrFile, "w", 0o600);
    fs.fchmodSync(outFd, 0o600);
    fs.fchmodSync(errFd, 0o600);
    const result = spawnSync(command, args, {
      cwd,
      env,
      timeout,
      maxBuffer: 20_000_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = Buffer.from(result.stdout ?? ""),
      stderr = Buffer.from(result.stderr ?? "");
    fs.writeFileSync(outFd, stdout.subarray(0, 20_000_000));
    fs.writeFileSync(errFd, stderr.subarray(0, 20_000_000));
    if (
      result.error ||
      result.status !== 0 ||
      stdout.length > 20_000_000 ||
      stderr.length > 20_000_000
    )
      throw Error("OP09_NATIVE_PRIVATE_COMMAND_FAILED");
    return stdout.toString("utf8").trim();
  } catch {
    throw Error("OP09_NATIVE_PRIVATE_COMMAND_FAILED");
  } finally {
    if (outFd !== undefined) fs.closeSync(outFd);
    if (errFd !== undefined) fs.closeSync(errFd);
  }
}
