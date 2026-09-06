// TRUST Evidence Report — interview addenda. Live, and labelled as such.
//
// The frozen report never changes. What an interview later established is a
// separate rail with its own timestamp, its own author line and the sentence
// "Levande information — ingår inte i den frysta rapporten." Writing goes
// through the existing interview-note function; the document re-reads.
// Screen only: the printed report is the frozen one.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import type {
  InterviewAddendum,
  TrustReportDocument,
} from "@/lib/security-competency/trust-report.types";
import {
  ADDENDUM_STATUS_KEY,
  addendaNewestFirst,
  competencyName,
  formatDateTime,
} from "@/lib/security-competency/trust-report.presentation";
import {
  recordInterviewNote,
  type InterviewNoteOutcome,
} from "@/lib/security-competency/academy-employer.functions";
import { Chip, Section } from "./primitives";

const STATUS_TO_OUTCOME: Record<InterviewAddendum["status"], InterviewNoteOutcome> = {
  supported_in_interview: "evidence_confirmed",
  not_supported_in_interview: "evidence_not_confirmed",
  additional_context: "additional_context",
};

const STATUSES: InterviewAddendum["status"][] = [
  "supported_in_interview",
  "not_supported_in_interview",
  "additional_context",
];

export function AddendaRail({
  doc,
  attemptId,
  canRecord,
}: {
  doc: TrustReportDocument;
  attemptId: string;
  canRecord: boolean;
}) {
  const { t, lang } = useT();
  const items = addendaNewestFirst(doc);
  const byCode = new Map(
    (doc.frozen_report.core.competencies ?? []).map((c) => [c.competency_code, c]),
  );
  const name = (code: string) => {
    const c = byCode.get(code);
    return c ? competencyName(c, lang) : code;
  };

  return (
    <Section
      id="trust-addenda"
      title={t("report.trust.addenda.heading")}
      printOrder={10}
      className="no-print"
      aside={
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-trust" aria-hidden="true" />
          <span className="text-[12px] font-semibold text-foreground">
            {t("report.trust.addenda.liveTitle")}
          </span>
          <span className="text-[12px] text-muted-foreground">
            {t("report.trust.addenda.liveSub")}
          </span>
          <span className="sr-only">{t("report.trust.addenda.live")}</span>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
          {doc.addenda_overlay?.as_of && (
            <p className="text-[12px] text-muted-foreground">
              {t("report.trust.addenda.asOf")} {formatDateTime(doc.addenda_overlay.as_of, lang)}
            </p>
          )}
          {items.length === 0 ? (
            <p className="mt-2 text-[13px] italic text-muted-foreground">
              {t("report.trust.addenda.empty")}
            </p>
          ) : (
            <ol className="mt-3 flex flex-col">
              {items.map((a) => (
                <li key={a.id} className="relative flex gap-4 pb-5 last:pb-0">
                  <span
                    aria-hidden="true"
                    className="relative mt-1.5 flex w-3 shrink-0 justify-center"
                  >
                    <span className="h-2.5 w-2.5 rounded-full border-2 border-trust bg-card" />
                    <span className="absolute top-3 bottom-[-20px] w-px bg-border last:hidden" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold text-foreground">
                        {name(a.competency_code)}
                      </p>
                      <Chip
                        tone={
                          a.status === "supported_in_interview"
                            ? "established"
                            : a.status === "not_supported_in_interview"
                              ? "limited"
                              : "neutral"
                        }
                      >
                        {t(ADDENDUM_STATUS_KEY[a.status])}
                      </Chip>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {[a.author_display_name, formatDateTime(a.recorded_at, lang)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {a.note && (
                      <p className="mt-1.5 text-[14px] leading-relaxed text-foreground">{a.note}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {canRecord && <Composer doc={doc} attemptId={attemptId} />}
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {t("report.trust.addenda.inert")}
          </p>
        </div>
      </div>
    </Section>
  );
}

function Composer({ doc, attemptId }: { doc: TrustReportDocument; attemptId: string }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const recordFn = useServerFn(recordInterviewNote);
  const areas = doc.frozen_report.core.competencies ?? [];
  const [area, setArea] = useState(areas[0]?.competency_code ?? "");
  const [status, setStatus] = useState<InterviewAddendum["status"]>("supported_in_interview");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save() {
    if (!area) return;
    setSaving(true);
    setFailed(false);
    try {
      await recordFn({
        data: {
          attemptId,
          areaCode: area,
          outcome: STATUS_TO_OUTCOME[status],
          note: note.trim() || null,
        },
      });
      setNote("");
      await qc.invalidateQueries({ queryKey: ["trust-report", attemptId] });
      await qc.invalidateQueries({ queryKey: ["academy", "interviewNotes", attemptId] });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const field =
    "mt-1 w-full min-h-[44px] rounded-[8px] border border-border bg-card px-3 text-[14px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="rounded-xl border border-border bg-secondary/40 p-4"
      aria-label={t("report.trust.addenda.add")}
    >
      <p className="text-[13px] font-semibold text-foreground">{t("report.trust.addenda.add")}</p>
      <label className="mt-3 block text-[12px] font-medium text-muted-foreground">
        {t("report.trust.addenda.area")}
        <select value={area} onChange={(e) => setArea(e.target.value)} className={field}>
          {areas.map((c) => (
            <option key={c.competency_code} value={c.competency_code}>
              {competencyName(c, lang)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="mt-3">
        <legend className="text-[12px] font-medium text-muted-foreground">
          {t("report.trust.addenda.status")}
        </legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <label
              key={s}
              className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-card px-3 text-[13px] text-foreground has-[:checked]:border-accent has-[:checked]:bg-[color:var(--secondary)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                type="radio"
                name="trust-addendum-status"
                value={s}
                checked={status === s}
                onChange={() => setStatus(s)}
                className="sr-only"
              />
              {t(ADDENDUM_STATUS_KEY[s])}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 block text-[12px] font-medium text-muted-foreground">
        {t("report.trust.addenda.note")}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={3}
          className={`${field} py-2`}
        />
      </label>
      {failed && (
        <p role="alert" className="mt-2 text-[13px] text-destructive">
          {t("report.trust.addenda.failed")}
        </p>
      )}
      <button
        type="submit"
        disabled={saving || !area}
        className="mt-3 inline-flex min-h-[44px] items-center rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {saving ? t("report.trust.addenda.saving") : t("report.trust.addenda.save")}
      </button>
    </form>
  );
}
