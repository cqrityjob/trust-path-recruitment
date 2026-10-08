export interface NativePrivateCommandOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdoutFile: string;
  stderrFile: string;
  timeout?: number;
}
/** Returns stdout only; stderr stays in the private file and failures use a fixed code. */
export function privateOutput(
  command: string,
  args: readonly string[],
  options: NativePrivateCommandOptions,
): string;
