/** Build an isolated, unpublished processor artifact for the current OS/architecture. */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const runtime = JSON.parse(
  readFileSync(join(root, "scripts/security-work-processor-runtime.json"), "utf8"),
) as { node: string; bun: string; pdfjs: string };
const bunVersion = spawnSync("bun", ["--version"], { encoding: "utf8" }).stdout?.trim();
if (bunVersion !== runtime.bun)
  throw new Error("Use the exact Bun version in security-work-processor-runtime.json.");
const output = resolve(process.argv[2] ?? join(root, ".output", "security-work-processor"));
// A fresh directory prevents stale packages or local .env files from entering the inventory.
if (existsSync(output))
  throw new Error("Output already exists; choose a new artifact destination.");
if (output === root || !relative(output, root).startsWith(".."))
  throw new Error("Output must not be the repository or its parent.");
mkdirSync(output, { recursive: true });
const built = spawnSync(
  "bun",
  [
    "build",
    join(root, "scripts/security-work-processor.ts"),
    "--target=node",
    `--outfile=${join(output, "server.mjs")}`,
  ],
  { cwd: root, stdio: "inherit" },
);
if (built.status !== 0) throw new Error("Processor compilation failed.");
for (const [source, target] of [
  ["security-work-processor-verify.ts", "verify.mjs"],
  ["security-work-processor-config-check.ts", "config-check.mjs"],
]) {
  const tool = spawnSync(
    "bun",
    ["build", join(root, "scripts", source), "--target=node", `--outfile=${join(output, target)}`],
    { cwd: root, stdio: "inherit" },
  );
  if (tool.status !== 0) throw new Error("Processor tooling compilation failed.");
}
const packageRoot = (name: string) => dirname(require.resolve(`${name}/package.json`));
const readPackage = (name: string) =>
  JSON.parse(readFileSync(join(packageRoot(name), "package.json"), "utf8")) as {
    version: string;
    optionalDependencies?: Record<string, string>;
  };
const pdf = packageRoot("pdfjs-dist");
if (readPackage("pdfjs-dist").version !== runtime.pdfjs)
  throw new Error("Review and retest the pinned PDF engine before updating its artifact.");
const pdfTarget = join(output, "node_modules/pdfjs-dist");
mkdirSync(join(pdfTarget, "legacy"), { recursive: true });
cpSync(join(pdf, "legacy/build"), join(pdfTarget, "legacy/build"), { recursive: true });
for (const file of ["package.json", "LICENSE"]) cpSync(join(pdf, file), join(pdfTarget, file));
const packages = ["@napi-rs/canvas"];
for (const name of Object.keys(readPackage("@napi-rs/canvas").optionalDependencies ?? {}).sort()) {
  try {
    packageRoot(name);
    packages.push(name);
  } catch {
    /* Other platform packages are intentionally absent. */
  }
}
if (packages.length === 1)
  throw new Error("Install the current platform's optional canvas binary before building.");
for (const name of packages) {
  const target = join(output, "node_modules", name);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(packageRoot(name), target, { recursive: true, dereference: true });
}
writeFileSync(
  join(output, "package.json"),
  JSON.stringify({ private: true, type: "module", engines: { node: runtime.node } }, null, 2) +
    "\n",
);
const files: Array<{ path: string; sha256: string }> = [];
function inventory(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) inventory(path);
    else if (entry.isFile() && entry.name !== "sw-processor-artifact.json")
      files.push({
        path: relative(output, path),
        sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      });
    else if (!entry.isFile())
      throw new Error("Processor artifact must contain regular files only.");
  }
}
inventory(output);
writeFileSync(
  join(output, "sw-processor-artifact.json"),
  JSON.stringify(
    {
      format: 2,
      runtime: { node: runtime.node, bun: runtime.bun },
      lockSha256: createHash("sha256")
        .update(readFileSync(join(root, "bun.lock")))
        .digest("hex"),
      target: {
        platform: process.platform,
        architecture: process.arch,
        libc:
          process.platform === "linux"
            ? (process.report.getReport() as { header: { glibcVersionRuntime?: string } }).header
                .glibcVersionRuntime
              ? "glibc"
              : "musl"
            : null,
      },
      packages: {
        "pdfjs-dist": readPackage("pdfjs-dist").version,
        ...Object.fromEntries(packages.map((name) => [name, readPackage(name).version])),
      },
      files,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Unpublished processor artifact ready: ${output}`);
