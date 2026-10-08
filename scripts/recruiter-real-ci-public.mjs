import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
export const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const leaked =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9_.-]{12,}|["'](?:access_token|refresh_token|password|DB_URL|SERVICE_ROLE_KEY)["']\s*:/i;
const imageName =
  /^(chromium|mobile-375|mobile-390)-(guard|manager)-(standalone|application)-(sv|en)-(prepare|resumed|report)\.png$/;

export function writePublicReport(context, report) {
  fs.mkdirSync(context.publicRoot, { recursive: true });
  const images = path.join(context.stackRoot, "supabase/.temp/ri-real-browser/curated");
  report.images = [];
  if (fs.existsSync(images)) {
    if (fs.lstatSync(images).isSymbolicLink()) throw Error("REAL_CI_IMAGE_SYMLINK_REFUSED");
    for (const name of fs.readdirSync(images).sort()) {
      if (!imageName.test(name)) throw Error("REAL_CI_UNCURATED_IMAGE_REFUSED");
      const file = path.join(images, name);
      if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
        throw Error("REAL_CI_IMAGE_FILE_REQUIRED");
      const bytes = fs.readFileSync(file);
      if (leaked.test(bytes.toString("latin1"))) throw Error("REAL_CI_PUBLIC_CREDENTIAL_REFUSED");
      if (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
        throw Error("REAL_CI_PNG_REQUIRED");
      fs.mkdirSync(path.join(context.publicRoot, "images"), { recursive: true });
      fs.writeFileSync(path.join(context.publicRoot, "images", name), bytes);
      report.images.push({ path: `images/${name}`, bytes: bytes.length, sha256: digest(bytes) });
    }
  }
  const payload = JSON.stringify(report, null, 2) + "\n";
  const errors = JSON.stringify(report.errors, null, 2) + "\n";
  if (leaked.test(payload) || leaked.test(errors)) throw Error("REAL_CI_PUBLIC_CREDENTIAL_REFUSED");
  fs.writeFileSync(path.join(context.publicRoot, "manifest.json"), payload);
  fs.writeFileSync(path.join(context.publicRoot, "errors.json"), errors);
}

export function validatePublicReport(root) {
  if (fs.lstatSync(root).isSymbolicLink()) throw Error("REAL_CI_PUBLIC_SYMLINK_REFUSED");
  const names = fs.readdirSync(root);
  if (names.some((name) => !["manifest.json", "errors.json", "images"].includes(name)))
    throw Error("REAL_CI_PUBLIC_FILE_REFUSED");
  for (const name of ["manifest.json", "errors.json"]) {
    const file = path.join(root, name);
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
      throw Error("REAL_CI_PUBLIC_FILE_REFUSED");
    if (leaked.test(fs.readFileSync(file, "utf8")))
      throw Error("REAL_CI_PUBLIC_CREDENTIAL_REFUSED");
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const expected = new Set(manifest.images.map((entry) => entry.path));
  if (fs.existsSync(path.join(root, "images"))) {
    if (fs.lstatSync(path.join(root, "images")).isSymbolicLink())
      throw Error("REAL_CI_IMAGE_SYMLINK_REFUSED");
    const actual = fs.readdirSync(path.join(root, "images")).map((name) => `images/${name}`);
    if (actual.length !== expected.size || actual.some((name) => !expected.has(name)))
      throw Error("REAL_CI_PUBLIC_IMAGE_SET_CHANGED");
  } else if (expected.size) throw Error("REAL_CI_PUBLIC_IMAGE_SET_CHANGED");
  for (const entry of manifest.images) {
    const name = entry.path.slice("images/".length);
    if (!imageName.test(name) || entry.path !== `images/${name}`)
      throw Error("REAL_CI_UNCURATED_IMAGE_REFUSED");
    const file = path.join(root, entry.path);
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
      throw Error("REAL_CI_PUBLIC_FILE_REFUSED");
    const bytes = fs.readFileSync(file);
    if (digest(bytes) !== entry.sha256 || bytes.length !== entry.bytes)
      throw Error("REAL_CI_PUBLIC_IMAGE_HASH_CHANGED");
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const workspace = process.env.GITHUB_WORKSPACE;
    if (!workspace || process.env.GITHUB_ACTIONS !== "true")
      throw Error("REAL_CI_WORKSPACE_REQUIRED");
    validatePublicReport(path.join(workspace, "real-public"));
    console.log("REAL_CI_PUBLIC_EVIDENCE_VALIDATED");
  } catch {
    console.error("REAL_CI_PUBLIC_EVIDENCE_REFUSED");
    process.exitCode = 1;
  }
}
