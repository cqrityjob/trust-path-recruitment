/** Offline artifact verification; never reads environment values or contacts a server. */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = resolve(process.argv[2] ?? dirname(fileURLToPath(import.meta.url)));
try {
  const manifest = JSON.parse(readFileSync(join(directory, "sw-processor-artifact.json"), "utf8"));
  if (manifest.format !== 2 || manifest.runtime.node !== process.versions.node)
    throw new Error("RUNTIME_PIN_MISMATCH");
  if (
    manifest.target.platform !== process.platform ||
    manifest.target.architecture !== process.arch
  )
    throw new Error("PLATFORM_MISMATCH");
  const report = process.report.getReport() as { header: { glibcVersionRuntime?: string } };
  const libc =
    process.platform === "linux" ? (report.header.glibcVersionRuntime ? "glibc" : "musl") : null;
  if (manifest.target.libc !== libc) throw new Error("LIBC_MISMATCH");
  if (!Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 1000)
    throw new Error("MANIFEST_INVALID");
  const expected = new Set<string>();
  for (const file of manifest.files) {
    if (
      typeof file.path !== "string" ||
      isAbsolute(file.path) ||
      file.path.split(/[\\/]/).some((part: string) => !part || part === "." || part === "..") ||
      expected.has(file.path)
    )
      throw new Error("MANIFEST_INVALID");
    expected.add(file.path);
    const path = join(directory, file.path);
    if (!lstatSync(path).isFile()) throw new Error("ARTIFACT_FILE_INVALID");
    if (createHash("sha256").update(readFileSync(path)).digest("hex") !== file.sha256)
      throw new Error("ARTIFACT_HASH_MISMATCH");
  }
  const visit = (folder: string, prefix = "") => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = prefix + entry.name;
      if (entry.isDirectory()) visit(join(folder, entry.name), path + "/");
      else if (!entry.isFile() || (path !== "sw-processor-artifact.json" && !expected.delete(path)))
        throw new Error("ARTIFACT_EXTRA_FILE");
    }
  };
  visit(directory);
  if (expected.size) throw new Error("ARTIFACT_FILE_MISSING");
  console.log("Processor artifact: hashes, inventory, platform and exact Node version verified.");
} catch {
  console.error(
    "Processor artifact verification failed; check the pinned runtime and rebuild from locked sources.",
  );
  process.exitCode = 1;
}
