// The AI-assisted CV.
//
// ── THE ORDER OF OPERATIONS IS THE SAFETY MODEL ────────────────────────
//
//   1. READINESS, before anything else and before any provider is
//      contacted. A model cannot supply a missing employment history, and
//      asking it to try is how one gets invented. Not ready means a list of
//      what is missing and a link to fill it in — never a generated
//      document with a warning next to it.
//
//   2. THE FACTS, shown BEFORE generation. A person is entitled to see the
//      input to a document that will carry their name.
//
//   3. PURPOSE, chosen deliberately. A general CV never carries the pasted
//      advert, even if one was typed and then the choice was changed.
//
//   4. GENERATION, server-side. The credential lives in the server
//      environment and the adapter refuses to be constructed in a browser.
//
//   5. REVIEW. Every generated line is on screen, marked as drafted, before
//      anything leaves this page. Nothing is sent anywhere automatically.
//
// ── WHAT HAPPENS WHEN THE ENGINE FAILS ─────────────────────────────────
//
// The factual CV appears. It is not an error state — it is the CV, and it
// is complete: name, headline, employment, education, credentials, skills,
// languages, with the verification marks the Passport granted. The banner
// says plainly which of the four things happened (no engine configured, the
// engine declined, the answer was the wrong shape, or the answer was
// REJECTED for fabrication) rather than showing one generic failure, because
// a rejection is a safety control working and should not look like an
// outage.
//
// ── EXPORT ─────────────────────────────────────────────────────────────
//
// The browser's own print-to-PDF, using the @page A4 rules the report
// template already established. No dependency, no server round trip, and
// nothing is stored: an unsaved CV is private by construction, which is the
// default the requirement asks for. Saved CV documents need a table, and
// this repository's schema-first release contract ships the migration in one
// release and the code that reads it in the next.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Printer, ShieldAlert } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Container } from "@/components/site/Container";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { CvDocumentView } from "@/components/professional-identity/CvDocumentView";
import { c, L, Lf, type Copy, type Lang } from "@/components/professional-identity/copy";
import { useT } from "@/i18n/context";
import { generateMyCv, prepareMyCv } from "@/lib/professional-identity/cv/cv.functions";
import type { CvGenerationStatus } from "@/lib/professional-identity/cv/generation";
import type { CvRequiredField } from "@/lib/professional-identity/cv/readiness";

export const Route = createFileRoute("/_authenticated/my-career/cv")({
  ssr: false,
  head: () => ({
    meta: [{ title: "CV — CQrityjob" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: CvPage,
});

const MAX_JOB_CHARS = 12_000;

const COPY = {
  back: c("Min karriär", "My Career"),
  title: c("Ditt CV", "Your CV"),
  lede: c(
    "Byggt av det du redan har registrerat i CQrityjob. Arbetsgivare, roller, datum och intyg hämtas från dina egna uppgifter — AI:n formulerar, den hittar inte på.",
    "Built from what you have already recorded in CQrityjob. Employers, roles, dates and credentials come from your own entries — the AI phrases, it does not invent.",
  ),
  loading: c("Hämtar dina uppgifter…", "Loading your information…"),
  loadFailed: c(
    "Dina uppgifter kunde inte hämtas just nu. Ladda om sidan för att försöka igen.",
    "Your information could not be loaded right now. Reload the page to try again.",
  ),

  notReadyTitle: c(
    "Din profil behöver lite mer information innan vi kan skapa ett användbart CV.",
    "Your profile needs a little more information before we can create a useful CV.",
  ),
  completeProfile: c("Komplettera profilen", "Complete profile"),

  step1: c("1. Granska underlaget", "1. Review the information"),
  step1Lede: c(
    "Detta är allt som får användas. Något som saknas här kommer inte att stå i ditt CV.",
    "This is everything that may be used. Anything missing here will not appear in your CV.",
  ),
  employment: c("Anställningar", "Employment"),
  education: c("Utbildning", "Education"),
  credentials: c("Intyg", "Credentials"),
  skills: c("Färdigheter", "Skills"),
  languages: c("Språk", "Languages"),
  none: c("Inga", "None"),

  step2: c("2. Välj syfte", "2. Choose a purpose"),
  purposeGeneral: c("Allmänt CV", "General CV"),
  purposeGeneralHelp: c(
    "Kronologiskt, utan anpassning mot en särskild roll.",
    "Chronological, with no tailoring towards a particular role.",
  ),
  purposeTargeted: c("Anpassa mot en roll", "Tailor to a role"),
  purposeTargetedHelp: c(
    "Annonsen styr ordning och betoning. Den kan aldrig lägga till en kvalifikation du inte har.",
    "The advert decides order and emphasis. It can never add a qualification you do not have.",
  ),

  step3: c("3. Klistra in jobbannonsen", "3. Paste the job advert"),
  step3Help: c(
    "Valfritt. Texten behandlas som material, aldrig som instruktioner till systemet.",
    "Optional. The text is treated as material, never as instructions to the system.",
  ),

  includeInsight: c(
    "Inkludera min karriärutforskning",
    "Include my Career Discovery result",
  ),
  includeInsightHelp: c(
    "Visas som en karriärriktning, aldrig som en kompetens eller kvalifikation.",
    "Shown as a career direction, never as a competency or a qualification.",
  ),

  generate: c("Skapa CV", "Create CV"),
  generating: c("Skapar…", "Creating…"),
  regenerate: c("Skapa på nytt", "Create again"),
  print: c("Skriv ut / spara som PDF", "Print / save as PDF"),

  step5: c("Granska och använd", "Review and use"),
  reviewNote: c(
    "Läs igenom innan du använder det. Du äger det som står här.",
    "Read it through before you use it. You own what it says.",
  ),
  omitted: c(
    "Följande anställningar togs inte med i utkastet: {0}. Skapa ett allmänt CV om du vill ha med alla.",
    "The following employment was not included in the draft: {0}. Create a general CV if you want all of it.",
  ),
  quarantined: c(
    "{0} stycke i annonsen innehöll instruktioner till systemet i stället för information om rollen, och skickades inte vidare.",
    "{0} paragraph in the advert contained instructions to the system rather than information about the role, and was not passed on.",
  ),
} as const;

const MISSING_FIELD: Readonly<Record<CvRequiredField, Copy>> = {
  displayName: c("Ditt namn", "Your name"),
  professionalIdentity: c(
    "En yrkestitel eller ett angivet yrke",
    "A professional title or a stated profession",
  ),
  location: c("Land", "Country"),
  professionalHistory: c(
    "Minst en anställning eller utbildning i Säkerhetspasset",
    "At least one employment or education in the Security Passport",
  ),
};

/** Why there is no assisted draft. Four distinct answers, because a
 *  rejection is a control working and must not read like an outage. */
const STATUS_NOTE: Readonly<Record<CvGenerationStatus, Copy>> = {
  succeeded: c("", ""),
  abstained: c(
    "AI-stödet avstod från att skriva ett utkast. Ditt CV nedan är byggt direkt av dina uppgifter.",
    "The AI assistant declined to draft. Your CV below is built directly from your own information.",
  ),
  schema_invalid: c(
    "AI-stödets svar gick inte att använda. Ditt CV nedan är byggt direkt av dina uppgifter.",
    "The AI assistant's answer could not be used. Your CV below is built directly from your own information.",
  ),
  fabrication_rejected: c(
    "Utkastet innehöll uppgifter som inte finns i dina egna registrerade uppgifter, och kasserades i sin helhet. Det skrivs aldrig om för att godkännas. Ditt CV nedan är byggt direkt av dina uppgifter.",
    "The draft contained information that is not in your own recorded entries, and was discarded in full. It is never rewritten until it passes. Your CV below is built directly from your own information.",
  ),
  provider_unavailable: c(
    "Ingen AI-motor är konfigurerad i den här miljön. Ditt CV nedan är byggt direkt av dina uppgifter — det är komplett och går att använda.",
    "No AI engine is configured in this environment. Your CV below is built directly from your own information — it is complete and usable.",
  ),
  provider_error: c(
    "AI-stödet gick inte att nå. Ditt CV nedan är byggt direkt av dina uppgifter.",
    "The AI assistant could not be reached. Your CV below is built directly from your own information.",
  ),
};

function CvPage() {
  const { lang } = useT();
  const l = lang as Lang;

  const [purpose, setPurpose] = useState<"general" | "targeted">("general");
  const [jobText, setJobText] = useState("");
  const [includeInsight, setIncludeInsight] = useState(false);

  const prepare = useServerFn(prepareMyCv);
  const preparation = useQuery({
    queryKey: ["cv", "prepare"],
    queryFn: () => prepare(),
    staleTime: 60_000,
  });

  const generate = useServerFn(generateMyCv);
  const run = useMutation({
    mutationFn: () =>
      generate({
        data: {
          purpose,
          targetJobText: purpose === "targeted" && jobText.trim() ? jobText.trim() : null,
          includeCareerInsight: includeInsight,
          locale: l,
        },
      }),
  });

  const bundle = preparation.data?.bundle;
  const readiness = preparation.data?.readiness;
  const outcome = run.data;
  // The draft when there is one, otherwise the factual document — which is
  // itself a complete CV, not a placeholder.
  const shown = outcome?.document ?? null;

  return (
    <SiteLayout>
      <Container className="py-10 md:py-14">
        <Link
          to="/my-career"
          className="no-print inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {L(COPY.back, l)}
        </Link>

        <h1
          className="no-print mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {L(COPY.title, l)}
        </h1>
        <p className="no-print mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {L(COPY.lede, l)}
        </p>

        {preparation.isPending && (
          <p className="mt-8 text-sm text-muted-foreground">{L(COPY.loading, l)}</p>
        )}
        {preparation.isError && (
          <p role="alert" className="mt-8 text-sm text-destructive">
            {L(COPY.loadFailed, l)}
          </p>
        )}

        {/* ── Not ready ──────────────────────────────────────────────── */}
        {readiness && readiness.state === "needs_information" && (
          <div className="no-print mt-8 max-w-2xl rounded-xl border border-border bg-card p-6">
            <p className="text-sm font-medium text-foreground">{L(COPY.notReadyTitle, l)}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {readiness.missingFields.map((field) => (
                <li key={field}>{L(MISSING_FIELD[field], l)}</li>
              ))}
            </ul>
            <Link
              to="/my-career/profile"
              className="mt-5 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[color:var(--primary-hover)]"
            >
              {L(COPY.completeProfile, l)}
            </Link>
          </div>
        )}

        {/* ── Ready ──────────────────────────────────────────────────── */}
        {bundle && readiness?.state === "ready" && (
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
            {/* Steps 1–4 */}
            <div className="no-print space-y-6">
              <section>
                <h2 className="text-sm font-semibold text-foreground">{L(COPY.step1, l)}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{L(COPY.step1Lede, l)}</p>
                <dl className="mt-3 space-y-1.5 rounded-lg border border-border bg-card p-4 text-sm">
                  {(
                    [
                      [COPY.employment, bundle.employment.length],
                      [COPY.education, bundle.education.length],
                      [COPY.credentials, bundle.credentials.length],
                      [COPY.skills, bundle.skills.length],
                      [COPY.languages, bundle.languages.length],
                    ] as const
                  ).map(([labelCopy, count]) => (
                    <div key={labelCopy.en} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{L(labelCopy, l)}</dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {count === 0 ? L(COPY.none, l) : count}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section>
                <h2 className="text-sm font-semibold text-foreground">{L(COPY.step2, l)}</h2>
                <div className="mt-3 space-y-2">
                  {(
                    [
                      ["general", COPY.purposeGeneral, COPY.purposeGeneralHelp],
                      ["targeted", COPY.purposeTargeted, COPY.purposeTargetedHelp],
                    ] as const
                  ).map(([value, title, help]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer gap-2.5 rounded-lg border border-border bg-card p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-secondary/50"
                    >
                      <input
                        type="radio"
                        name="cv-purpose"
                        value={value}
                        checked={purpose === value}
                        onChange={() => setPurpose(value)}
                        className="mt-0.5 h-4 w-4 accent-[color:var(--accent)]"
                      />
                      <span>
                        <span className="block font-medium text-foreground">{L(title, l)}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {L(help, l)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              {purpose === "targeted" && (
                <section>
                  <label htmlFor="cv-job" className="text-sm font-semibold text-foreground">
                    {L(COPY.step3, l)}
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">{L(COPY.step3Help, l)}</p>
                  <textarea
                    id="cv-job"
                    rows={7}
                    maxLength={MAX_JOB_CHARS}
                    value={jobText}
                    onChange={(e) => setJobText(e.target.value)}
                    className="mt-2 block w-full resize-y rounded-md border border-input bg-background p-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                </section>
              )}

              {/* Offered only when there IS a result to include. A checkbox
                  for something that does not exist is a control that does
                  nothing. */}
              {preparation.data?.hasCareerInsight && (
                <label className="flex cursor-pointer gap-2.5 rounded-lg border border-border bg-card p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={includeInsight}
                    onChange={(e) => setIncludeInsight(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[color:var(--accent)]"
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      {L(COPY.includeInsight, l)}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {L(COPY.includeInsightHelp, l)}
                    </span>
                  </span>
                </label>
              )}

              <PrimaryButton
                type="button"
                disabled={run.isPending}
                onClick={() => run.mutate()}
                className="w-full justify-center gap-2"
              >
                {run.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {run.isPending
                  ? L(COPY.generating, l)
                  : L(shown ? COPY.regenerate : COPY.generate, l)}
              </PrimaryButton>
            </div>

            {/* Steps 5–6 */}
            <div>
              {!shown && !run.isPending && (
                <p className="no-print text-sm text-muted-foreground">{L(COPY.step1Lede, l)}</p>
              )}

              {outcome && outcome.status !== "succeeded" && outcome.status !== "not_ready" && (
                <div
                  role="status"
                  className="no-print mb-5 flex gap-2.5 rounded-lg border border-border bg-secondary/50 p-4"
                >
                  {outcome.status === "fabrication_rejected" ? (
                    <ShieldAlert
                      className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gold)]"
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <p className="text-sm leading-relaxed text-foreground">
                    {L(STATUS_NOTE[outcome.status], l)}
                  </p>
                </div>
              )}

              {outcome && outcome.quarantinedPassages.length > 0 && (
                <p className="no-print mb-5 rounded-lg border border-border bg-secondary/50 p-4 text-sm text-foreground">
                  {Lf(COPY.quarantined, l, outcome.quarantinedPassages.length)}
                </p>
              )}

              {shown && shown.omittedEmployment.length > 0 && (
                <p className="no-print mb-5 rounded-lg border border-border bg-secondary/50 p-4 text-sm text-foreground">
                  {Lf(
                    COPY.omitted,
                    l,
                    shown.omittedEmployment.map((e) => e.employerName).join(", "),
                  )}
                </p>
              )}

              {shown && (
                <>
                  <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">{L(COPY.step5, l)}</h2>
                      <p className="text-xs text-muted-foreground">{L(COPY.reviewNote, l)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-secondary"
                    >
                      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                      {L(COPY.print, l)}
                    </button>
                  </div>
                  <CvDocumentView document={shown} />
                </>
              )}
            </div>
          </div>
        )}
      </Container>
    </SiteLayout>
  );
}
