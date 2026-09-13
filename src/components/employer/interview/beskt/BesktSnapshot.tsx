// The candidate's submitted preparation, exactly as it was submitted.
//
// ── WHAT THIS SCREEN IS NOT ALLOWED TO DO ────────────────────────────────
//
// It is not allowed to make a skipped question look like a problem.
//
// The candidate was OFFERED three ways to respond — answer, skip, or ask to
// take it orally — by a governed method that put those choices there on
// purpose. A surface that then renders two of the three in amber with a
// warning triangle has quietly converted the method's own affordance into a
// mark against the person who used it. So: no warning tone, no negative icon,
// no "unanswered" framing, no count of omissions, and the sentence under the
// list says in words that these choices mean nothing beyond themselves.
//
// It is also not allowed to be editable. These are someone else's words,
// submitted and frozen; the interviewer's own record goes in their own
// position, where it is attributed to them.

import { useT } from "@/i18n/context";
import type { BesktSnapshotAnswer } from "@/lib/beskt/interview-conduct.functions";
import { ResponseStateChip, governedText } from "./BesktConductUi";

export function BesktSnapshot({ answers }: { answers: readonly BesktSnapshotAnswer[] }) {
  const { t, lang } = useT();

  return (
    <section className="rounded-lg border border-border p-4" aria-labelledby="beskt-snapshot-h">
      <h2 id="beskt-snapshot-h" className="text-sm font-semibold text-foreground">
        {t("beskt.conduct.snapshot.heading")}
      </h2>
      <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.conduct.snapshot.lede")}
      </p>
      <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
        {t("beskt.conduct.snapshot.readOnly")}
      </p>

      {answers.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("beskt.conduct.snapshot.empty")}</p>
      ) : (
        <>
          <ol className="mt-4 space-y-4">
            {answers.map((a) => (
              <li key={a.itemKey} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="min-w-0 text-sm font-medium text-foreground">
                    {governedText(lang, a.wordingSv, a.wordingEn)}
                  </h3>
                  <ResponseStateChip state={a.responseState} />
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                  {answerText(a, t)}
                </p>

                <dl className="mt-3 space-y-1">
                  <dt className="text-xs text-muted-foreground">
                    {t("beskt.conduct.snapshot.purpose")}
                  </dt>
                  <dd className="text-xs leading-relaxed text-muted-foreground">
                    {governedText(lang, a.purposeSv, a.purposeEn)}
                  </dd>
                  <dt className="sr-only">{t("beskt.conduct.snapshot.itemKey")}</dt>
                  <dd className="font-mono text-xs text-muted-foreground">
                    <span className="sr-only">{t("beskt.conduct.snapshot.itemKey")}: </span>
                    {a.itemKey}
                  </dd>
                </dl>
              </li>
            ))}
          </ol>

          {/* Said AFTER the list rather than before it, because it is the
              sentence a reader wants once they have seen a "Skipped" chip and
              started forming a theory about it. */}
          <p className="mt-4 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
            {t("beskt.conduct.snapshot.stateMeaning")}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * The candidate's own answer content, in whatever shape the item took.
 *
 * An omitted or discuss-orally response has no content by construction, and
 * saying so plainly is better than an empty line a reader could mistake for a
 * rendering failure.
 */
function answerText(
  a: BesktSnapshotAnswer,
  t: (
    k:
      "beskt.conduct.snapshot.yes" | "beskt.conduct.snapshot.no" | "beskt.conduct.snapshot.noValue",
  ) => string,
): string {
  if (a.responseState !== "answered") return t("beskt.conduct.snapshot.noValue");
  if (a.valueText !== null && a.valueText.trim() !== "") return a.valueText;
  if (a.valueBoolean !== null)
    return a.valueBoolean ? t("beskt.conduct.snapshot.yes") : t("beskt.conduct.snapshot.no");
  if (a.valueDate !== null) return a.valueDate;
  if (a.selectedOptionKeys.length > 0) return a.selectedOptionKeys.join(", ");
  return t("beskt.conduct.snapshot.noValue");
}
