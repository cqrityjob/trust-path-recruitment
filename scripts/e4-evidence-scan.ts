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
import { createHash } from "node:crypto";
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
/* Whose token is it?                                                  */
/* ------------------------------------------------------------------ */

/**
 * ── WHY A JWT IS NOT ALWAYS A LEAK, AND WHAT IS ACTUALLY TRUSTED ───────
 *
 * A Playwright trace records the network, and every request the browser makes
 * carries the stack's anon key as a header and the signed-in user's access
 * token as a bearer. Both are JWTs. A rule of "refuse every JWT" therefore
 * means this pipeline can never publish a trace at all — and a safety control
 * that makes the evidence impossible is a control that gets deleted.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────
 *
 * An earlier version accepted a token whose ISSUER matched the local stack's
 * anon key issuer. That was a bypass, and a plain one: `iss` is a claim the
 * token makes about itself. Anyone who can write a file into the artifact can
 * write a token that claims any issuer, with no signature at all, and it would
 * have been published. The same objection applies to `aud`, to a project ref
 * and to a hostname. NOTHING SELF-DECLARED IS TRUSTED HERE.
 *
 * Accepting any validly-signed local token was not enough either: a
 * service-role token signed by the local stack is still a service-role token,
 * and service-role credentials are never publishable evidence.
 *
 * ── WHAT IS TRUSTED ────────────────────────────────────────────────────
 *
 * Exactly one thing: that a byte-for-byte identical token was OBSERVED IN
 * THIS RUN. The workflow writes the SHA-256 of the anon key the browser will
 * use; the walk appends the SHA-256 of each access token the browser was
 * actually issued. A JWT in the evidence is published only when its own
 * SHA-256 is on that list.
 *
 * That makes expiry, subject, issuer and audience irrelevant rather than
 * merely unchecked: a forged token cannot be on the list, because the list
 * holds digests of tokens this run's own stack handed to this run's own
 * browser. No signature verification is needed, and no JWT secret is read,
 * so no secret exists in this process to leak.
 *
 * On top of that, one rule that no allowlist entry can override: a token
 * whose role is `service_role` is refused, always.
 *
 * With no allowlist the set is empty and every JWT is refused — which is what
 * happens when somebody runs this scan by hand.
 */

/** SHA-256 digests of the tokens this run legitimately produced. */
export interface TokenAllowlist {
  readonly digests: ReadonlySet<string>;
  /** Where it was read from, for the log. Never its contents. */
  readonly source: string | null;
}

export const EMPTY_ALLOWLIST: TokenAllowlist = { digests: new Set(), source: null };

const sha256hex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/**
 * Read this run's allowlist. It lives OUTSIDE the artifact directory and is
 * destroyed before the upload, so it is never published; it holds digests
 * only, so even if it were, no token could be recovered from it.
 */
export function loadTokenAllowlist(env: NodeJS.ProcessEnv = process.env): TokenAllowlist {
  const file = env.E4_TOKEN_ALLOWLIST?.trim();
  if (!file || !existsSync(file)) return EMPTY_ALLOWLIST;
  try {
    const digests = new Set(
      readFileSync(file, "utf8")
        .split("\n")
        .map((line) => line.trim().toLowerCase())
        .filter((line) => /^[0-9a-f]{64}$/.test(line)),
    );
    return { digests, source: file };
  } catch {
    // Fail closed: an unreadable allowlist allows nothing.
    return EMPTY_ALLOWLIST;
  }
}

function jwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    const value: unknown = JSON.parse(json);
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface TokenVerdict {
  readonly allowed: boolean;
  /** Why, in words a reader can act on. Never contains the token. */
  readonly reason: string;
}

/** May this token be published? Only if this run produced it, and never if it
 *  is a service-role token. */
export function tokenIsPublishable(token: string, allow: TokenAllowlist): TokenVerdict {
  const claims = jwtClaims(token);
  if (claims === null) {
    return {
      allowed: false,
      reason: "the token could not be parsed, so nothing about it is known",
    };
  }
  // No allowlist entry overrides this. A service-role token signed by the
  // throwaway stack is still a service-role token, and it has no business in
  // a browser trace at all: its presence is itself the finding.
  if (claims.role === "service_role") {
    return { allowed: false, reason: "a service-role token is never publishable evidence" };
  }
  if (!allow.digests.has(sha256hex(token))) {
    return { allowed: false, reason: "this exact token was not observed in this run" };
  }
  return { allowed: true, reason: "exact digest match against this run's own tokens" };
}

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

/** How many of this run's own local tokens were allowed through. Counted so
 *  the allowance is VISIBLE in the job log rather than silent — an exception
 *  nobody is told about is how an exception becomes a hole. */
export interface ScanContext {
  readonly allow: TokenAllowlist;
  allowedLocalTokens: number;
}

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

function match(where: string, text: string, findings: Finding[], ctx: ScanContext): void {
  for (const [pattern, what] of PATTERNS) {
    // Every JWT, not just the first: with an allowance for this run's own
    // tokens, stopping at the first match would let a foreign token hide
    // behind a local one in the same file.
    if (what === "a JWT") {
      JWT_PATTERN.lastIndex = 0;
      let m: RegExpExecArray | null;
      let budget = 500;
      while ((m = JWT_PATTERN.exec(text)) !== null && budget-- > 0) {
        const verdict = tokenIsPublishable(m[0], ctx.allow);
        if (verdict.allowed) {
          ctx.allowedLocalTokens += 1;
          continue;
        }
        findings.push({
          where,
          what: `${what} — ${verdict.reason}`,
          excerpt: `${m[0].slice(0, 24)}…`,
        });
      }
      continue;
    }
    const m = pattern.exec(text);
    if (m) findings.push({ where, what, excerpt: `${m[0].slice(0, 24)}…` });
  }
}

/** One file, inspected as deeply as it goes. `depth` bounds archive nesting. */
export function scanBuffer(
  where: string,
  buf: Buffer,
  findings: Finding[],
  depth = 0,
  ctx: ScanContext = { allow: loadTokenAllowlist(), allowedLocalTokens: 0 },
): void {
  // 1 · the bytes as text. Catches plain text, and anything a binary format
  //     happens to store uncompressed (PNG text chunks, for one).
  const asText = buf.toString("latin1");
  match(where, asText, findings, ctx);

  // 2 · base64 attachments embedded in it.
  for (const decoded of embeddedBase64(buf.toString("utf8"))) {
    match(`${where} → embedded base64`, decoded, findings, ctx);
  }

  // 3 · gzip.
  const gz = inflatedIfPossible(buf);
  if (gz !== null) match(`${where} → gzip`, gz, findings, ctx);

  // 4 · zip entries, inflated. THE case this scanner exists for: a trace.zip
  //     records the network, and a token inside it is invisible in the
  //     compressed bytes.
  if (depth < 2 && buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50) {
    for (const entry of zipEntries(buf)) {
      scanBuffer(`${where} → ${entry.name}`, entry.content, findings, depth + 1, ctx);
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
  ctx: ScanContext = { allow: loadTokenAllowlist(), allowedLocalTokens: 0 },
): { findings: Finding[]; scanned: number; allowedLocalTokens: number } {
  const findings: Finding[] = [];
  let scanned = 0;
  for (const dir of dirs) {
    for (const rel of walk(dir, base)) {
      scanBuffer(rel, readFileSync(path.join(base, rel)), findings, 0, ctx);
      scanned += 1;
    }
  }
  return { findings, scanned, allowedLocalTokens: ctx.allowedLocalTokens };
}

/* ------------------------------------------------------------------ */

if (import.meta.main) {
  const allow = loadTokenAllowlist();

  // The allowlist must not be inside anything about to be published. It holds
  // digests rather than tokens, so publishing it would leak nothing -- but a
  // file that must be destroyed before upload has no business living where
  // the upload looks.
  if (allow.source !== null) {
    const rel = path.relative(root, path.resolve(allow.source));
    if (!rel.startsWith("..") && DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) {
      console.error(
        "\nREFUSED: this run's token allowlist is inside the artifact directory.\n" +
          "It is destroyed before upload; it must not be somewhere the upload reads.",
      );
      process.exit(1);
    }
  }

  const { findings, scanned, allowedLocalTokens } = scanDirectories(DIRS, root, {
    allow,
    allowedLocalTokens: 0,
  });
  console.log(`e4 evidence scan — ${scanned} file(s) under ${DIRS.join(", ")}`);
  console.log(
    `  allowlist: ${allow.digests.size} digest(s) of tokens observed in this run` +
      `${allow.source === null ? " (none supplied — every JWT will be refused)" : ""}`,
  );
  // Said out loud, every run. An exception nobody is told about is how an
  // exception becomes a hole.
  console.log(`  ${allowedLocalTokens} token(s) allowed as minted by THIS run's throwaway stack`);

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
