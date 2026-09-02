/**
 * Interview evidence reliability — is what the recruiter confirms exactly
 * what the assessor and the final report rely on?
 *
 * ── THE PRODUCT QUESTION ────────────────────────────────────────────────
 *
 * PR18 connected the interview to its application; PR19 made the recruiter's
 * journey four stages. PR20 hardens the evidence chain underneath: nothing a
 * recruiter confirms may disappear, duplicate, be rewritten under an
 * assessment, or leak into another candidate, application or employer.
 *
 * ── WHAT THIS PROVES, AND HOW ──────────────────────────────────────────
 *
 * SOURCE   The migration carries every control the contract names: the
 *          origin-in-case guard on all three tables, the case-row lock and
 *          identical-repeat return in each writer, the new report blocker, the
 *          idempotent finalisation, the corrected report constraint, and no
 *          new column, table, grant, score or ranking. The rollback restores
 *          each definition. The release bookkeeping is honest (pending, with
 *          the trigger function declared).
 *
 * SERVER   The loader raises on a failed read of session, notes, report and
 *          blockers instead of returning an empty list; the note save carries
 *          the version it was typed over, refuses a twin, and never reports a
 *          zero-row update as saved; the question-state write likewise.
 *
 * BROWSER  Every important action goes through single-flight; the note save
 *          is serialised and tracks the server version; a conflict is shown
 *          in words with the interviewer's text kept; the new states have
 *          copy in both languages and none of it judges the candidate.
 *
 * RUNTIME  The single-flight helper itself is executed: a same-input double
 *          call runs once, a different input runs separately, and a failure
 *          releases the key.
 *
 * Deterministic, offline, no database. The database half of this contract is
 * supabase/tests/scp_interview_evidence_reliability_test.sql.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { singleFlight } from "../src/lib/interview-intelligence/single-flight";
import { dictionaries } from "../src/i18n/dictionaries";

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

const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

/** Source with comments stripped, so a guard never trips on the prose that
 *  explains the rule it checks. */
const codeOnly = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");

/** SQL with `--` comments stripped. */
const sqlOnly = (source: string) =>
  source
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

const MIGRATION = "supabase/migrations/20261020090000_scp_interview_evidence_reliability.sql";
const ROLLBACK = "supabase/rollback/20261020090000_scp_interview_evidence_reliability_rollback.sql";
const SUITE = "supabase/tests/scp_interview_evidence_reliability_test.sql";
const RUNTIME_FNS = "src/lib/interview-intelligence/runtime.functions.ts";
const R = "src/routes/_authenticated.employer.$employerSlug.interview-intelligence";
const ROUTES = {
  interview: `${R}.$caseId.interview.tsx`,
  evidence: `${R}.$caseId.evidence.tsx`,
  assessment: `${R}.$caseId.assessment.tsx`,
  report: `${R}.$caseId.report.tsx`,
};
const UI = "src/components/employer/interview/InterviewUi.tsx";
const OUTCOME = "src/components/employer/interview/InterviewOutcome.tsx";

const migration = sqlOnly(read(MIGRATION));
const rollback = sqlOnly(read(ROLLBACK));
const fns = codeOnly(read(RUNTIME_FNS));

/* ------------------------------------------------------------------ */
/* A · Evidence is bound to its case, question and pinned pack          */
/* ------------------------------------------------------------------ */

ok(
  migration.includes("FUNCTION public.scp_iv_guard_evidence_origin_in_case()"),
  "A · the origin-in-case guard exists",
);
for (const table of [
  "scp_interview_evidence_proposals",
  "scp_interview_evidence",
  "scp_interview_findings",
]) {
  ok(
    new RegExp(
      `BEFORE INSERT OR UPDATE ON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.scp_iv_guard_evidence_origin_in_case\\(\\)`,
    ).test(migration),
    `A · the guard is attached to ${table} on insert AND update`,
  );
}
ok(
  migration.includes("SCP_IV_EVIDENCE_ORIGIN_MISMATCH") &&
    migration.includes("SCP_IV_EVIDENCE_DIMENSION_MISMATCH") &&
    migration.includes("SCP_IV_EVIDENCE_COMPETENCY_MISMATCH"),
  "A · a note, a passage, a dimension and a competency are each checked by name",
);
ok(
  /REVOKE ALL ON FUNCTION public\.scp_iv_guard_evidence_origin_in_case\(\) FROM PUBLIC, anon, authenticated/.test(
    migration,
  ),
  "A · the guard is executable by nobody outside a trigger",
);
ok(
  /scp_iv_guard_evidence_origin_in_case\(\)\s*RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public/.test(
    migration,
  ),
  "A · the guard pins its search_path",
);

/* ------------------------------------------------------------------ */
/* D/E · Double submit and retry create no duplicate                    */
/* ------------------------------------------------------------------ */

const fnBody = (name: string, source: string) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) return "";
  const end = source.indexOf("END; $$;", start);
  return source.slice(start, end);
};

const author = fnBody("scp_iv_author_evidence", migration);
ok(
  author.includes("FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE"),
  "D · authoring evidence serialises on the case row",
);
ok(
  /AND btrim\(excerpt\) = _text[\s\S]*IF _id IS NOT NULL THEN\s+RETURN _id;/.test(author),
  "D · the same material for the same question returns the existing item",
);
ok(author.includes("SCP_IV_EVIDENCE_TEXT_REQUIRED"), "D · empty material is refused by name");

const assess = fnBody("scp_iv_record_assessment", migration);
ok(
  assess.includes("FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE"),
  "E · recording an assessment serialises on the case row",
);
ok(
  /_existing_level = _level\s+AND _existing_rationale = btrim\(_rationale\)\s+AND _existing_uncertainty IS NOT DISTINCT FROM _uncertainty_note THEN\s+RETURN _existing;/.test(
    assess,
  ),
  "E · an identical repeated assessment returns the recorded one",
);
ok(
  assess.includes("SCP_IV_SUPERSEDE_REASON_REQUIRED") &&
    assess.includes("SCP_IV_NO_CONFIRMED_EVIDENCE") &&
    assess.includes("SET CONSTRAINTS public.scp_interview_assessments_superseded_by_fkey DEFERRED"),
  "E · a changed judgement still needs its reason, a level above 0 still needs evidence, and supersede still works",
);

const confirm = fnBody("scp_iv_confirm_evidence_proposal", migration);
ok(
  confirm.includes("WHERE id = _proposal_id FOR UPDATE") &&
    /_p\.reviewed_by = auth\.uid\(\) AND _p\.review_state = _target_state/.test(confirm) &&
    confirm.includes("SCP_IV_PROPOSAL_ALREADY_REVIEWED"),
  "E · a repeated identical decision returns its evidence; a different one is still refused",
);

const finalise = fnBody("scp_iv_finalise_report", migration);
ok(
  /\(_latest_payload #- '\{case,status_at_report\}'\) = \(_payload #- '\{case,status_at_report\}'\)[\s\S]*RETURN _latest_id;/.test(
    finalise,
  ),
  "D · finalising an unchanged case returns the report it already has",
);
ok(
  finalise.includes("ARRAY['owner','admin']") && finalise.includes("SCP_IV_FINALISE_ROLE"),
  "Q/R · owner/admin finalisation boundary is unchanged",
);
ok(
  !finalise.includes("scp_interview_evidence_proposals"),
  "H · the report builder does not read the proposals table",
);

const markAssessed = fnBody("scp_iv_mark_assessed", migration);
ok(
  /IF _status = 'assessed' THEN RETURN; END IF;/.test(markAssessed),
  "D · marking the assessment complete twice is one transition",
);

/* ------------------------------------------------------------------ */
/* G/J · Assessment ↔ evidence binding                                  */
/* ------------------------------------------------------------------ */

const blockers = fnBody("scp_iv_report_blockers", migration);
ok(
  blockers.includes("'ASSESSMENT_PREDATES_MATERIAL'") &&
    /ev\.confirmed_at > a\.assessed_at/.test(blockers),
  "G · the report is blocked while a live assessment predates confirmed material",
);
ok(
  blockers.includes("'QUESTION_NOT_ASSESSED'") &&
    blockers.includes("'PROPOSALS_AWAITING_REVIEW'") &&
    blockers.includes("'ASSESSMENT_NOT_COMPLETE'"),
  "G · the existing blockers survive",
);
ok(
  /GRANT SELECT\s+ON public\.scp_interview_evidence\s+TO authenticated;/.test(
    read("supabase/migrations/20260920090000_scp_interview_runtime.sql"),
  ) && !/GRANT (UPDATE|DELETE|INSERT)[^;]*scp_interview_evidence\b/.test(migration),
  "G · confirmed evidence stays SELECT-only for clients, so 'the material at assessment time' is exact",
);

/* ------------------------------------------------------------------ */
/* P · The frozen report and its versioning                            */
/* ------------------------------------------------------------------ */

ok(
  /ADD CONSTRAINT scp_interview_reports_final\s+CHECK \(\(status = 'draft'\) = \(finalised_at IS NULL\)\)/.test(
    migration,
  ),
  "P · a superseded report keeps its finalisation moment (versioning is possible)",
);
ok(
  !/ALTER TABLE[^;]*(ADD COLUMN|DROP COLUMN|DROP TABLE)/.test(migration) &&
    !/CREATE TABLE/.test(migration) &&
    !/CREATE (UNIQUE )?INDEX/.test(migration) &&
    !/CREATE POLICY|DROP POLICY/.test(migration),
  "DB · additive: no table, column, index or policy change",
);
ok(
  !/(ADD COLUMN|CREATE (OR REPLACE )?FUNCTION)[^;]*(total_score|suitability|ranking|hire_recommendation|fit_score)/.test(
    migration,
  ),
  "T · the migration creates no scoring, ranking, suitability or hire object",
);
ok(
  !/(UPDATE|DELETE FROM) public\.scp_interview_evidence\b/.test(migration),
  "P · nothing in the migration edits or deletes confirmed evidence",
);

/* ------------------------------------------------------------------ */
/* Rollback and bookkeeping                                            */
/* ------------------------------------------------------------------ */

for (const name of [
  "scp_iv_author_evidence",
  "scp_iv_confirm_evidence_proposal",
  "scp_iv_record_assessment",
  "scp_iv_mark_assessed",
  "scp_iv_report_blockers",
  "scp_iv_finalise_report",
]) {
  ok(
    rollback.includes(`CREATE OR REPLACE FUNCTION public.${name}(`),
    `rollback · restores ${name}`,
  );
}
ok(
  rollback.includes("DROP FUNCTION IF EXISTS public.scp_iv_guard_evidence_origin_in_case()") &&
    rollback.includes(
      "DROP TRIGGER IF EXISTS scp_interview_evidence_origin_in_case ON public.scp_interview_evidence",
    ),
  "rollback · removes the guard and its triggers",
);
ok(
  read("supabase/tests/scp_a_rollback_test.sql").includes(
    "DROP FUNCTION IF EXISTS public.scp_iv_guard_evidence_origin_in_case();",
  ),
  "rollback · the rollback verification suite knows the new function",
);
const releaseState = JSON.parse(read("supabase/release-state.json")) as {
  frontier: Array<{
    file: string;
    hostedState: string;
    introduces: Array<{ object: string }>;
    rollback?: string;
  }>;
};
const entry = releaseState.frontier.find((e) => e.file === path.basename(MIGRATION));
ok(entry !== undefined, "release · the migration is classified");
ok(entry?.hostedState === "pending", "release · and honestly marked pending, not applied");
ok(
  entry?.introduces.some((i) => i.object === "scp_iv_guard_evidence_origin_in_case") === true,
  "release · the introduced trigger function is declared",
);
ok(entry?.rollback === ROLLBACK, "release · the rollback is recorded");
ok(
  read("scripts/db-test.sh").includes(SUITE),
  "DB · the evidence reliability suite runs in the database job",
);
const suite = read(SUITE);
for (const group of ["ER1", "ER2", "ER3", "ER4", "ER5", "ER6", "ER7", "ER8", "ER9"]) {
  ok(suite.includes(`GROUP ${group}`), `DB · the suite covers ${group}`);
}

/* ------------------------------------------------------------------ */
/* M/N · Unknown is not empty, and a failed save is not a save          */
/* ------------------------------------------------------------------ */

ok(
  /\["session", sessionRes\],\s*\["report", reportRes\],\s*\["blockers", blockersRes\],/.test(fns),
  "M · a failed session, report or blocker read raises instead of rendering empty",
);
ok(
  /if \(notesRes\.error\)\s*throw new Error\(`INTERVIEW_READ_FAILED \(notes\)/.test(fns) &&
    /if \(sqRes\.error\)\s*throw new Error\(`INTERVIEW_READ_FAILED \(questions\)/.test(fns),
  "M · a failed notes read is not 'no notes'",
);
ok(
  codeOnly(read(UI)).includes("if (/^INTERVIEW_READ_FAILED/.test(raw)) {") &&
    codeOnly(read(UI)).includes('return t("iiu.err.read_failed");'),
  "M · the read failure has a sentence in the recruiter's language",
);
const saveNote = fns.slice(
  fns.indexOf("export const saveInterviewNote"),
  fns.indexOf("export const setQuestionState"),
);
ok(
  saveNote.includes("expectedUpdatedAt") &&
    /update = update\.eq\("updated_at", data\.expectedUpdatedAt\)/.test(saveNote),
  "stale · a note save carries the version it was typed over and updates only that version",
);
ok(
  saveNote.includes("SCP_IV_NOTE_STALE") &&
    saveNote.includes("SCP_IV_NOTE_NOT_WRITABLE") &&
    /rows && rows\.length === 1/.test(saveNote),
  "N · zero rows updated is never reported as saved",
);
ok(
  saveNote.includes("SCP_IV_NOTE_EXISTS") && /\.eq\("note_kind", data\.noteKind\)/.test(saveNote),
  "D · a second note for the same question and kind is refused, not inserted",
);
ok(
  /SCP_IV_QUESTION_NOT_WRITABLE/.test(fns) &&
    /\.eq\("question_id", data\.questionId\)\s*\.select\("question_id"\)/.test(fns),
  "N · a question-state write that touched no row is not 'marked'",
);
ok(
  /confirmed_at, e1_situation/.test(fns) && /superseded_by, assessed_at/.test(fns),
  "J · the loader carries when evidence was confirmed and when each judgement was made",
);
ok(
  /updatedAt: n\.updated_at as string/.test(fns) && /note_kind, body, updated_at/.test(fns),
  "stale · the loader carries each note's version",
);

/* ------------------------------------------------------------------ */
/* Single-flight: executed                                              */
/* ------------------------------------------------------------------ */

{
  let calls = 0;
  const resolvers: Array<() => void> = [];
  const fn = singleFlight((v: { id: string }) => {
    calls += 1;
    return new Promise<string>((resolve) => {
      resolvers.push(() => resolve(v.id));
    });
  });
  const p1 = fn({ id: "a" });
  const p2 = fn({ id: "a" });
  const p3 = fn({ id: "b" });
  ok(p1 === p2, "22 · a same-input second call returns the in-flight promise");
  ok(calls === 2, "22 · a different input runs on its own");
  resolvers.forEach((r) => r());
  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  ok(r1 === "a" && r2 === "a" && r3 === "b", "22 · both callers see the one result");
  const p4 = fn({ id: "a" });
  ok(
    p4 !== p1 && calls === 3,
    "22 · after settling, the same input runs again (a retry is a new request)",
  );
  resolvers.forEach((r) => r());
  await p4;

  let failing = 0;
  const bad = singleFlight(async (_v: number) => {
    failing += 1;
    throw new Error("boom");
  });
  await bad(1).catch(() => undefined);
  await bad(1).catch(() => undefined);
  ok(failing === 2, "22 · a failure releases the key, so the recruiter can try again");
}

for (const [route, fnNames] of [
  ["evidence", ["authorOnce", "reviewOnce", "analyseOnce"]],
  ["assessment", ["assessOnce", "doneOnce"]],
  ["report", ["finaliseOnce"]],
] as const) {
  const src = codeOnly(read(ROUTES[route]));
  ok(
    src.includes('from "@/lib/interview-intelligence/single-flight"'),
    `22 · the ${route} route uses single-flight`,
  );
  for (const n of fnNames) {
    ok(
      new RegExp(`const ${n} = useMemo\\(\\s*\\(\\) =>\\s*singleFlight\\(`).test(src),
      `22 · ${route}: ${n} is single-flight and memoised across renders`,
    );
  }
}
{
  const ev = codeOnly(read(ROUTES.evidence));
  ok(
    /mutationFn: \(v: \{ questionId: string; excerpt: string; noteId: string \| null \}\) =>\s*authorOnce\(/.test(
      ev,
    ) &&
      /reviewOnce\(\{/.test(ev) &&
      /analyseOnce\(\{ caseId \}\)/.test(ev),
    "22 · evidence: author, review and analyse all go through it",
  );
  const as = codeOnly(read(ROUTES.assessment));
  ok(
    /assessOnce\(\{/.test(as) && /doneOnce\(\{ caseId \}\)/.test(as),
    "22 · assess and finish go through it",
  );
  const rp = codeOnly(read(ROUTES.report));
  ok(/finaliseOnce\(\{/.test(rp), "22 · finalise goes through it");
}

/* ------------------------------------------------------------------ */
/* Notes: serialised, versioned, conflict shown                         */
/* ------------------------------------------------------------------ */
{
  const iv = codeOnly(read(ROUTES.interview));
  ok(
    /const chain = useRef<Promise<unknown>>\(Promise\.resolve\(\)\)/.test(iv) &&
      /const run = chain\.current\.then\(async \(\) => \{/.test(iv) &&
      /chain\.current = run\.catch\(\(\) => undefined\)/.test(iv),
    "23 · note saves run one after another, in order",
  );
  ok(
    /expectedUpdatedAt: k\?\.updatedAt \?\? null/.test(iv) &&
      /known\.current\[vars\.questionId\] = \{\s*id: res\.noteId,\s*updatedAt: res\.updatedAt,\s*body: vars\.body,?\s*\}/.test(
        iv,
      ),
    "stale · every save carries the last version this tab saw and advances it on success",
  );
  ok(
    /Date\.parse\(mine\.updatedAt\) > Date\.parse\(existingNote\.updatedAt\)/.test(iv) &&
      /setDraft\(fresher\)/.test(iv),
    "23 · returning to a question seeds the box from the freshest text this tab knows, never from a stale cache",
  );
  ok(
    !/noteId: existingNote\?\.id/.test(iv) && !/noteId: stored\.id/.test(iv),
    "D · no save path reads the note id from render state any more (that is how twins were made)",
  );
  ok(
    /SCP_IV_NOTE_\(STALE\|EXISTS\)/.test(iv) && /setNoteConflict\(true\)/.test(iv),
    "stale · a refused stale save becomes a conflict state, not a generic failure",
  );
  ok(
    /if \(noteConflict\) return;/.test(iv),
    "stale · the autosave stops while a conflict is unresolved",
  );
  ok(
    /const reloadNote = async \(\) =>/.test(iv) &&
      /await q\.refetch\(\)/.test(iv) &&
      /setDraft\(n\?\.body \?\? ""\)/.test(iv),
    "stale · resolving the conflict re-reads the server and is the interviewer's explicit act",
  );
  ok(
    /t\("iiu\.iv\.note\.conflict\.title"\)/.test(iv) &&
      /t\("iiu\.iv\.note\.conflict\.body"\)/.test(iv) &&
      /t\("iiu\.iv\.note\.conflict\.reload"\)/.test(iv) &&
      /role="alert" title=\{t\("iiu\.iv\.note\.conflict\.title"\)\}/.test(iv),
    "25 · the conflict is announced, in words, with its own control",
  );
  ok(
    /role="status"[\s\S]{0,200}aria-live="polite"/.test(read(ROUTES.interview)),
    "25 · the save state is a live region",
  );
}

/* ------------------------------------------------------------------ */
/* G · Material after assessment is visible, in words                  */
/* ------------------------------------------------------------------ */
{
  const as = codeOnly(read(ROUTES.assessment));
  ok(
    /Date\.parse\(e\.confirmedAt\) > Date\.parse\(existing\.assessedAt\)/.test(as) &&
      /t\("iiu\.ev\.stale\.chip"\)/.test(as) &&
      /title=\{t\("iiu\.ev\.stale\.title"\)\}/.test(as),
    "G · the assessment screen names material the recorded judgement does not cover",
  );
  const oc = codeOnly(read(OUTCOME));
  ok(
    /Date\.parse\(e\.confirmedAt\) > Date\.parse\(a\.assessedAt\)/.test(oc) &&
      /t\("iiu\.ev\.stale\.chip"\)/.test(oc),
    "G · so does the report material view",
  );
  const ui = codeOnly(read(UI));
  ok(
    /case "ASSESSMENT_PREDATES_MATERIAL":/.test(ui) &&
      /t\("iiu\.rp\.blk\.assessment_predates"\)/.test(ui),
    "G · the report blocker has a recruiter sentence, not a code",
  );
  ok(
    /SCP_IV_NOTE_STALE: "iiu\.err\.note_stale"/.test(ui) &&
      /SCP_IV_EVIDENCE_ORIGIN_MISMATCH: "iiu\.err\.evidence_origin"/.test(ui) &&
      /SCP_IV_PROPOSAL_ALREADY_REVIEWED: "iiu\.err\.proposal_already_reviewed"/.test(ui),
    "25 · every new refusal has a translated sentence",
  );
}

/* ------------------------------------------------------------------ */
/* L/U · Neutral wording, in both languages                            */
/* ------------------------------------------------------------------ */
{
  const sv = dictionaries.sv as Record<string, string>;
  const en = dictionaries.en as Record<string, string>;
  const KEYS = [
    "iiu.ev.stale.chip",
    "iiu.ev.stale.title",
    "iiu.ev.stale.body",
    "iiu.rp.blk.assessment_predates",
    "iiu.iv.note.conflict.title",
    "iiu.iv.note.conflict.body",
    "iiu.iv.note.conflict.reload",
    "iiu.err.note_stale",
    "iiu.err.note_exists",
    "iiu.err.note_not_writable",
    "iiu.err.evidence_origin",
    "iiu.err.proposal_already_reviewed",
    "iiu.err.read_failed",
  ];
  for (const k of KEYS) {
    ok(typeof sv[k] === "string" && sv[k].length > 0, `U · ${k} has Swedish copy`);
    ok(
      typeof en[k] === "string" && en[k].length > 0 && en[k] !== sv[k],
      `U · ${k} has English copy`,
    );
  }
  // Absence and change are neutral. None of the new copy may read as a
  // judgement about the candidate.
  const JUDGEMENT =
    /(svaghet|brist(er)?\b|underkän|misslyck|dålig|röd flagg|weakness|fail|poor|red flag|unsuitab|olämplig)/i;
  for (const k of KEYS) {
    ok(!JUDGEMENT.test(sv[k]) && !JUDGEMENT.test(en[k]), `L · ${k} does not judge the candidate`);
  }
  ok(
    /Bedömningen står kvar som den gjordes/.test(sv["iiu.ev.stale.body"]) &&
      /The assessment stands as it was made/.test(en["iiu.ev.stale.body"]),
    "G · the copy says the assessment is kept, not invalidated",
  );
  ok(
    /Texten här har inte sparats/.test(sv["iiu.iv.note.conflict.body"]) &&
      /has not been saved/.test(en["iiu.iv.note.conflict.body"]),
    "N · the conflict copy says the text was NOT saved",
  );
}

/* ------------------------------------------------------------------ */
/* Locked things that must not have moved                              */
/* ------------------------------------------------------------------ */
ok(
  !/scp_interview_rating_anchors[^;]*(UPDATE|INSERT|DELETE)/.test(migration) &&
    !/UPDATE public\.scp_interview_core_questions/.test(migration),
  "12/27 · no anchor or question content is touched",
);
ok(
  !/scp_interview_ai_config|provider_mode|ai_enabled/.test(migration),
  "9/27 · the AI provider architecture is untouched",
);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
