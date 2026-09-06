// TRUST Evidence Report — the employer page, composed.
//
// Screen order: identity, thirty-second overview, evidence map, the
// candidate's own description, safety follow-up (when a human finding
// exists), the TRUST Interview Plan, the live addenda rail, and "Om
// rapporten". Print reorders by data-print-order (styles.css) so the
// frozen document comes out as identity, overview, evidence, self-
// description, plan, safety, limitations, method -- and the live rail
// stays on screen.

import type { TrustReportDocument } from "@/lib/security-competency/trust-report.types";
import { CompetencySummary, PrintPart } from "./PrintStructure";
import { ProvenanceSection } from "./ProvenanceSection";
import { AddendaRail } from "./AddendaRail";
import { EvidenceMap } from "./EvidenceMap";
import { InterviewPlanSection } from "./InterviewPlanSection";
import { MethodSection } from "./MethodSection";
import { OverviewHero } from "./OverviewHero";
import { ReportHeader } from "./ReportHeader";
import { SafetyFollowUpSection } from "./SafetyFollowUpSection";
import { SelfReportSection } from "./SelfReportSection";
import type { TrustReportNav, TrustReportSubject } from "./nav";

export function TrustReportPage({
  doc,
  attemptId,
  nav,
  subject,
  canRecord,
}: {
  doc: TrustReportDocument;
  attemptId: string;
  nav: TrustReportNav;
  subject: TrustReportSubject;
  canRecord: boolean;
}) {
  return (
    <div
      className="trust-report flex flex-col"
      data-report-id={doc.report_id}
      data-schema={doc.schema_version}
    >
      <ReportHeader doc={doc} nav={nav} subject={subject} />
      <PrintPart part={1} printOrder={2} />
      <OverviewHero doc={doc} nav={nav} />
      <CompetencySummary doc={doc} printOrder={4} />
      <EvidenceMap doc={doc} />
      <SelfReportSection doc={doc} />
      <SafetyFollowUpSection doc={doc} />
      <InterviewPlanSection doc={doc} nav={nav} />
      <PrintPart part={2} printOrder={8} />
      <AddendaRail doc={doc} attemptId={attemptId} canRecord={canRecord} />
      <MethodSection doc={doc} />
      <ProvenanceSection doc={doc} printOrder={11} />
    </div>
  );
}
