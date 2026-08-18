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
const ROUTE = path.join(root, "src/routes/_authenticated.admin.passport-verification.tsx");
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
    "the verifier's entries; no generic catch-all message)",
);
