// Public assessment + OAuth return-path regression guard.
//
// Covers the two corrective fixes:
//   * the OAuth destination surviving a full page unload;
//   * the sessionStorage buffer that makes the assessment takeable without an
//     account, without granting `anon` anything in the database.
//
// Both modules are pure apart from a storage call, so these are real behaviour
// tests. A minimal sessionStorage stub stands in for the browser.
//
// Plain TS script, matching this repository's scripts/*-check.ts convention.

import { readFileSync } from "node:fs";
import path from "node:path";

// --- sessionStorage stub, installed before the modules load ---------------
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}
const storage = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = {
  sessionStorage: storage,
  location: { origin: "https://preview.example.test" },
};

const {
  rememberOAuthReturn,
  consumeOAuthReturn,
  clearOAuthReturn,
  oauthRedirectUri,
  oauthErrorMessage,
} = await import("../src/lib/auth/oauth-return");
const { readBuffer, startBuffer, recordAnswer, isComplete, clearBuffer, remainingItemIds } =
  await import("../src/lib/career-discovery/v31-public-buffer");
const { CORE_ITEMS } = await import("../src/lib/career-discovery/v31/core-items");
const { CONTENT_VERSION, DEFINITION_VERSION } =
  await import("../src/lib/career-discovery/v31/version");

let failures = 0;
let checks = 0;
function ok(cond: boolean, label: string) {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}
function group(n: string) {
  console.log(`\n${n}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

// =========================================================================
group("1 · OAuth return path survives the redirect");
// =========================================================================

storage.clear();
ok(rememberOAuthReturn("/my-career", "/") === "/my-career", "1.1 an internal path is remembered");
ok(consumeOAuthReturn() === "/my-career", "1.2 it is returned after the redirect");
ok(
  consumeOAuthReturn() === null,
  "1.3 consuming CLEARS it — a stale path cannot teleport a later visit",
);

storage.clear();
rememberOAuthReturn("/security-career-assessment/session?session=abc-123", "/");
ok(
  consumeOAuthReturn() === "/security-career-assessment/session?session=abc-123",
  "1.4 the query string survives — this is the dead-end defect that was fixed before",
);

// Open-redirect rejection. Every one must fall back, never be stored.
storage.clear();
for (const hostile of [
  "https://evil.test/x",
  "//evil.test",
  "javascript:alert(1)",
  "http://evil.test",
  "/\\evil.test",
  "https://evil.test",
]) {
  const result = rememberOAuthReturn(hostile, "/my-career");
  ok(result === "/my-career", `1.5 hostile redirect rejected: ${hostile}`);
  ok(consumeOAuthReturn() !== hostile, `1.6 hostile redirect never stored: ${hostile}`);
  storage.clear();
}
ok(
  rememberOAuthReturn("/auth", "/my-career") === "/my-career",
  "1.7 /auth is rejected — loop prevention",
);
storage.clear();

// A path written directly into storage is still re-validated on read.
storage.setItem("cqj:auth:oauth-return:v1", "https://evil.test/x");
ok(
  consumeOAuthReturn() === null,
  "1.8 storage is not a trust boundary — a poisoned value is rejected on read",
);

storage.clear();
rememberOAuthReturn("/my-career", "/");
clearOAuthReturn();
ok(consumeOAuthReturn() === null, "1.9 a failed attempt clears the pending path");

ok(
  oauthRedirectUri("/my-career") === "https://preview.example.test/my-career",
  "1.10 redirect_uri is built from the CURRENT origin, so preview and production self-return",
);
ok(
  !oauthErrorMessage("sv").toLowerCase().includes("supabase") &&
    !oauthErrorMessage("en").toLowerCase().includes("oauth"),
  "1.11 the user-facing error names no infrastructure",
);
ok(
  oauthErrorMessage("sv") !== oauthErrorMessage("en"),
  "1.12 the error is localised in both languages",
);

// The call sites must actually use it.
const form = read("src/components/auth/PortalAuthForm.tsx");
ok(
  form.includes("rememberOAuthReturn"),
  "1.13 the auth form remembers the destination before leaving",
);
ok(form.includes("oauthRedirectUri("), "1.14 redirect_uri carries the destination");
ok(
  !/redirect_uri: window\.location\.origin,/.test(form),
  "1.15 the bare-origin redirect_uri is gone",
);
ok(
  form.includes("consumeOAuthReturn"),
  "1.16 a broker that drops the path is covered by the stash",
);
ok(form.includes("oauthErrorMessage"), "1.17 raw provider errors are not rendered");
{
  // Scoped to the Google handler's own body, so an unrelated handler elsewhere
  // in the file cannot make this pass or fail.
  const start = form.indexOf("async function onGoogle");
  const body = form.slice(start, form.indexOf("\n  }", start));
  ok(body.includes("oauthErrorMessage"), "1.18 the Google handler shows a sanitised message");
  ok(!body.includes("err.message"), "1.18b the Google handler surfaces no raw error text");
}
const adminLogin = read("src/routes/admin.login.tsx");
ok(adminLogin.includes("oauthErrorMessage"), "1.19 admin login also sanitises OAuth errors");
ok(
  !read("src/integrations/lovable/index.ts").includes("oauth-return"),
  "1.20 the autogenerated Lovable file is untouched",
);

// =========================================================================
group("2 · The public assessment buffer");
// =========================================================================

storage.clear();
ok(readBuffer() === null, "2.1 no buffer exists before a run starts");

let buf = startBuffer("sv", "2026-07-30T10:00:00.000Z");
ok(readBuffer() !== null, "2.2 starting a run creates a buffer");
ok(!isComplete(buf), "2.3 a fresh buffer is not complete");
ok(remainingItemIds(buf).length === CORE_ITEMS.length, "2.4 every item is initially outstanding");

// Answer everything, in the shape each item requires.
for (const item of CORE_ITEMS) {
  buf =
    item.format === "scale"
      ? recordAnswer(buf, { itemId: item.id, format: "scale", value: 7 })
      : recordAnswer(buf, { itemId: item.id, format: "single_choice", optionId: `${item.id}_A` });
}
ok(isComplete(buf), "2.5 answering all twenty items completes the buffer");
ok(remainingItemIds(buf).length === 0, "2.6 nothing remains outstanding");

// Survives a refresh: re-reading from storage returns the same answers.
const reread = readBuffer();
ok(
  reread !== null && reread.answers.length === CORE_ITEMS.length,
  "2.7 progress survives a refresh in the same tab",
);
ok(isComplete(reread), "2.8 a restored buffer is still complete");

// Changing an answer replaces it rather than appending a second one.
const before = readBuffer()!.answers.length;
buf = recordAnswer(buf, { itemId: "CQ01", format: "scale", value: 2 });
ok(readBuffer()!.answers.length === before, "2.9 re-answering replaces rather than appends");
ok(
  readBuffer()!.answers.find((a) => a.itemId === "CQ01")?.format === "scale" &&
    (readBuffer()!.answers.find((a) => a.itemId === "CQ01") as { value: number }).value === 2,
  "2.10 the replacement value is the one kept",
);

// Version fencing: a buffer from another instrument version is discarded, not
// replayed into a changed instrument.
const good = readBuffer()!;
storage.setItem(
  "cqj:discovery:v31:public-buffer:v1",
  JSON.stringify({ ...good, definitionVersion: "2099-scd-v9.9.9" }),
);
ok(readBuffer() === null, "2.11 a buffer from a different definition version is discarded");
storage.setItem(
  "cqj:discovery:v31:public-buffer:v1",
  JSON.stringify({ ...good, contentVersion: "v9.9-later" }),
);
ok(readBuffer() === null, "2.12 a buffer from a different content version is discarded");

// Malformed buffers are treated as absent, never partially trusted.
for (const [label, payload] of [
  ["not json", "{{{"],
  [
    "unknown item",
    JSON.stringify({ ...good, answers: [{ itemId: "NOPE", format: "scale", value: 5 }] }),
  ],
  [
    "out-of-range scale",
    JSON.stringify({ ...good, answers: [{ itemId: "CQ01", format: "scale", value: 99 }] }),
  ],
  [
    "foreign option",
    JSON.stringify({
      ...good,
      answers: [{ itemId: "CQ02", format: "single_choice", optionId: "CQ09_A" }],
    }),
  ],
  ["bad locale", JSON.stringify({ ...good, locale: "de" })],
] as const) {
  storage.setItem("cqj:discovery:v31:public-buffer:v1", payload);
  ok(readBuffer() === null, `2.13 malformed buffer treated as absent: ${label}`);
}

// Clearing is explicit and total.
storage.setItem("cqj:discovery:v31:public-buffer:v1", JSON.stringify(good));
clearBuffer();
ok(readBuffer() === null, "2.14 clearBuffer removes the buffer");

// The buffer must be fenced to the CURRENT versions, so the constants it
// records are the ones a replay will be validated against.
ok(
  good.definitionVersion === DEFINITION_VERSION && good.contentVersion === CONTENT_VERSION,
  "2.15 a new buffer records the current definition and content versions",
);

// =========================================================================
group("3 · No anonymous database access was introduced");
// =========================================================================

const bufferSrc = read("src/lib/career-discovery/v31-public-buffer.ts");
ok(
  !/from "@\/integrations\/supabase|createServerFn|\.from\(/.test(bufferSrc),
  "3.1 the buffer never touches the database — it is browser storage only",
);

const publicFns = read("src/lib/career-discovery/v31-public.functions.ts");
ok(
  publicFns.includes("requireSupabaseAuth"),
  "3.2 persistence is authenticated — the replay runs as the real owner",
);
ok(
  /persistPublicV31Run[\s\S]*?requireSupabaseAuth/.test(publicFns),
  "3.3 the persist function specifically carries the auth middleware",
);
{
  // Strip comments first: the prose in this file legitimately discusses grants
  // and anonymity, and a naive scan matches its own documentation.
  const code = publicFns.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(
    !/\bGRANT\b/i.test(code) && !code.includes("service_role"),
    "3.4 no grant and no service-role bypass in the public path",
  );
}

// The migration set must not have gained an anon grant on candidate data.
const migrations = read("supabase/migrations/20260730090000_career_discovery_v3_1_schema.sql");
ok(
  migrations.includes("anon gets nothing"),
  "3.5 PR1's stance that anon holds nothing is still recorded in the schema",
);

// =========================================================================
group("4 · Lifecycle and review gates are read, never bypassed");
// =========================================================================

ok(
  publicFns.includes("getV31Availability"),
  "4.1 the public route can ask whether v3.1 is actually takeable",
);
ok(
  /CANDIDATE_ADMINISTRABLE\s*=\s*\["pilot", "active"\]/.test(publicFns),
  "4.2 only pilot and active count as candidate-administrable",
);
ok(
  /outstanding === 0/.test(publicFns),
  "4.3 availability requires every review gate to be cleared",
);
ok(
  !/lifecycle_status['"]?\s*[:=]\s*['"](pilot|active)['"]/.test(publicFns) &&
    !/UPDATE[\s\S]*cd_definition_versions/i.test(publicFns),
  "4.4 the application never promotes the instrument itself",
);

// Activation must be owner-run, and must NOT be a migration.
const activation = read("docs/assessment/career-discovery/v31-activation.sql");
ok(activation.includes("NOT A MIGRATION"), "4.5 the activation script says it is not a migration");
ok(
  activation.includes("'pilot'") && activation.includes("review_status"),
  "4.6 activation promotes lifecycle and gates together",
);
let activationIsMigration = false;
try {
  readFileSync(path.join(process.cwd(), "supabase/migrations/v31-activation.sql"));
  activationIsMigration = true;
} catch {
  activationIsMigration = false;
}
ok(!activationIsMigration, "4.7 activation is not present in supabase/migrations");

// =========================================================================
console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`public-assessment-auth-check: all ${checks} checks passed.`);
