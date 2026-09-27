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
 * Run: bun run career-center:negative-controls
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dir, "..");
const abs = (p: string) => path.join(root, p);

interface Control {
  /** What defect this reintroduces. */
  readonly name: string;
  readonly file: string;
  /** Exact text to replace, and what to replace it with. */
  readonly from: string;
  readonly to: string;
  /** A fragment the guard's failure output must contain. Asserting the
   *  MESSAGE, not merely a non-zero exit: a guard that fails for an unrelated
   *  reason is not evidence about this defect. */
  readonly expect: string;
}

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
    from: `        <ul id="yrkeskatalog"`,
    to: `        <input type="search" aria-label="Sök" />
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
];

function runGuard(): { readonly ok: boolean; readonly output: string } {
  const r = spawnSync("bun", ["run", "scripts/career-center-check.ts"], {
    cwd: root,
    encoding: "utf8",
  });
  return { ok: r.status === 0, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

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
const baseline = runGuard();
if (!baseline.ok) {
  console.error("career-center:check is already failing — negative controls prove nothing.");
  console.error(baseline.output);
  process.exit(1);
}
console.log("baseline: career-center:check is green\n");

try {
  for (const control of CONTROLS) {
    const original = snapshot(control.file);
    if (!original.includes(control.from)) {
      failures.push(`${control.name}: anchor text not found in ${control.file}`);
      continue;
    }
    writeFileSync(abs(control.file), original.replace(control.from, control.to));
    const result = runGuard();
    writeFileSync(abs(control.file), original);

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
const after = runGuard();
if (!after.ok) {
  failures.push("career-center:check is not green again after restoring every file");
}

if (failures.length > 0) {
  console.error(`\nnegative-controls FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `\nnegative-controls OK — ${CONTROLS.length} reintroduced defects, all detected, all reverted`,
);
