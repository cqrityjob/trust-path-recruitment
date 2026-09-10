// Reading the context result on a screen.
//
// ── WHY A SHARED HELPER AND NOT THREE COPIES ────────────────────────────
//
// Three surfaces read the interview context — the case overview, the
// preparation screen and the live interview — and each of them used to reduce
// the answer to `contextQ.data` plus `contextQ.isError`. That reduction is
// where the E3 defect lived: five materially different situations collapsed
// into "we have it" or "we do not", after which no screen could say anything
// truthful about which one had happened.
//
// The server contract is now a union, and this file is the one place that
// turns it into what a screen needs. Three consumers, one mapping: a member
// added to the union appears on all three surfaces or on none, and a surface
// cannot quietly stop handling one.
//
// ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────
//
// It never produces a context. `contextOf` returns null for every unhappy
// answer, and the caller must then render `<ContextUnavailable>` rather than
// an empty context — because an empty context is a set of claims (no role, no
// requirements, nothing to explore) and none of those claims is known to be
// true.

import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import type {
  InterviewContext,
  InterviewContextResult,
} from "@/lib/interview-intelligence/context";
import { Nothing, Section } from "./InterviewLayout";

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

/** Why the context is not here, said in the screen's own layout.
 *
 *  Every member of the union has its own two sentences, and the retry is
 *  offered only where retrying could change the answer. A refusal is a
 *  decision somebody made; inviting a recruiter to keep pressing a button
 *  against it is inviting them to waste an afternoon. */
export function ContextUnavailable({
  result,
  isLoading,
  isError,
  onRetry,
}: {
  result: InterviewContextResult | null | undefined;
  isLoading: boolean;
  /** The QUERY failed — the request never produced a result at all. Distinct
   *  from `caseReadFailed`, which is a result saying the database read broke. */
  isError: boolean;
  onRetry?: () => void;
}) {
  const { t } = useT();

  const [body, hint, retryable]: [TranslationKey, TranslationKey, boolean] = isLoading
    ? ["iic.loading", "iic.loading", false]
    : isError
      ? ["iic.error", "iic.error.hint", true]
      : result?.kind === "caseNotFoundOrRefused"
        ? ["iic.caseUnavailable.notFound", "iic.caseUnavailable.notFound.hint", false]
        : result?.kind === "caseReadFailed"
          ? ["iic.caseUnavailable.failed", "iic.caseUnavailable.failed.hint", true]
          : // An UNKNOWN member of the union. It cannot be rendered as any of
            // the above, and it must not be rendered as "there is nothing
            // here": a state this build has never heard of is a state it knows
            // nothing about. The generic failure is the fail-closed answer.
            ["iic.error", "iic.error.hint", true];

  if (isLoading) {
    return (
      <Section id="ii-context" title={t("iic.heading")}>
        <p role="status" className="text-sm text-muted-foreground">
          {t("iic.loading")}
        </p>
      </Section>
    );
  }

  return (
    <Section id="ii-context" title={t("iic.heading")}>
      <Nothing hint={t(hint)}>{t(body)}</Nothing>
      {onRetry && retryable && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-11 items-center rounded-[10px] border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("iic.retry")}
        </button>
      )}
    </Section>
  );
}
