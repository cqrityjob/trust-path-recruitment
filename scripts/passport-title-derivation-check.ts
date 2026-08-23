/**
 * Security Passport — the title derivation guard.
 *
 * Two invariants, both of which used to be true only by convention.
 *
 * ── 1. THE MIRROR MATCHES THE MIGRATION ────────────────────────────────
 *
 * `sp_professional_titles` is authoritative, but the fixture personas and the
 * engine tests have no database, so `identity/market-rules.ts` mirrors the
 * Swedish seed. A mirror nobody checks is a second source of truth that agrees
 * today and disagrees after the next edit — so this parses the seed block out
 * of the migration and compares every field.
 *
 * ── 2. NO COMPONENT CARRIES ITS OWN MAPPING ────────────────────────────
 *
 * Before the engine existed, the Passport Card printed a stored string and the
 * server set that string to the literal "Väktare" for every holder who had
 * ever signed in — whether they held VU1, held nothing, or held a current
 * ordningsvaktsförordnande. The fix is only durable if the next component
 * cannot quietly reintroduce it, so this fails the build when a credential
 * code and a professional title appear together anywhere outside the engine.
 *
 * Run: bun run passport-title-derivation:check
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MIRRORED_TITLE_RULES } from "../src/lib/security-passport/identity/market-rules";
import type { TitleRule } from "../src/lib/security-passport/identity/types";

const ROOT = process.cwd();
const MIGRATION = join(ROOT, "supabase/migrations/20260907091000_sp_sweden_truth_model.sql");
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");

const failures: string[] = [];
let checks = 0;

function ok(label: string) {
  checks += 1;
  console.log(`  ok  ${label}`);
}
function fail(msg: string) {
  failures.push(msg);
  console.log(`  FAIL ${msg.split("\n")[0]}`);
}

/* ------------------------------------------------------------------ */
/* 1. Parse the seed, and compare it to the mirror                     */
/* ------------------------------------------------------------------ */

type SeedRule = {
  code: string;
  family: string | null;
  roleCode: string | null;
  outputKind: string;
  nameLocal: string;
  nameEn: string;
  creds: string[];
  priority: number;
};

function parseSeed(): SeedRule[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf("INSERT INTO public.sp_professional_titles");
  if (start < 0) throw new Error(`No sp_professional_titles seed found in ${MIGRATION}`);
  const end = sql.indexOf("AS v(code, family, role_code", start);
  if (end < 0) throw new Error("The sp_professional_titles seed block is not shaped as expected.");

  const body = sql.slice(start, end);

  // ('CODE', family, role, 'kind', 'local', 'en', ARRAY[...]::text[], priority)
  const row =
    /\(\s*'([A-Z0-9_]+)'\s*,\s*(NULL|'[A-Z_]+')\s*,\s*(NULL|'[A-Z0-9_]+')\s*,\s*'([a-z_]+)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*ARRAY\[([^\]]*)\]::text\[\]\s*,\s*(\d+)\s*\)/g;

  const unquote = (v: string) => (v === "NULL" ? null : v.slice(1, -1));
  const out: SeedRule[] = [];
  let m: RegExpExecArray | null;
  while ((m = row.exec(body)) !== null) {
    out.push({
      code: m[1],
      family: unquote(m[2]),
      roleCode: unquote(m[3]),
      outputKind: m[4],
      nameLocal: m[5].replace(/''/g, "'"),
      nameEn: m[6].replace(/''/g, "'"),
      creds: m[7]
        .split(",")
        .map((c) => c.trim().replace(/^'|'$/g, ""))
        .filter(Boolean),
      priority: Number(m[8]),
    });
  }

  // A regex that quietly matches three rows because the SQL was reformatted
  // looks exactly like a clean run.
  if (out.length < 10) {
    throw new Error(
      `Parsed only ${out.length} rules from the migration; expected at least 10.\n` +
        `The seed block's shape has changed and this parser needs updating — ` +
        `failing rather than comparing a fraction of the rules.`,
    );
  }
  return out;
}

/** Later migrations that reword a title.
 *
 *  The seed is not the whole truth. 20260908091000 rewrote several labels —
 *  the country was printing twice, and VU1+VU2 was calling itself Väktare —
 *  and a guard that compared the mirror to the SEED alone would report drift
 *  for a mirror that is correctly up to date.
 *
 *  So the effective state is the seed with every subsequent
 *  `UPDATE public.sp_professional_titles SET name_local/name_en` applied in
 *  filename order, which is the order the database applies them in.
 *
 *  Only the two name columns are followed. A migration that changed a
 *  credential requirement, an output kind or a priority by UPDATE would NOT be
 *  picked up here and would fail this guard loudly — which is the right
 *  outcome: those are not rewordings, and they belong in a seed the guard can
 *  read whole. */
function applyLaterRenames(rules: SeedRule[]): SeedRule[] {
  const byCode = new Map(rules.map((r) => [r.code, { ...r }]));

  const later = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && f > "20260907091000")
    .sort();

  const stmt =
    /UPDATE\s+public\.sp_professional_titles\s+SET\s+([\s\S]*?)\s+WHERE\s+code\s*=\s*'([A-Z0-9_]+)'\s*;/g;

  for (const file of later) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const m of sql.matchAll(stmt)) {
      const target = byCode.get(m[2]);
      if (!target) continue;
      const local = /name_local\s*=\s*'((?:[^']|'')*)'/.exec(m[1]);
      const en = /name_en\s*=\s*'((?:[^']|'')*)'/.exec(m[1]);
      if (local) target.nameLocal = local[1].replace(/''/g, "'");
      if (en) target.nameEn = en[1].replace(/''/g, "'");
    }
  }

  return [...byCode.values()];
}

console.log("passport-title-derivation-check\n");
console.log("GROUP 1 -- the mirror matches the migration");

let seed: SeedRule[] = [];
try {
  seed = applyLaterRenames(parseSeed());
  ok(`parsed ${seed.length} rules from the Sweden migration, with later renames applied`);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

if (seed.length > 0) {
  const mirror = new Map<string, TitleRule>(MIRRORED_TITLE_RULES.map((r) => [r.code, r]));
  const seeded = new Map(seed.map((r) => [r.code, r]));

  for (const code of seeded.keys()) {
    if (!mirror.has(code)) {
      fail(
        `Rule ${code} is seeded in the migration but missing from ` +
          `identity/market-rules.ts. The fixtures and the engine tests would ` +
          `not know about it.`,
      );
    }
  }
  for (const code of mirror.keys()) {
    if (!seeded.has(code)) {
      fail(
        `Rule ${code} exists in identity/market-rules.ts but is not seeded by ` +
          `the migration. The tests would pass on a rule production does not have.`,
      );
    }
  }

  for (const [code, s] of seeded) {
    const m = mirror.get(code);
    if (!m) continue;
    const diffs: string[] = [];
    if (m.outputKind !== s.outputKind) diffs.push(`outputKind ${m.outputKind} vs ${s.outputKind}`);
    if (m.nameLocal !== s.nameLocal) diffs.push(`nameLocal "${m.nameLocal}" vs "${s.nameLocal}"`);
    if (m.nameEn !== s.nameEn) diffs.push(`nameEn "${m.nameEn}" vs "${s.nameEn}"`);
    if (m.priority !== s.priority) diffs.push(`priority ${m.priority} vs ${s.priority}`);
    if (m.professionFamilyCode !== s.family)
      diffs.push(`family ${m.professionFamilyCode} vs ${s.family}`);
    if (m.regulatedRoleCode !== s.roleCode)
      diffs.push(`role ${m.regulatedRoleCode} vs ${s.roleCode}`);
    if (m.requiresCredentialCodes.join(",") !== s.creds.join(","))
      diffs.push(`credentials [${m.requiresCredentialCodes}] vs [${s.creds}]`);

    if (diffs.length > 0) {
      fail(
        `Rule ${code} differs between the mirror and the migration:\n      ${diffs.join("\n      ")}`,
      );
    }
  }

  if (failures.length === 0) ok(`all ${seed.length} rules agree field by field`);
}

/* ------------------------------------------------------------------ */
/* 2. No component maps a credential to a title                        */
/* ------------------------------------------------------------------ */

console.log("\nGROUP 2 -- the mapping exists in exactly one place");

// The engine, its mirror, its tests and the migrations are where credential
// codes and titles are ALLOWED to meet.
const ALLOWED = [
  "src/lib/security-passport/identity/",
  "src/lib/security-passport/fixtures/",
  "scripts/",
  "supabase/",
  "e2e/",
];

const CREDENTIAL_CODES = [
  "VU1",
  "VU2",
  "OV_TRAINING",
  "OV_REFRESHER",
  "OV_TRANSPORT",
  "SE_PERSONNEL_APPROVAL",
];

// The Swedish professional titles a component must never derive for itself.
//
// Matched as WHOLE WORDS. "Ordningsvaktsförordnande" is the name of a
// credential, not a professional title, and a fixture carrying it is
// recording what a document is called rather than deciding what a person may
// be called. Substring matching flagged exactly that on the first run — the
// guard would have taught people to work around it instead of using it.
const TITLES = ["Väktare", "Ordningsvakt", "Skyddsvakt"];

function mentionsTitle(code: string): boolean {
  return TITLES.some((t) => new RegExp(`(?<!\\p{L})${t}(?!\\p{L})`, "u").test(code));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const sources = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "e2e"))];
let scanned = 0;
const offenders: string[] = [];

for (const file of sources) {
  const rel = relative(ROOT, file);
  if (ALLOWED.some((a) => rel.startsWith(a))) continue;
  scanned += 1;

  const text = readFileSync(file, "utf8");
  // Strip comments: an explanatory paragraph naming both is documentation,
  // and failing on it would push people to stop explaining themselves.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

  const hasCode = CREDENTIAL_CODES.some((c) => new RegExp(`["'\`]${c}["'\`]`).test(code));
  const hasTitle = mentionsTitle(code);

  if (hasCode && hasTitle) {
    offenders.push(rel);
  }
}

if (offenders.length > 0) {
  fail(
    `A credential code and a professional title appear together outside the ` +
      `derivation engine:\n      ${offenders.join("\n      ")}\n` +
      `      Derive titles through src/lib/security-passport/identity/ instead. ` +
      `A component that maps VU1 to "Väktare" is how a completed course became ` +
      `a claim of legal authority in the first place.`,
  );
} else {
  ok(`${scanned} source files scanned; none maps a credential code to a title`);
}

/* ------------------------------------------------------------------ */

console.log("");
if (failures.length > 0) {
  console.error(`passport-title-derivation-check FAILED (${failures.length}):\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log(`passport-title-derivation-check: ${checks} checks passed.`);
