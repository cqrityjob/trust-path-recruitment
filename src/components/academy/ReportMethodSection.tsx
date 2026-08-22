// Phase 6 — the methodology, said once.
//
// ── WHY ONE SECTION ─────────────────────────────────────────────────────
//
// "One assessment occasion", "self-reported is not observed", "this is not an
// employment decision" and "limited evidence is not a weakness" were each true
// and each said between three and eight times on the same page. Repetition of a
// caveat does not increase the care with which it is read; past the second time
// it teaches the reader to skip the paragraph shape it arrives in, which is how
// the one caveat that mattered stopped being read at all.
//
// So they are stated once, here, at the bottom, in full — nothing is softened
// and nothing is dropped. What stays scattered through the report is the short
// provenance stamp on each row (Observerat / Självrapporterat / Begränsat
// underlag), because that one has to be beside the claim it qualifies.
//
// ── WHY AT THE BOTTOM AND NOT BEHIND A TOGGLE ───────────────────────────
//
// A published report template must carry its limitations, so they are on the
// page and they print. Only the version and derivation identifiers — which
// exist for an auditor matching them character by character — stay folded.

import { Info } from "lucide-react";
import { useT } from "@/i18n/context";

export function ReportMethodSection({
  observations,
  contexts,
  selfReportObservations,
  reviewsTotal,
  reviewsCompleted,
  pace,
  limitations,
}: {
  observations: number;
  contexts: number;
  selfReportObservations: number;
  reviewsTotal: number;
  reviewsCompleted: number;
  /** A fact about the RUN, never a finding about the person. It sat beside the
   *  narrative before, where a timestamp observation read as part of the
   *  evidence about the candidate. */
  pace: { rapidAnswers: number; answered: number } | null;
  limitations: string[];
}) {
  const { t } = useT();
  return (
    <section className="mt-6 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Info className="h-4 w-4 text-accent" aria-hidden="true" />
        {t("decision.method.title")}
      </h2>

      <dl className="mt-3 space-y-3 text-[13px] leading-relaxed">
        <MethodItem term={t("decision.method.basis")}>
          {t(contexts === 1 ? "academy.coverage.basisOne" : "academy.coverage.basisMany")
            .replace("{observations}", String(observations))
            .replace("{contexts}", String(contexts))}{" "}
          {t("decision.method.selfReportCount").replace("{n}", String(selfReportObservations))}
        </MethodItem>

        {/* Its own string, not academy.coverage.employerBody.
            That one was written for the V1 report and describes the maturity
            list: no competency can reach "Visat", every row lands on "Behöver
            följdfråga", the follow-ups are below. V2 does not render that list,
            so on this page all three sentences were false -- and the last of
            them contradicted the "Starkt underlag" labels a screen above.
            The workforce report still renders that list and still uses that
            string; only recruitment needed its own. */}
        <MethodItem term={t("decision.method.oneOccasion")}>
          {t("decision.method.oneOccasionBody")}
        </MethodItem>

        <MethodItem term={t("decision.method.selfReport")}>
          {t("decision.method.selfReportBody")}
        </MethodItem>

        <MethodItem term={t("decision.method.thinEvidence")}>
          {t("decision.method.thinEvidenceBody")}
        </MethodItem>

        <MethodItem term={t("decision.method.review")}>
          {t("decision.method.reviewBody")
            .replace("{done}", String(reviewsCompleted))
            .replace("{total}", String(reviewsTotal))}
        </MethodItem>

        {pace && pace.answered > 0 && (
          <MethodItem term={t("brief.pace")}>
            {t("brief.paceBody")
              .replace("{n}", String(pace.rapidAnswers))
              .replace("{total}", String(pace.answered))}
          </MethodItem>
        )}

        <MethodItem term={t("decision.method.decision")}>
          {t("decision.method.decisionBody")}
        </MethodItem>
      </dl>

      {limitations.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
            {t("academy.limitations.title")}
          </h3>
          <ul className="mt-2 space-y-2">
            {limitations.map((l) => (
              <li
                key={l}
                className="max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground"
              >
                {l}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function MethodItem({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-foreground">{term}</dt>
      <dd className="mt-0.5 max-w-[74ch] text-muted-foreground">{children}</dd>
    </div>
  );
}
