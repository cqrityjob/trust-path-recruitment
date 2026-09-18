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
      {/* ── COMPACT ON A PHONE ─────────────────────────────────────────
          The mark sits BESIDE the name at every width. Stacked above it, one
          record ran to 320px at 390 -- mark, then name, then three facts one
          per line -- and a wallet of five was a screen and a half of
          scrolling per credential. Two columns of facts, states on their own
          row beneath. */}
      <div className="grid min-w-0 grid-cols-[3.75rem_minmax(0,1fr)] gap-x-4 gap-y-4 p-4 pl-5 sm:grid-cols-[5.25rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-5 sm:gap-y-4 sm:p-6 sm:pl-7">
        <div className="passport-signature relative flex h-[3.75rem] w-[3.75rem] shrink-0 items-center justify-center rounded-lg bg-primary shadow-[var(--shadow-md)] ring-1 ring-accent/25 sm:row-span-2 sm:h-[5.25rem] sm:w-[5.25rem]">
          <div
            aria-hidden="true"
            className="absolute inset-1 rounded-md border border-primary-foreground/20"
          />
          <div
            aria-hidden="true"
            className="absolute bottom-2 left-2 h-1.5 w-1.5 rounded-full bg-accent"
          />
          {symbol}
        </div>
        <div className="min-w-0 self-center sm:self-end">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </div>
          <h3 className="mt-1 max-w-[32rem] break-words text-lg font-semibold leading-snug text-foreground sm:text-xl">
            {title}
          </h3>
        </div>
        {/* Full width under the mark on a phone; under the name from `sm`. */}
        <div className="col-span-2 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 text-sm text-muted-foreground sm:col-span-1 sm:col-start-2 sm:self-start sm:gap-x-8">
          {metadata}
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:max-w-44 sm:text-right">
          {states}
        </div>
      </div>
      <div className="border-t border-border/70 bg-secondary/40 px-5 sm:pl-[7.75rem]">{action}</div>
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
