// TEMPORARY diagnostic for PR #341 (Security Work chromium [sv] reload alert).
// Remove together with its workflow step once the root cause is fixed.
//
// Writes a REDACTED digest of a failed Security Work browser run. It never
// copies a raw trace, storage state, request/response headers or bodies:
// - network: method, origin+path (no query), status, failure text, timing
// - console messages and page errors
// - the test's own actions and their errors
// - the failure screenshot and error-context.md
// - the tail of the dev-server log
// Anything shaped like a JWT, a Supabase key or a bearer/cookie value is
// replaced before it is written.
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const state = process.env.SW_BROWSER_STATE_DIR;
const out = process.argv[2];
if (!state || !out) throw new Error("usage: SW_BROWSER_STATE_DIR=… bun run <this> <out-dir>");
mkdirSync(out, { recursive: true });

const redact = (s: string) =>
  s
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[JWT]")
    .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, "[SUPABASE_KEY]")
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/((?:access|refresh)_token["'=:\s]+)[^"'&\s,}]+/gi, "$1[REDACTED]")
    .replace(/(sb-[a-z0-9-]+-auth-token[^=]*=)[^;\s"]+/gi, "$1[REDACTED]")
    .replace(/(password["'=:\s]+)[^"'&\s,}]+/gi, "$1[REDACTED]");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const lines: string[] = [];
const say = (s = "") => lines.push(redact(s));

for (const results of readdirSync(state).filter((d) => d.startsWith("raw-results-"))) {
  for (const file of walk(join(state, results))) {
    const dir = file.slice(0, file.lastIndexOf("/"));
    const tag = dir.slice(dir.lastIndexOf("/") + 1);
    if (file.endsWith(".png") && /test-failed/.test(file)) {
      copyFileSync(file, join(out, `${tag}--${file.slice(file.lastIndexOf("/") + 1)}`));
    } else if (file.endsWith("error-context.md")) {
      writeFileSync(join(out, `${tag}--error-context.md`), redact(readFileSync(file, "utf8")));
    } else if (file.endsWith("trace.zip")) {
      const tmp = mkdtempSync(join(state, "trace-"));
      execFileSync("unzip", ["-q", "-o", file, "-d", tmp]);
      say(`\n######## ${tag}`);
      for (const part of readdirSync(tmp).filter((n) => /\.(trace|network)$/.test(n))) {
        for (const raw of readFileSync(join(tmp, part), "utf8").split("\n")) {
          if (!raw.trim()) continue;
          let e: any;
          try {
            e = JSON.parse(raw);
          } catch {
            continue;
          }
          if (e.type === "resource-snapshot") {
            const r = e.snapshot ?? {};
            let where = "";
            try {
              const u = new URL(r.request?.url ?? "");
              where = `${u.origin}${u.pathname}`;
            } catch {
              where = "(unparsable url)";
            }
            say(
              `NET ${r.startedDateTime ?? ""} ${r.request?.method ?? "?"} ${where} -> ${
                r.response?.status ?? "?"
              }${r._failureText ? ` FAILED ${r._failureText}` : ""} ${Math.round(r.time ?? 0)}ms`,
            );
          } else if (e.type === "console") {
            say(`CONSOLE ${e.messageType ?? ""} ${String(e.text ?? "").slice(0, 2000)}`);
          } else if (
            e.type === "event" &&
            /error|crash|close|navigat|load/i.test(String(e.method))
          ) {
            say(
              `EVENT ${e.class ?? ""}.${e.method} ${JSON.stringify(e.params ?? {}).slice(0, 2000)}`,
            );
          } else if (e.type === "before") {
            // Selector and URL only: a fill() value can be a password.
            const p = e.params ?? {};
            say(
              `ACTION ${e.callId ?? ""} ${e.title ?? e.apiName ?? e.method ?? ""} ${p.selector ?? ""} ${p.url ?? ""}`,
            );
          } else if (e.type === "after" && e.error) {
            say(`ACTION-ERROR ${e.callId ?? ""} ${JSON.stringify(e.error).slice(0, 2000)}`);
          } else if (e.type === "stdout" || e.type === "stderr") {
            say(`${e.type.toUpperCase()} ${String(e.text ?? "").slice(0, 2000)}`);
          }
        }
      }
    }
  }
}
writeFileSync(join(out, "trace-digest.txt"), lines.join("\n") + "\n");

const logs = readdirSync(state).filter((n) => /^app-.*\.log$/.test(n));
const appLog = logs
  .map((n) => readFileSync(join(state, n), "utf8"))
  .join("\n")
  .split("\n");
writeFileSync(join(out, "dev-server-tail.log"), redact(appLog.slice(-600).join("\n")) + "\n");
if (!existsSync(join(out, "trace-digest.txt"))) throw new Error("no digest written");
console.log(`digest: ${lines.length} trace lines, ${logs.length} dev-server log(s)`);
