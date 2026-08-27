// Interview Intelligence — the shared visual vocabulary of the Role Interview
// Builder.
//
// The UX blueprint gives every signal a governed meaning, and the rules below
// are the whole of it:
//
//   * Steel blue carries hierarchy and work state.
//   * Evidence teal means CONFIRMED — content a human has signed off.
//   * Amber means unresolved work waiting on a person.
//   * Red is reserved for a governance error or a serious process risk. It is
//     never a verdict about a person, and this domain has no person in it.
//
// Colour never carries the meaning alone. Every badge below renders its state
// as TEXT, and the colour only reinforces it — which is also what keeps the
// surface usable in greyscale and for a colour-blind reviewer.
//
// There is deliberately no red/green pair anywhere here, no score, no meter and
// no progress gamification.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import type {
  MappingState,
  PackStatus,
  ProbeProvenance,
  ValidationLabel,
} from "@/lib/interview-intelligence/role-packs.functions";

/* ------------------------------------------------------------------ */

type Tone = "neutral" | "work" | "confirmed" | "attention" | "governance";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-muted/50 text-muted-foreground",
  work: "border-sky-700/30 bg-sky-700/10 text-sky-900 dark:text-sky-200",
  confirmed: "border-teal-700/30 bg-teal-700/10 text-teal-900 dark:text-teal-200",
  attention: "border-amber-600/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  governance: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function StateBadge({
  tone,
  children,
  srPrefix,
}: {
  tone: Tone;
  children: ReactNode;
  /** Read out before the label, so a screen reader hears what the state is OF. */
  srPrefix?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASS[tone],
      )}
    >
      {srPrefix && <span className="sr-only">{srPrefix}: </span>}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */

const STATUS_TONE: Record<PackStatus, Tone> = {
  draft: "neutral",
  expert_review: "attention",
  legal_review: "attention",
  cognitive_review: "attention",
  published: "confirmed",
  suspended: "governance",
  retired: "neutral",
};

export function PackStatusBadge({ status }: { status: PackStatus }) {
  const { t } = useT();
  return (
    <StateBadge tone={STATUS_TONE[status]} srPrefix={t("ii.a11y.status")}>
      {t(`ii.status.${status}` as TranslationKey)}
    </StateBadge>
  );
}

/**
 * The scientific claim, kept visually separate from the workflow state. A pack
 * can be fully published as process content and still be a hypothesis, and a
 * reader must never have to infer one from the other.
 */
export function ValidationLabelBadge({ label }: { label: ValidationLabel }) {
  const { t } = useT();
  return (
    <StateBadge
      tone={label === "pilot_hypothesis" ? "attention" : "confirmed"}
      srPrefix={t("ii.a11y.evidenceStatus")}
    >
      {t(`ii.validation.${label}` as TranslationKey)}
    </StateBadge>
  );
}

export function MappingStateBadge({ state }: { state: MappingState }) {
  const { t } = useT();
  return (
    <StateBadge tone={state === "confirmed" ? "confirmed" : "attention"}>
      {t(`ii.mapping.state.${state}` as TranslationKey)}
    </StateBadge>
  );
}

export function ProbeProvenanceBadge({ provenance }: { provenance: ProbeProvenance }) {
  const { t } = useT();
  return (
    <StateBadge tone={provenance === "source_stated" ? "confirmed" : "attention"}>
      {t(`ii.probe.provenance.${provenance}` as TranslationKey)}
    </StateBadge>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A panel that states a governance fact. `tone="governance"` is the only red
 * surface in this feature and is used for a blocked or suspended version — a
 * process risk, never a judgement about a person.
 */
export function NoticePanel({
  tone,
  title,
  children,
  role,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
  /** "alert" for something that has just gone wrong; omit for standing state. */
  role?: "alert" | "status";
}) {
  return (
    <div role={role} className={cn("rounded-lg border p-4", TONE_CLASS[tone], "text-sm")}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1.5 space-y-1 leading-relaxed">{children}</div>}
    </div>
  );
}

/**
 * The empty, loading and error states, as one component so that no surface in
 * this feature can accidentally ship without one.
 */
export function AsyncState({
  state,
  message,
  children,
}: {
  state: "loading" | "error" | "empty" | "denied";
  message?: string;
  children?: ReactNode;
}) {
  const { t } = useT();

  if (state === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("ii.state.loading")}
      </p>
    );
  }

  if (state === "denied") {
    return (
      <NoticePanel tone="governance" role="alert" title={t("ii.state.deniedTitle")}>
        <p>{t("ii.state.deniedBody")}</p>
      </NoticePanel>
    );
  }

  if (state === "error") {
    return (
      <NoticePanel tone="governance" role="alert" title={t("ii.state.errorTitle")}>
        <p>{message ?? t("ii.state.errorBody")}</p>
      </NoticePanel>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
      {children ?? t("ii.state.empty")}
    </div>
  );
}

/**
 * A form-level error summary. Every message links to the field that produced
 * it, because an error a keyboard user cannot navigate to is not reported.
 */
export function ErrorSummary({
  errors,
}: {
  errors: readonly { readonly fieldId: string; readonly message: string }[];
}) {
  const { t } = useT();
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      tabIndex={-1}
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <p className="font-semibold">{t("ii.form.errorSummaryTitle")}</p>
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
