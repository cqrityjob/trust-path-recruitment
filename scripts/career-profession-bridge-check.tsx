// Career profession bridge -- deterministic integrity guard (PR-A).
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The legacy TS profession slugs are bridged to CIG canonical rows in
// src/lib/career-intelligence-engine/slug-map.ts. Before PR-A that bridge
// pointed data-centre security at AIRPORT security and corporate fraud
// investigation at the POLICE civilian investigator "to avoid an empty
// state", and two pairs of distinct professions collapsed onto one CIG node
// (intelligence-analyst + security-investigator, security-consultant +
// security-coordinator). The wrong node's title, formal requirements and
// sources were rendered as if they belonged to the profession, and in the
// reverse direction a job posted as airport security borrowed the
// data-centre profile's scores and competencies.
//
// The rule is: ONE profession -> ONE semantically correct CIG node, or NO
// enrichment. This guard proves, without a database:
//
//   A. The bridge table is exactly the reviewed one (a literal here), covers
//      every scored profession exactly once, is one-to-one, and every target
//      is a PUBLISHED CIG row (parsed from the catalogue migrations).
//   B. The rejected proxies are out in BOTH directions, and no other file
//      re-introduces them.
//   C. Forward contract: a match's enrichment always comes from its own
//      node; a profession without a node gets the empty bundle.
//   D. Ranking immutability: the engine's ranked list, scores and family
//      ranking are byte-identical to the PRE-repair engine (the old map,
//      the old dedup rule) for every persona and a mixed corpus.
//   E. Reverse / job relevance contract: a job's CIG slug resolves to its
//      exact profession or to family-level guidance, never to a proxy.
//   F. Honest UX: a profession without a node renders its Career Center
//      title and neutral copy; no raw id, "undefined" or foreign title.
//   G. Career Discovery's own bridge (cd_professions.cig_profession_slug)
//      and its approved_for_ranking set are untouched, and agree with this
//      bridge wherever both exist.
//
// Mutation proof: restore `"data-center-security": "flygplatssakerhet"` in
// slug-map.ts and sections A, B, C and E fail. Never commit that.
//
// Run: bun run career-profession-bridge:check

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnswerMap } from "../src/lib/career-assessment/types";
import type {
  TargetVector,
  EnrichmentBundle,
  Match,
} from "../src/lib/career-intelligence-engine/types";

// <Link> needs a live router and renders nothing under renderToStaticMarkup;
// the substitute keeps the resolved href so link text is still asserted on.
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    return React.createElement("a", { href, ...rest }, children);
  },
  createFileRoute: () => () => ({}),
}));

const {
  CAREER_PROFESSION_BRIDGE,
  ENRICHMENT_UNAVAILABLE,
  FORBIDDEN_CIG_PROXIES,
  LEGACY_TO_CIG_SLUG,
  isEnrichmentUnavailable,
  toCigSlug,
  toLegacySlug,
} = await import("../src/lib/career-intelligence-engine/slug-map");
const { FROZEN_RANKING_GROUPS, cieRankingIdentity } =
  await import("../src/lib/career-intelligence-engine/ranking-identity");
const { computeEngineResultV1 } = await import("../src/lib/career-intelligence-engine");
const { buildTargetVectorsFromLegacy } =
  await import("../src/lib/career-intelligence-engine/target-vector");
const { buildCareerProfileForJobs } =
  await import("../src/lib/career-intelligence-engine/profile-for-jobs");
const { legacySlugForJob, relevanceForJob } =
  await import("../src/lib/job-intelligence/personal-relevance");
const { professionProfiles } = await import("../src/lib/career-assessment/profession-profiles");
const { testPersonas } = await import("../src/lib/career-assessment/test-personas");
const { getProfession } = await import("../src/lib/career-center");
const { EngineResultView } = await import("../src/components/assessment/result/engine-view");
const { EmployerReportView } =
  await import("../src/components/assessment/result/EmployerReportView");
const { enrichmentUnavailableCopy, professionTitleBi } =
  await import("../src/components/assessment/result/labels");

const ROOT = path.resolve(import.meta.dir, "..");
let failed = 0;
let passed = 0;
function assert(cond: unknown, msg: string) {
  if (cond) passed += 1;
  else {
    failed += 1;
    console.error("  FAIL:", msg);
  }
}
function section(title: string) {
  console.log(`\n== ${title}`);
}
const NOW = "2026-09-02T00:00:00.000Z";
const fixedClock = () => NOW;

// ── The reviewed bridge, as a literal ─────────────────────────────────────
// Deliberately duplicated from slug-map.ts: a bridge edit must be a
// conscious edit HERE too, with the classification written down.

const EXPECTED_BRIDGE: Record<string, { cig: string; cls: "exact" | "acceptable_alias" }> = {
  "security-officer": { cig: "vaktare", cls: "exact" },
  ordningsvakt: { cig: "ordningsvakt", cls: "exact" },
  skyddsvakt: { cig: "skyddsvakt", cls: "exact" },
  "security-manager": { cig: "sakerhetschef", cls: "exact" },
  "security-technician": { cig: "sakerhetstekniker", cls: "exact" },
  "risk-manager": { cig: "risk-manager", cls: "exact" },
  "aml-specialist": { cig: "aml-specialist", cls: "exact" },
  "crisis-continuity-manager": { cig: "krisberedskapssamordnare", cls: "acceptable_alias" },
  "close-protection": { cig: "livvakt", cls: "acceptable_alias" },
  "soc-analyst": { cig: "soc-analytiker", cls: "exact" },
  "security-investigator": { cig: "sakerhetsutredare", cls: "exact" },
  "security-coordinator": { cig: "sakerhetssamordnare", cls: "exact" },
};

// Professions with no honest CIG node, and the proxies they must never get.
const EXPECTED_UNAVAILABLE: Record<string, string[]> = {
  "data-center-security": ["flygplatssakerhet"],
  "fraud-investigator": ["civil-utredare", "polisutredare"],
  "intelligence-analyst": ["sakerhetsutredare", "polis-intel-analytiker"],
  "security-consultant": ["sakerhetssamordnare"],
};

// The PRE-repair bridge, verbatim, used only to replay the old engine for
// the ranking-immutability proof (section D). Never exported anywhere.
const PRE_REPAIR_MAP: Record<string, string> = {
  "security-officer": "vaktare",
  ordningsvakt: "ordningsvakt",
  skyddsvakt: "skyddsvakt",
  "security-manager": "sakerhetschef",
  "security-technician": "sakerhetstekniker",
  "risk-manager": "risk-manager",
  "aml-specialist": "aml-specialist",
  "data-center-security": "flygplatssakerhet",
  "crisis-continuity-manager": "krisberedskapssamordnare",
  "close-protection": "livvakt",
  "soc-analyst": "soc-analytiker",
  "intelligence-analyst": "sakerhetsutredare",
  "fraud-investigator": "civil-utredare",
  "security-investigator": "sakerhetsutredare",
  "security-consultant": "sakerhetssamordnare",
  "security-coordinator": "sakerhetssamordnare",
};

const scoredIds = professionProfiles.map((p) => p.professionId);

// ── CIG catalogue, parsed from the migrations that seed it ────────────────

function cigCatalogue(): Map<string, "published" | "draft"> {
  const files = [
    "supabase/migrations/20260717073758_a3d931d5-63b3-4227-90de-e3468d3a6f32.sql",
    "supabase/migrations/20260913092000_cig_security_leadership_professions.sql",
  ];
  const out = new Map<string, "published" | "draft">();
  const row = /\('([a-z0-9-]+)','(se\.[a-z0-9.-]+)','[a-z-]+','[ABC]','(published|draft)'/g;
  for (const f of files) {
    const src = readFileSync(path.join(ROOT, f), "utf8");
    for (const m of src.matchAll(row)) out.set(m[1], m[3] as "published" | "draft");
  }
  return out;
}

// ── Career Discovery's own bridge, parsed from its migrations ─────────────

function cdBridge(): Map<string, { titleEn: string; cig: string; approved: boolean }> {
  const files = [
    "supabase/migrations/20260814180000_cd_layer4_first_wave_professions.sql",
    "supabase/migrations/20261006090000_cd_layer4_entry_gap_professions.sql",
  ];
  const out = new Map<string, { titleEn: string; cig: string; approved: boolean }>();
  const row =
    /\('(SP\d{3})',\s*'SCA\d+',\s*'[^']*',\s*'([^']*)',\s*'[a-z]+',\s*(?:true|false),\s*(?:true|false),\s*\d+,\s*'[a-z_]+',\s*(?:true|false),\s*(true|false),\s*'([a-z0-9-]+)'/g;
  for (const f of files) {
    const src = readFileSync(path.join(ROOT, f), "utf8");
    for (const m of src.matchAll(row)) {
      out.set(m[1], { titleEn: m[2], cig: m[4], approved: m[3] === "true" });
    }
  }
  return out;
}

function cdApprovedSet(): Set<string> {
  const src = readFileSync(
    path.join(
      ROOT,
      "supabase/migrations/20260816190000_cd_v31_activate_first_wave_professions.sql",
    ),
    "utf8",
  );
  const block = src.slice(src.indexOf("UPDATE public.cd_professions"));
  const upd = block.slice(0, block.indexOf(";"));
  return new Set([...upd.matchAll(/'(SP\d{3})'/g)].map((m) => m[1]));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const stripTags = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

// ═══════════════════════════════════════════════════════════════════════
section("A. bridge table");
{
  const bridged = Object.keys(LEGACY_TO_CIG_SLUG).sort();
  const expected = Object.keys(EXPECTED_BRIDGE).sort();
  assert(
    JSON.stringify(bridged) === JSON.stringify(expected),
    `bridged professions differ from the reviewed table: ${bridged.join(",")} vs ${expected.join(",")}`,
  );
  for (const [legacy, exp] of Object.entries(EXPECTED_BRIDGE)) {
    assert(
      LEGACY_TO_CIG_SLUG[legacy] === exp.cig,
      `${legacy} -> ${LEGACY_TO_CIG_SLUG[legacy]} (expected ${exp.cig})`,
    );
    const entry = CAREER_PROFESSION_BRIDGE.find((e) => e.legacySlug === legacy);
    assert(entry?.classification === exp.cls, `${legacy} classification ${entry?.classification}`);
    assert((entry?.rationale ?? "").length > 10, `${legacy} has no rationale`);
    assert(toCigSlug(legacy) === exp.cig, `toCigSlug(${legacy})`);
    assert(toLegacySlug(exp.cig) === legacy, `toLegacySlug(${exp.cig}) = ${toLegacySlug(exp.cig)}`);
  }
  // One-to-one.
  const cigs = CAREER_PROFESSION_BRIDGE.map((e) => e.cigSlug);
  assert(new Set(cigs).size === cigs.length, `CIG targets are not unique: ${cigs.join(",")}`);
  const legacies = CAREER_PROFESSION_BRIDGE.map((e) => e.legacySlug);
  assert(new Set(legacies).size === legacies.length, "legacy keys are not unique");

  // Coverage: every scored profession is classified exactly once.
  const unavailable = ENRICHMENT_UNAVAILABLE.map((e) => e.legacySlug);
  const all = [...legacies, ...unavailable].sort();
  assert(
    JSON.stringify(all) === JSON.stringify([...scoredIds].sort()),
    `bridge + unavailable must equal the scored professions: ${all.join(",")}`,
  );
  assert(
    JSON.stringify([...unavailable].sort()) ===
      JSON.stringify(Object.keys(EXPECTED_UNAVAILABLE).sort()),
    `unavailable set differs: ${unavailable.join(",")}`,
  );

  // Every target is a PUBLISHED CIG row.
  const catalogue = cigCatalogue();
  assert(catalogue.size >= 60, `CIG catalogue parse looks wrong (${catalogue.size} rows)`);
  for (const e of CAREER_PROFESSION_BRIDGE) {
    assert(
      catalogue.get(e.cigSlug) === "published",
      `${e.legacySlug} -> ${e.cigSlug} is not a published CIG row (${catalogue.get(e.cigSlug)})`,
    );
  }
  // Every rejected proxy is a real CIG slug (so the guard is about real rows).
  for (const [legacy, proxies] of Object.entries(EXPECTED_UNAVAILABLE)) {
    for (const p of proxies) assert(catalogue.has(p), `${legacy}: proxy ${p} is not a CIG slug`);
  }

  // Every scored profession has a Career Center title in both languages
  // (the fallback the UI shows when enrichment is unavailable).
  for (const id of scoredIds) {
    const guide = getProfession(id);
    assert(!!guide?.titleSv && !!guide?.titleEn, `${id} has no Career Center title`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
section("B. rejected proxies stay out, in both directions and in every file");
{
  for (const [legacy, proxies] of Object.entries(EXPECTED_UNAVAILABLE)) {
    assert(toCigSlug(legacy) === undefined, `${legacy} must have NO enrichment mapping`);
    assert(isEnrichmentUnavailable(legacy), `${legacy} not flagged as enrichment-unavailable`);
    assert(
      JSON.stringify(FORBIDDEN_CIG_PROXIES[legacy]) === JSON.stringify(proxies),
      `${legacy} forbidden proxies differ`,
    );
    for (const p of proxies) {
      assert(toLegacySlug(p) !== legacy, `reverse: ${p} must not resolve to ${legacy}`);
      assert(LEGACY_TO_CIG_SLUG[legacy] !== p, `forward: ${legacy} must not map to ${p}`);
    }
  }
  // The two nodes the collisions shared now resolve to their exact profession.
  assert(
    toLegacySlug("sakerhetsutredare") === "security-investigator",
    "sakerhetsutredare reverse",
  );
  assert(
    toLegacySlug("sakerhetssamordnare") === "security-coordinator",
    "sakerhetssamordnare reverse",
  );
  assert(
    toLegacySlug("flygplatssakerhet") === undefined,
    "flygplatssakerhet must resolve to nothing",
  );
  assert(toLegacySlug("civil-utredare") === undefined, "civil-utredare must resolve to nothing");

  // Source scan: no other file re-creates a forbidden pair or a second
  // reverse table, and no result surface falls back to a raw id.
  const files = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "scripts"))].filter(
    (f) =>
      !f.endsWith("career-profession-bridge-check.tsx") &&
      !f.endsWith(path.join("career-intelligence-engine", "slug-map.ts")) &&
      !f.endsWith(path.join("integrations", "supabase", "types.ts")),
  );
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const [legacy, proxies] of Object.entries(EXPECTED_UNAVAILABLE)) {
      for (const p of proxies) {
        const pair = new RegExp(`["']?${legacy}["']?\\s*:\\s*["']${p}["']`);
        assert(!pair.test(src), `${path.relative(ROOT, f)} re-creates ${legacy} -> ${p}`);
      }
    }
  }
  const relevance = readFileSync(
    path.join(ROOT, "src/lib/job-intelligence/personal-relevance.ts"),
    "utf8",
  );
  assert(/toLegacySlug\(/.test(relevance), "personal-relevance must use toLegacySlug");
  assert(
    !/CIG_TO_LEGACY_SLUG/.test(relevance),
    "personal-relevance must not build its own reverse table",
  );
  const loader = readFileSync(
    path.join(ROOT, "src/lib/career-intelligence-engine/compute.functions.ts"),
    "utf8",
  );
  assert(/toCigSlug\(/.test(loader), "enrichment loader must derive CIG slugs through toCigSlug");
  assert(/!!x\.cig/.test(loader), "enrichment loader must drop professions without a CIG slug");
  for (const f of [
    "src/components/assessment/result/engine-view.tsx",
    "src/components/assessment/result/labels.ts",
    "src/components/assessment/result/EmployerReportView.tsx",
  ]) {
    const src = readFileSync(path.join(ROOT, f), "utf8");
    assert(
      !/(match|top)\.titleSv \?\? (match|top)\.(professionKey|legacySlug)/.test(src),
      `${f} falls back to a raw id for the title`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
section("C. forward contract: enrichment always belongs to the profession's own node");
{
  const fixture: Record<string, EnrichmentBundle> = {};
  for (const [legacy, cig] of Object.entries(LEGACY_TO_CIG_SLUG)) {
    fixture[legacy] = {
      cigSlug: cig,
      titleSv: `CIG:${cig}`,
      titleEn: `CIG-EN:${cig}`,
      disclaimer: null,
      formalRequirements: [
        { label: { sv: `FR:${cig}`, en: `FR-EN:${cig}` }, isLegal: true, isEmployer: false },
      ],
      relatedProfessions: [],
      transitions: [],
      educationPathways: [],
      certifications: [],
      sources: [{ label: `SRC:${cig}` }],
      sourceCoverage: 1 / 3,
    };
  }
  let checked = 0;
  for (const persona of testPersonas) {
    for (const topN of [3, 5]) {
      const r = computeEngineResultV1({
        answers: persona.answers,
        enrichmentByLegacySlug: fixture,
        options: { topN, now: fixedClock },
      });
      for (const m of r.matches) {
        checked += 1;
        const cig = toCigSlug(m.legacySlug);
        if (cig) {
          assert(
            m.cigSlug === cig,
            `${persona.id}: ${m.legacySlug} cigSlug ${m.cigSlug} != ${cig}`,
          );
          assert(
            m.titleSv === `CIG:${cig}`,
            `${persona.id}: ${m.legacySlug} title from wrong node`,
          );
          assert(
            m.enrichment.formalRequirements[0]?.label.sv === `FR:${cig}`,
            `${persona.id}: ${m.legacySlug} formal requirements from wrong node`,
          );
        } else {
          assert(m.cigSlug === undefined, `${persona.id}: ${m.legacySlug} carries a cigSlug`);
          assert(m.titleSv === undefined, `${persona.id}: ${m.legacySlug} carries a foreign title`);
          assert(
            m.enrichment.formalRequirements.length === 0 && m.enrichment.sources.length === 0,
            `${persona.id}: ${m.legacySlug} carries foreign enrichment`,
          );
        }
        const forbidden = FORBIDDEN_CIG_PROXIES[m.legacySlug] ?? [];
        assert(
          !forbidden.includes(m.enrichment.cigSlug ?? "") && !forbidden.includes(m.cigSlug ?? ""),
          `${persona.id}: ${m.legacySlug} enriched from a forbidden proxy`,
        );
      }
    }
  }
  console.log(`  ${checked} matches checked`);
}

// ═══════════════════════════════════════════════════════════════════════
section("D. ranking immutability: byte-identical to the pre-repair engine");
{
  assert(
    JSON.stringify(FROZEN_RANKING_GROUPS) ===
      JSON.stringify({
        "intelligence-analyst": "cie-rank-group:investigation",
        "security-investigator": "cie-rank-group:investigation",
        "security-consultant": "cie-rank-group:coordination",
        "security-coordinator": "cie-rank-group:coordination",
      }),
    "frozen ranking groups changed -- that is a ranking change needing PO review",
  );
  for (const id of scoredIds) {
    if (!(id in FROZEN_RANKING_GROUPS)) {
      assert(cieRankingIdentity(id) === id, `${id} ranking identity must be itself`);
    }
  }

  // The old engine: cigSlug from the old map, no rankingIdentity, so the
  // historical `cigSlug || legacySlug` dedup rule applies.
  const current = buildTargetVectorsFromLegacy();
  const preRepair: TargetVector[] = current.map((t) => {
    const { rankingIdentity: _drop, ...rest } = t;
    void _drop;
    return { ...rest, cigSlug: PRE_REPAIR_MAP[t.legacySlug] };
  });
  // Corpus: the personas plus every pairwise mix of two personas' answers.
  const corpus: Array<{ id: string; answers: AnswerMap }> = testPersonas.map((p) => ({
    id: p.id,
    answers: p.answers,
  }));
  for (const a of testPersonas) {
    for (const b of testPersonas) {
      if (a.id === b.id) continue;
      const mixed: AnswerMap = {};
      const keys = [...new Set([...Object.keys(a.answers), ...Object.keys(b.answers)])].sort();
      keys.forEach((k, i) => {
        const v = i % 2 === 0 ? a.answers[k] : b.answers[k];
        if (v !== undefined) mixed[k] = v;
      });
      corpus.push({ id: `${a.id}+${b.id}`, answers: mixed });
    }
  }
  const project = (r: ReturnType<typeof computeEngineResultV1>) => ({
    careerProfile: r.careerProfile,
    familyRanking: r.familyRanking,
    matches: r.matches.map((m: Match) => ({
      professionKey: m.professionKey,
      legacySlug: m.legacySlug,
      family: m.family,
      currentFit: m.currentFit,
      potential: m.potential,
      confidence: m.confidence,
      gatePassed: m.gatePassed,
      regulated: m.regulated,
      strongestDimensions: m.strongestDimensions,
      developmentAreas: m.developmentAreas,
    })),
  });
  let compared = 0;
  let differing = 0;
  for (const c of corpus) {
    for (const topN of [1, 2, 3, 4, 5]) {
      const before = computeEngineResultV1({
        answers: c.answers,
        targets: preRepair,
        options: { topN, now: fixedClock },
      });
      const after = computeEngineResultV1({
        answers: c.answers,
        targets: current,
        options: { topN, now: fixedClock },
      });
      compared += 1;
      if (JSON.stringify(project(before)) !== JSON.stringify(project(after))) {
        differing += 1;
        if (differing <= 5) {
          console.error(
            `  DIFF ${c.id} topN=${topN}\n    before: ${before.matches.map((m: Match) => m.professionKey).join(",")}\n    after:  ${after.matches.map((m: Match) => m.professionKey).join(",")}`,
          );
        }
      }
    }
  }
  assert(
    differing === 0,
    `${differing} of ${compared} ranked outputs differ from the pre-repair engine`,
  );
  console.log(`  ${compared} ranked outputs compared (${corpus.length} answer sets x topN 1..5)`);

  // The jobs profile never reads the bridge at all: one score per scored
  // profession, keyed by legacy slug, regardless of enrichment.
  const profile = buildCareerProfileForJobs(testPersonas[0].answers);
  assert(
    JSON.stringify(Object.keys(profile.slugScores).sort()) ===
      JSON.stringify([...scoredIds].sort()),
    "profile-for-jobs slugScores must cover every scored profession",
  );
}

// ═══════════════════════════════════════════════════════════════════════
section("E. reverse / job relevance contract");
{
  type JobLike = { profession_slug: string | null; family_id: string | null };
  let checks = 0;
  for (const persona of testPersonas) {
    const profile = buildCareerProfileForJobs(persona.answers);
    const expectFamilyOnly = (job: JobLike, why: string) => {
      const legacy = legacySlugForJob(job, profile);
      const rel = relevanceForJob(job, profile);
      assert(
        legacy === null,
        `${persona.id}: ${job.profession_slug} resolved to ${legacy} (${why})`,
      );
      assert(
        rel.basis === "family" && !rel.hasProfessionMatch,
        `${persona.id}: ${job.profession_slug} basis ${rel.basis} (${why})`,
      );
      checks += 1;
    };
    const expectProfession = (job: JobLike, legacyExpected: string) => {
      const legacy = legacySlugForJob(job, profile);
      const rel = relevanceForJob(job, profile);
      assert(
        legacy === legacyExpected,
        `${persona.id}: ${job.profession_slug} resolved to ${legacy}, expected ${legacyExpected}`,
      );
      assert(
        rel.basis === "profession" && rel.hasProfessionMatch,
        `${persona.id}: ${job.profession_slug} basis ${rel.basis}`,
      );
      checks += 1;
    };

    // Rejected proxies: a job posted under them must NOT borrow the
    // profession that used to be attached, and must still get family-level
    // guidance rather than nothing.
    expectFamilyOnly(
      { profession_slug: "flygplatssakerhet", family_id: "critical_infrastructure_security" },
      "airport security is not data-centre security",
    );
    expectFamilyOnly(
      { profession_slug: "civil-utredare", family_id: "investigations_intelligence" },
      "police civilian investigator is not fraud investigator",
    );
    expectFamilyOnly(
      { profession_slug: "polisutredare", family_id: "investigations_intelligence" },
      "police investigator is not fraud investigator",
    );
    expectFamilyOnly(
      { profession_slug: "polis-intel-analytiker", family_id: "investigations_intelligence" },
      "police intel analyst is not intelligence analyst",
    );
    // The formerly shared nodes resolve to their EXACT profession only.
    expectProfession(
      { profession_slug: "sakerhetsutredare", family_id: "investigations_intelligence" },
      "security-investigator",
    );
    expectProfession(
      { profession_slug: "sakerhetssamordnare", family_id: "security_leadership_governance" },
      "security-coordinator",
    );
    // Every exact / alias bridge resolves in reverse.
    for (const [legacy, exp] of Object.entries(EXPECTED_BRIDGE)) {
      expectProfession({ profession_slug: exp.cig, family_id: null }, legacy);
    }
    // Dev-seed shape: a job that already carries the legacy slug still resolves.
    expectProfession(
      { profession_slug: "data-center-security", family_id: null },
      "data-center-security",
    );
    // Unknown slug: family guidance if the family is known, else nothing.
    expectFamilyOnly(
      { profession_slug: "no-such-profession", family_id: "protective_operations" },
      "unknown slug",
    );
    const none = relevanceForJob(
      { profession_slug: "no-such-profession", family_id: null },
      profile,
    );
    assert(
      none.basis === "none" && !none.hasProfessionMatch,
      `${persona.id}: unknown job must be basis none`,
    );
    checks += 1;
    // Invariant: whatever a job resolves to, that profession's own CIG slug
    // is the job's slug (or the job used the legacy slug directly).
    for (const slug of [
      "flygplatssakerhet",
      "civil-utredare",
      "sakerhetsutredare",
      "sakerhetssamordnare",
      "vaktare",
      "livvakt",
      "personskyddsvakt",
    ]) {
      const legacy = legacySlugForJob({ profession_slug: slug }, profile);
      if (legacy) {
        assert(
          toCigSlug(legacy) === slug || legacy === slug,
          `${persona.id}: job ${slug} resolved to ${legacy} whose node is ${toCigSlug(legacy)}`,
        );
      }
      checks += 1;
    }
  }
  console.log(`  ${checks} job relevance checks`);
}

// ═══════════════════════════════════════════════════════════════════════
section("F. honest UX: no raw id, no foreign title, neutral copy in both languages");
{
  assert(
    enrichmentUnavailableCopy.sv === "Yrkesinformationen kompletteras." &&
      enrichmentUnavailableCopy.en === "Profession information is being completed.",
    "neutral copy changed",
  );
  const base = buildTargetVectorsFromLegacy();
  const unavailableTargets = base.filter((t) => isEnrichmentUnavailable(t.legacySlug));
  assert(
    unavailableTargets.length === 4,
    `expected 4 unavailable targets, got ${unavailableTargets.length}`,
  );
  const personaA = testPersonas[0];
  const noNode = computeEngineResultV1({
    answers: personaA.answers,
    targets: unavailableTargets,
    options: { topN: 3, now: fixedClock },
  });
  assert(
    noNode.matches.length === 3,
    `expected 3 matches without a node, got ${noNode.matches.length}`,
  );
  assert(noNode.dataStatus === "cig_enrichment_missing", `dataStatus ${noNode.dataStatus}`);
  const rawIds = Object.keys(EXPECTED_UNAVAILABLE);
  // The airport-security and police-investigator node titles (both
  // languages and slug), plus technical leaks. "flygplatser" is NOT in this
  // list on purpose: the critical-infrastructure family description
  // legitimately names airports alongside data centres.
  const foreign = [
    "Säkerhetskontrollant flygplats",
    "Airport Security Officer",
    "flygplatssakerhet",
    "Civil utredare",
    "Civilian Investigator",
    "civil-utredare",
  ];
  const technical = /\b(undefined|null|NaN)\b/;

  for (const lang of ["sv", "en"] as const) {
    const html = renderToStaticMarkup(
      <EngineResultView result={noNode} lang={lang} onRetake={() => {}} />,
    );
    const text = stripTags(html);
    for (const m of noNode.matches) {
      const title = professionTitleBi(m)[lang];
      const guide = getProfession(m.legacySlug);
      assert(
        title === guide?.[lang === "sv" ? "titleSv" : "titleEn"],
        `${m.legacySlug}: title is not the Career Center title (${title})`,
      );
      assert(
        text.includes(title),
        `[${lang}] result view does not show "${title}" for ${m.legacySlug}`,
      );
    }
    for (const id of rawIds)
      assert(!text.includes(id), `[${lang}] raw id "${id}" reached the candidate`);
    for (const f of foreign)
      assert(!text.includes(f), `[${lang}] foreign node text "${f}" reached the candidate`);
    assert(!technical.test(text), `[${lang}] technical text reached the candidate`);
    const copies = text.split(enrichmentUnavailableCopy[lang]).length - 1;
    assert(
      copies >= noNode.matches.length,
      `[${lang}] neutral copy shown ${copies} times for ${noNode.matches.length} node-less matches`,
    );
    assert(
      (html.match(/data-enrichment-unavailable/g) ?? []).length >= noNode.matches.length,
      `[${lang}] per-profession unavailable marker missing`,
    );
    const employer = stripTags(
      renderToStaticMarkup(
        <EmployerReportView
          result={noNode}
          lang={lang}
          completedAt={NOW}
          assessmentVersionLabel="v1"
        />,
      ),
    );
    const primaryTitle = professionTitleBi(noNode.matches[0])[lang];
    assert(
      employer.includes(primaryTitle),
      `[${lang}] employer report does not name "${primaryTitle}"`,
    );
    for (const id of rawIds)
      assert(!employer.includes(id), `[${lang}] employer report leaks raw id "${id}"`);
  }

  // A bridged profession whose CIG read failed (empty bundle) still shows
  // its Career Center title, and shows NO "unavailable" copy because it
  // does have a canonical node.
  const officer = base.filter((t) => t.legacySlug === "security-officer");
  const bridgedEmpty = computeEngineResultV1({
    answers: personaA.answers,
    targets: officer,
    options: { topN: 1, now: fixedClock },
  });
  const textSv = stripTags(
    renderToStaticMarkup(<EngineResultView result={bridgedEmpty} lang="sv" onRetake={() => {}} />),
  );
  assert(
    textSv.includes("Väktare"),
    "bridged profession with empty enrichment must show its guide title",
  );
  assert(!textSv.includes("security-officer"), "bridged profession must not show its raw id");
  assert(
    !textSv.includes(enrichmentUnavailableCopy.sv),
    "bridged profession must not be labelled node-less",
  );

  // A bridged profession WITH enrichment shows the canonical CIG title.
  const bridgedFull = computeEngineResultV1({
    answers: personaA.answers,
    targets: officer,
    enrichmentByLegacySlug: {
      "security-officer": {
        cigSlug: "vaktare",
        titleSv: "Väktare (CIG)",
        titleEn: "Security Officer (CIG)",
        disclaimer: null,
        formalRequirements: [],
        relatedProfessions: [],
        transitions: [],
        educationPathways: [],
        certifications: [],
        sources: [],
        sourceCoverage: 0,
      },
    },
    options: { topN: 1, now: fixedClock },
  });
  const textEn = stripTags(
    renderToStaticMarkup(<EngineResultView result={bridgedFull} lang="en" onRetake={() => {}} />),
  );
  assert(textEn.includes("Security Officer (CIG)"), "canonical CIG title must win when present");
}

// ═══════════════════════════════════════════════════════════════════════
section("G. Career Discovery's bridge and approved_for_ranking are untouched and agree");
{
  const cd = cdBridge();
  const expectedCd: Record<string, string> = {
    SP001: "vaktare",
    SP002: "ordningsvakt",
    SP003: "skyddsvakt",
    SP004: "personskyddsvakt",
    SP005: "polis",
    SP006: "sakerhetssamordnare",
    SP007: "sakerhetschef",
    SP008: "soc-analytiker",
    SP009: "cybersakerhetsanalytiker",
    SP010: "sakerhetsutredare",
    SP011: "risk-manager",
    SP012: "krisberedskapssamordnare",
    SP013: "aml-specialist",
    SP014: "sakerhetstekniker",
    SP015: "butikskontrollant",
    SP016: "larmoperator",
    SP017: "sakerhetsreceptionist",
    SP018: "installator-larm",
  };
  assert(cd.size === 18, `cd_professions parse: ${cd.size} rows`);
  for (const [id, cig] of Object.entries(expectedCd)) {
    assert(cd.get(id)?.cig === cig, `${id} cig_profession_slug ${cd.get(id)?.cig} != ${cig}`);
    assert(cd.get(id)?.approved === false, `${id} must be inserted unapproved`);
  }
  const approved = [...cdApprovedSet()].sort();
  assert(
    JSON.stringify(approved) ===
      JSON.stringify(
        Object.keys(expectedCd)
          .filter((id) => id <= "SP014")
          .sort(),
      ),
    `approved_for_ranking set changed: ${approved.join(",")}`,
  );
  // No migration beyond the known set touches the CD bridge or approval.
  const dir = path.join(ROOT, "supabase/migrations");
  const touching = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => {
      const src = readFileSync(path.join(dir, f), "utf8");
      return src.includes("cd_professions") && /approved_for_ranking|cig_profession_slug/.test(src);
    })
    .sort();
  const known = [
    "20260730090000_career_discovery_v3_1_schema.sql",
    "20260730110000_career_discovery_v3_1_completion.sql",
    "20260731054144_3d28abeb-16ff-4324-b3b5-51897f2e0ac8.sql",
    "20260731054640_7c8e5c25-8fdc-4930-b9ef-d4e0f3e177ae.sql",
    "20260814171100_cd_profession_layer4_content_fields.sql",
    "20260814180000_cd_layer4_first_wave_professions.sql",
    "20260815120000_cd_profession_rationale_softening.sql",
    "20260816190000_cd_v31_activate_first_wave_professions.sql",
    "20260818100000_cd_ranking_guard_per_match.sql",
    "20260912090000_cd_ranking_guard_recommendation.sql",
    "20260913092000_cig_security_leadership_professions.sql",
    "20261006090000_cd_layer4_entry_gap_professions.sql",
  ];
  assert(
    JSON.stringify(touching) === JSON.stringify(known),
    `a migration outside the known set touches cd_professions bridge/approval: ${touching.filter((f) => !known.includes(f)).join(",")}`,
  );

  // Agreement: where Career Discovery and this bridge both name a node for
  // the same profession, they name the same one.
  const agree: Array<[string, string]> = [
    ["SP001", "security-officer"],
    ["SP002", "ordningsvakt"],
    ["SP003", "skyddsvakt"],
    ["SP006", "security-coordinator"],
    ["SP007", "security-manager"],
    ["SP008", "soc-analyst"],
    ["SP010", "security-investigator"],
    ["SP011", "risk-manager"],
    ["SP012", "crisis-continuity-manager"],
    ["SP013", "aml-specialist"],
    ["SP014", "security-technician"],
  ];
  for (const [id, legacy] of agree) {
    assert(
      cd.get(id)?.cig === toCigSlug(legacy),
      `${id} (${legacy}) disagrees: cd ${cd.get(id)?.cig} vs bridge ${toCigSlug(legacy)}`,
    );
  }
  // The ONE documented disagreement: close-protection -> livvakt here,
  // Close Protection Officer -> personskyddsvakt in Career Discovery. Kept
  // as an alias (the CIG catalogue declares them aliases sharing one formal
  // requirement) and reported for consolidation; the rationale must say so.
  const cp = CAREER_PROFESSION_BRIDGE.find((e) => e.legacySlug === "close-protection");
  assert(cd.get("SP004")?.cig === "personskyddsvakt", "SP004 expected personskyddsvakt");
  assert(
    cp?.classification === "acceptable_alias" && /personskyddsvakt/.test(cp.rationale),
    "close-protection alias must document the Career Discovery disagreement",
  );
  // Neither Career Discovery row that the collisions shared points anywhere
  // this bridge sends a DIFFERENT profession.
  for (const [, row] of cd) {
    const legacy = toLegacySlug(row.cig);
    if (!legacy) continue;
    const guide = getProfession(legacy);
    assert(!!guide, `cd node ${row.cig} resolves to ${legacy} with no Career Center guide`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\n----");
if (failed === 0) {
  console.log(`career-profession-bridge: PASS (${passed} assertions)`);
  process.exit(0);
} else {
  console.log(`career-profession-bridge: FAILED (${failed} of ${passed + failed} assertions)`);
  process.exit(1);
}
