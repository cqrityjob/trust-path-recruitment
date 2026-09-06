// TRUST Evidence Report — the evidence map.
//
// Eight cards, one per competency. Collapsed, a card is readable in a glance:
// the name, the three dimensions as three labelled words, the count, and the
// document's own one-line explanation. Expanded, it shows the observed tasks,
// the scope of the evidence, the candidate's own description (marked as such),
// the human-reviewed free text, the limitations, the prepared TRUST question
// and the traceability line. Print shows every card expanded.

import { ShieldAlert } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TrustReportDocument } from "@/lib/security-competency/trust-report.types";
import { pick } from "@/lib/security-competency/trust-report.types";
import {
  ADDENDUM_STATUS_KEY,
  FLAG_KEY,
  REASON_KEY,
  SELF_PATTERN_KEY,
  buildEvidenceCards,
  competencyName,
  type EvidenceCard,
} from "@/lib/security-competency/trust-report.presentation";
import { AxisTriplet, Fold, Section, Tag } from "./primitives";

export function EvidenceMap({ doc }: { doc: TrustReportDocument }) {
  const { t } = useT();
  const cards = buildEvidenceCards(doc);
  return (
    <Section
      id="trust-map"
      title={t("report.trust.map.heading")}
      lede={t("report.trust.map.lede")}
      printOrder={3}
    >
      {cards.length === 0 ? (
        <p className="rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-5 text-[13px] text-muted-foreground">
          {t("report.trust.map.empty")}
        </p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {cards.map((c) => (
            <li key={c.code} className="min-w-0">
              <Card card={c} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Card({ card }: { card: EvidenceCard }) {
  const { t, lang, tp } = useT();
  const { core, area } = card;
  const priority = area?.follow_up_priority ?? "none";
  const safety = Boolean(area?.safety_critical_follow_up);
  const basis = core.evidence_basis;
  const selfDescription = card.selfReports;
  const followUps = card.followUps.slice(0, 2);
  const flags = core.methodological_flags ?? [];
  const reasons = area?.verify_reasons ?? [];
  const traceable = Boolean(area?.traceability?.available);

  return (
    <article
      aria-labelledby={`trust-card-${card.code}`}
      data-competency={card.code}
      className="tr-card flex h-full flex-col rounded-[14px] border border-border bg-card p-5 shadow-[var(--shadow-xs)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3
          id={`trust-card-${card.code}`}
          className="text-[17px] font-semibold leading-snug tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {competencyName(core, lang)}
        </h3>
        {safety && (
          <span className="inline-flex min-h-[24px] items-center gap-1 rounded-[6px] border border-[color:var(--gold)]/60 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
            <ShieldAlert className="h-3.5 w-3.5 text-[color:var(--gold)]" aria-hidden="true" />
            {t("report.trust.safetyFollowUp")}
          </span>
        )}
      </div>
      <div className="mt-3">
        <AxisTriplet
          pattern={core.observed_pattern}
          sufficiency={core.evidence_sufficiency}
          items={core.observed_item_count ?? 0}
          priority={priority}
        />
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-foreground">
        {pick(core.factual_explanation, lang)}
      </p>

      <div className="mt-2">
        <Fold
          openLabel={t("report.trust.map.expand")}
          closeLabel={t("report.trust.map.collapse")}
          triggerClassName="-ml-2"
        >
          <div className="mt-2 flex flex-col gap-5 border-t border-border pt-4">
            <Block title={t("report.trust.map.observed")}>
              <p className="text-[14px] leading-relaxed text-foreground">
                {pick(core.factual_explanation, lang)}
              </p>
              {pick(core.behaviour, lang) && (
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {t("report.trust.map.behaviour")}:{" "}
                  </span>
                  {pick(core.behaviour, lang)}
                </p>
              )}
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Fact
                  label={t("report.trust.observedLabel")}
                  value={`${core.observed_item_count ?? 0} ${tp("report.trust.items", core.observed_item_count ?? 0)}`}
                />
                {typeof core.answered_item_count === "number" && (
                  <Fact
                    label={t("report.trust.map.scope.answered")}
                    value={String(core.answered_item_count)}
                  />
                )}
                {typeof core.context_count === "number" && (
                  <Fact
                    label={t("report.trust.map.scope.contexts")}
                    value={String(core.context_count)}
                  />
                )}
              </dl>
            </Block>

            <Block title={t("report.trust.map.scope")}>
              {basis ? (
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Fact
                    label={t("report.trust.map.scope.scenario")}
                    value={String(basis.scenario_items)}
                  />
                  <Fact
                    label={t("report.trust.map.scope.freeText")}
                    value={String(basis.free_text_items)}
                  />
                  <Fact
                    label={t("report.trust.map.scope.selfDescription")}
                    value={String(basis.self_description_items)}
                  />
                  <Fact
                    label={t("report.trust.map.reviewedWord")}
                    value={String(basis.free_text_reviewed)}
                  />
                </dl>
              ) : (
                <p className="text-[13px] italic text-muted-foreground">
                  {t("report.trust.map.scope.unavailable")}
                </p>
              )}
            </Block>

            <Block
              title={t("report.trust.map.selfReport")}
              tag={<Tag muted>{t("report.trust.map.selfReportTag")}</Tag>}
            >
              {selfDescription.length === 0 ? (
                <p className="text-[13px] italic text-muted-foreground">
                  {t("report.trust.map.selfReportNone")}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {selfDescription.map((s) => (
                    <li
                      key={s.domain_key}
                      className="rounded-[10px] border border-dashed border-border bg-[color:var(--surface-subtle)] px-3 py-2.5"
                    >
                      <p className="text-[13px] font-semibold text-foreground">
                        {lang === "en" ? s.domain_en : s.domain_sv}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {t(SELF_PATTERN_KEY[s.pattern])} · {s.item_count}{" "}
                        {tp("report.trust.self.questions", s.item_count)}
                      </p>
                      {pick(s.factual_explanation, lang) && (
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                          {pick(s.factual_explanation, lang)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            <Block title={t("report.trust.map.reviewed")}>
              {basis && basis.free_text_items > 0 ? (
                <p className="text-[13px] text-foreground">
                  {basis.free_text_reviewed} {t("report.trust.of")} {basis.free_text_items}{" "}
                  {t("report.trust.map.reviewedWord")}
                  {core.review_status
                    ? ` · ${t(`report.trust.map.reviewStatus.${core.review_status}` as const)}`
                    : ""}
                </p>
              ) : basis ? (
                <p className="text-[13px] italic text-muted-foreground">
                  {t("report.trust.map.reviewedNone")}
                </p>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  {core.review_status
                    ? t(`report.trust.map.reviewStatus.${core.review_status}` as const)
                    : t("report.trust.notAvailable")}
                </p>
              )}
              {area?.safety_critical && area.safety_critical.items > 0 && (
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {area.safety_critical.reviewed} {t("report.trust.of")}{" "}
                  {area.safety_critical.items} {t("report.trust.safety.reviewedCount")}
                </p>
              )}
            </Block>

            <Block title={t("report.trust.map.limitations")}>
              {core.limitation ? (
                <p className="text-[14px] leading-relaxed text-foreground">
                  {lang === "en" ? core.limitation.en : core.limitation.sv}
                </p>
              ) : (
                <p className="text-[13px] italic text-muted-foreground">
                  {t("report.trust.map.limitationsNone")}
                </p>
              )}
              {(flags.length > 0 || reasons.length > 0) && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {reasons.map((r) => (
                    <li
                      key={`r-${r}`}
                      className="inline-flex min-h-[24px] items-center rounded-[6px] border border-accent/30 bg-[color:var(--secondary)] px-2 text-[11px] font-semibold text-accent"
                    >
                      {t(REASON_KEY[r])}
                    </li>
                  ))}
                  {flags.map((f) => (
                    <li
                      key={f}
                      className="inline-flex min-h-[24px] items-center rounded-[6px] border border-border px-2 text-[11px] font-medium text-muted-foreground"
                    >
                      {t(FLAG_KEY[f])}
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            <Block title={t("report.trust.map.question")}>
              {followUps.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {followUps.map((f) => (
                    <li
                      key={`${f.focus}-${f.evidence_type}`}
                      className="rounded-[10px] border border-border bg-[color:var(--surface-subtle)] p-3"
                    >
                      <p className="text-[14px] font-medium leading-relaxed text-foreground">
                        {pick(f.question, lang)}
                      </p>
                      {pick(f.followup, lang) && (
                        <p className="mt-1.5 text-[13px] text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            {t("report.trust.map.followup")}:{" "}
                          </span>
                          {pick(f.followup, lang)}
                        </p>
                      )}
                      {(lang === "en" ? f.listen_for?.en : f.listen_for?.sv)?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            {t("report.trust.map.listenFor")}
                          </p>
                          <ul className="mt-1 list-disc pl-5 text-[13px] leading-relaxed text-foreground">
                            {(lang === "en" ? f.listen_for.en : f.listen_for.sv).map((x) => (
                              <li key={x}>{x}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : area?.interview_prompt ? (
                <p className="text-[14px] leading-relaxed text-foreground">
                  {pick(area.interview_prompt, lang)}
                </p>
              ) : (
                <p className="text-[13px] italic text-muted-foreground">
                  {t("report.trust.map.questionNone")}
                </p>
              )}
            </Block>

            <Block title={t("report.trust.map.traceability")}>
              <p className="text-[13px] text-muted-foreground">
                {traceable ? t("report.trust.map.traceable") : t("report.trust.map.notTraceable")}
              </p>
              {card.addenda.length > 0 && (
                <div className="no-print mt-2">
                  <Tag muted>{t("report.trust.map.addenda")}</Tag>
                  <ul className="mt-1.5 flex flex-col gap-1 text-[13px] text-muted-foreground">
                    {card.addenda.map((a) => (
                      <li key={a.id}>
                        <span className="font-semibold text-foreground">
                          {t(ADDENDUM_STATUS_KEY[a.status])}
                        </span>
                        {a.note ? ` · ${a.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Block>
          </div>
        </Fold>
      </div>
    </article>
  );
}

function Block({
  title,
  tag,
  children,
}: {
  title: string;
  tag?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="avoid-break">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h4>
        {tag}
      </div>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="m-0 text-[14px] font-semibold text-foreground">{value}</dd>
    </div>
  );
}
