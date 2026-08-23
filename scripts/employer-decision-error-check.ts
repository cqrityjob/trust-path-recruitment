// The employer decision panel must be able to say what went wrong.
//
// Run via `bun run employer-decision-error:check`.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
//
// A customer could not save a decision on a candidate brief. The interface
// said "Beslutet kunde inte sparas." and nothing else -- no code on screen,
// nothing in the browser console -- so the cause could not be recovered
// afterwards from anything she could send us. Two of the four refusals
// scp_record_employer_decision can raise had their own message; every other
// cause, including a missing migration or a network fault, collapsed into
// that one sentence.
//
// The defect was not the refusal. It was that the refusal was unreadable.
//
// So: every SCP_ error the RPC can raise must have its own copy in both
// languages, and the unknown case must carry the code. Both halves drift
// easily -- somebody adds a RAISE to the SQL and never touches the panel --
// which is exactly the shape of failure that produced the original report.

import { readFileSync } from "node:fs";
import { dictionaries } from "../src/i18n/dictionaries";

const errors: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) errors.push(message);
};

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** Assertion D forbids `.message` in the error handler, and the comment that
 *  explains why necessarily writes `e.message`. Comments come out first, or the
 *  guard fails on its own rationale. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const MIGRATION = "supabase/migrations/20260820120000_scp_employer_report_decisions.sql";
const PANEL = "src/components/academy/EmployerDecisionPanel.tsx";

// ---------------------------------------------------------------------------
// A. Every refusal the RPC can raise is handled by the panel.
// ---------------------------------------------------------------------------

{
  const sql = read(MIGRATION);
  // Only the recording function raises at the user; the read function returns
  // empty instead. Scoped to it so a code raised elsewhere is not demanded here.
  const fnStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.scp_record_employer_decision");
  expect(fnStart >= 0, `A: scp_record_employer_decision is no longer defined in ${MIGRATION}.`);
  const fnSrc = sql.slice(fnStart, sql.indexOf("$function$;", fnStart));

  const raised = [...new Set([...fnSrc.matchAll(/SCP_[A-Z_]+/g)].map((m) => m[0]))].sort();
  expect(
    raised.length >= 4,
    `A: expected at least four refusal codes in the RPC, found ${raised.length} ` +
      `(${raised.join(", ")}). Has the scan stopped matching?`,
  );

  const panel = read(PANEL);
  for (const code of raised) {
    expect(
      panel.includes(code),
      `A: the RPC can raise ${code} but ${PANEL} never mentions it, so it renders ` +
        `as the generic failure with no way to tell which refusal happened.`,
    );
  }
}

// ---------------------------------------------------------------------------
// B. Every mapped code resolves to real copy in both languages.
// ---------------------------------------------------------------------------

{
  const panel = read(PANEL);
  const block = panel.slice(
    panel.indexOf("const DECISION_ERROR_COPY"),
    panel.indexOf("const ACTIONS"),
  );
  expect(block.length > 0, `B: DECISION_ERROR_COPY has been removed or renamed in ${PANEL}.`);

  const mapped = [...block.matchAll(/"(academy\.decision\.[A-Za-z]+)"/g)].map((m) => m[1]);
  expect(mapped.length >= 4, `B: expected at least four mapped messages, found ${mapped.length}.`);

  for (const key of mapped) {
    if (!sv[key]) errors.push(`B: dictionaries.sv is missing "${key}".`);
    if (!en[key]) errors.push(`B: dictionaries.en is missing "${key}".`);
    if (sv[key] && en[key] && sv[key] === en[key]) {
      errors.push(`B: "${key}" is identical in sv and en -- a missed translation.`);
    }
  }
}

// ---------------------------------------------------------------------------
// C. The unknown case carries the code, in both languages.
// ---------------------------------------------------------------------------

{
  for (const [lang, dict] of [
    ["sv", sv],
    ["en", en],
  ] as const) {
    const text = dict["academy.decision.failedWithCode"] ?? "";
    expect(
      text.includes("{code}"),
      `C: ${lang} "academy.decision.failedWithCode" has lost its {code} placeholder. ` +
        `An unrecognised failure would then be as unreportable as the one that ` +
        `started this.`,
    );
  }

  const panel = read(PANEL);
  expect(
    /academy\.decision\.failedWithCode"\)\.replace\("\{code\}"/.test(panel),
    `C: the panel no longer interpolates {code} into the unknown-failure message.`,
  );
}

// ---------------------------------------------------------------------------
// D. The database's own wording never reaches the browser.
// ---------------------------------------------------------------------------
//
// fail() keeps the raw message on the error, and it can name tables, columns
// and constraints. The panel may read `.code`; reading `.message` would put
// schema detail in front of a recruiter and into any screenshot she sends.

{
  const panel = stripComments(read(PANEL));
  const onError = panel.slice(panel.indexOf("onError:"), panel.indexOf("const incomplete"));
  expect(
    !/\.message/.test(onError),
    `D: the panel's error handler reads .message. That is the database's own ` +
      `wording -- it belongs in the server log fail() already writes, not on screen.`,
  );
  expect(
    /console\.error\(/.test(onError),
    `D: nothing is logged in the browser for an unrecognised failure, which is ` +
      `what made the original report impossible to diagnose.`,
  );
}

if (errors.length > 0) {
  for (const e of errors) console.error("[employer-decision-error:check][error]", e);
  console.error(`\nemployer-decision-error:check FAILED with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  "employer-decision-error:check OK (every RPC refusal is mapped, copy complete in sv and en, " +
    "unknown failures carry their code, no database wording reaches the browser)",
);
