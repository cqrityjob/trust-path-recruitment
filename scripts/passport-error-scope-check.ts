// Security Passport — error-scope guard for the admin verification queue.
//
// ── THE BUG THIS EXISTS TO PREVENT ─────────────────────────────────────
//
// Production reported "Något gick fel. Försök igen." across the whole
// verification page while the queue, the opened review and the evidence row
// were all working. The cause was not a failing query: four unrelated
// operations — loading the queue, opening a review, opening a document and
// saving a decision — all wrote to ONE `error` string, rendered once above
// the filter, that nothing ever cleared on success. Any single transient
// failure therefore produced a permanent page-wide banner over a page that
// was fine.
//
// ── WHY A SOURCE CHECK AND NOT ONLY A BROWSER TEST ─────────────────────
//
// The browser test for this lives in e2e/passport-admin-error-scope.spec.ts,
// but it needs an authenticated platform admin and a real review, so it
// skips in CI and on a developer machine. A skipped test does not defend an
// invariant. This runs everywhere, always, and fails the moment an operation
// starts writing somebody else's error again.
//
// Plain TS run with Bun, matching this repository's scripts/*-check.ts
// convention.

import { readFileSync } from "node:fs";
import path from "node:path";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const root = path.resolve(import.meta.dir, "..");
const ROUTE = path.join(root, "src/routes/_authenticated.passport-review.tsx");
const source = readFileSync(ROUTE, "utf8");

/** Comments legitimately describe the old collapsed `setError` in order to
 *  explain the fix, so the scans run against code with comments stripped. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const code = stripComments(source);

// ---------------------------------------------------------------------------
// 1. The collapsed page-level error setter is gone
// ---------------------------------------------------------------------------
expect(
  !/\bsetError\s*\(/.test(code),
  "The verification queue must not use a single page-level setError(): that is exactly " +
    "what let a failing document link report the whole page as broken.",
);

// ---------------------------------------------------------------------------
// 2. Every operation owns a distinctly named error
// ---------------------------------------------------------------------------
const SCOPES = [
  { setter: "setQueueError", what: "loading the queue" },
  { setter: "setDetailError", what: "opening a review" },
  { setter: "setEvidenceError", what: "opening a document" },
  { setter: "setDecisionError", what: "saving a decision" },
] as const;

for (const { setter, what } of SCOPES) {
  expect(code.includes(`${setter}(`), `${what} must have its own error setter (${setter}).`);
}

// ---------------------------------------------------------------------------
// 3. Each one is CLEARED on success, so a transient failure cannot become
//    a permanent banner
// ---------------------------------------------------------------------------
for (const { setter, what } of SCOPES) {
  expect(
    new RegExp(`${setter}\\(\\s*null\\s*\\)`).test(code),
    `${what}: ${setter}(null) never appears, so a stale error would survive a later success.`,
  );
}

// The queue in particular must clear on a successful load, not only when
// some other action happens to reset it.
{
  const refreshBody = code.slice(
    code.indexOf("const refresh = useCallback"),
    code.indexOf("useEffect("),
  );
  expect(
    refreshBody.includes("setQueueError(null)"),
    "refresh() must clear the queue error when the queue loads successfully.",
  );
  expect(
    !/setDetailError|setEvidenceError|setDecisionError/.test(refreshBody),
    "refresh() must not write another operation's error.",
  );
}

// ---------------------------------------------------------------------------
// 4. The evidence handler stays row-scoped
// ---------------------------------------------------------------------------
{
  const idx = code.indexOf("viewEvidence(");
  expect(idx > -1, "The evidence view handler is missing.");
  if (idx > -1) {
    const handler = code.slice(idx, idx + 900);
    expect(
      handler.includes("setEvidenceError"),
      "A failing evidence link must set the row-scoped evidence error.",
    );
    expect(
      !/setQueueError|setDetailError/.test(handler),
      "A failing evidence link must not report the queue or the review as broken.",
    );
    // Row-scoped means it carries which row failed.
    expect(
      /setEvidenceError\(\s*\{[\s\S]{0,200}?id:/.test(handler),
      "The evidence error must identify WHICH document failed, or it cannot render on that row.",
    );
  }
}

// ---------------------------------------------------------------------------
// 5. A failed decision preserves what the verifier typed
// ---------------------------------------------------------------------------
{
  const idx = code.indexOf("async function submitDecision");
  expect(idx > -1, "submitDecision is missing.");
  if (idx > -1) {
    const body = code.slice(idx, code.indexOf("const evidence =", idx));
    const catchBlock = body.slice(body.lastIndexOf("} catch"));
    expect(
      catchBlock.includes("setDecisionError"),
      "A failed decision must report at the decision, not page-wide.",
    );
    for (const field of [
      "setDecisionNote(",
      "setHolderMessage(",
      "setValidFrom(",
      "setValidUntil(",
    ]) {
      expect(
        !catchBlock.includes(field),
        `A failed decision must not clear ${field.replace("set", "").replace("(", "")} — the verifier just typed it.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 6. The generic copy key is no longer used as a catch-all here
// ---------------------------------------------------------------------------
expect(
  !/pt\(\s*"common\.error"\s*\)/.test(code),
  'The queue must not fall back to the generic "common.error" string: a reader cannot tell ' +
    "which operation failed, which is how a working page came to look broken.",
);

// ---------------------------------------------------------------------------
// 7. A refusal the reviewer can act on, and a review they may not act on
//
// The second production defect: the queue offered a decision that could never
// succeed. `sp_verifier_decide` refuses SP_SELF_VERIFICATION_FORBIDDEN before
// it writes anything when the caller is the holder, and the page learned that
// only after the reviewer had filled the form in and confirmed a permanent
// record. Both halves are asserted here — the marker BEFORE the action, and a
// specific message AFTER a refusal — because either alone leaves the trap.
// ---------------------------------------------------------------------------
{
  const declineSource = readFileSync(
    path.join(root, "src/lib/security-passport/decision-errors.ts"),
    "utf8",
  );
  const codeList = declineSource.slice(
    declineSource.indexOf("DECISION_ERROR_CODES = ["),
    declineSource.indexOf("] as const;"),
  );
  const codes = [...codeList.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);

  expect(codes.length >= 8, "The decision-error code list could not be read.");

  // Every code the classifier can produce needs a sentence in the route's map.
  // A missing one reads as a generic "try again", which is the behaviour this
  // whole change exists to remove.
  for (const c of codes) {
    expect(
      new RegExp(`\\b${c}:\\s*"vq\\.decline\\.${c}"`).test(code),
      `Refusal code "${c}" has no copy in DECLINE_KEY: it would read as a generic retry.`,
    );
  }

  // The raw database message must never be what the reviewer reads.
  expect(
    !/setDecisionError\(\s*(?:err\b|error\b|String\()/.test(code),
    "The decision error must be a mapped copy key, never the raw error text.",
  );
  expect(
    /decisionErrorCodeFrom\(err\)/.test(code),
    "A failed decision must be classified into a code before it is shown.",
  );

  // The self-review marker must gate the FORM, not merely label the row. Two
  // separate branches are required, and the second is checked by anchoring on
  // the notice that replaces the fieldset — a check that only counted
  // `item.isSelf` would pass on the badge alone and leave the trap in place.
  const selfBranches = [...code.matchAll(/item\.isSelf\s*\?/g)].length;
  expect(
    selfBranches >= 2,
    "isSelf must both mark the row and withhold the decision form; " +
      `only ${selfBranches} branch(es) found.`,
  );
  const noticeAt = code.indexOf('pt("vq.selfNotice")');
  const fieldsetAt = code.indexOf('<fieldset className="space-y-3">');
  expect(
    noticeAt !== -1 && fieldsetAt !== -1 && noticeAt < fieldsetAt,
    "The self-review notice must stand in place of the decision fieldset, " +
      "not merely appear somewhere alongside it.",
  );
  expect(
    /pt\("vq\.selfNotice"\)/.test(code),
    "A reviewer's own request must explain why it cannot be decided here.",
  );
  expect(
    /pt\("vq\.selfBadge"\)/.test(code),
    "A reviewer's own request must be marked in the queue list, before it is opened.",
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`passport-error-scope:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  "passport-error-scope:check OK " +
    "(no page-level setError; queue, review, evidence and decision each own their error; " +
    "each is cleared on success; the evidence error names its row; a failed decision keeps " +
    "the verifier's entries; no generic catch-all message; every refusal code has copy; " +
    "a review the reviewer may not decide is marked and its form withheld)",
);
