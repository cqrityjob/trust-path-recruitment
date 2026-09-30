/**
 * Negative controls for `career-center:check`.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────
 *
 * A guard that passes proves nothing on its own. It might be asserting a
 * tautology, reading a file that no longer exists, or checking a string that
 * was quietly renamed. The only evidence that a guard WORKS is watching it
 * fail on the defect it was written for.
 *
 * Each control below reintroduces one real defect — most of them defects that
 * were actually live on this branch at 47aeccb — runs the guard, and requires
 * it to fail with a message that names the right thing. Then it puts the file
 * back, byte for byte, and verifies the guard is green again.
 *
 * ── IT IS REVERSIBLE, AND IT PROVES IT ─────────────────────────────────
 *
 * Every file touched is read into memory first and rewritten from that exact
 * buffer afterwards, in a `finally`. The run ends by re-reading every touched
 * file and comparing it to the original bytes, so a control that crashed
 * halfway cannot leave a mutation behind and report success.
 *
 * Most controls are guarded by `career-center:check`. The saved-report
 * confidence and stage controls are guarded by `career-report-confidence:check`
 * and `career-report-stage:check`, which render the views that used to crash;
 * each control names its own guard.
 *
 * Run: bun run career-center:negative-controls
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dir, "..");
const abs = (p: string) => path.join(root, p);

interface Edit {
  readonly file: string;
  /** Exact text to replace, and what to replace it with. */
  readonly from: string;
  readonly to: string;
}

interface Control extends Edit {
  /** What defect this reintroduces. */
  readonly name: string;
  /** Further edits the same defect needs (an import it brings back). */
  readonly also?: readonly Edit[];
  /** The guard that must catch it. Defaults to career-center:check. */
  readonly guard?: string;
  /** A fragment the guard's failure output must contain. Asserting the
   *  MESSAGE, not merely a non-zero exit: a guard that fails for an unrelated
   *  reason is not evidence about this defect. */
  readonly expect: string;
}

const CAREER_CENTER_CHECK = "scripts/career-center-check.ts";
const CONFIDENCE_CHECK = "scripts/career-report-confidence-check.tsx";
const STAGE_CHECK = "scripts/career-report-stage-check.tsx";

const CONTROLS: readonly Control[] = [
  {
    name: 'a transition labelled "common" with no frequency evidence',
    file: "src/lib/career-center/career-paths.ts",
    from: `    from: "security-officer",
    to: "ordningsvakt",
    likelihood: "possible",`,
    to: `    from: "security-officer",
    to: "ordningsvakt",
    likelihood: "common",`,
    expect: "no transition-specific frequency evidence",
  },
  {
    name: "a placeholder edge promoted to reviewed without a source",
    file: "src/lib/career-center/career-paths.ts",
    from: `    to: "security-coordinator",
    likelihood: "possible",
    status: "placeholder",`,
    to: `    to: "security-coordinator",
    likelihood: "possible",
    status: "researched",
    lastVerified: "2026-09-08",
    countries: ["SE"],`,
    expect: "cites no source of its own",
  },
  {
    name: "the repealed Act 1980:578 back in active content",
    file: "src/lib/career-center/professions/researched.ts",
    from: `    sv: "Ordningsvakt är en särskild ställning enligt lagen (2023:421) om ordningsvakter.`,
    to: `    sv: "Ordningsvakt är en särskild ställning enligt lagen (1980:578) om ordningsvakter.`,
    expect: "1980:578",
  },
  {
    name: "the ordningsvakt minimum age back at 18",
    file: "src/lib/career-center/professions/researched.ts",
    from: `      sv: "Ha fyllt 20 år (9 § lagen [2023:421] om ordningsvakter).",`,
    to: `      sv: "Ha fyllt 18 år (9 § lagen [2023:421] om ordningsvakter).",`,
    expect: "minimum age of 20",
  },
  {
    name: 'skyddsvakt training set by "the protected object\'s requirements"',
    file: "src/lib/career-center/education.ts",
    from: `      sv: "Utbildning enligt Polismyndighetens föreskrifter (15 § skyddsförordningen), eller Försvarsmaktens föreskrifter för dess egen personal (14 §)",`,
    to: `      sv: "Utbildning enligt Polismyndighetens föreskrifter och skyddsobjektets krav",`,
    expect: "protected object's requirements",
  },
  {
    name: "ISO 31000 modelled as a personal certificate",
    file: "src/lib/career-center/certifications.ts",
    from: `    id: "iso-31000",
    credentialType: "standard",`,
    to: `    id: "iso-31000",
    credentialType: "personal_credential",`,
    expect: "must be modelled as a published standard",
  },
  {
    name: "Säkerhetschef listed as a direct direction out of Väktare",
    file: "src/lib/career-center/career-routes.ts",
    from: `    branches: ["ordningsvakt", "skyddsvakt", "security-coordinator"],`,
    to: `    branches: ["ordningsvakt", "skyddsvakt", "security-coordinator", "security-manager"],`,
    expect: "must not be a direction out of Väktare",
  },
  {
    name: "the routes section numbering its entries again",
    file: "src/components/career-center/CareerRoutes.tsx",
    from: `          {t("cc.routes.independent")}`,
    to: `          {t("cc.routes.stage")}`,
    expect: "independent",
  },
  {
    name: "pathFrom no longer stating where the current role came from",
    file: "src/components/career-center/PathFromSection.tsx",
    // The provenance line moved into the selector card with a saved /
    // temporary badge (journey work, 2026-09-26); the anchor names it.
    from: `                data-path-provenance={origin.provenance}\n`,
    to: `\n`,
    expect: "must state where the current role came from",
  },
  {
    name: "a formal requirement attached to an unregulated profession",
    file: "src/lib/career-center/education-links.ts",
    from: `    professionId: "security-coordinator",
    offerId: "iso-31000",
    kind: "certification",
    relevance: "recommended_development",`,
    to: `    professionId: "security-coordinator",
    offerId: "iso-31000",
    kind: "certification",
    relevance: "formal_requirement",`,
    expect: "only a regulated role may carry a formal requirement",
  },
  {
    name: "the education event and its unreachable schema coming back",
    file: "src/lib/career-center/analytics.ts",
    from: `  career_profession_opened: "profession_explored",
};`,
    to: `  career_profession_opened: "profession_explored",
  career_education_opened: "career_education_opened",
};`,
    expect: "must not return without a reachable caller",
  },

  // ── The simplified journey (2026-09-27) ─────────────────────────────
  //
  // The reported defect: a reader chose their profession, followed a link
  // onward, and landed in a search box and 29 filter chips. Each control
  // below brings one piece of that back.
  {
    name: "a way on that lands in a filtered catalogue again",
    file: "src/components/career-center/CatalogueProfession.tsx",
    from: `              hash="utforska-yrken"
              data-catalogue-all-professions`,
    to: `              search={{ all: true } as never}
              hash="utforska-yrken"
              data-catalogue-all-professions`,
    expect: "links to a filtered catalogue",
  },
  {
    name: "a search box back in the list of professions",
    file: "src/routes/career-center.index.tsx",
    from: `          <ul id="yrkeskatalog"`,
    to: `          <input type="search" aria-label="Sök" />
          <ul id="yrkeskatalog"`,
    expect: "no search box",
  },
  {
    name: "an old catalogue filter narrowing the list again",
    file: "src/lib/career-center/hub-search.ts",
    from: `  return from && isSelectableOrigin(from) ? { from } : {};`,
    to: `  if (typeof raw.level === "string") return { level: raw.level } as HubSearch;
  return from && isSelectableOrigin(from) ? { from } : {};`,
    expect: "must narrow nothing",
  },
  {
    name: "the current profession showing three next steps and a hop for the rest",
    file: "src/lib/career-center/career-origin.ts",
    from: `    directions,
    related: relatedGuides(profession, directions),`,
    to: `    directions: directions.slice(0, 3),
    related: relatedGuides(profession, directions),`,
    expect: "every recorded onward move",
  },
  {
    name: "a next-profession card that does not say where it goes",
    file: "src/components/career-center/NextProfessionCard.tsx",
    from: `        {t("cc.info.read").replace("{role}", title)}`,
    to: `        {t("cc.step.detail")}`,
    expect: "must say where it goes",
  },

  // ── A saved report's confidence word (career-report-confidence:check) ──
  //
  // An unknown word ("high", null, nothing) in a saved snapshot used to take
  // down the Career Center hub and the report view. Each control removes one
  // guard — or swaps in one of the two tempting wrong fixes — and the check
  // that renders the views must fail, for that reason.
  {
    name: "a saved report's unknown confidence passed straight through the read",
    file: "src/lib/professional-identity/career-direction.ts",
    from: `      confidence: readRecommendationConfidence(r.confidence),`,
    to: `      confidence: r.confidence,`,
    guard: CONFIDENCE_CHECK,
    expect: "deriveCareerDirection carries an unknown confidence as unavailable",
  },
  {
    name: "an entry with an unknown confidence dropped, promoting an alternative",
    file: "src/lib/professional-identity/career-direction.ts",
    from: `    .filter((r) => r && r.match && typeof r.match.titleSv === "string")`,
    to: `    .filter(
      (r) =>
        r &&
        r.match &&
        typeof r.match.titleSv === "string" &&
        readRecommendationConfidence(r.confidence) !== null,
    )`,
    guard: CONFIDENCE_CHECK,
    expect: "the first-ranked profession stays first",
  },
  {
    name: "an unknown confidence read as a real (weaker) word",
    file: "src/lib/career-discovery/v31/profession-explanations.ts",
    from: `  return isRecommendationConfidence(value) ? value : null;`,
    to: `  return isRecommendationConfidence(value) ? value : "indicative";`,
    guard: CONFIDENCE_CHECK,
    expect: "is read as unavailable, never as a known word",
  },
  {
    name: "the shared check accepting any string as a confidence",
    file: "src/lib/career-discovery/v31/profession-explanations.ts",
    from: `  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(RECOMMENDATION_CONFIDENCE_LABEL, value)
  );`,
    to: `  return typeof value === "string";`,
    guard: CONFIDENCE_CHECK,
    expect: '"high" is not a known confidence',
  },
  {
    name: "the Career Center indexing the label map with a saved value again",
    file: "src/components/career-center/PersonalDirection.tsx",
    from: `          {recommendationConfidenceLabel(item.confidence, locale)}`,
    to: `          {RECOMMENDATION_CONFIDENCE_LABEL[item.confidence as RecommendationConfidence][locale]}`,
    also: [
      {
        file: "src/components/career-center/PersonalDirection.tsx",
        from: `import { DIMENSIONS } from "@/lib/career-discovery/v31/dimensions";`,
        to: `import { DIMENSIONS } from "@/lib/career-discovery/v31/dimensions";
import { RECOMMENDATION_CONFIDENCE_LABEL } from "@/lib/career-discovery/v31/profession-explanations";
import type { RecommendationConfidence } from "@/lib/career-discovery/v31/professions";`,
      },
    ],
    guard: CONFIDENCE_CHECK,
    expect: "the Career Center renders a raw saved value without crashing",
  },
  {
    name: "the report view indexing the label map with a saved value again",
    file: "src/components/career-discovery/v31/RecommendedProfessions.tsx",
    from: `          {recommendationConfidenceLabel(entry.confidence, locale)}`,
    to: `          {RECOMMENDATION_CONFIDENCE_LABEL[entry.confidence][locale]}`,
    also: [
      {
        file: "src/components/career-discovery/v31/RecommendedProfessions.tsx",
        from: `  readRecommendationConfidence,
  recommendationConfidenceLabel,`,
        to: `  RECOMMENDATION_CONFIDENCE_LABEL,
  readRecommendationConfidence,
  recommendationConfidenceLabel,`,
      },
    ],
    guard: CONFIDENCE_CHECK,
    expect: "the report view renders without crashing",
  },
  {
    name: "the Career Card indexing the label map with a saved value again",
    file: "src/lib/career-discovery/v31/career-card.ts",
    from: `    confidenceLabel: recommendationConfidenceLabel(r.confidence, locale),`,
    to: `    confidenceLabel: RECOMMENDATION_CONFIDENCE_LABEL[r.confidence][locale],`,
    also: [
      {
        file: "src/lib/career-discovery/v31/career-card.ts",
        from: `import { professionStageLabel, recommendationConfidenceLabel } from "./profession-explanations";`,
        to: `import {
  professionStageLabel,
  RECOMMENDATION_CONFIDENCE_LABEL,
  recommendationConfidenceLabel,
} from "./profession-explanations";`,
      },
    ],
    guard: CONFIDENCE_CHECK,
    expect: "the Career Card builds without crashing",
  },

  // ── A saved report's stage (career-report-stage:check) ─────────────────
  //
  // The same defect on the stage: an unknown `match.stage` ("future", null,
  // nothing) took down the hub, the report view and its tier cards. Each
  // control removes one guard — or swaps in a tempting wrong fix — and the
  // check that renders the views must fail, for that reason.
  {
    name: "a saved report's unknown stage passed straight through the read",
    file: "src/lib/professional-identity/career-direction.ts",
    from: `      stage: readProfessionStage(r.match.stage),`,
    to: `      stage: typeof r.match.stage === "string" ? r.match.stage : null,`,
    guard: STAGE_CHECK,
    expect: "deriveCareerDirection carries an unknown stage as unavailable",
  },
  {
    name: "an entry with an unknown stage dropped, promoting an alternative",
    file: "src/lib/professional-identity/career-direction.ts",
    from: `    .filter((r) => r && r.match && typeof r.match.titleSv === "string")`,
    to: `    .filter(
      (r) =>
        r &&
        r.match &&
        typeof r.match.titleSv === "string" &&
        readProfessionStage(r.match.stage) !== null,
    )`,
    guard: STAGE_CHECK,
    expect: "the first-ranked profession stays first",
  },
  {
    name: 'an unknown stage read as a real one ("explore now")',
    file: "src/lib/career-discovery/v31/profession-explanations.ts",
    from: `  return isProfessionStage(value) ? value : null;`,
    to: `  return isProfessionStage(value) ? value : "explore_now";`,
    guard: STAGE_CHECK,
    expect: "is read as unavailable, never as a known stage",
  },
  {
    name: "the shared check accepting any string as a stage",
    file: "src/lib/career-discovery/v31/profession-explanations.ts",
    from: `  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STAGE_LABEL, value);`,
    to: `  return typeof value === "string";`,
    guard: STAGE_CHECK,
    expect: '"future" is not a known stage',
  },
  {
    name: "the stage sentence indexed with a saved value again",
    file: "src/lib/career-discovery/v31/profession-explanations.ts",
    from: `    stageSentence: isProfessionStage(match.stage)
      ? STAGE_SENTENCE[match.stage][locale]
      : STAGE_UNAVAILABLE_SENTENCE[locale],`,
    to: `    stageSentence: STAGE_SENTENCE[match.stage][locale],`,
    guard: STAGE_CHECK,
    expect: "explainMatch explains",
  },
  {
    name: "the Career Center indexing the stage labels with a saved value again",
    file: "src/components/career-center/PersonalDirection.tsx",
    from: `          {professionStageLabel(item.stage, locale)}`,
    to: `          {(STAGE_LABEL as Record<string, Record<string, string>>)[item.stage as string][locale]}`,
    also: [
      {
        file: "src/components/career-center/PersonalDirection.tsx",
        from: `import { DIMENSIONS } from "@/lib/career-discovery/v31/dimensions";`,
        to: `import { DIMENSIONS } from "@/lib/career-discovery/v31/dimensions";
import { STAGE_LABEL } from "@/lib/career-discovery/v31/profession-explanations";`,
      },
    ],
    guard: STAGE_CHECK,
    expect: "the Career Center renders a raw saved stage without crashing",
  },
  {
    name: "the report view indexing the stage labels with a saved value again",
    file: "src/components/career-discovery/v31/RecommendedProfessions.tsx",
    from: `      {professionStageLabel(stage, locale)}`,
    to: `      {STAGE_LABEL[stage][locale]}`,
    guard: STAGE_CHECK,
    expect: "the report view renders without crashing",
  },
  {
    name: "the tier cards indexing the stage labels with a saved value again",
    file: "src/components/career-discovery/v31/ProfessionRecommendations.tsx",
    from: `      {professionStageLabel(match.stage, locale)}`,
    to: `      {STAGE_LABEL[match.stage][locale]}`,
    also: [
      {
        file: "src/components/career-discovery/v31/ProfessionRecommendations.tsx",
        from: `  readProfessionStage,
  TIER_HEADING,`,
        to: `  readProfessionStage,
  STAGE_LABEL,
  TIER_HEADING,`,
      },
    ],
    guard: STAGE_CHECK,
    expect: "the staged tier cards render without crashing",
  },
  {
    name: "the Career Card indexing the stage labels with a saved value again",
    file: "src/lib/career-discovery/v31/career-card.ts",
    from: `    stageLabel: professionStageLabel(r.match.stage, locale),`,
    to: `    stageLabel: STAGE_LABEL[r.match.stage][locale],`,
    also: [
      {
        file: "src/lib/career-discovery/v31/career-card.ts",
        from: `import { professionStageLabel, recommendationConfidenceLabel } from "./profession-explanations";`,
        to: `import {
  professionStageLabel,
  recommendationConfidenceLabel,
  STAGE_LABEL,
} from "./profession-explanations";`,
      },
    ],
    guard: STAGE_CHECK,
    expect: "the Career Card builds without crashing",
  },
];

function runGuard(script: string = CAREER_CENTER_CHECK): {
  readonly ok: boolean;
  readonly output: string;
} {
  const r = spawnSync("bun", ["run", script], {
    cwd: root,
    encoding: "utf8",
  });
  return { ok: r.status === 0, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
const GUARDS = [...new Set(CONTROLS.map((c) => c.guard ?? CAREER_CENTER_CHECK))];

const originals = new Map<string, string>();
function snapshot(file: string): string {
  if (!originals.has(file)) originals.set(file, readFileSync(abs(file), "utf8"));
  return originals.get(file)!;
}
function restoreAll(): void {
  for (const [file, content] of originals) writeFileSync(abs(file), content);
}

const failures: string[] = [];

// The guard must be green before any of this means anything.
for (const guard of GUARDS) {
  const baseline = runGuard(guard);
  if (!baseline.ok) {
    console.error(`${guard} is already failing — negative controls prove nothing.`);
    console.error(baseline.output);
    process.exit(1);
  }
  console.log(`baseline: ${guard} is green`);
}
console.log("");

try {
  for (const control of CONTROLS) {
    // Every edit the defect needs, each against the file's ORIGINAL bytes so
    // two edits to one file compose, then everything is put back.
    const edits: readonly Edit[] = [control, ...(control.also ?? [])];
    const missing = edits.find((e) => !snapshot(e.file).includes(e.from));
    if (missing) {
      failures.push(`${control.name}: anchor text not found in ${missing.file}`);
      continue;
    }
    const mutated = new Map<string, string>();
    for (const e of edits) {
      mutated.set(e.file, (mutated.get(e.file) ?? snapshot(e.file)).replace(e.from, e.to));
    }
    for (const [file, content] of mutated) writeFileSync(abs(file), content);
    const result = runGuard(control.guard ?? CAREER_CENTER_CHECK);
    for (const file of mutated.keys()) writeFileSync(abs(file), snapshot(file));

    if (result.ok) {
      failures.push(`${control.name}: guard stayed GREEN — it does not detect this`);
      console.log(`  NOT DETECTED  ${control.name}`);
      continue;
    }
    if (!result.output.includes(control.expect)) {
      failures.push(
        `${control.name}: guard failed, but not for the right reason (expected "${control.expect}")`,
      );
      console.log(`  WRONG REASON  ${control.name}`);
      continue;
    }
    console.log(`  detected      ${control.name}`);
  }
} finally {
  restoreAll();
}

// Reversibility is asserted, not assumed.
for (const [file, content] of originals) {
  if (readFileSync(abs(file), "utf8") !== content) {
    failures.push(`${file} was not restored to its original bytes`);
  }
}
for (const guard of GUARDS) {
  if (!runGuard(guard).ok) {
    failures.push(`${guard} is not green again after restoring every file`);
  }
}

if (failures.length > 0) {
  console.error(`\nnegative-controls FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `\nnegative-controls OK — ${CONTROLS.length} reintroduced defects, all detected, all reverted`,
);
