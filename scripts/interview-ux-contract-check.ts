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

// And say so in the customer's words rather than leaving a silent gap. The
// copy lives in the dictionary now, so it is asserted there — in BOTH
// locales, because an English pilot user must be told the same thing.
const dictionaryRaw = read("src/i18n/dictionaries.ts");
ok(
  /"iiu\.pp\.aidisabled\.title":\s*"AI-stöd är ännu inte aktiverat/.test(dictionaryRaw),
  "the disabled-AI state needs Swedish customer copy, not an empty section",
);
ok(
  /"iiu\.pp\.aidisabled\.title":\s*"AI assistance is not yet enabled/.test(dictionaryRaw),
  "the disabled-AI state needs English customer copy too",
);
ok(
  /d\.aiAvailable \? "iiu\.rp\.noblockers" : "iiu\.rp\.noblockers\.manual"/.test(
    read(
      "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx",
    ),
  ),
  "the report must not claim AI reviewed anything when no AI was used",
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
  /"iiu\.label\.pilot_hypothesis":\s*"Pilothypotes"/.test(dictionaryRaw) &&
    /"iiu\.label\.pilot_hypothesis":\s*"Pilot hypothesis"/.test(dictionaryRaw),
  "the pilot-hypothesis label must exist in both locales",
);
ok(
  /"iiu\.new\.pilot\.body":\s*"Innehållet är en genomarbetad hypotes/.test(dictionaryRaw),
  "the pilot-hypothesis disclosure body must survive in Swedish",
);
ok(
  /"iiu\.new\.pilot\.body":\s*"The content is a considered hypothesis/.test(dictionaryRaw),
  "and in English — a boundary nobody can read is not a boundary",
);
ok(
  interviewRoutes.some((f) => /iiu\.new\.pilot\.title/.test(read(f))),
  "the new-interview screen must still render the pilot disclosure",
);
// The no-scoring boundary must survive translation in both directions.
ok(
  /"iiu\.ix\.boundary\.body":\s*"Ingen totalpoäng, ingen rangordning/.test(dictionaryRaw) &&
    /"iiu\.ix\.boundary\.body":\s*"No total score, no ranking/.test(dictionaryRaw),
  "the no-score/no-ranking boundary must read the same in both locales",
);
ok(
  /"iiu\.level0\.note":\s*"Nivå 0 betyder otillräcklig evidens/.test(dictionaryRaw) &&
    /"iiu\.level0\.note":\s*"Level 0 means insufficient evidence/.test(dictionaryRaw),
  "the level-0 rule must read the same in both locales",
);

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 8 · SV/EN parity for the governed Interview Intelligence surfaces    */
/* ------------------------------------------------------------------ */

// The module was built Swedish-first while its shell already switched
// language, so an English-speaking pilot user got Swedish governance copy
// under an English chrome. That is not a cosmetic gap: "Pilothypotes",
// "Nivå 0 betyder otillräcklig evidens" and "Ingen totalpoäng, ingen
// rangordning" are the safety boundary, and a boundary nobody can read is
// not a boundary.
//
// Two directions are checked, because `t()` falls back
// (dictionaries[lang][key] ?? dictionaries.sv[key] ?? key) and a missing
// English entry therefore renders SILENTLY as Swedish.

const I18N_SURFACES = [...interviewRoutes, "src/components/employer/interview/InterviewUi.tsx"];

/** Blank out block comments while PRESERVING line numbers, so a reported
 *  line points at the real one. */
function codeLines(source: string): string[] {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
    .split("\n")
    .map((l) => (/^\s*(\/\/|\*)/.test(l) ? "" : l));
}

const SWEDISH_GLYPH = /[åäöÅÄÖ]/;

// Owner UAT found "Motivering: " and "Ankare: " still hardcoded on two
// screens. Neither contains å, ä or ö, so a glyph test walks straight past
// them -- and plenty of Swedish does: Motivering, Ankare, Status, Intervju,
// Rollpaket, Bedomning-without-o. This is the second line of defence: a small
// lexicon of Swedish words that actually appear in this module's copy, tested
// against JSX text and string literals only.
const SWEDISH_WORDS =
  /\b(Motivering|Ankare|Rollpaket|Intervju|Intervjuer|Underlag|Evidens|Bedomning|Rapport|Kandidat|Niva|Sparat|Anteckningar|Godkand|Avbryt|Skapa|Valj|Fraga|Fragor)\b/;

/** Does this line put Swedish in front of a customer?
 *
 *  Import paths, translation KEYS and identifiers are not customer copy --
 *  `t("iiu.rail.interview")` must not trip a rule about the word "Interview".
 *  So the check looks at JSX text and quoted strings, with dictionary keys
 *  and module paths removed first. */
function customerFacingSwedish(line: string): boolean {
  const stripped = line
    .replace(/"(?:ii|iiu)\.[^"]*"/g, "") // translation keys
    .replace(/from\s+"[^"]*"/g, "") // import paths
    .replace(/\b[a-z]+[A-Z]\w*\b/g, ""); // camelCase identifiers
  return SWEDISH_GLYPH.test(stripped) || SWEDISH_WORDS.test(stripped);
}

for (const file of I18N_SURFACES) {
  const lines = codeLines(read(file));
  const offenders: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (customerFacingSwedish(lines[i])) offenders.push(i + 1);
  }
  ok(
    offenders.length === 0,
    `${file} still holds Swedish literals at line(s) ${offenders.slice(0, 6).join(", ")}${
      offenders.length > 6 ? ` (+${offenders.length - 6} more)` : ""
    } — customer copy belongs in src/i18n/dictionaries.ts, not in the component`,
  );
}

// Every ii*/iiu* key must exist in BOTH locales. A key present only in `sv`
// renders Swedish in EN mode through the fallback and no test would notice.
{
  const dict = read("src/i18n/dictionaries.ts");
  const svStart = dict.indexOf("  sv: {");
  const enStart = dict.indexOf("  en: {");
  ok(svStart > 0 && enStart > svStart, "dictionaries.ts must define both locales");

  const keysIn = (segment: string): Set<string> =>
    new Set([...segment.matchAll(/^\s{4}"((?:ii|iiu)\.[^"]+)":/gm)].map((m) => m[1]));

  const sv = keysIn(dict.slice(svStart, enStart));
  const en = keysIn(dict.slice(enStart));

  const missingEn = [...sv].filter((k) => !en.has(k));
  const missingSv = [...en].filter((k) => !sv.has(k));

  ok(
    missingEn.length === 0,
    `interview keys missing an English entry (they would render as Swedish): ${missingEn.slice(0, 5).join(", ")}`,
  );
  ok(
    missingSv.length === 0,
    `interview keys missing a Swedish entry: ${missingSv.slice(0, 5).join(", ")}`,
  );
  ok(sv.size >= 350, `expected the interview key set to be populated, found ${sv.size}`);

  // An identical pair is almost always a forgotten translation. The
  // exceptions are genuinely language-neutral and are listed by name, so
  // adding one is a deliberate act rather than a silent allowance.
  // Each entry is a word that is genuinely identical in Swedish and English,
  // documented one by one so that adding to this list is a deliberate act
  // rather than a way to silence a missing translation.
  const LANGUAGE_NEUTRAL = new Set([
    "ii.a11y.status", //           "Status" — the same word in both languages
    "ii.list.column.status", //    likewise, as a table column heading
    "iiu.chip.status", //          likewise, as a screen-reader prefix
    "iiu.iv.sess.srprefix", //     "Session" — the same word in both
    "iiu.source.candidate_cv_short", // "CV" — the same abbreviation in both
  ]);
  const svPairs = new Map(
    [
      ...dict
        .slice(svStart, enStart)
        .matchAll(/^\s{4}"((?:ii|iiu)\.[^"]+)":\s*\n?\s*("(?:[^"\\]|\\.)*")/gm),
    ].map((m) => [m[1], m[2]] as const),
  );
  const enPairs = new Map(
    [
      ...dict.slice(enStart).matchAll(/^\s{4}"((?:ii|iiu)\.[^"]+)":\s*\n?\s*("(?:[^"\\]|\\.)*")/gm),
    ].map((m) => [m[1], m[2]] as const),
  );
  // Strict: ANY identical pair fails unless it is named in LANGUAGE_NEUTRAL.
  // Relying on a Swedish glyph to detect this misses the common case --
  // "Aktiva intervjuer" copied verbatim into the English locale carries no
  // å, ä or ö and would sail through.
  const identical = [...svPairs.entries()]
    .filter(([k, v]) => enPairs.get(k) === v && !LANGUAGE_NEUTRAL.has(k))
    .map(([k]) => k);
  ok(
    identical.length === 0,
    `these interview keys have an identical Swedish value in the English locale: ${identical.slice(0, 5).join(", ")}`,
  );
}

/* ------------------------------------------------------------------ */
/* 9 · A translation key must never reach the screen                    */
/* ------------------------------------------------------------------ */

// Found by walking the real interview: the PEACE stage buttons rendered
// `PEACE_LABEL[stage]` directly, so after the maps were converted to hold
// translation KEYS the screen showed a literal "iiu.peace.planning" to the
// interviewer. Indexing a key map without resolving it through t() is the
// whole failure mode, so it is banned by shape rather than by memory.

const KEY_MAPS = [
  "STATUS_LABEL",
  "SOURCE_KIND_LABEL",
  "PURPOSE_LABEL",
  "PRACTICE_KIND_LABEL",
  "PEACE_LABEL",
  "ASSURANCE_LABEL",
  "STATE_LABEL",
  "ITEM_LABEL",
];

for (const file of I18N_SURFACES) {
  const body = codeOnly(read(file));
  for (const map of KEY_MAPS) {
    // `{MAP[x]}` inside JSX renders the key itself. Reading a map inside a
    // uiLabel(...) call or a t(...) call is how it is supposed to be done.
    const raw = new RegExp(`\\{\\s*${map}\\[`);
    ok(
      !raw.test(body),
      `${file} renders ${map}[…] directly — that puts a translation key on screen; resolve it with uiLabel(${map}, value, t)`,
    );
  }
}

console.log(`\n  assertions passed: ${passes}`);
if (failures > 0) {
  console.error(`\ninterview-ux-contract-check FAILED (${failures} issue(s))`);
  process.exit(1);
}
console.log("\nOK: navigation, disabled-AI rendering, model provenance, the start contract,");
console.log("    pilot-grant language and the no-scoring boundary all hold.");
