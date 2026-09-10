// The candidate's view of an interview about them.
//
// This page exists because the alternative is a person being assessed by a
// process they cannot see. It is deliberately not a mirror of the employer's
// workspace: almost nothing there is theirs to read, and the useful thing to
// tell them is not "here is the evidence" but "here is what is being used, why,
// and what to do if it is wrong".
//
// WHAT IS DELIBERATELY ABSENT, and why each one:
//
//   The eight core questions      Publishing them turns a structured interview
//   and the approved probes       into a memory test and destroys the
//                                 comparability the whole method rests on.
//                                 If governance ever decides candidates should
//                                 see them, that is a pack-level decision, not
//                                 a page-level one.
//   Evidence dimensions and       These are the marking scheme. A candidate who
//   behavioural anchors           has read them answers to the scheme rather
//                                 than about their experience.
//   Interviewer notes, AI         Someone else's working notes and unconfirmed
//   proposals, assessments        machine output. Showing them would also make
//                                 the recruiter write for an audience.
//   Panel disagreement and        The employer deliberating. Not a candidate-
//   decision rationale            facing progress bar.
//
// WHAT IS PRESENT: which of the candidate's own material is being read, where
// each piece came from, whether a recording is in use, how long it is kept, and
// a route to correct a FACT.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import {
  getMyInterviewDetail,
  reportInterviewFactualError,
  type CandidateInterviewStatus,
} from "@/lib/interview-intelligence/candidate.functions";
import { projectCandidateNotice } from "@/lib/interview-intelligence/candidate-notice";
import { getMyInterviewSummary } from "@/lib/interview-intelligence/candidate.functions";
import { CandidateSummaryDocument } from "@/components/employer/interview/CandidateSummaryDocument";

export const Route = createFileRoute("/_authenticated/my-career/interviews/$caseId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "About your interview — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

type Copy = { sv: string; en: string };
const c = (sv: string, en: string): Copy => ({ sv, en });
const L = (x: Copy, lang: string) => (lang === "sv" ? x.sv : x.en);

/**
 * The five TRUST stages, in the candidate's terms.
 *
 * The short form on purpose: what happens and who does it. No methodological
 * basis, no research claims, and none of the employer's prohibitions — those
 * are working material, and a candidate who has read the marking scheme answers
 * to the scheme rather than about their experience.
 *
 * Hardcoded rather than read from scp_trust_stages: those rows carry the
 * internal rationale next to the customer copy, and this route should not be
 * able to reach that table at all.
 */
const TRUST_FOR_CANDIDATE: readonly { letter: string; name: Copy; what: Copy }[] = [
  {
    letter: "T",
    name: c("Målbild", "Target"),
    what: c(
      "Arbetsgivaren har definierat vad rollen kräver, innan någon kandidat bedöms.",
      "The employer defined what the role requires, before any candidate is assessed.",
    ),
  },
  {
    letter: "R",
    name: c("Förberedelse", "Ready"),
    what: c(
      "Ditt underlag gås igenom och en intervjuplan tas fram. En människa godkänner den.",
      "Your material is reviewed and an interview plan is prepared. A person approves it.",
    ),
  },
  {
    letter: "U",
    name: c("Kontakt", "Understand"),
    what: c(
      "Intervjuaren förklarar syftet och ger dig utrymme att svara i din egen takt.",
      "The interviewer explains the purpose and gives you room to answer at your own pace.",
    ),
  },
  {
    letter: "S",
    name: c("Frågorna", "Structure"),
    what: c(
      "Du får samma kärnfrågor i samma ordning som alla andra som söker rollen.",
      "You are asked the same core questions, in the same order, as everyone else applying.",
    ),
  },
  {
    letter: "T",
    name: c("Granskning", "Trace"),
    what: c(
      "Människor går igenom vad som sagts, bedömer och beslutar. Det dokumenteras.",
      "People review what was said, assess it and decide. It is documented.",
    ),
  },
];

const STATUS: Record<CandidateInterviewStatus, Copy> = {
  interview_offered: c(
    "Du har erbjudits en intervju. Arbetsgivaren kontaktar dig om tid och plats.",
    "You have been offered an interview. The employer will contact you about time and place.",
  ),
  interview_in_progress: c("Intervjun pågår.", "The interview is in progress."),
  employer_process_continuing: c(
    "Intervjun är genomförd. Arbetsgivarens process fortsätter.",
    "The interview is complete. The employer's process continues.",
  ),
};

const SOURCE_KIND: Record<string, Copy> = {
  candidate_cv: c("Ditt CV", "Your CV"),
  application_answers: c("Dina ansökningssvar", "Your application answers"),
  passport_disclosure: c(
    "Uppgifter du delat från ditt Security Passport",
    "Details you shared from your Security Passport",
  ),
  transcript: c(
    "Inspelning eller utskrift av intervjun",
    "Recording or transcript of the interview",
  ),
};

function Page() {
  const { caseId } = Route.useParams();
  const { t, lang } = useT();

  const detailFn = useServerFn(getMyInterviewDetail);
  const reportFn = useServerFn(reportInterviewFactualError);

  const q = useQuery({
    queryKey: ["my-career", "interview", caseId],
    queryFn: () => detailFn({ data: { caseId } }),
  });

  // The shared summary, when there is one. Its own query: most interviews will
  // not have one, and a summary that is simply not shared must not make the
  // rest of this page fail to load.
  const summaryFn = useServerFn(getMyInterviewSummary);
  const summary = useQuery({
    queryKey: ["my-career", "interview-summary", caseId],
    queryFn: () => summaryFn({ data: { caseId } }),
    retry: false,
  });

  const [wrong, setWrong] = useState("");
  const [correct, setCorrect] = useState("");
  const report = useMutation({
    mutationFn: () => reportFn({ data: { caseId, whatIsWrong: wrong, whatIsCorrect: correct } }),
    onSuccess: () => {
      setWrong("");
      setCorrect("");
    },
  });

  if (q.isLoading) {
    return (
      <>
        <Section containerClassName="max-w-3xl">
          <p role="status" className="text-sm text-muted-foreground">
            {L(c("Laddar …", "Loading …"), lang)}
          </p>
        </Section>
      </>
    );
  }

  // A candidate reaching a case that is not theirs, or one the employer has not
  // yet committed to, gets the same answer: this is not available to you. The
  // two are deliberately indistinguishable — a different message for "exists
  // but you may not see it" would confirm the case exists.
  if (q.isError || !q.data) {
    return (
      <>
        <Section containerClassName="max-w-3xl">
          <h1 className="text-2xl font-semibold text-foreground">
            {L(c("Intervjun är inte tillgänglig", "This interview is not available"), lang)}
          </h1>
          <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
            {L(
              c(
                "Den här intervjun finns inte, eller så är den inte kopplad till ditt konto.",
                "This interview does not exist, or it is not linked to your account.",
              ),
              lang,
            )}
          </p>
          <Link
            to="/my-career"
            className="mt-4 inline-flex h-10 items-center rounded-md border border-input px-3.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            {L(c("Till Min karriär", "Back to My Career"), lang)}
          </Link>
        </Section>
      </>
    );
  }

  const d = q.data;

  // Which of the eleven things this person is entitled to understand can
  // actually be said. Only `retention` varies per case today; the projection
  // exists so that a twelfth element cannot be added without both surfaces
  // being made to answer for it, and so a guard can assert none of them has
  // quietly stopped being said.
  const notice = projectCandidateNotice({
    employerName: d.employerName,
    roleTitle: d.roleTitle,
    roleRead: d.roleTitle ? "ok" : "absent",
    sourceKinds: d.sources.map((x) => x.kind),
    transcriptInUse: d.transcriptInUse,
    retainUntil: d.retainUntil,
    // The candidate read returns the whole detail object or throws, so a
    // successful query means this field was read. There is no partial answer
    // to distinguish here -- and saying so is better than passing a value that
    // implies the distinction exists.
    retentionRead: "ok",
    correctionPathAvailable: true,
  });
  const retention = notice.retention;

  return (
    <>
      <Section containerClassName="max-w-3xl">
        <Link to="/my-career" className="text-sm text-muted-foreground hover:underline">
          {L(c("← Min karriär", "← My Career"), lang)}
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">
          {L(c("Om din intervju", "About your interview"), lang)}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {[d.roleTitle, d.employerName].filter(Boolean).join(" · ")}
        </p>

        <p className="mt-4 rounded-lg border border-border bg-muted/40 p-4 text-sm text-foreground">
          {L(STATUS[d.status], lang)}
        </p>

        {/* ── What this is ── */}
        <section className="mt-8" aria-labelledby="ci-what">
          <h2 id="ci-what" className="text-lg font-semibold text-foreground">
            {L(c("Vad en strukturerad intervju är", "What a structured interview is"), lang)}
          </h2>
          <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
            {L(
              c(
                "Alla som söker rollen får samma kärnfrågor i samma ordning. Det gör intervjuerna jämförbara och minskar utrymmet för godtycke. Frågorna kommer från ett granskat rollpaket och intervjuaren får inte hitta på egna.",
                "Everyone applying for the role is asked the same core questions in the same order. That makes interviews comparable and leaves less room for arbitrariness. The questions come from a reviewed role pack and the interviewer may not invent their own.",
              ),
              lang,
            )}
          </p>
          <p className="mt-3 max-w-[68ch] text-sm text-muted-foreground">
            {L(
              c(
                "Ett AI-stöd hjälper arbetsgivaren att strukturera underlaget och föreslå var i dina svar det finns konkret information. AI:t poängsätter dig inte, rangordnar dig inte och rekommenderar ingen anställning. Varje uppgift som används måste en namngiven människa hos arbetsgivaren först bekräfta, och det är människor som bedömer och beslutar.",
                "An AI assistant helps the employer structure the material and point to where your answers contain concrete information. It does not score you, rank you or recommend hiring anyone. Every item used must first be confirmed by a named person at the employer, and people do the assessing and deciding.",
              ),
              lang,
            )}
          </p>
          <p className="mt-3 max-w-[68ch] text-sm text-muted-foreground">
            {L(
              c(
                "Frågorna och bedömningsunderlaget visas inte i förväg. Det är för att alla ska bedömas på samma grund — inte för att dölja något för dig.",
                "The questions and the assessment criteria are not shown in advance. That is so everyone is assessed on the same basis — not to keep something from you.",
              ),
              lang,
            )}
          </p>

          {/* The five stages, named and described for the candidate.
           *
           *  Deliberately the SHORT form: what happens and who does it. Not the
           *  stage's methodological basis, not which research claim grounds or
           *  limits it, and not what the employer may or may not conclude —
           *  those are the employer's working material, and a candidate reading
           *  the marking scheme is a candidate answering to the scheme.
           *
           *  Hardcoded rather than read from scp_trust_stages, because the
           *  database rows carry the internal rationale alongside the customer
           *  copy and a candidate route should not be able to reach that table
           *  at all. */}
          <div className="mt-4 rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground">
              {L(c("Så går intervjun till", "How the interview works"), lang)}
            </p>
            <ol className="mt-2 space-y-2 text-sm text-muted-foreground">
              {TRUST_FOR_CANDIDATE.map((step) => (
                <li key={step.letter} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border font-mono text-xs font-semibold text-foreground"
                  >
                    {step.letter}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">{L(step.name, lang)}</span>
                    {" — "}
                    {L(step.what, lang)}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">
              {L(
                c(
                  "Metoden heter CQrity TRUST. Den är framtagen av CQrityjob och bygger på forskning om strukturerade intervjuer och professionellt intervjuarbete. Den är ännu inte vetenskapligt validerad som helhet.",
                  "The method is called CQrity TRUST. It was developed by CQrityjob and draws on research into structured interviews and professional interviewing. It is not yet scientifically validated as a whole.",
                ),
                lang,
              )}
            </p>
          </div>
        </section>

        {/* ── What is being read ── */}
        <section className="mt-8" aria-labelledby="ci-sources">
          <h2 id="ci-sources" className="text-lg font-semibold text-foreground">
            {L(c("Vilket underlag som används", "What material is being used"), lang)}
          </h2>
          {d.sources.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {L(
                c(
                  "Inget av ditt eget underlag behandlas i den här intervjun ännu.",
                  "None of your own material is being processed in this interview yet.",
                ),
                lang,
              )}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {d.sources.map((s, i) => (
                <li key={`${s.kind}-${i}`} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {SOURCE_KIND[s.kind] ? L(SOURCE_KIND[s.kind], lang) : s.label}
                  </p>
                  {s.fromYourPassportDisclosure && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {L(
                        c(
                          "Kommer från en delning du själv gjorde i Security Passport. Du kan när som helst återkalla den.",
                          "Comes from a share you made yourself in Security Passport. You can withdraw it at any time.",
                        ),
                        lang,
                      )}
                    </p>
                  )}
                  {s.erased && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {L(c("Raderat.", "Erased."), lang)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {d.transcriptInUse && (
            <p className="mt-3 rounded-lg border border-amber-600/40 bg-amber-500/5 p-3 text-sm text-foreground">
              {L(
                c(
                  "En inspelning eller utskrift av intervjun behandlas. Arbetsgivaren ska ha informerat dig om detta separat och ha en rättslig grund för det.",
                  "A recording or transcript of the interview is being processed. The employer should have told you about this separately and have a lawful basis for it.",
                ),
                lang,
              )}
            </p>
          )}

          {/* ── HOW LONG THIS IS KEPT ──────────────────────────────────
           *
           *  Always said, in one of three ways, and never by saying nothing.
           *
           *  `retain_until` has exactly one writer -- the transcript-basis
           *  confirmation, which requires a date before a recording may be
           *  processed at all. Every case WITHOUT a transcript therefore has
           *  none, and this region used to render as an absence: no line, no
           *  heading, no gap. A person told which of their material is in
           *  use, who confirms it, what the AI does and does not do, and how
           *  to correct a mistake, and told nothing at all about retention,
           *  reasonably concludes that retention is simply not part of what
           *  this page covers -- rather than that nobody has decided.
           *
           *  No period is invented to fill it, and no promise is made on the
           *  employer's behalf. The honest sentence is that they have not set
           *  one, and the reader is told where to ask. */}
          {retention === "stated" && d.retainUntil ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {L(c("Sparas till och med", "Kept until"), lang)}{" "}
              <span className="tabular-nums text-foreground">{d.retainUntil}</span>
            </p>
          ) : retention === "notConfigured" ? (
            <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">
              {L(
                c(
                  "Arbetsgivaren har inte angett hur länge det här materialet sparas. CQrityjob anger ingen tid åt dem. Du kan fråga arbetsgivaren, och du kan använda formuläret nedan.",
                  "The employer has not stated how long this material is kept. CQrityjob does not set a period on their behalf. You can ask the employer, and you can use the form below.",
                ),
                lang,
              )}
            </p>
          ) : (
            <p
              role="status"
              className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground"
            >
              {L(
                c(
                  "Uppgiften om hur länge materialet sparas kunde inte hämtas just nu. Det betyder inte att ingen tid är angiven — bara att vi inte kunde läsa den.",
                  "How long this material is kept could not be fetched just now. That does not mean no period is set — only that we could not read it.",
                ),
                lang,
              )}
            </p>
          )}
        </section>

        {/* ── The summary, when the employer has shared one ──────────
         *
         *  Most interviews will not have one, and that is not a failure of
         *  anything: sharing is a separate decision the employer makes after
         *  finalising their own report, and nothing releases it
         *  automatically. So an absent summary says exactly that, and does
         *  not imply anybody was supposed to share one.
         *
         *  A FAILED read is kept apart, for the same reason every read in
         *  this codebase is: "your employer has not shared one" is a
         *  statement about the employer, and an outage of ours is in no
         *  position to make it. */}
        <section className="mt-8" aria-labelledby="ci-summary">
          <h2 id="ci-summary" className="text-lg font-semibold text-foreground">
            {L(c("Sammanfattning av intervjun", "Summary of the interview"), lang)}
          </h2>
          {summary.isLoading && (
            <p className="mt-2 text-sm text-muted-foreground">
              {L(c("Hämtar …", "Fetching …"), lang)}
            </p>
          )}
          {summary.isError && (
            <p role="alert" className="mt-2 max-w-[68ch] text-sm text-foreground">
              {L(
                c(
                  "Vi kunde inte hämta någon sammanfattning just nu. Det betyder inte att arbetsgivaren inte har delat någon — bara att vi inte kunde läsa den.",
                  "We could not fetch a summary just now. That does not mean the employer has not shared one — only that we could not read it.",
                ),
                lang,
              )}
            </p>
          )}
          {!summary.isLoading && !summary.isError && !summary.data && (
            <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
              {L(
                c(
                  "Arbetsgivaren har inte delat någon sammanfattning av den här intervjun. Det är ett eget beslut de fattar, och de är inte skyldiga att göra det.",
                  "The employer has not shared a summary of this interview. That is a separate decision they make, and they are not obliged to.",
                ),
                lang,
              )}
            </p>
          )}
          {summary.data && (
            <div className="mt-3 rounded-lg border border-border p-5">
              {/* WHICH VERSION. A corrected summary supersedes the one before
                  it, and a reader who cannot tell which they are looking at
                  cannot tell whether anything changed. */}
              <p className="mb-4 text-xs text-muted-foreground">
                {t("iics.version")
                  .replace("{n}", String(summary.data.versionNumber ?? 1))
                  .replace(
                    "{date}",
                    summary.data.releasedAt
                      ? new Date(summary.data.releasedAt).toLocaleDateString(
                          lang === "en" ? "en-GB" : "sv-SE",
                        )
                      : "—",
                  )}
              </p>
              {/* The SAME component the employer's preview renders. The
                  preview is a guarantee only while the two cannot differ. */}
              <CandidateSummaryDocument
                payload={summary.data.payload}
                lang={lang === "en" ? "en" : "sv"}
              />
            </div>
          )}
        </section>

        {/* ── Who can reach this, and what may be shared with you ────── */}
        <section className="mt-8" aria-labelledby="ci-access">
          <h2 id="ci-access" className="text-lg font-semibold text-foreground">
            {L(c("Vem kan se det här", "Who can see this"), lang)}
          </h2>
          <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
            {L(
              c(
                "Behöriga personer hos arbetsgivaren som arbetar med den här rekryteringen, och du själv på den här sidan. Ingen annan arbetsgivare kan nå det, och andra kandidater kan det inte heller.",
                "Authorised people at the employer who are working on this recruitment, and you, on this page. No other employer can reach it, and neither can other candidates.",
              ),
              lang,
            )}
          </p>
          <p className="mt-3 max-w-[68ch] text-sm text-muted-foreground">
            {L(
              c(
                "Arbetsgivaren kan välja att dela en sammanfattning av intervjun med dig. Den delas inte automatiskt — det är ett eget beslut som en människa hos arbetsgivaren fattar, och den innehåller inte deras interna anteckningar eller bedömningar.",
                "The employer may choose to share a summary of the interview with you. It is not shared automatically — it is a separate decision a person at the employer makes, and it does not contain their internal notes or ratings.",
              ),
              lang,
            )}
          </p>
        </section>

        {/* ── Correcting a fact ── */}
        <section className="mt-8" aria-labelledby="ci-correct">
          <h2 id="ci-correct" className="text-lg font-semibold text-foreground">
            {L(c("Rätta en felaktig uppgift", "Correct a factual error"), lang)}
          </h2>
          <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
            {L(
              c(
                "Om något i ditt underlag är sakligt fel — fel datum, fel arbetsgivare, en utbildning som saknas — kan du säga det här. En människa hos arbetsgivaren läser det.",
                "If something in your material is factually wrong — a wrong date, the wrong employer, a missing qualification — you can say so here. A person at the employer reads it.",
              ),
              lang,
            )}
          </p>
          <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
            {L(
              c(
                "Det här ändrar inte arbetsgivarens bedömning. Om du tycker att bedömningen är fel är det en annan sak, och den tar du direkt med arbetsgivaren.",
                "This does not change the employer's assessment. If you think the assessment itself is wrong, that is a different matter, and one to raise with the employer directly.",
              ),
              lang,
            )}
          </p>

          {report.isSuccess ? (
            <p
              role="status"
              className="mt-4 rounded-lg border border-teal-700/30 bg-teal-700/10 p-3 text-sm"
            >
              {L(
                c(
                  "Tack. Din rättelse har skickats till arbetsgivaren.",
                  "Thank you. Your correction has been sent to the employer.",
                ),
                lang,
              )}
            </p>
          ) : (
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                report.mutate();
              }}
            >
              <div>
                <label htmlFor="ci-wrong" className="text-sm font-medium text-foreground">
                  {L(c("Vad är fel?", "What is wrong?"), lang)}
                </label>
                <textarea
                  id="ci-wrong"
                  required
                  minLength={3}
                  value={wrong}
                  onChange={(e) => setWrong(e.target.value)}
                  className="mt-1 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="ci-correct" className="text-sm font-medium text-foreground">
                  {L(c("Vad är korrekt?", "What is correct?"), lang)}
                </label>
                <textarea
                  id="ci-correct"
                  required
                  minLength={3}
                  value={correct}
                  onChange={(e) => setCorrect(e.target.value)}
                  className="mt-1 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              {report.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {L(c("Rättelsen kunde inte skickas.", "The correction could not be sent."), lang)}
                </p>
              )}
              <button
                type="submit"
                disabled={report.isPending}
                className="inline-flex h-10 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {report.isPending
                  ? L(c("Skickar …", "Sending …"), lang)
                  : L(c("Skicka rättelse", "Send correction"), lang)}
              </button>
            </form>
          )}
        </section>

        {/* ── Privacy ── */}
        <section className="mt-8 border-t border-border pt-6" aria-labelledby="ci-privacy">
          <h2 id="ci-privacy" className="text-lg font-semibold text-foreground">
            {L(c("Dina uppgifter", "Your data"), lang)}
          </h2>
          <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
            {L(
              c(
                "Arbetsgivaren är personuppgiftsansvarig för intervjun. CQrityjob tillhandahåller verktyget. Du kan begära utdrag eller radering, och du styr själv vad du delar från ditt Security Passport.",
                "The employer is the data controller for the interview. CQrityjob provides the tool. You can request a copy or erasure, and you decide what you share from your Security Passport.",
              ),
              lang,
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/passport/privacy"
              className="inline-flex h-10 items-center rounded-md border border-input px-3.5 text-sm font-medium text-foreground hover:bg-accent"
            >
              {L(c("Integritet och delning", "Privacy and sharing"), lang)}
            </Link>
            <Link
              to="/contact"
              className="inline-flex h-10 items-center rounded-md border border-input px-3.5 text-sm font-medium text-foreground hover:bg-accent"
            >
              {L(c("Kontakta oss", "Contact us"), lang)}
            </Link>
          </div>
        </section>
      </Section>
    </>
  );
}
