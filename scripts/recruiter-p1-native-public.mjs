import fs from "node:fs";
import path from "node:path";
import { sha256 } from "./recruiter-p1-native-contract.mjs";
import { requireWorkspaceProof } from "./recruiter-p1-native-workspace.mjs";
const leaked =
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9_.-]+|\b(?:sb_secret_|sb_publishable_|sbp_)[A-Za-z0-9_-]+|"(?:password|access_token|refresh_token|SERVICE_ROLE_KEY|DB_URL)"\s*:/i;
const image =
  /^(sv|en)-(desktop|emulated-375)-(remaining|archive-only-received|gray-human-reviewed|concurrent-explicit-reload|explicit-peace-handoff|cached-job-profile-target)\.png$/;
export function writeNativePublic(context, report) {
  requireWorkspaceProof(report);
  if (fs.existsSync(context.publicRoot)) throw Error("P1_NATIVE_PUBLIC_FRESH_ROOT_REQUIRED");
  const source = path.join(context.stackRoot, "supabase/.temp/browser/curated");
  const images = [];
  if (fs.existsSync(source)) {
    if (!fs.lstatSync(source).isDirectory() || fs.lstatSync(source).isSymbolicLink())
      throw Error("P1_NATIVE_CURATED_DIRECTORY_REQUIRED");
    for (const name of fs.readdirSync(source).sort()) {
      const file = path.join(source, name);
      if (!image.test(name) || !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
        throw Error("P1_NATIVE_CURATED_PNG_REQUIRED");
      const data = fs.readFileSync(file);
      if (
        !data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
        leaked.test(data.toString("latin1"))
      )
        throw Error("P1_NATIVE_PUBLIC_SECRET_OR_PNG_REFUSED");
      images.push({ name, data });
    }
  }
  const manifest = {
    ...report,
    images: images.map(({ name, data }) => ({
      path: `images/${name}`,
      bytes: data.length,
      sha256: sha256(data),
    })),
  };
  const payload = JSON.stringify(manifest, null, 2) + "\n";
  if (leaked.test(payload)) throw Error("P1_NATIVE_PUBLIC_SECRET_REFUSED");
  fs.mkdirSync(context.publicRoot, { mode: 0o700 });
  if (images.length) fs.mkdirSync(path.join(context.publicRoot, "images"));
  for (const { name, data } of images)
    fs.writeFileSync(path.join(context.publicRoot, "images", name), data);
  fs.writeFileSync(path.join(context.publicRoot, "manifest.json"), payload);
  return manifest;
}
