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
//      resolution per slug matches the audit's expected competency, the
//      eight competencies are exactly the eight, and SCC-08 stays a
//      single-observation competency capped at limited evidence;
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
//      you did, how it ended, what you took from it) in both languages,
//      tells the candidate where an example may come from and that short
//      sentences or bullet points are fine, and names no method;
//   I  no hiring vocabulary in any candidate-facing sentence;
//   J  the audit is honest: every item has a decision, KEEP means the text
//      is unchanged, EDIT means it is not, and nothing is REPLACE or RETIRE
//      while the form still has 50 items;
//   K  the human content review (revision 2) is applied: b05's 3/1/0 is
//      professionally defensible, a03/a05/a07/d03/d05 reflect safe authority
//      and coordination, b02/d06 claim only what is defensible, b06's
//      poorest option no longer announces itself, c07/c19 are held as
//      BLOCKED with text and scores exactly as authored, c14 is concrete,
//      the programme purpose carries the product claim;
//   L  distractor tone: no option label ends in a self-incriminating
//      rationalisation, and no label stacks justification connectors.
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
const THRESHOLDS = "supabase/migrations/20260802090000_scp_phase0_competency_graph.sql";
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
  program?: { slug: string; purpose_sv: string; purpose_en: string };
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
  keying: string;
};
const audit: { items: AuditItem[] } = JSON.parse(read(AUDIT));

const authored = parseAuthored();
const bySlug = new Map(authored.map((a) => [a.slug, a]));
const reviewBySlug = new Map(doc.items.map((i) => [i.slug, i]));
const auditBySlug = new Map(audit.items.map((i) => [i.slug, i]));
const scenarios = doc.items.filter((i) => i.kind === "scenario");
const selfReports = doc.items.filter((i) => i.kind === "selfreport");
const reflections = doc.items.filter((i) => i.kind === "reflection");
const item = (slug: string) => reviewBySlug.get(slug)!;
const option = (slug: string, k: string) => item(slug).options.find((o) => o.k === k)!;
const nonEmpty = (s: unknown) => typeof s === "string" && s.trim().length > 0;

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
  scp_program_versions: ["purpose_sv", "purpose_en"],
};
const updates = [
  ...sqlOutsideDoc.matchAll(
    /UPDATE\s+public\.(\w+)(?:\s+\w+)?\s+SET\s+([\s\S]*?)\s+(?:FROM|WHERE)\b/g,
  ),
];
check(
  "B1 the migration updates only the six content tables",
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
const developingNeeds = Number(
  read(THRESHOLDS).match(/'developing_evidence',\s*[\d.]+,\s*(\d+)/)?.[1] ?? 0,
);
check(
  "C4 SCC-08 stays limited evidence: exactly one observed item, and developing_evidence needs at least two observations",
  observedByComp.get("SCC-08") === 1 && developingNeeds >= 2,
  `observed ${observedByComp.get("SCC-08")}, developing needs ${developingNeeds}`,
);
check(
  "C5 the migration asserts the SCC-08 cap at apply time",
  /SCP_V3_SCC08_CAP/.test(sqlOutsideDoc),
);

// ── D. Both languages ─────────────────────────────────────────────────────
console.log("\nD. Both languages on every text and every label");
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
const allEnglish = [
  ...doc.items.flatMap((i) => [i.en.scenario, i.en.prompt, ...i.options.map((o) => o.en)]),
  ...doc.blocks.map((b) => b.intro_en),
  doc.program?.purpose_en ?? "",
];
check(
  "D6 the English agreement error 'sentences is enough' is gone",
  allEnglish.every((t) => !/sentences is enough/i.test(t)),
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
  "G5 c03's pair intro no longer contradicts its 1/3 key; the three pairs the reviewers did not raise keep their authored intro",
  !/Inget av dem är fel|Neither is wrong/.test(
    item("so-rj-c03").sv.scenario + item("so-rj-c03").en.scenario,
  ) &&
    ["so-rj-c06", "so-rj-c18", "so-rj-c24"].every(
      (s) =>
        /Inget av dem är fel/.test(item(s).sv.scenario) &&
        /Neither is wrong/.test(item(s).en.scenario),
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
check(
  "G7 no self-report statement presupposes guard employment by naming checkpoints, patrols or night shifts",
  selfReports.every(
    (i) =>
      !/kontrollpunkt|nattpass|\brond\b|ronden/i.test(i.sv.scenario) &&
      !/checkpoint|night shift|\bpatrol/i.test(i.en.scenario),
  ),
  selfReports
    .filter(
      (i) =>
        /kontrollpunkt|nattpass|\brond\b|ronden/i.test(i.sv.scenario) ||
        /checkpoint|night shift|\bpatrol/i.test(i.en.scenario),
    )
    .map((i) => i.slug)
    .join(", "),
);

// ── H. Free text ──────────────────────────────────────────────────────────
console.log("\nH. Free text asks for a concrete account in a stated shape, naming no method");
const SHAPE_SV = [
  /vad som hände|vad arbetet var|vad uppgiften (gällde|handlade om)/i,
  /din (uppgift|roll)/i,
  /vad du (själv )?(gjorde|sa och gjorde|gjorde för att)/i,
  /hur det (slutade|gick)/i,
  /tog med dig/i,
];
const SHAPE_EN = [
  /what happened|what the work was|what the information was about/i,
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
  doc.program?.purpose_sv ?? "",
  doc.program?.purpose_en ?? "",
];
check(
  "H4 no candidate-facing, rubric or product text names a method (STAR, AWS)",
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
  "H7 an edited rubric criterion states what must be present, never a verdict on the person",
  doc.rubrics.every((r) =>
    r.dimensions.every(
      (d) => !/lämplig|olämplig|suitab|unsuitab|personlighet|personality/i.test(d.sv + d.en),
    ),
  ),
);
check(
  "H8 every free-text item tells the candidate an example may come from work, a placement, studies or an association, and that short sentences or bullet points are fine",
  reflections.every(
    (i) =>
      /praktik, studier, föreningsliv/i.test(i.sv.scenario) &&
      /punktform/i.test(i.sv.scenario) &&
      /inte hur du formulerar dig/i.test(i.sv.scenario) &&
      /placement, studies/i.test(i.en.scenario) &&
      /bullet points/i.test(i.en.scenario) &&
      /not how you phrase it/i.test(i.en.scenario),
  ),
);
check(
  "H9 the reflection section intro carries the example-source and short-form guidance too",
  doc.blocks.some(
    (b) =>
      b.key === "e_reflection" &&
      /praktik, studier/i.test(b.intro_sv) &&
      /punktform/i.test(b.intro_sv) &&
      /placement, studies/i.test(b.intro_en) &&
      /bullet points/i.test(b.intro_en),
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

// ── K. The human content review is applied ────────────────────────────────
console.log("\nK. Human content review (revision 2) applied");
const authoredScore = (slug: string, k: string) =>
  bySlug.get(slug)!.opts.find((o) => o.k === k)!.score;
check(
  "K1 b05: the 1-point option leaves the door closed and records nothing; the 0-point option restores the doorstop; the 3-point option closes, records and hands over",
  /^Låt dörren vara stängd och gå hem\./.test(option("so-rj-b05", "b").sv) &&
    /^Leave the door closed and go home\./.test(option("so-rj-b05", "b").en) &&
    authoredScore("so-rj-b05", "b") === 1 &&
    option("so-rj-b05", "b").err === "failure_to_document" &&
    /Ställ tillbaka släckaren/.test(option("so-rj-b05", "c").sv) &&
    /Put the extinguisher back/.test(option("so-rj-b05", "c").en) &&
    authoredScore("so-rj-b05", "c") === 0 &&
    /notera|Notera/.test(option("so-rj-b05", "a").sv) &&
    /överlämning/.test(option("so-rj-b05", "a").sv) &&
    authoredScore("so-rj-b05", "a") === 3 &&
    !/Ställ tillbaka släckaren/.test(option("so-rj-b05", "b").sv),
);
check(
  "K2 a03: the preferred option keeps the employee at a distance, somewhere safe and in the call; nobody is asked to confront by the key",
  /hålla avstånd/.test(option("so-rj-a03", "a").sv) &&
    /säker plats/.test(option("so-rj-a03", "a").sv) &&
    /stanna kvar i samtalet/.test(option("so-rj-a03", "a").sv) &&
    !/stanna kvar i telefon/.test(option("so-rj-a03", "a").sv) &&
    /keep their distance/.test(option("so-rj-a03", "a").en) &&
    /stay on the call/.test(option("so-rj-a03", "a").en),
);
check(
  "K3 a05: the 0-point option says the two points are signed off in the guard's own name without going to them",
  /i ditt eget namn utan att gå dit/.test(option("so-rj-a05", "c").sv) &&
    /own name without going to them/.test(option("so-rj-a05", "c").en) &&
    authoredScore("so-rj-a05", "c") === 0,
);
check(
  "K4 a07: the scenario states lone response, back-up not arrived and that the alarm centre decides on entry; the key follows the alarm centre's decision",
  /åker ensam/.test(item("so-rj-a07").sv.scenario) &&
    /Förstärkning finns men är inte framme/.test(item("so-rj-a07").sv.scenario) &&
    /larmcentralen avgör/.test(item("so-rj-a07").sv.scenario) &&
    /respond alone/.test(item("so-rj-a07").en.scenario) &&
    /alarm centre decides/.test(item("so-rj-a07").en.scenario) &&
    /följ deras besked/.test(option("so-rj-a07", "a").sv) &&
    /follow their decision/.test(option("so-rj-a07", "a").en),
);
check(
  "K5 d03: 1 point = risk handled now with weak follow-up (failure_to_document); 0 points = passivity (delayed_escalation)",
  /^Ring objektet direkt/.test(option("so-rj-d03", "b").sv) &&
    option("so-rj-d03", "b").err === "failure_to_document" &&
    authoredScore("so-rj-d03", "b") === 1 &&
    /^Lita på att/.test(option("so-rj-d03", "c").sv) &&
    option("so-rj-d03", "c").err === "delayed_escalation" &&
    authoredScore("so-rj-d03", "c") === 0,
);
check(
  "K6 d05: security-sensitive points are named as such and the key coordinates with the alarm centre or supervisor before any go unchecked",
  /säkerhetskänsliga/.test(item("so-rj-d05").sv.scenario) &&
    /security-sensitive/.test(item("so-rj-d05").en.scenario) &&
    /larmcentralen eller arbetsledaren/.test(option("so-rj-d05", "a").sv) &&
    /alarm centre or your supervisor/.test(option("so-rj-d05", "a").en) &&
    !/skyddsvärde/.test(item("so-rj-d05").sv.scenario),
);
check(
  "K7 b02: the usable report claims only what is observable about electrical equipment",
  /Ingen synlig elutrustning i kontakt med vattnet/.test(option("so-rj-b02", "a").sv) &&
    /No visible electrical equipment in contact with the water/.test(option("so-rj-b02", "a").en) &&
    !/ingen el i vattnet/i.test(option("so-rj-b02", "a").sv),
);
check(
  "K8 d06: the key asks for an authorised request and refers per procedure, without the absolute 'only for security purposes'",
  /behörig begäran/.test(option("so-rj-d06", "a").sv) &&
    /enligt rutinen/.test(option("so-rj-d06", "a").sv) &&
    /authorised request/.test(option("so-rj-d06", "a").en) &&
    !/bara får användas för säkerhetsändamål/.test(option("so-rj-d06", "a").sv) &&
    !/only be used for security purposes/.test(option("so-rj-d06", "a").en),
);
check(
  "K9 b06: the poorest option no longer explains why it is poor",
  !/oklarhet|confusion|motsägelsefull|contradict/i.test(
    option("so-rj-b06", "c").sv + option("so-rj-b06", "c").en,
  ),
);
check(
  "K10 c07 and c19 are held BLOCKED: text and scores exactly as authored, and the audit says so",
  ["so-rj-c07", "so-rj-c19"].every(
    (s) =>
      sameAsAuthored(item(s)) &&
      auditBySlug.get(s)!.decision === "KEEP" &&
      /^BLOCKED/.test(auditBySlug.get(s)!.keying),
  ),
);
check(
  "K11 c14 describes a concrete, reverse-worded behaviour rather than an opinion",
  /låter jag bli att rapportera det/.test(item("so-rj-c14").sv.scenario) &&
    /leave it unreported/.test(item("so-rj-c14").en.scenario) &&
    !/tycker/.test(item("so-rj-c14").sv.scenario),
);
check(
  "K12 the SV/EN corrections the reviewers named are in: a09 'i tidsordning', c04 'rely on remembering', c20 'raised an alarm unnecessarily', d01 'nothing has gone wrong in six years', e04 'what the information was about'",
  /i tidsordning/.test(option("so-rj-a09", "a").sv) &&
    /in chronological order/.test(option("so-rj-a09", "a").en) &&
    /rely on remembering it/.test(item("so-rj-c04").en.scenario) &&
    /larmat i onödan/.test(item("so-rj-c20").sv.scenario) &&
    /raised an alarm unnecessarily/.test(item("so-rj-c20").en.scenario) &&
    /nothing has gone wrong in six years/.test(option("so-rj-d01", "b").en) &&
    /what the information was about/.test(item("so-rj-e04").en.scenario),
);
check(
  "K13 the programme purpose carries the product claim and never calls the inputs collectively observed evidence",
  !!doc.program &&
    doc.program.slug === "security-officer-recruitment" &&
    /rollspecifikt bedömnings- och intervjuunderlag/.test(doc.program.purpose_sv) &&
    /scenariorespons, kandidatens egna beskrivningar och fritextsvar/.test(
      doc.program.purpose_sv,
    ) &&
    /mänsklig rekryteringsbedömning/.test(doc.program.purpose_sv) &&
    /human recruitment judgement/.test(doc.program.purpose_en) &&
    !/observed evidence|observerad evidens/i.test(
      doc.program.purpose_sv + doc.program.purpose_en,
    ) &&
    /inget anställningsbeslut/.test(doc.program.purpose_sv) &&
    /no employment decision/.test(doc.program.purpose_en),
);

// ── L. Distractor tone ────────────────────────────────────────────────────
console.log("\nL. Distractor tone: plausible actions, not confessions");
const TONE_SV = [
  /behöver se att du har kontroll/i,
  /relationen till uppdragsgivaren/i,
  /varje minut räknas/i,
  /talar för sig/i,
  /knappast en säkerhetsrisk/i,
  /desto bättre/i,
  /kan användas mot dig/i,
  /slipper förklara/i,
  /bygger goda relationer/i,
  /behöver inte förklara dig/i,
  /finns det spårbart/i,
  /bara skapar oklarhet|skapar bara oklarhet/i,
  /inte din (sak|uppgift) att/i,
  /se konstig ut/i,
  /mer fullständig/i,
  /sköts som det ska/i,
];
const TONE_EN = [
  /need to see you are in control/i,
  /client relationship/i,
  /every minute counts/i,
  /speaks for itself/i,
  /hardly a security risk/i,
  /the less you discuss/i,
  /used against you/i,
  /avoid explaining/i,
  /builds good relations/i,
  /do not need to explain/i,
  /record if anybody/i,
  /only create confusion/i,
  /not your (job|place) to/i,
  /look odd/i,
  /more complete/i,
  /handled properly/i,
];
const toneHits: string[] = [];
for (const it of scenarios) {
  for (const o of it.options) {
    if (TONE_SV.some((r) => r.test(o.sv)) || TONE_EN.some((r) => r.test(o.en)))
      toneHits.push(`${it.slug} ${o.k}`);
  }
}
check(
  "L1 no scenario option carries a self-incriminating rationalisation from the reviewers' list",
  toneHits.length === 0,
  toneHits.join(", "),
);
const stacked: string[] = [];
for (const it of scenarios) {
  for (const o of it.options) {
    const nSv = (o.sv.match(/\b(eftersom|så att|för att)\b/gi) ?? []).length;
    const nEn = (o.en.match(/\b(since|so that|because)\b/gi) ?? []).length;
    if (nSv > 1 || nEn > 1) stacked.push(`${it.slug} ${o.k} (${nSv}/${nEn})`);
  }
}
check(
  "L2 no scenario option stacks more than one justification connector (eftersom / så att / för att; since / so that / because)",
  stacked.length === 0,
  stacked.join(", "),
);
check(
  "L3 the reviewers' tone list is kept as a file-level guard, not a one-off: at least twelve patterns per language",
  TONE_SV.length >= 12 && TONE_EN.length >= 12,
);

// ── Verdict ───────────────────────────────────────────────────────────────
console.log("");
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} content-quality assertion(s) failed, ${passed} passed:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK: ${passed} Väktare content-quality assertions passed.`);
