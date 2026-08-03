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
export function NoEvidenceState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-border p-6 text-center">
      <Info className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
        {body}
      </p>
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
