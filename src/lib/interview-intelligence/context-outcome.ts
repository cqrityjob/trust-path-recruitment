// Reading the interview-context RESULT: the two questions every screen asks.
//
// ── WHY THIS IS A MODULE OF ITS OWN ─────────────────────────────────────
//
// These two functions decide whether a screen may render a context and
// whether it may offer an action that depends on one. They are pure, they
// take the server's union and nothing else, and three routes plus a
// deterministic guard call them.
//
// They used to live in InterviewContextOutcome.tsx, beside the component that
// renders the unhappy answers. That file exports a React component, and a
// module that exports both a component and a plain function is a module Fast
// Refresh cannot reload reliably — the editor either loses component state or
// silently stops applying the change, and a rule that fires on it is a rule
// worth following rather than silencing. The rendering lives with the
// components; the decision lives here, beside context.ts, which owns the
// projection these answers are about.
//
// Nothing about the answers changed in the move: same signatures, same
// bodies, same fail-closed semantics. The negative controls in
// scripts/negative-controls/interview-governance-controls.ts weaken each of
// them in turn, and the guard has to notice.

import type { InterviewContext, InterviewContextResult } from "./context";

/** The context, or null — and null is NOT a context.
 *
 *  Deliberately not `?? emptyContext(...)`: a caller that wants to render
 *  something has to reach for `<ContextUnavailable>` and say which answer it
 *  got. The default would be the defect. */
export function contextOf(
  result: InterviewContextResult | null | undefined,
): InterviewContext | null {
  return result?.kind === "context" ? result.context : null;
}

/** Whether an action that DEPENDS on the context may be offered.
 *
 *  ── WHY THIS IS NOT `context !== null` ──────────────────────────────
 *
 *  A `linkedUnreadable` context is a real object with a candidate name and
 *  fifteen empty fields. A screen that treats "I have an object" as "I have
 *  the context" would offer to prepare an interview against requirements it
 *  never read — and the recruiter would approve a preparation built on an
 *  advert nobody fetched.
 *
 *  So the question is not whether an object arrived. It is whether the
 *  application behind this case is actually known. */
export function contextIsUsable(result: InterviewContextResult | null | undefined): boolean {
  const c = contextOf(result);
  if (!c) return false;
  return c.link !== "linkedUnreadable";
}
