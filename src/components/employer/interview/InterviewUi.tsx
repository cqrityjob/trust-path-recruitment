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
