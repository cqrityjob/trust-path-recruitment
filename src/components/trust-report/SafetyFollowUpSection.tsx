// TRUST Evidence Report — safety-critical follow-up. Employer only.
//
// Rendered only when the projection carries an explicit human-reviewed
// finding; a safety-critical COUNT alone renders nothing. Calm by design: a
// restrained gold rule, no red, and the sentence that keeps it a follow-up
// point rather than a conclusion about the person.

import { ShieldAlert } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TrustReportDocument } from "@/lib/security-competency/trust-report.types";
import { pick } from "@/lib/security-competency/trust-report.types";
import {
  competencyName,
  formatDate,
  hasSafetyFollowUp,
} from "@/lib/security-competency/trust-report.presentation";
import { Section, Tag } from "./primitives";

export function SafetyFollowUpSection({ doc }: { doc: TrustReportDocument }) {
  const { t, lang, tp } = useT();
  if (!hasSafetyFollowUp(doc)) return null;
  const s = doc.frozen_report.employer.safety_followup;
  const byCode = new Map(
    (doc.frozen_report.core.competencies ?? []).map((c) => [c.competency_code, c]),
  );
  const areas = (s.areas_flagged_for_follow_up ?? [])
    .map((code) => byCode.get(code))
    .filter(Boolean);
  const count = s.finding_count ?? s.findings.length;

  return (
    <Section
      id="trust-safety"
      title={t("report.trust.safety.heading")}
      printOrder={7}
      aside={<Tag>{t("report.trust.safety.employerOnly")}</Tag>}
    >
      <article className="avoid-break relative overflow-hidden rounded-xl border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/5 p-6 shadow-[var(--shadow-xs)]">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[color:var(--gold)]" />
        <div className="flex items-start gap-3">
          <ShieldAlert
            className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--gold)]"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-relaxed text-foreground">{pick(s.statement, lang)}</p>
            <p className="mt-2 text-[14px] font-medium leading-relaxed text-foreground">
              {t("report.trust.safety.meaning")}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("report.trust.safety.findingsLabel")}
                </dt>
                <dd className="m-0 text-[14px] font-semibold text-foreground">
                  {count} {tp("report.trust.safety.findings", count)}
                </dd>
              </div>
              {s.safety_critical && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {t("report.trust.map.reviewed")}
                  </dt>
                  <dd className="m-0 text-[14px] font-semibold text-foreground">
                    {s.safety_critical.reviewed} {t("report.trust.of")} {s.safety_critical.items}
                  </dd>
                </div>
              )}
              {s.findings[0]?.observed_at && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {t("report.trust.safety.observedAt")}
                  </dt>
                  <dd className="m-0 text-[14px] font-semibold text-foreground">
                    {formatDate(s.findings[0].observed_at, lang)}
                  </dd>
                </div>
              )}
            </dl>
            {areas.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("report.trust.safety.areas")}
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-2">
                  {areas.map((c) => (
                    <li key={c!.competency_code}>
                      <a
                        href={`#trust-card-${c!.competency_code}`}
                        className="inline-flex min-h-[32px] items-center rounded-full border border-border bg-[color:var(--surface-subtle)] px-3 text-[13px] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {competencyName(c!, lang)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-4 text-[12px] text-muted-foreground">
              {t("report.trust.safety.source")}
            </p>
          </div>
        </div>
      </article>
    </Section>
  );
}
