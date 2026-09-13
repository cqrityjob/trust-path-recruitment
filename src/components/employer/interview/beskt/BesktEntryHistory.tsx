// The whole life of one documented theme: every version, why each changed,
// who wrote it and when, plus every verification step.
//
// Fetched on demand rather than with the workspace, because a case with
// twenty themes and three corrections apiece would otherwise pay for a
// history nobody opened. It is a READ of an append-only record: nothing here
// can edit, and there is deliberately no control that could.
//
// The current version is labelled as current and the rest as earlier — in
// words, not by position or colour — because "which one is in force" is the
// first question anyone opening a history has.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import { getBesktEntryHistory } from "@/lib/beskt/interview-conduct.functions";
import { besktEntryHistoryKey } from "@/lib/beskt/conduct-queries";
import { besktErrorKey } from "@/lib/beskt/errors";
import { Chip } from "@/components/employer/interview/InterviewUi";
import { SENSITIVITY_LABEL, VERIFICATION_LABEL } from "./BesktConductUi";

export function BesktEntryHistory({ sessionId, entryId }: { sessionId: string; entryId: string }) {
  const { t } = useT();
  const fetchHistory = useServerFn(getBesktEntryHistory);
  const q = useQuery({
    queryKey: besktEntryHistoryKey(sessionId, entryId),
    queryFn: () => fetchHistory({ data: { entryId } }),
    retry: false,
  });

  if (q.isLoading) {
    return (
      <p role="status" className="mt-2 text-sm text-muted-foreground">
        {t("beskt.conduct.history.loading")}
      </p>
    );
  }
  if (q.isError) {
    // The governed code chooses our sentence. The original never renders.
    return (
      <p role="alert" className="mt-2 text-sm text-destructive">
        {t(besktErrorKey(q.error))}
      </p>
    );
  }

  const data = q.data;
  if (!data || data.versions.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">{t("beskt.conduct.history.empty")}</p>;
  }

  return (
    <div className="mt-3 space-y-4">
      <ol className="space-y-3">
        {data.versions.map((v) => {
          const current = v.supersededByEntryId === null;
          return (
            <li
              key={v.entryId}
              className="rounded-md border border-border p-3"
              aria-label={
                current ? t("beskt.conduct.history.current") : t("beskt.conduct.history.historical")
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={current ? "confirmed" : "neutral"}>
                  {current
                    ? t("beskt.conduct.history.current")
                    : t("beskt.conduct.history.historical")}
                </Chip>
                <span className="text-xs text-muted-foreground">
                  {t("beskt.conduct.entry.version")} {v.entryVersion}
                </span>
                {v.recordedAt && (
                  <span className="text-xs text-muted-foreground">
                    {t("beskt.conduct.history.at")}: {v.recordedAt.slice(0, 16).replace("T", " ")}
                  </span>
                )}
                {v.recordedBy && (
                  <span className="break-all font-mono text-xs text-muted-foreground">
                    {t("beskt.conduct.history.by")}: {v.recordedBy}
                  </span>
                )}
              </div>

              {v.correctionReason && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t("beskt.conduct.history.reason")}: {v.correctionReason}
                </p>
              )}

              <dl className="mt-2 space-y-1.5">
                <HistoryField
                  label={t("beskt.conduct.entry.observableFact")}
                  value={v.observableFact}
                />
                <HistoryField
                  label={t("beskt.conduct.entry.candidateExplanation")}
                  value={v.candidateExplanation}
                />
                <HistoryField
                  label={t("beskt.conduct.entry.interviewerInterpretation")}
                  value={v.interviewerInterpretation}
                />
                <HistoryField
                  label={t("beskt.conduct.entry.alternativeExplanation")}
                  value={v.alternativeExplanation}
                />
                <HistoryField
                  label={t("beskt.conduct.entry.protectiveFactor")}
                  value={v.protectiveFactor}
                />
                <HistoryField
                  label={t("beskt.conduct.entry.verificationNeed")}
                  value={v.verificationNeed}
                />
                <HistoryField
                  label={t("beskt.conduct.entry.verificationState")}
                  value={t(VERIFICATION_LABEL[v.verificationState])}
                />
                <HistoryField
                  label={t("beskt.conduct.entry.verificationSource")}
                  value={v.verificationSource}
                />
                <HistoryField
                  label={t("beskt.conduct.entry.sensitivityClass")}
                  value={t(SENSITIVITY_LABEL[v.sensitivityClass])}
                />
              </dl>
            </li>
          );
        })}
      </ol>

      <div>
        <h4 className="text-sm font-semibold text-foreground">
          {t("beskt.conduct.history.verifications")}
        </h4>
        {data.verifications.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{t("beskt.conduct.history.empty")}</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {data.verifications.map((v) => (
              <li key={v.seq} className="rounded-md border border-border p-3 text-xs">
                <p className="text-foreground">
                  {t("beskt.conduct.history.from")}:{" "}
                  {v.previousState ? t(VERIFICATION_LABEL[v.previousState]) : "—"} ·{" "}
                  {t("beskt.conduct.history.to")}: {t(VERIFICATION_LABEL[v.newState])}
                </p>
                {v.source && (
                  <p className="mt-1 text-muted-foreground">
                    {t("beskt.conduct.history.source")}: {v.source}
                  </p>
                )}
                {v.note && (
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {t("beskt.conduct.history.note")}: {v.note}
                  </p>
                )}
                <p className="mt-1 text-muted-foreground">
                  {t("beskt.conduct.history.at")}: {v.recordedAt.slice(0, 16).replace("T", " ")}
                  {v.recordedBy ? ` · ${t("beskt.conduct.history.by")}: ${v.recordedBy}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/** One field of one historical version. Empty fields are shown as empty, so a
 *  reader can see that a version did NOT say something. */
function HistoryField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-xs text-foreground">{value ?? "—"}</dd>
    </div>
  );
}
