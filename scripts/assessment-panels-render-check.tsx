// The participant's run, asserted against the RENDERED markup.
//
// ── WHY THIS RENDERS RATHER THAN READS ─────────────────────────────────
//
// The guard next door (assessment-pilot-reliability-check) runs the save queue
// and reads the route's source. Neither proves a participant ever SEES the
// result, and all three panels below are states nobody reaches by hand: a save
// only reports a failure when the network drops, the missing-answers panel
// only appears when somebody submits an unfinished run, and the recruitment
// ending only appears to a candidate, of whom there are none in a development
// pilot. States like that go wrong quietly and stay wrong, because the only
// way to look at one is to break something on purpose first.
//
// Rendered with renderToStaticMarkup — no browser and no database. The
// I18nProvider starts at "sv" on the server, so Swedish is what is asserted
// from markup; the English half is asserted from the copy tables directly, the
// same way prepilot-candidate-surface-check does it.
//
// Run: bun run assessment-panels-render:check

import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { dictionaries } from "../src/i18n/dictionaries";
import {
  MissingAnswersPanel,
  SaveStatus,
  SubmittedNotice,
  type MissingAnswer,
} from "../src/components/academy/AttemptPanels";

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

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const render = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
/** The markup with tags removed, so an assertion is about what is READ. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const missing = (n: number): MissingAnswer[] =>
  Array.from({ length: n }, (_, i) => ({
    itemVersionId: `item-${i + 1}`,
    position: (i + 1) * 3,
    prompt: `Vad gor du i situation ${i + 1}`,
  }));

// ---------------------------------------------------------------------------
console.log("\n1. Where an answer is, said under the answer");
{
  // A resumed run draws fifty already-answered questions; "Sparat" against
  // each of them would be a claim about fifty requests that were never made.
  const idle = render(<SaveStatus onRetry={() => undefined} />);
  check(
    "1.1 nothing is claimed before anything has been sent",
    text(idle) === "",
    `rendered: ${text(idle)}`,
  );

  const saving = text(render(<SaveStatus state="saving" onRetry={() => undefined} />));
  check("1.2 an in-flight save says so", saving.includes("Sparar"), saving);
  check("1.3 and does not yet say saved", !saving.includes("Sparat"), saving);

  const saved = text(render(<SaveStatus state="saved" onRetry={() => undefined} />));
  check("1.4 a landed save says saved", saved.includes("Sparat"), saved);

  const failedHtml = render(<SaveStatus state="failed" onRetry={() => undefined} />);
  const failed = text(failedHtml);
  check(
    "1.5 a failed save names the answer, not the assessment",
    failed.includes("Det här svaret är inte sparat"),
    failed,
  );
  check("1.6 it offers a way to send it again", failed.includes("Spara igen"));
  check("1.7 the retry is a real button", /<button[^>]*type="button"/.test(failedHtml));
  check(
    "1.8 a failure is announced, a progress note is not",
    failedHtml.includes('role="alert"') &&
      render(<SaveStatus state="saving" onRetry={() => undefined} />).includes(
        'aria-live="polite"',
      ),
    "interrupting a screen reader mid-question to say 'Saving' would be worse than useless",
  );
  check(
    "1.9 no save state claims the run itself is broken",
    !failed.includes("Det gick inte att öppna bedömningen"),
  );
}

// ---------------------------------------------------------------------------
console.log("\n2. A submission with answers missing");
{
  const one = text(
    render(
      <MissingAnswersPanel
        missing={missing(1)}
        onGoTo={() => undefined}
        onBack={() => undefined}
      />,
    ),
  );
  check("2.1 the panel says something is missing", one.includes("Något saknas"), one.slice(0, 160));
  check(
    "2.2 it does not describe itself as a failure",
    !one.includes("Inlämningen gick inte igenom") && !/misslyck/i.test(one),
  );
  check(
    "2.3 one missing answer is counted in the singular",
    one.includes("1 fråga saknar svar"),
    one,
  );
  check("2.4 it names the question by its number in the run", one.includes("Fråga 3"), one);
  check("2.5 it shows what the question asked", one.includes("Vad gor du i situation 1"));
  check("2.6 it offers a route to it", one.includes("Gå till första frågan som saknar svar"));
  check("2.7 it says the other answers are safe", one.includes("Ingenting har gått förlorat"));

  // The whole point of the panel. The screen it replaced offered "Lämna in
  // igen" against a refusal that would be repeated identically every time.
  const html = render(
    <MissingAnswersPanel missing={missing(3)} onGoTo={() => undefined} onBack={() => undefined} />,
  );
  check("2.8 it offers no 'submit again'", !text(html).includes("Lämna in igen"));
  check(
    "2.9 every listed question is a real, focusable control",
    (html.match(/<button/g) ?? []).length === 3 + 2,
    `${(html.match(/<button/g) ?? []).length} buttons for 3 missing answers + go-to + back`,
  );

  const many = text(
    render(
      <MissingAnswersPanel
        missing={missing(3)}
        onGoTo={() => undefined}
        onBack={() => undefined}
      />,
    ),
  );
  check(
    "2.10 several missing answers are counted in the plural",
    many.includes("3 frågor saknar svar"),
    many,
  );

  // A list of forty is not information.
  const lots = render(
    <MissingAnswersPanel missing={missing(40)} onGoTo={() => undefined} onBack={() => undefined} />,
  );
  check("2.11 a long list is capped", (lots.match(/Vad gor du i situation/g) ?? []).length === 8);
  check(
    "2.12 and the cap is stated rather than hidden",
    text(lots).includes("Fler frågor saknar svar"),
  );
  check("2.13 the count is still the true one", text(lots).includes("40 frågor saknar svar"));

  // An empty list must never render as a panel that blocks a finished run.
  const none = render(
    <MissingAnswersPanel missing={[]} onGoTo={() => undefined} onBack={() => undefined} />,
  );
  check(
    "2.14 with nothing missing there is no route-to-first control",
    !text(none).includes("Gå till första frågan som saknar svar"),
  );
}

// ---------------------------------------------------------------------------
console.log("\n3. The screen the run ends on");
{
  const employee = text(
    render(<SubmittedNotice recruitment={false} closedStatus={null} reviewsOpened={0} />),
  );
  check("3.1 an employee is thanked", employee.includes("dina svar är inlämnade"), employee);
  check("3.2 and told about their development report", employee.includes("utvecklingsrapport"));

  const candidate = text(
    render(<SubmittedNotice recruitment closedStatus={null} reviewsOpened={0} />),
  );
  check(
    "3.3 a candidate is NOT promised a development report",
    !candidate.includes("utvecklingsrapport"),
    candidate,
  );
  check(
    "3.4 a candidate is told where their answers actually went",
    candidate.includes("organisationen som bad dig"),
    candidate,
  );
  check("3.5 and is not told they have an employer here", !/din arbetsgivare/i.test(candidate));

  // The same fork on the two closed states, which is where it was missed
  // before: the intro screen had been corrected and the ending had not.
  const closedEmployee = text(
    render(<SubmittedNotice recruitment={false} closedStatus="submitted" reviewsOpened={0} />),
  );
  const closedCandidate = text(
    render(<SubmittedNotice recruitment closedStatus="submitted" reviewsOpened={0} />),
  );
  check("3.6 a re-visited run says it is already in", closedEmployee.includes("redan inlämnade"));
  check(
    "3.7 and forks on purpose too",
    !closedCandidate.includes("utvecklingsrapport"),
    closedCandidate,
  );

  const releasedEmployee = text(
    render(<SubmittedNotice recruitment={false} closedStatus="released" reviewsOpened={0} />),
  );
  const releasedCandidate = text(
    render(<SubmittedNotice recruitment closedStatus="released" reviewsOpened={0} />),
  );
  check(
    "3.8 a released workforce run points at My Career",
    releasedEmployee.includes("Min karriär"),
  );
  check(
    "3.9 a released recruitment run does not — a candidate has nothing there",
    !releasedCandidate.includes("Min karriär"),
    releasedCandidate,
  );

  // A result that is not final must not look final.
  const pending = text(
    render(<SubmittedNotice recruitment closedStatus={null} reviewsOpened={2} />),
  );
  check("3.10 an outstanding human review is stated", pending.includes("granskare"));
  check("3.11 and is not stated when there is none", !candidate.includes("granskare"));

  // The locked safety contract, over everything this screen can say.
  const all = [
    employee,
    candidate,
    closedEmployee,
    closedCandidate,
    releasedEmployee,
    releasedCandidate,
    pending,
  ].join(" ");
  check(
    "3.12 no ending states an outcome",
    !/godkänd|underkänd|klarade|lämplig|rangordn|poäng|betyg/i.test(all),
  );
}

// ---------------------------------------------------------------------------
console.log("\n4. The English half says the same things");
{
  check(
    "4.1 the English ending forks on purpose",
    /development report/i.test(en["academy.done.body"] ?? "") &&
      !/development report/i.test(en["academy.done.bodyRecruitment"] ?? ""),
  );
  check(
    "4.2 the English candidate is told where the answers went",
    /organisation that asked you/i.test(en["academy.done.bodyRecruitment"] ?? ""),
    en["academy.done.bodyRecruitment"],
  );
  check(
    "4.3 the English released candidate is not sent to My Career",
    !/my career/i.test(en["academy.done.releasedBodyRecruitment"] ?? ""),
    en["academy.done.releasedBodyRecruitment"],
  );
  check(
    "4.4 the English missing-answers panel reads as unfinished, not failed",
    /missing/i.test(en["academy.incomplete.title"] ?? "") &&
      !/fail|error/i.test(en["academy.incomplete.title"] ?? ""),
    en["academy.incomplete.title"],
  );
  check(
    "4.5 the English save states exist and are distinct",
    en["academy.save.saving"] !== en["academy.save.saved"] &&
      Boolean(en["academy.save.failed"]) &&
      Boolean(en["academy.save.retry"]),
  );
  check(
    "4.6 the English failure names the answer, not the assessment",
    /this answer/i.test(en["academy.save.failed"] ?? ""),
    en["academy.save.failed"],
  );
  check(
    "4.7 the Swedish and English plural pairs are both complete",
    Boolean(sv["academy.incomplete.count.one"]) &&
      Boolean(sv["academy.incomplete.count.other"]) &&
      Boolean(en["academy.incomplete.count.one"]) &&
      Boolean(en["academy.incomplete.count.other"]),
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
console.log("Assessment panels render guard passed.\n");
