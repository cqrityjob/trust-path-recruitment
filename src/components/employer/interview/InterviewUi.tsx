// Interview Intelligence — the employer-facing visual vocabulary.
//
// The UX blueprint gives every signal a governed meaning:
//
//   Steel blue    hierarchy and work state
//   Evidence teal CONFIRMED — something a human has stood behind
//   Amber         unresolved work waiting on a person
//   Red           a governance error or a serious process risk, and nothing else
//
// Two rules run through all of it:
//
//   1. Colour never carries meaning alone. Every state renders as words.
//   2. There is no red/green pair anywhere, because a green tick next to a
//      candidate's name is a verdict — and this product does not render
//      verdicts. Confirmed evidence is teal, and it describes the EVIDENCE,
//      not the person.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "work" | "confirmed" | "attention" | "governance" | "ai";

const TONE: Record<Tone, string> = {
  neutral: "border-border bg-muted/50 text-muted-foreground",
  work: "border-sky-700/30 bg-sky-700/10 text-sky-900 dark:text-sky-200",
  confirmed: "border-teal-700/30 bg-teal-700/10 text-teal-900 dark:text-teal-200",
  attention: "border-amber-600/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  governance: "border-destructive/40 bg-destructive/10 text-destructive",
  // AI output gets its own restrained tone so a reader can tell at a glance
  // what a machine proposed and what a person confirmed.
  ai: "border-violet-700/30 bg-violet-700/10 text-violet-900 dark:text-violet-200",
};

export function Chip({
  tone = "neutral",
  children,
  srPrefix,
}: {
  tone?: Tone;
  children: ReactNode;
  srPrefix?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE[tone],
      )}
    >
      {srPrefix && <span className="sr-only">{srPrefix}: </span>}
      {children}
    </span>
  );
}

export function Panel({
  tone = "neutral",
  title,
  children,
  role,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div role={role} className={cn("rounded-lg border p-4 text-sm", TONE[tone])}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1.5 space-y-1 leading-relaxed">{children}</div>}
    </div>
  );
}

/**
 * Every async state this feature can be in, in one place, so no screen can
 * ship without one.
 *
 * "aiUnavailable" and "aiInvalid" are separate states on purpose: one means the
 * engine could not be reached, the other means it returned something the
 * product refused. A person needs to be told which, because only one of them
 * is worth retrying.
 */
export function State({
  kind,
  message,
  children,
}: {
  kind:
    | "loading"
    | "empty"
    | "error"
    | "denied"
    | "aiRunning"
    | "aiUnavailable"
    | "aiInvalid"
    | "aiAbstained";
  message?: string;
  children?: ReactNode;
}) {
  if (kind === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Laddar …
      </p>
    );
  }
  if (kind === "aiRunning") {
    return (
      <Panel tone="ai" role="status" title="AI-stödet arbetar">
        <p>Underlaget struktureras. Inget publiceras utan att du bekräftar det.</p>
      </Panel>
    );
  }
  if (kind === "aiUnavailable") {
    return (
      <Panel tone="attention" role="alert" title="AI-stödet är inte tillgängligt">
        <p>
          {message ??
            "Du kan fortsätta manuellt. Kärnfrågorna, följdfrågorna och ankarna kommer från det styrda rollpaketet och fungerar utan AI."}
        </p>
      </Panel>
    );
  }
  if (kind === "aiInvalid") {
    return (
      <Panel tone="governance" role="alert" title="AI-svaret avvisades">
        <p>
          {message ??
            "Svaret bröt mot en produktregel eller saknade källhänvisning och har satts i karantän. Ingenting av det har sparats som evidens."}
        </p>
      </Panel>
    );
  }
  if (kind === "aiAbstained") {
    return (
      <Panel tone="attention" role="status" title="AI-stödet avstod">
        <p>
          {message ??
            "Underlaget räcker inte för ett svar. Det säger något om materialet, inte om kandidaten."}
        </p>
      </Panel>
    );
  }
  if (kind === "denied") {
    return (
      <Panel tone="governance" role="alert" title="Åtkomst saknas">
        <p>Du saknar behörighet till detta intervjuunderlag, eller så finns det inte.</p>
      </Panel>
    );
  }
  if (kind === "error") {
    return (
      <Panel tone="governance" role="alert" title="Något gick fel">
        <p>{message ?? "Innehållet kunde inte hämtas."}</p>
      </Panel>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
      {children ?? "Inget att visa ännu."}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Utkast",
  sources_ready: "Underlag klart",
  prep_generated: "Förberedelse att godkänna",
  prep_approved: "Godkänd intervjuplan",
  interview_in_progress: "Intervju pågår",
  interview_complete: "Intervju genomförd",
  evidence_review: "Evidensgranskning",
  assessed: "Bedömd",
  reported: "Rapport klar",
  cancelled: "Avbruten",
};

const STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  sources_ready: "work",
  prep_generated: "attention",
  prep_approved: "work",
  interview_in_progress: "work",
  interview_complete: "work",
  evidence_review: "attention",
  assessed: "work",
  reported: "confirmed",
  cancelled: "governance",
};

export function CaseStatusChip({ status }: { status: string }) {
  return (
    <Chip tone={STATUS_TONE[status] ?? "neutral"} srPrefix="Status">
      {STATUS_LABEL[status] ?? status}
    </Chip>
  );
}

/**
 * The scientific-status label, kept visually apart from workflow state. A pack
 * can be perfectly usable and still be an unvalidated hypothesis, and a reader
 * must never have to infer one from the other.
 */
export function ValidationChip({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <Chip tone={label === "pilot_hypothesis" ? "attention" : "confirmed"} srPrefix="Evidensstatus">
      {label === "pilot_hypothesis" ? "Pilothypotes" : "Innehållsvaliderad"}
    </Chip>
  );
}

/**
 * Database enum values, rendered as Swedish.
 *
 * These were reaching the screen raw — a recruiter preparing an interview saw
 * a chip reading "job_description" and another reading
 * "self_evaluation_question". The product should read like an interview
 * workspace, and an internal identifier on the page says the opposite: that the
 * customer is looking at a database.
 *
 * Unknown values fall through to the raw string rather than to an empty chip,
 * so a value added in a migration before it is added here is visible and ugly
 * rather than invisible.
 */
export const SOURCE_KIND_LABEL: Record<string, string> = {
  job_description: "Annons",
  employer_requirements: "Kravprofil",
  candidate_cv: "CV",
  application_answers: "Ansökningssvar",
  interviewer_notes: "Intervjuanteckningar",
  transcript: "Utskrift",
  passport_disclosure: "Passport-delning",
};

export const PURPOSE_LABEL: Record<string, string> = {
  recruitment_interview: "rekryteringsintervju",
};

export const PRACTICE_KIND_LABEL: Record<string, string> = {
  checklist_item: "Att kontrollera",
  opening_script: "Introduktion",
  engagement_guidance: "Bemötande",
  listening_prompt: "Lyssna efter",
  probing_guidance: "Följdfrågor",
  closure_step: "Avslut",
  self_evaluation_question: "Fråga till dig själv",
  warning: "Varning",
};

/** Look up a label, falling back to the raw value rather than to nothing. */
export function uiLabel(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

export const PEACE_LABEL: Record<string, string> = {
  planning: "Planering",
  engage_explain: "Engagera och förklara",
  account: "Redogörelse",
  closure: "Avslut",
  evaluation: "Utvärdering",
};

/**
 * The level-0 rule, rendered once and reused, because it is the single easiest
 * thing in this product to get wrong on screen.
 */
export function LevelZeroNote() {
  return (
    <p className="text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200">
      Nivå 0 betyder otillräcklig evidens — inte låg kompetens, inte oärlighet. Den ingår aldrig i
      en sammanvägning och utlöser inget avslag.
    </p>
  );
}

/**
 * Turn a database error into something a recruiter can act on.
 *
 * The guards in this domain raise deliberately specific messages, and they are
 * written for whoever is reading the SQL: "SCP_IV_PANEL_INCOMPLETE: you have
 * assessed 0 of 8 questions...". Useful in a log, wrong on a Swedish screen —
 * the same defect the report blockers had, where a transition guard's raw
 * output reached the user.
 *
 * The mapping is by CODE, not by matching prose, so a reworded guard keeps its
 * translation. Anything unrecognised falls through to the raw message rather
 * than to a generic apology: an unhelpful specific error beats a helpful-
 * sounding vague one, and it makes the gap visible enough to fix.
 */
const ERROR_SV: Record<string, string> = {
  SCP_IV_PANEL_INCOMPLETE:
    "Du har inte bedömt alla kärnfrågor ännu. Lämna in när din egen bedömning är komplett — att se de andras medan du fortfarande har frågor kvar är precis det som ordningen ska förhindra.",
  SCP_IV_PANEL_REVEAL_TOO_EARLY:
    "Alla bedömare har inte lämnat in ännu. Att öppna nu skulle låta någon bedöma efter att ha läst de andra.",
  SCP_IV_PANEL_NOT_A_MEMBER: "Du ingår inte i den här panelen.",
  SCP_IV_PANEL_TOO_SMALL:
    "En panel behöver minst två bedömare. En ensam bedömare gör en vanlig bedömning.",
  SCP_IV_PANEL_MEMBER_NOT_EMPLOYER: "Alla bedömare måste tillhöra er organisation.",
  SCP_IV_PANEL_CONCLUSION_REQUIRED:
    "Skriv vad panelen kom fram till. Det finns ingen beräknad slutsats — varken medelvärde eller omröstning.",
  SCP_IV_PANEL_NOT_REVEALED: "Panelen avslutas efter att bedömningarna har öppnats, inte före.",
  SCP_IV_NOT_CASE_MEMBER: "Du saknar behörighet till den här intervjun.",
  SCP_IV_ILLEGAL_TRANSITION: "Det steget går inte att ta härifrån. Gå igenom stegen i ordning.",
  SCP_IV_ASSESSMENT_EDITED_IN_PLACE:
    "En registrerad bedömning ändras genom att ersättas, så att originalet finns kvar.",
  SCP_IV_PACK_NOT_USABLE:
    "Det här rollpaketet är inte tillgängligt för er just nu. Välj ett annat paket eller kontakta plattformen.",
  SCP_IV_EMPLOYER_NOT_ACTIVE:
    "Ert företagskonto är inte aktivt, så nya intervjuer kan inte startas. Kontakta plattformen.",
};

export function interviewErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");

  // A dropped connection surfaces as the browser's own "Failed to fetch",
  // which tells a recruiter nothing and looks like the product broke. It is
  // also the case where saying what happened matters most: the save did not
  // happen, nothing was half-written, and trying again is the right move.
  if (/failed to fetch|networkerror|load failed|err_network|fetch failed/i.test(raw)) {
    return "Ingen kontakt med servern. Ingenting sparades — det du skrivit står kvar, så du kan försöka igen.";
  }

  const code = /\b(SCP_[A-Z0-9_]+)\b/.exec(raw)?.[1];
  if (code && ERROR_SV[code]) return ERROR_SV[code];
  // Strip the code prefix even when there is no translation: the sentence after
  // it is usually readable, and the identifier never is.
  return raw.replace(/^SCP_[A-Z0-9_]+:\s*/, "");
}

/**
 * How confident the knowledge graph is, and — more importantly — WHAT KIND of
 * confidence it is.
 *
 * The graph used one word, `verified`, for two unrelated things: an edge that
 * restates a foreign key, and an edge that rests on a research finding. 228 of
 * 271 edges were the first kind, so any screen reporting "verified: 228" would
 * have invited precisely the conclusion the research registry exists to
 * prevent — that this product rests on 228 confirmed empirical results. It
 * rests on three sources somebody has read.
 *
 * These labels are deliberately long. A one-word chip is what created the
 * problem.
 */
export const ASSURANCE_LABEL: Record<string, string> = {
  structurally_derived: "Strukturellt härledd — inte ett forskningsresultat",
  source_read: "Källan är läst",
  source_verified: "Källan är oberoende bekräftad",
  expert_reviewed: "Granskad av sakkunnig",
  provisional: "Preliminär — påstådd, inte fastställd",
  hypothesis: "Hypotes",
  pending_source_verification: "Källan är inte läst",
  superseded: "Ersatt",
};

/**
 * The levels that represent an actual claim about the world, as opposed to a
 * fact about how this product is built. Only these may ever be summarised as
 * research.
 */
export const EMPIRICAL_ASSURANCE: readonly string[] = [
  "source_read",
  "source_verified",
  "expert_reviewed",
];

export function AssuranceChip({ assurance }: { assurance: string }) {
  const empirical = EMPIRICAL_ASSURANCE.includes(assurance);
  return (
    <Chip tone={empirical ? "confirmed" : "neutral"} srPrefix="Säkerhetsnivå">
      {ASSURANCE_LABEL[assurance] ?? assurance}
    </Chip>
  );
}

/**
 * Which engine produced this, said plainly.
 *
 * The four states are distinguished because they mean genuinely different
 * things to the person reading the output, and the difference is invisible
 * otherwise — the deterministic engine produces well-formed, plausible Swedish
 * that looks exactly like a model's. A recruiter who is not told cannot tell.
 *
 * Deliberately NOT colour-only: each carries its own words, and the synthetic
 * case is the one that gets the attention tone, because it is the one where
 * the output describes a rule rather than a reading of the candidate's
 * material.
 */
export function ProviderModeChip({ mode }: { mode: string }) {
  if (mode === "synthetic") {
    return (
      <Chip tone="attention" srPrefix="AI-läge">
        Simulerat AI-stöd (testmotor)
      </Chip>
    );
  }
  if (mode === "development_model") {
    return (
      <Chip tone="ai" srPrefix="AI-läge">
        Språkmodell — utvecklingsmiljö
      </Chip>
    );
  }
  if (mode === "production_model") {
    return (
      <Chip tone="ai" srPrefix="AI-läge">
        Språkmodell
      </Chip>
    );
  }
  return (
    <Chip tone="neutral" srPrefix="AI-läge">
      AI-stöd ej tillgängligt
    </Chip>
  );
}

/**
 * The longer form, for the top of a document a recruiter may act on.
 *
 * A one-word chip is enough to tell two runs apart; it is not enough to stop
 * someone treating rule-based output as a model's judgement, which is why the
 * synthetic case says what it is in a full sentence.
 */
export function ProviderModeNote({ mode }: { mode: string }) {
  if (mode === "synthetic") {
    return (
      <Panel tone="attention" role="status" title="Detta underlag kommer från en testmotor">
        <p>
          Innehållet är genererat av en regelbaserad testmotor, inte av en språkmodell. Det visar
          att flödet fungerar och säger ingenting om hur en språkmodell skulle läsa materialet.
          Använd det inte som beslutsunderlag om en kandidat.
        </p>
      </Panel>
    );
  }
  return null;
}

/**
 * Source material the engine was not allowed to read.
 *
 * Shown, never merely logged. A paragraph gets withheld because it was
 * addressed to the system rather than describing the candidate — someone tried
 * to steer the assessment — and that is a fact about the application that a
 * recruiter is entitled to know and to judge for themselves. Withholding it
 * silently would leave them reading a summary built from part of a document,
 * believing it was built from all of it.
 *
 * The excerpt is shown so the decision is reviewable. It is deliberately not
 * presented as a finding about the candidate: a CV can be tampered with by
 * someone other than its subject, and the product does not know which happened.
 */
export function WithheldPanel({
  withheld,
}: {
  withheld: readonly {
    readonly passageId: string;
    readonly reason: string;
    readonly excerpt: string;
  }[];
}) {
  if (withheld.length === 0) return null;
  return (
    <Panel
      tone="attention"
      role="status"
      title={
        withheld.length === 1
          ? "Ett stycke undanhölls AI-stödet"
          : `${withheld.length} stycken undanhölls AI-stödet`
      }
    >
      <p>
        Texten nedan var riktad till systemet i stället för att beskriva kandidaten, och skickades
        därför aldrig vidare. Övrigt underlag har behandlats som vanligt.
      </p>
      <ul className="mt-2 space-y-2">
        {withheld.map((w) => (
          <li
            key={w.passageId}
            className="rounded-md border border-amber-600/30 bg-background/60 p-2"
          >
            <p className="text-xs font-medium">{w.reason}</p>
            <p className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">
              {w.excerpt}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">
        Läs originalkällan själv och bedöm den. Det här säger inget om kandidatens lämplighet — ett
        dokument kan ha ändrats av någon annan än den det handlar om.
      </p>
    </Panel>
  );
}

/** A form-level error summary whose entries link to the field that produced them. */
export function ErrorSummary({
  errors,
}: {
  errors: readonly { readonly fieldId: string; readonly message: string }[];
}) {
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      tabIndex={-1}
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <p className="font-semibold">Formuläret kunde inte skickas</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a href={`#${e.fieldId}`} className="underline underline-offset-2">
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Where this interview is in CQrity TRUST, in the recruiter's own language.
 *
 * TRUST is CQrityjob's governed synthesis of structured selection interviewing,
 * PEACE, ORBIT, the competency graph and the human decision boundary. It is a
 * research-grounded design hypothesis under controlled validation, not a
 * validated selection method, and this banner says so once rather than claiming
 * authority it does not have.
 *
 * It shows the stage, what it is for, what the human owes it, and what may not
 * be concluded there. It deliberately does NOT show the research rationale: a
 * recruiter mid-interview needs process support, not the argument about whether
 * ORBIT transfers from counter-terrorism interrogation to recruitment. That
 * argument lives in the admin surface, where the people who can act on it are.
 */
export function TrustStageBanner({
  stage,
}: {
  stage: {
    readonly letter: string | null;
    readonly ordinal: number | null;
    readonly nameSv: string | null;
    readonly purposeSv: string | null;
    readonly humanResponsibilitySv: string | null;
    readonly prohibitions: readonly string[];
    readonly permitsAi: boolean;
    readonly methodVersion: number | null;
  } | null;
}) {
  if (!stage?.letter) return null;

  return (
    <section aria-labelledby="trust-stage" className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          aria-hidden="true"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-sky-700/40 bg-sky-700/10 font-mono text-sm font-semibold text-sky-900 dark:text-sky-200"
        >
          {stage.letter}
        </span>
        <h2 id="trust-stage" className="text-sm font-semibold text-foreground">
          <span className="sr-only">CQrity TRUST, steg {stage.ordinal} av 5: </span>
          {stage.nameSv}
        </h2>
        <span className="text-xs text-muted-foreground">
          CQrity TRUST{stage.methodVersion ? ` v${stage.methodVersion}` : ""} · steg {stage.ordinal}{" "}
          av 5
        </span>
      </div>

      {stage.purposeSv && (
        <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">{stage.purposeSv}</p>
      )}

      {stage.humanResponsibilitySv && (
        <p className="mt-2 max-w-[68ch] text-sm text-foreground">
          <span className="font-medium">Ditt ansvar i det här steget: </span>
          {stage.humanResponsibilitySv}
        </p>
      )}

      {!stage.permitsAi ? (
        <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
          AI-stödet gör ingenting i det här steget. Kontakten med kandidaten är ditt arbete.
        </p>
      ) : (
        <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
          AI-stödet får förbereda och föreslå här. Varje förslag måste en människa godkänna innan
          det används.
        </p>
      )}

      {stage.prohibitions.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Vad som inte får slutas i det här steget
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {stage.prohibitions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        CQrity TRUST är CQrityjobs egen styrda metod. Den är forskningsinformerad och ännu inte
        vetenskapligt validerad som helhet.
      </p>
    </section>
  );
}

/** The journey, drawn as steps. Never as a percentage: this is not progress towards a verdict. */
export function CaseSteps({ current }: { current: string }) {
  const steps: Array<{ key: string; label: string }> = [
    { key: "draft", label: "Underlag" },
    { key: "prep_approved", label: "Förberedelse" },
    { key: "interview_in_progress", label: "Intervju" },
    { key: "evidence_review", label: "Evidens" },
    { key: "assessed", label: "Bedömning" },
    { key: "reported", label: "Rapport" },
  ];
  const order = [
    "draft",
    "sources_ready",
    "prep_generated",
    "prep_approved",
    "interview_in_progress",
    "interview_complete",
    "evidence_review",
    "assessed",
    "reported",
  ];
  const currentIdx = order.indexOf(current);

  return (
    <nav aria-label="Processteg" className="border-y border-border py-3">
      <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
        {steps.map((s, i) => {
          const reached = currentIdx >= order.indexOf(s.key);
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={cn(
                  "tabular-nums",
                  reached ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {i + 1}. {s.label}
                {reached && <span className="sr-only"> (uppnått)</span>}
              </span>
              {i < steps.length - 1 && (
                <span aria-hidden="true" className="text-muted-foreground">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export const BUTTON =
  "inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export const PRIMARY_BUTTON =
  "inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export const FIELD =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
