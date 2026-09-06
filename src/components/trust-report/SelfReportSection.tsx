// TRUST Evidence Report — the candidate's own description.
//
// Visually subordinate on purpose: a dashed frame, muted tones, and a label
// on every row that says what this is. Nothing here is observed evidence and
// nothing here is compared with the observed evidence.

import { UserRound } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TrustReportDocument } from "@/lib/security-competency/trust-report.types";
import { pick } from "@/lib/security-competency/trust-report.types";
import { SELF_PATTERN_KEY } from "@/lib/security-competency/trust-report.presentation";
import { Section, Tag } from "./primitives";

export function SelfReportSection({ doc }: { doc: TrustReportDocument }) {
  const { t, lang, tp } = useT();
  const rows = doc.frozen_report.core.self_reported_patterns ?? [];
  return (
    <Section
      id="trust-self"
      title={t("report.trust.self.heading")}
      printOrder={5}
      subordinate
      aside={<Tag muted>{t("report.trust.map.selfReportTag")}</Tag>}
    >
      <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-[var(--shadow-xs)]">
            <UserRound className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-[13px] text-muted-foreground">{t("report.trust.self.lede")}</p>
        </div>
        {rows.length === 0 ? (
          <p className="text-[13px] italic text-muted-foreground">{t("report.trust.self.empty")}</p>
        ) : (
          <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {rows.map((s) => (
              <li
                key={s.domain_key}
                className="flex flex-col gap-0.5 border-b border-border/70 pb-3 last:border-0 sm:[&:nth-last-child(2)]:border-0"
              >
                <p className="text-[14px] font-semibold text-foreground">
                  {lang === "en" ? s.domain_en : s.domain_sv}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {t(SELF_PATTERN_KEY[s.pattern])} ·{" "}
                  {t(`report.trust.self.consistency.${s.consistency}` as const)} · {s.item_count}{" "}
                  {tp("report.trust.self.questions", s.item_count)}
                </p>
                {pick(s.factual_explanation, lang) && (
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {pick(s.factual_explanation, lang)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
