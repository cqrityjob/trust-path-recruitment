import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

// The shared hero shell for the Career Center.
//
// ── WHAT WAS REMOVED AND WHY ───────────────────────────────────────────
//
// This component used to render a fixed "trust rail" of four statistics on
// EVERY page that used it, the hub and all twenty profession guides alike.
// Two of the four were untrue — "60+" professions against a catalogue of
// twenty, of which ten were placeholders, and a "Modell v1.0" label that is
// an internal version string with no meaning to a reader. The other two were
// real but told a visitor nothing they needed.
//
// Worse, the rail followed the reader onto individual profession guides,
// where a panel of Career-Center-wide statistics sits beside the title of one
// specific job and answers a question nobody asked.
//
// So the shell no longer owns any content of its own. `aside` is a slot: the
// hub passes a panel built from figures derived at render time, and a
// profession guide passes nothing at all.

export function CareerHero({
  eyebrow,
  title,
  lead,
  actions,
  note,
  aside,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  actions?: ReactNode;
  /** Small print under the actions — the free/not-an-assessment line. */
  note?: ReactNode;
  aside?: ReactNode;
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
      <div
        className={[
          "relative mx-auto w-full max-w-6xl px-6 pb-16 pt-14 md:px-8 md:pb-24 md:pt-20",
          aside ? "md:grid md:grid-cols-12 md:gap-12" : "",
        ].join(" ")}
      >
        <div className={aside ? "md:col-span-7" : "max-w-3xl"}>
          {eyebrow && (
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground shadow-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" strokeWidth={2.2} />
              {eyebrow}
            </div>
          )}
          {/* "Säkerhetskarriärcenter" is one 22-character word. At the old
              mobile size it ran past the 375px viewport's content box and was
              clipped mid-word, so the base size steps down and hyphenation is
              allowed — the document carries a `lang` attribute, so the browser
              breaks it where Swedish permits. */}
          <h1
            className="mt-6 text-[1.75rem] font-semibold leading-[1.1] tracking-tight text-foreground [hyphens:auto] sm:text-4xl md:text-[3.25rem]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h1>
          {lead && (
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl">
              {lead}
            </p>
          )}
          {actions && (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {actions}
            </div>
          )}
          {note && <p className="mt-5 max-w-xl text-sm text-muted-foreground">{note}</p>}
        </div>
        {aside && <div className="mt-10 md:col-span-5 md:mt-2">{aside}</div>}
      </div>
    </section>
  );
}
