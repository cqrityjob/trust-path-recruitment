// The candidate's summary of an interview, rendered from the released payload.
//
// ── ONE PIECE OF MARKUP, THREE SURFACES ─────────────────────────────────
//
//   the employer's PREVIEW      "what would be shared, if you share it"
//   the employer's VERIFICATION "what was shared"
//   the candidate's own page    what they actually read
//
// The brief requires that the preview use the same projection and the same
// locale as the released candidate view, and that no separate preview copy
// exist to drift. There is one component, one payload shape and one mapper;
// the three callers differ only in which server function fetched the payload.
//
// ── WHAT IT WILL NOT RENDER, BECAUSE IT CANNOT ──────────────────────────
//
// A level, a rationale, an uncertainty note, a reviewer's name, a finding, an
// AI proposal or an AI's original wording. Not because this file omits them:
// because `CandidateSummaryPayload` has no field for any of them, and
// `scp_iv_build_candidate_summary` does not read the tables they live in. The
// database suite asserts that with a case whose employer report really does
// carry all of it.
//
// ── AND THE ONE THING THE COPY HAS TO CARRY ─────────────────────────────
//
// `covered: false` is a statement about the CONVERSATION -- we did not get to
// a concrete example -- and reads as a statement about the PERSON unless the
// page says otherwise. The document's own limitations say so, in its own
// governed words, and this component renders them rather than paraphrasing.

import { useT } from "@/i18n/context";
import type { CandidateSummaryPayload } from "@/lib/interview-intelligence/runtime.functions";

export function CandidateSummaryDocument({
  payload,
  lang,
}: {
  payload: CandidateSummaryPayload;
  /** The locale to render in. Passed rather than read from context so the
   *  employer's preview and the candidate's page can be proved to produce the
   *  same document for the same language. */
  lang: "sv" | "en";
}) {
  const { t } = useT();
  const scope = lang === "sv" ? payload.scopeSv : payload.scopeEn;
  const limitations = lang === "sv" ? payload.limitationsSv : payload.limitationsEn;
  const decision = lang === "sv" ? payload.decisionSv : payload.decisionEn;

  return (
    <article className="space-y-6">
      <header>
        <h3 className="text-base font-semibold text-foreground">{t("iics.heading")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {[payload.roleTitle, payload.employerName].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">{scope}</p>
      </header>

      <section aria-labelledby="cis-areas">
        <h4 id="cis-areas" className="text-sm font-semibold text-foreground">
          {t("iics.areas")}
        </h4>
        <ul className="mt-3 space-y-4">
          {payload.areas.map((a) => (
            <li key={a.code} className="rounded-lg border border-border p-4">
              <p className="text-sm font-medium text-foreground">{a.name}</p>
              <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">
                {a.definition}
              </p>
              {a.yourExamples.length > 0 ? (
                <>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("iics.yourExamples")}
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {a.yourExamples.map((e, i) => (
                      <li
                        key={`${a.code}-${i}`}
                        className="border-l-2 border-border pl-3 text-[13px] leading-relaxed text-foreground"
                      >
                        {e.statement}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                /* NOT "you have no experience here". The document's own
                   limitations say what this means, and the sentence is
                   phrased as a fact about the hour rather than about the
                   person. */
                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                  {t("iics.notCovered")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cis-limits">
        <h4 id="cis-limits" className="text-sm font-semibold text-foreground">
          {t("iics.limitations")}
        </h4>
        <ul className="mt-2 space-y-1.5">
          {limitations.map((l, i) => (
            <li key={i} className="max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">
              {l}
            </li>
          ))}
        </ul>
      </section>

      <p className="max-w-[68ch] rounded-lg border border-border bg-[color:var(--surface-subtle)] p-4 text-[13px] leading-relaxed text-foreground">
        {decision}
      </p>
    </article>
  );
}
