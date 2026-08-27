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

import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import {
  getMyInterviewDetail,
  reportInterviewFactualError,
  type CandidateInterviewStatus,
} from "@/lib/interview-intelligence/candidate.functions";

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
  const { lang } = useT();

  const detailFn = useServerFn(getMyInterviewDetail);
  const reportFn = useServerFn(reportInterviewFactualError);

  const q = useQuery({
    queryKey: ["my-career", "interview", caseId],
    queryFn: () => detailFn({ data: { caseId } }),
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
      <SiteLayout>
        <Section containerClassName="max-w-3xl">
          <p role="status" className="text-sm text-muted-foreground">
            {L(c("Laddar …", "Loading …"), lang)}
          </p>
        </Section>
      </SiteLayout>
    );
  }

  // A candidate reaching a case that is not theirs, or one the employer has not
  // yet committed to, gets the same answer: this is not available to you. The
  // two are deliberately indistinguishable — a different message for "exists
  // but you may not see it" would confirm the case exists.
  if (q.isError || !q.data) {
    return (
      <SiteLayout>
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
      </SiteLayout>
    );
  }

  const d = q.data;

  return (
    <SiteLayout>
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

          {d.retainUntil && (
            <p className="mt-3 text-sm text-muted-foreground">
              {L(c("Sparas till och med", "Kept until"), lang)}{" "}
              <span className="tabular-nums text-foreground">{d.retainUntil}</span>
            </p>
          )}
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
    </SiteLayout>
  );
}
