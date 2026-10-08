// The three required nullable RPC arguments live in database.ts, outside the
// generated file. Check the effective types, SQL, callers and a simulated
// regeneration that removes every manual nullable annotation from types.ts.
// Run: bun run nullable-rpc-contract:check

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const TYPES = "src/integrations/supabase/types.ts";
const OVERLAY = "src/integrations/supabase/database.ts";
const TYPE_TEST = "tests/types/nullable-rpc-contract.ts";
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
      const bodyStart = sql.slice(i).search(/\bAS\s+\$(?:[a-z_][a-z_0-9]*)?\$/i);
      const body = bodyStart < 0 ? -1 : i + bodyStart;
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
const options: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  types: [],
};
function compile(generated: string) {
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile;
  host.readFile = (file) =>
    path.resolve(file) === path.join(ROOT, TYPES) ? generated : readFile(file);
  return ts.createProgram([path.join(ROOT, TYPE_TEST)], options, host);
}
const program = compile(types);
const checker = program.getTypeChecker();
const overlay = program.getSourceFile(path.join(ROOT, OVERLAY))!;
function alias(name: string) {
  const node = overlay.statements.find((n) => ts.isTypeAliasDeclaration(n) && n.name.text === name);
  return node ? checker.getTypeAtLocation(node) : undefined;
}
function field(type: ts.Type | undefined, name: string) {
  const symbol = type?.getProperty(name);
  const location = symbol?.declarations?.[0];
  return symbol && location ? checker.getTypeOfSymbolAtLocation(symbol, location) : undefined;
}
const functions = field(field(alias("Database"), "public"), "Functions");
for (const ex of EXCEPTIONS) {
  console.log(`\n${ex.fn}`);
  const args = field(field(functions, ex.fn), "Args");
  const block = argsBlockOf(types, ex.fn);
  ck("1.1 the function is declared in the generated types", block !== null);
  for (const arg of ex.nullableArgs) {
    const type = field(args, arg);
    ck(
      `1.2 ${arg} is typed \`string | null\` in the application overlay`,
      !!type && checker.typeToString(type) === "string | null",
      `Keep the SQL-backed override in ${OVERLAY}; do not edit the generated file or cast the caller.`,
    );
    ck(
      `1.3 ${arg} is not optional — there is no SQL default to fall back on`,
      !!args?.getProperty(arg) && !(args.getProperty(arg)!.flags & ts.SymbolFlags.Optional),
    );
  }
  ck(
    "1.4 every other argument is still the generator's own non-null type",
    ex.allArgs
      .filter((a) => !ex.nullableArgs.includes(a))
      .every((a) => {
        const type = field(args, a);
        return !!type && ["string", "number"].includes(checker.typeToString(type));
      }),
    "the override must stay exactly as wide as the database contract",
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

// The two legacy nullable exceptions remain closed. Additive RI foundation
// contracts are reviewed separately below; all other generated types pass through.
console.log("\nthe override list is closed");
ck(
  "4.1 only the documented functions have overrides",
  JSON.stringify(
    alias("Overrides")
      ?.getProperties()
      .map((p) => p.name)
      .sort(),
  ) === JSON.stringify(EXCEPTIONS.map((e) => e.fn).sort()),
);
for (const file of ["client.ts", "client.server.ts", "auth-middleware.ts", "public-server.ts"]) {
  ck(
    `4.2 ${file} uses the application Database overlay`,
    /import type \{ Database \} from ['"][^'"]*database['"]/.test(
      read(`src/integrations/supabase/${file}`),
    ),
  );
}
const foundation = [
  ["scp_iv_save_session_process", ["_reflection", "_deviations"]],
  [
    "scp_iv_create_manual_finding",
    ["_question_id", "_source_passage_id", "_source_label", "_responsible_label", "_due_on"],
  ],
  ["scp_iv_review_manual_finding", ["_responsible_label", "_due_on"]],
  ["scp_iv_manual_finding_capabilities", []],
  ["scp_iv_case_content_manifest", []],
  ["scp_iv_case_frozen_content", []],
  ["scp_iv_acknowledge_observed_content", []],
  ["scp_iv_content_inventory", []],
  ["scp_iv_case_frozen_labels", []],
] as const;
ck(
  "4.3 only the reviewed RI foundation functions have additive contracts",
  JSON.stringify(
    alias("FoundationFunctions")
      ?.getProperties()
      .map((p) => p.name)
      .sort(),
  ) === JSON.stringify(foundation.map(([name]) => name).sort()),
);
for (const [name, nullable] of foundation) {
  const def = latestDefinition(name);
  const args = field(field(functions, name), "Args");
  const sqlArgs = def?.args
    .split(",")
    .map((v) => v.trim().split(/\s+/)[0])
    .sort();
  ck(
    `4.4 ${name} argument names match its versioned SQL`,
    JSON.stringify(sqlArgs) ===
      JSON.stringify(
        args
          ?.getProperties()
          .map((p) => p.name)
          .sort(),
      ),
  );
  ck(
    `4.5 ${name} has no defaults or STRICT short-circuit`,
    Boolean(def) &&
      !/\bDEFAULT\b|=/i.test(def!.args) &&
      !/\bSTRICT\b|RETURNS\s+NULL\s+ON\s+NULL\s+INPUT/i.test(def!.header),
  );
  for (const key of sqlArgs ?? []) {
    const type = field(args, key);
    const property = args?.getProperty(key);
    ck(
      `4.6 ${name}.${key} is required and has only its reviewed nullability`,
      !!type &&
        !!property &&
        !(property.flags & ts.SymbolFlags.Optional) &&
        checker.typeToString(type).includes("null") ===
          (nullable as readonly string[]).includes(key),
    );
    const declaration = def!.args.split(",").find((v) => v.trim().startsWith(`${key} `));
    const sqlType = declaration?.trim().split(/\s+/)[1]?.toLowerCase();
    const reviewedTypes: Record<string, string> = {
      uuid: "string",
      text: "string",
      date: "string",
      timestamptz: "string",
      integer: "number",
      bigint: "number",
      boolean: "boolean",
      "uuid[]": "string[]",
    };
    const expected = sqlType && reviewedTypes[sqlType];
    ck(
      `4.7 ${name}.${key} has its exact reviewed SQL-backed type`,
      Boolean(expected) &&
        !!type &&
        checker.typeToString(type) ===
          expected + ((nullable as readonly string[]).includes(key) ? " | null" : ""),
      `SQL ${sqlType ?? "missing"}; expected ${expected ?? "unreviewed"}`,
    );
  }
}
function diagnostics(p: ts.Program) {
  return ts
    .getPreEmitDiagnostics(p)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}
const errors = diagnostics(program);
ck(
  "5.1 actual Supabase RPC calls accept null and reject omission/wrong types",
  errors.length === 0,
  errors.join("\n"),
);

// Simulate the real regeneration in memory. Never edit tracked files or need
// production credentials. The second compile proves the fix survives bare
// generator strings rather than merely detecting another wipe in CI.
let regenerated = types;
for (const ex of EXCEPTIONS) {
  const original = argsBlockOf(regenerated, ex.fn);
  if (!original) continue;
  let bare = original;
  for (const arg of ex.nullableArgs)
    bare = bare.replace(new RegExp(`(\\b${arg}: string) \\| null\\b`), "$1");
  regenerated = regenerated.replace(original, bare);
}
for (const ex of EXCEPTIONS) {
  const block = argsBlockOf(regenerated, ex.fn) ?? "";
  for (const arg of ex.nullableArgs)
    ck(
      `5.0 simulated regeneration actually erases ${ex.fn}.${arg}`,
      new RegExp(`\\b${arg}: string\\s*(?:;|$)`, "m").test(block) &&
        !new RegExp(`\\b${arg}: string \\| null`).test(block),
    );
}
const regenerationErrors = diagnostics(compile(regenerated));
ck(
  "5.2 regeneration-safe RPC calls compile after all three fields become bare strings",
  regenerationErrors.length === 0,
  regenerationErrors.join("\n"),
);

if (failures > 0) {
  console.error(`\nnullable-rpc-contract: ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log(
  "\nnullable-rpc-contract:check OK (stable overlay; required nullable arguments; current and regenerated type checks; SQL contracts and honest callers).",
);
