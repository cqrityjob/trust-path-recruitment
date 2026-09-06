// TRUST Evidence Report — the small shared pieces.
//
// A status is always a WORD with a restrained tone behind it, never a colour
// alone; the tones are ordered so a grayscale print still separates them.
// No icon in this file ranks anything: there is no trophy, medal or star.

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import type {
  EvidenceSufficiency,
  FollowUpPriority,
  ObservedPattern,
} from "@/lib/security-competency/trust-report.types";
import {
  PATTERN_KEY,
  PRIORITY_KEY,
  SUFFICIENCY_KEY,
  patternTone,
  priorityTone,
  sufficiencyTone,
  type Tone,
} from "@/lib/security-competency/trust-report.presentation";

const TONE: Record<Tone, string> = {
  established: "border-primary/25 bg-primary text-primary-foreground",
  attention: "border-accent/40 bg-[color:var(--secondary)] text-accent",
  neutral: "border-border bg-card text-foreground",
  limited: "border-dashed border-border bg-transparent text-muted-foreground",
};

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex min-h-[26px] items-center whitespace-nowrap rounded-full border px-2.5 text-[12px] font-semibold leading-none ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function PatternChip({ value }: { value: ObservedPattern }) {
  const { t } = useT();
  return <Chip tone={patternTone(value)}>{t(PATTERN_KEY[value])}</Chip>;
}

export function SufficiencyChip({ value }: { value: EvidenceSufficiency }) {
  const { t } = useT();
  return <Chip tone={sufficiencyTone(value)}>{t(SUFFICIENCY_KEY[value])}</Chip>;
}

export function PriorityChip({ value }: { value: FollowUpPriority }) {
  const { t } = useT();
  return <Chip tone={priorityTone(value)}>{t(PRIORITY_KEY[value])}</Chip>;
}

/** The three dimensions, side by side and labelled, so a reader never has to
 *  infer one from another. Example: Inte fastställt / Begränsat, 1 observerad
 *  uppgift / Följ upp i intervju. */
export function AxisTriplet({
  pattern,
  sufficiency,
  items,
  priority,
  compact = false,
}: {
  pattern: ObservedPattern;
  sufficiency: EvidenceSufficiency;
  items: number;
  priority: FollowUpPriority;
  compact?: boolean;
}) {
  const { t, tp } = useT();
  const cell = compact ? "flex flex-col gap-1" : "flex flex-col gap-1.5";
  return (
    <dl className={`grid gap-x-4 gap-y-3 ${compact ? "grid-cols-1" : "sm:grid-cols-3"}`}>
      <div className={cell}>
        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("report.trust.axis.pattern")}
        </dt>
        <dd className="m-0">
          <PatternChip value={pattern} />
        </dd>
      </div>
      <div className={cell}>
        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("report.trust.axis.evidence")}
        </dt>
        <dd className="m-0 flex flex-wrap items-center gap-2">
          <SufficiencyChip value={sufficiency} />
          <span className="text-[12px] text-muted-foreground">
            {items} {tp("report.trust.items", items)}
          </span>
        </dd>
      </div>
      <div className={cell}>
        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("report.trust.axis.next")}
        </dt>
        <dd className="m-0">
          <PriorityChip value={priority} />
        </dd>
      </div>
    </dl>
  );
}

/** A page section: a heading the eye can land on, an optional lede, one
 *  content surface. `printOrder` lets the printed document reorder sections
 *  without the screen order changing (see styles.css). */
export function Section({
  id,
  title,
  lede,
  printOrder,
  subordinate = false,
  aside,
  children,
  className = "",
}: {
  id: string;
  title: string;
  lede?: string;
  printOrder: number;
  subordinate?: boolean;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-print-order={printOrder}
      className={`mt-10 first:mt-0 ${className}`}
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2
            id={`${id}-title`}
            className={`${subordinate ? "text-[18px]" : "text-[22px]"} font-semibold leading-tight tracking-tight text-foreground`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h2>
          {lede && (
            <p className="mt-1 max-w-[70ch] text-[14px] leading-relaxed text-muted-foreground">
              {lede}
            </p>
          )}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** A screen-only fold. The content is always in the DOM; the rule that hides
 *  it lives in @media screen, so print shows every fold open. */
export function Fold({
  openLabel,
  closeLabel,
  defaultOpen = false,
  children,
  triggerClassName = "",
}: {
  openLabel: string;
  closeLabel: string;
  defaultOpen?: boolean;
  children: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={`no-print inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-semibold text-accent hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${triggerClassName}`}
      >
        {open ? closeLabel : openLabel}
        <ChevronDown
          className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <div id={id} className="screen-fold" data-open={open ? "true" : "false"}>
        {children}
      </div>
    </>
  );
}

/** A labelled fact, 12–13px metadata. Renders nothing for an empty value,
 *  so a legacy report never shows a dash, "null" or "undefined". */
export function Meta({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="m-0 mt-0.5 break-words text-[13px] leading-snug text-foreground">{value}</dd>
    </div>
  );
}

/** A small inline label such as "Självbeskrivning — inte observerad evidens". */
export function Tag({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={`inline-flex min-h-[24px] items-center rounded-[6px] border px-2 text-[11px] font-semibold uppercase tracking-[0.06em] ${
        muted
          ? "border-border bg-[color:var(--surface-subtle)] text-muted-foreground"
          : "border-primary/20 bg-[color:var(--secondary)] text-primary"
      }`}
    >
      {children}
    </span>
  );
}

export function KeyLabel({ k }: { k: TranslationKey }) {
  const { t } = useT();
  return <>{t(k)}</>;
}
