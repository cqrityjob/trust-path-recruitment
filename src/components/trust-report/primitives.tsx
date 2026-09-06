// TRUST Evidence Report — the small shared pieces.
//
// One chip system, shared in spirit with the Passport surfaces: small,
// rounded-md, a thin border, a word. A status is always a WORD with a
// restrained tone behind it, never a colour alone, and the tones are ordered
// so a grayscale print still separates them. No icon in this file ranks
// anything: there is no trophy, medal or star.

import { useId, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
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
  type Tone,
} from "@/lib/security-competency/trust-report.presentation";

const TONE: Record<Tone, string> = {
  established: "border-primary/20 bg-secondary text-primary",
  attention: "border-accent/30 bg-accent/5 text-accent",
  neutral: "border-border bg-card text-foreground",
  limited: "border-dashed border-border bg-transparent text-muted-foreground",
};

const DOT: Record<Tone, string> = {
  established: "bg-primary",
  attention: "bg-accent",
  neutral: "bg-muted-foreground/60",
  limited: "bg-transparent ring-1 ring-inset ring-muted-foreground/60",
};

export function Chip({
  tone,
  dot = false,
  children,
}: {
  tone: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-[11.5px] font-semibold leading-none ${TONE[tone]}`}
    >
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />}
      {children}
    </span>
  );
}

/** The observed response pattern: the one semantic status chip on a card. */
export function PatternChip({ value }: { value: ObservedPattern }) {
  const { t } = useT();
  return (
    <Chip tone={patternTone(value)} dot>
      {t(PATTERN_KEY[value])}
    </Chip>
  );
}

/** Evidence sufficiency: secondary by design, a word and a count in text so
 *  the amount of evidence is never read as the quality of the candidate. */
export function SufficiencyText({ value, items }: { value: EvidenceSufficiency; items: number }) {
  const { t, tp } = useT();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-[13px] leading-none">
      <span
        className={
          value === "sufficient"
            ? "font-semibold text-foreground"
            : "font-semibold text-muted-foreground"
        }
      >
        {t(SUFFICIENCY_KEY[value])}
      </span>
      <span aria-hidden="true" className="text-muted-foreground/60">
        ·
      </span>
      <span className="text-muted-foreground">
        {items} {tp("report.trust.items", items)}
      </span>
    </span>
  );
}

/** Kept for the overview column, where sufficiency stands alone. */
export function SufficiencyChip({ value }: { value: EvidenceSufficiency }) {
  const { t } = useT();
  return (
    <Chip tone={value === "sufficient" ? "neutral" : "limited"}>{t(SUFFICIENCY_KEY[value])}</Chip>
  );
}

/** The next step: an action label, not a status. */
export function PriorityLabel({ value }: { value: FollowUpPriority }) {
  const { t } = useT();
  const strong = value === "first" || value === "next";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[13px] font-semibold leading-none ${strong ? "text-accent" : "text-muted-foreground"}`}
    >
      {strong && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
      {t(PRIORITY_KEY[value])}
    </span>
  );
}

export function PriorityChip({ value }: { value: FollowUpPriority }) {
  return <PriorityLabel value={value} />;
}

/** The three dimensions, side by side and labelled, with a deliberate
 *  hierarchy: the pattern is a chip, the evidence is text, the next step is
 *  an action label. Example: Inte fastställt / Begränsat · 1 observerad
 *  uppgift / Följ upp i intervju. */
export function AxisTriplet({
  pattern,
  sufficiency,
  items,
  priority,
}: {
  pattern: ObservedPattern;
  sufficiency: EvidenceSufficiency;
  items: number;
  priority: FollowUpPriority;
}) {
  const { t } = useT();
  return (
    <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-[auto_auto_auto]">
      <div className="flex flex-col gap-1.5">
        <dt className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("report.trust.axis.pattern")}
        </dt>
        <dd className="m-0">
          <PatternChip value={pattern} />
        </dd>
      </div>
      <div className="flex flex-col gap-1.5">
        <dt className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("report.trust.axis.evidence")}
        </dt>
        <dd className="m-0 flex h-6 items-center">
          <SufficiencyText value={sufficiency} items={items} />
        </dd>
      </div>
      <div className="flex flex-col gap-1.5">
        <dt className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("report.trust.axis.next")}
        </dt>
        <dd className="m-0 flex h-6 items-center">
          <PriorityLabel value={priority} />
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
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
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
        className={`no-print inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-accent transition-colors hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${triggerClassName}`}
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
      <dt className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground">
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
      className={`inline-flex h-6 items-center rounded-md border px-2 text-[10.5px] font-semibold uppercase tracking-widest ${
        muted
          ? "border-border bg-secondary/40 text-muted-foreground"
          : "border-primary/20 bg-secondary text-primary"
      }`}
    >
      {children}
    </span>
  );
}

/** A small icon tile, the soft-navy iconography the Passport family uses. */
export function IconTile({
  children,
  tone = "navy",
}: {
  children: ReactNode;
  tone?: "navy" | "trust" | "gold";
}) {
  const cls =
    tone === "trust"
      ? "bg-trust/10 text-trust"
      : tone === "gold"
        ? "bg-[color:var(--gold)]/10 text-[color:var(--gold)]"
        : "bg-secondary text-primary";
  return (
    <span
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${cls}`}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

export function KeyLabel({ k }: { k: TranslationKey }) {
  const { t } = useT();
  return <>{t(k)}</>;
}
