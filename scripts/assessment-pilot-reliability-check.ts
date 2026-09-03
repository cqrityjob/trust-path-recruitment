// Assessment pilot reliability guard — the client half of the assessment loop.
//
// Run via `bun run assessment-reliability:check`.
//
// ── WHAT THIS COVERS THAT NOTHING ELSE DOES ─────────────────────────────
//
// The DATABASE half of this loop is already proven, thoroughly, by
// supabase/tests/employer_vaktare_journey_test.sql: submitting an incomplete
// run is refused (VJ6), submitting twice is refused (VJ6.6), answers survive
// leaving and resuming (VJ5), releasing twice is refused (VJ10.5) and another
// organisation's owner cannot release at all (VJ10.1). None of that is
// repeated here.
//
// What no database test can reach is what the CLIENT does with those answers,
// and every defect this guard exists for lives there:
//
//   1. Two saves for one item, fired concurrently, can land in either order —
//      and scp_save_response replaces the whole row, so the loser silently
//      overwrites a good answer. Nothing fails. Both writes succeed.
//   2. A written answer that only reached the server on blur did not exist
//      anywhere else for the eight minutes before that blur.
//   3. "SCP_INCOMPLETE_ATTEMPT" rendered as a panel offering "Submit again",
//      which is the one action guaranteed to be refused for the same reason.
//   4. A single failed save drew "This assessment could not be opened" over a
//      run that was open, answered and resumable.
//   5. "SCP_ALREADY_RELEASED" — the brief IS shared — was reported to the
//      recruiter as "the material could not be shared".
//   6. The screen every participant ends on promised an applicant a
//      "development report" they will never get, from an employer they do not
//      have.
//
// Sections 1 and 2 below RUN the ordering logic. The rest read source and the
// dictionary: they cannot prove a click navigates, only that the code is built
// so the defect cannot come back unnoticed.

import { readFileSync } from "node:fs";
import { createAnswerQueue } from "../src/lib/security-competency/answer-queue";
import { dictionaries } from "../src/i18n/dictionaries";

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
/** Source with comments removed. Every assertion below is about what a file
 *  DOES, and a phrase quoted in a comment must never be able to satisfy one. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const RUNTIME = "src/routes/_authenticated.academy.$attemptId.tsx";
const REPORT = "src/routes/_authenticated.academy.report.$attemptId.tsx";
const CANDIDATES = "src/routes/_authenticated.employer.$employerSlug.assessments.participants.tsx";
const REVIEW_QUEUE = "src/components/academy/ReviewQueue.tsx";
// The three things the run says about ITSELF. They live outside the route so
// that states nobody reaches by hand can be rendered and read — see
// scripts/assessment-panels-render-check.tsx.
const PANELS = "src/components/academy/AttemptPanels.tsx";

const runtime = stripComments(read(RUNTIME));
const report = stripComments(read(REPORT));
const candidates = stripComments(read(CANDIDATES));
const reviewQueue = stripComments(read(REVIEW_QUEUE));
const panels = stripComments(read(PANELS));

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
console.log("\n1. Two writes to one answer cannot land out of order");
{
  // The exact shape of the defect: choose "best", then choose "worst" a moment
  // later. The first request is SLOWER than the second. Unqueued, the stored
  // answer ends up as the first one — the pairing without its "worst" — while
  // the screen shows both.
  const landed: string[] = [];
  const q = createAnswerQueue();
  const slowThenFast = async (label: string, ms: number) => {
    await sleep(ms);
    landed.push(label);
  };

  const a = q.enqueue("item-1", () => slowThenFast("best", 40));
  const b = q.enqueue("item-1", () => slowThenFast("best+worst", 1));
  await Promise.all([a, b]);

  check(
    "1.1 the later write for one item is the one that lands last",
    landed.join(",") === "best,best+worst",
    `landed as ${landed.join(",") || "nothing"}`,
  );

  // Unqueued, for contrast — this is what the code did before, and it is the
  // bug. Asserted so that "the queue is doing nothing" is a failure here
  // rather than a silent no-op.
  const raw: string[] = [];
  await Promise.all([
    (async () => {
      await sleep(40);
      raw.push("best");
    })(),
    (async () => {
      await sleep(1);
      raw.push("best+worst");
    })(),
  ]);
  check(
    "1.2 without the queue the same two writes DO invert (the defect is real)",
    raw.join(",") === "best+worst,best",
    `landed as ${raw.join(",")}`,
  );
}

{
  // Different items must NOT be serialised: fifty answers in single file would
  // turn a run into fifty sequential round trips.
  const q = createAnswerQueue();
  const started: string[] = [];
  const finished: string[] = [];
  const work = (id: string, ms: number) => async () => {
    started.push(id);
    await sleep(ms);
    finished.push(id);
  };
  await Promise.all([q.enqueue("a", work("a", 30)), q.enqueue("b", work("b", 1))]);
  check(
    "1.3 writes for different items run concurrently",
    started.join(",") === "a,b" && finished.join(",") === "b,a",
    `started ${started.join(",")}, finished ${finished.join(",")}`,
  );
}

{
  // A failed save must not stop the next attempt at the same answer. This is
  // the retry path, and a chain that stalls on a rejection would swallow it.
  const q = createAnswerQueue();
  const landed: string[] = [];
  const failing = q.enqueue("item-1", async () => {
    throw new Error("network");
  });
  const following = q.enqueue("item-1", async () => {
    landed.push("second");
  });
  // Taken from the promise itself rather than a flag a callback sets, so the
  // assertion is about what `enqueue` returned and not about whether some
  // handler happened to run first.
  const outcome = await failing.then(
    () => "resolved" as const,
    () => "rejected" as const,
  );
  await following;
  check("2.1 a failed write still lets the next write for that item run", landed.length === 1);
  check("2.2 a failed write never rejects out of the queue", outcome === "resolved");
}

// ---------------------------------------------------------------------------
console.log("\n2. Submission waits for answers still in the air");
{
  const q = createAnswerQueue();
  const arrived: string[] = [];
  void q.enqueue("last-item", async () => {
    await sleep(25);
    arrived.push("last-item");
  });
  check("2.3 an in-flight write is outstanding immediately, not a tick later", q.size() === 1);
  check("2.4a and has not landed yet when the drain begins", arrived.length === 0);
  await q.drain();
  check("2.4 drain resolves only once the write has landed", arrived.length === 1);
  check("2.5 nothing is outstanding after a drain", q.size() === 0);
}

{
  // Work queued WHILE draining must also be waited for. A debounced text save
  // flushed at submit time enqueues during exactly this window.
  const q = createAnswerQueue();
  const order: string[] = [];
  void q.enqueue("a", async () => {
    await sleep(10);
    order.push("first");
    void q.enqueue("b", async () => {
      await sleep(10);
      order.push("queued-during-drain");
    });
  });
  await q.drain();
  check(
    "2.6 a write queued during the drain is waited for too",
    order.join(",") === "first,queued-during-drain",
    `order was ${order.join(",")}`,
  );
}

{
  const q = createAnswerQueue();
  const settled = await Promise.race([
    q.drain().then(() => "drained" as const),
    sleep(500).then(() => "hung" as const),
  ]);
  check("2.7 draining an empty queue resolves rather than hanging", settled === "drained");
}

// ---------------------------------------------------------------------------
console.log("\n3. The runtime uses the queue, and sends the whole answer");
{
  check(
    "3.1 the participant runtime routes its saves through the queue",
    runtime.includes("createAnswerQueue()") && runtime.includes("queue.current.enqueue"),
  );
  check(
    "3.2 submit drains the queue before calling the submit RPC",
    /flushPendingSaves\(\)[\s\S]{0,900}submitAttempt\(/.test(runtime),
    "the drain must come before scp_submit_attempt, not after it",
  );
  check(
    "3.3 the drain is the queue's, not a second implementation",
    /function flushPendingSaves\(\)[\s\S]{0,200}queue\.current\.drain\(\)/.test(runtime),
  );
  // scp_save_response replaces the whole row, so a save that names only the
  // half that changed nulls the other half. Every save must carry all four.
  const saveCall = /saveResponse\(\{[\s\S]*?\}\);/.exec(runtime)?.[0] ?? "";
  for (const field of [
    "selectedOptionId: a.savedOptionId",
    "bestOptionId: a.savedBestId",
    "worstOptionId: a.savedWorstId",
    "responseText: a.savedText",
  ]) {
    check(
      `3.4 the save carries ${field.split(":")[0]} from the merged answer`,
      saveCall.includes(field),
    );
  }
  check(
    "3.5 nothing sends a hand-assembled partial answer any more",
    !runtime.includes("void persist({") && !runtime.includes("applyLocal("),
    "persist takes an item id and the merged answer, never a loose patch",
  );
  check(
    "3.6 best/worst merges onto the item as it stands, not this render's copy",
    runtime.includes("itemsRef.current = itemsRef.current.map(") &&
      !runtime.includes("current.savedBestId,") &&
      !runtime.includes("current.savedWorstId,"),
  );
}

// ---------------------------------------------------------------------------
console.log("\n4. A written answer is not held in one browser tab");
{
  check(
    "4.1 typing schedules a save rather than waiting for a blur",
    /onChange=\{\(e\) => \{[\s\S]{0,400}setTimeout\(flushText, TEXT_SAVE_DELAY_MS\)/.test(runtime),
  );
  check("4.2 blur still saves immediately", runtime.includes("onBlur={flushText}"));
  const delay = /const TEXT_SAVE_DELAY_MS = (\d+);/.exec(runtime)?.[1];
  check(
    "4.3 the debounce is short, and is not the mechanism the answer relies on",
    delay !== undefined && Number(delay) <= 1500,
    `TEXT_SAVE_DELAY_MS is ${delay ?? "absent"}`,
  );
  // Every exit from the question must flush first. A delay that is merely
  // "usually long enough" is the thing this must not degrade into.
  check(
    "4.4 moving between questions flushes the typed answer first",
    /const goTo = useCallback\([\s\S]{0,400}flushText\(\);/.test(runtime),
  );
  check(
    "4.5 submitting flushes the typed answer before draining",
    /async function onSubmit\(\)[\s\S]{0,600}flushText\(\);[\s\S]{0,400}flushPendingSaves\(\)/.test(
      runtime,
    ),
  );
  check(
    "4.6 unmounting flushes the typed answer",
    /removeEventListener\("beforeunload"[\s\S]{0,120}flushText\(\);/.test(runtime),
  );
  check(
    "4.7 leaving the page warns only when something really is unsaved",
    /const unsaved = \(\) => textDirty\.current !== null \|\| queue\.current\.size\(\) > 0/.test(
      runtime,
    ) && /if \(!unsaved\(\)\) return;/.test(runtime),
  );
  // The box must not be rewritten from state while somebody is typing in it.
  check(
    "4.8 the written answer is loaded into the box once per item",
    runtime.includes("loadedFor.current === id") && runtime.includes("loadedFor.current = id"),
  );
  // What scp_save_response actually stores: nullif(btrim(text), '').
  check(
    "4.9 the run applies the same normalisation the database applies",
    /function asStored\(text: string\): string \| null \{[\s\S]{0,160}text\.trim\(\)/.test(runtime),
    "otherwise the screen shows an answer the database discarded",
  );
}

// ---------------------------------------------------------------------------
console.log("\n5. 'Saved' is set by the reply, never by the click");
{
  check(
    "5.1 saving, saved and failed are the three states, and saved follows the await",
    /await saveResponse\(\{[\s\S]{0,600}\}\);[\s\S]{0,400}\[itemId\]: "saved"/.test(runtime),
  );
  check(
    "5.2 a failed save is recorded against that answer",
    /catch \{[\s\S]{0,120}\[itemId\]: "failed"/.test(runtime),
  );
  // The defect: one transient save failure drew the LOAD failure panel over a
  // run that was open and fully resumable.
  check(
    "5.3 a failed save no longer ends the run",
    !/save_failed[\s\S]{0,80}setPhase\("error"\)/.test(runtime) &&
      !/\[itemId\]: "failed"[\s\S]{0,200}setPhase\("error"\)/.test(runtime),
  );
  check(
    "5.4 a failed save offers a way to send it again",
    panels.includes('t("academy.save.retry")') && runtime.includes("onRetry="),
  );
  check(
    "5.5 the status is silent until something has actually been sent",
    /if \(!state\) return null;/.test(panels),
    "otherwise a resumed run claims 'Saved' for requests never made",
  );
  check(
    "5.6 a failure is announced and a progress note is not",
    /role="alert"/.test(panels) && /aria-live="polite"/.test(panels),
  );
}

// ---------------------------------------------------------------------------
console.log("\n6. A submission with answers missing says which, and routes there");
{
  check(
    "6.1 missing answers are their own state, not a failure",
    runtime.includes('| "incomplete"') && runtime.includes('setPhase("incomplete")'),
  );
  check(
    "6.2 what is missing is read from the server, not from local state",
    /async function readMissing\(\): Promise<AcademyItem\[\]> \{[\s\S]{0,400}await loadItems\(/.test(
      runtime,
    ),
    "this component's copy can be stale, and 'you are missing an answer' must not be said from it",
  );
  check(
    "6.3 the check happens before the submit RPC, not only after its refusal",
    /const gaps = await readMissing\(\);[\s\S]{0,300}setPhase\("incomplete"\);[\s\S]{0,200}return;[\s\S]{0,300}submitAttempt\(/.test(
      runtime,
    ),
  );
  check(
    "6.4 a refusal for completeness routes to the same named list",
    /code === "incomplete" \|\| code === "incomplete_best_worst"/.test(runtime) &&
      /code === "incomplete"[\s\S]{0,400}setPhase\("incomplete"\)/.test(runtime),
  );
  // The whole point. The old panel's only control retried a call that was
  // guaranteed to be refused for exactly the same reason.
  const panel = /if \(phase === "incomplete"\) \{[\s\S]*?^ {2}\}$/m.exec(runtime)?.[0] ?? "";
  check("6.5 the missing-answers panel exists", panel.length > 0);
  check(
    "6.6 it offers no 'submit again' — there is nothing to retry",
    panel.length > 0 && !panel.includes("onSubmit()"),
  );
  check(
    "6.7 it says how many are missing",
    panels.includes("missing.length") && panels.includes('tp("academy.incomplete.count"'),
  );
  check(
    "6.8 it routes to a question that has no answer",
    panel.includes("goToMissing(") && panels.includes('t("academy.incomplete.goToFirst")'),
  );
  check(
    "6.8b the panel itself offers no retry either",
    !panels.includes("academy.submitFailed.retry"),
  );
  check(
    "6.9 routing moves the focus, not only the screen",
    /function goToMissing\([\s\S]{0,300}focusPrompt\.current = true/.test(runtime) &&
      /focusPrompt\.current = false;[\s\S]{0,80}promptRef\.current\?\.focus\(\)/.test(runtime),
    "routing somebody to question 31 without the focus only works for people using a mouse",
  );
  check(
    "6.10 it says the other answers are safe",
    panels.includes('t("academy.incomplete.note")') &&
      /sparade|förlorat/.test(sv["academy.incomplete.note"] ?? "") &&
      /saved|lost/.test(en["academy.incomplete.note"] ?? ""),
  );
  check(
    "6.11 nothing about it reads as a failure",
    !/misslyck|fel\b/i.test(sv["academy.incomplete.title"] ?? "x") &&
      !/fail|error/i.test(en["academy.incomplete.title"] ?? "x"),
    `sv: ${sv["academy.incomplete.title"]} / en: ${en["academy.incomplete.title"]}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n7. Submission stays single-flight and idempotent");
{
  check(
    "7.1 a second click during the round trip is dropped synchronously",
    /if \(submittingRef\.current\) return;[\s\S]{0,80}submittingRef\.current = true;/.test(runtime),
    "a state flag would not have updated yet and would run the RPC twice",
  );
  check(
    "7.2 the flag is always released, including on the incomplete path",
    /\} finally \{[\s\S]{0,80}submittingRef\.current = false;/.test(runtime),
  );
  check(
    "7.3 'already submitted' is reported as done, not as a failure",
    /if \(code === "not_open"\)[\s\S]{0,200}setPhase\("done"\)/.test(runtime),
  );
  check(
    "7.4 an ambiguous failure asks the server before saying anything",
    /await loadState\(\{ data: \{ attemptId \} \}\)[\s\S]{0,200}setPhase\("done"\)/.test(runtime),
    "a reply lost on the wire is indistinguishable from a refusal, and only one is a failure",
  );
}

// ---------------------------------------------------------------------------
console.log("\n8. Sharing a brief twice is not a failure");
{
  check(
    "8.1 SCP_ALREADY_RELEASED is treated as the success it is",
    /code === "SCP_ALREADY_RELEASED"[\s\S]{0,300}releaseAlready/.test(candidates),
  );
  check(
    "8.2 it refetches the row rather than leaving a stale one",
    /code === "SCP_ALREADY_RELEASED"[\s\S]{0,300}invalidateQueries/.test(candidates),
  );
  check(
    "8.3 it does not fall through to the failure message",
    /code === "SCP_ALREADY_RELEASED"[\s\S]{0,320}return;/.test(candidates),
  );
  // Single-flight, now by a ref rather than by the disabled attribute alone.
  // PR-V2 moved the confirmation into ConfirmAction (an alert dialog), and a
  // second activation of the confirm control can land before React re-renders
  // -- which is exactly the click a state flag misses and the one that would
  // run scp_release_attempt_report twice. The ref updates synchronously, and
  // `busy` still disables both controls in the dialog.
  check(
    "8.4 the release is single-flight against a click React has not re-rendered for",
    /releasingRef = useRef\(false\)/.test(candidates) &&
      /if \(releasingRef\.current\) return;\s*releasingRef\.current = true;\s*releaseM\.mutate\(\)/.test(
        candidates,
      ) &&
      /onSettled: \(\) => \{\s*releasingRef\.current = false;/.test(candidates),
  );
  check(
    "8.4b and the dialog's own controls are disabled while it is in flight",
    /busy=\{releaseM\.isPending\}/.test(candidates),
  );
  for (const [lang, d] of [
    ["sv", sv],
    ["en", en],
  ] as const) {
    const msg = d["academy.participants.releaseAlready"] ?? "";
    check(
      `8.5 the ${lang} wording does not claim a failure`,
      msg.length > 0 && !/kunde inte|misslyck|could not|failed/i.test(msg),
      msg,
    );
  }
  // The readiness gate itself is unchanged and stays the database's.
  check(
    "8.6 releasing still requires the database's own readiness condition",
    candidates.includes("SCP_RELEASE_BEFORE_SCORED"),
  );
}

// ---------------------------------------------------------------------------
console.log("\n9. Reviewer work is not discarded without saying so");
{
  check(
    "9.1 an unfinished review warns before the page is left",
    /addEventListener\("beforeunload"/.test(reviewQueue) &&
      /if \(!startedRef\.current\) return;/.test(reviewQueue),
  );
  check(
    "9.2 'started' means the reviewer has actually entered something",
    /rationale\.trim\(\) !== "" \|\| finding !== null \|\| Object\.keys\(levels\)\.length > 0/.test(
      reviewQueue,
    ),
  );
  check("9.3 a completed review stops warning", /!m\.isSuccess &&/.test(reviewQueue));
  check(
    "9.4 the card says so on the page too, not only in a browser dialog",
    reviewQueue.includes('t("academy.reviews.unsaved")'),
  );
  check(
    "9.5 completing a review is still single-flight",
    /disabled=\{m\.isPending \|\| incomplete\}/.test(reviewQueue),
  );
  check(
    "9.6 a review already completed elsewhere is reported as that, not as a failure",
    reviewQueue.includes("SCP_REVIEW_NOT_PENDING"),
  );
  // No methodology change. The reviewer still supplies a judgement and the
  // contribution is still derived server-side.
  check(
    "9.7 no contribution is sent from the client",
    !/contribution/.test(reviewQueue),
    "the number is derived inside scp_complete_human_review and must stay there",
  );
}

// ---------------------------------------------------------------------------
console.log("\n10. Recruitment is not addressed in workforce words");
{
  // The run's own screens.
  check(
    "10.1 the screen the run ENDS on forks on purpose",
    /academy\.done\.bodyRecruitment/.test(panels) &&
      /academy\.done\.alreadyBodyRecruitment/.test(panels) &&
      /academy\.done\.releasedBodyRecruitment/.test(panels),
  );
  check(
    "10.2 it forks on the purpose the participant's own work list carries",
    /recruitment[\s\S]{0,120}academy\.done\.releasedBodyRecruitment/.test(panels) &&
      /recruitment=\{recruitment\}/.test(runtime),
    "the run reads use_case from scp_my_academy_work; the panel only renders it",
  );
  // The participant's report.
  check(
    "10.3 the report forks on the snapshot's frozen person context",
    /const candidate = r\.context\?\.personContext === "candidate";/.test(report),
    "re-deriving it would let a released snapshot change its purpose after the fact",
  );
  check(
    "10.4 the report title and reason fork with it",
    /candidate \? "academy\.report\.titleRecruitment"/.test(report) &&
      /candidate \? "academy\.report\.whyBodyRecruitment"/.test(report),
  );

  // And the recruitment wording is actually free of the workforce claims.
  const RECRUITMENT_KEYS = [
    "academy.done.bodyRecruitment",
    "academy.done.alreadyBodyRecruitment",
    "academy.done.releasedBodyRecruitment",
    "academy.report.titleRecruitment",
    "academy.report.whyBodyRecruitment",
    "academy.report.suggestedRecruitment",
  ];
  const WORKFORCE_SV = /utvecklingsrapport|kompetensutveckling|din arbetsgivare/i;
  const WORKFORCE_EN = /development report|competence development|your employer/i;
  for (const key of RECRUITMENT_KEYS) {
    check(`10.5 ${key} exists in both dictionaries`, Boolean(sv[key]) && Boolean(en[key]));
    check(
      `10.6 ${key} carries no workforce claim`,
      !WORKFORCE_SV.test(sv[key] ?? "") && !WORKFORCE_EN.test(en[key] ?? ""),
      `sv: ${sv[key] ?? "MISSING"} | en: ${en[key] ?? "MISSING"}`,
    );
  }
  // The workforce strings must survive untouched — this is a fork, not a
  // rename, and an employee IS owed a development report.
  check(
    "10.7 the workforce wording is unchanged for the workforce case",
    WORKFORCE_EN.test(en["academy.done.body"] ?? "") &&
      WORKFORCE_EN.test(en["academy.report.title"] ?? ""),
  );
}

// ---------------------------------------------------------------------------
console.log("\n11. Nothing here decides anything about anybody");
{
  // The locked safety contract. Asserted over the copy this PR introduced and
  // the surfaces it touched, so a reliability fix cannot smuggle in a verdict.
  const NEW_KEYS = [
    "academy.save.saving",
    "academy.save.saved",
    "academy.save.failed",
    "academy.save.retry",
    "academy.incomplete.title",
    "academy.incomplete.count.one",
    "academy.incomplete.count.other",
    "academy.incomplete.note",
    "academy.incomplete.question",
    "academy.incomplete.goToFirst",
    "academy.incomplete.andMore",
    "academy.done.bodyRecruitment",
    "academy.done.alreadyBodyRecruitment",
    "academy.done.releasedBodyRecruitment",
    "academy.report.titleRecruitment",
    "academy.report.whyBodyRecruitment",
    "academy.report.suggestedRecruitment",
    "academy.participants.releaseAlready",
    "academy.reviews.unsaved",
  ];
  const FORBIDDEN_SV =
    /\bgodkänd\b|\bunderkänd\b|\bklarade\b|lämplig|olämplig|rekommenderar att anställa|rangordn|poäng\b|\bbetyg\b/i;
  const FORBIDDEN_EN =
    /\bpass(ed|es)?\b|\bfail(ed|s)?\b|suitab|unsuitab|recommend .{0,20}hir|\brank(ing|ed)?\b|\bscore\b|\bgrade\b/i;
  for (const key of NEW_KEYS) {
    check(`11.1 ${key} is present in both dictionaries`, Boolean(sv[key]) && Boolean(en[key]));
    check(
      `11.2 ${key} carries no verdict`,
      !FORBIDDEN_SV.test(sv[key] ?? "") && !FORBIDDEN_EN.test(en[key] ?? ""),
      `sv: ${sv[key] ?? "MISSING"} | en: ${en[key] ?? "MISSING"}`,
    );
  }
  check(
    "11.3 the plural pair for the missing count is complete",
    Boolean(sv["academy.incomplete.count.one"]) &&
      Boolean(sv["academy.incomplete.count.other"]) &&
      Boolean(en["academy.incomplete.count.one"]) &&
      Boolean(en["academy.incomplete.count.other"]),
    "an incomplete pair renders the raw key at the one moment the participant needs a sentence",
  );
  // The runtime must not have grown a judgement of its own.
  check(
    "11.4 the participant runtime states no outcome",
    !/\bpassed\b|\bfailed the\b|suitab|\branking\b|cqrityjob ?score/i.test(runtime),
  );
  check(
    "11.5 the human-review requirement is still the database's to decide",
    runtime.includes("reviewsOpened") && !runtime.includes("requires_human_review"),
    "the client reports that a person will read an answer; it never decides whether one must",
  );
}

// ---------------------------------------------------------------------------
console.log("\n12. Lifecycle stays a server fact");
{
  const lifecycle = stripComments(
    read("src/lib/security-competency/assessment-lifecycle.functions.ts"),
  );
  check(
    "12.1 the pipeline state is passed through, never recomputed",
    lifecycle.includes("lifecycle_state as LifecycleState") &&
      !/lifecycleState:\s*(submittedAt|scoredAt|releasedAt)/.test(lifecycle),
  );
  check(
    "12.2 a failed lifecycle read throws rather than reporting an empty list",
    /if \(error\) throw new Error\("Could not load the assessment pipeline\."\)/.test(lifecycle),
    "a read failure is not 'this employer has no candidates'",
  );
  check(
    "12.3 the participant runtime reads its state from the attempt row",
    runtime.includes("getAcademyAttemptState") && runtime.includes("state.isOpen"),
  );
  check(
    "12.4 a closed run never re-enters the player",
    /if \(state && !state\.isOpen\) \{[\s\S]{0,200}setPhase\("done"\)/.test(runtime),
  );
  const delivery = stripComments(read("src/lib/security-competency/academy-delivery.functions.ts"));
  check(
    "12.5 an unreadable attempt state is an error, not a status",
    /if \(error\) throw classify\(error\.message \?\? "", "load_failed"\)/.test(delivery),
  );
}

// ---------------------------------------------------------------------------
const total = passed + failures.length;
console.log(`\n${passed}/${total} checks passed`);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("Assessment pilot reliability guard passed.\n");
