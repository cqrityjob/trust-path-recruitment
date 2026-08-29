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
//
// The first lexicon was still too thin: an owner code review found nine more
// ("Pausa", "Panelgranskning", "Panelens slutsats", "Beslutet", "AI:s roll",
// "Inget hindrar rapporten", "AI:ts ursprungliga formulering",
// "Intervjuarens egen reflektion", "Granskningen kunde inte sparas"). Rather
// than keep chasing individual words, this now also matches Swedish MORPHOLOGY
// -- the definite and possessive endings that English simply does not have --
// which catches whole families of leaks at once.
const SWEDISH_WORDS = new RegExp(
  [
    // literal words seen leaking, kept for precision
    "\\b(Motivering|Ankare|Rollpaket|Intervju|Intervjuer|Underlag|Evidens|Rapport",
    "|Kandidat|Sparat|Anteckningar|Avbryt|Skapa|Beslutet|Pausa|Panelgranskning",
    "|Granskningen|Slutsats|Reflektion|Formulering|Bedomning|Godkand|Niva|Valj|Fraga|Fragor)\\b",
    // Swedish definite/plural endings on a capitalised word: "Panelens",
    // "Intervjuarens", "Beslutet", "Rapporten". English has no -ens/-arens.
    "|\\b[A-ZÅÄÖ][a-zåäö]{3,}(ens|arens|erna|orna)\\b",
    // "AI:s", "AI:ts" -- the Swedish genitive colon form
    "|\\bAI:[a-zåäö]{1,2}\\b",
  ].join(""),
);

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
    "iiu.iv.copilot.title", //     "CQrity Copilot" — a product name, which is
    //                             not translated in either locale. The panel's
    //                             body copy beneath it IS translated, and is
    //                             checked like everything else.
    "iiu.ev.5e.1", //              "Situation" — the same word in both. The
    //                             other four 5E labels differ and are checked.
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

/* ------------------------------------------------------------------ */
/* 10 · The Copilot vertical                                            */
/* ------------------------------------------------------------------ */

// The central product rule: what the recruiter wrote under a question must
// follow that question into evidence review by itself. There is exactly one
// way that fails silently -- the notes section quietly stops being rendered --
// and the recruiter's only recourse would be to retype their own notes, which
// is the outcome the whole vertical exists to prevent.
{
  const ev = read(
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.evidence.tsx",
  );
  ok(
    ev.includes('t("iiu.ev.notes.title")') && ev.includes("d.session?.notes"),
    "evidence review no longer renders the saved interview notes — the recruiter would have to retype them",
  );
  ok(
    ev.includes('t("iiu.ev.notes.none")'),
    "evidence review must say when a question has no note, rather than leaving it blank",
  );
  ok(
    ev.includes('t("iiu.ev.fromnote")') && ev.includes("n.id === p.noteId"),
    "a proposal must be shown beside the note it was read out of, or it cannot be checked",
  );
  ok(
    ev.includes("<FiveEPanel value={p.fiveE} />"),
    "the 5E structure of a proposal is not rendered",
  );
  ok(
    ev.includes("runInterviewAnalysis") && ev.includes('t("iiu.ev.analyse")'),
    "the one analysis action is not wired to runInterviewAnalysis",
  );
  ok(
    ev.includes("analyse.data.steps.map"),
    "per-step results must be shown, so a later failure reads as partial completion, not total failure",
  );
}

// 5E is a description, never a measurement. A count, a percentage or a
// progress bar over these five fields would be read as a score the moment two
// candidates were compared, which is exactly what this engine must not produce.
{
  const ui = read("src/components/employer/interview/InterviewUi.tsx");
  const panel = ui.slice(ui.indexOf("export function FiveEPanel"));
  ok(
    !/(?:\bscore\b|\bpoäng\b|\bpercent\b|%|\bof 5\b|\bav 5\b|toFixed|Math\.round)/i.test(
      panel.slice(0, panel.indexOf("\n}\n")),
    ),
    "FiveEPanel must not express 5E as a score, a count or a percentage",
  );
  ok(
    panel.includes('t("iiu.ev.5e.note")'),
    "FiveEPanel must carry the note saying 5E is not a prediction of job performance",
  );
}

// Understand permits zero AI tasks. A panel called "Copilot" sitting beside a
// live candidate must therefore say plainly that it is not listening, and must
// not acquire a model call later without this failing.
{
  const iv = read(
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.interview.tsx",
  );
  ok(
    iv.includes('t("iiu.iv.copilot.title")') && iv.includes('t("iiu.iv.copilot.noai")'),
    "the interview Copilot panel must state that it calls no model during the interview",
  );
  const aside = iv.slice(iv.indexOf('aria-labelledby="s-copilot"'), iv.indexOf("</aside>"));
  ok(
    !/useMutation|useServerFn|\.mutate\(/.test(aside),
    "the Copilot panel triggered an action — the Understand stage permits no AI task at all",
  );
}

// The report draft is assistance. The published report is assembled by the
// database from confirmed evidence and recorded human assessments; the draft
// travels with it as provenance only.
{
  const rp = read(
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx",
  );
  ok(rp.includes("runReportDraft"), "the report route no longer offers an AI draft");
  ok(
    rp.includes("draftRunId:") && !/sections:\s*draft/.test(rp),
    "the draft's TEXT must never be passed into finalisation — only its run id, as provenance",
  );
  ok(
    rp.includes('t("iiu.rp.draft.nodecision")'),
    "the draft must be shown with the reminder that it may not propose a hiring decision",
  );
}

// The behavioural anchors are the copy an interviewer holds an account
// against, and level 0's anchor carries the sentence that stops a "0" being
// read as a low score. Rendering `anchorSv` directly put all of it in Swedish
// for an English-reading interviewer while everything around it translated --
// found by walking the interview screen, not by any test. Q1-Q8 prompts stay
// deliberately Swedish-locked; the anchors around them must not.
for (const file of [
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.interview.tsx",
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.evidence.tsx",
]) {
  const body = codeOnly(read(file));
  for (const field of ["anchorSv", "labelSv"]) {
    ok(
      // `(?<!\$)` so a template interpolation such as `${c.labelSv}` -- which
      // is BUILDING a bilingual pair, not rendering one -- is not mistaken for
      // JSX that puts the Swedish column on screen.
      !new RegExp(`(?<!\\$)\\{\\s*[a-z]\\.${field}\\s*\\}`).test(body),
      `${file} renders a.${field} directly — an English-reading interviewer sees the anchors in Swedish; pick the locale's column with a fallback`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* 11 · The TRUST conduct layer                                         */
/* ------------------------------------------------------------------ */

// The conduct sequence is governed rows rendered during Understand, a stage
// that permits zero AI tasks. The failure mode is not that it renders badly;
// it is that a future edit quietly makes the panel call something.
{
  const iv = read(
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.interview.tsx",
  );
  ok(
    iv.includes("d.conductSteps") && iv.includes('t("iiu.cd.sequence")'),
    "the live Copilot no longer renders the governed conduct sequence",
  );
  ok(
    iv.includes("d.conductProhibitions") && iv.includes('t("iiu.cd.never")'),
    "the live Copilot no longer renders the prohibited techniques",
  );
  const aside = iv.slice(iv.indexOf('aria-labelledby="s-copilot"'), iv.indexOf("</aside>"));
  ok(
    !/useMutation|useServerFn|\.mutate\(|fetch\(/.test(aside),
    "the Copilot panel acquired a call — Understand permits no AI task at all",
  );

  const prep = read(
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.prepare.tsx",
  );
  for (const surface of [
    "target_purpose",
    "target_evidence_class",
    "ready_plan",
    "recall_prompt",
  ]) {
    ok(prep.includes(`"${surface}"`), `preparation no longer renders the ${surface} guidance`);
  }

  const rp = read(
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx",
  );
  for (const surface of ["trace_self_review", "trace_closure"]) {
    ok(rp.includes(`"${surface}"`), `the report route no longer renders the ${surface} guidance`);
  }
  ok(
    rp.includes('t("iiu.cd.trace.selfreview.note")'),
    "the self-review must say it is about the interviewer, not the candidate",
  );
}

/* ------------------------------------------------------------------ */
/* 12 · Prohibited technique vocabulary must not reach a model         */
/* ------------------------------------------------------------------ */

// The prohibitions name Scharff, Reid, minimization and the rest ON PURPOSE --
// a named technique is a boundary a person can be held to, and "be fair" is
// only advice. But they are shown to a HUMAN. An AI task instruction that
// names an interrogation technique has described it to the model, so the
// registry where those instructions live is checked for exactly the vocabulary
// the conduct layer exists to forbid.
{
  const BANNED = [
    "scharff",
    "reid technique",
    "minimization",
    "maximization",
    "strategic use of evidence",
    "deception detection",
    "credibility assessment",
    "body language",
    "micro-expression",
    "confession",
    "admission",
    "interrogation",
    "lie detection",
    "personality profile",
  ];
  for (const file of [
    "src/lib/interview-intelligence/ai/registry.ts",
    "src/lib/interview-intelligence/ai/providers/anthropic.ts",
    "src/lib/interview-intelligence/ai/orchestrator.ts",
  ]) {
    const body = codeOnly(read(file)).toLowerCase();
    for (const term of BANNED) {
      ok(
        !body.includes(term),
        `${file} contains "${term}" in code that reaches a model — the prohibitions are for humans to read, not for a prompt to describe`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* 13 · TRUST is a hypothesis, and says so                             */
/* ------------------------------------------------------------------ */

// The owner's wording, exactly: a research-grounded design hypothesis under
// controlled validation. Not "validated", not "evidence-based", not "proven".
{
  const dict = read("src/i18n/dictionaries.ts");
  ok(
    dict.includes("research-grounded design hypothesis under controlled validation"),
    "the English copy no longer describes TRUST as a design hypothesis under controlled validation",
  );
  ok(
    dict.includes("forskningsgrundad designhypotes under kontrollerad validering"),
    "the Swedish copy no longer describes TRUST as a design hypothesis under controlled validation",
  );
  const CLAIMS = [
    "scientifically validated",
    "clinically validated",
    "proven predictor",
    "validated predictor of job performance",
  ];
  for (const claim of CLAIMS) {
    const hits = [...dict.matchAll(new RegExp(claim, "gi"))];
    // "not a validated predictor of job performance" is the disclaimer and is
    // allowed; the bare claim is not.
    const bare = hits.filter((h) => {
      const before = dict.slice(Math.max(0, h.index! - 40), h.index!).toLowerCase();
      return !/\b(not|inte|never|aldrig|is not)\b[^.]*$/.test(before);
    });
    ok(bare.length === 0, `the copy asserts "${claim}" without a negation`);
  }
}

/* ------------------------------------------------------------------ */
/* 14 · The recruiter's entry point                                     */
/* ------------------------------------------------------------------ */

// The product failure this fixes: opening a candidate landed the recruiter
// inside /prepare, whose first screenful was the TRUST stage banner -- the
// method's name, which of five stages this is, what may not be concluded here,
// and a note about scientific validation. Who the candidate was, what the role
// needed and what to do next appeared nowhere.
//
// The method still governs every screen underneath. It must not be the first
// thing between a recruiter and their work.
{
  const OV =
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.index.tsx";
  const ov = read(OV);

  ok(
    ov.includes("{d.candidateDisplayName}") &&
      ov.indexOf("{d.candidateDisplayName}") < ov.indexOf("iiu.ov.whereyouare"),
    "the overview must lead with the candidate, not with process state",
  );
  ok(
    ov.includes('t("iiu.ov.nextaction")') && ov.includes("NEXT[d.status]"),
    "the overview must tell the recruiter what to do next, derived from the case status",
  );
  ok(
    !ov.includes("TrustStageBanner"),
    "the TRUST stage banner is back on the overview — methodology must not be the entry point",
  );
  // A progress bar or percentage over an interview reads as a score for the
  // candidate the moment two candidates are compared.
  ok(
    !/(?:progress|width):\s*[`'"]?\$?\{?[^}]*%/i.test(ov) && !ov.includes("toFixed"),
    "the overview must not express progress as a percentage or a bar",
  );

  const list = "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.index.tsx";
  const li = read(list);
  ok(
    li.includes('to="/employer/$employerSlug/interview-intelligence/$caseId"'),
    "the interview list must open the overview, not drop the recruiter inside a work surface",
  );
  ok(
    !li.includes("ValidationChip"),
    "the pack's validation label is governance metadata and does not belong on every list row",
  );
  ok(
    !/>\s*Interview Intelligence\s*</.test(li),
    "the list must be titled in the recruiter's language, and match the sidebar",
  );
}

/* ------------------------------------------------------------------ */
/* 15 · The negative product contract                                   */
/* ------------------------------------------------------------------ */

// The owner's list of things that mean the product has slid back into being
// research presented as software. Each is cheap to reintroduce by accident and
// expensive to notice, so each is asserted rather than remembered.
{
  const CASE_ROUTES = ["prepare", "interview", "evidence", "report"].map(
    (r) =>
      `src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.${r}.tsx`,
  );
  const OVERVIEW =
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.index.tsx";
  const LIST = "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.index.tsx";

  // A checksum is not information a recruiter can act on. It belongs where an
  // auditor looks, not in the header above a candidate's name.
  for (const file of [...CASE_ROUTES, LIST]) {
    ok(
      !read(file).includes("packContentHash"),
      `${file} renders the pack content hash — a raw checksum has no place in the recruiter's working view`,
    );
  }

  // Every one of these screens should open with the person being interviewed.
  for (const file of [...CASE_ROUTES, OVERVIEW]) {
    const body = read(file);
    const h1 = body.indexOf("sm:text-3xl");
    const cand = body.indexOf("{d.candidateDisplayName}");
    ok(
      cand > 0 && h1 > 0 && cand - h1 < 200 && cand > h1,
      `${file} does not lead with the candidate — the case title is internal bookkeeping`,
    );
  }

  // Navigation is by the recruiter's task, never by the method's stages.
  {
    const rail = read("src/components/employer/interview/InterviewUi.tsx");
    const steps = rail.slice(rail.indexOf("export function CaseSteps"));
    for (const stage of ["Target", "Ready", "Understand", "Structure", "Trace"]) {
      ok(
        !new RegExp(`label: t\\("[^"]*"\\).*${stage}`).test(steps) && !steps.includes(`"${stage}"`),
        `the journey rail is labelled with the TRUST stage "${stage}" — navigate by task, not by method`,
      );
    }
  }

  // No score, no ranking, no recommendation, anywhere a recruiter reads.
  for (const file of [...CASE_ROUTES, OVERVIEW, LIST]) {
    const body = codeOnly(read(file)).toLowerCase();
    for (const term of [
      "suitability",
      "lämplighet",
      "rekommenderad kandidat",
      "recommended candidate",
      "overall score",
      "totalpoäng",
      "candidate score",
    ]) {
      ok(
        !body.includes(term),
        `${file} contains "${term}" — this engine produces no score, ranking or recommendation`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* 16 · The lifecycle is navigable end to end                           */
/* ------------------------------------------------------------------ */

// Not "the components exist" but "the recruiter can get from one to the next".
// Every case status must resolve to a real route and a real call to action, so
// a status the backend can produce can never leave the recruiter on a page
// with nowhere to go.
{
  const OVERVIEW =
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.index.tsx";
  const ov = read(OVERVIEW);
  const STATUSES = [
    "draft",
    "sources_ready",
    "prep_generated",
    "prep_approved",
    "interview_in_progress",
    "interview_complete",
    "evidence_review",
    "assessed",
    "reported",
  ];
  const nextBlock = ov.slice(ov.indexOf("const NEXT"), ov.indexOf("function Page"));
  for (const st of STATUSES) {
    ok(
      new RegExp(`\\b${st}:`).test(nextBlock),
      `case status "${st}" has no next action on the overview — the recruiter would be stranded`,
    );
  }
  for (const seg of ["prepare", "interview", "evidence", "report"]) {
    ok(
      nextBlock.includes(`/${seg}\``),
      `the overview never routes to /${seg} — the lifecycle is not navigable end to end`,
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
