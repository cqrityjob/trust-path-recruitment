// Väktare self-report response quality guard — the 24 self-report items (PR-V4).
//
// Run via `bun run vaktare-self-report-quality:check`.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
//
// PR-V3's guard proves what the 2026-09-03 content review did to all 50
// items. It cannot say anything about what PR-V4 then did to the 24
// SELF-REPORT items, because it reads only PR-V3's document and, by design,
// asserts PR-V3's scale labels ("Nästan aldrig" ... "Nästan alltid"). Both
// statements are true at once: V3's guard describes the state V3 left, this
// guard describes the state the candidate actually sees.
//
// It composes the FINAL self-report content the way the database does --
// authored baseline (20260830094000), then the V3 review (20261022090000),
// then the V4 self-report review (20261023090000) -- and asserts:
//
//   A  shape: 50 items, 24 self-report, 20 four-point frequency items and 4
//      two-option forced-choice items, the same slug set and option keys as
//      authored;
//   B  the approved four-option scale (Sällan / Ibland / Ofta / Nästan varje
//      gång -- Rarely / Sometimes / Often / Almost every time) on every
//      genuine frequency item, in authored option order, in both languages,
//      and NOWHERE else: c03, c06, c18 and c24 carry none of it;
//   C  forced choice is untouched: c03/c06/c18/c24 are absent from the V4
//      document and their final text is byte-identical to what V3 left;
//   D  scoring and mapping immutability, read from the SQL itself: no UPDATE
//      in the V4 migration assigns a score, key, preference, reverse flag,
//      display order, competency, facet, behaviour, evidence type, format,
//      status or review-gate column, and no INSERT or DELETE touches a
//      governed table;
//   E  c07 and c19 keep their authored technical keying exactly (0/2/3/2 and
//      2/3/1/0), stay self_report, and their openness is documented in the
//      rationale rather than resolved by moving a score;
//   F  the self-report boundary: self_report carries counts_toward_maturity
//      = false and no self-report item is promoted to an observed evidence
//      type;
//   G  statement quality: both languages everywhere, English is not a copy
//      of the Swedish, no absolute (alltid/aldrig, always/never), no
//      quantifier inside a frequency stem (the scale is the quantifier), and
//      no stem is a bare possession claim ("I have a method");
//   H  the experience-bias revisions landed: the stems the review named no
//      longer assume previous guarding employment;
//   I  no hire/reject/rank/pass/fail/suitability/score word anywhere
//      candidate-facing, intro included;
//   J  the review pack is complete and honest: every one of the 24 items has
//      exactly one final class and one cue level, "STEM CHANGED" agrees with
//      the composed text, and the classes agree with the migration.
//
// It reads files. It cannot prove what the database holds -- the migration's
// own proof block does that at apply time, and db-test.sh replays it.

import { readFileSync } from "node:fs";

const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(detail ? `${label} — ${detail}` : label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const BASE = "supabase/migrations/20260830094000_scp_security_officer_recruitment_assessment.sql";
const V3 = "supabase/migrations/20261022090000_scp_vaktare_v1_content_review.sql";
const V4 = "supabase/migrations/20261023090000_scp_vaktare_v1_self_report_quality.sql";
const SELF_REPORT_EVIDENCE = "supabase/migrations/20260830090000_scp_self_reported_evidence.sql";
const PACK = "docs/assessment/governance/vaktare-v1-self-report-review-2026-09-03.json";
const V3_TAG = "$vaktare_content$";
const V4_TAG = "$vaktare_selfreport$";

const FREQ_SV = ["Sällan", "Ibland", "Ofta", "Nästan varje gång"];
const FREQ_EN = ["Rarely", "Sometimes", "Often", "Almost every time"];
const FORCED = ["so-rj-c03", "so-rj-c06", "so-rj-c18", "so-rj-c24"];
const OPEN = ["so-rj-c07", "so-rj-c19"];

// ── The authored baseline: scores, keys and mapping ───────────────────────

type Opt = {
  k: string;
  score: number;
  pref?: boolean;
  rev?: boolean;
  sv: string;
  en: string;
  rat_sv?: string;
};
type Authored = {
  slug: string;
  kind: "scenario" | "selfreport" | "reflection";
  behaviourVar: string;
  competencyVar: string;
  facetVar: string;
  texts: { scenario_sv: string; prompt_sv: string; scenario_en: string; prompt_en: string };
  opts: Opt[];
};

/** Scan a slice of SQL for single-quoted literals, unescaping ''. */
function literals(sql: string): string[] {
  const out: string[] = [];
  let cur: string | null = null;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (cur === null) {
      if (ch === "'") cur = "";
      continue;
    }
    if (ch === "'") {
      if (sql[i + 1] === "'") {
        cur += "'";
        i += 1;
        continue;
      }
      out.push(cur);
      cur = null;
      continue;
    }
    cur += ch;
  }
  return out;
}

function parseAuthored(): Authored[] {
  const src = read(BASE)
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
  return src
    .split(/PERFORM pg_temp\.author_/)
    .slice(1)
    .map((b) => {
      const kind = b.match(/^(scenario|selfreport|reflection)\(/)![1] as Authored["kind"];
      const own = b.slice(0, b.indexOf(");"));
      const slug = own.match(/'(so-rj-[a-e]\d\d)'/)![1];
      const vars = own.match(/'so-rj-[a-e]\d\d',\s*(b_\w+),\s*(c_\w+),\s*(f_\w+)/);
      if (!vars) throw new Error(`no behaviour/competency/facet resolution for ${slug}`);
      const strs = literals(own);
      const jsonIdx = strs.findIndex((s) => s.trim().startsWith("[{"));
      const opts: Opt[] = jsonIdx >= 0 ? JSON.parse(strs[jsonIdx]) : [];
      const t = strs.slice(0, jsonIdx >= 0 ? jsonIdx : strs.length).slice(-4);
      return {
        slug,
        kind,
        behaviourVar: vars[1],
        competencyVar: vars[2],
        facetVar: vars[3],
        texts: { scenario_sv: t[0], prompt_sv: t[1], scenario_en: t[2], prompt_en: t[3] },
        opts,
      };
    });
}

// ── The two review documents ──────────────────────────────────────────────

type DocItem = {
  slug: string;
  kind: string;
  sv: { scenario: string; prompt: string };
  en: { scenario: string; prompt: string };
  options: { k: string; sv: string; en: string; rat_sv: string }[];
  class?: string;
  cue?: string;
};
type Block = { key: string; intro_sv: string; intro_en: string };
type V3Doc = { review: string; items: DocItem[]; blocks: Block[] };
type V4Doc = V3Doc & {
  scale: { sv: string[]; en: string[] };
  forced_choice_untouched: string[];
  methodologically_open: string[];
};

function carve<T>(path: string, tag: string): { doc: T; sqlOutside: string } {
  const sql = read(path);
  const a = sql.indexOf(tag);
  const b = sql.indexOf(tag, a + tag.length);
  if (a < 0 || b < 0) {
    console.error(`FAIL: ${path} does not carry a ${tag} document.`);
    process.exit(1);
  }
  return {
    doc: JSON.parse(sql.slice(a + tag.length, b)),
    sqlOutside: (sql.slice(0, a) + sql.slice(b + tag.length))
      .split("\n")
      .filter((l) => !/^\s*--/.test(l))
      .join("\n"),
  };
}

const authored = parseAuthored();
const authoredBySlug = new Map(authored.map((a) => [a.slug, a]));
const { doc: v3 } = carve<V3Doc>(V3, V3_TAG);
const { doc: v4, sqlOutside: v4Sql } = carve<V4Doc>(V4, V4_TAG);

const v3BySlug = new Map<string, DocItem>(v3.items.map((i) => [i.slug, i]));
const v4BySlug = new Map<string, DocItem>(v4.items.map((i) => [i.slug, i]));

/** The content a candidate finally sees: authored, then V3, then V4. */
function composed(slug: string): DocItem {
  const a = authoredBySlug.get(slug)!;
  const base: DocItem = {
    slug,
    kind: a.kind,
    sv: { scenario: a.texts.scenario_sv, prompt: a.texts.prompt_sv },
    en: { scenario: a.texts.scenario_en, prompt: a.texts.prompt_en },
    options: a.opts.map((o) => ({ k: o.k, sv: o.sv, en: o.en, rat_sv: o.rat_sv ?? "" })),
  };
  return v4BySlug.get(slug) ?? v3BySlug.get(slug) ?? base;
}

const selfSlugs = authored.filter((a) => a.kind === "selfreport").map((a) => a.slug);
const finals = selfSlugs.map(composed);
const finalBySlug = new Map(finals.map((f) => [f.slug, f]));
const freqSlugs = selfSlugs.filter((s) => authoredBySlug.get(s)!.opts.length === 4);
const forcedSlugs = selfSlugs.filter((s) => authoredBySlug.get(s)!.opts.length === 2);

const pack = JSON.parse(read(PACK)) as {
  review: string;
  scale: { sv: string[]; en: string[] };
  items: {
    slug: string;
    final_class: string;
    stem_changed: boolean;
    label_changed: boolean;
    cue: string;
    note: string;
  }[];
  pilot_watch: string[];
};
const packBySlug = new Map(pack.items.map((i) => [i.slug, i]));

// ── A. Shape ──────────────────────────────────────────────────────────────
console.log("\nA. Form shape");
check("A1 the authored form is 50 items", authored.length === 50, `${authored.length}`);
check(
  "A2 22 scenario + 24 self-report + 4 free text",
  authored.filter((a) => a.kind === "scenario").length === 22 &&
    selfSlugs.length === 24 &&
    authored.filter((a) => a.kind === "reflection").length === 4,
);
check(
  "A3 24 self-report = 20 four-point frequency items + 4 two-option forced choice",
  freqSlugs.length === 20 && forcedSlugs.length === 4,
  `${freqSlugs.length}/${forcedSlugs.length}`,
);
check(
  "A4 the four forced-choice items are exactly c03, c06, c18, c24",
  forcedSlugs.slice().sort().join(",") === FORCED.slice().sort().join(","),
  forcedSlugs.join(","),
);
check(
  "A5 the V4 document carries the 20 frequency items and no other item",
  v4.items.length === 20 &&
    v4.items.every((i) => freqSlugs.includes(i.slug)) &&
    new Set(v4.items.map((i) => i.slug)).size === 20,
  `${v4.items.length}`,
);
check(
  "A6 every composed self-report item keeps its authored option keys, in order",
  finals.every(
    (f) =>
      f.options.map((o) => o.k).join("") ===
      authoredBySlug
        .get(f.slug)!
        .opts.map((o) => o.k)
        .join(""),
  ),
);

// ── B. The approved scale ─────────────────────────────────────────────────
console.log("\nB. The approved four-option scale");
check(
  "B1 the V4 document declares exactly the approved scale",
  v4.scale.sv.join("|") === FREQ_SV.join("|") && v4.scale.en.join("|") === FREQ_EN.join("|"),
  JSON.stringify(v4.scale),
);
const offScale = freqSlugs.filter((s) => {
  const f = finalBySlug.get(s)!;
  return (
    f.options.map((o) => o.sv).join("|") !== FREQ_SV.join("|") ||
    f.options.map((o) => o.en).join("|") !== FREQ_EN.join("|")
  );
});
check(
  "B2 all 20 genuine frequency items carry the approved labels, in authored order, in both languages",
  offScale.length === 0,
  offScale.join(", "),
);
const oldScale = freqSlugs.filter((s) =>
  finalBySlug
    .get(s)!
    .options.some((o) =>
      /Nästan alltid|Nästan aldrig|Almost always|Almost never/.test(o.sv + o.en),
    ),
);
check(
  "B3 no frequency item still carries an absolute end point (Nästan alltid / Nästan aldrig)",
  oldScale.length === 0,
  oldScale.join(", "),
);
const labelledForced = forcedSlugs.filter((s) =>
  finalBySlug.get(s)!.options.some((o) => FREQ_SV.includes(o.sv) || FREQ_EN.includes(o.en)),
);
check(
  "B4 no forced-choice option carries a frequency label",
  labelledForced.length === 0,
  labelledForced.join(", "),
);
check(
  "B5 the frequency prompt is the frequency prompt on all 20, and the pair prompt on all 4",
  freqSlugs.every(
    (s) =>
      finalBySlug.get(s)!.sv.prompt === "Hur ofta stämmer det?" &&
      finalBySlug.get(s)!.en.prompt === "How often is that true?",
  ) &&
    forcedSlugs.every(
      (s) =>
        finalBySlug.get(s)!.sv.prompt === "Vilket liknar dig mest?" &&
        finalBySlug.get(s)!.en.prompt === "Which is more like you?",
    ),
);

// ── C. Forced choice is untouched ─────────────────────────────────────────
console.log("\nC. Forced choice is structurally unchanged");
check(
  "C1 no forced-choice item appears in the V4 document",
  FORCED.every((s) => !v4BySlug.has(s)),
);
const forcedMoved = FORCED.filter((s) => {
  const v3i = v3BySlug.get(s)!;
  const f = finalBySlug.get(s)!;
  return JSON.stringify([v3i.sv, v3i.en, v3i.options]) !== JSON.stringify([f.sv, f.en, f.options]);
});
check(
  "C2 the composed forced-choice content is exactly what the V3 review left",
  forcedMoved.length === 0,
  forcedMoved.join(", "),
);
check(
  "C3 every forced-choice item still offers exactly two options",
  FORCED.every((s) => finalBySlug.get(s)!.options.length === 2),
);
check(
  "C4 the V4 migration names the four forced-choice items as untouched",
  JSON.stringify(v4.forced_choice_untouched.slice().sort()) ===
    JSON.stringify(FORCED.slice().sort()),
);

// ── D. Scoring and mapping immutability, from the SQL ─────────────────────
console.log("\nD. The migration cannot move a score or a mapping");
const FORBIDDEN_SET = [
  "score_value",
  "is_preferred",
  "reverse_scored",
  "option_key",
  "display_order",
  "competency_id",
  "facet_id",
  "primary_behaviour_id",
  "evidence_source_type",
  "item_format",
  "content_status",
  "validation_status",
  "randomise_options",
  "counts_toward_maturity",
  "sme_review_status",
  "language_review_status",
  "cognitive_review_status",
  "accessibility_review_status",
  "bias_review_status",
  "authored_by_ai",
  "distractor_error_type",
];
/** Every `SET ...` clause of every UPDATE, up to the statement's WHERE. */
const setClauses = [
  ...v4Sql.matchAll(/\bUPDATE\s+[\s\S]*?\bSET\b([\s\S]*?)(?=\bWHERE\b|\bFROM\b)/gi),
].map((m) => m[1]);
const illegalSets = FORBIDDEN_SET.filter((c) =>
  setClauses.some((s) => new RegExp(`\\b${c}\\s*=`, "i").test(s)),
);
check(
  "D1 no UPDATE in the migration assigns a score, key, order, mapping, format, evidence type, status or gate column",
  illegalSets.length === 0,
  illegalSets.join(", "),
);
const GOVERNED = [
  "scp_item_options",
  "scp_item_versions",
  "scp_items",
  "scp_form_items",
  "scp_forms",
  "scp_competencies",
  "scp_competency_evidence",
  "scp_review_requirements",
  "scp_evidence_source_types",
  "scp_maturity_thresholds",
  "scp_reports",
  "scp_attempts",
  "scp_responses",
];
const illegalWrites = GOVERNED.filter((t) =>
  new RegExp(`\\b(INSERT\\s+INTO|DELETE\\s+FROM|TRUNCATE)\\s+(public\\.)?${t}\\b`, "i").test(v4Sql),
);
check(
  "D2 the migration performs no INSERT, DELETE or TRUNCATE on a governed table",
  illegalWrites.length === 0,
  illegalWrites.join(", "),
);
check(
  "D3 the only tables the migration UPDATEs are text, label, rationale and block-intro tables",
  [...v4Sql.matchAll(/\bUPDATE\s+(?:public\.)?(\w+)/gi)]
    .map((m) => m[1])
    .every((t) =>
      ["scp_item_texts", "scp_item_option_texts", "scp_item_options", "scp_form_blocks"].includes(
        t,
      ),
    ),
  [...new Set([...v4Sql.matchAll(/\bUPDATE\s+(?:public\.)?(\w+)/gi)].map((m) => m[1]))].join(", "),
);
check(
  "D4 the one UPDATE on scp_item_options sets scoring_rationale_sv and nothing else",
  setClauses
    .filter((s) => /scoring_rationale_sv\s*=/.test(s))
    .every((s) => /^\s*scoring_rationale_sv\s*=\s*_o->>'rat_sv'\s*$/.test(s)),
);
check(
  "D5 the migration proves the identity snapshot itself (before/after EXCEPT on every immutable column)",
  /_v4_before/.test(v4Sql) && /SCP_V4_IDENTITY_MOVED/.test(v4Sql),
);
check(
  "D6 the migration refuses to apply while an attempt is in flight",
  /SCP_V4_ATTEMPTS_IN_FLIGHT/.test(v4Sql),
);

// ── E. c07 and c19 ────────────────────────────────────────────────────────
console.log("\nE. c07 and c19 stay methodologically open");
const KEYS: Record<string, { scores: number[]; rev: boolean }> = {
  "so-rj-c07": { scores: [0, 2, 3, 2], rev: false },
  "so-rj-c19": { scores: [2, 3, 1, 0], rev: true },
};
check(
  "E1 the authored keying of c07 (0/2/3/2) and c19 (2/3/1/0) is what the baseline still holds",
  OPEN.every((s) => {
    const a = authoredBySlug.get(s)!;
    return (
      JSON.stringify(a.opts.map((o) => o.score)) === JSON.stringify(KEYS[s].scores) &&
      a.opts.every((o) => Boolean(o.rev) === KEYS[s].rev) &&
      a.opts.every((o) => !o.pref)
    );
  }),
);
check(
  "E2 neither key is monotonic — that is exactly why they are held open, not why they are fixed",
  OPEN.every((s) => {
    const v = KEYS[s].scores;
    const up = v.every((x, i) => i === 0 || x >= v[i - 1]);
    const down = v.every((x, i) => i === 0 || x <= v[i - 1]);
    return !up && !down;
  }),
);
check(
  "E3 c07 and c19 are named as methodologically open in the migration document",
  JSON.stringify(v4.methodologically_open.slice().sort()) === JSON.stringify(OPEN.slice().sort()),
);
check(
  "E4 c19's stem is not touched by V4 — a wording change there would move score semantics",
  finalBySlug.get("so-rj-c19")!.sv.scenario === v3BySlug.get("so-rj-c19")!.sv.scenario &&
    finalBySlug.get("so-rj-c19")!.en.scenario === v3BySlug.get("so-rj-c19")!.en.scenario,
);
check(
  "E5 c07's stem is revised, is more neutral, and carries no redundant frequency word",
  finalBySlug.get("so-rj-c07")!.sv.scenario !== v3BySlug.get("so-rj-c07")!.sv.scenario &&
    /rikta tillbaka uppmärksamheten/.test(finalBySlug.get("so-rj-c07")!.sv.scenario) &&
    /deliberately refocus my attention/.test(finalBySlug.get("so-rj-c07")!.en.scenario) &&
    !/\b(ibland|sometimes)\b/i.test(
      finalBySlug.get("so-rj-c07")!.sv.scenario + finalBySlug.get("so-rj-c07")!.en.scenario,
    ),
);
check(
  "E6 the open keying is documented in the rationale on both items, not resolved by moving a score",
  OPEN.every((s) =>
    finalBySlug
      .get(s)!
      .options.some((o) => /metodologiskt öppen/.test(o.rat_sv) && /pilotdata/.test(o.rat_sv)),
  ),
);
check(
  "E7 the migration asserts both keys at apply time",
  /SCP_V4_C07_C19_KEYING/.test(v4Sql) &&
    /ARRAY\[0, 2, 3, 2\]/.test(v4Sql) &&
    /ARRAY\[2, 3, 1, 0\]/.test(v4Sql),
);

// ── F. The self-report boundary ───────────────────────────────────────────
console.log("\nF. Self-report is not observed evidence");
const evidenceSql = read(SELF_REPORT_EVIDENCE);
check(
  "F1 self_report is installed with counts_toward_maturity = false",
  /'self_report'[\s\S]{0,400}?counts_toward_maturity/.test(evidenceSql) ||
    /counts_toward_maturity[\s\S]{0,400}?'self_report'/.test(evidenceSql),
);
const laterFlip = [
  ...read(V4).matchAll(/counts_toward_maturity\s*=\s*true/gi),
  ...read(V3).matchAll(/counts_toward_maturity\s*=\s*true/gi),
];
check(
  "F2 neither review migration sets counts_toward_maturity = true",
  laterFlip.length === 0,
  `${laterFlip.length} occurrence(s)`,
);
check(
  "F3 the migration proves all 24 are self_report and that self_report is out of maturity",
  /SCP_V4_SELF_REPORT/.test(v4Sql) && /SCP_V4_MATURITY/.test(v4Sql),
);
check(
  "F4 the migration refuses to write to any item that is not self_report",
  /SCP_V4_NOT_SELF_REPORT/.test(v4Sql),
);
check(
  "F5 no self-report item is promoted to an observed evidence type anywhere in the migration",
  !/evidence_source_type\s*=\s*'(assessment_response|observed[a-z_]*)'/i.test(v4Sql),
);
check(
  "F6 the section intro tells the candidate the answers are never reported as observed",
  v4.blocks.some(
    (b) =>
      b.key === "c_behaviour" &&
      /aldrig som något vi har observerat/.test(b.intro_sv) &&
      /never as something we observed/.test(b.intro_en),
  ),
);
check(
  "F7 the intro no longer claims there is no answer key while the scores differ",
  v4.blocks.every((b) => !/facit/.test(b.intro_sv) && !/answer key/.test(b.intro_en)),
);
check(
  "F8 the intro tells the candidate to answer from occasions that actually arose",
  v4.blocks.some(
    (b) => /faktiskt har uppstått/.test(b.intro_sv) && /actually come up/.test(b.intro_en),
  ),
);

// ── G. Statement quality ──────────────────────────────────────────────────
console.log("\nG. Statement quality, both languages");
const emptyText = finals.filter(
  (f) =>
    !f.sv.scenario.trim() ||
    !f.sv.prompt.trim() ||
    !f.en.scenario.trim() ||
    !f.en.prompt.trim() ||
    f.options.some((o) => !o.sv.trim() || !o.en.trim()),
);
check(
  "G1 no empty text or label on any of the 24, either language",
  emptyText.length === 0,
  emptyText.map((f) => f.slug).join(", "),
);
const copied = finals.filter((f) => f.sv.scenario === f.en.scenario);
check(
  "G2 no English stem is a copy of the Swedish",
  copied.length === 0,
  copied.map((f) => f.slug).join(", "),
);
const absolutes = finals.filter(
  (f) => /\b(alltid|aldrig)\b/i.test(f.sv.scenario) || /\b(always|never)\b/i.test(f.en.scenario),
);
check(
  "G3 no self-report statement uses an absolute (alltid/aldrig, always/never)",
  absolutes.length === 0,
  absolutes.map((f) => f.slug).join(", "),
);
const doubleQuant = freqSlugs.filter((s) => {
  const f = finalBySlug.get(s)!;
  return (
    /\b(ibland|oftast|ofta|sällan|alltid|aldrig)\b/i.test(f.sv.scenario) ||
    /\b(sometimes|usually|often|rarely|always|never)\b/i.test(f.en.scenario)
  );
});
check(
  "G4 no frequency statement carries its own quantifier — the scale is the quantifier",
  doubleQuant.length === 0,
  doubleQuant.join(", "),
);
// c08 and c23 described HAVING a method. A frequency scale does not fit a
// possession claim: the stem must name a behaviour that recurs.
const possession = freqSlugs.filter((s) => {
  const f = finalBySlug.get(s)!;
  return (
    /^Jag har (ett|något|en)\b/i.test(f.sv.scenario) ||
    /^I have (a|an|something)\b/i.test(f.en.scenario)
  );
});
check(
  "G5 no frequency stem is a bare possession claim ('Jag har ett sätt…' / 'I have a way…')",
  possession.length === 0,
  possession.join(", "),
);
for (const s of ["so-rj-c08", "so-rj-c23"]) {
  const f = finalBySlug.get(s)!;
  check(
    `G6 ${s.slice(-3)} describes a recurring behaviour, not the possession of a method`,
    /^(När|Efter)\b/.test(f.sv.scenario) &&
      /^(When|After)\b/.test(f.en.scenario) &&
      f.sv.scenario !== v3BySlug.get(s)!.sv.scenario,
  );
}

// ── H. Experience bias ────────────────────────────────────────────────────
console.log("\nH. Experience-bias revisions");
const GUARD_ONLY_SV =
  /\b(pass|arbetspass|nattpass|rond|larmet|larmcentralen|väktare|bevakningsuppdrag)\b/i;
const GUARD_ONLY_EN = /\b(shift|night shift|patrol|the alarm|alarm centre|security officer)\b/i;
for (const s of ["so-rj-c09", "so-rj-c12", "so-rj-c20", "so-rj-c21"]) {
  const f = finalBySlug.get(s)!;
  check(
    `H1 ${s.slice(-3)} no longer assumes previous guarding employment`,
    !GUARD_ONLY_SV.test(f.sv.scenario) && !GUARD_ONLY_EN.test(f.en.scenario),
    `${f.sv.scenario} / ${f.en.scenario}`,
  );
  check(
    `H2 ${s.slice(-3)}'s stem was actually revised`,
    f.sv.scenario !== v3BySlug.get(s)!.sv.scenario,
  );
}
const biasedAnywhere = freqSlugs.filter((s) => {
  const f = finalBySlug.get(s)!;
  return GUARD_ONLY_SV.test(f.sv.scenario) || GUARD_ONLY_EN.test(f.en.scenario);
});
check(
  "H3 no frequency stem anywhere assumes a guarding shift, patrol or alarm",
  biasedAnywhere.length === 0,
  biasedAnywhere.join(", "),
);
check(
  "H4 the section intro still tells a candidate without guarding experience where to answer from",
  v4.blocks.some(
    (b) =>
      /Har du inte arbetat inom bevakning/.test(b.intro_sv) &&
      /If you have not worked in security/.test(b.intro_en),
  ),
);

// ── I. Vocabulary ─────────────────────────────────────────────────────────
console.log("\nI. No hiring vocabulary in any candidate-facing sentence");
const BANNED_SV =
  /\b(lämplig(het)?|olämplig|godkän[dt]|underkän[dt]|rangordn\w*|anställningsbeslut|poäng|betyg)\b/i;
const BANNED_EN =
  /\b(suitab\w*|unsuitab\w*|pass(ed|es)?|fail(ed|s)?|rank(ing|ed|s)?|hir(e|ed|ing)|reject\w*|score[sd]?|grade[sd]?)\b/i;
const bannedHits = [
  ...finals.flatMap((f) => [
    ...[f.sv.scenario, f.sv.prompt, ...f.options.map((o) => o.sv)]
      .filter((t) => BANNED_SV.test(t))
      .map((t) => `${f.slug} sv: ${t.slice(0, 60)}`),
    ...[f.en.scenario, f.en.prompt, ...f.options.map((o) => o.en)]
      .filter((t) => BANNED_EN.test(t))
      .map((t) => `${f.slug} en: ${t.slice(0, 60)}`),
  ]),
  ...v4.blocks.flatMap((b) =>
    [b.intro_sv]
      .filter((t) => BANNED_SV.test(t))
      .concat([b.intro_en].filter((t) => BANNED_EN.test(t)))
      .map((t) => `${b.key}: ${t.slice(0, 60)}`),
  ),
];
check(
  "I1 no self-report stem, label or section intro contains a hire/reject/rank/pass/fail/suitability/score word",
  bannedHits.length === 0,
  bannedHits.join(" | "),
);

// ── J. The review pack is complete and honest ─────────────────────────────
console.log("\nJ. The review pack");
const CLASSES = new Set([
  "FREQUENCY — REVISED",
  "FREQUENCY — UNCHANGED",
  "FORCED CHOICE — UNCHANGED",
  "DESCRIPTIVE / METHODOLOGICALLY OPEN",
]);
const CUES = new Set(["LOW CUE", "MODERATE CUE", "HIGH CUE"]);
check(
  "J1 the pack covers all 24 self-report items exactly once",
  pack.items.length === 24 &&
    new Set(pack.items.map((i) => i.slug)).size === 24 &&
    selfSlugs.every((s) => packBySlug.has(s)),
);
check(
  "J2 every item carries exactly one of the four final classes — no ambiguous implementation state",
  pack.items.every((i) => CLASSES.has(i.final_class)),
  pack.items
    .filter((i) => !CLASSES.has(i.final_class))
    .map((i) => i.slug)
    .join(", "),
);
check(
  "J3 every item carries a cue level after revision",
  pack.items.every((i) => CUES.has(i.cue)),
  pack.items
    .filter((i) => !CUES.has(i.cue))
    .map((i) => i.slug)
    .join(", "),
);
const classMismatch = pack.items.filter((i) => {
  if (FORCED.includes(i.slug)) return i.final_class !== "FORCED CHOICE — UNCHANGED";
  if (OPEN.includes(i.slug)) return i.final_class !== "DESCRIPTIVE / METHODOLOGICALLY OPEN";
  const changed = finalBySlug.get(i.slug)!.sv.scenario !== v3BySlug.get(i.slug)!.sv.scenario;
  return i.final_class !== (changed ? "FREQUENCY — REVISED" : "FREQUENCY — UNCHANGED");
});
check(
  "J4 the class matches the composed content: revised means the stem moved, unchanged means it did not",
  classMismatch.length === 0,
  classMismatch.map((i) => `${i.slug}=${i.final_class}`).join(", "),
);
const stemMismatch = pack.items.filter(
  (i) =>
    i.stem_changed !== (finalBySlug.get(i.slug)!.sv.scenario !== v3BySlug.get(i.slug)!.sv.scenario),
);
check(
  "J5 'stem changed' is true exactly where the stem changed",
  stemMismatch.length === 0,
  stemMismatch.map((i) => i.slug).join(", "),
);
const labelMismatch = pack.items.filter(
  (i) =>
    i.label_changed !==
    (JSON.stringify(finalBySlug.get(i.slug)!.options.map((o) => [o.sv, o.en])) !==
      JSON.stringify(v3BySlug.get(i.slug)!.options.map((o) => [o.sv, o.en]))),
);
check(
  "J6 'label changed' is true exactly where a label changed — all 20 frequency items, none of the 4 pairs",
  labelMismatch.length === 0,
  labelMismatch.map((i) => i.slug).join(", "),
);
check(
  "J7 the V4 document's own class agrees with the pack on all 20 items it carries",
  v4.items.every((i) => i.class === packBySlug.get(i.slug)!.final_class),
);
check(
  "J8 the V4 document's own cue level agrees with the pack",
  v4.items.every((i) => `${i.cue} CUE` === packBySlug.get(i.slug)!.cue),
);
check(
  "J9 the pack declares the same approved scale as the migration",
  pack.scale.sv.join("|") === FREQ_SV.join("|") && pack.scale.en.join("|") === FREQ_EN.join("|"),
);
check(
  "J10 the pack carries a pilot watch list and claims no psychometric threshold",
  pack.pilot_watch.length >= 5 &&
    !pack.pilot_watch.some((w) => /\b\d+(\.\d+)?\s*(%|alpha|cronbach|cut-?off|threshold)/i.test(w)),
);
check("J11 the pack and the migration name the same review", pack.review === v4.review);

// ── Result ────────────────────────────────────────────────────────────────
console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("Väktare self-report response quality: PASS");
