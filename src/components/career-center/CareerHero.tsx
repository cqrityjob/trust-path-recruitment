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
    <section className="relative overflow-hidden border-b border-border bg-secondary/60">
      {/* Restrained editorial background — subtle radial + faint grid, no photos */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(900px 420px at 15% -10%, oklch(0.492 0.115 245 / 0.10), transparent 62%), radial-gradient(700px 380px at 100% 0%, oklch(0.235 0.055 258 / 0.09), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0.235 0.055 258 / 0.05) 1px, transparent 1px)",
          backgroundSize: "56px 100%",
          maskImage: "linear-gradient(to bottom, black, transparent 90%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-16 md:grid md:grid-cols-12 md:gap-12 md:px-8 md:pb-28 md:pt-24">
        <div className="md:col-span-8">
          {eyebrow && (
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground shadow-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" strokeWidth={2.2} />
              {eyebrow}
            </div>
          )}
          <h1
            className="mt-7 text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-[3.5rem]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h1>
          {lead && (
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              {lead}
            </p>
          )}
          {actions && <div className="mt-10 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
        {/* Trust rail — balances the composition without stock images */}
        <aside
          aria-hidden
          className="mt-14 hidden md:col-span-4 md:mt-2 md:block"
        >
          <div className="relative rounded-xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur">
            <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-[color:var(--gold)]/50 to-transparent" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              CQrityjob
            </p>
            <p className="mt-3 text-sm leading-relaxed text-foreground/90">
              Sveriges karriärplattform för säkerhetsbranschen — verifierade yrken, tydliga vägar, mätbar kompetens.
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border/70 pt-5">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Yrken</dt>
                <dd className="mt-1 text-lg font-semibold tracking-tight text-foreground">60+</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Familjer</dt>
                <dd className="mt-1 text-lg font-semibold tracking-tight text-foreground">14</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Språk</dt>
                <dd className="mt-1 text-lg font-semibold tracking-tight text-foreground">SV · EN</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Modell</dt>
                <dd className="mt-1 text-lg font-semibold tracking-tight text-foreground">v1.0</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </section>
  );
}
