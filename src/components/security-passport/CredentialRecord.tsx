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
        "group relative isolate overflow-hidden rounded-lg border border-border/80 bg-card shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-md)]",
        className,
      )}
    >
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-accent" />
      <div className="grid min-w-0 gap-4 p-4 pl-5 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-center sm:p-5 sm:pl-6">
        <div className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-lg bg-primary shadow-[var(--shadow-sm)]">
          <div aria-hidden="true" className="absolute inset-1 rounded-md border border-primary-foreground/15" />
          {symbol}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </div>
          <h3 className="mt-1 break-words text-lg font-semibold leading-snug text-foreground">
            {title}
          </h3>
          <div className="mt-3 grid min-w-0 gap-x-6 gap-y-2 text-sm text-muted-foreground sm:grid-cols-2">
            {metadata}
          </div>
        </div>
        <div className="min-w-0 sm:max-w-44 sm:text-right">{states}</div>
      </div>
      <div className="border-t border-border/70 bg-secondary/30 px-5 sm:pl-[6.5rem]">{action}</div>
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