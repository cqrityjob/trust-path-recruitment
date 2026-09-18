// HAYAT — what the holder sees beside the file they chose.
//
// Two boxes, never one. The first says what was READ. The second says what was
// VERIFIED, and for an uploaded document that is, truthfully, nothing. They are
// separate elements with separate headings so that no layout change can ever
// make "Document read" sit where a verification result would be expected.

import { AlertTriangle, FileSearch, Loader2, ShieldQuestion } from "lucide-react";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type { FieldNotice, FieldNotices } from "@/lib/security-passport/hayat/suggestions";
import type { SuggestibleField } from "@/lib/security-passport/hayat/types";
import type { HayatDecision } from "@/lib/security-passport/hayat/verification/model";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { HayatReadingState } from "./use-hayat-reading";

export type HayatAssessmentState =
  | { readonly state: "none" }
  | { readonly state: "checking" }
  | { readonly state: "unavailable" }
  | { readonly state: "done"; readonly decision: HayatDecision; readonly recorded: boolean };

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [k, v]) => out.replace(`{${k}}`, String(v)), template);

/** "Avläst av HAYAT", shown on a field only while it still holds HAYAT's value. */
export function HayatBadge() {
  const { pt } = usePassportCopy();
  return (
    <span
      data-hayat-badge
      className="ml-2 inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 align-middle text-[11px] font-medium text-foreground"
    >
      <FileSearch size={11} aria-hidden="true" />
      {pt("hayat.readBadge")}
    </span>
  );
}

/** The line under one field: agreement, a conflict, or a choice to make. */
export function HayatFieldNote({
  field,
  notice,
  onAccept,
}: {
  field: SuggestibleField;
  notice: FieldNotice | undefined;
  onAccept: (field: SuggestibleField, value: string) => void;
}) {
  const { pt } = usePassportCopy();
  if (!notice || notice.kind === "filled") return null;
  const button =
    "min-h-11 rounded-md border border-input bg-background px-3 text-xs font-medium sm:min-h-9";
  return (
    <span
      data-hayat-note={field}
      data-hayat-note-kind={notice.kind}
      className="mt-2 block text-xs text-muted-foreground"
    >
      {notice.kind === "agrees" && pt("hayat.field.agrees")}
      {notice.kind === "not_found" && pt("hayat.field.notFound")}
      {notice.kind === "conflict" && (
        <>
          <span className="block text-foreground">
            {fill(pt("hayat.field.conflict"), { value: notice.documentValue })}
          </span>
          <button
            type="button"
            className={`${button} mt-2`}
            onClick={() => onAccept(field, notice.documentValue)}
          >
            {pt("hayat.field.useDocument")}
          </button>
        </>
      )}
      {notice.kind === "no_expiry_conflict" && (
        <>
          <span className="block text-foreground">
            {fill(pt("hayat.field.noExpiryConflict"), { value: notice.documentValue })}
          </span>
          <button
            type="button"
            className={`${button} mt-2`}
            onClick={() => onAccept(field, notice.documentValue)}
          >
            {pt("hayat.field.useDocument")}
          </button>
        </>
      )}
      {notice.kind === "choose" && (
        <>
          <span className="block text-foreground">
            {pt(`hayat.field.choose.${notice.reason}` as PassportCopyKey)}
          </span>
          <span className="mt-2 flex flex-wrap gap-2">
            {notice.candidates.map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={button}
                onClick={() => onAccept(field, candidate)}
              >
                {fill(pt("hayat.field.use"), { value: candidate })}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}

export function HayatPanel({
  reading,
  notices,
  assessment,
  onRetry,
  onChooseOther,
}: {
  reading: HayatReadingState;
  notices: FieldNotices;
  assessment: HayatAssessmentState;
  onRetry: () => void;
  onChooseOther: () => void;
}) {
  const { pt } = usePassportCopy();
  if (reading.phase === "idle") return null;
  const box = "mt-4 rounded-md border border-border bg-background p-4 text-sm";

  if (reading.phase === "reading")
    return (
      <p data-hayat-panel data-hayat-phase="reading" role="status" className={`${box} flex gap-2`}>
        <Loader2 size={16} aria-hidden="true" className="mt-0.5 shrink-0 animate-spin" />
        {pt("hayat.reading")}
      </p>
    );

  const verification = <Verification assessment={assessment} />;

  if (reading.phase === "failed")
    return (
      <>
        <div data-hayat-panel data-hayat-phase="failed" role="status" className={box}>
          <p className="flex gap-2" data-hayat-failure={reading.reason}>
            <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{pt(`hayat.fail.${reading.reason}` as PassportCopyKey)}</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{pt("hayat.fail.kept")}</p>
          {(reading.reason === "timeout" || reading.reason === "engine_unavailable") && (
            <button
              type="button"
              className="mt-3 min-h-11 rounded-md border border-input bg-background px-4 text-sm"
              onClick={onRetry}
            >
              {pt("hayat.retry")}
            </button>
          )}
        </div>
        {verification}
      </>
    );

  const r = reading.reading;
  const suggested = Object.values(notices).some((n) => n && n.kind !== "not_found");
  const selectionMatches = r.issuer.state === "match" && r.credentialType.state === "match";
  const mismatch = r.issuer.state === "different" || r.credentialType.state === "different";
  return (
    <>
      <div data-hayat-panel data-hayat-phase="read" role="status" className={box}>
        <p className="flex items-center gap-2 font-medium">
          <FileSearch size={16} aria-hidden="true" />
          {pt("hayat.read.title")}
        </p>
        <p className="mt-1 text-muted-foreground">
          {pt(suggested ? "hayat.read.lead" : "hayat.read.nothing")}
        </p>
        <ul className="mt-3 space-y-2">
          {r.usedOcr && <li data-hayat-ocr>{pt("hayat.read.ocr")}</li>}
          {r.pagesRead < r.pageCount && (
            <li>{fill(pt("hayat.read.pages"), { read: r.pagesRead, total: r.pageCount })}</li>
          )}
          {selectionMatches && <li data-hayat-selection="match">{pt("hayat.match.ok")}</li>}
          {r.issuer.state === "different" && (
            <li data-hayat-issuer="different" className="flex gap-2 text-foreground">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              {fill(pt("hayat.issuer.different"), { found: r.issuer.found })}
            </li>
          )}
          {r.issuer.state === "not_found" && (
            <li data-hayat-issuer="not_found">{pt("hayat.issuer.notFound")}</li>
          )}
          {r.credentialType.state === "different" && (
            <li data-hayat-type="different" className="flex gap-2 text-foreground">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              {fill(pt("hayat.type.different"), { found: r.credentialType.found })}
            </li>
          )}
          {r.credentialType.state === "not_found" && (
            <li data-hayat-type="not_found">{pt("hayat.type.notFound")}</li>
          )}
          {r.holderName.state === "differs" && (
            <li data-hayat-holder="differs">
              {fill(pt("hayat.holder.differs"), { name: r.holderName.nameOnDocument })}
            </li>
          )}
          {r.holderName.state === "not_compared" && r.holderName.nameOnDocument && (
            <li data-hayat-holder="not_compared">
              {fill(pt("hayat.holder.check"), { name: r.holderName.nameOnDocument })}
            </li>
          )}
        </ul>
        {mismatch && (
          <button
            type="button"
            className="mt-3 min-h-11 rounded-md border border-input bg-background px-4 text-sm"
            onClick={onChooseOther}
          >
            {pt("hayat.chooseOther")}
          </button>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{pt("hayat.private")}</p>
      </div>
      {verification}
    </>
  );
}

function Verification({ assessment }: { assessment: HayatAssessmentState }) {
  const { pt } = usePassportCopy();
  if (assessment.state === "none") return null;
  const box = "mt-3 rounded-md border border-border bg-background p-4 text-sm";
  const heading = (
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      <ShieldQuestion size={14} aria-hidden="true" />
      {pt("hayat.verify.title")}
    </p>
  );
  if (assessment.state === "checking")
    return (
      <div data-hayat-verification data-hayat-status="checking" role="status" className={box}>
        {heading}
        <p className="mt-2">{pt("hayat.verify.checking")}</p>
      </div>
    );
  if (assessment.state === "unavailable")
    return (
      <div
        data-hayat-verification
        data-hayat-status="temporarily_unavailable"
        role="status"
        className={box}
      >
        {heading}
        <p className="mt-2 font-medium">{pt("hayat.verify.status.temporarily_unavailable")}</p>
        <p className="mt-1 text-muted-foreground">{pt("hayat.verify.unavailableCall")}</p>
      </div>
    );
  const { decision, recorded } = assessment;
  return (
    <div
      data-hayat-verification
      data-hayat-status={decision.status}
      data-hayat-recorded={recorded ? "true" : "false"}
      role="status"
      className={box}
    >
      {heading}
      <p className="mt-2 font-medium">
        {pt(`hayat.verify.status.${decision.status}` as PassportCopyKey)}
      </p>
      <p className="mt-1 text-muted-foreground" data-hayat-reason={decision.reasons[0]}>
        {pt(`hayat.verify.reason.${decision.reasons[0] ?? "not_evaluated"}` as PassportCopyKey)}
      </p>
      {decision.bindingLevel === "email_control" && (
        <p className="mt-2 text-xs text-muted-foreground">{pt("hayat.verify.binding.email")}</p>
      )}
      {decision.revocationNotCovered && decision.status === "verified" && (
        <p className="mt-2 text-xs text-muted-foreground">
          {pt("hayat.verify.revocationNotCovered")}
        </p>
      )}
      {decision.status === "verified" && !recorded && (
        <p className="mt-2 text-xs text-foreground">{pt("hayat.verify.notRecorded")}</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{pt("hayat.verify.separate")}</p>
    </div>
  );
}
