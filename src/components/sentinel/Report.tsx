import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sentinelEmployerAction } from "@/lib/sentinel/sentinel.functions";
import { TITLE, type SentinelReport } from "@/lib/sentinel/types";
export function SentinelReportView({
  report,
  status,
  sv,
  employer,
  attemptId,
  visible,
  onReleased,
}: {
  report: SentinelReport | null;
  status: string;
  sv: boolean;
  employer?: boolean;
  attemptId?: string;
  visible?: boolean;
  onReleased?: () => void;
}) {
  const action = useServerFn(sentinelEmployerAction);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <article className="mx-auto max-w-3xl space-y-6 rounded-2xl border bg-card p-6 sm:p-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {sv ? "Separat testresultat" : "Separate assessment result"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{TITLE[sv ? "sv" : "en"]}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {sv
            ? "Pilotinnehåll – inte psykometriskt validerat · v1"
            : "Pilot content — not psychometrically validated · v1"}
        </p>
      </header>
      {!report ? (
        <p>
          {status === "running" || status === "ready"
            ? sv
              ? "Testet är ännu inte slutfört."
              : "The assessment has not been completed."
            : status === "abandoned"
              ? sv
                ? "Testtillfället är ofullständigt eller avslutat utan resultat."
                : "This attempt is incomplete or closed without a result."
              : sv
                ? "Dina svar har tagits emot. Arbetsgivaren avgör när resultatet delas med dig."
                : "Your responses have been received. The employer decides when to share the result with you."}
        </p>
      ) : (
        <>
          <div className="rounded-xl bg-muted/30 p-5">
            <p className="text-sm">
              {report.status === "timed_out"
                ? sv
                  ? "Tiden tog slut – senast sparade svar räknas"
                  : "Time expired — last saved answers scored"
                : sv
                  ? "Slutfört"
                  : "Completed"}
            </p>
            <p className="mt-2 text-4xl font-semibold tabular-nums">
              {report.correct}
              <span className="text-xl text-muted-foreground"> / {report.total}</span>
            </p>
            <p className="mt-1 text-sm">
              {sv ? "rätt svar" : "correct answers"} ·{" "}
              {Math.round((report.correct / report.total) * 100)} % {sv ? "rätt" : "correct"}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">{sv ? "Felaktiga svar" : "Incorrect"}</dt>
              <dd className="mt-1 font-semibold">{report.incorrect}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{sv ? "Obesvarade" : "Unanswered"}</dt>
              <dd className="mt-1 font-semibold">{report.unanswered}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {sv ? "Tid använd (sammanhang)" : "Time used (context)"}
              </dt>
              <dd>
                {Math.floor(report.elapsedSeconds / 60)}:
                {String(report.elapsedSeconds % 60).padStart(2, "0")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{sv ? "Formversion" : "Form version"}</dt>
              <dd>{report.version}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{sv ? "Datum" : "Date"}</dt>
              <dd>{new Date(report.finishedAt).toLocaleString(sv ? "sv-SE" : "en-GB")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{sv ? "Tilldelad tid" : "Allocated time"}</dt>
              <dd>
                {report.durationSeconds / 60} min{" "}
                {report.accommodation
                  ? sv
                    ? "· förlängd tid beviljad"
                    : "· authorised extended time"
                  : ""}
              </dd>
            </div>
          </dl>
          <p className="text-sm leading-relaxed">
            {sv
              ? "Resultatet visar hur du löste uppgifterna i detta testtillfälle. Pilotens tidsgräns och svårighetsordning är designval. Normer, reliabilitet och validitet har inte fastställts. Resultatet ger inget mått på IQ, ingen jämförelse med en befolkning och inget beslut om lämplighet för en tjänst."
              : "The result shows how you solved the tasks on this occasion. The pilot's timing and difficulty order are design choices. Norms, reliability and validity have not been established. The result provides no IQ measure, population comparison or decision on job suitability."}
          </p>
          {employer && (
            <div className="border-t pt-4">
              <h2 className="font-semibold">{sv ? "Samtalsunderlag" : "Follow-up conversation"}</h2>
              <p className="mt-2 text-sm">
                {sv
                  ? "Fråga hur kandidaten sökte efter mönster, hanterade osäkerhet och kontrollerade sina val. Ta hänsyn till testförhållanden och eventuella tekniska problem. Använd flera relevanta underlag i en strukturerad intervju."
                  : "Ask how the candidate looked for patterns, managed uncertainty and checked their choices. Consider testing conditions and any technical problems. Use several relevant sources in a structured interview."}
              </p>
            </div>
          )}
        </>
      )}
      {employer && report && attemptId && !visible && (
        <button
          disabled={busy}
          className="min-h-11 rounded-lg border px-4"
          onClick={async () => {
            setBusy(true);
            setError(false);
            try {
              await action({ data: { attemptId, action: "release" } });
              onReleased?.();
            } catch {
              setError(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {sv ? "Dela resultat med kandidaten" : "Share result with candidate"}
        </button>
      )}
      {error && (
        <p role="alert">
          {sv
            ? "Resultatet kunde inte delas. Försök igen."
            : "The result could not be shared. Retry."}
        </p>
      )}
    </article>
  );
}
