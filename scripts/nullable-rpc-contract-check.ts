// The two hand-maintained nullable RPC argument types — pinned.
//
// Run: bun run nullable-rpc-contract:check
//
// ── THE EXCEPTION THIS PROTECTS ────────────────────────────────────────
//
// `src/integrations/supabase/types.ts` is generated. Two entries in it are
// NOT what the generator writes, on purpose:
//
//   bcp_conduct_record_resolution      _agreed_statement:    string | null
//                                      _divergent_statement: string | null
//   scp_iv_finalise_previewed_report   _draft_run_id:        string | null
//
// A Postgres function argument is nullable unless the function is STRICT.
// The Supabase generator has exactly one way to say "you need not supply a
// string here" — an optional key, which it emits only when the argument has
// a DEFAULT. These three have no default and their functions are not STRICT,
// so the generator writes a bare `string` and the honest call
// (`value ?? null`) stops compiling.
//
// And null is REQUIRED, not merely allowed: the BESKT resolution table's
// shape CHECK demands `divergent_statement IS NULL` for an agreed
// resolution, so an empty string is a runtime violation, and with no SQL
// default the argument cannot be omitted either.
//
// ── THE DEFECT THIS PINS ───────────────────────────────────────────────
//
// A regeneration silently rewrites both entries back to `string`. It has
// happened four times (restored by PR #236, 9af156e, ba2edd9 and PR #261;
// last erased by c655d82). Each time the only symptom was three bare `tsc`
// errors in BESKT and Interview Intelligence code nobody had touched —
// which reads as "those files are broken" and invites the wrong repair: an
// `as unknown as string` cast, tried and reverted on 2026-09-16. This guard
// turns the next wipe into a diagnostic that names the cause and the fix.
//
// ── IT PINS BOTH SIDES OF THE CONTRACT ─────────────────────────────────
//
// Pinning the types alone would preserve the exception after it stopped
// being true. So this also reads the LATEST SQL definition of each function
// and asserts the facts that justify it: the argument exists, has no
// DEFAULT, and the function is not STRICT. If a migration ever gives one a
// default, this fails and says the exception should be retired — by
// regenerating, not by hand.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const TYPES = "src/integrations/supabase/types.ts";
const MIGRATIONS = "supabase/migrations";

interface Exception {
  readonly fn: string;
  readonly nullableArgs: readonly string[];
  /** Every argument the function takes, so an arity change is noticed. */
  readonly allArgs: readonly string[];
  readonly caller: string;
}

const EXCEPTIONS: readonly Exception[] = [
  {
    fn: "bcp_conduct_record_resolution",
    nullableArgs: ["_agreed_statement", "_divergent_statement"],
    allArgs: [
      "_operation_id",
      "_panel_id",
      "_expected_revision",
      "_item_key",
      "_resolution_kind",
      "_agreed_statement",
      "_divergent_statement",
      "_rationale",
    ],
    caller: "src/lib/beskt/interview-conduct.functions.ts",
  },
  {
    fn: "scp_iv_finalise_previewed_report",
    nullableArgs: ["_draft_run_id"],
    allArgs: ["_case_id", "_expected_basis_hash", "_draft_run_id"],
    caller: "src/lib/interview-intelligence/runtime.functions.ts",
  },
];

let failures = 0;
function ck(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
}

/** Comments quote the very things this guard forbids. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, "");
const sqlCode = (src: string) => src.replace(/--[^\n]*$/gm, "");

/** The `Args: { … }` block of one function in the generated types. */
function argsBlockOf(types: string, fn: string): string | null {
  const at = types.search(new RegExp(`^\\s{6}${fn}: \\{`, "m"));
  if (at < 0) return null;
  const args = types.indexOf("Args:", at);
  const open = types.indexOf("{", args);
  let depth = 0;
  for (let i = open; i < types.length; i += 1) {
    if (types[i] === "{") depth += 1;
    else if (types[i] === "}") {
      depth -= 1;
      if (depth === 0) return types.slice(open + 1, i);
    }
  }
  return null;
}

/** The newest `CREATE [OR REPLACE] FUNCTION public.<fn>(` across every
 *  migration: its argument list and its header up to the body. Files sort by
 *  their version prefix, and the LAST definition is the one in force. */
function latestDefinition(fn: string): { file: string; args: string; header: string } | null {
  const files = readdirSync(path.join(ROOT, MIGRATIONS))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let found: { file: string; args: string; header: string } | null = null;
  const start = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}\\s*\\(`,
    "gi",
  );
  for (const file of files) {
    const sql = sqlCode(read(path.join(MIGRATIONS, file)));
    for (const m of sql.matchAll(start)) {
      const open = m.index! + m[0].length;
      let depth = 1;
      let i = open;
      for (; i < sql.length && depth > 0; i += 1) {
        if (sql[i] === "(") depth += 1;
        else if (sql[i] === ")") depth -= 1;
      }
      const body = sql.indexOf("$$", i);
      found = {
        file,
        args: sql.slice(open, i - 1),
        header: sql.slice(i, body < 0 ? i + 400 : body),
      };
    }
  }
  return found;
}

const types = read(TYPES);

for (const ex of EXCEPTIONS) {
  console.log(`\n${ex.fn}`);

  // ── 1 · the generated types carry the exception ────────────────────
  const block = argsBlockOf(types, ex.fn);
  ck("1.1 the function is declared in the generated types", block !== null);
  for (const arg of ex.nullableArgs) {
    ck(
      `1.2 ${arg} is typed \`string | null\` — the hand-maintained exception`,
      block !== null && new RegExp(`\\b${arg}: string \\| null\\b`).test(block),
      `a types regeneration has erased it. Restore \`${arg}: string | null\` in ${TYPES} ` +
        "(see this guard's header). Do NOT cast at the call site and do NOT pass an empty string.",
    );
    ck(
      `1.3 ${arg} is not optional — there is no SQL default to fall back on`,
      block !== null && !new RegExp(`\\b${arg}\\?:`).test(block),
    );
  }
  ck(
    "1.4 every other argument is still the generator's own non-null type",
    block !== null &&
      ex.allArgs
        .filter((a) => !ex.nullableArgs.includes(a))
        .every((a) => new RegExp(`\\b${a}: (string|number)\\b(?! \\| null)`).test(block)),
    "the exception must stay exactly as wide as the database contract, and no wider",
  );

  // ── 2 · the database still justifies it ────────────────────────────
  const def = latestDefinition(ex.fn);
  ck("2.1 the function's latest SQL definition is found", def !== null);
  if (def) {
    const declared = def.args
      .split(",")
      .map((a) => a.trim().split(/\s+/)[0])
      .filter(Boolean);
    ck(
      `2.2 its arguments are the ones this guard knows (${def.file})`,
      JSON.stringify(declared) === JSON.stringify(ex.allArgs),
      `found (${declared.join(", ")}) — update the exception deliberately, do not let it drift`,
    );
    for (const arg of ex.nullableArgs) {
      const decl = def.args.split(",").find((a) => a.trim().startsWith(`${arg} `)) ?? "";
      ck(
        `2.3 ${arg} has no DEFAULT, so the generator cannot make it optional`,
        decl.length > 0 && !/\bDEFAULT\b|=/i.test(decl),
        "it has a default now: RETIRE this exception by regenerating the types, and delete it here",
      );
    }
    ck(
      "2.4 the function is not STRICT, so NULL reaches its body",
      !/\bSTRICT\b|RETURNS\s+NULL\s+ON\s+NULL\s+INPUT/i.test(def.header),
      "a STRICT function returns NULL for a NULL argument without running — the exception no longer holds",
    );
  }

  // ── 3 · the call site is honest ────────────────────────────────────
  const caller = code(read(ex.caller));
  const callAt = caller.search(new RegExp(`rpc\\(\\s*["']${ex.fn}["']`));
  const call = callAt < 0 ? "" : caller.slice(callAt, caller.indexOf("});", callAt));
  ck(`3.1 ${ex.caller} calls it`, callAt >= 0);
  for (const arg of ex.nullableArgs) {
    ck(
      `3.2 ${arg} is passed as \`… ?? null\`, never a cast and never an empty string`,
      new RegExp(`${arg}:\\s*[\\w.]+\\s*\\?\\?\\s*null\\s*,`).test(call) &&
        !/as unknown as|as any|\?\?\s*["']["']/.test(call),
      "null is the database's word for 'not provided'; anything else is a lie to the compiler or a CHECK violation",
    );
  }
}

// ── 4 · the exception list is closed ─────────────────────────────────
//
// The generator never writes `| null` inside an Args block. Every one found
// is therefore hand-maintained, and must be one this guard knows about — a
// third, added quietly, would be erased just as quietly.
console.log("\nthe exception list is closed");
{
  const functionsAt = types.indexOf("    Functions: {");
  const functionsEnd = types.indexOf("\n    Enums: {", functionsAt);
  const functions = types.slice(functionsAt, functionsEnd < 0 ? undefined : functionsEnd);
  const found: string[] = [];
  for (const m of functions.matchAll(/^\s{6}(\w+): \{\s*\n?\s*Args: \{/gm)) {
    const block = argsBlockOf(functions, m[1]!);
    if (!block) continue;
    for (const a of code(block).matchAll(/(\w+)\??: [^\n;]*\| null/g))
      found.push(`${m[1]}.${a[1]}`);
  }
  const known = EXCEPTIONS.flatMap((e) => e.nullableArgs.map((a) => `${e.fn}.${a}`));
  ck(
    "4.1 the sweep actually read the Functions block",
    functionsAt > 0 && found.length >= known.length,
    `found ${found.length}`,
  );
  ck(
    "4.2 every hand-maintained nullable RPC argument is one this guard pins",
    JSON.stringify([...found].sort()) === JSON.stringify([...known].sort()),
    `in types.ts: ${found.join(", ") || "none"}`,
  );
}

if (failures > 0) {
  console.error(`\nnullable-rpc-contract: ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log(
  "\nnullable-rpc-contract:check OK (both hand-maintained nullable RPC argument types are " +
    "present, exactly as wide as the database contract; the latest SQL definitions still " +
    "justify them; the call sites pass null honestly; and the exception list is closed)",
);
