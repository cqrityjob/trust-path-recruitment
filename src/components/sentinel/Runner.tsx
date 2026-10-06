import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Shield, Clock3, CheckCircle2, ArrowLeft, ShieldAlert } from "lucide-react";
import { useT } from "@/i18n/context";
import { sentinelSession, sentinelPractice } from "@/lib/sentinel/sentinel.functions";
import { TITLE, type Question, type Session } from "@/lib/sentinel/types";
import {
  AssessmentShell,
  AssessmentPanel,
} from "@/components/career-discovery/v31/shell/AssessmentShell";
import { Matrix, Options } from "./Figure";
import { SentinelReportView } from "./Report";
import { acceptsSnapshot, isClosed } from "./session-state";
import { Button } from "@/components/ui/button";
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
  const [practiceStatus, setPracticeStatus] = useState<"loading" | "loaded" | "error">("loading");
  const practiceLoading = useRef(false);
  const [pindex, setPindex] = useState(0);
  const [panswer, setPanswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState<{ questionId: string; optionId: string } | null>(null);
  const pendingResponse = useRef<typeof pending>(null);
  const operation = useRef(false);
  const [failedAction, setFailedAction] = useState<"start" | "finish" | null>(null);
  const [discardedResponse, setDiscardedResponse] = useState(false);
  const completionHeading = useRef<HTMLHeadingElement>(null);
  const [confirm, setConfirm] = useState(false);
  const shouldBlock = () => current.current?.status === "running" && !!pendingResponse.current;
  useBlocker({ shouldBlockFn: shouldBlock, enableBeforeUnload: shouldBlock });
  const [clock, setClock] = useState({ server: Date.now(), client: Date.now() });
  const [now, setNow] = useState(Date.now());
  const apply = useCallback(
    (s: Session) => {
      if (!acceptsSnapshot(current.current, s, attemptId)) return false;
      current.current = s;
      if (isClosed(s)) {
        const answer = pendingResponse.current;
        if (answer && s.answers[answer.questionId] !== answer.optionId) setDiscardedResponse(true);
        pendingResponse.current = null;
        setPending(null);
        setBusy(false);
        setConfirm(false);
        setFailedAction(null);
        setError("");
      }
      setSession(s);
      setClock({ server: Date.parse(s.serverNow), client: Date.now() });
      return true;
    },
    [attemptId],
  );
  const refresh = useCallback(async () => {
    try {
      const s = await call({ data: { attemptId, action: "get" } });
      if (!s) {
        if (isClosed(current.current)) return;
        setError(
          sv
            ? "Testet är inte tillgängligt för ditt konto."
            : "This assessment is not available to your account.",
        );
        return;
      }
      apply(s);
    } catch {
      if (!isClosed(current.current))
        setError(sv ? "Kunde inte ansluta. Försök igen." : "Could not connect. Retry.");
    }
  }, [attemptId, call, apply, sv]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const loadPractice = useCallback(async () => {
    if (practiceLoading.current) return;
    practiceLoading.current = true;
    setPracticeStatus("loading");
    try {
      const exercises = await practiceFn({ data: { attemptId } });
      if (!exercises.length) throw new Error("EMPTY_PRACTICE");
      setPractice(exercises);
      setPracticeStatus("loaded");
    } catch {
      setPracticeStatus("error");
    } finally {
      practiceLoading.current = false;
    }
  }, [attemptId, practiceFn]);
  useEffect(() => {
    if (session?.status === "ready") void loadPractice();
  }, [session?.status, loadPractice]);
  const closed = isClosed(session);
  useEffect(() => {
    if (closed) completionHeading.current?.focus();
  }, [closed]);
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
  async function act(action: "start" | "finish") {
    if (operation.current || isClosed(current.current) || pendingResponse.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setFailedAction(null);
    try {
      const s = await call({ data: { attemptId, action } });
      if (!s) throw new Error("UNCONFIRMED_ACTION");
      apply(s);
      if (action === "finish" && !isClosed(current.current))
        throw new Error("UNCONFIRMED_SUBMISSION");
    } catch {
      if (isClosed(current.current)) return;
      setFailedAction(action);
      setError(
        sv
          ? "Åtgärden kunde inte bekräftas. Försök igen."
          : "The action could not be confirmed. Retry.",
      );
    } finally {
      operation.current = false;
      setBusy(false);
      setConfirm(false);
    }
  }
  async function save(answer: { questionId: string; optionId: string }) {
    if (operation.current || current.current?.status !== "running") return;
    operation.current = true;
    pendingResponse.current = answer;
    setPending(answer);
    setBusy(true);
    setError("");
    try {
      const s = await call({
        data: { attemptId, action: "save", ...answer, revision: current.current?.revision ?? 0 },
      });
      if (!s) throw new Error("UNCONFIRMED_RESPONSE");
      apply(s);
      // Only the latest accepted snapshot can acknowledge this exact choice.
      // A terminal snapshot clears pending separately, without claiming a save.
      if (
        current.current?.status === "running" &&
        current.current.answers[answer.questionId] === answer.optionId
      ) {
        pendingResponse.current = null;
        setPending(null);
      } else if (!isClosed(current.current)) throw new Error("UNCONFIRMED_RESPONSE");
    } catch (e) {
      if (isClosed(current.current)) return;
      if (String(e).includes("SENTINEL_REVISION_CONFLICT")) {
        await refresh();
        if (isClosed(current.current)) return;
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
      operation.current = false;
      setBusy(false);
    }
  }
  const button =
    "min-h-11 h-auto whitespace-normal rounded-md bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90";
  const outline =
    "min-h-11 h-auto whitespace-normal rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground hover:bg-muted";
  if (!session)
    return (
      <AssessmentShell deliveryLanguage={lang}>
        <AssessmentPanel>
          <p role={error ? "alert" : "status"}>
            {error || (sv ? "Hämtar test…" : "Loading assessment…")}
          </p>
          {error && (
            <Button className={outline} onClick={() => void refresh()}>
              {sv ? "Försök igen" : "Retry"}
            </Button>
          )}
        </AssessmentPanel>
      </AssessmentShell>
    );
  if (isClosed(session))
    return (
      <AssessmentShell deliveryLanguage={lang}>
        <AssessmentPanel>
          <section
            aria-labelledby="sentinel-completion-heading"
            className="mx-auto max-w-2xl space-y-6 py-2 sm:py-4"
          >
            <div className="flex flex-col items-start gap-4">
              {session.status === "completed" ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="h-12 w-12 rounded-full bg-accent/10 p-3 text-accent"
                />
              ) : session.status === "timed_out" ? (
                <Clock3
                  aria-hidden="true"
                  className="h-12 w-12 rounded-full bg-muted p-3 text-foreground"
                />
              ) : (
                <ShieldAlert
                  aria-hidden="true"
                  className="h-12 w-12 rounded-full bg-muted p-3 text-foreground"
                />
              )}
              <h1
                id="sentinel-completion-heading"
                ref={completionHeading}
                tabIndex={-1}
                className="text-2xl font-semibold leading-tight text-foreground focus:outline-none sm:text-3xl"
              >
                {session.status === "completed"
                  ? sv
                    ? "Tack! Ditt test är avslutat."
                    : "Thank you! Your assessment is complete."
                  : session.status === "timed_out"
                    ? sv
                      ? "Testtiden är slut."
                      : "Your assessment time has ended."
                    : sv
                      ? "Testet har avbrutits."
                      : "This assessment has been stopped."}
              </h1>
            </div>
            <p className="max-w-prose text-base leading-relaxed">
              {session.status === "completed"
                ? discardedResponse
                  ? sv
                    ? "De svar som servern tog emot har sparats och testet har skickats in till arbetsgivaren. Arbetsgivaren går igenom underlaget och återkommer till dig inom kort med information om nästa steg."
                    : "The responses received by the server have been saved and the assessment has been submitted to the employer. The employer will review your responses and contact you shortly about the next steps."
                  : sv
                    ? "Dina svar har sparats och testet har skickats in till arbetsgivaren. Arbetsgivaren går igenom underlaget och återkommer till dig inom kort med information om nästa steg."
                    : "Your responses have been saved and the assessment has been submitted to the employer. The employer will review your responses and contact you shortly about the next steps."
                : session.status === "timed_out"
                  ? sv
                    ? "Testtiden är slut och testet har avslutats. Endast de svar som servern tog emot före tidsgränsen ligger till grund för resultatet. Osparade svar ingår inte. Arbetsgivaren går igenom underlaget och återkommer med information om nästa steg."
                    : "Your assessment time has ended and the assessment has closed. Your result is based only on responses the server received before the deadline. Unsaved responses are excluded. The employer will review your responses and contact you about the next steps."
                  : sv
                    ? "Det här testtillfället har avbrutits eller är inte längre tillgängligt. Kontakta arbetsgivaren för information om hur du går vidare."
                    : "This assessment has been stopped or is no longer available. Please contact the employer for information about how to proceed."}
            </p>
            {discardedResponse && (
              <p className="text-sm">
                {sv
                  ? "Det osparade svaret har inte skickats in."
                  : "The unsaved response has not been submitted."}
              </p>
            )}
            <Button asChild className={`${button} w-full sm:w-auto`}>
              <Link
                to="/academy"
                className={`${button} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
              >
                <ArrowLeft aria-hidden="true" />
                {sv ? "Till mina tester" : "Back to my assessments"}
              </Link>
            </Button>
          </section>
          <div className="mt-6">
            {session.report ? (
              <SentinelReportView report={session.report} status={session.status} sv={sv} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {sv
                  ? "Arbetsgivaren avgör när resultatet delas med dig."
                  : "The employer decides when to share the result with you."}
              </p>
            )}
          </div>
        </AssessmentPanel>
      </AssessmentShell>
    );
  const item = session.questions[index];
  const exercise = practice[pindex];
  return (
    <AssessmentShell deliveryLanguage={lang}>
      <AssessmentPanel>
        <header className="mb-7 flex flex-col items-start justify-between gap-4 border-b border-border pb-6 sm:flex-row">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Shield className="h-4 w-4" />
              CQrityjob · {sv ? "Visuell logik" : "Visual logic"}
            </p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight">{TITLE[sv ? "sv" : "en"]}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {sv
                ? "Pilotinnehåll – inte psykometriskt validerat · v1"
                : "Pilot content — not psychometrically validated · v1"}
            </p>
          </div>
          {session.status === "running" && (
            <div
              className="flex shrink-0 items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3 font-semibold tabular-nums"
              role="timer"
              aria-label={sv ? "Tid kvar" : "Time remaining"}
            >
              <Clock3 aria-hidden="true" className="h-5 w-5 text-accent" />
              <span className="text-xs font-medium text-muted-foreground">
                {sv ? "Tid kvar" : "Time remaining"}
              </span>
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </div>
          )}
        </header>
        {error && (
          <div role="alert" className="mb-4 rounded-lg border p-3 text-sm">
            {error}
            {pending && (
              <Button disabled={busy} className="ml-3 underline" onClick={() => void save(pending)}>
                {sv ? "Spara igen" : "Save again"}
              </Button>
            )}
            {failedAction && (
              <Button
                disabled={busy}
                className="ml-3 underline"
                onClick={() => void act(failedAction)}
              >
                {failedAction === "finish"
                  ? sv
                    ? "Försök skicka in igen"
                    : "Retry submission"
                  : sv
                    ? "Försök starta igen"
                    : "Retry starting"}
              </Button>
            )}
            {!pending && !failedAction && (
              <Button disabled={busy} className="ml-3 underline" onClick={() => void refresh()}>
                {sv ? "Försök igen" : "Retry"}
              </Button>
            )}
          </div>
        )}
        {session.status === "ready" && practiceStatus !== "loaded" && (
          <div
            className="mb-4 rounded-lg border p-3 text-sm"
            aria-busy={practiceStatus === "loading"}
          >
            <p role={practiceStatus === "error" ? "alert" : "status"}>
              {practiceStatus === "loading"
                ? sv
                  ? "Hämtar övningar…"
                  : "Loading practice…"
                : sv
                  ? "Övningarna kunde inte hämtas. Försök igen."
                  : "Practice could not be loaded. Please try again."}
            </p>
            <Button
              disabled={practiceStatus === "loading"}
              className={`${outline} mt-3`}
              onClick={() => void loadPractice()}
            >
              {sv ? "Hämta övningarna igen" : "Retry loading practice"}
            </Button>
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
            <div className="grid grid-cols-3 gap-3 border-y border-border py-5 text-center">
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
              <Button
                disabled={!practice.length || busy}
                className={button}
                onClick={() => {
                  setPhase("practice");
                  setError("");
                }}
              >
                {sv ? "Gå till övningarna" : "Go to practice"}
              </Button>
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
            <Button
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
            </Button>
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
            <Button disabled={busy} className={button} onClick={() => void act("start")}>
              {busy ? (sv ? "Startar…" : "Starting…") : sv ? "Starta test" : "Start assessment"}
            </Button>
          </div>
        )}
        {session.status === "running" && item && (
          <>
            <div className="mb-5">
              <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
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
            <p
              role="status"
              className="mt-4 min-h-11 rounded-md bg-muted/30 px-3 py-3 text-sm text-muted-foreground"
            >
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
              className="my-5 grid grid-cols-5 gap-2 sm:grid-cols-10"
              aria-label={sv ? "Hoppa till uppgift" : "Go to question"}
            >
              {session.questions.map((q, i) => (
                <Button
                  key={q.id}
                  disabled={busy || !!pending}
                  variant="outline"
                  className={`h-11 min-w-0 px-0 text-xs ${i === index ? "border-accent bg-accent/15 font-bold" : ""}`}
                  aria-current={i === index ? "step" : undefined}
                  aria-label={`${sv ? "Uppgift" : "Question"} ${i + 1}${session.answers[q.id] ? (sv ? ", besvarad" : ", answered") : ""}`}
                  onClick={() => setIndex(i)}
                >
                  {i + 1}
                  {session.answers[q.id] ? " ·" : ""}
                </Button>
              ))}
            </nav>
            <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-5">
              <Button
                className={outline}
                disabled={index === 0 || busy || !!pending}
                onClick={() => setIndex(index - 1)}
              >
                {sv ? "Föregående" : "Previous"}
              </Button>
              {index < 19 ? (
                <Button
                  className={button}
                  disabled={busy || !!pending}
                  onClick={() => setIndex(index + 1)}
                >
                  {sv ? "Nästa" : "Next"}
                </Button>
              ) : (
                <Button
                  className={button}
                  disabled={busy || !!pending}
                  onClick={() => setConfirm(true)}
                >
                  {sv ? "Granska och skicka in" : "Review and submit"}
                </Button>
              )}
            </div>
            {confirm && (
              <div
                className="mt-5 flex flex-wrap gap-3 rounded-md border border-border bg-muted/30 p-4 sm:p-5"
                role="region"
                aria-label={sv ? "Bekräfta inlämning" : "Confirm submission"}
              >
                <p className="w-full text-sm leading-relaxed">
                  {sv
                    ? `${20 - Object.keys(session.answers).length} obesvarade uppgifter. När du skickar in avslutas testet.`
                    : `${20 - Object.keys(session.answers).length} unanswered questions. Submitting closes the attempt.`}
                </p>
                <Button
                  className={button}
                  disabled={busy || !!pending}
                  onClick={() => void act("finish")}
                >
                  {sv ? "Skicka in test" : "Submit assessment"}
                </Button>
                <Button className={outline} onClick={() => setConfirm(false)}>
                  {sv ? "Fortsätt testet" : "Continue assessment"}
                </Button>
              </div>
            )}
          </>
        )}
      </AssessmentPanel>
    </AssessmentShell>
  );
}
