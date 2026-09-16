import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CredentialRecord({
  symbol,
  eyebrow,
  title,
  metadata,
  states,
  action,
  className,
}: {
  symbol: ReactNode;
  eyebrow: ReactNode;
  title: ReactNode;
  metadata: ReactNode;
  states: ReactNode;
  action: ReactNode;
  className?: string;
}) {
  return (
    <article
      data-premium-credential-record
      className={cn(
        "group relative isolate overflow-hidden rounded-lg border border-border/70 bg-card shadow-[var(--shadow-sm)] transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] motion-reduce:transform-none",
        className,
      )}
    >
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-accent" />
      <div aria-hidden="true" className="passport-grid pointer-events-none absolute inset-y-0 left-0 w-28 opacity-25" />
      <div className="grid min-w-0 gap-5 p-4 pl-5 sm:grid-cols-[5.25rem_minmax(0,1fr)_auto] sm:items-center sm:p-6 sm:pl-7">
        <div className="passport-signature relative flex h-[5.25rem] w-[5.25rem] shrink-0 items-center justify-center rounded-lg bg-primary shadow-[var(--shadow-md)] ring-1 ring-accent/25">
          <div
            aria-hidden="true"
            className="absolute inset-1 rounded-md border border-primary-foreground/20"
          />
          <div aria-hidden="true" className="absolute bottom-2 left-2 h-1.5 w-1.5 rounded-full bg-accent" />
          {symbol}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </div>
          <h3 className="mt-1 max-w-[32rem] break-words text-xl font-semibold leading-snug text-foreground">
            {title}
          </h3>
          <div className="mt-4 grid min-w-0 gap-x-8 gap-y-3 text-sm text-muted-foreground sm:grid-cols-2">
            {metadata}
          </div>
        </div>
        <div className="min-w-0 sm:max-w-44 sm:text-right">{states}</div>
      </div>
      <div className="border-t border-border/70 bg-secondary/40 px-5 sm:pl-[7.75rem]">
    </article>
  );
}

export function CredentialRecordFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <dl className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{value}</dd>
    </dl>
  );
}
