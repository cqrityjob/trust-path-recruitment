// TRUST Evidence Report — the printed document's own structure.
//
// On screen the report is one continuous page. On paper it is a document in
// two parts: an executive employer report, and the evidence appendix behind
// it. Nothing is removed from either -- the appendix carries the full
// per-competency evidence -- but a recruitment manager should be able to read
// the first part and stop.
//
// These blocks exist only in print (.print-only), and the printed order is
// set by data-print-order in styles.css, so the screen order is untouched.

import { useT } from "@/i18n/context";
import type { TrustReportDocument } from "@/lib/security-competency/trust-report.types";
import {
  PATTERN_KEY,
  PRIORITY_KEY,
  SUFFICIENCY_KEY,
  buildEvidenceCards,
  competencyName,
} from "@/lib/security-competency/trust-report.presentation";

export function PrintPart({ part, printOrder }: { part: 1 | 2; printOrder: number }) {
  const { t } = useT();
  return (
    <div
      className={`print-only tr-part tr-part-${part}`}
      data-print-order={printOrder}
      aria-hidden="true"
    >
      <p className="tr-part-label">
        {part === 1 ? t("report.trust.print.part1") : t("report.trust.print.part2")}
      </p>
      <p className="tr-part-lede">
        {part === 1 ? t("report.trust.print.part1Lede") : t("report.trust.print.part2Lede")}
      </p>
    </div>
  );
}

/** The eight areas on one page: what the pattern was, how much evidence
 *  stands behind it, and what the next step is. Printed only -- on screen
 *  the same facts are on the cards themselves. */
export function CompetencySummary({
  doc,
  printOrder,
}: {
  doc: TrustReportDocument;
  printOrder: number;
}) {
  const { t, lang, tp } = useT();
  const cards = buildEvidenceCards(doc);
  if (cards.length === 0) return null;
  return (
    <div className="print-only tr-summary" data-print-order={printOrder}>
      <h2>{t("report.trust.summary.heading")}</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">{t("report.trust.summary.area")}</th>
            <th scope="col">{t("report.trust.axis.pattern")}</th>
            <th scope="col">{t("report.trust.axis.evidence")}</th>
            <th scope="col">{t("report.trust.axis.next")}</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.code}>
              <th scope="row">{competencyName(c.core, lang)}</th>
              <td>{t(PATTERN_KEY[c.core.observed_pattern])}</td>
              <td>
                {t(SUFFICIENCY_KEY[c.core.evidence_sufficiency])} ·{" "}
                {c.core.observed_item_count ?? 0}{" "}
                {tp("report.trust.items", c.core.observed_item_count ?? 0)}
              </td>
              <td>{t(PRIORITY_KEY[c.area?.follow_up_priority ?? "none"])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
