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

/** Every file that can put words in front of a recruiter. The shared layout
 *  module holds no copy by design -- every string is passed in, already
 *  resolved -- and it is swept anyway, because "by design" is the part that
 *  stops being true. */
const INTERVIEW_COMPONENTS = [
  "src/components/employer/interview/InterviewUi.tsx",
  "src/components/employer/interview/InterviewLayout.tsx",
  "src/components/employer/interview/InterviewOutcome.tsx",
  "src/components/employer/interview/ReportFinalisation.tsx",
];

const employerSurfaces = [...interviewRoutes, ...INTERVIEW_COMPONENTS];

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

const I18N_SURFACES = [...interviewRoutes, ...INTERVIEW_COMPONENTS];

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
    // Owner review round 2 found "Processkvalitet" and "Verifieringar kvar"
    // still hardcoded. Neither has a Swedish glyph and neither ends in the
    // definite forms above, so both walked past every rule here. These two
    // endings are high precision: English forms the same nouns as
    // "verifications" and "quality", never as -ingar or kvalitet.
    "|\\b[A-ZÅÄÖa-zåäö]{2,}(ingar|ingarna|ningen|heten)\\b",
    "|\\b[A-ZÅÄÖa-zåäö]*kvalitet[a-zåäö]*\\b",
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
    ov.includes('t("iiu.ov.nextaction")') && ov.includes("NEXT_STEP[d.status]"),
    "the overview must tell the recruiter what to do next, derived from the case status through the shared NEXT_STEP map",
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

  // Every one of these screens should open with the person being interviewed:
  // either its own h1 or the shared CaseHeader, whose first prop is the
  // candidate.
  for (const file of [...CASE_ROUTES, OVERVIEW]) {
    const body = read(file);
    const h1 = body.indexOf("sm:text-3xl");
    const header = body.indexOf("<CaseHeader");
    const cand = body.indexOf("{d.candidateDisplayName}");
    const leadsWith = (at: number) => at > 0 && cand > at && cand - at < 200;
    ok(
      cand > 0 && (leadsWith(h1) || leadsWith(header)),
      `${file} does not lead with the candidate — the case title is internal bookkeeping`,
    );
  }

  // Navigation is by the recruiter's task, never by the method's stages.
  {
    const rail = read("src/components/employer/interview/InterviewUi.tsx");
    const steps = rail.slice(
      rail.indexOf("export type Stage ="),
      rail.indexOf("export function WorkflowNav"),
    );
    ok(steps.length > 0, "the four-stage workflow definition must exist in InterviewUi");
    for (const stage of ["Target", "Ready", "Understand", "Structure", "Trace"]) {
      ok(
        !steps.includes(`"${stage}"`) && !steps.toLowerCase().includes(`"${stage.toLowerCase()}"`),
        `the journey is labelled with the TRUST stage "${stage}" — navigate by task, not by method`,
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
  // The map lives in InterviewUi now, because the overview's primary button,
  // the list's next-step column and every stage header read from the same
  // rows. It is still asserted status by status.
  const ui = read("src/components/employer/interview/InterviewUi.tsx");
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
  const nextBlock = ui.slice(
    ui.indexOf("export const NEXT_STEP:"),
    ui.indexOf("export const NEXT_STEP_LABEL"),
  );
  ok(nextBlock.length > 0, "InterviewUi must define the shared NEXT_STEP map");
  for (const st of STATUSES) {
    ok(
      new RegExp(`\\b${st}:`).test(nextBlock),
      `case status "${st}" has no next action — the recruiter would be stranded`,
    );
  }
  // Every stage of the four-step journey is reachable from the map: prepare,
  // interview, assess (which opens on the material) and report.
  for (const seg of ["prepare", "interview", "evidence", "report"]) {
    ok(
      nextBlock.includes(`/${seg}\``),
      `the next-step map never routes to /${seg} — the lifecycle is not navigable end to end`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* 17 · The summary, and the report's audit boundary                    */
/* ------------------------------------------------------------------ */

// The summary is a projection of records humans already made. If it ever
// starts calling a model, the one place a plausible paragraph reads as a
// conclusion has acquired a generator.
{
  // The material sections moved into InterviewOutcome, which the summary route
  // and the report (before it is locked) both render, so the two cannot
  // drift. The assertions read the pair.
  const SUM =
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.summary.tsx";
  const OUTCOME = "src/components/employer/interview/InterviewOutcome.tsx";
  const sum = read(SUM) + read(OUTCOME);
  ok(
    !/useMutation|runInterviewAnalysis|runReportDraft|\.mutate\(/.test(sum),
    "the post-interview summary triggers an action — it must project records, not generate them",
  );
  for (const key of [
    "iiu.sm.examples",
    "iiu.sm.missing",
    "iiu.sm.followup",
    "iiu.sm.verify",
    "iiu.sm.assessments",
    "iiu.sm.comments",
  ]) {
    ok(sum.includes(`t("${key}")`), `the summary no longer renders ${key}`);
  }
  // The two sentences that stop an absence and a discrepancy being read as
  // findings about the person.
  ok(
    sum.includes('t("iiu.sm.missing.body")'),
    "the summary must say that a missing answer is not a missing ability",
  );
  ok(
    sum.includes('t("iiu.find.contradiction.note")'),
    "the summary must say that a contradiction is not a judgement about honesty",
  );
  ok(sum.includes('t("iiu.sm.nodecision")'), "the summary must state that it recommends nothing");
  // Empty states with a way out, not dead ends.
  for (const key of ["iiu.sm.examples.none", "iiu.sm.assessments.none", "iiu.sm.comments.none"]) {
    ok(sum.includes(`t("${key}")`), `the summary has no empty state for ${key}`);
  }
}

// Everything above the audit section is what an employer reads. Provenance is
// not deleted -- it moved to where an auditor looks.
{
  const RP =
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx";
  const rp = read(RP);
  const auditAt = rp.indexOf('aria-labelledby="s-audit"');
  ok(auditAt > 0, "the report no longer has an audit section to put provenance in");
  const normal = rp.slice(0, auditAt);
  for (const term of [
    "contentHash",
    "policyVersion",
    "modelName",
    "promptVersion",
    "packContentHash",
    "taskVersion",
  ]) {
    ok(
      !normal.includes(term),
      `the normal report view exposes ${term} — that belongs under audit details`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* 18 · No hash in the report body, no Swedish left in the component    */
/* ------------------------------------------------------------------ */

// Owner review found two things this file should have been catching. The
// report body rendered the PACK content hash inside the locked-report block,
// above the candidate's own content, and section 17's guard missed it because
// it searched for the camelCase `packContentHash` while the frozen payload is
// read with the snake_case key it was stored under.
{
  const RP =
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx";
  const rp = read(RP);
  const auditAt = rp.indexOf('aria-labelledby="s-audit"');
  const normal = rp.slice(0, auditAt);
  for (const term of ["pack_content_hash", "content_hash", "contentHash", "packContentHash"]) {
    ok(
      !normal.includes(term),
      `the report body renders ${term} — a checksum is an integrity fact for an auditor, not report content`,
    );
  }
  // And it must still exist somewhere, because moving provenance out of sight
  // is not the same as deleting it.
  ok(
    rp.slice(auditAt).includes("pack_content_hash"),
    "the pack content hash vanished entirely — it belongs under traceability, not nowhere",
  );
}

// Every recruiter-facing Interview Intelligence surface, swept for Swedish
// left in the component rather than in the dictionary. Section 8 checked this
// per-file against a list; this checks the whole set by shape, so a file added
// later is covered without anyone remembering to add it.
{
  const SURFACES = [
    ...["prepare", "interview", "evidence", "summary", "report", "panel", "index"].map(
      (r) =>
        `src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.${r}.tsx`,
    ),
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.index.tsx",
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.new.tsx",
    ...INTERVIEW_COMPONENTS,
  ];
  // A JSX text node, a string attribute or a braced literal containing a
  // Swedish glyph, that is not already a t(...) call.
  // Reuse customerFacingSwedish rather than a second detector.
  //
  // I wrote a glyph-based one here and it failed its own negative control:
  // "Processkvalitet" and "Verifieringar kvar" are Swedish and contain no
  // å, ä or ö, so a glyph test says they are fine. That is the exact trap this
  // file already learned once -- which is why customerFacingSwedish matches
  // Swedish MORPHOLOGY and a word list, not just the three extra letters.
  //
  // Two detectors would have drifted apart. There is now one.
  for (const file of SURFACES) {
    let body: string;
    try {
      body = read(file);
    } catch {
      continue; // a route that does not exist is not a localisation failure
    }
    // codeLines blanks comments, so a Swedish word explaining WHY a label
    // changed does not read as the label itself. Without it this guard fires
    // on its own commentary.
    const offending = codeLines(body)
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => customerFacingSwedish(line) && !line.includes("{t("));
    ok(
      offending.length === 0,
      `${file} still holds Swedish in the component at line(s) ${offending
        .slice(0, 3)
        .map((o) => o.n)
        .join(", ")} — customer copy belongs in the dictionary`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* 19 · The information architecture of the six work surfaces          */
/* ------------------------------------------------------------------ */

// Not "these screens look nice" -- nothing here can tell. These are the
// STRUCTURAL properties the visual work depends on, each of which would be
// cheap to lose in a later edit and expensive to notice.

const ASSESS =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.assessment.tsx";
const REVIEW =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.evidence.tsx";
const LIVE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.interview.tsx";
const PREPARE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.prepare.tsx";
const REPORT =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx";

{
  const assess = read(ASSESS);

  // Requirement, then material, then conclusion. The ORDER is the argument:
  // you read what the role asks for before you read what the candidate said.
  // A layout that led with the candidate's words would invite an impression
  // looking for a requirement to attach itself to.
  const req = assess.indexOf('t("iiu.as2.col.requirement")');
  const mat = assess.indexOf('t("iiu.as2.col.material")');
  const own = assess.indexOf('t("iiu.as2.col.assessment")');
  ok(
    req > 0 && mat > req && own > mat,
    "the assessment zones are out of order — requirement, then material, then your assessment",
  );

  // The single most important sentence on that screen. An empty material
  // column is the shape a low score takes when nobody says what it means.
  ok(
    assess.includes('t("iiu.as2.nomaterial.body")'),
    "the empty-material state no longer says that missing information is not poor performance",
  );
  ok(
    /"iiu\.as2\.nomaterial\.body":\s*\n?\s*"Det betyder att information saknas/.test(
      dictionaryRaw,
    ) &&
      /"iiu\.as2\.nomaterial\.body":\s*\n?\s*"This means information is missing/.test(
        dictionaryRaw,
      ),
    "that sentence must read the same in both locales",
  );

  // Progress is completion of the assessor's work, and says so.
  ok(
    assess.includes('t("iiu.as2.overview.note")'),
    "the assessment overview must say the counts describe the assessment, not the candidate",
  );
  // A ring, a bar or a percentage over these counts would be read as a score.
  ok(
    !/(?:width|stroke-dasharray):\s*[`'"]?\$?\{?[^}]*%/.test(assess) &&
      !/toFixed|Math\.round\([^)]*100/.test(assess),
    "the assessment overview expresses progress as a percentage or a bar",
  );

  // The uncertainty note is a real column that recordAssessment has always
  // accepted. It was unreachable from the UI for the life of the feature.
  ok(
    assess.includes("uncertaintyNote") && assess.includes('t("iiu.as2.unclear")'),
    "the assessment form no longer offers the missing/still-unclear field",
  );
}

{
  const review = read(REVIEW);

  // One question at a time. Reviewing eight in one scroll is how a reviewer
  // starts forming a view of the candidate while still deciding what the
  // material is.
  ok(
    /setActive\(/.test(review) && review.includes('t("iiu.rv.questions")'),
    "review no longer selects one question at a time",
  );

  // The kinds of material must stay visually distinct, and the legend that
  // states the distinction must stay on the page.
  ok(review.includes("<MaterialLegend />"), "review no longer states how the material differs");
  for (const state of ["note", "ai", "confirmed", "verify"]) {
    ok(
      review.includes(`<MaterialBadge state="${state}" />`),
      `review no longer labels ${state} material with its own badge`,
    );
  }

  // Confirm / edit / reject, and nothing that confirms by itself.
  for (const key of ["iiu.ev.confirm", "iiu.rv.edit", "iiu.rv.reject"]) {
    ok(review.includes(`t("${key}")`), `review no longer offers ${key}`);
  }
  ok(
    !/decision:\s*"accept"[^}]*\}\s*\)\s*;?\s*\}\s*,\s*\[/.test(review) &&
      !/useEffect\([^)]*decision:\s*"accept"/s.test(review),
    "review confirms a proposal without a person clicking",
  );

  // Review hands off to assessment; it does not contain one. Two names for one
  // scroll is exactly what splitting the steps was for.
  ok(review.includes('t("iiu.ev.toassess")'), "review no longer hands off to the assessment step");
  ok(
    !review.includes("recordAssessment") && !review.includes("markAssessed"),
    "the assessment workflow is back on the review screen — the two steps are one page again",
  );
}

{
  const live = read(LIVE);

  // Bounded support only. Every one of these words describes something this
  // product does not have, and each is exactly the kind of control a design
  // reference makes look obligatory.
  const body = codeOnly(live).toLowerCase();
  for (const term of [
    "transcript",
    "getusermedia",
    "mediarecorder",
    "audio",
    "recording",
    "webrtc",
    "chatcompletion",
    "sendmessage",
  ]) {
    ok(
      !body.includes(term),
      `the live interview screen contains "${term}" — it has no transcript, no recording and no chat`,
    );
  }
  for (const key of [
    "iiu.lv.cat.tocover",
    "iiu.lv.cat.followup",
    "iiu.lv.cat.clarify",
    "iiu.lv.cat.verify",
  ]) {
    ok(live.includes(`t("${key}")`), `the interview support column lost the ${key} category`);
  }

  // The save contract. Every one of these is the reason a note typed in the
  // last second before Next is not silently discarded.
  for (const [needle, why] of [
    ["const flushNote = async", "the explicit flush before leaving a question"],
    ["const guarded = async", "the guard that refuses to move on an unsaved note"],
    ["beforeunload", "the warning for the exit the handlers cannot intercept"],
    ["mutateAsync", "the awaited write flushNote depends on"],
  ] as const) {
    ok(live.includes(needle), `the live interview lost ${why}`);
  }
  // The optimistic question-state write must keep its rollback.
  ok(
    /onError:\s*\(_err,\s*vars\)/.test(live),
    "the optimistic question-state update lost its rollback — the chip would keep claiming a failed write succeeded",
  );

  // No rating control during the conversation.
  ok(
    !live.includes("recordAssessment"),
    "a rating control reached the live interview screen — the assessment happens after the account is complete",
  );
}

{
  const prepare = read(PREPARE);
  // The briefing sections a recruiter is meant to arrive with.
  for (const key of [
    "iiu.pp.focus.title",
    "iiu.pp.background.title",
    "iiu.pp.areas.title",
    "iiu.pp.clarify.title",
    "iiu.pp.verify2.title",
    "iiu.pp.plan.title",
    "iiu.pp.reqs.title",
  ]) {
    ok(prepare.includes(`t("${key}")`), `the preparation briefing lost ${key}`);
  }
  // Candidate-supplied information must never be presented as established.
  ok(
    prepare.includes('<MaterialBadge state="candidate" />') &&
      prepare.includes('t("iiu.pp.background.body")'),
    "candidate background is no longer labelled as the candidate's own unchecked claim",
  );
}

{
  const report = read(REPORT);
  // The employment decision is a stated boundary, never a control. There is no
  // employment-decision data model in this domain, and a disabled button would
  // promise one is coming.
  ok(
    report.includes('t("iiu.rp.s.decision")') && report.includes('t("iiu.rp.decision.boundary")'),
    "the report no longer states that the employment decision is recorded elsewhere",
  );
  const decisionBlock = report.slice(
    report.indexOf('aria-labelledby="d-decision"'),
    report.indexOf('aria-labelledby="d-ai"'),
  );
  ok(
    decisionBlock.length > 0 && !/<button|<input|<select|disabled/.test(decisionBlock),
    "the employment-decision section acquired a control — this engine records no decision",
  );
  // The six document sections, in order.
  const order = [
    "iiu.rp.s.scope",
    "iiu.rp.s.examples",
    "iiu.rp.s.assessment",
    "iiu.rp.s.followup",
    "iiu.rp.s.verify",
    "iiu.rp.s.comments",
  ].map((k) => report.indexOf(`t("${k}")`));
  ok(
    order.every((i) => i > 0) && order.every((v, i) => i === 0 || v > order[i - 1]),
    "the report's six sections are missing or out of order",
  );
}

/* ------------------------------------------------------------------ */
/* 20 · The 5E columns are read by the names the database uses         */
/* ------------------------------------------------------------------ */

// Both tables store e3_action. The reads asked for e3_exact_action, PostgREST
// refused them, `data` came back null, and every screen rendered "no confirmed
// material" -- which on this product reads as a candidate who said nothing
// rather than as a broken query.
{
  ok(
    !/e3_exact_action/.test(runtimeFns),
    "a read asks for e3_exact_action; the column is e3_action on both evidence tables",
  );
  ok(
    /INTERVIEW_READ_FAILED/.test(runtimeFns),
    "the reads whose emptiness means 'the candidate said nothing' must raise, not return an empty list",
  );
}

/* ------------------------------------------------------------------ */
/* 21 · The Review -> Assessment workflow, after hosted owner UAT       */
/* ------------------------------------------------------------------ */

// Every assertion here is a defect the owner met on the hosted database, in
// the order they met it. The governance rule underneath is NOT one of them and
// is asserted separately below: no confirmed evidence, no substantive level.

{
  const assess = read(ASSESS);
  const review = read(REVIEW);
  const panel =
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.panel.tsx";
  const panelSrc = read(panel);

  // --- A · a blocked question is never a dead end ------------------------
  ok(
    assess.includes('t("iiu.as2.blocked.title")') && assess.includes('t("iiu.as2.blocked.cta")'),
    "a question with no confirmed material must say so and offer a way to fix it",
  );
  ok(
    /search=\{\{\s*q:\s*qq\.code\s*\}\}/.test(assess),
    "the blocked-question CTA must deep-link to THAT question in review, not to the top of it",
  );
  ok(
    /validateSearch/.test(assess) && /validateSearch/.test(review),
    "both screens must accept the question search param the round trip rides on",
  );
  ok(
    /search=\{\{\s*q:\s*question\.code\s*\}\}/.test(review),
    "review must offer a route back to the SAME assessment question",
  );
  ok(
    assess.includes("sessionStorage"),
    "a half-written assessment must survive the trip to review and back",
  );

  // --- B · confirming material must not mean retyping it -----------------
  ok(
    review.includes('t("iiu.rv.use.note")') && /noteId:\s*n\.id/.test(review),
    "an interview note must be confirmable as material in one action, carrying its provenance",
  );
  ok(
    /_note_id:\s*data\.noteId/.test(runtimeFns),
    "authorEvidence must pass the note id through; the column and the RPC parameter both exist",
  );
  // The three kinds must stay three kinds. Confirming a note must not edit it.
  ok(
    !/scp_interview_session_notes/.test(
      runtimeFns.slice(
        runtimeFns.indexOf("export const authorEvidence"),
        runtimeFns.indexOf("export const recordAssessment"),
      ),
    ),
    "confirming material must not touch the note — a note, confirmed material and an assessment are three different claims",
  );

  // --- C/D · the scale a recruiter reads --------------------------------
  ok(
    assess.includes('t("iiu.as2.q")'),
    "the scale must ask what the RESPONSE demonstrated, not present bare levels",
  );
  for (const level of [0, 1, 2, 3, 4]) {
    ok(
      dictionaryRaw.includes(`"iiu.as2.lvl.${level}"`) &&
        dictionaryRaw.includes(`"iiu.as2.lvl.${level}.body"`),
      `level ${level} needs a recruiter-facing name and a behavioural description`,
    );
  }
  // Level 0 is an evidence state. It must never be drawn as the bottom of the
  // performance run, and must never be describable as failure.
  ok(
    assess.includes('t("iiu.as2.group.demonstrated")') &&
      assess.includes('t("iiu.as2.group.assessable")'),
    "level 0 must sit in its own group, apart from the levels 1-4",
  );
  ok(
    assess.includes('t("iiu.as2.zero.apart")'),
    "the screen must say that level 0 judges the material, not the person",
  );
  ok(
    /"iiu\.as2\.lvl\.0":\s*"Går inte att bedöma"/.test(dictionaryRaw) &&
      /"iiu\.as2\.lvl\.0":\s*"Cannot be assessed"/.test(dictionaryRaw),
    "and it must read as 'cannot be assessed' in both locales",
  );
  // The pinned pack wording is what the assessment is recorded against, so it
  // stays reachable. It lives inside scp_interview_pack_content_hash(), which
  // every case pins -- rewriting it in a migration would invalidate the hash on
  // every existing case, which is why the recruiter copy is a UI layer.
  ok(
    assess.includes('t("iiu.as2.anchor.governed")') && /a\.anchorEn : a\.anchorSv/.test(assess),
    "the pinned pack anchor must stay visible as what is actually recorded",
  );
  const FAIL_WORDS = [/\bunderkänd\b/i, /\bgodkänd\b/i, /\bfail(ed|ure)?\b/i, /\bpass(ed)?\b/i];
  for (const [key, value] of [
    ...[
      ...dictionaryRaw.matchAll(
        /^\s{4}"(iiu\.as2\.lvl\.[0-9](?:\.body)?)":\s*\n?\s*"((?:[^"\\]|\\.)*)"/gm,
      ),
    ].map((m) => [m[1], m[2]] as const),
  ]) {
    ok(
      !FAIL_WORDS.some((re) => re.test(value)),
      `${key} uses pass/fail language — the scale describes a response, not a verdict`,
    );
  }

  // --- E · editable until the record is released -------------------------
  ok(
    assess.includes('t("iiu.as2.edit")') && /supersedeReason:/.test(assess),
    "a recorded assessment must be reopenable, and the change must carry its documented reason",
  );
  ok(
    /supersedeReason:\s*z\.string\(\)/.test(runtimeFns),
    "recordAssessment must accept a supersede reason",
  );
  ok(
    assess.includes('t("iiu.as2.locked")') && /d\.report\?\.status === "final"/.test(assess),
    "and it must stop being editable once the report is released",
  );

  // --- F · joint review is a thing two or more people do -----------------
  ok(
    /"iiu\.pl\.title":\s*"Sambedömning"/.test(dictionaryRaw) &&
      /"iiu\.pl\.title":\s*"Joint review"/.test(dictionaryRaw),
    "the feature is called Sambedömning / Joint review",
  );
  ok(!/Panelgranskning/.test(dictionaryRaw), "no surface may still say Panelgranskning");
  ok(
    /jointReviewRelevant/.test(review) && /members\.length \?\? 0\) >= 2/.test(review),
    "the journey must offer joint review only when two or more assessors exist",
  );
  ok(
    panelSrc.includes('t("iiu.jr.how")') && panelSrc.includes('t("iiu.jr.single.title")'),
    "the panel screen must explain independent assessment, and say plainly when it does not apply",
  );

  // --- G · a recruiter must know WHY a question is blocked ---------------
  ok(
    assess.includes('t("iiu.as2.withmaterial")') &&
      assess.includes('t("iiu.as2.blockedcount")') &&
      assess.includes('t("iiu.as2.blockedlist")'),
    "progress must separate assessed, has-material and blocked-by-missing-material",
  );
}

/* ------------------------------------------------------------------ */
/* 22 · The governance rule the UX fix must not have weakened          */
/* ------------------------------------------------------------------ */

// No confirmed evidence, no substantive level. It is enforced in the database
// and the screen must keep telling the truth about it: the levels above 0 are
// disabled, and no code path submits one from a question with no material.
{
  const assess = read(ASSESS);
  ok(
    /const locked = level > 0 && blocked;/.test(assess),
    "levels above 0 must be disabled while a question has no confirmed material",
  );
  ok(
    /const blocked = evidence\.length === 0;/.test(assess),
    "and 'blocked' must mean exactly 'this question has no confirmed evidence'",
  );
  // The database is the enforcement. If the guard ever stops raising, the UI
  // being tidy would not save it.
  const runtimeSql = read("supabase/migrations/20260920090000_scp_interview_runtime.sql");
  const supersedeSql = read(
    "supabase/migrations/20261009090000_scp_interview_assessment_supersede_order.sql",
  );
  ok(
    /SCP_IV_NO_CONFIRMED_EVIDENCE:/.test(runtimeSql) &&
      /SCP_IV_NO_CONFIRMED_EVIDENCE:/.test(supersedeSql),
    "the confirmed-evidence rule must survive the rewrite of scp_iv_record_assessment",
  );
  // And it must be checked BEFORE the supersede branch, or a documented change
  // of mind becomes the way around it.
  const fn = supersedeSql.slice(
    supersedeSql.indexOf("CREATE OR REPLACE FUNCTION public.scp_iv_record_assessment"),
  );
  ok(
    fn.indexOf("SCP_IV_NO_CONFIRMED_EVIDENCE:") > 0 &&
      fn.indexOf("SCP_IV_NO_CONFIRMED_EVIDENCE:") < fn.indexOf("SCP_IV_SUPERSEDE_REASON_REQUIRED:"),
    "the evidence rule must be checked before the supersede branch, not after it",
  );
  ok(
    /R2\.17h/.test(read("supabase/tests/scp_interview_runtime_test.sql")),
    "and a test must prove superseding cannot reach a substantive level without material",
  );
}

console.log(`\n  assertions passed: ${passes}`);
if (failures > 0) {
  console.error(`\ninterview-ux-contract-check FAILED (${failures} issue(s))`);
  process.exit(1);
}
console.log("\nOK: navigation, disabled-AI rendering, model provenance, the start contract,");
console.log("    pilot-grant language and the no-scoring boundary all hold.");
