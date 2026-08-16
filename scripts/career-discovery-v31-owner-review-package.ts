// Owner Review Package generator (Strategic Priority Update, 2026-08-15).
//
// Produces a single, self-contained HTML page rendering REAL computed
// output of the production engine (professions.ts's matchProfessionsDiagnostics,
// patterns.ts's resolvePatterns, career-areas.ts's rankCareerAreas) for 7
// golden personas, plus a profession-by-profession calibration review of
// all 14 first-wave professions — so the owner can review visually without
// reading code, SQL, or CLI output.
//
// ── WHAT THIS IS AND IS NOT ──────────────────────────────────────────────
//
// This is NOT a second, hand-authored copy of the product. Every number and
// sentence below comes from calling the exact same functions the production
// admin owner-preview route and public report path call
// (matchProfessionsDiagnostics, explainMatch, resolvePatterns,
// rankCareerAreas) against the same shared GOLDEN_PERSONAS fixture and the
// same FIRST_WAVE_CATALOG fixture already used by the regression suites.
//
// What is honestly NOT included, and disclosed as such in the page itself:
//   - Live CIG-sourced content (requirements/education/certifications/jobs)
//     — that requires a Supabase client this plain script does not have.
//     Verified separately, directly against the hosted project, earlier
//     this session (see v31-layer4-implementation-state.md).
//   - Real CIG transition edges for cigReachableSlugs — this script passes
//     an empty set rather than guess at slugs it cannot re-verify right
//     now, so pivot classification here uses the same-career-area fallback
//     only. The production path fetches real edges via
//     fetchCigReachableSlugs. This means a profession that IS a documented
//     next step in production could show here as "career pivot" instead —
//     a conservative-direction discrepancy, never the other way around.
//   - A rendered Career Card graphic (SVG) — CareerCard.tsx is a React
//     component; reproducing its exact visual output from a plain script
//     is out of scope for this pass. buildCareerCardData's underlying data
//     (indicators, stage label) IS shown, so the card's content is
//     verifiable even though its exact pixels are not.

import { writeFileSync } from "node:fs";
import { DIMENSION_IDS, DIMENSIONS, type DimensionId } from "../src/lib/career-discovery/v31/dimensions";
import { CAREER_AREAS, rankCareerAreas } from "../src/lib/career-discovery/v31/career-areas";
import { PATTERNS, resolvePatterns } from "../src/lib/career-discovery/v31/patterns";
import { explainMatch } from "../src/lib/career-discovery/v31/profession-explanations";
import {
  matchProfessionsDiagnostics,
  type ProfessionAffinityDiagnostic,
  type ProfessionMatch,
} from "../src/lib/career-discovery/v31/professions";
import type { Confidence, DimensionResult } from "../src/lib/career-discovery/v31/scoring";
import { GOLDEN_PERSONAS, type GoldenPersona } from "../src/lib/career-discovery/v31/golden-persona-fixtures";
import { FIRST_WAVE_CATALOG } from "./fixtures/first-wave-profession-catalog";

function makeDims(scores: Partial<Record<DimensionId, number | null>>): DimensionResult {
  const dimensions = Object.fromEntries(
    DIMENSION_IDS.map((id) => {
      const value = id in scores ? scores[id]! : null;
      return [
        id,
        {
          dimension: id,
          score: value,
          evidenceWeight: value === null ? 0 : 1.5,
          dominance: value === null ? null : 0.3,
          coverage: value === null ? 0 : 1,
          confidence: (value === null ? "none" : "high") as Confidence,
          sources: value === null ? [] : ["fixture"],
          tertiaryOnly: false,
        },
      ];
    }),
  ) as DimensionResult["dimensions"];
  return { scoringVersion: "owner-review-package", dimensions, answeredItems: [], complete: true };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const REQUESTED: readonly { id: string; label: string }[] = [
  { id: "student", label: "1. Student" },
  { id: "vaktare", label: "2. Väktare (1-3 years)" },
  { id: "experienced-vaktare", label: "3. Experienced Väktare (8+ years)" },
  { id: "sakerhetschef-senior", label: "4. Säkerhetschef / Head of Security (8+ years)" },
  { id: "experienced-coordinator", label: "5. Experienced Security Coordinator" },
  { id: "technical", label: "6. Technical" },
  { id: "investigation", label: "7. Investigation / Analysis" },
  { id: "broad-profile", label: "8. Broad" },
  { id: "sparse", label: "9. Sparse" },
];

const STAGE_CLASS: Record<string, string> = {
  explore_now: "pill-explore",
  possible_next_step: "pill-next",
  longer_term: "pill-longer",
  career_pivot: "pill-pivot",
};
const STAGE_TEXT: Record<string, string> = {
  explore_now: "Explore now",
  possible_next_step: "Possible next step",
  longer_term: "Longer-term direction",
  career_pivot: "Career pivot",
};

function matchRow(m: ProfessionMatch, diag: ProfessionAffinityDiagnostic | undefined): string {
  const explanation = explainMatch(m, "en");
  return `
    <div class="match-card">
      <div class="match-head">
        <div>
          <span class="match-title">${esc(m.titleEn)}</span>
          <span class="pill ${STAGE_CLASS[m.stage]}">${STAGE_TEXT[m.stage]}</span>
          ${diag?.isCurrentProfession ? `<span class="pill pill-amber">YOU ARE HERE</span>` : ""}
          <span class="pill pill-muted">${m.fitTier === "strong" ? "Strong match" : "Worth exploring"}</span>
        </div>
        <span class="mono muted">${m.professionId}</span>
      </div>
      <p class="rationale">${esc(explanation.rationale)}</p>
      <p class="stage-sentence muted">${esc(explanation.stageSentence)}</p>
      ${explanation.alignedDimensionNames.length > 0 ? `<p class="aligned"><strong>Aligned:</strong> ${esc(explanation.alignedDimensionNames.join(" · "))}</p>` : ""}
      ${diag
        ? `<table class="diag-table">
            <tr><th colspan="4">Profession Affinity (Career DNA only)</th><th colspan="3">Recommendation Priority (context-aware)</th></tr>
            <tr>
              <td>Fit score</td><td>Central fit</td><td>Supporting fit</td><td>Central coverage</td>
              <td>Context bonus</td><td>CIG pathway bonus</td><td>Priority score</td>
            </tr>
            <tr class="mono">
              <td>${diag.fitScore}</td>
              <td>${diag.centralFitScore ?? "—"}</td>
              <td>${diag.supportingFitScore ?? "—"}</td>
              <td>${diag.centralCoverage !== null ? Math.round(diag.centralCoverage * 100) + "%" : "—"}</td>
              <td>${diag.contextPriorityBonus > 0 ? "+" + diag.contextPriorityBonus : "—"}</td>
              <td>${diag.cigPathwayBonus > 0 ? "+" + diag.cigPathwayBonus : "—"}</td>
              <td><strong>${diag.priorityScore}</strong></td>
            </tr>
          </table>`
        : ""}
    </div>`;
}

function personaSection(persona: GoldenPersona, label: string): string {
  const dims = makeDims(persona.dims);
  const patterns = resolvePatterns(dims);
  const areas = rankCareerAreas(dims);
  const diagnostics = matchProfessionsDiagnostics(
    dims,
    FIRST_WAVE_CATALOG,
    persona.contextStatus,
    persona.currentProfessionCigSlug ?? null,
    [],
    new Set(),
    persona.experienceBand ?? null,
  );
  const result = diagnostics.result;
  const diagById = new Map(diagnostics.diagnostics.map((d) => [d.professionId, d]));

  const leadingName = patterns.leading ? PATTERNS[patterns.leading].name.en : "Balanced profile (no single dominant pattern)";
  const currentProfessionEntry = persona.currentProfessionCigSlug
    ? FIRST_WAVE_CATALOG.find((c) => c.cigProfessionSlug === persona.currentProfessionCigSlug)
    : undefined;

  const nextStepMatches = result.available ? result.matches.filter((m) => m.stage === "possible_next_step") : [];
  const exploreNowMatches = result.available ? result.matches.filter((m) => m.stage === "explore_now") : [];

  const pathwaySteps: { eyebrow: string; body: string }[] = [];
  if (currentProfessionEntry) {
    pathwaySteps.push({ eyebrow: "YOU ARE HERE", body: currentProfessionEntry.titleEn });
    if (nextStepMatches.length > 0) {
      pathwaySteps.push({ eyebrow: "POSSIBLE NEXT STEP", body: nextStepMatches.map((m) => m.titleEn).join(" · ") });
    }
    if (result.available && result.currentProfessionMatch) {
      pathwaySteps.push({ eyebrow: "DEVELOP", body: "Develop in your current role" });
    }
    if (result.available && result.longerTermPossibilities.length > 0) {
      pathwaySteps.push({ eyebrow: "LONGER TERM", body: result.longerTermPossibilities.map((m) => m.titleEn).join(" · ") });
    }
  } else {
    pathwaySteps.push({ eyebrow: "STARTING POINT", body: "Unknown current profession — never guessed from Career DNA (item 2)" });
    if (exploreNowMatches.length > 0) {
      pathwaySteps.push({ eyebrow: "EXPLORE NOW", body: exploreNowMatches.map((m) => m.titleEn).join(" · ") });
    }
    if (result.available && result.longerTermPossibilities.length > 0) {
      pathwaySteps.push({ eyebrow: "DEVELOP", body: result.longerTermPossibilities.map((m) => m.titleEn).join(" · ") });
    }
  }

  return `
  <section class="persona" id="persona-${persona.id}">
    <h2>${esc(label)} <span class="muted mono small">(${esc(persona.name.en)})</span></h2>

    <div class="grid-2">
      <div class="card">
        <h3>Career DNA</h3>
        <p><strong>${esc(leadingName)}</strong></p>
        <p class="muted">${patterns.balanced ? "Balanced — several equally strong ways of working, no single dominant pattern." : `Supporting patterns: ${patterns.supporting.map((p) => PATTERNS[p].name.en).join(", ") || "none"}`}</p>
        <p class="muted small">Top career areas: ${areas.ranked.slice(0, 3).map((a) => esc(CAREER_AREAS[a.areaId].name.en)).join(" · ")}</p>
      </div>
      <div class="card">
        <h3>Context</h3>
        <p>C1 status: <span class="mono">${persona.contextStatus}</span></p>
        <p>Current profession: ${currentProfessionEntry ? `<strong>${esc(currentProfessionEntry.titleEn)}</strong> <span class="muted small">(self-reported, not inferred)</span>` : `<span class="muted">Unknown — not reported</span>`}</p>
      </div>
    </div>

    <h3>Possible path</h3>
    <div class="pathway">
      ${pathwaySteps.map((s, i) => `<div class="path-step"><div class="path-eyebrow">${esc(s.eyebrow)}</div><div class="path-body">${esc(s.body)}</div></div>${i < pathwaySteps.length - 1 ? '<div class="path-arrow">→</div>' : ""}`).join("")}
    </div>

    <h3>Recommendations</h3>
    ${!result.available
      ? `<p class="empty-note">No professions cleared matching for this profile — shown honestly as unavailable, not padded with weak matches.</p>`
      : `
        ${result.currentProfessionMatch ? `<h4 class="tier-heading">Develop in your current role</h4>${matchRow(result.currentProfessionMatch, diagById.get(result.currentProfessionMatch.professionId))}` : ""}
        ${result.strongestDirections.length > 0 ? `<h4 class="tier-heading">Strongest directions</h4>${result.strongestDirections.map((m) => matchRow(m, diagById.get(m.professionId))).join("")}` : ""}
        ${result.alsoWorthExploring.length > 0 ? `<h4 class="tier-heading">Also worth exploring</h4>${result.alsoWorthExploring.map((m) => matchRow(m, diagById.get(m.professionId))).join("")}` : ""}
        ${result.longerTermPossibilities.length > 0 ? `<h4 class="tier-heading">Longer-term possibilities</h4>${result.longerTermPossibilities.map((m) => matchRow(m, diagById.get(m.professionId))).join("")}` : ""}
        ${result.careerPivots.length > 0 ? `<h4 class="tier-heading">Career pivot — real affinity, different direction</h4>${result.careerPivots.map((m) => matchRow(m, diagById.get(m.professionId))).join("")}` : ""}
      `}
  </section>`;
}

function professionCard(entry: (typeof FIRST_WAVE_CATALOG)[number]): string {
  const central = entry.bands.filter((b) => b.centrality === "central");
  const supporting = entry.bands.filter((b) => b.centrality === "supporting");
  const bandRow = (b: (typeof entry.bands)[number]) =>
    `<li><span class="mono">${b.dimensionId}</span> ${esc(DIMENSIONS[b.dimensionId].name.en)} — band ${b.bandLow.toFixed(2)}–${b.bandHigh.toFixed(2)}, weight ${b.weight.toFixed(2)}</li>`;
  return `
    <div class="prof-card" id="prof-${entry.professionId}">
      <div class="prof-head">
        <h3>${esc(entry.titleEn)}</h3>
        <span class="mono muted">${entry.professionId} · ${esc(entry.cigProfessionSlug ?? "no CIG link")}</span>
      </div>
      <p class="muted small">Career level: <span class="mono">${entry.careerStage}</span> · Career area: <span class="mono">${entry.careerAreaId}</span> · Entry role: ${entry.entryRole ? "yes" : "no"} · Regulated: ${entry.regulated ? "yes" : "no"}</p>
      <p>${esc(entry.inclusionRationaleEn)}</p>
      ${entry.limitationNoteEn ? `<p class="limitation">⚠ ${esc(entry.limitationNoteEn)}</p>` : ""}
      <div class="grid-2">
        <div>
          <p class="label">Defining (central) signals</p>
          <ul>${central.map(bandRow).join("")}</ul>
        </div>
        <div>
          <p class="label">Supporting signals</p>
          <ul>${supporting.map(bandRow).join("")}</ul>
        </div>
      </div>
    </div>`;
}

const personaSections = REQUESTED.map(({ id, label }) => {
  const persona = GOLDEN_PERSONAS.find((p) => p.id === id);
  if (!persona) throw new Error(`Persona ${id} not found in GOLDEN_PERSONAS`);
  return personaSection(persona, label);
}).join("\n");

const professionSections = FIRST_WAVE_CATALOG.map(professionCard).join("\n");

const navLinks = REQUESTED.map(({ id, label }) => `<a href="#persona-${id}">${esc(label)}</a>`).join("");
const profNavLinks = FIRST_WAVE_CATALOG.map((e) => `<a href="#prof-${e.professionId}">${e.professionId}</a>`).join(" ");

const generatedAt = new Date().toISOString();

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Career Intelligence Ledger</title>
<style>
  :root {
    --bg:#f4f2ec; --surface:#ffffff; --surface-2:#faf8f2; --border:#e2ddd0;
    --ink:#15181b; --muted:#66695f; --muted-2:#8a8d80;
    --accent:#0c6b52; --accent-soft:#0c6b5214; --accent-ink:#08402f;
    --warn:#93650f; --warn-soft:#93650f16;
    --pivot:#743a74; --pivot-soft:#743a7414;
    --longer:#4a5568; --longer-soft:#4a556814;
    --shadow: 0 1px 2px rgba(20,20,10,.04), 0 8px 24px -12px rgba(20,20,10,.10);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg:#12151a; --surface:#1a1e24; --surface-2:#1f242b; --border:#2c323b;
      --ink:#eef0ee; --muted:#a3a89b; --muted-2:#7d8277;
      --accent:#3fcda0; --accent-soft:#3fcda01f; --accent-ink:#bdf3dc;
      --warn:#e5b256; --warn-soft:#e5b25620;
      --pivot:#d492d4; --pivot-soft:#d492d420;
      --longer:#a9b2c4; --longer-soft:#a9b2c41f;
      --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px -12px rgba(0,0,0,.5);
    }
  }
  :root[data-theme="dark"] {
    --bg:#12151a; --surface:#1a1e24; --surface-2:#1f242b; --border:#2c323b;
    --ink:#eef0ee; --muted:#a3a89b; --muted-2:#7d8277;
    --accent:#3fcda0; --accent-soft:#3fcda01f; --accent-ink:#bdf3dc;
    --warn:#e5b256; --warn-soft:#e5b25620;
    --pivot:#d492d4; --pivot-soft:#d492d420;
    --longer:#a9b2c4; --longer-soft:#a9b2c41f;
    --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px -12px rgba(0,0,0,.5);
  }
  * { box-sizing: border-box; }
  html { text-size-adjust: 100%; }
  body {
    font-family: ui-sans-serif, "Segoe UI", -apple-system, Helvetica, Arial, sans-serif;
    background: var(--bg); color: var(--ink); margin:0; padding:0 0 96px;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent); }
  a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  h1, h2, h3, h4 { font-family: ui-serif, Georgia, "Times New Roman", serif; text-wrap: balance; letter-spacing: -0.01em; }
  header.masthead {
    background: linear-gradient(180deg, var(--accent-ink), var(--accent-ink) 60%, var(--ink));
    color: #f4f2ec; padding: 36px 32px 30px; border-bottom: 1px solid var(--border);
  }
  header.masthead .kicker { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; letter-spacing:.12em; text-transform:uppercase; opacity:.7; margin:0 0 10px; }
  header.masthead h1 { margin:0 0 8px; font-size:28px; font-weight:600; }
  header.masthead p.meta { margin:0; font-size:13px; opacity:.75; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .banner {
    background: var(--warn-soft); border-bottom:1px solid var(--border); color: var(--warn);
    padding:11px 32px; font-size:13px; font-weight:600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  nav.toc {
    background: var(--surface); border-bottom:1px solid var(--border); padding:12px 32px;
    position:sticky; top:0; z-index:10; font-size:13px; display:flex; flex-wrap:wrap; gap:2px 16px;
  }
  nav.toc a { text-decoration:none; font-weight:600; color: var(--ink); }
  nav.toc a:hover { color: var(--accent); }
  main { max-width:1040px; margin:0 auto; padding:36px 32px 0; }
  section.persona {
    background: var(--surface); border:1px solid var(--border); border-radius:14px;
    padding:26px 30px; margin-bottom:30px; box-shadow: var(--shadow);
  }
  section.persona h2 { margin:0 0 4px; font-size:21px; }
  h2#professions { font-size:22px; margin: 8px 0 4px; }
  h3 { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color: var(--muted); margin:22px 0 10px; font-weight:600; font-family: ui-sans-serif, sans-serif; }
  h4.tier-heading { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color: var(--accent); margin:20px 0 9px; font-weight:700; font-family: ui-sans-serif, sans-serif; }
  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width: 640px) { .grid-2 { grid-template-columns:1fr; } }
  .card { background: var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:14px 16px; }
  .muted { color: var(--muted); }
  .small { font-size:12px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }
  .pathway { display:flex; flex-wrap:wrap; align-items:stretch; gap:0; margin-bottom:8px; }
  .path-step { flex:1; min-width:160px; background: var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:12px 14px; }
  .path-eyebrow { font-size:10px; font-weight:700; letter-spacing:.08em; color: var(--accent); text-transform:uppercase; }
  .path-body { font-size:13.5px; margin-top:4px; }
  .path-arrow { display:flex; align-items:center; justify-content:center; padding:0 8px; color: var(--muted-2); font-family: ui-monospace, monospace; }
  .match-card { border:1px solid var(--border); border-radius:10px; padding:15px 17px; margin-bottom:10px; background: var(--surface); }
  .match-head { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; }
  .match-title { font-weight:700; margin-right:8px; font-family: ui-serif, Georgia, serif; font-size:15px; }
  .pill { display:inline-block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:3px 9px; border-radius:999px; margin-right:6px; }
  .pill-muted { background: var(--surface-2); color: var(--muted); border:1px solid var(--border); }
  .pill-amber { background: var(--warn-soft); color: var(--warn); }
  .pill-explore { background: var(--accent-soft); color: var(--accent-ink); }
  .pill-next { background: var(--warn-soft); color: var(--warn); }
  .pill-longer { background: var(--longer-soft); color: var(--longer); }
  .pill-pivot { background: var(--pivot-soft); color: var(--pivot); }
  .rationale { margin:9px 0 4px; font-size:13.5px; line-height:1.5; max-width:65ch; }
  .stage-sentence { font-size:12.5px; margin:0 0 6px; color: var(--muted); line-height:1.5; max-width:65ch; }
  .aligned { font-size:12.5px; margin:0 0 8px; }
  .empty-note { font-style:italic; color: var(--muted); }
  table.diag-table { width:100%; border-collapse:collapse; font-size:11px; margin-top:9px; }
  table.diag-table th, table.diag-table td { border:1px solid var(--border); padding:5px 7px; text-align:center; }
  table.diag-table th { background: var(--surface-2); font-weight:600; text-transform:uppercase; font-size:9px; letter-spacing:.04em; color: var(--muted); }
  table.diag-table td { font-variant-numeric: tabular-nums; }
  .prof-card { background: var(--surface); border:1px solid var(--border); border-radius:14px; padding:22px 26px; margin-bottom:18px; box-shadow: var(--shadow); }
  .prof-head { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:6px; }
  .prof-head h3 { margin:0; font-size:17px; text-transform:none; letter-spacing:0; color: var(--ink); font-family: ui-serif, Georgia, serif; font-weight:600; }
  .label { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color: var(--muted); margin:0 0 5px; }
  ul { margin:0; padding-left:18px; font-size:12.5px; }
  li { margin-bottom:4px; }
  .limitation { background: var(--warn-soft); border:1px solid var(--border); border-radius:8px; padding:9px 11px; font-size:12.5px; color: var(--warn); }
  footer { max-width:1040px; margin:0 auto; padding:28px 32px 0; color: var(--muted-2); font-size:11.5px; font-family: ui-monospace, monospace; }
  .disclosure { background: var(--surface); border:1px solid var(--border); border-radius:14px; padding:20px 24px; font-size:13.5px; margin-bottom:28px; box-shadow: var(--shadow); }
  .disclosure h3 { margin-top:0; color: var(--ink); font-size:13px; }
  .disclosure ul { font-size:13px; line-height:1.55; }
  .disclosure li { margin-bottom:6px; }
  ::selection { background: var(--accent-soft); }
  @media (prefers-reduced-motion: no-preference) { a { transition: color .12s ease; } }
</style>
</head>
<body>
<header class="masthead">
  <p class="kicker">Security Career Discovery · v3.1 · Layer 4</p>
  <h1>Career Intelligence Ledger</h1>
  <p class="meta">generated ${generatedAt} · engine output computed live from production code — nothing hand-authored to look good</p>
</header>
<div class="banner">approved_for_ranking = false for all 14 professions — unchanged by this review. Visual review only; nothing here activates ranking.</div>
<nav class="toc">${navLinks} <span class="muted">·</span> <a href="#professions">Profession calibration review</a></nav>
<main>
  <div class="disclosure">
    <h3>What this ledger is, and its honest limits</h3>
    <p>Every number and sentence below is computed by calling the exact production functions (<span class="mono">matchProfessionsDiagnostics</span>, <span class="mono">explainMatch</span>, <span class="mono">resolvePatterns</span>, <span class="mono">rankCareerAreas</span>) against the same shared golden-persona and first-wave-catalog fixtures the regression suites use.</p>
    <ul>
      <li><strong>Not included:</strong> live CIG-sourced requirements/education/certifications/jobs (needs a database connection this offline script does not have) — verified separately against the hosted project earlier this session.</li>
      <li><strong>Not included:</strong> real CIG transition edges — this run uses an empty set, so pivot classification falls back to same-career-area only. A profession that IS a documented next step in production could appear here as "career pivot" instead — a conservative-direction discrepancy only.</li>
      <li><strong>Not included:</strong> the actual Career Card SVG graphic — its underlying data (stage label, aligned dimensions) is verifiable above; the exact rendered pixels are not reproduced by this script.</li>
    </ul>
  </div>

  ${personaSections}

  <h2 id="professions">Profession calibration review — all 14 first-wave professions</h2>
  <p class="muted small mono">${profNavLinks}</p>
  ${professionSections}
</main>
<footer>
  <p>source: scripts/career-discovery-v31-owner-review-package.ts — regenerate with <span class="mono">bun run scripts/career-discovery-v31-owner-review-package.ts</span></p>
</footer>
</body>
</html>`;

const outPath = new URL("../docs/career-discovery/v31-owner-review-package.html", import.meta.url);
writeFileSync(outPath, html);
console.log(`Owner review package written to docs/career-discovery/v31-owner-review-package.html (${html.length} bytes)`);
