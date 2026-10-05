// Is a TEST build of the application cut off from the real project?
//
// Run: bun run scripts/og-build-isolation-check.ts --root .output --url <synthetic supabase url>
//
// ── WHY A BUILT-OUTPUT CHECK, NOT A SOURCE CHECK ───────────────────────
//
// The browser's Supabase client reads `import.meta.env.VITE_SUPABASE_URL` and
// `VITE_SUPABASE_PUBLISHABLE_KEY`, and Vite inlines those at BUILD time from the
// tracked `.env`, which names the real project. Overriding the server's
// variables at deploy changes nothing in that bundle: a test deployment whose
// server talked to a stand-in while its client still carried the real address
// and key would let a browser on the test site reach the real project. So a
// test build must set the synthetic values before building, and this check reads
// what the build actually produced:
//
//   * the real publishable key (from the tracked .env) appears NOWHERE in the
//     output -- without the key no request reaches PostgREST or GoTrue;
//   * the real project ref appears in the client only as the legacy share-
//     gateway fallback literal in src/lib/security-passport/public-origin.ts
//     (counted from the source, so the allowance follows the code), never as an
//     inlined configuration value;
//   * the synthetic address and the synthetic key ARE in the client bundle,
//     which proves the override was honoured rather than silently ignored.
//
// Nothing secret is printed: the key is read to be searched for, and only
// counts and file names are reported.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { SYNTHETIC_SUPABASE_KEY } from "./og-worker-fixture";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const root = arg("--root") ?? ".output";
const syntheticUrl = arg("--url");
const repo = arg("--repo") ?? ".";
if (!syntheticUrl) {
  console.error(
    "usage: og-build-isolation-check.ts --root <built output> --url <synthetic supabase url>",
  );
  process.exit(2);
}

/** The tracked .env, parsed just enough to know what to refuse. */
function dotenv(path: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out.set(m[1], m[2].replace(/^["']|["']$/g, ""));
  }
  return out;
}

const BUILT = /\.(m?js|html|json|css|txt)$/;
const SOURCE = /\.(m?js|tsx?)$/;

function walk(dir: string, only: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, only, out);
    else if (only.test(name)) out.push(p);
  }
  return out;
}

function count(hay: string, needle: string): number {
  return needle ? hay.split(needle).length - 1 : 0;
}

const env = dotenv(join(repo, ".env"));
const realKey =
  env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const realUrl = env.get("VITE_SUPABASE_URL") ?? env.get("SUPABASE_URL") ?? "";
const realRef = env.get("VITE_SUPABASE_PROJECT_ID") ?? env.get("SUPABASE_PROJECT_ID") ?? "";

const failures: string[] = [];
if (!realKey || !realUrl || !realRef) {
  failures.push(
    "the tracked .env does not name the real project; there is nothing to isolate from",
  );
}
if (!existsSync(root)) failures.push(`no built output at ${root}`);

// The allowance for the real ref: exactly as many times as the SOURCE carries
// it as a literal (today: the legacy gateway fallback, once). Counted from the
// source so that a new literal in src is a deliberate, visible change here.
function sourceLiteralCount(): number {
  const src = join(repo, "src");
  let n = 0;
  for (const f of walk(src, SOURCE)) n += count(readFileSync(f, "utf8"), realRef);
  return n;
}

if (failures.length === 0) {
  const files = walk(root, BUILT);
  const isServer = (f: string) => /(^|[/\\])server[/\\]/.test(relative(root, f));
  const client = files.filter((f) => !isServer(f));
  const server = files.filter(isServer);
  let keyHits = 0;
  let synthUrlClient = 0;
  let synthKeyClient = 0;
  let refClient = 0;
  let refServer = 0;
  const keyFiles: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const k = count(text, realKey);
    if (k > 0) {
      keyHits += k;
      keyFiles.push(relative(root, f));
    }
    const isClient = client.includes(f);
    const r = count(text, realRef);
    if (isClient) {
      refClient += r;
      synthUrlClient += count(text, syntheticUrl);
      synthKeyClient += count(text, SYNTHETIC_SUPABASE_KEY);
    } else refServer += r;
  }
  const allowed = sourceLiteralCount();
  if (keyHits > 0) {
    failures.push(
      `the real publishable key is in the built output (${keyHits} occurrence(s) in ${keyFiles.join(", ")}): the client could reach the real project`,
    );
  }
  if (refClient > allowed) {
    failures.push(
      `the real project ref appears ${refClient} time(s) in the client bundle; only the ${allowed} source literal(s) (the legacy gateway fallback) are allowed, so the real address was inlined as configuration`,
    );
  }
  if (refServer > allowed) {
    failures.push(
      `the real project ref appears ${refServer} time(s) in the server bundle; only the ${allowed} source literal(s) are allowed`,
    );
  }
  if (synthUrlClient === 0) {
    failures.push(
      "the synthetic Supabase address is not in the client bundle: the build override was not honoured",
    );
  }
  if (synthKeyClient === 0) {
    failures.push(
      "the synthetic publishable key is not in the client bundle: the build override was not honoured",
    );
  }
  if (server.length === 0) failures.push("no server bundle found under the built output");
  console.log(
    `og-build-isolation-check: ${files.length} files (${client.length} client, ${server.length} server); ` +
      `real key ${keyHits}×, real ref client ${refClient}× / server ${refServer}× (allowed ${allowed}), ` +
      `synthetic address ${synthUrlClient}×, synthetic key ${synthKeyClient}×`,
  );
}

if (failures.length > 0) {
  console.error("og-build-isolation-check REFUSED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "og-build-isolation-check: the built client and server carry only the synthetic project",
);
