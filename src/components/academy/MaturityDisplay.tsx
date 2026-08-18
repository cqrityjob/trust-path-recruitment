// Shared Assessment Center presentation.
//
// ── THE ONE RULE THESE COMPONENTS EXIST TO ENFORCE ────────────────────
//
// Competence is stated as a MATURITY LEVEL describing the evidence, never as a
// number describing the person. There is deliberately no prop here that takes a
// percentage, a score or a total, because a component that accepted one would
// eventually be given one.
//
// The five-step scale is drawn as five segments so the level is visible at a
// glance, but the segments are labelled in words and the level is always
// written out. Nothing here is communicated by colour alone.

import type { ReactNode } from "react";
import { Info, ShieldAlert } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

export type MaturityLevel =
  | "no_evidence"
  | "limited_evidence"
  | "developing_evidence"
  | "consistent_evidence"
  | "strong_evidence";

const ORDER: MaturityLevel[] = [
  "no_evidence",
  "limited_evidence",
  "developing_evidence",
  "consistent_evidence",
  "strong_evidence",
];

const LABEL: Record<MaturityLevel, TranslationKey> = {
  no_evidence: "academy.maturity.none",
  limited_evidence: "academy.maturity.limited",
  developing_evidence: "academy.maturity.developing",
  consistent_evidence: "academy.maturity.consistent",
  strong_evidence: "academy.maturity.strong",
};

export function maturityLabelKey(level: MaturityLevel): TranslationKey {
  return LABEL[level] ?? "academy.maturity.none";
}

/**
 * One competency line.
 *
 * `observations` is shown as a count of observations, not converted into any
 * proportion — "3 observations" is a fact; "60%" would be a claim.
 */
export function MaturityRow({
  name,
  level,
  observations,
  children,
}: {
  name: string;
  level: MaturityLevel;
  observations: number;
  children?: ReactNode;
}) {
  const { t } = useT();
  const filled = Math.max(0, ORDER.indexOf(level));
  const levelText = t(maturityLabelKey(level));

  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold text-foreground">{name}</h3>
        <p className="text-sm font-medium text-foreground">{levelText}</p>
      </div>

      <div className="mt-3 flex gap-1" role="img" aria-label={`${name}: ${levelText}`}>
        {ORDER.map((step, i) => (
          <span
            key={step}
            aria-hidden="true"
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i <= filled && level !== "no_evidence"
                ? "bg-accent"
                : "bg-[color:var(--surface-subtle)] ring-1 ring-inset ring-border",
            )}
          />
        ))}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {observations === 1
          ? t("academy.observation.one")
          : `${observations} ${t("academy.observation.many")}`}
      </p>
      {children}
    </div>
  );
}

// ── THE PRODUCT VOCABULARY ────────────────────────────────────────────
//
// Maturity describes the EVIDENCE. These words describe what the evidence lets
// anyone say about a way of working, which is what a manager and a participant
// actually need. The projection between them lives in the database (des-v1) and
// is frozen into the snapshot; this file only renders the result.

export type EvidenceState =
  | "strongly_shown"
  | "shown"
  | "follow_up"
  | "not_yet_shown"
  | "critical_follow_up";

const STATE_LABEL: Record<EvidenceState, TranslationKey> = {
  strongly_shown: "academy.state.stronglyShown",
  shown: "academy.state.shown",
  follow_up: "academy.state.followUp",
  not_yet_shown: "academy.state.notYetShown",
  critical_follow_up: "academy.state.criticalFollowUp",
};

export function evidenceStateLabelKey(state: EvidenceState): TranslationKey {
  return STATE_LABEL[state] ?? "academy.state.notYetShown";
}

/**
 * One competency, stated in the product vocabulary.
 *
 * ── WHY THIS IS NOT EIGHT WARNINGS ────────────────────────────────────
 *
 * A single assessment is one evidence context, and the sufficiency gate needs
 * two, so from one run EVERY competency lands on "needs a follow-up". Rendered
 * as eight red cards that reads as eight failures, which is both false and
 * demoralising — the person did nothing wrong; the evidence base is simply one
 * source deep.
 *
 * So follow-up is drawn as an ordinary row with a quiet chip, and the coverage
 * explanation above the list carries the reason once instead of eight times.
 * Only `critical_follow_up` — which comes from a human reviewer, never from a
 * low score — is given emphasis, because that one genuinely asks somebody to
 * do something.
 */
export function EvidenceStateRow({
  name,
  state,
  observations,
  prompt,
  humanReviewed,
}: {
  name: string;
  state: EvidenceState;
  observations: number;
  /** The curated follow-up (employer) or reflection (participant) line. */
  prompt?: string | null;
  humanReviewed?: boolean;
}) {
  const { t } = useT();
  const critical = state === "critical_follow_up";
  return (
    <div
      className={cn(
        "border-t border-border py-4 first:border-t-0",
        critical && "border-l-2 border-l-accent pl-4",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium text-foreground">{name}</h3>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-[6px] border px-2 py-0.5 text-[12px] font-medium",
            critical ? "border-accent text-foreground" : "border-border text-muted-foreground",
          )}
        >
          {t(evidenceStateLabelKey(state))}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {/* The singular key already carries the numeral ("1 observation"), so
            prefixing the count here printed "1 1 observation". */}
        {observations === 1
          ? t("academy.observation.one")
          : `${observations} ${t("academy.observation.many")}`}
        {humanReviewed ? ` · ${t("academy.state.humanReviewed")}` : ""}
      </p>
      {prompt && (
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-foreground">{prompt}</p>
      )}
    </div>
  );
}

/**
 * What this report can and cannot support, said once, before the list.
 *
 * The single most important paragraph in the document: without it a reader sees
 * "needs a follow-up" eight times and concludes something about the person
 * rather than about the evidence.
 */
export function EvidenceCoverage({
  observations,
  contexts,
  bodyKey,
}: {
  observations: number;
  contexts: number;
  bodyKey: TranslationKey;
}) {
  const { t } = useT();
  return (
    <section className="mt-6 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Info className="h-4 w-4 text-accent" aria-hidden="true" />
        {t("academy.coverage.title")}
      </h2>
      <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-muted-foreground">
        {t(contexts === 1 ? "academy.coverage.basisOne" : "academy.coverage.basisMany")
          .replace("{observations}", String(observations))
          .replace("{contexts}", String(contexts))}
      </p>
      <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-muted-foreground">
        {t(bodyKey)}
      </p>
    </section>
  );
}

/**
 * Safety-critical findings.
 *
 * Rendered as its own block, from its own data, so it cannot be pushed below a
 * fold or omitted by a template that only knows about competency lines. A high
 * maturity level never suppresses this.
 */
export function SafetyFlagNotice({ count }: { count: number }) {
  const { t } = useT();
  if (count === 0) return null;
  return (
    <div
      role="note"
      className="mt-5 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-4"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShieldAlert className="h-4 w-4 text-accent" aria-hidden="true" />
        {t("academy.safety.title")}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {count === 1 ? t("academy.safety.bodyOne") : `${count} ${t("academy.safety.bodyMany")}`}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {t("academy.safety.followUp")}
      </p>
    </div>
  );
}

/**
 * The no-evidence state.
 *
 * Written to be dignified rather than apologetic: "no evidence yet" is a
 * statement about what has been collected, not a deficiency of the person, and
 * the copy says so plainly instead of dressing it up.
 */
export function NoEvidenceState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  /** Optional next step. An empty state that names the next action but does
   *  not offer it makes the reader go and find it themselves. */
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-dashed border-border p-6 text-center">
      <Info className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Stated limitations. A published report template must carry them, and this
 *  is where they surface — never collapsed behind a "read more". */
export function ReportLimitations({ items }: { items: string[] }) {
  const { t } = useT();
  if (items.length === 0) return null;
  return (
    <section className="mt-6 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
        {t("academy.limitations.title")}
      </h3>
      <ul className="mt-3 space-y-2">
        {items.map((l) => (
          <li key={l} className="text-[13px] leading-relaxed text-muted-foreground">
            {l}
          </li>
        ))}
      </ul>
    </section>
  );
}
