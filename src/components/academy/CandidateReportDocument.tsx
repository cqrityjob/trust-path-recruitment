// The candidate's released assessment document, rendered from the snapshot.
//
// ── WHY THIS IS A COMPONENT AND NOT PART OF THE CANDIDATE ROUTE ─────────
//
// Because two surfaces now render it, and they must render it IDENTICALLY.
//
//   /academy/report/$attemptId                   the candidate reads it
//   the employer's "show exactly what the candidate sees"  (E2)
//
// The second exists so that a recruiter about to share a result, or asked
// afterwards what was shared, can look at the thing itself rather than at a
// description of it. That guarantee is worth nothing if the two surfaces are
// two pieces of markup: the moment one gains a sentence the other does not,
// the employer is verifying a document the candidate is not being shown, and
// nobody finds out. So there is one component, and both call it.
//
// ── WHAT IT RENDERS, AND WHAT IT DELIBERATELY DOES NOT ──────────────────
//
// Everything here is driven by ONE `ReportSnapshot` — the released document
// as its audience entry point returned it. Nothing is fetched, nothing is
// derived from the reader, and there is no branch on who is looking: the same
// snapshot produces the same page for both callers, which is the property the
// whole preview rests on.
//
// The candidate's own page shows two further sections that are NOT part of the
// released document and are not this employer's to read: development modules
// suggested for that person, and their own history across attempts. Those stay
// on the route, and the employer preview says in one line that they exist
// rather than pretending the document is the whole page.

import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { ReportContextPanel } from "@/components/academy/ReportContextPanel";
import {
  EvidenceCoverage,
  EvidenceStateRow,
  NoEvidenceState,
  ReportLimitations,
  SafetyFlagNotice,
} from "@/components/academy/MaturityDisplay";
import type { ReportSnapshot } from "@/lib/security-competency/academy-employer.functions";

export function CandidateReportDocument({ report }: { report: ReportSnapshot }) {
  const { t, lang } = useT();
  const r = report;
  // Read from the snapshot's frozen context, never re-derived. Absent on a
  // snapshot released before the context carried it, and the workforce wording
  // is the right default there: that is what those releases actually were.
  const candidate = r.context?.personContext === "candidate";
  const limitations = lang === "en" ? r.limitationsEn : r.limitationsSv;

  return (
    <>
      <p className="mt-4 max-w-[62ch] rounded-[12px] bg-[color:var(--surface-subtle)] p-4 text-[13px] leading-relaxed text-muted-foreground">
        {t("academy.report.whatThisIs")}
      </p>

      {/* Why this happened, in the participant's own terms and before anything
          is said about them. The employer report opens with lineage; this one
          opens with a reason, because those are the two audiences' first
          questions and they are not the same question. */}
      <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("academy.report.whyTitle")}</h2>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
          {t(candidate ? "academy.report.whyBodyRecruitment" : "academy.report.whyBody")}
        </p>
        <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-foreground">
          {t("academy.report.humanDecides")}
        </p>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.report.notInability")}
        </p>
        {/* Two different facts, and conflating them was the defect. A review
            happening is routine — twelve of the eighteen items are classified
            safety-critical, so it happens to everybody. A reviewer actually
            FINDING something is not routine, and only that gets said. */}
        {r.context?.humanReviewOccurred && (
          <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.report.humanReviewOccurred")}
          </p>
        )}
        {r.context?.safetyConcernPresent && (
          <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-foreground">
            {t("academy.report.safetyConcernNoted")}
          </p>
        )}
      </section>

      {/* Same component as the employer surface, fed the participant's own
          frozen context -- which carries no lifecycle status, no review counts
          and no scoring model version, because the database never put them
          there. */}
      <ReportContextPanel context={r.context} reportId={r.id} releasedAt={r.releasedAt} />

      {/* The participant snapshot carries no severity-bearing flags by design,
          so this renders nothing here. It stays because the component is the
          one place that decides how a safety notice looks, and a future
          participant-safe notice belongs in it rather than beside it. */}
      <SafetyFlagNotice count={r.safetyFlags.length} />

      <EvidenceCoverage
        observations={
          r.context?.evidenceObservations ?? r.lines.reduce((n, l) => n + l.observations, 0)
        }
        contexts={r.context?.evidenceContexts ?? 1}
        bodyKey="academy.coverage.participantBody"
      />

      {/* What the assessment was made of, and the distinction that matters most
          to the person who sat it: what we watched them do, and what they told
          us about themselves. Said in the participant's own report, in the same
          words the employer sees. */}
      {r.brief && r.brief.modules.length > 0 && (
        <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("report.modulesDone")}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {r.brief.modules.map((m) => (
              <li
                key={m.blockKey}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-border px-2.5 py-1 text-xs text-foreground"
              >
                {lang === "en" ? m.nameEn : m.nameSv}
                <span className="text-muted-foreground">
                  {m.answered}/{m.items}
                </span>
              </li>
            ))}
          </ul>
          <h3 className="mt-5 text-sm font-semibold text-foreground">
            {t("report.observedVsSelf")}
          </h3>
          <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
            {t("report.observedVsSelfBody")}
          </p>
        </section>
      )}

      {/* Their own answers, given back to them. No numbers: the participant
          brief carries the pattern and the count and deliberately not the mean
          or the spread, so there is nothing here that could be read as a mark
          out of ten. */}
      {r.brief && r.brief.selfReported.length > 0 && (
        <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("report.selfReported")}</h2>
          <p className="mt-1.5 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
            {t("report.selfReportedLede")}
          </p>
          <ul className="mt-4">
            {r.brief.selfReported.map((sr) => (
              <li
                key={sr.domainKey}
                className="border-b border-border py-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-sm font-medium text-foreground">
                    {lang === "en" ? sr.domainEn : sr.domainSv}
                  </h3>
                  <p className="text-[13px] text-foreground">
                    {t(`brief.pattern.${sr.pattern}` as TranslationKey)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sr.items} {t("brief.questionsAnswered")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          {t("academy.report.competencies")}
        </h2>
        {r.lines.length === 0 ? (
          <NoEvidenceState
            title={t("academy.report.noEvidenceTitle")}
            body={t("academy.report.noEvidenceBody")}
          />
        ) : (
          r.lines.map((l) => (
            <EvidenceStateRow
              key={l.competencyCode}
              name={lang === "en" ? l.competencyNameEn : l.competencyNameSv}
              state={l.evidenceState}
              observations={l.observations}
              prompt={lang === "en" ? l.reflectionEn : l.reflectionSv}
              humanReviewed={l.humanReviewed}
            />
          ))
        )}
      </section>
    </>
  );
}

/** The rights section, and the limitations under it.
 *
 *  Kept apart from the body above only because the candidate route puts two
 *  per-person sections between them — suggested development and history —
 *  which are not part of the released document. Both callers render this
 *  immediately after their own last section, so the reading order is the same
 *  on both surfaces. */
export function CandidateReportRights({ report }: { report: ReportSnapshot }) {
  const { t, lang } = useT();
  const limitations = lang === "en" ? report.limitationsEn : report.limitationsSv;
  return (
    <>
      <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("academy.report.rightsTitle")}</h2>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.report.rightsBody")}
        </p>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.report.rightsContact")}
        </p>
      </section>

      <ReportLimitations items={limitations} />
    </>
  );
}
