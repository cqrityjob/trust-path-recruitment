/** Local/CI synthetic fixture only. Builds Node artifact and temporary TLS; never deploys. */
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

process.umask(0o077);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.argv[2])
  throw new Error(
    "Usage: bun run scripts/security-work-processor-local.ts <empty-private-temp-directory> [--http-port=0] [--https-port=0]",
  );
const state = resolve(process.argv[2]);
mkdirSync(state, { recursive: true, mode: 0o700 });
const actualState = realpathSync(state);
const temporaryRoots = [
  ...new Set(
    [tmpdir(), "/tmp", "/private/tmp"].filter(existsSync).map((value) => realpathSync(value)),
  ),
];
if (
  !temporaryRoots.some((path) => {
    const child = relative(path, actualState);
    return child !== "" && !child.startsWith("..") && !isAbsolute(child);
  })
)
  throw new Error("Synthetic TLS fixtures must be stored in a private temporary directory.");
if (readdirSync(state).length)
  throw new Error("Fixture directory must be empty; use a new temporary directory.");
chmodSync(state, 0o700);
const port = (name: string) => {
  const value =
    process.argv
      .slice(3)
      .find((argument) => argument.startsWith(`--${name}-port=`))
      ?.split("=")[1] ?? "0";
  if (!/^\d+$/.test(value) || Number(value) > 65535) throw new Error("Invalid fixture port.");
  return Number(value);
};
const configuration = {
  httpPort: port("http"),
  httpsPort: port("https"),
  token: randomBytes(32).toString("hex"),
};
writeFileSync(join(state, "fixture.json"), JSON.stringify(configuration), { mode: 0o600 });
const childEnv = { PATH: process.env.PATH ?? "" };
function run(command: string, args: string[], quiet = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: childEnv,
    stdio: quiet ? "ignore" : "inherit",
  });
  if (result.status !== 0) throw new Error(`Synthetic fixture ${command} step failed.`);
}
run("bun", [
  "run",
  join(root, "scripts/security-work-processor-build.ts"),
  join(state, "artifact"),
]);
run(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(state, "key.pem"),
    "-out",
    join(state, "cert.pem"),
    "-days",
    "2",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ],
  true,
);
chmodSync(join(state, "key.pem"), 0o600);
chmodSync(join(state, "cert.pem"), 0o600);
run("bun", [
  "build",
  join(root, "scripts/security-work-processor-fixture-host.ts"),
  "--target=node",
  `--outfile=${join(state, "fixture-host.mjs")}`,
]);
const child = spawn("node", [join(state, "fixture-host.mjs"), state], {
  cwd: state,
  env: childEnv,
  stdio: "inherit",
});
let stopping = false;
const stop = () => {
  stopping = true;
  child.kill("SIGTERM");
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const result = await new Promise<number>((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(stopping ? 0 : (code ?? 1)));
});
process.exitCode = result;
