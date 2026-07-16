import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

export function CareerHero({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  actions?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(600px 300px at 15% 0%, oklch(0.55 0.09 245 / 0.18), transparent 60%), radial-gradient(500px 250px at 90% 10%, oklch(0.24 0.07 265 / 0.10), transparent 60%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-16 md:px-8 md:pb-24 md:pt-24">
        <div className="max-w-3xl">
          {eyebrow && (
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
              {eyebrow}
            </div>
          )}
          <h1
            className="mt-6 text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h1>
          {lead && (
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              {lead}
            </p>
          )}
          {actions && <div className="mt-10 flex flex-wrap items-center gap-4">{actions}</div>}
        </div>
      </div>
    </section>
  );
}
