import fs from "node:fs";
import path from "node:path";
import { digest, STAGES } from "./passport-native-op09-contract.mjs";
const leaked =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|Bearer\s|["'](?:password|access_token|refresh_token|SERVICE_ROLE_KEY|DB_URL)["']\s*:/i;
const imageName = /^(sv|en)-(desktop1440|emulated375)-(resumed|fenced|cleaned)\.png$/;
export function writePublic(context, report) {
  if (report.result === "PASS" && STAGES.some((s) => report.stages[s] !== "passed"))
    throw Error("OP09_NATIVE_UNRUN_STAGE_CANNOT_PASS");
  const source = path.join(context.stackRoot, "supabase/.temp/browser/curated");
  const target = path.join(context.publicRoot, "images");
  report.images = [];
  if (fs.existsSync(source)) {
    if (fs.lstatSync(source).isSymbolicLink()) throw Error("OP09_NATIVE_IMAGE_SYMLINK_REFUSED");
    for (const name of fs.readdirSync(source).sort()) {
      const file = path.join(source, name);
      if (
        !imageName.test(name) ||
        !fs.lstatSync(file).isFile() ||
        fs.lstatSync(file).isSymbolicLink()
      )
        throw Error("OP09_NATIVE_UNCURATED_FILE_REFUSED");
      const bytes = fs.readFileSync(file);
      if (
        !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
        leaked.test(bytes.toString("latin1"))
      )
        throw Error("OP09_NATIVE_UNSAFE_IMAGE_REFUSED");
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, name), bytes);
      report.images.push({ path: `images/${name}`, sha256: digest(bytes), bytes: bytes.length });
    }
  }
  if (report.result === "PASS" && report.images.length !== 12)
    throw Error("OP09_NATIVE_TWELVE_BROWSER_IMAGES_REQUIRED");
  const payload = JSON.stringify(report, null, 2) + "\n";
  if (leaked.test(payload)) throw Error("OP09_NATIVE_PUBLIC_SECRET_REFUSED");
  fs.mkdirSync(context.publicRoot, { recursive: true });
  fs.writeFileSync(path.join(context.publicRoot, "manifest.json"), payload);
}
