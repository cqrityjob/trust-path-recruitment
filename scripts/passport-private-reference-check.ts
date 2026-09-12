/**
 * Security Passport — the private credential reference never leaves the owner.
 *
 * Run via `bun run passport-private-reference:check`.
 *
 * ── WHY A GUARD AND NOT A COLUMN MOVE ──────────────────────────────────
 *
 * `sp_claims.credential_reference` is a certificate, decision or member
 * number: a lookup key into somebody else's register, and the single most
 * damaging field in the Passport to leak. The tidy answer would be to move it
 * into an owner-only side table.
 *
 * It is not available. Real holders already hold real references in that
 * column, and relocating them would be exactly the destructive conversion the
 * phase specification forbids — "never delete or rewrite user data". The same
 * section allows the alternative it is written for: strict column allowlists
 * on every read path.
 *
 * This is the enforcement of that allowlist. A comment saying "never disclose
 * this" cannot stop the next projection from adding it; a build failure can.
 *
 * ── WHAT IT CHECKS ─────────────────────────────────────────────────────
 *
 *   1. no disclosure, recipient, card, export, social or analytics module
 *      names the field at all;
 *   2. no SQL function that builds a disclosure payload names it;
 *   3. no recipient-facing projection uses SELECT * — the shape that would
 *      carry it without naming it;
 *   4. the owner-only reader is still owner-only;
 *   5. it is absent from browser storage, logs and telemetry calls.
 *
 * The database suite proves the runtime half: a real reference on a real claim
 * appears in neither sp_disclosure_payload nor sp_selected_merits_payload.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const fails: string[] = [];
function ok(cond: boolean, name: string): void {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}`);
  if (!cond) fails.push(name);
}

function walk(dir: string, ext: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, ext));
    else if (ext.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

/** Source with comments stripped: a comment explaining that a field must never
 *  be disclosed must not fail the check it documents. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

/** SQL with comments stripped, same reasoning. */
function sqlCode(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

const FIELDS = ["credential_reference", "credentialReference"] as const;

console.log("passport-private-reference-check\n");

/* ══════════════════════════════════════════════════════════════════════
   1. The modules that must never name it
   ══════════════════════════════════════════════════════════════════════ */
console.log("1 -- no disclosure, card, export or analytics module names it");

/** Every module whose output reaches somebody who is not the owner. The list
 *  is explicit rather than a glob: a new disclosure surface has to be added
 *  here deliberately, and a reviewer can see what the boundary is. */
const NON_OWNER_MODULES = [
  "src/lib/security-passport/disclosure.ts",
  "src/lib/security-passport/disclosure.functions.ts",
  "src/lib/security-passport/public-disclosure.functions.ts",
  "src/lib/security-passport/public-disclosure.server.ts",
  "src/lib/security-passport/recipient-presentation.ts",
  "src/lib/security-passport/selected-sharing.functions.ts",
  "src/lib/security-passport/share-selection.ts",
  "src/lib/security-passport/share-image.ts",
  "src/lib/security-passport/share-transport.ts",
  "src/lib/security-passport/share-channels.ts",
  "src/lib/security-passport/social.ts",
  "src/lib/security-passport/social-export.ts",
  "src/lib/security-passport/card.ts",
  "src/lib/security-passport/packages.ts",
  "src/lib/security-passport/classification.ts",
  "src/lib/security-passport/application-disclosure.functions.ts",
  "src/lib/security-passport/employer-matching.ts",
  "src/lib/security-passport/linkedin-profile.ts",
];

for (const rel of NON_OWNER_MODULES) {
  const src = code(readFileSync(join(root, rel), "utf8"));
  const named = FIELDS.filter((f) => src.includes(f));
  ok(
    named.length === 0,
    `${rel} names no private reference${named.length ? ` — found ${named.join(", ")}` : ""}`,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   2. The SQL projections
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n2 -- no disclosure payload function names it");

const MIGRATIONS = join(root, "supabase/migrations");
const PAYLOAD_FUNCTIONS = [
  "sp_disclosure_payload",
  "sp_selected_merits_payload",
  "sp_get_disclosure",
  "sp_get_disclosure_session",
];

/** The LAST definition of a function across the migration history wins, which
 *  is what actually runs. Checking every historical definition would fail on a
 *  version a later migration already replaced.
 *
 *  The body is dollar-quoted with a tag the author chose ($function$, $fn$,
 *  $$), so the extent is found by locating the opening tag and then its
 *  matching close, rather than by a regex with a backreference — which is what
 *  the first attempt did, and it matched nothing at all. */
function latestDefinition(fn: string): string | null {
  let found: string | null = null;
  const head = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\s*\\(`, "g");

  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = sqlCode(readFileSync(join(MIGRATIONS, file), "utf8"));
    for (const m of sql.matchAll(head)) {
      const start = m.index ?? 0;
      const tagMatch = /\$([A-Za-z_]*)\$/.exec(sql.slice(start));
      if (!tagMatch) continue;
      const tag = tagMatch[0];
      const bodyStart = start + (tagMatch.index ?? 0) + tag.length;
      const bodyEnd = sql.indexOf(tag, bodyStart);
      if (bodyEnd === -1) continue;
      found = sql.slice(start, bodyEnd + tag.length);
    }
  }
  return found;
}

for (const fn of PAYLOAD_FUNCTIONS) {
  const def = latestDefinition(fn);
  ok(def !== null, `${fn} has a definition in the migration history`);
  if (!def) continue;
  ok(!def.includes("credential_reference"), `${fn} does not name credential_reference`);
  ok(!def.includes("holder_note"), `${fn} does not name holder_note either`);
  // The shape that would carry it without naming it.
  ok(
    !/SELECT\s+\*\s+FROM\s+public\.sp_claims/i.test(def),
    `${fn} never does SELECT * FROM sp_claims`,
  );
  ok(
    !/to_jsonb\s*\(\s*c\s*\)/i.test(def),
    `${fn} never serialises a whole claim row with to_jsonb`,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   3. The owner-only reader
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n3 -- the one reader that may see it is owner-scoped");

{
  const src = readFileSync(
    join(root, "src/lib/security-passport/credentials.functions.ts"),
    "utf8",
  );
  const fn = src.slice(src.indexOf("export const getCredentialPrivateFields"));
  ok(fn.length > 0, "getCredentialPrivateFields exists");
  ok(/requireSupabaseAuth/.test(fn.slice(0, 400)), "and requires an authenticated caller");
  ok(
    /\.select\("credential_reference, holder_note"\)/.test(fn.slice(0, 1200)),
    "and reads a NAMED column pair, never a wildcard",
  );
  // The holder's own drafts carry it back to the form, which is the owner
  // reading their own row and is the only other place it may appear.
  // Four, and each one is the OWNER reading their own row:
  //   the draft-resume column list and its mapper (listMyCredentialDrafts),
  //   the owner-only read and its mapper (getCredentialPrivateFields).
  // A fifth would be a new reader, and a new reader is the thing this guard
  // exists to notice.
  const readers = [...src.matchAll(/credential_reference/g)].length;
  ok(
    readers === 4,
    `credential_reference appears ${readers} time(s) in the server module — expected exactly the 4 owner-scoped uses`,
  );
  ok(
    /listMyCredentialDrafts/.test(src) &&
      src.indexOf("credential_reference") > src.indexOf("export const listMyCredentialDrafts"),
    "the first is the holder resuming their own draft",
  );
}

/* ══════════════════════════════════════════════════════════════════════
   4. It reaches no browser store, log or telemetry call
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n4 -- it reaches no storage, log or analytics sink");

const PASSPORT_SRC = [
  ...walk(join(root, "src/lib/security-passport"), [".ts", ".tsx"]),
  ...walk(join(root, "src/components/security-passport"), [".ts", ".tsx"]),
];

const SINKS = [
  { name: "localStorage / sessionStorage", re: /(local|session)Storage[^\n]*credentialReference/i },
  { name: "console logging", re: /console\.\w+\([^)]*credentialReference/i },
  {
    name: "an analytics or tracking call",
    re: /(track|analytics|telemetry|capture)\w*\([^)]*credentialReference/i,
  },
  {
    name: "a URL or query parameter",
    re: /(searchParams|URLSearchParams|\?code=)[^\n]*credentialReference/i,
  },
];

for (const sink of SINKS) {
  const offenders = PASSPORT_SRC.filter((f) => sink.re.test(code(readFileSync(f, "utf8"))));
  ok(
    offenders.length === 0,
    `no private reference reaches ${sink.name}${offenders.length ? " — " + offenders.map((f) => relative(root, f)).join(", ") : ""}`,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   5. The new phase-1 surfaces carry none of it
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n5 -- the international-certification surfaces carry none of it");

{
  const scope = readFileSync(
    join(root, "src/lib/security-passport/certification-scope.ts"),
    "utf8",
  );
  const classification = readFileSync(
    join(root, "src/lib/security-passport/classification.ts"),
    "utf8",
  );
  for (const [name, src] of [
    ["certification-scope.ts", scope],
    ["classification.ts", classification],
  ] as const) {
    ok(
      FIELDS.every((f) => !src.includes(f)),
      `${name} does not mention the private reference at all`,
    );
  }

  // The classifier's input type is the guarantee: it cannot leak a field it
  // has no way to receive.
  ok(
    !/credential_?[Rr]eference/.test(classification),
    "the classifier's input type has no field for it",
  );

  const server = readFileSync(
    join(root, "src/lib/security-passport/credentials.functions.ts"),
    "utf8",
  );
  const globalFn = server.slice(
    server.indexOf("export const listGlobalCertificationTypes"),
    server.indexOf(
      "/* ------------------------------------------------------------------ */\n/* The three-market overview",
    ),
  );
  ok(globalFn.length > 0, "listGlobalCertificationTypes is present");
  ok(
    !globalFn.includes("credential_reference") && !globalFn.includes("sp_claims"),
    "and reads the CATALOGUE only — it never touches a holder's claims",
  );
  ok(!/select\(\s*["'`]\s*\*/.test(globalFn), "with a named column list, never a wildcard");
}

console.log(
  fails.length === 0
    ? "\npassport-private-reference-check: all assertions passed."
    : `\npassport-private-reference-check FAILED (${fails.length})`,
);
if (fails.length > 0) {
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
