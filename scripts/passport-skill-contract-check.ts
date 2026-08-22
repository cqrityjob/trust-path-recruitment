// Security Passport — guard: a PostgREST select must fetch every column its
// mapper reads.
//
// ── THE BUG THIS PREVENTS ──────────────────────────────────────────────
//
// `listSkillTypes` asked for every column of `sp_skill_types` except
// `allowed_levels`, and then mapped `allowed_levels: r.allowed_levels ?? []`.
// PostgREST returns only what is requested, so the field was always
// `undefined`, every skill type arrived with an empty scale, the level field
// never rendered, and the browser sent `skill_level: null` for everything.
// `sp_claims_skill_rules` then refused every type that HAS a scale — all 19
// languages, Körkort, Truckkort, Liftkort and ADR — leaving HLR, whose scale
// is legitimately empty, as the only saveable entry.
//
// ── WHY THE COMPILER DID NOT CATCH IT ──────────────────────────────────
//
// The result was cast with `as Array<{ ...; allowed_levels: string[] | null }>`,
// which ASSERTS a field the query never asked for. A hand-written cast on a
// PostgREST result is a promise the database was never told to keep, so this
// check bans it on these readers and requires the row type be derived from
// the generated `Tables<>` types instead.
//
// ── WHY IT IS NOT A DATABASE TEST ──────────────────────────────────────
//
// supabase/tests/security_passport_phase11_test.sql already proved the
// database refuses a language without a level, and it passed throughout the
// outage. The database was never wrong. The contract between the select
// string and the mapper is application-layer, and this is where it is held.
//
// Plain TS run with Bun, matching this repository's scripts/*-check.ts
// convention.

import { readFileSync } from "node:fs";
import path from "node:path";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const root = path.resolve(import.meta.dir, "..");

/** Comments explain the defect and therefore quote it. Stripping them keeps
 *  the guard reading code, not prose about code — the first version of this
 *  check failed on its own explanatory comment. Offsets are preserved by
 *  replacing each comment with spaces, so index arithmetic below still lines
 *  up with the original file. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

const rel = "src/lib/security-passport/entries.functions.ts";
const code = withoutComments(readFileSync(path.join(root, rel), "utf8"));

/**
 * Every `.select("a, b, c")` in the file, with the offset it starts at, so a
 * mapper can be matched to the select that feeds it.
 */
function selectsWithOffsets(source: string): { columns: string[]; at: number }[] {
  const out: { columns: string[]; at: number }[] = [];
  const re = /\.select\(\s*(?:"([^"]*)"|`([^`]*)`)\s*[,)]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const raw = (m[1] ?? m[2] ?? "").trim();
    if (raw === "" || raw.includes("*")) continue;
    // Ignore PostgREST embedded resources and modifiers; plain columns only.
    const columns = raw
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c !== "" && !c.includes("(") && !c.includes(":"));
    out.push({ columns, at: m.index });
  }
  return out;
}

const selects = selectsWithOffsets(code);
expect(selects.length > 0, `${rel}: no column-scoped .select() found — has the reader moved?`);

/**
 * The readers this guard covers, each named by the function that owns it and
 * the fields its mapper is known to read. Listing them explicitly (rather than
 * inferring every `r.x` in the file) keeps the check precise and its failure
 * message actionable.
 */
const READERS: readonly { fn: string; table: string; required: readonly string[] }[] = [
  {
    fn: "listSkillTypes",
    table: "sp_skill_types",
    required: [
      "code",
      "claim_type",
      "name_sv",
      "name_en",
      "level_scale",
      // The one that was missing. Without it every scale is empty and every
      // scaled type becomes unsaveable.
      "allowed_levels",
      "requires_jurisdiction",
      "requires_valid_until",
    ],
  },
  {
    fn: "listJurisdictions",
    table: "sp_jurisdictions",
    required: ["code", "name_sv", "name_en"],
  },
];

for (const reader of READERS) {
  const fnAt = code.indexOf(`export const ${reader.fn} =`);
  expect(fnAt !== -1, `${rel}: ${reader.fn} not found.`);
  if (fnAt === -1) continue;

  // The select belonging to this function is the first one after its
  // declaration and before the next top-level export.
  const nextExport = code.indexOf("\nexport ", fnAt + 1);
  const end = nextExport === -1 ? code.length : nextExport;
  const own = selects.find((s) => s.at > fnAt && s.at < end);
  expect(own !== undefined, `${rel}: ${reader.fn} has no column-scoped .select().`);
  if (!own) continue;

  for (const column of reader.required) {
    expect(
      own.columns.includes(column),
      `${rel}: ${reader.fn} maps "${column}" from ${reader.table} but does not SELECT it. ` +
        `PostgREST returns only requested columns, so the mapped value would be undefined ` +
        `for every row. Add "${column}" to the select list.`,
    );
  }

  // A hand-written row cast can re-assert a column the query never requested,
  // which is exactly how the original defect passed typecheck.
  const body = code.slice(fnAt, end);
  expect(
    !/as\s+Array<\s*\{/.test(body),
    `${rel}: ${reader.fn} casts its PostgREST result with \`as Array<{...}>\`. That asserts ` +
      `columns the query may never have requested — derive the row type from ` +
      `Tables<"${reader.table}"> instead, so a missing column fails to compile.`,
  );
}

// ---------------------------------------------------------------------------
// The level scale must survive the whole way to the form.
// ---------------------------------------------------------------------------
// The section renders the level field only when `allowedLevels` is non-empty,
// and validates against it. If either stops reading the scale, the field
// silently disappears again and the failure looks like a database error.
const sectionRel = "src/components/security-passport/SkillSection.tsx";
const section = withoutComments(readFileSync(path.join(root, sectionRel), "utf8"));
expect(
  /allowedLevels\.length\s*>\s*0/.test(section),
  `${sectionRel}: the level field must render from allowedLevels.`,
);
expect(
  /jurisdictions\.map\(/.test(section),
  `${sectionRel}: jurisdiction must be chosen from the vocabulary, not typed — ` +
    `jurisdiction_code is FK-constrained and a typed "SV" is a foreign-key violation.`,
);

// ---------------------------------------------------------------------------
// One operation, one outcome.
// ---------------------------------------------------------------------------
// The page showed "Sparat." and "Något gick fel. Försök igen." together
// because success was recorded before the read-back and the two messages lived
// in independent state.
const routeRel = "src/routes/_authenticated.passport.information.tsx";
const route = withoutComments(readFileSync(path.join(root, routeRel), "utf8"));
expect(
  !/const \[notice, setNotice\]/.test(route) && !/const \[error, setError\]/.test(route),
  `${routeRel}: success and failure must not be independent state — the page could ` +
    `render both at once. Use the single "outcome" value.`,
);
expect(
  /if \(await refresh\(\)\) succeeded\(/.test(route),
  `${routeRel}: success must be reported only after the read-back returns. ` +
    `"Sparat." is a claim about persistence.`,
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`passport-skill-contract:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  "passport-skill-contract:check OK " +
    "(every mapped column is selected; no hand-written row casts on these readers; " +
    "the level scale reaches the form; jurisdiction comes from the vocabulary; " +
    "one operation carries one outcome, reported only after read-back)",
);
