/**
 * Nothing that must not leave, leaves — and "inside a zip" is still inside.
 *
 * ── WHY THIS RUNS BEFORE THE UPLOAD ────────────────────────────────────
 *
 * The evidence artifact is downloadable by anyone who can read the pull
 * request. It carries screenshots of a signed-in application, Playwright
 * traces (which record network activity), console logs and a manifest. Any of
 * those can pick up something that should never be published: the owner
 * project ref, a hosted URL, a JWT, a service-role key, a password.
 *
 * So the artifact is scanned first, and a hit FAILS the job rather than being
 * redacted quietly. A redaction nobody is told about is how a leak becomes
 * routine; a red build is how it gets fixed.
 *
 * ── WHY IT DECOMPRESSES ────────────────────────────────────────────────
 *
 * The first version of this file read every byte as latin1 and called that
 * "scanning binaries". It was wrong, and demonstrably so: a JWT written into
 * a file and then zipped is NOT present in the zip's bytes, because DEFLATE
 * replaces it. A `trace.zip` is exactly that case, and a trace is the file
 * most likely to carry a token, because it records the network.
 *
 * So a zip is opened through its central directory and every entry is
 * inflated and scanned. Long base64 runs inside text are decoded and scanned
 * too, because Playwright's HTML report embeds attachments that way and a
 * secret inside one is still published.
 *
 * Depth is bounded: a zip inside a zip is scanned one level down, and no
 * further. Unbounded recursion over attacker-shaped input is its own problem.
 *
 * Run: bun run scripts/e4-evidence-scan.ts
 */

import { gunzipSync, inflateRawSync, inflateSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const DIRS = ["artifacts/employer-final-report-e4", "playwright-report", "test-results"];

export interface Finding {
  /** Where it was found, including the path inside an archive. */
  readonly where: string;
  /** What was found, in words a reader can act on. */
  readonly what: string;
  /** A short, safe excerpt — never the whole secret. */
  readonly excerpt: string;
}

export const PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/wrygicdfxwjnrugduxnt/, "the owner production project ref"],
  [/https:\/\/[a-z0-9-]+\.supabase\.co/i, "a hosted Supabase URL"],
  [/\.lovable(project|)\.(app|dev)/i, "a hosted Lovable backend URL"],
  // A JWT: three base64url segments. Anon keys and service-role keys are both
  // JWTs, and neither belongs in a published artifact.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, "a JWT"],
  [/service_role/i, "a service-role reference"],
  [/sbp_[A-Za-z0-9]{20,}/, "a Supabase access token"],
  [
    /SUPABASE_DB_PASSWORD|SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/,
    "a hosted credential name",
  ],
];

/* ------------------------------------------------------------------ */
/* Reading what is actually in a file                                  */
/* ------------------------------------------------------------------ */

/**
 * Every entry of a zip, inflated.
 *
 * Read through the CENTRAL DIRECTORY rather than by scanning for local
 * headers: a local header may carry zeroed sizes and defer them to a data
 * descriptor, and a reader that trusts those sizes silently truncates the
 * entry it was supposed to inspect. The central directory always has them.
 *
 * Returns [] for anything that is not a well-formed zip, because a scanner
 * that throws on a malformed file stops the whole scan and lets everything
 * after it through.
 */
export function zipEntries(buf: Buffer): { name: string; content: Buffer }[] {
  const out: { name: string; content: Buffer }[] = [];
  // End of central directory: PK\x05\x06, within the last 64KiB + 22 bytes.
  const sig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i -= 1) {
    if (buf.subarray(i, i + 4).equals(sig)) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n += 1) {
    if (p + 46 > buf.length) break;
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");

    // The data begins after the LOCAL header, whose name/extra lengths differ
    // from the central directory's.
    if (localOffset + 30 <= buf.length && buf.readUInt32LE(localOffset) === 0x04034b50) {
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compressedSize);
      try {
        const content =
          method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : Buffer.alloc(0);
        if (content.length > 0) out.push({ name, content });
      } catch {
        // A single unreadable entry must not stop the scan of the rest.
      }
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Long base64 runs inside text, decoded. Playwright's HTML report embeds
 *  attachments this way, and a secret inside one is still published. */
export function embeddedBase64(text: string): string[] {
  const out: string[] = [];
  const re = /[A-Za-z0-9+/]{80,}={0,2}/g;
  let m: RegExpExecArray | null;
  let budget = 200;
  while ((m = re.exec(text)) !== null && budget-- > 0) {
    try {
      const decoded = Buffer.from(m[0], "base64");
      // Only keep it if it decoded to something text-shaped; random binary
      // produces noise that matches nothing and costs time.
      if (decoded.length > 8) out.push(decoded.toString("utf8"));
    } catch {
      /* not base64 after all */
    }
  }
  return out;
}

/**
 * gzip and zlib payloads, inflated. Some network logs are stored compressed.
 *
 * gunzipSync, not inflateSync: a gzip member has its own header and CRC
 * trailer, and inflateSync -- which expects a zlib stream -- rejects it. That
 * was this file's second bug, and the behavioural guard in
 * `employer-final-report-check` found it by planting a gzipped network log
 * carrying the owner project ref and requiring the scan to refuse it.
 */
function inflatedIfPossible(buf: Buffer): string | null {
  if (buf.length < 2) return null;
  try {
    if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString("utf8");
    // A raw zlib stream: 0x78 followed by one of the four valid FCHECK bytes.
    if (buf[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(buf[1] as number)) {
      return inflateSync(buf).toString("utf8");
    }
  } catch {
    /* not compressed after all */
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The scan                                                            */
/* ------------------------------------------------------------------ */

function match(where: string, text: string, findings: Finding[]): void {
  for (const [pattern, what] of PATTERNS) {
    const m = pattern.exec(text);
    if (m) findings.push({ where, what, excerpt: `${m[0].slice(0, 24)}…` });
  }
}

/** One file, inspected as deeply as it goes. `depth` bounds archive nesting. */
export function scanBuffer(where: string, buf: Buffer, findings: Finding[], depth = 0): void {
  // 1 · the bytes as text. Catches plain text, and anything a binary format
  //     happens to store uncompressed (PNG text chunks, for one).
  const asText = buf.toString("latin1");
  match(where, asText, findings);

  // 2 · base64 attachments embedded in it.
  for (const decoded of embeddedBase64(buf.toString("utf8"))) {
    match(`${where} → embedded base64`, decoded, findings);
  }

  // 3 · gzip.
  const gz = inflatedIfPossible(buf);
  if (gz !== null) match(`${where} → gzip`, gz, findings);

  // 4 · zip entries, inflated. THE case this scanner exists for: a trace.zip
  //     records the network, and a token inside it is invisible in the
  //     compressed bytes.
  if (depth < 2 && buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50) {
    for (const entry of zipEntries(buf)) {
      scanBuffer(`${where} → ${entry.name}`, entry.content, findings, depth + 1);
    }
  }
}

function walk(rel: string, base: string = root): string[] {
  const abs = path.join(base, rel);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const child = path.join(rel, name);
    if (statSync(path.join(base, child)).isDirectory()) out.push(...walk(child, base));
    else out.push(child);
  }
  return out;
}

/**
 * Every finding under the given directories.
 *
 * `base` exists so the deterministic guard can point this at a throwaway tree
 * of PLANTED leaks and require that the walk finds them. That is the only
 * honest way to assert a scanner works: grepping this file for the word "eyJ"
 * proves the string is present, not that a JWT inside a trace.zip is caught.
 */
export function scanDirectories(
  dirs: readonly string[],
  base: string = root,
): { findings: Finding[]; scanned: number } {
  const findings: Finding[] = [];
  let scanned = 0;
  for (const dir of dirs) {
    for (const rel of walk(dir, base)) {
      scanBuffer(rel, readFileSync(path.join(base, rel)), findings);
      scanned += 1;
    }
  }
  return { findings, scanned };
}

/* ------------------------------------------------------------------ */

if (import.meta.main) {
  const { findings, scanned } = scanDirectories(DIRS);
  console.log(`e4 evidence scan — ${scanned} file(s) under ${DIRS.join(", ")}`);

  if (findings.length > 0) {
    console.error("\nREFUSED: the evidence carries something that must not be published.\n");
    for (const f of findings) console.error(`  - ${f.where}: ${f.what} (matched "${f.excerpt}")`);
    console.error(
      "\nNothing was uploaded. Fix the leak at its source -- do not redact the\n" +
        "artifact and upload it anyway: a redaction nobody is told about is how a\n" +
        "leak becomes routine.",
    );
    process.exit(1);
  }

  // An empty artifact uploaded green is worse than no artifact: it looks like
  // evidence in the checks list and contains none.
  const captures = walk("artifacts/employer-final-report-e4").filter((f) => f.endsWith(".png"));
  if (captures.length === 0) {
    console.error(
      "\nREFUSED: no screenshot was captured, so there is nothing to review.\n" +
        "An empty artifact must not be published as evidence.",
    );
    process.exit(1);
  }

  console.log(`  clean — ${captures.length} capture(s), nothing sensitive found`);
}
