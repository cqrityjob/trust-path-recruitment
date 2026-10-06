import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import { sentinelReport, sentinelEmployerAction } from "@/lib/sentinel/sentinel.functions";
import { SentinelReportView } from "./Report";
import { useState, type ReactNode } from "react";
export function SentinelReportGate({
  attemptId,
  employerId,
  canManage = true,
  children,
}: {
  attemptId: string;
  employerId?: string;
  canManage?: boolean;
  children: ReactNode;
}) {
  const { lang } = useT();
  const sv = lang !== "en";
  const load = useServerFn(sentinelReport);
  const action = useServerFn(sentinelEmployerAction);
  const [minutes, setMinutes] = useState(35);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const q = useQuery({
    queryKey: ["sentinel", "report", attemptId, employerId],
    queryFn: () => load({ data: { attemptId, employerId: employerId ?? null } }),
  });
  if (q.isPending) return <p>{sv ? "Hämtar rapport…" : "Loading report…"}</p>;
  if (q.isError)
    return (
      <p role="alert">
        {sv ? "Rapporten kunde inte hämtas." : "The report could not be loaded."}
        <button onClick={() => void q.refetch()} className="ml-3 underline">
          {sv ? "Försök igen" : "Retry"}
        </button>
      </p>
    );
  if (!q.data) return <>{children}</>;
  return (
    <div className="space-y-5">
      <SentinelReportView
        report={q.data.report}
        status={q.data.status}
        visible={q.data.reportVisible}
        sv={sv}
        employer={!!employerId}
        attemptId={canManage ? attemptId : undefined}
        onReleased={() => void q.refetch()}
      />
      {employerId && canManage && q.data.status === "ready" && (
        <div className="rounded-xl border p-5">
          <h2 className="font-semibold">
            {sv ? "Bevilja förlängd tid före start" : "Authorise extended time before start"}
          </h2>
          <label className="mt-3 block text-sm">
            {sv ? "Minuter" : "Minutes"}
            <input
              type="number"
              min={25}
              max={120}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="ml-3 rounded border p-2"
            />
          </label>
          <button
            className="mt-3 min-h-11 rounded border px-4"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(false);
              try {
                await action({
                  data: { attemptId, action: "accommodation", durationSeconds: minutes * 60 },
                });
              } catch {
                setError(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            {sv ? "Bevilja och spara" : "Authorise and save"}
          </button>
          {error && (
            <p role="alert">
              {sv
                ? "Tiden kunde inte ändras. Testet kan redan ha startat."
                : "Time could not be changed. The attempt may have started."}
            </p>
          )}
          {!busy && !error && (
            <p className="mt-2 text-xs text-muted-foreground">
              {sv
                ? "Tilldelad tid visas för kandidaten och i slutrapporten."
                : "Allocated time is shown to the candidate and in the final report."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
