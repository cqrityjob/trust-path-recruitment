/**
 * Interview Intelligence — UX and safety contract guard.
 *
 * Deterministic, source-only, no database and no network. Every assertion here
 * exists because the thing it checks was actually wrong at some point, in this
 * repository, and was found by a person rather than by a test:
 *
 *   1. Seven interview routes highlighted "Tester & bedömningar", so the whole
 *      module looked like it lived in another product.
 *   2. `Boolean(config.ai_enabled) || true` made AI look available whatever the
 *      governed configuration said, and the control it rendered could only end
 *      in a runtime failure.
 *   3. The run row recorded the PROVIDER NAME in its model column, so a run
 *      could never say which model produced it.
 *   4. The new-interview selector was built from a generic RLS read, so it
 *      offered packs that scp_iv_create_case then refused (the P0).
 *   5. Employer copy told employers to obtain a "pilotmedgivande" after the
 *      owner decision removed that requirement.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
let failures = 0;
let passes = 0;

function ok(cond: boolean, label: string): void {
  if (cond) {
    passes += 1;
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

/** Source with comments removed, so a guard never trips on its own prose. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

function filesUnder(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, entry);
    if (statSync(path.join(root, rel)).isDirectory()) {
      out.push(...filesUnder(rel, match));
    } else if (match.test(entry)) {
      out.push(rel);
    }
  }
  return out;
}

const ROUTES = "src/routes";
const interviewRoutes = filesUnder(ROUTES, /\.tsx$/).filter((f) =>
  path.basename(f).includes("interview-intelligence"),
);

console.log("interview-ux-contract-check\n");

/* ------------------------------------------------------------------ */
/* 1 · Every interview route activates the Intervjuer navigation        */
/* ------------------------------------------------------------------ */

ok(
  interviewRoutes.length >= 7,
  `expected the interview route family, found ${interviewRoutes.length}`,
);

for (const file of interviewRoutes) {
  const body = codeOnly(read(file));
  if (!body.includes("activeSection")) continue; // layout-only routes carry none
  ok(
    /activeSection="interviewIntelligence"/.test(body),
    `${file} must set activeSection="interviewIntelligence" (a customer in Intervjuer must not be shown standing in Tester & bedömningar)`,
  );
  ok(!/activeSection="assessments"/.test(body), `${file} still activates the assessments section`);
}

/* ------------------------------------------------------------------ */
/* 2 · Disabled AI cannot render as executable                          */
/* ------------------------------------------------------------------ */

const runtimeFns = codeOnly(read("src/lib/interview-intelligence/runtime.functions.ts"));

ok(
  !/ai_enabled\s*\)\s*\|\|\s*true/.test(runtimeFns) && !/aiAvailable:\s*true/.test(runtimeFns),
  "aiAvailable must be the governed flag, never OR'd with true",
);
ok(
  /aiAvailable:\s*Boolean\(configRes\.data\?\.ai_enabled\)\s*,/.test(runtimeFns),
  "aiAvailable must read scp_interview_ai_config.ai_enabled directly",
);

// The screen that offers the AI control must gate it on that flag.
const prepare = codeOnly(
  read(
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.prepare.tsx",
  ),
);
ok(
  /d\.aiAvailable\s*&&/.test(prepare),
  "the preparation screen must gate its AI control on aiAvailable",
);
ok(
  /!d\.aiAvailable\s*&&/.test(prepare),
  "the preparation screen must render an explanation when AI is unavailable",
);

// And say so in the customer's words rather than leaving a silent gap.
const prepareRaw = read(
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.prepare.tsx",
);
ok(
  /AI-stöd är ännu inte aktiverat/.test(prepareRaw),
  "the disabled-AI state needs customer copy, not an empty section",
);

/* ------------------------------------------------------------------ */
/* 3 · Provider name and exact model id are distinct provenance fields  */
/* ------------------------------------------------------------------ */

const orchestrator = codeOnly(read("src/lib/interview-intelligence/ai/orchestrator.ts"));

ok(
  !/model:\s*provider\.name/.test(orchestrator),
  "the orchestrator must not report the provider NAME as the model",
);
ok(
  /model:\s*provider\.modelId/.test(orchestrator),
  "the orchestrator must report the provider's exact model id",
);
ok(
  /resolvedModel/.test(orchestrator),
  "the orchestrator must carry what the provider itself reported, separately from intent",
);
ok(
  !/modelName:\s*selected\.provider\.name/.test(runtimeFns),
  "the run's model column must not be filled from the provider name",
);
ok(
  /modelName:\s*selected\.provider\.modelId/.test(runtimeFns),
  "the run's model column must be the provider's exact model id",
);
ok(
  /_resolved_model:/.test(runtimeFns),
  "settlement must pass the provider-reported model so the exact id is preserved",
);
ok(
  /_provider_mode:\s*engine\.mode/.test(runtimeFns),
  "run start must declare its provider mode so the database gate can refuse a real model",
);

const providerContract = codeOnly(read("src/lib/interview-intelligence/ai/provider.ts"));
ok(
  /readonly modelId: string/.test(providerContract),
  "AiProvider must declare modelId distinctly from name",
);

/* ------------------------------------------------------------------ */
/* 4 · The P0 start contract stays locked                               */
/* ------------------------------------------------------------------ */

ok(
  /listStartableInterviewPacks/.test(runtimeFns),
  "the new-interview selector must be served by the startable-pack contract",
);
ok(
  /scp_iv_startable_pack_versions/.test(runtimeFns),
  "the startable list must come from the governed RPC",
);
ok(
  !/export const listUsablePacks/.test(runtimeFns),
  "listUsablePacks (the generic RLS list) must not return as the customer selector source",
);

const newScreen = codeOnly(
  read("src/routes/_authenticated.employer.$employerSlug.interview-intelligence.new.tsx"),
);
ok(
  /listStartableInterviewPacks/.test(newScreen),
  "the new-interview screen must consume the startable contract",
);
ok(
  /canStart/.test(newScreen),
  "the new-interview screen must distinguish 'account cannot start' from 'nothing available'",
);
ok(
  /onError/.test(newScreen) && /refetch\(\)/.test(newScreen),
  "a refusal must clear the stale selection and refresh availability",
);

/* ------------------------------------------------------------------ */
/* 5 · No ordinary-employer pilot-grant language survives               */
/* ------------------------------------------------------------------ */

const employerSurfaces = [...interviewRoutes, "src/components/employer/interview/InterviewUi.tsx"];

for (const file of employerSurfaces) {
  const raw = read(file);
  ok(
    !/pilotmedgivande/i.test(raw),
    `${file} still tells employers they need a "pilotmedgivande" — the owner decision removed that requirement`,
  );
}

/* ------------------------------------------------------------------ */
/* 6 · No score, rank, pass/fail, suitability or hire recommendation    */
/* ------------------------------------------------------------------ */

// Words that would mean the product had started deciding. Checked against
// rendered customer copy, not identifiers: `level` and `anchor` are legitimate
// domain vocabulary, "lämplig för tjänsten" is not.
const FORBIDDEN_CLAIMS: readonly [RegExp, string][] = [
  [/totalpoäng|total\s*score/i, "a total score"],
  [/rangordn|ranking\b|rankad/i, "a ranking"],
  [/godkänd\s*\/\s*underkänd|pass\s*\/\s*fail/i, "a pass/fail verdict"],
  [/lämplighetspoäng|suitability\s*score/i, "a suitability score"],
  [/rekommenderar\s+(anställning|att anställa)|recommends?\s+hiring/i, "a hiring recommendation"],
  [/trovärdighetspoäng|credibility\s*score/i, "a credibility score"],
  [/lögndetekt|deception\s*(score|detection)/i, "deception detection"],
  [/känsloigenkänning|emotion\s*(recognition|inference)/i, "emotion inference"],
];

for (const file of employerSurfaces) {
  const raw = read(file);
  // Negations are the product's own disclaimers ("Ingen totalpoäng, ingen
  // rangordning ..."), which must survive; only a positive claim is a defect.
  const lines = raw.split("\n");
  for (const [pattern, what] of FORBIDDEN_CLAIMS) {
    const hit = lines.findIndex(
      (l) => pattern.test(l) && !/\b(Ingen|Inget|Inga|inte|aldrig|No |never|not )/i.test(l),
    );
    ok(hit === -1, `${file}:${hit + 1} appears to offer ${what}`);
  }
}

/* ------------------------------------------------------------------ */
/* 7 · The pilot disclosure is not removable by accident                */
/* ------------------------------------------------------------------ */

ok(
  /pilothypotes/i.test(read("src/components/employer/interview/InterviewUi.tsx")) ||
    interviewRoutes.some((f) => /pilothypotes/i.test(read(f))),
  "the pilot-hypothesis disclosure must be present in the employer surfaces",
);

/* ------------------------------------------------------------------ */

console.log(`\n  assertions passed: ${passes}`);
if (failures > 0) {
  console.error(`\ninterview-ux-contract-check FAILED (${failures} issue(s))`);
  process.exit(1);
}
console.log("\nOK: navigation, disabled-AI rendering, model provenance, the start contract,");
console.log("    pilot-grant language and the no-scoring boundary all hold.");
