// The assessment landing screen.
//
// Presentation only: every claim on this screen already exists in the approved
// copy (cd.public.introBody / introNoAccount). Nothing about duration, accuracy
// or outcomes is invented here, because a career product that oversells its
// first screen has already spent the trust it needs at the last one.

import { ClipboardList, Layers, ScaleIcon, UserCheck } from "lucide-react";
import { useT } from "@/i18n/context";

export function AssessmentIntro({ onStart }: { onStart: () => void }) {
  const { t } = useT();

  const facts = [
    { icon: ClipboardList, title: t("cd.public.factQuestions"), body: t("cd.public.factStages") },
    {
      icon: ScaleIcon,
      title: t("cd.public.factNoJudgement"),
      body: t("cd.public.factNoJudgementBody"),
    },
    {
      icon: UserCheck,
      title: t("cd.public.factNoAccountShort"),
      body: t("cd.public.factNoAccountBody"),
    },
  ] as const;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-8">
      <section className="rounded-[16px] border border-border bg-card p-6 shadow-[var(--shadow-sm)] sm:p-9">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          {t("cd.public.introEyebrow")}
        </p>
        <h1
          className="mt-3 text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-foreground sm:text-[2.125rem]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("cd.public.introTitle")}
        </h1>
        <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
          {t("cd.public.introBody")}
        </p>
        <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
          {t("cd.public.introNoAccount")}
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-accent px-7 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto motion-reduce:transition-none"
        >
          {t("cd.public.start")}
        </button>
      </section>

      <aside className="rounded-[16px] border border-border bg-[color:var(--surface-subtle)] p-6 sm:p-7">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
          <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
          {t("cd.public.introFactsTitle")}
        </h2>
        <ul className="mt-5 space-y-5">
          {facts.map((f) => (
            <li key={f.title} className="flex gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border border-border bg-card">
                <f.icon className="h-4 w-4 text-accent" strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{f.title}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">
                  {f.body}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}