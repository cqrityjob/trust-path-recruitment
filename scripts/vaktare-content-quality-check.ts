// Väktare content quality guard — the 50 items themselves (PR-V3).
//
// Run via `bun run vaktare-content-quality:check`.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
//
// The Väktare Recruitment Assessment is fifty authored items. PR-V1 proved
// the DELIVERY order of options no longer reveals the key, and PR-V2 proved
// the candidate is told the truth about the product. Neither could say
// anything about the words: the 2026-09-02 baseline audit found the
// preferred option was the LONGEST option on all 22 scenario items in both
// languages, one item announced four options and offered three, three
// distractors carried an error-pattern label that did not describe them, and
// every English text was an unreviewed translation.
//
// 20261022090000 is the content review. It carries the reviewed content as
// ONE JSON document, dollar-quoted, and applies it to the draft version-1
// rows. This guard reads that same document, the authored baseline it edits
// (20260830094000) and the item audit that justifies each decision, and
// asserts what a content edit can silently break:
//
//   A  shape: 50 items, 22 scenario + 24 self-report + 4 free text, unique
//      identities, the same slug set and the same option keys as authored;
//   B  scoring and mapping immutability, read from the SQL itself: no UPDATE
//      in the migration assigns a score, key, order, competency, facet,
//      behaviour, evidence type, status or review-gate column, no INSERT or
//      DELETE touches a governed table, and no adaptation status is raised
//      to approved/source;
//   C  competency coverage is stable: the authored behaviour/facet
//      resolution per slug matches the audit's expected competency, and the
//      eight competencies are exactly the eight;
//   D  both languages on every text and every label, and English is not a
//      copy of the Swedish;
//   E  option-length balance on the 22 scenario items, per language: the
//      preferred option is neither the longest nor the shortest on a
//      majority, every length rank is represented, and no single item is
//      extreme;
//   F  every distractor carries a valid error pattern and a rationale; the
//      preferred option carries a rationale and no error pattern; every
//      rationale the author wrote is still there;
//   G  self-report statements: no absolutes, no quantifier inside a
//      frequency-scale statement, scales and pairs keep their authored shape;
//   H  free text asks for the account shape (what happened, own role, what
//      you did, how it ended, what you took from it) in both languages and
//      names no method;
//   I  no hiring vocabulary in any candidate-facing sentence;
//   J  the audit is honest: every item has a decision, KEEP means the text
//      is unchanged, EDIT means it is not, and nothing is REPLACE or RETIRE
//      while the form still has 50 items.
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
const REVIEW = "supabase/migrations/20261022090000_scp_vaktare_v1_content_review.sql";
const AUDIT = "docs/assessment/governance/vaktare-v1-item-audit-2026-09-03.json";
const TAG = "$vaktare_content$";

// ── The authored baseline ─────────────────────────────────────────────────

type AuthoredOption = {
  k: string;
  score: number;
  pref?: boolean;
  err?: string;
  rev?: boolean;
  rat_sv?: string;
  sv: string;
  en: string;
};
type Authored = {
  slug: string;
  kind: "scenario" | "selfreport" | "reflection";
  behaviourVar: string;
  facetVar: string;
  texts: { scenario_sv: string; prompt_sv: string; scenario_en: string; prompt_en: string };
  opts: AuthoredOption[];
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
  const blocks = src.split(/PERFORM pg_temp\.author_/).slice(1);
  return blocks.map((b) => {
    const kind = b.match(/^(scenario|selfreport|reflection)\(/)![1] as Authored["kind"];
    const own = b.slice(0, b.indexOf(");"));
    const slug = own.match(/'(so-rj-[a-e]\d\d)'/)![1];
    const vars = own.match(/'so-rj-[a-e]\d\d',\s*(b_\w+),\s*(c_\w+),\s*(f_\w+)/);
    if (!vars) throw new Error(`no behaviour/facet resolution for ${slug}`);
    const strs = literals(own);
    const jsonIdx = strs.findIndex((s) => s.trim().startsWith("[{"));
    const opts: AuthoredOption[] = jsonIdx >= 0 ? JSON.parse(strs[jsonIdx]) : [];
    const t = strs.slice(0, jsonIdx >= 0 ? jsonIdx : strs.length).slice(-4);
    return {
      slug,
      kind,
      behaviourVar: vars[1],
      facetVar: vars[3],
      texts: { scenario_sv: t[0], prompt_sv: t[1], scenario_en: t[2], prompt_en: t[3] },
      opts,
    };
  });
}

/** How the authored migration resolves each variable, and where the graph
 *  puts it (verified against a replay of main: scp_item_versions joined to
 *  scp_competencies). Eight competencies, no more, no fewer. */
const BEHAVIOUR_VARS: Record<string, { behaviour: string; version: number; competency: string }> = {
  b_sit: { behaviour: "situational_judgement", version: 1, competency: "SCC-03" },
  b_prop: { behaviour: "proportional_decision_making", version: 1, competency: "SCC-04" },
  b_judg: { behaviour: "proportional_decision_making", version: 2, competency: "SCC-11" },
  b_mand: { behaviour: "mandate_and_escalation", version: 1, competency: "SCC-09" },
  b_comm: { behaviour: "operational_communication", version: 1, competency: "SCC-06" },
  b_rep: { behaviour: "factual_reporting", version: 1, competency: "SCC-06" },
  b_int: { behaviour: "integrity_and_information_handling", version: 1, competency: "SCC-01" },
  b_serv: { behaviour: "de_escalation", version: 1, competency: "SCC-07" },
  b_coord: { behaviour: "operational_coordination", version: 1, competency: "SCC-08" },
};
const FACET_VARS: Record<string, string> = {
  f_scan: "aktiv-scanning",
  f_anom: "avvikelseigenkanning",
  f_disc: "genomforandedisciplin",
  f_rule: "regel-och-syfteslojalitet",
  f_err: "fel-och-avvikelseansvar",
  f_bound: "granshallning",
  f_esc: "eskalering-och-overlamning",
  f_recov: "aterhamtning",
  f_prio: "prioritering",
  f_doc: "dokumentation",
  f_prop: "proportionalitet",
  f_own: "agarskap",
  f_share: "informationsdelning",
  f_resp: "respektfullt-bemotande",
};
const ERROR_TYPES = new Set([
  "premature_escalation",
  "delayed_escalation",
  "poor_proportionality",
  "insufficient_information",
  "excessive_informal_trust",
  "weak_communication",
  "tunnel_vision",
  "failure_to_document",
  "unsupported_assumption",
  "outside_mandate",
]);

// ── The reviewed document ─────────────────────────────────────────────────

type ReviewOption = { k: string; sv: string; en: string; rat_sv: string; err?: string | null };
type ReviewItem = {
  slug: string;
  kind: Authored["kind"];
  decision: string;
  sv: { scenario: string; prompt: string };
  en: { scenario: string; prompt: string };
  options: ReviewOption[];
};
type ReviewDoc = {
  review: string;
  items: ReviewItem[];
  blocks: { key: string; intro_sv: string; intro_en: string }[];
  rubrics: { slug: string; dimensions: { key: string; sv: string; en: string }[] }[];
  en_adaptation: { reviewed_by: string; notes: string } | null;
};

const reviewSql = read(REVIEW);
const first = reviewSql.indexOf(TAG);
const second = reviewSql.indexOf(TAG, first + TAG.length);
if (first < 0 || second < 0) {
  console.error(`FAIL: ${REVIEW} does not carry a ${TAG} document.`);
  process.exit(1);
}
const doc: ReviewDoc = JSON.parse(reviewSql.slice(first + TAG.length, second));
const sqlOutsideDoc = (reviewSql.slice(0, first) + reviewSql.slice(second + TAG.length))
  .split("\n")
  .filter((l) => !/^\s*--/.test(l))
  .join("\n");

type AuditItem = {
  slug: string;
  kind: string;
  competency: string;
  behaviour: string;
  facet: string;
  decision: "KEEP" | "EDIT" | "REPLACE" | "RETIRE";
};
const audit: { items: AuditItem[] } = JSON.parse(read(AUDIT));

const authored = parseAuthored();
const bySlug = new Map(authored.map((a) => [a.slug, a]));
const reviewBySlug = new Map(doc.items.map((i) => [i.slug, i]));
const auditBySlug = new Map(audit.items.map((i) => [i.slug, i]));
const scenarios = doc.items.filter((i) => i.kind === "scenario");
const selfReports = doc.items.filter((i) => i.kind === "selfreport");
const reflections = doc.items.filter((i) => i.kind === "reflection");

// ── A. Shape ──────────────────────────────────────────────────────────────
console.log("\nA. Shape: 50 = 22 + 24 + 4, same identities as authored");
check(
  "A1 the authored migration carries 50 items",
  authored.length === 50,
  `found ${authored.length}`,
);
check(
  "A2 the review document carries 50 items",
  doc.items.length === 50,
  `found ${doc.items.length}`,
);
check(
  "A3 22 scenario, 24 self-report, 4 free-text items",
  scenarios.length === 22 && selfReports.length === 24 && reflections.length === 4,
  `${scenarios.length}/${selfReports.length}/${reflections.length}`,
);
check("A4 no duplicate item identity", new Set(doc.items.map((i) => i.slug)).size === 50);
check(
  "A5 the review's slug set equals the authored slug set",
  doc.items.every((i) => bySlug.has(i.slug)) && authored.every((a) => reviewBySlug.has(a.slug)),
);
check(
  "A6 every item keeps its authored kind and its authored option keys, in order",
  doc.items.every((i) => {
    const a = bySlug.get(i.slug)!;
    return a.kind === i.kind && a.opts.map((o) => o.k).join() === i.options.map((o) => o.k).join();
  }),
);
check(
  "A7 no item silently loses or gains an option",
  doc.items.every((i) => i.options.length === bySlug.get(i.slug)!.opts.length),
);

// ── B. Immutability, read from the SQL ────────────────────────────────────
console.log("\nB. Scoring and mapping immutability (the SQL outside the document)");
const ALLOWED: Record<string, string[]> = {
  scp_item_texts: [
    "scenario",
    "prompt",
    "adaptation_status",
    "adaptation_notes",
    "reviewed_by",
    "reviewed_at",
  ],
  scp_item_options: ["scoring_rationale_sv", "distractor_error_type"],
  scp_item_option_texts: ["label"],
  scp_form_blocks: ["intro_sv", "intro_en"],
  scp_rubric_dimensions: ["observable_criteria_sv", "observable_criteria_en"],
};
const updates = [...sqlOutsideDoc.matchAll(/UPDATE\s+public\.(\w+)\s+SET\s+([\s\S]*?)\s+WHERE\b/g)];
check(
  "B1 the migration updates only the five content tables",
  updates.length > 0 && updates.every((m) => m[1] in ALLOWED),
  updates
    .map((m) => m[1])
    .filter((t) => !(t in ALLOWED))
    .join(", "),
);
const offending: string[] = [];
for (const m of updates) {
  const cols = [...m[2].matchAll(/(?:^|,)\s*(\w+)\s*=/g)].map((c) => c[1]);
  for (const c of cols) if (!(ALLOWED[m[1]] ?? []).includes(c)) offending.push(`${m[1]}.${c}`);
}
check(
  "B2 no UPDATE assigns a scoring, order, mapping, status or gate column",
  offending.length === 0,
  offending.join(", "),
);
check(
  "B3 no INSERT or DELETE touches a governed table",
  !/\b(INSERT\s+INTO|DELETE\s+FROM)\s+public\.scp_/i.test(sqlOutsideDoc),
);
check(
  "B4 no adaptation status is raised to approved or source",
  !/adaptation_status\s*=\s*'(approved|source)'/i.test(sqlOutsideDoc) &&
    !/'approved'|'source'/.test(sqlOutsideDoc.replace(/IN \('approved', 'source'\)/g, "")),
);
check(
  "B5 the migration snapshots identity before and compares after",
  /_v3_before/.test(sqlOutsideDoc) &&
    /EXCEPT/.test(sqlOutsideDoc) &&
    /SCP_V3_IDENTITY_CHANGED/.test(sqlOutsideDoc),
);
check(
  "B6 the migration refuses while an attempt on the form is in progress or awaiting review",
  /SCP_V3_ATTEMPTS_IN_FLIGHT/.test(sqlOutsideDoc) &&
    /'in_progress'/.test(sqlOutsideDoc) &&
    /'submitted'/.test(sqlOutsideDoc),
);
check(
  "B7 self-report stays self-report: the authored helper declares evidence_source_type self_report and the review never names the column",
  /author_selfreport[\s\S]*?'self_report'/.test(read(BASE)) &&
    !/evidence_source_type/.test(sqlOutsideDoc.replace(/iv\.evidence_source_type/g, "")),
);
check(
  "B8 the migration asserts the 50 = 22 + 24 + 4 shape at apply time",
  /SCP_V3_SHAPE/.test(sqlOutsideDoc) && /SCP_V3_SELF_REPORT/.test(sqlOutsideDoc),
);
check(
  "B9 the migration asserts every review gate is still outstanding",
  /SCP_V3_GOVERNANCE_CLAIM/.test(sqlOutsideDoc),
);

// ── C. Competency coverage ────────────────────────────────────────────────
console.log("\nC. Competency mapping is stable and covers exactly eight competencies");
const mapMismatch: string[] = [];
for (const a of authored) {
  const exp = auditBySlug.get(a.slug);
  const bv = BEHAVIOUR_VARS[a.behaviourVar];
  const fv = FACET_VARS[a.facetVar];
  if (!exp || !bv || !fv) {
    mapMismatch.push(`${a.slug}: unresolved`);
    continue;
  }
  if (exp.competency !== bv.competency || exp.behaviour !== bv.behaviour || exp.facet !== fv) {
    mapMismatch.push(
      `${a.slug}: audit says ${exp.competency}/${exp.behaviour}/${exp.facet}, authored resolves ${bv.competency}/${bv.behaviour}/${fv}`,
    );
  }
}
check(
  "C1 every item's authored behaviour, facet and competency match the audit",
  mapMismatch.length === 0,
  mapMismatch.slice(0, 3).join("; "),
);
const competencies = new Set(authored.map((a) => BEHAVIOUR_VARS[a.behaviourVar]?.competency));
check(
  "C2 exactly the eight evidenced competencies: SCC-01, 03, 04, 06, 07, 08, 09, 11",
  [...competencies].sort().join() ===
    ["SCC-01", "SCC-03", "SCC-04", "SCC-06", "SCC-07", "SCC-08", "SCC-09", "SCC-11"].join(),
  [...competencies].sort().join(),
);
const observedByComp = new Map<string, number>();
for (const a of authored.filter((x) => x.kind !== "selfreport")) {
  const c = BEHAVIOUR_VARS[a.behaviourVar].competency;
  observedByComp.set(c, (observedByComp.get(c) ?? 0) + 1);
}
check(
  "C3 every evidenced competency still has at least one observed item",
  [...competencies].every((c) => (observedByComp.get(c) ?? 0) >= 1),
);
console.log(
  `      observed items per competency: ${[...observedByComp.entries()]
    .sort()
    .map(([c, n]) => `${c}=${n}`)
    .join(" ")}`,
);

// ── D. Both languages ─────────────────────────────────────────────────────
console.log("\nD. Both languages on every text and every label");
const nonEmpty = (s: unknown) => typeof s === "string" && s.trim().length > 0;
check(
  "D1 every item has a non-empty sv-SE and en-GB scenario and prompt",
  doc.items.every(
    (i) =>
      nonEmpty(i.sv?.scenario) &&
      nonEmpty(i.sv?.prompt) &&
      nonEmpty(i.en?.scenario) &&
      nonEmpty(i.en?.prompt),
  ),
);
check(
  "D2 every option has a non-empty sv-SE and en-GB label",
  doc.items.every((i) => i.options.every((o) => nonEmpty(o.sv) && nonEmpty(o.en))),
);
check(
  "D3 English is an adaptation, not a copy: no item text or option label is identical across languages",
  doc.items.every(
    (i) =>
      i.sv.scenario !== i.en.scenario &&
      i.sv.prompt !== i.en.prompt &&
      i.options.every((o) => o.sv !== o.en),
  ),
);
check(
  "D4 the two edited section intros exist in both languages",
  doc.blocks.length === 2 &&
    doc.blocks.every(
      (b) => nonEmpty(b.intro_sv) && nonEmpty(b.intro_en) && b.intro_sv !== b.intro_en,
    ),
);
check(
  "D5 the English adaptation is recorded as a content review by a named preparer, not as SME approval",
  !!doc.en_adaptation &&
    /not a named human/i.test(doc.en_adaptation.reviewed_by) &&
    /not validation|no psychometric/i.test(doc.en_adaptation.notes),
);

// ── E. Option-length balance ──────────────────────────────────────────────
console.log("\nE. Option-length balance on the 22 scenario items (form must not reveal the key)");
for (const lang of ["sv", "en"] as const) {
  let longest = 0;
  let shortest = 0;
  const ranks = [0, 0, 0];
  const extreme: string[] = [];
  for (const it of scenarios) {
    const a = bySlug.get(it.slug)!;
    const pref = a.opts.findIndex((o) => o.pref);
    const lens = it.options.map((o) => o[lang].length);
    const sorted = [...lens].sort((x, y) => y - x);
    ranks[sorted.indexOf(lens[pref])] += 1;
    if (lens[pref] === Math.max(...lens)) longest += 1;
    if (lens[pref] === Math.min(...lens)) shortest += 1;
    const others = lens.filter((_, i) => i !== pref);
    const ratio = lens[pref] / (others.reduce((x, y) => x + y, 0) / others.length);
    if (ratio > 1.75 || ratio < 0.5) extreme.push(`${it.slug} ${ratio.toFixed(2)}`);
  }
  console.log(
    `      ${lang}: preferred longest ${longest}/22, shortest ${shortest}/22, rank spread ${ranks.join("/")}`,
  );
  check(
    `E1 (${lang}) the preferred option is not the longest on a majority of scenario items`,
    longest <= 11,
    `${longest}/22`,
  );
  check(
    `E2 (${lang}) the preferred option is not the shortest on a majority of scenario items`,
    shortest <= 11,
    `${shortest}/22`,
  );
  check(
    `E3 (${lang}) every length rank is represented at least three times`,
    ranks.every((r) => r >= 3),
    ranks.join("/"),
  );
  check(
    `E4 (${lang}) no item's preferred option is extreme against its distractors (ratio within 0.5–1.75)`,
    extreme.length === 0,
    extreme.join(", "),
  );
}
check(
  "E5 every scenario item still declares randomised delivery (PR-V1 owns the served order)",
  (
    read(BASE).match(/randomise_options\)\s*\n\s*VALUES \(_form, _iv, _block, _order, true\)/g) ??
    []
  ).length === 1,
);

// ── F. Distractors ────────────────────────────────────────────────────────
console.log("\nF. Distractor quality: every distractor is a named error pattern with a rationale");
const badDistractor: string[] = [];
const lostRationale: string[] = [];
for (const it of scenarios) {
  const a = bySlug.get(it.slug)!;
  for (const o of it.options) {
    const ao = a.opts.find((x) => x.k === o.k)!;
    if (ao.pref) {
      if (o.err || !nonEmpty(o.rat_sv)) badDistractor.push(`${it.slug} ${o.k} (preferred)`);
    } else if (!o.err || !ERROR_TYPES.has(o.err) || !nonEmpty(o.rat_sv)) {
      badDistractor.push(`${it.slug} ${o.k}`);
    }
  }
}
for (const it of doc.items) {
  const a = bySlug.get(it.slug)!;
  for (const o of it.options) {
    const ao = a.opts.find((x) => x.k === o.k)!;
    if (nonEmpty(ao.rat_sv) && !nonEmpty(o.rat_sv)) lostRationale.push(`${it.slug} ${o.k}`);
  }
}
check(
  "F1 every scenario distractor carries a valid error pattern and a rationale; the preferred carries a rationale and no pattern",
  badDistractor.length === 0,
  badDistractor.join(", "),
);
check(
  "F2 no option loses a scoring rationale the author wrote",
  lostRationale.length === 0,
  lostRationale.join(", "),
);
check(
  "F3 the two distractors of an item name different error patterns, or the same one at a stated different degree (b01 only)",
  scenarios.every((it) => {
    const errs = it.options.filter((o) => o.err).map((o) => o.err);
    return new Set(errs).size === errs.length || it.slug === "so-rj-b01";
  }),
);

// ── G. Self-report ────────────────────────────────────────────────────────
console.log("\nG. Self-report statements");
const FREQ_SV = ["Nästan aldrig", "Ibland", "Ofta", "Nästan alltid"];
const FREQ_EN = ["Almost never", "Sometimes", "Often", "Almost always"];
const freqItems = selfReports.filter((i) => i.options.length === 4);
const pairItems = selfReports.filter((i) => i.options.length === 2);
check(
  "G1 20 frequency-scale items and 4 forced-choice pairs, as authored",
  freqItems.length === 20 && pairItems.length === 4,
  `${freqItems.length}/${pairItems.length}`,
);
check(
  "G2 every frequency scale keeps its authored labels in authored order, both languages",
  freqItems.every(
    (i) =>
      i.options.map((o) => o.sv).join("|") === FREQ_SV.join("|") &&
      i.options.map((o) => o.en).join("|") === FREQ_EN.join("|"),
  ),
);
const absolutes: string[] = [];
const doubleQuant: string[] = [];
for (const i of selfReports) {
  const sv = i.sv.scenario;
  const en = i.en.scenario;
  if (/\b(alltid|aldrig)\b/i.test(sv) || /\b(always|never)\b/i.test(en)) absolutes.push(i.slug);
  if (
    freqItems.includes(i) &&
    (/\b(ibland|oftast|ofta|sällan|alltid|aldrig)\b/i.test(sv) ||
      /\b(sometimes|usually|often|rarely|always|never)\b/i.test(en))
  )
    doubleQuant.push(i.slug);
}
check(
  "G3 no self-report statement uses an absolute (alltid/aldrig, always/never)",
  absolutes.length === 0,
  absolutes.join(", "),
);
check(
  "G4 no frequency-scale statement carries its own quantifier (the scale is the quantifier)",
  doubleQuant.length === 0,
  doubleQuant.join(", "),
);
check(
  "G5 every forced-choice pair still says neither answer is wrong, both languages",
  pairItems.every(
    (i) => /Inget av dem är fel/.test(i.sv.scenario) && /Neither is wrong/.test(i.en.scenario),
  ),
);
check(
  "G6 the self-report section intro tells a candidate without guarding experience how to answer",
  doc.blocks.some(
    (b) =>
      b.key === "c_behaviour" &&
      /inte arbetat inom bevakning/i.test(b.intro_sv) &&
      /not worked in security/i.test(b.intro_en),
  ),
);

// ── H. Free text ──────────────────────────────────────────────────────────
console.log("\nH. Free text asks for a concrete account in a stated shape, naming no method");
const SHAPE_SV = [
  /vad som hände|vad arbetet var|vad uppgiften gällde/i,
  /din (uppgift|roll)/i,
  /vad du (själv )?(gjorde|sa och gjorde|gjorde för att)/i,
  /hur det (slutade|gick)/i,
  /tog med dig/i,
];
const SHAPE_EN = [
  /what happened|what the work was|what the information concerned/i,
  /your role/i,
  /what you (yourself )?(did|said and did)/i,
  /how it (ended|went)/i,
  /took from it/i,
];
check(
  "H1 all four free-text items carry the five-part account shape in Swedish",
  reflections.every((i) => SHAPE_SV.every((r) => r.test(i.sv.scenario))),
  reflections
    .filter((i) => !SHAPE_SV.every((r) => r.test(i.sv.scenario)))
    .map((i) => i.slug)
    .join(", "),
);
check(
  "H2 all four free-text items carry the five-part account shape in English",
  reflections.every((i) => SHAPE_EN.every((r) => r.test(i.en.scenario))),
  reflections
    .filter((i) => !SHAPE_EN.every((r) => r.test(i.en.scenario)))
    .map((i) => i.slug)
    .join(", "),
);
check(
  "H3 every free-text item still says there is no right answer and a person reads it, both languages",
  reflections.every(
    (i) =>
      /inget rätt svar/i.test(i.sv.scenario) &&
      /en människa läser/i.test(i.sv.scenario) &&
      /no right answer/i.test(i.en.scenario) &&
      /a person reads/i.test(i.en.scenario),
  ),
);
const allText = [
  ...doc.items.flatMap((i) => [
    i.sv.scenario,
    i.sv.prompt,
    i.en.scenario,
    i.en.prompt,
    ...i.options.flatMap((o) => [o.sv, o.en]),
  ]),
  ...doc.blocks.flatMap((b) => [b.intro_sv, b.intro_en]),
  ...doc.rubrics.flatMap((r) => r.dimensions.flatMap((d) => [d.sv, d.en])),
];
check(
  "H4 no candidate-facing or rubric text names a method (STAR, AWS)",
  allText.every((t) => !/\b(STAR|AWS)\b/.test(t)),
);
check(
  "H5 the reflection section intro carries the same account shape in both languages",
  doc.blocks.some(
    (b) =>
      b.key === "e_reflection" &&
      /vad som hände/i.test(b.intro_sv) &&
      /vad du lärde dig/i.test(b.intro_sv) &&
      /what happened/i.test(b.intro_en) &&
      /what you learned/i.test(b.intro_en),
  ),
);
const RUBRIC_KEYS: Record<string, string[]> = {
  "so-rj-e01-own-mistake": ["concrete_situation", "what_was_done", "ownership", "clarity"],
  "so-rj-e02-saying-no": ["concrete_situation", "held_the_line", "respectful_handling", "clarity"],
  "so-rj-e03-sustained-attention": ["concrete_situation", "method", "self_observation", "clarity"],
  "so-rj-e04-wrong-information": [
    "concrete_situation",
    "verification",
    "correction_forward",
    "clarity",
  ],
};
check(
  "H6 rubric edits touch only authored dimension keys of the four authored rubrics, never the style-only clarity dimension",
  doc.rubrics.every(
    (r) =>
      r.slug in RUBRIC_KEYS &&
      r.dimensions.every(
        (d) =>
          RUBRIC_KEYS[r.slug].includes(d.key) &&
          d.key !== "clarity" &&
          nonEmpty(d.sv) &&
          nonEmpty(d.en),
      ),
  ),
);
check(
  "H7 an edited rubric criterion still lets a reviewer record that the account does not show it (states what must be present, never a verdict on the person)",
  doc.rubrics.every((r) =>
    r.dimensions.every(
      (d) => !/lämplig|olämplig|suitab|unsuitab|personlighet|personality/i.test(d.sv + d.en),
    ),
  ),
);

// ── I. Vocabulary ─────────────────────────────────────────────────────────
console.log("\nI. No hiring vocabulary in any candidate-facing sentence");
const BANNED_SV =
  /\b(lämplig(het)?|olämplig|godkän[dt]|underkän[dt]|rangordn\w*|anställningsbeslut|poäng|betyg)\b/i;
const BANNED_EN =
  /\b(suitab\w*|unsuitab\w*|pass(ed|es)?|fail(ed|s)?|rank(ing|ed|s)?|hir(e|ed|ing)|reject\w*|score[sd]?|grade[sd]?)\b/i;
const bannedHits = [
  ...doc.items.flatMap((i) => [
    ...[i.sv.scenario, i.sv.prompt, ...i.options.map((o) => o.sv)]
      .filter((t) => BANNED_SV.test(t))
      .map((t) => `${i.slug} sv: ${t.slice(0, 50)}`),
    ...[i.en.scenario, i.en.prompt, ...i.options.map((o) => o.en)]
      .filter((t) => BANNED_EN.test(t))
      .map((t) => `${i.slug} en: ${t.slice(0, 50)}`),
  ]),
  ...doc.blocks.flatMap((b) =>
    [b.intro_sv]
      .filter((t) => BANNED_SV.test(t))
      .concat([b.intro_en].filter((t) => BANNED_EN.test(t)))
      .map((t) => `${b.key}: ${t.slice(0, 50)}`),
  ),
];
check(
  "I1 no item text, option label or section intro contains a hire/reject/rank/pass/fail/suitability/score word",
  bannedHits.length === 0,
  bannedHits.join(" | "),
);

// ── J. The audit is honest ────────────────────────────────────────────────
console.log("\nJ. The item audit is complete and truthful");
check(
  "J1 the audit covers all 50 items exactly once",
  audit.items.length === 50 &&
    new Set(audit.items.map((i) => i.slug)).size === 50 &&
    authored.every((a) => auditBySlug.has(a.slug)),
);
check(
  "J2 every decision is KEEP or EDIT: nothing is REPLACE or RETIRE while the form keeps 50 items",
  audit.items.every((i) => i.decision === "KEEP" || i.decision === "EDIT"),
);
const sameAsAuthored = (i: ReviewItem) => {
  const a = bySlug.get(i.slug)!;
  return (
    a.texts.scenario_sv === i.sv.scenario &&
    a.texts.prompt_sv === i.sv.prompt &&
    a.texts.scenario_en === i.en.scenario &&
    a.texts.prompt_en === i.en.prompt &&
    i.options.every((o) => {
      const ao = a.opts.find((x) => x.k === o.k)!;
      return (
        ao.sv === o.sv &&
        ao.en === o.en &&
        (ao.rat_sv ?? "") === o.rat_sv &&
        (i.kind !== "scenario" || (ao.err || null) === (o.err || null))
      );
    })
  );
};
const dishonest = doc.items
  .filter((i) => (auditBySlug.get(i.slug)!.decision === "KEEP") !== sameAsAuthored(i))
  .map((i) => i.slug);
check(
  "J3 KEEP means unchanged and EDIT means changed, item by item",
  dishonest.length === 0,
  dishonest.join(", "),
);
check(
  "J4 the review document's own decisions agree with the audit",
  doc.items.every((i) => i.decision === auditBySlug.get(i.slug)!.decision),
);

// ── Verdict ───────────────────────────────────────────────────────────────
console.log("");
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} content-quality assertion(s) failed, ${passed} passed:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK: ${passed} Väktare content-quality assertions passed.`);
