import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Shield, Clock3, CheckCircle2 } from "lucide-react";
import { useT } from "@/i18n/context";
import { sentinelSession, sentinelPractice } from "@/lib/sentinel/sentinel.functions";
import { TITLE, type Question, type Session } from "@/lib/sentinel/types";
import {
  AssessmentShell,
  AssessmentPanel,
} from "@/components/career-discovery/v31/shell/AssessmentShell";
import { Matrix, Options } from "./Figure";
import { SentinelReportView } from "./Report";
type Practice = { question: Question; key: string; explanation: { sv: string; en: string } };
export function SentinelRunner({ attemptId }: { attemptId: string }) {
  const { lang } = useT();
  const sv = lang !== "en";
  const call = useServerFn(sentinelSession);
  const practiceFn = useServerFn(sentinelPractice);
  const [session, setSession] = useState<Session | null>(null);
  const current = useRef<Session | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"info" | "practice" | "start">("info");
  const [practice, setPractice] = useState<Practice[]>([]);
  const [pindex, setPindex] = useState(0);
  const [panswer, setPanswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState<{ questionId: string; optionId: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  useBlocker({ shouldBlockFn: () => !!pending, enableBeforeUnload: () => !!pending });
  const [clock, setClock] = useState({ server: Date.now(), client: Date.now() });
  const [now, setNow] = useState(Date.now());
  const apply = useCallback((s: Session) => {
    if (current.current && s.revision < current.current.revision) return;
    current.current = s;
    setSession(s);
    setClock({ server: Date.parse(s.serverNow), client: Date.now() });
  }, []);
  const refresh = useCallback(async () => {
    try {
      const s = await call({ data: { attemptId, action: "get" } });
      if (!s) {
        setError(
          sv
            ? "Testet är inte tillgängligt för ditt konto."
            : "This assessment is not available to your account.",
        );
        return;
      }
      apply(s);
    } catch {
      setError(sv ? "Kunde inte ansluta. Försök igen." : "Could not connect. Retry.");
    }
  }, [attemptId, call, apply, sv]);
  useEffect(() => {
    void refresh();
    void practiceFn({ data: { attemptId } })
      .then(setPractice)
      .catch(() =>
        setError(
          sv
            ? "Övningarna kunde inte hämtas. Försök igen."
            : "Practice could not be loaded. Retry.",
        ),
      );
  }, [refresh, practiceFn, attemptId, sv]);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => {
      if (!busy && !pending) void refresh();
    }, 15000);
    const resume = () => {
      if (!busy) void refresh();
    };
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
    };
  }, [busy, pending, refresh]);
  const remaining = session?.deadline
    ? Math.max(
        0,
        Math.ceil((Date.parse(session.deadline) - (clock.server + now - clock.client)) / 1000),
      )
    : 0;
  const expiryRequested = useRef(false);
  useEffect(() => {
    if (session?.status === "running" && remaining === 0 && !busy && !expiryRequested.current) {
      expiryRequested.current = true;
      void refresh().finally(() => {
        expiryRequested.current = false;
      });
    }
  }, [remaining, session?.status, busy, refresh]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (pending) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [pending]);
  async function act(action: "start" | "finish") {
    setBusy(true);
    setError("");
    try {
      const s = await call({ data: { attemptId, action } });
      if (s) apply(s);
    } catch {
      setError(
        sv
          ? "Åtgärden kunde inte bekräftas. Försök igen."
          : "The action could not be confirmed. Retry.",
      );
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }
  async function save(answer: { questionId: string; optionId: string }) {
    setPending(answer);
    setBusy(true);
    setError("");
    try {
      const s = await call({
        data: { attemptId, action: "save", ...answer, revision: current.current?.revision ?? 0 },
      });
      if (s) {
        apply(s);
        setPending(null);
      }
    } catch (e) {
      if (String(e).includes("SENTINEL_REVISION_CONFLICT")) {
        await refresh();
        setError(
          sv
            ? "Testet uppdaterades i en annan flik. Kontrollera ditt val och tryck Spara igen."
            : "Another tab updated the attempt. Check your choice and select Save again.",
        );
      } else
        setError(
          sv
            ? "Svaret är inte sparat. Kontrollera anslutningen och försök igen."
            : "The response is not saved. Check your connection and retry.",
        );
    } finally {
      setBusy(false);
    }
  }
  const button =
    "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground disabled:opacity-50";
  const outline = "min-h-11 rounded-lg border px-4 text-sm disabled:opacity-50";
  if (!session)
    return (
      <AssessmentShell deliveryLanguage={lang}>
        <AssessmentPanel>
          <p role={error ? "alert" : "status"}>
            {error || (sv ? "Hämtar test…" : "Loading assessment…")}
          </p>
          {error && (
            <button className={outline} onClick={() => void refresh()}>
              {sv ? "Försök igen" : "Retry"}
            </button>
          )}
        </AssessmentPanel>
      </AssessmentShell>
    );
  if (["completed", "timed_out", "abandoned"].includes(session.status))
    return (
      <AssessmentShell deliveryLanguage={lang}>
        <AssessmentPanel>
          <div className="mb-6 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            <p>{sv ? "Testtillfället är avslutat." : "This attempt is closed."}</p>
          </div>
          <SentinelReportView report={session.report} status={session.status} sv={sv} />
          <Link to="/academy" className="mt-5 inline-block underline">
            {sv ? "Till mina tester" : "Back to my assessments"}
          </Link>
        </AssessmentPanel>
      </AssessmentShell>
    );
  const item = session.questions[index];
  const exercise = practice[pindex];
  return (
    <AssessmentShell deliveryLanguage={lang}>
      <AssessmentPanel>
        <header className="mb-7 flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Shield className="h-4 w-4" />
              CQrityjob · {sv ? "Visuell logik" : "Visual logic"}
            </p>
            <h1 className="mt-2 text-2xl font-semibold">{TITLE[sv ? "sv" : "en"]}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {sv
                ? "Pilotinnehåll – inte psykometriskt validerat · v1"
                : "Pilot content — not psychometrically validated · v1"}
            </p>
          </div>
          {session.status === "running" && (
            <div
              className="shrink-0 rounded-lg border p-3 text-sm tabular-nums"
              role="timer"
              aria-label={sv ? "Tid kvar" : "Time remaining"}
            >
              <Clock3 className="mb-1 h-4 w-4" />
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </div>
          )}
        </header>
        {error && (
          <div role="alert" className="mb-4 rounded-lg border p-3 text-sm">
            {error}
            {pending && (
              <button disabled={busy} className="ml-3 underline" onClick={() => void save(pending)}>
                {sv ? "Spara igen" : "Save again"}
              </button>
            )}
          </div>
        )}
        {session.status === "ready" && phase === "info" && (
          <div className="space-y-5 text-sm leading-relaxed">
            <h2 className="text-xl font-semibold">
              {sv ? "Se mönstret. Hitta nästa figur." : "See the pattern. Find the next figure."}
            </h2>
            <p>
              {sv
                ? "I varje uppgift saknas en figur i en matris. Studera de åtta synliga rutorna och välj ett av sex alternativ. Mönster kan handla om form, antal, placering, vridning, spegling eller fyllning. Ibland gäller flera regler samtidigt."
                : "Each task has a missing figure in a matrix. Study the eight visible cells and choose one of six options. Patterns may involve shape, quantity, position, rotation, reflection or fill. Sometimes several rules apply together."}
            </p>
            <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/30 p-4 text-center">
              <div className="font-semibold">
                20<p className="font-normal">{sv ? "uppgifter" : "questions"}</p>
              </div>
              <div className="font-semibold">
                {session.durationSeconds / 60} min
                <p className="font-normal">{sv ? "testtid" : "test time"}</p>
              </div>
              <div className="font-semibold">
                3<p className="font-normal">{sv ? "övningar" : "practice tasks"}</p>
              </div>
            </div>
            <p>
              {sv
                ? "Instruktioner och övningar är utan tidsgräns. Testtiden börjar först när du väljer Starta test. Du får gå tillbaka och ändra svar. Ett rätt svar ger en poäng; inga minuspoäng eller snabbhetspoäng ges."
                : "Instructions and practice are untimed. Time begins only when you choose Start assessment. You can revisit and change answers. A correct response earns one point; there is no penalty or speed bonus."}
            </p>
            <p>
              {sv
                ? "Svar sparas när servern bekräftar dem. Om anslutningen bryts visas ett osparat svar med möjlighet att försöka igen. Om du laddar om fortsätter samma test och tidsgräns. Vid tidsgränsen räknas de senast serverbekräftade svaren."
                : "Responses are saved when the server confirms them. If the connection fails, an unsaved response is shown with a retry option. Refreshing resumes the same attempt and deadline. At expiry, the last server-confirmed responses are scored."}
            </p>
            <p>
              {sv
                ? "Behöriga personer hos den tilldelande arbetsgivaren kan se resultatet. Arbetsgivaren avgör när din rapport delas. Testet ger separat samtalsunderlag och är inte ett automatiskt anställningsbeslut."
                : "Authorised people at the assigning employer can see the result. The employer decides when to share your report. This test provides separate discussion material and does not make an automated hiring decision."}
            </p>
            <p>
              {sv
                ? "Testet bygger på synliga figurer och är inte anpassat för blinda deltagare. Kontakta arbetsgivaren via din befintliga konversation om du behöver ett alternativt förfarande eller längre tid. Längre tid måste beviljas före start."
                : "This assessment uses visual figures and is not adapted for blind participants. Contact the employer through your existing conversation if you need an alternative process or extended time. Extended time must be authorised before starting."}
            </p>
            <Link to="/integritetspolicy" className="underline">
              {sv ? "Integritet och behandling av uppgifter" : "Privacy and data processing"}
            </Link>
            <div>
              <button
                disabled={!practice.length || busy}
                className={button}
                onClick={() => {
                  setPhase("practice");
                  setError("");
                }}
              >
                {sv ? "Gå till övningarna" : "Go to practice"}
              </button>
            </div>
          </div>
        )}
        {session.status === "ready" && phase === "practice" && exercise && (
          <>
            <p className="mb-4 text-sm">
              {sv ? "Övning" : "Practice"} {pindex + 1} / 3 · {sv ? "Utan tidtagning" : "Untimed"}
            </p>
            <Matrix question={exercise.question} sv={sv} />
            <Options
              question={exercise.question}
              sv={sv}
              selected={panswer}
              onSelect={setPanswer}
              disabled={revealed}
            />
            {revealed && (
              <div className="my-4 rounded-lg bg-muted/30 p-4 text-sm">
                <p className="font-semibold">
                  {panswer === exercise.key
                    ? sv
                      ? "Rätt svar"
                      : "Correct response"
                    : sv
                      ? "Studera förklaringen"
                      : "Study the explanation"}{" "}
                  · {sv ? "Rätt alternativ" : "Correct option"}{" "}
                  {String.fromCharCode(
                    65 + exercise.question.options.findIndex((o) => o.id === exercise.key),
                  )}
                </p>
                <p className="mt-2">{exercise.explanation[sv ? "sv" : "en"]}</p>
              </div>
            )}
            <button
              className={`${button} mt-5`}
              disabled={!panswer}
              onClick={() => {
                if (!revealed) setRevealed(true);
                else if (pindex < 2) {
                  setPindex(pindex + 1);
                  setPanswer("");
                  setRevealed(false);
                } else setPhase("start");
              }}
            >
              {revealed
                ? pindex < 2
                  ? sv
                    ? "Nästa övning"
                    : "Next practice task"
                  : sv
                    ? "Till teststart"
                    : "Continue to start"
                : sv
                  ? "Visa förklaring"
                  : "Show explanation"}
            </button>
          </>
        )}
        {session.status === "ready" && phase === "start" && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">{sv ? "Redo att börja" : "Ready to begin"}</h2>
            <p className="text-sm">
              {sv
                ? `Du har ${session.durationSeconds / 60} minuter för 20 uppgifter. Tiden fortsätter även om du lämnar sidan. Skicka in när du är klar eller låt servern avsluta vid tidsgränsen.`
                : `You have ${session.durationSeconds / 60} minutes for 20 questions. Time continues if you leave this page. Submit when you are ready, or the server will finalise at the deadline.`}
            </p>
            <button disabled={busy} className={button} onClick={() => void act("start")}>
              {busy ? (sv ? "Startar…" : "Starting…") : sv ? "Starta test" : "Start assessment"}
            </button>
          </div>
        )}
        {session.status === "running" && item && (
          <>
            <div className="mb-5">
              <div className="mb-2 flex justify-between text-sm">
                <span>
                  {sv ? "Uppgift" : "Question"} {index + 1} / 20
                </span>
                <span>
                  {Object.keys(session.answers).length} {sv ? "sparade svar" : "saved responses"}
                </span>
              </div>
              <progress
                className="h-1.5 w-full accent-accent"
                max={20}
                value={Object.keys(session.answers).length}
                aria-label={sv ? "Sparade svar" : "Saved responses"}
              />
            </div>
            <Matrix question={item} sv={sv} />
            <Options
              question={item}
              sv={sv}
              selected={
                pending?.questionId === item.id ? pending.optionId : session.answers[item.id]
              }
              disabled={busy}
              onSelect={(id) => void save({ questionId: item.id, optionId: id })}
            />
            <p role="status" className="mt-3 min-h-5 text-xs text-muted-foreground">
              {pending
                ? busy
                  ? sv
                    ? "Sparar…"
                    : "Saving…"
                  : sv
                    ? "Svar ej sparat"
                    : "Response not saved"
                : sv
                  ? "Serverbekräftade svar sparas automatiskt."
                  : "Server-confirmed responses are saved automatically."}
            </p>
            <nav
              className="my-5 flex flex-wrap gap-1.5"
              aria-label={sv ? "Hoppa till uppgift" : "Go to question"}
            >
              {session.questions.map((q, i) => (
                <button
                  key={q.id}
                  disabled={busy || !!pending}
                  className={`h-9 min-w-9 rounded border text-xs ${i === index ? "border-accent bg-accent/15 font-bold" : ""}`}
                  aria-current={i === index ? "step" : undefined}
                  aria-label={`${sv ? "Uppgift" : "Question"} ${i + 1}${session.answers[q.id] ? (sv ? ", besvarad" : ", answered") : ""}`}
                  onClick={() => setIndex(i)}
                >
                  {i + 1}
                  {session.answers[q.id] ? " ·" : ""}
                </button>
              ))}
            </nav>
            <div className="flex flex-wrap justify-between gap-3">
              <button
                className={outline}
                disabled={index === 0 || busy || !!pending}
                onClick={() => setIndex(index - 1)}
              >
                {sv ? "Föregående" : "Previous"}
              </button>
              {index < 19 ? (
                <button
                  className={button}
                  disabled={busy || !!pending}
                  onClick={() => setIndex(index + 1)}
                >
                  {sv ? "Nästa" : "Next"}
                </button>
              ) : (
                <button
                  className={button}
                  disabled={busy || !!pending}
                  onClick={() => setConfirm(true)}
                >
                  {sv ? "Granska och skicka in" : "Review and submit"}
                </button>
              )}
            </div>
            {confirm && (
              <div
                className="mt-5 space-y-3 rounded-xl border p-4"
                role="region"
                aria-label={sv ? "Bekräfta inlämning" : "Confirm submission"}
              >
                <p>
                  {sv
                    ? `${20 - Object.keys(session.answers).length} obesvarade uppgifter. När du skickar in avslutas testet.`
                    : `${20 - Object.keys(session.answers).length} unanswered questions. Submitting closes the attempt.`}
                </p>
                <button
                  className={button}
                  disabled={busy || !!pending}
                  onClick={() => void act("finish")}
                >
                  {sv ? "Skicka in test" : "Submit assessment"}
                </button>
                <button className={`${outline} ml-2`} onClick={() => setConfirm(false)}>
                  {sv ? "Fortsätt testet" : "Continue assessment"}
                </button>
              </div>
            )}
          </>
        )}
      </AssessmentPanel>
    </AssessmentShell>
  );
}
